import type { AskAiMapOptionalDetails, AskAiMapPlace, AskAiMapSource } from '../../../utils/askAiMapRuntime'
import type { PlaceCardData } from '../../../components/PlaceCard'
import { formatDistanceKm } from '../../../utils/askAiMapDisplay'

export type AskAiMapChipId =
  | 'near-me'
  | 'open-now'
  | 'date-spot'
  | 'barkada'
  | 'budget-friendly'
  | 'cafe'
  | 'kainan'
  | 'chill'

export type AskAiMapChip = {
  id: AskAiMapChipId
  label: string
}

export type AskAiMapsResponse = {
  mode?: 'gemini_map_grounding_only' | 'gemini_maps_grounding_geoapify_verified' | 'hybrid_mixed_verified' | 'geoapify_places_soft_expanded' | 'geoapify_places_strict' | 'no_verified_results'
  query?: string
  searchArea?: string | null
  answerText?: string
  summary?: string
  resultMeta?: {
    queryType?: 'broad_discovery' | 'specific_lookup' | 'nearby_discovery' | 'strict_category' | 'broad_gala' | 'specific_place' | 'mixed_intent' | 'near_me' | 'unknown'
    strictCategory?: boolean
    targetMinResults?: number
    targetMaxResults?: number
    geminiGroundedCount?: number
    geoapifyCoordinateFilledCount?: number
    geminiCoordinateFallbackCount?: number
    cardOnlyCount?: number
    geoapifyFallbackCount?: number
    actualResults?: number
    returnedCount?: number
    pinCount?: number
    coordinateSource?: 'mixed'
    resultCountReason?: string | null
  }
  places?: AskAiMapPlace[]
  suggestedSearches?: string[]
  sources?: AskAiMapSource[]
  modelUsed?: string | null
  responseMetadata?: {
    mode?: 'gemini_map_grounding_only'
    provider?: 'gemini'
    modelUsed?: string
    geoapifyUsed?: boolean
    googlePlacesApiUsed?: boolean
    groundingSourcesCount?: number
    finalGroundedPlacesCount?: number
    placesWithCoordinatesCount?: number
    placesWithoutCoordinatesCount?: number
  }
  usage?: {
    allowed: boolean
    usageType: string
    dailyLimit: number
    requestCount: number
    remaining: number
    resetsAt: string
  }
  message?: string
  emptyReason?: 'NO_MAP_GROUNDING_RESULTS' | 'PROVIDER_BUSY'
}

export const DAILY_ASK_AI_LIMIT_MESSAGES = [
  'Daily GalaTayo AI limit reached.',
  'You have reached your GalaTayo AI Maps daily limit.',
]
export const ASK_AI_MAPS_REQUEST_TIMEOUT_MS = 120_000

export function getEmptyReasonMessage(emptyReason: AskAiMapsResponse['emptyReason']) {
  if (emptyReason === 'PROVIDER_BUSY') {
    return 'Please try again in a moment.'
  }

  if (emptyReason === 'NO_MAP_GROUNDING_RESULTS') {
    return 'No verified places matched that request. Try a more specific area or place type.'
  }

  return null
}

export function buildSuggestedSearchesMessage(value: unknown) {
  if (!Array.isArray(value)) {
    return ''
  }

  const suggestions = value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .slice(0, 5)

  return suggestions.length > 0 ? `Try: ${suggestions.join(' • ')}` : ''
}

export function isDailyAskAiLimitMessage(message: string) {
  const trimmed = message.trim().toLowerCase()
  return DAILY_ASK_AI_LIMIT_MESSAGES.some((m) => trimmed === m.toLowerCase())
}

export function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}

export function getAskAiMapsRequestErrorMessage(error: unknown) {
  if (isAbortError(error)) {
    return 'GalaTayo AI Maps hit the 120-second limit before finishing. Try again in a moment or narrow the search a bit.'
  }

  return error instanceof Error ? error.message : 'GalaTayo AI Maps could not load places right now.'
}

export function extractStructuredAnswerText(value: string) {
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

export type PermissionState = 'idle' | 'prompt' | 'requesting' | 'granted' | 'denied'

export const promptChips: AskAiMapChip[] = [
  { id: 'near-me', label: 'Near me' },
  { id: 'open-now', label: 'Open now' },
  { id: 'date-spot', label: 'Date spot' },
  { id: 'barkada', label: 'Barkada' },
  { id: 'budget-friendly', label: 'Budget-friendly' },
  { id: 'cafe', label: 'Cafe' },
  { id: 'kainan', label: 'Kainan' },
  { id: 'chill', label: 'Chill' },
]

export const chipLabelsById = new Map(promptChips.map((chip) => [chip.id, chip.label]))
export const metroManilaCenter: readonly [number, number] = [14.5995, 120.9842]
export const askAiMapRouteCacheKey = 'galatayo:ask-ai-map-route'

export type AskAiMapRouteCache = {
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

export type NormalizedCoordinates = {
  lat: number
  lng: number
  latitude: number
  longitude: number
  source?: 'maps_grounding' | 'places_metadata' | 'geocoded' | 'geoapify' | 'gemini_grounding_location_text' | 'gemini_fallback'
  trusted?: true
  verified?: true
}

export type CoordinateVerificationStatus = 'verified' | 'unverified' | 'missing'

export type AskAiMapNormalizedPlace = AskAiMapPlace & {
  displayIndex: number
  normalizedCoordinates: NormalizedCoordinates | null
  mapCoordinates: NormalizedCoordinates | null
  coordinateVerificationStatus: CoordinateVerificationStatus
}

export type OpenStatusDisplay = {
  label: 'Open' | 'Closed' | 'Status unknown'
  tone: 'open' | 'closed' | 'unknown'
  className: string
  dotClassName: string
  hoursText?: string
}

export const coordinatePlausibilityHints = [
  { keys: ['abra', 'bangued'], center: { lat: 17.5967, lng: 120.6155 }, maxDistanceKm: 35 },
  { keys: ['tayum'], center: { lat: 17.6167, lng: 120.7297 }, maxDistanceKm: 30 },
  { keys: ['tagaytay'], center: { lat: 14.1154, lng: 120.9621 }, maxDistanceKm: 35 },
  { keys: ['tarlac'], center: { lat: 15.4755, lng: 120.5963 }, maxDistanceKm: 45 },
  { keys: ['imus'], center: { lat: 14.4297, lng: 120.9367 }, maxDistanceKm: 35 },
  { keys: ['makati'], center: { lat: 14.5547, lng: 121.0244 }, maxDistanceKm: 30 },
  { keys: ['quezon city', 'qc'], center: { lat: 14.676, lng: 121.0437 }, maxDistanceKm: 40 },
  { keys: ['baguio'], center: { lat: 16.4023, lng: 120.596 }, maxDistanceKm: 35 },
  { keys: ['alabang'], center: { lat: 14.4191, lng: 121.0443 }, maxDistanceKm: 30 },
  { keys: ['moa', 'mall of asia'], center: { lat: 14.5353, lng: 120.9821 }, maxDistanceKm: 20 },
  { keys: ['manila'], center: { lat: 14.5995, lng: 120.9842 }, maxDistanceKm: 45 },
  { keys: ['cavite'], center: { lat: 14.2814, lng: 120.8685 }, maxDistanceKm: 75 },
] as const

export function getDistanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
) {
  const earthRadiusKm = 6371
  const toRadians = (value: number) => value * Math.PI / 180
  const dLat = toRadians(to.lat - from.lat)
  const dLng = toRadians(to.lng - from.lng)
  const lat1 = toRadians(from.lat)
  const lat2 = toRadians(to.lat)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function getCoordinatePlausibilityHint(text: string) {
  const normalizedText = text.toLowerCase()
  return coordinatePlausibilityHints.find((hint) =>
    hint.keys.some((key) => normalizedText.includes(key))
  ) ?? null
}

export function isCoordinatePlausibleForContext(args: {
  placeName: string
  query: string
  address: string
  coordinates: NormalizedCoordinates
}) {
  const hint = getCoordinatePlausibilityHint(`${args.query} ${args.address} ${args.placeName}`)

  if (!hint) {
    return true
  }

  const distanceKm = getDistanceKm(
    { lat: args.coordinates.latitude, lng: args.coordinates.longitude },
    hint.center,
  )
  const isPlausible = distanceKm <= hint.maxDistanceKm

  if (!isPlausible) {
    console.warn('[AskAiMap] Suspicious coordinates', {
      placeName: args.placeName,
      query: args.query,
      address: args.address,
      lat: args.coordinates.latitude,
      lng: args.coordinates.longitude,
      reason: 'Coordinate appears far from requested/search-result location',
    })
  }

  return isPlausible
}

export function shouldUseCoordinatesForDisplay(args: {
  placeName: string
  query: string
  address: string
  coordinates: NormalizedCoordinates
  allowImplausible?: boolean
}) {
  const isPlausible = isCoordinatePlausibleForContext(args)

  if (isPlausible) {
    return true
  }

  if (args.allowImplausible) {
    console.warn('[AskAiMap] Keeping implausible-but-explicit coordinates for display', {
      placeName: args.placeName,
      query: args.query,
      address: args.address,
      lat: args.coordinates.latitude,
      lng: args.coordinates.longitude,
      reason: 'Result already provided explicit coordinates, so map pins should still render.',
    })
    return true
  }

  return false
}

export function normalizeOpenStatusLabel(value: unknown): OpenStatusDisplay['label'] | null {
  if (typeof value === 'boolean') {
    return value ? 'Open' : 'Closed'
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()

    if (!normalized) {
      return null
    }

    if (['true', 'yes', 'y', 'open', 'open now', 'opened'].includes(normalized)) {
      return 'Open'
    }

    if (['false', 'no', 'n', 'closed', 'closed now'].includes(normalized)) {
      return 'Closed'
    }

    if (/\bclosed\b/.test(normalized)) {
      return 'Closed'
    }

    if (/\bopen\b/.test(normalized)) {
      return 'Open'
    }
  }

  return null
}

export function getObjectOpenStatus(value: unknown): OpenStatusDisplay['label'] | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  return (
    normalizeOpenStatusLabel(record.openNow) ??
    normalizeOpenStatusLabel(record.open_now) ??
    normalizeOpenStatusLabel(record.isOpen) ??
    normalizeOpenStatusLabel(record.is_open) ??
    normalizeOpenStatusLabel(record.openStatus) ??
    normalizeOpenStatusLabel(record.open_status) ??
    normalizeOpenStatusLabel(record.businessStatus) ??
    normalizeOpenStatusLabel(record.business_status)
  )
}

export function normalizeOptionalDetails(value: unknown): AskAiMapOptionalDetails | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const candidate = value as Partial<AskAiMapOptionalDetails>
  const record = value as Record<string, unknown>
  const normalizedCategoryText =
    typeof candidate.categoryText === 'string' && candidate.categoryText.trim()
      ? candidate.categoryText.trim()
      : typeof record.category === 'string' && record.category.trim()
        ? record.category.trim()
        : undefined
  const normalizedRatingText =
    typeof candidate.ratingText === 'string' && candidate.ratingText.trim()
      ? candidate.ratingText.trim()
      : typeof record.rating === 'number'
        ? record.rating.toFixed(1)
        : typeof record.rating === 'string' && record.rating.trim()
          ? record.rating.trim()
          : undefined
  const normalizedReviewCountText =
    typeof candidate.reviewCountText === 'string' && candidate.reviewCountText.trim()
      ? candidate.reviewCountText.trim()
      : typeof record.reviewCount === 'number'
        ? `${record.reviewCount.toLocaleString()} reviews`
        : typeof record.reviewCount === 'string' && record.reviewCount.trim()
          ? record.reviewCount.trim()
          : undefined
  const normalizedOpenStatusText =
    typeof candidate.openStatusText === 'string' && candidate.openStatusText.trim()
      ? normalizeOpenStatusLabel(candidate.openStatusText) ?? candidate.openStatusText.trim()
      : getObjectOpenStatus(record) ??
        normalizeOpenStatusLabel(record.openStatus) ??
        normalizeOpenStatusLabel(record.open_status) ??
        normalizeOpenStatusLabel(record.openNow) ??
        normalizeOpenStatusLabel(record.open_now) ??
        normalizeOpenStatusLabel(record.isOpen) ??
        normalizeOpenStatusLabel(record.is_open) ??
        normalizeOpenStatusLabel(record.businessStatus) ??
        normalizeOpenStatusLabel(record.business_status) ??
        undefined
  const normalizedAddressText =
    typeof candidate.addressText === 'string' && candidate.addressText.trim()
      ? candidate.addressText.trim()
      : typeof record.address === 'string' && record.address.trim()
        ? record.address.trim()
        : typeof record.locationText === 'string' && record.locationText.trim()
          ? record.locationText.trim()
          : undefined
  const normalizedHoursText =
    typeof candidate.hoursText === 'string' && candidate.hoursText.trim()
      ? candidate.hoursText.trim()
      : typeof record.hours === 'string' && record.hours.trim()
        ? record.hours.trim()
        : undefined

  const details = {
    ...(normalizedCategoryText ? { categoryText: normalizedCategoryText } : {}),
    ...(normalizedRatingText ? { ratingText: normalizedRatingText } : {}),
    ...(normalizedReviewCountText ? { reviewCountText: normalizedReviewCountText } : {}),
    ...(normalizedOpenStatusText ? { openStatusText: normalizedOpenStatusText } : {}),
    ...(normalizedAddressText ? { addressText: normalizedAddressText } : {}),
    ...(normalizedHoursText ? { hoursText: normalizedHoursText } : {}),
  }

  return Object.keys(details).length > 0 ? details : undefined
}

export function parseAskAiMapReviewCount(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value) : null
  }

  if (typeof value !== 'string') {
    return null
  }

  const trimmedValue = value.trim()

  if (!trimmedValue) {
    return null
  }

  const match = trimmedValue.match(/(\d[\d,]*)\s*(?:reviews?|ratings?)/i)

  if (!match?.[1]) {
    return null
  }

  const parsedValue = Number(match[1].replace(/,/g, ''))

  return Number.isFinite(parsedValue) ? Math.round(parsedValue) : null
}

export function parseCoordinateNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    const trimmedValue = value.trim()

    if (!trimmedValue) {
      return null
    }

    const parsedValue = Number(trimmedValue)
    return Number.isFinite(parsedValue) ? parsedValue : null
  }

  return null
}

export function isValidCoordinatePair(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

export function normalizeLatLngObject(
  latitudeValue: unknown,
  longitudeValue: unknown,
  source?: NormalizedCoordinates['source'],
): NormalizedCoordinates | null {
  const latitude = parseCoordinateNumber(latitudeValue)
  const longitude = parseCoordinateNumber(longitudeValue)

  if (latitude === null || longitude === null) {
    return null
  }

  if (!isValidCoordinatePair(latitude, longitude)) {
    if (isValidCoordinatePair(longitude, latitude)) {
      return {
        lat: longitude,
        lng: latitude,
        latitude: longitude,
        longitude: latitude,
        ...(source ? { source } : {}),
        trusted: true as const,
        verified: true as const,
      }
    }

    return null
  }

  return {
    lat: latitude,
    lng: longitude,
    latitude,
    longitude,
    ...(source
      ? {
          source,
          ...(source === 'geoapify' || source === 'maps_grounding' || source === 'places_metadata'
            ? { trusted: true as const, verified: true as const }
            : {}),
        }
      : {}),
  }
}

export function hasCoordinateLikeData(place: unknown) {
  if (!place || typeof place !== 'object') {
    return false
  }

  const candidate = place as Record<string, unknown>
  return [
    candidate.coordinates,
    candidate.location,
    candidate.coordinate,
    candidate.coordinatesText,
    candidate.lat,
    candidate.lng,
    candidate.latitude,
    candidate.longitude,
  ].some((value) => value !== undefined && value !== null)
}

export function getRawCoordinateValueForDebug(place: unknown, axis: 'lat' | 'lng'): unknown {
  if (!place || typeof place !== 'object') {
    return undefined
  }

  const candidate = place as Record<string, unknown>
  const coordinateObject =
    candidate.coordinates && typeof candidate.coordinates === 'object' && !Array.isArray(candidate.coordinates)
      ? candidate.coordinates as Record<string, unknown>
      : null
  const locationObject =
    candidate.location && typeof candidate.location === 'object' && !Array.isArray(candidate.location)
      ? candidate.location as Record<string, unknown>
      : null

  if (axis === 'lat') {
    return coordinateObject?.lat ??
      coordinateObject?.latitude ??
      locationObject?.lat ??
      locationObject?.latitude ??
      candidate.lat ??
      candidate.latitude
  }

  return coordinateObject?.lng ??
    coordinateObject?.longitude ??
    locationObject?.lng ??
    locationObject?.longitude ??
    candidate.lng ??
    candidate.longitude
}

export function normalizePlaceCoordinates(
  place: unknown,
  context: { query?: string; address?: string; placeName?: string } = {},
): NormalizedCoordinates | null {
  if (!place || typeof place !== 'object') {
    return null
  }

  const candidate = place as Record<string, unknown>

  if (candidate.hasPin === false) {
    return null
  }

  const coordinateObject =
    candidate.coordinates && typeof candidate.coordinates === 'object'
      ? candidate.coordinates as Record<string, unknown>
      : null
  const rawCoordinateSource = coordinateObject?.source
  const coordinateSource: NormalizedCoordinates['source'] =
    rawCoordinateSource === 'geoapify' ||
    rawCoordinateSource === 'gemini_fallback' ||
    rawCoordinateSource === 'gemini_grounding_location_text' ||
    rawCoordinateSource === 'places_metadata' ||
    rawCoordinateSource === 'geocoded' ||
    rawCoordinateSource === 'maps_grounding'
      ? rawCoordinateSource
      : undefined

  const candidatePairs: Array<[unknown, unknown]> = [
    [coordinateObject?.lat, coordinateObject?.lng],
    [coordinateObject?.latitude, coordinateObject?.longitude],
    [candidate.lat, candidate.lng],
    [candidate.latitude, candidate.longitude],
  ]

  if (Array.isArray(candidate.coordinates)) {
    candidatePairs.push([candidate.coordinates[0], candidate.coordinates[1]])
  }

  if (Array.isArray(candidate.location)) {
    candidatePairs.push([candidate.location[0], candidate.location[1]])
  }

  for (const [latValue, lngValue] of candidatePairs) {
    const normalized = normalizeLatLngObject(latValue, lngValue, coordinateSource)

    if (normalized) {
      return shouldUseCoordinatesForDisplay({
        placeName: context.placeName ?? normalizeDisplayText(candidate.name as string | undefined) ?? 'Unknown place',
        query: context.query ?? '',
        address: context.address ?? normalizeDisplayText(candidate.address as string | undefined) ?? '',
        coordinates: normalized,
      }) ? normalized : null
    }
  }

  const stringCandidates = [
    candidate.coordinates,
    candidate.location,
    candidate.coordinate,
    candidate.coordinatesText,
  ]

  for (const stringCandidate of stringCandidates) {
    if (typeof stringCandidate !== 'string') {
      continue
    }

    const match = stringCandidate.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)

    if (!match) {
      continue
    }

    const normalized = normalizeLatLngObject(match[1], match[2], coordinateSource)

    if (normalized) {
      return shouldUseCoordinatesForDisplay({
        placeName: context.placeName ?? normalizeDisplayText(candidate.name as string | undefined) ?? 'Unknown place',
        query: context.query ?? '',
        address: context.address ?? normalizeDisplayText(candidate.address as string | undefined) ?? '',
        coordinates: normalized,
      }) ? normalized : null
    }
  }

  if (hasCoordinateLikeData(candidate)) {
    console.warn('[AskAiMapPage] Unable to parse place coordinates:', candidate)
  }

  return null
}

export function isTrustedCoordinateSource(source: NormalizedCoordinates['source']) {
  return source === 'geoapify' || source === 'maps_grounding' || source === 'places_metadata'
}

export function hasVerifiedCoordinates(
  place: {
    coordinates?: unknown
    coordinateStatus?: unknown
    coordinateSource?: unknown
    coordinateConfidence?: unknown
    hasPin?: unknown
  } & Record<string, unknown>,
  normalizedCoordinates: NormalizedCoordinates | null,
) {
  if (!normalizedCoordinates) {
    return false
  }

  const coordinateRecord =
    place.coordinates && typeof place.coordinates === 'object' && !Array.isArray(place.coordinates)
      ? place.coordinates as Record<string, unknown>
      : null
  const explicitStatus = typeof place.coordinateStatus === 'string' ? String(place.coordinateStatus) : ''

  if (place.hasPin === false || explicitStatus === 'missing_coordinates' || explicitStatus === 'unverified') {
    return false
  }

  // The backend decides which coordinates are good enough to pin (and says so with hasPin);
  // without that flag, fall back to trusting only high-confidence coordinates from known sources.
  if (place.hasPin === true) {
    return true
  }

  const source =
    typeof coordinateRecord?.source === 'string'
      ? (coordinateRecord.source as NormalizedCoordinates['source'])
      : typeof place.coordinateSource === 'string'
        ? (place.coordinateSource as NormalizedCoordinates['source'])
        : normalizedCoordinates.source
  const isHighConfidence = coordinateRecord?.confidence === 'high' || place.coordinateConfidence === 'high'

  return isHighConfidence && isTrustedCoordinateSource(source)
}

export function normalizePlaces(value: unknown): AskAiMapPlace[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const candidate = entry as Partial<AskAiMapPlace> & Partial<AskAiMapOptionalDetails> & {
      lat?: unknown
      lng?: unknown
      latitude?: unknown
      longitude?: unknown
      googleMapsUri?: unknown
      googleMapsUrl?: unknown
      mapsUrl?: unknown
      coordinateSource?: unknown
    }
    const fallbackName = 'Unknown place'
    const normalizedName = typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name.trim() : fallbackName
    const normalizedId =
      typeof candidate.id === 'string' && candidate.id.trim()
        ? candidate.id.trim()
        : `${normalizedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown-place'}-${index + 1}`
    const normalizedCoordinates = normalizePlaceCoordinates(candidate)
    const normalizedReviewCount = parseAskAiMapReviewCount(
      candidate.reviewCount ??
        candidate.optionalDetails?.reviewCountText ??
        (candidate as Record<string, unknown>).reviewCountText
    )

    // GalaTayo places are curated, so they show even with few reviews; the review floor only screens Google results.
    const isGalaTayoPlace = normalizedId.startsWith('galatayo:') || (typeof candidate.galatayoPath === 'string' && candidate.galatayoPath.startsWith('/places/'))
    if (!isGalaTayoPlace && normalizedReviewCount !== null && normalizedReviewCount < 5) {
      return []
    }

    const fallbackReason = 'Recommended based on your map search.'
    const normalizedReason = [
      candidate.whyThisFits,
      candidate.reason,
      candidate.queryReason,
      candidate.summary,
      candidate.description,
      candidate.subtitle,
    ].find((item): item is string => typeof item === 'string' && Boolean(item.trim()))?.trim() ?? fallbackReason
    return [{
      id: normalizedId,
      name: normalizedName,
      reason: normalizedReason,
      whyThisFits: typeof candidate.whyThisFits === 'string' && candidate.whyThisFits.trim() ? candidate.whyThisFits.trim() : normalizedReason,
      aiPreview: typeof candidate.aiPreview === 'string' && candidate.aiPreview.trim() ? candidate.aiPreview.trim() : undefined,
      googleMapsUrl:
        typeof candidate.googleMapsUrl === 'string' && candidate.googleMapsUrl.trim()
          ? candidate.googleMapsUrl.trim()
          : typeof candidate.googleMapsUri === 'string' && candidate.googleMapsUri.trim()
            ? candidate.googleMapsUri.trim()
            : typeof candidate.sourceUri === 'string' && candidate.sourceUri.trim()
              ? candidate.sourceUri.trim()
              : typeof candidate.mapsUrl === 'string' && candidate.mapsUrl.trim()
                ? candidate.mapsUrl.trim()
                : buildGoogleMapsSearchUrl(
                    normalizedName,
                    candidate.address as string | undefined,
                  ),
      galatayoPath: typeof candidate.galatayoPath === 'string' && candidate.galatayoPath.startsWith('/places/') ? candidate.galatayoPath : undefined,
      googleMapsUri: typeof candidate.googleMapsUri === 'string' ? candidate.googleMapsUri : undefined,
      placeId: typeof candidate.placeId === 'string' ? candidate.placeId : undefined,
      sourceTitle: typeof candidate.sourceTitle === 'string' ? candidate.sourceTitle : undefined,
      sourceUri: typeof candidate.sourceUri === 'string' ? candidate.sourceUri : undefined,
      coordinates: normalizedCoordinates ?? candidate.coordinates ?? undefined,
      lat: normalizedCoordinates?.latitude ?? (candidate.lat as number | null) ?? null,
      lng: normalizedCoordinates?.longitude ?? (candidate.lng as number | null) ?? null,
      latitude: normalizedCoordinates?.latitude ?? (candidate.latitude as number | null) ?? null,
      longitude: normalizedCoordinates?.longitude ?? (candidate.longitude as number | null) ?? null,
      hasPin: candidate.hasPin !== false && hasVerifiedCoordinates(candidate, normalizedCoordinates),
      coordinateConfidence: (
        candidate.coordinateConfidence === 'high' ||
        candidate.coordinateConfidence === 'medium' ||
        candidate.coordinateConfidence === 'low' ||
        candidate.coordinateConfidence === 'none'
      ) ? candidate.coordinateConfidence
        : normalizedCoordinates ? 'medium'
        : 'none',
      coordinateStatus:
        candidate.coordinateStatus === 'geoapify_coordinate_fill' ||
        candidate.coordinateStatus === 'gemini_coordinate_fallback' ||
        candidate.coordinateStatus === 'missing_coordinates'
          ? candidate.coordinateStatus
          : normalizedCoordinates
            ? hasVerifiedCoordinates(candidate, normalizedCoordinates)
              ? 'geoapify_coordinate_fill'
              : 'gemini_coordinate_fallback'
            : 'missing_coordinates',
      coordinateSource:
        typeof candidate.coordinateSource === 'string'
          ? candidate.coordinateSource
          : normalizedCoordinates?.source ?? undefined,
      distanceKm:
        typeof (candidate as Record<string, unknown>).distanceKm === 'number'
          ? (candidate as Record<string, unknown>).distanceKm as number
          : null,
      openingHoursSummary:
        typeof (candidate as Record<string, unknown>).openingHoursSummary === 'string'
          ? ((candidate as Record<string, unknown>).openingHoursSummary as string).trim() || null
          : null,
      rating:
        typeof (candidate as Record<string, unknown>).rating === 'number'
          ? (candidate as Record<string, unknown>).rating as number
          : undefined,
      reviewCount: normalizedReviewCount ?? undefined,
      optionalDetails: normalizeOptionalDetails(candidate.optionalDetails) ?? normalizeOptionalDetails(candidate),
    }]
  })
}

export function normalizeSources(value: unknown): AskAiMapSource[] {
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

export function buildMapRequestQuery(query: string, selectedChipIds: AskAiMapChipId[]) {
  const normalizedQuery = query.trim()
  const labels = selectedChipIds
    .filter((chipId) => chipId !== 'near-me' && chipId !== 'open-now')
    .map((chipId) => chipLabelsById.get(chipId) ?? chipId)

  return [normalizedQuery, labels.join(', ')].filter(Boolean).join(' | ')
}

export function normalizeDisplayText(value: string | undefined) {
  const trimmedValue = value?.trim()
  return trimmedValue ? trimmedValue : undefined
}

export function getDisplayName(place: AskAiMapPlace) {
  return normalizeDisplayText(place.name) ?? 'Unknown place'
}

export function getDisplayCategory(place: AskAiMapPlace) {
  return normalizeDisplayText(place.optionalDetails?.categoryText) ?? normalizeDisplayText(place.category) ?? 'Place'
}

export function getDisplayAddress(place: AskAiMapPlace) {
  return normalizeDisplayText(place.optionalDetails?.addressText) ?? normalizeDisplayText(place.address) ?? 'Address not available'
}

export function getDisplayHours(place: AskAiMapPlace) {
  return normalizeDisplayText(place.optionalDetails?.hoursText) ?? 'Hours not available'
}

export function formatOpenStatus(place: AskAiMapPlace): OpenStatusDisplay {
  const placeRecord = place as AskAiMapPlace & Record<string, unknown>
  const label =
    normalizeOpenStatusLabel(place.optionalDetails?.openStatusText) ??
    normalizeOpenStatusLabel(placeRecord.openStatus) ??
    normalizeOpenStatusLabel(placeRecord.open_status) ??
    normalizeOpenStatusLabel(placeRecord.openNow) ??
    normalizeOpenStatusLabel(placeRecord.open_now) ??
    normalizeOpenStatusLabel(placeRecord.isOpen) ??
    normalizeOpenStatusLabel(placeRecord.is_open) ??
    getObjectOpenStatus(placeRecord.currentOpeningHours) ??
    getObjectOpenStatus(placeRecord.current_opening_hours)
  const hoursText = getDisplayHours(place) !== 'Hours not available' ? getDisplayHours(place) : undefined

  if (!label) {
    return {
      label: 'Status unknown',
      tone: 'unknown',
      className: 'g-tag',
      dotClassName: 'g-fnt',
      hoursText,
    }
  }

  if (label === 'Closed') {
    return {
      label,
      tone: 'closed',
      className: 'g-tag is-bad',
      dotClassName: 'text-[var(--bad)]',
      hoursText,
    }
  }

  return {
    label,
    tone: 'open',
    className: 'g-tag is-ok',
    dotClassName: 'text-[var(--ok)]',
    hoursText,
  }
}

export function getDisplayDistance(place: AskAiMapPlace): string {
  return formatDistanceKm(place.distanceKm)
}

export function buildGoogleMapsSearchUrl(placeName: string, address?: string | null) {
  const destination = [placeName.trim(), address?.trim()].filter(Boolean).join(', ')

  if (!destination) {
    return undefined
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`
}

export function shortenAddress(address: string, maxLength = 64) {
  const normalizedAddress = address.trim()

  if (!normalizedAddress || normalizedAddress === 'Address not available') {
    return ''
  }

  return normalizedAddress.length > maxLength
    ? `${normalizedAddress.slice(0, maxLength - 3).trimEnd()}...`
    : normalizedAddress
}

export function getMetaDot(hasPreviousValue: boolean) {
  return hasPreviousValue ? <span className="g-fnt" aria-hidden="true">{'\u00B7'}</span> : null
}

export function getMapsHref(place: AskAiMapPlace) {
  const placeRecord = place as AskAiMapPlace & Record<string, unknown>
  const candidates = [
    place.googleMapsUrl,
    place.googleMapsUri,
    typeof placeRecord.sourceUri === 'string' ? placeRecord.sourceUri : undefined,
    typeof placeRecord.mapsUrl === 'string' ? placeRecord.mapsUrl : undefined,
  ]

  return candidates.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim() ?? null
}

export function mapPlaceToMapCard(place: AskAiMapNormalizedPlace): PlaceCardData {
  const displayReason = place.reason
  const addressText = getDisplayAddress(place)
  const openStatus = formatOpenStatus(place)
  const pinCoordinates = place.mapCoordinates && typeof place.mapCoordinates === 'object' ? place.mapCoordinates : null
  const distanceText = getDisplayDistance(place)

  return {
    id: place.id,
    displayIndex: place.displayIndex,
    name: getDisplayName(place),
    category: getDisplayCategory(place),
    area: addressText ?? 'Map-grounded pick',
    address: addressText,
    city: addressText ?? 'Map-grounded area',
    localArea: addressText,
    status: openStatus.tone === 'closed' ? 'Closed' : openStatus.tone === 'open' ? 'Open' : 'Unknown',
    reason: displayReason,
    description: displayReason,
    badge: distanceText || getDisplayCategory(place),
    googleMapsUrl: getMapsHref(place),
    hasPin: Boolean(pinCoordinates),
    coordinates: pinCoordinates as unknown as PlaceCardData['coordinates'],
    latitude: pinCoordinates?.latitude ?? null,
    longitude: pinCoordinates?.longitude ?? null,
    lat: pinCoordinates?.lat ?? null,
    lng: pinCoordinates?.lng ?? null,
  }
}

export function readAskAiMapRouteCache(): AskAiMapRouteCache | null {
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

export function writeAskAiMapRouteCache(cache: AskAiMapRouteCache) {
  try {
    window.sessionStorage.setItem(askAiMapRouteCacheKey, JSON.stringify(cache))
  } catch (error) {
    console.warn('Unable to cache Ask AI Map state:', error)
  }
}

export function clearAskAiMapRouteCache() {
  try {
    window.sessionStorage.removeItem(askAiMapRouteCacheKey)
  } catch (error) {
    console.warn('Unable to clear cached Ask AI Map state:', error)
  }
}

