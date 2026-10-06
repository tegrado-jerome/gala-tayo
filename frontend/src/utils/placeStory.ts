/** Text for the 9:16 place story card. Pure, so it can be tested without a canvas. */

export type PlaceStoryInput = {
  name: string
  slug: string
  city?: string | null
  area?: string | null
  category?: string | null
  place_history?: string | null
  description?: string | null
}

export type PlaceStoryText = {
  kicker: string
  name: string
  /** "Did you know?" when the line comes from the place's history, otherwise null. */
  lineLabel: string | null
  line: string | null
  link: string
  fileName: string
}

const LINE_MAX = 150

function clean(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function sentences(text: string | null | undefined) {
  return clean(text)
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"‘'])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

export function firstSentence(text: string | null | undefined) {
  return sentences(text)[0] ?? ''
}

/** Cuts at a word boundary and adds an ellipsis when the text is longer than `max`. */
export function clip(text: string, max: number) {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:–—-]+$/, '')}…`
}

// A sentence reads as a fact when it has a year or a superlative/origin word, and no visiting advice.
const FACT_PATTERN = /\b(1[5-9]\d\d|20[0-2]\d)\b|\b(oldest|built|founded|established|largest|longest|tallest|century|declared|heritage site|named after)\b/i
const ADVICE_PATTERN = /\b(wear|bring|check|confirm|call|visit early|go early|allow|plan|book|avoid|should|deserves|best to)\b/i

export function pickStoryLine(place: Pick<PlaceStoryInput, 'place_history' | 'description'>) {
  const history = firstSentence(place.place_history)
  if (history) return { label: 'Did you know?', text: clip(history, LINE_MAX) }
  const fact = sentences(place.description)
    .slice(1)
    .find((sentence) => sentence.length >= 40 && sentence.length <= LINE_MAX && FACT_PATTERN.test(sentence) && !ADVICE_PATTERN.test(sentence))
  if (fact) return { label: 'Did you know?', text: fact }
  const about = firstSentence(place.description)
  if (about) return { label: null, text: clip(about, LINE_MAX) }
  return null
}

/** `galatayo.app/place/fort-santiago`: the short form that redirects to the canonical place page. */
export function shortPlaceLink(origin: string, slug: string) {
  return `${origin.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/place/${slug}`
}

export function buildPlaceStoryText(place: PlaceStoryInput, origin: string): PlaceStoryText {
  const line = pickStoryLine(place)
  const where = clean(place.city) || clean(place.area)
  const kicker = [clean(place.category), where].filter(Boolean).join(' · ').toUpperCase()
  const safeSlug = place.slug.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'place'
  return {
    kicker,
    name: clean(place.name),
    lineLabel: line?.label ?? null,
    line: line?.text ?? null,
    link: shortPlaceLink(origin, place.slug),
    fileName: `galatayo-${safeSlug}-story.png`,
  }
}

/** "Photo: Jane Doe · CC BY-SA 4.0". Null when the photo has no credit to show. */
export function photoCreditLine(credit: { author?: string | null; license?: string | null } | null | undefined) {
  const author = clean(credit?.author)
  if (!author) return null
  const license = clean(credit?.license)
  return clip(`Photo: ${author}${license ? ` · ${license}` : ''}`, 70)
}
