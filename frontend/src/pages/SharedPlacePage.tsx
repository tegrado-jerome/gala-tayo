import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import PlaceDetailView from '../components/PlaceDetailView'
import SeoHead from '../components/SeoHead'
import { replaceWithPath } from '../utils/navigation'
import { getCanonicalPlacePath, getCategoryBreadcrumbMeta, getHistoryState, resolveAreaMeta } from '../utils/routes'
import { buildPlaceDescription, buildPlaceFaqSchema, getStructuredPlaceType } from '../utils/placeSeo'
import { mapBackendPlaceToCardData } from '../utils/placeMapping'
import { formatLabelFromSlug } from '../utils/routes'
import { getApiUrl } from '../utils/apiClient'
import { trackPlaceViewed } from '../utils/analytics'
import type { PlaceDetail, PlaceDetailCardData } from '../types/appTypes'
import { cachePlaceDetail, readCachedPlaceDetail } from '../utils/placeDetailCache'

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
  }, [areaMeta, canonicalPath, place])

  if (isLoading) {
    return null
  }

  if (!place) {
    return null
  }

  const placeJsonLd =
    place && areaMeta && canonicalPath
      ? {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: `${window.location.origin}/home` },
                { '@type': 'ListItem', position: 2, name: 'Places', item: `${window.location.origin}/places` },
                ...(categoryBreadcrumbMeta
                  ? [
                      { '@type': 'ListItem', position: 3, name: categoryBreadcrumbMeta.parentName, item: categoryBreadcrumbMeta.parentItem },
                      { '@type': 'ListItem', position: 4, name: categoryBreadcrumbMeta.childName, item: categoryBreadcrumbMeta.childItem },
                      { '@type': 'ListItem', position: 5, name: place.name, item: `${window.location.origin}${canonicalPath}` },
                    ]
                  : [
                      { '@type': 'ListItem', position: 3, name: areaMeta.name, item: `${window.location.origin}/places/${encodeURIComponent(areaMeta.slug)}` },
                      { '@type': 'ListItem', position: 4, name: place.name, item: `${window.location.origin}${canonicalPath}` },
                    ]),
              ],
            },
            {
              '@type': getStructuredPlaceType(place.category),
              name: place.name,
              description: place.description || place.reason,
              url: `${window.location.origin}${canonicalPath}`,
              address: {
                '@type': 'PostalAddress',
                addressLocality: place.city || areaMeta.name,
                streetAddress: place.address || undefined,
                addressRegion: 'Metro Manila',
                addressCountry: 'PH',
              },
              image: place.imageUrl || place.curatedImageUrls?.[0] || undefined,
            },
            ...(buildPlaceFaqSchema(place) ? [buildPlaceFaqSchema(place)!] : []),
          ],
        }
      : null

  if (notFound) {
    return (
      <>
        <SeoHead title="Not Found | GalaTayo" robots="noindex,follow" />
        <main className="min-h-screen bg-[var(--bg)] px-6 py-10 text-[var(--text)]">
          <h1 className="text-2xl font-semibold text-slate-900">Place not found</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            We could not find details for this shared link.
          </p>
        </main>
      </>
    )
  }

  if (errorMessage) {
    return (
      <>
        <SeoHead title="Error | GalaTayo" robots="noindex,follow" />
        <main className="min-h-screen bg-[var(--bg)] px-6 py-10 text-[var(--text)]">
          <h1 className="text-2xl font-semibold text-slate-900">Unable to load place</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">{errorMessage}</p>
        </main>
      </>
    )
  }

  return (
    <>
      <SeoHead
        title={place ? `${place.name} | GalaTayo` : 'Place Details | GalaTayo'}
        description={place ? buildPlaceDescription(place, areaMeta?.name || 'Metro Manila') : 'Discover place details on GalaTayo.'}
        canonicalPath={canonicalPath ?? undefined}
        openGraphType="article"
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
