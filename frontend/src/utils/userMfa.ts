import type { Session } from '@supabase/supabase-js'
import { apiFetch } from './apiClient'
import { getDeviceToken } from './mfaDevice'

export type UserMfaStatus = {
  needsMfa: boolean
}

function getHeaders(session: Session): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
  }
  const deviceToken = getDeviceToken()
  if (deviceToken) {
    headers['x-device-token'] = deviceToken
  }
  return headers
}

export async function getUserMfaStatus(session?: Session | null): Promise<UserMfaStatus> {
  if (!session) {
    return { needsMfa: false }
  }

  try {
    const response = await apiFetch('/auth/mfa/status', {
      headers: getHeaders(session),
    })

    if (!response.ok) {
      return { needsMfa: true }
    }

    const data = (await response.json()) as { needsMfa?: boolean }
    return { needsMfa: data.needsMfa === true }
  } catch {
    return { needsMfa: true }
  }
}

export type SendCodeResponse = {
  message: string
  maskedEmail: string
  retryAfterMs?: number
  devOtp?: string
}

export async function sendMfaEmailCode(session: Session): Promise<SendCodeResponse> {
  const response = await apiFetch('/auth/mfa/send-email-code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getHeaders(session),
    },
  })

  const data = (await response.json()) as {
    message?: string
    maskedEmail?: string
    retryAfterMs?: number
    devOtp?: string
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
    devOtp: data.devOtp,
  }
}

export type VerifyCodeResponse = {
  verified: boolean
  deviceToken?: string
}

export async function verifyMfaEmailCode(
  session: Session,
  code: string,
  trustDevice?: boolean,
): Promise<VerifyCodeResponse> {
  const response = await apiFetch('/auth/mfa/verify-email-code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getHeaders(session),
    },
    body: JSON.stringify({ code, trustDevice: trustDevice ?? true }),
  })

  const data = (await response.json()) as { verified?: boolean; deviceToken?: string; message?: string }

  if (!response.ok) {
    throw new Error(data.message || 'Invalid or expired code.')
  }

  return { verified: data.verified === true, deviceToken: data.deviceToken }
}
