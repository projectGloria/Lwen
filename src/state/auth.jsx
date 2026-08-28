import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { backend } from '../lib/backend'
import { hashPasscode, verifyPasscode } from '../lib/accounts'
import { uid } from './store'

const ACCOUNTS_VERSION = 1
const AuthContext = createContext(null)

/** Who signed in last, so the sign-in screen opens on the right card. */
const LAST_USER_KEY = 'lwen.lastUser'

function parseAccounts(json) {
  try {
    const raw = JSON.parse(json)
    const users = Array.isArray(raw?.users) ? raw.users : []
    return users
      .filter((u) => u && typeof u.name === 'string' && u.name.trim())
      .map((u) => ({
        id: u.id || uid(),
        name: u.name,
        avatar: typeof u.avatar === 'string' ? u.avatar : null,
        passcode: u.passcode ?? null,
        createdAt: u.createdAt || Date.now(),
        lastSignIn: u.lastSignIn || 0,
      }))
  } catch {
    return []
  }
}

export function AuthProvider({ children }) {
  const [users, setUsers] = useState([])
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    backend
      .loadUsers()
      .then((json) => {
        if (cancelled) return
        setUsers(json ? parseAccounts(json) : [])
      })
      .catch((e) => !cancelled && setError(e?.message || 'Could not read the account list.'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  /** Persist first, then update state: a lost write must not look like a save. */
  const persist = useCallback(async (next) => {
    await backend.saveUsers(JSON.stringify({ version: ACCOUNTS_VERSION, users: next }))
    setUsers(next)
    return next
  }, [])

  const register = useCallback(
    async ({ name, passcode }) => {
      const trimmed = name.trim()
      if (!trimmed) throw new Error('Choose a name for this account.')
      if (trimmed.length > 32) throw new Error('That name is a little long — 32 characters or fewer.')
      if (users.some((u) => u.name.toLowerCase() === trimmed.toLowerCase())) {
        throw new Error(`There is already an account called “${trimmed}”.`)
      }

      const account = {
        id: uid(),
        name: trimmed,
        avatar: null,
        passcode: await hashPasscode(passcode),
        createdAt: Date.now(),
        lastSignIn: Date.now(),
      }
      await persist([...users, account])
      // An install that predates accounts has one library at the data root;
      // the first account created takes it over rather than starting empty.
      if (!users.length) await backend.adoptLegacyLibrary(account.name).catch(() => {})
      localStorage.setItem(LAST_USER_KEY, account.id)
      setUser(account)
      return account
    },
    [users, persist],
  )

  const signIn = useCallback(
    async (id, passcode) => {
      const account = users.find((u) => u.id === id)
      if (!account) throw new Error('That account is gone.')
      if (!(await verifyPasscode(account.passcode, passcode))) {
        throw new Error('That passcode does not match.')
      }
      const stamped = { ...account, lastSignIn: Date.now() }
      await persist(users.map((u) => (u.id === id ? stamped : u)))
      localStorage.setItem(LAST_USER_KEY, id)
      setUser(stamped)
      return stamped
    },
    [users, persist],
  )

  /**
   * Both routes back to the account screen. Signing out also forgets which
   * account was last used, so the picker does not preselect it; switching
   * keeps it, because you are likely coming straight back.
   */
  const signOut = useCallback(({ forget = false } = {}) => {
    if (forget) localStorage.removeItem(LAST_USER_KEY)
    setUser(null)
  }, [])

  const updateProfile = useCallback(
    async (patch) => {
      if (!user) return null
      const next = { ...user, ...patch }
      await persist(users.map((u) => (u.id === user.id ? next : u)))
      setUser(next)
      return next
    },
    [user, users, persist],
  )

  const value = useMemo(
    () => ({
      users,
      user,
      loading,
      error,
      lastUserId: localStorage.getItem(LAST_USER_KEY),
      register,
      signIn,
      signOut,
      updateProfile,
    }),
    [users, user, loading, error, register, signIn, signOut, updateProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
