// MUBiS ERP — hafif performans olcumu (gelistirme + prod)
// Kullanim:
//   const b = perfBaslat('Login')
//   ...
//   perfBitir('Login', b)
// Konsolda [PERFORMANCE] Login: 420 ms seklinde log basar.
const baslangiclar = new Map()

export function perfBaslat(etiket) {
  const t = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
  baslangiclar.set(etiket, t)
  return t
}

export function perfBitir(etiket, baslangic) {
  const t0 = baslangic ?? baslangiclar.get(etiket)
  if (t0 == null) return
  const t = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
  const ms = Math.round(t - t0)
  // eslint-disable-next-line no-console
  console.info(`[PERFORMANCE] ${etiket}: ${ms} ms`)
  baslangiclar.delete(etiket)
  return ms
}

export function perfOlculu(etiket, fn) {
  const t = perfBaslat(etiket)
  try {
    const r = fn()
    if (r && typeof r.then === 'function') {
      return r.finally(() => perfBitir(etiket, t))
    }
    perfBitir(etiket, t)
    return r
  } catch (e) {
    perfBitir(etiket, t)
    throw e
  }
}
