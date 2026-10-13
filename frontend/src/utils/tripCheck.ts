// Trip Check: a short audit of an itinerary from GalaTayo's own data. Every check is plain code on fields
// a place really has (opening_hours, budget_min, travel_info, coordinates) and the law-dated holidays;
// a stop with no data for a check is said to have none rather than guessed.
import { distanceKm } from './planCost.ts'
import { DAY_KEYS, type OpeningHours } from './openingHours.ts'
import { addDays, formatDay, peakHolidayOn, type CalendarDate } from './phHolidays.ts'
import { formatPesoRange, gateTotal, shareOf } from './gateFees.ts'
import type { TravelInfo } from './travelInfo.ts'

export type CheckPlace = {
  slug: string
  name: string
  latitude: number | null
  longitude: number | null
  budget_min?: number | null
  opening_hours?: OpeningHours | null
  travel_info?: TravelInfo | null
}
export type CheckStop = { day: number; place: CheckPlace }
export type CheckLevel = 'problem' | 'heads-up' | 'ok'
export type CheckItem = { level: CheckLevel; title: string; detail?: string; places: Array<{ slug: string; name: string }> }

export type TripCheckInput = {
  stops: CheckStop[]
  /** Day 1, "2026-12-27"; later days follow on. */
  startDate: string | null
  people: number
  foreigners: number
  budgetPerHead: number | null
}

// Straight-line kilometres between two stops: past these, the ride is long (or a ferry) on the same day.
const SAME_DAY_LONG_KM = 40
const SAME_DAY_TOO_FAR_KM = 120
// Between days, a gap this wide usually means a travel day (a flight or a long ferry).
const NEXT_DAY_FAR_KM = 150
const PERMIT = /\b(permit|registration|book(ed|ing)? (ahead|in advance)|slots? (are |is )?limited|limited slots)\b/i
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const peso = (value: number) => `₱${new Intl.NumberFormat('en-PH').format(Math.round(value))}`
const link = (place: CheckPlace) => ({ slug: place.slug, name: place.name })
const nameList = (places: CheckPlace[]) => places.map((place) => place.name).join(', ')

function parseIsoDate(value: string | null): CalendarDate | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : null
}

const weekdayOf = (date: CalendarDate) => new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()

function closedDays({ stops, startDate }: TripCheckInput): CheckItem[] {
  const start = parseIsoDate(startDate)
  if (!start) {
    const known = stops.filter(({ place }) => place.opening_hours && !place.opening_hours.always)
    return known.length > 0
      ? [{ level: 'heads-up', title: 'Add your start date to check closing days', detail: `${known.length} ${known.length === 1 ? 'stop has' : 'stops have'} listed hours.`, places: known.map(({ place }) => link(place)) }]
      : []
  }
  const items: CheckItem[] = []
  const openOk: CheckPlace[] = []
  for (const { day, place } of stops) {
    const hours = place.opening_hours
    if (!hours) continue
    const date = addDays(start, day - 1)
    const ranges = hours.always ? null : hours[DAY_KEYS[weekdayOf(date)]]
    if (ranges && ranges.length === 0) {
      items.push({ level: 'problem', title: `${place.name} is closed on ${DAY_NAMES[weekdayOf(date)]}s`, detail: `Day ${day} is ${formatDay(date)}. Move it to another day.`, places: [link(place)] })
    } else if (hours.always || ranges) {
      openOk.push(place)
    }
  }
  if (openOk.length > 0) items.push({ level: 'ok', title: 'Open on the day you go', detail: nameList(openOk), places: openOk.map(link) })
  return items
}

function transfers({ stops }: TripCheckInput): CheckItem[] {
  const items: CheckItem[] = []
  for (let index = 1; index < stops.length; index++) {
    const from = stops[index - 1]
    const to = stops[index]
    const km = distanceKm(from.place, to.place)
    if (km === null) continue
    const rounded = Math.round(km)
    const places = [link(from.place), link(to.place)]
    if (from.day === to.day && km >= SAME_DAY_TOO_FAR_KM) {
      items.push({ level: 'problem', title: `${from.place.name} to ${to.place.name}: about ${rounded} km apart on Day ${to.day}`, detail: 'Approx, in a straight line. Roads and ferries make it longer. Split it over two days.', places })
    } else if (from.day === to.day && km >= SAME_DAY_LONG_KM) {
      items.push({ level: 'heads-up', title: `Long ride on Day ${to.day}: about ${rounded} km`, detail: `${from.place.name} to ${to.place.name}, approx, in a straight line. Leave early.`, places })
    } else if (from.day !== to.day && km >= NEXT_DAY_FAR_KM) {
      items.push({ level: 'heads-up', title: `Travel day before Day ${to.day}: about ${rounded} km`, detail: `${from.place.name} to ${to.place.name}, approx, in a straight line. Count the flight or ferry.`, places })
    }
  }
  return items
}

function peakWeeks({ stops, startDate }: TripCheckInput): CheckItem[] {
  const start = parseIsoDate(startDate)
  if (!start || stops.length === 0) return []
  const lastDay = Math.max(...stops.map((stop) => stop.day))
  const found = new Map<string, string>()
  for (let day = 1; day <= lastDay; day++) {
    const peak = peakHolidayOn(addDays(start, day - 1))
    if (peak && !found.has(peak.name)) found.set(peak.name, `${formatDay(peak.from)} to ${formatDay(peak.to)}`)
  }
  if (found.size === 0) return []
  return [...found].map(([name, range]) => ({
    level: 'heads-up' as const,
    title: `Peak week: ${name}`,
    detail: `${range} is a holiday break. Book boats, buses and your stay early, and expect crowds.`,
    places: [],
  }))
}

function feesAndPermits(input: TripCheckInput): CheckItem[] {
  const places = input.stops.map((stop) => stop.place)
  const gate = gateTotal(places, input.people, input.foreigners)
  const items: CheckItem[] = []
  for (const place of places.filter((value, index) => places.findIndex((other) => other.slug === value.slug) === index)) {
    const info = place.travel_info
    const permitText = [info?.fees?.other, info?.fees?.local, info?.getting_there?.notes, info?.money?.text, place.opening_hours?.note].find((text) => text && PERMIT.test(text))
    if (permitText) items.push({ level: 'heads-up', title: `${place.name}: permit or registration`, detail: permitText, places: [link(place)] })
  }
  const priced = gate.stops.filter((stop) => stop.fees && (stop.fees.local.length > 0 || stop.fees.foreigner.length > 0))
  if (priced.length > 0) {
    const each = formatPesoRange(shareOf(gate.localEach, gate.groupFees, input.people))
    const foreign = gate.ratesDiffer ? `, foreigners ${formatPesoRange(shareOf(gate.foreignerEach, gate.groupFees, input.people))}` : ''
    items.push({ level: 'ok', title: `Gate fees: ${each} per person${foreign}`, detail: 'Entrance, environmental, terminal and boat fees. Bring cash.', places: priced.map(({ slug, name }) => ({ slug, name })) })
  }
  if (gate.unlisted.length > 0) {
    items.push({ level: 'heads-up', title: `Fee not listed for ${gate.unlisted.length} ${gate.unlisted.length === 1 ? 'stop' : 'stops'}`, detail: `${gate.unlisted.map((stop) => stop.name).join(', ')}. Ask ahead or bring extra cash.`, places: gate.unlisted })
  }
  return items
}

/**
 * Known costs per person: for each stop the higher of its starting price and its gate fees, so a
 * figure is a floor, never a guess. Stay, food and transport between towns aren't in it.
 */
export function knownCostPerHead(input: Pick<TripCheckInput, 'stops' | 'people' | 'foreigners'>) {
  let floor = 0
  const unpriced: CheckPlace[] = []
  const seen = new Set<string>()
  for (const { place } of input.stops) {
    if (seen.has(place.slug)) continue
    seen.add(place.slug)
    const gate = gateTotal([place], input.people, input.foreigners)
    const fee = gate.stops[0].fees ? shareOf(gate.localEach, gate.groupFees, input.people).min : null
    const start = place.budget_min ?? null
    if (fee === null && start === null) unpriced.push(place)
    else floor += Math.max(fee ?? 0, start ?? 0)
  }
  return { floor, unpriced }
}

function budget(input: TripCheckInput): CheckItem[] {
  if (input.stops.length === 0) return []
  const { floor, unpriced } = knownCostPerHead(input)
  const places = input.stops.map(({ place }) => link(place))
  const missing = unpriced.length > 0 ? ` ${unpriced.length} ${unpriced.length === 1 ? 'stop has' : 'stops have'} no price listed (${nameList(unpriced)}).` : ''
  const note = `Starting prices and gate fees only, not stay, food or transport.${missing}`
  if (input.budgetPerHead === null) return floor > 0 ? [{ level: 'ok', title: `Known costs start at ${peso(floor)} per person`, detail: `${note} Add a budget to compare.`, places }] : []
  if (floor > input.budgetPerHead) {
    return [{ level: 'problem', title: `Over budget: known costs start at ${peso(floor)} per person`, detail: `Your budget is ${peso(input.budgetPerHead)} each. ${note}`, places }]
  }
  if (floor > input.budgetPerHead * 0.7) {
    return [{ level: 'heads-up', title: `Tight budget: ${peso(input.budgetPerHead - floor)} left per person`, detail: `Known costs start at ${peso(floor)} of your ${peso(input.budgetPerHead)}. ${note}`, places }]
  }
  return [{ level: 'ok', title: `Within budget: known costs start at ${peso(floor)} per person`, detail: `Of your ${peso(input.budgetPerHead)} each. ${note}`, places }]
}

const ORDER: Record<CheckLevel, number> = { problem: 0, 'heads-up': 1, ok: 2 }

/** The checklist, problems first. */
export function checkTrip(input: TripCheckInput): CheckItem[] {
  const stops = [...input.stops].sort((a, b) => a.day - b.day)
  const sorted = { ...input, stops, people: Math.max(1, Math.round(input.people)) }
  return [...closedDays(sorted), ...transfers(sorted), ...peakWeeks(sorted), ...budget(sorted), ...feesAndPermits(sorted)].sort((a, b) => ORDER[a.level] - ORDER[b.level])
}
