import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { AuthenticatedUser, validateJwt } from "../utils/auth";

type FeedbackRequestBody = {
  rating?: number;
  comment?: string;
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

export async function createFeedback(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user?.id) {
      return unauthorized("Missing or invalid Authorization header.");
    }

    let body: FeedbackRequestBody;

    try {
      body = (await request.json()) as FeedbackRequestBody;
    } catch {
      return {
        status: 400,
        jsonBody: {
          message: "Invalid JSON body.",
        },
      };
    }

    const { rating, comment } = body;

    if (rating === undefined || rating === null) {
      return {
        status: 400,
        jsonBody: {
          message: "Rating is required.",
        },
      };
    }

    if (typeof rating !== "number" || !Number.isInteger(rating)) {
      return {
        status: 400,
        jsonBody: {
          message: "Rating must be a whole number.",
        },
      };
    }

    if (rating < 1 || rating > 5) {
      return {
        status: 400,
        jsonBody: {
          message: "Rating must be between 1 and 5.",
        },
      };
    }

    if (comment !== undefined && typeof comment !== "string") {
      return {
        status: 400,
        jsonBody: {
          message: "Comment must be a string.",
        },
      };
    }

    const cleanComment = comment?.trim() || null;
    const supabaseAdmin = await getSupabaseAdminClient();
    const feedbackTable = supabaseAdmin.from("feedback") as any;

    const { data, error } = await feedbackTable
      .insert({
        user_id: user.id,
        rating,
        comment: cleanComment,
      })
      .select("id, user_id, rating, comment, created_at")
      .single();

    if (error) {
      context.error("Failed to submit feedback:", error);

      return {
        status: 500,
        jsonBody: {
          message: "Failed to submit feedback.",
          error: error.message,
        },
      };
    }

    return {
      status: 201,
      jsonBody: {
        message: "Feedback submitted successfully.",
        feedback: data,
      },
    };
  } catch (error) {
    context.error("Unexpected error in POST /api/feedback:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Unexpected server error.",
      },
    };
  }
}

app.http("createFeedback", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "feedback",
  handler: createFeedback,
});
