import type { PlaceDetailCardData } from '../types/appTypes'

export function buildPlaceDescription(place: PlaceDetailCardData, areaName: string) {
  const parts: string[] = [`Explore ${place.name} in ${areaName}.`]
  if (place.good_for && place.good_for.length > 0) {
    parts.push(`Best for ${place.good_for.slice(0, 3).join(', ')}.`)
  }
  if (place.budget_min != null) {
    parts.push(`Budget starts at ₱${place.budget_min}.`)
  }
  if (place.description?.trim()) {
    const shortDesc = place.description.replace(/<[^>]*>/g, '').slice(0, 120).replace(/\s+\S*$/, '')
    if (shortDesc.length > 20) parts.push(shortDesc + '.')
  }
  return parts.join(' ') + ' See location, photos, reviews, and add to your gala plan.'
}

export function buildPlaceFaqSchema(place: PlaceDetailCardData) {
  const items: { '@type': 'Question'; name: string; acceptedAnswer: { '@type': 'Answer'; text: string } }[] = []

  const goodFor = place.good_for ?? []
  if (goodFor.length > 0) {
    items.push({
      '@type': 'Question',
      name: `Is ${place.name} good for a date?`,
      acceptedAnswer: { '@type': 'Answer', text: goodFor.some((g) => /date|romantic|night/i.test(g)) ? `Yes, it is great for ${goodFor.filter((g) => /date|romantic|night/i.test(g)).join(', ')}.` : `It works best for ${goodFor.join(', ')}.` },
    })
    items.push({
      '@type': 'Question',
      name: `Is ${place.name} family-friendly?`,
      acceptedAnswer: { '@type': 'Answer', text: goodFor.some((g) => /family|kid|children/i.test(g)) ? 'Yes, it is recommended for family trips.' : 'It is more suited for other vibes like ' + goodFor.join(', ') + '.' },
    })
  }

  if (place.best_time_to_visit?.trim()) {
    items.push({
      '@type': 'Question',
      name: `What is the best time to visit ${place.name}?`,
      acceptedAnswer: { '@type': 'Answer', text: place.best_time_to_visit },
    })
  }

  if (place.budget_min != null) {
    items.push({
      '@type': 'Question',
      name: `How much budget is needed for ${place.name}?`,
      acceptedAnswer: { '@type': 'Answer', text: `Starting budget is around ₱${place.budget_min}.` },
    })
  }

  if (place.indoor_outdoor?.trim()) {
    items.push({
      '@type': 'Question',
      name: `Is ${place.name} indoor or outdoor?`,
      acceptedAnswer: { '@type': 'Answer', text: `${place.indoor_outdoor}.${place.weather_fit?.trim() ? ' It is ' + place.weather_fit + '.' : ''}` },
    })
  }

  if (place.commute_access?.trim()) {
    items.push({
      '@type': 'Question',
      name: `How do I get to ${place.name}?`,
      acceptedAnswer: { '@type': 'Answer', text: place.commute_access },
    })
  }

  if (place.parking_info?.trim()) {
    items.push({
      '@type': 'Question',
      name: `Is parking available at ${place.name}?`,
      acceptedAnswer: { '@type': 'Answer', text: place.parking_info },
    })
  }

  if (place.nearby_context?.trim()) {
    items.push({
      '@type': 'Question',
      name: `What is near ${place.name}?`,
      acceptedAnswer: { '@type': 'Answer', text: place.nearby_context },
    })
  }

  if (items.length === 0) return null

  return {
    '@type': 'FAQPage',
    mainEntity: items,
  }
}

export function getStructuredPlaceType(category: string | null | undefined) {
  const normalizedCategory = category?.trim().toLowerCase() || ''

  if (normalizedCategory.includes('museum')) return 'Museum'
  if (normalizedCategory.includes('park') || normalizedCategory.includes('parke')) return 'Park'
  if (normalizedCategory.includes('heritage') || normalizedCategory.includes('tourist')) return 'TouristAttraction'
  if (
    normalizedCategory.includes('cafe') ||
    normalizedCategory.includes('kainan') ||
    normalizedCategory.includes('mall') ||
    normalizedCategory.includes('nightlife') ||
    normalizedCategory.includes('cinema') ||
    normalizedCategory.includes('arcade')
  ) {
    return 'LocalBusiness'
  }

  return 'Place'
}
