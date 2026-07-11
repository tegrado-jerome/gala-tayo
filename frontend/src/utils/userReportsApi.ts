export type UserReportReason =
  | 'fake_account'
  | 'harassment'
  | 'inappropriate_profile'
  | 'spam'
  | 'impersonation'
  | 'other'

export type UserReportStatus =
  | 'pending'
  | 'dismissed'
  | 'action_taken'

export type SubmitUserReportPayload = {
  reason: UserReportReason
  details?: string | null
}

export type MyUserReport = {
  id: string
  reported_user_id: string
  reason: UserReportReason
  status: UserReportStatus
  created_at: string
}

export type AdminUserReport = {
  id: string
  reportedUserId: string
  reporterUserId: string
  reason: UserReportReason
  details: string | null
  status: UserReportStatus
  createdAt: string
  resolvedBy: string | null
  resolvedAt: string | null
  moderatorNote: string | null
  reportedUser: {
    id: string
    email: string | null
    username: string | null
    displayName: string | null
    avatarUrl: string | null
  }
  reporter: {
    id: string
    email: string | null
    username: string | null
    displayName: string | null
    avatarUrl: string | null
  }
  resolver: {
    id: string
    email: string | null
    username: string | null
    displayName: string | null
    avatarUrl: string | null
  } | null
}

type UserReportsResponse = {
  reports?: MyUserReport[]
  message?: string
}

type AdminUserReportsResponse = {
  reports?: AdminUserReport[]
  message?: string
}

type ApiErrorResponse = {
  success?: boolean
  error?: string
  message?: string
}

type UpdateAdminUserReportPayload = {
  status: UserReportStatus
  moderatorNote?: string | null
}

import { apiFetch } from './apiClient'

async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text()

  if (!text.trim()) {
    return null
  }

  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

async function reportUser(userId: string, token: string, payload: SubmitUserReportPayload) {
  const details = payload.details?.trim() || ''
  const response = await apiFetch(`/users/${encodeURIComponent(userId)}/report`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      reason: payload.reason,
      ...(details ? { details } : {}),
    }),
  })
  const result = await readJson<ApiErrorResponse>(response)

  if (!response.ok) {
    if (response.status === 409) {
      return {
        success: false,
        alreadyReported: true,
        message: result?.message || 'You already reported this user.',
      }
    }

    throw new Error(result?.message || 'Could not submit user report. Please try again.')
  }

  return {
    success: true,
    alreadyReported: false,
    message: result?.message || 'Report submitted. Thanks for helping keep GalaTayo safe.',
  }
}

async function getMyUserReports(token: string, signal?: AbortSignal) {
  const response = await apiFetch('/me/user-reports', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal,
  })
  const result = await readJson<UserReportsResponse>(response)

  if (!response.ok) {
    throw new Error(result?.message || 'Could not load your user reports. Please try again.')
  }

  return result?.reports || []
}

async function getAdminUserReports(token: string, status: UserReportStatus | 'all' = 'pending', signal?: AbortSignal) {
  const query = new URLSearchParams()
  if (status) {
    query.set('status', status)
  }

  const response = await apiFetch(`/app-admin/user-reports?${query.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal,
  })
  const result = await readJson<AdminUserReportsResponse>(response)

  if (!response.ok) {
    throw new Error(result?.message || 'Could not load user reports. Please try again.')
  }

  return result?.reports || []
}

async function updateAdminUserReport(reportId: string, token: string, payload: UpdateAdminUserReportPayload) {
  const response = await apiFetch(`/app-admin/user-reports/${encodeURIComponent(reportId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      status: payload.status,
      moderator_note: payload.moderatorNote?.trim() || null,
    }),
  })
  const result = await readJson<ApiErrorResponse & { report?: AdminUserReport }>(response)

  if (!response.ok) {
    throw new Error(result?.message || 'Could not update user report. Please try again.')
  }

  return result
}

export { getAdminUserReports, getMyUserReports, reportUser, updateAdminUserReport }
