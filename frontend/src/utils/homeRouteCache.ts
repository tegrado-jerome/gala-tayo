const HOME_ROUTE_CACHE_KEY = 'galatayo:home-route-cache'
const HOME_ROUTE_CACHE_TTL_MS = 30 * 60 * 1000

export type HomeRouteCachePlace = {
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

type HomeRouteCache = {
  trendingPlaces: HomeRouteCachePlace[]
  homePlacesPool: HomeRouteCachePlace[]
  cityTilePlaceBySlug: Record<string, HomeRouteCachePlace>
  topPickPlaceBySlug: Record<string, HomeRouteCachePlace>
  categoryTilePlaceByLabel: Record<string, HomeRouteCachePlace>
  activeTopPicksTab: 'all' | 'popular' | 'recommended'
  cachedAt: number
}

function isHomeRouteCachePlace(value: unknown): value is HomeRouteCachePlace {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as HomeRouteCachePlace).id === 'string' &&
    typeof (value as HomeRouteCachePlace).name === 'string' &&
    typeof (value as HomeRouteCachePlace).area === 'string'
  )
}

function filterPlaceRecord(value: unknown) {
  if (!value || typeof value !== 'object') {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, HomeRouteCachePlace] => (
      isHomeRouteCachePlace(entry[1])
    ))
  )
}

export function readHomeRouteCache(): Omit<HomeRouteCache, 'cachedAt'> | null {
  try {
    const rawValue = window.localStorage.getItem(HOME_ROUTE_CACHE_KEY)
    if (!rawValue) {
      return null
    }

    const parsedValue = JSON.parse(rawValue) as Partial<HomeRouteCache>

    if (
      typeof parsedValue.cachedAt !== 'number' ||
      !Number.isFinite(parsedValue.cachedAt) ||
      Date.now() - parsedValue.cachedAt > HOME_ROUTE_CACHE_TTL_MS
    ) {
      window.localStorage.removeItem(HOME_ROUTE_CACHE_KEY)
      return null
    }

    const trendingPlaces = Array.isArray(parsedValue.trendingPlaces)
      ? parsedValue.trendingPlaces.filter(isHomeRouteCachePlace)
      : []
    const homePlacesPool = Array.isArray(parsedValue.homePlacesPool)
      ? parsedValue.homePlacesPool.filter(isHomeRouteCachePlace)
      : []

    if (trendingPlaces.length === 0 && homePlacesPool.length === 0) {
      return null
    }

    return {
      trendingPlaces,
      homePlacesPool,
      cityTilePlaceBySlug: filterPlaceRecord(parsedValue.cityTilePlaceBySlug),
      topPickPlaceBySlug: filterPlaceRecord(parsedValue.topPickPlaceBySlug),
      categoryTilePlaceByLabel: filterPlaceRecord(parsedValue.categoryTilePlaceByLabel),
      activeTopPicksTab:
        parsedValue.activeTopPicksTab === 'popular' || parsedValue.activeTopPicksTab === 'recommended'
          ? parsedValue.activeTopPicksTab
          : 'all',
    }
  } catch {
    return null
  }
}

export function writeHomeRouteCache(cache: Omit<HomeRouteCache, 'cachedAt'>) {
  try {
    window.localStorage.setItem(
      HOME_ROUTE_CACHE_KEY,
      JSON.stringify({
        ...cache,
        cachedAt: Date.now(),
      } satisfies HomeRouteCache)
    )
  } catch {
    // localStorage may be unavailable, ignore.
  }
}
