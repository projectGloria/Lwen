import { Close, FileIcon, Spinner, Warn } from '../Icons'
import { formatBytes } from '../../lib/format'
import { estimateTokens, formatTokens } from '../../lib/tokens'

function Pill({ item, onRemove }) {
  if (item.status === 'loading') {
    return (
      <span className="attach-pill busy">
        <Spinner size={12} />
        <span className="an">{item.name}</span>
      </span>
    )
  }

  if (item.status === 'error') {
    return (
      <span className="attach-pill bad" title={item.error}>
        <Warn size={12} />
        <span className="an">{item.name}</span>
        <button className="ax" onClick={() => onRemove(item.id)} title="Remove" aria-label="Remove">
          <Close size={11} />
        </button>
      </span>
    )
  }

  const tokens = formatTokens(estimateTokens(item.text))
  return (
    <span className="attach-pill" title={`${item.path}\n${formatBytes(item.bytes)} · ~${tokens} tokens`}>
      <FileIcon size={12} />
      <span className="an">{item.name}</span>
      <span className="asz">~{tokens}</span>
      <button className="ax" onClick={() => onRemove(item.id)} title="Remove" aria-label="Remove">
        <Close size={11} />
      </button>
    </span>
  )
}

export function AttachmentRow({ items, onRemove }) {
  if (!items.length) return null
  return (
    <div className="attach-row">
      {items.map((item) => (
        <Pill key={item.id} item={item} onRemove={onRemove} />
      ))}
    </div>
  )
}
