import { useEffect, useMemo, useState } from 'react'
import { PlaceTile } from '../components/PlaceCard'
import { ListingBreadcrumb } from '../components/home/search/SearchComponents'
import InternalLink from '../components/InternalLink'
import SeoHead from '../components/SeoHead'
import { Page, SectionHead } from '../components/ui'
import { metroManilaAreas } from '../data/metroManilaAreas'
import { cityRepresentativePlaceSlugs, getDiscoveryImageCandidates } from '../data/placeIndexVisuals'
import type { PlaceDetail } from '../types/appTypes'
import { fetchPlaceDetailsBatch } from '../utils/placeDetailCache'
import { getSiteOrigin } from '../utils/seo'
import { BRAND_NAME, PRODUCT_NAME } from '../utils/seoLandingPages'

function PlacesIndexPage() {
  const areaCards = useMemo(
    () => [...metroManilaAreas].sort((left, right) => left.name.localeCompare(right.name)),
    []
  )
  const representativeSlugs = useMemo(
    () => [
      ...areaCards.map((area) => cityRepresentativePlaceSlugs[area.slug]).filter(Boolean),
    ],
    [areaCards]
  )
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
        <p className="g-eyebrow">Metro Manila</p>
        <h1 className="g-h1 mt-2">Metro Manila places to visit</h1>
        <p className="g-mut mt-2">Pick a city, then browse its cafes, food spots, parks, museums, and more.</p>
      </header>

      <SectionHead title="Cities" sub={<InternalLink href="/places/categories" className="underline underline-offset-2">Or browse by category</InternalLink>} />
      <div className="g-grid is-4">
        {areaCards.map((area) => (
          <PlaceTile
            key={area.slug}
            href={`/places/${area.slug}`}
            title={area.name}
            meta={`Open ${area.name} places`}
            imageUrls={getDiscoveryImageCandidates(cityRepresentativePlaceSlugs[area.slug], representativePlaces[cityRepresentativePlaceSlugs[area.slug]])}
          />
        ))}
      </div>
    </Page>
  )
}

export default PlacesIndexPage
