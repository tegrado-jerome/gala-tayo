import { createClient } from '@supabase/supabase-js'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { createRefreshRetryFetch } from './utils/authRefreshRetry'

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim()
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

const rememberMeKey = 'galatayo:remember-me'

const authStorage = {
  getItem(key: string): string | null {
    return localStorage.getItem(key) ?? sessionStorage.getItem(key)
  },
  // Sessions persist unless "Remember me" was unticked at login. An email-confirm link opens a new tab
  // with empty sessionStorage, so defaulting to tab-only storage logged new users out on tab close.
  setItem(key: string, value: string): void {
    if (sessionStorage.getItem(rememberMeKey) === 'false') {
      sessionStorage.setItem(key, value)
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
      sessionStorage.removeItem(key)
    }
  },
  removeItem(key: string): void {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  },
}

let lastRefreshFailureAt = 0

/** Fired on window when a signed-in user lost their session to a failed refresh (not by logging out). */
export const SESSION_LOST_EVENT = 'galatayo:session-lost'
let isSessionLostPending = false

export function reportSessionLost() {
  isSessionLostPending = true
  window.dispatchEvent(new Event(SESSION_LOST_EVENT))
}

/** Read once by the notice, which may mount after the loss was reported. */
export function takeSessionLost() {
  const pending = isSessionLostPending
  isSessionLostPending = false
  return pending
}

/** True right after a token refresh failed for good, so a SIGNED_OUT that follows was not the user's choice. */
export function consumeRecentRefreshFailure(windowMs = 30_000) {
  const failed = Date.now() - lastRefreshFailureAt < windowMs
  lastRefreshFailureAt = 0
  return failed
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: createRefreshRetryFetch((input, init) => fetch(input, init), {
      onRefreshFailed: () => {
        lastRefreshFailureAt = Date.now()
      },
    }),
  },
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: authStorage,
  },
})

export async function getSupabaseSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  return session
}

export async function getSupabaseAccessToken(session?: Session | null) {
  const currentSession = await getSupabaseSession()

  if (currentSession?.access_token) {
    return currentSession.access_token
  }

  return session?.access_token ?? null
}

export function hasSessionUserChanged(previousSession: Session | null, nextSession: Session | null) {
  const previousUserId = previousSession?.user?.id ?? null
  const nextUserId = nextSession?.user?.id ?? null

  return previousUserId !== nextUserId
}

export function shouldPropagateSessionChange(
  event: AuthChangeEvent,
  previousSession: Session | null,
  nextSession: Session | null,
) {
  return hasSessionUserChanged(previousSession, nextSession) || event === 'SIGNED_OUT'
}
