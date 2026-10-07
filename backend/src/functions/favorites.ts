import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { findPlaceDetailByIdOrSlug, findPlaceDetailsByIds } from "../data/placeDetails";
import { getAuthenticatedUser, unauthorized, type AuthenticatedUser, validateJwt } from "../utils/auth";
import { checkEndpointRateLimit, checkPublicReadRateLimit } from "../utils/redisRateLimit";

type Favorite = {
  id: string;
  user_id: string;
  place_id: string;
  created_at: string;
};

type FavoritePlace = {
  id: string;
  name: string | null;
  slug: string | null;
  category?: string | null;
  address?: string | null;
  city?: string | null;
  area?: string | null;
  budget_label?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  budget_notes?: string | null;
  is_free?: boolean | null;
  google_maps_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  photo_url?: string | null;
  photos?: string[] | null;
};

type FavoritePlaceIdentifier = {
  value: string;
  source: "placeSlug" | "placeId";
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;


function getTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function readFavoritePlaceIdentifier(
  request: HttpRequest,
  fallbackPlaceIdentifier?: string
): Promise<FavoritePlaceIdentifier | null> {
  const routePlaceIdentifier = getTrimmedString(fallbackPlaceIdentifier);

  if (routePlaceIdentifier) {
    return {
      value: routePlaceIdentifier,
      source: UUID_PATTERN.test(routePlaceIdentifier) ? "placeId" : "placeSlug",
    };
  }

  const body = await request.json().catch(() => null) as {
    placeSlug?: unknown;
    placeId?: unknown;
  } | null;
  const placeId = getTrimmedString(body?.placeId);

  if (placeId && UUID_PATTERN.test(placeId)) {
    return {
      value: placeId,
      source: "placeId",
    };
  }

  const placeSlug = getTrimmedString(body?.placeSlug);

  if (placeSlug) {
    return {
      value: placeSlug,
      source: "placeSlug",
    };
  }

  if (placeId) {
    return {
      value: placeId,
      source: "placeId",
    };
  }

  return null;
}

function logFavoriteLookupFailure(
  context: InvocationContext,
  identifier: FavoritePlaceIdentifier,
  lookupMode: "slug" | "id",
  error: unknown,
  data: unknown
) {
  const supabaseError = error as {
    code?: string;
    message?: string;
    details?: string;
  } | null;

  context.warn("Favorites place lookup did not resolve a place.", {
    receivedPlaceSlug: identifier.source === "placeSlug" ? identifier.value : null,
    receivedPlaceId: identifier.source === "placeId" ? identifier.value : null,
    lookupMode,
    supabaseErrorCode: supabaseError?.code ?? null,
    supabaseErrorMessage: supabaseError?.message ?? null,
    supabaseErrorDetails: supabaseError?.details ?? null,
    dataIsNull: data === null,
  });
}

async function findPlaceForFavorite(
  identifier: FavoritePlaceIdentifier,
  context: InvocationContext
): Promise<FavoritePlace | null> {
  const detail = await findPlaceDetailByIdOrSlug(identifier.value);

  if (!detail) {
    logFavoriteLookupFailure(
      context,
      identifier,
      identifier.source === "placeSlug" || !UUID_PATTERN.test(identifier.value) ? "slug" : "id",
      null,
      null
    );
    return null;
  }

  return {
    id: detail.id,
    name: detail.name,
    slug: detail.slug,
    category: detail.category,
    address: detail.address ?? null,
    city: detail.city ?? null,
    area: detail.area ?? null,
    budget_label: detail.budget_note ?? null,
    budget_notes: detail.budget_note ?? null,
    google_maps_url: detail.google_maps_url ?? null,
    latitude: detail.latitude ?? null,
    longitude: detail.longitude ?? null,
    photo_url: detail.imageUrl || null,
    photos: detail.curatedImageUrls ?? [],
  };
}

async function getUserFavorites(userId: string): Promise<{ favorites: Array<Favorite & { place: FavoritePlace | null }>; error: unknown }> {
  const supabaseAdmin = await getSupabaseAdminClient();
  const favoritesTable = supabaseAdmin.from("favorites") as any;

  const { data: favorites, error: favoritesError } = await favoritesTable
      .select("id, user_id, place_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (favoritesError) {
    return {
      favorites: [],
      error: favoritesError,
    };
  }

  const favoriteRows = (favorites || []) as Favorite[];

  if (favoriteRows.length === 0) {
    return {
      favorites: [],
      error: null,
    };
  }

  const uniquePlaceIds = Array.from(new Set(favoriteRows.map((favorite) => favorite.place_id)));
  const placeDetailsById = await findPlaceDetailsByIds(uniquePlaceIds);
  const placeMap = new Map<string, FavoritePlace | null>(
    uniquePlaceIds.map((placeId) => {
      const detail = placeDetailsById.get(placeId);

      if (!detail) {
        return [placeId, null] as const;
      }

      return [
        placeId,
        {
          id: detail.id,
          name: detail.name,
          slug: detail.slug,
          category: detail.category,
          address: detail.address ?? null,
          city: detail.city ?? null,
          area: detail.area ?? null,
          budget_label: detail.budget_note ?? null,
          budget_notes: detail.budget_note ?? null,
          google_maps_url: detail.google_maps_url ?? null,
          latitude: detail.latitude ?? null,
          longitude: detail.longitude ?? null,
          photo_url: detail.imageUrl || null,
          photos: detail.curatedImageUrls ?? [],
        } satisfies FavoritePlace,
      ] as const;
    })
  );
  const seenPlaceIds = new Set<string>();

  return {
    favorites: favoriteRows
      .filter((favorite) => {
        if (seenPlaceIds.has(favorite.place_id)) {
          return false;
        }

        seenPlaceIds.add(favorite.place_id);
        return true;
      })
      .map((favorite) => ({
        ...favorite,
        place: placeMap.get(favorite.place_id) || null,
      })),
    error: null,
  };
}

export async function favoritesList(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const rateCheck = await checkPublicReadRateLimit(request, "favorites-list", 30, 60);
    if (!rateCheck.allowed && rateCheck.response) return rateCheck.response;

    const user = await getAuthenticatedUser(request);

    if (!user?.id) {
      return unauthorized("Missing or invalid Authorization header.");
    }

    const { favorites, error } = await getUserFavorites(user.id);

    if (error) {
      context.error("Failed to fetch favorites:", error);
      return {
        status: 500,
        jsonBody: {
          message: "Failed to fetch favorites.",
        },
      };
    }

    return {
      status: 200,
      jsonBody: {
        favorites,
      },
    };
  } catch (error) {
    context.error("Unexpected error fetching favorites:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Unexpected server error.",
      },
    };
  }
}

export async function favoritesCreate(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const rateCheck = await checkEndpointRateLimit(request, "favorites-create", 20, 60);
    if (!rateCheck.allowed && rateCheck.response) return rateCheck.response;

    const user = await getAuthenticatedUser(request);

    if (!user?.id) {
      return unauthorized("Missing or invalid Authorization header.");
    }

    const identifier = await readFavoritePlaceIdentifier(request);

    if (!identifier) {
      return {
        status: 400,
        jsonBody: {
          message: "placeSlug or placeId is required.",
        },
      };
    }

    const place = await findPlaceForFavorite(identifier, context);

    if (!place) {
      return {
        status: 404,
        jsonBody: {
          message: `Place not found for ${identifier.source}: ${identifier.value}`,
        },
      };
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const favoritesTable = supabaseAdmin.from("favorites") as any;

    const { data: existingFavoriteData, error: existingFavoriteError } = await favoritesTable
      .select("id, user_id, place_id, created_at")
      .eq("user_id", user.id)
      .eq("place_id", place.id)
      .order("created_at", { ascending: false });

    if (existingFavoriteError) {
      context.error("Failed to check existing favorite:", existingFavoriteError);

      return {
        status: 500,
        jsonBody: {
          message: "Failed to save place to favorites.",
        },
      };
    }

    const existingFavorites = (existingFavoriteData || []) as Favorite[];

    if (existingFavorites.length > 0) {
      const duplicateFavoriteIds = existingFavorites.slice(1).map((favorite) => favorite.id);

      if (duplicateFavoriteIds.length > 0) {
        const { error: duplicateDeleteError } = await favoritesTable
          .delete()
          .eq("user_id", user.id)
          .in("id", duplicateFavoriteIds);

        if (duplicateDeleteError) {
          context.error("Failed to remove duplicate favorites:", duplicateDeleteError);
        }
      }

      const { favorites, error } = await getUserFavorites(user.id);

      if (error) {
        context.error("Failed to refresh favorites after duplicate save:", error);
      }

      return {
        status: 200,
        jsonBody: {
          message: "Place already saved to favorites.",
          favorite: existingFavorites[0],
          place,
          favorites: error ? undefined : favorites,
        },
      };
    }

    const { data: favoriteData, error: favoriteError } = await favoritesTable
      .insert([
        {
          user_id: user.id,
          place_id: place.id,
        },
      ])
      .select("id, user_id, place_id, created_at")
      .single();
    const favorite = favoriteData as Favorite | null;

    if (favoriteError) {
      if (favoriteError.code === "23505") {
        const { favorites, error } = await getUserFavorites(user.id);

        if (error) {
          context.error("Failed to refresh favorites after duplicate save:", error);
        }

        return {
          status: 200,
          jsonBody: {
            message: "Place already saved to favorites.",
            place,
            favorites: error ? undefined : favorites,
          },
        };
      }

      context.error("Failed to save favorite:", favoriteError);

      return {
        status: 500,
        jsonBody: {
          message: "Failed to save place to favorites.",
        },
      };
    }

    const { favorites, error } = await getUserFavorites(user.id);

    if (error) {
      context.error("Failed to refresh favorites after save:", error);
    }

    return {
      status: 201,
      jsonBody: {
        message: "Place saved to favorites.",
        favorite,
        place,
        favorites: error ? undefined : favorites,
      },
    };
  } catch (error) {
    context.error("Unexpected error saving favorite:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Unexpected server error.",
      },
    };
  }
}

export async function favoritesDelete(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const rateCheck = await checkEndpointRateLimit(request, "favorites-delete", 20, 60);
    if (!rateCheck.allowed && rateCheck.response) return rateCheck.response;

    const user = await getAuthenticatedUser(request);

    if (!user?.id) {
      return unauthorized("Missing or invalid Authorization header.");
    }

    const identifier = await readFavoritePlaceIdentifier(request, request.params.placeSlug);

    if (!identifier) {
      return {
        status: 400,
        jsonBody: {
          message: "placeSlug or placeId is required.",
        },
      };
    }

    const place = await findPlaceForFavorite(identifier, context);

    if (!place) {
      return {
        status: 404,
        jsonBody: {
          message: `Place not found for ${identifier.source}: ${identifier.value}`,
        },
      };
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const favoritesTable = supabaseAdmin.from("favorites") as any;

    const { data: deletedFavoriteData, error: deleteError } = await favoritesTable
      .delete()
      .eq("user_id", user.id)
      .eq("place_id", place.id)
      .select("id, user_id, place_id, created_at");
    const deletedFavorites = (deletedFavoriteData || []) as Favorite[];

    if (deleteError) {
      context.error("Failed to delete favorite:", deleteError);

      return {
        status: 500,
        jsonBody: {
          message: "Failed to remove place from favorites.",
        },
      };
    }

    const { favorites, error } = await getUserFavorites(user.id);

    if (error) {
      context.error("Failed to refresh favorites after remove:", error);
    }

    if (deletedFavorites.length === 0) {
      return {
        status: 200,
        jsonBody: {
          message: "Place was not saved in favorites.",
          place,
          favorites: error ? undefined : favorites,
        },
      };
    }

    return {
      status: 200,
      jsonBody: {
        message: "Place removed from favorites.",
        favorite: deletedFavorites[0],
        place,
        favorites: error ? undefined : favorites,
      },
    };
  } catch (error) {
    context.error("Unexpected error deleting favorite:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Unexpected server error.",
      },
    };
  }
}

export async function favoritesDeleteAll(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const rateCheck = await checkEndpointRateLimit(request, "favorites-delete-all", 5, 60);
    if (!rateCheck.allowed && rateCheck.response) return rateCheck.response;

    const user = await getAuthenticatedUser(request);

    if (!user?.id) {
      return unauthorized("Missing or invalid Authorization header.");
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const favoritesTable = supabaseAdmin.from("favorites") as any;

    const { error } = await favoritesTable.delete().eq("user_id", user.id);

    if (error) {
      context.error("Failed to clear favorites:", error);

      return {
        status: 500,
        jsonBody: {
          message: "Failed to clear favorites.",
          error: error.message,
        },
      };
    }

    return {
      status: 200,
      jsonBody: {
        message: "All favorites cleared successfully.",
      },
    };
  } catch (error) {
    context.error("Unexpected error in DELETE /api/favorites/all:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Unexpected server error.",
      },
    };
  }
}

app.http("favoritesList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "favorites",
  handler: favoritesList,
});

app.http("favoritesCreate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "favorites",
  handler: favoritesCreate,
});

app.http("favoritesDeleteAll", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "favorites",
  handler: favoritesDeleteAll,
});

app.http("favoritesDelete", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "favorites/{placeSlug}",
  handler: favoritesDelete,
});
