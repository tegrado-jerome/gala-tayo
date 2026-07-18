import { HttpRequest } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { validateJwt, type AuthenticatedUser } from "./auth";

export type ListVisibility = "everyone" | "followers" | "only_me";
export type GalaPlanVisibility = "private" | "followers" | "public" | "unlisted";

export type SocialProfile = {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  provider_avatar_url: string | null;
  bio: string | null;
  is_public: boolean;
  show_followers: ListVisibility | null;
  show_following: ListVisibility | null;
  default_gala_plan_visibility: GalaPlanVisibility | null;
  followers_count: number | null;
  following_count: number | null;
  onboarding_completed_at: string | null;
  created_at?: string;
  updated_at?: string;
};

export type SocialGalaPlan = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  slug: string | null;
  visibility: GalaPlanVisibility;
  status: string | null;
  published_at: string | null;
  hearts_count: number | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
};

export const PROFILE_COLUMNS =
  "user_id, username, avatar_url, provider_avatar_url, bio, is_public, show_followers, show_following, default_gala_plan_visibility, followers_count, following_count, onboarding_completed_at, created_at, updated_at";
const BASE_PROFILE_COLUMNS =
  "user_id, username, avatar_url, provider_avatar_url, bio, is_public, onboarding_completed_at, created_at, updated_at";
export const GALA_PLAN_COLUMNS =
  "id, user_id, title, description, slug, visibility, status, published_at, hearts_count, created_at, updated_at";

export const LIST_VISIBILITIES = new Set<ListVisibility>(["everyone", "followers", "only_me"]);
export const PLAN_VISIBILITIES = new Set<GalaPlanVisibility>(["private", "followers", "public", "unlisted"]);

export async function getCurrentUser(request: HttpRequest): Promise<AuthenticatedUser> {
  return validateJwt(request);
}

export async function getOptionalCurrentUser(request: HttpRequest): Promise<AuthenticatedUser | null> {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  try {
    return await validateJwt(request);
  } catch {
    return null;
  }
}

export function createSlug(input: string) {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || "gala-plan";
}

function shouldRetryWithBaseProfileColumns(error: unknown) {
  if (typeof error !== "object" || error === null) return false;

  const code = "code" in error ? String((error as { code?: unknown }).code || "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message || "").toLowerCase() : "";

  return code === "42703" || message.includes("column") || message.includes("schema cache");
}

function withProfileDefaults(profile: Partial<SocialProfile> | null) {
  return profile
    ? ({
        ...profile,
        show_followers: profile.show_followers ?? "everyone",
        show_following: profile.show_following ?? "everyone",
        default_gala_plan_visibility: profile.default_gala_plan_visibility ?? "private",
        followers_count: profile.followers_count ?? 0,
        following_count: profile.following_count ?? 0,
      } as SocialProfile)
    : null;
}

async function getLiveFollowCounts(userId: string) {
  const supabase = await getSupabaseAdminClient();
  const [{ count: followersCount, error: followersError }, { count: followingCount, error: followingError }] = await Promise.all([
    (supabase.from("user_follows") as any)
      .select("*", { count: "exact", head: true })
      .eq("following_id", userId)
      .eq("status", "accepted"),
    (supabase.from("user_follows") as any)
      .select("*", { count: "exact", head: true })
      .eq("follower_id", userId)
      .eq("status", "accepted"),
  ]);

  if (followersError) {
    throw followersError;
  }

  if (followingError) {
    throw followingError;
  }

  return {
    followers_count: followersCount ?? 0,
    following_count: followingCount ?? 0,
  };
}

async function withLiveCounts(profile: Partial<SocialProfile> | null) {
  const normalizedProfile = withProfileDefaults(profile);

  if (!normalizedProfile) {
    return null;
  }

  const liveCounts = await getLiveFollowCounts(normalizedProfile.user_id);

  return {
    ...normalizedProfile,
    followers_count: liveCounts.followers_count,
    following_count: liveCounts.following_count,
  } as SocialProfile;
}

export async function getProfileByUsername(username: string) {
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("profiles") as any)
    .select(PROFILE_COLUMNS)
    .eq("username", username.trim().toLowerCase())
    .maybeSingle();

  if (error) {
    if (shouldRetryWithBaseProfileColumns(error)) {
      const { data: baseData, error: baseError } = await (supabase.from("profiles") as any)
        .select(BASE_PROFILE_COLUMNS)
        .eq("username", username.trim().toLowerCase())
        .maybeSingle();

      if (baseError) {
        throw baseError;
      }

      return withLiveCounts(baseData as Partial<SocialProfile> | null);
    }

    throw error;
  }

  return withLiveCounts(data as SocialProfile | null);
}

export async function getProfileByUserId(userId: string) {
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("profiles") as any)
    .select(PROFILE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (shouldRetryWithBaseProfileColumns(error)) {
      const { data: baseData, error: baseError } = await (supabase.from("profiles") as any)
        .select(BASE_PROFILE_COLUMNS)
        .eq("user_id", userId)
        .maybeSingle();

      if (baseError) {
        throw baseError;
      }

      return withLiveCounts(baseData as Partial<SocialProfile> | null);
    }

    throw error;
  }

  return withLiveCounts(data as SocialProfile | null);
}

export async function isAcceptedFollower(viewerId: string | null | undefined, targetUserId: string) {
  if (!viewerId || viewerId === targetUserId) {
    return Boolean(viewerId && viewerId === targetUserId);
  }

  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("user_follows") as any)
    .select("id")
    .eq("follower_id", viewerId)
    .eq("following_id", targetUserId)
    .eq("status", "accepted")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function getRelationshipState(viewerId: string | null | undefined, targetUserId: string) {
  if (!viewerId) {
    return "not_following" as const;
  }

  if (viewerId === targetUserId) {
    return "self" as const;
  }

  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("user_follows") as any)
    .select("status")
    .eq("follower_id", viewerId)
    .eq("following_id", targetUserId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return "not_following" as const;
  }

  const status = String((data as { status?: string }).status || "");
  if (status === "accepted") return "following" as const;
  if (status === "pending") return "pending" as const;
  if (status === "blocked") return "blocked" as const;
  return "not_following" as const;
}

export async function canViewProfile(viewerId: string | null | undefined, profile: SocialProfile) {
  if (profile.is_public || viewerId === profile.user_id) {
    return true;
  }

  return isAcceptedFollower(viewerId, profile.user_id);
}

export async function canSeeFollowers(viewerId: string | null | undefined, targetProfile: SocialProfile) {
  if (viewerId === targetProfile.user_id) return true;
  const visibility = targetProfile.show_followers ?? "everyone";
  if (visibility === "everyone") return true;
  if (visibility === "followers") return isAcceptedFollower(viewerId, targetProfile.user_id);
  return false;
}

export async function canSeeFollowing(viewerId: string | null | undefined, targetProfile: SocialProfile) {
  if (viewerId === targetProfile.user_id) return true;
  const visibility = targetProfile.show_following ?? "everyone";
  if (visibility === "everyone") return true;
  if (visibility === "followers") return isAcceptedFollower(viewerId, targetProfile.user_id);
  return false;
}

export async function canViewGalaPlan(viewerId: string | null | undefined, galaPlan: SocialGalaPlan) {
  const status = galaPlan.status ?? "active";
  if (status === "deleted") return false;
  if (viewerId && viewerId === galaPlan.user_id) return true;
  return status === "active" && galaPlan.visibility === "public";
}

export function publicProfilePayload(profile: SocialProfile) {
  return {
    user_id: profile.user_id,
    username: profile.username,
    avatar_url: profile.avatar_url,
    provider_avatar_url: profile.provider_avatar_url,
    bio: profile.bio,
    is_public: profile.is_public,
    followers_count: profile.followers_count ?? 0,
    following_count: profile.following_count ?? 0,
  };
}
