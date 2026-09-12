// GIB Dijital Vergi Dairesi - "Belge Numarasi Ile Odeme" form doldurucu
//
// GIB baska bir alan adi (cross-origin) oldugu icin sayfayi acarken formu
// otomatik dolduramayiz. Bunun yerine bu yardimci program kucuk bir
// JavaScript parcasini ("doldurucu") uretir. Kullanici GIB odeme sayfasini
// actiktan sonra doldurucuyu adres cubuguna yapistirir (basina "javascript:"
// yazarak) veya bir yer imine (bookmarklet) kaydeder. Script:
//   1. T.C./VKN ve tahakkuk fis numarasini yazar
//   2. Il ve Vergi Dairesi acilir listelerinden eslesen secenegi secer
//   3. Guvenlik kodunu sorar ve ilgili alana yazar
//   4. "SORGULA'ya basin" diye hatirlatir

const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")

export function buildGibDoldurScript({ vkn, tahakkukNo, il, vergiDairesi }) {
  return `(function(){var V='${esc(vkn)}',T='${esc(tahakkukNo)}',IL='${esc(il)}',VD='${esc(vergiDairesi)}';
function etiket(el){var n=el;var t='';for(var i=0;i<6&&n;i++){t=(n.getAttribute&&(n.getAttribute('aria-label')||n.getAttribute('placeholder')))||'';if(!t&&n.textContent)t=n.textContent;if(t&&t.trim().length>2)break;n=n.parentElement}return (t||'').toLocaleLowerCase('tr')}
function yaz(inp,v){inp.value=v;inp.dispatchEvent(new Event('input',{bubbles:true}));inp.dispatchEvent(new Event('change',{bubbles:true}));inp.dataset.gib='1'}
function sec(sl,want){want=(want||'').toLocaleUpperCase('tr');if(!want)return;var op=[].slice.call(sl.options).find(function(o){return o.text.trim().toLocaleUpperCase('tr').indexOf(want)>=0});if(op){sl.value=op.value;sl.dispatchEvent(new Event('change',{bubbles:true}));sl.dataset.gib='1'}}
var inputs=[].slice.call(document.querySelectorAll('input[type=text],input:not([type])'));
inputs.forEach(function(inp){if(inp.dataset.gib)return;var l=etiket(inp);if(/kimlik/.test(l))yaz(inp,V);else if(/takip|tahakkuk|belge/.test(l))yaz(inp,T)});
[].slice.call(document.querySelectorAll('select')).forEach(function(sl){if(sl.dataset.gib)return;var l=etiket(sl);if(/dairesi|daire/.test(l))sec(sl,VD);else if(/(^|[^a-z])il([^a-z]|$)|ilinin|iller/.test(l))sec(sl,IL)});
var guvenlik=inputs.find(function(i){return /guvenlik/.test(etiket(i))});
if(guvenlik&&!guvenlik.value){var kod=prompt('Guvenlik kodunu girin:');if(kod)yaz(guvenlik,kod.trim())}
alert('Form dolduruldu. Guvenlik kodunu girdiyseniz SORGULA butonuna basin.')})();`
}

// Yer imine (bookmarklet) hazir formda dondurur
export function buildGibBookmarklet(params) {
  return `javascript:${buildGibDoldurScript(params)}`
}

// ------------------------------------------------------------
// Yerel yardimci servis (Luca Baglanti Merkezi benzeri)
// Bilgisayarda "gib-yardimci" klasorundeki baslat.bat ile servis
// acilirsa (port 8765) GIB formu tarayicide otomatik doldurulur.
// ------------------------------------------------------------

const YARDIMCI_BASE = 'http://127.0.0.1:8765'

import { supabase } from '../lib/supabase'

// Musterinin MUBiS'te kayitli kurum erisim bilgilerini getirir.
// Yardimci program giris gerektiren islerde bunlari kullanir;
// config.json sadece yedek olarak kalir.
// Not: select('*') ile cekilir - sutun adlari tablolar arasi degisebildigi
// icin il/vergi dairesi birkac olasi isimle aranir.
export async function musteriGirisBilgileriGetir(clientId) {
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single()
    if (error || !data) {
      if (error) console.error('Kurum erisim bilgileri okunamadi:', error)
      return null
    }
    // Il/vergi dairesi farkli sutun adlarinda olabilir - sirayla dene
    return {
      ...data,
      il: data.city || data.sehir || data.il || '',
      vergiDairesi: data.tax_office || data.vergi_dairesi || data.vergiDairesi || '',
      // Dijital Vergi Dairesi giris bilgileri (camelCase / snake_case / Turkce her form desteklenir)
      dvs_username: data.dvs_username || data.dvsUsername || data.dvs_user || data.dvsKullaniciAdi || data.dvs_kullanici_adi || data.gib_username || data.gib_kullanici_adi || '',
      dvs_password: data.dvs_password || data.dvsPassword || data.dvs_parola || data.dvs_sifre || data.dvsSifre || data.gib_password || data.gib_sifre || data.gib_parola || '',
      // SGK e-Bildirge giris bilgileri (camelCase / snake_case / Turkce her form desteklenir)
      sgk_username: data.sgk_username || data.sgkUser || data.sgk_user || data.sgkKullaniciAdi || data.sgk_kullanici_adi || '',
      sgk_password: data.sgk_password || data.sgkSistemSifre || data.sgk_sistem_sifre || data.sgk_sifre || data.sgkSifre || data.sgk_system_password || '',
      sgk_work_password: data.sgk_work_password || data.sgkIsyeriSifre || data.sgk_isyeri_sifre || data.sgk_is_yeri_sifre || '',
      sgkIsyeriKodu: data.sgkIsyeriKodu || data.sgk_isyeri_kodu || ''
    }
  } catch (e) {
    console.error('Kurum erisim bilgileri alinamadi:', e)
    return null
  }
}

// e-Devlet gerektiren islemler (e-Tebligat, SGK odemesi) icin kimlik bilgisi dondurur.
// Sirket musterilerinde isaretli ortak (partners.edevlet_aktif = true) varsa onun
// TC + e-Devlet sifresi onceliklidir; yoksa musterinin kendi bilgileri kullanilir.
export async function edevletKimlikGetir(clientId, giris = null) {
  if (!giris && clientId) {
    try { giris = await musteriGirisBilgileriGetir(clientId) } catch { giris = null }
  }
  let tc = giris?.vkn || giris?.tc || ''
  let edevletPass = giris?.edevlet_pass || ''
  try {
    const { data: ortak } = await supabase
      .from('partners')
      .select('name, tc, edevlet_sifre')
      .eq('client_id', clientId)
      .eq('edevlet_aktif', true)
      .maybeSingle()
    if (ortak?.tc && ortak?.edevlet_sifre) {
      tc = ortak.tc
      edevletPass = ortak.edevlet_sifre
    }
  } catch { /* kolon yoksa / ortak yoksa musteri bilgileri kullanilir */ }
  return { tc, edevletPass, giris }
}

// Durum: 'ok' | 'kurulu-degil' | 'erisim-engelli' | 'bilinmeyen-servis'
// 'erisim-engelli' = servis calisiyor ama tarayici okumayi engelliyor (eski surum)
export async function gibYardimciDurumu() {
  try {
    const r = await fetch(`${YARDIMCI_BASE}/ping`, { signal: AbortSignal.timeout(2000) })
    if (!r.ok) return 'yanlis-yanit'
    const j = await r.json().catch(() => ({}))
    return j?.app === 'mubis-gib-yardimci' ? 'ok' : 'bilinmeyen-servis'
  } catch (e) {
    // Servis ayakta olabilir ama CORS/Private-Network engeli var: no-cors ile seslen
    try {
      await fetch(`${YARDIMCI_BASE}/ping`, { mode: 'no-cors', signal: AbortSignal.timeout(2000) })
      return 'erisim-engelli'
    } catch (e2) {
      return 'kurulu-degil'
    }
  }
}

// Genel is gonderici: gibYardimciIs('gib-odeme', {vkn, ...})
// Mevcut isler: gib-odeme, gib-giris, etebildirge, beyanname-indir, tahakkuk-indir
export async function gibYardimciIs(isAdi, params = {}) {
  try {
    const durum = await gibYardimciDurumu()
    if (durum !== 'ok') return { ok: false, reason: durum }

    const r = await fetch(`${YARDIMCI_BASE}/is`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is: isAdi, ...params }),
      signal: AbortSignal.timeout(90000)
    })
    const j = await r.json().catch(() => ({}))
    if (j?.success) return { ok: true, ...j }
    return { ok: false, reason: j?.error || 'servis-hatasi' }
  } catch (e) {
    return { ok: false, reason: e?.name === 'TimeoutError' ? 'servis-yanit-vermedi' : 'servis-hatasi' }
  }
}

export async function gibYardimciIleDoldur(bilgi) {
  return gibYardimciIs('gib-odeme', {
    vkn: bilgi.vkn || '',
    tahakkukNo: bilgi.tahakkukNo || '',
    il: bilgi.il || '',
    vergiDairesi: bilgi.vergiDairesi || ''
  })
}

// GIB Dijital Vergi Dairesi'nden musterinin vadesi gecmis vergi borcunu canli sorgular.
// Yardimci program: https://dijital.gib.gov.tr/portal/login acar, kullanici kodu/parola
// doldurur, guvenlik kodu kullaniciya birakilir, giris sonrasi "Vadesi Gecmis Borclar"
// kutusundaki rakami okur.
export async function gibBorcSorgula(clientId) {
  const giris = await musteriGirisBilgileriGetir(clientId)
  if (!giris?.dvs_username || !giris?.dvs_password) {
    return { ok: false, reason: 'gib-sifre-eksik' }
  }
  const res = await gibYardimciIs('gib-borc-sorgula', {
    kullaniciKodu: giris.dvs_username,
    parola: giris.dvs_password
  })
  if (!res.ok) return res
  return { ok: true, borc: Number(res.borc) || 0, not: res.not }
}

// SGK e-Bildirge'den isveren borcunu canli sorgular.
export async function sgkBorcSorgula(clientId) {
  const giris = await musteriGirisBilgileriGetir(clientId)
  const eksikler = []
  if (!giris?.sgk_username) eksikler.push('kullanici adi')
  if (!giris?.sgk_password) eksikler.push('sistem sifresi')
  if (!giris?.sgk_work_password) eksikler.push('isyeri sifresi')
  if (eksikler.length > 0) {
    return { ok: false, reason: 'sgk-sifre-eksik', detail: 'Eksik alanlar: ' + eksikler.join(', ') }
  }
  const res = await gibYardimciIs('sgk-borc-sorgula', {
    kullaniciAdi: giris.sgk_username,
    sistemSifre: giris.sgk_password,
    isyeriSifre: giris.sgk_work_password,
    isyeriKodu: giris.sgkIsyeriKodu || ''
  })
  if (!res.ok) return res
  return {
    ok: true,
    sadeceBorclar: Number(res.sadeceBorclar) || 0,
    gecikmeZammi: Number(res.gecikmeZammi) || 0,
    toplam: Number(res.toplam) || 0,
    not: res.not
  }
}

// Yardimci programin "indirilenler" klasorundeki belgeleri listeler
// Donus: [{ ad, boyut, tarih }] (tarih = mtime ms) veya hata
export async function gibDosyalariListele() {
  const r = await fetch(`${YARDIMCI_BASE}/dosyalar`, { signal: AbortSignal.timeout(5000) })
  if (!r.ok) throw new Error('Dosya listesi alinamadi')
  const j = await r.json()
  if (!j?.ok) throw new Error(j?.error || 'Dosya listesi alinamadi')
  return j.dosyalar || []
}

// Belirtilen belgeyi Blob olarak getirir
export async function gibDosyaGetir(ad) {
  const r = await fetch(`${YARDIMCI_BASE}/dosya?ad=${encodeURIComponent(ad)}`, { signal: AbortSignal.timeout(60000) })
  if (!r.ok) throw new Error('Belge yardimci programdan okunamadi')
  return r.blob()
}
