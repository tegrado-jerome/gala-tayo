import { createClient } from "@supabase/supabase-js";
import { getSecret } from "./keyVault";

let supabaseAdminClient: ReturnType<typeof createClient> | null = null;

export async function getSupabaseAdminClient() {
  if (supabaseAdminClient) {
    return supabaseAdminClient;
  }

  const supabaseUrl = await getSecret("supabase-url");
  const supabaseServiceRoleKey = await getSecret("supabase-service-role-key");

  supabaseAdminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseAdminClient;
}