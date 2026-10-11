import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { BookOpen } from '@phosphor-icons/react/dist/csr/BookOpen'
import { Compass } from '@phosphor-icons/react/dist/csr/Compass'
import { ForkKnife } from '@phosphor-icons/react/dist/csr/ForkKnife'
import { MagnifyingGlass as Search } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { Sparkle as Sparkles } from '@phosphor-icons/react/dist/csr/Sparkle'
import { UsersThree } from '@phosphor-icons/react/dist/csr/UsersThree'
import PhotoCard, { getPlaceHref, type PhotoCardPlace } from '../discover/PhotoCard'
import Rail from '../discover/Rail'
import VibeChips from '../discover/VibeChips'
import ExploreCities from './ExploreCities'
import HomeQuickPicks from './HomeQuickPicks'
import { requestSearchFocus } from './search/SearchSuggest'
import InternalLink from '../InternalLink'
import { useGuestAuthPrompt } from '../GuestAuthPrompt'
import { formatPricePerHead, formatVisitDuration } from '../PlaceCard'
import { SectionHead, Skeleton, cx } from '../ui'
import { GalaTodayHome } from './GalaTodayCard'
import { galaTayoPickSlugs, getRailPickSlugs } from '../../data/galaTayoPicks'
import { getStaticPlaceImageUrlForSlug } from '../../data/placeIndexVisuals'
import { heroSrcSet, resizedMediaUrl } from '../../data/r2Config'
import { useListingRail } from '../../hooks/useListingRail'
import type { PlaceDetail } from '../../types/appTypes'
import { fetchHomePlaceDetailsBatch } from '../../utils/placeDetailCache'
import { getPlaceCardPhoto, getPlaceLeadPhoto } from '../../utils/placeGalleryPhotos'
import { getSeoListingPage } from '../../utils/seoApi'
import { METRO_MANILA_REGION_SLUG, getDestinationBySlug } from '../../data/destinations'
import { MIN_INDEXABLE_GUIDE_PLACES, SEO_LANDING_TARGETS, getLandingTargetBySlug } from '../../utils/seoLandingPages'
import { vibeHref, vibes, type VibeId } from '../../utils/vibes'

// Editor's pick: the top-scored gala-worthy place. The headline is written from its own description.
const EDITORS_PICK = { slug: 'fort-santiago', kicker: 'Editor’s pick · Intramuros', headline: 'Walls, river views and Rizal’s final prison' }

// Guides shown on Home, nationwide ones included; each only appears once it has enough places and a photo.
const HOME_GUIDES = [
  'heritage-sites-in-manila',
  'things-to-do-in-baguio',
  'date-spots-in-bgc',
  'things-to-do-in-cebu-city',
  'museums-in-manila',
  'things-to-do-in-el-nido',
  'restaurants-in-metro-manila',
  'where-to-eat-in-baguio',
  'cheap-eats-in-manila',
  'restaurants-in-quezon-city',
]
const FOOD_CATEGORIES = new Set(['food', 'cafe'])
// Food has its own tab on Home, so the Things to do chips leave it out instead of repeating it.
const THINGS_TO_DO_VIBES = vibes.filter((vibe) => vibe.id !== 'food-trip')
// Guides outside Metro Manila, listed by name until their places have photos for a cover.
const COUNTRY_GUIDES = SEO_LANDING_TARGETS.filter((target) => target.areaSlug && getDestinationBySlug(target.areaSlug)?.regionSlug !== METRO_MANILA_REGION_SLUG && target.areaSlug !== METRO_MANILA_REGION_SLUG)
const RAIL_SIZE = 10

type HomeTab = 'things' | 'food' | 'guides'

/** Only the curated photo manifest says a place really has a photo; the static R2 path is a guess. */
function photoFor(slug: string | null) {
  return slug ? getPlaceCardPhoto(slug) : null
}

const hasPhoto = (slug: string) => Boolean(photoFor(slug))
const railSlugs = getRailPickSlugs(RAIL_SIZE, hasPhoto, [EDITORS_PICK.slug])
// Top picks not in the rail, for the weekday card, so it never repeats the rail.
const extraSlugs = galaTayoPickSlugs.filter((slug) => slug !== EDITORS_PICK.slug && !railSlugs.includes(slug) && hasPhoto(slug)).slice(0, 8)

/** Real details (ids for saving, duration, fee, best time) for the editor's pick, the rail and a few more picks. */
function usePickDetails() {
  const [details, setDetails] = useState<PlaceDetail[] | null>(null)
  useEffect(() => {
    let isActive = true
    const slugs = [EDITORS_PICK.slug, ...railSlugs, ...extraSlugs]
    void fetchHomePlaceDetailsBatch({ slugs, cityImageRequests: [] })
      .then(({ places }) => isActive && setDetails(places))
      .catch(() => isActive && setDetails([]))
    return () => {
      isActive = false
    }
  }, [])
  return details
}

function toPhotoCardPlace(place: PlaceDetail): PhotoCardPlace {
  return {
    id: place.id,
    slug: place.slug,
    name: place.name,
    category: place.category,
    area: place.area,
    city: place.city,
    localArea: place.area,
    imageUrl: place.imageUrl ?? null,
    thumbnailUrl: place.thumbnailUrl ?? null,
    curatedImageUrls: place.curatedImageUrls ?? [],
    rating: typeof place.rating === 'number' && place.rating > 0 ? place.rating : null,
    reviewCount: place.review_count ?? null,
    budgetMin: place.budget_min != null ? Number(place.budget_min) : null,
    duration: place.visit_duration ?? null,
  }
}

function WhereTo() {
  return (
    <div className="g-where">
      <InternalLink href="/search" className="g-where-main" onClick={requestSearchFocus}>
        <Search weight="bold" aria-hidden="true" />
        Where to?
      </InternalLink>
      <InternalLink href="/plan-with-ai" className="g-where-ai" ariaLabel="Plan a trip with AI">
        <Sparkles weight="light" aria-hidden="true" />
      </InternalLink>
    </div>
  )
}

// Wide screens only: three iconic places balance the hero (the editor's pick below is Fort Santiago).
const HERO_SLUGS = [
  { slug: 'chocolate-hills-carmen', label: 'Chocolate Hills, Bohol' },
  { slug: 'el-nido-tour-a-lagoons', label: 'El Nido, Palawan' },
  { slug: 'batad-rice-terraces-banaue', label: 'Batad, Ifugao' },
]

function HeroCollage() {
  const photos = HERO_SLUGS.map((item) => ({ ...item, photo: getPlaceCardPhoto(item.slug) })).filter((item) => item.photo)
  if (photos.length < 3) return null
  return (
    <div className="g-hero-collage" aria-hidden="true">
      {photos.map((item) => (
        <figure key={item.slug}>
          <img src={item.photo ?? ''} alt="" loading="lazy" decoding="async" />
          <figcaption>{item.label}</figcaption>
        </figure>
      ))}
    </div>
  )
}

const TABS: Array<{ id: HomeTab; label: string; icon: typeof Compass }> = [
  { id: 'things', label: 'Things to do', icon: Compass },
  { id: 'food', label: 'Food trips', icon: ForkKnife },
  { id: 'guides', label: 'Guides', icon: BookOpen },
]

/** Text tabs that switch the content below in place, like Tripadvisor's home tabs. */
function TextTabs({ active, onChange }: { active: HomeTab; onChange: (tab: HomeTab) => void }) {
  return (
    <div className="g-ttabs" role="tablist" aria-label="Explore">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button key={id} type="button" role="tab" id={`home-tab-${id}`} aria-selected={active === id} aria-controls="home-tab-panel" className="g-ttab" onClick={() => onChange(id)}>
          <Icon weight="light" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  )
}

function EditorsPick({ place }: { place: PlaceDetail | undefined }) {
  const photo = getPlaceLeadPhoto(EDITORS_PICK.slug) || getStaticPlaceImageUrlForSlug(EDITORS_PICK.slug) || place?.imageUrl
  const facts = place ? [place.name, formatVisitDuration(place.visit_duration), formatPricePerHead(place.budget_min)].filter(Boolean).join(' · ') : 'Fort Santiago'
  const href = place ? getPlaceHref(toPhotoCardPlace(place)) : getPlaceHref({ id: EDITORS_PICK.slug, slug: EDITORS_PICK.slug, name: 'Fort Santiago', city: 'Manila', area: 'Intramuros' })
  return (
    <InternalLink href={href} className="g-feat">
      {photo ? (
        <img
          src={resizedMediaUrl(photo, 'hero')}
          srcSet={heroSrcSet(photo)}
          sizes="(min-width: 1240px) 1176px, calc(100vw - 32px)"
          width={1280}
          height={720}
          alt=""
          fetchPriority="high"
          decoding="async"
        />
      ) : null}
      <span className="g-feat-body">
        <span className="g-feat-kicker block">{EDITORS_PICK.kicker}</span>
        <span className="g-feat-title block">{EDITORS_PICK.headline}</span>
        <span className="g-feat-meta block">{facts}</span>
      </span>
    </InternalLink>
  )
}

function RailSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-[240px] w-[220px] shrink-0 !rounded-[var(--r-3)]" />
      ))}
    </div>
  )
}

/** "Weekday mornings, outside Mass schedules" → "Weekday mornings": the first clause, sentence-cased. */
function shortBestTime(value: string) {
  const first = value.split(/[;(,]/)[0].trim().replace(/[.]$/, '')
  return first.charAt(0).toUpperCase() + first.slice(1)
}

/** Picks (outside the rail) whose own best time to visit says weekday: a real hint that weekends get busy. */
function WeekdayCard({ places }: { places: PlaceDetail[] }) {
  const weekday = places.filter((place) => extraSlugs.includes(place.slug) && /^weekday/i.test(place.best_time_to_visit?.trim() ?? '')).slice(0, 4)
  if (weekday.length === 0) return null
  return (
    <section className="min-w-0">
      <SectionHead title="Best on weekdays" sub="Fewer crowds, per each place’s best time to visit" />
      <ul className="g-weekday">
        {weekday.map((place) => {
          const photo = photoFor(place.slug)
          return (
            <li key={place.slug}>
              <InternalLink href={getPlaceHref(toPhotoCardPlace(place))} className="g-weekday-item">
                <span className="g-weekday-img">{photo ? <img src={photo} alt="" loading="lazy" decoding="async" /> : <UsersThree weight="fill" aria-hidden="true" />}</span>
                <span className="min-w-0">
                  <b>{place.name}</b>
                  <span>{shortBestTime(place.best_time_to_visit ?? '')}</span>
                </span>
              </InternalLink>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

type GuideCover = { slug: string; label: string; category: string | null; photo: string; total: number }

let guideCoversRequest: Promise<GuideCover[]> | null = null

/** Each guide is pictured by its first place with a photo; guides without enough places or a photo stay off Home. */
function loadGuideCovers() {
  guideCoversRequest ??= Promise.all(
    HOME_GUIDES.map(async (slug): Promise<GuideCover | null> => {
      const target = getLandingTargetBySlug(slug)
      if (!target) return null
      const page = await getSeoListingPage({ areaSlug: target.areaSlug ?? null, category: target.category ?? null, goodFor: target.goodFor ?? null, page: 1, pageSize: 10 }).catch(() => null)
      if (!page || page.total < MIN_INDEXABLE_GUIDE_PLACES) return null
      const photo = page.items.map((item) => photoFor(item.slug)).find(Boolean) || page.items.find((item) => item.imageUrl)?.imageUrl
      return photo ? { slug, label: target.label, category: target.category ?? null, photo, total: page.total } : null
    }),
  ).then((covers) => covers.filter((cover): cover is GuideCover => cover !== null))
  return guideCoversRequest
}

function useGuideCovers() {
  const [covers, setCovers] = useState<GuideCover[] | null>(null)
  useEffect(() => {
    let isActive = true
    void loadGuideCovers().then((loaded) => isActive && setCovers(loaded))
    return () => {
      isActive = false
    }
  }, [])
  return covers
}

function Guides({ covers, title = 'Guides', limit = 4, showAll = false }: { covers: GuideCover[] | null; title?: string; limit?: number; showAll?: boolean }) {
  if (covers !== null && covers.length === 0) return null
  return (
    <section className="min-w-0">
      <SectionHead
        title={title}
        action={
          <InternalLink href="/guides" className="g-btn g-btn-text">
            All guides
          </InternalLink>
        }
      />
      <div className={cx('g-guides', showAll && 'is-all')}>
        {covers === null
          ? Array.from({ length: 2 }, (_, index) => <Skeleton key={index} className="aspect-[3/2] !rounded-[var(--r-2)]" />)
          : covers.slice(0, limit).map((cover) => (
              <InternalLink key={cover.slug} href={`/guides/${cover.slug}`} className="g-guide">
                <span className="g-guide-img">
                  <img src={resizedMediaUrl(cover.photo, 'card')} alt="" width={640} height={427} loading="lazy" decoding="async" />
                </span>
                <b>{cover.label}</b>
                <small>
                  {cover.total} {cover.total === 1 ? 'place' : 'places'}
                </small>
              </InternalLink>
            ))}
      </div>
    </section>
  )
}

function SaanTayoCard({ pool }: { pool: PhotoCardPlace[] }) {
  return (
    <section className="g-saan" aria-label="Pick for me">
      <InternalLink href="/saan-tayo" className="g-saan-main">
        <span className="min-w-0">
          <b>Pick for me</b>
          <span>Can't decide? We deal 3 picks for your group chat!</span>
        </span>
        <span className="g-saan-go">Start</span>
      </InternalLink>
      <HomeQuickPicks pool={pool} />
    </section>
  )
}

/** A rail of places that fit a vibe; See all opens the vibe's full list. */
function VibeRail({ title, subtitle, vibe, onGuestFavorite }: { title: string; subtitle?: string; vibe: VibeId; onGuestFavorite: (retry: () => void) => void }) {
  const places = useListingRail({ vibe })
  if (places && places.length === 0) return null
  return places ? (
    <Rail title={title} subtitle={subtitle} seeAllHref={vibeHref('/places', vibe)} seeAllRel="nofollow">
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

/** Editorial home: headline, Where to?, tabs, then the tab's content. Shared by Home and the guest landing page. */
function HomeDiscover({ isRaining = false, headline, top, className }: { isRaining?: boolean; headline?: ReactNode; top?: ReactNode; className?: string }) {
  const guestAuth = useGuestAuthPrompt()
  const pickDetails = usePickDetails()
  const guideCovers = useGuideCovers()
  const [tab, setTab] = useState<HomeTab>('things')
  const openGuestFavorite = (retry: () => void) => guestAuth.open('favorite', retry)
  const picks = useMemo(() => {
    const bySlug = new Map((pickDetails ?? []).map((place) => [place.slug, place]))
    return railSlugs.map((slug) => bySlug.get(slug)).filter((place): place is PlaceDetail => Boolean(place)).map(toPhotoCardPlace)
  }, [pickDetails])
  const foodGuides = useMemo(() => guideCovers && guideCovers.filter((cover) => cover.category && FOOD_CATEGORIES.has(cover.category)), [guideCovers])

  return (
    <div className={cx('min-w-0', className)}>
      <div className="g-hero">
        <div className="g-hero-main">
          {headline}
          <WhereTo />
          {top}
        </div>
        <HeroCollage />
      </div>
      <TextTabs active={tab} onChange={setTab} />

      <div id="home-tab-panel" role="tabpanel" aria-labelledby={`home-tab-${tab}`} className="min-w-0">
        {tab === 'food' ? (
          <>
            <VibeRail title="Top food trips" subtitle="Famous eats worth the drive, best first" vibe="food-trip" onGuestFavorite={openGuestFavorite} />
            <Guides covers={foodGuides} title="Food guides" limit={4} />
          </>
        ) : tab === 'guides' ? (
          <>
            <Guides covers={guideCovers} title="Guides" limit={HOME_GUIDES.length} showAll />
            {COUNTRY_GUIDES.length > 0 ? (
              <section className="min-w-0">
                <SectionHead title="Around the country" sub="Baguio, Cebu, Palawan and more" />
                <ul className="g-chips">
                  {COUNTRY_GUIDES.map((target) => (
                    <li key={target.slug}>
                      <InternalLink href={`/guides/${target.slug}`} className="g-chip">
                        {target.label}
                      </InternalLink>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : (
          <>
            <VibeChips active={null} getHref={(id) => vibeHref('/places', id)} available={THINGS_TO_DO_VIBES} showAll={false} />
            {/* The editor's pick is the page's LCP photo, so it sits above Gala Today, which loads later and would push it down. */}
            <EditorsPick place={pickDetails?.find((place) => place.slug === EDITORS_PICK.slug)} />
            <GalaTodayHome />

            {pickDetails ? (
              picks.length > 0 ? (
                <Rail title="GalaTayo Picks" subtitle="Top-scored places around the country" seeAllHref="/places">
                  {picks.map((place) => (
                    <PhotoCard key={place.slug ?? place.id} place={place} onGuestFavorite={openGuestFavorite} />
                  ))}
                </Rail>
              ) : null
            ) : (
              <section className="min-w-0">
                <SectionHead title="GalaTayo Picks" sub="Top-scored places around the country" />
                <RailSkeleton />
              </section>
            )}

            {isRaining ? <VibeRail title="Rainy day? Head indoors!" subtitle="Museums, cafes and indoor fun" vibe="rainy-day" onGuestFavorite={openGuestFavorite} /> : null}
            {pickDetails ? <WeekdayCard places={pickDetails} /> : null}
            <Guides covers={guideCovers} />
            <SaanTayoCard pool={picks} />
            <ExploreCities />
          </>
        )}
      </div>
      {guestAuth.promptElement}
    </div>
  )
}

export default HomeDiscover
