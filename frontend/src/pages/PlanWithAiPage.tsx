import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMinus, faPlus, faRotateRight, faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons'
import MinimalBackNav from '../components/navigation/MinimalBackNav'
import PlanRouteMap from '../components/gala-plan/PlanRouteMap'
import PlanTimeline, { type TimelineStop } from '../components/gala-plan/PlanTimeline'
import { GuestAuthPrompt } from '../components/GuestAuthPrompt'
import { useAppUser } from '../context/AppUserContext'
import {
  composeGalaPlanDescription,
  createGalaPlan,
  draftGalaPlanWithAi,
  GalaPlanAiError,
  type GalaPlanAiDraft,
} from '../utils/galaPlansApi'
import { estimatePerHead, formatPeso, formatTime24 } from '../utils/galaPlanTrip'
import { navigateToPath, replaceWithPath } from '../utils/navigation'

type Status = 'idle' | 'building' | 'ready' | 'saving' | 'error'

const examplePrompts = [
  'Chill Sunday sa Manila, 4 kami, ₱800 each, may sunset',
  'Date sa BGC, ₱2k total, dinner tapos sine',
  'Rainy day indoor gala sa Makati, museum + cafe',
]

function toTimelineStops(draft: GalaPlanAiDraft): TimelineStop[] {
  return draft.stops.map((stop) => ({
    key: stop.place_id,
    time: stop.time ? formatTime24(stop.time) : null,
    minutes: stop.minutes,
    note: stop.note,
    place: stop.place,
  }))
}

function BuildingState() {
  return (
    <div className="space-y-3" aria-live="polite">
      <p className="font-display text-[20px] italic text-[var(--text-main)]">Binubuo ang gala mo…</p>
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex gap-3.5">
          <span className="mt-3 h-8 w-8 shrink-0 animate-pulse rounded-full bg-[var(--primary-soft)]" />
          <span className="h-[88px] flex-1 animate-pulse rounded-[16px] bg-[var(--home-skeleton-base)]" />
        </div>
      ))}
    </div>
  )
}

function PlanWithAiPage({ initialPrompt }: { initialPrompt: string }) {
  const { session } = useAppUser()
  const [prompt, setPrompt] = useState(initialPrompt)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<GalaPlanAiDraft | null>(null)
  const [groupSize, setGroupSize] = useState(1)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [isSignInOpen, setIsSignInOpen] = useState(false)
  const [isDailyLimit, setIsDailyLimit] = useState(false)
  const autoStartedRef = useRef(false)

  const stops = useMemo(() => (draft ? toTimelineStops(draft) : []), [draft])
  const perHead = useMemo(() => estimatePerHead(stops, groupSize), [stops, groupSize])

  const build = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || status === 'building') return

    setStatus('building')
    setError(null)
    setIsDailyLimit(false)
    try {
      const result = await draftGalaPlanWithAi(trimmed, session)
      setDraft(result.draft)
      setGroupSize(result.draft.group_size)
      setRemaining(result.usage?.remaining ?? null)
      setStatus('ready')
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : 'Plan with AI failed. Try again.')
      setIsDailyLimit(buildError instanceof GalaPlanAiError && buildError.status === 429)
      setStatus('error')
    }
  }

  useEffect(() => {
    if (autoStartedRef.current || !initialPrompt.trim()) return
    autoStartedRef.current = true
    replaceWithPath('/plan-with-ai')
    void build(initialPrompt)
    // Runs once for the prompt passed in from Home.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    void build(prompt)
  }

  const moveStop = (index: number, direction: -1 | 1) => {
    if (!draft) return
    const next = [...draft.stops]
    const [moved] = next.splice(index, 1)
    next.splice(index + direction, 0, moved)
    setDraft({ ...draft, stops: next })
  }

  const removeStop = (index: number) => {
    if (!draft || draft.stops.length <= 1) return
    setDraft({ ...draft, stops: draft.stops.filter((_, stopIndex) => stopIndex !== index) })
  }

  const save = async () => {
    if (!draft) return
    if (!session) {
      setIsSignInOpen(true)
      return
    }

    setStatus('saving')
    try {
      const { plan } = await createGalaPlan(
        {
          title: draft.title,
          description: composeGalaPlanDescription({
            description: draft.summary,
            dateMode: draft.date ? 'date' : 'anytime',
            date: draft.date ?? '',
          }),
          visibility: 'private',
          items: draft.stops.map((stop, index) => ({
            place_id: stop.place_id,
            day_number: 1,
            sort_order: index + 1,
            time_label: stop.time ? formatTime24(stop.time) : null,
            estimated_minutes: stop.minutes,
            notes: stop.note || null,
          })),
        },
        session,
      )
      navigateToPath(`/gala-plans/${plan.id}`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the plan. Try again.')
      setStatus('ready')
    }
  }

  const dateLabel = draft?.date
    ? new Date(`${draft.date}T00:00:00`).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })
    : 'Any day'

  return (
    <main className="min-h-[100dvh] bg-[var(--bg)] pb-[calc(env(safe-area-inset-bottom,0px)+10rem)] text-[var(--text)] lg:pb-16">
      <GuestAuthPrompt variant="add-plan" mode="modal" isOpen={isSignInOpen} onClose={() => setIsSignInOpen(false)} />

      <div className="mx-auto w-full max-w-[1180px] px-4 pt-5 sm:px-6 lg:px-8 lg:pt-8">
        <MinimalBackNav to="/home" preferHistory />

        <header className="mt-4 max-w-[720px]">
          <p className="font-data inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--primary)]">
            <FontAwesomeIcon icon={faWandMagicSparkles} className="h-3 w-3" />
            Plan with AI
          </p>
          <h1 className="mt-1.5 text-[30px] font-medium leading-[1.1] text-[var(--text-main)] sm:text-[38px]">
            Isang sentence, <em className="text-[var(--primary)]">buong araw</em> na gala.
          </h1>
        </header>

        <form onSubmit={handleSubmit} className="mt-5 max-w-[720px]">
          <label htmlFor="plan-with-ai-prompt" className="sr-only">Describe your gala</label>
          <div className="flex items-end gap-2 rounded-[20px] bg-[var(--ink)] p-2 pl-4">
            <textarea
              id="plan-with-ai-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void build(prompt)
                }
              }}
              maxLength={400}
              rows={2}
              placeholder="Saan, kailan, ilan kayo, magkano?"
              className="font-display min-h-[52px] flex-1 resize-none bg-transparent py-2 text-[17px] italic leading-snug text-[var(--bg)] outline-none placeholder:text-[var(--bg)] placeholder:opacity-50"
            />
            <button
              type="submit"
              disabled={status === 'building' || !prompt.trim()}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-[var(--primary)] px-4 text-[14px] font-semibold text-white transition-opacity disabled:opacity-50"
            >
              {draft ? <FontAwesomeIcon icon={faRotateRight} className="h-3.5 w-3.5" /> : null}
              {draft ? 'Rebuild' : 'Build plan'}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {examplePrompts.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setPrompt(example)
                  void build(example)
                }}
                className="rounded-full border border-[var(--line)] px-3 py-1.5 text-left text-[12px] text-[var(--text-strong)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text-main)]"
              >
                {example}
              </button>
            ))}
          </div>
        </form>

        {error ? (
          <div role="alert" className="mt-5 max-w-[720px] rounded-[16px] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3 text-[14px] text-[var(--text-main)]">
            {error}
            {isDailyLimit && !session ? ' Sign in to get more AI requests per day.' : ''}
          </div>
        ) : null}

        <div className="mt-8">
          {status === 'building' ? <BuildingState /> : null}

          {draft && status !== 'building' ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-start lg:gap-10">
              <section className="min-w-0">
                <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--line)] pb-4">
                  <div className="min-w-0">
                    <h2 className="text-[26px] font-medium leading-tight text-[var(--text-main)]">{draft.title}</h2>
                    <p className="font-data mt-1 text-[12px] text-[var(--text-muted)]">
                      {dateLabel} · {stops.length} stops{remaining !== null ? ` · ${remaining} AI requests left today` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-[26px] leading-none text-[var(--text-main)]">{formatPeso(perHead)}</p>
                    <p className="font-data mt-1 text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">est. per head</p>
                  </div>
                </div>

                {draft.summary ? <p className="mt-4 text-[14px] leading-6 text-[var(--text-strong)]">{draft.summary}</p> : null}

                <div className="mt-4 flex items-center gap-3">
                  <span className="text-[13px] text-[var(--text-muted)]">Ilan kayo?</span>
                  <div className="flex items-center rounded-full border border-[var(--line)]">
                    <button type="button" aria-label="Fewer people" onClick={() => setGroupSize((size) => Math.max(1, size - 1))} className="flex h-9 w-9 items-center justify-center text-[var(--text-strong)]">
                      <FontAwesomeIcon icon={faMinus} className="h-3 w-3" />
                    </button>
                    <span className="font-data w-8 text-center text-[14px] font-medium text-[var(--text-main)]">{groupSize}</span>
                    <button type="button" aria-label="More people" onClick={() => setGroupSize((size) => Math.min(20, size + 1))} className="flex h-9 w-9 items-center justify-center text-[var(--text-strong)]">
                      <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
                    </button>
                  </div>
                  <span className="text-[12px] text-[var(--text-muted)]">Rides are split across the group.</span>
                </div>

                <div className="mt-4">
                  <PlanTimeline stops={stops} onMove={moveStop} onRemove={stops.length > 2 ? removeStop : undefined} />
                </div>

                <p className="mt-3 text-[12px] text-[var(--text-muted)]">
                  Gawa ng AI ang plano na ito. Times, fares and prices are estimates; check before you go.
                </p>
              </section>

              <aside className="min-w-0 lg:sticky lg:top-[calc(var(--site-header-h)+1.5rem)]">
                <PlanRouteMap stops={stops} className="h-[260px] sm:h-[320px] lg:h-[420px]" />
                <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+4rem)] z-[5500] border-t border-[var(--line)] bg-[var(--surface-overlay)] px-4 py-3 backdrop-blur-xl lg:static lg:mt-4 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
                  <div className="mx-auto flex max-w-[720px] items-center gap-3">
                    <div className="min-w-0 lg:hidden">
                      <p className="font-display text-[20px] leading-none text-[var(--text-main)]">{formatPeso(perHead)}</p>
                      <p className="font-data mt-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">per head</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void save()}
                      disabled={status === 'saving'}
                      className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-[var(--primary)] px-5 text-[15px] font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-60"
                    >
                      {status === 'saving' ? 'Saving…' : session ? 'Save as Gala Plan' : 'Sign in to save'}
                    </button>
                  </div>
                </div>
              </aside>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  )
}

export default PlanWithAiPage
