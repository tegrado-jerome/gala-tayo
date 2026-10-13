import placeTraits from '../data/placeTraits.json'
import { surgeKindForCity, type SurgeTown } from './holidaySurge'

// No-car, solo-friendly and surge-town data built by backend/scripts/generatePlaceTraits.ts.
type PlaceTraits = {
  noCar: Record<string, string>
  solo: Record<string, { why: string; caveat: string }>
  surge: SurgeTown[]
}

const traits = placeTraits as PlaceTraits
const own = (record: object, slug: string | null | undefined) => Boolean(slug) && Object.prototype.hasOwnProperty.call(record, slug as string)

/** How to get there without a car ("Bus, then a tricycle"), or null when it isn't clear. */
export function getNoCarReason(slug: string | null | undefined) {
  return own(traits.noCar, slug) ? traits.noCar[slug as string] : null
}

export function getSoloInfo(slug: string | null | undefined) {
  return own(traits.solo, slug) ? traits.solo[slug as string] : null
}

export function getSurgeKind(city: string | null | undefined) {
  return surgeKindForCity(traits.surge, city)
}

export const NO_CAR_LABEL = 'No car needed'
export const SOLO_LABEL = 'Solo-friendly'
