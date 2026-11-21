// MUBiS - Toplu Belge Turu ve Odeme Yontemi Duzenleme
// Luca masaustu otomasyonunun "Muhasebe > Fis Islemleri > Toplu Belge Turu
// ve Odeme Yontemi Duzenleme" akisinin sunucu (VPS) karsiligidir.
//
// Iki parca:
//   bulkBelgePlanla  : Node tarafinda saf planlama (tarayici yok, kayit yok)
//   bulkBelgeSayfa   : Luca'nin toplu duzenleme penceresinde calisan betik
//
// Guvenlik kurallari (masaustu ile ayni):
//  - Yalniz E-Defter uyumsuzluk 20041 / 20042 duzeltilir.
//  - Dolu belge numarasina ASLA dokunulmaz.
//  - Fatura kaydina (191/391/600 hesabi olan fise) fis numarasi yazilmaz.
//  - Onizlemeden sonra liste degistiyse kaydedilmez.
//  - "Kaydetme islemi tamamlandi" gorulmeden basa donulmez.

const EDIT_CODES = ['20041', '20042']
const ALL_CODES = ['20041', '20042', '20044', '20045', '20046', '20047', '20048']

const temiz = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()

// Bir belge turunun fatura sayilip sayilmadigini belirler.
function faturaMi(bt) {
  const b = temiz(bt).toLocaleUpperCase('tr')
  if (!b) return false
  return /^(FT|EF|EA|EAF)$/.test(b) || /FATURA|AR[ŞS]İ?V|ARSIV/.test(b)
}

/**
 * Satirlari ve hata turunu alip yapilacak degisiklikleri uretir.
 * rows: bulkBelgeSayfa 'read' ciktisi
 */
function bulkBelgePlanla({ errorCode, rows, emptyConfirmed = false }) {
  const kod = String(errorCode || '')
  if (!ALL_CODES.includes(kod)) throw new Error('Taninmayan E-Defter hata turu: ' + kod)
  if (!Array.isArray(rows)) throw new Error('Liste okunamadi; bos liste sayilmadi.')
  if (!rows.length && !emptyConfirmed) throw new Error('"Kayit bulunamadi" sonucu dogrulanmadi.')

  const duzenlenebilir = EDIT_CODES.includes(kod)
  const sonuc = { errorCode: kod, changes: [], review: [], empty: rows.length === 0 }

  // Ayni fiste fatura hesabi var mi? (degismez fis numarasi bazinda)
  const faturaFisleri = new Set()
  for (const r of rows) {
    if (r && /^\d{1,16}$/.test(r.stableVoucherNo) && /^(191|391|600)(?=[.\s/-]|$)/.test(temiz(r.account))) {
      faturaFisleri.add(r.stableVoucherNo)
    }
  }

  const gorulen = new Set()
  for (const row of rows) {
    if (!row || !temiz(row.key) || gorulen.has(String(row.key))) {
      throw new Error('Satir kimligi eksik veya tekrarli; islem planlanmadi.')
    }
    gorulen.add(String(row.key))

    if (!duzenlenebilir) {
      sonuc.review.push({ key: row.key, reason: 'Bu hata turu icin otomatik duzeltme kurali yok.' })
      continue
    }
    if (kod === '20041' && temiz(row.documentType)) {
      // 20041 = belge turu bos. Dolu satira dokunulmaz.
      continue
    }
    for (const alan of ['documentType', 'paymentType', 'documentNo', 'stableVoucherNo']) {
      if (typeof row[alan] !== 'string') throw new Error('Satir alani okunamadi: ' + alan)
    }

    const bt = temiz(row.documentType).toLocaleUpperCase('tr')
    const updates = {}

    // Belge tarihi bos -> fis tarihi
    if (row.documentDate === '') {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(row.voucherDate || '')
      const d = m && new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]))
      if (!m || d.getUTCFullYear() !== +m[3] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[1]) {
        sonuc.review.push({ key: row.key, reason: 'Bos belge tarihi icin fis tarihi dogrulanamadi.' })
        continue
      }
      updates.documentDate = row.voucherDate
    }

    const bankaBelgesi = ['BE', 'BF', 'DK', 'KK'].includes(bt)
    const fatura = faturaMi(bt) || faturaFisleri.has(row.stableVoucherNo)

    if (fatura && !temiz(row.documentNo)) {
      sonuc.review.push({ key: row.key, reason: 'Fatura belge numarasi bos; fis numarasi atanmadi.' })
    }
    if (!fatura && !temiz(row.documentNo) && !/^\d{1,16}$/.test(row.stableVoucherNo)) {
      sonuc.review.push({ key: row.key, reason: 'Degismez fis numarasi dogrulanamadi; satir degistirilmedi.' })
      continue
    }

    if (bankaBelgesi && row.paymentType !== 'Banka') updates.paymentType = 'Banka'
    if (bt === 'FŞ') updates.documentType = 'PS'
    if (bt === '') updates.documentType = faturaFisleri.has(row.stableVoucherNo) ? 'FT' : 'MF'
    if (!fatura && !temiz(row.documentNo)) updates.documentNo = row.stableVoucherNo

    if (Object.keys(updates).length) {
      sonuc.changes.push({ key: row.key, before: { ...row }, updates })
    }
  }
  return sonuc
}

/**
 * Luca'nin toplu duzenleme penceresinde calisir (page.evaluate ile).
 * Pencere: /Luca/parameterBelgeTuruDuzenlemeAction.do (filtre)
 *          /Luca/listBelgeTuruDuzenlemeAction.do      (liste)
 */
function bulkBelgeSayfa(request) {
  const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()
  const gorunur = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'
  const yol = location.pathname
  const filtreEkrani = /\/parameterBelgeTuruDuzenlemeAction\.do$/.test(yol)
  const listeEkrani = /\/listBelgeTuruDuzenlemeAction\.do$/.test(yol)
  if (!filtreEkrani && !listeEkrani) throw new Error('Toplu belge ekrani dogrulanamadi.')

  const metin = (document.body && document.body.innerText) || ''
  const hazir = document.readyState === 'complete'
  if (/Lütfen.*luca\.com\.tr.*giriş|oturum.*sona er|Bir sistem hatası/i.test(metin)) {
    throw new Error('Luca oturumu veya ekran hatasi.')
  }

  function dugme(etiket, kok) {
    const root = kok || document
    let bulunan = null
    for (const e of root.querySelectorAll('button')) {
      if (gorunur(e) && clean(e.innerText) === etiket) {
        if (bulunan) throw new Error('Birden fazla dugme: ' + etiket)
        bulunan = e
      }
    }
    if (!bulunan || bulunan.disabled) throw new Error('Dugme hazir degil: ' + etiket)
    bulunan.click()
  }
  function alan(id) {
    const e = document.getElementById(id)
    if (!gorunur(e) || e.disabled) throw new Error('Alan hazir degil: ' + id)
    return e
  }
  function doldur(e, value) {
    e.value = value
    e.dispatchEvent(new Event('input', { bubbles: true }))
    e.dispatchEvent(new Event('change', { bubbles: true }))
  }
  function ayniSatirlar(gercek, beklenen) {
    if (!Array.isArray(beklenen) || gercek.length !== beklenen.length) return false
    for (let i = 0; i < gercek.length; i++) {
      const a = gercek[i], b = beklenen[i]
      if (!b || typeof b !== 'object') return false
      for (const k in a) if (Object.prototype.hasOwnProperty.call(a, k) && (!Object.prototype.hasOwnProperty.call(b, k) || a[k] !== b[k])) return false
      for (const k in b) if (Object.prototype.hasOwnProperty.call(b, k) && !Object.prototype.hasOwnProperty.call(a, k)) return false
    }
    return true
  }
  function satirlar() {
    const sonuc = []
    let index = 0, grup = null
    for (const chk of document.querySelectorAll('input[name="item"]')) {
      const tr = chk.closest('tr')
      if (!tr || tr.cells.length !== 14) throw new Error('Fis satiri yapisi degisti.')
      const get = (name) => {
        const es = tr.querySelectorAll('input[name="' + name + '"]')
        if (es.length !== 1) throw new Error('Satir alani okunamadi: ' + name)
        return es[0]
      }
      let stable = clean(tr.cells[3].innerText)
      let voucherNo = clean(tr.cells[2].innerText)
      let voucherDate = clean(tr.cells[4].innerText)

      const grupluOkuma = request.expectedCode === '20042' ||
        (request.action === 'read' && ['20044', '20045', '20046', '20047', '20048'].includes(request.expectedCode))
      if (grupluOkuma && !stable && !voucherNo && !voucherDate && !clean(tr.cells[1].innerText) && chk.getAttribute('sira') === '') {
        if (!grup || chk.getAttribute('uniqueid') !== grup.stable || chk.getAttribute('fistarihi') !== grup.voucherDate) {
          throw new Error('Devam satirinin fis grubu dogrulanamadi.')
        }
        stable = grup.stable
        voucherNo = grup.voucherNo
        voucherDate = grup.voucherDate
      }
      if (chk.getAttribute('uniqueid') !== stable) {
        throw new Error('Degismez fis kimligi uyusmuyor. Filtre: ' + request.expectedCode +
          '; satir: ' + (index + 1) + '; fis: ' + (clean(tr.cells[2].innerText) || '(bos)') +
          '; gorunen kimlik: ' + (stable || '(bos)') + '; secim kimligi: ' + (chk.getAttribute('uniqueid') ?? '(yok)') + '.')
      }
      const bt = get('BELGE_TURU'), pay = get('ODEME_YONTEMI'), no = get('EVRAK_NO'), tarih = get('EVRAK_TARIHI')
      grup = { stable, voucherNo, voucherDate }
      sonuc.push({
        key: String(index++),
        stableVoucherNo: stable, voucherNo, voucherDate,
        account: clean(tr.cells[5].innerText),
        debit: clean(tr.cells[6].innerText),
        credit: clean(tr.cells[7].innerText),
        description: clean(tr.cells[8].innerText),
        documentType: bt.value,
        paymentType: pay.value,
        documentNo: no.value,
        documentDate: tarih.value,
        status: clean(tr.cells[13].innerText),
        dirty: bt.value !== bt.defaultValue || pay.value !== pay.defaultValue || no.value !== no.defaultValue || tarih.value !== tarih.defaultValue
      })
    }
    return sonuc
  }

  if (request.action === 'state') {
    return {
      filter: filtreEkrani && hazir,
      list: listeEkrani && hazir,
      loading: !hazir || /\d+\s*\/\s*\d+\s+kaydediliyor/i.test(metin),
      saved: hazir && /Kaydetme işlemi tamamlandı\./.test(metin),
      error: /kaydedilemedi|kayıt.*hata oluştu/i.test(metin),
      empty: hazir && listeEkrani && /Kayıt bulunamadı\./.test(metin) && document.querySelectorAll('input[name="item"]').length === 0
    }
  }
  if (!hazir) throw new Error('Sayfa yuklemesi tamamlanmadi; filtre ve sonuc kullanilmadi.')

  function filtreDogrula() {
    const c = alan('EDEFTER_UYUMSUZ')
    const s = document.querySelector('select[name="EDEFTER_UYUMSUZ_FISLER"]')
    if (!c.checked || !s || s.disabled || s.value !== request.code || !s.options[s.selectedIndex]?.textContent.includes(request.code)) {
      throw new Error('E-Defter hata filtresi dogrulanamadi: ' + request.code)
    }
    for (const id of ['FIS_TARIHI_BAS', 'FIS_TARIHI_BIT']) {
      const e = document.getElementById(id)
      if (!e || e.value !== '') throw new Error('Bos tarih filtresi dogrulanamadi; tarih maskesi gonderilmedi.')
    }
    if (document.querySelector('select[name="SAYFA_NO"]')?.value !== '1') throw new Error('Ilk sayfa secimi dogrulanamadi.')
    return { code: s.value, page: '1' }
  }

  if (request.action === 'filter') {
    if (!filtreEkrani) throw new Error('Filtre ekrani acik degil.')
    const c = alan('EDEFTER_UYUMSUZ')
    if (!c.checked) c.click()
    if (!c.checked) throw new Error('E-Defter secilemedi.')
    const s = document.querySelector('select[name="EDEFTER_UYUMSUZ_FISLER"]')
    if (!gorunur(s)) throw new Error('Hata turu listesi acilmadi.')
    let gecerli = false
    for (const o of s.options) if (o.value === request.code) gecerli = true
    if (!gecerli) throw new Error('Hata turu yok: ' + request.code)
    doldur(s, request.code)
    const tarihler = []
    for (const id of ['FIS_TARIHI_BAS', 'FIS_TARIHI_BIT']) {
      const e = document.getElementById(id)
      if (!e) throw new Error('Tarih alani okunamadi.')
      if (e.value.replace(/[_/\s]/g, '')) throw new Error('Tarih filtresi bos olmali; otomatik degistirilmedi.')
      tarihler.push(e)
    }
    for (const e of tarihler) {
      if (typeof e.blur === 'function') e.blur()
      if (e.value.replace(/[_/\s]/g, '')) throw new Error('Tarih alani odak degisiminde doldu; islem durduruldu.')
      if (e.value !== '') doldur(e, '')
    }
    const sayfa = document.querySelector('select[name="SAYFA_NO"]')
    if (!sayfa) throw new Error('Sayfa secimi okunamadi.')
    doldur(sayfa, '1')
    return filtreDogrula()
  }
  if (request.action === 'submit-filter') {
    if (!filtreEkrani) throw new Error('Filtre ekrani acik degil.')
    const kanit = filtreDogrula()
    dugme('Listele')
    return kanit
  }
  if (!listeEkrani) throw new Error('Fis listesi acik degil.')
  if (request.action === 'back') { dugme('Filtre'); return true }

  const beklenen = request.expectedCode
  const yankilar = document.querySelectorAll('input[name="EDEFTER_UYUMSUZ_FISLER"]')
  if (!beklenen || yankilar.length !== 1 || yankilar[0].value !== beklenen) {
    throw new Error('Sonuc hata filtresi uyusmuyor; beklenen ' + beklenen + '. Bos veya tamamlandi sayilmadi.')
  }
  if (request.action === 'read') return { rows: satirlar(), empty: /Kayıt bulunamadı\./.test(metin), code: yankilar[0].value }

  if (request.action === 'stage') {
    if (!['20042', '20041'].includes(beklenen)) throw new Error('Bu filtre yalniz okunur; toplu duzeltme yapilmaz.')
    const onceki = satirlar()
    if (!ayniSatirlar(onceki, request.before)) throw new Error('Onizlemeden sonra satirlar degisti.')

    // Tarayici tarafinda da koruma: plan gecersiz olsa bile uygulanmaz.
    for (const degisim of request.changes) {
      if (beklenen === '20041') {
        let hedef = null
        for (const aday of onceki) if (aday.key === degisim.key) hedef = aday
        if (!hedef || clean(hedef.documentType)) throw new Error('20041 duzeltmesi yalniz bos belge turune uygulanabilir.')
      }
      if (Object.prototype.hasOwnProperty.call(degisim.updates, 'documentDate')) {
        let satir = null
        for (const aday of onceki) if (aday.key === degisim.key) satir = aday
        if (!satir || satir.documentDate !== '' || !/^\d{2}\/\d{2}\/\d{4}$/.test(satir.voucherDate) || degisim.updates.documentDate !== satir.voucherDate) {
          throw new Error('Belge tarihine yalniz bos alanda fis tarihi aktarilabilir.')
        }
      }
      if (degisim.updates.documentType === 'FT') {
        let hedef = null, kanit = false
        for (const aday of onceki) if (aday.key === degisim.key) hedef = aday
        if (hedef && /^\d{1,16}$/.test(hedef.stableVoucherNo)) {
          for (const aday of onceki) {
            if (aday.stableVoucherNo === hedef.stableVoucherNo && /^(191|391|600)(?=[.\s/-]|$)/.test(clean(aday.account))) kanit = true
          }
        }
        if (!hedef || clean(hedef.documentType) || !kanit) throw new Error('FT aktarimi icin bos belge turu ve ayni fiste fatura hesabi dogrulanmali.')
      }
      if (!Object.prototype.hasOwnProperty.call(degisim.updates, 'documentNo')) continue
      let satir = null
      for (const aday of onceki) if (aday.key === degisim.key) satir = aday
      if (!satir || clean(satir.documentNo)) throw new Error('Dolu belge numarasi degistirilemez; aktarim yapilmadi.')
      const bt = clean(degisim.updates.documentType || satir.documentType).toLocaleUpperCase('tr')
      let fatura = /^(FT|EF|EA|EAF)$/.test(bt) || /FATURA|AR[ŞS]İ?V|ARSIV/.test(bt)
      for (const aday of onceki) {
        if (aday.stableVoucherNo === satir.stableVoucherNo && /^(191|391|600)(?=[.\s/-]|$)/.test(clean(aday.account))) fatura = true
      }
      if (fatura) throw new Error('Fatura kaydina degismez fis numarasi atanamaz.')
      if (!/^\d{1,16}$/.test(satir.stableVoucherNo) || degisim.updates.documentNo !== satir.stableVoucherNo) {
        throw new Error('Bos belge numarasina yalniz dogrulanmis degismez fis numarasi aktarilabilir.')
      }
    }

    const kutular = document.querySelectorAll('input[name="item"]')
    dugme('Toplu Değer Ata')
    const aktarimlar = [
      ['paymentType', 'Banka'],
      ['documentType', 'MF'],
      ['documentType', 'FT'],
      ['documentType', 'PS'],
      ['documentNo', null],
      ['documentDate', null]
    ]
    for (const [alanAdi, deger] of aktarimlar) {
      let sayi = 0
      for (let i = 0; i < kutular.length; i++) {
        let secili = false
        for (const ch of request.changes) {
          if (ch.key === String(i) && Object.prototype.hasOwnProperty.call(ch.updates, alanAdi) &&
            (alanAdi === 'documentNo' || alanAdi === 'documentDate' || ch.updates[alanAdi] === deger)) secili = true
        }
        if (kutular[i].checked !== secili) kutular[i].click()
        if (kutular[i].checked !== secili) throw new Error('Satir secimi dogrulanamadi.')
        if (secili) sayi++
      }
      if (!sayi) continue
      if (alanAdi === 'documentDate') {
        let hedef = null
        for (const e of document.querySelectorAll('a,button')) {
          if (gorunur(e) && clean(e.innerText) === 'Fiş Tarihini Evrak Tarihi Olarak Ata') {
            if (hedef) throw new Error('Tarih aktarim alani tekrarli.')
            hedef = e
          }
        }
        if (!hedef) throw new Error('Fis tarihi aktarim alani bulunamadi.')
        hedef.click()
      } else if (alanAdi === 'documentNo') {
        let hedef = null
        for (const tr of document.querySelectorAll('tr')) {
          if (gorunur(tr) && tr.cells.length >= 2 && clean(tr.cells[0].innerText) === 'Evrak No Alanına Değişmez Fiş Numarasını Aktar') {
            if (hedef) throw new Error('Evrak no aktarim alani tekrarli.')
            hedef = tr
          }
        }
        if (!hedef) throw new Error('Evrak no aktarim alani bulunamadi.')
        dugme('Aktar', hedef)
      } else {
        const e = alan(alanAdi === 'paymentType' ? 'ODEME_YONTEMI_TUMU' : 'BELGE_TURU_TUMU')
        doldur(e, deger)
        dugme('Aktar', e.closest('tr'))
      }
    }
    dugme('Kapat')
    for (let i = 0; i < kutular.length; i++) {
      let secili = false
      for (const ch of request.changes) if (ch.key === String(i)) secili = true
      if (kutular[i].checked !== secili) kutular[i].click()
      if (kutular[i].checked !== secili) throw new Error('Kaydedilecek satirlar dogrulanamadi.')
    }
    return { rows: satirlar() }
  }

  if (request.action === 'save') {
    if (!['20042', '20041'].includes(beklenen)) throw new Error('Bu filtre yalniz okunur; kayit yapilmaz.')
    if (!ayniSatirlar(satirlar(), request.expected)) throw new Error('Kaydetmeden once liste degisti.')
    const kutular = document.querySelectorAll('input[name="item"]')
    for (let i = 0; i < kutular.length; i++) {
      let secili = false
      for (const k of request.keys) if (k === String(i)) secili = true
      if (kutular[i].checked !== secili) throw new Error('Kaydetme secimi degisti.')
    }
    if (!request.keys.length) throw new Error('Bos secim kaydedilmez.')
    dugme('Kaydet')
    return true
  }
  throw new Error('Bilinmeyen toplu islem: ' + request.action)
}

module.exports = { bulkBelgePlanla, bulkBelgeSayfa, EDIT_CODES, ALL_CODES }
