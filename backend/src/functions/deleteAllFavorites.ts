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

export async function deleteAllFavorites(
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

app.http("deleteAllFavorites", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "favorites/all",
  handler: deleteAllFavorites,
});
