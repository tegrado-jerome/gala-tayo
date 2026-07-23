const HOME_SCROLL_CACHE_KEY = 'galatayo:home-landing-scroll'
const HOME_SCROLL_CACHE_TTL_MS = 30 * 60 * 1000

type HomeScrollCache = {
  scrollY: number
  selectedPlaceId: string | null
  selectedPlaceViewportTop: number | null
  pendingScrollRestore: boolean
  cachedAt: number
  activeTab: 'all' | 'popular' | 'recommended'
  topPicksScrollLeftByTab: {
    all: number
    popular: number
    recommended: number
  }
  citiesScrollLeft: number
  categoriesScrollLeft: number
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

function removePersistentStorage(key: string) {
  try {
    window.sessionStorage.removeItem(key)
  } catch {
    // Storage can be unavailable in private browsing or restricted webviews.
  }

  try {
    window.localStorage.removeItem(key)
  } catch {
    // Storage can be unavailable in private browsing or restricted webviews.
  }
}

function getHomeScrollSelector(placeId: string) {
  const escapedPlaceId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(placeId)
    : placeId.replace(/["\\]/g, '\\$&')

  return `[data-home-trending-place-id="${escapedPlaceId}"]`
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

export function readHomeScrollCache(): HomeScrollCache | null {
  try {
    const rawCache = readPersistentStorage(HOME_SCROLL_CACHE_KEY)

    if (!rawCache) {
      return null
    }

    const parsedCache = JSON.parse(rawCache) as Partial<HomeScrollCache>

    if (
      typeof parsedCache.cachedAt !== 'number' ||
      !Number.isFinite(parsedCache.cachedAt) ||
      Date.now() - parsedCache.cachedAt > HOME_SCROLL_CACHE_TTL_MS
    ) {
      removePersistentStorage(HOME_SCROLL_CACHE_KEY)
      return null
    }

    const rawTopPicksScroll = parsedCache.topPicksScrollLeftByTab

    return {
      scrollY: typeof parsedCache.scrollY === 'number' && Number.isFinite(parsedCache.scrollY) ? parsedCache.scrollY : 0,
      selectedPlaceId: typeof parsedCache.selectedPlaceId === 'string' ? parsedCache.selectedPlaceId : null,
      selectedPlaceViewportTop:
        typeof parsedCache.selectedPlaceViewportTop === 'number' && Number.isFinite(parsedCache.selectedPlaceViewportTop)
          ? parsedCache.selectedPlaceViewportTop
          : null,
      pendingScrollRestore: parsedCache.pendingScrollRestore === true,
      cachedAt: parsedCache.cachedAt,
      activeTab:
        parsedCache.activeTab === 'all' || parsedCache.activeTab === 'popular' || parsedCache.activeTab === 'recommended'
          ? parsedCache.activeTab
          : 'all',
      topPicksScrollLeftByTab: {
        all: rawTopPicksScroll?.all ?? 0,
        popular: rawTopPicksScroll?.popular ?? 0,
        recommended: rawTopPicksScroll?.recommended ?? 0,
      },
      citiesScrollLeft: typeof parsedCache.citiesScrollLeft === 'number' && Number.isFinite(parsedCache.citiesScrollLeft)
        ? parsedCache.citiesScrollLeft
        : 0,
      categoriesScrollLeft: typeof parsedCache.categoriesScrollLeft === 'number' && Number.isFinite(parsedCache.categoriesScrollLeft)
        ? parsedCache.categoriesScrollLeft
        : 0,
    }
  } catch {
    return null
  }
}

export function writeHomeScrollCache(cache: Omit<HomeScrollCache, 'cachedAt'>) {
  try {
    writePersistentStorage(HOME_SCROLL_CACHE_KEY, JSON.stringify({
      ...cache,
      cachedAt: Date.now(),
    }))
  } catch {
    // Storage can be unavailable in private browsing or restricted webviews.
  }
}

export function clearHomeScrollCache() {
  try {
    removePersistentStorage(HOME_SCROLL_CACHE_KEY)
  } catch {
    // Storage can be unavailable in private browsing or restricted webviews.
  }
}

export function restoreHomeHorizontalScrolls(
  cache: Pick<HomeScrollCache, 'topPicksScrollLeftByTab' | 'citiesScrollLeft' | 'categoriesScrollLeft'>,
  activeTab: 'all' | 'popular' | 'recommended',
  refs: {
    heroCarousel: HTMLElement | null
    cityRail: HTMLElement | null
    categoryRail: HTMLElement | null
  },
  maxRetries = 4,
) {
  const topPicksScroll = cache.topPicksScrollLeftByTab?.[activeTab] ?? 0
  const citiesScroll = cache.citiesScrollLeft ?? 0
  const categoriesScroll = cache.categoriesScrollLeft ?? 0

  const restore = () => {
    if (topPicksScroll > 0 && refs.heroCarousel) {
      refs.heroCarousel.scrollLeft = topPicksScroll
    }
    if (citiesScroll > 0 && refs.cityRail) {
      refs.cityRail.scrollLeft = citiesScroll
    }
    if (categoriesScroll > 0 && refs.categoryRail) {
      refs.categoryRail.scrollLeft = categoriesScroll
    }
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

export function restoreHomeScroll(
  cache: Pick<HomeScrollCache, 'scrollY' | 'selectedPlaceId' | 'selectedPlaceViewportTop'>,
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
        const targetCard = document.querySelector<HTMLElement>(getHomeScrollSelector(targetPlaceId))

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
