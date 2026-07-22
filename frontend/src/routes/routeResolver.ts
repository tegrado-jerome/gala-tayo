import type { Session } from '@supabase/supabase-js'
import type { CurrentUserResponse } from '../utils/profileApi'
import type { AdminMfaStatus } from '../utils/adminMfa'
import type { UserMfaStatus } from '../utils/userMfa'
import { ADMIN_BASE_PATH, ADMIN_MFA_SETUP_PATH, ADMIN_MFA_VERIFY_PATH, getAdminPath } from '../utils/adminRoutes'
import { isAdminPath, isProtectedAccountPath } from '../utils/routeGuards'
import { isPath } from '../utils/routes'
import type { NavigationSource } from '../app/useAppLocationState'

export type RouteInputs = {
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
  hasSignupOnboardingAccess: boolean
  currentUser: CurrentUserResponse['user'] | null
  currentProfile: CurrentUserResponse['profile'] | null
  isAdminMfaLoading: boolean
  adminMfaStatus: AdminMfaStatus | null
  isUserMfaLoading: boolean
  userMfaStatus: UserMfaStatus | null
  navigationSource: NavigationSource
  onProfileRefreshKeyUpdate: (account?: CurrentUserResponse) => void
  onMfaVerified?: () => void
}

export type RouteDescriptor =
  | { kind: 'initial-auth-loader' }
  | { kind: 'onboarding' }
  | { kind: 'legal'; page: 'terms' | 'privacy' }
  | { kind: 'place-submission' }
  | { kind: 'admin-auth' }
  | { kind: 'admin-setup' }
  | { kind: 'admin-verify' }
  | { kind: 'admin-dashboard' }
  | { kind: 'admin-place-images' }
  | { kind: 'admin-user-reports' }
  | { kind: 'admin-place-submissions' }
  | { kind: 'admin-place-reports' }
  | { kind: 'admin-comment-reports' }
  | { kind: 'user-mfa-verify' }
  | { kind: 'protected-feature-gate' }
  | { kind: 'root-entry' }
  | { kind: 'home' }
  | { kind: 'search' }
  | { kind: 'ask-ai-overview' }
  | { kind: 'ask-ai-chatbot'; initialAskAiQuestion: string }
  | { kind: 'ask-ai-maps' }
  | { kind: 'prompt-builder' }
  | { kind: 'places-index' }
  | { kind: 'place-categories-index' }
  | { kind: 'category-places'; categorySlug: string }
  | { kind: 'shared-place'; slug: string; expectedAreaSlug?: string; redirectToCanonical?: boolean }
  | { kind: 'login' }
  | { kind: 'signup' }
  | { kind: 'auth-callback' }
  | { kind: 'reset-password' }
  | { kind: 'forgot-password' }
  | { kind: 'about' }
  | { kind: 'profile-search' }
  | { kind: 'public-gala-plan'; username: string; slug: string }
  | { kind: 'public-profile'; username: string }
  | { kind: 'profile' }
  | { kind: 'account-settings' }
  | { kind: 'privacy-center' }
  | { kind: 'change-password' }
  | { kind: 'favorites' }
  | { kind: 'history' }
  | { kind: 'feedback' }
  | { kind: 'gala-plans-list' }
  | { kind: 'gala-plans-new' }
  | { kind: 'gala-plans-favorites' }
  | { kind: 'gala-plans-edit'; planId: string }
  | { kind: 'gala-plans-detail'; planId: string }
  | { kind: 'reports' }
  | { kind: 'my-submissions' }
  | { kind: 'not-found' }

export function resolveRouteDescriptor(inputs: RouteInputs): RouteDescriptor {
  const {
    session,
    hasResolvedInitialAuth,
    hasResolvedProfile,
    pathname,
    search,
    isPasswordResetPath,
    canonicalPlacePath,
    categoryPageSlug,
    areaPageSlug,
    legacyPlaceSlug,
    legacyPublicGalaPlanPath,
    publicGalaPlanPath,
    publicProfileUsername,
    editGalaPlanId,
    ownedGalaPlanId,
    hasSignupOnboardingAccess,
  } = inputs

  const adminHomePath = ADMIN_BASE_PATH
  const adminPlaceImagesPath = getAdminPath('place-images')
  const adminUserReportsPath = getAdminPath('user-reports')
  const adminPlaceSubmissionsPath = getAdminPath('place-submissions')
  const adminPlaceReportsPath = getAdminPath('place-reports')
  const adminCommentReportsPath = getAdminPath('comment-reports')

  if (!hasResolvedInitialAuth && isProtectedAccountPath(pathname)) {
    return { kind: 'initial-auth-loader' }
  }

  if (isPath(pathname, '/onboarding')) {
    return { kind: 'onboarding' }
  }

  if (isPath(pathname, '/terms')) {
    return { kind: 'legal', page: 'terms' }
  }

  if (isPath(pathname, '/privacy')) {
    return { kind: 'legal', page: 'privacy' }
  }

  if (
    isPath(pathname, '/submit-place') ||
    isPath(pathname, '/places/submit') ||
    isPath(pathname, '/places/new')
  ) {
    return { kind: 'place-submission' }
  }

  if (isAdminPath(pathname)) {
    if (!session) {
      return { kind: 'admin-auth' }
    }

    if (isPath(pathname, ADMIN_MFA_SETUP_PATH)) {
      return { kind: 'admin-setup' }
    }

    if (isPath(pathname, ADMIN_MFA_VERIFY_PATH)) {
      return { kind: 'admin-verify' }
    }

    if (pathname === adminHomePath || pathname === `${adminHomePath}/`) {
      return { kind: 'admin-dashboard' }
    }

    if (pathname === adminPlaceImagesPath || pathname === `${adminPlaceImagesPath}/`) {
      return { kind: 'admin-place-images' }
    }

    if (pathname === adminUserReportsPath || pathname === `${adminUserReportsPath}/`) {
      return { kind: 'admin-user-reports' }
    }

    if (pathname === adminPlaceSubmissionsPath || pathname === `${adminPlaceSubmissionsPath}/`) {
      return { kind: 'admin-place-submissions' }
    }

    if (pathname === adminPlaceReportsPath || pathname === `${adminPlaceReportsPath}/`) {
      return { kind: 'admin-place-reports' }
    }

    if (pathname === adminCommentReportsPath || pathname === `${adminCommentReportsPath}/`) {
      return { kind: 'admin-comment-reports' }
    }
  }

  if (isPath(pathname, '/mfa/verify')) {
    if (!session) {
      return { kind: 'protected-feature-gate' }
    }
    return { kind: 'user-mfa-verify' }
  }

  if (
    !session &&
    isProtectedAccountPath(pathname) &&
    !(isPath(pathname, '/profile') || isPath(pathname, '/me'))
  ) {
    return { kind: 'protected-feature-gate' }
  }

  if (pathname === '/' || pathname === '') {
    if (!hasResolvedInitialAuth || session || hasSignupOnboardingAccess) {
      return { kind: 'initial-auth-loader' }
    }

    return { kind: 'root-entry' }
  }

  if (isPath(pathname, '/home')) {
    return { kind: 'home' }
  }

  if (isPath(pathname, '/search')) {
    return { kind: 'search' }
  }

  if (isPath(pathname, '/ask-ai')) {
    return { kind: 'ask-ai-overview' }
  }

  if (isPath(pathname, '/ask-ai/chatbot') || isPath(pathname, '/ask-ai/text')) {
    return {
      kind: 'ask-ai-chatbot',
      initialAskAiQuestion: new URLSearchParams(search).get('q') ?? '',
    }
  }

  if (isPath(pathname, '/ask-ai/maps')) {
    return { kind: 'ask-ai-maps' }
  }

  if (isPath(pathname, '/ask-ai/prompt-builder') || isPath(pathname, '/prompt-builder')) {
    return { kind: 'prompt-builder' }
  }

  if (isPath(pathname, '/places')) {
    return { kind: 'places-index' }
  }

  if (isPath(pathname, '/places/categories')) {
    return { kind: 'place-categories-index' }
  }

  if (categoryPageSlug) {
    return { kind: 'category-places', categorySlug: categoryPageSlug }
  }

  if (canonicalPlacePath) {
    return {
      kind: 'shared-place',
      slug: canonicalPlacePath.placeSlug,
      expectedAreaSlug: canonicalPlacePath.areaSlug,
    }
  }

  if (areaPageSlug && areaPageSlug !== 'new' && areaPageSlug !== 'submit') {
    return { kind: 'shared-place', slug: areaPageSlug }
  }

  if (legacyPlaceSlug) {
    return { kind: 'shared-place', slug: legacyPlaceSlug, redirectToCanonical: true }
  }

  if (isPath(pathname, '/login')) {
    return { kind: 'login' }
  }

  if (isPath(pathname, '/signup')) {
    return { kind: 'signup' }
  }

  if (isPath(pathname, '/auth/callback')) {
    return { kind: 'auth-callback' }
  }

  if (isPasswordResetPath) {
    return { kind: 'reset-password' }
  }

  if (isPath(pathname, '/forgot-password')) {
    return { kind: 'forgot-password' }
  }

  if (isPath(pathname, '/about')) {
    return { kind: 'about' }
  }

  if (
    isPath(pathname, '/find-friends') ||
    isPath(pathname, '/profiles/search') ||
    isPath(pathname, '/profile/search')
  ) {
    return { kind: 'profile-search' }
  }

  if (publicGalaPlanPath) {
    return { kind: 'public-gala-plan', username: publicGalaPlanPath.username, slug: publicGalaPlanPath.slug }
  }

  if (legacyPublicGalaPlanPath) {
    return { kind: 'public-gala-plan', username: legacyPublicGalaPlanPath.username, slug: legacyPublicGalaPlanPath.slug }
  }

  if (publicProfileUsername) {
    return { kind: 'public-profile', username: publicProfileUsername }
  }

  if (isPath(pathname, '/profile') || isPath(pathname, '/me')) {
    return { kind: 'profile' }
  }

  if (
    isPath(pathname, '/account-settings') ||
    isPath(pathname, '/settings') ||
    isPath(pathname, '/account')
  ) {
    return { kind: 'account-settings' }
  }

  if (isPath(pathname, '/privacy-center')) {
    return { kind: 'privacy-center' }
  }

  if (
    isPath(pathname, '/account-settings/change-password') ||
    isPath(pathname, '/settings/change-password') ||
    isPath(pathname, '/settings/password')
  ) {
    return { kind: 'change-password' }
  }

  if (isPath(pathname, '/favorites')) {
    return { kind: 'favorites' }
  }

  if (isPath(pathname, '/history')) {
    return { kind: 'history' }
  }

  if (isPath(pathname, '/feedback')) {
    return { kind: 'feedback' }
  }

  if (isPath(pathname, '/gala-plan') || isPath(pathname, '/gala-plans')) {
    return { kind: 'gala-plans-list' }
  }

  if (
    isPath(pathname, '/gala-plan/new') ||
    isPath(pathname, '/gala-plans/new') ||
    isPath(pathname, '/gala-plans/create')
  ) {
    return { kind: 'gala-plans-new' }
  }

  if (
    isPath(pathname, '/gala-plan/liked') ||
    isPath(pathname, '/gala-plan/favorites') ||
    isPath(pathname, '/gala-plans/liked') ||
    isPath(pathname, '/gala-plans/favorites')
  ) {
    return { kind: 'gala-plans-favorites' }
  }

  if (editGalaPlanId) {
    return { kind: 'gala-plans-edit', planId: editGalaPlanId }
  }

  if (ownedGalaPlanId && ownedGalaPlanId !== 'new' && ownedGalaPlanId !== 'liked' && ownedGalaPlanId !== 'favorites') {
    return { kind: 'gala-plans-detail', planId: ownedGalaPlanId }
  }

  if (isPath(pathname, '/reports') || isPath(pathname, '/comment-notices')) {
    return { kind: 'reports' }
  }

  if (isPath(pathname, '/submissions') || isPath(pathname, '/my-submissions')) {
    return { kind: 'my-submissions' }
  }

  if (hasResolvedProfile || hasResolvedInitialAuth) {
    return { kind: 'not-found' }
  }

  return { kind: 'not-found' }
}
