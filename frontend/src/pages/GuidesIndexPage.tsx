import { CaretRight } from '@phosphor-icons/react/dist/csr/CaretRight'
import { getCategoryIcon } from '../components/PlaceCard'
import { ListingBreadcrumb } from '../components/home/search/SearchComponents'
import InternalLink from '../components/InternalLink'
import SeoHead from '../components/SeoHead'
import { Page, SectionHead } from '../components/ui'
import { getAreaLabelBySlug } from '../data/destinations'
import { getSiteOrigin } from '../utils/seo'
import { BRAND_NAME, SEO_LANDING_TARGETS } from '../utils/seoLandingPages'

const AROUND_PH = 'Around the Philippines'

function groupGuidesByArea() {
  const groups = new Map<string, typeof SEO_LANDING_TARGETS>()
  for (const guide of SEO_LANDING_TARGETS) {
    const area = guide.displayAreaName || getAreaLabelBySlug(guide.areaSlug) || AROUND_PH
    groups.set(area, [...(groups.get(area) ?? []), guide])
  }
  return [...groups.entries()].sort(([left, leftGuides], [right, rightGuides]) => {
    if (left === AROUND_PH) return 1
    if (right === AROUND_PH) return -1
    return rightGuides.length - leftGuides.length || left.localeCompare(right)
  })
}

function GuidesIndexPage() {
  const groups = groupGuidesByArea()
  const origin = getSiteOrigin()
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `Gala guides | ${BRAND_NAME}`,
      url: `${origin}/guides`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: SEO_LANDING_TARGETS.map((guide, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: guide.label,
        url: `${origin}/guides/${encodeURIComponent(guide.slug)}`,
      })),
    },
  ]

  return (
    <Page narrow>
      <SeoHead
        title={`Gala Guides: Where to Go Around the Philippines | ${BRAND_NAME}`}
        description={`${SEO_LANDING_TARGETS.length} ${BRAND_NAME} guides to cafes, food trips, date spots, museums and things to do, each with budgets per head and real place details.`}
        canonicalPath="/guides"
        jsonLd={jsonLd}
      />
      <ListingBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Guides' }]} />
      <header className="mt-5">
        <h1 className="g-h1">Gala guides</h1>
        <p className="g-mut mt-2 max-w-[44ch]">Short lists of where to go, with the budget per head on every pick.</p>
      </header>

      {groups.map(([area, guides]) => (
        <section key={area}>
          <SectionHead title={area} />
          <ul className="g-group">
            {guides.map((guide) => {
              const Icon = getCategoryIcon(guide.category)
              return (
                <li key={guide.slug}>
                  <InternalLink href={`/guides/${guide.slug}`} className="g-group-row">
                    <Icon weight="duotone" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{guide.label}</span>
                    <CaretRight className="g-ic text-[var(--ink-3)]" aria-hidden="true" />
                  </InternalLink>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </Page>
  )
}

export default GuidesIndexPage
