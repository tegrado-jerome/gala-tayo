import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { isPath } from './utils/routes'
import { isProtectedAccountPath } from './utils/routeGuards'
import { getLegacyAdminRedirectPath } from './utils/adminRoutes'
import { useAuthOrchestration } from './hooks/useAuthOrchestration'
import { useCanonicalRedirects } from './hooks/useCanonicalRedirects'
import { matchRoute, AppShell } from './routes/RouteContent'
import { navigateToPath, replaceWithPath } from './utils/navigation'
import { initializeAnalytics, trackPageView } from './utils/analytics'
import { CookieConsentProvider } from './context/CookieConsentContext'
import { ThemeProvider } from './context/ThemeContext'
import { CookieConsentBanner } from './components/CookieConsentBanner'
import { getRouteState } from './app/routeState'
import { resolveAuthNavigationTarget } from './app/appRouting'
import { useAppLocationState } from './app/useAppLocationState'
import { useAppScrollRestoration } from './app/useAppScrollRestoration'
import { useLogoutTransitionState } from './app/useLogoutTransitionState'
import { hasSignupOnboardingAccess as hasStoredSignupOnboardingAccess } from './services/authApi'

function App() {
  const { pathname, search, navigationSource, restoredScrollY, setRestoredScrollY } = useAppLocationState()
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
    isUserMfaLoading,
    userMfaStatus,
    profileError,
    refreshProfile,
    markMfaVerified,
    markOnboardingComplete,
  } = useAuthOrchestration({ pathname })
  const logoutTransition = useLogoutTransitionState()
  const showLogoutTransition = logoutTransition.isVisible
  const lastAccountViewRef = useRef({
    currentUser,
    currentProfile,
  })

  const {
    canonicalPlacePath,
    categoryPageSlug,
    landingPageSlug,
    areaPageSlug,
    legacyPlaceSlug,
    legacyPublicGalaPlanPath,
    publicGalaPlanPath,
    publicProfileUsername,
    editGalaPlanId,
    ownedGalaPlanId,
    isOnboardingAllowedPath,
  } = useMemo(() => getRouteState(pathname), [pathname])
  const legacyAdminRedirectPath = useMemo(() => getLegacyAdminRedirectPath(pathname), [pathname])
  const isPasswordResetPath = isPath(pathname, '/reset-password') || isPath(pathname, '/auth/reset-password')
  const routeNeedsBlockingAuth = isProtectedAccountPath(pathname) || isPath(pathname, '/onboarding') || isPath(pathname, '/auth/callback') || isPasswordResetPath
  const hasSignupOnboardingAccess = hasStoredSignupOnboardingAccess()

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
    })
  }, [pathname, search])

  useLayoutEffect(() => {
    const redirectTarget = resolveAuthNavigationTarget({
      hasResolvedInitialAuth,
      isPasswordResetPath,
      session,
      hasResolvedProfile,
      needsOnboarding,
      isOnboardingAllowedPath,
      pathname,
      search,
    })

    if (redirectTarget) {
      navigateToPath(redirectTarget)
      return
    }

    if (session && hasResolvedInitialAuth && pathname === '/' && !showLogoutTransition) {
      replaceWithPath(`/home${search}`)
    }
  }, [hasResolvedInitialAuth, hasResolvedProfile, isOnboardingAllowedPath, isPasswordResetPath, needsOnboarding, pathname, search, session, showLogoutTransition])

  useEffect(() => {
    if (!legacyAdminRedirectPath) {
      return
    }

    replaceWithPath(legacyAdminRedirectPath)
  }, [legacyAdminRedirectPath])

  useEffect(() => {
    if (session) {
      lastAccountViewRef.current = {
        currentUser,
        currentProfile,
      }
      return
    }

    if (!showLogoutTransition) {
      lastAccountViewRef.current = {
        currentUser: null,
        currentProfile: null,
      }
    }
  }, [currentProfile, currentUser, session, showLogoutTransition])

  const effectiveCurrentUser = session ? currentUser : showLogoutTransition ? lastAccountViewRef.current.currentUser : null
  const effectiveCurrentProfile = session ? currentProfile : showLogoutTransition ? lastAccountViewRef.current.currentProfile : null

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
    canonicalPlacePath,
    categoryPageSlug,
    landingPageSlug,
    areaPageSlug,
    legacyPlaceSlug,
    legacyPublicGalaPlanPath,
    publicGalaPlanPath,
    publicProfileUsername,
    editGalaPlanId,
    ownedGalaPlanId,
    hasSignupOnboardingAccess,
    currentUser: effectiveCurrentUser,
    currentProfile: effectiveCurrentProfile,
    isAdminMfaLoading,
    adminMfaStatus,
    isUserMfaLoading,
    userMfaStatus,
    navigationSource,
    onProfileRefreshKeyUpdate: markOnboardingComplete,
    onMfaVerified: markMfaVerified,
  })

  const isProfileLoadError = session && hasResolvedInitialAuth && !hasResolvedProfile && Boolean(profileError)

  if (isProfileLoadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center text-slate-900">
        <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="mb-4 text-sm leading-relaxed text-slate-700">
            {profileError || 'We could not load your account. Please check your connection and try again.'}
          </p>
          <button
            type="button"
            onClick={refreshProfile}
            className="inline-flex items-center justify-center rounded-full bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <ThemeProvider>
      <CookieConsentProvider>
        <AppShell
          session={session}
          currentUser={effectiveCurrentUser}
          currentProfile={effectiveCurrentProfile}
          adminMfa={{
            isLoading: isAdminMfaLoading,
            status: adminMfaStatus,
          }}
          hasResolvedInitialAuth={hasResolvedInitialAuth}
          pathname={pathname}
          search={search}
          showLogoutTransition={showLogoutTransition}
          isLogoutTransitionExiting={logoutTransition.isExiting}
        >
          {content}
        </AppShell>
        <CookieConsentBanner pathname={pathname} />
      </CookieConsentProvider>
    </ThemeProvider>
  )
}

export default App
