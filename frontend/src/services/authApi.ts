import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import { getOnboardingStatus } from '../utils/profileApi'
import { apiFetch, getApiUrl } from '../utils/apiClient'

export type AuthRedirectTarget = string

const adminPasswordSessionKey = 'galatayo_admin_password_session'

type AdminPasswordSession = {
  userId: string
  markedAt: number
}

export function getAuthCallbackUrl(nextPath?: string | null, flow?: 'signup' | 'recovery') {
  const sanitizedNextPath = sanitizeNextPath(nextPath)
  const params = new URLSearchParams()

  if (sanitizedNextPath) {
    params.set('next', sanitizedNextPath)
  }

  if (flow) {
    params.set('flow', flow)
  }

  const queryString = params.toString()
  return queryString ? `${window.location.origin}/auth/callback?${queryString}` : `${window.location.origin}/auth/callback`
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
      emailRedirectTo: getAuthCallbackUrl(nextPath ?? '/onboarding', 'signup'),
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

export async function resendSignUpConfirmationEmail(email: string, nextPath?: string | null) {
  await sendAuthResendEmail('signup', email, nextPath ?? '/onboarding')
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
  window.sessionStorage.removeItem(adminPasswordSessionKey)

  if (error) {
    throw error
  }
}

export function markAdminPasswordSession(userId: string) {
  window.sessionStorage.setItem(
    adminPasswordSessionKey,
    JSON.stringify({
      userId,
      markedAt: Date.now(),
    } satisfies AdminPasswordSession),
  )
}

export function hasAdminPasswordSession(userId: string) {
  const rawValue = window.sessionStorage.getItem(adminPasswordSessionKey)

  if (!rawValue) {
    return false
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<AdminPasswordSession>
    return parsed.userId === userId && typeof parsed.markedAt === 'number'
  } catch {
    return false
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
  await sendAuthResendEmail('recovery', email)
}

async function sendAuthResendEmail(type: 'signup' | 'recovery', email: string, nextPath?: string | null) {
  const response = await apiFetch('/auth/resend-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type,
      email: email.trim().toLowerCase(),
      nextPath: nextPath ?? null,
      clientOrigin: window.location.origin,
    }),
  })

  const data = (await response.json().catch(() => ({}))) as {
    message?: string
    retryAfterMs?: number
    error?: string
  }

  if (!response.ok) {
    const error = new Error(data.message || data.error || 'Could not send the email. Please try again.')

    if (typeof data.retryAfterMs === 'number') {
      ;(error as Error & { retryAfterMs?: number }).retryAfterMs = data.retryAfterMs
    }

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
