import { isOutdoorPlace, isRainLikelyHour, type HourForecast } from './weather.ts'
import { isRainFriendly } from './saanTayo.ts'

/*
 * Pure plan math shared by the itinerary and the barkada deck: a time slot for a stop added after the
 * plan was made, and indoor swaps for outdoor stops when rain is likely. The group size and every
 * per-head number live in planCost.ts. No data imports, so node:test can run it.
 */

/** "6:30 PM", "6 pm", "18:30" -> minutes after midnight; null when it isn't a clock time. */
export function parseClockLabel(label: string | null | undefined): number | null {
  const text = label?.trim() ?? ''
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?\s*m?\.?$/i)
  if (!match) return null
  let hours = Number(match[1])
  const minutes = Number(match[2] ?? 0)
  const meridiem = match[3]?.toLowerCase()
  if (!meridiem && match[2] === undefined) return null
  if (minutes > 59 || hours > 23 || (meridiem && (hours < 1 || hours > 12))) return null
  if (meridiem === 'p' && hours < 12) hours += 12
  if (meridiem === 'a' && hours === 12) hours = 0
  return hours * 60 + minutes
}

export function formatClockLabel(minutes: number) {
  const hours = Math.floor(minutes / 60) % 24
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`
}

// When a place can start a visit (earliest, latest start) and a sensible stay, by category.
// Latest starts leave about an hour before usual closing; parks end with the daylight.
const START_WINDOW: Record<string, [number, number]> = {
  Museum: [9 * 60, 15 * 60 + 30],
  Heritage: [8 * 60, 16 * 60 + 30],
  Park: [6 * 60, 16 * 60 + 30],
  Activity: [8 * 60, 16 * 60],
  Mall: [10 * 60, 20 * 60 + 30],
  Cinema: [10 * 60 + 30, 21 * 60],
  Food: [7 * 60, 20 * 60 + 30],
  Cafe: [7 * 60, 20 * 60],
  Nightlife: [19 * 60, 23 * 60],
}
const DEFAULT_WINDOW: [number, number] = [8 * 60, 19 * 60]

const STAY: Record<string, number> = { Food: 75, Cafe: 60, Park: 60, Heritage: 60, Museum: 90, Mall: 90, Cinema: 150, Nightlife: 90, Activity: 90 }
const DEFAULT_STAY = 60
const DEFAULT_TRAVEL = 20

export function stayMinutes(category: string | null | undefined) {
  return STAY[category ?? ''] ?? DEFAULT_STAY
}

export type SlotStop<P> = { time_label: string | null; estimated_minutes: number | null; place: P }
export type NewStop<P> = { category: string | null; place: P }

const ceilTo5 = (minutes: number) => Math.ceil(minutes / 5) * 5

/**
 * Where a new stop fits and when: the latest position where it starts within its opening window and
 * still leaves time for the next stop; failing that, the latest position it can open at, pushing the
 * stops after it later. Plans with no times at all keep it untimed at the end.
 * Returns the insert index and every stop's time label after inserting (the new stop included).
 */
export function slotForNewStop<P>(
  stops: Array<SlotStop<P>>,
  added: NewStop<P>,
  travel: (from: P, to: P) => number | null = () => null,
): { index: number; times: Array<string | null> } {
  const starts = stops.map((stop) => parseClockLabel(stop.time_label))
  if (starts.every((start) => start === null)) return { index: stops.length, times: [...stops.map((stop) => stop.time_label), null] }

  const [open, latest] = START_WINDOW[added.category ?? ''] ?? DEFAULT_WINDOW
  const stay = stayMinutes(added.category)
  const ride = (from: P, to: P) => travel(from, to) ?? DEFAULT_TRAVEL
  const endOf = (index: number) => (starts[index] ?? 0) + (stops[index].estimated_minutes ?? DEFAULT_STAY)
  const timedBefore = (index: number) => {
    for (let i = index - 1; i >= 0; i -= 1) if (starts[i] !== null) return i
    return -1
  }
  const timedFrom = (index: number) => {
    for (let i = index; i < stops.length; i += 1) if (starts[i] !== null) return i
    return -1
  }

  const options = []
  for (let index = stops.length; index >= 0; index -= 1) {
    const prev = timedBefore(index)
    const next = timedFrom(index)
    let start = prev >= 0 ? endOf(prev) + ride(stops[prev].place, added.place) : open
    if (prev < 0 && next >= 0) start = Math.min(latest, (starts[next] as number) - stay - ride(added.place, stops[next].place))
    start = ceilTo5(Math.max(open, start))
    if (start > latest) continue
    const overlap = next >= 0 ? start + stay + ride(added.place, stops[next].place) - (starts[next] as number) : 0
    options.push({ index, start, overlap: Math.max(0, overlap) })
  }

  // The first stop's position can always open (its start is clamped into the window), so options is never empty.
  const best = options.find((option) => option.overlap === 0) ?? options[0]
  const push = ceilTo5(best.overlap)
  const times = stops.map((stop, i) => (i >= best.index && starts[i] !== null && push > 0 ? formatClockLabel((starts[i] as number) + push) : stop.time_label))
  times.splice(best.index, 0, formatClockLabel(best.start))
  return { index: best.index, times }
}

export type RainStop = {
  time_label: string | null
  estimated_minutes: number | null
  place_id: string
  place: { name: string; category: string | null; city: string | null }
}
export type IndoorOption = { id: string; name: string; category: string | null; city: string | null; goodFor: string[] }
export type RainSwap<O extends IndoorOption> = { index: number; time: string; option: O }

/**
 * Outdoor stops whose visit overlaps an hour with rain likely on the plan day, each paired with an
 * indoor place in the same city that is open at that time and isn't in the plan yet (sights before restaurants). Untimed stops
 * are left alone: there is no way to tell if they meet the rain.
 */
export function rainSwaps<O extends IndoorOption>(stops: RainStop[], hours: HourForecast[], date: string, options: O[]): Array<RainSwap<O>> {
  const rainyHours = hours.filter((hour) => hour.time.startsWith(date) && isRainLikelyHour(hour)).map((hour) => Number(hour.time.slice(11, 13)) * 60)
  if (rainyHours.length === 0) return []

  const taken = new Set(stops.map((stop) => stop.place_id))
  const indoor = options
    .filter((option) => isRainFriendly({ category: option.category, name: option.name, goodFor: option.goodFor }))
    .sort((a, b) => Number(a.category === 'Food') - Number(b.category === 'Food'))
  const swaps: Array<RainSwap<O>> = []

  stops.forEach((stop, index) => {
    const start = parseClockLabel(stop.time_label)
    if (start === null || !isOutdoorPlace({ category: stop.place.category, name: stop.place.name })) return
    const end = start + (stop.estimated_minutes ?? stayMinutes(stop.place.category))
    if (!rainyHours.some((hour) => hour < end && hour + 60 > start)) return

    const city = stop.place.city?.trim().toLowerCase()
    // Same city, and open at that hour: no museum suggested for a 4:45 PM slot.
    const option = indoor.find((candidate) => {
      const [open, latest] = START_WINDOW[candidate.category ?? ''] ?? DEFAULT_WINDOW
      return !taken.has(candidate.id) && Boolean(city) && candidate.city?.trim().toLowerCase() === city && start >= open && start <= latest
    })
    if (!option) return
    taken.add(option.id)
    swaps.push({ index, time: stop.time_label as string, option })
  })
  return swaps
}
