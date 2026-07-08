import AppHeader from '../components/AppHeader'
import MinimalBackNav from '../components/MinimalBackNav'
import SeoHead from '../components/SeoHead'
import { PageContainer, PageShell, ResponsiveGrid, CardSurface, ChibiIllustration } from '../components/layout/ResponsiveLayouts'
import aboutChibi from '../assets/chibis/trust-pages/chibi-about.webp'
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
    body: 'Ask AI features can help you narrow down ideas, while place pages stay focused on clear location and planning details.',
  },
]

function AboutPage() {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      name: 'About GalaTayo',
      description: 'Learn about GalaTayo and how it helps people discover places, plan gala ideas, and explore Metro Manila.',
      url: `${getSiteOrigin()}/about`,
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
    <PageShell>
      <SeoHead
        title="About GalaTayo"
        description="Learn about GalaTayo and how it helps people discover places, plan gala ideas, and explore Metro Manila."
        canonicalPath="/about"
        jsonLd={jsonLd}
      />
      <AppHeader />

      <main className="w-full pb-12 pt-4 sm:pb-14 sm:pt-5 lg:py-10">
        <PageContainer size="default">
          <div className="mb-5">
            <MinimalBackNav to="/" label="Home" preferHistory={false} />
          </div>

          <CardSurface pad="loose" className="shadow-[0_18px_42px_rgba(47,116,232,0.1)]">
            <header className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">About</p>
                <h1 className="mt-2 text-3xl font-black leading-tight text-slate-950 sm:text-4xl">About GalaTayo</h1>
                <p className="mt-4 text-sm font-semibold leading-7 text-slate-700">
                  GalaTayo is a Metro Manila place discovery and planning app built to help people find hangout spots, browse public place pages,
                  and map out their next gala.
                </p>
              </div>

              <div className="flex items-center justify-center">
                <ChibiIllustration src={aboutChibi} alt="About GalaTayo illustration" variant="feature" priority />
              </div>
            </header>

            <section className="mt-8">
              <h2 className="text-xl font-black text-slate-950">What GalaTayo helps you do</h2>
              <ResponsiveGrid cols={3} gap="default" className="mt-4">
                {aboutHighlights.map((item) => (
                  <CardSurface key={item.title} tone="soft" pad="default" className="rounded-3xl">
                    <h3 className="text-base font-black text-slate-950">{item.title}</h3>
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">{item.body}</p>
                  </CardSurface>
                ))}
              </ResponsiveGrid>
            </section>

            <section className="mt-8">
              <h2 className="text-xl font-black text-slate-950">Metro Manila focus</h2>
              <p className="mt-3 text-sm font-semibold leading-7 text-slate-700">
                GalaTayo focuses on Metro Manila places and area pages so browse routes, canonical place URLs, and planning links stay clear and
                consistent across the app.
              </p>
            </section>
          </CardSurface>
        </PageContainer>
      </main>
    </PageShell>
  )
}

export default AboutPage
