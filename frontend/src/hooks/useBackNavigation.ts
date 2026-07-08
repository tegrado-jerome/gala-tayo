import { useCallback, useEffect, useState } from 'react'
import { getHistoryState, getLabelForPath, hasInAppBackHistory } from '../utils/navigationHistory'

type BackNavigationState = {
  previousLabel: string | null
  previousPath: string | null
  hasHistory: boolean
}

function useBackNavigation() {
  const [state, setState] = useState<BackNavigationState>(() => {
    const historyState = getHistoryState()
    const fromPath = historyState?.from ?? null
    const fromLabel = historyState?.fromLabel ?? (fromPath ? getLabelForPath(fromPath) : null)
    return {
      previousLabel: fromLabel,
      previousPath: fromPath,
      hasHistory: typeof window !== 'undefined' && (hasInAppBackHistory() || window.history.length > 1),
    }
  })

  useEffect(() => {
    function handlePopState() {
      const historyState = getHistoryState()
      const fromPath = historyState?.from ?? null
      const fromLabel = historyState?.fromLabel ?? (fromPath ? getLabelForPath(fromPath) : null)
      setState({
        previousLabel: fromLabel,
        previousPath: fromPath,
        hasHistory: hasInAppBackHistory() || window.history.length > 1,
      })
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const goBack = useCallback(() => {
    if (state.previousPath || state.hasHistory) {
      window.history.back()
    } else {
      window.location.href = '/'
    }
  }, [state.hasHistory, state.previousPath])

  return { ...state, goBack }
}

export default useBackNavigation
