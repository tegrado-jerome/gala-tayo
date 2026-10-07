import type { GalaPlanRsvp } from './galaPlanBarkadaApi'

/*
 * The RSVP a logged-out friend tapped before signing up. It survives the email link (a new tab) and
 * onboarding, and is applied once they are back on that plan with an account.
 */

const KEY = 'galatayo:pending-rsvp'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

type PendingRsvp = { planId: string; rsvp: GalaPlanRsvp; at: number }

export function rememberPendingRsvp(planId: string, rsvp: GalaPlanRsvp) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ planId, rsvp, at: Date.now() } satisfies PendingRsvp))
  } catch {
    // Storage blocked: they can tap again after signing in.
  }
}

export function clearPendingRsvp() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

/** The pending RSVP for this plan, removed as it is read. */
export function takePendingRsvp(planId: string): GalaPlanRsvp | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const pending = JSON.parse(raw) as Partial<PendingRsvp>
    if (pending.planId !== planId) return null
    localStorage.removeItem(KEY)
    const fresh = typeof pending.at === 'number' && Date.now() - pending.at < MAX_AGE_MS
    return fresh && (pending.rsvp === 'going' || pending.rsvp === 'maybe' || pending.rsvp === 'no') ? pending.rsvp : null
  } catch {
    return null
  }
}
