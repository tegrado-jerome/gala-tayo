const LOGOUT_TRANSITION_EVENT = 'galatayo:logout-transition'
const LOGOUT_TRANSITION_STORAGE_KEY = 'galatayo:logout-transition'

const LOGOUT_TRANSITION_DURATION_MS = 900
const LOGOUT_TRANSITION_EXIT_MS = 220
const LOGOUT_TRANSITION_STALE_MS = 5000

type LogoutTransitionDetail =
  | {
      phase: 'start'
      startedAt: number
    }
  | {
      phase: 'end'
    }

function dispatchLogoutTransition(detail: LogoutTransitionDetail) {
  window.dispatchEvent(new CustomEvent<LogoutTransitionDetail>(LOGOUT_TRANSITION_EVENT, { detail }))
}

function startLogoutTransition() {
  const startedAt = Date.now()

  try {
    window.sessionStorage.setItem(
      LOGOUT_TRANSITION_STORAGE_KEY,
      JSON.stringify({ startedAt }),
    )
  } catch {
    // Ignore storage failures and still emit the in-memory event.
  }

  dispatchLogoutTransition({
    phase: 'start',
    startedAt,
  })

  return startedAt
}

function endLogoutTransition() {
  try {
    window.sessionStorage.removeItem(LOGOUT_TRANSITION_STORAGE_KEY)
  } catch {
    // Ignore storage failures.
  }

  dispatchLogoutTransition({ phase: 'end' })
}

function getPendingLogoutTransitionStart() {
  try {
    const rawValue = window.sessionStorage.getItem(LOGOUT_TRANSITION_STORAGE_KEY)

    if (!rawValue) {
      return null
    }

    const parsedValue = JSON.parse(rawValue) as { startedAt?: unknown }

    if (typeof parsedValue.startedAt !== 'number') {
      window.sessionStorage.removeItem(LOGOUT_TRANSITION_STORAGE_KEY)
      return null
    }

    if (Date.now() - parsedValue.startedAt > LOGOUT_TRANSITION_STALE_MS) {
      window.sessionStorage.removeItem(LOGOUT_TRANSITION_STORAGE_KEY)
      return null
    }

    return parsedValue.startedAt
  } catch {
    return null
  }
}

export {
  LOGOUT_TRANSITION_DURATION_MS,
  LOGOUT_TRANSITION_EVENT,
  LOGOUT_TRANSITION_EXIT_MS,
  LOGOUT_TRANSITION_STALE_MS,
  endLogoutTransition,
  getPendingLogoutTransitionStart,
  startLogoutTransition,
}
export type { LogoutTransitionDetail }
