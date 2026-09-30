import { useEffect, useState } from 'react'
import type { PhotoCardPlace } from '../components/discover/PhotoCard'
import { getSeoListingPage, type SeoPlaceSummary } from '../utils/seoApi'

// Page sizes match the static listings generated at build time (backend/scripts/generateStaticPlaceListings.ts),
// so rails load from CDN JSON and only fall back to the API when a file is missing.
const AREA_PAGE_SIZE = 10
const CATEGORY_PAGE_SIZE = 12

function toCardPlace(place: SeoPlaceSummary): PhotoCardPlace {
  return {
    id: place.id,
    slug: place.slug,
    name: place.name,
    category: place.category,
    area: place.area,
    city: place.city,
    localArea: place.area,
    imageUrl: place.imageUrl,
    budgetMin: place.budgetMin,
  }
}

export function useListingRail({ areaSlug, category }: { areaSlug?: string; category?: string }) {
  const [places, setPlaces] = useState<PhotoCardPlace[] | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getSeoListingPage({
      areaSlug: areaSlug ?? null,
      category: category ?? null,
      page: 1,
      pageSize: areaSlug ? AREA_PAGE_SIZE : CATEGORY_PAGE_SIZE,
      signal: controller.signal,
    })
      .then((response) => setPlaces(response.items.map(toCardPlace)))
      .catch((error: Error) => {
        if (error.name !== 'AbortError') setPlaces([])
      })
    return () => controller.abort()
  }, [areaSlug, category])

  return places
}
