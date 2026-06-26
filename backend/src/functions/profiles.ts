import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { validateJwt } from "../utils/auth";
import { convertImageToWebp, deleteR2Object, uploadWebpToR2 } from "../utils/r2ImageStorage";
import {
  meProfile as meProfileSocial,
  publicGalaPlanSocial,
  publicProfileGalaPlansSocial,
  publicProfileSocial,
} from "./socialAccounts";

type ProfileRow = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  avatar_storage_key: string | null;
  provider_avatar_url: string | null;
  bio: string | null;
  is_public: boolean;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type PublicProfileRow = Pick<
  ProfileRow,
  "user_id" | "username" | "display_name" | "avatar_url" | "provider_avatar_url" | "bio" | "created_at"
>;

type PublicOwnerProfileRow = Pick<
  ProfileRow,
  "user_id" | "username" | "display_name" | "avatar_url" | "provider_avatar_url" | "bio"
>;

type FollowCountRow = {
  follower_id: string;
  following_id: string;
};

type AccountUserRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  birthdate: string | null;
  role: string | null;
  last_seen_at: string | null;
  terms_accepted_at: string | null;
  privacy_accepted_at: string | null;
  terms_version: string | null;
  privacy_version: string | null;
  default_gala_plan_visibility: "private" | "followers_only" | "public" | null;
  followers_visibility: "private" | "followers_only" | "public" | null;
  following_visibility: "private" | "followers_only" | "public" | null;
  show_public_plans_on_profile: boolean | null;
};

type GalaPlanRow = {
  id: string;
  user_id: string;
  title: string;
  slug: string;
  description: string | null;
  visibility: "public";
  status: "active";
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type PlacePreviewRow = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  category: string | null;
};

type GalaPlanItemRow = {
  id: string;
  plan_id: string;
  place_id: string;
  day_number: number | null;
  sort_order: number | null;
  time_label: string | null;
  notes: string | null;
  estimated_minutes: number | null;
  places?: (PlacePreviewRow & {
    address?: string | null;
    budget_min?: number | string | null;
    latitude?: number | string | null;
    longitude?: number | string | null;
    image_url?: string | null;
  }) | null;
};

const PROFILE_COLUMNS =
  "user_id, username, display_name, avatar_url, avatar_storage_key, provider_avatar_url, bio, is_public, onboarding_completed_at, created_at, updated_at";
const ACCOUNT_USER_COLUMNS =
  "id, email, first_name, middle_name, last_name, birthdate, role, last_seen_at, terms_accepted_at, privacy_accepted_at, terms_version, privacy_version, default_gala_plan_visibility, followers_visibility, following_visibility, show_public_plans_on_profile";
const PUBLIC_PROFILE_COLUMNS = "user_id, username, display_name, avatar_url, provider_avatar_url, bio, created_at";
const PUBLIC_OWNER_PROFILE_COLUMNS = "user_id, username, display_name, avatar_url, provider_avatar_url, bio";
const PUBLIC_GALA_PLAN_COLUMNS =
  "id, user_id, title, slug, description, visibility, status, published_at, created_at, updated_at";
const USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/;
const EMAIL_LOOKING_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TERMS_VERSION = "2026-06-14";
const PRIVACY_VERSION = "2026-06-14";
const BIO_MAX_LENGTH = 280;
const DISPLAY_NAME_MAX_LENGTH = 80;
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

function normalizeUsername(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeSlug(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validateUsername(username: string): string | null {
  if (EMAIL_LOOKING_PATTERN.test(username)) {
    return "Username cannot be an email address.";
  }

  if (!USERNAME_PATTERN.test(username)) {
    return "Username must be 3-30 characters and use lowercase letters, numbers, underscores, or dots only.";
  }

  if (RESERVED_USERNAMES.has(username)) {
    return "That username is reserved. Please choose another one.";
  }

  if (username.startsWith(".")) {
    return "Username cannot start with a dot.";
  }

  if (username.endsWith(".")) {
    return "Username cannot end with a dot.";
  }

  if (username.includes("..")) {
    return "Username cannot contain consecutive dots.";
  }

  return null;
}

function getErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
}

function getSafeBio(value: unknown, allowUndefined = false) {
  if (value === undefined && allowUndefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, BIO_MAX_LENGTH) : null;
}

function getMetadataString(metadata: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const value = metadata?.[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function getTrimmedString(value: unknown, fieldName: string, maxLength: number, required = true) {
  if (value === undefined || value === null) {
    return { value: null as string | null, error: required ? `${fieldName} is required.` : null };
  }

  if (typeof value !== "string") {
    return { value: null as string | null, error: `${fieldName} must be a string.` };
  }

  const trimmed = value.trim();

  if (required && !trimmed) {
    return { value: null as string | null, error: `${fieldName} is required.` };
  }

  if (trimmed.length > maxLength) {
    return { value: null as string | null, error: `${fieldName} must be ${maxLength} characters or less.` };
  }

  return { value: trimmed || null, error: null };
}

function pickBodyValue(body: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (body[key] !== undefined) {
      return body[key];
    }
  }

  return undefined;
}

function canDeleteOwnedAvatarKey(userId: string, oldStorageKey: string | null | undefined, newStorageKey?: string | null) {
  if (!oldStorageKey) {
    return false;
  }

  if (newStorageKey && oldStorageKey === newStorageKey) {
    return false;
  }

  return oldStorageKey.startsWith(`avatars/${userId}/`);
}

function validateBirthdate(value: unknown) {
  const dateValue = getTrimmedString(value, "birthdate", 10);

  if (dateValue.error || !dateValue.value) {
    return { value: null as string | null, error: dateValue.error || "birthdate is required." };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue.value)) {
    return { value: null as string | null, error: "birthdate must use YYYY-MM-DD format." };
  }

  const date = new Date(`${dateValue.value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateValue.value) {
    return { value: null as string | null, error: "birthdate must be a real date." };
  }

  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const minDate = new Date("1900-01-01T00:00:00.000Z");

  if (date > todayUtc) {
    return { value: null as string | null, error: "birthdate cannot be in the future." };
  }

  if (date < minDate) {
    return { value: null as string | null, error: "birthdate cannot be before 1900-01-01." };
  }

  return { value: dateValue.value, error: null };
}

function unauthorized(): HttpResponseInit {
  return {
    status: 401,
    jsonBody: {
      message: "Missing or invalid Authorization header.",
    },
  };
}

async function getOptionalAuthenticatedUser(request: HttpRequest) {
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

function needsOnboarding(profile: ProfileRow | null) {
  return !profile?.onboarding_completed_at;
}

function hasRequiredOnboardingFields(user: AccountUserRow | null, profile: ProfileRow | null) {
  return Boolean(
      user?.first_name &&
      user.last_name &&
      user.terms_accepted_at &&
      user.privacy_accepted_at &&
      user.terms_version === TERMS_VERSION &&
      user.privacy_version === PRIVACY_VERSION &&
      profile?.username &&
      profile.display_name
  );
}

function mapAccountUser(row: AccountUserRow) {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    birthdate: row.birthdate,
    role: row.role ?? "member",
    lastSeenAt: row.last_seen_at,
    termsAcceptedAt: row.terms_accepted_at,
    privacyAcceptedAt: row.privacy_accepted_at,
    termsVersion: row.terms_version,
    privacyVersion: row.privacy_version,
    defaultGalaPlanVisibility: row.default_gala_plan_visibility ?? "private",
    followersVisibility: row.followers_visibility ?? "public",
    followingVisibility: row.following_visibility ?? "public",
    showPublicPlansOnProfile: row.show_public_plans_on_profile ?? true,
  };
}

function mapPublicProfile(row: ProfileRow | null) {
  return row
    ? {
        userId: row.user_id,
        username: row.username,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        providerAvatarUrl: row.provider_avatar_url,
        bio: row.bio,
        isPublic: row.is_public,
        onboardingCompletedAt: row.onboarding_completed_at,
      }
    : null;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsedValue = Number(value);

    if (Number.isFinite(parsedValue)) {
      return parsedValue;
    }
  }

  return null;
}

function isCompletedPublicProfile(profile: Pick<ProfileRow, "is_public" | "username" | "onboarding_completed_at"> | null) {
  return Boolean(profile?.is_public && profile.username && profile.onboarding_completed_at);
}

async function getCompletedPublicProfileByUsername(username: string) {
  if (!username) {
    return null;
  }

  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("profiles") as any)
    .select(PUBLIC_OWNER_PROFILE_COLUMNS + ", is_public, onboarding_completed_at")
    .eq("username", username)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const profile = data as (PublicOwnerProfileRow & {
    is_public: boolean;
    onboarding_completed_at: string | null;
  }) | null;

  return isCompletedPublicProfile(profile) ? profile : null;
}

async function getAccurateFollowCounts(userIds: string[]) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  const countsByUserId = new Map<string, { followers_count: number; following_count: number }>();

  for (const userId of uniqueUserIds) {
    countsByUserId.set(userId, {
      followers_count: 0,
      following_count: 0,
    });
  }

  if (uniqueUserIds.length === 0) {
    return countsByUserId;
  }

  const supabase = await getSupabaseAdminClient();
  const [{ data: followerRows, error: followersError }, { data: followingRows, error: followingError }] = await Promise.all([
    (supabase.from("user_follows") as any)
      .select("following_id")
      .in("following_id", uniqueUserIds)
      .eq("status", "accepted"),
    (supabase.from("user_follows") as any)
      .select("follower_id")
      .in("follower_id", uniqueUserIds)
      .eq("status", "accepted"),
  ]);

  if (followersError) {
    throw followersError;
  }

  if (followingError) {
    throw followingError;
  }

  for (const row of (followerRows || []) as Array<Pick<FollowCountRow, "following_id">>) {
    const current = countsByUserId.get(row.following_id);

    if (current) {
      current.followers_count += 1;
    }
  }

  for (const row of (followingRows || []) as Array<Pick<FollowCountRow, "follower_id">>) {
    const current = countsByUserId.get(row.follower_id);

    if (current) {
      current.following_count += 1;
    }
  }

  return countsByUserId;
}

function mapPreviewPlace(item: GalaPlanItemRow): PlacePreviewRow | null {
  const place = item.places;

  if (!place?.id || !place.name || !place.slug) {
    return null;
  }

  return {
    id: place.id,
    name: place.name,
    slug: place.slug,
    city: place.city ?? null,
    category: place.category ?? null,
  };
}

function sortPlanItems(firstItem: GalaPlanItemRow, secondItem: GalaPlanItemRow) {
  const firstDay = firstItem.day_number ?? 1;
  const secondDay = secondItem.day_number ?? 1;

  if (firstDay !== secondDay) {
    return firstDay - secondDay;
  }

  return (firstItem.sort_order ?? 0) - (secondItem.sort_order ?? 0);
}

async function getOrCreateProfile(userId: string, providerAvatarUrl: string | null = null): Promise<ProfileRow> {
  const supabase = await getSupabaseAdminClient();
  const profilesTable = supabase.from("profiles") as any;
  const { data: existingProfile, error: existingError } = await profilesTable
    .select(PROFILE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existingProfile) {
    const profile = existingProfile as ProfileRow;

    if (providerAvatarUrl && !profile.provider_avatar_url) {
      const { data: updatedProfile, error: updateError } = await profilesTable
        .update({ provider_avatar_url: providerAvatarUrl })
        .eq("user_id", userId)
        .select(PROFILE_COLUMNS)
        .single();

      if (updateError) {
        throw updateError;
      }

      return updatedProfile as ProfileRow;
    }

    return profile;
  }

  const { data: insertedProfile, error: insertError } = await profilesTable
    .insert({
      user_id: userId,
      provider_avatar_url: providerAvatarUrl,
    })
    .select(PROFILE_COLUMNS)
    .single();

  if (insertError) {
    if (getErrorCode(insertError) === "23505") {
      const { data: racedProfile, error: racedError } = await profilesTable
        .select(PROFILE_COLUMNS)
        .eq("user_id", userId)
        .single();

      if (racedError) {
        throw racedError;
      }

      return racedProfile as ProfileRow;
    }

    throw insertError;
  }

  return insertedProfile as ProfileRow;
}

async function getAccountUser(userId: string): Promise<AccountUserRow | null> {
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("users") as any)
    .select(ACCOUNT_USER_COLUMNS)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as AccountUserRow | null) ?? null;
}

async function getOrCreateAccountUser(userId: string, email: string | null | undefined): Promise<AccountUserRow> {
  const existing = await getAccountUser(userId);

  if (existing) {
    return existing;
  }

  const supabase = await getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await (supabase.from("users") as any)
    .insert({
      id: userId,
      email: email ?? null,
      role: "member",
      default_gala_plan_visibility: "private",
      followers_visibility: "public",
      following_visibility: "public",
      show_public_plans_on_profile: true,
      updated_at: now,
    })
    .select(ACCOUNT_USER_COLUMNS)
    .single();

  if (error) {
    if (getErrorCode(error) === "23505") {
      const racedUser = await getAccountUser(userId);

      if (racedUser) {
        return racedUser;
      }
    }

    throw error;
  }

  return data as AccountUserRow;
}

async function assertUsernameAvailable(username: string, userId: string) {
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("profiles") as any)
    .select("user_id")
    .ilike("username", username)
    .neq("user_id", userId)
    .limit(1);

  if (error) {
    throw error;
  }

  return !data || data.length === 0;
}

async function getUsernameAvailability(username: string, userId: string) {
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("profiles") as any)
    .select("user_id")
    .ilike("username", username)
    .limit(1);

  if (error) {
    throw error;
  }

  const owner = ((data || []) as Array<{ user_id: string }>)[0];
  return !owner || owner.user_id === userId;
}

async function saveProfile(
  userId: string,
  updates: {
    username?: string;
    display_name?: string | null;
    avatar_url?: string | null;
    avatar_storage_key?: string | null;
    provider_avatar_url?: string | null;
    bio?: string | null;
    is_public?: boolean;
    onboarding_completed_at?: string;
  }
) {
  const supabase = await getSupabaseAdminClient();
  const profilesTable = supabase.from("profiles") as any;
  await getOrCreateProfile(userId);

  const { data: updatedProfile, error } = await profilesTable
    .update(updates)
    .eq("user_id", userId)
    .select(PROFILE_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  return updatedProfile as ProfileRow;
}

export async function onboardingDraft(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const authUser = await validateJwt(request);
    const supabase = await getSupabaseAdminClient();
    const draftsTable = supabase.from("onboarding_drafts") as any;

    if (request.method === "GET") {
      const { data, error } = await draftsTable
        .select("draft_data, updated_at")
        .eq("user_id", authUser.id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return {
        status: 200,
        jsonBody: {
          draft: data?.draft_data ?? null,
          updatedAt: data?.updated_at ?? null,
        },
      };
    }

    const body = (await request.json().catch(() => null)) as { draft?: unknown } | null;

    if (!body || typeof body.draft !== "object" || body.draft === null) {
      return {
        status: 400,
        jsonBody: {
          message: "draft is required.",
        },
      };
    }

    const now = new Date().toISOString();
    const { data, error } = await draftsTable
      .upsert(
        {
          user_id: authUser.id,
          draft_data: body.draft,
          updated_at: now,
        },
        {
          onConflict: "user_id",
        }
      )
      .select("updated_at")
      .single();

    if (error) {
      throw error;
    }

    return {
      status: 200,
      jsonBody: {
        saved: true,
        updatedAt: data?.updated_at ?? now,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("authorization")) {
      return unauthorized();
    }

    context.error("Onboarding draft request failed:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Failed to save onboarding draft.",
      },
    };
  }
}

export async function currentUserMe(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const authUser = await validateJwt(request);
    const providerAvatarUrl = getMetadataString(authUser.metadata, ["avatar_url", "picture"]);
    const [existingAccountUser, existingProfile] = await Promise.all([
      getOrCreateAccountUser(authUser.id, authUser.email),
      getOrCreateProfile(authUser.id, providerAvatarUrl),
    ]);

    if (request.method === "PATCH") {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

      if (!body) {
        return {
          status: 400,
          jsonBody: {
            message: "Invalid JSON body.",
          },
        };
      }

      const accountUpdates: Record<string, unknown> = {};
      const profileUpdates: {
        display_name?: string | null;
      } = {};

      if (body.firstName !== undefined || body.first_name !== undefined) {
        const firstName = getTrimmedString(pickBodyValue(body, "first_name", "firstName"), "first_name", 80);

        if (firstName.error) {
          return {
            status: 400,
            jsonBody: {
              message: firstName.error,
            },
          };
        }

        accountUpdates.first_name = firstName.value;
      }

      if (body.middleName !== undefined || body.middle_name !== undefined) {
        const middleName = getTrimmedString(pickBodyValue(body, "middle_name", "middleName"), "middle_name", 80, false);

        if (middleName.error) {
          return {
            status: 400,
            jsonBody: {
              message: middleName.error,
            },
          };
        }

        accountUpdates.middle_name = middleName.value;
      }

      if (body.lastName !== undefined || body.last_name !== undefined) {
        const lastName = getTrimmedString(pickBodyValue(body, "last_name", "lastName"), "last_name", 80);

        if (lastName.error) {
          return {
            status: 400,
            jsonBody: {
              message: lastName.error,
            },
          };
        }

        accountUpdates.last_name = lastName.value;
      }

      if (body.birthdate !== undefined) {
        const birthdate = validateBirthdate(body.birthdate);

        if (birthdate.error) {
          return {
            status: 400,
            jsonBody: {
              message: birthdate.error,
            },
          };
        }

        accountUpdates.birthdate = birthdate.value;
      }

      if (body.displayName !== undefined || body.display_name !== undefined) {
        const displayName = getTrimmedString(
          pickBodyValue(body, "display_name", "displayName"),
          "display_name",
          DISPLAY_NAME_MAX_LENGTH
        );

        if (displayName.error) {
          return {
            status: 400,
            jsonBody: {
              message: displayName.error,
            },
          };
        }

        profileUpdates.display_name = displayName.value;
      }

      if (Object.keys(accountUpdates).length === 0 && Object.keys(profileUpdates).length === 0) {
        return {
          status: 400,
          jsonBody: {
            message: "At least one editable account field is required.",
          },
        };
      }

      let accountUser = existingAccountUser;
      let profile = existingProfile;

      if (Object.keys(accountUpdates).length > 0) {
        const supabase = await getSupabaseAdminClient();
        const { data: updatedAccountUser, error: accountError } = await (supabase.from("users") as any)
          .update({
            ...accountUpdates,
            updated_at: new Date().toISOString(),
          })
          .eq("id", authUser.id)
          .select(ACCOUNT_USER_COLUMNS)
          .single();

        if (accountError) {
          throw accountError;
        }

        accountUser = updatedAccountUser as AccountUserRow;
      }

      if (Object.keys(profileUpdates).length > 0) {
        profile = await saveProfile(authUser.id, profileUpdates);
      }

      return {
        status: 200,
        jsonBody: {
          user: mapAccountUser(accountUser),
          profile: mapPublicProfile(profile),
          onboarding: {
            completed: Boolean(profile.onboarding_completed_at),
          },
        },
      };
    }

    const accountUser = existingAccountUser;
    const profile = existingProfile;
    const completed = Boolean(profile.onboarding_completed_at);

    return {
      status: 200,
      jsonBody: {
        user: mapAccountUser(accountUser),
        profile: mapPublicProfile(profile),
        onboarding: {
          completed,
        },
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("authorization")) {
      return unauthorized();
    }

    context.error("GET /api/me failed:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Failed to load account.",
      },
    };
  }
}

export async function onboardingStatus(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const authUser = await validateJwt(request);
    const providerAvatarUrl = getMetadataString(authUser.metadata, ["avatar_url", "picture"]);
    const [accountUser, profile] = await Promise.all([
      getOrCreateAccountUser(authUser.id, authUser.email),
      getOrCreateProfile(authUser.id, providerAvatarUrl),
    ]);
    const completed = Boolean(profile.onboarding_completed_at);

    return {
      status: 200,
      jsonBody: {
        completed,
        needsOnboarding: !completed || !hasRequiredOnboardingFields(accountUser, profile),
        profile: profile
          ? {
              username: profile.username,
              displayName: profile.display_name,
              avatarUrl: profile.avatar_url,
              providerAvatarUrl: profile.provider_avatar_url,
            }
          : null,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("authorization")) {
      return unauthorized();
    }

    context.error("GET /api/onboarding/status failed:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Failed to load onboarding status.",
      },
    };
  }
}

export async function usernameAvailability(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const authUser = await validateJwt(request);
    const username = typeof request.query.get("username") === "string" ? request.query.get("username") || "" : "";
    const normalizedUsername = normalizeUsername(username);
    const validationError = validateUsername(normalizedUsername);

    if (validationError) {
      return {
        status: 400,
        jsonBody: {
          username,
          normalizedUsername,
          valid: false,
          available: false,
          reason: validationError,
        },
      };
    }

    const available = await getUsernameAvailability(normalizedUsername, authUser.id);

    return {
      status: 200,
      jsonBody: {
        username,
        normalizedUsername,
        valid: true,
        available,
        ...(available ? {} : { reason: "That username is already taken." }),
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("authorization")) {
      return unauthorized();
    }

    context.error("GET /api/profiles/username-availability failed:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Failed to check username.",
      },
    };
  }
}

export async function onboardingComplete(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const authUser = await validateJwt(request);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> & {
      firstName?: unknown;
      first_name?: unknown;
      middleName?: unknown;
      middle_name?: unknown;
      lastName?: unknown;
      last_name?: unknown;
      birthdate?: unknown;
      displayName?: unknown;
      display_name?: unknown;
      username?: unknown;
      avatarUrl?: unknown;
      avatar_url?: unknown;
      avatar_storage_key?: unknown;
      providerAvatarUrl?: unknown;
      provider_avatar_url?: unknown;
      bio?: unknown;
      isPublic?: unknown;
      profile_visibility?: unknown;
      show_followers?: unknown;
      show_following?: unknown;
      acceptedTerms?: unknown;
      accepted_terms?: unknown;
      acceptedPrivacy?: unknown;
      accepted_privacy?: unknown;
    } | null;

    if (!body) {
      return { status: 400, jsonBody: { message: "Invalid JSON body." } };
    }

    const firstName = getTrimmedString(pickBodyValue(body, "first_name", "firstName"), "first_name", 80);
    const middleName = getTrimmedString(pickBodyValue(body, "middle_name", "middleName"), "middle_name", 80, false);
    const lastName = getTrimmedString(pickBodyValue(body, "last_name", "lastName"), "last_name", 80);
    const birthdate = validateBirthdate(body.birthdate);
    const displayName = getTrimmedString(pickBodyValue(body, "display_name", "displayName"), "display_name", DISPLAY_NAME_MAX_LENGTH);
    const username = normalizeUsername(body.username);
    const usernameError = validateUsername(username);
    const avatarUrl = getTrimmedString(pickBodyValue(body, "avatar_url", "avatarUrl"), "avatar_url", 500, false);
    const avatarStorageKey = getTrimmedString(body.avatar_storage_key, "avatar_storage_key", 500, false);
    const providerAvatarUrl = getTrimmedString(pickBodyValue(body, "provider_avatar_url", "providerAvatarUrl"), "provider_avatar_url", 500, false);
    const profileVisibility = pickBodyValue(body, "profile_visibility");
    const showFollowers = pickBodyValue(body, "show_followers");
    const showFollowing = pickBodyValue(body, "show_following");
    const acceptedTerms = pickBodyValue(body, "accepted_terms", "acceptedTerms");
    const acceptedPrivacy = pickBodyValue(body, "accepted_privacy", "acceptedPrivacy");
    const isPublic =
      typeof profileVisibility === "string"
        ? profileVisibility === "public"
        : typeof body.isPublic === "boolean"
          ? body.isPublic
          : true;

    const validationError =
      firstName.error ||
      middleName.error ||
      lastName.error ||
      birthdate.error ||
      displayName.error ||
      (username ? usernameError : "username is required.") ||
      avatarUrl.error ||
      avatarStorageKey.error ||
      providerAvatarUrl.error ||
      (profileVisibility !== undefined && profileVisibility !== "public" && profileVisibility !== "private" ? "profile_visibility must be public or private." : null) ||
      (showFollowers !== undefined && typeof showFollowers !== "boolean" ? "show_followers must be a boolean." : null) ||
      (showFollowing !== undefined && typeof showFollowing !== "boolean" ? "show_following must be a boolean." : null) ||
      (acceptedTerms !== true ? "accepted_terms must be true." : null) ||
      (acceptedPrivacy !== true ? "accepted_privacy must be true." : null) ||
      (body.isPublic !== undefined && typeof body.isPublic !== "boolean" ? "isPublic must be a boolean." : null);

    if (validationError) {
      return {
        status: 400,
        jsonBody: {
          message: validationError,
        },
      };
    }

    if (!(await assertUsernameAvailable(username, authUser.id))) {
      return {
        status: 409,
        jsonBody: {
          message: "That username is already taken.",
        },
      };
    }

    const supabase = await getSupabaseAdminClient();
    const usersTable = supabase.from("users") as any;
    const profilesTable = supabase.from("profiles") as any;
    const now = new Date().toISOString();
    const existingProfile = await getOrCreateProfile(
      authUser.id,
      getMetadataString(authUser.metadata, ["avatar_url", "picture"])
    );
    const nextProviderAvatarUrl =
      providerAvatarUrl.value !== null
        ? providerAvatarUrl.value
        : existingProfile.provider_avatar_url || getMetadataString(authUser.metadata, ["avatar_url", "picture"]);
    const nextAvatarUrl = avatarUrl.value !== null ? avatarUrl.value : existingProfile.avatar_url;
    const nextAvatarStorageKey = avatarStorageKey.value !== null ? avatarStorageKey.value : existingProfile.avatar_storage_key;

    const existingAccountUser = await getOrCreateAccountUser(authUser.id, authUser.email);

    const { data: updatedUser, error: userError } = await usersTable
      .update({
        ...(authUser.email !== undefined ? { email: authUser.email } : {}),
        first_name: firstName.value,
        middle_name: middleName.value,
        last_name: lastName.value,
        birthdate: birthdate.value,
        terms_accepted_at: now,
        privacy_accepted_at: now,
        terms_version: TERMS_VERSION,
        privacy_version: PRIVACY_VERSION,
        default_gala_plan_visibility: existingAccountUser.default_gala_plan_visibility ?? "private",
        followers_visibility: showFollowers === false ? "private" : "public",
        following_visibility: showFollowing === false ? "private" : "public",
        show_public_plans_on_profile: existingAccountUser.show_public_plans_on_profile ?? true,
        updated_at: now,
      })
      .eq("id", authUser.id)
      .select(ACCOUNT_USER_COLUMNS)
      .single();

    if (userError) {
      throw userError;
    }

    const { data: updatedProfile, error: profileError } = await profilesTable
      .upsert(
        {
          user_id: authUser.id,
          username,
          display_name: displayName.value,
          avatar_url: nextAvatarUrl,
          avatar_storage_key: nextAvatarStorageKey,
          provider_avatar_url: nextProviderAvatarUrl,
          bio: getSafeBio(body.bio),
          is_public: isPublic,
          onboarding_completed_at: now,
          updated_at: now,
        },
        {
          onConflict: "user_id",
        }
      )
      .select(PROFILE_COLUMNS)
      .single();

    if (profileError) {
      if (getErrorCode(profileError) === "23505") {
        return {
          status: 409,
          jsonBody: {
            message: "That username is already taken.",
          },
        };
      }

      throw profileError;
    }

    try {
      await (supabase.from("user_policy_acceptances") as any).insert({
        user_id: authUser.id,
        terms_version: TERMS_VERSION,
        privacy_version: PRIVACY_VERSION,
        accepted_at: now,
        accepted_via: "onboarding_checkbox",
        ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
        user_agent: request.headers.get("user-agent") || null,
      });
    } catch {
      // Older deployments may not have the policy acceptance table yet.
    }

    try {
      await (supabase.from("onboarding_drafts") as any).delete().eq("user_id", authUser.id);
    } catch {
      // Draft cleanup is best-effort.
    }

    return {
      status: 200,
      jsonBody: {
        user: mapAccountUser(updatedUser as AccountUserRow),
        profile: mapPublicProfile(updatedProfile as ProfileRow),
        onboarding: {
          completed: true,
        },
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("authorization")) {
      return unauthorized();
    }

    if (getErrorCode(error) === "23505") {
      return {
        status: 409,
        jsonBody: {
          message: "That username is already taken.",
        },
      };
    }

    context.error("POST /api/onboarding/complete failed:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Failed to finish onboarding.",
      },
    };
  }
}

export async function profileAvatarUpload(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const authUser = await validateJwt(request);
    const formData = await request.formData();
    const file = formData.get("avatar") as any;

    if (!file || typeof file !== "object" || typeof file.size !== "number" || typeof file.type !== "string") {
      return {
        status: 400,
        jsonBody: {
          message: "Avatar file is required.",
        },
      };
    }

    const allowedTypes = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

    if (!allowedTypes.has(file.type)) {
      return {
        status: 400,
        jsonBody: {
          message: "Avatar must be a JPEG, PNG, or WebP image.",
        },
      };
    }

    if (file.size > 5 * 1024 * 1024) {
      return {
        status: 400,
        jsonBody: {
          message: "Avatar must be 5MB or smaller.",
        },
      };
    }

    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const isSvg = inputBuffer.subarray(0, 512).toString("utf8").toLowerCase().includes("<svg");
    const isGif = inputBuffer.length >= 6 && inputBuffer.subarray(0, 3).toString("ascii") === "GIF";

    if (isSvg || isGif) {
      return {
        status: 400,
        jsonBody: {
          message: "Avatar must be a JPEG, PNG, or WebP image.",
        },
      };
    }

    const webpBuffer = await convertImageToWebp(inputBuffer, { resizeAvatar: true });
    const supabase = await getSupabaseAdminClient();
    const profilesTable = supabase.from("profiles") as any;
    const existingProfile = await getOrCreateProfile(
      authUser.id,
      getMetadataString(authUser.metadata, ["avatar_url", "picture"])
    );
    const oldStorageKey = existingProfile.avatar_storage_key;
    const storageKey = `avatars/${authUser.id}/${randomUUID()}.webp`;
    const avatarUrl = await uploadWebpToR2(storageKey, webpBuffer);
    const now = new Date().toISOString();
    const { data: updatedProfile, error: updateError } = await profilesTable
      .update({
        avatar_url: avatarUrl,
        avatar_storage_key: storageKey,
        updated_at: now,
      })
      .eq("user_id", authUser.id)
      .select(PROFILE_COLUMNS)
      .single();

    if (updateError) {
      await deleteR2Object(storageKey).catch((cleanupError) => {
        context.error("Failed to delete newly uploaded avatar after profile update failure:", cleanupError);
      });
      throw updateError;
    }

    if (canDeleteOwnedAvatarKey(authUser.id, oldStorageKey, storageKey)) {
      await deleteR2Object(oldStorageKey).catch((cleanupError) => {
        context.error("Failed to delete replaced avatar object:", cleanupError);
      });
    }

    return {
      status: 200,
      jsonBody: {
        avatar_url: avatarUrl,
        avatar_storage_key: storageKey,
        profile: updatedProfile,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("authorization")) {
      return unauthorized();
    }

    context.error("POST /api/profiles/avatar failed:", error);

    return {
      status: error instanceof Error && error.message.includes("Image conversion") ? 501 : 500,
      jsonBody: {
        message: error instanceof Error ? error.message : "Failed to upload avatar.",
      },
    };
  }
}

export async function profileMe(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const user = await validateJwt(request);
    const providerAvatarUrl = getMetadataString(user.metadata, ["avatar_url", "picture"]);

    if (request.method === "GET") {
      const profile = await getOrCreateProfile(user.id, providerAvatarUrl);

      return {
        status: 200,
        jsonBody: {
          profile,
          needsOnboarding: needsOnboarding(profile),
        },
      };
    }

    const body = (await request.json().catch(() => null)) as {
      username?: unknown;
      bio?: unknown;
      is_public?: unknown;
    } | null;

    if (!body || (body.username === undefined && body.bio === undefined && body.is_public === undefined)) {
      return {
        status: 400,
        jsonBody: {
          message: "At least one editable profile field is required.",
        },
      };
    }

    const updates: {
      username?: string;
      bio?: string | null;
      is_public?: boolean;
    } = {};

    if (body.username !== undefined) {
      const username = normalizeUsername(body.username);
      const validationError = validateUsername(username);

      if (validationError) {
        return {
          status: 400,
          jsonBody: {
            message: validationError,
          },
        };
      }

      if (!(await assertUsernameAvailable(username, user.id))) {
        return {
          status: 409,
          jsonBody: {
            message: "That username is already taken.",
          },
        };
      }

      updates.username = username;
    }

    if (body.bio !== undefined) {
      updates.bio = getSafeBio(body.bio);
    }

    if (body.is_public !== undefined) {
      if (typeof body.is_public !== "boolean") {
        return {
          status: 400,
          jsonBody: {
            message: "is_public must be a boolean.",
          },
        };
      }

      updates.is_public = body.is_public;
    }

    const profile = await saveProfile(user.id, updates);

    return {
      status: 200,
      jsonBody: {
        profile,
        needsOnboarding: needsOnboarding(profile),
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("authorization")) {
      return unauthorized();
    }

    if (getErrorCode(error) === "23505") {
      return {
        status: 409,
        jsonBody: {
          message: "That username is already taken.",
        },
      };
    }

    context.error("Profile /me request failed:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Failed to load profile.",
      },
    };
  }
}

export async function profileOnboarding(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const user = await validateJwt(request);
    const body = (await request.json().catch(() => null)) as {
      username?: unknown;
      bio?: unknown;
    } | null;
    const username = normalizeUsername(body?.username);
    const validationError = validateUsername(username);

    if (validationError) {
      return {
        status: 400,
        jsonBody: {
          message: validationError,
        },
      };
    }

    if (!(await assertUsernameAvailable(username, user.id))) {
      return {
        status: 409,
        jsonBody: {
          message: "That username is already taken.",
        },
      };
    }

    const profile = await saveProfile(user.id, {
      username,
      bio: getSafeBio(body?.bio),
      is_public: true,
      onboarding_completed_at: new Date().toISOString(),
    });

    return {
      status: 200,
      jsonBody: {
        profile,
        needsOnboarding: false,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("authorization")) {
      return unauthorized();
    }

    if (getErrorCode(error) === "23505") {
      return {
        status: 409,
        jsonBody: {
          message: "That username is already taken.",
        },
      };
    }

    context.error("Profile onboarding failed:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Failed to finish onboarding.",
      },
    };
  }
}

export async function profileSearch(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const q = normalizeUsername(request.query.get("q"));

    if (q.length < 2) {
      return {
        status: 400,
        jsonBody: {
          message: "Search query must be at least 2 characters.",
        },
      };
    }

    if (q.length > 20) {
      return {
        status: 400,
        jsonBody: {
          message: "Search query must be 20 characters or fewer.",
        },
      };
    }

    const supabase = await getSupabaseAdminClient();
    const user = await getOptionalAuthenticatedUser(request);
    const { data, error } = await (supabase.from("profiles") as any)
      .select("user_id, username, display_name, avatar_url, provider_avatar_url, bio, is_public, followers_count, following_count")
      .eq("is_public", true)
      .not("username", "is", null)
      .not("onboarding_completed_at", "is", null)
      .like("username", `${q}%`)
      .order("username", { ascending: true })
      .limit(20);

    if (error) {
      throw error;
    }

    const results = [...((data || []) as Array<Pick<ProfileRow, "user_id" | "username" | "display_name" | "avatar_url" | "provider_avatar_url" | "bio">>)];

    if (user?.id && !results.some((profile) => profile.user_id === user.id)) {
      const { data: ownProfile, error: ownProfileError } = await (supabase.from("profiles") as any)
        .select("user_id, username, display_name, avatar_url, provider_avatar_url, bio, is_public, followers_count, following_count")
        .eq("user_id", user.id)
        .not("username", "is", null)
        .not("onboarding_completed_at", "is", null)
        .like("username", `${q}%`)
        .maybeSingle();

      if (ownProfileError) {
        throw ownProfileError;
      }

      if (ownProfile) {
        results.push(ownProfile as Pick<ProfileRow, "user_id" | "username" | "display_name" | "avatar_url" | "provider_avatar_url" | "bio">);
      }
    }

    results.sort((firstProfile, secondProfile) =>
      String(firstProfile.username || "").localeCompare(String(secondProfile.username || ""))
    );

    const accurateCountsByUserId = await getAccurateFollowCounts(results.map((profile) => profile.user_id));
    const hydratedResults = results.slice(0, 20).map((profile) => {
      const accurateCounts = accurateCountsByUserId.get(profile.user_id);

      return {
        ...profile,
        is_public: true,
        followers_count: accurateCounts?.followers_count ?? 0,
        following_count: accurateCounts?.following_count ?? 0,
      };
    });

    return {
      status: 200,
      jsonBody: {
        results: hydratedResults,
      },
    };
  } catch (error) {
    context.error("Profile search failed:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Failed to search profiles.",
      },
    };
  }
}

export async function profileSuggestions(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const supabase = await getSupabaseAdminClient();
    const user = await getOptionalAuthenticatedUser(request);
    let query = (supabase.from("profiles") as any)
      .select("user_id, username, display_name, avatar_url, provider_avatar_url, bio, is_public, followers_count, following_count, created_at")
      .eq("is_public", true)
      .not("username", "is", null)
      .not("onboarding_completed_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(12);

    if (user?.id) {
      query = query.neq("user_id", user.id);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const suggestions = (data || []) as Array<
      Pick<
        ProfileRow,
        "user_id" | "username" | "display_name" | "avatar_url" | "provider_avatar_url" | "bio" | "created_at"
      >
    >;
    const accurateCountsByUserId = await getAccurateFollowCounts(suggestions.map((profile) => profile.user_id));

    return {
      status: 200,
      jsonBody: {
        suggestions: suggestions.map((profile) => {
          const accurateCounts = accurateCountsByUserId.get(profile.user_id);

          return {
            ...profile,
            is_public: true,
            followers_count: accurateCounts?.followers_count ?? 0,
            following_count: accurateCounts?.following_count ?? 0,
          };
        }),
      },
    };
  } catch (error) {
    context.error("Profile suggestions failed:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Failed to load suggested users.",
      },
    };
  }
}

export async function publicProfile(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const username = normalizeUsername(request.params.username);

    if (username === "username-availability" || username === "username-available") {
      return usernameAvailability(request, context);
    }

    if (!username) {
      return {
        status: 404,
        jsonBody: {
          message: "Profile not found or not public.",
        },
      };
    }

    const supabase = await getSupabaseAdminClient();
    const { data, error } = await (supabase.from("profiles") as any)
      .select(PUBLIC_PROFILE_COLUMNS)
      .eq("is_public", true)
      .eq("username", username)
      .not("onboarding_completed_at", "is", null)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return {
        status: 404,
        jsonBody: {
          message: "Profile not found or not public.",
        },
      };
    }

    return {
      status: 200,
      jsonBody: {
        profile: data as PublicProfileRow,
      },
    };
  } catch (error) {
    context.error("Public profile lookup failed:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Failed to load profile.",
      },
    };
  }
}

export async function publicProfileGalaPlans(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const username = normalizeUsername(request.params.username);
    const profile = await getCompletedPublicProfileByUsername(username);

    if (!profile) {
      return {
        status: 404,
        jsonBody: {
          message: "Profile not found or not public.",
        },
      };
    }

    const supabase = await getSupabaseAdminClient();
    const { data: plansData, error: plansError } = await (supabase.from("gala_plans") as any)
      .select(PUBLIC_GALA_PLAN_COLUMNS)
      .eq("user_id", profile.user_id)
      .eq("visibility", "public")
      .eq("status", "active")
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false });

    if (plansError) {
      throw plansError;
    }

    const plans = (plansData || []) as GalaPlanRow[];
    const planIds = plans.map((plan) => plan.id);
    const itemsByPlanId = new Map<string, GalaPlanItemRow[]>();

    if (planIds.length > 0) {
      const { data: itemsData, error: itemsError } = await (supabase.from("gala_plan_items") as any)
        .select("id, plan_id, place_id, day_number, sort_order, places(id, name, slug, city, category)")
        .in("plan_id", planIds)
        .order("day_number", { ascending: true })
        .order("sort_order", { ascending: true });

      if (itemsError) {
        throw itemsError;
      }

      for (const item of (itemsData || []) as GalaPlanItemRow[]) {
        const currentItems = itemsByPlanId.get(item.plan_id) || [];
        currentItems.push(item);
        itemsByPlanId.set(item.plan_id, currentItems);
      }
    }

    return {
      status: 200,
      jsonBody: {
        plans: plans.map((plan) => {
          const items = (itemsByPlanId.get(plan.id) || []).sort(sortPlanItems);

          return {
            id: plan.id,
            title: plan.title,
            slug: plan.slug,
            description: plan.description,
            visibility: "public",
            status: "active",
            published_at: plan.published_at,
            updated_at: plan.updated_at,
            places_count: items.length,
            preview_places: items.slice(0, 3).map(mapPreviewPlace).filter(Boolean),
          };
        }),
      },
    };
  } catch (error) {
    context.error("Public profile gala plans lookup failed:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Failed to load public gala plans.",
      },
    };
  }
}

export async function publicGalaPlan(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const username = normalizeUsername(request.params.username);
    const slug = normalizeSlug(request.params.slug);
    const profile = await getCompletedPublicProfileByUsername(username);

    if (!profile || !slug) {
      return {
        status: 404,
        jsonBody: {
          message: "Gala plan not found or not public.",
        },
      };
    }

    const supabase = await getSupabaseAdminClient();
    const { data: planData, error: planError } = await (supabase.from("gala_plans") as any)
      .select(PUBLIC_GALA_PLAN_COLUMNS)
      .eq("user_id", profile.user_id)
      .eq("slug", slug)
      .eq("visibility", "public")
      .eq("status", "active")
      .maybeSingle();

    if (planError) {
      throw planError;
    }

    const plan = planData as GalaPlanRow | null;

    if (!plan) {
      return {
        status: 404,
        jsonBody: {
          message: "Gala plan not found or not public.",
        },
      };
    }

      const { data: itemsData, error: itemsError } = await (supabase.from("gala_plan_items") as any)
        .select("id, plan_id, place_id, day_number, sort_order, time_label, notes, estimated_minutes, places(id, name, slug, category, city, address, budget_min, latitude, longitude)")
        .eq("plan_id", plan.id)
        .order("day_number", { ascending: true })
        .order("sort_order", { ascending: true });

    if (itemsError) {
      throw itemsError;
    }

    return {
      status: 200,
      jsonBody: {
        plan: {
          id: plan.id,
          title: plan.title,
          slug: plan.slug,
          description: plan.description,
          published_at: plan.published_at,
          updated_at: plan.updated_at,
          owner: {
            user_id: profile.user_id,
            username: profile.username,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
            provider_avatar_url: profile.provider_avatar_url,
            bio: profile.bio,
          },
          items: ((itemsData || []) as GalaPlanItemRow[]).sort(sortPlanItems).map((item) => {
            const place = item.places;

            return {
              id: item.id,
              day_number: item.day_number ?? 1,
              sort_order: item.sort_order ?? 0,
              time_label: item.time_label,
              notes: item.notes,
              estimated_minutes: item.estimated_minutes,
              place: {
                id: place?.id ?? item.place_id,
                name: place?.name ?? "Unknown place",
                slug: place?.slug ?? item.place_id,
                category: place?.category ?? null,
                city: place?.city ?? null,
                address: place?.address ?? null,
                budget_min: toNullableNumber(place?.budget_min),
                latitude: toNullableNumber(place?.latitude),
                longitude: toNullableNumber(place?.longitude),
                ...(place?.image_url !== undefined ? { image_url: place.image_url } : {}),
              },
            };
          }),
        },
      },
    };
  } catch (error) {
    context.error("Public gala plan lookup failed:", error);

    return {
      status: 500,
      jsonBody: {
        message: "Failed to load gala plan.",
      },
    };
  }
}

app.http("profileMe", {
  methods: ["GET", "PUT", "PATCH"],
  authLevel: "anonymous",
  route: "profile/me",
  handler: meProfileSocial,
});

app.http("currentUserMe", {
  methods: ["GET", "PATCH"],
  authLevel: "anonymous",
  route: "me",
  handler: currentUserMe,
});

app.http("onboardingStatus", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "onboarding/status",
  handler: onboardingStatus,
});

app.http("onboardingDraft", {
  methods: ["GET", "PUT"],
  authLevel: "anonymous",
  route: "onboarding/draft",
  handler: onboardingDraft,
});

app.http("usernameAvailability", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "profiles/username-availability",
  handler: usernameAvailability,
});

app.http("usernameAvailable", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "profiles/username-available",
  handler: usernameAvailability,
});

app.http("profileAvatarUpload", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "profiles/avatar",
  handler: profileAvatarUpload,
});

app.http("onboardingComplete", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "onboarding/complete",
  handler: onboardingComplete,
});

app.http("profileOnboarding", {
  methods: ["PUT"],
  authLevel: "anonymous",
  route: "profile/onboarding",
  handler: profileOnboarding,
});

app.http("profileSearch", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "profiles/search",
  handler: profileSearch,
});

app.http("profileSuggestions", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "profiles/suggestions",
  handler: profileSuggestions,
});

app.http("publicProfile", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "profiles/{username}",
  handler: (request, context) => {
    const username = normalizeUsername(request.params.username);

    if (username === "username-availability" || username === "username-available") {
      return usernameAvailability(request, context);
    }

    return publicProfileSocial(request, context);
  },
});

app.http("publicProfileGalaPlans", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "profiles/{username}/gala-plans",
  handler: publicProfileGalaPlansSocial,
});

app.http("publicGalaPlan", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "gala-plans/{username}/{slug}",
  handler: publicGalaPlanSocial,
});
