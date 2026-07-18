import { useEffect, useRef } from 'react'

type UseAskAiUsageAutoRefreshOptions = {
  enabled: boolean
  intervalMs?: number
  onRefresh: () => void
}

export function useAskAiUsageAutoRefresh({
  enabled,
  intervalMs = 15_000,
  onRefresh,
}: UseAskAiUsageAutoRefreshOptions) {
  const onRefreshRef = useRef(onRefresh)

  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return
    }

    const triggerRefresh = () => {
      onRefreshRef.current()
    }

    const handleFocus = () => {
      triggerRefresh()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerRefresh()
      }
    }

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        triggerRefresh()
      }
    }

    const intervalId = window.setInterval(triggerRefresh, intervalMs)

    window.addEventListener('focus', handleFocus)
    window.addEventListener('pageshow', handlePageShow)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('pageshow', handlePageShow)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, intervalMs])
}
