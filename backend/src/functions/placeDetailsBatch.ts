import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import {
  findPlaceDetailsBySlugs,
  resolveCityImageDetails,
  type CityImageRequest,
} from "../data/placeDetails";
import { checkEndpointRateLimit } from "../utils/redisRateLimit";

type PlaceDetailsBatchRequest = {
  slugs?: unknown;
  cityImageRequests?: unknown;
};

function parseCityImageRequests(value: unknown): CityImageRequest[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const requests: CityImageRequest[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const citySlug = typeof record.citySlug === "string" ? record.citySlug.trim() : "";

    if (!citySlug) {
      continue;
    }

    requests.push({
      citySlug,
      cityName: typeof record.cityName === "string" ? record.cityName.trim() : null,
      representativeSlug:
        typeof record.representativeSlug === "string" ? record.representativeSlug.trim().toLowerCase() : null,
    });
  }

  return requests;
}

export async function placeDetailsBatch(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const rateCheck = await checkEndpointRateLimit(request, "place-detail-batch", 30, 60);
  if (!rateCheck.allowed && rateCheck.response) {
    return rateCheck.response;
  }

  const refresh = request.query.get("refresh") === "true" || request.query.get("refresh") === "1";

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
  const cityImageRequests = parseCityImageRequests(body.cityImageRequests);

  if (slugs.length === 0 && cityImageRequests.length === 0) {
    return {
      status: 400,
      jsonBody: {
        message: "At least one place slug or city image request is required.",
      },
    };
  }

  const [detailsBySlug, cityImageResolutions] = await Promise.all([
    findPlaceDetailsBySlugs(slugs, { forceRefresh: refresh }),
    resolveCityImageDetails(cityImageRequests),
  ]);
  const places = slugs
    .map((slug) => detailsBySlug.get(slug))
    .filter((place): place is NonNullable<typeof place> => Boolean(place));

  context.log(
    `Returning ${places.length} batched place details and ${cityImageResolutions.size} city image resolutions.`
  );

  return {
    status: 200,
    jsonBody: {
      places,
      cityImageResolutions: Array.from(cityImageResolutions.values()),
    },
  };
}

app.http("placeDetailsBatch", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "places/batch-details",
  handler: placeDetailsBatch,
});
