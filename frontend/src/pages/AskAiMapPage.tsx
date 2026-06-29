import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
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
const ASK_AI_MAPS_REQUEST_TIMEOUT_MS = 45_000

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

function normalizePlaces(value: unknown): AskAiMapPlace[] {
  if (!Array.isArray(value)) {
    return []
  }

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

    return [{
      id: candidate.id,
      name: candidate.name,
      reason: candidate.reason,
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
  const canSubmit = requestQuery.trim().length > 0 && !isSearching
  const mapCenter = userLocation ? [userLocation.latitude, userLocation.longitude] as const : metroManilaCenter
  const shouldShowPermissionPrompt =
    permissionState === 'prompt' || permissionState === 'requesting' || permissionState === 'denied'

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
              onPlaceSelect={openPlace}
              onPlaceOpen={openPlace}
            />

            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,rgba(248,247,244,0.72)_0%,rgba(248,247,244,0.18)_58%,rgba(248,247,244,0)_100%)]" />
            <div className="pointer-events-none absolute left-20 right-3 top-3 z-[620] sm:left-auto sm:right-4 sm:top-4 sm:w-auto">
              <div className="pointer-events-auto ml-auto flex max-w-[min(84vw,360px)] items-start gap-3 rounded-[26px] border border-white/70 bg-white/84 px-3 py-3 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(23,45,107,0.08)] text-[var(--accent-deep)]">
                  <AppIcon name="askAi" className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium tracking-[-0.01em] text-slate-900">Google Maps grounded local picks</p>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">Live Ask AI Maps · Metro Manila</p>
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
                  {!isSearching && answerText ? <p className="mt-2 line-clamp-3 text-[12px] leading-5 text-slate-700">{answerText}</p> : null}
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

                <div className="flex w-full gap-3 overflow-x-auto pb-2">
                  {isSearching ? <MinimalLoadingCard query={query} /> : null}

                  {!isSearching ? places.map((place) => {
                    const isSelected = place.id === selectedPlaceId
                    const metaLine = getMetaLine(place)
                    const mapsUrl = place.googleMapsUrl ?? place.sourceUri
                    const coordinatesText = formatPlaceCoordinates(place)

                    return (
                      <div
                        key={place.id}
                        className={`flex min-h-[212px] w-[270px] shrink-0 flex-col rounded-[24px] border bg-white/95 p-3 text-left shadow-[0_16px_36px_rgba(15,23,42,0.12)] transition ${
                          isSelected
                            ? 'border-[var(--accent)] ring-2 ring-[rgba(59,130,246,0.12)]'
                            : 'border-white/80 hover:border-[rgba(20,35,58,0.14)]'
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
                                  <span>{place.optionalDetails.ratingText}</span>
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

