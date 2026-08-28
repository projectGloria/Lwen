import { useEffect, useRef, useState } from 'react'
import { Menu, useContextMenu } from '../ui/Overlays'
import { IconModal } from '../library/IconModal'
import { ModelIcon, brandFor } from '../ModelIcons'
import { Check, Chevron, Image } from '../Icons'
import { useOllama } from '../../hooks/useOllama'
import { useModelIcons } from '../../hooks/useModelIcons'
import { useCurrent, useStore } from '../../state/store'
import { formatBytes } from '../../lib/format'

const MIN_CTX = 2048

/**
 * Model picker for the composer bar. Selecting a model also keeps the
 * project's context window inside what that model actually supports.
 *
 * It is a menu rather than a `<select>` so each model can carry its family's
 * mark — a native option list cannot hold an icon. Right-clicking a row swaps
 * that mark for one of your own.
 */
export function ModelSelector({ openKey = 0 }) {
  const { models, status } = useOllama()
  const { dispatch } = useStore()
  const { project } = useCurrent()
  const { iconFor, setIcon } = useModelIcons()
  const [menuAt, setMenuAt] = useState(null)
  const [iconTarget, setIconTarget] = useState(null)
  const rowMenu = useContextMenu()
  const [rowModel, setRowModel] = useState(null)
  const button = useRef(null)
  const selected = project?.settings.model || ''

  // `/model` bumps this counter rather than setting a flag, so asking twice in
  // a row works even after the menu was dismissed by hand.
  useEffect(() => {
    if (openKey > 0) setMenuAt(button.current)
  }, [openKey])

  // Fall back to the first installed model when the saved one is gone.
  useEffect(() => {
    if (!project || !models.length) return
    const stillThere = models.some((m) => m.name === selected)
    if (!selected || !stillThere) {
      apply(models[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, selected, project?.id])

  function apply(model) {
    if (!project || !model) return
    const max = model.contextLength || 0
    const patch = { model: model.name }
    if (max > 0) {
      const current = project.settings.contextWindow || 0
      patch.contextWindow = Math.max(MIN_CTX, Math.min(current || Math.min(max, 8192), max))
    }
    dispatch({ type: 'project/settings', id: project.id, patch })
  }

  const disabled = !status.reachable || models.length === 0
  const label = selected || (status.reachable ? 'No models installed' : 'Ollama offline')

  return (
    <div className="model-select">
      <button
        ref={button}
        className={`model-pick${menuAt ? ' open' : ''}`}
        disabled={disabled}
        onClick={() => setMenuAt(menuAt ? null : button.current)}
        title={disabled ? 'No models available' : `Model — ${brandFor(selected).label}`}
        aria-label="Model"
      >
        <ModelIcon model={selected} size={15} custom={iconFor(selected)} />
        <span className="mp-name">{label}</span>
        <Chevron size={11} />
      </button>

      {menuAt && (
        <Menu anchor={menuAt} onClose={() => setMenuAt(null)} width={274} align="start">
          <div className="menu-head">
            <div className="mh-name">Installed models</div>
            <div className="mh-path">Right-click a model to give it an icon</div>
          </div>
          {models.map((m) => (
            <button
              key={m.name}
              className={m.name === selected ? 'on' : ''}
              onClick={() => {
                apply(m)
                setMenuAt(null)
              }}
              onContextMenu={(e) => {
                setRowModel(m.name)
                rowMenu.open(e)
              }}
            >
              <ModelIcon model={m.name} size={16} custom={iconFor(m.name)} />
              <span className="mi-text">
                <span className="mi-name">{m.name}</span>
                <span className="mi-sub">
                  {[m.parameterSize, m.quantization, m.size ? formatBytes(m.size) : null]
                    .filter(Boolean)
                    .join(' · ') || brandFor(m.name).label}
                </span>
              </span>
              {m.name === selected && <Check size={12} />}
            </button>
          ))}
        </Menu>
      )}

      {rowMenu.at && rowModel && (
        <Menu anchor={rowMenu.at} width={190} onClose={rowMenu.close}>
          <div className="menu-head">
            <div className="mh-name">{rowModel}</div>
          </div>
          <button
            onClick={() => {
              rowMenu.close()
              setIconTarget(rowModel)
            }}
          >
            <Image size={13} /> Change icon…
          </button>
          <button
            disabled={!iconFor(rowModel)}
            onClick={() => {
              setIcon(rowModel, null)
              rowMenu.close()
            }}
          >
            <Check size={13} /> Use the family mark
          </button>
        </Menu>
      )}

      {iconTarget && (
        <IconModal
          title="Model icon"
          subtitle={`Shown wherever ${iconTarget} appears.`}
          initial={iconFor(iconTarget)}
          fallback={<ModelIcon model={iconTarget} size={20} />}
          onSave={(icon) => setIcon(iconTarget, icon)}
          onClose={() => {
            setIconTarget(null)
            setMenuAt(null)
          }}
        />
      )}
    </div>
  )
}
