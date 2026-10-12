// Pure helpers for the search box and results: nicknames, typo-tolerant matching, recent searches,
// the searcher's location (kept only for this tab, after they tap "Near me") and guide shortcuts.

export const foldSearch = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// Short forms people type; the backend reads the same ones (backend/src/domain/queryIntent.ts QUERY_ALIASES).
const SEARCH_ALIASES: Record<string, string> = {
  bora: 'boracay',
  elyu: 'la union',
  sarg: 'siargao',
  pp: 'puerto princesa',
  ppur: 'puerto princesa underground river',
  cdo: 'cagayan de oro',
  camsur: 'camarines sur',
  dgte: 'dumaguete',
  qc: 'quezon city',
  mt: 'mount',
}

/** "bora" -> "boracay", "mt apo" -> "mount apo". */
export function expandSearchAliases(query: string) {
  return foldSearch(query)
    .split(' ')
    .map((word) => SEARCH_ALIASES[word] ?? word)
    .join(' ')
}

function editDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = above
    }
  }
  return row[b.length]
}

/**
 * How well a suggestion's text matches what was typed: 0 starts with it, 1 a word starts with it, 2 inside a word,
 * 3 a near miss ("tagatay", "chocolate hils"), -1 no match. Near misses need 4+ letters and allow one slip, two from 8.
 */
export function suggestionRank(text: string, typed: string) {
  const haystack = foldSearch(text)
  const query = foldSearch(typed)
  if (!query) return -1
  const index = haystack.indexOf(query)
  if (index === 0) return 0
  if (index > 0) return haystack.charAt(index - 1) === ' ' ? 1 : 2
  if (query.length < 4) return -1
  const budget = query.length >= 8 ? 2 : 1
  const words = haystack.split(' ')
  // Compare with the same number of words from each word start, cut to about the typed length, so a half-typed name still counts.
  const span = query.split(' ').length
  for (let start = 0; start + span <= words.length; start++) {
    const candidate = words.slice(start, start + span).join(' ')
    for (const length of [query.length - 1, query.length, query.length + 1]) {
      if (length > 0 && editDistance(candidate.slice(0, length), query) <= budget) return 3
    }
  }
  return -1
}

const RECENT_KEY = 'galatayo:recent-searches'
const RECENT_MAX = 6

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function localStore(): KeyValueStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function readRecentSearches(store: KeyValueStore | null = localStore()): string[] {
  try {
    const value: unknown = JSON.parse(store?.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').slice(0, RECENT_MAX) : []
  } catch {
    return []
  }
}

/** Newest first, no repeats (ignoring case and spacing), at most six. */
export function rememberSearch(query: string, store: KeyValueStore | null = localStore()) {
  const cleaned = query.replace(/\s+/g, ' ').trim()
  if (!cleaned || !store) return
  const key = foldSearch(cleaned)
  const next = [cleaned, ...readRecentSearches(store).filter((item) => foldSearch(item) !== key)].slice(0, RECENT_MAX)
  try {
    store.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // Storage full or blocked: recent searches are a convenience.
  }
}

export function clearRecentSearches(store: KeyValueStore | null = localStore()) {
  try {
    store?.removeItem(RECENT_KEY)
  } catch {
    // Same as above.
  }
}

export type UserLocation = { latitude: number; longitude: number }

const LOCATION_KEY = 'galatayo:search-location'

function sessionStore(): KeyValueStore | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

/** The location the searcher shared this visit, rounded to about 1 km; null when they haven't tapped "Near me". */
export function readSearchLocation(store: KeyValueStore | null = sessionStore()): UserLocation | null {
  try {
    const value = JSON.parse(store?.getItem(LOCATION_KEY) ?? 'null') as Partial<UserLocation> | null
    const { latitude, longitude } = value ?? {}
    return typeof latitude === 'number' && typeof longitude === 'number' && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null
  } catch {
    return null
  }
}

export function saveSearchLocation(location: UserLocation | null, store: KeyValueStore | null = sessionStore()) {
  try {
    if (!location) store?.removeItem(LOCATION_KEY)
    else store?.setItem(LOCATION_KEY, JSON.stringify({ latitude: Math.round(location.latitude * 100) / 100, longitude: Math.round(location.longitude * 100) / 100 }))
  } catch {
    // Without storage the location still works for this search.
  }
}

/** Asks the browser for the location: only ever called from a tap on "Near me". */
export function requestSearchLocation(): Promise<UserLocation> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Location is not available on this device.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      (error) => reject(new Error(error.code === error.PERMISSION_DENIED ? 'Location is off for GalaTayo. Turn it on in your browser to sort by distance.' : 'Could not find your location. Try again in a bit.')),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
    )
  })
}

export type SearchShortcut = { href: string; label: string; sub: string }

export type SearchGuide = { slug: string; label: string; keywords?: string[] }

const GUIDE_FILLER = new Set('a an the in of sa ng to for and best top guide guides places spots ideas list where what go do'.split(' '))
const contentWords = (value: string) => foldSearch(value).split(' ').filter((word) => word && !GUIDE_FILLER.has(word))
const PLAN_WORDS = /\b(itinerary|itineraries|days?|weeks?|nights?|plan|planning|first time|one day|1 day|what to do|things to do|where to go|weekend|getaway|day trip|road trip|from manila|worth)\b/
const TRIP_WORDS = /\b(weekend|getaway|day trip|road trip|from manila|outside manila|labas ng manila)\b/

/**
 * Our own guides and Saan tayo for searches that ask for a plan, not just places: "manila one day",
 * "2 week itinerary", "weekend trip from manila", "things to do in cebu". A guide shows when every word of one of
 * its search phrases is in the query, or the query names its town ("cebu" -> Things to do in Cebu).
 */
export function searchShortcuts(query: string, guides: SearchGuide[]): SearchShortcut[] {
  const folded = expandSearchAliases(query)
  const words = new Set(contentWords(folded))
  if (words.size === 0) return []
  const guideFor = (slug: string) => guides.find((guide) => guide.slug === slug)
  const matches = guides.map((guide) => {
    const phrases = [guide.label, ...(guide.keywords ?? [])].map(contentWords).filter((phrase) => phrase.length > 0)
    const best = Math.max(0, ...phrases.filter((phrase) => phrase.every((word) => words.has(word))).map((phrase) => phrase.length))
    const town = guide.slug.startsWith('things-to-do-in-') ? contentWords(guide.slug.slice('things-to-do-in-'.length).replace(/-/g, ' ')) : []
    const namesTown = town.length > 0 && town.length === words.size && town.every((word) => words.has(word))
    return { guide, score: namesTown ? 10 : best }
  })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .map(({ guide }) => guide)
  if (TRIP_WORDS.test(folded)) {
    const getaways = guideFor('weekend-getaways-from-manila')
    if (getaways && !matches.includes(getaways)) matches.unshift(getaways)
  }
  const shortcuts: SearchShortcut[] = matches.slice(0, 2).map((guide) => ({ href: `/guides/${guide.slug}`, label: guide.label, sub: 'GalaTayo guide' }))
  if (PLAN_WORDS.test(folded)) shortcuts.push({ href: '/saan-tayo', label: 'Saan tayo? Let us pick for you', sub: 'A ready plan in three taps' })
  return shortcuts
}

/** Searches to try when a search finds nothing, or before typing. */
export const SEARCH_IDEAS = ['beach near manila', 'weekend trip from manila', 'sunset', 'waterfalls', 'el nido or coron', 'rainy day manila']
