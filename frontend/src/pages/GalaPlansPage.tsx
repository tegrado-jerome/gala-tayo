
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import PlanDetail from '../components/gala-plan/PlanDetail'
import PlanList from '../components/gala-plan/PlanList'
import { AppIcon } from '../components/AppIcon'
import MinimalBackNav from '../components/navigation/MinimalBackNav'
import PageHeroHeader from '../components/PageHeroHeader'
import {
  createGalaPlan,
  getGalaPlan,
  updateGalaPlan,
  type GalaPlanItemPayload,
  type GalaPlanVisibility,
} from '../utils/galaPlansApi'
import { PageContainer, PageShell } from '../components/layout/ResponsiveLayouts'
import { parseGalaPlanDescription } from '../utils/galaPlansApi'
import { navigateToPath } from '../utils/navigation'
import { getCategoryIconName } from '../components/AppIcon'
import { getApiUrl } from '../utils/apiClient'
import { InlineSkeleton } from '../components/loading/SkeletonStates'

type Mode = 'list' | 'favorites' | 'new' | 'detail' | 'edit'

type SearchPlaceResult = {
  id: string
  slug?: string | null
  name?: string | null
  category?: string | null
  city?: string | null
  area?: string | null
  address?: string | null
}

type DraftItem = GalaPlanItemPayload & {
  draft_id: string
  place: SearchPlaceResult
}

type GalaPlansPageProps = {
  mode?: Mode
  planId?: string | null
  session?: Session | null
}

const PLACE_SEARCH_DEFAULT_LIMIT = 10
const PLACE_SEARCH_DEBOUNCE_MS = 325
const TIME_PERIODS = ['AM', 'PM'] as const

type TimePeriod = (typeof TIME_PERIODS)[number]

function cleanPlanDescription(value: string | null | undefined) {
  return parseGalaPlanDescription(value).description
}

function parseTimeLabel(value: string | null | undefined): { time: string; period: TimePeriod | '' } {
  const trimmedValue = value?.trim() ?? ''
  if (!trimmedValue) return { time: '', period: '' }

  const match = trimmedValue.match(/^(.*?)(?:\s*)(AM|PM)$/i)
  if (!match) return { time: trimmedValue, period: '' }

  return {
    time: match[1]?.trim() ?? '',
    period: match[2]?.toUpperCase() as TimePeriod,
  }
}

function buildTimeLabel(time: string, period: TimePeriod | '') {
  const trimmedTime = time.trim()
  if (!trimmedTime) return ''
  return period ? `${trimmedTime} ${period}` : trimmedTime
}

function VisibilitySelector({ value, onChange }: { value: GalaPlanVisibility; onChange: (value: GalaPlanVisibility) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(['private', 'public'] as const).map((visibility) => (
        <button key={visibility} type="button" onClick={() => onChange(visibility)} className={`h-11 rounded-lg border px-3 text-sm font-black capitalize ${value === visibility ? 'border-[var(--accent)] bg-[var(--chip)] text-[var(--accent-deep)]' : 'border-[var(--line-strong)] bg-white text-slate-700'}`}>
          {visibility}
        </button>
      ))}
    </div>
  )
}

function getPlaceMeta(place: SearchPlaceResult) {
  return [place.city || place.area, place.category].filter(Boolean).join(' · ')
}

function orderDraftItems(items: DraftItem[]) {
  return [...items].sort(
    (first, second) =>
      (first.day_number ?? 1) - (second.day_number ?? 1) ||
      (first.sort_order ?? 0) - (second.sort_order ?? 0) ||
      first.place.name?.localeCompare(second.place.name ?? '') ||
    0,
  )
}

type SearchResponse = {
  page?: number
  limit?: number
  totalCount?: number
  totalPages?: number
  places?: SearchPlaceResult[]
  result?: {
    page?: number
    limit?: number
    totalCount?: number
    totalPages?: number
    places?: SearchPlaceResult[]
  }
  message?: string
}

function normalizeSearchResults(data: SearchResponse) {
  return {
    page: data.page ?? data.result?.page ?? 1,
    limit: data.limit ?? data.result?.limit ?? PLACE_SEARCH_DEFAULT_LIMIT,
    totalCount: data.totalCount ?? data.result?.totalCount ?? 0,
    totalPages: data.totalPages ?? data.result?.totalPages ?? 1,
    places: (data.places || data.result?.places || []).filter((place) => place.id && place.name),
  }
}

function ItineraryBuilder({
  items,
  onItemsChange,
}: {
  items: DraftItem[]
  onItemsChange: (items: DraftItem[]) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchPlaceResult[]>([])
  const [searchPage, setSearchPage] = useState(1)
  const [searchTotalPages, setSearchTotalPages] = useState(1)
  const [searchTotalCount, setSearchTotalCount] = useState(0)
  const [hasSearchedPlaces, setHasSearchedPlaces] = useState(false)
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedPlace, setSelectedPlace] = useState<SearchPlaceResult | null>(null)
  const [draftDay, setDraftDay] = useState(1)
  const [draftOrder, setDraftOrder] = useState(1)
  const [draftTime, setDraftTime] = useState('')
  const [draftTimePeriod, setDraftTimePeriod] = useState<TimePeriod | ''>('')
  const [draftMinutes, setDraftMinutes] = useState('')
  const [draftNotes, setDraftNotes] = useState('')
  const draftIdSequence = useRef(0)
  const searchRequestId = useRef(0)
  const orderedItems = useMemo(() => orderDraftItems(items), [items])
  const groupedItems = useMemo(() => {
    const groups = new Map<number, DraftItem[]>()
    for (const item of orderedItems) {
      const day = item.day_number ?? 1
      const dayItems = groups.get(day) || []
      dayItems.push(item)
      groups.set(day, dayItems)
    }
    return Array.from(groups.entries()).sort(([first], [second]) => first - second)
  }, [orderedItems])
  const hasPreviousSearchPage = searchPage > 1
  const hasNextSearchPage = searchPage < searchTotalPages

  const handleQueryChange = (value: string) => {
    setQuery(value)
    setErrorMessage('')
    if (value.trim().length < 2) {
      setResults([])
      setSearchPage(1)
      setSearchTotalPages(1)
      setSearchTotalCount(0)
      setHasSearchedPlaces(false)
      setIsSearchModalOpen(false)
      return
    }
    setIsSearchModalOpen(true)
  }

  const startDraftForPlace = (place: SearchPlaceResult) => {
    const latestDay = orderedItems.length > 0 ? Math.max(...orderedItems.map((item) => item.day_number ?? 1)) : 1
    const suggestedOrder = orderedItems.filter((item) => (item.day_number ?? 1) === latestDay).length + 1
    setSelectedPlace(place)
    setDraftDay(latestDay)
    setDraftOrder(suggestedOrder)
    setDraftTime('')
    setDraftTimePeriod('')
    setDraftMinutes('')
    setDraftNotes('')
    setErrorMessage('')
    setIsSearchModalOpen(false)
  }

  const searchPlaces = useCallback(async (page = 1, openModal = true) => {
    const trimmedQuery = query.trim()
    if (trimmedQuery.length < 2) {
      setErrorMessage('Search at least 2 characters.')
      return
    }

    const requestId = ++searchRequestId.current

    try {
      setIsSearching(true)
      setErrorMessage('')
      setHasSearchedPlaces(true)
      setSearchPage(page)
      if (openModal) setIsSearchModalOpen(true)
      const response = await fetch(getApiUrl('/search'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: trimmedQuery,
          page,
          limit: PLACE_SEARCH_DEFAULT_LIMIT,
          strictPlaceSearch: true,
        }),
      })
      const data = (await response.json().catch(() => ({}))) as SearchResponse
      if (!response.ok) throw new Error(data.message || 'Failed to search places.')
      if (requestId !== searchRequestId.current) return
      const normalized = normalizeSearchResults(data)
      setResults(normalized.places)
      setSearchPage(normalized.page)
      setSearchTotalPages(normalized.totalPages)
      setSearchTotalCount(normalized.totalCount)
    } catch (error) {
      if (requestId !== searchRequestId.current) return
      setErrorMessage(error instanceof Error ? error.message : 'Failed to search places.')
    } finally {
      if (requestId === searchRequestId.current) {
        setIsSearching(false)
      }
    }
  }, [query])

  useEffect(() => {
    if (query.trim().length < 2) return

    const timeout = window.setTimeout(() => {
      void searchPlaces(1, false)
    }, PLACE_SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timeout)
  }, [query, searchPlaces])

  const confirmAddPlace = () => {
    if (!selectedPlace) {
      setErrorMessage('Pick a place first.')
      return
    }
    if (items.some((item) => item.place_id === selectedPlace.id)) {
      setErrorMessage('That place is already in this gala plan.')
      return
    }
    draftIdSequence.current += 1
    onItemsChange([
      ...items,
      {
        draft_id: `${selectedPlace.id}-${draftIdSequence.current}`,
        place_id: selectedPlace.id,
        day_number: Math.max(1, draftDay || 1),
        sort_order: Math.max(1, draftOrder || 1),
        time_label: buildTimeLabel(draftTime, draftTimePeriod) || null,
        notes: draftNotes.trim() || null,
        estimated_minutes: draftMinutes ? Math.max(1, Number(draftMinutes) || 1) : null,
        place: selectedPlace,
      },
    ])
    setQuery('')
    setResults([])
    setSearchPage(1)
    setSearchTotalPages(1)
    setSearchTotalCount(0)
    setSelectedPlace(null)
    setErrorMessage('')
    setDraftTime('')
    setDraftTimePeriod('')
    setDraftMinutes('')
    setDraftNotes('')
  }

  const updateItem = (draftId: string, updates: Partial<DraftItem>) => {
    onItemsChange(items.map((item) => (item.draft_id === draftId ? { ...item, ...updates } : item)))
  }

  const removeItem = (draftId: string) => {
    onItemsChange(items.filter((item) => item.draft_id !== draftId).map((item, index) => ({ ...item, sort_order: index + 1 })))
  }

  return (
    <>
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_minmax(360px,0.82fr)] 2xl:grid-cols-[minmax(0,1.22fr)_minmax(400px,0.78fr)] lg:items-start">
      <section className="grid gap-6">
        <div className="grid gap-2">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--accent-deep)]">Build The Route</p>
          <h2 className="gala-section-title">Add places in a simple flow</h2>
          <p className="max-w-2xl text-sm font-semibold leading-6 text-slate-600">Search a place, choose it, fill in the visit details, then add it to your plan.</p>
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-[var(--accent-wash)] px-5 py-4 text-sm font-semibold leading-6 text-[var(--accent-deep)]">
          Tip: keep it simple. Start with the first place you know for sure, then add the next stop after.
        </div>

        <div className="grid gap-3">
          <div className="flex items-center gap-2 text-sm font-black text-slate-950">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--chip)] text-[var(--accent-deep)]">1</span>
            Search and choose a place
          </div>
          <p className="text-sm font-semibold text-slate-600">Type an area or place name like `Intramuros`, then tap `Choose` on the result you want.</p>
          <div className="relative grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="relative">
              <AppIcon name="search" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => handleQueryChange(event.target.value)} onFocus={() => { if (query.trim().length >= 2) setIsSearchModalOpen(true) }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void searchPlaces(1, true) } }} className="h-12 w-full rounded-2xl border border-[var(--line-strong)] bg-white pl-11 pr-4 text-sm font-semibold outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]" placeholder="Search places to add" />
            </div>
            <button type="button" onClick={() => void searchPlaces(1, true)} disabled={isSearching} className="app-button app-button-primary app-button-md">{isSearching ? 'Searching...' : 'Search'}</button>

            {isSearchModalOpen ? (
              <div className="absolute left-0 right-0 top-[calc(100%+0.75rem)] z-20 overflow-hidden rounded-[24px] border border-[var(--line)] bg-white shadow-[0_24px_60px_rgba(27, 26, 23, 0.18)] sm:left-0 sm:right-auto sm:w-[min(760px,calc(100vw-2rem))]">
                <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--accent-deep)]">Search Suggestions</p>
                    <p className="mt-1 text-sm font-semibold text-slate-600">
                      {searchTotalCount > 0
                        ? `${searchTotalCount} result${searchTotalCount === 1 ? '' : 's'} found`
                        : query.trim().length >= 2
                          ? 'Searching suggestions...'
                          : 'Type at least 2 characters.'}
                    </p>
                  </div>
                  <button type="button" onClick={() => setIsSearchModalOpen(false)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-white text-slate-500 transition hover:border-[var(--line-strong)] hover:text-slate-800" aria-label="Close search suggestions">
                    <AppIcon name="clear" className="h-4 w-4" />
                  </button>
                </div>

                <div className="max-h-[52vh] overflow-y-auto p-2">
                  {results.length === 0 && isSearching ? (
                    <div className="gala-empty-state m-2">
                      <p className="text-base font-black text-slate-900">Searching places...</p>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">We are loading suggestions for your query.</p>
                    </div>
                  ) : null}

                  {!isSearching && !hasSearchedPlaces && query.trim().length >= 2 ? (
                    <div className="gala-empty-state m-2">
                      <p className="text-base font-black text-slate-900">Looking up suggestions...</p>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">We are preparing place suggestions for your search.</p>
                    </div>
                  ) : null}

                  {!isSearching && hasSearchedPlaces && results.length === 0 ? (
                    <div className="gala-empty-state m-2">
                      <p className="text-base font-black text-slate-900">No places found.</p>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Try a different spelling, neighborhood, or category.</p>
                    </div>
                  ) : null}

                  <div className="grid gap-2">
                    {results.map((place) => {
                      const alreadyAdded = items.some((item) => item.place_id === place.id)
                      const isSelected = selectedPlace?.id === place.id
                      return (
                        <article key={place.id} className={`flex items-start justify-between gap-4 rounded-2xl border px-4 py-3 transition ${isSelected ? 'border-[var(--accent)] bg-[var(--accent-wash)]' : 'border-[var(--line)] bg-white'}`}>
                          <div className="flex min-w-0 gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-[var(--accent-deep)]">
                              <AppIcon name={getCategoryIconName(place.category)} className="h-5 w-5" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-slate-950">{place.name}</p>
                              <p className="mt-1 text-xs font-semibold text-slate-600">{getPlaceMeta(place) || place.address || 'Metro Manila place'}</p>
                            </div>
                          </div>
                          <button type="button" onClick={() => startDraftForPlace(place)} disabled={alreadyAdded} className={`inline-flex h-10 items-center justify-center rounded-xl px-4 text-xs font-black transition ${alreadyAdded ? 'bg-slate-100 text-slate-400' : isSelected ? 'bg-[var(--accent)] text-white' : 'border border-[var(--line-strong)] bg-white text-slate-800 hover:border-[var(--accent)] hover:text-[var(--accent-deep)]'}`}>
                            {alreadyAdded ? 'Added' : isSelected ? 'Selected' : 'Choose'}
                          </button>
                        </article>
                      )
                    })}
                  </div>

                  <div className="flex flex-col gap-2 border-t border-[var(--line)] px-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs font-semibold text-slate-600">Showing up to {PLACE_SEARCH_DEFAULT_LIMIT} places per page.</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void searchPlaces(Math.max(1, searchPage - 1), false)}
                        disabled={!hasPreviousSearchPage || isSearching}
                        className="h-9 rounded-xl border border-[var(--line-strong)] bg-white px-3.5 text-xs font-black text-slate-700 transition hover:border-[var(--accent)] hover:text-[var(--accent-deep)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        onClick={() => void searchPlaces(searchPage + 1, false)}
                        disabled={!hasNextSearchPage || isSearching}
                        className="h-9 rounded-xl border border-[var(--line-strong)] bg-white px-3.5 text-xs font-black text-slate-700 transition hover:border-[var(--accent)] hover:text-[var(--accent-deep)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <section className="grid gap-4 border-t border-[var(--line)] pt-6">
          <div className="flex items-center gap-2 text-sm font-black text-slate-950">
            <span className={`flex h-8 w-8 items-center justify-center rounded-full ${selectedPlace ? 'bg-[var(--accent)] text-white' : 'bg-slate-100 text-slate-500'}`}>2</span>
            Set the visit details
          </div>
          {!selectedPlace ? (
            <p className="text-sm font-semibold leading-6 text-slate-600">After you choose a place, its day, stop number, time, and notes will appear here.</p>
          ) : (
            <div className="grid gap-4">
              <div className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[var(--accent-deep)] ring-1 ring-[var(--line)]">
                  <AppIcon name={getCategoryIconName(selectedPlace.category)} className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-base font-black text-slate-950">{selectedPlace.name}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">{getPlaceMeta(selectedPlace) || selectedPlace.address || 'Metro Manila place'}</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <label className="grid gap-1.5">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Day</span>
                  <input type="number" min={1} value={draftDay} onChange={(event) => setDraftDay(Math.max(1, Number(event.target.value) || 1))} className="h-11 rounded-2xl border border-[var(--line-strong)] bg-white px-4 text-sm font-bold outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Stop number</span>
                  <input type="number" min={1} value={draftOrder} onChange={(event) => setDraftOrder(Math.max(1, Number(event.target.value) || 1))} className="h-11 rounded-2xl border border-[var(--line-strong)] bg-white px-4 text-sm font-bold outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Time</span>
                  <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
                    <input value={draftTime} onChange={(event) => setDraftTime(event.target.value)} placeholder="09:30" className="h-11 rounded-2xl border border-[var(--line-strong)] bg-white px-4 text-sm font-bold outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]" />
                    <select value={draftTimePeriod} onChange={(event) => setDraftTimePeriod(event.target.value as TimePeriod | '')} className="h-11 rounded-2xl border border-[var(--line-strong)] bg-white px-3 text-sm font-black outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]">
                      <option value="">--</option>
                      {TIME_PERIODS.map((period) => (
                        <option key={period} value={period}>{period}</option>
                      ))}
                    </select>
                  </div>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Minutes</span>
                  <input type="number" min={1} value={draftMinutes} onChange={(event) => setDraftMinutes(event.target.value)} placeholder="60" className="h-11 rounded-2xl border border-[var(--line-strong)] bg-white px-4 text-sm font-bold outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]" />
                </label>
              </div>

              <label className="grid gap-1.5">
                <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                  Notes
                  <span className="optional-label">Optional</span>
                </span>
                <textarea value={draftNotes} onChange={(event) => setDraftNotes(event.target.value)} rows={3} placeholder="Meet here first, good for sunset, or anything useful." className="w-full resize-none rounded-2xl border border-[var(--line-strong)] bg-white px-4 py-3 text-sm font-semibold leading-6 outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]" />
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-3 text-sm font-semibold text-slate-600">
                <p>You are adding <span className="font-black text-slate-950">{selectedPlace.name}</span> as <span className="font-black text-slate-950">Day {draftDay}, Stop {draftOrder}</span>{buildTimeLabel(draftTime, draftTimePeriod) ? <span> at <span className="font-black text-slate-950">{buildTimeLabel(draftTime, draftTimePeriod)}</span></span> : null}.</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setSelectedPlace(null)} className="h-11 rounded-2xl border border-[var(--line)] bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50">Cancel</button>
                  <button type="button" onClick={confirmAddPlace} className="app-button app-button-primary app-button-md">
                    <AppIcon name="addToPlan" className="h-4 w-4" />
                    Add to plan
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {errorMessage ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{errorMessage}</p> : null}
      </section>

      <section className="grid gap-4 rounded-[28px] border border-[var(--line)] bg-white p-4 shadow-[var(--shadow-soft)] sm:p-5 lg:sticky lg:top-24">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--accent-deep)]">Review The Plan</p>
          <h2 className="gala-section-title">Selected places</h2>
          <p className="text-sm font-semibold leading-6 text-slate-600">Everything you add shows here by day, so it stays easy to scan and adjust.</p>
        </div>
        {items.length === 0 ? (
          <div className="gala-empty-state">
            <p className="text-base font-black text-slate-900">No places added yet.</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Search first, choose a place, fill in the details, then add it here.</p>
          </div>
        ) : (
          <div className="grid gap-5">
            {groupedItems.map(([dayNumber, dayItems]) => (
              <section key={dayNumber} className="grid gap-3">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">Day {dayNumber}</p>
                  <p className="text-sm font-semibold text-slate-600">{dayItems.length} place{dayItems.length > 1 ? 's' : ''} planned</p>
                </div>
                <div className="grid gap-3">
                  {dayItems.map((item) => (
                    <article key={item.draft_id} className="gala-card p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 gap-3">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-wash)] text-[var(--accent-deep)]">
                            <AppIcon name={getCategoryIconName(item.place.category)} className="h-5 w-5" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-base font-black text-slate-950">{item.place.name}</p>
                              <span className="rounded-full bg-[var(--chip)] px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--accent-deep)]">Stop {item.sort_order ?? 1}</span>
                              {item.time_label ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-600">{item.time_label}</span> : null}
                            </div>
                            <p className="mt-1 text-sm font-semibold text-slate-600">{getPlaceMeta(item.place)}</p>
                          </div>
                        </div>
                        <button type="button" onClick={() => removeItem(item.draft_id)} className="h-10 rounded-xl border border-red-200 bg-red-50 px-4 text-xs font-black text-red-700 transition hover:border-red-300 hover:bg-red-100">Remove</button>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <label className="grid gap-1.5"><span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Day</span><input type="number" min={1} value={item.day_number ?? 1} onChange={(event) => updateItem(item.draft_id, { day_number: Number(event.target.value) || 1 })} className="h-11 rounded-2xl border border-[var(--line-strong)] px-4 text-sm font-bold outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]" /></label>
                        <label className="grid gap-1.5"><span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Order</span><input type="number" min={1} value={item.sort_order ?? 1} onChange={(event) => updateItem(item.draft_id, { sort_order: Number(event.target.value) || 1 })} className="h-11 rounded-2xl border border-[var(--line-strong)] px-4 text-sm font-bold outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]" /></label>
                        <label className="grid gap-1.5"><span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Time</span><EditableTimeField value={item.time_label} onChange={(value) => updateItem(item.draft_id, { time_label: value })} /></label>
                        <label className="grid gap-1.5"><span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Minutes</span><input type="number" min={1} value={item.estimated_minutes ?? ''} onChange={(event) => updateItem(item.draft_id, { estimated_minutes: event.target.value ? Number(event.target.value) : null })} className="h-11 rounded-2xl border border-[var(--line-strong)] px-4 text-sm font-bold outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]" /></label>
                      </div>
                      <textarea value={item.notes ?? ''} onChange={(event) => updateItem(item.draft_id, { notes: event.target.value || null })} rows={3} placeholder="Notes" className="mt-3 w-full resize-none rounded-2xl border border-[var(--line-strong)] px-4 py-3 text-sm font-semibold leading-6 outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]" />
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
    </section>
    </>
  )
}
function toPayload(items: DraftItem[]): GalaPlanItemPayload[] {
  return [...items].sort((first, second) => (first.day_number ?? 1) - (second.day_number ?? 1) || (first.sort_order ?? 0) - (second.sort_order ?? 0)).map((item, index) => ({ place_id: item.place_id, day_number: item.day_number ?? 1, sort_order: item.sort_order ?? index + 1, time_label: item.time_label ?? null, notes: item.notes ?? null, estimated_minutes: item.estimated_minutes ?? null }))
}

function EditableTimeField({
  value,
  onChange,
}: {
  value: string | null | undefined
  onChange: (value: string | null) => void
}) {
  const parsedValue = parseTimeLabel(value)

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
      <input
        value={parsedValue.time}
        onChange={(event) => onChange(buildTimeLabel(event.target.value, parsedValue.period) || null)}
        placeholder="09:30"
        className="h-11 rounded-2xl border border-[var(--line-strong)] px-4 text-sm font-bold outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
      />
      <select
        value={parsedValue.period}
        onChange={(event) => onChange(buildTimeLabel(parsedValue.time, event.target.value as TimePeriod | '') || null)}
        className="h-11 rounded-2xl border border-[var(--line-strong)] bg-white px-3 text-sm font-black outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
      >
        <option value="">--</option>
        {TIME_PERIODS.map((period) => (
          <option key={period} value={period}>{period}</option>
        ))}
      </select>
    </div>
  )
}

function PlanForm({ session, planId }: { session?: Session | null; planId?: string | null }) {
  const isEdit = Boolean(planId)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<GalaPlanVisibility>('private')
  const [items, setItems] = useState<DraftItem[]>([])
  const [isLoading, setIsLoading] = useState(isEdit)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!planId) return
    const loadPlan = async () => {
      try {
        if (title || description || items.length > 0) {
          setIsRefreshing(true)
        } else {
          setIsLoading(true)
        }
        const data = await getGalaPlan(planId, session)
        if (!data.plan.viewer_is_owner) { setErrorMessage('Only the owner can edit this gala plan.'); return }
        setTitle(data.plan.title)
        setDescription(cleanPlanDescription(data.plan.description))
        setVisibility(data.plan.visibility)
        setItems(data.plan.items.map((item) => ({ draft_id: item.id, place_id: item.place_id, day_number: item.day_number, sort_order: item.sort_order, time_label: item.time_label, notes: item.notes, estimated_minutes: item.estimated_minutes, place: item.place })))
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load gala plan.')
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    }
    void loadPlan()
  }, [planId, session?.user?.id])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) { setErrorMessage('Title is required.'); return }
    try {
      setIsSaving(true)
      setErrorMessage('')
      const payload = { title, description: description || null, visibility, items: toPayload(items) }
      const data = planId ? await updateGalaPlan(planId, payload, session) : await createGalaPlan(payload, session)
      navigateToPath(`/gala-plans/${encodeURIComponent(data.plan.id)}`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save gala plan.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 sm:gap-7 xl:gap-8">
      <PageContainer size="wide" className="grid gap-6 sm:gap-7 xl:gap-8">
        {isLoading || isRefreshing ? <InlineSkeleton /> : null}
        <section className="grid gap-6 rounded-[28px] border border-[var(--line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,255,0.9))] px-5 py-5 shadow-[var(--shadow-soft)] sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-6 xl:px-7 xl:py-7">
          <div className="grid gap-5">
            <PageHeroHeader
              eyebrow="Gala Plans"
              title={isEdit ? 'Edit your gala plan' : 'Create a gala plan'}
              description="Start with the basics, then add places one by one so the plan stays clear and easy to follow."
              icon={<AppIcon name="galaPlan" className="h-4 w-4" />}
              divider={false}
              className="border-0 p-0"
            />
            <div className="grid gap-5 border-t border-[var(--line)] pt-5">
              <label className="grid gap-2"><span className="text-sm font-black text-slate-800">Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} className="h-12 rounded-2xl border border-[var(--line-strong)] px-4 text-base font-bold text-slate-950 outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]" placeholder="Cafe crawl in BGC" /></label>
              <label className="grid gap-2"><span className="text-sm font-black text-slate-800">Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} className="resize-none rounded-2xl border border-[var(--line-strong)] px-4 py-3 text-sm font-semibold leading-6 text-slate-950 outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]" placeholder="What kind of day is this plan for?" /></label>
              <label className="grid gap-2"><span className="text-sm font-black text-slate-800">Visibility</span><VisibilitySelector value={visibility} onChange={setVisibility} /></label>
            </div>
          </div>

          <aside className="grid gap-3 rounded-[24px] border border-[var(--line)] bg-white p-4 shadow-[0_14px_30px_rgba(27, 26, 23, 0.04)] sm:p-5 lg:sticky lg:top-24">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--accent-deep)]">Plan At A Glance</p>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-2xl bg-[var(--accent-wash)] px-4 py-3">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">Stops</p>
                <p className="mt-1 text-2xl font-black text-slate-950">{items.length}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Visibility</p>
                <p className="mt-1 text-base font-black capitalize text-slate-950">{visibility}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Flow</p>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-700">Search, choose, add, and review in one clear workspace.</p>
              </div>
            </div>
            <button type="submit" disabled={isSaving || !title.trim()} className="app-button app-button-primary app-button-md w-full">{isSaving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Gala Plan'}</button>
          </aside>
        </section>

        <ItineraryBuilder items={items} onItemsChange={setItems} />
        {errorMessage ? <p className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{errorMessage}</p> : null}
      </PageContainer>
    </form>
  )
}
function GalaPlansPage({ mode = 'list', planId = null, session = null }: GalaPlansPageProps) {
  if (mode === 'list' || mode === 'favorites') {
    return (
      <PageShell>
        <main>
          <PlanList session={session} favorites={mode === 'favorites'} />
        </main>
      </PageShell>
    )
  }

  if (mode === 'detail' && planId) {
    return (
      <PageShell>
        <main>
          <div className="mx-auto w-full max-w-[1180px] px-4 pt-5 sm:px-6 lg:px-8">
            <MinimalBackNav to="/gala-plans" label="Plans" />
          </div>
          <PlanDetail planId={planId} session={session} />
        </main>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <main className="gala-app-main">
        <MinimalBackNav to="/gala-plans" />
        {mode === 'new' ? <PlanForm session={session} /> : null}
        {mode === 'edit' && planId ? <PlanForm session={session} planId={planId} /> : null}
      </main>
    </PageShell>
  )
}

export default GalaPlansPage



