import { useRef, useState } from 'react'
import { Popover } from '../ui/Overlays'
import { OllamaControls } from './OllamaPill'
import { MODEL_STATE_LABEL, useOllama } from '../../hooks/useOllama'
import { useToast } from '../../hooks/useToast'
import { useModelIcons } from '../../hooks/useModelIcons'
import { ModelIcon } from '../ModelIcons'
import { Play, Refresh, Spinner, Stop } from '../Icons'
import { formatBytes } from '../../lib/format'
import { formatTokens } from '../../lib/tokens'

const DOT = {
  running: 'ok',
  starting: 'busy',
  stopping: 'busy',
  idle: '',
  offline: 'bad',
  none: '',
}

/**
 * The status pill in the chat topbar, plus the Run / Stop controls behind it.
 *
 * Running a model is a preload, not a requirement: Ollama loads on demand at
 * the first chat request. The button exists so the wait happens before you
 * start typing, and so memory can be handed back on demand. Below it are the
 * server's own controls, which is where "stop Ollama" lives.
 */
export function ModelControls({ model }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef(null)
  const ollama = useOllama()
  const { iconFor } = useModelIcons()
  const { toast, error } = useToast()

  const state = ollama.modelState(model)
  const info = ollama.loadedInfo(model)
  const busy = state === 'starting' || state === 'stopping'
  const label = MODEL_STATE_LABEL[state]

  const modelMeta = ollama.models.find((m) => m.name === model)

  const run = async () => {
    try {
      await ollama.runModel(model)
      toast(`${model} loaded`)
    } catch (e) {
      error(e?.message || `Could not load ${model}.`)
    }
  }

  const stop = async () => {
    try {
      await ollama.stopModel(model)
      toast(`${model} unloaded`)
    } catch (e) {
      error(e?.message || `Could not unload ${model}.`)
    }
  }

  return (
    <>
      <button
        ref={anchor}
        className="model-tag"
        onClick={() => setOpen((o) => !o)}
        title={`${label} — click for controls`}
      >
        <ModelIcon model={model} size={14} custom={iconFor(model)} />
        <span className="mname">{model || 'No model'}</span>
        <span className={`pulse${state === 'running' ? ' live' : ''}${state === 'offline' ? ' bad' : ''}${state === 'idle' || state === 'none' ? ' off' : ''}`} />
      </button>

      {open && (
        <Popover anchor={anchor.current} onClose={() => setOpen(false)}>
          <div className="pop-title">Model</div>
          <div className="pop-row">
            <ModelIcon model={model} size={20} custom={iconFor(model)} />
            <span className="grow">
              <div className="t1">{model || 'No model selected'}</div>
              <div className="t2">
                <span className={`status-dot ${DOT[state]}`} /> {label}
              </div>
            </span>
          </div>

          <div className="pop-meta">
            {modelMeta && (
              <>
                {modelMeta.parameterSize && (
                  <>
                    <b>{modelMeta.parameterSize}</b>
                    {modelMeta.quantization ? ` · ${modelMeta.quantization}` : ''} ·{' '}
                    {formatBytes(modelMeta.size)}
                    <br />
                  </>
                )}
                {modelMeta.contextLength > 0 && (
                  <>
                    Context window <b>{formatTokens(modelMeta.contextLength)}</b> tokens
                    <br />
                  </>
                )}
              </>
            )}
            {info ? (
              <>
                Resident: <b>{formatBytes(info.size)}</b>
                {info.size_vram > 0 && ` · ${formatBytes(info.size_vram)} in VRAM`}
              </>
            ) : (
              state === 'idle' && 'Not in memory. Ollama will load it on your first message.'
            )}
          </div>

          {ollama.status.reachable && (
            <div className="pop-actions">
              {state === 'running' ? (
                <button className="btn-ghost danger" onClick={stop} disabled={busy}>
                  {busy ? <Spinner size={13} /> : <Stop size={13} />} Unload model
                </button>
              ) : (
                <button className="btn-primary" onClick={run} disabled={busy || !model}>
                  {busy ? <Spinner size={13} /> : <Play size={13} />}
                  {busy ? 'Loading…' : 'Run model'}
                </button>
              )}
              <button
                className="btn-ghost"
                onClick={() => ollama.refresh()}
                title="Refresh status and model list"
              >
                <Refresh size={13} /> Refresh
              </button>
            </div>
          )}

          <div className="pop-sep" />
          <OllamaControls onDone={() => setOpen(false)} />
        </Popover>
      )}
    </>
  )
}
