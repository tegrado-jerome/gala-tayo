const APP_CACHE = 'galatayo-app-v5'
const MEDIA_CACHE = 'galatayo-media-v3'
const MEDIA_DOMAIN = 'media.galatayo.app'
const IMAGE_EXT = /\.(webp|jpg|jpeg|png|gif|svg|avif)(\?.*)?$/i
const MAX_MEDIA_CACHE_ENTRIES = 50

const PRECACHE_ASSETS = [
  '/',
  '/images/brand/galatayo-logo-loader.webp',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => {
      return Promise.allSettled(
        PRECACHE_ASSETS.map((asset) =>
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
    }).then(() => self.clients.claim())
  )
  event.waitUntil(
    self.registration.navigationPreload?.enable()
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event))
    return
  }

  if (url.origin === self.location.origin && PRECACHE_ASSETS.includes(url.pathname)) {
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

  // CORS fetches (photos drawn onto the recap story canvas) go straight to the network, so a cached
  // copy can never stand in for a response that needs CORS headers.
  if ((!isMediaDomain && !isImageRequest) || request.mode === 'cors') {
    return
  }

  event.respondWith(
    caches.open(MEDIA_CACHE).then((cache) =>
      cache.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request).then(async (networkResponse) => {
          if (networkResponse.ok) {
            await cache.put(request, networkResponse.clone())
            await trimMediaCache(cache)
          }
          return networkResponse
        }).catch(() => cachedResponse)
        return cachedResponse || fetchPromise
      })
    )
  )
})

async function handleNavigation(event) {
  const cache = await caches.open(APP_CACHE)
  const cachedResponse = await cache.match('/')

  if (event.preloadResponse) {
    const preloadResponse = await event.preloadResponse.catch(() => null)
    if (preloadResponse && preloadResponse.status === 200 && preloadResponse.headers.get('Content-Type')?.includes('text/html')) {
      cache.put('/', preloadResponse.clone())
      return preloadResponse
    }
  }

  try {
    const networkResponse = await fetch(event.request)
    if (networkResponse.ok && networkResponse.headers.get('Content-Type')?.includes('text/html')) {
      cache.put('/', networkResponse.clone())
    }
    return networkResponse
  } catch {
    return cachedResponse || new Response('Offline', { status: 503 })
  }
}

async function trimMediaCache(cache) {
  const requests = await cache.keys()
  if (requests.length <= MAX_MEDIA_CACHE_ENTRIES) return
  const toDelete = requests.slice(0, requests.length - MAX_MEDIA_CACHE_ENTRIES)
  await Promise.all(toDelete.map((req) => cache.delete(req)))
}
