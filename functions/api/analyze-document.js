// ===========================================================
// MUBIS Document Intelligence - Cloudflare Pages Function
// /api/analyze-document
//
// Katmanlar:
// 1) Tarayicidan gelen metin (pdfText) -> kural motoru (regex)
// 2) Tarayici metin vermediyse hafif PDF inflate denemesi
// 3) Yetersizse 422 + PDF_TEXT_GEREKLI -> tarayici fallback
//    (engine zaten pdfjs ile metin cikarip yeniden POST eder)
//
// Not: Vercel handler'inin (api/analyze-document.mjs) kural motoru
// birebir tasindi; AI fallback (Groq) kaldirildi.
// ===========================================================

const analysisCache = new Map()
const analysisInFlight = new Map()

function decodePdfString(raw) {
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (c === '\\' && i + 1 < raw.length) {
      const n = raw[++i]
      if (n >= '0' && n <= '7') {
        let oct = n
        while (oct.length < 3 && i + 1 < raw.length && raw[i + 1] >= '0' && raw[i + 1] <= '7') oct += raw[++i]
        out += String.fromCharCode(parseInt(oct, 8))
      } else if (n === 'n' || n === 'r' || n === 't') out += ' '
      else out += n
    } else out += c
  }
  return out
}

function metinCikar(content) {
  const parts = []
  const re = /(?:\((?:\\[\s\S]|[^\\()])*?\)\s*(?:Tj|TJ)|<[0-9A-Fa-f\s]+>\s*(?:Tj|TJ)|\[(?:[\s\S]{0,4000}?)]\s*TJ)/g
  for (const m of content.match(re) || []) {
    for (const p of m.match(/\((?:\\[\s\S]|[^\\()])*?\)/g) || []) {
      parts.push(decodePdfString(p.slice(1, -1)))
    }
  }
  return parts.join(' ')
}

async function inflate(zlibBytes) {
  const ds = new DecompressionStream('deflate')
  const stream = new Blob([zlibBytes]).stream().pipeThrough(ds)
  const buf = await new Response(stream).arrayBuffer()
  return new TextDecoder('latin1').decode(buf)
}

// Hafif PDF metin denemesi (CID fontlu belgelerde yetmez; tarayici
// fallback'ine birakilir)
async function hafifPdfMetin(arrayBuffer) {
  let latin1 = ''
  const bytes = new Uint8Array(arrayBuffer)
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    latin1 += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  let tum = ''
  const re = /stream\r?\n/g
  let m
  let say = 0
  while ((m = re.exec(latin1)) && say < 40) {
    const bas = m.index + m[0].length
    const son = latin1.indexOf('endstream', bas)
    if (son < 0) break
    try {
      const ham = latin1.substring(bas, son)
      const b = new Uint8Array(ham.length)
      for (let i = 0; i < ham.length; i++) b[i] = ham.charCodeAt(i) & 0xFF
      const acik = await inflate(b)
      if (/TJ|Tj/.test(acik)) { tum += ' ' + metinCikar(acik); say++ }
    } catch (e) { /* flate olmayan akislari atla */ }
  }
  return tum.replace(/\s+/g, ' ').trim()
}

// ===========================================================
// KURAL MOTORU (Vercel handler'inden birebir)
// ===========================================================

function parseTurkishAmount(str) {
  if (!str) return 0
  const cleaned = String(str)
    .replace(/[^\d.,-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

function detectTaxType(text) {
  if (text.includes("KATMA DEĞER VERGİSİ") || text.includes("KDV")) return "KDV"
  if (text.includes("MUHTASAR")) return "MUHTASAR"
  if (text.includes("SGK") || text.includes("SOSYAL GÜVENLİK")) return "SGK"
  if (text.includes("KURUMLAR VERGİSİ")) return "KURUMLAR"
  if (text.includes("GELİR VERGİSİ")) return "GELIR"
  if (text.includes("GEÇİCİ VERGİ")) return "GECICI"
  if (text.includes("DAMGA VERGİSİ")) return "DAMGA"
  return "DIGER"
}

// Metindeki para degerleri: a + b = c eslesmesi (SGK fiislerinde
// "ödenecek = net prim + işsizlik" seklinde dogrulanabilir)
function toplamAbc(metin) {
  const degerler = [...metin.matchAll(/\d{1,3}(?:\.\d{3})*,\d{2}/g)]
    .map(x => parseTurkishAmount(x[0]))
    .filter(n => n > 0 && n < 100000000)
  for (let i = degerler.length - 1; i >= 2; i--) {
    const c = degerler[i]
    for (let j = 0; j < i; j++) {
      const a = degerler[j]
      const b = +(c - a).toFixed(2)
      if (b > 0 && degerler.includes(b) && degerler.indexOf(b) !== j) return c
    }
  }
  return 0
}

function parseTahakkukRegex(text, taxType) {
  const result = { success: true, document_type: "TAHAKKUK", tax_type: taxType, period: "", amount: 0, tax_base: 0, due_date: "", company: "", vkn: "", accrual_no: "" }
  const period = text.match(/20\d\d\s*\/\s*\d\d/)
  if (period) result.period = period[0].replace(/\s/g, "")
  const totalPatterns = [
    /TOPLAM\s+ÖDENECEK[\s\S]{0,40}?(\d{1,3}(?:\.\d{3})*,\d{2})/i,
    /ÖDENECEK\s+TUTAR[\s\S]{0,40}?(\d{1,3}(?:\.\d{3})*,\d{2})/i,
    /YATIRILMASI\s+GEREKEN[\s\S]{0,40}?(\d{1,3}(?:\.\d{3})*,\d{2})/i,
    /GENEL\s+TOPLAM[\s\S]{0,40}?(\d{1,3}(?:\.\d{3})*,\d{2})/i,
    // Tahakkuk fisi tablosunda "5035 TOPLAM 791,00" seklinde biter
    /TOPLAM\s*(?:\d{4})?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i
  ]
  for (const pattern of totalPatterns) {
    const m = text.match(pattern)
    if (m) { result.amount = parseTurkishAmount(m[1]); break }
  }
  const taxBase = text.match(/VERGİ\s+ASLI[\s\S]{0,40}?(\d{1,3}(?:\.\d{3})*,\d{2})/i)
  if (taxBase) result.tax_base = parseTurkishAmount(taxBase[1])
  const due = text.match(/(\d{2})[./](\d{2})[./](20\d\d)/)
  if (due) result.due_date = `${due[3]}-${due[2]}-${due[1]}`
  const vkn = text.match(/\b\d{10}\b/)
  if (vkn) result.vkn = vkn[0]
  const tah = text.match(/TAHAKKUK\s*NO[: ]*(\d+)/i)
  if (tah) result.accrual_no = tah[1]
  // Dijital Vergi Dairesi tahakkuk (belge) numarasi fiste etiketsiz yazilir:
  // "2026081801F6h0000047" (tarih + makina kodu + sira). "Belge Numarasi ile
  // Odeme" ekranina girilecek numara budur.
  if (!result.accrual_no) {
    const dvs = text.match(/\b20\d{2}[01]\d[0-3]\d\d{2}[A-Za-z][0-9A-Za-z]{1,4}\d{6,8}\b/)
    if (dvs) result.accrual_no = dvs[0]
  }
  // Firmanin en uzun unvan satiri (uzunluga gore)
  if (!result.company) {
    const unvan = text.match(/(?:MÜKELLEF|UNVAN|ÜNVAN)[\s:]+(.+)/i)
    if (unvan) result.company = unvan[1].trim().substring(0, 120)
  }
  // Toplam bulunamadiysa dogrulanabilir eslesme (a + b = c)
  if (result.amount === 0) {
    result.amount = toplamAbc(text)
  }
  if (result.amount === 0 && result.tax_base > 0) result.amount = result.tax_base
  return result
}

function parseSGKRegex(text) {
  const result = { success: true, document_type: "TAHAKKUK", tax_type: "SGK", period: "", amount: 0, tax_base: 0, due_date: "", company: "", vkn: "", accrual_no: "" }
  const period = text.match(/(20\d\d)\s*[\/.]\s*(\d{2})/)
  if (period) result.period = `${period[1]}/${period[2]}`
  else {
    const p2 = text.match(/(\d{2})\s*[\/.]\s*(20\d\d)/)
    if (p2) result.period = `${p2[2]}/${p2[1]}`
  }
  const toplamPatterns = [
    /TAHAKKUK\s*TUTARI[\s\S]{0,50}?(\d{1,3}(?:\.\d{3})*,\d{2})/i,
    /ÖDENECEK\s*TUTAR[\s\S]{0,50}?(\d{1,3}(?:\.\d{3})*,\d{2})/i,
    /TOPLAM\s*BOR[CÇ][\s\S]{0,50}?(\d{1,3}(?:\.\d{3})*,\d{2})/i,
    /GENEL\s*TOPLAM[\s\S]{0,50}?(\d{1,3}(?:\.\d{3})*,\d{2})/i,
    /TOPLAM[\s\S]{0,30}?(\d{1,3}(?:\.\d{3})*,\d{2})/i
  ]
  for (const pattern of toplamPatterns) {
    const m = text.match(pattern)
    if (m) { result.amount = parseTurkishAmount(m[1]); break }
  }
  const due = text.match(/(\d{2})[.\/](\d{2})[.\/](20\d\d)/)
  if (due) result.due_date = `${due[3]}-${due[2]}-${due[1]}`
  const belge = text.match(/(?:BELGE|TAHAKKUK)\s*NO[: ]*([\w]+)/i)
  if (belge) result.accrual_no = belge[1]
  // Not: SGK odemesi e-Devlet uzerinden yapilir; tahakkuk numarasi gerekmez.
  const vkn = text.match(/\b\d{10,11}\b/)
  if (vkn) result.vkn = vkn[0]
  // Toplam bulunamadiysa dogrulanabilir eslesme: "ödenecek = net prim +
  // işsizlik" (a + b = c). Son c ödenecek tutardir. Prime esas kazanç
  // genellikle en buyuk degerdir ve ASLA dogrudan alinmaz.
  if (result.amount === 0) {
    result.amount = toplamAbc(text)
  }
  return result
}

function parseBelge(metin) {
  const buyuk = metin.toUpperCase()
  const subtype = detectTaxType(buyuk)
  return subtype === 'SGK' ? parseSGKRegex(metin) : parseTahakkukRegex(metin, subtype)
}

function hataSonuc(mesaj) {
  return {
    success: false,
    error: mesaj || 'Belge analiz edilemedi',
    document_type: 'BILINMIYOR',
    tax_type: '',
    period: '',
    amount: 0,
    tax_base: 0,
    due_date: '',
    company: '',
    vkn: '',
    accrual_no: ''
  }
}

export async function onRequest(context) {
  const { request } = context

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
    })
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method Not Allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  }

  let girdi
  try {
    girdi = await request.json()
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: 'Geçersiz istek gövdesi' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const { pdfUrl, pdfText } = girdi || {}
  if (!pdfUrl) {
    return new Response(JSON.stringify({ success: false, error: 'pdfUrl gerekli' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  if (analysisCache.has(pdfUrl)) {
    return new Response(JSON.stringify(analysisCache.get(pdfUrl)), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  if (analysisInFlight.has(pdfUrl)) {
    const cached = await analysisInFlight.get(pdfUrl)
    return new Response(JSON.stringify(cached), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  const promise = runAnalysis(pdfUrl, pdfText)
  analysisInFlight.set(pdfUrl, promise)

  try {
    const result = await promise
    if (result.success) {
      analysisCache.set(pdfUrl, result)
    }
    return new Response(JSON.stringify(result), { status: result.success ? 200 : 422, headers: { 'Content-Type': 'application/json' } })
  } finally {
    analysisInFlight.delete(pdfUrl)
  }
}

async function runAnalysis(pdfUrl, pdfText = '') {
  let metin = (pdfText || '').replace(/\s+/g, ' ').trim()

  // 1) Tarayicidan gelen metin yeterli mi?
  if (metin.length < 40) {
    // 2) Hafif inflate denemesi
    try {
      const response = await fetch(pdfUrl)
      if (response.ok) {
        const ab = await response.arrayBuffer()
        metin = await hafifPdfMetin(ab)
      }
    } catch (e) { /* indirme hatasi asagida raporlanir */ }
  }

  if (metin.length < 40) {
    const s = hataSonuc('PDF metni sunucuda çıkarılamadı; tarayıcıdan tekrar deneyin')
    s.code = 'PDF_TEXT_GEREKLI'
    return s
  }

  try {
    const sonuc = parseBelge(metin)
    sonuc.raw_text = metin.substring(0, 4000)
    if (!sonuc.amount || sonuc.amount <= 0) {
      return { ...sonuc, success: false, error: 'Tahakkuk tutarı belgeden okunamadı' }
    }
    return sonuc
  } catch (err) {
    return hataSonuc('Analiz hatası: ' + (err && err.message))
  }
}
