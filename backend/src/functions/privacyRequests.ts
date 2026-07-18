import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { getAuthenticatedUser, isAdminUser, unauthorized, badRequest, validateJwt } from "../utils/auth";
import { logAdminAction } from "../utils/adminAudit";
import { checkEndpointRateLimit } from "../utils/redisRateLimit";

const PRIVACY_REQUEST_TYPES = [
  "access",
  "correction",
  "deletion",
  "blocking",
  "objection",
  "portability",
  "withdraw_consent",
] as const;

const PRIVACY_REQUEST_STATUSES = ["pending", "in_review", "resolved", "rejected", "cancelled"] as const;
const DETAILS_MAX_LENGTH = 1000;
const MODERATOR_NOTE_MAX_LENGTH = 1000;

type PrivacyRequestType = (typeof PRIVACY_REQUEST_TYPES)[number];
type PrivacyRequestStatus = (typeof PRIVACY_REQUEST_STATUSES)[number];

type PrivacyRequestRow = {
  id: string;
  user_id: string;
  request_type: PrivacyRequestType;
  details: string | null;
  status: PrivacyRequestStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  moderator_note: string | null;
  created_at: string;
  updated_at: string;
};

type AccountDeletionRequestRow = {
  id: string;
  user_id: string;
  reason: string | null;
  status: PrivacyRequestStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  moderator_note: string | null;
  created_at: string;
  updated_at: string;
};

function getErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
}

function getCleanText(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return { value: null as string | null, error: null };
  if (typeof value !== "string") return { value: null as string | null, error: "Details must be text." };
  const trimmed = value.trim();
  if (trimmed.length > maxLength) return { value: null as string | null, error: `Details must be ${maxLength} characters or less.` };
  return { value: trimmed || null, error: null };
}

function normalizePrivacyRequest(row: PrivacyRequestRow) {
  return {
    id: row.id,
    userId: row.user_id,
    requestType: row.request_type,
    details: row.details,
    status: row.status,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    moderatorNote: row.moderator_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeDeletionRequest(row: AccountDeletionRequestRow) {
  return {
    id: row.id,
    userId: row.user_id,
    reason: row.reason,
    status: row.status,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    moderatorNote: row.moderator_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isPrivacyRequestType(value: unknown): value is PrivacyRequestType {
  return typeof value === "string" && (PRIVACY_REQUEST_TYPES as readonly string[]).includes(value);
}

function isPrivacyRequestStatus(value: unknown): value is PrivacyRequestStatus {
  return typeof value === "string" && (PRIVACY_REQUEST_STATUSES as readonly string[]).includes(value);
}

async function requireAdmin(request: HttpRequest): Promise<{ userId?: string; response?: HttpResponseInit }> {
  const user = await getAuthenticatedUser(request);
  if (!user?.id) return { response: unauthorized("Missing or invalid Authorization header.") };
  if (!(await isAdminUser(user.id))) return { response: { status: 403, jsonBody: { message: "Admin access required." } } };
  return { userId: user.id };
}

export async function privacyRequestsMe(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const user = await validateJwt(request);
    const supabase = await getSupabaseAdminClient();
    const privacyRequestsTable = supabase.from("privacy_requests") as any;

    if (request.method === "GET") {
      const { data, error } = await privacyRequestsTable
        .select("id, user_id, request_type, details, status, resolved_by, resolved_at, moderator_note, created_at, updated_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(25);

      if (error) throw error;

      return {
        status: 200,
        jsonBody: {
          requests: ((data || []) as PrivacyRequestRow[]).map(normalizePrivacyRequest),
        },
      };
    }

    const rateCheck = await checkEndpointRateLimit(request, "privacy-requests-create", 5, 60);
    if (!rateCheck.allowed && rateCheck.response) return rateCheck.response;

    const body = (await request.json().catch(() => null)) as { requestType?: unknown; request_type?: unknown; details?: unknown } | null;
    if (!body) return badRequest("Invalid JSON body.");

    const requestType = body.request_type ?? body.requestType;
    if (!isPrivacyRequestType(requestType)) {
      return badRequest("requestType must be one of: access, correction, deletion, blocking, objection, portability, withdraw_consent.");
    }

    const details = getCleanText(body.details, DETAILS_MAX_LENGTH);
    if (details.error) return badRequest(details.error);

    const { data, error } = await privacyRequestsTable
      .insert({
        user_id: user.id,
        request_type: requestType,
        details: details.value,
        status: "pending",
      })
      .select("id, user_id, request_type, details, status, resolved_by, resolved_at, moderator_note, created_at, updated_at")
      .single();

    if (error) throw error;

    return {
      status: 201,
      jsonBody: {
        message: "Privacy request submitted.",
        request: normalizePrivacyRequest(data as PrivacyRequestRow),
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("authorization")) return unauthorized("Missing or invalid Authorization header.");
    context.error("Privacy request failed:", error);
    return { status: 500, jsonBody: { message: "Failed to process privacy request." } };
  }
}

export async function accountDeletionRequestMe(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const rateCheck = await checkEndpointRateLimit(request, "account-deletion-request", 3, 60);
    if (!rateCheck.allowed && rateCheck.response) return rateCheck.response;

    const user = await validateJwt(request);
    const body = (await request.json().catch(() => ({}))) as { reason?: unknown } | null;
    const reason = getCleanText(body?.reason, DETAILS_MAX_LENGTH);
    if (reason.error) return badRequest(reason.error);

    const supabase = await getSupabaseAdminClient();
    const deletionRequestsTable = supabase.from("account_deletion_requests") as any;
    const { data: pendingData, error: pendingError } = await deletionRequestsTable
      .select("id, user_id, reason, status, resolved_by, resolved_at, moderator_note, created_at, updated_at")
      .eq("user_id", user.id)
      .in("status", ["pending", "in_review"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (pendingError) throw pendingError;
    const pendingRequest = ((pendingData || []) as AccountDeletionRequestRow[])[0];
    if (pendingRequest) {
      return {
        status: 409,
        jsonBody: {
          message: "You already have a pending account deletion request.",
          request: normalizeDeletionRequest(pendingRequest),
        },
      };
    }

    const { data, error } = await deletionRequestsTable
      .insert({
        user_id: user.id,
        reason: reason.value,
        status: "pending",
      })
      .select("id, user_id, reason, status, resolved_by, resolved_at, moderator_note, created_at, updated_at")
      .single();

    if (error) throw error;

    return {
      status: 201,
      jsonBody: {
        message: "Account deletion request submitted.",
        request: normalizeDeletionRequest(data as AccountDeletionRequestRow),
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("authorization")) return unauthorized("Missing or invalid Authorization header.");
    if (getErrorCode(error) === "23505") return { status: 409, jsonBody: { message: "You already have a pending account deletion request." } };
    context.error("Account deletion request failed:", error);
    return { status: 500, jsonBody: { message: "Failed to submit account deletion request." } };
  }
}

export async function adminPrivacyRequestsList(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const admin = await requireAdmin(request);
    if (admin.response) return admin.response;

    const statusQuery = request.query.get("status")?.trim() || "";
    if (statusQuery && !isPrivacyRequestStatus(statusQuery)) return badRequest("status is not supported.");

    const supabase = await getSupabaseAdminClient();
    let query = (supabase.from("privacy_requests") as any)
      .select("id, user_id, request_type, details, status, resolved_by, resolved_at, moderator_note, created_at, updated_at")
      .order("created_at", { ascending: true });

    if (statusQuery) query = query.eq("status", statusQuery);

    const { data, error } = await query.limit(100);
    if (error) throw error;

    return { status: 200, jsonBody: { requests: ((data || []) as PrivacyRequestRow[]).map(normalizePrivacyRequest) } };
  } catch (error) {
    context.error("Admin privacy request list failed:", error);
    return { status: 500, jsonBody: { message: "Failed to load privacy requests." } };
  }
}

export async function adminPrivacyRequestUpdate(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const admin = await requireAdmin(request);
    if (admin.response) return admin.response;

    const requestId = request.params.requestId?.trim();
    if (!requestId) return badRequest("Request id is required.");

    const body = (await request.json().catch(() => null)) as { status?: unknown; moderatorNote?: unknown; moderator_note?: unknown } | null;
    if (!body) return badRequest("Invalid JSON body.");
    if (!isPrivacyRequestStatus(body.status)) return badRequest("status is not supported.");

    const moderatorNote = getCleanText(body.moderator_note ?? body.moderatorNote, MODERATOR_NOTE_MAX_LENGTH);
    if (moderatorNote.error) return badRequest(moderatorNote.error);

    const now = new Date().toISOString();
    const resolved = body.status === "resolved" || body.status === "rejected" || body.status === "cancelled";
    const supabase = await getSupabaseAdminClient();
    const { data, error } = await (supabase.from("privacy_requests") as any)
      .update({
        status: body.status,
        moderator_note: moderatorNote.value,
        resolved_by: resolved ? admin.userId : null,
        resolved_at: resolved ? now : null,
        updated_at: now,
      })
      .eq("id", requestId)
      .select("id, user_id, request_type, details, status, resolved_by, resolved_at, moderator_note, created_at, updated_at")
      .single();

    if (error) throw error;
    await logAdminAction(request, admin.userId!, "update_privacy_request", "privacy_request", requestId, `status=${body.status}`);
    return { status: 200, jsonBody: { message: "Privacy request updated.", request: normalizePrivacyRequest(data as PrivacyRequestRow) } };
  } catch (error) {
    context.error("Admin privacy request update failed:", error);
    return { status: 500, jsonBody: { message: "Failed to update privacy request." } };
  }
}

export async function adminAccountDeletionRequestsList(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const admin = await requireAdmin(request);
    if (admin.response) return admin.response;

    const statusQuery = request.query.get("status")?.trim() || "";
    if (statusQuery && !isPrivacyRequestStatus(statusQuery)) return badRequest("status is not supported.");

    const supabase = await getSupabaseAdminClient();
    let query = (supabase.from("account_deletion_requests") as any)
      .select("id, user_id, reason, status, resolved_by, resolved_at, moderator_note, created_at, updated_at")
      .order("created_at", { ascending: true });

    if (statusQuery) query = query.eq("status", statusQuery);

    const { data, error } = await query.limit(100);
    if (error) throw error;

    return { status: 200, jsonBody: { requests: ((data || []) as AccountDeletionRequestRow[]).map(normalizeDeletionRequest) } };
  } catch (error) {
    context.error("Admin account deletion request list failed:", error);
    return { status: 500, jsonBody: { message: "Failed to load account deletion requests." } };
  }
}

export async function adminAccountDeletionRequestUpdate(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const admin = await requireAdmin(request);
    if (admin.response) return admin.response;

    const requestId = request.params.requestId?.trim();
    if (!requestId) return badRequest("Request id is required.");

    const body = (await request.json().catch(() => null)) as { status?: unknown; moderatorNote?: unknown; moderator_note?: unknown } | null;
    if (!body) return badRequest("Invalid JSON body.");
    if (!isPrivacyRequestStatus(body.status)) return badRequest("status is not supported.");

    const moderatorNote = getCleanText(body.moderator_note ?? body.moderatorNote, MODERATOR_NOTE_MAX_LENGTH);
    if (moderatorNote.error) return badRequest(moderatorNote.error);

    const now = new Date().toISOString();
    const resolved = body.status === "resolved" || body.status === "rejected" || body.status === "cancelled";
    const supabase = await getSupabaseAdminClient();
    const { data, error } = await (supabase.from("account_deletion_requests") as any)
      .update({
        status: body.status,
        moderator_note: moderatorNote.value,
        resolved_by: resolved ? admin.userId : null,
        resolved_at: resolved ? now : null,
        updated_at: now,
      })
      .eq("id", requestId)
      .select("id, user_id, reason, status, resolved_by, resolved_at, moderator_note, created_at, updated_at")
      .single();

    if (error) throw error;
    await logAdminAction(request, admin.userId!, "update_account_deletion_request", "account_deletion_request", requestId, `status=${body.status}`);
    return { status: 200, jsonBody: { message: "Account deletion request updated.", request: normalizeDeletionRequest(data as AccountDeletionRequestRow) } };
  } catch (error) {
    context.error("Admin account deletion request update failed:", error);
    return { status: 500, jsonBody: { message: "Failed to update account deletion request." } };
  }
}

app.http("privacyRequestsMe", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "me/privacy-requests",
  handler: privacyRequestsMe,
});

app.http("accountDeletionRequestMe", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "me/account-deletion-request",
  handler: accountDeletionRequestMe,
});

app.http("adminPrivacyRequestsList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "app-admin/privacy-requests",
  handler: adminPrivacyRequestsList,
});

app.http("adminPrivacyRequestUpdate", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "app-admin/privacy-requests/{requestId}",
  handler: adminPrivacyRequestUpdate,
});

app.http("adminAccountDeletionRequestsList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "app-admin/account-deletion-requests",
  handler: adminAccountDeletionRequestsList,
});

app.http("adminAccountDeletionRequestUpdate", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "app-admin/account-deletion-requests/{requestId}",
  handler: adminAccountDeletionRequestUpdate,
});
