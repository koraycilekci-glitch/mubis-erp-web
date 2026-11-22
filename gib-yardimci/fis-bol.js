// MUBiS - Toplu Fis Bol (Luca "Fis Listesi")
// Luca masaustu akisi: Muhasebe > Fis Islemleri > Fis Listesi >
//   tarih filtresi > "Toplu Fis Bol" (secim modu) > "Tum Fisler" onay kutusu >
//   "Toplu Fis Bol" (alt yesil) > Fis Bolme penceresi > Tamam >
//   "N adet fis bolunecektir. Emin misiniz?" > Tamam > Islem Takip > Kapat
//
// BU ISLEM KAYIT DEGISTIRIR (fisleri boler). Yalnizca kullanicinin acik
// onayiyla cagrilmalidir.
//
// Not: bu betik hem fis listesi cercevesinde hem de ana pencerede
// calistirilabilir; her eylem kendi ekran kosulunu kendisi dogrular.

const iki = (n) => String(n).padStart(2, '0')
const gosterim = (y, m, d) => `${iki(d)}/${iki(m)}/${y}`

/**
 * Secilen yil/ay icin tarih araligi (DD/MM/YYYY).
 * ay verilmezse yil tamami.
 * voucherNo verilirse hem bas hem son filtrede kullanilir (tek fis hedefleme).
 */
function donemAraligi({ yil, ay, simdi = new Date() } = {}) {
  const y = String(yil || '').trim()
  if (!/^20\d{2}$/.test(y)) throw new Error('Gecerli defter yili secin.')
  const yilSayi = Number(y)
  if (ay === '' || ay == null) {
    return { start: gosterim(yilSayi, 1, 1), end: gosterim(yilSayi, 12, 31) }
  }
  const m = Number(ay)
  if (!(m >= 1 && m <= 12)) throw new Error('Gecerli ay secin (1-12).')
  const sonGun = new Date(Date.UTC(yilSayi, m, 0)).getUTCDate()
  const bugun = { y: simdi.getFullYear(), m: simdi.getMonth() + 1, d: simdi.getDate() }
  let bitisGun = sonGun
  if (bugun.y === yilSayi && bugun.m === m) bitisGun = Math.min(sonGun, bugun.d)
  return { start: gosterim(yilSayi, m, 1), end: gosterim(yilSayi, m, bitisGun) }
}

/**
 * Fis listesi filtre degerleri (tarama ile ayni alanlar; hepsi "Tumu").
 * voucherNo verilirse sadece o fis numarasi hedeflenir (tek fis bolme).
 */
function fisBolFiltresi({ yil, ay, simdi, voucherNo } = {}) {
  const aralik = donemAraligi({ yil, ay, simdi })
  const vn = String(voucherNo || '').trim()
  return {
    year: String(yil),
    start: aralik.start,
    end: aralik.end,
    fields: {
      'İlk Fiş No': vn,
      'Son Fiş No': vn,
      'Fiş Tipi': 'Tümü',
      'Fiş Kategori': 'Tümü',
      'Fiş Denge': 'Tümü',
      'Fiş Durum': 'Tümü',
      'Fiş Kodu': 'Tümü',
      'Detaysız Fişler (Borç/Alacak Sıfır)': '',
      'Fiş Açıklama': ''
    },
    unchecked: ['fisNoProblem', 'EDEFTER_UYUMSUZ', 'DETAYLI_ARAMA']
  }
}

/**
 * Luca fis listesi cercevesinde / ana pencerede calisir.
 * request: { action, filter?, secenekler? }
 */
function fisBolSayfa(request) {
  const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim()
  const gorunur = (e) => !!e && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length)
  const govde = () => (document.body ? document.body.innerText : '')
  const filtreEkrani = /\/getFisParametreJSPAction\.do$/.test(location.pathname)
  const listeEkrani = /\/listFisParametreAction\.do$/.test(location.pathname)

  const dugmeler = (yazi) => {
    const out = []
    for (const e of document.querySelectorAll('button,input[type=button],input[type=submit],a')) {
      if (!gorunur(e) || e.disabled) continue
      if ([e.textContent, e.value, e.title, e.getAttribute('aria-label')]
        .some((t) => norm(t) === yazi)) out.push(e)
    }
    return out
  }
  const tikla = (yazi, hangi = 'ilk') => {
    const liste = dugmeler(yazi)
    if (!liste.length) throw new Error('Düğme bulunamadı: ' + yazi)
    const e = hangi === 'son' ? liste[liste.length - 1] : liste[0]
    if (!e || e.disabled) throw new Error('Düğme hazır değil: ' + yazi)
    e.click()
    return liste.length
  }

  const satirKutulari = () => {
    const tablo = document.getElementById('TBL')
    if (!tablo) return []
    const out = []
    for (const tr of tablo.rows) {
      const k = tr.querySelector('input[type=checkbox]')
      if (k && gorunur(k)) out.push(k)
    }
    return out
  }
  const baslikKutusu = () => {
    const h = document.getElementById('HTBL')
    if (h) {
      const k = h.querySelector('input[type=checkbox]')
      if (k && gorunur(k)) return k
    }
    for (const e of document.querySelectorAll('input[type=checkbox]')) {
      if (!gorunur(e) || (e.closest && e.closest('#TBL'))) continue
      return e
    }
    return null
  }

  const eminMisin = () => /Emin misiniz\?/i.test(govde())
  const onayAdedi = () => {
    const m = /(\d+)\s*adet fiş bölünecektir/i.exec(govde())
    return m ? Number(m[1]) : null
  }
  const fisBolmeAcik = () => {
    const t = govde()
    return /Fiş Bölme/.test(t) && /(Aynı türdeki belgeleri böl|Fiş Açıklama|Yeni fişlerde)/.test(t)
  }
  // Islem Takip diyalogunun metnini bulur (fis listesi metniyle karismaz).
  const islemTakipMetni = () => {
    const kutular = diyalogKutulari()
    for (let i = kutular.length - 1; i >= 0; i--) {
      const t = kutular[i].metin
      if (/İşlem Takip|Islem Takip/i.test(t) || /\[\d+\s*\/\s*\d+\]/.test(t)) return t
    }
    return ''
  }
  const islemTakip = () => {
    const metin = islemTakipMetni()
    if (!metin) return { acik: false }
    // Gercek ilerleme: "[x/N]" satirlari
    const adimlar = [...metin.matchAll(/\[(\d+)\s*\/\s*(\d+)\]/g)]
    let yuzde = null
    let toplamAdet = null
    if (adimlar.length) {
      const son = adimlar[adimlar.length - 1]
      const x = Number(son[1])
      const n = Number(son[2])
      toplamAdet = n
      if (n > 0) yuzde = Math.min(100, Math.round((x / n) * 100))
    }
    // Bitti mi? Son adim N/N ise veya sonuc satiri gorulduyse.
    const bittiMi =
      (adimlar.length > 0 && Number(adimlar[adimlar.length - 1][1]) >= Number(adimlar[adimlar.length - 1][2])) ||
      /(fişler bölündü|bölme işlemi tamamlandı|işlem tamamlandı)/i.test(metin)

    // Bölünemeyen fişler (Luca is kurali) — hata degil, raporlanir.
    const basarisiz = []
    for (const parca of metin.split(/\s*\[\d+\s*\/\s*\d+\]\s*/).filter(Boolean)) {
      if (/bölünemedi|bölünemez|değiştirilemez|degistirilemez/i.test(parca)) {
        const temiz = norm(parca)
        if (temiz && !basarisiz.includes(temiz)) basarisiz.push(temiz.slice(0, 200))
      }
    }
    const devam = !bittiMi && /Seçili fişler bölünüyor/i.test(metin)
    return {
      acik: true,
      devam,
      bitti: bittiMi,
      hata: /(sistem hatası|beklenmeyen hata|bağlantı hatası)/i.test(metin),
      yuzde,
      toplamAdet,
      basarisiz,
      ozet: metin.replace(/\s+/g, ' ').slice(0, 600)
    }
  }
  const kutuBul = (parca) => {
    for (const e of document.querySelectorAll('input[type=checkbox]')) {
      if (!gorunur(e)) continue
      const kap = (e.closest && e.closest('label')) || e.parentElement
      const metin = norm((kap ? kap.textContent : '') + ' ' + (e.getAttribute('aria-label') || ''))
      if (metin.includes(parca)) return e
    }
    return null
  }

  // Gorunur diyalog kutularini (en ustteki en sonda olacak sekilde) dondurur.
  const diyalogKutulari = () => {
    const adaylar = []
    for (const e of document.querySelectorAll('[role=dialog],.ui-dialog,.modal,.window,[id*=dialog],[id*=Dlg],[class*=dialog],[class*=Dlg]')) {
      if (!gorunur(e)) continue
      const t = norm(e.textContent)
      if (!t) continue
      // Fiş listesi gibi dev tablolari disla
      if (e.querySelectorAll('tr').length > 30) continue
      adaylar.push({ el: e, metin: t })
    }
    return adaylar
  }
  const diyalogDugmesi = (yazi) => {
    const kutular = diyalogKutulari()
    // En son (en ustte) diyalogdan basla
    for (let i = kutular.length - 1; i >= 0; i--) {
      for (const e of kutular[i].el.querySelectorAll('button,input[type=button],input[type=submit],a')) {
        if (!gorunur(e) || e.disabled) continue
        if ([e.textContent, e.value].some((t) => norm(t) === yazi)) return e
      }
    }
    return null
  }

  if (request.action === 'ekran') {
    const kutular = diyalogKutulari().map((k) => ({
      metin: k.metin.slice(0, 200),
      dugmeler: [...k.el.querySelectorAll('button,input[type=button],a')]
        .filter(gorunur).map((b) => norm(b.textContent || b.value)).filter(Boolean).slice(0, 10),
      kutular: [...k.el.querySelectorAll('input[type=checkbox]')]
        .filter(gorunur).map((c) => {
          const kap = (c.closest && c.closest('label')) || c.parentElement
          return { metin: norm(kap ? kap.textContent : '').slice(0, 60), secili: !!c.checked }
        }).slice(0, 8)
    }))
    return { acik: kutular.length > 0, diyaloglar: kutular }
  }

  if (request.action === 'state') {
    return {
      filter: filtreEkrani,
      list: listeEkrani,
      ready: document.readyState === 'complete',
      secimModu: satirKutulari().length > 0,
      dialog: fisBolmeAcik(),
      onay: eminMisin()
    }
  }

  // ---- Filtre ----
  if (request.action === 'filter' || request.action === 'submit') {
    if (!filtreEkrani) throw new Error('Fiş filtre ekranı açık değil.')
    const f = request.filter
    const alanlar = []
    for (const [id, deger] of Object.entries({ ilkFisNo: '', sonFisNo: '', tarih1: f.start, tarih2: f.end })) {
      const e = document.getElementById(id) || document.querySelector('[name="' + id + '"]')
      if (!e) throw new Error('Fiş alanı bulunamadı: ' + id)
      alanlar.push([e, deger])
    }
    for (const [etiket, deger] of Object.entries(f.fields)) {
      if (etiket === 'İlk Fiş No' || etiket === 'Son Fiş No') continue
      let kontrol = null
      for (const dugum of document.querySelectorAll('td,th,label,b,span')) {
        if (norm(dugum.textContent) !== etiket) continue
        const hucre = dugum.closest('td,th')
        if (!hucre) continue
        kontrol = hucre.querySelector('select,input:not([type=hidden])')
        if (!kontrol) {
          const sonraki = hucre.nextElementSibling
          if (sonraki) kontrol = sonraki.querySelector('select,input:not([type=hidden])')
        }
        if (kontrol) break
      }
      if (!kontrol) throw new Error('Fiş filtresi bulunamadı: ' + etiket)
      if (kontrol.tagName === 'SELECT') {
        let secenek = null
        for (const o of kontrol.options) if (norm(o.text) === deger) { secenek = o; break }
        if (!secenek) throw new Error('Fiş filtre seçeneği yok: ' + etiket + ' / ' + deger)
        alanlar.push([kontrol, secenek.value])
      } else {
        alanlar.push([kontrol, deger])
      }
    }
    for (const id of f.unchecked) {
      const e = document.getElementById(id) || document.querySelector('[name="' + id + '"]')
      if (!e) continue
      if (request.action === 'filter') e.checked = false
      if (e.checked) throw new Error('Ek fiş filtresi açık: ' + id)
    }
    for (const [e, deger] of alanlar) {
      if (request.action === 'filter') {
        e.value = deger
        e.dispatchEvent(new window.Event('change', { bubbles: true }))
      }
      if (e.value !== deger) throw new Error('Fiş filtre değeri doğrulanmadı.')
    }
    if (request.action === 'submit') tikla('Liste')
    return { verified: true, start: f.start, end: f.end }
  }

  // ---- Secim modu (ust arac cubugu "Toplu Fis Bol") ----
  if (request.action === 'secim-modu') {
    if (fisBolmeAcik()) return { zatenDialog: true }
    if (satirKutulari().length) return { zatenAcik: true, toplam: satirKutulari().length }
    const adet = tikla('Toplu Fiş Böl', 'ilk')
    return { tiklama: adet }
  }

  // ---- Basliktaki "Tumunu sec" ----
  if (request.action === 'tumunu-sec') {
    const kutular = satirKutulari()
    if (!kutular.length) throw new Error('Fiş seçim kutuları görünmüyor (seçim modu açılmadı).')
    const bas = baslikKutusu()
    if (!bas) throw new Error('Başlık seçim kutusu bulunamadı.')
    if (!bas.checked && typeof bas.click === 'function') bas.click()
    if (!bas.checked) throw new Error('Başlık seçim kutusu işaretlenemedi.')
    const secili = satirKutulari().filter((k) => k.checked).length
    const toplam = satirKutulari().length
    if (secili !== toplam) throw new Error('Tüm fişler seçilemedi: ' + secili + '/' + toplam)
    return { toplam: secili }
  }

  // ---- Alt (yesil) "Toplu Fis Bol" -> Fis Bolme penceresi ----
  if (request.action === 'bol') {
    const secili = satirKutulari().filter((k) => k.checked).length
    if (!secili) throw new Error('Seçili fiş yok; bölme başlatılmadı.')
    const adet = tikla('Toplu Fiş Böl', 'son')
    return { secili, tiklama: adet }
  }

  // ---- Fis Bolme penceresi ----
  if (request.action === 'dialog-durum') {
    if (!fisBolmeAcik()) return { acik: false }
    return {
      acik: true,
      secenekler: {
        ayniTur: !!kutuBul('Aynı türdeki belgeleri böl')?.checked,
        gunluk: !!kutuBul('günlük fişler oluştur')?.checked,
        fisTarihiAta: !!kutuBul('Fiş Tarihi, Evrak Tarihi olarak atansın')?.checked,
        evrakAciklama: !!kutuBul('Evrak açıklama fiş açıklama olarak atansın')?.checked
      }
    }
  }

  if (request.action === 'tamam') {
    if (!fisBolmeAcik()) throw new Error('Fiş Bölme penceresi açık değil.')
    if (request.secenekler && typeof request.secenekler === 'object') {
      const uygula = (parca, hedef) => {
        if (typeof hedef !== 'boolean') return
        const k = kutuBul(parca)
        if (k && k.checked !== hedef) k.click()
      }
      uygula('Aynı türdeki belgeleri böl', request.secenekler.ayniTur)
      uygula('Fiş Tarihi, Evrak Tarihi olarak atansın', request.secenekler.fisTarihiAta)
    }
    // 2.8.354: Diyalog icindeki "Tamam" tercih edilir (sayfadaki baska bir
    // Tamam'a basmak islemi baslatmiyordu).
    const hedef = diyalogDugmesi('Tamam')
    if (hedef) { hedef.click(); return { tamam: 'diyalog' } }
    tikla('Tamam', 'son')
    return { tamam: 'sayfa' }
  }

  // ---- Onay penceresi ----
  if (request.action === 'onay-durum') {
    return { acik: eminMisin(), adet: onayAdedi() }
  }
  if (request.action === 'onayla') {
    if (!eminMisin()) throw new Error('Onay penceresi açık değil.')
    tikla('Tamam', 'son')
    return true
  }
  // Deneme icin: onay penceresini IPTAL eder (hicbir kayit degismez).
  if (request.action === 'onay-iptal') {
    if (!eminMisin()) throw new Error('Onay penceresi açık değil.')
    const liste = [...dugmeler('İptal'), ...dugmeler('Iptal')]
    if (!liste.length) throw new Error('İptal düğmesi bulunamadı.')
    liste[0].click()
    return true
  }
  // Fis Bolme penceresini kapatir (hicbir kayit degismez).
  if (request.action === 'dialog-kapat') {
    if (!fisBolmeAcik()) return { kapandi: false }
    const liste = dugmeler('Kapat')
    if (!liste.length) return { kapandi: false }
    liste[liste.length - 1].click()
    return { kapandi: true }
  }

  // ---- Islem Takip ----
  if (request.action === 'ilerleme') return islemTakip()
  if (request.action === 'vazgec') {
    const liste = dugmeler('Vazgeç')
    if (!liste.length) return { cikildi: false }
    liste[0].click()
    return { cikildi: true }
  }
  if (request.action === 'kapat') {
    const liste = dugmeler('Kapat')
    if (!liste.length) return { kapandi: false, yok: true }
    liste[liste.length - 1].click()
    return { kapandi: true }
  }

  throw new Error('Gecersiz fis bolme islemi: ' + request.action)
}

module.exports = { donemAraligi, fisBolFiltresi, fisBolSayfa }
