import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import AppHeader from '../components/AppHeader'
import AppFooter from '../components/AppFooter'
import {
  createGalaPlan,
  deleteGalaPlan,
  getGalaPlan,
  listLikedGalaPlans,
  listMyGalaPlans,
  toggleGalaPlanHeart,
  updateGalaPlan,
  type GalaPlanDetail,
  type GalaPlanItemPayload,
  type GalaPlanSummary,
  type GalaPlanVisibility,
} from '../utils/galaPlansApi'
import { navigateToPath } from '../utils/navigation'

type Mode = 'list' | 'liked' | 'new' | 'detail' | 'edit'

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

function getApiUrl(path: string) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
  return apiBaseUrl ? `${apiBaseUrl}${path}` : `/api${path}`
}

function formatDate(value: string | null | undefined) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function Badge({ children }: { children: string }) {
  return (
    <span className="inline-flex w-fit rounded-full bg-[var(--chip)] px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--accent-deep)]">
      {children}
    </span>
  )
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-[linear-gradient(180deg,#f8fbff,#edf4ff)] text-[var(--text)]">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-5 px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
        {children}
      </main>
      <AppFooter />
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
  const openPlan = () => navigateToPath(`/gala-plans/${encodeURIComponent(plan.slug || plan.id)}`)

  return (
    <article className="rounded-lg border border-[var(--line)] bg-white p-4 shadow-[0_12px_26px_rgba(28,77,160,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={openPlan} className="text-left text-lg font-black leading-tight text-slate-950 hover:text-[var(--accent-deep)]">
            {plan.title}
          </button>
          {showOwner && plan.owner ? (
            <p className="mt-1 text-xs font-black text-[var(--accent-deep)]">@{plan.owner.username || 'galatayo-user'}</p>
          ) : null}
          <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-slate-600">
            {plan.description || 'No description yet.'}
          </p>
        </div>
        <Badge>{plan.visibility}</Badge>
      </div>
      <p className="mt-3 text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">
        {plan.place_count ?? plan.places_count} {(plan.place_count ?? plan.places_count) === 1 ? 'place' : 'places'}
        {plan.visibility === 'public' ? ` · ${plan.heart_count ?? plan.hearts_count} hearts` : ''}
        {' · '}Updated {formatDate(plan.updated_at)}
      </p>
      {plan.preview_places.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {plan.preview_places.map((place) => (
            <span key={`${plan.id}-${place.id}`} className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 ring-1 ring-[var(--line)]">
              {place.name}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={openPlan} className="h-10 rounded-lg bg-[var(--accent)] px-4 text-sm font-black text-white">
          View
        </button>
        {plan.viewer_is_owner ? (
          <>
            <button type="button" onClick={() => navigateToPath(`/gala-plans/${encodeURIComponent(plan.id)}/edit`)} className="h-10 rounded-lg border border-[var(--line)] px-4 text-sm font-black">
              Edit
            </button>
            <button
              type="button"
              onClick={async () => {
                await deleteGalaPlan(plan.id)
                onDeleted?.(plan.id)
              }}
              className="h-10 rounded-lg border border-red-100 bg-red-50 px-4 text-sm font-black text-red-700"
            >
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
        <button
          key={visibility}
          type="button"
          onClick={() => onChange(visibility)}
          className={`h-11 rounded-lg border px-3 text-sm font-black capitalize ${
            value === visibility ? 'border-[var(--accent)] bg-[var(--chip)] text-[var(--accent-deep)]' : 'border-[var(--line-strong)] bg-white text-slate-700'
          }`}
        >
          {visibility}
        </button>
      ))}
    </div>
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
  const [isSearching, setIsSearching] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const searchPlaces = async () => {
    if (query.trim().length < 2) {
      setErrorMessage('Search at least 2 characters.')
      return
    }

    try {
      setIsSearching(true)
      setErrorMessage('')
      const response = await fetch(getApiUrl('/search'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const data = (await response.json().catch(() => ({}))) as {
        message?: string
        places?: SearchPlaceResult[]
        result?: { places?: SearchPlaceResult[] }
      }
      if (!response.ok) throw new Error(data.message || 'Failed to search places.')
      setResults((data.places || data.result?.places || []).filter((place) => place.id && place.name).slice(0, 8))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to search places.')
    } finally {
      setIsSearching(false)
    }
  }

  const addPlace = (place: SearchPlaceResult) => {
    if (items.some((item) => item.place_id === place.id)) return
    onItemsChange([
      ...items,
      {
        draft_id: `${place.id}-${Date.now()}`,
        place_id: place.id,
        day_number: 1,
        sort_order: items.length + 1,
        time_label: null,
        notes: null,
        estimated_minutes: null,
        place,
      },
    ])
    setQuery('')
    setResults([])
    setErrorMessage('')
  }

  const updateItem = (draftId: string, updates: Partial<DraftItem>) => {
    onItemsChange(items.map((item) => (item.draft_id === draftId ? { ...item, ...updates } : item)))
  }

  const removeItem = (draftId: string) => {
    onItemsChange(
      items
        .filter((item) => item.draft_id !== draftId)
        .map((item, index) => ({ ...item, sort_order: index + 1 })),
    )
  }

  return (
    <section className="grid gap-4">
      <div className="rounded-lg border border-[var(--line)] bg-white p-4 shadow-[0_12px_26px_rgba(28,77,160,0.06)]">
        <h2 className="text-xl font-black text-slate-950">Add Places</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void searchPlaces()
              }
            }}
            className="h-11 rounded-lg border border-[var(--line-strong)] px-4 text-sm font-semibold outline-none focus:border-[var(--accent)]"
            placeholder="Search places to add"
          />
          <button type="button" onClick={() => void searchPlaces()} disabled={isSearching} className="h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-black text-white disabled:bg-slate-300">
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </div>
        {errorMessage ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{errorMessage}</p> : null}
        {results.length > 0 ? (
          <div className="mt-4 grid gap-2">
            {results.map((place) => {
              const alreadyAdded = items.some((item) => item.place_id === place.id)
              return (
                <article key={place.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-[var(--line)] bg-[linear-gradient(180deg,#ffffff,#f9fbff)] p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950">{place.name}</p>
                    <p className="text-xs font-semibold text-[var(--muted)]">{[place.city || place.area, place.category].filter(Boolean).join(' · ')}</p>
                  </div>
                  <button type="button" onClick={() => addPlace(place)} disabled={alreadyAdded} className="h-9 rounded-lg bg-slate-900 px-3 text-xs font-black text-white disabled:bg-slate-300">
                    {alreadyAdded ? 'Added' : 'Add'}
                  </button>
                </article>
              )
            })}
          </div>
        ) : null}
      </div>

      <section className="rounded-lg border border-[var(--line)] bg-white p-4 shadow-[0_12px_26px_rgba(28,77,160,0.06)]">
        <h2 className="text-xl font-black text-slate-950">Selected Places</h2>
        {items.length === 0 ? (
          <p className="mt-3 text-sm font-semibold text-[var(--muted)]">No places selected yet.</p>
        ) : (
          <div className="mt-4 grid gap-3">
            {items.map((item, index) => (
              <article key={item.draft_id} className="rounded-lg border border-[var(--line)] bg-slate-50 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-950">{index + 1}. {item.place.name}</p>
                    <p className="text-xs font-bold text-[var(--muted)]">{[item.place.city || item.place.area, item.place.category].filter(Boolean).join(' · ')}</p>
                  </div>
                  <button type="button" onClick={() => removeItem(item.draft_id)} className="h-9 rounded-lg border border-red-100 bg-red-50 px-3 text-xs font-black text-red-700">
                    Remove
                  </button>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  <label className="grid gap-1">
                    <span className="text-xs font-black text-slate-700">Day</span>
                    <input type="number" min={1} value={item.day_number ?? 1} onChange={(event) => updateItem(item.draft_id, { day_number: Number(event.target.value) || 1 })} className="h-10 rounded-lg border border-[var(--line-strong)] px-3 text-sm font-bold" />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-black text-slate-700">Order</span>
                    <input type="number" min={1} value={item.sort_order ?? index + 1} onChange={(event) => updateItem(item.draft_id, { sort_order: Number(event.target.value) || index + 1 })} className="h-10 rounded-lg border border-[var(--line-strong)] px-3 text-sm font-bold" />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-black text-slate-700">Time</span>
                    <input value={item.time_label ?? ''} onChange={(event) => updateItem(item.draft_id, { time_label: event.target.value || null })} placeholder="09:30" className="h-10 rounded-lg border border-[var(--line-strong)] px-3 text-sm font-bold" />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-black text-slate-700">Minutes</span>
                    <input type="number" min={1} value={item.estimated_minutes ?? ''} onChange={(event) => updateItem(item.draft_id, { estimated_minutes: event.target.value ? Number(event.target.value) : null })} className="h-10 rounded-lg border border-[var(--line-strong)] px-3 text-sm font-bold" />
                  </label>
                </div>
                <textarea value={item.notes ?? ''} onChange={(event) => updateItem(item.draft_id, { notes: event.target.value || null })} rows={2} placeholder="Notes" className="mt-3 w-full resize-none rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm font-semibold" />
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}

function toPayload(items: DraftItem[]): GalaPlanItemPayload[] {
  return [...items]
    .sort((first, second) => (first.day_number ?? 1) - (second.day_number ?? 1) || (first.sort_order ?? 0) - (second.sort_order ?? 0))
    .map((item, index) => ({
      place_id: item.place_id,
      day_number: item.day_number ?? 1,
      sort_order: item.sort_order ?? index + 1,
      time_label: item.time_label ?? null,
      notes: item.notes ?? null,
      estimated_minutes: item.estimated_minutes ?? null,
    }))
}

function PlanForm({ session, planId }: { session?: Session | null; planId?: string | null }) {
  const isEdit = Boolean(planId)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<GalaPlanVisibility>('private')
  const [items, setItems] = useState<DraftItem[]>([])
  const [isLoading, setIsLoading] = useState(isEdit)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!planId) return
    const loadPlan = async () => {
      try {
        setIsLoading(true)
        const data = await getGalaPlan(planId, session)
        if (!data.plan.viewer_is_owner) {
          setErrorMessage('Only the owner can edit this gala plan.')
          return
        }
        setTitle(data.plan.title)
        setDescription(data.plan.description ?? '')
        setVisibility(data.plan.visibility)
        setItems(data.plan.items.map((item) => ({
          draft_id: item.id,
          place_id: item.place_id,
          day_number: item.day_number,
          sort_order: item.sort_order,
          time_label: item.time_label,
          notes: item.notes,
          estimated_minutes: item.estimated_minutes,
          place: item.place,
        })))
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load gala plan.')
      } finally {
        setIsLoading(false)
      }
    }
    void loadPlan()
  }, [planId, session])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) {
      setErrorMessage('Title is required.')
      return
    }

    try {
      setIsSaving(true)
      setErrorMessage('')
      const payload = { title, description: description || null, visibility, items: toPayload(items) }
      const data = planId ? await updateGalaPlan(planId, payload, session) : await createGalaPlan(payload, session)
      navigateToPath(`/gala-plans/${encodeURIComponent(data.plan.slug || data.plan.id)}`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save gala plan.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) return <p className="rounded-lg border border-[var(--line)] bg-white p-5 text-sm font-semibold text-[var(--muted)]">Loading gala plan...</p>

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      <section className="rounded-lg border border-[var(--line)] bg-white p-5 shadow-[0_14px_32px_rgba(28,77,160,0.07)] sm:p-7">
        <h1 className="text-3xl font-black text-slate-950">{isEdit ? 'Edit Gala Plan' : 'Create Gala Plan'}</h1>
        <div className="mt-6 grid gap-5">
          <label className="grid gap-2">
            <span className="text-sm font-black text-slate-800">Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-12 rounded-lg border border-[var(--line-strong)] px-4 text-base font-bold text-slate-950 outline-none focus:border-[var(--accent)]" placeholder="Cafe crawl in BGC" />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-black text-slate-800">Description</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} className="resize-none rounded-lg border border-[var(--line-strong)] px-4 py-3 text-sm font-semibold leading-6 text-slate-950 outline-none focus:border-[var(--accent)]" />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-black text-slate-800">Visibility</span>
            <VisibilitySelector value={visibility} onChange={setVisibility} />
          </label>
        </div>
      </section>

      <ItineraryBuilder items={items} onItemsChange={setItems} />

      {errorMessage ? <p className="rounded-lg bg-red-50 p-4 text-sm font-bold text-red-700">{errorMessage}</p> : null}
      <button type="submit" disabled={isSaving || !title.trim()} className="h-12 rounded-lg bg-slate-900 px-5 text-sm font-black text-white disabled:bg-slate-300">
        {isSaving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Gala Plan'}
      </button>
    </form>
  )
}

function ListPage({ session, liked = false }: { session?: Session | null; liked?: boolean }) {
  const [plans, setPlans] = useState<GalaPlanSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const loadPlans = async () => {
      try {
        setIsLoading(true)
        const data = liked ? await listLikedGalaPlans(session) : await listMyGalaPlans(session)
        setPlans(data.plans)
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load gala plans.')
      } finally {
        setIsLoading(false)
      }
    }
    void loadPlans()
  }, [liked, session])

  return (
    <>
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-black leading-tight text-slate-950">{liked ? 'Liked Gala Plans' : 'My Gala Plans'}</h1>
          <p className="mt-2 text-base font-semibold text-[var(--muted)]">{liked ? 'Public gala plans you hearted.' : 'Create, order, and share your gala routes.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => navigateToPath(liked ? '/gala-plans' : '/gala-plans/liked')} className="h-12 rounded-lg border border-[var(--line)] bg-white px-5 text-sm font-black">
            {liked ? 'My Gala Plans' : 'Liked Gala Plans'}
          </button>
          {!liked ? (
            <button type="button" onClick={() => navigateToPath('/gala-plans/new')} className="h-12 rounded-lg bg-[var(--accent)] px-5 text-sm font-black text-white">
              Create Gala Plan
            </button>
          ) : null}
        </div>
      </section>

      {isLoading ? <p className="rounded-lg border border-[var(--line)] bg-white p-4 text-sm font-semibold text-[var(--muted)]">Loading plans...</p> : null}
      {errorMessage ? <p className="rounded-lg bg-red-50 p-4 text-sm font-bold text-red-700">{errorMessage}</p> : null}
      {!isLoading && !errorMessage && plans.length === 0 ? (
        <p className="rounded-lg border border-[var(--line)] bg-white p-4 text-sm font-semibold text-[var(--muted)]">
          {liked ? 'Wala ka pang ni-heart na gala plan.' : 'Wala ka pang gala plan.'}
        </p>
      ) : null}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} showOwner={liked} onDeleted={(planId) => setPlans((current) => current.filter((plan) => plan.id !== planId))} />
        ))}
      </section>
    </>
  )
}

function DetailPage({ planId, session }: { planId: string; session?: Session | null }) {
  const [plan, setPlan] = useState<GalaPlanDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const loadPlan = async () => {
      try {
        setIsLoading(true)
        const data = await getGalaPlan(planId, session)
        setPlan(data.plan)
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Gala plan unavailable.')
      } finally {
        setIsLoading(false)
      }
    }
    void loadPlan()
  }, [planId, session])

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
    const url = `${window.location.origin}/gala-plans/${encodeURIComponent(plan.slug || plan.id)}`
    if (navigator.share) {
      await navigator.share({ title: plan.title, text: plan.title, url })
      setNotice('Shared.')
      return
    }
    await navigator.clipboard.writeText(url)
    setNotice('Link copied.')
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

  if (isLoading) return <p className="rounded-lg border border-[var(--line)] bg-white p-5 text-sm font-semibold text-[var(--muted)]">Loading gala plan...</p>
  if (!plan) return <p className="rounded-lg border border-[var(--line)] bg-white p-5 text-sm font-bold text-red-700">{errorMessage || 'Gala plan unavailable.'}</p>

  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-[var(--line)] bg-white p-6 shadow-[0_18px_42px_rgba(47,116,232,0.1)] sm:p-8">
        <button type="button" onClick={() => navigateToPath('/gala-plans')} className="mb-5 text-sm font-black text-[var(--accent-deep)]">Back</button>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-3xl font-black leading-tight text-slate-950 sm:text-4xl">{plan.title}</h1>
            <p className="mt-3 text-sm font-black text-[var(--accent-deep)]">
              {plan.owner?.username ? `@${plan.owner.username}` : 'GalaTayo user'}
            </p>
            {plan.viewer_is_owner ? <div className="mt-3"><Badge>{plan.visibility}</Badge></div> : null}
            {plan.description ? <p className="mt-5 max-w-3xl text-base font-semibold leading-7 text-slate-700">{plan.description}</p> : null}
          </div>
          <span className="w-fit rounded-full bg-[var(--chip)] px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-[var(--accent-deep)]">
            {plan.place_count} {plan.place_count === 1 ? 'place' : 'places'}
          </span>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {!plan.viewer_is_owner && plan.visibility === 'public' && plan.is_active ? (
            <button type="button" onClick={() => void toggleHeart()} className="h-10 rounded-lg border border-[var(--line)] px-3 text-sm font-black">
              {plan.viewer_has_hearted ? 'Hearted' : 'Heart'} · {plan.heart_count}
            </button>
          ) : (
            <span className="inline-flex h-10 items-center rounded-lg border border-[var(--line)] px-3 text-sm font-black">{plan.heart_count} hearts</span>
          )}
          <button type="button" onClick={() => void sharePlan()} className="h-10 rounded-lg border border-[var(--line)] px-3 text-sm font-black">Copy Link</button>
          {plan.viewer_is_owner ? (
            <>
              <button type="button" onClick={() => navigateToPath(`/gala-plans/${encodeURIComponent(plan.id)}/edit`)} className="h-10 rounded-lg border border-[var(--line)] px-3 text-sm font-black">Edit</button>
              <button
                type="button"
                onClick={async () => {
                  await deleteGalaPlan(plan.id, session)
                  navigateToPath('/gala-plans')
                }}
                className="h-10 rounded-lg border border-red-100 bg-red-50 px-3 text-sm font-black text-red-700"
              >
                Delete
              </button>
            </>
          ) : null}
        </div>
        {notice ? <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">{notice}</p> : null}
      </section>

      <section className="grid gap-4">
        {groupedItems.length === 0 ? (
          <p className="rounded-lg border border-[var(--line)] bg-white p-4 text-sm font-semibold text-[var(--muted)]">This plan has no places yet.</p>
        ) : (
          groupedItems.map(([dayNumber, items]) => (
            <div key={dayNumber} className="grid gap-3">
              <h2 className="text-xl font-black text-slate-950">Day {dayNumber}</h2>
              {items.map((item) => (
                <article key={item.id} className="rounded-lg border border-[var(--line)] bg-white p-4 shadow-[0_10px_24px_rgba(47,116,232,0.06)] sm:p-5">
                  <div className="flex gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--chip)] text-sm font-black text-[var(--accent-deep)] ring-1 ring-[var(--line)]">{item.sort_order}</span>
                    <div className="min-w-0 flex-1">
                      <button type="button" onClick={() => navigateToPath(`/places/${encodeURIComponent(item.place.slug)}`)} className="text-left text-lg font-black leading-tight text-slate-950 hover:text-[var(--accent-deep)]">
                        {item.place.name}
                      </button>
                      <p className="mt-1 text-sm font-bold text-[var(--muted)]">{[item.place.city || item.place.area, item.place.category].filter(Boolean).join(' · ') || 'GalaTayo place'}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-black text-slate-700">
                        {item.time_label ? <span className="rounded-full bg-slate-50 px-2.5 py-1 ring-1 ring-[var(--line)]">{item.time_label}</span> : null}
                        {item.estimated_minutes ? <span className="rounded-full bg-slate-50 px-2.5 py-1 ring-1 ring-[var(--line)]">{item.estimated_minutes} min</span> : null}
                      </div>
                      {item.notes ? <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">{item.notes}</p> : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ))
        )}
      </section>
    </div>
  )
}

function GalaPlansPage({ mode = 'list', planId = null, session = null }: GalaPlansPageProps) {
  return (
    <PageShell>
      {mode !== 'list' && mode !== 'liked' ? (
        <button type="button" onClick={() => navigateToPath('/gala-plans')} className="w-fit text-sm font-black text-[var(--accent-deep)]">
          Back to My Gala Plans
        </button>
      ) : null}
      {mode === 'list' ? <ListPage session={session} /> : null}
      {mode === 'liked' ? <ListPage session={session} liked /> : null}
      {mode === 'new' ? <PlanForm session={session} /> : null}
      {mode === 'edit' && planId ? <PlanForm session={session} planId={planId} /> : null}
      {mode === 'detail' && planId ? <DetailPage planId={planId} session={session} /> : null}
    </PageShell>
  )
}

export default GalaPlansPage
