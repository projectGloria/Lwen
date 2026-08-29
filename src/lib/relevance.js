/**
 * Keyword-based file relevance for project chat.
 *
 * Deliberately not embeddings: an inverted index over identifiers plus a set of
 * structural signals (filename mentions, definition sites, path depth) gets
 * most of the way there for "which files should I look at" questions, costs
 * nothing at query time, and needs no model call.
 */

const STOPWORDS = new Set(
  `a an the and or but if then else for while do of to in on at by with from into over under
   is are was were be been being am do does did doing have has had having can could should would
   will shall may might must i me my we our you your he she it they them this that these those
   what which who whom whose when where why how all any both each few more most other some such
   no nor not only own same so than too very just about above after again against because before
   below between during further here once out same up down off through
   please help show tell explain make give need want like use using used add
   file files code function functions method methods class classes work works working
   does doesnt dont whats hows why does`
    .split(/\s+/)
    .filter(Boolean),
)

const MAX_TF = 24
const DEFINITION_KEYWORDS =
  'function|class|def|const|let|var|struct|interface|type|enum|fn|func|module|impl|trait|component|export default'

/** Splits identifiers into their parts: `getUserName` -> get, user, name. */
function splitIdentifier(word) {
  const parts = word
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
  return parts.filter(Boolean).map((p) => p.toLowerCase())
}

function tokenize(text, { limit = Infinity } = {}) {
  const out = []
  const raw = text.match(/[A-Za-z_][A-Za-z0-9_$]*|\d+[a-z]*/g)
  if (!raw) return out
  for (let i = 0; i < raw.length && out.length < limit; i++) {
    const word = raw[i]
    if (word.length > 64) continue
    const lower = word.toLowerCase()
    if (lower.length >= 2 && !/^\d+$/.test(lower)) out.push(lower)
    const parts = splitIdentifier(word)
    if (parts.length > 1) {
      for (const p of parts) if (p.length >= 2 && !/^\d+$/.test(p)) out.push(p)
    }
  }
  return out
}

/**
 * Builds the in-memory index.
 * `files`: [{ path, rel, text, size }]
 */
export function buildIndex(files) {
  const postings = new Map()
  const meta = []

  files.forEach((file, idx) => {
    const terms = tokenize(file.text, { limit: 60000 })
    const counts = new Map()
    for (const t of terms) counts.set(t, Math.min((counts.get(t) || 0) + 1, MAX_TF))

    // Path segments are worth indexing even when they never appear in the body.
    const pathTerms = new Set(tokenize(file.rel.replace(/[/\\.]/g, ' ')))

    for (const [term, tf] of counts) {
      let list = postings.get(term)
      if (!list) postings.set(term, (list = new Map()))
      list.set(idx, tf)
    }
    for (const term of pathTerms) {
      let list = postings.get(term)
      if (!list) postings.set(term, (list = new Map()))
      if (!list.has(idx)) list.set(idx, 1)
    }

    const rel = file.rel
    const base = rel.split('/').pop() || rel
    meta.push({
      idx,
      path: file.path,
      rel,
      base,
      baseLower: base.toLowerCase(),
      relLower: rel.toLowerCase(),
      depth: rel.split('/').length - 1,
      length: terms.length || 1,
      pathTerms,
      size: file.size ?? file.text.length,
    })
  })

  return { files: meta, texts: files.map((f) => f.text), postings, count: files.length }
}

const ENTRY_NAMES = /^(index|main|app|mod|lib|__init__|readme|package|cargo|setup|server|routes?)\b/i

function pathSignals(file, queryTerms, rawQuery) {
  let score = 0
  const q = rawQuery.toLowerCase()

  // A literal filename in the question is the strongest signal there is.
  if (file.baseLower.length > 2 && q.includes(file.baseLower)) score += 60
  else if (q.includes(file.relLower)) score += 60
  else {
    const stem = file.baseLower.replace(/\.[^.]+$/, '')
    // Substring test first: it rules out nearly every file without the cost of
    // compiling a regex per file per query.
    if (stem.length > 2 && q.includes(stem) && new RegExp(`\\b${escapeRe(stem)}\\b`).test(q)) {
      score += 34
    }
  }

  for (const term of queryTerms) {
    if (file.pathTerms.has(term)) score += 6
  }

  if (ENTRY_NAMES.test(file.base)) score += 2.5
  score += Math.max(0, 3 - file.depth * 0.6)
  return score
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function parseQueryTerms(query) {
  const terms = tokenize(query)
  const seen = new Map()
  for (const t of terms) {
    if (STOPWORDS.has(t)) continue
    seen.set(t, (seen.get(t) || 0) + 1)
  }
  return [...seen.keys()]
}

/**
 * Ranks project files against a question.
 * Returns [{ file, score }], best first.
 */
export function rankFiles(index, query, { limit = 40 } = {}) {
  const terms = parseQueryTerms(query)
  if (!index || index.count === 0) return []

  const scores = new Float64Array(index.count)
  const N = index.count

  if (terms.length) {
    for (const term of terms) {
      const list = index.postings.get(term)
      if (!list || list.size === 0) continue
      // Terms that appear nearly everywhere carry almost no information.
      const idf = Math.log(1 + N / list.size)
      if (idf <= 0.15) continue
      for (const [idx, tf] of list) {
        const file = index.files[idx]
        const norm = 1 + Math.log(1 + file.length / 400)
        scores[idx] += (idf * (1 + Math.log(tf))) / norm
      }
    }
  }

  const ranked = []
  for (let i = 0; i < N; i++) {
    const file = index.files[i]
    const total = scores[i] + pathSignals(file, terms, query)
    if (total > 0.4) ranked.push({ file, score: total })
  }
  ranked.sort((a, b) => b.score - a.score)

  // Definition sites are expensive to look for, so only check real contenders.
  const head = ranked.slice(0, Math.max(limit, 24))
  if (terms.length) {
    const defRe = new RegExp(
      `(?:${DEFINITION_KEYWORDS})\\s+(${terms.map(escapeRe).join('|')})\\b`,
      'i',
    )
    for (const item of head) {
      const text = index.texts[item.file.idx]
      if (defRe.test(text)) item.score += 14
    }
    head.sort((a, b) => b.score - a.score)
  }

  return head.slice(0, limit)
}

/**
 * Chooses which files actually fit the budget.
 * `pinned` are paths the user selected by hand; they win over ranked results.
 */
export function selectContext({
  index,
  query,
  pinned = [],
  budgetTokens,
  maxFiles = 12,
  estimate,
}) {
  const included = []
  const excluded = []
  let used = 0

  const pinnedSet = new Set(pinned)
  const byPath = new Map(index.files.map((f) => [f.path, f]))

  const take = (file, reason) => {
    const text = index.texts[file.idx]
    // Cached on the index entry: estimating a token count means walking the
    // whole file, and the same forty candidates get re-costed on every message
    // sent against an index that has not changed. The index is rebuilt from
    // scratch whenever the folder is rescanned, so the cache cannot go stale.
    if (file.tokens === undefined) file.tokens = estimate(text) + estimate(file.rel) + 12
    const cost = file.tokens
    if (used + cost > budgetTokens) {
      excluded.push({ rel: file.rel, path: file.path, reason: 'budget' })
      return false
    }
    used += cost
    included.push({ rel: file.rel, path: file.path, text, tokens: cost, reason })
    return true
  }

  for (const path of pinnedSet) {
    const file = byPath.get(path)
    if (file) take(file, 'selected')
  }

  if (query.trim()) {
    const ranked = rankFiles(index, query, { limit: 40 })
    for (const { file } of ranked) {
      if (included.length >= maxFiles) {
        excluded.push({ rel: file.rel, path: file.path, reason: 'limit' })
        continue
      }
      if (pinnedSet.has(file.path)) continue
      take(file, 'matched')
    }
  }

  return { included, excluded, usedTokens: used }
}
