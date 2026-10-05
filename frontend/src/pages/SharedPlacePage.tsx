import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import PlaceDetailView from '../components/PlaceDetailView'
import SeoHead from '../components/SeoHead'
import { Button, Empty, Page, Skeleton } from '../components/ui'
import { replaceWithPath } from '../utils/navigation'
import { getCanonicalPlacePath, getCategoryBreadcrumbMeta, getHistoryState, resolveAreaMeta } from '../utils/routes'
import { buildPlaceDescription, buildPlaceFaqSchema, getStructuredPlaceType } from '../utils/placeSeo'
import { mapBackendPlaceToCardData } from '../utils/placeMapping'
import { formatLabelFromSlug } from '../utils/routes'
import { getApiUrl } from '../utils/apiClient'
import { trackPlaceViewed } from '../utils/analytics'
import { getPublicSiteOrigin } from '../utils/site'
import { getSupabaseAccessToken, getSupabaseSession } from '../supabase'
import { clearHistoryCache } from '../utils/historyCache'
import type { PlaceDetail, PlaceDetailCardData } from '../types/appTypes'
import { cachePlaceDetail, readCachedPlaceDetail } from '../utils/placeDetailCache'
import { BRAND_NAME, PRODUCT_NAME } from '../utils/seoLandingPages'

export default function SharedPlacePage({
  slug,
  currentPathname,
  currentSearch = '',
  expectedAreaSlug = null,
  redirectToCanonical = false,
}: {
  slug: string
  currentPathname: string
  currentSearch?: string
  expectedAreaSlug?: string | null
  redirectToCanonical?: boolean
}) {
  const cachedPlaceDetail = useMemo(() => readCachedPlaceDetail(slug), [slug])
  const [place, setPlace] = useState<PlaceDetailCardData | null>(
    cachedPlaceDetail ? mapBackendPlaceToCardData(cachedPlaceDetail) : null
  )
  const [isLoading, setIsLoading] = useState(!cachedPlaceDetail)
  const [notFound, setNotFound] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const endpoint = useMemo(() => getApiUrl(`/places/${encodeURIComponent(slug)}`), [slug])

  useEffect(() => {
    const controller = new AbortController()

    const loadPlace = async () => {
      try {
        setNotFound(false)
        setErrorMessage(null)

        if (!cachedPlaceDetail) {
          setIsLoading(true)
          setPlace(null)
        }

        const response = await fetch(endpoint, {
          method: 'GET',
          signal: controller.signal,
        })

        if (response.status === 404) {
          setNotFound(true)
          setIsLoading(false)
          return
        }

        if (!response.ok) {
          throw new Error('Failed to load shared place.')
        }

        const data = (await response.json()) as PlaceDetail
        cachePlaceDetail(data)
        setPlace(mapBackendPlaceToCardData(data))
        setIsLoading(false)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load shared place.')
          setIsLoading(false)
        }
      }
    }

    void loadPlace()

    return () => controller.abort()
  }, [cachedPlaceDetail, endpoint, slug])

  const areaMeta = place ? resolveAreaMeta(place) : null
  const canonicalPath = place && areaMeta
    ? getCanonicalPlacePath({
        areaSlug: areaMeta.slug,
        placeSlug: place.slug,
      })
    : null
  const sharedPageSearchParams = useMemo(() => new URLSearchParams(currentSearch), [currentSearch])
  const rawListingLink = sharedPageSearchParams.get('from')
  const rawListingLabel = sharedPageSearchParams.get('fromLabel')
  const urlListingLink = rawListingLink && rawListingLink.startsWith('/') ? rawListingLink : null
  const urlListingLabel = rawListingLabel?.trim() || null

  const sessionReturn = useMemo(() => {
    try {
      const stored = window.sessionStorage.getItem(`galatayo:place-return:${slug}`)
      if (stored) {
        return JSON.parse(stored) as { source?: string; returnTo?: string; returnLabel?: string }
      }
    } catch {
      // sessionStorage may be unavailable, ignore
    }
    return null
  }, [slug])

  const historyReturn = useMemo(() => getHistoryState(), [currentPathname, currentSearch])
  const historyListingLink = historyReturn?.from?.startsWith('/') ? historyReturn.from : null
  const historyListingLabel = historyReturn?.fromLabel?.trim() || null

  const listingLink = urlListingLink || historyListingLink || sessionReturn?.returnTo || null
  const listingLabel = urlListingLabel || historyListingLabel || sessionReturn?.returnLabel || null

  const categoryBreadcrumbMeta = getCategoryBreadcrumbMeta(listingLink, listingLabel)

  useLayoutEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'auto',
    })
  }, [slug])

  useEffect(() => {
    if (!canonicalPath) {
      return
    }

    if ((redirectToCanonical || expectedAreaSlug !== null) && currentPathname !== canonicalPath) {
      replaceWithPath(canonicalPath)
    }
  }, [canonicalPath, currentPathname, expectedAreaSlug, redirectToCanonical])

  useEffect(() => {
    if (!place || !areaMeta || !canonicalPath) {
      return
    }

    trackPlaceViewed({
      placeSlug: place.slug,
      areaSlug: areaMeta.slug,
      category: place.category,
    })

    const recordHistory = async () => {
      try {
        const session = await getSupabaseSession()
        const token = await getSupabaseAccessToken(session)
        if (!token) return

        await fetch(getApiUrl('/history/place-view'), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ placeSlug: place.slug }),
        })

        if (session?.user?.id) {
          clearHistoryCache(session.user.id)
        }
      } catch {
        /* silently fail — history recording is non-critical */
      }
    }

    void recordHistory()
  }, [areaMeta, canonicalPath, place])

  if (isLoading) {
    return (
      <Page>
        <div aria-busy="true" aria-label="Loading place">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-4 h-8 w-2/3 max-w-[420px]" />
          <Skeleton className="mt-3 h-4 w-1/2 max-w-[320px]" />
          <Skeleton className="mt-6 h-[240px] w-full md:h-[400px]" />
          <div className="g-stats mt-6">
            <Skeleton className="h-[72px]" />
            <Skeleton className="h-[72px]" />
            <Skeleton className="h-[72px]" />
          </div>
        </div>
      </Page>
    )
  }

  if (notFound) {
    return (
      <>
        <SeoHead title="Not Found | GalaTayo" robots="noindex,follow" />
        <Page narrow>
          <Empty
            title="Place not found"
            description="We could not find this spot. Baka na-move or na-remove na."
            action={<Button href="/places">Browse places</Button>}
          />
        </Page>
      </>
    )
  }

  if (errorMessage) {
    return (
      <>
        <SeoHead title="Error | GalaTayo" robots="noindex,follow" />
        <Page narrow>
          <Empty
            title="Unable to load place"
            description={errorMessage}
            action={<Button onClick={() => window.location.reload()}>Try again</Button>}
          />
        </Page>
      </>
    )
  }

  if (!place) {
    return null
  }

  // Optional schema.org fields; each is only added when the place has the data.
  function buildPlaceSchemaExtras(detail: NonNullable<typeof place>) {
    const latitude = Number(detail.latitude ?? detail.coordinates?.lat)
    const longitude = Number(detail.longitude ?? detail.coordinates?.lng)
    const rating = Number(detail.rating)
    const reviewCount = Number(detail.ratingCount ?? String(detail.reviewCount ?? "").replace(/D/g, ""))
    const budget = detail.budget_min == null ? null : Number(detail.budget_min)
    return {
      ...(Number.isFinite(latitude) && Number.isFinite(longitude) && (latitude !== 0 || longitude !== 0)
        ? { geo: { '@type': 'GeoCoordinates', latitude, longitude } }
        : {}),
      ...(rating > 0 && reviewCount > 0
        ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(rating.toFixed(1)), reviewCount, bestRating: 5, worstRating: 1 } }
        : {}),
      ...(budget != null && Number.isFinite(budget)
        ? budget <= 0
          ? { isAccessibleForFree: true }
          : { priceRange: `From PHP ${Math.round(budget)}` }
        : {}),
      ...(detail.googleMapsUrl ? { hasMap: detail.googleMapsUrl } : {}),
    }
  }

  const placeJsonLd =
    place && areaMeta && canonicalPath
      ? {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: `${getPublicSiteOrigin()}/home` },
                { '@type': 'ListItem', position: 2, name: 'Places', item: `${getPublicSiteOrigin()}/places` },
                ...(categoryBreadcrumbMeta
                  ? [
                      { '@type': 'ListItem', position: 3, name: categoryBreadcrumbMeta.parentName, item: categoryBreadcrumbMeta.parentItem },
                      { '@type': 'ListItem', position: 4, name: categoryBreadcrumbMeta.childName, item: categoryBreadcrumbMeta.childItem },
                      { '@type': 'ListItem', position: 5, name: place.name, item: `${getPublicSiteOrigin()}${canonicalPath}` },
                    ]
                  : [
                      { '@type': 'ListItem', position: 3, name: areaMeta.name, item: `${getPublicSiteOrigin()}/places/${encodeURIComponent(areaMeta.slug)}` },
                      { '@type': 'ListItem', position: 4, name: place.name, item: `${getPublicSiteOrigin()}${canonicalPath}` },
                    ]),
              ],
            },
            {
              '@type': getStructuredPlaceType(place.category),
              name: place.name,
              description: buildPlaceDescription(place, areaMeta.name || 'Metro Manila'),
              url: `${getPublicSiteOrigin()}${canonicalPath}`,
              address: {
                '@type': 'PostalAddress',
                addressLocality: place.city || areaMeta.name,
                streetAddress: place.address || undefined,
                addressRegion: 'Metro Manila',
                addressCountry: 'PH',
              },
              image: place.imageUrl || place.curatedImageUrls?.[0] || undefined,
              ...buildPlaceSchemaExtras(place),
            },
            ...(buildPlaceFaqSchema(place) ? [buildPlaceFaqSchema(place)!] : []),
          ],
        }
      : null

  return (
    <>
      <SeoHead
        title={place ? `${place.name} in ${areaMeta?.name || 'Metro Manila'} | ${BRAND_NAME}` : `Place Details | ${PRODUCT_NAME}`}
        description={place ? buildPlaceDescription(place, areaMeta?.name || 'Metro Manila') : `Discover searchable place details, FAQs, and planning info on ${PRODUCT_NAME}.`}
        canonicalPath={canonicalPath ?? undefined}
        openGraphType="website"
        image={
          place?.imageUrl || place?.thumbnailUrl || place?.curatedImageUrls?.[0]
            ? { url: place.imageUrl || place.thumbnailUrl || place.curatedImageUrls?.[0] || '', alt: place.name }
            : null
        }
        jsonLd={placeJsonLd}
      />
      <PlaceDetailView
        place={place}
        areaBreadcrumb={{
          areaSlug:
            areaMeta?.slug ||
            expectedAreaSlug ||
            formatLabelFromSlug(place.city || place.area || 'metro-manila').toLowerCase(),
          areaName: areaMeta?.name || formatLabelFromSlug(expectedAreaSlug || place.city || place.area || 'metro-manila'),
        }}
        returnLabel={listingLabel}
        returnHref={listingLink}
        categoryBreadcrumb={categoryBreadcrumbMeta}
      />
    </>
  )
}
