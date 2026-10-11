// Generates Gala Today posts without saving anything (no R2 writes), to judge the drafts before they go live.
//   KEY_VAULT_URL=https://<vault>.vault.azure.net/ npm run gala-today:dry-run -- [runs=3] [YYYY-MM-DD]
// Needs Azure CLI login (Key Vault: Supabase, Gemini); GALA_TODAY_GEMINI_MODELS picks the models. Each run builds
// on the previous runs' posts, like real consecutive days, and prints every draft, the rules/editor outcome and the
// published post.
import type { InvocationContext } from "@azure/functions";
import { generateGalaTodayPost } from "../src/functions/galaToday";
import type { GalaTodayPost } from "../src/utils/galaTodayCore";

const runs = Number(process.argv[2]) || 3;
// Real runs are hours apart; a pause keeps back-to-back dry runs under the free tier's per-minute limit.
const PAUSE_MS = 65_000;
const startDate = process.argv[3] ?? new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

const context = {
  log: (...args: unknown[]) => console.log("  log:", ...args),
  warn: (...args: unknown[]) => console.log("  warn:", ...args),
  error: (...args: unknown[]) => console.log("  error:", ...args),
} as unknown as InvocationContext;

async function main() {
  const posts: GalaTodayPost[] = [];
  let passed = 0;
  for (let run = 0; run < runs; run += 1) {
    // One post per day, 6:30 AM Manila, on consecutive days.
    const day = new Date(`${startDate}T06:30:00+08:00`);
    day.setUTCDate(day.getUTCDate() + run);
    if (run > 0) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    console.log(`\n=== Run ${run + 1}: ${day.toISOString()} ===`);
    const started = Date.now();
    const result = await generateGalaTodayPost(context, day, {
      dryRunPosts: posts,
      onAttempt: ({ model, draft, outcome }) => console.log(`  draft (${model}) -> ${outcome}\n${JSON.stringify(draft, null, 2).replace(/^/gm, "    ")}`),
    });
    console.log(`TOOK: ${Math.round((Date.now() - started) / 1000)} s`);
    if (typeof result === "string") {
      console.log(`RESULT: ${result}`);
      continue;
    }
    passed += 1;
    posts.unshift(result);
    console.log(`RESULT: PASSED ${result.slug}\n${JSON.stringify(result, null, 2)}`);
  }
  console.log(`\n${passed}/${runs} runs published a post.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
