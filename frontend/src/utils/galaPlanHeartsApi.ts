import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import { getApiUrl } from './apiClient'

async function getAccessToken(session?: Session | null) {
  if (session?.access_token) {
    return session.access_token
  }

  const {
    data: { session: currentSession },
  } = await supabase.auth.getSession()

  return currentSession?.access_token ?? null
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

export async function heartGalaPlan(planId: string, session?: Session | null) {
  const token = await getAccessToken(session)
  if (!token) {
    throw new Error('Log in to heart this gala plan.')
  }

  const response = await fetch(getApiUrl(`/gala-plans/${encodeURIComponent(planId)}/heart`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })

  return readJson<{ hearted: boolean; viewer_has_hearted: boolean; heart_count: number; hearts_count: number }>(response)
}

export async function unheartGalaPlan(planId: string, session?: Session | null) {
  const token = await getAccessToken(session)
  if (!token) {
    throw new Error('Log in to update this heart.')
  }

  const response = await fetch(getApiUrl(`/gala-plans/${encodeURIComponent(planId)}/heart`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })

  return readJson<{ hearted: boolean; viewer_has_hearted: boolean; heart_count: number; hearts_count: number }>(response)
}
