import type { RefObject } from 'react'
import { supabase } from '../../supabase'
import { normalizeTypedSearchText, buildSearchPath, type SearchBudgetValue, type SearchGoodForValue } from '../../utils/searchParams'
import type { PlaceCardData, PlaceCategoryMeta, PlaceTagMeta } from '../PlaceCard'
import type { ChatMessage, AskAiJobStatus } from '../../utils/askAiRuntime'
import type { AskAiUsageStatus } from '../../utils/askAiUsage'

type BackendCategory = {
  id: string
  name: string
  description: string
  searchTerms: string[]
}

type BackendArea = {
  id: string
  name: string
  type: 'all' | 'city' | 'municipality'
}

type CategoryChip = {
  id: string
  name: string
}

type AreaChip = {
  id: string
  name: string
  type: 'all' | 'city' | 'municipality'
}

type GoodForChip = {
  id: SearchGoodForValue
  name: string
}

type BudgetValue = SearchBudgetValue

type BudgetOption = {
  value: BudgetValue
  label: string
}

type SearchMode = 'places' | 'ask-ai'

type AskAiSource = {
  title: string
  url: string
}

type HomePageInitialSearchState = {
  rawQuery?: string
  categoryId?: string | null
  areaId?: string | null
  goodFor?: SearchGoodForValue | null
  budget?: BudgetValue | null
  page?: number
  autoSearch?: boolean
}

type HomePageProps = {
  initialMode?: SearchMode
  initialPromptBuilderOpen?: boolean
  initialSearchState?: HomePageInitialSearchState
  initialAskAiQuestion?: string
}

type BackendSearchPlace = {
  id?: string | null
  slug?: string | null
  name?: string | null
  description?: string | null
  area?: string | null
  city?: string | null
  location?: string | null
  category?: string | null
  latitude?: number | string | null
  longitude?: number | string | null
  imageUrl?: string | null
  thumbnailUrl?: string | null
  imageAlt?: string | null
  curatedImageUrls?: string[] | null
  address?: string | null
  budget?: string | null
  budgetRange?: string | null
  reason?: string | null
  rating?: number | string | null
  reviewCount?: number | string | null
  categories?: PlaceCategoryMeta[] | null
  tags?: PlaceTagMeta[] | null
  matchedCategories?: PlaceCategoryMeta[] | null
  matchedTags?: PlaceTagMeta[] | null
  place_history?: string | null
  best_time_to_visit?: string | null
  visit_duration?: string | null
  good_for?: string[] | null
  not_ideal_for?: string[] | null
  crowd_level?: string | null
  indoor_outdoor?: string | null
  weather_fit?: string | null
  parking_info?: string | null
  accessibility_notes?: string | null
  decision_reason?: string | null
  commute_friendly?: boolean | null
  commute_access?: string | null
  nearby_context?: string | null
  budget_notes?: string | null
  verification_status?: string | null
  verification_notes?: string | null
  verification_sources?: string[] | null
  last_verified_at?: string | null
  website_url?: string | null
  google_maps_url?: string | null
  distanceKm?: number | null
}

type BackendSearchStatus = 'ok' | 'empty_query' | 'too_vague' | 'unsupported_location' | 'no_results'

type MobileResultsViewMode = 'cards' | 'map'

type SearchRouteCache = {
  lastSearchQuery: string
  activeSearchLabel: string
  searchId: string | null
  searchResults: PlaceCardData[]
  totalCount: number
  totalPages: number
  selectedPlaceId: string | null
  currentPage: number
  mobileResultsView: MobileResultsViewMode
  scrollY: number
  desktopScrollTop: number
  selectedPlaceViewportTop: number | null
  pendingScrollRestore: boolean
}

type AskAiRouteCache = {
  question: string
  answer: string
  sources: AskAiSource[]
  answerError: string | null
  usageStatus: AskAiUsageStatus | null
  isSubmitting: boolean
  messages: ChatMessage[]
  jobId: string | null
  jobStatus: AskAiJobStatus | null
}

type IconProps = {
  className?: string
}

const searchRouteCachePrefix = 'galatayo:search-route:'
const askAiRouteCacheKey = 'galatayo:ask-ai-route'
const filtersCacheKey = 'galatayo:filters-cache'
const SEARCH_RESULTS_PER_PAGE = 10
const FILTERS_CACHE_TTL_MS = 24 * 60 * 60 * 1000

type FiltersCache = {
  categories: CategoryChip[]
  areas: AreaChip[]
  cachedAt: number
}

function readPersistentStorage(key: string) {
  try {
    const sessionValue = window.sessionStorage.getItem(key)
    if (sessionValue) {
      return sessionValue
    }
  } catch {
    // Storage can be unavailable in private browsing or restricted webviews.
  }

  try {
    return window.localStorage.getItem(key)
  } catch {
    // Storage can be unavailable in private browsing or restricted webviews.
    return null
  }
}

function writePersistentStorage(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value)
  } catch {
    // Storage can be unavailable in private browsing or restricted webviews.
  }

  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage can be unavailable in private browsing or restricted webviews.
  }
}

function removePersistentStorage(key: string) {
  try {
    window.sessionStorage.removeItem(key)
  } catch {
    // Storage can be unavailable in private browsing or restricted webviews.
  }

  try {
    window.localStorage.removeItem(key)
  } catch {
    // Storage can be unavailable in private browsing or restricted webviews.
  }
}

function getCurrentSearchRouteCacheKey() {
  return `${searchRouteCachePrefix}${window.location.pathname}${window.location.search}`
}

function readSearchRouteCache(): SearchRouteCache | null {
  try {
    const rawCache = readPersistentStorage(getCurrentSearchRouteCacheKey())

    if (!rawCache) {
      return null
    }

    const parsedCache = JSON.parse(rawCache) as Partial<SearchRouteCache>

    if (!Array.isArray(parsedCache.searchResults)) {
      return null
    }

    return {
      lastSearchQuery: typeof parsedCache.lastSearchQuery === 'string' ? parsedCache.lastSearchQuery : '',
      activeSearchLabel: typeof parsedCache.activeSearchLabel === 'string' ? parsedCache.activeSearchLabel : '',
      searchId: typeof parsedCache.searchId === 'string' ? parsedCache.searchId : null,
      searchResults: parsedCache.searchResults,
      totalCount:
        typeof parsedCache.totalCount === 'number' && Number.isFinite(parsedCache.totalCount) && parsedCache.totalCount >= 0
          ? Math.floor(parsedCache.totalCount)
          : parsedCache.searchResults.length,
      totalPages:
        typeof parsedCache.totalPages === 'number' && Number.isFinite(parsedCache.totalPages) && parsedCache.totalPages > 0
          ? Math.floor(parsedCache.totalPages)
          : Math.max(1, Math.ceil(parsedCache.searchResults.length / SEARCH_RESULTS_PER_PAGE)),
      selectedPlaceId: typeof parsedCache.selectedPlaceId === 'string' ? parsedCache.selectedPlaceId : null,
      currentPage:
        typeof parsedCache.currentPage === 'number' && Number.isFinite(parsedCache.currentPage) && parsedCache.currentPage > 0
          ? Math.floor(parsedCache.currentPage)
          : 1,
      mobileResultsView: parsedCache.mobileResultsView === 'map' ? 'map' : 'cards',
      scrollY: typeof parsedCache.scrollY === 'number' && Number.isFinite(parsedCache.scrollY) ? parsedCache.scrollY : 0,
      desktopScrollTop:
        typeof parsedCache.desktopScrollTop === 'number' && Number.isFinite(parsedCache.desktopScrollTop)
          ? parsedCache.desktopScrollTop
          : 0,
      selectedPlaceViewportTop:
        typeof parsedCache.selectedPlaceViewportTop === 'number' && Number.isFinite(parsedCache.selectedPlaceViewportTop)
          ? parsedCache.selectedPlaceViewportTop
          : null,
      pendingScrollRestore: parsedCache.pendingScrollRestore === true,
    }
  } catch (error) {
    console.warn('Unable to restore cached search route:', error)
    return null
  }
}

function writeSearchRouteCache(cache: SearchRouteCache) {
  try {
    writePersistentStorage(getCurrentSearchRouteCacheKey(), JSON.stringify(cache))
  } catch (error) {
    console.warn('Unable to cache search route:', error)
  }
}

function readAskAiRouteCache(): AskAiRouteCache | null {
  try {
    const rawCache = readPersistentStorage(askAiRouteCacheKey)

    if (!rawCache) {
      return null
    }

    const parsedCache = JSON.parse(rawCache) as Partial<AskAiRouteCache>
    const question = typeof parsedCache.question === 'string' ? parsedCache.question : ''
    const answer = typeof parsedCache.answer === 'string' ? parsedCache.answer : ''
    const sources = Array.isArray(parsedCache.sources)
      ? parsedCache.sources.filter((source): source is AskAiSource => (
          Boolean(source) &&
          typeof source === 'object' &&
          typeof (source as AskAiSource).title === 'string' &&
          typeof (source as AskAiSource).url === 'string'
        ))
      : []
    const answerError = typeof parsedCache.answerError === 'string' ? parsedCache.answerError : null
    const isSubmitting = parsedCache.isSubmitting === true
    const usageStatus =
      parsedCache.usageStatus &&
      typeof parsedCache.usageStatus === 'object' &&
      typeof (parsedCache.usageStatus as AskAiUsageStatus).usageType === 'string' &&
      typeof (parsedCache.usageStatus as AskAiUsageStatus).allowed === 'boolean' &&
      typeof (parsedCache.usageStatus as AskAiUsageStatus).limit === 'number' &&
      typeof (parsedCache.usageStatus as AskAiUsageStatus).used === 'number' &&
      typeof (parsedCache.usageStatus as AskAiUsageStatus).remaining === 'number' &&
      typeof (parsedCache.usageStatus as AskAiUsageStatus).resetAt === 'string'
        ? parsedCache.usageStatus as AskAiUsageStatus
        : null

    return {
      question,
      answer,
      sources,
      answerError,
      usageStatus,
      isSubmitting,
      jobId: typeof parsedCache.jobId === 'string' ? parsedCache.jobId : null,
      jobStatus:
        parsedCache.jobStatus === 'pending' ||
        parsedCache.jobStatus === 'streaming' ||
        parsedCache.jobStatus === 'completed' ||
        parsedCache.jobStatus === 'failed' ||
        parsedCache.jobStatus === 'cancelled'
          ? parsedCache.jobStatus
          : null,
      messages: Array.isArray(parsedCache.messages)
        ? (parsedCache.messages as ChatMessage[]).filter(
            (m) =>
              m &&
              typeof m === 'object' &&
              (m.role === 'user' || m.role === 'assistant') &&
              typeof m.content === 'string'
          )
        : [],
    }
  } catch (error) {
    console.warn('Unable to restore cached Ask AI state:', error)
    return null
  }
}

function writeAskAiRouteCache(cache: AskAiRouteCache) {
  try {
    writePersistentStorage(askAiRouteCacheKey, JSON.stringify(cache))
  } catch (error) {
    console.warn('Unable to cache Ask AI state:', error)
  }
}

function clearAskAiRouteCache() {
  try {
    removePersistentStorage(askAiRouteCacheKey)
  } catch (error) {
    console.warn('Unable to clear cached Ask AI state:', error)
  }
}

function clearAllSearchRouteCaches() {
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      const toRemove: string[] = []

      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i)
        if (key && key.startsWith(searchRouteCachePrefix)) {
          toRemove.push(key)
        }
      }

      toRemove.forEach((key) => storage.removeItem(key))
    } catch {
      // Storage can be unavailable in private browsing or restricted webviews.
    }
  }
}

function readFiltersCache(): FiltersCache | null {
  try {
    const rawCache = window.localStorage.getItem(filtersCacheKey)

    if (!rawCache) {
      return null
    }

    const parsedCache = JSON.parse(rawCache) as Partial<FiltersCache>
    if (
      typeof parsedCache.cachedAt !== 'number' ||
      !Number.isFinite(parsedCache.cachedAt) ||
      Date.now() - parsedCache.cachedAt > FILTERS_CACHE_TTL_MS
    ) {
      window.localStorage.removeItem(filtersCacheKey)
      return null
    }

    const categories = Array.isArray(parsedCache.categories)
      ? parsedCache.categories.filter(
          (category): category is CategoryChip =>
            Boolean(category) &&
            typeof category === 'object' &&
            typeof category.id === 'string' &&
            typeof category.name === 'string'
        )
      : []
    const areas = Array.isArray(parsedCache.areas)
      ? parsedCache.areas.filter(
          (area): area is AreaChip =>
            Boolean(area) &&
            typeof area === 'object' &&
            typeof area.id === 'string' &&
            typeof area.name === 'string' &&
            (area.type === 'all' || area.type === 'city' || area.type === 'municipality')
        )
      : []

    if (categories.length === 0 && areas.length === 0) {
      return null
    }

    return {
      categories,
      areas,
      cachedAt: parsedCache.cachedAt,
    }
  } catch {
    return null
  }
}

function writeFiltersCache(cache: FiltersCache) {
  try {
    window.localStorage.setItem(filtersCacheKey, JSON.stringify(cache))
  } catch {
    // Storage can be unavailable in private browsing or restricted webviews.
  }
}

function getSearchPlaceSelector(placeId: string) {
  const escapedPlaceId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(placeId)
    : placeId.replace(/["\\]/g, '\\$&')

  return `[data-search-place-id="${escapedPlaceId}"]`
}

function getSearchPlaceViewportTop(placeId: string) {
  return document.querySelector<HTMLElement>(getSearchPlaceSelector(placeId))?.getBoundingClientRect().top ?? null
}

function runWithInstantScroll(callback: () => void) {
  const html = document.documentElement
  const body = document.body
  const previousHtmlScrollBehavior = html.style.scrollBehavior
  const previousBodyScrollBehavior = body.style.scrollBehavior

  html.style.scrollBehavior = 'auto'
  body.style.scrollBehavior = 'auto'

  callback()

  html.style.scrollBehavior = previousHtmlScrollBehavior
  body.style.scrollBehavior = previousBodyScrollBehavior
}

function restoreSearchRouteScroll(cache: SearchRouteCache, desktopResultsScrollRef: RefObject<HTMLElement | null>) {
  const targetScrollY = Math.max(cache.scrollY, 0)
  const targetDesktopScrollTop = Math.max(cache.desktopScrollTop, 0)
  const targetPlaceId = cache.selectedPlaceId
  const targetPlaceViewportTop = cache.selectedPlaceViewportTop

  const restore = () => {
    runWithInstantScroll(() => {
      window.scrollTo({
        top: targetScrollY,
        left: 0,
        behavior: 'auto',
      })

      const desktopResultsScroll = desktopResultsScrollRef.current
      const previousDesktopScrollBehavior = desktopResultsScroll?.style.scrollBehavior

      if (desktopResultsScroll) {
        desktopResultsScroll.style.scrollBehavior = 'auto'
        desktopResultsScroll.scrollTo({
          top: targetDesktopScrollTop,
          behavior: 'auto',
        })
        desktopResultsScroll.style.scrollBehavior = previousDesktopScrollBehavior ?? ''
      }

      if (targetPlaceId && targetPlaceViewportTop !== null) {
        const targetCard = document.querySelector<HTMLElement>(getSearchPlaceSelector(targetPlaceId))

        if (targetCard) {
          const cardViewportTop = targetCard.getBoundingClientRect().top
          const offsetDelta = cardViewportTop - targetPlaceViewportTop

          if (Math.abs(offsetDelta) > 1) {
            window.scrollBy({
              top: offsetDelta,
              left: 0,
              behavior: 'auto',
            })
          }
        }
      }
    })
  }

  restore()
  window.requestAnimationFrame(restore)
  window.requestAnimationFrame(() => window.requestAnimationFrame(restore))
  window.setTimeout(restore, 120)
  window.setTimeout(restore, 320)
}

function isSearchResultsRoute() {
  return window.location.pathname === '/search' || window.location.pathname === '/search/'
}

function updateSearchPageUrl({
  query,
  categoryValue,
  areaId,
  goodFor,
  budget,
  page,
}: {
  query: string
  categoryValue: string | null
  areaId: string | null
  goodFor: SearchGoodForValue | null
  budget: BudgetValue | null
  page: number
}) {
  if (!isSearchResultsRoute()) {
    return
  }

  const nextUrl = buildSearchPath({
    q: query,
    category: categoryValue,
    city: areaId,
    goodFor,
    budget,
    page,
  })
  if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
    window.history.pushState(window.history.state, '', nextUrl)
  }
}

const fallbackCategories = [
  { id: 'kainan', name: 'Kainan' },
  { id: 'cafe', name: 'Cafe' },
  { id: 'mall', name: 'Mall' },
  { id: 'parke', name: 'Parke' },
  { id: 'nature', name: 'Nature' },
  { id: 'museum', name: 'Museum' },
  { id: 'heritage', name: 'Heritage' },
  { id: 'tourist', name: 'Tourist' },
  { id: 'activity', name: 'Activity' },
  { id: 'cinema', name: 'Cinema' },
  { id: 'nightlife', name: 'Nightlife' },
  { id: 'stay', name: 'Stay' },
]

const fallbackGoodForOptions: GoodForChip[] = [
  { id: 'date', name: 'Date' },
  { id: 'barkada', name: 'Barkada' },
  { id: 'family', name: 'Family' },
  { id: 'study', name: 'Study' },
  { id: 'chill', name: 'Chill' },
]

const fallbackAreas: AreaChip[] = [
  { id: 'all', name: 'All areas', type: 'all' },
  { id: 'caloocan', name: 'Caloocan', type: 'city' },
  { id: 'las-pinas', name: 'Las Piñas', type: 'city' },
  { id: 'makati', name: 'Makati', type: 'city' },
  { id: 'malabon', name: 'Malabon', type: 'city' },
  { id: 'mandaluyong', name: 'Mandaluyong', type: 'city' },
  { id: 'manila', name: 'Manila', type: 'city' },
  { id: 'marikina', name: 'Marikina', type: 'city' },
  { id: 'muntinlupa', name: 'Muntinlupa', type: 'city' },
  { id: 'navotas', name: 'Navotas', type: 'city' },
  { id: 'paranaque', name: 'Parañaque', type: 'city' },
  { id: 'pasay', name: 'Pasay', type: 'city' },
  { id: 'pasig', name: 'Pasig', type: 'city' },
  { id: 'quezon-city', name: 'Quezon City', type: 'city' },
  { id: 'san-juan', name: 'San Juan', type: 'city' },
  { id: 'taguig', name: 'Taguig', type: 'city' },
  { id: 'valenzuela', name: 'Valenzuela', type: 'city' },
  { id: 'pateros', name: 'Pateros', type: 'municipality' },
]

const budgetOptions: BudgetOption[] = [
  { value: 'free', label: 'Free' },
  { value: 'under-500', label: 'Under ₱500' },
  { value: '500-1000', label: '₱500-₱1,000' },
  { value: '1000-2000', label: '₱1,000-₱2,000' },
  { value: '2000-plus', label: '₱2,000+' },
]

function normalizeSearchText(value: string) {
  return normalizeTypedSearchText(value)
}

function pluralizeCategoryLabel(label: string) {
  const normalized = label.trim().toLowerCase()

  if (normalized === 'cafe') return 'cafes'
  if (normalized === 'cinema') return 'cinemas'
  if (normalized === 'nightlife') return 'nightlife places'
  if (normalized === 'heritage') return 'heritage places'
  if (normalized === 'tourist') return 'tourist places'
  if (normalized === 'activity') return 'activity places'
  if (normalized === 'stay') return 'stay places'
  if (normalized === 'nature') return 'nature places'
  if (normalized.endsWith('s')) return normalized

  return `${normalized}s`
}

function buildSearchSentence({
  categoryLabel,
  areaName,
  budgetLabel,
}: {
  categoryLabel: string | null
  areaName: string | null
  budgetLabel: string | null
}) {
  const categoryPart = categoryLabel ? pluralizeCategoryLabel(categoryLabel) : 'places'
  const areaPart = areaName ? ` in ${areaName}` : ''

  if (!budgetLabel) {
    return `Showing ${categoryPart}${areaPart}`
  }

  return `Showing ${categoryPart}${areaPart} around ${budgetLabel.toLowerCase()}`
}

function pluralizeGoodForLabel(label: string) {
  const normalized = label.trim().toLowerCase()

  if (normalized === 'family') return 'families'
  if (normalized === 'study') return 'study sessions'

  return `${normalized}s`
}

function buildSearchResultSummary({
  count,
  rawQuery,
  categoryLabel,
  areaName,
  goodForLabel,
  budgetLabel,
}: {
  count: number
  rawQuery: string
  categoryLabel: string | null
  areaName: string | null
  goodForLabel: string | null
  budgetLabel: string | null
}) {
  const trimmedQuery = normalizeSearchText(rawQuery)
  const heading = `Found ${count} ${categoryLabel ? pluralizeCategoryLabel(categoryLabel) : 'places'}`
  const subheadingParts: string[] = []

  if (trimmedQuery) {
    subheadingParts.push(`for "${trimmedQuery}"`)
  }

  if (goodForLabel) {
    subheadingParts.push(`good for ${pluralizeGoodForLabel(goodForLabel)}`)
  }

  if (areaName) {
    subheadingParts.push(`in ${areaName}`)
  } else if (!trimmedQuery) {
    subheadingParts.push('in GalaTayo')
  }

  if (budgetLabel) {
    subheadingParts.push(budgetLabel === 'Free' ? 'free entry' : budgetLabel)
  }

  return {
    heading,
    subheading: subheadingParts.join(' '),
  }
}

function buildFilterSearchText({
  rawQuery,
  categoryLabel,
  areaName,
  goodForLabel,
  budgetLabel,
}: {
  rawQuery: string
  categoryLabel: string | null
  areaName: string | null
  goodForLabel: string | null
  budgetLabel: string | null
}) {
  const filterParts: string[] = []

  if (categoryLabel) {
    filterParts.push(pluralizeCategoryLabel(categoryLabel))
  }

  if (goodForLabel) {
    filterParts.push(`good for ${pluralizeGoodForLabel(goodForLabel)}`)
  }

  if (areaName) {
    filterParts.push(`in ${areaName}`)
  }

  if (budgetLabel) {
    filterParts.push(budgetLabel)
  }

  if (filterParts.length > 0) {
    return filterParts.join(' ')
  }

  return normalizeSearchText(rawQuery)
}

async function getSearchRequestHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const accessToken = session?.access_token

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }

  return headers
}

function parseCoordinate(value: number | string | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsedValue = Number(value)

    if (Number.isFinite(parsedValue)) {
      return parsedValue
    }
  }

  return null
}

function formatMarkerRatingText(value: number | string | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value.toFixed(1)
  }

  if (typeof value === 'string') {
    const trimmedValue = value.trim()

    if (!trimmedValue) {
      return null
    }

    const numericValue = Number(trimmedValue)
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue.toFixed(1) : trimmedValue
  }

  return null
}

function mapBackendPlaceToCard(place: BackendSearchPlace): PlaceCardData | null {
  const lat = parseCoordinate(place.latitude)
  const lng = parseCoordinate(place.longitude)
  const name = place.name?.trim()

  if (
    !name ||
    lat === null ||
    lng === null ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null
  }

  const area = place.location || place.address || place.city || place.area || 'Metro Manila'
  const reviewCount =
    place.reviewCount === null || place.reviewCount === undefined ? undefined : String(place.reviewCount)
  const curatedImageUrls = Array.isArray(place.curatedImageUrls)
    ? place.curatedImageUrls.filter((imageUrl): imageUrl is string => Boolean(imageUrl?.trim()))
    : []
  const categories = Array.isArray(place.categories) ? place.categories : []
  const tags = Array.isArray(place.tags) ? place.tags : []
  const matchedCategories = Array.isArray(place.matchedCategories) ? place.matchedCategories : []
  const matchedTags = Array.isArray(place.matchedTags) ? place.matchedTags : []
  const goodFor = Array.isArray(place.good_for) ? place.good_for.filter((item): item is string => Boolean(item?.trim())) : []
  const notIdealFor = Array.isArray(place.not_ideal_for) ? place.not_ideal_for.filter((item): item is string => Boolean(item?.trim())) : []

  return {
    id: String(place.id || place.slug || name),
    slug: place.slug || undefined,
    name,
    category: place.category || 'Place',
    area,
    address: place.address || null,
    city: place.city || null,
    localArea: place.area || null,
    rating: typeof place.rating === 'number' ? place.rating : parseCoordinate(place.rating),
    reviewCount,
    status: 'Unknown',
    reason: place.reason || place.description || place.address || 'Real place result from GalaTayo search.',
    description: place.description || null,
    badge: place.category || 'Place',
    imageUrl: place.imageUrl || null,
    thumbnailUrl: place.thumbnailUrl || null,
    imageAlt: place.imageAlt || null,
    curatedImageUrls,
    categories,
    tags,
    matchedCategories,
    matchedTags,
    markerRatingText: formatMarkerRatingText(place.rating),
    place_history: place.place_history || null,
    best_time_to_visit: place.best_time_to_visit || null,
    visit_duration: place.visit_duration || null,
    good_for: goodFor,
    not_ideal_for: notIdealFor,
    crowd_level: place.crowd_level || null,
    indoor_outdoor: place.indoor_outdoor || null,
    weather_fit: place.weather_fit || null,
    parking_info: place.parking_info || null,
    accessibility_notes: place.accessibility_notes || null,
    decision_reason: place.decision_reason || null,
    commute_friendly: place.commute_friendly ?? null,
    commute_access: place.commute_access || null,
    nearby_context: place.nearby_context || null,
    budget_notes: place.budget_notes || null,
    verification_status: place.verification_status || null,
    verification_notes: place.verification_notes || null,
    verification_sources: place.verification_sources ?? [],
    last_verified_at: place.last_verified_at || null,
    website_url: place.website_url || null,
    googleMapsUrl: place.google_maps_url || null,
    distanceKm: typeof place.distanceKm === 'number' ? place.distanceKm : null,
    entranceFee: place.budget_notes || place.budget || place.budgetRange || undefined,
    website: place.website_url || undefined,
    coordinates: {
      lat,
      lng,
    },
  }
}

export type {
  BackendCategory,
  BackendArea,
  CategoryChip,
  AreaChip,
  GoodForChip,
  BudgetValue,
  BudgetOption,
  SearchMode,
  AskAiSource,
  HomePageInitialSearchState,
  HomePageProps,
  BackendSearchPlace,
  BackendSearchStatus,
  MobileResultsViewMode,
  SearchRouteCache,
  AskAiRouteCache,
  IconProps,
  FiltersCache,
}

export {
  searchRouteCachePrefix,
  askAiRouteCacheKey,
  filtersCacheKey,
  SEARCH_RESULTS_PER_PAGE,
  FILTERS_CACHE_TTL_MS,
  fallbackCategories,
  fallbackGoodForOptions,
  fallbackAreas,
  budgetOptions,
  readPersistentStorage,
  writePersistentStorage,
  removePersistentStorage,
  getCurrentSearchRouteCacheKey,
  readSearchRouteCache,
  writeSearchRouteCache,
  readAskAiRouteCache,
  writeAskAiRouteCache,
  clearAskAiRouteCache,
  clearAllSearchRouteCaches,
  readFiltersCache,
  writeFiltersCache,
  getSearchPlaceSelector,
  getSearchPlaceViewportTop,
  runWithInstantScroll,
  restoreSearchRouteScroll,
  isSearchResultsRoute,
  updateSearchPageUrl,
  normalizeSearchText,
  pluralizeCategoryLabel,
  buildSearchSentence,
  pluralizeGoodForLabel,
  buildSearchResultSummary,
  buildFilterSearchText,
  getSearchRequestHeaders,
  parseCoordinate,
  formatMarkerRatingText,
  mapBackendPlaceToCard,
}
