import { HttpRequest, HttpResponseInit } from "@azure/functions";
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

export function unauthorized(message: string): HttpResponseInit {
  return { status: 401, jsonBody: { message } };
}

export function badRequest(message: string): HttpResponseInit {
  return { status: 400, jsonBody: { message } };
}

export function forbidden(message: string): HttpResponseInit {
  return { status: 403, jsonBody: { message } };
}

export async function getAuthenticatedUser(request: HttpRequest): Promise<AuthenticatedUser | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    return await validateJwt(request);
  } catch {
    return null;
  }
}

async function getUserRole(userId: string): Promise<string | null> {
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await supabase.from("users").select("role").eq("id", userId).maybeSingle();
  if (error) return null;
  return ((data as { role?: string } | null)?.role || "").trim().toLowerCase() || null;
}

export async function isAdminUser(userId: string): Promise<boolean> {
  const role = await getUserRole(userId);
  return role === "admin";
}

export async function requireAdmin(request: HttpRequest): Promise<{ user?: AuthenticatedUser; response?: HttpResponseInit }> {
  const user = await getAuthenticatedUser(request);
  if (!user?.id) return { response: unauthorized("Missing or invalid Authorization header.") };
  if (!(await isAdminUser(user.id))) return { response: forbidden("Admin access required.") };
  return { user };
}
