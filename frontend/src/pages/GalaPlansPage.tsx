import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowLeft } from '@phosphor-icons/react/dist/csr/ArrowLeft'
import { Plus } from '@phosphor-icons/react/dist/csr/Plus'
import { MagnifyingGlass as Search } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { Sparkle as Sparkles } from '@phosphor-icons/react/dist/csr/Sparkle'
import { Trash as Trash2 } from '@phosphor-icons/react/dist/csr/Trash'
import { X } from '@phosphor-icons/react/dist/csr/X'
import PlanDetail from '../components/gala-plan/PlanDetail'
import PlanList from '../components/gala-plan/PlanList'
import InternalLink from '../components/InternalLink'
import { Button, Empty, Page, Panel, Row, SectionHead, Skeleton } from '../components/ui'
import {
  composeGalaPlanDescription,
  createGalaPlan,
  getGalaPlan,
  parseGalaPlanDescription,
  updateGalaPlan,
  type GalaPlanDateMode,
  type GalaPlanItemPayload,
  type GalaPlanSettings,
  type GalaPlanVisibility,
} from '../utils/galaPlansApi'
import { navigateToPath } from '../utils/navigation'
import { getApiUrl } from '../utils/apiClient'
import '../design/plans.css'

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
const TABBAR_OFF_CLASS = 'g-tabbar-off'
const TITLE_REQUIRED = 'Give your plan a name first.'

type TimePeriod = (typeof TIME_PERIODS)[number]

function parseTimeLabel(value: string | null | undefined): { time: string; period: TimePeriod | '' } {
  const trimmedValue = value?.trim() ?? ''
  if (!trimmedValue) return { time: '', period: '' }

  // "18:30" (a 24-hour label) shows as 6:30 + PM so the AM/PM picker isn't left blank.
  const clock24 = trimmedValue.match(/^(\d{1,2}):(\d{2})$/)
  if (clock24 && Number(clock24[1]) <= 23) {
    const hours = Number(clock24[1])
    return { time: `${hours % 12 || 12}:${clock24[2]}`, period: hours >= 12 ? 'PM' : 'AM' }
  }

  const match = trimmedValue.match(/^(.*?)(?:\s*)([AP])\.?\s*M\.?$/i)
  if (!match) return { time: trimmedValue, period: '' }
  return {
    time: match[1]?.trim() ?? '',
    period: `${match[2].toUpperCase()}M` as TimePeriod,
  }
}

function buildTimeLabel(time: string, period: TimePeriod | '') {
  const trimmedTime = time.trim()
  if (!trimmedTime) return ''
  return period ? `${trimmedTime} ${period}` : trimmedTime
}

function getPlaceMeta(place: SearchPlaceResult) {
  return place.city || place.area || ''
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

function NumberField({ label, value, onChange, placeholder }: { label: string; value: number | string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="g-field">
      <span className="g-label">{label}</span>
      <input type="number" min={1} inputMode="numeric" className="g-input" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function TimeField({ value, onChange }: { value: { time: string; period: TimePeriod | '' }; onChange: (time: string, period: TimePeriod | '') => void }) {
  return (
    <label className="g-field">
      <span className="g-label">Time</span>
      <div className="grid grid-cols-[minmax(0,1fr)_76px] gap-2">
        <input className="g-input" value={value.time} onChange={(event) => onChange(event.target.value, value.period)} placeholder="9:30" />
        <select className="g-input" aria-label="AM or PM" value={value.period} onChange={(event) => onChange(value.time, event.target.value as TimePeriod | '')}>
          <option value="">--</option>
          {TIME_PERIODS.map((period) => (
            <option key={period} value={period}>{period}</option>
          ))}
        </select>
      </div>
    </label>
  )
}

function ItineraryBuilder({
  items,
  onItemsChange,
  action,
}: {
  items: DraftItem[]
  onItemsChange: (items: DraftItem[]) => void
  action?: ReactNode
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
      setErrorMessage('That place is already in this plan.')
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
    <section aria-labelledby="plan-stops">
      <SectionHead
        title={<span id="plan-stops">Stops</span>}
        sub={items.length > 0 ? `${items.length} ${items.length === 1 ? 'place' : 'places'} so far` : undefined}
        action={action}
      />
      <div className="g-search">
        <Search className="g-ic" />
        <input
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          onFocus={() => { if (query.trim().length >= 2) setIsSearchModalOpen(true) }}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void searchPlaces(1, true) } }}
          placeholder="Search a place, like Intramuros"
          aria-label="Search places to add"
        />
        <Button variant="ink" size="sm" onClick={() => void searchPlaces(1, true)} loading={isSearching} disabled={isSearching}>
          Search
        </Button>
      </div>

      {isSearchModalOpen ? (
        <Panel className="mt-3">
          <div className="flex items-center justify-between gap-3">
            <p className="g-sm g-mut min-w-0">
              {searchTotalCount > 0
                ? `${searchTotalCount} result${searchTotalCount === 1 ? '' : 's'}`
                : isSearching || !hasSearchedPlaces
                  ? 'Looking up places…'
                  : 'No places found. Try a different spelling or area.'}
            </p>
            <Button variant="soft" size="sm" iconOnly onClick={() => setIsSearchModalOpen(false)} aria-label="Close search results">
              <X />
            </Button>
          </div>
          {results.length === 0 && isSearching ? (
            <div className="g-list mt-3">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : null}
          <div className="g-list mt-3 max-h-[52vh] overflow-y-auto">
            {results.map((place) => {
              const alreadyAdded = items.some((item) => item.place_id === place.id)
              const isSelected = selectedPlace?.id === place.id
              return (
                <Row
                  key={place.id}
                  action={
                    <Button variant={isSelected ? 'ink' : 'line'} size="sm" onClick={() => startDraftForPlace(place)} disabled={alreadyAdded}>
                      {alreadyAdded ? 'Added' : isSelected ? 'Selected' : 'Choose'}
                    </Button>
                  }
                >
                  <p className="g-h3 truncate">{place.name}</p>
                  <p className="g-sm g-mut truncate">{getPlaceMeta(place) || place.address || 'GalaTayo place'}</p>
                </Row>
              )
            })}
          </div>
          {searchTotalPages > 1 ? (
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button variant="line" size="sm" onClick={() => void searchPlaces(Math.max(1, searchPage - 1), false)} disabled={!hasPreviousSearchPage || isSearching}>
                Previous
              </Button>
              <Button variant="line" size="sm" onClick={() => void searchPlaces(searchPage + 1, false)} disabled={!hasNextSearchPage || isSearching}>
                Next
              </Button>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {selectedPlace ? (
        <Panel className="mt-4 grid gap-4" style={{ borderColor: 'var(--ink)' }}>
          <div className="min-w-0">
            <p className="g-eyebrow">Adding</p>
            <p className="g-h3 mt-1">{selectedPlace.name}</p>
            <p className="g-sm g-mut">{getPlaceMeta(selectedPlace) || selectedPlace.address || 'GalaTayo place'}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <NumberField label="Day" value={draftDay} onChange={(value) => setDraftDay(Math.max(1, Number(value) || 1))} />
            <NumberField label="Stop no." value={draftOrder} onChange={(value) => setDraftOrder(Math.max(1, Number(value) || 1))} />
            <TimeField value={{ time: draftTime, period: draftTimePeriod }} onChange={(time, period) => { setDraftTime(time); setDraftTimePeriod(period) }} />
            <NumberField label="Minutes" value={draftMinutes} placeholder="60" onChange={setDraftMinutes} />
          </div>
          <label className="g-field">
            <span className="g-label">Notes <span className="g-fnt font-normal">optional</span></span>
            <textarea className="g-input" value={draftNotes} onChange={(event) => setDraftNotes(event.target.value)} rows={3} placeholder="Meet here first, good for sunset, or anything useful." />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="soft" onClick={() => setSelectedPlace(null)}>Cancel</Button>
            <Button variant="ink" onClick={confirmAddPlace}>
              <Plus />
              Add stop
            </Button>
          </div>
        </Panel>
      ) : null}

      {errorMessage ? <p role="alert" className="g-hint is-error mt-3">{errorMessage}</p> : null}

      {items.length === 0 ? (
        <Empty className="mt-4" title="No stops yet" description="Search a place above, choose it, then add it here." />
      ) : (
        <div className="mt-5 grid gap-6">
          {groupedItems.map(([dayNumber, dayItems]) => (
            <section key={dayNumber}>
              <p className="g-eyebrow">Day {dayNumber}</p>
              <div className="g-list mt-2">
                {dayItems.map((item) => {
                  const time = parseTimeLabel(item.time_label)
                  return (
                    <Panel key={item.draft_id} as="article" className="grid gap-3">
                      <div className="flex items-start gap-3">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-[13px] font-bold text-[var(--on-ink)]" aria-hidden="true">{item.sort_order ?? 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="g-h3 truncate">{item.place.name}</p>
                          <p className="g-sm g-mut truncate">{getPlaceMeta(item.place)}</p>
                        </div>
                        <Button variant="soft" size="sm" iconOnly onClick={() => removeItem(item.draft_id)} aria-label={`Remove ${item.place.name}`}>
                          <Trash2 />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        <NumberField label="Day" value={item.day_number ?? 1} onChange={(value) => updateItem(item.draft_id, { day_number: Number(value) || 1 })} />
                        <NumberField label="Order" value={item.sort_order ?? 1} onChange={(value) => updateItem(item.draft_id, { sort_order: Number(value) || 1 })} />
                        <TimeField value={time} onChange={(nextTime, period) => updateItem(item.draft_id, { time_label: buildTimeLabel(nextTime, period) || null })} />
                        <NumberField label="Minutes" value={item.estimated_minutes ?? ''} onChange={(value) => updateItem(item.draft_id, { estimated_minutes: value ? Number(value) : null })} />
                      </div>
                      <textarea className="g-input" value={item.notes ?? ''} onChange={(event) => updateItem(item.draft_id, { notes: event.target.value || null })} rows={2} placeholder="Notes" aria-label={`Notes for ${item.place.name}`} />
                    </Panel>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}

function toPayload(items: DraftItem[]): GalaPlanItemPayload[] {
  return [...items].sort((first, second) => (first.day_number ?? 1) - (second.day_number ?? 1) || (first.sort_order ?? 0) - (second.sort_order ?? 0)).map((item, index) => ({ place_id: item.place_id, day_number: item.day_number ?? 1, sort_order: item.sort_order ?? index + 1, time_label: item.time_label ?? null, notes: item.notes ?? null, estimated_minutes: item.estimated_minutes ?? null }))
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <div className="g-rsvp" role="group" aria-label={label} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** "Add to plan → Create plan" on a place page passes that place so it becomes the first stop. */
function readStartingStop(): DraftItem[] {
  const params = new URLSearchParams(window.location.search)
  const placeId = params.get('place_id')
  if (!placeId) return []
  return [{ draft_id: `${placeId}-start`, place_id: placeId, day_number: 1, sort_order: 1, time_label: null, notes: null, estimated_minutes: null, place: { id: placeId, name: params.get('place_name') } }]
}

function PlanForm({ session, planId }: { session?: Session | null; planId?: string | null }) {
  const isEdit = Boolean(planId)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dateMode, setDateMode] = useState<GalaPlanDateMode>('anytime')
  const [date, setDate] = useState('')
  // Kept from Plan with AI so editing the plan doesn't drop the group size.
  const [groupSize, setGroupSize] = useState<number | null>(null)
  // Settings the form doesn't edit (the meal estimate, a locked date) ride along unchanged.
  const keptSettings = useRef<Pick<GalaPlanSettings, 'meals' | 'lockedPollId'>>({})
  const [visibility, setVisibility] = useState<GalaPlanVisibility>('private')
  const [items, setItems] = useState<DraftItem[]>(() => (planId ? [] : readStartingStop()))
  const [isLoading, setIsLoading] = useState(isEdit)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.body.classList.add(TABBAR_OFF_CLASS)
    return () => document.body.classList.remove(TABBAR_OFF_CLASS)
  }, [])

  useEffect(() => {
    if (!planId) return
    const loadPlan = async () => {
      try {
        setIsLoading(true)
        const data = await getGalaPlan(planId, session)
        if (!data.plan.viewer_is_owner) { setErrorMessage('Only the owner can edit this plan.'); return }
        const parsed = parseGalaPlanDescription(data.plan.description)
        setTitle(data.plan.title)
        setDescription(parsed.description)
        setDateMode(parsed.dateMode)
        setDate(parsed.date)
        setGroupSize(parsed.groupSize)
        keptSettings.current = { meals: parsed.meals, lockedPollId: parsed.lockedPollId }
        setVisibility(data.plan.visibility)
        setItems(data.plan.items.map((item) => ({ draft_id: item.id, place_id: item.place_id, day_number: item.day_number, sort_order: item.sort_order, time_label: item.time_label, notes: item.notes, estimated_minutes: item.estimated_minutes, place: item.place })))
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Couldn\'t load the plan.')
      } finally {
        setIsLoading(false)
      }
    }
    void loadPlan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, session?.user?.id])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (isSaving) return
    if (!title.trim()) {
      setErrorMessage(TITLE_REQUIRED)
      titleRef.current?.focus()
      return
    }
    try {
      setIsSaving(true)
      setErrorMessage('')
      const payload = {
        title,
        description: composeGalaPlanDescription({ ...keptSettings.current, description, dateMode, date, groupSize }),
        visibility,
        items: toPayload(items),
      }
      const data = planId ? await updateGalaPlan(planId, payload, session) : await createGalaPlan(payload, session)
      navigateToPath(`/gala-plans/${encodeURIComponent(data.plan.id)}`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Couldn\'t save the plan.')
    } finally {
      setIsSaving(false)
    }
  }

  const titleMissing = errorMessage === TITLE_REQUIRED
  const aiHref = `/plan-with-ai${title.trim() ? `?q=${encodeURIComponent(title.trim())}` : ''}`
  const dateLabel = dateMode === 'date' && date
    ? new Date(`${date}T00:00:00`).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })
    : 'Anytime'
  const summary = [dateLabel, `${items.length} ${items.length === 1 ? 'stop' : 'stops'}`, visibility === 'public' ? 'On your profile' : 'Link only'].join(' · ')

  return (
    <Page narrow>
      <style>{`body.${TABBAR_OFF_CLASS} .g-tabbar { display: none; }`}</style>
      <InternalLink href={planId ? `/gala-plans/${encodeURIComponent(planId)}` : '/gala-plans'} className="g-sm g-mut inline-flex min-h-11 items-center gap-1.5">
        <ArrowLeft className="h-4 w-4" />
        Cancel
      </InternalLink>
      <h1 className="sr-only">{isEdit ? 'Edit plan' : 'New plan'}</h1>

      {isLoading ? (
        <div className="mt-6 grid gap-3" aria-label="Loading plan">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-12" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <form id="plan-form" onSubmit={handleSubmit} className="mt-4">
          <label htmlFor="plan-title" className="sr-only">Plan name</label>
          <input
            id="plan-title"
            ref={titleRef}
            className={`g-h1 w-full border-0 border-b bg-transparent pb-3 text-[var(--ink)] outline-none focus:!shadow-none focus:!outline-none ${titleMissing ? 'border-[var(--bad)]' : 'border-[var(--line)] focus:border-[var(--ink)]'}`}
            value={title}
            onChange={(event) => {
              setTitle(event.target.value)
              if (titleMissing) setErrorMessage('')
            }}
            placeholder="Name your plan"
            aria-invalid={titleMissing || undefined}
            aria-describedby={titleMissing ? 'plan-title-error' : undefined}
            autoFocus={!isEdit}
          />
          {titleMissing ? <p id="plan-title-error" role="alert" className="g-hint is-error mt-2">{errorMessage}</p> : null}
          <label htmlFor="plan-description" className="sr-only">What's the vibe?</label>
          <textarea
            id="plan-description"
            className="g-input mt-4"
            style={{ minHeight: 72 }}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            placeholder="What's the vibe? (optional)"
          />

          <section aria-labelledby="plan-when">
            <SectionHead title={<span id="plan-when">When</span>} />
            <Segmented<GalaPlanDateMode>
              label="When"
              value={dateMode === 'date' ? 'date' : 'anytime'}
              options={[
                { value: 'anytime', label: 'Anytime' },
                { value: 'date', label: 'Pick a date' },
              ]}
              onChange={setDateMode}
            />
            {dateMode === 'date' ? (
              <div className="g-field mt-3">
                <label htmlFor="plan-date" className="sr-only">Date</label>
                <input id="plan-date" type="date" className="g-input" value={date} onChange={(event) => setDate(event.target.value)} />
              </div>
            ) : (
              <p className="g-hint mt-2">Set it later once everyone's free.</p>
            )}
          </section>

          <ItineraryBuilder
            items={items}
            onItemsChange={setItems}
            action={
              <Button variant="soft" size="sm" href={aiHref}>
                <Sparkles />
                Fill with AI
              </Button>
            }
          />

          <section aria-labelledby="plan-visibility">
            <SectionHead title={<span id="plan-visibility">Who can open it</span>} />
            <Segmented<GalaPlanVisibility>
              label="Who can open it"
              value={visibility === 'public' ? 'public' : 'private'}
              options={[
                { value: 'private', label: 'Link only' },
                { value: 'public', label: 'Public' },
              ]}
              onChange={setVisibility}
            />
            <p className="g-hint mt-2">
              {visibility === 'public' ? 'Shows on your profile. Anyone can view, RSVP and vote.' : 'Not on your profile. Anyone with the link can view and RSVP.'}
            </p>
          </section>

          {errorMessage && !titleMissing ? <p role="alert" className="g-hint is-error mt-6">{errorMessage}</p> : null}
        </form>
      )}

      <div
        className="z-[4000]"
        style={{ position: 'fixed', insetInline: 0, bottom: 0, background: 'var(--paper)', borderTop: '1px solid var(--line)', padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="mx-auto flex max-w-[728px] items-center gap-3 lg:max-w-[696px]">
          <p className="g-sm g-mut min-w-0 flex-1 truncate">{isLoading ? null : summary}</p>
          <Button type="submit" form="plan-form" variant="tara" size="lg" loading={isSaving}>
            {isEdit ? 'Save' : 'Create plan'}
          </Button>
        </div>
      </div>
    </Page>
  )
}

function GalaPlansPage({ mode = 'list', planId = null, session = null }: GalaPlansPageProps) {
  if (mode === 'list' || mode === 'favorites') {
    return <PlanList session={session} favorites={mode === 'favorites'} />
  }

  if (mode === 'detail' && planId) {
    return <PlanDetail planId={planId} session={session} />
  }

  if (mode === 'edit' && planId) return <PlanForm session={session} planId={planId} />
  if (mode === 'new') return <PlanForm session={session} />
  return null
}

export default GalaPlansPage
