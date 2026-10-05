import { useEffect, useMemo, useState } from 'react'
import { SquaresFour } from '@phosphor-icons/react/dist/csr/SquaresFour'
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
import '../design/misc.css'

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

  const heroAreas = areaCards.slice(0, 4)
  const otherAreas = areaCards.slice(4)
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

      <header className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[42rem]">
          <h1 className="g-h1">Metro Manila places to visit</h1>
          <p className="g-mut mt-2">Pick a city to see its cafes, parks and food spots.</p>
        </div>
        <InternalLink href="/places/categories" className="g-btn g-btn-line g-btn-sm">
          <SquaresFour aria-hidden="true" />
          Browse by category
        </InternalLink>
      </header>

      <SectionHead title="Most to explore" sub="Cities with the most GalaTayo places" />
      <div className="m-top">
        {heroAreas.map((area, index) => (
          <InternalLink key={area.slug} href={`/places/${area.slug}`} className="g-pc">
            <span className="g-pc-img block">
              <PlaceImage candidates={getAreaImageCandidates(area.slug)} priority={index < 2} className="h-full w-full object-cover" />
            </span>
            <span className="g-pc-title">
              <span className="g-h3">{displayCityName(area.name)}</span>
            </span>
            <span className="g-pc-meta block">{getCountLabel(area.slug)}</span>
          </InternalLink>
        ))}
      </div>

      <SectionHead title="Explore every city" />
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
    </Page>
  )
}

export default PlacesIndexPage
