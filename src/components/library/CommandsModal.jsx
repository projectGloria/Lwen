import { useState } from 'react'
import { Modal } from '../ui/Overlays'
import { Check, Plus, Slash, Trash } from '../Icons'
import { useStore, uid } from '../../state/store'
import { useToast } from '../../hooks/useToast'
import { BUILT_INS, normalizeName, validateName } from '../../lib/commands'

const blank = () => ({ id: uid(), name: '', description: '', prompt: '' })

/**
 * Editor for the `/name` prompts that show up in the composer. Built-ins are
 * listed but not editable — seeing the names that are already taken is the
 * quickest way to understand why one is refused.
 */
export function CommandsModal({ onClose }) {
  const { state, dispatch } = useStore()
  const { toast } = useToast()
  const commands = state.prefs?.commands ?? []
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState(null)

  const save = (next) => dispatch({ type: 'prefs', patch: { commands: next } })

  const commit = () => {
    const name = normalizeName(draft.name)
    const problem = validateName(name, commands, draft.id)
    if (problem) {
      setError(problem)
      return
    }
    if (!draft.prompt.trim()) {
      setError('Write the text this command should insert.')
      return
    }
    const entry = {
      id: draft.id,
      name,
      description: draft.description.trim().slice(0, 80),
      prompt: draft.prompt,
    }
    const exists = commands.some((c) => c.id === draft.id)
    save(exists ? commands.map((c) => (c.id === draft.id ? entry : c)) : [...commands, entry])
    setDraft(null)
    setError(null)
    toast(`/${name} saved`)
  }

  const remove = (id) => {
    save(commands.filter((c) => c.id !== id))
    if (draft?.id === id) setDraft(null)
    toast('Command removed')
  }

  return (
    <Modal onClose={onClose} labelledBy="cmd-modal-title">
      <h2 id="cmd-modal-title">Slash commands</h2>
      <div className="msub">
        Type <code>/</code> in the composer to search these. A command drops its text into the
        composer so you can read and edit it before sending — it never sends on its own.
      </div>

      {draft ? (
        <>
          <div className="field">
            <label htmlFor="cmd-name">Command</label>
            <div className="field-with-icon">
              <span className="field-icon">/</span>
              <input
                id="cmd-name"
                value={draft.name}
                placeholder="review"
                maxLength={24}
                onChange={(e) => {
                  setDraft({ ...draft, name: e.target.value })
                  setError(null)
                }}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="cmd-desc">
              Description{' '}
              <span style={{ opacity: 0.5, textTransform: 'none', letterSpacing: 0 }}>
                (optional)
              </span>
            </label>
            <input
              id="cmd-desc"
              value={draft.description}
              maxLength={80}
              placeholder="Review the open file for bugs"
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="cmd-prompt">Text</label>
            <textarea
              id="cmd-prompt"
              rows={6}
              value={draft.prompt}
              placeholder={'Review this for bugs and tell me what you would change:\n\n{input}'}
              onChange={(e) => {
                setDraft({ ...draft, prompt: e.target.value })
                setError(null)
              }}
            />
            <div className="rp-hint">
              <code>{'{input}'}</code> is replaced by whatever you type after the command. Without
              it, that text is added on the end.
            </div>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <div className="modal-actions">
            <button className="btn-ghost" onClick={() => { setDraft(null); setError(null) }}>
              Cancel
            </button>
            <button className="btn-primary" onClick={commit}>
              <Check size={13} /> Save command
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="cmd-list">
            {commands.length === 0 && (
              <div className="cmd-empty">
                No commands of your own yet. The built-ins below always work.
              </div>
            )}
            {commands.map((c) => (
              <div key={c.id} className="cmd-row">
                <span className="cmd-name">
                  <Slash size={12} />/{c.name}
                </span>
                <span className="cmd-desc">{c.description || c.prompt.slice(0, 60)}</span>
                <button className="btn-ghost" onClick={() => setDraft({ ...c })}>
                  Edit
                </button>
                <button className="icon-btn" onClick={() => remove(c.id)} title="Remove">
                  <Trash size={13} />
                </button>
              </div>
            ))}
          </div>

          <button className="btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setDraft(blank())}>
            <Plus size={13} /> New command
          </button>

          <div className="rp-label" style={{ marginTop: 22, marginBottom: 10 }}>
            Built in
          </div>
          <div className="cmd-builtins">
            {BUILT_INS.map((b) => (
              <span key={b.id} className="ctx-chip muted" title={b.description}>
                /{b.name}
              </span>
            ))}
          </div>

          <div className="modal-actions">
            <button className="btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
