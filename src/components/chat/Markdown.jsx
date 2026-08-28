import { memo, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { openUrl } from '@tauri-apps/plugin-opener'
import { CodeBlock } from './CodeBlock'

const SAFE_LINK = /^(https?:|mailto:)/i

// Elements the caret must not be nested inside: table parts would swallow it
// into a cell, and `a` would underline it. Landing just outside any of these
// puts it in the same spot. `pre`/`code` are handled separately below.
const OPAQUE = new Set(['pre', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'img', 'br', 'a'])

/** The `code` element a fenced block renders as, if `node` is that block. */
function fencedCode(node) {
  if (node?.tagName === 'code') return node
  if (node?.tagName !== 'pre') return null
  return (node.children ?? []).find((k) => k.type === 'element' && k.tagName === 'code') ?? null
}

// Park the streaming caret on the deepest trailing node so it sits right after
// the last character instead of dropping to a line of its own below the block.
//
// A code block is the exception: nothing can be appended to it here, because the
// highlighter re-renders its contents from a string. Marking it instead lets
// `CodeBlock` put the caret inside the `pre`, where the last token is — before
// this, a reply ending in code left the caret stranded on its own line
// underneath the block.
function rehypeCaret() {
  return (tree) => {
    let node = tree
    for (;;) {
      const kids = node.children ?? []
      let next = null
      for (let i = kids.length - 1; i >= 0; i--) {
        const kid = kids[i]
        if (kid.type === 'element') next = kid
        else if (kid.type !== 'text' || !kid.value.trim()) continue
        break
      }
      if (!next) break
      if (OPAQUE.has(next.tagName)) {
        const code = fencedCode(next)
        if (code) {
          code.properties = { ...(code.properties ?? {}), 'data-caret': 'true' }
          return
        }
        break
      }
      node = next
    }
    node.children = [
      ...(node.children ?? []),
      { type: 'element', tagName: 'span', properties: { className: ['caret'] }, children: [] },
    ]
  }
}

const components = {
  // `pre` passes through; `code` decides between inline and block.
  pre: ({ children }) => children,
  code({ className, children, ...props }) {
    const text = String(children ?? '').replace(/\n$/, '')
    const match = /language-([\w+-]+)/.exec(className || '')
    // Which prop the caret marker arrives as depends on how the JSX runtime
    // maps `data-*` attributes, so accept either spelling.
    const { 'data-caret': dashed, dataCaret: camel, ...rest } = props
    const caret = dashed !== undefined || camel !== undefined
    if (!match && !text.includes('\n')) {
      return (
        <code className={className} {...rest}>
          {children}
          {caret && <span className="caret" />}
        </code>
      )
    }
    return <CodeBlock language={match?.[1] ?? ''} value={text} caret={caret} />
  },
  table: ({ children }) => (
    <div className="tablewrap">
      <table>{children}</table>
    </div>
  ),
  a({ href, children }) {
    if (!href || !SAFE_LINK.test(href)) return <span>{children}</span>
    return (
      <a
        href={href}
        onClick={(e) => {
          // Keep navigation out of the webview: hand the URL to the OS.
          e.preventDefault()
          openUrl(href).catch(() => {})
        }}
      >
        {children}
      </a>
    )
  },
}

function MarkdownBase({ children, caret }) {
  const remarkPlugins = useMemo(() => [remarkGfm], [])
  const rehypePlugins = useMemo(() => (caret ? [rehypeCaret] : []), [caret])
  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={components}
      skipHtml
    >
      {children}
    </ReactMarkdown>
  )
}

export const Markdown = memo(MarkdownBase)
