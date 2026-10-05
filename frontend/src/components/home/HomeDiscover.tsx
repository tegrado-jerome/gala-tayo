import { useEffect, useMemo, useState } from 'react'
import { MagnifyingGlass as Search } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { Sparkle as Sparkles } from '@phosphor-icons/react/dist/csr/Sparkle'
import PhotoCard, { type PhotoCardPlace } from '../discover/PhotoCard'
import PlaceImage from '../discover/PlaceImage'
import Rail from '../discover/Rail'
import HomeQuickPicks from './HomeQuickPicks'
import { categoryIcons } from '../discover/CategoryTabs'
import InternalLink from '../InternalLink'
import { useGuestAuthPrompt } from '../GuestAuthPrompt'
import { Button, Empty, SectionHead, Skeleton, cx } from '../ui'
import { homeAllTopPickPlaces, homeCityRecommendations, homePopularTopPickPlaces } from '../../data/homeRecommendations'
import { getPlaceCategoryLabel, placeCategories } from '../../data/placeCategories'
import { getStaticPlaceImageUrlForSlug } from '../../data/placeIndexVisuals'
import { useListingRail } from '../../hooks/useListingRail'
import { displayCityName } from '../../utils/cityName'
import { fetchHomePlaceDetailsBatch } from '../../utils/placeDetailCache'
import { resolveAreaMeta } from '../../utils/routes'

const FOR_YOU = 'for-you'
// Everyday picks first, niche ones last.
const TAB_ORDER = ['food', 'cafe', 'park', 'museum', 'heritage', 'mall', 'nightlife', 'cinema', 'activity', 'hotel']

// Airbnb-style icon tabs. "For you" shows the curated rails; a category shows its own grid.
const tabs = [
  { value: FOR_YOU, label: 'For you', icon: Sparkles },
  ...TAB_ORDER.map((value) => ({ value, label: getPlaceCategoryLabel(value), icon: categoryIcons[value] ?? Sparkles })),
]

const curatedSlugs = Array.from(new Set([...homeAllTopPickPlaces, ...homePopularTopPickPlaces].map((place) => place.slug)))

/** Ratings, real ids (for saving) and prices from the batch endpoint; cards render before it answers. */
function useCuratedDetails() {
  const [detailsBySlug, setDetailsBySlug] = useState<Record<string, Partial<PhotoCardPlace>>>({})
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
  return detailsBySlug
}

function HomeSearch() {
  return (
    <div className="g-hsearch">
      <InternalLink href="/search" className="g-hsearch-main">
        <Search weight="bold" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block truncate font-semibold">Saan tayo gagala?</span>
          <span className="g-xs g-mut block truncate">Any city · any budget · any vibe</span>
        </span>
      </InternalLink>
      <InternalLink href="/plan-with-ai" className="g-hsearch-ai" ariaLabel="Plan a gala with AI">
        <Sparkles weight="fill" aria-hidden="true" />
      </InternalLink>
    </div>
  )
}

function CategoryBar({ active, onChange }: { active: string; onChange: (value: string) => void }) {
  return (
    <div className="g-cats" role="tablist" aria-label="Browse by category">
      {tabs.map((tab) => {
        const Icon = tab.icon
        return (
          <button key={tab.value} type="button" role="tab" aria-selected={tab.value === active} className={`g-cat c-${tab.value}`} onClick={() => onChange(tab.value)}>
            <Icon weight={tab.value === active ? 'fill' : 'duotone'} aria-hidden="true" />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

function RailSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="aspect-square w-[200px] shrink-0 !rounded-[var(--r-3)]" />
      ))}
    </div>
  )
}

function ListingRail({ title, subtitle, href, areaSlug, category, onGuestFavorite }: { title: string; subtitle?: string; href: string; areaSlug?: string; category?: string; onGuestFavorite: () => void }) {
  const places = useListingRail({ areaSlug, category })
  if (places && places.length === 0) return null
  return places ? (
    <Rail title={title} subtitle={subtitle} seeAllHref={href} itemBasis={200}>
      {places.map((place) => (
        <PhotoCard key={place.id} place={place} onGuestFavorite={onGuestFavorite} />
      ))}
    </Rail>
  ) : (
    <section className="min-w-0">
      <SectionHead title={title} sub={subtitle} />
      <RailSkeleton />
    </section>
  )
}

function CategoryGrid({ category, onGuestFavorite }: { category: string; onGuestFavorite: () => void }) {
  const places = useListingRail({ category })
  const href = `/places/categories/${category}`
  const label = placeCategories.find((item) => item.value === category)?.label ?? category
  if (!places) {
    return (
      <div className="g-cat-grid mt-5" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="aspect-square w-full !rounded-[var(--r-3)]" />
        ))}
      </div>
    )
  }
  if (places.length === 0) {
    return (
      <Empty
        title="Wala pang laman dito"
        description="Try another category or browse all places."
        action={
          <Button variant="line" size="sm" href="/places">
            Browse places
          </Button>
        }
      />
    )
  }
  return (
    <section className="mt-5 min-w-0" aria-label={label}>
      <div className="g-cat-grid">
        {places.map((place, index) => (
          <PhotoCard key={place.id} place={place} priority={index < 2} onGuestFavorite={onGuestFavorite} />
        ))}
      </div>
      <div className="mt-6 flex justify-center">
        <Button variant="line" href={href}>
          See all {label.toLowerCase()} spots
        </Button>
      </div>
    </section>
  )
}

function CityChips() {
  return (
    <section className="min-w-0">
      <SectionHead
        title="Explore by city"
        action={
          <Button variant="text" href="/places">
            All cities
          </Button>
        }
      />
      <ul className="g-chips">
        {homeCityRecommendations.map((tile) => {
          const citySlug = resolveAreaMeta({ city: tile.label }).slug
          const imageUrl = tile.place.imageUrl ?? getStaticPlaceImageUrlForSlug(tile.place.slug)
          return (
            <li key={tile.label}>
              <InternalLink href={`/places/${encodeURIComponent(citySlug)}`} className="g-chip !h-11 !gap-2 !pl-1.5 no-underline">
                <PlaceImage candidates={imageUrl ? [imageUrl] : []} className="h-8 w-8 shrink-0 rounded-full object-cover" />
                {displayCityName(tile.label)}
              </InternalLink>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Search pill, icon category tabs, then photo rails. Shared by Home and the guest landing page. */
function HomeDiscover({ isRaining = false, top, greeting, className }: { isRaining?: boolean; top?: React.ReactNode; greeting?: React.ReactNode; className?: string }) {
  const guestAuth = useGuestAuthPrompt()
  const detailsBySlug = useCuratedDetails()
  const [active, setActive] = useState(FOR_YOU)
  const openGuestFavorite = () => guestAuth.open('favorite')
  const withDetails = (places: PhotoCardPlace[]) => places.map((place) => ({ ...place, ...(place.slug ? detailsBySlug[place.slug] : null) }))
  const popular = useMemo(() => withDetails(homePopularTopPickPlaces), [detailsBySlug]) // eslint-disable-line react-hooks/exhaustive-deps
  const topPicks = useMemo(() => withDetails(homeAllTopPickPlaces), [detailsBySlug]) // eslint-disable-line react-hooks/exhaustive-deps

  const rainyRail = <ListingRail key="rain" title="Rainy day? Indoor picks" subtitle="Museums to wait out the ulan" href="/places/categories/museum" category="museum" onGuestFavorite={openGuestFavorite} />

  return (
    <div className={cx('min-w-0', className)}>
      {greeting ? <p className="g-home-hello">{greeting}</p> : null}
      <HomeSearch />
      <CategoryBar active={active} onChange={setActive} />
      <HomeQuickPicks pool={[...popular, ...topPicks]} />
      {top}
      {active === FOR_YOU ? (
        <>
          {isRaining ? rainyRail : null}
          <Rail title="Popular this week" subtitle="Where people are going" seeAllHref="/places">
            {popular.map((place, index) => (
              <PhotoCard key={place.slug ?? place.id} place={place} priority={index < 2} onGuestFavorite={openGuestFavorite} />
            ))}
          </Rail>
          <ListingRail title="Weekend sa Makati" subtitle="Most-visited in Makati" href="/places/makati" areaSlug="makati" onGuestFavorite={openGuestFavorite} />
          <ListingRail title="Heritage walks" subtitle="Intramuros, Binondo and old Manila" href="/places/categories/heritage" category="heritage" onGuestFavorite={openGuestFavorite} />
          <Rail title="Top picks around Metro Manila" seeAllHref="/places" itemBasis={200}>
            {topPicks.map((place) => (
              <PhotoCard key={place.slug ?? place.id} place={place} onGuestFavorite={openGuestFavorite} />
            ))}
          </Rail>
          <ListingRail title="Food trip" subtitle="Kain muna" href="/places/categories/food" category="food" onGuestFavorite={openGuestFavorite} />
          {isRaining ? null : rainyRail}
          <CityChips />
        </>
      ) : (
        <CategoryGrid key={active} category={active} onGuestFavorite={openGuestFavorite} />
      )}
      {guestAuth.promptElement}
    </div>
  )
}

export default HomeDiscover
