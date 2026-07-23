export const HISTORY_CACHE_PREFIX = 'galatayo:history:'
export const HISTORY_CACHE_TTL_MS = 5 * 60 * 1000

export type HistoryPlace = {
  id: string
  slug: string | null
  name: string | null
  category?: string | null
  address?: string | null
  area?: string | null
  city?: string | null
  google_maps_url?: string | null
  latitude?: number | null
  longitude?: number | null
  description?: string | null
  budget_label?: string | null
  photo_url?: string | null
  photos?: string[] | null
}

export type HistoryItem = {
  id: string
  type: string
  query?: string | null
  place_id?: string | null
  created_at: string
  place: HistoryPlace | null
}

export type HistoryResponse = {
  history?: HistoryItem[]
  message?: string
}

function getHistoryCacheKey(userId: string) {
  return `${HISTORY_CACHE_PREFIX}${userId}`
}

export function readHistoryCache(userId: string): HistoryItem[] | null {
  try {
    const raw = localStorage.getItem(getHistoryCacheKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { items: HistoryItem[]; cachedAt: number } | null
    if (!parsed || typeof parsed.cachedAt !== 'number' || Date.now() - parsed.cachedAt > HISTORY_CACHE_TTL_MS) {
      if (parsed) localStorage.removeItem(getHistoryCacheKey(userId))
      return null
    }
    return parsed.items
  } catch {
    return null
  }
}

export function writeHistoryCache(userId: string, items: HistoryItem[]) {
  try {
    localStorage.setItem(getHistoryCacheKey(userId), JSON.stringify({ items, cachedAt: Date.now() }))
  } catch {
    /* ignore */
  }
}

export function clearHistoryCache(userId: string) {
  try {
    localStorage.removeItem(getHistoryCacheKey(userId))
  } catch {
    /* ignore */
  }
}
