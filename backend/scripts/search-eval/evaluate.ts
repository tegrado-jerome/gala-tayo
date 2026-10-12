import { normalizePlaceRecord, type NormalizedPlace } from "../../src/domain/places";
import { normalizeSearchText, searchPlacesInArea } from "../../src/domain/placeSearch";
import { isGalaWorthySlug } from "../../src/utils/galaWorthy";
import { isOpenNow } from "../../src/utils/openingHours";
import { resolveDestination } from "../../src/utils/phDestinations";
import snapshot from "./places.json";
import suite from "./queries.json";

// Scores search against a snapshot of the live places (scripts/search-eval/places.json):
// precision@5 is the share of the first five that are right, out of min(5, how many right answers exist);
// MRR is 1 / the rank of the first right answer. A `none` case scores 1 when search honestly finds nothing.
// Checks a case can add (a stray note, the wrong place on top, a missed "did you mean") score it 0 when they fail.

type Rule = {
  /** Patterns the name, category, tags or good-for must all match. */
  text?: string | string[];
  category?: string;
  city?: string;
  province?: string | string[];
  region?: string | string[];
  maxBudget?: number;
  free?: boolean;
  /** [latitude, longitude, max km, min km]. */
  near?: [number, number, number, number?];
  open?: boolean;
};
type Case = {
  kind: string;
  q: string;
  slugs?: string[];
  rule?: Rule | Rule[];
  none?: boolean;
  /** No fallback note may show: the query was understood. */
  noteFree?: boolean;
  /** The "Showing results for" text expected for a typo. */
  didYouMean?: string;
  /** None of these may be in the first `top` results. */
  avoid?: { top: number; slugs: string[] };
  /** The query asked for the searcher's location. */
  nearMe?: boolean;
};
type CaseResult = { kind: string; q: string; precision: number; rr: number; top: string[]; note: string | null; ms: number; broken: string | null };

const CLOCK = new Date(suite.clock);
const asList = (value: string | string[] | undefined) => (value === undefined ? null : Array.isArray(value) ? value : [value]);

function distanceKm(lat: number, lng: number, place: NormalizedPlace) {
  if (place.latitude == null || place.longitude == null) return Infinity;
  const rad = Math.PI / 180;
  const h = Math.sin(((place.latitude - lat) * rad) / 2) ** 2 + Math.cos(lat * rad) * Math.cos(place.latitude * rad) * Math.sin(((place.longitude - lng) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function fitsRule(place: NormalizedPlace, rule: Rule): boolean {
  const destination = resolveDestination(place.city, place.area);
  const about = [place.name, place.category, ...place.tags, ...place.good_for].join(" , ");
  if (asList(rule.text)?.some((pattern) => !new RegExp(pattern, "i").test(about))) return false;
  if (rule.category && place.category !== rule.category) return false;
  if (rule.city && !new RegExp(rule.city, "i").test(place.city ?? "")) return false;
  if (asList(rule.province) && !asList(rule.province)!.includes(destination?.provinceName ?? "")) return false;
  if (asList(rule.region) && !asList(rule.region)!.includes(destination?.regionName ?? "")) return false;
  if (rule.maxBudget !== undefined && (place.budget_min === null || place.budget_min > rule.maxBudget)) return false;
  if (rule.free && place.budget_min !== 0) return false;
  if (rule.near) {
    const km = distanceKm(rule.near[0], rule.near[1], place);
    if (km > rule.near[2] || km < (rule.near[3] ?? 0)) return false;
  }
  if (rule.open && isOpenNow(place.opening_hours, CLOCK).state !== "open") return false;
  return true;
}

function isRelevant(place: NormalizedPlace, testCase: Case): boolean {
  if (testCase.slugs) return testCase.slugs.includes(place.slug);
  const rules = Array.isArray(testCase.rule) ? testCase.rule : [testCase.rule ?? {}];
  return rules.some((rule) => fitsRule(place, rule));
}

export const evalPlaces: NormalizedPlace[] = snapshot.places.map((row) => normalizePlaceRecord(row as Record<string, unknown>)).filter((place) => isGalaWorthySlug(place.slug));

export function runSearchEval(places: NormalizedPlace[] = evalPlaces) {
  const cases = suite.cases as Case[];
  const results: CaseResult[] = cases.map((testCase) => {
    const query = normalizeSearchText(testCase.q);
    const started = performance.now();
    const { ranked, note, didYouMean, nearMe } = query ? searchPlacesInArea(places, query, {}, { now: CLOCK }) : { ranked: [], note: null, didYouMean: null, nearMe: false };
    const ms = performance.now() - started;
    const top = ranked.slice(0, 5).map(({ place }) => place.slug);
    if (testCase.none) {
      const honest = ranked.length === 0 || note !== null;
      return { kind: testCase.kind, q: testCase.q, precision: honest ? 1 : 0, rr: honest ? 1 : 0, top, note, ms, broken: null };
    }
    const avoided = testCase.avoid ? ranked.slice(0, testCase.avoid.top).find(({ place }) => testCase.avoid!.slugs.includes(place.slug)) : null;
    const broken =
      testCase.noteFree && note ? `unexpected note` :
      testCase.didYouMean && didYouMean !== testCase.didYouMean ? `did you mean "${didYouMean}"` :
      avoided ? `${avoided.place.slug} in the top ${testCase.avoid!.top}` :
      testCase.nearMe && !nearMe ? "near me not read" : null;
    if (broken) return { kind: testCase.kind, q: testCase.q, precision: 0, rr: 0, top, note, ms, broken };
    const relevantCount = places.filter((place) => isRelevant(place, testCase)).length;
    const hits = ranked.slice(0, 5).filter(({ place }) => isRelevant(place, testCase)).length;
    const firstRank = ranked.slice(0, 20).findIndex(({ place }) => isRelevant(place, testCase));
    return {
      kind: testCase.kind,
      q: testCase.q,
      precision: relevantCount === 0 ? 0 : hits / Math.min(5, relevantCount),
      rr: firstRank < 0 ? 0 : 1 / (firstRank + 1),
      top,
      note,
      ms,
      broken: null,
    };
  });
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const times = results.map((result) => result.ms).sort((a, b) => a - b);
  const leaked = places.length === 0 ? [] : results.flatMap((result) => result.top.filter((slug) => !isGalaWorthySlug(slug)));
  return {
    precisionAt5: mean(results.map((result) => result.precision)),
    mrr: mean(results.map((result) => result.rr)),
    p95Ms: times[Math.floor(times.length * 0.95)],
    hiddenLeaks: leaked,
    results,
  };
}

if (require.main === module) {
  const report = runSearchEval();
  // The first query of a run also builds the typo vocabulary; time a second pass for a steady-state p95.
  const steady = runSearchEval();
  const byKind = new Map<string, CaseResult[]>();
  for (const result of report.results) byKind.set(result.kind, [...(byKind.get(result.kind) ?? []), result]);
  console.log(`cases ${report.results.length}  places ${evalPlaces.length}`);
  console.log(`precision@5 ${report.precisionAt5.toFixed(3)}  MRR ${report.mrr.toFixed(3)}  p95 ${steady.p95Ms.toFixed(1)} ms  hidden leaks ${report.hiddenLeaks.length}`);
  for (const [kind, results] of byKind) {
    const p = results.reduce((sum, result) => sum + result.precision, 0) / results.length;
    const m = results.reduce((sum, result) => sum + result.rr, 0) / results.length;
    console.log(`  ${kind.padEnd(11)} n=${String(results.length).padStart(3)}  p@5 ${p.toFixed(2)}  mrr ${m.toFixed(2)}`);
  }
  const failures = report.results.filter((result) => result.precision < 1 || result.rr < 1).sort((a, b) => a.precision + a.rr - (b.precision + b.rr));
  console.log(`\nfailures (${failures.length}):`);
  for (const result of failures) {
    const why = result.broken ? `  FAILED CHECK: ${result.broken}` : "";
    console.log(`  [${result.kind}] "${result.q}"  p@5 ${result.precision.toFixed(2)} rr ${result.rr.toFixed(2)}${why}  -> ${result.top.join(", ") || "(none)"}${result.note ? `  note: ${result.note}` : ""}`);
  }
}
