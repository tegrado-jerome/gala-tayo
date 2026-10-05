import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import CompactPagination from '../components/CompactPagination'
import PlaceCard, { withLiveDetail } from '../components/PlaceCard'
import { ListingBreadcrumb } from '../components/home/search/SearchComponents'
import { useGuestAuthPrompt } from '../components/GuestAuthPrompt'
import PlaceListingSkeleton from '../components/PlaceListingSkeleton'
import { Button, Empty, Page, SectionHead, cx } from '../components/ui'
import InternalLink from '../components/InternalLink'
import SeoHead from '../components/SeoHead'
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
  const listingGuestAuth = useGuestAuthPrompt()
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
          description: `${PRODUCT_NAME} helps you browse ${categoryLabel.toLowerCase()} places across Metro Manila and open a page for each one with budget, best time to visit and location.`,
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

  const relatedGuides = SEO_LANDING_TARGETS.filter((target) => target.category === categorySlug).slice(0, 4)

  return (
    <Page>
      <SeoHead
        title={`${categoryLabel} Places in Metro Manila | ${BRAND_NAME}`}
        description={`${PRODUCT_NAME} helps you explore ${categoryLabel.toLowerCase()} places across Metro Manila, compare local options, and open detailed place pages for planning.`}
        canonicalPath={`/places/categories/${encodeURIComponent(categorySlug)}`}
        robots={shouldIndexCategoryPage ? 'index,follow' : 'noindex,follow'}
        jsonLd={jsonLd}
      />

      <ListingBreadcrumb
        items={[
          { label: 'Home', href: '/home' },
          { label: 'Places', href: '/places' },
          { label: 'Categories', href: '/places/categories' },
          { label: categoryLabel },
        ]}
      />

      <header className="mt-5 max-w-[40rem]">
        <h1 className="g-h1">{categoryLabel} places in Metro Manila</h1>
        <p className="g-mut mt-2">{categoryLabel} spots across Metro Manila</p>
      </header>

      {errorMessage ? (
        <Empty className="mt-8" title={`Hindi ma-load ang ${categoryLabel.toLowerCase()} places`} description="Please try again in a bit." />
      ) : shouldShowInitialSkeleton ? (
        <PlaceListingSkeleton cardCount={PAGE_SIZE} helperText={`Loading ${categoryLabel.toLowerCase()} places.`} />
      ) : shouldShowEmptyState ? (
        <Empty
          className="mt-8"
          title={`Wala pang ${categoryLabel.toLowerCase()} places`}
          description="Check back later or try another category."
          action={<Button variant="line" href="/places/categories">See all categories</Button>}
        />
      ) : (
        <section aria-label={`${categoryLabel} places`}>
          <div className={cx('g-grid mt-6 transition-opacity', isPageTransitionLoading && 'pointer-events-none opacity-60')}>
            {places.map((rawPlace) => (
              <PlaceCard
                key={rawPlace.id}
                place={withLiveDetail(
                  { ...mapSeoPlaceToCard(rawPlace), imageUrl: null, curatedImageUrls: [], budget_min: rawPlace.budgetMin, good_for: rawPlace.goodFor },
                  placeDetailsBySlug[rawPlace.slug],
                )}
                selected={selectedPlaceId === rawPlace.id}
                onGuestSave={() => listingGuestAuth.open('favorite')}
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
            ))}
          </div>

          {places.length > 0 && totalPages > 1 ? (
            <CompactPagination
              className="mt-10"
              currentPage={safePage}
              totalPages={totalPages}
              totalItems={payload.total}
              pageSize={payload.pageSize}
              onPageChange={handlePageChange}
              isLoading={isPageTransitionLoading}
            />
          ) : null}

          {relatedGuides.length > 0 ? (
            <>
              <SectionHead title="Related guides" as="h3" />
              <div className="flex flex-wrap gap-2">
                {relatedGuides.map((target) => (
                  <InternalLink key={target.slug} href={`/guides/${target.slug}`} className="g-chip">
                    {target.label}
                  </InternalLink>
                ))}
              </div>
            </>
          ) : null}
        </section>
      )}
      {listingGuestAuth.promptElement}
    </Page>
  )
}

export default CategoryPlacesPage
