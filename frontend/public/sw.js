const CHIBI_CACHE_PREFIX = 'gala-chibi-assets-'
const CHIBI_CACHE_VERSION = 'v1'
const CHIBI_CACHE = `${CHIBI_CACHE_PREFIX}${CHIBI_CACHE_VERSION}`

function normalizeUrl(url) {
  return new URL(url, self.location.origin).href
}

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys()
      await Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith(CHIBI_CACHE_PREFIX) && cacheName !== CHIBI_CACHE)
          .map((cacheName) => caches.delete(cacheName)),
      )

      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  const message = event.data

  if (!message || message.type !== 'CACHE_CHIBI_ASSETS' || !Array.isArray(message.urls)) {
    return
  }

  const urls = message.urls
    .filter((url) => typeof url === 'string' && url.trim())
    .map((url) => normalizeUrl(url))

  event.waitUntil(
    (async () => {
      const cache = await caches.open(CHIBI_CACHE)
      const currentKeys = new Set(urls)

      await Promise.all(
        urls.map(async (url) => {
          try {
            await cache.add(new Request(url))
          } catch {
            // Ignore individual image failures so one bad asset does not block the rest.
          }
        }),
      )

      const existingRequests = await cache.keys()
      await Promise.all(
        existingRequests
          .filter((request) => !currentKeys.has(request.url))
          .map((request) => cache.delete(request)),
      )
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return
  }

  const requestUrl = new URL(event.request.url)

  if (requestUrl.origin !== self.location.origin) {
    return
  }

  if (event.request.destination !== 'image') {
    return
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse
      }

      return fetch(event.request)
    }),
  )
})
