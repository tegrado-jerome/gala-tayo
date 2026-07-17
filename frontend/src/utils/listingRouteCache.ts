const listingRouteCachePrefix = 'galatayo:listing-route:'
const pendingListingRouteCacheByPath = new Map<string, string>()

type ListingRouteCache = {
  items: unknown[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  scrollY: number
  selectedPlaceId: string | null
  selectedPlaceViewportTop: number | null
  pendingScrollRestore: boolean
  cachedAt: number
}

function readPersistentStorage(key: string) {
  try {
    const sessionValue = window.sessionStorage.getItem(key)
    if (sessionValue) {
      return sessionValue
    }
  } catch {
    // Storage can be unavailable in private browsing or restricted webviews.
  }

  try {
    return window.localStorage.getItem(key)
  } catch {
    // Storage can be unavailable in private browsing or restricted webviews.
    return null
  }
}

function writePersistentStorage(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value)
  } catch {
    // Storage can be unavailable in private browsing or restricted webviews.
  }

  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage can be unavailable in private browsing or restricted webviews.
  }
}

function getListingRouteCacheKey(pathnameWithSearch: string) {
  return `${listingRouteCachePrefix}${pathnameWithSearch}`
}

function getCurrentListingRouteCacheKey() {
  return getListingRouteCacheKey(`${window.location.pathname}${window.location.search}`)
}

function getListingPlaceSelector(placeId: string) {
  const escapedPlaceId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(placeId)
    : placeId.replace(/["\\]/g, '\\$&')

  return `[data-search-place-id="${escapedPlaceId}"]`
}

function runWithInstantScroll(callback: () => void) {
  const html = document.documentElement
  const body = document.body
  const previousHtmlScrollBehavior = html.style.scrollBehavior
  const previousBodyScrollBehavior = body.style.scrollBehavior

  html.style.scrollBehavior = 'auto'
  body.style.scrollBehavior = 'auto'

  callback()

  html.style.scrollBehavior = previousHtmlScrollBehavior
  body.style.scrollBehavior = previousBodyScrollBehavior
}

export function getListingPlaceViewportTop(placeId: string) {
  return document.querySelector<HTMLElement>(getListingPlaceSelector(placeId))?.getBoundingClientRect().top ?? null
}

export function readListingRouteCache(): ListingRouteCache | null {
  try {
    const rawCache = readPersistentStorage(getCurrentListingRouteCacheKey())

    if (!rawCache) {
      return null
    }

    const parsedCache = JSON.parse(rawCache) as Partial<ListingRouteCache>

    if (typeof parsedCache.cachedAt !== 'number' || !Number.isFinite(parsedCache.cachedAt)) {
      return null
    }

    return {
      items: Array.isArray(parsedCache.items) ? parsedCache.items : [],
      total: typeof parsedCache.total === 'number' && Number.isFinite(parsedCache.total) ? Math.max(0, Math.floor(parsedCache.total)) : 0,
      page: typeof parsedCache.page === 'number' && Number.isFinite(parsedCache.page) && parsedCache.page > 0 ? Math.floor(parsedCache.page) : 1,
      pageSize: typeof parsedCache.pageSize === 'number' && Number.isFinite(parsedCache.pageSize) && parsedCache.pageSize > 0 ? Math.floor(parsedCache.pageSize) : 0,
      totalPages: typeof parsedCache.totalPages === 'number' && Number.isFinite(parsedCache.totalPages) && parsedCache.totalPages > 0 ? Math.floor(parsedCache.totalPages) : 1,
      scrollY: typeof parsedCache.scrollY === 'number' && Number.isFinite(parsedCache.scrollY) ? parsedCache.scrollY : 0,
      selectedPlaceId: typeof parsedCache.selectedPlaceId === 'string' ? parsedCache.selectedPlaceId : null,
      selectedPlaceViewportTop:
        typeof parsedCache.selectedPlaceViewportTop === 'number' && Number.isFinite(parsedCache.selectedPlaceViewportTop)
          ? parsedCache.selectedPlaceViewportTop
          : null,
      pendingScrollRestore: parsedCache.pendingScrollRestore === true,
      cachedAt: parsedCache.cachedAt,
    }
  } catch {
    return null
  }
}

export function hasPendingListingRouteScrollRestore(pathnameWithSearch = `${window.location.pathname}${window.location.search}`) {
  try {
    const rawCache = readPersistentStorage(getListingRouteCacheKey(pathnameWithSearch))

    if (!rawCache) {
      return false
    }

    const parsedCache = JSON.parse(rawCache) as { pendingScrollRestore?: boolean }
    return parsedCache.pendingScrollRestore === true
  } catch {
    return false
  }
}

export function writeListingRouteCache(cache: Omit<ListingRouteCache, 'cachedAt'>) {
  writeListingRouteCacheForPath(`${window.location.pathname}${window.location.search}`, cache)
}

export function writeListingRouteCacheForPath(pathnameWithSearch: string, cache: Omit<ListingRouteCache, 'cachedAt'>) {
  try {
    writePersistentStorage(
      getListingRouteCacheKey(pathnameWithSearch),
      JSON.stringify({
        ...cache,
        cachedAt: Date.now(),
      }),
    )
  } catch {
    // Storage can be unavailable in private browsing or restricted webviews.
  }
}

export function seedPendingListingRouteCache(pathnameWithSearch: string, cache: Omit<ListingRouteCache, 'cachedAt'>) {
  pendingListingRouteCacheByPath.set(pathnameWithSearch, JSON.stringify({
    ...cache,
    cachedAt: Date.now(),
  }))
}

export function consumePendingListingRouteCache(pathnameWithSearch: string): ListingRouteCache | null {
  const rawCache = pendingListingRouteCacheByPath.get(pathnameWithSearch)

  if (!rawCache) {
    return null
  }

  pendingListingRouteCacheByPath.delete(pathnameWithSearch)

  try {
    const parsedCache = JSON.parse(rawCache) as Partial<ListingRouteCache>

    if (typeof parsedCache.cachedAt !== 'number' || !Number.isFinite(parsedCache.cachedAt)) {
      return null
    }

    return {
      items: Array.isArray(parsedCache.items) ? parsedCache.items : [],
      total: typeof parsedCache.total === 'number' && Number.isFinite(parsedCache.total) ? Math.max(0, Math.floor(parsedCache.total)) : 0,
      page: typeof parsedCache.page === 'number' && Number.isFinite(parsedCache.page) && parsedCache.page > 0 ? Math.floor(parsedCache.page) : 1,
      pageSize: typeof parsedCache.pageSize === 'number' && Number.isFinite(parsedCache.pageSize) && parsedCache.pageSize > 0 ? Math.floor(parsedCache.pageSize) : 0,
      totalPages: typeof parsedCache.totalPages === 'number' && Number.isFinite(parsedCache.totalPages) && parsedCache.totalPages > 0 ? Math.floor(parsedCache.totalPages) : 1,
      scrollY: typeof parsedCache.scrollY === 'number' && Number.isFinite(parsedCache.scrollY) ? parsedCache.scrollY : 0,
      selectedPlaceId: typeof parsedCache.selectedPlaceId === 'string' ? parsedCache.selectedPlaceId : null,
      selectedPlaceViewportTop:
        typeof parsedCache.selectedPlaceViewportTop === 'number' && Number.isFinite(parsedCache.selectedPlaceViewportTop)
          ? parsedCache.selectedPlaceViewportTop
          : null,
      pendingScrollRestore: parsedCache.pendingScrollRestore === true,
      cachedAt: parsedCache.cachedAt,
    }
  } catch {
    return null
  }
}

export function restoreListingRouteScroll(
  cache: Pick<ListingRouteCache, 'scrollY' | 'selectedPlaceId' | 'selectedPlaceViewportTop'>,
  maxRetries = 4,
) {
  const targetScrollY = Math.max(cache.scrollY, 0)
  const targetPlaceId = cache.selectedPlaceId
  const targetPlaceViewportTop = cache.selectedPlaceViewportTop

  const restore = () => {
    runWithInstantScroll(() => {
      window.scrollTo({
        top: targetScrollY,
        left: 0,
        behavior: 'auto',
      })

      if (targetPlaceId && targetPlaceViewportTop !== null) {
        const targetCard = document.querySelector<HTMLElement>(getListingPlaceSelector(targetPlaceId))

        if (targetCard) {
          const cardViewportTop = targetCard.getBoundingClientRect().top
          const offsetDelta = cardViewportTop - targetPlaceViewportTop

          if (Math.abs(offsetDelta) > 1) {
            window.scrollBy({
              top: offsetDelta,
              left: 0,
              behavior: 'auto',
            })
          }
        }
      }
    })
  }

  restore()

  for (let index = 0; index < maxRetries; index += 1) {
    const frameCount = index + 1
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(restore)
    })
    window.setTimeout(restore, 120 * frameCount)
  }
}
