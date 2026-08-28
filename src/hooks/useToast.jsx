import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
  }, [])

  const push = useCallback(
    (text, { tone = 'ok', duration } = {}) => {
      const id = `${Date.now()}-${Math.random()}`
      // Errors are wordier, so they linger — and a long one needs longer still.
      const ms = duration ?? (tone === 'error' ? (text.length > 140 ? 12000 : 6000) : 2600)
      setToasts((list) => [...list.slice(-3), { id, text, tone }])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), ms),
      )
      return id
    },
    [dismiss],
  )

  const value = useMemo(
    () => ({
      toasts,
      toast: push,
      error: (text, opts) => push(text, { ...opts, tone: 'error' }),
      dismiss,
    }),
    [toasts, push, dismiss],
  )

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
