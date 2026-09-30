import { useMemo, useState, type MouseEvent } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faHeart, faStar } from '@fortawesome/free-solid-svg-icons'
import { faHeart as faHeartOutline } from '@fortawesome/free-regular-svg-icons'
import InternalLink from '../InternalLink'
import { useSavedFavorites } from '../../context/SavedFavoritesContext'
import { getStaticPlaceImageUrlForSlug } from '../../data/placeIndexVisuals'
import { prefetchPlaceDetail } from '../../utils/placeDetailCache'
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
  budgetMin?: number | null
}

export function getPlaceHref(place: PhotoCardPlace) {
  if (!place.slug) return '/search'
  const areaMeta = resolveAreaMeta({ city: place.city, area: place.area, localArea: place.localArea })
  return getCanonicalPlacePath({ areaSlug: areaMeta.slug, placeSlug: place.slug })
}

function getImageCandidates(place: PhotoCardPlace) {
  const candidates = [
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

function formatPrice(budgetMin: number | null | undefined) {
  if (budgetMin == null) return null
  return budgetMin <= 0 ? 'Libre' : `from ₱${Math.round(budgetMin).toLocaleString('en-PH')}`
}

type PhotoCardProps = {
  place: PhotoCardPlace
  onGuestFavorite: () => void
  badge?: string | null
  priority?: boolean
  onOpen?: () => void
  // When set, clicking the card calls this instead of following the link (search keeps its own navigation state).
  onActivate?: (placeId: string) => void
  onHover?: () => void
  isSelected?: boolean
}

// Airbnb-style listing card: square photo with a save heart, then name, place and price lines.
function PhotoCard({ place, onGuestFavorite, badge, priority = false, onOpen, onActivate, onHover, isSelected = false }: PhotoCardProps) {
  const candidates = useMemo(() => getImageCandidates(place), [place])
  const [failed, setFailed] = useState<string[]>([])
  const imageUrl = candidates.find((candidate) => !failed.includes(candidate)) ?? null
  const { isPlaceSaved, saveFavorite, removeFavorite } = useSavedFavorites()
  const [isSaving, setIsSaving] = useState(false)
  const placeId = place.id.trim()
  const isSaved = [place.slug, placeId].some((key) => isPlaceSaved(key))
  const href = getPlaceHref(place)
  const location = [place.localArea || place.area || place.city, place.category].filter(Boolean).join(' · ')
  const price = formatPrice(place.budgetMin)

  const prefetch = () => {
    if (place.slug) void prefetchPlaceDetail(place.slug)
  }

  const toggleSave = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (isSaving) return
    setIsSaving(true)
    try {
      if (isSaved) {
        await removeFavorite(placeId, place.slug)
      } else {
        const result = await saveFavorite(placeId, place.slug)
        if (result.status === 'guest') onGuestFavorite()
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <article
      className="group relative min-w-0"
      data-search-place-id={place.id}
      onMouseEnter={() => {
        prefetch()
        onHover?.()
      }}
      onFocus={prefetch}
    >
      <InternalLink
        href={href}
        ariaLabel={place.name}
        className="block rounded-[20px] outline-offset-4"
        onClick={(event) => {
          onOpen?.()
          if (onActivate) {
            event.preventDefault()
            onActivate(place.id)
          }
        }}
      >
        <div
          className={`relative aspect-square overflow-hidden rounded-[20px] bg-[var(--bg-soft)] ${
            isSelected ? 'ring-2 ring-[var(--text-main)] ring-offset-2 ring-offset-[var(--bg)]' : ''
          }`}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              fetchPriority={priority ? 'high' : 'low'}
              onError={() => setFailed((current) => [...current, imageUrl])}
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
            />
          ) : null}
          {badge ? (
            <span className="absolute left-3 top-3 rounded-full bg-[rgba(255,253,248,0.94)] px-2.5 py-1 text-[12px] font-semibold text-[#1b1a17] shadow-[0_2px_8px_rgba(0,0,0,0.12)]">
              {badge}
            </span>
          ) : null}
        </div>
        <div className="mt-2.5 min-w-0 px-0.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 truncate text-[15px] font-semibold leading-5 text-[var(--text-main)]">{place.name}</h3>
            {place.rating ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-[13px] text-[var(--text-main)]">
                <FontAwesomeIcon icon={faStar} className="h-3 w-3" />
                {place.rating.toFixed(1)}
              </span>
            ) : null}
          </div>
          {location ? <p className="truncate text-[14px] leading-5 text-[var(--text-muted)]">{location}</p> : null}
          {price ? <p className="text-[14px] leading-5 text-[var(--text-main)]"><span className="font-semibold">{price}</span>{price !== 'Libre' ? ' / tao' : ''}</p> : null}
        </div>
      </InternalLink>
      <button
        type="button"
        onClick={(event) => void toggleSave(event)}
        aria-pressed={isSaved}
        aria-label={isSaved ? `Remove ${place.name} from saved` : `Save ${place.name}`}
        className="absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-110 active:scale-95"
      >
        <FontAwesomeIcon
          icon={isSaved ? faHeart : faHeartOutline}
          className={`h-[20px] w-[20px] drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)] ${isSaved ? 'text-[var(--primary)]' : 'text-white'}`}
        />
      </button>
    </article>
  )
}

export default PhotoCard
