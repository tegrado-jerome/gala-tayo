import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { AuthenticatedUser, validateJwt } from "../utils/auth";

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

export async function getHistory(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user?.id) {
      return unauthorized("Missing or invalid Authorization header.");
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const historyTable = supabaseAdmin.from("history") as any;

    const { data, error } = await historyTable
      .select(
        `
        id,
        type,
        query,
        place_id,
        created_at,
        place:places (
          id,
          slug,
          name,
          category,
          city,
          address,
          photo_url,
          photos
        )
      `
      )
      .eq("user_id", user.id)
      .eq("type", "place_view")
      .order("created_at", { ascending: false });

    if (error) {
      context.error("Failed to fetch history:", error);

      return {
        status: 500,
        jsonBody: {
          message: "Failed to fetch history.",
          error: error.message,
        },
      };
    }

    return {
      status: 200,
      jsonBody: {
        history: data ?? [],
      },
    };
  } catch (error) {
    context.error("Unexpected error in GET /api/history:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Unexpected server error.",
      },
    };
  }
}

app.http("getHistory", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "history",
  handler: getHistory,
});
