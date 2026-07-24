import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { generateUniqueSlug } from "../services/placeService";
import { AuthenticatedUser, validateJwt } from "../utils/auth";
import { checkEndpointRateLimit } from "../utils/redisRateLimit";
import { convertImageToWebp, deleteR2Object, detectImageFormat, uploadThumbnailToR2, uploadWebpToR2 } from "../utils/r2ImageStorage";
import { getEffectiveImageFormat, isAcceptedImageFormat, isDangerousImage, detectImageFormatFromBytes } from "../utils/imageValidation";
import { buildImageUrl } from "../utils/r2UrlResolver";
import { logAdminAction } from "../utils/adminAudit";

type UserRow = {
  id: string;
  email: string | null;
  role: string | null;
};

type ProfileRow = {
  user_id: string;
  username: string | null;
  display_name: string | null;
};

type PlaceRow = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
};

type ExistingSubmissionMatchRow = {
  id: string;
  name: string;
  city: string;
  status: "pending" | "approved" | "rejected" | string;
};

type PlaceSubmissionRow = {
  id: string;
  submitted_by: string;
  approved_place_id: string | null;
  name: string;
  category: string;
  address: string;
  city: string;
  area: string | null;
  latitude: number | string;
  longitude: number | string;
  description: string;
  best_time_to_visit: string | null;
  visit_duration: string | null;
  budget_min: number | null;
  good_for: unknown;
  not_ideal_for: unknown;
  crowd_level: string | null;
  indoor_outdoor: string | null;
  weather_fit: string | null;
  parking_info: string | null;
  commute_access: string | null;
  nearby_context: string | null;
  website_url: string | null;
  google_maps_url: string | null;
  status: "pending" | "approved" | "rejected" | string;
  rejection_reason: string | null;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

type PlaceSubmissionImageRow = {
  id: string;
  submission_id: string;
  submitted_by: string;
  storage_key: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type UploadedFormFile = {
  name: string;
  size: number;
  type: string;
  lastModified?: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

const MAX_SUBMISSION_IMAGES = 3;
const MIN_SUBMISSION_IMAGES = 1;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const PLACE_SUBMISSION_COLUMNS =
  "id, submitted_by, approved_place_id, name, category, address, city, area, latitude, longitude, description, best_time_to_visit, visit_duration, budget_min, good_for, not_ideal_for, crowd_level, indoor_outdoor, weather_fit, parking_info, commute_access, nearby_context, website_url, google_maps_url, status, rejection_reason, admin_note, reviewed_by, reviewed_at, created_at, updated_at";
const PLACE_SUBMISSION_IMAGE_COLUMNS =
  "id, submission_id, submitted_by, storage_key, sort_order, created_at, updated_at";

function response(status: number, message: string, jsonBody?: Record<string, unknown>): HttpResponseInit {
  return {
    status,
    jsonBody: {
      message,
      ...(jsonBody ?? {}),
    },
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

async function isAdminUser(userId: string) {
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("users") as any).select("role").eq("id", userId).maybeSingle();

  if (error) {
    return false;
  }

  return ((data as UserRow | null)?.role || "").trim().toLowerCase() === "admin";
}

async function requireAdmin(request: HttpRequest): Promise<{ user?: AuthenticatedUser; response?: HttpResponseInit }> {
  const user = await getAuthenticatedUser(request);

  if (!user?.id) {
    return { response: response(401, "Missing or invalid Authorization header.") };
  }

  if (!(await isAdminUser(user.id))) {
    return { response: response(403, "Admin access required.") };
  }

  return { user };
}

function getCleanText(value: unknown, maxLength: number, { required = false }: { required?: boolean } = {}) {
  if (typeof value !== "string") {
    if (required) {
      throw new Error("Missing required text field.");
    }
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    if (required) {
      throw new Error("Missing required text field.");
    }
    return null;
  }

  return trimmed.slice(0, maxLength);
}

function normalizeStorageSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "place";
}

function normalizeDuplicateCheckText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "");
}

function hasAllowedImageExtension(fileName: string) {
  const normalizedName = fileName.trim().toLowerCase();
  return ALLOWED_IMAGE_EXTENSIONS.some((extension) => normalizedName.endsWith(extension));
}

function getNullableNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getJsonStringArray(value: unknown, maxItems: number) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .slice(0, maxItems);
  }

  if (typeof value !== "string") {
    return [];
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .slice(0, maxItems);
    }
  } catch {
    // Fall through to comma/newline splitting.
  }

  return trimmed
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function buildGoogleMapsUrl(name: string, address: string) {
  const query = [name, address].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function mapSubmissionImage(row: PlaceSubmissionImageRow) {
  return {
    id: row.id,
    imageUrl: buildImageUrl(row.storage_key),
    storageKey: row.storage_key,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

function mapSubmission(row: PlaceSubmissionRow, images: PlaceSubmissionImageRow[]) {
  return {
    id: row.id,
    submittedBy: row.submitted_by,
    approvedPlaceId: row.approved_place_id,
    name: row.name,
    category: row.category,
    address: row.address,
    city: row.city,
    area: row.area,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    description: row.description,
    bestTimeToVisit: row.best_time_to_visit,
    visitDuration: row.visit_duration,
    budgetMin: row.budget_min,
    goodFor: Array.isArray(row.good_for) ? row.good_for : [],
    notIdealFor: Array.isArray(row.not_ideal_for) ? row.not_ideal_for : [],
    crowdLevel: row.crowd_level,
    indoorOutdoor: row.indoor_outdoor,
    weatherFit: row.weather_fit,
    parkingInfo: row.parking_info,
    commuteAccess: row.commute_access,
    nearbyContext: row.nearby_context,
    websiteUrl: row.website_url,
    googleMapsUrl: row.google_maps_url,
    status: row.status,
    rejectionReason: row.rejection_reason,
    adminNote: row.admin_note,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    images: images.map(mapSubmissionImage),
  };
}

async function loadSubmissionImages(submissionIds: string[]) {
  if (submissionIds.length === 0) {
    return new Map<string, PlaceSubmissionImageRow[]>();
  }

  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("place_submission_images") as any)
    .select(PLACE_SUBMISSION_IMAGE_COLUMNS)
    .in("submission_id", submissionIds)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as PlaceSubmissionImageRow[];
  const imagesBySubmissionId = new Map<string, PlaceSubmissionImageRow[]>();

  for (const row of rows) {
    const current = imagesBySubmissionId.get(row.submission_id) ?? [];
    current.push(row);
    imagesBySubmissionId.set(row.submission_id, current);
  }

  return imagesBySubmissionId;
}

function getImageFiles(formData: FormData) {
  const values = [
    ...formData.getAll("images"),
    ...formData.getAll("photos"),
    formData.get("image"),
    formData.get("photo"),
  ].filter(Boolean) as unknown[];

  const files = values.filter(
    (value): value is UploadedFormFile =>
      typeof value === "object" &&
      value !== null &&
      "size" in value &&
      typeof (value as UploadedFormFile).size === "number" &&
      "type" in value &&
      typeof (value as UploadedFormFile).type === "string" &&
      "arrayBuffer" in value &&
      typeof (value as UploadedFormFile).arrayBuffer === "function"
  );

  const uniqueFiles: UploadedFormFile[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const key = `${file.name}:${file.size}:${file.type}:${file.lastModified}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    uniqueFiles.push(file);
  }

  return uniqueFiles;
}

async function deleteUploadedKeys(keys: Array<string | null | undefined>, context: InvocationContext) {
  await Promise.all(
    keys
      .filter((key): key is string => Boolean(key))
      .map((key) =>
        deleteR2Object(key).catch((cleanupError) => {
          context.error("Failed to clean up uploaded place submission image:", cleanupError);
        })
      )
  );
}

async function findDuplicatePlaceMatch(name: string, city: string) {
  const normalizedName = normalizeDuplicateCheckText(name);
  const normalizedCity = normalizeDuplicateCheckText(city);

  if (!normalizedName || !normalizedCity) {
    return null;
  }

  const supabase = await getSupabaseAdminClient();
  const [{ data: placesData, error: placesError }, { data: submissionsData, error: submissionsError }] = await Promise.all([
    (supabase.from("places") as any).select("id, name, slug, city").ilike("name", name.trim()).ilike("city", city.trim()).limit(5),
    (supabase.from("place_submissions") as any)
      .select("id, name, city, status")
      .in("status", ["pending", "approved"])
      .ilike("name", name.trim())
      .ilike("city", city.trim())
      .limit(5),
  ]);

  if (placesError) {
    throw placesError;
  }

  if (submissionsError) {
    throw submissionsError;
  }

  const existingPlace = ((placesData ?? []) as PlaceRow[]).find(
    (place) =>
      normalizeDuplicateCheckText(place.name) === normalizedName &&
      normalizeDuplicateCheckText(place.city ?? "") === normalizedCity
  );

  if (existingPlace) {
    return {
      kind: "place" as const,
      id: existingPlace.id,
      name: existingPlace.name,
      city: existingPlace.city ?? city,
      slug: existingPlace.slug,
    };
  }

  const existingSubmission = ((submissionsData ?? []) as ExistingSubmissionMatchRow[]).find(
    (submission) =>
      normalizeDuplicateCheckText(submission.name) === normalizedName &&
      normalizeDuplicateCheckText(submission.city) === normalizedCity
  );

  if (existingSubmission) {
    return {
      kind: "submission" as const,
      id: existingSubmission.id,
      name: existingSubmission.name,
      city: existingSubmission.city,
      status: existingSubmission.status,
    };
  }

  return null;
}

export async function createPlaceSubmission(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const uploadedKeys: string[] = [];

  try {
    const rateCheck = await checkEndpointRateLimit(request, "place-submissions", 5, 60);
    if (!rateCheck.allowed && rateCheck.response) {
      return rateCheck.response;
    }

    const user = await getAuthenticatedUser(request);

    if (!user?.id) {
      return response(401, "Missing or invalid Authorization header.");
    }

    const formData = await request.formData();
    const name = getCleanText(formData.get("name"), 160, { required: true });
    const category = getCleanText(formData.get("category"), 80, { required: true });
    const address = getCleanText(formData.get("address"), 500, { required: true });
    const city = getCleanText(formData.get("city"), 120, { required: true });
    const area = getCleanText(formData.get("area"), 120);
    const description = getCleanText(formData.get("description"), 5000, { required: true });
    const bestTimeToVisit = getCleanText(formData.get("best_time_to_visit") ?? formData.get("bestTimeToVisit"), 200);
    const visitDuration = getCleanText(formData.get("visit_duration") ?? formData.get("visitDuration"), 120);
    const crowdLevel = getCleanText(formData.get("crowd_level") ?? formData.get("crowdLevel"), 80);
    const indoorOutdoor = getCleanText(formData.get("indoor_outdoor") ?? formData.get("indoorOutdoor"), 80);
    const weatherFit = getCleanText(formData.get("weather_fit") ?? formData.get("weatherFit"), 500);
    const parkingInfo = getCleanText(formData.get("parking_info") ?? formData.get("parkingInfo"), 1000);
    const commuteAccess = getCleanText(formData.get("commute_access") ?? formData.get("commuteAccess"), 1000);
    const nearbyContext = getCleanText(formData.get("nearby_context") ?? formData.get("nearbyContext"), 1200);
    const websiteUrl = getCleanText(formData.get("website_url") ?? formData.get("websiteUrl"), 500);
    const latitude = getNullableNumber(formData.get("latitude"));
    const longitude = getNullableNumber(formData.get("longitude"));
    const budgetMin = getNullableNumber(formData.get("budget_min") ?? formData.get("budgetMin"));
    const goodFor = getJsonStringArray(formData.get("good_for") ?? formData.get("goodFor"), 8);
    const notIdealFor = getJsonStringArray(formData.get("not_ideal_for") ?? formData.get("notIdealFor"), 8);
    const imageFiles = getImageFiles(formData);

    if (!name || !category || !address || !city || !description) {
      return response(400, "Name, category, address, city, and description are required.");
    }

    if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return response(400, "Pick a valid location on the map.");
    }

    if (budgetMin !== null && (!Number.isInteger(budgetMin) || budgetMin < 0)) {
      return response(400, "Budget minimum must be a whole number 0 or higher.");
    }

    if (imageFiles.length < MIN_SUBMISSION_IMAGES || imageFiles.length > MAX_SUBMISSION_IMAGES) {
      return response(400, "Submit at least 1 photo and at most 3 photos.");
    }

    const duplicateMatch = await findDuplicatePlaceMatch(name, city);

    if (duplicateMatch?.kind === "place") {
      return response(409, `This place already exists in GalaTayo as ${duplicateMatch.name} in ${duplicateMatch.city}.`);
    }

    if (duplicateMatch?.kind === "submission") {
      return response(
        409,
        `This place already has a ${duplicateMatch.status} submission as ${duplicateMatch.name} in ${duplicateMatch.city}.`
      );
    }

    const submissionId = randomUUID();
    const submissionSlug = normalizeStorageSlug(`${name}-${city}`);
    const now = new Date().toISOString();
    const uploadedImages: Array<{ storageKey: string; sortOrder: number }> = [];

    for (const [index, imageFile] of imageFiles.entries()) {
      const normalizedMimeType = String(imageFile.type || "").trim().toLowerCase();

      if (
        normalizedMimeType &&
        !ALLOWED_IMAGE_TYPES.has(normalizedMimeType) &&
        !hasAllowedImageExtension(imageFile.name)
      ) {
        return response(400, "All photos must be JPEG, PNG, or WebP.");
      }

      if (imageFile.size > MAX_IMAGE_BYTES) {
        return response(400, "Each photo must be 5MB or smaller.");
      }

      const inputBuffer = Buffer.from(await imageFile.arrayBuffer());

      context.log("Place submission image received:", {
        fileName: imageFile.name,
        fileType: imageFile.type,
        fileSize: imageFile.size,
        detectedBySharp: await detectImageFormat(inputBuffer),
        detectedByMagicBytes: detectImageFormatFromBytes(inputBuffer),
        effectiveFormat: await getEffectiveImageFormat(inputBuffer, imageFile.type, imageFile.name),
      });

      if (isDangerousImage(inputBuffer)) {
        return response(400, "All photos must be JPEG, PNG, or WebP.");
      }

      const effectiveFormat = await getEffectiveImageFormat(inputBuffer, imageFile.type, imageFile.name);

      if (!isAcceptedImageFormat(effectiveFormat)) {
        return response(400, "All photos must be JPEG, PNG, or WebP.");
      }

      const webpBuffer = await convertImageToWebp(inputBuffer);
      const storageKey = `place-submissions/${submissionSlug}/${submissionId}/${index + 1}-${randomUUID()}.webp`;
      await uploadWebpToR2(storageKey, webpBuffer);
      await uploadThumbnailToR2(storageKey, webpBuffer);

      uploadedKeys.push(storageKey);
      uploadedImages.push({
        storageKey,
        sortOrder: index,
      });
    }

    const supabase = await getSupabaseAdminClient();
    const googleMapsUrl = buildGoogleMapsUrl(name, address);
    const { error: submissionError } = await (supabase.from("place_submissions") as any).insert({
      id: submissionId,
      submitted_by: user.id,
      name,
      category,
      address,
      city,
      area,
      latitude,
      longitude,
      description,
      best_time_to_visit: bestTimeToVisit,
      visit_duration: visitDuration,
      budget_min: budgetMin,
      good_for: goodFor,
      not_ideal_for: notIdealFor,
      crowd_level: crowdLevel,
      indoor_outdoor: indoorOutdoor,
      weather_fit: weatherFit,
      parking_info: parkingInfo,
      commute_access: commuteAccess,
      nearby_context: nearbyContext,
      website_url: websiteUrl,
      google_maps_url: googleMapsUrl,
      status: "pending",
      updated_at: now,
    });

    if (submissionError) {
      throw submissionError;
    }

    const { data: imageData, error: imageError } = await (supabase.from("place_submission_images") as any)
      .insert(
        uploadedImages.map((image) => ({
          submission_id: submissionId,
          submitted_by: user.id,
          storage_key: image.storageKey,
          sort_order: image.sortOrder,
          updated_at: now,
        }))
      )
      .select(PLACE_SUBMISSION_IMAGE_COLUMNS);

    if (imageError) {
      await (supabase.from("place_submissions") as any).delete().eq("id", submissionId);
      throw imageError;
    }

    const images = (imageData ?? []) as PlaceSubmissionImageRow[];

    return {
      status: 201,
      jsonBody: {
        message: "Place submitted for admin review.",
        submission: {
          id: submissionId,
          status: "pending",
          name,
          city,
          images: images.map(mapSubmissionImage),
        },
      },
    };
  } catch (error) {
    await deleteUploadedKeys(uploadedKeys, context);

    context.error("POST /api/place-submissions failed:", error);

    return {
      status: error instanceof Error && error.message.includes("Image conversion") ? 501 : 500,
      jsonBody: {
        message: error instanceof Error ? error.message : "Failed to submit place.",
      },
    };
  }
}

export async function getMyPlaceSubmissions(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user?.id) {
      return response(401, "Missing or invalid Authorization header.");
    }

    const supabase = await getSupabaseAdminClient();
    const { data, error } = await (supabase.from("place_submissions") as any)
      .select(PLACE_SUBMISSION_COLUMNS)
      .eq("submitted_by", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as PlaceSubmissionRow[];
    const imagesBySubmissionId = await loadSubmissionImages(rows.map((row) => row.id));

    return {
      status: 200,
      jsonBody: {
        submissions: rows.map((row) => mapSubmission(row, imagesBySubmissionId.get(row.id) ?? [])),
      },
    };
  } catch (error) {
    context.error("GET /api/place-submissions/mine failed:", error);
    return response(500, "Failed to load your submissions.");
  }
}

export async function getPendingPlaceSubmissions(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const admin = await requireAdmin(request);

    if (admin.response) {
      return admin.response;
    }

    const supabase = await getSupabaseAdminClient();
    const { data, error } = await (supabase.from("place_submissions") as any)
      .select(PLACE_SUBMISSION_COLUMNS)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as PlaceSubmissionRow[];
    const imagesBySubmissionId = await loadSubmissionImages(rows.map((row) => row.id));
    const userIds = Array.from(new Set(rows.map((row) => row.submitted_by)));
    const profilesByUserId = new Map<string, ProfileRow>();
    const usersById = new Map<string, UserRow>();

    if (userIds.length > 0) {
      const [{ data: profileData, error: profileError }, { data: userData, error: userError }] = await Promise.all([
        (supabase.from("profiles") as any).select("user_id, username, display_name").in("user_id", userIds),
        (supabase.from("users") as any).select("id, email, role").in("id", userIds),
      ]);

      if (profileError) throw profileError;
      if (userError) throw userError;

      for (const profile of (profileData ?? []) as ProfileRow[]) {
        profilesByUserId.set(profile.user_id, profile);
      }

      for (const user of (userData ?? []) as UserRow[]) {
        usersById.set(user.id, user);
      }
    }

    return {
      status: 200,
      jsonBody: {
        submissions: rows.map((row) => {
          const profile = profilesByUserId.get(row.submitted_by) ?? null;
          const account = usersById.get(row.submitted_by) ?? null;

          return {
            ...mapSubmission(row, imagesBySubmissionId.get(row.id) ?? []),
            contributorUsername: profile?.username ?? profile?.display_name ?? null,
            contributorDisplayName: profile?.display_name ?? null,
            contributorEmail: account?.email ?? null,
          };
        }),
      },
    };
  } catch (error) {
    context.error("GET /api/app-admin/place-submissions/pending failed:", error);
    return response(500, "Failed to load pending place submissions.");
  }
}

async function loadSubmissionOr404(submissionId: string) {
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("place_submissions") as any)
    .select(PLACE_SUBMISSION_COLUMNS)
    .eq("id", submissionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as PlaceSubmissionRow | null) ?? null;
}

export async function approvePlaceSubmission(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  let createdPlaceId: string | null = null;

  try {
    const admin = await requireAdmin(request);

    if (admin.response) {
      return admin.response;
    }

    const submissionId = request.params.submissionId?.trim();

    if (!submissionId) {
      return response(400, "Submission id is required.");
    }

    const body = (await request.json().catch(() => ({}))) as { admin_note?: unknown; adminNote?: unknown };
    const adminNote = getCleanText(body.admin_note ?? body.adminNote, 1000);
    const submission = await loadSubmissionOr404(submissionId);

    if (!submission) {
      return response(404, "Place submission not found.");
    }

    if (submission.status !== "pending") {
      return response(409, "Only pending submissions can be approved.");
    }

    const imagesBySubmissionId = await loadSubmissionImages([submission.id]);
    const images = (imagesBySubmissionId.get(submission.id) ?? []).filter((image) => Boolean(image.storage_key));

    if (images.length < MIN_SUBMISSION_IMAGES || images.length > MAX_SUBMISSION_IMAGES) {
      return response(409, "The submission must still have 1 to 3 photos before approval.");
    }

    const slug = await generateUniqueSlug(submission.name, submission.city);
    const now = new Date().toISOString();
    const supabase = await getSupabaseAdminClient();
    const { data: placeData, error: placeError } = await (supabase.from("places") as any)
      .insert({
        name: submission.name,
        slug,
        category: submission.category,
        address: submission.address,
        city: submission.city,
        area: submission.area,
        latitude: Number(submission.latitude),
        longitude: Number(submission.longitude),
        description: submission.description,
        best_time_to_visit: submission.best_time_to_visit,
        visit_duration: submission.visit_duration,
        budget_min: submission.budget_min,
        google_maps_url: submission.google_maps_url,
        good_for: Array.isArray(submission.good_for) ? submission.good_for : [],
        not_ideal_for: Array.isArray(submission.not_ideal_for) ? submission.not_ideal_for : [],
        crowd_level: submission.crowd_level,
        indoor_outdoor: submission.indoor_outdoor,
        weather_fit: submission.weather_fit,
        parking_info: submission.parking_info,
        commute_access: submission.commute_access,
        nearby_context: submission.nearby_context,
        website_url: submission.website_url,
        updated_at: now,
      })
      .select("id, name, slug")
      .single();

    if (placeError) {
      throw placeError;
    }

    const place = placeData as PlaceRow;
    createdPlaceId = place.id;

    const { error: placeImagesError } = await (supabase.from("place_images") as any).insert(
      images.slice(0, MAX_SUBMISSION_IMAGES).map((image, index) => ({
        place_id: place.id,
        uploaded_by: submission.submitted_by,
        storage_key: image.storage_key,
        status: "approved",
        sort_order: index,
        contributor_note: "Approved with place submission.",
        reviewed_by: admin.user?.id,
        reviewed_at: now,
        updated_at: now,
      }))
    );

    if (placeImagesError) {
      await (supabase.from("places") as any).delete().eq("id", place.id);
      createdPlaceId = null;
      throw placeImagesError;
    }

    const { error: updateError } = await (supabase.from("place_submissions") as any)
      .update({
        status: "approved",
        approved_place_id: place.id,
        admin_note: adminNote,
        reviewed_by: admin.user?.id,
        reviewed_at: now,
        updated_at: now,
      })
      .eq("id", submission.id);

    if (updateError) {
      throw updateError;
    }

    if (admin.user?.id) {
      await logAdminAction(request, admin.user.id, "approve_place_submission", "place_submission", submissionId);
    }

    return {
      status: 200,
      jsonBody: {
        message: "Place submission approved.",
        place: {
          id: place.id,
          name: place.name,
          slug: place.slug,
        },
      },
    };
  } catch (error) {
    if (createdPlaceId) {
      const supabase = await getSupabaseAdminClient();
      await (supabase.from("places") as any).delete().eq("id", createdPlaceId);
    }

    context.error("POST /api/app-admin/place-submissions/{submissionId}/approve failed:", error);
    return response(500, "Failed to approve place submission.");
  }
}

export async function rejectPlaceSubmission(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const admin = await requireAdmin(request);

    if (admin.response) {
      return admin.response;
    }

    const submissionId = request.params.submissionId?.trim();

    if (!submissionId) {
      return response(400, "Submission id is required.");
    }

    const body = (await request.json().catch(() => ({}))) as {
      rejection_reason?: unknown;
      rejectionReason?: unknown;
      admin_note?: unknown;
      adminNote?: unknown;
    };
    const rejectionReason = getCleanText(body.rejection_reason ?? body.rejectionReason, 1000);
    const adminNote = getCleanText(body.admin_note ?? body.adminNote, 1000);
    const submission = await loadSubmissionOr404(submissionId);

    if (!submission) {
      return response(404, "Place submission not found.");
    }

    if (submission.status !== "pending") {
      return response(409, "Only pending submissions can be rejected.");
    }

    const imagesBySubmissionId = await loadSubmissionImages([submission.id]);
    const images = imagesBySubmissionId.get(submission.id) ?? [];
    await deleteUploadedKeys(
      images.map((image) => image.storage_key),
      context
    );

    const now = new Date().toISOString();
    const supabase = await getSupabaseAdminClient();
    const { error: imageUpdateError } = await (supabase.from("place_submission_images") as any)
      .update({
        storage_key: null,
        updated_at: now,
      })
      .eq("submission_id", submission.id);

    if (imageUpdateError) {
      throw imageUpdateError;
    }

    const { error: updateError } = await (supabase.from("place_submissions") as any)
      .update({
        status: "rejected",
        rejection_reason: rejectionReason,
        admin_note: adminNote,
        reviewed_by: admin.user?.id,
        reviewed_at: now,
        updated_at: now,
      })
      .eq("id", submission.id);

    if (updateError) {
      throw updateError;
    }

    if (admin.user?.id) {
      await logAdminAction(request, admin.user.id, "reject_place_submission", "place_submission", submissionId, rejectionReason);
    }

    return response(200, "Place submission rejected.");
  } catch (error) {
    context.error("POST /api/app-admin/place-submissions/{submissionId}/reject failed:", error);
    return response(500, "Failed to reject place submission.");
  }
}

app.http("createPlaceSubmission", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "place-submissions",
  handler: createPlaceSubmission,
});

app.http("getMyPlaceSubmissions", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "place-submissions/mine",
  handler: getMyPlaceSubmissions,
});

app.http("getPendingPlaceSubmissions", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "app-admin/place-submissions/pending",
  handler: getPendingPlaceSubmissions,
});

app.http("approvePlaceSubmission", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "app-admin/place-submissions/{submissionId}/approve",
  handler: approvePlaceSubmission,
});

app.http("rejectPlaceSubmission", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "app-admin/place-submissions/{submissionId}/reject",
  handler: rejectPlaceSubmission,
});
