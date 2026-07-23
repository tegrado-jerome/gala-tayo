const preloadedListingImageUrls = new Set<string>()

function normalizeImageUrl(imageUrl: string | null | undefined) {
  if (typeof imageUrl !== 'string') {
    return null
  }

  const trimmed = imageUrl.trim()
  return trimmed ? trimmed : null
}

export function preloadListingImageUrls(imageUrls: Array<string | null | undefined>) {
  if (typeof document === 'undefined') {
    return
  }

  for (const imageUrl of imageUrls) {
    const normalizedUrl = normalizeImageUrl(imageUrl)

    if (!normalizedUrl || preloadedListingImageUrls.has(normalizedUrl)) {
      continue
    }

    preloadedListingImageUrls.add(normalizedUrl)

    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'image'
    link.href = normalizedUrl
    link.fetchPriority = 'high'
    document.head.appendChild(link)

    const img = new Image()
    img.decoding = 'async'
    img.fetchPriority = 'high'
    img.src = normalizedUrl
  }
}
