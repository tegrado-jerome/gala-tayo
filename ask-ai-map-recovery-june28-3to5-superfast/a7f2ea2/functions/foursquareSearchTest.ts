import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import {
  FoursquareServiceError,
  searchFoursquarePlaces,
} from "../services/foursquareService";

function getQueryParam(request: HttpRequest, key: string): string | undefined {
  const value = request.query.get(key);
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function getLimitParam(request: HttpRequest): number | undefined {
  const raw = request.query.get("limit");
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function foursquareSearchTest(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const query = getQueryParam(request, "query");
  const ll = getQueryParam(request, "ll");

  if (!query || !ll) {
    return {
      status: 400,
      jsonBody: {
        message: "Missing required query parameters: query and ll are required.",
      },
    };
  }

  try {
    const results = await searchFoursquarePlaces({
      query,
      ll,
      limit: getLimitParam(request),
    });

    return {
      status: 200,
      jsonBody: {
        success: true,
        query,
        ll,
        results,
      },
    };
  } catch (error) {
    // Do not log secrets; keep logs generic.
    context.error("Foursquare search-test failed.", error);

    if (error instanceof FoursquareServiceError) {
      return {
        status: 500,
        jsonBody: {
          message: "Foursquare request failed.",
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

app.http("foursquareSearchTest", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "foursquare/search-test",
  handler: foursquareSearchTest,
});

