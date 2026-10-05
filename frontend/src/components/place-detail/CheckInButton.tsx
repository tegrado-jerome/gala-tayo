import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Stamp } from 'lucide-react'
import { Button, cx } from '../ui'
import { checkInAtPlace, getCurrentPosition } from '../../utils/passportApi'

type Status =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string }

function CheckInButton({
  placeId,
  placeName,
  session,
  onGuest,
  className,
}: {
  placeId: string
  placeName: string
  session: Session | null | undefined
  onGuest: () => void
  className?: string
}) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

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
        return
      }
      setStatus({
        kind: 'done',
        message: result.new_stamp_city
          ? `New stamp: ${result.new_stamp_city}. Streak: ${result.streak_weeks} ${result.streak_weeks === 1 ? 'week' : 'weeks'}.`
          : `Checked in at ${placeName}. Streak: ${result.streak_weeks} ${result.streak_weeks === 1 ? 'week' : 'weeks'}.`,
      })
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Could not check in.' })
    }
  }

  return (
    <div className={cx('min-w-0', className)}>
      {status.kind === 'done' ? (
        <Button variant="line" block href="/passport">
          <Stamp aria-hidden="true" />
          View passport
        </Button>
      ) : (
        <Button variant="line" block onClick={() => void checkIn()} loading={status.kind === 'working'}>
          <Stamp aria-hidden="true" />
          Check in
        </Button>
      )}
      <p className={cx('g-xs mt-2', status.kind === 'error' ? 'text-[var(--bad)]' : 'g-mut')} aria-live="polite">
        {status.kind === 'done' || status.kind === 'error' ? status.message : 'Here now? Check in for this city’s Pasyal Passport stamp.'}
      </p>
    </div>
  )
}

export default CheckInButton
