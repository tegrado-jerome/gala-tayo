import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import { getAdminMfaStatus } from '../utils/adminMfa'
import { getOnboardingStatus } from '../utils/profileApi'
import { getApiUrl } from '../utils/apiClient'

export type AuthRedirectTarget = string

export function getAuthCallbackUrl(nextPath?: string | null) {
  const sanitizedNextPath = sanitizeNextPath(nextPath)

  if (!sanitizedNextPath) {
    return `${window.location.origin}/auth/callback`
  }

  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(sanitizedNextPath)}`
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

export async function signOut() {
  const { error } = await supabase.auth.signOut()

  if (error) {
    throw error
  }
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
  const redirectUrl = new URL('/reset-password', window.location.origin).toString()
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: redirectUrl,
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

export async function getPostAuthRedirect(session: Session, search: string = window.location.search): Promise<AuthRedirectTarget> {
  const adminMfaStatus = await getAdminMfaStatus(session)

  if (adminMfaStatus.isAdmin) {
    if (adminMfaStatus.needsSetup) {
      return '/admin/mfa/setup'
    }

    if (adminMfaStatus.needsVerification) {
      return '/admin/mfa/verify'
    }

    return '/admin'
  }

  const status = await getOnboardingStatus(session)
  if (status.needsOnboarding) {
    return '/onboarding'
  }

  return resolvePostAuthPath('/', search)
}

export function sanitizeNextPath(value: string | null | undefined) {
  if (!value) {
    return null
  }

  if (!value.startsWith('/')) {
    return null
  }

  if (value.startsWith('//')) {
    return null
  }

  const normalizedValue = value.trim()

  if (
    normalizedValue === '/login' ||
    normalizedValue === '/login/' ||
    normalizedValue === '/signup' ||
    normalizedValue === '/signup/' ||
    normalizedValue === '/auth' ||
    normalizedValue === '/auth/'
  ) {
    return null
  }

  return normalizedValue
}

export function getRequestedNextPath(search: string = window.location.search) {
  const params = new URLSearchParams(search)
  return sanitizeNextPath(params.get('next'))
}

export function buildAuthPath(target: '/login' | '/signup', nextPath?: string | null) {
  const sanitizedNextPath = sanitizeNextPath(nextPath)

  if (!sanitizedNextPath) {
    return target
  }

  return `${target}?next=${encodeURIComponent(sanitizedNextPath)}`
}

export function resolvePostAuthPath(fallbackPath: string, search: string = window.location.search) {
  return getRequestedNextPath(search) ?? fallbackPath
}
