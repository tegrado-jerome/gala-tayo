import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { findPlaceDetailsBySlugs } from "../data/placeDetails";
import { checkEndpointRateLimit } from "../utils/redisRateLimit";

type PlaceDetailsBatchRequest = {
  slugs?: unknown;
};

export async function placeDetailsBatch(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const rateCheck = await checkEndpointRateLimit(request, "place-detail-batch", 30, 60);
  if (!rateCheck.allowed && rateCheck.response) {
    return rateCheck.response;
  }

  let body: PlaceDetailsBatchRequest;

  try {
    body = (await request.json()) as PlaceDetailsBatchRequest;
  } catch {
    return {
      status: 400,
      jsonBody: {
        message: "A JSON body with slugs is required.",
      },
    };
  }

  const slugs = Array.isArray(body.slugs)
    ? body.slugs
        .filter((slug): slug is string => typeof slug === "string")
        .map((slug) => slug.trim().toLowerCase())
        .filter(Boolean)
    : [];

  if (slugs.length === 0) {
    return {
      status: 400,
      jsonBody: {
        message: "At least one place slug is required.",
      },
    };
  }

  const detailsBySlug = await findPlaceDetailsBySlugs(slugs);
  const places = slugs
    .map((slug) => detailsBySlug.get(slug))
    .filter((place): place is NonNullable<typeof place> => Boolean(place));

  context.log(`Returning ${places.length} batched place details.`);

  return {
    status: 200,
    jsonBody: {
      places,
    },
  };
}

app.http("placeDetailsBatch", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "places/batch-details",
  handler: placeDetailsBatch,
});
