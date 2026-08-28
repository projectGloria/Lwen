import { useState } from 'react'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { Modal } from '../ui/Overlays'
import { IconGlyph, IconPicker } from '../ui/IconPicker'
import { Folder, FolderOpen, Trash } from '../Icons'
import { DEFAULT_SYSTEM_PROMPT } from '../../state/store'
import { baseName } from '../../lib/files'

const TABS = [
  ['details', 'Details'],
  ['icon', 'Icon'],
  ['instructions', 'Instructions'],
]

/**
 * Create/edit for a project: what it is called, what it looks like, which folder
 * it reads, and the standing instructions sent ahead of every message.
 *
 * The instructions field is the same `settings.systemPrompt` the Configuration
 * panel edits — deliberately one value with two ways in, rather than a second
 * prompt that silently competes with the first.
 */
export function ProjectModal({ initial, onSave, onClose }) {
  const [tab, setTab] = useState('details')
  const [name, setName] = useState(initial?.name ?? '')
  const [desc, setDesc] = useState(initial?.desc ?? '')
  const [icon, setIcon] = useState(initial?.icon ?? null)
  const [folder, setFolder] = useState(initial?.folder ?? null)
  const [instructions, setInstructions] = useState(
    initial?.settings?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
  )
  const [invalid, setInvalid] = useState(false)
  const editing = !!initial

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setTab('details')
      setInvalid(true)
      return
    }
    onSave({
      name: trimmed,
      desc: desc.trim(),
      icon,
      folder,
      instructions: instructions.trim(),
    })
    onClose()
  }

  const pickFolder = async () => {
    try {
      const picked = await openDialog({ directory: true, multiple: false })
      if (picked) setFolder({ root: picked, name: baseName(picked) })
    } catch {
      /* dialog dismissed */
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="project-modal-title">
      <h2 id="project-modal-title">{editing ? 'Edit project' : 'Create project'}</h2>
      <div className="msub">
        Projects group conversations, a codebase folder and model settings together.
      </div>

      <div className="modal-tabs">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={tab === key ? 'on' : ''}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'details' && (
        <>
          <div className="field">
            <label htmlFor="np-name">Project name</label>
            <div className="field-with-icon">
              <span className="field-icon" title="Change this on the Icon tab">
                <IconGlyph icon={icon} size={20} fallback={<Folder size={16} />} />
              </span>
              <input
                id="np-name"
                value={name}
                maxLength={60}
                placeholder="e.g. Payments service"
                onChange={(e) => {
                  setName(e.target.value)
                  setInvalid(false)
                }}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                className={invalid ? 'invalid' : ''}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="np-desc">
              Description{' '}
              <span style={{ opacity: 0.5, textTransform: 'none', letterSpacing: 0 }}>
                (optional)
              </span>
            </label>
            <textarea
              id="np-desc"
              rows={3}
              maxLength={160}
              value={desc}
              placeholder="What is this project about?"
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Codebase folder (optional)</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn-ghost" onClick={pickFolder} style={{ flex: '0 0 auto' }}>
                <FolderOpen size={14} />
                {folder ? 'Change…' : 'Choose folder…'}
              </button>
              <span
                style={{
                  fontSize: 11.5,
                  color: folder ? 'var(--text-2)' : 'var(--text-3)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={folder?.root}
              >
                {folder ? folder.root : 'Chat only'}
              </span>
              {folder && (
                <button className="icon-btn" onClick={() => setFolder(null)} title="Remove folder">
                  <Trash size={13} />
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'icon' && (
        <IconPicker
          value={icon}
          onChange={setIcon}
          fallback={<Folder size={20} />}
          label="Project icon"
        />
      )}

      {tab === 'instructions' && (
        <div className="field">
          <label htmlFor="np-instructions">Custom instructions</label>
          <textarea
            id="np-instructions"
            rows={8}
            value={instructions}
            placeholder="How should the model behave in this project?"
            onChange={(e) => setInstructions(e.target.value)}
          />
          <div className="rp-hint">
            Sent ahead of every message in this project, and counted against the context window.
            The Configuration panel edits the same text.
            {instructions.trim() !== DEFAULT_SYSTEM_PROMPT && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={() => setInstructions(DEFAULT_SYSTEM_PROMPT)}
                  style={{ color: 'var(--accent-hi)', textDecoration: 'underline' }}
                >
                  Restore the default
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" onClick={submit}>
          {editing ? 'Save changes' : 'Create project'}
        </button>
      </div>
    </Modal>
  )
}
