import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { getActiveNormalizedPlaces } from "../domain/places";
import { matchTripStops, parseTripText } from "../domain/tripText";
import { checkPublicReadRateLimit } from "../utils/redisRateLimit";
import { parseTravelInfo } from "../utils/travelInfo";

const MAX_TEXT_LENGTH = 4000;

/**
 * Trip Check for a pasted itinerary: the days, the GalaTayo places it names (with the fields the checks
 * read) and the group size, budget and start date the text gives. The checks themselves run in the app
 * (frontend utils/tripCheck.ts), the same code that checks a saved plan.
 */
export async function tripCheck(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const rateCheck = await checkPublicReadRateLimit(request, "trip-check", 20, 60);
  if (!rateCheck.allowed && rateCheck.response) return rateCheck.response;

  let text = "";
  try {
    const body = (await request.json()) as { text?: unknown };
    text = typeof body.text === "string" ? body.text.trim() : "";
  } catch {
    return { status: 400, jsonBody: { message: "Paste your itinerary first." } };
  }
  if (!text) return { status: 400, jsonBody: { message: "Paste your itinerary first." } };
  if (text.length > MAX_TEXT_LENGTH) return { status: 400, jsonBody: { message: `Keep it under ${MAX_TEXT_LENGTH} characters.` } };

  const parsed = parseTripText(text);
  const { stops, unmatched } = matchTripStops(parsed, await getActiveNormalizedPlaces());

  // travel_info isn't in the cached place list, so the few matched places are read for it here.
  const ids = [...new Set(stops.map((stop) => stop.place.id))];
  const travelInfo = new Map<string, unknown>();
  if (ids.length > 0) {
    const supabase = await getSupabaseAdminClient();
    const { data, error } = await (supabase.from("places") as any).select("id, travel_info").in("id", ids);
    // Without it every fee would read "not listed", which is wrong, so the check fails instead.
    if (error) {
      context.warn(`Trip check could not read travel info: ${error.message}`);
      return { status: 503, jsonBody: { message: "Could not check right now. Try again in a minute." } };
    }
    for (const row of (data ?? []) as Array<{ id: string; travel_info: unknown }>) travelInfo.set(row.id, row.travel_info);
  }

  return {
    status: 200,
    jsonBody: {
      start_date: parsed.startDate,
      group_size: parsed.groupSize,
      budget: parsed.budget,
      stops: stops.map(({ day, text: line, place }) => ({
        day,
        text: line,
        place: {
          id: place.id,
          name: place.name,
          slug: place.slug,
          category: place.category,
          city: place.city,
          latitude: place.latitude,
          longitude: place.longitude,
          budget_min: place.budget_min,
          opening_hours: place.opening_hours,
          travel_info: parseTravelInfo(travelInfo.get(place.id)),
        },
      })),
      unmatched,
    },
  };
}

app.http("tripCheck", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "trip-check",
  handler: tripCheck,
});
