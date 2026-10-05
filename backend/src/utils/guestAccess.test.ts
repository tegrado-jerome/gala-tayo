import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  ACCOUNT_ONLY_FUNCTIONS,
  ACCOUNT_REQUIRED_CODE,
  GUEST_ALLOWED_FUNCTIONS,
  getGuestAccessDenial,
  isAnonymousBearer,
} from "./guestAccess";

function bearer(payload: Record<string, unknown>) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `Bearer ${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.signature`;
}

const guestToken = bearer({ sub: "11111111-1111-4111-8111-111111111111", is_anonymous: true });
const accountToken = bearer({ sub: "22222222-2222-4222-8222-222222222222", is_anonymous: false });

function registeredFunctionNames() {
  const names: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith(".ts") && !path.endsWith(".test.ts")) {
        for (const match of readFileSync(path, "utf-8").matchAll(/app\.(?:http|timer)\("([^"]+)"/g)) names.push(match[1]);
      }
    }
  };
  walk(join(__dirname, "..", "functions"));
  return names;
}

test("every registered function is classified exactly once", () => {
  const names = registeredFunctionNames();
  assert.ok(names.length > 100, "expected to find the function registrations");
  for (const name of names) {
    const inGuest = GUEST_ALLOWED_FUNCTIONS.has(name);
    const inAccount = ACCOUNT_ONLY_FUNCTIONS.has(name);
    assert.ok(inGuest !== inAccount, `${name} must be in exactly one of GUEST_ALLOWED_FUNCTIONS / ACCOUNT_ONLY_FUNCTIONS`);
  }
  for (const name of [...GUEST_ALLOWED_FUNCTIONS, ...ACCOUNT_ONLY_FUNCTIONS]) {
    assert.ok(names.includes(name), `${name} is listed but no longer registered`);
  }
});

test("guest tokens are rejected on account-only endpoints with a clear 401", () => {
  for (const name of [
    "meProfileSocial",
    "profileFollow",
    "placeCommentsCreate",
    "placeReviewsUpsert",
    "placeReportsCreate",
    "userReportsCreate",
    "createPlaceSubmission",
    "privacyRequestsMe",
    "accountDeletionRequestMe",
    "currentUserMe",
    "onboardingComplete",
    "sendMfaEmailCode",
    "adminPlaceImagesPending",
    "cacheClear",
  ]) {
    const denial = getGuestAccessDenial(name, guestToken);
    assert.equal(denial?.status, 401, name);
    assert.equal((denial?.jsonBody as { code?: string }).code, ACCOUNT_REQUIRED_CODE);
    assert.match((denial?.jsonBody as { message: string }).message, /account/i);
  }
});

test("guest tokens pass on guest-allowed endpoints", () => {
  for (const name of [
    "favoritesCreate",
    "favoritesList",
    "createGalaPlan",
    "addGalaPlanItem",
    "galaPlanRsvp",
    "galaPlanPollVote",
    "askAiChatbot",
    "galaPlanAiDraft",
    "placeCheckin",
    "myPassport",
    "placeDetail",
    "getMfaStatus",
  ]) {
    assert.equal(getGuestAccessDenial(name, guestToken), null, name);
  }
});

test("account tokens and anonymous visitors are never blocked by the guest guard", () => {
  assert.equal(getGuestAccessDenial("placeCommentsCreate", accountToken), null);
  assert.equal(getGuestAccessDenial("profileFollow", null), null);
  assert.equal(getGuestAccessDenial("profileFollow", "Bearer not-a-jwt"), null);
});

test("unknown functions are account-only by default", () => {
  assert.equal(getGuestAccessDenial("someFutureEndpoint", guestToken)?.status, 401);
});

test("isAnonymousBearer reads only a true is_anonymous claim", () => {
  assert.equal(isAnonymousBearer(guestToken), true);
  assert.equal(isAnonymousBearer(guestToken.replace("Bearer", "bearer")), true);
  assert.equal(isAnonymousBearer(accountToken), false);
  assert.equal(isAnonymousBearer(bearer({ is_anonymous: "true" })), false);
  assert.equal(isAnonymousBearer("Basic abc"), false);
  assert.equal(isAnonymousBearer(undefined), false);
});
