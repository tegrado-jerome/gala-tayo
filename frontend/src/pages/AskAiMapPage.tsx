import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { createPortal } from 'react-dom'
import { AppIcon } from '../components/AppIcon'
import { GuestAuthPrompt } from '../components/GuestAuthPrompt'
import MapView from '../components/MapView'
import type { PlaceCardData } from '../components/PlaceCard'
import { supabase } from '../supabase'
import {
  getAskAiMapRuntimeState,
  hasActiveAskAiMapRuntimeState,
  patchAskAiMapRuntimeState,
  resetAskAiMapRuntimeState,
  seedAskAiMapRuntimeState,
  subscribeToAskAiMapRuntime,
  type AskAiMapOptionalDetails,
  type AskAiMapPlace,
  type AskAiMapSource,
} from '../utils/askAiMapRuntime'
import ThinkingMiniGamePopup from '../components/ThinkingMiniGamePopup'

type AskAiMapChipId =
  | 'near-me'
  | 'open-now'
  | 'date-spot'
  | 'barkada'
  | 'budget-friendly'
  | 'cafe'
  | 'kainan'
  | 'chill'

type AskAiMapChip = {
  id: AskAiMapChipId
  label: string
}

type AskAiMapsResponse = {
  mode?: 'map_grounding_only'
  answerText?: string
  places?: AskAiMapPlace[]
  sources?: AskAiMapSource[]
  modelUsed?: string | null
  message?: string
  emptyReason?: 'NO_MAP_GROUNDING_RESULTS' | 'PROVIDER_BUSY'
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

type AskAiUsageSummary = {
  askAi: AskAiUsageStatus
  liveSearch: AskAiUsageStatus
}

const DAILY_ASK_AI_LIMIT_MESSAGE = 'Daily Ask AI limit reached.'
const ASK_AI_MAPS_REQUEST_TIMEOUT_MS = 45_000
const caviteCenter: readonly [number, number] = [14.2814, 120.8685]
const tagaytayCenter: readonly [number, number] = [14.1154, 120.9621]
const manilaCenter: readonly [number, number] = [14.5995, 120.9842]

function getEmptyReasonMessage(emptyReason: AskAiMapsResponse['emptyReason']) {
  if (emptyReason === 'PROVIDER_BUSY') {
    return 'Ask AI Maps is busy right now. Try again in a bit.'
  }

  if (emptyReason === 'NO_MAP_GROUNDING_RESULTS') {
    return 'No map-grounded places matched that request. Try a more specific area or place type.'
  }

  return null
}

function isAskAiUsageStatus(value: unknown): value is AskAiUsageStatus {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as AskAiUsageStatus

  return (
    (candidate.usageType === 'ask_ai_total' || candidate.usageType === 'live_search') &&
    typeof candidate.allowed === 'boolean' &&
    typeof candidate.limit === 'number' &&
    typeof candidate.used === 'number' &&
    typeof candidate.remaining === 'number' &&
    typeof candidate.resetAt === 'string'
  )
}

function isDailyAskAiLimitMessage(message: string) {
  return message.trim().toLowerCase() === DAILY_ASK_AI_LIMIT_MESSAGE.toLowerCase()
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}

function getAskAiMapsRequestErrorMessage(error: unknown) {
  if (isAbortError(error)) {
    return 'Ask AI Maps took too long to respond. Try again with a more specific place or area.'
  }

  return error instanceof Error ? error.message : 'Ask AI Maps could not load places right now.'
}

function extractStructuredAnswerText(value: string) {
  const trimmedValue = value.trim()

  if (!trimmedValue) {
    return ''
  }

  const normalizedValue = trimmedValue
    .replace(/^\s*json\s*/i, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim()

  if (!normalizedValue.startsWith('{') && !/"answerText"\s*:/i.test(normalizedValue)) {
    return trimmedValue
  }

  try {
    const firstBrace = normalizedValue.indexOf('{')
    const lastBrace = normalizedValue.lastIndexOf('}')
    const jsonCandidate = firstBrace >= 0 && lastBrace > firstBrace
      ? normalizedValue.slice(firstBrace, lastBrace + 1)
      : normalizedValue
    const parsed = JSON.parse(jsonCandidate) as { answerText?: unknown }
    return typeof parsed.answerText === 'string' ? parsed.answerText.trim() : ''
  } catch {
    const match = normalizedValue.match(/"answerText"\s*:\s*"((?:\\.|[^"\\])*)"/s)

    if (!match?.[1]) {
      return ''
    }

    try {
      return JSON.parse(`"${match[1]}"`) as string
    } catch {
      return match[1]
    }
  }
}

type PermissionState = 'idle' | 'prompt' | 'requesting' | 'granted' | 'denied'

const promptChips: AskAiMapChip[] = [
  { id: 'near-me', label: 'Near me' },
  { id: 'open-now', label: 'Open now' },
  { id: 'date-spot', label: 'Date spot' },
  { id: 'barkada', label: 'Barkada' },
  { id: 'budget-friendly', label: 'Budget-friendly' },
  { id: 'cafe', label: 'Cafe' },
  { id: 'kainan', label: 'Kainan' },
  { id: 'chill', label: 'Chill' },
]

const chipLabelsById = new Map(promptChips.map((chip) => [chip.id, chip.label]))
const metroManilaCenter: readonly [number, number] = [14.5995, 120.9842]
const askAiMapRouteCacheKey = 'galatayo:ask-ai-map-route'

type AskAiMapRouteCache = {
  query: string
  selectedChipIds: AskAiMapChipId[]
  userLocation: { latitude: number; longitude: number } | null
  isSearching: boolean
  errorMessage: string
  statusMessage: string
  answerText: string
  places: AskAiMapPlace[]
  sources: AskAiMapSource[]
  selectedPlaceId: string | null
  focusedPlaceId: string | null
}

function normalizeOptionalDetails(value: unknown): AskAiMapOptionalDetails | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const candidate = value as Partial<AskAiMapOptionalDetails>
  const details = {
    ...(typeof candidate.categoryText === 'string' && candidate.categoryText.trim() ? { categoryText: candidate.categoryText.trim() } : {}),
    ...(typeof candidate.ratingText === 'string' && candidate.ratingText.trim() ? { ratingText: candidate.ratingText.trim() } : {}),
    ...(typeof candidate.reviewCountText === 'string' && candidate.reviewCountText.trim() ? { reviewCountText: candidate.reviewCountText.trim() } : {}),
    ...(typeof candidate.openStatusText === 'string' && candidate.openStatusText.trim() ? { openStatusText: candidate.openStatusText.trim() } : {}),
    ...(typeof candidate.addressText === 'string' && candidate.addressText.trim() ? { addressText: candidate.addressText.trim() } : {}),
    ...(typeof candidate.hoursText === 'string' && candidate.hoursText.trim() ? { hoursText: candidate.hoursText.trim() } : {}),
  }

  return Object.keys(details).length > 0 ? details : undefined
}

function normalizeCoordinates(
  value: unknown,
  latitudeValue?: unknown,
  longitudeValue?: unknown,
) {
  const coordinateCandidate =
    value && typeof value === 'object'
      ? value as { latitude?: unknown; longitude?: unknown; lat?: unknown; lng?: unknown }
      : null
  const latitude =
    typeof coordinateCandidate?.latitude === 'number'
      ? coordinateCandidate.latitude
      : typeof coordinateCandidate?.lat === 'number'
        ? coordinateCandidate.lat
        : typeof latitudeValue === 'number'
          ? latitudeValue
          : null
  const longitude =
    typeof coordinateCandidate?.longitude === 'number'
      ? coordinateCandidate.longitude
      : typeof coordinateCandidate?.lng === 'number'
        ? coordinateCandidate.lng
        : typeof longitudeValue === 'number'
          ? longitudeValue
          : null

  if (latitude === null || longitude === null) {
    return undefined
  }

  return {
    lat: latitude,
    lng: longitude,
    latitude,
    longitude,
  }
}

function normalizePlaces(value: unknown): AskAiMapPlace[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const candidate = entry as Partial<AskAiMapPlace> & Partial<AskAiMapOptionalDetails> & {
      latitude?: unknown
      longitude?: unknown
      googleMapsUri?: unknown
    }

    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.name !== 'string' ||
      typeof candidate.reason !== 'string'
    ) {
      return []
    }

    return [{
      id: candidate.id,
      name: candidate.name,
      reason: candidate.reason,
      googleMapsUrl:
        typeof candidate.googleMapsUrl === 'string'
          ? candidate.googleMapsUrl
          : typeof candidate.googleMapsUri === 'string'
            ? candidate.googleMapsUri
            : undefined,
      googleMapsUri: typeof candidate.googleMapsUri === 'string' ? candidate.googleMapsUri : undefined,
      placeId: typeof candidate.placeId === 'string' ? candidate.placeId : undefined,
      sourceTitle: typeof candidate.sourceTitle === 'string' ? candidate.sourceTitle : undefined,
      sourceUri: typeof candidate.sourceUri === 'string' ? candidate.sourceUri : undefined,
      coordinates: normalizeCoordinates(
        candidate.coordinates,
        candidate.latitude,
        candidate.longitude,
      ),
      optionalDetails: normalizeOptionalDetails(candidate.optionalDetails) ?? normalizeOptionalDetails(candidate),
    }]
  })
}

function normalizeSources(value: unknown): AskAiMapSource[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const candidate = entry as Partial<AskAiMapSource>

    if (
      typeof candidate.title !== 'string' &&
      typeof candidate.uri !== 'string' &&
      typeof candidate.placeId !== 'string'
    ) {
      return []
    }

    return [{
      title: typeof candidate.title === 'string' ? candidate.title : undefined,
      uri: typeof candidate.uri === 'string' ? candidate.uri : undefined,
      placeId: typeof candidate.placeId === 'string' ? candidate.placeId : undefined,
    }]
  })
}

function buildMapRequestQuery(query: string, selectedChipIds: AskAiMapChipId[]) {
  const normalizedQuery = query.trim()
  const labels = selectedChipIds
    .filter((chipId) => chipId !== 'near-me' && chipId !== 'open-now')
    .map((chipId) => chipLabelsById.get(chipId) ?? chipId)

  return [normalizedQuery, labels.join(', ')].filter(Boolean).join(' | ')
}

function normalizeDisplayText(value: string | undefined) {
  const trimmedValue = value?.trim()
  return trimmedValue ? trimmedValue : undefined
}

function deriveHeaderAreaLabel(query: string) {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return 'Live map-grounded picks'
  }

  if (normalizedQuery.includes('cavite')) {
    return 'Live map-grounded picks · Cavite'
  }

  if (normalizedQuery.includes('tagaytay')) {
    return 'Live map-grounded picks · Tagaytay'
  }

  if (normalizedQuery.includes('manila')) {
    return 'Live map-grounded picks · Manila'
  }

  return 'Live map-grounded picks'
}

function deriveQueryMapCenter(query: string) {
  const normalizedQuery = query.trim().toLowerCase()

  if (normalizedQuery.includes('tagaytay')) {
    return tagaytayCenter
  }

  if (normalizedQuery.includes('cavite')) {
    return caviteCenter
  }

  if (normalizedQuery.includes('manila')) {
    return manilaCenter
  }

  return metroManilaCenter
}

function isGenericReasonText(reason: string) {
  const normalizedReason = reason.trim().toLowerCase()

  return [
    'map-grounded',
    'map grounded',
    'grounded match',
    'requested area',
    'fits your query',
    'matches your search',
    'based on your query',
  ].some((phrase) => normalizedReason.includes(phrase))
}

function rewritePlainReason(reason: string) {
  const normalizedReason = reason.trim()
  return normalizedReason.length > 220 ? normalizedReason.slice(0, 217).trimEnd() + '...' : normalizedReason
}

function buildPlaceReasonFallback(place: AskAiMapPlace, query: string) {
  const category = normalizeDisplayText(place.optionalDetails?.categoryText)
  const address = normalizeDisplayText(place.optionalDetails?.addressText)
  const rating = normalizeDisplayText(place.optionalDetails?.ratingText)
  const openStatus = normalizeDisplayText(place.optionalDetails?.openStatusText)
  const normalizedQuery = query.trim().toLowerCase()
  const normalizedCategory = category?.toLowerCase() ?? ''
  const areaLabel = address?.split(',').map((part) => part.trim()).filter(Boolean).slice(-2).join(', ')
  const isMall =
    normalizedQuery.includes('mall') ||
    normalizedQuery.includes('shopping') ||
    normalizedCategory.includes('mall')
  const isSamgyup =
    normalizedQuery.includes('samgyup') ||
    normalizedQuery.includes('samgyeop') ||
    normalizedQuery.includes('korean bbq') ||
    normalizedCategory.includes('korean')
  const isCafe =
    normalizedQuery.includes('cafe') ||
    normalizedQuery.includes('coffee') ||
    normalizedQuery.includes('study') ||
    normalizedCategory.includes('cafe') ||
    normalizedCategory.includes('coffee')
  const isRestaurant =
    normalizedQuery.includes('restaurant') ||
    normalizedQuery.includes('food') ||
    normalizedQuery.includes('kainan') ||
    normalizedCategory.includes('restaurant') ||
    normalizedCategory.includes('food')

  if (isMall) {
    return areaLabel
      ? `Good mall option for shopping, food, and indoor tambayan around ${areaLabel}. ${openStatus ?? 'Useful map details are shown when available.'}`
      : 'Good mall option for shopping, food, and indoor tambayan around this area.'
  }

  if (isSamgyup) {
    return 'Good Korean BBQ option if you are craving samgyup nearby. Dine-in or map details are shown when available.'
  }

  if (isCafe) {
    return 'Good cafe pick if you want a place to chill, study, or get coffee nearby. Helpful map details are shown when available.'
  }

  if (isRestaurant) {
    return 'Good food spot to consider based on cuisine, location, and available map details. Easy to compare with nearby options.'
  }

  if (category && rating) {
    return `Good ${category.toLowerCase()} option to check nearby. Google Maps shows ${rating}${openStatus ? ` and ${openStatus.toLowerCase()} info` : ''}.`
  }

  if (category && address) {
    return `Good ${category.toLowerCase()} option to check around ${address}. Helpful map details are shown when available.`
  }

  if (address) {
    return `Good nearby place to consider around ${address}. Helpful map details are shown when available.`
  }

  return 'Good nearby place to consider based on the grounded map result. Helpful details are shown when available.'
}

function getDisplayReason(place: AskAiMapPlace, query: string) {
  const reason = normalizeDisplayText(place.reason)

  if (!reason) {
    return buildPlaceReasonFallback(place, query)
  }

  if (isGenericReasonText(reason)) {
    return buildPlaceReasonFallback(place, query)
  }

  return rewritePlainReason(reason)
}

function getReviewBadgeText(place: AskAiMapPlace) {
  const ratingText = normalizeDisplayText(place.optionalDetails?.ratingText)
  const reviewCountText = normalizeDisplayText(place.optionalDetails?.reviewCountText)

  if (ratingText && reviewCountText) {
    return `${ratingText} · ${reviewCountText}`
  }

  return ratingText ?? reviewCountText ?? null
}

function getShortLocationText(place: AskAiMapPlace) {
  const addressText = normalizeDisplayText(place.optionalDetails?.addressText)

  if (!addressText) {
    return null
  }

  const parts = addressText
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  const trimmedParts =
    parts[parts.length - 1]?.toLowerCase() === 'philippines'
      ? parts.slice(0, -1)
      : parts

  if (trimmedParts.length >= 2) {
    return trimmedParts.slice(-2).join(', ')
  }

  return addressText
}

function getCoordinateChipText(place: AskAiMapPlace) {
  const latitude = place.coordinates?.latitude
  const longitude = place.coordinates?.longitude

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return null
  }

  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
}

function mapPlaceToMapCard(place: AskAiMapPlace): PlaceCardData {
  const displayReason = getDisplayReason(place, '')
  const addressText = normalizeDisplayText(place.optionalDetails?.addressText)

  return {
    id: place.id,
    name: place.name,
    category: place.optionalDetails?.categoryText ?? 'Google Maps pick',
    area: addressText ?? 'Map-grounded pick',
    address: addressText,
    city: addressText ?? 'Map-grounded area',
    localArea: addressText,
    status: 'Unknown',
    reason: displayReason,
    description: displayReason,
    badge: place.optionalDetails?.categoryText ?? 'Google Maps',
    googleMapsUrl: place.googleMapsUrl ?? place.sourceUri ?? null,
    coordinates: {
      lat: place.coordinates?.latitude ?? null,
      lng: place.coordinates?.longitude ?? null,
    },
  }
}

function readAskAiMapRouteCache(): AskAiMapRouteCache | null {
  try {
    const rawCache = window.sessionStorage.getItem(askAiMapRouteCacheKey)

    if (!rawCache) {
      return null
    }

    const parsedCache = JSON.parse(rawCache) as Partial<AskAiMapRouteCache>

    return {
      query: typeof parsedCache.query === 'string' ? parsedCache.query : '',
      selectedChipIds: Array.isArray(parsedCache.selectedChipIds)
        ? parsedCache.selectedChipIds.filter((chipId): chipId is AskAiMapChipId => (
            typeof chipId === 'string' && chipLabelsById.has(chipId as AskAiMapChipId)
          ))
        : [],
      userLocation:
        parsedCache.userLocation &&
        typeof parsedCache.userLocation === 'object' &&
        typeof parsedCache.userLocation.latitude === 'number' &&
        typeof parsedCache.userLocation.longitude === 'number'
          ? parsedCache.userLocation
          : null,
      isSearching: parsedCache.isSearching === true,
      errorMessage: typeof parsedCache.errorMessage === 'string' ? parsedCache.errorMessage : '',
      statusMessage: typeof parsedCache.statusMessage === 'string' ? parsedCache.statusMessage : '',
      answerText: typeof parsedCache.answerText === 'string' ? parsedCache.answerText : '',
      places: normalizePlaces(parsedCache.places),
      sources: normalizeSources(parsedCache.sources),
      selectedPlaceId: typeof parsedCache.selectedPlaceId === 'string' ? parsedCache.selectedPlaceId : null,
      focusedPlaceId: typeof parsedCache.focusedPlaceId === 'string' ? parsedCache.focusedPlaceId : null,
    }
  } catch (error) {
    console.warn('Unable to restore cached Ask AI Map state:', error)
    return null
  }
}

function writeAskAiMapRouteCache(cache: AskAiMapRouteCache) {
  try {
    window.sessionStorage.setItem(askAiMapRouteCacheKey, JSON.stringify(cache))
  } catch (error) {
    console.warn('Unable to cache Ask AI Map state:', error)
  }
}

function clearAskAiMapRouteCache() {
  try {
    window.sessionStorage.removeItem(askAiMapRouteCacheKey)
  } catch (error) {
    console.warn('Unable to clear cached Ask AI Map state:', error)
  }
}

function MinimalLoadingCard({ query }: { query: string }) {
  return (
    <div className="w-full min-w-0 shrink rounded-[24px] border border-[rgba(83,146,241,0.18)] bg-white/96 p-4 shadow-[0_16px_36px_rgba(15,23,42,0.12)]">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-[linear-gradient(180deg,#eff6ff_0%,#dbeafe_100%)] text-[var(--accent-deep)]">
          <AppIcon name="askAi" className="h-5 w-5 motion-safe:animate-pulse" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-black tracking-[-0.02em] text-slate-950">Thinking</p>
            <span className="inline-flex items-center gap-1 text-[var(--accent-deep)]">
              <span className="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-bounce" />
              <span className="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-bounce [animation-delay:120ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-bounce [animation-delay:240ms]" />
            </span>
          </div>
          <p className="mt-1 text-[12px] font-medium text-slate-500">Grounding live Google Maps picks for your prompt.</p>
          {query ? <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-700">“{query.trim()}”</p> : null}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-2/3 rounded-full bg-[linear-gradient(90deg,#8bb8ff,#245dce)] motion-safe:animate-[gala-loading-slide_1.6s_ease-in-out_infinite]" />
          </div>
        </div>
      </div>
    </div>
  )
}

function AskAiMapPage() {
  const initialAskAiMapRuntimeStateRef = useRef(
    hasActiveAskAiMapRuntimeState() ? getAskAiMapRuntimeState() : null
  )
  const initialAskAiMapRouteCacheRef = useRef<AskAiMapRouteCache | null>(readAskAiMapRouteCache())
  const cardRefs = useRef(new Map<string, HTMLDivElement>())
  const initialAskAiMapRuntimeState = initialAskAiMapRuntimeStateRef.current
  const initialAskAiMapRouteCache = initialAskAiMapRouteCacheRef.current
  const initialAskAiMapState = initialAskAiMapRuntimeState ?? initialAskAiMapRouteCache
  const [session, setSession] = useState<Session | null>(null)
  const [isSessionLoading, setIsSessionLoading] = useState(true)
  const [query, setQuery] = useState(initialAskAiMapState?.query ?? '')
  const [selectedChipIds, setSelectedChipIds] = useState<AskAiMapChipId[]>(
    (initialAskAiMapState?.selectedChipIds as AskAiMapChipId[] | undefined) ?? []
  )
  const [permissionState, setPermissionState] = useState<PermissionState>('idle')
  const [permissionError, setPermissionError] = useState('')
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(
    initialAskAiMapState?.userLocation ?? null
  )
  const [isSearching, setIsSearching] = useState(initialAskAiMapState?.isSearching === true)
  const [, setHasSearched] = useState(false)
  const [errorMessage, setErrorMessage] = useState(initialAskAiMapState?.errorMessage ?? '')
  const [statusMessage, setStatusMessage] = useState(initialAskAiMapState?.statusMessage ?? '')
  const [answerText, setAnswerText] = useState(initialAskAiMapState?.answerText ?? '')
  const [places, setPlaces] = useState<AskAiMapPlace[]>(initialAskAiMapState?.places ?? [])
  const [sources, setSources] = useState<AskAiMapSource[]>(initialAskAiMapState?.sources ?? [])
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(initialAskAiMapState?.selectedPlaceId ?? null)
  const [focusedPlaceId, setFocusedPlaceId] = useState<string | null>(initialAskAiMapState?.focusedPlaceId ?? null)
  const [isPlaceDetailOpen, setIsPlaceDetailOpen] = useState(false)

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) {
        return
      }

      setSession(data.session)
      setIsSessionLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsSessionLoading(false)
    })

    return () => {
      isMounted = false
      data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session?.access_token) {
      return
    }

    const controller = new AbortController()
    const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
    const usageEndpoint = apiBaseUrl ? `${apiBaseUrl}/ask-ai/usage/check` : '/api/ask-ai/usage/check'

    const loadAskAiUsage = async () => {
      try {
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

        if (!isAskAiUsageStatus(data.askAi)) {
          throw new Error('Ask AI usage response was incomplete.')
        }

        if (data.askAi.allowed && (isDailyAskAiLimitMessage(errorMessage) || isDailyAskAiLimitMessage(statusMessage))) {
          patchAskAiMapRuntimeState({
            errorMessage: isDailyAskAiLimitMessage(errorMessage) ? '' : errorMessage,
            statusMessage: isDailyAskAiLimitMessage(statusMessage) ? '' : statusMessage,
          })
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return
        }

        console.warn('Unable to refresh Ask AI Maps usage state:', error)
      }
    }

    void loadAskAiUsage()

    return () => controller.abort()
  }, [errorMessage, session?.access_token, statusMessage])

  useEffect(() => {
    seedAskAiMapRuntimeState({
      query: initialAskAiMapState?.query ?? '',
      selectedChipIds: initialAskAiMapState?.selectedChipIds ?? [],
      userLocation: initialAskAiMapState?.userLocation ?? null,
      isSearching: initialAskAiMapState?.isSearching === true,
      errorMessage: initialAskAiMapState?.errorMessage ?? '',
      statusMessage: initialAskAiMapState?.statusMessage ?? '',
      answerText: initialAskAiMapState?.answerText ?? '',
      places: initialAskAiMapState?.places ?? [],
      sources: initialAskAiMapState?.sources ?? [],
      selectedPlaceId: initialAskAiMapState?.selectedPlaceId ?? null,
      focusedPlaceId: initialAskAiMapState?.focusedPlaceId ?? null,
    })

    return subscribeToAskAiMapRuntime((runtimeState) => {
      setQuery(runtimeState.query)
      setSelectedChipIds(runtimeState.selectedChipIds as AskAiMapChipId[])
      setUserLocation(runtimeState.userLocation)
      setIsSearching(runtimeState.isSearching)
      setErrorMessage(runtimeState.errorMessage)
      setStatusMessage(runtimeState.statusMessage)
      setAnswerText(runtimeState.answerText)
      setPlaces(runtimeState.places)
      setSources(runtimeState.sources)
      setSelectedPlaceId(runtimeState.selectedPlaceId)
      setFocusedPlaceId(runtimeState.focusedPlaceId)
    })
  }, [initialAskAiMapState])

  const usesNearMe = selectedChipIds.includes('near-me')
  const usesOpenNow = selectedChipIds.includes('open-now')
  const requestQuery = useMemo(() => buildMapRequestQuery(query, selectedChipIds), [query, selectedChipIds])
  const mapPlaces = useMemo(() => places.map(mapPlaceToMapCard), [places])
  const selectedPlace = useMemo(
    () => places.find((place) => place.id === selectedPlaceId) ?? places[0] ?? null,
    [places, selectedPlaceId]
  )
  const headerSubtitle = useMemo(() => deriveHeaderAreaLabel(requestQuery || query), [query, requestQuery])
  const canSubmit = requestQuery.trim().length > 0 && !isSearching
  const mapCenter = userLocation
    ? [userLocation.latitude, userLocation.longitude] as const
    : deriveQueryMapCenter(requestQuery || query)
  const mapLayoutKey = `${places.length}:${selectedPlaceId ?? 'none'}:${focusedPlaceId ?? 'none'}:${isPlaceDetailOpen ? 'modal-open' : 'modal-closed'}`
  const shouldShowPermissionPrompt =
    permissionState === 'prompt' || permissionState === 'requesting' || permissionState === 'denied'

  useEffect(() => {
    if (!selectedPlaceId && places.length > 0) {
      setSelectedPlaceId(places[0]?.id ?? null)
      setFocusedPlaceId(places[0]?.id ?? null)
    }
  }, [places, selectedPlaceId])

  useEffect(() => {
    if (!isPlaceDetailOpen) {
      return
    }

    const previousBodyOverflow = document.body.style.overflow
    const previousHtmlOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPlaceDetailOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousHtmlOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isPlaceDetailOpen])

  useEffect(() => {
    if (places.length === 0) {
      setIsPlaceDetailOpen(false)
    }
  }, [places.length])

  useEffect(() => {
    if (!selectedPlaceId) {
      return
    }

    const selectedCard = cardRefs.current.get(selectedPlaceId)

    if (!selectedCard) {
      return
    }

    selectedCard.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }, [selectedPlaceId])

  useEffect(() => {
    patchAskAiMapRuntimeState({
      query,
      selectedChipIds,
      userLocation,
      isSearching,
      errorMessage,
      statusMessage,
      answerText,
      places,
      sources,
      selectedPlaceId,
      focusedPlaceId,
    })

    if (!query.trim() && !isSearching && !errorMessage && !statusMessage && !answerText && places.length === 0 && sources.length === 0) {
      clearAskAiMapRouteCache()
      return
    }

    writeAskAiMapRouteCache({
      query,
      selectedChipIds,
      userLocation,
      isSearching,
      errorMessage,
      statusMessage,
      answerText,
      places,
      sources,
      selectedPlaceId,
      focusedPlaceId,
    })
  }, [
    answerText,
    errorMessage,
    focusedPlaceId,
    isSearching,
    places,
    query,
    selectedChipIds,
    selectedPlaceId,
    sources,
    statusMessage,
    userLocation,
  ])

  function selectPlace(placeId: string) {
    setSelectedPlaceId(placeId)
    setFocusedPlaceId(placeId)
  }

  function openPlaceDetails(placeId: string) {
    setSelectedPlaceId(placeId)
    setFocusedPlaceId(placeId)
    setIsPlaceDetailOpen(true)
  }

  function requestLocationPermission() {
    if (!navigator.geolocation) {
      setPermissionState('denied')
      setPermissionError('Location is not supported on this device.')
      return
    }

    setPermissionState('requesting')
    setPermissionError('')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
        setPermissionState('granted')
      },
      () => {
        setPermissionState('denied')
        setPermissionError('Location permission was denied. You can still search without Near me.')
        setSelectedChipIds((currentValue) => currentValue.filter((value) => value !== 'near-me'))
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60_000,
        timeout: 10_000,
      }
    )
  }

  async function handleSubmit() {
    if (!session?.access_token || !canSubmit) {
      return
    }

    setHasSearched(true)
    patchAskAiMapRuntimeState({
      query,
      selectedChipIds,
      userLocation,
      isSearching: true,
      errorMessage: '',
      statusMessage: '',
      answerText: '',
      places: [],
      sources: [],
      selectedPlaceId: null,
      focusedPlaceId: null,
    })
    setIsPlaceDetailOpen(false)

    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), ASK_AI_MAPS_REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(`/api/ask-ai/maps?t=${Date.now()}`, {
        method: 'POST',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          'Cache-Control': 'no-store',
          Pragma: 'no-cache',
        },
        body: JSON.stringify({
          query: requestQuery,
          selectedChips: selectedChipIds.map((chipId) => chipLabelsById.get(chipId) ?? chipId),
          nearMe: usesNearMe,
          openNow: usesOpenNow,
          userLocation,
        }),
      })

      const data = await response.json() as AskAiMapsResponse

      if (!response.ok) {
        throw new Error(data.message || 'Ask AI Maps could not load places right now.')
      }

      const nextPlaces = normalizePlaces(data.places)
      const nextSources = normalizeSources(data.sources)
      const nextStatusMessage = getEmptyReasonMessage(data.emptyReason) ?? data.message ?? ''

      startTransition(() => {
        patchAskAiMapRuntimeState({
          query,
          selectedChipIds,
          userLocation,
          isSearching: false,
          errorMessage: '',
          statusMessage: nextPlaces.length === 0 ? nextStatusMessage : '',
          answerText: typeof data.answerText === 'string' ? extractStructuredAnswerText(data.answerText) : '',
          places: nextPlaces,
          sources: nextSources,
          selectedPlaceId: nextPlaces[0]?.id ?? null,
          focusedPlaceId: nextPlaces[0]?.id ?? null,
        })
      })
    } catch (error) {
      patchAskAiMapRuntimeState({
        query,
        selectedChipIds,
        userLocation,
        isSearching: false,
        errorMessage: getAskAiMapsRequestErrorMessage(error),
        statusMessage: '',
        answerText: '',
        places: [],
        sources: [],
        selectedPlaceId: null,
        focusedPlaceId: null,
      })
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  function handleStartOver() {
    resetAskAiMapRuntimeState()
    clearAskAiMapRouteCache()
    setQuery('')
    setSelectedChipIds([])
    setUserLocation(null)
    setIsSearching(false)
    setErrorMessage('')
    setStatusMessage('')
    setAnswerText('')
    setPlaces([])
    setSources([])
    setSelectedPlaceId(null)
    setFocusedPlaceId(null)
    setIsPlaceDetailOpen(false)
    setPermissionError('')
    setPermissionState('idle')
  }

  if (isSessionLoading) {
    return <div className="gala-page-background min-h-screen" aria-hidden="true" />
  }

  if (!session) {
    return <GuestAuthPrompt variant="ask-ai" mode="page-state" />
  }

  return (
    <>
    <main className="gala-page-background h-[100dvh] overflow-hidden overscroll-none text-[var(--text)]">
      <div className="h-full w-full">
        <section className="relative h-full overflow-hidden bg-transparent p-0">
          <div className="relative h-full">
            <MapView
              places={mapPlaces}
              selectedPlaceId={selectedPlaceId}
              focusedPlaceId={focusedPlaceId}
              center={mapCenter}
              zoom={userLocation ? 14 : 12}
              autoFitToPlaces={places.length > 0}
              className="h-full"
              layoutKey={mapLayoutKey}
              onPlaceSelect={selectPlace}
              onPlaceOpen={openPlaceDetails}
            />

            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,rgba(248,247,244,0.72)_0%,rgba(248,247,244,0.18)_58%,rgba(248,247,244,0)_100%)]" />
            <div className="pointer-events-none absolute left-20 right-3 top-3 z-[620] sm:left-auto sm:right-4 sm:top-4 sm:w-auto">
              <div className="pointer-events-auto ml-auto flex max-w-[min(88vw,400px)] items-start gap-3 rounded-[26px] border border-white/70 bg-white/84 px-3 py-3 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(23,45,107,0.08)] text-[var(--accent-deep)]">
                  <AppIcon name="askAi" className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold tracking-[-0.01em] text-slate-900">Google Maps picks</p>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">{headerSubtitle}</p>
                  {isSearching ? (
                    <div className="mt-2 inline-flex items-center gap-2 text-[12px] font-medium text-slate-600">
                      <span className="inline-flex items-center gap-1 text-[var(--accent-deep)]">
                        <span className="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-bounce" />
                        <span className="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-bounce [animation-delay:120ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-bounce [animation-delay:240ms]" />
                      </span>
                      <span>Searching for map-grounded matches</span>
                    </div>
                  ) : null}
                  {!isSearching && answerText ? <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-slate-700">{answerText}</p> : null}
                </div>
              </div>
            </div>

            {isSearching ? (
              <div className="pointer-events-none absolute inset-0 rounded-[26px] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.14))]">
                <div className="absolute inset-0 animate-[gala-map-breathe_4s_ease-in-out_infinite] bg-[linear-gradient(135deg,rgba(255,255,255,0.0)_0%,rgba(255,255,255,0.28)_45%,rgba(255,255,255,0.0)_100%)]" />
                <div className="absolute left-[18%] top-[34%] h-4 w-4 animate-bounce rounded-full bg-[#3b82f6] shadow-[0_0_0_8px_rgba(59,130,246,0.12)]" />
                <div className="absolute left-[52%] top-[48%] h-4 w-4 animate-bounce rounded-full bg-[#4f8ff6] shadow-[0_0_0_8px_rgba(59,130,246,0.10)] [animation-delay:180ms]" />
                <div className="absolute left-[70%] top-[28%] h-4 w-4 animate-bounce rounded-full bg-[#5b95f8] shadow-[0_0_0_8px_rgba(59,130,246,0.11)] [animation-delay:320ms]" />
              </div>
            ) : null}

            <ThinkingMiniGamePopup isThinking={isSearching} />

            {shouldShowPermissionPrompt ? (
              <div className="absolute inset-0 z-[700] flex items-center justify-center bg-slate-950/12 p-4">
                <div className="w-full max-w-sm rounded-[26px] border border-white/80 bg-white/96 p-5 shadow-[0_24px_64px_rgba(15,23,42,0.14)]">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent-wash)] text-[var(--accent)]">
                      <AppIcon name="map" className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-lg font-black tracking-[-0.02em] text-slate-950">Use your location?</h2>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        Nearby map results work better when we can center around you.
                      </p>
                    </div>
                  </div>

                  {permissionError ? <p className="mt-4 text-sm font-medium text-rose-600">{permissionError}</p> : null}

                  <div className="mt-5 flex gap-3">
                    <button
                      type="button"
                      onClick={requestLocationPermission}
                      disabled={permissionState === 'requesting'}
                      className="inline-flex h-11 flex-1 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--accent-deep)] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {permissionState === 'requesting' ? 'Getting location...' : 'Use my location'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPermissionState('idle')
                        if (!userLocation) {
                          setSelectedChipIds((currentValue) => currentValue.filter((value) => value !== 'near-me'))
                        }
                      }}
                      className="inline-flex h-11 items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                    >
                      Not now
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <section className="absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+5.25rem)] z-[640] overflow-hidden sm:inset-x-4 sm:bottom-4">
                {errorMessage && !isSearching ? (
                  <div className="mb-3 rounded-[24px] border border-rose-100 bg-white/96 px-4 py-3 text-sm font-medium text-rose-700 shadow-[0_16px_36px_rgba(15,23,42,0.12)]">
                    {errorMessage}
                  </div>
                ) : null}

                {!errorMessage && statusMessage && !isSearching ? (
                  <div className="mb-3 rounded-[24px] border border-sky-100 bg-white/96 px-4 py-3 text-sm font-medium text-slate-700 shadow-[0_16px_36px_rgba(15,23,42,0.12)]">
                    {statusMessage}
                  </div>
                ) : null}

                {sources.length > 0 && !isSearching ? (
                  <div className="mb-3 hidden rounded-[22px] border border-white/82 bg-white/92 px-4 py-3 text-[12px] font-medium text-slate-600 shadow-[0_10px_24px_rgba(15,23,42,0.08)] sm:block">
                    {sources.length} Google Maps source{sources.length === 1 ? '' : 's'} grounded this answer.
                  </div>
                ) : null}

                {(!isSearching && (places.length > 0 || Boolean(answerText) || Boolean(errorMessage) || Boolean(statusMessage))) ? (
                  <div className="mb-3 flex justify-end">
                    <button
                      type="button"
                      onClick={handleStartOver}
                      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-white/86 bg-white/94 px-3.5 text-[12px] font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition hover:border-[rgba(20,35,58,0.16)] hover:text-slate-950"
                    >
                      <AppIcon name="refresh" className="h-3.5 w-3.5" />
                      <span>Start over</span>
                    </button>
                  </div>
                ) : null}

                <div className="flex w-full snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden pb-4 pl-1 pr-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  {isSearching ? <MinimalLoadingCard query={query} /> : null}

                  {!isSearching ? places.map((place) => {
                    const isSelected = place.id === selectedPlaceId
                    const categoryText = normalizeDisplayText(place.optionalDetails?.categoryText)
                    const reviewBadgeText = getReviewBadgeText(place)
                    const shortLocationText = getShortLocationText(place)
                    const openStatusText = normalizeDisplayText(place.optionalDetails?.openStatusText)
                    const isClosedStatus = Boolean(openStatusText && /closed/i.test(openStatusText))

                    return (
                      <div
                        key={place.id}
                        ref={(node) => {
                          if (node) {
                            cardRefs.current.set(place.id, node)
                            return
                          }

                          cardRefs.current.delete(place.id)
                        }}
                        className={`flex h-[170px] w-[236px] snap-center shrink-0 flex-col rounded-[24px] border bg-white/95 text-left transition ${
                          isSelected
                            ? 'scale-[1.01] border-[var(--accent)] p-3.5 shadow-[0_18px_38px_rgba(15,23,42,0.14)] ring-2 ring-[rgba(59,130,246,0.12)]'
                            : 'border-white/70 p-3.5 shadow-[0_10px_24px_rgba(15,23,42,0.08)] opacity-95 hover:border-[rgba(20,35,58,0.14)] hover:opacity-100'
                        }`}
                        onMouseEnter={() => setFocusedPlaceId(place.id)}
                        onMouseLeave={() => setFocusedPlaceId(selectedPlace?.id ?? null)}
                      >
                        <button
                          type="button"
                          onClick={() => openPlaceDetails(place.id)}
                          className="flex h-full text-left"
                        >
                          <div className="flex min-w-0 flex-1 flex-col">
                            <div className="min-w-0">
                              <h3 className="line-clamp-2 min-h-[2.5rem] text-[15px] font-black leading-5 tracking-[-0.02em] text-slate-950">
                                {place.name}
                              </h3>
                              {categoryText ? (
                                <p className="mt-1 truncate text-[12px] font-medium text-slate-600">
                                  {categoryText}
                                </p>
                              ) : null}
                            </div>

                            <div className="mt-3 flex flex-1 flex-col gap-2 text-[12px]">
                              {reviewBadgeText ? (
                                <div className="flex items-center gap-2 text-amber-700">
                                  <AppIcon name="reviews" className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate font-semibold">{reviewBadgeText}</span>
                                </div>
                              ) : null}
                              {shortLocationText ? (
                                <div className="flex items-center gap-2 text-slate-600">
                                  <AppIcon name="place" className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                                  <span className="truncate font-medium">{shortLocationText}</span>
                                </div>
                              ) : null}
                              {openStatusText ? (
                                <div
                                  className={`inline-flex items-center self-start rounded-full px-2.5 py-1 ${
                                    isClosedStatus
                                      ? 'bg-rose-50 text-rose-700'
                                      : 'bg-emerald-50 text-emerald-700'
                                  }`}
                                >
                                  <span className="mr-1.5 text-[10px]">●</span>
                                  {openStatusText}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      </div>
                    )
                  }) : null}
                </div>

                <div className="flex items-center gap-3 rounded-[22px] border border-white/86 bg-white/96 px-3 py-2.5 shadow-[0_10px_24px_rgba(15,23,42,0.08)] backdrop-blur-md">
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void handleSubmit()
                      }
                    }}
                    placeholder="Ask about malls in Parañaque, cafes near me, date spots..."
                    className="h-12 min-w-0 flex-1 bg-transparent px-0.5 text-[15px] font-medium text-slate-900 outline-none placeholder:font-medium placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSubmit()}
                    disabled={!canSubmit}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent-deep)] text-white shadow-[0_10px_20px_rgba(23,45,107,0.18)] transition hover:bg-[var(--accent)] disabled:opacity-60"
                    aria-label="Submit ask ai map search"
                  >
                    <AppIcon name="askAi" className="h-5 w-5" />
                  </button>
                </div>
              </section>
          </div>
        </section>
      </div>
    </main>
    {selectedPlace && isPlaceDetailOpen ? createPortal(
      <div className="fixed inset-0 z-[7000]">
        <button
          type="button"
          aria-label="Close place details"
          className="absolute inset-0 bg-slate-950/36 backdrop-blur-[3px]"
          onClick={() => setIsPlaceDetailOpen(false)}
        />
        <section
          className="absolute inset-x-0 bottom-0 h-[60vh] max-h-[80vh] overflow-hidden rounded-t-[28px] bg-white shadow-[0_-18px_48px_rgba(15,23,42,0.22)]"
          aria-modal="true"
          role="dialog"
          aria-label={`${selectedPlace.name} details`}
        >
          <div className="flex justify-center px-4 pt-3">
            <span className="h-1.5 w-14 rounded-full bg-slate-200" />
          </div>
          <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-3">
            <div className="min-w-0">
              <h2 className="text-[22px] font-black tracking-[-0.03em] text-slate-950">
                {selectedPlace.name}
              </h2>
              {normalizeDisplayText(selectedPlace.optionalDetails?.categoryText) ? (
                <p className="mt-2 text-sm font-semibold text-slate-600">
                  {selectedPlace.optionalDetails?.categoryText}
                </p>
              ) : null}
              {getReviewBadgeText(selectedPlace) ? (
                <p className="mt-1.5 text-sm font-semibold text-slate-700">
                  <span className="text-amber-600">★</span> {getReviewBadgeText(selectedPlace)}
                </p>
              ) : null}
              {normalizeDisplayText(selectedPlace.optionalDetails?.openStatusText) ? (
                <p className={`mt-1.5 inline-flex items-center rounded-full px-2.5 py-1 text-sm font-semibold ${
                  /closed/i.test(selectedPlace.optionalDetails?.openStatusText ?? '')
                    ? 'bg-rose-50 text-rose-700'
                    : 'bg-emerald-50 text-emerald-700'
                }`}>
                  <span className="mr-1.5 text-[10px]">●</span>
                  {selectedPlace.optionalDetails?.openStatusText}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setIsPlaceDetailOpen(false)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
              aria-label="Close place details"
            >
              <AppIcon name="clear" className="h-4 w-4" />
            </button>
          </div>

          <div className="h-[calc(60vh-6.5rem)] max-h-[calc(80vh-6.5rem)] overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)]">
            {normalizeDisplayText(selectedPlace.optionalDetails?.addressText) ? (
              <div className="rounded-[22px] bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">Address</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {selectedPlace.optionalDetails?.addressText}
                </p>
              </div>
            ) : null}

            {normalizeDisplayText(selectedPlace.optionalDetails?.hoursText) ? (
              <div className="mt-3 rounded-[22px] bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">Hours</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {selectedPlace.optionalDetails?.hoursText}
                </p>
              </div>
            ) : null}

            {getCoordinateChipText(selectedPlace) ? (
              <div className="mt-3 rounded-[22px] bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">Coordinates</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {getCoordinateChipText(selectedPlace)}
                </p>
              </div>
            ) : null}

            {getDisplayReason(selectedPlace, requestQuery || query) ? (
              <div className="mt-3 rounded-[22px] border border-[rgba(20,35,58,0.08)] bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(241,245,249,0.88))] px-4 py-4">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">Why this fits</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {getDisplayReason(selectedPlace, requestQuery || query)}
                </p>
              </div>
            ) : null}

            {(selectedPlace.googleMapsUrl ?? selectedPlace.sourceUri) ? (
              <a
                href={selectedPlace.googleMapsUrl ?? selectedPlace.sourceUri}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                <AppIcon name="map" className="h-4 w-4" />
                <span>Open in Google Maps</span>
              </a>
            ) : null}
          </div>
        </section>
      </div>,
      document.body
    ) : null}
    </>
  )
}

export default AskAiMapPage

