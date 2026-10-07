import type { PlanMeals } from './planCost'

/*
 * Plan settings ride at the start of the description, so they need no table change:
 *   "[gala_date:2026-10-10][gala_group:3][gala_meals:2x250][gala_lock:<poll id>]\nNotes"
 * gala_meals is the meals the plan was asked to cover and the meal price per head (see planCost);
 * gala_lock is the "When?" option the host locked.
 */
export type GalaPlanDateMode = 'anytime' | 'na' | 'date'

export type GalaPlanSettings = {
  dateMode: GalaPlanDateMode
  date: string
  /** How many people the plan is for, as set when it was made; null when never set. */
  groupSize?: number | null
  meals?: PlanMeals | null
  /** The "When?" option the host locked; null until the host taps Lock. */
  lockedPollId?: string | null
}

const MARKERS_PATTERN = /^((?:\[gala_[a-z]+:[^\]\n]*\])+)\n?/i
const DATE_VALUE_PATTERN = /\[gala_date:(anytime|na|\d{4}-\d{2}-\d{2})\]/i
const GROUP_VALUE_PATTERN = /\[gala_group:(\d{1,2})\]/i
const MEALS_VALUE_PATTERN = /\[gala_meals:(\d)x(\d{1,5})\]/i
const LOCK_VALUE_PATTERN = /\[gala_lock:([0-9a-f-]{36})\]/i
const POLL_ID_PATTERN = /^[0-9a-f-]{36}$/i

export function parseGalaPlanDescription(description: string | null | undefined) {
  const rawDescription = description ?? ''
  const markers = rawDescription.match(MARKERS_PATTERN)?.[1] ?? ''
  const markerValue = markers.match(DATE_VALUE_PATTERN)?.[1] ?? 'anytime'
  const groupSize = Number(markers.match(GROUP_VALUE_PATTERN)?.[1] ?? 0)
  const meals = markers.match(MEALS_VALUE_PATTERN)
  const cleanDescription = markers ? rawDescription.replace(MARKERS_PATTERN, '').trimStart() : rawDescription

  return {
    dateMode: markerValue === 'anytime' || markerValue === 'na' ? markerValue as GalaPlanDateMode : 'date' as GalaPlanDateMode,
    date: markerValue === 'anytime' || markerValue === 'na' ? '' : markerValue,
    groupSize: groupSize >= 1 ? Math.min(30, groupSize) : null,
    meals: meals && Number(meals[1]) > 0 && Number(meals[2]) > 0 ? { needed: Number(meals[1]), cost: Number(meals[2]) } : null,
    lockedPollId: markers.match(LOCK_VALUE_PATTERN)?.[1].toLowerCase() ?? null,
    description: cleanDescription,
  }
}

export function composeGalaPlanDescription({ description, dateMode, date, groupSize = null, meals = null, lockedPollId = null }: GalaPlanSettings & { description: string }) {
  const markerValue = dateMode === 'date' && date ? date : dateMode
  const cleanDescription = description.trim()
  const group = groupSize && groupSize > 1 ? `[gala_group:${Math.min(30, Math.round(groupSize))}]` : ''
  const mealCount = meals ? Math.min(9, Math.round(meals.needed)) : 0
  const mealCost = meals ? Math.min(99_999, Math.round(meals.cost)) : 0
  const mealMarker = mealCount > 0 && mealCost > 0 ? `[gala_meals:${mealCount}x${mealCost}]` : ''
  const lock = lockedPollId && POLL_ID_PATTERN.test(lockedPollId) ? `[gala_lock:${lockedPollId}]` : ''
  return `[gala_date:${markerValue}]${group}${mealMarker}${lock}${cleanDescription ? `\n${cleanDescription}` : ''}`
}
