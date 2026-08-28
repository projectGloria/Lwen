import {
  Close, Copy, FolderOpen, Grid, Image, Message, Pencil, Plus, Trash,
} from '../Icons'
import { useLibrary } from '../../state/library'

/**
 * The menu body for a project, identical everywhere it appears: the dashboard
 * grid, the sidebar tree, the project detail header and the chat breadcrumb.
 *
 * Each caller wraps it in its own `<Menu>` — anchored to a button or to the
 * pointer — and passes `onDone` so the menu closes before the action runs.
 */
export function ProjectMenuItems({ project, onDone, omit = [] }) {
  const lib = useLibrary()
  const hidden = new Set(omit)
  const run = (fn) => () => {
    onDone?.()
    fn()
  }

  return (
    <>
      {!hidden.has('open') && (
        <button onClick={run(() => lib.openProject(project))}>
          <Message size={13} /> Open latest conversation
        </button>
      )}
      {!hidden.has('detail') && (
        <button onClick={run(() => lib.openProjectDetail(project))}>
          <Grid size={13} /> Open in detailed view
        </button>
      )}
      {!hidden.has('newChat') && (
        <button onClick={run(() => lib.createChat(project))}>
          <Plus size={13} /> New conversation
        </button>
      )}
      <div className="sep" />
      <button onClick={run(() => lib.editProject(project))}>
        <Pencil size={13} /> Edit project…
      </button>
      <button onClick={run(() => lib.changeProjectIcon(project))}>
        <Image size={13} /> Change icon…
      </button>
      <button onClick={run(() => lib.toggleProjectFolder(project))}>
        <FolderOpen size={13} />
        {project.folder ? 'Close folder' : 'Open folder…'}
      </button>
      <button onClick={run(() => lib.duplicateProject(project))}>
        <Copy size={13} /> Duplicate
      </button>
      <div className="sep" />
      <button className="danger" onClick={run(() => lib.deleteProject(project))}>
        <Trash size={13} /> Delete project
      </button>
    </>
  )
}

export function ChatMenuItems({ project, chat, onDone, onRename }) {
  const lib = useLibrary()
  const run = (fn) => () => {
    onDone?.()
    fn()
  }

  return (
    <>
      <button onClick={run(() => lib.openChat(project.id, chat.id))}>
        <Message size={13} /> Open
      </button>
      <div className="sep" />
      <button onClick={run(() => onRename?.())}>
        <Pencil size={13} /> Rename
      </button>
      <button onClick={run(() => lib.changeChatIcon(project, chat))}>
        <Image size={13} /> Change icon…
      </button>
      <button onClick={run(() => lib.clearChat(project, chat))} disabled={!chat.messages?.length}>
        <Close size={12} /> Clear messages
      </button>
      <div className="sep" />
      <button className="danger" onClick={run(() => lib.deleteChat(project, chat))}>
        <Trash size={13} /> Delete conversation
      </button>
    </>
  )
}
