import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChatMessage } from './ChatMessage'
import { ChevronDown, Mark } from '../Icons'
import { greeting } from '../../lib/format'

const NEAR_BOTTOM = 80
/** Breathing room left above a pinned message. */
const TOP_GAP = 18
/** …and below the turn, so the composer never sits flush against the text. */
const BOTTOM_GAP = 28

const SUGGESTIONS = [
  { label: 'Explain this codebase', text: 'Give me an overview of how this project is structured.' },
  { label: 'Find the entry point', text: 'Where does execution start, and what happens first?' },
  { label: 'Review for bugs', text: 'Look through the code you have and point out likely bugs.' },
  { label: 'Write a test', text: 'Write a test for the most important function you can see.' },
]

const PLAIN_SUGGESTIONS = [
  { label: 'Draft an outline', text: 'Draft an outline for what I am working on.' },
  { label: 'Explain a concept', text: 'Explain a concept to me clearly, with an example.' },
  { label: 'Brainstorm ideas', text: 'Brainstorm ten unconventional ideas on a topic I give you.' },
  { label: 'Review my writing', text: 'I am going to paste some writing. Tell me what is weak about it.' },
]

/** How long a wheel/touch/key counts as the cause of the scroll it triggers. */
const GESTURE_MS = 700

export function MessageList({ chat, hasProject, onSuggest, onRegenerate, onOpenFile, streaming }) {
  const scroller = useRef(null)
  const column = useRef(null)
  const spacer = useRef(null)
  const anchor = useRef(null)

  const [atEnd, setAtEnd] = useState(true)

  // A pinned turn keeps its question at the top of the view while the answer
  // fills the space below it. Held in refs, not state: the spacer is resized on
  // every streamed frame, and re-rendering the whole thread for that would be
  // wasteful — and would fight the scroll position it is meant to hold still.
  const pinned = useRef(false)
  const follow = useRef(false)
  const wantAlign = useRef(false)
  const prevChat = useRef(null)
  const prevTurn = useRef(null)
  // Our own scrollTo fires scroll events too, so "the reader scrolled away" is
  // only believed when a real gesture happened just before it. `away` is the
  // conclusion that check reaches, and it has to persist: whether to start
  // following the tail is decided long after the wheel stopped turning.
  const away = useRef(false)
  const gesture = useRef(0)
  const gestureRecent = useCallback(() => performance.now() - gesture.current < GESTURE_MS, [])
  const markGesture = useCallback(() => {
    gesture.current = performance.now()
  }, [])

  const messages = chat?.messages ?? []
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  const anchorId = lastUser?.id ?? null
  // Changes exactly once per turn — a new question, or a regenerated answer.
  const afterAnchor = anchorId ? messages[messages.findIndex((m) => m.id === anchorId) + 1] : null
  const turnKey = `${anchorId ?? ''}>${afterAnchor?.id ?? ''}`

  /**
   * Sizes the tail spacer so the pinned question can sit at the very top even
   * when the answer below it is still one line long. As the answer grows the
   * spacer gives back exactly as much height as the text takes, which keeps
   * `scrollHeight` — and therefore the scroll position — perfectly still.
   */
  const measure = useCallback(() => {
    const el = scroller.current
    const pad = spacer.current
    const col = column.current
    if (!el || !pad || !col) return

    if (pinned.current && anchor.current) {
      const turnHeight = col.getBoundingClientRect().bottom - anchor.current.getBoundingClientRect().top
      // `turnHeight` already carries the column's bottom padding, so TOP_GAP is
      // the only room that still has to be reserved.
      const room = el.clientHeight - turnHeight - TOP_GAP
      if (room > 0) {
        pad.style.height = `${room}px`
      } else {
        // The answer has outgrown the viewport, so the question can no longer
        // stay pinned at the top. Hand over to following the tail — otherwise
        // the reply just grows on past the bottom edge and the view sits still.
        pinned.current = false
        pad.style.height = '0px'
        if (!away.current) follow.current = true
      }
    } else {
      pad.style.height = '0px'
    }

    // "At the end" means the last line of text is on screen — the tail spacer
    // below it is empty room, and being scrolled away from *that* is not worth
    // offering a jump button for.
    const below = col.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom
    setAtEnd(below < NEAR_BOTTOM)
  }, [])

  const alignTop = useCallback((behavior = 'smooth') => {
    const el = scroller.current
    const a = anchor.current
    if (!el || !a) return
    const offset = a.getBoundingClientRect().top - el.getBoundingClientRect().top
    el.scrollTo({ top: el.scrollTop + offset - TOP_GAP, behavior })
  }, [])

  /** Scrolls until the end of the text sits just above the composer. */
  const toEnd = useCallback((behavior = 'instant') => {
    const el = scroller.current
    const col = column.current
    if (!el) return
    if (!col) {
      el.scrollTo({ top: el.scrollHeight, behavior })
      return
    }
    const below = col.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom
    if (below > 0.5 || behavior !== 'instant') {
      el.scrollTo({ top: Math.max(0, el.scrollTop + below + BOTTOM_GAP), behavior })
    }
  }, [])

  // Opening a conversation shows its end; starting a turn pins that turn.
  useLayoutEffect(() => {
    const chatChanged = prevChat.current !== chat?.id
    prevChat.current = chat?.id
    if (chatChanged) {
      prevTurn.current = turnKey
      pinned.current = false
      follow.current = false
      wantAlign.current = false
      away.current = false
      gesture.current = 0
      measure()
      toEnd('instant')
      return
    }
    if (turnKey !== prevTurn.current) {
      prevTurn.current = turnKey
      // Only a turn with a reply under way is worth pinning.
      if (anchorId && afterAnchor) {
        pinned.current = true
        follow.current = false
        wantAlign.current = true
        // Asking a new question is a fresh start: whatever the reader was
        // looking at before, they are waiting on this answer now. The gesture
        // stamp goes too — Regenerate sits inside the scroller, and the click
        // that started this turn must not read as scrolling away from it.
        away.current = false
        gesture.current = 0
      }
    }
  }, [chat?.id, turnKey, anchorId, afterAnchor, measure, toEnd])

  // Runs after every render, so the spacer tracks the answer as it streams.
  useLayoutEffect(() => {
    measure()
    if (wantAlign.current) {
      wantAlign.current = false
      alignTop('smooth')
    } else if (follow.current) {
      toEnd('instant')
    }
  })

  useEffect(() => {
    const el = scroller.current
    const col = column.current
    if (!el || !col) return
    // The observer watches the message column only. The spacer is its sibling,
    // so resizing the spacer cannot feed back into another measurement.
    const ro = new ResizeObserver(() => {
      measure()
      if (follow.current) toEnd('instant')
    })
    ro.observe(col)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure, toEnd, chat?.id])

  const onScroll = useCallback(() => {
    const el = scroller.current
    const col = column.current
    if (!el || !col) return
    const end = col.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom < NEAR_BOTTOM
    setAtEnd(end)
    // Scrolling away by hand stops the view chasing the stream — but only when
    // it really was by hand. Coming back to the tail starts it again, so the
    // jump button and a flick of the wheel both end up in the same state.
    if (end) {
      away.current = false
      follow.current = !pinned.current
    } else if (gestureRecent()) {
      away.current = true
      follow.current = false
    }
  }, [gestureRecent])

  const jump = () => {
    pinned.current = false
    away.current = false
    follow.current = true
    toEnd('smooth')
  }

  if (!messages.length) {
    const chips = hasProject ? SUGGESTIONS : PLAIN_SUGGESTIONS
    return (
      <div className="messages" ref={scroller}>
        <div className="greet">
          <span className="mark">
            <Mark size={42} width={1.9} />
          </span>
          <h2>{greeting()}.</h2>
          <div className="gsub">
            {hasProject
              ? 'This conversation can see your project files. Ask about them directly, or pick a file in the sidebar to focus on it.'
              : 'Ask anything, drop in a file, or start from a suggestion below.'}
          </div>
          <div className="chips">
            {chips.map((s) => (
              <button key={s.label} className="chip" onClick={() => onSuggest(s.text)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')

  return (
    <div
      className="messages"
      ref={scroller}
      onScroll={onScroll}
      onWheel={markGesture}
      onTouchMove={markGesture}
      onPointerDown={markGesture}
      onKeyDown={markGesture}
    >
      <div className="msg-col" ref={column}>
        {messages.map((m) => (
          <ChatMessage
            key={m.id}
            message={m}
            anchorRef={m.id === anchorId ? anchor : null}
            onRegenerate={onRegenerate}
            onOpenFile={onOpenFile}
            canRegenerate={!streaming && m.id === lastAssistant?.id}
          />
        ))}
      </div>
      <div className="msg-tail" ref={spacer} aria-hidden="true" />
      {!atEnd && (
        <button className="jump-btn" onClick={jump}>
          <ChevronDown size={12} /> Jump to latest
        </button>
      )}
    </div>
  )
}
