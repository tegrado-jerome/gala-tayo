// vite.config.ts stamps the build id into dist/sw.js, so every deploy ships a new worker. It takes over
// at once (skipWaiting), drops the previous build's caches, and tells open tabs (main.tsx) to reload.
const BUILD_ID = '__BUILD_ID__'
const APP_CACHE = `galatayo-app-${BUILD_ID}`
const PAGE_CACHE = `galatayo-pages-${BUILD_ID}`
const MEDIA_CACHE = 'galatayo-media-v3'
const MEDIA_DOMAIN = 'media.galatayo.app'
const IMAGE_EXT = /\.(webp|jpg|jpeg|png|gif|svg|avif)(\?.*)?$/i
const MAX_MEDIA_CACHE_ENTRIES = 50
const MAX_PAGE_CACHE_ENTRIES = 30
// The host serves public/offline.html at /offline (and 301s the .html path), so cache the final URL: a
// redirected response can't answer a navigation.
const OFFLINE_URL = '/offline'

const PRECACHE_ASSETS = [
  OFFLINE_URL,
  '/fonts/dm-sans-latin.woff2',
  '/fonts/fraunces-latin.woff2',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((cache) => cache.addAll(PRECACHE_ASSETS.map((asset) => new Request(asset, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [APP_CACHE, PAGE_CACHE, MEDIA_CACHE]
    const names = await caches.keys()
    await Promise.all(names.filter((name) => !keep.includes(name)).map((name) => caches.delete(name)))
    await self.registration.navigationPreload?.enable()
    await self.clients.claim()
    const windows = await self.clients.matchAll({ type: 'window' })
    windows.forEach((client) => client.postMessage({ type: 'sw-activated', build: BUILD_ID }))
  })())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  // API calls go to another origin and carry the user's token: never answer them from a cache.
  if (request.method !== 'GET' || request.headers.has('Authorization')) return

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event))
    return
  }

  const url = new URL(request.url)

  // Hashed build files never change under the same name, so the cached copy is always right.
  if (url.origin === self.location.origin && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fonts/'))) {
    event.respondWith(cacheFirst(APP_CACHE, request))
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
            await trimCache(cache, MAX_MEDIA_CACHE_ENTRIES)
          }
          return networkResponse
        }).catch(() => cachedResponse)
        return cachedResponse || fetchPromise
      })
    )
  )
})

async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

const isHtml = (response) => response.ok && response.headers.get('Content-Type')?.includes('text/html')

// Network first, so a deploy is live on the next visit; the copy saved here is only for when offline.
async function handleNavigation(event) {
  const url = new URL(event.request.url)
  const pageKey = `${url.origin}${url.pathname}`

  try {
    const response = (await event.preloadResponse?.catch(() => null)) || (await fetch(event.request))
    if (isHtml(response)) {
      const cache = await caches.open(PAGE_CACHE)
      await cache.put(pageKey, response.clone())
      await trimCache(cache, MAX_PAGE_CACHE_ENTRIES)
    }
    return response
  } catch {
    const saved = await caches.match(pageKey, { cacheName: PAGE_CACHE })
    return saved || (await caches.match(OFFLINE_URL, { cacheName: APP_CACHE })) || new Response('Offline', { status: 503 })
  }
}

async function trimCache(cache, maxEntries) {
  const requests = await cache.keys()
  if (requests.length <= maxEntries) return
  const toDelete = requests.slice(0, requests.length - maxEntries)
  await Promise.all(toDelete.map((req) => cache.delete(req)))
}
