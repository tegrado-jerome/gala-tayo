import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { CalendarPlus } from '@phosphor-icons/react/dist/csr/CalendarPlus'
import { Compass } from '@phosphor-icons/react/dist/csr/Compass'
import { MapTrifold } from '@phosphor-icons/react/dist/csr/MapTrifold'
import { Sparkle } from '@phosphor-icons/react/dist/csr/Sparkle'
import MinimalBackNav from '../components/navigation/MinimalBackNav'
import InternalLink from '../components/InternalLink'
import SeoHead from '../components/SeoHead'
import { Button, Page } from '../components/ui'
import { getSiteOrigin } from '../utils/seo'
import '../design/misc.css'

const aboutHighlights: Array<{ title: string; body: string; icon: PhosphorIcon }> = [
  {
    title: 'Discover places around the Philippines',
    body: 'GalaTayo helps people browse places to visit for dates, barkada hangouts, family plans, chill days, and everyday gala ideas.',
    icon: Compass,
  },
  {
    title: 'Plan your next gala',
    body: 'You can search places, build gala plans, and save ideas for later without changing how you already explore the app.',
    icon: CalendarPlus,
  },
  {
    title: 'Use AI-powered help',
    body: 'GalaTayo AI features can help you narrow down ideas, while place pages stay focused on clear location and planning details.',
    icon: Sparkle,
  },
]

const curationStandards: Array<{ title: string; body: string }> = [
  {
    title: 'Gala-worthy only',
    body: 'Every place is scored on real evidence: editorial lists, Philippine travel apps, Reddit threads, social buzz, review volume and Michelin, plus how well it fits a day out. Places you could find on any map app, like plain eateries, chains, ordinary malls and hotels, stay out of lists, search, AI picks and the sitemap.',
  },
  {
    title: 'Food that is worth the trip',
    body: 'The dining we keep is destination-level: Michelin and top restaurants, iconic food experiences, food markets and food streets.',
  },
  {
    title: 'No fake reviews',
    body: "Ratings and reviews come only from real visitors. Notes from our team are labelled Editor's note and never count as a review or a rating, so a place shows no rating until someone has actually been there.",
  },
  {
    title: 'Know before you go',
    body: 'Place pages carry the practical stuff: budget per head, best time to visit, parking, accessibility notes and who a place is not ideal for. Reports about unsafe, wrong or closed places go to our moderation queue, and safety reports are handled first.',
  },
  {
    title: 'Credited photos',
    body: "HD photos list their author, licence and source, such as Wikimedia Commons, on each place page. If one is yours, tell us through Feedback and we'll fix the credit or take it down.",
  },
]

function AboutPage() {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      name: 'About GalaTayo | Place discovery around the Philippines',
      description: 'What GalaTayo is and how we pick places: gala-worthy only, scored on real evidence, no fake reviews and credited photos.',
      url: `${getSiteOrigin()}/about`,
      mainEntity: { '@id': `${getSiteOrigin()}/#organization` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${getSiteOrigin()}/` },
        { '@type': 'ListItem', position: 2, name: 'About', item: `${getSiteOrigin()}/about` },
      ],
    },
  ]

  return (
    <Page narrow>
      <SeoHead
        title="About GalaTayo | Place discovery around the Philippines"
        description="What GalaTayo is and how we pick places: gala-worthy only, scored on real evidence, no fake reviews and credited photos."
        canonicalPath="/about"
        jsonLd={jsonLd}
      />
      <MinimalBackNav to="/home" label="Home" preferHistory={false} />

      <article className="mt-2">
        <header className="m-art-head">
          <span className="m-art-ic" aria-hidden="true">
            <MapTrifold weight="light" />
          </span>
          <p className="m-onb-step">About</p>
          <h1 className="g-h1 mt-1.5">About GalaTayo</h1>
          <p className="g-mut mt-3 max-w-[60ch] text-[16px] leading-relaxed">
            &ldquo;Gala tayo&rdquo; means &ldquo;let&apos;s go out&rdquo;. That&apos;s the whole idea.{' '}
            <InternalLink href="/gala-tayo-meaning" className="underline underline-offset-[3px]">
              More on what it means
            </InternalLink>
          </p>
        </header>

        <div className="m-prose mt-6 max-w-[65ch]">
          <p>
            GalaTayo, also written Gala Tayo, is a place discovery and planning app built to help people find gala-worthy spots around the Philippines,
            browse public place pages, and map out their next gala.
          </p>
          <p className="g-mut">
            The name comes from the Filipino phrase &ldquo;gala tayo&rdquo;, which means &ldquo;let&apos;s go out&rdquo;. GalaTayo launched in July 2026 and is built in
            the Philippines. It is free to use, and every place page is public so you can share it with the barkada without signing in.
          </p>
        </div>

        <h2 className="g-h2 mt-12">What GalaTayo helps you do</h2>
        <div className="m-feat mt-5">
          {aboutHighlights.map(({ title, body, icon: Icon }) => (
            <section key={title}>
              <Icon weight="light" aria-hidden="true" />
              <h3 className="g-h3 mt-3">{title}</h3>
              <p className="g-sm g-mut mt-1 leading-relaxed">{body}</p>
            </section>
          ))}
        </div>

        <h2 className="g-h2 mt-12">From Metro Manila to the provinces</h2>
        <p className="m-prose mt-3 max-w-[65ch]">
          GalaTayo started with the 17 cities of Metro Manila and now covers destinations around the Philippines, from Baguio and La Union
          to Cebu, Bohol, Palawan and Siargao. Every city has its own area page, and place URLs stay the same as new regions are added.
        </p>

        <section id="curation" aria-labelledby="about-curation" className="mt-12 scroll-mt-24">
          <h2 id="about-curation" className="g-h2">
            About our curation
          </h2>
          <div className="m-prose mt-3 max-w-[65ch]">
            {curationStandards.map(({ title, body }) => (
              <div key={title}>
                <h3 className="g-h3 mt-6">{title}</h3>
                <p className="mt-1">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-8 flex flex-wrap gap-2 border-t border-[var(--line-2)] pt-8">
          <Button variant="tara" size="lg" href="/places">
            Browse places
          </Button>
          <Button variant="line" size="lg" href="/saan-tayo">
            Saan tayo?
          </Button>
        </div>
      </article>
    </Page>
  )
}

export default AboutPage
