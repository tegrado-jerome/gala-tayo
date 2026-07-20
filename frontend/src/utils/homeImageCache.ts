import { useEffect } from 'react'

const preloadedUrls = new Set<string>()
const imageLoaders = new Map<string, Promise<void>>()

export function preloadHomeImage(url: string | null | undefined) {
  const normalizedUrl = url?.trim() || ''

  if (!normalizedUrl || normalizedUrl.startsWith('data:') || normalizedUrl.startsWith('blob:')) {
    return Promise.resolve()
  }

  if (preloadedUrls.has(normalizedUrl)) {
    return Promise.resolve()
  }

  const existingLoader = imageLoaders.get(normalizedUrl)
  if (existingLoader) {
    return existingLoader
  }

  const loader = fetch(normalizedUrl, { mode: 'cors', credentials: 'omit' })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load image: ${response.status}`)
      }
      return response.blob()
    })
    .then(() => {
      preloadedUrls.add(normalizedUrl)
    })
    .catch(() => {})
    .finally(() => {
      imageLoaders.delete(normalizedUrl)
    })

  imageLoaders.set(normalizedUrl, loader)
  return loader
}

export function useHomeImageSrc(url: string | null | undefined) {
  const normalizedUrl = url?.trim() || ''

  useEffect(() => {
    if (normalizedUrl && !normalizedUrl.startsWith('data:') && !normalizedUrl.startsWith('blob:')) {
      void preloadHomeImage(normalizedUrl)
    }
  }, [normalizedUrl])

  return normalizedUrl
}
