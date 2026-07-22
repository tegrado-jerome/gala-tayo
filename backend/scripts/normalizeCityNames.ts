import { readFileSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";
import { clearActivePlacesCache } from "../src/domain/places";

async function normalizeCityNames() {
  const settingsPath = join(__dirname, "..", "local.settings.json");
  try {
    const raw = readFileSync(settingsPath, "utf-8");
    const parsed = JSON.parse(raw) as { Values?: Record<string, string> };
    if (parsed.Values) {
      for (const [key, value] of Object.entries(parsed.Values)) {
        if (!process.env[key]) process.env[key] = value;
      }
    }
  } catch {
    console.warn("Could not load local.settings.json — relying on existing env vars.");
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const updates: { from: string; to: string }[] = [
    { from: "Pasig City", to: "Pasig" },
    { from: "Valenzuela City", to: "Valenzuela" },
  ];

  for (const { from, to } of updates) {
    const { data, error, count } = await (supabase
      .from("places") as any)
      .update({ city: to })
      .eq("city", from)
      .select("id", { count: "exact" });

    if (error) {
      console.error(`Failed to update ${from} → ${to}:`, error);
    } else {
      console.log(`Updated ${count ?? 0} places: ${from} → ${to}`);
    }
  }

  console.log("Clearing active places cache...");
  await clearActivePlacesCache();
  console.log("Cache cleared.");
}

normalizeCityNames()
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Script failed:", err);
    process.exit(1);
  });
