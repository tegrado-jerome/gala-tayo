import { useEffect, useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader'
import InternalLink from '../components/InternalLink'
import PlaceCard from '../components/PlaceCard'
import SeoHead from '../components/SeoHead'
import type { PlaceCardData } from '../components/PlaceCard'
import { navigateToPath } from '../utils/navigation'
import { getCanonicalPlacePath, getSiteOrigin } from '../utils/seo'
import { getSeoPlaces, mapSeoPlaceToCard, type SeoAreaSummary, type SeoPlaceSummary } from '../utils/seoApi'

function PlacesIndexPage() {
  const [areas, setAreas] = useState<SeoAreaSummary[]>([])
  const [places, setPlaces] = useState<SeoPlaceSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const loadPage = async () => {
      try {
        setIsLoading(true)
        setErrorMessage(null)
        const data = await getSeoPlaces()
        setAreas(Array.isArray(data.areas) ? data.areas : [])
        setPlaces(Array.isArray(data.places) ? data.places : [])
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load places.')
      } finally {
        setIsLoading(false)
      }
    }

    void loadPage()
  }, [])

  const featuredPlaces = useMemo(() => places.slice(0, 12).map(mapSeoPlaceToCard), [places])
  const faqItems = [
    {
      question: 'What can I find on GalaTayo places pages?',
      answer: 'You can browse Metro Manila area pages and open shared place detail pages with location, category, and planning notes.',
    },
    {
      question: 'How do I explore places by city or area?',
      answer: 'Open one of the area pages below to see places grouped under that Metro Manila location.',
    },
    {
      question: 'Are these place pages shareable?',
      answer: 'Yes. Each place page has a canonical URL under its area so links stay consistent when you share them.',
    },
  ]

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Places in Metro Manila | GalaTayo',
    description: 'Browse GalaTayo place pages and Metro Manila area pages for cafes, parks, malls, and gala spots.',
    url: `${getSiteOrigin()}/places`,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: places.slice(0, 20).map((place, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${getSiteOrigin()}${place.canonicalPath}`,
        name: place.name,
      })),
    },
  }

  return (
    <div className="gala-page-background min-h-screen text-[var(--text)]">
      <SeoHead
        title="Places in Metro Manila | GalaTayo"
        description="Browse Metro Manila place pages and area guides on GalaTayo."
        canonicalPath="/places"
        jsonLd={jsonLd}
      />
      <AppHeader minimal />

      <main className="mx-auto w-full max-w-[1180px] px-4 pb-10 pt-5 sm:px-6 sm:pb-12 lg:px-8">
        <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
          <InternalLink href="/" className="hover:text-[var(--accent)]">Home</InternalLink>
          <span className="px-2">/</span>
          <span aria-current="page" className="font-semibold text-slate-700">Places</span>
        </nav>

        <section className="mt-4 rounded-[28px] border border-[var(--line)] bg-white px-5 py-6 shadow-sm sm:px-6">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Places</p>
          <h1 className="mt-2 text-[2rem] font-black leading-tight text-slate-950 sm:text-[2.4rem]">Explore Metro Manila places</h1>
          <p className="mt-3 max-w-[52rem] text-[15px] leading-7 text-slate-600">
            Browse public GalaTayo place pages by area, then open a canonical place page for the details, share link, and planning context.
          </p>
        </section>

        <section className="mt-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-950">Browse by area</h2>
              <p className="mt-1 text-sm text-slate-500">Open an area page to see its published places.</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {areas.map((area) => (
              <InternalLink
                key={area.slug}
                href={area.canonicalPath}
                className="block rounded-[24px] border border-[var(--line)] bg-white px-5 py-4 shadow-sm transition hover:border-[var(--accent)]"
              >
                <p className="text-lg font-black text-slate-950">{area.name}</p>
                <p className="mt-1 text-sm text-slate-500">{area.placeCount} public place{area.placeCount === 1 ? '' : 's'}</p>
              </InternalLink>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-950">Featured place pages</h2>
              <p className="mt-1 text-sm text-slate-500">These links lead to canonical area-plus-place URLs.</p>
            </div>
          </div>

          {isLoading ? (
            <p className="mt-4 text-sm text-slate-500">Loading places...</p>
          ) : errorMessage ? (
            <p className="mt-4 text-sm text-red-600">{errorMessage}</p>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {featuredPlaces.map((place: PlaceCardData, index) => {
                const rawPlace = places[index]
                const canonicalPath = rawPlace ? getCanonicalPlacePath({ areaSlug: rawPlace.areaSlug, placeSlug: rawPlace.slug }) : `/places/${encodeURIComponent(place.slug || '')}`

                return (
                  <div key={place.id}>
                    <PlaceCard
                      place={place}
                      searchResultCard
                      onOpen={() => navigateToPath(canonicalPath)}
                      onSelect={() => undefined}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="mt-8 rounded-[28px] border border-[var(--line)] bg-white px-5 py-6 shadow-sm sm:px-6">
          <h2 className="text-xl font-black text-slate-950">Planning questions</h2>
          <div className="mt-4 space-y-4">
            {faqItems.map((item) => (
              <div key={item.question}>
                <h3 className="text-base font-black text-slate-900">{item.question}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">{item.answer}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

export default PlacesIndexPage
