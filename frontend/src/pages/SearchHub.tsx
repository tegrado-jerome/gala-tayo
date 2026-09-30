import PhotoCard from '../components/discover/PhotoCard'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PlaceCardData } from '../components/PlaceCard'
import AppHeader from '../components/AppHeader'
import { GuestAuthPrompt } from '../components/GuestAuthPrompt'
import PromptBuilderModal from '../components/PromptBuilderModal'
import { BOTTOM_NAV_RESERVED_CLASS } from '../components/layout/Primitives'
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
  buildSearchSentence,
  buildSearchResultSummary,
  buildFilterSearchText,
  getSearchRequestHeaders,
  mapBackendPlaceToCard,
} from '../components/home/homeHelpers'

import {
  SearchLandingBar,
  SearchLoadingState,
  SearchLoadingCard,
  MobileResultsTabs,
  toPhotoCardPlace,
  GuidedSearchPage,
  MobileResultsView,
  DesktopResultsView,
  SearchEmptyState,
  SearchPagination,
  SearchFilterPanel,
  ActiveSearchChips,
} from '../components/home/search/SearchComponents'
import MapView from '../components/MapView'

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
  const searchSentence = buildSearchSentence({
    categoryLabel: selectedCategoryName,
    areaName: selectedAreaName,
    budgetLabel: selectedBudgetLabel,
  })
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
  const searchFilterPanel = (
    <SearchFilterPanel
      cityLabel="City"
      categoryLabel="Category"
      budgetLabel="Budget"
      selectedCity={selectedArea}
      selectedCategory={selectedCategory}
      selectedBudget={selectedBudget}
      cityOptions={areas.filter((area) => area.id !== 'all').map((area) => ({ value: area.id, label: area.name }))}
      categoryOptions={categories.map((category) => ({ value: category.id, label: category.name }))}
      budgetOptions={budgetOptions.map((budget) => ({ value: budget.value, label: budget.label }))}
      onCityChange={(value) => {
        submitResultFilterChange({ area: value, page: 1 })
      }}
      onCategoryChange={(value) => {
        submitResultFilterChange({ category: value, page: 1 })
      }}
      onBudgetChange={(value) => {
        submitResultFilterChange({ budget: value, page: 1 })
      }}
      onClearAll={() => {
        submitResultFilterChange({
          category: null,
          area: null,
          goodFor: null,
          budget: null,
          page: 1,
        })
      }}
    />
  )
  const shouldShowSearchFiltersPanel = !hasSearched && !initialSearchState?.autoSearch
  const visiblePlaces = hasSearched ? searchResults : []
  const totalResults = searchTotalCount
  const totalPages = Math.max(1, searchTotalPages)
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages)
  const selectedPlace = selectedPlaceId ? visiblePlaces.find((place) => place.id === selectedPlaceId) ?? null : null
  const shouldShowGuidedSearch = !hasSearched && !initialSearchState?.autoSearch
  const shouldUseMinimalSearchLayout = Boolean(initialSearchState?.autoSearch)
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
      rawQuery: '',
      category: selectedCategory,
      area: selectedArea,
      goodFor: selectedGoodFor,
      budget: selectedBudget,
      page: 1,
      ...nextState,
    }

    if (!mergedState.category && !mergedState.area && !mergedState.goodFor && !mergedState.budget) {
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
        places?: BackendSearchPlace[]
        geminiResponse?: string
        result?: {
          page?: number
          limit?: number
          totalCount?: number
          totalPages?: number
          geminiResponse?: string
          places?: BackendSearchPlace[]
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
      const mappedPlaces = backendPlaces
        .map(mapBackendPlaceToCard)
        .filter((place): place is PlaceCardData => Boolean(place))

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

  if (shouldUseMinimalSearchLayout) {
    return (
      <div className="gala-page-background min-h-screen overflow-x-hidden text-[var(--text)]">
        <main className="w-full">
          {visiblePlaces.length > 0 ? (
            <>
              <div className={`mx-auto w-full px-4 pt-[max(12px,env(safe-area-inset-top))] sm:px-6 sm:pt-6 lg:hidden ${BOTTOM_NAV_RESERVED_CLASS}`}>
                <section className="mx-auto w-full max-w-[430px]">
                  <SearchLandingBar
                    value={rawQuery}
                    onChange={handleRawQueryChange}
                    onSubmit={() => void handleSearch()}
                    disabled={isSearching}
                    canSubmit={canSubmitSearch}
                    placeholder="Discover a city"
                    className="!mt-5"
                  />

                  <ActiveSearchChips
                    cityLabel={selectedAreaName}
                    categoryLabel={selectedCategoryName}
                    goodForLabel={selectedGoodForName}
                    budgetLabel={selectedBudgetLabel}
                    onRemoveCity={() => clearFilterChip('city')}
                    onRemoveCategory={() => clearFilterChip('category')}
                    onRemoveGoodFor={() => clearFilterChip('good_for')}
                    onRemoveBudget={() => clearFilterChip('budget')}
                  />

                  <MobileResultsTabs selectedView={mobileResultsView} onViewChange={setMobileResultsView} />

                  {shouldShowSearchLoadingState ? (
                    <div className="mt-4 grid gap-3">
                      <SearchLoadingCard compact />
                      <SearchLoadingCard compact />
                    </div>
                  ) : mobileResultsView === 'cards' ? (
                    <div className="mt-4 grid gap-3">
                      <div className={`grid gap-x-4 gap-y-8 transition sm:grid-cols-2 ${isPageLoading ? 'pointer-events-none opacity-60' : 'opacity-100'}`}>
                        {visiblePlaces.map((place, index) => {
                          const cardPlace = toPhotoCardPlace(place)
                          return (
                            <PhotoCard
                              key={place.id}
                              place={cardPlace}
                              priority={index < 2}
                              badge={cardPlace.budgetMin === 0 ? 'Libre' : null}
                              isSelected={selectedPlaceId === place.id}
                              onGuestFavorite={() => setPromptLogin(true)}
                              onActivate={() => handlePlaceSelect(place.id)}
                            />
                          )
                        })}
                      </div>
                      <div className="pt-1">
                        <SearchPagination
                          currentPage={safeCurrentPage}
                          totalPages={totalPages}
                          totalCount={totalResults}
                          pageSize={SEARCH_RESULTS_PER_PAGE}
                          isLoading={isPageLoading}
                          compact
                          onPageChange={handlePageChange}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-4">
                      <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[0_10px_24px_rgba(27,26,23,0.05)]">
                        <MapView
                          places={visiblePlaces}
                          selectedPlaceId={selectedPlaceId}
                          onPlaceSelect={handleMapPlaceSelect}
                          onPlaceOpen={handlePlaceSelect}
                          autoFitToPlaces
                          className="!h-[360px] !rounded-none !border-0"
                        />
                      </section>

                      {selectedPlace ? (
                        <div className="max-w-[340px]">
                          <PhotoCard
                            place={toPhotoCardPlace(selectedPlace)}
                            isSelected
                            onGuestFavorite={() => setPromptLogin(true)}
                            onActivate={() => handlePlaceSelect(selectedPlace.id)}
                          />
                        </div>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => setMobileResultsView('cards')}
                        className="inline-flex items-center gap-2 self-start text-sm font-black text-slate-700"
                      >
                        Back to places
                      </button>

                      <SearchPagination
                        currentPage={safeCurrentPage}
                        totalPages={totalPages}
                        totalCount={totalResults}
                        pageSize={SEARCH_RESULTS_PER_PAGE}
                        isLoading={isPageLoading}
                        compact
                        onPageChange={handlePageChange}
                      />
                    </div>
                  )}
                </section>
              </div>

              <div className="hidden lg:block">
                <DesktopResultsView
                  rawQuery={rawQuery}
                  places={visiblePlaces}
                  totalCount={totalResults}
                  currentPage={safeCurrentPage}
                  totalPages={totalPages}
                  selectedPlaceId={selectedPlaceId}
                  heading={searchResultSummary.heading}
                  subheading={searchResultSummary.subheading || 'in GalaTayo'}
                  cityLabel={selectedAreaName}
                  categoryLabel={selectedCategoryName}
                  goodForLabel={selectedGoodForName}
                  budgetLabel={selectedBudgetLabel}
                  isRefreshing={isRefreshingSearch}
                  isPageLoading={isPageLoading}
                  scrollContainerRef={desktopResultsScrollRef}
                  onRawQueryChange={handleRawQueryChange}
                  onSubmitSearch={() => void handleSearch()}
                  onSelectPlace={handleMapPlaceSelect}
                  onPageChange={handlePageChange}
                  onViewDetails={handlePlaceSelect}
                  onRemoveCity={() => clearFilterChip('city')}
                  onRemoveCategory={() => clearFilterChip('category')}
                  onRemoveGoodFor={() => clearFilterChip('good_for')}
                  onRemoveBudget={() => clearFilterChip('budget')}
                />
              </div>
            </>
          ) : (
            <div className={`mx-auto w-full px-4 pt-[max(12px,env(safe-area-inset-top))] sm:px-6 sm:pt-6 lg:px-8 ${BOTTOM_NAV_RESERVED_CLASS}`}>
              <section className="mx-auto w-full max-w-[430px] lg:max-w-[640px] xl:max-w-[720px]">
                <SearchLandingBar
                  value={rawQuery}
                  onChange={handleRawQueryChange}
                  onSubmit={() => void handleSearch()}
                  disabled={isSearching}
                  canSubmit={canSubmitSearch}
                  placeholder="Discover a city"
                  className="!mt-5"
                />

                {shouldShowSearchLoadingState ? (
                  <div className="mt-4 grid gap-3">
                    <SearchLoadingCard compact />
                    <SearchLoadingCard compact />
                  </div>
                ) : (
                  <SearchEmptyState
                    hasSearched={hasSearched}
                    status={searchStatus}
                    message={searchFeedbackMessage}
                    error={searchError}
                    onSearchAgain={handleSearchAgain}
                  />
                )}
              </section>
            </div>
          )}
        </main>
      </div>
    )
  }

    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] lg:h-[calc(100dvh-var(--site-header-h))] lg:overflow-hidden">
        <GuestAuthPrompt
          variant="ask-ai"
          mode="modal"
          isOpen={promptLogin}
          onClose={() => setPromptLogin(false)}
          className="gala-auth-prompt--protected-feature gala-auth-prompt--protected-feature-accent"
        />
        {shouldShowSearchFiltersPanel ? searchFilterPanel : null}

      <div className="gala-page-background flex min-h-screen flex-col overflow-x-hidden lg:hidden">
          <AppHeader signInLabel="Mag-sign in" minimal />

          <main className={`overflow-x-hidden ${isPromptBuilderOpen ? 'flex min-h-[100dvh] flex-col overflow-hidden pb-0' : 'flex-1 min-h-0 pb-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] sm:pb-[calc(env(safe-area-inset-bottom,0px)+4.75rem)]'}`}>
            {isPromptBuilderOpen ? (
              <PromptBuilderModal
                isOpen={isPromptBuilderOpen}
                initialState={null}
                onClose={() => {
                  setIsPromptBuilderOpen(false)
                  if (initialPromptBuilderOpen) {
                    navigateToPath('/search')
                  }
                }}
              />
            ) : shouldShowSearchLoadingState ? (
              <SearchLoadingState searchLabel={activeSearchLabel} mobileViewportCentered />
            ) : shouldShowGuidedSearch ? (
              <GuidedSearchPage
                rawQuery={rawQuery}
                searchSentence={searchSentence}
                isSearching={isSearching}
                validationMessage={searchValidationMessage}
                searchError={searchError}
                canSubmit={canSubmitSearch}
                
                onRawQueryChange={handleRawQueryChange}
                onClearSearch={handleClearSearch}
                onSubmitSearch={() => void handleSearch()}
              />
            ) : (
                  visiblePlaces.length > 0 ? (
                    <MobileResultsView
                      places={visiblePlaces}
                      totalCount={totalResults}
                      currentPage={safeCurrentPage}
                      totalPages={totalPages}
                      selectedPlace={selectedPlace}
                      selectedPlaceId={selectedPlaceId}
                      heading={searchResultSummary.heading}
                      subheading={searchResultSummary.subheading || 'in GalaTayo'}
                      cityLabel={selectedAreaName}
                      categoryLabel={selectedCategoryName}
                      goodForLabel={selectedGoodForName}
                      budgetLabel={selectedBudgetLabel}
                      isRefreshing={isRefreshingSearch}
                      isPageLoading={isPageLoading}
                      selectedView={mobileResultsView}
                      onViewChange={setMobileResultsView}
                      onPageChange={handlePageChange}
                      onSelectPlace={handleMapPlaceSelect}
                      onViewDetails={handlePlaceSelect}
                      onClearSearch={handleClearSearch}
                      onRemoveCity={() => clearFilterChip('city')}
                      onRemoveCategory={() => clearFilterChip('category')}
                      onRemoveGoodFor={() => clearFilterChip('good_for')}
                      onRemoveBudget={() => clearFilterChip('budget')}
                    />
                  ) : (
                    <section className="px-4 py-4">
                      <SearchEmptyState
                        hasSearched={hasSearched}
                        status={searchStatus}
                        message={searchFeedbackMessage}
                        error={searchError}
                        onSearchAgain={handleSearchAgain}
                      />
                    </section>
                  )
            )}
          </main>
        </div>

        <div
          className={`hidden w-full lg:grid ${
            isPromptBuilderOpen
              ? 'h-[calc(var(--ask-ai-viewport-height,100svh)-var(--site-header-h))] overflow-hidden grid-rows-[auto_minmax(0,1fr)]'
              : 'h-[calc(var(--ask-ai-viewport-height,100svh)-var(--site-header-h))] overflow-hidden lg:grid-rows-[auto_minmax(0,1fr)_auto]'
          }`}
        >
          <AppHeader minimal />

          <div
            className={
              isPromptBuilderOpen
                ? 'flex h-full min-h-0 flex-col overflow-hidden'
                : shouldShowGuidedSearch
                  ? 'min-h-0 overflow-hidden'
                  : 'grid h-full min-h-0 overflow-hidden grid-rows-[minmax(0,1fr)]'
            }
          >
            {isPromptBuilderOpen ? (
              <PromptBuilderModal
                isOpen={isPromptBuilderOpen}
                initialState={null}
                onClose={() => {
                  setIsPromptBuilderOpen(false)
                  if (initialPromptBuilderOpen) {
                    navigateToPath('/search')
                  }
                }}
              />
            ) : shouldShowSearchLoadingState ? (
              <SearchLoadingState searchLabel={activeSearchLabel} />
            ) : shouldShowGuidedSearch ? (
              <GuidedSearchPage
                rawQuery={rawQuery}
                searchSentence={searchSentence}
                isSearching={isSearching}
                validationMessage={searchValidationMessage}
                searchError={searchError}
                canSubmit={canSubmitSearch}
                
                onRawQueryChange={handleRawQueryChange}
                onClearSearch={handleClearSearch}
                onSubmitSearch={() => void handleSearch()}
              />
            ) : (
                  visiblePlaces.length > 0 ? (
                    <DesktopResultsView
                      rawQuery={rawQuery}
                      places={visiblePlaces}
                      totalCount={totalResults}
                      currentPage={safeCurrentPage}
                      totalPages={totalPages}
                      selectedPlaceId={selectedPlaceId}
                      heading={searchResultSummary.heading}
                      subheading={searchResultSummary.subheading || 'in GalaTayo'}
                      cityLabel={selectedAreaName}
                      categoryLabel={selectedCategoryName}
                      goodForLabel={selectedGoodForName}
                      budgetLabel={selectedBudgetLabel}
                      isRefreshing={isRefreshingSearch}
                      isPageLoading={isPageLoading}
                      scrollContainerRef={desktopResultsScrollRef}
                      onRawQueryChange={handleRawQueryChange}
                      onSubmitSearch={() => void handleSearch()}
                      onSelectPlace={handleMapPlaceSelect}
                      onPageChange={handlePageChange}
                      onViewDetails={handlePlaceSelect}
                      onRemoveCity={() => clearFilterChip('city')}
                      onRemoveCategory={() => clearFilterChip('category')}
                      onRemoveGoodFor={() => clearFilterChip('good_for')}
                      onRemoveBudget={() => clearFilterChip('budget')}
                    />
                  ) : (
                    <section className="px-8 py-8">
                      <SearchEmptyState
                        hasSearched={hasSearched}
                        status={searchStatus}
                        message={searchFeedbackMessage}
                        error={searchError}
                        onSearchAgain={handleSearchAgain}
                      />
                    </section>
                  )
            )}
          </div>
        </div>
      </div>
    )
  }

export default SearchHub
