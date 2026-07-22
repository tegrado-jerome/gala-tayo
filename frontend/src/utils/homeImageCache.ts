const preloadedUrls = new Set<string>()

export function preloadHomeImage(url: string | null | undefined) {
  const normalizedUrl = url?.trim() || ''

  if (!normalizedUrl || normalizedUrl.startsWith('data:') || normalizedUrl.startsWith('blob:')) {
    return
  }

  if (preloadedUrls.has(normalizedUrl)) {
    return
  }

  preloadedUrls.add(normalizedUrl)

  const link = document.createElement('link')
  link.rel = 'preload'
  link.as = 'image'
  link.href = normalizedUrl
  document.head.appendChild(link)

  const img = new Image()
  img.decoding = 'async'
  img.fetchPriority = 'high'
  img.src = normalizedUrl
}

export function useHomeImageSrc(url: string | null | undefined) {
  return url?.trim() || ''
}
