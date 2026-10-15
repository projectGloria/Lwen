import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { scanProject } from '../src/lib/projectScan.js'
import { buildIndex } from '../src/lib/relevance.js'
import { buildTree } from '../src/lib/projectTree.js'

// Exercise the hook's render/effect boundary without a desktop webview.
function harness(backend) {
  const slots = []
  let cursor = 0
  let effects = []
  const hooks = {
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial } },
    useState(initial) {
      const i = cursor++
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial
      return [slots[i], (value) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value }]
    },
    useCallback(fn, deps) {
      const i = cursor++
      if (!slots[i] || deps.some((d, n) => d !== slots[i].deps[n])) slots[i] = { fn, deps }
      return slots[i].fn
    },
    useEffect(fn, deps) {
      const i = cursor++
      if (!slots[i] || deps.some((d, n) => d !== slots[i].deps[n])) effects.push(() => {
        slots[i]?.cleanup?.()
        slots[i] = { deps, cleanup: fn() }
      })
    },
  }
  const source = readFileSync(new URL('../src/hooks/useProjectIndex.js', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '').replace('export function', 'function')
  const hook = new Function(...Object.keys(hooks), 'backend', 'scanProject', 'buildProjectInWorker', `${source}\nreturn useProjectIndex`)(
    ...Object.values(hooks), backend, scanProject,
    async (files) => ({ index: buildIndex(files), tree: buildTree(files) }),
  )
  return {
    render(folder, scope) { cursor = 0; return hook(folder, scope) },
    commit() { const pending = effects; effects = []; pending.forEach((fn) => fn()) },
    unmount() { slots.forEach((slot) => slot?.cleanup?.()) },
  }
}

test('switching folders hides the old index before effects, then rereads on reopening', async () => {
  let text = 'before'
  let scans = 0
  const h = harness({
    pathKind: async () => 'dir',
    scanFolder: async (root) => { scans++; return { files: [{ path: `${root}/main.js`, rel: 'main.js' }] } },
    readFiles: async (paths) => paths.map((path) => ({ path, text })),
  })
  const tick = () => new Promise((resolve) => setImmediate(resolve))
  h.render({ root: 'A' }, 'projectA'); h.commit(); await tick()
  assert.equal(h.render({ root: 'A' }, 'projectA').index.root, 'A')
  const switching = h.render({ root: 'B' }, 'projectB')
  assert.equal(switching.index, null)
  assert.equal(switching.scanning, true)
  h.commit(); await tick()
  text = 'after'
  h.render({ root: 'A' }, 'projectA'); h.commit(); await tick()
  assert.deepEqual(h.render({ root: 'A' }, 'projectA').index.texts, ['after'])
  assert.equal(scans, 3)
  // Opening another project with the same path also invalidates the index.
  assert.equal(h.render({ root: 'A' }, 'anotherProject').index, null)
  h.commit(); await tick()
  assert.equal(scans, 4)
  h.unmount()
})
