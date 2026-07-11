const ADMIN_STATE_CACHE_TTL_MS = 15 * 60 * 1000
const ADMIN_ACCESS_CACHE_KEY = 'galatayo:admin-access-cache'

type AdminAccessCache = {
  userId: string
  isAdmin: boolean
  cachedAt: number
}

function readJson<T>(value: string | null): T | null {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function isFresh(cachedAt: number) {
  return Number.isFinite(cachedAt) && Date.now() - cachedAt <= ADMIN_STATE_CACHE_TTL_MS
}

export function readAdminAccessCache(userId: string): boolean | null {
  try {
    const rawValue = window.sessionStorage.getItem(ADMIN_ACCESS_CACHE_KEY)
    const parsed = readJson<Partial<AdminAccessCache>>(rawValue)

    if (!parsed || parsed.userId !== userId || typeof parsed.isAdmin !== 'boolean' || typeof parsed.cachedAt !== 'number') {
      return null
    }

    if (!isFresh(parsed.cachedAt)) {
      window.sessionStorage.removeItem(ADMIN_ACCESS_CACHE_KEY)
      return null
    }

    return parsed.isAdmin
  } catch {
    return null
  }
}

export function writeAdminAccessCache(userId: string, isAdmin: boolean) {
  try {
    const payload: AdminAccessCache = {
      userId,
      isAdmin,
      cachedAt: Date.now(),
    }

    window.sessionStorage.setItem(ADMIN_ACCESS_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // sessionStorage may be unavailable, ignore
  }
}

export function clearAdminAccessCache() {
  try {
    window.sessionStorage.removeItem(ADMIN_ACCESS_CACHE_KEY)
  } catch {
    // sessionStorage may be unavailable, ignore
  }
}

export function readSessionCache<T>(key: string): T | null {
  try {
    const rawValue = window.sessionStorage.getItem(key)
    const parsed = readJson<{ cachedAt?: number } & T>(rawValue)

    if (!parsed || typeof parsed.cachedAt !== 'number' || !isFresh(parsed.cachedAt)) {
      if (parsed) {
        window.sessionStorage.removeItem(key)
      }
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function writeSessionCache<T extends object>(key: string, value: T) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ ...value, cachedAt: Date.now() }))
  } catch {
    // sessionStorage may be unavailable, ignore
  }
}

export function clearSessionCache(key: string) {
  try {
    window.sessionStorage.removeItem(key)
  } catch {
    // sessionStorage may be unavailable, ignore
  }
}
