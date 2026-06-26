import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { countApprovedPlaceImages, getApprovedPlaceImages } from "../services/placeImagesService";
import { AuthenticatedUser, validateJwt } from "../utils/auth";
import { convertImageToWebp, deleteR2Object, detectImageFormat, uploadWebpToR2 } from "../utils/r2ImageStorage";

type PlaceRow = {
  id: string;
  name: string;
  slug: string;
};

type PlaceImageRow = {
  id: string;
  place_id: string;
  uploaded_by: string | null;
  image_url: string | null;
  storage_key: string | null;
  status: "pending" | "approved" | "rejected" | string;
  source_url: string | null;
  contributor_note: string | null;
  rejection_reason: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string | null;
};

type ProfileRow = {
  user_id: string;
  username: string | null;
  display_name: string | null;
};

type UserRow = {
  id: string;
  email: string | null;
  role: string | null;
};

const MAX_APPROVED_IMAGES = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const PLACE_IMAGE_COLUMNS =
  "id, place_id, uploaded_by, image_url, storage_key, status, source_url, contributor_note, rejection_reason, sort_order, created_at, updated_at";

function response(status: number, message: string): HttpResponseInit {
  return {
    status,
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

async function isAdminUser(userId: string) {
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("users") as any)
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return false;
  }

  return (data as UserRow | null)?.role === "admin";
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

function getCleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function hasAllowedImageExtension(fileName: string) {
  const normalizedName = fileName.trim().toLowerCase();
  return ALLOWED_IMAGE_EXTENSIONS.some((extension) => normalizedName.endsWith(extension));
}

function isUnsupportedImageError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("unsupported image format") ||
    message.includes("input buffer") ||
    message.includes("corrupt") ||
    message.includes("bad seek") ||
    message.includes("not a jpeg") ||
    message.includes("not a png") ||
    message.includes("not a webp")
  );
}

async function getPlace(placeId: string): Promise<PlaceRow | null> {
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("places") as any)
    .select("id, name, slug")
    .eq("id", placeId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as PlaceRow | null;
}

function normalizeStorageSlug(slug: string) {
  return slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "place";
}

function mapImage(row: PlaceImageRow) {
  return {
    id: row.id,
    placeId: row.place_id,
    uploadedBy: row.uploaded_by,
    imageUrl: row.image_url,
    storageKey: row.storage_key,
    status: row.status,
    sourceUrl: row.source_url,
    contributorNote: row.contributor_note,
    rejectionReason: row.rejection_reason,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function reorderApprovedImages(placeId: string) {
  const supabase = await getSupabaseAdminClient();
  const images = await getApprovedPlaceImages(placeId);

  await Promise.all(
    images.map((image, index) =>
      (supabase.from("place_images") as any)
        .update({ sort_order: index, updated_at: new Date().toISOString() })
        .eq("id", image.id)
    )
  );
}

export async function placeImageContributionCreate(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  let uploadedStorageKey: string | null = null;

  try {
    const user = await getAuthenticatedUser(request);

    if (!user?.id) {
      return response(401, "Missing or invalid Authorization header.");
    }

    const placeId = request.params.placeId?.trim();

    if (!placeId) {
      return response(400, "Place id is required.");
    }

    const place = await getPlace(placeId);

    if (!place) {
      return response(404, "Place not found.");
    }

    const approvedCount = await countApprovedPlaceImages(place.id);

    if (approvedCount >= MAX_APPROVED_IMAGES) {
      return response(409, "This place already has 3 approved images.");
    }

    const formData = await request.formData();
    const file = formData.get("image") || formData.get("photo");

    if (!file || typeof file !== "object" || typeof (file as any).size !== "number" || typeof (file as any).type !== "string") {
      return response(400, "Image file is required.");
    }

    const imageFile = file as any;

    const normalizedMimeType = String(imageFile.type || "").trim().toLowerCase();
    const fileName = typeof imageFile.name === "string" ? imageFile.name : "";

    if (normalizedMimeType && !ALLOWED_IMAGE_TYPES.has(normalizedMimeType) && !hasAllowedImageExtension(fileName)) {
      return response(400, "Image must be a JPEG, PNG, or WebP file.");
    }

    if (imageFile.size > MAX_IMAGE_BYTES) {
      return response(400, "Image must be 5MB or smaller.");
    }

    const inputBuffer = Buffer.from(await imageFile.arrayBuffer());

    const detectedFormat = await detectImageFormat(inputBuffer);

    if (!detectedFormat || !["jpeg", "png", "webp"].includes(detectedFormat)) {
      return response(400, "Image must be a JPEG, PNG, or WebP file.");
    }

    let webpBuffer: Buffer;

    try {
      webpBuffer = await convertImageToWebp(inputBuffer);
    } catch (conversionError) {
      if (isUnsupportedImageError(conversionError)) {
        return response(400, "Image must be a JPEG, PNG, or WebP file.");
      }

      throw conversionError;
    }

    const storageKey = `places/${normalizeStorageSlug(place.slug)}/${randomUUID()}.webp`;
    uploadedStorageKey = storageKey;
    const imageUrl = await uploadWebpToR2(storageKey, webpBuffer);
    const now = new Date().toISOString();
    const sourceUrl = getCleanText(formData.get("source_url") || formData.get("sourceUrl"), 500);
    const contributorNote = getCleanText(formData.get("contributor_note") || formData.get("contributorNote"), 1000);
    const supabase = await getSupabaseAdminClient();
    const { data, error } = await (supabase.from("place_images") as any)
      .insert({
        place_id: place.id,
        uploaded_by: user.id,
        image_url: imageUrl,
        storage_key: storageKey,
        status: "pending",
        source_url: sourceUrl,
        contributor_note: contributorNote,
        updated_at: now,
      })
      .select(PLACE_IMAGE_COLUMNS)
      .single();

    if (error) {
      await deleteR2Object(storageKey).catch((cleanupError) => {
        context.error("Failed to delete place image after DB insert failure:", cleanupError);
      });
      uploadedStorageKey = null;
      throw error;
    }

    uploadedStorageKey = null;

    return {
      status: 201,
      jsonBody: {
        message: "Photo submitted for review.",
        image: mapImage(data as PlaceImageRow),
      },
    };
  } catch (error) {
    if (uploadedStorageKey) {
      await deleteR2Object(uploadedStorageKey).catch((cleanupError) => {
        context.error("Failed to clean up uploaded place image after error:", cleanupError);
      });
    }

    context.error("POST /api/places/{placeId}/images/contributions failed:", error);

    return {
      status: error instanceof Error && error.message.includes("Image conversion") ? 501 : 500,
      jsonBody: {
        message: error instanceof Error ? error.message : "Failed to submit photo.",
      },
    };
  }
}

export async function adminPendingPlaceImages(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const admin = await requireAdmin(request);

    if (admin.response) {
      return admin.response;
    }

    const supabase = await getSupabaseAdminClient();
    const { data, error } = await (supabase.from("place_images") as any)
      .select(`${PLACE_IMAGE_COLUMNS}, places(id, name, slug)`)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    const rows = (data || []) as Array<PlaceImageRow & { places?: PlaceRow | null }>;
    const userIds = Array.from(new Set(rows.map((row) => row.uploaded_by).filter((id): id is string => Boolean(id))));
    const profilesByUserId = new Map<string, ProfileRow>();
    const usersById = new Map<string, UserRow>();

    if (userIds.length > 0) {
      const [{ data: profileData, error: profileError }, { data: userData, error: userError }] = await Promise.all([
        (supabase.from("profiles") as any).select("user_id, username, display_name").in("user_id", userIds),
        (supabase.from("users") as any).select("id, email, role").in("id", userIds),
      ]);

      if (profileError) throw profileError;
      if (userError) throw userError;

      for (const profile of (profileData || []) as ProfileRow[]) {
        profilesByUserId.set(profile.user_id, profile);
      }

      for (const user of (userData || []) as UserRow[]) {
        usersById.set(user.id, user);
      }
    }

    return {
      status: 200,
      jsonBody: {
        images: rows.map((row) => {
          const profile = row.uploaded_by ? profilesByUserId.get(row.uploaded_by) : null;
          const accountUser = row.uploaded_by ? usersById.get(row.uploaded_by) : null;

          return {
            id: row.id,
            imageUrl: row.image_url,
            storageKey: row.storage_key,
            placeId: row.place_id,
            placeName: row.places?.name ?? "Unknown place",
            placeSlug: row.places?.slug ?? "",
            uploadedBy: row.uploaded_by,
            contributorUsername: profile?.username ?? profile?.display_name ?? null,
            contributorEmail: accountUser?.email ?? null,
            sourceUrl: row.source_url,
            contributorNote: row.contributor_note,
            submittedAt: row.created_at,
          };
        }),
      },
    };
  } catch (error) {
    context.error("GET /api/admin/place-images/pending failed:", error);
    return response(500, "Failed to load pending place images.");
  }
}

export async function adminApprovedPlaceImages(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const admin = await requireAdmin(request);

    if (admin.response) {
      return admin.response;
    }

    const placeId = request.query.get("placeId")?.trim();

    if (!placeId) {
      return response(400, "placeId is required.");
    }

    const place = await getPlace(placeId);

    if (!place) {
      return response(404, "Place not found.");
    }

    const images = await getApprovedPlaceImages(place.id);

    return {
      status: 200,
      jsonBody: {
        place,
        images: images.map((image) => ({
          id: image.id,
          placeId: image.place_id,
          imageUrl: image.image_url,
          storageKey: image.storage_key,
          sortOrder: image.sort_order,
          createdAt: image.created_at,
        })),
      },
    };
  } catch (error) {
    context.error("GET /api/admin/place-images/approved failed:", error);
    return response(500, "Failed to load approved place images.");
  }
}

export async function adminPlaceImageApprove(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const admin = await requireAdmin(request);

    if (admin.response) {
      return admin.response;
    }

    const imageId = request.params.imageId?.trim();

    if (!imageId) {
      return response(400, "Image id is required.");
    }

    const supabase = await getSupabaseAdminClient();
    const { data, error } = await (supabase.from("place_images") as any)
      .select(PLACE_IMAGE_COLUMNS)
      .eq("id", imageId)
      .maybeSingle();

    if (error) throw error;

    const image = data as PlaceImageRow | null;

    if (!image) {
      return response(404, "Place image not found.");
    }

    if (image.status !== "pending") {
      return response(409, "Only pending images can be approved.");
    }

    const approvedImages = await getApprovedPlaceImages(image.place_id);

    if (approvedImages.length >= MAX_APPROVED_IMAGES) {
      return response(409, "This place already has 3 approved images. Remove one approved image first before approving another.");
    }

    const usedSortOrders = new Set(approvedImages.map((approvedImage) => approvedImage.sort_order).filter((value): value is number => typeof value === "number"));
    const sortOrder = [0, 1, 2].find((value) => !usedSortOrders.has(value)) ?? approvedImages.length;
    const now = new Date().toISOString();
    const { data: updatedData, error: updateError } = await (supabase.from("place_images") as any)
      .update({
        status: "approved",
        sort_order: sortOrder,
        reviewed_by: admin.user?.id,
        reviewed_at: now,
        updated_at: now,
      })
      .eq("id", image.id)
      .select(PLACE_IMAGE_COLUMNS)
      .single();

    if (updateError) throw updateError;

    return {
      status: 200,
      jsonBody: {
        message: "Photo approved.",
        image: mapImage(updatedData as PlaceImageRow),
      },
    };
  } catch (error) {
    context.error("POST /api/admin/place-images/{imageId}/approve failed:", error);
    return response(500, "Failed to approve place image.");
  }
}

export async function adminPlaceImageReject(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const admin = await requireAdmin(request);

    if (admin.response) {
      return admin.response;
    }

    const imageId = request.params.imageId?.trim();

    if (!imageId) {
      return response(400, "Image id is required.");
    }

    const body = (await request.json().catch(() => ({}))) as { rejection_reason?: unknown; reason?: unknown };
    const rejectionReasonValue = body.rejection_reason ?? body.reason;
    const rejectionReason =
      typeof rejectionReasonValue === "string" && rejectionReasonValue.trim()
        ? rejectionReasonValue.trim().slice(0, 1000)
        : null;
    const supabase = await getSupabaseAdminClient();
    const { data, error } = await (supabase.from("place_images") as any)
      .select(PLACE_IMAGE_COLUMNS)
      .eq("id", imageId)
      .maybeSingle();

    if (error) throw error;

    const image = data as PlaceImageRow | null;

    if (!image) {
      return response(404, "Place image not found.");
    }

    if (image.status !== "pending") {
      return response(409, "Only pending images can be rejected.");
    }

    await deleteR2Object(image.storage_key);

    const now = new Date().toISOString();
    const { data: updatedData, error: updateError } = await (supabase.from("place_images") as any)
      .update({
        status: "rejected",
        image_url: null,
        storage_key: null,
        rejection_reason: rejectionReason,
        reviewed_by: admin.user?.id,
        reviewed_at: now,
        updated_at: now,
      })
      .eq("id", image.id)
      .select(PLACE_IMAGE_COLUMNS)
      .single();

    if (updateError) throw updateError;

    return {
      status: 200,
      jsonBody: {
        message: "Photo rejected.",
        image: mapImage(updatedData as PlaceImageRow),
      },
    };
  } catch (error) {
    context.error("POST /api/admin/place-images/{imageId}/reject failed:", error);
    return response(500, "Failed to reject place image.");
  }
}

export async function adminPlaceImageDelete(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const admin = await requireAdmin(request);

    if (admin.response) {
      return admin.response;
    }

    const imageId = request.params.imageId?.trim();

    if (!imageId) {
      return response(400, "Image id is required.");
    }

    const supabase = await getSupabaseAdminClient();
    const { data, error } = await (supabase.from("place_images") as any)
      .select(PLACE_IMAGE_COLUMNS)
      .eq("id", imageId)
      .maybeSingle();

    if (error) throw error;

    const image = data as PlaceImageRow | null;

    if (!image) {
      return response(404, "Place image not found.");
    }

    await deleteR2Object(image.storage_key);

    const { error: deleteError } = await (supabase.from("place_images") as any).delete().eq("id", image.id);

    if (deleteError) throw deleteError;

    if (image.status === "approved") {
      await reorderApprovedImages(image.place_id);
    }

    return {
      status: 200,
      jsonBody: {
        message: "Photo deleted.",
      },
    };
  } catch (error) {
    context.error("DELETE /api/admin/place-images/{imageId} failed:", error);
    return response(500, "Failed to delete place image.");
  }
}

app.http("placeImageContributionCreate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "places/{placeId}/images/contributions",
  handler: placeImageContributionCreate,
});
