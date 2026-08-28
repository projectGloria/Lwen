import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { backend } from '../lib/backend'
import { listModels } from '../lib/ollama'

const OllamaContext = createContext(null)
const POLL_MS = 6000

/**
 * `/api/tags` and `/api/ps` do not always spell the same model the same way:
 * a model pulled as `llama3` is listed as `llama3:latest` by one and `llama3`
 * by the other depending on the version, and a namespaced model can arrive with
 * or without its `library/` prefix. Comparing the raw strings makes a resident
 * model look idle, which is what left the popover offering "Run Model" for
 * something already loaded.
 */
export function sameModel(a, b) {
  return modelKey(a) === modelKey(b)
}

function modelKey(name) {
  let key = (name || '').trim().toLowerCase()
  if (!key) return ''
  if (key.startsWith('library/')) key = key.slice(8)
  if (!key.includes(':')) key += ':latest'
  return key
}

// The poll runs every few seconds and usually finds nothing changed. Replacing
// state with an equal-but-new object each time would re-render the whole app on
// a timer, so identity is only broken when something actually moved.
const sameStatus = (a, b) =>
  a.reachable === b.reachable &&
  a.version === b.version &&
  a.error === b.error &&
  a.checking === b.checking

const sameLoaded = (a, b) =>
  a.length === b.length &&
  a.every((m, i) => m.name === b[i].name && m.expires_at === b[i].expires_at)

export function OllamaProvider({ children }) {
  const [status, setStatus] = useState({ checking: true, reachable: false, version: null, error: null })
  const [models, setModels] = useState([])
  const [modelsError, setModelsError] = useState(null)
  const [loaded, setLoaded] = useState([])
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  // Whether this run of Lwen started the server, which decides both the wording
  // of the stop confirmation and whether it is shut down on quit.
  const [ours, setOurs] = useState(false)
  const [pending, setPending] = useState({}) // model -> 'loading' | 'stopping'
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const refreshModels = useCallback(async () => {
    try {
      const list = await listModels()
      if (!mounted.current) return list
      setModels(list)
      setModelsError(null)
      return list
    } catch (e) {
      if (mounted.current) {
        setModels([])
        setModelsError(e.message || 'Could not list models.')
      }
      return []
    }
  }, [])

  /**
   * Just the resident-model list. Sending a message makes Ollama load a model
   * on demand, and waiting up to a full poll interval to notice is what makes
   * the run controls look stale — so the chat calls this directly.
   */
  const refreshLoaded = useCallback(async () => {
    try {
      const ps = await backend.loadedModels()
      if (mounted.current) setLoaded((prev) => (sameLoaded(prev, ps) ? prev : ps))
      return ps
    } catch {
      if (mounted.current) setLoaded((prev) => (prev.length ? [] : prev))
      return []
    }
  }, [])

  const refresh = useCallback(
    async ({ withModels = true } = {}) => {
      const s = await backend.status()
      if (!mounted.current) return s
      setStatus((prev) => { const next = { checking: false, ...s }; return sameStatus(prev, next) ? prev : next })
      if (s.reachable) {
        if (withModels) await refreshModels()
        await refreshLoaded()
      } else {
        setLoaded((prev) => (prev.length ? [] : prev))
        setModels((prev) => (prev.length ? [] : prev))
      }
      return s
    },
    [refreshModels, refreshLoaded],
  )

  useEffect(() => {
    refresh()
    backend
      .ollamaOwnership()
      .then((o) => mounted.current && setOurs(!!o?.ours))
      .catch(() => {})
    const id = setInterval(() => {
      // No point polling while the window is in the background.
      if (!document.hidden) refresh({ withModels: false })
    }, POLL_MS)
    return () => clearInterval(id)
  }, [refresh])

  // The tray entry exists only while the server does, so it always means the
  // same thing. Rust owns the icon; this just mirrors what the poll saw.
  useEffect(() => {
    if (status.checking) return
    backend.syncTray(!!status.reachable, status.version ?? null, loaded.length).catch(() => {})
  }, [status.reachable, status.version, status.checking, loaded.length])

  const startServer = useCallback(async () => {
    setStarting(true)
    try {
      const s = await backend.startServer()
      if (mounted.current) setStatus((prev) => { const next = { checking: false, ...s }; return sameStatus(prev, next) ? prev : next })
      const owner = await backend.ollamaOwnership().catch(() => null)
      if (mounted.current && owner) setOurs(!!owner.ours)
      await refresh()
      return s
    } finally {
      if (mounted.current) setStarting(false)
    }
  }, [refresh])

  const stopServer = useCallback(async () => {
    setStopping(true)
    try {
      const s = await backend.stopServer()
      if (mounted.current) {
        setStatus({ checking: false, ...s })
        setLoaded([])
        setModels([])
        setOurs(false)
      }
      return s
    } finally {
      if (mounted.current) setStopping(false)
    }
  }, [])

  const runModel = useCallback(
    async (model, keepAlive) => {
      if (!model) throw new Error('Choose a model first.')
      setPending((p) => ({ ...p, [model]: 'loading' }))
      try {
        await backend.runModel(model, keepAlive ?? '30m')
        await refreshLoaded()
      } finally {
        if (mounted.current) {
          setPending((p) => {
            const next = { ...p }
            delete next[model]
            return next
          })
        }
      }
    },
    [refreshLoaded],
  )

  const stopModel = useCallback(
    async (model) => {
      if (!model) return
      setPending((p) => ({ ...p, [model]: 'stopping' }))
      try {
        await backend.stopModel(model)
        await refreshLoaded()
      } finally {
        if (mounted.current) {
          setPending((p) => {
            const next = { ...p }
            delete next[model]
            return next
          })
        }
      }
    },
    [refreshLoaded],
  )

  const value = useMemo(() => {
    const isLoaded = (model) =>
      loaded.some((m) => sameModel(m.name, model) || sameModel(m.model, model))
    const modelState = (model) => {
      if (!model) return 'none'
      if (starting) return 'starting'
      if (!status.reachable) return 'offline'
      if (pending[model] === 'loading') return 'starting'
      if (pending[model] === 'stopping') return 'stopping'
      if (isLoaded(model)) return 'running'
      return 'idle'
    }
    return {
      status,
      models,
      modelsError,
      loaded,
      starting,
      stopping,
      ours,
      pending,
      refresh,
      refreshModels,
      refreshLoaded,
      startServer,
      stopServer,
      runModel,
      stopModel,
      isLoaded,
      modelState,
      loadedInfo: (model) =>
        loaded.find((m) => sameModel(m.name, model) || sameModel(m.model, model)) || null,
    }
  }, [
    status, models, modelsError, loaded, starting, stopping, ours, pending,
    refresh, refreshModels, refreshLoaded, startServer, stopServer, runModel, stopModel,
  ])

  return <OllamaContext.Provider value={value}>{children}</OllamaContext.Provider>
}

export function useOllama() {
  const ctx = useContext(OllamaContext)
  if (!ctx) throw new Error('useOllama must be used inside OllamaProvider')
  return ctx
}

export const MODEL_STATE_LABEL = {
  none: 'No model selected',
  offline: 'Ollama not running',
  idle: 'Model: Not Running',
  starting: 'Starting…',
  stopping: 'Stopping…',
  running: 'Model: Running',
}
