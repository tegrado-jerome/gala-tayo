import { createClient } from '@supabase/supabase-js'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim()
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

const rememberMeKey = 'galatayo:remember-me'

const authStorage = {
  getItem(key: string): string | null {
    return localStorage.getItem(key) ?? sessionStorage.getItem(key)
  },
  setItem(key: string, value: string): void {
    const rememberMe = sessionStorage.getItem(rememberMeKey)
    if (rememberMe === 'true') {
      localStorage.setItem(key, value)
    } else {
      sessionStorage.setItem(key, value)
    }
  },
  removeItem(key: string): void {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  },
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: authStorage,
  },
})

export async function getSupabaseSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  return session
}

export async function getSupabaseAccessToken(session?: Session | null) {
  const currentSession = await getSupabaseSession()

  if (currentSession?.access_token) {
    return currentSession.access_token
  }

  return session?.access_token ?? null
}

export function hasSessionUserChanged(previousSession: Session | null, nextSession: Session | null) {
  const previousUserId = previousSession?.user?.id ?? null
  const nextUserId = nextSession?.user?.id ?? null

  return previousUserId !== nextUserId
}

export function shouldPropagateSessionChange(
  event: AuthChangeEvent,
  previousSession: Session | null,
  nextSession: Session | null,
) {
  return hasSessionUserChanged(previousSession, nextSession) || event === 'SIGNED_OUT'
}
