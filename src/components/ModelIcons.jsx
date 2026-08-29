import { useEffect, useState } from 'react'
import { normalizeIcon } from '../lib/icons'

/**
 * Family marks for the models Ollama serves, so a list of `qwen3:8b`,
 * `llama3.2:3b`, `mistral:7b` reads at a glance instead of as a wall of text.
 *
 * The glyphs here are drawn for Lwen in each family's own colour — they are not
 * the vendors' trademarked logo files. To use the real artwork, drop an SVG
 * into `public/brands/` named after the family key below (`qwen.svg`,
 * `llama.svg`, …) and it is picked up automatically; see the README there.
 */

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }

/** Matched in order: the first pattern that hits a model name wins. */
const BRANDS = [
  {
    key: 'qwen',
    label: 'Qwen',
    match: /^(qwen|qwq|qvq)/i,
    color: '#7C68F5',
    glyph: (
      <g {...S}>
        <path d="M12 3.4 19.4 7.7v8.6L12 20.6 4.6 16.3V7.7z" />
        <circle cx="12" cy="12" r="3.4" />
        <path d="M14.4 14.4 17.3 17" />
      </g>
    ),
  },
  {
    key: 'llama',
    label: 'Llama',
    match: /^(llama|codellama|llava|tinyllama|llama-guard)/i,
    color: '#4E86F7',
    glyph: (
      <g {...S}>
        <path d="M12 12c0-2.6 1.7-4.6 3.8-4.6S19.6 9.4 19.6 12s-1.7 4.6-3.8 4.6S12 14.6 12 12z" />
        <path d="M12 12c0 2.6-1.7 4.6-3.8 4.6S4.4 14.6 4.4 12s1.7-4.6 3.8-4.6S12 9.4 12 12z" />
      </g>
    ),
  },
  {
    key: 'mistral',
    label: 'Mistral',
    match: /^(mistral|mixtral|codestral|ministral|magistral|devstral|pixtral)/i,
    color: '#FF7000',
    glyph: (
      <g fill="currentColor">
        <rect x="3.6" y="5" width="3.6" height="3.6" rx=".7" />
        <rect x="16.8" y="5" width="3.6" height="3.6" rx=".7" opacity=".75" />
        <rect x="3.6" y="10.2" width="3.6" height="3.6" rx=".7" opacity=".75" />
        <rect x="10.2" y="10.2" width="3.6" height="3.6" rx=".7" />
        <rect x="16.8" y="10.2" width="3.6" height="3.6" rx=".7" opacity=".55" />
        <rect x="3.6" y="15.4" width="3.6" height="3.6" rx=".7" opacity=".55" />
        <rect x="16.8" y="15.4" width="3.6" height="3.6" rx=".7" opacity=".35" />
      </g>
    ),
  },
  {
    key: 'gemma',
    label: 'Google',
    match: /^(gemma|gemini|codegemma|shieldgemma|paligemma|medgemma|t5gemma)/i,
    color: '#4285F4',
    glyph: (
      <path
        fill="currentColor"
        d="M12 2.6c.5 3.9 2.9 6.4 6.9 7.2v4.4c-4 .8-6.4 3.3-6.9 7.2-.5-3.9-2.9-6.4-6.9-7.2V9.8c4-.8 6.4-3.3 6.9-7.2z"
      />
    ),
  },
  {
    key: 'deepseek',
    label: 'DeepSeek',
    match: /^(deepseek|janus)/i,
    color: '#4D6BFE',
    glyph: (
      <g {...S}>
        <path d="M3.4 9.6c4 0 5.4 1.6 6.8 3.5 1.4 1.9 3.1 3.6 6.6 3.6 1.9 0 3.2-.7 3.8-1.6" />
        <path d="M20.6 6.4c-2 1.5-4 1.4-5.6.4" />
        <circle cx="7.4" cy="6.6" r="1.15" fill="currentColor" stroke="none" />
      </g>
    ),
  },
  {
    key: 'phi',
    label: 'Microsoft',
    match: /^(phi|orca|wizardlm|florence)/i,
    color: '#3FA9F5',
    glyph: (
      <g fill="currentColor">
        <rect x="4" y="4" width="7" height="7" rx=".8" />
        <rect x="13" y="4" width="7" height="7" rx=".8" opacity=".72" />
        <rect x="4" y="13" width="7" height="7" rx=".8" opacity=".72" />
        <rect x="13" y="13" width="7" height="7" rx=".8" opacity=".48" />
      </g>
    ),
  },
  {
    key: 'granite',
    label: 'IBM Granite',
    match: /^(granite|ibm)/i,
    color: '#5A9BFF',
    glyph: (
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <line x1="4" y1="7" x2="20" y2="7" />
        <line x1="6.5" y1="12" x2="17.5" y2="12" />
        <line x1="4" y1="17" x2="20" y2="17" />
      </g>
    ),
  },
  {
    key: 'command-r',
    label: 'Cohere',
    match: /^(command|aya|c4ai)/i,
    color: '#57B39C',
    glyph: (
      <g {...S}>
        <circle cx="12" cy="12" r="8.2" />
        <path d="M15.6 9.1a4.6 4.6 0 1 0 0 5.8" />
      </g>
    ),
  },
  {
    key: 'starcoder',
    label: 'BigCode',
    match: /^(starcoder|starling|stablecode|santacoder)/i,
    color: '#E0A93C',
    glyph: (
      <path
        fill="currentColor"
        d="m12 3 2.5 5.6 6.1.6-4.6 4.1 1.3 6-5.3-3.1-5.3 3.1 1.3-6L3.4 9.2l6.1-.6z"
      />
    ),
  },
  {
    key: 'glm',
    label: 'Zhipu GLM',
    match: /^(glm|chatglm|codegeex)/i,
    color: '#3E7BFA',
    glyph: (
      <g {...S}>
        <path d="M12 3.6 20 8v8l-8 4.4L4 16V8z" />
        <path d="M12 8.4 16.2 10.8v4.4L12 17.6l-4.2-2.4v-4.4z" />
      </g>
    ),
  },
  {
    key: 'yi',
    label: '01.AI',
    match: /^(yi|01-ai)[:.\-]?/i,
    color: '#00B894',
    glyph: (
      <g {...S}>
        <rect x="4.2" y="4.2" width="15.6" height="15.6" rx="4.4" />
        <line x1="12" y1="8.6" x2="12" y2="15.4" />
      </g>
    ),
  },
  {
    key: 'smollm',
    label: 'Hugging Face',
    match: /^(smollm|hf\.co|huggingface|zephyr)/i,
    color: '#F5C518',
    glyph: (
      <g {...S}>
        <circle cx="12" cy="12" r="8.2" />
        <path d="M8.7 13.6a4 4 0 0 0 6.6 0" />
        <line x1="9.2" y1="10" x2="9.3" y2="10" strokeWidth="2.4" />
        <line x1="14.8" y1="10" x2="14.9" y2="10" strokeWidth="2.4" />
      </g>
    ),
  },
  {
    key: 'embed',
    label: 'Embedding',
    match: /(embed|bge|minilm|e5-|gte-)/i,
    color: '#9A8FB8',
    glyph: (
      <g {...S}>
        <circle cx="6.4" cy="8.2" r="2.1" />
        <circle cx="17.6" cy="7.4" r="2.1" />
        <circle cx="13" cy="17.4" r="2.1" />
        <path d="M8.4 9.2 11.4 15.6M8.2 7.6l7.4-.1M16.6 9.4 14.2 15.4" />
      </g>
    ),
  },
]

/** The Ollama runtime itself, used for server status rather than a model. */
export const OLLAMA_BRAND = {
  key: 'ollama',
  label: 'Ollama',
  color: '#EDE9E3',
  glyph: (
    <g {...S}>
      <path d="M7.4 9.4c-.7-1.6-.5-4.4.6-5 1.1-.6 2.3 1 2.6 2.6" />
      <path d="M16.6 9.4c.7-1.6.5-4.4-.6-5-1.1-.6-2.3 1-2.6 2.6" />
      <path d="M12 6.6c3.1 0 5.6 2.5 5.6 5.2 0 1.2 1 2 1 3.6 0 2-2.6 3.4-6.6 3.4s-6.6-1.4-6.6-3.4c0-1.6 1-2.4 1-3.6C6.4 9.1 8.9 6.6 12 6.6z" />
      <path d="M10.6 15.4a2 2 0 0 1 2.8 0" />
    </g>
  ),
}

const fallbackColors = ['#D97757', '#C9A227', '#7FA87F', '#6E93B8', '#A981C4', '#5FA6A0']

/** Everything else gets a stable colour and its first letter. */
function fallbackBrand(name) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const color = fallbackColors[h % fallbackColors.length]
  const letter = (name.match(/[a-z0-9]/i)?.[0] ?? '?').toUpperCase()
  return {
    key: null,
    label: name.split(':')[0],
    color,
    glyph: (
      <text
        x="12"
        y="16.4"
        textAnchor="middle"
        fontSize="12.5"
        fontWeight="600"
        fontFamily="Inter, sans-serif"
        fill="currentColor"
      >
        {letter}
      </text>
    ),
  }
}

export function brandFor(model) {
  const name = (model || '').trim()
  if (!name) return fallbackBrand('?')
  // Ollama namespaces community models as `user/model:tag`.
  const bare = name.includes('/') ? name.slice(name.lastIndexOf('/') + 1) : name
  return BRANDS.find((b) => b.match.test(bare)) ?? fallbackBrand(bare)
}

/**
 * One probe per family per session for a real logo in `public/brands`. The
 * content type is checked because a dev server answers unknown paths with
 * `index.html` rather than a 404.
 */
const probes = new Map()

function probeArtwork(key) {
  if (!probes.has(key)) {
    probes.set(
      key,
      fetch(`/brands/${key}.svg`)
        .then((r) => r.ok && /svg|image/i.test(r.headers.get('content-type') || ''))
        .catch(() => false),
    )
  }
  return probes.get(key)
}

export function BrandMark({ brand, size = 16, title }) {
  const [artwork, setArtwork] = useState(false)

  useEffect(() => {
    if (!brand.key) return undefined
    let live = true
    probeArtwork(brand.key).then((ok) => live && setArtwork(ok))
    return () => {
      live = false
    }
  }, [brand.key])

  if (artwork) {
    return (
      <img
        className="brand-mark"
        src={`/brands/${brand.key}.svg`}
        alt=""
        width={size}
        height={size}
        title={title ?? brand.label}
      />
    )
  }

  return (
    <svg
      className="brand-mark"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ color: brand.color }}
      aria-hidden="true"
    >
      {title && <title>{title}</title>}
      {brand.glyph}
    </svg>
  )
}

/**
 * `custom` is a user-assigned icon from `prefs.modelIcons`, which wins over the
 * family mark: the built-in glyphs guess a family from the model's name, and a
 * fine-tune or a local build often defeats that guess.
 */
export function ModelIcon({ model, size = 16, custom: stored = null }) {
  // Same normalisation as `IconGlyph`: a mark picked before the palette carried
  // its variation selectors must still render as colour emoji.
  const custom = normalizeIcon(stored)
  if (custom?.kind === 'image' && custom.value) {
    return (
      <img
        className="brand-mark"
        src={custom.value}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        title={model}
      />
    )
  }
  if (custom?.kind === 'emoji' && custom.value) {
    return (
      <span
        className="brand-mark icon-emoji"
        style={{ fontSize: Math.round(size * 0.9), lineHeight: `${size}px`, width: size, height: size }}
        title={model}
        aria-hidden="true"
      >
        {custom.value}
      </span>
    )
  }
  return <BrandMark brand={brandFor(model)} size={size} title={model} />
}

export function OllamaIcon({ size = 16 }) {
  return <BrandMark brand={OLLAMA_BRAND} size={size} title="Ollama" />
}
