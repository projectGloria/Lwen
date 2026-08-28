import { useEffect, useRef } from 'react'
import { Slash, Plus } from '../Icons'

/**
 * The `/` list above the composer.
 *
 * It sits inside the composer rather than in a portal so it moves with the
 * input and is clipped by the same rounded box; the highlighted row is driven
 * by the textarea's own key handling, which keeps arrow keys and Enter working
 * without ever moving focus out of the field.
 */
export function CommandPalette({ items, active, query, onPick, onManage }) {
  const listRef = useRef(null)

  useEffect(() => {
    const el = listRef.current?.querySelector('.cmd-item.on')
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <div className="cmd-palette" ref={listRef} role="listbox" aria-label="Commands">
      {items.length === 0 ? (
        <div className="cmd-none">
          No command matches <b>/{query}</b>.
          <button onClick={onManage}>
            <Plus size={12} /> Make one
          </button>
        </div>
      ) : (
        items.map((c, i) => (
          <button
            key={c.id}
            role="option"
            aria-selected={i === active}
            className={`cmd-item${i === active ? ' on' : ''}`}
            // Mouse-down would blur the textarea before the click landed.
            onMouseDown={(e) => {
              e.preventDefault()
              onPick(c)
            }}
          >
            <span className="ci-name">
              <Slash size={11} />
              {c.name}
            </span>
            <span className="ci-desc">{c.description || c.prompt?.slice(0, 70)}</span>
            {c.kind === 'prompt' && <span className="ci-tag">yours</span>}
          </button>
        ))
      )}
    </div>
  )
}
