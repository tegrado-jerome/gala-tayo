/*
 * Where a sign-up started (a place, a plan invite), kept on the device for a day. The `next` in the URL
 * normally carries it through the confirm email, Google and onboarding; this copy is the fallback when the
 * confirm link opens somewhere that lost it, or the person confirms in one tab and logs in from another.
 */
const RETURN_TTL_MS = 24 * 60 * 60 * 1000

type StoredReturnPath = { path: string; expiresAt: number }

export function encodeReturnPath(path: string, now = Date.now()) {
  return JSON.stringify({ path, expiresAt: now + RETURN_TTL_MS } satisfies StoredReturnPath)
}

/** The stored path while it is fresh and on this site; null otherwise. */
export function decodeReturnPath(raw: string | null, now = Date.now()) {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<StoredReturnPath>
    if (typeof value.path !== 'string' || typeof value.expiresAt !== 'number' || value.expiresAt <= now) return null
    return value.path.startsWith('/') && !value.path.startsWith('//') ? value.path : null
  } catch {
    return null
  }
}
