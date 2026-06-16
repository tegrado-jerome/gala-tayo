import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { AuthenticatedUser, validateJwt } from "../utils/auth";
import { getPlaceIdentifier, isPlaceUuid, resolvePlaceId } from "../utils/placeIdentity";

type PlaceCommentRow = {
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

type PlaceComment = PlaceCommentRow & {
  member_display_name?: string | null;
  member_avatar_url?: string | null;
  current_user_reported?: boolean;
  replies: PlaceComment[];
};

type CommentRequestBody = {
  placeId?: unknown;
  comment?: unknown;
  body?: unknown;
};

type CommentReportRequestBody = {
  reason?: unknown;
  details?: unknown;
};

type CommentReportModerationRequestBody = {
  action?: unknown;
};

const COMMENT_COLUMNS =
  "id, place_id, user_id, parent_comment_id, comment, status, created_at, updated_at, deleted_at";
const BODY_MAX_LENGTH = 2000;
const REPORT_DETAILS_MAX_LENGTH = 500;
const REPORT_REASONS = ["spam", "harassment", "inappropriate", "false_info", "personal_info", "other"] as const;
type ReportReason = (typeof REPORT_REASONS)[number];
type ReportStatus = "pending" | "dismissed" | "action_taken";

type CommentReportRow = {
  id: string;
  comment_id: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

type ReportPlaceRow = {
  id: string;
  name: string | null;
  slug: string | null;
};

type CommentModerationNoticeReportRow = {
  id: string;
  comment_id: string;
  status: "action_taken";
  created_at: string;
  resolved_at: string | null;
};

type AdminCommentReportRow = {
  id: string;
  comment_id: string;
  status: ReportStatus;
};

type AdminUserRoleRow = {
  role: string | null;
};

type CommentAuthorProfileRow = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  provider_avatar_url: string | null;
};

function unauthorized(message: string): HttpResponseInit {
  return {
    status: 401,
    jsonBody: {
      message,
    },
  };
}

function badRequest(message: string): HttpResponseInit {
  return {
    status: 400,
    jsonBody: {
      message,
    },
  };
}

function logDatabaseError(context: InvocationContext, message: string, error: unknown) {
  context.error(message, error);

  if (process.env.NODE_ENV !== "production") {
    console.error(message, error);
  }
}

async function getAuthenticatedUser(request: HttpRequest): Promise<AuthenticatedUser | null> {
  const authHeader = request.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  try {
    return await validateJwt(request);
  } catch {
    return null;
  }
}

async function isAdminUser(userId: string): Promise<boolean> {
  const supabaseAdmin = await getSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return false;
  }

  const user = data as AdminUserRoleRow | null;
  return user?.role === "admin";
}

function getCommentId(request: HttpRequest): string | null {
  const commentId = request.params.commentId?.trim();
  return commentId || null;
}

async function readCleanBody(request: HttpRequest): Promise<{ body?: string; response?: HttpResponseInit }> {
  let payload: CommentRequestBody;

  try {
    payload = (await request.json()) as CommentRequestBody;
  } catch {
    return {
      response: {
        status: 400,
        jsonBody: {
          message: "Invalid JSON body.",
        },
      },
    };
  }

  if (typeof payload.body !== "string") {
    return {
      response: {
        status: 400,
        jsonBody: {
          message: "Comment body is required.",
        },
      },
    };
  }

  const body = payload.body.trim();

  if (!body) {
    return {
      response: {
        status: 400,
        jsonBody: {
          message: "Comment body is required.",
        },
      },
    };
  }

  if (body.length > BODY_MAX_LENGTH) {
    return {
      response: {
        status: 400,
        jsonBody: {
          message: `Comment must be ${BODY_MAX_LENGTH} characters or less.`,
        },
      },
    };
  }

  return { body };
}

async function readCleanCreateComment(
  request: HttpRequest,
  routePlaceIdentifier: string
): Promise<{ placeId?: string; comment?: string; response?: HttpResponseInit }> {
  let payload: CommentRequestBody;

  try {
    payload = (await request.json()) as CommentRequestBody;
  } catch {
    return {
      response: badRequest("Invalid JSON body."),
    };
  }

  if (!isPlaceUuid(payload.placeId)) {
    return {
      response: badRequest("placeId must be a valid place UUID."),
    };
  }

  const placeId = payload.placeId.trim();

  if (routePlaceIdentifier !== placeId) {
    return {
      response: badRequest("Route place id must match body placeId."),
    };
  }

  if (typeof payload.comment !== "string") {
    return {
      response: badRequest("comment is required."),
    };
  }

  const comment = payload.comment.trim();

  if (!comment) {
    return {
      response: badRequest("comment is required."),
    };
  }

  if (comment.length > BODY_MAX_LENGTH) {
    return {
      response: badRequest(`comment must be ${BODY_MAX_LENGTH} characters or less.`),
    };
  }

  return { placeId, comment };
}

async function readCleanCommentReport(
  request: HttpRequest
): Promise<{ reason?: ReportReason; details?: string | null; response?: HttpResponseInit }> {
  let payload: CommentReportRequestBody;

  try {
    payload = (await request.json()) as CommentReportRequestBody;
  } catch {
    return {
      response: badRequest("Invalid JSON body."),
    };
  }

  if (typeof payload.reason !== "string") {
    return {
      response: badRequest("reason must be a string."),
    };
  }

  const reason = payload.reason.trim();

  if (!REPORT_REASONS.includes(reason as ReportReason)) {
    return {
      response: badRequest("reason is not supported."),
    };
  }

  if (payload.details !== undefined && payload.details !== null && typeof payload.details !== "string") {
    return {
      response: badRequest("details must be a string."),
    };
  }

  const details = typeof payload.details === "string" ? payload.details.trim() : "";

  if (details.length > REPORT_DETAILS_MAX_LENGTH) {
    return {
      response: badRequest(`details must be ${REPORT_DETAILS_MAX_LENGTH} characters or less.`),
    };
  }

  return { reason: reason as ReportReason, details: details || null };
}

async function readCleanCommentReportModerationAction(
  request: HttpRequest
): Promise<{ action?: "dismiss" | "take_action"; response?: HttpResponseInit }> {
  let payload: CommentReportModerationRequestBody;

  try {
    payload = (await request.json()) as CommentReportModerationRequestBody;
  } catch {
    return {
      response: badRequest("Invalid JSON body."),
    };
  }

  if (payload.action !== "dismiss" && payload.action !== "take_action") {
    return {
      response: badRequest("action must be dismiss or take_action."),
    };
  }

  return { action: payload.action };
}

async function requireResolvedPlaceId(request: HttpRequest): Promise<{ placeId?: string; response?: HttpResponseInit }> {
  const placeIdentifier = getPlaceIdentifier(request);

  if (!placeIdentifier) {
    return {
      response: {
        status: 400,
        jsonBody: {
          message: "Place id is required.",
        },
      },
    };
  }

  const placeId = await resolvePlaceId(placeIdentifier);

  if (!placeId) {
    return {
      response: {
        status: 404,
        jsonBody: {
          message: "Place not found.",
        },
      },
    };
  }

  return { placeId };
}

async function enrichCommentsWithDisplayNames<T extends PlaceCommentRow>(
  comments: T[]
): Promise<Array<T & { member_display_name?: string | null; member_avatar_url?: string | null }>> {
  if (comments.length === 0) {
    return comments;
  }

  try {
    const supabaseAdmin = await getSupabaseAdminClient();
    const uniqueMemberIds = Array.from(new Set(comments.map((comment) => comment.user_id)));
    const displayNameByMemberId = new Map<string, string>();
    const avatarUrlByMemberId = new Map<string, string>();

    const { data, error } = await (supabaseAdmin.from("profiles") as any)
      .select("user_id, username, display_name, avatar_url, provider_avatar_url")
      .in("user_id", uniqueMemberIds);

    if (error) {
      throw error;
    }

    ((data || []) as CommentAuthorProfileRow[]).forEach((profile) => {
      const displayName = profile.display_name || profile.username;
      const avatarUrl = profile.avatar_url || profile.provider_avatar_url;

      if (displayName?.trim()) {
        displayNameByMemberId.set(profile.user_id, displayName.trim());
      }

      if (avatarUrl?.trim()) {
        avatarUrlByMemberId.set(profile.user_id, avatarUrl.trim());
      }
    });

    return comments.map((comment) => ({
      ...comment,
      member_display_name: displayNameByMemberId.get(comment.user_id) || null,
      member_avatar_url: avatarUrlByMemberId.get(comment.user_id) || null,
    }));
  } catch {
    return comments;
  }
}

function buildCommentTree(
  comments: Array<PlaceCommentRow & { member_display_name?: string | null; member_avatar_url?: string | null }>
): PlaceComment[] {
  const topLevel = comments
    .filter((comment) => !comment.parent_comment_id)
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
  const repliesByParentId = new Map<
    string,
    Array<PlaceCommentRow & { member_display_name?: string | null; member_avatar_url?: string | null }>
  >();

  comments
    .filter((comment) => Boolean(comment.parent_comment_id))
    .forEach((reply) => {
      const parentId = reply.parent_comment_id as string;
      const replies = repliesByParentId.get(parentId) || [];
      replies.push(reply);
      repliesByParentId.set(parentId, replies);
    });

  return topLevel.map((comment) => ({
    ...comment,
    replies: (repliesByParentId.get(comment.id) || [])
      .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
      .map((reply) => ({
        ...reply,
        replies: [],
      })),
  }));
}

function getCommentPreview(comment: string) {
  return comment.length > 180 ? `${comment.slice(0, 177)}...` : comment;
}

export async function placeCommentsList(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const { placeId, response } = await requireResolvedPlaceId(request);

    if (response) {
      return response;
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const commentsTable = supabaseAdmin.from("place_comments") as any;
    const { data, error } = await commentsTable
      .select(COMMENT_COLUMNS)
      .eq("place_id", placeId)
      .eq("status", "visible")
      .is("deleted_at", null);

    if (error) {
      context.error("Failed to fetch place comments:", error);

      return {
        status: 500,
        jsonBody: {
          message: "Failed to fetch place comments.",
        },
      };
    }

    const user = await getAuthenticatedUser(request);
    const visibleComments = (data || []) as PlaceCommentRow[];
    const reportedCommentIds = new Set<string>();

    if (user?.id && visibleComments.length > 0) {
      const reportsTable = supabaseAdmin.from("place_comment_reports") as any;
      const { data: reportData, error: reportsError } = await reportsTable
        .select("comment_id")
        .eq("reported_by", user.id)
        .in("comment_id", visibleComments.map((comment) => comment.id));

      if (reportsError) {
        context.error("Failed to fetch current user comment reports:", reportsError);
      } else {
        ((reportData || []) as Array<{ comment_id: string }>).forEach((report) => {
          reportedCommentIds.add(report.comment_id);
        });
      }
    }

    const comments = await enrichCommentsWithDisplayNames(
      visibleComments.map((comment) => ({
        ...comment,
        current_user_reported: reportedCommentIds.has(comment.id),
      }))
    );

    return {
      status: 200,
      jsonBody: {
        comments: buildCommentTree(comments),
      },
    };
  } catch (error) {
    context.error("Unexpected error in GET /api/places/{id}/comments:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Unexpected server error.",
      },
    };
  }
}

export async function placeCommentsCreate(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const placeIdentifier = getPlaceIdentifier(request);

    if (!placeIdentifier) {
      return badRequest("placeId is required.");
    }

    const user = await getAuthenticatedUser(request);

    if (!user?.id) {
      return unauthorized("Missing or invalid Authorization header.");
    }

    const { placeId, comment: newCommentBody, response: bodyResponse } = await readCleanCreateComment(
      request,
      placeIdentifier
    );

    if (bodyResponse) {
      return bodyResponse;
    }

    const resolvedPlaceId = await resolvePlaceId(placeId as string);

    if (!resolvedPlaceId) {
      return {
        status: 404,
        jsonBody: {
          message: "Place not found.",
        },
      };
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const commentsTable = supabaseAdmin.from("place_comments") as any;
    const { data, error } = await commentsTable
      .insert({
        place_id: resolvedPlaceId,
        user_id: user.id,
        parent_comment_id: null,
        comment: newCommentBody,
        status: "visible",
      })
      .select(COMMENT_COLUMNS)
      .single();

    if (error) {
      logDatabaseError(context, "Failed to create place comment:", error);

      return {
        status: 500,
        jsonBody: {
          message: "Database error while creating comment.",
        },
      };
    }

    const [createdComment] = await enrichCommentsWithDisplayNames([data as PlaceCommentRow]);

    return {
      status: 201,
      jsonBody: {
        message: "Comment posted.",
        comment: {
          ...createdComment,
          replies: [],
        },
      },
    };
  } catch (error) {
    context.error("Unexpected error in POST /api/places/{id}/comments:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Unexpected server error.",
      },
    };
  }
}

export async function placeCommentRepliesCreate(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user?.id) {
      return unauthorized("Missing or invalid Authorization header.");
    }

    const { placeId, response: placeResponse } = await requireResolvedPlaceId(request);

    if (placeResponse) {
      return placeResponse;
    }

    const commentId = getCommentId(request);

    if (!commentId) {
      return {
        status: 400,
        jsonBody: {
          message: "Comment id is required.",
        },
      };
    }

    const { body, response: bodyResponse } = await readCleanBody(request);

    if (bodyResponse) {
      return bodyResponse;
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const commentsTable = supabaseAdmin.from("place_comments") as any;
    const { data: parentData, error: parentError } = await commentsTable
      .select(COMMENT_COLUMNS)
      .eq("id", commentId)
      .eq("place_id", placeId)
      .eq("status", "visible")
      .is("deleted_at", null)
      .maybeSingle();
    const parent = parentData as PlaceCommentRow | null;

    if (parentError || !parent) {
      return {
        status: 404,
        jsonBody: {
          message: "Parent comment not found.",
        },
      };
    }

    if (parent.parent_comment_id) {
      return {
        status: 400,
        jsonBody: {
          message: "Replies can only be added to top-level comments.",
        },
      };
    }

    const { data, error } = await commentsTable
      .insert({
        place_id: placeId,
        user_id: user.id,
        parent_comment_id: parent.id,
        comment: body,
        status: "visible",
      })
      .select(COMMENT_COLUMNS)
      .single();

    if (error) {
      context.error("Failed to create place comment reply:", error);

      return {
        status: 500,
        jsonBody: {
          message: "Failed to create reply.",
        },
      };
    }

    const [reply] = await enrichCommentsWithDisplayNames([data as PlaceCommentRow]);

    return {
      status: 201,
      jsonBody: {
        message: "Reply posted.",
        comment: {
          ...reply,
          replies: [],
        },
      },
    };
  } catch (error) {
    context.error("Unexpected error in POST /api/places/{id}/comments/{commentId}/replies:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Unexpected server error.",
      },
    };
  }
}

export async function placeCommentsUpdate(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user?.id) {
      return unauthorized("Missing or invalid Authorization header.");
    }

    const { placeId, response: placeResponse } = await requireResolvedPlaceId(request);

    if (placeResponse) {
      return placeResponse;
    }

    const commentId = getCommentId(request);

    if (!commentId) {
      return {
        status: 400,
        jsonBody: {
          message: "Comment id is required.",
        },
      };
    }

    const { body, response: bodyResponse } = await readCleanBody(request);

    if (bodyResponse) {
      return bodyResponse;
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const commentsTable = supabaseAdmin.from("place_comments") as any;
    const { data, error } = await commentsTable
      .update({
        comment: body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", commentId)
      .eq("place_id", placeId)
      .eq("user_id", user.id)
      .eq("status", "visible")
      .is("deleted_at", null)
      .select(COMMENT_COLUMNS);

    if (error) {
      context.error("Failed to update place comment:", error);

      return {
        status: 500,
        jsonBody: {
          message: "Failed to update comment.",
        },
      };
    }

    const updatedComments = (data || []) as PlaceCommentRow[];

    if (updatedComments.length === 0) {
      return {
        status: 404,
        jsonBody: {
          message: "Comment not found.",
        },
      };
    }

    const [comment] = await enrichCommentsWithDisplayNames(updatedComments);

    return {
      status: 200,
      jsonBody: {
        message: "Comment updated.",
        comment: {
          ...comment,
          replies: [],
        },
      },
    };
  } catch (error) {
    context.error("Unexpected error in PATCH /api/places/{id}/comments/{commentId}:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Unexpected server error.",
      },
    };
  }
}

export async function placeCommentsDelete(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user?.id) {
      return unauthorized("Missing or invalid Authorization header.");
    }

    const { placeId, response: placeResponse } = await requireResolvedPlaceId(request);

    if (placeResponse) {
      return placeResponse;
    }

    const commentId = getCommentId(request);

    if (!commentId) {
      return {
        status: 400,
        jsonBody: {
          message: "Comment id is required.",
        },
      };
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const commentsTable = supabaseAdmin.from("place_comments") as any;
    const deletedAt = new Date().toISOString();
    const { data, error } = await commentsTable
      .update({
        status: "deleted",
        deleted_at: deletedAt,
        updated_at: deletedAt,
      })
      .eq("id", commentId)
      .eq("place_id", placeId)
      .eq("user_id", user.id)
      .eq("status", "visible")
      .is("deleted_at", null)
      .select(COMMENT_COLUMNS);

    if (error) {
      context.error("Failed to delete place comment:", error);

      return {
        status: 500,
        jsonBody: {
          message: "Failed to delete comment.",
        },
      };
    }

    const deletedComments = (data || []) as PlaceCommentRow[];

    if (deletedComments.length === 0) {
      return {
        status: 404,
        jsonBody: {
          message: "Comment not found.",
        },
      };
    }

    return {
      status: 200,
      jsonBody: {
        message: "Comment deleted.",
        comment: deletedComments[0],
      },
    };
  } catch (error) {
    context.error("Unexpected error in DELETE /api/places/{id}/comments/{commentId}:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Unexpected server error.",
      },
    };
  }
}

export async function placeCommentReportsCreate(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user?.id) {
      return unauthorized("Missing or invalid Authorization header.");
    }

    const commentId = getCommentId(request);

    if (!commentId || !isPlaceUuid(commentId)) {
      return {
        status: 400,
        jsonBody: {
          message: "Comment id must be a valid UUID.",
        },
      };
    }

    const { reason, details, response: reportResponse } = await readCleanCommentReport(request);

    if (reportResponse) {
      return reportResponse;
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const commentsTable = supabaseAdmin.from("place_comments") as any;
    const { data: commentData, error: commentError } = await commentsTable
      .select("id, place_id, user_id, status, deleted_at")
      .eq("id", commentId)
      .eq("status", "visible")
      .is("deleted_at", null)
      .maybeSingle();

    const comment = commentData as Pick<PlaceCommentRow, "id" | "place_id" | "user_id" | "status" | "deleted_at"> | null;

    if (commentError || !comment) {
      return {
        status: 404,
        jsonBody: {
          message: "Comment not found.",
        },
      };
    }

    if (comment.user_id === user.id) {
      return badRequest("You cannot report your own comment.");
    }

    const reportsTable = supabaseAdmin.from("place_comment_reports") as any;
    const { error } = await reportsTable
      .insert({
        comment_id: comment.id,
        reported_by: user.id,
        reason,
        details: details ?? null,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return {
          status: 409,
          jsonBody: {
            error: "already_reported",
            message: "You already reported this comment.",
          },
        };
      }

      context.error("Failed to create place comment report:", error);

      return {
        status: 500,
        jsonBody: {
          message: "Failed to report comment.",
        },
      };
    }

    return {
      status: 201,
      jsonBody: {
        ok: true,
        message: "Report submitted.",
      },
    };
  } catch (error) {
    context.error("Unexpected error in POST /api/place-comments/{commentId}/report:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Unexpected server error.",
      },
    };
  }
}

export async function myCommentReportsList(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user?.id) {
      return unauthorized("Missing or invalid Authorization header.");
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const reportsTable = supabaseAdmin.from("place_comment_reports") as any;
    const { data: reportData, error: reportsError } = await reportsTable
      .select("id, comment_id, reason, details, status, created_at, updated_at, resolved_at")
      .eq("reported_by", user.id)
      .order("created_at", { ascending: false });

    if (reportsError) {
      context.error("Failed to fetch user comment reports:", reportsError);

      return {
        status: 500,
        jsonBody: {
          message: "Failed to fetch comment reports.",
        },
      };
    }

    const reports = (reportData || []) as CommentReportRow[];
    const commentIds = Array.from(new Set(reports.map((report) => report.comment_id).filter(Boolean)));
    const commentsById = new Map<string, Pick<PlaceCommentRow, "id" | "place_id" | "comment" | "status">>();
    const placesById = new Map<string, ReportPlaceRow>();

    if (commentIds.length > 0) {
      const { data: commentData, error: commentsError } = await (supabaseAdmin.from("place_comments") as any)
        .select("id, place_id, comment, status")
        .in("id", commentIds);

      if (commentsError) {
        context.error("Failed to fetch reported comments:", commentsError);
      } else {
        ((commentData || []) as Array<Pick<PlaceCommentRow, "id" | "place_id" | "comment" | "status">>).forEach((comment) => {
          commentsById.set(comment.id, comment);
        });
      }
    }

    const placeIds = Array.from(new Set(Array.from(commentsById.values()).map((comment) => comment.place_id).filter(Boolean)));

    if (placeIds.length > 0) {
      const { data: placeData, error: placesError } = await supabaseAdmin
        .from("places")
        .select("id, name, slug")
        .in("id", placeIds);

      if (placesError) {
        context.error("Failed to fetch places for comment reports:", placesError);
      } else {
        ((placeData || []) as ReportPlaceRow[]).forEach((place) => {
          placesById.set(place.id, place);
        });
      }
    }

    return {
      status: 200,
      jsonBody: {
        reports: reports.map((report) => {
          const comment = commentsById.get(report.comment_id) || null;
          const place = comment ? placesById.get(comment.place_id) || null : null;

          return {
            id: report.id,
            commentId: report.comment_id,
            reason: report.reason,
            details: report.details,
            status: report.status,
            createdAt: report.created_at,
            updatedAt: report.updated_at,
            resolvedAt: report.resolved_at,
            comment: comment
              ? {
                  text: getCommentPreview(comment.comment),
                  status: comment.status,
                }
              : null,
            place: place
              ? {
                  id: place.id,
                  name: place.name,
                  slug: place.slug,
                }
              : null,
          };
        }),
      },
    };
  } catch (error) {
    context.error("Unexpected error in GET /api/me/comment-reports:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Unexpected server error.",
      },
    };
  }
}

export async function myCommentModerationNoticesList(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user?.id) {
      return unauthorized("Missing or invalid Authorization header.");
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const commentsTable = supabaseAdmin.from("place_comments") as any;
    const { data: commentData, error: commentsError } = await commentsTable
      .select("id, place_id, comment, status")
      .eq("user_id", user.id);

    if (commentsError) {
      context.error("Failed to fetch owned comments for moderation notices:", commentsError);

      return {
        status: 500,
        jsonBody: {
          message: "Failed to fetch comment moderation notices.",
        },
      };
    }

    const comments = (commentData || []) as Array<Pick<PlaceCommentRow, "id" | "place_id" | "comment" | "status">>;

    if (comments.length === 0) {
      return {
        status: 200,
        jsonBody: {
          notices: [],
        },
      };
    }

    const commentIds = comments.map((comment) => comment.id);
    const reportsTable = supabaseAdmin.from("place_comment_reports") as any;
    const { data: reportData, error: reportsError } = await reportsTable
      .select("id, comment_id, status, created_at, resolved_at")
      .eq("status", "action_taken")
      .in("comment_id", commentIds)
      .order("resolved_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (reportsError) {
      context.error("Failed to fetch actioned comment reports for moderation notices:", reportsError);

      return {
        status: 500,
        jsonBody: {
          message: "Failed to fetch comment moderation notices.",
        },
      };
    }

    const commentsById = new Map(comments.map((comment) => [comment.id, comment]));
    const selectedReportsByCommentId = new Map<string, CommentModerationNoticeReportRow>();

    ((reportData || []) as CommentModerationNoticeReportRow[]).forEach((report) => {
      if (!selectedReportsByCommentId.has(report.comment_id)) {
        selectedReportsByCommentId.set(report.comment_id, report);
      }
    });

    const placeIds = Array.from(
      new Set(
        Array.from(selectedReportsByCommentId.keys())
          .map((commentId) => commentsById.get(commentId)?.place_id)
          .filter((placeId): placeId is string => Boolean(placeId))
      )
    );
    const placesById = new Map<string, ReportPlaceRow>();

    if (placeIds.length > 0) {
      const { data: placeData, error: placesError } = await supabaseAdmin
        .from("places")
        .select("id, name, slug")
        .in("id", placeIds);

      if (placesError) {
        context.error("Failed to fetch places for moderation notices:", placesError);
      } else {
        ((placeData || []) as ReportPlaceRow[]).forEach((place) => {
          placesById.set(place.id, place);
        });
      }
    }

    const notices = Array.from(selectedReportsByCommentId.values())
      .map((report) => {
        const comment = commentsById.get(report.comment_id);

        if (!comment) {
          return null;
        }

        const place = placesById.get(comment.place_id) || null;

        return {
          id: report.id,
          commentId: report.comment_id,
          status: "action_taken",
          message: "Your comment was removed after review.",
          createdAt: report.created_at,
          resolvedAt: report.resolved_at,
          comment: {
            text: getCommentPreview(comment.comment),
            status: "hidden",
          },
          place: place
            ? {
                id: place.id,
                name: place.name,
                slug: place.slug,
              }
            : null,
        };
      })
      .filter(Boolean);

    return {
      status: 200,
      jsonBody: {
        notices,
      },
    };
  } catch (error) {
    context.error("Unexpected error in GET /api/me/comment-moderation-notices:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Unexpected server error.",
      },
    };
  }
}

export async function adminCommentReportModerate(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user?.id) {
      return unauthorized("Missing or invalid Authorization header.");
    }

    if (!(await isAdminUser(user.id))) {
      return {
        status: 403,
        jsonBody: {
          message: "Admin access required.",
        },
      };
    }

    const reportId = request.params.reportId?.trim();

    if (!reportId || !isPlaceUuid(reportId)) {
      return badRequest("Report id must be a valid UUID.");
    }

    const { action, response: actionResponse } = await readCleanCommentReportModerationAction(request);

    if (actionResponse) {
      return actionResponse;
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const reportsTable = supabaseAdmin.from("place_comment_reports") as any;
    const { data: reportData, error: reportLookupError } = await reportsTable
      .select("id, comment_id, status")
      .eq("id", reportId)
      .maybeSingle();

    if (reportLookupError) {
      context.error("Failed to fetch comment report for moderation:", reportLookupError);

      return {
        status: 500,
        jsonBody: {
          message: "Failed to load comment report.",
        },
      };
    }

    const report = reportData as AdminCommentReportRow | null;

    if (!report) {
      return {
        status: 404,
        jsonBody: {
          message: "Comment report not found.",
        },
      };
    }

    const resolvedAt = new Date().toISOString();

    if (action === "dismiss") {
      const { data: updatedReportData, error: dismissError } = await reportsTable
        .update({
          status: "dismissed",
          resolved_by: user.id,
          resolved_at: resolvedAt,
          updated_at: resolvedAt,
        })
        .eq("id", report.id)
        .select("id, comment_id, status, resolved_at, updated_at")
        .single();

      if (dismissError) {
        context.error("Failed to dismiss comment report:", dismissError);

        return {
          status: 500,
          jsonBody: {
            message: "Failed to dismiss report.",
          },
        };
      }

      return {
        status: 200,
        jsonBody: {
          ok: true,
          message: "Report dismissed.",
          report: updatedReportData,
        },
      };
    }

    const commentsTable = supabaseAdmin.from("place_comments") as any;
    const { data: commentData, error: commentLookupError } = await commentsTable
      .select("id, status")
      .eq("id", report.comment_id)
      .maybeSingle();
    const existingComment = commentData as Pick<PlaceCommentRow, "id" | "status"> | null;

    if (commentLookupError) {
      context.error("Failed to fetch reported comment for moderation:", commentLookupError);

      return {
        status: 500,
        jsonBody: {
          message: "Failed to load reported comment.",
        },
      };
    }

    if (!existingComment) {
      return {
        status: 404,
        jsonBody: {
          message: "Reported comment not found.",
        },
      };
    }

    const { data: hiddenCommentData, error: hideCommentError } = await commentsTable
      .update({
        status: "hidden",
        updated_at: resolvedAt,
      })
      .eq("id", report.comment_id)
      .select("id, status, updated_at")
      .single();

    if (hideCommentError) {
      context.error("Failed to hide reported comment:", hideCommentError);

      return {
        status: 500,
        jsonBody: {
          message: "Failed to hide reported comment.",
        },
      };
    }

    const { data: updatedReportData, error: actionError } = await reportsTable
      .update({
        status: "action_taken",
        resolved_by: user.id,
        resolved_at: resolvedAt,
        updated_at: resolvedAt,
      })
      .eq("id", report.id)
      .select("id, comment_id, status, resolved_at, updated_at")
      .single();

    if (actionError) {
      context.error("Failed to mark comment report as action_taken:", actionError);

      const rollbackAt = new Date().toISOString();
      const { error: rollbackError } = await commentsTable
        .update({
          status: existingComment.status,
          updated_at: rollbackAt,
        })
        .eq("id", report.comment_id);

      if (rollbackError) {
        context.error("Failed to roll back hidden comment after report moderation failure:", rollbackError);
      }

      return {
        status: 500,
        jsonBody: {
          message: "Failed to take action on report.",
        },
      };
    }

    return {
      status: 200,
      jsonBody: {
        ok: true,
        message: "Action taken. Comment hidden.",
        report: updatedReportData,
        comment: hiddenCommentData,
      },
    };
  } catch (error) {
    context.error("Unexpected error in PATCH /api/admin/comment-reports/{reportId}:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Unexpected server error.",
      },
    };
  }
}

app.http("placeCommentsList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "places/{id}/comments",
  handler: placeCommentsList,
});

app.http("placeCommentsCreate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "places/{id}/comments",
  handler: placeCommentsCreate,
});

app.http("placeCommentRepliesCreate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "places/{id}/comments/{commentId}/replies",
  handler: placeCommentRepliesCreate,
});

app.http("placeCommentsUpdate", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "places/{id}/comments/{commentId}",
  handler: placeCommentsUpdate,
});

app.http("placeCommentsDelete", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "places/{id}/comments/{commentId}",
  handler: placeCommentsDelete,
});

app.http("placeCommentReportsCreate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "place-comments/{commentId}/report",
  handler: placeCommentReportsCreate,
});

app.http("myCommentReportsList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "me/comment-reports",
  handler: myCommentReportsList,
});

app.http("myCommentModerationNoticesList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "me/comment-moderation-notices",
  handler: myCommentModerationNoticesList,
});

app.http("adminCommentReportModerate", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "app-admin/comment-reports/{reportId}",
  handler: adminCommentReportModerate,
});
