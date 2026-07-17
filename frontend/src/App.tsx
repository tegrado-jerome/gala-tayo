import { useEffect, useLayoutEffect, useMemo } from 'react'
import { isPath } from './utils/routes'
import { isProtectedAccountPath } from './utils/routeGuards'
import { getLegacyAdminRedirectPath } from './utils/adminRoutes'
import { useAuthOrchestration } from './hooks/useAuthOrchestration'
import { useCanonicalRedirects } from './hooks/useCanonicalRedirects'
import { matchRoute, AppShell } from './routes/RouteContent'
import { navigateToPath, replaceWithPath } from './utils/navigation'
import { initializeAnalytics, trackPageView } from './utils/analytics'
import { getRouteState } from './app/routeState'
import { resolveAuthNavigationTarget } from './app/appRouting'
import { useAppLocationState } from './app/useAppLocationState'
import { useAppScrollRestoration } from './app/useAppScrollRestoration'
import { useLogoutTransitionState } from './app/useLogoutTransitionState'

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

  const { pathname, search, navigationSource, restoredScrollY, setRestoredScrollY } = useAppLocationState()
  const showLogoutTransition = useLogoutTransitionState()

  const {
    isOnboardingAllowedPath,
    canonicalPlacePath,
    categoryPageSlug,
    areaPageSlug,
    legacyPlaceSlug,
    legacyPublicGalaPlanPath,
    publicGalaPlanPath,
    publicProfileUsername,
    editGalaPlanId,
    ownedGalaPlanId,
    soonFeatureRedirectPath,
  } = useMemo(() => getRouteState(pathname), [pathname])
  const legacyAdminRedirectPath = useMemo(() => getLegacyAdminRedirectPath(pathname), [pathname])
  const isPasswordResetPath = isPath(pathname, '/reset-password') || isPath(pathname, '/auth/reset-password')
  const routeNeedsBlockingAuth = isProtectedAccountPath(pathname) || isPath(pathname, '/onboarding') || isPath(pathname, '/auth/callback') || isPasswordResetPath

  useEffect(() => {
    initializeAnalytics()
  }, [])
  useAppScrollRestoration({
    navigationSource,
    pathname,
    search,
    restoredScrollY,
    setRestoredScrollY,
  })

  useCanonicalRedirects(pathname)

  useEffect(() => {
    trackPageView({
      pathname,
      title: document.title,
    })
  }, [pathname, search])

  useLayoutEffect(() => {
    const redirectTarget = resolveAuthNavigationTarget({
      hasResolvedInitialAuth,
      isPasswordResetPath,
      session,
      hasResolvedProfile,
      needsOnboarding,
      pathname,
      isOnboardingAllowedPath,
    })

    if (redirectTarget) {
      navigateToPath(redirectTarget)
    }
  }, [hasResolvedInitialAuth, hasResolvedProfile, isOnboardingAllowedPath, isPasswordResetPath, needsOnboarding, pathname, session])

  useEffect(() => {
    if (soonFeatureRedirectPath && pathname !== soonFeatureRedirectPath) {
      replaceWithPath(soonFeatureRedirectPath)
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
      showLogoutTransition={showLogoutTransition}
    >
      {content}
    </AppShell>
  )
}

export default App
