import galaWorthy from '../data/galaWorthy.json'
import { getSeoPlaces, type SeoPlaceSummary } from './seoApi'

export type CompactPlace = Pick<SeoPlaceSummary, 'id' | 'slug' | 'name' | 'category' | 'area' | 'city' | 'areaSlug' | 'goodFor' | 'budgetMin' | 'canonicalPath' | 'imageUrl'>

// The daily /data snapshot can lag behind curation, so hidden places are dropped here too.
const hiddenSlugs = new Set((galaWorthy as { hidden: string[] }).hidden)
const onlyWorthy = (places: CompactPlace[]) => places.filter((place) => !hiddenSlugs.has(place.slug))

let compactPlacesRequest: Promise<CompactPlace[]> | null = null

async function fetchCompactPlaces(): Promise<CompactPlace[]> {
  try {
    const response = await fetch('/data/places-compact.json', { headers: { Accept: 'application/json' } })
    if (response.ok && response.headers.get('content-type')?.includes('json')) {
      return onlyWorthy((await response.json()) as CompactPlace[])
    }
  } catch {
    // Fall back to the API below.
  }
  const payload = await getSeoPlaces()
  return onlyWorthy(payload.places)
}

/** Every public place in one small payload (built daily into /data/places-compact.json), shared across pages. */
export function loadCompactPlaces() {
  compactPlacesRequest ??= fetchCompactPlaces().catch((error: unknown) => {
    compactPlacesRequest = null
    throw error
  })
  return compactPlacesRequest
}

export function countPlacesByAreaSlug(places: CompactPlace[]) {
  const counts: Record<string, number> = {}
  for (const place of places) {
    counts[place.areaSlug] = (counts[place.areaSlug] ?? 0) + 1
  }
  return counts
}
