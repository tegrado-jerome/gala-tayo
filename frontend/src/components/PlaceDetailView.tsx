import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { Accessibility, ArrowLeft, Bus, Camera, Check, Ellipsis, Flag, Heart, Navigation, Pencil, Plus, Reply, Share2, Sparkles, SquareParking, Star, Trash2, UserRound, Wallet, X } from 'lucide-react'
import { useGuestAuthPrompt } from './GuestAuthPrompt'
import AddToGalaPlanModal from './AddToGalaPlanModal'
import InternalLink from './InternalLink'
import ReportUserModal from './ReportUserModal'
import PlaceImageNotice from './PlaceImageNotice'
import { Button, Chip, Empty, KeyValue, Page, Panel, SectionHead, Sheet, Skeleton, Tag, cx } from './ui'
import GtMap, { type MapPoint } from './ui/GtMap'
import { getCuratedPlaceImages, normalizePlaceSlug } from '../data/curatedPlaceImages'
import { useSavedFavorites } from '../context/SavedFavoritesContext'
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
import { openFloatingChat } from '../utils/floatingChat'
import { MemberAvatar } from './place-detail/MemberAvatar'
import CheckInButton from './place-detail/CheckInButton'
import { getSulitLevel } from './place-detail/SulitMeter'
import { GoodForList } from './place-detail/GoodForList'
import { cleanString, formatPriceLevel, titleCase, uniqueList, isAcceptedContributionImage, contributionImageErrorMessage, parseJsonResponse } from './place-detail/helpers'
import type { PlaceDetailViewProps, PlaceReview, PlaceReviewsResponse, PlaceComment, PlaceCommentsResponse, PlaceImageContributionResponse, PlaceDetailCommunityCache } from './place-detail/types'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PLACE_DETAIL_COMMUNITY_CACHE_PREFIX = 'galatayo:place-community:'
const PLACE_DETAIL_COMMUNITY_CACHE_TTL_MS = 10 * 60 * 1000



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
  if (Number.isFinite(parsedBudgetMin) && parsedBudgetMin <= 0) {
    return 'Free entry'
  }
  if (Number.isFinite(parsedBudgetMin)) {
    return `Starting from ₱${new Intl.NumberFormat('en-US').format(Math.max(0, Math.floor(parsedBudgetMin)))}`
  }

  const cleanedBudgetNote = cleanString(budgetNote)
  if (cleanedBudgetNote) {
    const amountMatch = cleanedBudgetNote.match(/(?:₱|PHP\s*)\s*([0-9][0-9,]*)/i)
    const parsedAmount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : NaN
    if (Number.isFinite(parsedAmount)) {
      return `Starting from ₱${new Intl.NumberFormat('en-US').format(Math.max(0, Math.floor(parsedAmount)))}`
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


type LatLng = { lat: number; lng: number }

function toCoordinate(value: number | string | null | undefined) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function distanceBetweenKm(from: LatLng, to: LatLng) {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(to.lat - from.lat)
  const dLng = toRad(to.lng - from.lng)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function useKnownUserLocation() {
  const [location, setLocation] = useState<LatLng | null>(null)

  useEffect(() => {
    let cancelled = false
    if (typeof navigator === 'undefined' || !navigator.geolocation || !navigator.permissions?.query) return

    navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (cancelled || status.state !== 'granted') return
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (!cancelled) setLocation({ lat: position.coords.latitude, lng: position.coords.longitude })
          },
          () => undefined,
          { maximumAge: 300000, timeout: 10000 },
        )
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [])

  return location
}

function PlacePhoto({
  imageUrls,
  placeName,
  currentIndex,
  onSelect,
  showAddPhotoAction,
  onContribute,
}: {
  imageUrls: string[]
  placeName: string
  currentIndex: number
  onSelect: (index: number) => void
  showAddPhotoAction: boolean
  onContribute: () => void
}) {
  const swipeStartX = useRef<number | null>(null)
  const [brokenPhotoUrls, setBrokenPhotoUrls] = useState<Set<string>>(new Set())
  const photoSourceKey = uniqueList(imageUrls).join('|')

  useEffect(() => {
    setBrokenPhotoUrls(new Set())
  }, [photoSourceKey])

  const photos = uniqueList(imageUrls)
    .filter((photo) => !brokenPhotoUrls.has(photo))
    .slice(0, 5)
  const safeIndex = photos.length > 0 ? Math.min(Math.max(currentIndex, 0), photos.length - 1) : 0
  const activePhoto = photos[safeIndex] ?? null
  const tileIndexes = photos.map((_, index) => index).filter((index) => index !== safeIndex)

  const markPhotoBroken = (photoUrl: string) => {
    setBrokenPhotoUrls((current) => {
      if (current.has(photoUrl)) return current
      const next = new Set(current)
      next.add(photoUrl)
      return next
    })
  }

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    swipeStartX.current = event.changedTouches[0]?.clientX ?? null
  }

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const startX = swipeStartX.current
    swipeStartX.current = null
    if (startX === null || photos.length < 2) return
    const deltaX = (event.changedTouches[0]?.clientX ?? startX) - startX
    if (Math.abs(deltaX) < 40) return
    if (deltaX < 0 && safeIndex < photos.length - 1) onSelect(safeIndex + 1)
    if (deltaX > 0 && safeIndex > 0) onSelect(safeIndex - 1)
  }

  const addPhotoButton = showAddPhotoAction ? (
    <Button variant="line" size="sm" onClick={onContribute} className="absolute right-3 top-3">
      <Camera aria-hidden="true" />
      Add photo
    </Button>
  ) : null

  if (!activePhoto) {
    return (
      <div className="grid gap-2">
        <div className="grid h-[240px] place-items-center rounded-[var(--r-3)] bg-[var(--fill)] px-6 text-center md:h-[400px]">
          <div>
            <Camera className="mx-auto h-8 w-8 text-[var(--ink-3)]" aria-hidden="true" />
            <p className="g-h3 mt-3">Wala pang photos</p>
            <p className="g-sm g-mut mt-1">Be the first to add a photo of this spot.</p>
            {showAddPhotoAction ? (
              <Button variant="ink" size="sm" onClick={onContribute} className="mt-4">
                <Camera aria-hidden="true" />
                Add photo
              </Button>
            ) : null}
          </div>
        </div>
        <PlaceImageNotice />
      </div>
    )
  }

  const tileCount = Math.min(tileIndexes.length, 4)
  const desktopColumns = tileCount === 0 ? '1fr' : tileCount <= 2 ? '2fr 1fr' : '2fr 1fr 1fr'

  return (
    <div className="grid gap-2">
      <div className="md:hidden">
        <div
          className="relative overflow-hidden rounded-[var(--r-3)] bg-[var(--fill)]"
          style={{ aspectRatio: '4 / 3' }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <img src={activePhoto} alt={placeName} className="h-full w-full object-cover" loading="eager" onError={() => markPhotoBroken(activePhoto)} />
          {photos.length > 1 ? (
            <Tag tone="solid" className="absolute bottom-3 right-3">
              {safeIndex + 1} / {photos.length}
            </Tag>
          ) : null}
          {addPhotoButton}
        </div>
        {photos.length > 1 ? (
          <div className="mt-2 grid grid-cols-5 gap-2">
            {photos.map((photo, index) => (
              <button
                key={`${photo}-thumb`}
                type="button"
                onClick={() => onSelect(index)}
                aria-label={`Show photo ${index + 1} of ${placeName}`}
                aria-pressed={index === safeIndex}
                className={cx(
                  'h-14 overflow-hidden rounded-[var(--r-2)] bg-[var(--fill)]',
                  index === safeIndex && 'outline outline-2 outline-offset-2 outline-[var(--ink)]',
                )}
              >
                <img src={photo} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => markPhotoBroken(photo)} />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div
        className="hidden h-[400px] gap-2 md:grid lg:h-[420px]"
        style={{ gridTemplateColumns: desktopColumns, gridTemplateRows: 'repeat(2, minmax(0, 1fr))' }}
      >
        <div className="relative overflow-hidden rounded-[var(--r-3)] bg-[var(--fill)]" style={{ gridRow: 'span 2' }}>
          <img src={activePhoto} alt={placeName} className="h-full w-full object-cover" loading="eager" onError={() => markPhotoBroken(activePhoto)} />
          {addPhotoButton}
        </div>
        {tileIndexes.slice(0, 4).map((photoIndex, position) => {
          const photo = photos[photoIndex]
          const spansRows = tileCount === 1 || (tileCount === 3 && position === 0)
          return (
            <button
              key={`${photo}-tile`}
              type="button"
              onClick={() => onSelect(photoIndex)}
              aria-label={`Show photo ${photoIndex + 1} of ${placeName}`}
              className="group overflow-hidden rounded-[var(--r-3)] bg-[var(--fill)]"
              style={spansRows ? { gridRow: 'span 2' } : undefined}
            >
              <img
                src={photo}
                alt=""
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                loading="lazy"
                onError={() => markPhotoBroken(photo)}
              />
            </button>
          )
        })}
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
    <div className="flex items-center gap-1" role="group" aria-label="Choose rating">
      {[1, 2, 3, 4, 5].map((ratingValue) => (
        <button
          key={ratingValue}
          type="button"
          onClick={() => onChange(ratingValue)}
          disabled={disabled}
          className={cx(
            'grid h-11 w-11 place-items-center rounded-full transition-colors hover:bg-[var(--fill)] disabled:cursor-not-allowed disabled:opacity-60',
            ratingValue <= value ? 'text-[var(--ink)]' : 'text-[var(--line)]',
          )}
          aria-label={`Rate ${ratingValue} out of 5`}
          aria-pressed={ratingValue <= value}
        >
          <Star className="h-7 w-7" fill="currentColor" strokeWidth={0} aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}

function StarsDisplay({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          className={cx('h-4 w-4', value <= rating ? 'text-[var(--ink)]' : 'text-[var(--line)]')}
          fill="currentColor"
          strokeWidth={0}
          aria-hidden="true"
        />
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


function PlaceDetailView({
  place: inputPlace,
  areaBreadcrumb = null,
  returnLabel = null,
  returnHref = null,
  categoryBreadcrumb = null,
}: PlaceDetailViewProps) {
  const place = inputPlace ?? EMPTY_PLACE_DETAIL
  const { currentProfile, session: appSession } = useAppUser()
  const commentSkeleton = (
    <ul className="mt-4 grid gap-4" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <li key={`comment-skeleton-${index}`} className="flex items-start gap-3">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="mt-2 h-3.5 w-full" />
            <Skeleton className="mt-2 h-3.5 w-4/5" />
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
  const commentMenuRef = useRef<HTMLDivElement | null>(null)
  const { isPlaceSaved, saveFavorite, removeFavorite } = useSavedFavorites()
  const { showSystemMessage } = useSystemMessage()
  const userLocation = useKnownUserLocation()
  const [accessMode, setAccessMode] = useState<'commute' | 'parking' | 'access'>('commute')

  const placeOwnPhotos = uniqueList([
    place.imageUrl,
    place.thumbnailUrl,
    place.curatedImageUrl,
    ...(place.curatedImageUrls ?? []),
  ])
  const galleryPhotos = placeOwnPhotos.length > 0
    ? placeOwnPhotos.slice(0, 5)
    : getCuratedPlaceImages(place.name).slice(0, 5)
  const galleryStateKey = `${place.id}:${galleryPhotos.join('|')}`
  const [activeGalleryState, setActiveGalleryState] = useState({ key: galleryStateKey, index: 0 })
  const activeGalleryIndex =
    activeGalleryState.key === galleryStateKey
      ? Math.min(activeGalleryState.index, Math.max(galleryPhotos.length - 1, 0))
      : 0
  const approvedImageCount = place.approvedImageCount ?? 0
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
  const breadcrumbItems: Array<{ label: string; href?: string }> = categoryBreadcrumb
    ? [
        { label: categoryBreadcrumb.parentName, href: new URL(categoryBreadcrumb.parentItem).pathname },
        { label: categoryBreadcrumb.childName, href: new URL(categoryBreadcrumb.childItem).pathname },
      ]
    : returnHref && returnLabel
      ? [{ label: returnLabel, href: returnHref }]
      : [{ label: 'Places', href: '/places' }, ...(areaBreadcrumb && areaLink ? [{ label: areaBreadcrumb.areaName, href: areaLink }] : [])]
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
  const closePlaceConcern = () => {
    if (!isPlaceConcernSubmitting) {
      setIsPlaceConcernOpen(false)
      setPlaceConcernError('')
    }
  }
  const budgetAmount =
    place.budget_min != null && Number.isFinite(Number(place.budget_min)) ? Math.max(0, Math.round(Number(place.budget_min))) : null
  const sulitLabel = budgetAmount != null ? getSulitLevel(budgetAmount).label : ''
  const priceHeadline = budgetAmount == null ? '' : budgetAmount <= 0 ? 'Free' : `₱${budgetAmount.toLocaleString('en-PH')}`
  const groupPattern = /barkada|group|friends|catch/
  const barkadaFit = groupPattern.test(goodFor.join(' ').toLowerCase())
    ? 'Yes'
    : groupPattern.test((place.not_ideal_for ?? []).join(' ').toLowerCase())
      ? 'Not ideal'
      : 'Maybe'
  const bestTime = cleanString(place.best_time_to_visit)
  const placeTags = uniqueList([
    ...(place.tags ?? []).slice(0, 4).map((tag) => tag.name),
    cleanString(place.indoor_outdoor) ? titleCase(cleanString(place.indoor_outdoor)) : '',
  ])
  const placeLat = toCoordinate(place.coordinates?.lat) ?? toCoordinate(place.latitude) ?? toCoordinate(place.lat)
  const placeLng = toCoordinate(place.coordinates?.lng) ?? toCoordinate(place.longitude) ?? toCoordinate(place.lng)
  const placePosition = placeLat != null && placeLng != null && (placeLat !== 0 || placeLng !== 0) ? { lat: placeLat, lng: placeLng } : null
  const distanceFromUserKm = placePosition && userLocation ? distanceBetweenKm(userLocation, placePosition) : null
  const distanceKm =
    distanceFromUserKm ?? (typeof place.distanceKm === 'number' && Number.isFinite(place.distanceKm) ? place.distanceKm : null)
  const mapPoints: MapPoint[] = placePosition
    ? [
        { id: 'place', lat: placePosition.lat, lng: placePosition.lng, label: place.name, active: true },
        ...(userLocation && distanceFromUserKm != null && distanceFromUserKm <= 60
          ? [{ id: 'me', lat: userLocation.lat, lng: userLocation.lng, kind: 'me' as const }]
          : []),
      ]
    : []
  const accessibilityText = cleanString(place.accessibility_notes)
  const accessModes = [
    { value: 'commute' as const, label: place.commute_friendly ? 'Commute-friendly' : 'Commute', icon: Bus, text: commuteText },
    { value: 'parking' as const, label: 'Parking', icon: SquareParking, text: parkingText },
    ...(accessibilityText ? [{ value: 'access' as const, label: 'Accessibility', icon: Accessibility, text: accessibilityText }] : []),
  ]
  const activeAccessMode = accessModes.find((mode) => mode.value === accessMode) ?? accessModes[0]
  const fitItems = [
    { label: 'Good for groups', value: barkadaFit },
    { label: 'Category', value: categoryLabel },
    { label: 'Budget', value: priceBadgeLabel || 'Not available' },
    { label: 'Best time', value: bestTime },
    { label: 'Tambay time', value: cleanString(place.visit_duration) },
    { label: 'Crowd', value: cleanString(place.crowd_level) ? titleCase(cleanString(place.crowd_level)) : '' },
    { label: 'Hours', value: cleanString(place.hours) },
  ].filter((item) => item.value)
  const askAiQuestion = `Tell me about ${place.name} in ${locationLabel}. Is it good for a barkada gala, what should we try there, and when is the best time to go?`
  const planWithAiHref = `/plan-with-ai?q=${encodeURIComponent(`A barkada gala in ${locationLabel} with a stop at ${place.name}`)}`
  const commentActionClassName =
    'inline-flex min-h-[44px] items-center gap-1 text-[12px] font-semibold text-[var(--ink-2)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-60'
  const commentMenuItemClassName =
    'flex min-h-[44px] w-full items-center gap-2 px-3 text-left text-[13px] font-medium text-[var(--ink)] hover:bg-[var(--fill)] disabled:cursor-not-allowed disabled:text-[var(--ink-3)]'
  const heartIcon = <Heart aria-hidden="true" fill={isSaved ? 'currentColor' : 'none'} style={isSaved ? { color: 'var(--tara)' } : undefined} />

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

    const openReport = () => {
      setReportingCommentId(comment.id)
      setReportReason('')
      setReportDetails('')
      setReportError('')
      setOpenCommentMenuId(null)
    }

    const startEditing = () => {
      setEditingCommentId(comment.id)
      setEditCommentBody(comment.comment)
      setCommentError('')
      setOpenCommentMenuId(null)
    }

    return (
      <li key={comment.id} className={isReply ? 'ml-4 border-l border-[var(--line-2)] pl-3' : ''}>
        <div className={cx('flex items-start gap-3', isPending && 'opacity-75')}>
          {canOpenProfile ? (
            <button type="button" onClick={handleOpenCommentProfile} aria-label={`Open ${displayName}'s profile`} className="shrink-0 rounded-full">
              <MemberAvatar displayName={displayName} avatarUrl={avatarUrl} compact reply={isReply} />
            </button>
          ) : (
            <MemberAvatar displayName={displayName} avatarUrl={avatarUrl} compact reply={isReply} />
          )}

          <div className="min-w-0 flex-1">
            <div
              className={cx(
                'rounded-[var(--r-3)] border px-3 py-2.5',
                isFailed
                  ? 'border-[var(--bad)] bg-[var(--bad-soft)]'
                  : isDeleted
                    ? 'border-[var(--line-2)] bg-[var(--fill)]'
                    : 'border-[var(--line-2)] bg-[var(--surface)]',
              )}
            >
              <div className="flex items-start gap-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                  {canOpenProfile ? (
                    <button type="button" onClick={handleOpenCommentProfile} className="g-sm min-h-11 min-w-0 truncate text-left font-semibold hover:underline">
                      {displayName}
                    </button>
                  ) : (
                    <span className="g-sm min-w-0 truncate font-semibold">{displayName}</span>
                  )}
                  {isOwner ? <Tag>You</Tag> : null}
                  <span className="g-xs g-fnt">
                    {formatReviewDate(comment.updated_at || comment.created_at)}
                    {isEdited ? ' · edited' : null}
                  </span>
                  {isPending ? <Tag>Posting…</Tag> : null}
                </div>
                {!isDeleted && currentUserId ? (
                  <div className="relative -my-1 -mr-1 shrink-0" ref={isMenuOpen ? commentMenuRef : null}>
                    <button
                      type="button"
                      aria-label="Open comment actions"
                      aria-haspopup="menu"
                      aria-expanded={isMenuOpen}
                      onClick={() => setOpenCommentMenuId((currentId) => (currentId === comment.id ? null : comment.id))}
                      className="grid h-9 w-9 place-items-center rounded-full text-[var(--ink-3)] hover:bg-[var(--fill)] hover:text-[var(--ink)]"
                    >
                      <Ellipsis className="h-4 w-4" aria-hidden="true" />
                    </button>

                    {isMenuOpen ? (
                      <div role="menu" className="g-card absolute right-0 top-10 z-20 min-w-[12rem] overflow-hidden py-1" style={{ boxShadow: 'var(--sh-2)' }}>
                        {isOwner ? (
                          <>
                            <button type="button" role="menuitem" onClick={startEditing} className={commentMenuItemClassName}>
                              <Pencil className="h-4 w-4" aria-hidden="true" />
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
                              className={cx(commentMenuItemClassName, 'text-[var(--bad)]')}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                              {isMutating ? 'Deleting…' : 'Delete comment'}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={openReport}
                              disabled={isReportedByCurrentUser || isReportSubmitting}
                              className={commentMenuItemClassName}
                            >
                              <Flag className="h-4 w-4" aria-hidden="true" />
                              {isReportedByCurrentUser
                                ? 'Already reported'
                                : isReportSubmitting && reportingCommentId === comment.id
                                  ? 'Reporting…'
                                  : 'Report comment'}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => handleOpenUserReport(comment.user_id, comment.member_username, displayName)}
                              disabled={reportedUserIds.has(comment.user_id)}
                              className={commentMenuItemClassName}
                            >
                              <UserRound className="h-4 w-4" aria-hidden="true" />
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
                  <label htmlFor={`edit-comment-${comment.id}`} className="sr-only">
                    Edit comment
                  </label>
                  <textarea
                    id={`edit-comment-${comment.id}`}
                    value={editCommentBody}
                    onChange={(event) => setEditCommentBody(event.target.value)}
                    rows={3}
                    disabled={isMutating}
                    className="g-input"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant="ink" size="sm" onClick={() => void handleUpdateComment(comment.id)} disabled={isMutating}>
                      {isMutating ? 'Saving…' : 'Save'}
                    </Button>
                    <Button
                      variant="line"
                      size="sm"
                      onClick={() => {
                        setEditingCommentId(null)
                        setEditCommentBody('')
                      }}
                      disabled={isMutating}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className={cx('mt-1 whitespace-pre-line break-words text-[14px] leading-[1.5]', isDeleted && 'g-fnt italic')}>{comment.comment}</p>
              )}

              {isFailed && comment.local_error_message ? <p className="g-hint is-error mt-2">{comment.local_error_message}</p> : null}
            </div>

            {!isEditing ? (
              <div className="flex flex-wrap items-center gap-x-4 pl-1">
                {!isDeleted && !isReply && currentUserId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setReplyingToCommentId(replyingToCommentId === comment.id ? null : comment.id)
                      setReplyBody('')
                      setCommentError('')
                    }}
                    disabled={isMutating}
                    className={commentActionClassName}
                  >
                    <Reply className="h-3.5 w-3.5" aria-hidden="true" />
                    Reply
                  </button>
                ) : null}
                {!isDeleted && isOwner ? (
                  <button type="button" onClick={startEditing} disabled={isMutating} className={commentActionClassName}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    Edit
                  </button>
                ) : null}
                {!isDeleted && !isOwner && currentUserId ? (
                  isReportedByCurrentUser ? (
                    <span className="inline-flex min-h-[44px] items-center">
                      <Tag>
                        <Flag aria-hidden="true" />
                        Reported
                      </Tag>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={openReport}
                      disabled={isReportSubmitting && reportingCommentId === comment.id}
                      className={commentActionClassName}
                    >
                      <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                      {isReportSubmitting && reportingCommentId === comment.id ? 'Reporting…' : 'Report'}
                    </button>
                  )
                ) : null}
                {isFailed ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleRetryFailedComment(comment.id)}
                      disabled={isCommentSubmitting}
                      className={cx(commentActionClassName, 'text-[var(--ink)] underline underline-offset-2')}
                    >
                      Retry
                    </button>
                    <button type="button" onClick={() => handleDiscardFailedComment(comment.id)} disabled={isCommentSubmitting} className={commentActionClassName}>
                      Dismiss
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {replyingToCommentId === comment.id ? (
          <div className="ml-11 mt-1">
            <label htmlFor={`reply-${comment.id}`} className="sr-only">
              Reply to {displayName}
            </label>
            <textarea
              id={`reply-${comment.id}`}
              value={replyBody}
              onChange={(event) => setReplyBody(event.target.value)}
              rows={2}
              disabled={isMutating}
              placeholder="Add a reply…"
              className="g-input"
              style={{ minHeight: 72 }}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="ink" size="sm" onClick={() => void handleSubmitReply(comment.id)} disabled={isMutating}>
                {isMutating ? 'Replying…' : 'Reply'}
              </Button>
              <Button
                variant="line"
                size="sm"
                onClick={() => {
                  setReplyingToCommentId(null)
                  setReplyBody('')
                }}
                disabled={isMutating}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {comment.replies.length > 0 ? <ul className="mt-2 grid gap-2">{comment.replies.map((reply) => renderComment(reply, true))}</ul> : null}
      </li>
    )
  }

  const hasRatings = reviewCount > 0 && averageRating !== null

  const communitySection = !isCommunityPlaceReady ? (
    <section aria-labelledby="place-reviews">
      <SectionHead title={<span id="place-reviews">Reviews</span>} />
      <Empty title="Reviews open soon" description="Ratings and comments aren't ready for this spot yet." />
    </section>
  ) : (
    <>
      <section>
        <SectionHead
          title="Reviews"
          sub={hasRatings ? `★ ${averageRating.toFixed(1)} · ${formatRatingCount(reviewCount)} ${reviewCount === 1 ? 'rating' : 'ratings'}` : 'Wala pang ratings'}
        />
        <Panel>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="g-h1">{(hasRatings ? averageRating : 0).toFixed(1)}</span>
            <StarsDisplay rating={hasRatings ? Math.round(averageRating) : 0} />
            <span className="g-sm g-mut">
              ({formatRatingCount(reviewCount)} {reviewCount === 1 ? 'rating' : 'ratings'})
            </span>
          </div>
          <p className="g-sm g-mut mt-1">
            {hasRatings
              ? `Rated ${averageRating.toFixed(1)} by ${reviewCount} ${reviewCount === 1 ? 'person' : 'people'}.`
              : 'Be the first to help others decide.'}
          </p>
          <hr className="g-sep my-4" />

          {currentUserId && (!hasCurrentUserReview || isReviewEditing) ? (
            <div>
              <p className="g-label">Your rating</p>
              <div className="mt-1 overflow-x-auto">
                <StarRatingInput
                  value={reviewRating}
                  disabled={isReviewSubmitting || isReviewDeleting}
                  onChange={(value) => {
                    setReviewRating(value)
                    setReviewError('')
                  }}
                />
              </div>
              <p className="g-sm g-mut mt-1">
                {reviewRating > 0
                  ? `${reviewRating} star${reviewRating === 1 ? '' : 's'} · ${getRatingTone(reviewRating)}`
                  : 'Tap a star to rate this place.'}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="ink" size="sm" onClick={() => void handleSubmitReview()} disabled={isReviewSubmitting || isReviewDeleting || reviewRating < 1}>
                  {isReviewSubmitting ? 'Saving…' : 'Save rating'}
                </Button>
                {hasCurrentUserReview ? (
                  <Button
                    variant="text"
                    size="sm"
                    onClick={() => {
                      setIsReviewEditing(false)
                      setReviewRating(currentUserReview?.rating ?? 0)
                      setReviewError('')
                    }}
                    disabled={isReviewSubmitting || isReviewDeleting}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
            </div>
          ) : currentUserId && currentUserReview ? (
            <div>
              <p className="g-label">Your rating</p>
              <div className="mt-2">
                <StarsDisplay rating={currentUserReview.rating} />
              </div>
              <p className="g-sm g-mut mt-1">
                {currentUserReview.rating} star{currentUserReview.rating === 1 ? '' : 's'} · {getRatingTone(currentUserReview.rating)}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <Button
                  variant="text"
                  size="sm"
                  onClick={() => {
                    setIsReviewEditing(true)
                    setReviewRating(currentUserReview.rating)
                    setReviewError('')
                  }}
                  disabled={isReviewSubmitting || isReviewDeleting}
                >
                  Edit
                </Button>
                <Button variant="text" size="sm" className="text-[var(--bad)]" onClick={() => void handleDeleteReview()} disabled={isReviewSubmitting || isReviewDeleting}>
                  {isReviewDeleting ? 'Removing…' : 'Remove'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="g-sm g-mut">Sign in to leave a rating.</p>
              <Button variant="line" size="sm" onClick={() => guestAuth.open('community')}>
                Sign in
              </Button>
            </div>
          )}
          {reviewError ? <p className="g-hint is-error mt-2">{reviewError}</p> : null}
        </Panel>
      </section>

      <section>
        <SectionHead
          title="Comments"
          sub={
            isCommentsLoading
              ? 'Loading comments…'
              : visibleCommentCount === 0
                ? 'Wala pang comments'
                : `${visibleCommentCount} comment${visibleCommentCount === 1 ? '' : 's'}`
          }
        />
        {currentUserId ? (
          <div className="flex items-start gap-3">
            <MemberAvatar displayName={currentUserAvatarFallbackName} avatarUrl={currentUserAvatarUrl} compact />
            <div className="min-w-0 flex-1">
              <label htmlFor="place-comment" className="sr-only">
                Write a comment
              </label>
              <textarea
                id="place-comment"
                value={commentBody}
                onChange={(event) => setCommentBody(event.target.value)}
                onFocus={() => setIsCommentComposerFocused(true)}
                onBlur={() => setIsCommentComposerFocused(false)}
                rows={2}
                disabled={isCommentSubmitting}
                placeholder="Share a tip for the barkada…"
                className="g-input"
                style={{ minHeight: isCommentComposerFocused || commentBody.trim() ? 96 : 52 }}
              />
              <div className="mt-2 flex justify-end">
                <Button variant="ink" size="sm" onClick={() => void handleSubmitComment()} disabled={isCommentSubmitting || !commentBody.trim()}>
                  {isCommentSubmitting ? 'Posting…' : 'Comment'}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="g-panel flex flex-wrap items-center justify-between gap-3">
            <p className="g-sm g-mut min-w-0">Sign in to join the kwentuhan.</p>
            <Button variant="line" size="sm" onClick={() => guestAuth.open('community')}>
              Sign in
            </Button>
          </div>
        )}
        {commentError ? <p className="g-hint is-error mt-2">{commentError}</p> : null}

        {isCommentsLoading ? (
          commentSkeleton
        ) : visibleCommentCount === 0 ? (
          <Empty className="mt-4" title="Wala pang comments" description="Be the first to share something about this place." />
        ) : (
          <ul className="mt-4 grid gap-4">{comments.map((comment) => renderComment(comment))}</ul>
        )}

        <div className="mt-6">
          <Button variant="text" size="sm" onClick={handleOpenPlaceConcern}>
            <Flag aria-hidden="true" />
            Report a concern
          </Button>
        </div>
      </section>
    </>
  )

  return (
    <Page>
      <nav aria-label="Breadcrumb" className="-mt-2 mb-2">
        <ol className="g-sm g-mut flex flex-wrap items-center gap-x-1.5">
          <li className="inline-flex" aria-hidden="true">
            <ArrowLeft className="h-4 w-4" />
          </li>
          {breadcrumbItems.map((item, index) => (
            <li
              key={`${item.label}-${index}`}
              className={cx('items-center gap-1.5', index === breadcrumbItems.length - 1 ? 'inline-flex' : 'hidden md:inline-flex')}
            >
              {index > 0 ? (
                <span className="g-fnt hidden md:inline" aria-hidden="true">
                  /
                </span>
              ) : null}
              <InternalLink href={item.href ?? '/places'} className="inline-flex min-h-[44px] items-center hover:text-[var(--ink)]">
                {item.label}
              </InternalLink>
            </li>
          ))}
        </ol>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="g-h1">{place.name}</h1>
          <p className="g-mut mt-1.5">
            {categoryLabel} · {locationLabel} ·{' '}
            <b className="font-semibold text-[var(--ink)]">★ {headlineRating.toFixed(1)}</b> ({formatRatingCount(headlineReviewCount)}{' '}
            {headlineReviewCount === 1 ? 'rating' : 'ratings'})
          </p>
        </div>
        <Button variant="line" size="sm" onClick={() => void handleSharePlace()}>
          <Share2 aria-hidden="true" />
          Share
        </Button>
      </div>
      {shareError ? <p className="g-hint is-error mt-2">{shareError}</p> : null}
      {saveError ? <p className="g-hint is-error mt-2">{saveError}</p> : null}
      {contributionError && !isContributionOpen ? <p className="g-hint is-error mt-2">{contributionError}</p> : null}

      <div className="mt-4 md:mt-6">
        <PlacePhoto
          imageUrls={galleryPhotos}
          placeName={place.name}
          currentIndex={activeGalleryIndex}
          onSelect={(index) => setActiveGalleryState({ key: galleryStateKey, index })}
          showAddPhotoAction={approvedImageCount < 3}
          onContribute={handleOpenContribution}
        />
      </div>

      <div className="g-split mt-6 md:mt-8">
        <div className="min-w-0">
          {placeTags.length > 0 || priceBadgeLabel || place.status !== 'Unknown' ? (
            <div className="flex flex-wrap gap-2">
              {place.status === 'Open' ? <Tag tone="ok">Open now</Tag> : null}
              {place.status === 'Closed' ? <Tag tone="bad">Closed</Tag> : null}
              {priceBadgeLabel ? (
                <Tag>
                  <Wallet aria-hidden="true" />
                  {priceBadgeLabel}
                </Tag>
              ) : null}
              {placeTags.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </div>
          ) : null}

          <div className="g-stats mt-4">
            <div className="g-stat">
              <b className="truncate">{priceHeadline || formatPriceLevel(place.price_level) || '—'}</b>
              <span>{sulitLabel ? `Sulit · ${sulitLabel}` : 'Sulit'}</span>
            </div>
            <div className="g-stat">
              <b className="truncate">{barkadaFit}</b>
              <span>Barkada-fit</span>
            </div>
            <div className="g-stat" title={bestTime || undefined}>
              <b className={cx(bestTime.length > 8 ? 'line-clamp-2 !text-[15px] !leading-tight md:!text-[18px]' : 'truncate')}>{bestTime || '—'}</b>
              <span>Best time</span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
            <Button variant="soft" onClick={() => openFloatingChat(askAiQuestion)}>
              <Sparkles aria-hidden="true" />
              Ask AI about this place
            </Button>
            <Button variant="text" href={planWithAiHref}>
              Plan a gala here with AI
            </Button>
          </div>

          <section>
            <SectionHead title="About" />
            <p className="max-w-[640px] text-[15px] leading-relaxed">{quickTake}</p>
          </section>

          <section>
            <SectionHead title="Good for" />
            <GoodForList values={goodFor} />
          </section>

          <section>
            <SectionHead title="Getting there" sub={distanceKm != null ? `About ${distanceKm < 1 ? 'less than 1' : distanceKm.toFixed(1)} km${distanceFromUserKm != null ? ' from you' : ' away'}` : undefined} />
            <p className="g-sm whitespace-pre-line">{addressLabel}</p>
            <div className="g-modes mt-3" role="group" aria-label="Ways to get there">
              {accessModes.map((mode) => {
                const ModeIcon = mode.icon
                return (
                  <button
                    key={mode.value}
                    type="button"
                    className={cx('g-mode', mode.value === activeAccessMode.value && 'is-on')}
                    aria-pressed={mode.value === activeAccessMode.value}
                    onClick={() => setAccessMode(mode.value)}
                  >
                    <ModeIcon aria-hidden="true" />
                    {mode.label}
                  </button>
                )
              })}
            </div>
            <div className="g-leg">
              <span className="g-leg-rail" aria-hidden="true" />
              <p className="g-sm g-mut py-1">{activeAccessMode.text}</p>
            </div>
            {mapPoints.length > 0 ? <GtMap points={mapPoints} label={`Map of ${place.name}`} className="mt-2 md:h-[320px]" /> : null}
            <Button variant="line" size="sm" className="mt-3" onClick={openDirections} disabled={!directionsUrl}>
              <Navigation aria-hidden="true" />
              Directions
            </Button>
          </section>

          <section>
            <SectionHead title="Good to know" />
            <div className="grid gap-5">
              {faqItems.map((item) => (
                <div key={item.question}>
                  <h3 className="g-h3">{item.question}</h3>
                  <p className="g-sm g-mut mt-1 leading-relaxed">{item.answer}</p>
                </div>
              ))}
            </div>
            {canonicalPlaceLink && areaLink && areaBreadcrumb ? (
              <p className="g-sm g-mut mt-4">
                Explore more from{' '}
                <InternalLink href={areaLink} className="text-[var(--ink)] underline underline-offset-2">
                  {areaBreadcrumb.areaName}
                </InternalLink>{' '}
                or browse the full{' '}
                <InternalLink href="/places" className="text-[var(--ink)] underline underline-offset-2">
                  places hub
                </InternalLink>
                .
              </p>
            ) : null}
          </section>

          {communitySection}
        </div>

        <aside className="g-side" aria-label="Plan this place">
          <Panel>
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0">
                <span className="g-h2">{priceHeadline || 'Check price on site'}</span>
                {budgetAmount != null && budgetAmount > 0 ? <span className="g-mut"> /head</span> : null}
              </p>
              {place.status === 'Open' ? <Tag tone="ok">Open</Tag> : place.status === 'Closed' ? <Tag tone="bad">Closed</Tag> : null}
            </div>
            {sulitLabel ? (
              <p className="g-sulit">
                Sulit · <b>{sulitLabel}</b>
              </p>
            ) : null}
            <div className="mt-5 flex flex-col gap-2">
              <div className="hidden lg:block">
                <Button variant="tara" block onClick={handleAddToPlan}>
                  <Plus aria-hidden="true" />
                  Add to plan
                </Button>
              </div>
              <div className="flex items-start gap-2">
                <CheckInButton
                  className="min-w-0 flex-1"
                  placeId={place.id}
                  placeName={place.name}
                  session={appSession}
                  onGuest={() => guestAuth.open('community')}
                />
                <Button
                  variant="soft"
                  iconOnly
                  onClick={() => void handleSavePlace()}
                  disabled={isSaving}
                  aria-pressed={isSaved}
                  aria-label={isSaved ? `Remove ${place.name} from saved` : `Save ${place.name}`}
                >
                  {heartIcon}
                </Button>
              </div>
              <Button variant="line" block onClick={openDirections} disabled={!directionsUrl}>
                <Navigation aria-hidden="true" />
                Directions
              </Button>
            </div>
            <p className="g-xs g-mut mt-3 text-center">Free to plan. Share it with your barkada.</p>
          </Panel>

          <div className="g-panel">
            <h2 className="g-h3 mb-1">Barkada-fit</h2>
            <KeyValue items={fitItems} />
            {cleanString(place.budget_notes) ? <p className="g-xs g-mut mt-2 leading-relaxed">{cleanString(place.budget_notes)}</p> : null}
          </div>
        </aside>
      </div>

      <div className="h-20 lg:hidden" aria-hidden="true" />

      <div
        className="fixed inset-x-0 z-[5500] border-t border-[var(--line-2)] bg-[var(--surface)] px-4 py-2.5 lg:hidden"
        style={{ bottom: 'calc(var(--tabbar-h) + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="mx-auto flex max-w-[720px] items-center gap-3">
          <p className="min-w-0 flex-1 truncate">
            <span className="g-h3">{priceHeadline || 'Price on site'}</span>
            {budgetAmount != null && budgetAmount > 0 ? <span className="g-sm g-mut"> /head</span> : null}
          </p>
          <Button
            variant="soft"
            iconOnly
            onClick={() => void handleSavePlace()}
            disabled={isSaving}
            aria-pressed={isSaved}
            aria-label={isSaved ? `Remove ${place.name} from saved` : `Save ${place.name}`}
          >
            {heartIcon}
          </Button>
          <Button variant="ink" onClick={handleAddToPlan}>
            <Plus aria-hidden="true" />
            Add to plan
          </Button>
        </div>
      </div>

      {guestAuth.promptElement}
      <AddToGalaPlanModal isOpen={isAddToPlanOpen} placeId={place.id} placeName={place.name} onClose={() => setIsAddToPlanOpen(false)} />

      <Sheet open={Boolean(reportingCommentId)} onClose={closeReportCommentModal} title="Report comment" labelledBy="report-comment-title">
        <p className="g-sm g-mut">Why are you reporting this comment?</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {commentReportReasons.map((reason) => (
            <Chip
              key={reason.value}
              on={reportReason === reason.value}
              onClick={() => {
                setReportReason(reason.value)
                setReportError('')
              }}
              disabled={isReportSubmitting}
            >
              {reason.label}
            </Chip>
          ))}
        </div>
        <div className="g-field mt-4">
          <label htmlFor="report-comment-details">
            Extra details <span className="g-fnt font-normal">Optional</span>
          </label>
          <textarea
            id="report-comment-details"
            value={reportDetails}
            onChange={(event) => setReportDetails(event.target.value.slice(0, 500))}
            disabled={isReportSubmitting}
            rows={3}
            placeholder="Add any context that helps us review this."
            className="g-input"
          />
          <span className="g-hint text-right">{reportDetails.length}/500</span>
        </div>
        {reportError ? <p className="g-hint is-error mt-2">{reportError}</p> : null}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="line" onClick={closeReportCommentModal} disabled={isReportSubmitting}>
            <X aria-hidden="true" />
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (reportingCommentId) void handleReportComment(reportingCommentId)
            }}
            disabled={isReportSubmitting || !reportReason}
          >
            <Flag aria-hidden="true" />
            {isReportSubmitting ? 'Submitting…' : 'Submit report'}
          </Button>
        </div>
      </Sheet>

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

      <Sheet open={isPlaceConcernOpen} onClose={closePlaceConcern} title="Report a concern" labelledBy="report-place-concern-title">
        <p className="g-sm g-mut">Send this to the GalaTayo team for review.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {placeConcernReasons.map((reason) => (
            <Chip
              key={reason.value}
              on={placeConcernReason === reason.value}
              onClick={() => {
                setPlaceConcernReason(reason.value)
                setPlaceConcernError('')
              }}
              disabled={isPlaceConcernSubmitting}
            >
              {reason.label}
            </Chip>
          ))}
        </div>
        <div className="g-field mt-4">
          <label htmlFor="report-place-details">
            Extra details <span className="g-fnt font-normal">Optional</span>
          </label>
          <textarea
            id="report-place-details"
            value={placeConcernDetails}
            onChange={(event) => setPlaceConcernDetails(event.target.value.slice(0, 1000))}
            disabled={isPlaceConcernSubmitting}
            rows={3}
            placeholder="Tell us what looks wrong or what should be reviewed."
            className="g-input"
          />
          <span className="g-hint text-right">{placeConcernDetails.length}/1000</span>
        </div>
        {placeConcernError ? <p className="g-hint is-error mt-2">{placeConcernError}</p> : null}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="line" onClick={closePlaceConcern} disabled={isPlaceConcernSubmitting}>
            <X aria-hidden="true" />
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void handleSubmitPlaceConcern()} disabled={isPlaceConcernSubmitting || !placeConcernReason}>
            <Flag aria-hidden="true" />
            {isPlaceConcernSubmitting ? 'Submitting…' : 'Submit report'}
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={isContributionOpen}
        onClose={() => {
          if (!isContributionSubmitting) setIsContributionOpen(false)
        }}
        title="Add a photo"
        labelledBy="contribute-photo-title"
      >
        <p className="g-sm g-mut">We review every photo before it shows up publicly.</p>
        <div className="g-field mt-4">
          <label htmlFor="contribute-photo-file">Image file</label>
          <input
            id="contribute-photo-file"
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
            disabled={isContributionSubmitting}
            onChange={(event) => {
              setContributionFile(event.target.files?.[0] ?? null)
              setContributionError('')
            }}
            className="g-sm w-full file:mr-3 file:h-9 file:cursor-pointer file:rounded-full file:border-0 file:bg-[var(--ink)] file:px-4 file:font-semibold file:text-[var(--on-ink)] disabled:cursor-not-allowed disabled:opacity-60"
          />
          <span className="g-hint">JPEG, PNG, or WebP up to 5MB.</span>
        </div>
        <div className="g-field mt-4">
          <label htmlFor="contribute-photo-source">
            Source URL <span className="g-fnt font-normal">Optional</span>
          </label>
          <input
            id="contribute-photo-source"
            type="url"
            value={contributionSourceUrl}
            onChange={(event) => setContributionSourceUrl(event.target.value.slice(0, 500))}
            disabled={isContributionSubmitting}
            placeholder="https://…"
            className="g-input"
          />
        </div>
        <div className="g-field mt-4">
          <label htmlFor="contribute-photo-note">
            Note for the reviewer <span className="g-fnt font-normal">Optional</span>
          </label>
          <textarea
            id="contribute-photo-note"
            value={contributionNote}
            onChange={(event) => setContributionNote(event.target.value.slice(0, 1000))}
            disabled={isContributionSubmitting}
            rows={3}
            placeholder="Anything the reviewer should know?"
            className="g-input"
          />
        </div>
        {contributionError ? <p className="g-hint is-error mt-2">{contributionError}</p> : null}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="line" onClick={() => setIsContributionOpen(false)} disabled={isContributionSubmitting}>
            <X aria-hidden="true" />
            Cancel
          </Button>
          <Button variant="ink" onClick={() => void handleSubmitContribution()} disabled={isContributionSubmitting}>
            <Check aria-hidden="true" />
            {isContributionSubmitting ? 'Submitting…' : 'Submit'}
          </Button>
        </div>
      </Sheet>
    </Page>
  )
}

export default PlaceDetailView
