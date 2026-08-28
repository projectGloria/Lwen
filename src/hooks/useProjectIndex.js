import { useCallback, useEffect, useRef, useState } from 'react'
import { backend } from '../lib/backend'
import { buildIndex } from '../lib/relevance'

const READ_BATCH = 300
const cache = new Map() // folder root -> { index, tree, stats }

export function buildTree(files) {
  const root = { name: '', type: 'dir', path: '', children: new Map() }
  for (const file of files) {
    const parts = file.rel.split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i]
      let next = node.children.get(key)
      if (!next) {
        next = {
          name: key,
          type: 'dir',
          path: parts.slice(0, i + 1).join('/'),
          children: new Map(),
        }
        node.children.set(key, next)
      }
      node = next
    }
    const leaf = parts[parts.length - 1]
    node.children.set(leaf, {
      name: leaf,
      type: 'file',
      path: file.path,
      rel: file.rel,
      size: file.size,
    })
  }

  const finish = (node) => {
    if (node.type !== 'dir') return node
    const kids = [...node.children.values()].map(finish)
    kids.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { numeric: true })
    })
    return { ...node, children: kids }
  }
  return finish(root).children
}

export function invalidateIndex(root) {
  if (root) cache.delete(root)
  else cache.clear()
}

/**
 * Scans a project folder and builds the keyword index.
 * The index stays out of the persisted store: it is rebuilt on open, which
 * also picks up any edits made outside Lwen.
 */
export function useProjectIndex(folder) {
  const root = folder?.root || null
  const [state, setState] = useState(() => ({
    index: root && cache.has(root) ? cache.get(root).index : null,
    tree: root && cache.has(root) ? cache.get(root).tree : [],
    stats: root && cache.has(root) ? cache.get(root).stats : null,
    scanning: false,
    progress: 0,
    phase: '',
    error: null,
  }))
  const runId = useRef(0)

  const scan = useCallback(
    async (path, { force = false } = {}) => {
      if (!path) {
        setState({ index: null, tree: [], stats: null, scanning: false, progress: 0, phase: '', error: null })
        return
      }
      if (!force && cache.has(path)) {
        const hit = cache.get(path)
        setState({ ...hit, scanning: false, progress: 1, phase: '', error: null })
        return
      }

      const id = ++runId.current
      setState((s) => ({ ...s, scanning: true, progress: 0, phase: 'Scanning folder…', error: null }))

      try {
        const kind = await backend.pathKind(path)
        if (kind !== 'dir') throw new Error('That folder no longer exists at its saved location.')

        const result = await backend.scanFolder(path)
        if (runId.current !== id) return

        if (!result.files.length) {
          const empty = {
            index: buildIndex([]),
            tree: [],
            stats: { ...result, indexed: 0 },
          }
          cache.set(path, empty)
          setState({ ...empty, scanning: false, progress: 1, phase: '', error: null })
          return
        }

        setState((s) => ({ ...s, phase: `Reading ${result.files.length} files…` }))

        const texts = []
        for (let i = 0; i < result.files.length; i += READ_BATCH) {
          if (runId.current !== id) return
          const slice = result.files.slice(i, i + READ_BATCH)
          const chunk = await backend.readFiles(slice.map((f) => f.path))
          chunk.forEach((item, j) => {
            if (item.error) return // unreadable or binary: leave it out of the index
            texts.push({
              path: item.path,
              rel: slice[j].rel,
              size: slice[j].size,
              text: item.text,
            })
          })
          setState((s) => ({
            ...s,
            progress: Math.min(1, (i + READ_BATCH) / result.files.length),
          }))
        }

        if (runId.current !== id) return
        setState((s) => ({ ...s, phase: 'Indexing…' }))

        const index = buildIndex(texts)
        const tree = buildTree(texts.map((t) => ({ rel: t.rel, path: t.path, size: t.size })))
        const stats = {
          root: result.root,
          name: result.name,
          total: result.files.length,
          indexed: texts.length,
          bytes: result.total_bytes,
          truncated: result.truncated,
          skippedLarge: result.skipped_large,
          scannedAt: Date.now(),
        }
        const payload = { index, tree, stats }
        cache.set(path, payload)
        if (runId.current === id) {
          setState({ ...payload, scanning: false, progress: 1, phase: '', error: null })
        }
      } catch (e) {
        if (runId.current !== id) return
        setState({
          index: null,
          tree: [],
          stats: null,
          scanning: false,
          progress: 0,
          phase: '',
          error: e?.message || String(e),
        })
      }
    },
    [],
  )

  useEffect(() => {
    scan(root)
    return () => {
      runId.current++
    }
  }, [root, scan])

  const rescan = useCallback(() => {
    if (root) {
      cache.delete(root)
      scan(root, { force: true })
    }
  }, [root, scan])

  return { ...state, rescan }
}
