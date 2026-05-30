import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { validateJwt } from "../utils/auth";

type FavoritePlace = {
  id: string;
  name: string | null;
  slug: string | null;
};

type Favorite = {
  id: string;
  user_id: string;
  place_id: string;
  created_at: string;
};

export async function favoritesDelete(
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

    let user;

    try {
      user = await validateJwt(request);
    } catch {
      return {
        status: 401,
        jsonBody: {
          message: "Invalid or expired token.",
        },
      };
    }

    if (!user?.id) {
      return {
        status: 401,
        jsonBody: {
          message: "Invalid or expired token.",
        },
      };
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

    const supabaseAdmin = await getSupabaseAdminClient();

    const { data: placeData, error: placeError } = await supabaseAdmin
      .from("places")
      .select("id, name, slug")
      .eq("slug", placeSlug)
      .single();
    const place = placeData as FavoritePlace | null;

    if (placeError || !place) {
      return {
        status: 404,
        jsonBody: {
          message: `Place not found for slug: ${placeSlug}`,
        },
      };
    }

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

app.http("favoritesDelete", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "favorites/{placeSlug}",
  handler: favoritesDelete,
});
