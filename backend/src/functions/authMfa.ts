import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { validateJwt } from "../utils/auth";
import { getRedisClient } from "../services/redisCacheService";
import { sendOtpEmail } from "../utils/brevoEmail";
import { checkEndpointRateLimit } from "../utils/redisRateLimit";
import { MFA_MAX_VERIFY_ATTEMPTS, isDeviceTrustedFor, parseTrustedDevice } from "../utils/mfaTrust";
import { createHash, randomInt, randomUUID } from "node:crypto";

const MFA_OTP_TTL_SECONDS = 300;
const MFA_VERIFIED_TTL_SECONDS = 7 * 24 * 60 * 60;
const MFA_SEND_COOLDOWN_MS = 30 * 1000;
const DEVICE_TRUST_TTL_SECONDS = 30 * 24 * 60 * 60;

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
  if (atIndex <= 0) return email;
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

    const redis = await getRedisClient();
    if (!redis) {
      return { status: 500, jsonBody: { message: "Service temporarily unavailable." } };
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

    await redis.set(otpKey, { hash: otpHash, email: userEmail }, {
      ex: MFA_OTP_TTL_SECONDS,
    });

    await redis.del(`mfa:otp-attempts:${authUser.id}:${sessionId}`);

    context.log(`Sending MFA OTP to ${maskEmail(userEmail)} (user ${authUser.id})`);

    const isDev = process.env.NODE_ENV === "development" || process.env.AZURE_FUNCTIONS_ENVIRONMENT === "Development";

    try {
      await sendOtpEmail(userEmail, otpCode);
    } catch (emailError) {
      context.error("Failed to send OTP email:", emailError);
      if (isDev) {
        context.log("DEV MODE: Keeping OTP in Redis for local testing.");
      } else {
        await redis.del(otpKey);
        await redis.del(cooldownKey);
        return { status: 500, jsonBody: { message: "Could not send verification code. Please try again." } };
      }
    }

    const response: { message: string; maskedEmail: string; devOtp?: string } = {
      message: "Verification code sent.",
      maskedEmail: maskEmail(userEmail),
    };

    if (isDev) {
      response.devOtp = otpCode;
    }

    return {
      status: 200,
      jsonBody: response,
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

    const redis = await getRedisClient();
    if (!redis) {
      return { status: 500, jsonBody: { message: "Service temporarily unavailable." } };
    }

    const rateLimit = await checkEndpointRateLimit(request, "mfa-verify-code", 10, 60);
    if (!rateLimit.allowed && rateLimit.response) {
      return rateLimit.response;
    }

    const otpKey = `mfa:otp:${authUser.id}:${sessionId}`;
    const attemptsKey = `mfa:otp-attempts:${authUser.id}:${sessionId}`;
    const storedData = await redis.get<{ hash: string; email?: string }>(otpKey);

    if (!storedData) {
      return {
        status: 401,
        jsonBody: { message: "Code expired or not requested. Please request a new code." },
      };
    }

    // Each code gets a few tries; after that it is burned and a new one must be requested.
    const attempts = await redis.incr(attemptsKey);
    if (attempts === 1) await redis.expire(attemptsKey, MFA_OTP_TTL_SECONDS);
    if (attempts > MFA_MAX_VERIFY_ATTEMPTS) {
      await redis.del(otpKey);
      return { status: 429, jsonBody: { message: "Too many wrong codes. Please request a new code." } };
    }

    const inputHash = hashOtp(code);
    if (inputHash !== storedData.hash) {
      return { status: 401, jsonBody: { message: "Invalid code. Please try again." } };
    }

    await redis.del(otpKey);
    await redis.del(attemptsKey);

    const verifiedKey = `mfa:verified:${authUser.id}:${sessionId}`;
    await redis.set(verifiedKey, JSON.stringify({ verifiedAt: Date.now() }), {
      ex: MFA_VERIFIED_TTL_SECONDS,
    });

    let deviceToken: string | null = null;

    if (body.trustDevice === true) {
      deviceToken = randomUUID();
      const userAgent = request.headers.get("user-agent") ?? "Unknown device";
      await redis.set(`mfa:trusted:${deviceToken}`, JSON.stringify({
        userId: authUser.id,
        trustedAt: Date.now(),
        userAgent,
      }), { ex: DEVICE_TRUST_TTL_SECONDS });

      await redis.sadd(`mfa:trusted:list:${authUser.id}`, deviceToken);
    }

    context.log(`MFA verified for user ${authUser.id} on session ${sessionId}`);

    const response: { verified: boolean; deviceToken?: string } = { verified: true };
    if (deviceToken) {
      response.deviceToken = deviceToken;
    }

    return {
      status: 200,
      jsonBody: response,
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

    // Guest sessions have no email to send a device code to.
    if (authUser.isAnonymous) {
      return { status: 200, jsonBody: { needsMfa: false } };
    }

    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const sessionId = extractSessionIdFromToken(token);

    const redis = await getRedisClient();

    const deviceToken = request.headers.get("x-device-token");
    const verifiedKey = sessionId ? `mfa:verified:${authUser.id}:${sessionId}` : null;
    const trustedKey = deviceToken ? `mfa:trusted:${deviceToken}` : null;

    if (redis && (verifiedKey || trustedKey)) {
      // Both checks in one MGET.
      const values = await redis.mget<unknown[]>(...[verifiedKey, trustedKey].filter((key): key is string => Boolean(key)));
      const verified = verifiedKey ? values[0] : null;
      const trusted = trustedKey ? values[verifiedKey ? 1 : 0] : null;
      if (verified || isDeviceTrustedFor(trusted, authUser.id)) {
        return { status: 200, jsonBody: { needsMfa: false } };
      }
    }

    return { status: 200, jsonBody: { needsMfa: true } };
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
    const redis = await getRedisClient();
    if (!redis) {
      return { status: 200, jsonBody: { devices: [] } };
    }

    const tokenIds = await redis.smembers(`mfa:trusted:list:${authUser.id}`);
    const devices: Array<{ deviceToken: string; userAgent: string; trustedAt: number }> = [];

    const storedDevices = tokenIds.length ? await redis.mget<unknown[]>(...tokenIds.map((tid) => `mfa:trusted:${tid}`)) : [];
    tokenIds.forEach((tid, index) => {
      const parsed = parseTrustedDevice(storedDevices[index]);
      if (parsed?.userId === authUser.id) {
        devices.push({ deviceToken: tid, userAgent: parsed.userAgent, trustedAt: parsed.trustedAt });
      }
    });

    return { status: 200, jsonBody: { devices } };
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

    const redis = await getRedisClient();
    if (!redis) {
      return { status: 500, jsonBody: { message: "Service temporarily unavailable." } };
    }

    // Only devices this account trusted can be revoked by it.
    if (!(await redis.sismember(`mfa:trusted:list:${authUser.id}`, deviceToken))) {
      return { status: 404, jsonBody: { message: "Device not found." } };
    }
    await redis.del(`mfa:trusted:${deviceToken}`);
    await redis.srem(`mfa:trusted:list:${authUser.id}`, deviceToken);

    return { status: 200, jsonBody: { revoked: true } };
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
    const redis = await getRedisClient();
    if (!redis) {
      return { status: 500, jsonBody: { message: "Service temporarily unavailable." } };
    }

    const tokenIds = await redis.smembers(`mfa:trusted:list:${authUser.id}`);
    await redis.del(...tokenIds.map((tid) => `mfa:trusted:${tid}`), `mfa:trusted:list:${authUser.id}`);

    return { status: 200, jsonBody: { revoked: true } };
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
