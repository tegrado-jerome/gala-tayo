import { useEffect, useMemo, useState } from 'react'
import { CloudRain } from 'lucide-react'
import PhotoCard, { getPlaceHref, getPlaceImageCandidates, type PhotoCardPlace } from '../components/discover/PhotoCard'
import PlaceImage from '../components/discover/PlaceImage'
import { useGuestAuthPrompt } from '../components/GuestAuthPrompt'
import NextGalaCard from '../components/home/NextGalaCard'
import PlanWithAiCard from '../components/home/PlanWithAiCard'
import InternalLink from '../components/InternalLink'
import { toTitleCase } from '../components/PlaceCard'
import SeoHead from '../components/SeoHead'
import { Button, Chip, Chips, Empty, Masonry, Page, SectionHead, Skeleton } from '../components/ui'
import type { NavigationSource } from '../app/useAppLocationState'
import { useAppUser } from '../context/AppUserContext'
import {
  homeAllTopPickPlaces,
  homeCityRecommendations,
  homePopularTopPickPlaces,
  type HomeRecommendationPlace,
} from '../data/homeRecommendations'
import { getStaticPlaceImageUrlForSlug } from '../data/placeIndexVisuals'
import { R2_PUBLIC_BASE_URL } from '../data/r2Config'
import { useListingRail } from '../hooks/useListingRail'
import { useManilaWeather, type ManilaWeather } from '../hooks/useManilaWeather'
import { displayCityName } from '../utils/cityName'
import { fetchHomePlaceDetailsBatch } from '../utils/placeDetailCache'
import { resolveAreaMeta } from '../utils/routes'

type FeedId = 'for-you' | 'popular' | 'date-night' | 'rainy-day'

type Feed = { id: FeedId; label: string; href: string } & ({ places: HomeRecommendationPlace[] } | { category: string })

const feeds: Feed[] = [
  { id: 'for-you', label: 'For you', href: '/places', places: homeAllTopPickPlaces },
  { id: 'popular', label: 'Popular', href: '/places', places: homePopularTopPickPlaces },
  { id: 'date-night', label: 'Date night', href: '/places/categories/food', category: 'food' },
  { id: 'rainy-day', label: 'Rainy day', href: '/places/categories/museum', category: 'museum' },
]

const curatedSlugs = Array.from(new Set([...homeAllTopPickPlaces, ...homePopularTopPickPlaces].map((place) => place.slug)))

const skeletonRatios = ['3 / 4', '4 / 5', '1 / 1', '4 / 3']

function WeatherPill({ weather }: { weather: ManilaWeather }) {
  return (
    <span className="g-wx">
      <CloudRain />
      {weather.label} · indoor picks first
    </span>
  )
}

function FeedSkeleton() {
  return (
    <Masonry aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton key={index} className="!rounded-[var(--r-3)]" style={{ aspectRatio: skeletonRatios[index % skeletonRatios.length] }} />
      ))}
    </Masonry>
  )
}

function PlaceFeed({ places, onGuestFavorite }: { places: PhotoCardPlace[]; onGuestFavorite: () => void }) {
  return (
    <Masonry>
      {places.map((place, index) => (
        <PhotoCard key={place.id} place={place} masonryIndex={index} priority={index < 2} onGuestFavorite={onGuestFavorite} />
      ))}
    </Masonry>
  )
}

function ListingFeed({ category, href, onGuestFavorite }: { category: string; href: string; onGuestFavorite: () => void }) {
  const places = useListingRail({ category })
  if (!places) return <FeedSkeleton />
  if (places.length === 0) {
    return (
      <Empty
        title="Wala pang laman dito"
        description="Try another pick or browse all places."
        action={
          <Button variant="line" size="sm" href={href}>
            Browse places
          </Button>
        }
      />
    )
  }
  return <PlaceFeed places={places} onGuestFavorite={onGuestFavorite} />
}

function formatShortPrice(budgetMin: number) {
  return budgetMin <= 0 ? 'Free' : `₱${Math.round(budgetMin).toLocaleString('en-PH')}`
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
            See all
          </Button>
        }
      />
      {!places ? (
        <div className="grid gap-x-8 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="my-2 h-11 w-full" />
          ))}
        </div>
      ) : places.length === 0 ? (
        <Empty
          title="Wala pang laman ang radar"
          description="Browse Makati spots while we load more."
          action={
            <Button variant="line" size="sm" href="/places/makati">
              Explore Makati
            </Button>
          }
        />
      ) : (
        <ol className="grid gap-x-8 md:grid-cols-2">
          {places.slice(0, 6).map((place, index) => (
            <li key={place.id} className="min-w-0 border-b border-[var(--line-2)]">
              <InternalLink href={getPlaceHref(place)} className="flex min-h-[60px] min-w-0 items-center gap-3 py-2 text-inherit no-underline">
                <span className="g-xs g-fnt w-4 shrink-0 text-center font-semibold">{index + 1}</span>
                <PlaceImage candidates={getPlaceImageCandidates(place)} category={place.category} className="h-11 w-11 shrink-0 rounded-[var(--r-2)] object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="g-sm block truncate font-semibold">{place.name}</span>
                  <span className="g-xs g-mut block truncate">{[toTitleCase(place.category), place.area ?? place.city].filter(Boolean).join(' · ')}</span>
                </span>
                {place.budgetMin != null ? <span className="g-xs shrink-0 font-semibold">{formatShortPrice(place.budgetMin)}</span> : null}
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
  const { currentProfile, currentUser } = useAppUser()
  const guestAuth = useGuestAuthPrompt()
  const weather = useManilaWeather()
  const [chosenFeed, setChosenFeed] = useState<FeedId | null>(null)
  const [detailsBySlug, setDetailsBySlug] = useState<Record<string, Partial<PhotoCardPlace>>>({})
  const openGuestFavorite = () => guestAuth.open('favorite')

  // Ratings, real ids (for saving) and prices come from the batch endpoint; cards render before it answers.
  useEffect(() => {
    let isActive = true
    void fetchHomePlaceDetailsBatch({ slugs: curatedSlugs, cityImageRequests: [] })
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

  const isRaining = Boolean(weather?.isRaining)
  // Rain switches the default feed to indoor picks until the user picks a chip.
  const activeFeed = feeds.find((feed) => feed.id === (chosenFeed ?? (isRaining ? 'rainy-day' : 'for-you'))) ?? feeds[0]
  const curatedPlaces = useMemo(
    () => ('places' in activeFeed ? activeFeed.places.map((place): PhotoCardPlace => ({ ...place, ...detailsBySlug[place.slug] })) : null),
    [activeFeed, detailsBySlug],
  )

  const greetingName = currentUser?.firstName?.trim() || currentProfile?.displayName?.trim().split(/\s+/)[0] || null
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
        <h1 className="g-d1 mt-1.5">{greetingName ? `Tara, ${greetingName}?` : 'Tara, gala tayo?'}</h1>
        {isRaining && weather ? (
          <div className="mt-3">
            <WeatherPill weather={weather} />
          </div>
        ) : null}
      </header>

      <NextGalaCard />

      <div className="mt-5 md:mt-6">
        <PlanWithAiCard />
      </div>

      <section className="mt-7 min-w-0" aria-labelledby="home-feed-title">
        <h2 id="home-feed-title" className="sr-only">
          Places for you
        </h2>
        <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
          <Chips role="group" aria-label="Pick a mood" className="min-w-0 flex-1">
            {feeds.map((feed) => (
              <Chip key={feed.id} on={feed.id === activeFeed.id} onClick={() => setChosenFeed(feed.id)}>
                {feed.label}
              </Chip>
            ))}
          </Chips>
          <span className="g-only-desk">
            <Button variant="text" href={activeFeed.href}>
              See all
            </Button>
          </span>
        </div>
        {curatedPlaces ? (
          <PlaceFeed places={curatedPlaces} onGuestFavorite={openGuestFavorite} />
        ) : 'category' in activeFeed ? (
          <ListingFeed key={activeFeed.id} category={activeFeed.category} href={activeFeed.href} onGuestFavorite={openGuestFavorite} />
        ) : null}
        <div className="g-only-mob mt-2 flex justify-center">
          <Button variant="soft" size="sm" href={activeFeed.href}>
            See more
          </Button>
        </div>
      </section>

      <WeekendRadar />

      <section className="min-w-0">
        <SectionHead
          title="Explore by city"
          action={
            <Button variant="text" href="/places">
              All cities
            </Button>
          }
        />
        <Chips aria-label="Cities">
          {homeCityRecommendations.map((tile) => {
            const citySlug = resolveAreaMeta({ city: tile.label }).slug
            const imageUrl = tile.place.imageUrl ?? getStaticPlaceImageUrlForSlug(tile.place.slug)
            return (
              <InternalLink key={tile.label} href={`/places/${encodeURIComponent(citySlug)}`} className="g-chip !h-11 !gap-2 !pl-1.5 no-underline">
                <PlaceImage candidates={imageUrl ? [imageUrl] : []} className="h-8 w-8 shrink-0 rounded-full object-cover" />
                {displayCityName(tile.label)}
              </InternalLink>
            )
          })}
        </Chips>
      </section>

      {guestAuth.promptElement}
    </Page>
  )
}

export default HomePage
