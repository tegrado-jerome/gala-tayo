/**
 * Plan with AI eval. Runs planSuite.json through the real planning pipeline (buildPlanDraft) and scores each plan.
 *
 *   npx tsx scripts/ai-eval/planEval.ts --label plan-after            fixture places snapshot, offline
 *
 * Each case runs three times: with no model (the fallback plan) and with two stand-in models that ignore the
 * request, one taking the first candidates in order and one the priciest. The checks are the rules the
 * pipeline must enforce after any model: budget, area, fullness, meals, indoor on rain, the chosen places.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { NormalizedPlace } from "../../src/domain/places";
import { isIndoorPlace } from "../../src/domain/queryIntent";
import { buildPlanDraft } from "../../src/functions/galaPlanAiDraft";
import { visibleFixturePlaces } from "../../src/services/assistant/fixtures/testPlaces";
import { fitsKind } from "../../src/services/galaPlanDraftPlanner";
import suite from "./planSuite.json";

type PlanCase = {
  id: string;
  prompt: string;
  places?: string[];
  budgetPerHead?: number;
  cities?: string[];
  minStops?: number;
  minMinutes?: number;
  meals?: Array<"lunch" | "dinner">;
  indoor?: boolean;
  required?: string[];
};
type Stop = { time: string; minutes: number; place: { slug: string; name: string; city: string | null; budget_min: number | null } };
type Body = { stops: Stop[]; notes: string[]; meal_estimate_per_head: number };
type Model = Parameters<typeof buildPlanDraft>[0]["model"];

const draftOf = (stops: NormalizedPlace[]) => ({ title: "Plan", summary: "", group_size: 1, stops: stops.map((place) => ({ place_id: place.id, time: "", minutes: 60, note: "A fun stop for the group." })) });
const MODELS: Record<string, Model> = {
  fallback: async () => null,
  first: async (_prompt, candidates) => draftOf(candidates.slice(0, 6)),
  priciest: async (_prompt, candidates) => draftOf([...candidates].sort((a, b) => (b.budget_min ?? 0) - (a.budget_min ?? 0)).slice(0, 6)),
};

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const MEAL_WINDOW = { lunch: [11 * 60, 14 * 60 + 30], dinner: [17 * 60, 21 * 60 + 30] } as const;

export function scorePlan(evalCase: PlanCase, body: Body | null, bySlug: Map<string, NormalizedPlace>) {
  const checks: Record<string, number | null> = { planned: body ? 1 : 0, budget: null, area: null, full: null, meals: null, timing: null, indoor: null, required: null };
  const notes: string[] = [];
  if (!body) return { checks, notes: ["no plan"], score: 0 };
  const noteText = body.notes.join(" ").toLowerCase();
  const explained = (stop: Stop) => noteText.includes(stop.place.name.toLowerCase()) || (stop.place.city !== null && noteText.includes(stop.place.city.toLowerCase()));

  if (evalCase.budgetPerHead !== undefined) {
    const total = body.stops.reduce((sum, stop) => sum + (stop.place.budget_min ?? 0), 0) + body.meal_estimate_per_head;
    checks.budget = total <= evalCase.budgetPerHead ? 1 : 0;
    if (!checks.budget) notes.push(`₱${total} a head, budget ₱${evalCase.budgetPerHead}`);
  }
  if (evalCase.cities) {
    const outside = body.stops.filter((stop) => !evalCase.cities!.includes(stop.place.city ?? "") && !explained(stop));
    checks.area = body.stops.length ? 1 - outside.length / body.stops.length : 0;
    for (const stop of outside) notes.push(`outside, unexplained: ${stop.place.name} (${stop.place.city})`);
  }
  if (evalCase.minStops !== undefined || evalCase.minMinutes !== undefined) {
    const first = body.stops[0];
    const last = body.stops.at(-1);
    const span = first && last && first.time && last.time ? minutesOf(last.time) + last.minutes - minutesOf(first.time) : 0;
    const enoughStops = body.stops.length >= (evalCase.minStops ?? 0);
    const enoughTime = span >= (evalCase.minMinutes ?? 0);
    checks.full = (Number(enoughStops) + Number(enoughTime)) / 2;
    if (!enoughStops) notes.push(`${body.stops.length} stops, want ${evalCase.minStops}`);
    if (!enoughTime) notes.push(`${span} min, want ${evalCase.minMinutes}`);
  }
  if (evalCase.meals?.length) {
    const met = evalCase.meals.filter((meal) => {
      const [from, to] = MEAL_WINDOW[meal];
      const stop = body.stops.some((entry) => {
        const place = bySlug.get(entry.place.slug);
        return place && fitsKind(place, meal) && entry.time && minutesOf(entry.time) >= from && minutesOf(entry.time) <= to;
      });
      // No meal stop is fine when the plan says plainly why ("no dinner restaurant in Binondo under ₱800").
      return stop || new RegExp(`\\b${meal}\\b`).test(noteText);
    });
    checks.meals = met.length / evalCase.meals.length;
    for (const meal of evalCase.meals) if (!met.includes(meal)) notes.push(`no ${meal} and no note`);
  }
  // A garden or park after dark is closed or pointless unless its own best time is the evening.
  const dark = body.stops.filter((stop) => {
    const place = bySlug.get(stop.place.slug);
    return place?.category === "Park" && stop.time && minutesOf(stop.time) >= 18 * 60 && !/evening|night|sunset|lights/i.test(place.best_time_to_visit ?? "");
  });
  checks.timing = body.stops.length ? 1 - dark.length / body.stops.length : 0;
  for (const stop of dark) notes.push(`park after dark: ${stop.time} ${stop.place.name}`);
  if (evalCase.indoor) {
    const outdoor = body.stops.filter((stop) => {
      const place = bySlug.get(stop.place.slug);
      return place ? isIndoorPlace(place) !== true : true;
    });
    checks.indoor = body.stops.length ? 1 - outdoor.length / body.stops.length : 0;
    for (const stop of outdoor) notes.push(`not marked indoor on a rainy day: ${stop.place.name}`);
  }
  if (evalCase.required?.length) {
    const kept = evalCase.required.filter((slug) => body.stops.some((stop) => stop.place.slug === slug) || noteText.includes((bySlug.get(slug)?.name ?? slug).toLowerCase()));
    checks.required = kept.length / evalCase.required.length;
    for (const slug of evalCase.required) if (!kept.includes(slug)) notes.push(`dropped saved place ${slug} without saying why`);
  }
  const values = Object.values(checks).filter((value): value is number => value !== null);
  return { checks, notes, score: values.reduce((sum, value) => sum + value, 0) / values.length };
}

async function main() {
  const labelIndex = process.argv.indexOf("--label");
  const label = labelIndex >= 0 ? process.argv[labelIndex + 1] : `plan-${new Date().toISOString().slice(0, 10)}`;
  const places = visibleFixturePlaces;
  const bySlug = new Map(places.map((place) => [place.slug, place]));
  const rows: Array<{ id: string; model: string; score: number; checks: Record<string, number | null>; notes: string[]; stops: string[] }> = [];
  for (const evalCase of (suite as { cases: PlanCase[] }).cases) {
    for (const [name, model] of Object.entries(MODELS)) {
      const outcome = await buildPlanDraft({
        prompt: evalCase.prompt,
        places,
        placeSlugs: evalCase.places,
        requestedDate: "2099-10-10",
        requestId: "eval",
        model,
        loadImages: async () => new Map(),
      } as Parameters<typeof buildPlanDraft>[0]);
      const body = outcome.ok ? (outcome.body as unknown as Body) : null;
      const result = scorePlan(evalCase, body, bySlug);
      if ("code" in outcome) result.notes.push(`${outcome.code}: ${outcome.message}`);
      rows.push({ id: evalCase.id, model: name, ...result, stops: body?.stops.map((stop) => `${stop.time} ${stop.place.name}`) ?? [] });
      console.log(`${evalCase.id} [${name}] ${Math.round(result.score * 100)}% ${result.notes.join("; ")}`);
    }
  }
  const mean = rows.reduce((sum, row) => sum + row.score, 0) / rows.length;
  const pass = rows.filter((row) => row.score >= 0.999).length / rows.length;
  const keys = Object.keys(rows[0].checks);
  const cell = (value: number | null) => (value === null ? "–" : `${Math.round(value * 100)}%`);
  const markdown = [
    `# Plan with AI eval: ${label}`,
    "",
    `**Mean ${Math.round(mean * 100)}%**, all checks pass in ${Math.round(pass * 100)}% of ${rows.length} runs (${(suite as { cases: unknown[] }).cases.length} cases × ${Object.keys(MODELS).length} models). Places: fixture snapshot.`,
    "",
    `| Case | Model | Score | ${keys.join(" | ")} | Stops | Notes |`,
    `| --- | --- | --- | ${keys.map(() => "---").join(" | ")} | --- | --- |`,
    ...rows.map((row) => `| ${row.id} | ${row.model} | ${cell(row.score)} | ${keys.map((key) => cell(row.checks[key])).join(" | ")} | ${row.stops.join(", ")} | ${row.notes.join("; ")} |`),
    "",
  ].join("\n");
  const out = path.join(__dirname, "results");
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, `${label}.json`), JSON.stringify({ label, mean, pass, rows }, null, 1));
  writeFileSync(path.join(out, `${label}.md`), markdown);
  console.log(`\nmean ${Math.round(mean * 100)}%, all-pass ${Math.round(pass * 100)}% → results/${label}.md`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
