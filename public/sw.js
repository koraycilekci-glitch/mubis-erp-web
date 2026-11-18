// MUBiS ERP — PWA Service Worker
// v3: respondWith her zaman geçerli bir Response döndürmeli. Aksi halde
// tarayıcı "Failed to convert value to 'Response'" hatası verir ve sayfa
// (özellikle /admin/ayarlar gibi derin bağlantılar) açılmaz.
const CACHE_NAME = 'mubis-erp-v6'
const PRECACHE = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/logo-icon.png'
]

// Çevrimdışı yanıtı — her zaman geçerli bir Response.
const cevrimdisi = (mesaj = 'Cevrimdisisiniz. Internet baglantisini kontrol edin.') =>
  new Response(
    `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>MUBiS ERP — Cevrimdisi</title>` +
      `<meta name="viewport" content="width=device-width,initial-scale=1"></head>` +
      `<body style="font-family:system-ui,sans-serif;background:#0b2a4a;color:#fff;display:flex;` +
      `align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">` +
      `<div><h1 style="font-size:20px;margin:0 0 8px">MUBiS ERP</h1>` +
      `<p style="opacity:.75;font-size:14px;margin:0">${mesaj}</p></div></body></html>`,
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )

self.addEventListener('install', (event) => {
  // Eski SW'lerin cache'ledigi bayat dosyalari temizle ve kendini kaldir.
  // Yeni surum yuklendiginde eski cache'ler silinir, SW kendini unregister eder.
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Tum cache'leri temizle
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
      // Kendini unregister et — artik SW kullanilmiyor
      await self.registration.unregister()
      // Tum client'lari yeniden yukle
      const clients = await self.clients.matchAll({ type: 'window' })
      for (const client of clients) {
        try { client.navigate(client.url) } catch { /* yoksay */ }
      }
    })()
  )
})

// Eski activate listener kaldirildi — yukaridaki self-unregister mekanizmasi
// tum cache'leri temizler ve SW'yi kaldirir.

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Sadece kendi origin'imizle ilgileniyoruz.
  if (url.origin !== self.location.origin) return

  // API / functions: service worker'a hiç karışma — her zaman network.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/functions/')) return

  // Navigasyon: network-first. Başarısızsa önbellekteki kabuk, o da yoksa 503.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => res)
        .catch(async () => {
          const onbellek = await caches.match('/')
          return onbellek || cevrimdisi()
        })
    )
    return
  }

  // Statik varlıklar: cache-first, yoksa network. Her iki durumda da
  // mutlaka bir Response dönmeli.
  event.respondWith(
    (async () => {
      const onbellek = await caches.match(req)
      if (onbellek) return onbellek
      try {
        const res = await fetch(req)
        if (res && res.status === 200 && res.type === 'basic') {
          const kopya = res.clone()
          caches.open(CACHE_NAME).then((c) => c.put(req, kopya)).catch(() => {})
        }
        return res
      } catch {
        // Ağ hatası ve önbellekte yok: 503 döndür (undefined DÖNME).
        return new Response('', { status: 503, statusText: 'Offline' })
      }
    })()
  )
})
