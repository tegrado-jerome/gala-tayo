import { findRainWindow, formatHour, isOutdoorPlace, isRainCode, isStormCode, type CurrentWeather, type HourForecast } from './weather.ts'

/*
 * Pure pick logic for the "Saan tayo?" deck: which places fit the area, vibe and live weather,
 * dealing 3 and swapping one without repeats. Kept free of JSON/data imports so node:test can run it.
 */

export type PickPlace = {
  slug: string
  name: string
  category: string | null
  areaSlug: string
  goodFor: string[]
  budgetMin: number | null
}

export const PICK_COUNT = 3
export const TIPID_MAX = 300

export const VIBES = [
  { value: 'any', label: 'Anything', tags: [] },
  { value: 'date', label: 'Date', tags: ['Casual Date', 'Date Night', 'Anniversary', 'Special Occasion'] },
  { value: 'barkada', label: 'Friends', tags: ['Barkada Hangout', 'Group Dining', 'Barkada Dinner', 'Nightlife'] },
  { value: 'family', label: 'Family', tags: ['Family Trip', 'Family Dinner'] },
  { value: 'solo', label: 'Solo', tags: ['Solo Trip', 'Chill', 'Quiet Visit'] },
  { value: 'tipid', label: 'Budget', tags: [] },
] as const

export type Vibe = (typeof VIBES)[number]['value']

const RAIN_TAGS = /rainy day|indoor/i
const INDOOR_CATEGORIES = /^(museum|mall|cafe|food|nightlife)$/i

/** Good when it rains: tagged for rainy days or indoors, or an indoor-type category with nothing outdoorsy about it. */
export function isRainFriendly(place: Pick<PickPlace, 'category' | 'name' | 'goodFor'>) {
  if (place.goodFor.some((tag) => RAIN_TAGS.test(tag))) return true
  const traits = { category: place.category, name: place.name, tags: place.goodFor.map((name) => ({ name })) }
  return INDOOR_CATEGORIES.test(place.category?.trim() ?? '') && !isOutdoorPlace(traits)
}

export function fitsVibe(place: Pick<PickPlace, 'goodFor' | 'budgetMin'>, vibe: Vibe) {
  if (vibe === 'any') return true
  if (vibe === 'tipid') return place.budgetMin !== null && place.budgetMin <= TIPID_MAX
  const tags: readonly string[] = VIBES.find((option) => option.value === vibe)?.tags ?? []
  return place.goodFor.some((tag) => tags.includes(tag))
}

export type PoolNote = 'no-indoor' | 'no-vibe' | null

/**
 * Places in the area that fit the vibe (and are rain-friendly when it rains). If that leaves fewer
 * than 3, it relaxes the rain rule first, then the vibe, and says which via `note`.
 */
export function buildPool<T extends PickPlace>(areaPlaces: T[], { vibe, rainy }: { vibe: Vibe; rainy: boolean }) {
  const byVibe = areaPlaces.filter((place) => fitsVibe(place, vibe))
  const attempts: Array<{ places: T[]; note: PoolNote }> = [
    { places: rainy ? byVibe.filter(isRainFriendly) : byVibe, note: null },
    { places: byVibe, note: rainy ? 'no-indoor' : null },
    { places: rainy ? areaPlaces.filter(isRainFriendly) : areaPlaces, note: 'no-vibe' },
    { places: areaPlaces, note: 'no-vibe' },
  ]
  return attempts.find((attempt) => attempt.places.length >= PICK_COUNT) ?? { places: areaPlaces, note: areaPlaces.length ? ('no-vibe' as PoolNote) : null }
}

type Random = () => number

function shuffled<T>(values: T[], random: Random) {
  const copy = [...values]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[copy[index], copy[swap]] = [copy[swap], copy[index]]
  }
  return copy
}

/** Up to 3 different places, preferring ones not in `seen` (shown earlier this session). */
export function deal<T extends PickPlace>(pool: T[], seen: ReadonlySet<string> = new Set(), random: Random = Math.random) {
  const fresh = shuffled(pool.filter((place) => !seen.has(place.slug)), random)
  const used = shuffled(pool.filter((place) => seen.has(place.slug)), random)
  return [...fresh, ...used].slice(0, PICK_COUNT)
}

/** A replacement for one card: never one already on the table, and unseen ones first. Null when the pool has nothing else. */
export function swapOne<T extends PickPlace>(pool: T[], onTable: T[], seen: ReadonlySet<string>, random: Random = Math.random) {
  const tableSlugs = new Set(onTable.map((place) => place.slug))
  const others = pool.filter((place) => !tableSlugs.has(place.slug))
  const fresh = others.filter((place) => !seen.has(place.slug))
  const from = fresh.length ? fresh : others
  return from.length ? from[Math.floor(random() * from.length)] : null
}

/** Great-circle distance in km. */
export function distanceKm([lat1, lng1]: [number, number], [lat2, lng2]: [number, number]) {
  const rad = Math.PI / 180
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(a))
}

export const NEAR_RADIUS_KM = 30
export const NEAR_MIN_PLACES = 9

/**
 * Places near a spot, using each place's city centre. Everything within 30 km; if that is fewer than 9,
 * the 9 nearest instead so a "Near me" deal never comes up empty.
 */
export function placesNear<T extends PickPlace>(places: T[], origin: [number, number], centerOf: (areaSlug: string) => [number, number] | null) {
  const ranked = places
    .map((place) => {
      const center = centerOf(place.areaSlug)
      return { place, km: center ? distanceKm(origin, center) : Infinity }
    })
    .filter((entry) => Number.isFinite(entry.km))
    .sort((a, b) => a.km - b.km)
  const within = ranked.filter((entry) => entry.km <= NEAR_RADIUS_KM)
  return (within.length >= NEAR_MIN_PLACES ? within : ranked.slice(0, NEAR_MIN_PLACES)).map((entry) => entry.place)
}

export type WeatherMood = { rainy: boolean; line: string }

/** Rain now or likely in the next hours → indoor picks with a short line; otherwise a go-ahead line. */
export function weatherMood(current: Pick<CurrentWeather, 'code' | 'precipitation'>, nextHours: HourForecast[]): WeatherMood {
  if (isStormCode(current.code)) return { rainy: true, line: 'Thunderstorm now, so indoor picks first!' }
  if (current.precipitation > 0.1 || isRainCode(current.code)) return { rainy: true, line: 'Raining now, so indoor picks first!' }
  const window = findRainWindow(nextHours)
  if (window) return { rainy: true, line: `Rain later (${formatHour(window.start)}), so indoor picks first!` }
  const last = nextHours.at(-1)
  if (!last) return { rainy: false, line: '' }
  // Hours are Manila wall-clock keys ("2026-10-07T20:00"), so the hour digits are local time.
  const startHour = Number(nextHours[0].time.slice(11, 13))
  if (startHour >= 18 || startHour < 5) return { rainy: false, line: 'No rain tonight. Perfect for night views and food trips!' }
  const until = new Date(Date.parse(`${last.time}:00Z`) + 3_600_000).toISOString().slice(0, 16)
  const untilHour = Number(until.slice(11, 13))
  if (untilHour >= 18 || untilHour < startHour) return { rainy: false, line: 'Dry till tonight. Great time to go outdoors!' }
  return { rainy: false, line: `Dry until ${formatHour(until)}. Great time to go outdoors!` }
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/

/** "?vote=a,b,c" → up to 3 unique, valid slugs. */
export function parseVoteSlugs(value: string | null) {
  return [...new Set((value ?? '').split(',').map((slug) => slug.trim()).filter((slug) => SLUG.test(slug)))].slice(0, PICK_COUNT)
}

/** The text that goes with a single pick sent to the group chat. */
export function gcMessage(name: string, where: string | null) {
  return `Up for it? ${name}${where ? ` in ${where}` : ''}! 👉`
}

export const VOTE_MESSAGE = 'Where should we go? Vote for your pick 👇'

export function voteReply(name: string) {
  return `I'm Team ${name}! 🙋 You?`
}
