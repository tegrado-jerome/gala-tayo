import type { Session } from '@supabase/supabase-js'
import { getApiUrl } from './apiClient'
import type { GalaPlanOwner } from './galaPlansApi'

export type GalaPlanRsvp = 'going' | 'maybe' | 'no'

export type GalaPlanMember = {
  user_id: string
  rsvp: GalaPlanRsvp
  paid: boolean
  is_owner: boolean
  profile: GalaPlanOwner | null
  /** When this member last changed their RSVP or paid status. */
  updated_at?: string | null
}

export type GalaPlanPoll = {
  id: string
  question: string
  viewer_option_id: string | null
  total_votes: number
  options: Array<{
    id: string
    label: string
    place_id: string | null
    votes: number
    voters: GalaPlanOwner[]
  }>
}

// `available: false` means the barkada tables are not set up yet; the UI hides these features.
export type GalaPlanBarkada =
  | { available: false }
  | { available: true; viewer_rsvp: GalaPlanRsvp | null; members: GalaPlanMember[]; polls: GalaPlanPoll[] }

async function request(path: string, session: Session | null | undefined, init: RequestInit = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`

  const response = await fetch(getApiUrl(path), { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } })
  const data = (await response.json().catch(() => ({}))) as GalaPlanBarkada & { message?: string }
  if (!response.ok) throw new Error(data.message || 'Couldn\'t update the group. Try again.')
  return data
}

const planPath = (planId: string) => `/gala-plans/${encodeURIComponent(planId)}`

export function getGalaPlanBarkada(planId: string, session?: Session | null) {
  return request(`${planPath(planId)}/barkada`, session)
}

export function setGalaPlanRsvp(planId: string, rsvp: GalaPlanRsvp, session?: Session | null) {
  return request(`${planPath(planId)}/rsvp`, session, { method: 'PUT', body: JSON.stringify({ rsvp }) })
}

export function setGalaPlanMemberPaid(planId: string, userId: string, paid: boolean, session?: Session | null) {
  return request(`${planPath(planId)}/members/${encodeURIComponent(userId)}`, session, {
    method: 'PATCH',
    body: JSON.stringify({ paid }),
  })
}

export function createGalaPlanPoll(
  planId: string,
  poll: { question: string; options: Array<{ label: string; place_id?: string | null }> },
  session?: Session | null,
) {
  return request(`${planPath(planId)}/polls`, session, { method: 'POST', body: JSON.stringify(poll) })
}

export function deleteGalaPlanPoll(planId: string, pollId: string, session?: Session | null) {
  return request(`${planPath(planId)}/polls/${encodeURIComponent(pollId)}`, session, { method: 'DELETE' })
}

export function voteGalaPlanPoll(planId: string, pollId: string, optionId: string, session?: Session | null) {
  return request(`${planPath(planId)}/polls/${encodeURIComponent(pollId)}/vote`, session, {
    method: 'PUT',
    body: JSON.stringify({ option_id: optionId }),
  })
}
