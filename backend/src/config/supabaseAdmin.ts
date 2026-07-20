import { createClient } from "@supabase/supabase-js";
import { getSecret } from "./keyVault";
import { KEY_VAULT_SECRET_NAMES } from "./secretNames";

let supabaseAdminClient: ReturnType<typeof createClient> | null = null;

async function resolveSupabaseConfig(): Promise<{ url: string; key: string } | null> {
  const envUrl = process.env.SUPABASE_URL?.trim();
  const envKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

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
