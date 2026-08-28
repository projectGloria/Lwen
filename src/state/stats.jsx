import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react'
import { backend } from '../lib/backend'

const STATS_VERSION = 1
const StatsContext = createContext(null)

/** How often accumulated counters reach the disk. */
const SAVE_MS = 15_000
/** Granularity of the "time in app" clock. */
const TICK_MS = 1000
/** A window left open overnight is not time spent in the app. */
const IDLE_MS = 5 * 60_000

const today = () => new Date().toISOString().slice(0, 10)

const emptyDay = () => ({ ms: 0, keys: 0, asks: 0, replies: 0, tokens: 0 })

const emptyStats = () => ({
  version: STATS_VERSION,
  firstSeen: Date.now(),
  sessions: 0,
  ms: 0,
  keys: 0,
  asks: 0,
  replies: 0,
  tokens: 0,
  /** 'YYYY-MM-DD' -> counters, so the modal can draw a recent-activity strip. */
  days: {},
})

function parse(json) {
  try {
    const raw = JSON.parse(json)
    if (!raw || typeof raw !== 'object') return emptyStats()
    const base = emptyStats()
    return {
      ...base,
      ...raw,
      days: raw.days && typeof raw.days === 'object' ? raw.days : {},
    }
  } catch {
    return emptyStats()
  }
}

/**
 * Usage counters for one account: time in the app, keystrokes, questions asked,
 * replies received.
 *
 * Everything is held in a ref and read through `snapshot()` rather than kept in
 * React state. Counting keystrokes means updating on every key, and a context
 * value that changed that often would re-render the entire app for a number
 * nobody is looking at — the one screen that shows these polls for them.
 */
export function StatsProvider({ user, children }) {
  const data = useRef(emptyStats())
  const loaded = useRef(false)
  const sessionStartedAt = useRef(Date.now())
  const lastActive = useRef(Date.now())
  const saveTimer = useRef(null)
  const dirty = useRef(false)
  const owner = useRef(user)

  const day = useCallback(() => {
    const key = today()
    if (!data.current.days[key]) data.current.days[key] = emptyDay()
    return data.current.days[key]
  }, [])

  const flush = useCallback(() => {
    const who = owner.current
    if (!who || !loaded.current || !dirty.current) return
    dirty.current = false
    backend.saveStats(who, JSON.stringify(data.current)).catch(() => {})
  }, [])

  const touch = useCallback(() => {
    dirty.current = true
    if (saveTimer.current) return
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      flush()
    }, SAVE_MS)
  }, [flush])

  /** Adds `n` to one counter, both lifetime and for today. */
  const bump = useCallback(
    (field, n = 1) => {
      if (!n) return
      data.current[field] = (data.current[field] || 0) + n
      const d = day()
      d[field] = (d[field] || 0) + n
      touch()
    },
    [day, touch],
  )

  /* ------------------------------------------------------------ loading */

  useEffect(() => {
    let cancelled = false
    owner.current = user
    loaded.current = false
    data.current = emptyStats()
    sessionStartedAt.current = Date.now()
    lastActive.current = Date.now()

    if (!user) return () => {}

    backend
      .loadStats(user)
      .then((json) => {
        if (cancelled) return
        data.current = json ? parse(json) : emptyStats()
        data.current.sessions = (data.current.sessions || 0) + 1
        loaded.current = true
        dirty.current = true
        flush()
      })
      .catch(() => {
        if (!cancelled) loaded.current = true
      })

    return () => {
      cancelled = true
      flush()
    }
  }, [user, flush])

  /* ------------------------------------------------------------ the clock */

  useEffect(() => {
    if (!user) return undefined
    const id = setInterval(() => {
      // Time only counts while the window is on screen, and stops accruing once
      // there has been no input for a while — an app left open is not use.
      if (document.hidden) return
      if (Date.now() - lastActive.current > IDLE_MS) return
      bump('ms', TICK_MS)
    }, TICK_MS)
    return () => clearInterval(id)
  }, [user, bump])

  /* --------------------------------------------------------- the counters */

  useEffect(() => {
    if (!user) return undefined
    const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock'])

    const onKey = (e) => {
      lastActive.current = Date.now()
      if (MODIFIERS.has(e.key)) return
      bump('keys')
    }
    const onPoint = () => {
      lastActive.current = Date.now()
    }
    const onHide = () => {
      if (document.hidden) flush()
      else lastActive.current = Date.now()
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPoint)
    document.addEventListener('wheel', onPoint, { passive: true })
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('beforeunload', flush)

    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPoint)
      document.removeEventListener('wheel', onPoint)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('beforeunload', flush)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = null
      flush()
    }
  }, [user, bump, flush])

  const value = useMemo(
    () => ({
      bump,
      /** A plain copy, safe to hold in component state. */
      snapshot: () => ({
        ...data.current,
        days: { ...data.current.days },
        sessionMs: Date.now() - sessionStartedAt.current,
        loaded: loaded.current,
      }),
      sessionStartedAt: () => sessionStartedAt.current,
      reset: () => {
        const fresh = emptyStats()
        fresh.sessions = 1
        data.current = fresh
        sessionStartedAt.current = Date.now()
        dirty.current = true
        flush()
      },
    }),
    [bump, flush],
  )

  return <StatsContext.Provider value={value}>{children}</StatsContext.Provider>
}

/** Never throws when there is no provider — the sign-in screen has none. */
const NO_STATS = {
  bump: () => {},
  snapshot: () => ({ ...emptyStats(), sessionMs: 0, loaded: false }),
  sessionStartedAt: () => Date.now(),
  reset: () => {},
}

export function useStats() {
  return useContext(StatsContext) ?? NO_STATS
}
