import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ensureLanguage, prismTheme, SyntaxHighlighter } from './prismTheme'
import { Close, Pin, Spinner, Warn } from '../Icons'
import { backend } from '../../lib/backend'
import { formatBytes, langFromPath } from '../../lib/format'

const MAX_PREVIEW = 400_000

export function FileViewer({ file, pinned, onTogglePin, onClose }) {
  const [state, setState] = useState({ loading: true, text: '', error: null })

  useEffect(() => {
    let cancelled = false
    setState({ loading: true, text: '', error: null })
    backend
      .readTextFile(file.path)
      .then((text) => {
        if (cancelled) return
        setState({
          loading: false,
          text: text.length > MAX_PREVIEW ? `${text.slice(0, MAX_PREVIEW)}\n\n… truncated` : text,
          error: null,
        })
      })
      .catch((e) => !cancelled && setState({ loading: false, text: '', error: String(e) }))
    return () => {
      cancelled = true
    }
  }, [file.path])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const isPinned = pinned.has(file.path)

  return createPortal(
    <div className="viewer" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="viewer-box">
        <div className="viewer-head">
          <span className="grow">
            <div className="vname">{file.name ?? file.rel}</div>
            <div className="vpath">
              {file.rel}
              {file.size ? ` · ${formatBytes(file.size)}` : ''}
            </div>
          </span>
          <button
            className={`btn-ghost${isPinned ? ' danger' : ''}`}
            onClick={() => onTogglePin(file.path)}
            title="Always include this file as context"
          >
            <Pin size={13} />
            {isPinned ? 'Unpin' : 'Pin as context'}
          </button>
          <button className="icon-btn" onClick={onClose} title="Close" aria-label="Close">
            <Close size={14} />
          </button>
        </div>

        {state.loading ? (
          <div className="viewer-empty">
            <Spinner size={18} />
            Loading…
          </div>
        ) : state.error ? (
          <div className="viewer-empty">
            <Warn size={18} />
            {state.error}
          </div>
        ) : (
          <div className="viewer-body">
            <SyntaxHighlighter
              language={ensureLanguage(langFromPath(file.rel ?? file.path)) ? langFromPath(file.rel ?? file.path) : 'text'}
              style={prismTheme}
              PreTag="pre"
            >
              {state.text}
            </SyntaxHighlighter>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
