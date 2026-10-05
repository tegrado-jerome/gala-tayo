import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowLeft, ArrowRight, CalendarDays, Check, Globe, Lock, Plus, Search, Sparkles, Trash2, X } from 'lucide-react'
import PlanDetail from '../components/gala-plan/PlanDetail'
import PlanList from '../components/gala-plan/PlanList'
import InternalLink from '../components/InternalLink'
import { Button, Chip, Empty, KeyValue, Page, Panel, Row, SectionHead, Skeleton, cx } from '../components/ui'
import {
  composeGalaPlanDescription,
  createGalaPlan,
  getGalaPlan,
  parseGalaPlanDescription,
  updateGalaPlan,
  type GalaPlanDateMode,
  type GalaPlanItemPayload,
  type GalaPlanVisibility,
} from '../utils/galaPlansApi'
import { navigateToPath } from '../utils/navigation'
import { getApiUrl } from '../utils/apiClient'

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
const STEPS = [
  { label: 'Name', title: "Ano'ng plano?" },
  { label: 'When', title: 'Kailan tayo?' },
  { label: 'Where', title: 'Saan tayo?' },
  { label: 'Share', title: 'Sino ang makakakita?' },
] as const

type TimePeriod = (typeof TIME_PERIODS)[number]

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
    <div>
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
                  <p className="g-sm g-mut truncate">{getPlaceMeta(place) || place.address || 'Metro Manila place'}</p>
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
            <p className="g-sm g-mut">{getPlaceMeta(selectedPlace) || selectedPlace.address || 'Metro Manila place'}</p>
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

      <SectionHead title="Stops" sub={items.length > 0 ? `${items.length} ${items.length === 1 ? 'place' : 'places'} so far` : undefined} />
      {items.length === 0 ? (
        <Empty title="Wala pang stops" description="Search a place above, choose it, then add it here." />
      ) : (
        <div className="grid gap-6">
          {groupedItems.map(([dayNumber, dayItems]) => (
            <section key={dayNumber}>
              <p className="g-eyebrow">Day {dayNumber}</p>
              <div className="g-list mt-2">
                {dayItems.map((item) => {
                  const time = parseTimeLabel(item.time_label)
                  return (
                    <Panel key={item.draft_id} as="article" className="grid gap-3">
                      <div className="flex items-start gap-3">
                        <span className="g-num mt-0.5">{item.sort_order ?? 1}</span>
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
    </div>
  )
}

function toPayload(items: DraftItem[]): GalaPlanItemPayload[] {
  return [...items].sort((first, second) => (first.day_number ?? 1) - (second.day_number ?? 1) || (first.sort_order ?? 0) - (second.sort_order ?? 0)).map((item, index) => ({ place_id: item.place_id, day_number: item.day_number ?? 1, sort_order: item.sort_order ?? index + 1, time_label: item.time_label ?? null, notes: item.notes ?? null, estimated_minutes: item.estimated_minutes ?? null }))
}

function OptionCard({ on, title, description, icon, onClick }: { on: boolean; title: string; description: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className="g-panel w-full text-left" style={on ? { borderColor: 'var(--ink)' } : undefined}>
      <span className="flex items-center justify-between gap-3">
        <span className="g-h3">{title}</span>
        {on ? <Check className="g-ic" /> : icon}
      </span>
      <span className="g-sm g-mut mt-1.5 block">{description}</span>
    </button>
  )
}

function PlanForm({ session, planId }: { session?: Session | null; planId?: string | null }) {
  const isEdit = Boolean(planId)
  const [step, setStep] = useState(0)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dateMode, setDateMode] = useState<GalaPlanDateMode>('anytime')
  const [date, setDate] = useState('')
  const [visibility, setVisibility] = useState<GalaPlanVisibility>('private')
  const [items, setItems] = useState<DraftItem[]>([])
  const [isLoading, setIsLoading] = useState(isEdit)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const lastStep = STEPS.length - 1

  useEffect(() => {
    if (!planId) return
    const loadPlan = async () => {
      try {
        setIsLoading(true)
        const data = await getGalaPlan(planId, session)
        if (!data.plan.viewer_is_owner) { setErrorMessage('Only the owner can edit this gala plan.'); return }
        const parsed = parseGalaPlanDescription(data.plan.description)
        setTitle(data.plan.title)
        setDescription(parsed.description)
        setDateMode(parsed.dateMode)
        setDate(parsed.date)
        setVisibility(data.plan.visibility)
        setItems(data.plan.items.map((item) => ({ draft_id: item.id, place_id: item.place_id, day_number: item.day_number, sort_order: item.sort_order, time_label: item.time_label, notes: item.notes, estimated_minutes: item.estimated_minutes, place: item.place })))
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load gala plan.')
      } finally {
        setIsLoading(false)
      }
    }
    void loadPlan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, session?.user?.id])

  const goTo = (next: number) => {
    if (next > 0 && !title.trim()) {
      setErrorMessage('Title is required.')
      setStep(0)
      return
    }
    setErrorMessage('')
    setStep(Math.max(0, Math.min(lastStep, next)))
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!isEdit && step < lastStep) { goTo(step + 1); return }
    if (!title.trim()) { setErrorMessage('Title is required.'); return }
    try {
      setIsSaving(true)
      setErrorMessage('')
      const payload = {
        title,
        description: composeGalaPlanDescription({ description, dateMode, date }),
        visibility,
        items: toPayload(items),
      }
      const data = planId ? await updateGalaPlan(planId, payload, session) : await createGalaPlan(payload, session)
      navigateToPath(`/gala-plans/${encodeURIComponent(data.plan.id)}`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save gala plan.')
    } finally {
      setIsSaving(false)
    }
  }

  const aiHref = `/plan-with-ai${title.trim() ? `?q=${encodeURIComponent(title.trim())}` : ''}`
  const dateLabel = dateMode === 'date' && date
    ? new Date(`${date}T00:00:00`).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : 'Anytime'
  const submitButton = (
    <Button type="submit" variant="tara" loading={isSaving} disabled={isSaving || !title.trim()}>
      {isEdit ? 'Save changes' : 'Create plan'}
    </Button>
  )

  return (
    <Page narrow>
      <InternalLink href={planId ? `/gala-plans/${encodeURIComponent(planId)}` : '/gala-plans'} className="g-sm g-mut inline-flex min-h-11 items-center gap-1.5">
        <ArrowLeft className="h-4 w-4" />
        Cancel
      </InternalLink>
      <p className="g-eyebrow mt-2">{isEdit ? 'Edit plan' : 'New plan'} · Step {step + 1} of {STEPS.length}</p>
      <h1 className="g-h1 mt-2">{STEPS[step].title}</h1>

      <nav className="mt-5 flex flex-wrap gap-2" aria-label="Steps">
        {STEPS.map((entry, index) => (
          <Chip key={entry.label} on={index === step} aria-current={index === step ? 'step' : undefined} onClick={() => goTo(index)}>
            {index < step ? <Check /> : <span>{index + 1} ·</span>}
            {entry.label}
          </Chip>
        ))}
      </nav>

      {isLoading ? (
        <div className="mt-8 grid gap-3" aria-label="Loading plan">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-12" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8">
          {step === 0 ? (
            <div className="grid gap-5">
              <div className="g-field">
                <label htmlFor="plan-title">Plan name</label>
                <input id="plan-title" className="g-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Cafe crawl in BGC" aria-invalid={errorMessage === 'Title is required.' || undefined} autoFocus={!isEdit} />
                <span className="g-hint">You can change this anytime.</span>
              </div>
              <div className="g-field">
                <label htmlFor="plan-description">What's the vibe? <span className="g-fnt font-normal">optional</span></label>
                <textarea id="plan-description" className="g-input" value={description} onChange={(event) => setDescription(event.target.value)} rows={4} placeholder="What kind of day is this plan for?" />
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-3">
              <div className="grid gap-3 md:grid-cols-2">
                <OptionCard on={dateMode === 'date'} title="Fixed date" description="You set the day. Good when the barkada already agreed." icon={<CalendarDays className="g-ic g-fnt" />} onClick={() => setDateMode('date')} />
                <OptionCard on={dateMode !== 'date'} title="Anytime" description="No date yet. Set it later once everyone's free." icon={<CalendarDays className="g-ic g-fnt" />} onClick={() => setDateMode('anytime')} />
              </div>
              {dateMode === 'date' ? (
                <div className="g-field mt-3">
                  <label htmlFor="plan-date">Date</label>
                  <input id="plan-date" type="date" className="g-input" value={date} onChange={(event) => setDate(event.target.value)} />
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <>
              <div className="g-draft mb-5 flex flex-wrap items-center justify-between gap-3">
                <p className="g-sm min-w-0 flex-1">Ayaw mag-isip? Describe the day and AI builds the stops for you.</p>
                <Button variant="soft" size="sm" href={aiHref}>
                  <Sparkles />
                  Fill my day with AI
                </Button>
              </div>
              <ItineraryBuilder items={items} onItemsChange={setItems} />
            </>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-3">
              <div className="grid gap-3 md:grid-cols-2">
                <OptionCard on={visibility === 'private'} title="Private" description="Only you can open it until you share the link." icon={<Lock className="g-ic g-fnt" />} onClick={() => setVisibility('private')} />
                <OptionCard on={visibility === 'public'} title="Shared by link" description="Anyone with the link can view, RSVP and vote." icon={<Globe className="g-ic g-fnt" />} onClick={() => setVisibility('public')} />
              </div>
              <SectionHead title="Review" />
              <Panel>
                <KeyValue
                  items={[
                    { label: 'Plan', value: title || '—' },
                    { label: 'When', value: dateLabel },
                    { label: 'Stops', value: items.length },
                    { label: 'Visibility', value: visibility === 'public' ? 'Shared by link' : 'Private' },
                  ]}
                />
              </Panel>
            </div>
          ) : null}

          {errorMessage ? <p role="alert" className="g-hint is-error mt-4">{errorMessage}</p> : null}

          <div className={cx('mt-10 flex items-center gap-2', step > 0 ? 'justify-between' : 'justify-end')}>
            {step > 0 ? (
              <Button variant="soft" onClick={() => goTo(step - 1)}>
                <ArrowLeft />
                Back
              </Button>
            ) : null}
            <div className="flex gap-2">
              {step < lastStep ? (
                <Button variant={isEdit ? 'line' : 'tara'} onClick={() => goTo(step + 1)}>
                  Next: {STEPS[step + 1].label}
                  <ArrowRight />
                </Button>
              ) : null}
              {isEdit || step === lastStep ? submitButton : null}
            </div>
          </div>
        </form>
      )}
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
