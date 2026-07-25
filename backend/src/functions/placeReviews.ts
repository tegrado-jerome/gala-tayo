import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { invalidatePlaceDetailCache } from "../data/placeDetails";
import { AuthenticatedUser, getAuthenticatedUser, unauthorized, badRequest, validateJwt } from "../utils/auth";
import { getPlaceIdentifier, isPlaceUuid, resolvePlaceId } from "../utils/placeIdentity";
import { checkEndpointRateLimit } from "../utils/redisRateLimit";

type PlaceReview = {
  id: string;
  place_id: string;
  submitted_by: string;
  member_display_name?: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

type ReviewAuthorProfileRow = {
  user_id: string;
  username: string | null;
  display_name: string | null;
};

type ReviewRequestBody = {
  placeId?: unknown;
  rating?: unknown;
  comment?: unknown;
};

const REVIEW_COLUMNS = "id, place_id, submitted_by, rating, comment, created_at, updated_at";
const COMMENT_MAX_LENGTH = 1000;

function logDatabaseError(context: InvocationContext, message: string, error: unknown) {
  context.error(message, error);

  if (process.env.NODE_ENV !== "production") {
    console.error(message, error);
  }
}

function normalizeAverage(reviews: PlaceReview[]) {
  if (reviews.length === 0) {
    return null;
  }

  const total = reviews.reduce((sum, review) => sum + review.rating, 0);
  return Math.round((total / reviews.length) * 10) / 10;
}

function validateRating(rating: unknown): number | null {
  if (typeof rating !== "number" || !Number.isInteger(rating)) {
    return null;
  }

  return rating >= 1 && rating <= 5 ? rating : null;
}

async function enrichReviewsWithDisplayNames(reviews: PlaceReview[]): Promise<PlaceReview[]> {
  if (reviews.length === 0) {
    return reviews;
  }

  try {
    const supabaseAdmin = await getSupabaseAdminClient();
    const uniqueMemberIds = Array.from(new Set(reviews.map((review) => review.submitted_by)));
    const displayNameByMemberId = new Map<string, string>();

    const { data, error } = await (supabaseAdmin.from("profiles") as any)
      .select("user_id, username, display_name")
      .in("user_id", uniqueMemberIds);

    if (error) {
      throw error;
    }

    ((data || []) as ReviewAuthorProfileRow[]).forEach((profile) => {
      const displayName = profile.display_name || profile.username;

      if (displayName?.trim()) {
        displayNameByMemberId.set(profile.user_id, displayName.trim());
      }
    });

    return reviews.map((review) => ({
      ...review,
      member_display_name: displayNameByMemberId.get(review.submitted_by) || null,
    }));
  } catch {
    return reviews;
  }
}

export async function placeReviewsList(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const rateCheck = await checkEndpointRateLimit(request, "place-reviews", 30, 60);
    if (!rateCheck.allowed && rateCheck.response) {
      return rateCheck.response;
    }

    const placeIdentifier = getPlaceIdentifier(request);

    if (!placeIdentifier) {
      return {
        status: 400,
        jsonBody: {
          message: "Place id is required.",
        },
      };
    }

    const user = await getAuthenticatedUser(request);
    const placeId = await resolvePlaceId(placeIdentifier);

    if (!placeId) {
      return {
        status: 404,
        jsonBody: {
          message: "Place not found.",
        },
      };
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const reviewsTable = supabaseAdmin.from("place_reviews") as any;

    const { data, error } = await reviewsTable
      .select(REVIEW_COLUMNS)
      .eq("place_id", placeId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      context.error("Failed to fetch place reviews:", error);

      return {
        status: 500,
        jsonBody: {
          message: "Failed to fetch place reviews.",
        },
      };
    }

    const reviews = await enrichReviewsWithDisplayNames((data || []) as PlaceReview[]);
    const currentMemberReview = user?.id
      ? reviews.find((review) => review.submitted_by === user.id) || null
      : null;

    return {
      status: 200,
      jsonBody: {
        reviews,
        average_rating: normalizeAverage(reviews),
        review_count: reviews.length,
        current_member_review: currentMemberReview,
      },
    };
  } catch (error) {
    context.error("Unexpected error in GET /api/places/{id}/reviews:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Unexpected server error.",
      },
    };
  }
}

export async function placeReviewsUpsert(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const rateCheck = await checkEndpointRateLimit(request, "place-reviews-upsert", 10, 60);
    if (!rateCheck.allowed && rateCheck.response) return rateCheck.response;

    const placeIdentifier = getPlaceIdentifier(request);

    if (!placeIdentifier) {
      return {
        status: 400,
        jsonBody: {
          message: "Place id is required.",
        },
      };
    }

    const user = await getAuthenticatedUser(request);

    if (!user?.id) {
      return unauthorized("Missing or invalid Authorization header.");
    }

    let body: ReviewRequestBody;

    try {
      body = (await request.json()) as ReviewRequestBody;
    } catch {
      return {
        status: 400,
        jsonBody: {
          message: "Invalid JSON body.",
        },
      };
    }

    if (!isPlaceUuid(body.placeId)) {
      return badRequest("placeId must be a valid place UUID.");
    }

    if (placeIdentifier !== body.placeId.trim()) {
      return badRequest("Route place id must match body placeId.");
    }

    const placeId = await resolvePlaceId(body.placeId);

    if (!placeId) {
      return {
        status: 404,
        jsonBody: {
          message: "Place not found.",
        },
      };
    }

    const rating = validateRating(body.rating);

    if (!rating) {
      return badRequest("rating must be 1, 2, 3, 4, or 5.");
    }

    if (body.comment !== undefined && body.comment !== null && typeof body.comment !== "string") {
      return badRequest("comment must be a string.");
    }

    const stripHtml = (value: string): string => value.replace(/<[^>]*>/g, "");
    const cleanComment = typeof body.comment === "string" ? stripHtml(body.comment).trim() || null : null;

    if (cleanComment && cleanComment.length > COMMENT_MAX_LENGTH) {
      return badRequest(`comment must be ${COMMENT_MAX_LENGTH} characters or less.`);
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const reviewsTable = supabaseAdmin.from("place_reviews") as any;

    const { data, error } = await reviewsTable
      .upsert(
        {
          place_id: placeId,
          submitted_by: user.id,
          rating,
          comment: cleanComment,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "place_id,submitted_by",
        }
      )
      .select(REVIEW_COLUMNS)
      .single();

    if (error) {
      logDatabaseError(context, "Failed to save place review:", error);

      return {
        status: 500,
        jsonBody: {
          message: "Database error while saving rating.",
        },
      };
    }

    await invalidatePlaceDetailCache(placeId);

    return {
      status: 200,
      jsonBody: {
        message: "Review saved.",
        review: data,
      },
    };
  } catch (error) {
    context.error("Unexpected error in POST /api/places/{id}/reviews:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Unexpected server error.",
      },
    };
  }
}

export async function placeReviewsDelete(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const rateCheck = await checkEndpointRateLimit(request, "place-reviews-delete", 10, 60);
    if (!rateCheck.allowed && rateCheck.response) return rateCheck.response;

    const placeIdentifier = getPlaceIdentifier(request);

    if (!placeIdentifier) {
      return {
        status: 400,
        jsonBody: {
          message: "Place id is required.",
        },
      };
    }

    const user = await getAuthenticatedUser(request);

    if (!user?.id) {
      return unauthorized("Missing or invalid Authorization header.");
    }

    const placeId = await resolvePlaceId(placeIdentifier);

    if (!placeId) {
      return {
        status: 404,
        jsonBody: {
          message: "Place not found.",
        },
      };
    }

    const supabaseAdmin = await getSupabaseAdminClient();
    const reviewsTable = supabaseAdmin.from("place_reviews") as any;

    const { data, error } = await reviewsTable
      .delete()
      .eq("place_id", placeId)
      .eq("submitted_by", user.id)
      .select(REVIEW_COLUMNS);

    if (error) {
      context.error("Failed to delete place review:", error);

      return {
        status: 500,
        jsonBody: {
          message: "Failed to delete place review.",
        },
      };
    }

    await invalidatePlaceDetailCache(placeId);

    const deletedReviews = (data || []) as PlaceReview[];

    return {
      status: 200,
      jsonBody: {
        message: deletedReviews.length > 0 ? "Review deleted." : "Review was not found.",
        review: deletedReviews[0] || null,
      },
    };
  } catch (error) {
    context.error("Unexpected error in DELETE /api/places/{id}/reviews:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Unexpected server error.",
      },
    };
  }
}

app.http("placeReviewsList", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "places/{id}/reviews",
  handler: placeReviewsList,
});

app.http("placeReviewsUpsert", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "places/{id}/reviews",
  handler: placeReviewsUpsert,
});

app.http("placeReviewsDelete", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "places/{id}/reviews",
  handler: placeReviewsDelete,
});
