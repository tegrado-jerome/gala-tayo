import { parseGalaPlanDescription, type GalaPlanDetail, type GalaPlanItemPayload, type GalaPlanSummary } from './galaPlansApi'
import { estimateLeg } from './planCost'
import { slotForNewStop, stayMinutes } from './planStops'

export { distanceKm, estimateLeg, estimatePerHead, getPlanLegs, planCost, splitHeadcount, stopCost, type TravelLeg } from './planCost'

type Coordinates = { latitude: number | null; longitude: number | null }

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

/**
 * The plan's items with a new place slotted into the last day at a time it is open (see slotForNewStop),
 * ready to save in one update.
 */
export function planItemsWithStop(items: GalaPlanDetail['items'], added: { placeId: string; category: string | null } & Coordinates): GalaPlanItemPayload[] {
  const lastDay = Math.max(1, ...items.map((item) => item.day_number ?? 1))
  const ordered = [...items].sort((a, b) => (a.day_number ?? 1) - (b.day_number ?? 1) || a.sort_order - b.sort_order)
  const dayItems = ordered.filter((item) => (item.day_number ?? 1) === lastDay)
  const slot = slotForNewStop(
    dayItems.map((item) => ({ time_label: item.time_label, estimated_minutes: item.estimated_minutes, place: item.place as Coordinates })),
    { category: added.category, place: { latitude: added.latitude, longitude: added.longitude } },
    (from, to) => estimateLeg(from, to)?.minutes ?? null,
  )
  const toPayload = (item: GalaPlanDetail['items'][number], time: string | null) => ({
    place_id: item.place_id,
    day_number: item.day_number ?? 1,
    time_label: time,
    notes: item.notes,
    estimated_minutes: item.estimated_minutes,
  })
  const newDay = [
    ...dayItems.map((item, index) => toPayload(item, slot.times[index < slot.index ? index : index + 1])),
  ]
  newDay.splice(slot.index, 0, { place_id: added.placeId, day_number: lastDay, time_label: slot.times[slot.index], notes: null, estimated_minutes: stayMinutes(added.category) })
  const otherDays = ordered.filter((item) => (item.day_number ?? 1) !== lastDay).map((item) => toPayload(item, item.time_label))
  return [...otherDays, ...newDay].map((item, index) => ({ ...item, sort_order: index + 1 }))
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
