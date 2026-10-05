import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowsDownUp } from '@phosphor-icons/react/dist/csr/ArrowsDownUp'
import { Check } from '@phosphor-icons/react/dist/csr/Check'
import { CloudRain } from '@phosphor-icons/react/dist/csr/CloudRain'
import { FilmSlate as Clapperboard } from '@phosphor-icons/react/dist/csr/FilmSlate'
import { Minus } from '@phosphor-icons/react/dist/csr/Minus'
import { PencilSimple } from '@phosphor-icons/react/dist/csr/PencilSimple'
import { Plus } from '@phosphor-icons/react/dist/csr/Plus'
import { PaperPlaneTilt as Send } from '@phosphor-icons/react/dist/csr/PaperPlaneTilt'
import { Sparkle as Sparkles } from '@phosphor-icons/react/dist/csr/Sparkle'
import { SunHorizon as Sunset } from '@phosphor-icons/react/dist/csr/SunHorizon'
import { Tree as Trees } from '@phosphor-icons/react/dist/csr/Tree'
import { GuestAuthPrompt } from '../components/GuestAuthPrompt'
import AskAiUsagePill from '../components/AskAiUsagePill'
import PlanRouteMap from '../components/gala-plan/PlanRouteMap'
import PlanTimeline, { type TimelineStop } from '../components/gala-plan/PlanTimeline'
import { Button, KeyValue, Page, Skeleton } from '../components/ui'
import { useAppUser } from '../context/AppUserContext'
import {
  composeGalaPlanDescription,
  createGalaPlan,
  draftGalaPlanWithAi,
  GalaPlanAiError,
  type GalaPlanAiDraft,
} from '../utils/galaPlansApi'
import { estimatePerHead, formatPeso, formatTime24, getPlanLegs, type TravelLeg } from '../utils/galaPlanTrip'
import { navigateToPath, replaceWithPath } from '../utils/navigation'
import '../design/plans.css'

type Status = 'idle' | 'building' | 'ready' | 'saving' | 'error'

const examplePrompts = [
  { icon: CloudRain, title: 'Rainy Saturday in Makati, indoor, ₱1k each', prompt: 'Rainy Saturday in Makati for 4, indoor spots only, ₱1,000 each' },
  { icon: Sunset, title: 'Sunday in Manila, museums to sunset', prompt: 'Relaxed Sunday in Manila for 4, ₱800 each, ending at sunset' },
  { icon: Clapperboard, title: 'BGC date night, ₱2k', prompt: 'Dinner and a movie in BGC for two, ₱2,000 budget' },
  { icon: Trees, title: 'Barkada day in QC for 6', prompt: 'Barkada day in Quezon City for 6: a park, then a food trip, ₱600 each' },
]

function describeCommute(legs: Array<TravelLeg | null>) {
  const known = legs.filter((leg): leg is TravelLeg => leg !== null)
  if (known.length === 0) return 'Depends on where you start'
  const walk = known.filter((leg) => leg.mode === 'walk').reduce((sum, leg) => sum + leg.minutes, 0)
  const rides = known.filter((leg) => leg.mode === 'ride')
  if (rides.length === 0) return `${walk} min walking total · no Grab needed`
  const rideMinutes = rides.reduce((sum, leg) => sum + leg.minutes, 0)
  const fare = rides.reduce((sum, leg) => sum + leg.fare, 0)
  return [walk ? `${walk} min walk` : null, `${rideMinutes} min Grab (~${formatPeso(fare)})`].filter(Boolean).join(' · ')
}

/** Tara's side of the chat: coral sparkle avatar, then the reply. */
function TaraSays({ children, label = 'Tara' }: { children: ReactNode; label?: string }) {
  return (
    <div className="g-chat-tara">
      <span className="g-chat-av" aria-hidden="true">
        <Sparkles weight="fill" />
      </span>
      <div className="min-w-0">
        <p className="sr-only">{label}:</p>
        {children}
      </div>
    </div>
  )
}

function MeSays({ text, onEdit }: { text: string; onEdit?: () => void }) {
  return (
    <div className="g-chat-me">
      <div>
        <p className="sr-only">You:</p>
        <p className="min-w-0 flex-1">{text}</p>
        {onEdit ? (
          <Button variant="text" size="sm" iconOnly className="shrink-0 no-underline" onClick={onEdit} aria-label="Edit prompt">
            <PencilSimple aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function DraftSkeleton() {
  return (
    <div aria-hidden="true" className="mt-4">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="mt-4 h-[200px] w-full rounded-[var(--r-3)]" />
      {[0, 1, 2].map((index) => (
        <div key={index} className="mt-5 flex items-start gap-3">
          <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-2 h-3 w-1/3" />
          </div>
          <Skeleton className="h-[76px] w-[76px] shrink-0 rounded-[var(--r-2)]" />
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
  const [usage, setUsage] = useState<{ remaining: number; limit: number } | null>(null)
  const [isSignInOpen, setIsSignInOpen] = useState(false)
  const [isDailyLimit, setIsDailyLimit] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [submittedPrompt, setSubmittedPrompt] = useState('')
  const autoStartedRef = useRef(false)
  const promptRef = useRef<HTMLTextAreaElement | null>(null)

  const stops = useMemo(() => draft?.stops ?? [], [draft])
  const legs = useMemo(() => getPlanLegs(stops), [stops])
  const perHead = useMemo(() => estimatePerHead(stops, groupSize), [stops, groupSize])
  const timelineStops = useMemo<TimelineStop[]>(
    () => stops.map((stop) => ({ key: stop.place_id, time: stop.time ? formatTime24(stop.time) : null, minutes: stop.minutes, note: stop.note || null, place: stop.place })),
    [stops],
  )

  const build = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || status === 'building') return

    setStatus('building')
    setSubmittedPrompt(trimmed)
    setError(null)
    setIsDailyLimit(false)
    setIsEditing(false)
    try {
      const result = await draftGalaPlanWithAi(trimmed, session)
      setDraft(result.draft)
      setGroupSize(result.draft.group_size)
      setUsage(result.usage ? { remaining: result.usage.remaining, limit: result.usage.dailyLimit } : null)
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

  const startOver = () => {
    setDraft(null)
    setPrompt('')
    setError(null)
    setIsEditing(false)
    setStatus('idle')
    requestAnimationFrame(() => promptRef.current?.focus())
  }

  const editPrompt = () => {
    setDraft(null)
    setPrompt(submittedPrompt)
    setError(null)
    setIsEditing(false)
    setStatus('idle')
    requestAnimationFrame(() => promptRef.current?.focus())
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
  const firstTime = stops[0]?.time
  const lastTime = stops[stops.length - 1]?.time
  const timeRange = firstTime && lastTime && firstTime !== lastTime ? `${formatTime24(firstTime)} – ${formatTime24(lastTime)}` : firstTime ? formatTime24(firstTime) : null
  const showComposer = !draft && status !== 'building'

  return (
    <Page narrow>
      <GuestAuthPrompt variant="add-plan" mode="modal" isOpen={isSignInOpen} onClose={() => setIsSignInOpen(false)} />

      <p className="g-ai-badge">
        <Sparkles aria-hidden="true" />
        Tara AI
      </p>
      <h1 className="g-h1 mt-2">Plan with AI</h1>

      <div className="mt-6 grid gap-5" aria-live="polite">
        {showComposer ? (
          <TaraSays>
            <p className="g-chat-say">Kumusta! Tell me the vibe, the area, your budget and who's coming. I'll map the whole day, then you can edit it and invite the barkada.</p>
          </TaraSays>
        ) : (
          <MeSays text={submittedPrompt} onEdit={status === 'building' ? undefined : editPrompt} />
        )}

        {status === 'building' ? (
          <TaraSays>
            <span className="g-typing" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <p className="g-sm g-mut mt-2">Building your draft…</p>
            <DraftSkeleton />
          </TaraSays>
        ) : null}

        {error ? (
          <TaraSays>
            <p role="alert" className="g-sm rounded-[var(--r-3)] bg-[var(--bad-soft)] px-4 py-3 text-[var(--bad)]">
              {error}
              {isDailyLimit && !session ? ' Log in to get more AI plans per day.' : ''}
            </p>
          </TaraSays>
        ) : null}

        {draft && status !== 'building' ? (
          <TaraSays>
            <p className="g-chat-say">Here's your draft. Reorder or drop stops with Edit, then save it.</p>
          </TaraSays>
        ) : null}
      </div>

      {showComposer ? (
        <>
          <form onSubmit={handleSubmit} className="g-ai mt-5">
            <label htmlFor="plan-with-ai-prompt" className="sr-only">
              Describe your gala
            </label>
            <textarea
              id="plan-with-ai-prompt"
              ref={promptRef}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void build(prompt)
                }
              }}
              maxLength={400}
              rows={3}
              placeholder="Chill Saturday for 6 in Makati, ₱1k each, indoor if rain"
            />
            <div className="g-ai-bar mt-3 min-h-11 justify-end gap-3">
              {usage ? <AskAiUsagePill usageStatus={usage} /> : null}
              <Button type="submit" variant="tara" iconOnly disabled={!prompt.trim()} aria-label="Build plan">
                <Send aria-hidden="true" />
              </Button>
            </div>
          </form>

          <section className="mt-8" aria-labelledby="plan-ai-ideas">
            <h2 id="plan-ai-ideas" className="g-h3">Try one of these</h2>
            <div className="g-sugg mt-3">
              {examplePrompts.map((example) => {
                const ExampleIcon = example.icon
                return (
                  <button
                    key={example.title}
                    type="button"
                    onClick={() => {
                      setPrompt(example.prompt)
                      void build(example.prompt)
                    }}
                  >
                    <ExampleIcon weight="duotone" aria-hidden="true" />
                    {example.title}
                  </button>
                )
              })}
            </div>
          </section>
        </>
      ) : null}

      {draft && status !== 'building' ? (
        <section className="mt-5 pb-20 lg:pb-0" aria-labelledby="plan-with-ai-draft-title">
          <div className="rounded-[var(--r-4)] border border-[var(--line-2)] p-4 md:p-5">
            <p className="g-eyebrow text-[var(--tara-ink)]!">Draft ready</p>
            <h2 id="plan-with-ai-draft-title" className="g-h2 mt-1.5">
              {draft.title}
            </h2>
            <p className="g-sm g-mut mt-1">{[dateLabel, timeRange].filter(Boolean).join(' · ')}</p>
            {draft.summary ? <p className="g-sm mt-2 leading-relaxed">{draft.summary}</p> : null}

            <div className="g-tstats mt-4" style={{ ['--n' as string]: 3 }}>
              <div className="g-tstat">
                <b>{stops.length}</b>
                <span>{stops.length === 1 ? 'stop' : 'stops'}</span>
              </div>
              <div className="g-tstat">
                <b>{formatPeso(perHead)}</b>
                <span>each, est.</span>
              </div>
              <div className="g-tstat">
                <b>{groupSize}</b>
                <span>{groupSize === 1 ? 'person' : 'people'}</span>
              </div>
            </div>

            <PlanRouteMap stops={timelineStops} className="mt-4" label="Route of your draft plan" />

            <div className="mt-5">
              <PlanTimeline
                stops={timelineStops}
                animate
                onMove={isEditing ? moveStop : undefined}
                onRemove={isEditing && stops.length > 2 ? removeStop : undefined}
              />
            </div>

            <hr className="g-sep mt-5" />
            <div className="mt-2">
              <KeyValue
                items={[
                  { label: 'Commute', value: describeCommute(legs) },
                  {
                    label: 'Group size',
                    value: (
                      <span className="inline-flex items-center gap-1">
                        <Button variant="soft" size="sm" iconOnly aria-label="Fewer people" onClick={() => setGroupSize((size) => Math.max(1, size - 1))}>
                          <Minus aria-hidden="true" />
                        </Button>
                        <span className="w-7 text-center">{groupSize}</span>
                        <Button variant="soft" size="sm" iconOnly aria-label="More people" onClick={() => setGroupSize((size) => Math.min(20, size + 1))}>
                          <Plus aria-hidden="true" />
                        </Button>
                      </span>
                    ),
                  },
                  { label: 'Cost', value: `${formatPeso(perHead)}/head · rides split by ${groupSize}` },
                ]}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3">
            <p className="g-xs g-fnt min-w-0 flex-1">Gawa ng AI ang plano na ito. Times, fares and prices are estimates; check before you go.</p>
            <Button variant="text" size="sm" onClick={startOver}>
              Start over
            </Button>
          </div>

          <div className="g-sticky-bar is-inline">
            <div className="mx-auto flex max-w-[720px] gap-3">
              <Button variant="soft" className="flex-1" onClick={() => setIsEditing((value) => !value)} aria-pressed={isEditing}>
                {isEditing ? <Check /> : <ArrowsDownUp />}
                {isEditing ? 'Done' : 'Edit stops'}
              </Button>
              <Button variant="tara" className="flex-[2]" onClick={() => void save()} loading={status === 'saving'} disabled={status === 'saving'}>
                {session ? 'Save & invite' : 'Log in to save'}
              </Button>
            </div>
          </div>
        </section>
      ) : null}
    </Page>
  )
}

export default PlanWithAiPage
