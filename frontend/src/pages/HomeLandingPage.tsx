import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { Flame, TrendingUp } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import { AppIcon, getCategoryIconName } from '../components/AppIcon'
import InternalLink from '../components/InternalLink'
import type { PlaceCardData, PlaceCategoryMeta, PlaceTagMeta } from '../components/PlaceCard'
import { PageContainer, PageShell, ChibiIllustration } from '../components/layout/ResponsiveLayouts'
import { supabase } from '../supabase'
import { navigateToPath } from '../utils/navigation'
import { getApiUrl } from '../utils/apiClient'
import { readHomeTrendingCache, writeHomeTrendingCache } from '../utils/homeTrendingCache'
import {
  clearHomeLandingScrollCache,
  readHomeLandingScrollCache,
  restoreHomeLandingScroll,
  writeHomeLandingScrollCache,
} from '../utils/homeLandingScrollCache'
import { getCanonicalPlacePath, resolveAreaMeta } from '../utils/routes'
import homeChibi from '../assets/chibis/public/chibi-welcome-page.webp'

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
  rating?: number | string | null
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

function formatMarkerRatingText(value: number | string | null | undefined) {
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

function mapBackendPlaceToCard(place: BackendSearchPlace): PlaceCardData | null {
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
    category: place.category || 'Place',
    area: place.location || place.address || place.city || place.area || 'Metro Manila',
    address: place.address || null,
    city: place.city || null,
    localArea: place.area || null,
    rating: typeof place.rating === 'number' ? place.rating : parseCoordinate(place.rating),
    status: 'Unknown',
    reason: place.reason || place.description || 'GalaTayo place suggestion.',
    description: place.description || null,
    badge: place.category || 'Place',
    reviewCount: place.reviewCount === null || place.reviewCount === undefined ? undefined : String(place.reviewCount),
    markerRatingText: formatMarkerRatingText(place.rating),
    imageUrl: place.imageUrl || null,
    curatedImageUrls: Array.isArray(place.curatedImageUrls)
      ? place.curatedImageUrls.filter((item): item is string => Boolean(item?.trim()))
      : [],
    categories: Array.isArray(place.categories) ? place.categories : [],
    tags: Array.isArray(place.tags) ? place.tags : [],
    matchedCategories: Array.isArray(place.matchedCategories) ? place.matchedCategories : [],
    matchedTags: Array.isArray(place.matchedTags) ? place.matchedTags : [],
    place_history: place.place_history || null,
    best_time_to_visit: place.best_time_to_visit || null,
    visit_duration: place.visit_duration || null,
    good_for: Array.isArray(place.good_for)
      ? place.good_for.filter((item): item is string => Boolean(item?.trim()))
      : [],
    not_ideal_for: Array.isArray(place.not_ideal_for)
      ? place.not_ideal_for.filter((item): item is string => Boolean(item?.trim()))
      : [],
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
    distanceKm: typeof place.distanceKm === 'number' ? place.distanceKm : null,
    coordinates: { lat, lng },
  }
}

function getTrendingCardShellClass(isTopThree: boolean) {
  const baseClass =
    'group relative flex w-full flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md'

  if (!isTopThree) {
    return `${baseClass} border-slate-200/80 hover:border-slate-300/80`
  }

  return `${baseClass} border-amber-200/80 bg-gradient-to-br from-white via-white to-amber-50/70 shadow-[0_20px_45px_rgba(245,158,11,0.18)] ring-1 ring-amber-200/50 hover:border-amber-300/90 hover:shadow-[0_26px_58px_rgba(245,158,11,0.26)]`
}

function TrendingCard({ place, rank }: { place: PlaceCardData; rank: number }) {
  const imageUrl = place.imageUrl?.trim() || place.curatedImageUrls?.[0]?.trim() || null
  const description = place.reason || place.description || ''
  const placeholderIconName = getCategoryIconName(place.category)
  const isTopThree = rank <= 3
  const animationDelay = `${(rank - 1) * 140}ms`
  const resolvedHref = place.slug
    ? getCanonicalPlacePath({
        areaSlug: resolveAreaMeta({
          city: place.city,
          area: place.area,
          localArea: place.localArea,
        }).slug,
        placeSlug: place.slug,
      })
    : null

  const handleOpenPlace = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!place.slug) {
      return
    }

    if (event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) {
      return
    }

    writeHomeLandingScrollCache({
      scrollY: window.scrollY,
      selectedPlaceId: place.id,
      selectedPlaceViewportTop: event.currentTarget.getBoundingClientRect().top,
      pendingScrollRestore: true,
    })
  }

  return (
    <div data-home-trending-place-id={place.id}>
      {resolvedHref ? (
        <InternalLink
          href={resolvedHref}
          onClick={handleOpenPlace}
          className={`${getTrendingCardShellClass(isTopThree)} block w-full text-left`}
        >
          {isTopThree ? (
            <>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white/90 via-white/35 to-transparent"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -left-1/3 top-1/4 h-24 w-1/2 rounded-full bg-amber-200/35 blur-3xl"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_20%,rgba(255,255,255,0.1)_35%,rgba(255,255,255,0.85)_46%,rgba(255,255,255,0.1)_57%,transparent_72%)] [background-size:220%_100%] [animation:gala-ai-shine-sweep_4.8s_ease-in-out_infinite]"
                style={{ animationDelay }}
              />
            </>
          ) : null}

          {imageUrl ? (
            <div className="relative h-28 w-full overflow-hidden sm:h-32">
              <img
                src={imageUrl}
                alt={place.name}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                loading="lazy"
              />
              {isTopThree ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-2 top-2 h-10 w-10 rounded-full bg-amber-300/35 blur-md motion-safe:animate-ping"
                  style={{ animationDelay }}
                />
              ) : null}
              {isTopThree ? (
                <div
                  className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-white/70 bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 px-2.5 py-1 text-[10px] font-black text-white shadow-[0_10px_24px_rgba(249,115,22,0.32)] backdrop-blur-sm motion-safe:animate-[gala-score-pop_900ms_ease-out_1_both]"
                  style={{ animationDelay }}
                >
                  <Flame size={11} strokeWidth={2.5} className="motion-safe:animate-bounce" />
                  <span>{rank}</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="relative flex h-28 w-full shrink-0 flex-col items-center justify-center gap-1 overflow-hidden border-b border-slate-100 bg-slate-50 text-center sm:h-32">
              {isTopThree ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-2 top-2 h-10 w-10 rounded-full bg-amber-300/35 blur-md motion-safe:animate-ping"
                  style={{ animationDelay }}
                />
              ) : null}
              {isTopThree ? (
                <div
                  className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-white/70 bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 px-2.5 py-1 text-[10px] font-black text-white shadow-[0_10px_24px_rgba(249,115,22,0.32)] motion-safe:animate-[gala-score-pop_900ms_ease-out_1_both]"
                  style={{ animationDelay }}
                >
                  <Flame size={11} strokeWidth={2.5} className="motion-safe:animate-bounce" />
                  <span>{rank}</span>
                </div>
              ) : null}
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-[var(--accent)]">
                <AppIcon name={placeholderIconName} className="h-4 w-4" />
              </span>
              <span className="text-[11px] font-medium text-slate-400">No photo yet</span>
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-3">
            <div className="flex items-start justify-between gap-2">
              <h3 className="line-clamp-1 text-[13px] font-semibold leading-tight text-slate-900">
                {place.name}
              </h3>
              <span className="shrink-0 rounded-full bg-[var(--accent-wash)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--accent)]">
                {place.category}
              </span>
            </div>

            {description ? (
              <p className="line-clamp-2 text-[11px] leading-[1.4] text-slate-500">
                {description}
              </p>
            ) : null}
          </div>
        </InternalLink>
      ) : (
        <div className={`${getTrendingCardShellClass(isTopThree)} block w-full text-left`}>
          {imageUrl ? (
            <div className="relative h-28 w-full overflow-hidden sm:h-32">
              <img
                src={imageUrl}
                alt={place.name}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="relative flex h-28 w-full shrink-0 flex-col items-center justify-center gap-1 overflow-hidden border-b border-slate-100 bg-slate-50 text-center sm:h-32">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-[var(--accent)]">
                <AppIcon name={placeholderIconName} className="h-4 w-4" />
              </span>
              <span className="text-[11px] font-medium text-slate-400">No photo yet</span>
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-3">
            <div className="flex items-start justify-between gap-2">
              <h3 className="line-clamp-1 text-[13px] font-semibold leading-tight text-slate-900">
                {place.name}
              </h3>
              <span className="shrink-0 rounded-full bg-[var(--accent-wash)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--accent)]">
                {place.category}
              </span>
            </div>

            {description ? (
              <p className="line-clamp-2 text-[11px] leading-[1.4] text-slate-500">
                {description}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

function TrendingCardSkeleton({ rank }: { rank: number }) {
  const isTopThree = rank <= 3

  return (
    <div className={getTrendingCardShellClass(isTopThree)} aria-hidden="true">
      {isTopThree ? (
        <>
          <span className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white/90 via-white/35 to-transparent" />
          <span className="pointer-events-none absolute -left-1/3 top-1/4 h-24 w-1/2 rounded-full bg-amber-200/35 blur-3xl" />
          <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_20%,rgba(255,255,255,0.1)_35%,rgba(255,255,255,0.85)_46%,rgba(255,255,255,0.1)_57%,transparent_72%)] [background-size:220%_100%] [animation:gala-ai-shine-sweep_4.8s_ease-in-out_infinite]" />
        </>
      ) : null}

      <div className="relative h-28 w-full overflow-hidden bg-[linear-gradient(180deg,#f8fbff_0%,#eef4fb_100%)] sm:h-32">
        {isTopThree ? (
          <>
            <span className="pointer-events-none absolute left-2 top-2 h-10 w-10 rounded-full bg-amber-300/35 blur-md motion-safe:animate-ping" />
            <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-white/70 bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 px-2.5 py-1 text-[10px] font-black text-white shadow-[0_10px_24px_rgba(249,115,22,0.32)] motion-safe:animate-[gala-score-pop_900ms_ease-out_1_both]">
              <Flame size={11} strokeWidth={2.5} className="motion-safe:animate-bounce" />
              <span>{rank}</span>
            </div>
          </>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="h-3.5 w-[70%] rounded-full bg-slate-100" />
          <div className="h-4 w-[22%] shrink-0 rounded-full bg-slate-100" />
        </div>

        <div className="h-3 w-[88%] rounded-full bg-slate-100" />
        <div className="h-3 w-[76%] rounded-full bg-slate-100" />
      </div>
    </div>
  )
}

function HomeLandingPage({
  navigationSource = 'push',
}: {
  navigationSource?: 'push' | 'replace' | 'pop'
}) {
  const cachedTrendingPlacesRef = useRef<PlaceCardData[] | null>(readHomeTrendingCache())
  const initialHomeLandingScrollCacheRef = useRef(
    navigationSource === 'pop' ? readHomeLandingScrollCache() : null
  )
  const [trendingPlaces, setTrendingPlaces] = useState<PlaceCardData[]>(cachedTrendingPlacesRef.current ?? [])
  const [isTrendingLoading, setIsTrendingLoading] = useState(cachedTrendingPlacesRef.current === null)
  const [trendingError, setTrendingError] = useState<string | null>(null)
  const hasCachedTrendingPlaces = cachedTrendingPlacesRef.current !== null
  const hasRestoredHomeLandingScrollRef = useRef(false)

  useEffect(() => {
    const controller = new AbortController()

    async function loadTrendingPlaces() {
      try {
        if (hasCachedTrendingPlaces) {
          await new Promise((resolve) => window.setTimeout(resolve, 400))
        } else {
          setIsTrendingLoading(true)
        }
        setTrendingError(null)

        const response = await fetch(getApiUrl('/search'), {
          method: 'POST',
          headers: await getSearchRequestHeaders(),
          signal: controller.signal,
          body: JSON.stringify({
            query: '',
            filters: {
              category: null,
              area: null,
              budget: null,
            },
            exploreAll: true,
            limit: 12,
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
          throw new Error(data.error || data.message || 'Failed to load trending places.')
        }

        const places = (data.places ?? data.result?.places ?? [])
          .map(mapBackendPlaceToCard)
          .filter((place): place is PlaceCardData => Boolean(place))
          .slice(0, 12)

        setTrendingPlaces(places)
        writeHomeTrendingCache(places)
        cachedTrendingPlacesRef.current = places
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return
        }

        if (!hasCachedTrendingPlaces) {
          setTrendingError(error instanceof Error ? error.message : 'Failed to load trending places.')
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsTrendingLoading(false)
        }
      }
    }

    void loadTrendingPlaces()

    return () => {
      controller.abort()
    }
  }, [hasCachedTrendingPlaces])

  useLayoutEffect(() => {
    const homeLandingScrollCache = initialHomeLandingScrollCacheRef.current

    if (navigationSource !== 'pop' || !homeLandingScrollCache?.pendingScrollRestore || hasRestoredHomeLandingScrollRef.current) {
      return
    }

    hasRestoredHomeLandingScrollRef.current = true
    restoreHomeLandingScroll({
      scrollY: homeLandingScrollCache.scrollY,
      selectedPlaceId: homeLandingScrollCache.selectedPlaceId,
      selectedPlaceViewportTop: homeLandingScrollCache.selectedPlaceViewportTop,
    })

    clearHomeLandingScrollCache()
  }, [navigationSource])

  const handleSearchAction = () => {
    navigateToPath('/search')
  }

  const handleAskAiAction = () => {
    navigateToPath('/ask-ai')
  }

  const hasTrendingPlaces = trendingPlaces.length > 0

  return (
    <PageShell>
      <AppHeader minimal />

      <main className="w-full">
        <PageContainer>
          <section className="px-4 pt-6 pb-2 sm:px-6 sm:pt-8 md:px-8 md:pt-10">
            <div className="mx-auto max-w-2xl text-center">
              <div className="mb-5 flex justify-center">
                <ChibiIllustration
                  src={homeChibi}
                  variant="hero"
                  className="w-[clamp(260px,34vw,420px)] max-h-[40vh] md:max-h-[420px]"
                  priority
                />
              </div>

              <h1 className="text-[28px] font-bold tracking-tight text-slate-900 sm:text-[2.9rem]">
                Saan tayo <span className="text-[var(--accent)]">gagala</span> today?
              </h1>

              <div className="mt-7 flex flex-wrap items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={handleSearchAction}
                  className="inline-flex min-h-14 items-center gap-2.5 rounded-full border border-slate-200 bg-white px-7 py-3.5 text-[15px] font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <AppIcon name="search" className="h-4 w-4 text-slate-400" />
                  Search
                </button>
                <button
                  type="button"
                  onClick={handleAskAiAction}
                  className="inline-flex min-h-14 items-center gap-2.5 rounded-full bg-[var(--accent)] px-7 py-3.5 text-[15px] font-semibold text-white shadow-sm transition hover:bg-[var(--accent-deep)]"
                >
                  <AppIcon name="askAi" className="h-4 w-4" strokeWidth={2} />
                  Ask AI
                </button>
              </div>

              <div className="mt-5 flex items-center justify-center gap-4 text-[13px] text-slate-400 sm:text-sm">
                <button
                  type="button"
                  onClick={() => navigateToPath('/places')}
                  className="inline-flex items-center gap-1 transition hover:text-[var(--accent)]"
                >
                  <AppIcon name="place" className="h-3.5 w-3.5" />
                  Places
                </button>
                <span className="text-slate-300">·</span>
                <button
                  type="button"
                  onClick={() => navigateToPath('/places/categories')}
                  className="inline-flex items-center gap-1 transition hover:text-[var(--accent)]"
                >
                  <AppIcon name="layoutGrid" className="h-3.5 w-3.5" />
                  Categories
                </button>
              </div>
            </div>
          </section>

          <section className="mt-10 px-4 pb-12 sm:px-6 md:px-8">
            <h2 className="animate-shimmer flex items-center gap-2 text-[14px] font-semibold uppercase tracking-wider sm:text-[15px]">
              <TrendingUp size={16} strokeWidth={2.5} className="text-[var(--accent)]" />
              Trending now
            </h2>

            {isTrendingLoading && !hasTrendingPlaces ? (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className={i >= 10 ? 'hidden sm:block' : ''}>
                    <TrendingCardSkeleton rank={i + 1} />
                  </div>
                ))}
              </div>
            ) : trendingError && !hasTrendingPlaces ? (
              <p className="mt-4 text-sm text-red-500">{trendingError}</p>
            ) : !hasTrendingPlaces ? (
              <p className="mt-4 text-sm text-slate-500">No trending places available right now.</p>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {trendingPlaces.map((place, i) => (
                  <div key={place.id} className={i >= 10 ? 'hidden sm:block' : ''}>
                    <TrendingCard place={place} rank={i + 1} />
                  </div>
                ))}
              </div>
            )}
          </section>
        </PageContainer>
      </main>
    </PageShell>
  )
}

export default HomeLandingPage
