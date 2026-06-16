type CommentReportReason = 'spam' | 'harassment' | 'inappropriate' | 'false_info' | 'personal_info' | 'other'
type CommentReportStatus = 'pending' | 'dismissed' | 'action_taken'

type SubmitCommentReportPayload = {
  reason: CommentReportReason
  details?: string | null
}

type ModerateCommentReportAction = 'dismiss' | 'take_action'

type MyCommentReport = {
  id: string
  commentId: string
  reason: CommentReportReason
  details: string | null
  status: CommentReportStatus
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  comment: {
    text: string
    status: 'visible' | 'deleted' | 'hidden'
  } | null
  place: {
    id: string
    name: string | null
    slug: string | null
  } | null
}

type MyCommentReportsResponse = {
  reports?: MyCommentReport[]
  message?: string
}

type ApiErrorResponse = {
  error?: string
  message?: string
}

function getApiEndpoint(path: string) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
  return apiBaseUrl ? `${apiBaseUrl}${path}` : `/api${path}`
}

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

async function submitCommentReport(commentId: string, token: string, payload: SubmitCommentReportPayload) {
  const details = payload.details?.trim() || ''
  const response = await fetch(getApiEndpoint(`/place-comments/${encodeURIComponent(commentId)}/report`), {
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
    if (response.status === 409 && result?.error === 'already_reported') {
      throw new Error('You already reported this comment.')
    }

    throw new Error(result?.message || 'Could not submit report. Please try again.')
  }

  return result
}

async function fetchMyCommentReports(token: string, signal?: AbortSignal) {
  const response = await fetch(getApiEndpoint('/me/comment-reports'), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal,
  })
  const result = await readJson<MyCommentReportsResponse>(response)

  if (!response.ok) {
    throw new Error(result?.message || 'Could not load your reports. Please try again.')
  }

  return result?.reports || []
}

async function moderateCommentReport(reportId: string, token: string, action: ModerateCommentReportAction) {
  const response = await fetch(getApiEndpoint(`/app-admin/comment-reports/${encodeURIComponent(reportId)}`), {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action }),
  })
  const result = await readJson<ApiErrorResponse & { ok?: boolean }>(response)

  if (!response.ok) {
    throw new Error(result?.message || 'Could not moderate report. Please try again.')
  }

  return result
}

export { fetchMyCommentReports, moderateCommentReport, submitCommentReport }
export type { CommentReportReason, CommentReportStatus, ModerateCommentReportAction, MyCommentReport }
