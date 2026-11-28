import { createWorker } from 'tesseract.js'

// ================= GORUNTU HAZIRLAMA / BOLUMLEME =================
// Tek fotograf icine yanyana / ust uste cekilmis Z raporlari tesseract
// tarafindan tek metin gibi okunur ve satirlar fisler arasi karisir.
// Cozum: resim once dikey bosluklardan (murekkep yogunlugu analizi ile)
// fislere bolunur, her fis buyutulup kontrastlandirilarak ayri OCR'dan
// gecirilir; her parcanin metni ayri rapor olarak parse edilir.

function resimYukle(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Resim yuklenemedi'))
    img.src = url
  })
}

// Otsu esigi: gri ton histogramindan metin/arkaplan ayrim esigi
function otsuEsigi(gri) {
  const hist = new Array(256).fill(0)
  for (let i = 0; i < gri.length; i++) hist[gri[i]]++
  const toplam = gri.length
  let toplamSum = 0
  for (let t = 0; t < 256; t++) toplamSum += t * hist[t]
  let arkaSayi = 0, arkaSum = 0, enIyi = 0, esik = 127
  for (let t = 0; t < 256; t++) {
    arkaSayi += hist[t]
    if (!arkaSayi) continue
    const onSayi = toplam - arkaSayi
    if (!onSayi) break
    arkaSum += t * hist[t]
    const arkaOrt = arkaSum / arkaSayi
    const onOrt = (toplamSum - arkaSum) / onSayi
    const varyans = arkaSayi * onSayi * (arkaOrt - onOrt) * (arkaOrt - onOrt)
    if (varyans > enIyi) { enIyi = varyans; esik = t }
  }
  return esik
}

// Resmi yukler, Otsu esigi ile metin kolonlarini bulur ve yatay bosluklardan
// fislere boler. DataURL dizisi dondurur (en az 1 eleman: tum resim).
// binare=true ise parcalar siyah/beyaz esige de uygulanir (soluk termal kagit icin).
async function resmiOcrParcalarinaBol(url, binare = false) {
  try {
    const img = await resimYukle(url)
    const W = img.naturalWidth, H = img.naturalHeight
    if (!W || !H) return [url]

    const c = document.createElement('canvas')
    c.width = W; c.height = H
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0)
    const veri = ctx.getImageData(0, 0, W, H).data

    // Gri tonlar + Otsu esigi
    const gri = new Uint8Array(W * H)
    for (let i = 0; i < W * H; i++) {
      gri[i] = (veri[i * 4] * 0.299 + veri[i * 4 + 1] * 0.587 + veri[i * 4 + 2] * 0.114) | 0
    }
    const esik = otsuEsigi(gri)

    // Dikey murekkep yogunlugu: her x kolonunda esik alti piksel sayisi
    const kolonMurekkep = new Uint32Array(W)
    for (let y = 0; y < H; y++) {
      const satir = y * W
      for (let x = 0; x < W; x++) {
        if (gri[satir + x] < esik) kolonMurekkep[x]++
      }
    }
    const minMurekkep = Math.max(3, Math.floor(H * 0.008))

    // Ardisik metin kolonlarini grupla; genislik > %0.4 olan bosluklar fis ayirici
    const boslukEsigi = Math.max(2, Math.round(W * 0.004))
    const segler = []
    let bas = null, sonBos = 0
    for (let x = 0; x < W; x++) {
      const dolu = kolonMurekkep[x] > minMurekkep
      if (dolu) {
        if (bas === null) bas = x
        sonBos = 0
      } else if (bas !== null) {
        sonBos++
        if (sonBos > boslukEsigi) {
          const son = x - sonBos
          if (son - bas + 1 >= W * 0.05) segler.push([bas, son])
          bas = null; sonBos = 0
        }
      }
    }
    if (bas !== null) {
      const son = W - 1 - sonBos
      if (son - bas + 1 >= W * 0.05) segler.push([bas, son])
    }

    // 2+ fis bulunamadiysa tek parcada devam (metin bazli bolme hala devrede)
    if (segler.length < 2 || segler.length > 6) {
      return [hazirlaVeOlcekle(c, 0, 0, W, H, binare).toDataURL('image/png')]
    }

    // Kenarlardan kucuk pay verip her fisi ayri buyutulmus goruntuye cevir
    const pay = Math.max(2, Math.round(W * 0.004))
    return segler.map(([a, b]) => {
      const x0 = Math.max(0, a - pay)
      const x1 = Math.min(W, b + 1 + pay)
      return hazirlaVeOlcekle(c, x0, 0, x1 - x0, H, binare).toDataURL('image/png')
    })
  } catch {
    return [url] // hazirlanamadiysa ham resimle devam
  }
}

// Parcayi keser; gri tonlama + kontrast germe uygular; fis metni okunur olsun
// diye genisligi en az ~1400px'e buyutur. binare=true ise kontrast germe
// sonrasi Otsu esigiyle siyah/beyaz'a indirgenir (soluk/sararmis termal kagit).
function hazirlaVeOlcekle(kaynak, sx, sy, sw, sh, binare = false) {
  const hedefGenislik = 1400
  const olcek = Math.min(4, Math.max(1, hedefGenislik / sw))
  const w = Math.round(sw * olcek), h = Math.round(sh * olcek)
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(kaynak, sx, sy, sw, sh, 0, 0, w, h)
  const veri = ctx.getImageData(0, 0, w, h)
  const px = veri.data
  const griler = new Uint8Array(w * h)
  let mn = 255, mx = 0
  for (let i = 0; i < w * h; i++) {
    const g = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) | 0
    griler[i] = g
    if (g < mn) mn = g
    if (g > mx) mx = g
  }
  const aralik = Math.max(1, mx - mn)
  const esik = binare ? otsuEsigi(griler.map((g) => (g - mn) * 255 / aralik | 0)) : 0
  for (let i = 0; i < w * h; i++) {
    let v = ((griler[i] - mn) * 255 / aralik) | 0
    if (binare) v = v < esik ? 0 : 255
    px[i * 4] = v; px[i * 4 + 1] = v; px[i * 4 + 2] = v; px[i * 4 + 3] = 255
  }
  ctx.putImageData(veri, 0, 0)
  return c
}

// Tek resmi OCR'dan gecirir: once fislere boler, her parcayi ayri okur,
// her metni ayri rapor(lar) olarak parse eder.
// psm: tesseract sayfa bolme modu; binare: siyah/beyaz ON isleme.
async function resimdenRaporlar(worker, url, psm = '6', binare = false) {
  try { await worker.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: '1' }) } catch { /* opsiyonel */ }
  const parcalar = await resmiOcrParcalarinaBol(url, binare)
  const textler = []
  for (const p of parcalar) {
    try {
      const { data: { text } } = await worker.recognize(p)
      if (text && text.trim()) textler.push(text)
    } catch { /* parcayi atla */ }
  }
  const birlesik = textler.join('\n')
  const parsedList = []
  for (const t of textler) parsedList.push(...parseZReportTextMulti(t))
  // Ayni rapor iki parcada da ciktiysa (evrakNo+tutar ayni) tekle
  const tekil = []
  for (const p of parsedList) {
    const anahtar = `${p.evrakNo || ''}|${p.tarih || ''}|${p.toplamSatis || 0}`
    if (!tekil.some(x => `${x.evrakNo || ''}|${x.tarih || ''}|${x.toplamSatis || 0}` === anahtar)) tekil.push(p)
  }
  if (!tekil.length) {
    const p = parseZReportOCRText(birlesik)
    if (p) tekil.push(p)
  }
  return { rawText: birlesik, parsedList: tekil, parsed: tekil[0] || null }
}

// Parse sonucunun ic tutarlilik skoru: dolu alan sayisi + capraz kontroller.
// Matrah+KDV~toplam, satislar~toplam, odemeler~toplam yakinsamasi guveni artirir.
export function parseSkoru(p) {
  if (!p) return -1
  let skor = 0
  const dolu = [p.tarih, p.evrakNo, p.toplamSatis, p.nakit, p.krediKarti,
    p.satis0, p.satis1, p.satis10, p.satis20,
    p.matrah1, p.matrah10, p.matrah20, p.kdv1, p.kdv10, p.kdv20]
  skor += dolu.filter(v => v !== null && v !== 0 && v !== '').length * 2
  const tolerans = (x) => Math.max(0.05, Math.abs(x) * 0.005)
  const matrahTop = (p.matrah1 || 0) + (p.matrah10 || 0) + (p.matrah20 || 0)
  const kdvTop = (p.kdv1 || 0) + (p.kdv10 || 0) + (p.kdv20 || 0)
  const satisTop = (p.satis0 || 0) + (p.satis1 || 0) + (p.satis10 || 0) + (p.satis20 || 0)
  if (p.toplamSatis > 0) {
    if (matrahTop > 0 && Math.abs(matrahTop + kdvTop - p.toplamSatis) <= tolerans(p.toplamSatis)) skor += 25
    if (satisTop > 0 && Math.abs(satisTop - p.toplamSatis) <= tolerans(p.toplamSatis)) skor += 20
    const odeme = (p.nakit || 0) + (p.krediKarti || 0) + (p.havale || 0)
    if (odeme > 0 && Math.abs(odeme - p.toplamSatis) <= tolerans(p.toplamSatis)) skor += 15
  }
  return skor
}

/**
 * Z Raporu resmini OCR ile okur ve yapilandirilmis veriye donusturur.
 * Cok gecisli okuma: ayni resim 3 farkli ayarla okunur (PSM 6 gri, PSM 4 gri,
 * PSM 6 siyah/beyaz) ve ic tutarliligi en yuksek parse secilir — soluk kirpik
 * fotograflarda tek gecis inkarinin onune gecer.
 */
export async function processZReportImage(imageUrl) {
  const worker = await createWorker('tur')
  try {
    const paslar = [
      { psm: '6', binare: false },
      { psm: '4', binare: false },
      { psm: '6', binare: true },
    ]
    let enIyi = null
    for (const pas of paslar) {
      let sonuc
      try { sonuc = await resimdenRaporlar(worker, imageUrl, pas.psm, pas.binare) } catch { continue }
      if (!sonuc.parsedList || !sonuc.parsedList.length) continue
      const adayParse = sonuc.parsedList.reduce((a, b) => (parseSkoru(b) > parseSkoru(a) ? b : a))
      const adaySkor = parseSkoru(adayParse)
      if (!enIyi || adaySkor > enIyi.skor) {
        enIyi = { rawText: sonuc.rawText, parsed: adayParse, parsedList: sonuc.parsedList, skor: adaySkor }
      }
      if (enIyi.skor >= 55) break // yeterince guvenli, kalan paslara gerek yok
    }
    if (!enIyi) {
      const tek = await resimdenRaporlar(worker, imageUrl, '6', false)
      return { rawText: tek.rawText, parsed: tek.parsed, parsedList: tek.parsedList, confidence: tek.parsed?.confidence || 0 }
    }
    return {
      rawText: enIyi.rawText,
      parsed: enIyi.parsed,
      parsedList: enIyi.parsedList,
      confidence: enIyi.parsed?.confidence || 0,
    }
  } finally {
    await worker.terminate()
  }
}

/**
 * Toplu Z raporu resimlerini tek worker ile sirayla okur.
 * Her resim birden cok Z raporu icerebilir (parsedList).
 */
export async function processZReportImagesBatch(imageUrls) {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) return []
  const worker = await createWorker('tur')
  try {
    const results = []
    for (const url of imageUrls) {
      let { rawText, parsedList, parsed } = await resimdenRaporlar(worker, url)
      // Tek geciste okunamadiysa siyah/beyaz varyantiyla bir kez daha dene
      if ((!parsedList || !parsedList.length) && rawText) {
        try {
          const yeniden = await resimdenRaporlar(worker, url, '6', true)
          if (yeniden.parsedList?.length) {
            rawText = yeniden.rawText
            parsedList = yeniden.parsedList
            parsed = yeniden.parsed
          }
        } catch { /* ilk sonucla devam */ }
      }
      results.push({ rawText, parsed, parsedList, confidence: parsed?.confidence || 0 })
    }
    return results
  } finally {
    await worker.terminate()
  }
}

/**
 * OCR metnini birden fazla Z raporuna boler. Tek fotograf icine ust uste /
 * yanyana birden cok Z raporu cekildiginde her blok ayri rapor olarak
 * parse edilir. Bolum basligi: "Z RAPOR" iceren satir, satir basindaki
 * "Z-123456" numarasi veya ikinci ve sonraki bolumden itibaren tek basina
 * tarih iceren satir.
 */
function zRaporMetniniBol(text) {
  const satirlar = String(text || '').split('\n')
  const bolumler = []
  let suanki = []
  let tarihGordu = false

  const bolumBasligiMi = (l) => {
    const u = l.trim().toUpperCase()
    if (/Z\s*RAPOR/.test(u)) return true
    if (/^Z\s*[-–]?\s*\d{3,}/.test(u)) return true
    // Tek basina tarih iceren satir (25.09.2026 / 25.09.2026 14:35) —
    // yalnizca bu bolumde zaten bir tarih gorulduyse yeni bolum say
    if (tarihGordu && /^\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}(\s+\d{1,2}[:.]\d{2})?\s*$/.test(l.trim())) return true
    return false
  }

  for (const l of satirlar) {
    if (l.trim() && bolumBasligiMi(l)) {
      if (suanki.some(x => x.trim())) bolumler.push(suanki.join('\n'))
      suanki = [l]
      tarihGordu = false
      continue
    }
    if (/^\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}/.test(l.trim())) tarihGordu = true
    suanki.push(l)
  }
  if (suanki.some(x => x.trim())) bolumler.push(suanki.join('\n'))

  // Gecerli bolum: en az bir para degeri iceren
  const gecerli = bolumler.filter(b => /\d+[.,]\d{2}/.test(b))
  return gecerli.length ? gecerli : [String(text || '')]
}

/**
 * OCR metnindeki TUM Z raporlarini parse eder (dizi dondurur).
 * Tek raporluk metinlerde 1 elemanli dizi doner.
 */
export function parseZReportTextMulti(text) {
  const bolumler = zRaporMetniniBol(text)
  const sonuc = []
  for (const b of bolumler) {
    const p = parseZReportOCRText(b)
    if (!p) continue
    const toplam = (p.satis0 || 0) + (p.satis1 || 0) + (p.satis10 || 0) + (p.satis20 || 0) || p.toplamSatis || p.nakit || p.krediKarti
    if (p.tarih || p.evrakNo || toplam > 0) sonuc.push(p)
  }
  return sonuc
}

/**
 * OCR metnini Z raporu yapisina parse eder - GELISTIRILMIS
 */
function parseZReportOCRText(text) {
  if (!text) return null

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const fullText = text.toUpperCase()

  const result = {
    tarih: null,
    evrakNo: null,
    aciklama: null,
    satis0: 0,
    satis1: 0,
    satis10: 0,
    satis20: 0,
    nakit: 0,
    krediKarti: 0,
    havale: 0,
    matrah1: 0,
    matrah10: 0,
    matrah20: 0,
    kdv1: 0,
    kdv10: 0,
    kdv20: 0,
    toplamSatis: 0,
    iade: 0,
    confidence: 0
  }

  // ========== TARIH BULMA ==========
  const datePatterns = [
    /(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{4})/,
    /(\d{4})[\.\/\-](\d{1,2})[\.\/\-](\d{1,2})/,
    /(\d{2})(\d{2})(\d{4})/,
    /(\d{2})[\.\-\/](\d{2})[\.\-\/](\d{2})/
  ]

  for (const pattern of datePatterns) {
    const match = text.match(pattern)
    if (match) {
      if (match[3].length === 4) {
        result.tarih = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
      } else {
        result.tarih = `20${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
      }
      break
    }
  }

  // ========== EVRAK / Z NO ==========
  // 2.7.395: Bazi Z raporlarinda hem FIS NO hem Z SAYAC vardir.
  // Evrak numarasi olarak Z raporunun kendi sayaci (Z SAYAC / Z SAYI / Z NO)
  // kullanilmalidir; yoksa FIS NO / EVRAK NO / SIRA NO gibi diger alanlara
  // dusulur.
  const evrakPatterns = [
    /Z\s*SAYA[ÇC]\s*[\.:\s]*([0-9]+)/i,
    /Z\s*SAY[İI]\s*[\.:\s]*([0-9]+)/i,
    /Z\s*[-–—]\s*(\d{3,})/i,
    /Z\s*RAPORU.*Z\s*[-–—]\s*(\d+)/i,
    /Z\s*NO\s*[\.:\s]*([0-9]+)/i,
    /(?:EVRAK\s*NO|BELGE\s*NO)[\.:\s]*([0-9]+)/i,
    /(?:Z\s*RAPORU|RAPOR)[\.:\s]*([0-9]+)/i,
    /(?:SIRA\s*NO|NO)[\.:\s]*([0-9]{3,})/i,
    /F[İI][ŞS]\s*NO\s*[\.:\s]*([0-9]+)/i
  ]

  for (const pattern of evrakPatterns) {
    const match = text.match(pattern)
    if (match) {
      result.evrakNo = match[1]
      break
    }
  }

  // ========== ODEME TOPLAMLARI (banka / kredi / nakit) ==========
  let bankaToplami = 0
  let kasaKrediToplami = 0
  let krediKartiSatiri = 0
  let kdvBelirsiz = 0

  lines.forEach(line => {
    const upperLine = line.toUpperCase()

    // Nakit tahsilat (kasa nakit dahil) — sadece "NAKIT" yazan satirlar da
    // yakalanir (bazi yazarkasalarda "NAKIT *550,00" seklinde cikar)
    if (/NAK[İI]T/.test(upperLine) && !/[K]AR[SŞ]IL[Iİ]G/.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > result.nakit) result.nakit = num
    }

    // Kredi karti — kasa kredi, K.KARTI / K.KART / kredi karti satirlari
    // (banka adi iceren satirlar asagidaki banka blogsunda toplanir)
    if (/KASA\s*KRED[İI]/.test(upperLine)) {
      const num = extractNumberFromLine(line)
      kasaKrediToplami += num
    } else if (/K\.?\s*KART|KRED[İI]\s*KART/.test(upperLine) && !/BANK/i.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > krediKartiSatiri) krediKartiSatiri = num
    }

    // Banka satirlari (T.VAKIFLAR, HALK, DENIZ, vb.)
    if (/(?:T\.VAKIFLAR|VAKIFLAR|HALK|DEN[İI]Z|[İI]Ş|İŞ|GARANT[İI]|AKBANK|YAPI\s*KRED[İI]|ZIRAAT|F[İI]NANS)\s*BANK/i.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > 0) bankaToplami += num
    }

    // Havale / EFT
    if (/HAVALE|EFT|BANKA\s*HAVA/i.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > result.havale) result.havale = num
    }
  })

  result.krediKarti = Math.max(krediKartiSatiri, kasaKrediToplami + bankaToplami)

  // ========== SATIŞ DEĞERLERİ ==========
  let brutSatis = 0
  let netSatis = 0
  let topSatis = 0
  let topkdv = 0
  const toplamAdaylari = []

  lines.forEach((line, idx) => {
    const upperLine = line.toUpperCase()
    // 2.7.388: DÖKÜM başlığı bir satırda, değer ("x20 TOPLAM *9.640,00")
    // bir SONRAKİ satırda olabiliyor — önceki satır bağlamı tutulur
    const oncekiUst = idx > 0 ? String(lines[idx - 1] || '').toUpperCase() : ''
    const dokumBaglami = /D[ÖO]K[ÜU]M/.test(upperLine) || /D[ÖO]K[ÜU]M/.test(oncekiUst)

    // Net satis (KDV dahil toplam)
    if (/NET\s*SATIŞ/.test(upperLine) || /NET\s*SATIS/.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > netSatis) netSatis = num
    }
    // Brut satis
    else if (/BR[ÜU]T\s*SATIŞ/.test(upperLine) || /BRUT\s*SATIS/.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > brutSatis) brutSatis = num
    }
    // TOPKDV — fislerde birden fazla bolumde tekrarlanabilir (VERGİ DÖKÜMÜ +
    // MALİ VERİ); sonraki her zaman kesin sayim bolumundendir → SON deger alınır.
    // KÜM/KÜMULATIF/KUM. TOP (kümülatif, "KUM, TOP" virgüllü varyant dahil) ve
    // ondalıksız kirik okumalar ("9   5") kabul edilmez.
    else if (/TOPKDV|KDV\s*TOPLAM/.test(upperLine)) {
      if (!/K[ÜU]M\.?,?\s/.test(upperLine) && /\d[.,]\s?\d{2}\b/.test(line)) {
        const num = extractNumberFromLine(line)
        if (num > 0) topkdv = num
      }
    }
    // TOP / TOPLAM (genel toplam) - FIS SAYILARI ve KÜM/KUM (kümülatif,
    // "KUM, TOP" virgüllü varyant dahil) disinda
    else if (/\bTOP\b|\bTOPLAM\b/.test(upperLine) && !/F[İI]Ş\s*SAY|İPTAL|RAPOR|K[ÜU]M\.?,?\s/i.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > 0) toplamAdaylari.push({ n: num, i: idx })
      if (num > topSatis) topSatis = num
    }

    // Vergi dökümü satirlari: "VERGİ DÖKÜMÜ %20 TOPLAM *9.640,00" — SATIŞ
    // kelimesi icermedigi icin genel desenler yakalayamiyordu. Başlık ile
    // değer ayrı satırlardayken (oncekiUst) de yakalanir.
    if (dokumBaglami) {
      const num = extractNumberFromLine(line)
      if (num > 0) {
        // "x20" / "z20" = "%20"nin OCR hali (X/Z harfi % isaretine benzer)
        if (/20\s*%|%\s*20|\b(?:X|Z)\s?20\b/.test(upperLine)) { if (num > result.satis20) result.satis20 = num }
        else if (/10\s*%|%\s*10|\b(?:X|Z)\s?10\b/.test(upperLine)) { if (num > result.satis10) result.satis10 = num }
        else if (/1\s*%|\b(?:X|Z)\s?1\b/.test(upperLine)) { if (num > result.satis1) result.satis1 = num }
        else if (/0\s*%|\b(?:X|Z)\s?0\b/.test(upperLine)) { if (num > result.satis0) result.satis0 = num }
      }
    }

    // KDV oranli satislar (X10/X20/Z10/Z20/220 SATIS OCR varyantlari dahil)
    if (/SATIŞ.*0\s*%|SATIŞ.*0\s*KDV|0\s*%.*SATIŞ/.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > result.satis0) result.satis0 = num
    }
    else if (/SATIŞ.*1\s*%|SATIŞ.*1\s*KDV|1\s*%.*SATIŞ/.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > result.satis1) result.satis1 = num
    }
    else if (/SATIŞ.*10\s*%|SATIŞ.*10\s*KDV|10\s*%.*SATIŞ|\b(?:X|Z)\s?10\s*SATIŞ|\b10\s*SATIŞ/.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > result.satis10) result.satis10 = num
    }
    else if (/SATIŞ.*20\s*%|SATIŞ.*20\s*KDV|20\s*%.*SATIŞ|\b(?:X|Z)\s?20\s*SATIŞ|\b20\s*SATIŞ|\b220\s*SATIŞ/.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > result.satis20) result.satis20 = num
    }

    // Matrah
    if (/MATRAH/.test(upperLine)) {
      if (/1\s*%/.test(upperLine)) {
        const num = extractNumberFromLine(line)
        if (num > result.matrah1) result.matrah1 = num
      } else if (/10\s*%/.test(upperLine)) {
        const num = extractNumberFromLine(line)
        if (num > result.matrah10) result.matrah10 = num
      } else if (/20\s*%/.test(upperLine)) {
        const num = extractNumberFromLine(line)
        if (num > result.matrah20) result.matrah20 = num
      }
    }

    // KDV (X10/X20/220 KDV OCR varyantlari dahil). Orani okunamayan KDV
    // satirlari kdvBelirsiz'e alinir; eski \b1\b gibi zayif eslesmeler
    // "1.606,66" tutarindaki "1"i %1 sanip yanlis gruba yaziyordu.
    // DÖKÜM satirlari tutar tasidigi icin buradan harictir.
    if (/KDV|VERG[İI]/.test(upperLine) && !upperLine.includes('MATRAH') && !/D[ÖO]K[ÜU]M/.test(upperLine) && !/TOPKDV|KDV\s*TOPLAM|KIMKDV/i.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > 0) {
        if (/\b(?:X|Z)\s?20\s*KDV|\b20\s*KDV|\b220\s*KDV|20\s*%|%\s*20/.test(upperLine)) {
          if (num > result.kdv20) result.kdv20 = num
        } else if (/\b(?:X|Z)\s?10\s*KDV|\b10\s*KDV|10\s*%|%\s*10/.test(upperLine)) {
          if (num > result.kdv10) result.kdv10 = num
        } else if (/1\s*%|%\s*1(?!\d)/.test(upperLine)) {
          if (num > result.kdv1) result.kdv1 = num
        } else if (num > kdvBelirsiz) {
          kdvBelirsiz = num
        }
      }
    }

    // İade
    if (/[İI]ADE/.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > result.iade) result.iade = num
    }
  })

  // Toplam satis belirleme sirasi: net satis > top > brut satis > kdvli satislar toplami
  // (a) Ödeme dengesi: nakit+kredi+havale toplamina en yakin (±%3) TOPLAM adayi
  // (b) Yoksa ödeme satırından (NAKİT/KREDİ KARTI) önceki SON TOPLAM adayı —
  //     market fişlerinde ödeme öncesi son toplam satırı genel toplamdır;
  //     öğe/kümülatif satırlar maksimumu bozabiliyor.
  const odemeDengesi = result.nakit + krediKartiSatiri + kasaKrediToplami + bankaToplami + result.havale
  let seciliTop = 0
  if (odemeDengesi > 0 && toplamAdaylari.length) {
    const yakin = toplamAdaylari.filter(a => Math.abs(a.n - odemeDengesi) / odemeDengesi < 0.03)
    if (yakin.length) seciliTop = Math.max(...yakin.map(a => a.n))
  }
  if (!seciliTop && toplamAdaylari.length) {
    const odemeIdx = lines.findIndex(l => /NAK[Iİ]T|KRED[İI]\s*KART|KASA\s*KRED|BANKA/i.test(String(l).toUpperCase()))
    if (odemeIdx > 0) {
      const oncekiler = toplamAdaylari.filter(a => a.i < odemeIdx)
      if (oncekiler.length) seciliTop = oncekiler[oncekiler.length - 1].n
    }
  }
  if (seciliTop) topSatis = seciliTop
  result.toplamSatis = netSatis || topSatis || brutSatis || (result.satis1 + result.satis10 + result.satis20 + result.satis0)

  // KDV'li satis kategorileri bos ama toplam satis varsa %20 varsayimiyla dagit
  if (result.toplamSatis > 0 && result.satis0 + result.satis1 + result.satis10 + result.satis20 === 0) {
    result.satis20 = result.toplamSatis
    result.kdvOraniVarsayildi = true
  }

  // ===== 2.7.388: CAPRAZ DOGRULAMA / FIS DENGELEME =====
  // Z fisleri daima dengededir: kdv = brüt×oran/(100+oran), brüt = matrah+kdv,
  // nakit+kredi+havale = net satis. OCR bir degeri yanlis okursa (ayrac
  // yutma, 100x olcek) digerlerinden turetilir.
  const y2 = (v) => Math.round(v * 100) / 100
  const odemeler = y2(result.nakit + result.krediKarti + result.havale)

  // KDV/brüt orani saglamasi. oranGercek beklenenin 2 katindan buyukse YA
  // kdv 100x okunmustur YA satis kucuk okunmustur — odemeler hangisi
  // dogruya karar verir (odemeler brüte esittir).
  const oranDuzelt = (satisAlan, kdvAlan, oran) => {
    const satis = result[satisAlan], kdv = result[kdvAlan]
    if (satis <= 0 || kdv <= 0) return
    const beklenen = oran / (100 + oran)
    const oranG = kdv / satis
    if (oranG > beklenen * 2) {
      if (odemeler > 0 && Math.abs(odemeler - satis) <= satis * 0.02) {
        // satis tutarli → kdv 100x okunmus
        result[kdvAlan] = y2(Math.round(kdv) / 100)
      } else {
        // kdv tutarli → brütü kdv'den turet
        result[satisAlan] = y2(kdv * (100 + oran) / oran)
      }
    } else if (oranG < beklenen / 2) {
      if (odemeler > 0 && Math.abs(odemeler - kdv * (100 + oran) / oran) <= kdv * (100 + oran) / oran * 0.02) {
        // odemeler kdv'den turetilen brüte uyuyor → satis buyuk okunmus
        result[satisAlan] = y2(kdv * (100 + oran) / oran)
      } else if (odemeler > 0 && Math.abs(odemeler - satis) <= satis * 0.02) {
        // satis tutarli → kdv eksik okunmus, kalanini turet
        result[kdvAlan] = y2(satis * oran / (100 + oran))
      }
    }
  }
  oranDuzelt('satis20', 'kdv20', 20)
  oranDuzelt('satis10', 'kdv10', 10)
  oranDuzelt('satis1', 'kdv1', 1)

  // Odeme-satis 100x uyumu: satis ve kdv BIRLIKTE 100x okunmussa oran
  // saglamasi yakalayamaz — odemeler (nakit+kredi) karar verir.
  if (odemeler > 0 && result.toplamSatis > 0) {
    const yuzdeBir = result.toplamSatis / 100
    if (Math.abs(odemeler - yuzdeBir) <= yuzdeBir * 0.02) {
      result.satis0 = y2(result.satis0 / 100)
      result.satis1 = y2(result.satis1 / 100)
      result.satis10 = y2(result.satis10 / 100)
      result.satis20 = y2(result.satis20 / 100)
      result.kdv1 = y2(result.kdv1 / 100)
      result.kdv10 = y2(result.kdv10 / 100)
      result.kdv20 = y2(result.kdv20 / 100)
      result.matrah1 = y2(result.matrah1 / 100)
      result.matrah10 = y2(result.matrah10 / 100)
      result.matrah20 = y2(result.matrah20 / 100)
      result.toplamSatis = y2(result.toplamSatis / 100)
    }
  }

  // Odeme tutarlarinda da ayrac yutma olabilir (toplam satisi asamazlar)
  if (result.nakit > result.toplamSatis && result.toplamSatis > 0) result.nakit = Math.round(result.nakit) / 100
  if (result.krediKarti > result.toplamSatis && result.toplamSatis > 0) result.krediKarti = Math.round(result.krediKarti) / 100
  if (result.havale > result.toplamSatis && result.toplamSatis > 0) result.havale = Math.round(result.havale) / 100

  // KDV toplami belirleme
  const kdvToplam = result.kdv1 + result.kdv10 + result.kdv20
  if (topkdv > 0 && kdvToplam === 0) {
    // Tek KDV orani varsa topkdv'yi ona ata
    if (result.satis20 > 0) result.kdv20 = topkdv
    else if (result.satis10 > 0) result.kdv10 = topkdv
    else if (result.satis1 > 0) result.kdv1 = topkdv
    else result.kdv20 = topkdv
  }

  // Orani okunamayan KDV satiri: baskin satis oranina ata
  if (kdvBelirsiz > 0 && result.kdv1 + result.kdv10 + result.kdv20 === 0) {
    if (result.satis20 > 0) result.kdv20 = kdvBelirsiz
    else if (result.satis10 > 0) result.kdv10 = kdvBelirsiz
    else if (result.satis1 > 0) result.kdv1 = kdvBelirsiz
    else result.kdv20 = kdvBelirsiz
  }

  // Ayni hata matrah satirlarinda da olabilir (matrah, satisi asamaz)
  if (result.matrah20 > result.satis20 && result.satis20 > 0) result.matrah20 = Math.round(result.matrah20) / 100
  if (result.matrah10 > result.satis10 && result.satis10 > 0) result.matrah10 = Math.round(result.matrah10) / 100
  if (result.matrah1 > result.satis1 && result.satis1 > 0) result.matrah1 = Math.round(result.matrah1) / 100

  // Vergi dökümünde matrah yazmiyorsa brütten hesapla: matrah = brüt - KDV
  // (örn. 9.640,00 - 1.606,66 = 8.033,34)
  if (result.satis20 > 0 && result.kdv20 > 0 && result.matrah20 === 0) result.matrah20 = y2(result.satis20 - result.kdv20)
  if (result.satis10 > 0 && result.kdv10 > 0 && result.matrah10 === 0) result.matrah10 = y2(result.satis10 - result.kdv10)
  if (result.satis1 > 0 && result.kdv1 > 0 && result.matrah1 === 0) result.matrah1 = y2(result.satis1 - result.kdv1)

  // Odeme dengelemesi: nakit+kredi+havale = net satis olmali. Sapma 2%'den
  // buyukse tek bir odeme yanlis/eksik okunmus demektir; en buyuk odemeyi
  // (kredi karti satirlari en cok hatali okunur) kalan toplamdan turet.
  if (result.toplamSatis > 0 && odemeler > 0) {
    const sapma = Math.abs(odemeler - result.toplamSatis) / result.toplamSatis
    if (sapma > 0.02) {
      const digerOdemeler = y2(result.nakit + result.havale)
      if (digerOdemeler > 0 && digerOdemeler < result.toplamSatis) {
        const turetilmis = y2(result.toplamSatis - digerOdemeler)
        if (turetilmis > 0 && Math.abs(turetilmis - result.krediKarti) > 0.01) {
          result.krediKarti = turetilmis
        }
      } else if (result.krediKarti > 0 && result.krediKarti < result.toplamSatis) {
        const turetilmis = y2(result.toplamSatis - result.krediKarti)
        if (turetilmis > 0 && Math.abs(turetilmis - result.nakit) > 0.01) {
          result.nakit = turetilmis
        }
      }
    }
  }

  // Son saglama: topkdv/kdvBelirsiz atamalarindan SONRA oran tutarliligini
  // bir kez daha dogrula (orn. topkdv kirik okunduysa kdv'yi brütten turet)
  oranDuzelt('satis20', 'kdv20', 20)
  oranDuzelt('satis10', 'kdv10', 10)
  oranDuzelt('satis1', 'kdv1', 1)
  if (result.satis20 > 0 && result.kdv20 > 0 && result.matrah20 === 0) result.matrah20 = y2(result.satis20 - result.kdv20)
  if (result.satis10 > 0 && result.kdv10 > 0 && result.matrah10 === 0) result.matrah10 = y2(result.satis10 - result.kdv10)
  if (result.satis1 > 0 && result.kdv1 > 0 && result.matrah1 === 0) result.matrah1 = y2(result.satis1 - result.kdv1)

  // Güven skoru hesapla
  const filledFields = [
    result.tarih, result.evrakNo,
    result.satis0, result.satis1, result.satis10, result.satis20,
    result.nakit, result.krediKarti,
    result.matrah1, result.matrah10, result.matrah20,
    result.kdv1, result.kdv10, result.kdv20
  ].filter(v => v !== null && v !== 0 && v !== '').length

  result.confidence = Math.min(100, (filledFields / 14) * 100)

  return result
}

/**
 * Bir satırdan sayı değeri çıkarır
 */
function extractNumberFromLine(line) {
  // Satırdaki son sayıyı bul (genellikle tutar satırın sonunda olur).
  // OCR tutar icine bosluk sikistirabilir ("9,640, 00", "4 060,00") — desen
  // bosluklu binlik gruplamayi da kabul eder; ayirac cozumunu
  // parseTurkishNumber yapar. Ayiraclar silinerek normalizasyon YAPILMAZ:
  // "9090,00" gibi degerler "090,00" olarak yanlis eslesiyordu.
  const metin = String(line)
    // Oran tokenlari tutara yapisiyor: "KDV %20 833,33" -> "20 833,33"
    // diye birlesip 20833,33 okunuyordu. %'li/x20/z20 oran ifadeleri
    // cikarildiktan sonra tutar aranir.
    .replace(/\d{1,2}\s*%/g, ' ')
    .replace(/%\s*\d{1,2}\b/g, ' ')
    .replace(/\b(?:X|Z)\s?\d{1,2}\b/gi, ' ')
  const matches = metin.match(/(\d{1,3}(?:[.,\s]\d{3})+[.,]\s?\d{2}|\d+[.,]\s?\d{2})/g)
  if (matches && matches.length > 0) {
    // Son eşleşmeyi al (genellikle toplam tutar)
    return parseTurkishNumber(matches[matches.length - 1])
  }

  // Alternatif: herhangi bir sayı
  const singleMatch = metin.match(/(\d+[.,]?\d*)/)
  if (singleMatch) {
    return parseTurkishNumber(singleMatch[1])
  }

  return 0
}

/**
 * Türkçe formattaki sayiyi parse eder
 */
function parseTurkishNumber(str) {
  if (!str) return 0

  let cleaned = String(str).trim().replace(/\s+/g, '')
  cleaned = cleaned.replace(/[^\d.,]/g, '')
  if (!cleaned) return 0

  const nokta = (cleaned.match(/\./g) || []).length
  const virgul = (cleaned.match(/,/g) || []).length

  if (nokta && virgul) {
    // Hem nokta hem virgul: SON ayirac ondaliktir
    const lastDot = cleaned.lastIndexOf('.')
    const lastComma = cleaned.lastIndexOf(',')

    if (lastComma > lastDot) {
      // 9.640,00 — Turkce
      cleaned = cleaned.replace(/\./g, '').replace(',', '.')
    } else {
      // 1,234.56 — Ingilizce
      cleaned = cleaned.replace(/,/g, '')
    }
  } else if (virgul) {
    const parts = cleaned.split(',')
    if (parts.length === 2 && parts[1].length <= 2) {
      // 1606,66 / 3,5 — ondalik virgul
      cleaned = parts[0] + '.' + parts[1]
    } else if (parts.length >= 3 && parts[parts.length - 1].length === 2) {
      // 9,640,00 / 1,606,66 — OCR binlik ve ondaligi AYNI ayiracla yazdi;
      // son grup 2 hane ise son virgul ondaliktir
      cleaned = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1]
    } else {
      cleaned = cleaned.replace(/,/g, '')
    }
  } else if (nokta) {
    const parts = cleaned.split('.')
    if (parts.length >= 2 && parts[parts.length - 1].length === 3) {
      // 9.640 — nokta binlik ayraici
      cleaned = cleaned.replace(/\./g, '')
    } else if (parts.length >= 2 && parts[parts.length - 1].length === 2) {
      // 9.640.00 / 9640.00 — son grup 2 hane: son nokta ondalik
      // (OCR virgulu nokta olarak okudugunda boyle cikar)
      cleaned = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1]
    }
  }

  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

/**
 * Z raporu verilerini muhasebe kaydina donusturur
 */
export function convertToAccountingEntry(clientType, zData, hesapPlani) {
  const entries = []
  const toplamSatis = zData.satis0 + zData.satis1 + zData.satis10 + zData.satis20
  const toplamKdv = zData.kdv1 + zData.kdv10 + zData.kdv20
  const toplamMatrah = zData.matrah1 + zData.matrah10 + zData.matrah20

  // 0 bolme hatasini onle
  const kdvOrani = toplamSatis > 0 ? toplamKdv / toplamSatis : 0

  if (clientType === 'company') {
    // Sirket - 1. Sinif Defter

    // 1. Nakit satislar
    if (zData.nakit > 0) {
      const nakitKdv = toplamKdv > 0 ? zData.nakit * kdvOrani : 0
      entries.push({
        tarih: zData.tarih,
        evrakNo: zData.evrakNo,
        aciklama: `Nakit satis - Z No: ${zData.evrakNo}`,
        borcHesap: '100',
        borcHesapAdi: 'Kasa',
        alacakHesap: '600',
        alacakHesapAdi: 'Yurtici Satislar',
        tutar: zData.nakit - nakitKdv,
        kdvOrani: null
      })

      if (nakitKdv > 0) {
        entries.push({
          tarih: zData.tarih,
          evrakNo: zData.evrakNo,
          aciklama: `KDV - Z No: ${zData.evrakNo}`,
          borcHesap: '100',
          borcHesapAdi: 'Kasa',
          alacakHesap: '391',
          alacakHesapAdi: 'Hesaplanan KDV',
          tutar: nakitKdv,
          kdvOrani: null
        })
      }
    }

    // 2. Kredi karti satislar
    if (zData.krediKarti > 0) {
      const kkKdv = toplamKdv > 0 ? zData.krediKarti * kdvOrani : 0
      entries.push({
        tarih: zData.tarih,
        evrakNo: zData.evrakNo,
        aciklama: `Kredi karti satis - Z No: ${zData.evrakNo}`,
        borcHesap: '101',
        borcHesapAdi: 'Alinan Cekler',
        alacakHesap: '600',
        alacakHesapAdi: 'Yurtici Satislar',
        tutar: zData.krediKarti - kkKdv,
        kdvOrani: null
      })

      if (kkKdv > 0) {
        entries.push({
          tarih: zData.tarih,
          evrakNo: zData.evrakNo,
          aciklama: `KDV (KK) - Z No: ${zData.evrakNo}`,
          borcHesap: '101',
          borcHesapAdi: 'Alinan Cekler',
          alacakHesap: '391',
          alacakHesapAdi: 'Hesaplanan KDV',
          tutar: kkKdv,
          kdvOrani: null
        })
      }
    }
  } else {
    // 1. Sinif Isletme - Basit usul

    entries.push({
      tarih: zData.tarih,
      evrakNo: zData.evrakNo,
      aciklama: `Gunluk satis - Z No: ${zData.evrakNo}`,
      borcHesap: '100',
      borcHesapAdi: 'Kasa',
      alacakHesap: '600',
      alacakHesapAdi: 'Satis Hasilati',
      tutar: toplamSatis,
      kdvOrani: null
    })
  }

  // KDV detaylari (ayri satirlar)
  if (zData.kdv1 > 0) {
    entries.push({
      tarih: zData.tarih,
      evrakNo: zData.evrakNo,
      aciklama: `KDV %1 - Z No: ${zData.evrakNo}`,
      borcHesap: '391',
      borcHesapAdi: 'Hesaplanan KDV',
      alacakHesap: '600',
      alacakHesapAdi: 'Yurtici Satislar',
      tutar: zData.kdv1,
      kdvOrani: 1
    })
  }

  if (zData.kdv10 > 0) {
    entries.push({
      tarih: zData.tarih,
      evrakNo: zData.evrakNo,
      aciklama: `KDV %10 - Z No: ${zData.evrakNo}`,
      borcHesap: '391',
      borcHesapAdi: 'Hesaplanan KDV',
      alacakHesap: '600',
      alacakHesapAdi: 'Yurtici Satislar',
      tutar: zData.kdv10,
      kdvOrani: 10
    })
  }

  if (zData.kdv20 > 0) {
    entries.push({
      tarih: zData.tarih,
      evrakNo: zData.evrakNo,
      aciklama: `KDV %20 - Z No: ${zData.evrakNo}`,
      borcHesap: '391',
      borcHesapAdi: 'Hesaplanan KDV',
      alacakHesap: '600',
      alacakHesapAdi: 'Yurtici Satislar',
      tutar: zData.kdv20,
      kdvOrani: 20
    })
  }

  return entries
}

/**
 * PDF'in ilk sayfasini canvas'a cizip PNG data URL olarak dondurur.
 * Tesseract PDF okuyamaz; Z raporu / gider fisi PDF'leri once resme
 * cevrilerek ayni OCR hattina verilir.
 */
export async function pdfIlkSayfaResmi(file, olcek = 2) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
    pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default
  }
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: olcek })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas.toDataURL('image/png')
}

// Excel hucre degerini sayiya cevirir ("1.234,56" / "1234.56" / 1234.56)
const excelSayi = (v) => {
  if (typeof v === 'number') return isFinite(v) ? v : 0
  const t = String(v || '').replace(/[^\d.,-]/g, '').trim()
  if (!t) return 0
  if (t.includes(',')) return parseFloat(t.replace(/\./g, '').replace(',', '.')) || 0
  return parseFloat(t) || 0
}

// Basligi normallestirir: turkce karakter -> ascii, bosluk/noktalama sil
const excelAnahtar = (s) => String(s || '')
  .toLocaleLowerCase('tr')
  .replace(/ı/g, 'i').replace(/İ/g, 'i').replace(/ş/g, 's').replace(/Ş/g, 's')
  .replace(/ü/g, 'u').replace(/Ü/g, 'u').replace(/ö/g, 'o').replace(/Ö/g, 'o')
  .replace(/ğ/g, 'g').replace(/Ğ/g, 'g').replace(/ç/g, 'c').replace(/Ç/g, 'c')
  .replace(/[^a-z0-9]/g, '')

/**
 * Z raporu Excel'ini okur. Her satir bir Z raporu / mali hafiza ozetidir.
 * Kabul edilen kolonlar (baslik esnek): Tarih, EvrakNo/ZNo, Satis0/Satis1/
 * Satis10/Satis20 (veya Satis %0...), Nakit, KrediKarti, Havale,
 * Matrah1/10/20, KDV1/10/20, Toplam.
 */
export async function zRaporExcelOku(file) {
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const satirlar = XLSX.utils.sheet_to_json(sheet, { defval: '' })
  if (!satirlar.length) throw new Error('Excel dosyasi bos.')

  const kolonlar = Object.keys(satirlar[0])
  // Esnek esleme: bastan ya da icerme; tamEsle: birebir (satis1/satis10 karismasin)
  const esle = (hedefler) => {
    for (const k of kolonlar) {
      const n = excelAnahtar(k)
      if (hedefler.some(h => n === h || n.startsWith(h))) return k
    }
    return null
  }
  const tamEsle = (hedefler) => {
    for (const k of kolonlar) {
      if (hedefler.includes(excelAnahtar(k))) return k
    }
    return null
  }
  const kolon = {
    tarih: esle(['tarih']),
    evrakNo: esle(['evrakno', 'zno', 'fisno']),
    satis20: tamEsle(['satis20']),
    satis10: tamEsle(['satis10']),
    satis1: tamEsle(['satis1']),
    satis0: tamEsle(['satis0']),
    toplam: esle(['toplam']),
    nakit: esle(['nakit']),
    krediKarti: esle(['kredikart']),
    havale: esle(['havale']),
    matrah20: tamEsle(['matrah20']),
    matrah10: tamEsle(['matrah10']),
    matrah1: tamEsle(['matrah1']),
    kdv20: tamEsle(['kdv20']),
    kdv10: tamEsle(['kdv10']),
    kdv1: tamEsle(['kdv1'])
  }

  const hucreTarih = (v) => {
    if (v instanceof Date && !isNaN(v)) return v.toISOString().split('T')[0]
    const m = String(v || '').match(/(\d{1,4})[.\/-](\d{1,2})[.\/-](\d{2,4})/)
    if (!m) return ''
    let [, a, b, c] = m
    if (c.length === 2) c = '20' + c
    if (a.length === 4) return `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`
    return `${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`
  }

  return satirlar.map((r, i) => {
    const toplam = kolon.toplam ? excelSayi(r[kolon.toplam]) : 0
    const s0 = kolon.satis0 ? excelSayi(r[kolon.satis0]) : 0
    const s1 = kolon.satis1 ? excelSayi(r[kolon.satis1]) : 0
    const s10 = kolon.satis10 ? excelSayi(r[kolon.satis10]) : 0
    const s20 = kolon.satis20 ? excelSayi(r[kolon.satis20]) : 0
    const toplamSatis = toplam || (s0 + s1 + s10 + s20)
    if (!toplamSatis && !kolon.nakit) return null // tamamen bos satir
    return {
      tarih: hucreTarih(kolon.tarih ? r[kolon.tarih] : ''),
      evrakNo: kolon.evrakNo ? String(r[kolon.evrakNo] || '') : null,
      satis0: s0, satis1: s1, satis10: s10, satis20: s20,
      toplamSatis,
      iade: 0,
      nakit: kolon.nakit ? excelSayi(r[kolon.nakit]) : 0,
      krediKarti: kolon.krediKarti ? excelSayi(r[kolon.krediKarti]) : 0,
      havale: kolon.havale ? excelSayi(r[kolon.havale]) : 0,
      matrah1: kolon.matrah1 ? excelSayi(r[kolon.matrah1]) : 0,
      matrah10: kolon.matrah10 ? excelSayi(r[kolon.matrah10]) : 0,
      matrah20: kolon.matrah20 ? excelSayi(r[kolon.matrah20]) : 0,
      kdv1: kolon.kdv1 ? excelSayi(r[kolon.kdv1]) : 0,
      kdv10: kolon.kdv10 ? excelSayi(r[kolon.kdv10]) : 0,
      kdv20: kolon.kdv20 ? excelSayi(r[kolon.kdv20]) : 0,
      _satir: i + 2
    }
  }).filter(Boolean)
}
