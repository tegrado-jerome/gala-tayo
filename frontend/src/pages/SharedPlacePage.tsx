import { useEffect, useMemo, useState } from 'react'
import PlaceDetailView from '../components/PlaceDetailView'
import SeoHead from '../components/SeoHead'
import { replaceWithPath } from '../utils/navigation'
import { getCanonicalPlacePath, getCategoryBreadcrumbMeta, getHistoryState, resolveAreaMeta } from '../utils/routes'
import { buildPlaceDescription, buildPlaceFaqSchema, getStructuredPlaceType } from '../utils/placeSeo'
import { mapBackendPlaceToCardData } from '../utils/placeMapping'
import { formatLabelFromSlug } from '../utils/routes'
import { getApiUrl } from '../utils/apiClient'
import type { PlaceDetail, PlaceDetailCardData } from '../types/appTypes'

const EMPTY_PLACE_DETAIL = (slug: string): PlaceDetailCardData => ({
  id: '',
  slug,
  name: '',
  category: '',
  area: '',
  address: '',
  city: '',
  localArea: '',
  status: 'Unknown',
  reason: '',
  description: '',
  badge: '',
  rating: null,
  reviewCount: '0',
  ratingCount: 0,
  hours: '',
  entranceFee: '',
  website: '',
  googleMapsUrl: null,
  distanceKm: null,
  price_level: null,
  budget_min: null,
  place_history: null,
  best_time_to_visit: null,
  visit_duration: null,
  good_for: [],
  not_ideal_for: [],
  crowd_level: null,
  indoor_outdoor: null,
  weather_fit: null,
  parking_info: null,
  accessibility_notes: null,
  decision_reason: null,
  commute_friendly: null,
  commute_access: null,
  nearby_context: null,
  budget_notes: null,
  verification_status: null,
  verification_notes: null,
  verification_sources: [],
  last_verified_at: null,
  website_url: null,
  highlights: [],
  imageUrl: null,
  curatedImageUrl: null,
  curatedImageUrls: [],
  thumbnailUrl: null,
  imageAlt: null,
  categories: [],
  tags: [],
  matchedCategories: [],
  matchedTags: [],
  markerRatingText: null,
  hasPin: false,
  latitude: null,
  longitude: null,
  lat: null,
  lng: null,
  coordinates: {
    lat: null,
    lng: null,
  },
})

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
  const [place, setPlace] = useState<PlaceDetailCardData | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const endpoint = getApiUrl(`/places/${encodeURIComponent(slug)}`)

    const loadPlace = async () => {
      try {
        setNotFound(false)
        setErrorMessage(null)
        setPlace(null)

        const response = await fetch(endpoint, {
          method: 'GET',
          signal: controller.signal,
        })

        if (response.status === 404) {
          setNotFound(true)
          return
        }

        if (!response.ok) {
          throw new Error('Failed to load shared place.')
        }

        const data = (await response.json()) as PlaceDetail
        setPlace(mapBackendPlaceToCardData(data))
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load shared place.')
        }
      }
    }

    void loadPlace()

    return () => controller.abort()
  }, [slug])

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
  const placeForView = place ?? EMPTY_PLACE_DETAIL(slug)

  useEffect(() => {
    if (!canonicalPath) {
      return
    }

    if ((redirectToCanonical || expectedAreaSlug !== null) && currentPathname !== canonicalPath) {
      replaceWithPath(canonicalPath)
    }
  }, [canonicalPath, currentPathname, expectedAreaSlug, redirectToCanonical])

  const placeJsonLd =
    place && areaMeta && canonicalPath
      ? {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: `${window.location.origin}/` },
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
        place={placeForView}
        areaBreadcrumb={{
          areaSlug:
            areaMeta?.slug ||
            expectedAreaSlug ||
            formatLabelFromSlug(placeForView.city || placeForView.area || 'metro-manila').toLowerCase(),
          areaName: areaMeta?.name || formatLabelFromSlug(expectedAreaSlug || placeForView.city || placeForView.area || 'metro-manila'),
        }}
        returnLabel={listingLabel}
        returnHref={listingLink}
        categoryBreadcrumb={categoryBreadcrumbMeta}
      />
    </>
  )
}
