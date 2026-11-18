import { onbellekliGetir, onbellekSil, onbellekOku } from '../lib/veriOrtak.js'

const TTL = 60 * 1000
const dinleyiciler = new Map()
const anahtarIcin = (kapsam) => `clients:liste:${kapsam}`

export function musteriListesineAboneOl(kapsam, fn) {
  const aboneler = dinleyiciler.get(kapsam) || new Set()
  aboneler.add(fn)
  dinleyiciler.set(kapsam, aboneler)
  return () => {
    aboneler.delete(fn)
    if (!aboneler.size) dinleyiciler.delete(kapsam)
  }
}

function yayinla(kapsam, veri) {
  for (const fn of dinleyiciler.get(kapsam) || []) {
    try { fn(veri) } catch { /* abone hatasi digerlerini etkilemesin */ }
  }
}

export function musteriListesiOnbellek(kapsam) {
  return kapsam ? onbellekOku(anahtarIcin(kapsam)) : undefined
}

export async function musteriListesiGetir(getirici, { kapsam, zorla = false } = {}) {
  if (!kapsam) return []
  const anahtar = anahtarIcin(kapsam)
  try {
    const veri = await onbellekliGetir(anahtar, getirici, { ttl: TTL, zorla })
    const liste = Array.isArray(veri) ? veri : []
    yayinla(kapsam, liste)
    return liste
  } catch (error) {
    const eski = onbellekOku(anahtar)
    if (Array.isArray(eski)) yayinla(kapsam, eski)
    throw error
  }
}

export function musteriListesiGecersizKil(kapsam, veri) {
  if (!kapsam) return
  onbellekSil(anahtarIcin(kapsam))
  if (veri) yayinla(kapsam, veri)
}

export function musteriListesiSifirla(kapsam) {
  if (!kapsam) return
  onbellekSil(anahtarIcin(kapsam))
  yayinla(kapsam, [])
}
