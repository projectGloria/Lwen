import test from 'node:test'
import assert from 'node:assert/strict'
import { Worker as NodeWorker } from 'node:worker_threads'
import { buildProjectInWorker } from '../src/lib/projectWorker.js'

test('indexing runs in a worker, returns Maps, and terminates on completion or cancellation', async () => {
  const workers = []
  const original = globalThis.Worker
  globalThis.Worker = class {
    constructor(url) {
      workers.push(this)
      this.node = new NodeWorker(`
        const { parentPort, workerData } = require('node:worker_threads')
        globalThis.self = { postMessage: data => parentPort.postMessage(data) }
        import(workerData.url).then(() => {
          parentPort.on('message', data => self.onmessage({ data }))
          parentPort.postMessage('ready')
        })
      `, { eval: true, workerData: { url: url.href } })
      this.node.on('message', (data) => {
        if (data === 'ready') { this.node.postMessage(this.pending); return }
        this.onmessage?.({ data })
      })
      this.node.on('error', (error) => this.onerror?.(error))
    }
    postMessage(data) { this.pending = data }
    terminate() { this.terminated = true; void this.node.terminate() }
  }
  try {
    const result = await buildProjectInWorker([{ path: '/A/main.js', rel: 'main.js', text: 'const example = 1' }], new AbortController().signal)
    assert.equal(result.index.count, 1)
    assert.ok(result.index.postings instanceof Map)
    assert.equal(result.tree[0].name, 'main.js')
    assert.equal(workers[0].terminated, true)
    const controller = new AbortController()
    const pending = buildProjectInWorker([], controller.signal)
    controller.abort()
    await assert.rejects(pending, { name: 'AbortError' })
    assert.equal(workers[1].terminated, true)
  } finally {
    workers.forEach((worker) => worker.terminate())
    if (original) globalThis.Worker = original
    else delete globalThis.Worker
  }
})
