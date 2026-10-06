import { useEffect, useMemo, useState } from 'react'
import { CaretRight as ChevronRight } from '@phosphor-icons/react/dist/csr/CaretRight'
import { CalendarCheck } from '@phosphor-icons/react/dist/csr/CalendarCheck'
import { ListNumbers } from '@phosphor-icons/react/dist/csr/ListNumbers'
import { MapPin } from '@phosphor-icons/react/dist/csr/MapPin'
import { ShareNetwork } from '@phosphor-icons/react/dist/csr/ShareNetwork'
import { Shuffle } from '@phosphor-icons/react/dist/csr/Shuffle'
import { Wallet } from '@phosphor-icons/react/dist/csr/Wallet'
import PlaceCard, { getCategoryIcon, withLiveDetail } from '../components/PlaceCard'
import { ListingBreadcrumb, MasonrySkeleton } from '../components/home/search/SearchComponents'
import { useGuestAuthPrompt } from '../components/GuestAuthPrompt'
import { Button, Empty, Page, Row, SectionHead } from '../components/ui'
import '../design/misc.css'
import SeoHead from '../components/SeoHead'
import { FaqList, QuickAnswer } from '../components/QuickAnswer'
import { describeBestFor, describeBudgetRange, faqJsonLd } from '../utils/seoAnswers'
import { fetchPlaceDetailsBatch } from '../utils/placeDetailCache'
import { getAreaLabelBySlug } from '../data/destinations'
import { getPlaceCategoryLabel } from '../data/placeCategories'
import { getSiteOrigin } from '../utils/seo'
import { getSeoListingPage, mapSeoPlaceToCard, type SeoPlaceSummary } from '../utils/seoApi'
import { BRAND_NAME, MIN_INDEXABLE_GUIDE_PLACES, PRODUCT_NAME, buildLandingMetadata, getGuideAreaHub, getGuideOgImagePath, getGuideSubtitle, getLandingTargetBySlug, getRelatedLandingTargets, type SeoLandingTarget } from '../utils/seoLandingPages'
import { shareLink } from '../utils/share'
import type { PlaceDetail } from '../types/appTypes'
import { heroSrcSet, resizedMediaUrl } from '../data/r2Config'

function GuideLinks({ heading, targets }: { heading: string; targets: SeoLandingTarget[] }) {
  return (
    <>
      <h3 className="g-xs g-mut mt-4 font-semibold uppercase tracking-wide">{heading}</h3>
      <div className="g-list mt-2">
        {targets.map((relatedTarget) => (
          <Row key={relatedTarget.slug} href={`/guides/${relatedTarget.slug}`} action={<ChevronRight className="g-ic text-[var(--ink-3)]" aria-hidden="true" />}>
            <div className="g-h3 truncate">{relatedTarget.label}</div>
            <div className="g-xs g-mut truncate">{getGuideSubtitle(relatedTarget)}</div>
          </Row>
        ))}
      </div>
    </>
  )
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
  const [shareNote, setShareNote] = useState<string | null>(null)

  useEffect(() => {
    if (!target) {
      setIsLoading(false)
      setErrorMessage('Guide not found.')
      return
    }

    const controller = new AbortController()
    setShareNote(null)

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
  const areaHub = getGuideAreaHub(target)
  const pageUrl = `${getSiteOrigin()}${metadata.canonicalPath}`
  const ogImageUrl = `${getSiteOrigin()}${getGuideOgImagePath(target.slug)}`
  // Province guides (Bohol, Palawan) have no area page of their own to send "See all" to.
  const seeAllHref = target.goodFor || (target.areaSlug && !getAreaLabelBySlug(target.areaSlug))
    ? null
    : target.category && target.areaSlug
      ? `/places/${target.areaSlug}?category=${target.category}`
      : target.category
        ? `/places/categories/${target.category}`
        : target.areaSlug
          ? `/places/${target.areaSlug}`
          : null
  const isThin = !isLoading && !errorMessage && total < MIN_INDEXABLE_GUIDE_PLACES
  const budgetRange = describeBudgetRange(items.map((item) => item.budgetMin))
  const latestUpdate = items.map((item) => item.updatedAt).filter((value): value is string => Boolean(value)).sort().at(-1)
  const listHeading = items.length ? `Top ${items.length} ${metadata.h1.replace(/^best\s+/i, '')}` : 'Top picks'
  const topNames = items.slice(0, 3).map((item) => item.name)
  // Answers built from the listed places themselves, so every FAQ says something true about this page.
  const faqs = [
    ...(topNames.length >= 3
      ? [{ question: `What are the top picks for ${metadata.h1}?`, answer: `${topNames[0]}, ${topNames[1]} and ${topNames[2]} lead this guide. All ${total} places are ranked on this page, best first.` }]
      : []),
    ...(budgetRange ? [{ question: `How much should I budget?`, answer: budgetRange === 'Free' ? 'The top picks are free to enter. Budget only for food and the commute.' : `Starting budgets for the top picks run ${budgetRange}. Each place page breaks down what the money covers.` }] : []),
    ...metadata.faqs,
  ]
  const updatedLabel = latestUpdate ? new Date(latestUpdate).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }) : null
  const itemList = items.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        '@id': `${pageUrl}#list`,
        name: listHeading,
        numberOfItems: items.length,
        itemListOrder: 'https://schema.org/ItemListOrderDescending',
        itemListElement: items.map((place, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: `${getSiteOrigin()}${place.canonicalPath}`,
          name: place.name,
        })),
      }
    : null
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': `${pageUrl}#page`,
      name: metadata.h1,
      description: metadata.description,
      url: pageUrl,
      inLanguage: 'en-PH',
      keywords: metadata.keywords.join(', '),
      isPartOf: { '@id': `${getSiteOrigin()}/#website` },
      publisher: { '@id': `${getSiteOrigin()}/#organization` },
      primaryImageOfPage: { '@type': 'ImageObject', url: ogImageUrl, width: 1200, height: 630 },
      ...(latestUpdate ? { dateModified: latestUpdate } : {}),
      ...(itemList ? { mainEntity: { '@id': itemList['@id'] } } : {}),
    },
    ...(itemList ? [itemList] : []),
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${getSiteOrigin()}/` },
        { '@type': 'ListItem', position: 2, name: 'Guides', item: `${getSiteOrigin()}/guides` },
        { '@type': 'ListItem', position: 3, name: metadata.h1, item: pageUrl },
      ],
    },
    ...(isLoading || errorMessage ? [] : [faqJsonLd(faqs)]),
  ]
  const shareGuide = async () => {
    try {
      const hadNativeShare = typeof navigator.share === 'function'
      await shareLink({ url: pageUrl, title: metadata.title, text: `${metadata.h1}: ${metadata.description}`, contentType: 'guide', itemId: target.slug })
      setShareNote(hadNativeShare ? null : 'Link copied. I-send mo na sa GC!')
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setShareNote(pageUrl)
    }
  }

  const CategoryIcon = getCategoryIcon(target.category ?? null)
  const heroPlace = items.find((item) => item.imageUrl)
  const facts = [
    { icon: MapPin, label: areaName },
    { icon: CategoryIcon, label: categoryLabel || 'Mixed discovery' },
    isLoading ? null : { icon: ListNumbers, label: `${total} ${total === 1 ? 'place' : 'places'}` },
    isLoading ? null : { icon: Wallet, label: budgetRange ?? 'Budget varies' },
    updatedLabel ? { icon: CalendarCheck, label: `Updated ${updatedLabel}` } : null,
  ].filter((fact): fact is { icon: typeof MapPin; label: string } => Boolean(fact))

  return (
    <Page>
      <SeoHead
        title={metadata.title}
        description={metadata.description}
        canonicalPath={metadata.canonicalPath}
        robots={isThin ? 'noindex,follow' : undefined}
        openGraphType="article"
        image={{ url: getGuideOgImagePath(target.slug), alt: `${metadata.h1}, a ${BRAND_NAME} guide`, width: 1200, height: 630 }}
        jsonLd={jsonLd}
      />

      <ListingBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Guides', href: '/guides' }, { label: metadata.h1 }]} />

      <article>
        <header className="mt-5 max-w-[46rem]">
          <p className="g-kicker">{BRAND_NAME} guide</p>
          <h1 className="g-h1 mt-1.5 md:text-[40px]">{metadata.h1}</h1>
          <p className="g-mut mt-3 text-[16px] leading-relaxed">{metadata.intro}</p>
        </header>

        {!isLoading && !errorMessage && items.length ? (
          <QuickAnswer
            rows={[
              { label: 'Best for', value: target.quickAnswer?.bestFor ?? describeBestFor(items.map((item) => item.goodFor)) },
              { label: 'Budget', value: target.quickAnswer?.cost ?? (budgetRange ? `${budgetRange}, starting prices before transport` : null) },
              { label: 'Getting there', value: target.quickAnswer?.gettingThere },
            ]}
          />
        ) : null}

        <ul className="m-facts" aria-label="Guide facts">
          {facts.map(({ icon: Icon, label }) => (
            <li key={label}>
              <Icon aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="line" size="sm" onClick={() => void shareGuide()}>
            <ShareNetwork className="g-ic" aria-hidden="true" />
            Share this guide
          </Button>
          <p className="g-xs g-mut" role="status">
            {shareNote}
          </p>
        </div>

        {heroPlace?.imageUrl ? (
          <figure>
            <div className="m-hero">
              <img
                src={resizedMediaUrl(heroPlace.imageUrl, 'hero')}
                srcSet={heroSrcSet(heroPlace.imageUrl)}
                sizes="(min-width: 1240px) 1176px, calc(100vw - 32px)"
                alt={heroPlace.name}
                fetchPriority="high"
                decoding="async"
              />
            </div>
            <figcaption className="m-caption">Pictured: {heroPlace.name}</figcaption>
          </figure>
        ) : isLoading ? (
          <div className="m-hero g-skel" aria-hidden="true" />
        ) : null}

        <SectionHead title={listHeading} sub="Ranked by GalaTayo. Tap a place for prices, hours and how to get there." />

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
          <ol className="g-lgrid" aria-label={`${metadata.h1}, ranked`}>
            {items.map((rawPlace, index) => (
              <li key={rawPlace.id} className="m-rank">
                <span className="m-rank-n" aria-label={`Number ${index + 1}`}>
                  {index + 1}
                </span>
                <PlaceCard
                  priority={index < 2}
                  place={withLiveDetail({ ...mapSeoPlaceToCard(rawPlace), budget_min: rawPlace.budgetMin, good_for: rawPlace.goodFor }, placeDetailsBySlug[rawPlace.slug])}
                  onGuestSave={(retry) => listingGuestAuth.open('favorite', retry)}
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
            <FaqList faqs={faqs} />
          </section>

          <aside aria-labelledby="guide-related-title" className="g-side">
            <h2 id="guide-related-title" className="g-h2">
              More guides
            </h2>
            {relatedTargets.nearby.length ? <GuideLinks heading="Nearby" targets={relatedTargets.nearby} /> : null}
            {relatedTargets.similar.length ? <GuideLinks heading="Same idea, other places" targets={relatedTargets.similar} /> : null}
            <div className="g-list mt-4">
              {areaHub ? (
                <Row href={areaHub.href} action={<ChevronRight className="g-ic text-[var(--ink-3)]" aria-hidden="true" />}>
                  <div className="g-h3 flex items-center gap-2 truncate">
                    <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                    All places in {areaHub.name}
                  </div>
                  <div className="g-xs g-mut truncate">Every gala-worthy place, by category</div>
                </Row>
              ) : null}
              <Row href="/saan-tayo" className="!bg-[var(--tara-soft)] !border-transparent" action={<ChevronRight className="g-ic text-[var(--tara-ink)]" aria-hidden="true" />}>
                <div className="g-h3 flex items-center gap-2 truncate">
                  <Shuffle className="h-4 w-4 shrink-0 text-[var(--tara-ink)]" aria-hidden="true" />
                  Saan tayo? Bahala na!
                </div>
                <div className="g-xs g-mut truncate">Near you, rain-smart, vote in the GC</div>
              </Row>
            </div>
          </aside>
        </div>
      </article>
      {listingGuestAuth.promptElement}
    </Page>
  )
}
