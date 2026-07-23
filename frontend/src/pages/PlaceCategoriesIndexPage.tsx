import { useEffect, useMemo, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowRight, faCompass, faHouse, faLocationDot, faTableCellsLarge, faTag } from '@fortawesome/free-solid-svg-icons'
import AppHeader from '../components/AppHeader'
import InternalLink from '../components/InternalLink'
import Breadcrumb from '../components/Breadcrumb'
import SeoHead from '../components/SeoHead'
import { PageContainer, PageShell, ResponsiveGrid } from '../components/layout/ResponsiveLayouts'
import { placeCategories } from '../data/placeCategories'
import { categoryRepresentativePlaceSlugs, getDiscoveryImageCandidates } from '../data/placeIndexVisuals'
import type { PlaceDetail } from '../types/appTypes'
import { fetchPlaceDetailsBatch } from '../utils/placeDetailCache'
import { getSiteOrigin } from '../utils/seo'

function PlaceCategoriesIndexPage() {
  const categoryCards = useMemo(
    () => [...placeCategories].sort((left, right) => left.label.localeCompare(right.label)),
    []
  )
  const representativeSlugs = useMemo(
    () => categoryCards.map((category) => categoryRepresentativePlaceSlugs[category.value]).filter(Boolean),
    [categoryCards]
  )
  const [representativePlaces, setRepresentativePlaces] = useState<Record<string, PlaceDetail>>({})

  useEffect(() => {
    let isMounted = true
    void fetchPlaceDetailsBatch(representativeSlugs).then((places) => {
      if (!isMounted) {
        return
      }

      setRepresentativePlaces(
        Object.fromEntries(places.map((place) => [place.slug, place]))
      )
    })

    return () => {
      isMounted = false
    }
  }, [representativeSlugs])

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Place Categories | GalaTayo',
      description: 'Browse place categories across Metro Manila and open category pages on GalaTayo.',
      url: `${getSiteOrigin()}/places/categories`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${getSiteOrigin()}/home` },
        { '@type': 'ListItem', position: 2, name: 'Places', item: `${getSiteOrigin()}/places` },
        { '@type': 'ListItem', position: 3, name: 'Categories', item: `${getSiteOrigin()}/places/categories` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: categoryCards.map((category, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: category.label,
        url: `${getSiteOrigin()}/places/categories/${encodeURIComponent(category.value)}`,
      })),
    },
  ]

  return (
    <PageShell>
      <SeoHead
        title="Place Categories | GalaTayo"
        description="Browse place categories across Metro Manila and open category pages on GalaTayo."
        canonicalPath="/places/categories"
        jsonLd={jsonLd}
      />
      <AppHeader minimal />

      <main className="w-full pb-12 pt-5 sm:pb-14">
        <PageContainer className="px-4 sm:px-6 lg:px-8">
        <Breadcrumb
          showBack
          items={[
            { label: 'Home', href: '/home', icon: <FontAwesomeIcon icon={faHouse} className="h-3.5 w-3.5" /> },
            { label: 'Places', href: '/places', icon: <FontAwesomeIcon icon={faLocationDot} className="h-3.5 w-3.5" /> },
            { label: 'Categories', icon: <FontAwesomeIcon icon={faTableCellsLarge} className="h-3.5 w-3.5" /> },
          ]}
        />

        <section className="mt-5">
          <div className="place-categories-index-metro-manila flex items-center gap-2.5 text-[var(--accent)]">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
              <FontAwesomeIcon icon={faCompass} className="h-4 w-4" />
            </span>
            <span className="inline-flex rounded-full border border-[#DBEAFE] bg-[var(--surface-alt)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
              Metro Manila
            </span>
          </div>
          <div className="mt-4 max-w-[42rem]">
            <h1 className="text-[2rem] font-black leading-tight tracking-[-0.04em] text-[var(--text-main)] sm:text-[2.4rem]">
              Browse place categories
            </h1>
            <p className="mt-3 text-[15px] leading-7 text-[var(--muted)]">
              Open a category to see all matching places from every city.
            </p>
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-black tracking-[-0.03em] text-[var(--text-main)]">Categories</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Each category page gathers places across cities and keeps them arranged.</p>
            </div>
          </div>
          <ResponsiveGrid className="mt-4 gap-3">
            {categoryCards.map((category, index) => (
              <InternalLink
                key={category.value}
                href={`/places/categories/${category.value}`}
                className="group block rounded-3xl border border-[#E5E7EB] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(17,24,39,0.04)] transition hover:-translate-y-0.5 hover:border-[#DBEAFE] hover:shadow-[0_14px_32px_rgba(30,58,138,0.08)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <IndexCardPhoto
                      imageUrls={getDiscoveryImageCandidates(
                        categoryRepresentativePlaceSlugs[category.value],
                        representativePlaces[categoryRepresentativePlaceSlugs[category.value]]
                      )}
                      label={category.label}
                      priority={index < 4}
                    />
                    <div className="min-w-0">
                      <p className="text-[1.05rem] font-black tracking-[-0.02em] text-[var(--text-main)]">{category.label}</p>
                      <div className="mt-1 flex items-center gap-1.5 text-[13px] text-[var(--muted)]">
                        <FontAwesomeIcon icon={faTag} className="h-3.5 w-3.5 shrink-0 text-[#94A3B8]" />
                        <span className="truncate">Open {category.label.toLowerCase()} places</span>
                      </div>
                    </div>
                  </div>
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-alt)] text-[#64748B] transition group-hover:bg-[var(--accent-soft)] group-hover:text-[var(--accent)]">
                    <FontAwesomeIcon icon={faArrowRight} className="h-3.5 w-3.5" />
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

function IndexCardPhoto({ imageUrls, label, priority = false }: { imageUrls: string[]; label: string; priority?: boolean }) {
  const [imageIndex, setImageIndex] = useState(0)
  const imageSourceKey = imageUrls.join('|')
  const imageUrl = imageUrls[imageIndex] ?? null
  const shouldShowImage = Boolean(imageUrl)

  useEffect(() => {
    setImageIndex(0)
  }, [imageSourceKey])

  return (
    <span className="relative inline-flex h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-[rgba(148,163,184,0.2)] bg-[linear-gradient(135deg,#eef6ff,#f8fafc)] shadow-[0_8px_18px_rgba(15,23,42,0.08)] transition group-hover:scale-[1.02]">
      {shouldShowImage ? (
        <img
          src={imageUrl ?? undefined}
          alt={label}
          className="h-full w-full object-cover"
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'auto' : 'low'}
          sizes="48px"
          onError={() => {
            setImageIndex((currentIndex) => Math.min(currentIndex + 1, imageUrls.length))
          }}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-sm font-black text-[var(--accent)]">
          {label.charAt(0)}
        </span>
      )}
    </span>
  )
}

export default PlaceCategoriesIndexPage
