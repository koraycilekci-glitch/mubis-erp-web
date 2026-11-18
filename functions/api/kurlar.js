/**
 * Kurlar API (Cloudflare Pages Function)
 * --------------------------------------------------------------------------
 * Ana ekrandaki "Döviz & Altın Bandı" için tek noktadan kur servisi.
 *
 *   GET /api/kurlar  ->  { ok, guncelleme, tcmbTarih, doviz[], altin[] }
 *
 * Neden sunucu tarafı (Function)?
 *  - TCMB (`tcmb.gov.tr/kurlar/today.xml`) tam kur verir ama CORS başlığı
 *    YOKTUR; tarayıcıdan okunamaz. Aynı günün önceki yayını da okunur, böylece
 *    Bülen gecikse bile ekranda "önceki güne göre değişim" görünebilir.
 *  - `api.gold-api.com` CORS verir ama altında YALNIZCA ons/USD vardır.
 *    Gram/çeyrek/yarım/Cumhuriyet altını TRY olarak TCMB dolar kuru ile
 *    HESAPLANIR → ekranda "hesaplanan gösterge" olarak işaretlenir.
 *  - Dolar/TRY yedeği: `open.er-api.com`.
 *
 * Önbellek (izolate içi, dosya sistemi yok):
 *  - TCMB: 10 dk (gün içindeki revizyonları da yakalar)
 *  - Altın: 2 dk (piyasa açıkken hızlı akış)
 *  - Kaynaklarda bir sorun varsa SON BAŞARILI veri sunulmaya devam eder.
 *
 * Yasal not: burada gösterilen değerler bilgilendirme amaçlıdır, yatırım
 * tavsiyesi değildir. Altın TRY fiyatları hesaplanmıştır; resmi kâr-zarar
 * hesabı için mali müşavirinize/masanıza danışın.
 */

const TCMB_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml'
// TCMB'nin yesterday.xml adresi yok (404). Önceki iş gününü tarihli arşivden okuruz.
const TCMB_ARSIV = (d) => {
  const gun = String(d.getUTCDate()).padStart(2, '0')
  const ay = String(d.getUTCMonth() + 1).padStart(2, '0')
  const yil = d.getUTCFullYear()
  return `https://www.tcmb.gov.tr/kurlar/${yil}${ay}/${gun}${ay}${yil}.xml`
}
const ONS_URL = 'https://api.gold-api.com/price/XAU'
const USD_TRY_URL = 'https://open.er-api.com/v6/latest/USD'

const BIR_ONS_GRAM = 31.1034768 // 1 troys ons = 31.1034768 gram

const TCMB_TTL = 10 * 60 * 1000
const ONS_TTL = 2 * 60 * 1000

// Ekranda gösterilecek dövizler (sıra = ekran sırası)
const DOVIZLER = [
  { kod: 'USD', ad: 'ABD Doları', ikon: '💵' },
  { kod: 'EUR', ad: 'Euro', ikon: '💶' },
  { kod: 'GBP', ad: 'İngiliz Sterlini', ikon: '💷' },
  { kod: 'CHF', ad: 'İsviçre Frangı', ikon: '🇨🇭' },
  { kod: 'JPY', ad: 'Japon Yeni (100)', ikon: '🇯🇵' },
  { kod: 'SAR', ad: 'Suudi Riyali', ikon: '🇸🇦' },
]

// Altın çeşitleri: 1 adet karşılığı (gram cinsinden)
const ALTINLAR = [
  { kod: 'gram', ad: 'Gram Altın', ikon: '🪙', gram: 1 },
  { kod: 'ceyrek', ad: "Çeyrek Altın", ikon: '🥉', gram: 3.22580645 }, // 24 ayar çeyrek ≈ 3.226 g
  { kod: 'yarim', ad: 'Yarım Altın', ikon: '🥈', gram: 6.4516129 },
  { kod: 'cumhuriyet', ad: 'Cumhuriyet Altını', ikon: '🥇', gram: 20.16 },
  { kod: 'ons', ad: 'Ons Altın (USD)', ikon: '⚖️', ons: true },
]

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
}

const header = (name, xml) => {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(xml || '')
  return m ? m[1].trim() : ''
}
const attr = (tag, name, xml) => {
  const t = new RegExp(`<${tag}\\b[^>]*>`, 'i').exec(xml || '')
  if (!t) return ''
  const a = new RegExp(`${name}="([^"]*)"`, 'i').exec(t[0])
  return a ? a[1] : ''
}
const attrIn = (name, tagXml) => {
  const a = new RegExp(`${name}="([^"]*)"`, 'i').exec(tagXml || '')
  return a ? a[1] : ''
}
const sayi = (v) => {
  if (v == null) return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const round = (v, basamak = 4) => {
  const n = sayi(v)
  if (n == null) return null
  const f = 10 ** basamak
  return Math.round(n * f) / f
}

// TCMB today.xml -> { tarih, kurlar: { USD: { alis, satis }, ... } }
function tcmbAyristir(xml) {
  if (!xml || xml.length < 200 || /<html/i.test(xml.slice(0, 400))) return null
  const tarih = attr('Tarih_Date', 'Tarih', xml) || null
  const kurlar = {}
  const re = /<Currency\b[^>]*>([\s\S]*?)<\/Currency>/gi
  let m
  while ((m = re.exec(xml))) {
    const block = m[1]
    // CurrencyCode bir ALT ÖĞE değil, <Currency ... CurrencyCode="USD"> attribute'udur.
    const kod = attrIn('CurrencyCode', m[0])
    if (!kod) continue
    const birim = sayi(attrIn('Unit', m[0])) || 1
    const alis = sayi(header('ForexBuying', block)) ?? sayi(header('BanknoteBuying', block))
    const satis = sayi(header('ForexSelling', block)) ?? sayi(header('BanknoteSelling', block))
    if (satis == null && alis == null) continue
    kurlar[kod.toUpperCase()] = {
      alis: alis != null ? alis / birim : null,
      satis: satis != null ? satis / birim : null,
    }
  }
  return Object.keys(kurlar).length ? { tarih, kurlar } : null
}

const hafiza = {
  tcmb: { v: null, at: 0 },
  onceki: { v: null, at: 0 },
  ons: { v: null, at: null, at2: 0 },
  usdtry: { v: null, at: 0 },
  sonBasarili: { v: null, at: 0 },
}

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res.json()
}
async function getText(url) {
  const res = await fetch(url, { headers: { accept: 'application/xml,text/xml,*/*' } })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res.text()
}

// TCMB günlük kur seti (10 dk önbellek) + bir önceki günün seti (değişim için)
async function tcmbSeti(simdi) {
  if (hafiza.tcmb.v && simdi - hafiza.tcmb.at < TCMB_TTL) return hafiza.tcmb.v
  let set = hafiza.tcmb.v // yenileme başarısızsa eskisini koru
  try {
    const parsed = tcmbAyristir(await getText(TCMB_URL))
    if (parsed) set = parsed
  } catch (e) {
    console.warn('[kurlar] tcmb:', e?.message || e)
  }
  if (set) {
    hafiza.tcmb.v = set
    hafiza.tcmb.at = simdi
  }
  return set
}
async function tcmbOnceki(simdi, tcmb) {
  if (hafiza.onceki.v && simdi - hafiza.onceki.at < TCMB_TTL) return hafiza.onceki.v
  let set = hafiza.onceki.v
  // Baz alınacak gün: TCMB bugünün tarihi (hafta sonu/resmi tatilde son yayın).
  let base = new Date()
  if (tcmb?.tarih) {
    const p = String(tcmb.tarih).split('.')
    if (p.length === 3) base = new Date(Date.UTC(+p[2], +p[1] - 1, +p[0]))
  }
  // 10 gün geriye giderek ilk başarılı iş gününü bul (hafta sonu + tatil atlanır).
  for (let i = 1; i <= 10; i++) {
    const aday = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() - i))
    const hafta = aday.getUTCDay()
    if (hafta === 0 || hafta === 6) continue
    try {
      const parsed = tcmbAyristir(await getText(TCMB_ARSIV(aday)))
      if (parsed) { set = parsed; break }
    } catch (e) {
      // tatil/absent dosya: bir önceki güne geç
    }
  }
  if (set) {
    hafiza.onceki.v = set
    hafiza.onceki.at = simdi
  }
  return set
}

// USD/TRY: önce TCMB, yoksa open.er-api.com
async function usdTry(tcmb, simdi) {
  const tcmbSatis = tcmb?.kurlar?.USD?.satis ?? tcmb?.kurlar?.USD?.alis ?? null
  if (tcmbSatis) return { kur: tcmbSatis, kaynak: 'TCMB' }
  if (hafiza.usdtry.v && simdi - hafiza.usdtry.at < TCMB_TTL) return { kur: hafiza.usdtry.v, kaynak: 'er-api' }
  try {
    const j = await getJson(USD_TRY_URL)
    const k = sayi(j?.rates?.TRY)
    if (k) {
      hafiza.usdtry.v = k
      hafiza.usdtry.at = simdi
      return { kur: k, kaynak: 'er-api' }
    }
  } catch (e) {
    console.warn('[kurlar] usd-try:', e?.message || e)
  }
  return { kur: hafiza.usdtry.v, kaynak: hafiza.usdtry.v ? 'er-api (önbellek)' : null }
}

// Altın ons/USD (2 dk önbellek)
async function onsUsd(simdi) {
  if (hafiza.ons.v != null && simdi - hafiza.ons.at2 < ONS_TTL) return hafiza.ons
  let o = hafiza.ons
  try {
    const j = await getJson(ONS_URL)
    const fiyat = sayi(j?.price)
    if (fiyat) {
      // createAt alanı örnek: "2026-11-17T20:23:50Z"
      const guncelleme = j?.createAt || j?.updatedAt || null
      const degisti = hafiza.ons.v != null && hafiza.ons.v !== fiyat
      o = { v: fiyat, at: guncelleme, at2: simdi, degisti }
      hafiza.ons = o
    }
  } catch (e) {
    console.warn('[kurlar] altin-ons:', e?.message || e)
  }
  return hafiza.ons
}

const yuzdeDegisim = (yeni, eski) => {
  if (yeni == null || eski == null || !eski) return null
  return round(((yeni - eski) / eski) * 100, 2)
}

async function kurlarGetir() {
  const simdi = Date.now()
  const tcmb = await tcmbSeti(simdi)
  const [onceki, onsKutu] = await Promise.all([tcmbOnceki(simdi, tcmb), onsUsd(simdi)])
  const usd = await usdTry(tcmb, simdi)
  const ons = onsKutu?.v ?? null

  const doviz = DOVIZLER.map((d) => {
    const bugun = tcmb?.kurlar?.[d.kod] || null
    const dun = onceki?.kurlar?.[d.kod] || null
    const satis = bugun?.satis ?? bugun?.alis ?? null
    const dunSatis = dun?.satis ?? dun?.alis ?? null
    return {
      kod: d.kod,
      ad: d.ad,
      ikon: d.ikon,
      alis: round(bugun?.alis, 4),
      satis: round(satis, 4),
      degisim: yuzdeDegisim(satis, dunSatis),
    }
  }).filter((d) => d.satis != null || d.alis != null)

  const gramTl = ons != null && usd.kur ? (ons / BIR_ONS_GRAM) * usd.kur : null
  const altin = ALTINLAR.map((a) => {
    const fiyat = a.ons ? ons : (gramTl != null ? gramTl * a.gram : null)
    return {
      kod: a.kod,
      ad: a.ad,
      ikon: a.ikon,
      fiyat: round(fiyat, a.ons ? 2 : 2),
      para: a.ons ? 'USD' : 'TRY',
      hesaplanan: !a.ons, // TCMB dolar kuru ile hesaplandı (resmi kâr-zarar hesabı değil)
      degisim: a.ons ? null : null,
    }
  }).filter((a) => a.fiyat != null)

  const varMi = doviz.length > 0 || altin.length > 0
  const govde = {
    ok: varMi,
    guncelleme: new Date().toISOString(),
    tcmbTarih: tcmb?.tarih || null,
    onsGuncelleme: onsKutu?.at || null,
    usdKaynak: usd.kaynak,
    doviz,
    altin,
    not: 'Döviz kurları TCMB, altın TRY değerleri ons altın × TCMB dolar kuru ile hesaplanan göstergedir.',
  }

  if (varMi) {
    hafiza.sonBasarili.v = govde
    hafiza.sonBasarili.at = simdi
  }
  return varMi ? govde : (hafiza.sonBasarili.v || govde)
}

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function onRequestGet() {
  try {
    return await json(await kurlarGetir())
  } catch (err) {
    console.error('[kurlar] beklemedik hata:', err)
    return json({ ok: false, hata: String(err?.message || err), doviz: [], altin: [] }, 502)
  }
}
