import { lazy, Suspense, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { ReactNode } from 'react'
import SeoHead from '../components/SeoHead'
import UnifiedLoadingState from '../components/UnifiedLoadingState'
import MobileBottomNav from '../components/MobileBottomNav'
import ProtectedFeatureGate from '../components/ProtectedFeatureGate'
import SharedPlacePage from '../pages/SharedPlacePage'
import PlacesSlugResolverPage from '../pages/PlacesSlugResolverPage'
import HomeLandingPage from '../pages/HomeLandingPage'
import HomePage from '../pages/HomePage'
import SearchPage from '../pages/SearchPage'
import LoginPage from '../pages/LoginPage'
import FavoritesPage from '../pages/FavoritesPage'
import HistoryPage from '../pages/HistoryPage'
import FeedbackPage from '../pages/FeedbackPage'
import GalaPlansPage from '../pages/GalaPlansPage'
import ReportsPage from '../pages/ReportsPage'
import AuthPage from '../pages/AuthPage'
import AuthCallbackPage from '../pages/AuthCallbackPage'
import OnboardingPage from '../pages/OnboardingPage'
import ProfilePage from '../pages/ProfilePage'
import AccountSettingsPage from '../pages/AccountSettingsPage'
import ChangePasswordPage from '../pages/ChangePasswordPage'
import ForgotPasswordPage from '../pages/ForgotPasswordPage'
import ResetPasswordPage from '../pages/ResetPasswordPage'
import PublicProfilePage from '../pages/PublicProfilePage'
import ProfileSearchPage from '../pages/ProfileSearchPage'
import PublicGalaPlanPage from '../pages/PublicGalaPlanPage'
import LegalPage from '../pages/LegalPage'
import AboutPage from '../pages/AboutPage'
import PlaceSubmissionPage from '../pages/PlaceSubmissionPage'
import MyPlaceSubmissionsPage from '../pages/MyPlaceSubmissionsPage'
import AskAiMapPage from '../pages/AskAiMapPage'
import AskAiOverviewPage from '../pages/AskAiOverviewPage'
import PlacesIndexPage from '../pages/PlacesIndexPage'
import PlaceCategoriesIndexPage from '../pages/PlaceCategoriesIndexPage'
import CategoryPlacesPage from '../pages/CategoryPlacesPage'
import { AppChunkLoadingState } from '../components/AppUI'
import { navigateToPath } from '../utils/navigation'
import { isPath, parseAreaPagePath, parseCanonicalPlacePath, parseCategoryPagePath } from '../utils/routes'
import { shouldShowMobileBottomNav, getNoindexForPath, isProtectedAccountPath, isAdminPath } from '../utils/routeGuards'
import { signOut } from '../services/authApi'
import { AppUserProvider } from '../context/AppUserContext'
import { SavedFavoritesProvider } from '../context/SavedFavoritesContext'
import { SystemMessageProvider } from '../context/SystemMessageContext'
import { AskAiNotificationProvider } from '../context/AskAiNotificationContext'
import { type CurrentUserResponse } from '../utils/profileApi'
import { ADMIN_BASE_PATH, ADMIN_MFA_SETUP_PATH, ADMIN_MFA_VERIFY_PATH, getAdminPath } from '../utils/adminRoutes'
import type { AdminMfaStatus } from '../utils/adminMfa'

const AdminDashboard = lazy(() => import('../pages/admin/Dashboard'))
const AdminPlaceImagesPage = lazy(() => import('../pages/admin/PlaceImagesPage'))
const AdminPlaceSubmissionsPage = lazy(() => import('../pages/admin/PlaceSubmissionsPage'))
const AdminUserReportsPage = lazy(() => import('../pages/admin/UserReportsPage'))
const AdminPlaceReportsPage = lazy(() => import('../pages/admin/PlaceReportsPage'))
const AdminCommentReportsPage = lazy(() => import('../pages/admin/CommentReportsPage'))
const AdminMfaSetupPage = lazy(() => import('../pages/admin/AdminMfaSetupPage'))
const AdminMfaVerifyPage = lazy(() => import('../pages/admin/AdminMfaVerifyPage'))

function AppLoadingState({ message = 'Loading GalaTayo...' }: { message?: string }) {
  return (
    <UnifiedLoadingState
      variant="page"
      title={message}
      message="Please wait while we get things ready for you."
    />
  )
}

function AdminAccessDenied({ message = 'Your account does not have admin access.' }: { message?: string }) {
  const handleAdminSignIn = async () => {
    await signOut().catch(() => undefined)
    navigateToPath(ADMIN_BASE_PATH)
  }

  return (
    <main className="gala-page-background flex min-h-screen items-center justify-center px-4 py-10 text-center text-[var(--text)]">
      <section className="w-full max-w-md">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[16px] border border-[rgba(220,38,38,0.16)] bg-red-50 text-red-600">
          <span className="text-lg font-black">!</span>
        </div>
        <h1 className="mt-5 text-2xl font-black text-slate-950">Admin access required</h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{message}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => navigateToPath('/')}
            className="app-button app-button-primary app-button-md"
          >
            Go home
          </button>
          <button
            type="button"
            onClick={() => void handleAdminSignIn()}
            className="app-button app-button-secondary app-button-md"
          >
            Admin sign in
          </button>
        </div>
      </section>
    </main>
  )
}

function AdminRouteGate({
  pathname,
  adminMfa,
  children,
}: {
  pathname: string
  adminMfa: {
    isLoading: boolean
    status: AdminMfaStatus | null
  }
  children: ReactNode
}) {
  const [redirectTarget, setRedirectTarget] = useState<string | null>(null)
  const isSetupPath = isPath(pathname, ADMIN_MFA_SETUP_PATH)
  const isVerifyPath = isPath(pathname, ADMIN_MFA_VERIFY_PATH)

  useEffect(() => {
    if (adminMfa.isLoading || !adminMfa.status) {
      setRedirectTarget(null)
      return
    }

    if (!adminMfa.status.isAdmin) {
      setRedirectTarget(null)
      return
    }

    if (adminMfa.status.needsSetup) {
      setRedirectTarget(isSetupPath ? null : ADMIN_MFA_SETUP_PATH)
      return
    }

    if (adminMfa.status.needsVerification) {
      setRedirectTarget(isVerifyPath ? null : ADMIN_MFA_VERIFY_PATH)
      return
    }

    if ((isSetupPath || isVerifyPath) && adminMfa.status.isElevated) {
      setRedirectTarget(ADMIN_BASE_PATH)
      return
    }

    setRedirectTarget(null)
  }, [adminMfa.isLoading, adminMfa.status, isSetupPath, isVerifyPath, pathname])

  useEffect(() => {
    if (!redirectTarget) {
      return
    }

    navigateToPath(redirectTarget)
  }, [redirectTarget])

  if (adminMfa.isLoading || !adminMfa.status) {
    return <AppLoadingState message="Checking admin security..." />
  }

  if (!adminMfa.status.isAdmin) {
    return <AdminAccessDenied message="This signed-in account is not an admin." />
  }

  if (redirectTarget) {
    return <AppLoadingState message="Checking admin security..." />
  }

  return <>{children}</>
}

type RouteInputs = {
  session: Session | null
  hasResolvedInitialAuth: boolean
  hasResolvedProfile: boolean
  isInitialProfileLoading: boolean
  profileError: string
  needsOnboarding: boolean
  pathname: string
  search: string
  isPasswordResetPath: boolean
  routeNeedsBlockingAuth: boolean
  soonFeatureRedirectPath: string | null
  canonicalPlacePath: { areaSlug: string; placeSlug: string } | null
  categoryPageSlug: string | null
  areaPageSlug: string | null
  legacyPlaceSlug: string | null
  legacyPublicGalaPlanPath: { username: string; slug: string } | null
  publicGalaPlanPath: { username: string; slug: string } | null
  publicProfileUsername: string | null
  editGalaPlanId: string | null
  ownedGalaPlanId: string | null
  currentUser: CurrentUserResponse['user'] | null
  currentProfile: CurrentUserResponse['profile'] | null
  isAdminMfaLoading: boolean
  adminMfaStatus: AdminMfaStatus | null
  onProfileRefreshKeyUpdate: () => void
}

function matchRoute(inputs: RouteInputs) {
  const {
    session,
    hasResolvedInitialAuth,
    hasResolvedProfile,
    isInitialProfileLoading,
    profileError,
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
    isAdminMfaLoading,
    adminMfaStatus,
  } = inputs
  const adminHomePath = ADMIN_BASE_PATH
  const adminPlaceImagesPath = getAdminPath('place-images')
  const adminUserReportsPath = getAdminPath('user-reports')
  const adminPlaceSubmissionsPath = getAdminPath('place-submissions')
  const adminPlaceReportsPath = getAdminPath('place-reports')
  const adminCommentReportsPath = getAdminPath('comment-reports')

  if (!hasResolvedInitialAuth && routeNeedsBlockingAuth) {
    return <AppLoadingState />
  }

  if (profileError && session && !hasResolvedProfile && routeNeedsBlockingAuth && !isPasswordResetPath) {
    return <AppLoadingState message={profileError} />
  }

  if (session && isInitialProfileLoading && !hasResolvedProfile && routeNeedsBlockingAuth && !isPasswordResetPath) {
    return <AppLoadingState message="Checking your profile..." />
  }

  if (soonFeatureRedirectPath) {
    return <AppLoadingState message="Redirecting home..." />
  }

  if (isPath(pathname, '/onboarding')) {
    if (!session) {
      return <LoginPage />
    }

    return <OnboardingPage session={session} onComplete={inputs.onProfileRefreshKeyUpdate} />
  }

  if (pathname === '/terms' || pathname === '/terms/') {
    return <LegalPage type="terms" />
  }

  if (pathname === '/privacy' || pathname === '/privacy/') {
    return <LegalPage type="privacy" />
  }

  if (
    pathname === '/submit-place' ||
    pathname === '/submit-place/' ||
    pathname === '/places/submit' ||
    pathname === '/places/submit/' ||
    pathname === '/places/new' ||
    pathname === '/places/new/'
  ) {
    return <PlaceSubmissionPage session={session} />
  }

  if (isAdminPath(pathname)) {
    if (!session) {
      return <AuthPage mode="sign_in" surface="admin" />
    }

    if (isPath(pathname, ADMIN_MFA_SETUP_PATH)) {
      return (
        <AdminRouteGate pathname={pathname} adminMfa={{ isLoading: isAdminMfaLoading, status: adminMfaStatus }}>
          <AdminMfaSetupPage session={session} />
        </AdminRouteGate>
      )
    }

    if (isPath(pathname, ADMIN_MFA_VERIFY_PATH)) {
      return (
        <AdminRouteGate pathname={pathname} adminMfa={{ isLoading: isAdminMfaLoading, status: adminMfaStatus }}>
          <AdminMfaVerifyPage factorId={adminMfaStatus?.verifiedTotpFactorId ?? null} />
        </AdminRouteGate>
      )
    }

    if (pathname === adminHomePath || pathname === `${adminHomePath}/`) {
      return (
        <AdminRouteGate pathname={pathname} adminMfa={{ isLoading: isAdminMfaLoading, status: adminMfaStatus }}>
          <AdminDashboard session={session} />
        </AdminRouteGate>
      )
    }

    if (pathname === adminPlaceImagesPath || pathname === `${adminPlaceImagesPath}/`) {
      return (
        <AdminRouteGate pathname={pathname} adminMfa={{ isLoading: isAdminMfaLoading, status: adminMfaStatus }}>
          <AdminPlaceImagesPage session={session} />
        </AdminRouteGate>
      )
    }

    if (pathname === adminUserReportsPath || pathname === `${adminUserReportsPath}/`) {
      return (
        <AdminRouteGate pathname={pathname} adminMfa={{ isLoading: isAdminMfaLoading, status: adminMfaStatus }}>
          <AdminUserReportsPage session={session} />
        </AdminRouteGate>
      )
    }

    if (pathname === adminPlaceSubmissionsPath || pathname === `${adminPlaceSubmissionsPath}/`) {
      return (
        <AdminRouteGate pathname={pathname} adminMfa={{ isLoading: isAdminMfaLoading, status: adminMfaStatus }}>
          <AdminPlaceSubmissionsPage session={session} />
        </AdminRouteGate>
      )
    }

    if (pathname === adminPlaceReportsPath || pathname === `${adminPlaceReportsPath}/`) {
      return (
        <AdminRouteGate pathname={pathname} adminMfa={{ isLoading: isAdminMfaLoading, status: adminMfaStatus }}>
          <AdminPlaceReportsPage session={session} />
        </AdminRouteGate>
      )
    }

    if (pathname === adminCommentReportsPath || pathname === `${adminCommentReportsPath}/`) {
      return (
        <AdminRouteGate pathname={pathname} adminMfa={{ isLoading: isAdminMfaLoading, status: adminMfaStatus }}>
          <AdminCommentReportsPage session={session} />
        </AdminRouteGate>
      )
    }
  }

  if (
    !session &&
    isProtectedAccountPath(pathname) &&
    !(pathname === '/profile' || pathname === '/profile/' || pathname === '/me' || pathname === '/me/')
  ) {
    return <ProtectedFeatureGate pathname={pathname} search={search} />
  }

  if (pathname === '/' || pathname === '') {
    return (
      <>
        <SeoHead
          title="Home | GalaTayo"
          description="Discover places, plan gala ideas, and use AI-powered tools to find your next hangout, date, barkada, or family destination."
          canonicalPath="/"
          jsonLd={[
            {
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'GalaTayo',
              url: `${window.location.origin}/`,
            },
            {
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'GalaTayo',
              url: `${window.location.origin}/`,
              logo: `${window.location.origin}/favicon.svg`,
            },
          ]}
        />
        <HomeLandingPage />
      </>
    )
  }

  if (pathname === '/search' || pathname === '/search/') {
    return (
      <>
        <SeoHead title="Search | GalaTayo" description="Search Metro Manila places on GalaTayo." canonicalPath="/search" robots="noindex,follow" />
        <SearchPage />
      </>
    )
  }

  if (pathname === '/ask-ai' || pathname === '/ask-ai/') {
    return (
      <>
        <SeoHead title="Ask AI | GalaTayo" description="Choose how you want GalaTayo AI to help you." canonicalPath="/ask-ai" robots="noindex,follow" />
        <AskAiOverviewPage />
      </>
    )
  }

  if (pathname === '/ask-ai/chatbot' || pathname === '/ask-ai/chatbot/' || pathname === '/ask-ai/text' || pathname === '/ask-ai/text/') {
    const initialAskAiQuestion = new URLSearchParams(search).get('q') ?? ''
    return (
      <>
        <SeoHead title="AI Chatbot | GalaTayo" description="Ask AI chatbot mode on GalaTayo." canonicalPath="/ask-ai/chatbot" robots="noindex,follow" />
        <HomePage key={`ask-ai:${search || 'root'}`} initialMode="ask-ai" initialAskAiQuestion={initialAskAiQuestion} />
      </>
    )
  }

  if (pathname === '/ask-ai/maps' || pathname === '/ask-ai/maps/') {
    return (
      <>
        <SeoHead title="AI Maps | GalaTayo" description="Ask AI maps mode on GalaTayo." canonicalPath="/ask-ai/maps" robots="noindex,follow" />
        <AskAiMapPage />
      </>
    )
  }

  if (pathname === '/ask-ai/prompt-builder' || pathname === '/ask-ai/prompt-builder/' || pathname === '/prompt-builder' || pathname === '/prompt-builder/') {
    return (
      <>
        <SeoHead title="Prompt Builder | GalaTayo" description="Prompt builder on GalaTayo." canonicalPath="/ask-ai/prompt-builder" robots="noindex,follow" />
        <HomePage initialPromptBuilderOpen />
      </>
    )
  }

  if (pathname === '/places' || pathname === '/places/') {
    return <PlacesIndexPage />
  }

  if (pathname === '/places/categories' || pathname === '/places/categories/') {
    return <PlaceCategoriesIndexPage />
  }

  if (categoryPageSlug) {
    return <CategoryPlacesPage key={`${categoryPageSlug}${search}`} categorySlug={categoryPageSlug} search={search} />
  }

  if (canonicalPlacePath) {
    return <SharedPlacePage slug={canonicalPlacePath.placeSlug} currentPathname={pathname} currentSearch={search} expectedAreaSlug={canonicalPlacePath.areaSlug} />
  }

  if (areaPageSlug && areaPageSlug !== 'new' && areaPageSlug !== 'submit') {
    return <PlacesSlugResolverPage key={`${areaPageSlug}${search}`} slug={areaPageSlug} currentPathname={pathname} search={search} />
  }

  if (legacyPlaceSlug) {
    return <SharedPlacePage slug={legacyPlaceSlug} currentPathname={pathname} currentSearch={search} redirectToCanonical />
  }

  if (pathname === '/login' || pathname === '/login/') {
    return <AuthPage mode="sign_in" />
  }

  if (pathname === '/signup' || pathname === '/signup/') {
    return <AuthPage mode="create_account" />
  }

  if (pathname === '/auth/callback' || pathname === '/auth/callback/') {
    return <AuthCallbackPage />
  }

  if (isPasswordResetPath) {
    return <ResetPasswordPage />
  }

  if (pathname === '/forgot-password' || pathname === '/forgot-password/') {
    return <ForgotPasswordPage />
  }

  if (pathname === '/about' || pathname === '/about/') {
    return <AboutPage />
  }

  if (
    pathname === '/find-friends' ||
    pathname === '/find-friends/' ||
    pathname === '/profiles/search' ||
    pathname === '/profiles/search/' ||
    pathname === '/profile/search' ||
    pathname === '/profile/search/'
  ) {
    return <ProfileSearchPage />
  }

  if (publicGalaPlanPath) {
    return <PublicGalaPlanPage username={publicGalaPlanPath.username} slug={publicGalaPlanPath.slug} />
  }

  if (legacyPublicGalaPlanPath) {
    return <PublicGalaPlanPage username={legacyPublicGalaPlanPath.username} slug={legacyPublicGalaPlanPath.slug} />
  }

  if (publicProfileUsername) {
    return <PublicProfilePage username={publicProfileUsername} />
  }

  if (pathname === '/profile' || pathname === '/profile/' || pathname === '/me' || pathname === '/me/') {
    return <ProfilePage session={session} />
  }

  if (
    pathname === '/account-settings' ||
    pathname === '/account-settings/' ||
    pathname === '/settings' ||
    pathname === '/settings/' ||
    pathname === '/account' ||
    pathname === '/account/'
  ) {
    if (!session) {
      return <LoginPage />
    }
    return <AccountSettingsPage session={session} />
  }

  if (
    pathname === '/account-settings/change-password' ||
    pathname === '/account-settings/change-password/' ||
    pathname === '/settings/change-password' ||
    pathname === '/settings/change-password/' ||
    pathname === '/settings/password' ||
    pathname === '/settings/password/'
  ) {
    if (!session) {
      return <LoginPage />
    }
    return <ChangePasswordPage />
  }

  if (pathname === '/favorites' || pathname === '/favorites/') {
    return <FavoritesPage />
  }

  if (pathname === '/history' || pathname === '/history/') {
    return <HistoryPage />
  }

  if (pathname === '/feedback' || pathname === '/feedback/') {
    return <FeedbackPage />
  }

  if (pathname === '/gala-plan' || pathname === '/gala-plan/' || pathname === '/gala-plans' || pathname === '/gala-plans/') {
    if (!session) {
      return <LoginPage />
    }
    return <GalaPlansPage mode="list" session={session} />
  }

  if (
    pathname === '/gala-plan/new' ||
    pathname === '/gala-plan/new/' ||
    pathname === '/gala-plans/new' ||
    pathname === '/gala-plans/new/' ||
    pathname === '/gala-plans/create' ||
    pathname === '/gala-plans/create/'
  ) {
    if (!session) {
      return <LoginPage />
    }
    return <GalaPlansPage mode="new" session={session} />
  }

  if (
    pathname === '/gala-plan/liked' ||
    pathname === '/gala-plan/liked/' ||
    pathname === '/gala-plan/favorites' ||
    pathname === '/gala-plan/favorites/' ||
    pathname === '/gala-plans/liked' ||
    pathname === '/gala-plans/liked/' ||
    pathname === '/gala-plans/favorites' ||
    pathname === '/gala-plans/favorites/'
  ) {
    if (!session) {
      return <LoginPage />
    }
    return <GalaPlansPage mode="favorites" session={session} />
  }

  if (editGalaPlanId) {
    if (!session) {
      return <LoginPage />
    }
    return <GalaPlansPage mode="edit" planId={editGalaPlanId} session={session} />
  }

  if (ownedGalaPlanId && ownedGalaPlanId !== 'new' && ownedGalaPlanId !== 'liked' && ownedGalaPlanId !== 'favorites') {
    return <GalaPlansPage mode="detail" planId={ownedGalaPlanId} session={session} />
  }

  if (pathname === '/reports' || pathname === '/reports/') {
    return <ReportsPage />
  }

  if (pathname === '/comment-notices' || pathname === '/comment-notices/') {
    return <ReportsPage />
  }

  if (pathname === '/submissions' || pathname === '/submissions/' || pathname === '/my-submissions' || pathname === '/my-submissions/') {
    if (!session) {
      return <LoginPage />
    }
    return <MyPlaceSubmissionsPage session={session} />
  }

  return (
    <>
      <SeoHead title="Not Found | GalaTayo" robots="noindex,follow" />
      <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
        <h1 className="text-6xl font-black text-slate-900">404</h1>
        <p className="mt-3 text-lg font-semibold text-slate-600">Page not found</p>
        <p className="mt-1 text-sm text-slate-500">This page does not exist or has been moved.</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => navigateToPath('/')}
            className="inline-flex h-11 items-center rounded-full bg-[#1E3A8A] px-6 text-sm font-bold text-white transition hover:bg-[#1E40AF]"
          >
            Go home
          </button>
          <button
            type="button"
            onClick={() => navigateToPath('/places')}
            className="inline-flex h-11 items-center rounded-full border border-slate-200 bg-white px-6 text-sm font-bold text-slate-700 transition hover:border-slate-300"
          >
            Browse places
          </button>
        </div>
      </main>
    </>
  )
}

function AppShell({ session, currentUser, currentProfile, adminMfa, hasResolvedInitialAuth, pathname, search, children }: {
  session: Session | null
  currentUser: CurrentUserResponse['user'] | null
  currentProfile: CurrentUserResponse['profile'] | null
  adminMfa: {
    isLoading: boolean
    status: AdminMfaStatus | null
  }
  hasResolvedInitialAuth: boolean
  pathname: string
  search: string
  children: ReactNode
}) {
  const showMobileBottomNav = shouldShowMobileBottomNav(pathname)
  const isAreaQueryVariant = Boolean(parseAreaPagePath(pathname) && search)
  const shouldApplyGenericNoindex =
    (getNoindexForPath(pathname) || isAreaQueryVariant) &&
    !parseCanonicalPlacePath(pathname) &&
    !parseCategoryPagePath(pathname) &&
    !parseAreaPagePath(pathname) &&
    !(pathname === '/' || pathname === '') &&
    !(pathname === '/places' || pathname === '/places/') &&
    !(pathname === '/about' || pathname === '/about/') &&
    !(pathname === '/terms' || pathname === '/terms/') &&
    !(pathname === '/privacy' || pathname === '/privacy/')

  return (
    <AppUserProvider
      session={session}
      currentUser={currentUser}
      currentProfile={currentProfile}
      isSessionLoading={!hasResolvedInitialAuth}
      adminMfa={adminMfa}
    >
      <SystemMessageProvider>
        <SavedFavoritesProvider>
          <AskAiNotificationProvider>
            {shouldApplyGenericNoindex ? (
              <SeoHead title="GalaTayo" canonicalPath={pathname} robots="noindex,follow" />
            ) : null}
            <Suspense fallback={<AppChunkLoadingState />}>
              <div>
                {children}
              </div>
            </Suspense>
            {showMobileBottomNav ? <MobileBottomNav currentPath={pathname} /> : null}
          </AskAiNotificationProvider>
        </SavedFavoritesProvider>
      </SystemMessageProvider>
    </AppUserProvider>
  )
}

export { matchRoute, AppShell }
export type { RouteInputs }
