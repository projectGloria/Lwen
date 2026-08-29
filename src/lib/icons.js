import { imageToSquare } from './accounts'

/**
 * Icons for projects, conversations and models.
 *
 * An icon is `{ kind: 'emoji', value }` or `{ kind: 'image', value }` where the
 * image is a data URL. They live inside `library.json` next to the thing they
 * belong to, so the file has to stay small: images are cropped square and shrunk
 * to `ICON_PX` before they are stored, which puts a typical one under 6 KB.
 */
export const ICON_PX = 96

/** A picked image can be any size; the crop below is what actually gets kept. */
export async function imageToIcon(bytes, mime) {
  return { kind: 'image', value: await imageToSquare(bytes, mime, ICON_PX) }
}

export function isIcon(icon) {
  return !!icon && (icon.kind === 'emoji' || icon.kind === 'image') && !!icon.value
}

/**
 * A small, opinionated palette rather than a full emoji keyboard: these are the
 * shapes that read at 16px in a sidebar, which most emoji do not.
 *
 * Every entry that Unicode gives `Emoji_Presentation=No` — the pictographs
 * carried over from Wingdings, such as U+1F6E0 and the U+1F5xx block — is
 * written with a trailing U+FE0F. Without it Windows picks the *text*
 * presentation and the glyph comes out as a flat monochrome outline in a
 * fallback font, which is what "the icons look broken" turns out to be.
 * `sameEmoji` below exists because icons picked before this was fixed were
 * stored without the selector.
 */
export const ICON_PALETTE = [
  ['Work', ['📁', '📂', '🗂️', '📋', '📌', '🗒️', '📝', '📊', '📈', '🗓️', '✅', '🎯']],
  ['Build', ['🛠️', '⚙️', '🔧', '🔩', '🧰', '🏗️', '🧪', '🔬', '🧩', '⚡', '🔌', '🖥️']],
  ['Code', ['💻', '⌨️', '🖱️', '🐛', '🧠', '🤖', '👾', '🔗', '📡', '🛰️', '🗄️', '🔐']],
  ['Craft', ['🎨', '✏️', '🖌️', '📷', '🎬', '🎧', '🎵', '📖', '📚', '🪶', '🧵', '🪄']],
  ['Nature', ['🌱', '🌿', '🍃', '🌸', '🌊', '🔥', '❄️', '☀️', '🌙', '⭐', '🌍', '🪐']],
  ['Life', ['☕', '🍵', '🍎', '🚀', '🧭', '🗺️', '🏠', '💡', '💰', '❤️', '🐢', '🦊']],
]

/**
 * Compares two emoji ignoring the variation selector, so an icon stored before
 * the palette carried U+FE0F still matches the cell it was picked from.
 */
export function sameEmoji(a, b) {
  if (!a || !b) return false
  return stripVS(a) === stripVS(b)
}

const stripVS = (s) => (s.includes('️') ? s.replace(/️/g, '') : s)

/** Palette spelling, looked up by the selector-less form. Built once. */
const CANONICAL = new Map()
for (const [, list] of ICON_PALETTE) {
  for (const emoji of list) CANONICAL.set(stripVS(emoji), emoji)
}

/**
 * Brings a stored icon up to the palette's spelling. Called on every icon
 * render, so the common cases — an image, or an emoji already written the way
 * the palette writes it — return the very same object rather than a copy.
 */
export function normalizeIcon(icon) {
  if (!icon || icon.kind !== 'emoji' || !icon.value) return icon
  const canonical = CANONICAL.get(stripVS(icon.value))
  if (!canonical || canonical === icon.value) return icon
  return { ...icon, value: canonical }
}
