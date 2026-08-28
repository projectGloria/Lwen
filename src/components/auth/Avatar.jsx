import { initialsOf, tintFor } from '../../lib/accounts'

/** A profile picture, or the account's initials on a colour drawn from its name. */
export function Avatar({ user, size = 32, className = '' }) {
  const name = user?.name ?? ''
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) }

  if (user?.avatar) {
    return (
      <img
        className={`avatar${className ? ` ${className}` : ''}`}
        src={user.avatar}
        alt=""
        style={style}
        draggable={false}
      />
    )
  }

  return (
    <span
      className={`avatar initials${className ? ` ${className}` : ''}`}
      style={{ ...style, background: tintFor(name) }}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  )
}
