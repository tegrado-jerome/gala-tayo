import { getVibe, vibeForCategory } from './vibes.ts'

/** Monthly "Gala Wrapped" recap, computed only from the user's real check-ins and plans. */

export type WrappedCheckin = {
  place_id: string
  city: string | null
  category?: string | null
  created_at: string
}

export type WrappedInput = {
  checkins: WrappedCheckin[]
  plans: Array<{ created_at: string }>
}

export type MonthlyWrapped = {
  key: string
  label: string
  places: number
  visits: number
  /** Cities visited this month, most visited first. */
  cities: string[]
  /** Cities stamped for the first time this month. */
  newCities: string[]
  plans: number
  topCategory: { name: string; places: number } | null
}

/** A month needs this many different places checked in before it gets a Wrapped. */
export const MIN_WRAPPED_PLACES = 2
const TIME_ZONE = 'Asia/Manila'

/** "2026-10" for a timestamp, in Manila time (where check-in days are counted). */
export function monthKey(iso: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit' }).formatToParts(new Date(iso))
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  return `${year}-${month}`
}

export function monthLabel(key: string) {
  const [year, month] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function rankByCount(values: string[]) {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

export function buildMonthlyWrapped(input: WrappedInput, key: string): MonthlyWrapped {
  const inMonth = input.checkins.filter((checkin) => monthKey(checkin.created_at) === key)
  const firstVisitByPlace = new Map<string, WrappedCheckin>()
  for (const checkin of [...inMonth].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (!firstVisitByPlace.has(checkin.place_id)) firstVisitByPlace.set(checkin.place_id, checkin)
  }
  const uniquePlaces = [...firstVisitByPlace.values()]

  const firstMonthByCity = new Map<string, string>()
  for (const checkin of input.checkins) {
    const city = checkin.city?.trim()
    if (!city) continue
    const month = monthKey(checkin.created_at)
    const known = firstMonthByCity.get(city)
    if (!known || month < known) firstMonthByCity.set(city, month)
  }

  const cities = rankByCount(inMonth.map((checkin) => checkin.city?.trim() ?? '').filter(Boolean)).map(([city]) => city)
  // Place types stay off the site, so the month's top pick is told as a vibe ("Heritage", "Food trip").
  const vibeLabel = (category: string | null | undefined) => {
    const vibe = vibeForCategory(category)
    return vibe ? getVibe(vibe).label : ''
  }
  const categories = rankByCount(uniquePlaces.map((checkin) => vibeLabel(checkin.category)).filter(Boolean))
  const [topName, topCount] = categories[0] ?? []

  return {
    key,
    label: monthLabel(key),
    places: uniquePlaces.length,
    visits: inMonth.length,
    cities,
    newCities: cities.filter((city) => firstMonthByCity.get(city) === key),
    plans: input.plans.filter((plan) => monthKey(plan.created_at) === key).length,
    // One place is not a trend: the top category needs at least two places.
    topCategory: topName && topCount && topCount >= 2 ? { name: topName, places: topCount } : null,
  }
}

/** Months with enough activity for a Wrapped, newest first. */
export function wrappedMonths(input: WrappedInput) {
  const placesByMonth = new Map<string, Set<string>>()
  for (const checkin of input.checkins) {
    const key = monthKey(checkin.created_at)
    const places = placesByMonth.get(key) ?? new Set<string>()
    places.add(checkin.place_id)
    placesByMonth.set(key, places)
  }
  return [...placesByMonth.entries()]
    .filter(([, places]) => places.size >= MIN_WRAPPED_PLACES)
    .map(([key]) => key)
    .sort((a, b) => b.localeCompare(a))
}

/** How many more places this month still needs before it gets a Wrapped. */
export function placesToUnlock(input: WrappedInput, key: string) {
  const places = new Set(input.checkins.filter((checkin) => monthKey(checkin.created_at) === key).map((checkin) => checkin.place_id))
  return Math.max(0, MIN_WRAPPED_PLACES - places.size)
}
