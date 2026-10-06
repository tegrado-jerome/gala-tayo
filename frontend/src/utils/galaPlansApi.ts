import type { Session } from '@supabase/supabase-js'
import { getSupabaseAccessToken } from '../supabase'
import { getApiUrl } from './apiClient'
import type { PublicGalaPlanPreviewPlace } from './profileApi'
import { getAskAiRequestHeaders } from './askAiIdentity'

export type GalaPlanVisibility = 'private' | 'public'
export type GalaPlanStatus = 'active' | 'deleted' | string

export type GalaPlanOwner = {
  user_id: string
  username: string | null
  display_name?: string | null
  avatar_url: string | null
  provider_avatar_url: string | null
  bio?: string | null
}

export type GalaPlanItemPayload = {
  place_id: string
  day_number?: number
  sort_order?: number
  time_label?: string | null
  notes?: string | null
  estimated_minutes?: number | null
}

export type GalaPlanSummary = {
  id: string
  user_id: string
  title: string
  slug: string | null
  description: string | null
  visibility: GalaPlanVisibility
  status: GalaPlanStatus
  is_active: boolean
  published_at: string | null
  created_at: string
  updated_at: string
  heart_count: number
  hearts_count: number
  viewer_has_hearted: boolean
  viewer_is_owner: boolean
  place_count: number
  places_count: number
  preview_places: PublicGalaPlanPreviewPlace[]
  owner?: GalaPlanOwner | null
}

export type GalaPlanDetail = GalaPlanSummary & {
  items: Array<{
    id: string
    plan_id: string
    place_id: string
    order_index: number
    day_number: number
    sort_order: number
    time_label: string | null
    notes: string | null
    estimated_minutes: number | null
    created_at?: string
    updated_at?: string
    place: {
      id: string
      name: string
      slug: string
      category: string | null
      city: string | null
      area?: string | null
      address: string | null
      budget_min?: number | null
      latitude: number | null
      longitude: number | null
      image_url?: string | null
    }
  }>
}

const GALA_PLAN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeGalaPlanId(planId: string) {
  const normalizedPlanId = planId.trim()
  if (!GALA_PLAN_ID_PATTERN.test(normalizedPlanId)) {
    throw new Error('Invalid gala plan id.')
  }
  return normalizedPlanId
}

async function getToken(session?: Session | null) {
  return getSupabaseAccessToken(session)
}

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { message?: string; error?: string }
  if (!response.ok) {
    const error = new Error(data.message || data.error || 'Request failed.')
    ;(error as Error & { status?: number }).status = response.status
    throw error
  }
  return data
}

async function authHeaders(session?: Session | null) {
  const token = await getToken(session)
  if (!token) throw new Error('Sign in is required.')
  return { Authorization: `Bearer ${token}` }
}

async function optionalAuthHeaders(session?: Session | null) {
  const token = await getToken(session)
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

export async function listMyGalaPlans(session?: Session | null) {
  const headers = await authHeaders(session)
  const response = await fetch(getApiUrl('/gala-plans'), { headers })
  return readJson<{ plans: GalaPlanSummary[] }>(response)
}

export async function listFavoriteGalaPlans(session?: Session | null) {
  const headers = await authHeaders(session)
  const response = await fetch(getApiUrl('/gala-plans/favorites'), { headers })
  return readJson<{ plans: GalaPlanSummary[] }>(response)
}

export async function createGalaPlan(
  payload: { title: string; description?: string | null; visibility?: GalaPlanVisibility; items?: GalaPlanItemPayload[] },
  session?: Session | null,
) {
  const headers = await authHeaders(session)
  const response = await fetch(getApiUrl('/gala-plans'), {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return readJson<{ plan: GalaPlanDetail }>(response)
}

export async function getGalaPlan(planId: string, session?: Session | null) {
  const headers = await optionalAuthHeaders(session)
  const normalizedPlanId = normalizeGalaPlanId(planId)
  const requestPath = `/gala-plans/${encodeURIComponent(normalizedPlanId)}`
  const requestUrl = getApiUrl(requestPath)
  const response = await fetch(requestUrl, { headers })
  return readJson<{ plan: GalaPlanDetail }>(response)
}

export const getMyGalaPlan = getGalaPlan

export async function updateGalaPlan(
  planId: string,
  payload: Partial<Pick<GalaPlanDetail, 'title' | 'description' | 'visibility'>> & { items?: GalaPlanItemPayload[] },
  session?: Session | null,
) {
  const headers = await authHeaders(session)
  const response = await fetch(getApiUrl(`/gala-plans/${encodeURIComponent(planId)}`), {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return readJson<{ plan: GalaPlanDetail }>(response)
}

export async function deleteGalaPlan(planId: string, session?: Session | null) {
  const headers = await authHeaders(session)
  const response = await fetch(getApiUrl(`/gala-plans/${encodeURIComponent(planId)}`), {
    method: 'DELETE',
    headers,
  })
  return readJson<{ message: string }>(response)
}

export async function addPlaceToGalaPlan(planId: string, payload: GalaPlanItemPayload, session?: Session | null) {
  const headers = await authHeaders(session)
  const response = await fetch(getApiUrl(`/gala-plans/${encodeURIComponent(planId)}/items`), {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return readJson<{ item: GalaPlanDetail['items'][number] }>(response)
}

export async function updateGalaPlanItem(
  planId: string,
  itemId: string,
  payload: Partial<Omit<GalaPlanItemPayload, 'place_id'>>,
  session?: Session | null,
) {
  const headers = await authHeaders(session)
  const response = await fetch(getApiUrl(`/gala-plans/${encodeURIComponent(planId)}/items/${encodeURIComponent(itemId)}`), {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return readJson<{ item: GalaPlanDetail['items'][number] }>(response)
}

export async function deleteGalaPlanItem(planId: string, itemId: string, session?: Session | null) {
  const headers = await authHeaders(session)
  const response = await fetch(getApiUrl(`/gala-plans/${encodeURIComponent(planId)}/items/${encodeURIComponent(itemId)}`), {
    method: 'DELETE',
    headers,
  })
  return readJson<{ message: string }>(response)
}

export async function toggleGalaPlanHeart(planId: string, session?: Session | null) {
  const headers = await authHeaders(session)
  const response = await fetch(getApiUrl(`/gala-plans/${encodeURIComponent(planId)}/heart`), {
    method: 'POST',
    headers,
  })
  return readJson<{ hearted: boolean; viewer_has_hearted: boolean; heart_count: number; hearts_count: number }>(response)
}

export async function reorderGalaPlanItems(
  planId: string,
  items: Array<{ item_id?: string; place_id?: string; day_number?: number; order_index?: number; sort_order: number }>,
  session?: Session | null,
) {
  const current = await getGalaPlan(planId, session)
  const nextItems = current.plan.items.map((item) => {
    const override = items.find((nextItem) => nextItem.item_id === item.id || nextItem.place_id === item.place_id)
    return {
      place_id: item.place_id,
      day_number: override?.day_number ?? item.day_number,
      sort_order: override?.sort_order ?? override?.order_index ?? item.sort_order,
      time_label: item.time_label,
      notes: item.notes,
      estimated_minutes: item.estimated_minutes,
    }
  })
  return updateGalaPlan(planId, { items: nextItems }, session)
}

export type GalaPlanDateMode = 'anytime' | 'na' | 'date'

// Plan settings ride at the start of the description: "[gala_date:2026-10-10][gala_group:3]\nNotes".
const MARKERS_PATTERN = /^((?:\[gala_[a-z]+:[^\]\n]*\])+)\n?/i
const DATE_VALUE_PATTERN = /\[gala_date:(anytime|na|\d{4}-\d{2}-\d{2})\]/i
const GROUP_VALUE_PATTERN = /\[gala_group:(\d{1,2})\]/i

export function parseGalaPlanDescription(description: string | null | undefined) {
  const rawDescription = description ?? ''
  const markers = rawDescription.match(MARKERS_PATTERN)?.[1] ?? ''
  const markerValue = markers.match(DATE_VALUE_PATTERN)?.[1] ?? 'anytime'
  const groupSize = Number(markers.match(GROUP_VALUE_PATTERN)?.[1] ?? 0)
  const cleanDescription = markers ? rawDescription.replace(MARKERS_PATTERN, '').trimStart() : rawDescription

  return {
    dateMode: markerValue === 'anytime' || markerValue === 'na' ? markerValue as GalaPlanDateMode : 'date' as GalaPlanDateMode,
    date: markerValue === 'anytime' || markerValue === 'na' ? '' : markerValue,
    /** How many people the plan is for, as set when it was made; null when never set. */
    groupSize: groupSize >= 1 ? Math.min(30, groupSize) : null,
    description: cleanDescription,
  }
}

export function composeGalaPlanDescription({
  description,
  dateMode,
  date,
  groupSize = null,
}: {
  description: string
  dateMode: GalaPlanDateMode
  date: string
  groupSize?: number | null
}) {
  const markerValue = dateMode === 'date' && date ? date : dateMode
  const cleanDescription = description.trim()
  const group = groupSize && groupSize > 1 ? `[gala_group:${Math.min(30, Math.round(groupSize))}]` : ''
  return `[gala_date:${markerValue}]${group}${cleanDescription ? `\n${cleanDescription}` : ''}`
}

export function formatGalaPlanDate(description: string | null | undefined) {
  const parsed = parseGalaPlanDescription(description)

  if (parsed.dateMode === 'na') {
    return 'N/A'
  }

  if (parsed.dateMode === 'anytime' || !parsed.date) {
    return 'Anytime'
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${parsed.date}T00:00:00`))
}

export type GalaPlanPlace = GalaPlanDetail['items'][number]['place']

export type GalaPlanAiDraft = {
  title: string
  summary: string
  date: string | null
  /** "prompt" when the date came from the request, "default" when Tara picked the next Saturday. */
  date_source?: 'prompt' | 'default'
  /** "fallback" when the AI was busy and the plan was built from GalaTayo places without it. */
  source?: 'ai' | 'fallback'
  group_size: number
  /** The budget per person read from the request, when it named one. */
  budget_per_head?: number | null
  stops: Array<{
    place_id: string
    time: string
    minutes: number
    note: string
    place: GalaPlanPlace
  }>
}

export class GalaPlanAiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export async function draftGalaPlanWithAi(prompt: string, session?: Session | null, date?: string | null) {
  const response = await fetch(getApiUrl('/gala-plans/ai-draft'), {
    method: 'POST',
    headers: await getAskAiRequestHeaders(session?.access_token ?? null),
    body: JSON.stringify(date ? { prompt, date } : { prompt }),
  }).catch(() => {
    throw new GalaPlanAiError("Couldn't reach Tara. Check your connection and try again.", 0, 'NETWORK')
  })
  const data = (await response.json().catch(() => ({}))) as {
    draft?: GalaPlanAiDraft
    usage?: { remaining: number; dailyLimit: number }
    message?: string
    code?: string
  }

  if (!response.ok || !data.draft) {
    throw new GalaPlanAiError(data.message || 'Plan with AI failed. Try again.', response.status, data.code)
  }

  return { draft: data.draft, usage: data.usage ?? null }
}
