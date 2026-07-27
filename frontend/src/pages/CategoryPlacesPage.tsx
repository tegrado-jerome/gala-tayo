import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faHouse, faLocationDot, faTableCellsLarge } from '@fortawesome/free-solid-svg-icons'
import { AppIcon, getCategoryIconName } from '../components/AppIcon'
import AppHeader from '../components/AppHeader'
import Breadcrumb from '../components/Breadcrumb'
import CompactPagination from '../components/CompactPagination'
import PlaceCard, { type PlaceCardData } from '../components/PlaceCard'
import PlaceListingSkeleton from '../components/PlaceListingSkeleton'
import SeoHead from '../components/SeoHead'
import { PageContainer, PageShell, ResponsiveGrid } from '../components/layout/ResponsiveLayouts'
import { getPlaceCategoryLabel } from '../data/placeCategories'
import { navigateToPath, scrollViewportToTopInstant } from '../utils/navigation'
import { getSiteOrigin } from '../utils/seo'
import { getListingPlaceViewportTop, peekPendingListingRouteCache, readListingRouteCache, restoreListingRouteScroll, writeListingRouteCache } from '../utils/listingRouteCache'
import { fetchPlaceDetailsBatch, readCachedPlaceDetail } from '../utils/placeDetailCache'
import { preloadListingImageUrls } from '../utils/listingImagePreloader'
import { getSeoListingPage, mapSeoPlaceToCard, type SeoPlaceSummary } from '../utils/seoApi'
import { BRAND_NAME, PRODUCT_NAME, SEO_LANDING_TARGETS } from '../utils/seoLandingPages'
import type { PlaceDetail } from '../types/appTypes'

type CategoryPlacesPageProps = {
  categorySlug: string
  search?: string
  navigationSource?: 'push' | 'replace' | 'pop'
}

const PAGE_SIZE = 12

type CategoryPlacesResponse = {
  items: SeoPlaceSummary[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

const EMPTY_CATEGORY_PLACES_RESPONSE: CategoryPlacesResponse = {
  items: [],
  total: 0,
  page: 1,
  pageSize: PAGE_SIZE,
  totalPages: 1,
}

function sortPlacesAlphabetically(places: SeoPlaceSummary[]) {
  return [...places].sort((left, right) => left.name.localeCompare(right.name))
}

function CategoryPlacesPage({ categorySlug, search = '', navigationSource = 'push' }: CategoryPlacesPageProps) {
  const [routeCache] = useState(() => {
    const currentPath = `${window.location.pathname}${window.location.search}`
    return navigationSource === 'pop' ? readListingRouteCache() : peekPendingListingRouteCache(currentPath)
  })
  const [payload, setPayload] = useState<CategoryPlacesResponse>(() =>
    routeCache
      ? {
          items: (routeCache.items as SeoPlaceSummary[]) ?? [],
          total: routeCache.total,
          page: routeCache.page,
          pageSize: routeCache.pageSize,
          totalPages: routeCache.totalPages,
        }
      : EMPTY_CATEGORY_PLACES_RESPONSE
  )
  const [isLoading, setIsLoading] = useState(() => !routeCache)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(
    navigationSource === 'pop' && routeCache?.pendingScrollRestore ? routeCache.selectedPlaceId : null,
  )
  const [placeDetailsBySlug, setPlaceDetailsBySlug] = useState<Record<string, PlaceDetail>>(
    () => {
      if (navigationSource === 'pop' && routeCache) {
        const slugs = (routeCache.items as SeoPlaceSummary[]).map((s) => s.slug).filter(Boolean)
        const cached: Record<string, PlaceDetail> = {}
        for (const slug of slugs) {
          const detail = readCachedPlaceDetail(slug)
          if (detail) cached[detail.slug] = detail
        }
        return cached
      }
      return {}
    }
  )
  const hasRestoredInitialScrollRef = useRef(false)
  const skipInitialFetchRef = useRef(Boolean(routeCache) && navigationSource !== 'pop')
  const pageDataReadyRef = useRef<number | null>(null)
  const categoryLabel = getPlaceCategoryLabel(categorySlug)
  const iconName = getCategoryIconName(categoryLabel)
  const searchParams = useMemo(() => new URLSearchParams(search), [search])
  const currentPage = Math.max(Number(searchParams.get('page') || '1') || 1, 1)
  const [confirmedPage, setConfirmedPage] = useState(() => routeCache?.page ?? currentPage)
  const hasQueryVariant = currentPage > 1
  const shouldIndexCategoryPage = !hasQueryVariant && !errorMessage && payload.total > 0
  const getPagePath = (page: number) => {
    const params = new URLSearchParams()
    if (page > 1) {
      params.set('page', String(page))
    }

    return params.toString() ? `/places/categories/${categorySlug}?${params.toString()}` : `/places/categories/${categorySlug}`
  }

  useLayoutEffect(() => {
    if (navigationSource === 'pop') {
      return
    }

    scrollViewportToTopInstant()
  }, [navigationSource, categorySlug, currentPage])

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
          category: categorySlug,
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

        setPayload(EMPTY_CATEGORY_PLACES_RESPONSE)
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load category page.')
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
          setIsRefreshing(false)
        }
      }
    }

    void loadPage()

    return () => controller.abort()
  }, [categorySlug, currentPage])

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

  const places = useMemo(() => sortPlacesAlphabetically(payload.items), [payload.items])

  useEffect(() => {
    const criticalImageUrls = places
      .slice(0, 4)
      .map((place) => {
        const livePlace = placeDetailsBySlug[place.slug]
        return livePlace?.thumbnailUrl?.trim() || livePlace?.imageUrl?.trim() || null
      })
      .filter((imageUrl): imageUrl is string => Boolean(imageUrl))

    preloadListingImageUrls(criticalImageUrls)
  }, [places, placeDetailsBySlug])

  const totalPages = payload.totalPages
  const safePage = confirmedPage
  const isPageTransitionLoading = isLoading || isRefreshing
  const shouldShowInitialSkeleton = isLoading && payload.items.length === 0 && !errorMessage
  const shouldShowEmptyState = !isPageTransitionLoading && places.length === 0 && !errorMessage
  const fetchPlacesForPage = async (page: number, signal?: AbortSignal) => {
    return getSeoListingPage({
      category: categorySlug,
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
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load category page.')
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    if (!isPageTransitionLoading && selectedPlaceId && !places.some((place) => place.id === selectedPlaceId)) {
      setSelectedPlaceId(null)
    }
  }, [isPageTransitionLoading, places, selectedPlaceId])

  const jsonLd = !errorMessage
    && shouldIndexCategoryPage
    ? [
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: `${categoryLabel} Places | ${BRAND_NAME}`,
          description: `${PRODUCT_NAME} helps you browse ${categoryLabel.toLowerCase()} places across Metro Manila with category SEO pages and place-level discovery details.`,
          url: `${getSiteOrigin()}/places/categories/${encodeURIComponent(categorySlug)}`,
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${getSiteOrigin()}/home` },
            { '@type': 'ListItem', position: 2, name: 'Places', item: `${getSiteOrigin()}/places` },
            { '@type': 'ListItem', position: 3, name: 'Categories', item: `${getSiteOrigin()}/places/categories` },
            { '@type': 'ListItem', position: 4, name: categoryLabel, item: `${getSiteOrigin()}/places/categories/${encodeURIComponent(categorySlug)}` },
          ],
        },
        {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          itemListElement: places.map((place, index) => ({
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
        title={`${categoryLabel} Places in Metro Manila | ${BRAND_NAME}`}
        description={`${PRODUCT_NAME} helps you explore ${categoryLabel.toLowerCase()} places across Metro Manila, compare local options, and open detailed place pages for planning.`}
        canonicalPath={`/places/categories/${encodeURIComponent(categorySlug)}`}
        robots={shouldIndexCategoryPage ? 'index,follow' : 'noindex,follow'}
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
            { label: 'Categories', href: '/places/categories', icon: <FontAwesomeIcon icon={faTableCellsLarge} className="h-3.5 w-3.5" /> },
            { label: categoryLabel, icon: <AppIcon name={iconName} className="h-3.5 w-3.5" /> },
          ]}
        />

        <section className="mt-5 pb-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <AppIcon name={iconName} className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-[2.15rem] font-black leading-[0.95] tracking-[-0.045em] text-slate-950 sm:text-[2.6rem]">
            {categoryLabel} places in Metro Manila
          </h1>
          <p className="mt-3 max-w-[40rem] text-[15px] leading-7 text-[var(--muted)]">
            Explore search-friendly {categoryLabel.toLowerCase()} recommendations and jump into local pages for more specific gala ideas.
          </p>
        </section>

        {errorMessage ? (
          <section className="mt-6 rounded-[24px] border border-[#E5E7EB] bg-white px-5 py-6 shadow-[0_6px_20px_rgba(17,24,39,0.03)]">
            <h2 className="text-base font-semibold text-[var(--text-main)]">We couldn't load {categoryLabel.toLowerCase()} places right now.</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">Please try again in a bit.</p>
          </section>
        ) : null}

        {!errorMessage ? (
          <>
            {shouldShowInitialSkeleton ? (
              <PlaceListingSkeleton
                cardCount={PAGE_SIZE}
                helperText={`Loading ${categoryLabel.toLowerCase()} places.`}
              />
            ) : shouldShowEmptyState ? (
              <section className="mt-10 rounded-[28px] border border-[#e5e7eb] bg-white px-5 py-8 text-center shadow-sm sm:px-6">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                  <AppIcon name="compass" className="h-7 w-7" />
                </div>
                <h2 className="mt-4 text-[1.2rem] font-black text-slate-950">No {categoryLabel.toLowerCase()} places found yet.</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Check back later or try another category page.
                </p>
              </section>
            ) : (
              <section className="mt-9">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-[1.35rem] font-black tracking-[-0.03em] text-slate-950">{categoryLabel} places</h2>
                    <p className="mt-1 text-[13px] leading-6 text-[var(--muted)]">Browse spots across Metro Manila that match this category.</p>
                  </div>
                </div>
                <div className={`mt-4 transition ${isPageTransitionLoading ? 'pointer-events-none opacity-60' : 'opacity-100'}`}>
                  <ResponsiveGrid className="gap-4">
                  {places.map((rawPlace, index) => {
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
                {SEO_LANDING_TARGETS.some((target) => target.category === categorySlug) ? (
                  <div className="mt-6 rounded-[24px] border border-[#E5E7EB] bg-white px-5 py-5 shadow-[0_6px_20px_rgba(17,24,39,0.03)]">
                    <h3 className="text-sm font-semibold text-slate-950">Related search-style guides</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {SEO_LANDING_TARGETS.filter((target) => target.category === categorySlug).slice(0, 4).map((target) => (
                        <button
                          key={target.slug}
                          type="button"
                          onClick={() => navigateToPath(`/guides/${target.slug}`)}
                          className="rounded-full border border-[#DBEAFE] bg-[#F8FBFF] px-3 py-1.5 text-xs font-semibold text-[var(--accent)] transition hover:border-[var(--accent)]"
                        >
                          {target.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            )}

            {places.length > 0 && totalPages > 1 ? (
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

export default CategoryPlacesPage
