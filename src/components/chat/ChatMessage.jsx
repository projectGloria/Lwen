import { memo, useEffect, useRef, useState } from 'react'
import { Markdown } from './Markdown'
import {
  Check, Copy, FileIcon, Layers, Mark, Refresh, Warn,
} from '../Icons'
import { formatBytes } from '../../lib/format'

function ContextUsed({ contextUsed, onOpenFile }) {
  const files = contextUsed?.files ?? []
  const excluded = contextUsed?.excluded ?? []
  if (!files.length && !excluded.length) return null

  return (
    <div className="ctx-used">
      <span className="lbl">
        <Layers size={12} /> Context used:
      </span>
      {files.map((f) => (
        <button
          key={f.path}
          className="ctx-chip"
          onClick={() => onOpenFile?.(f)}
          title={`${f.rel}${f.reason === 'selected' ? ' — selected by you' : ''}`}
        >
          <FileIcon size={11} />
          <span>{f.rel}</span>
        </button>
      ))}
      {!files.length && <span className="ctx-chip muted">conversation only</span>}
      {excluded.length > 0 && (
        <span className="ctx-chip muted" title={excluded.map((e) => e.rel).join('\n')}>
          <span>+{excluded.length} left out</span>
        </span>
      )}
    </div>
  )
}

function Thinking({ text }) {
  const [open, setOpen] = useState(false)
  if (!text?.trim()) return null
  return (
    <div className="think">
      <button className="think-head" onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide reasoning' : 'Show reasoning'}
      </button>
      {open && <div>{text}</div>}
    </div>
  )
}

function UserMessage({ message, anchorRef }) {
  return (
    <div className="msg user" ref={anchorRef}>
      {message.attachments?.length > 0 && (
        <div className="uatt">
          {message.attachments.map((a, i) => (
            <span className="ap" key={`${a.name}-${i}`} title={`${a.name} · ${formatBytes(a.bytes)}`}>
              <FileIcon size={11} />
              {a.name}
            </span>
          ))}
        </div>
      )}
      {message.content}
    </div>
  )
}

function AssistantMessage({ message, onRegenerate, onOpenFile, canRegenerate }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable */
    }
  }

  const waiting = message.streaming && !message.content && !message.thinking
  const tps = message.stats?.tps

  return (
    <div className="msg bot">
      <span className="bot-ava">
        <Mark size={22} width={2} />
      </span>
      <div className="bot-body">
        {waiting ? (
          <span className="typing" aria-label="Waiting for the model">
            <i />
            <i />
            <i />
          </span>
        ) : (
          <>
            <Thinking text={message.thinking} />
            {message.content && <Markdown caret={message.streaming}>{message.content}</Markdown>}
          </>
        )}

        {message.error && (
          <div className="msg-err" style={{ marginTop: message.content ? 12 : 0 }}>
            <b>That didn’t go through.</b> {message.error}
          </div>
        )}

        {message.stopped && !message.error && (
          <div className="ctx-used" style={{ borderTop: 'none', paddingTop: 4 }}>
            <span className="lbl">Stopped.</span>
          </div>
        )}

        {!message.streaming && <ContextUsed contextUsed={message.contextUsed} onOpenFile={onOpenFile} />}

        {!message.streaming && message.warnings?.length > 0 && (
          <div className="ctx-used">
            {message.warnings.map((w, i) => (
              <span className="ctx-chip muted" key={i}>
                <Warn size={11} />
                <span title={w.text}>{w.text}</span>
              </span>
            ))}
          </div>
        )}

        {!message.streaming && (message.content || message.error) && (
          <div className="msg-tools">
            {message.content && (
              <button className="msg-tool" onClick={copy}>
                {copied ? <Check size={11} /> : <Copy size={11} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
            {canRegenerate && (
              <button className="msg-tool" onClick={() => onRegenerate(message.id)}>
                <Refresh size={11} /> Retry
              </button>
            )}
            {tps > 0 && (
              <span className="msg-tool" style={{ cursor: 'default' }}>
                {tps.toFixed(1)} tok/s
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ChatMessageBase({ anchorRef, ...props }) {
  return props.message.role === 'user' ? (
    <UserMessage message={props.message} anchorRef={anchorRef} />
  ) : (
    <AssistantMessage {...props} />
  )
}

export const ChatMessage = memo(ChatMessageBase)
