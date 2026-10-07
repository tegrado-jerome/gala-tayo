import { useMemo, useState, type MouseEvent } from 'react'
import { formatPricePerHead, formatVisitDuration, getCategoryIcon } from '../PlaceCard'
import { PlaceCard, Tag } from '../ui'
import PlaceImage from './PlaceImage'
import { useSavedFavorites } from '../../context/SavedFavoritesContext'
import { isGalaTayoPick } from '../../data/galaTayoPicks'
import { getStaticPlaceImageUrlForSlug } from '../../data/placeIndexVisuals'
import { prefetchPlaceDetail } from '../../utils/placeDetailCache'
import { getPlaceCardPhoto } from '../../utils/placeGalleryPhotos'
import { getCanonicalPlacePath, resolveAreaMeta } from '../../utils/routes'

export type PhotoCardPlace = {
  id: string
  slug?: string | null
  name: string
  category?: string | null
  area?: string | null
  city?: string | null
  localArea?: string | null
  imageUrl?: string | null
  thumbnailUrl?: string | null
  curatedImageUrls?: string[]
  rating?: number | null
  reviewCount?: number | null
  budgetMin?: number | null
  duration?: string | null
}

export function getPlaceHref(place: PhotoCardPlace) {
  if (!place.slug) return '/search'
  const areaMeta = resolveAreaMeta({ city: place.city, area: place.area, localArea: place.localArea })
  return getCanonicalPlacePath({ areaSlug: areaMeta.slug, placeSlug: place.slug })
}

export function getPlaceImageCandidates(place: Pick<PhotoCardPlace, 'id' | 'slug' | 'thumbnailUrl' | 'imageUrl' | 'curatedImageUrls'>) {
  const candidates = [
    getPlaceCardPhoto(place.slug),
    place.thumbnailUrl,
    place.imageUrl,
    ...(place.curatedImageUrls ?? []),
    getStaticPlaceImageUrlForSlug(place.slug ?? place.id),
  ]
  return candidates.reduce<string[]>((unique, candidate) => {
    const url = candidate?.trim()
    if (url && !unique.includes(url)) unique.push(url)
    return unique
  }, [])
}

type PhotoCardProps = {
  place: PhotoCardPlace
  onGuestFavorite: (retry: () => void) => void
  badge?: string | null
  priority?: boolean
  onOpen?: () => void
  // When set, clicking the card calls this instead of following the link (search keeps its own navigation state).
  onActivate?: (placeId: string) => void
  onHover?: () => void
  isSelected?: boolean
}

/** Editorial photo card for curated places (home rails, trending, saved). */
function PhotoCard({ place, onGuestFavorite, badge, priority = false, onOpen, onActivate, onHover, isSelected = false }: PhotoCardProps) {
  const candidates = useMemo(() => getPlaceImageCandidates(place), [place])
  const { isPlaceSaved, saveFavorite, removeFavorite } = useSavedFavorites()
  const [isSaving, setIsSaving] = useState(false)
  const placeId = place.id.trim()
  const isSaved = [place.slug, placeId].some((key) => isPlaceSaved(key))

  const prefetch = () => {
    if (place.slug) void prefetchPlaceDetail(place.slug)
  }

  const toggleSave = async () => {
    if (isSaving) return
    setIsSaving(true)
    try {
      if (isSaved) {
        await removeFavorite(placeId, place.slug)
      } else {
        const result = await saveFavorite(placeId, place.slug)
        if (result.status === 'guest') onGuestFavorite(() => void saveFavorite(placeId, place.slug))
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleOpen = (event: MouseEvent<HTMLAnchorElement>) => {
    onOpen?.()
    if (onActivate) {
      event.preventDefault()
      onActivate(place.id)
    }
  }

  return (
    <article
      className="min-w-0"
      data-search-place-id={place.id}
      onMouseEnter={() => {
        prefetch()
        onHover?.()
      }}
      onFocus={prefetch}
    >
      <PlaceCard
        href={getPlaceHref(place)}
        title={place.name}
        media={<PlaceImage candidates={candidates} category={place.category} priority={priority} className="g-pc-media" />}
        icon={getCategoryIcon(place.category)}
        area={(place.localArea || place.area)?.replace(/\s*\([^)]*\)/g, '') || null}
        city={place.city}
        rating={place.rating}
        reviewCount={place.reviewCount}
        duration={formatVisitDuration(place.duration)}
        pricePerHead={formatPricePerHead(place.budgetMin)}
        pick={isGalaTayoPick(place.slug)}
        flag={badge ? <Tag tone="solid">{badge}</Tag> : null}
        selected={isSelected}
        saved={isSaved}
        onToggleSave={() => void toggleSave()}
        onClick={handleOpen}
      />
    </article>
  )
}

export default PhotoCard
