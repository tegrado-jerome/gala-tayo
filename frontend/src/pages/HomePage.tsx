import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type RefObject } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faChevronRight, faCompass, faFire, faHandSparkles, faHeart, faLocationDot, faMagnifyingGlass, faRobot, faSliders, faStar, faTableCellsLarge } from '@fortawesome/free-solid-svg-icons'
import { faHeart as faHeartRegular } from '@fortawesome/free-regular-svg-icons'
import { Sun, Moon } from 'lucide-react'
import { useAppUser } from '../context/AppUserContext'
import { useTheme } from '../context/ThemeContext'
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
import { navigateToPath } from '../utils/navigation'
import type { NavigationSource } from '../app/useAppLocationState'
import {
  clearHomeScrollCache,
  readHomeScrollCache,
  restoreHomeHorizontalScrolls,
  restoreHomeScroll,
  writeHomeScrollCache,
} from '../utils/homeScrollCache'
import { preloadHomeImage, useHomeImageSrc } from '../utils/homeImageCache'
import { getCanonicalPlacePath, resolveAreaMeta } from '../utils/routes'
import { placeCategories } from '../data/placeCategories'
import SeoHead from '../components/SeoHead'
import { fetchHomePlaceDetailsBatch, prefetchPlaceDetail, readCachedPlaceDetail } from '../utils/placeDetailCache'
import { R2_PUBLIC_BASE_URL } from '../data/r2Config'

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
  icon: IconDefinition
}

const homeAiFeatures: HomeAiFeature[] = [
  {
    title: 'AI Chatbot',
    description: 'Ask for gala ideas',
    href: '/ask-ai/chatbot',
    icon: faRobot,
  },
  {
    title: 'AI Maps',
    description: 'Find places with AI',
    href: '/ask-ai/maps',
    icon: faHandSparkles,
  },
]

const TABLET_HOME_RAIL_QUERY = '(min-width: 768px)'
function HomeThemeToggleButton() {
  const { resolvedTheme, setThemePreference } = useTheme()

  const nextThemePreference = resolvedTheme === 'dark' ? 'light' : 'dark'
  const label = `Switch to ${nextThemePreference} mode`
  const Icon = resolvedTheme === 'dark' ? Sun : Moon

  return (
    <button
      type="button"
      onClick={() => setThemePreference(nextThemePreference)}
      aria-label={label}
      className="home-theme-toggle-button"
    >
      <span className="home-theme-toggle-button__icon">
        <Icon className="h-4 w-4" />
      </span>
    </button>
  )
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

function formatRatingText(value: number | string | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 ? value.toFixed(1) : '0'
  }

  if (typeof value === 'string') {
    const trimmedValue = value.trim()
    if (!trimmedValue) {
      return '0'
    }

    const numericValue = Number(trimmedValue)
    if (Number.isFinite(numericValue)) {
      return numericValue > 0 ? numericValue.toFixed(1) : '0'
    }

    return trimmedValue
  }

  return '0'
}

function getRatingValue(value: number | string | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value)
  }

  if (typeof value === 'string') {
    const parsedValue = Number(value.trim())
    return Number.isFinite(parsedValue) ? Math.max(0, parsedValue) : 0
  }

  return 0
}

function getPlaceDetailRatingValue(place: {
  rating?: number | null
}) {
  if (typeof place.rating === 'number' && Number.isFinite(place.rating)) {
    return Math.max(0, place.rating)
  }

  return 0
}

function mergeHomePlacesWithRatings<T extends { slug: string; rating?: number | null; reviewCount?: string }>(
  places: T[],
  ratingsBySlug: Record<string, { rating: number | null; reviewCount: number | null }>
) {
  return places.map((place) => {
    const ratingSummary = ratingsBySlug[place.slug]

    if (!ratingSummary) {
      return place
    }

    return {
      ...place,
      rating: ratingSummary.rating,
      reviewCount:
        ratingSummary.reviewCount !== null
          ? String(ratingSummary.reviewCount)
          : place.reviewCount,
    }
  })
}

function RatingStars({ value }: { value: number }) {
  const filledStars = Math.max(0, Math.min(5, Math.round(value)))

  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((starIndex) => (
        <FontAwesomeIcon
          key={starIndex}
          icon={faStar}
          className={`h-3 w-3 ${starIndex <= filledStars ? 'text-amber-300' : 'text-white/40'}`}
        />
      ))}
    </span>
  )
}

import { getStaticPlaceImageUrlForSlug } from '../data/placeIndexVisuals'

const homeTopPickPlaceSlugs = Array.from(
  new Set(
    [...homeAllTopPickPlaces, ...homePopularTopPickPlaces, ...homeRecommendedTopPickPlaces].map(
      (place) => place.slug
    )
  )
)

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

function getHomeImagePreloadUrls(activeTab: 'all' | 'popular' | 'recommended' = 'all') {
  const topPickPlaces =
    activeTab === 'popular'
      ? homePopularTopPickPlaces.slice(0, 3)
      : activeTab === 'recommended'
        ? homeRecommendedTopPickPlaces.slice(0, 3)
        : homeAllTopPickPlaces.slice(0, 3)

  return topPickPlaces.reduce<string[]>((uniqueUrls, place) => {
    for (const imageUrl of getHomeTileImageCandidates(place)) {
      if (!uniqueUrls.includes(imageUrl)) {
        uniqueUrls.push(imageUrl)
      }
    }

    return uniqueUrls
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

function buildCityHref(citySlug: string) {
  return `/places/${encodeURIComponent(citySlug)}`
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
  onNavigateFromHome,
}: {
  place: ShowcasePlace
  index: number
  onGuestFavorite: () => void
  onNavigateFromHome?: (place: ShowcasePlace, viewportTop: number, href: string | null) => void
}) {
  const href = buildPlaceHref(place)
  const imageCandidates = useMemo(() => getHomeTileImageCandidates(place), [place])
  const [failedImageUrls, setFailedImageUrls] = useState<string[]>([])
  const imageUrl = imageCandidates.find((candidate) => !failedImageUrls.includes(candidate)) ?? null
  const shouldShowImage = Boolean(imageUrl)
  const resolvedSrc = useHomeImageSrc(imageUrl)
  const locationText = getPlaceLocationText(place)
  const ratingText = getPlaceRatingText(place)
  const ratingValue = getRatingValue(place.rating)
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
    if (onNavigateFromHome) {
      onNavigateFromHome(place, event.currentTarget.getBoundingClientRect().top, href)
      return
    }

    if (href) {
      if (place.slug) {
        void prefetchPlaceDetail(place.slug)
      }

      writeHomeScrollCache({
        scrollY: window.scrollY,
        selectedPlaceId: place.id,
        selectedPlaceViewportTop: event.currentTarget.getBoundingClientRect().top,
        pendingScrollRestore: true,
        activeTab: 'all',
        topPicksScrollLeftByTab: { all: 0, popular: 0, recommended: 0 },
        citiesScrollLeft: 0,
        categoriesScrollLeft: 0,
      })
      navigateToPath(href)
      return
    }

    navigateToPath('/search')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (onNavigateFromHome) {
        onNavigateFromHome(place, event.currentTarget.getBoundingClientRect().top, href)
        return
      }
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
              loading={index < 3 ? 'eager' : 'lazy'}
              decoding="async"
              fetchPriority={index < 3 ? 'high' : 'low'}
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
            <FontAwesomeIcon icon={isSaved ? faHeart : faHeartRegular} className={`h-3.5 w-3.5`} />
          </button>

          <div className="absolute inset-x-0 bottom-0 p-4">
            <div className="text-white">
              <p className="line-clamp-1 pr-12 text-[17px] font-black leading-tight tracking-[-0.03em]">
                {place.name}
              </p>
              <div className="mt-1.5 flex items-center gap-2 text-[10.5px] text-white/84">
                <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 pr-2">
                  <FontAwesomeIcon icon={faLocationDot} className="h-3 w-3 shrink-0" />
                  <span className="truncate">{locationText}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[rgba(15,23,42,0.36)] px-2.5 py-1 font-semibold text-white">
                  <RatingStars value={ratingValue} />
                  {ratingText}
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
      <div className="relative overflow-hidden rounded-[24px] bg-[var(--home-featured-skeleton-surface)] ring-1 ring-[var(--home-featured-skeleton-ring)] shadow-[var(--shadow-soft)]">
        <div className="relative aspect-[1.28] w-full">
          <AppSkeleton className="home-skeleton absolute inset-0 rounded-[24px]" />
          <div className="absolute inset-x-0 bottom-0 p-4">
            <AppSkeleton className="home-skeleton-soft h-5 w-2/3 rounded-full" style={{ background: 'var(--home-featured-skeleton-title)' }} />
            <div className="mt-2 flex items-center gap-2">
              <AppSkeleton className="home-skeleton-soft h-3.5 w-28 rounded-full" style={{ background: 'var(--home-featured-skeleton-meta)' }} />
              <AppSkeleton className="home-skeleton-soft h-6 w-14 rounded-full" style={{ background: 'var(--home-featured-skeleton-meta)' }} />
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
            <AppSkeleton className="home-skeleton-soft h-4 w-28 rounded-full" />
            <div className="mt-3 flex items-center justify-between gap-4">
              <AppSkeleton className="home-skeleton h-7 w-44 rounded-full" />
              <div className="flex items-center gap-1.5">
                <AppSkeleton className="home-skeleton h-9 w-9 rounded-full" />
                <AppSkeleton className="home-skeleton h-10 w-10 rounded-full" />
              </div>
            </div>
            <AppSkeleton className="home-skeleton-soft mt-3 h-4 w-64 rounded-full" />
            <AppSkeleton className="home-skeleton home-skeleton-surface mt-6 h-14 w-full rounded-[20px]" />

            <div className="mt-7">
              <AppSkeleton className="home-skeleton-soft mb-3 h-4 w-24 rounded-full" />
              <div className="grid grid-cols-2 gap-3">
                <AppSkeleton className="home-skeleton home-skeleton-surface h-[76px] rounded-[18px]" />
                <AppSkeleton className="home-skeleton home-skeleton-surface h-[76px] rounded-[18px]" />
              </div>
            </div>
          </section>

          <div className="mt-5 flex min-w-0 flex-1 flex-col justify-evenly gap-4 md:mt-10 md:gap-10 lg:gap-12" aria-hidden="true">
            <section className="min-w-0 md:-mt-1">
              <div className="flex items-center justify-between gap-3">
                <AppSkeleton className="home-skeleton h-8 w-36 rounded-full" />
                <AppSkeleton className="home-skeleton-soft h-5 w-16 rounded-full" />
              </div>
              <div className="mt-2 flex gap-3">
                <AppSkeleton className="home-skeleton-soft h-5 w-10 rounded-full" />
                <AppSkeleton className="home-skeleton-soft h-5 w-16 rounded-full" />
                <AppSkeleton className="home-skeleton-soft h-5 w-28 rounded-full" />
              </div>
              <div className="-mx-4 mt-3 px-4">
                <div className="flex gap-4 overflow-hidden">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <HomeFeaturedCardSkeleton key={`home-page-skeleton-card-${index}`} index={index} />
                  ))}
                </div>
              </div>
              <div className="mt-4 flex justify-center">
                <AppSkeleton className="home-skeleton-soft h-3 w-28 rounded-full" />
              </div>
            </section>

            <section className="min-w-0">
              <div className="flex items-center justify-between gap-3">
                <AppSkeleton className="home-skeleton h-7 w-24 rounded-full" />
                <AppSkeleton className="home-skeleton-soft h-5 w-16 rounded-full" />
              </div>
              <div className="mt-3 flex gap-3 overflow-hidden">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={`home-city-skeleton-${index}`} className="flex w-[clamp(4.75rem,22vw,7.5rem)] shrink-0 flex-col items-center gap-2 px-1 py-1.5 md:w-[120px] lg:w-[132px]">
                    <AppSkeleton className="home-skeleton home-skeleton-surface h-[clamp(4rem,18vw,5.75rem)] w-[clamp(4rem,18vw,5.75rem)] rounded-[16px] md:h-[84px] md:w-[84px] lg:h-[92px] lg:w-[92px]" />
                    <AppSkeleton className="home-skeleton-soft h-4 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            </section>

            <section className="min-w-0">
              <div className="flex items-center justify-between gap-3">
                <AppSkeleton className="home-skeleton h-7 w-32 rounded-full" />
                <AppSkeleton className="home-skeleton-soft h-5 w-16 rounded-full" />
              </div>
              <div className="mt-3 flex gap-3 overflow-hidden">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={`home-category-skeleton-${index}`} className="flex w-[clamp(4.75rem,22vw,7.5rem)] shrink-0 flex-col items-center gap-2 px-1 py-1.5 md:w-[120px] lg:w-[132px]">
                    <AppSkeleton className="home-skeleton home-skeleton-surface h-[clamp(4rem,18vw,5.75rem)] w-[clamp(4rem,18vw,5.75rem)] rounded-[16px] md:h-[84px] md:w-[84px] lg:h-[92px] lg:w-[92px]" />
                    <AppSkeleton className="home-skeleton-soft h-4 w-20 rounded-full" />
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
        active ? 'bg-[var(--home-tile-active-bg)]' : 'bg-transparent'
      }`}
    >
      <div
        className={`h-[clamp(4rem,18vw,5.75rem)] w-[clamp(4rem,18vw,5.75rem)] overflow-hidden rounded-[16px] border transition md:h-[84px] md:w-[84px] lg:h-[92px] lg:w-[92px] ${
          active ? 'border-[var(--home-tile-active-border)] shadow-[var(--home-tile-shadow)] ring-1 ring-[var(--home-tile-active-ring)]' : 'border-[var(--home-tile-border)]'
        }`}
        style={{ background: 'var(--home-tile-surface)' }}
      >
        {!isLoading && shouldShowImage ? (
          <div className="relative h-full w-full">
            <img
              src={resolvedSrc || undefined}
              alt={label}
              className="h-full w-full object-cover"
              draggable={false}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
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
      <span className={`w-full truncate text-[12.5px] font-medium md:text-[14px] ${active ? 'text-[var(--home-tile-label-active)]' : 'text-[var(--home-tile-label)]'}`}>{label}</span>
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

function getRailItemTargetLeft(element: HTMLElement, item: HTMLElement) {
  const targetLeft =
    element.scrollLeft + item.getBoundingClientRect().left - element.getBoundingClientRect().left
  const maxScrollLeft = Math.max(element.scrollWidth - element.clientWidth, 0)

  return Math.min(maxScrollLeft, Math.max(0, targetLeft))
}

function HomePage({ navigationSource }: { navigationSource: NavigationSource }) {
  const { currentProfile, currentUser } = useAppUser()
  const guestAuth = useGuestAuthPrompt()
  const initialHomeScrollCacheRef = useRef(readHomeScrollCache())
  const hasRestoredHomeScrollRef = useRef(false)
  const [activeTopPicksTab, setActiveTopPicksTab] = useState<'all' | 'popular' | 'recommended'>(
    navigationSource === 'pop'
      ? (initialHomeScrollCacheRef.current?.activeTab ?? 'all')
      : 'all'
  )
  const topPicksScrollLeftByTabRef = useRef<{ all: number; popular: number; recommended: number }>({
    all: 0,
    popular: 0,
    recommended: 0,
  })
  const [selectedCityTileSlug, setSelectedCityTileSlug] = useState<string | null>(null)
  const [selectedCategoryTileLabel, setSelectedCategoryTileLabel] = useState<string | null>(null)
  const [homeTopPickRatingsBySlug, setHomeTopPickRatingsBySlug] = useState<Record<string, { rating: number | null; reviewCount: number | null }>>(() => {
    return homeTopPickPlaceSlugs.reduce<Record<string, { rating: number | null; reviewCount: number | null }>>((accumulator, slug) => {
      const cachedPlace = readCachedPlaceDetail(slug)

      if (cachedPlace) {
        accumulator[slug] = {
          rating: getPlaceDetailRatingValue(cachedPlace),
          reviewCount: typeof cachedPlace.review_count === 'number' && Number.isFinite(cachedPlace.review_count)
            ? Math.max(0, Math.floor(cachedPlace.review_count))
            : null,
        }
      }

      return accumulator
    }, {})
  })
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
    return mergeHomePlacesWithRatings(homePopularTopPickPlaces, homeTopPickRatingsBySlug)
  }, [homeTopPickRatingsBySlug])

  const recommendedTopPickPlaces = useMemo(() => {
    return mergeHomePlacesWithRatings(homeRecommendedTopPickPlaces, homeTopPickRatingsBySlug)
  }, [homeTopPickRatingsBySlug])

  const allTopPickPlaces = useMemo(() => {
    return mergeHomePlacesWithRatings(homeAllTopPickPlaces, homeTopPickRatingsBySlug)
  }, [homeTopPickRatingsBySlug])

  const popularTopPickPlaces = useMemo(() => {
    return mergeHomePlacesWithRatings(homePopularTopPickPlaces, homeTopPickRatingsBySlug)
  }, [homeTopPickRatingsBySlug])

  useEffect(() => {
    let isActive = true

    void fetchHomePlaceDetailsBatch({
      slugs: homeTopPickPlaceSlugs,
      cityImageRequests: [],
      refresh: true,
    }).then(({ places }) => {
      if (!isActive || places.length === 0) {
        return
      }

      setHomeTopPickRatingsBySlug((currentRatings) => {
        const nextRatings = { ...currentRatings }

        for (const place of places) {
          nextRatings[place.slug] = {
            rating: getPlaceDetailRatingValue(place),
            reviewCount:
              typeof place.review_count === 'number' && Number.isFinite(place.review_count)
                ? Math.max(0, Math.floor(place.review_count))
                : null,
          }
        }

        return nextRatings
      })
    })

    return () => {
      isActive = false
    }
  }, [])

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

  const shouldShowTopPickSkeletons = false
  const isHomePageReady = true

  const cityTiles = useMemo<HomeTileRecommendation[]>(() => {
    return homeCityRecommendations.map((tile) => {
      const citySlug = getHomepageCitySlug(tile.place)

      return {
        label: getHomepageCityTileLabel(tile.label),
        slug: citySlug,
        href: buildCityHref(citySlug),
        active: selectedCityTileSlug === citySlug,
        place: tile.place,
      }
    })
  }, [selectedCityTileSlug])

  const categoryTiles = useMemo<HomeTileRecommendation[]>(() => {
    return homeCategoryRecommendations.map((tile) => {
      return {
        label: tile.label,
        href: buildCategoryHref(tile.label),
        active: selectedCategoryTileLabel === tile.label,
        place: tile.place,
      }
    })
  }, [selectedCategoryTileLabel])
  const homeImagePreloadUrls = useMemo(() => getHomeImagePreloadUrls(activeTopPicksTab), [activeTopPicksTab])
  const homeImagePreconnectOrigins = useMemo(() => [new URL(R2_PUBLIC_BASE_URL).origin], [])
  const homeSeoConfig = useMemo(() => ({
    title: 'Home | GalaTayo',
    description: 'Discover Metro Manila places by city, category, budget, and vibe.',
    canonicalPath: '/home',
    preloadLinks: homeImagePreloadUrls.map((href) => ({
        href,
        as: 'image' as const,
        fetchPriority: 'high' as const,
    })),
    preconnectOrigins: homeImagePreconnectOrigins,
  }), [homeImagePreconnectOrigins, homeImagePreloadUrls])

  useLayoutEffect(() => {
    if (navigationSource !== 'pop') {
      clearHomeScrollCache()
      return
    }

    const homeScrollCache = initialHomeScrollCacheRef.current

    if (!homeScrollCache?.pendingScrollRestore || hasRestoredHomeScrollRef.current) {
      return
    }

    hasRestoredHomeScrollRef.current = true
    restoreHomeScroll({
      scrollY: homeScrollCache.scrollY,
      selectedPlaceId: homeScrollCache.selectedPlaceId,
      selectedPlaceViewportTop: homeScrollCache.selectedPlaceViewportTop,
    })

    topPicksScrollLeftByTabRef.current = {
      all: homeScrollCache.topPicksScrollLeftByTab?.all ?? 0,
      popular: homeScrollCache.topPicksScrollLeftByTab?.popular ?? 0,
      recommended: homeScrollCache.topPicksScrollLeftByTab?.recommended ?? 0,
    }

    restoreHomeHorizontalScrolls(
      homeScrollCache,
      activeTopPicksTab,
      {
        heroCarousel: heroCarouselRef.current,
        cityRail: cityRailRef.current,
        categoryRail: categoryRailRef.current,
      }
    )

    clearHomeScrollCache()
  }, [activeTopPicksTab, navigationSource])

  useLayoutEffect(() => {
    heroCardRefs.current.length = visibleTopPickCarouselPlaces.length
  }, [activeTopPicksTab, visibleTopPickCarouselPlaces.length])

  useLayoutEffect(() => {
    for (const imageUrl of homeImagePreloadUrls) {
      preloadHomeImage(imageUrl)
    }
  }, [homeImagePreloadUrls])

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
    saveHomePageState()
    navigateToPath('/places')
  }

  const openAllCategories = () => {
    saveHomePageState()
    navigateToPath('/places/categories')
  }

  const handleTopPicksTabChange = (tab: 'all' | 'popular' | 'recommended') => {
    if (heroCarouselRef.current) {
      topPicksScrollLeftByTabRef.current[activeTopPicksTab] = heroCarouselRef.current.scrollLeft
    }

    setActiveTopPicksTab(tab)
    setActiveHeroCardIndex(0)
    setActiveHeroIndex(0)
    setHeroIndicatorProgressRatio(0)

    requestAnimationFrame(() => {
      heroCarouselRef.current?.scrollTo({
        left: 0,
        behavior: 'auto',
      })
    })
  }

  const saveHomePageState = (overrides?: { selectedPlaceId?: string; selectedPlaceViewportTop?: number | null }) => {
    const heroCarousel = heroCarouselRef.current

    if (heroCarousel) {
      topPicksScrollLeftByTabRef.current[activeTopPicksTab] = heroCarousel.scrollLeft
    }

    writeHomeScrollCache({
      scrollY: window.scrollY,
      selectedPlaceId: overrides?.selectedPlaceId ?? null,
      selectedPlaceViewportTop: overrides?.selectedPlaceViewportTop ?? null,
      pendingScrollRestore: true,
      activeTab: activeTopPicksTab,
      topPicksScrollLeftByTab: {
        all: topPicksScrollLeftByTabRef.current.all,
        popular: topPicksScrollLeftByTabRef.current.popular,
        recommended: topPicksScrollLeftByTabRef.current.recommended,
      },
      citiesScrollLeft: cityRailRef.current?.scrollLeft ?? 0,
      categoriesScrollLeft: categoryRailRef.current?.scrollLeft ?? 0,
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
      <SeoHead {...homeSeoConfig} />
      <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
        <div className="mx-auto flex min-h-screen w-full max-w-[1320px] flex-col px-4 pb-[calc(env(safe-area-inset-bottom,0px)+6.5rem)] pt-[max(18px,env(safe-area-inset-top))] sm:px-5 sm:pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] md:px-6 md:pb-[calc(env(safe-area-inset-bottom,0px)+5rem)] md:pt-10 lg:px-8 lg:pb-[calc(env(safe-area-inset-bottom,0px)+4.5rem)]">
          <section className="min-w-0 pt-2 md:pt-0">
            <div className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: 'var(--home-eyebrow)' }}>
              <FontAwesomeIcon icon={faCompass} className="h-4 w-4" style={{ color: 'var(--home-eyebrow-icon)' }} />
              <span>DISCOVER</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <p className="min-w-0 flex-1 truncate text-[18px] font-medium leading-tight text-[var(--text-main)] sm:text-[18px]">
                Hi, <span className="font-bold">{greetingName}!</span>
              </p>

              <div className="flex items-center gap-1.5">
                <HomeThemeToggleButton />
                <UserMenu user={currentUser} profile={currentProfile} compact />
              </div>
            </div>

            <p className="mt-2 max-w-[22rem] text-[13px] leading-6" style={{ color: 'var(--home-copy)' }}>
              Curated spots, cities, and categories in one clean view.
            </p>

            <button
              type="button"
              onClick={() => { saveHomePageState(); navigateToPath('/search') }}
              className="home-search-button mt-8 flex h-[56px] w-full items-center justify-between rounded-[20px] border px-4 transition"
            >
              <span className="flex min-w-0 items-center gap-2.5" style={{ color: 'var(--home-search-text)' }}>
                <FontAwesomeIcon icon={faMagnifyingGlass} className="h-[21px] w-[21px] shrink-0" style={{ color: 'var(--home-eyebrow-icon)' }} />
                <span className="truncate text-[15px] font-medium" style={{ color: 'var(--home-search-placeholder)' }}>Discover a city</span>
              </span>
              <FontAwesomeIcon icon={faSliders} className="h-[21px] w-[21px] shrink-0" style={{ color: 'var(--home-eyebrow-icon)' }} />
            </button>

            <section className="mt-9 md:mt-7">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: 'var(--home-eyebrow)' }}>
                <FontAwesomeIcon icon={faHandSparkles} className="h-3.5 w-3.5" style={{ color: 'var(--home-eyebrow-icon)' }} />
                <span>AI Features</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {homeAiFeatures.map((feature) => {
                  const Icon = feature.icon

                  return (
                    <button
                      key={feature.href}
                      type="button"
                      onClick={() => { saveHomePageState(); navigateToPath(feature.href) }}
                      className="home-ai-card flex min-w-0 items-center gap-3 rounded-[18px] border px-3.5 py-3 text-left transition hover:-translate-y-0.5"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" style={{ background: 'var(--home-ai-icon-bg)', color: 'var(--home-ai-icon-text)' }}>
                        <FontAwesomeIcon icon={Icon} className="h-4.5 w-4.5" />
                      </span>

                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-bold tracking-[-0.02em]" style={{ color: 'var(--home-ai-title)' }}>
                          {feature.title}
                        </span>
                        <span className="block truncate text-[12px]" style={{ color: 'var(--home-ai-description)' }}>
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
                    <FontAwesomeIcon icon={faFire} className="h-5 w-5" />
                  </span>
                  <span className="home-top-picks-title">Top Picks</span>
                </h2>
                <div className="flex items-center gap-3">
                  {activeTopPicksTab === 'all' ? (
                    <button
                      type="button"
                      onClick={() => { saveHomePageState(); navigateToPath('/places') }}
                      className="mt-1 inline-flex items-center gap-1 text-[14px] font-medium transition"
                      style={{ color: 'var(--home-link)' }}
                    >
                      See all
                      <FontAwesomeIcon icon={faChevronRight} className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-1.5 flex items-center gap-3 overflow-x-auto text-[14px]">
                <button
                  type="button"
                  onClick={() => handleTopPicksTabChange('all')}
                  className={`shrink-0 transition hover:text-[var(--home-tab-hover)] ${
                    activeTopPicksTab === 'all' ? 'font-semibold text-[var(--home-tab-active)]' : 'font-medium text-[var(--home-tab-inactive)]'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => handleTopPicksTabChange('popular')}
                  className={`shrink-0 transition hover:text-[var(--home-tab-hover)] ${
                    activeTopPicksTab === 'popular' ? 'font-semibold text-[var(--home-tab-active)]' : 'font-medium text-[var(--home-tab-inactive)]'
                  }`}
                >
                  Popular
                </button>
                <button
                  type="button"
                  onClick={() => handleTopPicksTabChange('recommended')}
                  className={`shrink-0 transition hover:text-[var(--home-tab-hover)] ${
                    activeTopPicksTab === 'recommended' ? 'font-semibold text-[var(--home-tab-active)]' : 'font-medium text-[var(--home-tab-inactive)]'
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
                    className="flex min-w-max gap-4 transition-opacity duration-300 opacity-100"
                  >
                    {shouldShowTopPickSkeletons ? (
                      Array.from({ length: 3 }).map((_, index) => (
                        <HomeFeaturedCardSkeleton key={`home-featured-skeleton-${index}`} index={index} />
                      ))
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
                            onNavigateFromHome={(clickedPlace, viewportTop, href) => {
                              if (clickedPlace.slug) {
                                void prefetchPlaceDetail(clickedPlace.slug)
                              }
                              saveHomePageState({
                                selectedPlaceId: clickedPlace.id,
                                selectedPlaceViewportTop: viewportTop,
                              })
                              if (href) {
                                navigateToPath(href)
                              } else {
                                navigateToPath('/search')
                              }
                            }}
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
                <h2 className="inline-flex items-center gap-2 text-[22px] font-bold tracking-[-0.04em]" style={{ color: 'var(--home-heading)' }}><FontAwesomeIcon icon={faLocationDot} className="h-5 w-5" style={{ color: 'var(--home-heading)' }} />Cities</h2>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={openAllCities}
                    className="mt-1 inline-flex items-center gap-1 text-[14px] font-medium transition"
                    style={{ color: 'var(--home-link)' }}
                  >
                    See all
                    <FontAwesomeIcon icon={faChevronRight} className="h-4 w-4" />
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
                        isLoading={false}
                        onClick={() => {
                          setSelectedCityTileSlug(tile.slug ?? null)
                          saveHomePageState()
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
                <h2 className="inline-flex items-center gap-2 text-[22px] font-bold tracking-[-0.04em]" style={{ color: 'var(--home-heading)' }}><FontAwesomeIcon icon={faTableCellsLarge} className="h-5 w-5" style={{ color: 'var(--home-heading)' }} />Categories</h2>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={openAllCategories}
                    className="mt-1 inline-flex items-center gap-1 text-[14px] font-medium transition"
                    style={{ color: 'var(--home-link)' }}
                  >
                    See all
                    <FontAwesomeIcon icon={faChevronRight} className="h-4 w-4" />
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
                        isLoading={false}
                        onClick={() => {
                          setSelectedCategoryTileLabel(tile.label)
                          saveHomePageState()
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
