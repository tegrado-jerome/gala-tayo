import { useEffect, useState } from 'react'

/** Researched extras for a place page (each fact traced to the listed sources). */
export type PlaceExtras = {
  didYouKnow?: string[]
  whatToDo?: string[]
  safetyTips?: string[]
  sources?: string[]
}

/** Loads the extras manifest on demand so listing pages don't pay for it. */
export function usePlaceExtras(slug: string | null | undefined) {
  const [extras, setExtras] = useState<{ slug: string; value: PlaceExtras } | null>(null)

  useEffect(() => {
    if (!slug) return
    let isActive = true
    void import('../data/placeExtras.json').then(({ default: manifest }) => {
      if (isActive) setExtras({ slug, value: (manifest as Record<string, PlaceExtras>)[slug] ?? {} })
    })
    return () => {
      isActive = false
    }
  }, [slug])

  return extras && extras.slug === slug ? extras.value : {}
}

/** "en.wikipedia.org" → "Wikipedia"-style short label for a source link. */
export function sourceLabel(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (host.endsWith('wikipedia.org')) return 'Wikipedia'
    if (host.endsWith('wikivoyage.org')) return 'Wikivoyage'
    if (host === 'guide.michelin.com') return 'MICHELIN Guide'
    return host
  } catch {
    return url
  }
}
