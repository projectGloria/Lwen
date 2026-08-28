import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { open as openDialog } from '@tauri-apps/plugin-dialog'

import { ConfirmDialog } from '../components/ui/Overlays'
import { ProjectModal } from '../components/library/ProjectModal'
import { IconModal } from '../components/library/IconModal'
import { CommandsModal } from '../components/library/CommandsModal'
import { StatsModal } from '../components/StatsModal'
import { TrashModal } from '../components/TrashModal'
import { Folder, Message } from '../components/Icons'

import { TRASH_KEEP_DAYS, newChat, newProject, useStore } from './store'
import { useToast } from '../hooks/useToast'
import { baseName } from '../lib/files'

const LibraryContext = createContext(null)

/**
 * Every destructive or dialog-opening thing you can do to a project or a
 * conversation, in one place.
 *
 * The dashboard grid, the sidebar tree, the project detail view and the chat
 * topbar all offer the same menu. Giving each of them its own copy of the modal
 * state is how the three of them drifted apart; here the dialogs are mounted
 * once and every surface calls the same function.
 */
export function LibraryProvider({ children }) {
  const { state, dispatch } = useStore()
  const { toast } = useToast()

  const [projectModal, setProjectModal] = useState(null)
  const [iconModal, setIconModal] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [trashOpen, setTrashOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [commandsOpen, setCommandsOpen] = useState(false)

  /* ------------------------------------------------------------- projects */

  const createProject = useCallback(() => setProjectModal({ mode: 'create' }), [])

  const editProject = useCallback(
    (project) => setProjectModal({ mode: 'edit', project }),
    [],
  )

  const changeProjectIcon = useCallback(
    (project) =>
      setIconModal({
        title: 'Project icon',
        subtitle: `Shown wherever “${project.name}” appears.`,
        initial: project.icon,
        fallback: <Folder size={20} />,
        save: (icon) => {
          dispatch({ type: 'project/update', id: project.id, patch: { icon } })
          toast('Project icon updated')
        },
      }),
    [dispatch, toast],
  )

  const openProject = useCallback(
    (project, chatId) => dispatch({ type: 'project/open', id: project.id, chatId }),
    [dispatch],
  )

  const openProjectDetail = useCallback(
    (project) => dispatch({ type: 'project/detail', id: project.id }),
    [dispatch],
  )

  const toggleProjectFolder = useCallback(
    async (project) => {
      if (project.folder) {
        dispatch({ type: 'project/update', id: project.id, patch: { folder: null, pinned: [] } })
        toast('Project folder closed')
        return
      }
      try {
        const picked = await openDialog({ directory: true, multiple: false })
        if (!picked) return
        dispatch({
          type: 'project/update',
          id: project.id,
          patch: { folder: { root: picked, name: baseName(picked) }, pinned: [] },
        })
        toast(`Opened ${baseName(picked)}`)
      } catch {
        /* dialog dismissed */
      }
    },
    [dispatch, toast],
  )

  const deleteProject = useCallback(
    (project) =>
      setConfirm({
        title: 'Delete this project?',
        body: `“${project.name}” and its ${project.chats.length} conversation${
          project.chats.length === 1 ? '' : 's'
        } move to Recently deleted for ${TRASH_KEEP_DAYS} days. Files on disk are not touched.`,
        onConfirm: () => {
          dispatch({ type: 'project/delete', id: project.id })
          toast('Project deleted')
        },
      }),
    [dispatch, toast],
  )

  /**
   * A fresh project carrying this one's setup — icon, description, folder and
   * model settings — but none of its conversations. Copying the history too
   * would make "duplicate" a way to accidentally double the library's size.
   */
  const duplicateProject = useCallback(
    (project) => {
      const copy = newProject({
        name: `${project.name} copy`,
        desc: project.desc,
        icon: project.icon,
        folder: project.folder,
        settings: project.settings,
      })
      dispatch({ type: 'project/create', project: copy })
      dispatch({ type: 'view', view: 'dashboard' })
      toast(`Duplicated as “${copy.name}”`)
    },
    [dispatch, toast],
  )

  /* -------------------------------------------------------- conversations */

  const createChat = useCallback(
    (project) => {
      dispatch({ type: 'chat/create', projectId: project.id, chat: newChat() })
    },
    [dispatch],
  )

  const openChat = useCallback(
    (projectId, chatId) => dispatch({ type: 'chat/select', projectId, chatId }),
    [dispatch],
  )

  const renameChat = useCallback(
    (projectId, chatId, name) => dispatch({ type: 'chat/rename', projectId, chatId, name }),
    [dispatch],
  )

  const changeChatIcon = useCallback(
    (project, chat) =>
      setIconModal({
        title: 'Conversation icon',
        subtitle: `Shown next to “${chat.name}” in the sidebar and the project view.`,
        initial: chat.icon,
        fallback: <Message size={20} />,
        save: (icon) => {
          dispatch({ type: 'chat/icon', projectId: project.id, chatId: chat.id, icon })
          toast('Conversation icon updated')
        },
      }),
    [dispatch, toast],
  )

  const deleteChat = useCallback(
    (project, chat) =>
      setConfirm({
        title: 'Delete this conversation?',
        body: `“${chat.name}” moves to Recently deleted, where you can put it back for ${TRASH_KEEP_DAYS} days.`,
        onConfirm: () => {
          dispatch({ type: 'chat/delete', projectId: project.id, chatId: chat.id })
          toast('Conversation deleted')
        },
      }),
    [dispatch, toast],
  )

  const clearChat = useCallback(
    (project, chat) =>
      setConfirm({
        title: 'Clear this conversation?',
        body: `Every message in “${chat.name}” is removed. This one cannot be undone from Recently deleted.`,
        confirmLabel: 'Clear',
        onConfirm: () => {
          dispatch({ type: 'chat/clear', projectId: project.id, chatId: chat.id })
          toast('Conversation cleared')
        },
      }),
    [dispatch, toast],
  )

  const value = useMemo(
    () => ({
      createProject,
      editProject,
      changeProjectIcon,
      openProject,
      openProjectDetail,
      toggleProjectFolder,
      deleteProject,
      duplicateProject,
      createChat,
      openChat,
      renameChat,
      changeChatIcon,
      deleteChat,
      clearChat,
      openTrash: () => setTrashOpen(true),
      openStats: () => setStatsOpen(true),
      openCommands: () => setCommandsOpen(true),
    }),
    [
      createProject, editProject, changeProjectIcon, openProject, openProjectDetail,
      toggleProjectFolder, deleteProject, duplicateProject, createChat, openChat,
      renameChat, changeChatIcon, deleteChat, clearChat,
    ],
  )

  return (
    <LibraryContext.Provider value={value}>
      {children}

      {projectModal && (
        <ProjectModal
          initial={projectModal.mode === 'edit' ? projectModal.project : null}
          onClose={() => setProjectModal(null)}
          onSave={({ name, desc, icon, folder, instructions }) => {
            if (projectModal.mode === 'edit') {
              const id = projectModal.project.id
              // Pinned files belong to the folder that was open; pointing the
              // project somewhere else leaves them dangling.
              const movedFolder = projectModal.project.folder?.root !== folder?.root
              dispatch({
                type: 'project/update',
                id,
                patch: { name, desc, icon, folder, ...(movedFolder ? { pinned: [] } : null) },
              })
              dispatch({ type: 'project/settings', id, patch: { systemPrompt: instructions } })
              toast('Project updated')
              return
            }
            const project = newProject({
              name,
              desc,
              icon,
              folder,
              settings: { systemPrompt: instructions },
            })
            dispatch({ type: 'project/create', project })
            dispatch({ type: 'view', view: 'chat' })
            toast(`Project “${name}” created`)
          }}
        />
      )}

      {iconModal && (
        <IconModal
          title={iconModal.title}
          subtitle={iconModal.subtitle}
          initial={iconModal.initial}
          fallback={iconModal.fallback}
          onSave={iconModal.save}
          onClose={() => setIconModal(null)}
        />
      )}

      {trashOpen && <TrashModal onClose={() => setTrashOpen(false)} />}
      {statsOpen && <StatsModal onClose={() => setStatsOpen(false)} projects={state.projects} />}
      {commandsOpen && <CommandsModal onClose={() => setCommandsOpen(false)} />}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          onConfirm={confirm.onConfirm}
          onClose={() => setConfirm(null)}
        />
      )}
    </LibraryContext.Provider>
  )
}

export function useLibrary() {
  const ctx = useContext(LibraryContext)
  if (!ctx) throw new Error('useLibrary must be used inside LibraryProvider')
  return ctx
}
