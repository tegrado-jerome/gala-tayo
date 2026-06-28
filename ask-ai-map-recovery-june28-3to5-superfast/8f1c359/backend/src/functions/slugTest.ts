import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import {
  generateUniqueSlug,
  PlaceServiceError,
} from "../services/placeService";
import { createBaseSlug } from "../utils/slug";

function getQueryParam(request: HttpRequest, key: string): string | undefined {
  const value = request.query.get(key);
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export async function slugTest(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const name = getQueryParam(request, "name");
  const city = getQueryParam(request, "city");

  if (!name) {
    return {
      status: 400,
      jsonBody: {
        success: false,
        message: "Place name is required.",
      },
    };
  }

  try {
    const baseSlug = createBaseSlug(name, city);
    const slug = await generateUniqueSlug(name, city);

    return {
      status: 200,
      jsonBody: {
        success: true,
        baseSlug,
        slug,
      },
    };
  } catch (error) {
    context.error("Slug test failed.", error);

    if (error instanceof PlaceServiceError) {
      return {
        status: error.status,
        jsonBody: {
          success: false,
          message: error.message,
        },
      };
    }

    return {
      status: 500,
      jsonBody: {
        success: false,
        message: "Internal server error.",
      },
    };
  }
}

app.http("slugTest", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "places/slug-test",
  handler: slugTest,
});

