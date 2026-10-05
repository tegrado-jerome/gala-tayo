import { memo, startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight } from '@phosphor-icons/react/dist/csr/ArrowRight'
import { Check } from '@phosphor-icons/react/dist/csr/Check'
import { Clock } from '@phosphor-icons/react/dist/csr/Clock'
import { MapPin } from '@phosphor-icons/react/dist/csr/MapPin'
import { Phone } from '@phosphor-icons/react/dist/csr/Phone'
import { Sparkle as Sparkles } from '@phosphor-icons/react/dist/csr/Sparkle'
import { Square } from '@phosphor-icons/react/dist/csr/Square'
import { Star } from '@phosphor-icons/react/dist/csr/Star'
import { X } from '@phosphor-icons/react/dist/csr/X'
import { FeatureGuideModalTrigger, featureGuideContent } from '../components/FeatureGuideModal'
import AskAiUsagePill from '../components/AskAiUsagePill'
import { TaraAvatar } from '../components/home/ask-ai/AskAiComponents'
import { GuestAuthPrompt } from '../components/GuestAuthPrompt'
import MapView from '../components/MapView'
import { Button, Chip, Panel, Sheet, Skeleton, Tag, buttonClass, cx } from '../components/ui'
import { useSavedFavorites } from '../context/SavedFavoritesContext'
import {
  cancelAskAiMapRequest,
  clearAskAiMapAbortController,
  getAskAiMapRequestVersion,
  getAskAiMapRuntimeState,
  hasActiveAskAiMapRuntimeState,
  incrementAskAiMapRequestVersion,
  patchAskAiMapRuntimeState,
  seedAskAiMapRuntimeState,
  setAskAiMapAbortController,
  subscribeToAskAiMapRuntime,
  wasAskAiMapRequestCancelled,
  type AskAiMapPlace,
  type AskAiMapSource,
} from '../utils/askAiMapRuntime'
import {
  getOpenStatusChip,
  getShortAreaText,
  toDisplayPlace,
  formatReviewCount,
  type AskAiMapDisplayPlace,
} from '../utils/askAiMapDisplay'
import { getAskAiUsageStatusFromResponse, normalizeAskAiUsageStatus, type AskAiUsageResponse, type AskAiUsageStatus } from '../utils/askAiUsage'
import { registerAskAiTask, completeAskAiTask, failAskAiTask } from '../utils/askAiTaskStore'
import { lockBodyScroll, unlockBodyScroll } from '../utils/bodyScrollLock'
import { getApiUrl } from '../utils/apiClient'
import { getAskAiRequestHeaders, getOrCreateAskAiGuestId } from '../utils/askAiIdentity'
import { hasAccountSession } from '../utils/guestSession'
import { trackAskAiMapsUsed } from '../utils/analytics'
import { useAskAiUsageAutoRefresh } from '../hooks/useAskAiUsageAutoRefresh'
import { useAskAiViewportHeightSync } from '../hooks/useAskAiViewportHeightSync'
import { replaceWithPath } from '../utils/navigation'
import {
  type AskAiMapChipId,
  type AskAiMapsResponse,
  type PermissionState,
  type AskAiMapRouteCache,
  type CoordinateVerificationStatus,
  type AskAiMapNormalizedPlace,
  ASK_AI_MAPS_REQUEST_TIMEOUT_MS,
  getEmptyReasonMessage,
  buildSuggestedSearchesMessage,
  isDailyAskAiLimitMessage,
  getAskAiMapsRequestErrorMessage,
  extractStructuredAnswerText,
  chipLabelsById,
  metroManilaCenter,
  buildMapRequestQuery,
  getDisplayName,
  getDisplayAddress,
  buildGoogleMapsSearchUrl,
  shortenAddress,
  getMetaDot,
  mapPlaceToMapCard,
  normalizePlaceCoordinates,
  hasVerifiedCoordinates,
  getRawCoordinateValueForDebug,
  normalizePlaces,
  normalizeSources,
  readAskAiMapRouteCache,
  writeAskAiMapRouteCache,
  clearAskAiMapRouteCache,
} from '../components/home/ask-ai/askAiMapHelpers'

const starterSearches = ['Quiet cafes in QC', 'Date spots in BGC', 'Sulit eats near Katipunan']

function Notice({ tone, children, onDismiss }: { tone: 'bad' | 'warn' | 'info'; children: ReactNode; onDismiss?: () => void }) {
  const toneClass = {
    bad: 'bg-[var(--bad-soft)] text-[var(--bad)]',
    warn: 'bg-[var(--warn-soft)] text-[var(--warn)]',
    info: 'bg-[var(--fill)] text-[var(--ink-2)]',
  }[tone]

  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={`g-sm flex items-start gap-2 rounded-[var(--r-3)] px-3 py-2.5 ${toneClass}`}>
      <p className="min-w-0 flex-1">{children}</p>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="-m-1 grid h-8 w-8 shrink-0 place-items-center">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className="mt-4">
      <p className="g-eyebrow">{title}</p>
      <ul className="g-sm mt-1.5 list-disc space-y-1 pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

const AskAiMapComposer = memo(function AskAiMapComposer({
  query,
  selectedChipIds,
  isSearching,
  isRegistered,
  usageStatus,
  onSubmit,
  onCancel,
  onGuestUpgradePrompt,
}: {
  query: string
  selectedChipIds: AskAiMapChipId[]
  isSearching: boolean
  isRegistered: boolean
  usageStatus: AskAiUsageStatus | null
  onSubmit: (queryOverride?: string) => void
  onCancel: () => void
  onGuestUpgradePrompt: () => void
}) {
  const [draftQuery, setDraftQuery] = useState(query)
  const queryInputRef = useRef<HTMLTextAreaElement | null>(null)
  const canSubmit = buildMapRequestQuery(draftQuery, selectedChipIds).trim().length > 0
  const isLimitReached = usageStatus ? !usageStatus.allowed || usageStatus.remaining <= 0 : false

  useLayoutEffect(() => {
    const element = queryInputRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 120)}px`
  }, [draftQuery])

  const handleSubmit = () => {
    const finalQuery = draftQuery.trim()
    if (isLimitReached && !isRegistered) {
      onGuestUpgradePrompt()
      return
    }
    if (!finalQuery) return
    onSubmit(finalQuery)
  }

  return (
    <div className="flex items-end gap-2 rounded-[var(--r-4)] border border-[var(--line)] bg-[var(--surface)] p-1.5 pl-4 shadow-[var(--sh-1)] focus-within:border-[var(--ink)]">
      <label htmlFor="ask-ai-map-input" className="sr-only">
        Ask the map
      </label>
      <textarea
        id="ask-ai-map-input"
        ref={queryInputRef}
        value={draftQuery}
        onChange={(event) => setDraftQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            event.stopPropagation()
            if (isSearching) onCancel()
            else handleSubmit()
          }
        }}
        placeholder="Ask the map: tahimik na cafe sa QC…"
        rows={1}
        className="max-h-[120px] min-h-[40px] min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-2 text-[16px] font-medium leading-snug text-[var(--ink)] outline-none [font-family:var(--font-display)] placeholder:text-[var(--ink-3)]"
      />
      <Button
        variant={isSearching ? 'ink' : 'tara'}
        iconOnly
        onClick={() => (isSearching ? onCancel() : handleSubmit())}
        disabled={!isSearching && (!canSubmit || (isLimitReached && isRegistered))}
        aria-label={isSearching ? 'Stop searching' : 'Search the map with AI'}
      >
        {isSearching ? <Square aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
      </Button>
    </div>
  )
})

function AskAiMapPage() {
  const initialAskAiMapRuntimeStateRef = useRef(
    hasActiveAskAiMapRuntimeState() ? getAskAiMapRuntimeState() : null
  )
  const initialAskAiMapRouteCacheRef = useRef<AskAiMapRouteCache | null>(readAskAiMapRouteCache())
  const cardRefs = useRef(new Map<string, HTMLDivElement>())
  const cardScrollerRef = useRef<HTMLDivElement | null>(null)
  const initialAskAiMapRuntimeState = initialAskAiMapRuntimeStateRef.current
  const initialAskAiMapRouteCache = initialAskAiMapRouteCacheRef.current
  const initialAskAiMapState = initialAskAiMapRuntimeState ?? initialAskAiMapRouteCache
  const { session, isSessionLoading } = useSavedFavorites()
  useAskAiViewportHeightSync()
  const isRegistered = hasAccountSession(session)
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
  const [hasSearched, setHasSearched] = useState(Boolean(
    (initialAskAiMapState?.places?.length ?? 0) > 0 ||
    initialAskAiMapState?.isSearching === true ||
    Boolean(initialAskAiMapState?.query?.trim()) ||
    Boolean(initialAskAiMapState?.errorMessage?.trim()) ||
    Boolean(initialAskAiMapState?.statusMessage?.trim()) ||
    Boolean(initialAskAiMapState?.answerText?.trim()) ||
    (initialAskAiMapState?.sources?.length ?? 0) > 0
  ))
  const [errorMessage, setErrorMessage] = useState(
    initialAskAiMapState?.errorMessage && isDailyAskAiLimitMessage(initialAskAiMapState.errorMessage)
      ? ''
      : (initialAskAiMapState?.errorMessage ?? '')
  )
  const [statusMessage, setStatusMessage] = useState(
    initialAskAiMapState?.statusMessage && isDailyAskAiLimitMessage(initialAskAiMapState.statusMessage)
      ? ''
      : (initialAskAiMapState?.statusMessage ?? '')
  )
  const [answerText, setAnswerText] = useState(initialAskAiMapState?.answerText ?? '')
  const [places, setPlaces] = useState<AskAiMapPlace[]>(initialAskAiMapState?.places ?? [])
  const [sources, setSources] = useState<AskAiMapSource[]>(initialAskAiMapState?.sources ?? [])
  const [askAiMapsUsageStatus, setAskAiMapsUsageStatus] = useState<AskAiUsageStatus | null>(null)
  const [isGuestUpgradePromptOpen, setIsGuestUpgradePromptOpen] = useState(false)
  const [askAiMapsRefreshSignal, setAskAiMapsRefreshSignal] = useState(0)
  const submitInFlightRef = useRef(false)
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(initialAskAiMapState?.selectedPlaceId ?? null)
  const [focusedPlaceId, setFocusedPlaceId] = useState<string | null>(initialAskAiMapState?.focusedPlaceId ?? null)
  const [selectedPlaceFocusSignal, setSelectedPlaceFocusSignal] = useState(0)
  const [isPlaceDetailOpen, setIsPlaceDetailOpen] = useState(false)
  const [isMapPinNoticeDismissed, setIsMapPinNoticeDismissed] = useState(false)
  async function refreshAskAiMapsUsage(accessToken?: string | null, signal?: AbortSignal) {
    const usageEndpoint = getApiUrl('/ask-ai/usage/check?type=ask_ai_maps')
    const guestId = accessToken ? null : getOrCreateAskAiGuestId()

    if (!accessToken && !guestId) {
      throw new Error('Missing Ask AI guest identifier.')
    }

    setAskAiMapsUsageStatus(null)

    const response = await fetch(usageEndpoint, {
      method: 'GET',
      cache: 'no-store',
      headers: await getAskAiRequestHeaders(accessToken ?? null),
      signal,
    })

    const data = (await response.json()) as AskAiUsageResponse

    if (!response.ok) {
      throw new Error(data.message || data.error || 'Failed to check Ask AI usage.')
    }

    const usageStatus = getAskAiUsageStatusFromResponse(data, ['askAiMaps'])

    if (!usageStatus) {
      throw new Error('Ask AI usage response was incomplete.')
    }

    setAskAiMapsUsageStatus(usageStatus)
    return usageStatus
  }

  useEffect(() => {
    if (!askAiMapsUsageStatus?.allowed) {
      return
    }

    if (!isDailyAskAiLimitMessage(errorMessage) && !isDailyAskAiLimitMessage(statusMessage)) {
      return
    }

    patchAskAiMapRuntimeState({
      errorMessage: isDailyAskAiLimitMessage(errorMessage) ? '' : errorMessage,
      statusMessage: isDailyAskAiLimitMessage(statusMessage) ? '' : statusMessage,
    })
  }, [askAiMapsUsageStatus?.allowed, errorMessage, statusMessage])

  useEffect(() => {
    if (isSessionLoading) {
      return
    }

    const controller = new AbortController()

    const loadAskAiUsage = async () => {
      try {
        const usageStatus = await refreshAskAiMapsUsage(session?.access_token ?? null, controller.signal)

        if (usageStatus.allowed && (isDailyAskAiLimitMessage(errorMessage) || isDailyAskAiLimitMessage(statusMessage))) {
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
  }, [askAiMapsRefreshSignal, errorMessage, isSessionLoading, session?.access_token, statusMessage])

  useAskAiUsageAutoRefresh({
    enabled: !isSessionLoading,
    onRefresh: () => {
      setAskAiMapsRefreshSignal((prev) => prev + 1)
    },
  })

  useEffect(() => {
    const initialError = initialAskAiMapState?.errorMessage ?? ''
    const initialStatus = initialAskAiMapState?.statusMessage ?? ''
    seedAskAiMapRuntimeState({
      query: initialAskAiMapState?.query ?? '',
      selectedChipIds: initialAskAiMapState?.selectedChipIds ?? [],
      userLocation: initialAskAiMapState?.userLocation ?? null,
      isSearching: initialAskAiMapState?.isSearching === true,
      errorMessage: initialError && isDailyAskAiLimitMessage(initialError) ? '' : initialError,
      statusMessage: initialStatus && isDailyAskAiLimitMessage(initialStatus) ? '' : initialStatus,
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

  const requestQuery = useMemo(() => buildMapRequestQuery(query, selectedChipIds), [query, selectedChipIds])
  const normalizedPlaces = useMemo<AskAiMapNormalizedPlace[]>(
    () => {
      const normalized = places.map((place, index) => {
        const normalizedCoordinates = normalizePlaceCoordinates(place, {
          query: requestQuery || query,
          address: getDisplayAddress(place),
          placeName: getDisplayName(place),
        })
        const mapCoordinates = hasVerifiedCoordinates(place, normalizedCoordinates) ? normalizedCoordinates : null
        const coordinateVerificationStatus: CoordinateVerificationStatus = mapCoordinates
          ? 'verified'
          : normalizedCoordinates
            ? 'unverified'
            : 'missing'

        return {
          ...place,
          displayIndex: index + 1,
          normalizedCoordinates,
          mapCoordinates,
          coordinates: mapCoordinates ?? place.coordinates,
          hasPin: Boolean(mapCoordinates),
          coordinateVerificationStatus,
        }
      })

      if (normalized.length > 0) {
        console.table(
          normalized.map((place, index) => {
            const rawLat = getRawCoordinateValueForDebug(places[index], 'lat')
            const rawLng = getRawCoordinateValueForDebug(places[index], 'lng')
            const rawLngNumber = Number(rawLng)

            return {
              index,
              displayIndex: index + 1,
              name: place.name,
              rawLat,
              rawLng,
              finalLat: place.normalizedCoordinates?.lat,
              finalLng: place.normalizedCoordinates?.lng,
              lngDelta:
                place.normalizedCoordinates && Number.isFinite(rawLngNumber)
                  ? place.normalizedCoordinates.lng - rawLngNumber
                  : null,
            }
          })
        )
      }

      return normalized
    },
    [places, query, requestQuery]
  )
  const mapPlaces = useMemo(
    () => normalizedPlaces
      .filter((place) => place.mapCoordinates !== null)
      .map((place) => mapPlaceToMapCard(place)),
    [normalizedPlaces]
  )
  const displayPlaces = useMemo<AskAiMapDisplayPlace[]>(
    () => normalizedPlaces.map((place) => toDisplayPlace(place, requestQuery || query)),
    [normalizedPlaces, query, requestQuery]
  )
  const placesWithPinsCount = useMemo(
    () => normalizedPlaces.filter((place) => place.mapCoordinates !== null).length,
    [normalizedPlaces]
  )
  const hasMissingMapPins = normalizedPlaces.some((place) => place.mapCoordinates === null)
  const selectedPlace = useMemo(
    () => normalizedPlaces.find((place) => place.id === selectedPlaceId) ?? normalizedPlaces[0] ?? null,
    [normalizedPlaces, selectedPlaceId]
  )
  const selectedDisplayPlace = useMemo<AskAiMapDisplayPlace | null>(
    () => selectedPlace ? toDisplayPlace(selectedPlace, requestQuery || query) : null,
    [selectedPlace, query, requestQuery]
  )
  const selectedGoogleMapsUrl = selectedDisplayPlace
    ? selectedDisplayPlace.googleMapsUrl || buildGoogleMapsSearchUrl(selectedDisplayPlace.title, selectedDisplayPlace.address)
    : null
  const mapCenter = useMemo(
    () => (userLocation ? [userLocation.latitude, userLocation.longitude] as const : metroManilaCenter),
    [userLocation],
  )
  const mapLayoutKey = `${normalizedPlaces.length}:${placesWithPinsCount}`
  const shouldShowPermissionPrompt =
    permissionState === 'prompt' || permissionState === 'requesting' || permissionState === 'denied'
  const shouldShowMapPinNotice = !isSearching && hasMissingMapPins && !isMapPinNoticeDismissed
  const shouldShowLimitWarning =
    isRegistered &&
    !isSearching &&
    Boolean(askAiMapsUsageStatus && (!askAiMapsUsageStatus.allowed || askAiMapsUsageStatus.remaining <= 0))
  const showDesktopResultsSidebar =
    hasSearched ||
    isSearching ||
    normalizedPlaces.length > 0 ||
    Boolean(answerText) ||
    Boolean(statusMessage) ||
    Boolean(errorMessage) ||
    sources.length > 0

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

    lockBodyScroll()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPlaceDetailOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      unlockBodyScroll()
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isPlaceDetailOpen])

  useEffect(() => {
    if (places.length === 0) {
      setIsPlaceDetailOpen(false)
    }
  }, [places.length])

  useEffect(() => {
    const card = selectedPlaceId ? cardRefs.current.get(selectedPlaceId) : null
    const scroller = cardScrollerRef.current
    if (!card || !scroller) {
      return
    }

    if (window.matchMedia('(max-width: 1023px)').matches) {
      window.requestAnimationFrame(() => card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }))
      return
    }

    const top = scroller.scrollTop + (card.getBoundingClientRect().top - scroller.getBoundingClientRect().top) - (scroller.clientHeight - card.offsetHeight) / 2
    scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
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
    setSelectedPlaceFocusSignal((currentValue) => currentValue + 1)
    setIsPlaceDetailOpen(false)
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

  async function handleSubmit(options?: { selectedChipIdsOverride?: AskAiMapChipId[]; queryOverride?: string }) {
    const effectiveSelectedChipIds = options?.selectedChipIdsOverride ?? selectedChipIds
    const effectiveQuery = options?.queryOverride ?? query
    const effectiveCanSubmit = buildMapRequestQuery(effectiveQuery, effectiveSelectedChipIds).trim().length > 0 && !isSearching

    const guestId = session?.access_token ? null : getOrCreateAskAiGuestId()

    if ((!session?.access_token && !guestId) || !effectiveCanSubmit || submitInFlightRef.current) {
      return
    }

    submitInFlightRef.current = true
    const effectiveRequestQuery = buildMapRequestQuery(effectiveQuery, effectiveSelectedChipIds)
    const effectiveUsesNearMe = effectiveSelectedChipIds.includes('near-me')
    const effectiveUsesOpenNow = effectiveSelectedChipIds.includes('open-now')
    const { version: requestVersion, requestId } = incrementAskAiMapRequestVersion()

    setQuery(effectiveQuery)
    setHasSearched(true)
    setIsMapPinNoticeDismissed(false)
    patchAskAiMapRuntimeState({
      query: effectiveQuery,
      selectedChipIds: effectiveSelectedChipIds,
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

    registerAskAiTask('maps')

    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), ASK_AI_MAPS_REQUEST_TIMEOUT_MS)
    setAskAiMapAbortController(controller, timeoutId)

    try {
      const response = await fetch(getApiUrl(`/ask-ai/maps?t=${Date.now()}`), {
        method: 'POST',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          ...(await getAskAiRequestHeaders(session?.access_token ?? null)),
          'x-request-id': requestId,
        },
        body: JSON.stringify({
          query: effectiveRequestQuery,
          selectedChips: effectiveSelectedChipIds.map((chipId) => chipLabelsById.get(chipId) ?? chipId),
          nearMe: effectiveUsesNearMe,
          openNow: effectiveUsesOpenNow,
          userLocation,
        }),
      })

      if (getAskAiMapRequestVersion() !== requestVersion) {
        return
      }

      const data = await response.json() as AskAiMapsResponse
      const usageStatus = getAskAiUsageStatusFromResponse(data, ['askAiMaps']) ?? normalizeAskAiUsageStatus(data.usage)

      if (usageStatus) {
        setAskAiMapsUsageStatus(usageStatus)
      }

      if (!response.ok) {
        throw new Error(data.message || 'Ask AI Maps could not load places right now.')
      }

      if (getAskAiMapRequestVersion() !== requestVersion) {
        return
      }

      const nextPlaces = normalizePlaces(data.places)
      const nextSources = normalizeSources(data.sources)
      const emptyReasonMessage = getEmptyReasonMessage(data.emptyReason) ?? data.message ?? ''
      const suggestedSearchesMessage = buildSuggestedSearchesMessage(data.suggestedSearches)
      const nextStatusMessage = [emptyReasonMessage, suggestedSearchesMessage].filter(Boolean).join(' ')

      startTransition(() => {
        if (getAskAiMapRequestVersion() !== requestVersion) {
          return
        }

        completeAskAiTask('maps', { places: nextPlaces, answerText: typeof data.answerText === 'string' ? extractStructuredAnswerText(data.answerText) : undefined })
        trackAskAiMapsUsed({
          placeCount: nextPlaces.length,
        })
        patchAskAiMapRuntimeState({
          query: effectiveQuery,
          selectedChipIds: effectiveSelectedChipIds,
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
      if (error instanceof DOMException && error.name === 'AbortError') {
        if (wasAskAiMapRequestCancelled()) {
          return
        }
      }

      if (getAskAiMapRequestVersion() !== requestVersion) {
        return
      }

      const errorMessage = getAskAiMapsRequestErrorMessage(error)
      if (!isRegistered && errorMessage.toLowerCase().includes('daily limit')) {
        setIsGuestUpgradePromptOpen(true)
      }
      failAskAiTask('maps', errorMessage)
      patchAskAiMapRuntimeState({
        query: effectiveQuery,
        selectedChipIds: effectiveSelectedChipIds,
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
      if (session?.access_token || getOrCreateAskAiGuestId()) {
        try {
          await refreshAskAiMapsUsage(session?.access_token ?? null)
        } catch (error) {
          console.warn('Unable to refresh Ask AI Maps usage state:', error)
        }
      }
      window.clearTimeout(timeoutId)
      if (!wasAskAiMapRequestCancelled()) {
        clearAskAiMapAbortController()
      }
      submitInFlightRef.current = false
    }
  }

  function clearTransientSearchOutput() {
    setIsPlaceDetailOpen(false)
    setErrorMessage('')
    setStatusMessage('')
    setAnswerText('')
    setPlaces([])
    setSources([])
    setSelectedPlaceId(null)
    setFocusedPlaceId(null)
  }

  async function handleEnterSearch(queryOverride?: string) {
    if (isSearching) {
      cancelAskAiMapRequest()
      return
    }

    if (places.length > 0 || Boolean(errorMessage) || Boolean(statusMessage) || Boolean(answerText) || isPlaceDetailOpen) {
      clearTransientSearchOutput()
    }

    await handleSubmit({ queryOverride })
  }

  const chatQueryRef = useRef(new URLSearchParams(window.location.search).get('q')?.trim() ?? '')
  useEffect(() => {
    const chatQuery = chatQueryRef.current
    if (!chatQuery || isSessionLoading) {
      return
    }

    chatQueryRef.current = ''
    replaceWithPath('/ask-ai/maps')
    void handleEnterSearch(chatQuery)
    // Runs once for the ?q= question handed over from the chat panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSessionLoading])

  if (isSessionLoading) {
    return (
      <main className="fixed inset-x-0 top-[calc(56px+env(safe-area-inset-top,0px))] bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom,0px))] lg:top-[68px] lg:bottom-0">
        <Skeleton className="h-full w-full rounded-none!" />
      </main>
    )
  }

  const stopSearch = () => {
    setIsSearching(false)
    cancelAskAiMapRequest()
  }

  return (
    <>
      <GuestAuthPrompt variant="ask-ai" mode="modal" isOpen={isGuestUpgradePromptOpen} onClose={() => setIsGuestUpgradePromptOpen(false)} />

      <main className="fixed inset-x-0 top-[calc(56px+env(safe-area-inset-top,0px))] bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom,0px))] overflow-hidden overscroll-none lg:top-[68px] lg:bottom-0 lg:grid lg:grid-cols-[minmax(0,1fr)_400px]">
        <section className="absolute inset-0 lg:relative [&_.g-lpin.is-n]:bg-[var(--ink)] [&_.g-lpin.is-n]:text-[var(--on-ink)] [&_.g-lpin.is-on]:bg-[var(--ink)] [&_.g-lpin.is-on]:text-[var(--on-ink)]" aria-label="AI map">
          <MapView
            places={mapPlaces}
            selectedPlaceId={selectedPlaceId}
            focusedPlaceId={focusedPlaceId}
            center={mapCenter}
            zoom={userLocation ? 14 : 12}
            autoFitToPlaces={placesWithPinsCount > 0}
            focusSelectedPlaceOnChange
            selectedPlaceFocusSignal={selectedPlaceFocusSignal}
            className="h-full"
            layoutKey={mapLayoutKey}
            onPlaceSelect={selectPlace}
          />

          {shouldShowPermissionPrompt ? (
            <div className="absolute inset-0 z-[700] grid place-items-center bg-[var(--scrim)] p-4">
              <Panel className="w-full max-w-sm">
                <h2 className="g-h3">Use your location?</h2>
                <p className="g-sm g-mut mt-1">Nearby results work better when we can center the map on you.</p>
                {permissionError ? <p className="g-sm mt-3 text-[var(--bad)]">{permissionError}</p> : null}
                <div className="mt-4 flex gap-2">
                  <Button variant="ink" className="flex-1" onClick={requestLocationPermission} loading={permissionState === 'requesting'} disabled={permissionState === 'requesting'}>
                    Use my location
                  </Button>
                  <Button
                    variant="soft"
                    onClick={() => {
                      setPermissionState('idle')
                      if (!userLocation) {
                        setSelectedChipIds((currentValue) => currentValue.filter((value) => value !== 'near-me'))
                      }
                    }}
                  >
                    Not now
                  </Button>
                </div>
              </Panel>
            </div>
          ) : null}
        </section>

        <aside className="absolute inset-x-0 bottom-0 z-[650] flex max-h-[62%] flex-col gap-3 rounded-t-[var(--r-4)] border-t border-[var(--line-2)] bg-[var(--surface)] px-4 pt-2.5 pb-3 shadow-[var(--sh-3)] lg:relative lg:inset-auto lg:z-auto lg:max-h-none lg:min-h-0 lg:rounded-none lg:border-t-0 lg:border-l lg:px-5 lg:py-5 lg:shadow-none">
          <div className="g-grab mb-0! lg:hidden" aria-hidden="true" />

          <div className="flex items-center gap-2.5">
            <TaraAvatar />
            <div className="min-w-0 flex-1">
              <p className="g-h3 leading-tight lg:hidden">Ask the map</p>
              <h1 className="g-h2 hidden truncate lg:block">{query.trim() || 'Ask the map'}</h1>
              <p className="g-xs g-mut">Tara pins the picks for you</p>
            </div>
            <AskAiUsagePill usageStatus={askAiMapsUsageStatus} />
            <FeatureGuideModalTrigger content={featureGuideContent.maps} className="h-11 w-11" />
          </div>

          <AskAiMapComposer
            key={query}
            query={query}
            selectedChipIds={selectedChipIds}
            isSearching={isSearching}
            isRegistered={isRegistered}
            usageStatus={askAiMapsUsageStatus}
            onSubmit={(queryOverride) => void handleEnterSearch(queryOverride)}
            onCancel={stopSearch}
            onGuestUpgradePrompt={() => setIsGuestUpgradePromptOpen(true)}
          />

          {!showDesktopResultsSidebar ? (
            <div className="flex flex-wrap gap-2">
              {starterSearches.map((search) => (
                <Chip key={search} onClick={() => void handleEnterSearch(search)}>
                  {search}
                </Chip>
              ))}
            </div>
          ) : null}

          {shouldShowLimitWarning ? <Notice tone="warn">Ubos na ang AI map searches mo today. Balik ka bukas.</Notice> : null}
          {errorMessage && !isSearching ? <Notice tone="bad">{errorMessage}</Notice> : null}
          {!errorMessage && statusMessage && !isSearching ? <Notice tone="info">{statusMessage}</Notice> : null}
          {shouldShowMapPinNotice ? (
            <Notice tone="info" onDismiss={() => setIsMapPinNoticeDismissed(true)}>
              Some picks have no pin because we could not verify their exact spot. Open details for the Google Maps link.
            </Notice>
          ) : null}

          {!isSearching && normalizedPlaces.length > 0 ? <p className="g-xs g-fnt hidden lg:block">{normalizedPlaces.length} places</p> : null}

          <div
            ref={cardScrollerRef}
            className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:min-h-0 lg:flex-1 lg:snap-none lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:px-0 [&::-webkit-scrollbar]:hidden"
          >
            {isSearching && !isGuestUpgradePromptOpen ? (
              <div className="m-msg-ai w-[85%] shrink-0 lg:w-full" aria-live="polite">
                <TaraAvatar />
                <div className="m-bubble-ai flex-1">
                  <span className="m-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="sr-only">Tara is searching</span>
                  {query ? <p className="g-sm g-mut line-clamp-2">Looking for “{query.trim()}”</p> : null}
                </div>
              </div>
            ) : null}

            {!isSearching
              ? normalizedPlaces.map((place, index) => {
                  const display = displayPlaces[index]
                  if (!display) return null
                  const isSelected = place.id === selectedPlaceId
                  const areaText = getShortAreaText(display)
                  const openStatusChip = getOpenStatusChip(display)
                  const ratingText = display.ratingText || (typeof place.rating === 'number' ? place.rating.toFixed(1) : '')
                  const reviewCountText = display.reviewCountText || formatReviewCount(place.reviewCount)

                  return (
                    <div
                      key={place.id}
                      ref={(node) => {
                        if (node) cardRefs.current.set(place.id, node)
                        else cardRefs.current.delete(place.id)
                      }}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      onClick={() => selectPlace(place.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          selectPlace(place.id)
                        }
                      }}
                      onMouseEnter={() => setFocusedPlaceId(place.id)}
                      onMouseLeave={() => setFocusedPlaceId(selectedPlace?.id ?? null)}
                      className={cx(
                        'g-card flex w-[85%] shrink-0 snap-center cursor-pointer flex-col p-3.5 transition-[border-color,box-shadow] lg:w-full',
                        isSelected && 'border-[var(--ink)]! shadow-[inset_0_0_0_1px_var(--ink)]',
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="g-num mt-0.5">{place.displayIndex}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2">
                            <h3 className="g-h3 min-w-0 flex-1 truncate">{display.title}</h3>
                            {display.category !== 'Place' ? <Tag className="shrink-0">{display.category}</Tag> : null}
                          </div>
                          {ratingText || reviewCountText ? (
                            <p className="g-xs g-mut mt-1 flex items-center gap-1.5">
                              {ratingText ? (
                                <span className="inline-flex items-center gap-0.5 font-semibold text-[var(--ink)]">
                                  <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                                  {ratingText}
                                </span>
                              ) : null}
                              {reviewCountText ? (
                                <>
                                  {getMetaDot(Boolean(ratingText))}
                                  <span>{reviewCountText}</span>
                                </>
                              ) : null}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      {areaText ? <p className="g-xs g-fnt mt-2 truncate">{shortenAddress(display.address || areaText)}</p> : null}
                      <p className="g-sm g-mut mt-1.5 line-clamp-2">{display.whyThisFits}</p>

                      <div className="mt-auto flex items-center justify-between gap-2 pt-2.5">
                        <div className="flex min-w-0 items-center gap-2">
                          {openStatusChip ? <Tag tone={openStatusChip.tone === 'open' ? 'ok' : 'bad'}>{openStatusChip.label}</Tag> : null}
                          {display.openingHoursSummary ? <span className="g-xs g-fnt truncate">{display.openingHoursSummary}</span> : null}
                        </div>
                        <Button
                          variant="text"
                          size="sm"
                          className="shrink-0"
                          onClick={(event) => {
                            event.stopPropagation()
                            event.preventDefault()
                            openPlaceDetails(place.id)
                          }}
                        >
                          Details
                        </Button>
                      </div>
                    </div>
                  )
                })
              : null}
          </div>
        </aside>
      </main>

      {selectedDisplayPlace && isPlaceDetailOpen
        ? createPortal(
            <Sheet open onClose={() => setIsPlaceDetailOpen(false)} labelledBy="ask-ai-map-place-title">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 id="ask-ai-map-place-title" className="g-h2">
                    {selectedDisplayPlace.title}
                  </h2>
                  <div className="g-sm g-mut mt-1.5 flex flex-wrap items-center gap-2">
                    {selectedDisplayPlace.category !== 'Place' ? <Tag>{selectedDisplayPlace.category}</Tag> : null}
                    {selectedDisplayPlace.ratingText ? (
                      <span className="inline-flex items-center gap-0.5 font-semibold text-[var(--ink)]">
                        <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                        {selectedDisplayPlace.ratingText}
                      </span>
                    ) : null}
                    {selectedDisplayPlace.reviewCountText ? <span>{selectedDisplayPlace.reviewCountText}</span> : null}
                  </div>
                </div>
                <Button variant="soft" size="sm" iconOnly onClick={() => setIsPlaceDetailOpen(false)} aria-label="Close place details">
                  <X aria-hidden="true" />
                </Button>
              </div>

              <div className="mt-4 rounded-[var(--r-3)] rounded-tl-[var(--r-1)] bg-[var(--fill)] p-4">
                <span className="g-ai-badge">
                  <Sparkles aria-hidden="true" />
                  Why it fits
                </span>
                <p className="g-sm mt-1.5">{selectedDisplayPlace.whyThisFits}</p>
              </div>

              <div className="g-sm mt-4 flex flex-col gap-2.5">
                {selectedDisplayPlace.address !== 'Address not available' ? (
                  <p className="flex items-start gap-2">
                    <MapPin className="g-fnt mt-px h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{selectedDisplayPlace.address}</span>
                  </p>
                ) : null}
                {selectedDisplayPlace.hoursLines.length > 0 || selectedDisplayPlace.openingHoursSummary ? (
                  <div className="flex items-start gap-2">
                    <Clock className="g-fnt mt-px h-4 w-4 shrink-0" aria-hidden="true" />
                    <div>
                      {selectedDisplayPlace.hoursLines.length > 0
                        ? selectedDisplayPlace.hoursLines.map((line) => <p key={line}>{line}</p>)
                        : <p>{selectedDisplayPlace.openingHoursSummary}</p>}
                    </div>
                  </div>
                ) : null}
                {(() => {
                  const chip = getOpenStatusChip(selectedDisplayPlace)
                  return chip ? (
                    <span>
                      <Tag tone={chip.tone === 'open' ? 'ok' : 'bad'}>{chip.label}</Tag>
                    </span>
                  ) : null
                })()}
                {selectedDisplayPlace.phoneText ? (
                  <p className="flex items-start gap-2">
                    <Phone className="g-fnt mt-px h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{selectedDisplayPlace.phoneText}</span>
                  </p>
                ) : null}
                {selectedDisplayPlace.isCoordinateVerified ? (
                  <p className="flex items-center gap-2 text-[var(--ok)]">
                    <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{selectedDisplayPlace.coordinateTrustLabel || 'Verified map location'}</span>
                  </p>
                ) : null}
              </div>

              <DetailList title="Nearby" items={selectedDisplayPlace.nearbyItems} />
              <DetailList title="Parking" items={selectedDisplayPlace.parkingItems} />
              <DetailList title="Accessibility" items={selectedDisplayPlace.accessibilityItems} />

              {selectedGoogleMapsUrl ? (
                <a href={selectedGoogleMapsUrl} target="_blank" rel="noreferrer" className={cx(buttonClass({ variant: 'ink', block: true }), 'mt-5')}>
                  <MapPin aria-hidden="true" />
                  Open in Google Maps
                </a>
              ) : (
                <p className="g-sm g-fnt mt-5 text-center">Google Maps link unavailable</p>
              )}
            </Sheet>,
            document.body,
          )
        : null}
    </>
  )
}

export default AskAiMapPage
