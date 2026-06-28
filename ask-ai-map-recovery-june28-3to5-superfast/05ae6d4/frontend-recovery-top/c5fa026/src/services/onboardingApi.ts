import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import type { OnboardingFormState } from '../components/onboarding/types'

export type UsernameAvailableResponse = {
  username: string
  normalizedUsername: string
  valid: boolean
  available: boolean
  reason?: string
}

export type AvatarUploadResponse = {
  avatar_url: string
  avatar_storage_key: string
}

export type OnboardingDraftResponse = {
  draft: OnboardingFormState | null
  updatedAt: string | null
}

function getApiUrl(path: string) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
  return apiBaseUrl ? `${apiBaseUrl}${path}` : `/api${path}`
}

async function getAccessToken(session?: Session | null) {
  if (session) {
    return session.access_token
  }

  const {
    data: { session: currentSession },
  } = await supabase.auth.getSession()

  return currentSession?.access_token ?? null
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

async function readUsernameAvailabilityResponse(response: Response): Promise<UsernameAvailableResponse> {
  const data = (await response.json().catch(() => ({}))) as UsernameAvailableResponse & {
    message?: string
    error?: string
  }

  if (!response.ok) {
    const message = data.message || data.error || 'Could not check username availability.'
    const error = new Error(message.toLowerCase().includes('profile not found') ? 'Could not check username availability. Please try again.' : message)
    ;(error as Error & { status?: number }).status = response.status
    throw error
  }

  return data
}

export async function checkUsernameAvailable(username: string, session?: Session | null) {
  const token = await getAccessToken(session)

  if (!token) {
    throw new Error('Sign in is required.')
  }

  const response = await fetch(getApiUrl(`/profiles/username-availability?username=${encodeURIComponent(username)}`), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  return readUsernameAvailabilityResponse(response)
}

export async function uploadProfileAvatar(file: File, session?: Session | null) {
  const token = await getAccessToken(session)

  if (!token) {
    throw new Error('Sign in is required.')
  }

  const body = new FormData()
  body.append('avatar', file)

  const response = await fetch(getApiUrl('/profiles/avatar'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body,
  })

  return readJsonResponse<AvatarUploadResponse>(response)
}

export async function getOnboardingDraft(session?: Session | null) {
  const token = await getAccessToken(session)

  if (!token) {
    throw new Error('Sign in is required.')
  }

  const response = await fetch(getApiUrl('/onboarding/draft'), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  return readJsonResponse<OnboardingDraftResponse>(response)
}

export async function saveOnboardingDraft(values: OnboardingFormState, session?: Session | null) {
  const token = await getAccessToken(session)

  if (!token) {
    throw new Error('Sign in is required.')
  }

  const response = await fetch(getApiUrl('/onboarding/draft'), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      draft: values,
    }),
  })

  return readJsonResponse<{ saved: boolean; updatedAt: string }>(response)
}

export async function completeOnboardingSetup(values: OnboardingFormState, session?: Session | null) {
  const token = await getAccessToken(session)

  if (!token) {
    throw new Error('Sign in is required.')
  }

  const response = await fetch(getApiUrl('/onboarding/complete'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      first_name: values.firstName.trim(),
      middle_name: values.middleName.trim() || null,
      last_name: values.lastName.trim(),
      birthdate: values.birthdate.trim(),
      display_name: values.displayName.trim(),
      username: values.username.trim().toLowerCase(),
      avatar_url: values.avatarUrl,
      avatar_storage_key: values.avatarStorageKey,
      profile_visibility: values.profileVisibility,
      show_followers: values.showFollowers,
      show_following: values.showFollowing,
      accepted_terms: values.acceptedTerms,
      accepted_privacy: values.acceptedPrivacy,
    }),
  })

  return readJsonResponse<{ success?: boolean }>(response)
}
