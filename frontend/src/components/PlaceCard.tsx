import { useMemo, useState, type MouseEvent } from 'react'
import { PlaceCard as KitPlaceCard, Tag, cx } from './ui'
import { getSulitLevel } from './place-detail/SulitMeter'
import { useSavedFavorites } from '../context/SavedFavoritesContext'
import { getStaticPlaceImageUrlForSlug } from '../data/placeIndexVisuals'
import { prefetchPlaceDetail } from '../utils/placeDetailCache'
import { getCanonicalPlacePath, resolveAreaMeta } from '../utils/routes'
import type { PlaceDetail } from '../types/appTypes'

type PlaceCategoryMeta = {
  id: string
  name: string
}

type PlaceTagMeta = {
  id: string
  name: string
  group: string
  strength: number
}

type PlaceCardData = {
  id: string
  displayIndex?: number
  slug?: string
  name: string
  faqs?: { question: string; answer: string }[]
  category: string
  area: string
  address?: string | null
  city?: string | null
  localArea?: string | null
  status: 'Open' | 'Closed' | 'Unknown'
  reason: string
  description?: string | null
  badge: string
  rating?: number | null
  reviewCount?: string
  ratingCount?: number | null
  hours?: string
  entranceFee?: string
  website?: string
  googleMapsUrl?: string | null
  distanceKm?: number | null
  price_level?: number | null
  budget_min?: number | null
  place_history?: string | null
  best_time_to_visit?: string | null
  visit_duration?: string | null
  good_for?: string[]
  not_ideal_for?: string[]
  crowd_level?: string | null
  indoor_outdoor?: string | null
  weather_fit?: string | null
  parking_info?: string | null
  accessibility_notes?: string | null
  decision_reason?: string | null
  commute_friendly?: boolean | null
  commute_access?: string | null
  nearby_context?: string | null
  budget_notes?: string | null
  verification_status?: string | null
  verification_notes?: string | null
  verification_sources?: string[]
  last_verified_at?: string | null
  website_url?: string | null
  highlights?: string[]
  imageUrl?: string | null
  curatedImageUrl?: string | null
  curatedImageUrls?: string[]
  thumbnailUrl?: string | null
  imageAlt?: string | null
  categories?: PlaceCategoryMeta[]
  tags?: PlaceTagMeta[]
  matchedCategories?: PlaceCategoryMeta[]
  matchedTags?: PlaceTagMeta[]
  markerRatingText?: string | null
  hasPin?: boolean
  latitude?: number | string | null
  longitude?: number | string | null
  lat?: number | string | null
  lng?: number | string | null
  coordinates: {
    lat: number | string | null
    lng: number | string | null
  }
  approvedImageCount?: number
}

export function getPlaceHref(place: Pick<PlaceCardData, 'slug' | 'city' | 'area' | 'localArea'>) {
  const slug = place.slug?.trim()
  if (!slug) return '/search'
  const areaMeta = resolveAreaMeta({ city: place.city, area: place.area, localArea: place.localArea })
  return getCanonicalPlacePath({ areaSlug: areaMeta.slug, placeSlug: slug })
}

export function formatPricePerHead(budgetMin: number | null | undefined) {
  if (budgetMin == null || !Number.isFinite(budgetMin)) return null
  return budgetMin <= 0 ? 'Free' : `₱${Math.round(budgetMin).toLocaleString('en-PH')}`
}

export function getSulitScore(budgetMin: number | null | undefined) {
  if (budgetMin == null || !Number.isFinite(budgetMin)) return null
  return (5 - getSulitLevel(Math.max(0, budgetMin)).index) * 2
}

export function isRainSafe(place: Pick<PlaceCardData, 'indoor_outdoor' | 'weather_fit'>) {
  const setting = place.indoor_outdoor?.toLowerCase() ?? ''
  const weather = place.weather_fit?.toLowerCase() ?? ''
  return (setting.includes('indoor') && !setting.includes('outdoor')) || /rain|all[- ]?weather|any weather/.test(weather)
}

export function withLiveDetail(place: PlaceCardData, live: PlaceDetail | undefined): PlaceCardData {
  if (!live) return place
  return {
    ...place,
    thumbnailUrl: live.thumbnailUrl ?? null,
    imageUrl: live.imageUrl ?? null,
    curatedImageUrls: live.curatedImageUrls ?? [],
    rating: live.rating ?? place.rating ?? null,
    budget_min: place.budget_min ?? live.budget_min ?? null,
    good_for: place.good_for?.length ? place.good_for : live.good_for,
    indoor_outdoor: live.indoor_outdoor ?? null,
    weather_fit: live.weather_fit ?? null,
  }
}

function getImageCandidates(place: PlaceCardData) {
  const candidates = [place.thumbnailUrl, place.imageUrl, ...(place.curatedImageUrls ?? []), getStaticPlaceImageUrlForSlug(place.slug ?? place.id)]
  return candidates.reduce<string[]>((unique, candidate) => {
    const url = candidate?.trim()
    if (url && !unique.includes(url)) unique.push(url)
    return unique
  }, [])
}

function getMeta(place: PlaceCardData) {
  const area = place.localArea || place.city || place.area
  const fit = place.good_for?.find((item) => item.trim())
  return [place.category, area, fit ? `good for ${fit.toLowerCase()}` : null].filter(Boolean).join(' · ')
}

type PlaceCardProps = {
  place: PlaceCardData
  onGuestSave: () => void
  selected?: boolean
  onOpen?: () => void
  onHover?: () => void
  className?: string
}

/** Listing card wired to saved places, prefetch and listing return state. Renders the GT1 kit card. */
function PlaceCard({ place, onGuestSave, selected = false, onOpen, onHover, className }: PlaceCardProps) {
  const candidates = useMemo(() => getImageCandidates(place), [place])
  const [failed, setFailed] = useState<string[]>([])
  const imageUrl = candidates.find((candidate) => !failed.includes(candidate)) ?? null
  const { isPlaceSaved, saveFavorite, removeFavorite } = useSavedFavorites()
  const [isSaving, setIsSaving] = useState(false)
  const placeId = place.id.trim()
  const saved = [place.slug, placeId].some((key) => isPlaceSaved(key))
  const rainSafe = isRainSafe(place)
  const isFree = place.budget_min != null && place.budget_min <= 0

  const toggleSave = async () => {
    if (isSaving) return
    setIsSaving(true)
    try {
      if (saved) {
        await removeFavorite(placeId, place.slug)
      } else {
        const result = await saveFavorite(placeId, place.slug)
        if (result.status === 'guest') onGuestSave()
      }
    } finally {
      setIsSaving(false)
    }
  }

  const prefetch = () => {
    if (place.slug) void prefetchPlaceDetail(place.slug)
  }

  return (
    <div
      data-search-place-id={place.id}
      className={cx('min-w-0', selected && 'rounded-[var(--r-3)] ring-2 ring-[var(--ink)] ring-offset-4 ring-offset-[var(--paper)]', className)}
      onMouseEnter={() => {
        prefetch()
        onHover?.()
      }}
      onFocus={prefetch}
      onClickCapture={(event: MouseEvent<HTMLDivElement>) => {
        if (!(event.target as HTMLElement).closest('.g-pc-save')) onOpen?.()
      }}
      onError={(event) => {
        if (event.target instanceof HTMLImageElement && imageUrl) setFailed((current) => [...current, imageUrl])
      }}
    >
      <KitPlaceCard
        href={getPlaceHref(place)}
        title={place.name}
        imageUrl={imageUrl}
        meta={getMeta(place)}
        rating={typeof place.rating === 'number' && place.rating > 0 ? place.rating : null}
        pricePerHead={isFree ? null : formatPricePerHead(place.budget_min)}
        sulit={getSulitScore(place.budget_min)}
        flag={isFree ? <Tag tone="ok">Free</Tag> : rainSafe ? <Tag tone="ok">Rain-safe</Tag> : null}
        saved={saved}
        onToggleSave={() => void toggleSave()}
      />
    </div>
  )
}

/** Index tile (city or category) with image fallbacks. */
export function PlaceTile({ href, title, meta, imageUrls }: { href: string; title: string; meta: string; imageUrls: string[] }) {
  const [imageIndex, setImageIndex] = useState(0)
  const sourceKey = imageUrls.join('|')
  const [lastSourceKey, setLastSourceKey] = useState(sourceKey)

  if (sourceKey !== lastSourceKey) {
    setLastSourceKey(sourceKey)
    setImageIndex(0)
  }

  return (
    <div className="min-w-0" onError={() => setImageIndex((current) => current + 1)}>
      <KitPlaceCard href={href} title={title} meta={meta} imageUrl={imageUrls[imageIndex] ?? null} />
    </div>
  )
}

export default PlaceCard
export type { PlaceCardData, PlaceCategoryMeta, PlaceTagMeta }
