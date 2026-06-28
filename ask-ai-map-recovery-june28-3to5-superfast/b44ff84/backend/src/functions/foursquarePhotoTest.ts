import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import {
  downloadPhoto,
  FoursquareServiceError,
  getFoursquarePlacePhotos,
} from "../services/foursquareService";

function getQueryParam(request: HttpRequest, key: string): string | undefined {
  const value = request.query.get(key);
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export async function foursquarePhotoTest(
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
    const photos = await getFoursquarePlacePhotos(foursquareId);
    const firstPhoto = photos[0];

    if (!firstPhoto) {
      return {
        status: 404,
        jsonBody: {
          success: false,
          foursquareId,
          message: "No Foursquare photos found for this place.",
        },
      };
    }

    const downloadedPhoto = await downloadPhoto(firstPhoto.url);

    return {
      status: 200,
      jsonBody: {
        success: true,
        foursquareId,
        photoUrl: firstPhoto.url,
        contentType: downloadedPhoto.contentType,
        byteLength: downloadedPhoto.byteLength,
      },
    };
  } catch (error) {
    context.error("Foursquare photo download test failed:", error);

    if (error instanceof FoursquareServiceError) {
      if (error.status === 429) {
        return {
          status: 429,
          jsonBody: {
            success: false,
            message: "Foursquare photo rate limit reached.",
            status: 429,
            retryLater: true,
            error: error.message,
          },
        };
      }

      return {
        status: error.status,
        jsonBody: {
          success: false,
          message: "Foursquare photo download test failed.",
          status: error.status,
          error: error.message,
        },
      };
    }

    return {
      status: 502,
      jsonBody: {
        message: "Foursquare photo download test failed.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

app.http("foursquarePhotoTest", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "foursquare/photo-test",
  handler: foursquarePhotoTest,
});
