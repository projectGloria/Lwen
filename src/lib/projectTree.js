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

