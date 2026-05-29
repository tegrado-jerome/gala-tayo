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

export async function favoritesCreate(
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

    // The shared Supabase client is intentionally untyped in this repo.
    // Keep the escape hatch local to this table insert.
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

app.http("favoritesCreate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "favorites",
  handler: favoritesCreate,
});
