import { useMemo, useState, type MouseEvent } from 'react'
import { Heart } from 'lucide-react'
import InternalLink from '../InternalLink'
import { Tag } from '../ui'
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

const TOP_RATED_MIN = 4.7

export function getPlaceHref(place: PhotoCardPlace) {
  if (!place.slug) return '/search'
  const areaMeta = resolveAreaMeta({ city: place.city, area: place.area, localArea: place.localArea })
  return getCanonicalPlacePath({ areaSlug: areaMeta.slug, placeSlug: place.slug })
}

export function getPlaceImageCandidates(place: PhotoCardPlace) {
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

function PhotoCard({ place, onGuestFavorite, badge, priority = false, onOpen, onActivate, onHover, isSelected = false }: PhotoCardProps) {
  const candidates = useMemo(() => getPlaceImageCandidates(place), [place])
  const [failed, setFailed] = useState<string[]>([])
  const imageUrl = candidates.find((candidate) => !failed.includes(candidate)) ?? null
  const { isPlaceSaved, saveFavorite, removeFavorite } = useSavedFavorites()
  const [isSaving, setIsSaving] = useState(false)
  const placeId = place.id.trim()
  const isSaved = [place.slug, placeId].some((key) => isPlaceSaved(key))
  const href = getPlaceHref(place)

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
  const isTopRated = (place.rating ?? 0) >= TOP_RATED_MIN
  const badgeLabel = badge ?? (isFree ? 'Free' : isTopRated ? 'Top rated' : null)
  const areaText = place.localArea || place.area || place.city
  const meta = [place.category, areaText].filter(Boolean).join(' · ')

  return (
    <article
      className="relative min-w-0"
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
        className="g-pc"
        onClick={(event) => {
          onOpen?.()
          if (onActivate) {
            event.preventDefault()
            onActivate(place.id)
          }
        }}
      >
        <div className="g-pc-img" style={isSelected ? { boxShadow: '0 0 0 2px var(--paper), 0 0 0 4px var(--ink)' } : undefined}>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              fetchPriority={priority ? 'high' : 'low'}
              onError={() => setFailed((current) => [...current, imageUrl])}
            />
          ) : null}
          {badgeLabel ? (
            <span className="g-pc-flag">
              <Tag tone={isFree || badgeLabel === 'Rain-safe' ? 'ok' : 'solid'}>{badgeLabel}</Tag>
            </span>
          ) : null}
        </div>
        <div className="g-pc-title">
          <span className="g-h3">{place.name}</span>
          {place.rating ? <span className="g-sm shrink-0">★ {place.rating.toFixed(1)}</span> : null}
        </div>
        {meta ? <div className="g-pc-meta">{meta}</div> : null}
        {place.budgetMin != null ? (
          <div className="g-sulit">
            {isFree ? (
              <b>Free entry</b>
            ) : (
              <>
                from <b>₱{Math.round(place.budgetMin).toLocaleString('en-PH')}</b>
              </>
            )}
          </div>
        ) : null}
      </InternalLink>
      <button
        type="button"
        className="g-pc-save"
        onClick={(event) => void toggleSave(event)}
        aria-pressed={isSaved}
        aria-label={isSaved ? `Remove ${place.name} from saved` : `Save ${place.name}`}
      >
        <Heart className="g-ic" />
      </button>
    </article>
  )
}

export default PhotoCard
