import { formatPeakDates, peakWeekOn, upcomingPeakWeek, type CalendarDate, type PeakWeek } from './phHolidays.ts'

/*
 * Holiday surge warnings: one calm line for the few towns that really fill up in peak weeks (the towns and their
 * news sources are in data/placeTraits.json). Kept free of JSON imports so node:test can run it.
 */

export type SurgeKind = 'ferry' | 'stay' | 'road'
export type SurgeTown = { cities: string[]; kind: SurgeKind }

const ADVICE: Record<SurgeKind, string> = {
  ferry: 'ferries and rooms fill up; book early.',
  stay: 'rooms fill up fast; book early.',
  road: 'expect heavy traffic; leave early.',
}
// When a plan mixes towns, the warning that costs the most to ignore wins.
const WEIGHT: Record<SurgeKind, number> = { ferry: 3, stay: 2, road: 1 }

const foldCity = (city: string) => city.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

export function surgeKindForCity(towns: SurgeTown[], city: string | null | undefined): SurgeKind | null {
  const wanted = foldCity(city ?? '')
  if (!wanted) return null
  return towns.find((town) => town.cities.some((name) => foldCity(name) === wanted))?.kind ?? null
}

export function strongestSurge(kinds: Array<SurgeKind | null>): SurgeKind | null {
  return kinds.reduce<SurgeKind | null>((best, kind) => (kind && (!best || WEIGHT[kind] > WEIGHT[best]) ? kind : best), null)
}

/** "Holy Week: ferries and rooms fill up; book early." With dates: "Holy Week (Mar 22 to 29): ...". */
export function surgeLine(kind: SurgeKind, peak: PeakWeek, withDates = false) {
  return `${peak.name}${withDates ? ` (${formatPeakDates(peak)})` : ''}: ${ADVICE[kind]}`
}

/** For a dated plan or today's Pick for me: the line when the date is in a peak week and a stop is a surge town. */
export function surgeLineOn(date: CalendarDate | null, kinds: Array<SurgeKind | null>) {
  const kind = strongestSurge(kinds)
  const peak = date && kind ? peakWeekOn(date) : null
  return kind && peak ? surgeLine(kind, peak) : null
}

// A place page has no date, so it warns about a peak week that is on now or starts within three weeks.
const PLACE_LOOKAHEAD_DAYS = 21

export function placeSurgeLine(today: CalendarDate, kind: SurgeKind | null) {
  const peak = kind ? upcomingPeakWeek(today, PLACE_LOOKAHEAD_DAYS) : null
  return kind && peak ? surgeLine(kind, peak, true) : null
}
