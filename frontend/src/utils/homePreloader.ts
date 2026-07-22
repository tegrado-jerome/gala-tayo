import { homeAllTopPickPlaces, homeCityRecommendations, homeCategoryRecommendations } from '../data/homeRecommendations'
import type { HomeRecommendationPlace, HomeRecommendationTile } from '../data/homeRecommendations'

const preloadedHomeUrls = new Set<string>()

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

function collectTileImageUrls(tiles: HomeRecommendationTile[]): string[] {
  const urls: string[] = []

  for (const tile of tiles) {
    const collected = collectPlaceImageUrls(tile.place)
    for (const url of collected) {
      if (!urls.includes(url)) {
        urls.push(url)
      }
    }
  }

  return urls
}

function getAllStaticHomeImageUrls(): string[] {
  const urls: string[] = []

  for (const place of homeAllTopPickPlaces) {
    const collected = collectPlaceImageUrls(place)
    for (const url of collected) {
      if (!urls.includes(url)) {
        urls.push(url)
      }
    }
  }

  const cityUrls = collectTileImageUrls(homeCityRecommendations)
  for (const url of cityUrls) {
    if (!urls.includes(url)) {
      urls.push(url)
    }
  }

  const categoryUrls = collectTileImageUrls(homeCategoryRecommendations)
  for (const url of categoryUrls) {
    if (!urls.includes(url)) {
      urls.push(url)
    }
  }

  return urls
}

export function preloadHomePageImages(): void {
  const urls = getAllStaticHomeImageUrls()

  for (const url of urls) {
    if (!url || preloadedHomeUrls.has(url)) {
      continue
    }

    preloadedHomeUrls.add(url)

    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'image'
    link.href = url
    link.fetchPriority = 'low'
    document.head.appendChild(link)

    const img = new Image()
    img.decoding = 'async'
    img.fetchPriority = 'low'
    img.src = url
  }
}
