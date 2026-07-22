import { homeAllTopPickPlaces } from '../data/homeRecommendations'
import type { HomeRecommendationPlace } from '../data/homeRecommendations'

const preloadedHomeUrls = new Set<string>()
const CRITICAL_HOME_IMAGE_COUNT = 3

function collectPlaceImageUrls(place: HomeRecommendationPlace): string[] {
  const urls: string[] = []

  if (place.imageUrl?.trim()) {
    urls.push(place.imageUrl.trim())
  }

  if (place.curatedImageUrls) {
    for (const url of place.curatedImageUrls) {
      if (url?.trim() && !urls.includes(url.trim())) {
        urls.push(url.trim())
      }
    }
  }

  return urls
}

function getCriticalStaticHomeImageUrls(): string[] {
  const urls: string[] = []

  for (const place of homeAllTopPickPlaces.slice(0, CRITICAL_HOME_IMAGE_COUNT)) {
    const collected = collectPlaceImageUrls(place)
    for (const url of collected) {
      if (!urls.includes(url)) {
        urls.push(url)
      }
    }
  }

  return urls
}

export function preloadHomePageImages(): void {
  const urls = getCriticalStaticHomeImageUrls()

  for (const url of urls) {
    if (!url || preloadedHomeUrls.has(url)) {
      continue
    }

    preloadedHomeUrls.add(url)

    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'image'
    link.href = url
    link.fetchPriority = 'high'
    document.head.appendChild(link)

    const img = new Image()
    img.decoding = 'async'
    img.fetchPriority = 'high'
    img.src = url
  }
}
