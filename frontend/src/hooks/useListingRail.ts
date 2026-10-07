import { useEffect, useState } from 'react'
import type { PhotoCardPlace } from '../components/discover/PhotoCard'
import { getSeoListingPage, type SeoPlaceSummary } from '../utils/seoApi'
import { getVibeListingPage } from '../utils/vibeListings'
import type { VibeId } from '../utils/vibes'

// Area rails match the static listings generated at build time (backend/scripts/generateStaticPlaceListings.ts),
// so they load from CDN JSON and only fall back to the API when a file is missing. Vibe rails filter the compact place list.
const AREA_PAGE_SIZE = 10
const VIBE_RAIL_SIZE = 12

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

export function useListingRail({ areaSlug, vibe }: { areaSlug?: string; vibe?: VibeId }) {
  const [places, setPlaces] = useState<PhotoCardPlace[] | null>(null)

  useEffect(() => {
    if (!areaSlug && !vibe) return
    const controller = new AbortController()
    const request = vibe
      ? getVibeListingPage({ areaSlug: areaSlug ?? null, vibe, page: 1, pageSize: VIBE_RAIL_SIZE })
      : getSeoListingPage({ areaSlug: areaSlug ?? null, page: 1, pageSize: AREA_PAGE_SIZE, signal: controller.signal })
    request
      .then((response) => !controller.signal.aborted && setPlaces(response.items.map(toCardPlace)))
      .catch((error: Error) => {
        if (error.name !== 'AbortError') setPlaces([])
      })
    return () => controller.abort()
  }, [areaSlug, vibe])

  return places
}
