const active = new Set()

export async function loadAccountData(backend, user) {
  await flushPendingSaves(user)
  const [libraryJson, trashJson] = await Promise.all([
    backend.loadLibrary(user), backend.loadTrash(user),
  ])
  const library = libraryJson == null ? null : JSON.parse(libraryJson)
  const trash = trashJson == null ? null : JSON.parse(trashJson)
  if (libraryJson != null && (!library || !Array.isArray(library.projects))) {
    throw new Error('The saved library is invalid. Restore it from a backup before retrying.')
  }
  if (trashJson != null && (!trash || !Array.isArray(trash.items))) {
    throw new Error('The saved trash is invalid. Restore it from a backup before retrying.')
  }
  return { library, trash }
}

export const persistMessages = (messages) => messages.map(({ pending, streaming, ...rest }) => ({
  ...rest,
  ...(streaming ? { stopped: true } : {}),
}))

export async function flushPendingSaves(user) {
  await Promise.all([...active].filter((writer) => !user || writer.user === user).map((writer) => writer.flush()))
}

// A bounded delay checkpoints continuous edits. Writes are serialized, and a
// failed snapshot stays pending until a later flush succeeds.
export function createWriter({ user, save, serialize, delay = 700, onError = () => {} }) {
  let latest
  let timer = null
  let tail = Promise.resolve()
  let saved
  let disposed = false
  const writer = {
    user,
    update(value) {
      if (latest === value) return
      latest = value
      if (timer === null) timer = setTimeout(() => {
        timer = null
        writer.flush().catch(onError)
      }, delay)
    },
    flush() {
      clearTimeout(timer)
      timer = null
      tail = tail.catch(() => {}).then(async () => {
        let snapshot
        do {
          snapshot = latest
          if (snapshot === undefined) break
          const json = serialize(snapshot)
          if (json !== saved) {
            await save(user, json)
            saved = json
          }
        } while (latest !== snapshot)
        if (disposed) active.delete(writer)
      })
      return tail
    },
    async dispose() {
      disposed = true
      try {
        await writer.flush()
        active.delete(writer)
      } catch (error) {
        // Retain failed saves so a later account switch/load can retry them.
        onError(error)
      }
    },
  }
  active.add(writer)
  return writer
}
