import { getRegionBySlug } from '../data/destinations'
import { loadCompactPlaces, type CompactPlace } from './compactPlaces'
import type { SeoListingPageResponse, SeoPlaceSummary } from './seoApi'
import { filterByVibe, type VibeId } from './vibes'

/** Area slugs a listing covers: a region's towns, or the one city. Null is the whole country. */
export function listingAreaSlugs(areaSlug: string | null) {
  if (!areaSlug) return null
  const region = getRegionBySlug(areaSlug)
  return new Set(region ? region.destinations.map((destination) => destination.slug) : [areaSlug])
}

export function placesInArea<T extends Pick<CompactPlace, 'areaSlug'>>(places: T[], areaSlug: string | null) {
  const slugs = listingAreaSlugs(areaSlug)
  return slugs ? places.filter((place) => slugs.has(place.areaSlug)) : places
}

function toSummary(place: CompactPlace): SeoPlaceSummary {
  return { ...place, description: null, address: null, updatedAt: null }
}

/**
 * One page of places that fit a vibe, shaped like the listing API's answer. Filtered in the browser from
 * the compact place list (already best first), so vibes need no API change and no extra request.
 */
export async function getVibeListingPage({ areaSlug, vibe, page, pageSize }: { areaSlug: string | null; vibe: VibeId; page: number; pageSize: number }): Promise<SeoListingPageResponse> {
  const matches = filterByVibe(placesInArea(await loadCompactPlaces(), areaSlug), vibe)
  const totalPages = Math.max(Math.ceil(matches.length / pageSize), 1)
  const safePage = Math.min(Math.max(Math.floor(page), 1), totalPages)
  return {
    items: matches.slice((safePage - 1) * pageSize, safePage * pageSize).map(toSummary),
    total: matches.length,
    page: safePage,
    pageSize,
    totalPages,
  }
}
