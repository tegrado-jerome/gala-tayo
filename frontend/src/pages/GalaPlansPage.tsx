
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import AppHeader from '../components/AppHeader'
import { AppIcon } from '../components/AppIcon'
import MinimalBackNav from '../components/MinimalBackNav'
import PageHeroHeader from '../components/PageHeroHeader'
import UnifiedLoadingState from '../components/UnifiedLoadingState'
import {
  createGalaPlan,
  deleteGalaPlan,
  getGalaPlan,
  listFavoriteGalaPlans,
  listMyGalaPlans,
  toggleGalaPlanHeart,
  updateGalaPlan,
  type GalaPlanDetail,
  type GalaPlanItemPayload,
  type GalaPlanSummary,
  type GalaPlanVisibility,
} from '../utils/galaPlansApi'
import { parseGalaPlanDescription } from '../utils/galaPlanDescription'
import { navigateToPath } from '../utils/navigation'
import { getCategoryIconName } from '../components/AppIcon'
import { buildPrivateGalaPlanShareUrl, shareLink } from '../utils/share'

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
const TIME_PERIODS = ['AM', 'PM'] as const

type TimePeriod = (typeof TIME_PERIODS)[number]

function getApiUrl(path: string) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
  return apiBaseUrl ? `${apiBaseUrl}${path}` : `/api${path}`
}

function formatDate(value: string | null | undefined) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

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

function getVisibilityIconName(visibility: GalaPlanVisibility) {
  return visibility === 'private' ? 'lock' : 'galaPlan'
}

function Badge({ children }: { children: string }) {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-700">
      <AppIcon name={getVisibilityIconName(children as GalaPlanVisibility)} className="h-3.5 w-3.5" />
      {children}
    </span>
  )
}

function PlanStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="text-sm font-black text-slate-950">{value}</p>
    </div>
  )
}

function EmptyPlansState({ favorites }: { favorites?: boolean }) {
  return (
    <section className="gala-empty-state">
      <h2 className="text-xl font-black text-slate-950">
        {favorites ? 'No gala plan favorites yet.' : 'Start your first gala plan.'}
      </h2>
      <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-600">
        {favorites
          ? 'Public gala plans you heart will show here for quick access.'
          : 'Build a simple route, keep it private, and share it when it is ready.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {!favorites ? (
          <button type="button" onClick={() => navigateToPath('/gala-plans/new')} className="gala-primary-button min-h-10 px-4">
            Create Gala Plan
          </button>
        ) : null}
        <button type="button" onClick={() => navigateToPath(favorites ? '/' : '/gala-plans/favorites')} className="gala-secondary-button min-h-10 px-4">
          {favorites ? 'Discover Places' : 'View Gala Plan Favorites'}
        </button>
      </div>
    </section>
  )
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="gala-app-page">
      <AppHeader />
      <main className="gala-app-main">
        {children}
      </main>
    </div>
  )
}

function PlanCard({
  plan,
  showOwner = false,
  onDeleted,
}: {
  plan: GalaPlanSummary
  showOwner?: boolean
  onDeleted?: (planId: string) => void
}) {
  const openPlan = () => navigateToPath(`/gala-plans/${encodeURIComponent(plan.id)}`)
  const placeCount = plan.place_count ?? plan.places_count
  const heartCount = plan.heart_count ?? plan.hearts_count
  const description = cleanPlanDescription(plan.description)
  const visiblePreviewPlaces = plan.preview_places.slice(0, 2)
  const hiddenPreviewPlaceCount = Math.max(plan.preview_places.length - visiblePreviewPlaces.length, 0)
  const metaItems = [
    {
      key: 'stops',
      icon: 'place' as const,
      value: `${placeCount} stop${placeCount === 1 ? '' : 's'}`,
    },
    {
      key: 'updated',
      icon: 'history' as const,
      value: formatDate(plan.updated_at),
    },
    ...(plan.visibility === 'public'
      ? [{
          key: 'hearts',
          icon: 'favorites' as const,
          value: `${heartCount} heart${heartCount === 1 ? '' : 's'}`,
        }]
      : []),
  ]

  return (
    <article className="group gala-card flex h-full flex-col p-4 transition hover:border-[var(--line-strong)] sm:p-5">
      <div className="mb-4 h-1.5 w-14 rounded-full bg-[var(--accent)]" />
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {showOwner && plan.owner ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-600">
              <AppIcon name="profile" className="h-3.5 w-3.5" />
              @{plan.owner.username || 'galatayo-user'}
            </span>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{plan.visibility}</Badge>
            {plan.is_active ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-700">
                <AppIcon name="check" className="h-3.5 w-3.5" />
                Active
              </span>
            ) : null}
          </div>
        </div>
        <button type="button" onClick={openPlan} className="text-left text-lg font-black leading-tight text-slate-950 transition group-hover:text-slate-700 sm:text-xl">
          {plan.title}
        </button>
        <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-slate-600">{description || 'No description yet.'}</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4 text-sm font-black text-slate-700">
        {metaItems.map((item) => (
          <span key={item.key} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1.5">
            <AppIcon name={item.icon} className="h-3.5 w-3.5 text-slate-400" />
            {item.value}
          </span>
        ))}
      </div>
      {visiblePreviewPlaces.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {visiblePreviewPlaces.map((place) => (
            <span key={`${plan.id}-${place.id}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700">
              <AppIcon name="place" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate">{place.name}</span>
            </span>
          ))}
          {hiddenPreviewPlaceCount > 0 ? (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">
              +{hiddenPreviewPlaceCount} more
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={openPlan} className="gala-primary-button min-h-10 px-4">
          <AppIcon name="arrowRight" className="h-4 w-4" />
          View Plan
        </button>
        {plan.viewer_is_owner ? (
          <>
            <button type="button" onClick={() => navigateToPath(`/gala-plans/${encodeURIComponent(plan.id)}/edit`)} className="gala-secondary-button min-h-10 px-4">
              <AppIcon name="settings" className="h-4 w-4" />
              Edit
            </button>
            <button type="button" onClick={async () => { await deleteGalaPlan(plan.id); onDeleted?.(plan.id) }} className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-white px-4 text-sm font-black text-red-700 transition hover:border-red-300 hover:bg-red-50">
              <AppIcon name="trash" className="h-4 w-4" />
              Delete
            </button>
          </>
        ) : null}
      </div>
    </article>
  )
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

function ItineraryBuilder({
  items,
  onItemsChange,
}: {
  items: DraftItem[]
  onItemsChange: (items: DraftItem[]) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchPlaceResult[]>([])
  const [showAllResults, setShowAllResults] = useState(false)
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
  const visibleResults = useMemo(
    () => (showAllResults ? results : results.slice(0, PLACE_SEARCH_DEFAULT_LIMIT)),
    [results, showAllResults],
  )

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
  }

  const searchPlaces = async () => {
    if (query.trim().length < 2) {
      setErrorMessage('Search at least 2 characters.')
      return
    }

    try {
      setIsSearching(true)
      setErrorMessage('')
      setShowAllResults(false)
      const response = await fetch(getApiUrl('/search'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const data = (await response.json().catch(() => ({}))) as { message?: string; places?: SearchPlaceResult[]; result?: { places?: SearchPlaceResult[] } }
      if (!response.ok) throw new Error(data.message || 'Failed to search places.')
      setResults((data.places || data.result?.places || []).filter((place) => place.id && place.name))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to search places.')
    } finally {
      setIsSearching(false)
    }
  }

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
    setShowAllResults(false)
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
    <section className="grid gap-5">
      <section className="grid gap-6">
        <div className="grid gap-2">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--accent-deep)]">Build The Route</p>
          <h2 className="gala-section-title">Add places in a simple flow</h2>
          <p className="max-w-2xl text-sm font-semibold leading-6 text-slate-600">Search a place, choose it, fill in the visit details, then add it to your plan.</p>
        </div>

        <div className="rounded-lg border border-[var(--line)] bg-[var(--accent-wash)] px-4 py-3 text-sm font-semibold leading-6 text-[var(--accent-deep)]">
          Tip: keep it simple. Start with the first place you know for sure, then add the next stop after.
        </div>

        <div className="grid gap-3">
          <div className="flex items-center gap-2 text-sm font-black text-slate-950">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--chip)] text-[var(--accent-deep)]">1</span>
            Search and choose a place
          </div>
          <p className="text-sm font-semibold text-slate-600">Type an area or place name like `Intramuros`, then tap `Choose` on the result you want.</p>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="relative">
              <AppIcon name="search" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void searchPlaces() } }} className="h-12 w-full rounded-2xl border border-[var(--line-strong)] bg-white pl-11 pr-4 text-sm font-semibold outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]" placeholder="Search places to add" />
            </div>
            <button type="button" onClick={() => void searchPlaces()} disabled={isSearching} className="gala-primary-button h-12 px-5 disabled:border-slate-300 disabled:bg-slate-300">{isSearching ? 'Searching...' : 'Search'}</button>
          </div>
        </div>

        {results.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
              <p className="text-sm font-black text-slate-800">
                Showing {visibleResults.length} of {results.length} places
              </p>
              {results.length > PLACE_SEARCH_DEFAULT_LIMIT ? (
                <button
                  type="button"
                  onClick={() => setShowAllResults((current) => !current)}
                  className="inline-flex h-9 items-center rounded-full border border-[var(--line-strong)] bg-white px-3 text-xs font-black text-[var(--accent-deep)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-wash)]"
                >
                  {showAllResults ? `Show ${PLACE_SEARCH_DEFAULT_LIMIT}` : 'Show all'}
                </button>
              ) : null}
            </div>
            {visibleResults.map((place, index) => {
              const alreadyAdded = items.some((item) => item.place_id === place.id)
              const isSelected = selectedPlace?.id === place.id
              return (
                <article key={place.id} className={`flex items-start justify-between gap-4 px-4 py-4 transition ${index !== 0 ? 'border-t border-[var(--line)]' : ''} ${isSelected ? 'bg-[var(--accent-wash)]' : 'bg-white'}`}>
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
        ) : null}

        <section className="grid gap-4 border-t border-[var(--line)] pt-5">
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
                  <button type="button" onClick={confirmAddPlace} className="gala-primary-button h-11 px-5">
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

      <section className="grid gap-4 border-t border-[var(--line)] pt-5">
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

  if (isLoading) {
    return (
      <UnifiedLoadingState
        title="Preparing gala plan..."
        message="We are loading your plan editor now."
      />
    )
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      {isRefreshing ? <p className="text-sm text-[var(--muted)]">Refreshing your gala plan in the background...</p> : null}
      <section className="grid gap-5">
        <PageHeroHeader
          eyebrow="Gala Plans"
          title={isEdit ? 'Edit your gala plan' : 'Create a gala plan'}
          description="Start with the basics, then add places one by one so the plan stays clear and easy to follow."
          icon={<AppIcon name="galaPlan" className="h-4 w-4" />}
          badges={
            <>
              <span className="gala-count-pill">{items.length} stop{items.length === 1 ? '' : 's'}</span>
              <span className="gala-count-pill">{visibility} visibility</span>
            </>
          }
        />
        <div className="grid gap-5 border-t border-[var(--line)] pt-5">
          <label className="grid gap-2"><span className="text-sm font-black text-slate-800">Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} className="h-12 rounded-2xl border border-[var(--line-strong)] px-4 text-base font-bold text-slate-950 outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]" placeholder="Cafe crawl in BGC" /></label>
          <label className="grid gap-2"><span className="text-sm font-black text-slate-800">Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} className="resize-none rounded-2xl border border-[var(--line-strong)] px-4 py-3 text-sm font-semibold leading-6 text-slate-950 outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]" placeholder="What kind of day is this plan for?" /></label>
          <label className="grid gap-2"><span className="text-sm font-black text-slate-800">Visibility</span><VisibilitySelector value={visibility} onChange={setVisibility} /></label>
        </div>
      </section>

      <ItineraryBuilder items={items} onItemsChange={setItems} />
      {errorMessage ? <p className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{errorMessage}</p> : null}
      <button type="submit" disabled={isSaving || !title.trim()} className="gala-primary-button h-12 w-fit px-6 disabled:border-slate-300 disabled:bg-slate-300">{isSaving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Gala Plan'}</button>
    </form>
  )
}
function ListPage({ session, favorites = false }: { session?: Session | null; favorites?: boolean }) {
  const [plans, setPlans] = useState<GalaPlanSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const loadPlans = async () => {
      try {
        if (plans.length > 0) {
          setIsRefreshing(true)
        } else {
          setIsLoading(true)
        }
        setErrorMessage('')
        const data = favorites ? await listFavoriteGalaPlans(session) : await listMyGalaPlans(session)
        setPlans(data.plans)
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load gala plan.')
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    }
    void loadPlans()
  }, [favorites, session?.user?.id])

  const latestUpdate = plans[0]?.updated_at ? formatDate(plans[0].updated_at) : favorites ? 'No gala plan favorites yet' : 'No gala plan yet'

  return (
    <>
      <PageHeroHeader
        eyebrow="Gala Plans"
        title={favorites ? 'Gala plan favorites' : 'My gala plans'}
        description={favorites ? 'Public gala plans you hearted and saved for quick access.' : 'Keep your routes clear, compact, and easy to edit.'}
        icon={<AppIcon name="galaPlan" className="h-4 w-4" />}
        badges={
          <>
            <span className="gala-count-pill">
              {plans.length} {favorites ? 'saved plan' : 'plan'}{plans.length === 1 ? '' : 's'}
            </span>
            <span className="gala-count-pill">
              {favorites ? 'Community picks' : `Latest update ${latestUpdate}`}
            </span>
          </>
        }
        aside={
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <button type="button" onClick={() => navigateToPath(favorites ? '/gala-plans' : '/gala-plans/favorites')} className="gala-secondary-button min-h-10 px-4">{favorites ? 'My Gala Plan' : 'Gala Plan Favorites'}</button>
            {!favorites ? <button type="button" onClick={() => navigateToPath('/gala-plans/new')} className="gala-primary-button min-h-10 px-4">Create Gala Plan</button> : null}
          </div>
        }
      />

      <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
        <PlanStat label={favorites ? 'Saved plans' : 'Total plans'} value={String(plans.length)} />
        {!favorites ? <PlanStat label="Latest update" value={latestUpdate} /> : null}
      </div>

      {isLoading ? (
        <UnifiedLoadingState
          title={favorites ? 'Preparing saved gala plans...' : 'Preparing your gala plans...'}
          message={favorites ? 'We are loading your favorited plans.' : 'We are loading your plans.'}
        />
      ) : null}
      {!isLoading && isRefreshing ? <p className="text-sm text-[var(--muted)]">Refreshing gala plans in the background...</p> : null}
      {errorMessage ? <p className="rounded-lg bg-red-50 p-4 text-sm font-bold text-red-700">{errorMessage}</p> : null}
      {!isLoading && !errorMessage && plans.length === 0 ? <EmptyPlansState favorites={favorites} /> : null}
      <section className="grid gap-4 md:grid-cols-2">
        {plans.map((plan) => <PlanCard key={plan.id} plan={plan} showOwner={favorites} onDeleted={(planId) => setPlans((current) => current.filter((currentPlan) => currentPlan.id !== planId))} />)}
      </section>
    </>
  )
}

function DetailPage({ planId, session }: { planId: string; session?: Session | null }) {
  const [plan, setPlan] = useState<GalaPlanDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    const loadPlan = async () => {
      try {
        if (plan) {
          setIsRefreshing(true)
        } else {
          setIsLoading(true)
        }
        setErrorMessage('')
        const data = await getGalaPlan(planId, session)
        setPlan(data.plan)
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Gala plan unavailable.')
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    }
    void loadPlan()
  }, [planId, session?.user?.id])

  const groupedItems = useMemo(() => {
    const groups = new Map<number, GalaPlanDetail['items']>()
    for (const item of plan?.items || []) {
      const dayItems = groups.get(item.day_number) || []
      dayItems.push(item)
      groups.set(item.day_number, dayItems)
    }
    return Array.from(groups.entries()).sort(([first], [second]) => first - second)
  }, [plan])

  const sharePlan = async () => {
    if (!plan) return
    await shareLink({
      url: buildPrivateGalaPlanShareUrl(plan.id),
      title: plan.title,
      text: plan.title,
    })
  }

  const toggleHeart = async () => {
    if (!plan) return
    try {
      const data = await toggleGalaPlanHeart(plan.id, session)
      setPlan({ ...plan, viewer_has_hearted: data.viewer_has_hearted, heart_count: data.heart_count, hearts_count: data.hearts_count })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Failed to update heart.')
    }
  }

  if (isLoading) {
    return (
      <UnifiedLoadingState
        title="Preparing gala plan..."
        message="We are loading this itinerary now."
      />
    )
  }
  if (!plan) return <p className="rounded-lg border border-[var(--line)] bg-white p-5 text-sm font-bold text-red-700">{errorMessage || 'Gala plan unavailable.'}</p>

  return (
    <div className="grid gap-5">
      {isRefreshing ? <p className="text-sm text-[var(--muted)]">Refreshing this gala plan in the background...</p> : null}
      <section className="gala-card overflow-hidden">
        <div className="border-b border-[var(--line)] bg-white px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {plan.viewer_is_owner ? <Badge>{plan.visibility}</Badge> : null}
                {plan.is_active ? <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-700"><AppIcon name="check" className="h-3.5 w-3.5" />Active</span> : null}
              </div>
              <h1 className="gala-page-title mt-4">{plan.title}</h1>
              <p className="mt-3 text-sm font-black text-[var(--accent-deep)]">{plan.owner?.username ? `@${plan.owner.username}` : 'GalaTayo user'}</p>
              {cleanPlanDescription(plan.description) ? <p className="mt-4 max-w-3xl text-sm font-semibold leading-6 text-slate-700">{cleanPlanDescription(plan.description)}</p> : null}
            </div>
            <div className="grid w-full gap-3 sm:w-auto sm:min-w-[220px]">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-1">
                <div className="rounded-lg border border-[var(--line)] bg-white p-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Places</p>
                  <p className="mt-1 text-xl font-black text-slate-950">{plan.place_count}</p>
                </div>
                <div className="rounded-lg border border-[var(--line)] bg-white p-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Updated</p>
                  <p className="mt-1 text-sm font-black text-slate-950">{formatDate(plan.updated_at)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-100 px-5 py-4 sm:px-6">
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              {!plan.viewer_is_owner && plan.visibility === 'public' && plan.is_active ? <button type="button" onClick={() => void toggleHeart()} className="inline-flex h-11 items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 text-sm font-black text-rose-700 transition hover:bg-rose-100"><AppIcon name="favorites" className="h-4 w-4" />{plan.viewer_has_hearted ? 'Hearted' : 'Heart'} · {plan.heart_count}</button> : <span className="inline-flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 text-sm font-black text-slate-700"><AppIcon name="favorites" className="h-4 w-4 text-slate-500" />{plan.heart_count} hearts</span>}
              <button type="button" onClick={() => void sharePlan()} className="inline-flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 transition hover:border-slate-300 hover:bg-slate-50"><AppIcon name="copy" className="h-4 w-4" />Copy Link</button>
              {plan.viewer_is_owner ? (
                <>
                  <button type="button" onClick={() => navigateToPath(`/gala-plans/${encodeURIComponent(plan.id)}/edit`)} className="inline-flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 transition hover:border-slate-300 hover:bg-slate-50"><AppIcon name="settings" className="h-4 w-4" />Edit</button>
                  <button type="button" onClick={async () => { await deleteGalaPlan(plan.id, session); navigateToPath('/gala-plans') }} className="inline-flex h-11 items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 text-sm font-black text-red-700 transition hover:bg-red-100"><AppIcon name="trash" className="h-4 w-4" />Delete</button>
                </>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Created</p>
                <p className="mt-1 text-sm font-black text-slate-950">{formatDate(plan.created_at)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Stops</p>
                <p className="mt-1 text-sm font-black text-slate-950">{plan.place_count} {plan.place_count === 1 ? 'place' : 'places'}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Status</p>
                <p className="mt-1 text-sm font-black text-slate-950">{plan.is_active ? 'Ready to share' : 'Draft plan'}</p>
              </div>
            </div>
          </div>
        </div>
        {notice ? <p className="mx-5 mb-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 sm:mx-6 sm:mb-6">{notice}</p> : null}
      </section>

      <section className="grid gap-4">
        {groupedItems.length === 0 ? <p className="rounded-lg border border-[var(--line)] bg-white p-4 text-sm font-semibold text-[var(--muted)]">This gala plan has no places yet.</p> : groupedItems.map(([dayNumber, items]) => (
          <div key={dayNumber} className="grid gap-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 items-center rounded-lg bg-[var(--accent)] px-4 text-sm font-black text-white">Day {dayNumber}</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
            {items.map((item) => (
              <article key={item.id} className="gala-card p-4 sm:p-5">
                <div className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-sm font-black text-slate-700">{item.sort_order}</span>
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => navigateToPath(`/places/${encodeURIComponent(item.place.slug)}`)} className="text-left text-lg font-black leading-tight text-slate-950 transition hover:text-[var(--accent-deep)]">{item.place.name}</button>
                    <p className="mt-1 text-sm font-bold text-[var(--muted)]">{[item.place.city || item.place.area, item.place.category].filter(Boolean).join(' · ') || 'GalaTayo place'}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-black text-slate-700">
                      {item.time_label ? <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 ring-1 ring-[var(--line)]"><AppIcon name="history" className="h-3.5 w-3.5 text-slate-500" />{item.time_label}</span> : null}
                      {item.estimated_minutes ? <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 ring-1 ring-[var(--line)]"><AppIcon name="galaPlan" className="h-3.5 w-3.5 text-slate-500" />{item.estimated_minutes} min</span> : null}
                    </div>
                    {item.notes ? <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">{item.notes}</p> : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ))}
      </section>
    </div>
  )
}

function GalaPlansPage({ mode = 'list', planId = null, session = null }: GalaPlansPageProps) {
  return (
    <PageShell>
      {mode !== 'list' && mode !== 'favorites' ? <MinimalBackNav to="/gala-plans" /> : null}
      {mode === 'list' ? <ListPage session={session} /> : null}
      {mode === 'favorites' ? <ListPage session={session} favorites /> : null}
      {mode === 'new' ? <PlanForm session={session} /> : null}
      {mode === 'edit' && planId ? <PlanForm session={session} planId={planId} /> : null}
      {mode === 'detail' && planId ? <DetailPage planId={planId} session={session} /> : null}
    </PageShell>
  )
}

export default GalaPlansPage



