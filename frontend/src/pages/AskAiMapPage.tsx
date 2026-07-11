import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import { memo, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Bot } from 'lucide-react'
import { AppIcon } from '../components/AppIcon'
import AskAiUsagePill from '../components/AskAiUsagePill'
import { GuestAuthPrompt } from '../components/GuestAuthPrompt'
import InternalLink from '../components/InternalLink'
import MapView from '../components/MapView'
import { MapResponsiveLayout } from '../components/layout/ResponsiveLayouts'
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
import { readCachedAskAiUsage, subscribeToCachedAskAiUsage, writeCachedAskAiUsage } from '../utils/askAiUsageCache'
import { registerAskAiTask, completeAskAiTask, failAskAiTask } from '../utils/askAiTaskStore'
import { lockBodyScroll, unlockBodyScroll } from '../utils/bodyScrollLock'
import { getApiUrl } from '../utils/apiClient'
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
          <p className="mt-1 text-[12px] font-medium text-slate-500">Searching verified places for your prompt.</p>
          {query ? <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-700">“{query.trim()}”</p> : null}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-2/3 rounded-full bg-[linear-gradient(90deg,#8bb8ff,#245dce)] motion-safe:animate-[gala-loading-slide_1.6s_ease-in-out_infinite]" />
          </div>
        </div>
      </div>
    </div>
  )
}

function MapPinNotice({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex w-full items-start gap-2 rounded-[18px] border border-slate-200 bg-white px-3 py-2 text-[11px] leading-5 text-slate-500 shadow-[0_8px_20px_rgba(15,23,42,0.06)] sm:text-[12px]">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <p className="min-w-0 flex-1">
        Some results do not have a map pin yet to keep this on free services. Open place details for the Google Maps link.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        aria-label="Dismiss map pin notice"
      >
        <AppIcon name="clear" className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

const AskAiMapComposer = memo(function AskAiMapComposer({
  query,
  selectedChipIds,
  isSearching,
  onSubmit,
  onCancel,
}: {
  query: string
  selectedChipIds: AskAiMapChipId[]
  isSearching: boolean
  onSubmit: (queryOverride?: string) => void
  onCancel: () => void
}) {
  const [draftQuery, setDraftQuery] = useState(query)
  const queryInputRef = useRef<HTMLTextAreaElement | null>(null)
  const canSubmit = buildMapRequestQuery(draftQuery, selectedChipIds).trim().length > 0

  useLayoutEffect(() => {
    const element = queryInputRef.current
    if (!element) {
      return
    }

    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 120)}px`
  }, [draftQuery])

  const handleSubmit = () => {
    const finalQuery = draftQuery.trim()
    if (!finalQuery) {
      return
    }

    onSubmit(finalQuery)
  }

  return (
    <div className="flex flex-row items-end gap-2 rounded-[22px] border border-white/86 bg-white px-3 py-2.5 shadow-[0_10px_24px_rgba(15,23,42,0.08)] sm:gap-3 lg:mx-auto lg:max-w-[680px]">
      <textarea
        ref={queryInputRef}
        value={draftQuery}
        onChange={(event) => setDraftQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            event.stopPropagation()
            if (isSearching) {
              onCancel()
            } else {
              handleSubmit()
            }
          }
        }}
        placeholder="Discover places in an interactive map..."
        rows={1}
        className="min-h-[48px] w-full min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-0.5 pb-2 pt-3 text-[14px] font-medium leading-relaxed text-slate-900 outline-none placeholder:whitespace-nowrap placeholder:overflow-hidden placeholder:text-ellipsis placeholder:font-medium placeholder:text-slate-400 sm:min-h-0 sm:text-base"
      />
      <button
        type="button"
        onClick={() => {
          if (isSearching) {
            onCancel()
          } else {
            handleSubmit()
          }
        }}
        disabled={!isSearching && !canSubmit}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent-deep)] text-white shadow-[0_10px_20px_rgba(23,45,107,0.18)] transition hover:bg-[var(--accent)] disabled:opacity-60"
        aria-label={isSearching ? 'Stop searching' : 'Submit ask ai map search'}
      >
        {isSearching ? (
          <svg className="h-[17px] w-[17px]" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="11" fill="#172A5A" />
            <rect x="5.25" y="5.25" width="13.5" height="13.5" rx="2.5" fill="white" />
          </svg>
        ) : (
          <AppIcon name="askAi" className="h-5 w-5" />
        )}
      </button>
    </div>
  )
})

function AskAiMapPage() {
  const initialAskAiMapRuntimeStateRef = useRef(
    hasActiveAskAiMapRuntimeState() ? getAskAiMapRuntimeState() : null
  )
  const initialAskAiMapRouteCacheRef = useRef<AskAiMapRouteCache | null>(readAskAiMapRouteCache())
  const mobileCardRefs = useRef(new Map<string, HTMLDivElement>())
  const desktopCardRefs = useRef(new Map<string, HTMLDivElement>())
  const mobileCardScrollerRef = useRef<HTMLDivElement | null>(null)
  const desktopCardScrollerRef = useRef<HTMLDivElement | null>(null)
  const initialAskAiMapRuntimeState = initialAskAiMapRuntimeStateRef.current
  const initialAskAiMapRouteCache = initialAskAiMapRouteCacheRef.current
  const initialAskAiMapState = initialAskAiMapRuntimeState ?? initialAskAiMapRouteCache
  const { session, isSessionLoading } = useSavedFavorites()
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
  const [errorMessage, setErrorMessage] = useState(initialAskAiMapState?.errorMessage ?? '')
  const [statusMessage, setStatusMessage] = useState(initialAskAiMapState?.statusMessage ?? '')
  const [answerText, setAnswerText] = useState(initialAskAiMapState?.answerText ?? '')
  const [places, setPlaces] = useState<AskAiMapPlace[]>(initialAskAiMapState?.places ?? [])
  const [sources, setSources] = useState<AskAiMapSource[]>(initialAskAiMapState?.sources ?? [])
  const [askAiMapsUsageStatus, setAskAiMapsUsageStatus] = useState<AskAiUsageStatus | null>(
    readCachedAskAiUsage('askAiMaps')
  )
  const submitInFlightRef = useRef(false)
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(initialAskAiMapState?.selectedPlaceId ?? null)
  const [focusedPlaceId, setFocusedPlaceId] = useState<string | null>(initialAskAiMapState?.focusedPlaceId ?? null)
  const [selectedPlaceFocusSignal, setSelectedPlaceFocusSignal] = useState(0)
  const [isPlaceDetailOpen, setIsPlaceDetailOpen] = useState(false)
  const [isMapPinNoticeDismissed, setIsMapPinNoticeDismissed] = useState(false)

  async function refreshAskAiMapsUsage(accessToken: string, signal?: AbortSignal) {
    const usageEndpoint = getApiUrl('/ask-ai/usage/check?type=ask_ai_maps')

    const response = await fetch(usageEndpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
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

    writeCachedAskAiUsage('askAiMaps', usageStatus)
    setAskAiMapsUsageStatus(usageStatus)
    return usageStatus
  }

  useEffect(() => {
    writeCachedAskAiUsage('askAiMaps', askAiMapsUsageStatus)
  }, [askAiMapsUsageStatus])

  useEffect(() => {
    return subscribeToCachedAskAiUsage('askAiMaps', (usageStatus) => {
      setAskAiMapsUsageStatus((currentUsageStatus) => {
        if (
          currentUsageStatus?.usageType === usageStatus?.usageType &&
          currentUsageStatus?.allowed === usageStatus?.allowed &&
          currentUsageStatus?.limit === usageStatus?.limit &&
          currentUsageStatus?.used === usageStatus?.used &&
          currentUsageStatus?.remaining === usageStatus?.remaining &&
          currentUsageStatus?.resetAt === usageStatus?.resetAt &&
          currentUsageStatus?.message === usageStatus?.message
        ) {
          return currentUsageStatus
        }

        return usageStatus
      })
    })
  }, [])

  useEffect(() => {
    if (!session?.access_token) {
      return
    }

    const controller = new AbortController()

    const loadAskAiUsage = async () => {
      try {
        const usageStatus = await refreshAskAiMapsUsage(session.access_token, controller.signal)

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
    if (!selectedPlaceId) {
      return
    }

    const cardTargets = [
      {
        card: mobileCardRefs.current.get(selectedPlaceId) ?? null,
        container: mobileCardScrollerRef.current,
      },
      {
        card: desktopCardRefs.current.get(selectedPlaceId) ?? null,
        container: desktopCardScrollerRef.current,
      },
    ]
    const visibleTarget = cardTargets.find(({ card }) => card && card.getClientRects().length > 0)
    const selectedCard = visibleTarget?.card ?? cardTargets[0]?.card ?? cardTargets[1]?.card ?? null

    if (!selectedCard) {
      return
    }

    const selectedContainer = visibleTarget?.container

    if (selectedContainer && selectedContainer.getClientRects().length > 0) {
      const containerRect = selectedContainer.getBoundingClientRect()
      const cardRect = selectedCard.getBoundingClientRect()
      const targetLeft =
        selectedContainer.scrollLeft +
        (cardRect.left - containerRect.left) -
        ((selectedContainer.clientWidth - cardRect.width) / 2)
      const targetTop =
        selectedContainer.scrollTop +
        (cardRect.top - containerRect.top) -
        ((selectedContainer.clientHeight - cardRect.height) / 2)

      selectedContainer.scrollTo({
        left: Math.max(0, targetLeft),
        top: Math.max(0, targetTop),
        behavior: 'smooth',
      })
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

    if (!session?.access_token || !effectiveCanSubmit || submitInFlightRef.current) {
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
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          'Cache-Control': 'no-store',
          Pragma: 'no-cache',
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
      if (session?.access_token) {
        try {
          await refreshAskAiMapsUsage(session.access_token)
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

  if (isSessionLoading) {
    return <div className="gala-page-background min-h-screen" aria-hidden="true" />
  }

  if (!session) {
    return <GuestAuthPrompt variant="ask-ai" mode="page-state" />
  }

  return (
    <>
    <main className="gala-page-background h-[100dvh] overflow-hidden overscroll-none text-[var(--text)] md:hidden lg:hidden">
      <div className="h-full w-full">
        <section className="relative h-full overflow-hidden bg-transparent p-0">
          <div className="relative h-full">
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
              mapClassName="ask-ai-map-view"
              layoutKey={mapLayoutKey}
              onPlaceSelect={selectPlace}
            />

            <div className="absolute right-4 top-5 z-[620]">
              <InternalLink
                href="/ask-ai"
                aria-label="Back to Ask AI overview"
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-sky-100 text-sky-700 ring-1 ring-inset ring-sky-200/70 shadow-[0_6px_18px_-8px_rgba(14,165,233,0.45)] transition hover:bg-sky-200/80 hover:text-sky-800"
              >
                <Bot className="h-6 w-6" strokeWidth={2} />
              </InternalLink>
            </div>

            <div className="absolute left-4 top-5 z-[620]">
              <AskAiUsagePill label="Maps AI" usageStatus={askAiMapsUsageStatus} />
            </div>

            {isSearching ? null : null}

            {shouldShowPermissionPrompt ? (
              <div className="absolute inset-0 z-[700] flex items-center justify-center bg-[#08162f]/12 p-4">
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

            <section className="absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+3.5rem)] z-[640] overflow-hidden sm:inset-x-4 sm:bottom-14 lg:inset-x-6 lg:bottom-16">
                {errorMessage && !isSearching ? (
                  <div className="mb-3 rounded-[22px] border border-rose-100 bg-white px-4 py-3 text-sm font-medium text-rose-700 shadow-[0_12px_30px_rgba(15,23,42,0.10)] lg:mx-auto lg:max-w-[680px]">
                    {errorMessage}
                  </div>
                ) : null}

                {!errorMessage && statusMessage && !isSearching ? (
                  <div className="mb-3 rounded-[22px] border border-sky-100 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.10)] lg:mx-auto lg:max-w-[680px]">
                    {statusMessage}
                  </div>
                ) : null}

                {sources.length > 0 && !isSearching ? (
                  <div className="mb-3 hidden rounded-[20px] bg-white px-4 py-2.5 text-[12px] font-medium text-slate-500 shadow-[0_8px_20px_rgba(15,23,42,0.06)] sm:block lg:mx-auto lg:max-w-[680px]">
                    {sources.length} verified source{sources.length === 1 ? '' : 's'}
                  </div>
                ) : null}

                {shouldShowMapPinNotice ? (
                  <div className="mb-3 flex justify-center lg:mx-auto lg:max-w-[680px]">
                    <MapPinNotice onDismiss={() => setIsMapPinNoticeDismissed(true)} />
                  </div>
                ) : null}

                <div
                  ref={mobileCardScrollerRef}
                  className="flex w-full snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden pb-4 pl-1 pr-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden lg:justify-center"
                >
                  {isSearching ? <MinimalLoadingCard query={query} /> : null}

                  {!isSearching ? normalizedPlaces.map((place, index) => {
                    const display = displayPlaces[index]
                    if (!display) return null
                    const isSelected = place.id === selectedPlaceId
                    const areaText = getShortAreaText(display)
                    const openStatusChip = getOpenStatusChip(display)
                    const hoursSummary = display.openingHoursSummary || ''
                    const ratingText = display.ratingText || (typeof place.rating === 'number' ? place.rating.toFixed(1) : '')
                    const reviewCountText = display.reviewCountText || formatReviewCount(place.reviewCount)
                    const previewText = display.whyThisFits.length > 110
                      ? `${display.whyThisFits.slice(0, 107).trimEnd()}...`
                      : display.whyThisFits

                    return (
                      <div
                        key={place.id}
                        ref={(node) => {
                          if (node) mobileCardRefs.current.set(place.id, node)
                          else mobileCardRefs.current.delete(place.id)
                        }}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          selectPlace(place.id)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            selectPlace(place.id)
                          }
                        }}
                        className={`relative w-[82vw] max-w-[340px] sm:max-w-[360px] lg:max-w-[400px] min-h-[168px] snap-center shrink-0 rounded-[24px] border bg-white px-4 py-3.5 cursor-pointer transition-all duration-200 ${
                          isSelected
                            ? 'scale-[1.01] border-transparent shadow-[0_22px_52px_rgba(15,23,42,0.22)]'
                            : 'border-slate-100/90 shadow-[0_14px_38px_rgba(15,23,42,0.10)] hover:border-slate-200 hover:shadow-[0_18px_42px_rgba(15,23,42,0.14)]'
                        }`}
                        onMouseEnter={() => setFocusedPlaceId(place.id)}
                        onMouseLeave={() => setFocusedPlaceId(selectedPlace?.id ?? null)}
                      >
                        <div className="flex h-full flex-col">
                          <div className="flex items-start gap-2.5">
                            <div className="flex shrink-0 items-center gap-2 pt-0.5">
                              <span className={`h-2.5 w-2.5 rounded-full transition ${
                                isSelected ? 'bg-[var(--accent-deep)] shadow-[0_0_0_5px_rgba(37,99,235,0.12)]' : 'bg-slate-200'
                              }`} />
                              <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-2xl px-2 text-[11px] font-black ${
                                isSelected
                                  ? 'bg-[#172A5A] text-white shadow-[0_8px_16px_rgba(23,42,90,0.24)]'
                                  : 'bg-slate-100 text-[#172A5A]'
                              }`}>
                                {place.displayIndex}
                              </span>
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-start gap-2">
                                <h3 className="min-w-0 flex-1 text-[15px] font-extrabold leading-[1.2] tracking-[-0.02em] text-slate-950 line-clamp-2">
                                  {display.title}
                                </h3>
                                <div className="flex shrink-0 flex-col items-end gap-1">
                                  {display.category !== 'Place' ? (
                                    <span className="shrink-0 self-start rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-semibold text-slate-500">
                                      {display.category}
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] font-medium text-slate-500">
                                {ratingText ? (
                                  <span className="inline-flex items-center gap-0.5 font-semibold text-slate-700">
                                    <span className="text-[13px] leading-none text-amber-500">{'\u2605'}</span>
                                    <span>{ratingText}</span>
                                  </span>
                                ) : null}
                                {reviewCountText ? (
                                  <>
                                    {getMetaDot(Boolean(ratingText))}
                                    <span>{reviewCountText}</span>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          {areaText ? (
                            <div className="mt-2 flex items-start gap-1.5 text-[12px] text-slate-400">
                              <AppIcon name="place" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-350" />
                              <span className="line-clamp-1 font-medium">{shortenAddress(display.address || areaText)}</span>
                            </div>
                          ) : null}

                          <p className="mt-2 line-clamp-2 text-[12px] leading-[1.5] text-slate-500">
                            {previewText}
                          </p>

                          <div className="mt-auto flex items-center justify-between gap-3 pt-2.5">
                            <div className="min-w-0 flex items-center gap-2">
                              {openStatusChip ? (
                                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${openStatusChip.className}`}>
                                  <span className={`text-[7px] ${openStatusChip.dotClassName}`}>{'\u25CF'}</span>
                                  {openStatusChip.label}
                                </span>
                              ) : null}
                              {hoursSummary ? (
                                <span className="line-clamp-1 text-[11px] font-medium text-slate-400">{hoursSummary}</span>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  event.preventDefault()
                                  openPlaceDetails(place.id)
                                }}
                                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--accent)]/16 bg-[var(--accent-wash)] px-3 py-1.5 text-[11px] font-semibold text-[var(--accent-deep)] transition hover:bg-[var(--accent)]/15 active:scale-95"
                              >
                                <span>View details</span>
                                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M5 12h14M12 5l7 7-7 7" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  }) : null}
                </div>

                <AskAiMapComposer
                  key={query}
                  query={query}
                  selectedChipIds={selectedChipIds}
                  isSearching={isSearching}
                  onSubmit={(queryOverride) => {
                    void handleEnterSearch(queryOverride)
                  }}
                  onCancel={() => {
                    setIsSearching(false)
                    cancelAskAiMapRequest()
                  }}
                />
              </section>
          </div>
        </section>
      </div>
    </main>
    <main className="fixed inset-0 hidden overflow-hidden overscroll-none bg-white text-[var(--text)] md:block">
      <MapResponsiveLayout
        sidebarVisible={showDesktopResultsSidebar}
        className="h-full w-full gap-0 px-0 py-0"
      >
        <section className="relative h-full min-w-0 w-full overflow-hidden bg-transparent">
          <div className="relative h-full w-full">
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
              mapClassName="ask-ai-map-view"
              layoutKey={mapLayoutKey}
              onPlaceSelect={selectPlace}
            />

            <div className="absolute right-4 top-5 z-[620]">
              <InternalLink
                href="/ask-ai"
                aria-label="Back to Ask AI overview"
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-sky-100 text-sky-700 ring-1 ring-inset ring-sky-200/70 shadow-[0_6px_18px_-8px_rgba(14,165,233,0.45)] transition hover:bg-sky-200/80 hover:text-sky-800"
              >
                <Bot className="h-6 w-6" strokeWidth={2} />
              </InternalLink>
            </div>

            <div className="absolute left-4 top-5 z-[620]">
              <AskAiUsagePill label="Maps AI" usageStatus={askAiMapsUsageStatus} />
            </div>

            <div className="absolute inset-x-0 bottom-0 z-[620] px-4 pb-2 pt-6">
              <div className="mx-auto w-full max-w-[680px]">
                <AskAiMapComposer
                  key={`${query}:desktop`}
                  query={query}
                  selectedChipIds={selectedChipIds}
                  isSearching={isSearching}
                  onSubmit={(queryOverride) => {
                    void handleEnterSearch(queryOverride)
                  }}
                  onCancel={() => {
                    setIsSearching(false)
                    cancelAskAiMapRequest()
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        {showDesktopResultsSidebar ? (
          <aside className="flex h-full min-h-0 flex-col overflow-hidden border-l border-[var(--line)] bg-white">
            <div className="shrink-0 border-b border-[var(--line)] px-4 py-4 md:px-3 md:py-3 lg:px-4 lg:py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">Ask AI Maps</p>
                  <h1 className="mt-1 truncate text-[20px] font-black tracking-[-0.03em] text-slate-950 md:text-[18px] lg:text-[22px]">
                    {query.trim() || 'Map results'}
                  </h1>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <AskAiUsagePill label="Maps AI" usageStatus={askAiMapsUsageStatus} />
                  <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-600">
                    {normalizedPlaces.length} places
                  </span>
                </div>
              </div>
              {statusMessage ? <p className="mt-2 text-sm font-medium text-slate-600">{statusMessage}</p> : null}
              {errorMessage ? <p className="mt-2 text-sm font-medium text-rose-600">{errorMessage}</p> : null}
              {shouldShowMapPinNotice ? (
                <div className="mt-3">
                  <MapPinNotice onDismiss={() => setIsMapPinNoticeDismissed(true)} />
                </div>
              ) : null}
            </div>

            <div
              ref={desktopCardScrollerRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-3 md:py-3 lg:px-4 lg:py-4"
            >
              <div className="grid gap-3 md:gap-2 lg:gap-3">
                {isSearching ? <MinimalLoadingCard query={query} /> : null}

                {!isSearching ? normalizedPlaces.map((place, index) => {
                  const display = displayPlaces[index]
                  if (!display) return null
                  const isSelected = place.id === selectedPlaceId
                  const areaText = getShortAreaText(display)
                  const openStatusChip = getOpenStatusChip(display)
                  const hoursSummary = display.openingHoursSummary || ''
                  const ratingText = display.ratingText || (typeof place.rating === 'number' ? place.rating.toFixed(1) : '')
                  const reviewCountText = display.reviewCountText || formatReviewCount(place.reviewCount)
                  const previewText = display.whyThisFits.length > 110
                    ? `${display.whyThisFits.slice(0, 107).trimEnd()}...`
                    : display.whyThisFits

                  return (
                    <div
                      key={place.id}
                      ref={(node) => {
                        if (node) desktopCardRefs.current.set(place.id, node)
                        else desktopCardRefs.current.delete(place.id)
                      }}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        selectPlace(place.id)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          selectPlace(place.id)
                        }
                      }}
                      className={`relative min-h-[160px] w-full snap-center rounded-[24px] border bg-white px-4 py-3.5 text-left cursor-pointer transition-all duration-200 ${
                        isSelected
                          ? 'scale-[1.01] border-transparent shadow-[0_22px_52px_rgba(15,23,42,0.22)]'
                          : 'border-slate-100/90 shadow-[0_14px_38px_rgba(15,23,42,0.10)] hover:border-slate-200 hover:shadow-[0_18px_42px_rgba(15,23,42,0.14)]'
                      }`}
                      onMouseEnter={() => setFocusedPlaceId(place.id)}
                      onMouseLeave={() => setFocusedPlaceId(selectedPlace?.id ?? null)}
                    >
                      <div className="flex h-full flex-col">
                        <div className="flex items-start gap-2.5">
                          <div className="flex shrink-0 items-center gap-2 pt-0.5">
                            <span className={`h-2.5 w-2.5 rounded-full transition ${
                              isSelected ? 'bg-[var(--accent-deep)] shadow-[0_0_0_5px_rgba(37,99,235,0.12)]' : 'bg-slate-200'
                            }`} />
                            <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-2xl px-2 text-[11px] font-black ${
                              isSelected
                                ? 'bg-[#172A5A] text-white shadow-[0_8px_16px_rgba(23,42,90,0.24)]'
                                : 'bg-slate-100 text-[#172A5A]'
                            }`}>
                              {place.displayIndex}
                            </span>
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start gap-2">
                              <h3 className="min-w-0 flex-1 text-[15px] font-extrabold leading-[1.2] tracking-[-0.02em] text-slate-950 line-clamp-2">
                                {display.title}
                              </h3>
                              <div className="flex shrink-0 flex-col items-end gap-1">
                                {display.category !== 'Place' ? (
                                  <span className="shrink-0 self-start rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-semibold text-slate-500">
                                    {display.category}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] font-medium text-slate-500">
                              {ratingText ? (
                                <span className="inline-flex items-center gap-0.5 font-semibold text-slate-700">
                                  <span className="text-[13px] leading-none text-amber-500">{'\u2605'}</span>
                                  <span>{ratingText}</span>
                                </span>
                              ) : null}
                              {reviewCountText ? (
                                <>
                                  {getMetaDot(Boolean(ratingText))}
                                  <span>{reviewCountText}</span>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        {areaText ? (
                          <div className="mt-2 flex items-start gap-1.5 text-[12px] text-slate-400">
                            <AppIcon name="place" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-350" />
                            <span className="line-clamp-1 font-medium">{shortenAddress(display.address || areaText)}</span>
                          </div>
                        ) : null}

                        <p className="mt-2 line-clamp-2 text-[12px] leading-[1.5] text-slate-500">
                          {previewText}
                        </p>

                        <div className="mt-auto flex items-center justify-between gap-3 pt-2.5">
                          <div className="min-w-0 flex items-center gap-2">
                            {openStatusChip ? (
                              <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${openStatusChip.className}`}>
                                <span className={`text-[7px] ${openStatusChip.dotClassName}`}>{'\u25CF'}</span>
                                {openStatusChip.label}
                              </span>
                            ) : null}
                            {hoursSummary ? (
                              <span className="line-clamp-1 text-[11px] font-medium text-slate-400">{hoursSummary}</span>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              event.preventDefault()
                              openPlaceDetails(place.id)
                            }}
                            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--accent)]/16 bg-[var(--accent-wash)] px-3 py-1.5 text-[11px] font-semibold text-[var(--accent-deep)] transition hover:bg-[var(--accent)]/15 active:scale-95"
                          >
                            <span>View details</span>
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                }) : null}
              </div>

            </div>
          </aside>
        ) : null}
      </MapResponsiveLayout>
    </main>
    {selectedDisplayPlace && isPlaceDetailOpen ? createPortal(
      <div className="fixed inset-0 z-[7000]">
        <button
          type="button"
          aria-label="Close place details"
          className="absolute inset-0 bg-[#08162f]/42 backdrop-blur-[4px]"
          onClick={() => setIsPlaceDetailOpen(false)}
        />
        <div className="absolute inset-x-0 bottom-0 flex items-end md:inset-0 md:items-center md:justify-center md:p-3 lg:inset-0 lg:items-center lg:justify-center lg:p-4">
        <section
          className="flex w-full max-h-[82dvh] flex-col overflow-hidden rounded-t-[28px] bg-white shadow-[0_-18px_48px_rgba(15,23,42,0.22)] md:max-w-[520px] md:max-h-[88dvh] md:rounded-[28px] md:shadow-[0_26px_60px_rgba(15,23,42,0.24)] lg:max-w-[580px] lg:max-h-[88dvh] lg:rounded-[28px] lg:shadow-[0_26px_60px_rgba(15,23,42,0.24)]"
          aria-modal="true"
          role="dialog"
          aria-label={`${selectedDisplayPlace.title} details`}
        >
          <div className="flex justify-center px-4 pt-3">
            <span className="h-1.5 w-14 rounded-full bg-slate-200" />
          </div>

          <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-3 pt-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-[22px] font-black tracking-[-0.03em] text-slate-950">
                {selectedDisplayPlace.title}
              </h2>

              {selectedDisplayPlace.category !== 'Place' ? (
                <span className="mt-2 inline-block rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">
                  {selectedDisplayPlace.category}
                </span>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                {selectedDisplayPlace.ratingText ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                    <span className="text-amber-500">{'\u2605'}</span>
                    <span>{selectedDisplayPlace.ratingText}</span>
                  </span>
                ) : null}
                {selectedDisplayPlace.reviewCountText ? (
                  <>
                    {getMetaDot(Boolean(selectedDisplayPlace.ratingText))}
                    <span className="font-medium text-slate-500">{selectedDisplayPlace.reviewCountText}</span>
                  </>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsPlaceDetailOpen(false)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:border-slate-300 hover:text-slate-600"
              aria-label="Close place details"
            >
              <AppIcon name="clear" className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-[calc(24px+env(safe-area-inset-bottom,0px))] [-webkit-overflow-scrolling:touch]">
            <div className="rounded-[20px] border border-[rgba(23,42,90,0.10)] bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(255,255,255,0.94))] px-4 py-4">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#172A5A]">Why this fits</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {selectedDisplayPlace.whyThisFits}
              </p>
            </div>

            {(selectedDisplayPlace.address !== 'Address not available' ||
              selectedDisplayPlace.hoursLines.length > 0 ||
              selectedDisplayPlace.phoneText ||
              selectedDisplayPlace.isCoordinateVerified) ? (
              <div className="mt-3 rounded-[20px] bg-slate-50 px-4 py-4">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Info</p>

                {selectedDisplayPlace.address !== 'Address not available' ? (
                  <div className="mt-2.5 flex items-start gap-2 text-sm text-slate-700">
                    <AppIcon name="place" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <span className="leading-6">{selectedDisplayPlace.address}</span>
                  </div>
                ) : null}

                {selectedDisplayPlace.hoursLines.length > 0 ? (
                  <div className="mt-2.5 flex items-start gap-2 text-sm text-slate-700">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <div>
                      {selectedDisplayPlace.hoursLines.map((line) => (
                        <p key={line} className="leading-6">{line}</p>
                      ))}
                    </div>
                  </div>
                ) : selectedDisplayPlace.openingHoursSummary ? (
                  <div className="mt-2.5 flex items-start gap-2 text-sm text-slate-700">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span className="leading-6">{selectedDisplayPlace.openingHoursSummary}</span>
                  </div>
                ) : null}

                {(() => {
                  const chip = getOpenStatusChip(selectedDisplayPlace)
                  if (!chip) return null
                  return (
                    <div className="mt-2.5 flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${chip.className}`}>
                        <span className={`text-[8px] ${chip.dotClassName}`}>{'\u25CF'}</span>
                        {chip.label}
                      </span>
                    </div>
                  )
                })()}

                {selectedDisplayPlace.phoneText ? (
                  <div className="mt-2.5 flex items-start gap-2 text-sm text-slate-700">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                    <span className="leading-6">{selectedDisplayPlace.phoneText}</span>
                  </div>
                ) : null}

                {selectedDisplayPlace.isCoordinateVerified ? (
                  <div className="mt-2.5 flex items-center gap-2">
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                      <svg className="h-3 w-3 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                    <span className="text-[13px] font-semibold text-emerald-700">{selectedDisplayPlace.coordinateTrustLabel || 'Verified map location'}</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {selectedDisplayPlace.nearbyItems.length > 0 ? (
              <div className="mt-3 rounded-[20px] bg-slate-50 px-4 py-4">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Nearby</p>
                <ul className="mt-2 space-y-1.5">
                  {selectedDisplayPlace.nearbyItems.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-[13px] leading-6 text-slate-700">
                      <span className="h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {selectedDisplayPlace.parkingItems.length > 0 ? (
              <div className="mt-3 rounded-[20px] bg-slate-50 px-4 py-4">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Parking</p>
                <ul className="mt-2 space-y-1.5">
                  {selectedDisplayPlace.parkingItems.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-[13px] leading-6 text-slate-700">
                      <span className="h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {selectedDisplayPlace.accessibilityItems.length > 0 ? (
              <div className="mt-3 rounded-[20px] bg-slate-50 px-4 py-4">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Accessibility</p>
                <ul className="mt-2 space-y-1.5">
                  {selectedDisplayPlace.accessibilityItems.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-[13px] leading-6 text-slate-700">
                      <span className="h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {selectedGoogleMapsUrl ? (
              <a
                href={selectedGoogleMapsUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#172A5A] px-4 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(23,42,90,0.22)] transition hover:bg-[#0F2147] active:scale-[0.98]"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span>Open in Google Maps</span>
              </a>
            ) : (
              <div className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-400">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span>Google Maps link unavailable</span>
              </div>
            )}
          </div>
        </section>
        </div>
      </div>,
      document.body
    ) : null}
    </>
  )
}

export default AskAiMapPage

