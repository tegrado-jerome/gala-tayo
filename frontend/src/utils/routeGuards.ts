import { isPath } from './routes'

const sharedRouteMatchers = [
  (pathname: string) => /^\/u\/[^/]+\/?$/i.test(pathname),
  (pathname: string) => /^\/u\/[^/]+\/(?:plans|gala)\/[^/]+\/?$/i.test(pathname),
]

export function isProtectedAccountPath(pathname: string) {
  const isExactProtectedPath = [
    '/favorites',
    '/history',
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
    '/admin',
    '/admin/user-reports',
    '/admin/place-images',
    '/admin/place-submissions',
    '/admin/place-reports',
    '/admin/comment-reports',
    '/profile',
    '/me',
    '/account',
    '/settings',
    '/settings/change-password',
    '/account-settings',
    '/account-settings/change-password',
    '/places/new',
    '/places/submit',
    '/my-submissions',
    '/submissions',
    '/photos/upload',
    '/ask-ai',
    '/ask-ai/chatbot',
    '/ask-ai/text',
    '/ask-ai/maps',
    '/ask-ai/prompt-builder',
    '/prompt-builder',
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
  return pathname === '/admin' || pathname === '/admin/' || pathname.startsWith('/admin/')
}

export function shouldShowMobileBottomNav(pathname: string) {
  if (
    sharedRouteMatchers.some((matcher) => matcher(pathname))
  ) {
    return false
  }

  if (isPath(pathname, '/login') || isPath(pathname, '/signup') || isPath(pathname, '/onboarding') || isPath(pathname, '/forgot-password') || isPath(pathname, '/reset-password') || isPath(pathname, '/auth/reset-password')) {
    return false
  }

  if (isAdminPath(pathname)) {
    return false
  }

  if (
    isPath(pathname, '/ask-ai/chatbot') ||
    isPath(pathname, '/ask-ai/text') ||
    isPath(pathname, '/ask-ai/maps') ||
    isPath(pathname, '/ask-ai/map')
  ) {
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
    pathname.startsWith('/admin/') ||
    pathname.startsWith('/auth/') ||
    /^\/u\/[^/]+\/?$/i.test(pathname) ||
    /^\/gala-plan(?:s)?\b/i.test(pathname)
  ) {
    return true
  }

  return false
}

export { sharedRouteMatchers }
