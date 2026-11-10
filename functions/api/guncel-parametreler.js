// MUBIS - Guncel yasal parametreler (Cloudflare Pages Function)
// GET /api/guncel-parametreler  (kidem tavani + asgari ucret, kaynak sayfalardan)
import { json, fetchText } from './_lib.js'

const KIDEM_TAVANI_KAYNAKLARI = [
  'https://www.verginet.net/dtt/1/kidem-tazminati-tavani.aspx',
  'https://www.muhasebetr.com/kidem-tazminati-tavani/'
]

const ASGARI_UCRET_KAYNAKLARI = [
  'https://www.muhasebetr.com/asgari-ucret/'
]

function gpTrNumber(value) {
  const n = Number(String(value || '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

function gpDecodeEntities(html) {
  return String(html || '')
    .replace(/&uuml;|&#252;|&#xFC;/gi, 'ü')
    .replace(/&Uuml;|&#220;|&#xDC;/gi, 'Ü')
    .replace(/&ouml;|&#246;|&#xF6;/gi, 'ö')
    .replace(/&Ouml;|&#214;|&#xD6;/gi, 'Ö')
    .replace(/&ccedil;|&#231;|&#xE7;/gi, 'ç')
    .replace(/&Ccedil;|&#199;|&#xC7;/gi, 'Ç')
    .replace(/&gbreve;|&#287;/gi, 'ğ')
    .replace(/&Gbreve;|&#286;/gi, 'Ğ')
    .replace(/&#305;|&#x131;/gi, 'ı')
    .replace(/&#304;|&#x130;/gi, 'İ')
    .replace(/&scedil;|&#351;/gi, 'ş')
    .replace(/&Scedil;|&#350;/gi, 'Ş')
    .replace(/&nbsp;|&#160;/gi, ' ')
}

function gpParseKidemTavani(html) {
  const text = gpDecodeEntities(html)
  const out = {}
  const re = /01\s*(?:<[^>]*>\s*)*(Ocak|Temmuz)(?:<[^>]*>\s*)*(\d{4})[\s\S]{0,250}?([\d.]+,\d{2})\s*(?:<[^>]*>\s*)*TL/gi
  let match
  while ((match = re.exec(text)) !== null) {
    const donem = /ocak/i.test(match[1]) ? 1 : 2
    const tutar = gpTrNumber(match[3])
    if (tutar) out[`${match[2]}-${donem}`] = tutar
  }
  return out
}

function gpParseAsgariUcret(html) {
  const text = gpDecodeEntities(html)
  const out = {}
  const brutRe = /Asgari\s*Ucret\s*(\d{4})\s*Brut\s*Ucret\s*\(Ayl[ıi]k\)[\s\S]{0,90}?([\d.]+,\d{2})/gi
  const netRe = /Asgari\s*Ucret\s*(\d{4})\s*Net\s*Ucret\s*\(Ayl[ıi]k\)[\s\S]{0,90}?([\d.]+,\d{2})/gi
  let match
  while ((match = brutRe.exec(text)) !== null) {
    const tutar = gpTrNumber(match[2])
    if (tutar) out[match[1]] = { ...(out[match[1]] || {}), brut: tutar }
  }
  while ((match = netRe.exec(text)) !== null) {
    const tutar = gpTrNumber(match[2])
    if (tutar) out[match[1]] = { ...(out[match[1]] || {}), net: tutar }
  }
  return out
}

export async function onRequestGet() {
  const sonuc = { kidemTavani: null, asgariUcret: null, kaynaklar: [] }

  for (const url of KIDEM_TAVANI_KAYNAKLARI) {
    try {
      const html = await fetchText(url)
      const map = gpParseKidemTavani(html)
      if (Object.keys(map).length >= 3) {
        sonuc.kidemTavani = map
        sonuc.kaynaklar.push(url)
        break
      }
    } catch { /* sonraki kaynak denenir */ }
  }

  for (const url of ASGARI_UCRET_KAYNAKLARI) {
    try {
      const html = await fetchText(url)
      const map = gpParseAsgariUcret(html)
      if (Object.keys(map).length >= 1) {
        sonuc.asgariUcret = map
        sonuc.kaynaklar.push(url)
        break
      }
    } catch { /* sonraki kaynak denenir */ }
  }

  return json({ ...sonuc, alinmaTarihi: new Date().toISOString() }, 200, { 'Cache-Control': 's-maxage=21600, stale-while-revalidate=86400' })
}
