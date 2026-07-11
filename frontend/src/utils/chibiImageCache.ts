import { useEffect, useState } from 'react'

const chibiImageCache = new Map<string, string>()
const chibiImageLoaders = new Map<string, Promise<string>>()

function isCacheableChibiUrl(url: string) {
  return Boolean(url.trim()) && !url.startsWith('data:') && !url.startsWith('blob:')
}

async function loadChibiImage(url: string) {
  const response = await fetch(url, { mode: 'cors', credentials: 'omit' })

  if (!response.ok) {
    throw new Error(`Failed to load chibi image: ${response.status}`)
  }

  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  chibiImageCache.set(url, objectUrl)
  return objectUrl
}

export function preloadChibiImage(url: string | null | undefined) {
  const normalizedUrl = url?.trim() || ''

  if (!isCacheableChibiUrl(normalizedUrl)) {
    return Promise.resolve(normalizedUrl)
  }

  if (chibiImageCache.has(normalizedUrl)) {
    return Promise.resolve(chibiImageCache.get(normalizedUrl) ?? normalizedUrl)
  }

  const existingLoader = chibiImageLoaders.get(normalizedUrl)
  if (existingLoader) {
    return existingLoader
  }

  const loader = loadChibiImage(normalizedUrl)
    .catch(() => normalizedUrl)
    .finally(() => {
      chibiImageLoaders.delete(normalizedUrl)
    })

  chibiImageLoaders.set(normalizedUrl, loader)
  return loader
}

export function preloadChibiImages(urls: Array<string | null | undefined>) {
  return Promise.all(urls.map((url) => preloadChibiImage(url)))
}

export function useChibiImageSrc(url: string | null | undefined) {
  const normalizedUrl = url?.trim() || ''
  const [resolvedSrc, setResolvedSrc] = useState(normalizedUrl)

  useEffect(() => {
    let isMounted = true

    if (!normalizedUrl) {
      setResolvedSrc('')
      return undefined
    }

    const cachedUrl = chibiImageCache.get(normalizedUrl)

    if (cachedUrl) {
      setResolvedSrc(cachedUrl)
      return undefined
    }

    setResolvedSrc(normalizedUrl)

    void preloadChibiImage(normalizedUrl).then((nextSrc) => {
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
