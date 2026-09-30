import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faStamp } from '@fortawesome/free-solid-svg-icons'
import InternalLink from '../InternalLink'
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
}: {
  placeId: string
  placeName: string
  session: Session | null | undefined
  onGuest: () => void
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
          ? `Bagong stamp: ${result.new_stamp_city}! Streak: ${result.streak_weeks} ${result.streak_weeks === 1 ? 'week' : 'weeks'}.`
          : `Checked in at ${placeName}. Streak: ${result.streak_weeks} ${result.streak_weeks === 1 ? 'week' : 'weeks'}.`,
      })
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Could not check in.' })
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[16px] border border-dashed border-[var(--line-strong)] px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-[var(--text-main)]">Nandito ka?</p>
        <p className="text-[12px] text-[var(--text-muted)]" aria-live="polite">
          {status.kind === 'done' || status.kind === 'error'
            ? status.message
            : 'Check in to collect this city’s Pasyal Passport stamp.'}
        </p>
      </div>
      {status.kind === 'done' ? (
        <InternalLink href="/passport" className="inline-flex h-10 items-center rounded-full bg-[var(--primary)] px-4 text-[13px] font-bold text-white">
          View passport
        </InternalLink>
      ) : (
        <button
          type="button"
          onClick={() => void checkIn()}
          disabled={status.kind === 'working'}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--primary)] px-4 text-[13px] font-bold text-white disabled:opacity-60"
        >
          <FontAwesomeIcon icon={faStamp} className="h-3.5 w-3.5 text-white" />
          {status.kind === 'working' ? 'Checking…' : 'Check in'}
        </button>
      )}
    </div>
  )
}

export default CheckInButton
