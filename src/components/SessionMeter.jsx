import { useEffect, useState } from 'react'
import { Clock, Layers, Message } from './Icons'
import { useStats } from '../state/stats'
import { useStore } from '../state/store'
import { formatDuration } from '../lib/format'

/**
 * The strip above the account row: how big the library is, and how long this
 * sitting has been.
 *
 * The clock ticks in local state rather than through the stats context, so a
 * running timer re-renders these two lines and nothing else.
 */
export function SessionMeter() {
  const { state } = useStore()
  const stats = useStats()
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const startedAt = stats.sessionStartedAt()
    const tick = () => setElapsed(Date.now() - startedAt)
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [stats])

  const projects = state.projects.length
  const chats = state.projects.reduce((n, p) => n + p.chats.length, 0)

  return (
    <div className="side-meter">
      <span className="sm-counts">
        <span title={`${projects} project${projects === 1 ? '' : 's'}`}>
          <Layers size={11} /> {projects}
        </span>
        <span title={`${chats} conversation${chats === 1 ? '' : 's'}`}>
          <Message size={11} /> {chats}
        </span>
      </span>
      <span className="sm-clock" title="Time in this session">
        <Clock size={11} />
        {formatDuration(elapsed, { short: true })}
      </span>
    </div>
  )
}
