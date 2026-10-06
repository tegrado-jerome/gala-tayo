import { useEffect, useMemo, useState } from 'react'
import { SquaresFour } from '@phosphor-icons/react/dist/csr/SquaresFour'
import PlaceImage from '../components/discover/PlaceImage'
import { ListingBreadcrumb } from '../components/home/search/SearchComponents'
import InternalLink from '../components/InternalLink'
import SeoHead from '../components/SeoHead'
import { Button, Page, PlaceCard, SectionHead } from '../components/ui'
import { METRO_MANILA_REGION_SLUG, metroManilaAreas, regions, type Destination } from '../data/destinations'
import { cityRepresentativePlaceSlugs, getDiscoveryImageCandidates } from '../data/placeIndexVisuals'
import type { PlaceDetail } from '../types/appTypes'
import { displayCityName } from '../utils/cityName'
import { countPlacesByAreaSlug, loadCompactPlaces, type CompactPlace } from '../utils/compactPlaces'
import { fetchPlaceDetailsBatch } from '../utils/placeDetailCache'
import { getSiteOrigin } from '../utils/seo'
import { BRAND_NAME, PRODUCT_NAME } from '../utils/seoLandingPages'
import '../design/misc.css'

function formatPlaceCount(count: number) {
  return `${count.toLocaleString('en-PH')} ${count === 1 ? 'place' : 'places'}`
}

function sortByPlaceCount(destinations: Destination[], placeCounts: Record<string, number>) {
  return [...destinations].sort(
    (left, right) => (placeCounts[right.slug] ?? 0) - (placeCounts[left.slug] ?? 0) || left.name.localeCompare(right.name)
  )
}

function PlacesIndexPage() {
  const [places, setPlaces] = useState<CompactPlace[] | null>(null)
  const placeCounts = useMemo(() => (places ? countPlacesByAreaSlug(places) : {}), [places])
  const areaCards = useMemo(() => sortByPlaceCount(metroManilaAreas, placeCounts), [placeCounts])
  const otherRegions = useMemo(
    () =>
      regions
        .filter((region) => region.slug !== METRO_MANILA_REGION_SLUG)
        .map((region) => ({ region, destinations: sortByPlaceCount(region.destinations.filter((destination) => placeCounts[destination.slug]), placeCounts) }))
        .filter(({ destinations }) => destinations.length > 0),
    [placeCounts]
  )
  const representativeSlugs = useMemo(
    () => metroManilaAreas.map((area) => cityRepresentativePlaceSlugs[area.slug]).filter(Boolean),
    []
  )
  const [representativePlaces, setRepresentativePlaces] = useState<Record<string, PlaceDetail>>({})

  useEffect(() => {
    let isMounted = true
    loadCompactPlaces()
      .then((loaded) => isMounted && setPlaces(loaded))
      .catch(() => isMounted && setPlaces([]))
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true
    void fetchPlaceDetailsBatch(representativeSlugs).then((loaded) => {
      if (!isMounted) {
        return
      }

      setRepresentativePlaces(
        Object.fromEntries(loaded.map((place) => [place.slug, place]))
      )
    }).catch(() => {
      // Tiles fall back to their placeholder when the preview images fail to load.
    })

    return () => {
      isMounted = false
    }
  }, [representativeSlugs])

  const heroAreas = areaCards.slice(0, 4)
  const otherAreas = areaCards.slice(4)
  const getAreaImageCandidates = (areaSlug: string) => {
    const representativeSlug = cityRepresentativePlaceSlugs[areaSlug]
    if (representativeSlug) {
      return getDiscoveryImageCandidates(representativeSlug, representativePlaces[representativeSlug])
    }
    const imageUrl = places?.find((place) => place.areaSlug === areaSlug && place.imageUrl)?.imageUrl
    return imageUrl ? [imageUrl] : []
  }
  const getCountLabel = (areaSlug: string) => (places ? formatPlaceCount(placeCounts[areaSlug] ?? 0) : 'See places')
  const listedAreas = [...areaCards, ...otherRegions.flatMap(({ destinations }) => destinations)]

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `Places to Visit in the Philippines | ${BRAND_NAME}`,
      description: `${PRODUCT_NAME} organizes Metro Manila cities and destinations around the Philippines so you can browse local places and gala ideas city by city.`,
      url: `${getSiteOrigin()}/places`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${getSiteOrigin()}/` },
        { '@type': 'ListItem', position: 2, name: 'Places', item: `${getSiteOrigin()}/places` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: listedAreas.map((area, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: area.name,
        url: `${getSiteOrigin()}/places/${encodeURIComponent(area.slug)}`,
      })),
    },
  ]

  return (
    <Page>
      <SeoHead
        title={`Cities and Places to Visit in the Philippines | ${BRAND_NAME}`}
        description={`${PRODUCT_NAME} lets you browse Metro Manila cities and destinations around the Philippines, with local place pages and city-based gala ideas in one directory.`}
        canonicalPath="/places"
        jsonLd={jsonLd}
      />

      <ListingBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Places' }]} />

      <header className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[42rem]">
          <h1 className="g-h1">Places to visit around the Philippines</h1>
          <p className="g-mut mt-2">Pick a city to see its cafes, parks and food spots. Metro Manila first, then the rest of the country.</p>
        </div>
        <InternalLink href="/places/categories" className="g-btn g-btn-line g-btn-sm">
          <SquaresFour aria-hidden="true" />
          Browse by category
        </InternalLink>
      </header>

      <SectionHead
        title="Metro Manila"
        sub="Cities with the most GalaTayo places"
        action={otherRegions.length > 0 ? <Button variant="text" href={`/places/${METRO_MANILA_REGION_SLUG}`}>See all</Button> : null}
      />
      <div className="m-top">
        {heroAreas.map((area, index) => (
          <PlaceCard
            key={area.slug}
            href={`/places/${area.slug}`}
            title={displayCityName(area.name)}
            media={<PlaceImage candidates={getAreaImageCandidates(area.slug)} priority={index < 2} className="g-pc-media" />}
            meta={getCountLabel(area.slug)}
          />
        ))}
      </div>

      <SectionHead title="Every Metro Manila city" />
      <div className="m-near">
        {otherAreas.map((area) => (
          <InternalLink key={area.slug} href={`/places/${area.slug}`}>
            <span className="m-near-img">
              <PlaceImage candidates={getAreaImageCandidates(area.slug)} />
            </span>
            <span className="min-w-0">
              <b>{displayCityName(area.name)}</b>
              <small>{getCountLabel(area.slug)}</small>
            </span>
          </InternalLink>
        ))}
      </div>

      {otherRegions.map(({ region, destinations }) => (
        <section key={region.slug} aria-labelledby={`region-${region.slug}`}>
          <SectionHead
            title={<span id={`region-${region.slug}`}>{region.name}</span>}
            sub={region.officialName}
            action={<Button variant="text" href={`/places/${region.slug}`}>See all</Button>}
          />
          <div className="m-near">
            {destinations.map((destination) => (
              <InternalLink key={destination.slug} href={`/places/${destination.slug}`}>
                <span className="m-near-img">
                  <PlaceImage candidates={getAreaImageCandidates(destination.slug)} />
                </span>
                <span className="min-w-0">
                  <b>{destination.label}</b>
                  <small>
                    {destination.provinceName} · {getCountLabel(destination.slug)}
                  </small>
                </span>
              </InternalLink>
            ))}
          </div>
        </section>
      ))}
    </Page>
  )
}

export default PlacesIndexPage
