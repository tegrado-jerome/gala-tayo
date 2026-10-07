import { useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Check } from '@phosphor-icons/react/dist/csr/Check'
import { Stack as Layers } from '@phosphor-icons/react/dist/csr/Stack'
import { Plus } from '@phosphor-icons/react/dist/csr/Plus'
import { useGuestAuthPrompt } from '../GuestAuthPrompt'
import { Avatar, AvatarStack, Button, Empty, Panel, Tag, cx } from '../ui'
import {
  createGalaPlanPoll,
  deleteGalaPlanPoll,
  setGalaPlanRsvp,
  voteGalaPlanPoll,
  type GalaPlanBarkada,
  type GalaPlanMember,
  type GalaPlanPoll,
  type GalaPlanRsvp,
} from '../../utils/galaPlanBarkadaApi'
import type { GalaPlanDetail, GalaPlanOwner } from '../../utils/galaPlansApi'
import { getPlacePhotoCandidates } from '../../data/placeIndexVisuals'
import { splitPolls } from '../../utils/barkadaVotes'
import { clearPendingRsvp, rememberPendingRsvp } from '../../utils/pendingRsvp'
import { formatPeso } from '../../utils/galaPlanTrip'
import { KailanPoll, SpotDeck, TaraBurst } from './BarkadaVotes'
import SwipeVote, { type SwipeCard } from './SwipeVote'

export type ReadyBarkada = Extract<GalaPlanBarkada, { available: true }>

type BarkadaProps = {
  plan: GalaPlanDetail
  barkada: ReadyBarkada
  session: Session | null | undefined
  onChange: (barkada: GalaPlanBarkada) => void
}

const rsvpOptions: Array<{ value: GalaPlanRsvp; label: string }> = [
  { value: 'going', label: "I'm in!" },
  { value: 'maybe', label: 'Maybe' },
  { value: 'no', label: 'Pass' },
]

const rsvpTag: Record<GalaPlanRsvp, { label: string; tone: 'ok' | 'warn' | 'neutral' }> = {
  going: { label: 'Going', tone: 'ok' },
  maybe: { label: 'Maybe', tone: 'warn' },
  no: { label: 'Pass', tone: 'neutral' },
}

export function personName(profile: GalaPlanOwner | null | undefined) {
  return profile?.display_name || profile?.username || 'GalaTayo user'
}

export function personAvatar(profile: GalaPlanOwner | null | undefined) {
  return profile?.avatar_url ?? profile?.provider_avatar_url ?? null
}

function toStackPeople(members: Array<Pick<GalaPlanMember, 'user_id' | 'profile'>>) {
  return members.map((member) => ({ id: member.user_id, avatarUrl: personAvatar(member.profile), name: personName(member.profile) }))
}

// The plan link is the invite, so anyone signed in who can open the plan can RSVP and vote.
function canJoinPlan(_plan: GalaPlanDetail, session: Session | null | undefined) {
  return Boolean(session)
}

function useAction(onChange: (barkada: GalaPlanBarkada) => void) {
  const [error, setError] = useState<string | null>(null)
  const run = async (action: () => Promise<GalaPlanBarkada>) => {
    setError(null)
    try {
      onChange(await action())
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Something went wrong.')
    }
  }
  return { error, run }
}

export function RsvpPanel({ plan, barkada, session, onChange }: BarkadaProps) {
  const { error, run } = useAction(onChange)
  const [burst, setBurst] = useState(0)
  const going = barkada.members.filter((member) => member.rsvp === 'going')
  const maybe = barkada.members.filter((member) => member.rsvp === 'maybe').length
  const canJoin = canJoinPlan(plan, session)
  const guestAuth = useGuestAuthPrompt()

  return (
    <Panel>
      {guestAuth.promptElement}
      <h2 className="g-h3">{plan.viewer_is_owner ? "Who's coming?" : 'Are you in?'}</h2>
      {!plan.viewer_is_owner ? (
        <div className="g-rsvp mt-3" role="group" aria-label="Your RSVP">
          {rsvpOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={barkada.viewer_rsvp === option.value}
              className={cx(option.value === 'going' && 'is-go')}
              onClick={() => {
                if (option.value === 'going' && barkada.viewer_rsvp !== 'going') setBurst((count) => count + 1)
                if (canJoin) void run(() => setGalaPlanRsvp(plan.id, option.value, session))
                else {
                  rememberPendingRsvp(plan.id, option.value)
                  guestAuth.open('plan-rsvp', (guestSession) => {
                    clearPendingRsvp()
                    void run(() => setGalaPlanRsvp(plan.id, option.value, guestSession))
                  })
                }
              }}
            >
              {option.label}
              {option.value === 'going' ? <TaraBurst play={burst} /> : null}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-3.5 flex min-w-0 items-center gap-2.5">
        {going.length > 0 ? <AvatarStack people={toStackPeople(going)} live /> : null}
        <span className="g-sm min-w-0">
          <b>{going.length} going</b>
          {maybe ? <span className="g-mut"> · {maybe} maybe</span> : null}
        </span>
      </div>
      {error ? <p role="alert" className="g-hint is-error mt-2">{error}</p> : null}
      {!session ? <p className="g-hint mt-2">Sign in to RSVP and vote.</p> : null}
    </Panel>
  )
}

export function MembersList({ barkada }: { barkada: ReadyBarkada }) {
  return (
    <Panel style={{ paddingBlock: 4 }}>
      {barkada.members.map((member) => (
        <div key={member.user_id} className="g-bal">
          <Avatar src={personAvatar(member.profile)} name={personName(member.profile)} size={36} />
          <div className="min-w-0">
            <p className="g-sm truncate font-semibold">{personName(member.profile)}</p>
            {member.is_owner ? <p className="g-xs g-mut">Host</p> : null}
          </div>
          <span className="ml-auto">
            <Tag tone={rsvpTag[member.rsvp].tone}>{rsvpTag[member.rsvp].label}</Tag>
          </span>
        </div>
      ))}
    </Panel>
  )
}

function PollComposer({ plan, session, onChange }: Omit<BarkadaProps, 'barkada'>) {
  const [question, setQuestion] = useState('Where should we eat?')
  const [options, setOptions] = useState(['', ''])
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const suggestions = plan.items.map((item) => item.place.name)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const filled = options.map((option) => option.trim()).filter(Boolean)
    if (filled.length < 2) {
      setError('Add at least 2 options.')
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      const placeByName = new Map(plan.items.map((item) => [item.place.name, item.place.id]))
      onChange(
        await createGalaPlanPoll(
          plan.id,
          { question, options: filled.map((label) => ({ label, place_id: placeByName.get(label) ?? null })) },
          session,
        ),
      )
      setOptions(['', ''])
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not create the poll.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="g-panel grid gap-3">
      <div className="g-field">
        <label htmlFor="poll-question">New poll</label>
        <input id="poll-question" className="g-input" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={120} />
      </div>
      <datalist id="poll-place-suggestions">
        {suggestions.map((name) => <option key={name} value={name} />)}
      </datalist>
      <div className="grid gap-2">
        {options.map((option, index) => (
          <input
            key={index}
            className="g-input"
            value={option}
            list="poll-place-suggestions"
            onChange={(event) => setOptions((current) => current.map((value, i) => (i === index ? event.target.value : value)))}
            placeholder={`Option ${index + 1}`}
            maxLength={80}
            aria-label={`Option ${index + 1}`}
          />
        ))}
      </div>
      {error ? <p className="g-hint is-error">{error}</p> : null}
      <div className="flex items-center gap-2">
        {options.length < 4 ? (
          <Button variant="soft" size="sm" onClick={() => setOptions((current) => [...current, ''])}>
            <Plus />
            Option
          </Button>
        ) : null}
        <Button type="submit" variant="ink" size="sm" className="ml-auto" loading={isSaving} disabled={isSaving}>
          Post poll
        </Button>
      </div>
    </form>
  )
}

function pollCards(plan: GalaPlanDetail, poll: GalaPlanPoll): SwipeCard[] {
  return poll.options.map((option) => {
    const label = option.label.trim().toLowerCase()
    const place = plan.items.find((item) => item.place.id === option.place_id || item.place.name.trim().toLowerCase() === label)?.place
    return {
      id: option.id,
      title: option.label,
      image: place ? getPlacePhotoCandidates(place.slug, place.image_url)[0] ?? null : null,
      meta: place ? [place.area || place.city, place.budget_min ? `${formatPeso(place.budget_min)}/head` : null].filter(Boolean).join(' · ') : null,
      votes: option.votes,
      voters: option.voters,
      isMine: poll.viewer_option_id === option.id,
    }
  })
}

export function PollsPanel({ plan, barkada, session, onChange, onPlanChange }: BarkadaProps & { onPlanChange: (plan: GalaPlanDetail) => void }) {
  const { error, run } = useAction(onChange)
  const isOwner = plan.viewer_is_owner
  const canJoin = canJoinPlan(plan, session)
  const guestAuth = useGuestAuthPrompt()
  const [swipePollId, setSwipePollId] = useState<string | null>(null)
  const { regular, dates, spots } = splitPolls(barkada.polls)
  const swipePoll = regular.find((poll) => poll.id === swipePollId)
  const voteProps = { plan, session, onChange, onPlanChange }

  return (
    <div className="grid gap-4">
      {guestAuth.promptElement}
      {swipePoll ? (
        <SwipeVote
          title={swipePoll.question}
          cards={pollCards(plan, swipePoll)}
          onTara={(card) => voteGalaPlanPoll(plan.id, swipePoll.id, card.id, session)}
          onChange={onChange}
          onClose={() => setSwipePollId(null)}
        />
      ) : null}
      <KailanPoll {...voteProps} dates={dates} />
      <SpotDeck {...voteProps} spots={spots} />
      {barkada.polls.length === 0 && !isOwner ? <Empty title="No polls yet" description="When the host opens a vote, it shows up here." /> : null}
      {regular.map((poll) => (
        <Panel as="article" key={poll.id}>
          <div className="flex items-start justify-between gap-3">
            <h3 className="g-h3 min-w-0">{poll.question}</h3>
            {isOwner ? (
              <Button variant="text" size="sm" onClick={() => void run(() => deleteGalaPlanPoll(plan.id, poll.id, session))}>
                Remove
              </Button>
            ) : null}
          </div>
          <div className="mt-1">
            {poll.options.map((option) => {
              const share = poll.total_votes ? Math.round((option.votes / poll.total_votes) * 100) : 0
              const isMine = poll.viewer_option_id === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={isMine}
                  onClick={() =>
                    canJoin
                      ? void run(() => voteGalaPlanPoll(plan.id, poll.id, option.id, session))
                      : guestAuth.open('plan-rsvp', (guestSession) => void run(() => voteGalaPlanPoll(plan.id, poll.id, option.id, guestSession)))
                  }
                  className={cx('g-po', isMine && 'is-mine')}
                >
                  <span className="g-po-fill" style={{ width: `${share}%` }} aria-hidden="true" />
                  <span className="flex min-w-0 items-center gap-2">
                    {isMine ? <Check className="h-4 w-4 shrink-0" /> : null}
                    <span className="truncate">{option.label}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {option.voters.length > 0 ? (
                      <AvatarStack people={option.voters.map((voter) => ({ id: voter.user_id, avatarUrl: personAvatar(voter), name: personName(voter) }))} max={3} size={22} />
                    ) : null}
                    {option.votes}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="g-xs g-mut">
              {poll.total_votes} {poll.total_votes === 1 ? 'vote' : 'votes'}
              {poll.viewer_option_id ? ' · tap another option to change your vote' : ''}
            </p>
            {canJoin && poll.options.length > 1 ? (
              <Button variant="ink" size="sm" onClick={() => setSwipePollId(poll.id)}>
                <Layers />
                Swipe to vote
              </Button>
            ) : null}
          </div>
        </Panel>
      ))}
      {isOwner ? <PollComposer plan={plan} session={session} onChange={onChange} /> : null}
      {error ? <p role="alert" className="g-hint is-error">{error}</p> : null}
      {!session ? <p className="g-hint">Sign in to RSVP and vote.</p> : null}
    </div>
  )
}
