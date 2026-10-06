import { useEffect, useState } from 'react'
import { apiFetch } from './apiClient'

/** A daily "Gala Today" post: one trend (or the day's angle) turned into three gala picks. */
export type GalaTodayPost = {
  slug: string
  date: string
  publishedAt: string
  title: string
  hook: string
  body: string
  memeFormat: string | null
  trend: { title: string; source: string; url: string | null } | null
  angle: string
  picks: Array<{ slug: string; name: string; city: string; canonicalPath: string; why: string }>
}

let request: Promise<GalaTodayPost[]> | null = null

const byNewest = (left: GalaTodayPost, right: GalaTodayPost) => right.publishedAt.localeCompare(left.publishedAt)

async function fetchPosts(): Promise<GalaTodayPost[]> {
  // The bundled copy (committed daily) renders instantly and in prerender; the API adds anything newer.
  const bundled = ((await import('../data/galaToday.json')).default as GalaTodayPost[]) ?? []
  let live: GalaTodayPost[] = []
  try {
    const response = await apiFetch('/today?limit=30', { method: 'GET' }, 12_000)
    if (response.ok) live = ((await response.json()) as { posts?: GalaTodayPost[] }).posts ?? []
  } catch {
    // Offline or slow API: the bundled posts are still real and current as of the last deploy.
  }
  const merged = new Map<string, GalaTodayPost>()
  for (const post of [...bundled, ...live]) merged.set(post.slug, post)
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
