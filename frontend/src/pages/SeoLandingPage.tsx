import { useEffect, useMemo, useState } from 'react'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowRight, faCompass, faHouse, faLocationDot, faTag } from '@fortawesome/free-solid-svg-icons'
import AppHeader from '../components/AppHeader'
import Breadcrumb from '../components/Breadcrumb'
import InternalLink from '../components/InternalLink'
import PlaceCard, { type PlaceCardData } from '../components/PlaceCard'
import PlaceListingSkeleton from '../components/PlaceListingSkeleton'
import SeoHead from '../components/SeoHead'
import { PageContainer, PageShell, ResponsiveGrid } from '../components/layout/ResponsiveLayouts'
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
      <PageShell>
        <SeoHead title={`Guide Not Found | ${PRODUCT_NAME}`} robots="noindex,follow" />
        <AppHeader minimal />
        <main className="w-full pb-12 pt-5">
          <PageContainer className="px-4 sm:px-6 lg:px-8">
            <h1 className="text-2xl font-black text-slate-950">Guide not found</h1>
          </PageContainer>
        </main>
      </PageShell>
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

  return (
    <PageShell>
      <SeoHead
        title={metadata.title}
        description={metadata.description}
        canonicalPath={metadata.canonicalPath}
        jsonLd={jsonLd}
      />
      <AppHeader minimal />

      <main className="w-full pb-12 pt-5 sm:pb-14">
        <PageContainer className="px-4 sm:px-6 lg:px-8">
          <Breadcrumb
            showBack
            items={[
              { label: 'Home', href: '/home', icon: <FontAwesomeIcon icon={faHouse} className="h-3.5 w-3.5" /> },
              { label: 'Places', href: '/places', icon: <FontAwesomeIcon icon={faCompass} className="h-3.5 w-3.5" /> },
              { label: metadata.h1, icon: <FontAwesomeIcon icon={faTag} className="h-3.5 w-3.5" /> },
            ]}
          />

          <section className="mt-5 rounded-[28px] border border-[#E5E7EB] bg-white px-5 py-6 shadow-[0_8px_24px_rgba(17,24,39,0.04)] sm:px-7">
            <span className="inline-flex items-center rounded-full border border-[#DBEAFE] bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
              {BRAND_NAME} Guide
            </span>
            <h1 className="mt-4 text-[2rem] font-black leading-[0.95] tracking-[-0.045em] text-slate-950 sm:text-[2.6rem]">
              {metadata.h1}
            </h1>
            <p className="mt-3 max-w-[46rem] text-[15px] leading-7 text-[var(--muted)]">{metadata.intro}</p>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <InfoCard title="Area coverage" body={areaName} icon={faLocationDot} />
              <InfoCard title="Category focus" body={categoryLabel || 'Mixed discovery'} icon={faTag} />
              <InfoCard title="Search intent" body={metadata.summary} icon={faCompass} />
            </div>
          </section>

          <section className="mt-8">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-[1.35rem] font-black tracking-[-0.03em] text-slate-950">Recommended places</h2>
                <p className="mt-1 text-[13px] leading-6 text-[var(--muted)]">
                  Search-friendly picks from {PRODUCT_NAME} that match this guide&apos;s local intent.
                </p>
              </div>
            </div>

            {isLoading ? (
              <PlaceListingSkeleton cardCount={8} helperText={`Loading ${metadata.h1.toLowerCase()}.`} />
            ) : errorMessage ? (
              <section className="mt-4 rounded-[24px] border border-[#E5E7EB] bg-white px-5 py-6 shadow-[0_6px_20px_rgba(17,24,39,0.03)]">
                <h2 className="text-base font-semibold text-[var(--text-main)]">We couldn&apos;t load this guide right now.</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{errorMessage}</p>
              </section>
            ) : items.length === 0 ? (
              <section className="mt-4 rounded-[24px] border border-[#E5E7EB] bg-white px-5 py-6 shadow-[0_6px_20px_rgba(17,24,39,0.03)]">
                <h2 className="text-base font-semibold text-[var(--text-main)]">No matching places yet.</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">We&apos;ll keep this guide updated as more approved places are added.</p>
              </section>
            ) : (
              <ResponsiveGrid className="mt-4 gap-4">
                {items.map((rawPlace, index) => {
                  const place = mapSeoPlaceToCard(rawPlace) as PlaceCardData
                  const livePlace = placeDetailsBySlug[rawPlace.slug]
                  const resolvedPlace = livePlace
                    ? {
                        ...place,
                        thumbnailUrl: livePlace.thumbnailUrl ?? null,
                        imageUrl: livePlace.imageUrl ?? null,
                        curatedImageUrls: livePlace.curatedImageUrls ?? [],
                      }
                    : place

                  return (
                    <PlaceCard
                      key={rawPlace.id}
                      place={resolvedPlace}
                      searchResultCard
                      imagePriority={index < 4}
                    />
                  )
                })}
              </ResponsiveGrid>
            )}
          </section>

          <section className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="rounded-[28px] border border-[#E5E7EB] bg-white px-5 py-6 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
              <h2 className="text-[1.25rem] font-black tracking-[-0.03em] text-slate-950">Quick answers for AI and search</h2>
              <div className="mt-4 space-y-4">
                {metadata.faqs.map((faq) => (
                  <article key={faq.question} className="rounded-2xl bg-[var(--surface-alt)] px-4 py-4">
                    <h3 className="text-sm font-semibold text-slate-950">{faq.question}</h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{faq.answer}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-[#E5E7EB] bg-white px-5 py-6 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
              <h2 className="text-[1.25rem] font-black tracking-[-0.03em] text-slate-950">Related guides</h2>
              <div className="mt-4 space-y-3">
                {relatedTargets.map((relatedTarget) => (
                  <InternalLink
                    key={relatedTarget.slug}
                    href={`/guides/${relatedTarget.slug}`}
                    className="group flex items-center justify-between rounded-2xl border border-[#E5E7EB] px-4 py-4 transition hover:border-[#DBEAFE] hover:bg-[#F8FBFF]"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{relatedTarget.label}</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                        {relatedTarget.keywords.slice(0, 2).join(' • ')}
                      </p>
                    </div>
                    <FontAwesomeIcon icon={faArrowRight} className="h-3.5 w-3.5 text-[#64748B] transition group-hover:text-[var(--accent)]" />
                  </InternalLink>
                ))}
              </div>
            </div>
          </section>
        </PageContainer>
      </main>
    </PageShell>
  )
}

function InfoCard({
  title,
  body,
  icon,
}: {
  title: string
  body: string
  icon: IconDefinition
}) {
  return (
    <article className="rounded-2xl bg-[var(--surface-alt)] px-4 py-4">
      <div className="flex items-center gap-2 text-[var(--accent)]">
        <FontAwesomeIcon icon={icon} className="h-3.5 w-3.5" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em]">{title}</p>
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{body}</p>
    </article>
  )
}
