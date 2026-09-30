import { useEffect, useMemo, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import CategoryTabs from '../components/discover/CategoryTabs'
import PhotoCard, { type PhotoCardPlace } from '../components/discover/PhotoCard'
import Rail from '../components/discover/Rail'
import SearchPill from '../components/discover/SearchPill'
import { useGuestAuthPrompt } from '../components/GuestAuthPrompt'
import NextGalaCard from '../components/home/NextGalaCard'
import PlanWithAiCard from '../components/home/PlanWithAiCard'
import RainyDayBanner from '../components/home/RainyDayBanner'
import InternalLink from '../components/InternalLink'
import { PageShell } from '../components/layout/ResponsiveLayouts'
import MobileBottomNav from '../components/navigation/MobileBottomNav'
import SeoHead from '../components/SeoHead'
import UserMenu from '../components/UserMenu'
import type { NavigationSource } from '../app/useAppLocationState'
import { useAppUser } from '../context/AppUserContext'
import { useTheme } from '../context/ThemeContext'
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
import { useManilaWeather } from '../hooks/useManilaWeather'
import { fetchHomePlaceDetailsBatch } from '../utils/placeDetailCache'
import { resolveAreaMeta } from '../utils/routes'

type TopPicksTab = 'all' | 'popular' | 'recommended'

const topPickTabs: Array<{ id: TopPicksTab; label: string; places: HomeRecommendationPlace[] }> = [
  { id: 'all', label: 'Lahat', places: homeAllTopPickPlaces },
  { id: 'popular', label: 'Sikat', places: homePopularTopPickPlaces },
  { id: 'recommended', label: 'Recommended', places: homeRecommendedTopPickPlaces },
]

const topPickSlugs = Array.from(new Set(topPickTabs.flatMap((tab) => tab.places.map((place) => place.slug))))

const listingRails = [
  { key: 'makati', title: 'Sikat sa Makati', areaSlug: 'makati', href: '/places/makati' },
  { key: 'museum', title: 'Museums worth the trip', category: 'museum', href: '/places/categories/museum' },
  { key: 'manila', title: 'Pasyalan sa Manila', areaSlug: 'manila', href: '/places/manila' },
  { key: 'cafe', title: 'Kape muna', category: 'cafe', href: '/places/categories/cafe' },
  { key: 'nightlife', title: 'Pang-gabi', category: 'nightlife', href: '/places/categories/nightlife' },
]

function getTimeGreeting(hour = new Date().getHours()) {
  if (hour < 5 || hour >= 18) return 'Magandang gabi'
  if (hour < 11) return 'Magandang umaga'
  if (hour < 13) return 'Magandang tanghali'
  return 'Magandang hapon'
}

function ThemeToggle() {
  const { resolvedTheme, setThemePreference } = useTheme()
  const next = resolvedTheme === 'dark' ? 'light' : 'dark'
  const Icon = resolvedTheme === 'dark' ? Sun : Moon
  return (
    <button
      type="button"
      onClick={() => setThemePreference(next)}
      aria-label={`Switch to ${next} mode`}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--line)] text-[var(--text-main)]"
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}

function RailSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden lg:gap-4" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="w-[44%] shrink-0 min-[480px]:w-[30%] md:w-[23%] lg:w-[calc((100%-4rem)/5)] xl:w-[calc((100%-5rem)/6)]">
          <div className="aspect-square animate-pulse rounded-[20px] bg-[var(--home-skeleton-base)]" />
          <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-[var(--home-skeleton-base)]" />
          <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-[var(--home-skeleton-soft)]" />
        </div>
      ))}
    </div>
  )
}

function ListingRail({ title, href, areaSlug, category, onGuestFavorite }: {
  title: string
  href: string
  areaSlug?: string
  category?: string
  onGuestFavorite: () => void
}) {
  const places = useListingRail({ areaSlug, category })
  if (places && places.length === 0) return null

  return (
    <div className="min-w-0">
      {places ? (
        <Rail title={title} seeAllHref={href}>
          {places.map((place) => (
            <PhotoCard key={place.id} place={place} badge={place.budgetMin === 0 ? 'Libre' : null} onGuestFavorite={onGuestFavorite} />
          ))}
        </Rail>
      ) : (
        <div>
          <h2 className="text-[22px] font-medium leading-[26px] text-[var(--text-main)]">{title}</h2>
          <div className="mt-4">
            <RailSkeleton />
          </div>
        </div>
      )}
    </div>
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

  const greetingName = currentProfile?.displayName?.trim() || currentUser?.firstName?.trim() || null
  const preloadUrls = useMemo(
    () => homeAllTopPickPlaces.slice(0, 3).map((place) => place.imageUrl ?? getStaticPlaceImageUrlForSlug(place.slug)).filter((url): url is string => Boolean(url)),
    [],
  )
  const seoConfig = useMemo(
    () => ({
      title: 'Home | GalaTayo',
      description: 'Discover Metro Manila places by city, category, budget, and vibe.',
      canonicalPath: '/home',
      preloadLinks: preloadUrls.map((href) => ({ href, as: 'image' as const, fetchPriority: 'high' as const })),
      preconnectOrigins: [new URL(R2_PUBLIC_BASE_URL).origin],
    }),
    [preloadUrls],
  )

  return (
    <PageShell tone="plain">
      <SeoHead {...seoConfig} />
      <main className="min-h-screen bg-[var(--bg)] pb-[calc(env(safe-area-inset-bottom,0px)+6rem)] text-[var(--text)] lg:pb-20">
        {/* Search and categories: sticky on phones like Airbnb's app */}
        <div className="sticky top-0 z-[40] border-b border-[var(--line)] bg-[var(--bg)] px-4 pt-3 sm:px-6 lg:static lg:border-0 lg:px-0 lg:pt-0">
          <div className="mx-auto w-full max-w-[1320px] lg:px-8">
            <div className="flex items-center gap-2 lg:hidden">
              <div className="min-w-0 flex-1">
                <SearchPill />
              </div>
              <ThemeToggle />
              <UserMenu user={currentUser} profile={currentProfile} compact />
            </div>
            <div className="hidden pt-8 lg:block">
              <SearchPill />
            </div>
            <div className="mt-3 lg:mt-8">
              <CategoryTabs active="all" />
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-8">
          <section className="pt-7 lg:pt-10">
            <p className="text-[14px] text-[var(--text-muted)]">
              {getTimeGreeting()}
              {greetingName ? `, ${greetingName}` : ''}
              {weather ? <span className="font-data text-[12px]"> · {weather.temperature}°C {weather.label.toLowerCase()} sa Manila</span> : null}
            </p>
            <h1 className="mt-1 text-[32px] font-medium leading-[1.08] text-[var(--text-main)] sm:text-[40px] lg:text-[44px]">
              Saan tayo <em className="text-[var(--primary)]">gagala</em>?
            </h1>

            {weather?.isRaining ? (
              <div className="mt-6 max-w-[720px]">
                <RainyDayBanner weather={weather} />
              </div>
            ) : null}

            <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-6">
              <div className="min-w-0">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="font-data text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">Your next gala</h2>
                  <InternalLink href="/gala-plans" className="text-[13px] font-medium text-[var(--text-muted)] hover:text-[var(--text-main)]">
                    All plans
                  </InternalLink>
                </div>
                <NextGalaCard />
              </div>
              <div className="min-w-0 lg:pt-[26px]">
                <PlanWithAiCard />
              </div>
            </div>
          </section>

          <div className="mt-12 grid grid-cols-[minmax(0,1fr)] gap-12 lg:mt-14 lg:gap-14">
            <Rail
              title="Top picks"
              headerAside={
                <div role="tablist" aria-label="Top picks" className="mr-1 flex gap-1">
                  {topPickTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`h-8 rounded-full px-3 text-[13px] font-medium transition-colors ${
                        activeTab === tab.id
                          ? 'bg-[var(--text-main)] text-[var(--bg)]'
                          : 'text-[var(--text-muted)] hover:bg-[var(--hover-surface-strong)] hover:text-[var(--text-main)]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              }
            >
              {topPicks.map((place, index) => (
                <PhotoCard key={`${activeTab}-${place.slug}`} place={place} priority={index < 3} badge={place.budgetMin === 0 ? 'Libre' : null} onGuestFavorite={openGuestFavorite} />
              ))}
            </Rail>

            {listingRails.map((rail) => (
              <ListingRail key={rail.key} title={rail.title} href={rail.href} areaSlug={rail.areaSlug} category={rail.category} onGuestFavorite={openGuestFavorite} />
            ))}

            <Rail title="Explore by city" seeAllHref="/places">
              {homeCityRecommendations.map((tile) => {
                const citySlug = resolveAreaMeta({ city: tile.label }).slug
                const imageUrl = tile.place.imageUrl ?? getStaticPlaceImageUrlForSlug(tile.place.slug)
                return (
                  <InternalLink key={tile.label} href={`/places/${encodeURIComponent(citySlug)}`} className="group block">
                    <div className="aspect-[4/5] overflow-hidden rounded-[20px] bg-[var(--bg-soft)]">
                      {imageUrl ? (
                        <img src={imageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                      ) : null}
                    </div>
                    <p className="mt-2.5 text-[15px] font-semibold text-[var(--text-main)]">{tile.label}</p>
                    <p className="text-[14px] text-[var(--text-muted)]">Metro Manila</p>
                  </InternalLink>
                )
              })}
            </Rail>
          </div>
        </div>

        <MobileBottomNav currentPath="/home" />
      </main>
      {guestAuth.promptElement}
    </PageShell>
  )
}

export default HomePage
