import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import AppHeader from './AppHeader'
import { AppIcon } from './AppIcon'
import { GuestAuthPrompt, useGuestAuthPrompt } from './GuestAuthPrompt'
import AddToGalaPlanModal from './AddToGalaPlanModal'
import InternalLink from './InternalLink'
import MapView from './MapView'
import ReportUserModal from './ReportUserModal'
import PlaceImageNotice from './PlaceImageNotice'
import { PageContainer, PageShell, CardSurface } from './layout/ResponsiveLayouts'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCamera, faCheck, faComment, faEllipsis, faFlag, faPen, faReply, faTrash, faWallet, faXmark } from '@fortawesome/free-solid-svg-icons'
import { getCuratedPlaceImages, normalizePlaceSlug } from '../data/curatedPlaceImages'
import { useSavedFavorites } from '../context/SavedFavoritesContext'
import { useTheme } from '../context/ThemeContext'
import { useSystemMessage } from '../context/SystemMessageContext'
import { useAppUser } from '../context/AppUserContext'
import { getSupabaseAccessToken, getSupabaseSession, hasSessionUserChanged, shouldPropagateSessionChange, supabase } from '../supabase'
import { buildPlaceShareUrl, shareLink } from '../utils/share'
import { getDirectionsUrl, openDirectionsUrl } from '../utils/directions'
import { submitCommentReport, type CommentReportReason } from '../utils/commentReportsApi'
import { submitPlaceReport, type PlaceReportReason } from '../utils/placeReportsApi'
import { getMyUserReports } from '../utils/userReportsApi'
import { getMyProfile } from '../utils/profileApi'
import { getApiUrl } from '../utils/apiClient'
import { navigateToPath } from '../utils/navigation'
import { preparePlaceImageUploadFile } from '../utils/imageUpload'
import { trackPlaceReportSubmitted, trackPlaceShared } from '../utils/analytics'
import { Icon } from './place-detail/Icon'
import { MemberAvatar } from './place-detail/MemberAvatar'
import { SectionHeading } from './place-detail/SectionHeading'
import { ActionButton } from './place-detail/ActionButton'
import { GoodForList } from './place-detail/GoodForList'
import { TransportColumn } from './place-detail/TransportColumn'
import { DetailSection } from './place-detail/DetailSection'
import { cleanString, titleCase, uniqueList, isAcceptedContributionImage, contributionImageErrorMessage, parseJsonResponse } from './place-detail/helpers'
import type { PlaceDetailViewProps, PlaceReview, PlaceReviewsResponse, PlaceComment, PlaceCommentsResponse, PlaceImageContributionResponse, PlaceDetailCommunityCache } from './place-detail/types'
import Breadcrumb from './navigation/Breadcrumb'
import { faHouse, faLocationDot, faMagnifyingGlass, faTableCellsLarge } from '@fortawesome/free-solid-svg-icons'
import { getCategoryIconName } from './AppIcon'



const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PLACE_DETAIL_COMMUNITY_CACHE_PREFIX = 'galatayo:place-community:'
const PLACE_DETAIL_COMMUNITY_CACHE_TTL_MS = 10 * 60 * 1000
const filledStar = '★'



function getPlaceDetailCommunityCacheKey(placeId: string) {
  return `${PLACE_DETAIL_COMMUNITY_CACHE_PREFIX}${placeId}`
}

function readPlaceDetailCommunityCache(placeId: string): PlaceDetailCommunityCache | null {
  try {
    const rawCache = window.localStorage.getItem(getPlaceDetailCommunityCacheKey(placeId))

    if (!rawCache) {
      return null
    }

    const parsedCache = JSON.parse(rawCache) as Partial<PlaceDetailCommunityCache>
    if (
      typeof parsedCache.cachedAt !== 'number' ||
      !Number.isFinite(parsedCache.cachedAt) ||
      Date.now() - parsedCache.cachedAt > PLACE_DETAIL_COMMUNITY_CACHE_TTL_MS ||
      !Array.isArray(parsedCache.comments)
    ) {
      window.localStorage.removeItem(getPlaceDetailCommunityCacheKey(placeId))
      return null
    }

    return {
      averageRating:
        typeof parsedCache.averageRating === 'number' && Number.isFinite(parsedCache.averageRating)
          ? parsedCache.averageRating
          : null,
      reviewCount:
        typeof parsedCache.reviewCount === 'number' && Number.isFinite(parsedCache.reviewCount)
          ? Math.max(0, Math.floor(parsedCache.reviewCount))
          : 0,
      comments: parsedCache.comments as PlaceComment[],
      cachedAt: parsedCache.cachedAt,
    }
  } catch {
    return null
  }
}

function writePlaceDetailCommunityCache(placeId: string, cache: PlaceDetailCommunityCache) {
  try {
    window.localStorage.setItem(getPlaceDetailCommunityCacheKey(placeId), JSON.stringify(cache))
  } catch {
    // localStorage may be unavailable, ignore
  }
}

function getAuthMetadataString(metadata: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const value = metadata?.[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}

function buildPriceBadgeLabel(
  budgetMin: number | string | null | undefined,
  priceLevel: number | null | undefined,
  budgetNote?: string | null,
  category?: string | null,
  placeName?: string | null,
) {
  const parsedBudgetMin = typeof budgetMin === 'number' ? budgetMin : Number(budgetMin)
  if (Number.isFinite(parsedBudgetMin)) {
    return `Starting from \u20b1${new Intl.NumberFormat('en-US').format(Math.max(0, Math.floor(parsedBudgetMin)))}`
  }

  const cleanedBudgetNote = cleanString(budgetNote)
  if (cleanedBudgetNote) {
    const amountMatch = cleanedBudgetNote.match(/(?:\u20b1|PHP\s*)\s*([0-9][0-9,]*)/i)
    const parsedAmount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : NaN
    if (Number.isFinite(parsedAmount)) {
      return `Starting from \u20b1${new Intl.NumberFormat('en-US').format(Math.max(0, Math.floor(parsedAmount)))}`
    }

    const searchableText = [placeName, category, cleanedBudgetNote].filter(Boolean).join(' ').toLowerCase()
    const isFlexibleTicketedVenue =
      /\b(activity|arena|stadium|theater|theatre|cinema|concert|show|event|ticket|booking|venue)\b/.test(searchableText) ||
      /\b(flexible budget|latest (menu|ticket|booking) price|ticketed event)\b/.test(searchableText)

    if (isFlexibleTicketedVenue) {
      return 'Starting from: varies'
    }
  }

  if (priceLevel == null || !Number.isFinite(priceLevel)) {
    return ''
  }

  const labels = ['Free', 'Budget', 'Moderate', 'Pricey', 'Premium']
  return labels[Math.min(Math.max(Math.floor(priceLevel), 0), labels.length - 1)] || ''
}

function PlacePhoto({
  imageUrls = [],
  placeName,
  currentIndex,
  onPrevious,
  onNext,
  onSelect,
  showAddPhotoAction = false,
  onContribute,
  priceBadgeLabel = '',
}: {
  imageUrls?: string[]
  placeName: string
  currentIndex: number
  onPrevious?: () => void
  onNext?: () => void
  onSelect?: (index: number) => void
  showAddPhotoAction?: boolean
  onContribute?: () => void
  priceBadgeLabel?: string
}) {
  const swipeStartX = useRef<number | null>(null)
  const [brokenPhotoUrls, setBrokenPhotoUrls] = useState<Set<string>>(new Set())
  const [isMdUp, setIsMdUp] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(min-width: 768px)').matches
  })
  const photoSourceKey = uniqueList(imageUrls).join('|')

  useEffect(() => {
    setBrokenPhotoUrls(new Set())
  }, [photoSourceKey])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mediaQuery = window.matchMedia('(min-width: 768px)')
    const handleChange = () => setIsMdUp(mediaQuery.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const photos = uniqueList(imageUrls)
    .filter((photo) => !brokenPhotoUrls.has(photo))
    .slice(0, 3)
  const hasCarouselControls = photos.length > 1
  const safeIndex = photos.length > 0 ? Math.min(Math.max(currentIndex, 0), photos.length - 1) : 0
  const activePhoto = photos[safeIndex] ?? null
  const canGoPrevious = hasCarouselControls && safeIndex > 0
  const canGoNext = hasCarouselControls && safeIndex < photos.length - 1
  const totalPhotoSlots = 3
  const thumbSlots = Array.from({ length: totalPhotoSlots }, (_, index) => photos[index] ?? null)
  const sidePhotoIndexes = photos
    .map((_, index) => index)
    .filter((index) => index !== safeIndex)
    .slice(0, 2)
  const mobileFrameClassName =
    'relative overflow-hidden bg-transparent shadow-none sm:rounded-[28px] sm:border sm:border-[rgba(148,163,184,0.22)] sm:bg-[linear-gradient(180deg,#f7f9ff_0%,#eef3fb_44%,#e6ebf5_100%)] sm:shadow-[0_18px_44px_rgba(27,26,23,0.08)] md:border-white/14 md:bg-[rgba(27,26,23,0.12)] md:backdrop-blur-2xl'
  const desktopGlassFrameClassName =
    'relative overflow-hidden border border-white/14 bg-[rgba(27,26,23,0.12)] shadow-[0_18px_44px_rgba(27,26,23,0.08)] backdrop-blur-2xl md:rounded-[28px]'
  const heroAspectClassName = 'aspect-[4/3] sm:aspect-[17/10] md:aspect-[1.75/1] lg:aspect-[1.95/1]'
  const emptyAddTileClassName =
    'border-2 border-dotted border-white/22 bg-[linear-gradient(180deg,rgba(0,0,0,0.74),rgba(12,12,12,0.62))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_34px_rgba(0,0,0,0.28)] backdrop-blur-2xl transition hover:border-white/32 hover:bg-[linear-gradient(180deg,rgba(0,0,0,0.82),rgba(10,10,10,0.7))]'
  const emptySlotClassName =
    'cursor-default border-white/12 bg-[linear-gradient(180deg,rgba(0,0,0,0.5),rgba(0,0,0,0.38))] text-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_12px_30px_rgba(0,0,0,0.2)] backdrop-blur-2xl'

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    swipeStartX.current = event.changedTouches[0]?.clientX ?? null
  }

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!hasCarouselControls || swipeStartX.current === null) {
      swipeStartX.current = null
      return
    }

    const endX = event.changedTouches[0]?.clientX ?? swipeStartX.current
    const deltaX = endX - swipeStartX.current
    swipeStartX.current = null

    if (Math.abs(deltaX) < 40) {
      return
    }

    if (deltaX < 0) {
      if (canGoNext) {
        onNext?.()
      }
      return
    }

    if (canGoPrevious) {
      onPrevious?.()
    }
  }

  const markPhotoBroken = (photoUrl: string) => {
    if (!photoUrl) {
      return
    }

    setBrokenPhotoUrls((current) => {
      if (current.has(photoUrl)) {
        return current
      }

      const next = new Set(current)
      next.add(photoUrl)
      return next
    })
  }

  if (!activePhoto) {
    return (
      <div className="grid gap-2.5 sm:gap-3">
        <div className="-mx-4 w-[calc(100%+2rem)] max-w-[calc(100%+2rem)] sm:mx-0 sm:w-full sm:max-w-none md:mx-auto md:max-w-5xl lg:max-w-[88rem]">
          <div className={mobileFrameClassName}>
            <div className="relative isolate overflow-hidden">
              <div className={`${heroAspectClassName} relative w-full overflow-hidden`}>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.92),rgba(238,243,251,0.82)_38%,rgba(224,231,244,0.92)_100%)]" />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white/55 to-transparent sm:h-24" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-slate-950/10 via-slate-950/4 to-transparent sm:h-32" />

                <div className="absolute inset-x-4 top-4 z-10 sm:inset-x-5 sm:top-5">
                  <div className="flex items-center justify-between gap-2">
                    {priceBadgeLabel ? (
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[rgba(27,26,23,0.72)] px-3 py-1.5 text-[12px] font-semibold text-white backdrop-blur-sm">
                        <FontAwesomeIcon icon={faWallet} className="h-3.5 w-3.5" />
                        {priceBadgeLabel}
                      </span>
                    ) : null}
                    {showAddPhotoAction ? (
                      <button
                        type="button"
                        onClick={onContribute}
                        aria-label="Add photo"
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/28 bg-[rgba(27,26,23,0.34)] px-3 py-1.5 text-[11px] font-black text-white shadow-[0_10px_24px_rgba(27,26,23,0.12)] backdrop-blur-md transition hover:bg-[rgba(27,26,23,0.46)] sm:px-3.5 sm:py-2 sm:text-[12px]"
                      >
                        <FontAwesomeIcon icon={faCamera} className="h-4 w-4" />
                        <span className="hidden min-[380px]:inline">Add photo</span>
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="relative z-10 flex h-full items-center justify-center px-6 py-8 text-center sm:px-8 sm:py-10">
                  <div className="flex max-w-[340px] flex-col items-center gap-4 px-5 py-6">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full border border-[rgba(var(--accent-rgb),0.22)] bg-[var(--card)] shadow-[0_16px_40px_rgba(37,99,235,0.12)]">
                      <Icon name="photo" className="h-7 w-7 text-[var(--accent-deep)]" />
                    </span>
                    <div className="space-y-1">
                      <p className="text-[17px] font-black tracking-[-0.02em] text-[#111827]">No place photos yet</p>
                      <p className="text-[13px] font-semibold leading-5 text-[#475569]">
                      Be the first to add a photo for this spot.
                      </p>
                    </div>

                  </div>
                </div>

                <div className="absolute inset-x-0 bottom-0 hidden overflow-x-auto px-4 pb-4 pt-8 sm:block sm:px-5 sm:pb-5">
                  <div className="flex min-w-max items-center gap-2.5">
                    {thumbSlots.map((_, index) => {
                      const shouldUseAddTile = showAddPhotoAction && index === 0

                      return (
                        <button
                          key={`empty-gallery-thumb-${index}`}
                          type="button"
                          onClick={shouldUseAddTile ? onContribute : undefined}
                          disabled={!shouldUseAddTile}
                          className={`flex h-16 w-16 items-center justify-center rounded-2xl border shadow-[0_12px_24px_rgba(27,26,23,0.18)] transition ${shouldUseAddTile ? emptyAddTileClassName : emptySlotClassName}`}
                          aria-label={
                            shouldUseAddTile
                              ? `Add a photo for ${placeName}`
                              : `Empty photo slot ${index + 1} of ${placeName}`
                          }
                        >
                          <FontAwesomeIcon
                            icon={faCamera}
                            className={`h-5 w-5 ${shouldUseAddTile ? 'text-white/95 drop-shadow-[0_6px_16px_rgba(27,26,23,0.2)]' : 'text-white/45'}`}
                          />

                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <PlaceImageNotice />
      </div>
    )
  }

  return (
    <div className="grid gap-2.5 sm:gap-3">
      <div className="-mx-4 w-[calc(100%+2rem)] max-w-[calc(100%+2rem)] sm:mx-0 sm:w-full sm:max-w-none md:mx-auto md:max-w-5xl lg:max-w-[88rem]">
        {!isMdUp ? (
          <div className={mobileFrameClassName}>
            <div className="relative isolate overflow-hidden">
              <div
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                className={`${heroAspectClassName} h-full w-full bg-neutral-100`}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.24),rgba(27,26,23,0.06)_42%,rgba(27,26,23,0.18)_100%)]" />
                <img
                  src={activePhoto}
                  alt={placeName}
                  className="h-full w-full object-cover transition duration-300 md:object-center"
                  loading="eager"
                  onError={() => markPhotoBroken(activePhoto)}
                />
              </div>

              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-slate-950/55 via-slate-950/18 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-slate-950/82 via-slate-950/32 to-transparent" />

              <div className="absolute inset-x-4 top-4 z-10 sm:inset-x-5 sm:top-5">
                <div className="flex items-center justify-between gap-2">
                  {priceBadgeLabel ? (
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[rgba(27,26,23,0.72)] px-3 py-1.5 text-[12px] font-semibold text-white backdrop-blur-sm">
                      <FontAwesomeIcon icon={faWallet} className="h-3.5 w-3.5" />
                      {priceBadgeLabel}
                    </span>
                  ) : null}
                  <div className="flex items-center gap-2">
                    {showAddPhotoAction ? (
                      <button
                        type="button"
                        onClick={onContribute}
                        aria-label="Add photo"
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/28 bg-[rgba(27,26,23,0.34)] px-3 py-1.5 text-[11px] font-black text-white shadow-[0_10px_24px_rgba(27,26,23,0.12)] backdrop-blur-sm transition hover:bg-[rgba(27,26,23,0.46)] sm:px-3.5 sm:py-2 sm:text-[12px]"
                      >
                        <FontAwesomeIcon icon={faCamera} className="h-4 w-4" />
                        <span className="hidden min-[380px]:inline">Add photo</span>
                      </button>
                    ) : null}
                    <span className="whitespace-nowrap rounded-full bg-black/45 px-3 py-1 text-[12px] font-black text-white backdrop-blur-sm">
{safeIndex + 1} / {imageUrls.length}
                    </span>
                  </div>
                </div>
              </div>

              <div className="absolute inset-x-0 bottom-0 hidden overflow-x-auto px-4 pb-4 pt-8 sm:block sm:px-5 sm:pb-5">
                <div className="flex min-w-max items-center gap-2.5">
                  {thumbSlots.map((photo, index) => {
                    if (photo) {
                      return (
                        <button
                          key={`${photo}-thumb`}
                          type="button"
                          onClick={() => onSelect?.(index)}
                          className={`relative overflow-hidden rounded-2xl border transition ${
                            index === safeIndex
                              ? 'border-white shadow-[0_14px_30px_rgba(27,26,23,0.28)] ring-2 ring-white/90'
                              : 'border-white/35 shadow-[0_12px_24px_rgba(27,26,23,0.22)]'
                          }`}
                          aria-label={`Show photo ${index + 1} of ${placeName}`}
                          aria-pressed={index === safeIndex}
                        >
                          <img
                            src={photo}
                            alt={placeName}
                            className="h-16 w-16 object-cover"
                            loading="lazy"
                            onError={() => markPhotoBroken(photo)}
                          />
                        </button>
                      )
                    }

                    const shouldUseAddTile = showAddPhotoAction && index === photos.length

                    return (
                        <button
                          key={`empty-thumb-${index}`}
                          type="button"
                          onClick={shouldUseAddTile ? onContribute : undefined}
                          disabled={!shouldUseAddTile}
                          className={`flex h-16 w-16 items-center justify-center rounded-2xl border text-white backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.18)] transition ${
                            shouldUseAddTile
                              ? 'border-2 border-dotted border-white/22 bg-[linear-gradient(180deg,rgba(0,0,0,0.74),rgba(12,12,12,0.62))] hover:border-white/30 hover:bg-[linear-gradient(180deg,rgba(0,0,0,0.82),rgba(10,10,10,0.7))]'
                              : 'cursor-default border-dashed border-white/10 bg-[rgba(30,41,59,0.35)] text-white/40'
                          }`}
                          aria-label={
                            shouldUseAddTile
                              ? `Add a photo for ${placeName}`
                              : `Empty photo slot ${index + 1} of ${placeName}`
                          }
                      >
                        <FontAwesomeIcon icon={faCamera} className="h-5 w-5" />
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : (

        <div className="grid md:grid-cols-[minmax(0,1.32fr)_minmax(17rem,0.82fr)] md:gap-4 lg:grid-cols-[minmax(0,1.62fr)_minmax(21rem,0.78fr)] lg:gap-5">
          <div className={`${desktopGlassFrameClassName} h-full`}>
            <div className="relative isolate h-full overflow-hidden">
              <div className="relative h-full min-h-[23.5rem] overflow-hidden bg-[rgba(27,26,23,0.08)] lg:min-h-[28rem]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),rgba(27,26,23,0.04)_42%,rgba(27,26,23,0.16)_100%)]" />
                <img
                  src={activePhoto}
                  alt={placeName}
                  className="h-full w-full object-cover object-center transition duration-300"
                  loading="eager"
                  onError={() => markPhotoBroken(activePhoto)}
                />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-slate-950/55 via-slate-950/18 to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-slate-950/82 via-slate-950/32 to-transparent" />

                <div className="absolute inset-x-5 top-5 z-10 sm:inset-x-5 sm:top-5">
                  <div className="flex items-center justify-between gap-2">
                    {priceBadgeLabel ? (
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[rgba(27,26,23,0.72)] px-3 py-1.5 text-[12px] font-semibold text-white backdrop-blur-sm">
                        <FontAwesomeIcon icon={faWallet} className="h-3.5 w-3.5" />
                        {priceBadgeLabel}
                      </span>
                    ) : null}
                    <div className="flex items-center gap-2">
                      {showAddPhotoAction ? (
                        <button
                          type="button"
                          onClick={onContribute}
                          className="inline-flex items-center gap-1.5 rounded-full border border-white/28 bg-[rgba(27,26,23,0.34)] px-3.5 py-2 text-[12px] font-black text-white shadow-[0_10px_24px_rgba(27,26,23,0.12)] backdrop-blur-sm transition hover:bg-[rgba(27,26,23,0.46)]"
                        >
                          <FontAwesomeIcon icon={faCamera} className="h-4 w-4" />
                        Add photo
                        </button>
                      ) : null}
                      <span className="whitespace-nowrap rounded-full bg-black/45 px-3 py-1 text-[12px] font-black text-white backdrop-blur-sm">
{safeIndex + 1} / {imageUrls.length}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="absolute inset-x-5 bottom-5 flex items-center gap-2.5">
                  {thumbSlots.map((photo, index) => {
                    if (photo) {
                      return (
                        <button
                          key={`${photo}-desktop-thumb`}
                          type="button"
                          onClick={() => onSelect?.(index)}
                          className={`relative overflow-hidden rounded-2xl border transition ${
                            index === safeIndex
                              ? 'border-white shadow-[0_14px_30px_rgba(27,26,23,0.28)] ring-2 ring-white/90'
                              : 'border-white/35 shadow-[0_12px_24px_rgba(27,26,23,0.22)]'
                          }`}
                          aria-label={`Show photo ${index + 1} of ${placeName}`}
                          aria-pressed={index === safeIndex}
                        >
                          <img
                            src={photo}
                            alt={placeName}
                            className="h-16 w-16 object-cover"
                            loading="lazy"
                            onError={() => markPhotoBroken(photo)}
                          />
                        </button>
                      )
                    }

                    const shouldUseAddTile = showAddPhotoAction && index === photos.length

                    return (
                      <button
                        key={`desktop-empty-thumb-${index}`}
                        type="button"
                        onClick={shouldUseAddTile ? onContribute : undefined}
                        disabled={!shouldUseAddTile}
                        className={`flex h-16 w-16 items-center justify-center rounded-2xl border text-white backdrop-blur-sm shadow-[0_12px_24px_rgba(27,26,23,0.18)] transition ${
                          shouldUseAddTile
                            ? 'border-dashed border-white/24 bg-[linear-gradient(180deg,rgba(30,41,59,0.9),rgba(27,26,23,0.78))] text-white hover:border-white/32 hover:bg-[linear-gradient(180deg,rgba(51,65,85,0.92),rgba(27,26,23,0.82))]'
                            : 'cursor-default border-white/14 bg-[rgba(27,26,23,0.28)] text-white/35'
                        }`}
                        aria-label={
                          shouldUseAddTile
                            ? `Add a photo for ${placeName}`
                            : `Empty photo slot ${index + 1} of ${placeName}`
                        }
                      >
                        <FontAwesomeIcon icon={faCamera} className="h-5 w-5" />
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="grid min-h-[23.5rem] grid-rows-2 gap-4 lg:min-h-[28rem] lg:gap-5">
            {[0, 1].map((slotIndex) => {
              const photoIndex = sidePhotoIndexes[slotIndex]
              const photo = photoIndex != null ? photos[photoIndex] : null
              const shouldUseAddTile = showAddPhotoAction && photo == null

              if (photo && photoIndex != null) {
                return (
                  <button
                    key={`${photo}-desktop-side`}
                    type="button"
                    onClick={() => onSelect?.(photoIndex)}
                    className={`${desktopGlassFrameClassName} group h-full min-h-[11.25rem] overflow-hidden text-left lg:min-h-[13.4rem]`}
                    aria-label={`Show photo ${photoIndex + 1} of ${placeName}`}
                    aria-pressed={photoIndex === safeIndex}
                  >
                    <div className="relative h-full w-full overflow-hidden">
                      <img
                        src={photo}
                        alt={placeName}
                        className="h-full w-full object-cover object-center transition duration-300 group-hover:scale-[1.02]"
                      />
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-slate-950/10" />
                    </div>
                  </button>
                )
              }

              return (
                <button
                  key={`desktop-side-empty-${slotIndex}`}
                  type="button"
                  onClick={shouldUseAddTile ? onContribute : undefined}
                  disabled={!shouldUseAddTile}
                  className={`${desktopGlassFrameClassName} flex h-full min-h-[11.25rem] items-center justify-center overflow-hidden lg:min-h-[13.4rem] ${
                    shouldUseAddTile ? emptyAddTileClassName : emptySlotClassName
                  }`}
                  aria-label={
                    shouldUseAddTile
                      ? `Add a photo for ${placeName}`
                      : `Empty photo slot ${slotIndex + 1} of ${placeName}`
                  }
                >
                  <span className="flex flex-col items-center gap-2 px-4 text-center">
                    <FontAwesomeIcon
                      icon={faCamera}
                      className={`h-6 w-6 ${shouldUseAddTile ? 'text-white/95 drop-shadow-[0_6px_16px_rgba(0,0,0,0.35)]' : 'text-white/40'}`}
                    />

                    {shouldUseAddTile ? (
                      <span className="text-[13px] font-black tracking-[-0.01em] text-white/95">Add photo</span>
                    ) : (
                      <span className="text-[13px] font-semibold">No image yet</span>
                    )}
                    {shouldUseAddTile ? (
                      <span className="text-[11px] font-semibold text-white/70">Tap to upload</span>
                    ) : null}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
        )}
      </div>
      <PlaceImageNotice />
    </div>
  )
}



const commentReportReasons: Array<{ value: CommentReportReason; label: string }> = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Abuse' },
  { value: 'inappropriate', label: 'Inappropriate' },
  { value: 'false_info', label: 'Misleading' },
  { value: 'personal_info', label: 'Privacy' },
  { value: 'other', label: 'Other' },
]
const placeConcernReasons: Array<{ value: PlaceReportReason; label: string }> = [
  { value: 'wrong_info', label: 'Wrong info' },
  { value: 'closed_or_moved', label: 'Closed or moved' },
  { value: 'safety_issue', label: 'Safety issue' },
  { value: 'duplicate_place', label: 'Duplicate place' },
  { value: 'photo_or_copyright', label: 'Photo or copyright' },
  { value: 'other', label: 'Other' },
]

function StarRatingInput({
  value,
  disabled,
  onChange,
}: {
  value: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <div className="flex items-center gap-1.5" aria-label="Choose rating">
      {[1, 2, 3, 4, 5].map((ratingValue) => (
        <button
          key={ratingValue}
          type="button"
          onClick={() => onChange(ratingValue)}
          disabled={disabled}
          className={`flex h-12 w-12 items-center justify-center text-[34px] leading-none transition duration-200 hover:-translate-y-0.5 ${
            ratingValue <= value
              ? 'text-amber-500'
              : 'text-slate-300 hover:text-amber-400'
          } disabled:cursor-not-allowed disabled:opacity-70`}
          aria-label={`Rate ${ratingValue} out of 5`}
          aria-pressed={ratingValue <= value}
        >
          {filledStar}
        </button>
      ))}
    </div>
  )
}

function StarsDisplay({ rating, compact = false }: { rating: number; compact?: boolean }) {
  return (
    <span className={`inline-flex ${compact ? 'gap-0.5 text-[13px]' : 'gap-1 text-[16px]'} text-amber-500`} aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <span key={value} className={value <= rating ? 'text-amber-500' : 'text-slate-300'}>
          {filledStar}
        </span>
      ))}
    </span>
  )
}

function formatRatingCount(count: number) {
  return new Intl.NumberFormat('en-US').format(count)
}

function getRatingTone(rating: number) {
  if (rating >= 5) {
    return 'Absolutely worth the hype'
  }
  if (rating >= 4) {
    return 'Solid pick for the feed'
  }
  if (rating >= 3) {
    return 'Pretty decent overall'
  }
  if (rating >= 2) {
    return 'Maybe only for a specific vibe'
  }
  if (rating >= 1) {
    return 'Not the best experience'
  }
  return 'Tap a star to rate the vibe'
}

function formatReviewDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function wasEdited(createdAt: string, updatedAt: string) {
  const createdTime = new Date(createdAt).getTime()
  const updatedTime = new Date(updatedAt).getTime()

  if (Number.isNaN(createdTime) || Number.isNaN(updatedTime)) {
    return false
  }

  return updatedTime - createdTime > 1000
}

function markCommentReported(comments: PlaceComment[], commentId: string): PlaceComment[] {
  return comments.map((comment) => ({
    ...comment,
    current_user_reported: comment.id === commentId ? true : comment.current_user_reported,
    replies: markCommentReported(comment.replies, commentId),
  }))
}

function countThreadComments(comments: PlaceComment[]): number {
  return comments.reduce((total, comment) => total + 1 + countThreadComments(comment.replies), 0)
}

function replaceCommentById(comments: PlaceComment[], commentId: string, nextComment: PlaceComment): PlaceComment[] {
  return comments.map((comment) => {
    if (comment.id === commentId) {
      return nextComment
    }

    return {
      ...comment,
      replies: replaceCommentById(comment.replies, commentId, nextComment),
    }
  })
}

function updateCommentById(
  comments: PlaceComment[],
  commentId: string,
  updater: (comment: PlaceComment) => PlaceComment,
): PlaceComment[] {
  return comments.map((comment) => {
    if (comment.id === commentId) {
      return updater(comment)
    }

    return {
      ...comment,
      replies: updateCommentById(comment.replies, commentId, updater),
    }
  })
}

function appendReplyToComment(comments: PlaceComment[], parentCommentId: string, reply: PlaceComment): PlaceComment[] {
  return updateCommentById(comments, parentCommentId, (comment) => ({
    ...comment,
    replies: [...comment.replies, reply],
  }))
}

function removeCommentById(comments: PlaceComment[], commentId: string): PlaceComment[] {
  return comments
    .filter((comment) => comment.id !== commentId)
    .map((comment) => ({
      ...comment,
      replies: removeCommentById(comment.replies, commentId),
    }))
}

function isCommentDeleted(comment: PlaceComment): boolean {
  return comment.status === 'deleted' || Boolean(comment.deleted_at)
}

function markCommentDeletedById(comments: PlaceComment[], commentId: string, deletedAt?: string | null): PlaceComment[] {
  return updateCommentById(comments, commentId, (comment) => ({
    ...comment,
    status: 'deleted',
    comment: '[Deleted comment]',
    deleted_at: deletedAt ?? comment.deleted_at ?? new Date().toISOString(),
    updated_at: deletedAt ?? comment.updated_at,
    local_post_state: undefined,
    local_error_message: null,
  }))
}

const EMPTY_PLACE_DETAIL = {
  id: '',
  slug: '',
  name: 'Place details',
  category: '',
  area: '',
  address: null,
  city: null,
  localArea: null,
  status: 'Unknown' as const,
  reason: '',
  description: null,
  badge: '',
  rating: null,
  reviewCount: '',
  ratingCount: 0,
  hours: '',
  entranceFee: '',
  website: '',
  googleMapsUrl: null,
  distanceKm: null,
  price_level: null,
  budget_min: null,
  place_history: null,
  best_time_to_visit: null,
  visit_duration: null,
  good_for: [],
  not_ideal_for: [],
  crowd_level: null,
  indoor_outdoor: null,
  weather_fit: null,
  parking_info: null,
  accessibility_notes: null,
  decision_reason: null,
  commute_friendly: null,
  commute_access: null,
  nearby_context: null,
  budget_notes: null,
  verification_status: null,
  verification_notes: null,
  verification_sources: [],
  last_verified_at: null,
  website_url: null,
  highlights: [],
  imageUrl: null,
  curatedImageUrl: null,
  curatedImageUrls: [],
  thumbnailUrl: null,
  imageAlt: null,
  categories: [],
  tags: [],
  matchedCategories: [],
  matchedTags: [],
  markerRatingText: null,
  hasPin: false,
  latitude: null,
  longitude: null,
  lat: null,
  lng: null,
  coordinates: {
    lat: null,
    lng: null,
  },
  approvedImageCount: 0,
}

function MapViewMemo({
  place,
  zoom,
  autoFitToPlaces,
  className,
}: {
  place: NonNullable<PlaceDetailViewProps['place']>
  zoom: number
  autoFitToPlaces: boolean
  className: string
}) {
  const places = useMemo(() => [place], [place])
  const center = useMemo(
    () => [place.coordinates.lat, place.coordinates.lng] as [number | string | null, number | string | null],
    [place.coordinates.lat, place.coordinates.lng],
  )

  return (
    <MapView
      places={places}
      selectedPlaceId={place.id}
      center={center}
      zoom={zoom}
      autoFitToPlaces={autoFitToPlaces}
      className={className}
    />
  )
}

function PlaceDetailView({
  place: inputPlace,
  areaBreadcrumb = null,
  returnLabel = null,
  returnHref = null,
  categoryBreadcrumb = null,
}: PlaceDetailViewProps) {
  const place = inputPlace ?? EMPTY_PLACE_DETAIL
  const { currentProfile, session: appSession } = useAppUser()
  const ReviewSkeleton = () => (
    <div className="mt-4 grid gap-3" aria-hidden="true">
      <div className="app-skeleton app-skeleton--soft h-5 w-40 rounded-full" />
      <div className="app-skeleton h-11 w-full rounded-2xl" />
      <div className="app-skeleton app-skeleton--soft h-4 w-52 rounded-full" />
      <div className="app-skeleton h-10 w-28 rounded-xl" />
    </div>
  )

  const CommentSkeleton = () => (
    <ul className="mt-4 grid gap-3.5" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <li key={`comment-skeleton-${index}`} className="rounded-[22px] border border-slate-200/80 bg-white/90 p-4">
          <div className="flex items-start gap-3">
            <div className="app-skeleton h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="app-skeleton h-4 w-28 rounded-full" />
                <div className="app-skeleton app-skeleton--soft h-3 w-16 rounded-full" />
              </div>
              <div className="mt-3 grid gap-2">
                <div className="app-skeleton h-4 w-full rounded-full" />
                <div className="app-skeleton app-skeleton--soft h-4 w-4/5 rounded-full" />
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )

  const [initialCommunityCache] = useState<PlaceDetailCommunityCache | null>(() => readPlaceDetailCommunityCache(place.id))
  const [isAddToPlanOpen, setIsAddToPlanOpen] = useState(false)
  const guestAuth = useGuestAuthPrompt()
  const [isSaving, setIsSaving] = useState(false)
  const [shareError, setShareError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [isContributionOpen, setIsContributionOpen] = useState(false)
  const [contributionFile, setContributionFile] = useState<File | null>(null)
  const [contributionSourceUrl, setContributionSourceUrl] = useState('')
  const [contributionNote, setContributionNote] = useState('')
  const [isContributionSubmitting, setIsContributionSubmitting] = useState(false)
  const [contributionError, setContributionError] = useState('')
  const [averageRating, setAverageRating] = useState<number | null>(initialCommunityCache?.averageRating ?? null)
  const [reviewCount, setReviewCount] = useState(initialCommunityCache?.reviewCount ?? 0)
  const [hasLoadedReviewSummary, setHasLoadedReviewSummary] = useState(Boolean(initialCommunityCache))
  const [currentUserReview, setCurrentUserReview] = useState<PlaceReview | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserAvatarUrl, setCurrentUserAvatarUrl] = useState<string | null>(
    () => cleanString(currentProfile?.avatarUrl) || cleanString(currentProfile?.providerAvatarUrl) || null,
  )
  const [currentUserAvatarFallbackName, setCurrentUserAvatarFallbackName] = useState(
    () => cleanString(currentProfile?.username) || cleanString(currentProfile?.displayName) || 'GalaTayo member',
  )
  const [reviewRating, setReviewRating] = useState(0)
  const [isReviewSubmitting, setIsReviewSubmitting] = useState(false)
  const [isReviewDeleting, setIsReviewDeleting] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [isReviewEditing, setIsReviewEditing] = useState(false)
  const [comments, setComments] = useState<PlaceComment[]>(initialCommunityCache?.comments ?? [])
  const [isCommentsLoading, setIsCommentsLoading] = useState(!initialCommunityCache)
  const [commentBody, setCommentBody] = useState('')
  const [commentError, setCommentError] = useState('')
  const [isCommentSubmitting, setIsCommentSubmitting] = useState(false)
  const [isCommentComposerFocused, setIsCommentComposerFocused] = useState(false)
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editCommentBody, setEditCommentBody] = useState('')
  const [mutatingCommentId, setMutatingCommentId] = useState<string | null>(null)
  const [openCommentMenuId, setOpenCommentMenuId] = useState<string | null>(null)
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState<CommentReportReason | ''>('')
  const [reportDetails, setReportDetails] = useState('')
  const [reportError, setReportError] = useState('')
  const [reportingUser, setReportingUser] = useState<{ id: string; username?: string | null; displayName?: string | null } | null>(null)
  const [reportedUserIds, setReportedUserIds] = useState<Set<string>>(new Set())
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [isPlaceConcernOpen, setIsPlaceConcernOpen] = useState(false)
  const [placeConcernReason, setPlaceConcernReason] = useState<PlaceReportReason | ''>('')
  const [placeConcernDetails, setPlaceConcernDetails] = useState('')
  const [placeConcernError, setPlaceConcernError] = useState('')
  const [isPlaceConcernSubmitting, setIsPlaceConcernSubmitting] = useState(false)
  const [isReportSubmitting, setIsReportSubmitting] = useState(false)
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false)
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024)
  useEffect(() => {
    const update = () => setIsDesktop(window.innerWidth >= 1024)
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  const commentMenuRef = useRef<HTMLDivElement | null>(null)
  const { isPlaceSaved, saveFavorite, removeFavorite } = useSavedFavorites()
  const { resolvedTheme } = useTheme()
  const { showSystemMessage } = useSystemMessage()
  const isDarkTheme = resolvedTheme === 'dark'
  const commentSectionSurfaceClassName = isDarkTheme
    ? '!border-[#28405f] !bg-[linear-gradient(180deg,rgba(10,18,32,0.99),rgba(8,14,26,0.97))] !shadow-[0_20px_44px_rgba(0,0,0,0.24)]'
    : 'border-slate-200/80 bg-slate-50/55'
  const commentComposerSurfaceClassName = isDarkTheme
    ? '!border !border-[#28405f] !bg-[linear-gradient(180deg,rgba(15,26,44,0.98),rgba(12,21,36,0.98))] !shadow-[inset_0_1px_0_rgba(148,163,184,0.05)]'
    : 'bg-white'
  const commentReplySurfaceClassName = isDarkTheme
    ? '!border !border-[#28405f] !bg-[linear-gradient(180deg,rgba(15,26,44,0.98),rgba(12,21,36,0.98))]'
    : 'bg-slate-50'
  const commentCardSurfaceClassName = isDarkTheme
    ? '!border-[#2c4d73] !bg-[linear-gradient(180deg,rgba(17,29,49,0.98),rgba(13,23,39,0.98))] !shadow-[0_12px_28px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(148,163,184,0.05)]'
    : 'border-slate-200/80 bg-slate-50/80'
  const commentCardFailedClassName = isDarkTheme
    ? '!border-[#7a3141] !bg-[linear-gradient(180deg,rgba(46,16,28,0.96),rgba(28,12,22,0.96))]'
    : 'border-red-200 bg-red-50/70'
  const commentCardDeletedClassName = isDarkTheme
    ? '!border-[#2c4d73] !bg-[#101c2f]/95'
    : 'border-slate-200/70 bg-slate-100/90'
  const commentTextPrimaryClassName = isDarkTheme ? 'text-[#f4f8ff]' : 'text-slate-950'
  const commentTextSecondaryClassName = isDarkTheme ? 'text-[#c8d6e8]' : 'text-slate-500'
  const commentTextMutedClassName = isDarkTheme ? 'text-[#91a7c3]' : 'text-slate-400'
  const commentTextBodyClassName = isDarkTheme ? 'text-[#d7e2f2]' : 'text-slate-700'
  const commentBadgeSurfaceClassName = isDarkTheme ? '!bg-[rgba(var(--accent-rgb),0.16)]' : 'bg-[var(--accent-wash)]'
  const commentBadgeTextClassName = isDarkTheme ? 'text-[var(--primary-soft)]' : 'text-[var(--accent-deep)]'
  const commentMenuButtonClassName = isDarkTheme
    ? 'inline-flex h-7 w-7 items-center justify-center rounded-full text-[#9cb0c9] transition hover:!bg-[#1a2b44] hover:!text-[var(--primary-soft)]'
    : 'inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-600'
  const commentMenuClassName = isDarkTheme
    ? 'absolute right-0 top-8 z-20 min-w-[11rem] overflow-hidden rounded-xl border border-[#28405f] !bg-[#0f1b2d] py-1 shadow-[0_16px_34px_rgba(0,0,0,0.36)]'
    : 'absolute right-0 top-8 z-20 min-w-[11rem] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-[0_12px_28px_rgba(27,26,23,0.12)]'
  const commentMenuItemClassName = isDarkTheme
    ? 'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-bold text-[#d7e2f2] transition hover:!bg-[#17263b] hover:!text-[#f4f8ff] disabled:cursor-not-allowed disabled:text-[#7f94b1]'
    : 'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-bold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950 disabled:cursor-not-allowed disabled:text-[var(--text-disabled)]'
  const commentMenuItemDangerClassName = isDarkTheme
    ? 'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-bold text-[#fda4a4] transition hover:!bg-[#301521] hover:!text-[#fecaca] disabled:cursor-not-allowed disabled:opacity-70'
    : 'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-70'

  const placeOwnPhotos = uniqueList([
    place.imageUrl,
    place.thumbnailUrl,
    place.curatedImageUrl,
    ...(place.curatedImageUrls ?? []),
  ])
  const galleryPhotos = placeOwnPhotos.length > 0
    ? placeOwnPhotos.slice(0, 3)
    : getCuratedPlaceImages(place.name).slice(0, 3)
  const galleryStateKey = `${place.id}:${galleryPhotos.join('|')}`
  const [activeGalleryState, setActiveGalleryState] = useState({ key: galleryStateKey, index: 0 })
  const activeGalleryIndex =
    activeGalleryState.key === galleryStateKey
      ? Math.min(activeGalleryState.index, Math.max(galleryPhotos.length - 1, 0))
      : 0
  const approvedImageCount = place.approvedImageCount ?? 0
  const budgetLabel = (() => {
    const parts: string[] = []
    if (place.budget_min != null) parts.push(`From \u20b1${Number(place.budget_min).toLocaleString()}`)
    const note = cleanString(place.budget_notes)
    if (note) parts.push(note)
    return parts.join(' · ') || 'Not available'
  })()
  const addressLabel =
    cleanString(place.address) ||
    [cleanString(place.localArea || place.area), cleanString(place.city)].filter(Boolean).join(', ') ||
    cleanString(place.area) ||
    cleanString(place.city) ||
    'Not available'
  const categoryLabel = cleanString(place.category) || 'Place'
  const locationLabel = cleanString(place.localArea) || cleanString(place.area) || cleanString(place.city) || 'Metro Manila'
  const goodFor = uniqueList(place.good_for ?? [])
  const priceBadgeLabel = buildPriceBadgeLabel(place.budget_min, place.price_level, place.budget_notes, place.category, place.name)
  const directionsUrl = getDirectionsUrl(place)
  const normalizedNameSlug = normalizePlaceSlug(place.name)
  const placeId = cleanString(place.id)
  const placeSlug = cleanString(place.slug)
  const isCommunityPlaceReady = UUID_PATTERN.test(placeId)
  const canContributePhoto = Boolean(currentUserId && isCommunityPlaceReady && approvedImageCount < 3)
  const areaLink = areaBreadcrumb ? `/places/${encodeURIComponent(areaBreadcrumb.areaSlug)}` : null
  const breadcrumbItems = categoryBreadcrumb
    ? [
        { label: categoryBreadcrumb.parentName, href: new URL(categoryBreadcrumb.parentItem).pathname, icon: <FontAwesomeIcon icon={faTableCellsLarge} className="h-3.5 w-3.5" /> },
        { label: categoryBreadcrumb.childName, href: new URL(categoryBreadcrumb.childItem).pathname, icon: <AppIcon name={getCategoryIconName(categoryBreadcrumb.childName)} className="h-3.5 w-3.5" /> },
        { label: place.name, icon: <FontAwesomeIcon icon={faLocationDot} className="h-3.5 w-3.5" /> },
      ]
    : returnHref && returnLabel
      ? [
          {
            label: returnLabel,
            href: returnHref,
            icon: returnHref.startsWith('/search') ? <FontAwesomeIcon icon={faMagnifyingGlass} className="h-3.5 w-3.5" /> : returnLabel === 'Home' ? <FontAwesomeIcon icon={faHouse} className="h-3.5 w-3.5" /> : <FontAwesomeIcon icon={faLocationDot} className="h-3.5 w-3.5" />,
          },
          { label: place.name, icon: <FontAwesomeIcon icon={faLocationDot} className="h-3.5 w-3.5" /> },
        ]
      : [
          { label: 'Places', href: '/places', icon: <FontAwesomeIcon icon={faLocationDot} className="h-3.5 w-3.5" /> },
          ...(areaBreadcrumb
            ? [{ label: areaBreadcrumb.areaName, href: areaLink!, icon: <FontAwesomeIcon icon={faLocationDot} className="h-3.5 w-3.5" /> }]
            : []),
          { label: place.name, icon: <FontAwesomeIcon icon={faLocationDot} className="h-3.5 w-3.5" /> },
        ]
  const canonicalPlaceLink = areaBreadcrumb ? `/places/${encodeURIComponent(areaBreadcrumb.areaSlug)}/${encodeURIComponent(placeSlug)}` : null
  const placeFaqs =
    'faqs' in place && Array.isArray(place.faqs)
      ? place.faqs.filter(
          (item): item is { question: string; answer: string } =>
            Boolean(item.question.trim()) && Boolean(item.answer.trim())
        )
      : []
  const fallbackFaqItems = [
    {
      question: `What is ${place.name} best for?`,
      answer: goodFor.length > 0 ? `${place.name} is best for ${goodFor.map(titleCase).join(', ')}.` : `${place.name} works best for a casual Metro Manila gala.`,
    },
    {
      question: `What should I know before going to ${place.name}?`,
      answer: cleanString(place.best_time_to_visit) || cleanString(place.nearby_context) || cleanString(place.reason) || `Check the place details and route before heading to ${place.name}.`,
    },
  ]
  const faqItems: { question: string; answer: string }[] = placeFaqs.length > 0 ? placeFaqs : fallbackFaqItems

  useEffect(() => {
    if (!openCommentMenuId) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!commentMenuRef.current?.contains(event.target as Node)) {
        setOpenCommentMenuId(null)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenCommentMenuId(null)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [openCommentMenuId])

  const isSaved = [place.id, place.slug, normalizedNameSlug].some((slugOrId) => isPlaceSaved(slugOrId))
  const hasCurrentUserReview = Boolean(currentUserReview)
  const headlineRating = hasLoadedReviewSummary
    ? averageRating ?? 0
    : typeof place.rating === 'number' && Number.isFinite(place.rating)
      ? Math.max(0, place.rating)
      : 0
  const headlineReviewCount = hasLoadedReviewSummary
    ? reviewCount
    : typeof place.ratingCount === 'number' && Number.isFinite(place.ratingCount)
      ? Math.max(0, Math.floor(place.ratingCount))
      : 0

  useLayoutEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'auto',
    })
  }, [place.id])

  useEffect(() => {
    setIsDetailsExpanded(false)
  }, [place.id])

  useEffect(() => {
    const cachedCommunityState = readPlaceDetailCommunityCache(place.id)

    setAverageRating(cachedCommunityState?.averageRating ?? null)
    setReviewCount(cachedCommunityState?.reviewCount ?? 0)
    setHasLoadedReviewSummary(Boolean(cachedCommunityState) || !isCommunityPlaceReady)
    setComments(cachedCommunityState?.comments ?? [])
    setIsCommentsLoading(!cachedCommunityState)
  }, [isCommunityPlaceReady, place.id])

  useEffect(() => {
    writePlaceDetailCommunityCache(place.id, {
      averageRating,
      reviewCount,
      comments,
      cachedAt: Date.now(),
    })
  }, [averageRating, comments, place.id, reviewCount])

  const syncCurrentUserProfile = useCallback(async (session?: Awaited<ReturnType<typeof getSupabaseSession>> | null) => {
    const nextSession = session ?? (await getSupabaseSession())
    const nextUser = nextSession?.user ?? null
    const metadata = (nextUser?.user_metadata ?? {}) as Record<string, unknown>
    const metadataDisplayName =
      getAuthMetadataString(metadata, ['display_name', 'full_name', 'name', 'preferred_username']) ||
      cleanString(nextUser?.email?.split('@')[0]) ||
      'GalaTayo member'

    setCurrentUserId(nextUser?.id ?? null)

    if (!nextUser) {
      setCurrentUserAvatarFallbackName(metadataDisplayName)
      setCurrentUserAvatarUrl(null)
      return
    }

    setCurrentUserAvatarFallbackName((currentName) => currentName || metadataDisplayName)

    try {
      const result = await getMyProfile(nextSession)
      const profile = result.profile
      const resolvedAvatarUrl =
        cleanString(profile?.avatar_url) ||
        cleanString(profile?.provider_avatar_url) ||
        null

      setCurrentUserAvatarUrl((currentAvatarUrl) => resolvedAvatarUrl || currentAvatarUrl || null)
      setCurrentUserAvatarFallbackName(cleanString(profile?.username) || metadataDisplayName)
    } catch {
      setCurrentUserAvatarFallbackName((currentName) => currentName || metadataDisplayName)
    }
  }, [])

  useEffect(() => {
    if (!currentProfile && !appSession?.user?.id) {
      setCurrentUserAvatarUrl(null)
      setCurrentUserAvatarFallbackName('Guest User')
      return
    }

    if (!currentProfile) {
      return
    }

    setCurrentUserAvatarUrl(cleanString(currentProfile.avatarUrl) || cleanString(currentProfile.providerAvatarUrl) || null)
    setCurrentUserAvatarFallbackName(
      cleanString(currentProfile.username) || cleanString(currentProfile.displayName) || 'GalaTayo member',
    )
  }, [appSession?.user?.id, currentProfile])

  const fetchPlaceReviews = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setReviewError('')

        const session = await getSupabaseSession()
        const token = await getSupabaseAccessToken(session)

        if (!isCommunityPlaceReady) {
          setAverageRating(null)
          setReviewCount(0)
          setCurrentUserReview(null)
          setReviewRating(0)
          setHasLoadedReviewSummary(true)
          return
        }

        const response = await fetch(getApiUrl(`/places/${encodeURIComponent(placeId)}/reviews`), {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          signal,
        })

        const responseText = await response.text()
        const result = parseJsonResponse<PlaceReviewsResponse>(responseText)

        if (!response.ok) {
          throw new Error(result?.message || 'Unable to load reviews.')
        }

        const nextCurrentUserReview = result?.current_member_review ?? null
        setAverageRating(result?.average_rating ?? null)
        setReviewCount(result?.review_count ?? 0)
        setHasLoadedReviewSummary(true)
        setCurrentUserReview(nextCurrentUserReview)
        setReviewRating(nextCurrentUserReview?.rating ?? 0)
        setIsReviewEditing(false)
        const cachedComments = readPlaceDetailCommunityCache(placeId)?.comments ?? []
        writePlaceDetailCommunityCache(placeId, {
          averageRating: result?.average_rating ?? null,
          reviewCount: result?.review_count ?? 0,
          comments: cachedComments,
          cachedAt: Date.now(),
        })
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setHasLoadedReviewSummary(true)
          setReviewError(error instanceof Error ? error.message : 'Unable to load reviews.')
        }
      }
    },
    [isCommunityPlaceReady, placeId],
  )

  const fetchPlaceComments = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const cachedCommunityState = readPlaceDetailCommunityCache(placeId)

        if (!cachedCommunityState) {
          setIsCommentsLoading(true)
        }
        setCommentError('')

        if (!isCommunityPlaceReady) {
          setComments([])
          setIsCommentsLoading(false)
          return
        }

        const session = await getSupabaseSession()
        const token = await getSupabaseAccessToken(session)

        const response = await fetch(getApiUrl(`/places/${encodeURIComponent(placeId)}/comments`), {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          signal,
        })
        const responseText = await response.text()
        const result = parseJsonResponse<PlaceCommentsResponse>(responseText)

        if (!response.ok) {
          throw new Error(result?.message || 'Unable to load comments.')
        }

        setComments(result?.comments ?? [])
        writePlaceDetailCommunityCache(placeId, {
          averageRating,
          reviewCount,
          comments: result?.comments ?? [],
          cachedAt: Date.now(),
        })
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setCommentError(error instanceof Error ? error.message : 'Unable to load comments.')
        }
      } finally {
        if (!signal?.aborted) {
          setIsCommentsLoading(false)
        }
      }
    },
    [averageRating, isCommunityPlaceReady, placeId, reviewCount],
  )

  const fetchMySubmittedUserReports = useCallback(
    async (signal?: AbortSignal) => {
      const session = await getSupabaseSession()
      const token = await getSupabaseAccessToken(session)

      setAuthToken(token)

      if (!token) {
        setReportedUserIds(new Set())
        return
      }

      try {
        const reports = await getMyUserReports(token, signal)
        if (!signal?.aborted) {
          setReportedUserIds(new Set(reports.map((report) => report.reported_user_id)))
        }
      } catch {
        if (!signal?.aborted) {
          setReportedUserIds(new Set())
        }
      }
    },
    [],
  )

  useEffect(() => {
    const controller = new AbortController()
    let activeSession = null as Awaited<ReturnType<typeof getSupabaseSession>>

    queueMicrotask(() => {
      void fetchPlaceReviews(controller.signal)
      void fetchPlaceComments(controller.signal)
      void fetchMySubmittedUserReports(controller.signal)
    })

    void getSupabaseSession().then((session) => {
      activeSession = session
      void syncCurrentUserProfile(session)
      void getSupabaseAccessToken(session).then((token) => setAuthToken(token))
    })

    const { data: authSubscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const previousSession = activeSession
      activeSession = shouldPropagateSessionChange(event, previousSession, nextSession) ? nextSession : previousSession

      if (hasSessionUserChanged(previousSession, nextSession)) {
        void syncCurrentUserProfile(nextSession)
        void fetchPlaceReviews()
        void fetchPlaceComments()
        void fetchMySubmittedUserReports()
      }
    })

    return () => {
      controller.abort()
      authSubscription.subscription.unsubscribe()
    }
  }, [fetchMySubmittedUserReports, fetchPlaceComments, fetchPlaceReviews, syncCurrentUserProfile])

  useEffect(() => {
    const controller = new AbortController()

    const savePlaceViewHistory = async () => {
      try {
        if (!placeSlug) {
          return
        }

        const token = await getSupabaseAccessToken()
        if (!token) {
          return
        }

        const response = await fetch(getApiUrl('/history/place-view'), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ placeSlug }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const result = (await response.json().catch(() => null)) as { message?: string } | null
          throw new Error(result?.message || 'Failed to save place view history.')
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.warn('Place view history was not saved:', error)
        }
      }
    }

    void savePlaceViewHistory()
    return () => controller.abort()
  }, [placeSlug])

  const handleSharePlace = async () => {
    try {
      setShareError('')
      await shareLink({
        url: buildPlaceShareUrl(place),
        title: place.name,
        text: place.name,
      })
      trackPlaceShared({
        placeSlug: place.slug ?? null,
      })
    } catch {
      setShareError('Could not copy the link. Please try again.')
    }
  }

  const handleSavePlace = async () => {
    try {
      setIsSaving(true)
      setShareError('')
      setSaveError('')

      if (isSaved) {
        const message = await removeFavorite(placeId, placeSlug)
        showSystemMessage({
          title: 'Place Removed',
          description: message,
        })
        return
      }

      const result = await saveFavorite(placeId, placeSlug)

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

  const handleOpenContribution = () => {
    setContributionError('')

    if (approvedImageCount >= 3) {
      setContributionError('This place already has 3 approved images.')
      return
    }

    if (!isCommunityPlaceReady) {
      setContributionError('Photo contributions are not available for this place yet.')
      return
    }

    if (!currentUserId) {
      guestAuth.open('contribute-photo')
      return
    }

    setIsContributionOpen(true)
  }

  const handleSubmitContribution = async () => {
    if (isContributionSubmitting) {
      return
    }

    if (!canContributePhoto) {
      setContributionError(approvedImageCount >= 3 ? 'This place already has 3 approved images.' : 'Sign in as a member to contribute a photo.')
      return
    }

    if (!contributionFile) {
      setContributionError('Choose a photo first.')
      return
    }

    if (!(await isAcceptedContributionImage(contributionFile))) {
      setContributionError(contributionImageErrorMessage)
      return
    }

    try {
      setIsContributionSubmitting(true)
      setContributionError('')

      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token

      if (!token) {
        throw new Error('Sign in as a member to contribute a photo.')
      }

      const preparedFile = await preparePlaceImageUploadFile(contributionFile)

      const body = new FormData()
      body.append('image', preparedFile)

      if (contributionSourceUrl.trim()) {
        body.append('source_url', contributionSourceUrl.trim())
      }

      if (contributionNote.trim()) {
        body.append('contributor_note', contributionNote.trim())
      }

      const response = await fetch(getApiUrl(`/places/${encodeURIComponent(placeId)}/images/contributions`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body,
      })
      const responseText = await response.text()
      const result = parseJsonResponse<PlaceImageContributionResponse>(responseText)

      if (!response.ok) {
        throw new Error(result?.message || 'Unable to submit photo.')
      }

      showSystemMessage({
        title: 'Photo Submitted!',
        description: result?.message || 'Your photo was submitted for review.',
      })
      setContributionFile(null)
      setContributionSourceUrl('')
      setContributionNote('')
      setIsContributionOpen(false)
    } catch (error) {
      setContributionError(error instanceof Error ? error.message : 'Unable to submit photo.')
    } finally {
      setIsContributionSubmitting(false)
    }
  }

  const handleSubmitReview = async () => {
    if (isReviewSubmitting || isReviewDeleting) {
      return
    }

    if (reviewRating < 1 || reviewRating > 5) {
      setReviewError('Choose 1 to 5 stars muna.')
      return
    }

    if (!UUID_PATTERN.test(placeId)) {
      setReviewError('Place id is missing or invalid.')
      return
    }

    try {
      setIsReviewSubmitting(true)
      setReviewError('')

      const token = await getSupabaseAccessToken()

      if (!token) {
        throw new Error('Sign in as a member to rate this place.')
      }

      const response = await fetch(getApiUrl(`/places/${encodeURIComponent(placeId)}/reviews`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          placeId,
          rating: reviewRating,
          comment: null,
        }),
      })

      const responseText = await response.text()
      const result = parseJsonResponse<{ message?: string }>(responseText)

      if (!response.ok) {
        throw new Error(result?.message || 'Unable to save review. Please try again.')
      }

      showSystemMessage({
        title: hasCurrentUserReview ? 'Rating Updated!' : 'Rating Saved!',
        description: hasCurrentUserReview ? 'Your place rating was updated.' : 'Thanks for rating this place.',
      })
      await fetchPlaceReviews()
      setIsReviewEditing(false)
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : 'Unable to save review. Please try again.')
    } finally {
      setIsReviewSubmitting(false)
    }
  }

  const handleDeleteReview = async () => {
    if (isReviewSubmitting || isReviewDeleting) {
      return
    }

    try {
      setIsReviewDeleting(true)
      setReviewError('')

      const token = await getSupabaseAccessToken()

      if (!token) {
        throw new Error('Sign in as a member to manage your review.')
      }

      const response = await fetch(getApiUrl(`/places/${encodeURIComponent(placeId)}/reviews`), {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const responseText = await response.text()
      const result = parseJsonResponse<{ message?: string }>(responseText)

      if (!response.ok) {
        throw new Error(result?.message || 'Unable to delete review. Please try again.')
      }

      setReviewRating(0)
      setIsReviewEditing(false)
      showSystemMessage({
        title: 'Rating Removed',
        description: 'Your rating was removed from this place.',
      })
      await fetchPlaceReviews()
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : 'Unable to delete review. Please try again.')
    } finally {
      setIsReviewDeleting(false)
    }
  }

  const getSessionToken = async (loginMessage: string) => {
    const token = await getSupabaseAccessToken()

    if (!token) {
      throw new Error(loginMessage)
    }

    return token
  }

  const handleSubmitComment = async () => {
    if (isCommentSubmitting) {
      return
    }

    const body = commentBody.trim()

    if (!body) {
      setCommentError('Type a comment muna.')
      return
    }

    if (!UUID_PATTERN.test(placeId)) {
      setCommentError('Place id is missing or invalid.')
      return
    }

    const temporaryCommentId = `temp-comment-${Date.now()}`
    const optimisticComment: PlaceComment = {
      id: temporaryCommentId,
      place_id: placeId,
      user_id: currentUserId ?? 'temp-user',
      member_display_name: 'You',
      member_avatar_url: currentUserAvatarUrl,
      parent_comment_id: null,
      comment: body,
      status: 'visible',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      current_user_reported: false,
      replies: [],
      local_post_state: 'pending',
      local_error_message: null,
    }

    setCommentBody('')
    setComments((currentComments) => [optimisticComment, ...currentComments])

    try {
      setIsCommentSubmitting(true)
      setCommentError('')

      const token = await getSessionToken('Sign in as a member to comment.')

      const response = await fetch(getApiUrl(`/places/${encodeURIComponent(placeId)}/comments`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          placeId,
          comment: body,
        }),
      })
      const responseText = await response.text()
      const result = parseJsonResponse<{ message?: string; comment?: PlaceComment }>(responseText)

      if (!response.ok) {
        throw new Error(result?.message || 'Unable to post comment.')
      }

      const savedComment = result?.comment

      if (!savedComment) {
        throw new Error('Unable to post comment.')
      }

      setComments((currentComments) =>
        replaceCommentById(currentComments, temporaryCommentId, {
          ...savedComment,
          replies: savedComment.replies ?? [],
          local_post_state: undefined,
          local_error_message: null,
        }),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to post comment.'
      setComments((currentComments) =>
        replaceCommentById(currentComments, temporaryCommentId, {
          ...optimisticComment,
          local_post_state: 'failed',
          local_error_message: message,
        }),
      )
    } finally {
      setIsCommentSubmitting(false)
    }
  }

  const handleRetryFailedComment = async (commentId: string) => {
    const failedComment = comments.find((comment) => comment.id === commentId)

    if (!failedComment || failedComment.local_post_state !== 'failed' || isCommentSubmitting) {
      return
    }

    try {
      setIsCommentSubmitting(true)
      setComments((currentComments) =>
        replaceCommentById(currentComments, commentId, {
          ...failedComment,
          local_post_state: 'pending',
          local_error_message: null,
        }),
      )

      const token = await getSessionToken('Sign in as a member to comment.')
      const response = await fetch(getApiUrl(`/places/${encodeURIComponent(placeId)}/comments`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          placeId,
          comment: failedComment.comment,
        }),
      })
      const responseText = await response.text()
      const result = parseJsonResponse<{ message?: string; comment?: PlaceComment }>(responseText)

      if (!response.ok || !result?.comment) {
        throw new Error(result?.message || 'Unable to post comment.')
      }

      const savedComment = result.comment

      setComments((currentComments) =>
        replaceCommentById(currentComments, commentId, {
          ...savedComment,
          replies: savedComment.replies ?? [],
          local_post_state: undefined,
          local_error_message: null,
        }),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to post comment.'
      setComments((currentComments) =>
        replaceCommentById(currentComments, commentId, {
          ...failedComment,
          local_post_state: 'failed',
          local_error_message: message,
        }),
      )
    } finally {
      setIsCommentSubmitting(false)
    }
  }

  const handleDiscardFailedComment = (commentId: string) => {
    setComments((currentComments) => removeCommentById(currentComments, commentId))
  }

  const handleSubmitReply = async (commentId: string) => {
    if (mutatingCommentId) {
      return
    }

    const body = replyBody.trim()

    if (!body) {
      setCommentError('Type a reply muna.')
      return
    }

    try {
      setMutatingCommentId(commentId)
      setCommentError('')

      const token = await getSessionToken('Sign in as a member to reply.')
      const response = await fetch(getApiUrl(`/places/${encodeURIComponent(placeId)}/comments/${encodeURIComponent(commentId)}/replies`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          placeId,
          comment: body,
        }),
      })
      const responseText = await response.text()
      const result = parseJsonResponse<{ message?: string; comment?: PlaceComment }>(responseText)

      if (!response.ok) {
        throw new Error(result?.message || 'Unable to post reply.')
      }

      if (!result?.comment) {
        throw new Error('Unable to post reply.')
      }

      const savedReply = result.comment

      setComments((currentComments) =>
        appendReplyToComment(currentComments, commentId, {
          ...savedReply,
          replies: savedReply.replies ?? [],
          local_post_state: undefined,
          local_error_message: null,
        }),
      )
      setReplyBody('')
      setReplyingToCommentId(null)
      showSystemMessage({
        title: 'Reply Posted!',
        description: 'Your reply is now live.',
      })
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'Unable to post reply.')
    } finally {
      setMutatingCommentId(null)
    }
  }

  const handleUpdateComment = async (commentId: string) => {
    if (mutatingCommentId) {
      return
    }

    const body = editCommentBody.trim()

    if (!body) {
      setCommentError('Comment cannot be empty.')
      return
    }

    try {
      setMutatingCommentId(commentId)
      setCommentError('')

      const token = await getSessionToken('Sign in as a member to edit your comment.')
      const response = await fetch(getApiUrl(`/places/${encodeURIComponent(placeId)}/comments/${encodeURIComponent(commentId)}`), {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body }),
      })
      const responseText = await response.text()
      const result = parseJsonResponse<{ message?: string; comment?: PlaceComment }>(responseText)

      if (!response.ok) {
        throw new Error(result?.message || 'Unable to update comment.')
      }

      if (!result?.comment) {
        throw new Error('Unable to update comment.')
      }

      const savedComment = result.comment

      setComments((currentComments) =>
        updateCommentById(currentComments, commentId, (comment) => ({
          ...comment,
          ...savedComment,
          replies: comment.replies,
          local_post_state: undefined,
          local_error_message: null,
        })),
      )
      setEditingCommentId(null)
      setEditCommentBody('')
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'Unable to update comment.')
    } finally {
      setMutatingCommentId(null)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    if (mutatingCommentId) {
      return
    }

    try {
      setMutatingCommentId(commentId)
      setCommentError('')
      setOpenCommentMenuId((currentId) => (currentId === commentId ? null : currentId))
      setEditingCommentId((currentId) => (currentId === commentId ? null : currentId))
      setReplyingToCommentId((currentId) => (currentId === commentId ? null : currentId))
      setEditCommentBody('')

      const token = await getSessionToken('Sign in as a member to delete your comment.')
      const response = await fetch(getApiUrl(`/places/${encodeURIComponent(placeId)}/comments/${encodeURIComponent(commentId)}`), {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const responseText = await response.text()
      const result = parseJsonResponse<{ message?: string; comment?: PlaceComment }>(responseText)

      if (!response.ok) {
        if (response.status === 404) {
          setComments((currentComments) => markCommentDeletedById(currentComments, commentId))
          void fetchPlaceComments()
          showSystemMessage({
            title: 'Comment Removed',
            description: 'That comment was already gone, so we cleared it from the list.',
          })
          return
        }

        throw new Error(result?.message || 'Unable to delete comment.')
      }

      setComments((currentComments) => markCommentDeletedById(currentComments, commentId, result?.comment?.deleted_at ?? new Date().toISOString()))
      void fetchPlaceComments()
      showSystemMessage({
        title: 'Comment Deleted',
        description: 'Your comment was removed.',
      })
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'Unable to delete comment.')
    } finally {
      setMutatingCommentId(null)
    }
  }

  const handleReportComment = async (commentId: string) => {
    if (isReportSubmitting) {
      return
    }

    if (!reportReason) {
      setReportError('Please select a reason.')
      return
    }

    try {
      setIsReportSubmitting(true)
      setReportError('')

      const token = await getSessionToken('Sign in as a member to report comments.')
      const result = await submitCommentReport(commentId, token, {
        reason: reportReason,
        details: reportDetails,
      })

      setReportingCommentId(null)
      setOpenCommentMenuId(null)
      setReportReason('')
      setReportDetails('')
      setReportError('')
      showSystemMessage({
        title: result.alreadyReported ? 'Already Reported' : 'Report Submitted!',
        description: result.alreadyReported ? 'This comment was already in your reports.' : 'You can track this report in My Reports.',
      })
      setComments((currentComments) => markCommentReported(currentComments, commentId))
      trackPlaceReportSubmitted({
        placeSlug: place.slug ?? null,
        reportType: 'comment',
      })
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'Could not submit report. Please try again.')
    } finally {
      setIsReportSubmitting(false)
    }
  }

  const closeReportCommentModal = () => {
    if (isReportSubmitting) {
      return
    }

    setReportingCommentId(null)
    setReportReason('')
    setReportDetails('')
    setReportError('')
  }

  const handleOpenUserReport = (userId: string, username?: string | null, displayName?: string | null) => {
    setOpenCommentMenuId(null)

    if (!authToken) {
      showSystemMessage({
        title: 'Login required',
        description: 'Log in to report a user.',
      })
      return
    }

    setReportingUser({ id: userId, username, displayName })
  }

  const handleOpenPlaceConcern = () => {
    if (!currentUserId) {
      guestAuth.open('report-place')
      return
    }
    setPlaceConcernError('')
    setIsPlaceConcernOpen(true)
  }

  const handleSubmitPlaceConcern = async () => {
    if (isPlaceConcernSubmitting) {
      return
    }

    if (!placeConcernReason) {
      setPlaceConcernError('Please select a concern type.')
      return
    }

    if (!UUID_PATTERN.test(placeId)) {
      setPlaceConcernError('Place id is missing or invalid.')
      return
    }

    try {
      setIsPlaceConcernSubmitting(true)
      setPlaceConcernError('')

      const token = await getSessionToken('Sign in as a member to report place concerns.')
      await submitPlaceReport(placeId, token, {
        reason: placeConcernReason,
        details: placeConcernDetails,
        reportedImageId: null,
      })

      showSystemMessage({
        title: 'Report Submitted!',
        description: 'You can track this report in My Reports.',
      })
      setIsPlaceConcernOpen(false)
      setPlaceConcernReason('')
      setPlaceConcernDetails('')
      setPlaceConcernError('')
      trackPlaceReportSubmitted({
        placeSlug: place.slug ?? null,
        reportType: 'place',
      })
    } catch (error) {
      setPlaceConcernError(error instanceof Error ? error.message : 'Could not submit place report. Please try again.')
    } finally {
      setIsPlaceConcernSubmitting(false)
    }
  }

  const openDirections = () => openDirectionsUrl(directionsUrl)
  const handleAddToPlan = () => {
    if (!appSession) {
      guestAuth.open('add-plan')
      return
    }
    setIsAddToPlanOpen(true)
  }
  const quickTake = cleanString(place.description) || cleanString(place.reason) || 'No quick take available yet.'
  const commuteText =
    cleanString(place.commute_access) ||
    'Reachable by local routes, short walks, or ride-hailing depending on where you are coming from.'
  const parkingText = cleanString(place.parking_info) || 'Parking depends on time and crowd, so plan ahead if bringing a car.'
  const visibleCommentCount = countThreadComments(comments)

  const renderComment = (comment: PlaceComment, isReply = false): ReactNode => {
    const isDeleted = isCommentDeleted(comment)
    const isOwner = comment.user_id === currentUserId
    const isReportedByCurrentUser = Boolean(comment.current_user_reported)
    const isEditing = !isDeleted && editingCommentId === comment.id
    const isMutating = mutatingCommentId === comment.id
    const isPending = comment.local_post_state === 'pending'
    const isFailed = comment.local_post_state === 'failed'
    const isMenuOpen = !isDeleted && openCommentMenuId === comment.id
    const displayName =
      cleanString(comment.member_display_name) ||
      (isOwner ? cleanString(currentUserAvatarFallbackName) : '') ||
      'GalaTayo member'
    const profileUsername = cleanString(comment.member_username)
    const avatarUrl = cleanString(comment.member_avatar_url)
    const isEdited = wasEdited(comment.created_at, comment.updated_at)
    const canOpenProfile = isOwner || Boolean(profileUsername)

    const handleOpenCommentProfile = () => {
      if (isOwner) {
        navigateToPath('/profile')
        return
      }

      if (profileUsername) {
        navigateToPath(`/u/${encodeURIComponent(profileUsername)}`)
      }
    }

    return (
      <li key={comment.id} className={isReply ? 'ml-2 border-l border-slate-200/80 pl-3 sm:ml-3 sm:pl-4' : ''}>
        <div className={`flex items-start gap-2.5 sm:gap-3 ${isPending ? 'opacity-75' : ''}`}>
          {canOpenProfile ? (
            <button
              type="button"
              onClick={handleOpenCommentProfile}
              aria-label={`Open ${displayName}'s profile`}
              className="shrink-0 rounded-full"
            >
              <MemberAvatar displayName={displayName} avatarUrl={avatarUrl} compact reply={isReply} />
            </button>
          ) : (
            <MemberAvatar displayName={displayName} avatarUrl={avatarUrl} compact reply={isReply} />
          )}

          <div className="min-w-0 flex-1">
            <div
              className={`place-detail-comment-card w-full min-w-0 rounded-[16px] border px-3 py-2.5 ${
                isFailed
                  ? commentCardFailedClassName
                  : isDeleted
                    ? commentCardDeletedClassName
                    : commentCardSurfaceClassName
              }`}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {canOpenProfile ? (
                      <button
                        type="button"
                        onClick={handleOpenCommentProfile}
                        className={`block min-w-0 truncate text-[14px] font-black transition hover:opacity-80 ${commentTextPrimaryClassName}`}
                      >
                        {displayName}
                      </button>
                    ) : (
                      <span className={`block min-w-0 truncate text-[14px] font-black ${commentTextPrimaryClassName}`}>{displayName}</span>
                    )}
                    {isOwner ? (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ${commentBadgeSurfaceClassName} ${commentBadgeTextClassName}`}>
                        You
                      </span>
                    ) : null}
                    <span className={`text-[11px] font-semibold ${commentTextSecondaryClassName}`}>
                      {formatReviewDate(comment.updated_at || comment.created_at)}
                      {isEdited ? <span className={`ml-1 ${commentTextMutedClassName}`}>edited</span> : null}
                    </span>
                    {isPending ? (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black ${commentBadgeSurfaceClassName} ${commentBadgeTextClassName}`}>
                        Posting...
                      </span>
                    ) : null}
                  </div>
                </div>
                {!isDeleted && currentUserId ? (
                  <div className="relative shrink-0" ref={isMenuOpen ? commentMenuRef : null}>
                    <button
                      type="button"
                      aria-label="Open comment actions"
                      aria-haspopup="menu"
                      aria-expanded={isMenuOpen}
                      onClick={() => setOpenCommentMenuId((currentId) => (currentId === comment.id ? null : comment.id))}
                      className={commentMenuButtonClassName}
                    >
                      <FontAwesomeIcon icon={faEllipsis} className="h-4 w-4" />
                    </button>

                    {isMenuOpen ? (
                      <div
                        role="menu"
                        className={commentMenuClassName}
                      >
                    {isOwner ? (
                          <>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setEditingCommentId(comment.id)
                                setEditCommentBody(comment.comment)
                                setCommentError('')
                                setOpenCommentMenuId(null)
                              }}
                              className={commentMenuItemClassName}
                            >
                              <FontAwesomeIcon icon={faPen} className="h-3.5 w-3.5" />
                              Edit comment
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenCommentMenuId(null)
                                void handleDeleteComment(comment.id)
                              }}
                              disabled={isMutating}
                              className={commentMenuItemDangerClassName}
                            >
                              <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
                              {isMutating ? 'Deleting...' : 'Delete comment'}
                            </button>
                          </>
                        ) : currentUserId ? (
                          <>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setReportingCommentId(comment.id)
                                setReportReason('')
                                setReportDetails('')
                                setReportError('')
                                setOpenCommentMenuId(null)
                              }}
                              disabled={isReportedByCurrentUser || isReportSubmitting}
                              className={commentMenuItemClassName}
                            >
                              <FontAwesomeIcon icon={faFlag} className="h-3.5 w-3.5" />
                              {isReportedByCurrentUser ? 'Already reported' : isReportSubmitting && reportingCommentId === comment.id ? 'Reporting...' : 'Report comment'}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => handleOpenUserReport(comment.user_id, comment.member_username, displayName)}
                              disabled={reportedUserIds.has(comment.user_id)}
                              className={commentMenuItemClassName}
                            >
                              <AppIcon name="profile" className="h-3.5 w-3.5" />
                              {reportedUserIds.has(comment.user_id) ? 'Already reported user' : 'Report user'}
                            </button>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {isEditing ? (
                <div className="mt-2">
                  <textarea
                    value={editCommentBody}
                    onChange={(event) => setEditCommentBody(event.target.value)}
                    rows={3}
                    disabled={isMutating}
                    className={`comment-composer-input w-full resize-none rounded-xl px-3 py-2.5 text-[14px] font-semibold outline-none transition disabled:cursor-not-allowed disabled:opacity-70 ${
                      isDarkTheme ? 'bg-transparent text-[#e8f0fb]' : 'bg-white text-slate-800'
                    }`}
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleUpdateComment(comment.id)}
                      disabled={isMutating}
                      className="rounded-full border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-[12px] font-extrabold text-white shadow-[0_10px_20px_rgba(47,116,232,0.2)] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isMutating ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCommentId(null)
                        setEditCommentBody('')
                      }}
                      disabled={isMutating}
                      className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-[12px] font-extrabold text-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className={`mt-1.5 whitespace-pre-line break-words text-[14px] font-semibold leading-[1.45] ${isDeleted ? `italic ${commentTextMutedClassName}` : commentTextBodyClassName}`}>{comment.comment}</p>
              )}

              {isFailed && comment.local_error_message ? (
                <p className="mt-2 text-[12px] font-bold text-red-600">{comment.local_error_message}</p>
              ) : null}
            </div>

            {!isEditing ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-0.5 text-[11px] font-extrabold">
                {!isDeleted && !isReply && currentUserId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setReplyingToCommentId(replyingToCommentId === comment.id ? null : comment.id)
                      setReplyBody('')
                      setCommentError('')
                    }}
                    disabled={isMutating}
                    className="inline-flex items-center gap-1 text-slate-500 transition hover:text-[var(--accent-deep)] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <FontAwesomeIcon icon={faReply} className="h-3.5 w-3.5" />
                    Reply
                  </button>
                ) : null}
                {!isDeleted && isOwner ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCommentId(comment.id)
                        setEditCommentBody(comment.comment)
                        setCommentError('')
                      }}
                      disabled={isMutating}
                      className="inline-flex items-center gap-1 text-slate-500 transition hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <FontAwesomeIcon icon={faPen} className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  </>
                ) : null}
                {!isDeleted && !isOwner && currentUserId ? (
                  isReportedByCurrentUser ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-slate-500">
                      <FontAwesomeIcon icon={faFlag} className="h-3.5 w-3.5" />
                      Reported
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setReportingCommentId(comment.id)
                        setReportReason('')
                        setReportDetails('')
                        setReportError('')
                      }}
                      disabled={isReportSubmitting && reportingCommentId === comment.id}
                      className="inline-flex items-center gap-1 text-slate-500 transition hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <FontAwesomeIcon icon={faFlag} className="h-3.5 w-3.5" />
                      {isReportSubmitting && reportingCommentId === comment.id ? 'Reporting...' : 'Report'}
                    </button>
                  )
                ) : null}
                {isFailed ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleRetryFailedComment(comment.id)}
                      disabled={isCommentSubmitting}
                      className="inline-flex items-center gap-1 text-[var(--accent-deep)] transition hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDiscardFailedComment(comment.id)}
                      disabled={isCommentSubmitting}
                      className="inline-flex items-center gap-1 text-slate-500 transition hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Dismiss
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {replyingToCommentId === comment.id ? (
          <div className={`place-detail-comment-reply ml-8 mt-2.5 rounded-[16px] px-3 py-3 sm:ml-9 ${commentReplySurfaceClassName}`}>
            <textarea
              value={replyBody}
              onChange={(event) => setReplyBody(event.target.value)}
              rows={2}
              disabled={isMutating}
              placeholder="Add a reply..."
              className={`comment-composer-input w-full resize-none rounded-xl px-3 py-2.5 text-[14px] font-semibold outline-none transition disabled:cursor-not-allowed disabled:opacity-70 ${
                isDarkTheme ? 'bg-transparent text-[#e8f0fb]' : 'bg-white text-slate-800'
              }`}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleSubmitReply(comment.id)}
                disabled={isMutating}
                className="rounded-full border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-[12px] font-extrabold text-white shadow-[0_10px_20px_rgba(47,116,232,0.2)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isMutating ? 'Replying...' : 'Reply'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setReplyingToCommentId(null)
                  setReplyBody('')
                }}
                disabled={isMutating}
                className={`rounded-full border px-4 py-2 text-[12px] font-extrabold disabled:cursor-not-allowed disabled:opacity-70 ${
                  isDarkTheme
                    ? 'border-[#28405f] bg-[#0f1b2d] text-[#d7e2f2]'
                    : 'border-[var(--line)] bg-white text-slate-700'
                }`}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {comment.replies.length > 0 ? (
          <ul className="mt-2.5 grid gap-2.5">
            {comment.replies.map((reply) => renderComment(reply, true))}
          </ul>
        ) : null}
      </li>
    )
  }

  const renderCommunitySection = () =>
    !isCommunityPlaceReady ? (
      <DetailSection>
                    <SectionHeading
                      icon="userGroup"
                      title="Community"
                      badgeClassName="place-detail-section-heading--alt"
                      iconClassName="place-detail-section-heading--alt-icon"
                      titleClassName="place-detail-community-heading-title"
                    />
        <div className={`place-detail-comments mt-5 rounded-3xl border p-4 sm:p-5 ${commentSectionSurfaceClassName}`}>
          <ReviewSkeleton />
          <div className="mt-5 border-t border-[var(--line)] pt-5">
            <CommentSkeleton />
          </div>
        </div>
      </DetailSection>
    ) : (
      <DetailSection>
        <SectionHeading
          icon="userGroup"
          title="Community"
          badgeClassName="place-detail-section-heading--alt"
          iconClassName="place-detail-section-heading--alt-icon"
          titleClassName="place-detail-community-heading-title"
        />
        <div className="mt-5">
          <div>
            <h3 className="text-[20px] font-black text-slate-950">Rate this place</h3>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] font-semibold text-slate-600">
              <span className="text-[15px] font-black text-slate-950">
                {(reviewCount > 0 && averageRating !== null ? averageRating : 0).toFixed(1)}
              </span>
              <StarsDisplay rating={reviewCount > 0 && averageRating !== null ? Math.round(averageRating) : 0} compact />
              <span className="text-slate-500">
                {reviewCount > 0
                  ? `(${formatRatingCount(reviewCount)} ${reviewCount === 1 ? 'rating' : 'ratings'})`
                  : '(0 ratings)'}
              </span>
            </div>
            <p className="mt-1 text-[14px] font-semibold text-slate-600">
              {reviewCount > 0 && averageRating !== null
                ? `Rated ${averageRating.toFixed(1)} by ${reviewCount} ${reviewCount === 1 ? 'person' : 'people'}.`
                : '0 ratings yet. Be the first to help others decide.'}
            </p>

            {currentUserId && (!hasCurrentUserReview || isReviewEditing) ? (
              <div className="mt-4">
                <div className="w-full overflow-x-auto">
                  <StarRatingInput
                    value={reviewRating}
                    disabled={isReviewSubmitting || isReviewDeleting}
                    onChange={(value) => {
                      setReviewRating(value)
                      setReviewError('')
                    }}
                  />
                </div>
                <p className="mt-2 text-[13px] font-semibold text-slate-500">
                  {reviewRating > 0 ? `Your rating: ${reviewRating} star${reviewRating === 1 ? '' : 's'} \u00B7 ${getRatingTone(reviewRating)}` : 'Tap a star to rate this place.'}
                </p>
                <div className="mt-2 min-h-5">
                  {reviewError ? <p className="text-[13px] font-bold text-red-600">{reviewError}</p> : null}
                </div>

                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => void handleSubmitReview()}
                    disabled={isReviewSubmitting || isReviewDeleting || reviewRating < 1}
                    className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-4 text-[13px] font-extrabold text-white shadow-[0_12px_24px_rgba(47,116,232,0.2)] transition hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-[var(--bg-soft)] disabled:text-slate-500 disabled:shadow-none disabled:opacity-100"
                  >
                    {isReviewSubmitting ? 'Saving...' : 'Save rating'}
                  </button>
                  {hasCurrentUserReview ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsReviewEditing(false)
                        setReviewRating(currentUserReview?.rating ?? 0)
                        setReviewError('')
                      }}
                      disabled={isReviewSubmitting || isReviewDeleting}
                      className="ml-3 text-[12px] font-extrabold text-slate-500 transition hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            ) : currentUserId && currentUserReview ? (
              <div className="mt-4">
                <div className="w-full overflow-x-auto">
                  <StarsDisplay rating={currentUserReview.rating} />
                </div>
                <p className="mt-2 text-[13px] font-semibold text-slate-500">
                  Your rating: {currentUserReview.rating} star{currentUserReview.rating === 1 ? '' : 's'} {'\u00B7'} {getRatingTone(currentUserReview.rating)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] font-extrabold">
                  <button
                    type="button"
                    onClick={() => {
                      setIsReviewEditing(true)
                      setReviewRating(currentUserReview.rating)
                      setReviewError('')
                    }}
                    disabled={isReviewSubmitting || isReviewDeleting}
                    className="text-slate-500 transition hover:text-[var(--accent-deep)] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteReview()}
                    disabled={isReviewSubmitting || isReviewDeleting}
                    className="text-red-500 transition hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isReviewDeleting ? 'Removing...' : 'Remove'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <p className="text-[13px] font-semibold text-slate-400">Sign in to leave a rating.</p>
              </div>
            )}
            <div className="mt-4 flex justify-start md:justify-end">
              <button
                type="button"
                onClick={handleOpenPlaceConcern}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-red-600 transition hover:text-red-700"
              >
                <Icon name="warning" className="h-3.5 w-3.5" />
                Report a concern
              </button>
            </div>
          </div>

          <div className="mt-5 border-t border-[var(--line)] pt-5">
            <div className={`place-detail-comments mt-5 rounded-3xl border p-4 sm:p-5 ${commentSectionSurfaceClassName}`}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/80 pb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className={`place-detail-comments-icon inline-flex h-8 w-8 items-center justify-center rounded-2xl ${commentBadgeSurfaceClassName} ${commentBadgeTextClassName}`}>
                      <FontAwesomeIcon icon={faComment} className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className={`place-detail-comments-title text-[18px] font-black ${commentTextPrimaryClassName}`}>Comments</h3>
                      <p className={`mt-0.5 text-[13px] font-semibold ${commentTextSecondaryClassName}`}>
                        {isCommentsLoading
                          ? 'Loading comments...'
                          : visibleCommentCount === 0
                            ? '0 comments'
                            : `${visibleCommentCount} comment${visibleCommentCount === 1 ? '' : 's'}`}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {currentUserId ? (
                <div className="mt-4 flex items-start gap-3">
                  <MemberAvatar displayName={currentUserAvatarFallbackName} avatarUrl={currentUserAvatarUrl} compact />
                  <div className="min-w-0 flex-1">
                    <div className={`place-detail-comments-composer rounded-[14px] px-3 py-2.5 transition ${commentComposerSurfaceClassName}`}>
                      <textarea
                        value={commentBody}
                        onChange={(event) => setCommentBody(event.target.value)}
                        onFocus={() => setIsCommentComposerFocused(true)}
                        onBlur={() => setIsCommentComposerFocused(false)}
                        rows={2}
                        disabled={isCommentSubmitting}
                        placeholder="Write a quick comment..."
                        className={`comment-composer-input w-full resize-none border-0 bg-transparent px-0 py-0 text-[14px] font-semibold outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-70 ${
                          isCommentComposerFocused || commentBody.trim() ? 'h-[80px]' : 'h-[48px]'
                        } ${isDarkTheme ? 'text-[#e8f0fb] placeholder:text-[#7f94b1]' : 'text-slate-800'}`}
                      />
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => void handleSubmitComment()}
                          disabled={isCommentSubmitting || !commentBody.trim()}
                          className="rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-[12px] font-extrabold text-white disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-[var(--bg-soft)] disabled:text-slate-500 disabled:opacity-100"
                        >
                          {isCommentSubmitting ? 'Posting...' : 'Comment'}
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 min-h-5">
                      {commentError ? <p className="text-[13px] font-bold text-red-600">{commentError}</p> : null}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <GuestAuthPrompt
                    variant="community"
                    mode="inline-card"
                    className="gala-auth-prompt--protected-feature"
                  />
                </div>
              )}

              {isCommentsLoading ? (
                <CommentSkeleton />
              ) : visibleCommentCount === 0 ? (
                <div className={`place-detail-comments-empty mt-5 flex flex-col items-center rounded-[20px] border border-dashed px-6 py-8 text-center ${isDarkTheme ? 'border-[#28405f] bg-[#0d1727]' : 'border-[var(--line-strong)] bg-slate-50'}`}>
                  <span className={`place-detail-comments-empty-icon inline-flex h-12 w-12 items-center justify-center rounded-full ${commentBadgeSurfaceClassName} ${commentBadgeTextClassName}`}>
                    <FontAwesomeIcon icon={faComment} className="h-5 w-5" />
                  </span>
                  <p className={`mt-3 text-[16px] font-black ${commentTextPrimaryClassName}`}>No comments yet</p>
                  <p className={`mt-1 max-w-[26rem] text-[13px] font-semibold leading-5 ${commentTextSecondaryClassName}`}>
                    Be the first to share something about this place.
                  </p>
                </div>
              ) : (
                <ul className="mt-4 grid gap-3.5">
                  {comments.map((comment) => renderComment(comment))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </DetailSection>
    )
  return (
    <PageShell tone="surface">
      <AppHeader />

      <main className="w-full pb-36 pt-0 sm:pb-12 sm:pt-0 md:pt-6">
        <PageContainer size="wide">
          <Breadcrumb
            showBack
            className="mb-4 pt-5"
            items={breadcrumbItems}
          />

          <PlacePhoto
            imageUrls={galleryPhotos}
            placeName={place.name}
            currentIndex={activeGalleryIndex}
            onPrevious={() =>
              setActiveGalleryState((currentState) => ({
                key: galleryStateKey,
                index: Math.max((currentState.key === galleryStateKey ? currentState.index : 0) - 1, 0),
              }))
            }
            onNext={() =>
              setActiveGalleryState((currentState) => ({
                key: galleryStateKey,
                index: Math.min((currentState.key === galleryStateKey ? currentState.index : 0) + 1, galleryPhotos.length - 1),
              }))
            }
            onSelect={(index) => setActiveGalleryState({ key: galleryStateKey, index })}
            showAddPhotoAction={approvedImageCount < 3}
            onContribute={handleOpenContribution}
            priceBadgeLabel={priceBadgeLabel}
          />

          <section className="py-3 lg:py-4">
            <div className="flex flex-col gap-3 lg:gap-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <h1 className="min-w-0 text-[26px] font-black leading-tight text-slate-950 sm:text-[32px]">{place.name}</h1>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] font-semibold text-slate-600">
                    <span className="text-[15px] font-black text-slate-950">{headlineRating.toFixed(1)}</span>
                    <StarsDisplay rating={Math.round(headlineRating)} compact />
                    <span className="text-slate-500">
                      ({formatRatingCount(headlineReviewCount)} {headlineReviewCount === 1 ? 'rating' : 'ratings'})
                    </span>
                  </div>

                  <div className="mt-3 grid w-full max-w-[28rem] grid-cols-2 gap-2 min-[360px]:grid-cols-3 sm:gap-2.5 md:mt-4 lg:flex lg:max-w-none">
                    <button
                      type="button"
                      onClick={handleAddToPlan}
                      className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--primary)] min-[360px]:col-span-3 px-5 text-[14px] font-semibold text-white transition-opacity hover:opacity-95 lg:flex-[1.4]"
                    >
                      <span aria-hidden="true" className="text-[18px] leading-none">+</span>
                      Add to Gala Plan
                    </button>
                    <ActionButton icon="save" onClick={handleSavePlace} disabled={isSaving} active={isSaved}>
                      {isSaving ? 'Saving' : isSaved ? 'Saved' : 'Save'}
                    </ActionButton>
                    <ActionButton icon="share" onClick={handleSharePlace}>
                      Share
                    </ActionButton>
                    <ActionButton icon="directions" onClick={openDirections} disabled={!directionsUrl} className="col-span-2 min-[360px]:col-span-1">
                      Directions
                    </ActionButton>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-600">
                  <Icon name="category" className="h-4 w-4 shrink-0 text-slate-500" />
                  {categoryLabel}
                </span>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-600">
                  <Icon name="location" className="h-4 w-4 shrink-0 text-slate-500" />
                  {locationLabel}
                </span>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-start gap-1.5 text-[13px] font-semibold text-slate-600">
                  <Icon name="budget" className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                  <span className="min-w-0 leading-5">{budgetLabel}</span>
                </span>
              </div>

              <div className="-mt-1">
                {shareError ? <p className="text-[12px] font-bold text-red-600">{shareError}</p> : null}
                {saveError ? <p className="text-[12px] font-bold text-red-600">{saveError}</p> : null}
                {contributionError && !isContributionOpen ? <p className="text-[12px] font-bold text-red-600">{contributionError}</p> : null}
              </div>

              <DetailSection>
                <SectionHeading
                  icon="eye"
                  title="Quick Take"
                  badgeClassName="place-detail-section-heading--alt"
                  iconClassName="place-detail-section-heading--alt-icon"
                />
                <p className="mt-3 text-[14px] font-semibold leading-6 text-slate-700">{quickTake}</p>
              </DetailSection>

              <div className="flex justify-start lg:hidden">
                <button
                  type="button"
                  onClick={() => setIsDetailsExpanded((current) => !current)}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white px-4 py-2 text-[13px] font-black text-slate-800 transition hover:border-[var(--accent)] hover:text-[var(--accent-deep)]"
                >
                  {isDetailsExpanded ? 'Show less details' : 'Show more details'}
                  <Icon
                    name="chevronDown"
                    className={`h-4 w-4 transition-transform ${isDetailsExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
              </div>

              <div className={`${isDetailsExpanded ? '' : 'hidden'} lg:block`}>
                <div className="grid gap-4 lg:gap-5">
                  <DetailSection>
                    <SectionHeading
                      icon="fire"
                      title="Best For"
                      badgeClassName="place-detail-section-heading--alt"
                      iconClassName="place-detail-section-heading--alt-icon"
                    />
                    <div className="mt-3">
                      <GoodForList values={goodFor} iconClassName="place-detail-section-heading--alt-icon" />
                    </div>
                  </DetailSection>

                  <CardSurface pad="default" tone="outlined" className="rounded-2xl">
                    <div className="flex items-center gap-2.5">
                      <span className="place-detail-section-heading__badge place-detail-section-heading--alt flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-wash)] text-[var(--accent-deep)]">
                        <Icon name="book" className="place-detail-section-heading__icon place-detail-section-heading--alt-icon h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Quick Facts</p>
                        <h2 className="text-[15px] font-black text-slate-950">At a glance</h2>
                      </div>
                    </div>
                    <dl className="mt-4 grid gap-3 text-[13px] font-semibold text-slate-700">
                      <div className="flex items-start gap-2.5">
                        <Icon name="category" className="place-detail-section-heading--alt-icon mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                        <div className="min-w-0">
                          <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Category</dt>
                          <dd className="mt-0.5 text-slate-800">{categoryLabel}</dd>
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <Icon name="clock" className="place-detail-section-heading--alt-icon mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                        <div className="min-w-0">
                          <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Best Time</dt>
                          <dd className="mt-0.5 text-slate-800">{cleanString(place.best_time_to_visit) || 'Check on site'}</dd>
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <Icon name="budget" className="place-detail-section-heading--alt-icon mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                        <div className="min-w-0">
                          <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Budget</dt>
                          <dd className="mt-0.5 text-slate-800">{budgetLabel}</dd>
                        </div>
                      </div>
                    </dl>
                  </CardSurface>

                  <DetailSection>
                    <SectionHeading
                      icon="location"
                      title="Location"
                      badgeClassName="place-detail-section-heading--alt"
                      iconClassName="place-detail-section-heading--alt-icon"
                    />
                    <p className="mt-3 whitespace-pre-line text-[14px] font-semibold leading-6 text-slate-700">{addressLabel}</p>
                    <div className="mt-4 overflow-hidden rounded-xl border border-[var(--line)] bg-slate-50">
                      {isDetailsExpanded || isDesktop ? (
                        <MapViewMemo
                          place={place}
                          zoom={16}
                          autoFitToPlaces={false}
                          className="!h-[180px] !rounded-none !border-0 sm:!h-[240px] lg:!h-[280px]"
                        />
                      ) : (
                        <div className="h-[180px] sm:h-[240px] lg:h-[280px]" />
                      )}
                    </div>
                  </DetailSection>

                  <DetailSection>
                    <SectionHeading
                      icon="bus"
                      title="How To Get There"
                      badgeClassName="place-detail-section-heading--alt"
                      iconClassName="place-detail-section-heading--alt-icon"
                    />
                    <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                      <TransportColumn icon="bus" title="Commute" iconClassName="place-detail-section-heading--alt-icon">
                        {commuteText}
                      </TransportColumn>
                      <TransportColumn icon="car" title="Parking" iconClassName="place-detail-section-heading--alt-icon">
                        {parkingText}
                      </TransportColumn>
                    </div>
                  </DetailSection>

                  <DetailSection>
                    <SectionHeading
                      icon="book"
                      title="FREQUENTLY ASKED QUESTIONS"
                      preserveCase
                      badgeClassName="place-detail-section-heading--alt"
                      iconClassName="place-detail-section-heading--alt-icon"
                    />
                    <div className="mt-4 space-y-4">
                      {faqItems.map((item) => (
                        <div key={item.question}>
                          <h3 className="text-[15px] font-black text-slate-900">{item.question}</h3>
                          <p className="mt-1 text-[14px] font-semibold leading-6 text-slate-700">{item.answer}</p>
                        </div>
                      ))}
                    </div>
                    {canonicalPlaceLink && areaLink && areaBreadcrumb ? (
                      <p className="mt-4 text-[13px] font-semibold leading-6 text-slate-600">
                        Explore more from{' '}
                        <InternalLink href={areaLink} className="place-detail-more-links text-[var(--accent)] underline underline-offset-2">
                          {areaBreadcrumb.areaName}
                        </InternalLink>{' '}
                        or browse the full{' '}
                        <InternalLink href="/places" className="place-detail-more-links text-[var(--accent)] underline underline-offset-2">
                          places hub
                        </InternalLink>.
                      </p>
                    ) : null}
                  </DetailSection>

                  {renderCommunitySection()}
                </div>
              </div>
            </div>
          </section>
        </PageContainer>
      </main>

      {guestAuth.promptElement}
      <AddToGalaPlanModal
        isOpen={isAddToPlanOpen}
        placeId={place.id}
        placeName={place.name}
        onClose={() => setIsAddToPlanOpen(false)}
      />

      {reportingCommentId ? (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/45 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-comment-title"
          onClick={closeReportCommentModal}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--line)] bg-white p-3 shadow-[0_24px_70px_rgba(27,26,23,0.25)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="report-comment-title" className="text-[18px] font-black text-slate-950">
              <strong>Report comment</strong>
            </h3>
            <p className="mt-1 text-[13px] font-semibold text-slate-700">Why are you reporting this comment?</p>

            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {commentReportReasons.map((reason) => (
                <button
                  key={reason.value}
                  type="button"
                  onClick={() => {
                    setReportReason(reason.value)
                    setReportError('')
                  }}
                  disabled={isReportSubmitting}
                  className={`min-h-11 rounded-xl border px-3 text-left text-[14px] font-extrabold transition ${
                    reportReason === reason.value
                      ? 'border-[var(--accent)] bg-[var(--accent-wash)] text-[var(--accent-deep)]'
                      : 'border-[var(--line)] bg-white text-slate-800 hover:border-[var(--accent)]'
                  } disabled:cursor-not-allowed disabled:opacity-70`}
                  aria-pressed={reportReason === reason.value}
                >
                  {reason.label}
                </button>
              ))}
            </div>

            <label className="mt-3 block">
              <span className="flex items-center gap-2 text-[12px] font-black text-slate-800">
                Extra details
                <span className="optional-label">Optional</span>
              </span>
              <textarea
                value={reportDetails}
                onChange={(event) => setReportDetails(event.target.value.slice(0, 500))}
                disabled={isReportSubmitting}
                rows={3}
                placeholder="Add any context that helps us review this."
                className="mt-1.5 w-full resize-none rounded-xl border border-[var(--line)] bg-white px-3 py-1.5 text-[13px] font-semibold leading-5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-wash)]"
              />
              <span className="mt-1 block text-right text-[11px] font-bold text-slate-500">{reportDetails.length}/500</span>
            </label>

            <div className="mt-2 min-h-0">
              {reportError ? <p className="text-[12px] font-bold text-red-600">{reportError}</p> : null}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={closeReportCommentModal}
                disabled={isReportSubmitting}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[var(--line)] bg-white px-3 text-[13px] font-extrabold text-slate-700"
              >
                <AppIcon name="clear" className="h-4 w-4" />
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleReportComment(reportingCommentId)}
                disabled={isReportSubmitting || !reportReason}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-red-600 bg-red-600 px-3 text-[13px] font-extrabold text-white disabled:opacity-50"
              >
                <AppIcon name="reports" className="h-4 w-4" />
                {isReportSubmitting ? 'Submitting...' : 'Submit report'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ReportUserModal
        isOpen={Boolean(reportingUser)}
        userId={reportingUser?.id ?? null}
        username={reportingUser?.username}
        displayName={reportingUser?.displayName}
        authToken={authToken}
        onClose={() => setReportingUser(null)}
        onSubmitted={({ reportedUserId, alreadyReported, message }) => {
          setReportedUserIds((current) => new Set([...current, reportedUserId]))
          showSystemMessage({
            title: alreadyReported ? 'Already reported' : 'Report submitted',
            description: message,
          })
        }}
      />

      {isPlaceConcernOpen ? (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/45 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-place-concern-title"
          onClick={() => {
            if (!isPlaceConcernSubmitting) {
              setIsPlaceConcernOpen(false)
              setPlaceConcernError('')
            }
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--line)] bg-white p-3 shadow-[0_24px_70px_rgba(27,26,23,0.25)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="report-place-concern-title" className="text-[18px] font-black text-slate-950">
              <strong>Report place concern</strong>
            </h3>
            <p className="mt-1 text-[13px] font-semibold text-slate-700">
              Send this place report directly to GalaTayo for review.
            </p>

            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {placeConcernReasons.map((reason) => (
                <button
                  key={reason.value}
                  type="button"
                  onClick={() => {
                    setPlaceConcernReason(reason.value)
                    setPlaceConcernError('')
                  }}
                  disabled={isPlaceConcernSubmitting}
                  className={`min-h-11 rounded-xl border px-3 text-left text-[14px] font-extrabold transition ${
                    placeConcernReason === reason.value
                      ? 'border-[var(--accent)] bg-[var(--accent-wash)] text-[var(--accent-deep)]'
                      : 'border-[var(--line)] bg-white text-slate-800 hover:border-[var(--accent)]'
                  } disabled:cursor-not-allowed disabled:opacity-70`}
                  aria-pressed={placeConcernReason === reason.value}
                >
                  {reason.label}
                </button>
              ))}
            </div>

            <label className="mt-3 block">
              <span className="flex items-center gap-2 text-[12px] font-black text-slate-800">
                Extra details
                <span className="optional-label">Optional</span>
              </span>
              <textarea
                value={placeConcernDetails}
                onChange={(event) => setPlaceConcernDetails(event.target.value.slice(0, 1000))}
                disabled={isPlaceConcernSubmitting}
                rows={3}
                placeholder="Tell us what looks wrong or what should be reviewed."
                className="mt-1.5 w-full resize-none rounded-xl border border-[var(--line)] bg-white px-3 py-1.5 text-[13px] font-semibold leading-5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-wash)]"
              />
              <span className="mt-1 block text-right text-[11px] font-bold text-slate-500">{placeConcernDetails.length}/1000</span>
            </label>

            <div className="mt-2 min-h-0">
              {placeConcernError ? <p className="text-[12px] font-bold text-red-600">{placeConcernError}</p> : null}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (!isPlaceConcernSubmitting) {
                    setIsPlaceConcernOpen(false)
                    setPlaceConcernError('')
                  }
                }}
                disabled={isPlaceConcernSubmitting}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[var(--line)] bg-white px-3 text-[13px] font-extrabold text-slate-700"
              >
                <AppIcon name="clear" className="h-4 w-4" />
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSubmitPlaceConcern()}
                disabled={isPlaceConcernSubmitting || !placeConcernReason}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-red-600 bg-red-600 px-3 text-[13px] font-extrabold text-white disabled:opacity-50"
              >
                <AppIcon name="reports" className="h-4 w-4" />
                {isPlaceConcernSubmitting ? 'Submitting...' : 'Submit report'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isContributionOpen ? (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/45 px-5 py-8 sm:px-4 sm:py-0"
          role="dialog"
          aria-modal="true"
          aria-labelledby="contribute-photo-title"
          onClick={() => {
            if (!isContributionSubmitting) {
              setIsContributionOpen(false)
            }
          }}
        >
          <div
            className="w-full max-w-[22rem] -translate-y-12 rounded-2xl border border-[var(--line)] bg-white p-4 shadow-[0_24px_70px_rgba(27,26,23,0.25)] sm:max-w-md sm:translate-y-0"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="contribute-photo-title" className="text-[18px] font-black text-slate-950">
              Contribute Photo
            </h3>
            <p className="mt-1 text-[14px] font-semibold leading-6 text-slate-700">
              Submitted photos are reviewed first before appearing publicly.
            </p>

            <label className="mt-4 block">
              <span className="text-[13px] font-black text-slate-800">Image file</span>
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
                disabled={isContributionSubmitting}
                onChange={(event) => {
                  setContributionFile(event.target.files?.[0] ?? null)
                  setContributionError('')
                }}
                className="mt-2 w-full text-sm font-semibold text-slate-700 file:mr-4 file:h-10 file:rounded-lg file:border-0 file:bg-black file:px-4 file:text-sm file:font-black file:text-white disabled:cursor-not-allowed disabled:opacity-70"
              />
              <span className="mt-1 block text-xs font-semibold text-[var(--muted)]">JPEG, PNG, or WebP up to 5MB.</span>
            </label>

            <label className="mt-4 block">
              <span className="flex items-center gap-2 text-[13px] font-black text-slate-800">
                Source URL
                <span className="optional-label">Optional</span>
              </span>
              <input
                type="url"
                value={contributionSourceUrl}
                onChange={(event) => setContributionSourceUrl(event.target.value.slice(0, 500))}
                disabled={isContributionSubmitting}
                placeholder="https://..."
                className="mt-2 h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-[14px] font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-wash)] disabled:cursor-not-allowed disabled:opacity-70"
              />
            </label>

            <label className="mt-4 block">
              <span className="flex items-center gap-2 text-[13px] font-black text-slate-800">
                Contributor note
                <span className="optional-label">Optional</span>
              </span>
              <textarea
                value={contributionNote}
                onChange={(event) => setContributionNote(event.target.value.slice(0, 1000))}
                disabled={isContributionSubmitting}
                rows={4}
                placeholder="Anything the reviewer should know?"
                className="mt-2 w-full resize-none rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-[14px] font-semibold leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-wash)] disabled:cursor-not-allowed disabled:opacity-70"
              />
            </label>

            <div className="mt-3 min-h-5">
              {contributionError ? <p className="text-[13px] font-bold text-red-600">{contributionError}</p> : null}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsContributionOpen(false)}
                disabled={isContributionSubmitting}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 text-[14px] font-extrabold text-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSubmitContribution()}
                disabled={isContributionSubmitting}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-4 text-[14px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                <FontAwesomeIcon icon={faCheck} className="h-4 w-4" />
                {isContributionSubmitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  )
}

export default PlaceDetailView
