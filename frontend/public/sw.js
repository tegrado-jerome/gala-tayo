const CACHE_NAME = 'galatayo-media-v1'
const MEDIA_DOMAIN = 'media.galatayo.app'
const IMAGE_EXT = /\.(webp|jpg|jpeg|png|gif|svg|avif)(\?.*)?$/i

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    })
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  const isMediaDomain = url.hostname === MEDIA_DOMAIN
  const isImageRequest = IMAGE_EXT.test(url.pathname)

  if (!isMediaDomain && !isImageRequest) {
    return
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse.ok) {
            cache.put(event.request, networkResponse.clone())
          }
          return networkResponse
        }).catch(() => cachedResponse)
        return cachedResponse || fetchPromise
      })
    })
  )
})
