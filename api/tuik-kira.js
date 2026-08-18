// TUIK kira artis orani (12 aylik TUFE ortalamasi) - cevrimici veri servisi
// Kaynak sayfa TUIK verileriyle her ay guncellenir; buradan okunup dondurulur.
// Sonuc Vercel CDN cache'inde 6 saat tutulur.

const KAYNAK_URL = 'https://kira-artis-orani.hesaplama.net/'

const AYLAR = {
  'ocak': 1, 'subat': 2, 'mart': 3, 'nisan': 4, 'mayis': 5, 'haziran': 6,
  'temmuz': 7, 'agustos': 8, 'eylul': 9, 'ekim': 10, 'kasim': 11, 'aralik': 12
}

function normalizeTr(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .trim()
}

function parseRate(s) {
  // "%31,90" veya "31.90" -> 31.90
  const m = String(s).replace('%', '').trim().match(/(\d{1,3})[.,](\d{1,2})/)
  if (!m) return null
  return Number(`${m[1]}.${m[2]}`)
}

export default async function handler(req, res) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const resp = await fetch(KAYNAK_URL, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MubisERP/1.0)' }
    })
    clearTimeout(timeout)
    if (!resp.ok) throw new Error(`Kaynak erisim hatasi: ${resp.status}`)
    const html = await resp.text()

    // Tum hucreleri sirayla cikar
    const cells = [...html.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map(m => m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim())

    // (Ay Yil, %Oran) ikililerini yakala
    const oranlar = {}
    for (let i = 0; i < cells.length - 1; i++) {
      const dateMatch = normalizeTr(cells[i]).match(/^(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)\s+(\d{4})$/)
      if (!dateMatch) continue
      const oran = parseRate(cells[i + 1])
      if (oran == null || oran <= 0 || oran > 200) continue
      const yil = Number(dateMatch[2])
      const ay = AYLAR[dateMatch[1]]
      const key = `${yil}-${String(ay).padStart(2, '0')}`
      // Ayni ay birden fazla tabloda gecebilir; ilk (konut tablosu) degeri koru
      if (!oranlar[key]) oranlar[key] = oran
    }

    const keys = Object.keys(oranlar).sort()
    if (keys.length === 0) throw new Error('Kaynak sayfada oran tablosu bulunamadi')

    // En guncel ay
    const sonKey = keys[keys.length - 1]
    const [sonYil, sonAy] = sonKey.split('-').map(Number)

    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400')
    return res.status(200).json({
      success: true,
      guncel: { yil: sonYil, ay: sonAy, oran: oranlar[sonKey] },
      oranlar,
      kaynak: 'TUIK 12 aylik TUFE ortalamasi (cevrimici)',
      alinma: new Date().toISOString()
    })
  } catch (err) {
    return res.status(200).json({ success: false, error: err.message })
  }
}
