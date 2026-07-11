import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { markSoftNavigation, navigateToPath, replaceWithPath } from './utils/navigation'
import { isPath, parseAreaPagePath, parseCanonicalPlacePath, parseCategoryPagePath, parseEditGalaPlanPath, parseLegacyPlaceSlugPath, parseLegacyPublicGalaPlanPath, parseOwnedGalaPlanPath, parsePublicGalaPlanPath, parsePublicProfileUsername, shouldSkipTopScrollRestore, getSoonFeatureRedirectPath } from './utils/routes'
import { isProtectedAccountPath } from './utils/routeGuards'
import { useAuthOrchestration } from './hooks/useAuthOrchestration'
import { useCanonicalRedirects } from './hooks/useCanonicalRedirects'
import { matchRoute, AppShell } from './routes/RouteContent'

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

  const { pathname, search } = locationState
  const isPasswordResetPath = isPath(pathname, '/reset-password') || isPath(pathname, '/auth/reset-password')
  const routeNeedsBlockingAuth = isProtectedAccountPath(pathname) || isPath(pathname, '/onboarding') || isPath(pathname, '/auth/callback') || isPasswordResetPath

  useEffect(() => {
    const handlePopState = () => {
      markSoftNavigation()
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

  useLayoutEffect(() => {
    if (shouldSkipTopScrollRestore(pathname, search)) {
      return
    }

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'auto',
    })
  }, [pathname, search])

  useCanonicalRedirects(pathname)

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
    currentProfile,
    currentUser,
    isAdminMfaLoading,
    adminMfaStatus,
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
