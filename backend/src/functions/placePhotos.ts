import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { findPlaceDetailByIdOrSlug } from "../data/placeDetails";
import { getApprovedPlaceImages } from "../services/placeImagesService";

export async function placePhotos(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const placeId = request.params.id;

  if (!placeId || placeId.trim() === "") {
    return {
      status: 400,
      jsonBody: {
        message: "Place id is required.",
      },
    };
  }

  const place = await findPlaceDetailByIdOrSlug(placeId);

  if (!place) {
    return {
      status: 404,
      jsonBody: {
        message: `Photos not found for place id: ${placeId}`,
      },
    };
  }

  const images = await getApprovedPlaceImages(place.id);
  const photos = images.map((image) => image.image_url);

  context.log(`Returning ${photos.length} photos for ${place.id}`);

  return {
    status: 200,
    jsonBody: {
      placeId: place.id,
      photos,
      images,
    },
  };
}

app.http("placePhotos", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "places/{id}/photos",
  handler: placePhotos,
});
