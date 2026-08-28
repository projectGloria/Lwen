import { useState } from 'react'
import { Modal } from '../ui/Overlays'
import { IconPicker } from '../ui/IconPicker'

/** The icon picker on its own, for changing one thing's mark without opening
 *  the full edit dialog. */
export function IconModal({ title, subtitle, initial, fallback, onSave, onClose }) {
  const [icon, setIcon] = useState(initial ?? null)

  return (
    <Modal onClose={onClose} labelledBy="icon-modal-title">
      <h2 id="icon-modal-title">{title}</h2>
      {subtitle && <div className="msub">{subtitle}</div>}

      <IconPicker value={icon} onChange={setIcon} fallback={fallback} label="Icon" />

      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn-primary"
          onClick={() => {
            onSave(icon)
            onClose()
          }}
        >
          Save icon
        </button>
      </div>
    </Modal>
  )
}
