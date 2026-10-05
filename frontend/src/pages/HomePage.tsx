import { useEffect, useMemo, useState } from 'react'
import { CloudRain } from 'lucide-react'
import PhotoCard, { getPlaceHref, getPlaceImageCandidates, type PhotoCardPlace } from '../components/discover/PhotoCard'
import PlaceImage from '../components/discover/PlaceImage'
import Rail from '../components/discover/Rail'
import { useGuestAuthPrompt } from '../components/GuestAuthPrompt'
import NextGalaCard from '../components/home/NextGalaCard'
import PlanWithAiCard from '../components/home/PlanWithAiCard'
import InternalLink from '../components/InternalLink'
import SeoHead from '../components/SeoHead'
import { Button, Empty, Page, PlaceCardSkeleton, SectionHead, Skeleton, Tabs } from '../components/ui'
import type { NavigationSource } from '../app/useAppLocationState'
import { useAppUser } from '../context/AppUserContext'
import {
  homeAllTopPickPlaces,
  homeCityRecommendations,
  homePopularTopPickPlaces,
  homeRecommendedTopPickPlaces,
  type HomeRecommendationPlace,
} from '../data/homeRecommendations'
import { getStaticPlaceImageUrlForSlug } from '../data/placeIndexVisuals'
import { R2_PUBLIC_BASE_URL } from '../data/r2Config'
import { useListingRail } from '../hooks/useListingRail'
import { useManilaWeather, type ManilaWeather } from '../hooks/useManilaWeather'
import { fetchHomePlaceDetailsBatch } from '../utils/placeDetailCache'
import { resolveAreaMeta } from '../utils/routes'

type TopPicksTab = 'all' | 'popular' | 'recommended'

const topPickTabs: Array<{ id: TopPicksTab; label: string; places: HomeRecommendationPlace[] }> = [
  { id: 'all', label: 'All', places: homeAllTopPickPlaces },
  { id: 'popular', label: 'Popular', places: homePopularTopPickPlaces },
  { id: 'recommended', label: 'Recommended', places: homeRecommendedTopPickPlaces },
]

const topPickSlugs = Array.from(new Set(topPickTabs.flatMap((tab) => tab.places.map((place) => place.slug))))

// Shown in place of "For you" only while it is raining.
const rainSafeRail = {
  title: 'Rain-safe picks',
  subtitle: 'Indoor museums and galleries, para hindi mabasa',
  category: 'museum',
  href: '/places/categories/museum',
}

function WeatherPill({ weather }: { weather: ManilaWeather }) {
  return (
    <span className="g-wx">
      <CloudRain />
      {weather.label} · indoor picks first
    </span>
  )
}

function ListingRail({ rail, badge, onGuestFavorite }: { rail: typeof rainSafeRail; badge?: string; onGuestFavorite: () => void }) {
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
        <div className="grid gap-2.5 md:grid-cols-2 md:gap-x-6">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-[86px] w-full" />
          ))}
        </div>
      ) : places.length === 0 ? (
        <Empty title="Wala pang laman ang radar" description="Browse Makati spots while we load more." action={<Button variant="line" size="sm" href="/places/makati">Explore Makati</Button>} />
      ) : (
        <ol className="grid gap-2.5 md:grid-cols-2 md:gap-x-6">
          {places.slice(0, 5).map((place, index) => (
            <li key={place.id}>
              <InternalLink href={getPlaceHref(place)} className="g-row">
                <PlaceImage candidates={getPlaceImageCandidates(place)} category={place.category} className="g-row-img" />
                <div className="g-row-body">
                  <div className="g-h3 whitespace-nowrap">{place.name}</div>
                  <div className="g-sm g-mut whitespace-nowrap">{[place.category, place.area ?? place.city].filter(Boolean).join(' · ')}</div>
                  {place.budgetMin != null ? (
                    <div className="g-sm whitespace-nowrap">{place.budgetMin <= 0 ? 'Free entry' : `₱${Math.round(place.budgetMin).toLocaleString('en-PH')}/head`}</div>
                  ) : null}
                </div>
                <span className="g-num">{index + 1}</span>
              </InternalLink>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function HomePage({ navigationSource }: { navigationSource: NavigationSource }) {
  void navigationSource
  const { currentProfile, currentUser, session } = useAppUser()
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
          {isRaining && weather ? <WeatherPill weather={weather} /> : null}
        </div>
      </header>

      <div className="mt-6 md:mt-7">
        <PlanWithAiCard />
      </div>

      {session ? (
        <>
          <SectionHead
            title="Your next gala"
            action={
              <Button variant="text" href="/gala-plans">
                All plans
              </Button>
            }
          />
          <NextGalaCard />
        </>
      ) : null}

      {isRaining ? (
        <ListingRail rail={rainSafeRail} badge="Rain-safe" onGuestFavorite={openGuestFavorite} />
      ) : (
        <Rail
          title="For you this week"
          subtitle="What locals are saving right now"
          seeAllHref="/places"
          headerAside={<Tabs label="For you" value={activeTab} options={topPickTabs.map((tab) => ({ value: tab.id, label: tab.label }))} onChange={setActiveTab} />}
        >
          {topPicks.map((place, index) => (
            <PhotoCard key={`${activeTab}-${place.slug}`} place={place} priority={index < 2} onGuestFavorite={openGuestFavorite} />
          ))}
        </Rail>
      )}

      <WeekendRadar />

      <Rail title="Explore by city" subtitle="Pick a city, see what's worth the trip" seeAllHref="/places" seeAllLabel="All cities" itemBasis={104}>
        {homeCityRecommendations.map((tile) => {
          const citySlug = resolveAreaMeta({ city: tile.label }).slug
          const imageUrl = tile.place.imageUrl ?? getStaticPlaceImageUrlForSlug(tile.place.slug)
          return (
            <InternalLink key={tile.label} href={`/places/${encodeURIComponent(citySlug)}`} className="block text-center">
              <span className="block aspect-square overflow-hidden rounded-full">
                <PlaceImage candidates={imageUrl ? [imageUrl] : []} className="h-full w-full object-cover" />
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
