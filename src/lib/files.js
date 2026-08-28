import { backend } from './backend'

const CODE_EXTS = new Set([
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'java', 'c', 'h', 'cpp', 'cc', 'hpp', 'cs', 'go',
  'rs', 'rb', 'php', 'swift', 'kt', 'scala', 'lua', 'dart', 'r', 'pl', 'html', 'htm', 'vue',
  'svelte', 'css', 'scss', 'less', 'json', 'jsonc', 'yaml', 'yml', 'toml', 'xml', 'md', 'mdx',
  'markdown', 'sql', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'ini', 'cfg', 'conf', 'env', 'graphql',
  'proto', 'tf', 'rst', 'log',
])
const PLAIN_EXTS = new Set(['txt'])
const SHEET_EXTS = new Set(['csv', 'tsv'])
const DOC_EXTS = new Set(['pdf', 'docx'])

const MAX_FILE_BYTES = 24 * 1024 * 1024
const MAX_CSV_ROWS = 400

export function extensionOf(name) {
  const base = name.split(/[\\/]/).pop() || name
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

export function baseName(path) {
  return path.split(/[\\/]/).pop() || path
}

export function fileKind(name) {
  const ext = extensionOf(name)
  if (DOC_EXTS.has(ext)) return ext
  if (SHEET_EXTS.has(ext)) return 'csv'
  if (CODE_EXTS.has(ext)) return 'code'
  if (PLAIN_EXTS.has(ext)) return 'text'
  return null
}

export function isSupported(name) {
  return fileKind(name) !== null
}

export const SUPPORTED_SUMMARY =
  'Code and text files, .txt, .md, .json, .csv, .pdf and .docx.'

function decodeText(buffer) {
  const bytes = new Uint8Array(buffer)
  // Strip a UTF-8 BOM so it does not surface as a stray character.
  const start = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0
  return new TextDecoder('utf-8').decode(bytes.subarray(start))
}

async function extractPdf(buffer, name) {
  const [pdfjs, workerUrl] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url').then((m) => m.default),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  let doc
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise
  } catch (e) {
    if (/password/i.test(e?.message || '')) {
      throw new Error(`${name} is password-protected.`)
    }
    throw new Error(`${name} could not be opened as a PDF.`)
  }

  const pages = []
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      let line = ''
      const lines = []
      let lastY = null
      for (const item of content.items) {
        if (!('str' in item)) continue
        const y = item.transform?.[5]
        if (lastY !== null && Math.abs(y - lastY) > 2) {
          if (line.trim()) lines.push(line.trim())
          line = ''
        }
        line += item.str
        if (item.hasEOL) {
          if (line.trim()) lines.push(line.trim())
          line = ''
        }
        lastY = y
      }
      if (line.trim()) lines.push(line.trim())
      pages.push(lines.join('\n'))
      page.cleanup()
    }
  } finally {
    await doc.destroy()
  }

  const text = pages
    .map((p, i) => (pages.length > 1 ? `--- page ${i + 1} ---\n${p}` : p))
    .join('\n\n')
    .trim()

  if (text.replace(/--- page \d+ ---/g, '').trim().length < doc.numPages * 8) {
    throw new Error(
      `${name} has no extractable text — it looks like a scanned document. Lwen does not run OCR.`,
    )
  }
  return text
}

async function extractDocx(buffer, name) {
  const mod = await import('mammoth/mammoth.browser')
  const mammoth = mod.default ?? mod
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  const text = (result?.value ?? '').trim()
  if (!text) throw new Error(`${name} contained no readable text.`)
  return text
}

async function extractCsv(buffer, name) {
  const Papa = (await import('papaparse')).default
  const raw = decodeText(buffer)
  const parsed = Papa.parse(raw.trim(), { skipEmptyLines: true })
  const rows = parsed.data.filter((r) => Array.isArray(r) && r.some((c) => String(c).trim()))
  if (!rows.length) throw new Error(`${name} appears to be empty.`)

  const shown = rows.slice(0, MAX_CSV_ROWS)
  const cols = Math.max(...shown.map((r) => r.length))
  const widths = Array.from({ length: cols }, (_, c) =>
    Math.min(48, Math.max(...shown.map((r) => String(r[c] ?? '').length), 3)),
  )
  const line = (r) =>
    '| ' +
    Array.from({ length: cols }, (_, c) => {
      const cell = String(r[c] ?? '').replace(/\s+/g, ' ')
      const clipped = cell.length > widths[c] ? `${cell.slice(0, widths[c] - 1)}…` : cell
      return clipped.padEnd(widths[c])
    }).join(' | ') +
    ' |'

  const out = [line(shown[0]), `| ${widths.map((w) => '-'.repeat(w)).join(' | ')} |`]
  for (const r of shown.slice(1)) out.push(line(r))
  if (rows.length > shown.length) {
    out.push('', `… ${rows.length - shown.length} further rows not shown.`)
  }
  return `${rows.length} rows × ${cols} columns\n\n${out.join('\n')}`
}

/**
 * Reads a file from disk and extracts plain text from it.
 * Returns { name, path, kind, text, bytes }.
 */
export async function extractFile(path) {
  const name = baseName(path)
  const kind = fileKind(name)
  if (!kind) {
    throw new Error(`Lwen cannot read ${name}. Supported: ${SUPPORTED_SUMMARY}`)
  }

  const buffer = await backend.readFileBytes(path)
  const bytes = buffer.byteLength ?? buffer.length ?? 0
  if (bytes === 0) throw new Error(`${name} is empty.`)
  if (bytes > MAX_FILE_BYTES) throw new Error(`${name} is larger than 24 MB.`)

  let text
  if (kind === 'pdf') text = await extractPdf(buffer, name)
  else if (kind === 'docx') text = await extractDocx(buffer, name)
  else if (kind === 'csv') text = await extractCsv(buffer, name)
  else {
    const probe = new Uint8Array(buffer).subarray(0, 8192)
    if (probe.includes(0)) throw new Error(`${name} is not a text file.`)
    text = decodeText(buffer)
  }

  if (!text.trim()) throw new Error(`${name} contained no readable text.`)
  return { name, path, kind, text, bytes }
}
