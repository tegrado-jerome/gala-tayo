import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import { getOnboardingStatus } from '../utils/profileApi'
import { resolvePostAuthPath, sanitizeNextPath } from '../utils/authRedirect'

export type AuthRedirectTarget = string

function getApiUrl(path: string) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
  return apiBaseUrl ? `${apiBaseUrl}${path}` : `/api${path}`
}

export function getAuthCallbackUrl(nextPath?: string | null) {
  const sanitizedNextPath = sanitizeNextPath(nextPath)

  if (!sanitizedNextPath) {
    return `${window.location.origin}/auth/callback`
  }

  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(sanitizedNextPath)}`
}

export async function checkEmailExists(email: string) {
  const normalizedEmail = email.trim().toLowerCase()
  const response = await fetch(getApiUrl(`/auth/email-exists?email=${encodeURIComponent(normalizedEmail)}`), {
    method: 'GET',
  })
  const data = (await response.json().catch(() => ({}))) as {
    email?: string
    exists?: boolean
    message?: string
    error?: string
  }

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Could not check email.')
  }

  return {
    email: data.email ?? normalizedEmail,
    exists: Boolean(data.exists),
  }
}

export async function signInWithGoogle(nextPath?: string | null) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: getAuthCallbackUrl(nextPath),
    },
  })

  if (error) {
    throw error
  }
}

export async function signUpWithEmailPassword(email: string, password: string, nextPath?: string | null) {
  const normalizedEmail = email.trim().toLowerCase()
  const existingEmailData = await checkEmailExists(normalizedEmail)

  if (existingEmailData.exists) {
    throw new Error('This email already has an account.')
  }

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      emailRedirectTo: getAuthCallbackUrl(nextPath),
    },
  })

  if (error) {
    throw error
  }

  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new Error('An account with this email already exists.')
  }

  return data
}

export async function signInWithEmailPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  })

  if (error) {
    throw error
  }

  return data.session
}

export async function getCurrentEmailConflict(session: Session) {
  const response = await fetch(getApiUrl('/auth/email-conflict'), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  })
  const data = (await response.json().catch(() => ({}))) as {
    email?: string
    conflict?: boolean
    message?: string
    error?: string
  }

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Could not check account email.')
  }

  return {
    email: data.email ?? '',
    conflict: Boolean(data.conflict),
  }
}

export async function sendPasswordResetEmail(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  })

  if (error) {
    throw error
  }
}

export async function updateAccountPassword(password: string) {
  const { data, error } = await supabase.auth.updateUser({ password })

  if (error) {
    throw error
  }

  return data.user
}

export async function getPostAuthRedirect(session: Session): Promise<AuthRedirectTarget> {
  const status = await getOnboardingStatus(session)
  return resolvePostAuthPath(status.needsOnboarding ? '/onboarding' : '/')
}
