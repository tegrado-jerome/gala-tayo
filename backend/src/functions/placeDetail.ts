import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { findPlaceDetailByIdOrSlug } from "../data/placeDetails";

export async function placeDetail(
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
        message: `Place not found for id: ${placeId}`,
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
  route: "places/{id}",
  handler: placeDetail,
});
