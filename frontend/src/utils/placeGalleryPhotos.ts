import { useEffect, useState } from 'react'
import cardPhotos from '../data/placeCardPhotos.json'

/** An HD photo hosted on media.galatayo.app with the credit its licence asks for. */
export type PlaceGalleryPhoto = {
  url: string
  cardUrl: string
  author: string
  license: string
  licenseUrl: string | null
  sourceUrl: string
}

const cardPhotoBySlug = cardPhotos as Record<string, string>

/** The 800px first photo for listing cards; bundled because every card asks for it. */
export function getPlaceCardPhoto(slug: string | null | undefined) {
  return (slug && cardPhotoBySlug[slug]) || null
}

/** The full-size first HD photo, derived from the bundled card photo so the hero can render before the manifest loads. */
export function getPlaceLeadPhoto(slug: string | null | undefined) {
  return getPlaceCardPhoto(slug)?.replace(/-card\.webp$/, '.webp') ?? null
}

/** Every HD photo for one place, or null while the manifest is still loading. The full manifest is loaded on demand so cards don't pay for it. */
export function usePlaceGalleryPhotos(slug: string | null | undefined) {
  const [photos, setPhotos] = useState<{ slug: string; list: PlaceGalleryPhoto[] } | null>(null)

  useEffect(() => {
    if (!slug || !cardPhotoBySlug[slug]) return
    let isActive = true
    void import('../data/placeGalleryPhotos.json').then(({ default: manifest }) => {
      if (isActive) setPhotos({ slug, list: (manifest as Record<string, PlaceGalleryPhoto[]>)[slug] ?? [] })
    })
    return () => {
      isActive = false
    }
  }, [slug])

  if (photos && photos.slug === slug) return photos.list
  return slug && cardPhotoBySlug[slug] ? null : []
}
