import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import AppHeader from '../components/AppHeader'
import { AppIcon, getCategoryIconName } from '../components/AppIcon'
import PlaceCard from '../components/PlaceCard'
import type { PlaceCardData, PlaceCategoryMeta, PlaceTagMeta } from '../components/PlaceCard'
import { supabase } from '../supabase'
import { navigateToCanonicalPlace, navigateToPath } from '../utils/navigation'
import homeChibi from '../assets/chibis/public/chibi-welcome-page.webp'

type HomeDashboardPageProps = {
  session: Session | null
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

const quickAccessLinks = [
  { label: 'Favorites', href: '/favorites', icon: 'favorites' as const },
  { label: 'History', href: '/history', icon: 'history' as const },
  { label: 'Gala Plan', href: '/gala-plans', icon: 'galaPlan' as const },
]

const mainActions = [
  {
    title: 'Search Places',
    description: 'Browse Metro Manila spots by city, category, or budget.',
    href: '/search',
    icon: 'search' as const,
    tone: 'primary',
  },
  {
    title: 'Ask AI',
    description: 'Get a faster gala suggestion with one focused prompt.',
    href: '/ask-ai',
    icon: 'askAi' as const,
    tone: 'soft',
  },
  {
    title: 'Gala Plan',
    description: 'Save itineraries, edit routes, and keep your day organized.',
    href: '/gala-plans',
    icon: 'galaPlan' as const,
    tone: 'soft',
  },
  {
    title: 'Prompt Builder',
    description: 'Shape a stronger AI prompt before you search or ask.',
    href: '/ask-ai/prompt-builder',
    icon: 'askAi' as const,
    tone: 'soft',
  },
] as const

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
    status: 'Unknown',
    reason: place.reason || place.description || 'GalaTayo place suggestion.',
    description: place.description || null,
    badge: place.category || 'Place',
    reviewCount: place.reviewCount === null || place.reviewCount === undefined ? undefined : String(place.reviewCount),
    imageUrl: place.imageUrl || null,
    curatedImageUrls: Array.isArray(place.curatedImageUrls) ? place.curatedImageUrls.filter((item): item is string => Boolean(item?.trim())) : [],
    categories: Array.isArray(place.categories) ? place.categories : [],
    tags: Array.isArray(place.tags) ? place.tags : [],
    matchedCategories: Array.isArray(place.matchedCategories) ? place.matchedCategories : [],
    matchedTags: Array.isArray(place.matchedTags) ? place.matchedTags : [],
    place_history: place.place_history || null,
    best_time_to_visit: place.best_time_to_visit || null,
    visit_duration: place.visit_duration || null,
    good_for: Array.isArray(place.good_for) ? place.good_for.filter((item): item is string => Boolean(item?.trim())) : [],
    not_ideal_for: Array.isArray(place.not_ideal_for) ? place.not_ideal_for.filter((item): item is string => Boolean(item?.trim())) : [],
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

function getGreeting(session: Session | null) {
  const name =
    session?.user.user_metadata?.full_name ||
    session?.user.user_metadata?.name ||
    session?.user.email?.split('@')[0] ||
    null

  return name ? `Hi, ${String(name).split(' ')[0]}` : 'Tara'
}

function HomeDashboardPage({ session }: HomeDashboardPageProps) {
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
          .slice(0, 8)

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

  const greeting = useMemo(() => getGreeting(session), [session])

  return (
    <div className="gala-page-background min-h-screen text-[var(--text)]">
      <AppHeader minimal />

      <main className="mx-auto w-full max-w-[1180px] px-4 pb-10 pt-5 sm:px-6 lg:px-10 xl:max-w-[1280px]">
        <section className="relative overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,#dff0ff_0%,#f6fbff_50%,#ffffff_100%)] px-5 py-6 shadow-[0_20px_48px_rgba(28,77,160,0.10)] sm:px-7 sm:py-8 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center lg:gap-8">
          <div className="pointer-events-none absolute -left-10 top-4 h-40 w-40 rounded-full bg-[rgba(47,116,232,0.12)] blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 h-44 w-44 rounded-full bg-[rgba(255,204,92,0.16)] blur-3xl" />

          <div className="relative z-10">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-[var(--accent-deep)]">{greeting}</p>
            <h1 className="mt-3 max-w-[10ch] text-[2.35rem] font-black leading-[0.95] tracking-[-0.05em] text-slate-950 sm:text-[3rem]">
              Saan tayo gala today?
            </h1>
            <p className="mt-3 max-w-[34rem] text-sm font-semibold leading-7 text-slate-600 sm:text-base">
              Pick a flow, jump into search, or open your saved gala tools from one clean home base.
            </p>
          </div>

          <div className="relative z-10 mt-5 flex justify-center lg:mt-0 lg:justify-end">
            <img
              src={homeChibi}
              alt="GalaTayo chibi illustration"
              className="h-[220px] w-auto object-contain sm:h-[250px] lg:h-[280px]"
              loading="eager"
            />
          </div>
        </section>

        <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {mainActions.map((action) => (
            <button
              key={action.title}
              type="button"
              onClick={() => navigateToPath(action.href)}
              className={`rounded-[24px] border px-5 py-5 text-left transition hover:-translate-y-0.5 ${
                action.tone === 'primary'
                  ? 'border-[rgba(47,116,232,0.25)] bg-[linear-gradient(135deg,#2f80ed,#5ba7ff)] text-white shadow-[0_18px_34px_rgba(47,116,232,0.24)]'
                  : 'border-[var(--line)] bg-white text-slate-900 shadow-[0_16px_32px_rgba(28,77,160,0.08)]'
              }`}
            >
              <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                action.tone === 'primary' ? 'bg-white/18 text-white' : 'bg-[var(--accent-wash)] text-[var(--accent-deep)]'
              }`}>
                <AppIcon name={action.icon} className="h-6 w-6" />
              </span>
              <p className="mt-4 text-lg font-black">{action.title}</p>
              <p className={`mt-2 text-sm font-semibold leading-6 ${action.tone === 'primary' ? 'text-white/88' : 'text-slate-600'}`}>
                {action.description}
              </p>
            </button>
          ))}
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[var(--accent-deep)]">Trending Now</p>
              <h2 className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-950">Spots people are eyeing lately</h2>
            </div>
            <button
              type="button"
              onClick={() => navigateToPath('/search')}
              className="hidden rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-black text-[var(--accent-deep)] shadow-[0_10px_20px_rgba(28,77,160,0.06)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)] sm:inline-flex"
            >
              Open search
            </button>
          </div>

          {isTrendingLoading ? (
            <div className="mt-4 flex gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-2 md:overflow-visible xl:grid-cols-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-[154px] min-w-[320px] rounded-2xl border border-[var(--line)] bg-white/80 md:min-w-0" />
              ))}
            </div>
          ) : trendingError ? (
            <p className="mt-4 text-sm font-semibold text-red-600">{trendingError}</p>
          ) : (
            <div className="mt-4 flex gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-2 md:overflow-visible xl:grid-cols-4">
              {trendingPlaces.map((place) => (
                <div key={place.id} className="min-w-[320px] max-w-[320px] md:min-w-0 md:max-w-none">
                  <PlaceCard
                    place={place}
                    compact
                    onSelect={() => {
                      if (place.slug) {
                        navigateToCanonicalPlace({
                          slug: place.slug,
                          city: place.city,
                          area: place.area,
                          localArea: place.localArea,
                        })
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-8 rounded-[28px] border border-[var(--line)] bg-white px-5 py-5 shadow-[0_16px_34px_rgba(28,77,160,0.06)] sm:px-6">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-[var(--accent-deep)]">Explore Categories</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {homeCategories.map((category) => (
              <button
                key={category.value}
                type="button"
                onClick={() => navigateToPath(`/search?category=${encodeURIComponent(category.value)}`)}
                className="flex min-h-[92px] flex-col items-start justify-between rounded-[22px] border border-[var(--line)] bg-[linear-gradient(180deg,#ffffff,#f7fbff)] px-4 py-4 text-left shadow-[0_10px_24px_rgba(28,77,160,0.05)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)]"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--accent-wash)] text-[var(--accent-deep)]">
                  <AppIcon name={getCategoryIconName(category.value)} className="h-5 w-5" />
                </span>
                <span className="text-sm font-black text-slate-900">{category.label}</span>
              </button>
            ))}
          </div>
        </section>

        {session ? (
          <section className="mt-8 rounded-[28px] border border-[var(--line)] bg-white px-5 py-5 shadow-[0_16px_34px_rgba(28,77,160,0.06)] sm:px-6">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-[var(--accent-deep)]">Quick Access</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {quickAccessLinks.map((item) => (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => navigateToPath(item.href)}
                  className="flex min-h-[76px] items-center gap-3 rounded-[22px] border border-[var(--line)] bg-[linear-gradient(180deg,#ffffff,#f8fbff)] px-4 py-4 text-left transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)]"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-wash)] text-[var(--accent-deep)]">
                    <AppIcon name={item.icon} className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-black text-slate-900">{item.label}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </main>

    </div>
  )
}

export default HomeDashboardPage
