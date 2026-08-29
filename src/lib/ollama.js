import { apiBase, authHeaders } from './backend'

export class OllamaError extends Error {
  constructor(message, { kind = 'network', status = 0 } = {}) {
    super(message)
    this.name = 'OllamaError'
    this.kind = kind
    this.status = status
  }
}

/** llama-server's allocation failures, whatever wording this build uses. */
const OUT_OF_MEMORY =
  /out[- ]of[- ]memory|failed to allocate|unable to allocate|cudamalloc|insufficient memory/i

/** The diagnostic is a stack of C++ lines; one is enough to identify it. */
const firstLine = (text) => {
  const line = text.split(/\r?\n/)[0].trim()
  return line.length > 200 ? `${line.slice(0, 200)}…` : line
}

async function readError(res, fallback) {
  let detail = ''
  try {
    const body = await res.json()
    detail = typeof body?.error === 'string' ? body.error : ''
  } catch {
    /* non-JSON error body */
  }
  return detail || fallback
}

/** Locally installed models, newest first. */
export async function listModels() {
  let res
  try {
    res = await fetch(`${apiBase()}/api/tags`, { headers: authHeaders() })
  } catch {
    throw new OllamaError('Could not reach Ollama.', { kind: 'offline' })
  }
  if (!res.ok) {
    throw new OllamaError(await readError(res, `Ollama returned ${res.status}.`), {
      kind: res.status === 502 ? 'offline' : 'http',
      status: res.status,
    })
  }
  const data = await res.json()
  const models = Array.isArray(data?.models) ? data.models : []
  return models
    .map((m) => ({
      name: m.name,
      size: m.size ?? 0,
      family: m.details?.family ?? '',
      parameterSize: m.details?.parameter_size ?? '',
      quantization: m.details?.quantization_level ?? '',
      contextLength: m.details?.context_length ?? m.model_info?.['context_length'] ?? 0,
      capabilities: m.capabilities ?? [],
      modifiedAt: m.modified_at ?? '',
    }))
    .sort((a, b) => (b.modifiedAt || '').localeCompare(a.modifiedAt || ''))
}

/** Full metadata for one model — used for an accurate context window. */
export async function showModel(name) {
  const res = await fetch(`${apiBase()}/api/show`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ model: name }),
  })
  if (!res.ok) throw new OllamaError(await readError(res, `Ollama returned ${res.status}.`))
  const data = await res.json()
  const info = data?.model_info ?? {}
  const ctxKey = Object.keys(info).find((k) => k.endsWith('.context_length'))
  return {
    contextLength: ctxKey ? info[ctxKey] : 0,
    family: data?.details?.family ?? '',
    parameterSize: data?.details?.parameter_size ?? '',
    capabilities: data?.capabilities ?? [],
  }
}

/**
 * Streams a chat completion, yielding assistant text as it arrives.
 * `onChunk` receives ({ content, thinking, done, stats }).
 */
export async function streamChat({ model, messages, options, signal, onChunk }) {
  let res
  try {
    res = await fetch(`${apiBase()}/api/chat`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ model, messages, stream: true, options }),
      signal,
    })
  } catch (e) {
    if (e?.name === 'AbortError') throw e
    throw new OllamaError('Could not reach Ollama.', { kind: 'offline' })
  }

  if (!res.ok) {
    const message = await readError(res, `Ollama returned ${res.status}.`)
    const notFound = res.status === 404 || /not found|try pulling/i.test(message)
    if (notFound) {
      throw new OllamaError(
        `The model \`${model}\` is not installed. Pull it with \`ollama pull ${model}\`.`,
        { kind: 'model', status: res.status },
      )
    }
    if (OUT_OF_MEMORY.test(message)) {
      throw new OllamaError(
        `\`${model}\` did not fit in memory. Lower the context window in Configuration, close ` +
          `what is using your GPU or RAM, or pick a smaller model.\n\nOllama said: ${firstLine(message)}`,
        { kind: 'memory', status: res.status },
      )
    }
    throw new OllamaError(message, {
      kind: res.status === 502 ? 'offline' : 'http',
      status: res.status,
    })
  }
  if (!res.body) throw new OllamaError('Ollama returned an empty response stream.')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let stats = null

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // Ollama emits newline-delimited JSON; a chunk can split a line.
      let nl
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (!line) continue

        let payload
        try {
          payload = JSON.parse(line)
        } catch {
          continue
        }
        if (payload.error) throw new OllamaError(payload.error, { kind: 'http' })

        const content = payload.message?.content ?? ''
        const thinking = payload.message?.thinking ?? ''
        if (payload.done) {
          stats = {
            totalDuration: payload.total_duration ?? 0,
            evalCount: payload.eval_count ?? 0,
            evalDuration: payload.eval_duration ?? 0,
            promptEvalCount: payload.prompt_eval_count ?? 0,
            doneReason: payload.done_reason ?? '',
          }
        }
        if (content || thinking || payload.done) {
          onChunk({ content, thinking, done: !!payload.done, stats })
        }
      }
    }
  } catch (e) {
    // An error thrown out of the loop — an `error` field mid-stream, or an
    // abort — leaves the body half-read. Cancelling it releases the connection
    // instead of holding it open until the process exits.
    reader.cancel().catch(() => {})
    throw e
  } finally {
    reader.releaseLock()
  }

  return stats
}

/** Tokens per second, when the run reported enough to compute it. */
export function tokensPerSecond(stats) {
  if (!stats?.evalCount || !stats?.evalDuration) return 0
  return stats.evalCount / (stats.evalDuration / 1e9)
}
