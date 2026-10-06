import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { CalendarPlus } from '@phosphor-icons/react/dist/csr/CalendarPlus'
import { Compass } from '@phosphor-icons/react/dist/csr/Compass'
import { MapTrifold } from '@phosphor-icons/react/dist/csr/MapTrifold'
import { Sparkle } from '@phosphor-icons/react/dist/csr/Sparkle'
import MinimalBackNav from '../components/navigation/MinimalBackNav'
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

function AboutPage() {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      name: 'About GalaTayo | Place discovery around the Philippines',
      description: 'Learn about GalaTayo and how it helps people discover places, plan gala ideas, and explore the Philippines.',
      url: `${getSiteOrigin()}/about`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${getSiteOrigin()}/home` },
        { '@type': 'ListItem', position: 2, name: 'About', item: `${getSiteOrigin()}/about` },
      ],
    },
  ]

  return (
    <Page narrow>
      <SeoHead
        title="About GalaTayo | Place discovery around the Philippines"
        description="Learn about GalaTayo and how it helps people discover places, plan gala ideas, and explore the Philippines."
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
            &ldquo;Gala tayo&rdquo; means &ldquo;let&apos;s go out&rdquo;. That&apos;s the whole idea.
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
