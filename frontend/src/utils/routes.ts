import { metroManilaAreaNameBySlug, metroManilaAreaSlugByAlias, normalizeAreaSlug } from '../data/metroManilaAreas'
import { getPlaceCategoryLabel } from '../data/placeCategories'
import { ADMIN_BASE_PATH, ADMIN_MFA_SETUP_PATH, ADMIN_MFA_VERIFY_PATH } from './adminRoutes'
import { getPublicSiteOrigin } from './site'
import { getLandingTargetBySlug } from './seoLandingPages'

const searchRouteCachePrefix = 'galatayo:search-route:'
const knownAreaSlugs = new Set<string>(metroManilaAreaSlugByAlias.keys())

type RoutePattern = {
  pattern: RegExp
  getLabel: (matches: string[]) => string
}

export type NavigationHistoryState = {
  from: string
  fromLabel: string | null
  scrollY?: number
}

export type PlaceReturnState = {
  source?: string
  returnTo?: string
  returnLabel?: string | null
}

type CanonicalPlaceInput = {
  areaSlug: string
  placeSlug: string
}

type AreaLike = {
  city?: string | null
  area?: string | null
  localArea?: string | null
}

const exactLabels: Record<string, string> = {
  '/': 'Welcome',
  '/home': 'Home',
  '/search': 'Search',
  '/places': 'Places',
  '/places/categories': 'Categories',
  '/login': 'Log in',
  '/signup': 'Sign up',
  '/forgot-password': 'Forgot password',
  '/onboarding': 'Onboarding',
  '/about': 'About',
  '/guides': 'Guides',
  '/terms': 'Terms',
  '/privacy': 'Privacy',
  '/profile': 'Profile',
  '/me': 'Profile',
  '/account': 'Account',
  '/settings': 'Settings',
  '/account-settings': 'Account Settings',
  '/privacy-center': 'Privacy Center',
  '/settings/change-password': 'Change password',

  '/account-settings/change-password': 'Change password',
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
  '/ask-ai': 'GalaTayo AI',
  '/ask-ai/chatbot': 'GalaTayo AI Chat',
  '/ask-ai/maps': 'GalaTayo AI Maps',
  '/ask-ai/prompt-builder': 'Prompt Builder',
  [ADMIN_BASE_PATH]: 'Admin Dashboard',
  [ADMIN_MFA_SETUP_PATH]: 'Admin Security',
  [ADMIN_MFA_VERIFY_PATH]: 'Admin Security',
}

const routePatterns: RoutePattern[] = [
  { pattern: /^\/places\/([^/]+)\/([^/]+)$/, getLabel: ([, , slug]) => formatLabelFromSlug(decodeURIComponent(slug)) },
  { pattern: /^\/places\/([^/]+)$/, getLabel: ([, slug]) => formatLabelFromSlug(decodeURIComponent(slug)) },
  { pattern: /^\/places\/categories\/([^/]+)$/, getLabel: ([, slug]) => formatLabelFromSlug(decodeURIComponent(slug)) },
  { pattern: /^\/guides\/([^/]+)$/, getLabel: ([, slug]) => getLandingTargetBySlug(decodeURIComponent(slug))?.label ?? formatLabelFromSlug(decodeURIComponent(slug)) },
  { pattern: /^\/gala-plans\/([^/]+)$/, getLabel: ([, id]) => id === 'new' || id === 'create' ? '' : 'Gala Plan' },
  { pattern: /^\/gala-plans\/([^/]+)\/edit$/, getLabel: () => 'Edit Gala Plan' },
  { pattern: /^\/u\/([^/]+)$/, getLabel: ([, username]) => `@${username}` },
  { pattern: /^\/u\/([^/]+)\/(?:plans|gala)\/([^/]+)$/, getLabel: ([, , slug]) => formatLabelFromSlug(decodeURIComponent(slug)) },
  { pattern: new RegExp(`^${ADMIN_BASE_PATH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^/]+)$`), getLabel: ([, section]) => `Admin: ${formatLabelFromSlug(decodeURIComponent(section))}` },
  { pattern: /^\/place\/([^/]+)$/, getLabel: ([, slug]) => formatLabelFromSlug(decodeURIComponent(slug)) },
]

function normalizeText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function formatLabelFromSlug(value: string) {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function resolveAreaMeta(areaLike: AreaLike) {
  const candidates = [areaLike.city, areaLike.localArea, areaLike.area]
    .map((value) => value?.trim() || '')
    .filter(Boolean)

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeText(candidate)
    const slugMatch = [...metroManilaAreaSlugByAlias.entries()].find(([slugAlias]) => normalizeText(slugAlias) === normalizedCandidate)
    if (slugMatch) {
      const canonicalSlug = slugMatch[1]
      return { slug: canonicalSlug, name: metroManilaAreaNameBySlug.get(canonicalSlug) || candidate }
    }

    const nameMatch = [...metroManilaAreaNameBySlug.entries()].find(([slug, name]) => {
      if (slug !== normalizeAreaSlug(slug)) {
        return false
      }

      return normalizeText(name) === normalizedCandidate || normalizeText(`${name} City`) === normalizedCandidate
    })
    if (nameMatch) {
      return { slug: nameMatch[0], name: nameMatch[1] }
    }
  }

  const fallbackName = candidates[0] || 'Metro Manila'
  return {
    slug: slugify(fallbackName) || 'metro-manila',
    name: fallbackName,
  }
}

export function getCanonicalPlacePath({ areaSlug, placeSlug }: CanonicalPlaceInput) {
  return `/places/${encodeURIComponent(areaSlug)}/${encodeURIComponent(placeSlug)}`
}

export function parseCanonicalPlacePath(pathname: string): { areaSlug: string; placeSlug: string } | null {
  const match = pathname.match(/^\/places\/([^/]+)\/([^/]+)\/?$/i)
  return match
    ? {
        areaSlug: normalizeAreaSlug(decodeURIComponent(match[1])) || decodeURIComponent(match[1]).toLowerCase(),
        placeSlug: decodeURIComponent(match[2]),
      }
    : null
}

export function parseLegacyPlaceSlugPath(pathname: string): string | null {
  const legacyPlaceMatch = pathname.match(/^\/place\/([^/]+)\/?$/i)
  if (legacyPlaceMatch) {
    return decodeURIComponent(legacyPlaceMatch[1])
  }

  const legacyPlacesMatch = pathname.match(/^\/places\/([^/]+)\/?$/i)
  if (legacyPlacesMatch) {
    return decodeURIComponent(legacyPlacesMatch[1])
  }

  return null
}

export function parsePublicProfileUsername(pathname: string): string | null {
  const match = pathname.match(/^\/u\/([^/]+)\/?$/i)
  return match ? decodeURIComponent(match[1]) : null
}

export function parsePublicGalaPlanPath(pathname: string): { username: string; slug: string } | null {
  const match = pathname.match(/^\/u\/([^/]+)\/plans\/([^/]+)\/?$/i)
  return match
    ? {
        username: decodeURIComponent(match[1]),
        slug: decodeURIComponent(match[2]),
      }
    : null
}

export function parseLegacyPublicGalaPlanPath(pathname: string): { username: string; slug: string } | null {
  const match = pathname.match(/^\/u\/([^/]+)\/gala\/([^/]+)\/?$/i)
  return match
    ? {
        username: decodeURIComponent(match[1]),
        slug: decodeURIComponent(match[2]),
      }
    : null
}

export function parseOwnedGalaPlanPath(pathname: string): string | null {
  const match = pathname.match(/^\/gala-plan(?:s)?\/([^/]+)\/?$/i)
  return match ? decodeURIComponent(match[1]) : null
}

export function parseEditGalaPlanPath(pathname: string): string | null {
  const match = pathname.match(/^\/gala-plan(?:s)?\/([^/]+)\/edit\/?$/i)
  return match ? decodeURIComponent(match[1]) : null
}

export function parseAreaPagePath(pathname: string): string | null {
  const match = pathname.match(/^\/places\/([^/]+)\/?$/i)
  return match ? normalizeAreaSlug(decodeURIComponent(match[1])) : null
}

export function parseCategoryPagePath(pathname: string): string | null {
  const match = pathname.match(/^\/places\/categories\/([^/]+)\/?$/i)
  return match ? decodeURIComponent(match[1]).toLowerCase() : null
}

export function parseLandingPagePath(pathname: string): string | null {
  const match = pathname.match(/^\/guides\/([^/]+)\/?$/i)
  return match ? decodeURIComponent(match[1]).toLowerCase() : null
}

export function isKnownAreaSlug(value: string) {
  return knownAreaSlugs.has(value.toLowerCase())
}

export function shouldSkipTopScrollRestore(pathname: string, search: string) {
  if (pathname !== '/search' && pathname !== '/search/') {
    return false
  }

  try {
    const rawCache = window.sessionStorage.getItem(`${searchRouteCachePrefix}${pathname}${search}`)

    if (!rawCache) {
      return false
    }

    const parsedCache = JSON.parse(rawCache) as { pendingScrollRestore?: boolean }
    return parsedCache.pendingScrollRestore === true
  } catch (error) {
    console.warn('Unable to inspect search scroll restore cache:', error)
    return false
  }
}

export function isPath(pathname: string, path: string) {
  return pathname === path || pathname === `${path}/`
}

export function getCanonicalGalaPlanPath(pathname: string) {
  if (isPath(pathname, '/gala-plan')) return '/gala-plans'
  if (isPath(pathname, '/gala-plan/new') || isPath(pathname, '/gala-plans/new')) return '/gala-plans/create'
  if (
    isPath(pathname, '/gala-plan/liked') ||
    isPath(pathname, '/gala-plan/favorite') ||
    isPath(pathname, '/gala-plan/favorites') ||
    isPath(pathname, '/gala-plans/liked') ||
    isPath(pathname, '/gala-plans/favorite')
  ) {
    return '/gala-plans/favorites'
  }

  const editPlanId = parseEditGalaPlanPath(pathname)
  if (editPlanId && /^\/gala-plan\/[^/]+\/edit\/?$/i.test(pathname)) {
    return `/gala-plans/${encodeURIComponent(editPlanId)}/edit`
  }

  const ownedPlanId = parseOwnedGalaPlanPath(pathname)
  if (ownedPlanId && /^\/gala-plan\/[^/]+\/?$/i.test(pathname) && ownedPlanId !== 'new' && ownedPlanId !== 'create' && ownedPlanId !== 'liked' && ownedPlanId !== 'favorite' && ownedPlanId !== 'favorites') {
    return `/gala-plans/${encodeURIComponent(ownedPlanId)}`
  }

  return null
}

export function getCanonicalForgotPasswordPath(pathname: string): '/forgot-password' | null {
  if (isPath(pathname, '/forgot') || isPath(pathname, '/forgot-password') || isPath(pathname, '/auth/forgot-password')) {
    return '/forgot-password'
  }

  return null
}

export function getCanonicalResetPasswordPath(pathname: string): '/reset-password' | null {
  if (isPath(pathname, '/auth/reset-password')) {
    return '/reset-password'
  }

  return null
}

export function getCanonicalAuthPath(pathname: string): '/login' | '/signup' | null {
  if (isPath(pathname, '/auth')) {
    return '/login'
  }

  if (isPath(pathname, '/sign-up')) {
    return '/signup'
  }

  return null
}

export function getCanonicalSettingsPath(pathname: string): '/account-settings' | '/account-settings/change-password' | null {
  if (isPath(pathname, '/settings') || isPath(pathname, '/account')) {
    return '/account-settings'
  }

  if (isPath(pathname, '/settings/password') || isPath(pathname, '/settings/change-password')) {
    return '/account-settings/change-password'
  }

  return null
}

export function getCanonicalSubmitPlacePath(pathname: string): '/submit-place' | null {
  if (isPath(pathname, '/places/submit') || isPath(pathname, '/places/new')) {
    return '/submit-place'
  }

  return null
}

export function getCanonicalHomePath(_pathname: string): '/' | null {
  return null
}

export function getCategoryBreadcrumbMeta(listingLink: string | null, listingLabel: string | null) {
  if (!listingLink) {
    return null
  }

  const categoryMatch = listingLink.match(/^\/places\/categories\/([^/?#]+)/i)

  if (!categoryMatch) {
    return null
  }

  const categorySlug = decodeURIComponent(categoryMatch[1]).toLowerCase()
  return {
    parentName: 'Categories',
    parentItem: `${getPublicSiteOrigin()}/places/categories`,
    childName: listingLabel ? formatLabelFromSlug(listingLabel) : getPlaceCategoryLabel(categorySlug),
    childItem: `${getPublicSiteOrigin()}/places/categories/${encodeURIComponent(categorySlug)}`,
  }
}

export function getCanonicalMemberPath(pathname: string): '/find-friends' | null {
  if (isPath(pathname, '/profiles/search') || isPath(pathname, '/profile/search')) {
    return '/find-friends'
  }

  return null
}

export function getCanonicalPublicGalaPlanPath(pathname: string): string | null {
  const legacyPath = parseLegacyPublicGalaPlanPath(pathname)

  if (!legacyPath) {
    return null
  }

  return `/u/${encodeURIComponent(legacyPath.username)}/plans/${encodeURIComponent(legacyPath.slug)}`
}

export function getCanonicalAskAiPath(pathname: string): '/ask-ai/chatbot' | '/ask-ai/maps' | null {
  if (isPath(pathname, '/ask-ai/text')) {
    return '/ask-ai/chatbot'
  }

  if (isPath(pathname, '/ask-ai/map')) {
    return '/ask-ai/maps'
  }

  return null
}

export function getCanonicalPromptBuilderPath(pathname: string): '/ask-ai/prompt-builder' | null {
  if (isPath(pathname, '/prompt-builder')) {
    return '/ask-ai/prompt-builder'
  }

  return null
}

export function getLabelForPath(path: string): string | null {
  const pathnameOnly = path.split(/[?#]/, 1)[0] || '/'
  const cleanPath = pathnameOnly.replace(/\/$/, '') || '/'

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

export function buildHistoryState(path: string): NavigationHistoryState {
  return {
    from: path,
    fromLabel: getLabelForPath(path),
  }
}

export function getHistoryState(): NavigationHistoryState | null {
  const candidate = window.history.state as Partial<NavigationHistoryState> | null

  if (!candidate || typeof candidate.from !== 'string') {
    return null
  }

  return {
    from: candidate.from,
    fromLabel: typeof candidate.fromLabel === 'string' ? candidate.fromLabel : null,
    scrollY: typeof candidate.scrollY === 'number' && Number.isFinite(candidate.scrollY) ? candidate.scrollY : undefined,
  }
}

export function hasInAppBackHistory() {
  return Boolean(getHistoryState()?.from)
}
