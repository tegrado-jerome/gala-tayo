import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { FoursquareServiceError } from "../services/foursquareService";
import {
  lookupPlaceByFoursquareId,
  PlaceServiceError,
} from "../services/placeService";

function getQueryParam(request: HttpRequest, key: string): string | undefined {
  const value = request.query.get(key);
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export async function placeLookupTest(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const foursquareId = getQueryParam(request, "foursquareId");

  if (!foursquareId) {
    return {
      status: 400,
      jsonBody: {
        message: "Missing required query parameter: foursquareId is required.",
      },
    };
  }

  try {
    const result = await lookupPlaceByFoursquareId(foursquareId);

    return {
      status: 200,
      jsonBody: {
        success: true,
        ...result,
      },
    };
  } catch (error) {
    context.error("Place lookup-test failed.", error);

    if (error instanceof PlaceServiceError) {
      return {
        status: error.status,
        jsonBody: {
          message: "Supabase place lookup failed.",
        },
      };
    }

    if (error instanceof FoursquareServiceError) {
      return {
        status: error.status,
        jsonBody: {
          message: "Foursquare fallback failed.",
        },
      };
    }

    return {
      status: 500,
      jsonBody: {
        message: "Internal server error.",
      },
    };
  }
}

app.http("placeLookupTest", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "places/lookup-test",
  handler: placeLookupTest,
});

