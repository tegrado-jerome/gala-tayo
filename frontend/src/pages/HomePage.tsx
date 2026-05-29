import { useEffect, useMemo, useState } from 'react'
import SearchBar from '../components/SearchBar'
import PlaceCard, { type PlaceCardData } from '../components/PlaceCard'
import PlaceDetailView from '../components/PlaceDetailView'
import AppHeader from '../components/AppHeader'
import MapView from '../components/MapView'
import GuestLimitModal from '../components/GuestLimitModal'

type IconProps = {
  className?: string
}

function PinIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
      <path d="M12 21s6-5.7 6-11a6 6 0 1 0-12 0c0 5.3 6 11 6 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  )
}

type BackendCategory = {
  id: string
  name: string
  description: string
  searchTerms: string[]
}

type BackendArea = {
  id: string
  name: string
  type: 'all' | 'city' | 'municipality'
}

function FilterIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </svg>
  )
}

function CheckIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={className}>
      <path d="m5 13 4 4L19 7" />
    </svg>
  )
}

function CategoryIcon({
  className = 'h-3.5 w-3.5',
  categoryId,
}: IconProps & { categoryId: string }) {
  const iconClass = `${className} text-[var(--accent-deep)]`

  if (categoryId === 'all') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={iconClass}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 3.5v17" />
        <path d="M3.5 12h17" />
      </svg>
    )
  }

  if (['kainan', 'cafe', 'dessert'].includes(categoryId)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={iconClass}>
        <path d="M5 8h10v4a5 5 0 0 1-5 5h0a5 5 0 0 1-5-5V8Z" />
        <path d="M15 9h2.2a2.3 2.3 0 0 1 0 4.6H15" />
      </svg>
    )
  }

  if (['mall', 'shopping', 'market', 'services'].includes(categoryId)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={iconClass}>
        <path d="M5 8h14l-1.1 10.5H6.1L5 8Z" />
        <path d="M9 8a3 3 0 0 1 6 0" />
      </svg>
    )
  }

  if (['parke', 'pet-friendly', 'chill'].includes(categoryId)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={iconClass}>
        <path d="M12 21V11" />
        <path d="M12 11c0-3.5 2.2-6 5.5-6 0 3.5-2.2 6-5.5 6Z" />
        <path d="M12 14c0-3.5-2.2-6-5.5-6 0 3.5 2.2 6 5.5 6Z" />
      </svg>
    )
  }

  if (['nightlife', 'date-spot', 'barkada'].includes(categoryId)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={iconClass}>
        <path d="M9 3v8.2a3 3 0 1 1-2 0V3" />
        <path d="M15 3h5v2.5h-3V9a3 3 0 1 1-2 0V3Z" />
      </svg>
    )
  }

  if (['heritage', 'museum', 'tourist-spot', 'religious'].includes(categoryId)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={iconClass}>
        <path d="M3 9h18" />
        <path d="M5.5 9v8.5M9.5 9v8.5M14.5 9v8.5M18.5 9v8.5" />
        <path d="M2.5 20h19" />
        <path d="M12 3 3 7.5h18L12 3Z" />
      </svg>
    )
  }

  if (['study-spot', 'coworking', 'family'].includes(categoryId)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={iconClass}>
        <rect x="4" y="5" width="16" height="14" rx="1.8" />
        <path d="M8 9h8M8 13h8" />
      </svg>
    )
  }

  if (['clinic', 'dental', 'pharmacy', 'hospital', 'wellness'].includes(categoryId)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={iconClass}>
        <path d="M12 5v14M5 12h14" />
        <rect x="4" y="4" width="16" height="16" rx="3" />
      </svg>
    )
  }

  if (['transport', 'hotel-stay'].includes(categoryId)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={iconClass}>
        <rect x="4" y="6" width="16" height="10" rx="2" />
        <path d="M7 16v2M17 16v2M8 10h8" />
      </svg>
    )
  }

  return <PinIcon className={iconClass} />
}

function AreaIcon({ className = 'h-3.5 w-3.5' }: IconProps & { areaType: 'all' | 'city' | 'municipality' }) {
  const iconClass = `${className} text-[var(--accent-deep)]`
  return <PinIcon className={iconClass} />
}

type CategoryChip = {
  id: string
  name: string
}

type AreaChip = {
  id: string
  name: string
  type: 'all' | 'city' | 'municipality'
}

const fallbackCategories = [
  { id: 'kainan', name: 'Kainan' },
  { id: 'cafe', name: 'Cafe' },
  { id: 'mall', name: 'Mall' },
  { id: 'parke', name: 'Parke' },
  { id: 'nightlife', name: 'Nightlife' },
  { id: 'heritage', name: 'Heritage' },
]

const fallbackAreas: AreaChip[] = [
  { id: 'all', name: 'All areas', type: 'all' },
  { id: 'caloocan', name: 'Caloocan', type: 'city' },
  { id: 'las-pinas', name: 'Las Piñas', type: 'city' },
  { id: 'makati', name: 'Makati', type: 'city' },
  { id: 'malabon', name: 'Malabon', type: 'city' },
  { id: 'mandaluyong', name: 'Mandaluyong', type: 'city' },
  { id: 'manila', name: 'Manila', type: 'city' },
  { id: 'marikina', name: 'Marikina', type: 'city' },
  { id: 'muntinlupa', name: 'Muntinlupa', type: 'city' },
  { id: 'navotas', name: 'Navotas', type: 'city' },
  { id: 'paranaque', name: 'Parañaque', type: 'city' },
  { id: 'pasay', name: 'Pasay', type: 'city' },
  { id: 'pasig', name: 'Pasig', type: 'city' },
  { id: 'quezon-city', name: 'Quezon City', type: 'city' },
  { id: 'san-juan', name: 'San Juan', type: 'city' },
  { id: 'taguig', name: 'Taguig', type: 'city' },
  { id: 'valenzuela', name: 'Valenzuela', type: 'city' },
  { id: 'pateros', name: 'Pateros', type: 'municipality' },
]

const mockPlaces: PlaceCardData[] = [
  {
    id: 'bhs',
    name: 'Bonifacio High Street',
    category: 'Hangout',
    area: 'BGC, Taguig',
    rating: '4.6',
    status: 'Open',
    reason: 'Open-air walk + food options for chill date nights.',
    badge: 'Popular',
    coordinates: { lat: 14.5507, lng: 121.0508 },
  },
  {
    id: 'mind-museum',
    name: 'The Mind Museum',
    category: 'Museum',
    area: 'BGC, Taguig',
    rating: '4.5',
    status: 'Closed',
    reason: 'Interactive exhibits good for barkada or family learning trips.',
    badge: 'Culture',
    coordinates: { lat: 14.5528, lng: 121.0442 },
  },
  {
    id: 'market-market',
    name: 'Market! Market!',
    category: 'Mall',
    area: 'BGC, Taguig',
    rating: '4.3',
    status: 'Open',
    reason: 'Budget-friendly food trip picks with many choices.',
    badge: 'Budget',
    coordinates: { lat: 14.5497, lng: 121.0565 },
  },
  {
    id: 'uptown-mall',
    name: 'Uptown Mall',
    category: 'Mall',
    area: 'BGC, Taguig',
    rating: '4.4',
    status: 'Closed',
    reason: 'Good mix of dining and entertainment spots in one area.',
    badge: 'Chill',
    coordinates: { lat: 14.5566, lng: 121.0542 },
  },
]

const animatedSearchPrompts = [
  'Date Spot sa BGC under 1K',
  'Chill Cafe sa QC na Tahimik',
  'Food Trip sa Makati na Mura',
  'Study Place near Taft na may Wi-Fi',
  'Dental Clinic near Me na Abot-Kaya',
]

function HomePage() {
  const [categories, setCategories] = useState(fallbackCategories)
  const [areas, setAreas] = useState<AreaChip[]>(fallbackAreas)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedArea, setSelectedArea] = useState('all')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const [isPlaceDetailOpen, setIsPlaceDetailOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [promptLogin, setPromptLogin] = useState(false)
  const [lastSearchQuery, setLastSearchQuery] = useState('')
  const filteredAdvancedCategories = useMemo(() => categories, [categories])
  const selectedCategoryName = useMemo(
    () =>
      selectedCategory === 'all'
        ? 'All places'
        : categories.find((category) => category.id === selectedCategory)?.name ?? 'All places',
    [categories, selectedCategory]
  )
  const selectedAreaName = useMemo(
    () => areas.find((area) => area.id === selectedArea)?.name ?? 'All areas',
    [areas, selectedArea]
  )
  const selectedPlace = useMemo(
    () => mockPlaces.find((place) => place.id === selectedPlaceId) ?? null,
    [selectedPlaceId]
  )

  const handlePlaceSelect = (placeId: string) => {
    setSelectedPlaceId(placeId)
    setIsPlaceDetailOpen(true)
  }

  const handleMapPlaceSelect = (placeId: string) => {
    setSelectedPlaceId(placeId)
  }

  const handleSearch = async (query: string) => {
    try {
      setIsSearching(true)
      setSearchError(null)
      setPromptLogin(false)

      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          category: selectedCategory,
          area: selectedArea,
        }),
      })

      const data = (await response.json()) as {
        message?: string
        error?: string
        promptLogin?: boolean
        geminiResponse?: string
        result?: {
          geminiResponse?: string
        }
      }

      if (data.promptLogin) {
        setPromptLogin(true)
        return
      }

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Search failed.')
      }

      setLastSearchQuery(query)
      console.log('Search success:', { query, selectedCategory, selectedArea, data })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed.'
      setSearchError(message)
      console.error('Search request failed:', error)
    } finally {
      setIsSearching(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
    const filtersEndpoint = apiBaseUrl ? `${apiBaseUrl}/filters` : '/api/filters'

    const loadFilters = async () => {
      try {
        const response = await fetch(filtersEndpoint, {
          method: 'GET',
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error('Failed to fetch filters.')
        }

        const data = (await response.json()) as {
          categories?: BackendCategory[]
          areas?: BackendArea[]
        }

        if (data.categories && data.categories.length > 0) {
          const mappedCategories: CategoryChip[] = data.categories.map((category) => ({
            id: category.id,
            name: category.name,
          }))

          setCategories(mappedCategories)
        }

        if (data.areas && data.areas.length > 0) {
          const mappedAreas: AreaChip[] = data.areas.map((area) => ({
            id: area.id,
            name: area.name,
            type: area.type,
          }))

          setAreas(mappedAreas)
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Using fallback filters:', error)
        }
      }
    }

    void loadFilters()

    return () => controller.abort()
  }, [])

  if (isPlaceDetailOpen && selectedPlace) {
    return <PlaceDetailView place={selectedPlace} onBack={() => setIsPlaceDetailOpen(false)} />
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <GuestLimitModal isOpen={promptLogin} onClose={() => setPromptLogin(false)} />

      <div className="min-h-screen bg-[linear-gradient(180deg,#f8fbff,#edf4ff)] lg:hidden">
        <AppHeader signInLabel="Mag-sign in" />

        <main className="pb-6">
          <section className="border-b border-[var(--line)] bg-white/76 px-4 py-4 backdrop-blur">
            <SearchBar
              onSearch={handleSearch}
              isLoading={isSearching}
              placeholder="Saan mo gustong pumunta ngayon?"
              animatedPlaceholders={animatedSearchPrompts}
              className="px-3 py-2.5 shadow-[0_10px_26px_rgba(28,77,160,0.06)]"
            />
            {isSearching ? (
              <p className="mt-2 text-xs text-[var(--accent-deep)]">Searching...</p>
            ) : null}
            {searchError ? (
              <p className="mt-2 text-xs text-red-600">{searchError}</p>
            ) : null}
            <button
              type="button"
              onClick={() => setShowAdvancedFilters(true)}
              className="mt-3 inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--accent-deep)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)]"
            >
              <FilterIcon className="h-3.5 w-3.5" />
              Mga Filters
            </button>
          </section>

          <section className="h-[380px] border-b border-[var(--line)] bg-white">
            <MapView
              places={mockPlaces}
              selectedPlaceId={selectedPlaceId}
              onPlaceSelect={handleMapPlaceSelect}
              onPlaceOpen={handlePlaceSelect}
              className="!h-full !rounded-none !border-0"
            />
          </section>

          <section className="px-4 py-4">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Mga Lugar</p>
                <p className="text-[11px] text-[var(--muted)]">325 places found</p>
              </div>
              <button
                type="button"
                className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-[11px] font-medium text-[var(--accent-deep)]"
              >
                Recommended
              </button>
            </div>

            <div className="grid gap-3">
              {mockPlaces.map((place) => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  compact
                  isSelected={selectedPlaceId === place.id}
                  onSelect={handlePlaceSelect}
                />
              ))}
            </div>
          </section>
        </main>
      </div>

      <div className="hidden min-h-screen w-full lg:grid lg:grid-rows-[72px_86px_minmax(0,1fr)]">
        <AppHeader />

        <section className="border-b border-[var(--line)] bg-white/72 backdrop-blur">
          <div className="px-8 py-3">
            <div className="flex items-center gap-4">
            <SearchBar
              onSearch={handleSearch}
              isLoading={isSearching}
              placeholder="Saan mo gustong pumunta ngayon?"
              animatedPlaceholders={animatedSearchPrompts}
              className="min-w-0 flex-1"
            />
            <button
              type="button"
              onClick={() => setShowAdvancedFilters(true)}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-[var(--accent-deep)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)]"
            >
              <FilterIcon className="h-3.5 w-3.5" />
              Mga Filters
            </button>
            </div>
            {isSearching ? (
              <p className="mt-2 text-xs text-[var(--accent-deep)]">Searching...</p>
            ) : null}
            {searchError ? (
              <p className="mt-2 text-xs text-red-600">{searchError}</p>
            ) : null}
          </div>
        </section>

        <section className="grid min-h-0 grid-cols-[380px_minmax(0,1fr)]">
          <aside className="relative flex min-h-0 flex-col border-r border-[var(--line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,249,255,0.96))]">
            <div className="flex items-start justify-between border-b border-[var(--line)] px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Mga Lugar</p>
                <p className="text-[11px] text-[var(--muted)]">
                  {lastSearchQuery
                    ? `Last search: "${lastSearchQuery}"`
                    : '325 places found'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-[var(--muted)]">Pinakarekomenda</p>
                <p className="mt-1 text-[11px] font-medium text-[var(--accent-deep)]">Sorted by relevance</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-px border-b border-[var(--line)] bg-[var(--line)]">
              <div className="bg-white px-3 py-2 text-center text-[11px] font-medium text-[var(--muted)]">All</div>
              <div className="bg-white px-3 py-2 text-center text-[11px] font-medium text-[var(--muted)]">Open</div>
              <div className="bg-white px-3 py-2 text-center text-[11px] font-medium text-[var(--muted)]">Saved</div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <div className="grid gap-3">
                {mockPlaces.map((place) => (
                  <PlaceCard
                    key={place.id}
                    place={place}
                    isSelected={selectedPlaceId === place.id}
                    onSelect={handlePlaceSelect}
                  />
                ))}
              </div>
            </div>
          </aside>

          <section className="min-h-0 bg-white">
            <MapView
              places={mockPlaces}
              selectedPlaceId={selectedPlaceId}
              onPlaceSelect={handleMapPlaceSelect}
              onPlaceOpen={handlePlaceSelect}
              className="!h-full !rounded-none !border-0"
            />
          </section>
        </section>
      </div>

      <div
        className={`fixed inset-0 z-40 transition ${showAdvancedFilters ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
      >
        <button
          type="button"
          onClick={() => setShowAdvancedFilters(false)}
          className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px]"
          aria-label="Close advanced filters"
        />

        <section className="absolute right-0 top-0 h-full w-full max-w-[540px] border-l border-[var(--line)] bg-[linear-gradient(180deg,#ffffff,#f4f8ff)] shadow-[-18px_0_40px_rgba(15,23,42,0.12)]">
          <div className="flex items-start justify-between border-b border-[var(--line)] px-4 py-3.5 sm:px-5 sm:py-4">
            <div>
              <p className="text-[26px] font-semibold leading-tight text-slate-900 sm:text-lg">Pumili ng filters</p>
              <p className="mt-1 text-[11px] text-[var(--muted)] sm:text-xs">
                Selected: {selectedCategoryName} · {selectedAreaName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAdvancedFilters(false)}
              className="mt-1 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_8px_18px_rgba(47,116,232,0.3)] transition-all duration-200 hover:-translate-y-[1px] hover:bg-white hover:text-[var(--accent)] hover:shadow-[0_8px_16px_rgba(47,116,232,0.16)] active:scale-95 active:bg-[var(--accent-deep)] active:text-white sm:h-9 sm:w-9"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.7" className="h-4 w-4">
                <path d="M6 6l12 12" />
                <path d="M18 6 6 18" />
              </svg>
            </button>
          </div>

          <div className="max-h-[calc(100%-164px)] overflow-y-auto px-4 pb-4 pt-3 sm:max-h-[calc(100%-170px)] sm:px-5 sm:pb-5 sm:pt-4">
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] sm:text-xs">
                Kategorya ng lugar
              </p>
            </div>

            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`group rounded-xl border px-2.5 py-1.5 text-left text-[13px] transition duration-200 active:scale-[0.98] sm:px-3 sm:py-2 sm:text-sm ${
                  selectedCategory === 'all'
                    ? 'border-[var(--accent)] bg-[linear-gradient(180deg,#eef5ff,#deecff)] text-[var(--accent-deep)] shadow-[0_8px_18px_rgba(47,116,232,0.14)] active:bg-[linear-gradient(180deg,#deecff,#d0e4ff)]'
                    : 'border-[var(--line)] bg-white text-slate-700 hover:-translate-y-[1px] hover:border-[var(--accent)] hover:bg-[linear-gradient(180deg,#f7fbff,#ecf4ff)] hover:text-[var(--accent-deep)] hover:shadow-[0_8px_16px_rgba(47,116,232,0.1)] active:border-[var(--accent)] active:bg-[linear-gradient(180deg,#eef5ff,#deecff)] active:text-[var(--accent-deep)]'
                }`}
              >
                <span className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <CategoryIcon categoryId="all" />
                    <span>All places</span>
                  </span>
                  {selectedCategory === 'all' ? <CheckIcon className="h-4 w-4" /> : null}
                </span>
              </button>

              {filteredAdvancedCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setSelectedCategory(category.id)}
                  className={`group rounded-xl border px-2.5 py-1.5 text-left text-[13px] transition duration-200 active:scale-[0.98] sm:px-3 sm:py-2 sm:text-sm ${
                    selectedCategory === category.id
                      ? 'border-[var(--accent)] bg-[linear-gradient(180deg,#eef5ff,#deecff)] text-[var(--accent-deep)] shadow-[0_8px_18px_rgba(47,116,232,0.14)] active:bg-[linear-gradient(180deg,#deecff,#d0e4ff)]'
                      : 'border-[var(--line)] bg-white text-slate-700 hover:-translate-y-[1px] hover:border-[var(--accent)] hover:bg-[linear-gradient(180deg,#f7fbff,#ecf4ff)] hover:text-[var(--accent-deep)] hover:shadow-[0_8px_16px_rgba(47,116,232,0.1)] active:border-[var(--accent)] active:bg-[linear-gradient(180deg,#eef5ff,#deecff)] active:text-[var(--accent-deep)]'
                  }`}
                >
                  <span className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <CategoryIcon categoryId={category.id} />
                      <span>{category.name}</span>
                    </span>
                    {selectedCategory === category.id ? <CheckIcon className="h-4 w-4" /> : null}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-4 sm:mt-5">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] sm:text-xs">
                Lungsod / Lugar sa Metro Manila
              </p>
            </div>

            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              {areas.map((area) => (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => setSelectedArea(area.id)}
                  className={`group rounded-xl border px-2.5 py-1.5 text-left text-[13px] transition duration-200 active:scale-[0.98] sm:px-3 sm:py-2 sm:text-sm ${
                    selectedArea === area.id
                      ? 'border-[var(--accent)] bg-[linear-gradient(180deg,#eef5ff,#deecff)] text-[var(--accent-deep)] shadow-[0_8px_18px_rgba(47,116,232,0.14)] active:bg-[linear-gradient(180deg,#deecff,#d0e4ff)]'
                      : 'border-[var(--line)] bg-white text-slate-700 hover:-translate-y-[1px] hover:border-[var(--accent)] hover:bg-[linear-gradient(180deg,#f7fbff,#ecf4ff)] hover:text-[var(--accent-deep)] hover:shadow-[0_8px_16px_rgba(47,116,232,0.1)] active:border-[var(--accent)] active:bg-[linear-gradient(180deg,#eef5ff,#deecff)] active:text-[var(--accent-deep)]'
                  }`}
                >
                  <span className="flex items-center justify-between">
                    <span className="flex min-w-0 items-center gap-2">
                      <AreaIcon areaType={area.type} />
                      <span className="truncate">{area.name}</span>
                    </span>
                    {selectedArea === area.id ? <CheckIcon className="h-4 w-4 shrink-0" /> : null}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 border-t border-[var(--line)] bg-white/95 px-4 py-2.5 sm:px-5 sm:py-3">
            <button
              type="button"
              onClick={() => setShowAdvancedFilters(false)}
              className="w-full rounded-full border border-[var(--accent)] bg-[var(--accent)] px-4 py-2.5 text-[15px] font-semibold tracking-[0.01em] text-white shadow-[0_10px_20px_rgba(47,116,232,0.26)] transition-all duration-200 hover:-translate-y-[1px] hover:bg-white hover:text-[var(--accent)] hover:shadow-[0_8px_16px_rgba(47,116,232,0.16)] active:scale-[0.99] active:bg-[var(--accent-deep)] active:text-white sm:py-3 sm:text-sm"
            >
              Gamitin ang filters
            </button>
          </div>
        </section>
      </div>

    </div>
  )
}

export default HomePage
