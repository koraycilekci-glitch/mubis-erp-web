// MUBiS ERP — ortak veri deposu (paylasilan onbellek)
// --------------------------------------------------------------
// Ayni veriyi onlarca bilesen ayni anda istiyor (ornegin clients tablosu:
// tek bir /admin acilisinda 3-4 kez, 51 sayfada ayri ayri). Her istek yeni bir
// Supabase baglantisi actigi icin baglanti havuzu tukeniyor (PGRST003
// "Timed out acquiring connection from connection pool") ve tum sorgular
// 60 sn sonra dusuyor; bu da giris gecikmesi, bos musteri listesi ve eksik
// menu olarak gorunuyor.
//
// Burada:
//   * ayni anahtar icin es zamanli istekler TEK fetch'e indirilir (dedupe),
//   * sonuc TTL boyunca onbellekte tutulur (sayfa gecisleri aninda acilir),
//   * yazma islemlerinden sonra ilgili anahtar gecersiz kilinir.
// Cozulen deger her zaman ayni sekilde dondurulur; cagiran taraf degismez.

const varsayilanTTL = 60 * 1000

const kayit = new Map() // anahtar -> { veri, ts, promise, hataTs }

/** Onbellekteki taze veriyi dondurur (yoksa undefined) */
export function onbellekOku(anahtar) {
  const k = kayit.get(anahtar)
  if (!k || k.veri === undefined) return undefined
  return k.veri
}

/** Onbellek taze mi? */
export function onbellekTaze(anahtar, ttl = varsayilanTTL) {
  const k = kayit.get(anahtar)
  return !!(k && k.veri !== undefined && Date.now() - k.ts < ttl)
}

/**
 * Veriyi onbellekten okur; yoksa/bayat ise tek bir fetch calistirir.
 * Es zamanli cagrilar ayni promise'i paylasir.
 */
export function onbellekliGetir(anahtar, getirici, { ttl = varsayilanTTL, zorla = false } = {}) {
  const k = kayit.get(anahtar) || {}

  if (!zorla && k.veri !== undefined && Date.now() - k.ts < ttl) {
    return Promise.resolve(k.veri)
  }
  // Ucus halinde istek varsa onu paylas
  if (k.promise) return k.promise

  const promise = (async () => {
    try {
      const veri = await getirici()
      kayit.set(anahtar, { veri, ts: Date.now(), promise: null })
      return veri
    } catch (e) {
      const eski = kayit.get(anahtar)?.veri
      kayit.set(anahtar, { veri: eski, ts: eski === undefined ? 0 : Date.now() - ttl, promise: null, hata: e })
      throw e
    }
  })()

  kayit.set(anahtar, { ...k, promise })
  return promise
}

/** Tek anahtar gecersiz kil */
export function onbellekSil(anahtar) {
  kayit.delete(anahtar)
}

/** Tum onbellegi temizle (cikis / ofis degisikligi) */
export function onbellekHepsiSil() {
  kayit.clear()
}
