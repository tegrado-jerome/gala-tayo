import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { getActiveNormalizedPlaces } from "../domain/places";
import { buildCityStamps, isNearPlace, weeklyStreak } from "../services/passport";
import { getCurrentUser } from "../utils/social";

type CheckinRow = { place_id: string; checkin_date: string; created_at: string };

class PassportUnavailableError extends Error {}

function isMissingTable(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  return code === "42P01" || code === "PGRST205";
}

function manilaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

function handleError(context: InvocationContext, label: string, error: unknown): HttpResponseInit {
  if (error instanceof PassportUnavailableError) return { status: 200, jsonBody: { available: false } };
  if (error instanceof Error && error.message.toLowerCase().includes("authorization")) {
    return { status: 401, jsonBody: { message: "Sign in to collect stamps." } };
  }
  context.error(`${label} failed:`, error);
  return { status: 500, jsonBody: { message: "Something went wrong. Try again." } };
}

async function buildPassport(userId: string) {
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("gala_place_checkins") as any)
    .select("place_id, checkin_date, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingTable(error)) throw new PassportUnavailableError();
    throw error;
  }

  const checkins = (data ?? []) as CheckinRow[];
  const places = await getActiveNormalizedPlaces({ includeHidden: true });
  const placesById = new Map(places.map((place) => [place.id, place]));
  const cities = Array.from(new Set(places.map((place) => place.city).filter((city): city is string => Boolean(city)))).sort();
  const withCity = checkins.map((checkin) => ({ ...checkin, city: placesById.get(checkin.place_id)?.city ?? null }));

  return {
    available: true,
    stamps: buildCityStamps(cities, withCity),
    total_checkins: checkins.length,
    unique_places: new Set(checkins.map((checkin) => checkin.place_id)).size,
    streak_weeks: weeklyStreak(checkins.map((checkin) => checkin.checkin_date), manilaToday()),
    recent: withCity.slice(0, 5).map((checkin) => {
      const place = placesById.get(checkin.place_id);
      return { place_id: checkin.place_id, name: place?.name ?? "Place", slug: place?.slug ?? null, city: checkin.city, created_at: checkin.created_at };
    }),
  };
}

export async function getMyPassport(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const user = await getCurrentUser(request);
    return { status: 200, jsonBody: await buildPassport(user.id) };
  } catch (error) {
    return handleError(context, "GET passport", error);
  }
}

export async function postPlaceCheckin(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const user = await getCurrentUser(request);
    const placeId = String(request.params.placeId ?? "");
    const place = (await getActiveNormalizedPlaces({ includeHidden: true })).find((entry) => entry.id === placeId);
    if (!place) return { status: 404, jsonBody: { message: "Place not found." } };

    const body = ((await request.json().catch(() => ({}))) ?? {}) as { latitude?: unknown; longitude?: unknown };
    const lat = Number(body.latitude);
    const lng = Number(body.longitude);
    if (place.latitude != null && place.longitude != null) {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return { status: 400, jsonBody: { message: "Turn on location so we can confirm you're here." } };
      }
      if (!isNearPlace({ lat, lng }, { lat: place.latitude, lng: place.longitude })) {
        return { status: 422, jsonBody: { code: "TOO_FAR", message: `You don't seem to be at ${place.name} yet. Check in when you arrive.` } };
      }
    }

    const before = await buildPassport(user.id);
    const supabase = await getSupabaseAdminClient();
    const { error } = await (supabase.from("gala_place_checkins") as any).upsert(
      { user_id: user.id, place_id: place.id, checkin_date: manilaToday() },
      { onConflict: "user_id,place_id,checkin_date", ignoreDuplicates: true }
    );
    if (error) {
      if (isMissingTable(error)) throw new PassportUnavailableError();
      throw error;
    }

    const after = await buildPassport(user.id);
    const hadStamp = before.stamps.find((stamp) => stamp.city === place.city)?.collected ?? false;
    return {
      status: 200,
      jsonBody: { ...after, new_stamp_city: !hadStamp && place.city ? place.city : null, place_name: place.name },
    };
  } catch (error) {
    return handleError(context, "POST checkin", error);
  }
}

app.http("myPassport", { methods: ["GET"], authLevel: "anonymous", route: "me/passport", handler: getMyPassport });
app.http("placeCheckin", { methods: ["POST"], authLevel: "anonymous", route: "places/{placeId:guid}/checkin", handler: postPlaceCheckin });
