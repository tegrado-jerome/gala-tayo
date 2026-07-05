import { useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader'
import { AppIcon } from '../components/AppIcon'
import { navigateToPath } from '../utils/navigation'
import HomePage from './HomePage'
import searchBeforeChibi from '../assets/chibis/core/search-places/chibi-search-places-before-active-state.webp'

type BudgetValue = 'free' | 'under-500' | '500-1000' | '1000-2000' | '2000-plus'

type SearchCategoryChoice = {
  value: string
  label: string
  filterId: string | null
  queryTerm?: string
}

const searchCategoryChoices: SearchCategoryChoice[] = [
  { value: 'kainan', label: 'Kainan', filterId: 'kainan' },
  { value: 'cafe', label: 'Cafe', filterId: 'cafe' },
  { value: 'mall', label: 'Mall', filterId: 'mall' },
  { value: 'parke', label: 'Parke', filterId: 'parke' },
  { value: 'nature', label: 'Nature', filterId: null, queryTerm: 'nature' },
  { value: 'museum', label: 'Museum', filterId: 'museum' },
  { value: 'heritage', label: 'Heritage', filterId: 'heritage' },
  { value: 'tourist', label: 'Tourist', filterId: 'tourist' },
  { value: 'activity', label: 'Activity', filterId: null, queryTerm: 'activity' },
  { value: 'cinema', label: 'Cinema', filterId: 'cinema' },
  { value: 'nightlife', label: 'Nightlife', filterId: 'nightlife' },
  { value: 'stay', label: 'Stay', filterId: null, queryTerm: 'stay' },
]

const cityOptions = [
  { id: 'caloocan', name: 'Caloocan' },
  { id: 'las-pinas', name: 'Las Pinas' },
  { id: 'makati', name: 'Makati' },
  { id: 'malabon', name: 'Malabon' },
  { id: 'mandaluyong', name: 'Mandaluyong' },
  { id: 'manila', name: 'Manila' },
  { id: 'marikina', name: 'Marikina' },
  { id: 'muntinlupa', name: 'Muntinlupa' },
  { id: 'navotas', name: 'Navotas' },
  { id: 'paranaque', name: 'Paranaque' },
  { id: 'pasay', name: 'Pasay' },
  { id: 'pasig', name: 'Pasig' },
  { id: 'quezon-city', name: 'Quezon City' },
  { id: 'san-juan', name: 'San Juan' },
  { id: 'taguig', name: 'Taguig' },
  { id: 'valenzuela', name: 'Valenzuela' },
  { id: 'pateros', name: 'Pateros' },
]

const budgetOptions: Array<{ value: BudgetValue; label: string }> = [
  { value: 'free', label: 'free' },
  { value: 'under-500', label: '₱500 and below' },
  { value: '500-1000', label: '₱500 to ₱1,000' },
  { value: '1000-2000', label: '₱1,000 to ₱2,000' },
  { value: '2000-plus', label: '₱2,000 and above' },
]

function normalizeSearchText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function pluralizeCategoryLabel(label: string) {
  const normalized = label.toLowerCase()

  if (normalized === 'cafe') return 'cafes'
  if (normalized === 'cinema') return 'cinemas'
  if (normalized === 'nightlife') return 'nightlife spots'
  if (normalized === 'heritage') return 'heritage spots'
  if (normalized === 'tourist') return 'tourist spots'
  if (normalized === 'activity') return 'activity spots'
  if (normalized === 'stay') return 'stay spots'
  if (normalized === 'nature') return 'nature spots'

  return `${normalized}s`
}

function buildSearchSentence(categoryLabel: string | null, cityName: string | null, budgetLabel: string | null) {
  if (!categoryLabel && !cityName && !budgetLabel) {
    return 'Showing all places'
  }

  const categoryPart = categoryLabel ? pluralizeCategoryLabel(categoryLabel) : 'places'
  const cityPart = cityName ? ` in ${cityName}` : ''

  if (!budgetLabel) {
    return `Showing ${categoryPart}${cityPart}`
  }

  return `Showing ${categoryPart}${cityPart} around ${budgetLabel}`
}

function buildComposerQuery({
  rawQuery,
  categoryLabel,
  cityName,
  budgetLabel,
}: {
  rawQuery: string
  categoryLabel: string | null
  cityName: string | null
  budgetLabel: string | null
}) {
  const trimmedQuery = normalizeSearchText(rawQuery)
  const parts: string[] = []

  if (trimmedQuery) {
    parts.push(trimmedQuery)
  }

  if (categoryLabel) {
    parts.push(categoryLabel.toLowerCase())
  }

  if (cityName) {
    parts.push(`in ${cityName}`)
  }

  if (budgetLabel) {
    parts.push(`for ${budgetLabel.toLowerCase()}`)
  }

  return normalizeSearchText(parts.join(' '))
}

function SearchPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const runSearch = params.get('run') === '1'
  const initialQuery = params.get('q') ?? ''
  const initialCategoryValue = params.get('category')
  const initialCity = params.get('city')
  const initialBudget = params.get('budget') as BudgetValue | null

  const [rawQuery, setRawQuery] = useState(initialQuery)
  const [selectedCategoryValue, setSelectedCategoryValue] = useState<string | null>(initialCategoryValue)
  const [selectedCity, setSelectedCity] = useState<string | null>(initialCity)
  const [selectedBudget, setSelectedBudget] = useState<BudgetValue | null>(initialBudget)
  const [validationMessage, setValidationMessage] = useState<string | null>(null)

  const selectedCategory = searchCategoryChoices.find((choice) => choice.value === selectedCategoryValue) ?? null
  const selectedCityName = cityOptions.find((city) => city.id === selectedCity)?.name ?? null
  const selectedBudgetLabel = budgetOptions.find((budget) => budget.value === selectedBudget)?.label ?? null
  const searchSentence = buildSearchSentence(selectedCategory?.label ?? null, selectedCityName, selectedBudgetLabel)
  const activeFilterCount = [selectedCategoryValue, selectedCity, selectedBudget].filter(Boolean).length
  const filterOnlyQuery = buildComposerQuery({
    rawQuery: '',
    categoryLabel: selectedCategory?.label ?? null,
    cityName: selectedCityName,
    budgetLabel: selectedBudgetLabel,
  })
  const shouldPreserveCustomQuery = Boolean(normalizeSearchText(rawQuery) && normalizeSearchText(rawQuery) !== filterOnlyQuery)

  const syncQueryWithFilters = ({
    categoryValue,
    cityValue,
    budgetValue,
  }: {
    categoryValue: string | null
    cityValue: string | null
    budgetValue: BudgetValue | null
  }) => {
    if (shouldPreserveCustomQuery) {
      return
    }

    const nextCategory = searchCategoryChoices.find((choice) => choice.value === categoryValue) ?? null
    const nextCityName = cityOptions.find((city) => city.id === cityValue)?.name ?? null
    const nextBudgetLabel = budgetOptions.find((budget) => budget.value === budgetValue)?.label ?? null

    setRawQuery(
      buildComposerQuery({
        rawQuery: '',
        categoryLabel: nextCategory?.label ?? null,
        cityName: nextCityName,
        budgetLabel: nextBudgetLabel,
      })
    )
  }

  const handleSearch = () => {
    const query = normalizeSearchText(rawQuery || selectedCategory?.queryTerm || '')
    const hasSomething = Boolean(query || selectedCategoryValue || selectedCity || selectedBudget)

    if (!hasSomething) {
      setValidationMessage('Type a vibe or choose filters first.')
      return
    }

    const nextParams = new URLSearchParams()
    if (query) nextParams.set('q', query)
    if (selectedCategoryValue) nextParams.set('category', selectedCategoryValue)
    if (selectedCity) nextParams.set('city', selectedCity)
    if (selectedBudget) nextParams.set('budget', selectedBudget)
    nextParams.set('run', '1')
    navigateToPath(`/search?${nextParams.toString()}`)
  }

  if (runSearch) {
    return (
      <HomePage
        initialSearchState={{
          rawQuery: normalizeSearchText(rawQuery || selectedCategory?.queryTerm || ''),
          categoryId: selectedCategory?.filterId ?? null,
          areaId: selectedCity,
          budget: selectedBudget,
          autoSearch: true,
        }}
      />
    )
  }

  return (
    <div className="gala-page-background min-h-screen text-[var(--text)]">
      <AppHeader minimal />

      <main className="relative mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-[980px] flex-col px-4 pb-6 pt-3 sm:min-h-[calc(100vh-96px)] sm:px-6 sm:pt-4 lg:px-10">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.68),rgba(255,255,255,0))]" />
        <section className="relative flex flex-1 flex-col items-center text-center">
          <section className="relative z-20 w-full max-w-[760px] overflow-hidden rounded-[32px] bg-[linear-gradient(180deg,#1697f3_0%,#1777ea_100%)] px-4 py-4 text-left shadow-[0_24px_54px_rgba(23,119,234,0.28)] sm:px-5 sm:py-5">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-0 top-0 h-full w-[68%] bg-[linear-gradient(205deg,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0.18)_28%,rgba(255,255,255,0)_29%)]" />
              <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
            </div>
            <div className="relative">
              <label htmlFor="search-input" className="sr-only">
                Search places, cities, or categories
              </label>

              <div className="flex items-stretch gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-3 rounded-[22px] border-2 border-white/80 bg-[rgba(19,132,234,0.28)] px-4 py-3 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-sm sm:px-5 sm:py-4">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/12 text-white">
                    <AppIcon name="search" className="h-5 w-5" />
                  </div>
                  <textarea
                    id="search-input"
                    value={rawQuery}
                    onChange={(event) => {
                      setRawQuery(event.target.value)
                      if (validationMessage) setValidationMessage(null)
                    }}
                    placeholder="Search"
                    rows={2}
                    className="min-h-[58px] flex-1 resize-none bg-transparent pt-1 text-[1.02rem] font-semibold leading-6 text-white outline-none placeholder:font-semibold placeholder:text-white/78"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSearch}
                  aria-label="Search places"
                  className="flex min-h-[88px] w-[62px] shrink-0 items-center justify-center rounded-[22px] border-2 border-white/80 bg-[rgba(19,132,234,0.28)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] transition hover:bg-white/20"
                >
                  <AppIcon name="filter" className="h-7 w-7" />
                </button>
              </div>

              <div className="mt-3 rounded-[24px] bg-white/12 px-3 py-3 backdrop-blur-[10px] sm:px-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2 rounded-full bg-white/18 px-3 py-2 text-sm font-bold text-white">
                    <AppIcon name="filter" className="h-4 w-4" />
                    <span>Filters</span>
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-black text-[#1777ea]">
                      {activeFilterCount}
                    </span>
                  </div>

                  <label className="min-w-0 flex-1 sm:flex-none">
                    <select
                      value={selectedCategoryValue ?? ''}
                      onChange={(event) => {
                        const nextCategoryValue = event.target.value || null
                        setSelectedCategoryValue(nextCategoryValue)
                        syncQueryWithFilters({
                          categoryValue: nextCategoryValue,
                          cityValue: selectedCity,
                          budgetValue: selectedBudget,
                        })
                      }}
                      className="min-h-11 w-full rounded-full border border-white/28 bg-white/95 px-4 text-sm font-bold text-[#1d4f96] outline-none transition focus:border-white sm:min-w-[152px]"
                    >
                      <option value="">Category</option>
                      {searchCategoryChoices.map((category) => (
                        <option key={category.value} value={category.value}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="min-w-0 flex-1 sm:flex-none">
                    <select
                      value={selectedCity ?? ''}
                      onChange={(event) => {
                        const nextCityValue = event.target.value || null
                        setSelectedCity(nextCityValue)
                        syncQueryWithFilters({
                          categoryValue: selectedCategoryValue,
                          cityValue: nextCityValue,
                          budgetValue: selectedBudget,
                        })
                      }}
                      className="min-h-11 w-full rounded-full border border-white/28 bg-white/95 px-4 text-sm font-bold text-[#1d4f96] outline-none transition focus:border-white sm:min-w-[148px]"
                    >
                      <option value="">City</option>
                      {cityOptions.map((city) => (
                        <option key={city.id} value={city.id}>
                          {city.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="min-w-0 flex-1 sm:flex-none">
                    <select
                      value={selectedBudget ?? ''}
                      onChange={(event) => {
                        const nextBudgetValue = (event.target.value as BudgetValue) || null
                        setSelectedBudget(nextBudgetValue)
                        syncQueryWithFilters({
                          categoryValue: selectedCategoryValue,
                          cityValue: selectedCity,
                          budgetValue: nextBudgetValue,
                        })
                      }}
                      className="min-h-11 w-full rounded-full border border-white/28 bg-white/95 px-4 text-sm font-bold text-[#1d4f96] outline-none transition focus:border-white sm:min-w-[170px]"
                    >
                      <option value="">Budget</option>
                      {budgetOptions.map((budget) => (
                        <option key={budget.value} value={budget.value}>
                          {budget.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {(selectedBudgetLabel || selectedCategory?.label || selectedCityName) ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedBudgetLabel ? (
                      <span className="rounded-full border border-white/24 bg-white/18 px-3 py-1.5 text-sm font-semibold text-white">
                        {selectedBudgetLabel}
                      </span>
                    ) : null}
                    {selectedCategory?.label ? (
                      <span className="rounded-full border border-white/24 bg-white/18 px-3 py-1.5 text-sm font-semibold text-white">
                        {selectedCategory.label}
                      </span>
                    ) : null}
                    {selectedCityName ? (
                      <span className="rounded-full border border-white/24 bg-white/18 px-3 py-1.5 text-sm font-semibold text-white">
                        {selectedCityName}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <p className="mt-4 text-sm font-semibold text-white/88">{searchSentence}</p>
              {validationMessage ? <p className="mt-3 text-sm font-bold text-white">{validationMessage}</p> : null}
            </div>
          </section>

          <div className="relative -mt-8 flex flex-1 w-full items-start justify-center overflow-hidden pt-0 sm:-mt-10 sm:pt-1">
            <div className="pointer-events-none absolute left-8 top-10 h-10 w-20 rounded-full bg-white/60 blur-sm" />
            <div className="pointer-events-none absolute right-8 top-14 h-12 w-24 rounded-full bg-white/65 blur-sm" />
            <div className="pointer-events-none absolute inset-x-0 top-10 mx-auto h-48 w-48 rounded-full bg-[rgba(115,175,255,0.3)] blur-3xl sm:h-60 sm:w-60" />
            <img
              src={searchBeforeChibi}
              alt=""
              className="relative z-10 h-[360px] w-auto max-w-none object-contain sm:h-[440px] lg:h-[500px]"
              loading="eager"
            />
          </div>
        </section>
      </main>

    </div>
  )
}

export default SearchPage
