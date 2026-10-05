import { useEffect, type ReactNode } from 'react'
import { CaretDown as ChevronDown } from '@phosphor-icons/react/dist/csr/CaretDown'
import HomeDiscover from '../components/home/HomeDiscover'
import InternalLink from '../components/InternalLink'
import SeoHead from '../components/SeoHead'
import { AvatarStack, Page, SectionHead } from '../components/ui'
import { metroManilaAreas } from '../data/destinations'
import { displayCityName } from '../utils/cityName'
import type { NavigationSource } from '../utils/navigationLoading'
import { BRAND_NAME, SEO_LANDING_TARGETS, buildBrandJsonLd } from '../utils/seoLandingPages'

const footerLinks = [
  { href: '/about', label: 'About' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
]


function Step({ n, title, body, art }: { n: number; title: string; body: string; art: ReactNode }) {
  return (
    <li className="flex min-w-0 items-center gap-4 md:block">
      <div className="g-card grid h-24 w-24 shrink-0 grid-cols-[minmax(0,1fr)] place-items-center overflow-hidden md:h-[220px] md:w-auto" aria-hidden="true">
        <div className="w-max scale-[0.5] md:scale-100">{art}</div>
      </div>
      <div className="min-w-0">
        <p className="text-[17px] font-semibold leading-snug md:mt-3">
          {n}. {title}
        </p>
        <p className="g-mut mt-1 text-[15px]">{body}</p>
      </div>
    </li>
  )
}

function WelcomePage({ navigationSource = 'push' }: { navigationSource?: NavigationSource }) {

  useEffect(() => {
    const w = window as unknown as Record<string, (() => void) | undefined>
    w.__galatayoSetWelcomeReady?.()
  }, [])

  return (
    <>
      <SeoHead
        title={`Discover Places Around the Philippines and Gala Ideas | ${BRAND_NAME}`}
        description={`${BRAND_NAME} helps you discover gala-worthy places around the Philippines by city, category, budget, and vibe, with AI help to plan your next gala.`}
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
        <header data-navigation-source={navigationSource} className="mb-5 min-w-0 text-center md:mb-7">
          <h1 className="g-d1">Gala tayo. Kami na sa plano.</h1>
          <p className="g-mut mt-2 text-[16px]">Find the place, vote on the date, split the bill.</p>
        </header>

        <HomeDiscover />

        <SectionHead title="Less chasing, more gala" sub="One link for the whole barkada" />
        <ol className="flex flex-col gap-3 md:grid md:grid-cols-3 md:gap-6">
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
              Gala Tayo (written GalaTayo) is a free place discovery app for gala-worthy places around the Philippines. "Gala tayo" is Filipino for "let's go out", and that is
              the whole idea: find a place, invite the barkada, and go.
            </p>
            <p>
              Every place page lists the city, category, budget range, best time to visit, who it suits, commute and parking notes, and common
              questions. You can browse by city or category, read curated guides, or ask the AI planner for a full-day itinerary with a budget.
            </p>
            <p>
              {BRAND_NAME} is built in the Philippines for people planning dates, barkada hangouts, family outings, and solo gala days, from Metro
              Manila to the provinces.{' '}
              <InternalLink href="/about" className="text-[var(--ink)] underline underline-offset-2">
                Read more about Gala Tayo
              </InternalLink>
              .
            </p>
          </div>

          <h3 className="mt-5 font-semibold text-[var(--ink)]">Browse Metro Manila by city</h3>
          <ul className="g-chips mt-2">
            {metroManilaAreas.map((area) => (
              <li key={area.slug}>
                <InternalLink href={`/places/${area.slug}`} className="g-chip">
                  {displayCityName(area.name)}
                </InternalLink>
              </li>
            ))}
            <li>
              <InternalLink href="/places" className="g-chip">
                All destinations
              </InternalLink>
            </li>
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
          <span className="g-sm g-mut">Made in the Philippines</span>
        </footer>
      </Page>
    </>
  )
}

export default WelcomePage
