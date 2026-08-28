import { invoke } from '@tauri-apps/api/core'

let runtime = null

/**
 * A Rust command declared `Result<T, String>` rejects with a bare string, not
 * an `Error`. Every `catch (e) { e?.message }` in the UI then reads `undefined`
 * and falls back to its own generic wording, throwing away what the backend
 * actually said — which is usually the only useful part.
 */
function asError(reason) {
  if (reason instanceof Error) return reason
  if (typeof reason === 'string') return new Error(reason)
  if (reason && typeof reason.message === 'string') return new Error(reason.message)
  try {
    return new Error(JSON.stringify(reason))
  } catch {
    return new Error(String(reason))
  }
}

/** Every backend call goes through here, so no command can lose its message. */
async function call(cmd, args) {
  try {
    return await invoke(cmd, args)
  } catch (reason) {
    throw asError(reason)
  }
}

/** Bridge details (base URL + session token) resolved once at boot. */
export async function initRuntime() {
  runtime = await call('runtime_info')
  return runtime
}

export function apiBase() {
  if (!runtime) throw new Error('Lwen has not finished starting up.')
  return runtime.api_base
}

export function ollamaBase() {
  return runtime?.ollama_base ?? 'http://127.0.0.1:11434'
}

export function authHeaders(extra) {
  if (!runtime) throw new Error('Lwen has not finished starting up.')
  return { [runtime.token_header]: runtime.token, ...extra }
}

export const backend = {
  status: () => call('ollama_status'),
  startServer: () => call('start_ollama'),
  stopServer: () => call('stop_ollama'),
  ollamaOwnership: () => call('ollama_ownership'),
  syncTray: (running, version, loaded) => call('sync_tray', { running, version, loaded }),
  runModel: (model, keepAlive) => call('run_model', { model, keepAlive }),
  stopModel: (model) => call('stop_model', { model }),
  loadedModels: () => call('loaded_models'),
  scanFolder: (path) => call('scan_folder', { path }),
  readFiles: (paths, maxBytes) => call('read_files', { paths, maxBytes }),
  readTextFile: (path) => call('read_text_file', { path }),
  readFileBytes: (path) => call('read_file_bytes', { path }),
  pathKind: (path) => call('path_kind', { path }),
  loadUsers: () => call('load_users'),
  saveUsers: (json) => call('save_users', { json }),
  loadLibrary: (user) => call('load_library', { user }),
  saveLibrary: (user, json) => call('save_library', { user, json }),
  loadTrash: (user) => call('load_trash', { user }),
  saveTrash: (user, json) => call('save_trash', { user, json }),
  loadStats: (user) => call('load_stats', { user }),
  saveStats: (user, json) => call('save_stats', { user, json }),
  userFolder: (user) => call('user_folder', { user }),
  adoptLegacyLibrary: (user) => call('adopt_legacy_library', { user }),
  appReady: () => call('app_ready'),
}
