const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

/** The Lwen mark: eight spokes. */
export const Mark = ({ size = 20, width = 2.1 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} strokeWidth={width}>
    <line x1="12" y1="2.5" x2="12" y2="7.2" />
    <line x1="12" y1="16.8" x2="12" y2="21.5" />
    <line x1="2.5" y1="12" x2="7.2" y2="12" />
    <line x1="16.8" y1="12" x2="21.5" y2="12" />
    <line x1="5.4" y1="5.4" x2="8.7" y2="8.7" />
    <line x1="15.3" y1="15.3" x2="18.6" y2="18.6" />
    <line x1="18.6" y1="5.4" x2="15.3" y2="8.7" />
    <line x1="8.7" y1="15.3" x2="5.4" y2="18.6" />
  </svg>
)

const icon =
  (path, defaultSize = 15, defaultWidth = 1.8) =>
  ({ size = defaultSize, width = defaultWidth, ...rest }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} strokeWidth={width} {...rest}>
      {path}
    </svg>
  )

export const Search = icon(
  <>
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.5" y2="16.5" />
  </>,
  15,
  2,
)

export const Plus = icon(
  <>
    <line x1="12" y1="4" x2="12" y2="20" />
    <line x1="4" y1="12" x2="20" y2="12" />
  </>,
  13,
  2.6,
)

export const Folder = icon(
  <path d="M3.5 7a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
)

export const FolderOpen = icon(
  <>
    <path d="M3.5 7a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v1" />
    <path d="M3.5 9.5h17.2l-2 8a1.6 1.6 0 0 1-1.5 1.2H5.2a1.6 1.6 0 0 1-1.6-1.4z" />
  </>,
)

export const Message = icon(
  <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.6-.8L3 20l1-5a8.4 8.4 0 1 1 17-3.5z" />,
  13,
)

export const Clock = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
  12,
  1.9,
)

export const Chevron = icon(<path d="M9 5l7 7-7 7" />, 11, 2.4)
export const ChevronLeft = icon(<path d="M15 5l-7 7 7 7" />, 16, 2.2)
export const ChevronDown = icon(<path d="M5 9l7 7 7-7" />, 14, 2.2)

export const Dots = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="19" cy="12" r="1.6" />
  </svg>
)

export const Menu = icon(
  <>
    <line x1="4" y1="7" x2="20" y2="7" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="17" x2="20" y2="17" />
  </>,
  17,
  2,
)

export const Sliders = icon(
  <>
    <line x1="4" y1="8" x2="20" y2="8" />
    <circle cx="9" cy="8" r="2.4" fill="var(--bg-panel)" />
    <line x1="4" y1="16" x2="20" y2="16" />
    <circle cx="15" cy="16" r="2.4" fill="var(--bg-panel)" />
  </>,
  16,
  1.9,
)

export const Gear = icon(
  <>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4.4l-.4 2.5a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.5h4.4l.4-2.5a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" />
  </>,
  15,
  1.9,
)

export const Send = icon(
  <>
    <line x1="12" y1="20" x2="12" y2="5" />
    <path d="M5 12l7-7 7 7" />
  </>,
  15,
  2.4,
)

export const Square = icon(<rect x="6.5" y="6.5" width="11" height="11" rx="2" />, 15, 2)

export const Paperclip = icon(
  <path d="M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.4 3.4 0 0 1 4.8 4.8L9.7 17.4a1.8 1.8 0 0 1-2.5-2.5l7.8-7.8" />,
  15,
  1.9,
)

export const FileIcon = icon(
  <>
    <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z" />
    <path d="M14 3.5V8h4.5" />
  </>,
  14,
)

export const Close = icon(
  <>
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </>,
  13,
  2.2,
)

export const Check = icon(<path d="M4.5 12.5l5 5 10-11" />, 13, 2.4)

export const Copy = icon(
  <>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M15 6.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h.5" />
  </>,
  13,
  1.8,
)

export const Refresh = icon(
  <>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </>,
  13,
  2,
)

export const Play = icon(<path d="M7 4.5l12 7.5-12 7.5z" />, 13, 2)
export const Stop = icon(<rect x="5.5" y="5.5" width="13" height="13" rx="2.5" />, 13, 2)

export const Power = icon(
  <>
    <path d="M12 3.5v8" />
    <path d="M6.8 7.2a7.5 7.5 0 1 0 10.4 0" />
  </>,
  14,
  2,
)

export const Warn = icon(
  <>
    <path d="M12 4.5l8.5 15h-17z" />
    <line x1="12" y1="10" x2="12" y2="14" />
    <circle cx="12" cy="16.8" r=".9" fill="currentColor" stroke="none" />
  </>,
  14,
  1.8,
)

export const Info = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <line x1="12" y1="11" x2="12" y2="16.5" />
    <circle cx="12" cy="7.8" r=".9" fill="currentColor" stroke="none" />
  </>,
  14,
  1.8,
)

export const Trash = icon(
  <>
    <path d="M4.5 6.5h15" />
    <path d="M9 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h3.4A1.3 1.3 0 0 1 15 4.8v1.7" />
    <path d="M6.5 6.5l.8 12a1.6 1.6 0 0 0 1.6 1.5h6.2a1.6 1.6 0 0 0 1.6-1.5l.8-12" />
  </>,
  13,
  1.8,
)

export const Pencil = icon(
  <>
    <path d="M4.5 19.5h4l10-10a2.1 2.1 0 0 0-3-3l-10 10z" />
    <path d="M14.5 6.5l3 3" />
  </>,
  13,
  1.8,
)

export const Pin = icon(
  <>
    <path d="M9 3.5h6l-.8 5.2 3.3 3.3H6.5l3.3-3.3z" />
    <line x1="12" y1="12" x2="12" y2="20.5" />
  </>,
  12,
  1.8,
)

export const Eye = icon(
  <>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </>,
  13,
  1.8,
)

export const Layers = icon(
  <>
    <path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8z" />
    <path d="M3.5 12.5l8.5 4.5 8.5-4.5" />
  </>,
  13,
  1.8,
)

export const Download = icon(
  <>
    <path d="M12 4v11" />
    <path d="M7.5 10.5L12 15l4.5-4.5" />
    <path d="M4.5 19.5h15" />
  </>,
  20,
  1.8,
)

export const Spinner = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} strokeWidth="2.4" className="spin">
    <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5" />
  </svg>
)

export const Help = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.3 9.2a2.8 2.8 0 1 1 3.3 3.5c-.4.1-.6.5-.6.9v.6" />
    <line x1="12" y1="17.2" x2="12" y2="17.3" />
  </>,
  13,
  1.7,
)

export const User = icon(
  <>
    <circle cx="12" cy="8.2" r="3.9" />
    <path d="M4.6 20a7.4 7.4 0 0 1 14.8 0" />
  </>,
)

export const Users = icon(
  <>
    <circle cx="9.4" cy="8.6" r="3.4" />
    <path d="M3 19.6a6.4 6.4 0 0 1 12.8 0" />
    <path d="M16.2 5.6a3.4 3.4 0 0 1 0 6.5" />
    <path d="M18 14.2a6.4 6.4 0 0 1 3 5.4" />
  </>,
)

export const SignOut = icon(
  <>
    <path d="M14.5 4.5h3.2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3.2" />
    <path d="M10 8.2 6 12l4 3.8" />
    <line x1="6.4" y1="12" x2="15" y2="12" />
  </>,
)

export const Camera = icon(
  <>
    <path d="M3.5 8.6a1.8 1.8 0 0 1 1.8-1.8h2l1.3-2h4.8l1.3 2h2a1.8 1.8 0 0 1 1.8 1.8v8.6a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8z" />
    <circle cx="12" cy="12.9" r="3.4" />
  </>,
)

export const Restore = icon(
  <>
    <path d="M4.6 11.4a7.6 7.6 0 1 1 2 6" />
    <path d="M4.2 5.6v5.6h5.6" />
  </>,
  14,
  1.9,
)

export const Upload = icon(
  <>
    <path d="M12 19.5V8" />
    <path d="M7.5 12.5 12 8l4.5 4.5" />
    <path d="M4.5 4.5h15" />
  </>,
  15,
  1.8,
)

export const Grid = icon(
  <>
    <rect x="4" y="4" width="7" height="7" rx="1.6" />
    <rect x="13" y="4" width="7" height="7" rx="1.6" />
    <rect x="4" y="13" width="7" height="7" rx="1.6" />
    <rect x="13" y="13" width="7" height="7" rx="1.6" />
  </>,
  15,
  1.7,
)

export const PanelLeft = icon(
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <line x1="9.6" y1="4.5" x2="9.6" y2="19.5" />
  </>,
  16,
  1.7,
)

export const Chart = icon(
  <>
    <path d="M4.5 19.5h15" />
    <rect x="6" y="11" width="3.2" height="6" rx="1" />
    <rect x="11.4" y="7" width="3.2" height="10" rx="1" />
    <rect x="16.8" y="13.5" width="3.2" height="3.5" rx="1" />
  </>,
  15,
  1.7,
)

export const Slash = icon(
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
    <path d="M13.6 8.4 10.4 15.6" />
  </>,
  15,
  1.7,
)

export const Keyboard = icon(
  <>
    <rect x="2.6" y="6" width="18.8" height="12" rx="2.4" />
    <line x1="6.4" y1="9.8" x2="6.5" y2="9.8" />
    <line x1="10" y1="9.8" x2="10.1" y2="9.8" />
    <line x1="13.6" y1="9.8" x2="13.7" y2="9.8" />
    <line x1="17.2" y1="9.8" x2="17.3" y2="9.8" />
    <line x1="8" y1="14.2" x2="16" y2="14.2" />
  </>,
  15,
  1.7,
)

export const Image = icon(
  <>
    <rect x="3.5" y="4.8" width="17" height="14.4" rx="2.4" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m4.6 17.4 4.6-4.3 3.4 3.1 2.8-2.4 4 3.6" />
  </>,
  15,
  1.7,
)
