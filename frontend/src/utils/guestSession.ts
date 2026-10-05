import { supabase } from '../supabase'
import { setRememberMePreference } from '../services/authApi'
import { createGuestSessionManager } from './guestSessionCore'

export { hasAccountSession, isAnonymousSession } from './guestSessionCore'

/** The public GoTrue settings say whether anonymous sign-ins are on, without creating a user. */
async function isAnonymousProviderEnabled() {
  const url = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
  const key = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '')
  if (!url || !key) return false
  const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
  if (!response.ok) return false
  const settings = (await response.json()) as { external?: { anonymous_users?: boolean } }
  return settings.external?.anonymous_users === true
}

const manager = createGuestSessionManager({
  auth: supabase.auth,
  isAnonymousProviderEnabled,
  beforeSignIn: () => setRememberMePreference(true),
})

export const isGuestModeAvailable = manager.isGuestModeAvailable
export const ensureGuestSession = manager.ensureGuestSession
