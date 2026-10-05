import { useState } from 'react'
import { cx } from './ui'

type BirthdatePickerProps = {
  id?: string
  value: string
  onChange: (value: string) => void
  helperText?: string
  error?: string
  minYear?: number
  maxYear?: number
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function splitDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? { year: match[1], month: String(Number(match[2])), day: String(Number(match[3])) } : { year: '', month: '', day: '' }
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year || 2000, month, 0)).getUTCDate()
}

/** Month, day and year selects: on phones each opens the native wheel, which beats paging a calendar back decades. */
function BirthdatePicker({ id, value, onChange, helperText, error, minYear = 1900, maxYear = new Date().getUTCFullYear() }: BirthdatePickerProps) {
  const [parts, setParts] = useState(() => splitDate(value))
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setParts(splitDate(value))
  }

  const years = Array.from({ length: maxYear - minYear + 1 }, (_, index) => String(maxYear - index))
  const dayCount = parts.month ? daysInMonth(Number(parts.year), Number(parts.month)) : 31

  const update = (patch: Partial<typeof parts>) => {
    const next = { ...parts, ...patch }
    if (next.month && next.day && Number(next.day) > daysInMonth(Number(next.year), Number(next.month))) next.day = ''
    setParts(next)
    if (next.year && next.month && next.day) {
      onChange(`${next.year}-${next.month.padStart(2, '0')}-${next.day.padStart(2, '0')}`)
    }
  }

  const hintId = id ? `${id}-hint` : undefined
  const selectClass = 'g-input g-select min-w-0'

  return (
    <div>
      <div className="grid grid-cols-[1.4fr_1fr_1.1fr] gap-2" role="group" aria-label="Birthdate">
        <select id={id} className={selectClass} value={parts.month} onChange={(event) => update({ month: event.target.value })} aria-label="Month" aria-invalid={Boolean(error)} aria-describedby={hintId}>
          <option value="" disabled>Month</option>
          {MONTHS.map((name, index) => (
            <option key={name} value={String(index + 1)}>{name}</option>
          ))}
        </select>
        <select className={selectClass} value={parts.day} onChange={(event) => update({ day: event.target.value })} aria-label="Day" aria-invalid={Boolean(error)}>
          <option value="" disabled>Day</option>
          {Array.from({ length: dayCount }, (_, index) => (
            <option key={index + 1} value={String(index + 1)}>{index + 1}</option>
          ))}
        </select>
        <select className={selectClass} value={parts.year} onChange={(event) => update({ year: event.target.value })} aria-label="Year" aria-invalid={Boolean(error)}>
          <option value="" disabled>Year</option>
          {years.map((year) => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
      </div>
      {error || helperText ? (
        <p id={hintId} className={cx('g-hint mt-1.5', error && 'is-error')}>{error || helperText}</p>
      ) : null}
    </div>
  )
}

export default BirthdatePicker
