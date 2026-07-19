import type { Session } from '@supabase/supabase-js'
import { apiFetch } from './apiClient'

export type UserMfaStatus = {
  needsMfa: boolean
}

export async function getUserMfaStatus(session?: Session | null): Promise<UserMfaStatus> {
  if (!session) {
    return { needsMfa: false }
  }

  try {
    const response = await apiFetch('/auth/mfa/status', {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })

    if (!response.ok) {
      return { needsMfa: false }
    }

    const data = (await response.json()) as { needsMfa?: boolean }
    return { needsMfa: data.needsMfa === true }
  } catch {
    return { needsMfa: false }
  }
}

export type SendCodeResponse = {
  message: string
  maskedEmail: string
  retryAfterMs?: number
}

export async function sendMfaEmailCode(session: Session): Promise<SendCodeResponse> {
  const response = await apiFetch('/auth/mfa/send-email-code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  const data = (await response.json()) as {
    message?: string
    maskedEmail?: string
    retryAfterMs?: number
    error?: string
  }

  if (!response.ok) {
    const error = new Error(data.message || data.error || 'Could not send verification code.')
    if (typeof data.retryAfterMs === 'number') {
      ;(error as Error & { retryAfterMs?: number }).retryAfterMs = data.retryAfterMs
    }
    throw error
  }

  return {
    message: data.message ?? 'Verification code sent.',
    maskedEmail: data.maskedEmail ?? '',
  }
}

export async function verifyMfaEmailCode(session: Session, code: string): Promise<boolean> {
  const response = await apiFetch('/auth/mfa/verify-email-code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ code }),
  })

  const data = (await response.json()) as { verified?: boolean; message?: string }

  if (!response.ok) {
    throw new Error(data.message || 'Invalid or expired code.')
  }

  return data.verified === true
}
