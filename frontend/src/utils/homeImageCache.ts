import { useEffect, useState } from 'react'

const imageCache = new Map<string, string>()
const imageLoaders = new Map<string, Promise<string>>()

function isCacheableUrl(url: string) {
  return Boolean(url.trim()) && !url.startsWith('data:') && !url.startsWith('blob:')
}

async function loadImage(url: string) {
  const response = await fetch(url, { mode: 'cors', credentials: 'omit' })

  if (!response.ok) {
    throw new Error(`Failed to load image: ${response.status}`)
  }

  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  imageCache.set(url, objectUrl)
  return objectUrl
}

export function preloadHomeImage(url: string | null | undefined) {
  const normalizedUrl = url?.trim() || ''

  if (!normalizedUrl || !isCacheableUrl(normalizedUrl)) {
    return Promise.resolve(normalizedUrl)
  }

  const cachedUrl = imageCache.get(normalizedUrl)
  if (cachedUrl) {
    return Promise.resolve(cachedUrl)
  }

  const existingLoader = imageLoaders.get(normalizedUrl)
  if (existingLoader) {
    return existingLoader
  }

  const loader = loadImage(normalizedUrl)
    .catch(() => normalizedUrl)
    .finally(() => {
      imageLoaders.delete(normalizedUrl)
    })

  imageLoaders.set(normalizedUrl, loader)
  return loader
}

export function useHomeImageSrc(url: string | null | undefined) {
  const normalizedUrl = url?.trim() || ''
  const [resolvedSrc, setResolvedSrc] = useState(() => {
    if (!normalizedUrl) return ''
    const cached = imageCache.get(normalizedUrl)
    return cached ?? normalizedUrl
  })

  useEffect(() => {
    if (!normalizedUrl) {
      setResolvedSrc('')
      return
    }

    const cached = imageCache.get(normalizedUrl)
    if (cached) {
      setResolvedSrc(cached)
      return
    }

    setResolvedSrc(normalizedUrl)

    let isMounted = true
    void preloadHomeImage(normalizedUrl).then((nextSrc) => {
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
