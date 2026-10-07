import { isRainFriendly } from './saanTayo.ts'

/*
 * Vibes: what people go out for (a beach, a view, a food trip), used instead of place types in
 * every browse UI. Each vibe reads only fields the compact place list already has (name, category,
 * goodFor), so lists filter in the browser with no extra API call. Kept free of JSON/data imports
 * so node:test can run it.
 */

export type VibePlace = { name: string; category: string | null; goodFor: string[] }

export const VIBE_IDS = ['beach', 'nature', 'views', 'heritage', 'adventure', 'food-trip', 'rainy-day'] as const
export type VibeId = (typeof VIBE_IDS)[number]

type VibeDef = {
  id: VibeId
  label: string
  /** Heading for the filtered list; pages add "in <place>". */
  title: string
  /** One line under the heading, tour-guide style. */
  blurb: string
  matches: (place: VibePlace) => boolean
}

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const nameHas = (place: VibePlace, pattern: RegExp) => pattern.test(fold(place.name))
const hasTag = (place: VibePlace, tags: string[]) => place.goodFor.some((tag) => tags.includes(tag))
const isCategory = (place: VibePlace, categories: string[]) => categories.includes((place.category ?? '').trim().toLowerCase())

// Sea and sand: beaches, coves, sandbars and island trips. A museum or old town named "Island" is not a beach day.
const BEACH_WORDS = /\b(beach|beaches|cove|sandbar|islands?|isla|islas|islet|boracay)\b/
const NOT_BEACH = ['heritage', 'museum', 'food', 'cafe', 'nightlife']
// Somewhere up high or out in the open with a view to stop for.
const VIEW_WORDS = /\b(views?|viewpoint|view deck|lookout|peak|hills?|in the sky|lighthouse|terraces|mount|mt|mountain|summit|sunset|windmills)\b/
const NOT_VIEWS = ['museum', 'food', 'cafe', 'nightlife']

const isBeach = (place: VibePlace) => BEACH_WORDS.test(fold(place.name)) && !isCategory(place, NOT_BEACH)

const VIBES: VibeDef[] = [
  {
    id: 'beach',
    label: 'Beach',
    title: 'Beaches and islands',
    blurb: 'White sand, clear water and island hops. Pack the sunscreen!',
    matches: isBeach,
  },
  {
    id: 'nature',
    label: 'Nature',
    title: 'Nature trips',
    blurb: 'Waterfalls, lakes, caves and cool mountain air. Time to go outside!',
    // Falls, lakes, forests and mountains; beaches have their own vibe.
    matches: (place) => hasTag(place, ['Nature Escape', 'Nature Walk', 'Picnic']) && !isBeach(place) && !isCategory(place, ['museum']),
  },
  {
    id: 'views',
    label: 'Views',
    title: 'Places with a view',
    blurb: 'Peaks, lookouts and lighthouses worth the climb. Charge your phone!',
    matches: (place) => nameHas(place, VIEW_WORDS) && !isCategory(place, NOT_VIEWS),
  },
  {
    id: 'heritage',
    label: 'Heritage',
    title: 'Heritage and history',
    blurb: 'Old forts, stone churches and streets full of stories.',
    matches: (place) => isCategory(place, ['heritage']) || hasTag(place, ['History Trip', 'Heritage']),
  },
  {
    id: 'adventure',
    label: 'Adventure',
    title: 'Adventures',
    blurb: 'Dive, hike, raft and climb. For the brave and the restless!',
    matches: (place) => hasTag(place, ['Adventure']),
  },
  {
    id: 'food-trip',
    label: 'Food trip',
    title: 'Food trips',
    blurb: 'Famous eats, markets and food towns worth the drive. Come hungry!',
    matches: (place) => isCategory(place, ['food', 'cafe']) || hasTag(place, ['Food Trip', 'Foodie']),
  },
  {
    id: 'rainy-day',
    label: 'Rainy day',
    title: 'Rainy day picks',
    blurb: 'Museums, cafes and indoor fun for when the sky opens up.',
    // Same rain rule as Pick for me (tagged for rainy days, or an indoor kind of place with nothing outdoorsy
    // about it), plus aquariums, which are filed as activities.
    matches: (place) => isRainFriendly(place) || nameHas(place, /\b(aquarium|ocean park)\b/),
  },
]

export const vibes: ReadonlyArray<Omit<VibeDef, 'matches'>> = VIBES.map(({ id, label, title, blurb }) => ({ id, label, title, blurb }))

export function parseVibe(value: string | null | undefined): VibeId | null {
  const id = (value ?? '').trim().toLowerCase()
  return (VIBE_IDS as readonly string[]).includes(id) ? (id as VibeId) : null
}

export function getVibe(id: VibeId) {
  return vibes.find((vibe) => vibe.id === id) ?? vibes[0]
}

export function fitsVibe(place: VibePlace, id: VibeId) {
  return VIBES.find((vibe) => vibe.id === id)?.matches(place) ?? false
}

/** Places that fit the vibe, in the order given (the compact list is already best first). */
export function filterByVibe<T extends VibePlace>(places: T[], id: VibeId) {
  return places.filter((place) => fitsVibe(place, id))
}

/** Vibes with at least `min` places in the list, in display order: chips never open an empty list. */
export function vibesWithPlaces(places: VibePlace[], min = 1) {
  return vibes.filter((vibe) => places.filter((place) => fitsVibe(place, vibe.id)).length >= min)
}

// Old place-type links (?category=food, /places/categories/food) land on the closest vibe.
// Hotel, cinema and mall have no gala-worthy places, so they go to the plain list.
const CATEGORY_TO_VIBE: Record<string, VibeId> = {
  food: 'food-trip',
  cafe: 'food-trip',
  nightlife: 'food-trip',
  park: 'nature',
  activity: 'adventure',
  heritage: 'heritage',
  museum: 'rainy-day',
}

export function vibeForCategory(category: string | null | undefined): VibeId | null {
  return CATEGORY_TO_VIBE[(category ?? '').trim().toLowerCase()] ?? null
}

/** Path of a list filtered to a vibe: `/places?vibe=beach` or `/places/baguio?vibe=beach`. */
export function vibeHref(basePath: string, id: VibeId | null, page = 1) {
  const params = new URLSearchParams()
  if (id) params.set('vibe', id)
  if (page > 1) params.set('page', String(page))
  const query = params.toString()
  return query ? `${basePath}?${query}` : basePath
}
