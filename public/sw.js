// MUBiS ERP — PWA Service Worker
const CACHE_NAME = 'mubis-erp-v1'
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/logo-icon.png'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE).catch(() => {}))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // API / functions: her zaman network (cache'leme)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/functions/')) return
  // Navigasyon: network-first, offline'da cache
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone()
        caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {})
        return res
      }).catch(() => caches.match(req).then((r) => r || caches.match('/')))
    )
    return
  }
  // Statik varliklar: cache-first, yoksa network
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone()
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {})
        }
        return res
      }).catch(() => cached)
    })
  )
})
