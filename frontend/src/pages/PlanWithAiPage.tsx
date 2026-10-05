import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, Check, ChevronRight, CloudRain, Clapperboard, Minus, Plus, Sunset, Trees, X } from 'lucide-react'
import { GuestAuthPrompt } from '../components/GuestAuthPrompt'
import AskAiUsagePill from '../components/AskAiUsagePill'
import InternalLink from '../components/InternalLink'
import GtMap, { type MapPoint } from '../components/ui/GtMap'
import { Button, KeyValue, Page, SectionHead, Skeleton, Tag } from '../components/ui'
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
    <div className="g-draft" aria-hidden="true">
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="mt-3 h-3 w-1/3" />
      {[0, 1, 2].map((index) => (
        <div key={index} className="mt-4 flex gap-3">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 flex-1" />
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
  const autoStartedRef = useRef(false)
  const promptRef = useRef<HTMLTextAreaElement | null>(null)

  const stops = useMemo(() => draft?.stops ?? [], [draft])
  const legs = useMemo(() => getPlanLegs(stops), [stops])
  const perHead = useMemo(() => estimatePerHead(stops, groupSize), [stops, groupSize])
  const mapPoints = useMemo<MapPoint[]>(
    () =>
      stops.flatMap((stop, index) =>
        stop.place.latitude != null && stop.place.longitude != null
          ? [{ id: stop.place_id, lat: stop.place.latitude, lng: stop.place.longitude, label: String(index + 1), kind: 'number' as const }]
          : [],
      ),
    [stops],
  )

  const build = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || status === 'building') return

    setStatus('building')
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
    promptRef.current?.focus()
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
  const timeRange = firstTime && lastTime ? `${formatTime24(firstTime)} – ${formatTime24(lastTime)}` : null

  return (
    <Page narrow>
      <GuestAuthPrompt variant="add-plan" mode="modal" isOpen={isSignInOpen} onClose={() => setIsSignInOpen(false)} />

      <p className="g-eyebrow">New plan</p>
      <h1 className="g-h1 mt-2">Plan with AI</h1>
      <p className="g-mut mt-2">Describe the gala. You get a draft you can edit, not a chat.</p>

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
        <div className="g-ai-bar mt-3 min-h-9 justify-end gap-3">
          {usage ? <AskAiUsagePill usageStatus={usage} /> : null}
          {prompt.trim() || status === 'building' ? (
            <Button
              type="submit"
              variant="ink"
              size="sm"
              iconOnly
              loading={status === 'building'}
              disabled={status === 'building'}
              aria-label={draft ? 'Rebuild plan' : 'Build plan'}
            >
              <ArrowRight aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </form>

      {!draft && status !== 'building' ? (
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
        <section aria-live="polite">
          <SectionHead title="Your draft" sub="Building your plan…" action={<span className="g-live">Thinking</span>} />
          <DraftSkeleton />
        </section>
      ) : null}

      {draft && status !== 'building' ? (
        <section>
          <SectionHead
            title="Your draft"
            sub={`${dateLabel} · ${stops.length} stops`}
            action={<span className="g-live shrink-0">Ready</span>}
          />

          <div className="g-draft">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="g-h3 min-w-0">{draft.title}</h2>
              <b className="g-sm shrink-0">{formatPeso(perHead)}/head</b>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Tag>Fits {groupSize}</Tag>
              <Tag>{dateLabel}</Tag>
              {timeRange ? <Tag>{timeRange}</Tag> : null}
            </div>
            {draft.summary ? <p className="g-sm g-mut mt-3">{draft.summary}</p> : null}

            <ol className="mt-3">
              {stops.map((stop, index) => {
                const legIn = index > 0 ? legs[index - 1] : null
                const meta = [
                  legIn ? describeLeg(legIn) : stop.place.category,
                  stop.minutes ? `${stop.minutes} min` : null,
                  stop.place.budget_min != null ? formatPeso(stop.place.budget_min) : null,
                ].filter(Boolean)
                const href = getCanonicalPlacePath({ areaSlug: resolveAreaMeta(stop.place).slug, placeSlug: stop.place.slug })

                return (
                  <li
                    key={stop.place_id}
                    className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-start gap-2 py-2 text-[14px] motion-safe:animate-[g-up_320ms_var(--ease-g)_both]"
                    style={{ animationDelay: `${index * 70}ms` }}
                  >
                    <b className="pt-0.5">{stop.time ? formatTime24(stop.time) : `Stop ${index + 1}`}</b>
                    <div className="min-w-0">
                      <InternalLink href={href} className="hover:underline">
                        {stop.place.name}
                      </InternalLink>
                      {meta.length ? <span className="g-mut"> · {meta.join(' · ')}</span> : null}
                      {stop.note ? <p className="g-sm g-mut mt-0.5 line-clamp-2">{stop.note}</p> : null}
                    </div>
                    {isEditing ? (
                      <div className="flex">
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
                    ) : (
                      <span />
                    )}
                  </li>
                )
              })}
            </ol>

            <hr className="g-sep mt-3" />
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

          {mapPoints.length > 0 ? <GtMap points={mapPoints} route className="mt-4" label="Route of your draft plan" /> : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button variant="tara" onClick={() => void save()} loading={status === 'saving'} disabled={status === 'saving'}>
              <Check aria-hidden="true" />
              {session ? 'Save as plan' : 'Log in to save'}
            </Button>
            <Button variant="soft" onClick={() => setIsEditing((value) => !value)} aria-pressed={isEditing}>
              {isEditing ? 'Done editing' : 'Edit stops'}
            </Button>
            <Button variant="text" onClick={startOver}>
              Start over
            </Button>
          </div>
          <p className="g-xs g-fnt mt-3">Gawa ng AI ang plano na ito. Times, fares and prices are estimates; check before you go.</p>
        </section>
      ) : null}
    </Page>
  )
}

export default PlanWithAiPage
