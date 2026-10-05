import { useEffect, useMemo, useState } from 'react'
import { CaretRight as ChevronRight } from '@phosphor-icons/react/dist/csr/CaretRight'
import { CaretDown } from '@phosphor-icons/react/dist/csr/CaretDown'
import { CalendarCheck } from '@phosphor-icons/react/dist/csr/CalendarCheck'
import { ListNumbers } from '@phosphor-icons/react/dist/csr/ListNumbers'
import { MapPin } from '@phosphor-icons/react/dist/csr/MapPin'
import { Shuffle } from '@phosphor-icons/react/dist/csr/Shuffle'
import { Wallet } from '@phosphor-icons/react/dist/csr/Wallet'
import PlaceCard, { getCategoryIcon, withLiveDetail } from '../components/PlaceCard'
import { ListingBreadcrumb, MasonrySkeleton } from '../components/home/search/SearchComponents'
import { useGuestAuthPrompt } from '../components/GuestAuthPrompt'
import { Button, Empty, Page, Row, SectionHead } from '../components/ui'
import '../design/misc.css'
import SeoHead from '../components/SeoHead'
import { fetchPlaceDetailsBatch } from '../utils/placeDetailCache'
import { getAreaLabelBySlug } from '../data/destinations'
import { getPlaceCategoryLabel } from '../data/placeCategories'
import { getSiteOrigin } from '../utils/seo'
import { getSeoListingPage, mapSeoPlaceToCard, type SeoPlaceSummary } from '../utils/seoApi'
import { BRAND_NAME, MIN_INDEXABLE_GUIDE_PLACES, PRODUCT_NAME, buildLandingMetadata, getLandingTargetBySlug, getRelatedLandingTargets } from '../utils/seoLandingPages'
import { formatPeso } from '../utils/galaPlanTrip'
import type { PlaceDetail } from '../types/appTypes'
import { resizedMediaUrl } from '../data/r2Config'

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
  const [total, setTotal] = useState(0)
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
          pageSize: 10,
          signal: controller.signal,
        })

        if (controller.signal.aborted) {
          return
        }

        setItems(payload.items)
        setTotal(payload.total)
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

  const areaName = target.displayAreaName || getAreaLabelBySlug(target.areaSlug) || 'the Philippines'
  const categoryLabel = target.category ? getPlaceCategoryLabel(target.category) : null
  const relatedTargets = getRelatedLandingTargets(target)
  const seeAllHref = target.goodFor
    ? null
    : target.category && target.areaSlug
      ? `/places/${target.areaSlug}?category=${target.category}`
      : target.category
        ? `/places/categories/${target.category}`
        : target.areaSlug
          ? `/places/${target.areaSlug}`
          : null
  const isThin = !isLoading && !errorMessage && total < MIN_INDEXABLE_GUIDE_PLACES
  const budgets = items.map((item) => item.budgetMin).filter((value): value is number => typeof value === 'number' && value > 0)
  const minBudget = budgets.length ? Math.min(...budgets) : 0
  const maxBudget = budgets.length ? Math.max(...budgets) : 0
  const budgetRange = !budgets.length ? 'Varies per place' : minBudget === maxBudget ? `${formatPeso(minBudget)} per head` : `${formatPeso(minBudget)} to ${formatPeso(maxBudget)} per head`
  const latestUpdate = items.map((item) => item.updatedAt).filter((value): value is string => Boolean(value)).sort().at(-1)
  const updatedLabel = latestUpdate ? new Date(latestUpdate).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }) : null
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

  const CategoryIcon = getCategoryIcon(target.category ?? null)
  const heroPlace = items.find((item) => item.imageUrl)
  const facts = [
    { icon: MapPin, label: areaName },
    { icon: CategoryIcon, label: categoryLabel || 'Mixed discovery' },
    isLoading ? null : { icon: ListNumbers, label: `${total} ${total === 1 ? 'place' : 'places'}` },
    isLoading ? null : { icon: Wallet, label: budgets.length ? budgetRange : 'Budget varies' },
    updatedLabel ? { icon: CalendarCheck, label: `Updated ${updatedLabel}` } : null,
  ].filter((fact): fact is { icon: typeof MapPin; label: string } => Boolean(fact))

  return (
    <Page>
      <SeoHead title={metadata.title} description={metadata.description} canonicalPath={metadata.canonicalPath} robots={isThin ? 'noindex,follow' : undefined} jsonLd={jsonLd} />

      <ListingBreadcrumb items={[{ label: 'Home', href: '/home' }, { label: 'Places', href: '/places' }, { label: metadata.h1 }]} />

      <article>
        <header className="mt-5 max-w-[46rem]">
          <p className="m-onb-step">{BRAND_NAME} guide</p>
          <h1 className="g-h1 mt-1.5 md:text-[40px]">{metadata.h1}</h1>
          <p className="g-mut mt-3 text-[16px] leading-relaxed">{metadata.intro}</p>
        </header>

        <ul className="m-facts" aria-label="Guide facts">
          {facts.map(({ icon: Icon, label }) => (
            <li key={label}>
              <Icon aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>

        {heroPlace?.imageUrl ? (
          <figure>
            <div className="m-hero">
              <img src={resizedMediaUrl(heroPlace.imageUrl, 'hero')} alt={heroPlace.name} fetchPriority="high" decoding="async" />
            </div>
            <figcaption className="m-caption">Pictured: {heroPlace.name}</figcaption>
          </figure>
        ) : isLoading ? (
          <div className="m-hero g-skel" aria-hidden="true" />
        ) : null}

        <SectionHead title={items.length ? `Top ${items.length} picks` : 'Top picks'} sub="Ranked by GalaTayo. Tap a place for prices, hours and how to get there." />

        {isLoading ? (
          <div aria-busy="true">
            <span className="sr-only">Loading {metadata.h1.toLowerCase()}.</span>
            <MasonrySkeleton />
          </div>
        ) : errorMessage ? (
          <Empty title="Hindi ma-load ang guide" description={errorMessage} />
        ) : items.length === 0 ? (
          <Empty
            title="Wala pang matching places"
            description="We'll keep this guide updated as more places are added."
            action={<Button variant="line" href="/places">Browse places</Button>}
          />
        ) : (
          <ol className="m-rank-grid" aria-label={`${metadata.h1}, ranked`}>
            {items.map((rawPlace, index) => (
              <li key={rawPlace.id} className="m-rank">
                <span className="m-rank-n" aria-label={`Number ${index + 1}`}>
                  {index + 1}
                </span>
                <PlaceCard
                  masonryIndex={index}
                  place={withLiveDetail({ ...mapSeoPlaceToCard(rawPlace), budget_min: rawPlace.budgetMin, good_for: rawPlace.goodFor }, placeDetailsBySlug[rawPlace.slug])}
                  onGuestSave={() => listingGuestAuth.open('favorite')}
                />
                {rawPlace.description ? <p className="m-rank-desc">{rawPlace.description}</p> : null}
              </li>
            ))}
          </ol>
        )}
        {seeAllHref && total > items.length ? (
          <Button variant="line" href={seeAllHref} className="mt-8">
            See all {total} places
          </Button>
        ) : null}

        <div className="g-split mt-14">
          <section aria-labelledby="guide-faq-title" className="min-w-0">
            <h2 id="guide-faq-title" className="g-h2">
              Good to know
            </h2>
            <div className="m-faq mt-4">
              {metadata.faqs.map((faq, index) => (
                <details key={faq.question} open={index === 0}>
                  <summary>
                    {faq.question}
                    <CaretDown aria-hidden="true" />
                  </summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </div>
          </section>

          <aside aria-labelledby="guide-related-title" className="g-side">
            <h2 id="guide-related-title" className="g-h2">
              More guides
            </h2>
            <div className="g-list">
              {relatedTargets.map((relatedTarget) => (
                <Row key={relatedTarget.slug} href={`/guides/${relatedTarget.slug}`} action={<ChevronRight className="g-ic text-[var(--ink-3)]" aria-hidden="true" />}>
                  <div className="g-h3 truncate">{relatedTarget.label}</div>
                  <div className="g-xs g-mut truncate">{relatedTarget.keywords.slice(0, 2).join(' · ')}</div>
                </Row>
              ))}
              <Row href="/saan-tayo" className="!bg-[var(--tara-soft)] !border-transparent" action={<ChevronRight className="g-ic text-[var(--tara-ink)]" aria-hidden="true" />}>
                <div className="g-h3 flex items-center gap-2 truncate">
                  <Shuffle className="h-4 w-4 shrink-0 text-[var(--tara-ink)]" aria-hidden="true" />
                  Saan tayo? Pick 3 for me
                </div>
                <div className="g-xs g-mut truncate">By city, budget and who you're with</div>
              </Row>
            </div>
          </aside>
        </div>
      </article>
      {listingGuestAuth.promptElement}
    </Page>
  )
}
