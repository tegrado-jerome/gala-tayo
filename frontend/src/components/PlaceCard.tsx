import { useMemo, useState, type MouseEvent } from 'react'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { MapPin } from '@phosphor-icons/react/dist/csr/MapPin'
import { PlaceCard as KitPlaceCard, Tag, cx } from './ui'
import { categoryIcons } from './discover/CategoryTabs'
import { useSavedFavorites } from '../context/SavedFavoritesContext'
import { isGalaTayoPick } from '../data/galaTayoPicks'
import { getStaticPlaceImageUrlForSlug } from '../data/placeIndexVisuals'
import { getPlaceCardPhoto } from '../utils/placeGalleryPhotos'
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
  community_rating?: number | null
  community_review_count?: number | null
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

/** "1-2 hours" → "1–2 hrs", "30 minutes-1 hour" → "30 min–1 hr". */
export function formatVisitDuration(duration: string | null | undefined) {
  const text = duration?.trim()
  if (!text) return null
  // Cards have one short line: drop asides in brackets and squeeze long phrasings ("Half day to several days" → "Half day+").
  return text
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+to\s+(several|multiple|a few)\s+days?/gi, '+')
    .replace(/\bseveral days\b/gi, 'Multi-day')
    .replace(/\s+to\s+(a\s+)?full day/gi, '–full day')
    .replace(/(\d)\s*-\s*(\d)/g, '$1–$2')
    .replace(/\s*-\s*/g, '–')
    .replace(/\bhours?\b/gi, (word) => (word.toLowerCase() === 'hour' ? 'hr' : 'hrs'))
    .replace(/\bminutes?\b/gi, 'min')
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
    ratingCount: live.review_count ?? place.ratingCount ?? null,
    budget_min: place.budget_min ?? live.budget_min ?? null,
    visit_duration: place.visit_duration ?? live.visit_duration ?? null,
    good_for: place.good_for?.length ? place.good_for : live.good_for,
    indoor_outdoor: live.indoor_outdoor ?? null,
    weather_fit: live.weather_fit ?? null,
  }
}

function getImageCandidates(place: PlaceCardData) {
  const candidates = [getPlaceCardPhoto(place.slug), place.thumbnailUrl, place.imageUrl, ...(place.curatedImageUrls ?? []), getStaticPlaceImageUrlForSlug(place.slug ?? place.id)]
  return candidates.reduce<string[]>((unique, candidate) => {
    const url = candidate?.trim()
    if (url && !unique.includes(url)) unique.push(url)
    return unique
  }, [])
}

export function toTitleCase(value: string | null | undefined) {
  return (value ?? '').trim().replace(/(^|[\s/-])(\p{Ll})/gu,(_, lead: string, letter: string) => lead + letter.toUpperCase())
}

const categoryIconAliases: Array<[RegExp, PhosphorIcon]> = [
  [/caf|coffee/i, categoryIcons.cafe],
  [/food|restaurant|eat|dining|bar(?!k)/i, categoryIcons.food],
  [/night|club|pub/i, categoryIcons.nightlife],
  [/park|garden|nature|beach|trail/i, categoryIcons.park],
  [/museum|gallery|art/i, categoryIcons.museum],
  [/church|heritage|histor/i, categoryIcons.heritage],
  [/mall|shop|market/i, categoryIcons.mall],
  [/cinema|movie|theat/i, categoryIcons.cinema],
  [/hotel|resort|stay/i, categoryIcons.hotel],
  [/activit|sport|adventure/i, categoryIcons.activity],
]

export function getCategoryIcon(category: string | null | undefined): PhosphorIcon {
  const key = (category ?? '').trim().toLowerCase()
  if (!key) return MapPin
  return categoryIcons[key] ?? categoryIconAliases.find(([pattern]) => pattern.test(key))?.[1] ?? MapPin
}

function getReviewCount(place: PlaceCardData) {
  if (typeof place.ratingCount === 'number' && Number.isFinite(place.ratingCount)) return place.ratingCount
  const parsed = Number.parseInt(place.reviewCount ?? '', 10)
  return Number.isFinite(parsed) ? parsed : null
}

type PlaceCardProps = {
  place: PlaceCardData
  onGuestSave: (retry: () => void) => void
  selected?: boolean
  onOpen?: () => void
  onHover?: () => void
  className?: string
  priority?: boolean
}

/** Listing card wired to saved places, prefetch and listing return state. Renders the kit's editorial card. */
function PlaceCard({ place, onGuestSave, selected = false, onOpen, onHover, className, priority }: PlaceCardProps) {
  const candidates = useMemo(() => getImageCandidates(place), [place])
  const [failed, setFailed] = useState<string[]>([])
  const imageUrl = candidates.find((candidate) => !failed.includes(candidate)) ?? null
  const { isPlaceSaved, saveFavorite, removeFavorite } = useSavedFavorites()
  const [isSaving, setIsSaving] = useState(false)
  const placeId = place.id.trim()
  const saved = [place.slug, placeId].some((key) => isPlaceSaved(key))

  const toggleSave = async () => {
    if (isSaving) return
    setIsSaving(true)
    try {
      if (saved) {
        await removeFavorite(placeId, place.slug)
      } else {
        const result = await saveFavorite(placeId, place.slug)
        if (result.status === 'guest') onGuestSave(() => void saveFavorite(placeId, place.slug))
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
      className={cx('min-w-0', className)}
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
        icon={getCategoryIcon(place.category)}
        category={toTitleCase(place.category)}
        area={place.localArea || place.area}
        city={place.city}
        rating={typeof place.rating === 'number' && place.rating > 0 ? place.rating : null}
        reviewCount={getReviewCount(place)}
        duration={formatVisitDuration(place.visit_duration)}
        pricePerHead={formatPricePerHead(place.budget_min)}
        pick={isGalaTayoPick(place.slug)}
        flag={isRainSafe(place) ? <Tag tone="solid">Rain-safe</Tag> : null}
        selected={selected}
        priority={priority}
        saved={saved}
        onToggleSave={() => void toggleSave()}
      />
    </div>
  )
}

export default PlaceCard
export type { PlaceCardData, PlaceCategoryMeta, PlaceTagMeta }
