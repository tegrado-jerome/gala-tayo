import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import CompactPagination from '../components/CompactPagination'
import VibeChips from '../components/discover/VibeChips'
import PlaceCard, { withLiveDetail } from '../components/PlaceCard'
import { ListToolbar, ListingBreadcrumb, MasonrySkeleton } from '../components/home/search/SearchComponents'
import { useGuestAuthPrompt } from '../components/GuestAuthPrompt'
import { Button, Empty, Masonry, Page, SectionHead, cx } from '../components/ui'
import InternalLink from '../components/InternalLink'
import SeoHead from '../components/SeoHead'
import { METRO_MANILA_REGION_SLUG, getAreaLabelBySlug, getDestinationBySlug, getRegionBySlug, normalizeAreaSlug } from '../data/destinations'
import { displayCityName } from '../utils/cityName'
import { countPlacesByAreaSlug, loadCompactPlaces, type CompactPlace } from '../utils/compactPlaces'
import { navigateToPath, replaceWithPath, scrollViewportToTopInstant } from '../utils/navigation'
import { formatLabelFromSlug, getSiteOrigin } from '../utils/seo'
import { getListingPlaceViewportTop, peekPendingListingRouteCache, readListingRouteCache, restoreListingRouteScroll, writeListingRouteCache } from '../utils/listingRouteCache'
import { fetchPlaceDetailsBatch, readCachedPlaceDetail } from '../utils/placeDetailCache'
import { preloadListingImageUrls } from '../utils/listingImagePreloader'
import { getSeoListingPage, mapSeoPlaceToCard, type SeoPlaceSummary } from '../utils/seoApi'
import { getVibeListingPage, placesInArea } from '../utils/vibeListings'
import { getVibe, parseVibe, vibeForCategory, vibeHref, vibesWithPlaces } from '../utils/vibes'
import { BRAND_NAME, PRODUCT_NAME, SEO_LANDING_TARGETS, withBrand } from '../utils/seoLandingPages'
import { AREA_SEO } from '../data/listingSeo'
import { FaqList, QuickAnswer } from '../components/QuickAnswer'
import { describeBestFor, describeBudgetRange, faqJsonLd } from '../utils/seoAnswers'
import type { PlaceDetail } from '../types/appTypes'

const MIN_INDEXABLE_AREA_PLACES = 3

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
  const activeVibe = parseVibe(searchParams.get('vibe'))
  const legacyCategory = searchParams.get('category')
  const currentPage = Math.max(Number(searchParams.get('page') || '1') || 1, 1)
  const [confirmedPage, setConfirmedPage] = useState(() => routeCache?.page ?? currentPage)
  const [compactPlaces, setCompactPlaces] = useState<CompactPlace[] | null>(null)
  useEffect(() => {
    let isActive = true
    loadCompactPlaces().then((places) => isActive && setCompactPlaces(places)).catch(() => undefined)
    return () => {
      isActive = false
    }
  }, [])
  const areaVibes = compactPlaces ? vibesWithPlaces(placesInArea(compactPlaces, normalizedAreaSlug)) : []
  const vibeInfo = activeVibe ? getVibe(activeVibe) : null
  // Old ?category= links (place types) open the closest vibe instead.
  useLayoutEffect(() => {
    if (legacyCategory && !activeVibe) replaceWithPath(vibeHref(`/places/${normalizedAreaSlug}`, vibeForCategory(legacyCategory)))
  }, [activeVibe, legacyCategory, normalizedAreaSlug])
  const hasQueryVariant = activeVibe !== null || currentPage > 1
  // A city page with one or two places is thin; it stays reachable but noindex (and out of the sitemap).
  const shouldIndexAreaPage = !hasQueryVariant && !errorMessage && payload.total >= MIN_INDEXABLE_AREA_PLACES
  const getPagePath = (page: number, vibe = activeVibe) => vibeHref(`/places/${normalizedAreaSlug}`, vibe, page)
  // A vibe list is filtered from the compact place list; the plain list comes from the listing API.
  const loadListingPage = (page: number, signal?: AbortSignal) =>
    activeVibe
      ? getVibeListingPage({ areaSlug: normalizedAreaSlug, vibe: activeVibe, page, pageSize: PAGE_SIZE })
      : getSeoListingPage({ areaSlug: normalizedAreaSlug, page, pageSize: PAGE_SIZE, signal })

  useLayoutEffect(() => {
    if (navigationSource === 'pop') {
      return
    }

    scrollViewportToTopInstant()
  }, [navigationSource, areaSlug, activeVibe, currentPage])

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
        const data = await loadListingPage(currentPage, controller.signal)

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
  }, [activeVibe, currentPage, normalizedAreaSlug])

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
  const homeRegion = destination ? getRegionBySlug(destination.regionSlug) : null
  const handlePageChange = async (page: number) => {
    const nextPage = Math.min(Math.max(page, 1), totalPages)

    if (nextPage === confirmedPage || nextPage === currentPage) {
      return
    }

    setIsRefreshing(true)
    setErrorMessage(null)

    try {
      const data = await loadListingPage(nextPage)
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
          description: `${PRODUCT_NAME} helps you browse places in ${areaName}, compare categories and find local trip ideas.`,
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
  // Every place in the area gets a plain link from this page, not only the first page of cards.
  const shownSlugs = new Set(allPlaces.map((place) => place.slug))
  const regionAreaSlugs = region ? new Set(region.destinations.map((item) => item.slug)) : null
  const morePlaces = shouldIndexAreaPage && compactPlaces && payload.total > allPlaces.length
    ? compactPlaces.filter((place) => (regionAreaSlugs ? regionAreaSlugs.has(place.areaSlug) : place.areaSlug === normalizedAreaSlug) && !shownSlugs.has(place.slug))
    : []
  const areaCounts = compactPlaces ? countPlacesByAreaSlug(compactPlaces) : null
  const spotCount = payload.total > 0 ? `: ${payload.total} Top ${payload.total === 1 ? 'Spot' : 'Spots'}` : ''
  const baseTitle = `Things to Do in ${areaName}${spotCount}`
  const areaSeo = AREA_SEO[normalizedAreaSlug]
  const pageTitle = withBrand(vibeInfo ? `${vibeInfo.title} in ${areaName}` : areaSeo?.title ?? baseTitle)
  const topNames = allPlaces.slice(0, 3).map((place) => place.name)
  // Answer-first block and FAQs only on the main city page, built from the places it lists.
  const showAnswers = shouldIndexAreaPage && !isPageTransitionLoading && topNames.length === 3
  const budgetRange = describeBudgetRange(allPlaces.map((place) => place.budgetMin))
  const areaFaqs = showAnswers
    ? [
        { question: `What are the best tourist spots in ${areaName}?`, answer: `${topNames[0]}, ${topNames[1]} and ${topNames[2]} top the list, out of ${payload.total} top places in ${areaName} ranked best first on this page.` },
        ...(budgetRange && budgetRange !== 'Free' ? [{ question: `How much do places in ${areaName} cost?`, answer: `Starting prices for the top picks run ${budgetRange}. Each place page breaks down what the money covers.` }] : []),
        ...(areaSeo?.faqs ?? []),
      ]
    : []
  // Towns that share a name already carry their province ("Pandan, Antique"), so it is not added twice.
  const placeName = destination && parentRegion && !areaName.endsWith(`, ${destination.provinceName}`) ? `${areaName}, ${destination.provinceName}` : areaName
  const pageDescription = areaSeo?.description ?? (topNames.length
    ? `${payload.total} top ${payload.total === 1 ? 'place' : 'places'} in ${placeName}, like ${topNames.length > 1 ? `${topNames.slice(0, -1).join(', ')} and ${topNames.at(-1)}` : topNames[0]}, with the budget per head and the best time to go.`
    : `${PRODUCT_NAME} lists the top places in ${areaName}, from food spots to parks, museums and date ideas ${region ? 'in every city of the region' : areaScope}.`)

  return (
    <Page>
      <SeoHead
        title={pageTitle}
        description={pageDescription}
        canonicalPath={`/places/${encodeURIComponent(normalizedAreaSlug)}`}
        image={{ url: `/og/places/${encodeURIComponent(normalizedAreaSlug)}.jpg`, alt: `Things to do in ${areaName}`, width: 1200, height: 630 }}
        robots={shouldIndexAreaPage ? 'index,follow' : 'noindex,follow'}
        jsonLd={jsonLd && areaFaqs.length ? [...jsonLd, faqJsonLd(areaFaqs)] : jsonLd}
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
        <h1 className="g-h1">{vibeInfo ? `${vibeInfo.title} in ${areaName}` : `Things to do in ${areaName}`}</h1>
        <p className="g-mut mt-2">{vibeInfo?.blurb ?? areaSeo?.subtitle ?? `Tourist spots, food stops and day-out ideas in ${placeName}, ranked best first.`}</p>
      </header>

      {showAnswers ? (
        <QuickAnswer
          rows={[
            { label: 'Best for', value: describeBestFor(allPlaces.map((place) => place.goodFor)) },
            { label: 'Budget', value: budgetRange ? `${budgetRange}, starting prices before transport` : null },
            { label: 'Getting there', value: areaSeo?.gettingThere },
          ]}
        />
      ) : null}

      {region ? (
        <nav aria-label={`Cities in ${region.name}`} className="g-chips mt-4">
          {region.destinations.filter((item) => !areaCounts || areaCounts[item.slug]).map((item) => (
            <InternalLink key={item.slug} href={`/places/${item.slug}`} className="g-chip">
              {displayCityName(item.label)}
            </InternalLink>
          ))}
        </nav>
      ) : null}

      {/* Only vibes with places here; a city with fewer than two has nothing to filter. */}
      {areaVibes.length >= 2 || activeVibe ? <VibeChips active={activeVibe} getHref={(id) => getPagePath(1, id)} available={areaVibes} /> : null}
      <ListToolbar count={payload.total > 0 ? `${payload.total.toLocaleString('en-PH')} ${payload.total === 1 ? 'place' : 'places'}` : null} sort="Best first" />

      {errorMessage ? (
        <Empty className="mt-8" title={`Couldn't load places in ${areaName}`} description="Please try again in a bit." />
      ) : shouldShowInitialSkeleton ? (
        <div className="mt-2" aria-busy="true">
          <span className="sr-only">Loading places in {areaName}.</span>
          <MasonrySkeleton count={PAGE_SIZE} />
        </div>
      ) : shouldShowEmptyState ? (
        <Empty
          className="mt-8"
          title={vibeInfo ? `No ${vibeInfo.title.toLowerCase()} in ${areaName} yet` : `No places in ${areaName} yet`}
          description={activeVibe ? 'New spots are on the way! Try another vibe in this city.' : 'New spots are on the way!'}
          action={
            activeVibe ? (
              <Button variant="line" href={getPagePath(1, null)}>See everything in {areaName}</Button>
            ) : homeRegion && homeRegion.slug !== normalizedAreaSlug ? (
              <Button variant="line" href={`/places/${homeRegion.slug}`}>See places in {homeRegion.name}</Button>
            ) : (
              <Button variant="line" href="/places">Browse other cities</Button>
            )
          }
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

          {morePlaces.length > 0 ? (
            <nav aria-label={`More places in ${areaName}`}>
              <SectionHead title={`More places in ${areaName}`} as="h3" />
              <div className="flex flex-wrap gap-2">
                {morePlaces.map((place) => (
                  <InternalLink key={place.slug} href={place.canonicalPath} className="g-chip">
                    {place.name}
                  </InternalLink>
                ))}
              </div>
            </nav>
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

          {areaFaqs.length ? (
            <section aria-labelledby="area-faq-title" className="mt-14 max-w-[46rem]">
              <h2 id="area-faq-title" className="g-h2">
                Good to know
              </h2>
              <FaqList faqs={areaFaqs} />
            </section>
          ) : null}
        </section>
      )}
      {listingGuestAuth.promptElement}
    </Page>
  )
}

export default AreaPlacesPage
