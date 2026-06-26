import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { getApprovedPlaceImages } from "../services/placeImagesService";
import { AuthenticatedUser, validateJwt } from "../utils/auth";
import { deleteR2Object } from "../utils/r2ImageStorage";

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

type PlaceImageWithPlaceRow = PlaceImageRow & {
  places?: PlaceRow | null;
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
    context.error("GET /api/app-admin/place-images/pending failed:", error);
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
    context.error("GET /api/app-admin/place-images/approved failed:", error);
    return response(500, "Failed to load approved place images.");
  }
}

export async function adminApprovedPlaceImagesAll(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const admin = await requireAdmin(request);

    if (admin.response) {
      return admin.response;
    }

    const query = request.query.get("query")?.trim().toLowerCase() ?? "";
    const supabase = await getSupabaseAdminClient();
    const { data, error } = await (supabase.from("place_images") as any)
      .select(`${PLACE_IMAGE_COLUMNS}, places(id, name, slug)`)
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const rows = ((data || []) as PlaceImageWithPlaceRow[]).filter((row) => Boolean(row.image_url));
    const filteredRows = query
      ? rows.filter((row) => {
          const placeName = row.places?.name?.toLowerCase() ?? "";
          const placeSlug = row.places?.slug?.toLowerCase() ?? "";
          const placeId = row.place_id.toLowerCase();
          const imageUrl = row.image_url?.toLowerCase() ?? "";

          return (
            placeName.includes(query) ||
            placeSlug.includes(query) ||
            placeId.includes(query) ||
            imageUrl.includes(query)
          );
        })
      : rows;

    return {
      status: 200,
      jsonBody: {
        images: filteredRows.map((row) => ({
          id: row.id,
          placeId: row.place_id,
          placeName: row.places?.name ?? "Unknown place",
          placeSlug: row.places?.slug ?? "",
          imageUrl: row.image_url,
          storageKey: row.storage_key,
          sortOrder: row.sort_order,
          createdAt: row.created_at,
        })),
      },
    };
  } catch (error) {
    context.error("GET /api/app-admin/place-images/approved/all failed:", error);
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
    context.error("POST /api/app-admin/place-images/{imageId}/approve failed:", error);
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
    context.error("POST /api/app-admin/place-images/{imageId}/reject failed:", error);
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
    context.error("DELETE /api/app-admin/place-images/{imageId} failed:", error);
    return response(500, "Failed to delete place image.");
  }
}

app.http("adminPlaceImagesPending", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "app-admin/place-images/pending",
  handler: adminPendingPlaceImages,
});

app.http("adminPlaceImagesApproved", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "app-admin/place-images/approved",
  handler: adminApprovedPlaceImages,
});

app.http("adminPlaceImagesApprovedAll", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "app-admin/place-images/approved/all",
  handler: adminApprovedPlaceImagesAll,
});

app.http("adminPlaceImageApprove", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "app-admin/place-images/{imageId}/approve",
  handler: adminPlaceImageApprove,
});

app.http("adminPlaceImageReject", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "app-admin/place-images/{imageId}/reject",
  handler: adminPlaceImageReject,
});

app.http("adminPlaceImageDelete", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "app-admin/place-images/{imageId}",
  handler: adminPlaceImageDelete,
});
