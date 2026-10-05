import { useEffect, useMemo, useState } from 'react'
import { CloudRain, CloudSun } from 'lucide-react'
import CategoryTabs from '../components/discover/CategoryTabs'
import PhotoCard, { getPlaceHref, getPlaceImageCandidates, type PhotoCardPlace } from '../components/discover/PhotoCard'
import Rail from '../components/discover/Rail'
import { useGuestAuthPrompt } from '../components/GuestAuthPrompt'
import NextGalaCard from '../components/home/NextGalaCard'
import PlanWithAiCard from '../components/home/PlanWithAiCard'
import RainyDayBanner from '../components/home/RainyDayBanner'
import InternalLink from '../components/InternalLink'
import SeoHead from '../components/SeoHead'
import { Button, Empty, Page, PlaceCardSkeleton, Row, SectionHead, Skeleton, Stamp, Tabs, Tag } from '../components/ui'
import type { NavigationSource } from '../app/useAppLocationState'
import { useAppUser } from '../context/AppUserContext'
import {
  homeAllTopPickPlaces,
  homeCityRecommendations,
  homePopularTopPickPlaces,
  homeRecommendedTopPickPlaces,
  type HomeRecommendationPlace,
} from '../data/homeRecommendations'
import { metroManilaAreas } from '../data/metroManilaAreas'
import { getStaticPlaceImageUrlForSlug } from '../data/placeIndexVisuals'
import { R2_PUBLIC_BASE_URL } from '../data/r2Config'
import { useListingRail } from '../hooks/useListingRail'
import { useManilaWeather, type ManilaWeather } from '../hooks/useManilaWeather'
import { getMyPassport, type Passport } from '../utils/passportApi'
import { fetchHomePlaceDetailsBatch } from '../utils/placeDetailCache'
import { resolveAreaMeta } from '../utils/routes'

type TopPicksTab = 'all' | 'popular' | 'recommended'

const topPickTabs: Array<{ id: TopPicksTab; label: string; places: HomeRecommendationPlace[] }> = [
  { id: 'all', label: 'All', places: homeAllTopPickPlaces },
  { id: 'popular', label: 'Popular', places: homePopularTopPickPlaces },
  { id: 'recommended', label: 'Recommended', places: homeRecommendedTopPickPlaces },
]

const topPickSlugs = Array.from(new Set(topPickTabs.flatMap((tab) => tab.places.map((place) => place.slug))))

const listingRails = [
  { key: 'museum', title: 'Museums', subtitle: 'Free and paid galleries across Metro Manila', category: 'museum', href: '/places/categories/museum' },
  { key: 'cafe', title: 'Cafés', subtitle: 'Popular cafés across the metro', category: 'cafe', href: '/places/categories/cafe' },
]

type ListingRailConfig = (typeof listingRails)[number]

const rainSafeRail = {
  ...listingRails[0],
  title: 'Rain-safe picks near you',
  subtitle: 'Indoor museums and galleries, para hindi mabasa',
}

function WeatherPill({ weather }: { weather: ManilaWeather }) {
  if (weather.isRaining) {
    return (
      <span className="g-wx">
        <CloudRain />
        {weather.label} · indoor picks first
      </span>
    )
  }
  return (
    <span className="g-wx" style={{ background: 'var(--fill)', color: 'var(--ink-2)' }}>
      <CloudSun />
      {weather.temperature}°C, {weather.label.toLowerCase()} · good gala weather
    </span>
  )
}

function ListingRail({ rail, badge, onGuestFavorite }: { rail: ListingRailConfig; badge?: string; onGuestFavorite: () => void }) {
  const places = useListingRail({ category: rail.category })
  if (places && places.length === 0) return null

  return (
    <Rail title={rail.title} subtitle={rail.subtitle} seeAllHref={rail.href}>
      {places
        ? places.map((place) => <PhotoCard key={place.id} place={place} badge={badge} onGuestFavorite={onGuestFavorite} />)
        : Array.from({ length: 5 }, (_, index) => <PlaceCardSkeleton key={index} />)}
    </Rail>
  )
}

function WeekendRadar() {
  const places = useListingRail({ areaSlug: 'makati' })

  return (
    <section className="min-w-0">
      <SectionHead
        title="Weekend radar"
        sub="Most-visited in Makati this month"
        action={
          <Button variant="text" href="/places/makati">
            See all 10
          </Button>
        }
      />
      {!places ? (
        <div className="g-list">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-[86px] w-full" />
          ))}
        </div>
      ) : places.length === 0 ? (
        <Empty title="Wala pang laman ang radar" description="Browse Makati spots while we load more." action={<Button variant="line" size="sm" href="/places/makati">Explore Makati</Button>} />
      ) : (
        <ol className="g-list">
          {places.slice(0, 5).map((place, index) => (
            <li key={place.id}>
              <Row href={getPlaceHref(place)} imageUrl={getPlaceImageCandidates(place)[0] ?? null} action={<span className="g-num">{index + 1}</span>}>
                <div className="g-h3 whitespace-nowrap">{place.name}</div>
                <div className="g-sm g-mut whitespace-nowrap">{[place.category, place.area ?? place.city].filter(Boolean).join(' · ')}</div>
                {place.budgetMin != null ? (
                  <div className="g-sulit">
                    {place.budgetMin <= 0 ? <Tag tone="ok">Free</Tag> : <>from <b>₱{Math.round(place.budgetMin).toLocaleString('en-PH')}</b></>}
                  </div>
                ) : null}
              </Row>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function PassportTeaser() {
  const { session, isSessionLoading } = useAppUser()
  const [passport, setPassport] = useState<Passport | 'error' | null>(null)

  useEffect(() => {
    if (isSessionLoading || !session) return
    let isCancelled = false
    getMyPassport(session)
      .then((result) => {
        if (!isCancelled) setPassport(result)
      })
      .catch(() => {
        if (!isCancelled) setPassport('error')
      })
    return () => {
      isCancelled = true
    }
  }, [isSessionLoading, session])

  const ready = passport && passport !== 'error' && passport.available ? passport : null
  const collected = ready ? ready.stamps.filter((stamp) => stamp.collected) : []
  const totalCities = ready ? ready.stamps.length || metroManilaAreas.length : metroManilaAreas.length

  let body
  if (!isSessionLoading && !session) {
    body = (
      <Empty
        title="Collect a stamp in every city"
        description="Collect a stamp wherever you gala and keep your barkada streak."
        action={<Button variant="ink" size="sm" href="/login">Sign in to start</Button>}
      />
    )
  } else if (passport === null) {
    body = <Skeleton className="h-[220px] w-full" />
  } else if (passport === 'error' || !ready) {
    body = <Empty title="Passport is resting" description="Hindi ma-load ngayon. Try opening it in a bit." action={<Button variant="line" size="sm" href="/passport">Open passport</Button>} />
  } else {
    body = (
      <>
        <div className="g-panel">
          <div className="flex items-center justify-between gap-3">
            <span className="g-h3">Gala streak</span>
            <b className="g-h3">
              {ready.streak_weeks} {ready.streak_weeks === 1 ? 'week' : 'weeks'}
            </b>
          </div>
          <p className="g-xs g-mut">{ready.streak_weeks > 0 ? 'Gala once a week to keep it going' : 'Collect a stamp this week to start one'}</p>
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-5">
          {collected.slice(0, 2).map((stamp) => (
            <Stamp
              key={stamp.city}
              title={stamp.city}
              sub={stamp.first_checkin_at ? new Date(stamp.first_checkin_at).toLocaleDateString('en', { month: 'short', day: 'numeric' }).toUpperCase() : undefined}
            />
          ))}
          <Stamp title="City hopper" sub={`${collected.length} of ${totalCities}`} state="progress" progress={collected.length / totalCities} />
        </div>
      </>
    )
  }

  return (
    <section className="min-w-0">
      <SectionHead
        title="Passport"
        sub={ready ? `${ready.total_checkins} check-ins · ${collected.length} ${collected.length === 1 ? 'city' : 'cities'}` : 'Stamps and streaks'}
        action={
          session ? (
            <Button variant="text" href="/passport">
              Open
            </Button>
          ) : undefined
        }
      />
      {body}
    </section>
  )
}

function HomePage({ navigationSource }: { navigationSource: NavigationSource }) {
  void navigationSource
  const { currentProfile, currentUser } = useAppUser()
  const guestAuth = useGuestAuthPrompt()
  const weather = useManilaWeather()
  const [activeTab, setActiveTab] = useState<TopPicksTab>('all')
  const [detailsBySlug, setDetailsBySlug] = useState<Record<string, Partial<PhotoCardPlace>>>({})
  const openGuestFavorite = () => guestAuth.open('favorite')

  // Ratings, real ids (for saving) and prices come from the batch endpoint; cards render before it answers.
  useEffect(() => {
    let isActive = true
    void fetchHomePlaceDetailsBatch({ slugs: topPickSlugs, cityImageRequests: [] })
      .then(({ places }) => {
        if (!isActive) return
        setDetailsBySlug(
          Object.fromEntries(
            places.map((place) => [
              place.slug,
              {
                id: place.id,
                category: place.category,
                rating: typeof place.average_rating === 'number' && place.average_rating > 0 ? place.average_rating : null,
                budgetMin: place.budget_min != null ? Number(place.budget_min) : null,
              },
            ]),
          ),
        )
      })
      .catch(() => undefined)
    return () => {
      isActive = false
    }
  }, [])

  const topPicks = useMemo(() => {
    const tab = topPickTabs.find((entry) => entry.id === activeTab) ?? topPickTabs[0]
    return tab.places.map((place): PhotoCardPlace => ({ ...place, ...detailsBySlug[place.slug] }))
  }, [activeTab, detailsBySlug])

  const greetingName = currentUser?.firstName?.trim() || currentProfile?.displayName?.trim().split(/\s+/)[0] || null
  const isRaining = Boolean(weather?.isRaining)
  const today = new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'short', day: 'numeric' })
  const seoConfig = useMemo(
    () => ({
      title: 'Home | GalaTayo',
      description: 'Discover Metro Manila places by city, category, budget, and vibe.',
      canonicalPath: '/home',
      preconnectOrigins: [new URL(R2_PUBLIC_BASE_URL).origin],
    }),
    [],
  )

  return (
    <Page>
      <SeoHead {...seoConfig} />

      <header className="min-w-0">
        <p className="g-eyebrow">{today}</p>
        <h1 className="g-d1 mt-2">{greetingName ? `Tara, ${greetingName}?` : 'Tara, gala tayo?'}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="g-mut">{isRaining ? 'Maulan ngayon, so indoor spots muna.' : 'Describe your gala and Tara AI plans the whole day.'}</p>
          {weather ? <WeatherPill weather={weather} /> : null}
        </div>
      </header>

      <div className="mt-6 md:mt-7">
        <PlanWithAiCard />
      </div>

      <SectionHead
        title="Your next gala"
        action={
          <Button variant="text" href="/gala-plans">
            All plans
          </Button>
        }
      />
      <NextGalaCard />

      {isRaining && weather ? (
        <>
          <div className="mt-9">
            <RainyDayBanner weather={weather} />
          </div>
          <ListingRail rail={rainSafeRail} badge="Rain-safe" onGuestFavorite={openGuestFavorite} />
        </>
      ) : null}

      <Rail
        title="For you this week"
        subtitle="What locals are saving right now"
        seeAllHref="/places"
        headerAside={<Tabs label="Trending" value={activeTab} options={topPickTabs.map((tab) => ({ value: tab.id, label: tab.label }))} onChange={setActiveTab} />}
      >
        {topPicks.map((place, index) => (
          <PhotoCard key={`${activeTab}-${place.slug}`} place={place} priority={index < 2} onGuestFavorite={openGuestFavorite} />
        ))}
      </Rail>

      <SectionHead title="Browse by vibe" />
      <CategoryTabs active="all" showFilters />

      <div className="grid gap-x-10 md:grid-cols-2">
        <WeekendRadar />
        <PassportTeaser />
      </div>

      {listingRails
        .filter((rail) => !(isRaining && rail.key === rainSafeRail.key))
        .map((rail) => (
          <ListingRail key={rail.key} rail={rail} onGuestFavorite={openGuestFavorite} />
        ))}

      <Rail title="Explore by city" subtitle="Collect a stamp in every city with your Pasyal Passport" seeAllHref="/places" seeAllLabel="All cities" itemBasis={104}>
        {homeCityRecommendations.map((tile) => {
          const citySlug = resolveAreaMeta({ city: tile.label }).slug
          const imageUrl = tile.place.imageUrl ?? getStaticPlaceImageUrlForSlug(tile.place.slug)
          return (
            <InternalLink key={tile.label} href={`/places/${encodeURIComponent(citySlug)}`} className="block text-center">
              <span className="block aspect-square overflow-hidden rounded-full bg-[var(--fill)]">
                {imageUrl ? <img src={imageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : null}
              </span>
              <span className="g-sm mt-2 block font-semibold">{tile.label}</span>
            </InternalLink>
          )
        })}
      </Rail>

      {guestAuth.promptElement}
    </Page>
  )
}

export default HomePage
