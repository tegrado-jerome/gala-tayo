import assert from "node:assert/strict";
import { test } from "node:test";
import { deleteAccountData, secondsSinceSignIn, type DeletionDb } from "./accountDeletion";

const ME = "11111111-1111-4111-8111-111111111111";
const FRIEND = "22222222-2222-4222-8222-222222222222";

type Row = Record<string, string | null>;

function fakeDb(tables: Record<string, Row[]>, failOn?: string) {
  const log: string[] = [];
  const db: DeletionDb & { log: string[]; authDeleted: string[] } = {
    log,
    authDeleted: [],
    async select(table, column, filterColumn, values, extra) {
      if (values.length === 0) return [];
      return (tables[table] ?? [])
        .filter((row) => values.includes(row[filterColumn] ?? "") && (!extra || row[extra.column] !== extra.notEqual))
        .map((row) => row[column])
        .filter((value): value is string => Boolean(value));
    },
    async remove(table, filterColumn, values) {
      if (failOn === table) throw new Error(`boom on ${table}`);
      if (values.length === 0) return;
      log.push(`remove ${table}.${filterColumn}`);
      tables[table] = (tables[table] ?? []).filter((row) => !values.includes(row[filterColumn] ?? ""));
    },
    async setNull(table, column, filterColumn, values) {
      if (values.length === 0) return;
      log.push(`null ${table}.${column}`);
      for (const row of tables[table] ?? []) if (values.includes(row[filterColumn] ?? "")) row[column] = null;
    },
    async deleteAuthUser(userId) {
      db.authDeleted.push(userId);
    },
  };
  return db;
}

function seed(): Record<string, Row[]> {
  return {
    users: [{ id: ME }, { id: FRIEND }],
    profiles: [
      { user_id: ME, avatar_storage_key: "avatars/me.webp" },
      { user_id: FRIEND, avatar_storage_key: "avatars/friend.webp" },
    ],
    gala_plans: [
      { id: "plan-me", user_id: ME },
      { id: "plan-friend", user_id: FRIEND },
    ],
    gala_plan_items: [
      { id: "i1", plan_id: "plan-me" },
      { id: "i2", plan_id: "plan-friend" },
    ],
    gala_plan_members: [
      { plan_id: "plan-me", user_id: FRIEND },
      { plan_id: "plan-friend", user_id: ME },
      { plan_id: "plan-friend", user_id: FRIEND },
    ],
    gala_plan_polls: [
      { id: "poll-me", plan_id: "plan-me", created_by: ME },
      { id: "poll-friend", plan_id: "plan-friend", created_by: FRIEND },
    ],
    gala_plan_poll_options: [
      { id: "o1", poll_id: "poll-me" },
      { id: "o2", poll_id: "poll-friend" },
    ],
    gala_plan_poll_votes: [
      { poll_id: "poll-me", user_id: FRIEND },
      { poll_id: "poll-friend", user_id: ME },
      { poll_id: "poll-friend", user_id: FRIEND },
    ],
    gala_plan_hearts: [
      { id: "h1", gala_plan_id: "plan-me", user_id: FRIEND },
      { id: "h2", gala_plan_id: "plan-friend", user_id: ME },
    ],
    place_comments: [
      { id: "c-me", user_id: ME, parent_comment_id: null },
      { id: "c-reply", user_id: FRIEND, parent_comment_id: "c-me" },
      { id: "c-friend", user_id: FRIEND, parent_comment_id: null },
    ],
    place_comment_reports: [
      { id: "cr1", comment_id: "c-me", reported_by: FRIEND },
      { id: "cr2", comment_id: "c-friend", reported_by: ME },
      { id: "cr3", comment_id: "c-friend", reported_by: FRIEND },
    ],
    place_images: [
      { id: "img-pending", uploaded_by: ME, status: "pending", storage_key: "places/pending.webp" },
      { id: "img-approved", uploaded_by: ME, status: "approved", storage_key: "places/approved.webp" },
      { id: "img-friend", uploaded_by: FRIEND, status: "pending", storage_key: "places/friend.webp" },
    ],
    place_reports: [
      { id: "pr1", reported_by: FRIEND, reported_image_id: "img-pending" },
      { id: "pr2", reported_by: ME, reported_image_id: null },
    ],
    place_submissions: [
      { id: "s-me", submitted_by: ME },
      { id: "s-friend", submitted_by: FRIEND },
    ],
    place_submission_images: [
      { id: "si1", submission_id: "s-me", submitted_by: ME, storage_key: "subs/me.webp" },
      { id: "si2", submission_id: "s-friend", submitted_by: FRIEND, storage_key: "subs/friend.webp" },
    ],
    user_follows: [
      { id: "f1", follower_id: ME, following_id: FRIEND },
      { id: "f2", follower_id: FRIEND, following_id: ME },
      { id: "f3", follower_id: FRIEND, following_id: "33333333-3333-4333-8333-333333333333" },
    ],
    favorites: [
      { id: "fav1", user_id: ME },
      { id: "fav2", user_id: FRIEND },
    ],
    account_deletion_requests: [
      { id: "d1", user_id: ME },
      { id: "d2", user_id: FRIEND },
    ],
  };
}

test("removes only the user's own data and keeps everyone else's", async () => {
  const tables = seed();
  const db = fakeDb(tables);
  const result = await deleteAccountData(db, ME);

  assert.deepEqual(db.authDeleted, [ME]);
  assert.deepEqual(tables.users.map((row) => row.id), [FRIEND]);
  assert.deepEqual(tables.profiles.map((row) => row.user_id), [FRIEND]);
  assert.deepEqual(tables.gala_plans.map((row) => row.id), ["plan-friend"]);
  assert.deepEqual(tables.gala_plan_items.map((row) => row.id), ["i2"]);
  assert.deepEqual(tables.gala_plan_members, [{ plan_id: "plan-friend", user_id: FRIEND }]);
  assert.deepEqual(tables.gala_plan_polls.map((row) => row.id), ["poll-friend"]);
  assert.deepEqual(tables.gala_plan_poll_options.map((row) => row.id), ["o2"]);
  assert.deepEqual(tables.gala_plan_poll_votes, [{ poll_id: "poll-friend", user_id: FRIEND }]);
  assert.deepEqual(tables.gala_plan_hearts, []);
  assert.deepEqual(tables.place_comment_reports.map((row) => row.id), ["cr3"]);
  assert.deepEqual(tables.place_submissions.map((row) => row.id), ["s-friend"]);
  assert.deepEqual(tables.place_submission_images.map((row) => row.id), ["si2"]);
  assert.deepEqual(tables.user_follows.map((row) => row.id), ["f3"]);
  assert.deepEqual(tables.favorites.map((row) => row.id), ["fav2"]);
  assert.deepEqual(tables.account_deletion_requests.map((row) => row.id), ["d2"]);
  assert.deepEqual(result.storageKeys.sort(), ["avatars/me.webp", "places/pending.webp", "subs/me.webp"]);
});

test("replies from others stay up and approved photos stay without the uploader", async () => {
  const tables = seed();
  await deleteAccountData(fakeDb(tables), ME);

  assert.deepEqual(tables.place_comments, [
    { id: "c-reply", user_id: FRIEND, parent_comment_id: null },
    { id: "c-friend", user_id: FRIEND, parent_comment_id: null },
  ]);
  assert.deepEqual(tables.place_images, [
    { id: "img-approved", uploaded_by: null, status: "approved", storage_key: "places/approved.webp" },
    { id: "img-friend", uploaded_by: FRIEND, status: "pending", storage_key: "places/friend.webp" },
  ]);
  assert.deepEqual(tables.place_reports, [{ id: "pr2", reported_by: null, reported_image_id: null }]);
});

test("a failed step stops before the auth user is deleted", async () => {
  const db = fakeDb(seed(), "favorites");
  await assert.rejects(() => deleteAccountData(db, ME), /boom on favorites/);
  assert.deepEqual(db.authDeleted, []);
});

test("refuses anything that is not a user id", async () => {
  const db = fakeDb(seed());
  for (const bad of ["", "*", "not-a-uuid", `${ME},${FRIEND}`]) {
    await assert.rejects(() => deleteAccountData(db, bad), /valid user id/);
  }
  assert.deepEqual(db.log, []);
  assert.deepEqual(db.authDeleted, []);
});

function token(payload: object) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256" })}.${encode(payload)}.sig`;
}

test("reads the last sign-in time from the amr claim", () => {
  const now = 1_800_000_000;
  assert.equal(secondsSinceSignIn(token({ amr: [{ method: "password", timestamp: now - 120 }] }), now), 120);
  assert.equal(secondsSinceSignIn(token({ amr: [{ method: "oauth", timestamp: now - 9000 }, { method: "otp", timestamp: now - 60 }] }), now), 60);
  assert.equal(secondsSinceSignIn(token({ sub: ME }), now), null);
  assert.equal(secondsSinceSignIn("garbage", now), null);
});
