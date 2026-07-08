import * as fs from "fs";
import * as path from "path";
import { getSupabaseAdminClient } from "../src/config/supabaseAdmin";

function loadLocalEnv(): void {
  const settingsPath = path.resolve(__dirname, "../local.settings.json");
  if (fs.existsSync(settingsPath)) {
    const raw = fs.readFileSync(settingsPath, "utf-8");
    const parsed = JSON.parse(raw);
    const values = parsed.Values as Record<string, string | undefined>;
    if (values) {
      for (const key of Object.keys(values)) {
        const val = values[key];
        if (val !== undefined && !process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

type Mode = "dry-run" | "write";

function parseArgs(argv: string[]): { mode: Mode; help: boolean } {
  let mode: Mode = "dry-run";
  let help = false;
  for (const arg of argv) {
    if (arg === "--write" || arg === "--apply") {
      mode = "write";
    } else if (arg === "--dry-run") {
      mode = "dry-run";
    } else if (arg === "--help" || arg === "-h") {
      help = true;
    }
  }
  return { mode, help };
}

async function run(): Promise<void> {
  loadLocalEnv();
  const { mode, help } = parseArgs(process.argv.slice(2));

  if (help) {
    console.log("Usage: tsx scripts/backfillPlaceImageUrls.ts [--write] [--dry-run] [--help]");
    console.log("");
    console.log("  --write     Actually update image_url in Supabase (default: dry-run).");
    console.log("  --dry-run   Preview rows that would be updated without writing.");
    console.log("  --help      Show this help.");
    return;
  }

  const publicBaseUrl = (process.env.R2_PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
  if (!publicBaseUrl) {
    console.error("R2_PUBLIC_BASE_URL is not set. Aborting.");
    process.exit(1);
  }

  const supabase = await getSupabaseAdminClient();
  console.log(`Supabase admin client: connected.`);
  console.log(`Mode: ${mode === "write" ? "WRITE" : "DRY RUN"}`);
  console.log(`Public base URL: ${publicBaseUrl}`);
  console.log("");

  const { data, error } = await (supabase.from("place_images") as any)
    .select("id, place_id, storage_key, image_url")
    .is("image_url", null)
    .not("storage_key", "is", null);

  if (error) {
    console.error("Failed to query place_images:", error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as Array<{
    id: string;
    place_id: string;
    storage_key: string | null;
    image_url: string | null;
  }>;

  if (rows.length === 0) {
    console.log("No rows found with image_url = null and storage_key set. Nothing to do.");
    return;
  }

  console.log(`Found ${rows.length} place_images row(s) with null image_url.`);
  console.log("");

  const updates: Array<{ id: string; image_url: string; storage_key: string }> = [];

  for (const row of rows) {
    const storageKey = (row.storage_key ?? "").trim();
    if (!storageKey) continue;

    const imageUrl = `${publicBaseUrl}/${storageKey}`;
    updates.push({ id: row.id, image_url: imageUrl, storage_key: storageKey });
  }

  if (updates.length === 0) {
    console.log("No valid rows to update.");
    return;
  }

  for (const u of updates) {
    console.log(`  ${u.id}  ->  ${u.image_url}`);
  }

  console.log("");
  console.log(`Total rows to backfill: ${updates.length}`);

  if (mode === "dry-run") {
    console.log("");
    console.log("DRY RUN: no database writes were performed.");
    console.log("Re-run with --write to apply the updates.");
    return;
  }

  console.log("");
  console.log("Writing updates...");

  let updated = 0;
  const batchSize = 25;
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((u) =>
        (supabase.from("place_images") as any)
          .update({ image_url: u.image_url })
          .eq("id", u.id)
          .is("image_url", null)
      )
    );
    const batchOk = results.filter((r: { error?: unknown }) => !r.error).length;
    updated += batchOk;
    const batchErrors = results.filter((r: { error?: unknown }) => r.error);
    for (const r of batchErrors) {
      console.error(`    Error updating row: ${(r.error as { message?: string }).message ?? "unknown"}`);
    }
    console.log(`  Updated ${updated} / ${updates.length}`);
  }

  console.log("");
  if (updated === updates.length) {
    console.log(`Successfully backfilled ${updated} image_url(s).`);
  } else {
    console.log(`Partially done: ${updated} / ${updates.length} updated.`);
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error("Backfill script failed:", err);
  process.exit(1);
});
