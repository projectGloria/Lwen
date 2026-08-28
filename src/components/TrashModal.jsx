import { useState } from 'react'
import { ConfirmDialog, Modal } from './ui/Overlays'
import { Folder, Message, Restore, Trash } from './Icons'
import { TRASH_KEEP_DAYS, useStore } from '../state/store'
import { useToast } from '../hooks/useToast'
import { relativeTime } from '../lib/format'

/**
 * Deleted conversations and projects. Nothing leaves the account's `trash.json`
 * until it is either restored or thrown out here — or ages past
 * `TRASH_KEEP_DAYS`.
 */
export function TrashModal({ onClose }) {
  const { state, dispatch } = useStore()
  const { toast } = useToast()
  const [confirm, setConfirm] = useState(null)
  const items = state.trash

  const restore = (entry) => {
    dispatch({ type: 'trash/restore', id: entry.id })
    toast(entry.kind === 'project' ? `Project “${entry.name}” restored` : `“${entry.name}” restored`)
  }

  return (
    <>
      <Modal onClose={onClose} labelledBy="trash-title">
        <h2 id="trash-title">Recently deleted</h2>
        <div className="msub">
          Deleted conversations and projects stay here for {TRASH_KEEP_DAYS} days, in{' '}
          <code>trash.json</code> inside your account folder.
        </div>

        {items.length === 0 ? (
          <div className="trash-empty">
            <Trash size={22} />
            <span>Nothing has been deleted.</span>
          </div>
        ) : (
          <div className="trash-list">
            {items.map((entry) => (
              <div className="trash-row" key={entry.id}>
                <span className="tr-icon">
                  {entry.kind === 'project' ? <Folder size={15} /> : <Message size={14} />}
                </span>
                <span className="tr-text">
                  <span className="tr-name">{entry.name || 'Untitled'}</span>
                  <span className="tr-sub">
                    {entry.kind === 'project'
                      ? `Project · ${entry.chatCount ?? entry.project?.chats?.length ?? 0} conversation${
                          (entry.chatCount ?? 0) === 1 ? '' : 's'
                        }`
                      : `in ${entry.projectName || 'a deleted project'} · ${
                          entry.chat?.messages?.length ?? 0
                        } message${(entry.chat?.messages?.length ?? 0) === 1 ? '' : 's'}`}
                    {' · '}
                    {relativeTime(entry.deletedAt)}
                  </span>
                </span>
                <button className="msg-tool" onClick={() => restore(entry)} title="Put this back">
                  <Restore size={12} /> Restore
                </button>
                <button
                  className="msg-tool danger"
                  title="Delete permanently"
                  onClick={() =>
                    setConfirm({
                      title: 'Delete permanently?',
                      body: `“${entry.name}” will be removed from disk. This cannot be undone.`,
                      onConfirm: () => {
                        dispatch({ type: 'trash/purge', id: entry.id })
                        toast('Deleted permanently')
                      },
                    })
                  }
                >
                  <Trash size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="modal-actions">
          {items.length > 0 && (
            <button
              className="btn-ghost danger"
              style={{ marginRight: 'auto' }}
              onClick={() =>
                setConfirm({
                  title: 'Empty recently deleted?',
                  body: `All ${items.length} item${items.length === 1 ? '' : 's'} will be removed from disk. This cannot be undone.`,
                  onConfirm: () => {
                    dispatch({ type: 'trash/empty' })
                    toast('Recently deleted emptied')
                  },
                })
              }
            >
              <Trash size={13} /> Empty
            </button>
          )}
          <button className="btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </Modal>

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          onConfirm={confirm.onConfirm}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  )
}
