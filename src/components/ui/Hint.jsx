import { useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Help } from '../Icons'

/**
 * A `?` next to a setting that explains it on hover or focus.
 *
 * The bubble is portalled and positioned in viewport coordinates because the
 * settings panel scrolls — an absolutely positioned tooltip would be clipped by
 * its overflow.
 */
export function Hint({ title, children, width = 268 }) {
  const anchor = useRef(null)
  const bubble = useRef(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const id = useId()

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const rect = anchor.current?.getBoundingClientRect()
    if (!rect) return
    const h = bubble.current?.offsetHeight ?? 120
    const left = Math.max(10, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 10))
    // Above the icon by default, below it when there is no room up there.
    const above = rect.top - h - 9
    setPos({ left, top: above > 10 ? above : Math.min(rect.bottom + 9, window.innerHeight - h - 10) })
  }, [open, width])

  return (
    <>
      <button
        ref={anchor}
        type="button"
        className={`hint-btn${open ? ' on' : ''}`}
        aria-label={`What is ${title}?`}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          // Tapping should not scroll the panel or submit anything around it.
          e.preventDefault()
          setOpen((o) => !o)
        }}
      >
        <Help size={13} />
      </button>

      {open &&
        createPortal(
          <div
            ref={bubble}
            id={id}
            role="tooltip"
            className="hint-bubble"
            style={{
              width,
              left: pos?.left ?? -9999,
              top: pos?.top ?? -9999,
              visibility: pos ? 'visible' : 'hidden',
            }}
          >
            <div className="hint-title">{title}</div>
            <div className="hint-body">{children}</div>
          </div>,
          document.body,
        )}
    </>
  )
}
