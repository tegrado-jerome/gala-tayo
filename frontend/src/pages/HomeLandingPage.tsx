import { useEffect, useState } from 'react'
import AppHeader from '../components/AppHeader'
import { AppIcon, getCategoryIconName } from '../components/AppIcon'
import type { PlaceCardData, PlaceCategoryMeta, PlaceTagMeta } from '../components/PlaceCard'
import { PageContainer } from '../components/layout/ResponsiveLayouts'
import { supabase } from '../supabase'
import { navigateToCanonicalPlace, navigateToPath } from '../utils/navigation'
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

const compactTools = [
  {
    title: 'Places',
    description: 'Find nearby spots',
    href: '/places',
    icon: 'place' as const,
  },
  {
    title: 'Categories',
    description: 'Browse by vibe',
    href: '/places/categories',
    icon: 'layoutGrid' as const,
  },
] as const

const sharedCardClass =
  'rounded-[20px] border border-slate-200/90 bg-white'

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

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function getTrendingTags(place: PlaceCardData) {
  const rawTags = [
    ...(place.matchedTags ?? []).map((tag) => tag.name),
    ...(place.matchedCategories ?? []).map((category) => category.name),
    ...((place.matchedTags?.length || place.matchedCategories?.length)
      ? []
      : (place.tags ?? []).map((tag) => tag.name)),
    ...(place.commute_friendly ? ['Commute friendly'] : []),
  ]

  const uniqueTags: string[] = []
  for (const tag of rawTags) {
    const normalizedTag = normalizeText(tag ?? '')
    if (!normalizedTag) {
      continue
    }

    if (!uniqueTags.some((item) => item.toLowerCase() === normalizedTag.toLowerCase())) {
      uniqueTags.push(normalizedTag)
    }
  }

  return uniqueTags
}

function getTrendingLocation(place: PlaceCardData) {
  return place.address || place.city || place.localArea || place.area
}

function TrendingCard({ place }: { place: PlaceCardData }) {
  const imageUrl = place.imageUrl?.trim() || place.curatedImageUrls?.[0]?.trim() || null
  const tags = getTrendingTags(place)
  const visibleTags = tags.slice(0, 2)
  const remainingTagCount = Math.max(tags.length - visibleTags.length, 0)
  const location = getTrendingLocation(place)
  const placeholderIconName = getCategoryIconName(place.category)

  return (
    <button
      type="button"
      onClick={() => {
        if (place.slug) {
          navigateToCanonicalPlace({
            slug: place.slug,
            city: place.city,
            area: place.area,
            localArea: place.localArea,
          })
        }
      }}
      className={`flex h-full min-h-[372px] w-[90vw] max-w-[368px] shrink-0 snap-start flex-col overflow-hidden text-left transition hover:-translate-y-[1px] hover:border-slate-300 md:min-h-[388px] md:w-auto md:max-w-none lg:h-[324px] lg:max-w-[296px] xl:max-w-[304px] ${sharedCardClass}`}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={place.name}
          className="h-[180px] w-full object-cover md:h-[192px] lg:h-[146px] xl:h-[150px]"
          loading="lazy"
        />
      ) : (
        <div className="relative flex h-[180px] w-full flex-col items-center justify-center gap-1.5 overflow-hidden border-b border-slate-200 bg-slate-50 px-4 text-center md:h-[192px] lg:h-[146px] xl:h-[150px]">
          <span className="relative flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-[var(--accent)] lg:h-10 lg:w-10">
            <AppIcon name={placeholderIconName} className="h-5 w-5 lg:h-[18px] lg:w-[18px]" />
          </span>
          <span className="relative text-sm font-semibold text-slate-600">Photo soon</span>
          <span className="relative text-xs font-medium text-slate-500">Cute spot preview</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 pb-3 lg:p-[14px] lg:pb-2.5 xl:p-[16px] xl:pb-3">
        <div className="flex flex-col items-start gap-2 lg:gap-2.5">
          <h3 className="line-clamp-2 text-[1rem] font-semibold leading-5 text-slate-950 lg:text-[15.5px] lg:leading-5 xl:text-[16px]">{place.name}</h3>
          <span className="shrink-0 rounded-full bg-[var(--accent-wash)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
            {place.category}
          </span>
        </div>

        <p className="mt-3 truncate text-[13px] font-medium text-slate-700 lg:text-[12.5px] xl:text-[13px]">{location}</p>
        <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-slate-500 lg:text-[12.5px] xl:text-[13px]">
          {place.reason}
        </p>

        <div className="mt-3 flex min-h-7 gap-1.5 overflow-hidden whitespace-nowrap">
          {visibleTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex min-w-0 max-w-[120px] items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600"
            >
              <span className="truncate">{tag}</span>
            </span>
          ))}
          {remainingTagCount > 0 ? (
            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
              +{remainingTagCount}
            </span>
          ) : null}
        </div>

        <span className="mt-auto inline-flex items-center gap-1 self-start rounded-full bg-[var(--accent-wash)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--accent)] transition group-hover:bg-[var(--accent-soft)] lg:gap-1">
          View place
          <AppIcon name="arrowRight" className="h-3.5 w-3.5" />
        </span>
      </div>
    </button>
  )
}

function HomeLandingPage() {
  const [trendingPlaces, setTrendingPlaces] = useState<PlaceCardData[]>([])
  const [isTrendingLoading, setIsTrendingLoading] = useState(true)
  const [trendingError, setTrendingError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    const loadTrendingPlaces = async () => {
      try {
        setIsTrendingLoading(true)
        setTrendingError(null)

        const response = await fetch('/api/search', {
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
          .slice(0, 10)

        setTrendingPlaces(places)
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return
        }

        setTrendingError(error instanceof Error ? error.message : 'Failed to load trending places.')
      } finally {
        if (!controller.signal.aborted) {
          setIsTrendingLoading(false)
        }
      }
    }

    void loadTrendingPlaces()

    return () => controller.abort()
  }, [])

  const handleSearchAction = () => {
    navigateToPath('/search')
  }

  const handleAskAiAction = () => {
    navigateToPath('/ask-ai')
  }

  return (
    <div className="gala-page-background min-h-screen text-[#071633]">
      <AppHeader minimal />

      <main className="w-full px-4 pb-6 pt-4 sm:px-6 sm:pb-8 sm:pt-5 md:pb-5 md:pt-4 lg:pb-6 lg:pt-4">
        <PageContainer className="px-0">
        <section className="relative px-3 pt-3 sm:px-6 sm:pt-5 md:px-0 md:pt-1 lg:px-0 lg:pt-2">
          <div className="relative z-10 flex flex-col items-center text-center md:mx-auto md:max-w-[820px] lg:max-w-none lg:grid lg:grid-cols-[minmax(0,1.02fr)_minmax(280px,0.98fr)] lg:items-center lg:gap-6 lg:text-left">
            <div className="flex flex-col items-center lg:items-start">
              <p className="mb-6 flex items-center justify-center gap-2 text-[17px] font-semibold leading-snug text-[#071633] sm:mb-8 sm:gap-2.5 sm:text-[19px] md:mb-4 md:text-[18px] lg:mb-5 lg:justify-start lg:text-[20px]">
                <AppIcon name="compass" className="h-4 w-4 text-[var(--accent)] sm:h-[18px] sm:w-[18px]" strokeWidth={2} />
                <span>
                  Saan tayo <span className="font-semibold text-[var(--accent)]">gagala</span> today?
                </span>
              </p>

              <div className="flex justify-center lg:hidden">
                <img
                  src={homeChibi}
                  alt="GalaTayo mascot"
                  className="relative h-[218px] w-auto scale-[1.18] bg-transparent object-contain object-center sm:h-[242px] sm:scale-[1.2] md:h-[220px] md:scale-[1.08]"
                  loading="eager"
                />
              </div>

              <div className="mt-5 flex w-full flex-row flex-wrap items-center justify-center gap-3 sm:mt-6 sm:gap-3.5 md:mt-4 md:gap-3 lg:mt-5 lg:justify-start">
                <button
                  type="button"
                  onClick={handleSearchAction}
                  className="group inline-flex h-12 items-center gap-3 rounded-full border border-slate-200 bg-white px-6 text-[15px] font-semibold text-[var(--accent)] shadow-[0_4px_14px_rgba(15,23,42,0.04)] transition hover:-translate-y-[1px] hover:border-[var(--accent)] hover:bg-[var(--accent-wash)] hover:shadow-[0_8px_18px_rgba(30,58,138,0.10)] active:scale-[0.98] sm:h-[56px] sm:px-7 sm:text-[16px] md:h-[52px] md:px-6 md:text-[15px] lg:h-[52px] lg:px-6 lg:text-[15px]"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-wash)] text-[var(--accent)] transition group-hover:bg-[var(--accent-soft)] sm:h-8 sm:w-8">
                    <AppIcon name="search" className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
                  </span>
                  Search
                </button>
                <button
                  type="button"
                  onClick={handleAskAiAction}
                  className="group inline-flex h-12 items-center gap-3 rounded-full bg-[var(--accent)] px-6 text-[15px] font-semibold text-white shadow-[0_6px_18px_rgba(30,58,138,0.22)] transition hover:-translate-y-[1px] hover:bg-[var(--accent-deep)] hover:shadow-[0_10px_22px_rgba(30,58,138,0.28)] active:scale-[0.98] sm:h-[56px] sm:px-7 sm:text-[16px] md:h-[52px] md:px-6 md:text-[15px] lg:h-[52px] lg:px-6 lg:text-[15px]"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[var(--accent-deep)] transition group-hover:bg-[var(--accent-wash)] sm:h-8 sm:w-8">
                    <AppIcon name="askAi" className="h-4 w-4 sm:h-[18px] sm:w-[18px]" strokeWidth={2.25} />
                  </span>
                  Ask AI
                </button>
              </div>
            </div>

            <div className="hidden lg:flex lg:justify-end">
              <img
                src={homeChibi}
                alt="GalaTayo mascot"
                className="relative h-[256px] w-auto max-h-[320px] scale-[1.04] bg-transparent object-contain object-center"
                loading="eager"
              />
            </div>
          </div>
        </section>

        <div className="mt-8 space-y-8 sm:mt-10 md:mt-5 md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(280px,320px)] md:gap-4 md:space-y-0 lg:mt-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,340px)] lg:gap-6">
          <section>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Trending Now</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-slate-950 md:text-[1.15rem] lg:text-[1.35rem]">
                  Cute spots people are eyeing lately
                </h2>
              </div>
            </div>

            {isTrendingLoading ? (
              <>
                <div className="mt-5 flex snap-x gap-3 overflow-x-auto pb-2 pr-3 md:hidden">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={index}
                      className="min-h-[360px] w-[90vw] max-w-[368px] shrink-0 rounded-[20px] border border-slate-200/90 bg-white/90"
                    />
                  ))}
                </div>

                <div className="mt-5 hidden md:grid md:grid-cols-2 md:gap-3 lg:grid-cols-2 lg:gap-4">
                  {Array.from({ length: 2 }).map((_, index) => (
                    <div
                      key={index}
                      className="flex h-full min-h-[252px] rounded-[20px] border border-slate-200/90 bg-white/90"
                    />
                  ))}
                </div>
              </>
            ) : trendingError ? (
              <p className="mt-5 text-sm text-red-600">{trendingError}</p>
            ) : (
              <>
                <div className="mt-5 flex snap-x gap-3 overflow-x-auto pb-2 pr-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:hidden">
                  {trendingPlaces.map((place) => (
                    <div key={place.id} className="flex">
                      <TrendingCard place={place} />
                    </div>
                  ))}
                </div>

                <div className="mt-5 hidden md:grid md:grid-cols-2 md:gap-3 lg:grid-cols-2 lg:gap-4">
                  {trendingPlaces.map((place) => (
                    <div key={place.id} className="flex w-full">
                      <TrendingCard place={place} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Search places</p>
                <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-2xl md:text-[1.15rem] lg:text-[1.35rem]">
                  Keep your gala flow moving
                </h2>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 md:gap-2.5 lg:gap-3">
              {compactTools.map((tool) => (
                <button
                  key={tool.title}
                  type="button"
                  onClick={() => navigateToPath(tool.href)}
                  className="group relative flex w-full items-center gap-3.5 rounded-[20px] border border-slate-200/80 bg-[linear-gradient(135deg,#ffffff_0%,rgba(30,58,138,0.018)_100%)] px-4 py-3.5 text-left shadow-[0_2px_12px_rgba(15,23,42,0.025)] transition-all duration-200 hover:-translate-y-[1px] hover:border-slate-300/90 hover:bg-[linear-gradient(135deg,#ffffff_0%,rgba(30,58,138,0.035)_100%)] hover:shadow-[0_8px_20px_rgba(30,58,138,0.06)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--accent-soft)] focus-visible:ring-offset-1 active:scale-[0.985] active:bg-[var(--accent-wash)] md:py-3 md:px-3.5 lg:py-3 lg:px-4"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-wash)] text-[var(--accent)] transition-all duration-200 group-hover:scale-105 group-hover:bg-[var(--accent-soft)] group-hover:text-[var(--accent-deep)] group-hover:shadow-[0_0_0_6px_rgba(30,58,138,0.04)] lg:h-[42px] lg:w-[42px]">
                    <AppIcon name={tool.icon} className="h-[18px] w-[18px]" strokeWidth={1.8} />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="text-[14px] font-semibold leading-snug text-slate-900">{tool.title}</p>
                    <p className="mt-0.5 text-[12px] leading-[1.35] text-slate-500">{tool.description}</p>
                  </div>
                  <span className="flex shrink-0 items-center text-slate-300 transition-all duration-200 group-hover:translate-x-[2px] group-hover:text-[var(--accent)]">
                    <AppIcon name="chevronRight" className="h-4 w-4" strokeWidth={2.2} />
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
        </PageContainer>
      </main>
    </div>
  )
}

export default HomeLandingPage
