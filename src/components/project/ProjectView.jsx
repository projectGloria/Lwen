import { useMemo, useRef, useState } from 'react'
import { Menu, useContextMenu } from '../ui/Overlays'
import { IconGlyph } from '../ui/IconPicker'
import { UserChip } from '../auth/UserChip'
import { OllamaPill } from '../chat/OllamaPill'
import { ChatMenuItems, ProjectMenuItems } from '../library/Menus'
import {
  ChevronLeft, Clock, Dots, FileIcon, Folder, FolderOpen, Layers, Mark, Message, Pencil,
  Plus, Search, Trash,
} from '../Icons'
import { useStore, useCurrent } from '../../state/store'
import { useLibrary } from '../../state/library'
import { relativeTime } from '../../lib/format'
import { estimateConversationTokens, formatTokens } from '../../lib/tokens'

/** First thing the user actually said, as a preview line. */
function preview(chat) {
  const first = chat.messages?.find((m) => m.role === 'user' && m.content)
  if (!first) return 'Nothing said yet.'
  const clean = first.content.replace(/\s+/g, ' ').trim()
  return clean.length > 130 ? `${clean.slice(0, 130).trimEnd()}…` : clean
}

function ChatCard({ project, chat, index, onOpen }) {
  const lib = useLibrary()
  const ctx = useContextMenu()
  const [menuAt, setMenuAt] = useState(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(chat.name)
  const inputRef = useRef(null)

  const startRename = () => {
    setDraft(chat.name)
    setEditing(true)
    // The input mounts on the next frame; focus once it is there.
    requestAnimationFrame(() => inputRef.current?.select())
  }

  const commit = () => {
    const name = draft.trim()
    if (name && name !== chat.name) lib.renameChat(project.id, chat.id, name)
    setEditing(false)
  }

  const turns = chat.messages?.filter((m) => m.role === 'user').length ?? 0
  const tokens = estimateConversationTokens(chat.messages ?? [])

  return (
    <article
      className="ccard"
      style={{ animationDelay: `${Math.min(index * 35, 300)}ms` }}
      onClick={() => !editing && onOpen()}
      onContextMenu={ctx.open}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && !editing && onOpen()}
    >
      <div className="ccard-top">
        <span className="cc-icon">
          <IconGlyph icon={chat.icon} size={20} fallback={<Message size={15} />} />
        </span>
        <button
          className={`dot-menu${menuAt ? ' open' : ''}`}
          title="More"
          onClick={(e) => {
            e.stopPropagation()
            setMenuAt(e.currentTarget)
          }}
        >
          <Dots />
        </button>
      </div>

      {editing ? (
        <input
          ref={inputRef}
          className="cc-rename"
          value={draft}
          autoFocus
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setEditing(false)
          }}
        />
      ) : (
        <h3>{chat.name}</h3>
      )}
      <p>{preview(chat)}</p>

      <div className="ccard-foot">
        <span className="left">
          <Clock size={12} />
          <span>{relativeTime(chat.updatedAt || chat.createdAt)}</span>
        </span>
        <span className="cc-meta">
          {turns > 0 && <span>{turns} turn{turns === 1 ? '' : 's'}</span>}
          {tokens > 0 && <span>{formatTokens(tokens)}</span>}
        </span>
      </div>

      {(menuAt || ctx.at) && (
        <Menu
          anchor={menuAt || ctx.at}
          width={196}
          onClose={() => {
            setMenuAt(null)
            ctx.close()
          }}
        >
          <ChatMenuItems
            project={project}
            chat={chat}
            onRename={startRename}
            onDone={() => {
              setMenuAt(null)
              ctx.close()
            }}
          />
        </Menu>
      )}
    </article>
  )
}

/**
 * Every conversation in one project as a grid — reached from a project's
 * context menu, from its name in the chat breadcrumb, or with `/grid`.
 */
export function ProjectView() {
  const { state, dispatch } = useStore()
  const { project } = useCurrent()
  const lib = useLibrary()
  const ctx = useContextMenu()
  const [menuAt, setMenuAt] = useState(null)
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState('recent')

  const list = useMemo(() => {
    if (!project) return []
    const q = filter.trim().toLowerCase()
    const chats = q
      ? project.chats.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.messages?.some((m) => m.content?.toLowerCase().includes(q)),
        )
      : project.chats
    return [...chats].sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name)
        : (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0),
    )
  }, [project, filter, sort])

  if (!project) return null

  const messages = project.chats.reduce((n, c) => n + (c.messages?.length ?? 0), 0)

  return (
    <section className="view" id="view-project">
      <nav className="topnav">
        <div className="brand">
          <button className="projects-back" onClick={() => dispatch({ type: 'view', view: 'dashboard' })}>
            <ChevronLeft size={16} />
            Projects
          </button>
        </div>

        <div className="searchwrap">
          <div className="searchbox">
            <Search size={15} />
            <input
              type="text"
              placeholder={`Search in ${project.name}…`}
              autoComplete="off"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        </div>

        <div className="nav-right">
          <OllamaPill />
          <button className="btn-primary" onClick={() => lib.createChat(project)}>
            <Plus size={13} />
            New chat
          </button>
          <UserChip variant="compact" />
        </div>
      </nav>

      <div className="dash-scroll">
        <div className="dash-inner">
          <div className="proj-hero" onContextMenu={ctx.open}>
            <span className="ph-icon">
              <IconGlyph
                icon={project.icon}
                size={44}
                fallback={project.folder ? <FolderOpen size={26} /> : <Folder size={26} />}
              />
            </span>
            <div className="ph-text">
              <h1>{project.name}</h1>
              <div className="sub">{project.desc || 'No description yet.'}</div>
              <div className="ph-meta">
                <span>
                  <Message size={12} /> {project.chats.length} conversation
                  {project.chats.length === 1 ? '' : 's'}
                </span>
                <span>
                  <Layers size={12} /> {messages} message{messages === 1 ? '' : 's'}
                </span>
                <span>
                  <Clock size={12} /> Last active {relativeTime(project.lastActive)}
                </span>
                {project.folder && (
                  <span title={project.folder.root}>
                    <FileIcon size={12} /> {project.folder.name}
                  </span>
                )}
              </div>
            </div>
            <div className="ph-actions">
              <button className="btn-ghost" onClick={() => lib.editProject(project)}>
                <Pencil size={13} /> Edit
              </button>
              <button
                className={`icon-btn${menuAt ? ' on' : ''}`}
                onClick={(e) => setMenuAt(e.currentTarget)}
                title="More"
              >
                <Dots />
              </button>
            </div>
          </div>

          <div className="dash-head" style={{ marginTop: 26 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sub">
                {list.length === project.chats.length
                  ? 'All conversations'
                  : `${list.length} of ${project.chats.length} conversations`}
              </div>
            </div>
            <button className="btn-ghost" onClick={lib.openTrash}>
              <Trash size={13} />
              Recently deleted
              {state.trash.length > 0 && <span className="ghost-count">{state.trash.length}</span>}
            </button>
            <div className="sortwrap">
              <label htmlFor="chat-sort">Sort</label>
              <select id="chat-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="recent">Recently active</option>
                <option value="name">Name A–Z</option>
              </select>
            </div>
          </div>

          <div className="grid">
            {list.length === 0 ? (
              <div className="empty-state">
                <div className="serif">
                  {project.chats.length ? 'Nothing matches that' : 'No conversations yet'}
                </div>
                <div>
                  {project.chats.length
                    ? 'Try a different search.'
                    : 'Start one and it will show up here.'}
                </div>
                <button className="btn-primary" onClick={() => lib.createChat(project)}>
                  <Plus size={13} /> New chat
                </button>
              </div>
            ) : (
              list.map((c, i) => (
                <ChatCard
                  key={c.id}
                  project={project}
                  chat={c}
                  index={i}
                  onOpen={() => lib.openChat(project.id, c.id)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {(menuAt || ctx.at) && (
        <Menu
          anchor={menuAt || ctx.at}
          width={214}
          onClose={() => {
            setMenuAt(null)
            ctx.close()
          }}
        >
          <ProjectMenuItems
            project={project}
            omit={['detail']}
            onDone={() => {
              setMenuAt(null)
              ctx.close()
            }}
          />
        </Menu>
      )}

      <span className="proj-watermark" aria-hidden="true">
        <Mark size={120} width={1.2} />
      </span>
    </section>
  )
}
