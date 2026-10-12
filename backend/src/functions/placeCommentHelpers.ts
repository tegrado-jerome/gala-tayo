import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { AuthenticatedUser, getAuthenticatedUser, isAdminUser, unauthorized, badRequest, validateJwt } from "../utils/auth";
import { getPlaceIdentifier, isPlaceUuid, resolvePlaceId } from "../utils/placeIdentity";

export type PlaceCommentRow = {
  id: string;
  place_id: string;
  user_id: string;
  parent_comment_id: string | null;
  comment: string;
  status: "visible" | "deleted" | "hidden";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PlaceComment = PlaceCommentRow & {
  member_display_name?: string | null;
  member_username?: string | null;
  member_avatar_url?: string | null;
  current_user_reported?: boolean;
  replies: PlaceComment[];
};

export type CommentRequestBody = {
  placeId?: unknown;
  comment?: unknown;
  body?: unknown;
};

export type CommentReportRequestBody = {
  reason?: unknown;
  details?: unknown;
};

export type CommentReportModerationRequestBody = {
  action?: unknown;
};

export const COMMENT_COLUMNS =
  "id, place_id, user_id, parent_comment_id, comment, status, created_at, updated_at, deleted_at";
export const BODY_MAX_LENGTH = 2000;
export const REPORT_DETAILS_MAX_LENGTH = 500;
export const REPORT_REASONS = ["spam", "harassment", "inappropriate", "false_info", "personal_info", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportStatus = "pending" | "dismissed" | "action_taken";

export type CommentReportRow = {
  id: string;
  comment_id: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type ReportPlaceRow = {
  id: string;
  name: string | null;
  slug: string | null;
};

export type CommentModerationNoticeReportRow = {
  id: string;
  comment_id: string;
  status: "action_taken";
  created_at: string;
  resolved_at: string | null;
};

export type AdminCommentReportRow = {
  id: string;
  comment_id: string;
  status: ReportStatus;
  reported_by: string;
  details: string | null;
};

export type CommentAuthorProfileRow = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  provider_avatar_url: string | null;
};

export function logDatabaseError(context: InvocationContext, message: string, error: unknown) {
  context.error(message, error);
  if (process.env.NODE_ENV !== "production") {
    console.error(message, error);
  }
}

export function getCommentId(request: HttpRequest): string | null {
  const commentId = request.params.commentId?.trim();
  return commentId || null;
}

export function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "");
}

export type HoldReason = "link" | "phone" | "email";

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/i;
const LINK_PATTERN = /\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|net|org|ph|io|co|me|ly|gl|gg|app|xyz|info|biz|shop|site|online|link)\b/i;
const PHONE_PATTERNS = [
  /(?<!\d)(?:\+?63|0)[\s.-]?9\d{2}[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/, // PH mobile: 0917 123 4567, +63 917 123 4567
  /(?<!\d)\(?0\d{1,2}\)?[\s.-]?[2-8]\d{3}[\s.-]?\d{4}(?!\d)/, // landline with area code: (02) 8123 4567
  /\+\d(?:[\s.-]?\d){7,}/, // any international number
];

/** Why a comment should wait for a moderator before it shows: links, phone numbers and emails are the usual spam and doxxing vectors. */
export function findHoldReason(text: string): HoldReason | null {
  if (EMAIL_PATTERN.test(text)) return "email";
  if (LINK_PATTERN.test(text)) return "link";
  if (PHONE_PATTERNS.some((pattern) => pattern.test(text))) return "phone";
  return null;
}

export const AUTO_HOLD_NOTE = "Auto-held for review";

const HOLD_DETAILS: Record<HoldReason, string> = {
  link: `${AUTO_HOLD_NOTE}: contains a link.`,
  phone: `${AUTO_HOLD_NOTE}: contains a phone number.`,
  email: `${AUTO_HOLD_NOTE}: contains an email address.`,
};

/**
 * Queues a held (hidden) comment in the existing report queue as a pending report filed under its author, since
 * reported_by must be a user. Dismissing that report releases the comment; taking action keeps it hidden.
 */
export async function queueHeldComment(
  comment: Pick<PlaceCommentRow, "id" | "user_id">,
  reason: HoldReason
): Promise<{ error: unknown }> {
  const supabaseAdmin = await getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { error } = await (supabaseAdmin.from("place_comment_reports") as any).upsert(
    {
      comment_id: comment.id,
      reported_by: comment.user_id,
      reason: reason === "link" ? "spam" : "personal_info",
      details: HOLD_DETAILS[reason],
      status: "pending",
      resolved_by: null,
      resolved_at: null,
      updated_at: now,
    },
    { onConflict: "comment_id,reported_by" }
  );
  return { error };
}

export function isAutoHoldReport(report: { reported_by: string; details: string | null }, commentAuthorId: string): boolean {
  return report.reported_by === commentAuthorId && Boolean(report.details?.startsWith(AUTO_HOLD_NOTE));
}

export const HELD_COMMENT_MESSAGE = "Thanks! Tips with links, phone numbers or emails are checked by our team before they show.";

export async function readCleanBody(request: HttpRequest): Promise<{ body?: string; response?: HttpResponseInit }> {
  let payload: CommentRequestBody;
  try {
    payload = (await request.json()) as CommentRequestBody;
  } catch {
    return {
      response: {
        status: 400,
        jsonBody: { message: "Invalid JSON body." },
      },
    };
  }

  if (typeof payload.body !== "string") {
    return {
      response: {
        status: 400,
        jsonBody: { message: "Comment body is required." },
      },
    };
  }

  const body = stripHtml(payload.body).trim();
  if (!body) {
    return {
      response: {
        status: 400,
        jsonBody: { message: "Comment body is required." },
      },
    };
  }

  if (body.length > BODY_MAX_LENGTH) {
    return {
      response: {
        status: 400,
        jsonBody: { message: `Comment must be ${BODY_MAX_LENGTH} characters or less.` },
      },
    };
  }

  return { body };
}

export async function readCleanCreateComment(
  request: HttpRequest,
  routePlaceIdentifier: string
): Promise<{ placeId?: string; comment?: string; response?: HttpResponseInit }> {
  let payload: CommentRequestBody;
  try {
    payload = (await request.json()) as CommentRequestBody;
  } catch {
    return { response: badRequest("Invalid JSON body.") };
  }

  if (!isPlaceUuid(payload.placeId)) {
    return { response: badRequest("placeId must be a valid place UUID.") };
  }

  const placeId = payload.placeId.trim();
  if (routePlaceIdentifier !== placeId) {
    return { response: badRequest("Route place id must match body placeId.") };
  }

  if (typeof payload.comment !== "string") {
    return { response: badRequest("comment is required.") };
  }

  const comment = stripHtml(payload.comment).trim();
  if (!comment) {
    return { response: badRequest("comment is required.") };
  }

  if (comment.length > BODY_MAX_LENGTH) {
    return { response: badRequest(`comment must be ${BODY_MAX_LENGTH} characters or less.`) };
  }

  return { placeId, comment };
}

export async function readCleanCommentReport(
  request: HttpRequest
): Promise<{ reason?: ReportReason; details?: string | null; response?: HttpResponseInit }> {
  let payload: CommentReportRequestBody;
  try {
    payload = (await request.json()) as CommentReportRequestBody;
  } catch {
    return { response: badRequest("Invalid JSON body.") };
  }

  if (typeof payload.reason !== "string") {
    return { response: badRequest("reason must be a string.") };
  }

  const reason = payload.reason.trim();
  if (!REPORT_REASONS.includes(reason as ReportReason)) {
    return { response: badRequest("reason is not supported.") };
  }

  if (payload.details !== undefined && payload.details !== null && typeof payload.details !== "string") {
    return { response: badRequest("details must be a string.") };
  }

  const details = typeof payload.details === "string" ? payload.details.trim() : "";
  if (details.length > REPORT_DETAILS_MAX_LENGTH) {
    return { response: badRequest(`details must be ${REPORT_DETAILS_MAX_LENGTH} characters or less.`) };
  }

  return { reason: reason as ReportReason, details: details || null };
}

export async function readCleanCommentReportModerationAction(
  request: HttpRequest
): Promise<{ action?: "dismiss" | "take_action"; response?: HttpResponseInit }> {
  let payload: CommentReportModerationRequestBody;
  try {
    payload = (await request.json()) as CommentReportModerationRequestBody;
  } catch {
    return { response: badRequest("Invalid JSON body.") };
  }

  if (payload.action !== "dismiss" && payload.action !== "take_action") {
    return { response: badRequest("action must be dismiss or take_action.") };
  }

  return { action: payload.action };
}

export async function requireResolvedPlaceId(request: HttpRequest): Promise<{ placeId?: string; response?: HttpResponseInit }> {
  const placeIdentifier = getPlaceIdentifier(request);
  if (!placeIdentifier) {
    return {
      response: {
        status: 400,
        jsonBody: { message: "Place id is required." },
      },
    };
  }

  const placeId = await resolvePlaceId(placeIdentifier);
  if (!placeId) {
    return {
      response: {
        status: 404,
        jsonBody: { message: "Place not found." },
      },
    };
  }

  return { placeId };
}

export async function enrichCommentsWithDisplayNames<T extends PlaceCommentRow>(
  comments: T[]
): Promise<Array<T & { member_display_name?: string | null; member_username?: string | null; member_avatar_url?: string | null }>> {
  if (comments.length === 0) return comments;

  try {
    const supabaseAdmin = await getSupabaseAdminClient();
    const uniqueMemberIds = Array.from(new Set(comments.map((comment) => comment.user_id)));
    const displayNameByMemberId = new Map<string, string>();
    const usernameByMemberId = new Map<string, string>();
    const avatarUrlByMemberId = new Map<string, string>();

    const { data, error } = await (supabaseAdmin.from("profiles") as any)
      .select("user_id, username, display_name, avatar_url, provider_avatar_url")
      .in("user_id", uniqueMemberIds);

    if (error) throw error;

    ((data || []) as CommentAuthorProfileRow[]).forEach((profile) => {
      const displayName = profile.display_name || profile.username;
      const avatarUrl = profile.avatar_url || profile.provider_avatar_url;

      if (displayName?.trim()) displayNameByMemberId.set(profile.user_id, displayName.trim());
      if (profile.username?.trim()) usernameByMemberId.set(profile.user_id, profile.username.trim());
      if (avatarUrl?.trim()) avatarUrlByMemberId.set(profile.user_id, avatarUrl.trim());
    });

    return comments.map((comment) => ({
      ...comment,
      member_display_name: displayNameByMemberId.get(comment.user_id) || null,
      member_username: usernameByMemberId.get(comment.user_id) || null,
      member_avatar_url: avatarUrlByMemberId.get(comment.user_id) || null,
    }));
  } catch {
    return comments;
  }
}

export function buildCommentTree(
  comments: Array<PlaceCommentRow & { member_display_name?: string | null; member_username?: string | null; member_avatar_url?: string | null }>
): PlaceComment[] {
  const commentsById = new Map(comments.map((comment) => [comment.id, comment]));
  const topLevel = comments
    .filter((comment) => !comment.parent_comment_id)
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
  const repliesByParentId = new Map<
    string,
    Array<PlaceCommentRow & { member_display_name?: string | null; member_username?: string | null; member_avatar_url?: string | null }>
  >();

  comments
    .filter((comment) => Boolean(comment.parent_comment_id))
    .forEach((reply) => {
      const parentId = reply.parent_comment_id as string;
      const replies = repliesByParentId.get(parentId) || [];
      replies.push(reply);
      repliesByParentId.set(parentId, replies);
    });

  const orphanPlaceholderParents = Array.from(repliesByParentId.entries())
    .filter(([parentId]) => !commentsById.has(parentId))
    .map(([parentId, replies]) => {
      const firstReply = replies
        .slice()
        .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())[0];

      return {
        id: parentId,
        place_id: firstReply?.place_id || "",
        user_id: "",
        parent_comment_id: null,
        comment: "[Deleted comment]",
        status: "deleted" as const,
        created_at: firstReply?.created_at || new Date(0).toISOString(),
        updated_at: firstReply?.updated_at || firstReply?.created_at || new Date(0).toISOString(),
        deleted_at: firstReply?.updated_at || firstReply?.created_at || new Date().toISOString(),
        member_display_name: null,
        member_username: null,
        member_avatar_url: null,
      };
    });

  // A removed comment only stays as a placeholder while it still has live replies to hold together.
  return [...topLevel, ...orphanPlaceholderParents]
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .map((comment) => ({
      ...comment,
      replies: (repliesByParentId.get(comment.id) || [])
        .filter((reply) => !isRemovedComment(reply))
        .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
        .map((reply) => ({
          ...reply,
          replies: [],
        })),
    }))
    .filter((comment) => !isRemovedComment(comment) || comment.replies.length > 0);
}

function isRemovedComment(comment: Pick<PlaceCommentRow, "status" | "deleted_at">) {
  return Boolean(comment.deleted_at) || comment.status === "deleted" || comment.status === "hidden";
}

export function normalizeCommentForClient<
  T extends PlaceCommentRow & {
    member_display_name?: string | null;
    member_username?: string | null;
    member_avatar_url?: string | null;
    current_user_reported?: boolean;
  },
>(comment: T): T {
  if (comment.status === "hidden") {
    return {
      ...comment,
      status: "deleted",
      comment: "[Comment removed]",
    } as T;
  }

  if (comment.deleted_at || comment.status === "deleted") {
    return {
      ...comment,
      status: "deleted",
      comment: "[Deleted comment]",
    } as T;
  }

  return comment;
}

export function getCommentPreview(comment: string) {
  return comment.length > 180 ? `${comment.slice(0, 177)}...` : comment;
}
