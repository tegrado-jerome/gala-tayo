const R2_PUBLIC_BASE_URL = 'https://media.galatayo.app'

// Cloudflare Image Transformations on media.galatayo.app (free up to 5,000 unique resizes a month).
// Keep widths to a few sizes so each photo counts as few unique resizes. onerror=redirect serves
// the original when a resize fails, for example after the monthly limit.
// `phone` fits a full-width hero on a typical phone (about 380 CSS px at 1.75 to 2x) at half the bytes of `hero`.
const MEDIA_WIDTHS = { thumb: 160, card: 640, phone: 768, hero: 1280 } as const

function resizedMediaUrl<T extends string | null | undefined>(url: T, size: keyof typeof MEDIA_WIDTHS): T | string {
  if (!url || !url.startsWith(`${R2_PUBLIC_BASE_URL}/`) || url.includes('/cdn-cgi/')) return url
  return `${R2_PUBLIC_BASE_URL}/cdn-cgi/image/width=${MEDIA_WIDTHS[size]},quality=75,format=auto,onerror=redirect${url.slice(R2_PUBLIC_BASE_URL.length)}`
}

/** srcset for a full-width hero; pair it with sizes like "(min-width: 1240px) 1176px, calc(100vw - 32px)". */
function heroSrcSet(url: string) {
  return `${resizedMediaUrl(url, 'card')} 640w, ${resizedMediaUrl(url, 'phone')} 768w, ${resizedMediaUrl(url, 'hero')} 1280w`
}

/** A 1200x630 JPG crop for link previews; crawlers that don't send WebP in Accept still get a JPG. */
function socialImageUrl(url: string) {
  if (!url.startsWith(`${R2_PUBLIC_BASE_URL}/`) || url.includes('/cdn-cgi/')) return url
  return `${R2_PUBLIC_BASE_URL}/cdn-cgi/image/width=1200,height=630,fit=cover,quality=80,format=jpeg,onerror=redirect${url.slice(R2_PUBLIC_BASE_URL.length)}`
}

export { R2_PUBLIC_BASE_URL, heroSrcSet, resizedMediaUrl, socialImageUrl }
