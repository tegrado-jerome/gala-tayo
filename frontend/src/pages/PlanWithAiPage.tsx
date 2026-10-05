import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowDown } from '@phosphor-icons/react/dist/csr/ArrowDown'
import { ArrowUp } from '@phosphor-icons/react/dist/csr/ArrowUp'
import { CaretRight as ChevronRight } from '@phosphor-icons/react/dist/csr/CaretRight'
import { CloudRain } from '@phosphor-icons/react/dist/csr/CloudRain'
import { FilmSlate as Clapperboard } from '@phosphor-icons/react/dist/csr/FilmSlate'
import { Minus } from '@phosphor-icons/react/dist/csr/Minus'
import { PencilLine as PenLine } from '@phosphor-icons/react/dist/csr/PencilLine'
import { Plus } from '@phosphor-icons/react/dist/csr/Plus'
import { PaperPlaneTilt as Send } from '@phosphor-icons/react/dist/csr/PaperPlaneTilt'
import { Sparkle as Sparkles } from '@phosphor-icons/react/dist/csr/Sparkle'
import { SunHorizon as Sunset } from '@phosphor-icons/react/dist/csr/SunHorizon'
import { Tree as Trees } from '@phosphor-icons/react/dist/csr/Tree'
import { X } from '@phosphor-icons/react/dist/csr/X'
import { GuestAuthPrompt } from '../components/GuestAuthPrompt'
import AskAiUsagePill from '../components/AskAiUsagePill'
import InternalLink from '../components/InternalLink'
import GtMap, { type MapPoint } from '../components/ui/GtMap'
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
import { getCanonicalPlacePath } from '../utils/routes'
import { resolveAreaMeta } from '../utils/seo'

type Status = 'idle' | 'building' | 'ready' | 'saving' | 'error'

const examplePrompts = [
  { icon: CloudRain, title: 'Rainy Saturday in Makati', detail: 'Indoor, ₱1k each', prompt: 'Rainy Saturday in Makati for 4, indoor spots only, ₱1,000 each' },
  { icon: Sunset, title: 'Sunday in Manila', detail: 'Museums to sunset, ₱800 each', prompt: 'Relaxed Sunday in Manila for 4, ₱800 each, ending at sunset' },
  { icon: Clapperboard, title: 'BGC date night', detail: 'Dinner and a movie for two, ₱2k', prompt: 'Dinner and a movie in BGC for two, ₱2,000 budget' },
  { icon: Trees, title: 'Barkada day in QC', detail: 'Parks and a food trip for 6, ₱600 each', prompt: 'Barkada day in Quezon City for 6: a park, then a food trip, ₱600 each' },
]

function describeLeg(leg: TravelLeg) {
  return leg.mode === 'walk' ? `walk ${leg.minutes} min` : `Grab ~${leg.minutes} min`
}

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

function DraftSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="mt-4 h-[200px] w-full rounded-[var(--r-3)]" />
      {[0, 1, 2].map((index) => (
        <div key={index} className="mt-4 flex items-center gap-3">
          <Skeleton className="h-[52px] w-[52px] shrink-0" />
          <div className="flex-1">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-2 h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

function PromptBubble({ text, onEdit }: { text: string; onEdit?: () => void }) {
  return (
    <div className="mt-6 flex items-start gap-2 rounded-[var(--r-3)] bg-[var(--fill)] py-3 pr-2 pl-4">
      <p className="min-w-0 flex-1 py-1 text-[17px] leading-[1.4] font-medium [font-family:var(--font-display)] break-words">{text}</p>
      {onEdit ? (
        <Button variant="text" size="sm" iconOnly className="shrink-0" onClick={onEdit} aria-label="Edit prompt">
          <PenLine aria-hidden="true" />
        </Button>
      ) : null}
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
  const mapPoints = useMemo<MapPoint[]>(
    () =>
      stops.flatMap((stop, index) =>
        stop.place.latitude != null && stop.place.longitude != null
          ? [{ id: stop.place_id, lat: stop.place.latitude, lng: stop.place.longitude, label: String(index + 1), kind: 'number' as const, imageUrl: stop.place.image_url ?? null }]
          : [],
      ),
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
      {showComposer ? <p className="g-mut mt-2">One line in, a mapped day out. Edit it, then invite the barkada.</p> : null}

      {showComposer ? (
        <form onSubmit={handleSubmit} className="g-ai mt-6">
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
      ) : (
        <PromptBubble text={submittedPrompt} onEdit={status === 'building' ? undefined : editPrompt} />
      )}

      {showComposer ? (
        <section className="mt-8">
          <h2 className="g-h3">Try one of these</h2>
          <div className="g-group mt-3">
            {examplePrompts.map((example) => {
              const ExampleIcon = example.icon
              return (
                <button
                  key={example.title}
                  type="button"
                  className="g-group-row py-3"
                  onClick={() => {
                    setPrompt(example.prompt)
                    void build(example.prompt)
                  }}
                >
                  <ExampleIcon aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block">{example.title}</span>
                    <span className="g-sm g-mut block truncate">{example.detail}</span>
                  </span>
                  <span className="g-group-end">
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      {error ? (
        <p role="alert" className="g-sm mt-4 rounded-[var(--r-3)] bg-[var(--bad-soft)] px-4 py-3 text-[var(--bad)]">
          {error}
          {isDailyLimit && !session ? ' Log in to get more AI plans per day.' : ''}
        </p>
      ) : null}

      {status === 'building' ? (
        <section className="mt-6" aria-live="polite">
          <p className="g-eyebrow text-[var(--tara-ink)]!">Building your draft…</p>
          <div className="mt-3">
            <DraftSkeleton />
          </div>
        </section>
      ) : null}

      {draft && status !== 'building' ? (
        <section className="mt-6 pb-16 lg:pb-0" aria-labelledby="plan-with-ai-draft-title">
          <p className="g-eyebrow text-[var(--tara-ink)]!">Draft ready · {formatPeso(perHead)}/head</p>
          <h2 id="plan-with-ai-draft-title" className="g-h2 mt-1.5">
            {draft.title}
          </h2>
          <p className="g-sm g-mut mt-1">{[dateLabel, timeRange, `${stops.length} ${stops.length === 1 ? 'stop' : 'stops'}`, `fits ${groupSize}`].filter(Boolean).join(' · ')}</p>
          {draft.summary ? <p className="g-sm g-mut mt-2">{draft.summary}</p> : null}

          {mapPoints.length > 0 ? <GtMap points={mapPoints} route night className="mt-4" label="Route of your draft plan" /> : null}

          <ol className="mt-4 flex flex-col">
            {stops.map((stop, index) => {
              const legIn = index > 0 ? legs[index - 1] : null
              const meta = [
                stop.time ? formatTime24(stop.time) : `Stop ${index + 1}`,
                stop.minutes ? `${stop.minutes} min` : null,
                stop.place.budget_min != null ? formatPeso(stop.place.budget_min) : null,
              ].filter(Boolean)
              const href = getCanonicalPlacePath({ areaSlug: resolveAreaMeta(stop.place).slug, placeSlug: stop.place.slug })

              return (
                <li key={stop.place_id} className="motion-safe:animate-[g-up_320ms_var(--ease-g)_both]" style={{ animationDelay: `${index * 70}ms` }}>
                  {legIn ? <p className="g-xs g-fnt py-0.5 pl-16">{describeLeg(legIn)}</p> : null}
                  <div className="flex items-center gap-3 py-1.5">
                    <span className="relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-[var(--r-2)] bg-[var(--fill)]">
                      <span className="absolute inset-0 grid place-items-center font-semibold text-[var(--ink-2)] [font-family:var(--font-display)]" aria-hidden="true">
                        {index + 1}
                      </span>
                      {stop.place.image_url ? <img src={stop.place.image_url} alt="" loading="lazy" decoding="async" className="relative h-full w-full object-cover" onError={(event) => event.currentTarget.remove()} /> : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <InternalLink href={href} className="block truncate text-[15px] font-semibold hover:underline">
                        {stop.place.name}
                      </InternalLink>
                      <p className="g-xs g-mut mt-0.5 truncate">{meta.join(' · ')}</p>
                      {stop.note ? <p className="g-xs g-fnt mt-0.5 line-clamp-2">{stop.note}</p> : null}
                    </div>
                    {isEditing ? (
                      <div className="flex shrink-0">
                        <Button variant="text" size="sm" iconOnly onClick={() => moveStop(index, -1)} disabled={index === 0} aria-label={`Move ${stop.place.name} earlier`}>
                          <ArrowUp aria-hidden="true" />
                        </Button>
                        <Button variant="text" size="sm" iconOnly onClick={() => moveStop(index, 1)} disabled={index === stops.length - 1} aria-label={`Move ${stop.place.name} later`}>
                          <ArrowDown aria-hidden="true" />
                        </Button>
                        {stops.length > 2 ? (
                          <Button variant="text" size="sm" iconOnly onClick={() => removeStop(index)} aria-label={`Remove ${stop.place.name}`}>
                            <X aria-hidden="true" />
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ol>

          <hr className="g-sep mt-4" />
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

          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3">
            <p className="g-xs g-fnt min-w-0 flex-1">Gawa ng AI ang plano na ito. Times, fares and prices are estimates; check before you go.</p>
            <Button variant="text" size="sm" onClick={startOver}>
              Start over
            </Button>
          </div>

          <div className="fixed inset-x-0 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom,0px))] z-[5500] flex gap-3 border-t border-[var(--line-2)] bg-[var(--surface)] px-4 py-3 lg:sticky lg:bottom-0 lg:z-10 lg:mt-4 lg:px-0">
            <Button variant="soft" className="flex-1" onClick={() => setIsEditing((value) => !value)} aria-pressed={isEditing}>
              {isEditing ? 'Done' : 'Edit'}
            </Button>
            <Button variant="tara" className="flex-[2]" onClick={() => void save()} loading={status === 'saving'} disabled={status === 'saving'}>
              {session ? 'Save & invite' : 'Log in to save'}
            </Button>
          </div>
        </section>
      ) : null}
    </Page>
  )
}

export default PlanWithAiPage
