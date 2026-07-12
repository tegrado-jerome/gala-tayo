import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { isPath, parseAreaPagePath, parseCanonicalPlacePath, parseCategoryPagePath, parseEditGalaPlanPath, parseLegacyPlaceSlugPath, parseLegacyPublicGalaPlanPath, parseOwnedGalaPlanPath, parsePublicGalaPlanPath, parsePublicProfileUsername, shouldSkipTopScrollRestore, getSoonFeatureRedirectPath } from './utils/routes'
import { isProtectedAccountPath } from './utils/routeGuards'
import { getLegacyAdminRedirectPath } from './utils/adminRoutes'
import { useAuthOrchestration } from './hooks/useAuthOrchestration'
import { useCanonicalRedirects } from './hooks/useCanonicalRedirects'
import { matchRoute, AppShell } from './routes/RouteContent'
import { consumePendingNavigationSource, navigateToPath, replaceWithPath } from './utils/navigation'
import { initializeAnalytics, trackPageView } from './utils/analytics'

function App() {
  const {
    session,
    hasResolvedInitialAuth,
    needsOnboarding,
    hasResolvedProfile,
    isInitialProfileLoading,
    currentUser,
    currentProfile,
    isAdminMfaLoading,
    adminMfaStatus,
    profileError,
    setProfileRefreshKey,
  } = useAuthOrchestration()

  const [locationState, setLocationState] = useState(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
  }))
  const [navigationSource, setNavigationSource] = useState<'push' | 'replace' | 'pop'>('push')
  const [restoredScrollY, setRestoredScrollY] = useState<number | null>(null)

  const { pathname, search } = locationState
  const legacyAdminRedirectPath = useMemo(() => getLegacyAdminRedirectPath(pathname), [pathname])
  const isPasswordResetPath = isPath(pathname, '/reset-password') || isPath(pathname, '/auth/reset-password')
  const routeNeedsBlockingAuth = isProtectedAccountPath(pathname) || isPath(pathname, '/onboarding') || isPath(pathname, '/auth/callback') || isPasswordResetPath

  useEffect(() => {
    const handlePopState = () => {
      const nextNavigationSource = consumePendingNavigationSource() ?? 'pop'
      setNavigationSource(nextNavigationSource)
      setRestoredScrollY(nextNavigationSource === 'pop' ? (typeof window.history.state?.scrollY === 'number' ? window.history.state.scrollY : null) : null)
      setLocationState({
        pathname: window.location.pathname,
        search: window.location.search,
      })
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    window.history.scrollRestoration = 'manual'
  }, [])

  useEffect(() => {
    initializeAnalytics()
  }, [])

  function runWithInstantScroll(callback: () => void) {
    const html = document.documentElement
    const body = document.body
    const previousHtmlScrollBehavior = html.style.scrollBehavior
    const previousBodyScrollBehavior = body.style.scrollBehavior

    html.style.scrollBehavior = 'auto'
    body.style.scrollBehavior = 'auto'

    callback()

    html.style.scrollBehavior = previousHtmlScrollBehavior
    body.style.scrollBehavior = previousBodyScrollBehavior
  }

  useLayoutEffect(() => {
    if (navigationSource === 'pop') {
      if (restoredScrollY !== null) {
        const targetScrollY = Math.max(restoredScrollY, 0)
        const maxRetries = 6
        const timeoutIds: number[] = []
        const animationFrameIds: number[] = []
        let cancelled = false

        const clearScheduledWork = () => {
          timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId))
          animationFrameIds.forEach((frameId) => window.cancelAnimationFrame(frameId))
        }

        const attemptRestore = (attempt: number) => {
          if (cancelled) {
            return
          }

          runWithInstantScroll(() => {
            window.scrollTo({
              top: targetScrollY,
              left: 0,
              behavior: 'auto',
            })
          })

          if (cancelled) {
            return
          }

          if (Math.abs(window.scrollY - targetScrollY) <= 1 || attempt >= maxRetries) {
            clearScheduledWork()
            setRestoredScrollY(null)
            return
          }

          const nextAttempt = attempt + 1
          const timeoutId = window.setTimeout(() => attemptRestore(nextAttempt), 120 * nextAttempt)
          timeoutIds.push(timeoutId)

          const frameId = window.requestAnimationFrame(() => {
            const nextFrameId = window.requestAnimationFrame(() => attemptRestore(nextAttempt))
            animationFrameIds.push(nextFrameId)
          })
          animationFrameIds.push(frameId)
        }

        attemptRestore(0)

        return () => {
          cancelled = true
          clearScheduledWork()
        }
      }
      return
    }

    if (shouldSkipTopScrollRestore(pathname, search)) {
      return
    }

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'auto',
    })
  }, [navigationSource, pathname, search, restoredScrollY])

  useCanonicalRedirects(pathname)

  useEffect(() => {
    trackPageView({
      pathname,
      title: document.title,
    })
  }, [pathname, search])

  useEffect(() => {
    if (!hasResolvedInitialAuth) {
      return
    }

    if (isPasswordResetPath) {
      return
    }

    if (!session) {
      if (isPath(pathname, '/onboarding')) {
        navigateToPath('/login')
      }
      return
    }

    if (!hasResolvedProfile) {
      return
    }

    if (needsOnboarding && !isPath(pathname, '/onboarding')) {
      navigateToPath('/onboarding')
      return
    }

    if (!needsOnboarding && isPath(pathname, '/onboarding')) {
      navigateToPath('/')
    }
  }, [hasResolvedInitialAuth, hasResolvedProfile, isPasswordResetPath, needsOnboarding, pathname, session])

  const canonicalPlacePath = useMemo(() => parseCanonicalPlacePath(pathname), [pathname])
  const categoryPageSlug = useMemo(() => parseCategoryPagePath(pathname), [pathname])
  const areaPageSlug = useMemo(() => parseAreaPagePath(pathname), [pathname])
  const legacyPlaceSlug = useMemo(() => parseLegacyPlaceSlugPath(pathname), [pathname])
  const legacyPublicGalaPlanPath = useMemo(() => parseLegacyPublicGalaPlanPath(pathname), [pathname])
  const publicGalaPlanPath = useMemo(() => parsePublicGalaPlanPath(pathname), [pathname])
  const publicProfileUsername = useMemo(() => parsePublicProfileUsername(pathname), [pathname])
  const editGalaPlanId = useMemo(() => parseEditGalaPlanPath(pathname), [pathname])
  const ownedGalaPlanId = useMemo(() => parseOwnedGalaPlanPath(pathname), [pathname])
  const soonFeatureRedirectPath = useMemo(() => getSoonFeatureRedirectPath(pathname), [pathname])

  useEffect(() => {
    if (soonFeatureRedirectPath && pathname !== '/') {
      replaceWithPath('/')
    }
  }, [pathname, soonFeatureRedirectPath])

  useEffect(() => {
    if (!legacyAdminRedirectPath) {
      return
    }

    replaceWithPath(legacyAdminRedirectPath)
  }, [legacyAdminRedirectPath])

  const content = matchRoute({
    session,
    hasResolvedInitialAuth,
    hasResolvedProfile,
    isInitialProfileLoading,
    profileError,
    needsOnboarding,
    pathname,
    search,
    isPasswordResetPath,
    routeNeedsBlockingAuth,
    soonFeatureRedirectPath,
    canonicalPlacePath,
    categoryPageSlug,
    areaPageSlug,
    legacyPlaceSlug,
    legacyPublicGalaPlanPath,
    publicGalaPlanPath,
    publicProfileUsername,
    editGalaPlanId,
    ownedGalaPlanId,
    currentUser,
    currentProfile,
    isAdminMfaLoading,
    adminMfaStatus,
    navigationSource,
    onProfileRefreshKeyUpdate: () => setProfileRefreshKey((v) => v + 1),
  })

  return (
    <AppShell
      session={session}
      currentUser={currentUser}
      currentProfile={currentProfile}
      adminMfa={{
        isLoading: isAdminMfaLoading,
        status: adminMfaStatus,
      }}
      hasResolvedInitialAuth={hasResolvedInitialAuth}
      pathname={pathname}
      search={search}
    >
      {content}
    </AppShell>
  )
}

export default App
