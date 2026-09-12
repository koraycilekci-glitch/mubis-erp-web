// Guncel yasal parametreleri (kidem tavani, asgari ucret) web servisinden alir.
// 24 saatlik istemci onbellegi kullanir; servis ulasilamazsa sessizce null doner
// ve cagiran taraf defaults.js icindeki tablolara duser.
import * as D from '../data/defaults'

const CACHE_KEY = 'mubis_guncel_parametreler'
const CACHE_TTL = 24 * 60 * 60 * 1000

export async function getGuncelParametreler({ force = false } = {}) {
  if (!force) {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
      if (cached && cached.fetchedAt && Date.now() - cached.fetchedAt < CACHE_TTL) {
        return cached
      }
    } catch { /* onbellek okunamadi */ }
  }
  try {
    const res = await fetch('/api/guncel-parametreler')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const payload = { ...data, fetchedAt: Date.now() }
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(payload)) } catch { /* kota dolu olabilir */ }
    return payload
  } catch {
    return null
  }
}

// Web parametreleri varsa onlardan, yoksa yerel tablodan kidem tavanini cozer.
export function kidemTavaniGuncel(webParams, tarih) {
  const d = new Date(tarih)
  if (!Number.isNaN(d.getTime()) && webParams?.kidemTavani) {
    const yil = d.getFullYear()
    const donem = d.getMonth() < 6 ? 1 : 2
    const map = webParams.kidemTavani
    const val = map[`${yil}-${donem}`] ?? map[`${yil}-1`]
    if (val) return Number(val)
  }
  return D.getKidemTavani(tarih)
}

// Web parametreleri varsa onlardan, yoksa yerel tablodan yillik brut asgari ucreti cozer.
export function asgariUcretBrutGuncel(webParams, yil) {
  const map = webParams?.asgariUcret && Object.keys(webParams.asgariUcret).length
    ? webParams.asgariUcret
    : D.ASGARI_UCRET
  const y = map[yil] ? yil : Math.max(...Object.keys(map).map(Number))
  return map[y]?.brut || D.ASGARI_UCRET[2026].brut
}
