import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { PlaceCardData } from './PlaceCard'
import AppHeader from './AppHeader'
import GuestLimitModal from './GuestLimitModal'
import AddToGalaPlanModal from './AddToGalaPlanModal'
import InternalLink from './InternalLink'
import Breadcrumb from './Breadcrumb'
import MapView from './MapView'
import ReportUserModal from './ReportUserModal'
import UnifiedLoadingState from './UnifiedLoadingState'
import PlaceImageNotice from './PlaceImageNotice'
import { AppIcon, type AppIconName } from './AppIcon'
import { ArrowLeft, ChevronLeft, ChevronRight, Flag, House, ImagePlus, MapPin, MessageCircle, MoreHorizontal, Pencil, Reply, Search, Trash2 } from 'lucide-react'
import { normalizePlaceSlug } from '../data/curatedPlaceImages'
import { useSavedFavorites } from '../context/SavedFavoritesContext'
import { useSystemMessage } from '../context/SystemMessageContext'
import { getSupabaseAccessToken, getSupabaseSession, hasSessionUserChanged, shouldPropagateSessionChange, supabase } from '../supabase'
import { buildPlaceShareUrl, shareLink } from '../utils/share'
import { getDirectionsUrl, openDirectionsUrl } from '../utils/directions'
import { submitCommentReport, type CommentReportReason } from '../utils/commentReportsApi'
import { submitPlaceReport, type PlaceReportReason } from '../utils/placeReportsApi'
import { getMyUserReports } from '../utils/userReportsApi'
import { getMyProfile } from '../utils/profileApi'
import { navigateToPath } from '../utils/navigation'

type PlaceDetailViewProps = {
  place: PlaceCardData & {
    id: string
    slug: string
  }
  onBack: () => void
  areaBreadcrumb?: {
    areaSlug: string
    areaName: string
  } | null
  cameFromSearch?: boolean
  returnLabel?: string | null
}

type PlaceReview = {
  id: string
  place_id: string
  submitted_by: string
  member_display_name?: string | null
  rating: number
  comment: string | null
  created_at: string
  updated_at: string
}

type PlaceReviewsResponse = {
  reviews: PlaceReview[]
  average_rating: number | null
  review_count: number
  current_member_review: PlaceReview | null
  message?: string
}

type PlaceComment = {
  id: string
  place_id: string
  user_id: string
  member_display_name?: string | null
  member_username?: string | null
  member_avatar_url?: string | null
  parent_comment_id: string | null
  comment: string
  status: 'visible' | 'deleted'
  created_at: string
  updated_at: string
  deleted_at: string | null
  current_user_reported?: boolean
  replies: PlaceComment[]
  local_post_state?: 'pending' | 'failed'
  local_error_message?: string | null
}

type PlaceCommentsResponse = {
  comments: PlaceComment[]
  message?: string
}

type PlaceImageContributionResponse = {
  message?: string
  image?: {
    id: string
    imageUrl: string
    status: 'pending' | 'approved' | 'rejected'
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CONTRIBUTION_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']
const CONTRIBUTION_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

function isAcceptedContributionImage(file: File) {
  const normalizedType = file.type.trim().toLowerCase()

  if (CONTRIBUTION_IMAGE_TYPES.includes(normalizedType)) {
    return true
  }

  const normalizedName = file.name.trim().toLowerCase()
  return CONTRIBUTION_IMAGE_EXTENSIONS.some((extension) => normalizedName.endsWith(extension))
}

type IconName =
  | 'back'
  | 'photo'
  | 'share'
  | 'save'
  | 'directions'
  | 'location'
  | 'category'
  | 'budget'
  | 'clock'
  | 'hourglass'
  | 'home'
  | 'crowd'
  | 'rain'
  | 'eye'
  | 'fire'
  | 'utensils'
  | 'heart'
  | 'users'
  | 'book'
  | 'bus'
  | 'car'
  | 'globe'
  | 'warning'
  | 'sparkle'

function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  const iconMap: Record<IconName, AppIconName> = {
    back: 'back',
    photo: 'photo',
    share: 'share',
    save: 'favorites',
    directions: 'directions',
    location: 'place',
    category: 'categoryHeritage',
    budget: 'wallet',
    clock: 'history',
    hourglass: 'hourglass',
    home: 'home',
    crowd: 'users',
    rain: 'rain',
    eye: 'eye',
    fire: 'fire',
    utensils: 'categoryKainan',
    heart: 'favorites',
    users: 'users',
    book: 'book',
    bus: 'bus',
    car: 'car',
    globe: 'tourist',
    warning: 'warning',
    sparkle: 'askAi',
  }

  return <AppIcon name={iconMap[name]} className={className} strokeWidth={2} />
}

function getApiEndpoint(path: string) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
  return apiBaseUrl ? `${apiBaseUrl}${path}` : `/api${path}`
}

function parseJsonResponse<T>(text: string): T | null {
  if (!text.trim()) {
    return null
  }

  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

function cleanString(value?: string | null) {
  return value?.trim() || ''
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

function titleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function uniqueList(values: Array<string | undefined | null>) {
  const seen = new Set<string>()
  return values
    .map((value) => cleanString(value))
    .filter(Boolean)
    .filter((value) => {
      const normalized = value.toLowerCase()
      if (seen.has(normalized)) {
        return false
      }
      seen.add(normalized)
      return true
    })
}

function getInitials(label: string) {
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')

  return initials || 'GT'
}

function MemberAvatar({
  displayName,
  avatarUrl,
  compact = false,
  reply = false,
}: {
  displayName: string
  avatarUrl?: string | null
  compact?: boolean
  reply?: boolean
}) {
  const cleanAvatarUrl = cleanString(avatarUrl)
  const sizeClass = reply ? 'h-7 w-7 text-[10px]' : compact ? 'h-8 w-8 text-[11px]' : 'h-9 w-9 text-[12px]'

  return (
    <span className={`flex ${sizeClass} shrink-0 overflow-hidden rounded-full border border-[var(--line)] bg-[linear-gradient(180deg,#f8fbff,#e8f1ff)] font-black text-[var(--accent-deep)] shadow-[0_8px_16px_rgba(28,77,160,0.08)]`}>
      {cleanAvatarUrl ? (
        <img
          src={cleanAvatarUrl}
          alt={`${displayName} avatar`}
          className="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center">{getInitials(displayName)}</span>
      )}
    </span>
  )
}

function SectionHeading({ icon, title }: { icon: IconName; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-wash)] text-[var(--accent-deep)]">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <h2 className="text-[13px] font-black uppercase tracking-[0.08em] text-slate-700">{title}</h2>
    </div>
  )
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
}: {
  imageUrls?: string[]
  placeName: string
  currentIndex: number
  onPrevious?: () => void
  onNext?: () => void
  onSelect?: (index: number) => void
  showAddPhotoAction?: boolean
  onContribute?: () => void
}) {
  const swipeStartX = useRef<number | null>(null)
  const photos = uniqueList(imageUrls).slice(0, 3)
  const hasCarouselControls = photos.length > 1
  const safeIndex = photos.length > 0 ? Math.min(Math.max(currentIndex, 0), photos.length - 1) : 0
  const activePhoto = photos[safeIndex] ?? null
  const canGoPrevious = hasCarouselControls && safeIndex > 0
  const canGoNext = hasCarouselControls && safeIndex < photos.length - 1
  const totalPhotoSlots = 3
  const thumbSlots = Array.from({ length: totalPhotoSlots }, (_, index) => photos[index] ?? null)

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

  if (!activePhoto) {
    return (
      <div className="grid gap-2.5 sm:gap-3">
        <div className="-mx-4 sm:mx-0">
          <div className="overflow-hidden bg-slate-950 sm:rounded-[28px] sm:shadow-[0_24px_60px_rgba(15,23,42,0.16)]">
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-[linear-gradient(180deg,#eef5ff_0%,#f8fbff_100%)]">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-slate-950/18 via-slate-950/5 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-slate-950/18 via-slate-950/6 to-transparent" />

              <div className="absolute inset-x-4 top-4 flex items-start justify-end gap-3">
                {showAddPhotoAction ? (
                  <button
                    type="button"
                    onClick={onContribute}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-black/28 px-3.5 py-2 text-[12px] font-black text-white shadow-[0_14px_30px_rgba(15,23,42,0.24)] backdrop-blur-md transition hover:bg-black/36"
                  >
                    <ImagePlus className="h-4 w-4" strokeWidth={2.2} />
                    Add photo
                  </button>
                ) : null}
              </div>

              <div className="flex h-full items-center justify-center px-6 py-8 text-center">
                <div className="flex max-w-[320px] flex-col items-center gap-3 text-[var(--accent-deep)]">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/80 bg-white shadow-[0_16px_40px_rgba(37,99,235,0.12)]">
                    <Icon name="photo" className="h-7 w-7" />
                  </span>
                  <p className="text-[17px] font-black text-slate-950">No place photos yet</p>
                  <p className="text-[13px] font-semibold leading-5 text-slate-600">
                    Be the first to add a photo for this spot.
                  </p>
                </div>
              </div>

              <div className="absolute inset-x-0 bottom-0 overflow-x-auto px-4 pb-4 pt-8">
                <div className="flex min-w-max items-center gap-2.5">
                  {thumbSlots.map((_, index) => {
                    const shouldUseAddTile = showAddPhotoAction && index === 0

                    return (
                      <button
                        key={`empty-gallery-thumb-${index}`}
                        type="button"
                        onClick={shouldUseAddTile ? onContribute : undefined}
                        disabled={!shouldUseAddTile}
                        className={`flex h-16 w-16 items-center justify-center rounded-2xl border shadow-[0_12px_24px_rgba(15,23,42,0.18)] transition ${
                          shouldUseAddTile
                            ? 'border-dashed border-white/70 bg-black/28 text-white backdrop-blur-md hover:bg-black/36'
                            : 'cursor-default border-white/18 bg-black/16 text-white/40 backdrop-blur-sm'
                        }`}
                        aria-label={
                          shouldUseAddTile
                            ? `Add a photo for ${placeName}`
                            : `Empty photo slot ${index + 1} of ${placeName}`
                        }
                      >
                        <ImagePlus className="h-5 w-5" strokeWidth={2.2} />
                      </button>
                    )
                  })}
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
      <div className="-mx-4 sm:mx-0">
        <div className="overflow-hidden bg-slate-950 sm:rounded-[28px] sm:shadow-[0_24px_60px_rgba(15,23,42,0.16)]">
          <div className="relative aspect-[4/3] w-full overflow-hidden">
            <div
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              className="h-full w-full bg-neutral-100"
            >
              <img src={activePhoto} alt={placeName} className="h-full w-full object-cover transition duration-300" />
            </div>

            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-slate-950/55 via-slate-950/18 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-slate-950/82 via-slate-950/32 to-transparent" />

            <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-black/45 px-3 py-1 text-[12px] font-black text-white backdrop-blur-sm">
                  {safeIndex + 1} / {photos.length}
                </span>
              </div>
              {showAddPhotoAction ? (
                <button
                  type="button"
                  onClick={onContribute}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-black/28 px-3.5 py-2 text-[12px] font-black text-white shadow-[0_14px_30px_rgba(15,23,42,0.24)] backdrop-blur-md transition hover:bg-black/36"
                >
                  <ImagePlus className="h-4 w-4" strokeWidth={2.2} />
                  Add photo
                </button>
              ) : null}
            </div>

            <>
              <button
                type="button"
                onClick={onPrevious}
                disabled={!canGoPrevious}
                className={`absolute left-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border backdrop-blur-sm transition ${
                  canGoPrevious
                    ? 'border-white/70 bg-black/28 text-white shadow-[0_12px_26px_rgba(15,23,42,0.24)] hover:bg-black/38'
                    : 'cursor-not-allowed border-white/22 bg-black/14 text-white/45'
                }`}
                aria-label={`Show previous photo of ${placeName}`}
                aria-disabled={!canGoPrevious}
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={2.6} />
              </button>
              <button
                type="button"
                onClick={onNext}
                disabled={!canGoNext}
                className={`absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border backdrop-blur-sm transition ${
                  canGoNext
                    ? 'border-white/70 bg-black/28 text-white shadow-[0_12px_26px_rgba(15,23,42,0.24)] hover:bg-black/38'
                    : 'cursor-not-allowed border-white/22 bg-black/14 text-white/45'
                }`}
                aria-label={`Show next photo of ${placeName}`}
                aria-disabled={!canGoNext}
              >
                <ChevronRight className="h-5 w-5" strokeWidth={2.6} />
              </button>
            </>

            <div className="absolute inset-x-0 bottom-0 overflow-x-auto px-4 pb-4 pt-8">
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
                            ? 'border-white shadow-[0_14px_30px_rgba(15,23,42,0.28)] ring-2 ring-white/90'
                            : 'border-white/35 shadow-[0_12px_24px_rgba(15,23,42,0.22)]'
                        }`}
                        aria-label={`Show photo ${index + 1} of ${placeName}`}
                        aria-pressed={index === safeIndex}
                      >
                        <img src={photo} alt={placeName} className="h-16 w-16 object-cover" />
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
                      className={`flex h-16 w-16 items-center justify-center rounded-2xl border shadow-[0_12px_24px_rgba(15,23,42,0.18)] transition ${
                        shouldUseAddTile
                          ? 'border-dashed border-white/70 bg-black/28 text-white backdrop-blur-md hover:bg-black/36'
                          : 'cursor-default border-white/18 bg-black/16 text-white/40 backdrop-blur-sm'
                      }`}
                      aria-label={
                        shouldUseAddTile
                          ? `Add a photo for ${placeName}`
                          : `Empty photo slot ${index + 1} of ${placeName}`
                      }
                    >
                      <ImagePlus className="h-5 w-5" strokeWidth={2.2} />
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <PlaceImageNotice />
    </div>
  )
}

function MetaLine({ icon, children }: { icon: IconName; children: string }) {
  return (
    <p className="flex items-start gap-2.5 text-[14px] font-semibold leading-5 text-slate-700">
      <Icon name={icon} className="mt-0.5 h-4.5 w-4.5 shrink-0 text-slate-500" />
      <span>{children}</span>
    </p>
  )
}

function ActionButton({
  icon,
  children,
  disabled,
  active = false,
  onClick,
}: {
  icon: IconName
  children: string
  disabled?: boolean
  active?: boolean
  onClick: () => void
}) {
  const buttonClassName = active
    ? 'inline-flex w-full min-h-10 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 text-[12px] font-extrabold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400'
    : 'inline-flex w-full min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 text-[12px] font-extrabold text-slate-700 transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)] hover:text-[var(--accent-deep)] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400'
  const iconClassName = disabled
    ? 'text-slate-400'
    : active
      ? 'fill-current text-rose-600'
      : 'text-[var(--accent-deep)]'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={buttonClassName}
    >
      <Icon name={icon} className={`h-4 w-4 ${iconClassName}`} />
      {children}
    </button>
  )
}

function GoodForList({ values }: { values: string[] }) {
  const items = (values.length > 0 ? values : ['Coffee hangouts', 'Food trips', 'Casual dates', 'Barkada catch-ups', 'Study breaks']).slice(0, 5)

  return (
    <ul className="grid gap-2 text-[14px] font-semibold leading-5 text-slate-700">
      {items.map((item, index) => (
        <li key={item} className="flex items-center gap-3">
          <Icon name={pickGoodForIcon(item, index)} className="h-4.5 w-4.5 shrink-0 text-slate-500" />
          <span>{titleCase(item)}</span>
        </li>
      ))}
    </ul>
  )
}

function pickGoodForIcon(value: string, index: number): IconName {
  const normalized = value.toLowerCase()

  if (normalized.includes('coffee') || normalized.includes('cafe')) return 'category'
  if (normalized.includes('food') || normalized.includes('meal')) return 'utensils'
  if (normalized.includes('date')) return 'heart'
  if (normalized.includes('barkada') || normalized.includes('group') || normalized.includes('catch')) return 'users'
  if (normalized.includes('study')) return 'book'

  return (['category', 'utensils', 'heart', 'users', 'book'] as const)[index % 5]
}

function PlanStat({ icon, title, value }: { icon: IconName; title: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-xl bg-slate-50 px-3 py-3">
      <Icon name={icon} className="mt-0.5 h-4.5 w-4.5 shrink-0 text-[var(--accent-deep)]" />
      <div className="min-w-0">
        <p className="text-[12px] font-black leading-tight text-slate-900">{title}</p>
        <p className="mt-1 text-[12px] font-semibold leading-4 text-slate-600">{value}</p>
      </div>
    </div>
  )
}

function TransportColumn({
  icon,
  title,
  children,
}: {
  icon: IconName
  title: string
  children: ReactNode
}) {
  return (
    <div className="border-b border-[var(--line)] pb-3 last:border-b-0 last:pb-0">
      <div className="flex items-center gap-2.5">
        <Icon name={icon} className="h-4.5 w-4.5 shrink-0 text-[var(--accent-deep)]" />
        <h3 className="text-[14px] font-black text-slate-900">{title}</h3>
      </div>
      <div className="mt-2 text-[13px] font-semibold leading-5 text-slate-600">{children}</div>
    </div>
  )
}

function DetailSection({ children }: { children: ReactNode }) {
  return <section className="border-t border-[var(--line)] py-5 first:border-t-0">{children}</section>
}

const filledStar = String.fromCharCode(9733)
const commentReportReasons: Array<{ value: CommentReportReason; label: string }> = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Hate or abusive content' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'false_info', label: 'False or misleading' },
  { value: 'personal_info', label: 'Personal information shared' },
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

function findCommentById(comments: PlaceComment[], commentId: string): PlaceComment | null {
  for (const comment of comments) {
    if (comment.id === commentId) {
      return comment
    }

    const replyMatch = findCommentById(comment.replies, commentId)

    if (replyMatch) {
      return replyMatch
    }
  }

  return null
}

function PlaceDetailView({ place, onBack, areaBreadcrumb = null, cameFromSearch = false, returnLabel = null }: PlaceDetailViewProps) {
  const [isSavePromptOpen, setIsSavePromptOpen] = useState(false)
  const [isAddToPlanOpen, setIsAddToPlanOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [shareError, setShareError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [activePhotoIndex, setActivePhotoIndex] = useState(0)
  const [isContributionOpen, setIsContributionOpen] = useState(false)
  const [contributionFile, setContributionFile] = useState<File | null>(null)
  const [contributionSourceUrl, setContributionSourceUrl] = useState('')
  const [contributionNote, setContributionNote] = useState('')
  const [isContributionSubmitting, setIsContributionSubmitting] = useState(false)
  const [contributionError, setContributionError] = useState('')
  const [averageRating, setAverageRating] = useState<number | null>(place.rating ?? null)
  const [reviewCount, setReviewCount] = useState(place.ratingCount ?? 0)
  const [currentUserReview, setCurrentUserReview] = useState<PlaceReview | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserAvatarUrl, setCurrentUserAvatarUrl] = useState<string | null>(null)
  const [currentUserAvatarFallbackName, setCurrentUserAvatarFallbackName] = useState('GalaTayo member')
  const [reviewRating, setReviewRating] = useState(0)
  const [isReviewSubmitting, setIsReviewSubmitting] = useState(false)
  const [isReviewDeleting, setIsReviewDeleting] = useState(false)
  const [isReviewSignInStarting, setIsReviewSignInStarting] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [isReviewEditing, setIsReviewEditing] = useState(false)
  const [comments, setComments] = useState<PlaceComment[]>([])
  const [isCommentsLoading, setIsCommentsLoading] = useState(true)
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
  const commentMenuRef = useRef<HTMLDivElement | null>(null)
  const { isPlaceSaved, saveFavorite, removeFavorite } = useSavedFavorites()
  const { showSystemMessage } = useSystemMessage()

  const galleryPhotos = uniqueList([place.imageUrl, ...(place.curatedImageUrls ?? [])]).slice(0, 3)
  const approvedImageCount = galleryPhotos.length
  const budgetLabel = cleanString(place.budget_notes) || cleanString(place.entranceFee) || 'Not available'
  const addressLabel =
    cleanString(place.address) ||
    [cleanString(place.localArea || place.area), cleanString(place.city)].filter(Boolean).join(', ') ||
    cleanString(place.area) ||
    cleanString(place.city) ||
    'Not available'
  const categoryLabel = cleanString(place.category) || 'Place'
  const locationLabel = cleanString(place.localArea) || cleanString(place.area) || cleanString(place.city) || 'Metro Manila'
  const goodFor = uniqueList(place.good_for ?? [])
  const notIdealFor = uniqueList(place.not_ideal_for ?? [])
  const directionsUrl = getDirectionsUrl(place)
  const websiteUrl = cleanString(place.website_url) || cleanString(place.website)
  const normalizedNameSlug = normalizePlaceSlug(place.name)
  const placeId = cleanString(place.id)
  const placeSlug = cleanString(place.slug)
  const isCommunityPlaceReady = UUID_PATTERN.test(placeId)
  const canContributePhoto = Boolean(currentUserId && isCommunityPlaceReady && approvedImageCount < 3)
  const areaLink = areaBreadcrumb ? `/places/${encodeURIComponent(areaBreadcrumb.areaSlug)}` : null
  const canonicalPlaceLink = areaBreadcrumb ? `/places/${encodeURIComponent(areaBreadcrumb.areaSlug)}/${encodeURIComponent(placeSlug)}` : null
  const quickAnswerItems = [
    {
      question: `What is ${place.name} best for?`,
      answer: goodFor.length > 0 ? `${place.name} is best for ${goodFor.map(titleCase).join(', ')}.` : `${place.name} works best for a casual Metro Manila gala.`,
    },
    {
      question: `Where is ${place.name}?`,
      answer: `${place.name} is in ${addressLabel}.`,
    },
    {
      question: `What should I know before going to ${place.name}?`,
      answer: cleanString(place.best_time_to_visit) || cleanString(place.nearby_context) || cleanString(place.reason) || `Check the place details and route before heading to ${place.name}.`,
    },
  ]

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
  const headlineRating = averageRating ?? place.rating ?? null
  const headlineReviewCount = reviewCount > 0 ? reviewCount : place.ratingCount ?? 0

  const syncCurrentUserProfile = useCallback(async (session?: Awaited<ReturnType<typeof getSupabaseSession>> | null) => {
    const nextSession = session ?? (await getSupabaseSession())
    const nextUser = nextSession?.user ?? null
    const metadata = (nextUser?.user_metadata ?? {}) as Record<string, unknown>
    const metadataAvatarUrl = getAuthMetadataString(metadata, ['avatar_url', 'picture'])
    const metadataDisplayName =
      getAuthMetadataString(metadata, ['display_name', 'full_name', 'name', 'preferred_username']) ||
      cleanString(nextUser?.email?.split('@')[0]) ||
      'GalaTayo member'

    setCurrentUserId(nextUser?.id ?? null)
    setCurrentUserAvatarFallbackName(metadataDisplayName)
    setCurrentUserAvatarUrl(metadataAvatarUrl || null)

    if (!nextUser) {
      return
    }

    try {
      const result = await getMyProfile(nextSession)
      const profile = result.profile

      setCurrentUserAvatarUrl(cleanString(profile?.avatar_url) || cleanString(profile?.provider_avatar_url) || metadataAvatarUrl || null)
      setCurrentUserAvatarFallbackName(cleanString(profile?.username) || metadataDisplayName)
    } catch {
      setCurrentUserAvatarUrl(metadataAvatarUrl || null)
      setCurrentUserAvatarFallbackName(metadataDisplayName)
    }
  }, [])

  useEffect(() => {
    setActivePhotoIndex(0)
  }, [place.id])

  useEffect(() => {
    setAverageRating(place.rating ?? null)
    setReviewCount(place.ratingCount ?? 0)
  }, [place.id, place.rating, place.ratingCount])

  useEffect(() => {
    if (activePhotoIndex >= galleryPhotos.length) {
      setActivePhotoIndex(0)
    }
  }, [activePhotoIndex, galleryPhotos.length])

  const showPreviousPhoto = () => {
    if (galleryPhotos.length < 2 || activePhotoIndex <= 0) {
      return
    }

    setActivePhotoIndex((currentIndex) => currentIndex - 1)
  }

  const showNextPhoto = () => {
    if (galleryPhotos.length < 2 || activePhotoIndex >= galleryPhotos.length - 1) {
      return
    }

    setActivePhotoIndex((currentIndex) => currentIndex + 1)
  }

  const fetchPlaceReviews = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setReviewError('')

        const session = await getSupabaseSession()
        const token = await getSupabaseAccessToken(session)
        await syncCurrentUserProfile(session)

        if (!isCommunityPlaceReady) {
          setAverageRating(place.rating ?? null)
          setReviewCount(place.ratingCount ?? 0)
          setCurrentUserReview(null)
          setReviewRating(0)
          return
        }

        const response = await fetch(getApiEndpoint(`/places/${encodeURIComponent(placeId)}/reviews`), {
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
        setCurrentUserReview(nextCurrentUserReview)
        setReviewRating(nextCurrentUserReview?.rating ?? 0)
        setIsReviewEditing(false)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setReviewError(error instanceof Error ? error.message : 'Unable to load reviews.')
        }
      }
    },
    [isCommunityPlaceReady, place.rating, place.ratingCount, placeId],
  )

  const fetchPlaceComments = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setIsCommentsLoading(true)
        setCommentError('')

        if (!isCommunityPlaceReady) {
          setComments([])
          return
        }

        const session = await getSupabaseSession()
        const token = await getSupabaseAccessToken(session)

        const response = await fetch(getApiEndpoint(`/places/${encodeURIComponent(placeId)}/comments`), {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          signal,
        })
        const responseText = await response.text()
        const result = parseJsonResponse<PlaceCommentsResponse>(responseText)

        if (!response.ok) {
          throw new Error(result?.message || 'Unable to load comments.')
        }

        setComments(result?.comments ?? [])
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
    [isCommunityPlaceReady, placeId],
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

        const response = await fetch(getApiEndpoint('/history/place-view'), {
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
        setIsSavePromptOpen(true)
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
      void handleReviewSignIn()
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

    if (!isAcceptedContributionImage(contributionFile) || contributionFile.size > 5 * 1024 * 1024) {
      setContributionError('Use a JPEG, PNG, or WebP image up to 5MB.')
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

      const body = new FormData()
      body.append('image', contributionFile)

      if (contributionSourceUrl.trim()) {
        body.append('source_url', contributionSourceUrl.trim())
      }

      if (contributionNote.trim()) {
        body.append('contributor_note', contributionNote.trim())
      }

      const response = await fetch(getApiEndpoint(`/places/${encodeURIComponent(placeId)}/images/contributions`), {
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

      const response = await fetch(getApiEndpoint(`/places/${encodeURIComponent(placeId)}/reviews`), {
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

      const response = await fetch(getApiEndpoint(`/places/${encodeURIComponent(placeId)}/reviews`), {
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

      const response = await fetch(getApiEndpoint(`/places/${encodeURIComponent(placeId)}/comments`), {
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
      const response = await fetch(getApiEndpoint(`/places/${encodeURIComponent(placeId)}/comments`), {
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
      const response = await fetch(getApiEndpoint(`/places/${encodeURIComponent(placeId)}/comments/${encodeURIComponent(commentId)}/replies`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body }),
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
      const response = await fetch(getApiEndpoint(`/places/${encodeURIComponent(placeId)}/comments/${encodeURIComponent(commentId)}`), {
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
      const response = await fetch(getApiEndpoint(`/places/${encodeURIComponent(placeId)}/comments/${encodeURIComponent(commentId)}`), {
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

  const handleReviewSignIn = async () => {
    try {
      setIsReviewSignInStarting(true)
      setReviewError('')

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      })

      if (error) {
        throw error
      }
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : 'Login failed. Please try again.')
      setIsReviewSignInStarting(false)
    }
  }

  const handleCommentSignIn = async () => {
    try {
      setIsReviewSignInStarting(true)
      setCommentError('')

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      })

      if (error) {
        throw error
      }
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'Login failed. Please try again.')
      setIsReviewSignInStarting(false)
    }
  }

  const handleOpenPlaceConcern = () => {
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
    } catch (error) {
      setPlaceConcernError(error instanceof Error ? error.message : 'Could not submit place report. Please try again.')
    } finally {
      setIsPlaceConcernSubmitting(false)
    }
  }

  const openDirections = () => openDirectionsUrl(directionsUrl)
  const rainFit = cleanString(place.weather_fit)
  const quickTake = cleanString(place.description) || cleanString(place.reason) || 'No quick take available yet.'
  const vibeText =
    cleanString(place.place_history) ||
    cleanString(place.decision_reason) ||
    `A local ${titleCase(categoryLabel)} spot around ${locationLabel}, good for a calm and easy plan.`
  const aroundHere =
    cleanString(place.nearby_context) ||
    `You're around ${locationLabel}, with nearby local food spots and transport options.`
  const commuteText =
    cleanString(place.commute_access) ||
    'Reachable by local routes, short walks, or ride-hailing depending on where you are coming from.'
  const parkingText = cleanString(place.parking_info) || 'Parking depends on time and crowd, so plan ahead if bringing a car.'
  const planStats = [
    { icon: 'clock' as const, title: 'Best time', value: cleanString(place.best_time_to_visit) || 'Not available' },
    { icon: 'hourglass' as const, title: 'Stay', value: cleanString(place.visit_duration) || 'Not available' },
    { icon: 'home' as const, title: 'Setup', value: cleanString(place.indoor_outdoor) || 'Not available' },
    { icon: 'rain' as const, title: 'Rain-friendly', value: rainFit ? (/rain|indoor|covered/i.test(rainFit) ? 'Yes' : 'Check first') : 'Check first' },
    { icon: 'crowd' as const, title: 'Crowd', value: cleanString(place.crowd_level) || 'Not available' },
  ]
  const visibleCommentCount = countThreadComments(comments)
  const reportingComment = reportingCommentId ? findCommentById(comments, reportingCommentId) : null

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
              className={`w-full min-w-0 rounded-[16px] border px-3 py-2.5 ${
                isFailed
                  ? 'border-red-200 bg-red-50/70'
                  : isDeleted
                    ? 'border-slate-200/70 bg-slate-100/90'
                    : 'border-slate-200/80 bg-slate-50/80'
              }`}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {canOpenProfile ? (
                      <button
                        type="button"
                        onClick={handleOpenCommentProfile}
                        className="block min-w-0 truncate text-[14px] font-black text-slate-950 transition hover:opacity-80"
                      >
                        {displayName}
                      </button>
                    ) : (
                      <span className="block min-w-0 truncate text-[14px] font-black text-slate-950">{displayName}</span>
                    )}
                    {isOwner ? (
                      <span className="inline-flex items-center rounded-full bg-[var(--accent-wash)] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-[var(--accent-deep)]">
                        You
                      </span>
                    ) : null}
                    <span className="text-[11px] font-semibold text-slate-500">
                      {formatReviewDate(comment.updated_at || comment.created_at)}
                      {isEdited ? <span className="ml-1 text-slate-400">edited</span> : null}
                    </span>
                    {isPending ? (
                      <span className="inline-flex items-center rounded-full bg-[var(--accent-wash)] px-2 py-0.5 text-[10px] font-black text-[var(--accent-deep)]">
                        Posting...
                      </span>
                    ) : null}
                  </div>
                </div>
                {!isDeleted ? (
                  <div className="relative shrink-0" ref={isMenuOpen ? commentMenuRef : null}>
                    <button
                      type="button"
                      aria-label="Open comment actions"
                      aria-haspopup="menu"
                      aria-expanded={isMenuOpen}
                      onClick={() => setOpenCommentMenuId((currentId) => (currentId === comment.id ? null : comment.id))}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-600"
                    >
                      <MoreHorizontal className="h-4 w-4" strokeWidth={2.2} />
                    </button>

                    {isMenuOpen ? (
                      <div
                        role="menu"
                        className="absolute right-0 top-8 z-20 min-w-[11rem] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-[0_12px_28px_rgba(15,23,42,0.12)]"
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
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-bold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
                            >
                              <Pencil className="h-3.5 w-3.5" strokeWidth={2.2} />
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
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
                              {isMutating ? 'Deleting...' : 'Delete comment'}
                            </button>
                          </>
                        ) : (
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
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-bold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950 disabled:cursor-not-allowed disabled:text-slate-400"
                            >
                              <Flag className="h-3.5 w-3.5" strokeWidth={2.2} />
                              {isReportedByCurrentUser ? 'Already reported' : isReportSubmitting && reportingCommentId === comment.id ? 'Reporting...' : 'Report comment'}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => handleOpenUserReport(comment.user_id, comment.member_username, displayName)}
                              disabled={reportedUserIds.has(comment.user_id)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-bold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950 disabled:cursor-not-allowed disabled:text-slate-400"
                            >
                              <AppIcon name="profile" className="h-3.5 w-3.5" />
                              {reportedUserIds.has(comment.user_id) ? 'Already reported user' : 'Report user'}
                            </button>
                          </>
                        )}
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
                    className="w-full resize-none rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-[14px] font-semibold text-slate-800 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(47,116,232,0.14)] disabled:cursor-not-allowed disabled:opacity-70"
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
                <p className={`mt-1.5 whitespace-pre-line break-words text-[14px] font-semibold leading-[1.45] ${isDeleted ? 'italic text-slate-400' : 'text-slate-700'}`}>{comment.comment}</p>
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
                    <Reply className="h-3.5 w-3.5" strokeWidth={2.2} />
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
                      <Pencil className="h-3.5 w-3.5" strokeWidth={2.2} />
                      Edit
                    </button>
                  </>
                ) : null}
                {!isDeleted && !isOwner ? (
                  isReportedByCurrentUser ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-slate-500">
                      <Flag className="h-3.5 w-3.5" strokeWidth={2.2} />
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
                      <Flag className="h-3.5 w-3.5" strokeWidth={2.2} />
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
          <div className="ml-8 mt-2.5 rounded-[16px] border border-slate-200/80 bg-slate-50 px-3 py-3 sm:ml-9">
            <textarea
              value={replyBody}
              onChange={(event) => setReplyBody(event.target.value)}
              rows={2}
              disabled={isMutating}
              placeholder="Add a reply..."
              className="w-full resize-none rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-[14px] font-semibold text-slate-800 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(47,116,232,0.14)] disabled:cursor-not-allowed disabled:opacity-70"
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
                className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-[12px] font-extrabold text-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
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

  const communitySection = !isCommunityPlaceReady ? (
    <DetailSection>
      <SectionHeading icon="sparkle" title="Community" />
      <div className="mt-4">
        <UnifiedLoadingState
          variant="inline"
          title="Preparing community details..."
          message="We are loading reviews, comments, and community activity."
        />
      </div>
    </DetailSection>
  ) : (
    <DetailSection>
      <SectionHeading icon="sparkle" title="Community" />
      <div className="mt-5">
        <div>
          <h3 className="text-[20px] font-black text-slate-950">Rate this place</h3>
          <p className="mt-1 text-[14px] font-semibold text-slate-600">
            {reviewCount > 0 && averageRating !== null
              ? `Rated ${averageRating.toFixed(1)} by ${reviewCount} ${reviewCount === 1 ? 'person' : 'people'}.`
              : 'No ratings yet. Be the first to help others decide.'}
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
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-4 text-[13px] font-extrabold text-white shadow-[0_12px_24px_rgba(47,116,232,0.2)] transition hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none disabled:opacity-100"
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
              <p className="text-[13px] font-semibold text-slate-500">Sign in as a member to leave a rating.</p>
              <button
                type="button"
                onClick={() => void handleReviewSignIn()}
                disabled={isReviewSignInStarting}
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-2xl border border-[var(--accent)] bg-white px-4 text-[13px] font-extrabold text-[var(--accent-deep)] transition hover:bg-[var(--accent)] hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isReviewSignInStarting ? 'Opening login...' : 'Login to rate'}
              </button>
              {reviewError ? <p className="mt-3 text-[13px] font-bold text-red-600">{reviewError}</p> : null}
            </div>
          )}
        </div>

        <div className="mt-5 border-t border-[var(--line)] pt-5">
          <div>
            <h3 className="text-[18px] font-black text-slate-950">Add your comment</h3>

            {currentUserId ? (
              <div className="mt-3.5 flex items-start gap-3">
                <MemberAvatar displayName={currentUserAvatarFallbackName} avatarUrl={currentUserAvatarUrl} compact />
                <div className="min-w-0 flex-1">
                  <div className="rounded-[14px] border border-[var(--line)] bg-white px-3 py-2.5 transition focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[rgba(47,116,232,0.14)]">
                    <textarea
                      value={commentBody}
                      onChange={(event) => setCommentBody(event.target.value)}
                      onFocus={() => setIsCommentComposerFocused(true)}
                      onBlur={() => setIsCommentComposerFocused(false)}
                      rows={2}
                      disabled={isCommentSubmitting}
                      placeholder="Write a quick comment..."
                      className={`w-full resize-none border-0 bg-transparent px-0 py-0 text-[14px] font-semibold text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-70 ${
                        isCommentComposerFocused || commentBody.trim() ? 'h-[80px]' : 'h-[48px]'
                      }`}
                    />
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void handleSubmitComment()}
                        disabled={isCommentSubmitting || !commentBody.trim()}
                        className="rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-[12px] font-extrabold text-white disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500 disabled:opacity-100"
                      >
                        {isCommentSubmitting ? 'Posting...' : 'Comment'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3.5">
                <p className="text-[13px] font-semibold text-slate-500">Sign in as a member to comment.</p>
                <button
                  type="button"
                  onClick={() => void handleCommentSignIn()}
                  disabled={isReviewSignInStarting}
                  className="mt-3 inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--accent)] bg-white px-4 text-[13px] font-extrabold text-[var(--accent-deep)] transition hover:bg-[var(--accent)] hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isReviewSignInStarting ? 'Opening login...' : 'Login'}
                </button>
              </div>
            )}

            <div className="mt-2 min-h-5">
              {commentError ? <p className="text-[13px] font-bold text-red-600">{commentError}</p> : null}
            </div>
          </div>

          <div className="mt-5 rounded-[22px] border border-slate-200/80 bg-slate-50/55 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/80 pb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-[var(--accent-wash)] text-[var(--accent-deep)]">
                    <MessageCircle className="h-4 w-4" strokeWidth={2.2} />
                  </span>
                  <div>
                    <h3 className="text-[18px] font-black text-slate-950">Comments</h3>
                    <p className="mt-0.5 text-[13px] font-semibold text-slate-500">
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

            {isCommentsLoading ? (
              <div className="mt-4">
                <UnifiedLoadingState
                  variant="inline"
                  title="Preparing comments..."
                  message="We are loading the conversation for this place."
                />
              </div>
            ) : visibleCommentCount === 0 ? (
              <div className="mt-5 flex flex-col items-center rounded-[20px] border border-dashed border-[var(--line-strong)] bg-slate-50 px-6 py-8 text-center">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-wash)] text-[var(--accent-deep)]">
                  <MessageCircle className="h-5 w-5" strokeWidth={2.2} />
                </span>
                <p className="mt-3 text-[16px] font-black text-slate-900">No comments yet</p>
                <p className="mt-1 max-w-[26rem] text-[13px] font-semibold leading-5 text-slate-500">
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
    <section className="min-h-screen bg-white px-0 py-0 text-[var(--text)] sm:bg-[var(--bg)] sm:py-0">
      <AppHeader />

      <main className="gala-page-background min-h-screen w-full px-4 pb-8 pt-0 sm:px-6 md:px-8 lg:px-10">
        <div className="mx-auto w-full max-w-[980px]">
          {cameFromSearch ? (
            <>
              <div className="mb-3 pt-5">
                <button
                  type="button"
                  onClick={onBack}
                  className="group inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-[var(--accent)]"
                >
                  <ArrowLeft className="h-3.5 w-3.5 transition group-hover:-translate-x-0.5" strokeWidth={2} />
                  Back to results for <span className="font-semibold text-slate-700 group-hover:text-[var(--accent)]">&ldquo;{returnLabel || 'search'}&rdquo;</span>
                </button>
              </div>
              <Breadcrumb
                className="mb-4"
                items={[
                  { label: 'Home', href: '/', icon: <House className="h-3.5 w-3.5" /> },
                  { label: 'Search', href: '/search', icon: <Search className="h-3.5 w-3.5" /> },
                  { label: place.name, icon: <MapPin className="h-3.5 w-3.5" /> },
                ]}
              />
            </>
          ) : (
            <Breadcrumb
              className="mb-4 pt-5"
              items={[
                { label: 'Home', href: '/', icon: <House className="h-3.5 w-3.5" /> },
                { label: 'Places', href: '/places', icon: <MapPin className="h-3.5 w-3.5" /> },
                ...(areaBreadcrumb
                  ? [{ label: areaBreadcrumb.areaName, href: areaLink!, icon: <MapPin className="h-3.5 w-3.5" /> }]
                  : []),
                { label: place.name, icon: <MapPin className="h-3.5 w-3.5" /> },
              ]}
            />
          )}

          <PlacePhoto
            imageUrls={galleryPhotos}
            placeName={place.name}
            currentIndex={activePhotoIndex}
            onPrevious={showPreviousPhoto}
            onNext={showNextPhoto}
            onSelect={setActivePhotoIndex}
            showAddPhotoAction={isCommunityPlaceReady && approvedImageCount < 3}
            onContribute={handleOpenContribution}
          />

          <section className="py-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <h1 className="min-w-0 text-[26px] font-black leading-tight text-slate-950 sm:text-[32px]">{place.name}</h1>
                {headlineRating !== null ? (
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] font-semibold text-slate-600">
                    <span className="text-[15px] font-black text-slate-950">{headlineRating.toFixed(1)}</span>
                    <StarsDisplay rating={Math.round(headlineRating)} compact />
                    {headlineReviewCount > 0 ? (
                      <span className="text-slate-500">({formatRatingCount(headlineReviewCount)})</span>
                    ) : (
                      <span className="text-slate-500">Rating available</span>
                    )}
                  </div>
                ) : null}
                <div className="mt-3 grid gap-2">
                  <MetaLine icon="category">{categoryLabel}</MetaLine>
                  <MetaLine icon="location">{locationLabel}</MetaLine>
                  <MetaLine icon="budget">{budgetLabel}</MetaLine>
                </div>
              </div>

              <div className="grid w-full shrink-0 gap-2 md:w-[300px]">
                <div className="grid grid-cols-2 gap-2">
                  <ActionButton icon="save" onClick={handleSavePlace} disabled={isSaving} active={isSaved}>
                    {isSaving ? 'Saving' : 'Favorite'}
                  </ActionButton>
                  <ActionButton icon="share" onClick={handleSharePlace}>
                    Share
                  </ActionButton>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <ActionButton icon="book" onClick={() => setIsAddToPlanOpen(true)}>
                    Add to Plan
                  </ActionButton>
                  <ActionButton icon="directions" onClick={openDirections} disabled={!directionsUrl}>
                    Directions
                  </ActionButton>
                </div>
              </div>
            </div>

            <div className="mt-2 flex items-center gap-1.5 text-slate-500">
              <Icon name="warning" className="h-3.5 w-3.5 shrink-0" />
              <span className="text-[12px] font-medium leading-5">Something wrong with this place?</span>
              <button
                type="button"
                onClick={handleOpenPlaceConcern}
                className="text-[12px] font-bold leading-5 text-red-600 underline transition hover:text-red-700"
              >
                Report a concern
              </button>
            </div>

            <div className="mt-1">
              {shareError ? <p className="text-[12px] font-bold text-red-600">{shareError}</p> : null}
              {saveError ? <p className="text-[12px] font-bold text-red-600">{saveError}</p> : null}
              {contributionError && !isContributionOpen ? <p className="text-[12px] font-bold text-red-600">{contributionError}</p> : null}
            </div>
          </section>

          <DetailSection>
            <div className="grid gap-4 md:grid-cols-[1fr_340px] md:items-start">
              <div>
                <SectionHeading icon="location" title="Location" />
                <p className="mt-3 whitespace-pre-line text-[14px] font-semibold leading-6 text-slate-700">{addressLabel}</p>
              </div>
              <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-slate-50">
                <MapView
                  places={[place]}
                  selectedPlaceId={place.id}
                  center={[place.coordinates.lat, place.coordinates.lng]}
                  zoom={16}
                  autoFitToPlaces={false}
                  className="!h-[176px] !rounded-none !border-0 md:!h-[190px]"
                />
              </div>
            </div>
          </DetailSection>

          <DetailSection>
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <SectionHeading icon="eye" title="Quick Take" />
                <p className="mt-3 text-[14px] font-semibold leading-6 text-slate-700">{quickTake}</p>
              </div>
              <div>
                <SectionHeading icon="fire" title="Best For" />
                <div className="mt-3">
                  <GoodForList values={goodFor} />
                </div>
              </div>
            </div>
          </DetailSection>

          <DetailSection>
            <SectionHeading icon="sparkle" title="Game Plan" />
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {planStats.map((stat) => (
                <PlanStat key={stat.title} icon={stat.icon} title={stat.title} value={stat.value} />
              ))}
            </div>
          </DetailSection>

          <DetailSection>
            <SectionHeading icon="bus" title="How To Get There" />
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <TransportColumn icon="bus" title="Commute">
                <p>{commuteText}</p>
              </TransportColumn>
              <TransportColumn icon="car" title="Parking">
                <p>{parkingText}</p>
              </TransportColumn>
              <TransportColumn icon="globe" title="Website">
                {websiteUrl ? (
                  <a href={websiteUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    Visit official page
                  </a>
                ) : (
                  <p>Official page not available</p>
                )}
              </TransportColumn>
            </div>
          </DetailSection>

          <DetailSection>
            <SectionHeading icon="warning" title="Before You Go" />
            <div className="mt-3 border-l-2 border-amber-200 pl-4">
              <p className="text-[13px] font-black text-slate-700">Not ideal for</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] font-semibold leading-5 text-slate-600">
                {(notIdealFor.length > 0 ? notIdealFor : ['Whole-day plans', 'Out-of-town plans', 'Plans that need a totally different activity']).map((item) => (
                  <li key={item}>{titleCase(item)}</li>
                ))}
              </ul>
            </div>
          </DetailSection>

          <DetailSection>
            <SectionHeading icon="location" title="Around Here" />
            <p className="mt-3 text-[14px] font-semibold leading-6 text-slate-700">{aroundHere}</p>
          </DetailSection>

          <DetailSection>
            <SectionHeading icon="sparkle" title="The Vibe" />
            <p className="mt-3 text-[14px] font-semibold leading-6 text-slate-700">{vibeText}</p>
          </DetailSection>

          <DetailSection>
            <SectionHeading icon="book" title="Quick Answers" />
            <div className="mt-4 space-y-4">
              {quickAnswerItems.map((item) => (
                <div key={item.question}>
                  <h3 className="text-[15px] font-black text-slate-900">{item.question}</h3>
                  <p className="mt-1 text-[14px] font-semibold leading-6 text-slate-700">{item.answer}</p>
                </div>
              ))}
            </div>
            {canonicalPlaceLink && areaLink && areaBreadcrumb ? (
              <p className="mt-4 text-[13px] font-semibold leading-6 text-slate-600">
                Explore more from{' '}
                <InternalLink href={areaLink} className="text-[var(--accent)] underline underline-offset-2">
                  {areaBreadcrumb.areaName}
                </InternalLink>{' '}
                or browse the full{' '}
                <InternalLink href="/places" className="text-[var(--accent)] underline underline-offset-2">
                  places hub
                </InternalLink>.
              </p>
            ) : null}
          </DetailSection>

          {communitySection}
        </div>
      </main>

      <GuestLimitModal isOpen={isSavePromptOpen} onClose={() => setIsSavePromptOpen(false)} mode="savePlace" />
      <AddToGalaPlanModal
        isOpen={isAddToPlanOpen}
        placeId={place.id}
        placeName={place.name}
        onClose={() => setIsAddToPlanOpen(false)}
      />

      {reportingCommentId ? (
        <div
          className="fixed inset-0 z-[9998] flex items-end justify-center bg-slate-950/45 px-4 pb-4 sm:items-center sm:pb-0"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-comment-title"
          onClick={closeReportCommentModal}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.25)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="report-comment-title" className="text-[18px] font-black text-slate-950">
              Report comment
            </h3>
            <p className="mt-1 text-[14px] font-semibold text-slate-700">Why are you reporting this comment?</p>
            {reportingComment ? (
              <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-[13px] font-semibold leading-5 text-slate-500">
                "{reportingComment.comment.slice(0, 140)}{reportingComment.comment.length > 140 ? '…' : ''}"
              </p>
            ) : null}

            <div className="mt-4 grid gap-2">
              {commentReportReasons.map((reason) => (
                <button
                  key={reason.value}
                  type="button"
                  onClick={() => {
                    setReportReason(reason.value)
                    setReportError('')
                  }}
                  disabled={isReportSubmitting}
                  className={`min-h-11 rounded-xl border px-3 text-left text-[14px] font-extrabold transition disabled:cursor-not-allowed disabled:opacity-70 ${
                    reportReason === reason.value
                      ? 'border-[var(--accent)] bg-[var(--accent-wash)] text-[var(--accent-deep)]'
                      : 'border-[var(--line)] bg-white text-slate-800 hover:border-[var(--accent)]'
                  }`}
                  aria-pressed={reportReason === reason.value}
                >
                  {reason.label}
                </button>
              ))}
            </div>

            <label className="mt-4 block">
              <span className="flex items-center gap-2 text-[13px] font-black text-slate-800">
                Add more details
                <span className="optional-label">Optional</span>
              </span>
              <textarea
                value={reportDetails}
                onChange={(event) => setReportDetails(event.target.value.slice(0, 500))}
                disabled={isReportSubmitting}
                maxLength={500}
                rows={4}
                placeholder="Add any context that helps us review this."
                className="mt-2 w-full resize-none rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-[14px] font-semibold leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-wash)] disabled:cursor-not-allowed disabled:opacity-70"
              />
              <span className="mt-1 block text-right text-[12px] font-bold text-slate-500">{reportDetails.length}/500</span>
            </label>

            <div className="mt-3 min-h-5">
              {reportError ? <p className="text-[13px] font-bold text-red-600">{reportError}</p> : null}
            </div>

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeReportCommentModal}
                disabled={isReportSubmitting}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--line)] bg-white px-4 text-[14px] font-extrabold text-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleReportComment(reportingCommentId)}
                disabled={isReportSubmitting || !reportReason}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-4 text-[14px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isReportSubmitting ? 'Reporting...' : 'Submit report'}
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
          className="fixed inset-0 z-[9998] flex items-end justify-center bg-slate-950/45 px-4 pb-4 sm:items-center sm:pb-0"
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
            className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.25)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="report-place-concern-title" className="text-[18px] font-black text-slate-950">
              Report place concern
            </h3>
            <p className="mt-1 text-[14px] font-semibold text-slate-700">
              Send this place report directly to GalaTayo for review.
            </p>

            <div className="mt-4 grid gap-2">
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

            <label className="mt-4 block">
              <span className="flex items-center gap-2 text-[13px] font-black text-slate-800">
                Extra details
                <span className="optional-label">Optional</span>
              </span>
              <textarea
                value={placeConcernDetails}
                onChange={(event) => setPlaceConcernDetails(event.target.value.slice(0, 1000))}
                disabled={isPlaceConcernSubmitting}
                rows={4}
                placeholder="Tell us what looks wrong or what should be reviewed."
                className="mt-2 w-full resize-none rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-[14px] font-semibold leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-wash)]"
              />
              <span className="mt-1 block text-right text-[12px] font-bold text-slate-500">{placeConcernDetails.length}/1000</span>
            </label>

            <div className="mt-3 min-h-5">
              {placeConcernError ? <p className="text-[13px] font-bold text-red-600">{placeConcernError}</p> : null}
            </div>

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  if (!isPlaceConcernSubmitting) {
                    setIsPlaceConcernOpen(false)
                    setPlaceConcernError('')
                  }
                }}
                disabled={isPlaceConcernSubmitting}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--line)] bg-white px-4 text-[14px] font-extrabold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSubmitPlaceConcern()}
                disabled={isPlaceConcernSubmitting || !placeConcernReason}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-4 text-[14px] font-extrabold text-white"
              >
                {isPlaceConcernSubmitting ? 'Submitting...' : 'Submit report'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isContributionOpen ? (
        <div
          className="fixed inset-0 z-[9998] flex items-end justify-center bg-slate-950/45 px-4 pb-4 sm:items-center sm:pb-0"
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
            className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.25)]"
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
                accept="image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
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

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsContributionOpen(false)}
                disabled={isContributionSubmitting}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--line)] bg-white px-4 text-[14px] font-extrabold text-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSubmitContribution()}
                disabled={isContributionSubmitting}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-4 text-[14px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isContributionSubmitting ? 'Submitting...' : 'Submit for Review'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </section>
  )
}

export default PlaceDetailView
