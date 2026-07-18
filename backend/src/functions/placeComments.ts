import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { checkEndpointRateLimit } from "../utils/redisRateLimit";
import { getAuthenticatedUser, unauthorized, badRequest } from "../utils/auth";
import {
  getCommentId,
  readCleanBody,
  readCleanCreateComment,
  readCleanCommentReport,
  requireResolvedPlaceId,
  enrichCommentsWithDisplayNames,
  buildCommentTree,
  normalizeCommentForClient,
  getCommentPreview,
  type PlaceCommentRow,
  type PlaceComment,
  type CommentReportRow,
  type CommentModerationNoticeReportRow,
  type CommentAuthorProfileRow,
  COMMENT_COLUMNS,
  REPORT_REASONS,
  type ReportReason,
} from "./placeCommentHelpers";

export async function placeCommentsList(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const rateCheck = await checkEndpointRateLimit(request, "place-comments", 30, 60);
    if (!rateCheck.allowed && rateCheck.response) return rateCheck.response;

    const { placeId, response } = await requireResolvedPlaceId(request);
    if (response) return response;

    const supabaseAdmin = await getSupabaseAdminClient();
    const commentsTable = supabaseAdmin.from("place_comments") as any;
    const { data, error } = await commentsTable
      .select(COMMENT_COLUMNS)
      .eq("place_id", placeId)
      .eq("status", "visible")
      .limit(100);

    if (error) {
      context.error("Failed to fetch place comments:", error);
      return { status: 500, jsonBody: { message: "Failed to fetch place comments." } };
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
        ...normalizeCommentForClient(comment),
        current_user_reported: reportedCommentIds.has(comment.id),
      }))
    );

    return {
      status: 200,
      jsonBody: { comments: buildCommentTree(comments) },
    };
  } catch (error) {
    context.error("Unexpected error in GET /api/places/{id}/comments:", error);
    return { status: 500, jsonBody: { message: "Unexpected server error." } };
  }
}

export async function placeCommentsCreate(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const rateCheck = await checkEndpointRateLimit(request, "comments-create", 10, 60);
    if (!rateCheck.allowed && rateCheck.response) return rateCheck.response;

    const placeIdentifier = request.params.id?.trim();
    if (!placeIdentifier) return badRequest("placeId is required.");

    const user = await getAuthenticatedUser(request);
    if (!user?.id) return unauthorized("Missing or invalid Authorization header.");

    const { placeId, comment, response: cleanResponse } = await readCleanCreateComment(request, placeIdentifier);
    if (cleanResponse) return cleanResponse;

    const supabaseAdmin = await getSupabaseAdminClient();
    const commentsTable = supabaseAdmin.from("place_comments") as any;
    const { data: createdComment, error: createError } = await commentsTable
      .insert({
        place_id: placeId,
        user_id: user.id,
        comment,
        parent_comment_id: null,
        status: "visible",
      })
      .select(COMMENT_COLUMNS)
      .single();

    if (createError) {
      context.error("Failed to create place comment:", createError);
      return { status: 500, jsonBody: { message: "Failed to create comment." } };
    }

    const enriched = await enrichCommentsWithDisplayNames([createdComment as PlaceCommentRow]);
    return {
      status: 201,
      jsonBody: { comment: { ...enriched[0], replies: [] } },
    };
  } catch (error) {
    context.error("Unexpected error in POST /api/places/{id}/comments:", error);
    return { status: 500, jsonBody: { message: "Unexpected server error." } };
  }
}

export async function placeCommentRepliesCreate(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const rateCheck = await checkEndpointRateLimit(request, "comment-replies-create", 10, 60);
    if (!rateCheck.allowed && rateCheck.response) return rateCheck.response;

    const placeIdentifier = request.params.id?.trim();
    if (!placeIdentifier) return badRequest("placeId is required.");

    const parentCommentId = getCommentId(request);
    if (!parentCommentId) return badRequest("commentId is required.");

    const user = await getAuthenticatedUser(request);
    if (!user?.id) return unauthorized("Missing or invalid Authorization header.");

    const { placeId, comment, response: cleanResponse } = await readCleanCreateComment(request, placeIdentifier);
    if (cleanResponse) return cleanResponse;

    const supabaseAdmin = await getSupabaseAdminClient();
    const commentsTable = supabaseAdmin.from("place_comments") as any;

    const { data: parentComment, error: parentError } = await commentsTable
      .select("id, place_id, parent_comment_id, status")
      .eq("id", parentCommentId)
      .maybeSingle();

    if (parentError) {
      context.error("Failed to find parent comment:", parentError);
      return { status: 500, jsonBody: { message: "Failed to find parent comment." } };
    }

    if (!parentComment) return badRequest("Parent comment not found.");

    if (parentComment.place_id !== placeId) {
      return badRequest("Parent comment does not belong to this place.");
    }

    if (parentComment.parent_comment_id) {
      return badRequest("Cannot reply to a reply.");
    }

    if (parentComment.status !== "visible") {
      return badRequest("Cannot reply to a deleted or hidden comment.");
    }

    const { data: createdReply, error: createError } = await commentsTable
      .insert({
        place_id: placeId,
        user_id: user.id,
        comment,
        parent_comment_id: parentCommentId,
        status: "visible",
      })
      .select(COMMENT_COLUMNS)
      .single();

    if (createError) {
      context.error("Failed to create comment reply:", createError);
      return { status: 500, jsonBody: { message: "Failed to create reply." } };
    }

    const enriched = await enrichCommentsWithDisplayNames([createdReply as PlaceCommentRow]);
    return {
      status: 201,
      jsonBody: { comment: { ...enriched[0], replies: [] } },
    };
  } catch (error) {
    context.error("Unexpected error in POST /api/places/{id}/comments/{commentId}/replies:", error);
    return { status: 500, jsonBody: { message: "Unexpected server error." } };
  }
}

export async function placeCommentsUpdate(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user?.id) return unauthorized("Missing or invalid Authorization header.");

    const commentId = getCommentId(request);
    if (!commentId) return badRequest("commentId is required.");

    const { body, response: cleanResponse } = await readCleanBody(request);
    if (cleanResponse) return cleanResponse;

    const supabaseAdmin = await getSupabaseAdminClient();
    const commentsTable = supabaseAdmin.from("place_comments") as any;

    const { data: existingComment, error: lookupError } = await commentsTable
      .select("id, user_id, status, deleted_at, comment, created_at, updated_at")
      .eq("id", commentId)
      .maybeSingle();

    if (lookupError) {
      context.error("Failed to find place comment for update:", lookupError);
      return { status: 500, jsonBody: { message: "Failed to find comment." } };
    }

    if (!existingComment) return badRequest("Comment not found.");

    if (existingComment.user_id !== user.id) return unauthorized("You can only edit your own comments.");

    if (existingComment.deleted_at || existingComment.status === "deleted") {
      return badRequest("Cannot edit a deleted comment.");
    }

    if (existingComment.status === "hidden") {
      return badRequest("Cannot edit a hidden comment.");
    }

    const { data: updatedComment, error: updateError } = await commentsTable
      .update({ comment: body, updated_at: new Date().toISOString() })
      .eq("id", commentId)
      .select(COMMENT_COLUMNS)
      .single();

    if (updateError) {
      context.error("Failed to update place comment:", updateError);
      return { status: 500, jsonBody: { message: "Failed to update comment." } };
    }

    const enriched = await enrichCommentsWithDisplayNames([updatedComment as PlaceCommentRow]);
    return {
      status: 200,
      jsonBody: { comment: normalizedCommentForClientWithReplies(enriched[0]) },
    };
  } catch (error) {
    context.error("Unexpected error in PATCH /api/places/{id}/comments/{commentId}:", error);
    return { status: 500, jsonBody: { message: "Unexpected server error." } };
  }
}

type PlaceCommentWithOptionalReplies = PlaceCommentRow & {
  member_display_name?: string | null;
  member_username?: string | null;
  member_avatar_url?: string | null;
  current_user_reported?: boolean;
  replies?: PlaceComment[];
};

function normalizedCommentForClientWithReplies(comment: PlaceCommentWithOptionalReplies): PlaceComment {
  const normalizedComment = normalizeCommentForClient(comment);
  return {
    ...normalizedComment,
    replies: (comment.replies || []).map(normalizedCommentForClientWithReplies),
  };
}

export async function placeCommentsDelete(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user?.id) return unauthorized("Missing or invalid Authorization header.");

    const commentId = getCommentId(request);
    if (!commentId) return badRequest("commentId is required.");

    const supabaseAdmin = await getSupabaseAdminClient();
    const commentsTable = supabaseAdmin.from("place_comments") as any;

    const { data: existingComment, error: lookupError } = await commentsTable
      .select("id, user_id, status, deleted_at")
      .eq("id", commentId)
      .maybeSingle();

    if (lookupError) {
      context.error("Failed to find place comment for delete:", lookupError);
      return { status: 500, jsonBody: { message: "Failed to find comment." } };
    }

    if (!existingComment) return badRequest("Comment not found.");

    if (existingComment.user_id !== user.id) return unauthorized("You can only delete your own comments.");

    if (existingComment.deleted_at || existingComment.status === "deleted") {
      return badRequest("Comment is already deleted.");
    }

    const now = new Date().toISOString();
    const { error: deleteError } = await commentsTable
      .update({ deleted_at: now, updated_at: now })
      .eq("id", commentId);

    if (deleteError) {
      context.error("Failed to delete place comment:", deleteError);
      return { status: 500, jsonBody: { message: "Failed to delete comment." } };
    }

    return { status: 200, jsonBody: { message: "Comment deleted." } };
  } catch (error) {
    context.error("Unexpected error in DELETE /api/places/{id}/comments/{commentId}:", error);
    return { status: 500, jsonBody: { message: "Unexpected server error." } };
  }
}

export async function placeCommentReportsCreate(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const rateCheck = await checkEndpointRateLimit(request, "comment-reports-create", 5, 60);
    if (!rateCheck.allowed && rateCheck.response) return rateCheck.response;

    const user = await getAuthenticatedUser(request);
    if (!user?.id) return unauthorized("Missing or invalid Authorization header.");

    const commentId = request.params.commentId?.trim();
    if (!commentId) return badRequest("commentId is required.");

    const { reason, details, response: cleanResponse } = await readCleanCommentReport(request);
    if (cleanResponse) return cleanResponse;

    const supabaseAdmin = await getSupabaseAdminClient();
    const reportsTable = supabaseAdmin.from("place_comment_reports") as any;
    const commentsTable = supabaseAdmin.from("place_comments") as any;

    const { data: targetComment, error: commentError } = await commentsTable
      .select("id, status")
      .eq("id", commentId)
      .maybeSingle();

    if (commentError) {
      context.error("Failed to find comment for report:", commentError);
      return { status: 500, jsonBody: { message: "Failed to find comment." } };
    }

    if (!targetComment) return badRequest("Comment not found.");

    if (targetComment.status !== "visible") {
      return badRequest("Cannot report a deleted or hidden comment.");
    }

    const { data: existingReport, error: existingError } = await reportsTable
      .select("id")
      .eq("comment_id", commentId)
      .eq("reported_by", user.id)
      .maybeSingle();

    if (existingError) {
      context.error("Failed to check existing report:", existingError);
      return { status: 500, jsonBody: { message: "Failed to check existing report." } };
    }

    if (existingReport) {
      return { status: 409, jsonBody: { message: "You have already reported this comment." } };
    }

    const { data: newReport, error: createError } = await reportsTable
      .insert({
        comment_id: commentId,
        reported_by: user.id,
        reason,
        details,
        status: "pending",
      })
      .select("id, comment_id, reason, details, status, created_at")
      .single();

    if (createError) {
      context.error("Failed to create comment report:", createError);
      return { status: 500, jsonBody: { message: "Failed to submit report." } };
    }

    return { status: 201, jsonBody: { report: newReport } };
  } catch (error) {
    context.error("Unexpected error in POST /api/place-comments/{commentId}/report:", error);
    return { status: 500, jsonBody: { message: "Unexpected server error." } };
  }
}

export async function myCommentReportsList(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user?.id) return unauthorized("Missing or invalid Authorization header.");

    const supabaseAdmin = await getSupabaseAdminClient();
    const reportsTable = supabaseAdmin.from("place_comment_reports") as any;

    const { data, error } = await reportsTable
      .select("id, comment_id, reason, details, status, created_at, updated_at, resolved_at")
      .eq("reported_by", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      context.error("Failed to fetch my comment reports:", error);
      return { status: 500, jsonBody: { message: "Failed to load reports." } };
    }

    return {
      status: 200,
      jsonBody: { reports: data || [] },
    };
  } catch (error) {
    context.error("Unexpected error in GET /api/me/comment-reports:", error);
    return { status: 500, jsonBody: { message: "Unexpected server error." } };
  }
}

export async function myCommentModerationNoticesList(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user?.id) return unauthorized("Missing or invalid Authorization header.");

    const supabaseAdmin = await getSupabaseAdminClient();
    const commentsTable = supabaseAdmin.from("place_comments") as any;

    const { data: myComments, error: myCommentsError } = await commentsTable
      .select("id")
      .eq("user_id", user.id);

    if (myCommentsError) {
      context.error("Failed to fetch user comments for moderation notices:", myCommentsError);
      return { status: 500, jsonBody: { message: "Failed to load moderation notices." } };
    }

    const myCommentRecords = (myComments || []) as Array<{ id: string }>;
    const myCommentIds = myCommentRecords.map((c) => c.id);

    if (myCommentIds.length === 0) {
      return { status: 200, jsonBody: { reports: [] } };
    }

    const reportsTable = supabaseAdmin.from("place_comment_reports") as any;
    const { data, error } = await reportsTable
      .select("id, comment_id, status, created_at, resolved_at")
      .eq("status", "action_taken")
      .in("comment_id", myCommentIds)
      .order("created_at", { ascending: false });

    if (error) {
      context.error("Failed to fetch moderation notices:", error);
      return { status: 500, jsonBody: { message: "Failed to load moderation notices." } };
    }

    return {
      status: 200,
      jsonBody: { reports: (data || []) as CommentModerationNoticeReportRow[] },
    };
  } catch (error) {
    context.error("Unexpected error in GET /api/me/comment-moderation-notices:", error);
    return { status: 500, jsonBody: { message: "Unexpected server error." } };
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
