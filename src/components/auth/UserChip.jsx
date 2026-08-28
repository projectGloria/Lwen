import { useCallback, useEffect, useRef, useState } from 'react'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { Avatar } from './Avatar'
import { Menu } from '../ui/Overlays'
import { Camera, Chart, Chevron, Close, Folder, Slash, SignOut, Spinner, Users } from '../Icons'
import { useAuth } from '../../state/auth'
import { useStore } from '../../state/store'
import { useLibrary } from '../../state/library'
import { useToast } from '../../hooks/useToast'
import { backend } from '../../lib/backend'
import { AVATAR_EXTENSIONS, imageToAvatar, mimeForImage } from '../../lib/accounts'

const MAX_PICTURE_BYTES = 20 * 1024 * 1024

/**
 * The signed-in account, and the things you can do to it: change the picture,
 * open its folder on disk, switch to someone else, or sign out.
 *
 * `variant` picks between the wide row at the foot of the chat sidebar and the
 * compact button in the dashboard's top bar.
 */
export function UserChip({ variant = 'row' }) {
  const { user, users, signOut, updateProfile } = useAuth()
  const { state } = useStore()
  const lib = useLibrary()
  const { toast, error } = useToast()
  const [menuAt, setMenuAt] = useState(null)
  const [busy, setBusy] = useState(false)
  const [folder, setFolder] = useState(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    if (!user) return
    backend
      .userFolder(user.name)
      .then((path) => alive.current && setFolder(path))
      .catch(() => {})
  }, [user])

  const pickPicture = useCallback(async () => {
    setMenuAt(null)
    try {
      const picked = await openDialog({
        multiple: false,
        filters: [{ name: 'Images', extensions: AVATAR_EXTENSIONS }],
      })
      if (!picked) return
      setBusy(true)
      const buffer = await backend.readFileBytes(picked)
      if ((buffer.byteLength ?? 0) > MAX_PICTURE_BYTES) {
        throw new Error('That picture is larger than 20 MB.')
      }
      const avatar = await imageToAvatar(buffer, mimeForImage(picked))
      await updateProfile({ avatar })
      toast('Profile picture updated')
    } catch (e) {
      error(e?.message || 'Could not use that picture.')
    } finally {
      if (alive.current) setBusy(false)
    }
  }, [updateProfile, toast, error])

  const clearPicture = async () => {
    setMenuAt(null)
    try {
      await updateProfile({ avatar: null })
      toast('Profile picture removed')
    } catch (e) {
      error(e?.message || 'Could not update your profile.')
    }
  }

  const openFolder = async () => {
    setMenuAt(null)
    if (!folder) return
    try {
      await revealItemInDir(folder)
    } catch {
      error(`Your folder is at ${folder}`)
    }
  }

  if (!user) return null

  const projectCount = state.projects.length
  const chatCount = state.projects.reduce((n, p) => n + p.chats.length, 0)

  const menu = menuAt && (
    <Menu anchor={menuAt} onClose={() => setMenuAt(null)} width={218} align={variant === 'row' ? 'start' : 'end'}>
      <div className="menu-head">
        <div className="mh-name">{user.name}</div>
        {folder && (
          <div className="mh-path" title={folder}>
            {folder}
          </div>
        )}
      </div>
      <button onClick={pickPicture}>
        <Camera size={13} /> {user.avatar ? 'Change picture…' : 'Set picture…'}
      </button>
      {user.avatar && (
        <button onClick={clearPicture}>
          <Close size={12} /> Remove picture
        </button>
      )}
      <button onClick={openFolder} disabled={!folder}>
        <Folder size={13} /> Open my folder
      </button>
      <div className="sep" />
      <button
        onClick={() => {
          setMenuAt(null)
          lib.openStats()
        }}
      >
        <Chart size={13} /> Statistics
      </button>
      <button
        onClick={() => {
          setMenuAt(null)
          lib.openCommands()
        }}
      >
        <Slash size={13} /> Slash commands
      </button>
      <div className="sep" />
      <button
        onClick={() => {
          setMenuAt(null)
          signOut()
        }}
      >
        <Users size={13} /> Switch user{users.length > 1 ? ` (${users.length})` : ''}
      </button>
      <button
        onClick={() => {
          setMenuAt(null)
          signOut({ forget: true })
          toast('Signed out')
        }}
      >
        <SignOut size={13} /> Sign out
      </button>
    </Menu>
  )

  if (variant === 'compact') {
    return (
      <>
        <button
          className={`user-compact${menuAt ? ' open' : ''}`}
          onClick={(e) => setMenuAt(e.currentTarget)}
          title={`${user.name} — account`}
        >
          {busy ? <Spinner size={14} /> : <Avatar user={user} size={28} />}
          <span className="uc-name">{user.name}</span>
        </button>
        {menu}
      </>
    )
  }

  return (
    <>
      <button
        className={`user-foot${menuAt ? ' open' : ''}`}
        onClick={(e) => setMenuAt(e.currentTarget)}
        title={`${user.name} — account`}
      >
        {busy ? (
          <span className="avatar initials" style={{ width: 30, height: 30 }}>
            <Spinner size={13} />
          </span>
        ) : (
          <Avatar user={user} size={30} />
        )}
        <span className="uf-text">
          <span className="uf-name">{user.name}</span>
          <span className="uf-sub">
            {projectCount} project{projectCount === 1 ? '' : 's'} · {chatCount} chat
            {chatCount === 1 ? '' : 's'}
          </span>
        </span>
        <span className="uf-chev">
          <Chevron size={12} />
        </span>
      </button>
      {menu}
    </>
  )
}
