// Luca'dan Firma Getir — Musavir Paketi musteri listesini yerel yardimci
// program uzerinden okur (luca-firmalar-getir isi). Lisansli otomasyon akisi
// gibi detayli okuma: musteri listesi tablosu, GIB/SGK kimlik tablolari, her
// firmanin Müşteri/Adres/İletişim sayfalari ve defter turu.
// onIlerleme verilirse sorgu surerken /luca-getir-durum yoklanir ve
// { asama, mevcut, toplam, yuzde, firma } dondurulur.
import { gibYardimciIs } from '../utils/gibOdemeHelper'
import { getSettings } from './settingsService'

const YARDIMCI_URL = 'http://127.0.0.1:8765'

export async function lucaFirmalariGetir(onIlerleme) {
  const s = await getSettings()
  const isParam = {
    lucaMember: s.luca_member || '',
    lucaUsername: s.luca_username || '',
    lucaPassword: s.luca_password || '',
    yil: String(new Date().getFullYear())
  }
  // Uzun suren /is cagrisi ile paralel olarak 1,5 sn'de bir ilerleme yoklanir
  const yoklama = onIlerleme ? setInterval(async () => {
    try {
      const r = await fetch(`${YARDIMCI_URL}/luca-getir-durum`, { signal: AbortSignal.timeout(2500) })
      const j = await r.json()
      if (j && j.asama && j.asama !== 'bos') onIlerleme(j)
    } catch { /* yoksay — yardimci meşgul olabilir */ }
  }, 1500) : null
  try {
    const res = await gibYardimciIs('luca-firmalar-getir', isParam, 25 * 60 * 1000)
    if (!res.ok) return res
    return { ok: true, firmalar: res.firmalar || [], toplam: res.toplam || 0, kimlikli: res.kimlikli || 0, detayli: !!res.detayli, detayliAdet: res.detayliAdet || 0, durduruldu: !!res.durduruldu, durdurulan: res.durdurulan || 0 }
  } finally {
    if (yoklama) clearInterval(yoklama)
  }
}
