import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { X } from 'lucide-react'
import { AppIcon } from '../components/AppIcon'
import GoogleSignInButton from '../components/GoogleSignInButton'
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
  type AskAiMapRuntimeState,
  type AskAiMapSource,
} from '../utils/askAiMapRuntime'
import { navigateToPath } from '../utils/navigation'

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
const ASK_AI_MAPS_REQUEST_TIMEOUT_MS = 20_000

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

function looksLikeLeakedStructuredPayload(value: string | null | undefined) {
  if (!value) {
    return false
  }

  const normalizedValue = value.trim()

  return (
    normalizedValue.startsWith('{') ||
    normalizedValue.includes('"places"') ||
    normalizedValue.includes('"answerText"') ||
    normalizedValue.includes('"aiSummary"') ||
    normalizedValue.includes('"whyItMatches"') ||
    normalizedValue.includes('"bestForTags"') ||
    normalizedValue.includes('"goHereIf"') ||
    normalizedValue.includes('"maybeSkipIf"') ||
    normalizedValue.includes('"aiVerdict"')
  )
}

function clearRecoveredAskAiMapResults<T extends AskAiMapRouteCache | AskAiMapRuntimeState>(state: T): T {
  return {
    ...state,
    isSearching: false,
    errorMessage: '',
    statusMessage: '',
    answerText: '',
    places: [],
    sources: [],
    selectedPlaceId: null,
    focusedPlaceId: null,
  } as T
}

function hasLeakedAskAiMapState(state: AskAiMapRouteCache | AskAiMapRuntimeState | null) {
  if (!state) {
    return false
  }

  const hasLeakedAnswer = looksLikeLeakedStructuredPayload(state.answerText)
  const hasLeakedPlace = Array.isArray(state.places) && state.places.some((place) => (
    looksLikeLeakedStructuredPayload(place?.reason) ||
    looksLikeLeakedStructuredPayload(place?.aiVerdict) ||
    looksLikeLeakedStructuredPayload(place?.aiSummary)
  ))

  return hasLeakedAnswer || hasLeakedPlace
}

function normalizeRecoveredAskAiMapState<T extends AskAiMapRouteCache | AskAiMapRuntimeState | null>(state: T): T {
  if (!state) {
    return state
  }

  if (hasLeakedAskAiMapState(state)) {
    return clearRecoveredAskAiMapResults(state)
  }

  if (state.isSearching !== true) {
    return state
  }

  return {
    ...clearRecoveredAskAiMapResults(state),
    errorMessage: state.errorMessage || 'Your last Ask AI Maps search did not finish. Please try again.',
  } as T
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

function normalizeStringList(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set<string>()

  return value.flatMap((entry) => {
    if (typeof entry !== 'string') {
      return []
    }

    const normalizedEntry = entry.trim()
    const dedupeKey = normalizedEntry.toLowerCase()

    if (!normalizedEntry || seen.has(dedupeKey)) {
      return []
    }

    seen.add(dedupeKey)
    return [normalizedEntry]
  }).slice(0, maxItems)
}

function normalizePlaceKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getCoordinateDedupeKey(
  coordinates?: { latitude: number; longitude: number } | null
) {
  if (
    typeof coordinates?.latitude !== 'number' ||
    typeof coordinates?.longitude !== 'number'
  ) {
    return null
  }

  return `${coordinates.latitude.toFixed(5)},${coordinates.longitude.toFixed(5)}`
}

function normalizePlaces(value: unknown): AskAiMapPlace[] {
  if (!Array.isArray(value)) {
    return []
  }

  const seenKeys = new Set<string>()

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const candidate = entry as Partial<AskAiMapPlace>

    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.name !== 'string' ||
      typeof candidate.reason !== 'string'
    ) {
      return []
    }

    const nextPlace: AskAiMapPlace = {
      id: candidate.id,
      name: candidate.name,
      reason: candidate.reason,
      aiVerdict:
        typeof candidate.aiVerdict === 'string' && candidate.aiVerdict.trim()
          ? candidate.aiVerdict.trim()
          : candidate.reason,
      aiSummary:
        typeof candidate.aiSummary === 'string' && candidate.aiSummary.trim()
          ? candidate.aiSummary.trim()
          : candidate.reason,
      whyItMatches: normalizeStringList(candidate.whyItMatches, 3),
      bestForTags: normalizeStringList(candidate.bestForTags, 5),
      goHereIf:
        typeof candidate.goHereIf === 'string' && candidate.goHereIf.trim()
          ? candidate.goHereIf.trim()
          : candidate.reason,
      maybeSkipIf:
        typeof candidate.maybeSkipIf === 'string' && candidate.maybeSkipIf.trim()
          ? candidate.maybeSkipIf.trim()
          : 'Maybe skip if you want a different vibe or setup than this place offers.',
      googleMapsUrl: typeof candidate.googleMapsUrl === 'string' ? candidate.googleMapsUrl : undefined,
      placeId: typeof candidate.placeId === 'string' ? candidate.placeId : undefined,
      sourceTitle: typeof candidate.sourceTitle === 'string' ? candidate.sourceTitle : undefined,
      sourceUri: typeof candidate.sourceUri === 'string' ? candidate.sourceUri : undefined,
      coordinates:
        candidate.coordinates &&
        typeof candidate.coordinates === 'object' &&
        typeof candidate.coordinates.latitude === 'number' &&
        typeof candidate.coordinates.longitude === 'number'
          ? candidate.coordinates
          : undefined,
      optionalDetails: normalizeOptionalDetails(candidate.optionalDetails),
    }

    if (
      looksLikeLeakedStructuredPayload(nextPlace.reason) ||
      looksLikeLeakedStructuredPayload(nextPlace.aiVerdict) ||
      looksLikeLeakedStructuredPayload(nextPlace.aiSummary)
    ) {
      return []
    }

    const normalizedName = normalizePlaceKey(nextPlace.name)
    const normalizedAddress = normalizePlaceKey(nextPlace.optionalDetails?.addressText ?? '')
    const coordinateKey = getCoordinateDedupeKey(nextPlace.coordinates)
    const dedupeKeys = [
      nextPlace.placeId ? `place-id:${normalizePlaceKey(nextPlace.placeId)}` : null,
      nextPlace.googleMapsUrl ? `maps-url:${normalizePlaceKey(nextPlace.googleMapsUrl)}` : null,
      nextPlace.sourceUri ? `source-uri:${normalizePlaceKey(nextPlace.sourceUri)}` : null,
      normalizedName && normalizedAddress ? `name-address:${normalizedName}|${normalizedAddress}` : null,
      normalizedName && coordinateKey ? `name-coords:${normalizedName}|${coordinateKey}` : null,
      normalizedName ? `name:${normalizedName}` : null,
    ].filter((dedupeKey): dedupeKey is string => Boolean(dedupeKey))

    if (dedupeKeys.length === 0 || dedupeKeys.some((dedupeKey) => seenKeys.has(dedupeKey))) {
      return []
    }

    for (const dedupeKey of dedupeKeys) {
      seenKeys.add(dedupeKey)
    }

    return [nextPlace]
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

function getMetaLine(place: AskAiMapPlace) {
  const details = place.optionalDetails
  const parts = [details?.categoryText, details?.ratingText, details?.openStatusText].filter(Boolean)
  return parts.join(' · ')
}

function formatPlaceCoordinates(place: AskAiMapPlace) {
  if (
    typeof place.coordinates?.latitude !== 'number' ||
    typeof place.coordinates?.longitude !== 'number'
  ) {
    return null
  }

  return `${place.coordinates.latitude.toFixed(6)}, ${place.coordinates.longitude.toFixed(6)}`
}

function mapPlaceToMapCard(place: AskAiMapPlace): PlaceCardData {
  return {
    id: place.id,
    name: place.name,
    category: place.optionalDetails?.categoryText ?? 'Google Maps pick',
    area: place.optionalDetails?.addressText ?? 'Metro Manila',
    address: place.optionalDetails?.addressText,
    city: 'Metro Manila',
    localArea: place.optionalDetails?.addressText,
    status: 'Unknown',
    reason: place.reason,
    description: place.reason,
    badge: place.optionalDetails?.categoryText ?? 'Google Maps',
    googleMapsUrl: place.googleMapsUrl ?? place.sourceUri ?? null,
    markerRatingText: place.optionalDetails?.ratingText ?? null,
    coordinates: {
      lat: place.coordinates?.latitude ?? null,
      lng: place.coordinates?.longitude ?? null,
    },
  }
}

function getQuickInfoRows(place: AskAiMapPlace) {
  const coordinatesText = formatPlaceCoordinates(place)

  return [
    place.optionalDetails?.addressText
      ? { label: 'Address', value: place.optionalDetails.addressText }
      : null,
    place.optionalDetails?.hoursText
      ? { label: 'Hours', value: place.optionalDetails.hoursText }
      : place.optionalDetails?.openStatusText
        ? { label: 'Hours', value: place.optionalDetails.openStatusText }
        : null,
    coordinatesText
      ? { label: 'Coordinates', value: coordinatesText }
      : null,
  ].filter((row): row is { label: string; value: string } => Boolean(row))
}

function readAskAiMapRouteCache(): AskAiMapRouteCache | null {
  try {
    const rawCache = window.sessionStorage.getItem(askAiMapRouteCacheKey)

    if (!rawCache) {
      return null
    }

    const parsedCache = JSON.parse(rawCache) as Partial<AskAiMapRouteCache>

    const recoveredState = {
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

    if (hasLeakedAskAiMapState(recoveredState)) {
      clearAskAiMapRouteCache()
      return null
    }

    return recoveredState
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
    normalizeRecoveredAskAiMapState(
      hasActiveAskAiMapRuntimeState() ? getAskAiMapRuntimeState() : null
    )
  )
  const initialAskAiMapRouteCacheRef = useRef<AskAiMapRouteCache | null>(
    normalizeRecoveredAskAiMapState(readAskAiMapRouteCache())
  )
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
  const [isPlaceSheetOpen, setIsPlaceSheetOpen] = useState(false)
  const [isPlaceSheetExpanded, setIsPlaceSheetExpanded] = useState(false)

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
    if (hasLeakedAskAiMapState(initialAskAiMapState)) {
      resetAskAiMapRuntimeState()
      clearAskAiMapRouteCache()
      return
    }

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
      if (hasLeakedAskAiMapState(runtimeState)) {
        resetAskAiMapRuntimeState()
        clearAskAiMapRouteCache()
        setErrorMessage('')
        setStatusMessage('')
        setAnswerText('')
        setPlaces([])
        setSources([])
        setSelectedPlaceId(null)
        setFocusedPlaceId(null)
        return
      }

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
  const mapPlaces = useMemo(() => places.map(mapPlaceToMapCard), [places])
  const canSubmit = query.trim().length > 0 && !isSearching
  const mapCenter = userLocation ? [userLocation.latitude, userLocation.longitude] as const : metroManilaCenter
  const shouldShowPermissionPrompt =
    permissionState === 'prompt' || permissionState === 'requesting' || permissionState === 'denied'
  const selectedPlace = useMemo(
    () => places.find((place) => place.id === selectedPlaceId) ?? places[0] ?? null,
    [places, selectedPlaceId]
  )

  useEffect(() => {
    if (!selectedPlaceId && places.length > 0) {
      setSelectedPlaceId(places[0]?.id ?? null)
      setFocusedPlaceId(places[0]?.id ?? null)
    }
  }, [places, selectedPlaceId])

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

  function openPlace(placeId: string) {
    setSelectedPlaceId(placeId)
    setFocusedPlaceId(placeId)
    setIsPlaceSheetOpen(true)
    setIsPlaceSheetExpanded(false)
  }

  function closePlaceSheet() {
    setIsPlaceSheetOpen(false)
    setIsPlaceSheetExpanded(false)
  }

  function handlePlaceSheetScroll(event: React.UIEvent<HTMLDivElement>) {
    if (isPlaceSheetExpanded) {
      return
    }

    if (event.currentTarget.scrollTop > 12) {
      setIsPlaceSheetExpanded(true)
    }
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
    setIsPlaceSheetOpen(false)
    setIsPlaceSheetExpanded(false)

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
          query: query.trim(),
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
          answerText: typeof data.answerText === 'string' ? data.answerText : '',
          places: nextPlaces,
          sources: nextSources,
          selectedPlaceId: nextPlaces[0]?.id ?? null,
          focusedPlaceId: nextPlaces[0]?.id ?? null,
        })
        setIsPlaceSheetOpen(false)
        setIsPlaceSheetExpanded(false)
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
      setIsPlaceSheetOpen(false)
      setIsPlaceSheetExpanded(false)
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
    setIsPlaceSheetOpen(false)
    setIsPlaceSheetExpanded(false)
    setPermissionError('')
    setPermissionState('idle')
  }

  if (isSessionLoading) {
    return <div className="gala-page-background min-h-screen" aria-hidden="true" />
  }

  if (!session) {
    return (
      <main className="gala-page-background min-h-screen px-4 py-5 text-[var(--text)] sm:px-5 lg:px-8">
        <div className="mx-auto flex min-h-[calc(100dvh-120px)] max-w-3xl flex-col justify-center">
          <button
            type="button"
            onClick={() => navigateToPath('/ask-ai/text')}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--line)] bg-white/88 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[var(--accent)] hover:text-[var(--accent-deep)]"
          >
            <AppIcon name="back" className="h-4 w-4" />
            <span>Back to Ask AI</span>
          </button>

          <section className="mt-5 overflow-hidden rounded-[32px] border border-[rgba(83,146,241,0.16)] bg-white/92 p-6 shadow-[0_22px_60px_rgba(15,23,42,0.08)] sm:p-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[linear-gradient(180deg,#eff6ff_0%,#dbeafe_100%)] text-[var(--accent)]">
                <AppIcon name="map" className="h-7 w-7" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">Ask AI Maps</p>
                <h1 className="mt-1 text-2xl font-black tracking-[-0.03em] text-slate-950">Sign in to find grounded places on the map</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  This route uses live Google Maps grounding, so we keep it tied to your GalaTayo session.
                </p>
              </div>
            </div>

            <GoogleSignInButton className="mt-6" redirectTo={`${window.location.origin}/ask-ai/maps`} />
          </section>
        </div>
      </main>
    )
  }

  return (
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
              mapMode="ask-ai-clean"
              onPlaceSelect={openPlace}
              onPlaceOpen={openPlace}
            />

            {isSearching ? (
              <div className="pointer-events-none absolute inset-0 rounded-[26px] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.14))]">
                <div className="absolute inset-0 animate-[gala-map-breathe_4s_ease-in-out_infinite] bg-[linear-gradient(135deg,rgba(255,255,255,0.0)_0%,rgba(255,255,255,0.28)_45%,rgba(255,255,255,0.0)_100%)]" />
                <div className="absolute left-[18%] top-[34%] h-4 w-4 animate-bounce rounded-full bg-[#3b82f6] shadow-[0_0_0_8px_rgba(59,130,246,0.12)]" />
                <div className="absolute left-[52%] top-[48%] h-4 w-4 animate-bounce rounded-full bg-[#4f8ff6] shadow-[0_0_0_8px_rgba(59,130,246,0.10)] [animation-delay:180ms]" />
                <div className="absolute left-[70%] top-[28%] h-4 w-4 animate-bounce rounded-full bg-[#5b95f8] shadow-[0_0_0_8px_rgba(59,130,246,0.11)] [animation-delay:320ms]" />
              </div>
            ) : null}

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

            <section className="absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+5.25rem)] z-[640] sm:inset-x-4 sm:bottom-4">
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

                {!isSearching && answerText ? (
                  <div className="mb-3 rounded-[24px] border border-[rgba(83,146,241,0.18)] bg-white/96 px-4 py-3 shadow-[0_16px_36px_rgba(15,23,42,0.12)]">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">Ask AI Take</p>
                    <p className="mt-1 text-sm leading-6 text-slate-700">{answerText}</p>
                  </div>
                ) : null}

                <div className="relative mb-3 overflow-visible">
                  <div className="flex w-full gap-3 overflow-x-auto overflow-y-visible px-1 pb-3 pt-2">
                    {isSearching ? <MinimalLoadingCard query={query} /> : null}

                    {!isSearching ? places.map((place) => {
                      const isSelected = place.id === selectedPlaceId
                      const metaLine = getMetaLine(place)
                      const mapsUrl = place.googleMapsUrl ?? place.sourceUri
                      const coordinatesText = formatPlaceCoordinates(place)
                      const reviewCountText = place.optionalDetails?.reviewCountText?.trim() ?? null

                      return (
                        <div
                          key={place.id}
                          className={`relative flex min-h-[212px] w-[270px] shrink-0 flex-col rounded-[24px] border bg-white/95 p-3 text-left shadow-[0_16px_36px_rgba(15,23,42,0.12)] transition ${
                            isSelected
                              ? 'z-20 -translate-y-2 border-[var(--accent)] ring-2 ring-[rgba(59,130,246,0.12)] shadow-[0_22px_46px_rgba(15,23,42,0.18)]'
                              : 'z-0 border-white/80 hover:-translate-y-1 hover:border-[rgba(20,35,58,0.14)]'
                          }`}
                          onMouseEnter={() => setFocusedPlaceId(place.id)}
                          onMouseLeave={() => setFocusedPlaceId(selectedPlaceId)}
                        >
                          <button
                            type="button"
                            onClick={() => openPlace(place.id)}
                            className="flex flex-1 text-left"
                          >
                            <div className="flex min-w-0 flex-1 flex-col">
                              <div className="flex items-start justify-between gap-3">
                                <h3 className="line-clamp-2 text-[15px] font-black leading-5 tracking-[-0.02em] text-slate-950">{place.name}</h3>
                              {place.optionalDetails?.ratingText ? (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700">
                                  <AppIcon name="reviews" className="h-3 w-3" />
                                  <span>
                                    {place.optionalDetails.ratingText}
                                    {reviewCountText ? ` · ${reviewCountText}` : ''}
                                  </span>
                                </span>
                              ) : null}
                            </div>
                            {metaLine ? <p className="mt-1 line-clamp-1 text-[12px] font-medium text-slate-600">{metaLine}</p> : null}
                            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-600">
                                {place.optionalDetails?.categoryText ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
                                    <AppIcon name="list" className="h-3 w-3" />
                                    <span>{place.optionalDetails.categoryText}</span>
                                  </span>
                                ) : null}
                                {place.optionalDetails?.addressText ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
                                    <AppIcon name="place" className="h-3 w-3" />
                                    <span className="line-clamp-1">{place.optionalDetails.addressText}</span>
                                  </span>
                                ) : null}
                                {coordinatesText ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">
                                    <AppIcon name="map" className="h-3 w-3" />
                                    <span className="font-mono">{coordinatesText}</span>
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-3 line-clamp-2 flex-1 text-[12px] leading-5 text-slate-700">{place.reason}</p>
                            </div>
                          </button>

                          <div className="mt-3 flex items-center pt-1">
                            {mapsUrl ? (
                              <a
                                href={mapsUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-3.5 text-[12px] font-semibold text-white transition hover:bg-slate-800"
                              >
                                <AppIcon name="map" className="h-3.5 w-3.5" />
                                <span>Maps</span>
                              </a>
                            ) : null}
                          </div>
                        </div>
                      )
                    }) : null}
                  </div>

                  {!isSearching && selectedPlace && isPlaceSheetOpen ? (
                    <div
                      className="pointer-events-none fixed inset-x-0 z-[760]"
                      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 4.75rem)' }}
                    >
                      <div
                        className="pointer-events-auto w-full overflow-hidden rounded-t-[30px] border-t border-[rgba(148,163,184,0.22)] bg-white shadow-[0_-10px_40px_rgba(15,23,42,0.18)] transition-[height] duration-300 ease-out"
                        style={{
                          height: isPlaceSheetExpanded ? 'calc(100dvh - 4.75rem)' : '52dvh',
                        }}
                      >
                        <div className="sticky top-0 z-10 bg-white px-5 pb-3 pt-2 backdrop-blur-md">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1" />
                            <span className="mt-1 h-1.5 w-12 rounded-full bg-slate-300/90" />
                            <button
                              type="button"
                              onClick={closePlaceSheet}
                              aria-label="Close place sheet"
                              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 hover:text-slate-950"
                            >
                              <X className="h-5 w-5" strokeWidth={2.2} />
                            </button>
                          </div>

                          <div className="mt-2 min-w-0">
                            <h2 className="line-clamp-2 text-[26px] font-black tracking-[-0.03em] text-slate-950">{selectedPlace.name}</h2>
                            {getMetaLine(selectedPlace) ? (
                              <p className="mt-2 text-[14px] font-medium text-slate-600">{getMetaLine(selectedPlace)}</p>
                            ) : null}
                          </div>
                        </div>

                        <div
                          className="h-[calc(100%-7.5rem)] overflow-y-auto px-5 pb-8 pr-6"
                          onScroll={handlePlaceSheetScroll}
                        >
                          <div className="space-y-4">
                          <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">AI Verdict</p>
                            <p className="mt-1 text-[15px] font-semibold leading-6 text-slate-900">{selectedPlace.aiVerdict}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">AI Summary</p>
                            <p className="mt-1 text-sm leading-6 text-slate-700">{selectedPlace.aiSummary}</p>
                          </div>

                          {selectedPlace.whyItMatches.length > 0 ? (
                            <div>
                              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Why It Matches</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {selectedPlace.whyItMatches.map((reason) => (
                                  <span
                                    key={reason}
                                    className="inline-flex items-center rounded-full border border-[rgba(148,163,184,0.18)] bg-slate-50 px-3 py-1.5 text-[12px] font-medium text-slate-700"
                                  >
                                    {reason}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {selectedPlace.bestForTags.length > 0 ? (
                            <div>
                              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Best For</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {selectedPlace.bestForTags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="inline-flex items-center rounded-full bg-[#ebf3ff] px-3 py-1.5 text-[12px] font-bold text-[#2563eb]"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-[20px] border border-emerald-100 bg-emerald-50/70 p-3">
                              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-emerald-700">Go Here If</p>
                              <p className="mt-1 text-[13px] leading-5 text-emerald-950">{selectedPlace.goHereIf}</p>
                            </div>
                            <div className="rounded-[20px] border border-amber-100 bg-amber-50/80 p-3">
                              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-amber-700">Maybe Skip If</p>
                              <p className="mt-1 text-[13px] leading-5 text-amber-950">{selectedPlace.maybeSkipIf}</p>
                            </div>
                          </div>

                          {getQuickInfoRows(selectedPlace).length > 0 ? (
                            <div>
                              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Quick Info</p>
                              <div className="mt-2 grid gap-2">
                                {getQuickInfoRows(selectedPlace).map((row) => (
                                  <div
                                    key={row.label}
                                    className="flex items-start justify-between gap-3 rounded-[16px] border border-[rgba(148,163,184,0.16)] bg-slate-50/80 px-3 py-2"
                                  >
                                    <span className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">{row.label}</span>
                                    <span className="text-right text-[12px] font-medium text-slate-700">{row.value}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {(selectedPlace.googleMapsUrl ?? selectedPlace.sourceUri) ? (
                            <div>
                              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Actions</p>
                              <div className="mt-2">
                                <a
                                  href={selectedPlace.googleMapsUrl ?? selectedPlace.sourceUri}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-4 text-[14px] font-semibold text-white transition hover:bg-slate-800"
                                >
                                  <AppIcon name="map" className="h-4 w-4" />
                                  <span>Maps</span>
                                </a>
                              </div>
                            </div>
                          ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
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
  )
}

export default AskAiMapPage

