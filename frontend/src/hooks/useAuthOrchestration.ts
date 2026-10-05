import { useCallback, useEffect, useRef, useState } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import { preloadAvatarImage } from '../utils/avatarImageCache'
import { getCurrentUser, getOnboardingStatus, type CurrentUserResponse } from '../utils/profileApi'
import { getAdminMfaStatus, type AdminMfaStatus } from '../utils/adminMfa'
import { getUserMfaStatus, type UserMfaStatus } from '../utils/userMfa'
import { clearAppResumeCache, readAppResumeCache, writeAppResumeCache } from '../utils/appResumeCache'
import { clearEmptyHashFragment } from '../utils/navigation'
import { isAdminPath } from '../utils/routeGuards'
import { isAnonymousSession } from '../utils/guestSession'

const INITIAL_AUTH_TIMEOUT_MS = 6000

function isSessionExpired(session: Session | null): boolean {
  if (!session) return false
  if (!session.expires_at) return false
  return session.expires_at * 1000 <= Date.now()
}

function createTimeoutPromise<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(value), ms)
  })
}

async function getRecoverableInitialSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!isSessionExpired(session)) {
    return session
  }

  const {
    data: { session: refreshedSession },
    error,
  } = await supabase.auth.refreshSession()

  if (error) {
    return null
  }

  return refreshedSession
}

export function useAuthOrchestration({ pathname }: { pathname: string }) {
  const [initialResumeCache] = useState(() => readAppResumeCache())
  const [session, setSession] = useState<Session | null>(null)
  const [hasResolvedInitialAuth, setHasResolvedInitialAuth] = useState(false)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [hasResolvedProfile, setHasResolvedProfile] = useState(initialResumeCache?.needsOnboarding === false)
  const [isInitialProfileLoading, setIsInitialProfileLoading] = useState(false)
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse['user'] | null>(null)
  const [currentProfile, setCurrentProfile] = useState<CurrentUserResponse['profile'] | null>(initialResumeCache?.currentProfile ?? null)
  const [, setIsCurrentProfileLoading] = useState(false)
  const [, setIsRefreshingSession] = useState(false)
  const [isAdminMfaLoading, setIsAdminMfaLoading] = useState(false)
  const [adminMfaStatus, setAdminMfaStatus] = useState<AdminMfaStatus | null>(null)
  const [isUserMfaLoading, setIsUserMfaLoading] = useState(false)
  const [userMfaStatus, setUserMfaStatus] = useState<UserMfaStatus | null>(null)
  const [profileError, setProfileError] = useState('')
  const [profileRefreshKey, setProfileRefreshKey] = useState(0)
  const sessionRef = useRef<Session | null>(null)
  const hasCompletedInitialAuthRef = useRef(false)
  const skipNextUserMfaLoadRef = useRef(false)
  const userId = session?.user?.id ?? null
  // Guest (anonymous) sessions have no profile, onboarding or device-code MFA.
  const isAnonymous = isAnonymousSession(session)

  useEffect(() => {
    let isMounted = true

    Promise.race([
      getRecoverableInitialSession().catch(() => null as Session | null),
      createTimeoutPromise(INITIAL_AUTH_TIMEOUT_MS, null as Session | null),
    ]).then((resolvedSession) => {
      if (isMounted) {
        clearEmptyHashFragment()

        if (!resolvedSession) {
          sessionRef.current = null
          setSession(null)
          setCurrentUser(null)
          setCurrentProfile(null)
          setNeedsOnboarding(false)
          setHasResolvedProfile(true)
          clearAppResumeCache()
        } else {
          if (initialResumeCache?.userId !== resolvedSession.user.id) {
            setCurrentProfile(null)
            setNeedsOnboarding(false)
            setHasResolvedProfile(false)
            clearAppResumeCache()
          }
          sessionRef.current = resolvedSession
          setSession(resolvedSession)
        }
        setHasResolvedInitialAuth(true)
        hasCompletedInitialAuthRef.current = true
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, nextSession) => {
      const previousUserId = sessionRef.current?.user?.id ?? null
      const nextUserId = nextSession?.user?.id ?? null
      const didUserIdentityChange = previousUserId !== nextUserId

      sessionRef.current = nextSession
      clearEmptyHashFragment()
      setSession(nextSession)
      setHasResolvedInitialAuth(true)
      const hasCompletedInitialAuth = hasCompletedInitialAuthRef.current
      hasCompletedInitialAuthRef.current = true

      if (event === 'SIGNED_OUT' || !nextSession) {
        setCurrentUser(null)
        setCurrentProfile(null)
        setNeedsOnboarding(false)
        setHasResolvedProfile(true)
        setProfileError('')
        setIsInitialProfileLoading(false)
        setIsCurrentProfileLoading(false)
        setIsRefreshingSession(false)
        setAdminMfaStatus(null)
        setIsAdminMfaLoading(false)
        setUserMfaStatus(null)
        setIsUserMfaLoading(false)
        clearAppResumeCache()
      }

      if (nextSession && didUserIdentityChange && hasCompletedInitialAuth) {
        setHasResolvedProfile(false)
      }

      if (
        didUserIdentityChange ||
        event === 'SIGNED_IN' ||
        event === 'SIGNED_OUT' ||
        event === 'USER_UPDATED' ||
        event === 'PASSWORD_RECOVERY'
      ) {
        setProfileRefreshKey((currentValue) => currentValue + 1)
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [initialResumeCache])

  useEffect(() => {
    const shouldLoadAdminMfa = isAdminPath(pathname)

    if (!hasResolvedInitialAuth || !shouldLoadAdminMfa) {
      if (!shouldLoadAdminMfa) {
        setAdminMfaStatus(null)
        setIsAdminMfaLoading(false)
      }
      return undefined
    }

    const activeSession = sessionRef.current

    if (!activeSession) {
      setCurrentUser(null)
      setCurrentProfile(null)
      setNeedsOnboarding(false)
      setHasResolvedProfile(true)
      setProfileError('')
      setIsInitialProfileLoading(false)
      setIsRefreshingSession(false)
      setAdminMfaStatus(null)
      setIsAdminMfaLoading(false)
      setUserMfaStatus(null)
      setIsUserMfaLoading(false)
      return undefined
    }

    if (isAnonymousSession(activeSession)) {
      setNeedsOnboarding(false)
      setHasResolvedProfile(true)
      return undefined
    }

    let isMounted = true
    const isInitialProfileResolution = !hasResolvedProfile

    const loadProfileState = async () => {
      try {
        if (isInitialProfileResolution) {
          setIsInitialProfileLoading(true)
        } else {
          setIsRefreshingSession(true)
        }
        setProfileError('')
        const data = await getOnboardingStatus(activeSession)

        if (!isMounted) {
          return
        }

        setNeedsOnboarding(data.needsOnboarding)
        setHasResolvedProfile(true)
      } catch (error) {
        if (isMounted) {
          setProfileError(error instanceof Error ? error.message : 'Failed to load profile.')
        }
      } finally {
        if (isMounted) {
          setIsInitialProfileLoading(false)
          setIsRefreshingSession(false)
        }
      }
    }

    void loadProfileState()

    return () => {
      isMounted = false
    }
  }, [hasResolvedInitialAuth, hasResolvedProfile, profileRefreshKey, userId])

  useEffect(() => {
    if (!hasResolvedInitialAuth) {
      return undefined
    }

    const activeSession = sessionRef.current

    if (!activeSession) {
      setCurrentUser(null)
      setCurrentProfile(null)
      setIsCurrentProfileLoading(false)
      return undefined
    }

    if (isAnonymousSession(activeSession)) {
      setCurrentUser(null)
      setCurrentProfile(null)
      setNeedsOnboarding(false)
      setHasResolvedProfile(true)
      setProfileError('')
      setIsCurrentProfileLoading(false)
      return undefined
    }

    let isMounted = true

    const loadCurrentProfile = async () => {
      try {
        setIsCurrentProfileLoading(true)
        setProfileError('')
        const data = await getCurrentUser(activeSession)

        if (isMounted) {
          setCurrentUser(data.user)
          setCurrentProfile(data.profile)
          setHasResolvedProfile(true)
          setNeedsOnboarding(!data.onboarding.completed || Boolean(data.user.needsPolicyAcceptance))
        }
      } catch (error) {
        if (isMounted) {
          setCurrentUser(null)
          setCurrentProfile(null)
          setProfileError(error instanceof Error ? error.message : 'Failed to load your profile. Please try again.')
        }
      } finally {
        if (isMounted) {
          setIsCurrentProfileLoading(false)
        }
      }
    }

    void loadCurrentProfile()

    return () => {
      isMounted = false
    }
  }, [hasResolvedInitialAuth, isAnonymous, pathname, profileRefreshKey, userId])

  useEffect(() => {
    if (!hasResolvedInitialAuth) {
      return undefined
    }

    const activeSession = sessionRef.current

    if (!activeSession || isAnonymousSession(activeSession)) {
      setAdminMfaStatus(null)
      setIsAdminMfaLoading(false)
      return undefined
    }

    let isMounted = true

    const loadAdminMfa = async () => {
      try {
        setIsAdminMfaLoading(true)
        const status = await getAdminMfaStatus(activeSession)

        if (isMounted) {
          setAdminMfaStatus(status)
        }
      } catch {
        if (isMounted) {
          setAdminMfaStatus(null)
        }
      } finally {
        if (isMounted) {
          setIsAdminMfaLoading(false)
        }
      }
    }

    void loadAdminMfa()

    return () => {
      isMounted = false
    }
  }, [hasResolvedInitialAuth, isAnonymous, profileRefreshKey, userId])

  useEffect(() => {
    if (!hasResolvedInitialAuth) {
      return undefined
    }

    const activeSession = sessionRef.current

    if (!activeSession) {
      skipNextUserMfaLoadRef.current = false
      setUserMfaStatus(null)
      setIsUserMfaLoading(false)
      return undefined
    }

    if (isAnonymousSession(activeSession)) {
      setUserMfaStatus({ needsMfa: false })
      setIsUserMfaLoading(false)
      return undefined
    }

    let isMounted = true

    const loadUserMfa = async () => {
      if (skipNextUserMfaLoadRef.current) {
        skipNextUserMfaLoadRef.current = false
        setUserMfaStatus({ needsMfa: false })
        setIsUserMfaLoading(false)
        return
      }

      try {
        setIsUserMfaLoading(true)
        const status = await getUserMfaStatus(activeSession)

        if (isMounted) {
          setUserMfaStatus(status)
        }
      } catch {
        if (isMounted) {
          setUserMfaStatus(null)
        }
      } finally {
        if (isMounted) {
          setIsUserMfaLoading(false)
        }
      }
    }

    void loadUserMfa()

    return () => {
      isMounted = false
    }
  }, [hasResolvedInitialAuth, isAnonymous, profileRefreshKey, userId])

  useEffect(() => {
    if (!hasResolvedInitialAuth) {
      return
    }

    if (!userId) {
      clearAppResumeCache()
      return
    }

    if (!hasResolvedProfile) {
      return
    }

    writeAppResumeCache({
      userId,
      needsOnboarding,
      currentProfile,
      cachedAt: Date.now(),
    })
  }, [currentProfile, hasResolvedInitialAuth, hasResolvedProfile, needsOnboarding, userId])

  useEffect(() => {
    const avatarUrl = currentProfile?.avatarUrl ?? currentProfile?.providerAvatarUrl ?? null

    if (!avatarUrl) {
      return
    }

    void preloadAvatarImage(avatarUrl)
  }, [currentProfile?.avatarUrl, currentProfile?.providerAvatarUrl])

  const markMfaVerified = useCallback(() => {
    setUserMfaStatus({ needsMfa: false })
    setIsUserMfaLoading(false)
  }, [])

  const refreshProfile = useCallback(() => {
    setProfileError('')
    setHasResolvedProfile(false)
    setNeedsOnboarding(false)
    setProfileRefreshKey((currentValue) => currentValue + 1)
  }, [])

  const markOnboardingComplete = useCallback((account?: CurrentUserResponse) => {
    skipNextUserMfaLoadRef.current = true
    setNeedsOnboarding(false)
    setHasResolvedProfile(true)
    if (account) {
      setCurrentUser(account.user)
      setCurrentProfile(account.profile)
    }
    setUserMfaStatus({ needsMfa: false })
    setIsUserMfaLoading(false)
    setProfileRefreshKey((currentValue) => currentValue + 1)
  }, [])

  return {
    session,
    userId,
    hasResolvedInitialAuth,
    needsOnboarding,
    hasResolvedProfile,
    isInitialProfileLoading,
    currentUser,
    currentProfile,
    isAdminMfaLoading,
    adminMfaStatus,
    isUserMfaLoading,
    userMfaStatus,
    isAnonymous,
    profileError,
    profileRefreshKey,
    setProfileRefreshKey,
    sessionRef,
    markMfaVerified,
    refreshProfile,
    markOnboardingComplete,
  }
}
