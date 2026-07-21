import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { getAuthenticatedUser, isAdminUser, requireAdmin, unauthorized, forbidden, badRequest, type AuthenticatedUser } from "../utils/auth";
import { checkEndpointRateLimit } from "../utils/redisRateLimit";
import { buildImageUrl } from "../utils/r2UrlResolver";
import { isPlaceUuid } from "../utils/placeIdentity";

type PlaceReportReason =
  | "wrong_info"
  | "closed_or_moved"
  | "safety_issue"
  | "duplicate_place"
  | "photo_or_copyright"
  | "other";

type PlaceReportStatus = "pending" | "reviewing" | "resolved" | "dismissed";

type PlaceReportRequestBody = {
  reason?: unknown;
  details?: unknown;
  reported_image_id?: unknown;
  reportedImageId?: unknown;
};

type PlaceReportModerationRequestBody = {
  status?: unknown;
  moderator_note?: unknown;
  moderatorNote?: unknown;
};

type PlaceReportRow = {
  id: string;
  place_id: string;
  reported_by: string;
  reported_image_id: string | null;
  reason: PlaceReportReason;
  details: string | null;
  status: PlaceReportStatus;
  moderator_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
};

type PlaceRow = {
  id: string;
  name: string | null;
  slug: string | null;
};

type PlaceImageRow = {
  id: string;
  place_id: string;
  storage_key: string | null;
};

type ProfileRow = {
  user_id: string;
  username: string | null;
  display_name: string | null;
};

type UserRow = {
  id: string;
  email: string | null;
};

const PLACE_REPORT_REASONS = [
  "wrong_info",
  "closed_or_moved",
  "safety_issue",
  "duplicate_place",
  "photo_or_copyright",
  "other",
] as const;
const PLACE_REPORT_STATUSES = ["pending", "reviewing", "resolved", "dismissed"] as const;
const PLACE_REPORT_DETAILS_MAX_LENGTH = 1000;
const PLACE_REPORT_NOTE_MAX_LENGTH = 1000;

async function getPlace(placeId: string): Promise<PlaceRow | null> {
  const supabaseAdmin = await getSupabaseAdminClient();
  const { data, error } = await supabaseAdmin.from("places").select("id, name, slug").eq("id", placeId).maybeSingle();

  if (error) {
    throw error;
  }

  return data as PlaceRow | null;
}

async function getReportedImage(placeId: string, reportedImageId: string): Promise<PlaceImageRow | null> {
  const supabaseAdmin = await getSupabaseAdminClient();
  const { data, error } = await (supabaseAdmin.from("place_images") as any)
    .select("id, place_id, storage_key")
    .eq("id", reportedImageId)
    .eq("place_id", placeId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as PlaceImageRow | null;
}

async function readCleanPlaceReport(
  request: HttpRequest
): Promise<{ reason?: PlaceReportReason; details?: string | null; reportedImageId?: string | null; response?: HttpResponseInit }> {
  let payload: PlaceReportRequestBody;

  try {
    payload = (await request.json()) as PlaceReportRequestBody;
  } catch {
    return { response: badRequest("Invalid JSON body.") };
  }

  if (typeof payload.reason !== "string") {
    return { response: badRequest("reason must be a string.") };
  }

  const reason = payload.reason.trim();

  if (!PLACE_REPORT_REASONS.includes(reason as PlaceReportReason)) {
    return { response: badRequest("reason is not supported.") };
  }

  if (payload.details !== undefined && payload.details !== null && typeof payload.details !== "string") {
    return { response: badRequest("details must be a string.") };
  }

  const details = typeof payload.details === "string" ? payload.details.trim() : "";

  if (details.length > PLACE_REPORT_DETAILS_MAX_LENGTH) {
    return { response: badRequest(`details must be ${PLACE_REPORT_DETAILS_MAX_LENGTH} characters or less.`) };
  }

  const reportedImageValue = payload.reported_image_id ?? payload.reportedImageId ?? null;

  if (reportedImageValue !== null && reportedImageValue !== undefined && !isPlaceUuid(reportedImageValue)) {
    return { response: badRequest("reported_image_id must be a valid UUID or null.") };
  }

  return {
    reason: reason as PlaceReportReason,
    details: details || null,
    reportedImageId: typeof reportedImageValue === "string" ? reportedImageValue.trim() : null,
  };
}

async function readCleanPlaceReportModeration(
  request: HttpRequest
): Promise<{ status?: PlaceReportStatus; moderatorNote?: string | null; response?: HttpResponseInit }> {
  let payload: PlaceReportModerationRequestBody;

  try {
    payload = (await request.json()) as PlaceReportModerationRequestBody;
  } catch {
    return { response: badRequest("Invalid JSON body.") };
  }

  if (typeof payload.status !== "string") {
    return { response: badRequest("status must be a string.") };
  }

  const status = payload.status.trim();

  if (!PLACE_REPORT_STATUSES.includes(status as PlaceReportStatus)) {
    return { response: badRequest("status is not supported.") };
  }

  const moderatorNoteValue = payload.moderator_note ?? payload.moderatorNote;

  if (moderatorNoteValue !== undefined && moderatorNoteValue !== null && typeof moderatorNoteValue !== "string") {
    return { response: badRequest("moderator_note must be a string or null.") };
  }

  const moderatorNote = typeof moderatorNoteValue === "string" ? moderatorNoteValue.trim() : null;

  if ((moderatorNote || "").length > PLACE_REPORT_NOTE_MAX_LENGTH) {
    return { response: badRequest(`moderator_note must be ${PLACE_REPORT_NOTE_MAX_LENGTH} characters or less.`) };
  }

  return {
    status: status as PlaceReportStatus,
    moderatorNote: moderatorNote || null,
  };
}

function mapUserPlaceReport(
  report: PlaceReportRow,
  place: PlaceRow | null,
  image: PlaceImageRow | null
) {
  return {
    id: report.id,
    placeId: report.place_id,
    reportedImageId: report.reported_image_id,
    reason: report.reason,
    details: report.details,
    status: report.status,
    moderatorNote: report.moderator_note,
    resolvedAt: report.resolved_at,
    createdAt: report.created_at,
    place: place
      ? {
          id: place.id,
          name: place.name,
          slug: place.slug,
        }
      : null,
    image: image
      ? {
          id: image.id,
          imageUrl: buildImageUrl(image.storage_key),
        }
      : null,
  };
}

export async function placeReportsCreate(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const rateCheck = await checkEndpointRateLimit(request, "place-reports", 5, 60);
    if (!rateCheck.allowed && rateCheck.response) {
      return rateCheck.response;
    }

    const user = await getAuthenticatedUser(request);

    if (!user?.id) {
      return unauthorized("Missing or invalid Authorization header.");
    }

    const placeId = request.params.placeId?.trim();

    if (!placeId || !isPlaceUuid(placeId)) {
      return badRequest("Place id must be a valid UUID.");
    }

    const { reason, details, reportedImageId, response } = await readCleanPlaceReport(request);

    if (response) {
      return response;
    }

    const place = await getPlace(placeId);

    if (!place) {
      return {
        status: 404,
        jsonBody: { message: "Place not found." },
      };
    }

    let reportedImage: PlaceImageRow | null = null;

    if (reportedImageId) {
      reportedImage = await getReportedImage(place.id, reportedImageId);

      if (!reportedImage) {
        return {
          status: 404,
          jsonBody: { message: "Reported image not found for this place." },
        };
      }
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const reportsTable = supabaseAdmin.from("place_reports") as any;
    const { data, error } = await reportsTable
      .insert({
        place_id: place.id,
        reported_by: user.id,
        reported_image_id: reportedImage?.id ?? null,
        reason,
        details: details ?? null,
        status: "pending",
      })
      .select("id, place_id, reported_image_id, reason, details, status, moderator_note, resolved_by, resolved_at, created_at")
      .single();

    if (error) {
      context.error("Failed to create place report:", error);
      return {
        status: 500,
        jsonBody: { message: "Failed to submit place report." },
      };
    }

    return {
      status: 201,
      jsonBody: {
        ok: true,
        message: "Report submitted.",
        report: mapUserPlaceReport(data as PlaceReportRow, place, reportedImage),
      },
    };
  } catch (error) {
    context.error("Unexpected error in POST /api/places/{placeId}/reports:", error);
    return {
      status: 500,
      jsonBody: { message: "Unexpected server error." },
    };
  }
}

export async function myPlaceReportsList(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user?.id) {
      return unauthorized("Missing or invalid Authorization header.");
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const reportsTable = supabaseAdmin.from("place_reports") as any;
    const { data: reportData, error: reportsError } = await reportsTable
      .select("id, place_id, reported_image_id, reason, details, status, moderator_note, resolved_by, resolved_at, created_at")
      .eq("reported_by", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (reportsError) {
      context.error("Failed to fetch user place reports:", reportsError);
      return {
        status: 500,
        jsonBody: { message: "Failed to fetch place reports." },
      };
    }

    const reports = (reportData || []) as PlaceReportRow[];
    const placeIds = Array.from(new Set(reports.map((report) => report.place_id).filter(Boolean)));
    const imageIds = Array.from(new Set(reports.map((report) => report.reported_image_id).filter((value): value is string => Boolean(value))));
    const placesById = new Map<string, PlaceRow>();
    const imagesById = new Map<string, PlaceImageRow>();

    if (placeIds.length > 0) {
      const { data: placeData, error: placesError } = await supabaseAdmin.from("places").select("id, name, slug").in("id", placeIds);

      if (placesError) {
        context.error("Failed to fetch places for place reports:", placesError);
      } else {
        ((placeData || []) as PlaceRow[]).forEach((place) => {
          placesById.set(place.id, place);
        });
      }
    }

    if (imageIds.length > 0) {
      const { data: imageData, error: imagesError } = await (supabaseAdmin.from("place_images") as any)
        .select("id, place_id, storage_key")
        .in("id", imageIds);

      if (imagesError) {
        context.error("Failed to fetch reported images for place reports:", imagesError);
      } else {
        ((imageData || []) as PlaceImageRow[]).forEach((image) => {
          imagesById.set(image.id, image);
        });
      }
    }

    return {
      status: 200,
      jsonBody: {
        reports: reports.map((report) =>
          mapUserPlaceReport(report, placesById.get(report.place_id) || null, report.reported_image_id ? imagesById.get(report.reported_image_id) || null : null)
        ),
      },
    };
  } catch (error) {
    context.error("Unexpected error in GET /api/me/place-reports:", error);
    return {
      status: 500,
      jsonBody: { message: "Unexpected server error." },
    };
  }
}

export async function adminPlaceReportsList(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const admin = await requireAdmin(request);

    if (admin.response) {
      return admin.response;
    }

    const statusQuery = request.query.get("status")?.trim() || "";

    if (statusQuery && !PLACE_REPORT_STATUSES.includes(statusQuery as PlaceReportStatus)) {
      return badRequest("status is not supported.");
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    let query = (supabaseAdmin.from("place_reports") as any)
      .select("id, place_id, reported_by, reported_image_id, reason, details, status, moderator_note, resolved_by, resolved_at, created_at")
      .order("created_at", { ascending: true });

    if (statusQuery) {
      query = query.eq("status", statusQuery);
    }

    const { data: reportData, error: reportsError } = await query.limit(100);

    if (reportsError) {
      context.error("Failed to fetch admin place reports:", reportsError);
      return {
        status: 500,
        jsonBody: { message: "Failed to load place reports." },
      };
    }

    const reports = (reportData || []) as Array<PlaceReportRow & { reported_by: string }>;
    const placeIds = Array.from(new Set(reports.map((report) => report.place_id).filter(Boolean)));
    const imageIds = Array.from(new Set(reports.map((report) => report.reported_image_id).filter((value): value is string => Boolean(value))));
    const reporterIds = Array.from(new Set(reports.map((report) => report.reported_by).filter(Boolean)));
    const resolvedByIds = Array.from(new Set(reports.map((report) => report.resolved_by).filter((value): value is string => Boolean(value))));
    const userIds = Array.from(new Set([...reporterIds, ...resolvedByIds]));
    const placesById = new Map<string, PlaceRow>();
    const imagesById = new Map<string, PlaceImageRow>();
    const profilesByUserId = new Map<string, ProfileRow>();
    const usersById = new Map<string, UserRow>();

    if (placeIds.length > 0) {
      const { data: placeData, error: placesError } = await supabaseAdmin.from("places").select("id, name, slug").in("id", placeIds);
      if (placesError) {
        context.error("Failed to fetch places for admin place reports:", placesError);
      } else {
        ((placeData || []) as PlaceRow[]).forEach((place) => {
          placesById.set(place.id, place);
        });
      }
    }

    if (imageIds.length > 0) {
      const { data: imageData, error: imagesError } = await (supabaseAdmin.from("place_images") as any)
        .select("id, place_id, storage_key")
        .in("id", imageIds);
      if (imagesError) {
        context.error("Failed to fetch images for admin place reports:", imagesError);
      } else {
        ((imageData || []) as PlaceImageRow[]).forEach((image) => {
          imagesById.set(image.id, image);
        });
      }
    }

    if (userIds.length > 0) {
      const [{ data: profileData, error: profileError }, { data: userData, error: userError }] = await Promise.all([
        (supabaseAdmin.from("profiles") as any).select("user_id, username, display_name").in("user_id", userIds),
        (supabaseAdmin.from("users") as any).select("id, email").in("id", userIds),
      ]);

      if (profileError) {
        context.error("Failed to fetch profiles for admin place reports:", profileError);
      } else {
        ((profileData || []) as ProfileRow[]).forEach((profile) => {
          profilesByUserId.set(profile.user_id, profile);
        });
      }

      if (userError) {
        context.error("Failed to fetch users for admin place reports:", userError);
      } else {
        ((userData || []) as UserRow[]).forEach((user) => {
          usersById.set(user.id, user);
        });
      }
    }

    return {
      status: 200,
      jsonBody: {
        reports: reports.map((report) => {
          const reporterProfile = profilesByUserId.get(report.reported_by);
          const reporterUser = usersById.get(report.reported_by);
          const resolvedByProfile = report.resolved_by ? profilesByUserId.get(report.resolved_by) : null;
          const place = placesById.get(report.place_id) || null;
          const image = report.reported_image_id ? imagesById.get(report.reported_image_id) || null : null;

          return {
            id: report.id,
            placeId: report.place_id,
            reportedBy: report.reported_by,
            reportedImageId: report.reported_image_id,
            reason: report.reason,
            details: report.details,
            status: report.status,
            moderatorNote: report.moderator_note,
            resolvedBy: report.resolved_by,
            resolvedAt: report.resolved_at,
            createdAt: report.created_at,
            place: place
              ? {
                  id: place.id,
                  name: place.name,
                  slug: place.slug,
                }
              : null,
            image: image
              ? {
                  id: image.id,
                  imageUrl: buildImageUrl(image.storage_key),
                }
              : null,
            reporter: {
              id: report.reported_by,
              username: reporterProfile?.username ?? reporterProfile?.display_name ?? null,
              email: reporterUser?.email ?? null,
            },
            resolver: report.resolved_by
              ? {
                  id: report.resolved_by,
                  username: resolvedByProfile?.username ?? resolvedByProfile?.display_name ?? null,
                }
              : null,
          };
        }),
      },
    };
  } catch (error) {
    context.error("Unexpected error in GET /api/app-admin/place-reports:", error);
    return {
      status: 500,
      jsonBody: { message: "Unexpected server error." },
    };
  }
}

export async function adminPlaceReportUpdate(
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

    const { status, moderatorNote, response } = await readCleanPlaceReportModeration(request);

    if (response) {
      return response;
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const reportsTable = supabaseAdmin.from("place_reports") as any;
    const { data: reportData, error: reportLookupError } = await reportsTable
      .select("id, place_id, reported_image_id, reported_by, reason, details, status, moderator_note, resolved_by, resolved_at, created_at")
      .eq("id", reportId)
      .maybeSingle();

    if (reportLookupError) {
      context.error("Failed to fetch place report for moderation:", reportLookupError);
      return {
        status: 500,
        jsonBody: { message: "Failed to load place report." },
      };
    }

    const report = reportData as PlaceReportRow | null;

    if (!report) {
      return {
        status: 404,
        jsonBody: { message: "Place report not found." },
      };
    }

    const resolvedAt = status === "resolved" || status === "dismissed" ? new Date().toISOString() : null;
    const { data: updatedData, error: updateError } = await reportsTable
      .update({
        status,
        moderator_note: moderatorNote,
        resolved_by: resolvedAt ? admin.user?.id ?? null : null,
        resolved_at: resolvedAt,
      })
      .eq("id", report.id)
      .select("id, place_id, reported_image_id, reported_by, reason, details, status, moderator_note, resolved_by, resolved_at, created_at")
      .single();

    if (updateError) {
      context.error("Failed to update place report:", updateError);
      return {
        status: 500,
        jsonBody: { message: "Failed to update place report." },
      };
    }

    return {
      status: 200,
      jsonBody: {
        ok: true,
        message: "Place report updated.",
        report: updatedData,
      },
    };
  } catch (error) {
    context.error("Unexpected error in PATCH /api/app-admin/place-reports/{reportId}:", error);
    return {
      status: 500,
      jsonBody: { message: "Unexpected server error." },
    };
  }
}

export async function adminPlaceReportDelete(
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

    const supabaseAdmin = await getSupabaseAdminClient();
    const { error } = await (supabaseAdmin.from("place_reports") as any).delete().eq("id", reportId);

    if (error) {
      context.error("Failed to delete place report:", error);
      return {
        status: 500,
        jsonBody: { message: "Failed to delete place report." },
      };
    }

    return {
      status: 200,
      jsonBody: {
        ok: true,
        message: "Place report deleted.",
      },
    };
  } catch (error) {
    context.error("Unexpected error in DELETE /api/app-admin/place-reports/{reportId}:", error);
    return {
      status: 500,
      jsonBody: { message: "Unexpected server error." },
    };
  }
}

app.http("placeReportsCreate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "places/{placeId}/reports",
  handler: placeReportsCreate,
});

app.http("myPlaceReportsList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "me/place-reports",
  handler: myPlaceReportsList,
});

app.http("adminPlaceReportsList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "app-admin/place-reports",
  handler: adminPlaceReportsList,
});

app.http("adminPlaceReportUpdate", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "app-admin/place-reports/{reportId}",
  handler: adminPlaceReportUpdate,
});

app.http("adminPlaceReportDelete", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "app-admin/place-reports/{reportId}",
  handler: adminPlaceReportDelete,
});
