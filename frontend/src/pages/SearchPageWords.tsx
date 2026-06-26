import { useEffect, useState } from 'react'
import AppHeader from '../components/AppHeader'
import { AppIcon } from '../components/AppIcon'
import { navigateToPath } from '../utils/navigation'
import { buildSearchPath, hasActiveSearchCriteria, normalizeTypedSearchText, readSearchUrlState, type SearchBudgetValue, type SearchGoodForValue } from '../utils/searchParams'
import HomePage from './HomePage'
import searchBeforeChibi from '../assets/chibis/core/search-places/chibi-search-places-before-active-state.webp'

type BudgetValue = 'any' | SearchBudgetValue
type BuilderField = 'category' | 'city' | 'good_for' | 'budget' | null

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
  { id: 'las-pinas', name: 'Las Pi\u00f1as' },
  { id: 'makati', name: 'Makati' },
  { id: 'malabon', name: 'Malabon' },
  { id: 'mandaluyong', name: 'Mandaluyong' },
  { id: 'manila', name: 'Manila' },
  { id: 'marikina', name: 'Marikina' },
  { id: 'muntinlupa', name: 'Muntinlupa' },
  { id: 'navotas', name: 'Navotas' },
  { id: 'paranaque', name: 'Para\u00f1aque' },
  { id: 'pasay', name: 'Pasay' },
  { id: 'pasig', name: 'Pasig' },
  { id: 'quezon-city', name: 'Quezon City' },
  { id: 'san-juan', name: 'San Juan' },
  { id: 'taguig', name: 'Taguig' },
  { id: 'valenzuela', name: 'Valenzuela' },
  { id: 'pateros', name: 'Pateros' },
]

const budgetOptions: Array<{ value: BudgetValue; label: string; preview: string }> = [
  { value: 'any', label: 'Any budget', preview: 'Any budget' },
  { value: 'free', label: 'Free', preview: 'Free' },
  { value: 'under-500', label: 'Under \u20b1500', preview: 'Under \u20b1500' },
  { value: '500-1000', label: '\u20b1500 to \u20b11,000', preview: '\u20b1500 to \u20b11,000' },
  { value: '1000-2000', label: '\u20b11,000 to \u20b12,000', preview: '\u20b11,000 to \u20b12,000' },
  { value: '2000-plus', label: '\u20b12,000+', preview: '\u20b12,000+' },
]

const sampleSearchQueries = [
  'cozy cafe in Makati for reading',
  'fun date place in BGC tonight',
  'nature spot near Quezon City',
  'budget-friendly food trip in Manila',
]

const typedSuggestionChips = ['Budget cafe', 'Date spot', 'Near mall', 'Rainy day', 'Barkada food']

function getCategorySearchPhrase(categoryLabel: string) {
  switch (categoryLabel.toLowerCase()) {
    case 'cafe':
      return 'cafes'
    case 'kainan':
      return 'kainan spots'
    case 'mall':
      return 'malls'
    case 'parke':
      return 'parks'
    case 'nature':
      return 'nature places'
    case 'museum':
      return 'museums'
    case 'heritage':
      return 'heritage places'
    case 'tourist':
      return 'tourist places'
    case 'activity':
      return 'activity places'
    case 'cinema':
      return 'cinemas'
    case 'nightlife':
      return 'nightlife places'
    case 'stay':
      return 'stay places'
    default:
      return `${categoryLabel.toLowerCase()} places`
  }
}

function getBudgetSearchPhrase(budgetLabel: string | null) {
  if (!budgetLabel) {
    return null
  }

  if (budgetLabel === 'Free') {
    return 'free'
  }

  return budgetLabel.toLowerCase()
}

function buildSearchPreview(categoryLabel: string | null, cityName: string | null, goodForLabel: string | null, budgetLabel: string | null) {
  if (!categoryLabel && !cityName && !goodForLabel && !budgetLabel) {
    return 'Pick at least one choice to start.'
  }

  const categoryPhrase = categoryLabel ? getCategorySearchPhrase(categoryLabel) : 'places'
  const budgetPhrase = getBudgetSearchPhrase(budgetLabel)
  const goodForPhrase = goodForLabel ? `good for ${goodForLabel.toLowerCase()}` : null

  if (categoryLabel && cityName && goodForPhrase) {
    return `Find ${categoryPhrase} ${goodForPhrase} in ${cityName}`
  }

  if (categoryLabel && goodForPhrase) {
    return `Find ${categoryPhrase} ${goodForPhrase}`
  }

  if (cityName && goodForPhrase) {
    return `Find places ${goodForPhrase} in ${cityName}`
  }

  if (goodForPhrase) {
    return `Find places ${goodForPhrase}`
  }

  if (budgetPhrase && categoryLabel && cityName) {
    return `Find ${budgetPhrase} ${categoryPhrase} in ${cityName}`
  }

  if (budgetPhrase && categoryLabel) {
    return `Find ${budgetPhrase} ${categoryPhrase}`
  }

  if (budgetPhrase && cityName) {
    return `Find ${budgetPhrase} places in ${cityName}`
  }

  if (categoryLabel && cityName) {
    return `Find ${categoryPhrase} in ${cityName}`
  }

  if (categoryLabel) {
    return `Find ${categoryPhrase}`
  }

  if (cityName) {
    return `Find places in ${cityName}`
  }

  return `Find ${budgetPhrase} places`
}

function buildComposerQuery({
  rawQuery,
  categoryLabel,
  cityName,
  goodForLabel,
  budgetLabel,
}: {
  rawQuery: string
  categoryLabel: string | null
  cityName: string | null
  goodForLabel: string | null
  budgetLabel: string | null
}) {
  const trimmedQuery = normalizeTypedSearchText(rawQuery)
  const parts: string[] = []

  if (trimmedQuery) {
    parts.push(trimmedQuery)
  }

  if (budgetLabel) {
    parts.push(budgetLabel.toLowerCase())
  }

  if (categoryLabel) {
    parts.push(categoryLabel.toLowerCase())
  }

  if (goodForLabel) {
    parts.push(`for ${goodForLabel.toLowerCase()}`)
  }

  if (cityName) {
    parts.push(`in ${cityName}`)
  }

  return normalizeTypedSearchText(parts.join(' '))
}

function resolveCategoryIconName(categoryValue: string) {
  switch (categoryValue) {
    case 'activity':
      return 'categoryActivity' as const
    case 'cafe':
      return 'cafe' as const
    case 'kainan':
      return 'categoryKainan' as const
    case 'mall':
      return 'categoryMall' as const
    case 'parke':
      return 'categoryParke' as const
    case 'nature':
      return 'categoryNature' as const
    case 'museum':
      return 'categoryMuseum' as const
    case 'heritage':
      return 'categoryHeritage' as const
    case 'tourist':
      return 'categoryTourist' as const
    case 'cinema':
      return 'categoryCinema' as const
    case 'nightlife':
      return 'categoryNightlife' as const
    default:
      return 'categoryStay' as const
  }
}

function getActiveFilterCount({
  selectedCategoryValue,
  selectedCity,
  selectedGoodFor,
  selectedBudget,
}: {
  selectedCategoryValue: string | null
  selectedCity: string | null
  selectedGoodFor: SearchGoodForValue | null
  selectedBudget: BudgetValue | null
}) {
  return [
    selectedCategoryValue,
    selectedCity,
    selectedGoodFor,
    selectedBudget && selectedBudget !== 'any' ? selectedBudget : null,
  ].filter(Boolean).length
}

function SearchPageWords() {
  const routeSearchState = readSearchUrlState(window.location.search)
  const initialQuery = routeSearchState.q
  const initialCategoryValue = routeSearchState.category
  const initialCity = routeSearchState.city
  const initialPage = routeSearchState.page
  const initialBudget = routeSearchState.budget
  const initialGoodFor = routeSearchState.goodFor
  const shouldShowResults = hasActiveSearchCriteria(routeSearchState)

  const [rawQuery, setRawQuery] = useState(initialQuery)
  const [selectedCategoryValue, setSelectedCategoryValue] = useState<string | null>(initialCategoryValue)
  const [selectedCity, setSelectedCity] = useState<string | null>(initialCity)
  const [selectedBudget, setSelectedBudget] = useState<BudgetValue | null>(initialBudget)
  const [selectedGoodFor, setSelectedGoodFor] = useState<SearchGoodForValue | null>(initialGoodFor)
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)
  const [activeField, setActiveField] = useState<BuilderField>(null)
  const [animatedPlaceholder, setAnimatedPlaceholder] = useState('')

  const selectedCategory = searchCategoryChoices.find((choice) => choice.value === selectedCategoryValue) ?? null
  const selectedCityName = cityOptions.find((city) => city.id === selectedCity)?.name ?? null
  const selectedBudgetOption = budgetOptions.find((option) => option.value === selectedBudget) ?? null
  const selectedGoodForOption = goodForOptions.find((option) => option.value === selectedGoodFor) ?? null
  const effectiveBudgetPreview = selectedBudgetOption?.value === 'any' ? null : selectedBudgetOption?.preview ?? null
  const searchPreviewText = buildSearchPreview(
    selectedCategory?.label ?? null,
    selectedCityName,
    selectedGoodForOption?.label ?? null,
    effectiveBudgetPreview
  )
  const activeTypedQuery = normalizeTypedSearchText(rawQuery)
  const hasBuildSelection = Boolean(selectedCategoryValue || selectedCity || selectedGoodFor || (selectedBudget && selectedBudget !== 'any'))
  const activeFilterCount = getActiveFilterCount({
    selectedCategoryValue,
    selectedCity,
    selectedGoodFor,
    selectedBudget,
  })
  const canSearch = activeTypedQuery.length > 0 || hasBuildSelection
  const filterOnlyQuery = buildComposerQuery({
    rawQuery: '',
    categoryLabel: selectedCategory?.label ?? null,
    cityName: selectedCityName,
    goodForLabel: selectedGoodForOption?.label ?? null,
    budgetLabel: effectiveBudgetPreview,
  })
  const shouldPreserveCustomQuery = Boolean(activeTypedQuery && activeTypedQuery !== filterOnlyQuery)

  const syncQueryWithFilters = ({
    categoryValue,
    cityValue,
    goodForValue,
    budgetValue,
  }: {
    categoryValue: string | null
    cityValue: string | null
    goodForValue: SearchGoodForValue | null
    budgetValue: BudgetValue | null
  }) => {
    if (shouldPreserveCustomQuery) {
      return
    }

    const nextCategoryLabel = searchCategoryChoices.find((choice) => choice.value === categoryValue)?.label ?? null
    const nextCityName = cityOptions.find((city) => city.id === cityValue)?.name ?? null
    const nextGoodForLabel = goodForOptions.find((option) => option.value === goodForValue)?.label ?? null
    const nextBudgetOption = budgetOptions.find((option) => option.value === budgetValue) ?? null
    const nextBudgetLabel = nextBudgetOption?.value === 'any' ? null : nextBudgetOption?.preview ?? null

    setRawQuery(
      buildComposerQuery({
        rawQuery: '',
        categoryLabel: nextCategoryLabel,
        cityName: nextCityName,
        goodForLabel: nextGoodForLabel,
        budgetLabel: nextBudgetLabel,
      })
    )
  }

  const handleClearFilters = () => {
    setSelectedCategoryValue(null)
    setSelectedCity(null)
    setSelectedGoodFor(null)
    setSelectedBudget(null)
    setActiveField(null)

    if (!shouldPreserveCustomQuery) {
      setRawQuery('')
    }
  }

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
        budget: selectedBudget && selectedBudget !== 'any' ? selectedBudget : null,
        page: 1,
      })
    )
  }

  const closeActiveFilterSection = () => {
    setActiveField(null)
  }

  useEffect(() => {
    if (!isFiltersOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isFiltersOpen])

  useEffect(() => {
    if (rawQuery.length > 0) {
      setAnimatedPlaceholder('')
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
        className="relative mx-auto w-full max-w-[390px] px-5 pb-4 pt-4 sm:max-w-[720px] sm:px-8 sm:pb-10 sm:pt-5 lg:max-w-[980px] lg:px-10 lg:pb-8 lg:pt-6"
      >
        <section
          className="relative mx-auto flex w-full max-w-[520px] flex-col items-center justify-start text-center sm:max-w-[560px] lg:max-w-[620px]"
        >
          <section className="w-full text-center">
            <label htmlFor="search-input" className="sr-only">
              Search place, city, or vibe
            </label>
            <div className="mx-auto w-full max-w-[560px]">
              <div className="text-left">
                <div className="mb-3 flex items-center justify-between gap-3 px-1">
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">Discover</p>
                    <p className="mt-1 text-[14px] text-[var(--muted)]">Search places around Metro Manila</p>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--accent)]" aria-hidden="true">
                    <AppIcon name="place" className="h-4 w-4" />
                  </div>
                </div>

                <div className="flex overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-sm transition focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_4px_rgba(30,58,138,0.10),0_14px_32px_rgba(17,24,39,0.08)]">
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
                      className="h-[60px] min-w-0 flex-1 bg-white pl-5 pr-2 text-[15px] font-medium text-slate-900 outline-none placeholder:font-normal placeholder:text-[var(--text-light)] lg:h-[64px] lg:text-[16px]"
                    />
                    {rawQuery.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setRawQuery('')}
                        aria-label="Clear search"
                        className="mr-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bg-soft)] text-[var(--muted)] transition hover:bg-[var(--primary-soft)] hover:text-[var(--accent)]"
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
                      canSearch ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-deep)]' : 'bg-[var(--bg-soft)] text-[var(--text-light)]'
                    }`}
                  >
                    <AppIcon name="search" className="h-5 w-5" />
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsFiltersOpen(true)
                      setActiveField((current) => current ?? 'category')
                    }}
                    className="inline-flex items-center gap-2 rounded-full bg-[var(--bg-soft)] px-3 py-2 text-[13px] font-semibold text-[var(--accent)] transition hover:bg-[var(--primary-soft)]"
                  >
                    <AppIcon name="filter" className="h-4 w-4" />
                    <span>Filters</span>
                    {activeFilterCount > 0 ? (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[11px] leading-none text-white">
                        {activeFilterCount}
                      </span>
                    ) : null}
                  </button>
                  {activeFilterCount > 0 ? (
                    <button
                      type="button"
                      onClick={handleClearFilters}
                      className="inline-flex h-9 items-center rounded-full px-2 text-[13px] font-medium text-[var(--accent)] transition hover:text-[var(--accent-deep)]"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {typedSuggestionChips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setRawQuery(chip)}
                      className="rounded-full border border-[var(--line)] bg-white px-3.5 py-2 text-[13px] font-medium text-[#374151] transition hover:border-[var(--accent)] hover:bg-[var(--primary-soft)] hover:text-[var(--accent)]"
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                {(selectedCategory?.label || selectedCityName || selectedGoodForOption?.label || effectiveBudgetPreview) ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {effectiveBudgetPreview ? (
                      <span className="rounded-full bg-[var(--primary-soft)] px-3 py-1.5 text-[12px] font-medium text-[var(--accent)]">
                        {effectiveBudgetPreview}
                      </span>
                    ) : null}
                    {selectedCategory?.label ? (
                      <span className="rounded-full bg-[var(--primary-soft)] px-3 py-1.5 text-[12px] font-medium text-[var(--accent)]">
                        {selectedCategory.label}
                      </span>
                    ) : null}
                    {selectedGoodForOption?.label ? (
                      <span className="rounded-full bg-[var(--primary-soft)] px-3 py-1.5 text-[12px] font-medium text-[var(--accent)]">
                        {selectedGoodForOption.label}
                      </span>
                    ) : null}
                    {selectedCityName ? (
                      <span className="rounded-full bg-[var(--primary-soft)] px-3 py-1.5 text-[12px] font-medium text-[var(--accent)]">
                        {selectedCityName}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {(selectedCategory?.label || selectedCityName || selectedGoodForOption?.label || effectiveBudgetPreview) ? (
                  <p className="mt-3 text-[14px] leading-6 text-[var(--muted)]">
                    {searchPreviewText}
                  </p>
                ) : (
                  <p className="mt-3 text-[14px] leading-6 text-[var(--muted)]">
                    Try &quot;cozy cafe in Makati&quot; or &quot;budget date in QC.&quot;
                  </p>
                )}
              </div>
              <div className="mt-3 hidden flex-wrap justify-center gap-2">
                {typedSuggestionChips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setRawQuery(chip)}
                    className="rounded-full border border-[var(--line)] bg-white px-3.5 py-2 text-[13px] font-medium text-[#374151] transition hover:border-[var(--accent)] hover:bg-[var(--primary-soft)] hover:text-[var(--accent)]"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <div className="relative -mt-10 flex w-full justify-center">
            <img
              src={searchBeforeChibi}
              alt=""
              className="relative z-10 h-[300px] w-auto max-w-none origin-top scale-[1.55] object-contain sm:h-[360px] sm:scale-[1.58] lg:h-[400px] lg:scale-[1.6]"
              style={{ transformOrigin: 'top center', marginTop: '-6px' }}
              loading="eager"
            />
          </div>
        </section>
      </main>

      {isFiltersOpen ? (
        <div className="fixed inset-0 z-[5000] flex items-end bg-slate-950/28">
          <button
            type="button"
            aria-label="Close filters"
            className="absolute inset-0"
            onClick={() => {
              setIsFiltersOpen(false)
              setActiveField(null)
            }}
          />
          <section className="relative max-h-[84vh] w-full overflow-y-auto rounded-t-[24px] bg-[var(--bg)] px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-18px_44px_rgba(17,24,39,0.18)]">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--line-strong)]" />
            <div className="mb-3 grid grid-cols-[72px_1fr_72px] items-center gap-2 border-b border-[var(--line)] pb-3">
              <button
                type="button"
                onClick={handleClearFilters}
                disabled={activeFilterCount === 0}
                className="justify-self-start text-[13px] font-medium text-[var(--accent)] transition disabled:text-[var(--text-light)]"
              >
                Reset
              </button>
              <h2 className="justify-self-center text-[17px] font-semibold text-[var(--text-main)]">Filters</h2>
              <button
                type="button"
                aria-label="Close filters"
                onClick={() => {
                  setIsFiltersOpen(false)
                  setActiveField(null)
                }}
                className="inline-flex h-9 w-9 items-center justify-center justify-self-end rounded-full bg-white text-[var(--text-main)] transition hover:bg-[var(--bg-soft)]"
              >
                <AppIcon name="clear" className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-hidden rounded-2xl bg-white">
              {[
                { key: 'category' as BuilderField, label: 'Category', value: selectedCategory?.label ?? 'Any category' },
                { key: 'city' as BuilderField, label: 'City', value: selectedCityName ?? 'Any city' },
                { key: 'good_for' as BuilderField, label: 'Vibe', value: selectedGoodForOption?.label ?? 'Any vibe' },
                { key: 'budget' as BuilderField, label: 'Budget', value: effectiveBudgetPreview ?? 'Any budget' },
              ].map((row, index) => (
                <div key={row.key} className={index > 0 ? 'border-t border-[var(--line)]' : undefined}>
                  <button
                    type="button"
                    onClick={() => setActiveField((current) => (current === row.key ? null : row.key))}
                    className="flex min-h-[54px] w-full items-center justify-between gap-3 bg-white px-4 text-left transition hover:bg-[var(--bg-soft)]"
                  >
                    <span className="text-[14px] font-semibold text-[var(--text-main)]">{row.label}</span>
                    <span className="flex min-w-0 items-center gap-2 text-right text-[13px] font-medium text-[var(--muted)]">
                      <span className="truncate">{row.value}</span>
                      <AppIcon name="chevronRight" className={`h-4 w-4 transition ${activeField === row.key ? 'rotate-90' : ''}`} />
                    </span>
                  </button>

                  {activeField === row.key ? (
                    <div className="bg-white px-3 pb-3">
                      {row.key === 'category' ? (
                        <div className="grid gap-1">
                          {[{ value: null, label: 'Any category' }, ...searchCategoryChoices].map((option) => {
                            const isSelected = selectedCategoryValue === option.value
                            return (
                              <button
                                key={option.value ?? 'any-category'}
                                type="button"
                                onClick={() => {
                                  setSelectedCategoryValue(option.value)
                                  syncQueryWithFilters({
                                    categoryValue: option.value,
                                    cityValue: selectedCity,
                                    goodForValue: selectedGoodFor,
                                    budgetValue: selectedBudget,
                                  })
                                  closeActiveFilterSection()
                                }}
                                className={`flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl px-3 text-left transition ${
                                  isSelected ? 'bg-[var(--primary-soft)] text-[var(--accent)]' : 'text-[var(--text-main)] hover:bg-[var(--bg-soft)]'
                                }`}
                              >
                                <span className="flex items-center gap-3">
                                  {option.value ? (
                                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${isSelected ? 'bg-white text-[var(--accent)]' : 'bg-[var(--primary-soft)] text-[var(--accent)]'}`}>
                                      <AppIcon name={resolveCategoryIconName(option.value)} className="h-4 w-4" />
                                    </span>
                                  ) : null}
                                  <span className="text-[14px] font-medium">{option.label}</span>
                                </span>
                                {isSelected ? <AppIcon name="check" className="h-4 w-4" /> : null}
                              </button>
                            )
                          })}
                        </div>
                      ) : null}

                      {row.key === 'city' ? (
                        <div className="grid max-h-64 gap-1 overflow-y-auto pr-1">
                          {[{ id: null, name: 'Any city' }, ...cityOptions].map((option) => {
                            const isSelected = selectedCity === option.id
                            return (
                              <button
                                key={option.id ?? 'any-city'}
                                type="button"
                                onClick={() => {
                                  setSelectedCity(option.id)
                                  syncQueryWithFilters({
                                    categoryValue: selectedCategoryValue,
                                    cityValue: option.id,
                                    goodForValue: selectedGoodFor,
                                    budgetValue: selectedBudget,
                                  })
                                  closeActiveFilterSection()
                                }}
                                className={`flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl px-3 text-left transition ${
                                  isSelected ? 'bg-[var(--primary-soft)] text-[var(--accent)]' : 'text-[var(--text-main)] hover:bg-[var(--bg-soft)]'
                                }`}
                              >
                                <span className="truncate text-[14px] font-medium">{option.name}</span>
                                {isSelected ? <AppIcon name="check" className="h-4 w-4 shrink-0" /> : null}
                              </button>
                            )
                          })}
                        </div>
                      ) : null}

                      {row.key === 'good_for' ? (
                        <div className="grid gap-1">
                          {[{ value: null, label: 'Any vibe' }, ...goodForOptions].map((option) => {
                            const isSelected = selectedGoodFor === option.value
                            return (
                              <button
                                key={option.value ?? 'any-vibe'}
                                type="button"
                                onClick={() => {
                                  setSelectedGoodFor(option.value)
                                  syncQueryWithFilters({
                                    categoryValue: selectedCategoryValue,
                                    cityValue: selectedCity,
                                    goodForValue: option.value,
                                    budgetValue: selectedBudget,
                                  })
                                  closeActiveFilterSection()
                                }}
                                className={`flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl px-3 text-left transition ${
                                  isSelected ? 'bg-[var(--primary-soft)] text-[var(--accent)]' : 'text-[var(--text-main)] hover:bg-[var(--bg-soft)]'
                                }`}
                              >
                                <span className="text-[14px] font-medium">{option.label}</span>
                                {isSelected ? <AppIcon name="check" className="h-4 w-4" /> : null}
                              </button>
                            )
                          })}
                        </div>
                      ) : null}

                      {row.key === 'budget' ? (
                        <div className="grid gap-1">
                          {budgetOptions.map((option) => {
                            const isSelected = option.value === 'any' ? !selectedBudget || selectedBudget === 'any' : selectedBudget === option.value
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => {
                                  const nextBudgetValue = option.value === 'any' ? null : option.value
                                  setSelectedBudget(nextBudgetValue)
                                  syncQueryWithFilters({
                                    categoryValue: selectedCategoryValue,
                                    cityValue: selectedCity,
                                    goodForValue: selectedGoodFor,
                                    budgetValue: nextBudgetValue,
                                  })
                                  closeActiveFilterSection()
                                }}
                                className={`flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl px-3 text-left transition ${
                                  isSelected ? 'bg-[var(--primary-soft)] text-[var(--accent)]' : 'text-[var(--text-main)] hover:bg-[var(--bg-soft)]'
                                }`}
                              >
                                <span className="text-[14px] font-medium">{option.label}</span>
                                {isSelected ? <AppIcon name="check" className="h-4 w-4" /> : null}
                              </button>
                            )
                          })}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">Preview</p>
              <p className={`mt-1 text-[14px] leading-6 ${canSearch ? 'text-[var(--text-main)]' : 'text-[var(--muted)]'}`}>{searchPreviewText}</p>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsFiltersOpen(false)
                setActiveField(null)
              }}
              className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[var(--accent)] text-sm font-semibold text-white transition hover:bg-[var(--accent-deep)]"
            >
              Apply filters
            </button>
          </section>
        </div>
      ) : null}
    </div>
  )
}

export default SearchPageWords
