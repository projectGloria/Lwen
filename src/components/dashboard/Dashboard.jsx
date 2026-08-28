import { useEffect, useMemo, useRef, useState } from 'react'
import { Menu, useContextMenu } from '../ui/Overlays'
import { IconGlyph } from '../ui/IconPicker'
import { UserChip } from '../auth/UserChip'
import { ProjectMenuItems } from '../library/Menus'
import { OllamaPill } from '../chat/OllamaPill'
import {
  Clock, Dots, Folder, FolderOpen, Mark, Message, Plus, Search, Trash,
} from '../Icons'
import { useStore } from '../../state/store'
import { useLibrary } from '../../state/library'
import { relativeTime } from '../../lib/format'

function ProjectCard({ project, index, onOpen }) {
  const [menuAt, setMenuAt] = useState(null)
  const ctx = useContextMenu()

  const close = () => {
    setMenuAt(null)
    ctx.close()
  }

  return (
    <article
      className="pcard"
      style={{ animationDelay: `${Math.min(index * 45, 360)}ms` }}
      onClick={onOpen}
      onContextMenu={ctx.open}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      <div className="pcard-top">
        <span className="folder">
          <IconGlyph
            icon={project.icon}
            size={20}
            fallback={project.folder ? <FolderOpen size={16} /> : <Folder size={16} />}
          />
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

      {project.folder && (
        <span className="fbadge" title={project.folder.root}>
          <FolderOpen size={11} />
          <span>{project.folder.name}</span>
        </span>
      )}

      <h3>{project.name}</h3>
      <p>{project.desc || 'No description yet.'}</p>

      <div className="pcard-foot">
        <span className="left">
          <Clock size={12} />
          <span>Last active · {relativeTime(project.lastActive)}</span>
        </span>
        <span className="chats">
          <Message size={13} /> {project.chats.length}
        </span>
      </div>

      {(menuAt || ctx.at) && (
        <Menu anchor={menuAt || ctx.at} width={214} onClose={close}>
          <ProjectMenuItems project={project} onDone={close} />
        </Menu>
      )}
    </article>
  )
}

export function Dashboard() {
  const { state, dispatch } = useStore()
  const lib = useLibrary()
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState('recent')
  const searchRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (
        e.key === '/' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
      ) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const list = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const filtered = q
      ? state.projects.filter((p) =>
          `${p.name} ${p.desc} ${p.folder?.name ?? ''}`.toLowerCase().includes(q),
        )
      : state.projects
    return [...filtered].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : b.lastActive - a.lastActive,
    )
  }, [state.projects, filter, sort])

  const totalChats = state.projects.reduce((n, p) => n + p.chats.length, 0)

  return (
    <section className="view" id="view-dashboard">
      <nav className="topnav">
        <div className="brand">
          <span className="mark">
            <Mark size={20} />
          </span>
          <span className="word">Lwen</span>
        </div>

        <div className="searchwrap">
          <div className="searchbox">
            <Search size={15} />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search projects…"
              autoComplete="off"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <span className="kbd">Ctrl K</span>
          </div>
        </div>

        <div className="nav-right">
          <OllamaPill />
          <button className="btn-primary" onClick={lib.createProject}>
            <Plus size={13} />
            New Project
          </button>
          <UserChip variant="compact" />
        </div>
      </nav>

      <div className="dash-scroll">
        <div className="dash-inner">
          <div className="dash-head">
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1>Projects</h1>
              <div className="sub">
                {state.projects.length} project{state.projects.length === 1 ? '' : 's'} ·{' '}
                {totalChats} conversation{totalChats === 1 ? '' : 's'}
              </div>
            </div>
            <button
              className="btn-ghost"
              onClick={lib.openTrash}
              title="Conversations and projects you have deleted"
            >
              <Trash size={13} />
              Recently deleted
              {state.trash.length > 0 && <span className="ghost-count">{state.trash.length}</span>}
            </button>
            <div className="sortwrap">
              <label htmlFor="sort-select">Sort</label>
              <select id="sort-select" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="recent">Recently active</option>
                <option value="name">Name A–Z</option>
              </select>
            </div>
          </div>

          <div className="grid">
            {list.length === 0 ? (
              <div className="empty-state">
                <div className="serif">
                  {state.projects.length ? 'No projects found' : 'Nothing here yet'}
                </div>
                <div>
                  {state.projects.length
                    ? 'Try a different search, or create a new project.'
                    : 'Create a project to start chatting, or point one at a folder of code.'}
                </div>
                {!state.projects.length && (
                  <button className="btn-primary" onClick={lib.createProject}>
                    <Plus size={13} />
                    New Project
                  </button>
                )}
              </div>
            ) : (
              list.map((p, i) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  index={i}
                  onOpen={() => dispatch({ type: 'project/open', id: p.id })}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
