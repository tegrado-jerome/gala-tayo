import { useEffect, useState } from 'react'
import { apiFetch } from './apiClient'

export type GalaTodayFormat =
  | 'budget-challenge'
  | '24-hours'
  | 'would-you-rather'
  | 'tier-list'
  | 'guess-the-place'
  | 'starter-pack'
  | 'pov'
  | 'expectation-vs-reality'
  | 'main-character'
  | 'gem-vs-famous'

export type GalaTodayPick = {
  slug: string
  name: string
  city: string
  canonicalPath: string
  why: string
  tier?: 'S' | 'A' | 'B'
  time?: string
  budgetMin?: number | null
}

/** A daily "Gala Today" post: what's trending, turned into a creator-style gala plan with real places. */
export type GalaTodayPost = {
  slug: string
  date: string
  publishedAt: string
  format: GalaTodayFormat
  /** The format sticker, e.g. "₱500 Challenge". */
  sticker: string
  title: string
  hook: string
  body: string
  meme: { top: string; bottom: string }
  topic: { kind: 'trend' | 'evergreen'; title: string; query: string; source: string | null; url: string | null }
  /** A short human weather line, only when rain is likely. */
  weather: string | null
  area: string
  /** The most iconic pick; its HD photo leads the meme card. */
  leadSlug: string
  picks: GalaTodayPick[]
  budget?: { cap: number; total: number }
  clues?: string[]
  items?: string[]
}

let request: Promise<GalaTodayPost[]> | null = null

const byNewest = (left: GalaTodayPost, right: GalaTodayPost) => right.publishedAt.localeCompare(left.publishedAt)
// Older posts (before the creator formats) have no meme or sticker; they are not shown.
const isCurrentPost = (post: GalaTodayPost) => Boolean(post?.format && post.meme?.top && post.picks?.length)

async function fetchPosts(): Promise<GalaTodayPost[]> {
  // The bundled copy (committed daily) renders instantly and in prerender; the API adds anything newer.
  const bundled = ((await import('../data/galaToday.json')).default as unknown as GalaTodayPost[]) ?? []
  let live: GalaTodayPost[] = []
  // Prerendering (headless) uses the committed posts only, so the build never waits on the API.
  if (typeof navigator !== 'undefined' && navigator.webdriver) return bundled.sort(byNewest)
  try {
    const response = await apiFetch('/today?limit=30', { method: 'GET' }, 12_000)
    if (response.ok) live = ((await response.json()) as { posts?: GalaTodayPost[] }).posts ?? []
  } catch {
    // Offline or slow API: the bundled posts are still real and current as of the last deploy.
  }
  const merged = new Map<string, GalaTodayPost>()
  for (const post of [...bundled, ...live].filter(isCurrentPost)) merged.set(post.slug, post)
  return [...merged.values()].sort(byNewest)
}

export function loadGalaToday() {
  request ??= fetchPosts().catch(() => {
    request = null
    return []
  })
  return request
}

export function useGalaToday() {
  const [posts, setPosts] = useState<GalaTodayPost[] | null>(null)
  useEffect(() => {
    let active = true
    void loadGalaToday().then((loaded) => active && setPosts(loaded))
    return () => {
      active = false
    }
  }, [])
  return posts
}

export function formatPostDate(date: string) {
  return new Date(`${date}T12:00:00+08:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })
}

export const formatPeso = (value: number) => (value === 0 ? 'Free' : `₱${value.toLocaleString('en-PH')}`)

/** The pick whose photo leads the post (falls back to the first pick). */
export function leadPick(post: GalaTodayPost) {
  return post.picks.find((pick) => pick.slug === post.leadSlug) ?? post.picks[0]
}
