// MUBiS - Yonetici paneli Analytics altyapisi
//
// GA4 verileri istemciden okunamaz; Google Analytics Data API (GA4) cagrisi
// SUNUCU tarafinda yapilir. Bu servis, /api/analytics ucuna istek atar.
// Uc nokta yapilandirilmamissa (GA4_PROPERTY_ID / servis hesabi yoksa)
// "yapilandirilmadi" doner ve panel bunu bilgilendirme olarak gosterir.
//
// Gerekli Cloudflare ortam degiskenleri (ileride):
//   GA4_PROPERTY_ID              -> 123456789
//   GA4_SERVICE_ACCOUNT_JSON     -> servis hesabi JSON (tek satir)
import { GA_OLCUM_KIMLIGI } from '../utils/analytics'

export const ANALYTICS_HAZIR = !!GA_OLCUM_KIMLIGI

export const ANALYTICS_METRIKLERI = [
  { kod: 'activeUsers', ad: 'Aktif kullanıcı' },
  { kod: 'sessions', ad: 'Oturum' },
  { kod: 'screenPageViews', ad: 'Sayfa görüntüleme' },
  { kod: 'averageSessionDuration', ad: 'Ort. oturum süresi' },
  { kod: 'bounceRate', ad: 'Hemen çıkma oranı' }
]

export const ANALYTICS_BOYUTLARI = [
  { kod: 'date', ad: 'Tarih' },
  { kod: 'pagePath', ad: 'Sayfa' },
  { kod: 'deviceCategory', ad: 'Cihaz' },
  { kod: 'sessionDefaultChannelGroup', ad: 'Kanal' },
  { kod: 'country', ad: 'Ülke' }
]

/**
 * GA4 raporu ister.
 * @param {{baslangic:string, bitis:string, metrikler?:string[], boyutlar?:string[], limit?:number}} istek
 * @returns {Promise<{ok:boolean, satirlar?:any[], toplamlar?:any, reason?:string, error?:string}>}
 */
export async function analyticsRaporu(istek = {}) {
  const govde = {
    baslangic: istek.baslangic,
    bitis: istek.bitis,
    metrikler: (istek.metrikler?.length ? istek.metrikler : ['activeUsers', 'sessions', 'screenPageViews']),
    boyutlar: (istek.boyutlar?.length ? istek.boyutlar : ['date']),
    limit: Math.min(Math.max(Number(istek.limit) || 100, 1), 1000)
  }
  try {
    const yanit = await fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(govde)
    })
    const veri = await yanit.json().catch(() => ({}))
    if (!yanit.ok || !veri?.ok) {
      return { ok: false, reason: veri?.reason || 'sunucu-hatasi', error: veri?.error || `HTTP ${yanit.status}` }
    }
    return veri
  } catch (e) {
    return { ok: false, reason: 'ag-hatasi', error: e?.message || String(e) }
  }
}
