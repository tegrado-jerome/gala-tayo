import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSecret } from "../config/keyVault";
import { KEY_VAULT_SECRET_NAMES } from "../config/secretNames";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { createMfaService, type MfaAdmin } from "../services/mfaService";
import { validateJwt } from "../utils/auth";
import { sendOtpEmail } from "../utils/brevoEmail";
import { checkEndpointRateLimit, checkPublicReadRateLimit } from "../utils/redisRateLimit";

const supabaseMfaAdmin: MfaAdmin = {
  async getAppMetadata(userId) {
    const supabase = await getSupabaseAdminClient();
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !data.user) throw new Error("Could not read MFA state.");
    return (data.user.app_metadata ?? {}) as Record<string, unknown>;
  },
  async setAppMetadata(userId, appMetadata) {
    const supabase = await getSupabaseAdminClient();
    const { error } = await supabase.auth.admin.updateUserById(userId, { app_metadata: appMetadata });
    if (error) throw new Error("Could not save MFA state.");
  },
};

/** MFA_HMAC_SECRET when set, else the service role key (already server-only). Never a public key. */
async function mfaSecret(): Promise<string> {
  const configured = process.env.MFA_HMAC_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (configured) return configured;
  const fromVault = (await getSecret(KEY_VAULT_SECRET_NAMES.SUPABASE_SERVICE_ROLE_KEY)).trim();
  if (!fromVault) throw new Error("MFA secret is not configured.");
  return fromVault;
}

const isDev = process.env.NODE_ENV === "development" || process.env.AZURE_FUNCTIONS_ENVIRONMENT === "Development";

function service(context: InvocationContext) {
  return createMfaService({ admin: supabaseMfaAdmin, secret: mfaSecret, sendEmail: sendOtpEmail, log: (message) => context.log(message), isDev });
}

function extractSessionIdFromToken(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf-8"),
    );
    return typeof payload.session_id === "string" ? payload.session_id : null;
  } catch {
    return null;
  }
}

function sessionIdFrom(request: HttpRequest): string | null {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return extractSessionIdFromToken(token);
}

/** The shared (Redis) limit fails open when Redis is down, so a per-instance memory limit always applies too. */
async function rateLimited(request: HttpRequest, name: string, maxRequests: number, windowSeconds: number) {
  for (const check of [checkPublicReadRateLimit, checkEndpointRateLimit]) {
    const result = await check(request, name, maxRequests, windowSeconds);
    if (!result.allowed && result.response) return result.response;
  }
  return null;
}

export async function sendMfaEmailCode(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const authUser = await validateJwt(request);
    const userEmail = authUser.email;
    if (!userEmail) {
      return { status: 400, jsonBody: { message: "Your account has no email address." } };
    }

    const limited = await rateLimited(request, "mfa-send-code", 5, 30);
    if (limited) return limited;

    const sessionId = sessionIdFrom(request);
    if (!sessionId) {
      return { status: 400, jsonBody: { message: "Could not identify your session." } };
    }

    return await service(context).sendCode({ id: authUser.id, email: userEmail }, sessionId);
  } catch (error) {
    context.error("POST /api/auth/mfa/send-email-code failed:", error);
    return { status: 500, jsonBody: { message: "Could not send verification code. Please try again." } };
  }
}

export async function verifyMfaEmailCode(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const authUser = await validateJwt(request);

    const sessionId = sessionIdFrom(request);
    if (!sessionId) {
      return { status: 400, jsonBody: { message: "Could not identify your session." } };
    }

    let body: { code?: unknown; trustDevice?: unknown };
    try {
      body = (await request.json()) as { code?: unknown; trustDevice?: unknown };
    } catch {
      return { status: 400, jsonBody: { message: "Invalid JSON body." } };
    }

    const code = typeof body.code === "string" ? body.code.replace(/\D/g, "").slice(0, 6) : "";

    if (!code || code.length !== 6) {
      return { status: 400, jsonBody: { message: "Enter a valid 6-digit code." } };
    }

    const limited = await rateLimited(request, "mfa-verify-code", 10, 60);
    if (limited) return limited;

    return await service(context).verifyCode(authUser.id, sessionId, code, {
      trustDevice: body.trustDevice === true,
      userAgent: request.headers.get("user-agent") ?? "Unknown device",
    });
  } catch (error) {
    context.error("POST /api/auth/mfa/verify-email-code failed:", error);
    return { status: 500, jsonBody: { message: "Could not verify code. Please try again." } };
  }
}

export async function getMfaStatus(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const authUser = await validateJwt(request);

    // Guest sessions have no email to send a device code to.
    if (authUser.isAnonymous) {
      return { status: 200, jsonBody: { needsMfa: false } };
    }

    return await service(context).status(authUser.id, sessionIdFrom(request), request.headers.get("x-device-token"));
  } catch (error) {
    context.error("GET /api/auth/mfa/status failed:", error);
    return { status: 200, jsonBody: { needsMfa: true } };
  }
}

export async function getTrustedDevices(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const authUser = await validateJwt(request);
    return await service(context).listDevices(authUser.id);
  } catch (error) {
    context.error("GET /api/auth/mfa/trusted-devices failed:", error);
    return { status: 200, jsonBody: { devices: [] } };
  }
}

export async function revokeTrustedDevice(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const authUser = await validateJwt(request);

    let body: { deviceToken?: unknown };
    try {
      body = (await request.json()) as { deviceToken?: unknown };
    } catch {
      return { status: 400, jsonBody: { message: "Invalid JSON body." } };
    }

    const deviceToken = typeof body.deviceToken === "string" ? body.deviceToken : "";
    if (!deviceToken) {
      return { status: 400, jsonBody: { message: "Device token is required." } };
    }

    // Only devices this account trusted can be revoked by it.
    return await service(context).revokeDevice(authUser.id, deviceToken);
  } catch (error) {
    context.error("POST /api/auth/mfa/trusted-devices/revoke failed:", error);
    return { status: 500, jsonBody: { message: "Could not revoke device." } };
  }
}

export async function revokeAllTrustedDevices(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const authUser = await validateJwt(request);
    return await service(context).revokeAllDevices(authUser.id);
  } catch (error) {
    context.error("POST /api/auth/mfa/trusted-devices/revoke-all failed:", error);
    return { status: 500, jsonBody: { message: "Could not revoke devices." } };
  }
}

app.http("sendMfaEmailCode", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "auth/mfa/send-email-code",
  handler: sendMfaEmailCode,
});

app.http("verifyMfaEmailCode", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "auth/mfa/verify-email-code",
  handler: verifyMfaEmailCode,
});

app.http("getMfaStatus", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "auth/mfa/status",
  handler: getMfaStatus,
});

app.http("getTrustedDevices", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "auth/mfa/trusted-devices",
  handler: getTrustedDevices,
});

app.http("revokeTrustedDevice", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "auth/mfa/trusted-devices/revoke",
  handler: revokeTrustedDevice,
});

app.http("revokeAllTrustedDevices", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "auth/mfa/trusted-devices/revoke-all",
  handler: revokeAllTrustedDevices,
});
