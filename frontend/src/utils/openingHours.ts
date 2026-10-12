// Weekly opening hours (places.opening_hours) and whether a place is open at a given moment.
// Mirrors backend/src/utils/openingHours.ts (the API parses the same shape); keep the two in sync.
//
// Shape: {"mon":[["08:00","17:00"]], ..., "note", "source", "checked"} or {"always":true}.
// A missing day means unknown, [] means closed that day, and a close at or before the open runs past midnight.

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
export type DayKey = (typeof DAY_KEYS)[number]
export type TimeRange = [string, string]

export type OpeningHours = Partial<Record<DayKey, TimeRange[]>> & {
  always?: boolean
  note?: string
  source?: string
  checked?: string
}

export type OpenStatus =
  | { state: 'open'; closesAt: number | null }
  | { state: 'opens-at'; opensAt: number; inDays: number }
  | { state: 'closed' }
  | { state: 'unknown' }

const CLOCK = /^([01]\d|2[0-4]):([0-5]\d)$/
// The Philippines has no daylight saving: Manila is always UTC+8.
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_NAMES: Record<DayKey, string> = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' }
const WEEK_ORDER: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

/** "08:30" -> 510 minutes after midnight; "24:00" -> 1440. */
export function clockMinutes(value: string): number | null {
  const match = CLOCK.exec(value)
  if (!match) return null
  const minutes = Number(match[1]) * 60 + Number(match[2])
  return minutes <= 24 * 60 ? minutes : null
}

function rangeMinutes([open, close]: TimeRange): [number, number] {
  const start = clockMinutes(open) ?? 0
  const end = clockMinutes(close) ?? 0
  return [start, end <= start ? end + 24 * 60 : end]
}

function manilaParts(now: Date) {
  const manila = new Date(now.getTime() + MANILA_OFFSET_MS)
  return { day: manila.getUTCDay(), minute: manila.getUTCHours() * 60 + manila.getUTCMinutes() }
}

/**
 * Open, closed or opening later at `now` in Manila time. closesAt and opensAt are minutes after that day's
 * midnight (closesAt can pass 1440 for a range that runs past midnight); null closesAt means it never closes.
 */
export function isOpenNow(hours: OpeningHours | null | undefined, now: Date): OpenStatus {
  if (!hours) return { state: 'unknown' }
  if (hours.always) return { state: 'open', closesAt: null }

  const { day: today, minute } = manilaParts(now)
  const dayRanges = (offset: number) => hours[DAY_KEYS[(today + offset + 7) % 7]]

  // Last night's late range still running.
  for (const range of dayRanges(-1) ?? []) {
    const [, end] = rangeMinutes(range)
    if (end > 24 * 60 && minute < end - 24 * 60) return { state: 'open', closesAt: end - 24 * 60 }
  }

  const todays = dayRanges(0)
  if (!todays) return { state: 'unknown' }
  for (const range of todays) {
    const [start, end] = rangeMinutes(range)
    if (minute >= start && minute < end) return { state: 'open', closesAt: start === 0 && end === 24 * 60 ? null : end }
  }

  const laterToday = todays.map(rangeMinutes).filter(([start]) => start > minute).sort((a, b) => a[0] - b[0])
  if (laterToday.length > 0) return { state: 'opens-at', opensAt: laterToday[0][0], inDays: 0 }
  for (let offset = 1; offset <= 7; offset++) {
    const ranges = dayRanges(offset)
    if (!ranges) return { state: 'unknown' }
    if (ranges.length > 0) return { state: 'opens-at', opensAt: Math.min(...ranges.map((range) => rangeMinutes(range)[0])), inDays: offset }
  }
  return { state: 'closed' }
}

/** The moment a Manila wall-clock time happens, for checking a plan stop ("2026-10-17", 9:30 AM -> 570). */
export function manilaDateTime(isoDate: string, minutes: number): Date {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, 0, minutes) - MANILA_OFFSET_MS)
}

/** 1020 -> "5 PM", 570 -> "9:30 AM"; minutes past 1440 wrap to the next day. */
export function formatOpeningClock(minutes: number): string {
  const hours = Math.floor(minutes / 60) % 24
  const mins = minutes % 60
  return `${hours % 12 || 12}${mins ? `:${String(mins).padStart(2, '0')}` : ''} ${hours < 12 ? 'AM' : 'PM'}`
}

/**
 * The place page's one-liner: "Open now · until 5 PM", "Closed · opens 8 AM tomorrow".
 * Null when the hours can't tell (show nothing then).
 */
export function openStatusLine(hours: OpeningHours | null | undefined, now: Date): { open: boolean; text: string } | null {
  const status = isOpenNow(hours, now)
  if (status.state === 'unknown') return null
  if (status.state === 'closed') return { open: false, text: 'Closed' }
  if (status.state === 'open') {
    if (status.closesAt === null) return { open: true, text: hours?.always ? 'Open anytime' : 'Open 24 hours' }
    const left = status.closesAt - manilaParts(now).minute
    return { open: true, text: `${left <= 60 ? 'Closes soon' : 'Open now'} · until ${formatOpeningClock(status.closesAt)}` }
  }
  const when =
    status.inDays === 0
      ? ''
      : status.inDays === 1
        ? ' tomorrow'
        : ` ${DAY_NAMES[DAY_KEYS[(manilaParts(now).day + status.inDays) % 7]].slice(0, 3)}`
  return { open: false, text: `Closed · opens ${formatOpeningClock(status.opensAt)}${when}` }
}

/** Monday-first rows for the weekly list; days the source doesn't cover are left out. */
export function weeklyHours(hours: OpeningHours | null | undefined): Array<{ day: DayKey; label: string; text: string }> {
  if (!hours || hours.always) return []
  return WEEK_ORDER.flatMap((day) => {
    const ranges = hours[day]
    if (!ranges) return []
    const text =
      ranges.length === 0
        ? 'Closed'
        : ranges
            .map((range) => {
              const [start, end] = rangeMinutes(range)
              return start === 0 && end === 24 * 60 ? 'Open 24 hours' : `${formatOpeningClock(start)}–${formatOpeningClock(end)}`
            })
            .join(', ')
    return [{ day, label: DAY_NAMES[day], text }]
  })
}

/** schema.org openingHoursSpecification for the place's JSON-LD; closed and unlisted days are left out. */
export function openingHoursSchema(hours: OpeningHours | null | undefined) {
  if (!hours) return []
  const day = (key: DayKey) => `https://schema.org/${DAY_NAMES[key]}`
  if (hours.always) return [{ '@type': 'OpeningHoursSpecification', dayOfWeek: WEEK_ORDER.map(day), opens: '00:00', closes: '23:59' }]
  return WEEK_ORDER.flatMap((key) =>
    (hours[key] ?? []).map(([opens, closes]) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: day(key),
      opens,
      // Google reads 24:00 poorly; 23:59 is its documented "until midnight".
      closes: closes === '24:00' ? '23:59' : closes,
    })),
  )
}

/** Today's key in Manila, to mark today's row. */
export function manilaDayKey(now: Date): DayKey {
  return DAY_KEYS[manilaParts(now).day]
}

/** A warning for a plan stop timed when the place is closed, or null when it's open or its hours are unknown. */
export function closedStopNote(hours: OpeningHours | null | undefined, isoDate: string, start: number): string | null {
  const status = isOpenNow(hours, manilaDateTime(isoDate, start))
  if (status.state === 'opens-at' && status.inDays === 0) return `Opens at ${formatOpeningClock(status.opensAt)}, after this time`
  if (status.state === 'opens-at' || status.state === 'closed') {
    return `Closed at this time on ${DAY_NAMES[DAY_KEYS[new Date(`${isoDate}T00:00:00Z`).getUTCDay()]]}`
  }
  return null
}
