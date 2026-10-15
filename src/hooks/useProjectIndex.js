import { useCallback, useEffect, useRef, useState } from 'react'
import { backend } from '../lib/backend'
import { scanProject } from '../lib/projectScan'
import { buildProjectInWorker } from '../lib/projectWorker'

const emptyState = (root, scope) => ({
  root, scope, index: null, tree: [], stats: null, scanning: !!root,
  progress: 0, phase: root ? 'Scanning folder?' : '', error: null,
})

// Keep only the active index. Every project open re-reads disk, including when
// two projects happen to reference the same folder.
export function useProjectIndex(folder, scope) {
  const root = folder?.root || null
  const [state, setState] = useState(() => emptyState(root, scope))
  const current = useRef(null)

  const scan = useCallback(async () => {
    current.current?.abort()
    const controller = new AbortController()
    current.current = controller
    const { signal } = controller
    setState(emptyState(root, scope))
    if (!root) return
    try {
      const result = await scanProject({
        root, backend, signal, build: buildProjectInWorker,
        onProgress: (update) => {
          if (!signal.aborted) setState((s) => ({ ...s, ...update }))
        },
      })
      if (!signal.aborted) setState({ ...result, root, scope, scanning: false, progress: 1, phase: '', error: null })
    } catch (e) {
      if (!signal.aborted) setState({ ...emptyState(root, scope), scanning: false, error: e?.message || String(e) })
    }
  }, [root, scope])

  useEffect(() => {
    scan()
    return () => current.current?.abort()
  }, [scan])

  // Effects run after render: hide the previous folder even on that first render.
  const visible = state.root === root && state.scope === scope ? state : emptyState(root, scope)
  return { ...visible, rescan: scan }
}
