import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type RefObject } from 'react'
import { Bot, ChevronRight, Compass, Flame, Heart, LayoutGrid, MapPin, Search, SlidersHorizontal, Sparkles, Star } from 'lucide-react'
import { useAppUser } from '../context/AppUserContext'
import UserMenu from '../components/UserMenu'
import { AppSkeleton } from '../components/AppUI'
import { useGuestAuthPrompt } from '../components/GuestAuthPrompt'
import MobileBottomNav from '../components/MobileBottomNav'
import CarouselPositionIndicator from '../components/CarouselPositionIndicator'
import { PageShell } from '../components/layout/ResponsiveLayouts'
import {
  homeAllTopPickPlaces,
  homeCategoryRecommendations,
  homeCityRecommendations,
  homePopularTopPickPlaces,
  homeRecommendedTopPickPlaces,
} from '../data/homeRecommendations'
import { useSavedFavorites } from '../context/SavedFavoritesContext'
import { supabase } from '../supabase'
import { navigateToPath } from '../utils/navigation'
import { getApiUrl } from '../utils/apiClient'
import {
  readHomeTrendingCache,
  writeHomeTrendingCache,
  type HomeTrendingCachePlace,
} from '../utils/homeTrendingCache'
import {
  clearHomeScrollCache,
  readHomeScrollCache,
  restoreHomeScroll,
  writeHomeScrollCache,
} from '../utils/homeScrollCache'
import { readHomeRouteCache, writeHomeRouteCache } from '../utils/homeRouteCache'
import { useHomeImageSrc } from '../utils/homeImageCache'
import { getCanonicalPlacePath, resolveAreaMeta } from '../utils/routes'
import { placeCategories } from '../data/placeCategories'
import {
  fetchHomePlaceDetailsBatch,
  prefetchPlaceDetail,
  readCachedPlaceDetail,
  type CityImageResolution,
} from '../utils/placeDetailCache'

import type { PlaceDetail } from '../types/appTypes'

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
  thumbnailUrl?: string | null
  imageUrl?: string | null
  curatedImageUrls?: string[] | null
  address?: string | null
  rating?: number | string | null
  reviewCount?: number | string | null
  reason?: string | null
}

type ShowcasePlace = {
  id: string
  slug?: string
  name: string
  category?: string | null
  area: string
  city?: string | null
  localArea?: string | null
  thumbnailUrl?: string | null
  imageUrl?: string | null
  curatedImageUrls?: string[]
  rating?: number | null
  reviewCount?: string
  description?: string | null
  reason?: string | null
}

type HomeTileRecommendation = {
  label: string
  slug?: string
  href: string
  active: boolean
  place: ShowcasePlace | null
}

type HomeAiFeature = {
  title: string
  description: string
  href: string
  icon: typeof Bot
}

const homeAiFeatures: HomeAiFeature[] = [
  {
    title: 'AI Chatbot',
    description: 'Ask for gala ideas',
    href: '/ask-ai/chatbot',
    icon: Bot,
  },
  {
    title: 'AI Maps',
    description: 'Find places with AI',
    href: '/ask-ai/maps',
    icon: Sparkles,
  },
]

const TABLET_HOME_RAIL_QUERY = '(min-width: 768px)'
const homeTopPickRecommendationPlaces = [
  ...homePopularTopPickPlaces,
  ...homeRecommendedTopPickPlaces,
  ...homeAllTopPickPlaces,
]

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

function normalizeLocationKey(value: string | null | undefined) {
  return value
    ?.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    ?? ''
}

function normalizePlaceMatchKey(value: string | null | undefined) {
  return value
    ?.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    ?? ''
}

function formatRatingText(value: number | string | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value.toFixed(1)
  }

  if (typeof value === 'string') {
    const trimmedValue = value.trim()
    if (!trimmedValue) {
      return null
    }

    const numericValue = Number(trimmedValue)
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue.toFixed(1) : trimmedValue
  }

  return null
}

async function getSearchRequestHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`
  }

  return headers
}

function mapBackendPlaceToShowcasePlace(place: BackendSearchPlace): ShowcasePlace | null {
  const lat = parseCoordinate(place.latitude)
  const lng = parseCoordinate(place.longitude)
  const name = place.name?.trim()

  if (!name || lat === null || lng === null) {
    return null
  }

  return {
    id: String(place.id || place.slug || name),
    slug: place.slug || undefined,
    name,
    category: place.category || null,
    area: place.location || place.address || place.city || place.area || 'Metro Manila',
    city: place.city || null,
    localArea: place.area || null,
    thumbnailUrl: place.thumbnailUrl || null,
    imageUrl: place.imageUrl || null,
    curatedImageUrls: Array.isArray(place.curatedImageUrls)
      ? place.curatedImageUrls.filter((item): item is string => Boolean(item?.trim()))
      : [],
    rating: typeof place.rating === 'number' ? place.rating : parseCoordinate(place.rating),
    reviewCount:
      place.reviewCount === null || place.reviewCount === undefined ? undefined : String(place.reviewCount),
    description: place.description || null,
    reason: place.reason || place.description || null,
  }
}

function mapCachedPlaceToShowcasePlace(place: HomeTrendingCachePlace): ShowcasePlace {
  return {
    id: place.id,
    slug: place.slug,
    name: place.name,
    category: place.category ?? null,
    area: place.area,
    city: place.city ?? null,
    localArea: place.localArea ?? null,
    thumbnailUrl: place.thumbnailUrl ?? null,
    imageUrl: place.imageUrl ?? null,
    curatedImageUrls: Array.isArray(place.curatedImageUrls) ? place.curatedImageUrls : [],
    rating: place.rating ?? null,
    reviewCount: place.reviewCount,
    description: place.description ?? null,
    reason: place.reason ?? null,
  }
}

function mapPlaceDetailToShowcasePlace(place: PlaceDetail): ShowcasePlace | null {
  const lat = parseCoordinate(place.latitude)
  const lng = parseCoordinate(place.longitude)
  const name = place.name?.trim()

  if (!name || lat === null || lng === null) {
    return null
  }

  return {
    id: place.id,
    slug: place.slug,
    name,
    category: place.category || null,
    area: place.area || place.address || place.city || 'Metro Manila',
    city: place.city || null,
    localArea: place.area || null,
    thumbnailUrl: place.thumbnailUrl || place.imageUrl || null,
    imageUrl: place.imageUrl || place.thumbnailUrl || null,
    curatedImageUrls: Array.isArray(place.curatedImageUrls)
      ? place.curatedImageUrls.filter((item): item is string => Boolean(item?.trim()))
      : [],
    rating:
      typeof place.average_rating === 'number'
        ? place.average_rating
        : parseCoordinate(place.average_rating),
    reviewCount:
      place.review_count === null || place.review_count === undefined ? undefined : String(place.review_count),
    description: place.description || null,
    reason: place.description || null,
  }
}

function hasShowcaseImage(place: Pick<ShowcasePlace, 'thumbnailUrl' | 'imageUrl' | 'curatedImageUrls'>) {
  return Boolean(
    place.thumbnailUrl?.trim() ||
    place.imageUrl?.trim() ||
    place.curatedImageUrls?.some((imageUrl) => Boolean(imageUrl?.trim()))
  )
}

function mergeRecommendedPlaceWithLivePlace(
  fallbackPlace: ShowcasePlace,
  livePlace: ShowcasePlace | undefined
) {
  if (!livePlace) {
    return fallbackPlace
  }

  const fallbackCuratedImageUrls = fallbackPlace.curatedImageUrls ?? []
  const liveCuratedImageUrls = livePlace.curatedImageUrls ?? []

  return {
    ...fallbackPlace,
    ...livePlace,
    thumbnailUrl:
      livePlace.thumbnailUrl?.trim() ||
      livePlace.imageUrl?.trim() ||
      liveCuratedImageUrls.find((imageUrl) => Boolean(imageUrl?.trim()))?.trim() ||
      fallbackPlace.thumbnailUrl ||
      null,
    imageUrl:
      livePlace.imageUrl?.trim() ||
      livePlace.thumbnailUrl?.trim() ||
      liveCuratedImageUrls.find((imageUrl) => Boolean(imageUrl?.trim()))?.trim() ||
      fallbackPlace.imageUrl ||
      null,
    curatedImageUrls: hasShowcaseImage(livePlace)
      ? [...liveCuratedImageUrls, ...fallbackCuratedImageUrls].reduce<string[]>((uniqueImageUrls, imageUrl) => {
          const trimmedImageUrl = imageUrl?.trim()

          if (trimmedImageUrl && !uniqueImageUrls.includes(trimmedImageUrl)) {
            uniqueImageUrls.push(trimmedImageUrl)
          }

          return uniqueImageUrls
        }, [])
      : fallbackCuratedImageUrls,
  }
}

import { getStaticPlaceImageUrlForSlug } from '../data/placeIndexVisuals'

function getHomeTileImageCandidates(
  place: ShowcasePlace | null,
  { includeStaticPlaceFallback = true }: { includeStaticPlaceFallback?: boolean } = {}
) {
  if (!place) {
    return []
  }

  const candidates = [
    place.thumbnailUrl,
    place.imageUrl,
    ...(place.curatedImageUrls ?? []),
    includeStaticPlaceFallback ? getStaticPlaceImageUrlForSlug(place.slug ?? place.id) : null,
  ]

  return candidates.reduce<string[]>((uniqueCandidates, candidate) => {
    const imageUrl = candidate?.trim()

    if (imageUrl && !uniqueCandidates.includes(imageUrl)) {
      uniqueCandidates.push(imageUrl)
    }

    return uniqueCandidates
  }, [])
}

function getPlaceRatingText(place: ShowcasePlace) {
  return formatRatingText(place.rating)
}

function getPlaceLocationText(place: ShowcasePlace) {
  return place.area?.trim() || place.city?.trim() || 'Metro Manila'
}

function buildPlaceHref(place: ShowcasePlace) {
  if (!place.slug) {
    return null
  }

  const areaMeta = resolveAreaMeta({
    city: place.city,
    area: place.area,
    localArea: place.localArea,
  })

  return getCanonicalPlacePath({
    areaSlug: areaMeta.slug,
    placeSlug: place.slug,
  })
}

const homepageCategoryRouteAliases: Record<string, string> = {
  arcade: 'activity',
  cafe: 'cafe',
  church: 'heritage',
  cinema: 'cinema',
  food: 'food',
  group: 'activity',
  heritage: 'heritage',
  hotel: 'hotel',
  mall: 'mall',
  museum: 'museum',
  nightlife: 'nightlife',
  park: 'park',
  tourist: 'tourist',
  zoo: 'tourist',
}

function normalizeCategoryLabel(value: string) {
  return value.trim().toLowerCase()
}

function toCategoryRouteSlug(value: string) {
  return normalizeCategoryLabel(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function resolveHomepageCategoryRouteId(label: string) {
  const normalizedLabel = normalizeCategoryLabel(label)
  const aliasedCategory = homepageCategoryRouteAliases[normalizedLabel]

  if (aliasedCategory) {
    return aliasedCategory
  }

  const exactCategory = placeCategories.find(
    (category) => normalizeCategoryLabel(category.label) === normalizedLabel
  )

  return exactCategory?.value ?? null
}

function getHomepageCategoryCandidates(place: ShowcasePlace) {
  const candidates = new Set<string>()
  const normalizedCategory = normalizeCategoryLabel(place.category || '')

  if (!normalizedCategory) {
    return candidates
  }

  if (normalizedCategory === 'restaurant' || normalizedCategory === 'food') {
    candidates.add('food')
  }
  if (normalizedCategory === 'park') {
    candidates.add('park')
  }
  if (normalizedCategory === 'hotel' || normalizedCategory === 'accommodation') {
    candidates.add('hotel')
  }
  if (normalizedCategory === 'bar') {
    candidates.add('nightlife')
  }
  if (normalizedCategory === 'arcade') {
    candidates.add('activity')
  }

  const mappedCategoryId = resolveHomepageCategoryRouteId(place.category || '')
  if (mappedCategoryId) {
    candidates.add(mappedCategoryId)
  }

  return candidates
}

function buildCityHref(citySlug: string) {
  return `/places/${encodeURIComponent(citySlug)}`
}

function logHomeCityImageAudit(resolutions: CityImageResolution[]) {
  if (!import.meta.env.DEV || resolutions.length === 0) {
    return
  }

  console.info(
    '[home-city-images]',
    resolutions.map((resolution) => ({
      citySlug: resolution.citySlug,
      selectedPlaceSlug: resolution.place?.slug ?? null,
      selectedImageUrl: resolution.imageUrl,
      source: resolution.source,
      warning: resolution.source === 'missing' ? 'No approved R2 image found for this city.' : null,
    }))
  )
}

const homepageCityTilePlaceSlugOverrides: Record<string, string> = {
  caloocan: 'caloocan-city-peoples-park',
  'las-pinas': 'sm-southmall',
  makati: 'glorietta',
  malabon: 'malabon-zoo-aquarium-and-botanical-garden',
  mandaluyong: 'shangri-la-plaza',
  manila: 'intramuros',
  marikina: 'kapitan-moy-cultural-center',
  muntinlupa: 'festival-mall-alabang',
  navotas: 'navotas-citywalk-and-amphitheater',
  paranaque: 'okada-manila',
  pasay: 'sm-mall-of-asia',
  pasig: 'ace-water-spa-pasig',
  'quezon-city': 'art-in-island',
  'san-juan': 'greenhills-mall-greenhills-shopping-center',
  taguig: 'bonifacio-high-street',
  valenzuela: 'museo-valenzuela',
}

function getHomepageCityTileLabel(label: string) {
  if (label === 'Las PiÃ±as') {
    return 'Las Piñas'
  }

  if (label === 'ParaÃ±aque') {
    return 'Parañaque'
  }

  return label
}

function buildCategoryHref(label: string) {
  const resolvedCategoryId = resolveHomepageCategoryRouteId(label) ?? toCategoryRouteSlug(label)
  return `/places/categories/${encodeURIComponent(resolvedCategoryId)}`
}

function getGreetingName(currentProfile: ReturnType<typeof useAppUser>['currentProfile'], currentUser: ReturnType<typeof useAppUser>['currentUser']) {
  const profileName = currentProfile?.displayName?.trim() || currentProfile?.username?.trim() || ''
  const userName = [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ').trim()

  return profileName || userName || 'Guest User'
}

function getHomeIndicatorGroupSize(isTabletUpViewport: boolean) {
  return isTabletUpViewport ? 2 : 1
}

function getGroupedHomeIndicatorTotal(itemCount: number, groupSize: number) {
  return Math.min(5, Math.ceil(itemCount / groupSize))
}

function getSegmentedRailIndicatorTotal(itemCount: number) {
  return Math.min(5, itemCount)
}

function getHomepageCitySlug(place: Pick<ShowcasePlace, 'city' | 'area' | 'localArea'>) {
  const normalizedCity = normalizeLocationKey(place.city)

  if (normalizedCity) {
    const cityMeta = resolveAreaMeta({
      city: place.city,
      area: place.city,
      localArea: place.city,
    })

    if (cityMeta.slug) {
      return cityMeta.slug
    }
  }

  return resolveAreaMeta({
    city: place.city,
    area: place.area,
    localArea: place.localArea,
  }).slug
}

function HomeFeaturedCard({
  place,
  index,
  onGuestFavorite,
}: {
  place: ShowcasePlace
  index: number
  onGuestFavorite: () => void
}) {
  const href = buildPlaceHref(place)
  const imageCandidates = useMemo(() => getHomeTileImageCandidates(place), [place])
  const [failedImageUrls, setFailedImageUrls] = useState<string[]>([])
  const imageUrl = imageCandidates.find((candidate) => !failedImageUrls.includes(candidate)) ?? null
  const shouldShowImage = Boolean(imageUrl)
  const resolvedSrc = useHomeImageSrc(imageUrl)
  const locationText = getPlaceLocationText(place)
  const ratingText = getPlaceRatingText(place)
  const { isPlaceSaved, saveFavorite, removeFavorite } = useSavedFavorites()
  const [isSaving, setIsSaving] = useState(false)
  const normalizedPlaceId = place.id.trim()
  const isSaved = [place.slug, normalizedPlaceId].some((slugOrId) => isPlaceSaved(slugOrId))

  useEffect(() => {
    setFailedImageUrls((currentValue) =>
      currentValue.filter((failedImageUrl) => imageCandidates.includes(failedImageUrl))
    )
  }, [imageCandidates])

  const handleOpen = (event: MouseEvent<HTMLDivElement>) => {
    if (href) {
      if (place.slug) {
        void prefetchPlaceDetail(place.slug)
      }

      writeHomeScrollCache({
        scrollY: window.scrollY,
        selectedPlaceId: place.id,
        selectedPlaceViewportTop: event.currentTarget.getBoundingClientRect().top,
        pendingScrollRestore: true,
      })
      navigateToPath(href)
      return
    }

    navigateToPath('/search')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (place.slug) {
        void prefetchPlaceDetail(place.slug)
      }
      navigateToPath(href ?? '/search')
    }
  }

  const handleToggleFavorite = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()

    try {
      setIsSaving(true)

      if (isSaved) {
        await removeFavorite(normalizedPlaceId, place.slug)
        return
      }

      const result = await saveFavorite(normalizedPlaceId, place.slug)

      if (result.status === 'guest') {
        onGuestFavorite()
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      data-home-trending-place-id={place.id}
      onTouchStart={() => {
        if (place.slug) {
          void prefetchPlaceDetail(place.slug)
        }
      }}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      className="block text-left outline-none"
      style={{ animationDelay: `${index * 90}ms` }}
    >
      <div className="relative overflow-hidden rounded-[24px] bg-slate-100 ring-1 ring-slate-200">
        <div className="relative aspect-[1.28] w-full">
          {shouldShowImage ? (
            <img
              src={resolvedSrc || undefined}
              alt={place.name}
              className="h-full w-full object-cover"
              draggable={false}
              loading={index === 0 ? 'eager' : 'lazy'}
              decoding="async"
              fetchPriority={index === 0 ? 'high' : 'auto'}
              sizes="(min-width: 1280px) 360px, (min-width: 1024px) 344px, (min-width: 768px) 320px, 84vw"
              onError={() => {
                if (imageUrl) {
                  setFailedImageUrls((currentValue) =>
                    currentValue.includes(imageUrl) ? currentValue : [...currentValue, imageUrl]
                  )
                }
              }}
            />
          ) : (
            <div className="absolute inset-0 bg-[linear-gradient(145deg,#cbd5e1_0%,#94a3b8_52%,#64748b_100%)]" />
          )}

          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0)_40%,rgba(15,23,42,0.14)_60%,rgba(15,23,42,0.82)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(180deg,rgba(15,23,42,0)_0%,rgba(15,23,42,0.18)_35%,rgba(15,23,42,0.6)_100%)]" />

          <button
            type="button"
            onClick={handleToggleFavorite}
            disabled={isSaving}
            aria-label={isSaved ? `Remove ${place.name} from favorites` : `Save ${place.name} to favorites`}
            data-drag-scroll-ignore="true"
            className={`absolute right-2.5 top-2.5 flex h-[28px] w-[28px] items-center justify-center rounded-full border border-white/75 bg-white/92 shadow-[0_4px_10px_rgba(15,23,42,0.06)] ${
              isSaved ? 'text-rose-500' : 'text-slate-500'
            }`}
          >
            <Heart className={`h-3.5 w-3.5 ${isSaved ? 'fill-current' : ''}`} strokeWidth={2.2} />
          </button>

          <div className="absolute inset-x-0 bottom-0 p-4">
            <div className="text-white">
              <p className="line-clamp-1 pr-12 text-[17px] font-black leading-tight tracking-[-0.03em]">
                {place.name}
              </p>
              <div className="mt-1.5 flex items-center gap-2 text-[10.5px] text-white/84">
                <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 pr-2">
                  <MapPin className="h-3 w-3 shrink-0" strokeWidth={2.2} />
                  <span className="truncate">{locationText}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[rgba(15,23,42,0.36)] px-2.5 py-1 font-semibold text-white">
                  <Star className="h-3.5 w-3.5 fill-current text-amber-300" strokeWidth={1.8} />
                  {ratingText || 'New'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function HomeFeaturedCardSkeleton({ index }: { index: number }) {
  return (
    <div
      className="w-[clamp(17rem,84vw,21.5rem)] shrink-0 snap-center md:w-[320px] lg:w-[344px] xl:w-[360px]"
      style={{ animationDelay: `${index * 80}ms` }}
      aria-hidden="true"
    >
      <div className="relative overflow-hidden rounded-[24px] bg-white ring-1 ring-slate-200 shadow-[0_16px_30px_rgba(15,23,42,0.05)]">
        <div className="relative aspect-[1.28] w-full">
          <AppSkeleton className="absolute inset-0 rounded-[24px]" />
          <div className="absolute inset-x-0 bottom-0 p-4">
            <AppSkeleton className="h-5 w-2/3 rounded-full bg-white/35" />
            <div className="mt-2 flex items-center gap-2">
              <AppSkeleton className="h-3.5 w-28 rounded-full bg-white/30" />
              <AppSkeleton className="h-6 w-14 rounded-full bg-white/30" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function HomePageSkeleton() {
  return (
    <PageShell tone="plain">
      <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
        <div className="mx-auto flex min-h-screen w-full max-w-[1320px] flex-col px-4 pb-[calc(env(safe-area-inset-bottom,0px)+6.5rem)] pt-[max(18px,env(safe-area-inset-top))] sm:px-5 sm:pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] md:px-6 md:pb-[calc(env(safe-area-inset-bottom,0px)+5rem)] md:pt-10 lg:px-8 lg:pb-[calc(env(safe-area-inset-bottom,0px)+4.5rem)]">
          <section className="min-w-0 pt-2 md:pt-0" aria-hidden="true">
            <AppSkeleton className="h-4 w-28 rounded-full" />
            <div className="mt-3 flex items-center justify-between gap-4">
              <AppSkeleton className="h-7 w-44 rounded-full" />
              <AppSkeleton className="h-10 w-10 rounded-full" />
            </div>
            <AppSkeleton className="mt-3 h-4 w-64 rounded-full" />
            <AppSkeleton className="mt-6 h-14 w-full rounded-[20px]" />

            <div className="mt-7">
              <AppSkeleton className="mb-3 h-4 w-24 rounded-full" />
              <div className="grid grid-cols-2 gap-3">
                <AppSkeleton className="h-[76px] rounded-[18px]" />
                <AppSkeleton className="h-[76px] rounded-[18px]" />
              </div>
            </div>
          </section>

          <div className="mt-5 flex min-w-0 flex-1 flex-col justify-evenly gap-4 md:mt-10 md:gap-10 lg:gap-12" aria-hidden="true">
            <section className="min-w-0 md:-mt-1">
              <div className="flex items-center justify-between gap-3">
                <AppSkeleton className="h-8 w-36 rounded-full" />
                <AppSkeleton className="h-5 w-16 rounded-full" />
              </div>
              <div className="mt-2 flex gap-3">
                <AppSkeleton className="h-5 w-10 rounded-full" />
                <AppSkeleton className="h-5 w-16 rounded-full" />
                <AppSkeleton className="h-5 w-28 rounded-full" />
              </div>
              <div className="-mx-4 mt-3 px-4">
                <div className="flex gap-4 overflow-hidden">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <HomeFeaturedCardSkeleton key={`home-page-skeleton-card-${index}`} index={index} />
                  ))}
                </div>
              </div>
              <div className="mt-4 flex justify-center">
                <AppSkeleton className="h-3 w-28 rounded-full" />
              </div>
            </section>

            <section className="min-w-0">
              <div className="flex items-center justify-between gap-3">
                <AppSkeleton className="h-7 w-24 rounded-full" />
                <AppSkeleton className="h-5 w-16 rounded-full" />
              </div>
              <div className="mt-3 flex gap-3 overflow-hidden">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={`home-city-skeleton-${index}`} className="flex w-[clamp(4.75rem,22vw,7.5rem)] shrink-0 flex-col items-center gap-2 px-1 py-1.5 md:w-[120px] lg:w-[132px]">
                    <AppSkeleton className="h-[clamp(4rem,18vw,5.75rem)] w-[clamp(4rem,18vw,5.75rem)] rounded-[16px] md:h-[84px] md:w-[84px] lg:h-[92px] lg:w-[92px]" />
                    <AppSkeleton className="h-4 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            </section>

            <section className="min-w-0">
              <div className="flex items-center justify-between gap-3">
                <AppSkeleton className="h-7 w-32 rounded-full" />
                <AppSkeleton className="h-5 w-16 rounded-full" />
              </div>
              <div className="mt-3 flex gap-3 overflow-hidden">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={`home-category-skeleton-${index}`} className="flex w-[clamp(4.75rem,22vw,7.5rem)] shrink-0 flex-col items-center gap-2 px-1 py-1.5 md:w-[120px] lg:w-[132px]">
                    <AppSkeleton className="h-[clamp(4rem,18vw,5.75rem)] w-[clamp(4rem,18vw,5.75rem)] rounded-[16px] md:h-[84px] md:w-[84px] lg:h-[92px] lg:w-[92px]" />
                    <AppSkeleton className="h-4 w-20 rounded-full" />
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>

      <div className="lg:hidden" aria-hidden="true">
        <MobileBottomNav currentPath="/home" />
      </div>
    </PageShell>
  )
}

function HomeCategoryTile({
  label,
  place,
  active = false,
  isLoading = false,
  includeStaticPlaceFallback = true,
  onClick,
}: {
  label: string
  place: ShowcasePlace | null
  active?: boolean
  isLoading?: boolean
  includeStaticPlaceFallback?: boolean
  onClick: () => void
}) {
  const imageCandidates = useMemo(
    () => getHomeTileImageCandidates(place, { includeStaticPlaceFallback }),
    [includeStaticPlaceFallback, place]
  )
  const [failedImageUrls, setFailedImageUrls] = useState<string[]>([])
  const imageUrl = imageCandidates.find((candidate) => !failedImageUrls.includes(candidate)) ?? null
  const shouldShowImage = Boolean(imageUrl)
  const resolvedSrc = useHomeImageSrc(imageUrl)

  useEffect(() => {
    setFailedImageUrls((currentValue) =>
      currentValue.filter((failedImageUrl) => imageCandidates.includes(failedImageUrl))
    )
  }, [imageCandidates])

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-[clamp(4.75rem,22vw,7.5rem)] shrink-0 snap-center flex-col items-center gap-2 rounded-[18px] px-1 py-1.5 text-center transition md:w-[120px] md:rounded-[22px] md:px-2 md:py-2 lg:w-[132px] ${
        active ? 'bg-[rgba(30,58,138,0.08)]' : 'bg-transparent'
      }`}
    >
      <div
        className={`h-[clamp(4rem,18vw,5.75rem)] w-[clamp(4rem,18vw,5.75rem)] overflow-hidden rounded-[16px] border bg-slate-100 transition md:h-[84px] md:w-[84px] lg:h-[92px] lg:w-[92px] ${
          active ? 'border-[rgba(30,58,138,0.34)] shadow-[0_8px_20px_rgba(15,23,42,0.06)] ring-1 ring-[rgba(30,58,138,0.14)]' : 'border-[rgba(148,163,184,0.18)]'
        }`}
      >
        {!isLoading && shouldShowImage ? (
          <div className="relative h-full w-full">
            <img
              src={resolvedSrc || undefined}
              alt={label}
              className="h-full w-full object-cover"
              draggable={false}
              loading="eager"
              decoding="async"
              fetchPriority="high"
              sizes="(min-width: 1024px) 92px, (min-width: 768px) 84px, 22vw"
              onError={() => {
                if (imageUrl) {
                  setFailedImageUrls((currentValue) =>
                    currentValue.includes(imageUrl) ? currentValue : [...currentValue, imageUrl]
                  )
                }
              }}
            />
          </div>
        ) : (
          <AppSkeleton className="h-full w-full rounded-none bg-[linear-gradient(145deg,#e2e8f0_0%,#cbd5e1_100%)]" />
        )}
      </div>
      <span className={`w-full truncate text-[12.5px] font-medium md:text-[14px] ${active ? 'text-[var(--accent-deep)]' : 'text-slate-500'}`}>{label}</span>
    </button>
  )
}

function useHomeRailDragScroll<T extends HTMLElement>(
  ref: RefObject<T | null>,
  { enabled, label }: { enabled: boolean; label: string }
) {
  useEffect(() => {
    if (!enabled) {
      return
    }

    const element = ref.current

    if (!element) {
      return
    }

    let isMouseDown = false
    let startX = 0
    let startScrollLeft = 0
    let isDragging = false
    let suppressClick = false
    const desktopRailQuery = window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)')
    const initialScrollSnapType = element.style.scrollSnapType
    const initialUserSelect = document.body.style.userSelect
    const interactiveSelector =
      'input, select, textarea, summary, [contenteditable="true"], [data-drag-scroll-ignore="true"]'
    const DRAG_CLICK_THRESHOLD_PX = 5

    const shouldDebug = () => {
      if (!import.meta.env.DEV) {
        return false
      }

      try {
        return window.localStorage.getItem('galatayo:debug-home-rails') === '1'
      } catch {
        return false
      }
    }

    const getTargetLabel = (target: EventTarget | null) => {
      if (!(target instanceof Element)) {
        return 'unknown'
      }

      const tagName = target.tagName.toLowerCase()
      const role = target.getAttribute('role')
      const railItem = target.closest('[data-rail-item]') ? ' rail-item' : ''
      return `${tagName}${role ? `[role="${role}"]` : ''}${railItem}`
    }

    const debugLog = (eventName: string, event: Event, extra: Record<string, unknown> = {}) => {
      if (!shouldDebug()) {
        return
      }

      const pointerEvent = typeof PointerEvent !== 'undefined' && event instanceof PointerEvent ? event : null
      const mouseEvent = event instanceof globalThis.MouseEvent ? event : null
      const touchEvent = typeof TouchEvent !== 'undefined' && event instanceof TouchEvent ? event : null
      const firstTouch = touchEvent?.touches[0] ?? touchEvent?.changedTouches[0] ?? null

      console.debug('[GalaTayo home rail]', {
        rail: label,
        event: eventName,
        target: getTargetLabel(event.target),
        pointerType: pointerEvent?.pointerType ?? (mouseEvent ? 'mouse' : touchEvent ? 'touch-event' : undefined),
        clientX: mouseEvent?.clientX ?? firstTouch?.clientX,
        clientY: mouseEvent?.clientY ?? firstTouch?.clientY,
        scrollLeft: element.scrollLeft,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        touchAction: window.getComputedStyle(element).touchAction,
        isMouseDown,
        isDragging,
        suppressClick,
        desktop: desktopRailQuery.matches,
        ...extra,
      })
    }

    const restoreInteractionStyles = () => {
      document.body.style.userSelect = initialUserSelect
      element.style.scrollSnapType = initialScrollSnapType
      element.classList.remove('cursor-grabbing')
    }

    const resetState = () => {
      isMouseDown = false
      startX = 0
      startScrollLeft = 0
      isDragging = false
    }

    const removeWindowMouseDragListeners = () => {
      document.removeEventListener('mousemove', onMouseMove, true)
      document.removeEventListener('mouseup', finishMouseDrag, true)
      window.removeEventListener('blur', cancelMouseDrag)
    }

    const canStartFromTarget = (target: EventTarget | null) => {
      return !(target instanceof Element && target.closest(interactiveSelector))
    }

    const hasHorizontalOverflow = () => element.scrollWidth > element.clientWidth

    const onWheel = (event: WheelEvent) => {
      if (!desktopRailQuery.matches || !hasHorizontalOverflow()) {
        return
      }

      const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY

      if (Math.abs(dominantDelta) < 1) {
        return
      }

      const maxScrollLeft = Math.max(element.scrollWidth - element.clientWidth, 0)
      const nextScrollLeft = Math.min(maxScrollLeft, Math.max(0, element.scrollLeft + dominantDelta))

      if (nextScrollLeft === element.scrollLeft) {
        return
      }

      event.preventDefault()
      element.scrollLeft = nextScrollLeft
    }

    const onMouseDown = (event: globalThis.MouseEvent) => {
      const target = event.target

      if (
        isMouseDown ||
        !desktopRailQuery.matches ||
        event.button !== 0 ||
        !canStartFromTarget(target) ||
        !hasHorizontalOverflow()
      ) {
        debugLog('mousedown ignored', event, {
          desktop: desktopRailQuery.matches,
          canStartTarget: canStartFromTarget(target),
          hasOverflow: hasHorizontalOverflow(),
        })
        return
      }

      isMouseDown = true
      startX = event.clientX
      startScrollLeft = element.scrollLeft
      isDragging = false
      suppressClick = false
      event.preventDefault()
      element.style.scrollSnapType = 'none'
      document.body.style.userSelect = 'none'
      element.classList.add('cursor-grabbing')
      document.addEventListener('mousemove', onMouseMove, { capture: true, passive: false })
      document.addEventListener('mouseup', finishMouseDrag, true)
      window.addEventListener('blur', cancelMouseDrag)
      debugLog('mousedown start', event)
    }

    const onMouseMove = (event: globalThis.MouseEvent) => {
      if (!isMouseDown) {
        return
      }

      const deltaX = event.clientX - startX

      if (Math.abs(deltaX) >= DRAG_CLICK_THRESHOLD_PX) {
        isDragging = true
        suppressClick = true
      }

      event.preventDefault()
      element.scrollLeft = startScrollLeft - deltaX
      debugLog('mousemove', event)
    }

    const finishMouseDrag = (event: globalThis.MouseEvent) => {
      if (!isMouseDown) {
        return
      }

      suppressClick = isDragging
      debugLog('mouseup', event)
      restoreInteractionStyles()
      removeWindowMouseDragListeners()
      resetState()
      window.setTimeout(() => {
        suppressClick = false
      }, 250)
    }

    const cancelMouseDrag = () => {
      if (!isMouseDown) {
        return
      }

      restoreInteractionStyles()
      removeWindowMouseDragListeners()
      resetState()
      suppressClick = false
    }
    if (desktopRailQuery.matches) {
      element.classList.add('cursor-grab')
    }

    const onClickCapture = (event: globalThis.MouseEvent) => {
      debugLog('click', event)

      if (!suppressClick) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      suppressClick = false
    }

    const onDragStart = (event: DragEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest(interactiveSelector)) {
        return
      }

      event.preventDefault()
    }

    element.addEventListener('mousedown', onMouseDown, true)
    element.addEventListener('click', onClickCapture, true)
    element.addEventListener('dragstart', onDragStart)
    element.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      restoreInteractionStyles()
      removeWindowMouseDragListeners()
      element.classList.remove('cursor-grab')
      element.style.scrollSnapType = initialScrollSnapType
      element.removeEventListener('mousedown', onMouseDown, true)
      element.removeEventListener('click', onClickCapture, true)
      element.removeEventListener('dragstart', onDragStart)
      element.removeEventListener('wheel', onWheel)
    }
  }, [enabled, label, ref])
}

function useSegmentedRailIndicator<T extends HTMLElement>(
  ref: RefObject<T | null>,
  { enabled, itemCount }: { enabled: boolean; itemCount: number }
) {
  const indicatorTotal = getSegmentedRailIndicatorTotal(itemCount)
  const [progressRatio, setProgressRatio] = useState(0)

  const syncProgress = useCallback(() => {
    const element = ref.current

    if (!enabled || !element || indicatorTotal <= 1) {
      setProgressRatio(0)
      return
    }

    const maxScrollLeft = Math.max(element.scrollWidth - element.clientWidth, 0)
    const nextProgressRatio = maxScrollLeft > 0
      ? Math.min(1, Math.max(0, element.scrollLeft / maxScrollLeft))
      : 0

    setProgressRatio((currentProgressRatio) => (
      Math.abs(currentProgressRatio - nextProgressRatio) < 0.002 ? currentProgressRatio : nextProgressRatio
    ))
  }, [enabled, indicatorTotal, ref])

  useEffect(() => {
    const element = ref.current
    let frameId: number | null = null

    if (!enabled || !element || indicatorTotal <= 1) {
      setProgressRatio(0)
      return
    }

    const scheduleSync = () => {
      if (frameId !== null) {
        return
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null
        syncProgress()
      })
    }

    syncProgress()
    element.addEventListener('scroll', scheduleSync, { passive: true })
    window.addEventListener('resize', scheduleSync)

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }

      element.removeEventListener('scroll', scheduleSync)
      window.removeEventListener('resize', scheduleSync)
    }
  }, [enabled, indicatorTotal, ref, syncProgress])

  const handleSelect = useCallback((index: number) => {
    const element = ref.current

    if (!element || indicatorTotal <= 1) {
      return
    }

    const safeIndex = Math.min(indicatorTotal - 1, Math.max(0, index))
    const nextProgressRatio = safeIndex / (indicatorTotal - 1)
    const maxScrollLeft = Math.max(element.scrollWidth - element.clientWidth, 0)

    setProgressRatio(nextProgressRatio)
    element.scrollTo({
      left: maxScrollLeft * nextProgressRatio,
      behavior: 'smooth',
    })
  }, [indicatorTotal, ref])

  return {
    currentIndex: Math.round(progressRatio * Math.max(indicatorTotal - 1, 0)),
    handleSelect,
    progressRatio,
    total: indicatorTotal,
  }
}

function buildCachedHomeTopPickPlaceBySlug() {
  const nextEntries: Array<[string, ShowcasePlace]> = []
  const seenSlugs = new Set<string>()

  for (const recommendation of homeTopPickRecommendationPlaces) {
    const normalizedSlug = (recommendation.slug ?? recommendation.id).trim().toLowerCase()

    if (!normalizedSlug || seenSlugs.has(normalizedSlug)) {
      continue
    }

    seenSlugs.add(normalizedSlug)

    const cachedPlace = readCachedPlaceDetail(normalizedSlug)
    const showcasePlace = cachedPlace ? mapPlaceDetailToShowcasePlace(cachedPlace) : null

    if (showcasePlace) {
      nextEntries.push([normalizedSlug, showcasePlace])
    }
  }

  return Object.fromEntries(nextEntries)
}

function getRailItemTargetLeft(element: HTMLElement, item: HTMLElement) {
  const targetLeft =
    element.scrollLeft + item.getBoundingClientRect().left - element.getBoundingClientRect().left
  const maxScrollLeft = Math.max(element.scrollWidth - element.clientWidth, 0)

  return Math.min(maxScrollLeft, Math.max(0, targetLeft))
}

function HomePage({
  navigationSource = 'push',
}: {
  navigationSource?: 'push' | 'replace' | 'pop'
}) {
  const { currentProfile, currentUser } = useAppUser()
  const guestAuth = useGuestAuthPrompt()
  const initialHomeRouteCacheRef = useRef(readHomeRouteCache())
  const cachedTrendingPlacesRef = useRef<ShowcasePlace[] | null>(
    initialHomeRouteCacheRef.current?.trendingPlaces.map(mapCachedPlaceToShowcasePlace) ??
      readHomeTrendingCache()?.map(mapCachedPlaceToShowcasePlace) ??
      null
  )
  const initialHomeScrollCacheRef = useRef(
    navigationSource === 'pop' ? readHomeScrollCache() : null
  )
  const hasRestoredHomeScrollRef = useRef(false)
  const [trendingPlaces, setTrendingPlaces] = useState<ShowcasePlace[]>(
    initialHomeRouteCacheRef.current?.trendingPlaces.map(mapCachedPlaceToShowcasePlace) ??
      cachedTrendingPlacesRef.current ??
      []
  )
  const [homePlacesPool, setHomePlacesPool] = useState<ShowcasePlace[]>(
    initialHomeRouteCacheRef.current?.homePlacesPool.map(mapCachedPlaceToShowcasePlace) ??
      cachedTrendingPlacesRef.current ??
      []
  )
  const [cityTilePlaceBySlug, setCityTilePlaceBySlug] = useState<Record<string, ShowcasePlace>>(
    initialHomeRouteCacheRef.current?.cityTilePlaceBySlug ?? {}
  )
  const [activeTopPicksTab, setActiveTopPicksTab] = useState<'all' | 'popular' | 'recommended'>(
    initialHomeRouteCacheRef.current?.activeTopPicksTab ?? 'all'
  )
  const [isTrendingLoading, setIsTrendingLoading] = useState(false)
  const [isTrendingLoaded, setIsTrendingLoaded] = useState(
    Boolean(initialHomeRouteCacheRef.current?.trendingPlaces.length || cachedTrendingPlacesRef.current?.length)
  )
  const [trendingError, setTrendingError] = useState<string | null>(null)
  const [areHomeCardsLoaded, setAreHomeCardsLoaded] = useState(
    Boolean(
      (
        initialHomeRouteCacheRef.current &&
        (
          Object.keys(initialHomeRouteCacheRef.current.cityTilePlaceBySlug).length > 0 &&
          Object.keys(initialHomeRouteCacheRef.current.categoryTilePlaceByLabel).length > 0
        )
      )
    )
  )
  const [selectedCityTileSlug, setSelectedCityTileSlug] = useState<string | null>(null)
  const [selectedCategoryTileLabel, setSelectedCategoryTileLabel] = useState<string | null>(null)
  const [topPickPlaceBySlug, setTopPickPlaceBySlug] = useState<Record<string, ShowcasePlace>>(
    {
      ...buildCachedHomeTopPickPlaceBySlug(),
      ...(initialHomeRouteCacheRef.current?.topPickPlaceBySlug ?? {}),
    }
  )
  const [categoryTilePlaceByLabel, setCategoryTilePlaceByLabel] = useState<Record<string, ShowcasePlace>>(
    initialHomeRouteCacheRef.current?.categoryTilePlaceByLabel ?? {}
  )
  const heroCarouselRef = useRef<HTMLDivElement | null>(null)
  const heroCardRefs = useRef<Array<HTMLDivElement | null>>([])
  const cityRailRef = useRef<HTMLDivElement | null>(null)
  const categoryRailRef = useRef<HTMLDivElement | null>(null)
  const [activeHeroIndex, setActiveHeroIndex] = useState(0)
  const [activeHeroCardIndex, setActiveHeroCardIndex] = useState(0)
  const [heroIndicatorProgressRatio, setHeroIndicatorProgressRatio] = useState(0)
  const [isTabletUpHomeViewport, setIsTabletUpHomeViewport] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return window.matchMedia(TABLET_HOME_RAIL_QUERY).matches
  })
  const greetingName = useMemo(
    () => getGreetingName(currentProfile, currentUser),
    [currentProfile, currentUser]
  )

  const heroPlaces = useMemo(() => {
    return homePopularTopPickPlaces
  }, [])

  const imageRichHomePlacesPool = useMemo(
    () => homePlacesPool.filter((place) => hasShowcaseImage(place)),
    [homePlacesPool]
  )

  const livePlaceBySlug = useMemo(() => {
    const nextMap = new Map<string, ShowcasePlace>()

    for (const place of imageRichHomePlacesPool) {
      const normalizedSlug = (place.slug ?? place.id).trim().toLowerCase()

      if (!normalizedSlug || nextMap.has(normalizedSlug)) {
        continue
      }

      nextMap.set(normalizedSlug, place)
    }

    return nextMap
  }, [imageRichHomePlacesPool])

  const livePlaceByName = useMemo(() => {
    const nextMap = new Map<string, ShowcasePlace>()

    for (const place of imageRichHomePlacesPool) {
      const normalizedName = normalizePlaceMatchKey(place.name)

      if (!normalizedName || nextMap.has(normalizedName)) {
        continue
      }

      nextMap.set(normalizedName, place)
    }

    return nextMap
  }, [imageRichHomePlacesPool])

  const mergeTopPickPlaceWithLivePlace = useCallback((place: ShowcasePlace) => {
    const normalizedRecommendationSlug = (place.slug ?? place.id).trim().toLowerCase()
    const exactTopPickLivePlace = topPickPlaceBySlug[normalizedRecommendationSlug]
    const exactLivePlace = livePlaceBySlug.get(normalizedRecommendationSlug)
    const sameNameLivePlace = livePlaceByName.get(normalizePlaceMatchKey(place.name))

    return mergeRecommendedPlaceWithLivePlace(place, exactTopPickLivePlace ?? exactLivePlace ?? sameNameLivePlace)
  }, [livePlaceByName, livePlaceBySlug, topPickPlaceBySlug])

  const recommendedTopPickPlaces = useMemo(() => {
    return homeRecommendedTopPickPlaces.map(mergeTopPickPlaceWithLivePlace)
  }, [mergeTopPickPlaceWithLivePlace])

  const allTopPickPlaces = useMemo(() => {
    return homeAllTopPickPlaces.map(mergeTopPickPlaceWithLivePlace)
  }, [mergeTopPickPlaceWithLivePlace])

  const popularTopPickPlaces = useMemo(() => {
    return homePopularTopPickPlaces.map(mergeTopPickPlaceWithLivePlace)
  }, [mergeTopPickPlaceWithLivePlace])

  const visibleTopPickCarouselPlaces = useMemo(() => {
    if (activeTopPicksTab === 'all') {
      return allTopPickPlaces
    }

    if (activeTopPicksTab === 'popular') {
      return popularTopPickPlaces
    }

    if (activeTopPicksTab === 'recommended') {
      return recommendedTopPickPlaces
    }

    return heroPlaces
  }, [activeTopPicksTab, allTopPickPlaces, heroPlaces, popularTopPickPlaces, recommendedTopPickPlaces])

  const hasCachedTrendingPlaces = trendingPlaces.length > 0
  const shouldShowTopPickSkeletons = isTrendingLoading && !hasCachedTrendingPlaces && visibleTopPickCarouselPlaces.length === 0
  const isHomePageReady = isTrendingLoaded && areHomeCardsLoaded

  useEffect(() => {
    if (!isHomePageReady) {
      return
    }

    writeHomeRouteCache({
      trendingPlaces,
      homePlacesPool,
      cityTilePlaceBySlug,
      topPickPlaceBySlug,
      categoryTilePlaceByLabel,
      activeTopPicksTab,
    })
  }, [
    activeTopPicksTab,
    categoryTilePlaceByLabel,
    cityTilePlaceBySlug,
    homePlacesPool,
    isHomePageReady,
    topPickPlaceBySlug,
    trendingPlaces,
  ])

  const liveCityPlaceBySlug = useMemo(() => {
    const nextMap = new Map<string, ShowcasePlace>()

    for (const place of imageRichHomePlacesPool) {
      const areaSlug = getHomepageCitySlug(place)

      if (!nextMap.has(areaSlug)) {
        nextMap.set(areaSlug, place)
      }
    }

    return nextMap
  }, [imageRichHomePlacesPool])

  const liveCategoryPlaceById = useMemo(() => {
    const nextMap = new Map<string, ShowcasePlace>()

    for (const place of imageRichHomePlacesPool) {
      for (const candidate of getHomepageCategoryCandidates(place)) {
        if (!nextMap.has(candidate)) {
          nextMap.set(candidate, place)
        }
      }
    }

    return nextMap
  }, [imageRichHomePlacesPool])

  const cityTiles = useMemo<HomeTileRecommendation[]>(() => {
    return homeCityRecommendations.map((tile) => {
      const citySlug = getHomepageCitySlug(tile.place)
      const normalizedRecommendationSlug = (tile.place.slug ?? tile.place.id).trim().toLowerCase()
      const cityTileOverride = cityTilePlaceBySlug[citySlug]
      const exactRecommendedLivePlace = livePlaceBySlug.get(normalizedRecommendationSlug)
      const sameCityLivePlace = liveCityPlaceBySlug.get(citySlug)

      return {
        label: getHomepageCityTileLabel(tile.label),
        slug: citySlug,
        href: buildCityHref(citySlug),
        active: selectedCityTileSlug === citySlug,
        place: mergeRecommendedPlaceWithLivePlace(tile.place, cityTileOverride ?? exactRecommendedLivePlace ?? sameCityLivePlace),
      }
    })
  }, [cityTilePlaceBySlug, liveCityPlaceBySlug, livePlaceBySlug, selectedCityTileSlug])

  const categoryTiles = useMemo<HomeTileRecommendation[]>(() => {
    return homeCategoryRecommendations.map((tile) => {
      const normalizedRecommendationSlug = (tile.place.slug ?? tile.place.id).trim().toLowerCase()
      const exactCategoryTilePlace = categoryTilePlaceByLabel[tile.label]
      const exactRecommendedLivePlace = livePlaceBySlug.get(normalizedRecommendationSlug)

      return {
        label: tile.label,
        href: buildCategoryHref(tile.label),
        active: selectedCategoryTileLabel === tile.label,
        place: mergeRecommendedPlaceWithLivePlace(
          tile.place,
          exactCategoryTilePlace ??
            exactRecommendedLivePlace ??
            liveCategoryPlaceById.get(resolveHomepageCategoryRouteId(tile.label) ?? '')
        ),
      }
    })
  }, [categoryTilePlaceByLabel, liveCategoryPlaceById, livePlaceBySlug, selectedCategoryTileLabel])

  useEffect(() => {
    const imageUrls = new Set<string>()

    for (const place of visibleTopPickCarouselPlaces) {
      for (const imageUrl of getHomeTileImageCandidates(place)) {
        imageUrls.add(imageUrl)
      }
    }

    for (const tile of [...cityTiles, ...categoryTiles]) {
      for (const imageUrl of getHomeTileImageCandidates(tile.place)) {
        imageUrls.add(imageUrl)
      }
    }

    const preloadedImages = Array.from(imageUrls).map((imageUrl) => {
      const image = new Image()
      image.decoding = 'async'
      image.src = imageUrl
      return image
    })

    return () => {
      for (const image of preloadedImages) {
        image.onload = null
        image.onerror = null
      }
    }
  }, [categoryTiles, cityTiles, visibleTopPickCarouselPlaces])

  useEffect(() => {
    const controller = new AbortController()

    async function loadTrendingPlaces() {
      try {
        setIsTrendingLoading(true)
        setTrendingError(null)

        const headers = await getSearchRequestHeaders()
        const showcasePlaces: ShowcasePlace[] = []
        const seenPlaceKeys = new Set<string>()
        const response = await fetch(getApiUrl('/search'), {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            query: '',
            filters: {
              category: null,
              area: null,
              budget: null,
            },
            exploreAll: true,
            page: 1,
            limit: 20,
          }),
        })

        const data = (await response.json()) as {
          message?: string
          error?: string
          places?: BackendSearchPlace[]
          result?: {
            places?: BackendSearchPlace[]
          }
        }

        if (!response.ok) {
          throw new Error(data.error || data.message || 'Failed to load places.')
        }

        const pagePlaces = (data.places ?? data.result?.places ?? [])
          .map(mapBackendPlaceToShowcasePlace)
          .filter((place): place is ShowcasePlace => Boolean(place))

        for (const place of pagePlaces) {
          const dedupeKey = (place.slug ?? place.id).trim().toLowerCase()
          if (seenPlaceKeys.has(dedupeKey)) {
            continue
          }

          seenPlaceKeys.add(dedupeKey)
          showcasePlaces.push(place)
        }

        setHomePlacesPool(showcasePlaces)
        setCityTilePlaceBySlug({})

        setTrendingPlaces(showcasePlaces)
        writeHomeTrendingCache(showcasePlaces)
        cachedTrendingPlacesRef.current = showcasePlaces
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return
        }

        if (!cachedTrendingPlacesRef.current) {
          setTrendingError(error instanceof Error ? error.message : 'Failed to load places.')
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsTrendingLoading(false)
          setIsTrendingLoaded(true)
        }
      }
    }

    void loadTrendingPlaces()

    return () => {
      controller.abort()
    }
  }, [])

  useEffect(() => {
    let isCancelled = false

    async function loadHomeCardPlaces() {
      try {
        if (!initialHomeRouteCacheRef.current && !cachedTrendingPlacesRef.current?.length) {
          setAreHomeCardsLoaded(false)
        }

        const topPickSlugs = homeTopPickRecommendationPlaces
          .map((place) => place.slug?.trim().toLowerCase())
          .filter((slug): slug is string => Boolean(slug))

        const cityTileSlugs = homeCityRecommendations
          .map((tile) => {
            const citySlug = getHomepageCitySlug(tile.place)
            return homepageCityTilePlaceSlugOverrides[citySlug] ??
              tile.place.slug?.trim().toLowerCase() ??
              null
          })
          .filter((slug): slug is string => Boolean(slug))

        const categoryTileSlugs = homeCategoryRecommendations
          .map((tile) => tile.place.slug?.trim().toLowerCase() ?? null)
          .filter((slug): slug is string => Boolean(slug))

        const cityImageRequests = homeCityRecommendations.map((tile) => {
          const citySlug = getHomepageCitySlug(tile.place)
          return {
            citySlug,
            cityName: tile.place.city,
            representativeSlug:
              homepageCityTilePlaceSlugOverrides[citySlug] ??
              tile.place.slug?.trim().toLowerCase() ??
              null,
          }
        })
        const allSlugs = Array.from(new Set([...topPickSlugs, ...cityTileSlugs, ...categoryTileSlugs]))
        const { places, cityImageResolutions } = await fetchHomePlaceDetailsBatch({
          slugs: allSlugs,
          cityImageRequests,
        })

        if (isCancelled) {
          return
        }

        const placeBySlug = new Map<string, ShowcasePlace>()

        for (const place of places) {
          const showcasePlace = mapPlaceDetailToShowcasePlace(place)
          if (!showcasePlace) {
            continue
          }

          placeBySlug.set(showcasePlace.slug?.trim().toLowerCase() ?? showcasePlace.id.trim().toLowerCase(), showcasePlace)
        }

        setTopPickPlaceBySlug((currentValue) => ({
          ...currentValue,
          ...Object.fromEntries(
            topPickSlugs
              .map((slug) => {
                const place = placeBySlug.get(slug)
                return place ? ([slug, place] as const) : null
              })
              .filter((entry): entry is readonly [string, ShowcasePlace] => Boolean(entry))
          ),
        }))

        logHomeCityImageAudit(cityImageResolutions)

        setCityTilePlaceBySlug(
          Object.fromEntries(
            cityImageResolutions
              .map((resolution) => {
                const place = resolution.place ? mapPlaceDetailToShowcasePlace(resolution.place) : null
                return place && hasShowcaseImage(place) ? ([resolution.citySlug, place] as const) : null
              })
              .filter((entry): entry is readonly [string, ShowcasePlace] => Boolean(entry))
          )
        )

        setCategoryTilePlaceByLabel(
          Object.fromEntries(
            homeCategoryRecommendations
              .map((tile) => {
                const placeSlug = tile.place.slug?.trim().toLowerCase() ?? null

                if (!placeSlug) {
                  return null
                }

                const place = placeBySlug.get(placeSlug)
                return place ? ([tile.label, place] as const) : null
              })
              .filter((entry): entry is readonly [string, ShowcasePlace] => Boolean(entry))
          )
        )
      } finally {
        if (!isCancelled) {
          setAreHomeCardsLoaded(true)
        }
      }
    }

    void loadHomeCardPlaces()

    return () => {
      isCancelled = true
    }
  }, [])

  useLayoutEffect(() => {
    const homeScrollCache = initialHomeScrollCacheRef.current

    if (navigationSource !== 'pop' || !homeScrollCache?.pendingScrollRestore || hasRestoredHomeScrollRef.current) {
      return
    }

    hasRestoredHomeScrollRef.current = true
    restoreHomeScroll({
      scrollY: homeScrollCache.scrollY,
      selectedPlaceId: homeScrollCache.selectedPlaceId,
      selectedPlaceViewportTop: homeScrollCache.selectedPlaceViewportTop,
    })

    clearHomeScrollCache()
  }, [navigationSource])

  useLayoutEffect(() => {
    heroCardRefs.current.length = visibleTopPickCarouselPlaces.length
  }, [activeTopPicksTab, visibleTopPickCarouselPlaces.length])

  useEffect(() => {
    const mediaQuery = window.matchMedia(TABLET_HOME_RAIL_QUERY)

    const syncViewport = () => {
      setIsTabletUpHomeViewport(mediaQuery.matches)
    }

    syncViewport()
    mediaQuery.addEventListener('change', syncViewport)

    return () => {
      mediaQuery.removeEventListener('change', syncViewport)
    }
  }, [])

  const syncHeroCarouselIndicator = useCallback(() => {
    const carousel = heroCarouselRef.current
    const cards = heroCardRefs.current.filter((card): card is HTMLDivElement => Boolean(card))
    const indicatorGroupSize = getHomeIndicatorGroupSize(isTabletUpHomeViewport)
    const indicatorTotal = getGroupedHomeIndicatorTotal(visibleTopPickCarouselPlaces.length, indicatorGroupSize)

    if (!carousel || cards.length === 0) {
      setActiveHeroCardIndex(0)
      setActiveHeroIndex(0)
      setHeroIndicatorProgressRatio(0)
      return
    }

    const maxScrollLeft = Math.max(carousel.scrollWidth - carousel.clientWidth, 0)
    const progressRatio = maxScrollLeft > 0 ? Math.min(1, Math.max(0, carousel.scrollLeft / maxScrollLeft)) : 0
    const progressCardIndex = progressRatio * Math.max(visibleTopPickCarouselPlaces.length - 1, 0)
    const nextCardIndex = Math.min(
      visibleTopPickCarouselPlaces.length - 1,
      Math.max(0, Math.round(progressCardIndex))
    )
    const nextIndex = isTabletUpHomeViewport
      ? Math.round(progressRatio * Math.max(indicatorTotal - 1, 0))
      : Math.min(indicatorTotal - 1, Math.max(0, Math.round(progressCardIndex % 5)))

    setActiveHeroCardIndex((currentIndex) => (currentIndex === nextCardIndex ? currentIndex : nextCardIndex))
    setActiveHeroIndex((currentIndex) => (currentIndex === nextIndex ? currentIndex : nextIndex))
    setHeroIndicatorProgressRatio((currentProgressRatio) => (
      Math.abs(currentProgressRatio - progressRatio) < 0.002 ? currentProgressRatio : progressRatio
    ))
  }, [isTabletUpHomeViewport, visibleTopPickCarouselPlaces.length])

  useEffect(() => {
    const carousel = heroCarouselRef.current
    let frameId: number | null = null
    const indicatorTotal = shouldShowTopPickSkeletons
      ? 3
      : getGroupedHomeIndicatorTotal(
          visibleTopPickCarouselPlaces.length,
          getHomeIndicatorGroupSize(isTabletUpHomeViewport)
        )

    if (shouldShowTopPickSkeletons) {
      setActiveHeroCardIndex(0)
      setActiveHeroIndex(0)
      setHeroIndicatorProgressRatio(0)
      return
    }

    if (!carousel || indicatorTotal <= 1) {
      setActiveHeroCardIndex(0)
      setActiveHeroIndex(0)
      setHeroIndicatorProgressRatio(0)
      return
    }

    const updateActiveIndex = () => {
      syncHeroCarouselIndicator()
    }

    const scheduleActiveIndexUpdate = () => {
      if (frameId !== null) {
        return
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null
        updateActiveIndex()
      })
    }

    updateActiveIndex()
    const timeoutId = window.setTimeout(updateActiveIndex, 120)
    carousel.addEventListener('scroll', scheduleActiveIndexUpdate, { passive: true })
    window.addEventListener('resize', scheduleActiveIndexUpdate)

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
      window.clearTimeout(timeoutId)
      carousel.removeEventListener('scroll', scheduleActiveIndexUpdate)
      window.removeEventListener('resize', scheduleActiveIndexUpdate)
    }
  }, [
    activeTopPicksTab,
    isHomePageReady,
    isTabletUpHomeViewport,
    shouldShowTopPickSkeletons,
    syncHeroCarouselIndicator,
    visibleTopPickCarouselPlaces.length,
  ])

  const openAllCities = () => {
    navigateToPath('/places')
  }

  const openAllCategories = () => {
    navigateToPath('/places/categories')
  }

  const handleTopPicksTabChange = (tab: 'all' | 'popular' | 'recommended') => {
    setActiveTopPicksTab(tab)
    setActiveHeroCardIndex(0)
    setActiveHeroIndex(0)
    setHeroIndicatorProgressRatio(0)

    requestAnimationFrame(() => {
      heroCarouselRef.current?.scrollTo({
        left: 0,
        behavior: 'smooth',
      })
    })
  }

  const handleHeroIndicatorSelect = (index: number) => {
    const carousel = heroCarouselRef.current
    const cards = heroCardRefs.current.filter((card): card is HTMLDivElement => Boolean(card))
    const indicatorGroupSize = getHomeIndicatorGroupSize(isTabletUpHomeViewport)
    const visibleDotCount = getGroupedHomeIndicatorTotal(cards.length, indicatorGroupSize)

    if (!carousel || visibleDotCount <= 0 || cards.length === 0) {
      setActiveHeroCardIndex(0)
      setActiveHeroIndex(0)
      return
    }

    const safeDotIndex = Math.min(visibleDotCount - 1, Math.max(0, index))
    const currentBatchStart = isTabletUpHomeViewport
      ? 0
      : Math.floor(activeHeroCardIndex / 5) * 5
    const targetCardIndex = isTabletUpHomeViewport
      ? Math.min(cards.length - 1, safeDotIndex * indicatorGroupSize)
      : Math.min(cards.length - 1, currentBatchStart + safeDotIndex)
    const targetCard = cards[targetCardIndex]

    if (!targetCard) {
      setActiveHeroCardIndex(0)
      setActiveHeroIndex(0)
      return
    }

    setActiveHeroCardIndex(targetCardIndex)
    setActiveHeroIndex(safeDotIndex)
    setHeroIndicatorProgressRatio(visibleDotCount > 1 ? safeDotIndex / (visibleDotCount - 1) : 0)
    carousel.scrollTo({
      left: getRailItemTargetLeft(carousel, targetCard),
      behavior: 'smooth',
    })
  }

  const topPicksIndicatorTotal = shouldShowTopPickSkeletons
    ? 3
    : getGroupedHomeIndicatorTotal(
        visibleTopPickCarouselPlaces.length,
        getHomeIndicatorGroupSize(isTabletUpHomeViewport)
      )
  const cityRailIndicator = useSegmentedRailIndicator(cityRailRef, {
    enabled: isHomePageReady,
    itemCount: cityTiles.length,
  })
  const categoryRailIndicator = useSegmentedRailIndicator(categoryRailRef, {
    enabled: isHomePageReady,
    itemCount: categoryTiles.length,
  })

  useHomeRailDragScroll(heroCarouselRef, { enabled: isHomePageReady, label: 'Top Picks' })
  useHomeRailDragScroll(cityRailRef, { enabled: isHomePageReady, label: 'Cities' })
  useHomeRailDragScroll(categoryRailRef, { enabled: isHomePageReady, label: 'Categories' })

  if (!isHomePageReady) {
    return <HomePageSkeleton />
  }

  return (
    <PageShell tone="plain">
      <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
        <div className="mx-auto flex min-h-screen w-full max-w-[1320px] flex-col px-4 pb-[calc(env(safe-area-inset-bottom,0px)+6.5rem)] pt-[max(18px,env(safe-area-inset-top))] sm:px-5 sm:pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] md:px-6 md:pb-[calc(env(safe-area-inset-bottom,0px)+5rem)] md:pt-10 lg:px-8 lg:pb-[calc(env(safe-area-inset-bottom,0px)+4.5rem)]">
          <section className="min-w-0 pt-2 md:pt-0">
            <div className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">
              <Compass className="h-4 w-4 text-[var(--accent)]" strokeWidth={2} />
              <span>DISCOVER</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <p className="min-w-0 flex-1 truncate text-[18px] font-medium leading-tight text-[var(--text-main)] sm:text-[18px]">
                Hi, <span className="font-bold">{greetingName}!</span>
              </p>

              <UserMenu user={currentUser} profile={currentProfile} compact />
            </div>

            <p className="mt-2 max-w-[22rem] text-[13px] leading-6 text-slate-500">
              Curated spots, cities, and categories in one clean view.
            </p>

            <button
              type="button"
              onClick={() => navigateToPath('/search')}
              className="mt-8 flex h-[56px] w-full items-center justify-between rounded-[20px] border border-slate-200/70 bg-transparent px-4 text-[var(--accent-deep)] transition hover:border-slate-300 hover:bg-slate-50/70"
            >
              <span className="flex min-w-0 items-center gap-2.5 text-[var(--accent-deep)]">
                <Search className="h-[21px] w-[21px] shrink-0 text-[var(--accent-deep)]" strokeWidth={2} />
                <span className="truncate text-[15px] font-medium text-slate-500">Discover a city</span>
              </span>
              <SlidersHorizontal className="h-[21px] w-[21px] shrink-0 text-[var(--accent-deep)]" strokeWidth={2} />
            </button>

            <section className="mt-9 md:mt-7">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">
                <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={2.2} />
                <span>AI Features</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {homeAiFeatures.map((feature) => {
                  const Icon = feature.icon

                  return (
                    <button
                      key={feature.href}
                      type="button"
                      onClick={() => navigateToPath(feature.href)}
                      className="flex min-w-0 items-center gap-3 rounded-[18px] border border-slate-200/80 bg-white/75 px-3.5 py-3 text-left shadow-[0_10px_24px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-wash)] text-[var(--accent-deep)]">
                        <Icon className="h-4.5 w-4.5" strokeWidth={2.2} />
                      </span>

                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-bold tracking-[-0.02em] text-slate-950">
                          {feature.title}
                        </span>
                        <span className="block truncate text-[12px] text-slate-500">
                          {feature.description}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          </section>

          <div className="mt-8 grid min-w-0 gap-7 md:mt-10 md:gap-10 lg:gap-12">
            <section className="min-w-0 md:-mt-1">
              <div className="flex items-center justify-between gap-3">
                <h2 className="home-top-picks-heading inline-flex items-center gap-2 text-[24px] font-bold tracking-[-0.04em] text-slate-950">
                  <span className="home-top-picks-flame" aria-hidden="true">
                    <Flame className="h-5 w-5" strokeWidth={2.2} />
                  </span>
                  <span className="home-top-picks-title">Top Picks</span>
                </h2>
                <div className="flex items-center gap-3">
                  {activeTopPicksTab === 'all' ? (
                    <button
                      type="button"
                      onClick={() => navigateToPath('/places')}
                      className="mt-1 inline-flex items-center gap-1 text-[14px] font-medium text-slate-400 transition hover:text-slate-700"
                    >
                      See all
                      <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-1.5 flex items-center gap-3 overflow-x-auto text-[14px]">
                <button
                  type="button"
                  onClick={() => handleTopPicksTabChange('all')}
                  className={`shrink-0 transition hover:text-[var(--accent-deep)] ${
                    activeTopPicksTab === 'all' ? 'font-semibold text-[var(--accent-deep)]' : 'font-medium text-slate-400'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => handleTopPicksTabChange('popular')}
                  className={`shrink-0 transition hover:text-[var(--accent-deep)] ${
                    activeTopPicksTab === 'popular' ? 'font-semibold text-[var(--accent-deep)]' : 'font-medium text-slate-400'
                  }`}
                >
                  Popular
                </button>
                <button
                  type="button"
                  onClick={() => handleTopPicksTabChange('recommended')}
                  className={`shrink-0 transition hover:text-[var(--accent-deep)] ${
                    activeTopPicksTab === 'recommended' ? 'font-semibold text-[var(--accent-deep)]' : 'font-medium text-slate-400'
                  }`}
                >
                  Recommended
                </button>
              </div>

              <div className="-mx-4 mt-3">
                <div
                  ref={heroCarouselRef}
                  className={`w-full min-w-0 px-4 pb-1 ${
                    shouldShowTopPickSkeletons
                      ? 'overflow-hidden'
                      : 'home-drag-rail hide-scrollbar overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [overscroll-behavior-x:contain] [-webkit-overflow-scrolling:touch] max-lg:snap-x max-lg:snap-proximity lg:snap-none select-none [&::-webkit-scrollbar]:hidden'
                  }`}
                >
                  <div
                    className={`flex min-w-max gap-4 transition-opacity duration-300 ${
                      isTrendingLoading && visibleTopPickCarouselPlaces.length > 0 ? 'opacity-90' : 'opacity-100'
                    }`}
                  >
                    {shouldShowTopPickSkeletons ? (
                      Array.from({ length: 3 }).map((_, index) => (
                        <HomeFeaturedCardSkeleton key={`home-featured-skeleton-${index}`} index={index} />
                      ))
                    ) : trendingError && visibleTopPickCarouselPlaces.length === 0 ? (
                      <p className="col-span-2 rounded-[20px] bg-white px-4 py-4 text-sm text-red-500 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                        {trendingError}
                      </p>
                    ) : (
                      visibleTopPickCarouselPlaces.map((place, index) => (
                        <div
                          key={`${activeTopPicksTab}-${place.id}-${index}`}
                          ref={(node) => {
                            heroCardRefs.current[index] = node
                          }}
                          data-rail-item
                          className="w-[clamp(17rem,84vw,21.5rem)] shrink-0 snap-center md:w-[320px] lg:w-[344px] xl:w-[360px]"
                        >
                          <HomeFeaturedCard
                            place={place}
                            index={index}
                            onGuestFavorite={() => guestAuth.open('favorite')}
                          />
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <CarouselPositionIndicator
                  currentIndex={activeHeroIndex}
                  total={topPicksIndicatorTotal}
                  trackClassName="w-[118px]"
                  onSelect={shouldShowTopPickSkeletons ? undefined : handleHeroIndicatorSelect}
                  variant="segmented"
                  progressRatio={heroIndicatorProgressRatio}
                  label={
                    activeTopPicksTab === 'all'
                      ? 'All places preview'
                      : activeTopPicksTab === 'recommended'
                        ? 'Recommended places'
                        : 'Featured places'
                  }
                />
              </div>
            </section>

            <section className="min-w-0">
              <div className="flex items-center justify-between gap-3">
                <h2 className="inline-flex items-center gap-2 text-[22px] font-bold tracking-[-0.04em] text-slate-950"><MapPin className="h-5 w-5" strokeWidth={2.2} />Cities</h2>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={openAllCities}
                    className="mt-1 inline-flex items-center gap-1 text-[14px] font-medium text-slate-400 transition hover:text-slate-700"
                  >
                    See all
                    <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
                  </button>
                </div>
              </div>

              <div
                ref={cityRailRef}
                className="home-drag-rail hide-scrollbar -mx-1 mt-3 overflow-x-auto px-1 pb-2 pr-2 [scrollbar-width:none] [-ms-overflow-style:none] [overscroll-behavior-x:contain] [-webkit-overflow-scrolling:touch] max-lg:snap-x max-lg:snap-proximity lg:snap-none select-none [&::-webkit-scrollbar]:hidden"
              >
                <div className="flex min-w-max gap-2.5 md:gap-3 lg:gap-4">
                  {cityTiles.map((tile) => (
                    <div key={tile.slug} data-rail-item className="shrink-0 snap-center">
                      <HomeCategoryTile
                        label={tile.label}
                        place={tile.place}
                        active={tile.active}
                        isLoading={!areHomeCardsLoaded}
                        onClick={() => {
                          setSelectedCityTileSlug(tile.slug ?? null)
                          navigateToPath(tile.href)
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <CarouselPositionIndicator
                currentIndex={cityRailIndicator.currentIndex}
                total={cityRailIndicator.total}
                className="!-mt-1"
                trackClassName="w-[118px]"
                onSelect={cityRailIndicator.handleSelect}
                variant="segmented"
                progressRatio={cityRailIndicator.progressRatio}
                label="Cities"
              />
            </section>

            <section className="min-w-0">
              <div className="flex items-center justify-between gap-3">
                <h2 className="inline-flex items-center gap-2 text-[22px] font-bold tracking-[-0.04em] text-slate-950"><LayoutGrid className="h-5 w-5" strokeWidth={2.2} />Categories</h2>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={openAllCategories}
                    className="mt-1 inline-flex items-center gap-1 text-[14px] font-medium text-slate-400 transition hover:text-slate-700"
                  >
                    See all
                    <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
                  </button>
                </div>
              </div>

              <div
                ref={categoryRailRef}
                className="home-drag-rail hide-scrollbar -mx-1 mt-3 overflow-x-auto px-1 pb-2 pr-2 [scrollbar-width:none] [-ms-overflow-style:none] [overscroll-behavior-x:contain] [-webkit-overflow-scrolling:touch] max-lg:snap-x max-lg:snap-proximity lg:snap-none select-none [&::-webkit-scrollbar]:hidden"
              >
                <div className="flex min-w-max gap-2.5 md:gap-3 lg:gap-4">
                  {categoryTiles.map((tile) => (
                    <div key={tile.label} data-rail-item className="shrink-0 snap-center">
                      <HomeCategoryTile
                        label={tile.label}
                        place={tile.place}
                        active={tile.active}
                        isLoading={!areHomeCardsLoaded}
                        onClick={() => {
                          setSelectedCategoryTileLabel(tile.label)
                          navigateToPath(tile.href)
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <CarouselPositionIndicator
                currentIndex={categoryRailIndicator.currentIndex}
                total={categoryRailIndicator.total}
                className="!-mt-1"
                trackClassName="w-[118px]"
                onSelect={categoryRailIndicator.handleSelect}
                variant="segmented"
                progressRatio={categoryRailIndicator.progressRatio}
                label="Categories"
              />
            </section>
          </div>
        </div>
      </main>

      <div className="lg:hidden">
        <MobileBottomNav currentPath="/home" />
      </div>
      {guestAuth.promptElement}
    </PageShell>
  )
}

export default HomePage
