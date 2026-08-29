/**
 * Local account helpers: passcode hashing and profile pictures.
 *
 * Everything here stays on this machine — accounts exist so several people can
 * keep separate libraries on one desktop, not to secure anything against
 * someone who already has the disk. Passcodes are still hashed rather than
 * stored, because people reuse them.
 */

const ITERATIONS = 210_000
const KEY_BITS = 256

const subtle = globalThis.crypto?.subtle ?? null

const toHex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

const fromHex = (hex) =>
  new Uint8Array(hex.match(/.{1,2}/g)?.map((h) => parseInt(h, 16)) ?? [])

async function derive(passcode, salt, iterations = ITERATIONS) {
  const key = await subtle.importKey('raw', new TextEncoder().encode(passcode), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    KEY_BITS,
  )
  return toHex(bits)
}

export function passcodesAvailable() {
  return !!subtle
}

/** `null` for an account with no passcode — signing in is then one click. */
export async function hashPasscode(passcode) {
  if (!passcode) return null
  if (!subtle) throw new Error('This build cannot hash passcodes, so it cannot set one.')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return { algo: 'pbkdf2-sha256', iterations: ITERATIONS, salt: toHex(salt), hash: await derive(passcode, salt) }
}

export async function verifyPasscode(record, passcode) {
  if (!record) return true
  if (!subtle) return false
  // The stored count, not the current constant: raising ITERATIONS later must
  // not lock everyone out of the passcode they already set.
  const candidate = await derive(passcode ?? '', fromHex(record.salt), record.iterations || ITERATIONS)
  // Same length every time, so a plain comparison leaks nothing useful here.
  return candidate === record.hash
}

/* ------------------------------------------------------------------ avatars */

const AVATAR_PX = 256

/** Eight tints that read well on the dark background, keyed off the name. */
const TINTS = ['#D97757', '#C9A227', '#7FA87F', '#6E93B8', '#A981C4', '#C46D8E', '#5FA6A0', '#B5793F']

export function tintFor(name = '') {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0
  return TINTS[h % TINTS.length]
}

export function initialsOf(name = '') {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  if (words.length === 1) return [...words[0]].slice(0, 2).join('').toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

/**
 * Square-crops and shrinks a picked image to a data URL small enough to sit in
 * a JSON file — a few tens of KB rather than the multi-megabyte original.
 * `px` is the side of the output square: 256 for a profile picture, far less
 * for a project or model icon, of which there can be dozens in one file.
 */
export function imageToSquare(bytes, mime, px = AVATAR_PX) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([bytes], { type: mime || 'image/png' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      try {
        const side = Math.min(img.naturalWidth, img.naturalHeight)
        if (!side) throw new Error('That image looks empty.')
        const canvas = document.createElement('canvas')
        canvas.width = px
        canvas.height = px
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(
          img,
          (img.naturalWidth - side) / 2,
          (img.naturalHeight - side) / 2,
          side,
          side,
          0,
          0,
          px,
          px,
        )
        resolve(canvas.toDataURL('image/webp', 0.86))
      } catch (e) {
        reject(e)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Lwen could not read that image.'))
    }
    img.src = url
  })
}

export function imageToAvatar(bytes, mime) {
  return imageToSquare(bytes, mime, AVATAR_PX)
}

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  gif: 'image/gif', bmp: 'image/bmp', avif: 'image/avif',
}

export const AVATAR_EXTENSIONS = Object.keys(MIME)

export function mimeForImage(path) {
  return MIME[(path.split('.').pop() || '').toLowerCase()] ?? 'image/png'
}
