// UTTS rapor Excel'ini okur — her satir ayri bir fis/fatura kaydina donusur.
// GIB UTTS rapor yapisi: sayfa "FATURALAR"; kolonlar: Fatura Tarihi,
// Fatura Numarasi, Fatura Turu, VKN/TCKN, Aciklama, Plaka, Tevkifat Orani,
// Ozel Matrah, %KDV kolonlari, %Matrah kolonlari, Toplam.
// Not: rapor degerleri hizali degil (oran, matrah, toplam farkli kolonlara
// dusebiliyor); bu yuzden tutarlar satir sonundaki sayilardan hesaplanir:
// son iki sayi = matrah + toplam; oran = onlerindeki 1..100 arasi deger;
// dogrulama: matrah * (1 + oran/100) ~= toplam.
export async function uttsOtomatikSatirlariniOku(arrayBuffer) {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(arrayBuffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) throw new Error('UTTS Excel sayfası bulunamadı')
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const baslik = (value) => String(value || '').toLocaleLowerCase('tr').replace(/\s+/g, '')
  const beklenen = ['faturatarihi', 'faturanumarası', 'faturatürü', 'vkntckn', 'açıklama', 'plaka', 'tevkifatoranı', 'özelmatrah', "%1'likkdv", "%8'likkdv", "%10'likkdv", "%18'likkdv", "%20'likkdv", "%1'likmatrah", "%8'likmatrah", "%10'likmatrah", "%18'likmatrah", "%20'likmatrah", 'toplam']
  if (!beklenen.every((value, index) => baslik(rows[0]?.[index]) === value)) throw new Error('UTTS Excel sütunları tanınmıyor')
  const parsed = await uttsSatirlariniOku(arrayBuffer)
  const veri = rows.slice(1).filter(row => row[0] !== '' && row[0] != null)
  if (!parsed.length || parsed.length !== veri.length) throw new Error('UTTS Excel satırları doğrulanamadı')
  const sayi = (value) => {
    if (value == null || value === '') return 0
    const text = String(value).trim()
    if (!/^-?(?:\d+(?:\.\d+)?|\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?)$/.test(text) || (typeof value === 'string' && /^-?\d{1,3}(?:\.\d{3})+$/.test(text))) throw new Error('UTTS tutarı okunamadı')
    const result = typeof value === 'number' ? value : Number(text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text)
    if (!Number.isFinite(result)) throw new Error('UTTS tutarı okunamadı')
    return result
  }
  const anahtarlar = new Set()
  return parsed.map((row, index) => {
    const source = veri[index]
    const key = JSON.stringify([row.tarih, row.faturaNo, row.vkn])
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.tarih || '') || !row.faturaNo || !/^\d{10,11}$/.test(row.vkn) || anahtarlar.has(key)) throw new Error('UTTS satır kimliği eksik veya tekrarlı')
    anahtarlar.add(key)
    if (sayi(source[6]) || sayi(source[7])) throw new Error('Tevkifatlı veya özel matrahlı UTTS satırı otomatik aktarılamıyor')
    const matrah = source.slice(13, 18).reduce((sum, value) => sum + sayi(value), 0)
    const kdv = source.slice(8, 13).reduce((sum, value) => sum + sayi(value), 0)
    const toplam = sayi(source[18])
    if (Math.abs(matrah + kdv - toplam) > 0.05) throw new Error('UTTS satır tutarları doğrulanamadı')
    return { ...row, matrah: +matrah.toFixed(2), kdv: +kdv.toFixed(2), toplam }
  })
}

export async function uttsSatirlariniOku(arrayBuffer) {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(arrayBuffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return []
  const satirlar = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  const sayisal = (v) => {
    if (v == null || v === '') return null
    if (typeof v === 'number') return isFinite(v) ? v : null
    const s = String(v).trim()
    if (!/^[0-9.,\-]+$/.test(s)) return null // "34DUV286" gibi plakalar sayilmaz
    let t = s
    if (s.includes(',')) t = s.replace(/\./g, '').replace(',', '.') // 1.234,56 -> 1234.56
    const n = parseFloat(t)
    return isFinite(n) ? n : null
  }
  const tarihDuzelt = (v) => {
    if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10)
    const n = Number(v)
    if (isFinite(n) && n > 20000 && n < 80000) {
      return new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10) // Excel serial
    }
    const m = String(v).match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/)
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    return null
  }

  const sonuc = []
  for (const s of satirlar) {
    const dolu = s.filter(v => v !== '' && v != null)
    if (!dolu.length) continue
    const tarih = tarihDuzelt(s[0])
    const faturaNo = String(s[1] ?? '').trim()
    const vkn = String(s[3] ?? '').trim()
    if (!tarih && !faturaNo && !vkn) continue // baslik/boş satir
    const sayilar = s.map(x => sayisal(x)).filter(n => n !== null)
    if (!sayilar.length) continue

    const toplam = sayilar[sayilar.length - 1]
    const onceki = sayilar.length >= 2 ? sayilar[sayilar.length - 2] : null
    const oranAdayi = sayilar.slice(0, -2).reverse().find(n => n > 1 && n <= 100)
    let matrah = null, kdv = null, oran = null
    if (onceki != null) {
      if (oranAdayi != null && Math.abs(onceki * (1 + oranAdayi / 100) - toplam) < 0.05) {
        oran = oranAdayi
        matrah = onceki
        kdv = +(toplam - onceki).toFixed(2)
      } else if (Math.abs(onceki) < Math.abs(toplam)) {
        matrah = onceki
        kdv = +(toplam - onceki).toFixed(2)
      }
    }
    sonuc.push({ tarih, faturaNo, vkn, oran, matrah, kdv, toplam })
  }
  return sonuc
}
