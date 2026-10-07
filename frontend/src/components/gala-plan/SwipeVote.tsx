import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check } from '@phosphor-icons/react/dist/csr/Check'
import { X } from '@phosphor-icons/react/dist/csr/X'
import { AvatarStack, Button } from '../ui'
import { personAvatar, personName } from './BarkadaPanel'
import type { GalaPlanBarkada } from '../../utils/galaPlanBarkadaApi'
import type { GalaPlanOwner } from '../../utils/galaPlansApi'
import { resizedMediaUrl } from '../../data/r2Config'

export type SwipeCard = {
  id: string
  title: string
  image: string | null
  meta: string | null
  votes: number
  voters: GalaPlanOwner[]
  isMine: boolean
}

type Phase = 'deck' | 'saving' | 'done' | 'end' | 'rated'

const SWIPE_PX = 96
const FLY_MS = 220

// White text on the ink main action.
const ON_TARA = '#ffffff'

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function OptionCard({ card, dx, dragging }: { card: SwipeCard; dx: number; dragging: boolean }) {
  const { image, meta, isMine } = card
  const lean = Math.max(-1, Math.min(1, dx / SWIPE_PX))
  const others = card.votes - (isMine ? 1 : 0)

  return (
    <div
      className="relative h-full w-full overflow-hidden select-none"
      style={{
        borderRadius: 'var(--r-4)',
        background: image ? 'var(--fill-2)' : 'var(--sea-soft)',
        boxShadow: 'var(--sh-3)',
        transform: `translateX(${dx}px) rotate(${dx / 24}deg)`,
        transition: dragging ? 'none' : `transform ${FLY_MS}ms var(--ease-g)`,
      }}
    >
      {image ? <img src={resizedMediaUrl(image, 'card')} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" /> : null}
      <div className="absolute inset-0" style={{ background: image ? 'linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,0.88) 100%)' : undefined }} aria-hidden="true" />

      <span
        className="absolute left-5 top-5 rounded-[var(--r-1)] px-3 py-1"
        style={{ border: '3px solid var(--tara)', color: 'var(--tara-ink)', background: 'var(--surface)', font: '700 20px/1 var(--font-display)', transform: 'rotate(-12deg)', opacity: Math.max(0, lean) }}
        aria-hidden="true"
      >
        YES!
      </span>
      <span
        className="absolute right-5 top-5 rounded-[var(--r-1)] px-3 py-1"
        style={{ border: '3px solid var(--ink)', color: 'var(--ink)', background: 'var(--surface)', font: '700 20px/1 var(--font-display)', transform: 'rotate(12deg)', opacity: Math.max(0, -lean) }}
        aria-hidden="true"
      >
        PASS
      </span>

      <div className="absolute inset-x-0 bottom-0 p-5" style={{ color: image ? '#fff' : 'var(--ink)' }}>
        {isMine ? <span className="g-tag is-solid mb-2">Your pick</span> : null}
        <p className={image ? 'g-h1' : 'g-d1'} style={{ color: 'inherit', overflowWrap: 'anywhere' }}>{card.title}</p>
        {meta ? <p className="g-sm mt-1" style={{ opacity: 0.85 }}>{meta}</p> : null}
        <div className="mt-3 flex min-h-7 items-center gap-2">
          {card.voters.length > 0 ? (
            <AvatarStack people={card.voters.map((voter) => ({ id: voter.user_id, avatarUrl: personAvatar(voter), name: personName(voter) }))} max={4} size={26} />
          ) : null}
          <span className="g-sm font-semibold">
            {card.votes === 0 ? 'Be the first to vote' : isMine && others === 0 ? 'Only you so far' : `${card.votes} already said yes`}
          </span>
        </div>
      </div>
    </div>
  )
}

type SwipeVoteProps = {
  title: string
  cards: SwipeCard[]
  /** Saves a tara for the card and returns the updated barkada. */
  onTara: (card: SwipeCard) => Promise<GalaPlanBarkada>
  /** When set, every card gets a tara or a pass and the deck runs to the end; otherwise the first tara is the pick. */
  onPass?: (card: SwipeCard) => Promise<GalaPlanBarkada>
  onChange: (barkada: GalaPlanBarkada) => void
  onClose: () => void
}

/** Full-screen deck. Swipe right (or the check button) for tara, left (or the X button) to pass. */
function SwipeVote({ title, cards, onTara, onPass, onChange, onClose }: SwipeVoteProps) {
  const [index, setIndex] = useState(0)
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [phase, setPhase] = useState<Phase>('deck')
  const [result, setResult] = useState<{ label: string; others: number } | null>(null)
  const [taraCount, setTaraCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const startX = useRef<number | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const card = cards[index]
  const next = cards[index + 1]
  const ratesAll = Boolean(onPass)

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

  const fly = (direction: 1 | -1) =>
    new Promise<void>((resolve) => {
      if (prefersReducedMotion()) {
        resolve()
        return
      }
      setDx(direction * (window.innerWidth + 200))
      window.setTimeout(resolve, FLY_MS)
    })

  const advance = () => {
    setDx(0)
    if (index + 1 >= cards.length) {
      setPhase(ratesAll ? 'rated' : 'end')
      return
    }
    setIndex(index + 1)
    setPhase('deck')
  }

  // The deck only moves on once the vote is saved, so a failed save never drops a vote.
  const save = async (direction: 1 | -1, action: () => Promise<GalaPlanBarkada>) => {
    setPhase('saving')
    const flown = fly(direction)
    try {
      const barkada = await action()
      onChange(barkada)
      await flown
      return barkada
    } catch (voteError) {
      await flown
      setError(voteError instanceof Error ? voteError.message : 'Could not save your vote.')
      setDx(0)
      setPhase('deck')
      return null
    }
  }

  const skip = async () => {
    if (phase !== 'deck' || !card) return
    setError(null)
    if (!onPass) {
      setPhase('saving')
      await fly(-1)
      advance()
      return
    }
    if (await save(-1, () => onPass(card))) advance()
  }

  const tara = async () => {
    if (phase !== 'deck' || !card) return
    setError(null)
    const picked = card
    if (!(await save(1, () => onTara(picked)))) return
    if (ratesAll) {
      setTaraCount((count) => count + 1)
      advance()
      return
    }
    setResult({ label: picked.title, others: Math.max(0, picked.votes - (picked.isMine ? 1 : 0)) })
    setPhase('done')
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
    else if (dx < -SWIPE_PX) void skip()
    else setDx(0)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') onClose()
    else if (event.key === 'ArrowRight') void tara()
    else if (event.key === 'ArrowLeft') void skip()
  }

  const restart = () => {
    setTaraCount(0)
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
          <h2 id="swipe-vote-title" className="g-h3 truncate">{title}</h2>
          <p className="g-xs g-mut">
            {phase === 'deck' || phase === 'saving' ? `Vote with the group · ${index + 1} of ${cards.length}` : 'Vote with the group'}
          </p>
        </div>
        <span className="w-11 shrink-0" aria-hidden="true" />
      </header>

      {phase === 'done' && result ? (
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col items-center justify-center px-6 text-center">
          <span className="g-press grid h-24 w-24 place-items-center rounded-full" style={{ background: 'var(--tara)', color: ON_TARA, ['--g-rot' as string]: '-6deg' }} aria-hidden="true">
            <Check className="h-10 w-10" weight="bold" />
          </span>
          <p className="g-h1 mt-6" role="status">You picked {result.label}</p>
          <p className="g-mut mt-2">{result.others === 0 ? "You're the first! Now pull your friends in." : `${result.others} ${result.others === 1 ? 'other' : 'others'} too`}</p>
          <Button variant="ink" className="mt-8" onClick={onClose}>Back to plan</Button>
        </div>
      ) : phase === 'rated' ? (
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col items-center justify-center px-6 text-center">
          <span className="grid h-24 w-24 place-items-center rounded-full" style={{ background: 'var(--tara)', color: ON_TARA }} aria-hidden="true">
            <Check className="h-10 w-10" weight="bold" />
          </span>
          <p className="g-h1 mt-6" role="status">All done!</p>
          <p className="g-mut mt-2">
            {taraCount === 0 ? 'You passed on every place.' : `You said yes to ${taraCount} of ${cards.length}.`} The ranking updates as the group swipes.
          </p>
          <Button variant="ink" className="mt-8" onClick={onClose}>See the ranking</Button>
        </div>
      ) : phase === 'end' ? (
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="g-h1" role="status">Nothing picked</p>
          <p className="g-mut mt-2">You skipped every option. Go again or close the deck.</p>
          <div className="mt-8 flex gap-2">
            <Button variant="soft" onClick={onClose}>Close</Button>
            <Button variant="ink" onClick={restart}>Start over</Button>
          </div>
        </div>
      ) : card ? (
        <>
          <div className="relative mx-auto w-full max-w-[420px] min-h-0 flex-1 px-5 py-4">
            {next ? (
              <div className="absolute inset-x-5 inset-y-4 scale-[0.92]" aria-hidden="true">
                <OptionCard card={next} dx={0} dragging />
              </div>
            ) : null}
            <div
              className="relative h-full cursor-grab touch-none active:cursor-grabbing"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerEnd}
              onPointerCancel={onPointerEnd}
              role="group"
              aria-label={`Option ${index + 1} of ${cards.length}: ${card.title}, ${card.votes} ${card.votes === 1 ? 'vote' : 'votes'}`}
            >
              <OptionCard card={card} dx={dx} dragging={dragging} />
            </div>
          </div>
          <p className="sr-only" aria-live="polite">{`${card.title}, ${card.votes} ${card.votes === 1 ? 'vote' : 'votes'}. Right arrow for yes, left arrow to pass.`}</p>
          {error ? <p role="alert" className="g-hint is-error text-center">{error}</p> : null}
          <div className="flex items-center justify-center gap-8 pb-[calc(env(safe-area-inset-bottom,0px)+28px)] pt-2">
            <button
              type="button"
              className={roundButton}
              style={{ background: 'var(--surface)', color: 'var(--ink)', boxShadow: 'inset 0 0 0 1px var(--line), var(--sh-2)' }}
              aria-label={`${ratesAll ? 'Pass on' : 'Skip'} ${card.title}`}
              disabled={phase !== 'deck'}
              onClick={() => void skip()}
            >
              <X className="h-7 w-7" />
            </button>
            <button
              type="button"
              className={roundButton}
              style={{ background: 'var(--tara)', color: ON_TARA, boxShadow: 'var(--sh-2)' }}
              aria-label={`Yes! Vote for ${card.title}`}
              aria-busy={phase === 'saving' || undefined}
              disabled={phase !== 'deck'}
              onClick={() => void tara()}
            >
              <Check className="h-7 w-7" weight="bold" />
            </button>
          </div>
        </>
      ) : null}
    </div>,
    document.body,
  )
}

export default SwipeVote
