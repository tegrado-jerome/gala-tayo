import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Session } from '@supabase/supabase-js'
import { Check, X } from 'lucide-react'
import { AvatarStack, Button } from '../ui'
import { personAvatar, personName } from './BarkadaPanel'
import { getStaticPlaceImageUrlForSlug } from '../../data/placeIndexVisuals'
import { voteGalaPlanPoll, type GalaPlanBarkada, type GalaPlanPoll } from '../../utils/galaPlanBarkadaApi'
import type { GalaPlanDetail } from '../../utils/galaPlansApi'
import { formatPeso } from '../../utils/galaPlanTrip'

type Option = GalaPlanPoll['options'][number]
type Phase = 'deck' | 'saving' | 'done' | 'end'

const SWIPE_PX = 96
const FLY_MS = 220

const NAVY = '#0f2138'

function findPlace(plan: GalaPlanDetail, option: Option) {
  const label = option.label.trim().toLowerCase()
  return plan.items.find((item) => item.place.id === option.place_id || item.place.name.trim().toLowerCase() === label)?.place ?? null
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function OptionCard({ plan, option, dx, dragging, isMine }: { plan: GalaPlanDetail; option: Option; dx: number; dragging: boolean; isMine: boolean }) {
  const place = findPlace(plan, option)
  const image = place ? place.image_url || getStaticPlaceImageUrlForSlug(place.slug) : null
  const meta = place ? [place.category, place.area || place.city, place.budget_min ? `${formatPeso(place.budget_min)}/head` : null].filter(Boolean).join(' · ') : null
  const lean = Math.max(-1, Math.min(1, dx / SWIPE_PX))
  const others = option.votes - (isMine ? 1 : 0)

  return (
    <div
      className="relative h-full w-full overflow-hidden select-none"
      style={{
        borderRadius: 'var(--r-4)',
        background: NAVY,
        boxShadow: 'var(--sh-3)',
        transform: `translateX(${dx}px) rotate(${dx / 24}deg)`,
        transition: dragging ? 'none' : `transform ${FLY_MS}ms var(--ease-g)`,
      }}
    >
      {image ? <img src={image} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" /> : null}
      <div className="absolute inset-0" style={{ background: image ? 'linear-gradient(180deg, rgba(15,33,56,0) 45%, rgba(15,33,56,0.88) 100%)' : undefined }} aria-hidden="true" />

      <span
        className="absolute left-5 top-5 rounded-[var(--r-1)] px-3 py-1"
        style={{ border: '3px solid var(--tara)', color: 'var(--tara)', background: NAVY, font: '700 20px/1 var(--font-display)', transform: 'rotate(-12deg)', opacity: Math.max(0, lean) }}
        aria-hidden="true"
      >
        TARA!
      </span>
      <span
        className="absolute right-5 top-5 rounded-[var(--r-1)] px-3 py-1"
        style={{ border: '3px solid #fff', color: '#fff', background: NAVY, font: '700 20px/1 var(--font-display)', transform: 'rotate(12deg)', opacity: Math.max(0, -lean) }}
        aria-hidden="true"
      >
        SKIP
      </span>

      <div className="absolute inset-x-0 bottom-0 p-5 text-white">
        {isMine ? <span className="g-tag is-solid mb-2">Your pick</span> : null}
        <p className={image ? 'g-h1' : 'g-d1'} style={{ color: '#fff', overflowWrap: 'anywhere' }}>{option.label}</p>
        {meta ? <p className="g-sm mt-1" style={{ opacity: 0.85 }}>{meta}</p> : null}
        <div className="mt-3 flex min-h-7 items-center gap-2">
          {option.voters.length > 0 ? (
            <AvatarStack people={option.voters.map((voter) => ({ id: voter.user_id, avatarUrl: personAvatar(voter), name: personName(voter) }))} max={4} size={26} />
          ) : null}
          <span className="g-sm font-semibold">
            {option.votes === 0 ? 'Be the first to say tara' : isMine && others === 0 ? 'Only you so far' : `${option.votes} already said tara`}
          </span>
        </div>
      </div>
    </div>
  )
}

/** Full-screen deck of a poll's options. Right (or ✓) votes for the option, left (or ✕) skips. */
function SwipeVote({ plan, poll, session, onChange, onClose }: { plan: GalaPlanDetail; poll: GalaPlanPoll; session: Session | null | undefined; onChange: (barkada: GalaPlanBarkada) => void; onClose: () => void }) {
  const [index, setIndex] = useState(0)
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [phase, setPhase] = useState<Phase>('deck')
  const [result, setResult] = useState<{ label: string; others: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const startX = useRef<number | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const option = poll.options[index]
  const next = poll.options[index + 1]

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => {
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [])

  const fly = (direction: 1 | -1, after: () => void) => {
    if (prefersReducedMotion()) {
      setDx(0)
      after()
      return
    }
    setDx(direction * (window.innerWidth + 200))
    window.setTimeout(after, FLY_MS)
  }

  const skip = () => {
    if (phase !== 'deck' || !option) return
    setError(null)
    fly(-1, () => {
      setDx(0)
      if (index + 1 >= poll.options.length) setPhase('end')
      else setIndex(index + 1)
    })
  }

  const tara = async () => {
    if (phase !== 'deck' || !option) return
    setError(null)
    setPhase('saving')
    const picked = option
    fly(1, () => undefined)
    try {
      const barkada = await voteGalaPlanPoll(plan.id, poll.id, picked.id, session)
      onChange(barkada)
      const updated = barkada.available ? barkada.polls.find((entry) => entry.id === poll.id)?.options.find((entry) => entry.id === picked.id) : undefined
      setResult({ label: picked.label, others: Math.max(0, (updated?.votes ?? picked.votes + 1) - 1) })
      setPhase('done')
    } catch (voteError) {
      setError(voteError instanceof Error ? voteError.message : 'Could not save your vote.')
      setDx(0)
      setPhase('deck')
    }
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (phase !== 'deck') return
    startX.current = event.clientX
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (startX.current !== null) setDx(event.clientX - startX.current)
  }
  const onPointerEnd = () => {
    if (startX.current === null) return
    startX.current = null
    setDragging(false)
    if (dx > SWIPE_PX) void tara()
    else if (dx < -SWIPE_PX) skip()
    else setDx(0)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') onClose()
    else if (event.key === 'ArrowRight') void tara()
    else if (event.key === 'ArrowLeft') skip()
  }

  const restart = () => {
    setIndex(0)
    setDx(0)
    setPhase('deck')
  }

  const roundButton = 'grid h-16 w-16 place-items-center rounded-full transition-transform active:scale-95 disabled:opacity-40 motion-reduce:transition-none'

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="swipe-vote-title"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[7000] flex flex-col bg-[var(--surface)] outline-none"
    >
      <header className="mx-auto flex w-full max-w-[520px] items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)]">
        <Button variant="soft" iconOnly aria-label="Close" onClick={onClose}>
          <X />
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <h2 id="swipe-vote-title" className="g-h3 truncate">{poll.question}</h2>
          <p className="g-xs g-mut">
            {phase === 'deck' || phase === 'saving' ? `Vote with the barkada · ${index + 1} of ${poll.options.length}` : 'Vote with the barkada'}
          </p>
        </div>
        <span className="w-11 shrink-0" aria-hidden="true" />
      </header>

      {phase === 'done' && result ? (
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col items-center justify-center px-6 text-center">
          <span className="g-press grid h-24 w-24 place-items-center rounded-full" style={{ background: 'var(--tara)', color: NAVY, ['--g-rot' as string]: '-6deg' }} aria-hidden="true">
            <Check className="h-10 w-10" strokeWidth={2.5} />
          </span>
          <p className="g-h1 mt-6" role="status">You picked {result.label}</p>
          <p className="g-mut mt-2">{result.others === 0 ? "You're the first. Hatakin mo na sila." : `${result.others} ${result.others === 1 ? 'other' : 'others'} too`}</p>
          <Button variant="ink" className="mt-8" onClick={onClose}>Back to plan</Button>
        </div>
      ) : phase === 'end' ? (
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="g-h1" role="status">Walang napili</p>
          <p className="g-mut mt-2">You skipped every option. Go again or close the deck.</p>
          <div className="mt-8 flex gap-2">
            <Button variant="soft" onClick={onClose}>Close</Button>
            <Button variant="ink" onClick={restart}>Start over</Button>
          </div>
        </div>
      ) : option ? (
        <>
          <div className="relative mx-auto w-full max-w-[420px] min-h-0 flex-1 px-5 py-4">
            {next ? (
              <div className="absolute inset-x-5 inset-y-4 scale-[0.92]" aria-hidden="true">
                <OptionCard plan={plan} option={next} dx={0} dragging isMine={poll.viewer_option_id === next.id} />
              </div>
            ) : null}
            <div
              className="relative h-full cursor-grab touch-none active:cursor-grabbing"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerEnd}
              onPointerCancel={onPointerEnd}
              role="group"
              aria-label={`Option ${index + 1} of ${poll.options.length}: ${option.label}, ${option.votes} ${option.votes === 1 ? 'vote' : 'votes'}`}
            >
              <OptionCard plan={plan} option={option} dx={dx} dragging={dragging} isMine={poll.viewer_option_id === option.id} />
            </div>
          </div>
          <p className="sr-only" aria-live="polite">{`${option.label}, ${option.votes} ${option.votes === 1 ? 'vote' : 'votes'}. Right arrow to vote, left arrow to skip.`}</p>
          {error ? <p role="alert" className="g-hint is-error text-center">{error}</p> : null}
          <div className="flex items-center justify-center gap-8 pb-[calc(env(safe-area-inset-bottom,0px)+28px)] pt-2">
            <button
              type="button"
              className={roundButton}
              style={{ background: 'var(--surface)', color: 'var(--ink)', boxShadow: 'inset 0 0 0 1px var(--line), var(--sh-2)' }}
              aria-label={`Skip ${option.label}`}
              disabled={phase !== 'deck'}
              onClick={skip}
            >
              <X className="h-7 w-7" />
            </button>
            <button
              type="button"
              className={roundButton}
              style={{ background: 'var(--tara)', color: NAVY, boxShadow: 'var(--sh-2)' }}
              aria-label={`Tara! Vote for ${option.label}`}
              aria-busy={phase === 'saving' || undefined}
              disabled={phase !== 'deck'}
              onClick={() => void tara()}
            >
              <Check className="h-7 w-7" strokeWidth={2.5} />
            </button>
          </div>
        </>
      ) : null}
    </div>,
    document.body,
  )
}

export default SwipeVote
