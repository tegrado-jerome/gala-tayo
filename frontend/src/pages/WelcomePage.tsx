import { useEffect, type ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import PhotoCard from '../components/discover/PhotoCard'
import Rail from '../components/discover/Rail'
import SentenceSearch from '../components/discover/SentenceSearch'
import { useGuestAuthPrompt } from '../components/GuestAuthPrompt'
import InternalLink from '../components/InternalLink'
import SeoHead from '../components/SeoHead'
import { Avatar, Button, Page, Panel, SectionHead, Stamp } from '../components/ui'
import { homePopularTopPickPlaces } from '../data/homeRecommendations'
import { metroManilaAreas } from '../data/metroManilaAreas'
import type { NavigationSource } from '../utils/navigationLoading'
import { BRAND_NAME, SEO_LANDING_TARGETS, buildBrandJsonLd } from '../utils/seoLandingPages'

const footerLinks = [
  { href: '/about', label: 'About' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
]

function FeaturePanel({ art, title, body }: { art: ReactNode; title: string; body: string }) {
  return (
    <Panel as="article" className="flex flex-col">
      <div className="grid min-h-[150px] place-items-center overflow-hidden" aria-hidden="true">
        {art}
      </div>
      <h3 className="g-h3 mt-4">{title}</h3>
      <p className="g-sm g-mut mt-1">{body}</p>
    </Panel>
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
      <Page>
        <section data-navigation-source={navigationSource} className="max-w-[760px] pt-4 md:pt-12">
          <p className="g-eyebrow">Metro Manila</p>
          <h1 className="g-d1 mt-3">Gala tayo. Kami na sa plano.</h1>
          <p className="g-mut mt-4 text-[17px]">Find the place, vote on the date, split the bill. One link for the whole barkada.</p>
          <SentenceSearch className="mt-7" />
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button variant="tara" size="lg" href="/plan-with-ai">
              <Sparkles />
              Plan a gala
            </Button>
            <Button variant="line" size="lg" href="/home">
              Explore places
            </Button>
          </div>
          <p className="g-sm g-mut mt-4">
            Wala pang account?{' '}
            <InternalLink href="/signup" className="font-semibold text-[var(--ink)] underline underline-offset-2">
              Sign up free
            </InternalLink>
          </p>
        </section>

        <Rail title="Happening this weekend" subtitle="Places people are going to" seeAllHref="/places">
          {homePopularTopPickPlaces.map((place) => (
            <PhotoCard key={place.slug} place={place} onGuestFavorite={() => guestAuth.open('favorite')} />
          ))}
        </Rail>

        <SectionHead title="Less chasing, more gala" sub="The boring parts of planning, handled" />
        <div className="grid gap-4 md:grid-cols-3 md:gap-6">
          <FeaturePanel
            title="Plan together"
            body="Send one link. Friends RSVP and vote on the date, no app needed."
            art={
              <div className="g-rsvp w-full max-w-[320px]">
                <button type="button" tabIndex={-1} className="is-go" aria-pressed="true">
                  Tara!
                </button>
                <button type="button" tabIndex={-1}>
                  Baka
                </button>
                <button type="button" tabIndex={-1}>
                  Pass
                </button>
              </div>
            }
          />
          <FeaturePanel
            title="Hatian"
            body="Log who paid. Everyone sees what they owe and settles via GCash or Maya."
            art={
              <div className="g-bal w-full">
                <Avatar name="Bea" size={36} />
                <div className="min-w-0">
                  <b className="g-sm block">You owe Bea</b>
                  <span className="g-xs g-mut">Wildflour dinner</span>
                </div>
                <span className="g-amt is-owe">₱450</span>
              </div>
            }
          />
          <FeaturePanel
            title="Passport"
            body="Tap “I'm here” where you go. Collect stamps and keep your barkada streak."
            art={
              <div className="flex scale-[0.85] gap-3">
                <Stamp title="Poblacion regular" />
                <Stamp title="Early bird" state="new" />
                <Stamp title="Museum hopper" sub="3 of 5" state="progress" progress={0.6} />
              </div>
            }
          />
        </div>

        <section aria-labelledby="welcome-intro-title" className="max-w-[760px]">
          <SectionHead as="h2" title={<span id="welcome-intro-title">What is Gala Tayo?</span>} />
          <div className="g-mut flex flex-col gap-3">
            <p>
              Gala Tayo (written GalaTayo) is a free Metro Manila place discovery app. "Gala tayo" is Filipino for "let's go out", and that is
              the whole idea: find a place, invite the barkada, and go.
            </p>
            <p>
              Every place page lists the city, category, budget range, best time to visit, who it suits, commute and parking notes, and common
              questions. You can browse by city or category, read curated guides, or ask the AI planner for a full-day itinerary with a budget.
            </p>
          </div>

          <h3 className="g-h3 mt-8">Browse by city</h3>
          <ul className="g-chips mt-3">
            {metroManilaAreas.map((area) => (
              <li key={area.slug}>
                <InternalLink href={`/places/${area.slug}`} className="g-chip">
                  {area.name}
                </InternalLink>
              </li>
            ))}
          </ul>

          <h3 className="g-h3 mt-8">Hindi makapag-decide?</h3>
          <p className="g-sm g-mut mt-2">
            <InternalLink href="/saan-tayo" className="text-[var(--ink)] underline underline-offset-2">
              Try Saan tayo?
            </InternalLink>{' '}
            Pick a city, budget per head and who you&apos;re with, and get 3 places to go.
          </p>

          <h3 className="g-h3 mt-8">Popular guides</h3>
          <ul className="g-chips mt-3">
            {SEO_LANDING_TARGETS.map((target) => (
              <li key={target.slug}>
                <InternalLink href={`/guides/${target.slug}`} className="g-chip">
                  {target.label}
                </InternalLink>
              </li>
            ))}
          </ul>

          <p className="g-sm g-mut mt-8">
            {BRAND_NAME} is built in the Philippines for people planning dates, barkada hangouts, family outings, and solo gala days across Metro
            Manila.{' '}
            <InternalLink href="/about" className="text-[var(--ink)] underline underline-offset-2">
              Read more about Gala Tayo
            </InternalLink>
            .
          </p>
        </section>

        <footer className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--line-2)] pt-6">
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
