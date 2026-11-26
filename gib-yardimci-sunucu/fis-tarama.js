// MUBiS - Fis Taramasi (SALT OKUNUR)
// Luca masaustu otomasyonunun "Muhasebe > Fis Islemleri > Fis Listesi"
// taramasinin sunucu karsiligidir. Kayit/silme YAPMAZ; yalniz okur.
//
// Tarama turleri (Luca ekranindaki dogrulanmis secenek adlari):
//   empty      -> "Detaysiz Fisler (Borc/Alacak Sifir)" = Goster
//   unbalanced -> "Fis Denge" = Dengesiz
//   passive    -> "Fis Durum" = Pasif

const FIS_TURLERI = Object.freeze({
  empty: 'Boş fiş',
  unbalanced: 'Dengesiz fiş',
  passive: 'Pasif fiş',
  'kdv-tahakkuk': 'KDV tahakkuk fişi adayları'
})

const iki = (n) => String(n).padStart(2, '0')
const gosterim = (y, m, d) => `${iki(d)}/${iki(m)}/${y}`

/**
 * Secilen yil/ay icin tarih araligi (DD/MM/YYYY).
 * ay verilmezse bugune kadar (yil basindan itibaren) taranir.
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
 * Luca fis listesi filtresini uretir.
 * Donen nesne dogrudan tarayici betigine (fisTaramaSayfa) verilir.
 */
function fisFiltresi(kind, { yil, ay, simdi } = {}) {
  if (!Object.prototype.hasOwnProperty.call(FIS_TURLERI, kind)) {
    throw new Error('Gecersiz fis taramasi: ' + kind)
  }
  const aralik = donemAraligi({ yil, ay, simdi })
  return {
    kind,
    year: String(yil),
    start: aralik.start,
    end: aralik.end,
    fields: {
      'İlk Fiş No': '',
      'Son Fiş No': '',
      'Fiş Tipi': 'Tümü',
      'Fiş Kategori': 'Tümü',
      'Fiş Denge': kind === 'unbalanced' ? 'Dengesiz' : 'Tümü',
      'Fiş Durum': kind === 'passive' ? 'Pasif' : 'Tümü',
      'Fiş Kodu': 'Tümü',
      'Detaysız Fişler (Borç/Alacak Sıfır)': kind === 'empty' ? 'Göster' : '',
      'Fiş Açıklama': ''
    },
    unchecked: ['fisNoProblem', 'EDEFTER_UYUMSUZ', 'DETAYLI_ARAMA']
  }
}

/**
 * Luca'nin fis listesi cercevesinde calisir.
 * request: { action, filter, token }
 */
function fisTaramaSayfa(request) {
  const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim()
  const filtreEkrani = /\/getFisParametreJSPAction\.do$/.test(location.pathname)
  const listeEkrani = /\/listFisParametreAction\.do$/.test(location.pathname)
  const gorunur = (e) => !!e && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length)

  const dugmeBul = (yazi) => {
    for (const e of document.querySelectorAll('button,input[type=button],input[type=submit],a')) {
      if (!gorunur(e)) continue
      if ([e.textContent, e.value, e.title, e.getAttribute('aria-label')].some((t) => norm(t) === yazi)) return e
    }
    return null
  }
  const tikla = (yazi) => {
    const e = dugmeBul(yazi)
    if (!e || e.disabled) throw new Error('Fiş düğmesi bulunamadı: ' + yazi)
    e.click()
  }

  if (request.action === 'state') {
    return { filter: filtreEkrani, list: listeEkrani, ready: document.readyState === 'complete' }
  }
  if (request.action === 'period') {
    if (!filtreEkrani) throw new Error('Fiş filtre ekranı açık değil.')
    const alan = (id) => document.getElementById(id) || document.querySelector(`[name="${id}"]`)
    return { start: norm(alan('tarih1')?.value), end: norm(alan('tarih2')?.value) }
  }
  if (request.action === 'back') {
    if (!listeEkrani) throw new Error('Fiş listesi açık değil.')
    tikla('Filtre')
    return true
  }

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
      if (!e) throw new Error('Fiş kontrolü yok: ' + id)
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
    return { verified: true, start: f.start, end: f.end, kind: f.kind }
  }

  if (!listeEkrani) throw new Error('Fiş sonuç listesi açık değil.')

  if (request.action === 'next') {
    document.documentElement.dataset.voucherScanPage = request.token
    tikla('Sonraki Sayfa')
    return true
  }

  if (request.action === 'read') {
    const basliklar = document.getElementById('HTBL')
    const tablo = document.getElementById('TBL')
    if (!basliklar || !tablo || document.readyState !== 'complete') throw new Error('Fiş tablosu hazır değil.')
    const ustMetin = norm(basliklar.textContent)
    for (const etiket of ['Tarih', 'Fiş No', 'Dengeli', 'Aktif', 'Borç', 'Alacak']) {
      if (!ustMetin.includes(etiket)) throw new Error('Fiş tablo başlığı değişti.')
    }
    const adlar = ['Tarih', 'Tip', 'Fiş No', 'Açıklama', 'Dengeli', 'Aktif', 'Borç', 'Alacak']
    let baslikHucreleri = null
    for (const tr of basliklar.rows || []) {
      const hucreler = Array.from(tr.cells)
      if (adlar.every((n) => hucreler.some((c) => norm(c.textContent) === n))) { baslikHucreleri = hucreler; break }
    }
    if (!baslikHucreleri) throw new Error('Fiş sütun başlıkları eşleştirilemedi.')
    const gorunurHucreler = (cells) => cells.filter((c) => gorunur(c) && window.getComputedStyle(c).display !== 'none')
    const satirlar = []
    for (const tr of tablo.rows) {
      let hucreler = Array.from(tr.cells)
      let basliklar2 = baslikHucreleri
      if (!hucreler.length) continue
      if (hucreler.length !== basliklar2.length) {
        hucreler = gorunurHucreler(hucreler)
        basliklar2 = gorunurHucreler(basliklar2)
      }
      if (hucreler.length !== basliklar2.length) {
        throw new Error('Fiş satır ve başlık sütunları uyuşmuyor: ' + hucreler.length + '/' + basliklar2.length)
      }
      const degerler = []
      const indeksler = []
      for (const ad of adlar) {
        const i = basliklar2.findIndex((c) => norm(c.textContent) === ad)
        if (i < 0) throw new Error('Fiş sütunu okunamadı: ' + ad)
        indeksler.push(i)
        degerler.push(norm(hucreler[i].textContent))
      }
      if (!/^\d{2}[/.]\d{2}[/.]\d{4}$/.test(degerler[0]) || !degerler[2]) {
        throw new Error('Fiş tarihi veya numarası okunamadı.')
      }
      const bag = hucreler[indeksler[2]].querySelector('a')
      const href = bag?.getAttribute('href')
      satirlar.push({
        id: href && href !== '#' ? href : degerler[0] + '|' + degerler[1] + '|' + degerler[2],
        date: degerler[0],
        type: degerler[1],
        voucherNo: degerler[2],
        description: degerler[3],
        balance: degerler[4],
        active: degerler[5],
        debit: degerler[6],
        credit: degerler[7]
      })
    }
    const sonraki = dugmeBul('Sonraki Sayfa')
    return {
      rows: satirlar,
      nextAvailable: !!sonraki && !sonraki.disabled && sonraki.getAttribute('aria-disabled') !== 'true',
      nextDisabled: !!sonraki && (sonraki.disabled || sonraki.getAttribute('aria-disabled') === 'true'),
      marker: document.documentElement.dataset.voucherScanPage || '',
      end: /sonraki sayfa yok/i.test(document.body.innerText),
      url: location.href
    }
  }
  throw new Error('Gecersiz salt okunur fis islemi: ' + request.action)
}

function fisTarihAnahtari(tarih) {
  const ayir = /^(\d{2})[/.](\d{2})[/.](20\d{2})$/.exec(String(tarih || '').trim())
  if (!ayir) return ''
  const [, gun, ay, yil] = ayir
  const tarihUtc = new Date(Date.UTC(Number(yil), Number(ay) - 1, Number(gun)))
  const iso = `${yil}-${ay}-${gun}`
  return tarihUtc.toISOString().slice(0, 10) === iso ? iso : ''
}

function kdvTahakkukAdayi(fis) {
  const aciklama = String(fis?.description || '').toLocaleLowerCase('tr').normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i')
  return /\bkdv\b|\bkatma\s+deger\s+vergisi\b/.test(aciklama) && /\b(?:tahakkuk|mahsu[pb]|kapatma|yansitma)/.test(aciklama)
}

module.exports = { FIS_TURLERI, donemAraligi, fisFiltresi, fisTaramaSayfa, fisTarihAnahtari, kdvTahakkukAdayi }
