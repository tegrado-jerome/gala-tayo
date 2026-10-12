import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import { CalendarCheck } from '@phosphor-icons/react/dist/csr/CalendarCheck'
import { CaretRight as ChevronRight } from '@phosphor-icons/react/dist/csr/CaretRight'
import { Clock } from '@phosphor-icons/react/dist/csr/Clock'
import { MapPin } from '@phosphor-icons/react/dist/csr/MapPin'
import { ShareNetwork } from '@phosphor-icons/react/dist/csr/ShareNetwork'
import InternalLink from '../InternalLink'
import SeoHead from '../SeoHead'
import { FaqList } from '../QuickAnswer'
import { ListingBreadcrumb } from '../home/search/SearchComponents'
import { Button, Page, Row, SectionHead } from '../ui'
import { heroSrcSet, resizedMediaUrl } from '../../data/r2Config'
import { loadCompactPlaces, type CompactPlace } from '../../utils/compactPlaces'
import { getPlaceCardPhoto, getPlaceLeadPhoto } from '../../utils/placeGalleryPhotos'
import { faqJsonLd } from '../../utils/seoAnswers'
import { getSiteOrigin } from '../../utils/seo'
import { BRAND_NAME, SEO_LANDING_TARGETS, getGuideOgImagePath, getLandingPath, withBrand, type SeoLandingTarget } from '../../utils/seoLandingPages'
import { shareLink } from '../../utils/share'
import '../../design/misc.css'

type Article = NonNullable<SeoLandingTarget['article']>

const WORDS_PER_MINUTE = 220

// Links to our own pages stay in the app; outside sources open in a new tab.
const markdownComponents: Components = {
  a: ({ href, children }) =>
    href?.startsWith('/') ? (
      <InternalLink href={href}>{children}</InternalLink>
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
}

function readMinutes(article: Article, intro: string) {
  const words = [intro, ...article.sections.flatMap((section) => [section.heading, section.body])].join(' ').split(/\s+/).length
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE))
}

const formatMonth = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** A written guide (seoGuides.json entries with `article`): sections, the places it mentions, sources and FAQs. */
export default function EditorialGuide({ target, article }: { target: SeoLandingTarget; article: Article }) {
  const [places, setPlaces] = useState<CompactPlace[] | null>(null)
  const [shareNote, setShareNote] = useState<string | null>(null)

  useEffect(() => {
    let isActive = true
    // loadCompactPlaces drops hidden places, so a guide never surfaces one even if it is listed here.
    loadCompactPlaces()
      .then((all) => {
        if (!isActive) return
        const bySlug = new Map(all.map((place) => [place.slug, place]))
        setPlaces(article.places.map((slug) => bySlug.get(slug)).filter((place): place is CompactPlace => Boolean(place)))
      })
      .catch(() => {
        if (isActive) setPlaces([])
      })
    return () => {
      isActive = false
    }
  }, [article])

  const origin = getSiteOrigin()
  const canonicalPath = getLandingPath(target.slug)
  const pageUrl = `${origin}${canonicalPath}`
  const intro = target.intro ?? ''
  const minutes = useMemo(() => readMinutes(article, intro), [article, intro])
  // The bundled HD lead photo first; the API image (often missing from the daily snapshot) as a fallback.
  const heroPlace = places?.find((place) => getPlaceLeadPhoto(place.slug) || place.imageUrl)
  const heroImage = heroPlace ? getPlaceLeadPhoto(heroPlace.slug) || heroPlace.imageUrl || '' : ''
  const faqs = target.faqs ?? []
  const otherGuides = SEO_LANDING_TARGETS.filter((guide) => guide.article && guide.slug !== target.slug)
  const facts = [
    { icon: MapPin, label: 'Philippines' },
    { icon: Clock, label: `${minutes} min read` },
    { icon: CalendarCheck, label: `Updated ${formatMonth(article.updated)}` },
  ]

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      '@id': `${pageUrl}#article`,
      headline: target.label,
      description: target.description,
      url: pageUrl,
      mainEntityOfPage: pageUrl,
      inLanguage: 'en',
      keywords: target.keywords.join(', '),
      ...(target.addedAt ? { datePublished: target.addedAt } : {}),
      dateModified: article.updated,
      author: { '@id': `${origin}/#organization` },
      publisher: { '@id': `${origin}/#organization` },
      isPartOf: { '@id': `${origin}/#website` },
      image: { '@type': 'ImageObject', url: `${origin}${getGuideOgImagePath(target.slug)}`, width: 1200, height: 630 },
      citation: article.sources.map((source) => source.url),
      ...(places?.length
        ? { mentions: places.map((place) => ({ '@type': 'TouristAttraction', name: place.name, url: `${origin}${place.canonicalPath}` })) }
        : {}),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: 'Guides', item: `${origin}/guides` },
        { '@type': 'ListItem', position: 3, name: target.label, item: pageUrl },
      ],
    },
    ...(faqs.length ? [faqJsonLd(faqs)] : []),
  ]

  const shareGuide = async () => {
    try {
      const hadNativeShare = typeof navigator.share === 'function'
      await shareLink({ url: pageUrl, title: target.label, text: `${target.label}: ${target.description}`, contentType: 'guide', itemId: target.slug })
      setShareNote(hadNativeShare ? null : 'Link copied! Send it to your group chat.')
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setShareNote(pageUrl)
    }
  }

  return (
    <Page>
      <SeoHead
        title={withBrand(target.title || target.label)}
        description={target.description}
        canonicalPath={canonicalPath}
        openGraphType="article"
        image={{ url: getGuideOgImagePath(target.slug), alt: `${target.label}, a ${BRAND_NAME} guide`, width: 1200, height: 630 }}
        jsonLd={jsonLd}
      />

      <ListingBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Guides', href: '/guides' }, { label: target.label }]} />

      <article data-og-footnote="Sourced facts · linked places">
        <header className="mt-5 max-w-[46rem]">
          <p className="g-kicker">{BRAND_NAME} guide</p>
          <h1 className="g-h1 mt-1.5 md:text-[40px]">{target.label}</h1>
          <p className="g-mut mt-3 text-[16px] leading-relaxed">{intro}</p>
        </header>

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

        {places === null ? (
          <div className="m-hero g-skel" aria-busy="true" />
        ) : heroPlace ? (
          <figure>
            <div className="m-hero">
              <img
                src={resizedMediaUrl(heroImage, 'hero')}
                srcSet={heroSrcSet(heroImage)}
                sizes="(min-width: 1240px) 1176px, calc(100vw - 32px)"
                alt={heroPlace.name}
                fetchPriority="high"
                decoding="async"
              />
            </div>
            <figcaption className="m-caption">Pictured: {heroPlace.name}</figcaption>
          </figure>
        ) : null}

        <div className="m-prose">
          {article.sections.map((section) => (
            <section key={section.heading} aria-label={section.heading}>
              <h2 className="g-h2">{section.heading}</h2>
              <ReactMarkdown components={markdownComponents}>{section.body}</ReactMarkdown>
            </section>
          ))}
        </div>

        {places?.length ? (
          <section aria-labelledby="guide-places-title">
            <SectionHead title={<span id="guide-places-title">Places in this guide</span>} sub="Fees, how to get there and the best months on every page." />
            <ul className="m-guide-grid">
              {places.map((place) => {
                const photo = getPlaceCardPhoto(place.slug) || resizedMediaUrl(place.imageUrl, 'card')
                return (
                  <li key={place.slug}>
                    <InternalLink href={place.canonicalPath} className="m-guide-card">
                      <span className="m-guide-photo">{photo ? <img src={photo} alt={place.name} loading="lazy" decoding="async" /> : null}</span>
                      <span className="g-h3 mt-2 block">{place.name}</span>
                      <span className="g-xs g-mut">{place.city || place.area}</span>
                    </InternalLink>
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}

        <div className="g-split mt-14">
          <div className="min-w-0">
            {faqs.length ? (
              <section aria-labelledby="guide-faq-title">
                <h2 id="guide-faq-title" className="g-h2">
                  Quick answers
                </h2>
                <FaqList faqs={faqs} />
              </section>
            ) : null}
            <section aria-labelledby="guide-sources-title" className="mt-10">
              <h2 id="guide-sources-title" className="g-h2">
                Sources
              </h2>
              <ol className="m-sources">
                {article.sources.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.title}
                    </a>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <aside aria-labelledby="guide-related-title" className="g-side">
              <h2 id="guide-related-title" className="g-h2">
                More guides
              </h2>
              <div className="g-list">
                {otherGuides.map((guide) => (
                  <Row key={guide.slug} href={getLandingPath(guide.slug)} action={<ChevronRight className="g-ic text-[var(--ink-3)]" aria-hidden="true" />}>
                    <div className="g-h3 truncate">{guide.label}</div>
                    <div className="g-xs g-mut truncate">Know before you go</div>
                  </Row>
                ))}
                <Row href="/guides" action={<ChevronRight className="g-ic text-[var(--ink-3)]" aria-hidden="true" />}>
                  <div className="g-h3 truncate">All travel guides</div>
                  <div className="g-xs g-mut truncate">Where to go around the Philippines</div>
                </Row>
              </div>
          </aside>
        </div>
      </article>
    </Page>
  )
}
