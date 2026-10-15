import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { open as openDialog } from '@tauri-apps/plugin-dialog'

import { Sidebar } from './Sidebar'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { ConfigPanel } from './ConfigPanel'
import { ModelControls } from './ModelControls'
import { FileViewer } from './FileViewer'
import { ShortcutsModal } from './ShortcutsModal'
import { Menu, useContextMenu } from '../ui/Overlays'
import { IconGlyph } from '../ui/IconPicker'
import { ChatMenuItems, ProjectMenuItems } from '../library/Menus'
import { Chevron, Download, Folder, FolderOpen, Message, PanelLeft, Sliders } from '../Icons'

import { useStore, useCurrent, newChat, uid } from '../../state/store'
import { useLibrary } from '../../state/library'
import { useOllama } from '../../hooks/useOllama'
import { useToast } from '../../hooks/useToast'
import { useProjectIndex } from '../../hooks/useProjectIndex'
import { useChat } from '../../hooks/useChat'
import { extractFile, baseName, isSupported, SUPPORTED_SUMMARY } from '../../lib/files'
import { estimateFixed, estimatePayload } from '../../lib/context'
import { backend } from '../../lib/backend'

const DIALOG_FILTERS = [
  {
    name: 'Supported files',
    extensions: [
      'txt', 'md', 'mdx', 'markdown', 'pdf', 'docx', 'csv', 'tsv', 'json', 'yaml', 'yml', 'toml',
      'xml', 'html', 'css', 'scss', 'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'h', 'cpp', 'cs',
      'go', 'rs', 'rb', 'php', 'swift', 'kt', 'sql', 'sh', 'bash', 'ps1', 'ini', 'cfg', 'log',
    ],
  },
]

/** Wide enough that the sidebar and the thread both have room. */
const WIDE = 900

export function ChatView() {
  const { state, dispatch } = useStore()
  const { project, chat } = useCurrent()
  const lib = useLibrary()
  const ollama = useOllama()
  const { toast, error } = useToast()

  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState([])
  const [dragging, setDragging] = useState(false)
  const [viewing, setViewing] = useState(null)
  const [openingFolder, setOpeningFolder] = useState(false)
  // Open by default only where there is room for it; the hamburger toggles it
  // at every width, not just on a narrow window.
  const [leftOpen, setLeftOpen] = useState(() => window.innerWidth > WIDE)
  // Configuration stays shut until it is asked for, at any window size.
  const [rightOpen, setRightOpen] = useState(false)
  const [focusKey, setFocusKey] = useState(0)
  const [filesTab, setFilesTab] = useState(0)
  const [modelPicker, setModelPicker] = useState(0)
  const [shortcuts, setShortcuts] = useState(false)

  const projectMenu = useContextMenu()
  const chatMenu = useContextMenu()
  const [renaming, setRenaming] = useState(false)
  const renameRef = useRef(null)
  const [renameDraft, setRenameDraft] = useState('')

  const folderIndex = useProjectIndex(project?.folder, project?.id)
  const pinned = useMemo(() => new Set(project?.pinned ?? []), [project?.pinned])

  const { send, stop, regenerate, streaming } = useChat({
    project,
    chat,
    index: folderIndex.index,
    pinnedPaths: project?.pinned ?? [],
    dispatch,
  })

  // Draft text and attachments belong to one conversation, not the app.
  useEffect(() => {
    setText('')
    setAttachments([])
  }, [chat?.id])

  // Ollama loads a model on demand at the first request, so the resident list is
  // stale the moment a reply starts and again when it ends. Without this the run
  // controls keep offering "Run model" for something already in memory.
  useEffect(() => {
    ollama.refreshLoaded()
  }, [streaming, ollama.refreshLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------------------------------------------------------- files */

  const addFiles = useCallback(
    async (paths) => {
      if (!paths?.length) return
      const known = new Set(attachments.map((a) => a.path))
      const fresh = paths.filter((p) => !known.has(p))
      if (!fresh.length) return

      const rejected = fresh.filter((p) => !isSupported(baseName(p)))
      const accepted = fresh.filter((p) => isSupported(baseName(p)))
      if (rejected.length) {
        error(
          rejected.length === 1
            ? `Lwen cannot read ${baseName(rejected[0])}. ${SUPPORTED_SUMMARY}`
            : `${rejected.length} files were skipped — unsupported type. ${SUPPORTED_SUMMARY}`,
        )
      }
      if (!accepted.length) return

      const entries = accepted.map((path) => ({
        id: uid(),
        path,
        name: baseName(path),
        status: 'loading',
      }))
      setAttachments((list) => [...list, ...entries])

      await Promise.all(
        entries.map(async (entry) => {
          try {
            const result = await extractFile(entry.path)
            setAttachments((list) =>
              list.map((a) => (a.id === entry.id ? { ...a, ...result, status: 'ready' } : a)),
            )
          } catch (e) {
            setAttachments((list) =>
              list.map((a) =>
                a.id === entry.id ? { ...a, status: 'error', error: e?.message || String(e) } : a,
              ),
            )
            error(e?.message || `Could not read ${entry.name}.`)
          }
        }),
      )
    },
    [attachments, error],
  )

  const openFolder = useCallback(
    async (preset) => {
      if (!project) return
      setOpeningFolder(true)
      try {
        const picked = preset ?? (await openDialog({ directory: true, multiple: false }))
        if (!picked) return
        dispatch({
          type: 'project/update',
          id: project.id,
          patch: { folder: { root: picked, name: baseName(picked) }, pinned: [] },
        })
        toast(`Opened ${baseName(picked)}`)
      } catch (e) {
        error(e?.message || 'Could not open that folder.')
      } finally {
        setOpeningFolder(false)
      }
    },
    [project, dispatch, toast, error],
  )

  // Tauri delivers dropped paths through its own event, not the DOM. The
  // handler goes through a ref so the subscription is registered exactly once —
  // re-subscribing whenever the attachment list changed could drop a live drag.
  const dropHandler = useRef(null)
  dropHandler.current = async (paths) => {
    const kinds = await Promise.all(paths.map((p) => backend.pathKind(p).catch(() => 'missing')))
    const dirs = paths.filter((_, i) => kinds[i] === 'dir')
    const files = paths.filter((_, i) => kinds[i] === 'file')

    if (dirs.length === 1 && !files.length) {
      openFolder(dirs[0])
      return
    }
    if (dirs.length) {
      error('Folders are opened as a project — drop one folder on its own to do that.')
    }
    if (files.length) addFiles(files)
  }

  useEffect(() => {
    let unlisten
    let active = true
    getCurrentWebview()
      .onDragDropEvent((event) => {
        const { type, paths } = event.payload
        if (type === 'over') {
          setDragging(true)
          return
        }
        setDragging(false)
        if (type === 'drop' && paths?.length) dropHandler.current?.(paths)
      })
      .then((fn) => {
        if (active) unlisten = fn
        else fn()
      })
      .catch(() => {})
    return () => {
      active = false
      unlisten?.()
    }
  }, [])

  const pickFiles = async () => {
    try {
      const picked = await openDialog({ multiple: true, filters: DIALOG_FILTERS })
      if (picked) addFiles(Array.isArray(picked) ? picked : [picked])
    } catch (e) {
      error(e?.message || 'Could not open the file picker.')
    }
  }

  // Keyed on the id and the pinned list rather than the project object: a
  // streaming reply replaces that object every frame, and a fresh `onTogglePin`
  // each time would re-render the whole file tree with it.
  const projectId = project?.id ?? null
  const pinnedList = project?.pinned
  const togglePin = useCallback(
    (path) => {
      if (!projectId) return
      const current = pinnedList ?? []
      const next = current.includes(path)
        ? current.filter((p) => p !== path)
        : [...current, path]
      dispatch({ type: 'project/update', id: projectId, patch: { pinned: next } })
    },
    [projectId, pinnedList, dispatch],
  )

  const closeFolder = useCallback(() => {
    if (!project) return
    dispatch({ type: 'project/update', id: project.id, patch: { folder: null, pinned: [] } })
    setViewing(null)
    toast('Project folder closed')
  }, [project, dispatch, toast])

  /* --------------------------------------------------------------- sending */

  const readyAttachments = attachments.filter((a) => a.status === 'ready')

  // Keyed on message *count*, not the array: a streaming reply rewrites the last
  // message on every frame, and re-costing the whole history that often is waste
  // for what is only an estimate. The chat id is in there too — two
  // conversations can be the same number of messages long.
  const historyLength = chat?.messages.length ?? 0
  const fixedCost = useMemo(
    () =>
      estimateFixed({
        attachments: readyAttachments,
        history: chat?.messages ?? [],
        systemPrompt: project?.settings.systemPrompt ?? '',
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attachments, historyLength, chat?.id, project?.settings.systemPrompt],
  )

  // Typing only re-costs what was typed; everything else is already summed.
  const budget = useMemo(
    () =>
      estimatePayload({
        userText: text,
        fixed: fixedCost,
        contextWindow: project?.settings.contextWindow ?? 8192,
      }),
    [text, fixedCost, project?.settings.contextWindow],
  )

  const blocked = folderIndex.scanning
    ? 'Reading project files. You can send when indexing finishes.'
    : folderIndex.error
      ? 'Project files could not be read. Rescan or close the folder to continue.'
      : !ollama.status.reachable
        ? 'Ollama is not running. Start it from the model pill in the top bar.'
        : !project?.settings.model
          ? 'No model is installed. Pull one with `ollama pull qwen2.5-coder:7b`, then refresh.'
          : ''

  const doSend = async () => {
    if (blocked || streaming) return
    const body = text
    setText('')
    setAttachments([])
    await send({ text: body, attachments: readyAttachments })
    setFocusKey((k) => k + 1)
  }

  const suggest = (value) => {
    setText(value)
    setFocusKey((k) => k + 1)
  }

  /* -------------------------------------------------------------- commands */

  const lastAssistantId = useMemo(() => {
    const found = [...(chat?.messages ?? [])].reverse().find((m) => m.role === 'assistant')
    return found?.id ?? null
  }, [chat?.messages])

  const runCommand = useCallback(
    (command) => {
      if (!project || !chat) return
      switch (command.id) {
        case 'new':
          dispatch({ type: 'chat/create', projectId: project.id, chat: newChat() })
          break
        case 'clear':
          lib.clearChat(project, chat)
          break
        case 'retry':
          if (lastAssistantId) regenerate(lastAssistantId)
          else toast('Nothing to run again yet.')
          break
        case 'files':
          if (!project.folder) {
            openFolder()
            break
          }
          setLeftOpen(true)
          setFilesTab((n) => n + 1)
          break
        case 'model':
          setModelPicker((n) => n + 1)
          break
        case 'run':
          if (!project.settings.model) toast('Choose a model first.')
          else
            ollama
              .runModel(project.settings.model)
              .then(() => toast(`${project.settings.model} loaded`))
              .catch((e) => error(e?.message || 'Could not load that model.'))
          break
        case 'unload':
          if (!project.settings.model) toast('No model selected.')
          else
            ollama
              .stopModel(project.settings.model)
              .then(() => toast(`${project.settings.model} unloaded`))
              .catch((e) => error(e?.message || 'Could not unload that model.'))
          break
        case 'settings':
          setRightOpen(true)
          break
        case 'grid':
          lib.openProjectDetail(project)
          break
        case 'stats':
          lib.openStats()
          break
        case 'commands':
          lib.openCommands()
          break
        case 'help':
          setShortcuts(true)
          break
        default:
          break
      }
      setFocusKey((k) => k + 1)
    },
    [project, chat, dispatch, lib, regenerate, lastAssistantId, ollama, toast, error, openFolder],
  )

  /* --------------------------------------------------------- auto-unloading */

  const lastActivity = chat?.updatedAt ?? 0
  const minutesIdle = project?.settings.autoUnloadMinutes ?? 0
  const activeModel = project?.settings.model
  // A boolean, not the polled array: depending on `loaded` would restart the
  // timer on every 6-second poll, so it would never actually elapse.
  const modelResident = !!activeModel && ollama.isLoaded(activeModel)
  const stopModel = ollama.stopModel

  useEffect(() => {
    if (!minutesIdle || !activeModel || streaming || !modelResident) return
    const id = setTimeout(() => {
      stopModel(activeModel)
        .then(() => toast(`${activeModel} unloaded after ${minutesIdle}m idle`))
        .catch(() => {})
    }, minutesIdle * 60_000)
    return () => clearTimeout(id)
  }, [lastActivity, minutesIdle, activeModel, streaming, modelResident, stopModel, toast])

  /* ------------------------------------------------------------- shortcuts */

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey
      const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)
      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        if (project) dispatch({ type: 'chat/create', projectId: project.id, chat: newChat() })
      } else if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setLeftOpen((o) => !o)
      } else if (mod && e.key === '/') {
        e.preventDefault()
        setShortcuts((s) => !s)
      } else if (e.key === 'Escape' && !typing) {
        setRightOpen(false)
        if (window.innerWidth <= WIDE) setLeftOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [project, dispatch])

  const openFileFromChat = useCallback(
    (f) => setViewing({ path: f.path, rel: f.rel, name: baseName(f.rel) }),
    [],
  )

  if (!project || !chat) return null

  const startRename = () => {
    setRenameDraft(chat.name)
    setRenaming(true)
    requestAnimationFrame(() => renameRef.current?.select())
  }

  const commitRename = () => {
    const name = renameDraft.trim()
    if (name && name !== chat.name) lib.renameChat(project.id, chat.id, name)
    setRenaming(false)
  }

  return (
    <section className="view" id="view-chat">
      <div
        className={`shell${rightOpen ? '' : ' right-collapsed'}${
          leftOpen ? ' left-open' : ' left-collapsed'
        }`}
      >
        <Sidebar
          project={project}
          chat={chat}
          folderIndex={folderIndex}
          pinned={pinned}
          onTogglePin={togglePin}
          onOpenFile={setViewing}
          activeFilePath={viewing?.path}
          onOpenFolder={() => openFolder()}
          onCloseFolder={closeFolder}
          openingFolder={openingFolder}
          filesTabKey={filesTab}
          onNewChat={() =>
            dispatch({ type: 'chat/create', projectId: project.id, chat: newChat() })
          }
          onBackToProjects={() => dispatch({ type: 'view', view: 'dashboard' })}
        />

        <main className="center">
          <div className="chat-topbar">
            <button
              className={`hamburger icon-btn${leftOpen ? ' on' : ''}`}
              onClick={() => setLeftOpen((o) => !o)}
              title={`${leftOpen ? 'Hide' : 'Show'} sidebar  (Ctrl B)`}
              aria-label="Toggle sidebar"
              aria-pressed={leftOpen}
            >
              <PanelLeft size={17} />
            </button>

            <div className="crumb">
              <button
                className="crumb-btn proj"
                onClick={() => lib.openProjectDetail(project)}
                onContextMenu={projectMenu.open}
                title={`${project.name} — open every conversation`}
              >
                <IconGlyph
                  icon={project.icon}
                  size={16}
                  fallback={project.folder ? <FolderOpen size={14} /> : <Folder size={14} />}
                />
                <span className="ctext">{project.name}</span>
              </button>

              <span className="sep">/</span>

              {renaming ? (
                <input
                  ref={renameRef}
                  className="crumb-rename"
                  value={renameDraft}
                  autoFocus
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') setRenaming(false)
                  }}
                />
              ) : (
                <button
                  className="crumb-btn cur"
                  onClick={startRename}
                  onContextMenu={chatMenu.open}
                  title={`${chat.name} — click to rename, right-click for more`}
                >
                  <IconGlyph icon={chat.icon} size={16} fallback={<Message size={14} />} />
                  <span className="ctext">{chat.name}</span>
                </button>
              )}
            </div>

            <ModelControls model={project.settings.model} />
            <button
              className={`icon-btn${rightOpen ? ' on' : ''}`}
              onClick={() => setRightOpen((o) => !o)}
              title="Toggle settings panel"
            >
              <Sliders size={16} />
            </button>
          </div>

          <MessageList
            chat={chat}
            hasProject={!!project.folder}
            streaming={streaming}
            onSuggest={suggest}
            onRegenerate={regenerate}
            onOpenFile={openFileFromChat}
          />

          <MessageInput
            value={text}
            onChange={setText}
            attachments={attachments}
            onRemoveAttachment={(id) => setAttachments((l) => l.filter((a) => a.id !== id))}
            onPickFiles={pickFiles}
            onSend={doSend}
            onStop={stop}
            streaming={streaming}
            disabled={!!blocked}
            disabledReason={blocked}
            budget={budget}
            focusKey={focusKey}
            customCommands={state.prefs?.commands ?? []}
            onRunCommand={runCommand}
            onManageCommands={lib.openCommands}
            modelPickerKey={modelPicker}
          />

          {dragging && (
            <div className="drop-veil">
              <div className="drop-card">
                <Download size={28} />
                <span className="dt">Drop to attach</span>
                <span>{SUPPORTED_SUMMARY}</span>
                {!project.folder && <span>A single folder opens as a project.</span>}
              </div>
            </div>
          )}

          <button className="panel-tab" onClick={() => setRightOpen(true)} title="Open settings">
            <Chevron size={14} width={2} />
          </button>
        </main>

        <ConfigPanel project={project} onCollapse={() => setRightOpen(false)} />

        <div className="scrim" onClick={() => setLeftOpen(false)} />
      </div>

      {projectMenu.at && (
        <Menu anchor={projectMenu.at} width={214} onClose={projectMenu.close}>
          <ProjectMenuItems project={project} omit={['open']} onDone={projectMenu.close} />
        </Menu>
      )}

      {chatMenu.at && (
        <Menu anchor={chatMenu.at} width={196} onClose={chatMenu.close}>
          <ChatMenuItems
            project={project}
            chat={chat}
            onRename={startRename}
            onDone={chatMenu.close}
          />
        </Menu>
      )}

      {shortcuts && <ShortcutsModal onClose={() => setShortcuts(false)} />}

      {viewing && (
        <FileViewer
          file={viewing}
          pinned={pinned}
          onTogglePin={togglePin}
          onClose={() => setViewing(null)}
        />
      )}
    </section>
  )
}
