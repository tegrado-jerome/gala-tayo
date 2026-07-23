import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faHouse, faLocationDot } from '@fortawesome/free-solid-svg-icons'
import { AppIcon } from '../components/AppIcon'
import AppHeader from '../components/AppHeader'
import Breadcrumb from '../components/Breadcrumb'
import CompactPagination from '../components/CompactPagination'
import PlaceCard, { type PlaceCardData } from '../components/PlaceCard'
import PlaceListingSkeleton from '../components/PlaceListingSkeleton'
import SeoHead from '../components/SeoHead'
import { PageContainer, PageShell, ResponsiveGrid } from '../components/layout/ResponsiveLayouts'
import { placeCategories } from '../data/placeCategories'
import { getAreaLabelBySlug, normalizeAreaSlug } from '../data/metroManilaAreas'
import { navigateToPath, scrollViewportToTopInstant } from '../utils/navigation'
import { formatLabelFromSlug, getSiteOrigin } from '../utils/seo'
import { getListingPlaceViewportTop, peekPendingListingRouteCache, readListingRouteCache, restoreListingRouteScroll, writeListingRouteCache } from '../utils/listingRouteCache'
import { fetchPlaceDetailsBatch } from '../utils/placeDetailCache'
import { preloadListingImageUrls } from '../utils/listingImagePreloader'
import { getSeoListingPage, mapSeoPlaceToCard, type SeoPlaceSummary } from '../utils/seoApi'
import type { PlaceDetail } from '../types/appTypes'

type AreaPlacesPageProps = {
  areaSlug: string
  search?: string
  navigationSource?: 'push' | 'replace' | 'pop'
}

const FILTER_OPTIONS = [
  { label: 'All', value: 'all' },
  ...[...placeCategories].sort((left, right) => left.label.localeCompare(right.label)),
] as const

const PAGE_SIZE = 10

type AreaPlacesResponse = {
  items: SeoPlaceSummary[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  error?: string
  message?: string
}

const EMPTY_AREA_PLACES_RESPONSE: AreaPlacesResponse = {
  items: [],
  total: 0,
  page: 1,
  pageSize: PAGE_SIZE,
  totalPages: 1,
}

function normalizeValue(value: string | null | undefined) {
  return (value || '').trim().toLowerCase()
}

function sortPlacesAlphabetically(places: SeoPlaceSummary[]) {
  return [...places].sort((left, right) => left.name.localeCompare(right.name))
}

function AreaPlacesPage({ areaSlug, search = '', navigationSource = 'push' }: AreaPlacesPageProps) {
  const normalizedAreaSlug = normalizeAreaSlug(areaSlug) || areaSlug.toLowerCase()
  const [routeCache] = useState(() => {
    const currentPath = `${window.location.pathname}${window.location.search}`
    return navigationSource === 'pop' ? readListingRouteCache() : peekPendingListingRouteCache(currentPath)
  })
  const [payload, setPayload] = useState<AreaPlacesResponse>(() =>
    routeCache
      ? {
          items: (routeCache.items as SeoPlaceSummary[]) ?? [],
          total: routeCache.total,
          page: routeCache.page,
          pageSize: routeCache.pageSize,
          totalPages: routeCache.totalPages,
        }
      : EMPTY_AREA_PLACES_RESPONSE
  )
  const [isLoading, setIsLoading] = useState(() => !routeCache)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(
    navigationSource === 'pop' && routeCache?.pendingScrollRestore ? routeCache.selectedPlaceId : null,
  )
  const [placeDetailsBySlug, setPlaceDetailsBySlug] = useState<Record<string, PlaceDetail>>({})
  const hasRestoredInitialScrollRef = useRef(false)
  const skipInitialFetchRef = useRef(Boolean(routeCache) && navigationSource !== 'pop')
  const pageDataReadyRef = useRef<number | null>(null)
  const areaName = getAreaLabelBySlug(normalizedAreaSlug) || formatLabelFromSlug(normalizedAreaSlug)
  const searchParams = useMemo(() => new URLSearchParams(search), [search])
  const activeCategory = normalizeValue(searchParams.get('category')) || 'all'
  const currentPage = Math.max(Number(searchParams.get('page') || '1') || 1, 1)
  const [confirmedPage, setConfirmedPage] = useState(() => routeCache?.page ?? currentPage)
  const hasQueryVariant = activeCategory !== 'all' || currentPage > 1
  const shouldIndexAreaPage = !hasQueryVariant && !errorMessage && payload.total > 0
  const getPagePath = (page: number, category = activeCategory) => {
    const params = new URLSearchParams()
    if (category !== 'all') {
      params.set('category', category)
    }
    if (page > 1) {
      params.set('page', String(page))
    }

    return params.toString() ? `/places/${normalizedAreaSlug}?${params.toString()}` : `/places/${normalizedAreaSlug}`
  }

  useLayoutEffect(() => {
    if (navigationSource === 'pop') {
      return
    }

    scrollViewportToTopInstant()
  }, [navigationSource, areaSlug, activeCategory, currentPage])

  useEffect(() => {
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false
      return
    }

    if (pageDataReadyRef.current === currentPage) {
      pageDataReadyRef.current = null
      return
    }

    const controller = new AbortController()
    const hasVisibleCachedResults = payload.items.length > 0
    const shouldShowLoadingUi = !hasVisibleCachedResults

    const loadPage = async () => {
      try {
        setIsLoading(shouldShowLoadingUi)
        setIsRefreshing(shouldShowLoadingUi ? false : navigationSource !== 'pop' && hasVisibleCachedResults)
        setErrorMessage(null)
        const data = await getSeoListingPage({
          areaSlug: normalizedAreaSlug,
          category: activeCategory,
          page: currentPage,
          pageSize: PAGE_SIZE,
          signal: controller.signal,
        })

        if (controller.signal.aborted) {
          return
        }

        setPayload(data)
        setConfirmedPage(data.page || currentPage)
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return
        }

        setPayload(EMPTY_AREA_PLACES_RESPONSE)
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load area page.')
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
          setIsRefreshing(false)
        }
      }
    }

    void loadPage()

    return () => controller.abort()
  }, [activeCategory, currentPage, normalizedAreaSlug])

  useEffect(() => {
    const slugs = Array.from(new Set(payload.items.map((item) => item.slug).filter(Boolean)))

    if (slugs.length === 0) {
      setPlaceDetailsBySlug({})
      return
    }

    let isActive = true

    void fetchPlaceDetailsBatch(slugs).then((details) => {
      if (!isActive) {
        return
      }

      setPlaceDetailsBySlug(
        Object.fromEntries(details.map((detail) => [detail.slug, detail]))
      )
    }).catch(() => {
      if (isActive) {
        setPlaceDetailsBySlug({})
      }
    })

    return () => {
      isActive = false
    }
  }, [payload.items])

  useLayoutEffect(() => {
    if (navigationSource !== 'pop' || hasRestoredInitialScrollRef.current) {
      return
    }

    const popCache = readListingRouteCache()
    if (!popCache?.pendingScrollRestore || !popCache.selectedPlaceId) {
      return
    }

    hasRestoredInitialScrollRef.current = true
    setSelectedPlaceId(popCache.selectedPlaceId)
    restoreListingRouteScroll(popCache)
    writeListingRouteCache({
      ...popCache,
      pendingScrollRestore: false,
    })
  }, [navigationSource])

  const allPlaces = useMemo(() => sortPlacesAlphabetically(payload.items), [payload.items])

  useEffect(() => {
    const criticalImageUrls = allPlaces
      .slice(0, 4)
      .map((place) => {
        const livePlace = placeDetailsBySlug[place.slug]
        return livePlace?.thumbnailUrl?.trim() || livePlace?.imageUrl?.trim() || null
      })
      .filter((imageUrl): imageUrl is string => Boolean(imageUrl))

    preloadListingImageUrls(criticalImageUrls)
  }, [allPlaces, placeDetailsBySlug])

  const totalPages = payload.totalPages
  const safePage = confirmedPage
  const isPageTransitionLoading = isLoading || isRefreshing
  const shouldShowInitialSkeleton = isLoading && payload.items.length === 0 && !errorMessage
  const shouldShowEmptyState = !isPageTransitionLoading && allPlaces.length === 0 && !errorMessage
  const activeFilterLabel = FILTER_OPTIONS.find((filter) => filter.value === activeCategory)?.label ?? 'All'
  const fetchPlacesForPage = async (page: number, category = activeCategory, signal?: AbortSignal) => {
    return getSeoListingPage({
      areaSlug: normalizedAreaSlug,
      category,
      page,
      pageSize: PAGE_SIZE,
      signal,
    })
  }
  const handlePageChange = async (page: number) => {
    const nextPage = Math.min(Math.max(page, 1), totalPages)

    if (nextPage === confirmedPage || nextPage === currentPage) {
      return
    }

    setIsRefreshing(true)
    setErrorMessage(null)

    try {
      const data = await fetchPlacesForPage(nextPage)
      const targetPath = getPagePath(nextPage)

      setPayload({
        items: data.items,
        total: data.total,
        page: data.page,
        pageSize: data.pageSize,
        totalPages: data.totalPages,
      })
      setConfirmedPage(data.page || nextPage)
      pageDataReadyRef.current = nextPage

      navigateToPath(targetPath)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load area page.')
    } finally {
      setIsRefreshing(false)
    }
  }
  useEffect(() => {
    if (!isPageTransitionLoading && selectedPlaceId && !allPlaces.some((place) => place.id === selectedPlaceId)) {
      setSelectedPlaceId(null)
    }
  }, [allPlaces, isPageTransitionLoading, selectedPlaceId])

  const jsonLd = !errorMessage
    && shouldIndexAreaPage
    ? [
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: `${areaName} | GalaTayo`,
          description: `Browse places in ${areaName} on GalaTayo and filter them by category in alphabetical order.`,
          url: `${getSiteOrigin()}/places/${encodeURIComponent(normalizedAreaSlug)}`,
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${getSiteOrigin()}/home` },
            { '@type': 'ListItem', position: 2, name: 'Places', item: `${getSiteOrigin()}/places` },
            { '@type': 'ListItem', position: 3, name: areaName, item: `${getSiteOrigin()}/places/${encodeURIComponent(normalizedAreaSlug)}` },
          ],
        },
        {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          itemListElement: allPlaces.map((place, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            url: `${getSiteOrigin()}${place.canonicalPath}`,
            name: place.name,
          })),
        },
      ]
    : null

  return (
    <PageShell>
      <SeoHead
        title={`${areaName} Places | GalaTayo`}
        description={`Browse places in ${areaName} on GalaTayo and filter them by category in alphabetical order.`}
        canonicalPath={`/places/${encodeURIComponent(normalizedAreaSlug)}`}
        robots={shouldIndexAreaPage ? 'index,follow' : 'noindex,follow'}
        jsonLd={jsonLd}
      />
      <AppHeader minimal />

      <main className="w-full pb-12 pt-5 sm:pb-14">
        <PageContainer className="px-4 sm:px-6 lg:px-8">
        <Breadcrumb
          showBack
          items={[
            { label: 'Home', href: '/home', icon: <FontAwesomeIcon icon={faHouse} className="h-3.5 w-3.5" /> },
            { label: 'Places', href: '/places', icon: <FontAwesomeIcon icon={faLocationDot} className="h-3.5 w-3.5" /> },
            { label: areaName, icon: <FontAwesomeIcon icon={faLocationDot} className="h-3.5 w-3.5" /> },
          ]}
        />

        <section className="mt-5 pb-2">
          <h1 className="text-[2.15rem] font-black leading-[0.95] tracking-[-0.045em] text-slate-950 sm:text-[2.6rem]">
            {areaName}
          </h1>
          <p className="mt-3 max-w-[36rem] text-[15px] leading-7 text-[var(--muted)]">
            Browse featured spots, then open the full list whenever you want more options.
          </p>
        </section>

        {errorMessage ? (
          <section className="mt-6 rounded-[24px] border border-[#E5E7EB] bg-white px-5 py-6 shadow-[0_6px_20px_rgba(17,24,39,0.03)]">
            <h2 className="text-base font-semibold text-[var(--text-main)]">We couldn't load places in {areaName} right now.</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">Please try again in a bit.</p>
          </section>
        ) : null}

        {!errorMessage ? (
          <>
            {shouldShowInitialSkeleton ? (
              <PlaceListingSkeleton
                cardCount={PAGE_SIZE}
                helperText={`Loading places in ${areaName}.`}
              />
            ) : shouldShowEmptyState ? (
              <section className="mt-10 rounded-[28px] border border-[#e5e7eb] bg-white px-5 py-8 text-center shadow-sm sm:px-6">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                  <AppIcon name="compass" className="h-7 w-7" />
                </div>
                <h2 className="mt-4 text-[1.2rem] font-black text-slate-950">No places found in {areaName} yet.</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Check back later for new gala spots, or try another category in this city.
                </p>
              </section>
            ) : (
              <section className="mt-9">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-[1.35rem] font-black tracking-[-0.03em] text-slate-950">
                      {activeCategory === 'all' ? 'All places' : `${activeFilterLabel} places`}
                    </h2>
                    <p className="mt-1 text-[13px] leading-6 text-[var(--muted)]">
                      See the city’s parks, cafes, landmarks, and local favorites in one place.
                    </p>
                  </div>
                </div>
                <div className={`mt-4 transition ${isPageTransitionLoading ? 'pointer-events-none opacity-60' : 'opacity-100'}`}>
                  <ResponsiveGrid className="gap-4">
                  {allPlaces.map((rawPlace, index) => {
                    const place = mapSeoPlaceToCard(rawPlace) as PlaceCardData
                    const basePlace = {
                      ...place,
                      imageUrl: null,
                      curatedImageUrls: [],
                    }
                    const livePlace = placeDetailsBySlug[rawPlace.slug]
                    const resolvedPlace = livePlace
                      ? {
                          ...basePlace,
                          thumbnailUrl: livePlace.thumbnailUrl ?? null,
                          imageUrl: livePlace.imageUrl ?? null,
                          curatedImageUrls: livePlace.curatedImageUrls ?? [],
                        }
                      : basePlace
                    return (
                      <div key={rawPlace.id}>
                        <PlaceCard
                          place={resolvedPlace}
                          isSelected={selectedPlaceId === rawPlace.id}
                          searchResultCard
                          imagePriority={index < 4}
                          onSelect={() => setSelectedPlaceId(rawPlace.id)}
                          dataSearchPlaceId={rawPlace.id}
                          onOpen={() => {
                            setSelectedPlaceId(rawPlace.id)
                            writeListingRouteCache({
                              items: payload.items,
                              total: payload.total,
                              page: payload.page,
                              pageSize: payload.pageSize,
                              totalPages: payload.totalPages,
                              scrollY: window.scrollY,
                              selectedPlaceId: rawPlace.id,
                              selectedPlaceViewportTop: getListingPlaceViewportTop(rawPlace.id),
                              pendingScrollRestore: true,
                            })
                          }}
                        />
                      </div>
                    )
                  })}
                  </ResponsiveGrid>
                </div>
              </section>
            )}

            {allPlaces.length > 0 && totalPages > 1 ? (
              <section className="mt-6">
                <CompactPagination
                  currentPage={safePage}
                  totalPages={totalPages}
                  totalItems={payload.total}
                  pageSize={payload.pageSize}
                  onPageChange={handlePageChange}
                  isLoading={isPageTransitionLoading}
                />
              </section>
            ) : null}
          </>
        ) : null}
        </PageContainer>
      </main>
    </PageShell>
  )
}

export default AreaPlacesPage
