import type { PlaceDetailCardData } from '../types/appTypes'
import { fitDescription } from './seo'

/**
 * Meta description from the place's own words: its first sentence, then the budget and best time when they still fit.
 * Kept under 155 characters so search results show it whole.
 */
export function buildPlaceDescription(place: PlaceDetailCardData, areaName: string) {
  const text = (place.description ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  const firstSentence = text.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? text
  const named = firstSentence.toLowerCase().includes(place.name.toLowerCase())
  const hook = firstSentence
    ? named
      ? firstSentence
      : `${place.name}, ${areaName}: ${firstSentence}`
    : `${place.name} in ${areaName}${place.category ? `, a ${place.category.toLowerCase()} spot` : ''}.`

  const budget = place.budget_min == null ? null : Number(place.budget_min) <= 0 ? 'Free entry.' : `From ₱${Math.round(Number(place.budget_min)).toLocaleString('en-PH')} per head.`
  const bestTime = place.best_time_to_visit?.trim().replace(/[.\s]+$/, '')
  const facts = [budget, bestTime && bestTime.length <= 40 ? `Best ${/^(on|in|at|during|before|after)\b/i.test(bestTime) ? '' : 'time: '}${bestTime.charAt(0).toLowerCase()}${bestTime.slice(1)}.` : null]

  let description = fitDescription(hook)
  for (const fact of facts) {
    if (fact && description.length + fact.length + 1 <= 155 && !description.endsWith('…')) description = `${description} ${fact}`
  }
  return description
}

export function buildPlaceFaqSchema(place: PlaceDetailCardData) {
  const items: { '@type': 'Question'; name: string; acceptedAnswer: { '@type': 'Answer'; text: string } }[] = []

  const explicitFaqs = (place.faqs ?? []).filter((faq) => faq.question.trim() && faq.answer.trim())
  if (explicitFaqs.length > 0) {
    return {
      '@type': 'FAQPage',
      mainEntity: explicitFaqs.map((faq) => ({
        '@type': 'Question' as const,
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer' as const,
          text: faq.answer,
        },
      })),
    }
  }

  const goodFor = place.good_for ?? []
  if (place.description?.trim()) {
    const summaryText = place.description.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
    if (summaryText) {
      items.push({
        '@type': 'Question',
        name: `What is ${place.name} known for?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: summaryText.length > 220 ? `${summaryText.slice(0, 220).replace(/\s+\S*$/, '')}.` : summaryText,
        },
      })
    }
  }

  if (goodFor.length > 0) {
    items.push({
      '@type': 'Question',
      name: `Is ${place.name} good for a date?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: goodFor.some((g) => /date|romantic|night/i.test(g))
          ? `Yes, it is great for ${goodFor.filter((g) => /date|romantic|night/i.test(g)).join(', ')}.`
          : `It works best for ${goodFor.join(', ')}.`,
      },
    })
    items.push({
      '@type': 'Question',
      name: `Is ${place.name} family-friendly?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: goodFor.some((g) => /family|kid|children/i.test(g))
          ? 'Yes, it is recommended for family trips.'
          : `It is more suited for other vibes like ${goodFor.join(', ')}.`,
      },
    })
    items.push({
      '@type': 'Question',
      name: `Who is ${place.name} best for?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: `${place.name} is best for ${goodFor.join(', ')} plans.`,
      },
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
      acceptedAnswer: { '@type': 'Answer', text: `Starting budget is around PHP ${place.budget_min}.` },
    })
  }

  if (place.indoor_outdoor?.trim()) {
    items.push({
      '@type': 'Question',
      name: `Is ${place.name} indoor or outdoor?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: `${place.indoor_outdoor}.${place.weather_fit?.trim() ? ` It is ${place.weather_fit}.` : ''}`,
      },
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
