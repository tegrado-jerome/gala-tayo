import { useEffect } from 'react'
import { apiFetchUrl } from './apiClient'

const preloadedUrls = new Set<string>()
const imageLoaders = new Map<string, Promise<void>>()

export function preloadAvatarImage(url: string | null | undefined) {
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

  const loader = apiFetchUrl(normalizedUrl, { mode: 'cors', credentials: 'omit' })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load avatar image: ${response.status}`)
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

export function useAvatarImageSrc(url: string | null | undefined) {
  const normalizedUrl = url?.trim() || ''

  useEffect(() => {
    if (normalizedUrl && !normalizedUrl.startsWith('data:') && !normalizedUrl.startsWith('blob:')) {
      void preloadAvatarImage(normalizedUrl)
    }
  }, [normalizedUrl])

  return normalizedUrl
}
