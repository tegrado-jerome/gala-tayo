import { useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import ProfileAvatar from '../ProfileAvatar'
import {
  createGalaPlanPoll,
  deleteGalaPlanPoll,
  setGalaPlanRsvp,
  voteGalaPlanPoll,
  type GalaPlanBarkada,
  type GalaPlanRsvp,
} from '../../utils/galaPlanBarkadaApi'
import type { GalaPlanDetail } from '../../utils/galaPlansApi'

type ReadyBarkada = Extract<GalaPlanBarkada, { available: true }>

const rsvpOptions: Array<{ value: GalaPlanRsvp; label: string }> = [
  { value: 'going', label: 'Game ako' },
  { value: 'maybe', label: 'Baka' },
  { value: 'no', label: 'Pass' },
]

const rsvpLabel: Record<GalaPlanRsvp, string> = { going: 'Going', maybe: 'Maybe', no: "Can't" }

type BarkadaPanelProps = {
  plan: GalaPlanDetail
  barkada: ReadyBarkada
  session: Session | null | undefined
  onChange: (barkada: GalaPlanBarkada) => void
}

function PollComposer({ plan, session, onChange }: Omit<BarkadaPanelProps, 'barkada'>) {
  const [question, setQuestion] = useState('Saan tayo kakain?')
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
    <form onSubmit={submit} className="rounded-[16px] border border-dashed border-[var(--line-strong)] p-4">
      <label htmlFor="poll-question" className="font-data text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
        New poll
      </label>
      <input
        id="poll-question"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        maxLength={120}
        className="font-display mt-1 w-full bg-transparent text-[18px] text-[var(--text-main)] outline-none"
      />
      <datalist id="poll-place-suggestions">
        {suggestions.map((name) => <option key={name} value={name} />)}
      </datalist>
      <div className="mt-3 grid gap-2">
        {options.map((option, index) => (
          <input
            key={index}
            value={option}
            list="poll-place-suggestions"
            onChange={(event) => setOptions((current) => current.map((value, i) => (i === index ? event.target.value : value)))}
            placeholder={`Option ${index + 1}`}
            maxLength={80}
            aria-label={`Option ${index + 1}`}
            className="h-10 rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 text-[14px] text-[var(--text-main)] outline-none focus:border-[var(--line-strong)]"
          />
        ))}
      </div>
      {error ? <p className="mt-2 text-[13px] text-[var(--danger)]">{error}</p> : null}
      <div className="mt-3 flex items-center gap-2">
        {options.length < 4 ? (
          <button type="button" onClick={() => setOptions((current) => [...current, ''])} className="h-9 rounded-full px-3 text-[13px] font-medium text-[var(--text-strong)] hover:bg-[var(--hover-surface-strong)]">
            + Option
          </button>
        ) : null}
        <button type="submit" disabled={isSaving} className="ml-auto h-9 rounded-full bg-[var(--ink)] px-4 text-[13px] font-semibold text-[var(--bg)] disabled:opacity-60">
          {isSaving ? 'Posting…' : 'Post poll'}
        </button>
      </div>
    </form>
  )
}

function BarkadaPanel({ plan, barkada, session, onChange }: BarkadaPanelProps) {
  const [error, setError] = useState<string | null>(null)
  const isOwner = plan.viewer_is_owner
  const canJoin = Boolean(session) && (isOwner || plan.visibility === 'public')

  const run = async (action: () => Promise<GalaPlanBarkada>) => {
    setError(null)
    try {
      onChange(await action())
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Something went wrong.')
    }
  }

  return (
    <div className="grid gap-6">
      {!isOwner ? (
        <section>
          <h3 className="font-data text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">Sasama ka ba?</h3>
          <div className="mt-2 flex gap-2" role="radiogroup" aria-label="Your RSVP">
            {rsvpOptions.map((option) => {
              const isSelected = barkada.viewer_rsvp === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={!canJoin}
                  onClick={() => void run(() => setGalaPlanRsvp(plan.id, option.value, session))}
                  className={`h-10 flex-1 rounded-full border text-[14px] font-semibold transition-colors disabled:opacity-50 ${
                    isSelected
                      ? 'border-transparent bg-[var(--primary)] text-white'
                      : 'border-[var(--line)] text-[var(--text-main)] hover:border-[var(--line-strong)]'
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      <section>
        <h3 className="font-data text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
          Barkada · {barkada.members.filter((member) => member.rsvp === 'going').length} going
        </h3>
        <ul className="mt-2 divide-y divide-[var(--line)] rounded-[16px] border border-[var(--line)] bg-[var(--card)]">
          {barkada.members.map((member) => (
            <li key={member.user_id} className="flex items-center gap-3 px-3.5 py-2.5">
              <ProfileAvatar
                profile={{
                  username: member.profile?.username ?? null,
                  avatar_url: member.profile?.avatar_url ?? null,
                  provider_avatar_url: member.profile?.provider_avatar_url ?? null,
                }}
                size="sm"
              />
              <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--text-main)]">
                {member.profile?.display_name || member.profile?.username || 'GalaTayo user'}
                {member.is_owner ? <span className="text-[var(--text-muted)]"> · host</span> : null}
              </span>
              <span className={`font-data text-[12px] ${member.rsvp === 'going' ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'}`}>
                {rsvpLabel[member.rsvp]}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3">
        <h3 className="font-data text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">Botohan</h3>
        {barkada.polls.length === 0 && !isOwner ? (
          <p className="text-[14px] text-[var(--text-muted)]">No polls yet.</p>
        ) : null}
        {barkada.polls.map((poll) => {
          const leader = Math.max(0, ...poll.options.map((option) => option.votes))
          return (
            <article key={poll.id} className="rounded-[16px] border border-[var(--line)] bg-[var(--card)] p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-display text-[19px] leading-tight text-[var(--text-main)]">{poll.question}</p>
                {isOwner ? (
                  <button type="button" onClick={() => void run(() => deleteGalaPlanPoll(plan.id, poll.id, session))} className="text-[12px] text-[var(--text-muted)] hover:text-[var(--danger)]">
                    Remove
                  </button>
                ) : null}
              </div>
              <ul className="mt-3 grid gap-2">
                {poll.options.map((option) => {
                  const share = poll.total_votes ? Math.round((option.votes / poll.total_votes) * 100) : 0
                  const isMine = poll.viewer_option_id === option.id
                  const isLeading = option.votes > 0 && option.votes === leader
                  return (
                    <li key={option.id}>
                      <button
                        type="button"
                        disabled={!canJoin}
                        onClick={() => void run(() => voteGalaPlanPoll(plan.id, poll.id, option.id, session))}
                        aria-pressed={isMine}
                        className={`relative flex h-11 w-full items-center overflow-hidden rounded-xl border px-3 text-left text-[14px] transition-colors disabled:cursor-default ${
                          isMine ? 'border-[var(--primary)]' : 'border-[var(--line)] hover:border-[var(--line-strong)]'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`absolute inset-y-0 left-0 ${isLeading ? 'bg-[var(--primary-soft)]' : 'bg-[var(--bg-soft)]'}`}
                          style={{ width: `${share}%` }}
                        />
                        <span className="relative min-w-0 flex-1 truncate font-medium text-[var(--text-main)]">{option.label}</span>
                        <span className="font-data relative text-[12px] text-[var(--text-muted)]">{option.votes}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className="font-data mt-2 text-[11px] text-[var(--text-muted)]">
                {poll.total_votes} {poll.total_votes === 1 ? 'vote' : 'votes'}
                {poll.viewer_option_id ? ' · tap another option to change your vote' : ''}
              </p>
            </article>
          )
        })}
        {isOwner ? <PollComposer plan={plan} session={session} onChange={onChange} /> : null}
      </section>

      {error ? <p role="alert" className="text-[13px] text-[var(--danger)]">{error}</p> : null}
      {!session ? <p className="text-[13px] text-[var(--text-muted)]">Sign in to RSVP and vote.</p> : null}
    </div>
  )
}

export default BarkadaPanel
