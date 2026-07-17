import { apiFetch } from './apiClient'
import type { PlaceDetail } from '../types/appTypes'

const memoryCache = new Map<string, PlaceDetail>()
const inflightRequests = new Map<string, Promise<PlaceDetail | null>>()
const sessionStoragePrefix = 'galatayo:place-detail:'

function normalizeSlug(slug: string) {
  return slug.trim().toLowerCase()
}

function readSessionCache(slug: string): PlaceDetail | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const rawValue = window.sessionStorage.getItem(`${sessionStoragePrefix}${normalizeSlug(slug)}`)
    if (!rawValue) {
      return null
    }

    return JSON.parse(rawValue) as PlaceDetail
  } catch {
    return null
  }
}

function writeSessionCache(place: PlaceDetail) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.setItem(
      `${sessionStoragePrefix}${normalizeSlug(place.slug)}`,
      JSON.stringify(place)
    )
  } catch {
    // Ignore storage quota/unavailable errors.
  }
}

function readCachedPlaceDetail(slug: string): PlaceDetail | null {
  const normalizedSlug = normalizeSlug(slug)
  const memoryPlace = memoryCache.get(normalizedSlug)

  if (memoryPlace) {
    return memoryPlace
  }

  const sessionPlace = readSessionCache(normalizedSlug)
  if (sessionPlace) {
    memoryCache.set(normalizedSlug, sessionPlace)
    return sessionPlace
  }

  return null
}

function cachePlaceDetail(place: PlaceDetail) {
  const normalizedSlug = normalizeSlug(place.slug)
  memoryCache.set(normalizedSlug, place)
  writeSessionCache(place)
}

async function prefetchPlaceDetail(slug: string): Promise<PlaceDetail | null> {
  const normalizedSlug = normalizeSlug(slug)
  const cachedPlace = readCachedPlaceDetail(normalizedSlug)
  if (cachedPlace) {
    return cachedPlace
  }

  const inflightRequest = inflightRequests.get(normalizedSlug)
  if (inflightRequest) {
    return inflightRequest
  }

  const request = (async () => {
    try {
      const response = await apiFetch(`/places/${encodeURIComponent(normalizedSlug)}`)
      if (!response.ok) {
        return null
      }

      const place = (await response.json()) as PlaceDetail
      cachePlaceDetail(place)
      return place
    } catch {
      return null
    } finally {
      inflightRequests.delete(normalizedSlug)
    }
  })()

  inflightRequests.set(normalizedSlug, request)
  return request
}

async function fetchPlaceDetailsBatch(slugs: string[]): Promise<PlaceDetail[]> {
  const normalizedSlugs = Array.from(
    new Set(slugs.map((slug) => normalizeSlug(slug)).filter(Boolean))
  )

  if (normalizedSlugs.length === 0) {
    return []
  }

  const response = await apiFetch('/places/batch-details', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      slugs: normalizedSlugs,
    }),
  })

  if (!response.ok) {
    return []
  }

  const data = (await response.json()) as {
    places?: PlaceDetail[]
  }

  const places = Array.isArray(data.places) ? data.places : []
  for (const place of places) {
    cachePlaceDetail(place)
  }

  return places
}

export {
  cachePlaceDetail,
  fetchPlaceDetailsBatch,
  prefetchPlaceDetail,
  readCachedPlaceDetail,
}
