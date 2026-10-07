import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import CompactPagination from '../components/CompactPagination'
import VibeChips from '../components/discover/VibeChips'
import PlaceCard, { withLiveDetail } from '../components/PlaceCard'
import { ListToolbar, ListingBreadcrumb, MasonrySkeleton } from '../components/home/search/SearchComponents'
import { useGuestAuthPrompt } from '../components/GuestAuthPrompt'
import { Button, Empty, Masonry, Page, cx } from '../components/ui'
import SeoHead from '../components/SeoHead'
import { navigateToPath, scrollViewportToTopInstant } from '../utils/navigation'
import { getListingPlaceViewportTop, peekPendingListingRouteCache, readListingRouteCache, restoreListingRouteScroll, writeListingRouteCache } from '../utils/listingRouteCache'
import { fetchPlaceDetailsBatch, readCachedPlaceDetail } from '../utils/placeDetailCache'
import { preloadListingImageUrls } from '../utils/listingImagePreloader'
import { mapSeoPlaceToCard, type SeoListingPageResponse, type SeoPlaceSummary } from '../utils/seoApi'
import { BRAND_NAME } from '../utils/seoLandingPages'
import { getVibeListingPage } from '../utils/vibeListings'
import { getVibe, vibeHref, type VibeId } from '../utils/vibes'
import type { PlaceDetail } from '../types/appTypes'

type VibePlacesPageProps = {
  vibe: VibeId
  search?: string
  navigationSource?: 'push' | 'replace' | 'pop'
}

const PAGE_SIZE = 12

const EMPTY_RESPONSE: SeoListingPageResponse = { items: [], total: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 1 }

/**
 * Places around the country that fit one vibe (/places?vibe=beach). A filtered view of /places, so it is
 * noindex with /places as its canonical; the vibe chips on top switch vibes in place.
 */
function VibePlacesPage({ vibe, search = '', navigationSource = 'push' }: VibePlacesPageProps) {
  const listingGuestAuth = useGuestAuthPrompt()
  const { label, title, blurb } = getVibe(vibe)
  const [routeCache] = useState(() => {
    const currentPath = `${window.location.pathname}${window.location.search}`
    return navigationSource === 'pop' ? readListingRouteCache() : peekPendingListingRouteCache(currentPath)
  })
  const [payload, setPayload] = useState<SeoListingPageResponse>(() =>
    routeCache
      ? { items: (routeCache.items as SeoPlaceSummary[]) ?? [], total: routeCache.total, page: routeCache.page, pageSize: routeCache.pageSize, totalPages: routeCache.totalPages }
      : EMPTY_RESPONSE,
  )
  const [isLoading, setIsLoading] = useState(() => !routeCache)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(navigationSource === 'pop' && routeCache?.pendingScrollRestore ? routeCache.selectedPlaceId : null)
  const [placeDetailsBySlug, setPlaceDetailsBySlug] = useState<Record<string, PlaceDetail>>(() => {
    if (navigationSource !== 'pop' || !routeCache) return {}
    const cached: Record<string, PlaceDetail> = {}
    for (const item of routeCache.items as SeoPlaceSummary[]) {
      const detail = item.slug ? readCachedPlaceDetail(item.slug) : null
      if (detail) cached[detail.slug] = detail
    }
    return cached
  })
  const hasRestoredInitialScrollRef = useRef(false)
  const skipInitialFetchRef = useRef(Boolean(routeCache) && navigationSource !== 'pop')
  const pageDataReadyRef = useRef<number | null>(null)
  const searchParams = useMemo(() => new URLSearchParams(search), [search])
  const currentPage = Math.max(Number(searchParams.get('page') || '1') || 1, 1)
  const [confirmedPage, setConfirmedPage] = useState(() => routeCache?.page ?? currentPage)

  useLayoutEffect(() => {
    if (navigationSource !== 'pop') scrollViewportToTopInstant()
  }, [navigationSource, vibe, currentPage])

  useEffect(() => {
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false
      return
    }
    if (pageDataReadyRef.current === currentPage) {
      pageDataReadyRef.current = null
      return
    }

    let isActive = true
    const hasVisibleCachedResults = payload.items.length > 0
    setIsLoading(!hasVisibleCachedResults)
    setIsRefreshing(hasVisibleCachedResults && navigationSource !== 'pop')
    setErrorMessage(null)
    getVibeListingPage({ areaSlug: null, vibe, page: currentPage, pageSize: PAGE_SIZE })
      .then((data) => {
        if (!isActive) return
        setPayload(data)
        setConfirmedPage(data.page)
      })
      .catch((error: unknown) => {
        if (!isActive) return
        setPayload(EMPTY_RESPONSE)
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load places.')
      })
      .finally(() => {
        if (!isActive) return
        setIsLoading(false)
        setIsRefreshing(false)
      })
    return () => {
      isActive = false
    }
  }, [vibe, currentPage])

  useEffect(() => {
    const slugs = Array.from(new Set(payload.items.map((item) => item.slug).filter(Boolean)))
    if (slugs.length === 0) {
      setPlaceDetailsBySlug({})
      return
    }
    let isActive = true
    void fetchPlaceDetailsBatch(slugs)
      .then((details) => isActive && setPlaceDetailsBySlug(Object.fromEntries(details.map((detail) => [detail.slug, detail]))))
      .catch(() => isActive && setPlaceDetailsBySlug({}))
    return () => {
      isActive = false
    }
  }, [payload.items])

  useLayoutEffect(() => {
    if (navigationSource !== 'pop' || hasRestoredInitialScrollRef.current) return
    const popCache = readListingRouteCache()
    if (!popCache?.pendingScrollRestore || !popCache.selectedPlaceId) return
    hasRestoredInitialScrollRef.current = true
    setSelectedPlaceId(popCache.selectedPlaceId)
    restoreListingRouteScroll(popCache)
    writeListingRouteCache({ ...popCache, pendingScrollRestore: false })
  }, [navigationSource])

  const places = payload.items

  useEffect(() => {
    const criticalImageUrls = places
      .slice(0, 4)
      .map((place) => placeDetailsBySlug[place.slug]?.thumbnailUrl?.trim() || placeDetailsBySlug[place.slug]?.imageUrl?.trim() || null)
      .filter((imageUrl): imageUrl is string => Boolean(imageUrl))
    preloadListingImageUrls(criticalImageUrls)
  }, [places, placeDetailsBySlug])

  const isPageTransitionLoading = isLoading || isRefreshing
  const shouldShowInitialSkeleton = isLoading && places.length === 0 && !errorMessage
  const shouldShowEmptyState = !isPageTransitionLoading && places.length === 0 && !errorMessage

  const handlePageChange = async (page: number) => {
    const nextPage = Math.min(Math.max(page, 1), payload.totalPages)
    if (nextPage === confirmedPage || nextPage === currentPage) return
    setIsRefreshing(true)
    setErrorMessage(null)
    try {
      const data = await getVibeListingPage({ areaSlug: null, vibe, page: nextPage, pageSize: PAGE_SIZE })
      setPayload(data)
      setConfirmedPage(data.page)
      pageDataReadyRef.current = nextPage
      navigateToPath(vibeHref('/places', vibe, nextPage))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load places.')
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    if (!isPageTransitionLoading && selectedPlaceId && !places.some((place) => place.id === selectedPlaceId)) setSelectedPlaceId(null)
  }, [isPageTransitionLoading, places, selectedPlaceId])

  return (
    <Page>
      <SeoHead
        title={`${title} in the Philippines | ${BRAND_NAME}`}
        description={`${blurb} The top ${title.toLowerCase()} around the Philippines, best first, with budgets and the best time to go.`}
        canonicalPath="/places"
        robots="noindex,follow"
      />

      <ListingBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Places', href: '/places' }, { label }]} />

      <header className="mt-5 max-w-[40rem]">
        <h1 className="g-h1">{title} around the Philippines</h1>
        <p className="g-mut mt-2">{blurb}</p>
      </header>

      <VibeChips active={vibe} getHref={(id) => vibeHref('/places', id)} />
      <ListToolbar count={payload.total > 0 ? `${payload.total.toLocaleString('en-PH')} ${payload.total === 1 ? 'place' : 'places'}` : null} sort="Best first" />

      {errorMessage ? (
        <Empty className="mt-8" title="Couldn't load these places" description="Please try again in a bit." />
      ) : shouldShowInitialSkeleton ? (
        <div className="mt-2" aria-busy="true">
          <span className="sr-only">Loading places.</span>
          <MasonrySkeleton count={PAGE_SIZE} />
        </div>
      ) : shouldShowEmptyState ? (
        <Empty className="mt-8" title="Nothing here yet" description="New spots are on the way! Try another vibe." action={<Button variant="line" href="/places">Browse by city</Button>} />
      ) : (
        <section aria-label={title}>
          <Masonry className={cx('mt-2 transition-opacity', isPageTransitionLoading && 'pointer-events-none opacity-60')}>
            {places.map((rawPlace, index) => (
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
                    ...payload,
                    scrollY: window.scrollY,
                    selectedPlaceId: rawPlace.id,
                    selectedPlaceViewportTop: getListingPlaceViewportTop(rawPlace.id),
                    pendingScrollRestore: true,
                  })
                }}
              />
            ))}
          </Masonry>

          {payload.totalPages > 1 ? (
            <CompactPagination
              className="mt-10"
              currentPage={confirmedPage}
              totalPages={payload.totalPages}
              totalItems={payload.total}
              pageSize={payload.pageSize}
              onPageChange={handlePageChange}
              isLoading={isPageTransitionLoading}
            />
          ) : null}
        </section>
      )}
      {listingGuestAuth.promptElement}
    </Page>
  )
}

export default VibePlacesPage
