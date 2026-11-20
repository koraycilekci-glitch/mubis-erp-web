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

function sunucuAyarOku() {
  try {
    const ham = localStorage.getItem('mubis_sunucu')
    if (!ham) return null
    const j = JSON.parse(ham)
    if (!j?.url) return null
    const url = String(j.url).replace(/\/+$/, '')
    if ('anahtar' in j) localStorage.setItem('mubis_sunucu', JSON.stringify({ url }))
    return { url }
  } catch { return null }
}

export function sunucuModuAktif() { return !!sunucuAyarOku() }

function YARDIMCI_BASE() {
  // 2.8.2: Sunucu modunda VPS IP'sine dogrudan degil, ayni-origin proxy
  // (/api/yardimci -> Cloudflare Function) uzerinden gidilir. HTTPS sayfadan
  // http://IP:8765 fetch Chrome'un mixed-content engeline takilir.
  if (sunucuAyarOku()) return '/api/yardimci'
  return 'http://127.0.0.1:8765'
}

function yardimciBasliklar(ek = {}) {
  return { 'Content-Type': 'application/json', ...ek }
}

export async function yardimciFetch(url, options = {}) {
  if (typeof url !== 'string' || !url.startsWith('/api/yardimci/')) return globalThis.fetch(url, options)
  const { data, error } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (error || !token) throw new Error('Sunucu yardımcısı için oturum açın')
  const headers = new Headers(options.headers || {})
  headers.delete('x-mubis-key')
  headers.set('Authorization', `Bearer ${token}`)
  return globalThis.fetch(url, { ...options, headers })
}

// Luca Baglanti Merkezi (LucaProxy) — SGK e-vizite sorgulari bu proxy
// uzerinden yapilir (captcha/SMS proxy icinde halledilir).
const LUCA_PROXY_BASE = 'http://localhost:15822'
const LUCA_VIZITE_SURUM = '20250708001'

// Durum: 'ok' | 'kurulu-degil' | 'surum-eski' | 'yanlis-yanit' | 'bilinmeyen-servis'
export async function lucaProxyDurumu() {
  try {
    const r = await yardimciFetch(`${LUCA_PROXY_BASE}/test.json?t=${Date.now()}`, { signal: AbortSignal.timeout(4000) })
    if (!r.ok) return 'yanlis-yanit'
    const j = await r.json().catch(() => ({}))
    if (j?.vizite === LUCA_VIZITE_SURUM) return 'ok'
    if (j?.vizite) return 'surum-eski'
    return 'bilinmeyen-servis'
  } catch {
    return 'kurulu-degil'
  }
}

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
      sgkIsyeriKodu: data.sgkIsyeriKodu || data.sgk_isyeri_kodu || '',
      // e-Imza akilli kart bilgileri (camelCase / snake_case desteklenir)
      kartTipi: data.kartTipi || data.kart_tipi || data.akilli_kart_tipi || '',
      kartSifre: data.kartSifre || data.kart_sifre || data.akilli_kart_sifre || ''
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

// Otomasyon Merkezi icin secili musterilerin sorgu kimlik bilgilerini tek
// seferde toplar (DVS, SGK e-Bildirge, e-Devlet/etebligat). Yazilim bu
// bilgileri yerel yardimci programdaki otomasyon planina yazar; plan
// kullanicinin kendi bilgisayarinda kalir.
export async function otomasyonMusteriBilgileriGetir(clientIds) {
  if (!clientIds?.length) return []
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .in('id', clientIds)
  if (error) throw new Error('Musteri bilgileri okunamadi: ' + error.message)

  // e-Devlet gerektiren sorgularda (e-Tebligat/UETS) isaretli ortak varsa
  // onun TC + e-Devlet sifresi onceliklidir
  const ortaklar = {}
  try {
    const { data: pList } = await supabase
      .from('partners')
      .select('client_id, tc, edevlet_sifre')
      .in('client_id', clientIds)
      .eq('edevlet_aktif', true)
    for (const p of pList || []) if (p.tc && p.edevlet_sifre) ortaklar[p.client_id] = p
  } catch { /* partners tablosu yoksa musterinin kendi bilgileri kullanilir */ }

  return (data || []).map(c => {
    const ortak = ortaklar[c.id]
    return {
      id: c.id,
      name: c.name || c.unvan || 'Musteri',
      vkn: c.vkn || c.vergi_no || '',
      tc: c.tc || c.tckn || '',
      dvs_username: c.dvs_username || c.dvsUsername || c.dvs_user || c.dvsKullaniciAdi || c.dvs_kullanici_adi || c.gib_username || c.gib_kullanici_adi || '',
      dvs_password: c.dvs_password || c.dvsPassword || c.dvs_parola || c.dvs_sifre || c.dvsSifre || c.gib_password || c.gib_sifre || c.gib_parola || '',
      sgk_username: c.sgk_username || c.sgkUser || c.sgk_user || c.sgkKullaniciAdi || c.sgk_kullanici_adi || '',
      sgk_password: c.sgk_password || c.sgkSistemSifre || c.sgk_sistem_sifre || c.sgk_sifre || c.sgkSifre || c.sgk_system_password || '',
      sgk_work_password: c.sgk_work_password || c.sgkIsyeriSifre || c.sgk_isyeri_sifre || c.sgk_is_yeri_sifre || '',
      sgk_isyeri_kodu: c.sgkIsyeriKodu || c.sgk_isyeri_kodu || '',
      edevlet_tc: ortak?.tc || c.tc || c.tckn || c.vkn || '',
      edevlet_pass: ortak?.edevlet_sifre || c.edevlet_pass || ''
    }
  })
}

// Durum: 'ok' | 'kurulu-degil' | 'erisim-engelli' | 'bilinmeyen-servis'
// 'erisim-engelli' = servis calisiyor ama tarayici okumayi engelliyor (eski surum)
export async function gibYardimciDurumu() {
  try {
    const r = await yardimciFetch(`${YARDIMCI_BASE()}/ping`, { headers: yardimciBasliklar(), signal: AbortSignal.timeout(sunucuModuAktif() ? 6000 : 2000) })
    if (!r.ok) return 'yanlis-yanit'
    const j = await r.json().catch(() => ({}))
    return j?.app === 'mubis-gib-yardimci' ? 'ok' : 'bilinmeyen-servis'
  } catch (e) {
    // Servis ayakta olabilir ama CORS/Private-Network engeli var: no-cors ile seslen
    try {
      await yardimciFetch(`${YARDIMCI_BASE()}/ping`, { mode: 'no-cors', signal: AbortSignal.timeout(2000) })
      return 'erisim-engelli'
    } catch (e2) {
      return 'kurulu-degil'
    }
  }
}

// Calisan yardimci programin surumunu dondurur ('2.2.0' gibi) veya null
export async function gibYardimciSurumu() {
  try {
    const r = await yardimciFetch(`${YARDIMCI_BASE()}/ping`, { headers: yardimciBasliklar(), signal: AbortSignal.timeout(sunucuModuAktif() ? 6000 : 2000) })
    if (!r.ok) return null
    const j = await r.json().catch(() => null)
    return j?.app === 'mubis-gib-yardimci' ? (j.version || null) : null
  } catch {
    return null
  }
}

export async function gibYerelYardimciSurumu() {
  try {
    const r = await yardimciFetch('http://127.0.0.1:8765/ping', { signal: AbortSignal.timeout(2000) })
    if (!r.ok) return null
    const j = await r.json().catch(() => null)
    return j?.app === 'mubis-gib-yardimci' ? (j.version || null) : null
  } catch {
    return null
  }
}

// Yardimciya "yeni guncelleme var" bildirimi gonderir (Windows masaustu toast)
export async function gibYardimciGuncellemeUyari() {
  try {
    await yardimciFetch('http://127.0.0.1:8765/guncelleme-uyari', { method: 'POST', signal: AbortSignal.timeout(3000) })
  } catch { /* bildirim kritik degil */ }
}

// 2.7.424+: Tek tikla guncelleme — yardimci kendi yeni surumunu indirip
// kendini yeniden baslatir. Donus: {ok:true, basladi:true} | {ok:false, reason}
export async function gibYardimciGuncelleBaslat() {
  try {
    const r = await yardimciFetch('http://127.0.0.1:8765/guncelle', { method: 'POST', signal: AbortSignal.timeout(8000) })
    if (!r.ok) return { ok: false, reason: 'yanlis-yanit' }
    const j = await r.json().catch(() => ({}))
    return j?.success ? { ok: true, basladi: true } : { ok: false, reason: j?.error || 'servis-hatasi' }
  } catch {
    return { ok: false, reason: 'kurulu-degil' }
  }
}

// Genel is gonderici: gibYardimciIs('gib-odeme', {vkn, ...})
// Mevcut isler: gib-odeme, gib-giris, etebildirge, beyanname-indir, tahakkuk-indir
// 2.8.0: SUNUCU MODU'nda is asenkron gider (hemen isId doner) ve /is-sonuc
// uct noktasi 3 sn arayla yoklanir — 25 dk'lik isler proxysuz calisir.
// 2.8.1: Luca, yurtdisi veri merkezi IP'lerini engelliyor (TCP 443 kapali).
// Luca tabanli isler sunucuda "Luca giris sayfasi acilamadi" ile duserse
// otomatik YEREL yardimciya dusulur; yerel yoksa sunucu hatasi doner.
const LUCA_ENGEL_DESEN = /luca giris sayfasi acilamadi|net::err_name_not_resolved.*(luca|turmob)|erisim.*(luca|turmob)/i

export async function yerelYardimciUygunMu() {
  try {
    const r = await yardimciFetch('http://127.0.0.1:8765/ping', { signal: AbortSignal.timeout(2500) })
    if (!r.ok) return false
    const j = await r.json().catch(() => ({}))
    return j?.app === 'mubis-gib-yardimci'
  } catch { return false }
}

// 2.8.5: Sunucuya is gonderen ortak akis (asenkron + /is-sonuc yoklamasi +
// Luca engelinde yerel yedege dusme). gibYardimciIs (sunucu modu) ve
// yardimciIsSunucu (her zaman sunucu) bu cekirdegi paylasir.
async function sunucuyaIsGonder(isAdi, params = {}, zamanAsimiMs = 10 * 60 * 1000, onDurum, secenekler = {}) {
  // 2.8.6: Her zaman ayni-origin proxy kullan (/api/yardimci) — bu akis
  // yalnizca sunucuya is gondermek icindir; sunucu modu toggle'indan
  // bagimsiz calisir (yardimciIsSunucu cagrilari toggle kapaliyken de
  // VPS'e gitmeli).
  // VPS erisim kesintisi (521/502/timeout) durumunda isi dogrudan yerel
  // yardimciya gonder — sunucu kapaliyken fatura sorgulama tamamen
  // kilitlenmesin. Yerel yardimci da yoksa anlasilir hata doner.
  // secenekler.yerelYedek === false: yerel yardimciya ASLA dusme (SGK/vergi
  // borcu gibi musteri sorgulari yalnizca VPS uzerinden calisir).
  const iptalEdildiMi = () => secenekler.iptalKontrol?.() === true
  const iptalSonucu = () => ({ ok: false, reason: 'KULLANICI_DURDURDU' })
  if (iptalEdildiMi()) return iptalSonucu()
  const yerelYedekAktif = secenekler?.yerelYedek !== false
  const yerelYedek = async () => {
    if (iptalEdildiMi()) return iptalSonucu()
    if (!yerelYedekAktif) {
      return { ok: false, reason: secenekler?.yerelYedekKapaliMesaj || SUNUCU_KAPALI_MESAJ }
    }
    if (!await yerelYardimciUygunMu()) {
      return { ok: false, reason: SUNUCU_KAPALI_MESAJ }
    }
    try { onDurum?.('yerel-yedek') } catch {}
    const sonuc = await yardimciIsYerel(isAdi, params, zamanAsimiMs, onDurum, secenekler)
    return sonuc?.ok ? { ...sonuc, yerelYedek: true } : sonuc
  }
  // Yerel yedek kapali islerde (SGK/vergi borcu) sunucu bekleme bayragi
  // atlanir: VPS yeni bir istekle yeniden denenir, aksi halde 60 sn boyunca
  // sorgu hatali gorunur.
  if (sunucuBeklemede() && yerelYedekAktif) return yerelYedek()
  let r0
  try {
    r0 = await yardimciFetch('/api/yardimci/is', {
      method: 'POST',
      headers: sunucuZorunluBasliklar(),
      body: JSON.stringify({ is: isAdi, asenkron: true, ...params }),
      signal: AbortSignal.timeout(20000)
    })
  } catch (err) {
    sunucuHataIsaretle()
    return yerelYedek()
  }
  const j0 = await r0.json().catch(() => ({}))
  if (!j0?.success || !j0?.isId) {
    if (!r0.ok && r0.status >= 500) {
      sunucuHataIsaretle()
      return yerelYedek()
    }
    return { ok: false, reason: j0?.error || 'servis-hatasi' }
  }
  sunucuHataTemizle()
  let yerelYedegeDus = false
  const t0 = Date.now()
  let sonAdim = null
  let adimBaslangici = t0
  const adimZamanAsimi = () => {
    const sinir = secenekler.adimZamanAsimlari?.[sonAdim]
    return sinir > 0 && Date.now() - adimBaslangici >= sinir
  }
  const zamanAsimiSonucu = () => ({ ok: false, reason: `Luca islem takibi suresinde tamamlanmadi (${sonAdim || 'yanıt bekleniyor'}). İşlem sunucuda devam ediyor olabilir; Durdur düğmesine basmadan yeniden sorgulamayın.` })
  while (!yerelYedegeDus && Date.now() - t0 < zamanAsimiMs) {
    if (iptalEdildiMi()) return iptalSonucu()
    if (adimZamanAsimi()) return zamanAsimiSonucu()
    await new Promise(r => setTimeout(r, 3000))
    if (iptalEdildiMi()) return iptalSonucu()
    let j1 = null
    try {
      const r1 = await yardimciFetch(`/api/yardimci/is-sonuc?id=${encodeURIComponent(j0.isId)}`, { headers: sunucuZorunluBasliklar(), signal: AbortSignal.timeout(15000) })
      j1 = await r1.json().catch(() => null)
      if ([401, 403, 503].includes(r1.status)) return { ok: false, reason: j1?.error || `HTTP ${r1.status}` }
    } catch (error) {
      if (error?.message === 'Sunucu yardımcısı için oturum açın') return { ok: false, reason: error.message }
    }
    if (iptalEdildiMi()) return iptalSonucu()
    if (!j1?.success) continue
    if (j1.durum === 'calisiyor' && typeof j1.adim === 'string') {
      if (j1.adim !== sonAdim) {
        sonAdim = j1.adim
        adimBaslangici = Date.now()
      }
      // 2.8.352: sunucu yuzde veriyorsa ikinci parametre olarak iletilir.
      const yuzde = Number.isFinite(Number(j1.yuzde)) ? Number(j1.yuzde) : undefined
      try { onDurum?.(j1.adim, yuzde) } catch {}
    }
    if (j1.durum === 'bitti') return { ok: true, ...j1 }
    if (j1.durum === 'hata') {
      // Luca yurtdisi IP engeli: yerel yardimci varsa onunla dene
      // (yerel yedek kapali islerde bu yol da kapalidir)
      if (LUCA_ENGEL_DESEN.test(String(j1.error || ''))) {
        if (!yerelYedekAktif) return { ok: false, reason: secenekler?.yerelYedekKapaliMesaj || SUNUCU_KAPALI_MESAJ }
        const yerelVar = await yerelYardimciUygunMu()
        if (yerelVar) { yerelYedegeDus = true; break }
        return { ok: false, reason: 'Sunucudan Luca\'ya erisilemiyor (yurtdisi IP engeli) ve yerel yardimci program da kapali. Luca isleri icin yardimci programi acin.' }
      }
      return { ok: false, reason: j1.error || 'is-hatasi' }
    }
  }
  if (iptalEdildiMi()) return iptalSonucu()
  if (!yerelYedegeDus) {
    if (isAdi === 'efatura-sorgula') return zamanAsimiSonucu()
    return {
      ok: false,
      reason: yerelYedekAktif ? 'servis-yanit-vermedi' : (secenekler?.yerelYedekKapaliMesaj || SUNUCU_KAPALI_MESAJ)
    }
  }
  // Yerel yedek: ayni is yerel yardimciye gider (senkron)
  return yerelYedek()
}

export async function yardimciIsYerel(isAdi, params = {}, zamanAsimiMs = 10 * 60 * 1000, onDurum, secenekler = {}) {
  const controller = new AbortController()
  const iptalEdildiMi = () => secenekler.iptalKontrol?.() === true
  const zamanlayici = setTimeout(() => controller.abort(), zamanAsimiMs)
  const iptalTakibi = secenekler.iptalKontrol ? setInterval(() => {
    if (iptalEdildiMi()) controller.abort()
  }, 250) : null
  try {
    if (iptalEdildiMi()) return { ok: false, reason: 'KULLANICI_DURDURDU' }
    if (!await yerelYardimciUygunMu()) return { ok: false, reason: 'kurulu-degil' }
    if (iptalEdildiMi()) return { ok: false, reason: 'KULLANICI_DURDURDU' }
    const r = await yardimciFetch('http://127.0.0.1:8765/is', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is: isAdi, ...params }),
      signal: controller.signal
    })
    const j = await r.json().catch(() => ({}))
    if (iptalEdildiMi()) return { ok: false, reason: 'KULLANICI_DURDURDU' }
    if (j?.success) return { ok: true, ...j }
    return { ok: false, reason: j?.error || 'servis-hatasi' }
  } catch (e) {
    return { ok: false, reason: iptalEdildiMi() ? 'KULLANICI_DURDURDU' : controller.signal.aborted || e?.name === 'TimeoutError' ? 'servis-yanit-vermedi' : 'servis-hatasi' }
  } finally {
    clearTimeout(zamanlayici)
    if (iptalTakibi !== null) clearInterval(iptalTakibi)
  }
}

export async function gibYardimciIs(isAdi, params = {}, zamanAsimiMs = 10 * 60 * 1000) {
  try {
    const durum = await gibYardimciDurumu()
    if (durum !== 'ok') return { ok: false, reason: durum }

    if (sunucuModuAktif()) {
      return await sunucuyaIsGonder(isAdi, params, zamanAsimiMs)
    }

    const r = await yardimciFetch(`${YARDIMCI_BASE()}/is`, {
      method: 'POST',
      headers: yardimciBasliklar(),
      body: JSON.stringify({ is: isAdi, ...params }),
      // SGK borc sorgusu gibi tam otomatik isler (captcha+WAF+giris+tablo)
      // 2-5 dk surebilir; varsayilan 10 dk, toplu e-arsiv doldurmada daha uzun
      signal: AbortSignal.timeout(zamanAsimiMs)
    })
    const j = await r.json().catch(() => ({}))
    if (j?.success) return { ok: true, ...j }
    return { ok: false, reason: j?.error || 'servis-hatasi' }
  } catch (e) {
    return { ok: false, reason: e?.name === 'TimeoutError' ? 'servis-yanit-vermedi' : 'servis-hatasi' }
  }
}

// 2.8.5: e-Tebligat sorgu/indirme gibi isler HER ZAMAN Istanbul sunucusundan
// calisir — ofis bilgisayari/yerel yardimci kapali olsa bile. Luca engelinde
// yine yerel yedege duser (sunucuyaIsGonder icinde).
export async function yardimciIsSunucu(isAdi, params = {}, zamanAsimiMs = 10 * 60 * 1000, onDurum, secenekler = {}) {
  try {
    return await sunucuyaIsGonder(isAdi, params, zamanAsimiMs, onDurum, secenekler)
  } catch (e) {
    return { ok: false, reason: e?.name === 'TimeoutError' ? 'servis-yanit-vermedi' : 'servis-hatasi' }
  }
}

// e-Arsiv / e-Fatura / e-SMM toplu gonderim: siradaki faturaya gec
// (kullanici GIB'de Olustur'a basti). Uc akis da ayni tusu kullanir,
// bu yuzden sinyal uc uca birden gonderilir; beklemeyen uc zararsizca yok sayar.
const devamIptalGonder = (yol) => Promise.allSettled([
  yardimciFetch(`${YARDIMCI_BASE()}/earsiv-${yol}`, { method: 'POST', headers: yardimciBasliklar(), signal: AbortSignal.timeout(5000) }),
  yardimciFetch(`${YARDIMCI_BASE()}/efatura-${yol}`, { method: 'POST', headers: yardimciBasliklar(), signal: AbortSignal.timeout(5000) }),
  yardimciFetch(`${YARDIMCI_BASE()}/esmm-${yol}`, { method: 'POST', headers: yardimciBasliklar(), signal: AbortSignal.timeout(5000) })
]).then(r => r.some(x => x.status === 'fulfilled' && x.value?.ok)).catch(() => false)

export function gibYardimciDevamEt() {
  return devamIptalGonder('devam')
}

// e-Arsiv / e-Fatura toplu gonderimini iptal et
export function gibYardimciIptal() {
  return devamIptalGonder('iptal')
}

// 2.8.16: yardimcideki canli gonderim asamasini okur ("dolduruluyor" /
// "onay-bekliyor"). Yerel yardimci ve Istanbul sunucusu ayni anda yoklanir;
// hangisinde aktif gonderim varsa o doner, yoksa null.
export async function gibYardimciGonderimDurumu() {
  const oku = async (url, basliklar) => {
    try {
      const r = await yardimciFetch(url, { headers: basliklar, signal: AbortSignal.timeout(4000) })
      if (!r.ok) return null
      const j = await r.json().catch(() => null)
      return j?.success ? (j.durum || null) : null
    } catch {
      return null
    }
  }
  const [yerel, sunucu] = await Promise.all([
    oku(`${YARDIMCI_BASE()}/gonderim-durum`, yardimciBasliklar()),
    oku('/api/yardimci/gonderim-durum', sunucuZorunluBasliklar())
  ])
  return sunucu || yerel || null
}

// 2.7.483: Uzun Luca sorgusunu durdur (luca-firmalar-getir dongusunu keser)
// 2.8.32: tumu=true -> kuyrukta bekleyen TUM isler iptal edilir, calisan isin
// sekmeleri kapatilir (Beyanname Kontrol "Tumunu Durdur" dugmesi).
export async function gibLucaSorguDurdur(kaynak = 'otomatik', tumu = false) {
  const ek = tumu ? '?tumu=1' : ''
  const istekler = kaynak === 'yerel'
    ? [yardimciFetch(`http://127.0.0.1:8765/is-durdur${ek}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(5000) })]
    : kaynak === 'sunucu'
      ? [yardimciFetch(`/api/yardimci/is-durdur${ek}`, { method: 'POST', headers: sunucuZorunluBasliklar(), signal: AbortSignal.timeout(5000) })]
      : [
          yardimciFetch(`${YARDIMCI_BASE()}/is-durdur${ek}`, { method: 'POST', headers: yardimciBasliklar(), signal: AbortSignal.timeout(5000) }),
          yardimciFetch(`/api/yardimci/is-durdur${ek}`, { method: 'POST', headers: sunucuZorunluBasliklar(), signal: AbortSignal.timeout(5000) })
        ]
  const yanitlar = await Promise.allSettled(istekler)
  return yanitlar.some(r => r.status === 'fulfilled' && r.value.ok)
}

export async function gibYardimciIleDoldur(bilgi) {
  return gibYardimciIs('gib-odeme', {
    vkn: bilgi.vkn || '',
    tahakkukNo: bilgi.tahakkukNo || '',
    il: bilgi.il || '',
    vergiDairesi: bilgi.vergiDairesi || ''
  })
}

// Vergi odeme ekrani: VPS formu doldurur, captcha'yi cozer, borclari secer ve
// GIB'in urettigi odeme formunu HTML olarak dondurur. Istemci bu HTML'i yeni
// pencerede acinca yalnizca spos.gib.gov.tr odeme ekrani gorunur; telefonda
// yardimci program gerekmez. VPS'e erisilemezse sunucuyaIsGonder yerel
// yardimciya duser; eski surumde is yoksa cagiran taraf gibYardimciIleDoldur'a
// geri doner.
export async function gibOdemeFormuAl(bilgi) {
  // 1) Yardimci program bilgisayarda kurulu mu? Kuruluysa her zaman
  //    yerel yardimci uzerinden yap (telefonda yardimci yoktur).
  const yerelVar = await yerelYardimciUygunMu()
  if (yerelVar) {
    const sonuc = await gibYardimciIs('gib-odeme-form', {
      vkn: bilgi.vkn || '',
      tahakkukNo: bilgi.tahakkukNo || '',
      il: bilgi.il || '',
      vergiDairesi: bilgi.vergiDairesi || ''
    }, 6 * 60 * 1000)
    if (sonuc.ok) {
      const html = String(sonuc.html || '').replace(/<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '')
      if (html.length >= 500) return { ...sonuc, html }
      return { ok: false, reason: 'odeme-formu-yok', mesaj: sonuc.mesaj || 'GİB ödeme formu alınamadı.' }
    }
    // Yerel yardimci var ama basarisiz olursa (eski surum vb.) VPS'e dus
  }

  // 2) Yardimci yoksa veya yerel basarisizsa: VPS (telefon/bilgisayar).
  const sonuc = await yardimciIsSunucu('gib-odeme-form', {
    vkn: bilgi.vkn || '',
    tahakkukNo: bilgi.tahakkukNo || '',
    il: bilgi.il || '',
    vergiDairesi: bilgi.vergiDairesi || ''
  }, 6 * 60 * 1000)
  if (!sonuc.ok) return sonuc
  const html = String(sonuc.html || '').replace(/<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '')
  if (html.length < 500) {
    return { ok: false, reason: 'odeme-formu-yok', mesaj: sonuc.mesaj || 'GİB ödeme formu alınamadı.' }
  }
  return { ...sonuc, html, yerelYedek: sonuc.yerelYedek }
}

// GIB Dijital Vergi Dairesi'nden musterinin vadesi gecmis vergi borcunu canli sorgular.
// Yardimci program: https://dijital.gib.gov.tr/portal/login acar, kullanici kodu/parola
// doldurur, guvenlik kodu kullaniciya birakilir, giris sonrasi "Vadesi Gecmis Borclar"
// kutusundaki rakami okur.
// 2.8.5: Vergi borcu sorgusu HER ZAMAN Istanbul sunucusundan — ofis
// bilgisayari/yerel yardimci kapali olsa bile. Altyapı hatasinda yerel
// yardimciya yedeklenir (varsa).
export async function gibBorcSorgula(clientId) {
  const giris = await musteriGirisBilgileriGetir(clientId)
  if (!giris?.dvs_username || !giris?.dvs_password) {
    return { ok: false, reason: 'gib-sifre-eksik' }
  }
  const params = {
    clientId,
    kullaniciKodu: giris.dvs_username,
    parola: giris.dvs_password
  }
  // 2.8.60: Musteri vergi borcu sorgusu YALNIZCA VPS uzerinden calisir;
  // yerel yardimciya yedeklenmez. VPS'e ulasilamazsa acik hata doner.
  const res = await yardimciIsSunucu('gib-borc-sorgula', params, 10 * 60 * 1000, undefined, {
    yerelYedek: false,
    yerelYedekKapaliMesaj: 'İstanbul sunucusuna (VPS) ulaşılamadı; vergi borcu sorgusu yerel bilgisayardan yapılmaz. Lütfen birkaç dakika sonra tekrar deneyin.'
  })
  if (!res.ok) return res
  return {
    ok: true,
    borc: Number(res.borc) || 0,
    vadesiGecmis: Number(res.vadesiGecmis) || 0,
    vadesiGelmemis: Number(res.vadesiGelmemis) || 0,
    toplam: Number(res.toplam) || 0,
    // 2.8.325: GIB borc tablosundan okunan kalemler (vade / tur / tutar)
    kalemler: Array.isArray(res.kalemler) ? res.kalemler : [],
    not: res.not
  }
}

// SGK e-Bildirge'den isveren borcunu canli sorgular — 2.8.60: YALNIZCA
// Istanbul sunucusundan (VPS); yerel yardimciya yedeklenmez.
export async function sgkBorcSorgula(clientId) {
  const giris = await musteriGirisBilgileriGetir(clientId)
  const eksikler = []
  if (!giris?.sgk_username) eksikler.push('kullanici adi')
  if (!giris?.sgk_password) eksikler.push('sistem sifresi')
  if (!giris?.sgk_work_password) eksikler.push('isyeri sifresi')
  if (eksikler.length > 0) {
    return { ok: false, reason: 'sgk-sifre-eksik', detail: 'Eksik alanlar: ' + eksikler.join(', ') }
  }
  const params = {
    clientId,
    kullaniciAdi: giris.sgk_username,
    sistemSifre: giris.sgk_password,
    isyeriSifre: giris.sgk_work_password,
    isyeriKodu: giris.sgkIsyeriKodu || ''
  }
  // 2.8.60: SGK borcu sorgusu YALNIZCA VPS (YBS) uzerinden yapilir.
  // yerelYedek:false -> sunucuBeklemede/5xx/timeout/Luca engeli durumlarinda
  // dahi yerel yardimciya dusulmez (kullanici istegi).
  const res = await yardimciIsSunucu('sgk-borc-sorgula', params, 10 * 60 * 1000, undefined, {
    yerelYedek: false,
    yerelYedekKapaliMesaj: 'İstanbul sunucusuna (VPS) ulaşılamadı; SGK borcu sorgusu yerel bilgisayardan yapılmaz. Lütfen birkaç dakika sonra tekrar deneyin.'
  })
  if (!res.ok) return res
  const kalemler = Array.isArray(res.kalemler) ? res.kalemler : []
  const yil = kalemler.length > 0 ? kalemler[0].yil || kalemler[0].Yil || '' : ''
  const ay = kalemler.length > 0 ? kalemler[0].ay || kalemler[0].Ay || '' : ''
  return {
    ok: true,
    kaynak: 'vps',
    sadeceBorclar: Number(res.sadeceBorclar) || 0,
    gecikmeZammi: Number(res.gecikmeZammi) || 0,
    toplam: Number(res.toplam) || 0,
    // 2.8.325: SGK borc tablosundan okunan donem bazli kalemler
    // Ek: yil/ay bilgisi ayrica saklaniyor (borc dökümünde görüntüleme için)
    kalemler,
    // 2.8.340: SGK borç dökümünde yil+ay gösterimi
    yil: String(yil).trim() || undefined,
    ay: String(ay).trim() || undefined,
    borcYok: res.borcYok === true,
    not: res.not
  }
}

// 2.7.439: SGK istirahat (saglik) raporu sorgusu — oncelik sirasi:
// 1) Kendi yardimci programimizin sgk-vizite-sorgula isi (SGK Ws_Vizite SOAP
//    web servisi — LucaProxy ile ayni kanal, tarayici/captcha/SMS yok),
// 2) Luca Baglanti Merkezi (LucaProxy, localhost:15822) vizite:sorgula,
// 3) Eski yardimci isi sgk-rapor-dokumu (dogrudan SGK otomasyonu, 2.7.438).
// tcListesi: [{ tc, adSoyad }] (sonuclar bu TC'lerle sinirlanir).
// secenekler: { yil, ay ('1'..'12' | bos = tum yil), durum ('onayli' | 'bekliyor') }
// Donus: { ok, raporlar: [{ tc, adSoyad, baslangic, bitis, gun, nitelik, onayli }] }
export async function sgkRaporDokumu(clientId, tcListesi, secenekler = {}) {
  const opts = (typeof secenekler === 'object' && secenekler !== null) ? secenekler : { yil: secenekler }
  const yil = String(opts.yil || new Date().getFullYear())
  const ay = String(opts.ay || '')
  const bekleyenModu = String(opts.durum || 'onayli') === 'bekliyor'

  const giris = await musteriGirisBilgileriGetir(clientId)
  const eksikler = []
  if (!giris?.sgk_username) eksikler.push('kullanici adi')
  if (!giris?.sgkIsyeriKodu) eksikler.push('isyeri kodu')
  if (!giris?.sgk_work_password) eksikler.push('isyeri sifresi')
  if (eksikler.length > 0) {
    return { ok: false, reason: 'sgk-sifre-eksik', detail: 'Eksik alanlar: ' + eksikler.join(', ') }
  }
  const tcListesiKisa = (tcListesi || []).map(p => ({ tc: p.tc, adSoyad: p.adSoyad || '' }))

  // Sorgu araligi: ay seciliyse o ay, yoksa tum yil
  let ilkGun = `01.01.${yil}`
  let sonGun = `31.12.${yil}`
  if (ay) {
    const ayNo = Number(ay)
    const aySonGun = new Date(Number(yil), ayNo, 0).getDate()
    const ayIki = String(ayNo).padStart(2, '0')
    ilkGun = `01.${ayIki}.${yil}`
    sonGun = `${String(aySonGun).padStart(2, '0')}.${ayIki}.${yil}`
  }
  const aralikEtiket = ay ? ` (${ay}/${yil})` : ` (${yil})`
  const durumEtiket = bekleyenModu ? 'onay bekleyen' : 'onaylı'

  // 1) Yeni yardimci isi (2.7.439+): SGK Ws_Vizite SOAP web servisi
  const surum = await gibYardimciSurumu()
  if (surum && surumKiyasla(surum, '2.7.439') >= 0) {
    // 'durum' parametresi yalniz 2.7.441+ surumunde desteklenir. Eski surumde
    // her iki mod da onayli listeyi doner — yanlis etiketleme yapmamak icin
    // onay bekleyen modu bu surumlerde calistirilmaz.
    if (bekleyenModu && surumKiyasla(surum, '2.7.441') < 0) {
      return {
        ok: false,
        reason: 'yardimci-surum-eski',
        detail: 'Onay bekleyen rapor sorgusu için yardımcı programı 2.7.441 sürümüne güncelleyin (sistem tepsisindeki simgeden → Güncelle veya uygulamadaki güncelleme uyarısı).'
      }
    }
    const res = await gibYardimciIs('sgk-vizite-sorgula', {
      kullaniciAdi: giris.sgk_username,
      isyeriKodu: giris.sgkIsyeriKodu,
      isyeriSifre: giris.sgk_work_password,
      tarih1: ilkGun,
      tarih2: sonGun,
      durum: bekleyenModu ? 'bekliyor' : 'onayli',
      tcListesi: tcListesiKisa
    }, 15 * 60 * 1000)
    if (res.ok) {
      const raporlar = (Array.isArray(res.raporlar) ? res.raporlar : []).map(r => ({
        ...r,
        onayli: bekleyenModu ? false : (r.onayli !== false)
      }))
      return {
        ok: true,
        raporlar,
        not: `${raporlar.length} ${durumEtiket} rapor bulundu${aralikEtiket}.`,
        uyari: res.uyari || ''
      }
    }
    if (!/bilinmeyen/i.test(res.reason || '')) {
      // Yardimci hata dondurdu: SGK'nin kendi mesajini (or. 1 dakika siniri)
      // kullaniciya aynen goster
      const kodlar = ['servis-hatasi', 'servis-yanit-vermedi', 'kurulu-degil', 'surum-eski', 'yardimci-kurulu-degil']
      const mesaj = res.detail || (kodlar.includes(res.reason) ? '' : res.reason)
      return { ...res, detail: mesaj || '' }
    }
    // Bilinmeyen is = eski exe surumu; asagi dus
  }

  // 2) LucaProxy kuruluysa ayni kanali oradan kullan
  const proxyDurum = await lucaProxyDurumu()
  if (proxyDurum === 'ok') {
    const params = {
      sirketId: clientId,
      isyeriId: '1',
      baslangicTarihi: ilkGun.replace(/\./g, '/'),
      sorgulamaTarihi: sonGun.replace(/\./g, '/'),
      kaydet: false,
      onaylanmis: !bekleyenModu,
      sgkKullaniciAdi: giris.sgk_username,
      sgkIsyeriKodu: giris.sgkIsyeriKodu,
      sgkIsyeriSifre: giris.sgk_work_password
    }
    try {
      const r = await yardimciFetch(`${LUCA_PROXY_BASE}/Luca/jqRequest.do?_u=vizite:sorgula&_ld=1-1-1-${Math.random()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(3 * 60 * 1000)
      })
      const j = await r.json().catch(() => ({}))
      if (j?.error) return { ok: false, reason: 'luca-proxy-hatasi', detail: j.error }
      if (!j?.success) {
        return { ok: false, reason: 'luca-proxy-hatasi', detail: 'Luca Bağlantı Merkezi rapor döndürmedi.' }
      }
      const tcFiltre = new Set(tcListesiKisa.map(p => String(p.tc || '').replace(/\D/g, '')).filter(Boolean))
      const raporlar = (j.raporListesi || [])
        .map(lucaRaporuKayda)
        .filter(r => r && (!tcFiltre.size || tcFiltre.has(r.tc)))
        .map(r => ({ ...r, onayli: !bekleyenModu }))
      return { ok: true, raporlar, not: `${raporlar.length} ${durumEtiket} rapor bulundu${aralikEtiket}. (Luca Bağlantı Merkezi)` }
    } catch (e) {
      return { ok: false, reason: e?.name === 'TimeoutError' ? 'luca-proxy-yanit-vermedi' : 'luca-proxy-hatasi' }
    }
  }

  // 3) Onay bekleyen mod yalniz yardimci 2.7.440+ veya LucaProxy ile calisir
  if (bekleyenModu) {
    return {
      ok: false,
      reason: 'yardimci-gerekli',
      detail: 'Onay bekleyen raporlar için yardımcı programın 2.7.440+ sürümü (veya Luca Bağlantı Merkezi) gerekir.'
    }
  }

  // 4) Eski yardimci isi (SGK e-Bildirge dogrudan otomasyon)
  return sgkRaporDokumuYardimciIle(giris, tcListesi, proxyDurum)
}

// '2.7.439' gibi surumleri sayisal kiyaslar: -1 eski, 0 esit, 1 yeni
function surumKiyasla(a, b) {
  const pa = String(a || '').split(/[.-]/).map(Number)
  const pb = String(b || '').split(/[.-]/).map(Number)
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0, y = pb[i] || 0
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

// Luca vizite kaydini MUBiS saglik raporu kaydina cevirir.
// Onaylanmis raporlarda: baslangic = poliklinikTarihi, bitis =
// isBasiKontrolTarihi - 1 gun (Luca'nin kendi hesabi).
function lucaRaporuKayda(r) {
  const tc = String(r.tckno || '').replace(/\D/g, '')
  if (!tc) return null
  const baslangic = tarihLucaToISO(r.poliklinikTarihi)
  let bitis = null
  const [g, a, y] = String(r.isBasiKontrolTarihi || '').split(/[./]/).map(Number)
  if (g && a && y) {
    const d = new Date(y, a - 1, g)
    d.setDate(d.getDate() - 1)
    bitis = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  let gun = null
  if (baslangic && bitis) {
    gun = Math.round((new Date(bitis) - new Date(baslangic)) / 86400000) + 1
  }
  return {
    tc,
    adSoyad: [r.ad, r.soyad].filter(Boolean).join(' '),
    baslangic,
    bitis,
    gun,
    nitelik: r.vakaAdi || 'İstirahat'
  }
}

// dd/mm/yyyy (veya dd.mm.yyyy) -> yyyy-mm-dd
function tarihLucaToISO(t) {
  const [g, a, y] = String(t || '').split(/[./]/).map(Number)
  if (!g || !a || !y) return null
  return `${y}-${String(a).padStart(2, '0')}-${String(g).padStart(2, '0')}`
}

// Yedek yol: LucaProxy kurulu degil / surumu eski ise yardimci programin
// sgk-rapor-dokumu isi (SGK e-Bildirge dogrudan otomasyon, 2.7.438).
async function sgkRaporDokumuYardimciIle(giris, tcListesi, proxyDurum) {
  const res = await gibYardimciIs('sgk-rapor-dokumu', {
    kullaniciAdi: giris?.sgk_username || '',
    sistemSifre: giris?.sgk_password || '',
    isyeriSifre: giris?.sgk_work_password || '',
    isyeriKodu: giris?.sgkIsyeriKodu || '',
    tcListesi: (tcListesi || []).map(p => ({ tc: p.tc, adSoyad: p.adSoyad || '' }))
  }, 25 * 60 * 1000)
  if (!res.ok) {
    const ipucu = proxyDurum === 'kurulu-degil'
      ? ' (Luca Bağlantı Merkezi de kurulu değil)'
      : proxyDurum === 'surum-eski'
        ? ' (Luca Bağlantı Merkezi sürümü güncel değil)'
        : ''
    return { ...res, detail: (res.detail || res.reason || 'SGK sorgusu başarısız.') + ipucu }
  }
  return { ok: true, raporlar: Array.isArray(res.raporlar) ? res.raporlar : [], not: res.not }
}

// 2.8.6: Sunucu-öncelikli dosya erişimi — fatura sorgulaması artık her zaman
// Istanbul sunucusundan (VPS) calisir, dosyalar VPS diskine iner. Bu yuzden
// liste/indirme once ayni-origin proxy'ye (/api/yardimci) gider; sunucuya
// ulasilamazsa yerel yardimciye duser (toggle'dan bagimsiz).
function sunucuProxyTaban() { return '/api/yardimci' }

// VPS yardimcisi erisim kesintisi: bir kez basarisiz olunca kisa sure
// (60 sn) tekrar denenmez. Aksi halde her fatura turu icin 20 sn timeout
// birikip sorgu dakikalarca bekliyor ve kullaniciya anlasilmaz hatalar
// (HTTP 521/502/544) donuyordu.
const SUNUCU_HATA_BEKLEME_MS = 60 * 1000
let sunucuSonHata = 0
function sunucuBeklemede() { return sunucuSonHata > 0 && Date.now() - sunucuSonHata < SUNUCU_HATA_BEKLEME_MS }
function sunucuHataIsaretle() { sunucuSonHata = Date.now() }
export function sunucuHataTemizle() { sunucuSonHata = 0 }

// VPS yardimcisinin ayakta olup olmadigini kisa surede (6 sn) kontrol eder.
// Donus: 'ok' | 'kapali' | 'yetki'
export async function sunucuYardimciDurumu() {
  if (sunucuBeklemede()) return 'kapali'
  try {
    const r = await yardimciFetch(`${sunucuProxyTaban()}/ping`, {
      cache: 'no-store',
      headers: sunucuZorunluBasliklar(),
      signal: AbortSignal.timeout(6000)
    })
    if (r.ok) { sunucuHataTemizle(); return 'ok' }
    sunucuHataIsaretle()
    return (r.status === 401 || r.status === 403) ? 'yetki' : 'kapali'
  } catch {
    sunucuHataIsaretle()
    return 'kapali'
  }
}

const SUNUCU_KAPALI_MESAJ = 'Yardımcı sunucuya son bağlantı denemesi başarısız oldu. Bir süre sonra tekrar deneyin; sorun sürerse sunucu bağlantısını kontrol edin.'

// Yardimci programin "indirilenler" klasorundeki belgeleri listeler
// Donus: [{ ad, boyut, tarih }] (tarih = mtime ms) veya hata
export async function gibDosyalariListele(kaynak = 'otomatik') {
  let sunucuHata = ''
  if (kaynak !== 'yerel') {
    if (kaynak !== 'sunucu' && sunucuBeklemede()) {
      sunucuHata = SUNUCU_KAPALI_MESAJ
    } else {
      try {
        const rs = await yardimciFetch(`${sunucuProxyTaban()}/dosyalar`, { cache: 'no-store', headers: sunucuZorunluBasliklar(), signal: AbortSignal.timeout(60000) })
        const metin = await rs.text()
        const js = metin ? (() => { try { return JSON.parse(metin) } catch { return null } })() : null
        if (rs.ok && js?.ok) { sunucuHataTemizle(); return js.dosyalar || [] }
        const detay = js?.error || js?.message || (js ? JSON.stringify(js).slice(0, 200) : `HTTP ${rs.status}`)
        if (rs.status === 401 || rs.status === 403) sunucuHataIsaretle()
        else if (!rs.ok && !js?.ok && /^HTTP (5\d\d)$/.test(detay)) sunucuHataIsaretle()
        sunucuHata = `VPS dosya listesi alınamadı: ${detay}`
      } catch (err) {
        sunucuHataIsaretle()
        sunucuHata = `VPS dosya listesine ulaşılamadı: ${err?.message || err}`
      }
    }
    if (kaynak === 'sunucu') throw new Error(sunucuHata)
  }
  try {
    const r = await yardimciFetch('http://127.0.0.1:8765/dosyalar', { headers: kaynak === 'yerel' ? {} : yardimciBasliklar(), signal: AbortSignal.timeout(8000) })
    const j = await r.json().catch(() => null)
    if (!r.ok || !j?.ok) throw new Error(j?.error || `Yerel dosya listesi alınamadı (HTTP ${r.status})`)
    return j.dosyalar || []
  } catch (err) {
    const yerelHata = err?.message || String(err)
    throw new Error(sunucuHata ? `${sunucuHata}; yerel yedek: ${yerelHata}` : yerelHata)
  }
}

// Belirtilen belgeyi Blob olarak getirir (once sunucu, sonra yerel yedek)
export async function gibDosyaGetir(ad, kaynak = 'otomatik') {
  if (kaynak !== 'yerel') {
    try {
      const rs = await yardimciFetch(`${sunucuProxyTaban()}/dosya?ad=${encodeURIComponent(ad)}`, { headers: sunucuZorunluBasliklar(), signal: AbortSignal.timeout(120000) })
      if (rs.ok) return await rs.blob()
      if (kaynak === 'sunucu') throw new Error(`HTTP ${rs.status}`)
    } catch (err) {
      if (kaynak === 'sunucu') throw new Error(`Belge sunucudan okunamadı: ${err?.message || err}`)
    }
  }
  const r = await yardimciFetch(`http://127.0.0.1:8765/dosya?ad=${encodeURIComponent(ad)}`, { headers: kaynak === 'yerel' ? {} : yardimciBasliklar(), signal: AbortSignal.timeout(60000) })
  if (!r.ok) throw new Error('Belge yardimci programdan okunamadi')
  return r.blob()
}

function sunucuZorunluBasliklar(ek = {}) {
  return { 'Content-Type': 'application/json', ...ek }
}

export async function sunucuDosyaGetir(ad) {
  const r = await yardimciFetch(`${YARDIMCI_BASE()}/dosya?ad=${encodeURIComponent(ad)}`, { headers: sunucuZorunluBasliklar(), signal: AbortSignal.timeout(120000) })
  if (!r.ok) throw new Error('Belge sunucudan okunamadi')
  return r.blob()
}

export async function sunucuDosyalariListele() {
  const r = await yardimciFetch(`${YARDIMCI_BASE()}/dosyalar`, { headers: sunucuZorunluBasliklar(), signal: AbortSignal.timeout(20000) })
  const j = await r.json()
  if (!j?.ok) throw new Error(j?.error || 'Dosya listesi alinamadi')
  return j.dosyalar || []
}

// 2.7.442: Son Luca sorgusunda EDEFTER (Luca aktarim) klasorune kopyalanan
// dosya listesi — fatura bazli "Luca'ya kaydedildi" durum tablosu icin.
// Donus: { ok, zaman, dosyalar: [ad] } veya hata durumunda null
export async function gibEdtSonKopya(kaynak = 'otomatik') {
  try {
    const base = kaynak === 'yerel' ? 'http://127.0.0.1:8765' : sunucuProxyTaban()
    const r = await yardimciFetch(`${base}/edt-sonkopya`, { headers: kaynak === 'yerel' ? {} : yardimciBasliklar(), signal: AbortSignal.timeout(5000) })
    if (!r.ok) return null
    const j = await r.json()
    return j?.ok ? { zaman: j.zaman || 0, dosyalar: j.dosyalar || [] } : null
  } catch {
    return null
  }
}

// 2.7.170: G: arsivindeki (BEYANNAME klasoru) bir belgeyi Blob olarak getirir.
// Yardimci yalnizca beyan arsiv koku altindaki yollari kabul eder.
export async function arsivDosyaGetir(yol) {
  const r = await yardimciFetch(`${YARDIMCI_BASE()}/arsiv-dosya?yol=${encodeURIComponent(yol)}`, { headers: yardimciBasliklar(), signal: AbortSignal.timeout(60000) })
  if (!r.ok) throw new Error('Arsiv belgesi yardimci programdan okunamadi')
  return r.blob()
}

// ------------------------------------------------------------
// Borc sorgu sonucu kaliciligi (Supabase)
// Tablo: borc_sonuclari (client_id + tip unique; tip = 'vergi' | 'sgk')
// Yeni sorgulamaya kadar kartlarda kalsin diye sorgu sonucu buraya yazilir.
// localStorage yedegi her zaman calisir; tablo/RLS hatalari sessizce yoksayilir.
// ------------------------------------------------------------
export async function borcSonucuKaydet(clientId, tip, veriler) {
  try {
    const satir = {
      client_id: clientId,
      tip,
      toplam: Number(veriler?.toplam) || 0,
      detay: veriler?.detay || {},
      mesaj: veriler?.mesaj || '',
      sorgu_ts: new Date().toISOString()
    }
    const { error } = await supabase
      .from('borc_sonuclari')
      .upsert(satir, { onConflict: 'client_id,tip' })
    if (error) console.warn('Borc sonucu bulut kaydi basarisiz:', error.message)
  } catch (e) {
    console.warn('Borc sonucu bulut kaydi atlandi:', e?.message || e)
  }
}

// Son kaydedilen borc sonucunu dondurur: { toplam, detay, mesaj, sorgu_ts } | null
export async function borcSonucuGetir(clientId, tip) {
  try {
    const { data, error } = await supabase
      .from('borc_sonuclari')
      .select('toplam, detay, mesaj, sorgu_ts')
      .eq('client_id', clientId)
      .eq('tip', tip)
      .maybeSingle()
    if (error) return null
    return data || null
  } catch {
    return null
  }
}
