import type { Session } from '@supabase/supabase-js'
import { getApiUrl } from './apiClient'

export type CityStamp = {
  city: string
  collected: boolean
  places: number
  first_checkin_at: string | null
}

// `available: false` means the passport table is not set up yet.
export type Passport =
  | { available: false }
  | {
      available: true
      stamps: CityStamp[]
      total_checkins: number
      unique_places: number
      streak_weeks: number
      recent: Array<{ place_id: string; name: string; slug: string | null; city: string | null; created_at: string }>
    }

export type CheckinResult = Passport & { new_stamp_city?: string | null; place_name?: string }

async function request<T>(path: string, session: Session | null | undefined, init: RequestInit = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
  const response = await fetch(getApiUrl(path), { ...init, headers })
  const data = (await response.json().catch(() => ({}))) as T & { message?: string }
  if (!response.ok) throw new Error(data.message || 'Something went wrong. Try again.')
  return data
}

export function getMyPassport(session?: Session | null) {
  return request<Passport>('/me/passport', session)
}

export function checkInAtPlace(placeId: string, coords: { latitude: number; longitude: number }, session?: Session | null) {
  return request<CheckinResult>(`/places/${encodeURIComponent(placeId)}/checkin`, session, {
    method: 'POST',
    body: JSON.stringify(coords),
  })
}

export function getCurrentPosition(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Your browser does not support location.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => reject(new Error('Allow location access so we can confirm you are here.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  })
}
