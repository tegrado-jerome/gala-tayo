import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { findPlaceDetailByIdOrSlug } from "../data/placeDetails";
import { checkPublicReadRateLimit } from "../utils/redisRateLimit";

export async function placeDetail(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const rateCheck = await checkPublicReadRateLimit(request, "place-detail", 60, 60);
  if (!rateCheck.allowed && rateCheck.response) {
    return rateCheck.response;
  }

  const slug = request.params.slug;

  if (!slug || slug.trim() === "") {
    return {
      status: 400,
      jsonBody: {
        message: "Place slug is required.",
      },
    };
  }

  const place = await findPlaceDetailByIdOrSlug(slug);

  if (!place) {
    return {
      status: 404,
      jsonBody: {
        message: `Place not found for slug: ${slug}`,
      },
    };
  }

  context.log(`Returning place detail for ${place.id}`);

  return {
    status: 200,
    jsonBody: place,
  };
}

app.http("placeDetail", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "places/{slug}",
  handler: placeDetail,
});
