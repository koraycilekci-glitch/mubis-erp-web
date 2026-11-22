// MUBiS Masaüstü Otomasyon — arayüz mantığı
// Node erişimi yok; her şey preload köprüsü (window.mubis) üzerinden gider.

const $ = (id) => document.getElementById(id)
const bugun = new Date()
let sonDurum = null

// ------------------------------------------------------------------ yardımcı

function mesaj(el, metin, tip) {
  const hedef = typeof el === 'string' ? $(el) : el
  if (!hedef) return
  hedef.textContent = metin || ''
  hedef.className = 'mesaj' + (tip ? ' ' + tip : '')
}

function sonucYaz(id, veri, tip) {
  const kutu = $(id)
  if (!kutu) return
  let metin
  if (typeof veri === 'string') metin = veri
  else {
    try { metin = JSON.stringify(veri, null, 2) } catch { metin = String(veri) }
  }
  kutu.textContent = metin
  kutu.className = 'sonuc' + (tip ? ' ' + tip : '')
}

function dugmeBeklet(btn, bekliyor, metin) {
  if (!btn) return
  if (bekliyor) {
    btn.dataset.eskiMetin = btn.textContent
    btn.textContent = metin || 'Çalışıyor…'
    btn.disabled = true
  } else {
    if (btn.dataset.eskiMetin) btn.textContent = btn.dataset.eskiMetin
    btn.disabled = false
  }
}

// Bir işi çalıştırır: sonuç kutusuna yazar, hata varsa mesaj gösterir.
async function isCalistir(isAdi, params, { btn, mesajId, sonucId, beklemeMetni } = {}) {
  if (btn) dugmeBeklet(btn, true, beklemeMetni)
  if (mesajId) mesaj(mesajId, 'Çalışıyor… (Luca/GİB penceresi açılabilir)')
  try {
    const j = await window.mubis.isCalistir(isAdi, params)
    if (j && j.success === false) {
      if (mesajId) mesaj(mesajId, 'Hata: ' + (j.error || j.not || 'bilinmeyen'), 'hatali')
      if (sonucId) sonucYaz(sonucId, j, 'hatali')
      return j
    }
    if (mesajId) mesaj(mesajId, 'Tamamlandı.', 'basarili')
    if (sonucId) sonucYaz(sonucId, j, 'basarili')
    return j
  } catch (e) {
    if (mesajId) mesaj(mesajId, 'Hata: ' + (e && e.message), 'hatali')
    if (sonucId) sonucYaz(sonucId, String(e && e.message), 'hatali')
    return { success: false, error: String(e && e.message) }
  } finally {
    if (btn) dugmeBeklet(btn, false)
    setTimeout(() => { if (mesajId) mesaj(mesajId, '') }, 6000)
  }
}

// ------------------------------------------------------------------- menü

function sayfaAc(ad) {
  document.querySelectorAll('.menu-oge').forEach((b) => b.classList.toggle('aktif', b.dataset.sayfa === ad))
  document.querySelectorAll('.sayfa').forEach((s) => s.classList.toggle('aktif', s.id === 'sayfa-' + ad))
}

document.querySelectorAll('.menu-oge').forEach((b) => {
  b.addEventListener('click', () => sayfaAc(b.dataset.sayfa))
})
document.querySelectorAll('[data-sayfa-git]').forEach((b) => {
  b.addEventListener('click', () => sayfaAc(b.dataset.sayfaGid))
})

// ------------------------------------------------------------------- durum

function rozetGuncelle(durum) {
  const rozet = $('rozet')
  const acik = Boolean(durum && durum.motor && durum.motor.calisiyor)
  rozet.className = 'rozet ' + (acik ? 'rozet-acik' : 'rozet-kapali')
  rozet.innerHTML = '<span class="nokta"></span> ' + (acik ? 'Motor çalışıyor' : 'Motor kapalı')
  $('baslatBtn').disabled = acik
  $('durdurBtn').disabled = !acik
}

function ekranaYaz(durum) {
  if (!durum) return
  sonDurum = durum
  const motor = durum.motor || {}
  const calisiyor = Boolean(motor.calisiyor)

  $('anaMotor').textContent = calisiyor ? 'Çalışıyor' : (motor.mesaj || 'Kapalı')
  $('anaMotor').style.color = calisiyor ? 'var(--yesil)' : 'var(--kirmizi)'
  $('anaMotorAlt').textContent = calisiyor ? 'Port ' + durum.port : 'Otomasyon devre dışı'
  $('anaChrome').textContent = durum.chrome ? 'Bulundu' : 'Yok'
  $('anaChrome').style.color = durum.chrome ? 'var(--yesil)' : 'var(--kirmizi)'
  $('anaLuca').textContent = durum.lucaKayitli ? 'Kayıtlı' : 'Kayıtsız'
  $('anaLuca').style.color = durum.lucaKayitli ? 'var(--yesil)' : 'var(--soluk)'
  $('anaSurum').textContent = durum.surum || '—'

  $('motorMesaj').textContent = motor.mesaj || '—'
  $('motorMesaj').style.color = calisiyor ? 'var(--yesil)' : 'var(--soluk)'
  $('portDeger').textContent = durum.port ? String(durum.port) : '—'
  $('otomatikBaslat').checked = Boolean(durum.otomatikBaslat)

  if (typeof durum.log === 'string') logYaz(durum.log)
  rozetGuncelle(durum)
}

function logYaz(metin) {
  const kutu = $('logKutusu')
  if (!kutu) return
  const dibe = kutu.scrollTop + kutu.clientHeight >= kutu.scrollHeight - 40
  kutu.textContent = metin || '(henüz kayıt yok)'
  if (dibe) kutu.scrollTop = kutu.scrollHeight
}

async function yenile() {
  try {
    const d = await window.mubis.durum()
    ekranaYaz(d)
  } catch (e) { console.error('Durum alınamadı:', e) }
}

// --------------------------------------------------------------- motor

$('baslatBtn').addEventListener('click', async () => {
  $('baslatBtn').disabled = true
  const r = await window.mubis.motorBaslat()
  if (r && !r.ok) alert(r.mesaj || 'Motor başlatılamadı.')
  setTimeout(yenile, 900)
})

$('durdurBtn').addEventListener('click', async () => {
  await window.mubis.motorDurdur()
  setTimeout(yenile, 700)
})

$('yenidenBtn').addEventListener('click', async () => {
  dugmeBeklet($('yenidenBtn'), true, 'Yeniden başlatılıyor…')
  await window.mubis.motorYeniden()
  setTimeout(() => { dugmeBeklet($('yenidenBtn'), false); yenile() }, 1600)
})

$('ayarSayfasiBtn').addEventListener('click', () => {
  window.mubis.disariAc('http://127.0.0.1:' + ((sonDurum && sonDurum.port) || 8765) + '/ayar')
})
$('indirmeBtn').addEventListener('click', () => window.mubis.indirmeKlasoruAc())
$('klasorBtn').addEventListener('click', () => window.mubis.klasorAc())
$('logBtn2').addEventListener('click', () => window.mubis.logAc())
$('gizleBtn').addEventListener('click', () => window.mubis.pencereKucult())
$('temizleBtn').addEventListener('click', () => { $('logKutusu').textContent = '(temizlendi)' })

$('otomatikBaslat').addEventListener('change', async (e) => {
  const r = await window.mubis.otomatikBaslat(e.target.checked)
  if (!(r && r.ok)) {
    alert((r && r.mesaj) || 'Ayar kaydedilemedi.')
    e.target.checked = !e.target.checked
  }
})

// ------------------------------------------------------------------ LUCA

let lucaBilgi = { uyeNo: '', kullanici: '', parola: '' }

async function lucaDoldur() {
  try {
    lucaBilgi = await window.mubis.lucaBilgi()
    if (lucaBilgi.uyeNo) $('uyeNo').value = lucaBilgi.uyeNo
    if (lucaBilgi.kullanici) $('kullanici').value = lucaBilgi.kullanici
    if (lucaBilgi.parola) $('parola').value = lucaBilgi.parola
  } catch { /* yoksay */ }
}

$('lucaForm').addEventListener('submit', async (e) => {
  e.preventDefault()
  mesaj('lucaMesaj', 'Kaydediliyor…')
  const r = await window.mubis.lucaKaydet({
    uyeNo: $('uyeNo').value,
    kullanici: $('kullanici').value,
    parola: $('parola').value
  })
  mesaj('lucaMesaj', (r && r.mesaj) || (r && r.ok ? 'Kaydedildi.' : 'Kaydedilemedi.'), r && r.ok ? 'basarili' : 'hatali')
  if (r && r.ok) { lucaBilgi = { uyeNo: $('uyeNo').value.trim(), kullanici: $('kullanici').value.trim(), parola: $('parola').value }; yenile() }
})

function lucaParametreleri() {
  return {
    lucaMember: ($('uyeNo').value || lucaBilgi.uyeNo || '').trim(),
    lucaUsername: ($('kullanici').value || lucaBilgi.kullanici || '').trim(),
    lucaPassword: ($('parola').value || lucaBilgi.parola || '').trim()
  }
}

$('lucaGirBtn').addEventListener('click', async () => {
  await isCalistir('luca-giris', lucaParametreleri(), {
    btn: $('lucaGirBtn'), mesajId: 'lucaMesaj', sonucId: 'lucaSonuc', beklemeMetni: 'Giriş yapılıyor…'
  })
})

$('lucaKapatBtn').addEventListener('click', async () => {
  await isCalistir('luca-oturumu-kapat', {}, { btn: $('lucaKapatBtn'), mesajId: 'lucaMesaj', sonucId: 'lucaSonuc' })
})

$('firmaGetirBtn').addEventListener('click', async () => {
  const p = lucaParametreleri()
  p.yil = ($('lucaYil').value || String(bugun.getFullYear())).trim()
  const j = await isCalistir('luca-firmalar-getir', p, {
    btn: $('firmaGetirBtn'), mesajId: 'lucaMesaj', sonucId: 'lucaSonuc', beklemeMetni: 'Firmalar getiriliyor…'
  })
  if (j && j.success !== false && Array.isArray(j.firmalar)) {
    sonucYaz('lucaSonuc', j.firmalar.map((f) => (f.ad || f.shortName || '') + '  —  ' + (f.vkn || f.tc || '')).join('\n'), 'basarili')
  }
})

// ---------------------------------------------------------------- FATURA

$('fatKaynak').addEventListener('change', () => {
  const gib = $('fatKaynak').value === 'gib'
  document.querySelectorAll('.gib-alan').forEach((l) => { l.style.display = gib ? 'flex' : 'none' })
})
document.querySelectorAll('.gib-alan').forEach((l) => { l.style.display = 'none' })

$('faturaBtn').addEventListener('click', async () => {
  const kaynak = $('fatKaynak').value
  const yil = ($('fatYil').value || String(bugun.getFullYear())).trim()
  const ay = $('fatAy').value
  if (kaynak === 'luca') {
    const p = Object.assign(lucaParametreleri(), {
      kaynak: 'luca', yil, ay: ay === '' ? null : Number(ay),
      sorguTip: 'efatura', yon: 'alis'
    })
    await isCalistir('efatura-sorgula', p, {
      btn: $('faturaBtn'), mesajId: 'faturaMesaj', sonucId: 'faturaSonuc', beklemeMetni: 'Luca sorgusu…'
    })
  } else {
    const p = {
      kullaniciKodu: $('gibKullanici').value.trim(),
      parola: $('gibParola').value.trim(),
      yil, ay: ay === '' ? null : Number(ay), yon: 'alis'
    }
    await isCalistir('earsiv-fatura-sorgula', p, {
      btn: $('faturaBtn'), mesajId: 'faturaMesaj', sonucId: 'faturaSonuc', beklemeMetni: 'GİB sorgusu…'
    })
  }
})

// ----------------------------------------------------------------- BEYAN

$('beyanBtn').addEventListener('click', async () => {
  const is = $('beyanIs').value
  const p = {
    kullaniciKodu: $('beyanKullanici').value.trim(),
    parola: $('beyanParola').value.trim(),
    tc: $('beyanTc').value.trim(),
    edevletSifre: $('beyanEdevlet').value
  }
  await isCalistir(is, p, { btn: $('beyanBtn'), mesajId: 'beyanMesaj', sonucId: 'beyanSonuc' })
})

// ------------------------------------------------------------------ BORÇ

$('gibBorcBtn').addEventListener('click', async () => {
  await isCalistir('gib-borc-sorgula', {
    kullaniciKodu: $('borcKullanici').value.trim(),
    parola: $('borcParola').value.trim()
  }, { btn: $('gibBorcBtn'), mesajId: 'borcMesaj', sonucId: 'borcSonuc' })
})

$('sgkBorcBtn').addEventListener('click', async () => {
  await isCalistir('sgk-borc-sorgula', {
    kullaniciAdi: $('sgkKullanici').value.trim(),
    isyeriKodu: $('sgkIsyeri').value.trim(),
    sistemSifre: $('sgkSistemSifre').value,
    isyeriSifre: $('sgkIsyeriSifre').value
  }, { btn: $('sgkBorcBtn'), mesajId: 'borcMesaj', sonucId: 'borcSonuc' })
})

// ------------------------------------------------------------------- DVS

$('dvsBtn').addEventListener('click', async () => {
  await isCalistir('dvs-sorgula', {
    kullaniciKodu: $('dvsKullanici').value.trim(),
    parola: $('dvsParola').value.trim(),
    yil: ($('dvsYil').value || String(bugun.getFullYear())).trim(),
    ay: Number($('dvsAy').value),
    tur: $('dvsTur').value
  }, { btn: $('dvsBtn'), mesajId: 'dvsMesaj', sonucId: 'dvsSonuc' })
})

// -------------------------------------------------------------- TEBLİGAT

$('tebSorguBtn').addEventListener('click', async () => {
  await isCalistir('etebligat', {
    kullaniciKodu: $('tebKullanici').value.trim(),
    parola: $('tebParola').value.trim()
  }, { btn: $('tebSorguBtn'), mesajId: 'tebMesaj', sonucId: 'tebSonuc' })
})

$('tebIndirBtn').addEventListener('click', async () => {
  await isCalistir('etebligat-indir', {
    kullaniciKodu: $('tebKullanici').value.trim(),
    parola: $('tebParola').value.trim()
  }, { btn: $('tebIndirBtn'), mesajId: 'tebMesaj', sonucId: 'tebSonuc' })
})

// -------------------------------------------------------------------- FİŞ

function fisParametreleri() {
  return Object.assign(lucaParametreleri(), {
    shortName: $('fisKisa').value.trim(),
    fullName: $('fisTam').value.trim(),
    vkn: $('fisVkn').value.trim(),
    yil: ($('fisYil').value || String(bugun.getFullYear())).trim(),
    ay: $('fisAy').value === '' ? null : Number($('fisAy').value)
  })
}

$('belgeOnizleBtn').addEventListener('click', async () => {
  const p = fisParametreleri()
  p.mod = 'onizle'
  await isCalistir('toplu-belge-duzenle', p, {
    btn: $('belgeOnizleBtn'), mesajId: null, sonucId: 'fisSonuc', beklemeMetni: 'Önizleniyor…'
  })
})

$('belgeUygulaBtn').addEventListener('click', async () => {
  const p = fisParametreleri()
  if (!p.shortName && !p.fullName && !p.vkn) { alert('Müşteri bilgisi girin.'); return }
  if (!confirm('Toplu belge türü/ödeme yöntemi düzeltmesi YAPILACAK ve KAYDEDİLECEK.\n\nDevam edilsin mi?')) return
  p.mod = 'uygula'
  await isCalistir('toplu-belge-duzenle', p, { btn: $('belgeUygulaBtn'), sonucId: 'fisSonuc', beklemeMetni: 'Uygulanıyor…' })
})

$('fisTaraBtn').addEventListener('click', async () => {
  const p = fisParametreleri()
  p.turler = ['empty', 'unbalanced', 'passive']
  await isCalistir('fis-tarama', p, { btn: $('fisTaraBtn'), sonucId: 'fisSonuc', beklemeMetni: 'Taranıyor…' })
})

$('fisBolBtn').addEventListener('click', async () => {
  const p = fisParametreleri()
  if (!p.shortName && !p.fullName && !p.vkn) { alert('Müşteri bilgisi girin.'); return }
  const donem = p.ay ? (p.yil + ' / ' + $('fisAy').selectedOptions[0].textContent) : (p.yil + ' yılı tamamı')
  if (!confirm('DİKKAT: ' + donem + ' dönemindeki TÜM FİŞLER Luca\'da BÖLÜNECEK.\nBu işlem kayıtları değiştirir ve geri alınamaz.\n\nDevam edilsin mi?')) return
  await isCalistir('fis-bol', p, { btn: $('fisBolBtn'), sonucId: 'fisSonuc', beklemeMetni: 'Bölünüyor…' })
})

// ------------------------------------------------------------- MÜKELLEF

let mukellefler = []
let mukSifreGizli = false

function mukHucre(deger) {
  const d = String(deger == null ? '' : deger).trim()
  if (!d) return '<span class="yok">—</span>'
  if (mukSifreGizli) return '<span class="sifre">••••••</span>'
  return '<span class="sifre">' + kacis(d) + '</span>'
}

function kacis(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

function mukCiz() {
  const govde = $('mukSatirlar')
  const ara = ($('mukAra').value || '').toLocaleLowerCase('tr').trim()
  const liste = mukellefler.filter((m) => {
    if (!ara) return true
    const metin = [m.kisaAd, m.ad, m.kimlik, m.gibKullanici, m.sgkKullanici, m.gibParola]
      .filter(Boolean).join(' ').toLocaleLowerCase('tr')
    return metin.includes(ara)
  })

  if (!liste.length) {
    govde.innerHTML = '<tr><td colspan="11" class="bos">' +
      (mukellefler.length ? 'Aramaya uyan kayıt yok.' : 'Henüz liste getirilmedi.') + '</td></tr>'
  } else {
    govde.innerHTML = liste.map((m, i) => {
      const hucreler = [
        mukHucre(m.gibKullanici),
        mukHucre(m.gibParola),
        mukHucre(m.vdSifreOtomatik),
        mukHucre(m.sgkKullanici),
        mukHucre(m.sgkIsyeriKodu),
        mukHucre(m.sgkSistemSifre || m.sgkIsyeriSifresi)
      ]
      return '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + kacis(m.kisaAd || '—') + '</td>' +
        '<td>' + kacis(m.ad || '—') + '</td>' +
        '<td>' + kacis(m.kimlik || '—') + '</td>' +
        hucreler.map((h) => '<td>' + h + '</td>').join('') +
        '<td><button class="kopya" data-kopya="' + m.__idx + '">kopyala</button></td>' +
        '</tr>'
    }).join('')
  }

  const toplam = mukellefler.length
  const gibVar = mukellefler.filter((m) => m.gibKullanici).length
  const sgkVar = mukellefler.filter((m) => m.sgkKullanici).length
  $('mukOzet').textContent = toplam
    ? `${toplam} mükellef · ${gibVar} GİB kullanıcı adı · ${sgkVar} SGK bilgisi${ara ? ` · ${liste.length} eşleşme` : ''}`
    : ''
  $('mukCsvBtn').disabled = !toplam
  $('mukKopyaBtn').disabled = !toplam
  $('mukGizleBtn').textContent = mukSifreGizli ? 'Şifreleri göster' : 'Şifreleri gizle'
}

function mukSatirKopyala(idx) {
  const m = mukellefler.find((x) => x.__idx === idx)
  if (!m) return
  const satir = [
    m.kisaAd, m.ad, m.kimlik, m.gibKullanici, m.gibParola, m.vdSifreOtomatik,
    m.sgkKullanici, m.sgkIsyeriKodu, m.sgkSistemSifre, m.sgkIsyeriSifresi
  ].map((x) => (x == null ? '' : x)).join('\t')
  navigator.clipboard.writeText(satir).then(
    () => mesaj('mukMesaj', 'Satır kopyalandı.', 'basarili'),
    () => mesaj('mukMesaj', 'Kopyalanamadı.', 'hatali')
  )
}

$('mukGetirBtn').addEventListener('click', async () => {
  const p = Object.assign(lucaParametreleri(), {
    yil: ($('mukYil').value || String(bugun.getFullYear())).trim()
  })
  if (!p.lucaMember || !p.lucaUsername || !p.lucaPassword) {
    mesaj('mukMesaj', 'Önce Luca giriş bilgilerini kaydedin (Luca ekranı).', 'hatali')
    return
  }
  dugmeBeklet($('mukGetirBtn'), true, 'Luca okunuyor…')
  mesaj('mukMesaj', 'Luca açılıyor; giriş + firma listesi + GİB ŞİRKET tablosu okunuyor. Bu işlem birkaç dakika sürebilir…')
  try {
    const j = await window.mubis.isCalistir('luca-firmalar-getir', p)
    if (!j || j.success === false) {
      mesaj('mukMesaj', 'Hata: ' + ((j && (j.error || j.not)) || 'bilinmeyen'), 'hatali')
      return
    }
    const liste = Array.isArray(j.firmalar) ? j.firmalar : (Array.isArray(j.sirketler) ? j.sirketler : [])
    mukellefler = liste.map((m, i) => Object.assign({}, m, { __idx: i }))
    mukCiz()
    const gibVar = mukellefler.filter((m) => m.gibKullanici).length
    mesaj('mukMesaj', `${mukellefler.length} mükellef getirildi (${gibVar} tanesinde GİB kullanıcı adı var).`, 'basarili')
  } catch (e) {
    mesaj('mukMesaj', 'Hata: ' + (e && e.message), 'hatali')
  } finally {
    dugmeBeklet($('mukGetirBtn'), false)
  }
})

$('mukGizleBtn').addEventListener('click', () => { mukSifreGizli = !mukSifreGizli; mukCiz() })
$('mukAra').addEventListener('input', () => mukCiz())

$('mukSatirlar').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-kopya]')
  if (btn) mukSatirKopyala(Number(btn.dataset.kopya))
})

$('mukCsvBtn').addEventListener('click', async () => {
  if (!mukellefler.length) return
  const basliklar = [
    'Kısa Ad', 'Unvan', 'VKN/TCKN', 'GİB Kullanıcı Adı', 'GİB Parola', 'V.D. Şifresi',
    'SGK Kullanıcı', 'SGK İşyeri Kodu', 'SGK Sistem Şifresi', 'SGK İşyeri Şifresi'
  ]
  const kacisCsv = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'
  const satirlar = [basliklar.map(kacisCsv).join(';')]
  for (const m of mukellefler) {
    satirlar.push([
      m.kisaAd, m.ad, m.kimlik, m.gibKullanici, m.gibParola, m.vdSifreOtomatik,
      m.sgkKullanici, m.sgkIsyeriKodu, m.sgkSistemSifre, m.sgkIsyeriSifresi
    ].map(kacisCsv).join(';'))
  }
  const r = await window.mubis.dosyaKaydet({
    ad: 'mubis-mukellef-bilgileri-' + new Date().toISOString().slice(0, 10) + '.csv',
    icerik: satirlar.join('\r\n')
  })
  if (r && r.ok) mesaj('mukMesaj', 'Kaydedildi: ' + r.yol, 'basarili')
  else if (r && !r.iptal) mesaj('mukMesaj', 'Kaydedilemedi: ' + (r.mesaj || ''), 'hatali')
})

$('mukKopyaBtn').addEventListener('click', async () => {
  if (!mukellefler.length) return
  const basliklar = ['Kısa Ad', 'Unvan', 'VKN/TCKN', 'GİB Kullanıcı Adı', 'GİB Parola', 'V.D. Şifresi', 'SGK Kullanıcı', 'SGK İşyeri Kodu', 'SGK Sistem Şifresi', 'SGK İşyeri Şifresi']
  const satirlar = [basliklar.join('\t')]
  for (const m of mukellefler) {
    satirlar.push([
      m.kisaAd, m.ad, m.kimlik, m.gibKullanici, m.gibParola, m.vdSifreOtomatik,
      m.sgkKullanici, m.sgkIsyeriKodu, m.sgkSistemSifre, m.sgkIsyeriSifresi
    ].map((x) => (x == null ? '' : x)).join('\t'))
  }
  try {
    await navigator.clipboard.writeText(satirlar.join('\n'))
    mesaj('mukMesaj', 'Tablo panoya kopyalandı — Excel\'e doğrudan yapıştırabilirsiniz.', 'basarili')
  } catch {
    mesaj('mukMesaj', 'Panoya kopyalanamadı.', 'hatali')
  }
})

// ------------------------------------------------------- FATURA DOLDURMA

function efFatura() {
  const f = {}
  const koy = (k, v) => { if (String(v || '').trim()) f[k] = String(v).trim() }
  koy('vkn', $('efVkn').value)
  koy('unvan', $('efUnvan').value)
  koy('tarih', $('efFTarih').value)
  koy('faturaNo', $('efFno').value)
  koy('malHizmet', $('efMal').value)
  koy('miktar', $('efMiktar').value)
  koy('birimFiyat', $('efFiyat').value)
  koy('kdvOrani', $('efKdv').value)
  return f
}

$('efBtn').addEventListener('click', async () => {
  const is = $('efIs').value
  const p = {
    kullaniciKodu: $('efKullanici').value.trim(),
    parola: $('efParola').value.trim(),
    tarih1: $('efTarih').value.trim() || null,
    fatura: efFatura(),
    kartTipi: $('efKartTipi').value || undefined,
    pin: $('efPin').value || undefined
  }
  await isCalistir(is, p, {
    btn: $('efBtn'), mesajId: 'efMesaj', sonucId: 'efSonuc', beklemeMetni: 'GİB ekranı hazırlanıyor…'
  })
})

// ----------------------------------------------------------- DEFTER BEYAN

function dbGirisParametreleri() {
  return {
    kullaniciKodu: $('dbKullanici').value.trim(),
    kullanici: $('dbKullanici').value.trim(),
    parola: $('dbParola').value.trim(),
    vkn: $('dbVkn').value.trim(),
    baslangic: $('dbBas').value.trim() || undefined,
    bitis: $('dbBit').value.trim() || undefined
  }
}

$('dbGirisBtn').addEventListener('click', async () => {
  await isCalistir('defterbeyan-giris', dbGirisParametreleri(), {
    btn: $('dbGirisBtn'), mesajId: 'dbMesaj', sonucId: 'dbSonuc', beklemeMetni: 'Defter Beyan açılıyor…'
  })
})

$('dbOzetBtn').addEventListener('click', async () => {
  await isCalistir('defterbeyan-hesap-ozeti', dbGirisParametreleri(), {
    btn: $('dbOzetBtn'), mesajId: 'dbMesaj', sonucId: 'dbSonuc', beklemeMetni: 'Hesap özeti okunuyor…'
  })
})

$('dbGeciciBtn').addEventListener('click', async () => {
  await isCalistir('defterbeyan-gecici-vergi', {
    yil: ($('dbYil').value || String(bugun.getFullYear())).trim(),
    donemAy: Number($('dbAy').value)
  }, { btn: $('dbGeciciBtn'), mesajId: 'dbMesaj', sonucId: 'dbSonuc', beklemeMetni: 'Geçici vergi okunuyor…' })
})

$('dbOrtaklikBtn').addEventListener('click', async () => {
  const vknler = $('dbVknler').value.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean)
  if (!vknler.length) { mesaj('dbMesaj', 'Ortaklık VKN listesi girin.', 'hatali'); return }
  await isCalistir('defterbeyan-ortaklik-beyanlari', {
    vknler,
    yil: ($('dbYil').value || String(bugun.getFullYear())).trim(),
    donemAy: Number($('dbAy').value)
  }, { btn: $('dbOrtaklikBtn'), mesajId: 'dbMesaj', sonucId: 'dbSonuc', beklemeMetni: 'Ortaklık beyanları okunuyor…' })
})

$('dbDonemSonuBtn').addEventListener('click', async () => {
  if (!confirm('Dönem sonu işlemi GÖNDERİLECEK. Bu işlem geri alınamaz.\n\nDevam edilsin mi?')) return
  await isCalistir('defterbeyan-donem-sonu-gonder', {
    donemSonu: { yil: ($('dbYil').value || String(bugun.getFullYear())).trim(), ay: Number($('dbAy').value) }
  }, { btn: $('dbDonemSonuBtn'), mesajId: 'dbMesaj', sonucId: 'dbSonuc', beklemeMetni: 'Gönderiliyor…' })
})

// ------------------------------------------------------------------ ÖDEME

$('gibOdemeBtn').addEventListener('click', async () => {
  await isCalistir('gib-odeme', {
    kullaniciKodu: $('odKullanici').value.trim(),
    parola: $('odParola').value.trim(),
    yil: ($('odYil').value || String(bugun.getFullYear())).trim(),
    ay: Number($('odAy').value)
  }, { btn: $('gibOdemeBtn'), mesajId: 'odMesaj', sonucId: 'odSonuc', beklemeMetni: 'Ödeme ekranı açılıyor…' })
})

$('tecOdemeBtn').addEventListener('click', async () => {
  await isCalistir('tecilli-odeme', {
    vkn: $('tecVkn').value.trim(),
    belgeNo: $('tecBelge').value.trim(),
    tahakkukNo: $('tecTahakkuk').value.trim(),
    il: $('tecIl').value.trim(),
    vergiDairesi: $('tecVd').value.trim()
  }, { btn: $('tecOdemeBtn'), mesajId: 'odMesaj', sonucId: 'odSonuc', beklemeMetni: 'Ödeme ekranı açılıyor…' })
})

$('sgkOdemeBtn').addEventListener('click', async () => {
  await isCalistir('sgk-odeme', {
    kullaniciAdi: $('odSgkKullanici').value.trim(),
    isyeriKodu: $('odSgkIsyeri').value.trim(),
    sistemSifre: $('odSgkSistem').value,
    isyeriSifre: $('odSgkIsyeriSifre').value
  }, { btn: $('sgkOdemeBtn'), mesajId: 'odMesaj', sonucId: 'odSonuc', beklemeMetni: 'SGK ödeme ekranı açılıyor…' })
})

// -------------------------------------------------------------- GÖNDERİM

$('waBtn').addEventListener('click', async () => {
  const tel = $('waTelefon').value.trim()
  const msg = $('waMesaj').value
  if (!tel) { mesaj('waMesajDurum', 'Telefon numarası girin.', 'hatali'); return }
  if (!msg.trim()) { mesaj('waMesajDurum', 'Mesaj boş.', 'hatali'); return }
  if (!confirm('WhatsApp mesajı gönderilecek:\n\n' + tel + '\n\nDevam edilsin mi?')) return
  await isCalistir($('waYontem').value, {
    telefon: tel, phone: tel, mesaj: msg, message: msg
  }, { btn: $('waBtn'), mesajId: 'waMesajDurum', sonucId: 'gonderimSonuc', beklemeMetni: 'Gönderiliyor…' })
})

$('mailBtn').addEventListener('click', async () => {
  const p = {
    host: $('mailHost').value.trim(),
    port: Number($('mailPort').value) || 465,
    user: $('mailUser').value.trim(),
    pass: $('mailPass').value,
    from: $('mailFrom').value.trim(),
    to: $('mailTo').value.trim(),
    subject: $('mailKonu').value.trim(),
    mesaj: $('mailMesaj').value
  }
  if (!p.host || !p.user || !p.to) { mesaj('mailDurum', 'Sunucu, kullanıcı ve alıcı zorunludur.', 'hatali'); return }
  if (!confirm('E-posta gönderilecek: ' + p.to + '\n\nDevam edilsin mi?')) return
  await isCalistir('mail-gonder', p, {
    btn: $('mailBtn'), mesajId: 'mailDurum', sonucId: 'gonderimSonuc', beklemeMetni: 'Gönderiliyor…'
  })
})

function efEdefterDurum() {
  window.mubis.edefterDurum().then((r) => {
    $('edefterDurum').textContent = r && r.ok ? 'Kurulu' : 'Kurulu değil'
    $('edefterDurum').style.color = r && r.ok ? 'var(--yesil)' : 'var(--kirmizi)'
    $('edefterYol').textContent = (r && r.yol) || '—'
    $('edefterAcBtn').disabled = !(r && r.ok)
  }).catch(() => {
    $('edefterDurum').textContent = 'Kontrol edilemedi'
    $('edefterDurum').style.color = 'var(--kirmizi)'
  })
}

$('edefterKurBtn').addEventListener('click', async () => {
  dugmeBeklet($('edefterKurBtn'), true, 'Kurulum açılıyor…')
  const r = await window.mubis.edefterKur()
  mesaj('edefterMesaj', (r && r.mesaj) || (r && r.ok ? 'Tamam.' : 'Başarısız.'), r && r.ok ? 'basarili' : 'hatali')
  dugmeBeklet($('edefterKurBtn'), false)
  setTimeout(efEdefterDurum, 1500)
})

$('edefterAcBtn').addEventListener('click', async () => {
  dugmeBeklet($('edefterAcBtn'), true, 'Açılıyor…')
  const r = await window.mubis.edefterAc()
  mesaj('edefterMesaj', (r && r.mesaj) || (r && r.ok ? 'Tamam.' : 'Başarısız.'), r && r.ok ? 'basarili' : 'hatali')
  dugmeBeklet($('edefterAcBtn'), false)
})

$('edefterDurumBtn').addEventListener('click', () => efEdefterDurum())

document.querySelectorAll('#sayfa-edefter [data-ac]').forEach((btn) => {
  btn.addEventListener('click', () => window.mubis.disariAc(btn.getAttribute('data-ac')))
})

// ---------------------------------------------------------------- AYARLAR

async function ayarlariDoldur() {
  try {
    const a = await window.mubis.gibAyarOku()
    if (a.gib && a.gib.kullaniciKodu) $('ayGibKullanici').value = a.gib.kullaniciKodu
    if (a.gib && a.gib.parola) $('ayGibParola').value = a.gib.parola
    if (a.captcha_api_key) $('ayCaptcha').value = a.captcha_api_key
    if (a.desktop_anahtari) $('ayDesktop').value = a.desktop_anahtari
    // Sorgu ekranlarina da varsayilanlari tasi
    if (a.gib && a.gib.kullaniciKodu) {
      for (const id of ['gibKullanici', 'beyanKullanici', 'borcKullanici', 'dvsKullanici', 'tebKullanici']) {
        if ($(id) && !$(id).value) $(id).value = a.gib.kullaniciKodu
      }
    }
    if (a.gib && a.gib.parola) {
      for (const id of ['gibParola', 'beyanParola', 'borcParola', 'dvsParola', 'tebParola']) {
        if ($(id) && !$(id).value) $(id).value = a.gib.parola
      }
    }
  } catch { /* yoksay */ }
}

$('ayarKaydetBtn').addEventListener('click', async () => {
  const r = await window.mubis.gibAyarYaz({
    gib: { kullaniciKodu: $('ayGibKullanici').value.trim(), parola: $('ayGibParola').value.trim() },
    captcha_api_key: $('ayCaptcha').value,
    desktop_anahtari: $('ayDesktop').value
  })
  mesaj('ayarMesaj', (r && r.mesaj) || 'Kaydedildi.', r && r.ok ? 'basarili' : 'hatali')
  if (r && r.ok) await ayarlariDoldur()
})

// ------------------------------------------------------------------ başlat

function varsayilanlariDoldur() {
  const yil = String(bugun.getFullYear())
  for (const id of ['lucaYil', 'fatYil', 'fisYil', 'dvsYil', 'mukYil', 'dbYil', 'odYil']) {
    if ($(id) && !$(id).value) $(id).value = yil
  }
  if ($('fatAy') && !$('fatAy').value) $('fatAy').value = String(bugun.getMonth() + 1)
  if ($('dvsAy')) $('dvsAy').value = String(bugun.getMonth() + 1)
  if ($('dbAy')) $('dbAy').value = String(bugun.getMonth() + 1)
  if ($('odAy')) $('odAy').value = String(bugun.getMonth() + 1)
  // Donem baslangic/bitis varsayilanlari (yil basi / bugun)
  const iki = (n) => String(n).padStart(2, '0')
  if ($('dbBas') && !$('dbBas').value) $('dbBas').value = '01/01/' + yil
  if ($('dbBit') && !$('dbBit').value) $('dbBit').value = iki(bugun.getDate()) + '/' + iki(bugun.getMonth() + 1) + '/' + yil
}

window.mubis.durumDinle((d) => ekranaYaz(d))
window.mubis.logDinle((m) => logYaz(m))

varsayilanlariDoldur()
yenile()
lucaDoldur()
ayarlariDoldur()
efEdefterDurum()
setInterval(yenile, 6000)
