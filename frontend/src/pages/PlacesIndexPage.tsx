import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ChevronRight } from 'lucide-react'
import PlaceImage from '../components/discover/PlaceImage'
import { ListingBreadcrumb } from '../components/home/search/SearchComponents'
import InternalLink from '../components/InternalLink'
import SeoHead from '../components/SeoHead'
import { Page, SectionHead } from '../components/ui'
import { metroManilaAreas } from '../data/metroManilaAreas'
import { cityRepresentativePlaceSlugs, getDiscoveryImageCandidates } from '../data/placeIndexVisuals'
import type { PlaceDetail } from '../types/appTypes'
import { displayCityName } from '../utils/cityName'
import { fetchPlaceDetailsBatch } from '../utils/placeDetailCache'
import { getSeoListingPage } from '../utils/seoApi'
import { getSiteOrigin } from '../utils/seo'
import { BRAND_NAME, PRODUCT_NAME } from '../utils/seoLandingPages'

function formatPlaceCount(count: number) {
  return `${count.toLocaleString('en-PH')} ${count === 1 ? 'place' : 'places'}`
}

function PlacesIndexPage() {
  const [placeCounts, setPlaceCounts] = useState<Record<string, number>>({})
  const areaCards = useMemo(
    () =>
      [...metroManilaAreas].sort(
        (left, right) => (placeCounts[right.slug] ?? 0) - (placeCounts[left.slug] ?? 0) || left.name.localeCompare(right.name)
      ),
    [placeCounts]
  )
  const representativeSlugs = useMemo(
    () => metroManilaAreas.map((area) => cityRepresentativePlaceSlugs[area.slug]).filter(Boolean),
    []
  )

  useEffect(() => {
    const controller = new AbortController()
    void Promise.all(
      metroManilaAreas.map((area) =>
        getSeoListingPage({ areaSlug: area.slug, page: 1, pageSize: 1, signal: controller.signal })
          .then((listing): [string, number] => [area.slug, listing.total])
          .catch(() => null)
      )
    ).then((entries) => {
      if (controller.signal.aborted) return
      setPlaceCounts(Object.fromEntries(entries.filter((entry): entry is [string, number] => entry !== null)))
    })
    return () => controller.abort()
  }, [])
  const [representativePlaces, setRepresentativePlaces] = useState<Record<string, PlaceDetail>>({})

  useEffect(() => {
    let isMounted = true
    void fetchPlaceDetailsBatch(representativeSlugs).then((places) => {
      if (!isMounted) {
        return
      }

      setRepresentativePlaces(
        Object.fromEntries(places.map((place) => [place.slug, place]))
      )
    }).catch(() => {
      // Tiles fall back to their placeholder when the preview images fail to load.
    })

    return () => {
      isMounted = false
    }
  }, [representativeSlugs])

  const heroAreas = areaCards.slice(0, 2)
  const otherAreas = areaCards.slice(2)
  const desktopColumns = [5, 4, 3].find((columns) => otherAreas.length % columns === 0) ?? 4
  const getAreaImageCandidates = (areaSlug: string) =>
    getDiscoveryImageCandidates(cityRepresentativePlaceSlugs[areaSlug], representativePlaces[cityRepresentativePlaceSlugs[areaSlug]])
  const getCountLabel = (areaSlug: string) => (placeCounts[areaSlug] != null ? formatPlaceCount(placeCounts[areaSlug]) : 'See places')

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `Metro Manila Places | ${BRAND_NAME}`,
      description: `${PRODUCT_NAME} organizes Metro Manila cities so you can browse local places and gala ideas city by city.`,
      url: `${getSiteOrigin()}/places`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${getSiteOrigin()}/home` },
        { '@type': 'ListItem', position: 2, name: 'Places', item: `${getSiteOrigin()}/places` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: [
        ...areaCards.map((area, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: area.name,
          url: `${getSiteOrigin()}/places/${encodeURIComponent(area.slug)}`,
        })),
      ],
    },
  ]

  return (
    <Page>
      <SeoHead
        title={`Metro Manila Cities and Places to Visit | ${BRAND_NAME}`}
        description={`${PRODUCT_NAME} lets you browse Metro Manila cities, local place pages, and city-based gala ideas in one directory.`}
        canonicalPath="/places"
        jsonLd={jsonLd}
      />

      <ListingBreadcrumb items={[{ label: 'Home', href: '/home' }, { label: 'Places' }]} />

      <header className="mt-5 max-w-[42rem]">
        <h1 className="g-h1">Metro Manila places to visit</h1>
        <p className="g-mut mt-2">Pick a city to see its cafes, parks and food spots.</p>
      </header>

      <SectionHead title="Cities" sub={<InternalLink href="/places/categories" className="underline underline-offset-2">Or browse by category</InternalLink>} />
      <div className="grid grid-cols-2 gap-3 md:gap-6">
        {heroAreas.map((area) => (
          <InternalLink key={area.slug} href={`/places/${area.slug}`} className="g-pc">
            <span className="g-pc-img block aspect-[4/5] md:aspect-[16/10]">
              <PlaceImage candidates={getAreaImageCandidates(area.slug)} priority className="h-full w-full object-cover" />
            </span>
            <span className="g-h2 mt-2.5 block truncate">{displayCityName(area.name)}</span>
            <span className="g-sm g-mut block">{getCountLabel(area.slug)}</span>
          </InternalLink>
        ))}
      </div>

      <div className="g-group mt-6 lg:hidden">
        {otherAreas.map((area) => (
          <InternalLink key={area.slug} href={`/places/${area.slug}`} className="g-group-row py-2">
            <PlaceImage candidates={getAreaImageCandidates(area.slug)} className="h-14 w-14 shrink-0 rounded-[var(--r-2)] object-cover" />
            <span className="min-w-0 truncate">{displayCityName(area.name)}</span>
            <span className="g-group-end">
              {getCountLabel(area.slug)}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </InternalLink>
        ))}
      </div>

      <div
        className="mt-8 hidden gap-6 lg:grid lg:grid-cols-[repeat(var(--city-cols),minmax(0,1fr))]"
        style={{ '--city-cols': desktopColumns } as CSSProperties}
      >
        {otherAreas.map((area) => (
          <InternalLink key={area.slug} href={`/places/${area.slug}`} className="g-pc">
            <span className="g-pc-img block aspect-[4/3]">
              <PlaceImage candidates={getAreaImageCandidates(area.slug)} className="h-full w-full object-cover" />
            </span>
            <span className="g-h3 mt-2 block truncate">{displayCityName(area.name)}</span>
            <span className="g-sm g-mut block">{getCountLabel(area.slug)}</span>
          </InternalLink>
        ))}
      </div>
    </Page>
  )
}

export default PlacesIndexPage
