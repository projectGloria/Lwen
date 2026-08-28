import { useEffect, useRef, useState } from 'react'
import { Avatar } from './Avatar'
import { Mark, Plus, Spinner, User } from '../Icons'
import { useAuth } from '../../state/auth'
import { passcodesAvailable } from '../../lib/accounts'
import { relativeTime } from '../../lib/format'

/**
 * Who is using Lwen. Accounts are local folders on this machine — the passcode
 * only keeps other people at this desktop out of your conversations, it does
 * not encrypt anything.
 */
export function AuthScreen() {
  const { users, loading, error, lastUserId, register, signIn } = useAuth()
  const [mode, setMode] = useState('pick')
  const [selected, setSelected] = useState(null)
  const [name, setName] = useState('')
  const [passcode, setPasscode] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)
  const firstField = useRef(null)

  // No accounts yet means there is nothing to pick from — go straight to the
  // form so the very first launch is one field and a button.
  useEffect(() => {
    if (loading) return
    if (!users.length) {
      setMode('register')
      return
    }
    setSelected((current) => current ?? users.find((u) => u.id === lastUserId) ?? users[0])
  }, [loading, users, lastUserId])

  useEffect(() => {
    firstField.current?.focus()
  }, [mode, selected?.id])

  const reset = () => {
    setPasscode('')
    setConfirm('')
    setProblem(null)
  }

  const submitSignIn = async (e) => {
    e?.preventDefault()
    if (!selected || busy) return
    setBusy(true)
    setProblem(null)
    try {
      await signIn(selected.id, passcode)
    } catch (err) {
      setProblem(err?.message || 'That did not work.')
      setPasscode('')
    } finally {
      setBusy(false)
    }
  }

  const submitRegister = async (e) => {
    e?.preventDefault()
    if (busy) return
    if (passcode && passcode !== confirm) {
      setProblem('The two passcodes are different.')
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      await register({ name, passcode })
    } catch (err) {
      setProblem(err?.message || 'That did not work.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="auth-veil">
        <div className="auth-card">
          <Spinner size={18} />
        </div>
      </div>
    )
  }

  return (
    <div className="auth-veil">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="mark">
            <Mark size={30} width={1.9} />
          </span>
          <div>
            <h1>Lwen</h1>
            <p>Everything here stays on this computer.</p>
          </div>
        </div>

        {error && <div className="auth-error">{error}</div>}

        {mode === 'register' ? (
          <form className="auth-body" onSubmit={submitRegister}>
            <h2>{users.length ? 'Add an account' : 'Create your account'}</h2>
            <p className="auth-sub">
              Your projects and conversations are saved in a folder named after this account.
            </p>

            <label className="auth-field">
              <span>Name</span>
              <input
                ref={firstField}
                value={name}
                maxLength={32}
                placeholder="Nihil"
                autoComplete="off"
                spellCheck="false"
                onChange={(e) => {
                  setName(e.target.value)
                  setProblem(null)
                }}
              />
            </label>

            {passcodesAvailable() && (
              <>
                <label className="auth-field">
                  <span>
                    Passcode <em>optional</em>
                  </span>
                  <input
                    type="password"
                    value={passcode}
                    autoComplete="new-password"
                    placeholder="Leave empty to sign in with one click"
                    onChange={(e) => {
                      setPasscode(e.target.value)
                      setProblem(null)
                    }}
                  />
                </label>

                {passcode && (
                  <label className="auth-field">
                    <span>Repeat passcode</span>
                    <input
                      type="password"
                      value={confirm}
                      autoComplete="new-password"
                      onChange={(e) => {
                        setConfirm(e.target.value)
                        setProblem(null)
                      }}
                    />
                  </label>
                )}
              </>
            )}

            {problem && <div className="auth-error">{problem}</div>}

            <button className="btn-primary auth-go" type="submit" disabled={busy || !name.trim()}>
              {busy ? <Spinner size={13} /> : <User size={14} />}
              {busy ? 'Creating…' : 'Create account'}
            </button>

            {users.length > 0 && (
              <button
                type="button"
                className="auth-link"
                onClick={() => {
                  reset()
                  setName('')
                  setMode('pick')
                }}
              >
                Back to accounts
              </button>
            )}
          </form>
        ) : (
          <form className="auth-body" onSubmit={submitSignIn}>
            <h2>Welcome back</h2>
            <p className="auth-sub">Pick an account to open its library.</p>

            <div className="auth-users">
              {users.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className={`auth-user${selected?.id === u.id ? ' on' : ''}`}
                  onClick={() => {
                    setSelected(u)
                    reset()
                  }}
                >
                  <Avatar user={u} size={38} />
                  <span className="au-text">
                    <span className="au-name">{u.name}</span>
                    <span className="au-sub">
                      {u.passcode ? 'Passcode' : 'No passcode'}
                      {u.lastSignIn ? ` · ${relativeTime(u.lastSignIn)}` : ''}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            {selected?.passcode && (
              <label className="auth-field">
                <span>Passcode</span>
                <input
                  ref={firstField}
                  type="password"
                  value={passcode}
                  autoComplete="current-password"
                  onChange={(e) => {
                    setPasscode(e.target.value)
                    setProblem(null)
                  }}
                />
              </label>
            )}

            {problem && <div className="auth-error">{problem}</div>}

            <button className="btn-primary auth-go" type="submit" disabled={busy || !selected}>
              {busy ? <Spinner size={13} /> : null}
              {busy ? 'Opening…' : `Continue as ${selected?.name ?? '…'}`}
            </button>

            <button
              type="button"
              className="auth-link"
              onClick={() => {
                reset()
                setMode('register')
              }}
            >
              <Plus size={12} /> Add another account
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
