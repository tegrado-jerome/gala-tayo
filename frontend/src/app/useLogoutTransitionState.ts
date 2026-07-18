import { useEffect, useState } from 'react'
import {
  getPendingLogoutTransitionStart,
  LOGOUT_TRANSITION_EVENT,
  LOGOUT_TRANSITION_EXIT_MS,
  LOGOUT_TRANSITION_STALE_MS,
  type LogoutTransitionDetail,
} from '../utils/logoutTransition'

type LogoutTransitionState = {
  isVisible: boolean
  isExiting: boolean
}

export function useLogoutTransitionState() {
  const [logoutTransitionState, setLogoutTransitionState] = useState<{
    startedAt: number | null
    isExiting: boolean
  }>(() => (
    typeof window === 'undefined'
      ? { startedAt: null, isExiting: false }
      : { startedAt: getPendingLogoutTransitionStart(), isExiting: false }
  ))

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const handleLogoutTransition = (event: Event) => {
      const customEvent = event as CustomEvent<LogoutTransitionDetail>

      if (customEvent.detail.phase === 'start') {
        setLogoutTransitionState({
          startedAt: customEvent.detail.startedAt,
          isExiting: false,
        })
        return
      }

      setLogoutTransitionState((currentState) => (
        currentState.startedAt === null
          ? currentState
          : { ...currentState, isExiting: true }
      ))
    }

    window.addEventListener(LOGOUT_TRANSITION_EVENT, handleLogoutTransition)

    return () => {
      window.removeEventListener(LOGOUT_TRANSITION_EVENT, handleLogoutTransition)
    }
  }, [])

  useEffect(() => {
    if (logoutTransitionState.startedAt === null) {
      return undefined
    }

    if (logoutTransitionState.isExiting) {
      const timeoutId = window.setTimeout(() => {
        setLogoutTransitionState({ startedAt: null, isExiting: false })
      }, LOGOUT_TRANSITION_EXIT_MS)

      return () => {
        window.clearTimeout(timeoutId)
      }
    }

    const staleMs = Math.max(
      LOGOUT_TRANSITION_STALE_MS - (Date.now() - logoutTransitionState.startedAt),
      LOGOUT_TRANSITION_EXIT_MS,
    )

    const timeoutId = window.setTimeout(() => {
      setLogoutTransitionState((currentState) => (
        currentState.startedAt === null
          ? currentState
          : { ...currentState, isExiting: true }
      ))
    }, staleMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [logoutTransitionState])

  return {
    isVisible: logoutTransitionState.startedAt !== null,
    isExiting: logoutTransitionState.isExiting,
  } satisfies LogoutTransitionState
}
