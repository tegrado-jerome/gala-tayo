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

  const isFree = place.budgetMin != null && place.budgetMin <= 0
  const badgeLabel = badge ?? (isFree ? 'Libre' : null)
  const isSellerBadge = badgeLabel != null && badgeLabel !== 'Libre'
  const areaText = place.localArea || place.area || place.city

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
        className="block rounded-[14px] outline-offset-4"
        onClick={(event) => {
          onOpen?.()
          if (onActivate) {
            event.preventDefault()
            onActivate(place.id)
          }
        }}
      >
        <div
          className={`relative aspect-[3/2] overflow-hidden rounded-[14px] bg-[var(--bg-soft)] ${
            isSelected ? 'ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--bg)]' : ''
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
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
            />
          ) : null}
          {badgeLabel ? (
            <span
              className={`absolute left-3 top-3 rounded-md px-2 py-1 text-[12px] font-bold ${
                isSellerBadge ? 'bg-[#067647] text-white' : 'bg-[#e6f6ee] text-[#067647]'
              }`}
            >
              {badgeLabel}
            </span>
          ) : null}
        </div>
        <div className="mt-3 min-w-0">
          <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-[var(--text-muted)]">
            {place.rating ? (
              <span className="inline-flex shrink-0 items-center gap-1 font-bold text-[var(--primary)]">
                <FontAwesomeIcon icon={faStar} className="h-3 w-3" />
                {place.rating.toFixed(1)}
              </span>
            ) : null}
            {place.rating && areaText ? <span aria-hidden="true">·</span> : null}
            {areaText ? <span className="truncate">{areaText}</span> : null}
          </p>
          <h3 className="mt-1 line-clamp-2 text-[17px] font-bold leading-[1.3] tracking-[-0.01em] text-[var(--text-main)]">{place.name}</h3>
          {place.category ? <p className="mt-1 truncate text-[14px] text-[var(--text-strong)]">{place.category}</p> : null}
          {price ? (
            <div className="mt-2.5">
              <span className="block text-[12px] text-[var(--text-muted)]">{isFree ? 'Entrance' : 'from'}</span>
              <span className={`text-[17px] font-extrabold ${isFree ? 'text-[var(--primary)]' : 'text-[var(--text-main)]'}`}>
                {isFree ? 'Libre' : price.replace(/^from /, '')}
              </span>
            </div>
          ) : null}
        </div>
      </InternalLink>
      <button
        type="button"
        onClick={(event) => void toggleSave(event)}
        aria-pressed={isSaved}
        aria-label={isSaved ? `Remove ${place.name} from saved` : `Save ${place.name}`}
        className="absolute right-3 top-3 flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[rgba(255,255,255,0.95)] text-[#101828] shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-transform hover:scale-110 active:scale-95"
      >
        <FontAwesomeIcon icon={isSaved ? faHeart : faHeartOutline} className={`h-4 w-4 ${isSaved ? 'text-[#067647]' : ''}`} />
      </button>
    </article>
  )
}

export default PhotoCard
