import { useEffect, useId, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Stamp } from 'lucide-react'
import { Button, cx } from '../ui'
import { checkInAtPlace, getCurrentPosition } from '../../utils/passportApi'

type Status =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string }

const EXPLAINER = 'At this place now? Tap “I’m here” to collect this city’s Passport stamp.'
const TOAST_MS = 6000

/** `iconOnly` renders a 44px stamp button whose result shows as a toast above the nearest positioned parent. */
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
  onGuest: () => void
  iconOnly?: boolean
  className?: string
}) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [isToastVisible, setIsToastVisible] = useState(false)
  const explainerId = useId()
  const message = status.kind === 'done' || status.kind === 'error' ? status.message : ''

  useEffect(() => {
    if (!iconOnly || !isToastVisible) return
    const timer = window.setTimeout(() => setIsToastVisible(false), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [iconOnly, isToastVisible, message])

  const checkIn = async () => {
    if (!session) {
      onGuest()
      return
    }

    setStatus({ kind: 'working' })
    try {
      const coords = await getCurrentPosition()
      const result = await checkInAtPlace(placeId, coords, session)
      if (!result.available) {
        setStatus({ kind: 'error', message: 'The passport is getting set up. Try again soon.' })
      } else {
        setStatus({
          kind: 'done',
          message: result.new_stamp_city
            ? `New stamp: ${result.new_stamp_city}. Streak: ${result.streak_weeks} ${result.streak_weeks === 1 ? 'week' : 'weeks'}.`
            : `Visit saved at ${placeName}. Streak: ${result.streak_weeks} ${result.streak_weeks === 1 ? 'week' : 'weeks'}.`,
        })
      }
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Could not collect your stamp. Try again.' })
    }
    setIsToastVisible(true)
  }

  const button =
    status.kind === 'done' ? (
      <Button variant="line" block={!iconOnly} iconOnly={iconOnly} href="/passport" aria-label="View passport">
        <Stamp aria-hidden="true" />
        {iconOnly ? null : 'View passport'}
      </Button>
    ) : (
      <Button
        variant="line"
        block={!iconOnly}
        iconOnly={iconOnly}
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
      <span id={explainerId} className="sr-only">
        {EXPLAINER}
      </span>
      {iconOnly ? (
        <div className="pointer-events-none absolute inset-x-4 bottom-full mb-2 flex justify-center" aria-live="polite">
          {message && isToastVisible ? (
            <p
              className={cx('g-sm max-w-[420px] rounded-[var(--r-3)] px-4 py-2.5', status.kind === 'error' ? 'bg-[var(--bad-soft)] text-[var(--bad)]' : 'bg-[var(--ink)] text-[var(--on-ink)]')}
              style={{ boxShadow: 'var(--sh-2)' }}
            >
              {message}
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
