import { useCallback, useState } from 'react'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { Close, Spinner, Upload } from '../Icons'
import { backend } from '../../lib/backend'
import { AVATAR_EXTENSIONS, mimeForImage } from '../../lib/accounts'
import { ICON_PALETTE, imageToIcon, isIcon, normalizeIcon, sameEmoji } from '../../lib/icons'
import { useToast } from '../../hooks/useToast'

const MAX_PICTURE_BYTES = 20 * 1024 * 1024

/**
 * Renders whatever an icon is, or `fallback` when there is none. Used for
 * projects, conversations and models alike, so the three never drift apart.
 */
export function IconGlyph({ icon: stored, size = 16, fallback = null, className = '' }) {
  // Normalised on the way out rather than on the way in, so an icon saved by an
  // older build renders correctly without having to rewrite `library.json`.
  const icon = normalizeIcon(stored)
  if (isIcon(icon) && icon.kind === 'image') {
    return (
      <img
        className={`icon-img ${className}`}
        src={icon.value}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
      />
    )
  }
  if (isIcon(icon) && icon.kind === 'emoji') {
    return (
      <span
        className={`icon-emoji ${className}`}
        style={{ fontSize: Math.round(size * 0.86), lineHeight: `${size}px`, width: size, height: size }}
        aria-hidden="true"
      >
        {icon.value}
      </span>
    )
  }
  return fallback
}

/**
 * Emoji palette plus "use a picture". Any image file works — it is cropped
 * square and shrunk before it is stored, so a 6 MB photo does not end up inside
 * `library.json`.
 */
export function IconPicker({ value, onChange, fallback = null, label = 'Icon' }) {
  const { error } = useToast()
  const [busy, setBusy] = useState(false)

  const pickImage = useCallback(async () => {
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
      onChange(await imageToIcon(buffer, mimeForImage(picked)))
    } catch (e) {
      error(e?.message || 'Could not use that picture.')
    } finally {
      setBusy(false)
    }
  }, [onChange, error])

  return (
    <div className="iconpick">
      <div className="iconpick-top">
        <span className="iconpick-preview">
          {busy ? <Spinner size={16} /> : <IconGlyph icon={value} size={28} fallback={fallback} />}
        </span>
        <div className="iconpick-actions">
          <span className="iconpick-label">{label}</span>
          <div className="iconpick-btns">
            <button type="button" className="btn-ghost" onClick={pickImage} disabled={busy}>
              <Upload size={13} /> Use a picture…
            </button>
            {isIcon(value) && (
              <button type="button" className="btn-ghost" onClick={() => onChange(null)}>
                <Close size={12} /> Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="iconpick-grid">
        {ICON_PALETTE.map(([group, list]) => (
          <div key={group} className="iconpick-group">
            <div className="iconpick-group-name">{group}</div>
            <div className="iconpick-row">
              {list.map((e) => (
                <button
                  key={e}
                  type="button"
                  className={`iconpick-cell${
                    value?.kind === 'emoji' && sameEmoji(value.value, e) ? ' on' : ''
                  }`}
                  onClick={() => onChange({ kind: 'emoji', value: e })}
                  title={e}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
