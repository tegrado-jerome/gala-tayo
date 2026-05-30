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
};

type PlaceRow = {
  id: string;
  name: string;
  slug: string;
  category?: string | null;
  address?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  rating?: number | null;
  photo_url?: string | null;
  photos?: string[] | null;
};

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

async function findPlaceBySlug(placeSlug: string): Promise<FavoritePlace | null> {
  const supabaseAdmin = await getSupabaseAdminClient();

  const { data: placeData, error: placeError } = await supabaseAdmin
    .from("places")
    .select("id, name, slug")
    .eq("slug", placeSlug)
    .single();

  if (placeError || !placeData) {
    return null;
  }

  return placeData as FavoritePlace;
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

    const supabaseAdmin = await getSupabaseAdminClient();
    const favoritesTable = supabaseAdmin.from("favorites") as any;

    const { data: favorites, error: favoritesError } = await favoritesTable
      .select("id, user_id, place_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (favoritesError) {
      context.error("Failed to fetch favorites:", favoritesError);

      return {
        status: 500,
        jsonBody: {
          message: "Failed to fetch favorites.",
        },
      };
    }

    const favoriteRows = (favorites || []) as Favorite[];

    if (favoriteRows.length === 0) {
      return {
        status: 200,
        jsonBody: {
          favorites: [],
        },
      };
    }

    const placeIds = favoriteRows.map((favorite) => favorite.place_id);

    const { data: places, error: placesError } = await supabaseAdmin
      .from("places")
      .select(
        "id, name, slug, category, address, city, latitude, longitude, rating, photo_url, photos"
      )
      .in("id", placeIds);

    if (placesError) {
      context.error("Failed to fetch favorite places:", placesError);

      return {
        status: 500,
        jsonBody: {
          message: "Failed to fetch favorite places.",
        },
      };
    }

    const placeRows = (places || []) as PlaceRow[];
    const placeMap = new Map(placeRows.map((place) => [place.id, place]));

    const responseFavorites = favoriteRows.map((favorite) => ({
      id: favorite.id,
      created_at: favorite.created_at,
      place: placeMap.get(favorite.place_id) || null,
    }));

    return {
      status: 200,
      jsonBody: {
        favorites: responseFavorites,
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

    const body = (await request.json()) as {
      placeSlug?: string;
      placeId?: string;
    };

    const placeSlug = body.placeSlug || body.placeId;

    if (!placeSlug) {
      return {
        status: 400,
        jsonBody: {
          message: "placeSlug is required.",
        },
      };
    }

    const place = await findPlaceBySlug(placeSlug);

    if (!place) {
      return {
        status: 404,
        jsonBody: {
          message: `Place not found for slug: ${placeSlug}`,
        },
      };
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const favoritesTable = supabaseAdmin.from("favorites") as any;

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
        return {
          status: 200,
          jsonBody: {
            message: "Place already saved to favorites.",
            place,
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

    return {
      status: 201,
      jsonBody: {
        message: "Place saved to favorites.",
        favorite,
        place,
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

    const placeSlug = request.params.placeSlug;

    if (!placeSlug) {
      return {
        status: 400,
        jsonBody: {
          message: "placeSlug is required.",
        },
      };
    }

    const place = await findPlaceBySlug(placeSlug);

    if (!place) {
      return {
        status: 404,
        jsonBody: {
          message: `Place not found for slug: ${placeSlug}`,
        },
      };
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const favoritesTable = supabaseAdmin.from("favorites") as any;

    const { data: deletedFavoriteData, error: deleteError } = await favoritesTable
      .delete()
      .eq("user_id", user.id)
      .eq("place_id", place.id)
      .select("id, user_id, place_id, created_at")
      .maybeSingle();
    const deletedFavorite = deletedFavoriteData as Favorite | null;

    if (deleteError) {
      context.error("Failed to delete favorite:", deleteError);

      return {
        status: 500,
        jsonBody: {
          message: "Failed to remove place from favorites.",
        },
      };
    }

    if (!deletedFavorite) {
      return {
        status: 200,
        jsonBody: {
          message: "Place was not saved in favorites.",
          place,
        },
      };
    }

    return {
      status: 200,
      jsonBody: {
        message: "Place removed from favorites.",
        favorite: deletedFavorite,
        place,
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
