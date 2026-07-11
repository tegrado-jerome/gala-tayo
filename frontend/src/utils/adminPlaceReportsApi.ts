type PlaceReportReason = 'wrong_info' | 'closed_or_moved' | 'safety_issue' | 'duplicate_place' | 'photo_or_copyright' | 'other'
type PlaceReportStatus = 'pending' | 'reviewing' | 'resolved' | 'dismissed'

export type AdminPlaceReport = {
  id: string
  placeId: string
  reportedBy: string
  reportedImageId: string | null
  reason: PlaceReportReason
  details: string | null
  status: PlaceReportStatus
  moderatorNote: string | null
  resolvedBy: string | null
  resolvedAt: string | null
  createdAt: string
  place: {
    id: string
    name: string | null
    slug: string | null
  } | null
  image: {
    id: string
    imageUrl: string | null
  } | null
  reporter: {
    id: string
    username: string | null
    email: string | null
  }
  resolver: {
    id: string
    username: string | null
  } | null
}

type AdminPlaceReportsResponse = {
  reports?: AdminPlaceReport[]
  message?: string
}

type ApiErrorResponse = {
  error?: string
  message?: string
}

type UpdateResult = {
  ok?: boolean
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

export async function getAdminPlaceReports(token: string, status: PlaceReportStatus | 'all' = 'pending', signal?: AbortSignal) {
  const query = new URLSearchParams()
  if (status && status !== 'all') {
    query.set('status', status)
  }

  const response = await apiFetch(`/app-admin/place-reports?${query.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal,
  })
  const result = await readJson<AdminPlaceReportsResponse>(response)

  if (!response.ok) {
    throw new Error(result?.message || 'Could not load place reports.')
  }

  return result?.reports || []
}

export async function updateAdminPlaceReport(reportId: string, token: string, payload: { status: PlaceReportStatus; moderatorNote?: string | null }) {
  const response = await apiFetch(`/app-admin/place-reports/${encodeURIComponent(reportId)}`, {
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
  const result = await readJson<ApiErrorResponse & UpdateResult>(response)

  if (!response.ok) {
    throw new Error(result?.message || 'Could not update place report.')
  }

  return result
}

export async function deleteAdminPlaceReport(reportId: string, token: string) {
  const response = await apiFetch(`/app-admin/place-reports/${encodeURIComponent(reportId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  const result = await readJson<ApiErrorResponse & UpdateResult>(response)

  if (!response.ok) {
    throw new Error(result?.message || 'Could not delete place report.')
  }

  return result
}
