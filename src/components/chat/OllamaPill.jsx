import { useRef, useState } from 'react'
import { ConfirmDialog, Popover } from '../ui/Overlays'
import { OllamaIcon } from '../ModelIcons'
import { Power, Refresh, Spinner, Stop } from '../Icons'
import { useOllama } from '../../hooks/useOllama'
import { useToast } from '../../hooks/useToast'
import { formatBytes } from '../../lib/format'

/**
 * Server controls, shared by the dashboard's top bar and the chat topbar.
 *
 * Lwen never starts Ollama on its own — not at launch, not on the first
 * message. Starting and stopping it are both deliberate clicks, and the app
 * only cleans up on quit if this run of it was what started the server.
 */
export function OllamaControls({ onDone }) {
  const ollama = useOllama()
  const { toast, error } = useToast()
  const [confirm, setConfirm] = useState(null)

  const start = async () => {
    try {
      await ollama.startServer()
      toast('Ollama started')
      onDone?.()
    } catch (e) {
      error(e?.message || 'Could not start Ollama.')
    }
  }

  const doStop = async () => {
    try {
      await ollama.stopServer()
      toast('Ollama stopped')
      onDone?.()
    } catch (e) {
      error(e?.message || 'Could not stop Ollama.')
    }
  }

  const stop = () => {
    // Stopping a server Lwen did not start can pull the rug from under another
    // app, so that case asks first; our own is stopped without ceremony.
    if (ollama.ours) {
      doStop()
      return
    }
    setConfirm(true)
  }

  const resident = ollama.loaded.reduce((n, m) => n + (m.size || 0), 0)

  return (
    <>
      <div className="pop-title">Ollama</div>
      <div className="pop-row">
        <OllamaIcon size={20} />
        <span className="grow">
          <div className="t1">{ollama.status.reachable ? `Ollama ${ollama.status.version || ''}`.trim() : 'Not running'}</div>
          <div className="t2">
            <span
              className={`status-dot ${
                ollama.starting || ollama.stopping ? 'busy' : ollama.status.reachable ? 'ok' : 'bad'
              }`}
            />{' '}
            {ollama.starting
              ? 'Starting…'
              : ollama.stopping
                ? 'Stopping…'
                : ollama.status.reachable
                  ? ollama.status.base_url
                  : ollama.status.error || 'Offline'}
          </div>
        </span>
      </div>

      <div className="pop-meta">
        {ollama.status.reachable ? (
          <>
            {ollama.models.length} model{ollama.models.length === 1 ? '' : 's'} installed
            {ollama.loaded.length > 0 && (
              <>
                {' · '}
                {ollama.loaded.length} in memory ({formatBytes(resident)})
              </>
            )}
            <br />
            {ollama.ours
              ? 'Started by Lwen — it stops when Lwen closes.'
              : 'Started outside Lwen, so Lwen leaves it running on exit.'}
          </>
        ) : (
          'Lwen does not start Ollama by itself. Start it here when you want it.'
        )}
      </div>

      <div className="pop-actions">
        {ollama.status.reachable ? (
          <button className="btn-ghost danger" onClick={stop} disabled={ollama.stopping}>
            {ollama.stopping ? <Spinner size={13} /> : <Stop size={13} />}
            {ollama.stopping ? 'Stopping…' : 'Stop Ollama'}
          </button>
        ) : (
          <button className="btn-primary" onClick={start} disabled={ollama.starting}>
            {ollama.starting ? <Spinner size={13} /> : <Power size={14} />}
            {ollama.starting ? 'Starting…' : 'Start Ollama'}
          </button>
        )}
        <button className="btn-ghost" onClick={() => ollama.refresh()} title="Check again now">
          <Refresh size={13} /> Refresh
        </button>
      </div>

      {confirm && (
        <ConfirmDialog
          title="Stop Ollama?"
          body="Lwen did not start this server, so something else may be using it — the Ollama desktop app, a terminal, or another client. Stopping it affects them too."
          confirmLabel="Stop Ollama"
          onConfirm={doStop}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  )
}

/** The status button in the dashboard's top bar. */
export function OllamaPill() {
  const ollama = useOllama()
  const anchor = useRef(null)
  const [open, setOpen] = useState(false)

  const busy = ollama.starting || ollama.stopping || ollama.status.checking

  return (
    <>
      <button
        ref={anchor}
        className="ollama-pill"
        title="Ollama server — click for controls"
        onClick={() => setOpen((o) => !o)}
      >
        <OllamaIcon size={15} />
        <span
          className={`status-dot ${busy ? 'busy' : ollama.status.reachable ? 'ok' : 'bad'}`}
        />
        <span className="op-text">
          {ollama.starting
            ? 'Starting'
            : ollama.stopping
              ? 'Stopping'
              : ollama.status.checking
                ? 'Checking'
                : ollama.status.reachable
                  ? `${ollama.models.length} models`
                  : 'Offline'}
        </span>
      </button>

      {open && (
        <Popover anchor={anchor.current} onClose={() => setOpen(false)} width={306}>
          <OllamaControls onDone={() => setOpen(false)} />
        </Popover>
      )}
    </>
  )
}
