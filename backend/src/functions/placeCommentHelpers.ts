import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { AuthenticatedUser, validateJwt } from "../utils/auth";
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
};

export type AdminUserRoleRow = {
  role: string | null;
};

export type CommentAuthorProfileRow = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  provider_avatar_url: string | null;
};

export function unauthorized(message: string): HttpResponseInit {
  return {
    status: 401,
    jsonBody: { message },
  };
}

export function badRequest(message: string): HttpResponseInit {
  return {
    status: 400,
    jsonBody: { message },
  };
}

export function logDatabaseError(context: InvocationContext, message: string, error: unknown) {
  context.error(message, error);
  if (process.env.NODE_ENV !== "production") {
    console.error(message, error);
  }
}

export async function getAuthenticatedUser(request: HttpRequest): Promise<AuthenticatedUser | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  try {
    return await validateJwt(request);
  } catch {
    return null;
  }
}

export async function isAdminUser(userId: string): Promise<boolean> {
  const supabaseAdmin = await getSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) return false;

  const user = data as AdminUserRoleRow | null;
  return (user?.role || "").trim().toLowerCase() === "admin";
}

export function getCommentId(request: HttpRequest): string | null {
  const commentId = request.params.commentId?.trim();
  return commentId || null;
}

export function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "");
}

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

  return [...topLevel, ...orphanPlaceholderParents]
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .map((comment) => ({
      ...comment,
      replies: (repliesByParentId.get(comment.id) || [])
        .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
        .map((reply) => ({
          ...reply,
          replies: [],
        })),
    }));
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
