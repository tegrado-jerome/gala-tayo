import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { memo, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Bot } from 'lucide-react'
import { AppIcon } from '../components/AppIcon'
import InternalLink from '../components/InternalLink'
import { GuestAuthPrompt } from '../components/GuestAuthPrompt'
import MapView from '../components/MapView'
import { MapResponsiveLayout } from '../components/layout/ResponsiveLayouts'
import type { PlaceCardData } from '../components/PlaceCard'
import { supabase } from '../supabase'
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
  type AskAiMapOptionalDetails,
  type AskAiMapPlace,
  type AskAiMapSource,
} from '../utils/askAiMapRuntime'
import {
  getOpenStatusChip,
  getShortAreaText,
  toDisplayPlace,
  formatDistanceKm,
  formatReviewCount,
  type AskAiMapDisplayPlace,
} from '../utils/askAiMapDisplay'
import { registerAskAiTask, completeAskAiTask, failAskAiTask } from '../utils/askAiTaskStore'

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
const ASK_AI_MAPS_REQUEST_TIMEOUT_MS = 120_000

function getEmptyReasonMessage(emptyReason: AskAiMapsResponse['emptyReason']) {
  if (emptyReason === 'PROVIDER_BUSY') {
    return 'Ask AI Maps is busy right now. Try again in a bit.'
  }

  if (emptyReason === 'NO_MAP_GROUNDING_RESULTS') {
    return 'No verified places matched that request. Try a more specific area or place type.'
  }

  return null
}

function buildSuggestedSearchesMessage(value: unknown) {
  if (!Array.isArray(value)) {
    return ''
  }

  const suggestions = value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .slice(0, 5)

  return suggestions.length > 0 ? `Try: ${suggestions.join(' • ')}` : ''
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
    return 'Ask AI Maps hit the 120-second limit before finishing. Try again in a moment or narrow the search a bit.'
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

type NormalizedCoordinates = {
  lat: number
  lng: number
  latitude: number
  longitude: number
  source?: 'maps_grounding' | 'places_metadata' | 'geocoded' | 'geoapify' | 'gemini_grounding_location_text' | 'gemini_fallback'
  trusted?: true
  verified?: true
}

type CoordinateVerificationStatus = 'verified' | 'unverified' | 'missing'

type AskAiMapNormalizedPlace = AskAiMapPlace & {
  displayIndex: number
  normalizedCoordinates: NormalizedCoordinates | null
  mapCoordinates: NormalizedCoordinates | null
  coordinateVerificationStatus: CoordinateVerificationStatus
}

type OpenStatusDisplay = {
  label: 'Open' | 'Closed' | 'Status unknown'
  tone: 'open' | 'closed' | 'unknown'
  className: string
  dotClassName: string
  hoursText?: string
}

const coordinatePlausibilityHints = [
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

function getDistanceKm(
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

function getCoordinatePlausibilityHint(text: string) {
  const normalizedText = text.toLowerCase()
  return coordinatePlausibilityHints.find((hint) =>
    hint.keys.some((key) => normalizedText.includes(key))
  ) ?? null
}

function isCoordinatePlausibleForContext(args: {
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

function shouldUseCoordinatesForDisplay(args: {
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

function normalizeOpenStatusLabel(value: unknown): OpenStatusDisplay['label'] | null {
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

function getObjectOpenStatus(value: unknown): OpenStatusDisplay['label'] | null {
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

function normalizeOptionalDetails(value: unknown): AskAiMapOptionalDetails | undefined {
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

function parseAskAiMapReviewCount(value: unknown): number | null {
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

function parseCoordinateNumber(value: unknown): number | null {
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

function isValidCoordinatePair(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

function normalizeLatLngObject(
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
        ...(source ? { source, trusted: true as const, ...(source === 'geoapify' ? { verified: true as const } : {}) } : {}),
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

function hasCoordinateLikeData(place: unknown) {
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

function getRawCoordinateValueForDebug(place: unknown, axis: 'lat' | 'lng'): unknown {
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

function normalizePlaceCoordinates(
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

function isTrustedCoordinateSource(source: NormalizedCoordinates['source']) {
  return source === 'geoapify' || source === 'maps_grounding' || source === 'places_metadata'
}

function hasVerifiedCoordinates(
  place: {
    coordinates?: unknown
    coordinateStatus?: unknown
    coordinateSource?: unknown
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
  const source =
    typeof coordinateRecord?.source === 'string'
      ? (coordinateRecord.source as NormalizedCoordinates['source'])
      : typeof place.coordinateSource === 'string'
        ? (place.coordinateSource as NormalizedCoordinates['source'])
        : normalizedCoordinates.source

  if (explicitStatus === 'missing_coordinates' || explicitStatus === 'unverified') {
    return false
  }

  if (explicitStatus === 'verified') {
    return true
  }

  if (coordinateRecord?.verified === true || coordinateRecord?.trusted === true) {
    return true
  }

  return isTrustedCoordinateSource(source)
}

function normalizePlaces(value: unknown): AskAiMapPlace[] {
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

    if (normalizedReviewCount !== null && normalizedReviewCount < 5) {
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

function getDisplayName(place: AskAiMapPlace) {
  return normalizeDisplayText(place.name) ?? 'Unknown place'
}

function getDisplayCategory(place: AskAiMapPlace) {
  return normalizeDisplayText(place.optionalDetails?.categoryText) ?? normalizeDisplayText(place.category) ?? 'Place'
}

function getDisplayAddress(place: AskAiMapPlace) {
  return normalizeDisplayText(place.optionalDetails?.addressText) ?? normalizeDisplayText(place.address) ?? 'Address not available'
}

function getDisplayHours(place: AskAiMapPlace) {
  return normalizeDisplayText(place.optionalDetails?.hoursText) ?? 'Hours not available'
}

function formatOpenStatus(place: AskAiMapPlace): OpenStatusDisplay {
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
      className: 'bg-slate-100 text-slate-600',
      dotClassName: 'text-slate-400',
      hoursText,
    }
  }

  if (label === 'Closed') {
    return {
      label,
      tone: 'closed',
      className: 'bg-rose-50 text-rose-700',
      dotClassName: 'text-rose-500',
      hoursText,
    }
  }

  return {
    label,
    tone: 'open',
    className: 'bg-emerald-50 text-emerald-700',
    dotClassName: 'text-emerald-500',
    hoursText,
  }
}

function getDisplayDistance(place: AskAiMapPlace): string {
  return formatDistanceKm(place.distanceKm)
}

function buildGoogleMapsSearchUrl(placeName: string, address?: string | null) {
  const destination = [placeName.trim(), address?.trim()].filter(Boolean).join(', ')

  if (!destination) {
    return undefined
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`
}

function shortenAddress(address: string, maxLength = 64) {
  const normalizedAddress = address.trim()

  if (!normalizedAddress || normalizedAddress === 'Address not available') {
    return ''
  }

  return normalizedAddress.length > maxLength
    ? `${normalizedAddress.slice(0, maxLength - 3).trimEnd()}...`
    : normalizedAddress
}

function getMetaDot(hasPreviousValue: boolean) {
  return hasPreviousValue ? <span className="text-[11px] text-slate-300">{'\u00B7'}</span> : null
}

function getMapsHref(place: AskAiMapPlace) {
  const placeRecord = place as AskAiMapPlace & Record<string, unknown>
  const candidates = [
    place.googleMapsUrl,
    place.googleMapsUri,
    typeof placeRecord.sourceUri === 'string' ? placeRecord.sourceUri : undefined,
    typeof placeRecord.mapsUrl === 'string' ? placeRecord.mapsUrl : undefined,
  ]

  return candidates.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim() ?? null
}

function mapPlaceToMapCard(place: AskAiMapNormalizedPlace): PlaceCardData {
  const displayReason = place.reason
  const addressText = getDisplayAddress(place)
  const openStatus = formatOpenStatus(place)
  const coordinateRecord =
    place.coordinates && typeof place.coordinates === 'object' && !Array.isArray(place.coordinates)
      ? place.coordinates
      : null
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
    hasPin: place.hasPin ?? Boolean(pinCoordinates),
    coordinates: pinCoordinates as unknown as PlaceCardData['coordinates'],
    latitude: pinCoordinates?.latitude ?? place.latitude ?? coordinateRecord?.latitude ?? null,
    longitude: pinCoordinates?.longitude ?? place.longitude ?? coordinateRecord?.longitude ?? null,
    lat: pinCoordinates?.lat ?? place.latitude ?? coordinateRecord?.lat ?? null,
    lng: pinCoordinates?.lng ?? place.longitude ?? coordinateRecord?.lng ?? null,
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
    <div className="flex items-end gap-3 rounded-[22px] border border-white/86 bg-white/96 px-3 py-2.5 shadow-[0_10px_24px_rgba(15,23,42,0.08)] backdrop-blur-md lg:mx-auto lg:max-w-[680px]">
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
        className="h-11 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-0.5 py-2.5 text-[14px] font-medium leading-relaxed text-slate-900 outline-none placeholder:whitespace-nowrap placeholder:overflow-hidden placeholder:text-ellipsis placeholder:font-medium placeholder:text-slate-400 sm:text-base"
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
  const [selectedPlaceFocusSignal, setSelectedPlaceFocusSignal] = useState(0)
  const [isPlaceDetailOpen, setIsPlaceDetailOpen] = useState(false)
  const [isMapPinNoticeDismissed, setIsMapPinNoticeDismissed] = useState(false)

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

    if (!session?.access_token || !effectiveCanSubmit) {
      return
    }

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
      const response = await fetch(`/api/ask-ai/maps?t=${Date.now()}`, {
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
      window.clearTimeout(timeoutId)
      if (!wasAskAiMapRequestCancelled()) {
        clearAskAiMapAbortController()
      }
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
    <main className="gala-page-background h-[100dvh] overflow-hidden overscroll-none text-[var(--text)] lg:hidden">
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
              layoutKey={mapLayoutKey}
              onPlaceSelect={selectPlace}
            />

            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,rgba(248,247,244,0.72)_0%,rgba(248,247,244,0.18)_58%,rgba(248,247,244,0)_100%)]" />
            <div className="absolute right-3 top-3 z-[620] sm:right-4 sm:top-4">
              <InternalLink
                href="/ask-ai"
                aria-label="Back to Menu"
                className="pointer-events-auto inline-flex h-[34px] w-[34px] items-center justify-center rounded-xl bg-sky-100 text-sky-700 ring-1 ring-inset ring-sky-200/70 transition hover:bg-sky-200/80 hover:text-sky-800"
              >
                <Bot className="h-6 w-6" strokeWidth={2} />
              </InternalLink>
            </div>

            {isSearching ? (
              <div className="pointer-events-none absolute inset-0 rounded-[26px] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.14))]">
                <div className="absolute inset-0 animate-[gala-map-breathe_4s_ease-in-out_infinite] bg-[linear-gradient(135deg,rgba(255,255,255,0.0)_0%,rgba(255,255,255,0.28)_45%,rgba(255,255,255,0.0)_100%)]" />
              </div>
            ) : null}

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
                    <div className="pointer-events-auto flex w-full items-start gap-2 rounded-[18px] border border-slate-200 bg-white/96 px-3 py-2 text-[11px] leading-5 text-slate-500 shadow-[0_8px_20px_rgba(15,23,42,0.06)] backdrop-blur-sm sm:text-[12px]">
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
                        onClick={() => setIsMapPinNoticeDismissed(true)}
                        className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                        aria-label="Dismiss map pin notice"
                      >
                        <AppIcon name="clear" className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="flex w-full snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden pb-4 pl-1 pr-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden lg:justify-center">
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
                          if (node) cardRefs.current.set(place.id, node)
                          else cardRefs.current.delete(place.id)
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
    <main className="hidden h-[100dvh] overflow-hidden overscroll-none bg-[var(--bg)] text-[var(--text)] lg:block">
      <MapResponsiveLayout className="h-full px-4 py-4 lg:mx-auto lg:max-w-[1500px] lg:px-6 lg:py-6 xl:max-w-[1640px] 2xl:max-w-[1760px]">
        <section className="relative h-full overflow-hidden rounded-[28px] bg-transparent">
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
              layoutKey={mapLayoutKey}
              onPlaceSelect={selectPlace}
            />

            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,rgba(248,247,244,0.72)_0%,rgba(248,247,244,0.18)_58%,rgba(248,247,244,0)_100%)]" />
            <div className="absolute right-3 top-3 z-[620]">
              <InternalLink
                href="/ask-ai"
                aria-label="Back to Menu"
                className="pointer-events-auto inline-flex h-[34px] w-[34px] items-center justify-center rounded-xl bg-sky-100 text-sky-700 ring-1 ring-inset ring-sky-200/70 transition hover:bg-sky-200/80 hover:text-sky-800"
              >
                <Bot className="h-6 w-6" strokeWidth={2} />
              </InternalLink>
            </div>
          </div>
        </section>

        <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-[var(--line)] bg-white shadow-[0_18px_44px_rgba(15,23,42,0.12)]">
          <div className="shrink-0 border-b border-[var(--line)] px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">Ask AI Maps</p>
                <h1 className="mt-1 text-[22px] font-black tracking-[-0.03em] text-slate-950">
                  {query.trim() || 'Map results'}
                </h1>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-600">
                {normalizedPlaces.length} places
              </span>
            </div>
            {statusMessage ? <p className="mt-2 text-sm font-medium text-slate-600">{statusMessage}</p> : null}
            {errorMessage ? <p className="mt-2 text-sm font-medium text-rose-600">{errorMessage}</p> : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="grid gap-3">
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
                      if (node) cardRefs.current.set(place.id, node)
                      else cardRefs.current.delete(place.id)
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

            <div className="mt-4">
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
        </aside>
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
        <div className="absolute inset-x-0 bottom-0 flex items-end lg:inset-0 lg:items-center lg:justify-center lg:p-4">
        <section
          className="flex w-full max-h-[82dvh] flex-col overflow-hidden rounded-t-[28px] bg-white shadow-[0_-18px_48px_rgba(15,23,42,0.22)] lg:max-w-[580px] lg:max-h-[88dvh] lg:rounded-[28px] lg:shadow-[0_26px_60px_rgba(15,23,42,0.24)]"
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

