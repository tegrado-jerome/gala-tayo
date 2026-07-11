import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSupabaseAdminClient } from "../../config/supabaseAdmin";
import { requireAdminAal2 } from "../../utils/adminAuth";
import { isPlaceUuid } from "../../utils/placeIdentity";
import {
  badRequest,
  readCleanCommentReportModerationAction,
  getCommentPreview,
  type PlaceCommentRow,
  type CommentReportRow,
  type ReportPlaceRow,
  type CommentAuthorProfileRow,
  type AdminCommentReportRow,
} from "../placeCommentHelpers";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

export async function adminCommentReportModerate(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const admin = await requireAdminAal2(request);
    if (admin.response || !admin.user?.id) return admin.response as HttpResponseInit;

    const reportId = request.params.reportId?.trim();
    if (!reportId || !isUuid(reportId)) {
      return badRequest("Report id must be a valid UUID.");
    }

    const { action, response: actionResponse } = await readCleanCommentReportModerationAction(request);
    if (actionResponse) return actionResponse;

    const supabaseAdmin = await getSupabaseAdminClient();
    const reportsTable = supabaseAdmin.from("place_comment_reports") as any;
    const { data: reportData, error: reportLookupError } = await reportsTable
      .select("id, comment_id, status")
      .eq("id", reportId)
      .maybeSingle();

    if (reportLookupError) {
      context.error("Failed to fetch comment report for moderation:", reportLookupError);
      return { status: 500, jsonBody: { message: "Failed to load comment report." } };
    }

    const report = reportData as AdminCommentReportRow | null;
    if (!report) {
      return { status: 404, jsonBody: { message: "Comment report not found." } };
    }

    const resolvedAt = new Date().toISOString();

    if (action === "dismiss") {
      const { data: updatedReportData, error: dismissError } = await reportsTable
        .update({ status: "dismissed", resolved_by: admin.user.id, resolved_at: resolvedAt, updated_at: resolvedAt })
        .eq("id", report.id)
        .select("id, comment_id, status, resolved_at, updated_at")
        .single();

      if (dismissError) {
        context.error("Failed to dismiss comment report:", dismissError);
        return { status: 500, jsonBody: { message: "Failed to dismiss report." } };
      }

      return { status: 200, jsonBody: { ok: true, message: "Report dismissed.", report: updatedReportData } };
    }

    const commentsTable = supabaseAdmin.from("place_comments") as any;
    const { data: commentData, error: commentLookupError } = await commentsTable
      .select("id, status")
      .eq("id", report.comment_id)
      .maybeSingle();

    const existingComment = commentData as Pick<PlaceCommentRow, "id" | "status"> | null;

    if (commentLookupError) {
      context.error("Failed to fetch reported comment for moderation:", commentLookupError);
      return { status: 500, jsonBody: { message: "Failed to load reported comment." } };
    }

    if (!existingComment) {
      return { status: 404, jsonBody: { message: "Reported comment not found." } };
    }

    const { data: hiddenCommentData, error: hideCommentError } = await commentsTable
      .update({ status: "hidden", updated_at: resolvedAt })
      .eq("id", report.comment_id)
      .select("id, status, updated_at")
      .single();

    if (hideCommentError) {
      context.error("Failed to hide reported comment:", hideCommentError);
      return { status: 500, jsonBody: { message: "Failed to hide reported comment." } };
    }

    const { data: updatedReportData, error: actionError } = await reportsTable
      .update({ status: "action_taken", resolved_by: admin.user.id, resolved_at: resolvedAt, updated_at: resolvedAt })
      .eq("id", report.id)
      .select("id, comment_id, status, resolved_at, updated_at")
      .single();

    if (actionError) {
      context.error("Failed to mark comment report as action_taken:", actionError);
      const rollbackAt = new Date().toISOString();
      const { error: rollbackError } = await commentsTable
        .update({ status: existingComment.status, updated_at: rollbackAt })
        .eq("id", report.comment_id);

      if (rollbackError) {
        context.error("Failed to roll back hidden comment after report moderation failure:", rollbackError);
      }

      return { status: 500, jsonBody: { message: "Failed to take action on report." } };
    }

    return {
      status: 200,
      jsonBody: { ok: true, message: "Action taken. Comment hidden.", report: updatedReportData, comment: hiddenCommentData },
    };
  } catch (error) {
    context.error("Unexpected error in PATCH /api/admin/comment-reports/{reportId}:", error);
    return { status: 500, jsonBody: { message: "Unexpected server error." } };
  }
}

export async function adminCommentReportsList(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const admin = await requireAdminAal2(request);
    if (admin.response || !admin.user?.id) return admin.response as HttpResponseInit;

    const statusQuery = request.query.get("status")?.trim() || "";
    if (statusQuery && !["pending", "dismissed", "action_taken"].includes(statusQuery)) {
      return badRequest("status is not supported.");
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const reportsTable = supabaseAdmin.from("place_comment_reports") as any;
    let query = reportsTable
      .select("id, comment_id, reported_by, reason, details, status, resolved_by, resolved_at, created_at, updated_at")
      .order("created_at", { ascending: true });

    if (statusQuery) query = query.eq("status", statusQuery);

    const { data: reportData, error: reportsError } = await query;
    if (reportsError) {
      context.error("Failed to fetch admin comment reports:", reportsError);
      return { status: 500, jsonBody: { message: "Failed to load comment reports." } };
    }

    const reports = (reportData || []) as Array<CommentReportRow & { reported_by: string; resolved_by: string | null }>;
    const commentIds = Array.from(new Set(reports.map((report) => report.comment_id).filter(Boolean)));
    const reporterIds = Array.from(new Set(reports.map((report) => report.reported_by).filter(Boolean)));
    const resolvedByIds = Array.from(new Set(reports.map((report) => report.resolved_by).filter((value): value is string => Boolean(value))));
    const userIds = Array.from(new Set([...reporterIds, ...resolvedByIds]));
    const commentsById = new Map<string, Pick<PlaceCommentRow, "id" | "place_id" | "comment" | "status" | "user_id">>();
    const placesById = new Map<string, ReportPlaceRow>();
    const profilesByUserId = new Map<string, CommentAuthorProfileRow>();
    const usersById = new Map<string, { id: string; email: string | null }>();

    if (commentIds.length > 0) {
      const { data: commentData, error: commentsError } = await (supabaseAdmin.from("place_comments") as any)
        .select("id, place_id, comment, status, user_id")
        .in("id", commentIds);

      if (commentsError) {
        context.error("Failed to fetch reported comments for admin:", commentsError);
      } else {
        ((commentData || []) as Array<Pick<PlaceCommentRow, "id" | "place_id" | "comment" | "status" | "user_id">>).forEach((comment) => {
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
        context.error("Failed to fetch places for admin comment reports:", placesError);
      } else {
        ((placeData || []) as ReportPlaceRow[]).forEach((place) => {
          placesById.set(place.id, place);
        });
      }
    }

    if (userIds.length > 0) {
      const [{ data: profileData, error: profileError }, { data: userData, error: userError }] = await Promise.all([
        (supabaseAdmin.from("profiles") as any).select("user_id, username, display_name, avatar_url, provider_avatar_url").in("user_id", userIds),
        (supabaseAdmin.from("users") as any).select("id, email").in("id", userIds),
      ]);

      if (profileError) {
        context.error("Failed to fetch profiles for admin comment reports:", profileError);
      } else {
        ((profileData || []) as CommentAuthorProfileRow[]).forEach((profile) => {
          profilesByUserId.set(profile.user_id, profile);
        });
      }

      if (userError) {
        context.error("Failed to fetch users for admin comment reports:", userError);
      } else {
        ((userData || []) as { id: string; email: string | null }[]).forEach((user) => {
          usersById.set(user.id, user);
        });
      }
    }

    return {
      status: 200,
      jsonBody: {
        reports: reports.map((report) => {
          const comment = commentsById.get(report.comment_id) || null;
          const place = comment ? placesById.get(comment.place_id) || null : null;
          const reporterProfile = profilesByUserId.get(report.reported_by);
          const reporterUser = usersById.get(report.reported_by);
          const commentAuthorProfile = comment ? profilesByUserId.get(comment.user_id) : null;
          const commentAuthorUser = comment ? usersById.get(comment.user_id) : null;
          const resolvedByProfile = report.resolved_by ? profilesByUserId.get(report.resolved_by) : null;

          return {
            id: report.id,
            commentId: report.comment_id,
            reportedBy: report.reported_by,
            reason: report.reason,
            details: report.details,
            status: report.status,
            resolvedBy: report.resolved_by,
            resolvedAt: report.resolved_at,
            createdAt: report.created_at,
            updatedAt: report.updated_at,
            comment: comment
              ? {
                  text: getCommentPreview(comment.comment),
                  status: comment.status,
                  author: {
                    id: comment.user_id,
                    username: commentAuthorProfile?.username ?? commentAuthorProfile?.display_name ?? null,
                    email: commentAuthorUser?.email ?? null,
                    avatarUrl: commentAuthorProfile?.avatar_url ?? commentAuthorProfile?.provider_avatar_url ?? null,
                  },
                }
              : null,
            place: place
              ? { id: place.id, name: place.name, slug: place.slug }
              : null,
            reporter: {
              id: report.reported_by,
              username: reporterProfile?.username ?? reporterProfile?.display_name ?? null,
              email: reporterUser?.email ?? null,
              avatarUrl: reporterProfile?.avatar_url ?? reporterProfile?.provider_avatar_url ?? null,
            },
            resolver: report.resolved_by
              ? { id: report.resolved_by, username: resolvedByProfile?.username ?? resolvedByProfile?.display_name ?? null }
              : null,
          };
        }),
      },
    };
  } catch (error) {
    context.error("Unexpected error in GET /api/app-admin/comment-reports:", error);
    return { status: 500, jsonBody: { message: "Unexpected server error." } };
  }
}

app.http("adminCommentReportsList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "app-admin/comment-reports",
  handler: adminCommentReportsList,
});

app.http("adminCommentReportModerate", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "app-admin/comment-reports/{reportId}",
  handler: adminCommentReportModerate,
});
