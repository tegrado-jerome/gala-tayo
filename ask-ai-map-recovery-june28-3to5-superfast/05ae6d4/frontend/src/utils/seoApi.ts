import type { PlaceCardData, PlaceCategoryMeta, PlaceTagMeta } from '../components/PlaceCard'

type SeoPlaceSummary = {
  id: string
  slug: string
  name: string
  description: string | null
  category: string | null
  address: string | null
  city: string | null
  area: string | null
  goodFor: string[]
  budgetMin: number | null
  areaSlug: string
  canonicalPath: string
  imageUrl: string | null
  updatedAt: string | null
}

type SeoAreaSummary = {
  slug: string
  name: string
  placeCount: number
  canonicalPath: string
}

type SeoPlacesResponse = {
  areas: SeoAreaSummary[]
  places: SeoPlaceSummary[]
}

type SeoAreaPageResponse = {
  area: SeoAreaSummary
  places: SeoPlaceSummary[]
}

function getSeoApiUrl(path: string) {
  const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
  return apiBaseUrl ? `${apiBaseUrl}${path}` : `/api${path}`
}

function mapSeoPlaceToCard(place: SeoPlaceSummary): PlaceCardData {
  return {
    id: place.id,
    slug: place.slug,
    name: place.name,
    category: place.category || 'Place',
    area: [place.area, place.city].filter(Boolean).join(', ') || place.city || place.area || 'Metro Manila',
    address: place.address,
    city: place.city,
    localArea: place.area,
    status: 'Unknown',
    reason: place.description || 'Discover this GalaTayo place.',
    description: place.description,
    badge: place.category || 'Place',
    imageUrl: place.imageUrl,
    curatedImageUrls: place.imageUrl ? [place.imageUrl] : [],
    categories: [] as PlaceCategoryMeta[],
    tags: [] as PlaceTagMeta[],
    matchedCategories: [] as PlaceCategoryMeta[],
    matchedTags: [] as PlaceTagMeta[],
    coordinates: {
      lat: null,
      lng: null,
    },
  }
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const rawBody = await response.text()
  const contentType = response.headers.get('content-type') || ''

  if (!rawBody.trim()) {
    throw new Error(response.ok ? 'The SEO API returned an empty response.' : `Request failed with status ${response.status}.`)
  }

  let data: (T & { message?: string }) | null = null

  try {
    data = JSON.parse(rawBody) as T & { message?: string }
  } catch {
    if (contentType.includes('text/html')) {
      throw new Error('The SEO API returned HTML instead of JSON. Make sure the backend API is running on local dev.')
    }

    throw new Error('The SEO API returned invalid JSON.')
  }

  if (!response.ok) {
    throw new Error((data as { message?: string }).message || `Request failed with status ${response.status}.`)
  }

  return data
}

async function getSeoPlaces() {
  const response = await fetch(getSeoApiUrl('/seo/places'), {
    method: 'GET',
  })

  return readJsonResponse<SeoPlacesResponse>(response)
}

async function getSeoAreaPage(areaSlug: string) {
  const response = await fetch(getSeoApiUrl(`/seo/areas/${encodeURIComponent(areaSlug)}`), {
    method: 'GET',
  })

  return readJsonResponse<SeoAreaPageResponse>(response)
}

export { getSeoApiUrl, getSeoAreaPage, getSeoPlaces, mapSeoPlaceToCard }
export type { SeoAreaPageResponse, SeoAreaSummary, SeoPlaceSummary, SeoPlacesResponse }
