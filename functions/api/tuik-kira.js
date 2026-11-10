// MUBIS - TUIK kira artis orani (Cloudflare Pages Function)
// GET /api/tuik-kira
import { json, fetchText } from './_lib.js'

const TUIK_KAYNAK_URL = 'https://kira-artis-orani.hesaplama.net/'

const TUIK_AYLAR = {
  'ocak': 1, 'subat': 2, 'mart': 3, 'nisan': 4, 'mayis': 5, 'haziran': 6,
  'temmuz': 7, 'agustos': 8, 'eylul': 9, 'ekim': 10, 'kasim': 11, 'aralik': 12
}

function tuikNormalizeTr(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .trim()
}

function tuikParseRate(s) {
  const m = String(s).replace('%', '').trim().match(/(\d{1,3})[.,](\d{1,2})/)
  if (!m) return null
  return Number(`${m[1]}.${m[2]}`)
}

export async function onRequestGet() {
  try {
    const html = await fetchText(TUIK_KAYNAK_URL, 8000)

    const cells = [...html.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map(m => m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim())

    const oranlar = {}
    for (let i = 0; i < cells.length - 1; i++) {
      const dateMatch = tuikNormalizeTr(cells[i]).match(/^(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)\s+(\d{4})$/)
      if (!dateMatch) continue
      const oran = tuikParseRate(cells[i + 1])
      if (oran == null || oran <= 0 || oran > 200) continue
      const yil = Number(dateMatch[2])
      const ay = TUIK_AYLAR[dateMatch[1]]
      const key = `${yil}-${String(ay).padStart(2, '0')}`
      if (!oranlar[key]) oranlar[key] = oran
    }

    const keys = Object.keys(oranlar).sort()
    if (keys.length === 0) throw new Error('Kaynak sayfada oran tablosu bulunamadi')

    const sonKey = keys[keys.length - 1]
    const [sonYil, sonAy] = sonKey.split('-').map(Number)

    return json({
      success: true,
      guncel: { yil: sonYil, ay: sonAy, oran: oranlar[sonKey] },
      oranlar,
      kaynak: 'TUIK 12 aylik TUFE ortalamasi (cevrimici)',
      alinma: new Date().toISOString()
    }, 200, { 'Cache-Control': 's-maxage=21600, stale-while-revalidate=86400' })
  } catch (err) {
    return json({ success: false, error: err.message })
  }
}
