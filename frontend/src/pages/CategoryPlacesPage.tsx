import { useEffect, useMemo, useState } from 'react'
import { House, LayoutGrid, MapPin } from 'lucide-react'
import { AppIcon, getCategoryIconName } from '../components/AppIcon'
import AppHeader from '../components/AppHeader'
import Breadcrumb from '../components/Breadcrumb'
import CompactPagination from '../components/CompactPagination'
import PlaceCard, { type PlaceCardData } from '../components/PlaceCard'
import SeoHead from '../components/SeoHead'
import { getPlaceCategoryLabel } from '../data/placeCategories'
import { navigateToPath } from '../utils/navigation'
import { getCanonicalPlacePath, getSiteOrigin, resolveAreaMeta } from '../utils/seo'
import { mapSeoPlaceToCard, type SeoPlaceSummary } from '../utils/seoApi'

type CategoryPlacesPageProps = {
  categorySlug: string
  search?: string
}

const PAGE_SIZE = 12

type CategoryPlacesResponse = {
  items: SeoPlaceSummary[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

function getSearchApiUrl() {
  const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
  return apiBaseUrl ? `${apiBaseUrl}/search` : '/api/search'
}

function sortPlacesAlphabetically(places: SeoPlaceSummary[]) {
  return [...places].sort((left, right) => left.name.localeCompare(right.name))
}

async function readCategoryPlacesResponse(response: Response): Promise<CategoryPlacesResponse> {
  const contentType = response.headers.get('content-type') || ''
  const rawBody = await response.text()

  if (!rawBody.trim()) {
    if (!response.ok) {
      throw new Error('We could not load places for this category right now.')
    }

    return {
      items: [],
      total: 0,
      page: 1,
      pageSize: PAGE_SIZE,
      totalPages: 1,
    }
  }

  if (!contentType.includes('application/json')) {
    throw new Error('The category places request returned an unexpected response. Please make sure the backend API is running.')
  }

  let data: Record<string, unknown>

  try {
    data = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    throw new Error('The category places request returned invalid JSON.')
  }

  if (!response.ok) {
    throw new Error(
      (typeof data.error === 'string' && data.error) ||
      (typeof data.message === 'string' && data.message) ||
      'We could not load places for this category right now.'
    )
  }

  const items = Array.isArray(data.places)
    ? data.places as SeoPlaceSummary[]
    : Array.isArray((data.result as { places?: unknown } | undefined)?.places)
      ? ((data.result as { places: SeoPlaceSummary[] }).places ?? [])
      : []
  const total = typeof data.totalCount === 'number'
    ? data.totalCount
    : typeof (data.result as { totalCount?: unknown } | undefined)?.totalCount === 'number'
      ? Number((data.result as { totalCount?: number }).totalCount)
      : items.length
  const page = typeof data.page === 'number'
    ? data.page
    : typeof (data.result as { page?: unknown } | undefined)?.page === 'number'
      ? Number((data.result as { page?: number }).page)
      : 1
  const pageSize = typeof data.pageSize === 'number'
    ? data.pageSize
    : typeof (data.result as { pageSize?: unknown } | undefined)?.pageSize === 'number'
      ? Number((data.result as { pageSize?: number }).pageSize)
      : PAGE_SIZE
  const totalPages = typeof data.totalPages === 'number'
    ? data.totalPages
    : typeof (data.result as { totalPages?: unknown } | undefined)?.totalPages === 'number'
      ? Number((data.result as { totalPages?: number }).totalPages)
      : Math.max(1, Math.ceil(total / pageSize))

  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
  }
}

function CategoryPlacesPage({ categorySlug, search = '' }: CategoryPlacesPageProps) {
  const [payload, setPayload] = useState<CategoryPlacesResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const categoryLabel = getPlaceCategoryLabel(categorySlug)
  const iconName = getCategoryIconName(categoryLabel)
  const searchParams = useMemo(() => new URLSearchParams(search), [search])
  const currentPage = Math.max(Number(searchParams.get('page') || '1') || 1, 1)
  const hasQueryVariant = currentPage > 1

  useEffect(() => {
    const controller = new AbortController()

    const loadPage = async () => {
      try {
        setIsLoading(true)
        setErrorMessage(null)
        const response = await fetch(getSearchApiUrl(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
          body: JSON.stringify({
            query: '',
            page: currentPage,
            filters: {
              category: categorySlug,
            },
          }),
        })
        const data = await readCategoryPlacesResponse(response)

        if (controller.signal.aborted) {
          return
        }

        setPayload(data)
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return
        }

        setPayload(null)
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load category page.')
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    void loadPage()

    return () => controller.abort()
  }, [categorySlug, currentPage])

  const places = useMemo(() => sortPlacesAlphabetically(payload?.items ?? []), [payload?.items])
  const totalPages = payload?.totalPages ?? 1
  const safePage = payload?.page ?? currentPage
  const getPageHref = (page: number) => {
    const params = new URLSearchParams()
    if (page > 1) {
      params.set('page', String(page))
    }

    return params.toString() ? `/places/categories/${categorySlug}?${params.toString()}` : `/places/categories/${categorySlug}`
  }

  const jsonLd = payload && !errorMessage
    ? [
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: `${categoryLabel} Places | GalaTayo`,
          description: `Browse ${categoryLabel.toLowerCase()} places across Metro Manila on GalaTayo.`,
          url: `${getSiteOrigin()}/places/categories/${encodeURIComponent(categorySlug)}`,
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${getSiteOrigin()}/` },
            { '@type': 'ListItem', position: 2, name: 'Places', item: `${getSiteOrigin()}/places` },
            { '@type': 'ListItem', position: 3, name: 'Categories', item: `${getSiteOrigin()}/places/categories` },
            { '@type': 'ListItem', position: 4, name: categoryLabel, item: `${getSiteOrigin()}/places/categories/${encodeURIComponent(categorySlug)}` },
          ],
        },
        {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          itemListElement: places.map((place, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            url: `${getSiteOrigin()}${place.canonicalPath}`,
            name: place.name,
          })),
        },
      ]
    : null

  return (
    <div className="gala-page-background min-h-screen text-[var(--text)]">
      <SeoHead
        title={`${categoryLabel} Places | GalaTayo`}
        description={`Browse ${categoryLabel.toLowerCase()} places across Metro Manila on GalaTayo.`}
        canonicalPath={`/places/categories/${encodeURIComponent(categorySlug)}`}
        robots={hasQueryVariant ? 'noindex,follow' : 'index,follow'}
        jsonLd={jsonLd}
      />
      <AppHeader minimal />

      <main className="mx-auto w-full max-w-[1180px] px-4 pb-12 pt-5 sm:px-6 sm:pb-14 lg:px-8">
        <Breadcrumb
          items={[
            { label: 'Home', href: '/', icon: <House className="h-3.5 w-3.5" /> },
            { label: 'Places', href: '/places', icon: <MapPin className="h-3.5 w-3.5" /> },
            { label: 'Categories', href: '/places/categories', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
            { label: categoryLabel, icon: <AppIcon name={iconName} className="h-3.5 w-3.5" /> },
          ]}
        />

        <section className="mt-5 pb-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EFF6FF] text-[#1E3A8A]">
            <AppIcon name={iconName} className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-[2.15rem] font-black leading-[0.95] tracking-[-0.045em] text-slate-950 sm:text-[2.6rem]">
            {categoryLabel} places
          </h1>
          <p className="mt-3 max-w-[40rem] text-[15px] leading-7 text-[#6b7280]">
            Explore handpicked {categoryLabel.toLowerCase()} spots and find your next stop.
          </p>
        </section>

        {isLoading ? <p className="mt-6 text-sm text-slate-500">Loading category places...</p> : null}
        {errorMessage ? (
          <section className="mt-6 rounded-[24px] border border-[#E5E7EB] bg-white px-5 py-6 shadow-[0_6px_20px_rgba(17,24,39,0.03)]">
            <h2 className="text-base font-semibold text-[#111827]">We couldn't load {categoryLabel.toLowerCase()} places right now.</h2>
            <p className="mt-1 text-sm leading-6 text-[#6B7280]">Please try again in a bit.</p>
          </section>
        ) : null}

        {!isLoading && !errorMessage ? (
          <>
            {places.length === 0 ? (
              <section className="mt-10 rounded-[28px] border border-[#e5e7eb] bg-white px-5 py-8 text-center shadow-sm sm:px-6">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#dbeafe] text-[#1e3a8a]">
                  <AppIcon name="compass" className="h-7 w-7" />
                </div>
                <h2 className="mt-4 text-[1.2rem] font-black text-slate-950">No {categoryLabel.toLowerCase()} places found yet.</h2>
                <p className="mt-2 text-sm leading-6 text-[#6b7280]">
                  Check back later or try another category page.
                </p>
              </section>
            ) : (
              <section className="mt-9">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-[1.35rem] font-black tracking-[-0.03em] text-slate-950">{categoryLabel} places</h2>
                    <p className="mt-1 text-[13px] leading-6 text-[#6b7280]">Listed alphabetically across Metro Manila.</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {places.map((rawPlace) => {
                    const place = mapSeoPlaceToCard(rawPlace) as PlaceCardData
                    const resolvedAreaSlug = rawPlace.areaSlug || resolveAreaMeta(rawPlace).slug
                    const canonicalPath = getCanonicalPlacePath({ areaSlug: resolvedAreaSlug, placeSlug: rawPlace.slug })

                    return (
                      <div key={rawPlace.id}>
                        <PlaceCard place={place} searchResultCard onOpen={() => navigateToPath(canonicalPath)} onSelect={() => undefined} />
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {places.length > 0 && totalPages > 1 ? (
              <section className="mt-6">
                <CompactPagination
                  currentPage={safePage}
                  totalPages={totalPages}
                  totalItems={payload?.total}
                  pageSize={payload?.pageSize}
                  getHref={getPageHref}
                />
              </section>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  )
}

export default CategoryPlacesPage
