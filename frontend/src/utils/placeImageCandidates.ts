import { getCuratedPlaceImages, normalizePlaceSlug } from '../data/curatedPlaceImages'

type PlaceImageSource = {
  name?: string | null
  slug?: string | null
  thumbnailUrl?: string | null
  imageUrl?: string | null
  curatedImageUrl?: string | null
  curatedImageUrls?: Array<string | null | undefined> | null
}

function normalizeImageCandidate(imageUrl: string | null | undefined) {
  if (typeof imageUrl !== 'string') {
    return null
  }

  const trimmed = imageUrl.trim()
  return trimmed ? trimmed : null
}

function pushUniqueImageCandidate(
  candidates: string[],
  seen: Set<string>,
  imageUrl: string | null | undefined
) {
  const normalizedUrl = normalizeImageCandidate(imageUrl)

  if (!normalizedUrl || seen.has(normalizedUrl)) {
    return
  }

  seen.add(normalizedUrl)
  candidates.push(normalizedUrl)
}

function resolvePlaceImageCandidates(place: PlaceImageSource) {
  const candidates: string[] = []
  const seen = new Set<string>()

  pushUniqueImageCandidate(candidates, seen, place.thumbnailUrl)
  pushUniqueImageCandidate(candidates, seen, place.imageUrl)
  pushUniqueImageCandidate(candidates, seen, place.curatedImageUrl)

  for (const imageUrl of place.curatedImageUrls ?? []) {
    pushUniqueImageCandidate(candidates, seen, imageUrl)
  }

  if (place.slug) {
    for (const imageUrl of getCuratedPlaceImages(normalizePlaceSlug(place.slug))) {
      pushUniqueImageCandidate(candidates, seen, imageUrl)
    }
  }

  if (place.name) {
    for (const imageUrl of getCuratedPlaceImages(normalizePlaceSlug(place.name))) {
      pushUniqueImageCandidate(candidates, seen, imageUrl)
    }
  }

  return candidates
}

export { resolvePlaceImageCandidates }
