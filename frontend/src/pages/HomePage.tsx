import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import SearchBar from '../components/SearchBar'
import PlaceCard, { type PlaceCardData, type PlaceCategoryMeta, type PlaceTagMeta } from '../components/PlaceCard'
import AppHeader from '../components/AppHeader'
import MapView from '../components/MapView'
import GuestLimitModal from '../components/GuestLimitModal'
import GoogleSignInButton from '../components/GoogleSignInButton'
import { supabase } from '../supabase'
import { navigateToPlace } from '../utils/navigation'

type IconProps = {
  className?: string
}

function PinIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
      <path d="M12 21s6-5.7 6-11a6 6 0 1 0-12 0c0 5.3 6 11 6 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  )
}

type BackendCategory = {
  id: string
  name: string
  description: string
  searchTerms: string[]
}

type BackendArea = {
  id: string
  name: string
  type: 'all' | 'city' | 'municipality'
}

const askAiLoadingMessages = [
  'Planning your gala...',
  'Checking the best options...',
  'Making it easier to decide...',
]

function FilterIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </svg>
  )
}

function CheckIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={className}>
      <path d="m5 13 4 4L19 7" />
    </svg>
  )
}

function CategoryIcon({
  className = 'h-3.5 w-3.5',
  categoryId,
}: IconProps & { categoryId: string }) {
  const iconClass = `${className} text-[var(--accent-deep)]`

  if (categoryId === 'all') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={iconClass}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 3.5v17" />
        <path d="M3.5 12h17" />
      </svg>
    )
  }

  if (['kainan', 'cafe'].includes(categoryId)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={iconClass}>
        <path d="M5 8h10v4a5 5 0 0 1-5 5h0a5 5 0 0 1-5-5V8Z" />
        <path d="M15 9h2.2a2.3 2.3 0 0 1 0 4.6H15" />
      </svg>
    )
  }

  if (categoryId === 'mall') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={iconClass}>
        <path d="M5 8h14l-1.1 10.5H6.1L5 8Z" />
        <path d="M9 8a3 3 0 0 1 6 0" />
      </svg>
    )
  }

  if (['parke', 'chill'].includes(categoryId)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={iconClass}>
        <path d="M12 21V11" />
        <path d="M12 11c0-3.5 2.2-6 5.5-6 0 3.5-2.2 6-5.5 6Z" />
        <path d="M12 14c0-3.5-2.2-6-5.5-6 0 3.5 2.2 6 5.5 6Z" />
      </svg>
    )
  }

  if (['nightlife', 'date', 'barkada'].includes(categoryId)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={iconClass}>
        <path d="M9 3v8.2a3 3 0 1 1-2 0V3" />
        <path d="M15 3h5v2.5h-3V9a3 3 0 1 1-2 0V3Z" />
      </svg>
    )
  }

  if (['heritage', 'museum', 'tourist'].includes(categoryId)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={iconClass}>
        <path d="M3 9h18" />
        <path d="M5.5 9v8.5M9.5 9v8.5M14.5 9v8.5M18.5 9v8.5" />
        <path d="M2.5 20h19" />
        <path d="M12 3 3 7.5h18L12 3Z" />
      </svg>
    )
  }

  if (['study', 'family'].includes(categoryId)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={iconClass}>
        <rect x="4" y="5" width="16" height="14" rx="1.8" />
        <path d="M8 9h8M8 13h8" />
      </svg>
    )
  }

  if (['arcade', 'cinema'].includes(categoryId)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={iconClass}>
        <path d="M12 5v14M5 12h14" />
        <rect x="4" y="4" width="16" height="16" rx="3" />
      </svg>
    )
  }

  return <PinIcon className={iconClass} />
}

function AreaIcon({ className = 'h-3.5 w-3.5' }: IconProps & { areaType: 'all' | 'city' | 'municipality' }) {
  const iconClass = `${className} text-[var(--accent-deep)]`
  return <PinIcon className={iconClass} />
}

function BudgetIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={`${className} text-[var(--accent-deep)]`}>
      <rect x="3.5" y="6.5" width="17" height="11" rx="2.2" />
      <circle cx="12" cy="12" r="2.3" />
      <path d="M6.5 9.2v5.6" />
      <path d="M17.5 9.2v5.6" />
    </svg>
  )
}

type CategoryChip = {
  id: string
  name: string
}

type AreaChip = {
  id: string
  name: string
  type: 'all' | 'city' | 'municipality'
}

type BudgetValue = 'under-500' | '500-1000' | '1000-2000' | '2000-plus'

type BudgetOption = {
  value: BudgetValue
  label: string
}

type SearchMode = 'places' | 'ask-ai'

type AskAiUsageStatus = {
  usageType: 'ask_ai_total' | 'live_search'
  allowed: boolean
  limit: number
  used: number
  remaining: number
  resetAt: string
  message?: string
}

type AskAiSource = {
  title: string
  url: string
}

type AskAiUsageSummary = {
  askAi: AskAiUsageStatus
  liveSearch: AskAiUsageStatus
}

type AskAiAnswerResponse = {
  mode: 'ask_ai'
  answer: string
  usedLiveSearch: boolean
  sources: AskAiSource[]
  usage: AskAiUsageSummary
  message?: string
}

type BackendSearchPlace = {
  id?: string | null
  slug?: string | null
  name?: string | null
  description?: string | null
  area?: string | null
  city?: string | null
  location?: string | null
  category?: string | null
  latitude?: number | string | null
  longitude?: number | string | null
  imageUrl?: string | null
  curatedImageUrls?: string[] | null
  address?: string | null
  budget?: string | null
  budgetRange?: string | null
  reason?: string | null
  reviewCount?: number | string | null
  categories?: PlaceCategoryMeta[] | null
  tags?: PlaceTagMeta[] | null
  matchedCategories?: PlaceCategoryMeta[] | null
  matchedTags?: PlaceTagMeta[] | null
  place_history?: string | null
  best_time_to_visit?: string | null
  visit_duration?: string | null
  good_for?: string[] | null
  not_ideal_for?: string[] | null
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
  verification_sources?: string[] | null
  last_verified_at?: string | null
  website_url?: string | null
  google_maps_url?: string | null
}

const fallbackCategories = [
  { id: 'kainan', name: 'Kainan' },
  { id: 'cafe', name: 'Cafe' },
  { id: 'mall', name: 'Mall' },
  { id: 'parke', name: 'Parke' },
  { id: 'museum', name: 'Museum' },
  { id: 'heritage', name: 'Heritage' },
  { id: 'tourist', name: 'Tourist' },
  { id: 'date', name: 'Date' },
  { id: 'barkada', name: 'Barkada' },
  { id: 'family', name: 'Family' },
  { id: 'study', name: 'Study' },
  { id: 'chill', name: 'Chill' },
  { id: 'nightlife', name: 'Nightlife' },
  { id: 'arcade', name: 'Arcade' },
  { id: 'cinema', name: 'Cinema' },
]

const fallbackAreas: AreaChip[] = [
  { id: 'all', name: 'All areas', type: 'all' },
  { id: 'caloocan', name: 'Caloocan', type: 'city' },
  { id: 'las-pinas', name: 'Las Piñas', type: 'city' },
  { id: 'makati', name: 'Makati', type: 'city' },
  { id: 'malabon', name: 'Malabon', type: 'city' },
  { id: 'mandaluyong', name: 'Mandaluyong', type: 'city' },
  { id: 'manila', name: 'Manila', type: 'city' },
  { id: 'marikina', name: 'Marikina', type: 'city' },
  { id: 'muntinlupa', name: 'Muntinlupa', type: 'city' },
  { id: 'navotas', name: 'Navotas', type: 'city' },
  { id: 'paranaque', name: 'Parañaque', type: 'city' },
  { id: 'pasay', name: 'Pasay', type: 'city' },
  { id: 'pasig', name: 'Pasig', type: 'city' },
  { id: 'quezon-city', name: 'Quezon City', type: 'city' },
  { id: 'san-juan', name: 'San Juan', type: 'city' },
  { id: 'taguig', name: 'Taguig', type: 'city' },
  { id: 'valenzuela', name: 'Valenzuela', type: 'city' },
  { id: 'pateros', name: 'Pateros', type: 'municipality' },
]

const budgetOptions: BudgetOption[] = [
  { value: 'under-500', label: 'Under ₱500' },
  { value: '500-1000', label: '₱500–₱1,000' },
  { value: '1000-2000', label: '₱1,000–₱2,000' },
  { value: '2000-plus', label: '₱2,000+' },
]

const animatedSearchPrompts = [
  'Date sa BGC under 1K',
  'Chill Cafe sa QC na Tahimik',
  'Food Trip sa Makati na Mura',
  'Study Place near Taft na may Wi-Fi',
  'Museum Date sa Manila',
]

async function getSearchRequestHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const accessToken = session?.access_token

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }

  return headers
}

function parseCoordinate(value: number | string | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsedValue = Number(value)

    if (Number.isFinite(parsedValue)) {
      return parsedValue
    }
  }

  return null
}

function mapBackendPlaceToCard(place: BackendSearchPlace): PlaceCardData | null {
  const lat = parseCoordinate(place.latitude)
  const lng = parseCoordinate(place.longitude)
  const name = place.name?.trim()

  if (
    !name ||
    lat === null ||
    lng === null ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null
  }

  const area = place.location || place.address || place.city || place.area || 'Metro Manila'
  const reviewCount =
    place.reviewCount === null || place.reviewCount === undefined ? undefined : String(place.reviewCount)
  const curatedImageUrls = Array.isArray(place.curatedImageUrls)
    ? place.curatedImageUrls.filter((imageUrl): imageUrl is string => Boolean(imageUrl?.trim()))
    : []
  const categories = Array.isArray(place.categories) ? place.categories : []
  const tags = Array.isArray(place.tags) ? place.tags : []
  const matchedCategories = Array.isArray(place.matchedCategories) ? place.matchedCategories : []
  const matchedTags = Array.isArray(place.matchedTags) ? place.matchedTags : []
  const goodFor = Array.isArray(place.good_for) ? place.good_for.filter((item): item is string => Boolean(item?.trim())) : []
  const notIdealFor = Array.isArray(place.not_ideal_for) ? place.not_ideal_for.filter((item): item is string => Boolean(item?.trim())) : []

  return {
    id: String(place.id || place.slug || name),
    slug: place.slug || undefined,
    name,
    category: place.category || 'Place',
    area,
    reviewCount,
    status: 'Unknown',
    reason: place.reason || place.description || place.address || 'Real place result from GalaTayo search.',
    description: place.description || null,
    badge: place.category || 'Place',
    imageUrl: place.imageUrl || null,
    curatedImageUrls,
    categories,
    tags,
    matchedCategories,
    matchedTags,
    place_history: place.place_history || null,
    best_time_to_visit: place.best_time_to_visit || null,
    visit_duration: place.visit_duration || null,
    good_for: goodFor,
    not_ideal_for: notIdealFor,
    crowd_level: place.crowd_level || null,
    indoor_outdoor: place.indoor_outdoor || null,
    weather_fit: place.weather_fit || null,
    parking_info: place.parking_info || null,
    accessibility_notes: place.accessibility_notes || null,
    decision_reason: place.decision_reason || null,
    commute_friendly: place.commute_friendly ?? null,
    commute_access: place.commute_access || null,
    nearby_context: place.nearby_context || null,
    budget_notes: place.budget_notes || null,
    verification_status: place.verification_status || null,
    verification_notes: place.verification_notes || null,
    verification_sources: place.verification_sources ?? [],
    last_verified_at: place.last_verified_at || null,
    website_url: place.website_url || null,
    googleMapsUrl: place.google_maps_url || null,
    entranceFee: place.budget_notes || place.budget || place.budgetRange || undefined,
    website: place.website_url || undefined,
    coordinates: {
      lat,
      lng,
    },
  }
}

function SearchEmptyState({ hasSearched }: { hasSearched: boolean }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--line)] bg-white px-4 py-6 text-center">
      <p className="text-sm font-semibold text-slate-900">
        {hasSearched ? 'No places found for this search.' : 'Search for places around Metro Manila.'}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
        {hasSearched
          ? 'Try changing your keyword, city, category, or budget.'
          : 'Start by searching for a place or choosing filters.'}
      </p>
    </div>
  )
}

function SearchModeTabs({
  selectedMode,
  onModeChange,
  className = '',
}: {
  selectedMode: SearchMode
  onModeChange: (mode: SearchMode) => void
  className?: string
}) {
  const modes: { id: SearchMode; label: string }[] = [
    { id: 'places', label: 'Search Places' },
    { id: 'ask-ai', label: 'Ask AI' },
  ]

  return (
    <div
      className={`grid grid-cols-2 gap-1 rounded-lg border border-[var(--line)] bg-[var(--chip)] p-1 ${className}`}
      role="tablist"
      aria-label="Search mode"
    >
      {modes.map((mode) => {
        const isSelected = selectedMode === mode.id

        return (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onModeChange(mode.id)}
            className={`rounded-md px-3 py-2 text-xs font-semibold transition ${
              isSelected
                ? 'bg-white text-[var(--accent-deep)] shadow-[0_6px_14px_rgba(47,116,232,0.12)]'
                : 'text-[var(--muted)] hover:bg-white/70 hover:text-[var(--accent-deep)]'
            }`}
          >
            {mode.label}
          </button>
        )
      })}
    </div>
  )
}

function formatResetAt(resetAt: string) {
  const resetDate = new Date(resetAt)

  if (Number.isNaN(resetDate.getTime())) {
    return resetAt
  }

  return resetDate.toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function isAskAiUsageStatus(value: unknown): value is AskAiUsageStatus {
  if (!value || typeof value !== 'object') {
    return false
  }

  const usage = value as Partial<AskAiUsageStatus>

  return (
    (usage.usageType === 'ask_ai_total' || usage.usageType === 'live_search') &&
    typeof usage.allowed === 'boolean' &&
    typeof usage.limit === 'number' &&
    typeof usage.used === 'number' &&
    typeof usage.remaining === 'number' &&
    typeof usage.resetAt === 'string'
  )
}

function getAskAiSourceList(value: unknown): AskAiSource[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((source) => {
      if (!source || typeof source !== 'object') {
        return null
      }

      const candidate = source as Partial<AskAiSource>
      const url = typeof candidate.url === 'string' ? candidate.url : null

      if (!url) {
        return null
      }

      return {
        title: typeof candidate.title === 'string' && candidate.title.trim() ? candidate.title : url,
        url,
      }
    })
    .filter((source): source is AskAiSource => Boolean(source))
}

function AskAiPlaceholder({
  usageStatus,
  liveSearchUsageStatus,
  question,
  answer,
  sources,
  usedLiveSearch,
  isSubmitting,
  answerError,
  onQuestionChange,
  onSubmit,
  className = '',
}: {
  usageStatus: AskAiUsageStatus
  liveSearchUsageStatus: AskAiUsageStatus | null
  question: string
  answer: string
  sources: AskAiSource[]
  usedLiveSearch: boolean
  isSubmitting: boolean
  answerError: string | null
  onQuestionChange: (question: string) => void
  onSubmit: () => void
  className?: string
}) {
  const isLimitReached = !usageStatus.allowed || usageStatus.remaining <= 0
  const isLiveSearchUsedUp = Boolean(liveSearchUsageStatus && liveSearchUsageStatus.remaining <= 0)
  const canSubmit = !isSubmitting && !isLimitReached && question.trim().length > 0
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0)
  const loadingMessage = askAiLoadingMessages[loadingMessageIndex]

  useEffect(() => {
    if (!isSubmitting) {
      setLoadingMessageIndex(0)
      return
    }

    const intervalId = window.setInterval(() => {
      setLoadingMessageIndex((index) => (index + 1) % askAiLoadingMessages.length)
    }, 1800)

    return () => window.clearInterval(intervalId)
  }, [isSubmitting])

  return (
    <section className={`min-h-[280px] bg-[linear-gradient(180deg,#f8fbff,#eef5ff)] px-4 py-6 ${className}`}>
      <div className="mx-auto grid w-full max-w-[720px] gap-4">
        <div className="rounded-lg border border-[var(--line)] bg-white px-4 py-4 shadow-[0_14px_30px_rgba(28,77,160,0.07)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">
              Ask AI uses left today: {usageStatus.remaining}/{usageStatus.limit}
            </p>
            {usedLiveSearch && answer ? (
              <span className="rounded-full border border-[var(--accent)] bg-[var(--accent-wash)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent-deep)]">
                Used Live Search
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
            {isLiveSearchUsedUp
              ? 'Live Search checks are used up today. Ask AI can still help with general planning.'
              : 'Live Search available for current info.'}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
            Resets at: {formatResetAt(usageStatus.resetAt)}
          </p>
        </div>

        <div className="rounded-lg border border-[var(--line)] bg-white p-4 shadow-[0_14px_30px_rgba(28,77,160,0.07)]">
          <label className="text-sm font-semibold text-slate-900" htmlFor="ask-ai-question">
            Ask AI
          </label>
          <textarea
            id="ask-ai-question"
            value={question}
            onChange={(event) => onQuestionChange(event.target.value)}
            disabled={isSubmitting || isLimitReached}
            rows={4}
            placeholder="Plan a chill date in Makati"
            className="mt-2 min-h-[112px] w-full resize-y rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm leading-relaxed text-slate-900 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(47,116,232,0.12)] disabled:bg-slate-50 disabled:text-slate-400"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSubmit}
              className="rounded-full border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(47,116,232,0.22)] transition hover:-translate-y-[1px] hover:bg-white hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none disabled:hover:translate-y-0"
            >
              {isSubmitting ? 'Asking...' : 'Ask AI'}
            </button>
            {isSubmitting ? (
              <span className="text-xs font-semibold text-[var(--accent-deep)]">{loadingMessage}</span>
            ) : null}
            {isLimitReached ? (
              <span className="text-xs font-medium text-red-600">Daily Ask AI limit reached.</span>
            ) : null}
          </div>
          {answerError ? (
            <p className="mt-3 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
              {answerError}
            </p>
          ) : null}
        </div>

        {answer ? (
          <div className="rounded-lg border border-[var(--line)] bg-white p-4 shadow-[0_14px_30px_rgba(28,77,160,0.07)]">
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-800">{answer}</p>
            {usedLiveSearch ? (
              <p className="mt-3 text-xs font-semibold text-[var(--accent-deep)]">This answer used Live Search.</p>
            ) : null}
            {sources.length > 0 ? (
              <div className="mt-3 grid gap-1.5">
                {sources.map((source) => (
                  <a
                    key={source.url}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-xs font-medium text-[var(--accent-deep)] underline-offset-2 hover:underline"
                  >
                    {source.title || source.url}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function AskAiSignInRequired({ className = '' }: { className?: string }) {
  return (
    <section className={`flex min-h-[280px] items-center justify-center bg-[linear-gradient(180deg,#f8fbff,#eef5ff)] px-4 py-8 ${className}`}>
      <div className="w-full max-w-[520px] rounded-lg border border-[var(--line)] bg-white px-5 py-7 text-center shadow-[0_14px_30px_rgba(28,77,160,0.07)]">
        <p className="text-base font-semibold text-slate-900">Sign in to use Ask AI.</p>
        <p className="mx-auto mt-2 max-w-[380px] text-sm leading-relaxed text-[var(--muted)]">
          Ask AI is for registered GalaTayo users. Search Places is still available without signing in.
        </p>
        <GoogleSignInButton className="mt-4 inline-flex" />
      </div>
    </section>
  )
}

function AskAiModePanel({
  isRegistered,
  isSessionLoading,
  usageStatus,
  liveSearchUsageStatus,
  isUsageLoading,
  usageError,
  question,
  answer,
  sources,
  usedLiveSearch,
  isSubmitting,
  answerError,
  onRetryUsage,
  onQuestionChange,
  onSubmit,
  className = '',
}: {
  isRegistered: boolean
  isSessionLoading: boolean
  usageStatus: AskAiUsageStatus | null
  liveSearchUsageStatus: AskAiUsageStatus | null
  isUsageLoading: boolean
  usageError: string | null
  question: string
  answer: string
  sources: AskAiSource[]
  usedLiveSearch: boolean
  isSubmitting: boolean
  answerError: string | null
  onRetryUsage: () => void
  onQuestionChange: (question: string) => void
  onSubmit: () => void
  className?: string
}) {
  if (isSessionLoading) {
    return (
      <section className={`flex min-h-[280px] items-center justify-center bg-[linear-gradient(180deg,#f8fbff,#eef5ff)] px-4 py-8 ${className}`}>
        <div className="rounded-lg border border-[var(--line)] bg-white px-5 py-4 text-sm font-medium text-[var(--muted)] shadow-[0_14px_30px_rgba(28,77,160,0.07)]">
          Checking account...
        </div>
      </section>
    )
  }

  if (!isRegistered) {
    return <AskAiSignInRequired className={className} />
  }

  if (isUsageLoading) {
    return (
      <section className={`flex min-h-[280px] items-center justify-center bg-[linear-gradient(180deg,#f8fbff,#eef5ff)] px-4 py-8 ${className}`}>
        <div className="rounded-lg border border-[var(--line)] bg-white px-5 py-4 text-sm font-medium text-[var(--muted)] shadow-[0_14px_30px_rgba(28,77,160,0.07)]">
          Checking Ask AI usage...
        </div>
      </section>
    )
  }

  if (usageError || !usageStatus) {
    return (
      <section className={`flex min-h-[280px] items-center justify-center bg-[linear-gradient(180deg,#f8fbff,#eef5ff)] px-4 py-8 ${className}`}>
        <div className="w-full max-w-[520px] rounded-lg border border-[var(--line)] bg-white px-5 py-7 text-center shadow-[0_14px_30px_rgba(28,77,160,0.07)]">
          <p className="text-base font-semibold text-slate-900">Ask AI usage is unavailable.</p>
          <p className="mx-auto mt-2 max-w-[380px] text-sm leading-relaxed text-[var(--muted)]">
            {usageError ?? 'Try checking your daily Ask AI status again.'}
          </p>
          <button
            type="button"
            onClick={onRetryUsage}
            className="mt-4 rounded-full border border-[var(--accent)] bg-white px-4 py-2 text-sm font-semibold text-[var(--accent-deep)] transition hover:bg-[var(--accent-wash)]"
          >
            Retry
          </button>
        </div>
      </section>
    )
  }

  return (
    <AskAiPlaceholder
      usageStatus={usageStatus}
      liveSearchUsageStatus={liveSearchUsageStatus}
      question={question}
      answer={answer}
      sources={sources}
      usedLiveSearch={usedLiveSearch}
      isSubmitting={isSubmitting}
      answerError={answerError}
      onQuestionChange={onQuestionChange}
      onSubmit={onSubmit}
      className={className}
    />
  )
}

function HomePage() {
  const [selectedMode, setSelectedMode] = useState<SearchMode>('places')
  const [session, setSession] = useState<Session | null>(null)
  const [isSessionLoading, setIsSessionLoading] = useState(true)
  const [askAiUsageStatus, setAskAiUsageStatus] = useState<AskAiUsageStatus | null>(null)
  const [liveSearchUsageStatus, setLiveSearchUsageStatus] = useState<AskAiUsageStatus | null>(null)
  const [isAskAiUsageLoading, setIsAskAiUsageLoading] = useState(false)
  const [askAiUsageError, setAskAiUsageError] = useState<string | null>(null)
  const [askAiUsageRefreshSignal, setAskAiUsageRefreshSignal] = useState(0)
  const [askAiQuestion, setAskAiQuestion] = useState('')
  const [askAiAnswer, setAskAiAnswer] = useState('')
  const [askAiSources, setAskAiSources] = useState<AskAiSource[]>([])
  const [askAiUsedLiveSearch, setAskAiUsedLiveSearch] = useState(false)
  const [isAskAiSubmitting, setIsAskAiSubmitting] = useState(false)
  const [askAiAnswerError, setAskAiAnswerError] = useState<string | null>(null)
  const [categories, setCategories] = useState(fallbackCategories)
  const [areas, setAreas] = useState<AreaChip[]>(fallbackAreas)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedArea, setSelectedArea] = useState<string | null>(null)
  const [selectedBudget, setSelectedBudget] = useState<BudgetValue | null>(null)
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [promptLogin, setPromptLogin] = useState(false)
  const [lastSearchQuery, setLastSearchQuery] = useState('')
  const [searchId, setSearchId] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<PlaceCardData[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [clearSearchSignal, setClearSearchSignal] = useState(0)
  const searchRequestVersion = useRef(0)
  const filteredAdvancedCategories = useMemo(() => categories, [categories])
  const selectedCategoryName = useMemo(
    () =>
      selectedCategory
        ? categories.find((category) => category.id === selectedCategory)?.name ?? null
        : null,
    [categories, selectedCategory]
  )
  const selectedAreaName = useMemo(
    () => (selectedArea ? areas.find((area) => area.id === selectedArea)?.name ?? null : null),
    [areas, selectedArea]
  )
  const selectedBudgetLabel = useMemo(
    () => (selectedBudget ? budgetOptions.find((budget) => budget.value === selectedBudget)?.label ?? null : null),
    [selectedBudget]
  )
  const selectedFilterLabels = [selectedCategoryName, selectedAreaName, selectedBudgetLabel].filter(Boolean)
  const hasActiveFilters = selectedFilterLabels.length > 0
  const visiblePlaces = hasSearched ? searchResults : []
  const isRegisteredUser = Boolean(session?.user)
  const handleRetryAskAiUsage = () => {
    setAskAiUsageRefreshSignal((signal) => signal + 1)
  }

  const handleAskAiSubmit = async () => {
    const question = askAiQuestion.trim()

    if (!question || isAskAiSubmitting || !session?.access_token) {
      return
    }

    try {
      setIsAskAiSubmitting(true)
      setAskAiAnswerError(null)

      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
      const askAiEndpoint = apiBaseUrl ? `${apiBaseUrl}/ask-ai` : '/api/ask-ai'
      const response = await fetch(askAiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ question }),
      })
      const data = (await response.json()) as Partial<AskAiAnswerResponse> & {
        error?: string
        message?: string
      }

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Ask AI could not answer right now.')
      }

      if (
        data.mode !== 'ask_ai' ||
        typeof data.answer !== 'string' ||
        typeof data.usedLiveSearch !== 'boolean' ||
        !data.usage ||
        !isAskAiUsageStatus(data.usage.askAi) ||
        !isAskAiUsageStatus(data.usage.liveSearch)
      ) {
        throw new Error('Ask AI response was incomplete.')
      }

      setAskAiAnswer(data.answer)
      setAskAiUsedLiveSearch(data.usedLiveSearch)
      setAskAiSources(getAskAiSourceList(data.sources))
      setAskAiUsageStatus(data.usage.askAi)
      setLiveSearchUsageStatus(data.usage.liveSearch)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ask AI could not answer right now.'
      setAskAiAnswerError(message)
    } finally {
      setIsAskAiSubmitting(false)
    }
  }

  const handleModeChange = (mode: SearchMode) => {
    setSelectedMode(mode)

    if (mode === 'ask-ai') {
      searchRequestVersion.current += 1
      setIsSearching(false)
      setSearchError(null)
      setPromptLogin(false)
      setShowAdvancedFilters(false)
    }
  }

  const handleClearSearch = () => {
    searchRequestVersion.current += 1
    setSelectedCategory(null)
    setSelectedArea(null)
    setSelectedBudget(null)
    setIsSearching(false)
    setSearchError(null)
    setPromptLogin(false)
    setLastSearchQuery('')
    setSearchId(null)
    setSearchResults([])
    setHasSearched(false)
    setSelectedPlaceId(null)
    setClearSearchSignal((signal) => signal + 1)
  }

  const handleClearFilters = () => {
    setSelectedCategory(null)
    setSelectedArea(null)
    setSelectedBudget(null)
    setSearchError(null)
  }

  const handlePlaceSelect = (placeId: string) => {
    const place = visiblePlaces.find((visiblePlace) => visiblePlace.id === placeId)
    const canonicalPlaceSlug = place?.slug || place?.id || placeId

    if (searchId) {
      console.log('Selected place from search:', { placeId, slug: canonicalPlaceSlug, searchId })
    }

    setSelectedPlaceId(placeId)
    navigateToPlace(canonicalPlaceSlug)
  }

  const handleMapPlaceSelect = (placeId: string) => {
    setSelectedPlaceId(placeId)
  }

  const handleSearch = async (query: string) => {
    const trimmedQuery = query.trim()
    const requestVersion = searchRequestVersion.current + 1
    searchRequestVersion.current = requestVersion

    try {
      setIsSearching(true)
      setSearchError(null)
      setPromptLogin(false)
      setSelectedPlaceId(null)

      const response = await fetch('/api/search', {
        method: 'POST',
        headers: await getSearchRequestHeaders(),
        body: JSON.stringify({
          query: trimmedQuery,
          filters: {
            category: selectedCategory,
            area: selectedArea,
            budget: selectedBudget,
          },
        }),
      })

      const data = (await response.json()) as {
        message?: string
        error?: string
        searchId?: string
        promptLogin?: boolean
        places?: BackendSearchPlace[]
        geminiResponse?: string
        result?: {
          geminiResponse?: string
          places?: BackendSearchPlace[]
        }
      }

      if (searchRequestVersion.current !== requestVersion) {
        return
      }

      if (data.promptLogin) {
        setPromptLogin(true)
        return
      }

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Search failed.')
      }

      setLastSearchQuery(trimmedQuery || selectedFilterLabels.join(' · '))
      setSearchId(data.searchId ?? null)
      const backendPlaces = data.places ?? data.result?.places ?? []
      const mappedPlaces = backendPlaces
        .map(mapBackendPlaceToCard)
        .filter((place): place is PlaceCardData => Boolean(place))

      setSearchResults(mappedPlaces)
      setHasSearched(true)
      setSelectedPlaceId(mappedPlaces[0]?.id ?? null)
      console.log('Search success:', {
        query: trimmedQuery,
        selectedCategory,
        selectedArea,
        selectedBudget,
        data,
      })
    } catch (error) {
      if (searchRequestVersion.current !== requestVersion) {
        return
      }

      const message = error instanceof Error ? error.message : 'Search failed.'
      setSearchError(message)
      console.error('Search request failed:', error)
    } finally {
      if (searchRequestVersion.current === requestVersion) {
        setIsSearching(false)
      }
    }
  }

  const handleExploreAllPlaces = async () => {
    const requestVersion = searchRequestVersion.current + 1
    searchRequestVersion.current = requestVersion

    try {
      setIsSearching(true)
      setSearchError(null)
      setPromptLogin(false)
      setSelectedPlaceId(null)

      const response = await fetch('/api/search', {
        method: 'POST',
        headers: await getSearchRequestHeaders(),
        body: JSON.stringify({
          query: '',
          filters: {
            category: null,
            area: null,
            budget: null,
          },
          exploreAll: true,
        }),
      })

      const data = (await response.json()) as {
        message?: string
        error?: string
        searchId?: string
        places?: BackendSearchPlace[]
        promptLogin?: boolean
        result?: {
          places?: BackendSearchPlace[]
        }
      }

      if (searchRequestVersion.current !== requestVersion) {
        return
      }

      if (data.promptLogin) {
        setPromptLogin(true)
        return
      }

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Search failed.')
      }

      setLastSearchQuery('Explore all places')
      setSearchId(data.searchId ?? null)
      const backendPlaces = data.places ?? data.result?.places ?? []
      const mappedPlaces = backendPlaces
        .map(mapBackendPlaceToCard)
        .filter((place): place is PlaceCardData => Boolean(place))

      setSearchResults(mappedPlaces)
      setHasSearched(true)
      setSelectedPlaceId(mappedPlaces[0]?.id ?? null)
      console.log('Broad discovery success:', data)
    } catch (error) {
      if (searchRequestVersion.current !== requestVersion) {
        return
      }

      const message = error instanceof Error ? error.message : 'Search failed.'
      setSearchError(message)
      console.error('Broad discovery request failed:', error)
    } finally {
      if (searchRequestVersion.current === requestVersion) {
        setIsSearching(false)
      }
    }
  }

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data.session)
        setIsSessionLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsSessionLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (selectedMode !== 'ask-ai' || isSessionLoading) {
      return
    }

    if (!session?.access_token) {
      setAskAiUsageStatus(null)
      setLiveSearchUsageStatus(null)
      setIsAskAiUsageLoading(false)
      setAskAiUsageError(null)
      return
    }

    const controller = new AbortController()
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
    const usageEndpoint = apiBaseUrl ? `${apiBaseUrl}/ask-ai/usage/check` : '/api/ask-ai/usage/check'

    const loadAskAiUsage = async () => {
      try {
        setIsAskAiUsageLoading(true)
        setAskAiUsageError(null)

        const response = await fetch(usageEndpoint, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          signal: controller.signal,
        })

        const data = (await response.json()) as Partial<AskAiUsageSummary> & {
          error?: string
          message?: string
        }

        if (!response.ok) {
          throw new Error(data.message || data.error || 'Failed to check Ask AI usage.')
        }

        if (!isAskAiUsageStatus(data.askAi) || !isAskAiUsageStatus(data.liveSearch)) {
          throw new Error('Ask AI usage response was incomplete.')
        }

        setAskAiUsageStatus(data.askAi)
        setLiveSearchUsageStatus(data.liveSearch)
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return
        }

        const message = error instanceof Error ? error.message : 'Failed to check Ask AI usage.'
        setAskAiUsageStatus(null)
        setLiveSearchUsageStatus(null)
        setAskAiUsageError(message)
      } finally {
        if (!controller.signal.aborted) {
          setIsAskAiUsageLoading(false)
        }
      }
    }

    void loadAskAiUsage()

    return () => controller.abort()
  }, [askAiUsageRefreshSignal, isSessionLoading, selectedMode, session?.access_token])

  useEffect(() => {
    const controller = new AbortController()
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
    const filtersEndpoint = apiBaseUrl ? `${apiBaseUrl}/filters` : '/api/filters'

    const loadFilters = async () => {
      try {
        const response = await fetch(filtersEndpoint, {
          method: 'GET',
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error('Failed to fetch filters.')
        }

        const data = (await response.json()) as {
          categories?: BackendCategory[]
          areas?: BackendArea[]
        }

        if (data.categories && data.categories.length > 0) {
          const mappedCategories: CategoryChip[] = data.categories.map((category) => ({
            id: category.id,
            name: category.name,
          }))

          setCategories(mappedCategories)
        }

        if (data.areas && data.areas.length > 0) {
          const mappedAreas: AreaChip[] = data.areas.map((area) => ({
            id: area.id,
            name: area.name,
            type: area.type,
          }))

          setAreas(mappedAreas)
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Using fallback filters:', error)
        }
      }
    }

    void loadFilters()

    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!showAdvancedFilters) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [showAdvancedFilters])

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <GuestLimitModal isOpen={promptLogin} onClose={() => setPromptLogin(false)} />

      <div className="min-h-screen bg-[linear-gradient(180deg,#f8fbff,#edf4ff)] lg:hidden">
        <AppHeader signInLabel="Mag-sign in" />

        <main className="pb-6">
          <section className="border-b border-[var(--line)] bg-white/76 px-4 py-4 backdrop-blur">
            <SearchModeTabs selectedMode={selectedMode} onModeChange={handleModeChange} className="mb-3" />
            {selectedMode === 'places' ? (
              <>
                <SearchBar
                  onSearch={handleSearch}
                  onClear={handleClearSearch}
                  clearSignal={clearSearchSignal}
                  hasActiveFilters={hasActiveFilters}
                  hasClearableSearch={hasSearched}
                  isLoading={isSearching}
                  placeholder="Saan mo gustong pumunta ngayon?"
                  animatedPlaceholders={animatedSearchPrompts}
                  className="px-3 py-2.5 shadow-[0_10px_26px_rgba(28,77,160,0.06)]"
                />
                {isSearching ? (
                  <p className="mt-2 text-xs text-[var(--accent-deep)]">Searching...</p>
                ) : null}
                {searchError ? (
                  <p className="mt-2 text-xs text-red-600">{searchError}</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters(true)}
                  className="mt-3 inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--accent-deep)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)]"
                >
                  <FilterIcon className="h-3.5 w-3.5" />
                  Mga Filters
                </button>
              </>
            ) : null}
          </section>

          {selectedMode === 'places' ? (
            <>
              <section className="h-[380px] border-b border-[var(--line)] bg-white">
                <MapView
                  places={visiblePlaces}
                  selectedPlaceId={selectedPlaceId}
                  onPlaceSelect={handleMapPlaceSelect}
                  onPlaceOpen={handlePlaceSelect}
                  autoFitToPlaces={hasSearched}
                  className="!h-full !rounded-none !border-0"
                />
              </section>

              <section className="px-4 py-4">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Mga Lugar</p>
                    <p className="text-[11px] text-[var(--muted)]">
                      {hasSearched ? `${visiblePlaces.length} places found` : 'Search to show matching places'}
                    </p>
                  </div>
                  {hasSearched || hasActiveFilters ? (
                    <button
                      type="button"
                      onClick={handleClearSearch}
                      className="rounded-full border border-[var(--accent)] bg-white px-3 py-1.5 text-[11px] font-semibold text-[var(--accent-deep)] shadow-[0_8px_18px_rgba(47,116,232,0.12)] transition hover:bg-[var(--accent-wash)]"
                    >
                      Clear Search
                    </button>
                  ) : null}
                </div>

                <div className="grid gap-3">
                  {visiblePlaces.length > 0
                    ? visiblePlaces.map((place) => (
                        <PlaceCard
                          key={place.id}
                          place={place}
                          compact
                          isSelected={selectedPlaceId === place.id}
                          onSelect={handlePlaceSelect}
                        />
                      ))
                    : <SearchEmptyState hasSearched={hasSearched} />}
                </div>
              </section>
            </>
          ) : (
            <AskAiModePanel
              isRegistered={isRegisteredUser}
              isSessionLoading={isSessionLoading}
              usageStatus={askAiUsageStatus}
              liveSearchUsageStatus={liveSearchUsageStatus}
              isUsageLoading={isAskAiUsageLoading}
              usageError={askAiUsageError}
              question={askAiQuestion}
              answer={askAiAnswer}
              sources={askAiSources}
              usedLiveSearch={askAiUsedLiveSearch}
              isSubmitting={isAskAiSubmitting}
              answerError={askAiAnswerError}
              onRetryUsage={handleRetryAskAiUsage}
              onQuestionChange={setAskAiQuestion}
              onSubmit={handleAskAiSubmit}
            />
          )}
        </main>
      </div>

      <div className="hidden min-h-screen w-full lg:grid lg:grid-rows-[72px_86px_minmax(0,1fr)]">
        <AppHeader />

        <section className="border-b border-[var(--line)] bg-white/72 backdrop-blur">
          <div className="px-8 py-3">
            <div className="flex items-center gap-4">
              <SearchModeTabs selectedMode={selectedMode} onModeChange={handleModeChange} className="w-[280px] shrink-0" />
              {selectedMode === 'places' ? (
                <>
                  <SearchBar
                    onSearch={handleSearch}
                    onClear={handleClearSearch}
                    clearSignal={clearSearchSignal}
                    hasActiveFilters={hasActiveFilters}
                    hasClearableSearch={hasSearched}
                    isLoading={isSearching}
                    placeholder="Saan mo gustong pumunta ngayon?"
                    animatedPlaceholders={animatedSearchPrompts}
                    className="min-w-0 flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdvancedFilters(true)}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-[var(--accent-deep)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)]"
                  >
                    <FilterIcon className="h-3.5 w-3.5" />
                    Mga Filters
                  </button>
                </>
              ) : null}
            </div>
            {selectedMode === 'places' && isSearching ? (
              <p className="mt-2 text-xs text-[var(--accent-deep)]">Searching...</p>
            ) : null}
            {selectedMode === 'places' && searchError ? (
              <p className="mt-2 text-xs text-red-600">{searchError}</p>
            ) : null}
          </div>
        </section>

        {selectedMode === 'places' ? (
          <section className="grid min-h-0 grid-cols-[380px_minmax(0,1fr)]">
            <aside className="relative flex min-h-0 flex-col border-r border-[var(--line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,249,255,0.96))]">
              <div className="flex items-start justify-between border-b border-[var(--line)] px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Mga Lugar</p>
                  <p className="text-[11px] text-[var(--muted)]">
                    {lastSearchQuery
                      ? `Last search: "${lastSearchQuery}"`
                      : hasSearched
                        ? `${visiblePlaces.length} places found`
                        : 'Search to show matching places'}
                  </p>
                </div>
                {hasSearched || hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="rounded-full border border-[var(--accent)] bg-white px-3 py-1.5 text-[11px] font-semibold text-[var(--accent-deep)] shadow-[0_8px_18px_rgba(47,116,232,0.12)] transition hover:bg-[var(--accent-wash)]"
                  >
                    Clear Search
                  </button>
                ) : null}
              </div>

              <div className="grid grid-cols-3 gap-px border-b border-[var(--line)] bg-[var(--line)]">
                <div className="bg-white px-3 py-2 text-center text-[11px] font-medium text-[var(--muted)]">All</div>
                <div className="bg-white px-3 py-2 text-center text-[11px] font-medium text-[var(--muted)]">Open</div>
                <div className="bg-white px-3 py-2 text-center text-[11px] font-medium text-[var(--muted)]">Saved</div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <div className="grid gap-3">
                  {visiblePlaces.length > 0
                    ? visiblePlaces.map((place) => (
                        <PlaceCard
                          key={place.id}
                          place={place}
                          isSelected={selectedPlaceId === place.id}
                          onSelect={handlePlaceSelect}
                        />
                      ))
                    : <SearchEmptyState hasSearched={hasSearched} />}
                </div>
              </div>
            </aside>

            <section className="min-h-0 bg-white">
              <MapView
                places={visiblePlaces}
                selectedPlaceId={selectedPlaceId}
                onPlaceSelect={handleMapPlaceSelect}
                onPlaceOpen={handlePlaceSelect}
                autoFitToPlaces={hasSearched}
                className="!h-full !rounded-none !border-0"
              />
            </section>
          </section>
        ) : (
          <AskAiModePanel
            isRegistered={isRegisteredUser}
            isSessionLoading={isSessionLoading}
            usageStatus={askAiUsageStatus}
            liveSearchUsageStatus={liveSearchUsageStatus}
            isUsageLoading={isAskAiUsageLoading}
            usageError={askAiUsageError}
            question={askAiQuestion}
            answer={askAiAnswer}
            sources={askAiSources}
            usedLiveSearch={askAiUsedLiveSearch}
            isSubmitting={isAskAiSubmitting}
            answerError={askAiAnswerError}
            onRetryUsage={handleRetryAskAiUsage}
            onQuestionChange={setAskAiQuestion}
            onSubmit={handleAskAiSubmit}
            className="min-h-0"
          />
        )}
      </div>

      <div
        className={`fixed inset-0 z-[9999] transition ${showAdvancedFilters ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
      >
        <button
          type="button"
          onClick={() => setShowAdvancedFilters(false)}
          className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px]"
          aria-label="Close advanced filters"
        />

        <section className="absolute right-0 top-0 flex h-full w-full max-w-[540px] flex-col border-l border-[var(--line)] bg-[linear-gradient(180deg,#ffffff,#f4f8ff)] shadow-[-18px_0_40px_rgba(15,23,42,0.12)]">
          <div className="flex items-start justify-between border-b border-[var(--line)] px-4 py-3.5 sm:px-5 sm:py-4">
            <div>
              <p className="text-[26px] font-semibold leading-tight text-slate-900 sm:text-lg">Pumili ng filters</p>
              <p className="mt-1 text-[11px] text-[var(--muted)] sm:text-xs">
                {hasActiveFilters ? `Selected: ${selectedFilterLabels.join(' · ')}` : 'No filters selected yet'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAdvancedFilters(false)}
              className="mt-1 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_8px_18px_rgba(47,116,232,0.3)] transition-all duration-200 hover:-translate-y-[1px] hover:bg-white hover:text-[var(--accent)] hover:shadow-[0_8px_16px_rgba(47,116,232,0.16)] active:scale-95 active:bg-[var(--accent-deep)] active:text-white sm:h-9 sm:w-9"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.7" className="h-4 w-4">
                <path d="M6 6l12 12" />
                <path d="M18 6 6 18" />
              </svg>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3 sm:px-5 sm:pb-5 sm:pt-4">
            <p className="mb-3 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-[11px] leading-snug text-[var(--muted)] sm:text-xs">
              Choose filters, then click Search. You can search with filters only even without typing.
            </p>
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] sm:text-xs">
                Kategorya ng lugar
              </p>
            </div>

            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              {filteredAdvancedCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setSelectedCategory(category.id)}
                  className={`group rounded-xl border px-2.5 py-1.5 text-left text-[13px] transition duration-200 active:scale-[0.98] sm:px-3 sm:py-2 sm:text-sm ${
                    selectedCategory === category.id
                      ? 'border-[var(--accent)] bg-[linear-gradient(180deg,#eef5ff,#deecff)] text-[var(--accent-deep)] shadow-[0_8px_18px_rgba(47,116,232,0.14)] active:bg-[linear-gradient(180deg,#deecff,#d0e4ff)]'
                      : 'border-[var(--line)] bg-white text-slate-700 hover:-translate-y-[1px] hover:border-[var(--accent)] hover:bg-[linear-gradient(180deg,#f7fbff,#ecf4ff)] hover:text-[var(--accent-deep)] hover:shadow-[0_8px_16px_rgba(47,116,232,0.1)] active:border-[var(--accent)] active:bg-[linear-gradient(180deg,#eef5ff,#deecff)] active:text-[var(--accent-deep)]'
                  }`}
                >
                  <span className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <CategoryIcon categoryId={category.id} />
                      <span>{category.name}</span>
                    </span>
                    {selectedCategory === category.id ? <CheckIcon className="h-4 w-4" /> : null}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-4 sm:mt-5">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] sm:text-xs">
                Lungsod / Lugar sa Metro Manila
              </p>
            </div>

            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              {areas.filter((area) => area.id !== 'all').map((area) => (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => setSelectedArea(area.id)}
                  className={`group rounded-xl border px-2.5 py-1.5 text-left text-[13px] transition duration-200 active:scale-[0.98] sm:px-3 sm:py-2 sm:text-sm ${
                    selectedArea === area.id
                      ? 'border-[var(--accent)] bg-[linear-gradient(180deg,#eef5ff,#deecff)] text-[var(--accent-deep)] shadow-[0_8px_18px_rgba(47,116,232,0.14)] active:bg-[linear-gradient(180deg,#deecff,#d0e4ff)]'
                      : 'border-[var(--line)] bg-white text-slate-700 hover:-translate-y-[1px] hover:border-[var(--accent)] hover:bg-[linear-gradient(180deg,#f7fbff,#ecf4ff)] hover:text-[var(--accent-deep)] hover:shadow-[0_8px_16px_rgba(47,116,232,0.1)] active:border-[var(--accent)] active:bg-[linear-gradient(180deg,#eef5ff,#deecff)] active:text-[var(--accent-deep)]'
                  }`}
                >
                  <span className="flex items-center justify-between">
                    <span className="flex min-w-0 items-center gap-2">
                      <AreaIcon areaType={area.type} />
                      <span className="truncate">{area.name}</span>
                    </span>
                    {selectedArea === area.id ? <CheckIcon className="h-4 w-4 shrink-0" /> : null}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-4 sm:mt-5">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] sm:text-xs">
                Budget
              </p>
            </div>

            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              {budgetOptions.map((budget) => (
                <button
                  key={budget.value}
                  type="button"
                  onClick={() => setSelectedBudget(budget.value)}
                  className={`group rounded-xl border px-2.5 py-1.5 text-left text-[13px] transition duration-200 active:scale-[0.98] sm:px-3 sm:py-2 sm:text-sm ${
                    selectedBudget === budget.value
                      ? 'border-[var(--accent)] bg-[linear-gradient(180deg,#eef5ff,#deecff)] text-[var(--accent-deep)] shadow-[0_8px_18px_rgba(47,116,232,0.14)] active:bg-[linear-gradient(180deg,#deecff,#d0e4ff)]'
                      : 'border-[var(--line)] bg-white text-slate-700 hover:-translate-y-[1px] hover:border-[var(--accent)] hover:bg-[linear-gradient(180deg,#f7fbff,#ecf4ff)] hover:text-[var(--accent-deep)] hover:shadow-[0_8px_16px_rgba(47,116,232,0.1)] active:border-[var(--accent)] active:bg-[linear-gradient(180deg,#eef5ff,#deecff)] active:text-[var(--accent-deep)]'
                  }`}
                >
                  <span className="flex items-center justify-between">
                    <span className="flex min-w-0 items-center gap-2">
                      <BudgetIcon />
                      <span className="truncate">{budget.label}</span>
                    </span>
                    {selectedBudget === budget.value ? <CheckIcon className="h-4 w-4 shrink-0" /> : null}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid shrink-0 gap-2 border-t border-[var(--line)] bg-white/95 px-4 py-2.5 sm:px-5 sm:py-3">
            <button
              type="button"
              onClick={handleClearFilters}
              disabled={!hasActiveFilters}
              className="w-full rounded-full border border-[var(--line)] bg-white px-4 py-2.5 text-[15px] font-semibold tracking-[0.01em] text-[var(--accent-deep)] transition-all duration-200 hover:-translate-y-[1px] hover:border-[var(--accent)] hover:bg-[var(--accent-wash)] active:scale-[0.99] disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:hover:translate-y-0 disabled:hover:bg-white sm:py-3 sm:text-sm"
            >
              Clear filters
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAdvancedFilters(false)
              }}
              disabled={!hasActiveFilters}
              className="w-full rounded-full border border-[var(--accent)] bg-[var(--accent)] px-4 py-2.5 text-[15px] font-semibold tracking-[0.01em] text-white shadow-[0_10px_20px_rgba(47,116,232,0.26)] transition-all duration-200 hover:-translate-y-[1px] hover:bg-white hover:text-[var(--accent)] hover:shadow-[0_8px_16px_rgba(47,116,232,0.16)] active:scale-[0.99] active:bg-[var(--accent-deep)] active:text-white disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none disabled:hover:translate-y-0 sm:py-3 sm:text-sm"
            >
              Apply filters
            </button>
            <p className="px-2 text-center text-[11px] leading-snug text-[var(--muted)]">
              Choose filters, then click Search. You can search with filters only even without typing.
            </p>
            <button
              type="button"
              onClick={() => {
                setShowAdvancedFilters(false)
                void handleExploreAllPlaces()
              }}
              className="w-full rounded-full border border-[var(--line)] bg-[linear-gradient(180deg,#f8fbff,#eef5ff)] px-4 py-2.5 text-[15px] font-semibold tracking-[0.01em] text-[var(--accent-deep)] transition-all duration-200 hover:-translate-y-[1px] hover:border-[var(--accent)] hover:bg-white active:scale-[0.99] sm:py-3 sm:text-sm"
            >
              Explore all places
            </button>
          </div>
        </section>
      </div>

    </div>
  )
}

export default HomePage
