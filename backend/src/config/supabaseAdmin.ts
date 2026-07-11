import { createClient } from "@supabase/supabase-js";
import { getSecret } from "./keyVault";
import { KEY_VAULT_SECRET_NAMES } from "./secretNames";

let supabaseAdminClient: ReturnType<typeof createClient> | null = null;

export async function getSupabaseAdminClient() {
  if (supabaseAdminClient) {
    return supabaseAdminClient;
  }

  const supabaseUrl = await getSecret(KEY_VAULT_SECRET_NAMES.SUPABASE_URL);
  const supabaseServiceRoleKey = await getSecret(KEY_VAULT_SECRET_NAMES.SUPABASE_SERVICE_ROLE_KEY);

  supabaseAdminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseAdminClient;
}
