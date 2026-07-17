const HOME_TRENDING_CACHE_KEY = 'galatayo:home-trending-cache'
const HOME_TRENDING_CACHE_TTL_MS = 15 * 60 * 1000

export type HomeTrendingCachePlace = {
  id: string
  slug?: string
  name: string
  category?: string | null
  area: string
  city?: string | null
  localArea?: string | null
  thumbnailUrl?: string | null
  imageUrl?: string | null
  curatedImageUrls?: string[]
  rating?: number | null
  reviewCount?: string
  description?: string | null
  reason?: string | null
}

type HomeTrendingCache = {
  places: HomeTrendingCachePlace[]
  cachedAt: number
}

function isHomeTrendingCachePlace(value: unknown): value is HomeTrendingCachePlace {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as HomeTrendingCachePlace).id === 'string' &&
    typeof (value as HomeTrendingCachePlace).name === 'string' &&
    typeof (value as HomeTrendingCachePlace).area === 'string'
  )
}

export function readHomeTrendingCache(): HomeTrendingCachePlace[] | null {
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

    return parsedValue.places.filter(isHomeTrendingCachePlace)
  } catch {
    return null
  }
}

export function writeHomeTrendingCache(places: HomeTrendingCachePlace[]) {
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
