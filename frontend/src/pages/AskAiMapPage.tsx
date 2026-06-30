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

type NormalizedCoordinates = {
  lat: number
  lng: number
  latitude: number
  longitude: number
}

type AskAiMapNormalizedPlace = AskAiMapPlace & {
  displayIndex: number
  normalizedCoordinates: NormalizedCoordinates | null
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
      ? candidate.openStatusText.trim()
      : typeof record.openStatus === 'string' && record.openStatus.trim()
        ? record.openStatus.trim()
        : undefined
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

function normalizeLatLngObject(latitudeValue: unknown, longitudeValue: unknown): NormalizedCoordinates | null {
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
      }
    }

    return null
  }

  return {
    lat: latitude,
    lng: longitude,
    latitude,
    longitude,
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

function normalizePlaceCoordinates(place: unknown): NormalizedCoordinates | null {
  if (!place || typeof place !== 'object') {
    return null
  }

  const candidate = place as Record<string, unknown>
  const coordinateObject =
    candidate.coordinates && typeof candidate.coordinates === 'object'
      ? candidate.coordinates as Record<string, unknown>
      : null
  const locationObject =
    candidate.location && typeof candidate.location === 'object'
      ? candidate.location as Record<string, unknown>
      : null

  const candidatePairs: Array<[unknown, unknown]> = [
    [coordinateObject?.lat, coordinateObject?.lng],
    [coordinateObject?.latitude, coordinateObject?.longitude],
    [locationObject?.lat, locationObject?.lng],
    [locationObject?.latitude, locationObject?.longitude],
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
    const normalized = normalizeLatLngObject(latValue, lngValue)

    if (normalized) {
      return normalized
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

    const normalized = normalizeLatLngObject(match[1], match[2])

    if (normalized) {
      return normalized
    }
  }

  if (hasCoordinateLikeData(candidate)) {
    console.warn('[AskAiMapPage] Unable to parse place coordinates:', candidate)
  }

  return null
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
      latitude?: unknown
      longitude?: unknown
      googleMapsUri?: unknown
    }
    const fallbackName = 'Unknown place'
    const normalizedName = typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name.trim() : fallbackName
    const normalizedId =
      typeof candidate.id === 'string' && candidate.id.trim()
        ? candidate.id.trim()
        : `${normalizedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown-place'}-${index + 1}`
    const normalizedCoordinates = normalizePlaceCoordinates(candidate)
    const normalizedOptionalDetails = normalizeOptionalDetails(candidate.optionalDetails) ?? normalizeOptionalDetails(candidate)
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
      coordinates: normalizedCoordinates ?? undefined,
      optionalDetails: normalizedOptionalDetails,
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
  void query
  return 'Live map-grounded picks'
}

function deriveQueryMapCenter(query: string) {
  void query
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
  const reviewCount = normalizeDisplayText(place.optionalDetails?.reviewCountText)
  const openStatus = normalizeDisplayText(place.optionalDetails?.openStatusText)
  const hours = normalizeDisplayText(place.optionalDetails?.hoursText)
  const normalizedQuery = query.trim()
  const queryContext = normalizedQuery || 'map search mo'
  const typeContext = category ? ` as a ${category.toLowerCase()}` : ''
  const addressParts = address
    ?.split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  const areaLabel =
    addressParts && addressParts.length > 1
      ? addressParts.slice(-2).join(', ')
      : address
  const placeContext = [
    areaLabel ? `nasa ${areaLabel}` : null,
    category ? `matches the place type na hinahanap mo` : null,
  ].filter(Boolean).join(' and ')
  const proofPoints = [
    rating ? `rating na ${rating}${reviewCount ? ` with ${reviewCount}` : ''}` : null,
    openStatus ? openStatus.toLowerCase() : null,
    hours ? `listed hours na ${hours}` : null,
  ].filter(Boolean)

  const firstSentence = placeContext
    ? `Pasok ito sa "${queryContext}"${typeContext} dahil ${placeContext}.`
    : `Recommended ito based sa "${queryContext}" because it matches the place type and area you asked for.`
  const secondSentence = proofPoints.length > 0
    ? `Helpful din yung available map details like ${proofPoints.slice(0, 2).join(' and ')} para ma-check mo kung swak siya sa gala plan mo.`
    : 'Check details like rating, hours, and address to confirm if swak siya sa gala plan mo.'

  return `${firstSentence} ${secondSentence}`
}

function countSentences(value: string) {
  return value.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean).length
}

function isUsefulProvidedReason(reason: string) {
  const normalizedReason = reason.trim()
  const lowerReason = normalizedReason.toLowerCase()
  const hasTaglishCue = /\b(ito|siya|hanap|gala|swak|pasok|bagay|kung|mo|nasa|dahil|para)\b/i.test(normalizedReason)
  const hasGenericFiller =
    isGenericReasonText(normalizedReason) ||
    lowerReason.includes('perfect itong puntahan') ||
    lowerReason.includes('perfect ito puntahan')

  return normalizedReason.length >= 80 && countSentences(normalizedReason) >= 2 && hasTaglishCue && !hasGenericFiller
}

function getDisplayReason(place: AskAiMapPlace, query: string) {
  const reason = normalizeDisplayText(place.whyThisFits) ?? normalizeDisplayText(place.reason)

  if (!reason || !isUsefulProvidedReason(reason)) {
    return buildPlaceReasonFallback(place, query)
  }

  return rewritePlainReason(reason)
}

function getMiniReasonPreview(place: AskAiMapPlace, query: string) {
  return `AI ${getDisplayReason(place, query)}`
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

function getOpenStatusTone(place: AskAiMapPlace) {
  const openStatusText = normalizeDisplayText(place.optionalDetails?.openStatusText)

  if (!openStatusText) {
    return {
      label: 'Status unknown',
      className: 'bg-slate-100 text-slate-600',
      dotClassName: 'text-slate-400',
      isUnknown: true,
    }
  }

  if (/closed/i.test(openStatusText)) {
    return {
      label: openStatusText,
      className: 'bg-rose-50 text-rose-700',
      dotClassName: 'text-rose-500',
      isUnknown: false,
    }
  }

  return {
    label: openStatusText,
    className: 'bg-emerald-50 text-emerald-700',
    dotClassName: 'text-emerald-500',
    isUnknown: false,
  }
}

function getMapsHref(place: AskAiMapPlace) {
  const directUrl = normalizeDisplayText(place.googleMapsUrl) ?? normalizeDisplayText(place.googleMapsUri) ?? normalizeDisplayText(place.sourceUri)

  if (directUrl) {
    return directUrl
  }

  const placeId = normalizeDisplayText(place.placeId)

  if (placeId) {
    return `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(placeId)}`
  }

  return null
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
  const addressText = getDisplayAddress(place)

  return {
    id: place.id,
    name: getDisplayName(place),
    category: getDisplayCategory(place),
    area: addressText ?? 'Map-grounded pick',
    address: addressText,
    city: addressText ?? 'Map-grounded area',
    localArea: addressText,
    status: /closed/i.test(place.optionalDetails?.openStatusText ?? '') ? 'Closed' : normalizeDisplayText(place.optionalDetails?.openStatusText) ? 'Open' : 'Unknown',
    reason: displayReason,
    description: displayReason,
    badge: getDisplayCategory(place),
    googleMapsUrl: getMapsHref(place),
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
  const normalizedPlaces = useMemo<AskAiMapNormalizedPlace[]>(
    () =>
      places.map((place, index) => {
        const normalizedCoordinates = normalizePlaceCoordinates(place)

        return {
          ...place,
          displayIndex: index + 1,
          normalizedCoordinates,
          coordinates: normalizedCoordinates ?? place.coordinates,
        }
      }),
    [places]
  )
  const mapPlaces = useMemo(() => normalizedPlaces.map(mapPlaceToMapCard), [normalizedPlaces])
  const selectedPlace = useMemo(
    () => normalizedPlaces.find((place) => place.id === selectedPlaceId) ?? normalizedPlaces[0] ?? null,
    [normalizedPlaces, selectedPlaceId]
  )
  const headerSubtitle = useMemo(() => deriveHeaderAreaLabel(requestQuery || query), [query, requestQuery])
  const canSubmit = requestQuery.trim().length > 0 && !isSearching
  const mapCenter = userLocation
    ? [userLocation.latitude, userLocation.longitude] as const
    : deriveQueryMapCenter(requestQuery || query)
  const mapLayoutKey = `${normalizedPlaces.length}:${selectedPlaceId ?? 'none'}:${focusedPlaceId ?? 'none'}:${isPlaceDetailOpen ? 'modal-open' : 'modal-closed'}`
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

                  {!isSearching ? normalizedPlaces.map((place) => {
                    const isSelected = place.id === selectedPlaceId
                    const categoryText = getDisplayCategory(place)
                    const reviewBadgeText = getReviewBadgeText(place)
                    const shortLocationText = getShortLocationText(place)
                    const displayReason = getMiniReasonPreview(place, requestQuery || query)
                    const openStatusTone = getOpenStatusTone(place)

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
                        className={`flex h-[184px] w-[248px] snap-center shrink-0 flex-col rounded-[24px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,250,252,0.95))] text-left backdrop-blur-md transition ${
                          isSelected
                            ? 'scale-[1.01] border-[rgba(210,92,36,0.42)] p-3.5 shadow-[0_18px_38px_rgba(15,23,42,0.14)] ring-2 ring-[rgba(210,92,36,0.14)]'
                            : 'border-white/70 p-3.5 shadow-[0_10px_24px_rgba(15,23,42,0.08)] opacity-95 hover:border-[rgba(210,92,36,0.18)] hover:opacity-100'
                        }`}
                        onMouseEnter={() => setFocusedPlaceId(place.id)}
                        onMouseLeave={() => setFocusedPlaceId(selectedPlace?.id ?? null)}
                      >
                        <button
                          type="button"
                          onClick={() => openPlaceDetails(place.id)}
                          className="flex h-full w-full min-w-0 overflow-hidden text-left"
                        >
                          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                            <div className="flex min-w-0 items-start gap-3">
                              <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl text-[13px] font-black ${
                                isSelected
                                  ? 'bg-[linear-gradient(180deg,#d25c24_0%,#bf4c16_100%)] text-white shadow-[0_10px_20px_rgba(210,92,36,0.24)]'
                                  : 'bg-[rgba(210,92,36,0.12)] text-[#bf4c16]'
                              }`}>
                                {place.displayIndex}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-start gap-2">
                                  <h3 className="min-w-0 flex-1 truncate text-[15px] font-black leading-5 tracking-[-0.02em] text-slate-950">
                                    {getDisplayName(place)}
                                  </h3>
                                  <span className="shrink-0 pt-0.5 text-slate-400">›</span>
                                </div>
                                <p className="mt-1 truncate text-[12px] font-medium text-slate-600">
                                  {categoryText}
                                </p>
                              </div>
                            </div>

                            <div className="mt-3 flex min-w-0 flex-1 flex-col gap-2 overflow-hidden text-[12px]">
                              {reviewBadgeText ? (
                                <div className="flex min-w-0 items-center gap-2 text-amber-700">
                                  <AppIcon name="reviews" className="h-3.5 w-3.5 shrink-0" />
                                  <span className="min-w-0 truncate font-semibold">{reviewBadgeText}</span>
                                </div>
                              ) : null}
                              <div className={`inline-flex max-w-full items-center self-start overflow-hidden rounded-full px-2.5 py-1 ${openStatusTone.className}`}>
                                <span className={`mr-1.5 shrink-0 text-[10px] ${openStatusTone.dotClassName}`}>●</span>
                                <span className="min-w-0 truncate">{openStatusTone.label}</span>
                              </div>
                              {shortLocationText ? (
                                <div className="flex min-w-0 items-center gap-2 text-slate-600">
                                  <AppIcon name="place" className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                                  <span className="min-w-0 truncate font-medium">{shortLocationText}</span>
                                </div>
                              ) : null}
                              <div className="mt-auto min-w-0 overflow-hidden rounded-[16px] bg-[rgba(248,250,252,0.96)] px-3 py-2 text-slate-600">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span className="shrink-0 text-[13px] font-black text-[#d25c24]">AI</span>
                                  <span className="min-w-0 truncate font-medium">{displayReason.replace(/^AI\s+/, '')}</span>
                                </div>
                              </div>
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
        <div className="absolute inset-x-0 bottom-0 flex items-end">
        <section
          className="flex w-full max-h-[78dvh] flex-col overflow-hidden rounded-t-[24px] bg-white shadow-[0_-18px_48px_rgba(15,23,42,0.22)]"
          aria-modal="true"
          role="dialog"
          aria-label={`${getDisplayName(selectedPlace)} details`}
        >
          <div className="flex justify-center px-4 pt-3">
            <span className="h-1.5 w-14 rounded-full bg-slate-200" />
          </div>
          <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-4 pt-3">
            <div className="min-w-0">
              <h2 className="text-[22px] font-black tracking-[-0.03em] text-slate-950">
                {getDisplayName(selectedPlace)}
              </h2>
              <p className="mt-2 text-sm font-semibold text-slate-600">
                {getDisplayCategory(selectedPlace)}
              </p>
              {getReviewBadgeText(selectedPlace) ? (
                <p className="mt-1.5 text-sm font-semibold text-slate-700">
                  <span className="text-amber-600">★</span> {getReviewBadgeText(selectedPlace)}
                </p>
              ) : null}
              <p className={`mt-2 inline-flex items-center rounded-full px-2.5 py-1 text-sm font-semibold ${getOpenStatusTone(selectedPlace).className}`}>
                <span className={`mr-1.5 text-[10px] ${getOpenStatusTone(selectedPlace).dotClassName}`}>●</span>
                {getOpenStatusTone(selectedPlace).label}
                {getDisplayHours(selectedPlace) !== 'Hours not available' ? ` · ${getDisplayHours(selectedPlace)}` : ''}
              </p>
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

          <div className="flex-1 overflow-y-auto px-5 pb-[calc(24px+env(safe-area-inset-bottom,0px))] [-webkit-overflow-scrolling:touch]">
            <div className="rounded-[22px] border border-[rgba(210,92,36,0.12)] bg-[linear-gradient(180deg,rgba(255,248,243,0.96),rgba(255,255,255,0.94))] px-4 py-4">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#bf4c16]">Why this fits</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {getDisplayReason(selectedPlace, requestQuery || query)}
              </p>
            </div>

            <div className="mt-3 rounded-[22px] bg-slate-50 px-4 py-4">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">Address</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {getDisplayAddress(selectedPlace)}
              </p>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-[22px] bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">Hours</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {getDisplayHours(selectedPlace)}
                </p>
              </div>

              {getCoordinateChipText(selectedPlace) ? (
                <div className="rounded-[22px] bg-slate-50 px-4 py-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">Coords</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {getCoordinateChipText(selectedPlace)}
                  </p>
                </div>
              ) : null}
            </div>

            {getMapsHref(selectedPlace) ? (
              <a
                href={getMapsHref(selectedPlace) ?? undefined}
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
        </div>
      </div>,
      document.body
    ) : null}
    </>
  )
}

export default AskAiMapPage

