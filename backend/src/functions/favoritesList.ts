import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { validateJwt } from "../utils/auth";

type FavoriteRow = {
  id: string;
  user_id: string;
  place_id: string;
  created_at: string;
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

export async function favoritesList(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        status: 401,
        jsonBody: {
          message: "Missing or invalid Authorization header.",
        },
      };
    }

    const user = await validateJwt(request);

    if (!user?.id) {
      return {
        status: 401,
        jsonBody: {
          message: "Invalid or expired token.",
        },
      };
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

    const favoriteRows = (favorites || []) as FavoriteRow[];

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

app.http("favoritesList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "favorites",
  handler: favoritesList,
});
