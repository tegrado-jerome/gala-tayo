import { useEffect, type ReactNode } from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'
import PhotoCard, { getPlaceImageCandidates } from '../components/discover/PhotoCard'
import Rail from '../components/discover/Rail'
import SentenceSearch from '../components/discover/SentenceSearch'
import { useGuestAuthPrompt } from '../components/GuestAuthPrompt'
import InternalLink from '../components/InternalLink'
import SeoHead from '../components/SeoHead'
import { AvatarStack, Button, Page, SectionHead } from '../components/ui'
import { homePopularTopPickPlaces } from '../data/homeRecommendations'
import { metroManilaAreas } from '../data/metroManilaAreas'
import { displayCityName } from '../utils/cityName'
import type { NavigationSource } from '../utils/navigationLoading'
import { BRAND_NAME, SEO_LANDING_TARGETS, buildBrandJsonLd } from '../utils/seoLandingPages'

const footerLinks = [
  { href: '/about', label: 'About' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
]

const heroPlace = homePopularTopPickPlaces[0]
const heroImageUrl = getPlaceImageCandidates(heroPlace)[0]

function Step({ n, title, body, art }: { n: number; title: string; body: string; art: ReactNode }) {
  return (
    <li className="min-w-0 shrink-0 basis-[72%] snap-start md:basis-auto">
      <div className="g-card grid h-[180px] place-items-center overflow-hidden p-3 md:h-[220px]" aria-hidden="true">
        {art}
      </div>
      <p className="mt-3 text-[17px] font-semibold leading-snug">
        {n}. {title}
      </p>
      <p className="g-mut mt-1 text-[15px]">{body}</p>
    </li>
  )
}

function WelcomePage({ navigationSource = 'push' }: { navigationSource?: NavigationSource }) {
  const guestAuth = useGuestAuthPrompt()

  useEffect(() => {
    const w = window as unknown as Record<string, (() => void) | undefined>
    w.__galatayoSetWelcomeReady?.()
  }, [])

  return (
    <>
      <SeoHead
        title={`Discover Metro Manila Places and Gala Ideas | ${BRAND_NAME}`}
        description={`${BRAND_NAME} helps you discover Metro Manila places by city, category, budget, and vibe, with AI help to plan your next gala.`}
        robots="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
        canonicalPath="/"
        openGraphType="website"
        image={{
          url: '/images/welcome/laptop-desktop.webp',
          alt: 'Metro Manila welcome scene on GalaTayo',
        }}
        jsonLd={buildBrandJsonLd()}
      />
      <Page className="pb-10 lg:pb-16">
        <section
          data-navigation-source={navigationSource}
          className="relative -mx-4 -mt-5 flex min-h-[420px] flex-col justify-end overflow-hidden md:mx-0 md:mt-0 md:min-h-[520px] md:rounded-[var(--r-4)]"
          style={{ height: '60vh' }}
        >
          {heroImageUrl ? (
            <img src={heroImageUrl} alt={heroPlace.name} fetchPriority="high" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
          ) : null}
          <div
            className="absolute inset-0 md:hidden"
            style={{ background: 'linear-gradient(to top, rgba(26,25,23,.85) 0%, rgba(26,25,23,0) 60%)' }}
          />
          <div
            className="absolute inset-0 hidden md:block"
            style={{ background: 'linear-gradient(180deg, rgba(26,25,23,0) 30%, rgba(26,25,23,.78) 100%), rgba(26,25,23,.15)' }}
          />
          <div className="relative max-w-[640px] px-4 pb-7 text-left text-white md:px-10 md:pb-20">
            <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-white/80">Metro Manila</p>
            <h1 className="g-d1 mt-3">Gala tayo. Kami na sa plano.</h1>
            <p className="mt-3 text-[17px] text-white/85">Find the place, vote on the date, split the bill.</p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button variant="tara" size="lg" href="/plan-with-ai">
                <Sparkles />
                Plan a gala
              </Button>
              <Button variant="line" size="lg" href="/home">
                Explore places
              </Button>
            </div>
            <p className="g-sm mt-4 text-white/80">
              Wala pang account?{' '}
              <InternalLink href="/signup" className="font-semibold text-white underline underline-offset-2">
                Sign up free
              </InternalLink>
            </p>
          </div>
        </section>

        <SentenceSearch className="relative z-[2] mx-auto mt-6 max-w-[760px] md:-mt-9" />

        <Rail title="Happening this weekend" subtitle="Places people are going to" seeAllHref="/places">
          {homePopularTopPickPlaces.map((place) => (
            <PhotoCard key={place.slug} place={place} onGuestFavorite={() => guestAuth.open('favorite')} />
          ))}
        </Rail>

        <SectionHead title="Less chasing, more gala" sub="One link for the whole barkada" />
        <ol className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:px-0">
          <Step
            n={1}
            title="Plan"
            body="Pick spots and a date"
            art={
              <div className="flex flex-col items-center">
                <span className="g-xs g-mut font-semibold uppercase tracking-[0.04em]">Sat</span>
                <span className="text-[72px] font-semibold leading-none" style={{ fontFamily: "var(--font-display)" }}>12</span>
                <span className="g-xs g-mut mt-1">3 stops</span>
              </div>
            }
          />
          <Step
            n={2}
            title="Invite"
            body="Friends RSVP, no app"
            art={
              <div className="flex flex-col items-center gap-3">
                <AvatarStack people={[{ name: 'Bea' }, { name: 'Migs' }, { name: 'Jo' }]} size={44} />
                <span className="rounded-full bg-[var(--ink)] px-4 py-1.5 text-[15px] font-semibold text-[var(--on-ink)]">Tara!</span>
              </div>
            }
          />
          <Step
            n={3}
            title="Split"
            body="Hatian (split the bill)"
            art={
              <div className="flex flex-col items-center">
                <span className="text-[56px] font-semibold leading-none" style={{ fontFamily: "var(--font-display)" }}>₱450</span>
                <span className="g-xs g-mut mt-1">each</span>
              </div>
            }
          />
        </ol>

        <details className="group mt-10 max-w-[760px] text-[14px] text-[var(--ink-2)]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-semibold text-[var(--ink)] [&::-webkit-details-marker]:hidden">
            About GalaTayo
            <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            <p>
              Gala Tayo (written GalaTayo) is a free Metro Manila place discovery app. "Gala tayo" is Filipino for "let's go out", and that is
              the whole idea: find a place, invite the barkada, and go.
            </p>
            <p>
              Every place page lists the city, category, budget range, best time to visit, who it suits, commute and parking notes, and common
              questions. You can browse by city or category, read curated guides, or ask the AI planner for a full-day itinerary with a budget.
            </p>
            <p>
              {BRAND_NAME} is built in the Philippines for people planning dates, barkada hangouts, family outings, and solo gala days across Metro
              Manila.{' '}
              <InternalLink href="/about" className="text-[var(--ink)] underline underline-offset-2">
                Read more about Gala Tayo
              </InternalLink>
              .
            </p>
          </div>

          <h3 className="mt-5 font-semibold text-[var(--ink)]">Browse by city</h3>
          <ul className="g-chips mt-2">
            {metroManilaAreas.map((area) => (
              <li key={area.slug}>
                <InternalLink href={`/places/${area.slug}`} className="g-chip">
                  {displayCityName(area.name)}
                </InternalLink>
              </li>
            ))}
          </ul>

          <h3 className="mt-5 font-semibold text-[var(--ink)]">Hindi makapag-decide?</h3>
          <p className="mt-2">
            <InternalLink href="/saan-tayo" className="text-[var(--ink)] underline underline-offset-2">
              Try Saan tayo?
            </InternalLink>{' '}
            Pick a city, budget per head and who you&apos;re with, and get 3 places to go.
          </p>

          <h3 className="mt-5 font-semibold text-[var(--ink)]">Popular guides</h3>
          <ul className="g-chips mt-2">
            {SEO_LANDING_TARGETS.map((target) => (
              <li key={target.slug}>
                <InternalLink href={`/guides/${target.slug}`} className="g-chip">
                  {target.label}
                </InternalLink>
              </li>
            ))}
          </ul>
        </details>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--line-2)] pt-6">
          <nav aria-label="Footer" className="g-sm g-mut flex flex-wrap items-center gap-x-5">
            <span>© {new Date().getFullYear()} GalaTayo</span>
            {footerLinks.map((link) => (
              <InternalLink key={link.href} href={link.href} className="inline-flex min-h-11 items-center hover:text-[var(--ink)]">
                {link.label}
              </InternalLink>
            ))}
          </nav>
          <span className="g-sm g-mut">Made in Metro Manila</span>
        </footer>
      </Page>
      {guestAuth.promptElement}
    </>
  )
}

export default WelcomePage
