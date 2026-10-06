import { normalizePlaceRecord, type NormalizedPlace } from "../../../domain/places";
import data from "./places.json";

/** A snapshot of GalaTayo's visible places (plus three hidden ones) for offline tests and the local mock. */
export const visibleFixturePlaces: NormalizedPlace[] = (data as { visible: Array<Record<string, unknown>> }).visible.map((row) => normalizePlaceRecord(row));
export const hiddenFixturePlaces: NormalizedPlace[] = (data as { hidden: Array<Record<string, unknown>> }).hidden.map((row) => normalizePlaceRecord(row));
export const allFixturePlaces = [...visibleFixturePlaces, ...hiddenFixturePlaces];
