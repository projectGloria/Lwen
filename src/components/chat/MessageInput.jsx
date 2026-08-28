import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AttachmentRow } from './FileAttachment'
import { ModelSelector } from './ModelSelector'
import { CommandPalette } from './CommandPalette'
import { Info, Paperclip, Send, Slash, Square, Warn } from '../Icons'
import { formatTokens } from '../../lib/tokens'
import { expandPrompt, parseInvocation, searchCommands } from '../../lib/commands'

const MAX_HEIGHT = 170

export function MessageInput({
  value,
  onChange,
  attachments,
  onRemoveAttachment,
  onPickFiles,
  onSend,
  onStop,
  streaming,
  disabled,
  disabledReason,
  budget,
  focusKey,
  customCommands = [],
  onRunCommand,
  onManageCommands,
  modelPickerKey = 0,
}) {
  const ref = useRef(null)
  const [active, setActive] = useState(0)
  // Dismissed with Escape, so a message that genuinely starts with a slash can
  // still be typed and sent.
  const [dismissed, setDismissed] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }, [value])

  useEffect(() => {
    if (!disabled) ref.current?.focus()
  }, [focusKey, disabled])

  /* -------------------------------------------------------------- commands */

  const invocation = useMemo(() => parseInvocation(value), [value])
  // The list is only offered while the command word itself is being typed; once
  // there is an argument after it, the composer is back to being a text box.
  const browsing = !!invocation && !invocation.rest && !dismissed
  const matches = useMemo(
    () => (browsing ? searchCommands(invocation.name, customCommands) : []),
    [browsing, invocation, customCommands],
  )

  useEffect(() => {
    setActive(0)
  }, [invocation?.name])

  useEffect(() => {
    if (!invocation) setDismissed(false)
  }, [invocation])

  const pick = (command) => {
    const rest = invocation?.rest ?? ''
    if (command.kind === 'prompt') {
      // Saved prompts land in the composer to be read and edited, not sent.
      onChange(expandPrompt(command, rest))
      requestAnimationFrame(() => ref.current?.focus())
      return
    }
    onChange('')
    onRunCommand?.(command, rest)
  }

  /* ---------------------------------------------------------------- typing */

  const extracting = attachments.some((a) => a.status === 'loading')
  const ready = value.trim().length > 0 && !streaming && !disabled && !extracting
  const overflowing = budget?.over

  const submit = () => {
    if (!ready) return
    // Enter on `/name` with no list showing still runs the command rather than
    // sending "/name" to the model, which is never what was meant.
    const exact = invocation && !invocation.rest
      ? searchCommands(invocation.name, customCommands).find((c) => c.name === invocation.name)
      : null
    if (exact) {
      pick(exact)
      return
    }
    onSend()
  }

  const onKeyDown = (e) => {
    if (browsing && matches.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((i) => (i + 1) % matches.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((i) => (i - 1 + matches.length) % matches.length)
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        pick(matches[active])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setDismissed(true)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="composer-zone">
      <div className="composer">
        {browsing && (
          <CommandPalette
            items={matches}
            active={active}
            query={invocation.name}
            onPick={pick}
            onManage={onManageCommands}
          />
        )}

        <AttachmentRow items={attachments} onRemove={onRemoveAttachment} />

        {overflowing && (
          <div className="warn-strip">
            <Warn size={13} />
            <span>
              This message is about {formatTokens(budget.total)} tokens, over the{' '}
              {formatTokens(budget.limit)} this model can take. Ollama will drop the oldest part of
              the prompt — remove an attachment, or raise the context window in Configuration.
            </span>
          </div>
        )}

        {disabled && disabledReason && !overflowing && (
          <div className="warn-strip info">
            <Info size={13} />
            <span>{disabledReason}</span>
          </div>
        )}

        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={disabled ? 'Waiting for Ollama…' : 'Message Lwen…  /  for commands'}
          spellCheck="false"
        />

        <div className="composer-bar">
          <button
            className="icon-btn"
            onClick={onPickFiles}
            disabled={streaming}
            title="Attach files"
            aria-label="Attach files"
          >
            <Paperclip size={16} />
          </button>

          <button
            className={`icon-btn${browsing ? ' on' : ''}`}
            onClick={() => {
              onChange(value.startsWith('/') ? value : `/${value}`)
              setDismissed(false)
              requestAnimationFrame(() => ref.current?.focus())
            }}
            title="Slash commands"
            aria-label="Slash commands"
          >
            <Slash size={16} />
          </button>

          <ModelSelector openKey={modelPickerKey} />

          <span className={`charcount${overflowing ? ' over' : ''}`}>
            {budget?.attachTokens > 0
              ? `~${formatTokens(budget.total)} tokens`
              : value.length
                ? `${value.length} chars`
                : ''}
          </span>

          {streaming ? (
            <button className="send-btn stop" onClick={onStop} title="Stop generating">
              <Square size={13} />
            </button>
          ) : (
            <button
              className={`send-btn${ready ? ' ready' : ''}`}
              onClick={submit}
              disabled={!ready}
              title="Send"
              aria-label="Send"
            >
              <Send size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
