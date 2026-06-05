import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { AuthenticatedUser, validateJwt } from "../utils/auth";

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
  google_maps_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type PlaceRow = {
  id: string;
  name: string;
  slug: string;
  category?: string | null;
  address?: string | null;
  city?: string | null;
  area?: string | null;
  google_maps_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type FavoritePlaceIdentifier = {
  value: string;
  source: "placeSlug" | "placeId";
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const FAVORITE_PLACE_COLUMNS =
  "id, slug, name, category, address, city, area, google_maps_url, latitude, longitude";

function unauthorized(message: string): HttpResponseInit {
  return {
    status: 401,
    jsonBody: {
      message,
    },
  };
}

async function getAuthenticatedUser(request: HttpRequest): Promise<AuthenticatedUser | null> {
  const authHeader = request.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  try {
    return await validateJwt(request);
  } catch {
    return null;
  }
}

function getTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function readFavoritePlaceIdentifier(
  request: HttpRequest,
  fallbackPlaceSlug?: string
): Promise<FavoritePlaceIdentifier | null> {
  const routePlaceSlug = getTrimmedString(fallbackPlaceSlug);

  if (routePlaceSlug) {
    return {
      value: routePlaceSlug,
      source: "placeSlug",
    };
  }

  const body = await request.json().catch(() => null) as {
    placeSlug?: unknown;
    placeId?: unknown;
  } | null;
  const placeSlug = getTrimmedString(body?.placeSlug);

  if (placeSlug) {
    return {
      value: placeSlug,
      source: "placeSlug",
    };
  }

  const placeId = getTrimmedString(body?.placeId);

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
  const supabaseAdmin = await getSupabaseAdminClient();
  const normalizedIdentifier = identifier.value.toLowerCase();

  if (identifier.source === "placeSlug" || !UUID_PATTERN.test(identifier.value)) {
    const { data: slugPlaceData, error: slugPlaceError } = await supabaseAdmin
      .from("places")
      .select(FAVORITE_PLACE_COLUMNS)
      .eq("slug", normalizedIdentifier)
      .maybeSingle();

    if (slugPlaceError || !slugPlaceData) {
      logFavoriteLookupFailure(context, identifier, "slug", slugPlaceError, slugPlaceData);
      return null;
    }

    return slugPlaceData as FavoritePlace;
  }

  const { data: idPlaceData, error: idPlaceError } = await supabaseAdmin
    .from("places")
    .select(FAVORITE_PLACE_COLUMNS)
    .eq("id", identifier.value)
    .maybeSingle();

  if (idPlaceError || !idPlaceData) {
    logFavoriteLookupFailure(context, identifier, "id", idPlaceError, idPlaceData);
    return null;
  }

  return idPlaceData as FavoritePlace;
}

async function getUserFavorites(userId: string): Promise<{ favorites: Array<Favorite & { place: FavoritePlace | null }>; error: unknown }> {
  const supabaseAdmin = await getSupabaseAdminClient();
  const favoritesTable = supabaseAdmin.from("favorites") as any;

  const { data: favorites, error: favoritesError } = await favoritesTable
    .select("id, user_id, place_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

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

  const { data: places, error: placesError } = await supabaseAdmin
    .from("places")
    .select(FAVORITE_PLACE_COLUMNS)
    .in("id", uniquePlaceIds);

  if (placesError) {
    return {
      favorites: [],
      error: placesError,
    };
  }

  const placeRows = (places || []) as PlaceRow[];
  const placeMap = new Map(placeRows.map((place) => [place.id, place]));
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

app.http("favoritesDelete", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "favorites/{placeSlug}",
  handler: favoritesDelete,
});

app.http("favoritesDeleteByBody", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "favorites",
  handler: favoritesDelete,
});
