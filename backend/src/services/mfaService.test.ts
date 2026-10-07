import assert from "node:assert/strict";
import { test } from "node:test";
import { createMfaService, DEVICE_TRUST_TTL_MS, MFA_OTP_TTL_MS, MFA_SEND_COOLDOWN_MS, MFA_VERIFIED_TTL_MS, type MfaAdmin } from "./mfaService";

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "qa@example.com" };
const SESSION = "session-a";

function setup({ emailFails = false } = {}) {
  const users = new Map<string, Record<string, unknown>>([[USER.id, { provider: "email", providers: ["email"] }]]);
  const calls = { reads: 0, writes: 0 };
  const failures = { read: false, write: false };
  const admin: MfaAdmin = {
    async getAppMetadata(userId) {
      calls.reads += 1;
      if (failures.read) throw new Error("supabase down");
      return structuredClone(users.get(userId) ?? {});
    },
    async setAppMetadata(userId, appMetadata) {
      calls.writes += 1;
      if (failures.write) throw new Error("supabase down");
      users.set(userId, structuredClone(appMetadata));
    },
  };
  let clock = Date.parse("2026-10-07T00:00:00Z");
  const sent: string[] = [];
  const service = createMfaService({
    admin,
    secret: async () => "test-secret",
    sendEmail: async (_email, code) => {
      if (emailFails) throw new Error("brevo down");
      sent.push(code);
    },
    log: () => undefined,
    now: () => clock,
  });
  return { service, users, calls, failures, sent, advance: (ms: number) => (clock += ms), lastCode: () => sent[sent.length - 1] };
}

const wrong = (code: string) => (code === "123456" ? "654321" : "123456");
const appMfa = (users: Map<string, Record<string, unknown>>) => users.get(USER.id)?.mfa as Record<string, unknown[]>;

test("send then verify: the session no longer needs MFA, with one read and one write each", async () => {
  const { service, users, calls, lastCode } = setup();
  assert.deepEqual((await service.status(USER.id, SESSION, null)).jsonBody, { needsMfa: true });

  calls.reads = 0;
  const sent = await service.sendCode(USER, SESSION);
  assert.deepEqual(sent, { status: 200, jsonBody: { message: "Verification code sent.", maskedEmail: "q***@example.com" } });
  assert.deepEqual(calls, { reads: 1, writes: 1 });

  const verified = await service.verifyCode(USER.id, SESSION, lastCode(), { trustDevice: false, userAgent: "Phone" });
  assert.deepEqual(verified, { status: 200, jsonBody: { verified: true } });
  assert.deepEqual(calls, { reads: 2, writes: 2 });
  assert.deepEqual((await service.status(USER.id, SESSION, null)).jsonBody, { needsMfa: false });
  assert.deepEqual((await service.status(USER.id, "session-b", null)).jsonBody, { needsMfa: true });

  // Other app_metadata stays, and nothing raw is stored.
  const stored = JSON.stringify(users.get(USER.id));
  assert.equal(users.get(USER.id)?.provider, "email");
  assert.ok(!stored.includes(SESSION) && !stored.includes(lastCode()));
});

test("the send cooldown is 30 s and keeps its response shape", async () => {
  const { service, advance } = setup();
  await service.sendCode(USER, SESSION);
  advance(10_000);
  const again = await service.sendCode(USER, SESSION);
  assert.equal(again.status, 429);
  assert.deepEqual(again.jsonBody, { message: "Please wait 20 seconds before requesting another code.", retryAfterMs: MFA_SEND_COOLDOWN_MS - 10_000 });
  advance(20_000);
  assert.equal((await service.sendCode(USER, SESSION)).status, 200);
});

test("wrong codes: 401 each time, then the code is burned after 5 tries (even the right one)", async () => {
  const { service, lastCode } = setup();
  await service.sendCode(USER, SESSION);
  const code = lastCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.deepEqual(await service.verifyCode(USER.id, SESSION, wrong(code), { trustDevice: false, userAgent: "" }), { status: 401, jsonBody: { message: "Invalid code. Please try again." } });
  }
  assert.deepEqual(await service.verifyCode(USER.id, SESSION, code, { trustDevice: false, userAgent: "" }), { status: 429, jsonBody: { message: "Too many wrong codes. Please request a new code." } });
  assert.equal((await service.verifyCode(USER.id, SESSION, code, { trustDevice: false, userAgent: "" })).status, 401);
  assert.deepEqual((await service.status(USER.id, SESSION, null)).jsonBody, { needsMfa: true });
});

test("a new code resets the attempts and replaces the old code", async () => {
  const { service, lastCode, advance } = setup();
  await service.sendCode(USER, SESSION);
  const first = lastCode();
  await service.verifyCode(USER.id, SESSION, wrong(first), { trustDevice: false, userAgent: "" });
  advance(MFA_SEND_COOLDOWN_MS);
  await service.sendCode(USER, SESSION);
  const second = lastCode();
  if (first !== second) assert.equal((await service.verifyCode(USER.id, SESSION, first, { trustDevice: false, userAgent: "" })).status, 401);
  assert.equal((await service.verifyCode(USER.id, SESSION, second, { trustDevice: false, userAgent: "" })).status, 200);
});

test("a code expires after 5 minutes; a verified session after 7 days", async () => {
  const { service, lastCode, advance } = setup();
  await service.sendCode(USER, SESSION);
  advance(MFA_OTP_TTL_MS + 1);
  assert.deepEqual(await service.verifyCode(USER.id, SESSION, lastCode(), { trustDevice: false, userAgent: "" }), {
    status: 401,
    jsonBody: { message: "Code expired or not requested. Please request a new code." },
  });

  await service.sendCode(USER, SESSION);
  await service.verifyCode(USER.id, SESSION, lastCode(), { trustDevice: false, userAgent: "" });
  advance(MFA_VERIFIED_TTL_MS - 1000);
  assert.deepEqual((await service.status(USER.id, SESSION, null)).jsonBody, { needsMfa: false });
  advance(2000);
  assert.deepEqual((await service.status(USER.id, SESSION, null)).jsonBody, { needsMfa: true });
});

test("a code only works for the session it was sent to", async () => {
  const { service, lastCode } = setup();
  await service.sendCode(USER, SESSION);
  assert.equal((await service.verifyCode(USER.id, "session-b", lastCode(), { trustDevice: false, userAgent: "" })).status, 401);
});

test("a trusted device skips MFA on a new session for 30 days; a made-up token does not", async () => {
  const { service, users, lastCode, advance } = setup();
  await service.sendCode(USER, SESSION);
  const result = await service.verifyCode(USER.id, SESSION, lastCode(), { trustDevice: true, userAgent: "Pixel 8 Chrome" });
  const deviceToken = result.jsonBody.deviceToken as string;
  assert.match(deviceToken, /^[0-9a-f-]{36}$/);
  assert.ok(!JSON.stringify(users.get(USER.id)).includes(deviceToken));

  assert.deepEqual((await service.status(USER.id, "new-session", deviceToken)).jsonBody, { needsMfa: false });
  assert.deepEqual((await service.status(USER.id, "new-session", "00000000-0000-4000-8000-000000000000")).jsonBody, { needsMfa: true });
  assert.deepEqual((await service.status("someone-else", "new-session", deviceToken)).jsonBody, { needsMfa: true });
  advance(DEVICE_TRUST_TTL_MS + 1);
  assert.deepEqual((await service.status(USER.id, "new-session", deviceToken)).jsonBody, { needsMfa: true });
});

async function trustDevice(env: ReturnType<typeof setup>, sessionId: string, userAgent: string) {
  env.advance(MFA_SEND_COOLDOWN_MS);
  await env.service.sendCode(USER, sessionId);
  return (await env.service.verifyCode(USER.id, sessionId, env.lastCode(), { trustDevice: true, userAgent })).jsonBody.deviceToken as string;
}

test("trusted devices: list, revoke one (by list id or token), revoke all", async () => {
  const env = setup();
  const phone = await trustDevice(env, "s1", "Phone");
  const laptop = await trustDevice(env, "s2", "Laptop");
  const tablet = await trustDevice(env, "s3", "Tablet");

  const listed = (await env.service.listDevices(USER.id)).jsonBody.devices as Array<{ deviceToken: string; userAgent: string; trustedAt: number }>;
  assert.deepEqual(listed.map((device) => device.userAgent).sort(), ["Laptop", "Phone", "Tablet"]);
  assert.ok(listed.every((device) => typeof device.trustedAt === "number" && ![phone, laptop, tablet].includes(device.deviceToken)));

  const laptopId = listed.find((device) => device.userAgent === "Laptop")!.deviceToken;
  assert.deepEqual(await env.service.revokeDevice(USER.id, laptopId), { status: 200, jsonBody: { revoked: true } });
  assert.deepEqual((await env.service.status(USER.id, "fresh", laptop)).jsonBody, { needsMfa: true });
  assert.deepEqual((await env.service.revokeDevice(USER.id, phone)).jsonBody, { revoked: true });
  assert.deepEqual((await env.service.status(USER.id, "fresh", phone)).jsonBody, { needsMfa: true });
  assert.deepEqual(await env.service.revokeDevice(USER.id, "not-a-device"), { status: 404, jsonBody: { message: "Device not found." } });
  assert.deepEqual((await env.service.status(USER.id, "fresh", tablet)).jsonBody, { needsMfa: false });

  assert.deepEqual(await env.service.revokeAllDevices(USER.id), { status: 200, jsonBody: { revoked: true } });
  assert.deepEqual((await env.service.status(USER.id, "fresh", tablet)).jsonBody, { needsMfa: true });
  assert.deepEqual((await env.service.listDevices(USER.id)).jsonBody, { devices: [] });
});

test("lists stay short: at most 10 trusted devices and 10 verified sessions", async () => {
  const env = setup();
  for (let index = 0; index < 12; index += 1) await trustDevice(env, `s${index}`, `Device ${index}`);
  const mfa = appMfa(env.users);
  assert.equal(mfa.trusted.length, 10);
  assert.equal(mfa.verified.length, 10);
  assert.ok(mfa.pending.length <= 2);
});

test("Supabase failure gives a 503, never a bypass", async () => {
  const env = setup();
  await env.service.sendCode(USER, SESSION);
  await env.service.verifyCode(USER.id, SESSION, env.lastCode(), { trustDevice: false, userAgent: "" });

  env.failures.read = true;
  const unavailable = { status: 503, jsonBody: { message: "Verification is temporarily unavailable. Please try again." } };
  assert.deepEqual(await env.service.status(USER.id, SESSION, null), unavailable);
  assert.deepEqual(await env.service.sendCode(USER, "s2"), unavailable);
  assert.deepEqual(await env.service.verifyCode(USER.id, SESSION, "123456", { trustDevice: false, userAgent: "" }), unavailable);
  assert.deepEqual(await env.service.listDevices(USER.id), unavailable);
  assert.deepEqual(await env.service.revokeAllDevices(USER.id), unavailable);

  // A failed write must not report success either (a verify that isn't saved isn't verified).
  env.failures.read = false;
  env.advance(MFA_SEND_COOLDOWN_MS);
  await env.service.sendCode(USER, "s2");
  env.failures.write = true;
  assert.deepEqual(await env.service.verifyCode(USER.id, "s2", env.lastCode(), { trustDevice: true, userAgent: "" }), unavailable);
  env.failures.write = false;
  assert.deepEqual((await env.service.status(USER.id, "s2", null)).jsonBody, { needsMfa: true });
});

test("a failed send write sends no email", async () => {
  const env = setup();
  env.failures.write = true;
  assert.equal((await env.service.sendCode(USER, SESSION)).status, 503);
  assert.equal(env.sent.length, 0);
});

test("when the email fails the code and cooldown are undone", async () => {
  const env = setup({ emailFails: true });
  assert.deepEqual(await env.service.sendCode(USER, SESSION), { status: 500, jsonBody: { message: "Could not send verification code. Please try again." } });
  const mfa = appMfa(env.users);
  assert.equal(mfa.pending.length, 0);
  assert.equal((await env.service.sendCode(USER, SESSION)).status, 500, "no cooldown after a failed email");
});
