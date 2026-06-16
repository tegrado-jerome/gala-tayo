import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Session } from '@supabase/supabase-js'
import SearchBar from '../components/SearchBar'
import type { PlaceCardData, PlaceCategoryMeta, PlaceTagMeta } from '../components/PlaceCard'
import AppHeader from '../components/AppHeader'
import AppFooter from '../components/AppFooter'
import MapView from '../components/MapView'
import GuestLimitModal from '../components/GuestLimitModal'
import GoogleSignInButton from '../components/GoogleSignInButton'
import PromptBuilderModal from '../components/PromptBuilderModal'
import TapGalaPinGame from '../components/TapGalaPinGame'
import { supabase } from '../supabase'
import { navigateToPlace } from '../utils/navigation'
import type { PromptBuilderState } from '../types/promptBuilder'
import { createEmptyPromptBuilderState } from '../utils/promptBuilder'
import askAiErrorChibi from '../assets/chibis/core/ask-ai/chibi-ask-ai-error.webp'
import askAiOutputChibi from '../assets/chibis/core/ask-ai/chibi-ask-ai-output.webp'
import askAiStartChibi from '../assets/chibis/core/ask-ai/chibi-ask-ai-start.webp'
import askAiThinkingChibi from '../assets/chibis/core/ask-ai/chibi-ask-ai-thinking.webp'
import protectedFeatureChibi from '../assets/chibis/shared-states/chibi-protected-feature.webp'
import searchBeforeChibi from '../assets/chibis/core/search-places/chibi-search-places-before-active-state.webp'
import searchLoadingChibi from '../assets/chibis/core/search-places/chibi-search-places-loading-state.webp'
import searchNoResultsChibi from '../assets/chibis/core/search-places/chibi-search-places-no-results.webp'
import searchSuccessChibi from '../assets/chibis/core/search-places/chibi-search-success.webp'
import categoryHeroBarkada from '../assets/chibis/category-heroes/category-hero-barkada.webp'
import categoryHeroCafe from '../assets/chibis/category-heroes/category-hero-cafe.webp'
import categoryHeroChill from '../assets/chibis/category-heroes/category-hero-chill.webp'
import categoryHeroDate from '../assets/chibis/category-heroes/category-hero-date.webp'
import categoryHeroFamily from '../assets/chibis/category-heroes/category-hero-family.webp'
import categoryHeroHeritage from '../assets/chibis/category-heroes/category-hero-heritage.webp'
import categoryHeroKainan from '../assets/chibis/category-heroes/category-hero-kainan.webp'
import categoryHeroMall from '../assets/chibis/category-heroes/category-hero-mall.webp'
import categoryHeroMuseum from '../assets/chibis/category-heroes/category-hero-museum.webp'
import categoryHeroNightlife from '../assets/chibis/category-heroes/category-hero-nightlife.webp'
import categoryHeroParke from '../assets/chibis/category-heroes/category-hero-parke.webp'
import categoryHeroShopping from '../assets/chibis/category-heroes/category-hero-shopping.webp'
import categoryHeroStudy from '../assets/chibis/category-heroes/category-hero-study.webp'
import categoryHeroTourist from '../assets/chibis/category-heroes/category-hero-tourist.webp'
import categoryIconArcade from '../assets/chibis/category-icons/category-icon-arcade.webp'
import categoryIconBarkada from '../assets/chibis/category-icons/category-icon-barkada.webp'
import categoryIconCafe from '../assets/chibis/category-icons/category-icon-cafe.webp'
import categoryIconChill from '../assets/chibis/category-icons/category-icon-chill.webp'
import categoryIconCinema from '../assets/chibis/category-icons/category-icon-cinema.webp'
import categoryIconDate from '../assets/chibis/category-icons/category-icon-date.webp'
import categoryIconFamily from '../assets/chibis/category-icons/category-icon-family.webp'
import categoryIconHeritage from '../assets/chibis/category-icons/category-icon-heritage.webp'
import categoryIconKainan from '../assets/chibis/category-icons/category-icon-kainan.webp'
import categoryIconMall from '../assets/chibis/category-icons/category-icon-mall.webp'
import categoryIconMuseum from '../assets/chibis/category-icons/category-icon-museum.webp'
import categoryIconNightlife from '../assets/chibis/category-icons/category-icon-nightlife.webp'
import categoryIconParke from '../assets/chibis/category-icons/category-icon-parke.webp'
import categoryIconStudy from '../assets/chibis/category-icons/category-icon-study.webp'
import categoryIconTourist from '../assets/chibis/category-icons/category-icon-tourist.webp'

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

const categoryIconImages: Record<string, string> = {
  arcade: categoryIconArcade,
  barkada: categoryIconBarkada,
  cafe: categoryIconCafe,
  chill: categoryIconChill,
  cinema: categoryIconCinema,
  date: categoryIconDate,
  family: categoryIconFamily,
  heritage: categoryIconHeritage,
  kainan: categoryIconKainan,
  mall: categoryIconMall,
  museum: categoryIconMuseum,
  nightlife: categoryIconNightlife,
  parke: categoryIconParke,
  study: categoryIconStudy,
  tourist: categoryIconTourist,
}

const categoryHeroImages: Record<string, string> = {
  barkada: categoryHeroBarkada,
  cafe: categoryHeroCafe,
  chill: categoryHeroChill,
  date: categoryHeroDate,
  family: categoryHeroFamily,
  heritage: categoryHeroHeritage,
  kainan: categoryHeroKainan,
  mall: categoryHeroMall,
  museum: categoryHeroMuseum,
  nightlife: categoryHeroNightlife,
  parke: categoryHeroParke,
  shopping: categoryHeroShopping,
  study: categoryHeroStudy,
  tourist: categoryHeroTourist,
}

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
  const categoryImage = categoryIconImages[categoryId]

  if (categoryImage) {
    return <img src={categoryImage} alt="" className={`${className} object-contain`} loading="lazy" />
  }

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

type BudgetValue = 'free' | 'under-500' | '500-1000' | '1000-2000' | '2000-plus'

type BudgetOption = {
  value: BudgetValue
  label: string
}

type SearchMode = 'places' | 'ask-ai'

type UserLocation = {
  latitude: number
  longitude: number
} | null

type LocationPermissionState =
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unsupported'
  | 'error'

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
  answer: string
  sources?: unknown
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
  distanceKm?: number | null
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
  { id: 'las-pinas', name: 'Las PiÃ±as', type: 'city' },
  { id: 'makati', name: 'Makati', type: 'city' },
  { id: 'malabon', name: 'Malabon', type: 'city' },
  { id: 'mandaluyong', name: 'Mandaluyong', type: 'city' },
  { id: 'manila', name: 'Manila', type: 'city' },
  { id: 'marikina', name: 'Marikina', type: 'city' },
  { id: 'muntinlupa', name: 'Muntinlupa', type: 'city' },
  { id: 'navotas', name: 'Navotas', type: 'city' },
  { id: 'paranaque', name: 'ParaÃ±aque', type: 'city' },
  { id: 'pasay', name: 'Pasay', type: 'city' },
  { id: 'pasig', name: 'Pasig', type: 'city' },
  { id: 'quezon-city', name: 'Quezon City', type: 'city' },
  { id: 'san-juan', name: 'San Juan', type: 'city' },
  { id: 'taguig', name: 'Taguig', type: 'city' },
  { id: 'valenzuela', name: 'Valenzuela', type: 'city' },
  { id: 'pateros', name: 'Pateros', type: 'municipality' },
]

const budgetOptions: BudgetOption[] = [
  { value: 'free', label: 'Free' },
  { value: 'under-500', label: 'Under â‚±500' },
  { value: '500-1000', label: 'â‚±500-â‚±1,000' },
  { value: '1000-2000', label: 'â‚±1,000-â‚±2,000' },
  { value: '2000-plus', label: 'â‚±2,000+' },
]

const emptyStateHelperChips = [
  { id: 'chill', label: 'Chill' },
  { id: 'date', label: 'Date' },
  { id: 'barkada', label: 'Barkada' },
  { id: 'family', label: 'Family' },
  { id: 'kainan', label: 'Kainan' },
  { id: 'cafe', label: 'Cafe' },
  { id: 'museum', label: 'Museum' },
  { id: 'parke', label: 'Parke' },
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
    address: place.address || null,
    city: place.city || null,
    localArea: place.area || null,
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
    distanceKm: typeof place.distanceKm === 'number' ? place.distanceKm : null,
    entranceFee: place.budget_notes || place.budget || place.budgetRange || undefined,
    website: place.website_url || undefined,
    coordinates: {
      lat,
      lng,
    },
  }
}

function SearchEmptyState({
  hasSearched,
  onBuildPrompt,
  onSearchAgain,
  onSelectCategory,
}: {
  hasSearched: boolean
  onBuildPrompt?: () => void
  onSearchAgain?: () => void
  onSelectCategory?: (categoryId: string) => void
}) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--line)] bg-white px-4 py-6 text-center">
      <img
        src={hasSearched ? searchNoResultsChibi : searchBeforeChibi}
        alt=""
        className="mx-auto mb-3 h-28 w-28 object-contain"
        loading="lazy"
      />
      <p className="text-sm font-semibold text-slate-900">
        {hasSearched ? 'Hmm, wala pa kaming nahanap for that.' : 'Saan tayo gala today?'}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
        {hasSearched
          ? 'Try choosing a vibe or city.'
          : 'Type a place, or pick a vibe to start exploring Metro Manila.'}
      </p>
      {hasSearched && onSelectCategory ? (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {emptyStateHelperChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => onSelectCategory(chip.id)}
              className="rounded-full border border-[var(--line)] bg-[var(--chip)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-deep)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)]"
            >
              {chip.label}
            </button>
          ))}
        </div>
      ) : null}
      {hasSearched ? (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {onBuildPrompt ? (
            <button
              type="button"
              onClick={onBuildPrompt}
              className="rounded-full border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white hover:text-[var(--accent-deep)]"
            >
              Build prompt
            </button>
          ) : null}
          {onSearchAgain ? (
            <button
              type="button"
              onClick={onSearchAgain}
              className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)] hover:text-[var(--accent-deep)]"
            >
              Search again
            </button>
          ) : null}
        </div>
      ) : null}
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

type GuidedSectionItem = {
  id: string
  label: string
  icon?: ReactNode
}

function SparkIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
      <path d="M12 3.5 14 10l6.5 2-6.5 2-2 6.5-2-6.5-6.5-2 6.5-2L12 3.5Z" />
      <path d="m18.5 3.5.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
    </svg>
  )
}

function HeartOutlineIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
      <path d="M20.8 5.6a5.1 5.1 0 0 0-7.2 0L12 7.2l-1.6-1.6a5.1 5.1 0 1 0-7.2 7.2L12 21l8.8-8.2a5.1 5.1 0 0 0 0-7.2Z" />
    </svg>
  )
}

function CafeIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
      <path d="M5 8h10v4a5 5 0 0 1-5 5h0a5 5 0 0 1-5-5V8Z" />
      <path d="M15 9h2.2a2.3 2.3 0 0 1 0 4.6H15" />
      <path d="M4 20h14" />
    </svg>
  )
}

function MuseumIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
      <path d="M3 9h18" />
      <path d="M5.5 9v8.5M9.5 9v8.5M14.5 9v8.5M18.5 9v8.5" />
      <path d="M2.5 20h19" />
      <path d="M12 3 3 7.5h18L12 3Z" />
    </svg>
  )
}

function UmbrellaIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
      <path d="M4 12a8 8 0 0 1 16 0H4Z" />
      <path d="M12 12v5.5a2.5 2.5 0 0 0 5 0" />
    </svg>
  )
}

function BuildingIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
      <path d="M5 20V5h9v15" />
      <path d="M14 10h5v10" />
      <path d="M8 8h2M8 12h2M8 16h2M17 14h-1M17 17h-1" />
    </svg>
  )
}

function ChevronRightIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={className}>
      <path d="m9 5 7 7-7 7" />
    </svg>
  )
}

function GuidedIllustration({ categoryId }: { categoryId?: string | null }) {
  const heroImage = categoryId ? categoryHeroImages[categoryId] : null
  const image = heroImage || searchBeforeChibi

  return (
    <div className="relative mx-auto flex min-h-[230px] w-full max-w-[520px] items-center justify-center overflow-hidden rounded-xl border border-[var(--line)] bg-white/86 px-3 py-3 sm:min-h-[280px] lg:min-h-[260px] lg:max-w-none xl:min-h-[300px]">
      <img
        src={image}
        alt=""
        className="h-full max-h-[220px] w-full object-contain sm:max-h-[270px] lg:max-h-[250px] xl:max-h-[290px]"
        loading="eager"
      />
    </div>
  )
}

function SkeletonLine({ className = '' }: { className?: string }) {
  return (
    <span
      className={`block rounded-full bg-[linear-gradient(90deg,#eef2f7_0%,#dbe2ea_42%,#f4f7fa_78%)] bg-[length:220%_100%] motion-safe:animate-[gala-skeleton-shimmer_1.6s_ease-in-out_infinite] ${className}`}
      aria-hidden="true"
    />
  )
}

function SearchLoadingCard({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="rounded-xl border border-[var(--line-strong)] bg-white/86 p-3 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
        <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-4">
          <div className="flex aspect-[1.18] items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-400">
            <svg viewBox="0 0 96 76" fill="none" stroke="currentColor" strokeWidth="2" className="h-20 w-24">
              <rect x="5" y="5" width="86" height="66" rx="6" />
              <path d="m6 60 27-28 23 23 15-17 20 22" />
              <circle cx="58" cy="26" r="7" />
            </svg>
          </div>
          <div className="min-w-0 pt-1">
            <SkeletonLine className="h-4 w-[92%]" />
            <SkeletonLine className="mt-4 h-3.5 w-[48%]" />
            <div className="mt-5 flex items-center gap-3">
              <PinIcon className="h-5 w-5 text-slate-400" />
              <SkeletonLine className="h-3 w-[46%]" />
              <span className="h-1 w-1 rounded-full bg-slate-300" />
              <SkeletonLine className="h-3 w-[26%]" />
            </div>
            <SkeletonLine className="mt-5 h-3 w-[66%]" />
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-3">
          <SkeletonLine className="mx-auto h-3 w-[28%]" />
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-[var(--line-strong)] bg-white/86 px-5 py-5 shadow-[0_14px_32px_rgba(15,23,42,0.035)]">
      <div className="grid grid-cols-[176px_minmax(0,1fr)_148px] items-center gap-8">
        <div className="h-[150px] rounded-lg bg-[linear-gradient(135deg,#eef2f7,#e2e8f0)]" />
        <div className="min-w-0">
          <div className="flex items-center gap-5">
            <span className="h-12 w-12 rounded-full bg-[linear-gradient(135deg,#eef2f7,#dfe6ee)]" aria-hidden="true" />
            <SkeletonLine className="h-4 w-[28%]" />
          </div>
          <SkeletonLine className="mt-6 h-5 w-[44%]" />
          <SkeletonLine className="mt-7 h-3 w-[58%]" />
          <SkeletonLine className="mt-4 h-3 w-[45%]" />
          <div className="mt-6 flex flex-wrap items-center gap-4 text-slate-400">
            <PinIcon className="h-5 w-5" />
            <SkeletonLine className="h-3 w-20" />
            <span className="h-1 w-1 rounded-full bg-slate-300" />
            <BudgetIcon className="h-5 w-5 text-slate-400" />
            <SkeletonLine className="h-3 w-16" />
            <span className="h-1 w-1 rounded-full bg-slate-300" />
            <SparkIcon className="h-5 w-5" />
            <SkeletonLine className="h-3 w-16" />
          </div>
        </div>
        <div className="h-16 rounded-lg bg-[linear-gradient(135deg,#eef2f7,#e2e8f0)]" />
      </div>
    </div>
  )
}

function ChibiPlaceholder({
  className = '',
  src = searchLoadingChibi,
}: {
  className?: string
  src?: string
  showBubble?: boolean
}) {
  return (
    <div className={`relative mx-auto flex items-center justify-center ${className}`} aria-hidden="true">
      <img src={src} alt="" className="h-full w-full object-contain" loading="eager" />
    </div>
  )
}

function SearchLoadingState({ searchLabel }: { searchLabel: string }) {
  const displayLabel = searchLabel.trim() || 'gala spots in Metro Manila'

  return (
    <section className="min-h-0 w-full px-5 py-7 sm:px-8 lg:px-12 lg:py-12">
      <div className="mx-auto grid w-full max-w-[1440px] gap-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-12">
        <aside className="text-center lg:pt-4 lg:text-left">
          <p className="text-[26px] font-extrabold leading-tight text-slate-800 sm:text-[30px] lg:text-[32px]">Searching for</p>
          <h1 className="mt-3 text-[32px] font-black leading-tight text-slate-950 sm:text-[38px] lg:text-[38px]">
            {displayLabel}
          </h1>
          <ChibiPlaceholder className="mt-8 h-[340px] sm:h-[420px] lg:h-[430px]" />
          <p className="mx-auto mt-5 max-w-[360px] text-lg font-semibold leading-relaxed text-slate-600 lg:mx-4">
            Finding gala spots around Metro Manila.
          </p>
        </aside>

        <div className="grid content-start gap-5 lg:pt-4">
          <div className="grid gap-4 lg:hidden">
            <SearchLoadingCard compact />
            <SearchLoadingCard compact />
            <p className="pt-4 text-center text-base font-semibold text-slate-400">
              Konting hintay, naghahanap ng sulit spots...
            </p>
          </div>
          <div className="hidden gap-6 lg:grid">
            <SearchLoadingCard />
            <SearchLoadingCard />
            <SearchLoadingCard />
          </div>
        </div>
      </div>
    </section>
  )
}

type MobileResultsViewMode = 'cards' | 'map'

function ListIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M8 6h12" />
      <path d="M8 12h12" />
      <path d="M8 18h12" />
      <path d="M4 6h.01" />
      <path d="M4 12h.01" />
      <path d="M4 18h.01" />
    </svg>
  )
}

function MapOutlineIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
      <path d="m9 18-5 2V6l5-2 6 2 5-2v14l-5 2-6-2Z" />
      <path d="M9 4v14" />
      <path d="M15 6v14" />
    </svg>
  )
}

function ClearIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </svg>
  )
}

function getMobilePlaceChips(place: PlaceCardData) {
  const chips = [
    ...(place.matchedCategories ?? []),
    ...(place.matchedTags ?? []),
    ...((place.matchedCategories?.length || place.matchedTags?.length) ? [] : place.categories ?? []),
    ...((place.matchedCategories?.length || place.matchedTags?.length) ? [] : place.tags ?? []),
  ]
  const seenNames = new Set<string>()

  return chips
    .map((chip) => chip.name?.trim() || chip.id)
    .filter((name) => {
      const normalizedName = name.toLowerCase()

      if (!normalizedName || seenNames.has(normalizedName)) {
        return false
      }

      seenNames.add(normalizedName)
      return true
    })
    .slice(0, 4)
}

function getPlaceCategoryImageId(place: PlaceCardData) {
  const categoryIds = [
    ...(place.matchedCategories ?? []),
    ...(place.categories ?? []),
  ]
    .map((category) => category.id?.trim().toLowerCase())
    .filter((id): id is string => Boolean(id))

  const directMatch = categoryIds.find((id) => categoryIconImages[id])

  if (directMatch) {
    return directMatch
  }

  const categoryLabel = `${place.category} ${place.badge} ${getMobilePlaceChips(place).join(' ')}`.toLowerCase()

  return Object.keys(categoryIconImages).find((categoryId) => categoryLabel.includes(categoryId)) || null
}

function MobilePlaceIconTile({ place }: { place: PlaceCardData }) {
  const categoryImageId = getPlaceCategoryImageId(place)

  if (categoryImageId) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-white">
        <CategoryIcon categoryId={categoryImageId} className="h-11 w-11" />
      </div>
    )
  }

  const categoryLabel = `${place.category} ${place.badge}`.toLowerCase()
  const iconClass = 'h-8 w-8'

  let icon = <PinIcon className={iconClass} />

  if (categoryLabel.includes('cafe') || categoryLabel.includes('coffee')) {
    icon = <CafeIcon className={iconClass} />
  } else if (categoryLabel.includes('mall') || categoryLabel.includes('shop')) {
    icon = <BuildingIcon className={iconClass} />
  } else if (categoryLabel.includes('museum') || categoryLabel.includes('heritage')) {
    icon = <MuseumIcon className={iconClass} />
  } else if (categoryLabel.includes('date')) {
    icon = <HeartOutlineIcon className={iconClass} />
  } else if (categoryLabel.includes('park') || categoryLabel.includes('chill')) {
    icon = <UmbrellaIcon className={iconClass} />
  }

  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--chip)] text-[var(--accent-deep)]">
      {icon}
    </div>
  )
}

function MobileResultCard({
  place,
  isSelected,
  onSelect,
  onViewDetails,
}: {
  place: PlaceCardData
  isSelected: boolean
  onSelect: (placeId: string) => void
  onViewDetails: (placeId: string) => void
}) {
  const chips = getMobilePlaceChips(place)
  const budgetLabel = place.entranceFee || place.budget_notes || 'Check details'
  const goodFor = place.good_for?.length ? place.good_for.join(', ') : place.reason

  return (
    <article
      className={`rounded-lg border bg-white p-3 shadow-[0_8px_18px_rgba(28,77,160,0.04)] transition ${
        isSelected ? 'border-[var(--accent)] ring-1 ring-[rgba(47,116,232,0.18)]' : 'border-[var(--line)]'
      }`}
      onClick={() => onSelect(place.id)}
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
    >
      <div className="grid grid-cols-[56px_minmax(0,1fr)] gap-3">
        <MobilePlaceIconTile place={place} />
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <h2 className="min-w-0 text-[15px] font-black leading-tight text-slate-950">{place.name}</h2>
            <span className="shrink-0 rounded-md border border-[var(--line)] bg-white px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
              {place.badge || place.category}
            </span>
          </div>
          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-[var(--muted)]">
            <PinIcon className="h-3.5 w-3.5" />
            {place.area}
          </p>
          {chips.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <span
                  key={`${place.id}-${chip}`}
                  className="rounded-md border border-[var(--line)] bg-[var(--chip)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-deep)]"
                >
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_112px] items-end gap-3 border-t border-[var(--line)] pt-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-900">
            <span className="font-black">Budget:</span> {budgetLabel}
          </p>
          <p className="mt-1 line-clamp-1 text-xs text-slate-700">
            <span className="font-black">Good for:</span> {goodFor}
          </p>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onViewDetails(place.id)
          }}
          className="rounded-md border border-[var(--accent)] bg-white px-3 py-2 text-xs font-black text-[var(--accent-deep)] transition hover:bg-[var(--accent-wash)]"
        >
          Details
        </button>
      </div>
    </article>
  )
}

function MobileResultIntro({
  count,
  searchLabel,
  onClearSearch,
}: {
  count: number
  searchLabel: string
  onClearSearch: () => void
}) {
  return (
    <>
      <section className="px-4 pb-4 pt-5">
        <h1 className="text-2xl font-black leading-tight text-slate-950">Found {count} places</h1>
        <p className="mt-1 text-lg font-semibold leading-tight text-slate-800">
          for {searchLabel || 'your gala search'}
        </p>
        <div className="mt-3 flex justify-center">
          <ChibiPlaceholder src={searchSuccessChibi} className="h-32 w-32 shrink-0" />
        </div>
      </section>

      <section className="px-4">
        <button
          type="button"
          onClick={onClearSearch}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-white text-sm font-black text-[var(--accent-deep)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)]"
        >
          <ClearIcon className="h-4 w-4" />
          Clear search
        </button>
      </section>
    </>
  )
}

function MobileResultsTabs({
  selectedView,
  onViewChange,
}: {
  selectedView: MobileResultsViewMode
  onViewChange: (view: MobileResultsViewMode) => void
}) {
  const itemClass = (isSelected: boolean) =>
    `inline-flex h-11 items-center justify-center gap-2 rounded-md text-sm font-black transition ${
      isSelected
        ? 'bg-slate-900 text-white shadow-[0_10px_20px_rgba(15,23,42,0.12)]'
        : 'bg-white text-slate-950'
    }`

  return (
    <section className="mx-4 mt-4 grid grid-cols-2 rounded-md border border-[var(--line)] bg-white p-0.5">
      <button type="button" onClick={() => onViewChange('cards')} className={itemClass(selectedView === 'cards')}>
        <ListIcon className="h-4 w-4" />
        Cards
      </button>
      <button type="button" onClick={() => onViewChange('map')} className={itemClass(selectedView === 'map')}>
        <MapOutlineIcon className="h-4 w-4" />
        Map
      </button>
    </section>
  )
}

function MobileResultsView({
  places,
  selectedPlace,
  selectedPlaceId,
  searchLabel,
  selectedView,
  onViewChange,
  onSelectPlace,
  onViewDetails,
  onClearSearch,
}: {
  places: PlaceCardData[]
  selectedPlace: PlaceCardData | null
  selectedPlaceId: string | null
  searchLabel: string
  selectedView: MobileResultsViewMode
  onViewChange: (view: MobileResultsViewMode) => void
  onSelectPlace: (placeId: string) => void
  onViewDetails: (placeId: string) => void
  onClearSearch: () => void
}) {
  return (
    <section className="mx-auto w-full max-w-[560px]">
      <MobileResultIntro
        count={places.length}
        searchLabel={searchLabel}
        onClearSearch={onClearSearch}
      />
      <MobileResultsTabs selectedView={selectedView} onViewChange={onViewChange} />

      {selectedView === 'cards' ? (
        <section className="grid gap-3 px-4 py-4">
          {places.map((place) => (
            <MobileResultCard
              key={place.id}
              place={place}
              isSelected={selectedPlaceId === place.id}
              onSelect={onSelectPlace}
              onViewDetails={onViewDetails}
            />
          ))}
          <p className="text-center text-xs font-semibold text-slate-500">
            Switch to Map to see your selected place.
          </p>
        </section>
      ) : (
        <section className="px-4 py-4">
          <div className="overflow-hidden rounded-lg border border-[var(--line)] bg-white">
            <MapView
              places={places}
              selectedPlaceId={selectedPlaceId}
              onPlaceSelect={onSelectPlace}
              onPlaceOpen={onViewDetails}
              autoFitToPlaces
              className="!h-[360px] !rounded-none !border-0"
            />
          </div>

          {selectedPlace ? (
            <section className="mt-4">
              <h2 className="mb-2 text-base font-black text-slate-950">Selected place</h2>
              <article className="rounded-lg border border-[var(--line)] bg-white p-3">
                <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-3">
                  <MobilePlaceIconTile place={selectedPlace} />
                  <div>
                    <h3 className="text-lg font-black leading-tight text-slate-950">{selectedPlace.name}</h3>
                    <p className="mt-1.5 flex items-center gap-1 text-sm font-semibold text-slate-700">
                      <PinIcon className="h-3.5 w-3.5" />
                      {selectedPlace.area}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {getMobilePlaceChips(selectedPlace).slice(0, 2).map((chip) => (
                        <span
                          key={`${selectedPlace.id}-selected-${chip}`}
                          className="rounded-md border border-[var(--line)] bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                    <p className="mt-3 text-sm text-slate-950">
                      <span className="font-black">Budget:</span> {selectedPlace.entranceFee || selectedPlace.budget_notes || 'Check details'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onViewDetails(selectedPlace.id)}
                  className="mt-4 h-11 w-full rounded-md bg-slate-900 text-base font-black text-white transition hover:bg-slate-800"
                >
                  View Details
                </button>
              </article>
            </section>
          ) : null}

          <button
            type="button"
            onClick={() => onViewChange('cards')}
            className="mt-5 inline-flex items-center gap-2 text-sm font-black text-slate-700"
          >
            <ChevronRightIcon className="h-4 w-4 rotate-180" />
            Back to cards
          </button>
        </section>
      )}
    </section>
  )
}

function DesktopResultsView({
  places,
  selectedPlaceId,
  searchLabel,
  onSelectPlace,
  onViewDetails,
  onClearSearch,
}: {
  places: PlaceCardData[]
  selectedPlaceId: string | null
  searchLabel: string
  onSelectPlace: (placeId: string) => void
  onViewDetails: (placeId: string) => void
  onClearSearch: () => void
}) {
  return (
    <section className="grid h-full min-h-0 select-none overflow-hidden grid-cols-[minmax(470px,0.92fr)_minmax(0,1fr)] bg-[linear-gradient(180deg,#f8fbff,#edf4ff)]">
      <aside className="min-h-0 overflow-y-auto overscroll-contain border-r border-[var(--line)] px-8 py-7">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-black leading-tight text-slate-950">Found {places.length} places</h1>
            <p className="mt-1 text-xl font-semibold text-slate-800">for {searchLabel || 'your gala search'}</p>
          </div>
          <button
            type="button"
            onClick={onClearSearch}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 text-xs font-black text-[var(--accent-deep)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)]"
          >
            <ClearIcon className="h-4 w-4" />
            Clear search
          </button>
        </div>

        <div className="mt-4 flex justify-center">
          <ChibiPlaceholder src={searchSuccessChibi} className="h-36 w-36 shrink-0" />
        </div>

        <div className="mt-6 grid gap-3">
          {places.map((place) => (
            <MobileResultCard
              key={place.id}
              place={place}
              isSelected={selectedPlaceId === place.id}
              onSelect={onSelectPlace}
              onViewDetails={onViewDetails}
            />
          ))}
        </div>
      </aside>

      <section className="relative min-h-0 overflow-hidden bg-white">
        <MapView
          places={places}
          selectedPlaceId={selectedPlaceId}
          onPlaceSelect={onSelectPlace}
          onPlaceOpen={onViewDetails}
          autoFitToPlaces
          className="!h-full !rounded-none !border-0"
        />
      </section>
    </section>
  )
}

function GuidedChipSection({
  title,
  icon,
  items,
  selectedId,
  onSelect,
  className = '',
}: {
  title: string
  icon: ReactNode
  items: GuidedSectionItem[]
  selectedId?: string | null
  onSelect: (id: string) => void
  className?: string
}) {
  return (
    <section className={className}>
      <h2 className="mb-3 flex items-center gap-2 text-base font-extrabold text-slate-900 lg:text-sm">
        <span className="text-slate-700">{icon}</span>
        {title}
      </h2>
      <div className="flex flex-wrap gap-2.5">
        {items.map((item) => {
          const isSelected = selectedId === item.id

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`inline-flex min-h-14 items-center justify-center gap-2.5 rounded-lg border px-4 py-2 text-sm font-bold transition active:scale-[0.98] lg:min-w-[116px] ${
                isSelected
                  ? 'border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_10px_22px_rgba(47,116,232,0.22)]'
                  : 'border-[var(--line-strong)] bg-white text-slate-700 hover:border-[var(--accent)] hover:bg-[var(--accent-wash)] hover:text-[var(--accent-deep)]'
              }`}
            >
              {item.icon ? <span className="flex h-9 w-9 shrink-0 items-center justify-center">{item.icon}</span> : null}
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function GuidedStartList({
  onCategoryChange,
  onAreaChange,
  onSearch,
}: {
  onCategoryChange: (categoryId: string | null) => void
  onAreaChange: (areaId: string | null) => void
  onSearch: (query: string) => void
}) {
  const startItems = [
    { label: 'Rainy day gala', icon: <CategoryIcon categoryId="chill" className="h-8 w-8" />, categoryId: 'chill', areaId: null },
    { label: 'Budget date', icon: <CategoryIcon categoryId="date" className="h-8 w-8" />, categoryId: 'date', areaId: null },
    { label: 'Cafe for studying', icon: <CategoryIcon categoryId="study" className="h-8 w-8" />, categoryId: 'study', areaId: null },
    { label: 'Family-friendly places', icon: <CategoryIcon categoryId="family" className="h-8 w-8" />, categoryId: 'family', areaId: null },
    { label: 'Chill in BGC', icon: <CategoryIcon categoryId="chill" className="h-8 w-8" />, categoryId: 'chill', areaId: 'taguig' },
  ]

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-base font-extrabold text-slate-900 lg:text-sm">
        <span className="text-slate-700">
          <SparkIcon />
        </span>
        Not sure yet? Start here
      </h2>
      <div className="grid max-w-full gap-3 overflow-hidden lg:grid-cols-3 lg:gap-4">
        {startItems.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => {
              onCategoryChange(item.categoryId)
              onAreaChange(item.areaId)
              onSearch(item.label)
            }}
            className="flex min-h-14 items-center gap-3 rounded-lg border border-[var(--line-strong)] bg-white px-3.5 py-2.5 text-left text-sm font-bold text-slate-800 transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)] hover:text-[var(--accent-deep)] active:scale-[0.99]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center">
              {item.icon}
            </span>
            <span className="min-w-0 flex-1">{item.label}</span>
            <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-500" />
          </button>
        ))}
      </div>
    </section>
  )
}

function GuidedSearchPage({
  selectedMode,
  selectedCategory,
  selectedArea,
  selectedBudget,
  hasActiveFilters,
  hasSearched,
  clearSearchSignal,
  isSearching,
  searchError,
  onModeChange,
  onSearch,
  onClearSearch,
  onCategoryChange,
  onAreaChange,
  onBudgetChange,
  onNearMe,
  onOpenFilters,
}: {
  selectedMode: SearchMode
  selectedCategory: string | null
  selectedArea: string | null
  selectedBudget: BudgetValue | null
  hasActiveFilters: boolean
  hasSearched: boolean
  clearSearchSignal: number
  isSearching: boolean
  searchError: string | null
  onModeChange: (mode: SearchMode) => void
  onSearch: (query: string) => void
  onClearSearch: () => void
  onCategoryChange: (categoryId: string | null) => void
  onAreaChange: (areaId: string | null) => void
  onBudgetChange: (budget: BudgetValue | null) => void
  onNearMe: () => void
  onOpenFilters: () => void
}) {
  const quickPickItems: GuidedSectionItem[] = [
    { id: 'date', label: 'Date', icon: <CategoryIcon categoryId="date" className="h-8 w-8" /> },
    { id: 'barkada', label: 'Barkada', icon: <CategoryIcon categoryId="barkada" className="h-8 w-8" /> },
    { id: 'family', label: 'Family', icon: <CategoryIcon categoryId="family" className="h-8 w-8" /> },
    { id: 'cafe', label: 'Cafe', icon: <CategoryIcon categoryId="cafe" className="h-8 w-8" /> },
    { id: 'chill', label: 'Chill', icon: <CategoryIcon categoryId="chill" className="h-8 w-8" /> },
    { id: 'study', label: 'Study', icon: <CategoryIcon categoryId="study" className="h-8 w-8" /> },
    { id: 'kainan', label: 'Kainan', icon: <CategoryIcon categoryId="kainan" className="h-8 w-8" /> },
    { id: 'museum', label: 'Museum', icon: <CategoryIcon categoryId="museum" className="h-8 w-8" /> },
  ]
  const areaItems: GuidedSectionItem[] = [
    { id: 'near-me', label: 'Near me', icon: <PinIcon /> },
    { id: 'makati', label: 'Makati' },
    { id: 'taguig', label: 'BGC' },
    { id: 'quezon-city', label: 'QC' },
    { id: 'manila', label: 'Manila' },
    { id: 'pasay', label: 'Pasay' },
  ]
  const budgetItems: GuidedSectionItem[] = [
    { id: 'free', label: 'Free' },
    { id: 'under-500', label: 'Under \u20b1500' },
    { id: '500-1000', label: '\u20b1500-\u20b11,000' },
    { id: '1000-2000', label: '\u20b11,000-\u20b12,000' },
    { id: '2000-plus', label: '\u20b12,000+' },
  ]

  return (
    <section className="w-full px-4 py-5 sm:px-6 lg:px-9 lg:pb-3 lg:pt-6">
      <section className="w-full overflow-hidden rounded-2xl border border-[var(--line)] bg-white/82 p-5 shadow-[0_18px_46px_rgba(28,77,160,0.08)] sm:p-7 lg:grid lg:grid-cols-[minmax(0,1fr)_440px] lg:items-center lg:gap-10 lg:p-10 xl:grid-cols-[minmax(0,1fr)_520px]">
        <div className="min-w-0">
          <h1 className="text-[34px] font-black leading-[1.05] text-slate-950 sm:text-[42px] lg:text-[34px]">
            Saan tayo gagala today?
          </h1>
          <p className="mt-3 text-lg font-semibold leading-relaxed text-slate-600 lg:text-base">
            Pick a vibe or type what you're looking for.
          </p>

          <div className="mt-5 lg:hidden">
            <GuidedIllustration categoryId={selectedCategory} />
          </div>

          <div className="mt-5">
            <SearchBar
              onSearch={onSearch}
              onClear={onClearSearch}
              clearSignal={clearSearchSignal}
              hasActiveFilters={hasActiveFilters}
              hasClearableSearch={hasSearched}
              isLoading={isSearching}
              placeholder={'Try "date in Makati"'}
              submitLabel="Go"
              className="rounded-xl border-[var(--line-strong)] px-3 py-2.5 shadow-none"
            />
            {isSearching ? <p className="mt-2 text-xs font-bold text-[var(--accent-deep)]">Searching...</p> : null}
            {searchError ? <p className="mt-2 text-xs font-bold text-red-600">{searchError}</p> : null}
          </div>

          <SearchModeTabs selectedMode={selectedMode} onModeChange={onModeChange} className="mt-5 rounded-xl lg:max-w-[640px]" />
          {selectedMode === 'places' ? (
            <button
              type="button"
              onClick={onOpenFilters}
              className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-4 py-2 text-sm font-bold text-[var(--accent-deep)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)]"
            >
              <FilterIcon className="h-4 w-4" />
              More filters
            </button>
          ) : null}
        </div>

        <div className="hidden lg:block">
          <GuidedIllustration categoryId={selectedCategory} />
        </div>
      </section>

      {selectedMode === 'places' ? (
        <div className="mt-6 grid w-full gap-5 overflow-hidden lg:mt-4 lg:gap-4">
          <GuidedChipSection
            title="Quick picks"
            icon={<SparkIcon />}
            items={quickPickItems}
            selectedId={selectedCategory}
            onSelect={(id) => onCategoryChange(selectedCategory === id ? null : id)}
          />
          <GuidedChipSection
            title="Popular areas"
            icon={<PinIcon />}
            items={areaItems}
            selectedId={selectedArea}
            onSelect={(id) => {
              if (id === 'near-me') {
                onNearMe()
                return
              }

              onAreaChange(selectedArea === id ? null : id)
            }}
          />
          <GuidedChipSection
            title="Budget"
            icon={<BudgetIcon />}
            items={budgetItems}
            selectedId={selectedBudget}
            onSelect={(id) => onBudgetChange(selectedBudget === id ? null : id as BudgetValue)}
          />
          <GuidedStartList onCategoryChange={onCategoryChange} onAreaChange={onAreaChange} onSearch={onSearch} />
        </div>
      ) : (
        <div className="mt-6 w-full">
          <p className="rounded-xl border border-[var(--line)] bg-white px-4 py-4 text-sm font-semibold text-slate-700">
            Ask AI is selected. Type your question above, then press Go.
          </p>
        </div>
      )}
    </section>
  )
}

function formatResetAtCompact(resetAt: string) {
  const resetDate = new Date(resetAt)

  if (Number.isNaN(resetDate.getTime())) {
    return resetAt
  }

  const datePart = resetDate.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  const timePart = resetDate.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).replace(' ', '\u00A0')

  return `${datePart}, ${timePart}`
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

function getValidSourceUrl(source: Record<string, unknown>): string | null {
  const rawUrl = typeof source.url === 'string'
    ? source.url
    : typeof source.uri === 'string'
      ? source.uri
      : null

  if (!rawUrl) {
    return null
  }

  try {
    const parsedUrl = new URL(rawUrl)
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:' ? parsedUrl.href : null
  } catch {
    return null
  }
}

function getSourceHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return url
  }
}

function getAskAiSourceList(value: unknown): AskAiSource[] {
  if (!Array.isArray(value)) {
    return []
  }

  const seenUrls = new Set<string>()

  return value
    .flatMap((source) => {
      if (!source || typeof source !== 'object') {
        return []
      }

      const candidate = source as Record<string, unknown>
      const url = getValidSourceUrl(candidate)

      if (!url || seenUrls.has(url)) {
        return []
      }

      seenUrls.add(url)

      return [{
        title: typeof candidate.title === 'string' && candidate.title.trim()
          ? candidate.title.trim()
          : getSourceHostname(url),
        url,
      }]
    })
}

function createPromptBuilderPrefill({
  plan,
  location,
  budget,
  priority,
}: {
  plan?: string | null
  location?: string | null
  budget?: string | null
  priority?: string | null
}) {
  const state = createEmptyPromptBuilderState()

  state.custom.plan = plan?.trim() ?? ''
  state.custom.location = location?.trim() ?? ''
  state.custom.budget = budget?.trim() ?? ''
  state.custom.vibe = priority?.trim() ?? ''

  return state
}

function AskAiAnswerText({ answer }: { answer: string }) {
  const lines = answer.replace(/\r\n/g, '\n').split('\n')

  return (
    <div className="grid gap-1 text-sm leading-relaxed text-slate-800">
      {lines.map((line, index) => {
        const trimmedLine = line.trim()
        const key = `${index}-${trimmedLine}`

        if (!trimmedLine) {
          return <div key={key} className="h-1" aria-hidden="true" />
        }

        if (/^[A-Z][A-Za-z /]+(?: .+)?[:ï¼š]$/.test(trimmedLine)) {
          return (
            <p key={key} className={index === 0 ? 'font-semibold text-slate-950' : 'mt-2 font-semibold text-slate-950'}>
              {trimmedLine}
            </p>
          )
        }

        if (/^[-*]\s+/.test(trimmedLine)) {
          return (
            <p key={key} className="pl-4 text-slate-800">
              <span aria-hidden="true">â€¢ </span>
              {trimmedLine.replace(/^[-*]\s+/, '')}
            </p>
          )
        }

        return <p key={key}>{trimmedLine}</p>
      })}
    </div>
  )
}

function WalletIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
      <path d="M4.5 8.5h15a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2Z" />
      <path d="M18.5 12h3" />
      <path d="M7 8.5V7.2a2.2 2.2 0 0 1 2.2-2.2h8.3" />
    </svg>
  )
}

function TransitIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
      <path d="M6.5 4.5h11A2.5 2.5 0 0 1 20 7v9.5A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5V7A2.5 2.5 0 0 1 6.5 4.5Z" />
      <path d="M7.5 16.5h9" />
      <path d="M8 4.5V3.2" />
      <path d="M16 4.5V3.2" />
      <path d="M7.5 19v1.3" />
      <path d="M16.5 19v1.3" />
      <path d="M9 10.5h2.3M12.7 10.5H15" />
    </svg>
  )
}

type AskAiQuickAction = {
  id: string
  label: string
  description: string
  prompt: string
  icon: ReactNode
  iconClassName?: string
}

function AskAiQuickActionCard({
  action,
  onQuestionChange,
}: {
  action: AskAiQuickAction
  onQuestionChange: (question: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onQuestionChange(action.prompt)}
      className="group flex min-h-[78px] flex-col rounded-[18px] border border-[rgba(20,35,58,0.12)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,249,255,0.98))] px-2.5 py-2.5 text-left shadow-[0_7px_16px_rgba(15,23,42,0.038)] transition hover:-translate-y-0.5 hover:border-[rgba(20,35,58,0.2)] hover:shadow-[0_12px_22px_rgba(15,23,42,0.065)] focus:outline-none focus:ring-2 focus:ring-[rgba(47,116,232,0.12)] lg:min-h-[168px] lg:rounded-[24px] lg:px-4 lg:py-4 lg:bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(246,249,255,0.99))] lg:focus:ring-[rgba(255,109,146,0.2)]"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] bg-[linear-gradient(135deg,#f8f8f8,#eceff4)] text-slate-700 ring-1 ring-[rgba(20,35,58,0.07)] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] lg:h-14 lg:w-14 lg:rounded-[18px] lg:text-slate-700 lg:ring-[rgba(20,35,58,0.07)]">
        <span className={action.iconClassName}>{action.icon}</span>
      </span>
      <span className="mt-2.5 min-w-0 flex-1 pt-0.5 lg:mt-0">
        <span className="block text-[12px] font-extrabold leading-[1.18] text-slate-900 lg:text-[1.05rem] lg:leading-[1.28]">{action.label}</span>
        <span className="mt-1 hidden text-[13px] leading-snug text-[var(--muted)] lg:block lg:text-[0.95rem] lg:leading-7">
          {action.description}
        </span>
      </span>
      <span className="mt-2 h-[2px] w-5 rounded-full bg-[linear-gradient(90deg,#d7dee9,#eef3fa)] lg:hidden" />
    </button>
  )
}

function QuestionCircleIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.8 9.3a2.4 2.4 0 1 1 3.3 2.2c-.8.37-1.35 1-1.35 1.85v.35" />
      <circle cx="12" cy="17.2" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  )
}

function InfoCircleIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10.4v5.1" />
      <circle cx="12" cy="7.4" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  )
}

function getAskAiAnswerLead(answer: string) {
  const cleaned = answer.replace(/\r\n/g, '\n').trim()
  if (!cleaned) {
    return 'Here’s a practical gala plan for you.'
  }

  const firstSentence = cleaned.match(/^.*?[.!?](?:\s|$)/)?.[0].trim()
  return firstSentence || 'Here’s a practical gala plan for you.'
}

function getAskAiBulletLines(answer: string) {
  return answer
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .slice(0, 4)
    .map((line) => line.replace(/^[-*]\s+/, ''))
}

function AskAiOutputStage({
  question,
  answer,
  sources,
  chibiImage,
  onOpenPromptBuilder,
  onSwitchToPlaces,
  onStartOver,
  className = '',
}: {
  question: string
  answer: string
  sources: AskAiSource[]
  chibiImage: string
  onOpenPromptBuilder: () => void
  onSwitchToPlaces: () => void
  onStartOver: () => void
  className?: string
}) {
  const leadLine = getAskAiAnswerLead(answer)
  const bulletLines = getAskAiBulletLines(answer)

  return (
    <section
      className={`relative overflow-hidden bg-[linear-gradient(180deg,#f8fbff_0%,#eff5ff_100%)] px-4 py-4 text-[var(--text)] sm:px-5 sm:py-5 lg:bg-[linear-gradient(180deg,#fffdfb_0%,#f8f2ff_42%,#eef5ff_100%)] lg:px-8 lg:py-7 ${className} min-h-[calc(100dvh-88px)]`}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-12 top-8 h-40 w-40 rounded-full bg-[rgba(255,164,190,0.24)] blur-3xl" />
        <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-[rgba(255,201,213,0.22)] blur-3xl" />
        <div className="absolute bottom-0 right-1/3 h-36 w-36 rounded-full bg-[rgba(255,229,236,0.3)] blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100dvh-144px)] w-full max-w-[min(1500px,calc(100vw-96px))] flex-col gap-5 lg:gap-7">
        <nav className="flex items-center text-[0.82rem] font-black text-slate-500" aria-label="Ask AI breadcrumb">
          <button
            type="button"
            onClick={onStartOver}
            className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[rgba(20,35,58,0.12)] bg-white/90 px-3 text-slate-700 shadow-[0_10px_22px_rgba(15,23,42,0.045)] transition hover:border-[var(--accent)] hover:text-[var(--accent-deep)]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
            <span>Back to Ask AI</span>
          </button>
          <span className="mx-2 text-slate-300">/</span>
          <span className="truncate uppercase tracking-[0.12em]">Answer</span>
        </nav>

        <div>
          <p className="text-[0.9rem] font-black uppercase tracking-[0.12em] text-slate-500">Your question</p>
          <div className="mt-2.5 inline-block max-w-full rounded-[16px] border border-[rgba(20,35,58,0.22)] bg-white/96 px-4 py-3.5 shadow-[0_12px_26px_rgba(15,23,42,0.045),inset_0_1px_0_rgba(255,255,255,0.9)] sm:px-5 sm:py-4 lg:max-w-[980px] xl:max-w-[1120px]">
            <p className="text-[1.08rem] font-bold leading-7 tracking-[-0.01em] text-slate-950 sm:text-[1.18rem] sm:leading-8 lg:text-[1.12rem]">
              {question}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-5 lg:-mt-2">
          <div className="relative flex items-end justify-center">
            <img
              src={chibiImage}
              alt=""
              className="h-[220px] w-auto max-w-full object-contain sm:h-[280px] lg:h-[330px] xl:h-[360px]"
              loading="lazy"
            />
            <div className="absolute right-0 top-8 hidden rounded-[26px] border border-[rgba(255,156,176,0.24)] bg-white px-5 py-4 text-center shadow-[0_12px_24px_rgba(15,23,42,0.045)] lg:block">
              <p className="text-[1.1rem] font-black text-slate-900">Here’s a practical</p>
              <p className="mt-1 text-[1.1rem] font-black text-slate-900">gala plan for you.</p>
            </div>
          </div>
        </div>
        <div className="grid items-start gap-5 lg:mt-auto lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="w-full rounded-[30px] border border-[rgba(255,156,176,0.24)] bg-white px-4 py-4 shadow-[0_16px_34px_rgba(15,23,42,0.05)] sm:px-6 sm:py-6">
            <div className="grid gap-0">
              <div className="grid gap-3 border-b border-dashed border-[rgba(255,156,176,0.22)] py-4 first:pt-0">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[rgba(255,107,143,0.12)] text-[#ff6b8f]">
                    <SparkIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[1.05rem] font-black text-[#ff5f8b]">Quick answer</p>
                    <div className="mt-2">
                      <AskAiAnswerText answer={answer} />
                    </div>
                  </div>
                </div>
              </div>

            <div className="grid gap-3 border-b border-dashed border-[rgba(255,156,176,0.22)] py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[rgba(255,107,143,0.12)] text-[#ff6b8f]">
                  <HeartOutlineIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[1.05rem] font-black text-[#ff5f8b]">Best plan</p>
                  {bulletLines.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-7 text-slate-800">
                      {bulletLines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm leading-7 text-slate-800">
                      {leadLine}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-3 border-b border-dashed border-[rgba(255,156,176,0.22)] py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[rgba(255,107,143,0.12)] text-[#ff6b8f]">
                  <SparkIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[1.05rem] font-black text-[#ff5f8b]">Why this works</p>
                  <p className="mt-2 text-sm leading-7 text-slate-800">
                    It keeps the plan practical, compact, and easy to follow without overcomplicating the outing.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[rgba(255,107,143,0.12)] text-[#ff6b8f]">
                  <SparkIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[1.05rem] font-black text-[#ff5f8b]">Tip</p>
                  <p className="mt-2 text-sm leading-7 text-slate-800">
                    Add the area, budget, or vibe you want next time so the plan gets even tighter.
                  </p>
                </div>
              </div>
            </div>
            </div>
          </div>

          <aside className="grid gap-3 lg:sticky lg:top-6">
            <p className="text-[1.05rem] font-black text-slate-950">Other actions</p>
            <button
              type="button"
              onClick={onOpenPromptBuilder}
              className="flex items-center gap-3 rounded-[22px] border border-[rgba(190,165,255,0.24)] bg-[linear-gradient(180deg,#ffffff,#f8f2ff)] px-4 py-4 text-left shadow-[0_12px_28px_rgba(15,23,42,0.045)] transition hover:border-[rgba(140,88,225,0.26)]"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-[rgba(140,88,225,0.1)] text-[#8b5cf6]">
                <SparkIcon className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-slate-950">Use Prompt Builder</p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                  Turn the idea into a cleaner, stronger prompt.
                </p>
              </div>
              <ChevronRightIcon className="h-5 w-5 shrink-0 text-[#8b5cf6]" />
            </button>

            <button
              type="button"
              onClick={onSwitchToPlaces}
              className="flex items-center gap-3 rounded-[22px] border border-[rgba(120,170,255,0.22)] bg-[linear-gradient(180deg,#ffffff,#f4f8ff)] px-4 py-4 text-left shadow-[0_12px_28px_rgba(15,23,42,0.045)] transition hover:border-[rgba(47,116,232,0.26)]"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-[rgba(47,116,232,0.1)] text-[var(--accent-deep)]">
                <BuildingIcon className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-slate-950">Search Places</p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                  Jump to places and explore the options visually.
                </p>
              </div>
              <ChevronRightIcon className="h-5 w-5 shrink-0 text-[var(--accent-deep)]" />
            </button>
          </aside>
        </div>

        {sources.length > 0 ? (
          <div className="rounded-[28px] border border-[rgba(255,156,176,0.24)] bg-white px-4 py-4 shadow-[0_14px_32px_rgba(15,23,42,0.045)] sm:px-5 sm:py-5">
            <div className="flex items-center gap-2">
              <p className="text-[1.05rem] font-black text-slate-950">Sources</p>
              <span className="rounded-full bg-[rgba(255,107,143,0.12)] px-2 py-1 text-[11px] font-black text-[#e34c78]">
                Double-check when needed
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {sources.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-[76px] items-center justify-between gap-3 rounded-[20px] border border-[rgba(255,156,176,0.24)] bg-[linear-gradient(180deg,#fffdfd,#fff4f7)] px-4 py-3 transition hover:border-[var(--accent)] hover:bg-[rgba(255,247,250,0.98)]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950">{source.title}</p>
                    <p className="mt-1 truncate text-xs font-medium text-[var(--muted)]">{getSourceHostname(source.url)}</p>
                  </div>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-[#ff6b8f]" />
                </a>
              ))}
            </div>
          </div>
        ) : null}

      </div>
    </section>
  )
}

function AskAiThinkingStage({
  question,
  chibiImage,
  onCancel,
  className = '',
}: {
  question: string
  chibiImage: string
  onCancel: () => void
  className?: string
}) {
  const loadingMessageText = 'This may take a few seconds if current info is needed.'
  const [miniGameStage, setMiniGameStage] = useState<'hidden' | 'invite' | 'game'>('hidden')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMiniGameStage('invite')
    }, 4500)

    return () => {
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (miniGameStage !== 'game') {
      return
    }

    const previousBodyOverflow = document.body.style.overflow
    const previousHtmlOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousHtmlOverflow
    }
  }, [miniGameStage])

  return (
    <section className={`relative overflow-hidden bg-[linear-gradient(180deg,#f8fbff_0%,#eff5ff_100%)] px-4 py-4 text-[var(--text)] sm:px-5 sm:py-5 lg:bg-[linear-gradient(180deg,#fffdfb_0%,#f8f2ff_42%,#eef5ff_100%)] lg:px-8 lg:py-7 ${className} min-h-[calc(100dvh-88px)]`}>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-12 top-8 h-40 w-40 rounded-full bg-[rgba(255,164,190,0.22)] blur-3xl" />
        <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-[rgba(255,201,213,0.18)] blur-3xl" />
        <div className="absolute bottom-0 right-1/3 h-36 w-36 rounded-full bg-[rgba(255,229,236,0.26)] blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100dvh-144px)] w-full max-w-[min(1500px,calc(100vw-96px))] flex-col">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex w-fit items-center gap-2 rounded-full px-1 py-1 text-[1.05rem] font-bold text-slate-700 transition hover:text-slate-950 sm:text-[1.1rem]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-5 w-5">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          Back
        </button>

        <h1 className="mt-6 text-[3.1rem] font-black leading-none tracking-[-0.055em] text-slate-950 sm:text-[4rem] lg:mt-8 lg:text-[4.5rem]">
          Ask AI
        </h1>

        <div className="mt-7 lg:mt-8">
          <p className="text-[0.9rem] font-black uppercase tracking-[0.12em] text-slate-500">Your question</p>
          <div className="mt-2.5 inline-block max-w-full rounded-[16px] border border-[rgba(20,35,58,0.22)] bg-white/96 px-4 py-3.5 shadow-[0_12px_26px_rgba(15,23,42,0.045),inset_0_1px_0_rgba(255,255,255,0.9)] sm:px-5 sm:py-4 lg:max-w-[980px] xl:max-w-[1120px]">
            <p className="text-[1.08rem] font-bold leading-7 tracking-[-0.01em] text-slate-950 sm:text-[1.18rem] sm:leading-8 lg:text-[1.12rem]">
              {question}
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-1 flex-col items-center justify-center text-center sm:mt-10 lg:mt-5">
          <div className="flex items-center justify-center">
            <img
              src={chibiImage}
              alt=""
              className="h-[210px] w-auto max-w-full object-contain sm:h-[290px] lg:h-[250px]"
              loading="lazy"
            />
          </div>

          <div className="relative -mt-3 w-full max-w-[370px] rounded-[18px] border border-[rgba(20,35,58,0.34)] bg-white px-4 pb-4 pt-4 shadow-[0_12px_28px_rgba(15,23,42,0.045)] sm:max-w-[420px] sm:px-5 lg:max-w-[370px]">
            <span className="absolute left-1/2 top-0 h-4.5 w-4.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-l border-t border-[rgba(20,35,58,0.34)] bg-white" />
            <div className="relative flex flex-col items-center gap-2.5">
              <span className="flex items-center gap-2.5">
                <span className="h-3.5 w-3.5 rounded-full bg-slate-600 animate-pulse" />
                <span className="h-3.5 w-3.5 rounded-full bg-slate-600 animate-pulse" style={{ animationDelay: '120ms' }} />
                <span className="h-3.5 w-3.5 rounded-full bg-slate-600 animate-pulse" style={{ animationDelay: '240ms' }} />
              </span>
              <p className="text-[1.15rem] font-bold leading-tight text-slate-700 sm:text-[1.35rem] lg:text-[1.15rem]">
                GalaTayo is thinking...
              </p>
            </div>
          </div>

          <p className="mt-7 max-w-[680px] text-[1.2rem] font-semibold italic leading-8 tracking-[-0.02em] text-slate-700 sm:text-[1.45rem] sm:leading-[2.25rem] lg:mt-6 lg:text-[1.3rem]">
            “Inaayos ko yung best gala plan for you...”
          </p>
          <p className="mt-3 text-[0.95rem] italic leading-6 text-slate-500 sm:text-[1.05rem] lg:text-[0.95rem]">
            {loadingMessageText}
          </p>
        </div>

        {miniGameStage === 'invite' ? createPortal(
          <div className="fixed inset-0 z-[9990] pointer-events-none flex h-[100dvh] items-center justify-center px-4 py-6">
            <div className="pointer-events-auto w-full max-w-[340px] rounded-[24px] border border-[rgba(20,35,58,0.1)] bg-white/97 p-4 shadow-[0_22px_50px_rgba(15,23,42,0.18)] backdrop-blur-md sm:max-w-[370px]">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#fff2f6,#edf5ff)] text-[#e34c78] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                    <path d="M12 3v18" />
                    <path d="M5 8h14" />
                    <path d="M7 16h10" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#e34c78]">Mini game</p>
                      <h3 className="mt-1 text-[1rem] font-black leading-tight text-slate-950">Tiny rhythm break?</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMiniGameStage('hidden')}
                      className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-[rgba(20,35,58,0.1)] bg-slate-50 px-3 text-[11px] font-black text-slate-700 transition hover:border-[rgba(255,107,143,0.22)] hover:text-[#e34c78]"
                    >
                      Not now
                    </button>
                  </div>
                  <p className="mt-2 text-[0.84rem] leading-5 text-[var(--muted)]">
                    Play while GalaTayo finishes your answer.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setMiniGameStage('game')}
                  className="inline-flex min-h-10 flex-1 items-center justify-center rounded-[14px] bg-slate-950 px-4 text-[0.9rem] font-black text-white shadow-[0_12px_20px_rgba(15,23,42,0.14)] transition hover:brightness-110"
                >
                  Play mini game
                </button>
              </div>
            </div>
          </div>,
          document.body,
        ) : null}

        {miniGameStage === 'game' ? createPortal(
          <div
            className="fixed inset-0 z-[9990] flex h-[100dvh] items-stretch justify-center overscroll-none bg-[linear-gradient(180deg,#fffdfd,#fff3f7)]"
            role="presentation"
            onClick={() => setMiniGameStage('hidden')}
          >
            <div
              className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[linear-gradient(180deg,#fffdfd,#fff4f8)] px-4 pb-4 pt-[max(16px,env(safe-area-inset-top))] shadow-none touch-auto sm:px-6 sm:pb-6 lg:px-10 lg:pb-8 lg:pt-8"
              role="dialog"
              aria-modal="true"
              aria-label="Tap the Gala Pin mini game"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mx-auto mb-3 flex w-full max-w-[min(1500px,calc(100vw-96px))] shrink-0 items-start justify-between gap-4 px-1 pt-1 sm:px-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#e34c78]">Mini game</p>
                  <h3 className="mt-1 text-[1.05rem] font-black leading-tight text-slate-950 lg:text-[1.35rem]">Tap the Gala Pin</h3>
                  <p className="mt-1 max-w-[560px] text-[0.84rem] leading-5 text-[var(--muted)] lg:text-[0.95rem] lg:leading-6">
                    GalaTayo is still generating your AI answer while you play.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMiniGameStage('hidden')}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-[rgba(20,35,58,0.12)] bg-white px-4 text-sm font-black text-slate-700 shadow-[0_10px_20px_rgba(15,23,42,0.05)] transition hover:border-[rgba(255,107,143,0.24)] hover:text-[#e34c78]"
                >
                  Close
                </button>
              </div>
              <TapGalaPinGame isLoading={true} className="mx-auto min-h-0 w-full max-w-[min(1500px,calc(100vw-96px))] flex-1" />
            </div>
          </div>,
          document.body,
        ) : null}
      </div>
    </section>
  )
}

function AskAiPlaceholder({
  usageStatus,
  question,
  answer,
  sources,
  isSubmitting,
  answerError,
  onQuestionChange,
  onSubmit,
  onCancel,
  onSwitchToPlaces,
  onStartOver,
  onOpenPromptBuilder,
  className = '',
}: {
  usageStatus: AskAiUsageStatus
  question: string
  answer: string
  sources: AskAiSource[]
  isSubmitting: boolean
  answerError: string | null
  onQuestionChange: (question: string) => void
  onSubmit: () => void
  onCancel: () => void
  onSwitchToPlaces: () => void
  onStartOver: () => void
  onOpenPromptBuilder: () => void
  className?: string
}) {
  const isLimitReached = !usageStatus.allowed || usageStatus.remaining <= 0
  const canSubmit = !isSubmitting && !isLimitReached && question.trim().length > 0
  const chibiImage = answerError
    ? askAiErrorChibi
    : isSubmitting
      ? askAiThinkingChibi
    : answer
      ? askAiOutputChibi
      : askAiStartChibi

  if (isSubmitting) {
    return <AskAiThinkingStage question={question} chibiImage={chibiImage} onCancel={onCancel} className={className} />
  }

  if (answer) {
    return (
      <AskAiOutputStage
        question={question}
        answer={answer}
        sources={sources}
        chibiImage={chibiImage}
        onOpenPromptBuilder={onOpenPromptBuilder}
        onSwitchToPlaces={onSwitchToPlaces}
        onStartOver={onStartOver}
        className={className}
      />
    )
  }

  const quickActions: AskAiQuickAction[] = [
    {
      id: 'date',
      label: 'Plan a chill date',
      description: 'Get a simple and fun date idea.',
      prompt: 'Plan a chill date in Metro Manila under â‚±1,000.',
      icon: <HeartOutlineIcon className="h-4.5 w-4.5" />,
    },
    {
      id: 'compare',
      label: 'Compare two places',
      description: 'See which one fits you best.',
      prompt: 'Compare two places I am choosing between and help me decide.',
      icon: <BuildingIcon className="h-4.5 w-4.5" />,
    },
    {
      id: 'itinerary',
      label: 'Make an itinerary',
      description: 'Get a step-by-step plan.',
      prompt: 'Make a half-day itinerary for a fun gala around Metro Manila.',
      icon: <SparkIcon className="h-4.5 w-4.5" />,
    },
    {
      id: 'budget',
      label: 'Find a budget plan',
      description: 'Plan a great gala within your budget.',
      prompt: 'Find a budget-friendly plan for a barkada gala today.',
      icon: <WalletIcon className="h-4.5 w-4.5" />,
    },
    {
      id: 'hours',
      label: 'Check hours or fees',
      description: 'See the usual schedule and costs.',
      prompt: 'Check the usual opening hours and entrance fees for this place.',
      icon: <MuseumIcon className="h-4.5 w-4.5" />,
    },
    {
      id: 'rain',
      label: 'Rainy-day backup',
      description: 'Get indoor options and backup ideas.',
      prompt: 'Suggest a rainy-day plan with indoor options and backup ideas.',
      icon: <UmbrellaIcon className="h-4.5 w-4.5" />,
    },
    {
      id: 'food',
      label: 'Food trip route',
      description: 'Map out a relaxed food crawl.',
      prompt: 'Plan a food trip route with good stops and a relaxed pace.',
      icon: <CafeIcon className="h-4.5 w-4.5" />,
    },
    {
      id: 'commute',
      label: 'Commute-friendly plan',
      description: 'Find something easy to reach.',
      prompt: 'Suggest a commute-friendly plan with easy transit options.',
      icon: <TransitIcon className="h-4.5 w-4.5" />,
    },
  ]

  const featuredQuickActions = quickActions.slice(0, 4)
  const questionLength = question.length
  const questionLimit = 950

  return (
    <section
      className={`relative overflow-hidden bg-[linear-gradient(180deg,#f8fbff_0%,#eff5ff_100%)] px-4 py-4 text-[var(--text)] sm:px-5 sm:py-5 lg:bg-[linear-gradient(180deg,#fffdfb_0%,#f8f2ff_42%,#eef5ff_100%)] lg:px-8 lg:py-7 ${className}`}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-12 top-8 h-40 w-40 rounded-full bg-[rgba(201,217,242,0.4)] blur-3xl lg:bg-[rgba(255,180,203,0.44)]" />
        <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-[rgba(192,202,255,0.36)] blur-3xl" />
        <div className="absolute bottom-0 right-1/3 h-36 w-36 rounded-full bg-[rgba(226,232,240,0.34)] blur-3xl lg:bg-[rgba(255,215,170,0.28)]" />
      </div>

      <div className="relative flex w-full flex-col gap-4 lg:px-4 xl:px-6">
        <div className="grid gap-5 lg:hidden">
          <div className="grid items-center gap-4 px-1 pt-1 sm:grid-cols-[minmax(0,1fr)_230px] sm:gap-5">
            <div className="min-w-0">
              <h1 className="max-w-[9ch] text-[2.55rem] font-black leading-[0.95] tracking-[-0.05em] text-slate-950">
                Turn one idea into a full gala plan.
              </h1>
              <p className="mt-4 max-w-[18rem] text-[15px] leading-7 text-[var(--muted)]">
                Share the vibe, budget, or place you&apos;re considering and GalaTayo will help shape the next move.
              </p>
            </div>
            <img
              src={chibiImage}
              alt=""
              className="mx-auto h-[210px] w-auto max-w-full object-contain sm:h-[230px]"
              loading="lazy"
            />
          </div>

          <div className="rounded-[24px] border border-[rgba(20,35,58,0.12)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,255,0.98))] px-4 py-3 shadow-[0_12px_28px_rgba(15,23,42,0.045)]">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-[linear-gradient(135deg,#f8f8f8,#eceff4)] text-slate-700 ring-1 ring-[rgba(20,35,58,0.07)]">
                <SparkIcon className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-extrabold text-slate-950">{usageStatus.remaining} uses left today</p>
                <p className="mt-0.5 text-[12px] font-medium leading-5 text-[var(--muted)]">
                  <span className="whitespace-nowrap">Resets {formatResetAtCompact(usageStatus.resetAt)}</span>
                </p>
              </div>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600">
                <InfoCircleIcon className="h-5.5 w-5.5" />
              </span>
            </div>
          </div>

          <div className="px-1">
            <p className="text-[15px] font-extrabold text-slate-950">Try these ideas</p>
          </div>

          <div className="grid grid-cols-2 gap-2 px-1 min-[560px]:grid-cols-4">
            {featuredQuickActions.map((action) => (
              <AskAiQuickActionCard key={action.id} action={action} onQuestionChange={onQuestionChange} />
            ))}
          </div>

          <div className="rounded-[28px] border border-[rgba(20,35,58,0.12)] bg-white px-5 py-5 shadow-[0_14px_32px_rgba(15,23,42,0.05)]">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-[linear-gradient(180deg,#f4f4f5,#eceef2)] text-slate-700 ring-1 ring-[rgba(20,35,58,0.08)]">
                <SparkIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <label className="text-[15px] font-extrabold text-slate-950" htmlFor="ask-ai-question">
                  Ask anything about your gala plan
                </label>
                <p className="mt-1 text-[13px] leading-6 text-[var(--muted)]">
                  Keep it short. Ask in plain language and we&apos;ll do the shaping.
                </p>
              </div>
            </div>

            <div className="mt-4">
              <div className="rounded-[22px] border border-[rgba(20,35,58,0.18)] bg-[linear-gradient(180deg,#ffffff,#fbfcff)] px-4 py-4">
                <textarea
                  id="ask-ai-question"
                  value={question}
                  onChange={(event) => onQuestionChange(event.target.value)}
                  disabled={isSubmitting || isLimitReached}
                  rows={5}
                  maxLength={questionLimit}
                  placeholder="Example: Plan a chill date in Makati under ₱1,000."
                  className="min-h-[124px] w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-[2.05rem] text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-400"
                />
                <div className="mt-2 text-right text-sm text-slate-500">{questionLength}/{questionLimit}</div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-[13px] leading-5 text-slate-600">
                <span className="rounded-full border border-[rgba(20,35,58,0.1)] bg-[#f7f7f8] px-3 py-1.5">
                  Tip: tap a suggestion above.
                </span>
                <span className="rounded-full border border-[rgba(20,35,58,0.1)] bg-[#f7f7f8] px-3 py-1.5">
                  One sentence is enough.
                </span>
              </div>

              {answerError ? (
                <div className="mt-4 rounded-[22px] border border-[rgba(255,119,148,0.24)] bg-[linear-gradient(180deg,rgba(255,241,245,0.98),rgba(255,250,251,0.94))] px-4 py-3">
                  <p className="text-sm font-bold text-[#c94b6e]">{answerError}</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#c94b6e]/85">
                    Ask AI is temporarily unavailable right now. You can still build a prompt or try again later.
                  </p>
                </div>
              ) : null}

              {isLimitReached ? (
                <div className="mt-4 rounded-[22px] border border-[rgba(191,205,255,0.36)] bg-[linear-gradient(180deg,rgba(246,247,255,0.98),rgba(239,244,255,0.94))] px-4 py-3">
                  <p className="text-sm font-bold text-slate-900">You&apos;ve used today&apos;s Ask AI.</p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                    You can still shape a stronger prompt or keep searching manually.
                  </p>
                </div>
              ) : null}

              <button
                type="button"
                onClick={onSubmit}
                disabled={!canSubmit}
                className="mt-4 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-[22px] bg-[linear-gradient(180deg,#a9a9ab,#77777a)] px-6 py-3 text-[1.05rem] font-black text-white shadow-[0_14px_24px_rgba(15,23,42,0.18)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <SparkIcon className="h-4.5 w-4.5" />
                {isSubmitting ? 'Asking...' : 'Ask AI'}
              </button>

              <p className="mt-4 text-center text-[13px] text-slate-600">
                {isSubmitting ? 'Thinking...' : 'Start with one sentence, then refine as you go.'}
              </p>
            </div>
          </div>

          <div className="rounded-[28px] border border-[rgba(20,35,58,0.12)] bg-white px-5 py-5 shadow-[0_14px_32px_rgba(15,23,42,0.05)]">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(180deg,#f4f4f5,#eceef2)] text-slate-700 ring-1 ring-[rgba(20,35,58,0.08)]">
                <QuestionCircleIcon className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-extrabold text-slate-950">Need help wording it?</p>
                <p className="mt-1 text-[13px] leading-6 text-[var(--muted)]">
                  Use Prompt Builder if you want to turn a rough idea into a cleaner prompt before sending it anywhere.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={onOpenPromptBuilder}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] border border-[rgba(20,35,58,0.18)] bg-white px-4 py-3 text-sm font-black text-slate-900 transition hover:bg-slate-50 sm:w-auto sm:min-w-[260px]"
              >
                Use Prompt Builder
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Output stage is rendered above when an answer exists. */}
        </div>

        <aside className="hidden gap-6 lg:grid">
          <div className="overflow-hidden rounded-[34px] border border-[rgba(20,35,58,0.12)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,249,255,0.98))] px-8 py-8 shadow-[0_16px_36px_rgba(15,23,42,0.045)] xl:px-10 xl:py-9">
            <div className="grid items-center gap-8 xl:grid-cols-[minmax(0,1fr)_520px]">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(20,35,58,0.14)] bg-white px-4 py-2 text-[0.95rem] font-extrabold text-slate-800 shadow-[0_4px_10px_rgba(15,23,42,0.03)]">
                  <SparkIcon className="h-4.5 w-4.5" />
                  ASK AI
                </div>
                <h1 className="mt-5 max-w-[8.4ch] text-[4rem] font-black leading-[0.92] tracking-[-0.06em] text-slate-950 xl:text-[4.35rem]">
                  Turn one idea into a full gala plan.
                </h1>
                <p className="mt-5 max-w-[31rem] text-[1.18rem] leading-9 text-[var(--muted)]">
                  Share the vibe, budget, or place you&apos;re considering and GalaTayo will help shape the next move.
                </p>

                <div className="mt-8 max-w-[420px] rounded-[24px] border border-[rgba(20,35,58,0.12)] bg-white px-5 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.035)]">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-[linear-gradient(135deg,#f8f8f8,#eceff4)] text-slate-700 ring-1 ring-[rgba(20,35,58,0.07)]">
                      <SparkIcon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[1.05rem] font-extrabold text-slate-950">{usageStatus.remaining} uses left today</p>
                      <p className="mt-1 text-[0.95rem] leading-7 text-[var(--muted)]">
                        <span className="whitespace-nowrap">Resets {formatResetAtCompact(usageStatus.resetAt)}</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative">
                <div className="pointer-events-none absolute -right-2 top-6 grid grid-cols-4 gap-2 opacity-35">
                  {Array.from({ length: 24 }).map((_, index) => (
                    <span key={index} className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                  ))}
                </div>
                <div className="pointer-events-none absolute -bottom-18 right-[-2.5rem] h-44 w-44 rounded-full border border-[rgba(20,35,58,0.12)]" />
                <div className="pointer-events-none absolute -bottom-10 right-[-1.25rem] h-32 w-32 rounded-full border border-[rgba(20,35,58,0.12)]" />
                <img
                  src={chibiImage}
                  alt=""
                  className="relative mx-auto h-[330px] w-auto max-w-full object-contain xl:h-[360px]"
                  loading="lazy"
                />
              </div>
            </div>
          </div>

          <div>
            <p className="text-[1.15rem] font-extrabold text-slate-950">Try these ideas</p>
          </div>

          <div className="grid gap-4 xl:grid-cols-4">
            {featuredQuickActions.map((action) => (
              <AskAiQuickActionCard key={action.id} action={action} onQuestionChange={onQuestionChange} />
            ))}
          </div>

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-[30px] border border-[rgba(20,35,58,0.12)] bg-white px-6 py-6 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
              <div className="flex items-start gap-4">
                <span className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-[linear-gradient(180deg,#f4f4f5,#eceef2)] text-slate-700 ring-1 ring-[rgba(20,35,58,0.08)]">
                  <SparkIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <label className="text-[1.1rem] font-extrabold text-slate-950" htmlFor="ask-ai-question">
                    Ask anything about your gala plan
                  </label>
                  <p className="mt-1 text-[0.95rem] leading-7 text-[var(--muted)]">
                    Keep it short. Ask in plain language and we&apos;ll do the shaping.
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <div className="rounded-[24px] border border-[rgba(20,35,58,0.18)] bg-[linear-gradient(180deg,#ffffff,#fbfcff)] px-5 py-5">
                  <textarea
                    id="ask-ai-question"
                    value={question}
                    onChange={(event) => onQuestionChange(event.target.value)}
                    disabled={isSubmitting || isLimitReached}
                    rows={5}
                    maxLength={questionLimit}
                    placeholder="Example: Plan a chill date in Makati under ₱1,000."
                    className="min-h-[152px] w-full resize-none border-0 bg-transparent p-0 text-[1rem] leading-9 text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-400"
                  />
                  <div className="mt-2 text-right text-[0.95rem] text-slate-500">{questionLength}/{questionLimit}</div>
                </div>

                <div className="mt-4 flex flex-wrap gap-3 text-[0.95rem] text-slate-600">
                  <span className="rounded-full border border-[rgba(20,35,58,0.1)] bg-[#f7f7f8] px-4 py-2">
                    Tip: tap a suggestion above.
                  </span>
                  <span className="rounded-full border border-[rgba(20,35,58,0.1)] bg-[#f7f7f8] px-4 py-2">
                    One sentence is enough.
                  </span>
                </div>

                {answerError ? (
                  <div className="mt-4 rounded-[22px] border border-[rgba(255,119,148,0.24)] bg-[linear-gradient(180deg,rgba(255,241,245,0.98),rgba(255,250,251,0.94))] px-4 py-3">
                    <p className="text-sm font-bold text-[#c94b6e]">{answerError}</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#c94b6e]/85">
                      Ask AI is temporarily unavailable right now. You can still build a prompt or try again later.
                    </p>
                  </div>
                ) : null}

                {isLimitReached ? (
                  <div className="mt-4 rounded-[22px] border border-[rgba(191,205,255,0.36)] bg-[linear-gradient(180deg,rgba(246,247,255,0.98),rgba(239,244,255,0.94))] px-4 py-3">
                    <p className="text-sm font-bold text-slate-900">You&apos;ve used today&apos;s Ask AI.</p>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                      You can still shape a stronger prompt or keep searching manually.
                    </p>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={!canSubmit}
                  className="mt-5 inline-flex min-h-15 w-full items-center justify-center gap-2 rounded-[20px] bg-[linear-gradient(180deg,#8e8e91,#67676a)] px-6 py-4 text-[1.2rem] font-black text-white shadow-[0_14px_24px_rgba(15,23,42,0.18)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <SparkIcon className="h-5 w-5" />
                  {isSubmitting ? 'Asking...' : 'Ask AI'}
                </button>

                <p className="mt-4 text-center text-[0.98rem] text-slate-600">
                  {isSubmitting ? 'Thinking...' : 'Start with one sentence, then refine as you go.'}
                </p>
              </div>
            </div>

            <div className="self-start rounded-[30px] border border-[rgba(20,35,58,0.12)] bg-white px-6 py-6 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(180deg,#f4f4f5,#eceef2)] text-slate-700 ring-1 ring-[rgba(20,35,58,0.08)]">
                  <QuestionCircleIcon className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[1.1rem] font-extrabold text-slate-950">Need help wording it?</p>
                  <p className="mt-2 text-[0.95rem] leading-8 text-[var(--muted)]">
                    Use Prompt Builder if you want to turn a rough idea into a cleaner prompt before sending it anywhere.
                  </p>
                </div>
              </div>
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={onOpenPromptBuilder}
                  className="inline-flex min-w-[240px] items-center justify-center gap-2 rounded-[18px] border border-[rgba(20,35,58,0.18)] bg-white px-5 py-3.5 text-[1.05rem] font-black text-slate-900 transition hover:bg-slate-50"
                >
                  Use Prompt Builder
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {answer ? (
            <div className="rounded-[30px] border border-[rgba(20,35,58,0.12)] bg-white px-6 py-2 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
              <div className="border-b border-[rgba(20,35,58,0.08)] px-0 py-5">
                <div className="flex items-center gap-2 text-[1.05rem] font-black text-slate-950">
                  <SparkIcon className="h-5 w-5 text-slate-600" />
                  Your answer
                </div>
              </div>
              <div className="grid gap-4 px-0 py-5 xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start">
                <AskAiAnswerText answer={answer} />
                {sources.length > 0 ? (
                  <div className="rounded-[22px] border border-[rgba(191,205,255,0.24)] bg-[rgba(247,249,255,0.9)] px-4 py-3">
                    <p className="text-xs font-black uppercase tracking-[0.08em] text-[var(--muted)]">Sources</p>
                    <div className="mt-2 grid gap-1.5">
                      {sources.map((source) => (
                        <a
                          key={source.url}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate text-sm font-semibold text-[var(--accent-deep)] underline-offset-2 hover:underline"
                        >
                          {source.title}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  )
}

function AskAiSignInRequired({
  className = '',
  onOpenPromptBuilder,
}: {
  className?: string
  onOpenPromptBuilder: () => void
}) {
  return (
    <section className={`relative overflow-hidden bg-[linear-gradient(180deg,#fffdfb_0%,#f8f2ff_42%,#eef5ff_100%)] px-4 py-5 ${className}`}>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-12 top-8 h-40 w-40 rounded-full bg-[rgba(255,180,203,0.44)] blur-3xl" />
        <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-[rgba(192,202,255,0.36)] blur-3xl" />
      </div>

      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.82fr)] lg:items-center">
        <div className="overflow-hidden rounded-[32px] border border-[rgba(255,176,199,0.24)] bg-white/88 p-5 shadow-[0_22px_60px_rgba(15,23,42,0.08)] sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <img
              src={protectedFeatureChibi}
              alt=""
              className="mx-auto h-32 w-32 shrink-0 object-contain lg:mx-0"
              loading="lazy"
            />
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,176,199,0.18)] bg-[rgba(255,245,248,0.88)] px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-deep)]">
                <SparkIcon className="h-4 w-4" />
                Ask AI
              </div>
              <p className="mt-3 text-3xl font-black leading-tight text-slate-950 sm:text-[2.5rem]">
                Sign in to unlock Ask AI.
              </p>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--muted)] sm:text-[15px]">
                Ask AI is reserved for GalaTayo members. If you want to draft a prompt first, you can still open Prompt Builder anytime.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-slate-700">
                <span className="rounded-full border border-[rgba(255,176,199,0.2)] bg-[rgba(255,248,250,0.95)] px-3 py-1.5">
                  Private chats
                </span>
                <span className="rounded-full border border-[rgba(191,205,255,0.26)] bg-[rgba(242,246,255,0.95)] px-3 py-1.5">
                  Saved usage limit
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <GoogleSignInButton className="inline-flex" />
            <button
              type="button"
              onClick={onOpenPromptBuilder}
              className="inline-flex items-center justify-center rounded-[18px] border border-[rgba(255,120,156,0.22)] bg-white px-4 py-3 text-sm font-black text-[var(--accent-deep)] transition hover:bg-[rgba(255,245,248,0.96)]"
            >
              Open Prompt Builder
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-[32px] border border-[rgba(191,205,255,0.22)] bg-[linear-gradient(180deg,rgba(248,250,255,0.96),rgba(241,246,255,0.94))] p-5 shadow-[0_18px_42px_rgba(15,23,42,0.06)] sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[rgba(123,146,255,0.12)] text-[#4969c8]">
              <BuildingIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-black text-slate-950">Not signed in yet?</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                You can browse the rest of GalaTayo without logging in, and come back here when you are ready to use Ask AI.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function AskAiModePanel({
  isRegistered,
  isSessionLoading,
  usageStatus,
  isUsageLoading,
  usageError,
  question,
  answer,
  sources,
  isSubmitting,
  answerError,
  onRetryUsage,
  onQuestionChange,
  onSubmit,
  onCancel,
  onSwitchToPlaces,
  onStartOver,
  onOpenPromptBuilder,
  className = '',
}: {
  isRegistered: boolean
  isSessionLoading: boolean
  usageStatus: AskAiUsageStatus | null
  isUsageLoading: boolean
  usageError: string | null
  question: string
  answer: string
  sources: AskAiSource[]
  isSubmitting: boolean
  answerError: string | null
  onRetryUsage: () => void
  onQuestionChange: (question: string) => void
  onSubmit: () => void
  onCancel: () => void
  onSwitchToPlaces: () => void
  onStartOver: () => void
  onOpenPromptBuilder: () => void
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
    return <AskAiSignInRequired className={className} onOpenPromptBuilder={onOpenPromptBuilder} />
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
          <button
            type="button"
            onClick={onOpenPromptBuilder}
            className="ml-2 mt-4 rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)] hover:text-[var(--accent-deep)]"
          >
            Build prompt
          </button>
        </div>
      </section>
    )
  }

  return (
    <AskAiPlaceholder
      usageStatus={usageStatus}
      question={question}
      answer={answer}
      sources={sources}
      isSubmitting={isSubmitting}
      answerError={answerError}
      onQuestionChange={onQuestionChange}
      onSubmit={onSubmit}
      onCancel={onCancel}
      onSwitchToPlaces={onSwitchToPlaces}
      onStartOver={onStartOver}
      onOpenPromptBuilder={onOpenPromptBuilder}
      className={className}
    />
  )
}

function HomePage() {
  const [selectedMode, setSelectedMode] = useState<SearchMode>('places')
  const [session, setSession] = useState<Session | null>(null)
  const [isSessionLoading, setIsSessionLoading] = useState(true)
  const [askAiUsageStatus, setAskAiUsageStatus] = useState<AskAiUsageStatus | null>(null)
  const [isAskAiUsageLoading, setIsAskAiUsageLoading] = useState(false)
  const [askAiUsageError, setAskAiUsageError] = useState<string | null>(null)
  const [askAiUsageRefreshSignal, setAskAiUsageRefreshSignal] = useState(0)
  const [askAiQuestion, setAskAiQuestion] = useState('')
  const [askAiAnswer, setAskAiAnswer] = useState('')
  const [askAiSources, setAskAiSources] = useState<AskAiSource[]>([])
  const [isAskAiSubmitting, setIsAskAiSubmitting] = useState(false)
  const [askAiAnswerError, setAskAiAnswerError] = useState<string | null>(null)
  const [isPromptBuilderOpen, setIsPromptBuilderOpen] = useState(false)
  const [promptBuilderInitialState, setPromptBuilderInitialState] = useState<PromptBuilderState | null>(null)
  const [categories, setCategories] = useState(fallbackCategories)
  const [areas, setAreas] = useState<AreaChip[]>(fallbackAreas)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedArea, setSelectedArea] = useState<string | null>(null)
  const [selectedBudget, setSelectedBudget] = useState<BudgetValue | null>(null)
  const [userLocation, setUserLocation] = useState<UserLocation>(null)
  const [locationPermissionState, setLocationPermissionState] = useState<LocationPermissionState>('idle')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const [mobileResultsView, setMobileResultsView] = useState<MobileResultsViewMode>('cards')
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [promptLogin, setPromptLogin] = useState(false)
  const [lastSearchQuery, setLastSearchQuery] = useState('')
  const [activeSearchLabel, setActiveSearchLabel] = useState('')
  const [searchId, setSearchId] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<PlaceCardData[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [clearSearchSignal, setClearSearchSignal] = useState(0)
  const searchRequestVersion = useRef(0)
  const askAiAbortControllerRef = useRef<AbortController | null>(null)
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
  const selectedPlace = visiblePlaces.find((place) => place.id === selectedPlaceId) ?? visiblePlaces[0] ?? null
  const shouldShowGuidedSearch = selectedMode === 'places' && !hasSearched
  const isRegisteredUser = Boolean(session?.user)
  const handleRetryAskAiUsage = () => {
    setAskAiUsageRefreshSignal((signal) => signal + 1)
  }

  const openPromptBuilder = (source: 'ask-ai' | 'search' | 'empty-search' = 'search') => {
    const prefill = source === 'ask-ai'
      ? createPromptBuilderPrefill({
          plan: askAiQuestion,
        })
      : createPromptBuilderPrefill({
          plan: lastSearchQuery && lastSearchQuery !== 'Explore all places' ? lastSearchQuery : null,
          location: selectedAreaName,
          budget: selectedBudgetLabel,
          priority: selectedCategoryName,
        })

    setPromptBuilderInitialState(prefill)
    setIsPromptBuilderOpen(true)
  }

  const handleAskAiSubmit = async () => {
    const question = askAiQuestion.trim()

    if (!question || isAskAiSubmitting || !session?.access_token) {
      return
    }

    const abortController = new AbortController()
    askAiAbortControllerRef.current?.abort()
    askAiAbortControllerRef.current = abortController

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
        signal: abortController.signal,
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
        typeof data.answer !== 'string' ||
        !data.usage ||
        !isAskAiUsageStatus(data.usage.askAi) ||
        !isAskAiUsageStatus(data.usage.liveSearch)
      ) {
        throw new Error('Ask AI response was incomplete.')
      }

      setAskAiAnswer(data.answer)
      setAskAiSources(getAskAiSourceList(data.sources))
      setAskAiUsageStatus(data.usage.askAi)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }

      const message = error instanceof Error ? error.message : 'Ask AI could not answer right now.'
      setAskAiAnswerError(message)
    } finally {
      if (askAiAbortControllerRef.current === abortController) {
        askAiAbortControllerRef.current = null
      }
      setIsAskAiSubmitting(false)
    }
  }

  const handleCancelAskAi = () => {
    askAiAbortControllerRef.current?.abort()
  }

  const handleStartOverAskAi = () => {
    setAskAiQuestion('')
    setAskAiAnswer('')
    setAskAiSources([])
    setAskAiAnswerError(null)
  }

  const handleSwitchToPlaces = () => {
    setSelectedMode('places')
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
    setUserLocation(null)
    setLocationPermissionState('idle')
    setIsSearching(false)
    setSearchError(null)
    setPromptLogin(false)
    setLastSearchQuery('')
    setActiveSearchLabel('')
    setSearchId(null)
    setSearchResults([])
    setHasSearched(false)
    setSelectedPlaceId(null)
    setMobileResultsView('cards')
    setClearSearchSignal((signal) => signal + 1)
  }

  const handleClearFilters = () => {
    setSelectedCategory(null)
    setSelectedArea(null)
    setSelectedBudget(null)
    setUserLocation(null)
    setLocationPermissionState('idle')
    setSearchError(null)
  }

  const handleNearMeClick = () => {
    if (!('geolocation' in navigator)) {
      setUserLocation(null)
      setLocationPermissionState('unsupported')
      return
    }

    setLocationPermissionState('requesting')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
        setSelectedArea(null)
        setLocationPermissionState('granted')
      },
      (error) => {
        setUserLocation(null)
        setLocationPermissionState(error.code === error.PERMISSION_DENIED ? 'denied' : 'error')
      },
      {
        enableHighAccuracy: false,
        maximumAge: 5 * 60 * 1000,
        timeout: 10000,
      }
    )
  }

  const handlePlaceSelect = (placeId: string) => {
    const place = visiblePlaces.find((visiblePlace) => visiblePlace.id === placeId)
    const canonicalPlaceSlug = place?.slug?.trim()

    if (searchId) {
      console.log('Selected place from search:', { placeId, slug: canonicalPlaceSlug, searchId })
    }

    setSelectedPlaceId(placeId)
    if (canonicalPlaceSlug) {
      navigateToPlace(canonicalPlaceSlug)
    }
  }

  const handleMapPlaceSelect = (placeId: string) => {
    setSelectedPlaceId(placeId)
  }

  const getOptionalLocationSearchPayload = () => {
    const isNearMeActive = locationPermissionState === 'granted' && Boolean(userLocation)

    if (!isNearMeActive || !userLocation) {
      return {}
    }

    return {
      userLocation: {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
      },
      radiusKm: 5,
    }
  }

  const handleSearch = async (query: string) => {
    const trimmedQuery = query.trim()
    const requestVersion = searchRequestVersion.current + 1
    searchRequestVersion.current = requestVersion
    const searchPayload = {
      query: trimmedQuery,
      filters: {
        category: selectedCategory,
        area: selectedArea,
        budget: selectedBudget,
      },
      ...getOptionalLocationSearchPayload(),
    }

    try {
      setIsSearching(true)
      setSearchError(null)
      setPromptLogin(false)
      setSelectedPlaceId(null)
      setActiveSearchLabel(trimmedQuery || selectedFilterLabels.join(' - ') || 'gala spots in Metro Manila')

      const response = await fetch('/api/search', {
        method: 'POST',
        headers: await getSearchRequestHeaders(),
        body: JSON.stringify(searchPayload),
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

      setLastSearchQuery(trimmedQuery || selectedFilterLabels.join(' - '))
      setSearchId(data.searchId ?? null)
      const backendPlaces = data.places ?? data.result?.places ?? []
      const mappedPlaces = backendPlaces
        .map(mapBackendPlaceToCard)
        .filter((place): place is PlaceCardData => Boolean(place))

      setSearchResults(mappedPlaces)
      setHasSearched(true)
      setSelectedPlaceId(mappedPlaces[0]?.id ?? null)
      setMobileResultsView('cards')
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
      setActiveSearchLabel('gala spots in Metro Manila')

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
          ...getOptionalLocationSearchPayload(),
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
      setMobileResultsView('cards')
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
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return
        }

        const message = error instanceof Error ? error.message : 'Failed to check Ask AI usage.'
        setAskAiUsageStatus(null)
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

        <div className="min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#f8fbff,#edf4ff)] lg:hidden">
          <AppHeader signInLabel="Mag-sign in" />

          <main className="overflow-x-hidden pb-6">
            {isPromptBuilderOpen ? (
              <PromptBuilderModal
                isOpen={isPromptBuilderOpen}
                initialState={promptBuilderInitialState}
                onClose={() => setIsPromptBuilderOpen(false)}
              />
            ) : selectedMode === 'places' && isSearching ? (
              <SearchLoadingState searchLabel={activeSearchLabel} />
            ) : shouldShowGuidedSearch ? (
              <GuidedSearchPage
              selectedMode={selectedMode}
              selectedCategory={selectedCategory}
              selectedArea={selectedArea}
              selectedBudget={selectedBudget}
              hasActiveFilters={hasActiveFilters}
              hasSearched={hasSearched}
              clearSearchSignal={clearSearchSignal}
              isSearching={isSearching}
              searchError={searchError}
              onModeChange={handleModeChange}
              onSearch={handleSearch}
              onClearSearch={handleClearSearch}
              onCategoryChange={setSelectedCategory}
              onAreaChange={setSelectedArea}
              onBudgetChange={setSelectedBudget}
              onNearMe={handleNearMeClick}
              onOpenFilters={() => setShowAdvancedFilters(true)}
            />
          ) : (
            <>
          {selectedMode === 'places' ? (
            visiblePlaces.length > 0 ? (
              <MobileResultsView
                places={visiblePlaces}
                selectedPlace={selectedPlace}
                selectedPlaceId={selectedPlaceId}
                searchLabel={lastSearchQuery || selectedFilterLabels.join(' - ') || 'your gala search'}
                selectedView={mobileResultsView}
                onViewChange={setMobileResultsView}
                onSelectPlace={handleMapPlaceSelect}
                onViewDetails={handlePlaceSelect}
                onClearSearch={handleClearSearch}
              />
            ) : (
              <section className="px-4 py-4">
                <SearchEmptyState
                  hasSearched={hasSearched}
                  onBuildPrompt={() => openPromptBuilder('empty-search')}
                  onSearchAgain={() => openPromptBuilder('empty-search')}
                  onSelectCategory={setSelectedCategory}
                />
              </section>
            )
          ) : (
            <AskAiModePanel
              isRegistered={isRegisteredUser}
              isSessionLoading={isSessionLoading}
              usageStatus={askAiUsageStatus}
              isUsageLoading={isAskAiUsageLoading}
              usageError={askAiUsageError}
              question={askAiQuestion}
              answer={askAiAnswer}
              sources={askAiSources}
              isSubmitting={isAskAiSubmitting}
              answerError={askAiAnswerError}
              onRetryUsage={handleRetryAskAiUsage}
              onQuestionChange={setAskAiQuestion}
              onSubmit={handleAskAiSubmit}
              onCancel={handleCancelAskAi}
              onSwitchToPlaces={handleSwitchToPlaces}
              onStartOver={handleStartOverAskAi}
              onOpenPromptBuilder={() => openPromptBuilder('ask-ai')}
            />
          )}
            </>
          )}
        </main>
        <AppFooter />
      </div>

        <div
          className={`hidden w-full lg:grid ${
            isPromptBuilderOpen || selectedMode === 'ask-ai'
              ? 'min-h-screen grid-rows-[auto_auto_auto]'
              : 'h-screen overflow-hidden lg:grid-rows-[auto_minmax(0,1fr)_auto]'
          }`}
        >
          <AppHeader />

          <div
            className={
              isPromptBuilderOpen || selectedMode === 'ask-ai'
                ? 'min-h-0'
                : shouldShowGuidedSearch
                  ? 'min-h-0 overflow-hidden'
                  : 'grid min-h-0 overflow-hidden grid-rows-[auto_minmax(0,1fr)]'
            }
          >
            {isPromptBuilderOpen ? (
              <PromptBuilderModal
                isOpen={isPromptBuilderOpen}
                initialState={promptBuilderInitialState}
                onClose={() => setIsPromptBuilderOpen(false)}
              />
            ) : selectedMode === 'places' && isSearching ? (
              <SearchLoadingState searchLabel={activeSearchLabel} />
            ) : shouldShowGuidedSearch ? (
              <GuidedSearchPage
              selectedMode={selectedMode}
              selectedCategory={selectedCategory}
              selectedArea={selectedArea}
              selectedBudget={selectedBudget}
              hasActiveFilters={hasActiveFilters}
              hasSearched={hasSearched}
              clearSearchSignal={clearSearchSignal}
              isSearching={isSearching}
              searchError={searchError}
              onModeChange={handleModeChange}
              onSearch={handleSearch}
              onClearSearch={handleClearSearch}
              onCategoryChange={setSelectedCategory}
              onAreaChange={setSelectedArea}
              onBudgetChange={setSelectedBudget}
              onNearMe={handleNearMeClick}
              onOpenFilters={() => setShowAdvancedFilters(true)}
            />
          ) : (
            <>
        {selectedMode === 'places' ? (
          visiblePlaces.length > 0 ? (
            <DesktopResultsView
              places={visiblePlaces}
              selectedPlaceId={selectedPlaceId}
              searchLabel={lastSearchQuery || selectedFilterLabels.join(' - ') || 'your gala search'}
              onSelectPlace={handleMapPlaceSelect}
              onViewDetails={handlePlaceSelect}
              onClearSearch={handleClearSearch}
            />
          ) : (
            <section className="px-8 py-8">
              <SearchEmptyState
                hasSearched={hasSearched}
                onBuildPrompt={() => openPromptBuilder('empty-search')}
                onSearchAgain={() => openPromptBuilder('empty-search')}
                onSelectCategory={setSelectedCategory}
              />
            </section>
          )
        ) : (
          <AskAiModePanel
            isRegistered={isRegisteredUser}
            isSessionLoading={isSessionLoading}
            usageStatus={askAiUsageStatus}
            isUsageLoading={isAskAiUsageLoading}
            usageError={askAiUsageError}
            question={askAiQuestion}
            answer={askAiAnswer}
            sources={askAiSources}
            isSubmitting={isAskAiSubmitting}
            answerError={askAiAnswerError}
            onRetryUsage={handleRetryAskAiUsage}
            onQuestionChange={setAskAiQuestion}
            onSubmit={handleAskAiSubmit}
            onCancel={handleCancelAskAi}
            onSwitchToPlaces={handleSwitchToPlaces}
            onStartOver={handleStartOverAskAi}
            onOpenPromptBuilder={() => openPromptBuilder('ask-ai')}
            className="min-h-0"
          />
        )}
          </>
        )}
        </div>

        <AppFooter />
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

        <section className="absolute right-0 top-0 flex h-full w-full max-w-[520px] flex-col border-l border-[var(--line)] bg-[linear-gradient(180deg,#f8fbff,#edf4ff)] shadow-[-14px_0_34px_rgba(28,77,160,0.12)]">
          <div className="flex items-start justify-between border-b border-[var(--line)] bg-white/88 px-4 py-4 backdrop-blur sm:px-5">
            <div>
              <p className="text-lg font-black leading-tight text-slate-950">Filters</p>
              <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                {hasActiveFilters ? `Selected: ${selectedFilterLabels.join(' - ')}` : 'No filters selected yet'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAdvancedFilters(false)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--line)] bg-white text-slate-700 transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)] hover:text-[var(--accent-deep)]"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.7" className="h-4 w-4">
                <path d="M6 6l12 12" />
                <path d="M18 6 6 18" />
              </svg>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4 sm:px-5">
            <p className="mb-4 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-semibold leading-snug text-[var(--muted)]">
              Choose filters, then click Search. You can search with filters only even without typing.
            </p>
            <div>
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">
                Kategorya ng lugar
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {filteredAdvancedCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setSelectedCategory(category.id)}
                  className={`group inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition active:scale-[0.98] ${
                    selectedCategory === category.id
                      ? 'border-[var(--accent)] bg-[var(--accent-wash)] text-[var(--accent-deep)] shadow-[0_10px_22px_rgba(47,116,232,0.12)]'
                      : 'border-[var(--line-strong)] bg-white text-slate-700 hover:border-[var(--accent)] hover:bg-[var(--accent-wash)] hover:text-[var(--accent-deep)]'
                  }`}
                >
                  <span className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <CategoryIcon categoryId={category.id} className="h-7 w-7" />
                      <span>{category.name}</span>
                    </span>
                    {selectedCategory === category.id ? <CheckIcon className="h-4 w-4" /> : null}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-5">
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">
                Lungsod / Lugar sa Metro Manila
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {areas.filter((area) => area.id !== 'all').map((area) => (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => setSelectedArea(area.id)}
                  className={`group inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition active:scale-[0.98] ${
                    selectedArea === area.id
                      ? 'border-[var(--accent)] bg-[var(--accent-wash)] text-[var(--accent-deep)] shadow-[0_10px_22px_rgba(47,116,232,0.12)]'
                      : 'border-[var(--line-strong)] bg-white text-slate-700 hover:border-[var(--accent)] hover:bg-[var(--accent-wash)] hover:text-[var(--accent-deep)]'
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

            <div className="mt-5">
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">
                Budget
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {budgetOptions.map((budget) => (
                <button
                  key={budget.value}
                  type="button"
                  onClick={() => setSelectedBudget(budget.value)}
                  className={`group inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition active:scale-[0.98] ${
                    selectedBudget === budget.value
                      ? 'border-[var(--accent)] bg-[var(--accent-wash)] text-[var(--accent-deep)] shadow-[0_10px_22px_rgba(47,116,232,0.12)]'
                      : 'border-[var(--line-strong)] bg-white text-slate-700 hover:border-[var(--accent)] hover:bg-[var(--accent-wash)] hover:text-[var(--accent-deep)]'
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

          <div className="grid shrink-0 gap-2 border-t border-[var(--line)] bg-white/95 px-4 py-3 sm:px-5">
            <button
              type="button"
              onClick={handleClearFilters}
              disabled={!hasActiveFilters}
              className="w-full rounded-lg border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-black text-[var(--accent-deep)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)] disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-white"
            >
              Clear filters
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAdvancedFilters(false)
              }}
              disabled={!hasActiveFilters}
              className="w-full rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-4 py-2.5 text-sm font-black text-white shadow-[0_10px_20px_rgba(47,116,232,0.22)] transition hover:bg-white hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
            >
              Apply filters
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAdvancedFilters(false)
                void handleExploreAllPlaces()
              }}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--chip)] px-4 py-2.5 text-sm font-black text-[var(--accent-deep)] transition hover:border-[var(--accent)] hover:bg-white"
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


