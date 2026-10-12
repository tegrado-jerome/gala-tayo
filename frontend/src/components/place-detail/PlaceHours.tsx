import { useState } from 'react'
import { CaretDown } from '@phosphor-icons/react/dist/csr/CaretDown'
import { Door } from '@phosphor-icons/react/dist/csr/Door'
import { manilaDayKey, openStatusLine, weeklyHours, type OpeningHours } from '../../utils/openingHours'

function sourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/** "2026-10" -> "Oct 2026". */
function formatChecked(checked: string | undefined) {
  const match = checked?.match(/^(\d{4})-(\d{2})$/)
  if (!match) return null
  return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)))
}

/** "Open now · until 5 PM" with the week in a details block, for the place key facts list. Renders nothing without hours. */
export default function PlaceHours({ hours }: { hours: OpeningHours | null | undefined }) {
  // Prerendered pages are snapshots taken at build time: they list the week but never claim "open now".
  const [now] = useState(() => (typeof navigator !== 'undefined' && navigator.webdriver ? null : new Date()))
  if (!hours) return null

  const status = now ? openStatusLine(hours, now) : null
  const [state, detail] = status ? status.text.split(' · ') : []
  const line = status ? (
    <b>
      <span className={status.open ? 'pd-hours-open' : 'pd-hours-shut'}>{state}</span>
      {detail ? ` · ${detail}` : null}
    </b>
  ) : null
  const days = weeklyHours(hours)

  if (days.length === 0) {
    return (
      <li>
        <div>
          <Door weight="light" aria-hidden="true" />
          <span className="min-w-0">
            {line ?? <b>Open anytime</b>}
            <span>{hours.note ?? 'Open access, no gate'}</span>
          </span>
        </div>
      </li>
    )
  }

  const today = now ? manilaDayKey(now) : null
  const host = hours.source ? sourceHost(hours.source) : null
  const checked = formatChecked(hours.checked)
  return (
    <li>
      <details className="pd-hours">
        <summary>
          <Door weight="light" aria-hidden="true" />
          <span className="min-w-0">
            {line ?? <b>Opening hours</b>}
            <span>{line ? 'Opening hours' : 'See the week'}</span>
          </span>
          <CaretDown weight="light" aria-hidden="true" className="pd-hours-caret" />
        </summary>
        <ul className="pd-hours-week" aria-label="Opening hours by day">
          {days.map((day) => (
            <li key={day.day} className={day.day === today ? 'is-today' : undefined}>
              <span>
                {day.label}
                {day.day === today ? <span className="sr-only"> (today)</span> : null}
              </span>
              <span>{day.text}</span>
            </li>
          ))}
        </ul>
        {hours.note ? <p className="pd-hours-note">{hours.note}</p> : null}
        {hours.source && host ? (
          <p className="pd-hours-src">
            From{' '}
            <a href={hours.source} target="_blank" rel="noopener noreferrer nofollow">
              {host}
            </a>
            {checked ? `, checked ${checked}` : null}
          </p>
        ) : null}
      </details>
    </li>
  )
}
