import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { findPlaceDetailsByIds } from "../data/placeDetails";
import { AuthenticatedUser, validateJwt } from "../utils/auth";
import { checkEndpointRateLimit } from "../utils/redisRateLimit";

type HistoryRow = {
  id: string;
  user_id: string;
  type: string;
  query: string | null;
  place_id: string | null;
  created_at: string;
};

type HistoryPlace = {
  id: string;
  slug: string | null;
  name: string | null;
  category?: string | null;
  address: string | null;
  city: string | null;
  area: string | null;
  latitude: number | null;
  longitude: number | null;
  google_maps_url: string | null;
  description: string | null;
  budget_label?: string | null;
  budget_min: number | null;
  photo_url?: string | null;
  photos: string[] | null;
};

function unauthorized(message: string): HttpResponseInit {
  return {
    status: 401,
    jsonBody: { message },
  };
}

async function getAuthenticatedUser(request: HttpRequest): Promise<AuthenticatedUser | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  try {
    return await validateJwt(request);
  } catch {
    return null;
  }
}

function toSupabaseErrorDetails(error: unknown) {
  const supabaseError = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  } | null;
  return {
    code: supabaseError?.code ?? null,
    message: supabaseError?.message ?? null,
    details: supabaseError?.details ?? null,
    hint: supabaseError?.hint ?? null,
  };
}

async function getUserHistory(userId: string, context: InvocationContext): Promise<{
  history: Array<HistoryRow & { place: HistoryPlace | null }>;
  error: unknown;
}> {
  const supabaseAdmin = await getSupabaseAdminClient();
  const historyTable = supabaseAdmin.from("history") as any;

  const { data: historyData, error: historyError } = await historyTable
    .select("id, user_id, type, query, place_id, created_at")
    .eq("user_id", userId)
    .eq("type", "place_view")
    .order("created_at", { ascending: false });

  if (historyError) {
    context.error("Supabase history query failed.", toSupabaseErrorDetails(historyError));
    return { history: [], error: historyError };
  }

  const historyRows = (historyData || []) as HistoryRow[];

  if (historyRows.length === 0) {
    return { history: [], error: null };
  }

  const uniquePlaceIds = Array.from(
    new Set(
      historyRows
        .map((item) => item.place_id)
        .filter((placeId): placeId is string => Boolean(placeId))
    )
  );

  const placeDetailsById = await findPlaceDetailsByIds(uniquePlaceIds);
  const placeMap = new Map<string, HistoryPlace | null>(
    uniquePlaceIds.map((placeId) => {
      const detail = placeDetailsById.get(placeId);
      if (!detail) return [placeId, null] as const;

      return [
        placeId,
        {
          id: detail.id,
          slug: detail.slug,
          name: detail.name,
          category: detail.category,
          address: detail.address ?? null,
          city: detail.city ?? null,
          area: detail.area ?? null,
          latitude: detail.latitude ?? null,
          longitude: detail.longitude ?? null,
          google_maps_url: detail.google_maps_url ?? null,
          description: detail.description ?? null,
          budget_label: detail.budget_notes ?? null,
          budget_min: null,
          photo_url: detail.imageUrl || null,
          photos: detail.curatedImageUrls ?? [],
        } satisfies HistoryPlace,
      ] as const;
    })
  );

  return {
    history: historyRows.map((item) => ({
      ...item,
      place: item.place_id ? placeMap.get(item.place_id) || null : null,
    })),
    error: null,
  };
}

export async function getHistory(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const rateCheck = await checkEndpointRateLimit(request, "history", 30, 60);
    if (!rateCheck.allowed && rateCheck.response) return rateCheck.response;

    const user = await getAuthenticatedUser(request);
    if (!user?.id) return unauthorized("Missing or invalid Authorization header.");

    const { history, error } = await getUserHistory(user.id, context);

    if (error) {
      const historyError = toSupabaseErrorDetails(error);
      context.error("Failed to fetch history:", historyError);
      return {
        status: 500,
        jsonBody: { message: "Failed to fetch history.", error: historyError?.message },
      };
    }

    return {
      status: 200,
      jsonBody: { history },
    };
  } catch (error) {
    context.error("Unexpected error in GET /api/history:", error);
    return {
      status: 500,
      jsonBody: { message: "Unexpected server error." },
    };
  }
}

export async function deleteHistory(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const rateCheck = await checkEndpointRateLimit(request, "delete-history", 10, 60);
    if (!rateCheck.allowed && rateCheck.response) return rateCheck.response;

    const user = await getAuthenticatedUser(request);
    if (!user?.id) return unauthorized("Missing or invalid Authorization header.");

    const supabaseAdmin = await getSupabaseAdminClient();
    const historyTable = supabaseAdmin.from("history") as any;

    const { error } = await historyTable.delete().eq("user_id", user.id);

    if (error) {
      context.error("Failed to clear history:", error);
      return {
        status: 500,
        jsonBody: { message: "Failed to clear history.", error: error.message },
      };
    }

    return {
      status: 200,
      jsonBody: { message: "History cleared successfully." },
    };
  } catch (error) {
    context.error("Unexpected error in DELETE /api/history:", error);
    return {
      status: 500,
      jsonBody: { message: "Unexpected server error." },
    };
  }
}

export async function deleteHistoryItem(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user?.id) return unauthorized("Missing or invalid Authorization header.");

    const historyId = request.params.id;
    if (!historyId) {
      return {
        status: 400,
        jsonBody: { message: "History item ID is required." },
      };
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const historyTable = supabaseAdmin.from("history") as any;

    const { data: deletedData, error: deleteError } = await historyTable
      .delete()
      .eq("id", historyId)
      .eq("user_id", user.id)
      .select("id");

    if (deleteError) {
      context.error("Failed to delete history item:", deleteError);
      return {
        status: 500,
        jsonBody: { message: "Failed to delete history item.", error: deleteError.message },
      };
    }

    const deletedItems = (deletedData || []) as { id: string }[];

    if (deletedItems.length === 0) {
      return {
        status: 404,
        jsonBody: { message: "History item not found." },
      };
    }

    return {
      status: 200,
      jsonBody: { message: "History item deleted successfully." },
    };
  } catch (error) {
    context.error("Unexpected error in DELETE /api/history/{id}:", error);
    return {
      status: 500,
      jsonBody: { message: "Unexpected server error." },
    };
  }
}

async function findPlaceBySlug(placeSlug: string): Promise<HistoryPlace | null> {
  const supabaseAdmin = await getSupabaseAdminClient();

  const { data: place, error } = await supabaseAdmin
    .from("places")
    .select("id, slug, name")
    .eq("slug", placeSlug.trim().toLowerCase())
    .maybeSingle();

  if (error || !place) return null;

  return place as HistoryPlace;
}

export async function historyPlaceView(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const rateCheck = await checkEndpointRateLimit(request, "history-place-view", 20, 60);
    if (!rateCheck.allowed && rateCheck.response) return rateCheck.response;

    const user = await getAuthenticatedUser(request);
    if (!user?.id) return unauthorized("Missing or invalid Authorization header.");

    const body = (await request.json()) as { placeSlug?: string };
    const placeSlug = body.placeSlug?.trim();

    if (!placeSlug) {
      return {
        status: 400,
        jsonBody: { message: "placeSlug is required." },
      };
    }

    const place = await findPlaceBySlug(placeSlug);

    if (!place) {
      return {
        status: 404,
        jsonBody: { message: `Place not found for slug: ${placeSlug}` },
      };
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const historyTable = supabaseAdmin.from("history") as any;

    const { data: history, error: historyError } = await historyTable
      .upsert(
        [
          {
            user_id: user.id,
            type: "place_view",
            query: null,
            place_id: place.id,
            created_at: new Date().toISOString(),
          },
        ],
        { onConflict: "user_id,type,place_id" }
      )
      .select("id, user_id, type, query, place_id, created_at")
      .single();

    if (historyError) {
      context.error("Failed to save place view history:", historyError);
      return {
        status: 500,
        jsonBody: { message: "Failed to save place view history.", error: historyError.message },
      };
    }

    return {
      status: 200,
      jsonBody: { message: "Place view saved to history.", history, place },
    };
  } catch (error) {
    context.error("Unexpected error in POST /api/history/place-view:", error);
    return {
      status: 500,
      jsonBody: { message: "Unexpected server error." },
    };
  }
}

app.http("getHistory", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "history",
  handler: getHistory,
});

app.http("deleteHistory", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "history",
  handler: deleteHistory,
});

app.http("deleteHistoryItem", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "history/{id}",
  handler: deleteHistoryItem,
});

app.http("historyPlaceView", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "history/place-view",
  handler: historyPlaceView,
});
