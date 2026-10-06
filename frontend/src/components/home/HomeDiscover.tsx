import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { BookOpen } from '@phosphor-icons/react/dist/csr/BookOpen'
import { Compass } from '@phosphor-icons/react/dist/csr/Compass'
import { ForkKnife } from '@phosphor-icons/react/dist/csr/ForkKnife'
import { MagnifyingGlass as Search } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { Sparkle as Sparkles } from '@phosphor-icons/react/dist/csr/Sparkle'
import { UsersThree } from '@phosphor-icons/react/dist/csr/UsersThree'
import PhotoCard, { getPlaceHref, type PhotoCardPlace } from '../discover/PhotoCard'
import Rail from '../discover/Rail'
import ExploreCities from './ExploreCities'
import HomeQuickPicks from './HomeQuickPicks'
import InternalLink from '../InternalLink'
import { useGuestAuthPrompt } from '../GuestAuthPrompt'
import { formatPricePerHead, formatVisitDuration } from '../PlaceCard'
import { SectionHead, Skeleton, cx } from '../ui'
import { galaTayoPickSlugs } from '../../data/galaTayoPicks'
import { getStaticPlaceImageUrlForSlug } from '../../data/placeIndexVisuals'
import { resizedMediaUrl } from '../../data/r2Config'
import { useListingRail } from '../../hooks/useListingRail'
import type { PlaceDetail } from '../../types/appTypes'
import { fetchHomePlaceDetailsBatch } from '../../utils/placeDetailCache'
import { getPlaceCardPhoto, getPlaceLeadPhoto } from '../../utils/placeGalleryPhotos'
import { getSeoListingPage } from '../../utils/seoApi'
import { getLandingTargetBySlug } from '../../utils/seoLandingPages'

// Editor's pick: the top-scored gala-worthy place. The headline is written from its own description.
const EDITORS_PICK = { slug: 'fort-santiago', kicker: 'Editor’s pick · Intramuros', headline: 'Walls, river views and Rizal’s final prison' }

// Each mood pill links to a real category, pictured by a top place in it.
const MOODS = [
  { label: 'Heritage', href: '/places/categories/heritage', photoSlug: 'intramuros' },
  { label: 'Museums', href: '/places/categories/museum', photoSlug: 'national-museum-of-fine-arts' },
  { label: 'Parks', href: '/places/categories/park', photoSlug: 'ayala-triangle-gardens' },
  { label: 'Food', href: '/places/categories/food', photoSlug: 'toyo-eatery' },
]

const HOME_GUIDES = ['heritage-sites-in-manila', 'museums-in-manila', 'date-spots-in-bgc', 'best-cafes-in-makati', 'things-to-do-in-makati', 'kainan-sa-bgc']

function photoFor(slug: string | null) {
  return slug ? getPlaceCardPhoto(slug) || getStaticPlaceImageUrlForSlug(slug) : null
}

/** Real details (ids for saving, duration, fee, best time) for every GalaTayo Pick, in score order. */
function usePickDetails() {
  const [details, setDetails] = useState<PlaceDetail[] | null>(null)
  useEffect(() => {
    let isActive = true
    void fetchHomePlaceDetailsBatch({ slugs: galaTayoPickSlugs, cityImageRequests: [] })
      .then(({ places }) => {
        if (!isActive) return
        const bySlug = new Map(places.map((place) => [place.slug, place]))
        setDetails(galaTayoPickSlugs.map((slug) => bySlug.get(slug)).filter((place): place is PlaceDetail => Boolean(place)))
      })
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
      <InternalLink href="/search" className="g-where-main">
        <Search weight="bold" aria-hidden="true" />
        Where to?
      </InternalLink>
      <InternalLink href="/plan-with-ai" className="g-where-ai" ariaLabel="Plan a gala with AI">
        <Sparkles weight="light" aria-hidden="true" />
      </InternalLink>
    </div>
  )
}

function TextTabs() {
  return (
    <nav className="g-ttabs" aria-label="Explore">
      <InternalLink href="/home" className="g-ttab" aria-current="page">
        <Compass weight="light" aria-hidden="true" />
        Things to do
      </InternalLink>
      <InternalLink href="/places/categories/food" className="g-ttab">
        <ForkKnife weight="light" aria-hidden="true" />
        Food
      </InternalLink>
      <InternalLink href="/guides" className="g-ttab">
        <BookOpen weight="light" aria-hidden="true" />
        Guides
      </InternalLink>
    </nav>
  )
}

function MoodPills() {
  return (
    <nav className="g-moods" aria-label="Moods">
      {MOODS.map((mood) => {
        const photo = photoFor(mood.photoSlug)
        return (
          <InternalLink key={mood.label} href={mood.href} className="g-mood">
            {photo ? <img src={resizedMediaUrl(photo, 'thumb')} alt="" loading="lazy" decoding="async" /> : null}
            {mood.label}
          </InternalLink>
        )
      })}
    </nav>
  )
}

function EditorsPick({ place }: { place: PlaceDetail | undefined }) {
  const photo = getPlaceLeadPhoto(EDITORS_PICK.slug) || getStaticPlaceImageUrlForSlug(EDITORS_PICK.slug) || place?.imageUrl
  const facts = place ? [place.name, formatVisitDuration(place.visit_duration), formatPricePerHead(place.budget_min)].filter(Boolean).join(' · ') : 'Fort Santiago'
  const href = place ? getPlaceHref(toPhotoCardPlace(place)) : getPlaceHref({ id: EDITORS_PICK.slug, slug: EDITORS_PICK.slug, name: 'Fort Santiago', city: 'Manila', area: 'Intramuros' })
  return (
    <InternalLink href={href} className="g-feat">
      {photo ? <img src={resizedMediaUrl(photo, 'hero')} alt="" fetchPriority="high" decoding="async" /> : null}
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

/** Picks whose own best time to visit says weekday: a real hint that weekends get busy. */
function WeekdayCard({ places }: { places: PlaceDetail[] }) {
  const weekday = places.filter((place) => /^weekday/i.test(place.best_time_to_visit?.trim() ?? '')).slice(0, 2)
  if (weekday.length === 0) return null
  return (
    <section className="min-w-0">
      <SectionHead title="Mas okay sa weekday" sub="From each place’s best time to visit" />
      {weekday.map((place) => (
        <InternalLink key={place.slug} href={getPlaceHref(toPhotoCardPlace(place))} className="g-busy text-[var(--ink)] no-underline">
          <UsersThree weight="fill" aria-hidden="true" />
          <span className="min-w-0">
            <b>{place.name}</b>
            <span>Best time: {place.best_time_to_visit?.trim().toLowerCase()}</span>
          </span>
        </InternalLink>
      ))}
    </section>
  )
}

type GuideCover = { slug: string; label: string; photo: string | null; total: number }

/** Each guide is pictured by its own first place with a photo, like the guide page hero. */
function useGuideCovers() {
  const [covers, setCovers] = useState<GuideCover[]>([])
  useEffect(() => {
    const controller = new AbortController()
    const targets = HOME_GUIDES.map((slug) => getLandingTargetBySlug(slug)).filter((target): target is NonNullable<typeof target> => Boolean(target))
    void Promise.all(
      targets.map(async (target) => {
        const page = await getSeoListingPage({ areaSlug: target.areaSlug ?? null, category: target.category ?? null, goodFor: target.goodFor ?? null, page: 1, pageSize: 10, signal: controller.signal })
        const lead = page.items.find((item) => item.imageUrl)
        return { slug: target.slug, label: target.label, photo: (lead && photoFor(lead.slug)) || lead?.imageUrl || null, total: page.total }
      }),
    )
      .then((loaded) => setCovers(loaded.filter((cover) => cover.total > 0 && cover.photo).slice(0, 4)))
      .catch(() => undefined)
    return () => controller.abort()
  }, [])
  return covers
}

function Guides() {
  const covers = useGuideCovers()
  if (covers.length === 0) return null
  return (
    <section className="min-w-0">
      <SectionHead
        title="Guides"
        action={
          <InternalLink href="/guides" className="g-btn g-btn-text">
            All guides
          </InternalLink>
        }
      />
      <div className="g-guides">
        {covers.map((cover) => (
          <InternalLink key={cover.slug} href={`/guides/${cover.slug}`} className="g-guide">
            <span className="g-guide-img">{cover.photo ? <img src={resizedMediaUrl(cover.photo, 'card')} alt="" loading="lazy" decoding="async" /> : null}</span>
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
    <section className="g-saan" aria-label="Saan tayo?">
      <InternalLink href="/saan-tayo" className="g-saan-main">
        <span className="min-w-0">
          <b>Saan tayo?</b>
          <span>3 taps, we pick for your group</span>
        </span>
        <span className="g-saan-go">Start</span>
      </InternalLink>
      <HomeQuickPicks pool={pool} />
    </section>
  )
}

function ListingRail({ title, subtitle, href, category, onGuestFavorite }: { title: string; subtitle?: string; href: string; category: string; onGuestFavorite: (retry: () => void) => void }) {
  const places = useListingRail({ category })
  if (places && places.length === 0) return null
  return places ? (
    <Rail title={title} subtitle={subtitle} seeAllHref={href}>
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

/** Editorial home: headline, Where to?, tabs, mood pills, editor's pick, picks rail, guides, Saan tayo. Shared by Home and the guest landing page. */
function HomeDiscover({ isRaining = false, headline, top, className }: { isRaining?: boolean; headline?: ReactNode; top?: ReactNode; className?: string }) {
  const guestAuth = useGuestAuthPrompt()
  const pickDetails = usePickDetails()
  const openGuestFavorite = (retry: () => void) => guestAuth.open('favorite', retry)
  const picks = useMemo(() => (pickDetails ?? []).filter((place) => place.slug !== EDITORS_PICK.slug).map(toPhotoCardPlace), [pickDetails])

  return (
    <div className={cx('min-w-0', className)}>
      {headline}
      <WhereTo />
      <TextTabs />
      <MoodPills />
      {top}
      <EditorsPick place={pickDetails?.find((place) => place.slug === EDITORS_PICK.slug)} />

      {pickDetails ? (
        picks.length > 0 ? (
          <Rail title="GalaTayo Picks" subtitle="Our top-scored gala-worthy places" seeAllHref="/places">
            {picks.map((place, index) => (
              <PhotoCard key={place.slug ?? place.id} place={place} priority={index < 2} onGuestFavorite={openGuestFavorite} />
            ))}
          </Rail>
        ) : null
      ) : (
        <section className="min-w-0">
          <SectionHead title="GalaTayo Picks" sub="Our top-scored gala-worthy places" />
          <RailSkeleton />
        </section>
      )}

      {isRaining ? <ListingRail title="Rainy day? Indoor picks" subtitle="Museums to wait out the ulan" href="/places/categories/museum" category="museum" onGuestFavorite={openGuestFavorite} /> : null}
      {pickDetails ? <WeekdayCard places={pickDetails} /> : null}
      <Guides />
      <SaanTayoCard pool={picks} />
      <ExploreCities />
      {guestAuth.promptElement}
    </div>
  )
}

export default HomeDiscover
