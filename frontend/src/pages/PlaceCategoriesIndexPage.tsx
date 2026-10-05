import { useEffect, useMemo, useState } from 'react'
import { PlaceTile, getCategoryIcon, getCategoryTint } from '../components/PlaceCard'
import { ListingBreadcrumb } from '../components/home/search/SearchComponents'
import InternalLink from '../components/InternalLink'
import SeoHead from '../components/SeoHead'
import { Page, SectionHead } from '../components/ui'
import { placeCategories } from '../data/placeCategories'
import { categoryRepresentativePlaceSlugs, getDiscoveryImageCandidates } from '../data/placeIndexVisuals'
import type { PlaceDetail } from '../types/appTypes'
import { fetchPlaceDetailsBatch } from '../utils/placeDetailCache'
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
      name: `Metro Manila Place Categories | ${BRAND_NAME}`,
      description: `${PRODUCT_NAME} groups Metro Manila places by category: food, cafes, parks, museums, and more.`,
      url: `${getSiteOrigin()}/places/categories`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${getSiteOrigin()}/home` },
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
        title={`Metro Manila Place Categories and Guides | ${BRAND_NAME}`}
        description={`${PRODUCT_NAME} helps you browse Metro Manila place categories like cafes, food, parks, museums, and nightlife.`}
        canonicalPath="/places/categories"
        jsonLd={jsonLd}
      />

      <ListingBreadcrumb items={[{ label: 'Home', href: '/home' }, { label: 'Places', href: '/places' }, { label: 'Categories' }]} />

      <header className="mt-5 max-w-[42rem]">
        <h1 className="g-h1">Browse Metro Manila place categories</h1>
        <p className="g-mut mt-2">Pick a category to see spots across Metro Manila.</p>
      </header>

      <SectionHead title="Categories" sub={<InternalLink href="/places" className="underline underline-offset-2">Or browse by city</InternalLink>} />
      <div className="g-grid is-4">
        {categoryCards.map((category) => (
          <PlaceTile
            key={category.value}
            href={`/places/categories/${category.value}`}
            title={category.label}
            meta={`Open ${category.label.toLowerCase()} places`}
            icon={getCategoryIcon(category.value)}
            tint={getCategoryTint(category.value)}
            imageUrls={getDiscoveryImageCandidates(categoryRepresentativePlaceSlugs[category.value], representativePlaces[categoryRepresentativePlaceSlugs[category.value]])}
          />
        ))}
      </div>
    </Page>
  )
}

export default PlaceCategoriesIndexPage
