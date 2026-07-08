import { useEffect, useState } from 'react'
import AppHeader from '../components/AppHeader'
import MinimalBackNav from '../components/MinimalBackNav'
import { AppChip } from '../components/AppUI'
import { AppIcon } from '../components/AppIcon'
import { navigateToPath } from '../utils/navigation'
import { buildSearchPath, hasActiveSearchCriteria, normalizeTypedSearchText, readSearchUrlState, type SearchBudgetValue, type SearchGoodForValue } from '../utils/searchParams'
import HomePage from './HomePage'
import searchBeforeChibi from '../assets/chibis/core/search-places/chibi-search-places-before-active-state.webp'

type BudgetValue = SearchBudgetValue | null

type SearchCategoryChoice = {
  value: string
  label: string
}

const searchCategoryChoices: SearchCategoryChoice[] = [
  { value: 'kainan', label: 'Kainan' },
  { value: 'cafe', label: 'Cafe' },
  { value: 'mall', label: 'Mall' },
  { value: 'parke', label: 'Parke' },
  { value: 'nature', label: 'Nature' },
  { value: 'museum', label: 'Museum' },
  { value: 'heritage', label: 'Heritage' },
  { value: 'tourist', label: 'Tourist' },
  { value: 'activity', label: 'Activity' },
  { value: 'cinema', label: 'Cinema' },
  { value: 'nightlife', label: 'Nightlife' },
  { value: 'stay', label: 'Stay' },
]

const goodForOptions: Array<{ value: SearchGoodForValue; label: string }> = [
  { value: 'date', label: 'Date' },
  { value: 'barkada', label: 'Barkada' },
  { value: 'family', label: 'Family' },
  { value: 'study', label: 'Study' },
  { value: 'chill', label: 'Chill' },
]

const cityOptions = [
  { id: 'caloocan', name: 'Caloocan' },
  { id: 'las-pinas', name: 'Las Piñas' },
  { id: 'makati', name: 'Makati' },
  { id: 'malabon', name: 'Malabon' },
  { id: 'mandaluyong', name: 'Mandaluyong' },
  { id: 'manila', name: 'Manila' },
  { id: 'marikina', name: 'Marikina' },
  { id: 'muntinlupa', name: 'Muntinlupa' },
  { id: 'navotas', name: 'Navotas' },
  { id: 'paranaque', name: 'Parañaque' },
  { id: 'pasay', name: 'Pasay' },
  { id: 'pasig', name: 'Pasig' },
  { id: 'quezon-city', name: 'Quezon City' },
  { id: 'san-juan', name: 'San Juan' },
  { id: 'taguig', name: 'Taguig' },
  { id: 'valenzuela', name: 'Valenzuela' },
  { id: 'pateros', name: 'Pateros' },
]

const budgetOptions: Array<{ value: SearchBudgetValue | ''; label: string }> = [
  { value: '', label: 'Any budget' },
  { value: 'free', label: 'Free' },
  { value: 'under-500', label: 'Under ₱500' },
  { value: '500-1000', label: '₱500 to ₱1,000' },
  { value: '1000-2000', label: '₱1,000 to ₱2,000' },
  { value: '2000-plus', label: '₱2,000+' },
]

const sampleSearchQueries = [
  'cozy cafe in Makati for reading',
  'fun date place in BGC tonight',
  'nature spot near Quezon City',
  'budget-friendly food trip in Manila',
]

function SearchPageWords() {
  const routeSearchState = readSearchUrlState(window.location.search)
  const initialQuery = routeSearchState.q
  const initialCategoryValue = routeSearchState.category
  const initialCity = routeSearchState.city
  const initialBudget = routeSearchState.budget
  const initialGoodFor = routeSearchState.goodFor
  const initialPage = routeSearchState.page
  const shouldShowResults = hasActiveSearchCriteria(routeSearchState)

  const [rawQuery, setRawQuery] = useState(initialQuery)
  const [selectedCategoryValue, setSelectedCategoryValue] = useState<string | null>(initialCategoryValue)
  const [selectedCity, setSelectedCity] = useState<string | null>(initialCity)
  const [selectedBudget, setSelectedBudget] = useState<BudgetValue>(initialBudget)
  const [selectedGoodFor, setSelectedGoodFor] = useState<SearchGoodForValue | null>(initialGoodFor)
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)
  const [animatedPlaceholder, setAnimatedPlaceholder] = useState('')
  const activeTypedQuery = normalizeTypedSearchText(rawQuery)
  const hasActiveFilters = Boolean(selectedCategoryValue || selectedCity || selectedBudget || selectedGoodFor)
  const canSearch = activeTypedQuery.length > 0 || hasActiveFilters

  const handleSearch = () => {
    if (!canSearch) {
      return
    }

    navigateToPath(
      buildSearchPath({
        q: activeTypedQuery,
        category: selectedCategoryValue,
        city: selectedCity,
        goodFor: selectedGoodFor,
        budget: selectedBudget,
        page: 1,
      })
    )
  }

  const handleClearFilters = () => {
    setSelectedCategoryValue(null)
    setSelectedCity(null)
    setSelectedBudget(null)
    setSelectedGoodFor(null)
  }

  useEffect(() => {
    if (!isFiltersOpen) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isFiltersOpen])

  useEffect(() => {
    if (rawQuery.length > 0) {
      return
    }

    let isCancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let queryIndex = 0
    let charIndex = 0
    let isDeleting = false

    const tick = () => {
      const currentQuery = sampleSearchQueries[queryIndex] ?? ''

      if (!isDeleting) {
        charIndex += 1
        setAnimatedPlaceholder(currentQuery.slice(0, charIndex))

        if (charIndex === currentQuery.length) {
          isDeleting = true
          timeoutId = setTimeout(step, 1400)
          return
        }

        timeoutId = setTimeout(step, 65)
        return
      }

      charIndex -= 1
      setAnimatedPlaceholder(currentQuery.slice(0, Math.max(charIndex, 0)))

      if (charIndex === 0) {
        isDeleting = false
        queryIndex = (queryIndex + 1) % sampleSearchQueries.length
        timeoutId = setTimeout(step, 260)
        return
      }

      timeoutId = setTimeout(step, 28)
    }

    const step = () => {
      if (isCancelled) return
      tick()
    }

    timeoutId = setTimeout(step, 420)

    return () => {
      isCancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [rawQuery])

  if (shouldShowResults) {
    return (
      <HomePage
        key={window.location.search || 'search-results'}
        initialSearchState={{
          rawQuery: initialQuery,
          categoryId: initialCategoryValue,
          areaId: initialCity,
          goodFor: initialGoodFor,
          budget: initialBudget ?? null,
          page: initialPage,
          autoSearch: true,
        }}
      />
    )
  }

  return (
    <div className="gala-page-background min-h-screen overflow-x-hidden text-[var(--text)]">
      <AppHeader minimal />

      <main
        className="relative mx-auto flex min-h-[calc(100dvh-64px)] w-full items-center justify-center px-5 pb-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] pt-6 sm:px-6 sm:pb-[calc(env(safe-area-inset-bottom,0px)+4.75rem)] sm:pt-8 lg:pb-0 lg:px-8"
      >
        <section
          className="relative mx-auto flex w-full max-w-[480px] flex-col items-center text-center sm:max-w-[560px] lg:max-w-[640px] xl:max-w-[720px]"
        >
          <div className="mb-5 flex w-full justify-start -ml-1 sm:-ml-2">
            <MinimalBackNav to="/" label="Home" preferHistory={false} />
          </div>

          <section className="w-full text-center">
            <label htmlFor="search-input" className="sr-only">
              Search place, city, or vibe
            </label>
            <div className="mx-auto w-full">
              <div className="text-center">
                <p className="text-[12px] font-black uppercase tracking-[0.18em] text-[#7b92b3] sm:text-[13px]">Search</p>
                <h1 className="mt-3 text-[30px] font-black leading-[1.05] tracking-[-0.03em] text-[#16325c] sm:text-[38px] lg:text-[44px]">
                  Where do you want to go?
                </h1>
                <p className="mx-auto mt-3 max-w-[32ch] text-[14px] font-medium leading-6 text-[#5f7391] sm:text-[15px]">
                  Find cafes, parks, malls, date spots, and gala ideas around Metro Manila.
                </p>

                <div className="mt-6">
                  <div className="flex overflow-hidden rounded-[22px] border border-[#d4e0f2] bg-white text-left shadow-[0_12px_30px_rgba(42,111,240,0.08)] transition focus-within:border-[#7aa8f8] focus-within:shadow-[0_0_0_4px_rgba(42,111,240,0.10),0_14px_32px_rgba(42,111,240,0.1)]">
                    <div className="flex min-w-0 flex-1 items-center bg-white">
                      <input
                        id="search-input"
                        type="text"
                        value={rawQuery}
                        onChange={(event) => {
                          setRawQuery(event.target.value)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            handleSearch()
                          }
                        }}
                        placeholder={animatedPlaceholder || 'Search'}
                        className="h-[60px] min-w-0 flex-1 bg-white pl-5 pr-2 text-[15px] font-semibold text-slate-900 outline-none placeholder:font-medium placeholder:text-[#97a7c0] lg:h-[64px] lg:text-[16px]"
                      />
                      {rawQuery.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setRawQuery('')}
                          aria-label="Clear search"
                          className="mr-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eef4fd] text-[#5a78a5] transition hover:bg-[#e3edfb] hover:text-[#245fc4]"
                        >
                          <AppIcon name="clear" className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={handleSearch}
                      disabled={!canSearch}
                      aria-label="Search places"
                      className={`m-2 inline-flex h-[44px] w-[44px] items-center justify-center rounded-full transition lg:h-[48px] lg:w-[48px] ${
                        canSearch ? 'bg-[#2a6ff0] text-white hover:bg-[#245fc4]' : 'bg-[#dfeafb] text-[#8da4c8]'
                      }`}
                    >
                      <AppIcon name="search" className="h-5 w-5" />
                    </button>
                  </div>

                </div>
              </div>
            </div>
          </section>

          <div className="mt-4 flex w-full justify-center sm:mt-5 lg:mt-6">
            <img
              src={searchBeforeChibi}
              alt=""
              className="block h-auto w-[clamp(280px,72vw,360px)] max-w-full object-contain sm:w-[clamp(260px,34vw,360px)] lg:w-[clamp(300px,28vw,420px)]"
              loading="eager"
            />
          </div>
        </section>
      </main>

      {isFiltersOpen ? (
        <div className="fixed inset-0 z-[5000] flex items-end bg-slate-950/30">
          <button
            type="button"
            aria-label="Close filters"
            className="absolute inset-0"
            onClick={() => setIsFiltersOpen(false)}
          />
          <section className="relative max-h-[84vh] w-full overflow-y-auto rounded-t-[24px] bg-white px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-18px_44px_rgba(17,24,39,0.18)]">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300" />
            <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-3">
              <button
                type="button"
                onClick={handleClearFilters}
                className="text-sm font-semibold text-[#245fc4] transition hover:text-[#163f96]"
              >
                Reset
              </button>
              <h2 className="text-[17px] font-semibold text-slate-900">Filters</h2>
              <button
                type="button"
                aria-label="Close filters"
                onClick={() => setIsFiltersOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200"
              >
                <AppIcon name="clear" className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7b92b3]">Category</p>
                <div className="flex flex-wrap gap-2">
                  <AppChip
                    selected={selectedCategoryValue === null}
                    onClick={() => setSelectedCategoryValue(null)}
                    className="px-3.5 py-2 text-[12px] font-semibold text-[#284e84]"
                  >
                    Any category
                  </AppChip>
                  {searchCategoryChoices.map((category) => (
                    <AppChip
                      key={category.value}
                      selected={selectedCategoryValue === category.value}
                      onClick={() => setSelectedCategoryValue(category.value)}
                      className="px-3.5 py-2 text-[12px] font-semibold text-[#284e84]"
                    >
                      {category.label}
                    </AppChip>
                  ))}
                </div>
              </div>

              <div className="grid gap-2">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7b92b3]">City</p>
                <div className="flex flex-wrap gap-2">
                  <AppChip
                    selected={selectedCity === null}
                    onClick={() => setSelectedCity(null)}
                    className="px-3.5 py-2 text-[12px] font-semibold text-[#284e84]"
                  >
                    Any city
                  </AppChip>
                  {cityOptions.map((city) => (
                    <AppChip
                      key={city.id}
                      selected={selectedCity === city.id}
                      onClick={() => setSelectedCity(city.id)}
                      className="px-3.5 py-2 text-[12px] font-semibold text-[#284e84]"
                    >
                      {city.name}
                    </AppChip>
                  ))}
                </div>
              </div>

              <div className="grid gap-2">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7b92b3]">Vibe</p>
                <div className="flex flex-wrap gap-2">
                  <AppChip
                    selected={selectedGoodFor === null}
                    onClick={() => setSelectedGoodFor(null)}
                    className="px-3.5 py-2 text-[12px] font-semibold text-[#284e84]"
                  >
                    Any vibe
                  </AppChip>
                  {goodForOptions.map((goodFor) => (
                    <AppChip
                      key={goodFor.value}
                      selected={selectedGoodFor === goodFor.value}
                      onClick={() => setSelectedGoodFor(goodFor.value)}
                      className="px-3.5 py-2 text-[12px] font-semibold text-[#284e84]"
                    >
                      {goodFor.label}
                    </AppChip>
                  ))}
                </div>
              </div>

              <div className="grid gap-2">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7b92b3]">Budget</p>
                <div className="flex flex-wrap gap-2">
                  {budgetOptions.map((budget) => (
                    <AppChip
                      key={budget.value || 'any'}
                      selected={(budget.value === '' && selectedBudget === null) || selectedBudget === budget.value}
                      onClick={() => setSelectedBudget(budget.value === '' ? null : budget.value)}
                      className="px-3.5 py-2 text-[12px] font-semibold text-[#284e84]"
                    >
                      {budget.label}
                    </AppChip>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  handleClearFilters()
                  setIsFiltersOpen(false)
                }}
                className="inline-flex min-h-11 items-center rounded-full px-1 text-sm font-semibold text-[#245fc4] transition hover:text-[#163f96]"
              >
                Clear filters
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsFiltersOpen(false)
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#2a6ff0] px-5 text-sm font-semibold text-white transition hover:bg-[#245fc4]"
              >
                Apply filters
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

export default SearchPageWords
