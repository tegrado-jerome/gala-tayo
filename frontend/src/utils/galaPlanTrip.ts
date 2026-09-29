import { parseGalaPlanDescription, type GalaPlanSummary } from './galaPlansApi'

type Coordinates = { latitude: number | null; longitude: number | null }
type Stop = { place: Coordinates & { budget_min?: number | null } }

export type TravelLeg = {
  mode: 'walk' | 'ride'
  km: number
  minutes: number
  fare: number
}

const WALK_MAX_KM = 1.2
const WALK_KMH = 4.5
// Metro Manila door-to-door average including traffic and pickup wait.
const RIDE_KMH = 16
const RIDE_PICKUP_MINUTES = 6
const RIDE_BASE_FARE = 45
const RIDE_FARE_PER_KM = 15
// Straight-line distance undercounts streets; this is a common urban detour factor.
const ROAD_DETOUR_FACTOR = 1.3

export function getPlanDate(plan: Pick<GalaPlanSummary, 'description'>) {
  const parsed = parseGalaPlanDescription(plan.description)
  return parsed.dateMode === 'date' && parsed.date ? new Date(`${parsed.date}T00:00:00`) : null
}

export function daysUntil(date: Date, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((date.getTime() - today.getTime()) / 86_400_000)
}

export function formatDaysUntil(days: number) {
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days > 1) return `In ${days} days`
  return days === -1 ? 'Yesterday' : `${Math.abs(days)} days ago`
}

// The plan to feature on Home: the nearest dated plan from today on, else the most recently edited one.
export function pickNextPlan<T extends GalaPlanSummary>(plans: T[], now = new Date()): T | null {
  const active = plans.filter((plan) => plan.is_active !== false)
  const upcoming = active
    .map((plan) => ({ plan, date: getPlanDate(plan) }))
    .filter((entry): entry is { plan: T; date: Date } => entry.date !== null && daysUntil(entry.date, now) >= 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  if (upcoming.length > 0) return upcoming[0].plan

  return [...active].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null
}

export function distanceKm(from: Coordinates, to: Coordinates) {
  if (from.latitude == null || from.longitude == null || to.latitude == null || to.longitude == null) return null

  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const earthRadiusKm = 6371
  const dLat = toRadians(to.latitude - from.latitude)
  const dLng = toRadians(to.longitude - from.longitude)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLng / 2) ** 2
  return earthRadiusKm * 2 * Math.asin(Math.sqrt(a))
}

export function estimateLeg(from: Coordinates, to: Coordinates): TravelLeg | null {
  const straightKm = distanceKm(from, to)
  if (straightKm === null) return null

  const km = straightKm * ROAD_DETOUR_FACTOR
  if (km <= WALK_MAX_KM) {
    return { mode: 'walk', km, minutes: Math.max(2, Math.round((km / WALK_KMH) * 60)), fare: 0 }
  }

  return {
    mode: 'ride',
    km,
    minutes: Math.round((km / RIDE_KMH) * 60 + RIDE_PICKUP_MINUTES),
    fare: Math.round((RIDE_BASE_FARE + km * RIDE_FARE_PER_KM) / 5) * 5,
  }
}

export function getPlanLegs(items: Stop[]) {
  return items.slice(1).map((item, index) => estimateLeg(items[index].place, item.place))
}

// Entry costs per person plus ride fares split across the group.
export function estimatePerHead(items: Stop[], groupSize = 1) {
  const entry = items.reduce((sum, item) => sum + (item.place.budget_min ?? 0), 0)
  const rides = getPlanLegs(items).reduce((sum, leg) => sum + (leg?.fare ?? 0), 0)
  return Math.round(entry + rides / Math.max(1, groupSize))
}

export function formatPeso(value: number) {
  return value === 0 ? 'Free' : `₱${new Intl.NumberFormat('en-PH').format(value)}`
}

// "18:30" -> "6:30 PM"; returns the input unchanged when it isn't a 24-hour time.
export function formatTime24(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return value
  const hours = Number(match[1])
  const suffix = hours >= 12 ? 'PM' : 'AM'
  return `${hours % 12 || 12}:${match[2]} ${suffix}`
}
