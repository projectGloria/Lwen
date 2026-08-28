import { useCallback, useEffect, useRef, useState } from 'react'
import { streamChat, tokensPerSecond, OllamaError } from '../lib/ollama'
import { buildRequest } from '../lib/context'
import { uid } from '../state/store'
import { useStats } from '../state/stats'

/**
 * Owns one turn of conversation: builds the payload, streams the reply, and
 * writes it back into the store. Token updates are batched onto animation
 * frames — a fast local model can emit far more tokens than React should
 * re-render for.
 */
export function useChat({ project, chat, index, pinnedPaths, dispatch }) {
  const [streaming, setStreaming] = useState(false)
  const { bump } = useStats()
  const abortRef = useRef(null)
  const bufferRef = useRef({ content: '', thinking: '' })
  const frameRef = useRef(0)
  const targetRef = useRef(null)

  const flush = useCallback(() => {
    frameRef.current = 0
    const target = targetRef.current
    if (!target) return
    dispatch({
      type: 'message/patch',
      projectId: target.projectId,
      chatId: target.chatId,
      id: target.id,
      patch: {
        content: bufferRef.current.content,
        thinking: bufferRef.current.thinking || undefined,
        pending: false,
      },
    })
  }, [dispatch])

  const schedule = useCallback(() => {
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(flush)
  }, [flush])

  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      abortRef.current?.abort()
    },
    [],
  )

  const run = useCallback(
    async ({ userText, attachments, history, projectId, chatId, settings }) => {
      const assistantId = uid()
      targetRef.current = { projectId, chatId, id: assistantId }
      bufferRef.current = { content: '', thinking: '' }

      const { messages, warnings, contextUsed, estimatedTokens } = buildRequest({
        userText,
        attachments,
        history,
        systemPrompt: settings.systemPrompt,
        index,
        projectName: project?.folder?.name || '',
        pinnedPaths,
        contextWindow: settings.contextWindow,
      })

      dispatch({
        type: 'message/append',
        projectId,
        chatId,
        message: {
          id: assistantId,
          role: 'assistant',
          content: '',
          ts: Date.now(),
          model: settings.model,
          streaming: true,
          pending: true,
          contextUsed,
          warnings,
        },
      })

      const controller = new AbortController()
      abortRef.current = controller
      setStreaming(true)

      let aborted = false
      try {
        const stats = await streamChat({
          model: settings.model,
          messages,
          options: {
            temperature: settings.temperature,
            top_p: settings.topP,
            num_ctx: settings.contextWindow,
          },
          signal: controller.signal,
          onChunk: ({ content, thinking }) => {
            if (content) bufferRef.current.content += content
            if (thinking) bufferRef.current.thinking += thinking
            schedule()
          },
        })

        if (frameRef.current) {
          cancelAnimationFrame(frameRef.current)
          frameRef.current = 0
        }
        dispatch({
          type: 'message/patch',
          projectId,
          chatId,
          id: assistantId,
          patch: {
            content: bufferRef.current.content,
            thinking: bufferRef.current.thinking || undefined,
            streaming: false,
            pending: false,
            stats: stats
              ? {
                  tps: tokensPerSecond(stats),
                  evalCount: stats.evalCount,
                  promptTokens: stats.promptEvalCount,
                  estimatedPromptTokens: estimatedTokens,
                }
              : null,
          },
        })
        bump('replies')
        if (stats?.evalCount) bump('tokens', stats.evalCount)
      } catch (e) {
        aborted = e?.name === 'AbortError'
        if (frameRef.current) {
          cancelAnimationFrame(frameRef.current)
          frameRef.current = 0
        }
        dispatch({
          type: 'message/patch',
          projectId,
          chatId,
          id: assistantId,
          patch: {
            content: bufferRef.current.content,
            thinking: bufferRef.current.thinking || undefined,
            streaming: false,
            pending: false,
            stopped: aborted || undefined,
            error: aborted
              ? undefined
              : e instanceof OllamaError
                ? e.message
                : e?.message || 'The request failed.',
          },
        })
      } finally {
        abortRef.current = null
        targetRef.current = null
        setStreaming(false)
      }
      return !aborted
    },
    [dispatch, index, pinnedPaths, project, schedule, bump],
  )

  const send = useCallback(
    async ({ text, attachments = [] }) => {
      if (!project || !chat || streaming) return
      const userText = text.trim()
      if (!userText) return

      const history = chat.messages
        .filter((m) => !m.error && m.content)
        .map((m) => ({ role: m.role, content: m.content }))

      dispatch({
        type: 'message/append',
        projectId: project.id,
        chatId: chat.id,
        message: {
          id: uid(),
          role: 'user',
          content: userText,
          ts: Date.now(),
          attachments: attachments.map((a) => ({ name: a.name, kind: a.kind, bytes: a.bytes })),
        },
      })
      bump('asks')

      await run({
        userText,
        attachments,
        history,
        projectId: project.id,
        chatId: chat.id,
        settings: project.settings,
      })
    },
    [project, chat, streaming, dispatch, run, bump],
  )

  /** Re-runs the turn that produced `assistantId`, replacing its reply. */
  const regenerate = useCallback(
    async (assistantId) => {
      if (!project || !chat || streaming) return
      const i = chat.messages.findIndex((m) => m.id === assistantId)
      if (i < 1) return
      const priorUser = [...chat.messages.slice(0, i)].reverse().find((m) => m.role === 'user')
      if (!priorUser) return

      dispatch({
        type: 'message/truncateFrom',
        projectId: project.id,
        chatId: chat.id,
        id: assistantId,
      })

      const history = chat.messages
        .slice(0, i)
        .filter((m) => !m.error && m.content && m.id !== priorUser.id)
        .map((m) => ({ role: m.role, content: m.content }))

      await run({
        userText: priorUser.content,
        // The original attachment text is not retained after a turn completes.
        attachments: [],
        history,
        projectId: project.id,
        chatId: chat.id,
        settings: project.settings,
      })
    },
    [project, chat, streaming, dispatch, run],
  )

  const stop = useCallback(() => abortRef.current?.abort(), [])

  return { send, stop, regenerate, streaming }
}
