import { isPath } from './routes'
import { isAdminPath as isSecretAdminPath } from './adminRoutes'

const sharedRouteMatchers = [
  (pathname: string) => /^\/u\/[^/]+\/?$/i.test(pathname),
  (pathname: string) => /^\/u\/[^/]+\/(?:plans|gala)\/[^/]+\/?$/i.test(pathname),
]

export function isProtectedAccountPath(pathname: string) {
  const isExactProtectedPath = [
    '/favorites',
    '/feedback',
    '/gala-plan',
    '/gala-plan/new',
    '/gala-plan/liked',
    '/gala-plan/favorites',
    '/gala-plans',
    '/gala-plans/new',
    '/gala-plans/create',
    '/gala-plans/liked',
    '/gala-plans/favorites',
    '/reports',
    '/find-friends',
    '/comment-notices',
    '/profile',
    '/me',
    '/account',
    '/settings',
    '/settings/change-password',
    '/settings/security',
    '/account-settings',
    '/account-settings/change-password',
    '/privacy-center',
    '/places/new',
    '/places/submit',
    '/my-submissions',
    '/submissions',
    '/photos/upload',
  ].some((path) => isPath(pathname, path))

  return (
    isExactProtectedPath ||
    /^\/gala-plan\/[^/]+\/?$/i.test(pathname) ||
    /^\/gala-plans\/[^/]+\/?$/i.test(pathname) ||
    /^\/gala-plan\/[^/]+\/edit\/?$/i.test(pathname) ||
    /^\/gala-plans\/[^/]+\/edit\/?$/i.test(pathname) ||
    /^\/places\/[^/]+\/(comments|reviews|photos)\/?$/i.test(pathname)
  )
}

export function isAdminPath(pathname: string) {
  return isSecretAdminPath(pathname)
}

const siteHeaderHiddenPaths = [
  '/',
  '/login',
  '/signup',
  '/auth',
  '/auth/callback',
  '/onboarding',
  '/forgot-password',
  '/reset-password',
  '/auth/reset-password',
  '/mfa/verify',
]

export function shouldShowSiteHeader(pathname: string) {
  return !isAdminPath(pathname) && !siteHeaderHiddenPaths.some((path) => isPath(pathname, path))
}

export function shouldShowMobileBottomNav(pathname: string) {
  if (isPath(pathname, '/') || pathname === '' || isPath(pathname, '/home')) {
    return false
  }

  if (
    sharedRouteMatchers.some((matcher) => matcher(pathname))
  ) {
    return false
  }

  if (isPath(pathname, '/login') || isPath(pathname, '/signup') || isPath(pathname, '/onboarding') || isPath(pathname, '/forgot-password') || isPath(pathname, '/reset-password') || isPath(pathname, '/auth/reset-password') || isPath(pathname, '/auth/callback') || isPath(pathname, '/mfa/verify')) {
    return false
  }

  if (isAdminPath(pathname)) {
    return false
  }

  if (isPath(pathname, '/ask-ai/chatbot') || isPath(pathname, '/ask-ai/text')) {
    return false
  }

  return true
}

export function getNoindexForPath(pathname: string) {
  if (isAdminPath(pathname)) {
    return true
  }

  if (
    [
      '/home',
      '/search',
      '/login',
      '/signup',
      '/auth',
      '/auth/callback',
      '/forgot-password',
      '/reset-password',
      '/auth/reset-password',
      '/onboarding',
      '/favorites',
      '/history',
      '/feedback',
      '/reports',
      '/find-friends',
      '/comment-notices',
      '/profile',
      '/profile/edit',
      '/me',
      '/account',
      '/settings',
      '/settings/change-password',
      '/account-settings',
      '/account-settings/change-password',
      '/privacy-center',
      '/submit-place',
      '/my-submissions',
      '/submissions',
      '/ask-ai',
      '/ask-ai/chatbot',
      '/ask-ai/text',
      '/ask-ai/map',
      '/ask-ai/maps',
      '/ask-ai/prompt-builder',
      '/prompt-builder',
    ].some((path) => isPath(pathname, path))
  ) {
    return true
  }

  if (
    pathname.startsWith('/auth/') ||
    /^\/u\/[^/]+\/?$/i.test(pathname) ||
    /^\/gala-plan(?:s)?\b/i.test(pathname)
  ) {
    return true
  }

  return false
}

export { sharedRouteMatchers }
