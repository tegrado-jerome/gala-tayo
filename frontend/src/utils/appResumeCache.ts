import type { AppResumeCache } from '../types/appTypes'
import type { CurrentUserResponse } from './profileApi'

const APP_RESUME_CACHE_KEY = 'galatayo:app-resume'
const APP_RESUME_CACHE_TTL_MS = 30 * 60 * 1000

function isValidProfile(value: unknown): value is CurrentUserResponse['profile'] {
  if (!value || typeof value !== 'object') return false
  const profile = value as Record<string, unknown>
  return (
    typeof profile.user_id === 'string' ||
    typeof profile.username === 'string' ||
    typeof profile.displayName === 'string'
  )
}

export function readAppResumeCache(): AppResumeCache | null {
  try {
    const rawCache = window.localStorage.getItem(APP_RESUME_CACHE_KEY)

    if (!rawCache) {
      return null
    }

    const parsedCache = JSON.parse(rawCache) as Partial<AppResumeCache>

    if (
      typeof parsedCache.cachedAt !== 'number' ||
      !Number.isFinite(parsedCache.cachedAt) ||
      Date.now() - parsedCache.cachedAt > APP_RESUME_CACHE_TTL_MS
    ) {
      window.localStorage.removeItem(APP_RESUME_CACHE_KEY)
      return null
    }

    return {
      userId: typeof parsedCache.userId === 'string' ? parsedCache.userId : null,
      needsOnboarding: parsedCache.needsOnboarding === true,
      currentProfile: isValidProfile(parsedCache.currentProfile) ? parsedCache.currentProfile : null,
      cachedAt: parsedCache.cachedAt,
    }
  } catch {
    return null
  }
}

export function writeAppResumeCache(cache: AppResumeCache) {
  try {
    window.localStorage.setItem(APP_RESUME_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // localStorage may be unavailable, ignore
  }
}

export function clearAppResumeCache() {
  try {
    window.localStorage.removeItem(APP_RESUME_CACHE_KEY)
  } catch {
    // localStorage may be unavailable, ignore
  }
}
