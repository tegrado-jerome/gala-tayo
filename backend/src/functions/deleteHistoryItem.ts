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

export async function deleteHistoryItem(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user?.id) {
      return unauthorized("Missing or invalid Authorization header.");
    }

    const historyId = request.params.id;

    if (!historyId) {
      return {
        status: 400,
        jsonBody: {
          message: "History item ID is required.",
        },
      };
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const historyTable = supabaseAdmin.from("history") as any;

    const { data: deletedData, error: deleteError } = await historyTable
      .delete()
      .eq("id", historyId)
      .eq("user_id", user.id)
      .select("id");

    if (deleteError) {
      context.error("Failed to delete history item:", deleteError);

      return {
        status: 500,
        jsonBody: {
          message: "Failed to delete history item.",
          error: deleteError.message,
        },
      };
    }

    const deletedItems = (deletedData || []) as { id: string }[];

    if (deletedItems.length === 0) {
      return {
        status: 404,
        jsonBody: {
          message: "History item not found.",
        },
      };
    }

    return {
      status: 200,
      jsonBody: {
        message: "History item deleted successfully.",
      },
    };
  } catch (error) {
    context.error("Unexpected error in DELETE /api/history/{id}:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Unexpected server error.",
      },
    };
  }
}

app.http("deleteHistoryItem", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "history/{id}",
  handler: deleteHistoryItem,
});
