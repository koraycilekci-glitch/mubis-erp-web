// Resmi gorunumlu fatura HTML olusturma (UBL -> gorunum)
// Yardimci programin PDF ciktisiyla ayni tasarim: A4 resmi fatura gorunumu.
// Yardimci programdan yuklenen gercek PDF'ler de iframe/window ile acilir;
// bu HTML yardimci PDF'i olmayan eski kayitlar icin birebir gorunum verir.

const tl = (x) => (Number(x) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function trTarihFatura(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return String(iso || '')
  const aylar = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
  return `${m[3]} ${aylar[parseInt(m[2], 10) - 1]} ${m[1]}`
}

export function ublAyikla(xml) {
  const xmltext = String(xml || '')
  const blok = (ad) => {
    const m = xmltext.match(new RegExp(`<cac:${ad}>[\\s\\S]*?</cac:${ad}>`))
    return m ? m[0] : ''
  }
  const deger = (kaynak, ad) => {
    const m = kaynak.match(new RegExp(`<cbc:${ad}[^>]*>([^<]+)</cbc:${ad}>`))
    return m ? m[1].trim() : ''
  }
  const para = (kaynak, ad) => {
    const m = kaynak.match(new RegExp(`<cbc:${ad}[^>]*currencyID="([^"]*)"[^>]*>([^<]+)</cbc:${ad}>`))
      || kaynak.match(new RegExp(`<cbc:${ad}[^>]*>([^<]+)</cbc:${ad}>`))
    return m ? (m.length > 2 ? { deger: parseFloat(m[2]) || 0, kur: m[1] } : { deger: parseFloat(m[1]) || 0, kur: 'TRY' }) : null
  }
  const kisi = (ad) => {
    const b = blok(ad)
    if (!b) return { vkn: '', unvan: '' }
    const cid = b.match(/<cbc:CompanyID[^>]*>([^<]+)<\/cbc:CompanyID>/)
    const kn = b.match(/<cbc:RegistrationName[^>]*>([^<]+)<\/cbc:RegistrationName>/)
    const pn = b.match(/<cbc:Name[^>]*>([^<]+)<\/cbc:Name>/)
    const vkn = cid ? cid[1].trim() : ''
    const rakam = vkn.replace(/\D/g, '')
    return { vkn: rakam || vkn, unvan: kn ? kn[1].trim() : (pn ? pn[1].trim() : '') }
  }
  const kurBlok = xmltext.match(/<cac:(?:Payment|Pricing|Tax)ExchangeRate>[\s\S]*?<\/cac:(?:Payment|Pricing|Tax)ExchangeRate>/)
  const kurSayi = (() => {
    if (!kurBlok) return null
    const m = kurBlok[0].match(/<cbc:CalculationRate[^>]*>([^<]+)<\/cbc:CalculationRate>/)
    return m ? (parseFloat(m[1].replace(',', '.')) || null) : null
  })()
  const pm = xmltext.match(/<cac:PaymentExchangeRate>[\s\S]*?<cbc:PayableAmount[^>]*>([^<]+)<\/cbc:PayableAmount>[\s\S]*?<\/cac:PaymentExchangeRate>/)
    || xmltext.match(/<cac:TaxExchangeRate>[\s\S]*?<cbc:PayableAmount[^>]*>([^<]+)<\/cbc:PayableAmount>[\s\S]*?<\/cac:TaxExchangeRate>/)
  const taxTotal = xmltext.match(/<cbc:TaxTotal>[\s\S]*?<cbc:TaxAmount[^>]*currencyID="([^"]*)"[^>]*>([^<]+)<\/cbc:TaxAmount>[\s\S]*?<\/cbc:TaxTotal>/)
  const toplamlar = blok('LegalMonetaryTotal')
  const kdvHaric = para(toplamlar, 'TaxExclusiveAmount')
  const kdvDahil = para(toplamlar, 'TaxInclusiveAmount')
  const odenen = para(toplamlar, 'PayableAmount')
  const siparis = para(toplamlar, 'LineExtensionAmount')
  return {
    faturaNo: deger(xmltext, 'ID') || '',
    uuid: deger(xmltext, 'UUID') || '',
    tarih: deger(xmltext, 'IssueDate') || '',
    profil: deger(xmltext, 'ProfileID') || '',
    tip: deger(xmltext, 'InvoiceTypeCode') || '',
    paraKur: (odenen && odenen.kur) || (kdvDahil && kdvDahil.kur) || 'TRY',
    donem: (() => { const m = xmltext.match(/<cbc:StartDate[^>]*>([^<]+)<\/cbc:StartDate>/); return m ? m[1].trim() : '' })(),
    kur: kurSayi,
    satici: kisi('AccountingSupplierParty'),
    alici: kisi('AccountingCustomerParty'),
    satirlar: (xmltext.match(/<cac:InvoiceLine>[\s\S]*?<\/cac:InvoiceLine>/g) || []).map(l => {
      const ad = l.match(/<cbc:Name[^>]*>([^<]+)<\/cbc:Name>/)
      const mik = l.match(/<cbc:InvoicedQuantity[^>]*>([^<]+)<\/cbc:InvoicedQuantity>/)
      const satir = para(l, 'LineExtensionAmount')
      const fiyat = l.match(/<cbc:PriceAmount[^>]*>([^<]+)<\/cbc:PriceAmount>/)
      const yuzde = l.match(/<cbc:Percent[^>]*>([^<]+)<\/cbc:Percent>/)
      return {
        ad: ad ? ad[1].trim() : '',
        miktar: mik ? (parseFloat(mik[1].replace(',', '.')) || 0) : 0,
        satirTutar: satir ? satir.deger : 0,
        fiyat: fiyat ? (parseFloat(fiyat[1].replace(',', '.')) || 0) : 0,
        kdvYuzde: yuzde ? (parseFloat(yuzde[1].replace(',', '.')) || 0) : 0
      }
    }),
    matrah: kdvHaric ? kdvHaric.deger : (siparis ? siparis.deger : 0),
    toplam: kdvDahil ? kdvDahil.deger : (odenen ? odenen.deger : 0),
    kdv: taxTotal ? (parseFloat(taxTotal[2]) || 0) : 0,
    odenenTl: pm ? (parseFloat(pm[1].replace(',', '.')) || null) : null
  }
}

export function faturaHtmlOlustur(ay) {
  const s = ay.satici, a = ay.alici
  const tlKur = ay.kur || null
  const kurSatiri = tlKur ? `<div class="kur">Kur: ${tlKur.toLocaleString('tr-TR', { maximumFractionDigits: 4 })} ${ay.paraKur}/TRY</div>` : ''
  const tlToplam = (ay.odenenTl != null && tlKur) ? ay.odenenTl : (tlKur ? (ay.toplam * tlKur) : null)
  const kurTablosu = (tlKur && tlToplam != null)
    ? `<table class="toplar"><tr class="satir"><td>Matrah (${ay.paraKur})</td><td>${tl(ay.matrah)}</td></tr><tr class="satir"><td>KDV (${ay.paraKur})</td><td>${tl(ay.kdv)}</td></tr><tr class="satir"><td>Toplam (${ay.paraKur})</td><td>${tl(ay.toplam)}</td></tr><tr class="son"><td>Toplam (TRY)</td><td>${tl(tlToplam)}</td></tr></table>`
    : `<table class="toplar"><tr class="satir"><td>Matrah</td><td>${tl(ay.matrah)} ${ay.paraKur}</td></tr><tr class="satir"><td>KDV</td><td>${tl(ay.kdv)} ${ay.paraKur}</td></tr><tr class="son"><td>Genel Toplam</td><td>${tl(ay.toplam)} ${ay.paraKur}</td></tr></table>`
  const satirlar = (ay.satirlar && ay.satirlar.length ? ay.satirlar : [{ ad: '(satır bilgisi belirtilmemiş)', miktar: 0, satirTutar: ay.matrah, fiyat: 0, kdvYuzde: 0 }])
    .map(l => `<tr><td>${l.ad}</td><td class="c">${l.miktar}</td><td class="c">${l.kdvYuzde ? l.kdvYuzde + '%' : ''}</td><td class="r">${tl(l.fiyat)}</td><td class="r">${tl(l.satirTutar)}</td></tr>`)
    .join('')
  const kvkk = ay.tip === 'ISTISNA' ? '(İstisna)' : ''
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>e-Fatura ${ay.faturaNo}</title>
<style>
  @page { size: A4; margin: 0 }
  * { box-sizing: border-box; margin: 0; padding: 0 }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; background: #e5e7eb; }
  .sayfa { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 14mm 13mm; background: #fff; position: relative; }
  .ust { display: flex; justify-content: space-between; border-bottom: 3px solid #111827; padding-bottom: 10px; margin-bottom: 14px }
  .marka { font-size: 26px; font-weight: 800; letter-spacing: 1px }
  .marka span { color: #b45309 }
  .etiket { margin-top: 4px; font-size: 10px; color: #6b7280; letter-spacing: 2px; text-transform: uppercase }
  .kutu { border: 1.5px solid #111827; padding: 8px 12px; text-align: right; min-width: 170px }
  .kutu .no { font-size: 12px; color: #6b7280 }
  .kutu .d { font-size: 15px; font-weight: 700 }
  .taraflar { display: flex; gap: 12px; margin-bottom: 14px }
  .taraf { flex: 1; border: 1px solid #d1d5db; border-radius: 6px; padding: 10px 12px }
  .taraf h3 { font-size: 10px; letter-spacing: 1px; color: #6b7280; text-transform: uppercase; margin-bottom: 6px }
  .taraf .u { font-weight: 700; font-size: 14px; margin-bottom: 3px }
  .taraf .v { font-size: 12px; color: #374151 }
  .bilgi { display: flex; gap: 12px; margin-bottom: 14px; font-size: 11px }
  .bilgi .b { flex: 1; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 6px 10px }
  .bilgi .b em { display: block; color: #6b7280; font-style: normal; font-size: 9px; letter-spacing: 1px; text-transform: uppercase }
  table.ustlar { width: 100%; border-collapse: collapse; font-size: 11.5px }
  table.ustlar th { background: #111827; color: #fff; padding: 6px 8px; text-align: left; font-size: 10px; letter-spacing: 1px; text-transform: uppercase }
  table.ustlar td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb }
  table.ustlar .r { text-align: right } table.ustlar .c { text-align: center }
  .sonlar { display: flex; justify-content: flex-end; margin-top: 12px }
  table.toplar { border-collapse: collapse; font-size: 12px; min-width: 260px }
  table.toplar td { padding: 5px 10px; border: 1px solid #d1d5db }
  table.toplar tr.satir td { background: #f9fafb }
  table.toplar tr.son td { background: #111827; color: #fff; font-weight: 800 }
  table.toplar td:last-child { text-align: right; font-variant-numeric: tabular-nums }
  .kur { font-size: 10px; color: #6b7280; text-align: right; margin-top: 4px }
  .not { margin-top: 18px; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px }
  .imza { margin-top: 40px; display: flex; justify-content: space-between; font-size: 11px }
  .imza .k { width: 40%; text-align: center; color: #6b7280 }
  .imza .cizgi { border-top: 1px solid #9ca3af; margin-top: 28px; padding-top: 4px }
  .yazdir { position: fixed; top: 10px; right: 14px; padding: 8px 18px; background: #111827; color: #fff; border: 0; border-radius: 6px; font-size: 13px; cursor: pointer }
  @media print { .yazdir { display: none } body { background: #fff } .sayfa { width: auto; padding: 0 10mm } }
</style></head>
<body>
<button class="yazdir" onclick="window.print()">Yazdır / PDF Kaydet</button>
<div class="sayfa">
  <div class="ust">
    <div>
      <div class="marka">MUB<span>i</span>S</div>
      <div class="etiket">e-Fatura / e-Arşiv Fatura</div>
    </div>
    <div class="kutu">
      <div class="no">FATURA NO</div>
      <div class="d">${ay.faturaNo}</div>
      ${ay.uuid ? `<div class="no" style="margin-top:2px">UUID: ${ay.uuid.substring(0, 18)}…</div>` : ''}
    </div>
  </div>
  <div class="taraflar">
    <div class="taraf">
      <h3>Satıcı</h3>
      <div class="u">${s.unvan || '-'}</div>
      <div class="v">VKN: ${s.vkn || '-'}</div>
    </div>
    <div class="taraf">
      <h3>Alıcı</h3>
      <div class="u">${a.unvan || '-'}</div>
      <div class="v">VKN/TCKN: ${a.vkn || '-'}</div>
    </div>
  </div>
  <div class="bilgi">
    <div class="b"><em>Fatura Tarihi</em>${trTarihFatura(ay.tarih)}</div>
    <div class="b"><em>Fatura Tipi</em>${ay.tip || ''} ${kvkk}</div>
    <div class="b"><em>Profil</em>${(ay.profil || '').replace('TEMELFATURA', 'Temel Fatura').replace('TICARIFATURA', 'Ticari Fatura').replace('EARŞİVFATURA', 'e-Arşiv Fatura')}</div>
    ${ay.donem ? `<div class="b"><em>Dönem</em>${ay.donem}</div>` : ''}
  </div>
  <table class="ustlar">
    <tr><th>Mal / Hizmet</th><th class="c">Miktar</th><th class="c">KDV</th><th class="r">Birim Fiyat</th><th class="r">Satır Tutarı</th></tr>
    ${satirlar}
  </table>
  <div class="sonlar">
    <div>${kurTablosu}${kurSatiri}</div>
  </div>
  <div class="not">Bu belge MUBiS tarafından e-Fatura / e-Arşiv UBL verisinden oluşturulmuştur; resmî belgenin birebir görüntüsüdür.</div>
  <div class="imza">
    <div class="k"><div class="cizgi">Satıcı</div></div>
    <div class="k"><div class="cizgi">Alıcı</div></div>
  </div>
</div>
</body></html>`
}

export function faturaPdfAc(xmlMetin) {
  const ay = ublAyikla(xmlMetin)
  if (!ay.faturaNo && !ay.toplam) return null
  return faturaHtmlOlustur(ay)
}

// XML'e gomulu resmi XSLT (AdditionalDocumentReference/EmbeddedDocumentBinaryObject,
// base64) — gondericinin kendi sisteminin ve GIB goruntuleyicisinin kullandigi
// RESMI fatura gorunumu. Tarayici XSLTProcessor ile donusturur; gomulu XSLT
// yoksa / donusum basarisizsa null doner (cagiran diger gorunume dusar).
// Varolan (XML-only) faturalarin tasarim yerine orijinal gorunmesi icin.
export function gomuluXsltGorunumu(xmlMetni) {
  try {
    if (!xmlMetni || xmlMetni.length < 500) return null
    if (typeof XSLTProcessor === 'undefined') return null
    const adet = [...xmlMetni.matchAll(/<(?:[A-Za-z0-9]+:)?EmbeddedDocumentBinaryObject\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9]+:)?EmbeddedDocumentBinaryObject>/gi)]
    let xslStr = ''
    for (const g of adet) {
      const b64 = g[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/\s+/g, '')
      if (!/^[A-Za-z0-9+/=]+$/.test(b64) || b64.length < 200) continue
      let dec = ''
      try { dec = new TextDecoder('utf-8').decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0))) } catch { continue }
      if (/<xsl:stylesheet|<xsl:transform/i.test(dec)) { xslStr = dec; break }
    }
    if (!xslStr) return null
    const dp = new DOMParser().parseFromString(xmlMetni, 'application/xml')
    if (dp.getElementsByTagName('parsererror').length) return null
    const dx = new DOMParser().parseFromString(xslStr, 'application/xml')
    if (dx.getElementsByTagName('parsererror').length) return null
    const proc = new XSLTProcessor()
    proc.importStylesheet(dx)
    const res = proc.transformToDocument(dp)
    if (!res) return null
    // Chrome XSLT cikisina enjekte ettigi deprecation banner'ini cikar
    try {
      for (const d of res.querySelectorAll('div')) {
        const tx = d.textContent || ''
        if (/This site uses XSLT/i.test(tx) && /chromestatus/i.test(d.innerHTML) && d.parentElement) d.parentElement.removeChild(d)
      }
    } catch { /* yoksay */ }
    const html = res.documentElement && res.documentElement.nodeName.toLowerCase() === 'html'
      ? '<!DOCTYPE html><html>' + res.documentElement.innerHTML + '</html>'
      : new XMLSerializer().serializeToString(res)
    const cikti = html.replace(/^<\?xml[^>]*\?>/, '')
    if (!cikti || cikti.length < 800) return null
    return cikti
  } catch { return null }
}
