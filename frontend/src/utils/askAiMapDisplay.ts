import type { AskAiMapPlace } from './askAiMapRuntime'

export type AskAiMapDisplayPlace = {
  title: string
  category: string
  address: string
  ratingText: string
  reviewCountText: string
  openStatusText: string
  hoursLines: string[]
  phoneText: string
  nearbyItems: string[]
  parkingItems: string[]
  accessibilityItems: string[]
  whyThisFits: string
  googleMapsUrl?: string
  sourceUri?: string
  distanceKm: number | null
  openingHoursSummary: string | null
  isCoordinateVerified: boolean
  coordinateTrustLabel: string | null
}

function sanitizeDisplayText(raw: string | undefined | null): string {
  if (!raw) return ''

  return raw
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*/g, '')
    .replace(/_/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .replace(/\n+/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/,\s*,/g, ',')
    .trim()
}

function looksLikeTextBlob(text: string): boolean {
  const lower = text.toLowerCase()
  const markers = [
    'business status',
    'opening hours',
    'nearby landmarks',
    'parking',
    'accessibility',
    'open now',
    'address',
    'location',
    'rating',
    'phone',
  ]

  return markers.filter((marker) => lower.includes(`**${marker}**`) || lower.includes(`${marker}:`)).length >= 2
}

function extractFieldFromTextBlob(rawText: string, fieldNames: string[]): string | null {
  const sanitized = sanitizeDisplayText(rawText)

  for (const name of fieldNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const patterns = [
      new RegExp(`\\*\\*${escaped}\\*\\*\\s*:?\\s*(.+?)(?:\\*\\*|$)`, 'i'),
      new RegExp(`${escaped}\\s*:?\\s*(.+?)(?:\\n|$)`, 'i'),
    ]

    for (const pattern of patterns) {
      const match = sanitized.match(pattern)

      if (match?.[1]) {
        const value = match[1]
          .replace(/\*\*/g, '')
          .replace(/\*/g, '')
          .trim()

        if (value) return value
      }
    }
  }

  return null
}

function extractPreambleFromTextBlob(rawText: string): string | null {
  const sanitized = sanitizeDisplayText(rawText)
  const match = sanitized.match(/^(.+?)\s*\*\*[^*]+\*\*\s*:/)

  if (match?.[1]) {
    const preamble = sanitizeDisplayText(match[1])

    return preamble || null
  }

  return null
}

function detectOpenStatus(raw: string | undefined | null): 'Open' | 'Closed' | '' {
  if (!raw) return ''

  let checkText = sanitizeDisplayText(raw).toLowerCase()

  if (!checkText) return ''

  if (looksLikeTextBlob(checkText)) {
    const extracted = extractFieldFromTextBlob(checkText, [
      'Open Now',
      'Open Status',
      'Business Status',
      'Status',
      'Open',
    ])

    if (extracted) checkText = extracted.toLowerCase()
  }

  if (/^(yes|true|y|open|open now|opened|operational)$/i.test(checkText.trim())) return 'Open'

  if (/^(no|false|n|closed|closed now|temporarily closed|permanently closed)$/i.test(checkText.trim())) return 'Closed'

  if (/\bopen\b/.test(checkText) && !/\bclosed\b/.test(checkText)) return 'Open'

  if (/\bclosed\b/.test(checkText)) return 'Closed'

  return ''
}

function cleanCategory(raw: string | undefined | null): string {
  const sanitized = sanitizeDisplayText(raw)

  if (!sanitized) return 'Place'

  if (looksLikeTextBlob(sanitized)) {
    const extracted =
      extractFieldFromTextBlob(sanitized, ['Category', 'Type', 'Business Type']) ??
      extractPreambleFromTextBlob(sanitized)

    if (extracted) return extracted || 'Place'
  }

  return sanitized || 'Place'
}

function cleanAddress(raw: string | undefined | null): string {
  const sanitized = sanitizeDisplayText(raw)

  if (!sanitized) return 'Address not available'

  if (looksLikeTextBlob(sanitized)) {
    const extracted = extractFieldFromTextBlob(sanitized, ['Address', 'Location', 'Located At'])

    if (extracted) return extracted
  }

  const cleaned = sanitized
    .replace(/\d+\.\d+\s*,\s*\d+\.\d+/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/,\s*,/g, ',')
    .trim()

  return cleaned || 'Address not available'
}

function cleanRating(raw: string | undefined | null): string {
  const sanitized = sanitizeDisplayText(raw)

  if (!sanitized) return ''

  if (looksLikeTextBlob(sanitized)) {
    const extracted = extractFieldFromTextBlob(sanitized, ['Rating', 'Star Rating', 'Google Rating'])

    if (extracted) return extracted
  }

  return sanitized
}

function cleanReviewCount(raw: string | undefined | null): string {
  const sanitized = sanitizeDisplayText(raw)

  if (!sanitized) return ''

  if (looksLikeTextBlob(sanitized)) {
    const extracted = extractFieldFromTextBlob(sanitized, ['Review Count', 'Reviews', 'User Ratings'])

    if (extracted) return extracted
  }

  return sanitized
}

function cleanHours(raw: string | undefined | null): string[] {
  const sanitized = sanitizeDisplayText(raw)

  if (!sanitized) return []

  if (looksLikeTextBlob(sanitized)) {
    const extracted = extractFieldFromTextBlob(sanitized, ['Opening Hours', 'Hours', 'Operating Hours', 'Schedule'])

    if (extracted) {
      return extracted
        .split(/[,;]/)
        .map((segment) => sanitizeDisplayText(segment))
        .filter(Boolean)
    }
  }

  return sanitized
    .split(/[,;]/)
    .map((segment) => sanitizeDisplayText(segment))
    .filter(Boolean)
}

function extractListFromTextBlob(rawText: string, fieldNames: string[]): string[] {
  if (!rawText) return []

  const extracted = extractFieldFromTextBlob(rawText, fieldNames)

  if (!extracted) return []

  return extracted
    .split(/[,;]/)
    .map((segment) => sanitizeDisplayText(segment))
    .filter(Boolean)
}

function isTrustedCoordinateSource(source: unknown) {
  return source === 'geoapify' || source === 'maps_grounding' || source === 'places_metadata'
}

export function toDisplayPlace(place: AskAiMapPlace, _query: string): AskAiMapDisplayPlace {
  const details = place.optionalDetails ?? {}
  const placeRecord = place as AskAiMapPlace & Record<string, unknown>
  const coordinateRecord =
    place.coordinates && typeof place.coordinates === 'object' && !Array.isArray(place.coordinates)
      ? place.coordinates as Record<string, unknown>
      : null
  const coordinateSource =
    coordinateRecord?.source ??
    (typeof placeRecord.coordinateSource === 'string' ? placeRecord.coordinateSource : undefined)
  const isCoordinateVerified =
    place.coordinateStatus === 'geoapify_coordinate_fill' ||
    coordinateRecord?.verified === true ||
    coordinateRecord?.trusted === true ||
    isTrustedCoordinateSource(coordinateSource)

  const allRawFields = [
    details.categoryText,
    details.addressText,
    details.openStatusText,
    details.hoursText,
    details.ratingText,
    details.reviewCountText,
    place.reason,
    place.whyThisFits,
  ]
    .filter(Boolean)
    .join('\n')

  const category = cleanCategory(details.categoryText)
  const address = cleanAddress(details.addressText)
  const ratingText = cleanRating(details.ratingText)
  const reviewCountText = cleanReviewCount(details.reviewCountText)
  const openStatusText = detectOpenStatus(details.openStatusText)
  const hoursLines = cleanHours(details.hoursText)

  const nearbyItems = extractListFromTextBlob(allRawFields, [
    'Nearby Landmarks',
    'Nearby',
    'Nearby Landmarks & Areas',
    'Landmarks',
  ])

  const parkingItems = extractListFromTextBlob(allRawFields, [
    'Parking',
    'Parking Info',
    'Parking Options',
  ])

  const accessibilityItems = extractListFromTextBlob(allRawFields, [
    'Accessibility',
    'Accessibility Notes',
    'Wheelchair Access',
  ])

  const phoneText = sanitizeDisplayText(
    extractFieldFromTextBlob(allRawFields, ['Phone', 'Contact', 'Phone Number']) ?? ''
  )

  const whyThisFits = sanitizeDisplayText(place.whyThisFits || place.reason)
  const coordinateTrustLabel = isCoordinateVerified ? 'Map pin verified' : null

  return {
    title: sanitizeDisplayText(place.name) || 'Unknown place',
    category,
    address,
    ratingText,
    reviewCountText,
    openStatusText,
    hoursLines,
    phoneText,
    nearbyItems,
    parkingItems,
    accessibilityItems,
    whyThisFits: whyThisFits || 'Recommended based on your map search.',
    googleMapsUrl:
      place.googleMapsUrl ||
      place.googleMapsUri ||
      (typeof (place as Record<string, unknown>).sourceUri === 'string'
        ? ((place as Record<string, unknown>).sourceUri as string)
        : undefined) ||
      (typeof (place as Record<string, unknown>).mapsUrl === 'string'
        ? ((place as Record<string, unknown>).mapsUrl as string)
        : undefined),
    sourceUri: typeof (place as Record<string, unknown>).sourceUri === 'string'
      ? ((place as Record<string, unknown>).sourceUri as string)
      : undefined,
    distanceKm: typeof place.distanceKm === 'number' && Number.isFinite(place.distanceKm) ? place.distanceKm : null,
    openingHoursSummary: place.openingHoursSummary || null,
    isCoordinateVerified,
    coordinateTrustLabel,
  }
}

export function getShortAreaText(display: AskAiMapDisplayPlace): string {
  const parts = display.address
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean)

  const trimmedParts =
    parts.length > 1 && parts[parts.length - 1]?.toLowerCase() === 'philippines'
      ? parts.slice(0, -1)
      : parts

  if (trimmedParts.length >= 2) {
    return trimmedParts.slice(-2).join(', ')
  }

  return display.address
}

export function getDisplayReviewBadge(display: AskAiMapDisplayPlace): string | null {
  if (display.ratingText && display.reviewCountText) {
    return `${display.ratingText} · ${display.reviewCountText}`
  }

  return display.ratingText || display.reviewCountText || null
}

export function getOpenStatusChip(display: AskAiMapDisplayPlace) {
  const label = display.openStatusText

  if (label === 'Closed') {
    return {
      label: 'Closed' as const,
      tone: 'closed' as const,
      className: 'bg-rose-50 text-rose-700',
      dotClassName: 'text-rose-500',
    }
  }

  if (label === 'Open') {
    return {
      label: 'Open now' as const,
      tone: 'open' as const,
      className: 'bg-[var(--primary-soft)] text-[var(--accent-deep)]',
      dotClassName: 'text-[var(--accent)]',
    }
  }

  return null
}

export function formatDistanceKm(distanceKm: number | null | undefined): string {
  if (typeof distanceKm !== 'number' || !Number.isFinite(distanceKm)) {
    return ''
  }

  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m away`
  }

  if (distanceKm < 10) {
    return `${distanceKm.toFixed(1)} km away`
  }

  return `${Math.round(distanceKm)} km away`
}

export function formatReviewCount(count: number | undefined): string {
  if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) {
    return ''
  }

  if (count >= 1000) {
    const k = count / 1000
    return k >= 10 ? `${Math.round(k)}k reviews` : `${k.toFixed(1)}k reviews`
  }

  return `${count} reviews`
}

export function getDisplayRatingText(display: AskAiMapDisplayPlace): string {
  return display.ratingText || ''
}

export function getDisplayReviewCountText(display: AskAiMapDisplayPlace): string {
  return display.reviewCountText || ''
}
