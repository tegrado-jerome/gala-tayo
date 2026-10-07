/*
 * Self-serve account deletion (RA 10173 right to erasure). Removes one user's personal data, then the
 * auth user. Every step filters by that user's id or by ids of rows that user owns, so no one else's
 * data is removed. The only rows of other people that change: replies to the user's comments lose
 * their parent link, so they stay up as plain comments.
 */

export type DeletionDb = {
  /** Values of `column` for rows where `filterColumn` is one of `values` (and `extra` matches, when given). */
  select(table: string, column: string, filterColumn: string, values: string[], extra?: { column: string; notEqual: string }): Promise<string[]>;
  remove(table: string, filterColumn: string, values: string[]): Promise<void>;
  setNull(table: string, column: string, filterColumn: string, values: string[]): Promise<void>;
  deleteAuthUser(userId: string): Promise<void>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rows that only hold this user's own activity, keyed by the column holding their id.
const OWN_ROWS: Array<[table: string, column: string]> = [
  ["gala_plan_poll_votes", "user_id"],
  ["gala_plan_members", "user_id"],
  ["gala_plan_hearts", "user_id"],
  ["place_comment_reports", "reported_by"],
  ["place_reviews", "submitted_by"],
  ["user_follows", "follower_id"],
  ["user_follows", "following_id"],
  ["user_reports", "reporter_user_id"],
  ["user_reports", "reported_user_id"],
  ["favorites", "user_id"],
  ["history", "user_id"],
  ["gala_place_checkins", "user_id"],
  ["onboarding_drafts", "user_id"],
  ["user_policy_acceptances", "user_id"],
  ["ask_ai_usage", "user_id"],
  ["rate_limits", "user_id"],
  ["feedback", "user_id"],
  ["privacy_requests", "user_id"],
  ["account_deletion_requests", "user_id"],
];

export type DeletionResult = { storageKeys: string[] };

/**
 * Deletes the user's data in foreign-key order and then the auth user. Throws on the first failed
 * step, before the auth user is touched. Returns R2 keys of the user's uploads for the caller to remove.
 */
export async function deleteAccountData(db: DeletionDb, userId: string): Promise<DeletionResult> {
  if (!UUID.test(userId)) throw new Error("A valid user id is required.");
  const me = [userId];

  // The user's plans and everything hanging off them.
  const planIds = await db.select("gala_plans", "id", "user_id", me);
  const pollIds = unique([
    ...(await db.select("gala_plan_polls", "id", "plan_id", planIds)),
    ...(await db.select("gala_plan_polls", "id", "created_by", me)),
  ]);
  await db.remove("gala_plan_poll_votes", "poll_id", pollIds);
  await db.remove("gala_plan_poll_options", "poll_id", pollIds);
  await db.remove("gala_plan_polls", "id", pollIds);
  await db.remove("gala_plan_members", "plan_id", planIds);
  await db.remove("gala_plan_hearts", "gala_plan_id", planIds);
  await db.remove("gala_plan_items", "plan_id", planIds);
  await db.remove("gala_plans", "id", planIds);

  // Comments: reports on them go, replies from others stay as top-level comments.
  const commentIds = await db.select("place_comments", "id", "user_id", me);
  await db.remove("place_comment_reports", "comment_id", commentIds);
  await db.setNull("place_comments", "parent_comment_id", "parent_comment_id", commentIds);
  await db.remove("place_comments", "id", commentIds);

  // Photos not yet approved are removed; approved place photos stay up without the uploader's id.
  const unapprovedImageIds = await db.select("place_images", "id", "uploaded_by", me, { column: "status", notEqual: "approved" });
  const storageKeys = await db.select("place_images", "storage_key", "id", unapprovedImageIds);
  await db.remove("place_reports", "reported_image_id", unapprovedImageIds);
  await db.remove("place_images", "id", unapprovedImageIds);
  await db.setNull("place_images", "uploaded_by", "uploaded_by", me);
  await db.setNull("place_reports", "reported_by", "reported_by", me);

  // Place submissions and their photos.
  const submissionIds = await db.select("place_submissions", "id", "submitted_by", me);
  storageKeys.push(...(await db.select("place_submission_images", "storage_key", "submission_id", submissionIds)));
  storageKeys.push(...(await db.select("place_submission_images", "storage_key", "submitted_by", me)));
  await db.remove("place_submission_images", "submission_id", submissionIds);
  await db.remove("place_submission_images", "submitted_by", me);
  await db.remove("place_submissions", "id", submissionIds);

  for (const [table, column] of OWN_ROWS) await db.remove(table, column, me);

  storageKeys.push(...(await db.select("profiles", "avatar_storage_key", "user_id", me)));
  await db.remove("profiles", "user_id", me);
  await db.remove("users", "id", me);
  await db.deleteAuthUser(userId);

  return { storageKeys: unique(storageKeys.filter(Boolean)) };
}

function unique(values: string[]) {
  return [...new Set(values)];
}

/** Seconds since the session's last real sign-in, from the JWT's `amr` claim; null when it has none. */
export function secondsSinceSignIn(token: string, nowSeconds = Math.floor(Date.now() / 1000)): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { amr?: Array<{ timestamp?: unknown }> };
    const times = (payload.amr ?? []).map((entry) => Number(entry?.timestamp)).filter((value) => Number.isFinite(value) && value > 0);
    return times.length ? Math.max(0, nowSeconds - Math.max(...times)) : null;
  } catch {
    return null;
  }
}

// Deleting needs a sign-in (password or Google) from the last 15 minutes, not just an old refreshed session.
export const REAUTH_MAX_AGE_SECONDS = 15 * 60;
export const DELETE_CONFIRM_WORD = "DELETE";
