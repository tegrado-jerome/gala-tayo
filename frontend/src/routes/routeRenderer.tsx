import { Suspense, lazy, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import SeoHead from '../components/SeoHead'
import WelcomePage from '../pages/WelcomePage'
import { buildAuthPath } from '../services/authApi'
import { getOnboardingStatus } from '../utils/profileApi'
import { navigateToPath, replaceWithPath } from '../utils/navigation'
import { getPublicSiteOrigin } from '../utils/site'
import { AdminRouteGate } from './AdminRouteGate'
import { InitialAuthLoader, NotFoundPage } from './RouteViewHelpers'
import type { RouteDescriptor, RouteInputs } from './routeResolver'

const ProtectedFeatureGate = lazy(() => import('../components/ProtectedFeatureGate'))
const SharedPlacePage = lazy(() => import('../pages/SharedPlacePage'))
const PlacesSlugResolverPage = lazy(() => import('../pages/PlacesSlugResolverPage'))
const HomePage = lazy(() => import('../pages/HomePage'))
const FavoritesPage = lazy(() => import('../pages/FavoritesPage'))
const HistoryPage = lazy(() => import('../pages/HistoryPage'))
const SearchHub = lazy(() => import('../pages/SearchHub'))
const SearchPage = lazy(() => import('../pages/SearchPage'))
const LoginPage = lazy(() => import('../pages/LoginPage'))
const FeedbackPage = lazy(() => import('../pages/FeedbackPage'))
const GalaPlansPage = lazy(() => import('../pages/GalaPlansPage'))
const ReportsPage = lazy(() => import('../pages/ReportsPage'))
const AuthPage = lazy(() => import('../pages/AuthPage'))
const AuthCallbackPage = lazy(() => import('../pages/AuthCallbackPage'))
const OnboardingPage = lazy(() => import('../pages/OnboardingPage'))
const ProfilePage = lazy(() => import('../pages/ProfilePage'))
const AccountSettingsPage = lazy(() => import('../pages/AccountSettingsPage'))
const PrivacyCenterPage = lazy(() => import('../pages/PrivacyCenterPage'))
const ChangePasswordPage = lazy(() => import('../pages/ChangePasswordPage'))
const ForgotPasswordPage = lazy(() => import('../pages/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('../pages/ResetPasswordPage'))
const PublicProfilePage = lazy(() => import('../pages/PublicProfilePage'))
const ProfileSearchPage = lazy(() => import('../pages/ProfileSearchPage'))
const PublicGalaPlanPage = lazy(() => import('../pages/PublicGalaPlanPage'))
const LegalPage = lazy(() => import('../pages/LegalPage'))
const AboutPage = lazy(() => import('../pages/AboutPage'))
const PlaceSubmissionPage = lazy(() => import('../pages/PlaceSubmissionPage'))
const MyPlaceSubmissionsPage = lazy(() => import('../pages/MyPlaceSubmissionsPage'))
const AskAiMapPage = lazy(() => import('../pages/AskAiMapPage'))
const AskAiOverviewPage = lazy(() => import('../pages/AskAiOverviewPage'))
const PlacesIndexPage = lazy(() => import('../pages/PlacesIndexPage'))
const PlaceCategoriesIndexPage = lazy(() => import('../pages/PlaceCategoriesIndexPage'))
const CategoryPlacesPage = lazy(() => import('../pages/CategoryPlacesPage'))
const MfaVerifyPage = lazy(() => import('../pages/MfaVerifyPage'))
const AdminDashboard = lazy(() => import('../pages/admin/Dashboard'))
const AdminPlaceImagesPage = lazy(() => import('../pages/admin/PlaceImagesPage'))
const AdminPlaceSubmissionsPage = lazy(() => import('../pages/admin/PlaceSubmissionsPage'))
const AdminUserReportsPage = lazy(() => import('../pages/admin/UserReportsPage'))
const AdminPlaceReportsPage = lazy(() => import('../pages/admin/PlaceReportsPage'))
const AdminCommentReportsPage = lazy(() => import('../pages/admin/CommentReportsPage'))
const AdminMfaSetupPage = lazy(() => import('../pages/admin/AdminMfaSetupPage'))
const AdminMfaVerifyPage = lazy(() => import('../pages/admin/AdminMfaVerifyPage'))

function OnboardingAccessGate({
  session,
  hasResolvedInitialAuth,
  hasSignupOnboardingAccess,
  onComplete,
}: {
  session: Session | null
  hasResolvedInitialAuth: boolean
  hasSignupOnboardingAccess: boolean
  onComplete: () => void
}) {
  const [isAllowed, setIsAllowed] = useState(() => Boolean(session && hasSignupOnboardingAccess))

  useEffect(() => {
    if (!hasResolvedInitialAuth) {
      return
    }

    if (!session) {
      replaceWithPath(buildAuthPath('/signup', '/onboarding'))
      return
    }

    if (hasSignupOnboardingAccess) {
      setIsAllowed(true)
      return
    }

    let isMounted = true

    void getOnboardingStatus(session)
      .then((status) => {
        if (!isMounted) {
          return
        }

        if (!status.needsOnboarding) {
          replaceWithPath('/home')
          return
        }

        setIsAllowed(true)
      })
      .catch(() => {
        if (isMounted) {
          replaceWithPath('/home')
        }
      })

    return () => {
      isMounted = false
    }
  }, [hasResolvedInitialAuth, hasSignupOnboardingAccess, session])

  if (!hasResolvedInitialAuth) {
    return <InitialAuthLoader />
  }

  if (!session) {
    return <InitialAuthLoader />
  }

  if (!isAllowed) {
    return <InitialAuthLoader />
  }

  return <OnboardingPage session={session} onComplete={onComplete} />
}

function renderRouteContent(descriptor: RouteDescriptor, inputs: RouteInputs) {
  const { session, search, pathname, navigationSource, isAdminMfaLoading, adminMfaStatus } = inputs
  const adminGateProps = {
    pathname,
    adminMfa: {
      isLoading: isAdminMfaLoading,
      status: adminMfaStatus,
    },
  }

  switch (descriptor.kind) {
    case 'initial-auth-loader':
      return <InitialAuthLoader />
    case 'onboarding':
      return (
        <OnboardingAccessGate
          session={session}
          hasResolvedInitialAuth={inputs.hasResolvedInitialAuth}
          hasSignupOnboardingAccess={inputs.hasSignupOnboardingAccess}
          onComplete={inputs.onProfileRefreshKeyUpdate}
        />
      )
    case 'legal':
      return <LegalPage type={descriptor.page} />
    case 'place-submission':
      return <PlaceSubmissionPage session={session} />
    case 'user-mfa-verify':
      if (!session) {
        return <AuthPage mode="sign_in" />
      }
      return (
        <MfaVerifyPage session={session} onMfaVerified={inputs.onMfaVerified} />
      )
    case 'admin-auth':
      return <AuthPage mode="sign_in" surface="admin" />
    case 'admin-setup':
      return (
        <AdminRouteGate {...adminGateProps}>
          <AdminMfaSetupPage session={session!} />
        </AdminRouteGate>
      )
    case 'admin-verify':
      return (
        <AdminRouteGate {...adminGateProps}>
          <AdminMfaVerifyPage factorId={adminMfaStatus?.verifiedTotpFactorId ?? null} />
        </AdminRouteGate>
      )
    case 'admin-dashboard':
      return (
        <AdminRouteGate {...adminGateProps}>
          <AdminDashboard session={session!} />
        </AdminRouteGate>
      )
    case 'admin-place-images':
      return (
        <AdminRouteGate {...adminGateProps}>
          <AdminPlaceImagesPage session={session!} />
        </AdminRouteGate>
      )
    case 'admin-user-reports':
      return (
        <AdminRouteGate {...adminGateProps}>
          <AdminUserReportsPage session={session!} />
        </AdminRouteGate>
      )
    case 'admin-place-submissions':
      return (
        <AdminRouteGate {...adminGateProps}>
          <AdminPlaceSubmissionsPage session={session!} />
        </AdminRouteGate>
      )
    case 'admin-place-reports':
      return (
        <AdminRouteGate {...adminGateProps}>
          <AdminPlaceReportsPage session={session!} />
        </AdminRouteGate>
      )
    case 'admin-comment-reports':
      return (
        <AdminRouteGate {...adminGateProps}>
          <AdminCommentReportsPage session={session!} />
        </AdminRouteGate>
      )
    case 'protected-feature-gate':
      return <ProtectedFeatureGate pathname={pathname} search={search} />
    case 'root-entry':
      return <WelcomePage navigationSource={navigationSource} />
    case 'home':
      return (
        <>
          <SeoHead
            title="Home | GalaTayo"
            description="Discover places, plan gala ideas, and use AI-powered tools to find your next hangout, date, barkada, or family destination."
            canonicalPath="/home"
            jsonLd={[
              {
                '@context': 'https://schema.org',
                '@type': 'WebSite',
                name: 'GalaTayo',
                url: `${getPublicSiteOrigin()}/`,
              },
              {
                '@context': 'https://schema.org',
                '@type': 'Organization',
                name: 'GalaTayo',
                url: `${getPublicSiteOrigin()}/`,
                logo: `${getPublicSiteOrigin()}/favicon.png`,
              },
            ]}
          />
          <HomePage navigationSource={navigationSource} />
        </>
      )
    case 'search':
      return (
        <>
          <SeoHead title="Search | GalaTayo" description="Search Metro Manila places on GalaTayo." canonicalPath="/search" robots="noindex,follow" />
          <SearchPage navigationSource={navigationSource} />
        </>
      )
    case 'ask-ai-overview':
      return (
        <>
          <SeoHead title="GalaTayo AI | GalaTayo" description="Choose how you want GalaTayo AI to help you." canonicalPath="/ask-ai" robots="noindex,follow" />
          <AskAiOverviewPage />
        </>
      )
    case 'ask-ai-chatbot':
      return (
        <>
          <SeoHead title="AI Chatbot | GalaTayo" description="GalaTayo AI chatbot mode on GalaTayo." canonicalPath="/ask-ai/chatbot" robots="noindex,follow" />
          <SearchHub key={`ask-ai:${search || 'root'}`} initialMode="ask-ai" initialAskAiQuestion={descriptor.initialAskAiQuestion} navigationSource={navigationSource} />
        </>
      )
    case 'ask-ai-maps':
      return (
        <>
          <SeoHead title="AI Maps | GalaTayo" description="GalaTayo AI maps mode on GalaTayo." canonicalPath="/ask-ai/maps" robots="noindex,follow" />
          <AskAiMapPage />
        </>
      )
    case 'prompt-builder':
      return (
        <>
          <SeoHead title="Prompt Builder | GalaTayo" description="Prompt builder on GalaTayo." canonicalPath="/ask-ai/prompt-builder" robots="noindex,follow" />
          <SearchHub initialPromptBuilderOpen navigationSource={navigationSource} />
        </>
      )
    case 'places-index':
      return <PlacesIndexPage />
    case 'place-categories-index':
      return <PlaceCategoriesIndexPage />
    case 'category-places':
      return <CategoryPlacesPage key={descriptor.categorySlug} categorySlug={descriptor.categorySlug} search={search} navigationSource={navigationSource} />
    case 'shared-place':
      // Preload the map chunk so the Leaflet bundle is already cached when the
      // place detail Location section renders.
      void import('../components/MapView')
      if (descriptor.expectedAreaSlug) {
        return (
          <SharedPlacePage
            slug={descriptor.slug}
            currentPathname={pathname}
            currentSearch={search}
            expectedAreaSlug={descriptor.expectedAreaSlug}
          />
        )
      }
      if (descriptor.redirectToCanonical) {
        return <SharedPlacePage slug={descriptor.slug} currentPathname={pathname} currentSearch={search} redirectToCanonical />
      }
      return <PlacesSlugResolverPage key={descriptor.slug} slug={descriptor.slug} currentPathname={pathname} search={search} navigationSource={navigationSource} />
    case 'login':
      return <AuthPage mode="sign_in" />
    case 'signup':
      return <AuthPage mode="create_account" />
    case 'auth-callback':
      return <AuthCallbackPage />
    case 'reset-password':
      return <ResetPasswordPage />
    case 'forgot-password':
      return <ForgotPasswordPage />
    case 'about':
      return <AboutPage />
    case 'profile-search':
      return <ProfileSearchPage />
    case 'public-gala-plan':
      return <PublicGalaPlanPage username={descriptor.username} slug={descriptor.slug} />
    case 'public-profile':
      return <PublicProfilePage username={descriptor.username} />
    case 'profile':
      return <ProfilePage session={session} />
    case 'account-settings':
      if (!session) {
        return <LoginPage />
      }
      return <AccountSettingsPage session={session} />
    case 'privacy-center':
      if (!session) {
        return <LoginPage />
      }
      return <PrivacyCenterPage session={session} />
    case 'change-password':
      if (!session) {
        return <LoginPage />
      }
      return <ChangePasswordPage />
    case 'favorites':
      return <FavoritesPage />
    case 'history':
      return <HistoryPage />
    case 'feedback':
      if (!session) {
        return <LoginPage />
      }
      return <FeedbackPage />
    case 'gala-plans-list':
      if (!session) {
        return <LoginPage />
      }
      return <GalaPlansPage mode="list" session={session} />
    case 'gala-plans-new':
      if (!session) {
        return <LoginPage />
      }
      return <GalaPlansPage mode="new" session={session} />
    case 'gala-plans-favorites':
      if (!session) {
        return <LoginPage />
      }
      return <GalaPlansPage mode="favorites" session={session} />
    case 'gala-plans-edit':
      if (!session) {
        return <LoginPage />
      }
      return <GalaPlansPage mode="edit" planId={descriptor.planId} session={session} />
    case 'gala-plans-detail':
      if (!session) {
        return <LoginPage />
      }
      return <GalaPlansPage mode="detail" planId={descriptor.planId} session={session} />
    case 'reports':
      if (!session) {
        return <LoginPage />
      }
      return <ReportsPage />
    case 'my-submissions':
      if (!session) {
        return <LoginPage />
      }
      return <MyPlaceSubmissionsPage session={session} />
    case 'not-found':
      return (
        <>
          <SeoHead title="Not Found | GalaTayo" robots="noindex,follow" />
          <NotFoundPage onGoHome={() => navigateToPath('/home')} onBrowsePlaces={() => navigateToPath('/places')} />
        </>
      )
  }
}

export function renderRouteDescriptor(descriptor: RouteDescriptor, inputs: RouteInputs) {
  const isAuthSuccessTransition =
    inputs.session &&
    (inputs.navigationSource === 'push' || inputs.navigationSource === 'replace') &&
    (
      inputs.pathname === '/mfa/verify' ||
      inputs.pathname === '/home' ||
      (inputs.pathname === '/onboarding' && inputs.hasSignupOnboardingAccess)
    )

  return (
    <Suspense fallback={isAuthSuccessTransition ? null : <InitialAuthLoader />}>
      {renderRouteContent(descriptor, inputs)}
    </Suspense>
  )
}
