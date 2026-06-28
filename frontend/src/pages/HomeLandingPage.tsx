import { useEffect, useState } from 'react'
import AppHeader from '../components/AppHeader'
import InternalLink from '../components/InternalLink'
import { AppIcon, getCategoryIconName } from '../components/AppIcon'
import type { PlaceCardData, PlaceCategoryMeta, PlaceTagMeta } from '../components/PlaceCard'
import { supabase } from '../supabase'
import { navigateToCanonicalPlace, navigateToPath } from '../utils/navigation'
import homeChibi from '../assets/chibis/public/chibi-welcome-page.webp'
import { metroManilaAreas } from '../data/metroManilaAreas'

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

const homeCategories = [
  { value: 'kainan', label: 'Kainan' },
  { value: 'cafe', label: 'Cafe' },
  { value: 'mall', label: 'Mall' },
  { value: 'parke', label: 'Parke' },
  { value: 'nature', label: 'Nature' },
  { value: 'museum', label: 'Museum' },
  { value: 'heritage', label: 'Heritage' },
  { value: 'tourist', label: 'Tourist' },
  { value: 'activity', label: 'Activity' },
  { value: 'cinema', label: 'Cinema' },
  { value: 'nightlife', label: 'Nightlife' },
  { value: 'stay', label: 'Stay' },
] as const

const compactTools = [
  {
    title: 'Places',
    description: 'Browse places near you.',
    href: '/places',
    icon: 'place' as const,
  },
  {
    title: 'Categories',
    description: 'Explore places by category.',
    href: '/categories',
    icon: 'list' as const,
  },
] as const

const sharedCardClass =
  'rounded-2xl border border-slate-200 bg-white shadow-sm'

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
      className={`flex min-h-[372px] w-[90vw] max-w-[368px] shrink-0 snap-start flex-col overflow-hidden text-left transition hover:border-slate-300 md:min-h-[388px] md:w-auto md:max-w-none lg:h-[324px] lg:max-w-[296px] xl:max-w-[304px] ${sharedCardClass}`}
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

      <div className="flex min-h-0 flex-1 flex-col p-4 lg:p-[14px] xl:p-[16px]">
        <div className="flex flex-col items-start gap-2 lg:gap-2.5">
          <h3 className="line-clamp-2 text-[1rem] font-semibold leading-5 text-slate-950 lg:text-[15.5px] lg:leading-5 xl:text-[16px]">{place.name}</h3>
          <span className="shrink-0 rounded-full bg-[var(--accent-wash)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
            {place.category}
          </span>
        </div>

        <p className="mt-3 truncate text-[13px] font-medium text-slate-800 lg:text-[12.5px] xl:text-[13px]">{location}</p>
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

        <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-[var(--accent)] lg:text-[13px] lg:gap-1">
          View place
          <AppIcon name="arrowRight" className="h-4 w-4" />
        </span>
      </div>
    </button>
  )
}

function HomeLandingPage() {
  const [trendingPlaces, setTrendingPlaces] = useState<PlaceCardData[]>([])
  const [isTrendingLoading, setIsTrendingLoading] = useState(true)
  const [trendingError, setTrendingError] = useState<string | null>(null)
  const [desktopTrendingPage, setDesktopTrendingPage] = useState(0)

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

  useEffect(() => {
    const maxPage = Math.max(Math.ceil(trendingPlaces.length / 5) - 1, 0)
    setDesktopTrendingPage((currentPage) => Math.min(currentPage, maxPage))
  }, [trendingPlaces])

  const handleSearchAction = () => {
    navigateToPath('/search')
  }

  const handleAskAiAction = () => {
    navigateToPath('/ask-ai/text')
  }

  const desktopTrendingPageCount = Math.ceil(trendingPlaces.length / 5)
  const showDesktopTrendingPager = desktopTrendingPageCount > 1
  const visibleDesktopTrendingPlaces = trendingPlaces.slice(desktopTrendingPage * 5, desktopTrendingPage * 5 + 5)

  return (
    <div className="gala-page-background min-h-screen text-[#071633]">
      <AppHeader minimal />

      <main className="mx-auto w-full px-4 pb-6 pt-4 sm:px-6 sm:pb-8 sm:pt-5 md:px-8 lg:w-[calc(100%-64px)] lg:px-0 lg:pb-16 lg:pt-8 xl:w-[calc(100%-96px)] xl:px-0 2xl:w-[min(1680px,calc(100%-128px))]">
        <section className="relative px-3 pt-2 sm:px-6 sm:pt-4 lg:px-0">
          <div className="pointer-events-none absolute inset-x-[16%] top-0 h-28 rounded-full bg-white/80 blur-xl" />
          <div className="pointer-events-none absolute left-1/2 top-[41%] h-[148px] w-[148px] -translate-x-1/2 rounded-full bg-[var(--accent-wash)] blur-xl sm:h-[176px] sm:w-[176px] lg:left-[66%] lg:top-1/2 lg:h-[390px] lg:w-[390px] lg:-translate-y-1/2 xl:left-[68%] xl:h-[450px] xl:w-[450px]" />

          <div className="relative z-10 flex flex-col items-center text-center lg:grid lg:grid-cols-[minmax(520px,0.58fr)_minmax(480px,0.42fr)] lg:grid-rows-[auto_auto] lg:items-center lg:gap-x-4 lg:gap-y-4 lg:text-left xl:grid-cols-[minmax(560px,0.56fr)_minmax(520px,0.44fr)] xl:gap-x-8 2xl:grid-cols-[minmax(600px,0.55fr)_minmax(560px,0.45fr)]">
            <div className="flex flex-col items-center lg:col-start-1 lg:row-start-1 lg:items-start">
              <h1 className="max-w-[11.2ch] text-[1.95rem] font-bold leading-[0.95] tracking-[-0.055em] text-[#071633] sm:max-w-[12ch] sm:text-[3rem] lg:max-w-none lg:text-[4.2rem] xl:text-[4.75rem]">
                <span className="block">Plan your</span>
                <span className="block whitespace-nowrap">next gala</span>
              </h1>
              <p className="mt-3.5 max-w-[27rem] text-sm leading-6 text-[#667A99] sm:mt-4 sm:text-base lg:max-w-[39rem] lg:text-[1.24rem] lg:leading-8 xl:max-w-[41rem] xl:text-[1.3rem]">
                Quick start your next gala with place search, AI help, map-grounded ideas, and cute finds waiting below.
              </p>
            </div>

            <div className="relative mt-5 flex w-full justify-center sm:mt-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:justify-center lg:pl-0 xl:justify-center">
              <img
                src={homeChibi}
                alt="GalaTayo mascot"
                className="relative h-[218px] w-auto scale-[1.18] bg-transparent object-contain object-center sm:h-[242px] sm:scale-[1.2] lg:h-auto lg:w-[500px] lg:scale-[1.22] xl:w-[555px] 2xl:w-[590px]"
                loading="eager"
              />
            </div>

            <div className="mt-5 flex w-full flex-col items-center gap-3 sm:mt-6 sm:flex-row sm:justify-center lg:col-start-1 lg:row-start-2 lg:mt-0 lg:gap-3.5 lg:justify-start">
              <button
                type="button"
                onClick={handleSearchAction}
                className="inline-flex min-h-[52px] w-full max-w-[248px] items-center justify-center gap-2.5 rounded-2xl bg-[var(--accent)] px-5 text-[0.96rem] font-semibold text-white transition hover:bg-[var(--accent-deep)] lg:min-h-[54px] lg:w-[220px] lg:max-w-none"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/70">
                  <AppIcon name="search" className="h-3.5 w-3.5" />
                </span>
                Search Places
              </button>
              <button
                type="button"
                onClick={handleAskAiAction}
                className="inline-flex min-h-[52px] w-full max-w-[248px] items-center justify-center gap-2.5 rounded-2xl border border-[var(--line)] bg-white px-5 text-[0.96rem] font-semibold text-[var(--text-main)] transition hover:bg-[var(--bg-soft)] lg:min-h-[54px] lg:w-[220px] lg:max-w-none"
              >
                <AppIcon name="askAi" className="h-5 w-5" />
                Ask AI
              </button>
              <button
                type="button"
                onClick={() => navigateToPath('/ask-ai/maps')}
                className="inline-flex min-h-[52px] w-full max-w-[248px] items-center justify-center gap-2.5 rounded-2xl border border-[var(--line)] bg-white px-5 text-[0.96rem] font-semibold text-[var(--text-main)] transition hover:bg-[var(--bg-soft)] lg:min-h-[54px] lg:w-[220px] lg:max-w-none"
              >
                <AppIcon name="place" className="h-5 w-5" />
                AI Maps
              </button>
            </div>
          </div>
        </section>

        <div className="mt-9 space-y-7 lg:mt-12 lg:space-y-8 xl:space-y-9">
          <section>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Search places</p>
                <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-2xl">Keep your gala flow moving</h2>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-[repeat(2,minmax(320px,360px))] lg:gap-3 lg:justify-start xl:gap-4">
              {compactTools.map((tool) => (
                <button
                  key={tool.title}
                  type="button"
                  onClick={() => navigateToPath(tool.href)}
                  className="flex min-h-[68px] items-center gap-3 rounded-[20px] border border-[var(--line)] bg-white px-3 py-2.5 text-left transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)] lg:min-h-[52px] lg:gap-3 lg:px-3 lg:py-2.5"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 lg:text-[13px]">
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[var(--accent-wash)] text-[var(--accent-deep)]">
                          <AppIcon name={tool.icon} className="h-3 w-3" />
                        </span>
                        {tool.title}
                      </p>
                      <p className="mt-0.5 text-xs leading-5 text-slate-500 lg:mt-0 lg:text-[11px] lg:leading-3.5">{tool.description}</p>
                    </div>
                  </div>
                  <div className="hidden lg:flex lg:items-center lg:text-[#7A90AE]">
                    <AppIcon name="arrowRight" className="h-4 w-4" />
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="lg:w-[1544px] xl:w-[1584px]">
              <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Trending Now</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-slate-950">Cute finds people are eyeing lately</h2>
              </div>
              {showDesktopTrendingPager ? (
                <div className="hidden rounded-full border border-[#D6E8FF] bg-white/88 p-1 lg:inline-flex lg:items-center lg:gap-1">
                  {Array.from({ length: desktopTrendingPageCount }).map((_, pageIndex) => {
                    const pageStart = pageIndex * 5 + 1
                    const pageEnd = Math.min((pageIndex + 1) * 5, trendingPlaces.length)
                    const isActive = desktopTrendingPage === pageIndex

                    return (
                      <button
                        key={pageIndex}
                        type="button"
                        onClick={() => setDesktopTrendingPage(pageIndex)}
                        aria-pressed={isActive}
                        className={`inline-flex min-h-[36px] items-center justify-center rounded-full px-4 text-[12px] font-semibold transition ${
                          isActive
                            ? 'bg-[#1F66DC] text-white'
                            : 'text-[#5F7698] hover:bg-[#EEF6FF] hover:text-[#1F66DC]'
                        }`}
                      >
                        {pageStart}-{pageEnd}
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
            </div>

            {isTrendingLoading ? (
              <>
                <div className="mt-4 flex snap-x gap-3 overflow-x-auto pb-2 pr-3 md:grid md:grid-cols-2 md:gap-5 md:overflow-visible md:pr-0 lg:hidden">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={index}
                      className="min-h-[360px] w-[90vw] max-w-[368px] shrink-0 rounded-[28px] border border-[#D6E8FF] bg-white/90 md:w-auto md:max-w-none"
                    />
                  ))}
                </div>
                <div className="mt-4 hidden lg:grid lg:w-[1544px] lg:grid-cols-[repeat(5,296px)] lg:gap-4 xl:w-[1584px] xl:grid-cols-[repeat(5,304px)]">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-[324px] w-full max-w-[296px] rounded-[24px] border border-[#D6E8FF] bg-white/90 xl:max-w-[304px]"
                    />
                  ))}
                </div>
              </>
            ) : trendingError ? (
              <p className="mt-4 text-sm text-red-600">{trendingError}</p>
            ) : (
              <>
                <div className="mt-4 flex snap-x gap-3 overflow-x-auto pb-2 pr-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-2 md:gap-5 md:overflow-visible md:pb-0 md:pr-0 lg:hidden">
                  {trendingPlaces.map((place) => (
                    <div key={place.id}>
                      <TrendingCard place={place} />
                    </div>
                  ))}
                </div>

                <div className="mt-4 hidden lg:grid lg:w-[1544px] lg:grid-cols-[repeat(5,296px)] lg:gap-4 xl:w-[1584px] xl:grid-cols-[repeat(5,304px)]">
                  {visibleDesktopTrendingPlaces.map((place) => (
                    <div key={place.id} className="w-full max-w-[296px] xl:max-w-[304px]">
                      <TrendingCard place={place} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          <section>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Browse popular areas</p>
                <h2 className="mt-0.5 text-lg font-semibold tracking-[-0.04em] text-slate-950 sm:text-xl">Jump into Metro Manila areas</h2>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {metroManilaAreas.map((area) => (
                <InternalLink
                  key={area.slug}
                  href={`/places/${area.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-[14px] border border-[var(--line)] bg-white px-2 py-2 text-left transition hover:border-[var(--accent)] hover:bg-white"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-wash)] text-[var(--accent-deep)]">
                    <AppIcon name="place" className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-[11px] font-semibold text-slate-900 leading-none">{area.name}</span>
                </InternalLink>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Build your gala plan</p>
                <h2 className="mt-0.5 text-lg font-semibold tracking-[-0.04em] text-slate-950 sm:text-xl">Pick a starting point</h2>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {homeCategories.map((category) => (
                <button
                  key={category.value}
                  type="button"
                  onClick={() => navigateToPath(`/places/categories/${encodeURIComponent(category.value)}`)}
                  className="inline-flex min-h-[42px] w-full items-center gap-1.5 rounded-[16px] border border-[var(--line)] bg-white px-2.5 py-1.5 text-left transition hover:border-[var(--accent)] hover:bg-white"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-wash)] text-[var(--accent-deep)]">
                    <AppIcon name={getCategoryIconName(category.value)} className="h-3 w-3" />
                  </span>
                  <span className="text-xs font-semibold text-slate-900">{category.label}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

export default HomeLandingPage
