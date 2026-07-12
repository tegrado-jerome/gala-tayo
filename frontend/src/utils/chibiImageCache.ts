const chibiImageCache = new Set<string>()
const chibiImageLoaders = new Map<string, Promise<void>>()

function isCacheableChibiUrl(url: string) {
  return Boolean(url.trim()) && !url.startsWith('data:') && !url.startsWith('blob:')
}

function loadChibiImage(url: string) {
  if (typeof Image === 'undefined') {
    return Promise.resolve()
  }

  return new Promise<void>((resolve, reject) => {
    const image = new Image()

    image.decoding = 'async'
    image.onload = () => {
      chibiImageCache.add(url)
      resolve()
    }
    image.onerror = () => {
      reject(new Error(`Failed to load chibi image: ${url}`))
    }
    image.src = url
  })
}

export function preloadChibiImage(url: string | null | undefined) {
  const normalizedUrl = url?.trim() || ''

  if (!isCacheableChibiUrl(normalizedUrl)) {
    return Promise.resolve(normalizedUrl)
  }

  if (chibiImageCache.has(normalizedUrl)) {
    return Promise.resolve(normalizedUrl)
  }

  const existingLoader = chibiImageLoaders.get(normalizedUrl)
  if (existingLoader) {
    return existingLoader.then(() => normalizedUrl)
  }

  const loader = loadChibiImage(normalizedUrl)
    .catch(() => {})
    .finally(() => {
      chibiImageLoaders.delete(normalizedUrl)
    })

  chibiImageLoaders.set(normalizedUrl, loader)
  return loader.then(() => normalizedUrl)
}

export function preloadChibiImages(urls: Array<string | null | undefined>) {
  return Promise.all(urls.map((url) => preloadChibiImage(url)))
}

export function useChibiImageSrc(url: string | null | undefined) {
  return url?.trim() || ''
}
