const APP_CACHE = 'galatayo-app-v1'
const MEDIA_CACHE = 'galatayo-media-v1'
const MEDIA_DOMAIN = 'media.galatayo.app'
const IMAGE_EXT = /\.(webp|jpg|jpeg|png|gif|svg|avif)(\?.*)?$/i
const WELCOME_ASSETS = [
  '/',
  '/images/brand/galatayo-logo-loader.webp',
  '/images/brand/galatayo-logo-loader.png',
  '/images/welcome/mobile.webp',
  '/images/welcome/mobile.png',
  '/images/welcome/tablet.webp',
  '/images/welcome/tablet.png',
  '/images/welcome/laptop-desktop.webp',
  '/images/welcome/laptop-desktop.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => {
      return Promise.allSettled(
        WELCOME_ASSETS.map((asset) =>
          fetch(asset, { cache: 'reload' }).then((res) => {
            if (res.ok) cache.put(asset, res)
          }).catch(() => {})
        )
      )
    }).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names
          .filter((n) => n !== APP_CACHE && n !== MEDIA_CACHE)
          .map((n) => caches.delete(n))
      )
    })
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(APP_CACHE).then((cache) =>
        cache.match('/').then((cached) => {
          const fetchPromise = fetch(request).then((res) => {
            if (res.ok) cache.put('/', res.clone())
            return res
          }).catch(() => cached)
          return cached || fetchPromise
        })
      )
    )
    return
  }

  if (url.origin === self.location.origin && WELCOME_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.open(APP_CACHE).then((cache) =>
        cache.match(request).then((cached) =>
          cached || fetch(request).then((res) => {
            if (res.ok) cache.put(request, res.clone())
            return res
          })
        )
      )
    )
    return
  }

  const isMediaDomain = url.hostname === MEDIA_DOMAIN
  const isImageRequest = IMAGE_EXT.test(url.pathname)

  if (!isMediaDomain && !isImageRequest) {
    return
  }

  event.respondWith(
    caches.open(MEDIA_CACHE).then((cache) =>
      cache.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse.ok) {
            cache.put(request, networkResponse.clone())
          }
          return networkResponse
        }).catch(() => cachedResponse)
        return cachedResponse || fetchPromise
      })
    )
  )
})
