export type AskAiMapOptionalDetails = {
  categoryText?: string
  ratingText?: string
  openStatusText?: string
  addressText?: string
}

export type AskAiMapPlace = {
  id: string
  name: string
  reason: string
  googleMapsUrl?: string
  placeId?: string
  sourceTitle?: string
  sourceUri?: string
  coordinates?: {
    latitude: number
    longitude: number
  }
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

export function resetAskAiMapRuntimeState() {
  setAskAiMapRuntimeState(emptyAskAiMapRuntimeState)
}
