import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PlaceCardData } from '../components/PlaceCard'
import AppHeader from '../components/AppHeader'
import { GuestAuthPrompt } from '../components/GuestAuthPrompt'
import PromptBuilderModal from '../components/PromptBuilderModal'
import { BOTTOM_NAV_RESERVED_CLASS } from '../components/layout/Primitives'
import { useSavedFavorites } from '../context/SavedFavoritesContext'
import { navigateToPath, writePlaceReturnState } from '../utils/navigation'
import { lockBodyScroll, unlockBodyScroll } from '../utils/bodyScrollLock'
import { useAskAiUsageAutoRefresh } from '../hooks/useAskAiUsageAutoRefresh'
import {
  getAskAiRuntimeState,
  hasActiveAskAiRuntimeState,
  resetAskAiRuntimeState,
  resumeAskAiRuntimeJob,
  seedAskAiRuntimeState,
  submitAskAiRuntimeRequest,
  subscribeToAskAiRuntime,
} from '../utils/askAiRuntime'
import type { ChatMessage } from '../utils/askAiRuntime'
import { getApiUrl } from '../utils/apiClient'
import { getAskAiUsageStatusFromResponse, type AskAiUsageResponse, type AskAiUsageStatus } from '../utils/askAiUsage'
import { buildAskAiRequestHeaders, getOrCreateAskAiGuestId } from '../utils/askAiIdentity'
import {
  trackAskAiChatbotUsed,
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
  type SearchMode,
  type AskAiSource,
  type HomePageProps,
  type BackendSearchPlace,
  type BackendSearchStatus,
  type SearchRouteCache,
  type AskAiRouteCache,
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
  readAskAiRouteCache,
  writeAskAiRouteCache,
  clearAskAiRouteCache,
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
  GuidedSearchPage,
  MobileResultsView,
  DesktopResultsView,
  SearchEmptyState,
  SearchPagination,
  SearchFilterPanel,
} from '../components/home/search/SearchComponents'
import PlaceCard from '../components/PlaceCard'
import MapView from '../components/MapView'

import {
  AskAiModePanel,
} from '../components/home/ask-ai/AskAiComponents'

function isAskAiChatbotDailyLimitMessage(message: string | null) {
  if (!message) {
    return false
  }

  const normalized = message.trim().toLowerCase()
  return (
    normalized === 'you have reached your chatbot ai daily limit.' ||
    normalized === 'daily_ai_limit_reached'
  )
}

function SearchHub({
  initialMode = 'places',
  initialPromptBuilderOpen = false,
  initialSearchState,
  initialAskAiQuestion = '',
  navigationSource = 'push',
}: HomePageProps) {
  const initialFiltersCacheRef = useRef<FiltersCache | null>(readFiltersCache())
  const initialAskAiRuntimeStateRef = useRef(
    initialMode === 'ask-ai' && hasActiveAskAiRuntimeState()
      ? getAskAiRuntimeState()
      : null
  )
  const initialAskAiRouteCacheRef = useRef<AskAiRouteCache | null>(
    initialMode === 'ask-ai' ? readAskAiRouteCache() : null
  )
  const initialAskAiRuntimeState = initialAskAiRuntimeStateRef.current
  const initialAskAiRouteCache = initialAskAiRouteCacheRef.current
  const initialAskAiState = initialAskAiRuntimeState ?? initialAskAiRouteCache
  const normalizedInitialAskAiQuestion = normalizeSearchText(initialAskAiQuestion)
  const shouldUseCachedAskAiState =
    initialMode === 'ask-ai' &&
    Boolean(initialAskAiState) &&
    (
      !normalizedInitialAskAiQuestion ||
      initialAskAiState?.question === normalizedInitialAskAiQuestion
    )
  const shouldUseSearchRouteCache = initialMode === 'places' && isSearchResultsRoute() && navigationSource === 'pop'
  const initialRequestedPage =
    typeof initialSearchState?.page === 'number' && Number.isFinite(initialSearchState.page) && initialSearchState.page > 0
      ? Math.floor(initialSearchState.page)
      : 1
  const initialRouteCacheRef = useRef<SearchRouteCache | null>(
    shouldUseSearchRouteCache ? readSearchRouteCache() : null
  )
  const initialRouteCache = initialRouteCacheRef.current
  const [selectedMode, setSelectedMode] = useState<SearchMode>(initialMode)
  const { session, isSessionLoading } = useSavedFavorites()
  const [askAiUsageStatus, setAskAiUsageStatus] = useState<AskAiUsageStatus | null>(null)
  const [isAskAiUsageLoading, setIsAskAiUsageLoading] = useState(false)
  const [askAiUsageError, setAskAiUsageError] = useState<string | null>(null)
  const [askAiUsageRefreshSignal, setAskAiUsageRefreshSignal] = useState(0)
  const [askAiQuestion, setAskAiQuestion] = useState(
    shouldUseCachedAskAiState
      ? initialAskAiState?.question ?? ''
      : initialAskAiQuestion
  )
  const [askAiAnswer, setAskAiAnswer] = useState(
    shouldUseCachedAskAiState
      ? initialAskAiState?.answer ?? ''
      : ''
  )
  const [askAiSources, setAskAiSources] = useState<AskAiSource[]>(
    shouldUseCachedAskAiState
      ? initialAskAiState?.sources ?? []
      : []
  )
  const [isAskAiSubmitting, setIsAskAiSubmitting] = useState(
    shouldUseCachedAskAiState
      ? initialAskAiState?.isSubmitting === true
      : false
  )
  const [askAiAnswerError, setAskAiAnswerError] = useState<string | null>(
    shouldUseCachedAskAiState
      ? (initialAskAiState?.answerError && isAskAiChatbotDailyLimitMessage(initialAskAiState.answerError) ? null : initialAskAiState?.answerError ?? null)
      : null
  )
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(
    shouldUseCachedAskAiState
      ? initialAskAiState?.messages ?? []
      : []
  )
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
  const lastAutoSubmittedAskAiQuestionRef = useRef('')
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
  const searchFilterPanel = selectedMode !== 'ask-ai' ? (
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
  ) : null
  const shouldShowSearchFiltersPanel = selectedMode !== 'ask-ai' && !hasSearched && !initialSearchState?.autoSearch
  const visiblePlaces = hasSearched ? searchResults : []
  const totalResults = searchTotalCount
  const totalPages = Math.max(1, searchTotalPages)
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages)
  const selectedPlace = selectedPlaceId ? visiblePlaces.find((place) => place.id === selectedPlaceId) ?? null : null
  const shouldShowGuidedSearch = selectedMode === 'places' && !hasSearched && !initialSearchState?.autoSearch
  const shouldUseMinimalSearchLayout = Boolean(initialSearchState?.autoSearch)
  const isRegisteredUser = Boolean(session?.user)
  const isSearching = isInitialSearching || isRefreshingSearch
  const shouldShowSearchLoadingState = selectedMode === 'places' && isInitialSearching
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
  const handleRetryAskAiUsage = () => {
    setAskAiUsageRefreshSignal((signal) => signal + 1)
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

  const handleAskAiSubmit = async (questionOverride?: string) => {
    const question = normalizeSearchText(questionOverride ?? askAiQuestion)

    const guestId = session?.access_token ? null : getOrCreateAskAiGuestId()

    if (!question || isAskAiSubmitting || (!session?.access_token && !guestId)) {
      return
    }

    setAskAiQuestion(question)

    const updatedMessages: ChatMessage[] = [
      ...chatMessages,
      { role: 'user' as const, content: question },
    ]
    setChatMessages(updatedMessages)

    await submitAskAiRuntimeRequest({
      question,
      accessToken: session?.access_token ?? null,
      guestId,
      messages: updatedMessages,
    })
    setAskAiUsageRefreshSignal((signal) => signal + 1)
  }

  const handleStartOverAskAi = () => {
    resetAskAiRuntimeState({
      usageStatus: askAiUsageStatus,
    })
    setAskAiQuestion('')
    setAskAiAnswer('')
    setAskAiSources([])
    setAskAiAnswerError(null)
    setAskAiUsageError(null)
    setChatMessages([])

    if (!askAiUsageStatus && session?.access_token) {
      setAskAiUsageRefreshSignal((current) => current + 1)
    }

    clearAskAiRouteCache()
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

      setSelectedMode('places')
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
    if (initialMode !== 'ask-ai') {
      return
    }

      const initialAnswerError = initialAskAiState?.answerError ?? null
      seedAskAiRuntimeState({
        question: initialAskAiState?.question ?? '',
        answer: initialAskAiState?.answer ?? '',
        sources: initialAskAiState?.sources ?? [],
        answerError: initialAnswerError && isAskAiChatbotDailyLimitMessage(initialAnswerError) ? null : initialAnswerError,
        usageStatus: null,
        isSubmitting: initialAskAiState?.isSubmitting === true,
        messages: initialAskAiState?.messages ?? [],
        jobId: initialAskAiState?.jobId ?? null,
        jobStatus: initialAskAiState?.jobStatus ?? null,
      })

    let hasReceivedInitialRuntimeState = false

    return subscribeToAskAiRuntime((runtimeState) => {
      setAskAiQuestion(runtimeState.question)
      setAskAiAnswer(runtimeState.answer)
      setAskAiSources(runtimeState.sources)
      setAskAiAnswerError(runtimeState.answerError)
      if (hasReceivedInitialRuntimeState && runtimeState.usageStatus) {
        setAskAiUsageStatus(runtimeState.usageStatus)
      }
      hasReceivedInitialRuntimeState = true
      setIsAskAiSubmitting(runtimeState.isSubmitting)

      if (runtimeState.answer && runtimeState.jobStatus === 'completed') {
        trackAskAiChatbotUsed({
          answerLength: runtimeState.answer.length,
        })
        setChatMessages((prev) => {
          const lastMessage = prev[prev.length - 1]
          if (lastMessage?.role === 'assistant' && lastMessage.content === runtimeState.answer) {
            return prev
          }
          if (lastMessage?.role === 'assistant') {
            return [...prev.slice(0, -1), { role: 'assistant' as const, content: runtimeState.answer }]
          }
          return [...prev, { role: 'assistant' as const, content: runtimeState.answer }]
        })
      }
    })
  }, [initialAskAiRuntimeState, initialAskAiState, initialMode])

  useEffect(() => {
    if (initialMode !== 'ask-ai') {
      return
    }

    const question = normalizeSearchText(initialAskAiQuestion)
    if (!question || lastAutoSubmittedAskAiQuestionRef.current === question) {
      return
    }

    const runtimeState = getAskAiRuntimeState()
    const hasActiveRequestForQuestion =
      question &&
      runtimeState.question === question &&
      runtimeState.isSubmitting
    const hasCachedResultForQuestion =
      question &&
      runtimeState.question === question &&
      Boolean(runtimeState.answer || runtimeState.answerError || runtimeState.sources.length)

    if (hasActiveRequestForQuestion || hasCachedResultForQuestion) {
      lastAutoSubmittedAskAiQuestionRef.current = question
      return
    }

    if (isSessionLoading || (!session?.access_token && !getOrCreateAskAiGuestId())) {
      return
    }

    lastAutoSubmittedAskAiQuestionRef.current = question
    void handleAskAiSubmit(question)
  }, [handleAskAiSubmit, initialAskAiQuestion, initialMode, isSessionLoading, session?.access_token])

  useEffect(() => {
    if (initialMode !== 'ask-ai') {
      return
    }

    const normalizedQuestion = normalizeSearchText(askAiQuestion)

    if (!normalizedQuestion && !askAiAnswer && !askAiSources.length && !askAiAnswerError) {
      clearAskAiRouteCache()
      return
    }

    const runtimeState = getAskAiRuntimeState()

    writeAskAiRouteCache({
      question: normalizedQuestion,
      answer: askAiAnswer,
      sources: askAiSources,
      answerError: askAiAnswerError,
      isSubmitting: isAskAiSubmitting,
      messages: chatMessages,
      jobId: runtimeState.jobId,
      jobStatus: runtimeState.jobStatus,
    })
  }, [askAiAnswer, askAiAnswerError, askAiQuestion, askAiSources, initialMode, isAskAiSubmitting, chatMessages])

  useEffect(() => {
    if (initialMode !== 'ask-ai' || !session?.access_token) {
      return
    }

    void resumeAskAiRuntimeJob({
      accessToken: session.access_token,
    })
  }, [initialMode, session?.access_token])

  useEffect(() => {
    if (!askAiUsageStatus?.allowed) {
      return
    }

    setAskAiAnswerError((currentValue) =>
      isAskAiChatbotDailyLimitMessage(currentValue) ? null : currentValue
    )
  }, [askAiUsageStatus?.allowed])

  useAskAiUsageAutoRefresh({
    enabled: selectedMode === 'ask-ai' && !isSessionLoading,
    onRefresh: () => {
      setAskAiUsageRefreshSignal((prev) => prev + 1)
    },
  })

  useEffect(() => {
    if (selectedMode !== 'ask-ai') {
      return
    }

    lockBodyScroll()

    return () => {
      unlockBodyScroll()
    }
  }, [selectedMode])

  useEffect(() => {
    if (selectedMode !== 'ask-ai' || isSessionLoading) {
      return
    }

    const controller = new AbortController()
    const usageEndpoint = getApiUrl('/ask-ai/usage/check')
    const guestId = session?.access_token ? null : getOrCreateAskAiGuestId()

    const loadAskAiUsage = async () => {
      try {
        setIsAskAiUsageLoading(true)
        setAskAiUsageError(null)
        setAskAiUsageStatus(null)

        if (!session?.access_token && !guestId) {
          throw new Error('Missing Ask AI guest identifier.')
        }

        const response = await fetch(usageEndpoint, {
          method: 'GET',
          cache: 'no-store',
          headers: buildAskAiRequestHeaders(session?.access_token ?? null),
          signal: controller.signal,
        })

        const data = (await response.json()) as AskAiUsageResponse

        if (!response.ok) {
          throw new Error(data.message || data.error || 'Failed to check Ask AI usage.')
        }

        const usageStatus = getAskAiUsageStatusFromResponse(data, ['chatbotAi'])

        if (!usageStatus) {
          throw new Error('Ask AI usage response was incomplete.')
        }

        setAskAiUsageStatus(usageStatus)
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return
        }

        const message = error instanceof Error ? error.message : 'Failed to check Ask AI usage.'
        setAskAiUsageError(message)
      } finally {
        if (!controller.signal.aborted) {
          setIsAskAiUsageLoading(false)
        }
      }
    }

    void loadAskAiUsage()

    return () => controller.abort()
  }, [askAiUsageRefreshSignal, isSessionLoading, selectedMode, session?.access_token])

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

                  <MobileResultsTabs selectedView={mobileResultsView} onViewChange={setMobileResultsView} />

                  {shouldShowSearchLoadingState ? (
                    <div className="mt-4 grid gap-3">
                      <SearchLoadingCard compact />
                      <SearchLoadingCard compact />
                    </div>
                  ) : mobileResultsView === 'cards' ? (
                    <div className="mt-4 grid gap-3">
                      <div className={`grid gap-3 transition ${isPageLoading ? 'pointer-events-none opacity-60' : 'opacity-100'}`}>
                        {visiblePlaces.map((place) => (
                          <PlaceCard
                            key={place.id}
                            place={place}
                            isSelected={selectedPlaceId === place.id}
                            searchResultCard
                            dataSearchPlaceId={place.id}
                            onSelect={handleMapPlaceSelect}
                            onOpen={handlePlaceSelect}
                          />
                        ))}
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
                      <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
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
                        <PlaceCard
                          place={selectedPlace}
                          compact
                          searchResultCard
                          isSelected
                          onSelect={handleMapPlaceSelect}
                          onOpen={handlePlaceSelect}
                        />
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
      <div className={`${selectedMode === 'ask-ai' ? 'h-[var(--ask-ai-viewport-height,100dvh)] overflow-hidden overscroll-none' : 'min-h-screen lg:h-[100dvh] lg:overflow-hidden'} bg-[var(--bg)] text-[var(--text)]`}>
        <GuestAuthPrompt variant="ask-ai" mode="modal" isOpen={promptLogin} onClose={() => setPromptLogin(false)} />
        {shouldShowSearchFiltersPanel ? searchFilterPanel : null}

      <div className={`gala-page-background overflow-x-hidden lg:hidden ${selectedMode === 'ask-ai' ? 'flex h-[var(--ask-ai-viewport-height,100dvh)] flex-col overflow-hidden overscroll-none' : 'flex min-h-screen flex-col'}`}>
          {selectedMode !== 'ask-ai' && <AppHeader signInLabel="Mag-sign in" minimal />}

          <main className={`overflow-x-hidden ${isPromptBuilderOpen ? 'flex min-h-[100dvh] flex-col overflow-hidden pb-0' : selectedMode === 'ask-ai' ? 'flex flex-1 min-h-0 flex-col overflow-hidden overscroll-none' : 'flex-1 min-h-0 pb-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] sm:pb-[calc(env(safe-area-inset-bottom,0px)+4.75rem)]'}`}>
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
              <>
                {selectedMode === 'places' ? (
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
                ) : (
                  <AskAiModePanel
                    isRegistered={isRegisteredUser}
                    isSessionLoading={isSessionLoading}
                    usageStatus={askAiUsageStatus}
                    isUsageLoading={isAskAiUsageLoading}
                    usageError={askAiUsageError}
                    answer={askAiAnswer}
                    sources={askAiSources}
                    isSubmitting={isAskAiSubmitting}
                    answerError={askAiAnswerError}
                    messages={chatMessages}
                    onRetryUsage={handleRetryAskAiUsage}
                    onSubmit={(questionOverride) => void handleAskAiSubmit(questionOverride)}
                    onStartOver={handleStartOverAskAi}
                    onGuestUpgradePrompt={() => setPromptLogin(true)}
                    className="h-full"
                  />
                )}
              </>
            )}
          </main>
        </div>

        <div
          className={`hidden w-full lg:grid ${
            isPromptBuilderOpen
              ? 'h-[100dvh] overflow-hidden grid-rows-[auto_minmax(0,1fr)]'
              : selectedMode === 'ask-ai'
                ? 'h-[100dvh] overflow-hidden grid-rows-[minmax(0,1fr)]'
              : 'h-[100dvh] overflow-hidden lg:grid-rows-[auto_minmax(0,1fr)_auto]'
          }`}
        >
          {selectedMode !== 'ask-ai' && <AppHeader minimal />}

          <div
            className={
              isPromptBuilderOpen
                ? 'flex h-full min-h-0 flex-col overflow-hidden'
              : selectedMode === 'ask-ai'
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
              <>
                {selectedMode === 'places' ? (
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
                ) : (
                  <AskAiModePanel
                    isRegistered={isRegisteredUser}
                    isSessionLoading={isSessionLoading}
                    usageStatus={askAiUsageStatus}
                    isUsageLoading={isAskAiUsageLoading}
                    usageError={askAiUsageError}
                    answer={askAiAnswer}
                    sources={askAiSources}
                    isSubmitting={isAskAiSubmitting}
                    answerError={askAiAnswerError}
                    messages={chatMessages}
                    onRetryUsage={handleRetryAskAiUsage}
                    onSubmit={(questionOverride) => void handleAskAiSubmit(questionOverride)}
                    onStartOver={handleStartOverAskAi}
                    onGuestUpgradePrompt={() => setPromptLogin(true)}
                    className="h-full"
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

export default SearchHub
