export function buildProjectInWorker(files, signal) {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./projectIndex.worker.js', import.meta.url), { type: 'module' })
    const finish = (error, result) => {
      signal.removeEventListener('abort', abort)
      worker.terminate()
      if (error) reject(error)
      else resolve(result)
    }
    const abort = () => finish(signal.reason || new DOMException('Indexing cancelled', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    worker.onmessage = ({ data }) => finish(data.error ? new Error(data.error) : null, data)
    worker.onerror = (event) => finish(new Error(event.message || 'Project indexing failed.'))
    worker.onmessageerror = () => finish(new Error('Could not read the project index.'))
    try { worker.postMessage(files) } catch (e) { finish(e) }
  })
}
