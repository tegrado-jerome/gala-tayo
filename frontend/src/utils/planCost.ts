/*
 * One cost estimate for a plan. Every screen that shows a price (the AI draft, the plan header, Split
 * costs, the Home trip card, the story and the public page) calls planCost, so one plan reads the same
 * everywhere.
 */

type Coordinates = { latitude: number | null; longitude: number | null }
/** meal_stop: the API's flag for a food street filed under another category (Binondo is "Heritage"). */
export type CostPlace = Coordinates & { budget_min?: number | null; category?: string | null; meal_stop?: boolean }
type CostStop = { place: CostPlace }

/** Meals a plan was asked to cover and the typical meal price per head, saved with the plan. */
export type PlanMeals = { needed: number; cost: number }

export type TravelLeg = {
  mode: 'walk' | 'ride'
  km: number
  minutes: number
  fare: number
}

// A typical sit-down meal per head; matches the planner's fallback when it has no food prices.
export const MEAL_ESTIMATE = 250

const WALK_MAX_KM = 1.2
const WALK_KMH = 4.5
// Metro Manila door-to-door average including traffic and pickup wait.
const RIDE_KMH = 16
const RIDE_PICKUP_MINUTES = 6
const RIDE_BASE_FARE = 45
const RIDE_FARE_PER_KM = 15
// Straight-line distance undercounts streets; this is a common urban detour factor.
const ROAD_DETOUR_FACTOR = 1.3

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

export function getPlanLegs(items: CostStop[]) {
  return items.slice(1).map((item, index) => estimateLeg(items[index].place, item.place))
}

const isMealStop = (place: CostPlace) => place.category === 'Food' || place.meal_stop === true

/**
 * What one stop costs a person. A food stop with no price (a food street with free entry) still means
 * paying for a meal, so it counts the meal estimate and says it is an estimate.
 */
export function stopCost(place: CostPlace, mealCost = MEAL_ESTIMATE): { amount: number | null; isEstimate: boolean } {
  const price = place.budget_min == null ? null : Number(place.budget_min)
  if (isMealStop(place) && !(price !== null && price > 0)) return { amount: mealCost, isEstimate: true }
  return { amount: price !== null && Number.isFinite(price) ? Math.max(0, price) : null, isEstimate: false }
}

/** Entry and meals per person, meals the stops don't cover, and ride fares split across the group. */
export function planCost(items: CostStop[], groupSize = 1, meals?: PlanMeals | null) {
  const mealCost = meals?.cost ?? MEAL_ESTIMATE
  const people = Math.max(1, Math.round(groupSize))
  const stops = items.map((item) => stopCost(item.place, mealCost))
  const entry = stops.reduce((sum, stop) => sum + (stop.amount ?? 0), 0)
  const extraMeals = Math.max(0, (meals?.needed ?? 0) - items.filter((item) => isMealStop(item.place)).length)
  const rides = getPlanLegs(items).reduce((sum, leg) => sum + (leg?.fare ?? 0), 0)
  const perHead = Math.round(entry + extraMeals * mealCost + rides / people)

  return {
    perHead,
    total: perHead * people,
    people,
    stops,
    mealCost,
    extraMeals,
    rides,
    ridesEach: Math.round(rides / people),
    /** Meal money per head that is an estimate, not a listed price; 0 when every meal is priced. */
    mealEstimate: (extraMeals + stops.filter((stop) => stop.isEstimate).length) * mealCost,
  }
}

/**
 * The meals an AI draft was asked to cover. Older API answers only send the meal total per head;
 * that total is turned back into meals at an even price so the plan still adds up to it.
 */
export function draftMeals(draft: { meals_needed?: number; meal_cost?: number; meal_estimate_per_head?: number }, items: CostStop[]): PlanMeals | null {
  if (draft.meals_needed != null) return draft.meals_needed > 0 ? { needed: draft.meals_needed, cost: draft.meal_cost ?? MEAL_ESTIMATE } : null
  const estimate = draft.meal_estimate_per_head ?? 0
  if (estimate <= 0) return null
  const unpriced = Math.max(1, Math.round(estimate / MEAL_ESTIMATE))
  const pricedMeals = items.filter((item) => isMealStop(item.place) && !stopCost(item.place).isEstimate).length
  return { needed: pricedMeals + unpriced, cost: Math.round(estimate / unpriced) }
}

export function estimatePerHead(items: CostStop[], groupSize = 1, meals?: PlanMeals | null) {
  return planCost(items, groupSize, meals).perHead
}

/**
 * How many people the split counts: everyone going once friends have replied, else the size the host
 * planned for (the host's own "going" alone doesn't shrink a plan made for four). A size the host sets
 * in Split costs wins, but never drops below who's going.
 */
export function splitHeadcount(planned: number | null | undefined, goingCount: number, override?: number | null) {
  if (override != null) return Math.max(1, goingCount, override)
  return goingCount >= 2 ? goingCount : Math.max(1, goingCount, planned ?? 0)
}
