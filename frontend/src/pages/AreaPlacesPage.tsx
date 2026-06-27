import { useEffect, useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader'
import InternalLink from '../components/InternalLink'
import PlaceCard, { type PlaceCardData } from '../components/PlaceCard'
import SeoHead from '../components/SeoHead'
import { navigateToPath } from '../utils/navigation'
import { formatLabelFromSlug, getCanonicalPlacePath, getSiteOrigin } from '../utils/seo'
import { getSeoAreaPage, mapSeoPlaceToCard, type SeoAreaPageResponse } from '../utils/seoApi'

type AreaPlacesPageProps = {
  areaSlug: string
}

function AreaPlacesPage({ areaSlug }: AreaPlacesPageProps) {
  const [payload, setPayload] = useState<SeoAreaPageResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    const loadPage = async () => {
      try {
        setIsLoading(true)
        setErrorMessage(null)
        const data = await getSeoAreaPage(areaSlug)

        if (controller.signal.aborted) {
          return
        }

        setPayload(data)
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return
        }

        setPayload(null)
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load area page.')
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    void loadPage()

    return () => controller.abort()
  }, [areaSlug])

  const areaName = payload?.area.name || formatLabelFromSlug(areaSlug)
  const placeCards = useMemo(() => (payload?.places ?? []).map(mapSeoPlaceToCard), [payload?.places])
  const faqItems = [
    {
      question: `What kinds of places are on the ${areaName} page?`,
      answer: `This area page lists public GalaTayo place pages currently grouped under ${areaName}.`,
    },
    {
      question: `How do I open the canonical URL for a place in ${areaName}?`,
      answer: 'Use any place link below and you will land on its canonical area-plus-place page.',
    },
    {
      question: `Can I keep exploring other Metro Manila areas from here?`,
      answer: 'Yes. Use the breadcrumb or the places hub link to jump to more area pages.',
    },
  ]

  const jsonLd = payload
    ? {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: `${areaName} Places | GalaTayo`,
        description: `Browse public GalaTayo places in ${areaName}.`,
        url: `${getSiteOrigin()}${payload.area.canonicalPath}`,
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${getSiteOrigin()}/` },
            { '@type': 'ListItem', position: 2, name: 'Places', item: `${getSiteOrigin()}/places` },
            { '@type': 'ListItem', position: 3, name: areaName, item: `${getSiteOrigin()}${payload.area.canonicalPath}` },
          ],
        },
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: payload.places.map((place, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            url: `${getSiteOrigin()}${place.canonicalPath}`,
            name: place.name,
          })),
        },
      }
    : null

  return (
    <div className="gala-page-background min-h-screen text-[var(--text)]">
      <SeoHead
        title={`${areaName} Places | GalaTayo`}
        description={`Browse public GalaTayo places in ${areaName}.`}
        canonicalPath={`/places/${encodeURIComponent(areaSlug)}`}
        jsonLd={jsonLd}
      />
      <AppHeader minimal />

      <main className="mx-auto w-full max-w-[1180px] px-4 pb-10 pt-5 sm:px-6 sm:pb-12 lg:px-8">
        <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
          <InternalLink href="/" className="hover:text-[var(--accent)]">Home</InternalLink>
          <span className="px-2">/</span>
          <InternalLink href="/places" className="hover:text-[var(--accent)]">Places</InternalLink>
          <span className="px-2">/</span>
          <span aria-current="page" className="font-semibold text-slate-700">{areaName}</span>
        </nav>

        <section className="mt-4 rounded-[28px] border border-[var(--line)] bg-white px-5 py-6 shadow-sm sm:px-6">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Area Page</p>
          <h1 className="mt-2 text-[2rem] font-black leading-tight text-slate-950 sm:text-[2.4rem]">{areaName} places</h1>
          <p className="mt-3 max-w-[52rem] text-[15px] leading-7 text-slate-600">
            Browse public GalaTayo places currently grouped under {areaName}, then open any canonical place page for the full detail view.
          </p>
        </section>

        <section className="mt-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-950">Places in {areaName}</h2>
              <p className="mt-1 text-sm text-slate-500">Internal links below point to canonical place URLs.</p>
            </div>
          </div>

          {isLoading ? (
            <p className="mt-4 text-sm text-slate-500">Loading area places...</p>
          ) : errorMessage ? (
            <p className="mt-4 text-sm text-red-600">{errorMessage}</p>
          ) : placeCards.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No public places were found for this area.</p>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {placeCards.map((place: PlaceCardData, index) => {
                const rawPlace = payload?.places[index]
                const canonicalPath = rawPlace ? getCanonicalPlacePath({ areaSlug: rawPlace.areaSlug, placeSlug: rawPlace.slug }) : `/places/${encodeURIComponent(areaSlug)}/${encodeURIComponent(place.slug || '')}`

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
          <h2 className="text-xl font-black text-slate-950">Quick answers about {areaName}</h2>
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

export default AreaPlacesPage
