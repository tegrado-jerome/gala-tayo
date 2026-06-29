import { startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { Session } from '@supabase/supabase-js'
import { RotateCcw } from 'lucide-react'
import { AppIcon } from '../components/AppIcon'
import PlaceCard, { type PlaceCardData, type PlaceCategoryMeta, type PlaceTagMeta } from '../components/PlaceCard'
import AppHeader from '../components/AppHeader'
import CompactPagination from '../components/CompactPagination'
import MapView from '../components/MapView'
import GuestLimitModal from '../components/GuestLimitModal'
import GoogleSignInButton from '../components/GoogleSignInButton'
import PageHeroHeader from '../components/PageHeroHeader'
import PromptBuilderModal from '../components/PromptBuilderModal'
import TapGalaPinGame from '../components/TapGalaPinGame'
import MinimalBackNav from '../components/MinimalBackNav'
import { supabase } from '../supabase'
import { navigateToCanonicalPlace, navigateToPath } from '../utils/navigation'
import {
  getAskAiRuntimeState,
  hasActiveAskAiRuntimeState,
  resetAskAiRuntimeState,
  seedAskAiRuntimeState,
  submitAskAiRuntimeRequest,
  subscribeToAskAiRuntime,
} from '../utils/askAiRuntime'
import { buildSearchPath, normalizeTypedSearchText, type SearchBudgetValue, type SearchGoodForValue } from '../utils/searchParams'
import type { PromptBuilderState } from '../types/promptBuilder'
import { createEmptyPromptBuilderState } from '../utils/promptBuilder'
import askAiErrorChibi from '../assets/chibis/core/ask-ai/chibi-ask-ai-error.webp'
import askAiOutputChibi from '../assets/chibis/core/ask-ai/chibi-ask-ai-output.webp'
import askAiStartChibi from '../assets/chibis/core/ask-ai/chibi-ask-ai-start.webp'
import askAiThinkingChibi from '../assets/chibis/core/ask-ai/chibi-ask-ai-thinking.webp'
import protectedFeatureChibi from '../assets/chibis/shared-states/chibi-protected-feature.webp'
import searchBeforeChibi from '../assets/chibis/core/search-places/chibi-search-places-before-active-state.webp'
import searchLoadingChibi from '../assets/chibis/core/search-places/chibi-search-places-loading-state.webp'
import searchNoResultsChibi from '../assets/chibis/core/search-places/chibi-search-places-no-results.webp'
import searchSuccessChibi from '../assets/chibis/core/search-places/chibi-search-success.webp'

type IconProps = {
  className?: string
}

function PinIcon({ className = 'h-4 w-4' }: IconProps) {
  return <AppIcon name="place" className={className} />
}

function ChevronRightIcon({ className = 'h-4 w-4' }: IconProps) {
  return <AppIcon name="chevronRight" className={className} />
}

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

function FilterIcon({ className = 'h-4 w-4' }: IconProps) {
  return <AppIcon name="filter" className={className} />
}

function BudgetIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return <AppIcon name="wallet" className={`${className} text-[var(--accent-deep)]`} />
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

type SearchCategoryChoice = {
  value: string
  label: string
}

type AskAiUsageStatus = {
  usageType: 'ask_ai_total' | 'live_search'
  allowed: boolean
  limit: number
  used: number
  remaining: number
  resetAt: string
  message?: string
}

type AskAiSource = {
  title: string
  url: string
}

type AskAiUsageSummary = {
  askAi: AskAiUsageStatus
  liveSearch: AskAiUsageStatus
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
}

const searchRouteCachePrefix = 'galatayo:search-route:'
const askAiRouteCacheKey = 'galatayo:ask-ai-route'
const SEARCH_RESULTS_PER_PAGE = 10

function getCurrentSearchRouteCacheKey() {
  return `${searchRouteCachePrefix}${window.location.pathname}${window.location.search}`
}

function readSearchRouteCache(): SearchRouteCache | null {
  try {
    const rawCache = window.sessionStorage.getItem(getCurrentSearchRouteCacheKey())

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
    window.sessionStorage.setItem(getCurrentSearchRouteCacheKey(), JSON.stringify(cache))
  } catch (error) {
    console.warn('Unable to cache search route:', error)
  }
}

function readAskAiRouteCache(): AskAiRouteCache | null {
  try {
    const rawCache = window.sessionStorage.getItem(askAiRouteCacheKey)

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
    }
  } catch (error) {
    console.warn('Unable to restore cached Ask AI state:', error)
    return null
  }
}

function writeAskAiRouteCache(cache: AskAiRouteCache) {
  try {
    window.sessionStorage.setItem(askAiRouteCacheKey, JSON.stringify(cache))
  } catch (error) {
    console.warn('Unable to cache Ask AI state:', error)
  }
}

function clearAskAiRouteCache() {
  try {
    window.sessionStorage.removeItem(askAiRouteCacheKey)
  } catch (error) {
    console.warn('Unable to clear cached Ask AI state:', error)
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

const searchCategoryChoices: SearchCategoryChoice[] = [
  { value: 'kainan', label: 'Kainan' },
  { value: 'cafe', label: 'Cafe' },
  { value: 'mall', label: 'Mall' },
  { value: 'parke', label: 'Parke' },
  { value: 'nature', label: 'Nature' },
  { value: 'museum', label: 'Museum' },
  { value: 'heritage', label: 'Heritage' },
  { value: 'tourist', label: 'Tourist' },
  { value: 'activity', label: 'Activity' },
  { value: 'cinema', label: 'Cinema' },
  { value: 'nightlife', label: 'Nightlife' },
  { value: 'stay', label: 'Stay' },
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

function buildGuidedComposerQuery({
  rawQuery,
  categoryLabel,
  areaName,
  budgetLabel,
}: {
  rawQuery: string
  categoryLabel: string | null
  areaName: string | null
  budgetLabel: string | null
}) {
  const trimmedQuery = normalizeSearchText(rawQuery)
  const parts: string[] = []

  if (trimmedQuery) {
    parts.push(trimmedQuery)
  }

  if (categoryLabel) {
    parts.push(categoryLabel.toLowerCase())
  }

  if (areaName) {
    parts.push(`in ${areaName}`)
  }

  if (budgetLabel) {
    parts.push(`for ${budgetLabel.toLowerCase()}`)
  }

  return normalizeSearchText(parts.join(' '))
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

function SearchEmptyState({
  hasSearched,
  onSearchAgain,
  showBackHome = false,
}: {
  hasSearched: boolean
  onSearchAgain?: () => void
  showBackHome?: boolean
}) {
  return (
    <div
      className={`bg-white text-center ${
        hasSearched
          ? 'px-2 py-3 sm:px-4 sm:py-5'
          : 'rounded-lg border border-dashed border-[var(--line)] px-4 py-6'
      }`}
    >
      {hasSearched ? (
        <img
          src={searchNoResultsChibi}
          alt=""
          className="mx-auto -mb-4 -mt-4 h-72 w-72 scale-[1.62] object-contain object-center sm:h-80 sm:w-80 sm:scale-[1.68]"
          loading="lazy"
        />
      ) : (
        <img
          src={searchBeforeChibi}
          alt=""
          className="mx-auto mb-3 h-28 w-28 object-contain"
          loading="lazy"
        />
      )}
      <p className={hasSearched ? 'text-2xl font-black text-slate-900' : 'text-sm font-semibold text-slate-900'}>
        {hasSearched ? 'No places found' : 'Saan tayo gala today?'}
      </p>
      <p
        className={
          hasSearched
            ? 'mx-auto mt-2 max-w-[18rem] text-sm leading-relaxed text-[var(--muted)] sm:max-w-[22rem] sm:text-base'
            : 'mt-1 text-xs leading-relaxed text-[var(--muted)]'
        }
      >
        {hasSearched
          ? 'Try another city, category, vibe, or budget.'
          : 'Type a place, or pick a vibe to start exploring Metro Manila.'}
      </p>
      {hasSearched ? (
        <div className="mt-5 flex justify-center">
          {onSearchAgain ? (
            <button
              type="button"
              onClick={onSearchAgain}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:border-[var(--accent)] hover:text-[var(--accent-deep)]"
            >
              <RotateCcw className="h-4 w-4" />
              Search again
            </button>
          ) : null}
        </div>
      ) : null}
      {hasSearched ? (
        <div className="mx-auto mt-6 max-w-[340px] rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5 text-center sm:max-w-[380px]">
          <p className="text-lg font-black text-slate-950">Want to add a place?</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Suggest a place and we'll review it before adding it to GalaTayo.
          </p>
          <button
            type="button"
            onClick={() => navigateToPath('/submit-place')}
            className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--accent)] bg-white px-5 text-sm font-black text-[var(--accent-deep)] transition hover:bg-[var(--accent-wash)]"
          >
            <AppIcon name="place" className="h-5 w-5" />
            Submit a Place
          </button>
        </div>
      ) : null}
      {showBackHome ? (
        <div className="mt-3 flex justify-center">
          <BackToHomeButton />
        </div>
      ) : null}
    </div>
  )
}

function SparkIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return <AppIcon name="askAi" className={className} />
}

function HeartOutlineIcon({ className = 'h-4 w-4' }: IconProps) {
  return <AppIcon name="favorites" className={className} />
}

function CafeIcon({ className = 'h-4 w-4' }: IconProps) {
  return <AppIcon name="cafe" className={className} />
}

function MuseumIcon({ className = 'h-4 w-4' }: IconProps) {
  return <AppIcon name="categoryMuseum" className={className} />
}

function BuildingIcon({ className = 'h-4 w-4' }: IconProps) {
  return <AppIcon name="categoryHeritage" className={className} />
}

function BackToHomeButton({
  className = '',
}: {
  className?: string
}) {
  return (
    <MinimalBackNav to="/" className={className} />
  )
}

function SkeletonLine({ className = '' }: { className?: string }) {
  return (
    <span
      className={`block rounded-full bg-[linear-gradient(90deg,#eef2f7_0%,#dbe2ea_42%,#f4f7fa_78%)] bg-[length:220%_100%] motion-safe:animate-[gala-skeleton-shimmer_1.6s_ease-in-out_infinite] ${className}`}
      aria-hidden="true"
    />
  )
}

function SearchLoadingCard({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="rounded-xl border border-[var(--line-strong)] bg-white/86 p-3 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
        <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-4">
          <div className="flex aspect-[1.18] items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-400">
            <svg viewBox="0 0 96 76" fill="none" stroke="currentColor" strokeWidth="2" className="h-20 w-24">
              <rect x="5" y="5" width="86" height="66" rx="6" />
              <path d="m6 60 27-28 23 23 15-17 20 22" />
              <circle cx="58" cy="26" r="7" />
            </svg>
          </div>
          <div className="min-w-0 pt-1">
            <SkeletonLine className="h-4 w-[92%]" />
            <SkeletonLine className="mt-4 h-3.5 w-[48%]" />
            <div className="mt-5 flex items-center gap-3">
              <PinIcon className="h-5 w-5 text-slate-400" />
              <SkeletonLine className="h-3 w-[46%]" />
              <span className="h-1 w-1 rounded-full bg-slate-300" />
              <SkeletonLine className="h-3 w-[26%]" />
            </div>
            <SkeletonLine className="mt-5 h-3 w-[66%]" />
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-3">
          <SkeletonLine className="mx-auto h-3 w-[28%]" />
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-[var(--line-strong)] bg-white/86 px-5 py-5 shadow-[0_14px_32px_rgba(15,23,42,0.035)]">
      <div className="grid grid-cols-[176px_minmax(0,1fr)_148px] items-center gap-8">
        <div className="h-[150px] rounded-lg bg-[linear-gradient(135deg,#eef2f7,#e2e8f0)]" />
        <div className="min-w-0">
          <div className="flex items-center gap-5">
            <span className="h-12 w-12 rounded-full bg-[linear-gradient(135deg,#eef2f7,#dfe6ee)]" aria-hidden="true" />
            <SkeletonLine className="h-4 w-[28%]" />
          </div>
          <SkeletonLine className="mt-6 h-5 w-[44%]" />
          <SkeletonLine className="mt-7 h-3 w-[58%]" />
          <SkeletonLine className="mt-4 h-3 w-[45%]" />
          <div className="mt-6 flex flex-wrap items-center gap-4 text-slate-400">
            <PinIcon className="h-5 w-5" />
            <SkeletonLine className="h-3 w-20" />
            <span className="h-1 w-1 rounded-full bg-slate-300" />
            <BudgetIcon className="h-5 w-5 text-slate-400" />
            <SkeletonLine className="h-3 w-16" />
            <span className="h-1 w-1 rounded-full bg-slate-300" />
            <SparkIcon className="h-5 w-5" />
            <SkeletonLine className="h-3 w-16" />
          </div>
        </div>
        <div className="h-16 rounded-lg bg-[linear-gradient(135deg,#eef2f7,#e2e8f0)]" />
      </div>
    </div>
  )
}

function ChibiPlaceholder({
  className = '',
  src = searchLoadingChibi,
  imageClassName = '',
}: {
  className?: string
  src?: string
  imageClassName?: string
  showBubble?: boolean
}) {
  return (
    <div className={`relative mx-auto flex items-center justify-center overflow-hidden ${className}`} aria-hidden="true">
      <img
        src={src}
        alt=""
        className={`h-full w-full object-contain ${imageClassName}`}
        loading="eager"
      />
    </div>
  )
}

function SearchLoadingState({ searchLabel }: { searchLabel: string }) {
  const displayLabel = searchLabel.trim() || 'gala spots in Metro Manila'

  return (
    <section className="min-h-0 w-full px-5 py-7 sm:px-8 lg:px-12 lg:py-12">
      <div className="mx-auto grid w-full max-w-[1440px] gap-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-12">
        <aside className="text-center lg:pt-4 lg:text-left">
          <p className="text-[26px] font-extrabold leading-tight text-slate-800 sm:text-[30px] lg:text-[32px]">Searching for</p>
          <h1 className="mt-3 text-[32px] font-black leading-tight text-slate-950 sm:text-[38px] lg:text-[38px]">
            {displayLabel}
          </h1>
          <ChibiPlaceholder
            className="mt-7 h-[280px] w-full max-w-[320px] sm:h-[340px] sm:max-w-[360px] lg:h-[380px] lg:max-w-[390px]"
            imageClassName="scale-[1.35] sm:scale-[1.42] lg:scale-[1.48]"
          />
          <p className="mx-auto mt-5 max-w-[360px] text-lg font-semibold leading-relaxed text-slate-600 lg:mx-4">
            Finding gala spots around Metro Manila.
          </p>
        </aside>

        <div className="grid content-start gap-5 lg:pt-4">
          <div className="grid gap-4 lg:hidden">
            <SearchLoadingCard compact />
            <SearchLoadingCard compact />
            <p className="pt-4 text-center text-base font-semibold text-slate-400">
              Konting hintay, naghahanap ng sulit spots...
            </p>
          </div>
          <div className="hidden gap-6 lg:grid">
            <SearchLoadingCard />
            <SearchLoadingCard />
            <SearchLoadingCard />
          </div>
        </div>
      </div>
    </section>
  )
}

type MobileResultsViewMode = 'cards' | 'map'

function ListIcon({ className = 'h-4 w-4' }: IconProps) {
  return <AppIcon name="list" className={className} />
}

function MapOutlineIcon({ className = 'h-4 w-4' }: IconProps) {
  return <AppIcon name="map" className={className} />
}

function ClearIcon({ className = 'h-4 w-4' }: IconProps) {
  return <AppIcon name="clear" className={className} />
}

function SearchResetButton({
  onClick,
  layout = 'mobile',
}: {
  onClick: () => void
  layout?: 'mobile' | 'desktop'
}) {
  const className = layout === 'desktop'
    ? 'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-[var(--line)] bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900'
    : 'inline-flex h-10 w-full items-center justify-between rounded-xl border border-[var(--line)] bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900'

  if (layout === 'desktop') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={className}
      >
        <ClearIcon className="h-4 w-4" />
        <span>Clear search</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
    >
      <span className="inline-flex items-center gap-2">
        <ClearIcon className="h-4 w-4" />
        <span>Clear search</span>
      </span>
      <span className="text-xs uppercase tracking-[0.08em] text-slate-400">
        Reset
      </span>
    </button>
  )
}

function ActiveSearchChips({
  cityLabel,
  categoryLabel,
  goodForLabel,
  budgetLabel,
  onRemoveCity,
  onRemoveCategory,
  onRemoveGoodFor,
  onRemoveBudget,
}: {
  cityLabel: string | null
  categoryLabel: string | null
  goodForLabel: string | null
  budgetLabel: string | null
  onRemoveCity: () => void
  onRemoveCategory: () => void
  onRemoveGoodFor: () => void
  onRemoveBudget: () => void
}) {
  const chips = [
    cityLabel ? { key: 'city', label: cityLabel, onRemove: onRemoveCity } : null,
    categoryLabel ? { key: 'category', label: categoryLabel, onRemove: onRemoveCategory } : null,
    goodForLabel ? { key: 'good_for', label: `Good for ${goodForLabel.toLowerCase()}`, onRemove: onRemoveGoodFor } : null,
    budgetLabel ? { key: 'budget', label: budgetLabel, onRemove: onRemoveBudget } : null,
  ].filter(Boolean) as Array<{ key: string; label: string; onRemove: () => void }>

  if (chips.length === 0) {
    return null
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-black text-slate-700 transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)] hover:text-[var(--accent-deep)]"
        >
          <span>{chip.label}</span>
          <AppIcon name="clear" className="h-3 w-3" />
        </button>
      ))}
    </div>
  )
}

function MobileResultIntro({
  heading,
  subheading,
  cityLabel,
  categoryLabel,
  goodForLabel,
  budgetLabel,
  isRefreshing,
  onClearSearch,
  onRemoveCity,
  onRemoveCategory,
  onRemoveGoodFor,
  onRemoveBudget,
  showBackHome,
}: {
  heading: string
  subheading: string
  cityLabel: string | null
  categoryLabel: string | null
  goodForLabel: string | null
  budgetLabel: string | null
  isRefreshing: boolean
  onClearSearch: () => void
  onRemoveCity: () => void
  onRemoveCategory: () => void
  onRemoveGoodFor: () => void
  onRemoveBudget: () => void
  showBackHome: boolean
}) {
  return (
    <>
      <section className="px-4 pb-4 pt-5">
        {showBackHome ? <BackToHomeButton className="mb-3" /> : null}
        <h1 className="text-2xl font-black leading-tight text-slate-950">{heading}</h1>
        <p className="mt-1 text-lg font-semibold leading-tight text-slate-800">{subheading}</p>
        <ActiveSearchChips
          cityLabel={cityLabel}
          categoryLabel={categoryLabel}
          goodForLabel={goodForLabel}
          budgetLabel={budgetLabel}
          onRemoveCity={onRemoveCity}
          onRemoveCategory={onRemoveCategory}
          onRemoveGoodFor={onRemoveGoodFor}
          onRemoveBudget={onRemoveBudget}
        />
        {isRefreshing ? (
          <p className="mt-2 inline-flex rounded-full border border-[rgba(47,116,232,0.12)] bg-white/90 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--accent-deep)]">
            Refreshing results...
          </p>
        ) : null}
        <div className="mt-3 flex h-64 justify-center overflow-hidden">
          <img
            src={searchSuccessChibi}
            alt=""
            className="h-64 w-auto max-w-none shrink-0 scale-[1.22] object-contain"
            loading="eager"
            aria-hidden="true"
          />
        </div>
      </section>

      <section className="px-4">
        <SearchResetButton onClick={onClearSearch} />
      </section>
    </>
  )
}

function SearchPagination({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  isLoading = false,
  compact = false,
  onPageChange,
}: {
  currentPage: number
  totalPages: number
  totalCount: number
  pageSize: number
  isLoading?: boolean
  compact?: boolean
  onPageChange: (page: number) => void
}) {
  if (totalCount <= 0) {
    return null
  }

  return (
    <CompactPagination
      currentPage={currentPage}
      totalPages={totalPages}
      totalItems={totalCount}
      pageSize={pageSize}
      onPageChange={onPageChange}
      isLoading={isLoading}
      className={compact ? 'max-w-[360px] self-center pt-2' : 'pt-2'}
    />
  )

  const start = (currentPage - 1) * pageSize + 1
  const end = Math.min(currentPage * pageSize, totalCount)
  const maxVisible = compact ? 5 : 7
  const pages = new Set<number>([1, totalPages, currentPage])

  for (let offset = 1; pages.size < maxVisible && offset < totalPages; offset += 1) {
    const before = currentPage - offset
    const after = currentPage + offset
    if (before > 1) pages.add(before)
    if (pages.size < maxVisible && after < totalPages) pages.add(after)
  }

  const sortedPages = Array.from(pages).sort((left, right) => left - right)
  const items: Array<number | 'ellipsis'> = []

  sortedPages.forEach((pageNumber, index) => {
    if (index > 0 && pageNumber - sortedPages[index - 1] > 1) {
      items.push('ellipsis')
    }
    items.push(pageNumber)
  })

  return (
    <div className="flex flex-col items-center gap-3 pt-2">
      <p className="text-xs font-semibold text-slate-400">
        Showing {start}-{end} of {totalCount} places
      </p>

      <div className="flex items-center justify-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1 || isLoading}
          aria-label="Previous page"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-base font-black text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35"
        >
          ‹
        </button>

        {items.map((item, index) =>
          item === 'ellipsis' ? (
            <span key={`ellipsis-${index}`} className="px-1 text-sm font-bold text-slate-400">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              disabled={isLoading}
              aria-current={item === currentPage ? 'page' : undefined}
              className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-black transition ${
                item === currentPage
                  ? 'bg-slate-950 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
              }`}
            >
              {item}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages || isLoading}
          aria-label="Next page"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-base font-black text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35"
        >
          ›
        </button>
      </div>

      {isLoading ? <p className="text-[11px] font-semibold text-slate-400">Loading page...</p> : null}
    </div>
  )
}

function MobileResultsTabs({
  selectedView,
  onViewChange,
}: {
  selectedView: MobileResultsViewMode
  onViewChange: (view: MobileResultsViewMode) => void
}) {
  const itemClass = (isSelected: boolean) =>
    `inline-flex h-11 items-center justify-center gap-2 rounded-md text-sm font-black transition ${
      isSelected
        ? 'bg-slate-900 text-white shadow-[0_10px_20px_rgba(15,23,42,0.12)]'
        : 'bg-white text-slate-950'
    }`

  return (
    <section className="mx-4 mt-4 grid grid-cols-2 rounded-md border border-[var(--line)] bg-white p-0.5">
      <button type="button" onClick={() => onViewChange('cards')} className={itemClass(selectedView === 'cards')}>
        <ListIcon className="h-4 w-4" />
        Cards
      </button>
      <button type="button" onClick={() => onViewChange('map')} className={itemClass(selectedView === 'map')}>
        <MapOutlineIcon className="h-4 w-4" />
        Map
      </button>
    </section>
  )
}

function MobileResultsView({
  places,
  totalCount,
  currentPage,
  totalPages,
  selectedPlace,
  selectedPlaceId,
  heading,
  subheading,
  cityLabel,
  categoryLabel,
  goodForLabel,
  budgetLabel,
  isRefreshing,
  isPageLoading,
  showBackHome,
  selectedView,
  onViewChange,
  onPageChange,
  onSelectPlace,
  onViewDetails,
  onClearSearch,
  onRemoveCity,
  onRemoveCategory,
  onRemoveGoodFor,
  onRemoveBudget,
}: {
  places: PlaceCardData[]
  totalCount: number
  currentPage: number
  totalPages: number
  selectedPlace: PlaceCardData | null
  selectedPlaceId: string | null
  heading: string
  subheading: string
  cityLabel: string | null
  categoryLabel: string | null
  goodForLabel: string | null
  budgetLabel: string | null
  isRefreshing: boolean
  isPageLoading: boolean
  showBackHome: boolean
  selectedView: MobileResultsViewMode
  onViewChange: (view: MobileResultsViewMode) => void
  onPageChange: (page: number) => void
  onSelectPlace: (placeId: string) => void
  onViewDetails: (placeId: string) => void
  onClearSearch: () => void
  onRemoveCity: () => void
  onRemoveCategory: () => void
  onRemoveGoodFor: () => void
  onRemoveBudget: () => void
}) {
  return (
    <section className="mx-auto w-full max-w-[480px]">
      <MobileResultIntro
        heading={heading}
        subheading={subheading}
        cityLabel={cityLabel}
        categoryLabel={categoryLabel}
        goodForLabel={goodForLabel}
        budgetLabel={budgetLabel}
        isRefreshing={isRefreshing}
        onClearSearch={onClearSearch}
        onRemoveCity={onRemoveCity}
        onRemoveCategory={onRemoveCategory}
        onRemoveGoodFor={onRemoveGoodFor}
        onRemoveBudget={onRemoveBudget}
        showBackHome={showBackHome}
      />
      <MobileResultsTabs selectedView={selectedView} onViewChange={onViewChange} />

      {selectedView === 'cards' ? (
        <section className="grid gap-3 px-4 py-4">
          {isPageLoading ? (
            <div className="px-1 text-center text-[11px] font-semibold text-slate-400">
              Loading page...
            </div>
          ) : null}
          <div className={`grid gap-3 transition ${isPageLoading ? 'pointer-events-none opacity-60' : 'opacity-100'}`}>
            {places.map((place) => (
              <PlaceCard
                key={place.id}
                place={place}
                isSelected={selectedPlaceId === place.id}
                compact
                searchResultCard
                dataSearchPlaceId={place.id}
                onSelect={onSelectPlace}
                onOpen={onViewDetails}
              />
            ))}
          </div>
          <p className="text-center text-xs font-semibold text-slate-500">
            Switch to Map to see your selected place.
          </p>
          <SearchPagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={SEARCH_RESULTS_PER_PAGE}
            isLoading={isPageLoading}
            compact
            onPageChange={onPageChange}
          />
        </section>
      ) : (
        <section className="px-4 py-4">
          <div className="overflow-hidden rounded-lg border border-[var(--line)] bg-white">
            <MapView
              places={places}
              selectedPlaceId={selectedPlaceId}
              onPlaceSelect={onSelectPlace}
              onPlaceOpen={onViewDetails}
              autoFitToPlaces
              className="!h-[360px] !rounded-none !border-0"
            />
          </div>

          {selectedPlace ? (
            <section className="mt-4">
              <h2 className="mb-2 text-base font-black text-slate-950">Selected place</h2>
              <PlaceCard
                place={selectedPlace}
                compact
                searchResultCard
                isSelected
                onSelect={onSelectPlace}
                onOpen={onViewDetails}
              />
            </section>
          ) : null}

          <button
            type="button"
            onClick={() => onViewChange('cards')}
            className="mt-5 inline-flex items-center gap-2 text-sm font-black text-slate-700"
          >
            <ChevronRightIcon className="h-4 w-4 rotate-180" />
            Back to cards
          </button>
          <div className="mt-4">
            <SearchPagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalCount={totalCount}
              pageSize={SEARCH_RESULTS_PER_PAGE}
              isLoading={isPageLoading}
              compact
              onPageChange={onPageChange}
            />
          </div>
        </section>
      )}
    </section>
  )
}

function DesktopResultsView({
  places,
  totalCount,
  currentPage,
  totalPages,
  selectedPlaceId,
  heading,
  subheading,
  cityLabel,
  categoryLabel,
  goodForLabel,
  budgetLabel,
  isRefreshing,
  isPageLoading,
  showBackHome,
  scrollContainerRef,
  onSelectPlace,
  onPageChange,
  onViewDetails,
  onClearSearch,
  onRemoveCity,
  onRemoveCategory,
  onRemoveGoodFor,
  onRemoveBudget,
}: {
  places: PlaceCardData[]
  totalCount: number
  currentPage: number
  totalPages: number
  selectedPlaceId: string | null
  heading: string
  subheading: string
  cityLabel: string | null
  categoryLabel: string | null
  goodForLabel: string | null
  budgetLabel: string | null
  isRefreshing: boolean
  isPageLoading: boolean
  showBackHome: boolean
  scrollContainerRef: RefObject<HTMLElement | null>
  onSelectPlace: (placeId: string) => void
  onPageChange: (page: number) => void
  onViewDetails: (placeId: string) => void
  onClearSearch: () => void
  onRemoveCity: () => void
  onRemoveCategory: () => void
  onRemoveGoodFor: () => void
  onRemoveBudget: () => void
}) {
  return (
    <section className="gala-page-background grid h-full min-h-0 select-none overflow-hidden xl:grid-cols-[minmax(440px,560px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(500px,620px)_minmax(0,1fr)]">
      <aside ref={scrollContainerRef} className="min-h-0 overflow-y-auto overscroll-contain border-r border-[var(--line)] px-6 py-6">
        {showBackHome ? <BackToHomeButton className="mb-4" /> : null}
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-black leading-tight text-slate-950">{heading}</h1>
            <p className="mt-1 text-xl font-semibold text-slate-800">{subheading}</p>
            <ActiveSearchChips
              cityLabel={cityLabel}
              categoryLabel={categoryLabel}
              goodForLabel={goodForLabel}
              budgetLabel={budgetLabel}
              onRemoveCity={onRemoveCity}
              onRemoveCategory={onRemoveCategory}
              onRemoveGoodFor={onRemoveGoodFor}
              onRemoveBudget={onRemoveBudget}
            />
            {isRefreshing ? (
              <p className="mt-2 inline-flex rounded-full border border-[rgba(47,116,232,0.12)] bg-white/90 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--accent-deep)]">
                Refreshing results...
              </p>
            ) : null}
            {isPageLoading ? (
              <p className="mt-2 text-[11px] font-semibold text-slate-400">
                Loading page...
              </p>
            ) : null}
          </div>
          <SearchResetButton onClick={onClearSearch} layout="desktop" />
        </div>

        <div className="mt-4 flex h-80 justify-center overflow-hidden">
          <img
            src={searchSuccessChibi}
            alt=""
            className="h-80 w-auto max-w-none shrink-0 scale-[1.2] object-contain"
            loading="eager"
            aria-hidden="true"
          />
        </div>

        <div className="mx-auto mt-6 w-full max-w-[760px]">
          <div className={`grid grid-cols-1 gap-3 transition ${isPageLoading ? 'pointer-events-none opacity-60' : 'opacity-100'}`}>
            {places.map((place) => (
              <PlaceCard
                key={place.id}
                place={place}
                isSelected={selectedPlaceId === place.id}
                dataSearchPlaceId={place.id}
                onSelect={onSelectPlace}
                onOpen={onViewDetails}
              />
            ))}
          </div>
          <div className="mt-3">
            <SearchPagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalCount={totalCount}
              pageSize={SEARCH_RESULTS_PER_PAGE}
              isLoading={isPageLoading}
              onPageChange={onPageChange}
            />
          </div>
        </div>
      </aside>

      <section className="relative hidden min-h-0 overflow-hidden bg-white xl:block">
        <MapView
          places={places}
          selectedPlaceId={selectedPlaceId}
          onPlaceSelect={onSelectPlace}
          onPlaceOpen={onViewDetails}
          autoFitToPlaces
          className="!h-full !rounded-none !border-0"
        />
      </section>
    </section>
  )
}

function GuidedSearchPage({
  rawQuery,
  searchSentence,
  selectedCategoryValue,
  selectedArea,
  selectedBudget,
  areas,
  isSearching,
  showBackHome,
  validationMessage,
  searchError,
  onRawQueryChange,
  onClearSearch,
  onCategoryChange,
  onAreaChange,
  onBudgetChange,
  onSubmitSearch,
}: {
  rawQuery: string
  searchSentence: string
  selectedCategoryValue: string | null
  selectedArea: string | null
  selectedBudget: BudgetValue | null
  areas: AreaChip[]
  isSearching: boolean
  showBackHome: boolean
  validationMessage: string | null
  searchError: string | null
  onRawQueryChange: (query: string) => void
  onClearSearch: () => void
  onCategoryChange: (value: string | null) => void
  onAreaChange: (value: string | null) => void
  onBudgetChange: (value: BudgetValue | null) => void
  onSubmitSearch: () => void
}) {
  const canClear = rawQuery.trim().length > 0 || Boolean(selectedCategoryValue) || Boolean(selectedArea) || Boolean(selectedBudget)
  const selectedCategoryLabel = searchCategoryChoices.find((category) => category.value === selectedCategoryValue)?.label ?? null
  const selectedAreaLabel = selectedArea ? areas.find((area) => area.id === selectedArea)?.name ?? null : null
  const selectedBudgetLabel = selectedBudget ? budgetOptions.find((budget) => budget.value === selectedBudget)?.label ?? null : null
  const activeFilterCount = [selectedCategoryValue, selectedArea, selectedBudget].filter(Boolean).length

  return (
    <section className="relative w-full overflow-hidden px-4 pb-6 pt-4 sm:px-6 lg:px-9 lg:pb-8 lg:pt-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[460px] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.65),rgba(255,255,255,0))]" />

      <div className="relative mx-auto flex w-full max-w-[820px] flex-col items-center text-center">
        {showBackHome ? (
          <div className="mb-3 flex w-full justify-start sm:mb-4">
            <BackToHomeButton className="text-[13px] sm:text-sm" />
          </div>
        ) : null}
        <div className="relative flex w-full justify-center pt-2">
          <div className="pointer-events-none absolute left-4 top-8 h-10 w-20 rounded-full bg-white/60 blur-sm sm:left-20" />
          <div className="pointer-events-none absolute right-6 top-12 h-12 w-24 rounded-full bg-white/65 blur-sm sm:right-20" />
          <div className="pointer-events-none absolute bottom-8 left-[14%] h-14 w-24 rounded-[18px] bg-white/35 shadow-[0_10px_26px_rgba(28,77,160,0.08)]" />
          <div className="pointer-events-none absolute bottom-6 right-[16%] h-16 w-28 rounded-[20px] bg-white/40 shadow-[0_10px_28px_rgba(28,77,160,0.08)]" />
          <div className="pointer-events-none absolute inset-x-0 top-10 mx-auto h-40 w-40 rounded-full bg-[rgba(115,175,255,0.3)] blur-3xl sm:h-48 sm:w-48" />
          <img
            src={searchBeforeChibi}
            alt=""
            className="relative z-10 h-[310px] w-auto object-contain sm:h-[350px] lg:h-[380px]"
            loading="eager"
          />
        </div>

        <div className="-mt-4 max-w-[560px]">
          <h1 className="text-[2rem] font-black leading-[1.02] tracking-[-0.04em] text-slate-950 sm:text-[2.5rem]">
            Saan tayo gagala today?
          </h1>
          <p className="mt-2 text-[0.98rem] font-semibold text-slate-600 sm:text-[1.05rem]">
            Search places, cities, or categories.
          </p>
        </div>

        <section className="relative mt-5 w-full overflow-hidden rounded-[32px] bg-[linear-gradient(180deg,#1697f3_0%,#1777ea_100%)] px-4 py-4 text-left shadow-[0_24px_54px_rgba(23,119,234,0.28)] sm:px-5 sm:py-5">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-0 top-0 h-full w-[68%] bg-[linear-gradient(205deg,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0.18)_28%,rgba(255,255,255,0)_29%)]" />
            <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
          </div>
          <div className="relative">
            <p className="text-[0.72rem] font-black uppercase tracking-[0.16em] text-white/72">Search places</p>

            <label htmlFor="smart-search-input" className="sr-only">
              Search places, cities, or categories
            </label>
            <div className="mt-3 flex items-stretch gap-3">
              <div className="flex min-w-0 flex-1 items-start gap-3 rounded-[22px] border-2 border-white/80 bg-[rgba(19,132,234,0.28)] px-4 py-3 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-sm sm:px-5 sm:py-4">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/12 text-white">
                  <AppIcon name="search" className="h-5 w-5" />
                </div>
                <textarea
                  id="smart-search-input"
                  value={rawQuery}
                  onChange={(event) => onRawQueryChange(event.target.value)}
                  placeholder="Search"
                  rows={2}
                  disabled={isSearching}
                  className="min-h-[58px] flex-1 resize-none bg-transparent pt-1 text-[1.02rem] font-semibold leading-6 text-white outline-none placeholder:font-semibold placeholder:text-white/78 disabled:cursor-not-allowed"
                />
              </div>

              <button
                type="button"
                onClick={onSubmitSearch}
                disabled={isSearching}
                aria-label="Search places"
                className="flex min-h-[88px] w-[62px] shrink-0 items-center justify-center rounded-[22px] border-2 border-white/80 bg-[rgba(19,132,234,0.28)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <FilterIcon className="h-7 w-7" />
              </button>
            </div>

            <div className="mt-3 rounded-[24px] bg-white/12 px-3 py-3 backdrop-blur-[10px] sm:px-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 rounded-full bg-white/18 px-3 py-2 text-sm font-bold text-white">
                  <FilterIcon className="h-4 w-4" />
                  <span>Filters</span>
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-black text-[#1777ea]">
                    {activeFilterCount}
                  </span>
                </div>

                <label className="min-w-0 flex-1 sm:flex-none">
                  <select
                    value={selectedCategoryValue ?? ''}
                    onChange={(event) => onCategoryChange(event.target.value || null)}
                    className="min-h-11 w-full rounded-full border border-white/28 bg-white/95 px-4 text-sm font-bold text-[#1d4f96] outline-none transition focus:border-white sm:min-w-[152px]"
                  >
                    <option value="">Category</option>
                    {searchCategoryChoices.map((category) => (
                      <option key={category.value} value={category.value}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="min-w-0 flex-1 sm:flex-none">
                  <select
                    value={selectedArea ?? ''}
                    onChange={(event) => onAreaChange(event.target.value || null)}
                    className="min-h-11 w-full rounded-full border border-white/28 bg-white/95 px-4 text-sm font-bold text-[#1d4f96] outline-none transition focus:border-white sm:min-w-[148px]"
                  >
                    <option value="">City</option>
                    {areas.filter((area) => area.id !== 'all').map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="min-w-0 flex-1 sm:flex-none">
                  <select
                    value={selectedBudget ?? ''}
                    onChange={(event) => onBudgetChange((event.target.value as BudgetValue) || null)}
                    className="min-h-11 w-full rounded-full border border-white/28 bg-white/95 px-4 text-sm font-bold text-[#1d4f96] outline-none transition focus:border-white sm:min-w-[170px]"
                  >
                    <option value="">Budget</option>
                    {budgetOptions.map((budget) => (
                      <option key={budget.value} value={budget.value}>
                        {budget.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {(selectedCategoryLabel || selectedAreaLabel || selectedBudgetLabel) ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedBudgetLabel ? (
                    <span className="rounded-full border border-white/24 bg-white/18 px-3 py-1.5 text-sm font-semibold text-white">
                      {selectedBudgetLabel}
                    </span>
                  ) : null}
                  {selectedCategoryLabel ? (
                    <span className="rounded-full border border-white/24 bg-white/18 px-3 py-1.5 text-sm font-semibold text-white">
                      {selectedCategoryLabel}
                    </span>
                  ) : null}
                  {selectedAreaLabel ? (
                    <span className="rounded-full border border-white/24 bg-white/18 px-3 py-1.5 text-sm font-semibold text-white">
                      {selectedAreaLabel}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            <p className="mt-4 text-sm font-semibold text-white/88">{searchSentence}</p>

            <div className="mt-4 flex items-center justify-end gap-3">
              {canClear ? (
                <button
                  type="button"
                  onClick={onClearSearch}
                  className="inline-flex min-h-11 items-center rounded-full px-1 text-sm font-bold text-white/78 transition hover:text-white"
                >
                  Clear
                </button>
              ) : null}
            </div>

            {validationMessage ? <p className="mt-3 text-sm font-bold text-white">{validationMessage}</p> : null}
            {searchError ? <p className="mt-2 text-sm font-bold text-[#ffe2e2]">{searchError}</p> : null}
          </div>
        </section>
      </div>
    </section>
  )
}

function formatResetAtCompact(resetAt: string) {
  const resetDate = new Date(resetAt)

  if (Number.isNaN(resetDate.getTime())) {
    return resetAt
  }

  const timePart = resetDate.toLocaleTimeString([], {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).replace(' ', '\u00A0')

  return timePart
}

function isAskAiUsageStatus(value: unknown): value is AskAiUsageStatus {
  if (!value || typeof value !== 'object') {
    return false
  }

  const usage = value as Partial<AskAiUsageStatus>

  return (
    (usage.usageType === 'ask_ai_total' || usage.usageType === 'live_search') &&
    typeof usage.allowed === 'boolean' &&
    typeof usage.limit === 'number' &&
    typeof usage.used === 'number' &&
    typeof usage.remaining === 'number' &&
    typeof usage.resetAt === 'string'
  )
}

function getSourceHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return url
  }
}

function createPromptBuilderPrefill({
  plan,
  location,
  budget,
  priority,
}: {
  plan?: string | null
  location?: string | null
  budget?: string | null
  priority?: string | null
}) {
  const state = createEmptyPromptBuilderState()

  state.custom.plan = plan?.trim() ?? ''
  state.custom.location = location?.trim() ?? ''
  state.custom.budget = budget?.trim() ?? ''
  state.custom.vibe = priority?.trim() ?? ''

  return state
}

function normalizeAskAiDisplayText(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/Ã¢â‚¬Â¢|â€¢/g, '•')
    .replace(/â€™/g, "'")
    .replace(/â€œ|â€/g, '"')
    .replace(/â€“/g, '-')
    .replace(/â€¦/g, '...')
    .replace(/Ã¯Â¼Å¡/g, ':')
}

function normalizeAskAiPresentationText(value: string) {
  return value
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/(^|[\s(])\*\*([^*\n]+)\*\*(?=[\s).,!?:;]|$)/g, '$1$2')
    .replace(/(^|[\s(])__([^_\n]+)__(?=[\s).,!?:;]|$)/g, '$1$2')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1$2')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, '$1$2')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/^>\s+/gm, '')
}

function getAskAiDisplayLines(answer: string) {
  return normalizeAskAiPresentationText(normalizeAskAiDisplayText(answer))
    .split('\n')
    .map((line) => line.trim())
}

function AskAiAnswerBody({ answer }: { answer: string }) {
  const lines = getAskAiDisplayLines(answer)

  return (
    <div className="grid gap-2 text-[0.95rem] leading-7 text-slate-800">
      {lines.map((line, index) => {
        const key = `${index}-${line}`

        if (!line) {
          return <div key={key} className="h-1" aria-hidden="true" />
        }

        if (/^[A-Z][A-Za-z /]+(?: .+)?:$/.test(line)) {
          return (
            <p key={key} className={index === 0 ? 'font-semibold text-slate-950' : 'pt-2 font-semibold text-slate-950'}>
              {line}
            </p>
          )
        }

        if (/^(?:[-*]|•)\s+/.test(line)) {
          return (
            <p key={key} className="pl-5 -indent-5 text-slate-800">
              <span aria-hidden="true" className="mr-2 text-slate-500">•</span>
              {line.replace(/^(?:[-*]|•)\s+/, '')}
            </p>
          )
        }

        return <p key={key}>{line}</p>
      })}
    </div>
  )
}

function AskAiBackButton({
  onClick,
  label = 'Back',
  className = '',
}: {
  onClick: () => void
  label?: string
  className?: string
}) {
  void onClick
  void label
  void className
  return null
}

function getAskAiLeadLine(answer: string) {
  const cleaned = normalizeAskAiPresentationText(normalizeAskAiDisplayText(answer)).trim()
  if (!cleaned) {
    return "Here's a practical gala plan for you."
  }

  const firstSentence = cleaned.match(/^.*?[.!?](?:\s|$)/)?.[0].trim()
  return firstSentence || "Here's a practical gala plan for you."
}

function getAskAiBestPlanLines(answer: string) {
  return getAskAiDisplayLines(answer)
    .filter((line) => /^(?:[-*]|•)\s+/.test(line))
    .slice(0, 4)
    .map((line) => line.replace(/^(?:[-*]|•)\s+/, ''))
}

function getAskAiParagraphs(answer: string) {
  return getAskAiDisplayLines(answer).filter((line) => line && !/^(?:[-*]|•)\s+/.test(line) && !/^[A-Z][A-Za-z /]+(?: .+)?:$/.test(line))
}

type AskAiParsedSection = {
  title: string
  lines: string[]
}

type AskAiSectionBlock =
  | { type: 'paragraph'; content: string }
  | { type: 'bullet'; content: string }
  | { type: 'numbered'; content: string; marker: string }

function parseAskAiSections(answer: string): AskAiParsedSection[] {
  const lines = getAskAiDisplayLines(answer)
  const sections: AskAiParsedSection[] = []
  let currentSection: AskAiParsedSection | null = null

  for (const line of lines) {
    if (!line) {
      continue
    }

    if (/^[A-Z][A-Za-z /]+(?: .+)?:$/.test(line)) {
      currentSection = {
        title: line.replace(/:$/, ''),
        lines: [],
      }
      sections.push(currentSection)
      continue
    }

    if (!currentSection) {
      currentSection = {
        title: 'Answer',
        lines: [],
      }
      sections.push(currentSection)
    }

    currentSection.lines.push(line)
  }

  return sections.filter((section) => section.lines.length > 0)
}

function getAskAiSectionBlocks(lines: string[]): AskAiSectionBlock[] {
  return lines.flatMap<AskAiSectionBlock>((line) => {
    const trimmedLine = line.trim()

    if (!trimmedLine) {
      return []
    }

    const numberedMatch = trimmedLine.match(/^(\d+)[.)]\s+(.*)$/)
    if (numberedMatch) {
      return [{
        type: 'numbered',
        marker: numberedMatch[1],
        content: numberedMatch[2],
      }]
    }

    if (/^(?:[-*]|â€¢)\s+/.test(trimmedLine)) {
      return [{
        type: 'bullet',
        content: trimmedLine.replace(/^(?:[-*]|â€¢)\s+/, ''),
      }]
    }

    return [{
      type: 'paragraph',
      content: trimmedLine,
    }]
  })
}

function getAskAiSectionIcon(sectionTitle: string) {
  const normalizedTitle = sectionTitle.trim().toLowerCase()

  if (normalizedTitle.includes('quick answer')) {
    return SparkIcon
  }

  if (normalizedTitle.includes('best plan') || normalizedTitle.includes('best pick') || normalizedTitle.includes('best options')) {
    return HeartOutlineIcon
  }

  if (normalizedTitle.includes('why')) {
    return BuildingIcon
  }

  if (normalizedTitle.includes('tip')) {
    return CafeIcon
  }

  return SparkIcon
}

function AskAiStructuredSection({
  section,
  isPrimary = false,
}: {
  section: AskAiParsedSection
  isPrimary?: boolean
}) {
  const SectionIcon = getAskAiSectionIcon(section.title)
  const blocks = getAskAiSectionBlocks(section.lines)
  const paragraphBlocks = blocks.filter((block) => block.type === 'paragraph')
  const listBlocks = blocks.filter((block) => block.type !== 'paragraph')
  const containerClassName = isPrimary
    ? 'border-[rgba(47,116,232,0.12)] bg-[linear-gradient(180deg,#ffffff_0%,#fafcff_100%)] shadow-[0_10px_24px_rgba(47,116,232,0.05)]'
    : 'border-[rgba(15,23,42,0.08)] bg-white shadow-[0_8px_20px_rgba(15,23,42,0.04)]'

  return (
    <article
      className={`rounded-[22px] border px-4 py-4 sm:px-5 ${containerClassName}`}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(47,116,232,0.08)] text-[var(--accent-deep)]">
          <SectionIcon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-[0.66rem] font-black uppercase tracking-[0.14em] text-slate-400">AI response</p>
          <h3 className="text-[0.94rem] font-black tracking-[-0.02em] text-slate-900">{section.title}</h3>
        </div>
      </div>

      <div className="mt-3.5 grid gap-3">
        {paragraphBlocks.length > 0 ? (
          <div className="grid gap-2.5 text-[0.98rem] leading-7 text-slate-700">
            {paragraphBlocks.map((block, index) => (
              <p key={`${section.title}-paragraph-${index}`}>{block.content}</p>
            ))}
          </div>
        ) : null}

        {listBlocks.length > 0 ? (
          <div className="grid gap-3">
            {listBlocks.map((block, index) => (
              <div
                key={`${section.title}-list-${index}`}
                className="flex items-start gap-3 rounded-[18px] bg-slate-50 px-3.5 py-3"
              >
                {block.type === 'numbered' ? (
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[0.78rem] font-black text-slate-700">
                    {block.marker}
                  </span>
                ) : (
                  <span className="mt-[0.72rem] h-2 w-2 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
                )}
                <p className="min-w-0 text-[0.95rem] leading-7 text-slate-800">{block.content}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  )
}

function AskAiAnswerText({ answer }: { answer: string }) {
  const lines = normalizeAskAiPresentationText(normalizeAskAiDisplayText(answer)).split('\n')

  return (
    <div className="grid gap-1 text-sm leading-relaxed text-slate-800">
      {lines.map((line, index) => {
        const trimmedLine = line.trim()
        const key = `${index}-${trimmedLine}`

        if (!trimmedLine) {
          return <div key={key} className="h-1" aria-hidden="true" />
        }

        if (/^[A-Z][A-Za-z /]+(?: .+)?[:ï¼š]$/.test(trimmedLine)) {
          return (
            <p key={key} className={index === 0 ? 'font-semibold text-slate-950' : 'mt-2 font-semibold text-slate-950'}>
              {trimmedLine}
            </p>
          )
        }

        if (/^[-*]\s+/.test(trimmedLine)) {
          return (
            <p key={key} className="pl-4 text-slate-800">
              <span aria-hidden="true">â€¢ </span>
              {trimmedLine.replace(/^[-*]\s+/, '')}
            </p>
          )
        }

        return <p key={key}>{trimmedLine}</p>
      })}
    </div>
  )
}

function getAskAiAnswerLead(answer: string) {
  const cleaned = answer.replace(/\r\n/g, '\n').trim()
  if (!cleaned) {
    return 'Here’s a practical gala plan for you.'
  }

  const firstSentence = cleaned.match(/^.*?[.!?](?:\s|$)/)?.[0].trim()
  return firstSentence || 'Here’s a practical gala plan for you.'
}

function getAskAiBulletLines(answer: string) {
  return answer
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .slice(0, 4)
    .map((line) => line.replace(/^[-*]\s+/, ''))
}

function AskAiOutputStageLegacy({
  question,
  answer,
  sources,
  chibiImage,
  onOpenPromptBuilder,
  onStartOver,
  className = '',
}: {
  question: string
  answer: string
  sources: AskAiSource[]
  chibiImage: string
  onOpenPromptBuilder: () => void
  onStartOver: () => void
  className?: string
}) {
  const leadLine = getAskAiAnswerLead(answer)
  const bulletLines = getAskAiBulletLines(answer)

  return (
    <section
      className={`gala-page-background relative overflow-hidden px-4 py-4 text-[var(--text)] sm:px-5 sm:py-5 lg:px-8 lg:py-7 ${className} min-h-[calc(100dvh-88px)]`}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-12 top-8 h-40 w-40 rounded-full bg-[rgba(160,201,255,0.24)] blur-3xl" />
        <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-[rgba(192,202,255,0.22)] blur-3xl" />
        <div className="absolute bottom-0 right-1/3 h-36 w-36 rounded-full bg-[rgba(201,235,255,0.24)] blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100dvh-144px)] w-full max-w-[min(1500px,calc(100vw-96px))] flex-col gap-5 lg:gap-7">
        <div>
          <p className="text-[0.9rem] font-black uppercase tracking-[0.12em] text-slate-500">Your question</p>
          <div className="mt-2.5 inline-block max-w-full rounded-[16px] border border-[rgba(20,35,58,0.22)] bg-white/96 px-4 py-3.5 shadow-[0_12px_26px_rgba(15,23,42,0.045),inset_0_1px_0_rgba(255,255,255,0.9)] sm:px-5 sm:py-4 lg:max-w-[980px] xl:max-w-[1120px]">
            <p className="text-[1.08rem] font-bold leading-7 tracking-[-0.01em] text-slate-950 sm:text-[1.18rem] sm:leading-8 lg:text-[1.12rem]">
              {question}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-5 lg:-mt-2">
          <div className="relative flex items-end justify-center">
            <img
              src={chibiImage}
              alt=""
              className="h-[220px] w-auto max-w-full object-contain sm:h-[280px] lg:h-[330px] xl:h-[360px]"
              loading="lazy"
            />
            <div className="absolute right-0 top-8 hidden rounded-[26px] border border-[rgba(83,146,241,0.16)] bg-white px-5 py-4 text-center shadow-[0_12px_24px_rgba(15,23,42,0.045)] lg:block">
              <p className="text-[1.1rem] font-black text-slate-900">Here’s a practical</p>
              <p className="mt-1 text-[1.1rem] font-black text-slate-900">gala plan for you.</p>
            </div>
          </div>
        </div>
        <div className="grid items-start gap-5 lg:mt-auto lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="w-full rounded-[30px] border border-[rgba(83,146,241,0.16)] bg-white px-4 py-4 shadow-[0_16px_34px_rgba(15,23,42,0.05)] sm:px-6 sm:py-6">
            <div className="grid gap-0">
              <div className="grid gap-3 border-b border-dashed border-[rgba(83,146,241,0.16)] py-4 first:pt-0">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent-wash)] text-[var(--accent-deep)]">
                    <SparkIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[1.05rem] font-black text-[var(--accent-deep)]">Quick answer</p>
                    <div className="mt-2">
                      <AskAiAnswerText answer={answer} />
                    </div>
                  </div>
                </div>
              </div>

            <div className="grid gap-3 border-b border-dashed border-[rgba(83,146,241,0.16)] py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent-wash)] text-[var(--accent-deep)]">
                  <HeartOutlineIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[1.05rem] font-black text-[var(--accent-deep)]">Best plan</p>
                  {bulletLines.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-7 text-slate-800">
                      {bulletLines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm leading-7 text-slate-800">
                      {leadLine}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-3 border-b border-dashed border-[rgba(83,146,241,0.16)] py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent-wash)] text-[var(--accent-deep)]">
                  <SparkIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[1.05rem] font-black text-[var(--accent-deep)]">Why this works</p>
                  <p className="mt-2 text-sm leading-7 text-slate-800">
                    It keeps the plan practical, compact, and easy to follow without overcomplicating the outing.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent-wash)] text-[var(--accent-deep)]">
                  <SparkIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[1.05rem] font-black text-[var(--accent-deep)]">Tip</p>
                  <p className="mt-2 text-sm leading-7 text-slate-800">
                    Add the area, budget, or vibe you want next time so the plan gets even tighter.
                  </p>
                </div>
              </div>
            </div>
            </div>
          </div>

          <aside className="grid gap-3 lg:sticky lg:top-6">
            <p className="text-[1.05rem] font-black text-slate-950">Other actions</p>
            <button
              type="button"
              onClick={onStartOver}
              className="group relative flex items-center gap-3 overflow-hidden rounded-[24px] border border-[rgba(15,23,42,0.08)] bg-[linear-gradient(135deg,#0f172a,#1d4ed8)] px-4 py-4 text-left shadow-[0_18px_42px_rgba(29,78,216,0.24)] transition hover:-translate-y-[1px] hover:shadow-[0_24px_52px_rgba(29,78,216,0.28)]"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-white/14 text-white ring-1 ring-white/16">
                <SparkIcon className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/72">Reset Ask AI</p>
                <p className="mt-1 text-base font-black text-white">Start over</p>
                <p className="mt-1 text-xs leading-5 text-white/78">
                  Clear this answer and ask a brand new question.
                </p>
              </div>
              <ChevronRightIcon className="h-5 w-5 shrink-0 text-white transition group-hover:translate-x-0.5" />
            </button>

            <button
              type="button"
              onClick={onOpenPromptBuilder}
              className="flex items-center gap-3 rounded-[22px] border border-[rgba(83,146,241,0.16)] bg-[linear-gradient(180deg,#ffffff,#f7fbff)] px-4 py-4 text-left shadow-[0_12px_28px_rgba(15,23,42,0.045)] transition hover:border-[var(--accent)]"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-[var(--accent-wash)] text-[var(--accent-deep)]">
                <SparkIcon className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-slate-950">Use Prompt Builder</p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                  Turn the idea into a cleaner, stronger prompt.
                </p>
              </div>
              <ChevronRightIcon className="h-5 w-5 shrink-0 text-[var(--accent-deep)]" />
            </button>

          </aside>
        </div>

        {sources.length > 0 ? (
          <div className="rounded-[28px] border border-[rgba(83,146,241,0.16)] bg-white px-4 py-4 shadow-[0_14px_32px_rgba(15,23,42,0.045)] sm:px-5 sm:py-5">
            <div className="flex items-center gap-2">
              <p className="text-[1.05rem] font-black text-slate-950">Sources</p>
              <span className="rounded-full bg-[var(--accent-wash)] px-2 py-1 text-[11px] font-black text-[var(--accent-deep)]">
                Double-check when needed
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {sources.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-[76px] items-center justify-between gap-3 rounded-[20px] border border-[rgba(83,146,241,0.16)] bg-[linear-gradient(180deg,#ffffff,#f7fbff)] px-4 py-3 transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950">{source.title}</p>
                    <p className="mt-1 truncate text-xs font-medium text-[var(--muted)]">{getSourceHostname(source.url)}</p>
                  </div>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-[var(--accent-deep)]" />
                </a>
              ))}
            </div>
          </div>
        ) : null}

      </div>
    </section>
  )
}

function AskAiThinkingStageLegacy({
  question,
  chibiImage,
  className = '',
}: {
  question: string
  chibiImage: string
  className?: string
}) {
  const loadingMessageText = 'This may take a few seconds if current info is needed.'
  const [miniGameStage, setMiniGameStage] = useState<'hidden' | 'invite' | 'game'>('hidden')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMiniGameStage('invite')
    }, 4500)

    return () => {
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (miniGameStage !== 'game') {
      return
    }

    const previousBodyOverflow = document.body.style.overflow
    const previousHtmlOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousHtmlOverflow
    }
  }, [miniGameStage])

  return (
    <section className={`gala-page-background relative overflow-hidden px-4 py-4 text-[var(--text)] sm:px-5 sm:py-5 lg:px-8 lg:py-7 ${className} min-h-[calc(100dvh-88px)]`}>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-12 top-8 h-40 w-40 rounded-full bg-[rgba(160,201,255,0.24)] blur-3xl" />
        <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-[rgba(192,202,255,0.22)] blur-3xl" />
        <div className="absolute bottom-0 right-1/3 h-36 w-36 rounded-full bg-[rgba(201,235,255,0.24)] blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100dvh-144px)] w-full max-w-[min(1500px,calc(100vw-96px))] flex-col">
        <h1 className="mt-6 text-[3.1rem] font-black leading-none tracking-[-0.055em] text-slate-950 sm:text-[4rem] lg:mt-8 lg:text-[4.5rem]">
          Ask AI
        </h1>

        <div className="mt-7 lg:mt-8">
          <p className="text-[0.9rem] font-black uppercase tracking-[0.12em] text-slate-500">Your question</p>
          <div className="mt-2.5 inline-block max-w-full rounded-[16px] border border-[rgba(20,35,58,0.22)] bg-white/96 px-4 py-3.5 shadow-[0_12px_26px_rgba(15,23,42,0.045),inset_0_1px_0_rgba(255,255,255,0.9)] sm:px-5 sm:py-4 lg:max-w-[980px] xl:max-w-[1120px]">
            <p className="text-[1.08rem] font-bold leading-7 tracking-[-0.01em] text-slate-950 sm:text-[1.18rem] sm:leading-8 lg:text-[1.12rem]">
              {question}
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-1 flex-col items-center justify-center text-center sm:mt-10 lg:mt-5">
          <div className="flex items-center justify-center">
            <img
              src={chibiImage}
              alt=""
              className="h-[210px] w-auto max-w-full object-contain sm:h-[290px] lg:h-[250px]"
              loading="lazy"
            />
          </div>

          <div className="relative -mt-3 w-full max-w-[370px] rounded-[18px] border border-[rgba(20,35,58,0.34)] bg-white px-4 pb-4 pt-4 shadow-[0_12px_28px_rgba(15,23,42,0.045)] sm:max-w-[420px] sm:px-5 lg:max-w-[370px]">
            <span className="absolute left-1/2 top-0 h-4.5 w-4.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-l border-t border-[rgba(20,35,58,0.34)] bg-white" />
            <div className="relative flex flex-col items-center gap-2.5">
              <span className="flex items-center gap-2.5">
                <span className="h-3.5 w-3.5 rounded-full bg-slate-600 animate-pulse" />
                <span className="h-3.5 w-3.5 rounded-full bg-slate-600 animate-pulse" style={{ animationDelay: '120ms' }} />
                <span className="h-3.5 w-3.5 rounded-full bg-slate-600 animate-pulse" style={{ animationDelay: '240ms' }} />
              </span>
              <p className="text-[1.15rem] font-bold leading-tight text-slate-700 sm:text-[1.35rem] lg:text-[1.15rem]">
                GalaTayo is thinking...
              </p>
            </div>
          </div>

          <p className="mt-7 max-w-[680px] text-[1.2rem] font-semibold italic leading-8 tracking-[-0.02em] text-slate-700 sm:text-[1.45rem] sm:leading-[2.25rem] lg:mt-6 lg:text-[1.3rem]">
            “Inaayos ko yung best gala plan for you...”
          </p>
          <p className="mt-3 text-[0.95rem] italic leading-6 text-slate-500 sm:text-[1.05rem] lg:text-[0.95rem]">
            {loadingMessageText}
          </p>
        </div>

        {miniGameStage === 'invite' ? createPortal(
          <div className="fixed inset-0 z-[9990] pointer-events-none flex h-[100dvh] items-center justify-center px-4 py-6">
            <div className="pointer-events-auto w-full max-w-[360px] overflow-hidden rounded-[24px] border border-[rgba(37,99,235,0.14)] bg-white/90 p-3 backdrop-blur-xl animate-[gala-game-invite-pop_360ms_cubic-bezier(0.16,1,0.3,1)_both] sm:max-w-[390px]">
              <div className="relative rounded-[20px] bg-[linear-gradient(135deg,#f8fbff,#fff7fb)] p-3">
                <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(37,99,235,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(37,99,235,0.07)_1px,transparent_1px)] [background-size:22px_22px]" />
                <div className="relative flex items-start gap-3">
                  <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white animate-[gala-charm-wiggle_1.8s_ease-in-out_infinite]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                      <path d="M12 21s6-5.7 6-11a6 6 0 1 0-12 0c0 5.3 6 11 6 11Z" />
                      <circle cx="12" cy="10" r="2.3" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#2563eb]">Still cooking</p>
                        <h3 className="mt-1 text-[1.05rem] font-black leading-tight text-slate-950">Want a tiny tap break?</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMiniGameStage('hidden')}
                        className="inline-flex h-8 shrink-0 items-center justify-center rounded-full bg-white/74 px-3 text-[11px] font-black text-slate-600 transition hover:bg-white hover:text-slate-950"
                      >
                        Later
                      </button>
                    </div>
                    <p className="mt-2 text-[0.84rem] leading-5 text-slate-600">
                      Optional lang. Play Pin Rush while your answer finishes.
                    </p>
                  </div>
                </div>
                <div className="relative mt-3 grid grid-cols-[1fr_auto] items-center gap-2">
                  <div className="flex h-10 items-center gap-1.5 rounded-full bg-white/70 px-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#2563eb]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#5ed6c7]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#ffcc4d]" />
                    <span className="ml-1 text-[11px] font-black text-slate-500">8+ pts charms</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMiniGameStage('game')}
                    className="inline-flex h-10 items-center justify-center rounded-full bg-slate-950 px-4 text-sm font-black text-white transition hover:brightness-110"
                  >
                    Play
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        ) : null}

        {miniGameStage === 'game' ? createPortal(
          <div
            className="fixed inset-0 z-[9990] flex h-[100dvh] items-stretch justify-center overscroll-none bg-white"
            role="presentation"
            onClick={() => setMiniGameStage('hidden')}
          >
            <div
              className="relative flex h-[100dvh] w-full flex-col overflow-hidden touch-auto"
              role="dialog"
              aria-modal="true"
              aria-label="Tap the Gala Pin mini game"
              onClick={(event) => event.stopPropagation()}
            >
              <TapGalaPinGame isLoading={true} onClose={() => setMiniGameStage('hidden')} className="min-h-0 w-full flex-1" />
            </div>
          </div>,
          document.body,
        ) : null}
      </div>
    </section>
  )
}

function AskAiPlaceholder({
  usageStatus,
  isUsageLoading,
  question,
  answer,
  sources,
  isSubmitting,
  answerError,
  onQuestionChange,
  onSubmit,
  onSwitchToPlaces,
  onStartOver,
  onOpenPromptBuilder,
  className = '',
}: {
  usageStatus: AskAiUsageStatus | null
  isUsageLoading: boolean
  question: string
  answer: string
  sources: AskAiSource[]
  isSubmitting: boolean
  answerError: string | null
  onQuestionChange: (question: string) => void
  onSubmit: (questionOverride?: string) => void
  onSwitchToPlaces: () => void
  onStartOver: () => void
  onOpenPromptBuilder: (questionOverride?: string) => void
  className?: string
}) {
  const isUsagePending = !usageStatus
  const isLimitReached = usageStatus ? !usageStatus.allowed || usageStatus.remaining <= 0 : false
  const [draftQuestion, setDraftQuestion] = useState(question)
  const canSubmit = !isSubmitting && !isUsagePending && !isLimitReached && draftQuestion.trim().length > 0
  const questionTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const chibiImage = answerError
    ? askAiErrorChibi
    : isSubmitting
      ? askAiThinkingChibi
      : answer
        ? askAiOutputChibi
        : askAiStartChibi

  useEffect(() => {
    setDraftQuestion(question)
  }, [question])

  useEffect(() => {
    const syncTextareaHeight = (element: HTMLTextAreaElement | null, minHeight: number) => {
      if (!element) {
        return
      }

      element.style.height = '0px'
      element.style.height = `${Math.max(element.scrollHeight, minHeight)}px`
    }

    syncTextareaHeight(questionTextareaRef.current, 96)
  }, [draftQuestion])

  const updateDraftQuestion = (nextQuestion: string) => {
    setDraftQuestion(nextQuestion)
    startTransition(() => {
      onQuestionChange(nextQuestion)
    })
  }

  const handleSubmit = () => {
    onQuestionChange(draftQuestion)
    onSubmit(draftQuestion)
  }

  const handleOpenPromptBuilder = () => {
    onQuestionChange(draftQuestion)
    onOpenPromptBuilder(draftQuestion)
  }

  if (isSubmitting) {
    return <AskAiThinkingStageNext question={draftQuestion} chibiImage={chibiImage} className={className} />
  }

  if (answer) {
    return (
      <AskAiOutputStageNext
        question={question}
        answer={answer}
        sources={sources}
        chibiImage={chibiImage}
        onOpenPromptBuilder={onOpenPromptBuilder}
        onStartOver={onStartOver}
        className={className}
      />
    )
  }

  const promptChips = [
    { id: 'date', label: 'Date plan', prompt: 'Plan a date in [CITY] for [PAX] people under [BUDGET].' },
    {
      id: 'food',
      label: 'Food trip',
      prompt: 'Suggest a food trip in [CITY] for [PAX] people around [BUDGET].',
    },
    {
      id: 'itinerary',
      label: 'Itinerary',
      prompt: 'Make a [TIME] itinerary in [CITY] for [PAX] people.',
    },
  ]

  const questionLength = draftQuestion.length
  const questionLimit = 950

  return (
    <section
      className={`relative overflow-hidden px-4 py-6 text-[var(--text)] sm:px-5 sm:py-6 lg:px-8 lg:py-8 ${className}`}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-12 top-12 h-36 w-36 rounded-full bg-[rgba(201,217,242,0.18)] blur-3xl" />
        <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[rgba(192,202,255,0.14)] blur-3xl" />
      </div>

      <div className="relative mx-auto flex w-full max-w-[min(1520px,calc(100vw-32px))] flex-col gap-7 lg:gap-8">
        <AskAiBackButton onClick={onSwitchToPlaces} className="w-fit px-1" />

        <div className="grid gap-6 lg:gap-7">
          <div className="grid items-center gap-4 px-1 pt-0 sm:grid-cols-[minmax(0,1fr)_230px] sm:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,34vw)] lg:gap-10 lg:pt-2 xl:grid-cols-[minmax(0,1fr)_420px]">
            <PageHeroHeader
              eyebrow="Ask AI"
              title="Turn your gala idea into a real plan"
              description="Use AI to turn your GalaTayo idea into a plan, place shortlist, or quick gala itinerary."
              icon={<AppIcon name="askAi" className="h-4 w-4" />}
              badges={
                <>
                  <span className="gala-count-pill">{usageStatus ? `${usageStatus.remaining} left today` : 'Checking asks...'}</span>
                  <span className="gala-count-pill">{usageStatus ? `${formatResetAtCompact(usageStatus.resetAt)} reset` : 'Checking reset...'}</span>
                </>
              }
              aside={
                <img
                  src={chibiImage}
                  alt=""
                  className="mx-auto h-[204px] w-auto max-w-full object-contain sm:h-[228px] lg:h-[360px] xl:h-[420px]"
                  loading="lazy"
                />
              }
              className="border-b-0 pb-0"
            />
          </div>

          <div className="w-full px-1">
            <label className="sr-only" htmlFor="ask-ai-question">
              Ask GalaTayo
            </label>

            <div className="rounded-[28px] border border-[rgba(20,35,58,0.12)] bg-white shadow-[0_18px_48px_rgba(15,23,42,0.07)] lg:rounded-[32px]">
              <textarea
                id="ask-ai-question"
                ref={questionTextareaRef}
                value={draftQuestion}
                onChange={(event) => updateDraftQuestion(event.target.value)}
                disabled={isSubmitting || isLimitReached}
                rows={4}
                maxLength={questionLimit}
                placeholder={'Message Ask AI with your gala idea...'}
                className="min-h-[164px] w-full resize-none overflow-hidden rounded-t-[28px] bg-transparent px-5 pb-4 pt-5 text-[15px] leading-7 text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-400 lg:min-h-[188px] lg:rounded-t-[32px] lg:px-6 lg:pb-5 lg:pt-6 lg:text-[1rem] lg:leading-8"
              />

              <div className="border-t border-[rgba(20,35,58,0.08)] px-4 pb-4 pt-4 lg:px-5 lg:pb-5 lg:pt-5">
                <div className="flex flex-wrap gap-2">
                  {promptChips.map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => updateDraftQuestion(chip.prompt)}
                      className="rounded-full border border-[rgba(20,35,58,0.08)] bg-slate-50 px-3 py-1.5 text-[12px] font-semibold text-slate-600 transition hover:border-[rgba(20,35,58,0.16)] hover:bg-white focus:outline-none focus:ring-2 focus:ring-[rgba(47,116,232,0.10)] lg:px-3.5 lg:text-[0.84rem]"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleOpenPromptBuilder}
                      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 transition hover:text-slate-900 lg:text-[0.9rem]"
                    >
                      <span>Need help shaping it?</span>
                      <span className="font-black text-[var(--accent-deep)]">Prompt Builder</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateToPath('/ask-ai/maps')}
                      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 transition hover:text-slate-900 lg:text-[0.9rem]"
                    >
                      <AppIcon name="map" className="h-4 w-4 text-[var(--accent)]" />
                      <span className="font-black text-[var(--accent-deep)]">Find places on map</span>
                    </button>
                  </div>
                  <div className="shrink-0 text-right text-[12px] font-medium text-slate-400 lg:text-[0.88rem]">{questionLength}/{questionLimit}</div>
                </div>

                <div className="mt-4">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-[var(--accent)] px-5 text-[0.96rem] font-semibold text-white transition hover:bg-[var(--accent-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="inline-flex items-center gap-2">
                      <SparkIcon className="h-4.5 w-4.5" />
                      <span>{isSubmitting ? 'Asking...' : 'Ask AI'}</span>
                    </span>
                  </button>
                </div>
              </div>

              {answerError ? (
                <p className="px-4 pb-4 text-sm text-red-600 lg:px-5 lg:pb-5">{answerError}</p>
              ) : null}

              {isUsageLoading && !usageStatus ? (
                <p className="px-4 pb-4 text-sm font-semibold text-slate-500 lg:px-5 lg:pb-5">
                  Checking your Ask AI limit...
                </p>
              ) : null}

              {isLimitReached ? (
                <p className="px-4 pb-4 text-sm font-semibold text-slate-700 lg:px-5 lg:pb-5">You&apos;ve used today&apos;s Ask AI.</p>
              ) : null}
            </div>
          </div>
          {/* Output stage is rendered above when an answer exists. */}
        </div>
      </div>
    </section>
  )
}

function AskAiGateLoadingState({
  className = '',
}: {
  className?: string
}) {
  return (
    <section className={`gala-page-background relative overflow-hidden px-4 py-4 sm:px-5 sm:py-5 lg:px-8 lg:py-7 ${className} min-h-[calc(100dvh-88px)]`}>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-12 top-8 h-40 w-40 rounded-full bg-[rgba(160,201,255,0.22)] blur-3xl" />
        <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-[rgba(192,202,255,0.2)] blur-3xl" />
      </div>
      <div className="relative mx-auto flex min-h-[calc(100dvh-144px)] w-full max-w-[min(1500px,calc(100vw-96px))] flex-col items-start">
        <div className="flex w-full flex-1 items-center justify-center">
          <div className="relative w-full max-w-[360px] overflow-hidden rounded-[32px] border border-[rgba(83,146,241,0.16)] bg-[linear-gradient(180deg,#ffffff,#f7fbff)] px-6 py-7 text-center shadow-[0_18px_42px_rgba(28,77,160,0.08)]">
            <div className="pointer-events-none absolute inset-x-10 top-0 h-24 rounded-full bg-[radial-gradient(circle,rgba(160,201,255,0.22),transparent_72%)] blur-2xl" />
            <div className="relative">
              <div className="mx-auto flex h-[124px] w-[124px] items-center justify-center rounded-full bg-[linear-gradient(180deg,#f8fbff_0%,#edf5ff_100%)]">
                <img
                  src={askAiThinkingChibi}
                  alt=""
                  aria-hidden="true"
                  className="h-[106px] w-auto object-contain"
                  loading="eager"
                />
              </div>
              <div className="mt-4 flex items-center justify-center gap-2" aria-hidden="true">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--accent)]" />
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#7fb2ff]" style={{ animationDelay: '140ms' }} />
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#9bd8d0]" style={{ animationDelay: '280ms' }} />
              </div>
              <p className="mt-4 text-[1.02rem] font-black tracking-[-0.02em] text-slate-900">
                Preparing <span className="text-[var(--accent-deep)]">Ask AI</span>...
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function AskAiSignInRequired({
  className = '',
  onOpenPromptBuilder,
  onBack,
}: {
  className?: string
  onOpenPromptBuilder: () => void
  onBack?: () => void
}) {
  return (
    <section className={`gala-page-background relative overflow-hidden px-4 py-5 ${className}`}>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-12 top-8 h-40 w-40 rounded-full bg-[rgba(160,201,255,0.24)] blur-3xl" />
        <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-[rgba(192,202,255,0.36)] blur-3xl" />
      </div>

      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.82fr)] lg:items-center">
        {onBack ? <AskAiBackButton onClick={onBack} className="w-fit lg:col-span-2" /> : null}
        <div className="overflow-hidden rounded-[32px] border border-[rgba(83,146,241,0.16)] bg-white/88 p-5 shadow-[0_22px_60px_rgba(15,23,42,0.08)] sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <img
              src={protectedFeatureChibi}
              alt=""
              className="mx-auto h-32 w-32 shrink-0 object-contain lg:mx-0"
              loading="lazy"
            />
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(83,146,241,0.18)] bg-[rgba(242,247,255,0.96)] px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-deep)]">
                <SparkIcon className="h-4 w-4" />
                Ask AI
              </div>
              <p className="mt-3 text-3xl font-black leading-tight text-slate-950 sm:text-[2.5rem]">
                Sign in to unlock <span className="text-[var(--accent-deep)]">Ask AI</span>.
              </p>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--muted)] sm:text-[15px]">
                <span className="font-semibold text-[var(--accent-deep)]">Ask AI</span> is reserved for <span className="font-semibold text-slate-800">GalaTayo members</span>. If you want to draft a prompt first, you can still open Prompt Builder anytime.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-slate-700">
                <span className="rounded-full border border-[rgba(83,146,241,0.16)] bg-[rgba(247,251,255,0.96)] px-3 py-1.5">
                  Private chats
                </span>
                <span className="rounded-full border border-[rgba(191,205,255,0.26)] bg-[rgba(242,246,255,0.95)] px-3 py-1.5">
                  Saved usage limit
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <GoogleSignInButton className="inline-flex" />
            <button
              type="button"
              onClick={onOpenPromptBuilder}
              className="inline-flex items-center justify-center rounded-[18px] border border-[rgba(83,146,241,0.18)] bg-white px-4 py-3 text-sm font-black text-[var(--accent-deep)] transition hover:bg-[var(--accent-wash)]"
            >
              Open Prompt Builder
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-[32px] border border-[rgba(191,205,255,0.22)] bg-[linear-gradient(180deg,rgba(248,250,255,0.96),rgba(241,246,255,0.94))] p-5 shadow-[0_18px_42px_rgba(15,23,42,0.06)] sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[rgba(123,146,255,0.12)] text-[#4969c8]">
              <BuildingIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-black text-slate-950">Not signed in yet?</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                You can browse the rest of GalaTayo without logging in, and come back here when you are ready to use Ask AI.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

void AskAiOutputStageLegacy
void AskAiThinkingStageLegacy
void AskAiOutputStageNextLegacy
void AskAiGateLoadingState

function AskAiOutputStageNextLegacy({
  question,
  answer,
  sources,
  chibiImage,
  onOpenPromptBuilder,
  onStartOver,
  className = '',
}: {
  question: string
  answer: string
  sources: AskAiSource[]
  chibiImage: string
  onOpenPromptBuilder: () => void
  onStartOver: () => void
  className?: string
}) {
  const leadLine = getAskAiLeadLine(answer)
  const bulletLines = getAskAiBestPlanLines(answer)
  const paragraphs = getAskAiParagraphs(answer)
  const parsedSections = parseAskAiSections(answer)
  const quickAnswer = paragraphs[0] ?? leadLine
  const whyThisWorks = paragraphs[1] ?? 'It keeps the plan easy, relaxed, and not too tiring.'
  const tipLine = paragraphs[2] ?? 'Add your area, budget, or vibe so GalaTayo can make the next answer more specific.'

  return (
    <section className={`gala-page-background relative overflow-hidden px-5 py-5 text-[var(--text)] ${className} min-h-[calc(100dvh-88px)]`}>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-12 top-8 h-40 w-40 rounded-full bg-[rgba(160,201,255,0.24)] blur-3xl" />
        <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-[rgba(192,202,255,0.22)] blur-3xl" />
        <div className="absolute bottom-0 right-1/3 h-36 w-36 rounded-full bg-[rgba(201,235,255,0.24)] blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100dvh-128px)] w-full max-w-[430px] flex-col gap-5">
        <div>
          <p className="text-[0.9rem] font-black uppercase tracking-[0.12em] text-slate-500">Your question</p>
          <div className="mt-2.5 w-full rounded-[18px] border border-[rgba(20,35,58,0.14)] bg-white/88 px-4 py-3.5">
            <p className="text-[1rem] font-bold leading-7 tracking-[-0.01em] text-slate-950">{question}</p>
          </div>
        </div>

        <div className="flex items-center justify-center">
          <img src={chibiImage} alt="" className="h-[220px] w-auto max-w-full object-contain" loading="lazy" />
        </div>

        <div className="grid gap-4 border-t border-[rgba(20,35,58,0.08)] pt-4">
          {parsedSections.length >= 2 ? parsedSections.map((section, index) => {
            const SectionIcon = getAskAiSectionIcon(section.title)
            const bulletOnlyLines = section.lines
              .filter((line) => /^(?:[-*]|â€¢)\s+/.test(line))
              .map((line) => line.replace(/^(?:[-*]|â€¢)\s+/, ''))
            const plainLines = section.lines.filter((line) => line && !/^(?:[-*]|â€¢)\s+/.test(line))

            return (
              <div key={`${section.title}-${index}`} className={`grid gap-2 ${index === 0 ? '' : 'border-t border-[rgba(20,35,58,0.08)] pt-4'}`}>
                <p className="flex items-center gap-2 text-[0.98rem] font-black text-slate-950">
                  <SectionIcon className="h-4 w-4 text-[var(--accent-deep)]" />
                  {section.title}
                </p>
                {bulletOnlyLines.length > 0 ? (
                  <ul className="space-y-2 pl-5 text-[0.95rem] leading-7 text-slate-800">
                    {bulletOnlyLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
                {plainLines.length > 0 ? (
                  <div className="grid gap-2 text-[0.95rem] leading-7 text-slate-800">
                    {plainLines.map((line, lineIndex) => (
                      <p key={`${section.title}-${lineIndex}`}>{line}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          }) : (
            <>
              <div className="grid gap-2">
                <p className="flex items-center gap-2 text-[0.98rem] font-black text-slate-950">
                  <SparkIcon className="h-4 w-4 text-[var(--accent-deep)]" />
                  Quick answer
                </p>
                <p className="text-[0.95rem] leading-7 text-slate-800">{quickAnswer}</p>
              </div>

              <div className="grid gap-2 border-t border-[rgba(20,35,58,0.08)] pt-4">
                <p className="flex items-center gap-2 text-[0.98rem] font-black text-slate-950">
                  <HeartOutlineIcon className="h-4 w-4 text-[var(--accent-deep)]" />
                  Best plan
                </p>
                {bulletLines.length > 0 ? (
                  <ul className="space-y-2 pl-5 text-[0.95rem] leading-7 text-slate-800">
                    {bulletLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <AskAiAnswerBody answer={answer} />
                )}
              </div>

              <div className="grid gap-2 border-t border-[rgba(20,35,58,0.08)] pt-4">
                <p className="flex items-center gap-2 text-[0.98rem] font-black text-slate-950">
                  <BuildingIcon className="h-4 w-4 text-[var(--accent-deep)]" />
                  Why this works
                </p>
                <p className="text-[0.95rem] leading-7 text-slate-800">{whyThisWorks}</p>
              </div>

              <div className="grid gap-2 border-t border-[rgba(20,35,58,0.08)] pt-4">
                <p className="flex items-center gap-2 text-[0.98rem] font-black text-slate-950">
                  <CafeIcon className="h-4 w-4 text-[var(--accent-deep)]" />
                  Tip
                </p>
                <p className="text-[0.95rem] leading-7 text-slate-800">{tipLine}</p>
              </div>
            </>
          )}

          <div className="grid gap-2 border-t border-[rgba(20,35,58,0.08)] pt-4">
            <p className="flex items-center gap-2 text-[0.98rem] font-black text-slate-950">
              <MuseumIcon className="h-4 w-4 text-[var(--accent-deep)]" />
              Other actions
            </p>
            <button
              type="button"
              onClick={onStartOver}
              className="group flex items-center justify-between gap-3 rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-[linear-gradient(135deg,#0f172a,#1d4ed8)] px-4 py-4 text-left shadow-[0_18px_42px_rgba(29,78,216,0.22)] transition hover:-translate-y-[1px] hover:shadow-[0_22px_48px_rgba(29,78,216,0.28)]"
            >
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/72">Reset Ask AI</p>
                <p className="mt-1 text-sm font-black text-white">Start over</p>
                <p className="mt-1 text-xs leading-5 text-white/78">Ask a new question or rewrite this one.</p>
              </div>
              <ChevronRightIcon className="h-5 w-5 shrink-0 text-white transition group-hover:translate-x-0.5" />
            </button>

            <button
              type="button"
              onClick={onOpenPromptBuilder}
              className="flex items-center justify-between gap-3 rounded-[18px] border border-[rgba(83,146,241,0.14)] bg-[rgba(255,255,255,0.72)] px-4 py-3.5 text-left transition hover:border-[var(--accent)]"
            >
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-950">Use Prompt Builder</p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Tighten the prompt before asking again.</p>
              </div>
              <ChevronRightIcon className="h-5 w-5 shrink-0 text-[var(--accent-deep)]" />
            </button>

          </div>

          {sources.length > 0 ? (
            <div className="grid gap-2 border-t border-[rgba(20,35,58,0.08)] pt-4">
              <p className="text-[0.98rem] font-black text-slate-950">Sources</p>
              <div className="grid gap-2.5">
                {sources.map((source) => (
                  <a
                    key={source.url}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-[64px] items-center justify-between gap-3 rounded-[18px] border border-[rgba(83,146,241,0.14)] bg-[rgba(255,255,255,0.7)] px-4 py-3 transition hover:border-[var(--accent)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950">{source.title}</p>
                      <p className="mt-1 truncate text-xs font-medium text-[var(--muted)]">{getSourceHostname(source.url)}</p>
                    </div>
                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-[var(--accent-deep)]" />
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function AskAiOutputStageNext({
  question,
  answer,
  sources,
  chibiImage,
  onOpenPromptBuilder,
  onStartOver,
  className = '',
}: {
  question: string
  answer: string
  sources: AskAiSource[]
  chibiImage: string
  onOpenPromptBuilder: () => void
  onStartOver: () => void
  className?: string
}) {
  const parsedSections = parseAskAiSections(answer)
  const displaySections = parsedSections.length > 0
    ? parsedSections
    : [{ title: 'Plan', lines: getAskAiDisplayLines(answer).filter(Boolean) }]

  return (
    <section className={`gala-page-background relative overflow-x-hidden overflow-y-auto px-4 py-4 text-[var(--text)] sm:px-5 sm:py-5 ${className} min-h-[calc(100dvh-88px)]`}>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-8 h-36 w-36 -translate-x-1/2 rounded-full bg-[rgba(148,163,184,0.08)] blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100dvh-120px)] w-full max-w-[680px] flex-col gap-4 sm:gap-5">
        <div className="flex justify-center pt-1">
          <img src={chibiImage} alt="" className="h-[188px] w-auto max-w-none object-contain sm:h-[228px]" loading="lazy" />
        </div>

        <div className="flex justify-end">
          <div className="max-w-[88%] rounded-[26px] rounded-br-[12px] bg-[#2f74e8] px-4 py-3.5 text-white shadow-[0_10px_20px_rgba(47,116,232,0.14)] sm:max-w-[76%]">
            <p className="text-[0.64rem] font-black uppercase tracking-[0.14em] text-white/68">You</p>
            <p className="mt-1.5 text-[0.97rem] font-medium leading-7">{question}</p>
          </div>
        </div>

        <div className="flex justify-start">
          <div className="min-w-0 w-full max-w-full">
            <div className="overflow-hidden rounded-[28px] border border-[rgba(15,23,42,0.08)] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
              <div className="flex items-center gap-3 border-b border-[rgba(15,23,42,0.06)] px-4 py-3.5 sm:px-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                  <SparkIcon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-900">
                    GalaTayo <span className="text-[var(--accent-deep)]">AI</span>
                  </p>
                  <p className="text-xs text-slate-500">Curated plan for your <span className="font-semibold text-slate-700">gala idea</span></p>
                </div>
                <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-600">
                  Answer
                </span>
              </div>

              <div className="bg-[linear-gradient(180deg,#ffffff_0%,#fbfcfe_100%)] px-3 py-3 sm:px-4 sm:py-4">
                <div className="grid gap-3">
                  {displaySections.map((section, index) => (
                    <AskAiStructuredSection
                      key={`${section.title}-${index}`}
                      section={section}
                      isPrimary={index === 0}
                    />
                  ))}
                </div>
              </div>
            </div>

            {sources.length > 0 ? (
              <div className="mt-4 overflow-hidden rounded-[24px] border border-[rgba(15,23,42,0.08)] bg-white shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
                <div className="flex items-center gap-2 border-b border-[rgba(15,23,42,0.06)] px-4 py-3 sm:px-5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    <BuildingIcon className="h-3.5 w-3.5" />
                  </span>
                  <p className="text-sm font-black text-slate-900">Sources</p>
                </div>
                <div className="grid gap-2 p-3 sm:p-4">
                  {sources.map((source) => (
                    <a
                      key={source.url}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-[54px] items-center justify-between gap-3 rounded-[18px] bg-slate-50 px-3.5 py-3 text-sm transition hover:bg-slate-100"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-bold text-slate-900">{source.title}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{getSourceHostname(source.url)}</p>
                      </div>
                      <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400" />
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={onOpenPromptBuilder}
                className="flex min-h-[56px] items-center justify-between gap-3 rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3.5 text-left shadow-[0_8px_20px_rgba(15,23,42,0.04)] transition hover:border-[rgba(47,116,232,0.18)] hover:bg-slate-50"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                    <SparkIcon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-black text-slate-950">Use Prompt Builder</span>
                    <span className="block text-xs leading-5 text-[var(--muted)]">Refine this idea before you ask again.</span>
                  </span>
                </span>
                <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={onStartOver}
                className="inline-flex items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-black text-slate-500 transition hover:bg-white/72 hover:text-slate-900"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Start over
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function AskAiThinkingStageNext({
  question,
  chibiImage,
  className = '',
}: {
  question: string
  chibiImage: string
  className?: string
}) {
  const [miniGameReady] = useState(true)
  const [miniGameOpen, setMiniGameOpen] = useState(false)

  useEffect(() => {
    if (!miniGameOpen) {
      return
    }

    const previousBodyOverflow = document.body.style.overflow
    const previousHtmlOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousHtmlOverflow
    }
  }, [miniGameOpen])

  return (
    <section className={`gala-page-background relative overflow-hidden px-5 py-5 text-[var(--text)] ${className} min-h-[calc(100dvh-88px)]`}>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-12 top-8 h-40 w-40 rounded-full bg-[rgba(160,201,255,0.24)] blur-3xl" />
        <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-[rgba(192,202,255,0.22)] blur-3xl" />
        <div className="absolute bottom-0 right-1/3 h-36 w-36 rounded-full bg-[rgba(201,235,255,0.24)] blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100dvh-128px)] w-full max-w-[560px] flex-col">
        <h1 className="mt-6 text-[2.4rem] font-black leading-none tracking-[-0.04em] text-slate-950">
          <span className="text-slate-950">Ask </span>
          <span className="text-[var(--accent-deep)]">AI</span>
        </h1>

        <div className="mt-7">
          <p className="text-[0.9rem] font-black uppercase tracking-[0.12em] text-slate-500">Your question</p>
          <div className="mt-2.5 w-full rounded-[18px] border border-[rgba(20,35,58,0.14)] bg-white/88 px-4 py-3.5">
            <p className="text-[1rem] font-bold leading-7 tracking-[-0.01em] text-slate-950">{question}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-1 flex-col justify-start">
          <div className="mb-3 flex items-center justify-center overflow-visible py-3">
            <img
              src={chibiImage}
              alt=""
              className="h-auto w-[118%] max-w-none scale-[1.12] object-contain sm:w-[112%] sm:scale-[1.15]"
              loading="lazy"
            />
          </div>

          <div className="-mt-1 grid gap-3">
            <div className="w-full rounded-[20px] border border-[rgba(20,35,58,0.1)] bg-white/76 px-4 py-4">
              <p className="text-[1rem] font-black text-slate-950">Generating your <span className="text-[var(--accent-deep)]">gala plan</span></p>
              <p className="mt-1 text-sm leading-6 text-slate-500">Ask AI is shaping your GalaTayo idea. This usually takes a few seconds.</p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[rgba(20,35,58,0.08)]">
                <div className="h-full w-2/3 rounded-full bg-[linear-gradient(90deg,#6fa8ff,#2f80ed)] motion-safe:animate-[gala-loading-slide_1.6s_ease-in-out_infinite]" />
              </div>
            </div>

            {miniGameReady ? (
              <div className="relative overflow-hidden rounded-[24px] border border-[rgba(37,99,235,0.14)] bg-white/78 p-3 backdrop-blur-xl animate-[gala-game-invite-pop_360ms_cubic-bezier(0.16,1,0.3,1)_both]">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(94,214,199,0.18),transparent_24%),radial-gradient(circle_at_82%_18%,rgba(255,111,157,0.14),transparent_24%),linear-gradient(135deg,#f8fbff,#fff7fb)]" />
                <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(37,99,235,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(37,99,235,0.06)_1px,transparent_1px)] [background-size:22px_22px]" />
                <div className="relative grid grid-cols-[52px_1fr] gap-3">
                  <button
                    type="button"
                    onClick={() => setMiniGameOpen(true)}
                    className="group relative flex h-[52px] w-[52px] items-center justify-center rounded-full bg-slate-950 text-white transition hover:scale-105 active:scale-95"
                    aria-label="Play Pin Rush"
                  >
                    <span className="absolute inset-[-7px] rounded-full border border-[rgba(37,99,235,0.24)] animate-[gala-ring-pulse_1.2s_ease-out_infinite]" />
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="relative h-5 w-5 transition group-hover:translate-y-[-1px]">
                      <path d="M12 21s6-5.7 6-11a6 6 0 1 0-12 0c0 5.3 6 11 6 11Z" />
                      <circle cx="12" cy="10" r="2.3" />
                    </svg>
                  </button>

                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#2563eb]">Still cooking</p>
                        <p className="mt-0.5 text-[1rem] font-black leading-tight text-slate-950">Play while you wait?</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
                        Optional
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-5 text-slate-600">Pin Rush is ready. Tiny taps, streaks, charms.</p>
                  </div>
                </div>

                <div className="relative mt-3 grid grid-cols-[1fr_auto] items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMiniGameOpen(true)}
                    className="flex min-w-0 items-center gap-2 rounded-full bg-white/70 px-3 py-2 text-left transition hover:bg-white"
                  >
                    <span className="flex h-5 w-14 shrink-0 items-center rounded-full bg-[linear-gradient(90deg,#dbeafe,#fce7f3)] px-1">
                      <span className="h-3 w-3 rounded-full bg-[#2563eb] animate-[gala-mini-pin-run_1.4s_ease-in-out_infinite]" />
                    </span>
                    <span className="truncate text-[11px] font-black text-slate-600">Streak boosts unlock charms</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMiniGameOpen(true)}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-slate-950 px-4 text-sm font-black text-white transition hover:brightness-110 active:scale-95"
                  >
                    Play
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {miniGameOpen ? createPortal(
          <div
            className="fixed inset-0 z-[9990] flex h-[100dvh] items-stretch justify-center overscroll-none bg-white"
            role="presentation"
            onClick={() => setMiniGameOpen(false)}
          >
            <div
              className="relative flex h-[100dvh] w-full flex-col overflow-hidden touch-auto"
              role="dialog"
              aria-modal="true"
              aria-label="Tap the Gala Pin mini game"
              onClick={(event) => event.stopPropagation()}
            >
              <TapGalaPinGame isLoading={true} onClose={() => setMiniGameOpen(false)} className="min-h-0 w-full flex-1" />
            </div>
          </div>,
          document.body,
        ) : null}
      </div>
    </section>
  )
}

function AskAiModePanel({
  isRegistered,
  isSessionLoading,
  usageStatus,
  isUsageLoading,
  usageError,
  question,
  answer,
  sources,
  isSubmitting,
  answerError,
  onRetryUsage,
  onQuestionChange,
  onSubmit,
  onSwitchToPlaces,
  onStartOver,
  onOpenPromptBuilder,
  className = '',
}: {
  isRegistered: boolean
  isSessionLoading: boolean
  usageStatus: AskAiUsageStatus | null
  isUsageLoading: boolean
  usageError: string | null
  question: string
  answer: string
  sources: AskAiSource[]
  isSubmitting: boolean
  answerError: string | null
  onRetryUsage: () => void
  onQuestionChange: (question: string) => void
  onSubmit: (questionOverride?: string) => void
  onSwitchToPlaces: () => void
  onStartOver: () => void
  onOpenPromptBuilder: (questionOverride?: string) => void
  className?: string
}) {
  const hasActiveAskAiView = Boolean(question.trim() || isSubmitting || answer || answerError || sources.length)

  if (hasActiveAskAiView) {
    return (
      <AskAiPlaceholder
        usageStatus={usageStatus}
        isUsageLoading={isUsageLoading}
        question={question}
        answer={answer}
        sources={sources}
        isSubmitting={isSubmitting}
        answerError={answerError}
        onQuestionChange={onQuestionChange}
        onSubmit={onSubmit}
        onSwitchToPlaces={onSwitchToPlaces}
        onStartOver={onStartOver}
        onOpenPromptBuilder={onOpenPromptBuilder}
        className={className}
      />
    )
  }

  if (!isSessionLoading && !isRegistered) {
    return <AskAiSignInRequired className={className} onOpenPromptBuilder={onOpenPromptBuilder} onBack={onSwitchToPlaces} />
  }

  if (!isSessionLoading && usageError) {
    return (
      <section className={`gala-page-background flex min-h-[280px] items-center justify-center px-4 py-8 ${className}`}>
        <div className="w-full max-w-[520px]">
          <AskAiBackButton onClick={onSwitchToPlaces} className="mb-4 w-fit" />
          <div className="rounded-lg border border-[var(--line)] bg-white px-5 py-7 text-center shadow-[0_14px_30px_rgba(28,77,160,0.07)]">
            <p className="text-base font-semibold text-slate-900">
              <span className="text-slate-900">Ask </span>
              <span className="text-[var(--accent-deep)]">AI</span> usage is unavailable.
            </p>
            <p className="mx-auto mt-2 max-w-[380px] text-sm leading-relaxed text-[var(--muted)]">
              {usageError ?? 'Try checking your daily Ask AI status again.'}
            </p>
            <button
              type="button"
              onClick={onRetryUsage}
              className="mt-4 rounded-full border border-[var(--accent)] bg-white px-4 py-2 text-sm font-semibold text-[var(--accent-deep)] transition hover:bg-[var(--accent-wash)]"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => onOpenPromptBuilder()}
              className="ml-2 mt-4 rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)] hover:text-[var(--accent-deep)]"
            >
              Build prompt
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <AskAiPlaceholder
      usageStatus={usageStatus}
      isUsageLoading={isUsageLoading}
      question={question}
      answer={answer}
      sources={sources}
      isSubmitting={isSubmitting}
      answerError={answerError}
      onQuestionChange={onQuestionChange}
      onSubmit={onSubmit}
      onSwitchToPlaces={onSwitchToPlaces}
      onStartOver={onStartOver}
      onOpenPromptBuilder={onOpenPromptBuilder}
      className={className}
    />
  )
}

function HomePage({
  initialMode = 'places',
  initialPromptBuilderOpen = false,
  initialSearchState,
  initialAskAiQuestion = '',
}: HomePageProps) {
  const initialAskAiRuntimeStateRef = useRef(
    initialMode === 'ask-ai' && hasActiveAskAiRuntimeState()
      ? getAskAiRuntimeState()
      : null
  )
  const initialAskAiRouteCacheRef = useRef<AskAiRouteCache | null>(
    initialMode === 'ask-ai' ? readAskAiRouteCache() : null
  )
  const initialAskAiRuntimeState = initialAskAiRuntimeStateRef.current
  const initialAskAiRouteCache = initialAskAiRouteCacheRef.current
  const initialAskAiState = initialAskAiRuntimeState ?? initialAskAiRouteCache
  const normalizedInitialAskAiQuestion = normalizeSearchText(initialAskAiQuestion)
  const shouldUseCachedAskAiState =
    initialMode === 'ask-ai' &&
    Boolean(initialAskAiState) &&
    (
      !normalizedInitialAskAiQuestion ||
      initialAskAiState?.question === normalizedInitialAskAiQuestion
    )
  const supportsSearchRouteCache = initialMode === 'places' && isSearchResultsRoute()
  const showBackHomeLink = Boolean(initialSearchState?.autoSearch)
  const initialRequestedPage =
    typeof initialSearchState?.page === 'number' && Number.isFinite(initialSearchState.page) && initialSearchState.page > 0
      ? Math.floor(initialSearchState.page)
      : 1
  const initialRouteCacheRef = useRef<SearchRouteCache | null>(
    supportsSearchRouteCache ? readSearchRouteCache() : null
  )
  const initialRouteCache = initialRouteCacheRef.current
  const [selectedMode, setSelectedMode] = useState<SearchMode>(initialMode)
  const [session, setSession] = useState<Session | null>(null)
  const [isSessionLoading, setIsSessionLoading] = useState(true)
  const [askAiUsageStatus, setAskAiUsageStatus] = useState<AskAiUsageStatus | null>(
    shouldUseCachedAskAiState
      ? initialAskAiState?.usageStatus ?? null
      : null
  )
  const [isAskAiUsageLoading, setIsAskAiUsageLoading] = useState(false)
  const [askAiUsageError, setAskAiUsageError] = useState<string | null>(null)
  const [askAiUsageRefreshSignal, setAskAiUsageRefreshSignal] = useState(0)
  const [askAiQuestion, setAskAiQuestion] = useState(
    shouldUseCachedAskAiState
      ? initialAskAiState?.question ?? ''
      : initialAskAiQuestion
  )
  const [askAiAnswer, setAskAiAnswer] = useState(
    shouldUseCachedAskAiState
      ? initialAskAiState?.answer ?? ''
      : ''
  )
  const [askAiSources, setAskAiSources] = useState<AskAiSource[]>(
    shouldUseCachedAskAiState
      ? initialAskAiState?.sources ?? []
      : []
  )
  const [isAskAiSubmitting, setIsAskAiSubmitting] = useState(
    shouldUseCachedAskAiState
      ? initialAskAiState?.isSubmitting === true
      : false
  )
  const [askAiAnswerError, setAskAiAnswerError] = useState<string | null>(
    shouldUseCachedAskAiState
      ? initialAskAiState?.answerError ?? null
      : null
  )
  const [isPromptBuilderOpen, setIsPromptBuilderOpen] = useState(initialPromptBuilderOpen)
  const [promptBuilderInitialState, setPromptBuilderInitialState] = useState<PromptBuilderState | null>(null)
  const [categories, setCategories] = useState(fallbackCategories)
  const [areas, setAreas] = useState<AreaChip[]>(fallbackAreas)
  const [rawQuery, setRawQuery] = useState(normalizeSearchText(initialSearchState?.rawQuery ?? ''))
  const [selectedCategory, setSelectedCategory] = useState<string | null>(initialSearchState?.categoryId ?? null)
  const [selectedArea, setSelectedArea] = useState<string | null>(initialSearchState?.areaId ?? null)
  const [selectedGoodFor, setSelectedGoodFor] = useState<SearchGoodForValue | null>(initialSearchState?.goodFor ?? null)
  const [selectedBudget, setSelectedBudget] = useState<BudgetValue | null>(initialSearchState?.budget ?? null)
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(
    initialRouteCache?.pendingScrollRestore ? initialRouteCache.selectedPlaceId : null
  )
  const [currentPage, setCurrentPage] = useState(
    initialSearchState?.autoSearch ? initialRequestedPage : (initialRouteCache?.currentPage ?? 1)
  )
  const [mobileResultsView, setMobileResultsView] = useState<MobileResultsViewMode>(
    initialRouteCache?.mobileResultsView ?? 'cards'
  )
  const [isInitialSearching, setIsInitialSearching] = useState(
    Boolean(initialSearchState?.autoSearch && supportsSearchRouteCache && !initialRouteCache)
  )
  const [isRefreshingSearch, setIsRefreshingSearch] = useState(false)
  const [isPageLoading, setIsPageLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchValidationMessage, setSearchValidationMessage] = useState<string | null>(null)
  const [promptLogin, setPromptLogin] = useState(false)
  const [lastSearchQuery, setLastSearchQuery] = useState(initialRouteCache?.lastSearchQuery ?? '')
  const [activeSearchLabel, setActiveSearchLabel] = useState(
    initialRouteCache?.activeSearchLabel ?? initialRouteCache?.lastSearchQuery ?? ''
  )
  const [searchId, setSearchId] = useState<string | null>(initialRouteCache?.searchId ?? null)
  const [searchResults, setSearchResults] = useState<PlaceCardData[]>(initialRouteCache?.searchResults ?? [])
  const [searchTotalCount, setSearchTotalCount] = useState(initialRouteCache?.totalCount ?? initialRouteCache?.searchResults.length ?? 0)
  const [searchTotalPages, setSearchTotalPages] = useState(initialRouteCache?.totalPages ?? 1)
  const [hasSearched, setHasSearched] = useState(Boolean(initialRouteCache))
  const hasRestoredInitialScrollRef = useRef(false)
  const searchRequestVersion = useRef(0)
  const didAutoSubmitAskAiRef = useRef(false)
  const desktopResultsScrollRef = useRef<HTMLElement | null>(null)
  const selectedCategoryName = useMemo(
    () =>
      selectedCategory
        ? categories.find((category) => category.id === selectedCategory)?.name ?? null
        : null,
    [categories, selectedCategory]
  )
  const selectedAreaName = useMemo(
    () => (selectedArea ? areas.find((area) => area.id === selectedArea)?.name ?? null : null),
    [areas, selectedArea]
  )
  const selectedBudgetLabel = useMemo(
    () => (selectedBudget ? budgetOptions.find((budget) => budget.value === selectedBudget)?.label ?? null : null),
    [selectedBudget]
  )
  const selectedGoodForName = useMemo(
    () => (selectedGoodFor ? fallbackGoodForOptions.find((option) => option.id === selectedGoodFor)?.name ?? null : null),
    [selectedGoodFor]
  )
  const searchSentence = buildSearchSentence({
    categoryLabel: selectedCategoryName,
    areaName: selectedAreaName,
    budgetLabel: selectedBudgetLabel,
  })
  const searchResultSummary = useMemo(
    () =>
      buildSearchResultSummary({
        count: searchTotalCount,
        rawQuery,
        categoryLabel: selectedCategoryName,
        areaName: selectedAreaName,
        goodForLabel: selectedGoodForName,
        budgetLabel: selectedBudgetLabel,
      }),
    [rawQuery, searchTotalCount, selectedAreaName, selectedBudgetLabel, selectedCategoryName, selectedGoodForName]
  )
  const visiblePlaces = hasSearched ? searchResults : []
  const totalResults = searchTotalCount
  const totalPages = Math.max(1, searchTotalPages)
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages)
  const selectedPlace = selectedPlaceId ? visiblePlaces.find((place) => place.id === selectedPlaceId) ?? null : null
  const shouldShowGuidedSearch = selectedMode === 'places' && !hasSearched && !initialSearchState?.autoSearch
  const isRegisteredUser = Boolean(session?.user)
  const isSearching = isInitialSearching || isRefreshingSearch
  const shouldShowSearchLoadingState = selectedMode === 'places' && isInitialSearching
  const buildFilterOnlyQuery = ({
    category,
    area,
    goodFor,
    budget,
  }: {
    category: string | null
    area: string | null
    goodFor: SearchGoodForValue | null
    budget: BudgetValue | null
  }) => {
    const categoryLabel = category ? categories.find((entry) => entry.id === category)?.name ?? null : null
    const areaName = area ? areas.find((entry) => entry.id === area)?.name ?? null : null
    const goodForLabel = goodFor ? fallbackGoodForOptions.find((entry) => entry.id === goodFor)?.name ?? null : null
    const budgetLabel = budget ? budgetOptions.find((entry) => entry.value === budget)?.label ?? null : null

    return normalizeSearchText(
      buildFilterSearchText({
        rawQuery: '',
        categoryLabel,
        areaName,
        goodForLabel,
        budgetLabel,
      })
    )
  }
  const hasIndependentTypedQuery = ({
    query,
    category,
    area,
    goodFor,
    budget,
  }: {
    query: string
    category: string | null
    area: string | null
    goodFor: SearchGoodForValue | null
    budget: BudgetValue | null
  }) => {
    const normalizedQuery = normalizeSearchText(query)

    if (!normalizedQuery) {
      return false
    }

    const filterOnlyQuery = buildFilterOnlyQuery({ category, area, goodFor, budget })
    return !filterOnlyQuery || normalizedQuery !== filterOnlyQuery
  }
  const clearFilterChip = (key: 'category' | 'city' | 'good_for' | 'budget') => {
    const nextState = {
      category: key === 'category' ? null : selectedCategory,
      area: key === 'city' ? null : selectedArea,
      goodFor: key === 'good_for' ? null : selectedGoodFor,
      budget: key === 'budget' ? null : selectedBudget,
      page: 1,
    }

    submitResultFilterChange(nextState)
  }
  const submitResultFilterChange = (
    nextState: Partial<{
      rawQuery: string
      category: string | null
      area: string | null
      goodFor: SearchGoodForValue | null
      budget: BudgetValue | null
      page: number
    }>
  ) => {
    const mergedState = {
      rawQuery,
      category: selectedCategory,
      area: selectedArea,
      goodFor: selectedGoodFor,
      budget: selectedBudget,
      page: 1,
      ...nextState,
    }
    const categoryLabel = mergedState.category
      ? categories.find((category) => category.id === mergedState.category)?.name ?? null
      : null
    const areaName = mergedState.area ? areas.find((area) => area.id === mergedState.area)?.name ?? null : null
    const goodForLabel = mergedState.goodFor
      ? fallbackGoodForOptions.find((option) => option.id === mergedState.goodFor)?.name ?? null
      : null
    const budgetLabel = mergedState.budget
      ? budgetOptions.find((budget) => budget.value === mergedState.budget)?.label ?? null
      : null
    const hasFilterUpdate =
      Object.prototype.hasOwnProperty.call(nextState, 'category') ||
      Object.prototype.hasOwnProperty.call(nextState, 'area') ||
      Object.prototype.hasOwnProperty.call(nextState, 'goodFor') ||
      Object.prototype.hasOwnProperty.call(nextState, 'budget')

    if (hasFilterUpdate) {
      const shouldPreserveQuery = hasIndependentTypedQuery({
        query: rawQuery,
        category: selectedCategory,
        area: selectedArea,
        goodFor: selectedGoodFor,
        budget: selectedBudget,
      })

      mergedState.rawQuery = shouldPreserveQuery
        ? normalizeSearchText(rawQuery)
        : buildFilterSearchText({
            rawQuery: '',
            categoryLabel,
            areaName,
            goodForLabel,
            budgetLabel,
          })
    }

    if (!mergedState.rawQuery && !mergedState.category && !mergedState.area && !mergedState.goodFor && !mergedState.budget) {
      handleClearSearch()
      return
    }

    void handleSearch(mergedState)
  }
  const handleRetryAskAiUsage = () => {
    setAskAiUsageRefreshSignal((signal) => signal + 1)
  }
  const handleRawQueryChange = (query: string) => {
    setRawQuery(query)
    if (searchValidationMessage) {
      setSearchValidationMessage(null)
    }
    if (searchError) {
      setSearchError(null)
    }
  }

  const openPromptBuilder = (
    source: 'ask-ai' | 'search' | 'empty-search' = 'search',
    questionOverride?: string,
  ) => {
    const prefill = source === 'ask-ai'
      ? createPromptBuilderPrefill({
          plan: questionOverride ?? askAiQuestion,
        })
      : createPromptBuilderPrefill({
          plan: lastSearchQuery && lastSearchQuery !== 'Explore all places' ? lastSearchQuery : null,
          location: selectedAreaName,
          budget: selectedBudgetLabel,
          priority: selectedCategoryName,
        })

    setPromptBuilderInitialState(prefill)
    setIsPromptBuilderOpen(true)
  }

  const handleAskAiSubmit = async (questionOverride?: string) => {
    const question = normalizeSearchText(questionOverride ?? askAiQuestion)

    if (!question || isAskAiSubmitting || !session?.access_token) {
      return
    }

    setAskAiQuestion(question)
    await submitAskAiRuntimeRequest({
      question,
      accessToken: session.access_token,
      apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
    })
  }

  const handleStartOverAskAi = () => {
    resetAskAiRuntimeState({
      usageStatus: askAiUsageStatus,
    })
    setAskAiQuestion('')
    setAskAiAnswer('')
    setAskAiSources([])
    setAskAiAnswerError(null)
    setAskAiUsageError(null)

    if (!askAiUsageStatus && session?.access_token) {
      setAskAiUsageRefreshSignal((current) => current + 1)
    }

    clearAskAiRouteCache()
  }

  const handleSwitchToPlaces = () => {
    navigateToPath('/')
  }

  const handleClearSearch = () => {
    if (supportsSearchRouteCache) {
      window.sessionStorage.removeItem(getCurrentSearchRouteCacheKey())
    }

    searchRequestVersion.current += 1
    setRawQuery('')
    setSelectedCategory(null)
    setSelectedArea(null)
    setSelectedGoodFor(null)
    setSelectedBudget(null)
    setIsInitialSearching(false)
    setIsRefreshingSearch(false)
    setIsPageLoading(false)
    setSearchError(null)
    setSearchValidationMessage(null)
    setPromptLogin(false)
    setLastSearchQuery('')
    setActiveSearchLabel('')
    setSearchId(null)
    setSearchResults([])
    setSearchTotalCount(0)
    setSearchTotalPages(1)
    setHasSearched(false)
    setSelectedPlaceId(null)
    setCurrentPage(1)
    setMobileResultsView('cards')
    navigateToPath('/search')
  }

  const handlePlaceSelect = (placeId: string) => {
    const place = visiblePlaces.find((visiblePlace) => visiblePlace.id === placeId)
    const canonicalPlaceSlug = place?.slug?.trim()

    if (searchId) {
      console.log('Selected place from search:', { placeId, slug: canonicalPlaceSlug, searchId })
    }

    setSelectedPlaceId(placeId)
    if (canonicalPlaceSlug) {
      try {
        const searchUrl = `${window.location.pathname}${window.location.search}`
        const label = rawQuery?.trim() || activeSearchLabel?.replace(/^Showing\s+/, '')?.trim() || ''
        const returnLabel = label || 'search results'
        window.sessionStorage.setItem(`galatayo:place-return:${canonicalPlaceSlug}`, JSON.stringify({
          returnTo: searchUrl,
          returnLabel,
        }))
      } catch {
        // sessionStorage may be unavailable, ignore
      }

      writeSearchRouteCache({
        lastSearchQuery,
        activeSearchLabel,
        searchId,
        searchResults,
        totalCount: searchTotalCount,
        totalPages: searchTotalPages,
        selectedPlaceId: placeId,
        currentPage: safeCurrentPage,
        mobileResultsView,
        scrollY: window.scrollY,
        desktopScrollTop: desktopResultsScrollRef.current?.scrollTop ?? 0,
        selectedPlaceViewportTop: getSearchPlaceViewportTop(placeId),
        pendingScrollRestore: true,
      })
      navigateToCanonicalPlace({
        slug: canonicalPlaceSlug,
        city: place?.city,
        area: place?.area,
        localArea: place?.localArea,
      })
    }
  }

  useEffect(() => {
    if (!hasSearched) {
      if (currentPage !== 1) {
        setCurrentPage(1)
      }
      return
    }

    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage)
      return
    }

    if (selectedPlaceId && !visiblePlaces.some((place) => place.id === selectedPlaceId)) {
      setSelectedPlaceId(null)
    }
  }, [currentPage, hasSearched, safeCurrentPage, selectedPlaceId, visiblePlaces])

  const handleMapPlaceSelect = (placeId: string) => {
    setSelectedPlaceId(placeId)
  }

  const handlePageChange = (page: number) => {
    const nextPage = Math.min(Math.max(page, 1), totalPages)

    if (nextPage === safeCurrentPage) {
      return
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
    desktopResultsScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' })

    void handleSearch({ page: nextPage }, true)
  }

  const handleFilterChange = (key: 'category' | 'area' | 'good_for' | 'budget', value: string | BudgetValue | SearchGoodForValue | null) => {
    setSearchValidationMessage(null)
    setSearchError(null)

    const nextCategory = key === 'category' ? (value as string | null) : selectedCategory
    const nextArea = key === 'area' ? (value as string | null) : selectedArea
    const nextBudget = key === 'budget' ? (value as BudgetValue | null) : selectedBudget

    const shouldPreserveQuery = hasIndependentTypedQuery({
      query: rawQuery,
      category: selectedCategory,
      area: selectedArea,
      goodFor: selectedGoodFor,
      budget: selectedBudget,
    })

    if (!shouldPreserveQuery) {
      const nextCategoryLabel = nextCategory ? categories.find((entry) => entry.id === nextCategory)?.name ?? null : null
      const nextAreaLabel = nextArea ? areas.find((entry) => entry.id === nextArea)?.name ?? null : null
      const nextBudgetLabel = nextBudget ? budgetOptions.find((entry) => entry.value === nextBudget)?.label ?? null : null

      setRawQuery(
        buildGuidedComposerQuery({
          rawQuery: '',
          categoryLabel: nextCategoryLabel,
          areaName: nextAreaLabel,
          budgetLabel: nextBudgetLabel,
        })
      )
    }

    switch (key) {
      case 'area':
        setSelectedArea(value as string | null)
        return
      case 'good_for':
        setSelectedGoodFor(value as SearchGoodForValue | null)
        return
      case 'budget':
        setSelectedBudget(value as BudgetValue | null)
        return
      case 'category':
        setSelectedCategory(value as string | null)
        return
      default:
        return
    }
  }

  const handleSearch = async (
    nextState?: Partial<{
      rawQuery: string
      category: string | null
      area: string | null
      goodFor: SearchGoodForValue | null
      budget: BudgetValue | null
      page: number
    }>,
    suppressRefreshState = false,
  ) => {
    let nextRawQuery = normalizeSearchText(nextState?.rawQuery ?? rawQuery)
    const nextCategory = nextState?.category ?? selectedCategory
    const nextArea = nextState?.area ?? selectedArea
    const nextGoodFor = nextState?.goodFor ?? selectedGoodFor
    const nextBudget = nextState?.budget ?? selectedBudget
    const nextCategoryLabel = nextCategory
      ? categories.find((category) => category.id === nextCategory)?.name ?? null
      : null
    const nextAreaName = nextArea ? areas.find((area) => area.id === nextArea)?.name ?? null : null
    const nextGoodForLabel = nextGoodFor
      ? fallbackGoodForOptions.find((option) => option.id === nextGoodFor)?.name ?? null
      : null
    const nextBudgetLabel = nextBudget ? budgetOptions.find((budget) => budget.value === nextBudget)?.label ?? null : null

    if (!nextRawQuery && (nextCategory || nextArea || nextGoodFor || nextBudget)) {
      nextRawQuery = buildFilterSearchText({
        rawQuery: '',
        categoryLabel: nextCategoryLabel,
        areaName: nextAreaName,
        goodForLabel: nextGoodForLabel,
        budgetLabel: nextBudgetLabel,
      })
    }
    const nextPage = nextState?.page ?? 1
    const hasCriteria = Boolean(nextRawQuery || nextCategory || nextArea || nextGoodFor || nextBudget)

    if (!hasCriteria) {
      setSearchValidationMessage('Type a vibe or choose filters first.')
      setSearchError(null)
      return
    }

    const requestVersion = searchRequestVersion.current + 1
    searchRequestVersion.current = requestVersion
    const searchPayload = {
      query: nextRawQuery,
      page: nextPage,
      limit: SEARCH_RESULTS_PER_PAGE,
      filters: {
        category: nextCategory,
        city: nextArea,
        good_for: nextGoodFor,
        budget: nextBudget,
      },
    }
    updateSearchPageUrl({
      query: nextRawQuery,
      categoryValue: nextCategory,
      areaId: nextArea,
      goodFor: nextGoodFor,
      budget: nextBudget,
      page: nextPage,
    })

    try {
      if (suppressRefreshState) {
        setIsPageLoading(true)
      } else {
        setIsInitialSearching(true)
      }
      setSearchValidationMessage(null)
      setSearchError(null)
      setPromptLogin(false)
      setActiveSearchLabel(nextRawQuery || 'filtered GalaTayo places')

      const response = await fetch('/api/search', {
        method: 'POST',
        headers: await getSearchRequestHeaders(),
        body: JSON.stringify(searchPayload),
      })

      const data = (await response.json()) as {
        message?: string
        error?: string
        searchId?: string
        promptLogin?: boolean
        page?: number
        limit?: number
        totalCount?: number
        totalPages?: number
        places?: BackendSearchPlace[]
        geminiResponse?: string
        result?: {
          page?: number
          limit?: number
          totalCount?: number
          totalPages?: number
          geminiResponse?: string
          places?: BackendSearchPlace[]
        }
      }

      if (searchRequestVersion.current !== requestVersion) {
        return
      }

      if (data.promptLogin) {
        setPromptLogin(true)
        return
      }

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Search failed.')
      }

      setSelectedMode('places')
      setLastSearchQuery(nextRawQuery)
      setSearchId(data.searchId ?? null)
      const backendPlaces = data.places ?? data.result?.places ?? []
      const responsePage = data.page ?? data.result?.page ?? nextPage
      const responseTotalCount = data.totalCount ?? data.result?.totalCount ?? backendPlaces.length
      const responseTotalPages =
        data.totalPages ?? data.result?.totalPages ?? Math.max(1, Math.ceil(responseTotalCount / SEARCH_RESULTS_PER_PAGE))
      setRawQuery(nextRawQuery)
      setSelectedCategory(nextCategory)
      setSelectedArea(nextArea)
      setSelectedGoodFor(nextGoodFor)
      setSelectedBudget(nextBudget)
      setCurrentPage(responsePage)
      const mappedPlaces = backendPlaces
        .map(mapBackendPlaceToCard)
        .filter((place): place is PlaceCardData => Boolean(place))

      setSearchResults(mappedPlaces)
      setSearchTotalCount(responseTotalCount)
      setSearchTotalPages(responseTotalPages)
      setHasSearched(true)
      setSelectedPlaceId(null)
      setMobileResultsView('cards')
      if (supportsSearchRouteCache) {
        writeSearchRouteCache({
          lastSearchQuery: nextRawQuery,
          activeSearchLabel: nextRawQuery || 'filtered GalaTayo places',
          searchId: data.searchId ?? null,
          searchResults: mappedPlaces,
          totalCount: responseTotalCount,
          totalPages: responseTotalPages,
          selectedPlaceId: null,
          currentPage: responsePage,
          mobileResultsView: 'cards',
          scrollY: 0,
          desktopScrollTop: 0,
          selectedPlaceViewportTop: null,
          pendingScrollRestore: false,
        })
      }
      console.log('Search success:', {
        query: nextRawQuery,
        page: responsePage,
        selectedCategory: nextCategory,
        selectedArea: nextArea,
        selectedGoodFor: nextGoodFor,
        selectedBudget: nextBudget,
        data,
      })
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
        desktopResultsScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' })
      })
    } catch (error) {
      if (searchRequestVersion.current !== requestVersion) {
        return
      }

      const message = error instanceof Error ? error.message : 'Search failed.'
      setSearchError(message)
      console.error('Search request failed:', error)
    } finally {
      if (searchRequestVersion.current === requestVersion) {
        setIsInitialSearching(false)
        setIsRefreshingSearch(false)
        setIsPageLoading(false)
      }
    }
  }

  useEffect(() => {
    if (!initialSearchState?.autoSearch) {
      return
    }

    if (initialRouteCacheRef.current) {
      return
    }

    void handleSearch({
      rawQuery: initialSearchState.rawQuery ?? '',
      category: initialSearchState.categoryId ?? null,
      area: initialSearchState.areaId ?? null,
      goodFor: initialSearchState.goodFor ?? null,
      budget: initialSearchState.budget ?? null,
      page: initialRequestedPage,
    })
    // Intentionally run once for route-driven initial search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useLayoutEffect(() => {
    if (!supportsSearchRouteCache || !initialRouteCache?.pendingScrollRestore || hasRestoredInitialScrollRef.current) {
      return
    }

    hasRestoredInitialScrollRef.current = true

    restoreSearchRouteScroll(initialRouteCache, desktopResultsScrollRef)

    writeSearchRouteCache({
      ...initialRouteCache,
      pendingScrollRestore: false,
    })
  }, [initialRouteCache, supportsSearchRouteCache])

  useEffect(() => {
    if (initialMode !== 'ask-ai') {
      return
    }

    seedAskAiRuntimeState({
      question: initialAskAiState?.question ?? '',
      answer: initialAskAiState?.answer ?? '',
      sources: initialAskAiState?.sources ?? [],
      answerError: initialAskAiState?.answerError ?? null,
      usageStatus: initialAskAiState?.usageStatus ?? null,
      isSubmitting: initialAskAiState?.isSubmitting === true,
    })

    return subscribeToAskAiRuntime((runtimeState) => {
      setAskAiQuestion(runtimeState.question)
      setAskAiAnswer(runtimeState.answer)
      setAskAiSources(runtimeState.sources)
      setAskAiAnswerError(runtimeState.answerError)
      setAskAiUsageStatus(runtimeState.usageStatus)
      setIsAskAiSubmitting(runtimeState.isSubmitting)
    })
  }, [initialAskAiRuntimeState, initialAskAiState, initialMode])

  useEffect(() => {
    if (initialMode !== 'ask-ai' || didAutoSubmitAskAiRef.current) {
      return
    }

    const question = normalizeSearchText(initialAskAiQuestion)
    const runtimeState = getAskAiRuntimeState()
    const hasActiveRequestForQuestion =
      question &&
      runtimeState.question === question &&
      runtimeState.isSubmitting
    const hasCachedResultForQuestion =
      question &&
      runtimeState.question === question &&
      Boolean(runtimeState.answer || runtimeState.answerError || runtimeState.sources.length)

    if (hasActiveRequestForQuestion || hasCachedResultForQuestion) {
      didAutoSubmitAskAiRef.current = true
      return
    }

    if (!question || isSessionLoading || !session?.access_token) {
      return
    }

    didAutoSubmitAskAiRef.current = true
    void handleAskAiSubmit(question)
  }, [handleAskAiSubmit, initialAskAiQuestion, initialMode, isSessionLoading, session?.access_token])

  useEffect(() => {
    if (initialMode !== 'ask-ai') {
      return
    }

    const normalizedQuestion = normalizeSearchText(askAiQuestion)

    if (!normalizedQuestion && !askAiAnswer && !askAiSources.length && !askAiAnswerError) {
      clearAskAiRouteCache()
      return
    }

    writeAskAiRouteCache({
      question: normalizedQuestion,
      answer: askAiAnswer,
      sources: askAiSources,
      answerError: askAiAnswerError,
      usageStatus: askAiUsageStatus,
      isSubmitting: isAskAiSubmitting,
    })
  }, [askAiAnswer, askAiAnswerError, askAiQuestion, askAiSources, askAiUsageStatus, initialMode, isAskAiSubmitting])

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data.session)
        setIsSessionLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsSessionLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (selectedMode !== 'ask-ai' || isSessionLoading) {
      return
    }

    if (!session?.access_token) {
      return
    }

    const controller = new AbortController()
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
    const usageEndpoint = apiBaseUrl ? `${apiBaseUrl}/ask-ai/usage/check` : '/api/ask-ai/usage/check'

    const loadAskAiUsage = async () => {
      try {
        setIsAskAiUsageLoading(true)
        setAskAiUsageError(null)

        const response = await fetch(usageEndpoint, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          signal: controller.signal,
        })

        const data = (await response.json()) as Partial<AskAiUsageSummary> & {
          error?: string
          message?: string
        }

        if (!response.ok) {
          throw new Error(data.message || data.error || 'Failed to check Ask AI usage.')
        }

        if (!isAskAiUsageStatus(data.askAi) || !isAskAiUsageStatus(data.liveSearch)) {
          throw new Error('Ask AI usage response was incomplete.')
        }

        setAskAiUsageStatus(data.askAi)
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return
        }

        const message = error instanceof Error ? error.message : 'Failed to check Ask AI usage.'
        setAskAiUsageStatus(null)
        setAskAiUsageError(message)
      } finally {
        if (!controller.signal.aborted) {
          setIsAskAiUsageLoading(false)
        }
      }
    }

    void loadAskAiUsage()

    return () => controller.abort()
  }, [askAiUsageRefreshSignal, isSessionLoading, selectedMode, session?.access_token])

  useEffect(() => {
    const controller = new AbortController()
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
    const filtersEndpoint = apiBaseUrl ? `${apiBaseUrl}/filters` : '/api/filters'

    const loadFilters = async () => {
      try {
        const response = await fetch(filtersEndpoint, {
          method: 'GET',
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error('Failed to fetch filters.')
        }

        const data = (await response.json()) as {
          categories?: BackendCategory[]
          areas?: BackendArea[]
        }

        if (data.categories && data.categories.length > 0) {
          const mappedCategories: CategoryChip[] = data.categories.map((category) => ({
            id: category.id,
            name: category.name,
          }))

          setCategories(mappedCategories)
        }

        if (data.areas && data.areas.length > 0) {
          const mappedAreas: AreaChip[] = data.areas.map((area) => ({
            id: area.id,
            name: area.name,
            type: area.type,
          }))

          setAreas(mappedAreas)
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Using fallback filters:', error)
        }
      }
    }

    void loadFilters()

    return () => controller.abort()
  }, [])

    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
        <GuestLimitModal isOpen={promptLogin} onClose={() => setPromptLogin(false)} />

        <div className="gala-page-background min-h-screen overflow-x-hidden lg:hidden">
          <AppHeader signInLabel="Mag-sign in" minimal />

          <main className="overflow-x-hidden pb-6">
            {isPromptBuilderOpen ? (
              <PromptBuilderModal
                isOpen={isPromptBuilderOpen}
                initialState={promptBuilderInitialState}
                onClose={() => {
                  setIsPromptBuilderOpen(false)
                  if (initialPromptBuilderOpen) {
                    navigateToPath('/search')
                  }
                }}
              />
            ) : shouldShowSearchLoadingState ? (
              <SearchLoadingState searchLabel={activeSearchLabel} />
            ) : shouldShowGuidedSearch ? (
              <GuidedSearchPage
                rawQuery={rawQuery}
                searchSentence={searchSentence}
                selectedCategoryValue={selectedCategory}
                selectedArea={selectedArea}
                selectedBudget={selectedBudget}
                areas={areas}
                isSearching={isSearching}
                showBackHome={showBackHomeLink}
                validationMessage={searchValidationMessage}
                searchError={searchError}
                onRawQueryChange={handleRawQueryChange}
                onClearSearch={handleClearSearch}
                onCategoryChange={(value) => handleFilterChange('category', value)}
                onAreaChange={(value) => handleFilterChange('area', value)}
                onBudgetChange={(value) => handleFilterChange('budget', value)}
                onSubmitSearch={() => void handleSearch()}
              />
            ) : (
              <>
                {selectedMode === 'places' ? (
                  visiblePlaces.length > 0 ? (
                    <MobileResultsView
                      places={visiblePlaces}
                      totalCount={totalResults}
                      currentPage={safeCurrentPage}
                      totalPages={totalPages}
                      selectedPlace={selectedPlace}
                      selectedPlaceId={selectedPlaceId}
                      heading={searchResultSummary.heading}
                      subheading={searchResultSummary.subheading || 'in GalaTayo'}
                      cityLabel={selectedAreaName}
                      categoryLabel={selectedCategoryName}
                      goodForLabel={selectedGoodForName}
                      budgetLabel={selectedBudgetLabel}
                      isRefreshing={isRefreshingSearch}
                      isPageLoading={isPageLoading}
                      showBackHome={showBackHomeLink}
                      selectedView={mobileResultsView}
                      onViewChange={setMobileResultsView}
                      onPageChange={handlePageChange}
                      onSelectPlace={handleMapPlaceSelect}
                      onViewDetails={handlePlaceSelect}
                      onClearSearch={handleClearSearch}
                      onRemoveCity={() => clearFilterChip('city')}
                      onRemoveCategory={() => clearFilterChip('category')}
                      onRemoveGoodFor={() => clearFilterChip('good_for')}
                      onRemoveBudget={() => clearFilterChip('budget')}
                    />
                  ) : (
                    <section className="px-4 py-4">
                      <SearchEmptyState
                        hasSearched={hasSearched}
                        onSearchAgain={handleClearSearch}
                        showBackHome={showBackHomeLink}
                      />
                    </section>
                  )
                ) : (
                  <AskAiModePanel
                    isRegistered={isRegisteredUser}
                    isSessionLoading={isSessionLoading}
                    usageStatus={askAiUsageStatus}
                    isUsageLoading={isAskAiUsageLoading}
                    usageError={askAiUsageError}
                    question={askAiQuestion}
                    answer={askAiAnswer}
                    sources={askAiSources}
                    isSubmitting={isAskAiSubmitting}
                    answerError={askAiAnswerError}
                    onRetryUsage={handleRetryAskAiUsage}
                    onQuestionChange={setAskAiQuestion}
                    onSubmit={() => void handleAskAiSubmit()}
                    onSwitchToPlaces={handleSwitchToPlaces}
                    onStartOver={handleStartOverAskAi}
                    onOpenPromptBuilder={(questionOverride) => openPromptBuilder('ask-ai', questionOverride)}
                  />
                )}
              </>
            )}
        </main>
      </div>

        <div
          className={`hidden w-full lg:grid ${
            isPromptBuilderOpen || selectedMode === 'ask-ai'
              ? 'min-h-screen grid-rows-[auto_auto_auto]'
              : 'h-screen overflow-hidden lg:grid-rows-[auto_minmax(0,1fr)_auto]'
          }`}
        >
          <AppHeader minimal />

          <div
            className={
              isPromptBuilderOpen || selectedMode === 'ask-ai'
                ? 'min-h-0'
                : shouldShowGuidedSearch
                  ? 'min-h-0 overflow-hidden'
                  : 'grid min-h-0 overflow-hidden grid-rows-[auto_minmax(0,1fr)]'
            }
          >
            {isPromptBuilderOpen ? (
              <PromptBuilderModal
                isOpen={isPromptBuilderOpen}
                initialState={promptBuilderInitialState}
                onClose={() => {
                  setIsPromptBuilderOpen(false)
                  if (initialPromptBuilderOpen) {
                    navigateToPath('/search')
                  }
                }}
              />
            ) : shouldShowSearchLoadingState ? (
              <SearchLoadingState searchLabel={activeSearchLabel} />
            ) : shouldShowGuidedSearch ? (
              <GuidedSearchPage
                rawQuery={rawQuery}
                searchSentence={searchSentence}
                selectedCategoryValue={selectedCategory}
                selectedArea={selectedArea}
                selectedBudget={selectedBudget}
                areas={areas}
                isSearching={isSearching}
                showBackHome={showBackHomeLink}
                validationMessage={searchValidationMessage}
                searchError={searchError}
                onRawQueryChange={handleRawQueryChange}
                onClearSearch={handleClearSearch}
                onCategoryChange={(value) => handleFilterChange('category', value)}
                onAreaChange={(value) => handleFilterChange('area', value)}
                onBudgetChange={(value) => handleFilterChange('budget', value)}
                onSubmitSearch={() => void handleSearch()}
              />
            ) : (
              <>
                {selectedMode === 'places' ? (
                  visiblePlaces.length > 0 ? (
                    <DesktopResultsView
                      places={visiblePlaces}
                      totalCount={totalResults}
                      currentPage={safeCurrentPage}
                      totalPages={totalPages}
                      selectedPlaceId={selectedPlaceId}
                      heading={searchResultSummary.heading}
                      subheading={searchResultSummary.subheading || 'in GalaTayo'}
                      cityLabel={selectedAreaName}
                      categoryLabel={selectedCategoryName}
                      goodForLabel={selectedGoodForName}
                      budgetLabel={selectedBudgetLabel}
                      isRefreshing={isRefreshingSearch}
                      isPageLoading={isPageLoading}
                      showBackHome={showBackHomeLink}
                      scrollContainerRef={desktopResultsScrollRef}
                      onSelectPlace={handleMapPlaceSelect}
                      onPageChange={handlePageChange}
                      onViewDetails={handlePlaceSelect}
                      onClearSearch={handleClearSearch}
                      onRemoveCity={() => clearFilterChip('city')}
                      onRemoveCategory={() => clearFilterChip('category')}
                      onRemoveGoodFor={() => clearFilterChip('good_for')}
                      onRemoveBudget={() => clearFilterChip('budget')}
                    />
                  ) : (
                    <section className="px-8 py-8">
                      <SearchEmptyState
                        hasSearched={hasSearched}
                        onSearchAgain={handleClearSearch}
                        showBackHome={showBackHomeLink}
                      />
                    </section>
                  )
                ) : (
                  <AskAiModePanel
                    isRegistered={isRegisteredUser}
                    isSessionLoading={isSessionLoading}
                    usageStatus={askAiUsageStatus}
                    isUsageLoading={isAskAiUsageLoading}
                    usageError={askAiUsageError}
                    question={askAiQuestion}
                    answer={askAiAnswer}
                    sources={askAiSources}
                    isSubmitting={isAskAiSubmitting}
                    answerError={askAiAnswerError}
                    onRetryUsage={handleRetryAskAiUsage}
                    onQuestionChange={setAskAiQuestion}
                    onSubmit={() => void handleAskAiSubmit()}
                    onSwitchToPlaces={handleSwitchToPlaces}
                    onStartOver={handleStartOverAskAi}
                    onOpenPromptBuilder={(questionOverride) => openPromptBuilder('ask-ai', questionOverride)}
                    className="min-h-0"
                  />
                )}
              </>
            )}
        </div>

      </div>
    </div>
  )
}

export default HomePage


