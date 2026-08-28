import { useEffect, useMemo, useState } from 'react'
import { Modal } from './ui/Overlays'
import { Clock, Keyboard, Message, Mark, Layers } from './Icons'
import { useStats } from '../state/stats'
import { formatCount, formatDuration } from '../lib/format'

const DAYS_SHOWN = 14

function dayKeys(n) {
  const out = []
  const d = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const day = new Date(d)
    day.setDate(d.getDate() - i)
    out.push(day.toISOString().slice(0, 10))
  }
  return out
}

function Tile({ icon, value, label, sub }) {
  return (
    <div className="stat-tile">
      <span className="st-icon">{icon}</span>
      <span className="st-value">{value}</span>
      <span className="st-label">{label}</span>
      {sub && <span className="st-sub">{sub}</span>}
    </div>
  )
}

/**
 * What this account has done in Lwen. Counters live in `stats.json`, outside the
 * library, because they change on every keystroke — see `state/stats.jsx`.
 *
 * The numbers are polled rather than pushed for the same reason: nothing else
 * in the app should re-render because a key was pressed.
 */
export function StatsModal({ onClose, projects = [] }) {
  const stats = useStats()
  const [snap, setSnap] = useState(() => stats.snapshot())

  useEffect(() => {
    const id = setInterval(() => setSnap(stats.snapshot()), 1000)
    return () => clearInterval(id)
  }, [stats])

  const totalChats = projects.reduce((n, p) => n + p.chats.length, 0)
  const totalMessages = projects.reduce(
    (n, p) => n + p.chats.reduce((m, c) => m + (c.messages?.length ?? 0), 0),
    0,
  )

  const recent = useMemo(() => {
    const keys = dayKeys(DAYS_SHOWN)
    const rows = keys.map((k) => ({ key: k, ...(snap.days[k] ?? { ms: 0, asks: 0 }) }))
    const peak = Math.max(1, ...rows.map((r) => r.ms))
    return { rows, peak }
  }, [snap.days])

  // Keystrokes per question is a rough proxy for how much editing a message
  // takes — interesting over months, meaningless on day one.
  const perAsk = snap.asks > 0 ? Math.round(snap.keys / snap.asks) : 0
  const since = snap.firstSeen
    ? new Date(snap.firstSeen).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  return (
    <Modal onClose={onClose} labelledBy="stats-title">
      <h2 id="stats-title">Statistics</h2>
      <div className="msub">
        Counted on this machine for this account only, and never sent anywhere.
        {since && ` Since ${since}.`}
      </div>

      <div className="stat-grid">
        <Tile
          icon={<Clock size={15} />}
          value={formatDuration(snap.ms)}
          label="Time in Lwen"
          sub={`${formatDuration(snap.sessionMs, { short: true })} this session`}
        />
        <Tile
          icon={<Keyboard size={15} />}
          value={formatCount(snap.keys)}
          label="Keystrokes"
          sub={perAsk ? `~${perAsk} per question` : null}
        />
        <Tile
          icon={<Message size={15} />}
          value={formatCount(snap.asks)}
          label="Questions asked"
          sub={`across ${totalChats} conversation${totalChats === 1 ? '' : 's'}`}
        />
        <Tile
          icon={<Mark size={15} width={2} />}
          value={formatCount(snap.replies)}
          label="Replies received"
          sub={snap.tokens ? `${formatCount(snap.tokens)} tokens generated` : null}
        />
      </div>

      <div className="rp-label" style={{ marginTop: 24, marginBottom: 10 }}>
        Last {DAYS_SHOWN} days
      </div>
      <div className="stat-bars">
        {recent.rows.map((r) => {
          const height = r.ms ? Math.max(4, Math.round((r.ms / recent.peak) * 100)) : 0
          const label = new Date(`${r.key}T00:00:00`).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })
          return (
            <span
              key={r.key}
              className="stat-bar"
              title={`${label} · ${formatDuration(r.ms)} · ${r.asks || 0} question${
                r.asks === 1 ? '' : 's'
              }`}
            >
              <i style={{ height: `${height}%` }} />
            </span>
          )
        })}
      </div>
      <div className="param-scale">
        <span>{DAYS_SHOWN} days ago</span>
        <span>Today</span>
      </div>

      <div className="rp-label" style={{ marginTop: 24, marginBottom: 10 }}>
        Library
      </div>
      <div className="stat-inline">
        <span>
          <Layers size={12} /> {projects.length} project{projects.length === 1 ? '' : 's'}
        </span>
        <span>
          <Message size={12} /> {totalChats} conversation{totalChats === 1 ? '' : 's'}
        </span>
        <span>{formatCount(totalMessages)} messages stored</span>
        <span>
          {snap.sessions || 1} session{(snap.sessions || 1) === 1 ? '' : 's'}
        </span>
      </div>

      <div className="modal-actions">
        <button className="btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  )
}
