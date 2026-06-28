import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { AuthenticatedUser, validateJwt } from "../utils/auth";
import { isPlaceUuid } from "../utils/placeIdentity";

type UserReportReason =
  | "fake_account"
  | "harassment"
  | "inappropriate_profile"
  | "spam"
  | "impersonation"
  | "other";

type UserReportStatus = "pending" | "dismissed" | "action_taken";

type SubmitUserReportBody = {
  reason?: unknown;
  details?: unknown;
  status?: unknown;
  resolved_by?: unknown;
  resolved_at?: unknown;
  moderator_note?: unknown;
  resolvedBy?: unknown;
  resolvedAt?: unknown;
  moderatorNote?: unknown;
  reporter_user_id?: unknown;
  reporterUserId?: unknown;
};

type UpdateUserReportBody = {
  status?: unknown;
  moderator_note?: unknown;
  moderatorNote?: unknown;
};

type UserRoleRow = {
  role: string | null;
};

type UserRow = {
  id: string;
  email: string | null;
};

type ProfileRow = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  provider_avatar_url: string | null;
};

type UserReportRow = {
  id: string;
  reported_user_id: string;
  reporter_user_id: string;
  reason: UserReportReason;
  details: string | null;
  status: UserReportStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  moderator_note: string | null;
  created_at: string;
};

const USER_REPORT_REASONS = [
  "fake_account",
  "harassment",
  "inappropriate_profile",
  "spam",
  "impersonation",
  "other",
] as const;
const USER_REPORT_STATUSES = ["pending", "dismissed", "action_taken"] as const;
const REPORT_DETAILS_MAX_LENGTH = 500;
const MODERATOR_NOTE_MAX_LENGTH = 1000;

function unauthorized(message: string): HttpResponseInit {
  return {
    status: 401,
    jsonBody: { message },
  };
}

function forbidden(message: string): HttpResponseInit {
  return {
    status: 403,
    jsonBody: { message },
  };
}

function badRequest(message: string): HttpResponseInit {
  return {
    status: 400,
    jsonBody: { message },
  };
}

async function getAuthenticatedUser(request: HttpRequest): Promise<AuthenticatedUser | null> {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
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
  const { data, error } = await supabaseAdmin.from("users").select("role").eq("id", userId).maybeSingle();

  if (error) {
    return false;
  }

  return ((data as UserRoleRow | null)?.role || "").toLowerCase() === "admin";
}

async function requireAdmin(request: HttpRequest): Promise<{ user?: AuthenticatedUser; response?: HttpResponseInit }> {
  const user = await getAuthenticatedUser(request);

  if (!user?.id) {
    return { response: unauthorized("Missing or invalid Authorization header.") };
  }

  if (!(await isAdminUser(user.id))) {
    return { response: forbidden("Admin access required.") };
  }

  return { user };
}

async function readCleanUserReport(
  request: HttpRequest
): Promise<{ reason?: UserReportReason; details?: string | null; response?: HttpResponseInit }> {
  let payload: SubmitUserReportBody;

  try {
    payload = (await request.json()) as SubmitUserReportBody;
  } catch {
    return { response: badRequest("Invalid JSON body.") };
  }

  if (
    payload.status !== undefined ||
    payload.resolved_by !== undefined ||
    payload.resolved_at !== undefined ||
    payload.moderator_note !== undefined ||
    payload.resolvedBy !== undefined ||
    payload.resolvedAt !== undefined ||
    payload.moderatorNote !== undefined ||
    payload.reporter_user_id !== undefined ||
    payload.reporterUserId !== undefined
  ) {
    return { response: badRequest("Admin-managed fields are not allowed.") };
  }

  if (typeof payload.reason !== "string") {
    return { response: badRequest("reason is required.") };
  }

  const reason = payload.reason.trim();

  if (!USER_REPORT_REASONS.includes(reason as UserReportReason)) {
    return { response: badRequest("reason is not supported.") };
  }

  if (payload.details !== undefined && payload.details !== null && typeof payload.details !== "string") {
    return { response: badRequest("details must be a string.") };
  }

  const details = typeof payload.details === "string" ? payload.details.trim() : "";

  if (details.length > REPORT_DETAILS_MAX_LENGTH) {
    return { response: badRequest(`details must be ${REPORT_DETAILS_MAX_LENGTH} characters or less.`) };
  }

  return {
    reason: reason as UserReportReason,
    details: details || null,
  };
}

async function readCleanUserReportUpdate(
  request: HttpRequest
): Promise<{
  status?: UserReportStatus;
  moderatorNote?: string | null;
  moderatorNoteProvided?: boolean;
  response?: HttpResponseInit;
}> {
  let payload: UpdateUserReportBody;

  try {
    payload = (await request.json()) as UpdateUserReportBody;
  } catch {
    return { response: badRequest("Invalid JSON body.") };
  }

  if (typeof payload.status !== "string") {
    return { response: badRequest("status must be a string.") };
  }

  const status = payload.status.trim();

  if (!USER_REPORT_STATUSES.includes(status as UserReportStatus)) {
    return { response: badRequest("status is not supported.") };
  }

  const moderatorNoteValue = payload.moderator_note ?? payload.moderatorNote;
  const moderatorNoteProvided = payload.moderator_note !== undefined || payload.moderatorNote !== undefined;

  if (moderatorNoteProvided && moderatorNoteValue !== null && typeof moderatorNoteValue !== "string") {
    return { response: badRequest("moderator_note must be a string or null.") };
  }

  const moderatorNote = typeof moderatorNoteValue === "string" ? moderatorNoteValue.trim() : null;

  if ((moderatorNote || "").length > MODERATOR_NOTE_MAX_LENGTH) {
    return { response: badRequest(`moderator_note must be ${MODERATOR_NOTE_MAX_LENGTH} characters or less.`) };
  }

  return {
    status: status as UserReportStatus,
    moderatorNote: moderatorNote || null,
    moderatorNoteProvided,
  };
}

async function getUserById(userId: string): Promise<UserRow | null> {
  const supabaseAdmin = await getSupabaseAdminClient();
  const { data, error } = await (supabaseAdmin.from("users") as any).select("id, email").eq("id", userId).maybeSingle();

  if (error) {
    throw error;
  }

  return data as UserRow | null;
}

export async function userReportsCreate(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user?.id) {
      return unauthorized("Missing or invalid Authorization header.");
    }

    const reportedUserId = request.params.userId?.trim();

    if (!reportedUserId || !isPlaceUuid(reportedUserId)) {
      return badRequest("User id must be a valid UUID.");
    }

    if (reportedUserId === user.id) {
      return badRequest("You cannot report yourself.");
    }

    const { reason, details, response } = await readCleanUserReport(request);

    if (response) {
      return response;
    }

    const reportedUser = await getUserById(reportedUserId);

    if (!reportedUser) {
      return {
        status: 404,
        jsonBody: {
          success: false,
          message: "User not found.",
        },
      };
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const reportsTable = supabaseAdmin.from("user_reports") as any;
    const { error } = await reportsTable
      .insert({
        reported_user_id: reportedUserId,
        reporter_user_id: user.id,
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
            success: false,
            message: "You already reported this user.",
          },
        };
      }

      context.error("Failed to create user report:", error);
      return {
        status: 500,
        jsonBody: {
          success: false,
          message: "Failed to submit user report.",
        },
      };
    }

    return {
      status: 201,
      jsonBody: {
        success: true,
        message: "Report submitted. Thanks for helping keep GalaTayo safe.",
      },
    };
  } catch (error) {
    context.error("Unexpected error in POST /api/users/{userId}/report:", error);
    return {
      status: 500,
      jsonBody: {
        success: false,
        message: "Unexpected server error.",
      },
    };
  }
}

export async function myUserReportsList(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user?.id) {
      return unauthorized("Missing or invalid Authorization header.");
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const { data, error } = await (supabaseAdmin.from("user_reports") as any)
      .select("id, reported_user_id, reason, status, created_at")
      .eq("reporter_user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      context.error("Failed to fetch current user reports:", error);
      return {
        status: 500,
        jsonBody: {
          message: "Failed to fetch user reports.",
        },
      };
    }

    return {
      status: 200,
      jsonBody: {
        reports: (data || []).map((report: any) => ({
          id: report.id,
          reported_user_id: report.reported_user_id,
          reason: report.reason,
          status: report.status,
          created_at: report.created_at,
        })),
      },
    };
  } catch (error) {
    context.error("Unexpected error in GET /api/me/user-reports:", error);
    return {
      status: 500,
      jsonBody: {
        message: "Unexpected server error.",
      },
    };
  }
}

export async function adminUserReportsList(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const admin = await requireAdmin(request);

    if (admin.response) {
      return admin.response;
    }

    const statusQuery = request.query.get("status")?.trim() || "pending";

    if (statusQuery !== "all" && !USER_REPORT_STATUSES.includes(statusQuery as UserReportStatus)) {
      return badRequest("status is not supported.");
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    let query = (supabaseAdmin.from("user_reports") as any)
      .select("id, reported_user_id, reporter_user_id, reason, details, status, resolved_by, resolved_at, moderator_note, created_at")
      .order("created_at", { ascending: true });

    if (statusQuery !== "all") {
      query = query.eq("status", statusQuery);
    }

    const { data: reportData, error: reportsError } = await query;

    if (reportsError) {
      context.error("Failed to fetch admin user reports:", reportsError);
      return {
        status: 500,
        jsonBody: {
          message: "Failed to load user reports.",
        },
      };
    }

    const reports = (reportData || []) as UserReportRow[];
    const userIds = Array.from(
      new Set(
        reports.flatMap((report) => [report.reported_user_id, report.reporter_user_id, report.resolved_by]).filter((value): value is string => Boolean(value))
      )
    );
    const profilesByUserId = new Map<string, ProfileRow>();
    const usersById = new Map<string, UserRow>();

    if (userIds.length > 0) {
      const [{ data: profileData, error: profileError }, { data: userData, error: userError }] = await Promise.all([
        (supabaseAdmin.from("profiles") as any)
          .select("user_id, username, display_name, avatar_url, provider_avatar_url")
          .in("user_id", userIds),
        (supabaseAdmin.from("users") as any).select("id, email").in("id", userIds),
      ]);

      if (profileError) {
        context.error("Failed to fetch profiles for admin user reports:", profileError);
      } else {
        ((profileData || []) as ProfileRow[]).forEach((profile) => {
          profilesByUserId.set(profile.user_id, profile);
        });
      }

      if (userError) {
        context.error("Failed to fetch users for admin user reports:", userError);
      } else {
        ((userData || []) as UserRow[]).forEach((row) => {
          usersById.set(row.id, row);
        });
      }
    }

    return {
      status: 200,
      jsonBody: {
        reports: reports.map((report) => {
          const reportedProfile = profilesByUserId.get(report.reported_user_id) || null;
          const reportedUser = usersById.get(report.reported_user_id) || null;
          const reporterProfile = profilesByUserId.get(report.reporter_user_id) || null;
          const reporterUser = usersById.get(report.reporter_user_id) || null;
          const resolverProfile = report.resolved_by ? profilesByUserId.get(report.resolved_by) || null : null;
          const resolverUser = report.resolved_by ? usersById.get(report.resolved_by) || null : null;

          return {
            id: report.id,
            reportedUserId: report.reported_user_id,
            reporterUserId: report.reporter_user_id,
            reason: report.reason,
            details: report.details,
            status: report.status,
            createdAt: report.created_at,
            resolvedBy: report.resolved_by,
            resolvedAt: report.resolved_at,
            moderatorNote: report.moderator_note,
            reportedUser: {
              id: report.reported_user_id,
              email: reportedUser?.email ?? null,
              username: reportedProfile?.username ?? null,
              displayName: reportedProfile?.display_name ?? null,
              avatarUrl: reportedProfile?.avatar_url ?? reportedProfile?.provider_avatar_url ?? null,
            },
            reporter: {
              id: report.reporter_user_id,
              email: reporterUser?.email ?? null,
              username: reporterProfile?.username ?? null,
              displayName: reporterProfile?.display_name ?? null,
              avatarUrl: reporterProfile?.avatar_url ?? reporterProfile?.provider_avatar_url ?? null,
            },
            resolver: report.resolved_by
              ? {
                  id: report.resolved_by,
                  email: resolverUser?.email ?? null,
                  username: resolverProfile?.username ?? null,
                  displayName: resolverProfile?.display_name ?? null,
                  avatarUrl: resolverProfile?.avatar_url ?? resolverProfile?.provider_avatar_url ?? null,
                }
              : null,
          };
        }),
      },
    };
  } catch (error) {
    context.error("Unexpected error in GET /api/app-admin/user-reports:", error);
    return {
      status: 500,
      jsonBody: {
        message: "Unexpected server error.",
      },
    };
  }
}

export async function adminUserReportUpdate(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const admin = await requireAdmin(request);

    if (admin.response) {
      return admin.response;
    }

    const reportId = request.params.reportId?.trim();

    if (!reportId || !isPlaceUuid(reportId)) {
      return badRequest("Report id must be a valid UUID.");
    }

    const { status, moderatorNote, moderatorNoteProvided, response } = await readCleanUserReportUpdate(request);

    if (response) {
      return response;
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const reportsTable = supabaseAdmin.from("user_reports") as any;
    const { data: reportData, error: reportLookupError } = await reportsTable
      .select("id, reported_user_id, reporter_user_id, reason, details, status, resolved_by, resolved_at, moderator_note, created_at")
      .eq("id", reportId)
      .maybeSingle();

    if (reportLookupError) {
      context.error("Failed to fetch user report for moderation:", reportLookupError);
      return {
        status: 500,
        jsonBody: {
          message: "Failed to load user report.",
        },
      };
    }

    const report = reportData as UserReportRow | null;

    if (!report) {
      return {
        status: 404,
        jsonBody: {
          message: "User report not found.",
        },
      };
    }

    const nextValues: Record<string, unknown> = {
      status,
    };

    if (status === "pending") {
      nextValues.resolved_by = null;
      nextValues.resolved_at = null;
    } else {
      nextValues.resolved_by = admin.user?.id ?? null;
      nextValues.resolved_at = new Date().toISOString();
    }

    if (moderatorNoteProvided) {
      nextValues.moderator_note = moderatorNote ?? null;
    }

    const { data: updatedData, error: updateError } = await reportsTable
      .update(nextValues)
      .eq("id", report.id)
      .select("id, reported_user_id, reporter_user_id, reason, details, status, resolved_by, resolved_at, moderator_note, created_at")
      .single();

    if (updateError) {
      context.error("Failed to update user report:", updateError);
      return {
        status: 500,
        jsonBody: {
          message: "Failed to update user report.",
        },
      };
    }

    return {
      status: 200,
      jsonBody: {
        success: true,
        message: "User report updated.",
        report: updatedData,
      },
    };
  } catch (error) {
    context.error("Unexpected error in PATCH /api/app-admin/user-reports/{reportId}:", error);
    return {
      status: 500,
      jsonBody: {
        message: "Unexpected server error.",
      },
    };
  }
}

app.http("userReportsCreate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "users/{userId}/report",
  handler: userReportsCreate,
});

app.http("myUserReportsList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "me/user-reports",
  handler: myUserReportsList,
});

app.http("appAdminUserReportsList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "app-admin/user-reports",
  handler: adminUserReportsList,
});

app.http("adminUserReportsList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "admin/user-reports",
  handler: adminUserReportsList,
});

app.http("appAdminUserReportUpdate", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "app-admin/user-reports/{reportId}",
  handler: adminUserReportUpdate,
});

app.http("adminUserReportUpdate", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "admin/user-reports/{reportId}",
  handler: adminUserReportUpdate,
});
