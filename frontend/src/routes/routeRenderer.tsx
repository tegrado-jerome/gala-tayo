import { lazy, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import SeoHead from '../components/SeoHead'
import ProtectedFeatureGate from '../components/ProtectedFeatureGate'
import SharedPlacePage from '../pages/SharedPlacePage'
import PlacesSlugResolverPage from '../pages/PlacesSlugResolverPage'
import HomePage from '../pages/HomePage'
import SearchHub from '../pages/SearchHub'
import WelcomePage from '../pages/WelcomePage'
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
import PrivacyCenterPage from '../pages/PrivacyCenterPage'
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
import { buildAuthPath } from '../services/authApi'
import { getOnboardingStatus } from '../utils/profileApi'
import { navigateToPath, replaceWithPath } from '../utils/navigation'
import { getPublicSiteOrigin } from '../utils/site'
import { AdminRouteGate } from './AdminRouteGate'
import { InitialAuthLoader, NotFoundPage, RootEntryLoader } from './RouteViewHelpers'
import type { RouteDescriptor, RouteInputs } from './routeResolver'

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
  onComplete,
}: {
  session: Session | null
  hasResolvedInitialAuth: boolean
  onComplete: () => void
}) {
  const [isAllowed, setIsAllowed] = useState(false)

  useEffect(() => {
    if (!hasResolvedInitialAuth) {
      return
    }

    if (!session) {
      replaceWithPath(buildAuthPath('/signup', '/onboarding'))
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
  }, [hasResolvedInitialAuth, session])

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

export function renderRouteDescriptor(descriptor: RouteDescriptor, inputs: RouteInputs) {
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
          onComplete={inputs.onProfileRefreshKeyUpdate}
        />
      )
    case 'legal':
      return <LegalPage type={descriptor.page} />
    case 'place-submission':
      return <PlaceSubmissionPage session={session} />
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
      if (!inputs.hasResolvedInitialAuth || (session && !inputs.hasResolvedProfile)) {
        return <RootEntryLoader />
      }
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
                logo: `${getPublicSiteOrigin()}/favicon.svg`,
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
      return <CategoryPlacesPage key={`${descriptor.categorySlug}${search}`} categorySlug={descriptor.categorySlug} search={search} navigationSource={navigationSource} />
    case 'shared-place':
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
      return <PlacesSlugResolverPage key={`${descriptor.slug}${search}`} slug={descriptor.slug} currentPathname={pathname} search={search} navigationSource={navigationSource} />
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
      if (!session) {
        return <ProtectedFeatureGate pathname={pathname} search={search} />
      }
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
      if (!session) {
        return <LoginPage />
      }
      return <FavoritesPage />
    case 'history':
      if (!session) {
        return <LoginPage />
      }
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
