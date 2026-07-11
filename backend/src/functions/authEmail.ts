import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { getRedisClient } from "../services/redisCacheService";
import { validateJwt } from "../utils/auth";
import { checkEndpointRateLimit } from "../utils/redisRateLimit";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AUTH_RESEND_COOLDOWN_MS = 2 * 60 * 1000;

type AuthResendType = "signup" | "recovery";

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function sanitizeNextPath(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue || !trimmedValue.startsWith("/") || trimmedValue.startsWith("//")) {
    return null;
  }

  if (
    trimmedValue === "/login" ||
    trimmedValue === "/login/" ||
    trimmedValue === "/signup" ||
    trimmedValue === "/signup/" ||
    trimmedValue === "/auth" ||
    trimmedValue === "/auth/"
  ) {
    return null;
  }

  return trimmedValue;
}

function getSiteUrl(request: HttpRequest): string {
  const configuredSiteUrl = process.env.SITE_URL || process.env.PUBLIC_SITE_URL;

  if (configuredSiteUrl && configuredSiteUrl.trim()) {
    return configuredSiteUrl.trim().replace(/\/+$/, "");
  }

  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:4173";

  if (!host || host === "localhost:4173" || host.includes(":")) {
    return "https://galatayo.app";
  }

  return `${forwardedProto}://${host}`.replace(/\/+$/, "");
}

function getClientOrigin(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const parsedUrl = new URL(value);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return null;
    }

    return parsedUrl.origin.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

async function checkAuthResendCooldown(email: string, resendType: AuthResendType) {
  const client = await getRedisClient();

  if (!client) {
    return { allowed: true, retryAfterMs: 0 };
  }

  const cooldownKey = `auth-resend:${resendType}:${email}`;
  const existing = await client.get<number>(cooldownKey);

  if (existing) {
    const elapsed = Date.now() - existing;
    if (elapsed < AUTH_RESEND_COOLDOWN_MS) {
      return { allowed: false, retryAfterMs: AUTH_RESEND_COOLDOWN_MS - elapsed };
    }
  }

  await client.set(cooldownKey, Date.now(), { ex: Math.ceil(AUTH_RESEND_COOLDOWN_MS / 1000) });
  return { allowed: true, retryAfterMs: 0 };
}

async function getUserIdsByEmail(email: string) {
  const supabase = await getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("email", email);

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<{ id: string }>).map((user) => user.id);
}

async function emailBelongsToAnotherAccount(email: string, currentUserId: string) {
  const userIds = await getUserIdsByEmail(email);
  return userIds.some((userId) => userId !== currentUserId);
}

async function resendAuthEmail(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const rateLimit = await checkEndpointRateLimit(request, "auth-email-resend", 12, 60);
    if (!rateLimit.allowed && rateLimit.response) {
      return rateLimit.response;
    }

    let body: { email?: unknown; type?: unknown; nextPath?: unknown; clientOrigin?: unknown };

    try {
      body = (await request.json()) as { email?: unknown; type?: unknown; nextPath?: unknown; clientOrigin?: unknown };
    } catch {
      return {
        status: 400,
        jsonBody: {
          message: "Invalid JSON body.",
        },
      };
    }

    const email = normalizeEmail(body.email);
    const resendType = body.type === "signup" || body.type === "recovery" ? body.type : null;

    if (!email || !EMAIL_PATTERN.test(email)) {
      return {
        status: 400,
        jsonBody: {
          message: "Enter a valid email address.",
        },
      };
    }

    if (!resendType) {
      return {
        status: 400,
        jsonBody: {
          message: "type must be signup or recovery.",
        },
      };
    }

    const cooldown = await checkAuthResendCooldown(email, resendType);
    if (!cooldown.allowed) {
      return {
        status: 429,
        jsonBody: {
          message: "Please wait 2 minutes before requesting another email.",
          retryAfterMs: cooldown.retryAfterMs,
        },
      };
    }

    const supabase = await getSupabaseAdminClient();
    const siteUrl = getClientOrigin(body.clientOrigin) ?? getSiteUrl(request);
    const sanitizedNextPath = sanitizeNextPath(body.nextPath) ?? (resendType === "signup" ? "/onboarding" : null);

    const error =
      resendType === "signup"
        ? (
            await supabase.auth.resend({
              type: "signup",
              email,
              options: {
                emailRedirectTo: `${siteUrl}/auth/callback?${new URLSearchParams({
                  ...(sanitizedNextPath ? { next: sanitizedNextPath } : {}),
                  flow: "signup",
                }).toString()}`,
              },
            })
          ).error
        : (
            await supabase.auth.resetPasswordForEmail(email, {
              redirectTo: `${siteUrl}/reset-password`,
            })
          ).error;

    if (error) {
      context.error("POST /api/auth/resend-email failed:", error);

      return {
        status: 500,
        jsonBody: {
          message: "Could not send the email. Please try again.",
        },
      };
    }

    return {
      status: 200,
      jsonBody: {
        message: resendType === "signup" ? "Confirmation email sent." : "Password reset email sent.",
        resendType,
        email,
      },
    };
  } catch (error) {
    context.error("POST /api/auth/resend-email failed:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Could not send the email. Please try again.",
      },
    };
  }
}

export async function authEmailConflict(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const authUser = await validateJwt(request);
    const email = normalizeEmail(authUser.email);

    if (!email) {
      return {
        status: 400,
        jsonBody: {
          message: "Signed-in account has no email address.",
        },
      };
  }

    return {
      status: 200,
      jsonBody: {
        email,
        conflict: await emailBelongsToAnotherAccount(email, authUser.id),
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("authorization")) {
      return {
        status: 401,
        jsonBody: {
          message: "Missing or invalid Authorization header.",
        },
      };
    }

    context.error("GET /api/auth/email-conflict failed:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Could not check account email.",
      },
    };
  }
}

export async function authEmailExists(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const email = normalizeEmail(request.query.get("email"));

    if (!email || !EMAIL_PATTERN.test(email)) {
      return {
        status: 400,
        jsonBody: {
          message: "Enter a valid email address.",
        },
      };
    }

    const rateLimit = await checkEndpointRateLimit(request, "auth-email-exists", 20, 60);
    if (!rateLimit.allowed) {
      return rateLimit.response;
    }

    return {
      status: 200,
      jsonBody: {
        email,
        exists: false,
        message: "If this email can be used, the sign-up flow will continue.",
      },
    };
  } catch (error) {
    context.error("GET /api/auth/email-exists failed:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Could not check email.",
      },
    };
  }
}

app.http("authEmailExists", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "auth/email-exists",
  handler: authEmailExists,
});

app.http("authEmailConflict", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "auth/email-conflict",
  handler: authEmailConflict,
});

app.http("authResendEmail", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "auth/resend-email",
  handler: resendAuthEmail,
});
