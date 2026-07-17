import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { House, MapPin } from 'lucide-react'
import { AppIcon, getCategoryIconName } from '../components/AppIcon'
import AppHeader from '../components/AppHeader'
import Breadcrumb from '../components/Breadcrumb'
import CompactPagination from '../components/CompactPagination'
import InternalLink from '../components/InternalLink'
import PlaceListingSkeleton from '../components/PlaceListingSkeleton'
import PlaceCard, { type PlaceCardData } from '../components/PlaceCard'
import SeoHead from '../components/SeoHead'
import { PageContainer, PageShell, ResponsiveGrid } from '../components/layout/ResponsiveLayouts'
import { placeCategories } from '../data/placeCategories'
import { metroManilaAreaNameBySlug } from '../data/metroManilaAreas'
import { navigateToPath, scrollViewportToTopInstant } from '../utils/navigation'
import { formatLabelFromSlug, getSiteOrigin } from '../utils/seo'
import { getApiUrl } from '../utils/apiClient'
import { consumePendingListingRouteCache, getListingPlaceViewportTop, readListingRouteCache, restoreListingRouteScroll, seedPendingListingRouteCache, writeListingRouteCache } from '../utils/listingRouteCache'
import { mapSeoPlaceToCard, type SeoPlaceSummary } from '../utils/seoApi'

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

function getAreaSearchApiUrl() {
  return getApiUrl('/search')
}

async function readAreaPlacesResponse(response: Response): Promise<AreaPlacesResponse> {
  const contentType = response.headers.get('content-type') || ''
  const rawBody = await response.text()

  if (!rawBody.trim()) {
    if (!response.ok) {
      throw new Error('We could not load places for this area right now.')
    }

    return {
      items: [],
      total: 0,
      page: 1,
      pageSize: PAGE_SIZE,
      totalPages: 1,
    }
  }

  if (!contentType.includes('application/json')) {
    throw new Error('The area places request returned an unexpected response. Please make sure the backend API is running.')
  }

  let data: Record<string, unknown>

  try {
    data = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    throw new Error('The area places request returned invalid JSON.')
  }

  if (!response.ok) {
    throw new Error(
      (typeof data.error === 'string' && data.error) ||
      (typeof data.message === 'string' && data.message) ||
      'We could not load places for this area right now.'
    )
  }

  const items = Array.isArray(data.places)
    ? data.places as SeoPlaceSummary[]
    : Array.isArray((data.result as { places?: unknown } | undefined)?.places)
      ? ((data.result as { places: SeoPlaceSummary[] }).places ?? [])
      : []
  const total = typeof data.totalCount === 'number'
    ? data.totalCount
    : typeof (data.result as { totalCount?: unknown } | undefined)?.totalCount === 'number'
      ? Number((data.result as { totalCount?: number }).totalCount)
      : items.length
  const page = typeof data.page === 'number'
    ? data.page
    : typeof (data.result as { page?: unknown } | undefined)?.page === 'number'
      ? Number((data.result as { page?: number }).page)
      : 1
  const pageSize = typeof data.pageSize === 'number'
    ? data.pageSize
    : typeof (data.result as { pageSize?: unknown } | undefined)?.pageSize === 'number'
      ? Number((data.result as { pageSize?: number }).pageSize)
      : PAGE_SIZE
  const totalPages = typeof data.totalPages === 'number'
    ? data.totalPages
    : typeof (data.result as { totalPages?: unknown } | undefined)?.totalPages === 'number'
      ? Number((data.result as { totalPages?: number }).totalPages)
      : Math.max(1, Math.ceil(total / pageSize))

  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
    message: typeof data.message === 'string' ? data.message : undefined,
  }
}

function AreaPlacesPage({ areaSlug, search = '', navigationSource = 'push' }: AreaPlacesPageProps) {
  const [routeCache] = useState(() => {
    const currentPath = `${window.location.pathname}${window.location.search}`
    return navigationSource === 'pop' ? readListingRouteCache() : consumePendingListingRouteCache(currentPath)
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
  const filterScrollerRef = useRef<HTMLDivElement | null>(null)
  const activeFilterRef = useRef<HTMLAnchorElement | null>(null)
  const hasRestoredInitialScrollRef = useRef(false)
  const skipInitialFetchRef = useRef(Boolean(routeCache) && navigationSource !== 'pop')
  const areaName = metroManilaAreaNameBySlug.get(areaSlug) || formatLabelFromSlug(areaSlug)
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

    return params.toString() ? `/places/${areaSlug}?${params.toString()}` : `/places/${areaSlug}`
  }

  useLayoutEffect(() => {
    const scroller = filterScrollerRef.current
    const activeChip = activeFilterRef.current

    if (!scroller || !activeChip) {
      return
    }

    if (activeCategory === 'all') {
      scroller.scrollTo({ left: 0, behavior: 'auto' })
      return
    }

    activeChip.scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: 'auto',
    })
  }, [activeCategory])

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

    const controller = new AbortController()
    const hasVisibleCachedResults = payload.items.length > 0
    const shouldShowLoadingUi = !hasVisibleCachedResults

    const loadPage = async () => {
      try {
        setIsLoading(shouldShowLoadingUi)
        setIsRefreshing(shouldShowLoadingUi ? false : navigationSource !== 'pop' && hasVisibleCachedResults)
        setErrorMessage(null)
        const response = await fetch(getAreaSearchApiUrl(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
          body: JSON.stringify({
            query: '',
            page: currentPage,
            filters: {
              city: areaSlug,
              category: activeCategory,
            },
          }),
        })
        const data = await readAreaPlacesResponse(response)

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
  }, [activeCategory, areaSlug, currentPage])

  useLayoutEffect(() => {
    if (navigationSource !== 'pop' || !routeCache?.pendingScrollRestore || hasRestoredInitialScrollRef.current) {
      return
    }

    if (!selectedPlaceId) {
      return
    }

    hasRestoredInitialScrollRef.current = true
    restoreListingRouteScroll(routeCache)
    writeListingRouteCache({
      ...routeCache,
      pendingScrollRestore: false,
    })
  }, [isLoading, isRefreshing, navigationSource, routeCache, selectedPlaceId])

  const allPlaces = useMemo(() => sortPlacesAlphabetically(payload.items), [payload.items])
  const totalPages = payload.totalPages
  const safePage = confirmedPage
  const isPageTransitionLoading = isLoading || isRefreshing
  const shouldShowInitialSkeleton = isLoading && payload.items.length === 0 && !errorMessage
  const shouldShowEmptyState = !isPageTransitionLoading && allPlaces.length === 0 && !errorMessage
  const activeFilterLabel = FILTER_OPTIONS.find((filter) => filter.value === activeCategory)?.label ?? 'All'
  const fetchPlacesForPage = async (page: number, category = activeCategory, signal?: AbortSignal) => {
    const response = await fetch(getAreaSearchApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal,
      body: JSON.stringify({
        query: '',
        page,
        filters: {
          city: areaSlug,
          category,
        },
      }),
    })

    return readAreaPlacesResponse(response)
  }
  const handlePageChange = async (page: number) => {
    const nextPage = Math.min(Math.max(page, 1), totalPages)
    let didNavigate = false

    if (nextPage === confirmedPage || nextPage === currentPage) {
      return
    }

    setIsLoading(false)
    setIsRefreshing(true)
    setErrorMessage(null)

    try {
      const data = await fetchPlacesForPage(nextPage)
      const targetPath = getPagePath(nextPage)

      seedPendingListingRouteCache(targetPath, {
        items: data.items,
        total: data.total,
        page: data.page,
        pageSize: data.pageSize,
        totalPages: data.totalPages,
        scrollY: 0,
        selectedPlaceId: null,
        selectedPlaceViewportTop: null,
        pendingScrollRestore: false,
      })

      navigateToPath(targetPath)
      didNavigate = true
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load area page.')
    } finally {
      if (!didNavigate) {
        setIsRefreshing(false)
      }
    }
  }
  const handleCategoryChange = async (category: string) => {
    const nextCategory = normalizeValue(category) || 'all'
    const nextPath = getPagePath(1, nextCategory)

    if (nextCategory === activeCategory) {
      return
    }

    setIsLoading(false)
    setIsRefreshing(true)
    setErrorMessage(null)

    try {
      const data = await fetchPlacesForPage(1, nextCategory)

      seedPendingListingRouteCache(nextPath, {
        items: data.items,
        total: data.total,
        page: data.page,
        pageSize: data.pageSize,
        totalPages: data.totalPages,
        scrollY: 0,
        selectedPlaceId: null,
        selectedPlaceViewportTop: null,
        pendingScrollRestore: false,
      })

      navigateToPath(nextPath)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load area page.')
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
          url: `${getSiteOrigin()}/places/${encodeURIComponent(areaSlug)}`,
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${getSiteOrigin()}/` },
            { '@type': 'ListItem', position: 2, name: 'Places', item: `${getSiteOrigin()}/places` },
            { '@type': 'ListItem', position: 3, name: areaName, item: `${getSiteOrigin()}/places/${encodeURIComponent(areaSlug)}` },
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
        canonicalPath={`/places/${encodeURIComponent(areaSlug)}`}
        robots={shouldIndexAreaPage ? 'index,follow' : 'noindex,follow'}
        jsonLd={jsonLd}
      />
      <AppHeader minimal />

      <main className="w-full pb-12 pt-5 sm:pb-14">
        <PageContainer className="px-4 sm:px-6 lg:px-8">
        <Breadcrumb
          showBack
          items={[
            { label: 'Home', href: '/', icon: <House className="h-3.5 w-3.5" /> },
            { label: 'Places', href: '/places', icon: <MapPin className="h-3.5 w-3.5" /> },
            { label: areaName, icon: <MapPin className="h-3.5 w-3.5" /> },
          ]}
        />

        <section className="mt-5 pb-2">
          <h1 className="text-[2.15rem] font-black leading-[0.95] tracking-[-0.045em] text-slate-950 sm:text-[2.6rem]">
            {areaName}
          </h1>
          <p className="mt-3 max-w-[36rem] text-[15px] leading-7 text-[var(--muted)]">
            Open a category filter or browse everything in one clean alphabetical list.
          </p>
        </section>

        <section className="mt-6">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-[1.05rem] font-black tracking-[-0.02em] text-slate-950">Browse by category</h2>
              <p className="mt-1 text-[13px] text-[var(--muted)]">Filters and results are arranged alphabetically.</p>
            </div>
          </div>
          {shouldShowInitialSkeleton ? (
            <PlaceListingSkeleton
              showCategoryChips
              helperText={`Loading places in ${areaName} and preparing categories for browsing.`}
            />
          ) : (
            <div
              ref={filterScrollerRef}
              className="flex gap-2.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {FILTER_OPTIONS.map((filter) => {
                const params = new URLSearchParams()
                if (filter.value !== 'all') {
                  params.set('category', filter.value)
                }
                const href = params.toString() ? `/places/${areaSlug}?${params.toString()}` : `/places/${areaSlug}`
                const isActive = activeCategory === filter.value
                const iconName = filter.value === 'all' ? null : getCategoryIconName(filter.label)

                return (
                  <InternalLink
                    key={filter.value}
                    ref={isActive ? activeFilterRef : null}
                    href={href}
                    onClick={(event) => {
                      if (event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) {
                        return
                      }

                      event.preventDefault()
                      void handleCategoryChange(filter.value)
                    }}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition ${
                      isActive
                        ? 'border-[#1e3a8a] bg-[#1e3a8a] text-white'
                        : 'border-[#e5e7eb] bg-white text-slate-700 hover:border-[#bfdbfe] hover:bg-[var(--surface-alt)] hover:text-[var(--accent)]'
                    }`}
                  >
                    {iconName ? (
                      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${isActive ? 'bg-white text-[var(--accent)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]' : 'bg-[var(--surface-alt)] text-[#64748b]'}`}>
                        <AppIcon name={iconName} className="h-4 w-4" />
                      </span>
                    ) : null}
                    {filter.label}
                  </InternalLink>
                )
              })}
            </div>
          )}
        </section>

        {errorMessage ? (
          <section className="mt-6 rounded-[24px] border border-[#E5E7EB] bg-white px-5 py-6 shadow-[0_6px_20px_rgba(17,24,39,0.03)]">
            <h2 className="text-base font-semibold text-[var(--text-main)]">We couldn't load places in {areaName} right now.</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">Please try again in a bit.</p>
          </section>
        ) : null}

        {!errorMessage ? (
          <>
            {shouldShowInitialSkeleton ? null : shouldShowEmptyState ? (
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
                      Listed from A to Z for easier browsing in {areaName}.
                    </p>
                  </div>
                </div>
                <div className={`mt-4 transition ${isPageTransitionLoading ? 'pointer-events-none opacity-60' : 'opacity-100'}`}>
                  <ResponsiveGrid className="gap-4">
                  {allPlaces.map((rawPlace) => {
                    const place = mapSeoPlaceToCard(rawPlace) as PlaceCardData
                    return (
                      <div key={rawPlace.id}>
                        <PlaceCard
                          place={place}
                          isSelected={selectedPlaceId === rawPlace.id}
                          searchResultCard
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
