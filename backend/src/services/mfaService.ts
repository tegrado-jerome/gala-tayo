import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { MFA_MAX_VERIFY_ATTEMPTS } from "../utils/mfaTrust";

// MFA state lives in the user's Supabase app_metadata (only the service key can write it), so sign-in works
// without Redis. Codes, session IDs and device tokens are stored only as HMACs with a server secret: the user
// can read their own app_metadata (it's in the JWT), and a plain hash of a 6-digit code is trivial to reverse.
export const MFA_OTP_TTL_MS = 300 * 1000;
export const MFA_VERIFIED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MFA_SEND_COOLDOWN_MS = 30 * 1000;
export const DEVICE_TRUST_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// app_metadata rides in every access token, so the lists stay short.
const MAX_PENDING = 2;
const MAX_VERIFIED = 10;
const MAX_TRUSTED = 10;
const MAX_LABEL = 60;

type Pending = { sessionIdHash: string; codeHash: string; expiresAt: number; attempts: number };
type Verified = { sessionIdHash: string; expiresAt: number };
type Trusted = { deviceTokenHash: string; label: string; createdAt: number; expiresAt: number };
export type MfaState = { pending: Pending[]; lastSentAt: number; verified: Verified[]; trusted: Trusted[] };

/** The admin calls the service needs; Supabase Auth in production, a fake in tests. Both throw when Supabase fails. */
export type MfaAdmin = {
  getAppMetadata(userId: string): Promise<Record<string, unknown>>;
  setAppMetadata(userId: string, appMetadata: Record<string, unknown>): Promise<void>;
};

export type MfaResult = { status: number; jsonBody: Record<string, unknown> };

type ServiceOptions = {
  admin: MfaAdmin;
  /** The server secret the HMACs are keyed with. */
  secret: () => Promise<string>;
  sendEmail: (email: string, code: string) => Promise<void>;
  log: (message: string) => void;
  isDev?: boolean;
  now?: () => number;
};

const UNAVAILABLE: MfaResult = { status: 503, jsonBody: { message: "Verification is temporarily unavailable. Please try again." } };

const list = <T>(value: unknown, valid: (item: Record<string, unknown>) => boolean): T[] =>
  Array.isArray(value) ? (value.filter((item) => item && typeof item === "object" && valid(item as Record<string, unknown>)) as T[]) : [];
const isText = (value: unknown) => typeof value === "string" && value.length > 0;
const isNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value);

/** Reads app_metadata.mfa, dropping malformed and expired entries. */
export function parseMfaState(appMetadata: Record<string, unknown>, now: number): MfaState {
  const raw = appMetadata.mfa && typeof appMetadata.mfa === "object" ? (appMetadata.mfa as Record<string, unknown>) : {};
  const live = (item: Record<string, unknown>) => isNumber(item.expiresAt) && (item.expiresAt as number) > now;
  return {
    pending: list<Pending>(raw.pending, (item) => isText(item.sessionIdHash) && isText(item.codeHash) && isNumber(item.attempts) && live(item)),
    lastSentAt: isNumber(raw.lastSentAt) ? (raw.lastSentAt as number) : 0,
    verified: list<Verified>(raw.verified, (item) => isText(item.sessionIdHash) && live(item)),
    trusted: list<Trusted>(raw.trusted, (item) => isText(item.deviceTokenHash) && isNumber(item.createdAt) && live(item)),
  };
}

function capped(state: MfaState): MfaState {
  const newestFirst = <T extends { expiresAt: number }>(items: T[], max: number) => [...items].sort((left, right) => right.expiresAt - left.expiresAt).slice(0, max);
  return {
    pending: newestFirst(state.pending, MAX_PENDING),
    lastSentAt: state.lastSentAt,
    verified: newestFirst(state.verified, MAX_VERIFIED),
    trusted: newestFirst(state.trusted, MAX_TRUSTED),
  };
}

export function sameHash(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function maskEmail(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex <= 0) return email;
  return `${email[0]}***${email.slice(atIndex)}`;
}

export function createMfaService({ admin, secret, sendEmail, log, isDev = false, now = Date.now }: ServiceOptions) {
  async function hasher() {
    const key = createHmac("sha256", await secret()).update("galatayo-mfa-v1").digest();
    return (kind: string, value: string) => createHmac("sha256", key).update(`${kind}:${value}`).digest("base64url").slice(0, kind === "otp" ? 43 : 22);
  }

  /** One read and (optionally) one write of the user's app_metadata. Any Supabase failure becomes a 503, never a skip. */
  async function withState(userId: string, run: (state: MfaState, hash: Awaited<ReturnType<typeof hasher>>) => Promise<{ result: MfaResult; next?: MfaState }>) {
    let appMetadata: Record<string, unknown>;
    let hash: Awaited<ReturnType<typeof hasher>>;
    try {
      [appMetadata, hash] = await Promise.all([admin.getAppMetadata(userId), hasher()]);
    } catch {
      return { result: UNAVAILABLE, save: async () => false };
    }
    const { result, next } = await run(parseMfaState(appMetadata, now()), hash);
    const save = async (state: MfaState) => {
      try {
        await admin.setAppMetadata(userId, { ...appMetadata, mfa: capped(state) });
        return true;
      } catch {
        return false;
      }
    };
    if (next && !(await save(next))) return { result: UNAVAILABLE, save };
    return { result, save };
  }

  async function sendCode(user: { id: string; email: string }, sessionId: string): Promise<MfaResult> {
    const code = String(randomInt(100000, 999999));
    // The state before this code, to undo it if the email fails.
    const undo: { state?: MfaState } = {};
    const { result, save } = await withState(user.id, async (state, hash) => {
      const waitMs = state.lastSentAt + MFA_SEND_COOLDOWN_MS - now();
      if (waitMs > 0) {
        const seconds = Math.ceil(waitMs / 1000);
        return { result: { status: 429, jsonBody: { message: `Please wait ${seconds} seconds before requesting another code.`, retryAfterMs: waitMs } } };
      }
      undo.state = state;
      const sessionIdHash = hash("session", sessionId);
      const pending: Pending = { sessionIdHash, codeHash: hash("otp", `${user.id}:${sessionIdHash}:${code}`), expiresAt: now() + MFA_OTP_TTL_MS, attempts: 0 };
      // A new code replaces this session's old one and resets its attempts.
      const next = { ...state, lastSentAt: now(), pending: [pending, ...state.pending.filter((item) => item.sessionIdHash !== sessionIdHash)] };
      return { result: { status: 200, jsonBody: { message: "Verification code sent.", maskedEmail: maskEmail(user.email) } }, next };
    });
    if (result.status !== 200 || !undo.state) return result;

    log(`Sending MFA OTP to ${maskEmail(user.email)} (user ${user.id})`);
    try {
      await sendEmail(user.email, code);
    } catch {
      if (!isDev) {
        // Undo the code and the cooldown, as before, so the user can ask again right away.
        await save(undo.state);
        return { status: 500, jsonBody: { message: "Could not send verification code. Please try again." } };
      }
      log("DEV MODE: Keeping OTP for local testing.");
    }
    return isDev ? { status: 200, jsonBody: { ...result.jsonBody, devOtp: code } } : result;
  }

  async function verifyCode(userId: string, sessionId: string, code: string, trust: { trustDevice: boolean; userAgent: string }): Promise<MfaResult> {
    const { result } = await withState(userId, async (state, hash) => {
      const sessionIdHash = hash("session", sessionId);
      const pending = state.pending.find((item) => sameHash(item.sessionIdHash, sessionIdHash));
      if (!pending) return { result: { status: 401, jsonBody: { message: "Code expired or not requested. Please request a new code." } } };

      // Each code gets a few tries; after that it is burned and a new one must be requested.
      const attempts = pending.attempts + 1;
      const others = state.pending.filter((item) => item !== pending);
      if (attempts > MFA_MAX_VERIFY_ATTEMPTS) {
        return { result: { status: 429, jsonBody: { message: "Too many wrong codes. Please request a new code." } }, next: { ...state, pending: others } };
      }
      if (!sameHash(hash("otp", `${userId}:${sessionIdHash}:${code}`), pending.codeHash)) {
        return { result: { status: 401, jsonBody: { message: "Invalid code. Please try again." } }, next: { ...state, pending: [{ ...pending, attempts }, ...others] } };
      }

      const verified = [{ sessionIdHash, expiresAt: now() + MFA_VERIFIED_TTL_MS }, ...state.verified.filter((item) => item.sessionIdHash !== sessionIdHash)];
      let trusted = state.trusted;
      let deviceToken: string | null = null;
      if (trust.trustDevice) {
        deviceToken = randomUUID();
        const label = (trust.userAgent || "Unknown device").slice(0, MAX_LABEL);
        trusted = [{ deviceTokenHash: hash("device", deviceToken), label, createdAt: now(), expiresAt: now() + DEVICE_TRUST_TTL_MS }, ...trusted];
      }
      log(`MFA verified for user ${userId}`);
      return { result: { status: 200, jsonBody: deviceToken ? { verified: true, deviceToken } : { verified: true } }, next: { ...state, pending: others, verified, trusted } };
    });
    return result;
  }

  /** needsMfa is false only when this session verified or this device is trusted, read fresh (the JWT copy can be stale). */
  async function status(userId: string, sessionId: string | null, deviceToken: string | null): Promise<MfaResult> {
    if (!sessionId && !deviceToken) return { status: 200, jsonBody: { needsMfa: true } };
    const { result } = await withState(userId, async (state, hash) => {
      const sessionOk = sessionId ? state.verified.some((item) => sameHash(item.sessionIdHash, hash("session", sessionId))) : false;
      const deviceOk = deviceToken ? state.trusted.some((item) => sameHash(item.deviceTokenHash, hash("device", deviceToken))) : false;
      return { result: { status: 200, jsonBody: { needsMfa: !(sessionOk || deviceOk) } } };
    });
    return result;
  }

  // The list hands out each device's hash as its id (the raw token only ever lives on that device).
  async function listDevices(userId: string): Promise<MfaResult> {
    const { result } = await withState(userId, async (state) => ({
      result: { status: 200, jsonBody: { devices: state.trusted.map((item) => ({ deviceToken: item.deviceTokenHash, userAgent: item.label, trustedAt: item.createdAt })) } },
    }));
    return result;
  }

  /** Accepts the id from the list or the device's own token. */
  async function revokeDevice(userId: string, deviceToken: string): Promise<MfaResult> {
    const { result } = await withState(userId, async (state, hash) => {
      const tokenHash = hash("device", deviceToken);
      const kept = state.trusted.filter((item) => !sameHash(item.deviceTokenHash, deviceToken) && !sameHash(item.deviceTokenHash, tokenHash));
      if (kept.length === state.trusted.length) return { result: { status: 404, jsonBody: { message: "Device not found." } } };
      return { result: { status: 200, jsonBody: { revoked: true } }, next: { ...state, trusted: kept } };
    });
    return result;
  }

  async function revokeAllDevices(userId: string): Promise<MfaResult> {
    const { result } = await withState(userId, async (state) => ({ result: { status: 200, jsonBody: { revoked: true } }, next: { ...state, trusted: [] } }));
    return result;
  }

  return { sendCode, verifyCode, status, listDevices, revokeDevice, revokeAllDevices };
}
