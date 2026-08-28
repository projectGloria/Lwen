import { useEffect, useRef } from 'react'
import { Chevron, Gear, Refresh } from '../Icons'
import { Hint } from '../ui/Hint'
import { DEFAULT_SYSTEM_PROMPT, defaultSettings, useStore } from '../../state/store'
import { useOllama } from '../../hooks/useOllama'
import { useToast } from '../../hooks/useToast'
import { formatTokens } from '../../lib/tokens'

const PRESETS = {
  precise: [0.2, 0.5],
  balanced: [0.7, 0.9],
  creative: [1.3, 0.98],
}

const AUTO_UNLOAD = [
  { value: 0, label: 'Off' },
  { value: 5, label: '5m' },
  { value: 15, label: '15m' },
  { value: 60, label: '1h' },
]

function Range({ value, min, max, step, onChange, ...rest }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const pct = ((value - min) / (max - min)) * 100
    el.style.background = `linear-gradient(90deg, #C86F4C 0%, var(--accent) ${pct}%, rgba(255,255,255,.10) ${pct}%)`
  }, [value, min, max])

  return (
    <input
      ref={ref}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      {...rest}
    />
  )
}

export function ConfigPanel({ project, onCollapse }) {
  const { dispatch } = useStore()
  const { models } = useOllama()
  const { toast } = useToast()
  const s = project.settings

  const set = (patch) => dispatch({ type: 'project/settings', id: project.id, patch })

  const modelMeta = models.find((m) => m.name === s.model)
  const modelMax = modelMeta?.contextLength || 0
  const ctxMax = modelMax || 131072
  // Keep the slider usable regardless of the model's ceiling.
  const step = ctxMax > 65536 ? 4096 : ctxMax > 16384 ? 2048 : 512
  const ctxValue = Math.min(s.contextWindow, ctxMax)

  const activePreset = Object.entries(PRESETS).find(
    ([, [t, p]]) => Math.abs(t - s.temperature) < 1e-6 && Math.abs(p - s.topP) < 1e-6,
  )?.[0]

  const reset = () => {
    const d = defaultSettings()
    set({
      temperature: d.temperature,
      topP: d.topP,
      contextWindow: Math.min(modelMax || d.contextWindow, d.contextWindow),
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      autoUnloadMinutes: d.autoUnloadMinutes,
    })
    toast('Settings reset to defaults')
  }

  return (
    <aside className="side-right">
      <div className="rp-inner">
        <div className="rp-head">
          <span className="t">
            <Gear size={15} />
            Configuration
          </span>
          <button className="icon-btn" onClick={onCollapse} title="Collapse panel">
            <Chevron size={15} width={2} />
          </button>
        </div>

        <div className="rp-scroll">
          <div className="rp-section">
            <div className="rp-label">
              Generation
              <Hint title="Generation settings">
                These two decide how the model picks each word. They change the style of the answer,
                never the model's knowledge — and they apply to this project only.
              </Hint>
            </div>

            <div className="param">
              <div className="param-row">
                <span className="param-name">
                  Temperature
                  <Hint title="Temperature">
                    How much the model gambles on each next word. Low keeps it to the wording it
                    thinks is most likely — steadier, better for code and facts, and more repetitive.
                    High lets unlikely words through, which reads as more inventive and less
                    reliable. <b>0.7</b> is the usual middle.
                  </Hint>
                </span>
                <span className="pill">{s.temperature.toFixed(2)}</span>
              </div>
              <Range
                value={s.temperature}
                min={0}
                max={2}
                step={0.05}
                onChange={(temperature) => set({ temperature })}
              />
              <div className="param-scale">
                <span>0 · Precise</span>
                <span>2 · Wild</span>
              </div>
            </div>

            <div className="param">
              <div className="param-row">
                <span className="param-name">
                  Top-P
                  <Hint title="Top-P (nucleus sampling)">
                    A second limit on that same choice. The model lines its candidate words up from
                    most to least likely and keeps only enough of the top to reach this share of the
                    total probability. <b>0.9</b> trims the long tail of odd words; <b>1.0</b> keeps
                    every option. Most people tune temperature and leave this where it is.
                  </Hint>
                </span>
                <span className="pill">{s.topP.toFixed(2)}</span>
              </div>
              <Range value={s.topP} min={0} max={1} step={0.01} onChange={(topP) => set({ topP })} />
              <div className="param-scale">
                <span>0 · Narrow</span>
                <span>1 · Broad</span>
              </div>
            </div>

            <div className="presets">
              {Object.keys(PRESETS).map((key) => (
                <button
                  key={key}
                  className={`preset${activePreset === key ? ' on' : ''}`}
                  onClick={() => set({ temperature: PRESETS[key][0], topP: PRESETS[key][1] })}
                >
                  {key[0].toUpperCase() + key.slice(1)}
                </button>
              ))}
            </div>

            <div className="param">
              <div className="param-row">
                <span className="param-name">
                  Context Window
                  <Hint title="Context window">
                    How much text the model can hold in mind at once: your system prompt, this
                    conversation, any project files, and the reply it is writing — all measured in
                    tokens, where a token is roughly ¾ of a word. Once it is full the oldest part of
                    the conversation is dropped. A bigger window remembers more but uses noticeably
                    more memory and is slower to start.
                  </Hint>
                </span>
                <span className="pill">{formatTokens(ctxValue)}</span>
              </div>
              <Range
                value={ctxValue}
                min={2048}
                max={ctxMax}
                step={step}
                onChange={(contextWindow) => set({ contextWindow })}
              />
              <div className="param-scale">
                <span>2k</span>
                <span>{formatTokens(ctxMax)}</span>
              </div>
              <div className="param-desc">
                Sent as <code>num_ctx</code>. History and project files are trimmed to fit.
                {modelMax > 0 && (
                  <>
                    {' '}
                    {s.model} supports up to {formatTokens(modelMax)}.
                    {ctxValue < modelMax && (
                      <>
                        {' '}
                        <button
                          onClick={() => set({ contextWindow: modelMax })}
                          style={{ color: 'var(--accent-hi)', textDecoration: 'underline' }}
                        >
                          Use maximum
                        </button>
                      </>
                    )}
                  </>
                )}
                {modelMax > 32768 && ctxValue > 32768 && (
                  <> A large window costs noticeably more memory.</>
                )}
              </div>
            </div>
          </div>

          <div className="rp-section">
            <div className="rp-label">
              Memory
              <Hint title="Model memory">
                Ollama keeps a model loaded in RAM (or VRAM) after a reply so the next one starts
                instantly. That memory stays claimed until something releases it.
              </Hint>
            </div>
            <div className="rp-toggle" style={{ alignItems: 'flex-start' }}>
              <span style={{ minWidth: 0 }}>
                <div className="tl">
                  Auto-unload when idle
                  <Hint title="Auto-unload when idle">
                    Hands that memory back once you have not sent anything for this long. Your next
                    message reloads the model, which adds a few seconds before it starts replying.
                    Leave it <b>Off</b> if you have memory to spare.
                  </Hint>
                </div>
                <div className="td">Frees the model from memory after a quiet spell.</div>
              </span>
            </div>
            <div className="seg">
              {AUTO_UNLOAD.map((o) => (
                <button
                  key={o.value}
                  className={s.autoUnloadMinutes === o.value ? 'on' : ''}
                  onClick={() => set({ autoUnloadMinutes: o.value })}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rp-section">
            <div className="rp-label">
              System Prompt
              <Hint title="System prompt">
                Standing instructions sent ahead of every message in this project — who the model
                should act as, how long answers should be, what to avoid. It shapes how it answers,
                not what it knows, and it counts against the context window.
              </Hint>
            </div>
            <textarea
              className="sysprompt"
              value={s.systemPrompt}
              onChange={(e) => set({ systemPrompt: e.target.value })}
              placeholder="Optional instructions that shape how Lwen responds in this project…"
            />
            <div className="rp-hint">
              Applied to every new message in this project. Changes take effect on the next turn.
            </div>
          </div>

          <button className="reset-btn" onClick={reset}>
            <Refresh size={13} />
            Reset to defaults
          </button>
        </div>
      </div>
    </aside>
  )
}
