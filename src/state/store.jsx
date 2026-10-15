import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { createWriter, flushPendingSaves, loadAccountData, persistMessages } from '../lib/persistence'
import { useToast } from '../hooks/useToast'
import { backend } from '../lib/backend'
import { titleFromText } from '../lib/format'

const STATE_VERSION = 2
const TRASH_VERSION = 1

/** Deleted things are kept this long before they stop being offered back. */
export const TRASH_KEEP_DAYS = 30

export const DEFAULT_SYSTEM_PROMPT =
  'You are a thoughtful collaborator. Be concise, ground claims in the project context, and ask a clarifying question when the request is ambiguous.'

export const defaultSettings = () => ({
  model: '',
  temperature: 0.7,
  topP: 0.9,
  contextWindow: 8192,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  autoUnloadMinutes: 0,
})

let seq = 0
export const uid = () =>
  `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

/**
 * An icon is `{ kind: 'emoji', value: '🛠' }` or `{ kind: 'image', value: <data
 * URL> }`, or null for the default folder/message glyph. Images are shrunk to a
 * thumbnail before they get here — see `imageToIcon`.
 */
export const newChat = (name = 'New conversation') => ({
  id: uid(),
  name,
  icon: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  messages: [],
})

export const newProject = ({ name, desc = '', folder = null, icon = null, settings = null }) => ({
  id: uid(),
  name,
  desc,
  icon,
  folder,
  createdAt: Date.now(),
  lastActive: Date.now(),
  settings: { ...defaultSettings(), ...(settings || {}) },
  chats: [newChat('First conversation')],
})

/** Account-wide preferences, as opposed to a project's model settings. */
export const defaultPrefs = () => ({
  /** model name -> icon, so a custom mark survives a re-pull of the model. */
  modelIcons: {},
  /** User-written `/name` prompts for the composer. */
  commands: [],
})

const initialState = {
  projects: [],
  trash: [],
  prefs: defaultPrefs(),
  view: 'dashboard',
  currentProjectId: null,
  currentChatId: null,
  expanded: [],
  loaded: false,
}

function mapProject(state, id, fn) {
  return {
    ...state,
    projects: state.projects.map((p) => (p.id === id ? fn(p) : p)),
  }
}

function mapChat(state, projectId, chatId, fn) {
  return mapProject(state, projectId, (p) => ({
    ...p,
    lastActive: Date.now(),
    chats: p.chats.map((c) => (c.id === chatId ? fn(c) : c)),
  }))
}

/** Newest first, and old enough entries drop off the end. */
function pushTrash(trash, entry) {
  const cutoff = Date.now() - TRASH_KEEP_DAYS * 86_400_000
  return [entry, ...trash.filter((t) => t.deletedAt >= cutoff)]
}

function reducer(state, action) {
  switch (action.type) {
    case 'hydrate': {
      const {
        projects = [],
        currentProjectId = null,
        currentChatId = null,
        view = 'dashboard',
        trash = [],
        prefs = defaultPrefs(),
      } = action.payload || {}
      return {
        ...state,
        projects,
        trash,
        prefs,
        currentProjectId,
        currentChatId,
        view,
        loaded: true,
      }
    }

    case 'ready':
      return { ...state, loaded: true }

    // Signing out has to clear the library, not just hide it: the next account
    // must never inherit a page of someone else's conversations.
    case 'reset':
      return { ...initialState }

    case 'view':
      return { ...state, view: action.view }

    case 'prefs':
      return { ...state, prefs: { ...state.prefs, ...action.patch } }

    /** The grid of every conversation in one project. */
    case 'project/detail': {
      if (!state.projects.some((p) => p.id === action.id)) return state
      return {
        ...state,
        view: 'project',
        currentProjectId: action.id,
        expanded: [...new Set([...state.expanded, action.id])],
      }
    }

    case 'chat/icon':
      return mapChat(state, action.projectId, action.chatId, (c) => ({ ...c, icon: action.icon }))

    case 'project/create': {
      const project = action.project
      return {
        ...state,
        projects: [project, ...state.projects],
        currentProjectId: project.id,
        currentChatId: project.chats[0].id,
        expanded: [...new Set([...state.expanded, project.id])],
      }
    }

    case 'project/update':
      return mapProject(state, action.id, (p) => ({ ...p, ...action.patch }))

    case 'project/settings':
      return mapProject(state, action.id, (p) => ({
        ...p,
        settings: { ...p.settings, ...action.patch },
      }))

    case 'project/delete': {
      const project = state.projects.find((p) => p.id === action.id)
      if (!project) return state
      const projects = state.projects.filter((p) => p.id !== action.id)
      const wasCurrent = state.currentProjectId === action.id
      return {
        ...state,
        projects,
        trash: pushTrash(state.trash, {
          id: uid(),
          kind: 'project',
          deletedAt: Date.now(),
          name: project.name,
          chatCount: project.chats.length,
          project,
        }),
        currentProjectId: wasCurrent ? null : state.currentProjectId,
        currentChatId: wasCurrent ? null : state.currentChatId,
        view: wasCurrent ? 'dashboard' : state.view,
      }
    }

    case 'project/open': {
      const project = state.projects.find((p) => p.id === action.id)
      if (!project) return state
      const chats = project.chats.length ? project.chats : [newChat()]
      const target =
        action.chatId ||
        [...chats].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0].id
      return {
        ...mapProject(state, action.id, (p) => ({ ...p, chats, lastActive: Date.now() })),
        view: 'chat',
        currentProjectId: action.id,
        currentChatId: target,
        expanded: [...new Set([...state.expanded, action.id])],
      }
    }

    case 'project/toggleExpand':
      return {
        ...state,
        expanded: state.expanded.includes(action.id)
          ? state.expanded.filter((x) => x !== action.id)
          : [...state.expanded, action.id],
      }

    case 'chat/create': {
      const chat = action.chat
      return {
        ...mapProject(state, action.projectId, (p) => ({
          ...p,
          lastActive: Date.now(),
          chats: [chat, ...p.chats],
        })),
        currentChatId: chat.id,
        currentProjectId: action.projectId,
        view: 'chat',
        expanded: [...new Set([...state.expanded, action.projectId])],
      }
    }

    case 'chat/select':
      return {
        ...state,
        currentProjectId: action.projectId,
        currentChatId: action.chatId,
        view: 'chat',
        expanded: [...new Set([...state.expanded, action.projectId])],
      }

    case 'chat/rename':
      return mapChat(state, action.projectId, action.chatId, (c) => ({ ...c, name: action.name }))

    case 'chat/delete': {
      const project = state.projects.find((p) => p.id === action.projectId)
      const chat = project?.chats.find((c) => c.id === action.chatId)
      if (!project || !chat) return state
      const remaining = project.chats.filter((c) => c.id !== action.chatId)
      const chats = remaining.length ? remaining : [newChat()]
      const next = {
        ...mapProject(state, action.projectId, (p) => ({ ...p, chats })),
        trash: pushTrash(state.trash, {
          id: uid(),
          kind: 'chat',
          deletedAt: Date.now(),
          name: chat.name,
          projectId: project.id,
          projectName: project.name,
          chat,
        }),
      }
      if (state.currentChatId !== action.chatId) return next
      return { ...next, currentChatId: chats[0].id }
    }

    case 'chat/clear':
      return mapChat(state, action.projectId, action.chatId, (c) => ({ ...c, messages: [] }))

    case 'trash/restore': {
      const entry = state.trash.find((t) => t.id === action.id)
      if (!entry) return state
      const trash = state.trash.filter((t) => t.id !== action.id)

      if (entry.kind === 'project') {
        // A second copy of the same project would be worse than a rename.
        const clash = state.projects.some((p) => p.id === entry.project.id)
        const project = clash ? { ...entry.project, id: uid() } : entry.project
        return { ...state, trash, projects: [{ ...project, lastActive: Date.now() }, ...state.projects] }
      }

      const home = state.projects.find((p) => p.id === entry.projectId)
      if (home) {
        return {
          ...mapProject(state, home.id, (p) => ({
            ...p,
            lastActive: Date.now(),
            chats: [entry.chat, ...p.chats.filter((c) => c.id !== entry.chat.id)],
          })),
          trash,
        }
      }
      // Its project is gone too, so the conversation lands in a fresh one
      // carrying the old name rather than being unrestorable.
      const revived = {
        ...newProject({ name: entry.projectName || 'Restored' }),
        chats: [entry.chat],
      }
      return { ...state, trash, projects: [revived, ...state.projects] }
    }

    case 'trash/purge':
      return { ...state, trash: state.trash.filter((t) => t.id !== action.id) }

    case 'trash/empty':
      return { ...state, trash: [] }

    case 'message/append': {
      return mapChat(state, action.projectId, action.chatId, (c) => {
        const autoName =
          c.messages.length === 0 && action.message.role === 'user' && isDefaultName(c.name)
        return {
          ...c,
          name: autoName ? titleFromText(action.message.content) : c.name,
          updatedAt: Date.now(),
          messages: [...c.messages, action.message],
        }
      })
    }

    case 'message/patch':
      return mapChat(state, action.projectId, action.chatId, (c) => ({
        ...c,
        updatedAt: Date.now(),
        messages: c.messages.map((m) => (m.id === action.id ? { ...m, ...action.patch } : m)),
      }))

    case 'message/remove':
      return mapChat(state, action.projectId, action.chatId, (c) => ({
        ...c,
        messages: c.messages.filter((m) => m.id !== action.id),
      }))

    case 'message/truncateFrom':
      return mapChat(state, action.projectId, action.chatId, (c) => {
        const i = c.messages.findIndex((m) => m.id === action.id)
        return i === -1 ? c : { ...c, messages: c.messages.slice(0, i) }
      })

    default:
      return state
  }
}

function isDefaultName(name) {
  return name === 'New conversation' || name === 'First conversation'
}

/** Drops transient per-render fields before writing to disk. */
function serialize(state) {
  return JSON.stringify({
    version: STATE_VERSION,
    view: state.view,
    currentProjectId: state.currentProjectId,
    currentChatId: state.currentChatId,
    prefs: state.prefs,
    projects: state.projects.map((p) => ({
      ...p,
      chats: p.chats.map((c) => ({ ...c, messages: persistMessages(c.messages) })),
    })),
  })
}

function serializeTrash(items) {
  return JSON.stringify({ version: TRASH_VERSION, items }, null, 2)
}

function migrate(raw) {
  if (!raw || typeof raw !== 'object') return null
  const projects = Array.isArray(raw.projects) ? raw.projects : []
  const prefs = raw.prefs && typeof raw.prefs === 'object' ? raw.prefs : {}
  return {
    prefs: {
      ...defaultPrefs(),
      ...prefs,
      modelIcons: prefs.modelIcons && typeof prefs.modelIcons === 'object' ? prefs.modelIcons : {},
      commands: Array.isArray(prefs.commands) ? prefs.commands : [],
    },
    // Reopen where the last session left off.
    view: raw.view === 'chat' ? 'chat' : raw.view === 'project' ? 'project' : 'dashboard',
    currentProjectId: raw.currentProjectId ?? null,
    currentChatId: raw.currentChatId ?? null,
    projects: projects.map((p) => ({
      ...newProject({ name: p.name ?? 'Untitled' }),
      ...p,
      settings: { ...defaultSettings(), ...(p.settings || {}) },
      icon: p.icon ?? null,
      chats: (Array.isArray(p.chats) && p.chats.length ? p.chats : [newChat()]).map((c) => ({
        ...newChat(),
        ...c,
        icon: c.icon ?? null,
        messages: Array.isArray(c.messages) ? c.messages : [],
      })),
    })),
  }
}

function migrateTrash(raw) {
  const items = Array.isArray(raw?.items) ? raw.items : []
  const cutoff = Date.now() - TRASH_KEEP_DAYS * 86_400_000
  return items.filter(
    (t) => t && t.id && (t.kind === 'chat' ? !!t.chat : !!t.project) && (t.deletedAt ?? 0) >= cutoff,
  )
}

const StoreContext = createContext(null)

/**
 * Holds one account's library. `user` is the account name, which is also the
 * folder it lives in — changing it swaps the whole library over.
 */
export function StoreProvider({ user, children }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const writers = useRef(null)
  const [loadError, setLoadError] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const { toast } = useToast()

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    dispatch({ type: 'reset' })
    const onError = (e) => toast(`Could not save your library: ${e?.message || e}`, { tone: 'error' })
    const library = createWriter({ user, save: backend.saveLibrary, serialize, onError })
    const trash = createWriter({ user, save: backend.saveTrash, serialize: serializeTrash, delay: 500, onError })
    writers.current = { user, library, trash }

    async function load() {
      const { library: rawLibrary, trash: rawTrash } = await loadAccountData(backend, user)
      const payload = rawLibrary ? migrate(rawLibrary) : null
      if (!cancelled) dispatch({ type: 'hydrate', payload: { ...(payload || {}), trash: migrateTrash(rawTrash) } })
    }
    if (user) load().catch((e) => {
      if (!cancelled) setLoadError(e?.message || String(e))
    })
    return () => {
      cancelled = true
      writers.current = null
      void library.dispose()
      void trash.dispose()
    }
  }, [user, attempt, toast])

  useLayoutEffect(() => {
    const current = writers.current
    if (!state.loaded || !current || current.user !== user) return
    current.library.update(state)
    current.trash.update(state.trash)
  }, [state, user])

  useEffect(() => {
    let active = true
    let unlisten
    let closing = false
    const win = getCurrentWindow()
    win.onCloseRequested(async (event) => {
      if (closing) return
      event.preventDefault()
      try {
        await flushPendingSaves(user)
        closing = true
        await win.close()
      } catch (e) {
        closing = false
        toast(`Could not save before closing: ${e?.message || e}`, { tone: 'error' })
      }
    }).then((fn) => { if (active) unlisten = fn; else fn() }).catch(() => {})
    return () => { active = false; unlisten?.() }
  }, [user, toast])

  const value = useMemo(() => ({ state, dispatch }), [state])
  if (loadError) return (
    <div className="crash">
      <h1>Your library could not be opened.</h1>
      <p>{loadError}</p>
      <button className="btn-primary" onClick={() => setAttempt((n) => n + 1)}>Retry</button>
    </div>
  )
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}

export function useCurrent() {
  const { state } = useStore()
  const project = state.projects.find((p) => p.id === state.currentProjectId) || null
  const chat = project?.chats.find((c) => c.id === state.currentChatId) || null
  return { project, chat }
}
