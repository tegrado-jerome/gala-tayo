import { readFileSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";
import { getSecret } from "./keyVault";
import { KEY_VAULT_SECRET_NAMES } from "./secretNames";

let supabaseAdminClient: ReturnType<typeof createClient> | null = null;

function loadLocalSettings(): void {
  try {
    const settingsPath = join(__dirname, "..", "..", "local.settings.json");
    const raw = readFileSync(settingsPath, "utf-8");
    const parsed = JSON.parse(raw) as { Values?: Record<string, string> };
    if (parsed.Values) {
      for (const [key, value] of Object.entries(parsed.Values)) {
        if (!process.env[key]) process.env[key] = value;
      }
    }
  } catch {
    // local.settings.json not available
  }
}

async function resolveSupabaseConfig(): Promise<{ url: string; key: string } | null> {
  loadLocalSettings();

  const envUrl =
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim();
  const envKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim();

  if (envUrl && envKey) {
    return { url: envUrl, key: envKey };
  }

  try {
    const url = await getSecret(KEY_VAULT_SECRET_NAMES.SUPABASE_URL);
    const key = await getSecret(KEY_VAULT_SECRET_NAMES.SUPABASE_SERVICE_ROLE_KEY);
    return { url, key };
  } catch {
    return null;
  }
}

export async function getSupabaseAdminClient() {
  if (supabaseAdminClient) {
    return supabaseAdminClient;
  }

  const config = await resolveSupabaseConfig();

  if (!config) {
    throw new Error("Supabase admin client could not be configured.");
  }

  supabaseAdminClient = createClient(config.url, config.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseAdminClient;
}
