import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { PlaceCardData } from '../components/PlaceCard'
import AppHeader from '../components/AppHeader'
import { GuestAuthPrompt } from '../components/GuestAuthPrompt'
import PromptBuilderModal from '../components/PromptBuilderModal'

import { supabase } from '../supabase'
import { navigateToCanonicalPlace, navigateToPath, replaceWithPath, writePlaceReturnState } from '../utils/navigation'
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
import { readCachedAskAiUsage, subscribeToCachedAskAiUsage, writeCachedAskAiUsage, writeCachedAskAiUsageFromResponse } from '../utils/askAiUsageCache'
import type { SearchGoodForValue } from '../utils/searchParams'
import type { PromptBuilderState } from '../utils/promptBuilder'

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
  removePersistentStorage,
  getCurrentSearchRouteCacheKey,
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
  SearchLoadingState,
  GuidedSearchPage,
  MobileResultsView,
  DesktopResultsView,
  SearchEmptyState,
} from '../components/home/search/SearchComponents'

import {
  createPromptBuilderPrefill,
  AskAiModePanel,
} from '../components/home/ask-ai/AskAiComponents'

function HomePage({
  initialMode = 'places',
  initialPromptBuilderOpen = false,
  initialSearchState,
  initialAskAiQuestion = '',
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
  const supportsSearchRouteCache = initialMode === 'places' && isSearchResultsRoute()
  const initialRequestedPage =
    typeof initialSearchState?.page === 'number' && Number.isFinite(initialSearchState.page) && initialSearchState.page > 0
      ? Math.floor(initialSearchState.page)
      : 1
  const initialRouteCacheRef = useRef<SearchRouteCache | null>(
    supportsSearchRouteCache ? readSearchRouteCache() : null
  )
  const initialRouteCache = initialRouteCacheRef.current
  const [selectedMode, setSelectedMode] = useState<SearchMode>(initialMode)
  const [session, setSession] = useState<Session | null>(null)
  const [isSessionLoading, setIsSessionLoading] = useState(true)
  const [askAiUsageStatus, setAskAiUsageStatus] = useState<AskAiUsageStatus | null>(
    readCachedAskAiUsage('chatbotAi') ??
      (shouldUseCachedAskAiState ? initialAskAiState?.usageStatus ?? null : null)
  )
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
      ? initialAskAiState?.answerError ?? null
      : null
  )
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(
    shouldUseCachedAskAiState
      ? initialAskAiState?.messages ?? []
      : []
  )
  const [isPromptBuilderOpen, setIsPromptBuilderOpen] = useState(initialPromptBuilderOpen)
  const [promptBuilderInitialState, setPromptBuilderInitialState] = useState<PromptBuilderState | null>(null)
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
    Boolean(initialSearchState?.autoSearch && supportsSearchRouteCache && !initialRouteCache)
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
  const lastAutoSearchSignatureRef = useRef<string | null>(
    initialSearchState?.autoSearch && initialRouteCacheRef.current
      ? JSON.stringify({
          rawQuery: initialSearchState.rawQuery ?? '',
          category: initialSearchState.categoryId ?? null,
          area: initialSearchState.areaId ?? null,
          goodFor: initialSearchState.goodFor ?? null,
          budget: initialSearchState.budget ?? null,
          page: initialRequestedPage,
        })
      : null
  )
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
  const visiblePlaces = hasSearched ? searchResults : []
  const totalResults = searchTotalCount
  const totalPages = Math.max(1, searchTotalPages)
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages)
  const selectedPlace = selectedPlaceId ? visiblePlaces.find((place) => place.id === selectedPlaceId) ?? null : null
  const shouldShowGuidedSearch = selectedMode === 'places' && !hasSearched && !initialSearchState?.autoSearch
  const isRegisteredUser = Boolean(session?.user)
  const isSearching = isInitialSearching || isRefreshingSearch
  const shouldShowSearchLoadingState = selectedMode === 'places' && isInitialSearching
  const buildFilterOnlyQuery = ({
    category,
    area,
    goodFor,
    budget,
  }: {
    category: string | null
    area: string | null
    goodFor: SearchGoodForValue | null
    budget: BudgetValue | null
  }) => {
    const categoryLabel = category ? categories.find((entry) => entry.id === category)?.name ?? null : null
    const areaName = area ? areas.find((entry) => entry.id === area)?.name ?? null : null
    const goodForLabel = goodFor ? fallbackGoodForOptions.find((entry) => entry.id === goodFor)?.name ?? null : null
    const budgetLabel = budget ? budgetOptions.find((entry) => entry.value === budget)?.label ?? null : null

    return normalizeSearchText(
      buildFilterSearchText({
        rawQuery: '',
        categoryLabel,
        areaName,
        goodForLabel,
        budgetLabel,
      })
    )
  }
  const hasIndependentTypedQuery = ({
    query,
    category,
    area,
    goodFor,
    budget,
  }: {
    query: string
    category: string | null
    area: string | null
    goodFor: SearchGoodForValue | null
    budget: BudgetValue | null
  }) => {
    const normalizedQuery = normalizeSearchText(query)

    if (!normalizedQuery) {
      return false
    }

    const filterOnlyQuery = buildFilterOnlyQuery({ category, area, goodFor, budget })
    return !filterOnlyQuery || normalizedQuery !== filterOnlyQuery
  }
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
    const categoryLabel = mergedState.category
      ? categories.find((category) => category.id === mergedState.category)?.name ?? null
      : null
    const areaName = mergedState.area ? areas.find((area) => area.id === mergedState.area)?.name ?? null : null
    const goodForLabel = mergedState.goodFor
      ? fallbackGoodForOptions.find((option) => option.id === mergedState.goodFor)?.name ?? null
      : null
    const budgetLabel = mergedState.budget
      ? budgetOptions.find((budget) => budget.value === mergedState.budget)?.label ?? null
      : null
    const hasFilterUpdate =
      Object.prototype.hasOwnProperty.call(nextState, 'category') ||
      Object.prototype.hasOwnProperty.call(nextState, 'area') ||
      Object.prototype.hasOwnProperty.call(nextState, 'goodFor') ||
      Object.prototype.hasOwnProperty.call(nextState, 'budget')

    if (hasFilterUpdate) {
      const shouldPreserveQuery = hasIndependentTypedQuery({
        query: rawQuery,
        category: selectedCategory,
        area: selectedArea,
        goodFor: selectedGoodFor,
        budget: selectedBudget,
      })

      mergedState.rawQuery = shouldPreserveQuery
        ? normalizeSearchText(rawQuery)
        : buildFilterSearchText({
            rawQuery: '',
            categoryLabel,
            areaName,
            goodForLabel,
            budgetLabel,
          })
    }

    if (!mergedState.rawQuery && !mergedState.category && !mergedState.area && !mergedState.goodFor && !mergedState.budget) {
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
    if (searchValidationMessage) {
      setSearchValidationMessage(null)
    }
    if (searchError) {
      setSearchError(null)
    }
  }

  const openPromptBuilder = (
    source: 'ask-ai' | 'search' | 'empty-search' = 'search',
    questionOverride?: string,
  ) => {
    const prefill = source === 'ask-ai'
      ? createPromptBuilderPrefill({
          plan: questionOverride ?? askAiQuestion,
        })
      : createPromptBuilderPrefill({
          plan: lastSearchQuery && lastSearchQuery !== 'Explore all places' ? lastSearchQuery : null,
          location: selectedAreaName,
          budget: selectedBudgetLabel,
          priority: selectedCategoryName,
        })

    setPromptBuilderInitialState(prefill)
    setIsPromptBuilderOpen(true)
  }

  const handleAskAiSubmit = async (questionOverride?: string) => {
    const question = normalizeSearchText(questionOverride ?? askAiQuestion)

    if (!question || isAskAiSubmitting || !session?.access_token) {
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
      accessToken: session.access_token,
      messages: updatedMessages,
    })
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
    if (supportsSearchRouteCache) {
      removePersistentStorage(getCurrentSearchRouteCacheKey())
    }

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
    resetSearchState()
    replaceWithPath('/search')
  }

  const handlePlaceSelect = (placeId: string) => {
    const place = visiblePlaces.find((visiblePlace) => visiblePlace.id === placeId)
    const canonicalPlaceSlug = place?.slug?.trim()

    setSelectedPlaceId(placeId)
    if (canonicalPlaceSlug) {
      const searchUrl = `${window.location.pathname}${window.location.search}`
      const label = rawQuery?.trim() || activeSearchLabel?.replace(/^Showing\s+/, '')?.trim() || ''
      const returnLabel = label || 'search results'
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
      navigateToCanonicalPlace({
        slug: canonicalPlaceSlug,
        city: place?.city,
        area: place?.area,
        localArea: place?.localArea,
      }, {
        source: 'search',
        returnTo: searchUrl,
        returnLabel,
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

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
    desktopResultsScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' })

    void handleSearch({ page: nextPage }, true)
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
    suppressRefreshState = false,
  ) => {
    let nextRawQuery = normalizeSearchText(nextState?.rawQuery ?? rawQuery)
    const nextCategory = nextState?.category ?? selectedCategory
    const nextArea = nextState?.area ?? selectedArea
    const nextGoodFor = nextState?.goodFor ?? selectedGoodFor
    const nextBudget = nextState?.budget ?? selectedBudget
    const nextCategoryLabel = nextCategory
      ? categories.find((category) => category.id === nextCategory)?.name ?? null
      : null
    const nextAreaName = nextArea ? areas.find((area) => area.id === nextArea)?.name ?? null : null
    const nextGoodForLabel = nextGoodFor
      ? fallbackGoodForOptions.find((option) => option.id === nextGoodFor)?.name ?? null
      : null
    const nextBudgetLabel = nextBudget ? budgetOptions.find((budget) => budget.value === nextBudget)?.label ?? null : null

    if (!nextRawQuery && (nextCategory || nextArea || nextGoodFor || nextBudget)) {
      nextRawQuery = buildFilterSearchText({
        rawQuery: '',
        categoryLabel: nextCategoryLabel,
        areaName: nextAreaName,
        goodForLabel: nextGoodForLabel,
        budgetLabel: nextBudgetLabel,
      })
    }
    const nextPage = nextState?.page ?? 1
    const hasCriteria = Boolean(nextRawQuery || nextCategory || nextArea || nextGoodFor || nextBudget)

    if (!hasCriteria) {
      setSearchValidationMessage('Type a vibe or choose filters first.')
      setSearchError(null)
      return
    }

    const requestVersion = searchRequestVersion.current + 1
    searchRequestVersion.current = requestVersion
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
      if (suppressRefreshState) {
        setIsPageLoading(true)
      } else {
        setIsInitialSearching(true)
      }
      setSearchValidationMessage(null)
      setSearchError(null)
      setSearchStatus(null)
      setSearchFeedbackMessage(null)
      setPromptLogin(false)
      setActiveSearchLabel(nextRawQuery || 'filtered GalaTayo places')

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
      setRawQuery(nextRawQuery)
      setSelectedCategory(nextCategory)
      setSelectedArea(nextArea)
      setSelectedGoodFor(nextGoodFor)
      setSelectedBudget(nextBudget)
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
      if (supportsSearchRouteCache) {
        writeSearchRouteCache({
          lastSearchQuery: nextRawQuery,
          activeSearchLabel: nextRawQuery || 'filtered GalaTayo places',
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
      if (searchRequestVersion.current !== requestVersion) {
        return
      }

      const message = error instanceof Error ? error.message : 'Search failed.'
      setSearchError(message)
      setSearchStatus(null)
      setSearchFeedbackMessage(null)
      setHasSearched(true)
      console.error('Search request failed:', error)
    } finally {
      if (searchRequestVersion.current === requestVersion) {
        setIsInitialSearching(false)
        setIsRefreshingSearch(false)
        setIsPageLoading(false)
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

    const shouldRefreshInPlace =
      hasSearched || searchResults.length > 0 || Boolean(lastSearchQuery.trim()) || Boolean(activeSearchLabel.trim())

    void handleSearch(nextAutoSearch, shouldRefreshInPlace)
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
    searchResults.length,
  ])

  useLayoutEffect(() => {
    if (!supportsSearchRouteCache || !initialRouteCache?.pendingScrollRestore || hasRestoredInitialScrollRef.current) {
      return
    }

    hasRestoredInitialScrollRef.current = true

    restoreSearchRouteScroll(initialRouteCache, desktopResultsScrollRef)

    writeSearchRouteCache({
      ...initialRouteCache,
      pendingScrollRestore: false,
    })
  }, [initialRouteCache, supportsSearchRouteCache])

  useEffect(() => {
    if (initialMode !== 'ask-ai') {
      return
    }

    seedAskAiRuntimeState({
      question: initialAskAiState?.question ?? '',
      answer: initialAskAiState?.answer ?? '',
      sources: initialAskAiState?.sources ?? [],
      answerError: initialAskAiState?.answerError ?? null,
      usageStatus: readCachedAskAiUsage('chatbotAi') ?? initialAskAiState?.usageStatus ?? null,
      isSubmitting: initialAskAiState?.isSubmitting === true,
      messages: initialAskAiState?.messages ?? [],
      jobId: initialAskAiState?.jobId ?? null,
      jobStatus: initialAskAiState?.jobStatus ?? null,
    })

    return subscribeToAskAiRuntime((runtimeState) => {
      setAskAiQuestion(runtimeState.question)
      setAskAiAnswer(runtimeState.answer)
      setAskAiSources(runtimeState.sources)
      setAskAiAnswerError(runtimeState.answerError)
      setAskAiUsageStatus((currentUsageStatus) => runtimeState.usageStatus ?? currentUsageStatus)
      setIsAskAiSubmitting(runtimeState.isSubmitting)

      if (runtimeState.answer && runtimeState.jobStatus === 'completed') {
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

    if (isSessionLoading || !session?.access_token) {
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
      usageStatus: askAiUsageStatus,
      isSubmitting: isAskAiSubmitting,
      messages: chatMessages,
      jobId: runtimeState.jobId,
      jobStatus: runtimeState.jobStatus,
    })
  }, [askAiAnswer, askAiAnswerError, askAiQuestion, askAiSources, askAiUsageStatus, initialMode, isAskAiSubmitting, chatMessages])

  useEffect(() => {
    if (initialMode !== 'ask-ai' || !session?.access_token) {
      return
    }

    void resumeAskAiRuntimeJob({
      accessToken: session.access_token,
    })
  }, [initialMode, session?.access_token])

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data.session)
        setIsSessionLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsSessionLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    writeCachedAskAiUsage('chatbotAi', askAiUsageStatus)
  }, [askAiUsageStatus])

  useEffect(() => {
    return subscribeToCachedAskAiUsage('chatbotAi', (usageStatus) => {
      setAskAiUsageStatus((currentUsageStatus) => {
        if (
          currentUsageStatus?.usageType === usageStatus?.usageType &&
          currentUsageStatus?.allowed === usageStatus?.allowed &&
          currentUsageStatus?.limit === usageStatus?.limit &&
          currentUsageStatus?.used === usageStatus?.used &&
          currentUsageStatus?.remaining === usageStatus?.remaining &&
          currentUsageStatus?.resetAt === usageStatus?.resetAt &&
          currentUsageStatus?.message === usageStatus?.message
        ) {
          return currentUsageStatus
        }

        return usageStatus
      })
    })
  }, [])

  useEffect(() => {
    if (selectedMode !== 'ask-ai' || isSessionLoading) {
      return
    }

    if (!session?.access_token) {
      return
    }

    const controller = new AbortController()
    const usageEndpoint = getApiUrl('/ask-ai/usage/check')

    const loadAskAiUsage = async () => {
      try {
        setIsAskAiUsageLoading(true)
        setAskAiUsageError(null)

        const response = await fetch(usageEndpoint, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          signal: controller.signal,
        })

        const data = (await response.json()) as AskAiUsageResponse

        if (!response.ok) {
          throw new Error(data.message || data.error || 'Failed to check Ask AI usage.')
        }

        writeCachedAskAiUsageFromResponse(data)

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

    return (
      <div className={`${selectedMode === 'ask-ai' ? 'h-screen overflow-hidden' : 'min-h-screen'} bg-[var(--bg)] text-[var(--text)]`}>
        <GuestAuthPrompt variant="ask-ai" mode="modal" isOpen={promptLogin} onClose={() => setPromptLogin(false)} />

      <div className={`gala-page-background overflow-x-hidden lg:hidden ${selectedMode === 'ask-ai' ? 'flex h-[100dvh] flex-col overflow-hidden' : 'min-h-screen'}`}>
          {selectedMode !== 'ask-ai' && <AppHeader signInLabel="Mag-sign in" minimal />}

          <main className={`overflow-x-hidden ${isPromptBuilderOpen ? 'flex h-[100dvh] flex-col overflow-hidden pb-0' : selectedMode === 'ask-ai' ? 'flex flex-1 flex-col min-h-0 overflow-hidden' : 'pb-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] sm:pb-[calc(env(safe-area-inset-bottom,0px)+4.75rem)]'}`}>
            {isPromptBuilderOpen ? (
              <PromptBuilderModal
                isOpen={isPromptBuilderOpen}
                initialState={promptBuilderInitialState}
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
                    onOpenPromptBuilder={(questionOverride) => openPromptBuilder('ask-ai', questionOverride)}
                  />
                )}
              </>
            )}
          </main>
        </div>

        <div
          className={`hidden w-full lg:grid ${
            isPromptBuilderOpen
              ? 'h-screen overflow-hidden grid-rows-[auto_minmax(0,1fr)]'
              : selectedMode === 'ask-ai'
                ? 'h-screen overflow-hidden grid-rows-[minmax(0,1fr)]'
              : 'h-screen overflow-hidden lg:grid-rows-[auto_minmax(0,1fr)_auto]'
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
                  : 'grid min-h-0 overflow-hidden grid-rows-[auto_minmax(0,1fr)]'
            }
          >
            {isPromptBuilderOpen ? (
              <PromptBuilderModal
                isOpen={isPromptBuilderOpen}
                initialState={promptBuilderInitialState}
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
                onRawQueryChange={handleRawQueryChange}
                onClearSearch={handleClearSearch}
                onSubmitSearch={() => void handleSearch()}
              />
            ) : (
              <>
                {selectedMode === 'places' ? (
                  visiblePlaces.length > 0 ? (
                    <DesktopResultsView
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
                      onSelectPlace={handleMapPlaceSelect}
                      onPageChange={handlePageChange}
                      onViewDetails={handlePlaceSelect}
                      onClearSearch={handleClearSearch}
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
                    onOpenPromptBuilder={(questionOverride) => openPromptBuilder('ask-ai', questionOverride)}
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

export default HomePage
