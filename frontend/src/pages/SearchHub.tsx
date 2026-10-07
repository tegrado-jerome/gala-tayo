import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { isRainSafe, type PlaceCardData } from '../components/PlaceCard'
import { GuestAuthPrompt, useGuestAuthPrompt } from '../components/GuestAuthPrompt'
import PromptBuilderModal from '../components/PromptBuilderModal'
import { Button, Empty, Page, Sheet } from '../components/ui'
import { navigateToPath, writePlaceReturnState } from '../utils/navigation'
import { useAskAiViewportHeightSync } from '../hooks/useAskAiViewportHeightSync'
import { getApiUrl } from '../utils/apiClient'
import {
  trackSearchResultSelected,
  trackSearchSubmitted,
} from '../utils/analytics'
import type { SearchGoodForValue } from '../utils/searchParams'

import {
  type BackendCategory,
  type BackendArea,
  type CategoryChip,
  type AreaChip,
  type BudgetValue,
  type HomePageProps,
  type BackendSearchPlace,
  type BackendSearchStatus,
  type SearchRouteCache,
  type FiltersCache,
  type MobileResultsViewMode,
  SEARCH_RESULTS_PER_PAGE,
  fallbackCategories,
  fallbackGoodForOptions,
  fallbackAreas,
  toCityOptions,
  budgetOptions,
  clearAllSearchRouteCaches,
  readSearchRouteCache,
  writeSearchRouteCache,
  readFiltersCache,
  writeFiltersCache,
  getSearchPlaceViewportTop,
  restoreSearchRouteScroll,
  isSearchResultsRoute,
  updateSearchPageUrl,
  normalizeSearchText,
  buildSearchResultSummary,
  buildFilterSearchText,
  getSearchRequestHeaders,
  mapBackendPlaceToCard,
} from '../components/home/homeHelpers'

import SearchSuggest from '../components/home/search/SearchSuggest'
import {
  QuickFilterChips,
  SearchEmptyState,
  SearchFilterPanel,
  SearchPageBreadcrumb,
  SearchResults,
  SearchResultsSkeleton,
} from '../components/home/search/SearchComponents'

type SearchApiPlace = BackendSearchPlace & { budget_min?: number | string | null }

function toFiniteNumber(value: number | string | null | undefined) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function SearchHub({
  initialPromptBuilderOpen = false,
  initialSearchState,
  navigationSource = 'push',
}: HomePageProps) {
  const initialFiltersCacheRef = useRef<FiltersCache | null>(readFiltersCache())
  const shouldUseSearchRouteCache = isSearchResultsRoute() && navigationSource === 'pop'
  const initialRequestedPage =
    typeof initialSearchState?.page === 'number' && Number.isFinite(initialSearchState.page) && initialSearchState.page > 0
      ? Math.floor(initialSearchState.page)
      : 1
  const initialRouteCacheRef = useRef<SearchRouteCache | null>(
    shouldUseSearchRouteCache ? readSearchRouteCache() : null
  )
  const initialRouteCache = initialRouteCacheRef.current
  useAskAiViewportHeightSync()
  const guestAuth = useGuestAuthPrompt()
  const [isPromptBuilderOpen, setIsPromptBuilderOpen] = useState(initialPromptBuilderOpen)
  const [categories, setCategories] = useState(initialFiltersCacheRef.current?.categories ?? fallbackCategories)
  const [areas, setAreas] = useState<AreaChip[]>(initialFiltersCacheRef.current?.areas ?? fallbackAreas)
  const [rawQuery, setRawQuery] = useState(normalizeSearchText(initialSearchState?.rawQuery ?? ''))
  const [selectedCategory, setSelectedCategory] = useState<string | null>(initialSearchState?.categoryId ?? null)
  const [selectedArea, setSelectedArea] = useState<string | null>(initialSearchState?.areaId ?? null)
  const [selectedGoodFor, setSelectedGoodFor] = useState<SearchGoodForValue | null>(initialSearchState?.goodFor ?? null)
  const [selectedBudget, setSelectedBudget] = useState<BudgetValue | null>(initialSearchState?.budget ?? null)
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(
    initialRouteCache?.pendingScrollRestore ? initialRouteCache.selectedPlaceId : null
  )
  const [currentPage, setCurrentPage] = useState(
    initialSearchState?.autoSearch ? initialRequestedPage : (initialRouteCache?.currentPage ?? 1)
  )
  const [mobileResultsView, setMobileResultsView] = useState<MobileResultsViewMode>(
    initialRouteCache?.mobileResultsView ?? 'cards'
  )
  const [isInitialSearching, setIsInitialSearching] = useState(
    Boolean(initialSearchState?.autoSearch && navigationSource !== 'pop')
  )
  const [isRefreshingSearch, setIsRefreshingSearch] = useState(false)
  const [isPageLoading, setIsPageLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchValidationMessage, setSearchValidationMessage] = useState<string | null>(null)
  const [searchStatus, setSearchStatus] = useState<BackendSearchStatus | null>(null)
  const [searchFeedbackMessage, setSearchFeedbackMessage] = useState<string | null>(null)
  const [promptLogin, setPromptLogin] = useState(false)
  const [lastSearchQuery, setLastSearchQuery] = useState(initialRouteCache?.lastSearchQuery ?? '')
  const [activeSearchLabel, setActiveSearchLabel] = useState(
    initialRouteCache?.activeSearchLabel ?? initialRouteCache?.lastSearchQuery ?? ''
  )
  const [searchId, setSearchId] = useState<string | null>(initialRouteCache?.searchId ?? null)
  const [searchResults, setSearchResults] = useState<PlaceCardData[]>(initialRouteCache?.searchResults ?? [])
  const [searchTotalCount, setSearchTotalCount] = useState(initialRouteCache?.totalCount ?? initialRouteCache?.searchResults.length ?? 0)
  const [searchTotalPages, setSearchTotalPages] = useState(initialRouteCache?.totalPages ?? 1)
  const [hasSearched, setHasSearched] = useState(Boolean(initialRouteCache))
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)
  const [rainSafeOnly, setRainSafeOnly] = useState(false)
  const hasRestoredInitialScrollRef = useRef(false)
  const searchRequestVersion = useRef(0)
  const searchRequestStartTimeRef = useRef(0)
  const MIN_SEARCH_LOADING_MS = 400
  const lastAutoSearchSignatureRef = useRef<string | null>(null)
  const desktopResultsScrollRef = useRef<HTMLElement | null>(null)
  const selectedCategoryName = useMemo(
    () =>
      selectedCategory
        ? categories.find((category) => category.id === selectedCategory)?.name ?? null
        : null,
    [categories, selectedCategory]
  )
  const selectedAreaName = useMemo(
    () => (selectedArea ? areas.find((area) => area.id === selectedArea)?.name ?? null : null),
    [areas, selectedArea]
  )
  const selectedBudgetLabel = useMemo(
    () => (selectedBudget ? budgetOptions.find((budget) => budget.value === selectedBudget)?.label ?? null : null),
    [selectedBudget]
  )
  const selectedGoodForName = useMemo(
    () => (selectedGoodFor ? fallbackGoodForOptions.find((option) => option.id === selectedGoodFor)?.name ?? null : null),
    [selectedGoodFor]
  )
  const searchResultSummary = useMemo(
    () =>
      buildSearchResultSummary({
        count: searchTotalCount,
        rawQuery,
        categoryLabel: selectedCategoryName,
        areaName: selectedAreaName,
        goodForLabel: selectedGoodForName,
        budgetLabel: selectedBudgetLabel,
      }),
    [rawQuery, searchTotalCount, selectedAreaName, selectedBudgetLabel, selectedCategoryName, selectedGoodForName]
  )
  const canSubmitSearch = Boolean(rawQuery.trim() || selectedCategory || selectedArea || selectedGoodFor || selectedBudget)
  const cityOptions = toCityOptions(areas)
  const budgetFilterOptions = budgetOptions.map((budget) => ({ value: budget.value, label: budget.label }))
  const visiblePlaces = hasSearched ? searchResults : []
  const totalResults = searchTotalCount
  const totalPages = Math.max(1, searchTotalPages)
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages)
  const hasRainData = visiblePlaces.some((place) => Boolean(place.indoor_outdoor || place.weather_fit))
  const shownPlaces = rainSafeOnly && hasRainData ? visiblePlaces.filter(isRainSafe) : visiblePlaces
  const searchLabel = activeSearchLabel || rawQuery.trim()
  const isSearching = isInitialSearching || isRefreshingSearch
  const shouldShowSearchLoadingState = isInitialSearching
  const clearFilterChip = (key: 'category' | 'city' | 'good_for' | 'budget') => {
    const nextState = {
      category: key === 'category' ? null : selectedCategory,
      area: key === 'city' ? null : selectedArea,
      goodFor: key === 'good_for' ? null : selectedGoodFor,
      budget: key === 'budget' ? null : selectedBudget,
      page: 1,
    }

    submitResultFilterChange(nextState)
  }
  const submitResultFilterChange = (
    nextState: Partial<{
      rawQuery: string
      category: string | null
      area: string | null
      goodFor: SearchGoodForValue | null
      budget: BudgetValue | null
      page: number
    }>
  ) => {
    const mergedState = {
      rawQuery,
      category: selectedCategory,
      area: selectedArea,
      goodFor: selectedGoodFor,
      budget: selectedBudget,
      page: 1,
      ...nextState,
    }

    if (!mergedState.rawQuery.trim() && !mergedState.category && !mergedState.area && !mergedState.goodFor && !mergedState.budget) {
      handleClearSearch()
      return
    }

    void handleSearch(mergedState)
  }
  const handleRawQueryChange = (query: string) => {
    setRawQuery(query)
    if (query.trim()) {
      setSelectedCategory(null)
      setSelectedArea(null)
      setSelectedGoodFor(null)
      setSelectedBudget(null)
    }
    if (searchValidationMessage) {
      setSearchValidationMessage(null)
    }
    if (searchError) {
      setSearchError(null)
    }
  }

  const resetSearchState = () => {
    clearAllSearchRouteCaches()

    searchRequestVersion.current += 1
    setRawQuery('')
    setSelectedCategory(null)
    setSelectedArea(null)
    setSelectedGoodFor(null)
    setSelectedBudget(null)
    setIsInitialSearching(false)
    setIsRefreshingSearch(false)
    setIsPageLoading(false)
    setSearchError(null)
    setSearchValidationMessage(null)
    setPromptLogin(false)
    setLastSearchQuery('')
    setActiveSearchLabel('')
    setSearchId(null)
    setSearchResults([])
    setSearchTotalCount(0)
    setSearchTotalPages(1)
    setHasSearched(false)
    setSelectedPlaceId(null)
    setCurrentPage(1)
    setMobileResultsView('cards')
  }

  const handleClearSearch = () => {
    resetSearchState()
    navigateToPath('/search')
  }

  const handleSearchAgain = () => {
    handleClearSearch()
  }

  const handlePlaceSelect = (placeId: string) => {
    const place = visiblePlaces.find((visiblePlace) => visiblePlace.id === placeId)
    const canonicalPlaceSlug = place?.slug?.trim()

    setSelectedPlaceId(placeId)
    if (canonicalPlaceSlug) {
      const searchUrl = `${window.location.pathname}${window.location.search}`
      const label = rawQuery?.trim() || activeSearchLabel?.replace(/^Showing\s+/, '')?.trim() || ''
      const returnLabel = label || 'search results'
      trackSearchResultSelected({
        placeSlug: canonicalPlaceSlug,
        areaSlug: place?.area?.trim() ?? null,
        categorySlug: place?.category?.trim() ?? null,
      })
      writePlaceReturnState(canonicalPlaceSlug, {
        source: 'search',
        returnTo: searchUrl,
        returnLabel,
      })

      writeSearchRouteCache({
        lastSearchQuery,
        activeSearchLabel,
        searchId,
        searchResults,
        totalCount: searchTotalCount,
        totalPages: searchTotalPages,
        selectedPlaceId: placeId,
        currentPage: safeCurrentPage,
        mobileResultsView,
        scrollY: window.scrollY,
        desktopScrollTop: desktopResultsScrollRef.current?.scrollTop ?? 0,
        selectedPlaceViewportTop: getSearchPlaceViewportTop(placeId),
        pendingScrollRestore: true,
      })
    }
  }

  useEffect(() => {
    if (!hasSearched) {
      if (currentPage !== 1) {
        setCurrentPage(1)
      }
      return
    }

    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage)
      return
    }

    if (selectedPlaceId && !visiblePlaces.some((place) => place.id === selectedPlaceId)) {
      setSelectedPlaceId(null)
    }
  }, [currentPage, hasSearched, safeCurrentPage, selectedPlaceId, visiblePlaces])

  const handleMapPlaceSelect = (placeId: string) => {
    setSelectedPlaceId(placeId)
  }

  const handlePageChange = (page: number) => {
    const nextPage = Math.min(Math.max(page, 1), totalPages)

    if (nextPage === safeCurrentPage) {
      return
    }

    void handleSearch({ page: nextPage })
  }

  const handleSearch = async (
    nextState?: Partial<{
      rawQuery: string
      category: string | null
      area: string | null
      goodFor: SearchGoodForValue | null
      budget: BudgetValue | null
      page: number
    }>,
  ) => {
    const nextRawQuery = normalizeSearchText(nextState?.rawQuery !== undefined ? nextState.rawQuery : rawQuery)
    const nextCategory = nextState?.category !== undefined ? nextState.category : selectedCategory
    const nextArea = nextState?.area !== undefined ? nextState.area : selectedArea
    const nextGoodFor = nextState?.goodFor !== undefined ? nextState.goodFor : selectedGoodFor
    const nextBudget = nextState?.budget !== undefined ? nextState.budget : selectedBudget

    const nextCategoryLabel = nextCategory
      ? categories.find((category) => category.id === nextCategory)?.name ?? null
      : null
    const nextAreaName = nextArea ? areas.find((area) => area.id === nextArea)?.name ?? null : null
    const nextGoodForLabel = nextGoodFor
      ? fallbackGoodForOptions.find((option) => option.id === nextGoodFor)?.name ?? null
      : null
    const nextBudgetLabel = nextBudget ? budgetOptions.find((budget) => budget.value === nextBudget)?.label ?? null : null

    const filterSearchLabel = buildFilterSearchText({
      rawQuery: '',
      categoryLabel: nextCategoryLabel,
      areaName: nextAreaName,
      goodForLabel: nextGoodForLabel,
      budgetLabel: nextBudgetLabel,
    })
    const nextSearchLabel = nextRawQuery || filterSearchLabel || 'filtered GalaTayo places'
    const nextPage = nextState?.page ?? 1
    const hasCriteria = Boolean(nextRawQuery || nextCategory || nextArea || nextGoodFor || nextBudget)

    if (!hasCriteria) {
      setSearchValidationMessage('Type a vibe or choose filters first.')
      setSearchError(null)
      return
    }

    const requestVersion = searchRequestVersion.current + 1
    searchRequestVersion.current = requestVersion
    searchRequestStartTimeRef.current = Date.now()

    lastAutoSearchSignatureRef.current = JSON.stringify({
      rawQuery: nextRawQuery,
      category: nextCategory,
      area: nextArea,
      goodFor: nextGoodFor,
      budget: nextBudget,
      page: nextPage,
    })

    const searchPayload = {
      query: nextRawQuery,
      page: nextPage,
      limit: SEARCH_RESULTS_PER_PAGE,
      filters: {
        category: nextCategory,
        city: nextArea,
        good_for: nextGoodFor,
        budget: nextBudget,
      },
    }
    updateSearchPageUrl({
      query: nextRawQuery,
      categoryValue: nextCategory,
      areaId: nextArea,
      goodFor: nextGoodFor,
      budget: nextBudget,
      page: nextPage,
    })

    try {
      setRawQuery(nextRawQuery)
      setSelectedCategory(nextCategory)
      setSelectedArea(nextArea)
      setSelectedGoodFor(nextGoodFor)
      setSelectedBudget(nextBudget)
      setSearchResults([])
      setSearchTotalCount(0)
      setSearchTotalPages(1)
      setSelectedPlaceId(null)
      setCurrentPage(nextPage)
      setMobileResultsView('cards')
      setHasSearched(false)
      setIsInitialSearching(true)
      setIsPageLoading(false)
      setSearchValidationMessage(null)
      setSearchError(null)
      setSearchStatus(null)
      setSearchFeedbackMessage(null)
      setPromptLogin(false)
      setActiveSearchLabel(nextSearchLabel)

      const response = await fetch(getApiUrl('/search'), {
        method: 'POST',
        headers: await getSearchRequestHeaders(),
        body: JSON.stringify(searchPayload),
      })

      const data = (await response.json()) as {
        message?: string
        error?: string
        searchId?: string
        searchStatus?: BackendSearchStatus
        searchFeedbackMessage?: string | null
        promptLogin?: boolean
        page?: number
        limit?: number
        totalCount?: number
        totalPages?: number
        places?: SearchApiPlace[]
        geminiResponse?: string
        result?: {
          page?: number
          limit?: number
          totalCount?: number
          totalPages?: number
          geminiResponse?: string
          places?: SearchApiPlace[]
        }
      }

      const elapsed = Date.now() - searchRequestStartTimeRef.current
      if (elapsed < MIN_SEARCH_LOADING_MS) {
        await new Promise((r) => setTimeout(r, MIN_SEARCH_LOADING_MS - elapsed))
      }

      if (searchRequestVersion.current !== requestVersion) {
        return
      }

      if (data.promptLogin) {
        setPromptLogin(true)
        return
      }

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Search failed.')
      }

      setLastSearchQuery(nextRawQuery)
      setSearchId(data.searchId ?? null)
      setSearchStatus(data.searchStatus ?? null)
      setSearchFeedbackMessage(data.searchFeedbackMessage ?? null)
      const backendPlaces = data.places ?? data.result?.places ?? []
      const responsePage = data.page ?? data.result?.page ?? nextPage
      const responseTotalCount = data.totalCount ?? data.result?.totalCount ?? backendPlaces.length
      const responseTotalPages =
        data.totalPages ?? data.result?.totalPages ?? Math.max(1, Math.ceil(responseTotalCount / SEARCH_RESULTS_PER_PAGE))
      setCurrentPage(responsePage)
      const mappedPlaces = backendPlaces.flatMap((backendPlace) => {
        const card = mapBackendPlaceToCard(backendPlace)
        return card ? [{ ...card, budget_min: toFiniteNumber(backendPlace.budget_min), ratingCount: toFiniteNumber(backendPlace.reviewCount) }] : []
      })

      setSearchResults(mappedPlaces)
      setSearchTotalCount(responseTotalCount)
      setSearchTotalPages(responseTotalPages)
      setHasSearched(true)
      setSelectedPlaceId(null)
      setMobileResultsView('cards')
      trackSearchSubmitted({
        resultCount: mappedPlaces.length,
        page: responsePage,
        filterCount: [nextCategory, nextArea, nextGoodFor, nextBudget].filter(Boolean).length,
      })
      if (shouldUseSearchRouteCache) {
        writeSearchRouteCache({
          lastSearchQuery: nextRawQuery,
          activeSearchLabel: nextSearchLabel,
          searchId: data.searchId ?? null,
          searchResults: mappedPlaces,
          totalCount: responseTotalCount,
          totalPages: responseTotalPages,
          selectedPlaceId: null,
          currentPage: responsePage,
          mobileResultsView: 'cards',
          scrollY: 0,
          desktopScrollTop: 0,
          selectedPlaceViewportTop: null,
          pendingScrollRestore: false,
        })
      }
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
        desktopResultsScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' })
      })
    } catch (error) {
      const elapsed = Date.now() - searchRequestStartTimeRef.current
      if (elapsed < MIN_SEARCH_LOADING_MS) {
        await new Promise((r) => setTimeout(r, MIN_SEARCH_LOADING_MS - elapsed))
      }

      if (searchRequestVersion.current !== requestVersion) {
        return
      }

      const message = error instanceof Error && !error.message.startsWith('Failed to execute \'json\'')
        ? error.message
        : 'Search failed.'
      setSearchError(message)
      setSearchStatus(null)
      setSearchFeedbackMessage(null)
      setHasSearched(true)
      console.error('Search request failed:', error)
    } finally {
      if (searchRequestVersion.current === requestVersion) {
        setIsInitialSearching(false)
      }
    }
  }

  useEffect(() => {
    if (!initialSearchState?.autoSearch) {
      lastAutoSearchSignatureRef.current = null
      return
    }

    if (shouldUseSearchRouteCache && initialRouteCache?.pendingScrollRestore) {
      return
    }

    const nextAutoSearch = {
      rawQuery: initialSearchState.rawQuery ?? '',
      category: initialSearchState.categoryId ?? null,
      area: initialSearchState.areaId ?? null,
      goodFor: initialSearchState.goodFor ?? null,
      budget: initialSearchState.budget ?? null,
      page: initialRequestedPage,
    }
    const nextSignature = JSON.stringify(nextAutoSearch)
    if (lastAutoSearchSignatureRef.current === nextSignature) {
      return
    }

    lastAutoSearchSignatureRef.current = nextSignature

    void handleSearch(nextAutoSearch)
  }, [
    activeSearchLabel,
    hasSearched,
    initialRequestedPage,
    initialSearchState?.areaId,
    initialSearchState?.autoSearch,
    initialSearchState?.budget,
    initialSearchState?.categoryId,
    initialSearchState?.goodFor,
    initialSearchState?.rawQuery,
    lastSearchQuery,
    navigationSource,
    rawQuery,
    searchResults.length,
    selectedArea,
    selectedBudget,
    selectedCategory,
    selectedGoodFor,
  ])

  useLayoutEffect(() => {
    if (navigationSource !== 'pop' || !initialRouteCache?.pendingScrollRestore || hasRestoredInitialScrollRef.current) {
      return
    }

    hasRestoredInitialScrollRef.current = true

    restoreSearchRouteScroll(initialRouteCache, desktopResultsScrollRef)

    writeSearchRouteCache({
      ...initialRouteCache,
      pendingScrollRestore: false,
    })
  }, [initialRouteCache, navigationSource])

  useEffect(() => {
    const controller = new AbortController()
    const filtersEndpoint = getApiUrl('/filters')

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

        const mappedCategories: CategoryChip[] =
          data.categories && data.categories.length > 0
            ? data.categories.map((category) => ({
                id: category.id,
                name: category.name,
              }))
            : categories
        const mappedAreas: AreaChip[] =
          data.areas && data.areas.length > 0
            ? data.areas.map((area) => ({
                id: area.id,
                name: area.name,
                type: area.type,
                region: area.region,
                province: area.province,
              }))
            : areas

        if (data.categories && data.categories.length > 0) {
          setCategories(mappedCategories)
        }

        if (data.areas && data.areas.length > 0) {
          setAreas(mappedAreas)
        }

        if (
          (data.categories && data.categories.length > 0) ||
          (data.areas && data.areas.length > 0)
        ) {
          writeFiltersCache({
            categories: mappedCategories,
            areas: mappedAreas,
            cachedAt: Date.now(),
          })
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

  const closePromptBuilder = () => {
    setIsPromptBuilderOpen(false)
    if (initialPromptBuilderOpen) {
      navigateToPath('/search')
    }
  }

  if (isPromptBuilderOpen) {
    return (
      <div className="flex min-h-[70dvh] flex-col">
        <PromptBuilderModal isOpen={isPromptBuilderOpen} initialState={null} onClose={closePromptBuilder} />
      </div>
    )
  }

  return (
    <Page>
      <GuestAuthPrompt
        variant="ask-ai"
        mode="modal"
        isOpen={promptLogin}
        onClose={() => setPromptLogin(false)}
      />

      <SearchPageBreadcrumb className="mb-4" />
      <SearchSuggest value={rawQuery} onChange={handleRawQueryChange} onSubmit={() => void handleSearch()} canSubmit={canSubmitSearch && !isSearching} />
      {searchValidationMessage ? <p className="g-hint mt-2">{searchValidationMessage}</p> : null}

      <QuickFilterChips
        className="mt-4"
        cityOptions={cityOptions}
        budgetOptions={budgetFilterOptions}
        selectedCity={selectedArea}
        selectedBudget={selectedBudget}
        goodForLabel={selectedGoodForName}
        onOpenFilters={() => setIsFilterSheetOpen(true)}
        onCityChange={(value) => submitResultFilterChange({ area: value, page: 1 })}
        onBudgetChange={(value) => submitResultFilterChange({ budget: value, page: 1 })}
        onClearGoodFor={() => clearFilterChip('good_for')}
        rainSafe={hasRainData ? { on: rainSafeOnly, onToggle: () => setRainSafeOnly((value) => !value) } : undefined}
      />

      {shouldShowSearchLoadingState ? (
        <SearchResultsSkeleton />
      ) : visiblePlaces.length > 0 ? (
        shownPlaces.length > 0 ? (
          <>
            {searchFeedbackMessage ? (
              <p className="g-hint mt-4" role="status">
                {searchFeedbackMessage}
              </p>
            ) : null}
            <SearchResults
              places={shownPlaces}
              totalCount={totalResults}
              currentPage={safeCurrentPage}
              totalPages={totalPages}
              heading={searchResultSummary.heading}
              subheading={[searchResultSummary.subheading || 'in GalaTayo', rainSafeOnly && hasRainData ? '· rain-safe on this page' : ''].filter(Boolean).join(' ')}
              selectedPlaceId={selectedPlaceId}
              isPageLoading={isPageLoading}
              mobileView={mobileResultsView}
              onMobileViewChange={setMobileResultsView}
              onSelectPlace={handleMapPlaceSelect}
              onOpenPlace={handlePlaceSelect}
              onPageChange={handlePageChange}
              onGuestSave={(retry) => guestAuth.open('favorite', retry)}
            />
          </>
        ) : (
          <Empty
            className="mt-8"
            title="No rain-safe spots here"
            description="None of the places on this page are marked indoor or rain-friendly."
            action={
              <Button variant="line" onClick={() => setRainSafeOnly(false)}>
                Show all places
              </Button>
            }
          />
        )
      ) : (
        <SearchEmptyState
          hasSearched={hasSearched}
          status={searchStatus}
          message={searchFeedbackMessage}
          error={searchError}
          askAiQuestion={searchLabel ? `Find me ${searchLabel}` : 'Help me find a great spot in Metro Manila'}
          onSearchAgain={handleSearchAgain}
        />
      )}

      <Sheet open={isFilterSheetOpen} onClose={() => setIsFilterSheetOpen(false)} title="Filters" labelledBy="search-hub-filters-title">
        <SearchFilterPanel
          selectedCity={selectedArea}
          selectedBudget={selectedBudget}
          cityOptions={cityOptions}
          budgetOptions={budgetFilterOptions}
          onCityChange={(value) => submitResultFilterChange({ area: value, page: 1 })}
          onBudgetChange={(value) => submitResultFilterChange({ budget: value, page: 1 })}
          onClearAll={() => {
            setIsFilterSheetOpen(false)
            submitResultFilterChange({ category: null, area: null, goodFor: null, budget: null, page: 1 })
          }}
          onApplyFilters={() => setIsFilterSheetOpen(false)}
        />
      </Sheet>
      {guestAuth.promptElement}
    </Page>
  )
}

export default SearchHub
