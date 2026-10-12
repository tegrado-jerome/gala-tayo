import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { AuthenticatedUser, validateJwt } from "../utils/auth";
import { checkEndpointRateLimit, checkRedisRateLimit, getClientIp } from "../utils/redisRateLimit";

type FeedbackRequestBody = {
  rating?: unknown;
  comment?: unknown;
  website?: unknown;
};

const DAILY_FEEDBACK_LIMIT = 3;
const COMMENT_MAX_LENGTH = 500;
// Guests have no account to count against, so their daily cap is per IP, sized for many phones behind one CGNAT address.
const GUEST_DAILY_FEEDBACK_LIMIT_PER_IP = 10;

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

function badRequest(message: string) {
  return { response: { status: 400, jsonBody: { message } } };
}

/** Validates a feedback body. `spam` means the hidden honeypot field was filled. */
export function readFeedback(
  body: unknown
): { rating: number; comment: string | null } | { spam: true } | { response: HttpResponseInit } {
  if (!body || typeof body !== "object") return badRequest("Invalid JSON body.");
  const { rating, comment, website } = body as FeedbackRequestBody;

  // "website" is a hidden form field people never see; bots that fill every field get a fake success.
  if (website !== undefined && website !== null && website !== "") return { spam: true };

  if (rating === undefined || rating === null) return badRequest("Rating is required.");
  if (typeof rating !== "number" || !Number.isInteger(rating)) return badRequest("Rating must be a whole number.");
  if (rating < 1 || rating > 5) return badRequest("Rating must be between 1 and 5.");
  if (comment !== undefined && comment !== null && typeof comment !== "string") return badRequest("Comment must be a string.");

  const cleanComment = typeof comment === "string" ? comment.trim() || null : null;
  if (cleanComment && cleanComment.length > COMMENT_MAX_LENGTH) {
    return badRequest(`Comment must be ${COMMENT_MAX_LENGTH} characters or less.`);
  }

  return { rating, comment: cleanComment };
}

export async function createFeedback(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const rateCheck = await checkEndpointRateLimit(request, "feedback-create", 5, 10 * 60);
    if (!rateCheck.allowed && rateCheck.response) return rateCheck.response;

    // Guests may send feedback too; an expired or bad token is treated as a guest rather than refused.
    const user = await getAuthenticatedUser(request);

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return {
        status: 400,
        jsonBody: {
          message: "Invalid JSON body.",
        },
      };
    }

    const feedback = readFeedback(body);
    if ("response" in feedback) return feedback.response;
    if ("spam" in feedback) return { status: 201, jsonBody: { message: "Feedback submitted successfully." } };
    const { rating, comment: cleanComment } = feedback;

    const supabaseAdmin = await getSupabaseAdminClient();
    const feedbackTable = supabaseAdmin.from("feedback") as any;
    let underDailyLimit: boolean;

    if (user?.id) {
      const feedbackWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: recentFeedbackCount, error: countError } = await feedbackTable
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", feedbackWindowStart);

      if (countError) {
        context.error("Failed to check feedback limit:", countError);

        return {
          status: 500,
          jsonBody: {
            message: "Failed to check feedback limit.",
          },
        };
      }

      underDailyLimit = (recentFeedbackCount ?? 0) < DAILY_FEEDBACK_LIMIT;
    } else {
      const guestLimit = await checkRedisRateLimit(`feedback-guest-ip:${getClientIp(request)}`, GUEST_DAILY_FEEDBACK_LIMIT_PER_IP, 24 * 60 * 60);
      underDailyLimit = guestLimit.allowed;
    }

    if (!underDailyLimit) {
      return {
        status: 429,
        jsonBody: {
          message: "Daily feedback limit reached. Please try again tomorrow.",
        },
      };
    }

    const { data, error } = await feedbackTable
      .insert({
        user_id: user?.id ?? null,
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
