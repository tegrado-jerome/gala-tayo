import { useEffect, useState } from 'react'
import { ListingBreadcrumb } from '../components/home/search/SearchComponents'
import InternalLink from '../components/InternalLink'
import SeoHead from '../components/SeoHead'
import { Page, SectionHead } from '../components/ui'
import { METRO_MANILA_REGION_SLUG, getAreaLabelBySlug } from '../data/destinations'
import { resizedMediaUrl } from '../data/r2Config'
import '../design/misc.css'
import { getPlaceCardPhoto } from '../utils/placeGalleryPhotos'
import { getSiteOrigin } from '../utils/seo'
import { BRAND_NAME, MIN_INDEXABLE_GUIDE_PLACES, SEO_LANDING_TARGETS, getRegionSlugForArea, type SeoLandingTarget } from '../utils/seoLandingPages'

const AROUND_PH = 'Around the Philippines'

type GuidePhoto = { url: string; alt: string }
/** Written by the static listings build: each guide's place count and its top places. */
type GuideSummary = { slug: string; total: number; topPlaces: Array<{ slug: string; name: string; imageUrl: string | null }> }

/** One photo per guide, skipping photos an earlier card already uses, so the grid doesn't repeat Fort Santiago. */
function pickGuidePhotos(guides: SeoLandingTarget[], summaries: Record<string, GuideSummary> | null) {
  const used = new Set<string>()
  const photos: Record<string, GuidePhoto> = {}
  for (const guide of guides) {
    const candidates = (summaries?.[guide.slug]?.topPlaces ?? [])
      .map((place) => ({ url: getPlaceCardPhoto(place.slug) || resizedMediaUrl(place.imageUrl, 'card'), alt: place.name }))
      .filter((photo): photo is GuidePhoto => Boolean(photo.url))
    const photo = candidates.find((candidate) => !used.has(candidate.url)) ?? candidates[0]
    if (photo) {
      used.add(photo.url)
      photos[guide.slug] = photo
    }
  }
  return photos
}

/** Two shelves: Metro Manila, then everywhere else; biggest guides first within each. */
function groupGuides(guides: SeoLandingTarget[], summaries: Record<string, GuideSummary> | null) {
  const bySize = [...guides].sort((left, right) => (summaries?.[right.slug]?.total ?? 0) - (summaries?.[left.slug]?.total ?? 0))
  const isMetro = (guide: SeoLandingTarget) => getRegionSlugForArea(guide.areaSlug) === METRO_MANILA_REGION_SLUG
  return [
    [getAreaLabelBySlug(METRO_MANILA_REGION_SLUG) ?? 'Metro Manila', bySize.filter(isMetro)],
    [AROUND_PH, bySize.filter((guide) => !isMetro(guide))],
  ] as const
}

function GuideCard({ guide, summary, photo }: { guide: SeoLandingTarget; summary?: GuideSummary; photo?: GuidePhoto }) {
  return (
    <li>
      <InternalLink href={`/guides/${guide.slug}`} className="m-guide-card">
        <span className="m-guide-photo">{photo ? <img src={photo.url} alt={photo.alt} loading="lazy" decoding="async" /> : null}</span>
        <span className="g-h3 mt-2 block">{guide.label}</span>
        <span className="g-xs g-mut">{[guide.displayAreaName || getAreaLabelBySlug(guide.areaSlug), summary ? `${summary.total} places` : null].filter(Boolean).join(' · ')}</span>
      </InternalLink>
    </li>
  )
}

function GuidesIndexPage() {
  const [summaries, setSummaries] = useState<Record<string, GuideSummary> | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/data/place-listings/guides.json', { signal: controller.signal })
      .then((response) => (response.ok && (response.headers.get('content-type') || '').includes('json') ? (response.json() as Promise<GuideSummary[]>) : null))
      .then((list) => setSummaries(list ? Object.fromEntries(list.map((summary) => [summary.slug, summary])) : null))
      .catch(() => setSummaries(null))
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })
    return () => controller.abort()
  }, [])

  // Thin guides are noindex, so the index only shows guides with enough places (all of them when counts are unavailable).
  const guides = summaries ? SEO_LANDING_TARGETS.filter((guide) => (summaries[guide.slug]?.total ?? 0) >= MIN_INDEXABLE_GUIDE_PLACES) : SEO_LANDING_TARGETS
  const groups = groupGuides(guides, summaries).filter(([, shelf]) => shelf.length > 0)
  const photos = pickGuidePhotos(groups.flatMap(([, shelf]) => shelf), summaries)
  const origin = getSiteOrigin()
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `Travel guides | ${BRAND_NAME}`,
      url: `${origin}/guides`,
      isPartOf: { '@id': `${origin}/#website` },
      mainEntity: { '@id': `${origin}/guides#list` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: 'Guides', item: `${origin}/guides` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      '@id': `${origin}/guides#list`,
      itemListElement: guides.map((guide, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: guide.label,
        url: `${origin}/guides/${encodeURIComponent(guide.slug)}`,
      })),
    },
  ]

  return (
    <Page>
      <SeoHead
        title={`Travel Guides: Where to Go Around the Philippines | ${BRAND_NAME}`}
        description={`${guides.length} ${BRAND_NAME} guides to date ideas, weekend getaways, food trips and things to do, each with budgets per head and real place details.`}
        canonicalPath="/guides"
        jsonLd={isLoading ? null : jsonLd}
      />
      <ListingBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Guides' }]} />
      <header className="mt-5">
        <h1 className="g-h1">Travel guides</h1>
        <p className="g-mut mt-2 max-w-[52ch]">Short lists of where to go, ranked best first, with the budget per head on every pick.</p>
        <p className="g-sm mt-3">
          Planning ahead?{' '}
          <InternalLink href="/long-weekends-2027-philippines" className="font-semibold underline underline-offset-[3px]">
            Long weekends 2027 and where to go
          </InternalLink>
        </p>
      </header>

      {isLoading ? (
        <div aria-busy="true" className="m-hero g-skel" />
      ) : (
        groups.map(([area, areaGuides]) => (
          <section key={area}>
            <SectionHead title={area} />
            <ul className="m-guide-grid">
              {areaGuides.map((guide) => (
                <GuideCard key={guide.slug} guide={guide} summary={summaries?.[guide.slug]} photo={photos[guide.slug]} />
              ))}
            </ul>
          </section>
        ))
      )}
    </Page>
  )
}

export default GuidesIndexPage
