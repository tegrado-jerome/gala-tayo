import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { PlaceCardData } from './PlaceCard'
import AppFooter from './AppFooter'
import AppHeader from './AppHeader'
import GuestLimitModal from './GuestLimitModal'
import AddToGalaPlanModal from './AddToGalaPlanModal'
import MapView from './MapView'
import { getCuratedPlaceImages, normalizePlaceSlug } from '../data/curatedPlaceImages'
import { useSavedFavorites } from '../context/SavedFavoritesContext'
import { supabase } from '../supabase'
import { copyPlaceLink } from '../utils/sharePlace'
import { getDirectionsUrl, openDirectionsUrl } from '../utils/directions'
import { submitCommentReport, type CommentReportReason } from '../utils/commentReportsApi'
import { navigateToPath } from '../utils/navigation'

type PlaceDetailViewProps = {
  place: PlaceCardData & {
    id: string
    slug: string
  }
  onBack: () => void
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
  member_avatar_url?: string | null
  parent_comment_id: string | null
  comment: string
  status: 'visible' | 'deleted'
  created_at: string
  updated_at: string
  deleted_at: string | null
  current_user_reported?: boolean
  replies: PlaceComment[]
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
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {name === 'back' ? <path d="M15 18 9 12l6-6" /> : null}
      {name === 'share' ? (
        <>
          <path d="M12 16V4" />
          <path d="m8 8 4-4 4 4" />
          <path d="M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12" />
        </>
      ) : null}
      {name === 'save' || name === 'heart' ? (
        <path d="M12 20s-7.5-4.4-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.6 12 20 12 20Z" />
      ) : null}
      {name === 'directions' ? (
        <>
          <path d="M21 3 10 14" />
          <path d="m21 3-6 18-5-7-7-5 18-6Z" />
        </>
      ) : null}
      {name === 'location' ? (
        <>
          <path d="M12 21s6-5.7 6-11a6 6 0 1 0-12 0c0 5.3 6 11 6 11Z" />
          <circle cx="12" cy="10" r="2.2" />
        </>
      ) : null}
      {name === 'category' ? (
        <>
          <path d="M7 10.5h10" />
          <path d="M8.5 8.8v8.7" />
          <path d="M15.5 8.8v8.7" />
          <path d="M6.5 18h11" />
          <path d="M7.5 10.5c0-2.4 1.4-4.2 4.5-4.2s4.5 1.8 4.5 4.2" />
        </>
      ) : null}
      {name === 'budget' ? (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M9.5 10.3c0-1.2 1.1-2.2 2.5-2.2s2.5 1 2.5 2.2S13.4 12.3 12 12.3s-2.5 1-2.5 2.2 1.1 2.2 2.5 2.2 2.5-1 2.5-2.2" />
        </>
      ) : null}
      {name === 'clock' ? (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 8v4.5l3 1.8" />
        </>
      ) : null}
      {name === 'hourglass' ? (
        <>
          <path d="M7 4h10" />
          <path d="M7 20h10" />
          <path d="M8 4c0 4 8 4 8 8s-8 4-8 8" />
          <path d="M16 4c0 4-8 4-8 8s8 4 8 8" />
        </>
      ) : null}
      {name === 'home' ? (
        <>
          <path d="m4.5 11.2 7.5-6.2 7.5 6.2" />
          <path d="M6.5 10.5V19h11v-8.5" />
        </>
      ) : null}
      {name === 'rain' ? (
        <>
          <path d="M7.5 17.5h8a4 4 0 0 0 .5-8 5 5 0 0 0-9.4 1.2A3.5 3.5 0 0 0 7.5 17.5Z" />
          <path d="M8 21v.01" />
          <path d="M12 21v.01" />
          <path d="M16 21v.01" />
        </>
      ) : null}
      {name === 'eye' ? (
        <>
          <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
          <circle cx="12" cy="12" r="2.8" />
        </>
      ) : null}
      {name === 'fire' ? <path d="M12 21c3.7 0 6.5-2.5 6.5-6.2 0-3.1-1.8-5.2-4.2-7.4-.5 2.2-1.7 3.5-3.4 4.4.3-2.9-.9-5-2.8-6.8-.5 3.6-2.6 5.6-2.6 9.5C5.5 18.4 8.3 21 12 21Z" /> : null}
      {name === 'utensils' ? (
        <>
          <path d="M7 4v7" />
          <path d="M4.8 4v4.5A2.2 2.2 0 0 0 7 10.7a2.2 2.2 0 0 0 2.2-2.2V4" />
          <path d="M7 10.7V20" />
          <path d="M16.5 4v16" />
          <path d="M14 4h5" />
        </>
      ) : null}
      {name === 'users' ? (
        <>
          <circle cx="8.2" cy="9" r="2.2" />
          <circle cx="15.8" cy="9" r="2.2" />
          <path d="M4.2 18a4.2 4.2 0 0 1 8 0" />
          <path d="M11.8 18a4.2 4.2 0 0 1 8 0" />
        </>
      ) : null}
      {name === 'book' ? (
        <>
          <path d="M4.5 5.5h5.2A2.3 2.3 0 0 1 12 7.8v11.7a2.7 2.7 0 0 0-2.5-1.6h-5Z" />
          <path d="M19.5 5.5h-5.2A2.3 2.3 0 0 0 12 7.8v11.7a2.7 2.7 0 0 1 2.5-1.6h5Z" />
        </>
      ) : null}
      {name === 'bus' ? (
        <>
          <rect x="5" y="5" width="14" height="12" rx="2" />
          <path d="M5 10h14" />
          <path d="M8 19v1" />
          <path d="M16 19v1" />
          <circle cx="8.5" cy="14" r="1" />
          <circle cx="15.5" cy="14" r="1" />
        </>
      ) : null}
      {name === 'car' ? (
        <>
          <path d="m4.5 13 1.7-4.2A2 2 0 0 1 8.1 7.5h7.8a2 2 0 0 1 1.9 1.3l1.7 4.2" />
          <rect x="4" y="12" width="16" height="5.5" rx="1.8" />
          <circle cx="7.5" cy="17.5" r="1.2" />
          <circle cx="16.5" cy="17.5" r="1.2" />
        </>
      ) : null}
      {name === 'globe' ? (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.5 12h17" />
          <path d="M12 3.5c2.2 2.4 3.2 5.2 3.2 8.5s-1 6.1-3.2 8.5" />
          <path d="M12 3.5C9.8 5.9 8.8 8.7 8.8 12s1 6.1 3.2 8.5" />
        </>
      ) : null}
      {name === 'warning' ? (
        <>
          <path d="m12 4 9 16H3Z" />
          <path d="M12 9v5" />
          <path d="M12 17h.01" />
        </>
      ) : null}
      {name === 'sparkle' ? (
        <>
          <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6-5.5-1.7L10.3 9Z" />
          <path d="m18.5 3.5.6 2 2 .6-2 .6-.6 2-.6-2-2-.6 2-.6Z" />
        </>
      ) : null}
      {name === 'photo' ? (
        <>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <circle cx="8.5" cy="9.2" r="1.2" />
          <path d="m5.8 17 4.2-4.4a1.5 1.5 0 0 1 2.1 0l1.4 1.4 1-1a1.5 1.5 0 0 1 2.1 0l1.6 1.7" />
        </>
      ) : null}
      {name === 'crowd' ? (
        <>
          <circle cx="8.4" cy="9.1" r="2.1" />
          <circle cx="15.6" cy="9.1" r="2.1" />
          <path d="M4.8 17.3a4.1 4.1 0 0 1 7 0" />
          <path d="M12.2 17.3a4.1 4.1 0 0 1 7 0" />
        </>
      ) : null}
    </svg>
  )
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
}: {
  displayName: string
  avatarUrl?: string | null
  compact?: boolean
}) {
  const cleanAvatarUrl = cleanString(avatarUrl)
  const sizeClass = compact ? 'h-8 w-8 text-[11px]' : 'h-9 w-9 text-[12px]'

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
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-wash)] text-[var(--accent-deep)] shadow-[0_6px_16px_rgba(28,77,160,0.08)]">
        <Icon name={icon} className="h-4.5 w-4.5" />
      </span>
      <h2 className="text-[15px] font-black uppercase tracking-[0.02em] text-slate-900">{title}</h2>
    </div>
  )
}

function PlacePhoto({
  imageUrl,
  imageUrls = [],
  placeName,
  currentIndex,
  onOpen,
  onPrevious,
  onNext,
  onSelect,
}: {
  imageUrl?: string | null
  imageUrls?: string[]
  placeName: string
  currentIndex: number
  onOpen?: (imageUrl: string) => void
  onPrevious?: () => void
  onNext?: () => void
  onSelect?: (index: number) => void
}) {
  const photoUrl = cleanString(imageUrl)
  const photos = imageUrls.filter((value) => Boolean(cleanString(value))).slice(0, 3)
  const hasCarouselControls = photos.length > 1
  const safeIndex = photos.length > 0 ? Math.min(Math.max(currentIndex, 0), photos.length - 1) : 0

  if (!photoUrl) {
    return (
      <div className="flex min-h-[190px] items-center justify-center border border-[var(--line)] bg-[linear-gradient(180deg,#fbfdff,#eef4fb)] px-5 text-center sm:min-h-[210px]">
        <div className="flex flex-col items-center gap-3 text-[var(--accent-deep)]">
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--line)] bg-white shadow-[0_10px_20px_rgba(28,77,160,0.08)]">
            <Icon name="photo" className="h-7 w-7" />
          </span>
          <p className="text-sm font-black uppercase tracking-[0.02em] text-slate-900">No approved photos yet</p>
          <span className="sr-only">{placeName}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      <div className="relative overflow-hidden border border-[var(--line)] bg-neutral-100 shadow-[0_14px_30px_rgba(28,77,160,0.12)]">
        <button
          type="button"
          onClick={() => onOpen?.(photoUrl)}
          className="block h-[220px] w-full bg-neutral-100 text-left sm:h-[300px]"
          aria-label={`View image of ${placeName}`}
        >
          <img src={photoUrl} alt={placeName} className="h-full w-full object-cover" />
        </button>

        {hasCarouselControls ? (
          <>
            <button
              type="button"
              onClick={onPrevious}
              className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-black/45 text-white shadow-[0_8px_20px_rgba(0,0,0,0.22)] transition hover:bg-black/60"
              aria-label={`Show previous photo of ${placeName}`}
            >
              <Icon name="back" className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={onNext}
              className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-black/45 text-white shadow-[0_8px_20px_rgba(0,0,0,0.22)] transition hover:bg-black/60"
              aria-label={`Show next photo of ${placeName}`}
            >
              <Icon name="back" className="h-5 w-5 rotate-180" />
            </button>
            <div className="absolute bottom-3 right-3 rounded-full bg-black/55 px-3 py-1 text-[12px] font-black text-white">
              {safeIndex + 1} / {photos.length}
            </div>
          </>
        ) : null}
      </div>

      {hasCarouselControls ? (
        <div className="flex items-center justify-center gap-2">
          {photos.map((photo, index) => (
            <button
              key={photo}
              type="button"
              onClick={() => onSelect?.(index)}
              className={`h-2.5 w-2.5 rounded-full transition ${
                photo === photoUrl ? 'bg-[var(--accent)]' : 'bg-slate-300 hover:bg-[var(--accent-deep)]'
              }`}
              aria-label={`Show photo ${index + 1} of ${placeName}`}
              aria-pressed={photo === photoUrl}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function MetaLine({ icon, children }: { icon: IconName; children: string }) {
  return (
    <p className="flex items-start gap-3 text-[16px] font-semibold leading-6 text-black">
      <Icon name={icon} className="mt-0.5 h-5 w-5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

function ActionButton({
  icon,
  children,
  disabled,
  onClick,
}: {
  icon: IconName
  children: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex w-full min-h-11 items-center justify-center gap-2.5 rounded-xl border border-[var(--line-strong)] bg-white px-3.5 text-[13px] font-extrabold text-slate-800 shadow-[0_8px_18px_rgba(28,77,160,0.06)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)] hover:text-[var(--accent-deep)] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
    >
      <Icon name={icon} className="h-4.5 w-4.5 text-[var(--accent-deep)]" />
      {children}
    </button>
  )
}

function GoodForList({ values }: { values: string[] }) {
  const items = (values.length > 0 ? values : ['Coffee hangouts', 'Food trips', 'Casual dates', 'Barkada catch-ups', 'Study breaks']).slice(0, 5)

  return (
    <ul className="grid gap-3 text-[16px] leading-6 text-black">
      {items.map((item, index) => (
        <li key={item} className="flex items-center gap-4">
          <Icon name={pickGoodForIcon(item, index)} className="h-5 w-5 shrink-0" />
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
    <div className="flex min-w-0 flex-col items-center border-neutral-300 px-2 text-center sm:border-l sm:first:border-l-0">
      <Icon name={icon} className="h-7 w-7 text-[var(--accent-deep)]" />
      <p className="mt-2 text-[13px] font-black leading-tight text-slate-900">{title}</p>
      <p className="mt-1 text-[13px] font-semibold leading-5 text-slate-700">{value}</p>
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
    <div className="border-neutral-300 sm:border-l sm:pl-8 sm:first:border-l-0 sm:first:pl-0">
      <div className="flex items-center gap-4">
        <Icon name={icon} className="h-5 w-5 shrink-0 text-[var(--accent-deep)]" />
        <h3 className="text-[15px] font-black text-slate-900">{title}</h3>
      </div>
      <div className="mt-3 text-[14px] font-semibold leading-6 text-slate-700">{children}</div>
    </div>
  )
}

function DetailSection({ children }: { children: ReactNode }) {
  return <section className="border-t border-[var(--line)] py-6 first:border-t-0">{children}</section>
}

const filledStar = String.fromCharCode(9733)
const ratingSummaryStar = String.fromCodePoint(11088)
const middleDot = String.fromCharCode(183)
const commentReportReasons: Array<{ value: CommentReportReason; label: string }> = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'false_info', label: 'False information' },
  { value: 'personal_info', label: 'Personal information' },
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
    <div className="flex gap-1.5" aria-label="Choose rating">
      {[1, 2, 3, 4, 5].map((ratingValue) => (
        <button
          key={ratingValue}
          type="button"
          onClick={() => onChange(ratingValue)}
          disabled={disabled}
          className={`flex h-10 w-10 items-center justify-center rounded-lg border text-[24px] leading-none transition hover:-translate-y-[1px] ${
            ratingValue <= value
              ? 'border-amber-200 bg-amber-50 text-amber-500'
              : 'border-[var(--line)] bg-white text-slate-300 hover:text-amber-400'
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

function PlaceDetailView({ place, onBack }: PlaceDetailViewProps) {
  const [isSavePromptOpen, setIsSavePromptOpen] = useState(false)
  const [isAddToPlanOpen, setIsAddToPlanOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [shareMessage, setShareMessage] = useState('')
  const [shareError, setShareError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [saveError, setSaveError] = useState('')
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [activePhotoIndex, setActivePhotoIndex] = useState(0)
  const [isContributionOpen, setIsContributionOpen] = useState(false)
  const [contributionFile, setContributionFile] = useState<File | null>(null)
  const [contributionSourceUrl, setContributionSourceUrl] = useState('')
  const [contributionNote, setContributionNote] = useState('')
  const [isContributionSubmitting, setIsContributionSubmitting] = useState(false)
  const [contributionMessage, setContributionMessage] = useState('')
  const [contributionError, setContributionError] = useState('')
  const [averageRating, setAverageRating] = useState<number | null>(null)
  const [reviewCount, setReviewCount] = useState(0)
  const [currentUserReview, setCurrentUserReview] = useState<PlaceReview | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isReviewsLoading, setIsReviewsLoading] = useState(true)
  const [reviewRating, setReviewRating] = useState(0)
  const [isReviewSubmitting, setIsReviewSubmitting] = useState(false)
  const [isReviewDeleting, setIsReviewDeleting] = useState(false)
  const [isReviewSignInStarting, setIsReviewSignInStarting] = useState(false)
  const [reviewMessage, setReviewMessage] = useState('')
  const [reviewError, setReviewError] = useState('')
  const [isReviewEditing, setIsReviewEditing] = useState(false)
  const [comments, setComments] = useState<PlaceComment[]>([])
  const [isCommentsLoading, setIsCommentsLoading] = useState(true)
  const [commentBody, setCommentBody] = useState('')
  const [commentMessage, setCommentMessage] = useState('')
  const [commentError, setCommentError] = useState('')
  const [isCommentSubmitting, setIsCommentSubmitting] = useState(false)
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editCommentBody, setEditCommentBody] = useState('')
  const [mutatingCommentId, setMutatingCommentId] = useState<string | null>(null)
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState<CommentReportReason | ''>('')
  const [reportDetails, setReportDetails] = useState('')
  const [reportError, setReportError] = useState('')
  const [reportSuccessNotice, setReportSuccessNotice] = useState('')
  const [isReportSubmitting, setIsReportSubmitting] = useState(false)
  const { isPlaceSaved, saveFavorite, removeFavorite } = useSavedFavorites()

  const resolvedCuratedImageUrls = place.curatedImageUrls ?? getCuratedPlaceImages(place.name)
  const galleryPhotos = Array.from(
    new Set([place.imageUrl, place.curatedImageUrl, ...resolvedCuratedImageUrls].filter((value): value is string => Boolean(cleanString(value))))
  ).slice(0, 3)
  const heroImageUrl = galleryPhotos[activePhotoIndex] ?? galleryPhotos[0] ?? null
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
  const isSaved = [place.id, place.slug, normalizedNameSlug].some((slugOrId) => isPlaceSaved(slugOrId))
  const hasCurrentUserReview = Boolean(currentUserReview)
  const reviewSummary = reviewCount > 0 && averageRating !== null ? `${ratingSummaryStar} ${averageRating.toFixed(1)} ${middleDot} ${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'}` : 'No reviews yet'
  const basedOnReviews = reviewCount > 0 ? `Based on ${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'}` : 'Share your quick take.'

  useEffect(() => {
    setActivePhotoIndex(0)
  }, [place.id])

  useEffect(() => {
    if (activePhotoIndex >= galleryPhotos.length) {
      setActivePhotoIndex(0)
    }
  }, [activePhotoIndex, galleryPhotos.length])

  const showPreviousPhoto = () => {
    if (galleryPhotos.length < 2) {
      return
    }

    setActivePhotoIndex((currentIndex) => (currentIndex === 0 ? galleryPhotos.length - 1 : currentIndex - 1))
  }

  const showNextPhoto = () => {
    if (galleryPhotos.length < 2) {
      return
    }

    setActivePhotoIndex((currentIndex) => (currentIndex + 1) % galleryPhotos.length)
  }

  const fetchPlaceReviews = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setIsReviewsLoading(true)
        setReviewError('')

        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        setCurrentUserId(data.session?.user?.id ?? null)

        if (!isCommunityPlaceReady) {
          setAverageRating(null)
          setReviewCount(0)
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
      } finally {
        if (!signal?.aborted) {
          setIsReviewsLoading(false)
        }
      }
    },
    [isCommunityPlaceReady, placeId],
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

        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token

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

  useEffect(() => {
    const controller = new AbortController()

    queueMicrotask(() => {
      void fetchPlaceReviews(controller.signal)
      void fetchPlaceComments(controller.signal)
    })

    const { data: authSubscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUserId(session?.user?.id ?? null)
      void fetchPlaceReviews()
      void fetchPlaceComments()
    })

    return () => {
      controller.abort()
      authSubscription.subscription.unsubscribe()
    }
  }, [fetchPlaceComments, fetchPlaceReviews])

  useEffect(() => {
    const controller = new AbortController()

    const savePlaceViewHistory = async () => {
      try {
        if (!placeSlug) {
          return
        }

        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
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
      setShareMessage('')
      setShareError('')
      await copyPlaceLink(place)
      setShareMessage('Link copied - paste it anywhere.')
    } catch {
      setShareError('Could not copy the link. Please try again.')
    }
  }

  const handleSavePlace = async () => {
    try {
      setIsSaving(true)
      setShareMessage('')
      setShareError('')
      setSaveMessage('')
      setSaveError('')

      if (isSaved) {
        const message = await removeFavorite(placeId)
        setSaveMessage(message)
        return
      }

      const result = await saveFavorite(placeId)

      if (result.status === 'guest') {
        setIsSavePromptOpen(true)
        return
      }

      setSaveMessage(result.message)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save favorite.')
    } finally {
      setIsSaving(false)
    }
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

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

    if (!allowedTypes.includes(contributionFile.type) || contributionFile.size > 5 * 1024 * 1024) {
      setContributionError('Use a JPEG, PNG, or WebP image up to 5MB.')
      return
    }

    try {
      setIsContributionSubmitting(true)
      setContributionError('')
      setContributionMessage('')

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

      setContributionMessage(result?.message || 'Photo submitted for review.')
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
      setReviewMessage('')
      return
    }

    if (!UUID_PATTERN.test(placeId)) {
      setReviewError('Place id is missing or invalid.')
      setReviewMessage('')
      return
    }

    try {
      setIsReviewSubmitting(true)
      setReviewError('')
      setReviewMessage('')

      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token

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

      setReviewMessage(hasCurrentUserReview ? 'Rating updated. Salamat!' : 'Rating saved. Salamat!')
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
      setReviewMessage('')

      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token

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
      setReviewMessage('Rating removed.')
      await fetchPlaceReviews()
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : 'Unable to delete review. Please try again.')
    } finally {
      setIsReviewDeleting(false)
    }
  }

  const getSessionToken = async (loginMessage: string) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token

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
      setCommentMessage('')
      return
    }

    if (!UUID_PATTERN.test(placeId)) {
      setCommentError('Place id is missing or invalid.')
      setCommentMessage('')
      return
    }

    try {
      setIsCommentSubmitting(true)
      setCommentError('')
      setCommentMessage('')

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
      const result = parseJsonResponse<{ message?: string }>(responseText)

      if (!response.ok) {
        throw new Error(result?.message || 'Unable to post comment.')
      }

      setCommentBody('')
      setCommentMessage('Comment posted.')
      await fetchPlaceComments()
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'Unable to post comment.')
    } finally {
      setIsCommentSubmitting(false)
    }
  }

  const handleSubmitReply = async (commentId: string) => {
    if (mutatingCommentId) {
      return
    }

    const body = replyBody.trim()

    if (!body) {
      setCommentError('Type a reply muna.')
      setCommentMessage('')
      return
    }

    try {
      setMutatingCommentId(commentId)
      setCommentError('')
      setCommentMessage('')

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
      const result = parseJsonResponse<{ message?: string }>(responseText)

      if (!response.ok) {
        throw new Error(result?.message || 'Unable to post reply.')
      }

      setReplyBody('')
      setReplyingToCommentId(null)
      setCommentMessage('Reply posted.')
      await fetchPlaceComments()
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
      setCommentMessage('')
      return
    }

    try {
      setMutatingCommentId(commentId)
      setCommentError('')
      setCommentMessage('')

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
      const result = parseJsonResponse<{ message?: string }>(responseText)

      if (!response.ok) {
        throw new Error(result?.message || 'Unable to update comment.')
      }

      setEditingCommentId(null)
      setEditCommentBody('')
      await fetchPlaceComments()
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
      setCommentMessage('')

      const token = await getSessionToken('Sign in as a member to delete your comment.')
      const response = await fetch(getApiEndpoint(`/places/${encodeURIComponent(placeId)}/comments/${encodeURIComponent(commentId)}`), {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const responseText = await response.text()
      const result = parseJsonResponse<{ message?: string }>(responseText)

      if (!response.ok) {
        throw new Error(result?.message || 'Unable to delete comment.')
      }

      setCommentMessage('Comment deleted.')
      await fetchPlaceComments()
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
      setCommentMessage('')
      return
    }

    try {
      setIsReportSubmitting(true)
      setReportError('')
      setCommentMessage('')
      setReportSuccessNotice('')

      const token = await getSessionToken('Sign in as a member to report comments.')
      await submitCommentReport(commentId, token, {
        reason: reportReason,
        details: reportDetails,
      })

      setReportingCommentId(null)
      setReportReason('')
      setReportDetails('')
      setReportError('')
      setReportSuccessNotice('Report submitted. You can track your report in My Reports.')
      setCommentMessage('Report submitted.')
      setComments((currentComments) => markCommentReported(currentComments, commentId))
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'Could not submit report. Please try again.')
    } finally {
      setIsReportSubmitting(false)
    }
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
  const renderComment = (comment: PlaceComment, isReply = false): ReactNode => {
    const isOwner = comment.user_id === currentUserId
    const isReportedByCurrentUser = Boolean(comment.current_user_reported)
    const isEditing = editingCommentId === comment.id
    const isMutating = mutatingCommentId === comment.id
    const displayName = isOwner ? 'You' : cleanString(comment.member_display_name) || 'GalaTayo member'
    const avatarUrl = cleanString(comment.member_avatar_url)
    const isEdited = wasEdited(comment.created_at, comment.updated_at)

    return (
      <li key={comment.id} className={`${isReply ? 'ml-5 border-l-2 border-[var(--line)] pl-3' : ''}`}>
        <div className="rounded-xl border border-[var(--line)] bg-white p-3 shadow-[0_8px_18px_rgba(28,77,160,0.04)]">
          <div className="flex items-start gap-3">
            <MemberAvatar displayName={displayName} avatarUrl={avatarUrl} compact={isReply} />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[13px] font-black text-slate-900">{displayName}</span>
                <span className="shrink-0 text-[12px] font-semibold text-slate-500">
                  {formatReviewDate(comment.updated_at || comment.created_at)}
                  {isEdited ? <span className="ml-1 text-slate-400">(Edited)</span> : null}
                </span>
              </div>

              {isEditing ? (
                <div className="mt-3">
                  <textarea
                    value={editCommentBody}
                    onChange={(event) => setEditCommentBody(event.target.value)}
                    rows={3}
                    disabled={isMutating}
                    className="w-full resize-none rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-[14px] font-semibold text-slate-800 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(47,116,232,0.14)] disabled:cursor-not-allowed disabled:opacity-70"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleUpdateComment(comment.id)}
                      disabled={isMutating}
                      className="rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-[12px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-70"
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
                      className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-[12px] font-extrabold text-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 whitespace-pre-line text-[14px] font-semibold leading-6 text-slate-700">{comment.comment}</p>
              )}

              {!isEditing ? (
                <div className="mt-2 flex flex-wrap gap-3 text-[12px] font-extrabold">
                  {!isReply && currentUserId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setReplyingToCommentId(replyingToCommentId === comment.id ? null : comment.id)
                        setReplyBody('')
                        setCommentError('')
                      }}
                      className="text-[var(--accent-deep)]"
                    >
                      Reply
                    </button>
                  ) : null}
                  {isOwner ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCommentId(comment.id)
                          setEditCommentBody(comment.comment)
                          setCommentError('')
                        }}
                        className="text-slate-700"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteComment(comment.id)}
                        disabled={isMutating}
                        className="text-red-600 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {isMutating ? 'Deleting...' : 'Delete'}
                      </button>
                    </>
                  ) : null}
                  {!isOwner ? (
                    isReportedByCurrentUser ? (
                      <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
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
                          setCommentMessage('')
                        }}
                        className="text-slate-600"
                      >
                        Report
                      </button>
                    )
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {replyingToCommentId === comment.id ? (
          <div className="ml-5 mt-2 rounded-xl border border-[var(--line)] bg-white p-3">
            <textarea
              value={replyBody}
              onChange={(event) => setReplyBody(event.target.value)}
              rows={2}
              disabled={isMutating}
              placeholder="Add a reply..."
              className="w-full resize-none rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-[14px] font-semibold text-slate-800 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(47,116,232,0.14)] disabled:cursor-not-allowed disabled:opacity-70"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleSubmitReply(comment.id)}
                disabled={isMutating}
                className="rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-[12px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-70"
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
                className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-[12px] font-extrabold text-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {comment.replies.length > 0 ? (
          <ul className="mt-2 grid gap-2">
            {comment.replies.map((reply) => renderComment(reply, true))}
          </ul>
        ) : null}
      </li>
    )
  }

  const communitySection = !isCommunityPlaceReady ? (
    <DetailSection>
      <SectionHeading icon="sparkle" title="Community" />
      <div className="mt-4 rounded-xl border border-[var(--line)] bg-white p-4 shadow-[0_10px_24px_rgba(28,77,160,0.06)]">
        <p className="text-[14px] font-bold text-slate-700">Loading community details...</p>
      </div>
    </DetailSection>
  ) : (
    <DetailSection>
      <SectionHeading icon="sparkle" title="Community" />
      <div className="mt-4 grid gap-4">
        <div className="rounded-xl border border-[var(--line)] bg-white p-4 shadow-[0_10px_24px_rgba(28,77,160,0.06)]">
          <h3 className="text-[17px] font-black text-slate-950">{currentUserReview && !isReviewEditing ? 'Your rating' : 'Rate this place'}</h3>
          {reviewCount > 0 && averageRating !== null ? (
            <p className="mt-1 text-[13px] font-semibold text-slate-600">{basedOnReviews}</p>
          ) : null}

          {currentUserId && (!hasCurrentUserReview || isReviewEditing) ? (
            <div className="mt-3">
              <StarRatingInput
                value={reviewRating}
                disabled={isReviewSubmitting || isReviewDeleting}
                onChange={(value) => {
                  setReviewRating(value)
                  setReviewError('')
                }}
              />

              <div className="mt-2 min-h-5">
                {reviewError ? <p className="text-[13px] font-bold text-red-600">{reviewError}</p> : null}
                {reviewMessage ? <p className="text-[13px] font-bold text-[var(--accent-deep)]">{reviewMessage}</p> : null}
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void handleSubmitReview()}
                  disabled={isReviewSubmitting || isReviewDeleting}
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-4 text-[14px] font-extrabold text-white shadow-[0_10px_20px_rgba(47,116,232,0.2)] transition hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-70"
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
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--line)] bg-white px-4 text-[14px] font-extrabold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </div>
          ) : currentUserId && currentUserReview ? (
            <div className="mt-4 rounded-xl border border-[var(--line)] bg-[linear-gradient(180deg,#ffffff,#fbfdff)] p-4">
              <div className="mt-2 flex items-center gap-2">
                <StarsDisplay rating={currentUserReview.rating} />
                <span className="text-[13px] font-black text-slate-800">{currentUserReview.rating}/5</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsReviewEditing(true)
                    setReviewRating(currentUserReview.rating)
                    setReviewError('')
                  }}
                  disabled={isReviewSubmitting || isReviewDeleting}
                  className="rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 text-[13px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteReview()}
                  disabled={isReviewSubmitting || isReviewDeleting}
                  className="rounded-lg border border-red-200 bg-white px-3 py-2 text-[13px] font-extrabold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isReviewDeleting ? 'Removing...' : 'Remove'}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--accent-wash)] p-4">
              <p className="text-[14px] font-bold text-slate-800">Sign in as a member to rate this place.</p>
              <button
                type="button"
                onClick={() => void handleReviewSignIn()}
                disabled={isReviewSignInStarting}
                className="mt-3 inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--accent)] bg-white px-4 text-[13px] font-extrabold text-[var(--accent-deep)] transition hover:bg-[var(--accent)] hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isReviewSignInStarting ? 'Opening login...' : 'Login'}
              </button>
              {reviewError ? <p className="mt-3 text-[13px] font-bold text-red-600">{reviewError}</p> : null}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[var(--line)] bg-white p-4 shadow-[0_10px_24px_rgba(28,77,160,0.06)]">
          <h3 className="text-[17px] font-black text-slate-950">Comments</h3>

          {currentUserId ? (
            <div className="mt-3">
              <textarea
                value={commentBody}
                onChange={(event) => setCommentBody(event.target.value)}
                rows={3}
                disabled={isCommentSubmitting}
                placeholder="Add a comment..."
                className="w-full resize-none rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-[14px] font-semibold text-slate-800 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(47,116,232,0.14)] disabled:cursor-not-allowed disabled:opacity-70"
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleSubmitComment()}
                  disabled={isCommentSubmitting}
                  className="rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-[13px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isCommentSubmitting ? 'Posting...' : 'Comment'}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--accent-wash)] p-4">
              <p className="text-[14px] font-bold text-slate-800">Sign in as a member to comment.</p>
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

          <div className="mt-3 min-h-5">
            {commentError ? <p className="text-[13px] font-bold text-red-600">{commentError}</p> : null}
            {commentMessage ? <p className="text-[13px] font-bold text-[var(--accent-deep)]">{commentMessage}</p> : null}
          </div>

          {isCommentsLoading ? (
            <p className="mt-3 text-[14px] font-semibold text-slate-600">Loading comments...</p>
          ) : comments.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-[var(--line-strong)] bg-white px-4 py-5 text-[14px] font-bold text-slate-600">
              No comments yet. Ikaw first?
            </p>
          ) : (
            <ul className="mt-3 grid gap-3">
              {comments.map((comment) => renderComment(comment))}
            </ul>
          )}
        </div>
      </div>
    </DetailSection>
  )

  return (
    <section className="min-h-screen bg-white px-0 py-0 text-[var(--text)] sm:bg-[var(--bg)] sm:py-0">
      <AppHeader />

      <main className="min-h-screen w-full bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] px-4 pb-8 pt-4 sm:px-6 md:px-8 lg:px-10">
        <div className="mx-auto w-full max-w-[1120px]">
          <button
            type="button"
            onClick={onBack}
            className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white px-2.5 py-1.5 text-[12px] font-extrabold text-slate-700 shadow-[0_8px_18px_rgba(28,77,160,0.06)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)] hover:text-[var(--accent-deep)]"
            aria-label="Back"
          >
            <Icon name="back" className="h-3.5 w-3.5" />
            Back
          </button>

          <PlacePhoto
            imageUrl={heroImageUrl}
            imageUrls={galleryPhotos}
            placeName={place.name}
            currentIndex={activePhotoIndex}
            onOpen={setSelectedImage}
            onPrevious={showPreviousPhoto}
            onNext={showNextPhoto}
            onSelect={setActivePhotoIndex}
          />

          <section className="py-3">
            <h1 className="text-[26px] font-black leading-tight tracking-[0.01em] text-slate-950 sm:text-[30px]">{place.name}</h1>
            <p className="mt-1.5 text-[14px] font-extrabold text-slate-800">{isReviewsLoading ? 'Loading reviews...' : reviewSummary}</p>
            <div className="mt-2.5 grid gap-2">
              <MetaLine icon="category">{categoryLabel}</MetaLine>
              <MetaLine icon="location">{locationLabel}</MetaLine>
              <MetaLine icon="budget">{budgetLabel}</MetaLine>
            </div>

            <div className="mt-4 grid gap-2">
              <div className="grid grid-cols-2 gap-2">
                <ActionButton icon="save" onClick={handleSavePlace} disabled={isSaving}>
                  {isSaving ? 'Saving' : isSaved ? 'Saved' : 'Save'}
                </ActionButton>
                <ActionButton icon="share" onClick={handleSharePlace}>
                  Share
                </ActionButton>
              </div>
              <ActionButton icon="book" onClick={() => setIsAddToPlanOpen(true)}>
                Add to Plan
              </ActionButton>
              <ActionButton icon="directions" onClick={openDirections} disabled={!directionsUrl}>
                Directions
              </ActionButton>
              {currentUserId ? (
                canContributePhoto ? (
                  <ActionButton icon="photo" onClick={() => {
                    setContributionError('')
                    setContributionMessage('')
                    setIsContributionOpen(true)
                  }}>
                    Contribute Photo
                  </ActionButton>
                ) : (
                  <p className="rounded-xl border border-[var(--line)] bg-white px-3.5 py-3 text-center text-[13px] font-extrabold text-slate-600">
                    This place already has enough photos.
                  </p>
                )
              ) : null}
            </div>

            <div className="mt-2 min-h-5">
              {shareMessage ? <p className="text-[12px] font-bold text-[var(--accent-deep)]">{shareMessage}</p> : null}
              {shareError ? <p className="text-[12px] font-bold text-red-600">{shareError}</p> : null}
              {saveMessage ? <p className="text-[12px] font-bold text-[var(--accent-deep)]">{saveMessage}</p> : null}
              {saveError ? <p className="text-[12px] font-bold text-red-600">{saveError}</p> : null}
              {contributionMessage ? <p className="text-[12px] font-bold text-[var(--accent-deep)]">{contributionMessage}</p> : null}
              {contributionError && !isContributionOpen ? <p className="text-[12px] font-bold text-red-600">{contributionError}</p> : null}
            </div>
          </section>

          <DetailSection>
            <div className="grid gap-4 md:grid-cols-[1fr_320px] md:items-start">
              <div>
                <SectionHeading icon="location" title="Location" />
                <p className="mt-3 whitespace-pre-line pl-11 text-[14px] font-semibold leading-6 text-slate-700">{addressLabel}</p>
              </div>
              <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[linear-gradient(180deg,#fbfdff,#f3f8ff)] shadow-[0_10px_24px_rgba(28,77,160,0.08)]">
                <MapView
                  places={[place]}
                  selectedPlaceId={place.id}
                  center={[place.coordinates.lat, place.coordinates.lng]}
                  zoom={16}
                  autoFitToPlaces={false}
                  className="!h-[176px] !rounded-none !border-0 md:!h-[172px]"
                />
              </div>
            </div>
          </DetailSection>

          <DetailSection>
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <SectionHeading icon="eye" title="Quick Take" />
                <p className="mt-3 pl-11 text-[14px] font-semibold leading-6 text-slate-700">{quickTake}</p>
              </div>
              <div className="border-neutral-300 md:border-l md:pl-8">
                <SectionHeading icon="fire" title="Best For" />
                <div className="mt-3 pl-11">
                  <GoodForList values={goodFor} />
                </div>
              </div>
            </div>
          </DetailSection>

          <DetailSection>
            <SectionHeading icon="sparkle" title="Game Plan" />
            <div className="mt-4 grid grid-cols-2 gap-y-3 sm:grid-cols-5 sm:gap-y-0">
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
            <div className="mt-3 grid gap-3 pl-11 md:grid-cols-[0.45fr_1fr]">
              <p className="text-[14px] font-semibold text-slate-700">Not ideal for:</p>
              <ul className="list-disc space-y-1 pl-5 text-[14px] font-semibold leading-6 text-slate-700 md:border-l md:border-neutral-300 md:pl-7">
                {(notIdealFor.length > 0 ? notIdealFor : ['Whole-day plans', 'Out-of-town plans', 'Plans that need a totally different activity']).map((item) => (
                  <li key={item}>{titleCase(item)}</li>
                ))}
              </ul>
            </div>
          </DetailSection>

          <DetailSection>
            <SectionHeading icon="location" title="Around Here" />
            <p className="mt-3 pl-11 text-[14px] font-semibold leading-6 text-slate-700">{aroundHere}</p>
          </DetailSection>

          <DetailSection>
            <SectionHeading icon="sparkle" title="The Vibe" />
            <p className="mt-3 pl-11 text-[14px] font-semibold leading-6 text-slate-700">{vibeText}</p>
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
      <AppFooter />

      {reportSuccessNotice ? (
        <div
          className="fixed bottom-4 left-4 right-4 z-[9997] rounded-xl border border-emerald-200 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.22)] sm:left-auto sm:w-[420px]"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <Icon name="warning" className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-black text-slate-950">Report submitted</p>
              <p className="mt-1 text-[13px] font-semibold leading-5 text-slate-700">{reportSuccessNotice}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigateToPath('/reports')}
                  className="inline-flex min-h-9 items-center justify-center rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-3 text-[12px] font-black text-white"
                >
                  Open My Reports
                </button>
                <button
                  type="button"
                  onClick={() => setReportSuccessNotice('')}
                  className="inline-flex min-h-9 items-center justify-center rounded-lg border border-[var(--line)] bg-white px-3 text-[12px] font-black text-slate-700"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {reportingCommentId ? (
        <div
          className="fixed inset-0 z-[9998] flex items-end justify-center bg-slate-950/45 px-4 pb-4 sm:items-center sm:pb-0"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-comment-title"
          onClick={() => {
            if (!isReportSubmitting) {
              setReportingCommentId(null)
              setReportReason('')
              setReportDetails('')
              setReportError('')
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.25)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="report-comment-title" className="text-[18px] font-black text-slate-950">
              Report comment
            </h3>
            <p className="mt-1 text-[14px] font-semibold text-slate-700">Why are you reporting this comment?</p>

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
              <span className="text-[13px] font-black text-slate-800">Add more details optional</span>
              <textarea
                value={reportDetails}
                onChange={(event) => setReportDetails(event.target.value.slice(0, 500))}
                disabled={isReportSubmitting}
                maxLength={500}
                rows={4}
                placeholder="Add more details optional"
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
                onClick={() => {
                  setReportingCommentId(null)
                  setReportReason('')
                  setReportDetails('')
                  setReportError('')
                }}
                disabled={isReportSubmitting}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--line)] bg-white px-4 text-[14px] font-extrabold text-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleReportComment(reportingCommentId)}
                disabled={isReportSubmitting || !reportReason}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-red-600 bg-red-600 px-4 text-[14px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isReportSubmitting ? 'Submitting...' : 'Submit report'}
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
                accept="image/jpeg,image/jpg,image/png,image/webp"
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
              <span className="text-[13px] font-black text-slate-800">Source URL optional</span>
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
              <span className="text-[13px] font-black text-slate-800">Contributor note optional</span>
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

      {selectedImage ? (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setSelectedImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Full place image"
        >
          <button
            type="button"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-white/10 text-xl leading-none text-white transition hover:bg-white/20"
            onClick={() => setSelectedImage(null)}
            aria-label="Close full image"
          >
            x
          </button>
          <img
            src={selectedImage}
            alt={`Full view of ${place.name}`}
            className="max-h-full max-w-full rounded-xl object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </section>
  )
}

export default PlaceDetailView
