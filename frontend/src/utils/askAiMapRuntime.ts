import { getApiUrl } from './apiClient'

export type AskAiMapOptionalDetails = {
  categoryText?: string
  ratingText?: string
  reviewCountText?: string
  openStatusText?: string
  addressText?: string
  hoursText?: string
}

export type AskAiMapPlace = {
  id: string
  name: string
  /** In-app page when the place is also listed on GalaTayo. */
  galatayoPath?: string
  rating?: number
  reviewCount?: number
  category?: string
  openStatus?: string
  address?: string
  distanceKm?: number | null
  openingHoursSummary?: string | null
  lat?: number | null
  lng?: number | null
  latitude?: number | null
  longitude?: number | null
  hasPin?: boolean
  coordinateConfidence?: 'high' | 'medium' | 'low' | 'none'
  coordinateSource?: string
  locationText?: string
  queryReason?: string
  reason: string
  whyThisFits?: string
  aiPreview?: string
  subtitle?: string
  description?: string
  summary?: string
  googleMapsUrl?: string
  googleMapsUri?: string
  placeId?: string
  cid?: string
  reviewSnippets?: string[]
  sourceTitle?: string
  sourceUri?: string
  coordinates?: {
    lat: number
    lng: number
    latitude: number
    longitude: number
    source?: 'geoapify' | 'gemini_fallback' | 'maps_grounding' | 'places_metadata' | 'geocoded' | 'gemini_grounding_location_text'
    trusted?: true
    verified?: true
    confidence?: 'high' | 'medium'
  } | null
  coordinateStatus?: 'geoapify_coordinate_fill' | 'gemini_coordinate_fallback' | 'missing_coordinates'
  optionalDetails?: AskAiMapOptionalDetails
}

export type AskAiMapSource = {
  title?: string
  uri?: string
  placeId?: string
}

export type AskAiMapRuntimeState = {
  query: string
  selectedChipIds: string[]
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

type AskAiMapRuntimeListener = (state: AskAiMapRuntimeState) => void

const emptyAskAiMapRuntimeState: AskAiMapRuntimeState = {
  query: '',
  selectedChipIds: [],
  userLocation: null,
  isSearching: false,
  errorMessage: '',
  statusMessage: '',
  answerText: '',
  places: [],
  sources: [],
  selectedPlaceId: null,
  focusedPlaceId: null,
}

let askAiMapRuntimeState: AskAiMapRuntimeState = emptyAskAiMapRuntimeState
let askAiMapAbortController: AbortController | null = null
let askAiMapTimeoutId: number | null = null
let askAiMapRequestCancelled = false
let askAiMapRequestVersion = 0
let latestAskAiMapRequestId = ''
const listeners = new Set<AskAiMapRuntimeListener>()

function emitAskAiMapRuntimeState() {
  for (const listener of listeners) {
    listener(askAiMapRuntimeState)
  }
}

function hasMeaningfulAskAiMapRuntimeState(state: AskAiMapRuntimeState) {
  return Boolean(
    state.query ||
    state.selectedChipIds.length ||
    state.userLocation ||
    state.isSearching ||
    state.errorMessage ||
    state.statusMessage ||
    state.answerText ||
    state.places.length ||
    state.sources.length ||
    state.selectedPlaceId ||
    state.focusedPlaceId
  )
}

export function getAskAiMapRuntimeState() {
  return askAiMapRuntimeState
}

export function hasActiveAskAiMapRuntimeState() {
  return hasMeaningfulAskAiMapRuntimeState(askAiMapRuntimeState)
}

export function setAskAiMapRuntimeState(nextState: AskAiMapRuntimeState) {
  askAiMapRuntimeState = nextState
  emitAskAiMapRuntimeState()
}

export function patchAskAiMapRuntimeState(partialState: Partial<AskAiMapRuntimeState>) {
  setAskAiMapRuntimeState({
    ...askAiMapRuntimeState,
    ...partialState,
  })
}

export function subscribeToAskAiMapRuntime(listener: AskAiMapRuntimeListener) {
  listeners.add(listener)
  listener(askAiMapRuntimeState)
  return () => {
    listeners.delete(listener)
  }
}

export function seedAskAiMapRuntimeState(state: Partial<AskAiMapRuntimeState>) {
  if (hasMeaningfulAskAiMapRuntimeState(askAiMapRuntimeState)) {
    return
  }

  setAskAiMapRuntimeState({
    query: typeof state.query === 'string' ? state.query : '',
    selectedChipIds: Array.isArray(state.selectedChipIds)
      ? state.selectedChipIds.filter((chipId): chipId is string => typeof chipId === 'string')
      : [],
    userLocation:
      state.userLocation &&
      typeof state.userLocation === 'object' &&
      typeof state.userLocation.latitude === 'number' &&
      typeof state.userLocation.longitude === 'number'
        ? state.userLocation
        : null,
    isSearching: state.isSearching === true,
    errorMessage: typeof state.errorMessage === 'string' ? state.errorMessage : '',
    statusMessage: typeof state.statusMessage === 'string' ? state.statusMessage : '',
    answerText: typeof state.answerText === 'string' ? state.answerText : '',
    places: Array.isArray(state.places) ? state.places : [],
    sources: Array.isArray(state.sources) ? state.sources : [],
    selectedPlaceId: typeof state.selectedPlaceId === 'string' ? state.selectedPlaceId : null,
    focusedPlaceId: typeof state.focusedPlaceId === 'string' ? state.focusedPlaceId : null,
  })
}

export function setAskAiMapAbortController(controller: AbortController, timeoutId: number) {
  askAiMapRequestCancelled = false
  askAiMapAbortController = controller
  askAiMapTimeoutId = timeoutId
}

export function clearAskAiMapAbortController() {
  askAiMapAbortController = null
  askAiMapTimeoutId = null
}

export function wasAskAiMapRequestCancelled() {
  return askAiMapRequestCancelled
}

export function getLatestAskAiMapRequestId() {
  return latestAskAiMapRequestId
}

function notifyAskAiMapRequestCancelled(requestId: string) {
  if (!requestId) return

  void fetch(getApiUrl('/ask-ai/cancel'), {
    method: 'POST',
    cache: 'no-store',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      'x-request-id': requestId,
    },
    body: JSON.stringify({ requestId, usageType: 'ask_ai_maps' }),
  }).catch(() => undefined)
}

export function incrementAskAiMapRequestVersion() {
  askAiMapRequestVersion += 1
  latestAskAiMapRequestId = `${Date.now()}-${askAiMapRequestVersion}`
  return { version: askAiMapRequestVersion, requestId: latestAskAiMapRequestId }
}

export function getAskAiMapRequestVersion() {
  return askAiMapRequestVersion
}

export function cancelAskAiMapRequest() {
  askAiMapRequestCancelled = true
  notifyAskAiMapRequestCancelled(latestAskAiMapRequestId)
  askAiMapAbortController?.abort()
  askAiMapAbortController = null
  if (askAiMapTimeoutId !== null) {
    window.clearTimeout(askAiMapTimeoutId)
    askAiMapTimeoutId = null
  }
  askAiMapRequestVersion += 1
  setAskAiMapRuntimeState({
    ...askAiMapRuntimeState,
    isSearching: false,
  })
}

export function resetAskAiMapRuntimeState() {
  notifyAskAiMapRequestCancelled(latestAskAiMapRequestId)
  askAiMapAbortController?.abort()
  askAiMapAbortController = null
  if (askAiMapTimeoutId !== null) {
    window.clearTimeout(askAiMapTimeoutId)
    askAiMapTimeoutId = null
  }
  askAiMapRequestVersion += 1
  setAskAiMapRuntimeState(emptyAskAiMapRuntimeState)
}
