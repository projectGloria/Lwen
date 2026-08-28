export function formatBytes(n) {
  if (!n) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1048576).toFixed(1)} MB`
  return `${(n / 1073741824).toFixed(1)} GB`
}

export function relativeTime(ts) {
  if (!ts) return 'never'
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 1) return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'Working late'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

/** `qwen2.5-coder:7b` -> `qwen2.5-coder` + `7b`, for compact display. */
export function splitModelName(name) {
  const i = name.lastIndexOf(':')
  if (i === -1) return { base: name, tag: '' }
  return { base: name.slice(0, i), tag: name.slice(i + 1) }
}

export function titleFromText(text, max = 42) {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return 'New conversation'
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean
}

export function langFromPath(path) {
  const ext = (path.split('.').pop() || '').toLowerCase()
  const map = {
    js: 'javascript', jsx: 'jsx', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'tsx', py: 'python', rb: 'ruby', rs: 'rust',
    go: 'go', java: 'java', kt: 'kotlin', cs: 'csharp', c: 'c', h: 'c',
    cpp: 'cpp', cc: 'cpp', hpp: 'cpp', php: 'php', swift: 'swift',
    sh: 'bash', bash: 'bash', zsh: 'bash', ps1: 'powershell', bat: 'batch',
    html: 'markup', htm: 'markup', xml: 'markup', svg: 'markup', vue: 'markup',
    css: 'css', scss: 'scss', less: 'less', json: 'json', jsonc: 'json',
    yaml: 'yaml', yml: 'yaml', toml: 'toml', sql: 'sql', md: 'markdown',
    mdx: 'markdown', graphql: 'graphql', gql: 'graphql', lua: 'lua', r: 'r',
    dart: 'dart', scala: 'scala', ini: 'ini', conf: 'ini', env: 'bash',
    tf: 'hcl', proto: 'protobuf', csv: 'csv', txt: 'text',
  }
  return map[ext] || 'text'
}

/** `9015000` -> `2h 30m`. Compact enough for a sidebar, exact enough to trust. */
export function formatDuration(ms, { short = false } = {}) {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (short) {
    // A running clock reads better fixed-width than as prose.
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`
  }
  if (h >= 24) {
    const d = Math.floor(h / 24)
    return `${d}d ${h % 24}h`
  }
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${s}s`
}

export function formatCount(n) {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}
