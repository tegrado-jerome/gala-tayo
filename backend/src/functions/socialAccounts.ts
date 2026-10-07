import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { isMealStopRow } from "../domain/queryIntent";
import { checkEndpointRateLimit, checkPublicReadRateLimit } from "../utils/redisRateLimit";
import {
  canSeeFollowers,
  canSeeFollowing,
  canViewGalaPlan,
  canViewProfile,
  createSlug,
  GALA_PLAN_COLUMNS,
  getCurrentUser,
  getOptionalCurrentUser,
  getProfileByUsername,
  getProfileByUserId,
  getRelationshipState,
  LIST_VISIBILITIES,
  PLAN_VISIBILITIES,
  PROFILE_COLUMNS,
  publicProfilePayload,
  type GalaPlanVisibility,
  type SocialGalaPlan,
  type SocialProfile,
} from "../utils/social";

const USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/;
const EMAIL_LOOKING_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESERVED_USERNAMES = new Set([
  "admin",
  "api",
  "auth",
  "login",
  "logout",
  "signup",
  "settings",
  "profile",
  "profiles",
  "user",
  "users",
  "search",
  "support",
  "help",
  "terms",
  "privacy",
  "gala",
  "galatayo",
]);

type PlanItemRow = {
  id: string;
  plan_id: string;
  place_id: string;
  day_number: number | null;
  sort_order: number | null;
  notes: string | null;
  time_label?: string | null;
  estimated_minutes?: number | null;
  created_at: string;
  updated_at: string;
  places?: {
    id: string;
    name: string;
    slug: string;
    category: string | null;
    city: string | null;
    address?: string | null;
    budget_min?: number | string | null;
    latitude?: number | string | null;
    longitude?: number | string | null;
    tags?: string[] | null;
    good_for?: string[] | null;
  } | null;
};

type FollowRow = {
  id: string;
  follower_id: string;
  following_id: string;
  status: "pending" | "accepted" | "rejected" | "blocked";
  created_at: string;
};

type FollowListProfileRow = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  provider_avatar_url: string | null;
  bio: string | null;
};

function unauthorized(): HttpResponseInit {
  return { status: 401, jsonBody: { message: "Missing or invalid Authorization header." } };
}

function forbidden(message: string): HttpResponseInit {
  return { status: 403, jsonBody: { message } };
}

function normalizeUsername(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validateUsername(username: string) {
  if (EMAIL_LOOKING_PATTERN.test(username)) return "Username cannot be an email address.";
  if (!USERNAME_PATTERN.test(username)) {
    return "Username must be 3-30 characters and use lowercase letters, numbers, underscores, or dots only.";
  }
  if (RESERVED_USERNAMES.has(username)) return "That username is reserved. Please choose another one.";
  if (username.startsWith(".") || username.endsWith(".") || username.includes("..")) {
    return "Username cannot start/end with a dot or contain consecutive dots.";
  }
  return null;
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getNullableString(value: unknown, maxLength = 2000) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function getErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
}

function mapPlanSummary(plan: SocialGalaPlan, items: PlanItemRow[], viewerHasHeart = false, owner?: SocialProfile | null) {
  return {
    id: plan.id,
    user_id: plan.user_id,
    title: plan.title,
    slug: plan.slug,
    description: plan.description,
    visibility: plan.visibility,
    status: plan.status ?? "active",
    published_at: plan.published_at,
    hearts_count: plan.hearts_count ?? 0,
    viewer_has_hearted: viewerHasHeart,
    is_active: (plan.status ?? "active") === "active",
    created_at: plan.created_at,
    updated_at: plan.updated_at,
    places_count: items.length,
    preview_places: items.slice(0, 3).map((item) => item.places).filter(Boolean),
    owner: owner
      ? {
          user_id: owner.user_id,
          username: owner.username,
          avatar_url: owner.avatar_url,
          provider_avatar_url: owner.provider_avatar_url,
        }
      : undefined,
  };
}

function toNullableNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function mapPlanDetail(plan: SocialGalaPlan, items: PlanItemRow[], viewerHasHeart = false, owner?: SocialProfile | null) {
  return {
    ...mapPlanSummary(plan, items, viewerHasHeart, owner),
    items: items.map((item, index) => {
      const place = item.places;
      return {
        id: item.id,
        plan_id: item.plan_id,
        place_id: item.place_id,
        order_index: item.sort_order ?? index + 1,
        day_number: item.day_number ?? 1,
        sort_order: item.sort_order ?? index + 1,
        time_label: item.time_label ?? null,
        notes: item.notes,
        estimated_minutes: item.estimated_minutes ?? null,
        created_at: item.created_at,
        updated_at: item.updated_at,
        place: {
          id: place?.id ?? item.place_id,
          name: place?.name ?? "Unknown place",
          slug: place?.slug ?? item.place_id,
          category: place?.category ?? null,
          city: place?.city ?? null,
          address: place?.address ?? null,
          budget_min: toNullableNumber(place?.budget_min),
          meal_stop: isMealStopRow(place),
          latitude: toNullableNumber(place?.latitude),
          longitude: toNullableNumber(place?.longitude),
        },
      };
    }),
  };
}

async function assertUsernameAvailable(username: string, userId: string) {
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("profiles") as any)
    .select("user_id")
    .ilike("username", username)
    .neq("user_id", userId)
    .limit(1);

  if (error) throw error;
  return !data || data.length === 0;
}

async function getPlanItems(planIds: string[]) {
  if (planIds.length === 0) return new Map<string, PlanItemRow[]>();

  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("gala_plan_items") as any)
    .select("id, plan_id, place_id, day_number, sort_order, time_label, notes, estimated_minutes, created_at, updated_at, places(id, name, slug, category, city, address, budget_min, latitude, longitude, tags, good_for)")
    .in("plan_id", planIds)
    .order("day_number", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) throw error;

  const byPlanId = new Map<string, PlanItemRow[]>();
  for (const item of (data || []) as PlanItemRow[]) {
    const items = byPlanId.get(item.plan_id) || [];
    items.push(item);
    byPlanId.set(item.plan_id, items);
  }
  return byPlanId;
}

async function getHeartedPlanIds(viewerId: string | null | undefined, planIds: string[]) {
  if (!viewerId || planIds.length === 0) return new Set<string>();
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("gala_plan_hearts") as any)
    .select("gala_plan_id")
    .eq("user_id", viewerId)
    .in("gala_plan_id", planIds);
  if (error) throw error;
  return new Set(((data || []) as Array<{ gala_plan_id: string }>).map((row) => row.gala_plan_id));
}

async function getPlanById(planId: string) {
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("gala_plans") as any)
    .select(GALA_PLAN_COLUMNS)
    .eq("id", planId)
    .maybeSingle();
  if (error) throw error;
  return data as SocialGalaPlan | null;
}

async function getPlanCounts(planId: string) {
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("gala_plans") as any)
    .select("hearts_count")
    .eq("id", planId)
    .single();
  if (error) throw error;
  return (data as { hearts_count: number | null }).hearts_count ?? 0;
}

async function ensureUniqueSlug(userId: string, title: string, existingPlanId?: string) {
  const supabase = await getSupabaseAdminClient();
  const base = createSlug(title);

  for (let index = 0; index < 50; index += 1) {
    const slug = index === 0 ? base : `${base}-${index + 1}`;
    let query = (supabase.from("gala_plans") as any).select("id").eq("user_id", userId).eq("slug", slug);
    if (existingPlanId) query = query.neq("id", existingPlanId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) return slug;
  }

  return `${base}-${Date.now()}`;
}

export async function meProfile(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const user = await getCurrentUser(request);
    const supabase = await getSupabaseAdminClient();

    if (request.method === "GET") {
      const profile = await getProfileByUserId(user.id);
      return { status: 200, jsonBody: { profile } };
    }

    const rateCheck = await checkEndpointRateLimit(request, "profile-update-social", 10, 60);
    if (!rateCheck.allowed && rateCheck.response) {
      return rateCheck.response;
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const updates: Record<string, unknown> = {};

    if (!body) return { status: 400, jsonBody: { message: "Profile payload is required." } };

    if (body.username !== undefined) {
      const username = normalizeUsername(body.username);
      const validationError = validateUsername(username);
      if (validationError) return { status: 400, jsonBody: { message: validationError } };
      if (!(await assertUsernameAvailable(username, user.id))) {
        return { status: 409, jsonBody: { message: "That username is already taken." } };
      }
      updates.username = username;
    }

    if (body.bio !== undefined) updates.bio = getNullableString(body.bio, 280);
    if (body.avatar_url !== undefined) updates.avatar_url = getNullableString(body.avatar_url, 500);

    if (body.is_public !== undefined) {
      if (typeof body.is_public !== "boolean") return { status: 400, jsonBody: { message: "is_public must be a boolean." } };
      updates.is_public = body.is_public;
      updates.show_followers = body.is_public ? "everyone" : "only_me";
      updates.show_following = body.is_public ? "everyone" : "only_me";
    }

    for (const key of ["show_followers", "show_following"] as const) {
      if (body[key] !== undefined) {
        const value = getString(body[key]);
        if (!LIST_VISIBILITIES.has(value as any)) return { status: 400, jsonBody: { message: `Invalid ${key}.` } };
        updates[key] = value;
      }
    }

    if (body.default_gala_plan_visibility !== undefined) {
      const value = getString(body.default_gala_plan_visibility);
      if (!PLAN_VISIBILITIES.has(value as any)) {
        return { status: 400, jsonBody: { message: "Invalid default gala plan visibility." } };
      }
      updates.default_gala_plan_visibility = value;
    }

    if (Object.keys(updates).length === 0) {
      return { status: 400, jsonBody: { message: "At least one editable profile field is required." } };
    }

    const { data, error } = await (supabase.from("profiles") as any)
      .update(updates)
      .eq("user_id", user.id)
      .select(PROFILE_COLUMNS)
      .single();
    if (error) throw error;
    const profile = await getProfileByUserId((data as SocialProfile).user_id);
    return { status: 200, jsonBody: { profile } };
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("authorization")) return unauthorized();
    if (getErrorCode(error) === "23505") return { status: 409, jsonBody: { message: "That username is already taken." } };
    context.error("/api/me/profile failed:", error);
    return { status: 500, jsonBody: { message: "Failed to update profile." } };
  }
}

export async function publicProfileSocial(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const rateCheck = await checkPublicReadRateLimit(request, "public-profile", 30, 60);
    if (!rateCheck.allowed && rateCheck.response) {
      return rateCheck.response;
    }

    const username = normalizeUsername(request.params.username);
    const viewer = await getOptionalCurrentUser(request);
    const profile = await getProfileByUsername(username);
    if (!profile?.username || !profile.onboarding_completed_at) {
      return { status: 404, jsonBody: { message: "Profile not found." } };
    }

    const relationshipState = await getRelationshipState(viewer?.id, profile.user_id);
    const canView = await canViewProfile(viewer?.id, profile);
    let visiblePlans: ReturnType<typeof mapPlanSummary>[] = [];

    if (canView) {
      try {
        visiblePlans = await getVisiblePlansForProfile(profile, viewer?.id);
      } catch (error) {
        context.error("Public profile plans lookup failed:", error);
      }
    }

    return {
      status: 200,
      jsonBody: {
        profile: publicProfilePayload(profile),
        relationship_state: relationshipState,
        can_view_profile: canView,
        locked: !canView,
        message: canView ? null : "This profile is private. Follow to request access.",
        plans: visiblePlans,
      },
    };
  } catch (error) {
    context.error("Public profile lookup failed:", error);
    return { status: 500, jsonBody: { message: "Failed to load profile." } };
  }
}

async function getVisiblePlansForProfile(profile: SocialProfile, viewerId: string | null | undefined) {
  const supabase = await getSupabaseAdminClient();
  let query = (supabase.from("gala_plans") as any)
    .select(GALA_PLAN_COLUMNS)
    .eq("user_id", profile.user_id)
    .eq("status", "active")
    .order("updated_at", { ascending: false });

  if (viewerId === profile.user_id) {
    // Owner sees their own active plans with visibility labels.
  } else {
    query = query.eq("visibility", "public");
  }

  const { data, error } = await query;
  if (error) throw error;
  const plans = (data || []) as SocialGalaPlan[];
  const itemsByPlan = await getPlanItems(plans.map((plan) => plan.id));
  const hearted = await getHeartedPlanIds(viewerId, plans.map((plan) => plan.id));
  return plans.map((plan) => mapPlanSummary(plan, itemsByPlan.get(plan.id) || [], hearted.has(plan.id), profile));
}

export async function publicProfileGalaPlansSocial(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const viewer = await getOptionalCurrentUser(request);
    const profile = await getProfileByUsername(normalizeUsername(request.params.username));
    if (!profile?.username) return { status: 404, jsonBody: { message: "Profile not found." } };
    return { status: 200, jsonBody: { plans: await getVisiblePlansForProfile(profile, viewer?.id) } };
  } catch (error) {
    context.error("Profile gala plans lookup failed:", error);
    return { status: 500, jsonBody: { message: "Failed to load gala plans." } };
  }
}

export async function followProfile(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const rateCheck = await checkEndpointRateLimit(request, "follow", 10, 60);
    if (!rateCheck.allowed && rateCheck.response) {
      return rateCheck.response;
    }

    const user = await getCurrentUser(request);
    const target = await getProfileByUsername(normalizeUsername(request.params.username));
    if (!target?.username) return { status: 404, jsonBody: { message: "Profile not found." } };
    if (target.user_id === user.id) return { status: 400, jsonBody: { message: "You cannot follow yourself." } };

    const status = target.is_public ? "accepted" : "pending";
    const supabase = await getSupabaseAdminClient();
    const { error } = await (supabase.from("user_follows") as any)
      .upsert(
        { follower_id: user.id, following_id: target.user_id, status, updated_at: new Date().toISOString() },
        { onConflict: "follower_id,following_id" }
      );
    if (error) throw error;

    const refreshed = await getProfileByUsername(target.username);
    return {
      status: 200,
      jsonBody: {
        relationship_state: status === "accepted" ? "following" : "pending",
        followers_count: refreshed?.followers_count ?? target.followers_count ?? 0,
        following_count: refreshed?.following_count ?? target.following_count ?? 0,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("authorization")) return unauthorized();
    context.error("Follow profile failed:", error);
    return { status: 500, jsonBody: { message: "Failed to follow profile." } };
  }
}

export async function unfollowProfile(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const rateCheck = await checkEndpointRateLimit(request, "unfollow", 10, 60);
    if (!rateCheck.allowed && rateCheck.response) {
      return rateCheck.response;
    }

    const user = await getCurrentUser(request);
    const target = await getProfileByUsername(normalizeUsername(request.params.username));
    if (!target?.username) return { status: 404, jsonBody: { message: "Profile not found." } };
    const supabase = await getSupabaseAdminClient();
    const { error } = await (supabase.from("user_follows") as any)
      .delete()
      .eq("follower_id", user.id)
      .eq("following_id", target.user_id);
    if (error) throw error;
    const refreshed = await getProfileByUsername(target.username);
    return {
      status: 200,
      jsonBody: {
        relationship_state: "not_following",
        followers_count: refreshed?.followers_count ?? target.followers_count ?? 0,
        following_count: refreshed?.following_count ?? target.following_count ?? 0,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("authorization")) return unauthorized();
    context.error("Unfollow profile failed:", error);
    return { status: 500, jsonBody: { message: "Failed to update follow state." } };
  }
}

async function getProfilesByUserId(userIds: string[]) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  const profilesByUserId = new Map<string, FollowListProfileRow>();

  if (uniqueUserIds.length === 0) {
    return profilesByUserId;
  }

  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("profiles") as any)
    .select("user_id, username, display_name, avatar_url, provider_avatar_url, bio")
    .in("user_id", uniqueUserIds);

  if (error) throw error;

  for (const profile of (data || []) as FollowListProfileRow[]) {
    profilesByUserId.set(profile.user_id, profile);
  }

  return profilesByUserId;
}

async function followList(request: HttpRequest, context: InvocationContext, kind: "followers" | "following"): Promise<HttpResponseInit> {
  try {
    const rateCheck = await checkPublicReadRateLimit(request, `follow-${kind}`, 30, 60);
    if (!rateCheck.allowed && rateCheck.response) {
      return rateCheck.response;
    }

    const viewer = await getOptionalCurrentUser(request);
    const target = await getProfileByUsername(normalizeUsername(request.params.username));
    if (!target?.username) return { status: 404, jsonBody: { message: "Profile not found." } };
    const allowed = kind === "followers" ? await canSeeFollowers(viewer?.id, target) : await canSeeFollowing(viewer?.id, target);
    if (!allowed) return forbidden("This list is private.");

    const supabase = await getSupabaseAdminClient();
    const column = kind === "followers" ? "following_id" : "follower_id";
    const { data, error } = await (supabase.from("user_follows") as any)
      .select("id, follower_id, following_id, status, created_at")
      .eq(column, target.user_id)
      .eq("status", "accepted")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    const follows = (data || []) as FollowRow[];
    const userIds = follows.map((follow) => (kind === "followers" ? follow.follower_id : follow.following_id));
    const profilesByUserId = await getProfilesByUserId(userIds);
    const users = userIds.map((userId) => profilesByUserId.get(userId)).filter(Boolean);

    return { status: 200, jsonBody: { users } };
  } catch (error) {
    context.error(`Profile ${kind} lookup failed:`, error);
    return { status: 500, jsonBody: { message: `Failed to load ${kind}.` } };
  }
}

export function profileFollowers(request: HttpRequest, context: InvocationContext) {
  return followList(request, context, "followers");
}

export function profileFollowing(request: HttpRequest, context: InvocationContext) {
  return followList(request, context, "following");
}

export async function myFollowRequests(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const rateCheck = await checkPublicReadRateLimit(request, "follow-requests", 20, 60);
    if (!rateCheck.allowed && rateCheck.response) {
      return rateCheck.response;
    }

    const user = await getCurrentUser(request);
    const supabase = await getSupabaseAdminClient();
    const { data, error } = await (supabase.from("user_follows") as any)
      .select("id, follower_id, following_id, status, created_at")
      .eq("following_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const requests = (data || []) as FollowRow[];
    const profilesByUserId = await getProfilesByUserId(requests.map((follow) => follow.follower_id));

    return {
      status: 200,
      jsonBody: {
        requests: requests.map((follow) => ({
          ...follow,
          follower: profilesByUserId.get(follow.follower_id) || {
            user_id: follow.follower_id,
            username: null,
            avatar_url: null,
            provider_avatar_url: null,
            bio: null,
          },
        })),
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("authorization")) return unauthorized();
    context.error("Follow requests lookup failed:", error);
    return { status: 500, jsonBody: { message: "Failed to load follow requests." } };
  }
}

async function respondToFollowRequest(request: HttpRequest, context: InvocationContext, status: "accepted" | "rejected") {
  try {
    const user = await getCurrentUser(request);
    const supabase = await getSupabaseAdminClient();
    const { data, error } = await (supabase.from("user_follows") as any)
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", request.params.id)
      .eq("following_id", user.id)
      .eq("status", "pending")
      .select("id, status")
      .maybeSingle();
    if (error) throw error;
    if (!data) return { status: 404, jsonBody: { message: "Follow request not found." } };
    return { status: 200, jsonBody: { request: data } };
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("authorization")) return unauthorized();
    context.error("Follow request response failed:", error);
    return { status: 500, jsonBody: { message: "Failed to update follow request." } };
  }
}

export function acceptFollowRequest(request: HttpRequest, context: InvocationContext) {
  return respondToFollowRequest(request, context, "accepted");
}

export function rejectFollowRequest(request: HttpRequest, context: InvocationContext) {
  return respondToFollowRequest(request, context, "rejected");
}

export async function publicGalaPlanSocial(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const viewer = await getOptionalCurrentUser(request);
    const profile = await getProfileByUsername(normalizeUsername(request.params.username));
    if (!profile?.username) return { status: 404, jsonBody: { message: "Gala plan not found." } };

    const supabase = await getSupabaseAdminClient();
    const { data, error } = await (supabase.from("gala_plans") as any)
      .select(GALA_PLAN_COLUMNS)
      .eq("user_id", profile.user_id)
      .eq("slug", getString(request.params.slug))
      .eq("status", "active")
      .maybeSingle();
    if (error) throw error;
    const plan = data as SocialGalaPlan | null;
    if (!plan) return { status: 404, jsonBody: { message: "Gala plan not found." } };

    const allowed = await canViewGalaPlan(viewer?.id, plan);
    if (!allowed) {
      const message = plan.visibility === "followers"
        ? "This gala plan is only visible to the owner's followers."
        : "This gala plan is private.";
      return { status: 403, jsonBody: { message, locked: true, visibility: plan.visibility } };
    }

    const items = await getPlanItems([plan.id]);
    const hearted = await getHeartedPlanIds(viewer?.id, [plan.id]);
    return { status: 200, jsonBody: { plan: mapPlanDetail(plan, items.get(plan.id) || [], hearted.has(plan.id), profile) } };
  } catch (error) {
    context.error("Public gala plan lookup failed:", error);
    return { status: 500, jsonBody: { message: "Failed to load gala plan." } };
  }
}

export async function heartGalaPlan(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const user = await getCurrentUser(request);
    const plan = await getPlanById(request.params.id);
    if (!plan) return { status: 404, jsonBody: { message: "Gala plan not found." } };
    if (plan.user_id === user.id) return { status: 400, jsonBody: { message: "You can't heart your own gala plan." } };
    if (!(await canViewGalaPlan(user.id, plan))) return forbidden("You cannot heart this gala plan.");

    const supabase = await getSupabaseAdminClient();
    const { error } = await (supabase.from("gala_plan_hearts") as any)
      .upsert({ gala_plan_id: plan.id, user_id: user.id }, { onConflict: "gala_plan_id,user_id", ignoreDuplicates: true });
    if (error) throw error;
    return { status: 200, jsonBody: { viewer_has_hearted: true, hearts_count: await getPlanCounts(plan.id) } };
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("authorization")) return unauthorized();
    context.error("Heart gala plan failed:", error);
    return { status: 500, jsonBody: { message: "Failed to heart gala plan." } };
  }
}

export async function unheartGalaPlan(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const user = await getCurrentUser(request);
    const plan = await getPlanById(request.params.id);
    if (!plan) return { status: 404, jsonBody: { message: "Gala plan not found." } };
    const supabase = await getSupabaseAdminClient();
    const { error } = await (supabase.from("gala_plan_hearts") as any)
      .delete()
      .eq("gala_plan_id", plan.id)
      .eq("user_id", user.id);
    if (error) throw error;
    return { status: 200, jsonBody: { viewer_has_hearted: false, hearts_count: await getPlanCounts(plan.id) } };
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("authorization")) return unauthorized();
    context.error("Unheart gala plan failed:", error);
    return { status: 500, jsonBody: { message: "Failed to unheart gala plan." } };
  }
}

export { ensureUniqueSlug };

app.http("meProfileSocial", { methods: ["GET", "PATCH"], authLevel: "anonymous", route: "me/profile", handler: meProfile });
app.http("profileFollow", { methods: ["POST"], authLevel: "anonymous", route: "profiles/{username}/follow", handler: followProfile });
app.http("profileUnfollow", { methods: ["DELETE"], authLevel: "anonymous", route: "profiles/{username}/follow", handler: unfollowProfile });
app.http("profileFollowers", { methods: ["GET"], authLevel: "anonymous", route: "profiles/{username}/followers", handler: profileFollowers });
app.http("profileFollowing", { methods: ["GET"], authLevel: "anonymous", route: "profiles/{username}/following", handler: profileFollowing });
app.http("myFollowRequests", { methods: ["GET"], authLevel: "anonymous", route: "me/follow-requests", handler: myFollowRequests });
app.http("acceptFollowRequest", { methods: ["POST"], authLevel: "anonymous", route: "follow-requests/{id}/accept", handler: acceptFollowRequest });
app.http("rejectFollowRequest", { methods: ["POST"], authLevel: "anonymous", route: "follow-requests/{id}/reject", handler: rejectFollowRequest });
app.http("publicGalaPlanSocial", { methods: ["GET"], authLevel: "anonymous", route: "profiles/{username}/gala-plans/{slug}", handler: publicGalaPlanSocial });
