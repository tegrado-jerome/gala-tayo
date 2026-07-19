import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { validateJwt } from "../utils/auth";
import { getRedisClient } from "../services/redisCacheService";
import { sendOtpEmail } from "../utils/brevoEmail";
import { checkEndpointRateLimit } from "../utils/redisRateLimit";
import { createHash, randomInt } from "node:crypto";

const MFA_OTP_TTL_SECONDS = 300;
const MFA_VERIFIED_TTL_SECONDS = 7 * 24 * 60 * 60;
const MFA_SEND_COOLDOWN_MS = 30 * 1000;

function hashOtp(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateOtp(): string {
  return String(randomInt(100000, 999999));
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

function maskEmail(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex <= 1) return email;
  return `${email[0]}***${email.slice(atIndex)}`;
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

    const rateLimit = await checkEndpointRateLimit(request, "mfa-send-code", 5, 30);
    if (!rateLimit.allowed && rateLimit.response) {
      return rateLimit.response;
    }

    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const sessionId = extractSessionIdFromToken(token);
    if (!sessionId) {
      return { status: 400, jsonBody: { message: "Could not identify your session." } };
    }

    const redis = await getRedisClient();
    if (!redis) {
      return { status: 500, jsonBody: { message: "Service temporarily unavailable." } };
    }

    const cooldownKey = `mfa-send-cooldown:${authUser.id}`;
    const cooldownSet = await redis.set(cooldownKey, Date.now(), {
      ex: Math.ceil(MFA_SEND_COOLDOWN_MS / 1000),
      nx: true,
    });
    if (cooldownSet === null) {
      const ttl = await redis.ttl(cooldownKey);
      return {
        status: 429,
        jsonBody: {
          message: `Please wait ${Math.ceil(ttl)} seconds before requesting another code.`,
          retryAfterMs: Math.max(ttl * 1000, 0),
        },
      };
    }

    const otpCode = generateOtp();
    const otpHash = hashOtp(otpCode);
    const otpKey = `mfa:otp:${authUser.id}:${sessionId}`;

    await redis.set(otpKey, JSON.stringify({ hash: otpHash, email: userEmail }), {
      ex: MFA_OTP_TTL_SECONDS,
    });

    context.log(`Sending MFA OTP to ${maskEmail(userEmail)} (user ${authUser.id})`);

    await sendOtpEmail(userEmail, otpCode);

    return {
      status: 200,
      jsonBody: {
        message: "Verification code sent.",
        maskedEmail: maskEmail(userEmail),
      },
    };
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

    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const sessionId = extractSessionIdFromToken(token);
    if (!sessionId) {
      return { status: 400, jsonBody: { message: "Could not identify your session." } };
    }

    let body: { code?: unknown };
    try {
      body = (await request.json()) as { code?: unknown };
    } catch {
      return { status: 400, jsonBody: { message: "Invalid JSON body." } };
    }

    const code = typeof body.code === "string" ? body.code.replace(/\D/g, "").slice(0, 6) : "";

    if (!code || code.length !== 6) {
      return { status: 400, jsonBody: { message: "Enter a valid 6-digit code." } };
    }

    const redis = await getRedisClient();
    if (!redis) {
      return { status: 500, jsonBody: { message: "Service temporarily unavailable." } };
    }

    const otpKey = `mfa:otp:${authUser.id}:${sessionId}`;
    const storedRaw = await redis.get<string>(otpKey);

    if (!storedRaw) {
      return {
        status: 401,
        jsonBody: { message: "Code expired or not requested. Please request a new code." },
      };
    }

    let storedData: { hash: string; email?: string };
    try {
      storedData = JSON.parse(storedRaw) as { hash: string; email?: string };
    } catch {
      await redis.del(otpKey);
      return { status: 500, jsonBody: { message: "Verification error. Please request a new code." } };
    }

    const inputHash = hashOtp(code);
    if (inputHash !== storedData.hash) {
      return { status: 401, jsonBody: { message: "Invalid code. Please try again." } };
    }

    await redis.del(otpKey);

    const verifiedKey = `mfa:verified:${authUser.id}:${sessionId}`;
    await redis.set(verifiedKey, JSON.stringify({ verifiedAt: Date.now() }), {
      ex: MFA_VERIFIED_TTL_SECONDS,
    });

    context.log(`MFA verified for user ${authUser.id} on session ${sessionId}`);

    return {
      status: 200,
      jsonBody: { verified: true },
    };
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

    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const sessionId = extractSessionIdFromToken(token);

    if (!sessionId) {
      return { status: 200, jsonBody: { needsMfa: true } };
    }

    const redis = await getRedisClient();

    if (!redis) {
      return { status: 200, jsonBody: { needsMfa: false } };
    }

    const verifiedKey = `mfa:verified:${authUser.id}:${sessionId}`;
    const verified = await redis.get(verifiedKey);

    return {
      status: 200,
      jsonBody: { needsMfa: !verified },
    };
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("authorization")) {
      return { status: 200, jsonBody: { needsMfa: false } };
    }

    context.error("GET /api/auth/mfa/status failed:", error);
    return { status: 200, jsonBody: { needsMfa: false } };
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
