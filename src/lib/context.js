import { estimateTokens, estimateMessageTokens } from './tokens'
import { selectContext } from './relevance'
import { langFromPath } from './format'

/** Room left for the model's own reply inside num_ctx. */
function replyReserve(contextWindow) {
  return Math.max(512, Math.min(2048, Math.round(contextWindow * 0.2)))
}

function fence(path, text) {
  const lang = langFromPath(path)
  // Long enough that fences inside the file cannot terminate the block early.
  const ticks = '`'.repeat(Math.max(3, longestRun(text) + 1))
  return `${ticks}${lang}\n${text}\n${ticks}`
}

function longestRun(text) {
  let best = 0
  let run = 0
  for (const ch of text) {
    if (ch === '`') {
      run += 1
      if (run > best) best = run
    } else run = 0
  }
  return best
}

function attachmentBlock(attachments) {
  if (!attachments.length) return ''
  const parts = attachments.map(
    (a) => `--- ATTACHED FILE: ${a.name} ---\n${fence(a.name, a.text)}`,
  )
  return parts.join('\n\n')
}

function projectBlock(files, projectName) {
  if (!files.length) return ''
  const header = `--- PROJECT FILES${projectName ? ` (${projectName})` : ''} ---`
  const parts = files.map((f) => `--- FILE: ${f.rel} ---\n${fence(f.rel, f.text)}`)
  return `${header}\n\n${parts.join('\n\n')}`
}

/**
 * Trims history to a token budget, dropping the oldest turns first and never
 * leaving a dangling assistant reply at the front.
 */
function trimHistory(history, budget) {
  const kept = []
  let used = 0
  for (let i = history.length - 1; i >= 0; i--) {
    const cost = estimateMessageTokens(history[i])
    if (used + cost > budget) break
    used += cost
    kept.unshift(history[i])
  }
  while (kept.length && kept[0].role === 'assistant') {
    used -= estimateMessageTokens(kept.shift())
  }
  return { kept, used, dropped: history.length - kept.length }
}

/**
 * Assembles the /api/chat payload for one turn.
 *
 * History is sent as the user's *raw* text — the file context attached to an
 * earlier turn is not replayed, which would otherwise compound every message.
 */
export function buildRequest({
  userText,
  attachments = [],
  history = [],
  systemPrompt = '',
  index = null,
  projectName = '',
  pinnedPaths = [],
  contextWindow = 8192,
}) {
  const warnings = []
  const reserve = replyReserve(contextWindow)
  const systemTokens = systemPrompt ? estimateTokens(systemPrompt) + 4 : 0
  const userTokens = estimateTokens(userText) + 4

  const attachText = attachmentBlock(attachments)
  const attachTokens = attachText ? estimateTokens(attachText) : 0

  let available = contextWindow - reserve - systemTokens - userTokens - attachTokens

  if (available < 0) {
    warnings.push({
      kind: 'overflow',
      text:
        `The attached files are about ${Math.abs(available) + contextWindow - reserve} tokens, which is more than ` +
        `this model's ${contextWindow.toLocaleString()}-token window. Ollama will drop the earliest part of the ` +
        `prompt — remove an attachment or raise the context window to avoid that.`,
    })
    available = 0
  }

  let selection = { included: [], excluded: [], usedTokens: 0 }
  const hasProject = !!index && index.count > 0
  if (hasProject) {
    const projectBudget = Math.floor(available * 0.55)
    selection = selectContext({
      index,
      query: userText,
      pinned: pinnedPaths,
      budgetTokens: projectBudget,
      estimate: estimateTokens,
    })
  }

  const historyBudget = available - selection.usedTokens
  const { kept, dropped } = trimHistory(history, Math.max(0, historyBudget))

  if (dropped > 0) {
    warnings.push({
      kind: 'history',
      text: `${dropped} earlier message${dropped === 1 ? '' : 's'} left out to fit the context window.`,
    })
  }
  if (selection.excluded.length) {
    warnings.push({
      kind: 'files',
      text: `${selection.excluded.length} relevant file${selection.excluded.length === 1 ? ' was' : 's were'} left out to fit the context window.`,
    })
  }

  const blocks = []
  if (attachText) blocks.push(attachText)
  const proj = projectBlock(selection.included, projectName)
  if (proj) blocks.push(proj)

  const content = blocks.length
    ? `${blocks.join('\n\n')}\n\n--- END OF CONTEXT ---\n\n${userText}`
    : userText

  const messages = []
  if (systemPrompt.trim()) messages.push({ role: 'system', content: systemPrompt.trim() })
  for (const m of kept) messages.push({ role: m.role, content: m.content })
  messages.push({ role: 'user', content })

  return {
    messages,
    warnings,
    contextUsed: {
      files: selection.included.map((f) => ({ rel: f.rel, path: f.path, reason: f.reason })),
      excluded: selection.excluded.map((f) => ({ rel: f.rel, path: f.path })),
      attachments: attachments.map((a) => ({ name: a.name, path: a.path, kind: a.kind })),
    },
    estimatedTokens:
      systemTokens +
      userTokens +
      attachTokens +
      selection.usedTokens +
      kept.reduce((s, m) => s + estimateMessageTokens(m), 0),
  }
}

/** Cheap pre-send estimate for the composer's live warning. */
export function estimatePayload({ userText, attachments, history, systemPrompt, contextWindow }) {
  const reserve = replyReserve(contextWindow)
  const attachTokens = attachments.reduce((s, a) => s + estimateTokens(a.text) + 12, 0)
  const total =
    estimateTokens(userText) +
    attachTokens +
    (systemPrompt ? estimateTokens(systemPrompt) : 0) +
    history.reduce((s, m) => s + estimateMessageTokens(m), 0)
  return {
    total,
    attachTokens,
    limit: contextWindow - reserve,
    over: total > contextWindow - reserve,
  }
}
