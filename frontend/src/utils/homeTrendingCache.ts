import type { PlaceCardData } from '../components/PlaceCard'

const HOME_TRENDING_CACHE_KEY = 'galatayo:home-trending-cache'
const HOME_TRENDING_CACHE_TTL_MS = 15 * 60 * 1000

type HomeTrendingCache = {
  places: PlaceCardData[]
  cachedAt: number
}

function isPlaceCardData(value: unknown): value is PlaceCardData {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as PlaceCardData).id === 'string' &&
    typeof (value as PlaceCardData).name === 'string' &&
    typeof (value as PlaceCardData).category === 'string' &&
    typeof (value as PlaceCardData).area === 'string'
  )
}

export function readHomeTrendingCache(): PlaceCardData[] | null {
  try {
    const rawValue = window.localStorage.getItem(HOME_TRENDING_CACHE_KEY)
    if (!rawValue) {
      return null
    }

    const parsedValue = JSON.parse(rawValue) as Partial<HomeTrendingCache>

    if (!Array.isArray(parsedValue.places) || typeof parsedValue.cachedAt !== 'number') {
      window.localStorage.removeItem(HOME_TRENDING_CACHE_KEY)
      return null
    }

    if (Date.now() - parsedValue.cachedAt > HOME_TRENDING_CACHE_TTL_MS) {
      window.localStorage.removeItem(HOME_TRENDING_CACHE_KEY)
      return null
    }

    return parsedValue.places.filter(isPlaceCardData)
  } catch {
    return null
  }
}

export function writeHomeTrendingCache(places: PlaceCardData[]) {
  try {
    const payload: HomeTrendingCache = {
      places,
      cachedAt: Date.now(),
    }

    window.localStorage.setItem(HOME_TRENDING_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // localStorage may be unavailable, ignore.
  }
}
