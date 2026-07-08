type RoutePattern = {
  pattern: RegExp
  getLabel: (matches: string[]) => string
}

type NavigationHistoryState = {
  from: string
  fromLabel: string | null
}

const exactLabels: Record<string, string> = {
  '/': 'Home',
  '/search': 'Search',
  '/places': 'Places',
  '/places/categories': 'Categories',
  '/login': 'Log in',
  '/signup': 'Sign up',
  '/forgot-password': 'Forgot password',
  '/onboarding': 'Onboarding',
  '/about': 'About',
  '/terms': 'Terms',
  '/privacy': 'Privacy',
  '/profile': 'Profile',
  '/me': 'Profile',
  '/account': 'Account',
  '/settings': 'Settings',
  '/settings/change-password': 'Change password',
  '/favorites': 'Favorites',
  '/history': 'History',
  '/feedback': 'Feedback',
  '/gala-plans': 'Gala Plans',
  '/gala-plans/new': 'New Gala Plan',
  '/gala-plans/create': 'Create Gala Plan',
  '/gala-plans/liked': 'Liked Gala Plans',
  '/gala-plans/favorites': 'Favorite Gala Plans',
  '/reports': 'Reports',
  '/comment-notices': 'Comment Notices',
  '/find-friends': 'Find Friends',
  '/submit-place': 'Submit a Place',
  '/my-submissions': 'My Submissions',
  '/submissions': 'Submissions',
  '/ask-ai': 'Ask AI',
  '/ask-ai/chatbot': 'Ask AI Chat',
  '/ask-ai/maps': 'Ask AI Maps',
  '/ask-ai/prompt-builder': 'Prompt Builder',
}

const routePatterns: RoutePattern[] = [
  { pattern: /^\/places\/([^/]+)\/([^/]+)$/, getLabel: ([, , slug]) => slug.replace(/-/g, ' ') },
  { pattern: /^\/places\/([^/]+)$/, getLabel: ([, slug]) => slug.replace(/-/g, ' ') },
  { pattern: /^\/places\/categories\/([^/]+)$/, getLabel: ([, slug]) => slug.replace(/-/g, ' ') },
  { pattern: /^\/gala-plans\/([^/]+)$/, getLabel: ([, id]) => id === 'new' || id === 'create' ? '' : 'Gala Plan' },
  { pattern: /^\/gala-plans\/([^/]+)\/edit$/, getLabel: () => 'Edit Gala Plan' },
  { pattern: /^\/u\/([^/]+)$/, getLabel: ([, username]) => `@${username}` },
  { pattern: /^\/u\/([^/]+)\/(?:plans|gala)\/([^/]+)$/, getLabel: ([, , slug]) => slug.replace(/-/g, ' ') },
  { pattern: /^\/admin\/([^/]+)$/, getLabel: ([, section]) => `Admin: ${section.replace(/-/g, ' ')}` },
  { pattern: /^\/place\/([^/]+)$/, getLabel: ([, slug]) => slug.replace(/-/g, ' ') },
]

function getLabelForPath(path: string): string | null {
  const cleanPath = path.replace(/\/$/, '') || '/'

  if (exactLabels[cleanPath]) {
    return exactLabels[cleanPath]
  }

  for (const { pattern, getLabel } of routePatterns) {
    const matches = cleanPath.match(pattern)
    if (matches) {
      return getLabel(matches) || null
    }
  }

  return null
}

function getHistoryState(): NavigationHistoryState | null {
  const candidate = window.history.state as Partial<NavigationHistoryState> | null

  if (!candidate || typeof candidate.from !== 'string') {
    return null
  }

  return {
    from: candidate.from,
    fromLabel: typeof candidate.fromLabel === 'string' ? candidate.fromLabel : null,
  }
}

function hasInAppBackHistory() {
  return Boolean(getHistoryState()?.from)
}

export { getHistoryState, getLabelForPath, hasInAppBackHistory }
