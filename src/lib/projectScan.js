export async function scanProject({ root, backend, signal, build, onProgress = () => {} }) {
  signal.throwIfAborted()
  const kind = await backend.pathKind(root)
  signal.throwIfAborted()
  if (kind !== 'dir') throw new Error('That folder no longer exists at its saved location.')
  const result = await backend.scanFolder(root)
  signal.throwIfAborted()
  const texts = []
  for (let i = 0; i < result.files.length; i += 300) {
    onProgress({ phase: `Reading ${result.files.length} files…` })
    const slice = result.files.slice(i, i + 300)
    const byPath = new Map(slice.map((file) => [file.path, file]))
    const chunk = await backend.readFiles(slice.map((file) => file.path))
    signal.throwIfAborted()
    for (const item of chunk) {
      const file = byPath.get(item.path)
      if (!file || item.error) continue
      texts.push({ ...file, text: item.text })
    }
    onProgress({ progress: Math.min(1, (i + 300) / result.files.length) })
  }
  onProgress({ phase: 'Indexing…' })
  const { index, tree } = await build(texts, signal)
  signal.throwIfAborted()
  return {
    index: { ...index, root }, tree,
    stats: {
      root, name: result.name, total: result.files.length, indexed: texts.length,
      bytes: result.total_bytes, truncated: result.truncated,
      skippedLarge: result.skipped_large, scannedAt: Date.now(),
    },
  }
}
