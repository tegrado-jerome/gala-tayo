import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { noCarReason, soloEligible } from "../src/utils/placeTraits";

// Writes data/placeTraits.json (backend and frontend copies): the no-car line for every place whose commute
// text passes the rule, plus the hand-written solo entries and surge towns from placeTraits.curated.json.
// Solo entries whose place no longer passes the solo rule are dropped and listed.
//
// Usage, from backend/: dump the active places, then run the script on the dump.
//   npx supabase db query --linked --project-ref uzvsdxguqlsbhtbblmmy -f scripts/placeTraits.sql > <dump.json>
//   npx tsx scripts/generatePlaceTraits.ts <dump.json>

type DumpPlace = { slug: string; commute_access: string | null; good_for: string[] | null; safety: string | null };
type Curated = {
  noCarOverrides: Record<string, string | null>;
  solo: Record<string, { why: string; caveat: string }>;
  surge: Array<{ cities: string[]; kind: string; sources: string[] }>;
};

const root = path.resolve(__dirname, "../..");
const readJson = <T>(file: string) => JSON.parse(readFileSync(file, "utf8")) as T;

const dumpText = readFileSync(process.argv[2], "utf8");
// The CLI prints a status line before the JSON.
const rows = (JSON.parse(dumpText.slice(dumpText.indexOf("{"))) as { rows: Array<{ places: DumpPlace[] }> }).rows[0].places;
const curated = readJson<Curated>(path.join(__dirname, "placeTraits.curated.json"));
const hidden = new Set(readJson<{ hidden: string[] }>(path.join(root, "backend/src/data/galaWorthy.json")).hidden);
const extras = readJson<Record<string, { safetyTips?: string[] }>>(path.join(root, "frontend/src/data/placeExtras.json"));

const visible = rows.filter((place) => !hidden.has(place.slug));
const noCar: Record<string, string> = {};
for (const place of visible) {
  const reason = Object.prototype.hasOwnProperty.call(curated.noCarOverrides, place.slug) ? curated.noCarOverrides[place.slug] : noCarReason(place.commute_access);
  if (reason) noCar[place.slug] = reason;
}

const bySlug = new Map(visible.map((place) => [place.slug, place]));
const solo: Curated["solo"] = {};
for (const [slug, entry] of Object.entries(curated.solo)) {
  const place = bySlug.get(slug);
  const safetyTips = [...(extras[slug]?.safetyTips ?? []), ...(place?.safety ? [place.safety] : [])];
  if (place && soloEligible({ goodFor: place.good_for ?? [], commuteAccess: place.commute_access, safetyTips })) solo[slug] = entry;
  else console.warn(`solo: dropped ${slug} (${place ? "fails the solo rule" : "not a visible place"})`);
}

const output = `${JSON.stringify({ noCar, solo, surge: curated.surge }, null, 1)}\n`;
for (const file of ["backend/src/data/placeTraits.json", "frontend/src/data/placeTraits.json"]) writeFileSync(path.join(root, file), output, "utf8");
console.log(`${visible.length} visible places: ${Object.keys(noCar).length} no-car, ${Object.keys(solo).length} solo, ${curated.surge.length} surge towns`);
