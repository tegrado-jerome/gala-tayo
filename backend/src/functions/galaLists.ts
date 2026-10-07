import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { sanitizeListsState } from "../services/galaLists";
import { checkEndpointRateLimit } from "../utils/redisRateLimit";
import { getCurrentUser } from "../utils/social";

const TABLE = "gala_user_lists";
const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
// A lists document is small (50 lists x 60 places); anything far bigger is not one.
const MAX_BODY_CHARS = 400_000;

type ListsRow = { state: unknown; updated_at: string };

function json(status: number, body: unknown): HttpResponseInit {
  return { status, headers: JSON_HEADERS, jsonBody: body };
}

// Before supabase/migrations/20261007200000_gala_user_lists.sql runs, the app keeps lists on the device.
function isMissingTable(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  return code === "42P01" || code === "PGRST205";
}

function handleError(context: InvocationContext, label: string, error: unknown): HttpResponseInit {
  if (isMissingTable(error)) return json(200, { available: false });
  if (error instanceof Error && error.message.toLowerCase().includes("authorization")) {
    return json(401, { message: "Log in to sync your lists." });
  }
  context.error(`${label} failed:`, error);
  return json(500, { message: "Couldn't sync your lists. Try again." });
}

function toPayload(row: ListsRow | null) {
  return { available: true, state: sanitizeListsState(row?.state) ?? { version: 1, lists: [], following: [] }, updated_at: row?.updated_at ?? null };
}

export async function getGalaLists(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const user = await getCurrentUser(request);
    const supabase = await getSupabaseAdminClient();
    const { data, error } = await (supabase.from(TABLE) as any).select("state, updated_at").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    return json(200, toPayload(data as ListsRow | null));
  } catch (error) {
    return handleError(context, "GET /gala-lists", error);
  }
}

export async function putGalaLists(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const user = await getCurrentUser(request);
    const limit = await checkEndpointRateLimit(request, "galaListsPut", 60, 60);
    if (!limit.allowed) return limit.response!;

    const raw = await request.text();
    if (raw.length > MAX_BODY_CHARS) return json(413, { message: "That's too many lists to save at once." });
    let body: { state?: unknown } | null = null;
    try {
      body = JSON.parse(raw) as { state?: unknown };
    } catch {
      body = null;
    }
    const state = sanitizeListsState(body?.state);
    if (!state) return json(400, { message: "Send the lists to save." });

    const supabase = await getSupabaseAdminClient();
    const { data, error } = await (supabase.from(TABLE) as any)
      .upsert({ user_id: user.id, state, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
      .select("state, updated_at")
      .single();
    if (error) throw error;
    return json(200, toPayload(data as ListsRow));
  } catch (error) {
    return handleError(context, "PUT /gala-lists", error);
  }
}

app.http("galaListsGet", { methods: ["GET"], authLevel: "anonymous", route: "gala-lists", handler: getGalaLists });
app.http("galaListsPut", { methods: ["PUT"], authLevel: "anonymous", route: "gala-lists", handler: putGalaLists });
