import { normalizePlaceRecord, type NormalizedPlace } from "../../../domain/places";
import { isGalaWorthySlug } from "../../../utils/galaWorthy";
import data from "./places.json";

// A snapshot of GalaTayo places for offline tests and the local mock. Visibility follows the live
// gala-worthy list, so curation changes never leave the fixtures stale.
const rows = [
  ...(data as { visible: Array<Record<string, unknown>> }).visible,
  ...(data as { hidden: Array<Record<string, unknown>> }).hidden,
].map((row) => normalizePlaceRecord(row));
export const visibleFixturePlaces: NormalizedPlace[] = rows.filter((place) => isGalaWorthySlug(place.slug));
export const hiddenFixturePlaces: NormalizedPlace[] = rows.filter((place) => !isGalaWorthySlug(place.slug));
export const allFixturePlaces = [...visibleFixturePlaces, ...hiddenFixturePlaces];
