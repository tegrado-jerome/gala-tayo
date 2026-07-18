import { HttpRequest } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";

export type AuthenticatedUser = {
  id: string;
  email?: string;
  metadata?: Record<string, unknown>;
};

export async function validateJwt(request: HttpRequest): Promise<AuthenticatedUser> {
  const authHeader = request.headers.get("authorization");

  if (!authHeader) {
    throw new Error("Missing Authorization header.");
  }

  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new Error("Invalid Authorization header format.");
  }

  const supabase = await getSupabaseAdminClient();

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new Error("Authorization failed: Invalid or expired token.");
  }

  return {
    id: data.user.id,
    email: data.user.email,
    metadata: data.user.user_metadata as Record<string, unknown>,
  };
}
