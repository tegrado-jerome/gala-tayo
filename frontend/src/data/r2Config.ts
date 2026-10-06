const R2_PUBLIC_BASE_URL = 'https://media.galatayo.app'

// No on-the-fly Cloudflare Image Transformations: the free plan allows only 5,000 unique resizes a
// month and every photo version counts again. Place photos are stored pre-sized instead:
// `<name>.webp` is 1600px and `<name>-card.webp` is 800px, so small sizes use the card file.
const SMALL_SIZES = new Set(['thumb', 'card', 'phone'])
type MediaSize = 'thumb' | 'card' | 'phone' | 'hero'

const isPlacePhoto = (url: string) => url.startsWith(`${R2_PUBLIC_BASE_URL}/places/`) && url.endsWith('.webp')

/** The 800px card file for a place photo (unchanged for anything else). */
function cardFile(url: string) {
  return isPlacePhoto(url) && !url.endsWith('-card.webp') ? url.replace(/\.webp$/, '-card.webp') : url
}

/** The 1600px file for a place photo (unchanged for anything else). */
function fullFile(url: string) {
  return isPlacePhoto(url) ? url.replace(/-card\.webp$/, '.webp') : url
}

function resizedMediaUrl<T extends string | null | undefined>(url: T, size: MediaSize): T | string {
  if (!url || !url.startsWith(`${R2_PUBLIC_BASE_URL}/`)) return url
  return SMALL_SIZES.has(size) ? cardFile(url) : fullFile(url)
}

/** srcset for a full-width hero; pair it with sizes like "(min-width: 1240px) 1176px, calc(100vw - 32px)". */
function heroSrcSet(url: string) {
  return `${cardFile(url)} 800w, ${fullFile(url)} 1600w`
}

/** The large photo for link previews (major crawlers read WebP). */
function socialImageUrl(url: string) {
  return url.startsWith(`${R2_PUBLIC_BASE_URL}/`) ? fullFile(url) : url
}

export { R2_PUBLIC_BASE_URL, heroSrcSet, resizedMediaUrl, socialImageUrl }
