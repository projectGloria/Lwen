import { memo, useEffect, useRef, useState } from 'react'
import { Check, Copy } from '../Icons'
import { ensureLanguage, prismTheme, SyntaxHighlighter } from './prismTheme'

/**
 * `pre` with the streaming caret parked at the end of the highlighted text.
 * The caret has to be a child of `pre`, after the `code`: `code` is inline, so
 * a following span lands right after the last token rather than on a new line.
 */
const CaretPre = ({ children, ...rest }) => (
  <pre {...rest}>
    {children}
    <span className="caret code-caret" />
  </pre>
)

function CodeBlockBase({ language, value, title, caret = false }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef(null)
  const key = (language || '').toLowerCase()
  const known = ensureLanguage(key)

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="codeblock">
      <div className="codeblock-head">
        <span className="lang">{title || key || 'text'}</span>
        <button className={`copy-btn${copied ? ' done' : ''}`} onClick={copy} title="Copy code">
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <SyntaxHighlighter
        language={known ? key : 'text'}
        style={prismTheme}
        PreTag={caret ? CaretPre : 'pre'}
      >
        {value}
      </SyntaxHighlighter>
    </div>
  )
}

export const CodeBlock = memo(CodeBlockBase)
