import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import HomePage from './pages/HomePage'
import HomeLandingPage from './pages/HomeLandingPage'
import SearchPage from './pages/SearchPageWords'
import LoginPage from './pages/LoginPage'
import FavoritesPage from './pages/FavoritesPage'
import HistoryPage from './pages/HistoryPage'
import FeedbackPage from './pages/FeedbackPage'
import GalaPlansPage from './pages/GalaPlansPage'
import ReportsPage from './pages/ReportsPage'
import AdminPlaceImagesPage from './pages/AdminPlaceImagesPage'
import AdminPlaceSubmissionsPage from './pages/AdminPlaceSubmissionsPage'
import AdminUserReportsPage from './pages/AdminUserReportsPage'
import AuthPage from './pages/AuthPage'
import AuthCallbackPage from './pages/AuthCallbackPage'
import OnboardingPage from './pages/OnboardingPage'
import ProfilePage from './pages/ProfilePage'
import AccountSettingsPage from './pages/AccountSettingsPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import PublicProfilePage from './pages/PublicProfilePage'
import ProfileSearchPage from './pages/ProfileSearchPage'
import PublicGalaPlanPage from './pages/PublicGalaPlanPage'
import LegalPage from './pages/LegalPage'
import AboutPage from './pages/AboutPage'
import PlaceSubmissionPage from './pages/PlaceSubmissionPage'
import MyPlaceSubmissionsPage from './pages/MyPlaceSubmissionsPage'
import AskAiMapPage from './pages/AskAiMapPage'
import AskAiOverviewPage from './pages/AskAiOverviewPage'
import PlacesIndexPage from './pages/PlacesIndexPage'
import PlaceCategoriesIndexPage from './pages/PlaceCategoriesIndexPage'
import AreaPlacesPage from './pages/AreaPlacesPage'
import CategoryPlacesPage from './pages/CategoryPlacesPage'
import PlaceDetailView from './components/PlaceDetailView'
import ProtectedFeatureGate from './components/ProtectedFeatureGate'
import MobileBottomNav from './components/MobileBottomNav'
import UnifiedLoadingState from './components/UnifiedLoadingState'
import SeoHead from './components/SeoHead'
import type { PlaceCardData } from './components/PlaceCard'
import { SavedFavoritesProvider } from './context/SavedFavoritesContext'
import { SystemMessageProvider } from './context/SystemMessageContext'
import { AskAiNotificationProvider } from './context/AskAiNotificationContext'
import { supabase } from './supabase'
import { getOnboardingStatus } from './utils/profileApi'
import { navigateToPath, replaceWithPath } from './utils/navigation'
import { markSoftNavigation } from './utils/navigationState'
import { formatLabelFromSlug, getCanonicalPlacePath, resolveAreaMeta } from './utils/seo'
import { getPlaceCategoryLabel } from './data/placeCategories'
import { metroManilaAreas } from './data/metroManilaAreas'

type PlaceDetail = {
  id: string
  slug: string
  name: string
  average_rating?: string | null
  review_count?: number | null
  address?: string | null
  city?: string | null
  area?: string | null
  description: string
  best_time_to_visit?: string | null
  visit_duration?: string | null
  good_for?: string[]
  not_ideal_for?: string[]
  crowd_level?: string | null
  indoor_outdoor?: string | null
  weather_fit?: string | null
  parking_info?: string | null
  commute_access?: string | null
  nearby_context?: string | null
  budget_note?: string | null
  budget_min?: number | null
  price_level?: number | null
  google_maps_url?: string | null
  category: string
  latitude: number | string
  longitude: number | string
  status?: string
  imageUrl?: string | null
  thumbnailUrl?: string | null
  curatedImageUrls?: string[] | null
  categories?: { id: string; name: string }[]
  tags?: { id: string; name: string; group: string; strength: number }[]
}

type PlaceDetailCardData = PlaceCardData & {
  id: string
  slug: string
}

function parseCanonicalPlacePath(pathname: string): { areaSlug: string; placeSlug: string } | null {
  const match = pathname.match(/^\/places\/([^/]+)\/([^/]+)\/?$/i)
  return match
    ? {
        areaSlug: decodeURIComponent(match[1]).toLowerCase(),
        placeSlug: decodeURIComponent(match[2]),
      }
    : null
}

function parseLegacyPlaceSlugPath(pathname: string): string | null {
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

function parsePublicProfileUsername(pathname: string): string | null {
  const match = pathname.match(/^\/u\/([^/]+)\/?$/i)
  return match ? decodeURIComponent(match[1]) : null
}

function parsePublicGalaPlanPath(pathname: string): { username: string; slug: string } | null {
  const match = pathname.match(/^\/u\/([^/]+)\/(?:plans|gala)\/([^/]+)\/?$/i)
  return match
    ? {
        username: decodeURIComponent(match[1]),
        slug: decodeURIComponent(match[2]),
      }
    : null
}

function parseOwnedGalaPlanPath(pathname: string): string | null {
  const match = pathname.match(/^\/gala-plan(?:s)?\/([^/]+)\/?$/i)
  return match ? decodeURIComponent(match[1]) : null
}

function parseEditGalaPlanPath(pathname: string): string | null {
  const match = pathname.match(/^\/gala-plan(?:s)?\/([^/]+)\/edit\/?$/i)
  return match ? decodeURIComponent(match[1]) : null
}

function parseAreaPagePath(pathname: string): string | null {
  const match = pathname.match(/^\/places\/([^/]+)\/?$/i)
  return match ? decodeURIComponent(match[1]).toLowerCase() : null
}

function parseCategoryPagePath(pathname: string): string | null {
  const match = pathname.match(/^\/places\/categories\/([^/]+)\/?$/i)
  return match ? decodeURIComponent(match[1]).toLowerCase() : null
}

const searchRouteCachePrefix = 'galatayo:search-route:'
const knownAreaSlugs = new Set<string>(metroManilaAreas.map((area) => area.slug))

function isKnownAreaSlug(value: string) {
  return knownAreaSlugs.has(value.toLowerCase())
}

function shouldSkipTopScrollRestore(pathname: string, search: string) {
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

function getCanonicalGalaPlanPath(pathname: string) {
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

function isPath(pathname: string, path: string) {
  return pathname === path || pathname === `${path}/`
}

function getCanonicalForgotPasswordPath(pathname: string): '/forgot-password' | null {
  if (isPath(pathname, '/forgot') || isPath(pathname, '/forgot-password') || isPath(pathname, '/reset-password') || isPath(pathname, '/auth/forgot-password')) {
    return '/forgot-password'
  }

  return null
}

function getCanonicalAuthPath(pathname: string): '/login' | '/signup' | null {
  if (isPath(pathname, '/auth')) {
    return '/login'
  }

  if (isPath(pathname, '/sign-up')) {
    return '/signup'
  }

  return null
}

function getCanonicalSettingsPath(pathname: string): '/settings/change-password' | null {
  if (isPath(pathname, '/settings/password')) {
    return '/settings/change-password'
  }

  return null
}

function getCanonicalSubmitPlacePath(pathname: string): '/submit-place' | null {
  if (
    isPath(pathname, '/places/submit') ||
    isPath(pathname, '/places/new')
  ) {
    return '/submit-place'
  }

  return null
}

function getCanonicalHomePath(pathname: string): '/' | null {
  if (isPath(pathname, '/home')) {
    return '/'
  }

  return null
}

function getCategoryBreadcrumbMeta(listingLink: string | null, listingLabel: string | null) {
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
    parentItem: `${window.location.origin}/places/categories`,
    childName: listingLabel || getPlaceCategoryLabel(categorySlug),
    childItem: `${window.location.origin}/places/categories/${encodeURIComponent(categorySlug)}`,
  }
}

function getCanonicalMemberPath(pathname: string): '/find-friends' | null {
  if (
    isPath(pathname, '/profiles/search') ||
    isPath(pathname, '/profile/search')
  ) {
    return '/find-friends'
  }

  return null
}

function getCanonicalAskAiPath(pathname: string): '/ask-ai/chatbot' | '/ask-ai/maps' | null {
  if (isPath(pathname, '/ask-ai/text')) {
    return '/ask-ai/chatbot'
  }

  if (isPath(pathname, '/ask-ai/map')) {
    return '/ask-ai/maps'
  }

  return null
}

function getCanonicalPromptBuilderPath(pathname: string): '/ask-ai/prompt-builder' | null {
  if (isPath(pathname, '/prompt-builder')) {
    return '/ask-ai/prompt-builder'
  }

  return null
}

function isProtectedAccountPath(pathname: string) {
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
    '/admin/user-reports',
    '/admin/place-images',
    '/admin/place-submissions',
    '/profile',
    '/me',
    '/account',
    '/settings',
    '/settings/change-password',
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

function shouldShowMobileBottomNav(pathname: string) {
  if (
    sharedRouteMatchers.some((matcher) => matcher(pathname))
  ) {
    return false
  }

  if (isPath(pathname, '/login') || isPath(pathname, '/signup') || isPath(pathname, '/onboarding') || isPath(pathname, '/forgot-password') || isPath(pathname, '/auth/reset-password')) {
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

function shouldReserveMobileBottomNavSpace(pathname: string) {
  if (
    isPath(pathname, '/search') ||
    isPath(pathname, '/ask-ai/maps') ||
    isPath(pathname, '/ask-ai/chatbot') ||
    isPath(pathname, '/ask-ai/prompt-builder')
  ) {
    return false
  }

  return shouldShowMobileBottomNav(pathname)
}

const sharedRouteMatchers = [
  (pathname: string) => /^\/u\/[^/]+\/?$/i.test(pathname),
  (pathname: string) => /^\/u\/[^/]+\/(?:plans|gala)\/[^/]+\/?$/i.test(pathname),
]

function getNoindexForPath(pathname: string) {
  if (
    [
      '/home',
      '/search',
      '/login',
      '/signup',
      '/auth',
      '/auth/callback',
      '/auth/reset-password',
      '/forgot-password',
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

function AppLoadingState({ message = 'Loading GalaTayo...' }: { message?: string }) {
  return (
    <UnifiedLoadingState
      variant="page"
      title={message}
      message="Please wait while we get things ready for you."
    />
  )
}

function formatMarkerRatingText(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }

  return value.toFixed(1)
}

function mapBackendPlaceToCardData(place: PlaceDetail): PlaceDetailCardData {
  const parsedRating = place.average_rating != null ? parseFloat(String(place.average_rating)) : null

  return {
    id: place.id,
    slug: place.slug,
    name: place.name,
    rating: parsedRating,
    ratingCount: place.review_count ?? null,
    markerRatingText: formatMarkerRatingText(parsedRating),
    category: place.category,
    area: place.area || place.city || '',
    address: place.address || null,
    city: place.city || null,
    localArea: place.area || null,
    status: place.status === 'active' ? 'Open' : 'Unknown',
    reason: place.description,
    description: place.description,
    badge: 'Shared',
    googleMapsUrl: place.google_maps_url,
    best_time_to_visit: place.best_time_to_visit,
    visit_duration: place.visit_duration,
    good_for: place.good_for ?? [],
    not_ideal_for: place.not_ideal_for ?? [],
    crowd_level: place.crowd_level,
    indoor_outdoor: place.indoor_outdoor,
    weather_fit: place.weather_fit,
    parking_info: place.parking_info,
    commute_access: place.commute_access,
    nearby_context: place.nearby_context,
    budget_notes: place.budget_note ?? null,
    budget_min: place.budget_min ?? null,
    price_level: place.price_level ?? null,
    coordinates: {
      lat: place.latitude,
      lng: place.longitude,
    },
    imageUrl: place.imageUrl || null,
    curatedImageUrls: Array.isArray(place.curatedImageUrls)
      ? place.curatedImageUrls.filter((url): url is string => Boolean(url?.trim()))
      : [],
    categories: (place.categories ?? []).map((c) => ({ id: c.id, name: c.name })),
    tags: (place.tags ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      group: t.group,
      strength: t.strength,
    })),
  }
}

function buildPlaceDescription(place: PlaceDetailCardData, areaName: string) {
  const parts: string[] = [`Explore ${place.name} in ${areaName}.`]
  if (place.good_for && place.good_for.length > 0) {
    parts.push(`Best for ${place.good_for.slice(0, 3).join(', ')}.`)
  }
  if (place.budget_min != null) {
    parts.push(`Budget starts at ₱${place.budget_min}.`)
  }
  if (place.description?.trim()) {
    const shortDesc = place.description.replace(/<[^>]*>/g, '').slice(0, 120).replace(/\s+\S*$/, '')
    if (shortDesc.length > 20) parts.push(shortDesc + '.')
  }
  return parts.join(' ') + ' See location, photos, reviews, and add to your gala plan.'
}

function buildPlaceFaqSchema(place: PlaceDetailCardData) {
  const items: { '@type': 'Question'; name: string; acceptedAnswer: { '@type': 'Answer'; text: string } }[] = []

  const goodFor = place.good_for ?? []
  if (goodFor.length > 0) {
    items.push({
      '@type': 'Question',
      name: `Is ${place.name} good for a date?`,
      acceptedAnswer: { '@type': 'Answer', text: goodFor.some((g) => /date|romantic|night/i.test(g)) ? `Yes, it is great for ${goodFor.filter((g) => /date|romantic|night/i.test(g)).join(', ')}.` : `It works best for ${goodFor.join(', ')}.` },
    })
    items.push({
      '@type': 'Question',
      name: `Is ${place.name} family-friendly?`,
      acceptedAnswer: { '@type': 'Answer', text: goodFor.some((g) => /family|kid|children/i.test(g)) ? 'Yes, it is recommended for family trips.' : 'It is more suited for other vibes like ' + goodFor.join(', ') + '.' },
    })
  }

  if (place.best_time_to_visit?.trim()) {
    items.push({
      '@type': 'Question',
      name: `What is the best time to visit ${place.name}?`,
      acceptedAnswer: { '@type': 'Answer', text: place.best_time_to_visit },
    })
  }

  if (place.budget_min != null) {
    items.push({
      '@type': 'Question',
      name: `How much budget is needed for ${place.name}?`,
      acceptedAnswer: { '@type': 'Answer', text: `Starting budget is around ₱${place.budget_min}.` },
    })
  }

  if (place.indoor_outdoor?.trim()) {
    items.push({
      '@type': 'Question',
      name: `Is ${place.name} indoor or outdoor?`,
      acceptedAnswer: { '@type': 'Answer', text: `${place.indoor_outdoor}.${place.weather_fit?.trim() ? ' It is ' + place.weather_fit + '.' : ''}` },
    })
  }

  if (place.commute_access?.trim()) {
    items.push({
      '@type': 'Question',
      name: `How do I get to ${place.name}?`,
      acceptedAnswer: { '@type': 'Answer', text: place.commute_access },
    })
  }

  if (place.parking_info?.trim()) {
    items.push({
      '@type': 'Question',
      name: `Is parking available at ${place.name}?`,
      acceptedAnswer: { '@type': 'Answer', text: place.parking_info },
    })
  }

  if (place.nearby_context?.trim()) {
    items.push({
      '@type': 'Question',
      name: `What is near ${place.name}?`,
      acceptedAnswer: { '@type': 'Answer', text: place.nearby_context },
    })
  }

  if (items.length === 0) return null

  return {
    '@type': 'FAQPage',
    mainEntity: items,
  }
}

function getStructuredPlaceType(category: string | null | undefined) {
  const normalizedCategory = category?.trim().toLowerCase() || ''

  if (normalizedCategory.includes('museum')) return 'Museum'
  if (normalizedCategory.includes('park') || normalizedCategory.includes('parke')) return 'Park'
  if (normalizedCategory.includes('heritage') || normalizedCategory.includes('tourist')) return 'TouristAttraction'
  if (
    normalizedCategory.includes('cafe') ||
    normalizedCategory.includes('kainan') ||
    normalizedCategory.includes('mall') ||
    normalizedCategory.includes('nightlife') ||
    normalizedCategory.includes('cinema') ||
    normalizedCategory.includes('arcade')
  ) {
    return 'LocalBusiness'
  }

  return 'Place'
}

function SharedPlacePage({
  slug,
  currentPathname,
  currentSearch = '',
  expectedAreaSlug = null,
  redirectToCanonical = false,
}: {
  slug: string
  currentPathname: string
  currentSearch?: string
  expectedAreaSlug?: string | null
  redirectToCanonical?: boolean
}) {
  const [place, setPlace] = useState<PlaceDetailCardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
    const endpoint = apiBaseUrl
      ? `${apiBaseUrl}/places/${encodeURIComponent(slug)}`
      : `/api/places/${encodeURIComponent(slug)}`

    const loadPlace = async () => {
      try {
        setIsLoading(true)
        setNotFound(false)
        setErrorMessage(null)
        setPlace(null)

        const response = await fetch(endpoint, {
          method: 'GET',
          signal: controller.signal,
        })

        if (response.status === 404) {
          setNotFound(true)
          return
        }

        if (!response.ok) {
          throw new Error('Failed to load shared place.')
        }

        const data = (await response.json()) as PlaceDetail
        setPlace(mapBackendPlaceToCardData(data))
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load shared place.')
        }
      } finally {
        setIsLoading(false)
      }
    }

    void loadPlace()

    return () => controller.abort()
  }, [slug])

  const areaMeta = place ? resolveAreaMeta(place) : null
  const canonicalPath = place && areaMeta
    ? getCanonicalPlacePath({
        areaSlug: areaMeta.slug,
        placeSlug: place.slug,
      })
    : null
  const sharedPageSearchParams = useMemo(() => new URLSearchParams(currentSearch), [currentSearch])
  const rawListingLink = sharedPageSearchParams.get('from')
  const rawListingLabel = sharedPageSearchParams.get('fromLabel')
  const urlListingLink = rawListingLink && rawListingLink.startsWith('/') ? rawListingLink : null
  const urlListingLabel = rawListingLabel?.trim() || null

  const sessionReturn = useMemo(() => {
    try {
      const stored = window.sessionStorage.getItem(`galatayo:place-return:${slug}`)
      if (stored) {
        return JSON.parse(stored) as { source?: string; returnTo?: string; returnLabel?: string }
      }
    } catch {
      // sessionStorage may be unavailable, ignore
    }
    return null
  }, [slug])

  const listingLink = urlListingLink || sessionReturn?.returnTo || null
  const listingLabel = urlListingLabel || sessionReturn?.returnLabel || null
  const cameFromSearch =
    !urlListingLink &&
    sessionReturn?.source === 'search' &&
    typeof sessionReturn?.returnTo === 'string' &&
    sessionReturn.returnTo.startsWith('/search')

  const categoryBreadcrumbMeta = getCategoryBreadcrumbMeta(listingLink, listingLabel)

  useEffect(() => {
    if (!canonicalPath) {
      return
    }

    if ((redirectToCanonical || expectedAreaSlug !== null) && currentPathname !== canonicalPath) {
      replaceWithPath(canonicalPath)
    }
  }, [canonicalPath, currentPathname, expectedAreaSlug, redirectToCanonical])

  const placeJsonLd =
    place && areaMeta && canonicalPath
      ? {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: `${window.location.origin}/` },
                { '@type': 'ListItem', position: 2, name: 'Places', item: `${window.location.origin}/places` },
                ...(categoryBreadcrumbMeta
                  ? [
                      { '@type': 'ListItem', position: 3, name: categoryBreadcrumbMeta.parentName, item: categoryBreadcrumbMeta.parentItem },
                      { '@type': 'ListItem', position: 4, name: categoryBreadcrumbMeta.childName, item: categoryBreadcrumbMeta.childItem },
                      { '@type': 'ListItem', position: 5, name: place.name, item: `${window.location.origin}${canonicalPath}` },
                    ]
                  : [
                      { '@type': 'ListItem', position: 3, name: areaMeta.name, item: `${window.location.origin}/places/${encodeURIComponent(areaMeta.slug)}` },
                      { '@type': 'ListItem', position: 4, name: place.name, item: `${window.location.origin}${canonicalPath}` },
                    ]),
              ],
            },
            {
              '@type': getStructuredPlaceType(place.category),
              name: place.name,
              description: place.description || place.reason,
              url: `${window.location.origin}${canonicalPath}`,
              address: {
                '@type': 'PostalAddress',
                addressLocality: place.city || areaMeta.name,
                streetAddress: place.address || undefined,
                addressRegion: 'Metro Manila',
                addressCountry: 'PH',
              },
              image: place.imageUrl || place.curatedImageUrls?.[0] || undefined,
            },
            ...(buildPlaceFaqSchema(place) ? [buildPlaceFaqSchema(place)!] : []),
          ],
        }
      : null

  if (isLoading) {
    return (
      <>
        <SeoHead title="Loading place | GalaTayo" robots="noindex,follow" />
        <UnifiedLoadingState
          variant="page"
          title="Preparing place details..."
          message="We are opening this shared place now."
        />
      </>
    )
  }

  if (notFound) {
    return (
      <>
        <SeoHead title="Place not found | GalaTayo" robots="noindex,follow" />
        <main className="min-h-screen bg-[var(--bg)] px-6 py-10 text-[var(--text)]">
          <h1 className="text-2xl font-semibold text-slate-900">Place not found</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            We could not find details for this shared link.
          </p>
        </main>
      </>
    )
  }

  if (errorMessage) {
    return (
      <>
        <SeoHead title="Unable to load place | GalaTayo" robots="noindex,follow" />
        <main className="min-h-screen bg-[var(--bg)] px-6 py-10 text-[var(--text)]">
          <h1 className="text-2xl font-semibold text-slate-900">Unable to load place</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">{errorMessage}</p>
        </main>
      </>
    )
  }

  if (!place) {
    return null
  }

  return (
    <>
      <SeoHead
        title={`${place.name} in ${areaMeta?.name || 'Metro Manila'} | GalaTayo`}
        description={buildPlaceDescription(place, areaMeta?.name || 'Metro Manila')}
        canonicalPath={canonicalPath}
        openGraphType="article"
        image={
          place.imageUrl || place.thumbnailUrl || place.curatedImageUrls?.[0]
            ? { url: place.imageUrl || place.thumbnailUrl || place.curatedImageUrls?.[0] || '', alt: place.name }
            : null
        }
        jsonLd={placeJsonLd}
      />
      <PlaceDetailView
        place={place}
        areaBreadcrumb={{
          areaSlug: areaMeta?.slug || expectedAreaSlug || formatLabelFromSlug(place.city || place.area || 'metro-manila').toLowerCase(),
          areaName: areaMeta?.name || formatLabelFromSlug(expectedAreaSlug || 'metro-manila'),
        }}
        cameFromSearch={cameFromSearch}
        returnLabel={listingLabel}
        searchHref={listingLink}
      />
    </>
  )
}

function PlacesSlugResolverPage({
  slug,
  currentPathname,
  search,
}: {
  slug: string
  currentPathname: string
  search: string
}) {
  if (isKnownAreaSlug(slug)) {
    return <AreaPlacesPage areaSlug={slug.toLowerCase()} search={search} />
  }

  return <SharedPlacePage slug={slug} currentPathname={currentPathname} redirectToCanonical />
}

function App() {
  const [locationState, setLocationState] = useState(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
  }))
  const [isRecoveryFlow] = useState(() => {
    const hash = window.location.hash
    return hash.includes('type=recovery') || hash.includes('access_token')
  })
  const [session, setSession] = useState<Session | null>(null)
  const [hasResolvedInitialAuth, setHasResolvedInitialAuth] = useState(false)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [hasResolvedProfile, setHasResolvedProfile] = useState(false)
  const [isInitialProfileLoading, setIsInitialProfileLoading] = useState(false)
  const [, setIsRefreshingSession] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileRefreshKey, setProfileRefreshKey] = useState(0)
  const sessionRef = useRef<Session | null>(null)
  const hasCompletedInitialAuthRef = useRef(false)
  const userId = session?.user?.id ?? null

  const { pathname, search } = locationState

  useEffect(() => {
    const handlePopState = () => {
      markSoftNavigation()
      setLocationState({
        pathname: window.location.pathname,
        search: window.location.search,
      })
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    window.history.scrollRestoration = 'manual'
  }, [])

  useLayoutEffect(() => {
    if (shouldSkipTopScrollRestore(pathname, search)) {
      return
    }

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'auto',
    })
  }, [pathname, search])

  useEffect(() => {
    const canonicalAuthPath = getCanonicalAuthPath(pathname)

    if (canonicalAuthPath && pathname !== canonicalAuthPath) {
      navigateToPath(canonicalAuthPath)
    }
  }, [pathname])

  useEffect(() => {
    const canonicalGalaPlanPath = getCanonicalGalaPlanPath(pathname)

    if (canonicalGalaPlanPath && pathname !== canonicalGalaPlanPath) {
      navigateToPath(canonicalGalaPlanPath)
    }
  }, [pathname])

  useEffect(() => {
    const canonicalSettingsPath = getCanonicalSettingsPath(pathname)

    if (canonicalSettingsPath && pathname !== canonicalSettingsPath) {
      navigateToPath(canonicalSettingsPath)
    }
  }, [pathname])

  useEffect(() => {
    const canonicalSubmitPlacePath = getCanonicalSubmitPlacePath(pathname)

    if (canonicalSubmitPlacePath && pathname !== canonicalSubmitPlacePath) {
      replaceWithPath(canonicalSubmitPlacePath)
    }
  }, [pathname])

  useEffect(() => {
    const canonicalHomePath = getCanonicalHomePath(pathname)

    if (canonicalHomePath && pathname !== canonicalHomePath) {
      replaceWithPath(canonicalHomePath)
    }
  }, [pathname])

  useEffect(() => {
    const canonicalForgotPasswordPath = getCanonicalForgotPasswordPath(pathname)

    if (canonicalForgotPasswordPath && pathname !== canonicalForgotPasswordPath) {
      replaceWithPath(canonicalForgotPasswordPath)
    }
  }, [pathname])

  useEffect(() => {
    const canonicalMemberPath = getCanonicalMemberPath(pathname)

    if (canonicalMemberPath && pathname !== canonicalMemberPath) {
      replaceWithPath(canonicalMemberPath)
    }
  }, [pathname])

  useEffect(() => {
    const canonicalAskAiPath = getCanonicalAskAiPath(pathname)

    if (canonicalAskAiPath && pathname !== canonicalAskAiPath) {
      replaceWithPath(canonicalAskAiPath)
    }
  }, [pathname])

  useEffect(() => {
    const canonicalPromptBuilderPath = getCanonicalPromptBuilderPath(pathname)

    if (canonicalPromptBuilderPath && pathname !== canonicalPromptBuilderPath) {
      replaceWithPath(canonicalPromptBuilderPath)
    }
  }, [pathname])

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        sessionRef.current = data.session
        setSession(data.session)
        setHasResolvedInitialAuth(true)
        hasCompletedInitialAuthRef.current = true
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, nextSession) => {
      const previousUserId = sessionRef.current?.user?.id ?? null
      const nextUserId = nextSession?.user?.id ?? null
      const didUserIdentityChange = previousUserId !== nextUserId

      sessionRef.current = nextSession
      setSession(nextSession)
      setHasResolvedInitialAuth(true)
      const hasCompletedInitialAuth = hasCompletedInitialAuthRef.current
      hasCompletedInitialAuthRef.current = true

      if (didUserIdentityChange && hasCompletedInitialAuth) {
        setHasResolvedProfile(false)
      }

      if (
        didUserIdentityChange ||
        event === 'SIGNED_IN' ||
        event === 'SIGNED_OUT' ||
        event === 'USER_UPDATED' ||
        event === 'PASSWORD_RECOVERY'
      ) {
        setProfileRefreshKey((currentValue) => currentValue + 1)
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!hasResolvedInitialAuth) {
      return undefined
    }

    const activeSession = sessionRef.current

    if (!activeSession) {
      setNeedsOnboarding(false)
      setHasResolvedProfile(true)
      setProfileError('')
      setIsInitialProfileLoading(false)
      setIsRefreshingSession(false)
      return undefined
    }

    let isMounted = true
    const isInitialProfileResolution = !hasResolvedProfile

    const loadProfileState = async () => {
      try {
        if (isInitialProfileResolution) {
          setIsInitialProfileLoading(true)
        } else {
          setIsRefreshingSession(true)
        }
        setProfileError('')
        const data = await getOnboardingStatus(activeSession)

        if (!isMounted) {
          return
        }

        setNeedsOnboarding(data.needsOnboarding)
        setHasResolvedProfile(true)
      } catch (error) {
        if (isMounted) {
          setProfileError(error instanceof Error ? error.message : 'Failed to load profile.')
        }
      } finally {
        if (isMounted) {
          setIsInitialProfileLoading(false)
          setIsRefreshingSession(false)
        }
      }
    }

    void loadProfileState()

    return () => {
      isMounted = false
    }
  }, [hasResolvedInitialAuth, hasResolvedProfile, profileRefreshKey, userId])

  useEffect(() => {
    if (!hasResolvedInitialAuth) {
      return
    }

    if (!session) {
      if (isPath(pathname, '/onboarding')) {
        navigateToPath('/login')
      }
      return
    }

    if (!hasResolvedProfile) {
      return
    }

    if (
      needsOnboarding &&
      !isPath(pathname, '/onboarding') &&
      !isPath(pathname, '/terms') &&
      !isPath(pathname, '/privacy')
    ) {
      navigateToPath('/onboarding')
      return
    }

    if (
      !needsOnboarding &&
      (isPath(pathname, '/onboarding') || isPath(pathname, '/auth/callback'))
    ) {
      navigateToPath('/')
    }
  }, [hasResolvedInitialAuth, hasResolvedProfile, needsOnboarding, pathname, session])

  const canonicalPlacePath = useMemo(() => parseCanonicalPlacePath(pathname), [pathname])
  const categoryPageSlug = useMemo(() => parseCategoryPagePath(pathname), [pathname])
  const areaPageSlug = useMemo(() => parseAreaPagePath(pathname), [pathname])
  const legacyPlaceSlug = useMemo(() => parseLegacyPlaceSlugPath(pathname), [pathname])
  const publicGalaPlanPath = useMemo(() => parsePublicGalaPlanPath(pathname), [pathname])
  const publicProfileUsername = useMemo(() => parsePublicProfileUsername(pathname), [pathname])
  const editGalaPlanId = useMemo(() => parseEditGalaPlanPath(pathname), [pathname])
  const ownedGalaPlanId = useMemo(() => parseOwnedGalaPlanPath(pathname), [pathname])

  const content = (() => {
    if (!hasResolvedInitialAuth) {
      return <AppLoadingState />
    }

    if (profileError && session && !hasResolvedProfile) {
      return <AppLoadingState message={profileError} />
    }

    if (session && isInitialProfileLoading && !hasResolvedProfile) {
      return <AppLoadingState message="Checking your profile..." />
    }

    if (isPath(pathname, '/onboarding')) {
      if (!session) {
        return <LoginPage />
      }

      return <OnboardingPage session={session} onComplete={() => setProfileRefreshKey((currentValue) => currentValue + 1)} />
    }

    if (pathname === '/terms' || pathname === '/terms/') {
      return <LegalPage type="terms" />
    }

    if (pathname === '/privacy' || pathname === '/privacy/') {
      return <LegalPage type="privacy" />
    }

    if (session && needsOnboarding) {
      return <AppLoadingState message="Taking you to onboarding..." />
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

    if (!session && isProtectedAccountPath(pathname)) {
      return <ProtectedFeatureGate pathname={pathname} search={search} />
    }

    if (pathname === '/' || pathname === '') {
      return (
        <>
          <SeoHead
            title="GalaTayo | Plan Your Next Gala"
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
          <SeoHead
            title="Search Places | GalaTayo"
            description="Search Metro Manila places on GalaTayo."
            canonicalPath="/search"
            robots="noindex,follow"
          />
          <SearchPage key={`search:${search || 'root'}`} />
        </>
      )
    }

    if (pathname === '/ask-ai' || pathname === '/ask-ai/') {
      return (
        <>
          <SeoHead
            title="Ask AI | GalaTayo"
            description="Choose how you want GalaTayo AI to help you."
            canonicalPath="/ask-ai"
            robots="noindex,follow"
          />
          <AskAiOverviewPage />
        </>
      )
    }

    if (pathname === '/ask-ai/chatbot' || pathname === '/ask-ai/chatbot/' || pathname === '/ask-ai/text' || pathname === '/ask-ai/text/') {
      const initialAskAiQuestion = new URLSearchParams(search).get('q') ?? ''
      return (
        <>
          <SeoHead
            title="Ask AI Chatbot | GalaTayo"
            description="Ask AI chatbot mode on GalaTayo."
            canonicalPath="/ask-ai/chatbot"
            robots="noindex,follow"
          />
          <HomePage key={`ask-ai:${search || 'root'}`} initialMode="ask-ai" initialAskAiQuestion={initialAskAiQuestion} />
        </>
      )
    }

    if (pathname === '/ask-ai/maps' || pathname === '/ask-ai/maps/') {
      return (
        <>
          <SeoHead
            title="Ask AI Maps | GalaTayo"
            description="Ask AI maps mode on GalaTayo."
            canonicalPath="/ask-ai/maps"
            robots="noindex,follow"
          />
          <AskAiMapPage />
        </>
      )
    }

    if (pathname === '/ask-ai/prompt-builder' || pathname === '/ask-ai/prompt-builder/' || pathname === '/prompt-builder' || pathname === '/prompt-builder/') {
      return (
        <>
          <SeoHead
            title="Prompt Builder | GalaTayo"
            description="Prompt builder on GalaTayo."
            canonicalPath="/ask-ai/prompt-builder"
            robots="noindex,follow"
          />
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

    if (isPath(pathname, '/auth/reset-password')) {
      if (!session && isRecoveryFlow) {
        return <AppLoadingState message="Preparing your password reset..." />
      }

      return <ResetPasswordPage session={session} />
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

    if (publicProfileUsername) {
      return <PublicProfilePage username={publicProfileUsername} />
    }

    if (pathname === '/profile' || pathname === '/profile/' || pathname === '/me' || pathname === '/me/') {
      if (!session) {
        return <LoginPage />
      }

      return <ProfilePage session={session} />
    }

    if (pathname === '/settings' || pathname === '/settings/' || pathname === '/account' || pathname === '/account/') {
      if (!session) {
        return <LoginPage />
      }

      return <AccountSettingsPage session={session} />
    }

    if (
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

    if (pathname === '/admin/place-images' || pathname === '/admin/place-images/') {
      if (!session) {
        return <LoginPage />
      }

      return <AdminPlaceImagesPage session={session} />
    }

    if (pathname === '/admin/user-reports' || pathname === '/admin/user-reports/') {
      if (!session) {
        return <LoginPage />
      }

      return <AdminUserReportsPage session={session} />
    }

    if (pathname === '/admin/place-submissions' || pathname === '/admin/place-submissions/') {
      if (!session) {
        return <LoginPage />
      }

      return <AdminPlaceSubmissionsPage session={session} />
    }

    if (pathname === '/submissions' || pathname === '/submissions/' || pathname === '/my-submissions' || pathname === '/my-submissions/') {
      if (!session) {
        return <LoginPage />
      }

      return <MyPlaceSubmissionsPage session={session} />
    }

    return (
      <>
        <SeoHead title="Page not found | GalaTayo" robots="noindex,follow" />
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
  })()

  const showMobileBottomNav = shouldShowMobileBottomNav(pathname)
  const reserveMobileBottomNavSpace = shouldReserveMobileBottomNavSpace(pathname)
  const isAreaQueryVariant = Boolean(areaPageSlug && search)
  const shouldApplyGenericNoindex =
    (getNoindexForPath(pathname) || isAreaQueryVariant) &&
    !canonicalPlacePath &&
    !categoryPageSlug &&
    !areaPageSlug &&
    !(pathname === '/' || pathname === '') &&
    !(pathname === '/places' || pathname === '/places/') &&
    !(pathname === '/about' || pathname === '/about/') &&
    !(pathname === '/terms' || pathname === '/terms/') &&
    !(pathname === '/privacy' || pathname === '/privacy/')

  return (
    <SystemMessageProvider>
      <SavedFavoritesProvider>
        <AskAiNotificationProvider>
          {shouldApplyGenericNoindex ? (
            <SeoHead
              title="GalaTayo"
              canonicalPath={pathname}
              robots="noindex,follow"
            />
          ) : null}
          <div>
            {content}
          </div>
          {showMobileBottomNav ? <MobileBottomNav currentPath={pathname} session={session} /> : null}
        </AskAiNotificationProvider>
      </SavedFavoritesProvider>
    </SystemMessageProvider>
  )
}

export default App
