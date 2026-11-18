// Gümrük ithalat fatura listesi Excel'ini (.xls/.xlsx) okur — her satır ayri
// bir ithalat fatura kaydına dönüşür. Örnek yapı (Luca "AFA GÜMRÜK" dökümü):
//   Baslik: FİŞ TARİHİ | FATURA NO | ÜNVANI | KDV ORANI | KDV MATRAHI | KDV TUTARI | TOPLAM
//   Satir : 18/08/2026 | F04446   | GANAPATHY INDUSTRIES | 10 | 2,491,823.41 | ...
// Sayilar Ingiliz formatinda (virgül binlik, nokta ondalik) veya Türk formatinda
// gelebilir; ikisi de desteklenir. Toplam satirlari (tarih + fatura no boş) atlanir.
export async function gumrukSatirlariniOku(arrayBuffer) {
  const XLSX = await import('xlsx')
  let wb
  try { wb = XLSX.read(arrayBuffer, { type: 'array' }) } catch { return [] }
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return []
  const satirlar = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  // Sayisal deger: Ingiliz "2,491,823.41" veya Türk "2.491.823,41" veya düz sayi
  const sayisal = (v) => {
    if (v == null || v === '') return null
    if (typeof v === 'number') return isFinite(v) ? v : null
    const s = String(v).trim()
    if (!/^[0-9.,\-]+$/.test(s)) return null
    let t = s
    if (s.includes(',') && s.includes('.')) {
      if (s.lastIndexOf(',') < s.lastIndexOf('.')) t = s.replace(/,/g, '')   // 2,491,823.41
      else t = s.replace(/\./g, '').replace(',', '.')                        // 2.491.823,41
    } else if (s.includes(',')) {
      t = s.replace(',', '.')                                                // ondalik virgül
    }
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
  const norm = (s) => String(s ?? '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim()

  // Baslik satirini bul ve kolon indekslerini esle
  let kol = null
  for (const s of satirlar) {
    const h = (s || []).map(norm)
    const idx = (desen) => h.findIndex(x => desen.test(x))
    const tarih = idx(/fi[şs] tar[iı]h/)
    const fno = idx(/fatura no|belge no/)
    const unvan = idx(/[üu]nvan|[üu]nvan[ıi]|kar[şs][ıi] tar[au]f/)
    if (tarih >= 0 && fno >= 0 && unvan >= 0) {
      kol = {
        tarih, fno, unvan,
        oran: idx(/kdv oran/),
        matrah: idx(/matrah/),
        kdv: idx(/kdv tutar/),
        toplam: idx(/toplam|genel toplam/)
      }
      break
    }
  }
  // Baslik bulunamadiysa sablon varsayimi (ilk 7 kolon)
  if (!kol) kol = { tarih: 0, fno: 1, unvan: 2, oran: 3, matrah: 4, kdv: 5, toplam: 6 }

  const sonuc = []
  for (const s of satirlar) {
    const tarih = tarihDuzelt(s[kol.tarih])
    const faturaNo = String(s[kol.fno] ?? '').trim()
    const unvan = String(s[kol.unvan] ?? '').trim()
    if (!tarih || !faturaNo) continue // baslik / boş / toplam satiri
    const matrah = sayisal(s[kol.matrah])
    const kdv = sayisal(s[kol.kdv])
    const toplam = sayisal(s[kol.toplam])
    if (matrah == null && toplam == null) continue
    // Doğrulama: matrah + kdv ≈ toplam (kolon kaymasına karşı)
    let m = matrah, k = kdv, t = toplam
    if (m != null && t != null && k == null) k = +(t - m).toFixed(2)
    if (m == null && t != null && k != null) m = +(t - k).toFixed(2)
    if (t == null && m != null && k != null) t = +(m + k).toFixed(2)
    if (m != null) m = +m.toFixed(2)
    if (k != null) k = +k.toFixed(2)
    if (t != null) t = +t.toFixed(2)
    sonuc.push({
      tarih,
      faturaNo,
      unvan,
      kdvOran: sayisal(s[kol.oran]),
      matrah: m,
      kdv: k,
      toplam: t
    })
  }
  return sonuc
}

// ---------- AFA dökümü ortak satır işleyici ----------
// CSV (Luca "AFA" dökümü, noktalı virgüllü, Windows-1254) ve Excel (.xls/.xlsx)
// aynı işleyiciye girer. Girdi: satır dizileri (string grid).
function afaGridiIsle(satirlar, baslikZorunlu = false) {
  const norm = (s) => String(s ?? '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim()

  // Baslik satirini bul ve kolon indekslerini esle
  let kol = null
  for (const s of satirlar) {
    const h = (s || []).map(norm)
    const idx = (desen) => h.findIndex(x => desen.test(x))
    const tarih = idx(/^tar[iı]h|fi[şs]|fatura tar[iı]h/)
    const fno = idx(/fatura no|belge no|fi[şs] no/)
    const unvan = idx(/[üu]nvan|kar[şs][ıi] tar[au]f/)
    if (tarih >= 0 && fno >= 0 && unvan >= 0) {
      kol = {
        tarih, fno, unvan,
        oran: idx(/kdv oran/),
        matrah: idx(/matrah/),
        kdv: idx(/kdv tutar/),
        toplam: idx(/^toplam$|genel toplam|toplam tutar/),
        nakit: idx(/^nak[iı]t(?: tutar[ıi]?)?$/),
        kredi: idx(/^kred[iı] k|kred[iı]l[iı] tutar/),
        odeme: idx(/[oö]deme (?:t[üu]r|y[oö]ntem)/)
      }
      break
    }
  }
  // Baslik bulunamadiysa sablon varsayimi (ilk 7 kolon):
  // TARİH | FATURA NO | ÜNVANI | KDV ORANI | KDV MATRAHI | KDV TUTARI | TOPLAM
  if (baslikZorunlu && (!kol || kol.matrah < 0 || kol.kdv < 0 || kol.toplam < 0)) return []
  if (!kol) kol = { tarih: 0, fno: 1, unvan: 2, oran: 3, matrah: 4, kdv: 5, toplam: 6 }

  const sonuc = []
  for (const s of satirlar) {
    if (!s || !s.length) continue
    const tarih = afaTarihDuzelt(s[kol.tarih])
    const faturaNo = String(s[kol.fno] ?? '').trim()
    const unvan = String(s[kol.unvan] ?? '').trim()
    if (!tarih || !faturaNo) continue // baslik / bos / toplam satiri
    const matrah = afaSayisal(s[kol.matrah])
    const kdv = afaSayisal(s[kol.kdv])
    const toplam = afaSayisal(s[kol.toplam])
    if (matrah == null && toplam == null) continue
    // Dogrulama: matrah + kdv ≈ toplam (kolon kaymasina karsi)
    let m = matrah, k = kdv, t = toplam
    if (m != null && t != null && k == null) k = +(t - m).toFixed(2)
    if (m == null && t != null && k != null) m = +(t - k).toFixed(2)
    if (t == null && m != null && k != null) t = +(m + k).toFixed(2)
    if (m != null) m = +m.toFixed(2)
    if (k != null) k = +k.toFixed(2)
    if (t != null) t = +t.toFixed(2)
    const kdvOran = afaSayisal(String(s[kol.oran] ?? '').replace('%', '').trim())
    const odeme = norm(s[kol.odeme])
    let nakit = afaSayisal(s[kol.nakit]), kredi = afaSayisal(s[kol.kredi])
    if (nakit == null && /^nak[iı]t$/.test(odeme)) { nakit = t; kredi = 0 }
    if (kredi == null && /^kred[iı][ _-]*kart[ıi]$/.test(odeme)) { kredi = t; nakit = 0 }
    sonuc.push({ tarih, faturaNo, unvan, kdvOran, matrah: m, kdv: k, toplam: t,
      nakit, kredi, kdvDetaylari: kdvOran != null ? [{ oran: kdvOran, matrah: m, kdv: k }] : [] })
  }
  return sonuc
}

// Sayisal deger: Ingiliz "2,491,823.41" veya Türk "2.491.823,41" veya düz sayi
function afaSayisal(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return isFinite(v) ? v : null
  const s = String(v).trim()
  if (!/^[0-9.,\-]+$/.test(s)) return null
  let t = s
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') < s.lastIndexOf('.')) t = s.replace(/,/g, '')   // 2,491,823.41
    else t = s.replace(/\./g, '').replace(',', '.')                        // 2.491.823,41
  } else if (s.includes(',')) {
    t = s.replace(',', '.')                                                // ondalik virgül
  }
  const n = parseFloat(t)
  return isFinite(n) ? n : null
}

function afaTarihDuzelt(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10)
  const n = Number(v)
  if (isFinite(n) && n > 20000 && n < 80000) {
    return new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10) // Excel serial
  }
  const m = String(v).match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

// Noktalı virgüllü CSV satırını ayrıştırır (tırnaklı alanlar destekli)
function afaCsvSatirlari(metin) {
  const satirlar = []
  let satir = []
  let alan = ''
  let tirnakli = false
  for (let i = 0; i < metin.length; i++) {
    const c = metin[i]
    if (tirnakli) {
      if (c === '"') {
        if (metin[i + 1] === '"') { alan += '"'; i++ } else tirnakli = false
      } else alan += c
    } else if (c === '"') {
      tirnakli = true
    } else if (c === ';') {
      satir.push(alan); alan = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && metin[i + 1] === '\n') i++
      satir.push(alan); alan = ''
      if (satir.some(x => x.trim() !== '')) satirlar.push(satir)
      satir = []
    } else {
      alan += c
    }
  }
  satir.push(alan)
  if (satir.some(x => x.trim() !== '')) satirlar.push(satir)
  return satirlar
}

// Luca "AFA" dökümünü okur — .csv (Windows-1254/noktalı virgül) veya
// .xls/.xlsx. Her satır ayrı fiş/fatura kaydına dönüşür. Hem Gümrük/İthalat
// hem Gider fiş/fatura dökümleri aynı yapıdadır.
export async function afaDokumSatirlariniOku(arrayBuffer, dosyaAdi = '', baslikZorunlu = false) {
  if (/\.(csv|cvs)$/i.test(dosyaAdi)) {
    let metin = ''
    try { metin = new TextDecoder('utf-8', { fatal: true }).decode(arrayBuffer) } catch { metin = new TextDecoder('windows-1254').decode(arrayBuffer) }
    return afaGridiIsle(afaCsvSatirlari(metin), baslikZorunlu)
  }
  const XLSX = await import('xlsx')
  const wb = XLSX.read(arrayBuffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return []
  return afaGridiIsle(XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }), baslikZorunlu)
}

// ---------- Z RAPORU dökümü (yazar kasa gün sonu) ----------
// Yapı: TARİH;EVRAK NO;AÇIKLAMA;SATIŞ 0;SATIŞ 1;SATIŞ 10;SATIŞ 20;
//       NAKİT;KREDİ K;MATRAH 1;MATRAH 10;MATRAH 20;KDV 1;KDV 10;KDV 20
// Her satır bir günün Z raporudur. Dönen kayıt:
// { tarih, evrakNo, aciklama, satis, matrah, kdv, toplam }
export async function zRaporuSatirlariniOku(arrayBuffer, dosyaAdi = '') {
  let satirlar
  if (/\.(csv|cvs)$/i.test(dosyaAdi)) {
    let metin = ''
    try { metin = new TextDecoder('utf-8', { fatal: true }).decode(arrayBuffer) } catch { metin = new TextDecoder('windows-1254').decode(arrayBuffer) }
    satirlar = afaCsvSatirlari(metin)
  } else {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(arrayBuffer, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    if (!ws) return []
    satirlar = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  }
  const norm = (s) => String(s ?? '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim()

  // Baslik kolonlarini esle
  let kol = null
  for (const s of satirlar) {
    const h = (s || []).map(norm)
    const idx = (d) => h.findIndex(x => d.test(x))
    const tarih = idx(/^tar[iı]h/)
    const evrak = idx(/evrak no|belge no/)
    if (tarih >= 0 && evrak >= 0) {
      kol = {
        tarih, evrak,
        aciklama: idx(/a[cç][ıi]klama/),
        oranlar: [0, 1, 5, 8, 10, 18, 20].map(oran => ({
          oran,
          satis: idx(new RegExp(`^sat[ıi][şs]\\s*%?\\s*${oran}$`)),
          matrah: idx(new RegExp(`^matrah\\s*%?\\s*${oran}$`)),
          kdv: idx(new RegExp(`^kdv\\s*%?\\s*${oran}$`))
        })),
        nakit: idx(/^nak[iı]t(?: tutar[ıi]?)?$/),
        kredi: idx(/^kred[iı] k/)
      }
      break
    }
  }
  if (!kol) return []

  const sonuc = []
  for (const s of satirlar) {
    if (!s || !s.length) continue
    const tarih = afaTarihDuzelt(s[kol.tarih])
    const evrakNo = String(s[kol.evrak] ?? '').trim()
    if (!tarih || !evrakNo) continue // baslik/bos satir
    const yuvarla = deger => Math.round(deger * 100) / 100
    const kdvDetaylari = kol.oranlar.flatMap(alan => {
      const toplam = afaSayisal(s[alan.satis])
      let matrah = afaSayisal(s[alan.matrah]), kdv = afaSayisal(s[alan.kdv])
      if (!toplam && !matrah && !kdv) return []
      if (alan.oran === 0) { matrah = matrah ?? toplam; kdv = 0 }
      if (matrah == null || (matrah === 0 && toplam > 0)) matrah = toplam != null ? yuvarla(toplam / (1 + alan.oran / 100)) : yuvarla(kdv * 100 / alan.oran)
      if (kdv == null) kdv = toplam != null ? yuvarla(toplam - matrah) : yuvarla(matrah * alan.oran / 100)
      return [{ oran: alan.oran, matrah, kdv }]
    })
    const matrah = yuvarla(kdvDetaylari.reduce((sum, detay) => sum + detay.matrah, 0))
    const kdv = yuvarla(kdvDetaylari.reduce((sum, detay) => sum + detay.kdv, 0))
    const satis = yuvarla(kol.oranlar.reduce((sum, alan) => sum + (afaSayisal(s[alan.satis]) || 0), 0))
    const toplam = satis !== 0 ? satis : yuvarla(matrah + kdv)
    if (matrah === 0 && kdv === 0 && toplam === 0) continue
    let nakit = afaSayisal(s[kol.nakit]), kredi = afaSayisal(s[kol.kredi])
    if (kol.nakit >= 0 && kol.kredi >= 0 && toplam >= 0) {
      if (nakit == null && kredi != null && kredi >= 0 && kredi <= toplam) nakit = yuvarla(toplam - kredi)
      else if (kredi == null && nakit != null && nakit >= 0 && nakit <= toplam) kredi = yuvarla(toplam - nakit)
    }
    sonuc.push({
      tarih,
      evrakNo,
      aciklama: kol.aciklama >= 0 ? String(s[kol.aciklama] ?? '').trim() : 'Z RAPORU',
      satis, matrah, kdv, toplam, kdvDetaylari,
      nakit, kredi
    })
  }
  return sonuc
}
