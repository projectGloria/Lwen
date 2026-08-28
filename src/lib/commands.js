/**
 * Slash commands for the composer.
 *
 * Two kinds share one list. **Actions** do something to the app — start a new
 * conversation, unload the model — and never reach the model. **Prompts** are
 * saved pieces of text: picking one drops it into the composer so it can be
 * read and edited before it is sent, which is the difference between a shortcut
 * and a thing that fires a request you did not see.
 *
 * `{input}` in a prompt is replaced by whatever was typed after the command;
 * without it, that text is appended on a new line.
 */

export const BUILT_INS = [
  { id: 'new', name: 'new', description: 'Start a new conversation', kind: 'action' },
  { id: 'clear', name: 'clear', description: 'Remove every message in this conversation', kind: 'action' },
  { id: 'retry', name: 'retry', description: 'Run the last answer again', kind: 'action' },
  { id: 'files', name: 'files', description: 'Show the project files panel', kind: 'action' },
  { id: 'model', name: 'model', description: 'Choose a model', kind: 'action' },
  { id: 'run', name: 'run', description: 'Load the current model into memory', kind: 'action' },
  { id: 'unload', name: 'unload', description: 'Free the model from memory', kind: 'action' },
  { id: 'settings', name: 'settings', description: 'Open the Configuration panel', kind: 'action' },
  { id: 'grid', name: 'grid', description: 'Open this project in detailed view', kind: 'action' },
  { id: 'stats', name: 'stats', description: 'Your usage statistics', kind: 'action' },
  { id: 'commands', name: 'commands', description: 'Add or edit your own commands', kind: 'action' },
  { id: 'help', name: 'help', description: 'Keyboard shortcuts and what these do', kind: 'action' },
]

const NAME_RULE = /^[a-z0-9][a-z0-9-]{0,23}$/

/** Command names are typed, so they get the same treatment as a CLI verb. */
export function normalizeName(raw) {
  return (raw || '')
    .trim()
    .toLowerCase()
    .replace(/^\/+/, '')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 24)
}

export function validateName(name, existing, selfId = null) {
  if (!name) return 'Give the command a name.'
  if (!NAME_RULE.test(name)) return 'Use letters, numbers and hyphens.'
  if (BUILT_INS.some((b) => b.name === name)) return `/${name} is a built-in command.`
  if (existing.some((c) => c.name === name && c.id !== selfId)) {
    return `You already have a /${name}.`
  }
  return null
}

/**
 * Parses composer text as a command invocation.
 * Returns null unless the text starts with `/` on the first line.
 */
export function parseInvocation(text) {
  const match = /^\/([a-z0-9-]*)([\s\S]*)$/i.exec(text ?? '')
  if (!match) return null
  return { name: match[1].toLowerCase(), rest: match[2].replace(/^[^\S\n]+/, '') }
}

export function allCommands(custom = []) {
  return [...BUILT_INS, ...custom.map((c) => ({ ...c, kind: 'prompt' }))]
}

/** Prefix matches first, then anything else that contains the query. */
export function searchCommands(query, custom = []) {
  const all = allCommands(custom)
  const q = (query || '').toLowerCase()
  if (!q) return all
  const starts = all.filter((c) => c.name.startsWith(q))
  const rest = all.filter(
    (c) =>
      !c.name.startsWith(q) &&
      (c.name.includes(q) || (c.description || '').toLowerCase().includes(q)),
  )
  return [...starts, ...rest]
}

export function expandPrompt(command, rest) {
  const body = command.prompt ?? ''
  if (body.includes('{input}')) return body.replaceAll('{input}', rest ?? '')
  return rest ? `${body}\n\n${rest}` : body
}
