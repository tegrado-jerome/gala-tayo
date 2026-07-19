import { useEffect, useMemo, useRef, useState } from 'react'
import { Coffee, Flame, Heart, Info, Search, SlidersHorizontal, X } from 'lucide-react'
import SearchHub from './SearchHub'
import { AppIcon } from '../components/AppIcon'
import PageHeroHeader from '../components/PageHeroHeader'
import { SearchFilterPanel, SearchPageBreadcrumb } from '../components/home/search/SearchComponents'
import { useBottomNav } from '../context/BottomNavContext'
import { BOTTOM_NAV_RESERVED_CLASS } from '../components/layout/Primitives'
import { lockBodyScroll, unlockBodyScroll } from '../utils/bodyScrollLock'
import { navigateToPath } from '../utils/navigation'
import { buildSearchPath, hasActiveSearchCriteria, normalizeTypedSearchText, readSearchUrlState } from '../utils/searchParams'
import { budgetOptions, fallbackAreas, fallbackCategories } from '../components/home/homeHelpers'
import type { SearchBudgetValue } from '../utils/searchParams'

function SearchPageLandingBar({
  value,
  placeholder = 'Discover a city',
  onChange,
  onSubmit,
  onFilterClick,
  filtersOpen = false,
  hasActiveFilters = false,
  canSubmit = value.trim().length > 0,
}: {
  value: string
  placeholder?: string
  onChange: (value: string) => void
  onSubmit: () => void
  onFilterClick?: () => void
  filtersOpen?: boolean
  hasActiveFilters?: boolean
  canSubmit?: boolean
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  return (
    <div
      className="mt-7 flex h-14 w-full items-center justify-between rounded-[20px] border border-slate-200/70 bg-transparent px-4 text-[var(--accent-deep)] transition hover:border-slate-300 hover:bg-slate-50/70"
      onClick={() => inputRef.current?.focus()}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2.5 text-[var(--accent-deep)]">
        <Search className="h-[21px] w-[21px] shrink-0 text-[var(--accent-deep)]" strokeWidth={2} />
        <label htmlFor="search-page-input" className="sr-only">
          Search places, cities, or categories
        </label>
        <input
          ref={inputRef}
          id="search-page-input"
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && canSubmit) {
              event.preventDefault()
              onSubmit()
            }
          }}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-slate-900 outline-none placeholder:font-medium placeholder:text-slate-500 disabled:cursor-not-allowed"
        />
      </span>

      {onFilterClick ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onFilterClick()
          }}
          aria-label={filtersOpen ? 'Close filters' : 'Open filters'}
          aria-expanded={filtersOpen}
          aria-pressed={filtersOpen}
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition disabled:cursor-not-allowed ${
            filtersOpen || hasActiveFilters
              ? 'bg-[rgba(30,58,138,0.08)] text-[var(--accent-deep)]'
              : 'text-[var(--accent-deep)] hover:bg-slate-100/80 hover:text-[var(--accent)]'
          } disabled:text-slate-300`}
        >
          <SlidersHorizontal className="h-[21px] w-[21px]" strokeWidth={2} />
        </button>
      ) : null}
    </div>
  )
}

function SearchActiveFilterChips({
  cityLabel,
  categoryLabel,
  budgetLabel,
  onClearAll,
  onClearCity,
  onClearCategory,
  onClearBudget,
}: {
  cityLabel: string | null
  categoryLabel: string | null
  budgetLabel: string | null
  onClearAll: () => void
  onClearCity: () => void
  onClearCategory: () => void
  onClearBudget: () => void
}) {
  const chips = [
    cityLabel ? { key: 'city', label: cityLabel, onClear: onClearCity } : null,
    categoryLabel ? { key: 'category', label: categoryLabel, onClear: onClearCategory } : null,
    budgetLabel ? { key: 'budget', label: budgetLabel, onClear: onClearBudget } : null,
  ].filter(Boolean) as Array<{ key: string; label: string; onClear: () => void }>

  if (chips.length === 0) {
    return null
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={chip.onClear}
            className="inline-flex items-center gap-2 rounded-full border border-[rgba(30,58,138,0.14)] bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-[0_6px_16px_rgba(15,23,42,0.04)] transition hover:border-[var(--accent-deep)] hover:text-[var(--accent-deep)]"
          >
            <span>{chip.label}</span>
            <AppIcon name="clear" className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onClearAll}
        className="inline-flex w-fit items-center gap-2 rounded-full border border-[rgba(148,163,184,0.24)] bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-500 transition hover:border-[var(--accent-deep)] hover:text-[var(--accent-deep)]"
      >
        Clear all filters
      </button>
    </div>
  )
}

function SearchPage({
  navigationSource = 'push',
}: {
  navigationSource?: 'push' | 'replace' | 'pop'
}) {

  const routeSearchState = readSearchUrlState(window.location.search)
  const initialQuery = routeSearchState.q
  const initialPage = routeSearchState.page
  const initialCategory = routeSearchState.category
  const initialCity = routeSearchState.city
  const initialGoodFor = routeSearchState.goodFor
  const initialBudget = routeSearchState.budget
  const shouldShowResults = hasActiveSearchCriteria(routeSearchState)

  const [draftQuery, setDraftQuery] = useState(initialQuery)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedCity, setSelectedCity] = useState<string | null>(null)
  const [selectedBudget, setSelectedBudget] = useState<SearchBudgetValue | null>(null)
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false)
  const rawQuery = shouldShowResults ? initialQuery : draftQuery
  const activeTypedQuery = normalizeTypedSearchText(rawQuery)
  const { setHidden } = useBottomNav()

  const categoryLabel = useMemo(
    () =>
      selectedCategory
        ? fallbackCategories.find((category) => category.id === selectedCategory)?.name ?? null
        : null,
    [selectedCategory]
  )
  const cityLabel = useMemo(
    () => (selectedCity ? fallbackAreas.find((area) => area.id === selectedCity)?.name ?? null : null),
    [selectedCity]
  )
  const budgetLabel = useMemo(
    () => (selectedBudget ? budgetOptions.find((budget) => budget.value === selectedBudget)?.label ?? null : null),
    [selectedBudget]
  )
  const hasActiveFilters = Boolean(selectedCity || selectedCategory || selectedBudget)
  const canSearch = Boolean(activeTypedQuery.length > 0 || selectedCategory || selectedCity || selectedBudget)

  useEffect(() => {
    if (!isFilterPanelOpen) {
      setHidden(false)
      return
    }

    lockBodyScroll()
    setHidden(true)
    return () => unlockBodyScroll()
  }, [isFilterPanelOpen, setHidden])

  useEffect(() => {
    return () => setHidden(false)
  }, [setHidden])

  const handleSearch = () => {
    if (!canSearch) {
      return
    }

    const isFilterSearch = Boolean(selectedCategory || selectedCity || selectedBudget)

    navigateToPath(
      buildSearchPath({
        q: isFilterSearch ? '' : activeTypedQuery,
        category: isFilterSearch ? selectedCategory : null,
        city: isFilterSearch ? selectedCity : null,
        budget: isFilterSearch ? selectedBudget : null,
        page: 1,
      })
    )
  }

  const handleClearAll = () => {
    setDraftQuery('')
    setSelectedCity(null)
    setSelectedCategory(null)
    setSelectedBudget(null)
    navigateToPath('/search')
  }

  const handleClearCity = () => setSelectedCity(null)
  const handleClearCategory = () => setSelectedCategory(null)
  const handleClearBudget = () => setSelectedBudget(null)
  const handleDraftQueryChange = (value: string) => {
    setDraftQuery(value)
    if (value.trim()) {
      setSelectedCity(null)
      setSelectedCategory(null)
      setSelectedBudget(null)
    }
  }
  const handleCityChange = (value: string | null) => {
    setSelectedCity(value)
    if (value) setDraftQuery('')
  }
  const handleCategoryChange = (value: string | null) => {
    setSelectedCategory(value)
    if (value) setDraftQuery('')
  }
  const handleBudgetChange = (value: SearchBudgetValue | null) => {
    setSelectedBudget(value)
    if (value) setDraftQuery('')
  }

  if (shouldShowResults) {
    return (
      <SearchHub
        initialSearchState={{
          rawQuery: initialQuery,
          categoryId: initialCategory,
          areaId: initialCity,
          goodFor: initialGoodFor,
          budget: initialBudget,
          page: initialPage,
          autoSearch: true,
        }}
        navigationSource={navigationSource}
      />
    )
  }

  return (
    <div className="gala-page-background min-h-screen overflow-x-hidden text-[var(--text)]">
      <main className={`w-full px-4 pt-[max(28px,env(safe-area-inset-top))] sm:px-6 sm:pt-8 md:flex md:justify-center lg:px-8 ${BOTTOM_NAV_RESERVED_CLASS}`}>
          <section className="w-full max-w-[430px] sm:max-w-[560px] lg:max-w-[640px] xl:max-w-[720px]">
            <SearchPageBreadcrumb className="mb-4" />
          <PageHeroHeader
            eyebrow="Search"
            title="Find your next gala spot"
            description="Search places, cities, or categories and fine-tune results."
            icon={<Search className="h-4 w-4" />}
            className="pb-0"
            centered
            centeredAt="md"
            divider={false}
          />
          <SearchPageLandingBar
            value={rawQuery}
            onChange={handleDraftQueryChange}
            onSubmit={handleSearch}
            placeholder="Discover a city"
            canSubmit={canSearch}
            onFilterClick={() => setIsFilterPanelOpen((value) => !value)}
            filtersOpen={isFilterPanelOpen}
            hasActiveFilters={hasActiveFilters}
          />
          {isFilterPanelOpen ? (
            <div
              className="fixed inset-0 z-[7000] flex items-stretch justify-center bg-slate-950/30 px-0 pt-0 backdrop-blur-[2px] sm:items-center sm:px-4 sm:py-6"
              onClick={() => setIsFilterPanelOpen(false)}
            >
              <div
                className="flex h-[100dvh] w-full max-w-none flex-col overflow-hidden bg-white sm:h-auto sm:max-h-[min(92dvh,920px)] sm:max-w-[820px] sm:rounded-[30px] sm:border sm:border-[rgba(148,163,184,0.18)] sm:shadow-[0_20px_60px_rgba(15,23,42,0.22)]"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4 border-b border-[rgba(148,163,184,0.16)] px-4 py-4 sm:px-5">
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Filters</p>
                    <h2 className="mt-1 text-[1.05rem] font-black tracking-[-0.03em] text-slate-950">Refine your search</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-500">Use clean dropdowns, then apply when you’re ready.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFilterPanelOpen(false)}
                    aria-label="Close filters"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[rgba(148,163,184,0.18)] bg-white text-slate-500 transition hover:border-[rgba(100,116,139,0.34)] hover:text-slate-900"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <SearchFilterPanel
                  cityLabel="City"
                  categoryLabel="Category"
                  budgetLabel="Budget"
                  selectedCity={selectedCity}
                  selectedCategory={selectedCategory}
                  selectedBudget={selectedBudget}
                  cityOptions={fallbackAreas.filter((area) => area.id !== 'all').map((area) => ({ value: area.id, label: area.name }))}
                  categoryOptions={fallbackCategories.map((category) => ({ value: category.id, label: category.name }))}
                  budgetOptions={budgetOptions.map((budget) => ({ value: budget.value, label: budget.label }))}
                  onCityChange={handleCityChange}
                  onCategoryChange={handleCategoryChange}
                  onBudgetChange={handleBudgetChange}
                  showHeader={false}
                  showActions={false}
                  className="min-h-0 flex-1 overflow-y-auto border-0 bg-transparent px-4 py-4 shadow-none sm:px-5"
                />

                <div className="border-t border-[rgba(148,163,184,0.16)] bg-white px-4 py-4 sm:px-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        handleClearAll()
                        setIsFilterPanelOpen(false)
                      }}
                      className="inline-flex h-12 items-center justify-center rounded-2xl border border-[rgba(148,163,184,0.18)] bg-white px-4 text-sm font-bold text-slate-500 transition hover:border-[var(--accent-deep)] hover:text-[var(--accent-deep)]"
                    >
                      Reset All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsFilterPanelOpen(false)
                        handleSearch()
                      }}
                      disabled={!canSearch}
                      className="inline-flex h-12 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 text-sm font-bold text-white shadow-[0_14px_30px_rgba(var(--accent-rgb),0.18)] transition hover:bg-[var(--accent-deep)] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                    >
                      Apply Filters{hasActiveFilters ? ` (${[selectedCity, selectedCategory, selectedBudget].filter(Boolean).length})` : ''}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          {hasActiveFilters ? (
            <SearchActiveFilterChips
              cityLabel={cityLabel}
              categoryLabel={categoryLabel}
              budgetLabel={budgetLabel}
              onClearAll={handleClearAll}
              onClearCity={handleClearCity}
              onClearCategory={handleClearCategory}
              onClearBudget={handleClearBudget}
            />
          ) : null}
          <button
            type="button"
            onClick={handleSearch}
            disabled={!canSearch}
            className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-bold text-white shadow-[0_12px_28px_rgba(var(--accent-rgb),0.18)] transition hover:bg-[var(--accent-deep)] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            <Search className="h-4 w-4 shrink-0" />
            {activeTypedQuery.length > 0 ? 'Search places' : 'Apply filters'}
          </button>
          <div className="mt-5 text-center">
            <p className="mb-3 flex items-center justify-center gap-1.5 text-sm font-bold text-slate-500">
              <Info className="h-3.5 w-3.5 shrink-0 text-slate-500" strokeWidth={2.6} />
              <span>Search a famous place in Metro Manila</span>
            </p>
            <p className="gala-shared-suggestion-label mt-4 mb-2 flex items-center justify-center gap-1.5 text-xs font-bold text-slate-400">
              <Flame className="h-3.5 w-3.5 text-orange-400" />
              Popular
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => setDraftQuery('date in Parañaque')}
                className="gala-shared-suggestion-chip inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[rgba(148,163,184,0.22)] bg-white/60 px-3.5 text-xs font-semibold text-slate-500 shadow-[0_6px_14px_rgba(15,23,42,0.03)] transition hover:border-[rgba(var(--accent-rgb),0.24)] hover:bg-white hover:text-[var(--accent-deep)]"
              >
                <Heart className="h-3 w-3 shrink-0 text-rose-400" />
                date in Parañaque
              </button>
              <button
                type="button"
                onClick={() => setDraftQuery('coffee shops in Makati')}
                className="gala-shared-suggestion-chip inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[rgba(148,163,184,0.22)] bg-white/60 px-3.5 text-xs font-semibold text-slate-500 shadow-[0_6px_14px_rgba(15,23,42,0.03)] transition hover:border-[rgba(var(--accent-rgb),0.24)] hover:bg-white hover:text-[var(--accent-deep)]"
              >
                <Coffee className="h-3 w-3 shrink-0 text-stone-700" />
                coffee shops in Makati
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default SearchPage
