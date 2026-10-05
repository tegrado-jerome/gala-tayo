import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Sparkles } from 'lucide-react'
import PlaceCard, { withLiveDetail } from '../components/PlaceCard'
import { ListingBreadcrumb } from '../components/home/search/SearchComponents'
import { useGuestAuthPrompt } from '../components/GuestAuthPrompt'
import PlaceListingSkeleton from '../components/PlaceListingSkeleton'
import { Button, Empty, KeyValue, Page, Panel, Row, SectionHead } from '../components/ui'
import SeoHead from '../components/SeoHead'
import { openFloatingChat } from '../utils/floatingChat'
import { fetchPlaceDetailsBatch } from '../utils/placeDetailCache'
import { getAreaLabelBySlug } from '../data/metroManilaAreas'
import { getPlaceCategoryLabel } from '../data/placeCategories'
import { getSiteOrigin } from '../utils/seo'
import { getSeoListingPage, mapSeoPlaceToCard, type SeoPlaceSummary } from '../utils/seoApi'
import { BRAND_NAME, PRODUCT_NAME, SEO_LANDING_TARGETS, buildLandingMetadata, getLandingTargetBySlug } from '../utils/seoLandingPages'
import type { PlaceDetail } from '../types/appTypes'

function LandingFaqJsonLd({ faqs }: { faqs: Array<{ question: string; answer: string }> }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  }
}

export default function SeoLandingPage({
  slug,
}: {
  slug: string
  navigationSource?: 'push' | 'replace' | 'pop'
}) {
  const listingGuestAuth = useGuestAuthPrompt()
  const target = useMemo(() => getLandingTargetBySlug(slug), [slug])
  const metadata = useMemo(() => (target ? buildLandingMetadata(target) : null), [target])
  const [items, setItems] = useState<SeoPlaceSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [placeDetailsBySlug, setPlaceDetailsBySlug] = useState<Record<string, PlaceDetail>>({})

  useEffect(() => {
    if (!target) {
      setIsLoading(false)
      setErrorMessage('Guide not found.')
      return
    }

    const controller = new AbortController()

    const load = async () => {
      try {
        setIsLoading(true)
        setErrorMessage(null)
        const payload = await getSeoListingPage({
          areaSlug: target.areaSlug ?? null,
          category: target.category ?? null,
          goodFor: target.goodFor ?? null,
          page: 1,
          pageSize: 12,
          signal: controller.signal,
        })

        if (controller.signal.aborted) {
          return
        }

        setItems(payload.items)
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return
        }

        setErrorMessage(error instanceof Error ? error.message : 'Failed to load this guide.')
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    void load()
    return () => controller.abort()
  }, [target])

  useEffect(() => {
    const slugs = Array.from(new Set(items.map((item) => item.slug).filter(Boolean)))
    if (slugs.length === 0) {
      setPlaceDetailsBySlug({})
      return
    }

    let isActive = true
    void fetchPlaceDetailsBatch(slugs)
      .then((details) => {
        if (!isActive) {
          return
        }

        setPlaceDetailsBySlug(Object.fromEntries(details.map((detail) => [detail.slug, detail])))
      })
      .catch(() => {
        if (isActive) {
          setPlaceDetailsBySlug({})
        }
      })

    return () => {
      isActive = false
    }
  }, [items])

  if (!target || !metadata) {
    return (
      <Page>
        <SeoHead title={`Guide Not Found | ${PRODUCT_NAME}`} robots="noindex,follow" />
        <h1 className="g-h1">Guide not found</h1>
        <p className="g-mut mt-2">Baka na-move na ito. Try browsing places instead.</p>
        <Button variant="line" href="/places" className="mt-5">
          Browse places
        </Button>
      </Page>
    )
  }

  const areaName = target.displayAreaName || getAreaLabelBySlug(target.areaSlug) || 'Metro Manila'
  const categoryLabel = target.category ? getPlaceCategoryLabel(target.category) : null
  const relatedTargets = SEO_LANDING_TARGETS.filter((candidate) => candidate.slug !== target.slug).slice(0, 4)
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: metadata.h1,
      description: metadata.description,
      url: `${getSiteOrigin()}${metadata.canonicalPath}`,
      keywords: metadata.keywords.join(', '),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${getSiteOrigin()}/home` },
        { '@type': 'ListItem', position: 2, name: 'Places', item: `${getSiteOrigin()}/places` },
        { '@type': 'ListItem', position: 3, name: metadata.h1, item: `${getSiteOrigin()}${metadata.canonicalPath}` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: items.map((place, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${getSiteOrigin()}${place.canonicalPath}`,
        name: place.name,
      })),
    },
    LandingFaqJsonLd({ faqs: metadata.faqs }),
  ]

  const askAiQuestion = `Help me pick from ${metadata.h1}`

  return (
    <Page>
      <SeoHead title={metadata.title} description={metadata.description} canonicalPath={metadata.canonicalPath} jsonLd={jsonLd} />

      <ListingBreadcrumb items={[{ label: 'Home', href: '/home' }, { label: 'Places', href: '/places' }, { label: metadata.h1 }]} />

      <header className="mt-5 max-w-[46rem]">
        <p className="g-eyebrow">{BRAND_NAME} guide</p>
        <h1 className="g-h1 mt-2">{metadata.h1}</h1>
        <p className="g-mut mt-3">{metadata.intro}</p>
      </header>

      <Panel className="mt-6 max-w-[46rem]">
        <KeyValue
          items={[
            { label: 'Area', value: areaName },
            { label: 'Category', value: categoryLabel || 'Mixed discovery' },
            { label: 'Good for', value: metadata.summary },
          ]}
        />
      </Panel>

      <SectionHead
        title="Recommended places"
        sub={`Picks from ${PRODUCT_NAME} that fit this guide.`}
        action={
          <Button variant="soft" size="sm" onClick={() => openFloatingChat(askAiQuestion)}>
            <Sparkles aria-hidden="true" />
            Ask AI
          </Button>
        }
      />

      {isLoading ? (
        <PlaceListingSkeleton cardCount={8} helperText={`Loading ${metadata.h1.toLowerCase()}.`} />
      ) : errorMessage ? (
        <Empty title="Hindi ma-load ang guide" description={errorMessage} />
      ) : items.length === 0 ? (
        <Empty
          title="Wala pang matching places"
          description="We'll keep this guide updated as more places are added."
          action={
            <Button variant="soft" onClick={() => openFloatingChat(askAiQuestion)}>
              <Sparkles aria-hidden="true" />
              Ask AI instead
            </Button>
          }
        />
      ) : (
        <div className="g-grid">
          {items.map((rawPlace) => (
            <PlaceCard
              key={rawPlace.id}
              place={withLiveDetail({ ...mapSeoPlaceToCard(rawPlace), budget_min: rawPlace.budgetMin, good_for: rawPlace.goodFor }, placeDetailsBySlug[rawPlace.slug])}
              onGuestSave={() => listingGuestAuth.open('favorite')}
            />
          ))}
        </div>
      )}

      <div className="g-split mt-12">
        <section aria-labelledby="guide-faq-title" className="min-w-0">
          <h2 id="guide-faq-title" className="g-h2">
            Quick answers
          </h2>
          <div className="g-list mt-4">
            {metadata.faqs.map((faq) => (
              <Panel as="article" key={faq.question}>
                <h3 className="g-h3">{faq.question}</h3>
                <p className="g-sm g-mut mt-2">{faq.answer}</p>
              </Panel>
            ))}
          </div>
        </section>

        <aside aria-labelledby="guide-related-title" className="g-side">
          <h2 id="guide-related-title" className="g-h2">
            Related guides
          </h2>
          <div className="g-list">
            {relatedTargets.map((relatedTarget) => (
              <Row key={relatedTarget.slug} href={`/guides/${relatedTarget.slug}`} action={<ChevronRight className="g-ic text-[var(--ink-3)]" aria-hidden="true" />}>
                <div className="g-h3 truncate">{relatedTarget.label}</div>
                <div className="g-xs g-mut truncate">{relatedTarget.keywords.slice(0, 2).join(' · ')}</div>
              </Row>
            ))}
          </div>
        </aside>
      </div>
      {listingGuestAuth.promptElement}
    </Page>
  )
}
