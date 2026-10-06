import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { CalendarCheck } from '@phosphor-icons/react/dist/csr/CalendarCheck'
import { Cards } from '@phosphor-icons/react/dist/csr/Cards'
import { Check } from '@phosphor-icons/react/dist/csr/Check'
import { Confetti } from '@phosphor-icons/react/dist/csr/Confetti'
import { Fire } from '@phosphor-icons/react/dist/csr/Fire'
import { HandsClapping } from '@phosphor-icons/react/dist/csr/HandsClapping'
import { Heart } from '@phosphor-icons/react/dist/csr/Heart'
import { LockSimple } from '@phosphor-icons/react/dist/csr/LockSimple'
import { MagnifyingGlass } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { MapPinPlus } from '@phosphor-icons/react/dist/csr/MapPinPlus'
import { Plus } from '@phosphor-icons/react/dist/csr/Plus'
import { Sparkle } from '@phosphor-icons/react/dist/csr/Sparkle'
import { Star } from '@phosphor-icons/react/dist/csr/Star'
import { X } from '@phosphor-icons/react/dist/csr/X'
import { useGuestAuthPrompt } from '../GuestAuthPrompt'
import { AvatarStack, Button, Panel, Tag, cx } from '../ui'
import { personAvatar, personName } from './BarkadaPanel'
import SwipeVote, { type SwipeCard } from './SwipeVote'
import { getPlacePhotoCandidates } from '../../data/placeIndexVisuals'
import { getApiUrl } from '../../utils/apiClient'
import {
  DATE_OPTIONS,
  KAILAN_NO,
  KAILAN_YES,
  SPOT_OPTIONS,
  SPOT_PASS,
  bestDate,
  formatDateChoice,
  kailanQuestion,
  lockedDate,
  rankSpots,
  spotQuestion,
  spotWinner,
  type DateChoice,
  type SpotChoice,
} from '../../utils/barkadaVotes'
import { createGalaPlanPoll, deleteGalaPlanPoll, voteGalaPlanPoll, type GalaPlanBarkada } from '../../utils/galaPlanBarkadaApi'
import {
  addPlaceToGalaPlan,
  composeGalaPlanDescription,
  getGalaPlan,
  parseGalaPlanDescription,
  updateGalaPlan,
  type GalaPlanDetail,
  type GalaPlanOwner,
} from '../../utils/galaPlansApi'
import { formatPeso } from '../../utils/galaPlanTrip'
import { fetchPlaceDetailsBatch } from '../../utils/placeDetailCache'
import type { PlaceDetail } from '../../types/appTypes'

type VoteProps = {
  plan: GalaPlanDetail
  session: Session | null | undefined
  onChange: (barkada: GalaPlanBarkada) => void
  onPlanChange: (plan: GalaPlanDetail) => void
}

const BURST_ICONS = [Confetti, Sparkle, HandsClapping, Star, Heart, Fire, Sparkle, Confetti]

/** A short ring of icons that floats out and fades. Replays whenever `play` changes; hidden from reduced motion. */
export function TaraBurst({ play }: { play: number }) {
  if (play === 0) return null
  return (
    <span key={play} className="g-burst" aria-hidden="true">
      {BURST_ICONS.map((Icon, index) => (
        <i key={index} style={{ ['--a' as string]: `${(360 / BURST_ICONS.length) * index - 90}deg` }}>
          <Icon weight="fill" />
        </i>
      ))}
    </span>
  )
}

function people(voters: GalaPlanOwner[]) {
  return voters.map((voter) => ({ id: voter.user_id, avatarUrl: personAvatar(voter), name: personName(voter) }))
}

function useVoteAction(session: Session | null | undefined) {
  const guestAuth = useGuestAuthPrompt()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  // One write at a time per panel, so quick taps can't land out of order.
  const run = async (key: string, action: (activeSession: Session | null | undefined) => Promise<void>, needsSignIn = true) => {
    if (busy) return
    if (needsSignIn && !session) {
      guestAuth.open('plan-rsvp', (guestSession) => void run(key, () => action(guestSession), false))
      return
    }
    setBusy(key)
    setError(null)
    try {
      await action(session)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(null)
    }
  }
  return { run, busy, error, setError, promptElement: guestAuth.promptElement }
}

async function removePolls(planId: string, pollIds: string[], session: Session | null | undefined) {
  let latest: GalaPlanBarkada | null = null
  for (const pollId of pollIds) latest = await deleteGalaPlanPoll(planId, pollId, session)
  return latest
}

/* ---------- Kailan? date poll ---------- */

function DateComposer({ plan, session, onChange, onCancel }: Omit<VoteProps, 'onPlanChange'> & { onCancel: () => void }) {
  const [rows, setRows] = useState([{ date: '', time: '' }, { date: '', time: '' }])
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const today = new Date().toLocaleDateString('en-CA')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const filled = rows.filter((row) => row.date)
    const keys = filled.map((row) => kailanQuestion(row.date, row.time || null))
    if (filled.length < DATE_OPTIONS.min) return setError(`Add at least ${DATE_OPTIONS.min} dates.`)
    if (new Set(keys).size !== keys.length) return setError('Two options are the same. Change one.')
    if (filled.some((row) => row.date < today)) return setError('Pick dates from today on.')

    setIsSaving(true)
    setError(null)
    try {
      for (const question of keys) {
        onChange(await createGalaPlanPoll(plan.id, { question, options: [{ label: KAILAN_YES }, { label: KAILAN_NO }] }, session))
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not post the dates.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 grid gap-2">
      {rows.map((row, index) => (
        <div key={index} className="g-when-row">
          <input
            type="date"
            className="g-input"
            min={today}
            value={row.date}
            aria-label={`Date option ${index + 1}`}
            onChange={(event) => setRows(rows.map((entry, i) => (i === index ? { ...entry, date: event.target.value } : entry)))}
          />
          <input
            type="time"
            className="g-input"
            value={row.time}
            aria-label={`Time for option ${index + 1} (optional)`}
            onChange={(event) => setRows(rows.map((entry, i) => (i === index ? { ...entry, time: event.target.value } : entry)))}
          />
          {rows.length > DATE_OPTIONS.min ? (
            <Button variant="text" size="sm" iconOnly aria-label={`Remove option ${index + 1}`} onClick={() => setRows(rows.filter((_, i) => i !== index))}>
              <X />
            </Button>
          ) : null}
        </div>
      ))}
      <p className="g-xs g-mut">Time is optional.</p>
      {error ? <p role="alert" className="g-hint is-error">{error}</p> : null}
      <div className="flex items-center gap-2">
        {rows.length < DATE_OPTIONS.max ? (
          <Button variant="soft" size="sm" onClick={() => setRows([...rows, { date: '', time: '' }])}>
            <Plus />
            Date
          </Button>
        ) : null}
        <Button variant="text" size="sm" className="ml-auto" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="ink" size="sm" loading={isSaving} disabled={isSaving}>Post dates</Button>
      </div>
    </form>
  )
}

export function KailanPoll({ plan, dates, session, onChange, onPlanChange }: VoteProps & { dates: DateChoice[] }) {
  const [isComposing, setIsComposing] = useState(false)
  const action = useVoteAction(session)
  const parsed = parseGalaPlanDescription(plan.description)
  const sorted = [...dates].sort((a, b) => `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`))
  const best = bestDate(dates)
  const locked = lockedDate(dates, parsed.dateMode === 'date' ? parsed.date : null)
  const voterCount = new Set(dates.flatMap((choice) => choice.yes.map((voter) => voter.user_id))).size

  if (dates.length === 0) {
    if (!plan.viewer_is_owner) return null
    return (
      <Panel as="section" aria-labelledby="kailan-title">
        <div className="flex items-start gap-3">
          <span className="g-vote-ic" aria-hidden="true"><CalendarCheck weight="light" /></span>
          <div className="min-w-0 flex-1">
            <h3 id="kailan-title" className="g-h3">Kailan?</h3>
            <p className="g-sm g-mut">Propose {DATE_OPTIONS.min} to {DATE_OPTIONS.max} dates. The barkada taps the ones they can make.</p>
          </div>
        </div>
        {isComposing ? (
          <DateComposer plan={plan} session={session} onChange={onChange} onCancel={() => setIsComposing(false)} />
        ) : (
          <Button variant="soft" size="sm" className="mt-3" onClick={() => setIsComposing(true)}>
            <Plus />
            Propose dates
          </Button>
        )}
      </Panel>
    )
  }

  const toggle = (choice: DateChoice) =>
    action.run(choice.pollId, async (activeSession) => {
      onChange(await voteGalaPlanPoll(plan.id, choice.pollId, choice.viewerYes ? choice.noOptionId : choice.yesOptionId, activeSession))
    })

  const lock = (choice: DateChoice) =>
    action.run('lock', async (activeSession) => {
      const description = composeGalaPlanDescription({ description: parsed.description, dateMode: 'date', date: choice.date, groupSize: parsed.groupSize })
      onPlanChange((await updateGalaPlan(plan.id, { description }, activeSession)).plan)
    })

  const clear = () =>
    action.run('clear', async (activeSession) => {
      const latest = await removePolls(plan.id, dates.map((choice) => choice.pollId), activeSession)
      if (latest) onChange(latest)
    })

  return (
    <Panel as="section" aria-labelledby="kailan-title">
      {action.promptElement}
      <div className="flex items-start gap-3">
        <span className="g-vote-ic" aria-hidden="true"><CalendarCheck weight="light" /></span>
        <div className="min-w-0 flex-1">
          <h3 id="kailan-title" className="g-h3">Kailan?</h3>
          <p className="g-sm g-mut">
            {locked ? `Locked: ${formatDateChoice(locked)}` : `Tap the dates you can make · ${voterCount} ${voterCount === 1 ? 'reply' : 'replies'}`}
          </p>
        </div>
      </div>
      <div className="mt-2" role="group" aria-label="Date options">
        {sorted.map((choice) => {
          const isBest = !locked && best?.pollId === choice.pollId
          const isLocked = locked?.pollId === choice.pollId
          return (
            <button
              key={choice.pollId}
              type="button"
              aria-pressed={choice.viewerYes}
              aria-busy={action.busy === choice.pollId || undefined}
              className={cx('g-when', choice.viewerYes && 'is-yes', (isBest || isLocked) && 'is-best')}
              onClick={() => void toggle(choice)}
            >
              <span className="g-when-tick" aria-hidden="true">{choice.viewerYes ? <Check weight="bold" /> : null}</span>
              <span className="min-w-0 flex-1">
                <span className="g-when-day">{formatDateChoice(choice)}</span>
                {isBest ? <Tag tone="tara" className="ml-2">Best date</Tag> : null}
                {isLocked ? (
                  <Tag tone="tara" className="ml-2">
                    <LockSimple weight="fill" />
                    Locked
                  </Tag>
                ) : null}
              </span>
              {choice.yes.length > 0 ? <AvatarStack people={people(choice.yes)} max={3} size={24} live /> : null}
              <span className="g-when-n">{choice.yes.length}<span className="sr-only"> can make it</span></span>
            </button>
          )
        })}
      </div>
      {action.error ? <p role="alert" className="g-hint is-error mt-2">{action.error}</p> : null}
      {plan.viewer_is_owner ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {best && best.pollId !== locked?.pollId ? (
            <Button variant="ink" size="sm" loading={action.busy === 'lock'} onClick={() => void lock(best)}>
              <LockSimple />
              Lock {formatDateChoice(best)}
            </Button>
          ) : null}
          <Button variant="text" size="sm" className="ml-auto" loading={action.busy === 'clear'} onClick={() => void clear()}>
            Clear dates
          </Button>
        </div>
      ) : null}
    </Panel>
  )
}

/* ---------- Pick the spot swipe deck ---------- */

type SearchPlace = { id: string; slug?: string | null; name?: string | null; category?: string | null; city?: string | null; area?: string | null }

async function searchPlaces(query: string): Promise<SearchPlace[]> {
  const response = await fetch(getApiUrl('/search'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, page: 1, limit: 6, strictPlaceSearch: true }),
  })
  const data = (await response.json().catch(() => ({}))) as { places?: SearchPlace[]; result?: { places?: SearchPlace[] }; message?: string }
  if (!response.ok) throw new Error(data.message || 'Search failed. Try again.')
  return (data.places || data.result?.places || []).filter((place) => place.id && place.name && place.slug)
}

function placeMeta(place: { category?: string | null; area?: string | null; city?: string | null; budget_min?: number | null } | undefined) {
  if (!place) return null
  return [place.category, place.area || place.city, place.budget_min ? `${formatPeso(place.budget_min)}/head` : null].filter(Boolean).join(' · ') || null
}

function SpotComposer({ plan, session, onChange, onCancel }: Omit<VoteProps, 'onPlanChange'> & { onCancel: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchPlace[]>([])
  const [picked, setPicked] = useState<SearchPlace[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) return
    let isCancelled = false
    const timeout = window.setTimeout(() => {
      setIsSearching(true)
      searchPlaces(trimmed)
        .then((places) => {
          if (!isCancelled) setResults(places)
        })
        .catch((searchError) => {
          if (!isCancelled) setError(searchError instanceof Error ? searchError.message : 'Search failed.')
        })
        .finally(() => {
          if (!isCancelled) setIsSearching(false)
        })
    }, 325)
    return () => {
      isCancelled = true
      window.clearTimeout(timeout)
    }
  }, [query])

  const add = (place: SearchPlace) => {
    if (picked.length >= SPOT_OPTIONS.max || picked.some((entry) => entry.id === place.id)) return
    setPicked([...picked, place])
    setQuery('')
    setResults([])
  }

  const start = async () => {
    if (picked.length < SPOT_OPTIONS.min) return setError(`Add at least ${SPOT_OPTIONS.min} places.`)
    setIsSaving(true)
    setError(null)
    try {
      for (const place of picked) {
        const name = (place.name ?? '').slice(0, 80)
        onChange(
          await createGalaPlanPoll(
            plan.id,
            { question: spotQuestion(String(place.slug)), options: [{ label: name, place_id: place.id }, { label: SPOT_PASS, place_id: place.id }] },
            session,
          ),
        )
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not start the deck.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="mt-3 grid gap-3">
      <label className="g-input g-spot-search">
        <MagnifyingGlass aria-hidden="true" />
        <input
          type="search"
          value={query}
          placeholder="Search a place to add"
          aria-label="Search a place to add"
          onChange={(event) => {
            setQuery(event.target.value)
            if (event.target.value.trim().length < 2) setResults([])
          }}
        />
      </label>
      {query.trim().length >= 2 ? (
        <ul className="g-spot-results" aria-busy={isSearching || undefined} aria-label="Search results">
          {results.length === 0 && !isSearching ? <li className="g-sm g-mut px-1 py-2">No places found.</li> : null}
          {results.map((place) => {
            const isPicked = picked.some((entry) => entry.id === place.id)
            return (
              <li key={place.id}>
                <button type="button" disabled={isPicked || picked.length >= SPOT_OPTIONS.max} onClick={() => add(place)}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{place.name}</span>
                    <span className="g-xs g-mut block truncate">{placeMeta(place)}</span>
                  </span>
                  {isPicked ? <Check aria-label="Added" /> : <Plus aria-label="Add" />}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
      {picked.length > 0 ? (
        <ol className="g-spot-picked" aria-label="Places in the deck">
          {picked.map((place) => (
            <li key={place.id}>
              <span className="truncate">{place.name}</span>
              <button type="button" aria-label={`Remove ${place.name}`} onClick={() => setPicked(picked.filter((entry) => entry.id !== place.id))}>
                <X />
              </button>
            </li>
          ))}
        </ol>
      ) : null}
      <p className="g-xs g-mut">{picked.length} of {SPOT_OPTIONS.min}–{SPOT_OPTIONS.max} places</p>
      {error ? <p role="alert" className="g-hint is-error">{error}</p> : null}
      <div className="flex items-center gap-2">
        <Button variant="text" size="sm" className="ml-auto" onClick={onCancel}>Cancel</Button>
        <Button variant="ink" size="sm" loading={isSaving} disabled={isSaving || picked.length < SPOT_OPTIONS.min} onClick={() => void start()}>
          <Cards />
          Start the deck
        </Button>
      </div>
    </div>
  )
}

export function SpotDeck({ plan, spots, session, onChange, onPlanChange }: VoteProps & { spots: SpotChoice[] }) {
  const [isComposing, setIsComposing] = useState(false)
  const [deckSession, setDeckSession] = useState<Session | null | undefined>(undefined)
  const [details, setDetails] = useState<Map<string, PlaceDetail>>(new Map())
  const action = useVoteAction(session)
  const slugKey = spots.map((spot) => spot.slug).join(',')

  useEffect(() => {
    if (!slugKey) return
    let isCancelled = false
    void fetchPlaceDetailsBatch(slugKey.split(',')).then((places) => {
      if (!isCancelled) setDetails(new Map(places.map((place) => [place.slug, place])))
    })
    return () => {
      isCancelled = true
    }
  }, [slugKey])

  const ranked = useMemo(() => rankSpots(spots), [spots])
  const winner = spotWinner(spots)
  const swipers = new Set(spots.flatMap((spot) => spot.taraVoters.map((voter) => voter.user_id))).size
  const unswiped = spots.filter((spot) => spot.viewerChoice === null).length
  const inPlan = new Set(plan.items.map((item) => item.place_id))

  const imageFor = (spot: SpotChoice) => getPlacePhotoCandidates(spot.slug, details.get(spot.slug)?.imageUrl)[0] ?? null

  if (spots.length === 0) {
    if (!plan.viewer_is_owner) return null
    return (
      <Panel as="section" aria-labelledby="spot-title">
        <div className="flex items-start gap-3">
          <span className="g-vote-ic" aria-hidden="true"><Cards weight="light" /></span>
          <div className="min-w-0 flex-1">
            <h3 id="spot-title" className="g-h3">Pick the spot</h3>
            <p className="g-sm g-mut">Add {SPOT_OPTIONS.min} to {SPOT_OPTIONS.max} places. The barkada swipes Tara or Pass.</p>
          </div>
        </div>
        {isComposing ? (
          <SpotComposer plan={plan} session={session} onChange={onChange} onCancel={() => setIsComposing(false)} />
        ) : (
          <Button variant="soft" size="sm" className="mt-3" onClick={() => setIsComposing(true)}>
            <Plus />
            Add places
          </Button>
        )}
      </Panel>
    )
  }

  const cards: SwipeCard[] = spots.map((spot) => ({
    id: spot.pollId,
    title: spot.name,
    image: imageFor(spot),
    meta: placeMeta(details.get(spot.slug) ?? undefined),
    votes: spot.tara,
    voters: spot.taraVoters,
    isMine: spot.viewerChoice === 'tara',
  }))
  const spotFor = (card: SwipeCard) => spots.find((spot) => spot.pollId === card.id) as SpotChoice

  const openDeck = () => {
    if (session) setDeckSession(session)
    else void action.run('deck', async (guestSession) => setDeckSession(guestSession ?? null))
  }

  const addWinner = (spot: SpotChoice) =>
    action.run('add', async (activeSession) => {
      if (!spot.placeId) throw new Error('This place is no longer available.')
      await addPlaceToGalaPlan(plan.id, { place_id: spot.placeId }, activeSession)
      // Re-read the plan so the new stop arrives with its photo and route.
      onPlanChange((await getGalaPlan(plan.id, activeSession)).plan)
    })

  const clear = () =>
    action.run('clear', async (activeSession) => {
      const latest = await removePolls(plan.id, spots.map((spot) => spot.pollId), activeSession)
      if (latest) onChange(latest)
    })

  return (
    <Panel as="section" aria-labelledby="spot-title">
      {action.promptElement}
      {deckSession !== undefined ? (
        <SwipeVote
          title="Pick the spot"
          cards={cards}
          onTara={(card) => voteGalaPlanPoll(plan.id, card.id, spotFor(card).taraOptionId, deckSession)}
          onPass={(card) => voteGalaPlanPoll(plan.id, card.id, spotFor(card).passOptionId, deckSession)}
          onChange={onChange}
          onClose={() => setDeckSession(undefined)}
        />
      ) : null}
      <div className="flex items-start gap-3">
        <span className="g-vote-ic" aria-hidden="true"><Cards weight="light" /></span>
        <div className="min-w-0 flex-1">
          <h3 id="spot-title" className="g-h3">Pick the spot</h3>
          <p className="g-sm g-mut">
            {spots.length} places · {swipers === 0 ? 'no tara yet' : `${swipers} ${swipers === 1 ? 'person' : 'people'} said tara`}
          </p>
        </div>
      </div>
      <Button variant={unswiped > 0 ? 'ink' : 'line'} size="sm" className="mt-3" onClick={openDeck}>
        <Cards />
        {unswiped === spots.length ? `Swipe ${spots.length} places` : unswiped > 0 ? `Swipe ${unswiped} more` : 'Swipe again'}
      </Button>
      <ol className="g-rank mt-3" aria-label="Ranking">
        {ranked.map((spot, index) => {
          const image = imageFor(spot)
          const isWinner = winner?.pollId === spot.pollId
          return (
            <li key={spot.pollId} className={cx(isWinner && 'is-top')}>
              <span className="g-rank-n">{index + 1}</span>
              <span className="g-rank-img">{image ? <img src={image} alt="" loading="lazy" /> : null}</span>
              <span className="min-w-0 flex-1">
                <span className="g-rank-name">{spot.name}</span>
                <span className="g-rank-meta">
                  {spot.tara} tara · {spot.pass} pass
                  {spot.viewerChoice ? ` · you said ${spot.viewerChoice}` : ''}
                </span>
                {isWinner ? (
                  <span className="mt-1.5 flex flex-wrap items-center gap-2">
                    <Tag tone="tara">Top pick</Tag>
                    {spot.placeId && inPlan.has(spot.placeId) ? (
                      <Tag>
                        <Check weight="bold" />
                        In the plan
                      </Tag>
                    ) : plan.viewer_is_owner ? (
                      <Button variant="ink" size="sm" loading={action.busy === 'add'} onClick={() => void addWinner(spot)}>
                        <MapPinPlus />
                        Add as stop
                      </Button>
                    ) : null}
                  </span>
                ) : null}
              </span>
              {spot.taraVoters.length > 0 ? <AvatarStack people={people(spot.taraVoters)} max={3} size={24} live /> : null}
            </li>
          )
        })}
      </ol>
      {action.error ? <p role="alert" className="g-hint is-error mt-2">{action.error}</p> : null}
      {plan.viewer_is_owner ? (
        <div className="mt-2 flex justify-end">
          <Button variant="text" size="sm" loading={action.busy === 'clear'} onClick={() => void clear()}>Clear deck</Button>
        </div>
      ) : null}
    </Panel>
  )
}
