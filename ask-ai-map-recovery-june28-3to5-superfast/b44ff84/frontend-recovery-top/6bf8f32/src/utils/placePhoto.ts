import { getCuratedPlaceImages } from '../data/curatedPlaceImages'

type PlacePhotoSource = {
  name?: string | null
  slug?: string | null
  photo_url?: string | null
  photos?: string[] | null
}

function getPlacePhoto(source: PlacePhotoSource) {
  const directPhoto = source.photo_url?.trim()

  if (directPhoto) {
    return directPhoto
  }

  const galleryPhoto = source.photos?.find((photo) => typeof photo === 'string' && photo.trim())?.trim()

  if (galleryPhoto) {
    return galleryPhoto
  }

  const curatedPhotos = [
    ...(source.slug ? getCuratedPlaceImages(source.slug) : []),
    ...(source.name ? getCuratedPlaceImages(source.name) : []),
  ]

  return curatedPhotos.find((photo) => photo.trim()) ?? null
}

export { getPlacePhoto }
