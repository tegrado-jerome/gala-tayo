import { useEffect, useLayoutEffect, useState } from 'react'
import SearchHub from './SearchHub'
import ExploreShortcuts from '../components/home/search/ExploreShortcuts'
import { ExploreSearchBar, QuickFilterChips, SearchFilterPanel, SearchPageBreadcrumb } from '../components/home/search/SearchComponents'
import { FeatureGuideModalTrigger, featureGuideContent } from '../components/FeatureGuideModal'
import { Button, Page, Sheet } from '../components/ui'
import { useBottomNav } from '../context/BottomNavContext'
import { lockBodyScroll, unlockBodyScroll } from '../utils/bodyScrollLock'
import { navigateToPath } from '../utils/navigation'
import { buildSearchPath, hasActiveSearchCriteria, normalizeTypedSearchText, readSearchUrlState } from '../utils/searchParams'
import { budgetOptions, fallbackAreas, fallbackCategories } from '../components/home/homeHelpers'
import type { SearchBudgetValue } from '../utils/searchParams'

const cityOptions = fallbackAreas.filter((area) => area.id !== 'all').map((area) => ({ value: area.id, label: area.name }))
const categoryOptions = fallbackCategories.map((category) => ({ value: category.id, label: category.name }))
const budgetFilterOptions = budgetOptions.map((budget) => ({ value: budget.value, label: budget.label }))

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

  useLayoutEffect(() => {
    if (shouldShowResults) {
      return
    }

    setDraftQuery('')
    setSelectedCity(null)
    setSelectedCategory(null)
    setSelectedBudget(null)
    setIsFilterPanelOpen(false)
  }, [shouldShowResults])

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
        goodFor: isFilterSearch ? null : null,
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
    <Page>
      <SearchPageBreadcrumb />
      <h1 className="g-h1 mt-5">Saan tayo gagala?</h1>
      <p className="g-mut mt-2">Search places, cities, or categories.</p>

      <ExploreSearchBar className="mt-5" value={rawQuery} onChange={handleDraftQueryChange} onSubmit={handleSearch} canSubmit={canSearch} />

      <QuickFilterChips
        className="mt-4"
        categoryOptions={categoryOptions}
        cityOptions={cityOptions}
        budgetOptions={budgetFilterOptions}
        selectedCategory={selectedCategory}
        selectedCity={selectedCity}
        selectedBudget={selectedBudget}
        onOpenFilters={() => setIsFilterPanelOpen(true)}
        onCategoryChange={handleCategoryChange}
        onCityChange={handleCityChange}
        onBudgetChange={handleBudgetChange}
      />

      {hasActiveFilters ? (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button variant="tara" onClick={handleSearch} disabled={!canSearch}>
            Show places
          </Button>
          <Button variant="text" onClick={handleClearAll}>
            Clear all
          </Button>
        </div>
      ) : null}

      <div className="mt-4">
        <FeatureGuideModalTrigger
          content={featureGuideContent.search}
          triggerLabel="Need help searching?"
          className="!inline-flex !min-h-11 !gap-1 !rounded-none !border-none !bg-transparent !px-0 !py-0 !text-xs !font-normal !normal-case !tracking-normal !text-[var(--ink-2)] !shadow-none !no-underline !animate-none hover:!translate-y-0"
          triggerIconClassName="text-[var(--ink-2)]"
          onSampleClick={(sample) => {
            const namePrefix = 'By place name — '
            const locationPrefix = 'By location — '
            const categoryPrefix = 'By category — '
            if (sample.startsWith(namePrefix)) {
              const q = sample.slice(namePrefix.length)
              navigateToPath(buildSearchPath({ q, page: 1 }))
            } else if (sample.startsWith(locationPrefix)) {
              const loc = sample.slice(locationPrefix.length).toLowerCase()
              navigateToPath(buildSearchPath({ city: loc, page: 1 }))
            } else if (sample.startsWith(categoryPrefix)) {
              const cat = sample.slice(categoryPrefix.length).toLowerCase()
              navigateToPath(buildSearchPath({ category: cat, page: 1 }))
            }
          }}
        />
      </div>

      <ExploreShortcuts />

      <Sheet open={isFilterPanelOpen} onClose={() => setIsFilterPanelOpen(false)} title="Filters" labelledBy="search-filters-title">
        <SearchFilterPanel
          selectedCity={selectedCity}
          selectedCategory={selectedCategory}
          selectedBudget={selectedBudget}
          cityOptions={cityOptions}
          categoryOptions={categoryOptions}
          budgetOptions={budgetFilterOptions}
          onCityChange={handleCityChange}
          onCategoryChange={handleCategoryChange}
          onBudgetChange={handleBudgetChange}
          onClearAll={() => {
            handleClearAll()
            setIsFilterPanelOpen(false)
          }}
          onApplyFilters={() => {
            setIsFilterPanelOpen(false)
            handleSearch()
          }}
          canApply={canSearch}
        />
      </Sheet>
    </Page>
  )
}

export default SearchPage
