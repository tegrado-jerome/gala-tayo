import { useEffect, useState } from 'react'
import { AppIcon, getCategoryIconName } from './AppIcon'
import { getCuratedPlaceImages, normalizePlaceSlug } from '../data/curatedPlaceImages'
import { useSavedFavorites } from '../context/SavedFavoritesContext'
import { useSystemMessage } from '../context/SystemMessageContext'
import { useGuestAuthPrompt } from '../utils/useGuestAuthPrompt'

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
}

type PlaceCardProps = {
  place: PlaceCardData
  isSelected?: boolean
  compact?: boolean
  searchResultCard?: boolean
  className?: string
  footerNote?: string | null
  onOpen?: (placeId: string) => void
  onSelect?: (placeId: string) => void
  dataSearchPlaceId?: string
}

function getReadableChipName(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function hasDisplayValue(value: string | null | undefined) {
  const normalizedValue = value?.trim().toLowerCase()
  return Boolean(normalizedValue && normalizedValue !== 'unknown' && normalizedValue !== 'n/a' && normalizedValue !== 'none')
}

function getCanonicalChipKey(value: string) {
  const normalizedValue = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bfriendly\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalizedValue) {
    return ''
  }

  if (normalizedValue.includes('date')) return 'date'
  if (normalizedValue.includes('family')) return 'family'
  if (normalizedValue.includes('barkada')) return 'barkada'
  if (normalizedValue.includes('commute')) return 'commute'
  if (normalizedValue.includes('study')) return 'study'
  if (normalizedValue.includes('nightlife')) return 'nightlife'
  if (normalizedValue.includes('cafe')) return 'cafe'

  return normalizedValue
}

function getCanonicalChipLabel(key: string, fallbackLabel: string) {
  const canonicalLabels: Record<string, string> = {
    barkada: 'Barkada',
    cafe: 'Cafe',
    commute: 'Commute',
    date: 'Date',
    family: 'Family',
    nightlife: 'Nightlife',
    study: 'Study',
  }

  return canonicalLabels[key] ?? fallbackLabel
}

function getPlaceChips(place: PlaceCardData) {
  const sourceChips = [
    ...(place.matchedTags ?? []),
    ...(place.matchedCategories ?? []),
    ...((place.matchedTags?.length || place.matchedCategories?.length) ? [] : place.tags ?? []),
  ]
  const seenChipKeys = new Set<string>()

  return sourceChips
    .map((chip) => ({
      id: chip.id,
      name: chip.name?.trim() || getReadableChipName(chip.id),
    }))
    .filter((chip) => {
      const canonicalKey = getCanonicalChipKey(chip.name)

      if (!canonicalKey || seenChipKeys.has(canonicalKey)) {
        return false
      }

      seenChipKeys.add(canonicalKey)
      return true
    })
    .map((chip) => {
      const canonicalKey = getCanonicalChipKey(chip.name)

      return {
        id: chip.id,
        key: canonicalKey,
        name: getCanonicalChipLabel(canonicalKey, chip.name),
      }
    })
}

function getSearchResultLocation(place: PlaceCardData) {
  const candidates = [
    place.area,
    place.address,
    [place.localArea, place.city].filter(hasDisplayValue).join(', '),
    place.city,
  ]

  return candidates.find((candidate) => hasDisplayValue(candidate))?.trim() ?? ''
}

function PlaceCard({
  place,
  isSelected = false,
  compact = false,
  searchResultCard = false,
  className = '',
  footerNote = null,
  onOpen,
  onSelect,
  dataSearchPlaceId,
}: PlaceCardProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [hasImageLoadError, setHasImageLoadError] = useState(false)
  const guestAuth = useGuestAuthPrompt()
  const { isPlaceSaved, saveFavorite, removeFavorite } = useSavedFavorites()
  const { showSystemMessage } = useSystemMessage()
  const resolvedCuratedImageUrls = place.curatedImageUrls ?? getCuratedPlaceImages(place.name)
  const photoUrl =
    place.imageUrl?.trim() ||
    place.thumbnailUrl?.trim() ||
    place.curatedImageUrl?.trim() ||
    resolvedCuratedImageUrls[0]?.trim() ||
    null
  const photoAlt = place.imageAlt?.trim() || place.name
  const normalizedNameSlug = normalizePlaceSlug(place.name)
  const placeId = place.id.trim()
  const isSaved = [place.slug, normalizedNameSlug, place.id].some((slug) => isPlaceSaved(slug))
  const displayChips = getPlaceChips(place)
  const categoryIconName = getCategoryIconName(place.badge || place.category)
  const compactLocation = getSearchResultLocation(place)
  const mobileVisibleChips = displayChips.slice(0, 2)
  const mobileHiddenChipCount = Math.max(displayChips.length - 2, 0)
  const mobileChips =
    mobileHiddenChipCount > 0 && mobileVisibleChips.length > 0
      ? [mobileVisibleChips[0], { id: 'more', key: 'more', name: `+${mobileHiddenChipCount}` }]
      : mobileVisibleChips
  const isInteractive = Boolean(onOpen || onSelect)
  const normalizedBadge = place.badge.trim().toLowerCase()
  const normalizedCategory = place.category.trim().toLowerCase()
  const shouldShowCategory = hasDisplayValue(place.category) && normalizedCategory !== normalizedBadge
  const mediaClassName = compact ? 'w-[84px] rounded-[20px] sm:w-[92px]' : 'w-[112px] rounded-[18px]'
  const cardBodyClassName = compact ? 'py-3' : 'min-h-[136px] p-3'
  const shouldRenderMedia = Boolean(photoUrl) || !compact
  const shouldShowPhoto = Boolean(photoUrl) && !hasImageLoadError

  useEffect(() => {
    setHasImageLoadError(false)
  }, [photoUrl, place.id])
  const handleActivate = () => {
    if (onOpen) {
      onOpen(place.id)
      return
    }

    onSelect?.(place.id)
  }

  const handleSave = async () => {
    try {
      setIsSaving(true)
      setSaveError('')

      if (isSaved) {
        const message = await removeFavorite(placeId, place.slug)
        showSystemMessage({
          title: 'Place Removed',
          description: message,
        })
        return
      }

      const result = await saveFavorite(placeId, place.slug)

      if (result.status === 'guest') {
        guestAuth.open('favorite')
        return
      }

      showSystemMessage({
        title: result.status === 'already-saved' ? 'Already Saved' : 'Place Saved!',
        description: result.message,
      })
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save favorite.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <article
        data-search-place-id={dataSearchPlaceId}
        onClick={handleActivate}
        onMouseEnter={() => onSelect?.(place.id)}
        onFocus={() => onSelect?.(place.id)}
        className={`overflow-hidden rounded-[26px] border ${searchResultCard ? 'bg-white shadow-[0_8px_22px_rgba(15,23,42,0.05)]' : 'bg-[linear-gradient(180deg,#ffffff_0%,#fcfdff_100%)] shadow-[0_12px_28px_rgba(15,23,42,0.06)]'} transition ${
          compact ? '' : 'hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(15,23,42,0.09)]'
        } ${
          isSelected
            ? 'border-[rgba(37,99,235,0.72)] ring-2 ring-[rgba(59,130,246,0.14)]'
            : 'border-[rgba(148,163,184,0.22)]'
        } ${className}`}
        role={isInteractive ? 'button' : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            handleActivate()
          }
        }}
      >
        {searchResultCard ? (
          <div className="grid grid-cols-[104px_minmax(0,1fr)] items-stretch gap-3.5 p-3">
            {shouldShowPhoto ? (
              <img
                src={photoUrl ?? undefined}
                alt={photoAlt}
                className="h-[132px] w-[104px] shrink-0 self-stretch rounded-[20px] border border-[rgba(148,163,184,0.18)] object-cover object-center shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]"
                loading="lazy"
                onError={() => setHasImageLoadError(true)}
              />
            ) : (
              <div className="flex h-[132px] w-[104px] shrink-0 self-stretch items-center justify-center rounded-[20px] border border-[rgba(148,163,184,0.16)] bg-[linear-gradient(180deg,#f8fbff_0%,#f2f6fb_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-400 shadow-[0_4px_12px_rgba(148,163,184,0.14)]">
                  <AppIcon name={categoryIconName} size="card" className="h-5 w-5" />
                </span>
              </div>
            )}

            <div className="relative flex min-h-[132px] min-w-0 flex-col justify-start pr-10">
              <button
                type="button"
                aria-label={isSaved ? 'Remove from favorites' : 'Save to favorites'}
                onClick={(event) => {
                  event.stopPropagation()
                  void handleSave()
                }}
                disabled={isSaving}
                className={`absolute right-0 top-0 inline-flex h-8 w-8 items-center justify-center rounded-full border bg-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  isSaved
                    ? 'border-rose-200 text-rose-600 shadow-[0_6px_14px_rgba(244,63,94,0.16)]'
                    : 'border-[rgba(148,163,184,0.22)] text-slate-400 hover:border-rose-200 hover:text-rose-600'
                }`}
              >
                {isSaving ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-200 border-t-[var(--accent)]" />
                ) : (
                  <AppIcon name="favorites" className={`h-4 w-4 ${isSaved ? 'fill-current text-rose-600' : ''}`} />
                )}
              </button>

              <h2 className="line-clamp-2 text-[16px] font-black leading-5 tracking-[-0.02em] text-slate-950">
                {place.name}
              </h2>

              {hasDisplayValue(place.badge) ? (
                <div className="mt-1.5">
                  <span className="inline-flex max-w-full items-center rounded-full bg-[#ebf3ff] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#2563eb]">
                    <span className="truncate">{place.badge}</span>
                  </span>
                </div>
              ) : null}

              {compactLocation ? (
                <div className="mt-2 flex items-start gap-1.5 text-[12px] leading-[1.35] text-slate-500">
                  <AppIcon name="place" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="line-clamp-2 min-w-0">{compactLocation}</span>
                </div>
              ) : null}

              {mobileChips.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {mobileChips.map((chip) => (
                    <span
                      key={`${chip.id}-${chip.name}`}
                      className={`inline-flex max-w-full min-w-0 items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                        chip.key === 'more'
                          ? 'bg-slate-100 text-slate-500'
                          : 'border border-[rgba(148,163,184,0.16)] bg-slate-50 text-slate-600'
                      }`}
                    >
                      <span className="truncate">{chip.name}</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
        <div className={`flex gap-3 px-3 ${compact ? 'items-stretch' : 'items-stretch'} ${cardBodyClassName}`}>
          {shouldRenderMedia ? (
            shouldShowPhoto ? (
            <img
              src={photoUrl ?? undefined}
              alt={photoAlt}
              className={`${mediaClassName} shrink-0 border border-[rgba(148,163,184,0.18)] object-cover shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] ${compact ? 'h-full min-h-[112px] self-stretch' : 'h-full self-stretch'}`}
              loading="lazy"
              onError={() => setHasImageLoadError(true)}
            />
          ) : (
            <div className={`${mediaClassName} flex shrink-0 flex-col items-center justify-center gap-1.5 border border-dashed border-[rgba(148,163,184,0.32)] bg-[linear-gradient(180deg,#f8fbff,#eef4fb)] px-2 text-center text-slate-400 ${compact ? 'h-full min-h-[112px] self-stretch' : 'h-full self-stretch'}`}>
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(148,163,184,0.22)] bg-white text-slate-400 shadow-[0_4px_12px_rgba(148,163,184,0.14)]">
                <AppIcon name="emptyPhoto" size="card" />
              </span>
              <span className="line-clamp-2 text-[10px] font-semibold leading-tight text-slate-700">
                {place.name}
              </span>
              <span className="text-[10px] font-medium leading-tight text-slate-500">No photo</span>
            </div>
          )) : null}

          <div className="relative min-w-0 flex flex-1 flex-col overflow-hidden">
            <div className={`flex items-start justify-between gap-2 ${compact ? 'pr-10' : ''}`}>
              <div className="min-w-0 flex-1">
                <h2 className={`line-clamp-2 font-black leading-[1.08] tracking-[-0.03em] text-[#0f172a] ${compact ? 'text-[15px]' : 'text-[17px]'}`}>
                  {place.name}
                </h2>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="rounded-full bg-[#ebf3ff] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#2563eb]">
                    {place.badge}
                  </span>
                  {shouldShowCategory ? (
                    <p className="line-clamp-1 text-[11px] font-medium text-[#64748b]">{place.category}</p>
                  ) : null}
                </div>
              </div>
              <div className={`flex shrink-0 items-center gap-2 ${compact ? 'absolute right-0 top-0' : ''}`}>
                <button
                  type="button"
                  aria-label={isSaved ? 'Remove from favorites' : 'Save to favorites'}
                  onClick={(event) => {
                    event.stopPropagation()
                    void handleSave()
                  }}
                  disabled={isSaving}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full border bg-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    isSaved
                      ? 'border-rose-200 text-rose-600 shadow-[0_6px_14px_rgba(244,63,94,0.16)]'
                      : 'border-[rgba(148,163,184,0.22)] text-slate-400 hover:border-rose-200 hover:text-rose-600'
                  }`}
                >
                  {isSaving ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-200 border-t-[var(--accent)]" />
                  ) : (
                    <AppIcon name="favorites" className={`h-4 w-4 ${isSaved ? 'fill-current text-rose-600' : ''}`} />
                  )}
                </button>
              </div>
            </div>

            <div className={`min-w-0 overflow-hidden ${compact ? 'mt-1.5 space-y-1' : 'mt-2 space-y-1.5'}`}>
              <div className="flex items-start gap-1.5 text-[11px] text-[#64748b]">
                <AppIcon name="place" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#94a3b8]" />
                <span className={`leading-4 ${compact ? 'line-clamp-2' : 'line-clamp-2'}`}>{place.area}</span>
              </div>

              {displayChips.length > 0 ? (
                <div className={`flex min-h-6 flex-wrap gap-1.5 overflow-hidden ${compact ? 'max-h-6' : 'max-h-[3rem]'}`}>
                  {displayChips.map((chip, index) => (
                    <span
                      key={`${chip.id}-${chip.name}`}
                      className={`inline-flex max-w-full min-w-0 rounded-full border border-[rgba(148,163,184,0.18)] bg-[#f8fbff] px-2.5 py-1 text-[10px] font-semibold text-[#475569] ${
                        compact
                          ? index >= 1 ? 'hidden' : 'inline-flex'
                          : index >= 2 ? 'hidden sm:inline-flex' : 'inline-flex'
                      }`}
                    >
                      <span className="truncate">{chip.name}</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className={`min-w-0 ${compact ? 'mt-1.5' : 'mt-auto pt-2'}`}>
              <div className="flex items-center gap-3 text-[11px] text-[#64748b]">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2 py-1">
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      place.status === 'Open' ? 'bg-[var(--accent)]' : 'bg-slate-400'
                    }`}
                  />
                  {place.status}
                </span>
              </div>

              <p className={`mt-1 text-[11px] leading-4 text-slate-500 ${compact ? 'line-clamp-1' : 'line-clamp-2'}`}>{place.reason}</p>
              {footerNote ? (
                <p className="mt-1 line-clamp-1 text-[10px] font-black uppercase tracking-[0.08em] text-[var(--accent-deep)]">
                  {footerNote}
                </p>
              ) : null}
            </div>
          </div>
        </div>
        )}

        {saveError ? (
          <p className="border-t border-red-100 bg-red-50 px-3 py-2 text-[11px] text-red-600">
            {saveError}
          </p>
        ) : null}
      </article>

      {guestAuth.promptElement}
    </>
  )
}

export default PlaceCard
export type { PlaceCardData, PlaceCategoryMeta, PlaceTagMeta }
