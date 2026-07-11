import { HttpRequest, HttpResponseInit } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { AuthenticatedUser, validateJwt } from "./auth";

type AdminRoleRow = {
  role: string | null;
};

export type AdminAuthenticatedUser = AuthenticatedUser & {
  accessToken: string;
  aal: string | null;
};

function response(status: number, message: string): HttpResponseInit {
  return {
    status,
    jsonBody: { message },
  };
}

function getBearerToken(request: HttpRequest): string | null {
  const authHeader = request.headers.get("authorization");

  if (!authHeader) {
    return null;
  }

  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

async function isAdminUser(userId: string): Promise<boolean> {
  const supabaseAdmin = await getSupabaseAdminClient();
  const { data, error } = await (supabaseAdmin.from("users") as any)
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return false;
  }

  return ((data as AdminRoleRow | null)?.role || "").trim().toLowerCase() === "admin";
}

async function getAuthenticatorAssuranceLevel(jwt: string): Promise<string | null> {
  const supabaseAdmin = await getSupabaseAdminClient();
  const { data, error } = await supabaseAdmin.auth.mfa.getAuthenticatorAssuranceLevel(jwt);

  if (error) {
    throw error;
  }

  return data.currentLevel ?? null;
}

export async function requireAdminAal2(
  request: HttpRequest
): Promise<{ user?: AdminAuthenticatedUser; response?: HttpResponseInit }> {
  const accessToken = getBearerToken(request);

  if (!accessToken) {
    return { response: response(401, "Missing or invalid Authorization header.") };
  }

  let user: AuthenticatedUser;

  try {
    user = await validateJwt(request);
  } catch {
    return { response: response(401, "Missing or invalid Authorization header.") };
  }

  if (!(await isAdminUser(user.id))) {
    return { response: response(403, "Admin access required.") };
  }

  try {
    const aal = await getAuthenticatorAssuranceLevel(accessToken);

    if (aal !== "aal2") {
      return { response: response(403, "Admin MFA verification required.") };
    }

    return {
      user: {
        ...user,
        accessToken,
        aal,
      },
    };
  } catch {
    return { response: response(401, "Missing or invalid Authorization header.") };
  }
}
