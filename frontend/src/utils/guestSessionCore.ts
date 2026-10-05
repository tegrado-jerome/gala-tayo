import type { AuthError, Session } from '@supabase/supabase-js'

type GuestAuthClient = {
  getSession: () => Promise<{ data: { session: Session | null } }>
  signInAnonymously: () => Promise<{ data: { session: Session | null }; error: AuthError | null }>
}

type GuestSessionDeps = {
  auth: GuestAuthClient
  /** Reads the project's public auth settings; resolves true when anonymous sign-ins are on. */
  isAnonymousProviderEnabled: () => Promise<boolean>
  /** Runs right before the anonymous sign-in so the session is stored like a "remember me" login. */
  beforeSignIn?: () => void
}

export function isAnonymousSession(session: Session | null | undefined) {
  return session?.user?.is_anonymous === true
}

export function hasAccountSession(session: Session | null | undefined): session is Session {
  return Boolean(session?.user?.id) && !isAnonymousSession(session)
}

/** Guest sessions are created lazily: only when a visitor taps "Continue as guest", never on page view. */
export function createGuestSessionManager({ auth, isAnonymousProviderEnabled, beforeSignIn }: GuestSessionDeps) {
  let availability: Promise<boolean> | null = null
  let pending: Promise<Session | null> | null = null
  let isDisabled = false

  const isGuestModeAvailable = () => {
    if (isDisabled) return Promise.resolve(false)
    availability ??= isAnonymousProviderEnabled().catch(() => false)
    return availability
  }

  const signIn = async (): Promise<Session | null> => {
    const { data } = await auth.getSession()
    if (data.session) return data.session
    if (!(await isGuestModeAvailable())) return null

    beforeSignIn?.()
    const result = await auth.signInAnonymously()
    if (result.error || !result.data.session) {
      // anonymous_provider_disabled (or any failure) quietly falls back to the normal sign-in prompt.
      isDisabled = true
      return null
    }
    return result.data.session
  }

  /** Returns the current session, or a new guest session; null when guest mode is off or sign-in failed. */
  const ensureGuestSession = () => {
    pending ??= signIn()
      .catch(() => null)
      .finally(() => {
        pending = null
      })
    return pending
  }

  return { isGuestModeAvailable, ensureGuestSession }
}
