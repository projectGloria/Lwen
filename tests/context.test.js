import test from 'node:test'
import assert from 'node:assert/strict'
import { requireProjectIndex, retainAttachments, retryAttachments } from '../src/lib/chatContext.js'
import { scanProject } from '../src/lib/projectScan.js'
import { buildIndex } from '../src/lib/relevance.js'
import { buildTree } from '../src/lib/projectTree.js'

test('requests cannot use another folder or an unfinished index', () => {
  const project = { folder: { root: 'B' } }
  assert.throws(() => requireProjectIndex(project, { root: 'A' }), /not ready/)
  assert.throws(() => requireProjectIndex(project, null), /not ready/)
  assert.doesNotThrow(() => requireProjectIndex(project, { root: 'B' }))
  assert.doesNotThrow(() => requireProjectIndex({ folder: null }, null))
})

test('attachment text survives persistence and is available for regeneration', () => {
  const attachments = [{ name: 'report.pdf', path: '/report.pdf', text: 'Original PDF text', kind: 'pdf', status: 'ready' }]
  const message = JSON.parse(JSON.stringify({ attachments: retainAttachments(attachments) }))
  assert.equal(retryAttachments(message)[0].text, 'Original PDF text')
  assert.equal(message.attachments[0].status, undefined)
  assert.throws(() => retryAttachments({ attachments: [{ name: 'old.pdf' }] }), /Reattach/)
  assert.deepEqual(retryAttachments({}), [])
})

test('reopening a project reads changed files and removes deleted files', async () => {
  let files = [{ path: '/A/a.js', rel: 'a.js', text: 'before' }, { path: '/A/b.js', rel: 'b.js', text: 'deleted' }]
  const backend = {
    pathKind: async () => 'dir', scanFolder: async () => ({ files }),
    // Backend results may arrive in a different order from the request.
    readFiles: async () => [...files].reverse(),
  }
  const scan = () => scanProject({ root: '/A', backend, signal: new AbortController().signal,
    build: async (files) => ({ index: buildIndex(files), tree: buildTree(files) }) })
  const first = await scan()
  assert.equal(first.index.files[0].rel, 'b.js')
  files = [{ path: '/A/a.js', rel: 'a.js', text: 'after' }]
  const second = await scan()
  assert.deepEqual(second.index.texts, ['after'])
  assert.equal(second.index.count, 1)
})

test('cancelled folder reads cannot publish an index or stale progress', async () => {
  const controller = new AbortController()
  let finishRead
  let built = false
  const progress = []
  const scan = scanProject({ root: '/A', signal: controller.signal,
    backend: {
      pathKind: async () => 'dir', scanFolder: async () => ({ files: [{ path: '/A/a.js', rel: 'a.js' }] }),
      readFiles: () => new Promise((resolve) => { finishRead = resolve }),
    },
    build: async () => { built = true }, onProgress: (p) => progress.push(p),
  })
  await new Promise((resolve) => setImmediate(resolve))
  controller.abort()
  const count = progress.length
  finishRead([{ path: '/A/a.js', text: 'stale' }])
  await assert.rejects(scan, { name: 'AbortError' })
  assert.equal(built, false)
  assert.equal(progress.length, count)
})
