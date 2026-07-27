import type { PlaceCardData, PlaceCategoryMeta, PlaceTagMeta } from '../components/PlaceCard'
import { apiFetch } from './apiClient'

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

type SeoListingPageResponse = {
  items: SeoPlaceSummary[]
  total: number
  page: number
  pageSize: number
  totalPages: number
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
  const response = await apiFetch('/seo/places', {
    method: 'GET',
  })

  return readJsonResponse<SeoPlacesResponse>(response)
}

async function getSeoAreaPage(areaSlug: string) {
  const response = await apiFetch(`/seo/areas/${encodeURIComponent(areaSlug)}`, {
    method: 'GET',
  })

  return readJsonResponse<SeoAreaPageResponse>(response)
}

async function getSeoListingPage({
  areaSlug,
  category,
  goodFor,
  page,
  pageSize,
  signal,
}: {
  areaSlug?: string | null
  category?: string | null
  goodFor?: string | null
  page: number
  pageSize: number
  signal?: AbortSignal
}) {
  const staticPayload = await getStaticSeoListingPage({ areaSlug, category, goodFor, page, pageSize, signal })
  if (staticPayload) {
    return staticPayload
  }

  const params = new URLSearchParams()
  if (areaSlug) params.set('area', areaSlug)
  if (category && category !== 'all') params.set('category', category)
  if (goodFor && goodFor !== 'all') params.set('goodFor', goodFor)
  params.set('page', String(page))
  params.set('pageSize', String(pageSize))

  const response = await apiFetch(`/seo/listings?${params.toString()}`, {
    method: 'GET',
    signal,
  })

  return readJsonResponse<SeoListingPageResponse>(response)
}

function normalizeStaticPart(value: string | null | undefined) {
  return (value || 'all')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'all'
}

async function getStaticSeoListingPage({
  areaSlug,
  category,
  goodFor,
  page,
  pageSize,
  signal,
}: {
  areaSlug?: string | null
  category?: string | null
  goodFor?: string | null
  page: number
  pageSize: number
  signal?: AbortSignal
}): Promise<SeoListingPageResponse | null> {
  const areaPart = normalizeStaticPart(areaSlug)
  const categoryPart = normalizeStaticPart(category)
  const goodForPart = normalizeStaticPart(goodFor)
  const safePage = Math.max(Math.floor(page), 1)
  const safePageSize = Math.max(Math.floor(pageSize), 1)
  const staticUrl = `/data/place-listings/area-${areaPart}/category-${categoryPart}/good-for-${goodForPart}/page-${safePage}-size-${safePageSize}.json`

  try {
    const response = await fetch(staticUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal,
      cache: 'force-cache',
    })

    if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) {
      return null
    }

    return readJsonResponse<SeoListingPageResponse>(response)
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw error
    }

    return null
  }
}

export { getSeoAreaPage, getSeoListingPage, getSeoPlaces, mapSeoPlaceToCard }
export type { SeoAreaPageResponse, SeoAreaSummary, SeoListingPageResponse, SeoPlaceSummary, SeoPlacesResponse }
