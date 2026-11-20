// MUBiS - Merkezi Google Analytics 4 istemcisi
//
// Tasarim kararlari:
//  - GA yalnizca KULLANICI ONAYINDAN sonra yuklenir (KVKK / cerez politikasi).
//    Cerez banner'i "kabul" dediginde baslatilir; "red" derse hic yuklenmez.
//  - Sayfa goruntulemeleri TEK yerden gonderilir: GA config'inde
//    send_page_view:false verilir, page_view olayini React Router dinleyicisi
//    (Analytics bileseni) gonderir. Boylece cift sayim olmaz.
//  - Kisisel veri (TCKN, VKN, ad, e-posta, telefon, parola...) GOSTERILMEZ:
//    page_location yalnizca origin + pathname (+utm_*) olarak uretilir,
//    ozel olay parametreleri hem anahtar hem deger duzeyinde suzulur.
//  - GTM kullanilmaz. GA4 dogrudan gtag ile yuklenir; ayni sayfada GTM
//    kapsayicisi calistirilmaz (cift olcum riski yok).
//  - Cihaz tipi (mobile / tablet / desktop) her olaya otomatik eklenir.

// 2.8.350: Olcum kimligi ortam degiskeninden okunur (NEXT_PUBLIC_GA_ID veya
// VITE_GA_ID). Ortam degiskeni tanimli degilse (ornegin GitHub uzerinden
// yapilan derlemede) bilinen uretim kimligine dusulur — kimlik zaten
// tarayiciya gonderilen herkese acik bir degerdir.
const VARSAYILAN_OLCUM_KIMLIGI = 'G-JQY5VG50Z0'

const OLCUM_KIMLIGI =
  import.meta.env.VITE_GA_ID ||
  import.meta.env.NEXT_PUBLIC_GA_ID ||
  VARSAYILAN_OLCUM_KIMLIGI

const ONAY_ANAHTARI = 'mubis_cerez_onayi'
const GTM_ANAHTARI = '__mubisGtagYuklendi'
const GTM_SCRIPT_ID = 'mubis-ga4-script'

export const GA_OLCUM_KIMLIGI = String(OLCUM_KIMLIGI || '').trim()

// Kisisel veri tasiyabilecek parametre adlari. Anahtar bu desene uyarsa atilir.
const YASAK_ANAHTAR = /(^|_)(tc|tckn|tcno|kimlik|vkn|vergi|tax|email|eposta|mail|phone|telefon|gsm|ad|soyad|isim|name|unvan|parola|password|token|secret|iban|hesap|adres|address|dogum|birth)(_|$)/i

// Deger duzeyinde: 11 haneli TCKN veya 10 haneli VKN gibi gorunen degerler.
const TCKN_BENZERI = /^\d{11}$/
const VKN_BENZERI = /^\d{10}$/

function degerGuvenliMi(deger) {
  if (deger == null) return false
  if (typeof deger === 'number') return Number.isFinite(deger)
  if (typeof deger === 'boolean') return true
  if (typeof deger !== 'string') return false
  const t = deger.trim()
  if (!t) return false
  if (t.length > 100) return false
  if (TCKN_BENZERI.test(t) || VKN_BENZERI.test(t)) return false
  if (/@/.test(t)) return false // e-posta
  if (/^(?:\+?90)?\s?0?5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}$/.test(t)) return false // GSM
  return true
}

// Olay parametrelerini guvenli hale getirir.
export function parametreleriSuz(params) {
  const out = {}
  if (!params || typeof params !== 'object') return out
  for (const [k, v] of Object.entries(params)) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,39}$/.test(k)) continue
    if (YASAK_ANAHTAR.test(k)) continue
    if (Array.isArray(v)) {
      const dizi = v.map(String).filter((x) => degerGuvenliMi(x)).slice(0, 10)
      if (dizi.length) out[k] = dizi.join(',')
      continue
    }
    if (degerGuvenliMi(v)) out[k] = typeof v === 'string' ? v.trim() : v
  }
  return out
}

export function cihazTipi() {
  try {
    const ua = navigator.userAgent || ''
    const dokunmatik = (navigator.maxTouchPoints || 0) > 1
    if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return 'tablet'
    if (/Android/i.test(ua)) return dokunmatik && !/Mobile/i.test(ua) ? 'tablet' : 'mobile'
    if (/iPhone|iPod|Windows Phone|Mobile/i.test(ua)) return 'mobile'
    const darEkran = typeof window !== 'undefined' && window.innerWidth
      ? window.innerWidth < 768 && dokunmatik
      : false
    return darEkran ? 'mobile' : 'desktop'
  } catch {
    return 'desktop'
  }
}

export function cerezOnayiVarMi() {
  try {
    return localStorage.getItem(ONAY_ANAHTARI) === 'kabul'
  } catch {
    return false
  }
}

function gtagVarMi() {
  return typeof window !== 'undefined' && typeof window.gtag === 'function'
}

// GA4 betigini SAYFA BASINA en fazla bir kez yukler.
function gtagYukle() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  if (!GA_OLCUM_KIMLIGI) return false
  if (window[GTM_ANAHTARI]) return true
  // GTM kapsayicisi varsa dogrudan GA etiketi yuklemeyiz (cift olcum olmasin).
  if (window.dataLayer && Array.isArray(window.dataLayer) && window.google_tag_manager) {
    window[GTM_ANAHTARI] = 'gtm'
    return false
  }
  if (document.getElementById(GTM_SCRIPT_ID)) {
    window[GTM_ANAHTARI] = true
    return true
  }
  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() { window.dataLayer.push(arguments) }
  window.gtag('js', new Date())
  // send_page_view:false -> page_view'i biz gonderiyoruz (cift sayim yok).
  window.gtag('config', GA_OLCUM_KIMLIGI, {
    send_page_view: false,
    anonymize_ip: true,
    cookie_flags: 'SameSite=Lax;Secure',
    transport_type: 'beacon',
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  })
  const s = document.createElement('script')
  s.id = GTM_SCRIPT_ID
  s.async = true
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_OLCUM_KIMLIGI)
  s.onerror = () => { window[GTM_ANAHTARI] = false }
  document.head.appendChild(s)
  window[GTM_ANAHTARI] = true
  return true
}

/**
 * Onay varsa GA4'u baslatir. Idempotent: birden fazla cagri zararsizdir.
 */
export function analitikBaslat() {
  if (!GA_OLCUM_KIMLIGI) return false
  if (!cerezOnayiVarMi()) return false
  return gtagYukle()
}

/** Kullanici onayi kaldirdiysa analitigi durdurur (sonraki olaylar gonderilmez). */
export function analitikDurdur() {
  try { window[GTM_ANAHTARI] = false } catch { /* yoksay */ }
}

function sayfaKonumu(pathname, search) {
  let konum = pathname || '/'
  try {
    const q = new URLSearchParams(search || '')
    const izinli = []
    for (const [k, v] of q.entries()) {
      if (/^utm_/i.test(k) && degerGuvenliMi(v)) izinli.push([k, v])
    }
    if (izinli.length) konum += '?' + new URLSearchParams(izinli).toString()
  } catch { /* yoksay */ }
  return konum
}

/**
 * Sayfa goruntulemesi gonderir. Router her rota degisiminde cagirir.
 */
export function sayfaGoruntule({ pathname, search, title } = {}) {
  if (!analitikBaslat()) return false
  if (!gtagVarMi()) return false
  const konum = sayfaKonumu(pathname, search)
  window.gtag('event', 'page_view', parametreleriSuz({
    page_title: title || document.title,
    page_location: window.location.origin + konum,
    page_path: konum,
    cihaz: cihazTipi()
  }))
  return true
}

/**
 * Ozel olay gonderir. Kisisel veri parametreleri otomatik suzulur.
 */
export function olay(ad, params = {}) {
  if (!ad || !/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(ad)) return false
  if (!analitikBaslat()) return false
  if (!gtagVarMi()) return false
  window.gtag('event', ad, parametreleriSuz({ ...params, cihaz: cihazTipi() }))
  return true
}

/** Onay sonrasi tekrar denemek icin: banner "kabul" dediginde cagrilir. */
export function onayVerildi() {
  const ok = gtagYukle()
  if (ok) {
    try { sayfaGoruntule({ pathname: window.location.pathname, search: window.location.search }) } catch { /* yoksay */ }
  }
  return ok
}
