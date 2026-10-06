import type { HttpResponseInit } from "@azure/functions";

export const ACCOUNT_REQUIRED_CODE = "account_required";
export const ACCOUNT_REQUIRED_MESSAGE = "Create a free GalaTayo account to use this. Guest mode can't do it.";

/**
 * Functions a guest (Supabase anonymous) session may call. Everything else is account-only.
 * Public reads are listed too, because the app sends the guest's token on every request.
 * Every registered function must appear here or in ACCOUNT_ONLY_FUNCTIONS (checked by guestAccess.test.ts).
 */
export const GUEST_ALLOWED_FUNCTIONS = new Set([
  // Public pages and lookups
  "corsPreflight",
  "health",
  "filters",
  "categories",
  "search",
  "seoPlaces",
  "galaToday",
  "seoArea",
  "seoListings",
  "sitemapXml",
  "robotsTxt",
  "planSharePage",
  "listSharePage",
  "placeDetail",
  "placeDetailsBatch",
  "placePhotos",
  "placeCommentsList",
  "placeReviewsList",
  "publicProfile",
  "publicProfileGalaPlans",
  "publicGalaPlan",
  "publicGalaPlanSocial",
  "profileFollowers",
  "profileFollowing",
  "profileSearch",
  "profileSuggestions",
  "authSession",
  "authEmailExists",
  "getMfaStatus",
  "createFeedback",
  // AI, within the smaller guest daily limits
  "askAiChatbot",
  "askAiCancel",
  "askAiMaps",
  "askAiUsageCheck",
  "askAiUsageConsume",
  "galaPlanAiDraft",
  // Saved places and recently viewed
  "favoritesList",
  "favoritesCreate",
  "favoritesDeleteAll",
  "favoritesDelete",
  "getHistory",
  "deleteHistory",
  "deleteHistoryItem",
  "historyPlaceView",
  // Passport check-ins
  "myPassport",
  "myCheckinDelete",
  "placeCheckin",
  // Own gala plans
  "listMyGalaPlans",
  "createGalaPlan",
  "listFavoriteGalaPlans",
  "listLikedGalaPlansLegacy",
  "getGalaPlanDetail",
  "updateGalaPlan",
  "deleteGalaPlan",
  "addGalaPlanItem",
  "updateGalaPlanItem",
  "deleteGalaPlanItem",
  // Barkada: RSVP and polls on plans shared by link
  "galaPlanBarkada",
  "galaPlanRsvp",
  "galaPlanMember",
  "galaPlanPollCreate",
  "galaPlanPollDelete",
  "galaPlanPollVote",
  // Timers never carry a user token
  "redisKeepAlive",
  "galaTodayTimer",
]);

/** Account-only: profile/social, community content, reports, submissions, privacy, MFA and admin. */
export const ACCOUNT_ONLY_FUNCTIONS = new Set([
  "profileMe",
  "currentUserMe",
  "onboardingStatus",
  "onboardingDraft",
  "onboardingComplete",
  "profileOnboarding",
  "usernameAvailability",
  "usernameAvailable",
  "profileAvatarUpload",
  "meProfileSocial",
  "profileFollow",
  "profileUnfollow",
  "myFollowRequests",
  "acceptFollowRequest",
  "rejectFollowRequest",
  "toggleGalaPlanHeart",
  "placeCommentsCreate",
  "placeCommentRepliesCreate",
  "placeCommentsUpdate",
  "placeCommentsDelete",
  "placeCommentReportsCreate",
  "myCommentReportsList",
  "myCommentModerationNoticesList",
  "placeReviewsUpsert",
  "placeReviewsDelete",
  "placeImageContributionCreate",
  "placeReportsCreate",
  "myPlaceReportsList",
  "userReportsCreate",
  "myUserReportsList",
  "createPlaceSubmission",
  "getMyPlaceSubmissions",
  "privacyRequestsMe",
  "accountDeletionRequestMe",
  "authEmailConflict",
  "authResendEmail",
  "sendMfaEmailCode",
  "verifyMfaEmailCode",
  "getTrustedDevices",
  "revokeTrustedDevice",
  "revokeAllTrustedDevices",
  "cacheClear",
  "adminCommentReportsList",
  "adminCommentReportModerate",
  "adminPlaceImagesPending",
  "adminPlaceImagesApproved",
  "adminPlaceImagesApprovedAll",
  "adminPlaceImageApprove",
  "adminPlaceImageReject",
  "adminPlaceImageDelete",
  "adminPlaceReportsList",
  "adminPlaceReportUpdate",
  "adminPlaceReportDelete",
  "getPendingPlaceSubmissions",
  "approvePlaceSubmission",
  "rejectPlaceSubmission",
  "adminPrivacyRequestsList",
  "adminPrivacyRequestUpdate",
  "adminAccountDeletionRequestsList",
  "adminAccountDeletionRequestUpdate",
  "appAdminUserReportsList",
  "adminUserReportsList",
  "appAdminUserReportUpdate",
  "adminUserReportUpdate",
]);

/**
 * Reads the `is_anonymous` claim without verifying the signature. That is safe here because it is only
 * used to deny: a forged token still fails `validateJwt` in the handler.
 */
export function isAnonymousBearer(authorization: string | null | undefined): boolean {
  const match = /^Bearer\s+(.+)$/i.exec(authorization?.trim() ?? "");
  const parts = match?.[1].split(".") ?? [];
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8")) as { is_anonymous?: unknown };
    return payload.is_anonymous === true;
  } catch {
    return false;
  }
}

/** Returns a 401 for a guest token on an account-only function, or null to let the request through. */
export function getGuestAccessDenial(functionName: string, authorization: string | null | undefined): HttpResponseInit | null {
  if (GUEST_ALLOWED_FUNCTIONS.has(functionName)) return null;
  if (!isAnonymousBearer(authorization)) return null;
  return {
    status: 401,
    jsonBody: { code: ACCOUNT_REQUIRED_CODE, message: ACCOUNT_REQUIRED_MESSAGE },
  };
}
