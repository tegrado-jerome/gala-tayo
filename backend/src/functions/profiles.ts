import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { getSupabaseAdminClient } from "../config/supabaseAdmin";
import { validateJwt } from "../utils/auth";
import { checkEndpointRateLimit } from "../utils/redisRateLimit";
import { convertImageToWebp, deleteR2Object, detectImageFormat, uploadThumbnailToR2, uploadWebpToR2 } from "../utils/r2ImageStorage";
import {
  meProfile as meProfileSocial,
  publicGalaPlanSocial,
  publicProfileGalaPlansSocial,
  publicProfileSocial,
} from "./socialAccounts";
import {
  type ProfileRow,
  type PublicProfileRow,
  type PublicOwnerProfileRow,
  type FollowCountRow,
  type AccountUserRow,
  type GalaPlanRow,
  type PlacePreviewRow,
  type GalaPlanItemRow,
  PROFILE_COLUMNS,
  ACCOUNT_USER_COLUMNS,
  PUBLIC_PROFILE_COLUMNS,
  PUBLIC_OWNER_PROFILE_COLUMNS,
  PUBLIC_GALA_PLAN_COLUMNS,
  USERNAME_PATTERN,
  EMAIL_LOOKING_PATTERN,
  TERMS_VERSION,
  PRIVACY_VERSION,
  BIO_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  RESERVED_USERNAMES,
  normalizeUsername,
  normalizeSlug,
  validateUsername,
  getErrorCode,
  getSafeBio,
  getMetadataString,
  getTrimmedString,
  pickBodyValue,
  canDeleteOwnedAvatarKey,
  validateBirthdate,
  unauthorized,
  getOptionalAuthenticatedUser,
  needsOnboarding,
  hasCompletedOnboarding,
  hasAcceptablePolicyAgreement,
  mapAccountUser,
  mapPublicProfile,
  toNullableNumber,
  isCompletedPublicProfile,
  getCompletedPublicProfileByUsername,
  getAccurateFollowCounts,
  mapPreviewPlace,
  sortPlanItems,
  getOrCreateProfile,
  getAccountUser,
  getOrCreateAccountUser,
  assertUsernameAvailable,
  getUsernameAvailability,
  saveProfile,
} from "./profileHelpers";

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
    const derivedOnboardingCompleted = hasCompletedOnboarding(existingProfile, existingAccountUser);

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
        if (body.birthdate === null || body.birthdate === '') {
          accountUpdates.birthdate = null;
        } else {
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

      const completed = hasCompletedOnboarding(profile, accountUser);

      return {
        status: 200,
        jsonBody: {
          user: mapAccountUser(accountUser, profile),
          profile: mapPublicProfile(profile),
          onboarding: {
            completed,
          },
        },
      };
    }

    const accountUser = existingAccountUser;
    const profile = existingProfile;
    const completed = derivedOnboardingCompleted;

    if (completed && !profile.onboarding_completed_at) {
      const now = new Date().toISOString();
      const updatedProfile = await saveProfile(authUser.id, {
        onboarding_completed_at: now,
      });

      return {
        status: 200,
        jsonBody: {
          user: mapAccountUser(accountUser, updatedProfile),
          profile: mapPublicProfile(updatedProfile),
          onboarding: {
            completed: true,
          },
        },
      };
    }

    return {
      status: 200,
      jsonBody: {
        user: mapAccountUser(accountUser, profile),
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
    const completed = hasCompletedOnboarding(profile, accountUser);
    const hasPolicyAgreement = hasAcceptablePolicyAgreement(accountUser, profile);

    if (completed && !profile.onboarding_completed_at) {
      const now = new Date().toISOString();
      const updatedProfile = await saveProfile(authUser.id, {
        onboarding_completed_at: now,
      });
      const hasUpdatedPolicyAgreement = hasAcceptablePolicyAgreement(accountUser, updatedProfile);

      return {
        status: 200,
        jsonBody: {
          completed: true,
          needsOnboarding: !hasUpdatedPolicyAgreement,
          policyAcceptance: {
            required: !hasUpdatedPolicyAgreement,
            termsVersion: TERMS_VERSION,
            privacyVersion: PRIVACY_VERSION,
            currentTermsVersion: accountUser.terms_version,
            currentPrivacyVersion: accountUser.privacy_version,
          },
          profile: {
            username: updatedProfile.username,
            displayName: updatedProfile.display_name,
            avatarUrl: updatedProfile.avatar_url,
            providerAvatarUrl: updatedProfile.provider_avatar_url,
          },
        },
      };
    }

    return {
      status: 200,
      jsonBody: {
        completed,
        needsOnboarding: !completed || !hasPolicyAgreement,
        policyAcceptance: {
          required: !hasPolicyAgreement,
          termsVersion: TERMS_VERSION,
          privacyVersion: PRIVACY_VERSION,
          currentTermsVersion: accountUser.terms_version,
          currentPrivacyVersion: accountUser.privacy_version,
        },
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
    const rateCheck = await checkEndpointRateLimit(request, "username-availability", 20, 60);
    if (!rateCheck.allowed && rateCheck.response) {
      return rateCheck.response;
    }

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
    if (avatarUrl.value && !avatarUrl.value.startsWith("https://")) {
      avatarUrl.error = "Avatar URL must use HTTPS.";
    }
    const avatarStorageKey = getTrimmedString(body.avatar_storage_key, "avatar_storage_key", 500, false);
    const providerAvatarUrl = getTrimmedString(pickBodyValue(body, "provider_avatar_url", "providerAvatarUrl"), "provider_avatar_url", 500, false);
    if (providerAvatarUrl.value && !providerAvatarUrl.value.startsWith("https://")) {
      providerAvatarUrl.error = "Provider avatar URL must use HTTPS.";
    }
    const profileVisibility = pickBodyValue(body, "profile_visibility");
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
      (username ? usernameError : "You must provide a username.") ||
      avatarUrl.error ||
      avatarStorageKey.error ||
      providerAvatarUrl.error ||
      (profileVisibility !== undefined && profileVisibility !== "public" && profileVisibility !== "private" ? "Please select either Public or Private profile visibility." : null) ||
      (acceptedTerms !== true ? "You must accept the Terms of Service." : null) ||
      (acceptedPrivacy !== true ? "You must accept the Privacy Policy." : null) ||
      (body.isPublic !== undefined && typeof body.isPublic !== "boolean" ? "Profile visibility setting must be a boolean." : null);

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
        followers_visibility: isPublic ? "public" : "private",
        following_visibility: isPublic ? "public" : "private",
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
          show_followers: isPublic ? "everyone" : "only_me",
          show_following: isPublic ? "everyone" : "only_me",
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
        user: mapAccountUser(updatedUser as AccountUserRow, updatedProfile as ProfileRow),
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

    const errorMessage = error instanceof Error ? error.message : "Failed to finish onboarding.";
    context.error("POST /api/onboarding/complete failed:", errorMessage, JSON.stringify(error, Object.getOwnPropertyNames(error)));

    return {
      status: 500,
      jsonBody: {
        message: errorMessage,
      },
    };
  }
}

export async function profileAvatarUpload(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const rateCheck = await checkEndpointRateLimit(request, "avatar-upload", 10, 60);
    if (!rateCheck.allowed && rateCheck.response) {
      return rateCheck.response;
    }

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

    if (file.size > 5 * 1024 * 1024) {
      return {
        status: 400,
        jsonBody: {
          message: "Avatar must be 5MB or smaller.",
        },
      };
    }

    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const detectedAvatarFormat = await detectImageFormat(inputBuffer);
    const isSvg = inputBuffer.subarray(0, 512).toString("utf8").toLowerCase().includes("<svg");
    const isGif = inputBuffer.length >= 6 && inputBuffer.subarray(0, 3).toString("ascii") === "GIF";

    const mimeToFormat: Record<string, string> = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
    const fallbackFormat = mimeToFormat[file.type] || null;
    const effectiveFormat = detectedAvatarFormat || fallbackFormat;

    if (!effectiveFormat || !["jpeg", "png", "webp"].includes(effectiveFormat) || isSvg || isGif) {
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
    await uploadThumbnailToR2(storageKey, webpBuffer);
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

    const rateCheck = await checkEndpointRateLimit(request, "profile-update", 10, 60);
    if (!rateCheck.allowed && rateCheck.response) {
      return rateCheck.response;
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
    const rateCheck = await checkEndpointRateLimit(request, "profile-search", 20, 60);
    if (!rateCheck.allowed && rateCheck.response) {
      return rateCheck.response;
    }

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
    const rateCheck = await checkEndpointRateLimit(request, "profile-suggestions", 20, 60);
    if (!rateCheck.allowed && rateCheck.response) {
      return rateCheck.response;
    }

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
