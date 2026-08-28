import { Component, useEffect, useState } from 'react'
import { Dashboard } from './components/dashboard/Dashboard'
import { ProjectView } from './components/project/ProjectView'
import { ChatView } from './components/chat/ChatView'
import { Toasts } from './components/ui/Overlays'
import { Mark } from './components/Icons'
import { AuthScreen } from './components/auth/AuthScreen'
import { StoreProvider, useStore } from './state/store'
import { AuthProvider, useAuth } from './state/auth'
import { StatsProvider } from './state/stats'
import { LibraryProvider } from './state/library'
import { OllamaProvider } from './hooks/useOllama'
import { ToastProvider } from './hooks/useToast'
import { backend, initRuntime } from './lib/backend'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="crash">
        <h1>Lwen ran into a problem.</h1>
        <p>
          The interface stopped rendering. Your conversations are saved on disk and should still be
          there after a restart.
        </p>
        <pre>{String(this.state.error?.stack || this.state.error)}</pre>
        <button className="btn-primary" onClick={() => window.location.reload()}>
          Reload Lwen
        </button>
      </div>
    )
  }
}

function Boot({ message }) {
  return (
    <div className="boot">
      <span className="mark">
        <Mark size={38} width={1.9} />
      </span>
      {message}
    </div>
  )
}

function Router() {
  const { state } = useStore()
  if (!state.loaded) return <Boot message="Opening your library…" />
  if (state.view === 'chat' && state.currentProjectId && state.currentChatId) return <ChatView />
  if (state.view === 'project' && state.currentProjectId) return <ProjectView />
  return <Dashboard />
}

/**
 * Nothing above this point knows which account is signed in. The store is keyed
 * on the account name so switching users tears the whole library down and
 * loads the next one from its own folder.
 */
function Session() {
  const { user } = useAuth()
  if (!user) return <AuthScreen />
  return (
    <StoreProvider key={user.id} user={user.name}>
      <StatsProvider user={user.name}>
        <LibraryProvider>
          <Router />
        </LibraryProvider>
      </StatsProvider>
    </StoreProvider>
  )
}

export default function App() {
  const [runtime, setRuntime] = useState({ status: 'loading', error: null })

  useEffect(() => {
    let cancelled = false
    initRuntime()
      .then(() => {
        if (cancelled) return
        setRuntime({ status: 'ready', error: null })
      })
      .catch((e) => {
        if (!cancelled) setRuntime({ status: 'failed', error: e?.message || String(e) })
      })
      // Reveal the window either way; a failure needs to be visible.
      .finally(() => backend.appReady().catch(() => {}))
    return () => {
      cancelled = true
    }
  }, [])

  if (runtime.status === 'loading') return <Boot message="Starting Lwen…" />

  if (runtime.status === 'failed') {
    return (
      <div className="crash">
        <h1>Lwen could not start its Ollama bridge.</h1>
        <p>
          Lwen talks to Ollama through a small local forwarder, and it failed to open a port on this
          machine. That usually means something is blocking loopback connections.
        </p>
        <pre>{runtime.error}</pre>
        <button className="btn-primary" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <ToastProvider>
        <OllamaProvider>
          <AuthProvider>
            <Session />
            <Toasts />
          </AuthProvider>
        </OllamaProvider>
      </ToastProvider>
    </ErrorBoundary>
  )
}
