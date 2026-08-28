import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Warn } from '../Icons'
import { useToast } from '../../hooks/useToast'

/**
 * A dialog opened from inside a menu or popover is a *child* of it, so closing
 * on "click outside" would unmount the dialog the moment it was clicked. Clicks
 * that land in a modal never count as outside.
 */
const inDialog = (target) => !!target?.closest?.('.modal-veil')

export function Toasts() {
  const { toasts } = useToast()
  if (!toasts.length) return null
  return createPortal(
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast${t.tone === 'error' ? ' error' : ''}`}>
          <span className="tick">{t.tone === 'error' ? <Warn size={14} /> : <Check size={13} />}</span>
          <span className="tmsg">{t.text}</span>
        </div>
      ))}
    </div>,
    document.body,
  )
}

/**
 * Anchored popup menu that keeps itself inside the viewport.
 *
 * `anchor` is either an element to hang under, or a `{ x, y }` point — which is
 * what a right-click gives you. The measurement runs in a layout effect *after*
 * the menu has been rendered once at its natural size, so `offsetHeight` is the
 * real height and the flip-upwards decision is correct on the first frame.
 */
export function Menu({ anchor, onClose, children, align = 'end', width = 178 }) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)
  const isPoint = !!anchor && typeof anchor === 'object' && !(anchor instanceof Element)

  useLayoutEffect(() => {
    if (!anchor) return
    const el = ref.current
    const h = el?.offsetHeight ?? 160
    const w = Math.min(width, window.innerWidth - 16)

    if (isPoint) {
      // A context menu opens *at* the pointer: down-right when there is room,
      // flipped back over the point when there is not.
      const left = anchor.x + w > window.innerWidth - 8 ? Math.max(8, anchor.x - w) : anchor.x
      const top = anchor.y + h > window.innerHeight - 8 ? Math.max(8, anchor.y - h) : anchor.y
      setPos({ top, left })
      return
    }

    const rect = anchor.getBoundingClientRect()
    const left =
      align === 'end'
        ? Math.max(8, Math.min(rect.right - w, window.innerWidth - w - 8))
        : Math.max(8, Math.min(rect.left, window.innerWidth - w - 8))
    const below = rect.bottom + 6
    const top = below + h > window.innerHeight - 8 ? Math.max(8, rect.top - h - 6) : below
    setPos({ top, left })
  }, [anchor, align, width, isPoint])

  useEffect(() => {
    const onDown = (e) => {
      if (ref.current?.contains(e.target)) return
      if (!isPoint && anchor?.contains?.(e.target)) return
      if (inDialog(e.target)) return
      onClose()
    }
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onClose)
    // A second right-click elsewhere should move the menu, not stack a new one
    // on top of the old — closing on the way down lets the new one open clean.
    document.addEventListener('contextmenu', onDown, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onClose)
      document.removeEventListener('contextmenu', onDown, true)
    }
  }, [anchor, onClose, isPoint])

  return createPortal(
    <div
      ref={ref}
      className="menu"
      style={{ width, top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? 'visible' : 'hidden' }}
      role="menu"
    >
      {children}
    </div>,
    document.body,
  )
}

/**
 * Turns a right-click into a `{ x, y }` anchor for `Menu`.
 *
 * `stopPropagation` matters: rows nest (a conversation sits inside a project
 * row inside the sidebar), and without it the outermost handler wins and you
 * get the wrong menu — or two of them.
 */
export function useContextMenu() {
  const [at, setAt] = useState(null)
  const open = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setAt({ x: e.clientX, y: e.clientY })
  }, [])
  const close = useCallback(() => setAt(null), [])
  return { at, open, close }
}

export function Popover({ anchor, onClose, children, width = 300 }) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const h = ref.current?.offsetHeight ?? 220
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))
    const below = rect.bottom + 8
    const top = below + h > window.innerHeight - 8 ? Math.max(8, rect.top - h - 8) : below
    setPos({ top, left })
  }, [anchor, width])

  useEffect(() => {
    const onDown = (e) => {
      if (ref.current?.contains(e.target)) return
      if (anchor?.contains(e.target)) return
      if (inDialog(e.target)) return
      onClose()
    }
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchor, onClose])

  return createPortal(
    <div
      ref={ref}
      className="pop"
      style={{ width, top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? 'visible' : 'hidden' }}
    >
      {children}
    </div>,
    document.body,
  )
}

export function Modal({ onClose, children, labelledBy }) {
  const ref = useRef(null)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    // A field, if the dialog has one — a dialog that opens with a tab strip
    // should still land the cursor where the typing goes.
    const first =
      ref.current?.querySelector('input, textarea') ?? ref.current?.querySelector('button')
    first?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="modal-veil"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div className="modal" ref={ref}>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({ title, body, confirmLabel = 'Delete', onConfirm, onClose }) {
  return (
    <Modal onClose={onClose} labelledBy="confirm-title">
      <h2 id="confirm-title">{title}</h2>
      <div className="msub">{body}</div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn-primary"
          onClick={() => {
            onConfirm()
            onClose()
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
