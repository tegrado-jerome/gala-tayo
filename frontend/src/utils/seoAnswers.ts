import { formatPeso } from './galaPlanTrip'

export type Faq = { question: string; answer: string }

/** "Free to ₱720 per head" from places' starting budgets; a budget of 0 means free entry, null means unknown. */
export function describeBudgetRange(budgets: Array<number | null | undefined>) {
  const known = budgets.filter((value): value is number => typeof value === 'number' && value >= 0)
  if (!known.length) return null
  const min = Math.min(...known)
  const max = Math.max(...known)
  if (max === 0) return 'Free'
  return min === max ? `${formatPeso(min)} per head` : `${formatPeso(min)} to ${formatPeso(max)} per head`
}

export function faqJsonLd(faqs: Faq[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({ '@type': 'Question', name: faq.question, acceptedAnswer: { '@type': 'Answer', text: faq.answer } })),
  }
}

// Place tags in plain words, for "Best for" lines built from the places on a page.
const GOOD_FOR_PHRASES: Record<string, string> = {
  'Barkada Hangout': 'group trips',
  'Group Dining': 'group trips',
  'Family Trip': 'family days',
  'Casual Date': 'dates',
  'Date Night': 'dates',
  'Photo Walk': 'photo walks',
  'Nature Escape': 'nature escapes',
  'Food Trip': 'food trips',
  'Solo Trip': 'solo trips',
  'History Trip': 'history lovers',
  Adventure: 'adventure seekers',
  'Museum Visit': 'museum days',
  'Rainy Day': 'rainy days',
  Nightlife: 'nights out',
}

/** "Barkada trips, family days and dates": the three most common tags across the listed places. */
export function describeBestFor(tagLists: string[][]) {
  const counts = new Map<string, number>()
  for (const tags of tagLists) {
    for (const phrase of new Set(tags.map((tag) => GOOD_FOR_PHRASES[tag]).filter(Boolean))) counts.set(phrase, (counts.get(phrase) ?? 0) + 1)
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([phrase]) => phrase)
  if (!top.length) return null
  const text = top.length > 1 ? `${top.slice(0, -1).join(', ')} and ${top.at(-1)}` : top[0]
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`
}
