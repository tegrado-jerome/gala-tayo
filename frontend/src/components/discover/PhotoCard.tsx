import { useMemo, useState, type MouseEvent } from 'react'
import { Heart } from 'lucide-react'
import InternalLink from '../InternalLink'
import { toTitleCase } from '../PlaceCard'
import { Tag } from '../ui'
import PlaceImage from './PlaceImage'
import { useSavedFavorites } from '../../context/SavedFavoritesContext'
import { getStaticPlaceImageUrlForSlug } from '../../data/placeIndexVisuals'
import { prefetchPlaceDetail } from '../../utils/placeDetailCache'
import { formatPlaceCardMeta } from '../../utils/placeLocation'
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

/** Price and rating for the line under the meta. */
function formatPlaceFacts(place: PhotoCardPlace) {
  const price =
    place.budgetMin == null ? null : place.budgetMin <= 0 ? 'Free entry' : `₱${Math.round(place.budgetMin).toLocaleString('en-PH')}/head`
  const rating = place.rating ? `★ ${place.rating.toFixed(1)}` : null
  return [price, rating].filter(Boolean).join(' · ')
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

  const isTopRated = (place.rating ?? 0) >= TOP_RATED_MIN
  const badgeLabel = badge ?? (isTopRated ? 'Top rated' : null)
  const meta = formatPlaceCardMeta({ category: toTitleCase(place.category), area: place.localArea || place.area, city: place.city })
  const facts = formatPlaceFacts(place)

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
          <PlaceImage candidates={candidates} category={place.category} priority={priority} className="h-full w-full" />
          {badgeLabel ? (
            <span className="g-pc-flag">
              <Tag tone={badgeLabel === 'Rain-safe' ? 'neutral' : 'solid'} className={badgeLabel === 'Rain-safe' ? 'is-sea' : undefined}>{badgeLabel}</Tag>
            </span>
          ) : null}
        </div>
        <div className="g-h3 mt-2.5 line-clamp-2">{place.name}</div>
        {meta ? <div className="g-pc-meta mt-0.5" title={meta}>{meta}</div> : null}
        {facts ? <div className="g-sulit">{facts}</div> : null}
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
