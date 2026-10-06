/**
 * Writes src/services/assistant/fixtures/conversations.json, the recorded model turns the offline tests replay.
 *
 *   npx tsx scripts/ai-eval/record.ts            seed: the tool calls below plus an answer written from the tool results
 *   GEMINI_API_KEY=... npx tsx scripts/ai-eval/record.ts --live gemini     records what the real model does
 *
 * Both run the real tools over the fixture places snapshot, so names, prices and slugs in the answers are real.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { runAssistant } from "../../src/services/assistant/agent";
import { visibleFixturePlaces } from "../../src/services/assistant/fixtures/testPlaces";
import { detectLanguage } from "../../src/services/assistant/language";
import { GeminiProvider } from "../../src/services/assistant/providers/gemini";
import type { RecordedConversation, RecordedTurn } from "../../src/services/assistant/providers/mock";
import type { AssistantModelProvider, ModelRequest, ModelStep } from "../../src/services/assistant/providers/types";
import { EMPTY_MEMORY } from "../../src/services/assistant/schema";
import { newLedger, runTool, type ToolContext } from "../../src/services/assistant/tools";
import type { WeatherSummary } from "../../src/services/assistant/weather";

export const RAINY: WeatherSummary = { tempC: 26, code: 63, rainLikely: true, summary: "Rain likely until 6 PM", hours: [] };
export const FIXTURE_TODAY = { iso: "2026-10-10", weekday: "Saturday" };

type Call = { name: string; args: Record<string, unknown> };
export const PROMPTS: Array<{ prompt: string; mode?: "chat" | "map"; calls: Call[] }> = [
  { prompt: "BGC date ₱1500", calls: [{ name: "search_places", args: { query: "date night", area: "BGC", vibe: "date", budget_max: 750 } }] },
  { prompt: "Rainy QC barkada", calls: [{ name: "weather", args: { area: "Quezon City" } }, { name: "search_places", args: { query: "barkada hangout", area: "Quezon City", vibe: "barkada", indoor: true } }] },
  { prompt: "Tagaytay family day", calls: [{ name: "plan_day", args: { request: "Tagaytay family day trip with kids" } }] },
  { prompt: "Intramuros history walk", calls: [{ name: "search_places", args: { query: "history walk heritage", area: "Intramuros", vibe: "solo" } }] },
  { prompt: "Baguio weekend", calls: [{ name: "plan_day", args: { request: "Baguio weekend trip, sights and food" } }] },
  { prompt: "beach malapit sa Manila", calls: [{ name: "search_places", args: { query: "beach", area: "near Manila" } }] },
  { prompt: "first time in Manila 2 days", calls: [{ name: "plan_day", args: { request: "first time in Manila, history, museums and food" } }] },
  { prompt: "saan masarap mag-sisig", calls: [{ name: "search_places", args: { query: "sisig", category: "Food" } }] },
  { prompt: "indoor activities ngayon umuulan", calls: [{ name: "weather", args: {} }, { name: "search_places", args: { query: "indoor activities", indoor: true } }] },
  { prompt: "date spot with view Makati", calls: [{ name: "search_places", args: { query: "date view rooftop", area: "Makati", vibe: "date" } }] },
  { prompt: "cheap gala QC", calls: [{ name: "search_places", args: { query: "gala hangout", area: "Quezon City", budget_max: 500 } }] },
  { prompt: "island hopping Coron budget", calls: [{ name: "search_places", args: { query: "island hopping lagoon", area: "Coron" } }] },
];

function seedAnswer(prompt: string, places: Array<{ name: string; budget_min: number | null; area: string | null; city: string | null }>, rainy: boolean) {
  const taglish = detectLanguage(prompt) === "taglish";
  const picks = places.slice(0, 3);
  if (picks.length === 0) return taglish ? "Wala pa akong swak na lugar diyan. Subukan natin ibang area?" : "GalaTayo doesn't have a fit for that yet. Want to try another area?";
  const price = (place: (typeof picks)[number]) => (place.budget_min === null ? "" : place.budget_min === 0 ? (taglish ? ", libre pa" : ", and it's free") : `, from PHP ${place.budget_min}`);
  const intro = taglish
    ? rainy ? "Umuulan? Walang problema, indoor muna tayo:" : "Tara, heto ang mga swak:"
    : rainy ? "Rain likely, so here are indoor picks:" : "Here are good picks:";
  const lines = picks.map((place, index) =>
    taglish
      ? `- **${place.name}**${price(place)}. ${index === 0 ? "Top pick ko 'to!" : "Sulit din 'to."}`
      : `- **${place.name}** in ${place.area ?? place.city}${price(place)}.`
  );
  return [intro, ...lines].join("\n");
}

class RecordingProvider implements AssistantModelProvider {
  readonly id: string;
  readonly steps: RecordedTurn[] = [];
  constructor(private readonly inner: AssistantModelProvider) {
    this.id = inner.id;
  }
  available() {
    return this.inner.available();
  }
  async step(request: ModelRequest, onDelta?: (text: string) => void): Promise<ModelStep> {
    const result = await this.inner.step(request, onDelta);
    this.steps.push(result.toolCalls.length ? { toolCalls: result.toolCalls.map(({ name, args }) => ({ name, args })) } : { text: result.text });
    return result;
  }
}

async function main() {
  const live = process.argv.includes("--live");
  const context: ToolContext = { places: visibleFixturePlaces, todayIso: FIXTURE_TODAY.iso, weather: async () => RAINY };
  const conversations: RecordedConversation[] = [];
  for (const entry of PROMPTS) {
    if (live) {
      const recorder = new RecordingProvider(new GeminiProvider());
      await runAssistant(
        { message: entry.prompt, mode: entry.mode ?? "chat", history: [], memory: { ...EMPTY_MEMORY }, requestId: "record" },
        { providers: [recorder], tools: { places: visibleFixturePlaces, weather: context.weather }, imageUrl: () => null, today: () => FIXTURE_TODAY }
      );
      conversations.push({ prompt: entry.prompt, mode: entry.mode, steps: recorder.steps });
      continue;
    }
    const ledger = newLedger();
    for (const call of entry.calls) await runTool(call.name, call.args, context, ledger);
    const shown = ledger.plan ? ledger.plan.stops.map((stop) => ledger.places.get(stop.slug)!) : ledger.ranked.map((slug) => ledger.places.get(slug)!);
    conversations.push({ prompt: entry.prompt, mode: entry.mode, steps: [{ toolCalls: entry.calls }, { text: seedAnswer(entry.prompt, shown, Boolean(ledger.weather?.rainLikely)) }] });
  }
  const file = path.resolve(__dirname, "../../src/services/assistant/fixtures/conversations.json");
  writeFileSync(file, `${JSON.stringify({ recordedWith: live ? "gemini (live)" : "seed: scripted tool calls, answer written from tool results", conversations }, null, 1)}\n`);
  console.log(`wrote ${conversations.length} conversations to ${file}`);
}

if (require.main === module) main().catch((error) => {
  console.error(error);
  process.exit(1);
});
