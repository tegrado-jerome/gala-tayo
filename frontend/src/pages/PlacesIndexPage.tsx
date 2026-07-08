import { ArrowRight, Building2, Compass, House, LayoutGrid, MapPinned } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import InternalLink from '../components/InternalLink'
import Breadcrumb from '../components/Breadcrumb'
import SeoHead from '../components/SeoHead'
import { PageContainer, PageShell, ResponsiveGrid } from '../components/layout/ResponsiveLayouts'
import { metroManilaAreas } from '../data/metroManilaAreas'
import { getSiteOrigin } from '../utils/seo'

function PlacesIndexPage() {
  const areaCards = [...metroManilaAreas].sort((left, right) => left.name.localeCompare(right.name))

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Places to Visit | GalaTayo',
      description: 'Browse Metro Manila cities and jump straight into area pages on GalaTayo.',
      url: `${getSiteOrigin()}/places`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${getSiteOrigin()}/` },
        { '@type': 'ListItem', position: 2, name: 'Places', item: `${getSiteOrigin()}/places` },
      ],
    },
  ]

  return (
    <PageShell>
      <SeoHead
        title="Places to Visit | GalaTayo"
        description="Browse Metro Manila cities and jump straight into area pages on GalaTayo."
        canonicalPath="/places"
        jsonLd={jsonLd}
      />
      <AppHeader minimal />

      <main className="w-full pb-12 pt-5 sm:pb-14">
        <PageContainer className="px-4 sm:px-6 lg:px-8">
        <Breadcrumb
          showBack
          items={[
            { label: 'Home', href: '/', icon: <House className="h-3.5 w-3.5" /> },
            { label: 'Places', icon: <MapPinned className="h-3.5 w-3.5" /> },
          ]}
        />

        <section className="mt-5">
          <div className="flex items-center gap-2.5 text-[var(--accent)]">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
              <Compass className="h-4 w-4" strokeWidth={2} />
            </span>
            <span className="inline-flex rounded-full border border-[#DBEAFE] bg-[var(--surface-alt)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
              Metro Manila
            </span>
          </div>
          <div className="mt-4 max-w-[42rem]">
            <h1 className="text-[2rem] font-black leading-tight tracking-[-0.04em] text-[var(--text-main)] sm:text-[2.4rem]">
              Places to visit
            </h1>
            <p className="mt-3 text-[15px] leading-7 text-[var(--muted)]">
              Pick a city first, then head into its area page to browse places there.
            </p>
          </div>
        </section>

        <ResponsiveGrid className="mt-8 gap-3">
          <InternalLink
            href="/places/categories"
            className="group block rounded-3xl border border-[#E5E7EB] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(17,24,39,0.04)] transition hover:-translate-y-0.5 hover:border-[#DBEAFE] hover:shadow-[0_14px_32px_rgba(30,58,138,0.08)]"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-alt)] text-[#475569] transition group-hover:bg-[var(--accent-soft)] group-hover:text-[var(--accent)]">
                  <LayoutGrid className="h-4 w-4" strokeWidth={1.9} />
                </span>
                <div className="min-w-0">
                  <p className="text-[1.05rem] font-black tracking-[-0.02em] text-[var(--text-main)]">Categories</p>
                  <div className="mt-1 flex items-center gap-1.5 text-[13px] text-[var(--muted)]">
                    <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-[#94A3B8]" strokeWidth={1.9} />
                    <span className="truncate">Browse place categories</span>
                  </div>
                </div>
              </div>
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-alt)] text-[#64748B] transition group-hover:bg-[var(--accent-soft)] group-hover:text-[var(--accent)]">
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} />
              </span>
            </div>
          </InternalLink>
        </ResponsiveGrid>

        <section className="mt-8">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-black tracking-[-0.03em] text-[var(--text-main)]">Cities</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">A simple city list to help you move around faster.</p>
            </div>
          </div>
          <ResponsiveGrid className="mt-4 gap-3">
            {areaCards.map((area) => (
              <InternalLink
                key={area.slug}
                href={`/places/${area.slug}`}
                className="group block rounded-3xl border border-[#E5E7EB] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(17,24,39,0.04)] transition hover:-translate-y-0.5 hover:border-[#DBEAFE] hover:shadow-[0_14px_32px_rgba(30,58,138,0.08)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-alt)] text-[#475569] transition group-hover:bg-[var(--accent-soft)] group-hover:text-[var(--accent)]">
                      <Building2 className="h-4 w-4" strokeWidth={1.9} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[1.05rem] font-black tracking-[-0.02em] text-[var(--text-main)]">{area.name}</p>
                      <div className="mt-1 flex items-center gap-1.5 text-[13px] text-[var(--muted)]">
                        <MapPinned className="h-3.5 w-3.5 shrink-0 text-[#94A3B8]" strokeWidth={1.9} />
                        <span className="truncate">Open {area.name} places</span>
                      </div>
                    </div>
                  </div>
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-alt)] text-[#64748B] transition group-hover:bg-[var(--accent-soft)] group-hover:text-[var(--accent)]">
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} />
                  </span>
                </div>
              </InternalLink>
            ))}
          </ResponsiveGrid>
        </section>
        </PageContainer>
      </main>
    </PageShell>
  )
}

export default PlacesIndexPage
