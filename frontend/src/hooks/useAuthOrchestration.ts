import { useEffect, useRef, useState } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import { preloadAvatarImage } from '../utils/avatarImageCache'
import { getCurrentUser, getOnboardingStatus, type CurrentUserResponse } from '../utils/profileApi'
import { getAdminMfaStatus, type AdminMfaStatus } from '../utils/adminMfa'
import { clearAppResumeCache, readAppResumeCache, writeAppResumeCache } from '../utils/appResumeCache'
import { clearEmptyHashFragment } from '../utils/navigation'

function isSessionExpired(session: Session | null): boolean {
  if (!session) return false
  if (!session.expires_at) return false
  return session.expires_at * 1000 <= Date.now()
}

export function useAuthOrchestration() {
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
  const [profileError, setProfileError] = useState('')
  const [profileRefreshKey, setProfileRefreshKey] = useState(0)
  const sessionRef = useRef<Session | null>(null)
  const hasCompletedInitialAuthRef = useRef(false)
  const userId = session?.user?.id ?? null

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        clearEmptyHashFragment()

        if (data.session && isSessionExpired(data.session)) {
          supabase.auth.signOut()
          sessionRef.current = null
          setSession(null)
          setCurrentUser(null)
          setCurrentProfile(null)
          setNeedsOnboarding(false)
          setHasResolvedProfile(true)
          clearAppResumeCache()
        } else {
          if (data.session && initialResumeCache?.userId !== data.session.user.id) {
            setCurrentProfile(null)
            setNeedsOnboarding(false)
            setHasResolvedProfile(false)
            clearAppResumeCache()
          } else if (!data.session) {
            setCurrentProfile(null)
            setNeedsOnboarding(false)
            setHasResolvedProfile(true)
            clearAppResumeCache()
          }
          sessionRef.current = data.session
          setSession(data.session)
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
    if (!hasResolvedInitialAuth) {
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

    let isMounted = true

    const loadCurrentProfile = async () => {
      try {
        setIsCurrentProfileLoading(true)
        const data = await getCurrentUser(activeSession)

        if (isMounted) {
          setCurrentUser(data.user)
          setCurrentProfile(data.profile)
        }
      } catch {
        if (isMounted) {
          setCurrentUser(null)
          setCurrentProfile(null)
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
  }, [hasResolvedInitialAuth, profileRefreshKey, userId])

  useEffect(() => {
    if (!hasResolvedInitialAuth) {
      return undefined
    }

    const activeSession = sessionRef.current

    if (!activeSession) {
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
  }, [hasResolvedInitialAuth, profileRefreshKey, userId])

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
    profileError,
    profileRefreshKey,
    setProfileRefreshKey,
    sessionRef,
  }
}
