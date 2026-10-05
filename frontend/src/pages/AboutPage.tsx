import MinimalBackNav from '../components/navigation/MinimalBackNav'
import SeoHead from '../components/SeoHead'
import { Button, Page } from '../components/ui'
import { getSiteOrigin } from '../utils/seo'

const aboutHighlights = [
  {
    title: 'Discover Metro Manila places',
    body: 'GalaTayo helps people browse places to visit for dates, barkada hangouts, family plans, chill days, and everyday gala ideas.',
  },
  {
    title: 'Plan your next gala',
    body: 'You can search places, build gala plans, and save ideas for later without changing how you already explore the app.',
  },
  {
    title: 'Use AI-powered help',
    body: 'GalaTayo AI features can help you narrow down ideas, while place pages stay focused on clear location and planning details.',
  },
]

function AboutPage() {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      name: 'About GalaTayo | Metro Manila place discovery',
      description: 'Learn about GalaTayo and how it helps people discover places, plan gala ideas, and explore Metro Manila.',
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
        title="About GalaTayo | Metro Manila place discovery"
        description="Learn about GalaTayo and how it helps people discover places, plan gala ideas, and explore Metro Manila."
        canonicalPath="/about"
        jsonLd={jsonLd}
      />
      <MinimalBackNav to="/home" label="Home" preferHistory={false} />

      <article className="mt-2 max-w-[65ch] text-[16px] leading-[1.7]">
        <p className="g-eyebrow">About</p>
        <h1 className="g-h1 mt-2">About GalaTayo</h1>
        <p className="mt-4">
          GalaTayo, also written Gala Tayo, is a Metro Manila place discovery and planning app built to help people find hangout spots,
          browse public place pages, and map out their next gala.
        </p>
        <p className="g-mut mt-3">
          The name comes from the Filipino phrase "gala tayo", which means "let's go out". GalaTayo launched in July 2026 and is built in
          the Philippines. It is free to use, and every place page is public so you can share it with the barkada without signing in.
        </p>

        <h2 className="g-h2 mt-10">What GalaTayo helps you do</h2>
        <div className="mt-4 grid gap-3">
          {aboutHighlights.map((item) => (
            <section key={item.title} className="g-panel">
              <h3 className="g-h3">{item.title}</h3>
              <p className="g-sm g-mut mt-1 leading-relaxed">{item.body}</p>
            </section>
          ))}
        </div>

        <h2 className="g-h2 mt-10">Metro Manila focus</h2>
        <p className="mt-3">
          GalaTayo focuses on Metro Manila places and area pages so browse routes, canonical place URLs, and planning links stay clear and
          consistent across the app.
        </p>

        <Button variant="ink" href="/places" className="mt-8">
          Browse places
        </Button>
      </article>
    </Page>
  )
}

export default AboutPage
