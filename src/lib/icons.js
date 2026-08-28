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
 */
export const ICON_PALETTE = [
  ['Work', ['📁', '📂', '🗂', '📋', '📌', '🗒', '📝', '📊', '📈', '🗓', '✅', '🎯']],
  ['Build', ['🛠', '⚙️', '🔧', '🔩', '🧰', '🏗', '🧪', '🔬', '🧩', '⚡', '🔌', '🖥']],
  ['Code', ['💻', '⌨️', '🖱', '🐛', '🧠', '🤖', '👾', '🔗', '📡', '🛰', '🗄', '🔐']],
  ['Craft', ['🎨', '✏️', '🖌', '📷', '🎬', '🎧', '🎵', '📖', '📚', '🪶', '🧵', '🪄']],
  ['Nature', ['🌱', '🌿', '🍃', '🌸', '🌊', '🔥', '❄️', '☀️', '🌙', '⭐', '🌍', '🪐']],
  ['Life', ['☕', '🍵', '🍎', '🚀', '🧭', '🗺', '🏠', '💡', '💰', '❤️', '🐢', '🦊']],
]
