import { useEffect, useState } from 'react'
import { apiFetchUrl } from './apiClient'

const avatarImageCache = new Map<string, string>()
const avatarImageLoaders = new Map<string, Promise<string>>()

function isCacheableAvatarUrl(url: string) {
  return Boolean(url.trim()) && !url.startsWith('data:') && !url.startsWith('blob:')
}

async function loadAvatarImage(url: string) {
  const response = await apiFetchUrl(url, { mode: 'cors', credentials: 'omit' })

  if (!response.ok) {
    throw new Error(`Failed to load avatar image: ${response.status}`)
  }

  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  avatarImageCache.set(url, objectUrl)
  return objectUrl
}

export function preloadAvatarImage(url: string | null | undefined) {
  const normalizedUrl = url?.trim() || ''

  if (!isCacheableAvatarUrl(normalizedUrl)) {
    return Promise.resolve(normalizedUrl)
  }

  const cachedUrl = avatarImageCache.get(normalizedUrl)
  if (cachedUrl) {
    return Promise.resolve(cachedUrl)
  }

  const existingLoader = avatarImageLoaders.get(normalizedUrl)
  if (existingLoader) {
    return existingLoader
  }

  const loader = loadAvatarImage(normalizedUrl)
    .catch(() => normalizedUrl)
    .finally(() => {
      avatarImageLoaders.delete(normalizedUrl)
    })

  avatarImageLoaders.set(normalizedUrl, loader)
  return loader
}

export function useAvatarImageSrc(url: string | null | undefined) {
  const normalizedUrl = url?.trim() || ''
  const [resolvedSrc, setResolvedSrc] = useState(normalizedUrl)

  useEffect(() => {
    let isMounted = true

    if (!normalizedUrl) {
      setResolvedSrc('')
      return undefined
    }

    const cachedUrl = avatarImageCache.get(normalizedUrl)

    if (cachedUrl) {
      setResolvedSrc(cachedUrl)
      return undefined
    }

    setResolvedSrc(normalizedUrl)

    void preloadAvatarImage(normalizedUrl).then((nextSrc) => {
      if (isMounted && nextSrc) {
        setResolvedSrc(nextSrc)
      }
    })

    return () => {
      isMounted = false
    }
  }, [normalizedUrl])

  return resolvedSrc
}
