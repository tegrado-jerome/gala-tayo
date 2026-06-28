type PlaceReportReason = 'wrong_info' | 'closed_or_moved' | 'safety_issue' | 'duplicate_place' | 'photo_or_copyright' | 'other'
type PlaceReportStatus = 'pending' | 'reviewing' | 'resolved' | 'dismissed'

type SubmitPlaceReportPayload = {
  reason: PlaceReportReason
  details?: string | null
  reportedImageId?: string | null
}

type MyPlaceReport = {
  id: string
  placeId: string
  reportedImageId: string | null
  reason: PlaceReportReason
  details: string | null
  status: PlaceReportStatus
  moderatorNote: string | null
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
}

type MyPlaceReportsResponse = {
  reports?: MyPlaceReport[]
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

async function submitPlaceReport(placeId: string, token: string, payload: SubmitPlaceReportPayload) {
  const details = payload.details?.trim() || ''
  const response = await fetch(getApiEndpoint(`/places/${encodeURIComponent(placeId)}/reports`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      reason: payload.reason,
      ...(details ? { details } : {}),
      reported_image_id: payload.reportedImageId ?? null,
    }),
  })
  const result = await readJson<ApiErrorResponse>(response)

  if (!response.ok) {
    throw new Error(result?.message || 'Could not submit place report. Please try again.')
  }

  return result
}

async function fetchMyPlaceReports(token: string, signal?: AbortSignal) {
  const response = await fetch(getApiEndpoint('/me/place-reports'), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal,
  })
  const result = await readJson<MyPlaceReportsResponse>(response)

  if (!response.ok) {
    throw new Error(result?.message || 'Could not load your place reports. Please try again.')
  }

  return result?.reports || []
}

export { fetchMyPlaceReports, submitPlaceReport }
export type { MyPlaceReport, PlaceReportReason, PlaceReportStatus, SubmitPlaceReportPayload }
