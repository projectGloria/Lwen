import { memo, useMemo, useState } from 'react'
import { Chevron, FileIcon, Folder, Pin, Refresh, Warn } from '../Icons'
import { formatBytes } from '../../lib/format'

function Node({ node, depth, expanded, toggle, pinned, onTogglePin, onOpenFile, activePath }) {
  const pad = { paddingLeft: 8 + depth * 12 }

  if (node.type === 'dir') {
    const open = expanded.has(node.path)
    return (
      <>
        <button className="fnode" style={pad} onClick={() => toggle(node.path)}>
          <span className={`chev${open ? ' open' : ''}`}>
            <Chevron size={10} />
          </span>
          <Folder size={13} />
          <span className="fname">{node.name}</span>
        </button>
        {open &&
          node.children.map((child) => (
            <Node
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              pinned={pinned}
              onTogglePin={onTogglePin}
              onOpenFile={onOpenFile}
              activePath={activePath}
            />
          ))}
      </>
    )
  }

  const isPinned = pinned.has(node.path)
  return (
    <button
      className={`fnode${activePath === node.path ? ' active' : ''}${isPinned ? ' picked' : ''}`}
      style={{ paddingLeft: 8 + depth * 12 + 16 }}
      onClick={() => onOpenFile(node)}
      title={`${node.rel} · ${formatBytes(node.size)}`}
    >
      <FileIcon size={12} />
      <span className="fname">{node.name}</span>
      <span
        className="fpin"
        role="button"
        tabIndex={-1}
        title={isPinned ? 'Stop always sending this file' : 'Always send this file as context'}
        onClick={(e) => {
          e.stopPropagation()
          onTogglePin(node.path)
        }}
      >
        <Pin size={11} />
      </span>
    </button>
  )
}

function FolderTreeBase({
  folder,
  tree,
  stats,
  scanning,
  progress,
  phase,
  error,
  pinned,
  onTogglePin,
  onOpenFile,
  activePath,
  onRescan,
}) {
  const [expanded, setExpanded] = useState(() => new Set())
  const toggle = (path) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })

  // Open the first level automatically when the tree is small enough to read.
  const initial = useMemo(() => {
    const dirs = tree.filter((n) => n.type === 'dir')
    return dirs.length <= 8 ? new Set(dirs.map((d) => d.path)) : new Set()
  }, [tree])

  const view = expanded.size === 0 ? initial : expanded

  return (
    <div className="tree">
      <div className="ftree-head">
        <div className="tree-label" style={{ padding: '4px 0 0' }}>
          <span>Project files</span>
          <button className="mini" onClick={onRescan} title="Rescan folder" disabled={scanning}>
            <Refresh size={12} />
          </button>
        </div>
        <div className="ftree-path">
          <Folder size={12} />
          <span>{folder?.root}</span>
        </div>

        {scanning && (
          <>
            <div className="ftree-stats">{phase || 'Scanning…'}</div>
            <div className="scan-bar">
              {progress > 0 ? <i style={{ width: `${Math.round(progress * 100)}%` }} /> : <span className="scan-indet" />}
            </div>
          </>
        )}

        {!scanning && error && (
          <div className="ftree-stats" style={{ color: '#E9A088' }}>
            <Warn size={11} /> {error}
          </div>
        )}

        {!scanning && !error && stats && (
          <div className="ftree-stats">
            <span>{stats.indexed} files</span>
            <span>{formatBytes(stats.bytes)}</span>
            {pinned.size > 0 && <span style={{ color: 'var(--accent)' }}>{pinned.size} pinned</span>}
          </div>
        )}

        {!scanning && stats?.truncated && (
          <div className="ftree-stats" style={{ color: '#E9A088' }}>
            <Warn size={11} /> Large folder — only the first {stats.indexed} files were indexed.
          </div>
        )}
      </div>

      {!scanning && !error && tree.length === 0 && (
        <div className="ftree-stats" style={{ padding: '14px 8px' }}>
          No readable text files were found in this folder.
        </div>
      )}

      {tree.map((node) => (
        <Node
          key={node.path}
          node={node}
          depth={0}
          expanded={view}
          toggle={toggle}
          pinned={pinned}
          onTogglePin={onTogglePin}
          onOpenFile={onOpenFile}
          activePath={activePath}
        />
      ))}
    </div>
  )
}

/**
 * A project folder can hold thousands of nodes, and the sidebar sits next to a
 * reply that rewrites the store on every animation frame. Every prop above is
 * stable across those frames, so memoising here keeps the tree out of the
 * streaming render path entirely.
 */
export const FolderTree = memo(FolderTreeBase)
