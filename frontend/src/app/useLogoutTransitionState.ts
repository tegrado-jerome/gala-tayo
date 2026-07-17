import { useEffect, useState } from 'react'
import {
  getPendingLogoutTransitionStart,
  LOGOUT_TRANSITION_DURATION_MS,
  LOGOUT_TRANSITION_EVENT,
  type LogoutTransitionDetail,
} from '../utils/logoutTransition'

export function useLogoutTransitionState() {
  const [logoutTransitionStartedAt, setLogoutTransitionStartedAt] = useState<number | null>(() => (
    typeof window === 'undefined' ? null : getPendingLogoutTransitionStart()
  ))

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const handleLogoutTransition = (event: Event) => {
      const customEvent = event as CustomEvent<LogoutTransitionDetail>

      if (customEvent.detail.phase === 'start') {
        setLogoutTransitionStartedAt(customEvent.detail.startedAt)
        return
      }

      setLogoutTransitionStartedAt(null)
    }

    window.addEventListener(LOGOUT_TRANSITION_EVENT, handleLogoutTransition)

    return () => {
      window.removeEventListener(LOGOUT_TRANSITION_EVENT, handleLogoutTransition)
    }
  }, [])

  useEffect(() => {
    if (logoutTransitionStartedAt === null) {
      return undefined
    }

    const remainingMs = Math.max(
      LOGOUT_TRANSITION_DURATION_MS - (Date.now() - logoutTransitionStartedAt),
      0,
    )

    if (remainingMs === 0) {
      setLogoutTransitionStartedAt(null)
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setLogoutTransitionStartedAt(null)
    }, remainingMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [logoutTransitionStartedAt])

  return logoutTransitionStartedAt !== null
}
