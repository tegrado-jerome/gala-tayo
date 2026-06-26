import { createClient } from '@supabase/supabase-js'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
