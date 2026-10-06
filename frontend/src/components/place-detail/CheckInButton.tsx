import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { Session } from '@supabase/supabase-js'
import { Stamp } from '@phosphor-icons/react/dist/csr/Stamp'
import { WarningCircle } from '@phosphor-icons/react/dist/csr/WarningCircle'
import { Button, Sheet, buttonClass, cx } from '../ui'
import { checkInAtPlace, getCurrentPosition } from '../../utils/passportApi'

type Status =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string }

function weeks(count: number) {
  return `${count} ${count === 1 ? 'week' : 'weeks'}`
}

function NewStampSheet({ city, streakWeeks, onClose }: { city: string; streakWeeks: number; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const today = new Date().toLocaleDateString('en', { month: 'short', day: 'numeric' })

  useEffect(() => {
    closeRef.current?.focus()
    // A short buzz where supported, timed with the stamp landing.
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) window.setTimeout(() => navigator.vibrate?.(14), 210)
  }, [])

  return createPortal(
    <Sheet open onClose={onClose} labelledBy={titleId}>
      <div className="flex flex-col items-center pb-1 pt-4 text-center">
        <div className="g-thud-wrap" aria-hidden="true">
          <div className="g-stamp-big g-thud" style={{ '--g-rot': '-6deg' } as CSSProperties}>
            <div className="min-w-0">
              <b>{city}</b>
              <span>{today}</span>
            </div>
          </div>
          <span className="g-thud-ring" />
        </div>
        <h2 id={titleId} className="g-h2 g-fade-in mt-6" style={{ animationDelay: '200ms' }}>New stamp: {city}</h2>
        <p className="g-sm g-fade-in mt-1.5" style={{ color: 'var(--sea)', animationDelay: '300ms' }}>
          {streakWeeks > 0 ? `${streakWeeks}-week streak. Go out again next week to keep it going!` : 'Go out once a week to start a streak!'}
        </p>
        <div className="mt-6 grid w-full grid-cols-2 gap-2">
          <Button variant="tara" href="/passport">See passport</Button>
          <button type="button" ref={closeRef} className={buttonClass({ variant: 'line' })} onClick={onClose}>
            Nice!
          </button>
        </div>
      </div>
    </Sheet>,
    document.body,
  )
}

const EXPLAINER = 'At this place now? Tap “I’m here” to collect this city’s Passport stamp.'
const TOAST_MS = 6000

/** `iconOnly` renders a 48px square stamp button whose result shows as a toast above the nearest positioned parent. */
function CheckInButton({
  placeId,
  placeName,
  session,
  onGuest,
  iconOnly,
  className,
}: {
  placeId: string
  placeName: string
  session: Session | null | undefined
  /** Called for visitors without a session; `retry` re-runs the check-in once a guest session exists. */
  onGuest: (retry: (session: Session) => void) => void
  iconOnly?: boolean
  className?: string
}) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [isToastVisible, setIsToastVisible] = useState(false)
  const [newStamp, setNewStamp] = useState<{ city: string; streakWeeks: number } | null>(null)
  const explainerId = useId()
  const message = status.kind === 'done' || status.kind === 'error' ? status.message : ''

  useEffect(() => {
    if (!iconOnly || !isToastVisible) return
    const timer = window.setTimeout(() => setIsToastVisible(false), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [iconOnly, isToastVisible, message])

  const checkIn = async (activeSession: Session | null | undefined = session) => {
    if (!activeSession) {
      onGuest((guestSession) => void checkIn(guestSession))
      return
    }

    setStatus({ kind: 'working' })
    try {
      const coords = await getCurrentPosition()
      const result = await checkInAtPlace(placeId, coords, activeSession)
      if (!result.available) {
        setStatus({ kind: 'error', message: 'The passport is getting set up. Try again soon.' })
      } else if (result.new_stamp_city) {
        setStatus({ kind: 'done', message: `New stamp: ${result.new_stamp_city}.` })
        setNewStamp({ city: result.new_stamp_city, streakWeeks: result.streak_weeks })
        return
      } else {
        setStatus({ kind: 'done', message: `Visit saved at ${placeName}. Streak: ${weeks(result.streak_weeks)}.` })
      }
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Could not collect your stamp. Try again.' })
    }
    setIsToastVisible(true)
  }

  const variant = iconOnly ? 'soft' : 'line'
  const iconClass = iconOnly ? 'h-12 w-12 rounded-[var(--r-2)]' : undefined
  const button =
    status.kind === 'done' ? (
      <Button variant={variant} block={!iconOnly} iconOnly={iconOnly} className={iconClass} href="/passport" aria-label="View passport">
        <Stamp aria-hidden="true" />
        {iconOnly ? null : 'View passport'}
      </Button>
    ) : (
      <Button
        variant={variant}
        block={!iconOnly}
        iconOnly={iconOnly}
        className={iconClass}
        onClick={() => void checkIn()}
        loading={status.kind === 'working'}
        title={EXPLAINER}
        aria-label={iconOnly ? 'I’m here' : undefined}
        aria-describedby={explainerId}
      >
        <Stamp aria-hidden="true" />
        {iconOnly ? null : 'I’m here'}
      </Button>
    )

  return (
    <div className={cx('min-w-0', iconOnly && 'shrink-0', className)}>
      {button}
      {newStamp ? <NewStampSheet city={newStamp.city} streakWeeks={newStamp.streakWeeks} onClose={() => setNewStamp(null)} /> : null}
      <span id={explainerId} className="sr-only">
        {EXPLAINER}
      </span>
      {iconOnly ? (
        <div className="pointer-events-none absolute inset-x-4 bottom-full mb-2 flex justify-center" aria-live="polite">
          {message && isToastVisible ? (
            <p className={cx('g-toast', status.kind === 'error' ? 'is-bad' : 'is-ok')}>
              <span className="g-toast-ic" aria-hidden="true">
                {status.kind === 'error' ? <WarningCircle weight="bold" /> : <Stamp weight="bold" className="g-thud" />}
              </span>
              <span className="g-toast-body">{message}</span>
            </p>
          ) : null}
        </div>
      ) : (
        <p className={cx('g-xs mt-2 empty:mt-0', status.kind === 'error' ? 'text-[var(--bad)]' : 'g-mut')} aria-live="polite">
          {message}
        </p>
      )}
    </div>
  )
}

export default CheckInButton
