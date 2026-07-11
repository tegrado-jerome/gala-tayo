import type { Session } from '@supabase/supabase-js'
import { getSupabaseAccessToken } from '../supabase'
import { apiFetch, getApiUrl } from './apiClient'

export type Profile = {
  user_id: string
  username: string | null
  avatar_url: string | null
  provider_avatar_url: string | null
  bio: string | null
  is_public: boolean
  show_followers: ListVisibility
  show_following: ListVisibility
  default_gala_plan_visibility: GalaPlanVisibility
  followers_count: number
  following_count: number
  onboarding_completed_at: string | null
  created_at: string
  updated_at: string
}

export type ListVisibility = 'everyone' | 'followers' | 'only_me'
export type GalaPlanVisibility = 'private' | 'followers' | 'public' | 'unlisted'
export type RelationshipState = 'self' | 'not_following' | 'pending' | 'following' | 'blocked'

export type PublicProfile = {
  user_id: string
  username: string
  avatar_url: string | null
  provider_avatar_url: string | null
  bio: string | null
  is_public: boolean
  followers_count: number
  following_count: number
  created_at?: string
}

export type PublicGalaPlanPreviewPlace = {
  id: string
  name: string
  slug: string
  city: string | null
  category: string | null
}

export type PublicGalaPlanSummary = {
  id: string
  user_id: string
  title: string
  slug: string
  description: string | null
  visibility: GalaPlanVisibility
  hearts_count: number
  viewer_has_hearted: boolean
  is_active: boolean
  created_at: string
  updated_at: string
  places_count: number
  preview_places: PublicGalaPlanPreviewPlace[]
  owner?: {
    user_id: string
    username: string
    avatar_url: string | null
    provider_avatar_url: string | null
  }
}

export type PublicGalaPlan = {
  id: string
  title: string
  slug: string
  description: string | null
  visibility: GalaPlanVisibility
  hearts_count: number
  viewer_has_hearted: boolean
  is_active: boolean
  created_at: string
  updated_at: string
  owner: {
    user_id: string
    username: string
    avatar_url: string | null
    provider_avatar_url: string | null
  }
  items: Array<{
    id: string
    order_index: number
    notes: string | null
    place: {
      id: string
      name: string
      slug: string
      category: string | null
      city: string | null
      address: string | null
      budget_min?: number | null
      latitude: number | null
      longitude: number | null
      image_url?: string | null
    }
  }>
}

export type ProfileMeResponse = {
  profile: Profile | null
  needsOnboarding: boolean
}

export type PublicProfileResponse = {
  profile: PublicProfile
  relationship_state: RelationshipState
  can_view_profile: boolean
  locked: boolean
  message: string | null
  plans: PublicGalaPlanSummary[]
}

export type FollowListUser = Pick<PublicProfile, 'user_id' | 'username' | 'avatar_url' | 'provider_avatar_url' | 'bio'>

export type FollowRequest = {
  id: string
  follower_id: string
  following_id: string
  status: 'pending'
  created_at: string
  follower: FollowListUser
}

export type CurrentUserResponse = {
  user: {
    id: string
    email: string | null
    firstName: string | null
    middleName: string | null
    lastName: string | null
    birthdate: string | null
    role: string
    lastSeenAt: string | null
    termsAcceptedAt: string | null
    privacyAcceptedAt: string | null
    termsVersion: string | null
    privacyVersion: string | null
    defaultGalaPlanVisibility: 'private' | 'followers_only' | 'public'
    followersVisibility: 'private' | 'followers_only' | 'public'
    followingVisibility: 'private' | 'followers_only' | 'public'
    showPublicPlansOnProfile: boolean
  }
  profile: {
    userId: string
    username: string | null
    displayName: string | null
    avatarUrl: string | null
    providerAvatarUrl: string | null
    bio: string | null
    isPublic: boolean
    onboardingCompletedAt: string | null
  } | null
  onboarding: {
    completed: boolean
  }
}

export type UpdateCurrentUserPayload = {
  firstName?: string
  middleName?: string | null
  lastName?: string
  birthdate?: string
  displayName?: string
}

export type OnboardingStatusResponse = {
  completed: boolean
  needsOnboarding: boolean
  profile: {
    username: string | null
    displayName: string | null
    avatarUrl: string | null
    providerAvatarUrl: string | null
  } | null
}

export type UsernameAvailabilityResponse = {
  username: string
  normalizedUsername: string
  valid: boolean
  available: boolean
  reason?: string
}

export type OnboardingCompleteRequest = {
  firstName: string
  middleName?: string | null
  lastName: string
  birthdate: string
  displayName: string
  username: string
  avatarUrl?: string | null
  providerAvatarUrl?: string | null
  bio?: string | null
  isPublic?: boolean
  acceptedTerms: boolean
  acceptedPrivacy: boolean
}

export const reservedUsernames = new Set([
  'admin',
  'api',
  'auth',
  'login',
  'logout',
  'signup',
  'settings',
  'profile',
  'profiles',
  'user',
  'users',
  'search',
  'support',
  'help',
  'terms',
  'privacy',
  'gala',
  'galatayo',
])

const usernamePattern = /^[a-z0-9_.]{3,30}$/
const emailLookingPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function getAccessToken(session?: Session | null) {
  return getSupabaseAccessToken(session)
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & {
    message?: string
    error?: string
  }

  if (!response.ok) {
    const error = new Error(data.message || data.error || 'Request failed.')
    ;(error as Error & { status?: number }).status = response.status
    throw error
  }

  return data
}

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase()
}

export function validateUsername(username: string) {
  if (emailLookingPattern.test(username)) {
    return 'Usernames cannot be email addresses.'
  }

  if (!usernamePattern.test(username)) {
    return 'Use 3-30 lowercase letters, numbers, underscores, or dots.'
  }

  if (reservedUsernames.has(username)) {
    return 'That username is reserved. Try another one.'
  }

  return ''
}

export function getDisplayAvatar(profile: Pick<PublicProfile, 'avatar_url' | 'provider_avatar_url'>) {
  return profile.avatar_url ?? profile.provider_avatar_url ?? null
}

export function getDisplayName(profile: Pick<PublicProfile, 'username'>) {
  return profile.username ?? 'GalaTayo user'
}

export function getUsernameInitial(username: string | null | undefined) {
  return username?.trim().charAt(0).toUpperCase() || 'G'
}

export function isAdminRole(role: unknown) {
  return typeof role === 'string' && role.trim().toLowerCase() === 'admin'
}

export async function getMyProfile(session?: Session | null) {
  const token = await getAccessToken(session)

  if (!token) {
    throw new Error('Sign in is required.')
  }

  const response = await apiFetch('/me/profile', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  return readJsonResponse<ProfileMeResponse>(response)
}

export async function getCurrentUser(session?: Session | null) {
  const token = await getAccessToken(session)

  if (!token) {
    throw new Error('Sign in is required.')
  }

  const response = await apiFetch('/me', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  return readJsonResponse<CurrentUserResponse>(response)
}

export async function updateCurrentUser(payload: UpdateCurrentUserPayload, session?: Session | null) {
  const token = await getAccessToken(session)

  if (!token) {
    throw new Error('Sign in is required.')
  }

  const response = await apiFetch('/me', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return readJsonResponse<CurrentUserResponse>(response)
}

export async function getOnboardingStatus(session?: Session | null) {
  const token = await getAccessToken(session)

  if (!token) {
    throw new Error('Sign in is required.')
  }

  const response = await apiFetch('/onboarding/status', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  return readJsonResponse<OnboardingStatusResponse>(response)
}

export async function checkUsernameAvailability(username: string, session?: Session | null) {
  const token = await getAccessToken(session)

  if (!token) {
    throw new Error('Sign in is required.')
  }

  const response = await apiFetch(`/profiles/username-availability?username=${encodeURIComponent(username)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  return readJsonResponse<UsernameAvailabilityResponse>(response)
}

export async function completeOnboarding(payload: OnboardingCompleteRequest, session?: Session | null) {
  const token = await getAccessToken(session)

  if (!token) {
    throw new Error('Sign in is required.')
  }

  const response = await apiFetch('/onboarding/complete', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return readJsonResponse<CurrentUserResponse>(response)
}

export async function updateMyProfile(
  payload: {
    username?: string
    bio?: string | null
    avatar_url?: string | null
    is_public?: boolean
    show_followers?: ListVisibility
    show_following?: ListVisibility
    default_gala_plan_visibility?: GalaPlanVisibility
  },
  session?: Session | null,
) {
  const token = await getAccessToken(session)

  if (!token) {
    throw new Error('Sign in is required.')
  }

  const response = await apiFetch('/me/profile', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return readJsonResponse<ProfileMeResponse>(response)
}

export async function searchProfiles(query: string) {
  const token = await getAccessToken()
  const headers: Record<string, string> = {}

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await apiFetch(`/profiles/search?q=${encodeURIComponent(query)}`, {
    method: 'GET',
    headers,
  })

  return readJsonResponse<{ results: PublicProfile[] }>(response)
}

export async function getProfileSuggestions() {
  const token = await getAccessToken()
  const headers: Record<string, string> = {}

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await apiFetch('/profiles/suggestions', {
    method: 'GET',
    headers,
  })

  return readJsonResponse<{ suggestions: PublicProfile[] }>(response)
}

export async function getPublicProfile(username: string) {
  const token = await getAccessToken()
  const headers: Record<string, string> = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  const response = await apiFetch(`/profiles/${encodeURIComponent(username)}`, {
    method: 'GET',
    headers,
  })

  return readJsonResponse<PublicProfileResponse>(response)
}

export async function getPublicProfileGalaPlans(username: string) {
  const token = await getAccessToken()
  const headers: Record<string, string> = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  const response = await apiFetch(`/profiles/${encodeURIComponent(username)}/gala-plans`, {
    method: 'GET',
    headers,
  })

  return readJsonResponse<{ plans: PublicGalaPlanSummary[] }>(response)
}

export async function getPublicGalaPlan(username: string, slug: string) {
  const token = await getAccessToken()
  const headers: Record<string, string> = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  const response = await fetch(
    getApiUrl(`/profiles/${encodeURIComponent(username)}/gala-plans/${encodeURIComponent(slug)}`),
    {
      method: 'GET',
      headers,
    },
  )

  return readJsonResponse<{ plan: PublicGalaPlan }>(response)
}

export async function followProfile(username: string, session?: Session | null) {
  const token = await getAccessToken(session)
  if (!token) throw new Error('Log in to follow this profile.')
  const response = await apiFetch(`/profiles/${encodeURIComponent(username)}/follow`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  return readJsonResponse<{ relationship_state: RelationshipState; followers_count: number; following_count: number }>(response)
}

export async function unfollowProfile(username: string, session?: Session | null) {
  const token = await getAccessToken(session)
  if (!token) throw new Error('Log in to update this follow.')
  const response = await apiFetch(`/profiles/${encodeURIComponent(username)}/follow`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  return readJsonResponse<{ relationship_state: RelationshipState; followers_count: number; following_count: number }>(response)
}

export async function getFollowers(username: string) {
  const token = await getAccessToken()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await apiFetch(`/profiles/${encodeURIComponent(username)}/followers`, { headers })
  return readJsonResponse<{ users: FollowListUser[] }>(response)
}

export async function getFollowing(username: string) {
  const token = await getAccessToken()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await apiFetch(`/profiles/${encodeURIComponent(username)}/following`, { headers })
  return readJsonResponse<{ users: FollowListUser[] }>(response)
}

export async function getFollowRequests(session?: Session | null) {
  const token = await getAccessToken(session)
  if (!token) throw new Error('Sign in is required.')
  const response = await apiFetch('/me/follow-requests', {
    headers: { Authorization: `Bearer ${token}` },
  })
  return readJsonResponse<{ requests: FollowRequest[] }>(response)
}

export async function respondToFollowRequest(id: string, action: 'accept' | 'reject', session?: Session | null) {
  const token = await getAccessToken(session)
  if (!token) throw new Error('Sign in is required.')
  const response = await apiFetch(`/follow-requests/${encodeURIComponent(id)}/${action}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  return readJsonResponse<{ request: { id: string; status: 'accepted' | 'rejected' } }>(response)
}
