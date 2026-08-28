import { Modal } from '../ui/Overlays'
import { useStore } from '../../state/store'
import { useLibrary } from '../../state/library'
import { BUILT_INS } from '../../lib/commands'

const KEYS = [
  ['Enter', 'Send'],
  ['Shift + Enter', 'New line'],
  ['/', 'Commands, at the start of an empty message'],
  ['Ctrl + N', 'New conversation'],
  ['Ctrl + B', 'Show or hide the sidebar'],
  ['Ctrl + K', 'Search projects, on the dashboard'],
  ['Ctrl + /', 'This list'],
  ['Right-click', 'Menu for a project, conversation or model'],
  ['Esc', 'Close a dialog or panel'],
]

export function ShortcutsModal({ onClose }) {
  const { state } = useStore()
  const lib = useLibrary()
  const custom = state.prefs?.commands ?? []

  return (
    <Modal onClose={onClose} labelledBy="keys-title">
      <h2 id="keys-title">Shortcuts and commands</h2>
      <div className="msub">Everything Lwen answers to from the keyboard.</div>

      <div className="keys-list">
        {KEYS.map(([k, what]) => (
          <div key={k} className="keys-row">
            <span className="kbd">{k}</span>
            <span>{what}</span>
          </div>
        ))}
      </div>

      <div className="rp-label" style={{ marginTop: 22, marginBottom: 10 }}>
        Commands
      </div>
      <div className="keys-list">
        {BUILT_INS.map((c) => (
          <div key={c.id} className="keys-row">
            <span className="kbd">/{c.name}</span>
            <span>{c.description}</span>
          </div>
        ))}
        {custom.map((c) => (
          <div key={c.id} className="keys-row">
            <span className="kbd accent">/{c.name}</span>
            <span>{c.description || 'Your own prompt'}</span>
          </div>
        ))}
      </div>

      <div className="modal-actions">
        <button
          className="btn-ghost"
          onClick={() => {
            onClose()
            lib.openCommands()
          }}
        >
          Edit commands…
        </button>
        <button className="btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  )
}
