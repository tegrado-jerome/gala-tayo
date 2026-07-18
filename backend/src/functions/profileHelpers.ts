import { HttpRequest, HttpResponseInit } from "@azure/functions";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { validateJwt } from "../utils/auth";

export type ProfileRow = {
  user_id: string; username: string | null; display_name: string | null;
  avatar_url: string | null; avatar_storage_key: string | null; provider_avatar_url: string | null;
  bio: string | null; is_public: boolean; onboarding_completed_at: string | null;
  created_at: string; updated_at: string;
};

export type PublicProfileRow = Pick<ProfileRow, "user_id" | "username" | "display_name" | "avatar_url" | "provider_avatar_url" | "bio" | "created_at">;
export type PublicOwnerProfileRow = Pick<ProfileRow, "user_id" | "username" | "display_name" | "avatar_url" | "provider_avatar_url" | "bio">;

export type FollowCountRow = { follower_id: string; following_id: string };

export type AccountUserRow = {
  id: string; email: string | null; first_name: string | null; middle_name: string | null; last_name: string | null;
  birthdate: string | null; role: string | null; last_seen_at: string | null;
  terms_accepted_at: string | null; privacy_accepted_at: string | null;
  terms_version: string | null; privacy_version: string | null;
  default_gala_plan_visibility: "private" | "followers_only" | "public" | null;
  followers_visibility: "private" | "followers_only" | "public" | null;
  following_visibility: "private" | "followers_only" | "public" | null;
  show_public_plans_on_profile: boolean | null;
};

export type GalaPlanRow = {
  id: string; user_id: string; title: string; slug: string; description: string | null;
  visibility: "public"; status: "active"; published_at: string | null;
  created_at: string; updated_at: string;
};

export type PlacePreviewRow = { id: string; name: string; slug: string; city: string | null; category: string | null };

export type GalaPlanItemRow = {
  id: string; plan_id: string; place_id: string; day_number: number | null;
  sort_order: number | null; time_label: string | null; notes: string | null;
  estimated_minutes: number | null;
  places?: (PlacePreviewRow & { address?: string | null; budget_min?: number | string | null; latitude?: number | string | null; longitude?: number | string | null; image_url?: string | null }) | null;
};

export const PROFILE_COLUMNS = "user_id, username, display_name, avatar_url, avatar_storage_key, provider_avatar_url, bio, is_public, onboarding_completed_at, created_at, updated_at";
export const ACCOUNT_USER_COLUMNS = "id, email, first_name, middle_name, last_name, birthdate, role, last_seen_at, terms_accepted_at, privacy_accepted_at, terms_version, privacy_version, default_gala_plan_visibility, followers_visibility, following_visibility, show_public_plans_on_profile";
export const PUBLIC_PROFILE_COLUMNS = "user_id, username, display_name, avatar_url, provider_avatar_url, bio, created_at";
export const PUBLIC_OWNER_PROFILE_COLUMNS = "user_id, username, display_name, avatar_url, provider_avatar_url, bio";
export const PUBLIC_GALA_PLAN_COLUMNS = "id, user_id, title, slug, description, visibility, status, published_at, created_at, updated_at";
export const USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/;
export const EMAIL_LOOKING_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const TERMS_VERSION = "2026-07-11";
export const PRIVACY_VERSION = "2026-07-11";
export const BIO_MAX_LENGTH = 280;
export const DISPLAY_NAME_MAX_LENGTH = 80;
export const MINIMUM_AGE = 13;
export const RESERVED_USERNAMES = new Set(["admin", "api", "auth", "login", "logout", "signup", "settings", "profile", "profiles", "user", "users", "search", "support", "help", "terms", "privacy", "gala", "galatayo"]);

export function normalizeUsername(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function normalizeSlug(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function validateUsername(username: string): string | null {
  if (EMAIL_LOOKING_PATTERN.test(username)) return "Username cannot be an email address.";
  if (!USERNAME_PATTERN.test(username)) return "Username must be 3-30 characters and use lowercase letters, numbers, underscores, or dots only.";
  if (RESERVED_USERNAMES.has(username)) return "That username is reserved. Please choose another one.";
  if (username.startsWith(".")) return "Username cannot start with a dot.";
  if (username.endsWith(".")) return "Username cannot end with a dot.";
  if (username.includes("..")) return "Username cannot contain consecutive dots.";
  return null;
}

export function getErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
}

export function getSafeBio(value: unknown, allowUndefined = false) {
  if (value === undefined && allowUndefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, BIO_MAX_LENGTH) : null;
}

export function getMetadataString(metadata: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

const FIELD_LABELS: Record<string, string> = {
  first_name: "First Name",
  middle_name: "Middle Name",
  last_name: "Last Name",
  display_name: "Display Name",
  avatar_url: "Avatar",
  avatar_storage_key: "Avatar",
  provider_avatar_url: "Avatar",
};

function getFieldLabel(fieldName: string) {
  return FIELD_LABELS[fieldName] || fieldName.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getTrimmedString(value: unknown, fieldName: string, maxLength: number, required = true) {
  const label = getFieldLabel(fieldName);
  if (value === undefined || value === null) return { value: null as string | null, error: required ? `You must provide your ${label}.` : null };
  if (typeof value !== "string") return { value: null as string | null, error: `Your ${label} must be text.` };
  const trimmed = value.trim();
  if (required && !trimmed) return { value: null as string | null, error: `You forgot to enter your ${label}.` };
  if (trimmed.length > maxLength) return { value: null as string | null, error: `Your ${label} must be ${maxLength} characters or less.` };
  return { value: trimmed || null, error: null };
}

export function pickBodyValue(body: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) { if (body[key] !== undefined) return body[key]; }
  return undefined;
}

export function canDeleteOwnedAvatarKey(userId: string, oldStorageKey: string | null | undefined, newStorageKey?: string | null) {
  if (!oldStorageKey) return false;
  if (newStorageKey && oldStorageKey === newStorageKey) return false;
  return oldStorageKey.startsWith(`avatars/${userId}/`);
}

export function validateBirthdate(value: unknown) {
  const dateValue = getTrimmedString(value, "birthdate", 10);
  if (dateValue.error || !dateValue.value) return { value: null as string | null, error: dateValue.error || "You must provide your birthdate." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue.value)) return { value: null as string | null, error: "Your birthdate must use YYYY-MM-DD format." };
  const date = new Date(`${dateValue.value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateValue.value) return { value: null as string | null, error: "You entered an invalid birthdate." };
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const minDate = new Date("1900-01-01T00:00:00.000Z");
  if (date > todayUtc) return { value: null as string | null, error: "Your birthdate cannot be in the future." };
  if (date < minDate) return { value: null as string | null, error: "Your birthdate cannot be before 1900-01-01." };
  let age = todayUtc.getUTCFullYear() - date.getUTCFullYear();
  const monthDiff = todayUtc.getUTCMonth() - date.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && todayUtc.getUTCDate() < date.getUTCDate())) {
    age--;
  }
  if (age < MINIMUM_AGE) return { value: null as string | null, error: `You must be at least ${MINIMUM_AGE} years old to use GalaTayo.` };
  return { value: dateValue.value, error: null };
}

export function unauthorized(): HttpResponseInit {
  return { status: 401, jsonBody: { message: "Missing or invalid Authorization header." } };
}

export async function getOptionalAuthenticatedUser(request: HttpRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  try { return await validateJwt(request); } catch { return null; }
}

export function needsOnboarding(profile: ProfileRow | null) {
  return !profile?.onboarding_completed_at;
}

export function hasCompletedOnboarding(profile: ProfileRow | null, accountUser?: AccountUserRow | null) {
  if (profile?.onboarding_completed_at) return true;
  if (!profile || !accountUser) return false;
  return Boolean(profile.username && profile.display_name && accountUser.first_name && accountUser.last_name && accountUser.birthdate && accountUser.terms_accepted_at && accountUser.privacy_accepted_at);
}

export function hasAcceptedPolicies(accountUser: AccountUserRow | null | undefined) {
  return Boolean(
    accountUser?.terms_accepted_at &&
    accountUser?.privacy_accepted_at
  );
}

export function hasAcceptablePolicyAgreement(accountUser: AccountUserRow | null | undefined, profile?: ProfileRow | null) {
  return hasAcceptedPolicies(accountUser) || Boolean(profile?.onboarding_completed_at);
}

export function mapAccountUser(row: AccountUserRow, profile?: ProfileRow | null) {
  return {
    id: row.id, email: row.email, firstName: row.first_name, middleName: row.middle_name, lastName: row.last_name,
    birthdate: row.birthdate, role: row.role ?? "member", lastSeenAt: row.last_seen_at,
    termsAcceptedAt: row.terms_accepted_at, privacyAcceptedAt: row.privacy_accepted_at,
    termsVersion: row.terms_version, privacyVersion: row.privacy_version,
    needsPolicyAcceptance: !hasAcceptablePolicyAgreement(row, profile),
    requiredTermsVersion: TERMS_VERSION,
    requiredPrivacyVersion: PRIVACY_VERSION,
    defaultGalaPlanVisibility: row.default_gala_plan_visibility ?? "private",
    followersVisibility: row.followers_visibility ?? "public",
    followingVisibility: row.following_visibility ?? "public",
    showPublicPlansOnProfile: row.show_public_plans_on_profile ?? true,
  };
}

export function mapPublicProfile(row: ProfileRow | null) {
  return row ? { userId: row.user_id, username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url, providerAvatarUrl: row.provider_avatar_url, bio: row.bio, isPublic: row.is_public, onboardingCompletedAt: row.onboarding_completed_at } : null;
}

export function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") { const parsedValue = Number(value); if (Number.isFinite(parsedValue)) return parsedValue; }
  return null;
}

export function isCompletedPublicProfile(profile: Pick<ProfileRow, "is_public" | "username" | "onboarding_completed_at"> | null) {
  return Boolean(profile?.is_public && profile.username && profile.onboarding_completed_at);
}

export async function getCompletedPublicProfileByUsername(username: string) {
  if (!username) return null;
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("profiles") as any)
    .select(PUBLIC_OWNER_PROFILE_COLUMNS + ", is_public, onboarding_completed_at")
    .eq("username", username)
    .maybeSingle();
  if (error) throw error;
  const profile = data as (PublicOwnerProfileRow & { is_public: boolean; onboarding_completed_at: string | null }) | null;
  return isCompletedPublicProfile(profile) ? profile : null;
}

export async function getAccurateFollowCounts(userIds: string[]) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  const countsByUserId = new Map<string, { followers_count: number; following_count: number }>();
  for (const userId of uniqueUserIds) countsByUserId.set(userId, { followers_count: 0, following_count: 0 });
  if (uniqueUserIds.length === 0) return countsByUserId;
  const supabase = await getSupabaseAdminClient();
  const [{ data: followerRows, error: followersError }, { data: followingRows, error: followingError }] = await Promise.all([
    (supabase.from("user_follows") as any).select("following_id").in("following_id", uniqueUserIds).eq("status", "accepted"),
    (supabase.from("user_follows") as any).select("follower_id").in("follower_id", uniqueUserIds).eq("status", "accepted"),
  ]);
  if (followersError) throw followersError;
  if (followingError) throw followingError;
  for (const row of (followerRows || []) as Array<Pick<FollowCountRow, "following_id">>) { const current = countsByUserId.get(row.following_id); if (current) current.followers_count += 1; }
  for (const row of (followingRows || []) as Array<Pick<FollowCountRow, "follower_id">>) { const current = countsByUserId.get(row.follower_id); if (current) current.following_count += 1; }
  return countsByUserId;
}

export function mapPreviewPlace(item: GalaPlanItemRow): PlacePreviewRow | null {
  const place = item.places;
  if (!place?.id || !place.name || !place.slug) return null;
  return { id: place.id, name: place.name, slug: place.slug, city: place.city ?? null, category: place.category ?? null };
}

export function sortPlanItems(firstItem: GalaPlanItemRow, secondItem: GalaPlanItemRow) {
  const firstDay = firstItem.day_number ?? 1;
  const secondDay = secondItem.day_number ?? 1;
  if (firstDay !== secondDay) return firstDay - secondDay;
  return (firstItem.sort_order ?? 0) - (secondItem.sort_order ?? 0);
}

export async function getOrCreateProfile(userId: string, providerAvatarUrl: string | null = null): Promise<ProfileRow> {
  const supabase = await getSupabaseAdminClient();
  const profilesTable = supabase.from("profiles") as any;
  const { data: existingProfile, error: existingError } = await profilesTable.select(PROFILE_COLUMNS).eq("user_id", userId).maybeSingle();
  if (existingError) throw existingError;
  if (existingProfile) {
    const profile = existingProfile as ProfileRow;
    if (providerAvatarUrl && !profile.provider_avatar_url) {
      const { data: updatedProfile, error: updateError } = await profilesTable.update({ provider_avatar_url: providerAvatarUrl }).eq("user_id", userId).select(PROFILE_COLUMNS).single();
      if (updateError) throw updateError;
      return updatedProfile as ProfileRow;
    }
    return profile;
  }
  const { data: insertedProfile, error: insertError } = await profilesTable.insert({ user_id: userId, provider_avatar_url: providerAvatarUrl }).select(PROFILE_COLUMNS).single();
  if (insertError) {
    if (getErrorCode(insertError) === "23505") {
      const { data: racedProfile, error: racedError } = await profilesTable.select(PROFILE_COLUMNS).eq("user_id", userId).single();
      if (racedError) throw racedError;
      return racedProfile as ProfileRow;
    }
    throw insertError;
  }
  return insertedProfile as ProfileRow;
}

export async function getAccountUser(userId: string): Promise<AccountUserRow | null> {
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("users") as any).select(ACCOUNT_USER_COLUMNS).eq("id", userId).maybeSingle();
  if (error) throw error;
  return (data as AccountUserRow | null) ?? null;
}

export async function getOrCreateAccountUser(userId: string, email: string | null | undefined): Promise<AccountUserRow> {
  const existing = await getAccountUser(userId);
  if (existing) return existing;
  const supabase = await getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await (supabase.from("users") as any).insert({
    id: userId, email: email ?? null, role: "member", default_gala_plan_visibility: "private",
    followers_visibility: "public", following_visibility: "public", show_public_plans_on_profile: true, updated_at: now,
  }).select(ACCOUNT_USER_COLUMNS).single();
  if (error) {
    if (getErrorCode(error) === "23505") { const racedUser = await getAccountUser(userId); if (racedUser) return racedUser; }
    throw error;
  }
  return data as AccountUserRow;
}

export async function assertUsernameAvailable(username: string, userId: string) {
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("profiles") as any).select("user_id").ilike("username", username).neq("user_id", userId).limit(1);
  if (error) throw error;
  return !data || data.length === 0;
}

export async function getUsernameAvailability(username: string, userId: string) {
  const supabase = await getSupabaseAdminClient();
  const { data, error } = await (supabase.from("profiles") as any).select("user_id").ilike("username", username).limit(1);
  if (error) throw error;
  const owner = ((data || []) as Array<{ user_id: string }>)[0];
  return !owner || owner.user_id === userId;
}

export async function saveProfile(userId: string, updates: {
  username?: string; display_name?: string | null; avatar_url?: string | null;
  avatar_storage_key?: string | null; provider_avatar_url?: string | null;
  bio?: string | null; is_public?: boolean; onboarding_completed_at?: string;
}) {
  const supabase = await getSupabaseAdminClient();
  const profilesTable = supabase.from("profiles") as any;
  await getOrCreateProfile(userId);
  const { data: updatedProfile, error } = await profilesTable.update(updates).eq("user_id", userId).select(PROFILE_COLUMNS).single();
  if (error) throw error;
  return updatedProfile as ProfileRow;
}
