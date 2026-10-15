import { buildIndex } from './relevance.js'
import { buildTree } from './projectTree.js'

self.onmessage = ({ data: files }) => {
  try {
    self.postMessage({ index: buildIndex(files), tree: buildTree(files) })
  } catch (e) {
    self.postMessage({ error: e?.message || String(e) })
  }
}
