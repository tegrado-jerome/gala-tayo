type CommentReportReason = 'spam' | 'harassment' | 'inappropriate' | 'false_info' | 'personal_info' | 'other'
type CommentReportStatus = 'pending' | 'dismissed' | 'action_taken'

export type AdminCommentReport = {
  id: string
  commentId: string
  reportedBy: string
  reason: CommentReportReason
  details: string | null
  status: CommentReportStatus
  resolvedBy: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
  comment: {
    text: string
    status: 'visible' | 'deleted' | 'hidden'
    author: {
      id: string
      username: string | null
      email: string | null
      avatarUrl: string | null
    }
  } | null
  place: {
    id: string
    name: string | null
    slug: string | null
  } | null
  reporter: {
    id: string
    username: string | null
    email: string | null
    avatarUrl: string | null
  }
  resolver: {
    id: string
    username: string | null
  } | null
}

type AdminCommentReportsResponse = {
  reports?: AdminCommentReport[]
  message?: string
}

type ApiErrorResponse = {
  error?: string
  message?: string
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

export async function getAdminCommentReports(token: string, status: CommentReportStatus | 'all' = 'pending', signal?: AbortSignal) {
  const query = new URLSearchParams()
  if (status && status !== 'all') {
    query.set('status', status)
  }

  const response = await apiFetch(`/app-admin/comment-reports?${query.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal,
  })
  const result = await readJson<AdminCommentReportsResponse>(response)

  if (!response.ok) {
    throw new Error(result?.message || 'Could not load comment reports.')
  }

  return result?.reports || []
}

type ModerateAction = 'dismiss' | 'take_action'

export async function moderateAdminCommentReport(reportId: string, token: string, action: ModerateAction) {
  const response = await apiFetch(`/app-admin/comment-reports/${encodeURIComponent(reportId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action }),
  })
  const result = await readJson<ApiErrorResponse & { ok?: boolean; message?: string }>(response)

  if (!response.ok) {
    throw new Error(result?.message || 'Could not moderate comment report.')
  }

  return result
}
