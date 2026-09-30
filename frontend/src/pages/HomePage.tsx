import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLocationDot, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons'
import { Moon, Sun } from 'lucide-react'
import CategoryTabs from '../components/discover/CategoryTabs'
import PhotoCard, { getPlaceHref, type PhotoCardPlace } from '../components/discover/PhotoCard'
import Rail from '../components/discover/Rail'
import { useGuestAuthPrompt } from '../components/GuestAuthPrompt'
import NextGalaCard from '../components/home/NextGalaCard'
import PlanWithAiCard from '../components/home/PlanWithAiCard'
import RainyDayBanner from '../components/home/RainyDayBanner'
import InternalLink from '../components/InternalLink'
import { PageShell } from '../components/layout/ResponsiveLayouts'
import { BrandLogo } from '../components/navigation/SiteHeader'
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
import { useHeroParallax } from '../hooks/useParallax'
import { navigateToPath } from '../utils/navigation'
import { fetchHomePlaceDetailsBatch } from '../utils/placeDetailCache'
import { resolveAreaMeta } from '../utils/routes'
import { buildSearchPath } from '../utils/searchParams'

type TopPicksTab = 'all' | 'popular' | 'recommended'

const HERO_IMAGE_DESKTOP = `${R2_PUBLIC_BASE_URL}/places/space-time-cube/space-time-cube-1.webp`
const HERO_IMAGE_PHONE = `${R2_PUBLIC_BASE_URL}/places/intramuros/intramuros-1.webp`

const topPickTabs: Array<{ id: TopPicksTab; label: string; places: HomeRecommendationPlace[] }> = [
  { id: 'all', label: 'All', places: homeAllTopPickPlaces },
  { id: 'popular', label: 'Popular', places: homePopularTopPickPlaces },
  { id: 'recommended', label: 'Recommended', places: homeRecommendedTopPickPlaces },
]

const topPickSlugs = Array.from(new Set(topPickTabs.flatMap((tab) => tab.places.map((place) => place.slug))))

const trendingSearches = [
  { label: 'Free museums', href: buildSearchPath({ category: 'museum', budget: 'free', page: 1 }) },
  { label: 'Rooftop bars in Makati', href: buildSearchPath({ category: 'nightlife', city: 'makati', page: 1 }) },
  { label: 'Kid-friendly weekend', href: buildSearchPath({ goodFor: 'family', page: 1 }) },
  { label: 'Date night', href: buildSearchPath({ goodFor: 'date', page: 1 }) },
]

const heroFields = [
  { label: 'Where', hint: 'All of Metro Manila' },
  { label: 'What', hint: 'Museums, food, parks…' },
  { label: 'Budget', hint: 'Free · ₱ · ₱₱ · ₱₱₱' },
  { label: 'Good for', hint: 'Barkada, date, family' },
]

const listingRails = [
  { key: 'museum', title: 'Museums', subtitle: 'Free and paid galleries across Metro Manila', category: 'museum', href: '/places/categories/museum' },
  { key: 'manila', title: 'Things to do in Manila', subtitle: 'Heritage sites, parks and food spots', areaSlug: 'manila', href: '/places/manila' },
  { key: 'cafe', title: 'Cafés', subtitle: 'Popular cafés across the metro', category: 'cafe', href: '/places/categories/cafe' },
  { key: 'nightlife', title: 'Nightlife', subtitle: 'Rooftops, bars and late-night spots', category: 'nightlife', href: '/places/categories/nightlife' },
]


function RailSkeleton() {
  return (
    <div className="flex gap-4 overflow-hidden lg:gap-6" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="w-[212px] shrink-0 sm:w-[250px] lg:w-[282px]">
          <div className="aspect-[3/2] animate-pulse rounded-[14px] bg-[var(--home-skeleton-base)]" />
          <div className="mt-3 h-3 w-1/3 animate-pulse rounded bg-[var(--home-skeleton-base)]" />
          <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-[var(--home-skeleton-base)]" />
        </div>
      ))}
    </div>
  )
}

function ListingRail({ title, subtitle, href, areaSlug, category, onGuestFavorite }: {
  title: string
  subtitle?: string
  href: string
  areaSlug?: string
  category?: string
  onGuestFavorite: () => void
}) {
  const places = useListingRail({ areaSlug, category })
  if (places && places.length === 0) return null

  return places ? (
    <Rail title={title} subtitle={subtitle} seeAllHref={href}>
      {places.map((place) => (
        <PhotoCard key={place.id} place={place} onGuestFavorite={onGuestFavorite} />
      ))}
    </Rail>
  ) : (
    <div className="min-w-0">
      <h2 className="text-[21px] font-extrabold text-[var(--text-main)] sm:text-[28px]">{title}</h2>
      <div className="mt-5">
        <RailSkeleton />
      </div>
    </div>
  )
}

// Headout-style ranked row: a big outlined number beside a tall photo.
function TopTenRail({ areaSlug, cityName }: { areaSlug: string; cityName: string }) {
  const places = useListingRail({ areaSlug })
  if (!places || places.length === 0) return null

  return (
    <Rail
      title={`Top 10 in ${cityName}`}
      subtitle="Most-visited spots this month, ranked by GalaTayo reviews"
      seeAllHref={`/places/${areaSlug}`}
      seeAllLabel="See all 10"
      itemClassName="w-[230px] shrink-0 snap-start lg:w-[290px]"
    >
      {places.slice(0, 10).map((place, index) => (
        <InternalLink key={place.id} href={getPlaceHref(place)} className="group relative block h-[200px] lg:h-[230px]">
          <span
            aria-hidden="true"
            className="absolute -bottom-5 -left-1 z-[1] select-none text-[140px] font-extrabold leading-none tracking-[-0.06em] text-[var(--bg)] lg:text-[170px]"
            style={{ WebkitTextStroke: '3px var(--primary)' }}
          >
            {index + 1}
          </span>
          <span className="absolute right-0 top-0 h-full w-[150px] overflow-hidden rounded-[14px] bg-[var(--bg-soft)] lg:w-[176px]">
            {place.imageUrl ? (
              <img src={place.imageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
            ) : null}
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-10 text-white">
              <span className="line-clamp-2 block text-[14px] font-bold leading-tight">{place.name}</span>
              <span className="block truncate text-[12px] opacity-90">{place.category}</span>
            </span>
          </span>
        </InternalLink>
      ))}
    </Rail>
  )
}

function HeroSearch() {
  const [query, setQuery] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const text = query.trim()
    navigateToPath(text ? buildSearchPath({ q: text, page: 1 }) : '/search')
  }

  return (
    <>
      <form onSubmit={submit} className="flex h-[52px] items-center gap-2.5 rounded-[14px] bg-[#ffffff] pl-4 pr-1.5 shadow-[0_10px_24px_-8px_rgba(0,0,0,0.45)] md:hidden">
        <FontAwesomeIcon icon={faLocationDot} className="h-4 w-4 text-[#667085]" />
        <label htmlFor="home-hero-search" className="sr-only">Search places</label>
        <input
          id="home-hero-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search places, food, museums"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-[#101828] outline-none placeholder:text-[#667085]"
        />
        <button type="submit" aria-label="Search" className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-[#067647] text-white">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="h-4 w-4" />
        </button>
      </form>

      <div role="search" className="hidden h-[76px] w-full max-w-[980px] items-center rounded-[18px] bg-[#ffffff] p-2 text-[#101828] shadow-[0_18px_40px_-12px_rgba(0,0,0,0.45)] md:flex">
        {heroFields.map((field, index) => (
          <button
            key={field.label}
            type="button"
            onClick={() => navigateToPath('/search')}
            className={`flex h-11 min-w-0 flex-1 flex-col justify-center px-5 text-left transition-colors hover:bg-[#f2f4f3] lg:px-6 ${index < heroFields.length - 1 ? 'border-r border-[#eaecf0]' : ''}`}
          >
            <span className="text-[12px] font-bold">{field.label}</span>
            <span className="truncate text-[15px] text-[#667085]">{field.hint}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => navigateToPath('/search')}
          className="flex h-[60px] shrink-0 items-center gap-2.5 rounded-[13px] bg-[#067647] px-7 text-[17px] font-bold text-white transition-colors hover:bg-[#04583a]"
        >
          <FontAwesomeIcon icon={faMagnifyingGlass} className="h-4 w-4" />
          Search
        </button>
      </div>
    </>
  )
}

function PhoneHeroBar() {
  const { currentProfile, currentUser } = useAppUser()
  const { resolvedTheme, setThemePreference } = useTheme()
  const next = resolvedTheme === 'dark' ? 'light' : 'dark'
  const Icon = resolvedTheme === 'dark' ? Sun : Moon

  return (
    <div className="absolute inset-x-4 top-[max(14px,env(safe-area-inset-top))] z-[2] flex items-center sm:inset-x-6 lg:hidden">
      <BrandLogo tone="light" className="text-[21px]" />
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => setThemePreference(next)}
          aria-label={`Switch to ${next} mode`}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-sm"
        >
          <Icon className="h-4 w-4" />
        </button>
        <UserMenu user={currentUser} profile={currentProfile} compact />
      </div>
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
  const heroRef = useHeroParallax<HTMLElement>()

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
  const seoConfig = useMemo(
    () => ({
      title: 'Home | GalaTayo',
      description: 'Discover Metro Manila places by city, category, budget, and vibe.',
      canonicalPath: '/home',
      preloadLinks: [{ href: HERO_IMAGE_DESKTOP, as: 'image' as const, fetchPriority: 'high' as const }],
      preconnectOrigins: [new URL(R2_PUBLIC_BASE_URL).origin],
    }),
    [],
  )

  return (
    <PageShell tone="plain">
      <SeoHead {...seoConfig} />
      <main className="min-h-screen bg-[var(--bg)] pb-[calc(env(safe-area-inset-bottom,0px)+6rem)] text-[var(--text)] lg:pb-24">
        <section ref={heroRef} className="hero-3d relative isolate h-[400px] overflow-hidden text-white sm:h-[460px] lg:h-[600px]">
          <picture>
            <source media="(min-width: 768px)" srcSet={HERO_IMAGE_DESKTOP} />
            <img src={HERO_IMAGE_PHONE} alt="" fetchPriority="high" decoding="async" className="hero-3d__photo absolute inset-0 -z-10 h-full w-full object-cover object-[center_40%]" />
          </picture>
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10"
            style={{ background: 'linear-gradient(180deg,rgba(0,0,0,.55) 0%,rgba(0,0,0,.05) 28%,rgba(0,0,0,.15) 50%,rgba(0,0,0,.78) 100%),linear-gradient(90deg,rgba(0,0,0,.4),transparent 60%)' }}
          />
          <PhoneHeroBar />
          <div className="absolute inset-x-4 bottom-5 sm:inset-x-6 lg:inset-x-0 lg:bottom-[70px]">
            <div className="hero-3d__copy mx-auto w-full max-w-[1440px] lg:px-8 xl:px-[120px]">
              <p className="text-[13px] font-semibold opacity-90 sm:text-[15px]">
                {greetingName ? `Hi, ${greetingName}` : 'Metro Manila'}
                {weather ? ` · ${weather.temperature}°C, ${weather.label.toLowerCase()}` : ''}
              </p>
              <h1 className="hero-3d__title mt-1 text-[34px] font-extrabold leading-[1.04] tracking-[-0.035em] [text-shadow:0_2px_24px_rgba(0,0,0,.25)] sm:text-[52px] lg:text-[76px]">
                Discover Metro Manila
              </h1>
              <p className="mt-2 max-w-[720px] text-[14px] font-medium opacity-95 sm:mt-3.5 sm:text-[20px]">
                Museums, food spots, parks and nightlife across 17 cities, with prices and local reviews.
              </p>
              <div className="hero-3d__search mt-4 sm:mt-7">
                <HeroSearch />
              </div>
              <div className="mt-4 hidden flex-wrap items-center gap-2.5 text-[14px] md:flex">
                <span className="font-semibold opacity-90">Trending:</span>
                {trendingSearches.map((search) => (
                  <InternalLink
                    key={search.label}
                    href={search.href}
                    className="rounded-full border border-[rgba(255,255,255,0.3)] bg-[rgba(255,255,255,0.16)] px-3.5 py-1.5 font-semibold backdrop-blur-md transition-colors hover:bg-[rgba(255,255,255,0.26)]"
                  >
                    {search.label}
                  </InternalLink>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8 xl:px-[120px]">
          <CategoryTabs active="all" showFilters />

          {weather?.isRaining ? (
            <div className="mt-8 max-w-[720px]">
              <RainyDayBanner weather={weather} />
            </div>
          ) : null}

          <div className="mt-9 grid grid-cols-[minmax(0,1fr)] gap-12 lg:mt-10 lg:gap-14">
            <Rail
              title="Trending in Metro Manila this week"
              subtitle="What locals are saving right now"
              seeAllHref="/places"
              headerAside={
                <div role="tablist" aria-label="Trending" className="mr-1 flex gap-1.5">
                  {topPickTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`h-9 rounded-full border px-4 text-[13px] font-semibold transition-colors ${
                        activeTab === tab.id
                          ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                          : 'border-[var(--line-strong)] text-[var(--text-strong)] hover:border-[var(--text-main)]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              }
            >
              {topPicks.map((place, index) => (
                <PhotoCard
                  key={`${activeTab}-${place.slug}`}
                  place={place}
                  priority={index < 2}
                  badge={index < 2 && activeTab === 'all' ? 'Best seller' : null}
                  onGuestFavorite={openGuestFavorite}
                />
              ))}
            </Rail>

            <TopTenRail areaSlug="makati" cityName="Makati" />

            <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-6">
              <div className="min-w-0">
                <div className="mb-3 flex items-end justify-between">
                  <h2 className="text-[21px] font-extrabold tracking-[-0.02em] text-[var(--text-main)] sm:text-[28px]">Your next gala</h2>
                  <InternalLink href="/gala-plans" className="text-[14px] font-bold text-[var(--text-main)] underline underline-offset-2">
                    All plans
                  </InternalLink>
                </div>
                <NextGalaCard />
              </div>
              <div className="min-w-0 lg:pt-[46px]">
                <PlanWithAiCard />
              </div>
            </section>

            {listingRails.map((rail) => (
              <ListingRail
                key={rail.key}
                title={rail.title}
                subtitle={rail.subtitle}
                href={rail.href}
                areaSlug={rail.areaSlug}
                category={rail.category}
                onGuestFavorite={openGuestFavorite}
              />
            ))}

            <Rail
              title="Explore by city"
              subtitle="Collect a stamp in every city with your Pasyal Passport"
              seeAllHref="/places"
              seeAllLabel="All cities"
              itemClassName="w-[108px] shrink-0 snap-start lg:w-[136px]"
            >
              {homeCityRecommendations.map((tile) => {
                const citySlug = resolveAreaMeta({ city: tile.label }).slug
                const imageUrl = tile.place.imageUrl ?? getStaticPlaceImageUrlForSlug(tile.place.slug)
                return (
                  <InternalLink key={tile.label} href={`/places/${encodeURIComponent(citySlug)}`} className="group block text-center">
                    <span className="mx-auto block h-[96px] w-[96px] overflow-hidden rounded-full bg-[var(--bg-soft)] lg:h-[124px] lg:w-[124px]">
                      {imageUrl ? (
                        <img src={imageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" />
                      ) : null}
                    </span>
                    <span className="mt-3 block text-[15px] font-bold text-[var(--text-main)] lg:text-[16px]">{tile.label}</span>
                    <span className="block text-[13px] text-[var(--text-muted)]">Metro Manila</span>
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
