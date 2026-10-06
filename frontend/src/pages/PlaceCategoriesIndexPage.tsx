import { useEffect, useMemo, useState } from 'react'
import { MapTrifold } from '@phosphor-icons/react/dist/csr/MapTrifold'
import { getCategoryIcon } from '../components/PlaceCard'
import PlaceImage from '../components/discover/PlaceImage'
import { ListingBreadcrumb } from '../components/home/search/SearchComponents'
import InternalLink from '../components/InternalLink'
import SeoHead from '../components/SeoHead'
import { Masonry, Page, PlaceCard, SectionHead } from '../components/ui'
import { placeCategories } from '../data/placeCategories'
import { categoryRepresentativePlaceSlugs, getDiscoveryImageCandidates } from '../data/placeIndexVisuals'
import type { PlaceDetail } from '../types/appTypes'
import { fetchPlaceDetailsBatch } from '../utils/placeDetailCache'
import { getSeoListingPage } from '../utils/seoApi'
import '../design/misc.css'
import { getSiteOrigin } from '../utils/seo'
import { BRAND_NAME, PRODUCT_NAME } from '../utils/seoLandingPages'

function PlaceCategoriesIndexPage() {
  const categoryCards = useMemo(
    () => [...placeCategories].sort((left, right) => left.label.localeCompare(right.label)),
    []
  )
  const representativeSlugs = useMemo(
    () => categoryCards.map((category) => categoryRepresentativePlaceSlugs[category.value]).filter(Boolean),
    [categoryCards]
  )
  const [representativePlaces, setRepresentativePlaces] = useState<Record<string, PlaceDetail>>({})
  const [placeCounts, setPlaceCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    const controller = new AbortController()
    void Promise.all(
      categoryCards.map((category) =>
        getSeoListingPage({ category: category.value, page: 1, pageSize: 1, signal: controller.signal })
          .then((listing): [string, number] => [category.value, listing.total])
          .catch(() => null)
      )
    ).then((entries) => {
      if (controller.signal.aborted) return
      setPlaceCounts(Object.fromEntries(entries.filter((entry): entry is [string, number] => entry !== null)))
    })
    return () => controller.abort()
  }, [categoryCards])

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
      name: `Place Categories | ${BRAND_NAME}`,
      description: `${PRODUCT_NAME} groups places around the Philippines by category: food, cafes, parks, museums, and more.`,
      url: `${getSiteOrigin()}/places/categories`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${getSiteOrigin()}/` },
        { '@type': 'ListItem', position: 2, name: 'Places', item: `${getSiteOrigin()}/places` },
        { '@type': 'ListItem', position: 3, name: 'Categories', item: `${getSiteOrigin()}/places/categories` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: categoryCards.map((category, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: category.label,
        url: `${getSiteOrigin()}/places/categories/${encodeURIComponent(category.value)}`,
      })),
    },
  ]

  return (
    <Page>
      <SeoHead
        title={`Place Categories and Guides | ${BRAND_NAME}`}
        description={`${PRODUCT_NAME} helps you browse place categories around the Philippines like cafes, food, parks, museums, and nightlife.`}
        canonicalPath="/places/categories"
        jsonLd={jsonLd}
      />

      <ListingBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Places', href: '/places' }, { label: 'Categories' }]} />

      <header className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[42rem]">
          <h1 className="g-h1">Browse place categories</h1>
          <p className="g-mut mt-2">Pick a category to see spots around the Philippines.</p>
        </div>
        <InternalLink href="/places" className="g-btn g-btn-line g-btn-sm">
          <MapTrifold aria-hidden="true" />
          Browse by city
        </InternalLink>
      </header>

      <SectionHead title="What are you in the mood for?" />
      <Masonry>
        {/* Categories with no listed places (Hotel, Cinema for now) are dead ends, so they are left out. */}
        {categoryCards.filter((category) => placeCounts[category.value] !== 0).map((category) => {
          const count = placeCounts[category.value]
          const slug = categoryRepresentativePlaceSlugs[category.value]
          return (
            <PlaceCard
              key={category.value}
              href={`/places/categories/${category.value}`}
              title={category.label}
              icon={getCategoryIcon(category.value)}
              media={<PlaceImage candidates={getDiscoveryImageCandidates(slug, representativePlaces[slug])} category={category.value} className="g-pc-media" />}
              meta={count != null ? `${count.toLocaleString('en-PH')} ${count === 1 ? 'place' : 'places'}` : 'See places'}
            />
          )
        })}
      </Masonry>
    </Page>
  )
}

export default PlaceCategoriesIndexPage
