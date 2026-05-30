import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { AuthenticatedUser, validateJwt } from "../utils/auth";

type HistoryPlace = {
  id: string;
  slug: string | null;
  name: string | null;
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

async function findPlaceBySlug(placeSlug: string): Promise<HistoryPlace | null> {
  const supabaseAdmin = await getSupabaseAdminClient();

  const { data: place, error } = await supabaseAdmin
    .from("places")
    .select("id, slug, name")
    .eq("slug", placeSlug)
    .single();

  if (error || !place) {
    return null;
  }

  return place as HistoryPlace;
}

export async function historyPlaceView(
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
    };

    const placeSlug = body.placeSlug?.trim();

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
        {
          onConflict: "user_id,type,place_id",
        }
      )
      .select("id, user_id, type, query, place_id, created_at")
      .single();

    if (historyError) {
      context.error("Failed to save place view history:", historyError);

      return {
        status: 500,
        jsonBody: {
          message: "Failed to save place view history.",
          error: historyError.message,
        },
      };
    }

    return {
      status: 200,
      jsonBody: {
        message: "Place view saved to history.",
        history,
        place,
      },
    };
  } catch (error) {
    context.error("Unexpected error in POST /api/history/place-view:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Unexpected server error.",
      },
    };
  }
}

app.http("historyPlaceView", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "history/place-view",
  handler: historyPlaceView,
});
