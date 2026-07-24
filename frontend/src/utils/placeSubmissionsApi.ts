import type { Session } from '@supabase/supabase-js'
import { apiFetch } from './apiClient'

export type PlaceSubmissionImage = {
  id: string
  imageUrl: string | null
  storageKey: string | null
  sortOrder: number
  createdAt: string
}

export type PlaceSubmission = {
  id: string
  submittedBy: string
  approvedPlaceId: string | null
  name: string
  category: string
  address: string
  city: string
  area: string | null
  latitude: number
  longitude: number
  description: string
  bestTimeToVisit: string | null
  visitDuration: string | null
  budgetMin: number | null
  goodFor: string[]
  notIdealFor: string[]
  crowdLevel: string | null
  indoorOutdoor: string | null
  weatherFit: string | null
  parkingInfo: string | null
  commuteAccess: string | null
  nearbyContext: string | null
  websiteUrl: string | null
  googleMapsUrl: string | null
  status: 'pending' | 'approved' | 'rejected' | string
  rejectionReason: string | null
  adminNote: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
  images: PlaceSubmissionImage[]
}

export type AdminPlaceSubmission = PlaceSubmission & {
  contributorUsername: string | null
  contributorDisplayName: string | null
  contributorEmail: string | null
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & {
    message?: string
    error?: string
  }

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Request failed.')
  }

  return data
}

export async function submitPlaceSubmission(formData: FormData, session: Session) {
  const response = await apiFetch(
    '/place-submissions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: formData,
    },
    60000,
  )

  return readJsonResponse<{ message: string; submission: { id: string; status: string; name: string; city: string; images: PlaceSubmissionImage[] } }>(response)
}

export async function getMyPlaceSubmissions(session: Session) {
  const response = await apiFetch('/place-submissions/mine', {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  return readJsonResponse<{ submissions: PlaceSubmission[] }>(response)
}

export async function getPendingPlaceSubmissions(session: Session) {
  const response = await apiFetch('/app-admin/place-submissions/pending', {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  return readJsonResponse<{ submissions: AdminPlaceSubmission[] }>(response)
}

export async function approvePlaceSubmission(
  submissionId: string,
  payload: { adminNote?: string },
  session: Session,
) {
  const response = await apiFetch(`/app-admin/place-submissions/${encodeURIComponent(submissionId)}/approve`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      admin_note: payload.adminNote?.trim() || null,
    }),
  })

  return readJsonResponse<{ message: string; place: { id: string; name: string; slug: string } }>(response)
}

export async function rejectPlaceSubmission(
  submissionId: string,
  payload: { rejectionReason?: string; adminNote?: string },
  session: Session,
) {
  const response = await apiFetch(`/app-admin/place-submissions/${encodeURIComponent(submissionId)}/reject`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      rejection_reason: payload.rejectionReason?.trim() || null,
      admin_note: payload.adminNote?.trim() || null,
    }),
  })

  return readJsonResponse<{ message: string }>(response)
}
