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

export async function deleteHistory(
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

    const { error } = await historyTable.delete().eq("user_id", user.id);

    if (error) {
      context.error("Failed to clear history:", error);

      return {
        status: 500,
        jsonBody: {
          message: "Failed to clear history.",
          error: error.message,
        },
      };
    }

    return {
      status: 200,
      jsonBody: {
        message: "History cleared successfully.",
      },
    };
  } catch (error) {
    context.error("Unexpected error in DELETE /api/history:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Unexpected server error.",
      },
    };
  }
}

app.http("deleteHistory", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "history",
  handler: deleteHistory,
});
