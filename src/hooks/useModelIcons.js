import { useCallback, useMemo } from 'react'
import { useStore } from '../state/store'

/**
 * User-assigned model marks, keyed by the full model name (`qwen2.5-coder:7b`).
 *
 * They live in account preferences rather than beside the model, because Ollama
 * owns the model list: re-pulling one, or having it fall out of `/api/tags` for
 * a moment, must not lose the icon you picked for it.
 */
export function useModelIcons() {
  const { state, dispatch } = useStore()
  const icons = state.prefs?.modelIcons ?? {}

  const setIcon = useCallback(
    (model, icon) => {
      if (!model) return
      const next = { ...(state.prefs?.modelIcons ?? {}) }
      if (icon) next[model] = icon
      else delete next[model]
      dispatch({ type: 'prefs', patch: { modelIcons: next } })
    },
    [state.prefs, dispatch],
  )

  return useMemo(
    () => ({ icons, iconFor: (model) => icons[model] ?? null, setIcon }),
    [icons, setIcon],
  )
}
