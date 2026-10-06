import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import CompactPagination from '../components/CompactPagination'
import CategoryTabs from '../components/discover/CategoryTabs'
import PlaceCard, { withLiveDetail } from '../components/PlaceCard'
import { ListToolbar, ListingBreadcrumb, MasonrySkeleton } from '../components/home/search/SearchComponents'
import { useGuestAuthPrompt } from '../components/GuestAuthPrompt'
import { Button, Empty, Masonry, Page, SectionHead, cx } from '../components/ui'
import InternalLink from '../components/InternalLink'
import SeoHead from '../components/SeoHead'
import { METRO_MANILA_REGION_SLUG, getAreaLabelBySlug, getDestinationBySlug, getRegionBySlug, normalizeAreaSlug } from '../data/destinations'
import { displayCityName } from '../utils/cityName'
import { navigateToPath, scrollViewportToTopInstant } from '../utils/navigation'
import { formatLabelFromSlug, getSiteOrigin } from '../utils/seo'
import { getListingPlaceViewportTop, peekPendingListingRouteCache, readListingRouteCache, restoreListingRouteScroll, writeListingRouteCache } from '../utils/listingRouteCache'
import { fetchPlaceDetailsBatch, readCachedPlaceDetail } from '../utils/placeDetailCache'
import { preloadListingImageUrls } from '../utils/listingImagePreloader'
import { getSeoListingPage, mapSeoPlaceToCard, type SeoPlaceSummary } from '../utils/seoApi'
import { BRAND_NAME, PRODUCT_NAME, SEO_LANDING_TARGETS } from '../utils/seoLandingPages'
import type { PlaceDetail } from '../types/appTypes'

type AreaPlacesPageProps = {
  areaSlug: string
  search?: string
  navigationSource?: 'push' | 'replace' | 'pop'
}

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

function AreaPlacesPage({ areaSlug, search = '', navigationSource = 'push' }: AreaPlacesPageProps) {
  const listingGuestAuth = useGuestAuthPrompt()
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
  const areaName = getAreaLabelBySlug(normalizedAreaSlug) || formatLabelFromSlug(normalizedAreaSlug)
  const destination = getDestinationBySlug(normalizedAreaSlug)
  const region = getRegionBySlug(normalizedAreaSlug)
  const parentRegion = destination && destination.regionSlug !== METRO_MANILA_REGION_SLUG ? getRegionBySlug(destination.regionSlug) : null
  const areaScope = !destination || destination.regionSlug === METRO_MANILA_REGION_SLUG
    ? 'across Metro Manila'
    : `around ${destination.provinceName}`
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

  const allPlaces = payload.items

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
          name: `${areaName} Places | ${BRAND_NAME}`,
          description: `${PRODUCT_NAME} helps you browse places in ${areaName}, compare categories, and find local gala ideas.`,
          url: `${getSiteOrigin()}/places/${encodeURIComponent(normalizedAreaSlug)}`,
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${getSiteOrigin()}/` },
            { '@type': 'ListItem', position: 2, name: 'Places', item: `${getSiteOrigin()}/places` },
            ...(parentRegion
              ? [{ '@type': 'ListItem', position: 3, name: parentRegion.name, item: `${getSiteOrigin()}/places/${parentRegion.slug}` }]
              : []),
            {
              '@type': 'ListItem',
              position: parentRegion ? 4 : 3,
              name: areaName,
              item: `${getSiteOrigin()}/places/${encodeURIComponent(normalizedAreaSlug)}`,
            },
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

  const relatedGuides = SEO_LANDING_TARGETS.filter((target) => target.areaSlug === normalizedAreaSlug).slice(0, 4)

  return (
    <Page>
      <SeoHead
        title={`Places in ${areaName} and Local Gala Ideas | ${BRAND_NAME}`}
        description={
          region
            ? `${PRODUCT_NAME} helps you discover places in ${areaName}, from cafes and food spots to parks, museums, and date ideas in every city of the region.`
            : `${PRODUCT_NAME} helps you discover places in ${areaName}, from cafes and food spots to parks, museums, and date ideas ${areaScope}.`
        }
        canonicalPath={`/places/${encodeURIComponent(normalizedAreaSlug)}`}
        robots={shouldIndexAreaPage ? 'index,follow' : 'noindex,follow'}
        jsonLd={jsonLd}
      />

      <ListingBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Places', href: '/places' },
          ...(parentRegion ? [{ label: parentRegion.name, href: `/places/${parentRegion.slug}` }] : []),
          { label: areaName },
        ]}
      />

      <header className="mt-5 max-w-[36rem]">
        <h1 className="g-h1">Places in {areaName}</h1>
        <p className="g-mut mt-2">
          {destination && parentRegion ? `Cafes, parks and food spots in ${areaName}, ${destination.provinceName}` : `Cafes, parks and food spots in ${areaName}`}
        </p>
      </header>

      {region ? (
        <nav aria-label={`Cities in ${region.name}`} className="g-chips mt-4">
          {region.destinations.map((item) => (
            <InternalLink key={item.slug} href={`/places/${item.slug}`} className="g-chip">
              {displayCityName(item.label)}
            </InternalLink>
          ))}
        </nav>
      ) : null}

      <CategoryTabs active={activeCategory} getHref={(value) => getPagePath(1, value)} />
      <ListToolbar count={payload.total > 0 ? `${payload.total.toLocaleString('en-PH')} ${payload.total === 1 ? 'place' : 'places'}` : null} sort="Best first" />

      {errorMessage ? (
        <Empty className="mt-8" title={`Hindi ma-load ang places in ${areaName}`} description="Please try again in a bit." />
      ) : shouldShowInitialSkeleton ? (
        <div className="mt-2" aria-busy="true">
          <span className="sr-only">Loading places in {areaName}.</span>
          <MasonrySkeleton count={PAGE_SIZE} />
        </div>
      ) : shouldShowEmptyState ? (
        <Empty
          className="mt-8"
          title={`Wala pang places in ${areaName}`}
          description="Check back later for new gala spots, or try another category in this city."
          action={<Button variant="line" href="/places">Browse other cities</Button>}
        />
      ) : (
        <section aria-label={`Places in ${areaName}`}>
          <Masonry className={cx('mt-2 transition-opacity', isPageTransitionLoading && 'pointer-events-none opacity-60')}>
            {allPlaces.map((rawPlace, index) => (
              <PlaceCard
                key={rawPlace.id}
                priority={index < 2}
                place={withLiveDetail(
                  { ...mapSeoPlaceToCard(rawPlace), imageUrl: null, curatedImageUrls: [], budget_min: rawPlace.budgetMin, good_for: rawPlace.goodFor },
                  placeDetailsBySlug[rawPlace.slug],
                )}
                selected={selectedPlaceId === rawPlace.id}
                onGuestSave={(retry) => listingGuestAuth.open('favorite', retry)}
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
          </Masonry>

          {allPlaces.length > 0 && totalPages > 1 ? (
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
              <SectionHead title={`Popular guides for ${areaName}`} as="h3" />
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

export default AreaPlacesPage
