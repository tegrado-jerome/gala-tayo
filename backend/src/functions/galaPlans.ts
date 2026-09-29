import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { buildImageUrl } from "../utils/r2UrlResolver";
import { getApprovedPlaceImagesByPlaceIds } from "../services/placeImagesService";
import { createSlug, getCurrentUser, getOptionalCurrentUser } from "../utils/social";

type PlanVisibility = "private" | "public";
type PlanStatus = "active" | "deleted";

export type ProfileRow = {
  user_id: string;
  username: string | null;
  display_name?: string | null;
  avatar_url: string | null;
  provider_avatar_url: string | null;
  bio: string | null;
};

export type PlanRow = {
  id: string;
  user_id: string;
  title: string;
  slug: string | null;
  description: string | null;
  visibility: PlanVisibility | string;
  status: PlanStatus | string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  hearts_count: number | null;
};

type PlaceRow = {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  city: string | null;
  area?: string | null;
  address?: string | null;
  budget_min?: number | string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  storage_key?: string | null;
};

type ItemRow = {
  id: string;
  plan_id: string;
  place_id: string;
  day_number: number | null;
  sort_order: number | null;
  time_label: string | null;
  notes: string | null;
  estimated_minutes: number | null;
  created_at: string;
  updated_at: string;
  places?: PlaceRow | null;
};

const PLAN_COLUMNS =
  "id, user_id, title, slug, description, visibility, status, published_at, created_at, updated_at, hearts_count";
const ITEM_COLUMNS =
  "id, plan_id, place_id, day_number, sort_order, time_label, notes, estimated_minutes, created_at, updated_at, places(id, name, slug, category, city, area, address, budget_min, latitude, longitude)";
const PREVIEW_ITEM_COLUMNS = "id, plan_id, place_id, day_number, sort_order, places(id, name, slug, city, area, category)";
const PLAN_VISIBILITIES = new Set<PlanVisibility>(["private", "public"]);
const ACTIVE_STATUS = "active";
const DELETED_STATUS = "deleted";
const SHOULD_LOG_DETAIL_TRACE = process.env.NODE_ENV !== "production";

function unauthorized(): HttpResponseInit {
  return { status: 401, jsonBody: { message: "Missing or invalid Authorization header." } };
}

function notFound(message = "Gala plan not found."): HttpResponseInit {
  return { status: 404, jsonBody: { message } };
}

function forbidden(message = "You cannot access this gala plan."): HttpResponseInit {
  return { status: 403, jsonBody: { message } };
}

function isAuthError(error: unknown) {
  return error instanceof Error && error.message.toLowerCase().includes("authorization");
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getNullableString(value: unknown, maxLength = 2000) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function getPositiveInteger(value: unknown, fallback: number) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getNullablePositiveInteger(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function toNullableNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isActive(plan: PlanRow) {
  return (plan.status ?? ACTIVE_STATUS) === ACTIVE_STATUS;
}

function isDeleted(plan: PlanRow) {
  return (plan.status ?? ACTIVE_STATUS) === DELETED_STATUS;
}

function sortItems(first: ItemRow, second: ItemRow) {
  const firstDay = first.day_number ?? 1;
  const secondDay = second.day_number ?? 1;
  if (firstDay !== secondDay) return firstDay - secondDay;
  return (first.sort_order ?? 0) - (second.sort_order ?? 0);
}

export function mapOwner(profile: ProfileRow | null | undefined) {
  if (!profile) return null;
  return {
    user_id: profile.user_id,
    username: profile.username,
    display_name: profile.display_name ?? null,
    avatar_url: profile.avatar_url,
    provider_avatar_url: profile.provider_avatar_url,
    bio: profile.bio,
  };
}

function mapPreviewPlace(item: ItemRow) {
  const place = item.places;
  if (!place?.id || !place.name || !place.slug) return null;
  return {
    id: place.id,
    name: place.name,
    slug: place.slug,
    city: place.city ?? null,
    area: place.area ?? null,
    category: place.category ?? null,
    image_url: place.storage_key ? buildImageUrl(place.storage_key) : null,
  };
}

function mapPlace(place: PlaceRow | null | undefined, fallbackPlaceId: string) {
  return {
    id: place?.id ?? fallbackPlaceId,
    name: place?.name ?? "Unknown place",
    slug: place?.slug ?? fallbackPlaceId,
    category: place?.category ?? null,
    city: place?.city ?? null,
    area: place?.area ?? null,
    address: place?.address ?? null,
    budget_min: toNullableNumber(place?.budget_min),
    latitude: toNullableNumber(place?.latitude),
    longitude: toNullableNumber(place?.longitude),
    image_url: place?.storage_key ? buildImageUrl(place.storage_key) : null,
  };
}

function basePlanPayload(
  plan: PlanRow,
  items: ItemRow[],
  viewerHasHeart = false,
  viewerId?: string | null,
  owner?: ProfileRow | null,
) {
  const sortedItems = [...items].sort(sortItems);
  const heartCount = plan.hearts_count ?? 0;
  const status = plan.status ?? ACTIVE_STATUS;
  return {
    id: plan.id,
    user_id: plan.user_id,
    title: plan.title,
    slug: plan.slug,
    description: plan.description,
    visibility: plan.visibility,
    status,
    is_active: status === ACTIVE_STATUS,
    published_at: plan.published_at,
    created_at: plan.created_at,
    updated_at: plan.updated_at,
    heart_count: heartCount,
    hearts_count: heartCount,
    viewer_has_hearted: viewerHasHeart,
    viewer_is_owner: Boolean(viewerId && viewerId === plan.user_id),
    place_count: sortedItems.length,
    places_count: sortedItems.length,
    preview_places: sortedItems.slice(0, 3).map(mapPreviewPlace).filter(Boolean),
    owner: mapOwner(owner),
  };
}

function mapPlanSummary(
  plan: PlanRow,
  items: ItemRow[],
  viewerHasHeart = false,
  viewerId?: string | null,
  owner?: ProfileRow | null,
) {
  return basePlanPayload(plan, items, viewerHasHeart, viewerId, owner);
}

function mapPlanDetail(
  plan: PlanRow,
  items: ItemRow[],
  viewerHasHeart = false,
  viewerId?: string | null,
  owner?: ProfileRow | null,
) {
  return {
    ...basePlanPayload(plan, items, viewerHasHeart, viewerId, owner),
    items: [...items].sort(sortItems).map((item, index) => ({
      id: item.id,
      plan_id: item.plan_id,
      place_id: item.place_id,
      order_index: item.sort_order ?? index + 1,
      day_number: item.day_number ?? 1,
      sort_order: item.sort_order ?? index + 1,
      time_label: item.time_label,
      notes: item.notes,
      estimated_minutes: item.estimated_minutes,
      created_at: item.created_at,
      updated_at: item.updated_at,
      place: mapPlace(item.places, item.place_id),
    })),
  };
}

async function countHearts(planId: string) {
  const supabase = await getSupabaseAdminClient();
  const { count, error } = await (supabase.from("gala_plan_hearts") as any)
    .select("id", { count: "exact", head: true })
    .eq("gala_plan_id", planId);
  if (error) throw error;
  return count ?? 0;
}

async function syncHeartCount(planId: string) {
  const supabase = await getSupabaseAdminClient();
  const heartCount = await countHearts(planId);
  const { error } = await (supabase.from("gala_plans") as any).update({ hearts_count: heartCount }).eq("id", planId);
  if (error) throw error;
  return heartCount;
}

async function getHeartedPlanIds(userId: string | null | undefined, planIds: string[]) {
  if (!userId || planIds.length === 0) return new Set<string>();
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("gala_plan_hearts") as any)
    .select("gala_plan_id")
    .eq("user_id", userId)
    .in("gala_plan_id", planIds);
  if (error) throw error;
  return new Set(((data || []) as Array<{ gala_plan_id: string }>).map((row) => row.gala_plan_id));
}

// Plan items join `places`, which has no image column; the primary image lives in `place_images`.
async function attachPlaceImages(items: ItemRow[]): Promise<ItemRow[]> {
  const placeIds = items.map((item) => item.places?.id).filter((id): id is string => Boolean(id));
  if (placeIds.length === 0) return items;

  try {
    const imagesByPlaceId = await getApprovedPlaceImagesByPlaceIds(placeIds);
    return items.map((item) => {
      const storageKey = item.places ? imagesByPlaceId.get(item.places.id)?.[0]?.storage_key : null;
      return storageKey && item.places ? { ...item, places: { ...item.places, storage_key: storageKey } } : item;
    });
  } catch {
    return items;
  }
}

async function getPlanItems(planIds: string[], previewOnly = false) {
  if (planIds.length === 0) return new Map<string, ItemRow[]>();
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("gala_plan_items") as any)
    .select(previewOnly ? PREVIEW_ITEM_COLUMNS : ITEM_COLUMNS)
    .in("plan_id", planIds)
    .order("day_number", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) throw error;

  const rows = await attachPlaceImages((data || []) as ItemRow[]);
  const byPlanId = new Map<string, ItemRow[]>();
  for (const item of rows) {
    const items = byPlanId.get(item.plan_id) || [];
    items.push(item);
    byPlanId.set(item.plan_id, items);
  }
  return byPlanId;
}

export async function getProfilesByUserIds(userIds: string[]) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  const profilesByUserId = new Map<string, ProfileRow>();
  if (uniqueUserIds.length === 0) return profilesByUserId;

  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("profiles") as any)
    .select("user_id, username, display_name, avatar_url, provider_avatar_url, bio")
    .in("user_id", uniqueUserIds);
  if (error) throw error;

  for (const profile of (data || []) as ProfileRow[]) {
    profilesByUserId.set(profile.user_id, profile);
  }
  return profilesByUserId;
}

export async function getPlanById(planId: string) {
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("gala_plans") as any)
    .select(PLAN_COLUMNS)
    .eq("id", planId)
    .maybeSingle();
  if (error) throw error;
  return data as PlanRow | null;
}

async function getOwnedPlan(userId: string, planId: string) {
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("gala_plans") as any)
    .select(PLAN_COLUMNS)
    .eq("id", planId)
    .eq("user_id", userId)
    .neq("status", DELETED_STATUS)
    .maybeSingle();
  if (error) throw error;
  return data as PlanRow | null;
}

async function createUniqueSlug(title: string, existingPlanId?: string) {
  const supabase = await getSupabaseAdminClient();
  const baseSlug = createSlug(title);
  for (let index = 0; index < 50; index += 1) {
    const candidate = index === 0 ? baseSlug : `${baseSlug}-${index + 1}`;
    let query = (supabase.from("gala_plans") as any).select("id").eq("slug", candidate);
    if (existingPlanId) query = query.neq("id", existingPlanId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
  }
  return `${baseSlug}-${Date.now()}`;
}

async function validatePlacesExist(placeIds: string[]) {
  if (placeIds.length === 0) return { ok: true as const };
  const uniquePlaceIds = Array.from(new Set(placeIds));
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("places") as any).select("id").in("id", uniquePlaceIds);
  if (error) throw error;
  const found = new Set(((data || []) as Array<{ id: string }>).map((place) => place.id));
  const missing = uniquePlaceIds.filter((placeId) => !found.has(placeId));
  return missing.length === 0 ? { ok: true as const } : { ok: false as const, missing };
}

function parseItems(rawItems: unknown) {
  if (rawItems === undefined) return { items: undefined as undefined | Array<Record<string, unknown>>, error: null as string | null };
  if (!Array.isArray(rawItems)) return { items: undefined, error: "items must be an array." };

  const seen = new Set<string>();
  const items = rawItems.map((rawItem, index) => {
    const item = (rawItem || {}) as Record<string, unknown>;
    const placeId = getString(item.place_id);
    if (!placeId) return { error: `items[${index}].place_id is required.` };
    if (seen.has(placeId)) return { error: "Duplicate places in the same plan are not allowed." };
    seen.add(placeId);

    const dayNumber = getPositiveInteger(item.day_number, 1);
    const sortOrder = getPositiveInteger(item.sort_order, index + 1);
    const estimatedMinutes = getNullablePositiveInteger(item.estimated_minutes);
    if (estimatedMinutes === undefined && item.estimated_minutes !== undefined) {
      return { error: `items[${index}].estimated_minutes must be a positive integer or null.` };
    }

    return {
      place_id: placeId,
      day_number: dayNumber,
      sort_order: sortOrder,
      time_label: getNullableString(item.time_label, 80) ?? null,
      notes: getNullableString(item.notes, 1000) ?? null,
      estimated_minutes: estimatedMinutes ?? null,
    };
  });

  const failed = items.find((item): item is { error: string } => "error" in item);
  if (failed) return { items: undefined, error: failed.error };
  return { items: items as Array<Record<string, unknown>>, error: null };
}

async function replacePlanItems(planId: string, rawItems: unknown) {
  const parsed = parseItems(rawItems);
  if (parsed.error) return { error: parsed.error };
  if (!parsed.items) return { error: null };

  const placeCheck = await validatePlacesExist(parsed.items.map((item) => String(item.place_id)));
  if (!placeCheck.ok) return { error: `Unknown place_id: ${placeCheck.missing.join(", ")}` };

  const supabase = await getSupabaseAdminClient();
  const { error: deleteError } = await (supabase.from("gala_plan_items") as any).delete().eq("plan_id", planId);
  if (deleteError) throw deleteError;

  if (parsed.items.length > 0) {
    const { error: insertError } = await (supabase.from("gala_plan_items") as any)
      .insert(parsed.items.map((item) => ({ ...item, plan_id: planId })));
    if (insertError) throw insertError;
  }

  return { error: null };
}

export async function listMyGalaPlans(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const user = await getCurrentUser(request);
    const supabase = await getSupabaseAdminClient();
    const { data, error } = await (supabase.from("gala_plans") as any)
      .select(PLAN_COLUMNS)
      .eq("user_id", user.id)
      .neq("status", DELETED_STATUS)
      .order("updated_at", { ascending: false });
    if (error) throw error;

    const plans = (data || []) as PlanRow[];
    const itemsByPlanId = await getPlanItems(plans.map((plan) => plan.id), true);
    const ownersByUserId = await getProfilesByUserIds(plans.map((plan) => plan.user_id));
    return {
      status: 200,
      jsonBody: {
        plans: plans.map((plan) =>
          mapPlanSummary(plan, itemsByPlanId.get(plan.id) || [], false, user.id, ownersByUserId.get(plan.user_id) || null),
        ),
      },
    };
  } catch (error) {
    if (isAuthError(error)) return unauthorized();
    context.error("GET /api/gala-plans failed:", error);
    return { status: 500, jsonBody: { message: "Failed to load gala plans." } };
  }
}

export async function createGalaPlan(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const user = await getCurrentUser(request);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const title = getString(body?.title);
    const visibility = (getString(body?.visibility) || "private") as PlanVisibility;

    if (!title) return { status: 400, jsonBody: { message: "title is required." } };
    if (!PLAN_VISIBILITIES.has(visibility)) return { status: 400, jsonBody: { message: "visibility must be private or public." } };

    const parsedItems = parseItems(body?.items);
    if (parsedItems.error) return { status: 400, jsonBody: { message: parsedItems.error } };

    if (parsedItems.items) {
      const placeCheck = await validatePlacesExist(parsedItems.items.map((item) => String(item.place_id)));
      if (!placeCheck.ok) return { status: 400, jsonBody: { message: `Unknown place_id: ${placeCheck.missing.join(", ")}` } };
    }

    const supabase = await getSupabaseAdminClient();
    const { data, error } = await (supabase.from("gala_plans") as any)
      .insert({
        user_id: user.id,
        title,
        slug: await createUniqueSlug(title),
        description: getNullableString(body?.description) ?? null,
        visibility,
        status: ACTIVE_STATUS,
        published_at: visibility === "public" ? new Date().toISOString() : null,
      })
      .select(PLAN_COLUMNS)
      .single();
    if (error) throw error;

    const plan = data as PlanRow;
    if (parsedItems.items && parsedItems.items.length > 0) {
      const { error: itemError } = await (supabase.from("gala_plan_items") as any)
        .insert(parsedItems.items.map((item) => ({ ...item, plan_id: plan.id })));
      if (itemError) throw itemError;
    }

    const items = await getPlanItems([plan.id]);
    const ownersByUserId = await getProfilesByUserIds([plan.user_id]);
    return {
      status: 201,
      jsonBody: { plan: mapPlanDetail(plan, items.get(plan.id) || [], false, user.id, ownersByUserId.get(plan.user_id) || null) },
    };
  } catch (error) {
    if (isAuthError(error)) return unauthorized();
    context.error("POST /api/gala-plans failed:", error);
    return { status: 500, jsonBody: { message: "Failed to create gala plan." } };
  }
}

export async function listFavoriteGalaPlans(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const user = await getCurrentUser(request);
    const supabase = await getSupabaseAdminClient();
    const { data: heartRows, error: heartError } = await (supabase.from("gala_plan_hearts") as any)
      .select("gala_plan_id")
      .eq("user_id", user.id);
    if (heartError) throw heartError;

    const planIds = Array.from(new Set(((heartRows || []) as Array<{ gala_plan_id: string }>).map((row) => row.gala_plan_id)));
    if (planIds.length === 0) return { status: 200, jsonBody: { plans: [] } };

    const { data: plansData, error: plansError } = await (supabase.from("gala_plans") as any)
      .select(PLAN_COLUMNS)
      .in("id", planIds)
      .eq("visibility", "public")
      .eq("status", ACTIVE_STATUS);
    if (plansError) throw plansError;

    const plans = ((plansData || []) as PlanRow[]).sort(
      (first, second) => new Date(second.updated_at).getTime() - new Date(first.updated_at).getTime(),
    );
    const itemsByPlanId = await getPlanItems(plans.map((plan) => plan.id), true);
    const ownersByUserId = await getProfilesByUserIds(plans.map((plan) => plan.user_id));
    return {
      status: 200,
      jsonBody: {
        plans: plans.map((plan) =>
          mapPlanSummary(plan, itemsByPlanId.get(plan.id) || [], true, user.id, ownersByUserId.get(plan.user_id) || null),
        ),
      },
    };
  } catch (error) {
    if (isAuthError(error)) return unauthorized();
    context.error("GET /api/gala-plans/favorites failed:", error);
    return { status: 500, jsonBody: { message: "Failed to load gala plan favorites." } };
  }
}

export async function getGalaPlanDetail(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const viewer = await getOptionalCurrentUser(request);
    const id = getString(request.params.id);
    if (!isUuid(id)) {
      return { status: 400, jsonBody: { message: "A valid gala plan id is required." } };
    }
    const supabase = await getSupabaseAdminClient();
    const { data, error } = await (supabase.from("gala_plans") as any)
      .select(PLAN_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;

    const plan = data as PlanRow | null;
    if (!plan || isDeleted(plan)) {
      if (SHOULD_LOG_DETAIL_TRACE) {
        context.log("GET /api/gala-plans/{id} decision", {
          planId: plan?.id ?? id,
          planUserId: plan?.user_id ?? null,
          currentUserId: viewer?.id ?? null,
          planStatus: plan?.status ?? null,
          planVisibility: plan?.visibility ?? null,
          isOwner: false,
          allow: false,
          denyReason: !plan ? "plan_not_found" : "plan_deleted",
        });
      }
      return notFound();
    }

    const viewerIsOwner = viewer?.id === plan.user_id;
    const decisionTrace = {
      planId: plan.id,
      planUserId: plan.user_id,
      currentUserId: viewer?.id ?? null,
      planStatus: plan.status ?? null,
      planVisibility: plan.visibility,
      isOwner: viewerIsOwner,
    };
    if (!viewerIsOwner) {
      if (!isActive(plan)) {
        if (SHOULD_LOG_DETAIL_TRACE) {
          context.log("GET /api/gala-plans/{id} decision", {
            ...decisionTrace,
            allow: false,
            denyReason: "not_active_for_non_owner",
          });
        }
        return notFound();
      }
      if (plan.visibility !== "public") {
        if (SHOULD_LOG_DETAIL_TRACE) {
          context.log("GET /api/gala-plans/{id} decision", {
            ...decisionTrace,
            allow: false,
            denyReason: "not_public_for_non_owner",
          });
        }
        return notFound();
      }
    }
    if (SHOULD_LOG_DETAIL_TRACE) {
      context.log("GET /api/gala-plans/{id} decision", {
        ...decisionTrace,
        allow: true,
      });
    }

    const [itemsByPlanId, hearted] = await Promise.all([
      getPlanItems([plan.id]),
      getHeartedPlanIds(viewer?.id, [plan.id]),
    ]);
    const ownersByUserId = await getProfilesByUserIds([plan.user_id]);
    return {
      status: 200,
      jsonBody: {
        plan: mapPlanDetail(
          plan,
          itemsByPlanId.get(plan.id) || [],
          hearted.has(plan.id),
          viewer?.id,
          ownersByUserId.get(plan.user_id) || null,
        ),
      },
    };
  } catch (error) {
    context.error("GET /api/gala-plans/{id} failed:", error);
    return { status: 500, jsonBody: { message: "Failed to load gala plan." } };
  }
}

export async function updateGalaPlan(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const user = await getCurrentUser(request);
    const plan = await getOwnedPlan(user.id, request.params.id);
    if (!plan) return notFound();

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const updates: Record<string, unknown> = {};

    if (body?.title !== undefined) {
      const title = getString(body.title);
      if (!title) return { status: 400, jsonBody: { message: "title is required." } };
      updates.title = title;
    }
    if (body?.description !== undefined) updates.description = getNullableString(body.description) ?? null;
    if (body?.visibility !== undefined) {
      const visibility = getString(body.visibility) as PlanVisibility;
      if (!PLAN_VISIBILITIES.has(visibility)) return { status: 400, jsonBody: { message: "visibility must be private or public." } };
      updates.visibility = visibility;
      if (visibility === "public" && !plan.published_at) updates.published_at = new Date().toISOString();
    }
    updates.updated_at = new Date().toISOString();

    const replaceResult = await replacePlanItems(plan.id, body?.items);
    if (replaceResult.error) return { status: 400, jsonBody: { message: replaceResult.error } };

    const supabase = await getSupabaseAdminClient();
    const { data, error } = await (supabase.from("gala_plans") as any)
      .update(updates)
      .eq("id", plan.id)
      .eq("user_id", user.id)
      .select(PLAN_COLUMNS)
      .single();
    if (error) throw error;

    const items = await getPlanItems([plan.id]);
    const nextPlan = data as PlanRow;
    const ownersByUserId = await getProfilesByUserIds([nextPlan.user_id]);
    return {
      status: 200,
      jsonBody: { plan: mapPlanDetail(nextPlan, items.get(plan.id) || [], false, user.id, ownersByUserId.get(nextPlan.user_id) || null) },
    };
  } catch (error) {
    if (isAuthError(error)) return unauthorized();
    context.error("PATCH /api/gala-plans/{id} failed:", error);
    return { status: 500, jsonBody: { message: "Failed to update gala plan." } };
  }
}

export async function deleteGalaPlan(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const user = await getCurrentUser(request);
    const plan = await getOwnedPlan(user.id, request.params.id);
    if (!plan) return notFound();
    const supabase = await getSupabaseAdminClient();
    const { error } = await (supabase.from("gala_plans") as any)
      .update({ status: DELETED_STATUS, updated_at: new Date().toISOString() })
      .eq("id", plan.id)
      .eq("user_id", user.id);
    if (error) throw error;
    return { status: 200, jsonBody: { message: "Gala plan deleted." } };
  } catch (error) {
    if (isAuthError(error)) return unauthorized();
    context.error("DELETE /api/gala-plans/{id} failed:", error);
    return { status: 500, jsonBody: { message: "Failed to delete gala plan." } };
  }
}

export async function addGalaPlanItem(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const user = await getCurrentUser(request);
    const plan = await getOwnedPlan(user.id, request.params.id);
    if (!plan) return notFound();

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const placeId = getString(body?.place_id);
    if (!placeId) return { status: 400, jsonBody: { message: "place_id is required." } };

    const placeCheck = await validatePlacesExist([placeId]);
    if (!placeCheck.ok) return { status: 400, jsonBody: { message: `Unknown place_id: ${placeId}` } };

    const itemsByPlanId = await getPlanItems([plan.id], true);
    const existingItems = itemsByPlanId.get(plan.id) || [];
    if (existingItems.some((item) => item.place_id === placeId)) {
      return { status: 409, jsonBody: { message: "This place is already in the gala plan." } };
    }

    const dayNumber = getPositiveInteger(body?.day_number, 1);
    const nextSortOrder = existingItems
      .filter((item) => (item.day_number ?? 1) === dayNumber)
      .reduce((max, item) => Math.max(max, item.sort_order ?? 0), 0) + 1;
    const estimatedMinutes = getNullablePositiveInteger(body?.estimated_minutes);
    if (estimatedMinutes === undefined && body?.estimated_minutes !== undefined) {
      return { status: 400, jsonBody: { message: "estimated_minutes must be a positive integer or null." } };
    }

    const supabase = await getSupabaseAdminClient();
    const { data, error } = await (supabase.from("gala_plan_items") as any)
      .insert({
        plan_id: plan.id,
        place_id: placeId,
        day_number: dayNumber,
        sort_order: getPositiveInteger(body?.sort_order, nextSortOrder),
        time_label: getNullableString(body?.time_label, 80) ?? null,
        notes: getNullableString(body?.notes, 1000) ?? null,
        estimated_minutes: estimatedMinutes ?? null,
      })
      .select(ITEM_COLUMNS)
      .single();
    if (error) throw error;
    const [item] = await attachPlaceImages([data as ItemRow]);
    return { status: 201, jsonBody: { item: mapPlanDetail(plan, [item], false, user.id).items[0] } };
  } catch (error) {
    if (isAuthError(error)) return unauthorized();
    context.error("POST /api/gala-plans/{id}/items failed:", error);
    return { status: 500, jsonBody: { message: "Failed to add place to gala plan." } };
  }
}

export async function updateGalaPlanItem(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const user = await getCurrentUser(request);
    const plan = await getOwnedPlan(user.id, request.params.id);
    if (!plan) return notFound();

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body?.day_number !== undefined) updates.day_number = getPositiveInteger(body.day_number, 1);
    if (body?.sort_order !== undefined || body?.order_index !== undefined) {
      updates.sort_order = getPositiveInteger(body.sort_order ?? body.order_index, 1);
    }
    if (body?.time_label !== undefined) updates.time_label = getNullableString(body.time_label, 80) ?? null;
    if (body?.notes !== undefined) updates.notes = getNullableString(body.notes, 1000) ?? null;
    if (body?.estimated_minutes !== undefined) {
      const estimatedMinutes = getNullablePositiveInteger(body.estimated_minutes);
      if (estimatedMinutes === undefined) return { status: 400, jsonBody: { message: "estimated_minutes must be a positive integer or null." } };
      updates.estimated_minutes = estimatedMinutes;
    }

    const supabase = await getSupabaseAdminClient();
    const { data, error } = await (supabase.from("gala_plan_items") as any)
      .update(updates)
      .eq("id", request.params.itemId)
      .eq("plan_id", plan.id)
      .select(ITEM_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    if (!data) return notFound("Gala plan item not found.");
    return { status: 200, jsonBody: { item: mapPlanDetail(plan, [data as ItemRow], false, user.id).items[0] } };
  } catch (error) {
    if (isAuthError(error)) return unauthorized();
    context.error("PATCH /api/gala-plans/{id}/items/{itemId} failed:", error);
    return { status: 500, jsonBody: { message: "Failed to update gala plan item." } };
  }
}

export async function deleteGalaPlanItem(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const user = await getCurrentUser(request);
    const plan = await getOwnedPlan(user.id, request.params.id);
    if (!plan) return notFound();
    const supabase = await getSupabaseAdminClient();
    const { data, error } = await (supabase.from("gala_plan_items") as any)
      .delete()
      .eq("id", request.params.itemId)
      .eq("plan_id", plan.id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return notFound("Gala plan item not found.");
    return { status: 200, jsonBody: { message: "Place removed from gala plan." } };
  } catch (error) {
    if (isAuthError(error)) return unauthorized();
    context.error("DELETE /api/gala-plans/{id}/items/{itemId} failed:", error);
    return { status: 500, jsonBody: { message: "Failed to remove place from gala plan." } };
  }
}

export async function toggleGalaPlanHeart(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const user = await getCurrentUser(request);
    const plan = await getPlanById(request.params.id);
    if (!plan) return notFound();
    if (plan.user_id === user.id) return { status: 400, jsonBody: { message: "You cannot heart your own gala plan." } };
    if (plan.visibility !== "public" || !isActive(plan)) {
      return forbidden("Only public active gala plans can be hearted.");
    }

    const supabase = await getSupabaseAdminClient();
    const { data: existingHeart, error: lookupError } = await (supabase.from("gala_plan_hearts") as any)
      .select("id")
      .eq("gala_plan_id", plan.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (lookupError) throw lookupError;

    let hearted = false;
    if (existingHeart) {
      const { error } = await (supabase.from("gala_plan_hearts") as any)
        .delete()
        .eq("gala_plan_id", plan.id)
        .eq("user_id", user.id);
      if (error) throw error;
    } else {
      const { error } = await (supabase.from("gala_plan_hearts") as any)
        .insert({ gala_plan_id: plan.id, user_id: user.id });
      if (error) throw error;
      hearted = true;
    }

    const heartCount = await syncHeartCount(plan.id);
    return { status: 200, jsonBody: { hearted, viewer_has_hearted: hearted, heart_count: heartCount, hearts_count: heartCount } };
  } catch (error) {
    if (isAuthError(error)) return unauthorized();
    context.error("POST /api/gala-plans/{id}/heart failed:", error);
    return { status: 500, jsonBody: { message: "Failed to update gala plan heart." } };
  }
}

app.http("listMyGalaPlans", { methods: ["GET"], authLevel: "anonymous", route: "gala-plans", handler: listMyGalaPlans });
app.http("createGalaPlan", { methods: ["POST"], authLevel: "anonymous", route: "gala-plans", handler: createGalaPlan });
app.http("listFavoriteGalaPlans", { methods: ["GET"], authLevel: "anonymous", route: "gala-plans/favorites", handler: listFavoriteGalaPlans });
app.http("listLikedGalaPlansLegacy", { methods: ["GET"], authLevel: "anonymous", route: "gala-plans/liked", handler: listFavoriteGalaPlans });
app.http("getGalaPlanDetail", { methods: ["GET"], authLevel: "anonymous", route: "gala-plans/{id:guid}", handler: getGalaPlanDetail });
app.http("updateGalaPlan", { methods: ["PATCH"], authLevel: "anonymous", route: "gala-plans/{id:guid}", handler: updateGalaPlan });
app.http("deleteGalaPlan", { methods: ["DELETE"], authLevel: "anonymous", route: "gala-plans/{id:guid}", handler: deleteGalaPlan });
app.http("addGalaPlanItem", { methods: ["POST"], authLevel: "anonymous", route: "gala-plans/{id:guid}/items", handler: addGalaPlanItem });
app.http("updateGalaPlanItem", { methods: ["PATCH"], authLevel: "anonymous", route: "gala-plans/{id:guid}/items/{itemId:guid}", handler: updateGalaPlanItem });
app.http("deleteGalaPlanItem", { methods: ["DELETE"], authLevel: "anonymous", route: "gala-plans/{id:guid}/items/{itemId:guid}", handler: deleteGalaPlanItem });
app.http("toggleGalaPlanHeart", { methods: ["POST"], authLevel: "anonymous", route: "gala-plans/{id:guid}/heart", handler: toggleGalaPlanHeart });
