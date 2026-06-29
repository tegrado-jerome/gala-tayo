import type { AskAiMapPlace } from './askAiMapRuntime'

type NarrativeDiagnostics = {
  name: string
  subtitle?: string
  whyThisFits?: string
}

type NarrativeResult = {
  place: AskAiMapPlace
  diagnostics: NarrativeDiagnostics
}

type QueryIntent = {
  area?: string
  placeTypeKey: string
  placeTypeLabel: string
  shortTypeLabel: string
  activities: string[]
}

function cleanText(value: unknown) {
  if (typeof value !== 'string') {
    return undefined
  }

  const text = value
    .replace(/\s+/g, ' ')
    .trim()

  if (!text) {
    return undefined
  }

  if (/google maps (?:result|grounding|context)|map-grounded|grounded option|matched your request|returned by google maps/i.test(text)) {
    return undefined
  }

  return text
}

function normalizeComparableText(value: string | undefined) {
  if (!value) {
    return ''
  }

  return value
    .toLowerCase()
    .replace(/[""'`]/g, '')
    .replace(/[.,!?;:()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isSameText(a: string | undefined, b: string | undefined) {
  return Boolean(a && b && normalizeComparableText(a) === normalizeComparableText(b))
}

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function normalizeArea(value: string) {
  return value
    .replace(/\b(?:city|province|philippines)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function inferQueryIntent(query: string, categoryText?: string): QueryIntent {
  const normalizedQuery = cleanText(query)?.toLowerCase() ?? ''
  const areaMatch = normalizedQuery.match(/\b(?:in|near|around|within|at)\s+([a-z0-9][a-z0-9 .,'-]*)$/i)
  const area = areaMatch ? toTitleCase(normalizeArea(areaMatch[1])) : undefined

  const catalog = [
    {
      key: 'mall',
      test: /\bmalls?\b|\bshopping (?:center|centre|mall)\b/i,
      placeTypeLabel: 'mall',
      shortTypeLabel: 'mall',
      activities: ['food', 'shopping', 'casual hangouts'],
    },
    {
      key: 'samgyup',
      test: /\bsamgyup\b|\bsamgyeopsal\b|\bkorean\b/i,
      placeTypeLabel: 'Korean restaurant',
      shortTypeLabel: 'Korean restaurant',
      activities: ['Korean food', 'samgyup', 'group meals'],
    },
    {
      key: 'cafe',
      test: /\bcafes?\b|\bcoffee\b/i,
      placeTypeLabel: 'cafe',
      shortTypeLabel: 'coffee spot',
      activities: ['coffee', 'snacks', 'casual meetups'],
    },
    {
      key: 'restaurant',
      test: /\brestaurant\b|\bkainan\b|\bfood\b/i,
      placeTypeLabel: 'restaurant',
      shortTypeLabel: 'restaurant',
      activities: ['meals', 'dine-in'],
    },
    {
      key: 'generic',
      test: /.*/i,
      placeTypeLabel: categoryText?.trim() || 'place',
      shortTypeLabel: categoryText?.trim() || 'place',
      activities: ['exploring the area'],
    },
  ]

  const matched = catalog.find((entry) => entry.test.test(normalizedQuery)) ?? catalog[catalog.length - 1]

  return {
    area,
    placeTypeKey: matched.key,
    placeTypeLabel: matched.placeTypeLabel,
    shortTypeLabel: matched.shortTypeLabel,
    activities: matched.activities,
  }
}

function buildWhyThisFits(_placeName: string, intent: QueryIntent, categoryText?: string): string {
  const areaSuffix = intent.area ? ` in ${intent.area}` : ''

  switch (intent.placeTypeKey) {
    case 'mall':
      return `A mall option${areaSuffix}, good for food, shopping, and casual hangouts.`
    case 'samgyup':
      return `A Korean restaurant option${areaSuffix} that fits your samgyup search.`
    case 'cafe':
      return `A coffee spot${areaSuffix} for a quick drink or casual meetup.`
    case 'restaurant':
      return `A restaurant option${areaSuffix} for good food in the area.`
    default: {
      const placeType = categoryText?.toLowerCase() || 'place'
      return `A ${placeType} option${areaSuffix} that matches your search.`
    }
  }
}

function extractLocationLabel(addressText: string | undefined, area: string | undefined) {
  if (area) {
    return area
  }

  if (!addressText) {
    return undefined
  }

  const segments = addressText
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean)

  if (segments.length === 0) {
    return undefined
  }

  const preferred = segments.find((segment) => !/^\d/.test(segment)) ?? segments[segments.length - 1]
  return preferred || undefined
}

function buildFactualSubtitle(place: AskAiMapPlace, intent: QueryIntent) {
  const category = cleanText(place.optionalDetails?.categoryText)
  const location = extractLocationLabel(place.optionalDetails?.addressText, intent.area)

  if (category && location) {
    return `${category} · ${location}`
  }

  if (category) {
    return category
  }

  if (location) {
    return location
  }

  return undefined
}

export function finalizePlaceNarrative(place: AskAiMapPlace, query: string, _rawAnswerText: string): NarrativeResult {
  const intent = inferQueryIntent(query, place.optionalDetails?.categoryText)
  const parsedSubtitle = cleanText(place.subtitle)
  const parsedDescription = cleanText(place.description) ?? cleanText(place.summary)
  const parsedWhyThisFits = cleanText(place.whyThisFits)
  const fallbackSubtitle = buildFactualSubtitle(place, intent)

  let subtitle = parsedSubtitle
  if (!subtitle || subtitle.length > 110 || isSameText(subtitle, parsedDescription)) {
    subtitle = fallbackSubtitle
  }

  const description = parsedDescription && !isSameText(parsedDescription, subtitle)
    ? parsedDescription
    : undefined

  const whyThisFits = parsedWhyThisFits || buildWhyThisFits(place.name, intent, place.optionalDetails?.categoryText)
  const reason = !isSameText(place.reason, whyThisFits)
    ? (parsedDescription ?? whyThisFits)
    : whyThisFits

  const finalPlace: AskAiMapPlace = {
    ...place,
    reason,
    subtitle,
    description,
    summary: description,
    whyThisFits,
  }

  const diagnostics: NarrativeDiagnostics = {
    name: finalPlace.name,
    subtitle: finalPlace.subtitle,
    whyThisFits: finalPlace.whyThisFits,
  }

  return { place: finalPlace, diagnostics }
}
