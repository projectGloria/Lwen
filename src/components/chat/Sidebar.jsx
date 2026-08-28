import { useEffect, useRef, useState } from 'react'
import { FolderTree } from './FolderTree'
import { Menu, useContextMenu } from '../ui/Overlays'
import { IconGlyph } from '../ui/IconPicker'
import { UserChip } from '../auth/UserChip'
import { SessionMeter } from '../SessionMeter'
import { ChatMenuItems, ProjectMenuItems } from '../library/Menus'
import {
  Chevron, ChevronLeft, Close, Dots, FileIcon, Folder, FolderOpen, Grid, Mark, Message,
  Plus, Slash, Spinner, Trash,
} from '../Icons'
import { useStore } from '../../state/store'
import { useLibrary } from '../../state/library'

function ChatRow({ project, chat, active, onSelect }) {
  const lib = useLibrary()
  const ctx = useContextMenu()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(chat.name)
  const [menuAt, setMenuAt] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const startRename = () => {
    setDraft(chat.name)
    setEditing(true)
  }

  const commit = () => {
    const name = draft.trim()
    if (name && name !== chat.name) lib.renameChat(project.id, chat.id, name)
    setEditing(false)
  }

  const close = () => {
    setMenuAt(null)
    ctx.close()
  }

  if (editing) {
    return (
      <div className="tree-chat active">
        <IconGlyph icon={chat.icon} size={14} fallback={<Message size={13} />} />
        <input
          ref={inputRef}
          className="tree-rename"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setDraft(chat.name)
              setEditing(false)
            }
          }}
        />
      </div>
    )
  }

  return (
    <div
      className={`tree-chat${active ? ' active' : ''}`}
      onClick={onSelect}
      onContextMenu={ctx.open}
      role="button"
      tabIndex={0}
    >
      <IconGlyph icon={chat.icon} size={14} fallback={<Message size={13} />} />
      <span className="cname">{chat.name}</span>
      <span
        className={`row-menu${menuAt ? ' open' : ''}`}
        role="button"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation()
          setMenuAt(e.currentTarget)
        }}
      >
        <Dots size={13} />
      </span>
      {(menuAt || ctx.at) && (
        <Menu anchor={menuAt || ctx.at} width={196} onClose={close}>
          <ChatMenuItems project={project} chat={chat} onRename={startRename} onDone={close} />
        </Menu>
      )}
    </div>
  )
}

function ProjectRow({ project, isCurrent, open, children }) {
  const lib = useLibrary()
  const ctx = useContextMenu()
  const { dispatch } = useStore()

  return (
    <div>
      <div
        className={`tree-proj${isCurrent ? ' active' : ''}`}
        onClick={() => dispatch({ type: 'project/open', id: project.id })}
        onContextMenu={ctx.open}
        role="button"
        tabIndex={0}
      >
        <IconGlyph
          icon={project.icon}
          size={16}
          fallback={project.folder ? <FolderOpen size={15} /> : <Folder size={15} />}
        />
        <span className="pname">{project.name}</span>
        <span
          className="row-menu grid-open"
          role="button"
          tabIndex={-1}
          title="Open in detailed view"
          onClick={(e) => {
            e.stopPropagation()
            lib.openProjectDetail(project)
          }}
        >
          <Grid size={12} />
        </span>
        <span
          className={`chev${open ? ' open' : ''}`}
          role="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation()
            dispatch({ type: 'project/toggleExpand', id: project.id })
          }}
        >
          <Chevron size={11} />
        </span>
      </div>
      {children}
      {ctx.at && (
        <Menu anchor={ctx.at} width={214} onClose={ctx.close}>
          <ProjectMenuItems project={project} onDone={ctx.close} />
        </Menu>
      )}
    </div>
  )
}

export function Sidebar({
  project,
  chat,
  folderIndex,
  pinned,
  onTogglePin,
  onOpenFile,
  activeFilePath,
  onOpenFolder,
  onCloseFolder,
  onNewChat,
  onBackToProjects,
  openingFolder,
  filesTabKey = 0,
}) {
  const { state, dispatch } = useStore()
  const lib = useLibrary()
  const [tab, setTab] = useState('chats')

  const hasFolder = !!project?.folder
  useEffect(() => {
    if (!hasFolder && tab === 'files') setTab('chats')
  }, [hasFolder, tab])

  // `/files` bumps this counter rather than setting a boolean, so asking for the
  // panel twice in a row works even after switching back to Chats by hand.
  useEffect(() => {
    if (filesTabKey > 0 && hasFolder) setTab('files')
  }, [filesTabKey, hasFolder])

  return (
    <aside className="side-left">
      <div className="side-head">
        <button className="projects-back" onClick={onBackToProjects}>
          <ChevronLeft size={16} />
          Projects
        </button>
        <span style={{ color: 'var(--accent)', display: 'flex' }}>
          <Mark size={22} width={2} />
        </span>
      </div>

      <button className="newchat-btn" onClick={onNewChat}>
        <Plus size={14} />
        New chat
      </button>

      {hasFolder && (
        <div className="side-tabs">
          <button className={tab === 'chats' ? 'on' : ''} onClick={() => setTab('chats')}>
            <Message size={12} /> Chats
          </button>
          <button className={tab === 'files' ? 'on' : ''} onClick={() => setTab('files')}>
            <FileIcon size={12} /> Files
          </button>
        </div>
      )}

      {tab === 'files' && hasFolder ? (
        <FolderTree
          folder={project.folder}
          tree={folderIndex.tree}
          stats={folderIndex.stats}
          scanning={folderIndex.scanning}
          progress={folderIndex.progress}
          phase={folderIndex.phase}
          error={folderIndex.error}
          pinned={pinned}
          onTogglePin={onTogglePin}
          onOpenFile={onOpenFile}
          activePath={activeFilePath}
          onRescan={folderIndex.rescan}
        />
      ) : (
        <div className="tree">
          <div className="tree-label">
            <span>Projects</span>
          </div>
          {state.projects.map((p) => {
            const open = state.expanded.includes(p.id)
            const isCurrent = p.id === project?.id
            return (
              <ProjectRow key={p.id} project={p} isCurrent={isCurrent} open={open}>
                <div
                  className="tree-chats"
                  style={{ maxHeight: open ? `${p.chats.length * 34 + 8}px` : 0 }}
                >
                  {p.chats.map((c) => (
                    <ChatRow
                      key={c.id}
                      project={p}
                      chat={c}
                      active={c.id === chat?.id && isCurrent}
                      onSelect={() =>
                        dispatch({ type: 'chat/select', projectId: p.id, chatId: c.id })
                      }
                    />
                  ))}
                </div>
              </ProjectRow>
            )
          })}

          <div className="tree-label" style={{ marginTop: 4 }}>
            <span>Codebase</span>
          </div>
          {hasFolder ? (
            <>
              <button className="fnode" onClick={() => setTab('files')}>
                <FolderOpen size={13} />
                <span className="fname">{project.folder.name}</span>
              </button>
              <button className="fnode" onClick={onCloseFolder}>
                <Close size={12} />
                <span className="fname">Close project folder</span>
              </button>
            </>
          ) : (
            <button className="fnode" onClick={onOpenFolder} disabled={openingFolder}>
              {openingFolder ? <Spinner size={12} /> : <FolderOpen size={13} />}
              <span className="fname">Open folder…</span>
            </button>
          )}

          <div className="tree-label" style={{ marginTop: 4 }}>
            <span>Library</span>
          </div>
          <button className="fnode" onClick={() => project && lib.openProjectDetail(project)}>
            <Grid size={13} />
            <span className="fname">Detailed view</span>
          </button>
          <button className="fnode" onClick={lib.openCommands}>
            <Slash size={13} />
            <span className="fname">Slash commands</span>
            {state.prefs?.commands?.length > 0 && (
              <span className="fcount">{state.prefs.commands.length}</span>
            )}
          </button>
          <button className="fnode" onClick={lib.openTrash}>
            <Trash size={13} />
            <span className="fname">Recently deleted</span>
            {state.trash.length > 0 && <span className="fcount">{state.trash.length}</span>}
          </button>
        </div>
      )}

      <div className="side-foot">
        <SessionMeter />
        <UserChip />
      </div>
    </aside>
  )
}
