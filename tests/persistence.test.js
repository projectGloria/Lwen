import test from 'node:test'
import assert from 'node:assert/strict'
import { createWriter, flushPendingSaves, loadAccountData, persistMessages } from '../src/lib/persistence.js'

test('failed reads and corrupt files reject; only missing files create an empty account', async () => {
  const backend = { loadLibrary: async () => null, loadTrash: async () => null }
  assert.deepEqual(await loadAccountData(backend, 'missing'), { library: null, trash: null })
  for (const value of ['{broken', 'null', '{}', '']) {
    await assert.rejects(loadAccountData({ ...backend, loadLibrary: async () => value }, 'corrupt'))
    await assert.rejects(loadAccountData({ ...backend, loadTrash: async () => value }, 'corrupt'))
  }
  await assert.rejects(loadAccountData({ ...backend, loadLibrary: async () => { throw new Error('read failed') } }, 'failed'), /read failed/)
})

test('unmount flushes pending changes to their original account before reload', async () => {
  let stored
  const writer = createWriter({ user: 'Alice', serialize: JSON.stringify, save: async (user, json) => {
    assert.equal(user, 'Alice')
    await new Promise((resolve) => setImmediate(resolve))
    stored = json
  } })
  writer.update({ projects: [{ name: 'Recent edit' }] })
  const disposed = writer.dispose()
  const result = await loadAccountData({ loadLibrary: async () => stored, loadTrash: async () => null }, 'Alice')
  await disposed
  assert.equal(result.library.projects[0].name, 'Recent edit')
})

test('failed saves remain retryable and concurrent flushes cannot reorder writes', async () => {
  const writes = []
  let fail = true
  const writer = createWriter({ user: 'retry', serialize: JSON.stringify, save: async (_, json) => {
    if (fail) throw new Error('disk unavailable')
    writes.push(json)
  } })
  writer.update({ value: 1 })
  await assert.rejects(writer.flush(), /disk unavailable/)
  fail = false
  await writer.flush()
  writer.update({ value: 2 })
  await Promise.all([writer.flush(), writer.flush()])
  await writer.dispose()
  assert.deepEqual(writes, ['{"value":1}', '{"value":2}'])
})

test('continuous updates checkpoint without waiting for an idle pause', async () => {
  let saved
  const checkpoint = new Promise((resolve) => { saved = resolve })
  const writer = createWriter({ user: 'stream', serialize: JSON.stringify, delay: 15, save: async () => saved() })
  let value = 0
  writer.update({ value: value++ })
  const interval = setInterval(() => writer.update({ value: value++ }), 1)
  let timeout
  try {
    await Promise.race([checkpoint, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('checkpoint starved')), 1000) })])
  } finally {
    clearInterval(interval)
    clearTimeout(timeout)
    await writer.dispose()
  }
})

test('flush includes edits arriving while the disk write is in flight', async () => {
  let finish
  const writes = []
  const writer = createWriter({ user: 'inflight', serialize: JSON.stringify, save: async (_, json) => {
    writes.push(json)
    if (writes.length === 1) await new Promise((resolve) => { finish = resolve })
  } })
  writer.update({ value: 1 })
  const flush = writer.flush()
  await new Promise((resolve) => setImmediate(resolve))
  writer.update({ value: 2 })
  finish()
  await flush
  assert.deepEqual(writes, ['{"value":1}', '{"value":2}'])
  await writer.dispose()
})

test('partial replies survive restart without remaining in streaming state', () => {
  const messages = [{ role: 'assistant', content: 'Partial reply', streaming: true, pending: false }]
  assert.deepEqual(persistMessages(messages), [{ role: 'assistant', content: 'Partial reply', stopped: true }])
  assert.equal(messages[0].streaming, true)
})

test('a failed unmount save is retried before the account is read again', async () => {
  let fail = true
  let stored
  const writer = createWriter({ user: 'recover', serialize: JSON.stringify, save: async (_, json) => {
    if (fail) throw new Error('busy')
    stored = json
  } })
  writer.update({ projects: [] })
  await writer.dispose()
  fail = false
  await flushPendingSaves('recover')
  assert.equal(stored, '{"projects":[]}')
})
