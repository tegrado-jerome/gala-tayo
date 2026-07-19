import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { countApprovedPlaceImages, getApprovedPlaceImages } from "../services/placeImagesService";
import { getAuthenticatedUser, type AuthenticatedUser } from "../utils/auth";
import { checkEndpointRateLimit } from "../utils/redisRateLimit";
import { convertImageToWebp, deleteR2Object, detectImageFormat, uploadThumbnailToR2, uploadWebpToR2 } from "../utils/r2ImageStorage";

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
    const rateCheck = await checkEndpointRateLimit(request, "place-image-upload", 10, 60);
    if (!rateCheck.allowed && rateCheck.response) {
      return rateCheck.response;
    }

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

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (parseError) {
      context.error("Failed to parse multipart form data:", parseError);
      return response(400, "Could not read the uploaded file. Ensure the form data is valid.");
    }

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
    await uploadThumbnailToR2(storageKey, webpBuffer);
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

    const errorMessage = error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null
        ? String((error as any).message ?? JSON.stringify(error))
        : String(error ?? "Failed to submit photo.");

    return {
      status: error instanceof Error && error.message.includes("Image conversion") ? 501 : 500,
      jsonBody: { message: errorMessage },
    };
  }
}

app.http("placeImageContributionCreate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "places/{placeId}/images/contributions",
  handler: placeImageContributionCreate,
});
