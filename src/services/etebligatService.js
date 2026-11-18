// e-Tebligat Merkezi servisi
// - DVS e-Tebligat sorgusu ve belge indirmesini 2.8.5'ten itibaren HER ZAMAN
//   Istanbul sunucusundaki (VPS) yardimci programa yaptirir — yerel yardimci
//   gerekmez; Luca engelinde otomatik yerel yedege duser.
// - Liste/kalici kayit Supabase "etebligatlar" tablosuna yazilir; tablo yoksa
//   localStorage yedegi kullanilir (kodlarken hata sesizce yoksayilir).
// - Indirilen PDF "client-documents" Storage bucket'ina yuklenir; WhatsApp/
//   e-posta gonderimi bu public URL uzerinden yapilir.

import { supabase } from '../lib/supabase'
import {
  yardimciIsSunucu, sunucuDosyaGetir, sunucuDosyalariListele,
  musteriGirisBilgileriGetir, edevletKimlikGetir
} from '../utils/gibOdemeHelper'
import { getMyOfficeId } from './officeService'

const BUCKET_NAME = 'client-documents'
const LS_ONEK = 'etebligatlar_v1_'
const LS_SONSORGU_ONEK = 'etebligat_sonsorgu_v1_'

// Musteri bazli SON SORGU zamani: uyarilar yalnizca onceki sorgudan SONRA
// gelen tebligatlar icin yapilir (ilk sorgu referans alir, uyari uretmez).
function sonSorguTsOku(clientId) {
  try { return localStorage.getItem(LS_SONSORGU_ONEK + clientId) || null } catch { return null }
}
function sonSorguTsYaz(clientId) {
  try { localStorage.setItem(LS_SONSORGU_ONEK + clientId, new Date().toISOString()) } catch { /* yoksay */ }
}

// "12.09.2026" / "2026-09-18" gibi metinleri Date'e cevirir; cozemezse null
function tebligTarihiCoz(metin) {
  if (!metin) return null
  const s = String(metin).trim()
  let m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function lsOku(clientId) {
  try {
    return JSON.parse(localStorage.getItem(LS_ONEK + clientId) || '[]')
  } catch {
    return []
  }
}

function lsYaz(clientId, satirlar) {
  try {
    localStorage.setItem(LS_ONEK + clientId, JSON.stringify(satirlar.slice(0, 300)))
  } catch { /* kota dolu olabilir; kritik degil */ }
}

// Yardimcidan gelen ham satirlari tablo satirina cevirir
function satirNormalize(client, t) {
  return {
    client_id: client.id,
    kaynak: t.kaynak || 'vergi', // 'vergi' (DVS) | 'sgk' (e-Devlet)
    kurum: t.kurum || '',
    belge_turu: t.belgeTuru || '',
    belge_no: String(t.belgeNo || t.tebligTarihi || '').trim(),
    gonderme_tarihi: t.gondermeTarihi || '',
    teblig_tarihi: t.tebligTarihi || '',
    okuma_tarihi: t.okumaTarihi || '',
    okundu: !!t.okundu,
    sorgu_ts: new Date().toISOString()
  }
}

// Musterinin tebligat listesini dondurur: once Supabase, hata olursa localStorage.
// Bulut bos ama yerelde kayit varsa (tablolar sonradan kurulduysa) yerel veri
// buluta tasinir — boylece diger bilgisayarlar da ayni listeyi gorur.
export async function etebligatlariGetir(clientId) {
  const yerel = lsOku(clientId)
  try {
    const { data, error } = await supabase
      .from('etebligatlar')
      .select('*')
      .eq('client_id', clientId)
      .order('teblig_tarihi', { ascending: false })
      .limit(300)
    if (!error && data && data.length > 0) return data
    if (!error && yerel.length > 0) {
      // Tablo yeni kuruldu / onceki yazimlar basarisizdi: yerel veriyi buluta tasi
      bulutaYaz(clientId, yerel)
      return yerel
    }
  } catch { /* tablo yok / baglanti yok */ }
  return yerel
}

// Yardimci programdan DVS e-Tebligat listesini sorgular ve kaydeder.
// Varsayilan olarak SADECE listeyi getirir (hizli); belgeleriIndir=true
// verilirse listelenen tebligatlarin PDF'leri de ayni oturumda tek tek
// indirilir (yavas — belge basina ~10-20 sn).
// Donus: { ok, tebligatlar: [...], kaynak: 'yardimci' | ... }
export async function etebligatlariSorgula(client, giris = null, { belgeleriIndir = false } = {}) {
  const bilgiler = giris || await musteriGirisBilgileriGetir(client.id)
  if (!bilgiler?.dvs_username || !bilgiler?.dvs_password) {
    return { ok: false, reason: 'dvs-sifre-eksik' }
  }
  // 2.8.0: Zaten kayitli (Storage'a yuklenmis) belgeleri yardimciya bildir —
  // yardimci bu belgeleri tekrar indirip zaman kaybetmez (sunucu modunda).
  let kayitliBelgeler = null
  try {
    const { data: kayitli } = await supabase
      .from('etebligatlar')
      .select('belge_no')
      .eq('client_id', client.id)
      .not('belge_no', 'is', null)
    if (kayitli && kayitli.length) kayitliBelgeler = kayitli.map(k => String(k.belge_no).trim()).filter(Boolean)
  } catch { /* tablo yok — tum belgeler indirilir */ }

  // 2.8.5: e-Tebligat sorgusu HER ZAMAN Istanbul sunucusundan — ofis
  // bilgisayari/yerel yardimci kapali olsa bile sorgulama calisir.
  // 2.8.60: yerel yedek kapatildi; VPS'e ulasilamazsa acik hata doner.
  const res = await yardimciIsSunucu('vergi-etebligat-sorgula', {
    clientId: client.id,
    kullaniciKodu: bilgiler.dvs_username,
    parola: bilgiler.dvs_password,
    belgeleriIndir,
    ...(kayitliBelgeler ? { kayitliBelgeler } : {})
  }, belgeleriIndir ? 25 * 60 * 1000 : undefined, undefined, {
    yerelYedek: false,
    yerelYedekKapaliMesaj: 'İstanbul sunucusuna (VPS) ulaşılamadı; e-Tebligat sorgusu yerel bilgisayardan yapılmaz. Lütfen birkaç dakika sonra tekrar deneyin.'
  })
  if (!res.ok) return res

  const yeni = (res.tebligatlar || []).map(t => satirNormalize(client, t))
  const mevcut = lsOku(client.id)
  const indeks = new Map(mevcut.map((s, i) => [s.belge_no, i]))
  // 2.7.521: "yeni" tanimi — onceki sorgudan SONRA gelen tebligatlar.
  // Onceki sorgu zamani referans alinir; tarihi okunamayan veya referanstan
  // eski olan tebligatlar uyari/liste kapsamina girmez. Ilk sorgu referans
  // alinir (uyari uretmez).
  const oncekiSorguTs = sonSorguTsOku(client.id)
  const oncekiZaman = oncekiSorguTs ? new Date(oncekiSorguTs) : null
  const yeniOlanlar = []
  const yeniGelenler = [] // uyari + "Yeni Gelen Tebligatlar" listesi kapsami
  for (const s of yeni) {
    const eski = indeks.get(s.belge_no)
    if (eski === undefined) {
      // Onceki sorgudan sonra mi geldi? (teblig/gonderme tarihi referanstan buyuk)
      const gelisZamani = tebligTarihiCoz(s.teblig_tarihi) || tebligTarihiCoz(s.gonderme_tarihi)
      const gercektenYeni = !!(oncekiZaman && gelisZamani && gelisZamani > oncekiZaman)
      if (gercektenYeni) s.yeni = true
      mevcut.push(s)
      indeks.set(s.belge_no, mevcut.length - 1)
      yeniOlanlar.push(s)
      if (gercektenYeni) yeniGelenler.push(s)
    } else {
      // DVS'ten gelen okundu bilgisi daha gunceldir; gonderim zamanlarini ve
      // "yeni" isaretini koru
      mevcut[eski] = { ...mevcut[eski], ...s, id: mevcut[eski].id, file_url: mevcut[eski].file_url || null, whatsapp_gonderim_ts: mevcut[eski].whatsapp_gonderim_ts, email_gonderim_ts: mevcut[eski].email_gonderim_ts, yeni: mevcut[eski].yeni || false }
    }
  }

  // Yardimci program sorgu sirasinda belgeleri TOPLU indirdiyse (vergi-
  // etebligat-sorgula artik indirilenler donduruyor) her PDF'i Storage'a
  // yukle ve file_url'i satira isle. Böylece MUBiS'te tiklamada belge
  // aninda acilir; ayri giris/captcha gerekmez.
  const indirilenler = res.indirilenler || {}
  for (const [belgeNo, dosyaAdi] of Object.entries(indirilenler)) {
    const satir = mevcut.find(s => s.belge_no === belgeNo)
    if (!satir || satir.file_url) continue
    try {
      const blob = await sunucuDosyaGetir(dosyaAdi)
      if (!blob) continue
      // Sunucu ucu service role ile yukler ve etebligatlar satirina yazar
      const url = await belgeyiBulutaKaydet(client.id, belgeNo, blob)
      if (url) {
        satir.file_url = url
        satir.dosya_adi = `etebligat_${client.id}_${String(belgeNo).replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`
      } else {
        console.warn('[etebligat] toplu belge yukleme basarisiz:', belgeNo)
      }
    } catch (e) {
      console.warn('[etebligat] toplu belge yukleme atlandi:', belgeNo, e?.message || e)
    }
  }

  lsYaz(client.id, mevcut)
  bulutaYaz(client.id, mevcut) // best-effort
  // 2.7.521: sorgu referans zamanini guncelle — bir SONRAKI sorgu bu zamani
  // onceki sorgu olarak kabul eder.
  sonSorguTsYaz(client.id)
  // Admin ana ekran uyarisi: yalnizca ONCEKI SORGUDAN SONRA gelen tebligatlar icin
  if (yeniGelenler.length) {
    try {
      await supabase.from('notifications').insert({
        client_id: client.id,
        audience: 'admin',
        type: 'etebligat',
        title: 'Yeni e-Tebligat',
        message: `${client.company_name || client.name || 'Müşteri'} için ${yeniGelenler.length} adet yeni tebligat gelmişti`,
        route: `/admin/etebligatlar?musteri=${client.id}&yeni=1`,
        metadata: { belge_nolar: yeniGelenler.map(s => s.belge_no) }
      })
    } catch { /* bildirim kritik degil */ }
  }
  return {
    ok: true,
    tebligatlar: mevcut,
    toplam: yeni.length,
    okunmamis: yeni.filter(s => !s.okundu).length,
    yeniGelenSayi: yeniGelenler.length,
    indirilenSayi: Object.keys(indirilenler).length
  }
}

// 2.7.521: musterinin "yeni gelen tebligat" isaretlerini temizler
// (uyariya tiklanip liste gorundukten sonra cagrilir). localStorage +
// Supabase, best-effort.
export async function yeniTebligatlariTemizle(clientId) {
  const satirlar = lsOku(clientId)
  let degisti = false
  for (const s of satirlar) { if (s.yeni) { s.yeni = false; degisti = true } }
  if (degisti) lsYaz(clientId, satirlar)
  try {
    await supabase.from('etebligatlar')
      .update({ yeni: false })
      .eq('client_id', clientId)
      .eq('yeni', true)
  } catch { /* tablo yok */ }
}

// SGK e-Tebligat sorgusu — e-Devlet uzerinden (yardimci programin
// "etebligat-indir" isi, kaynak='sgk'). Yari otomatik akis:
//   1. Yardimci turkiye.gov.tr/e-tebligatlarim sayfasini acar, bilgileri doldurur
//   2. Kullanici guvenlik kodunu girip GIRIS'e basar
//   3. Yardimci arka planda SGK satirlarindaki Goruntule linklerini tek tek acar,
//      PDF'ler "indirilenler" klasorune duser
//   4. Bu fonksiyon yeni inen dosyalari Storage'a yukleyip kaydeder
// onDurum(asama) ilerleme bildirimi verir: 'edevlet-aciliyor' | 'captcha-bekleniyor' | 'dosya-bekleniyor'
export async function sgkEtebligatlariSorgula(client, onDurum = null) {
  const bildir = (asama) => { try { onDurum && onDurum(asama) } catch { /* yok sayilir */ } }

  bildir('edevlet-aciliyor')
  const { tc, edevletPass } = await edevletKimlikGetir(client.id)
  if (!tc || !edevletPass) {
    return { ok: false, reason: 'edevlet-bilgi-eksik' }
  }

  // Indirilenler klasorunun anlik durumunu not al (yeni inenleri ayirt etmek icin)
  let onceki = new Set()
  try {
    const liste = await sunucuDosyalariListele()
    onceki = new Set((liste || []).map(d => d.ad))
  } catch { /* liste alinamazsa tum dosyalar yeni sayilir */ }

  bildir('captcha-bekleniyor')
  const res = await yardimciIsSunucu('etebligat-indir', {
    tc,
    edevletSifre: edevletPass,
    kaynak: 'sgk'
  })
  if (!res?.ok) return res

  // Yeni PDF'leri yakala: 45 sn hic yeni dosya inmediginde dur; en fazla 8 dk
  bildir('dosya-bekleniyor')
  const beklenenMax = 8 * 60 * 1000
  const baslangic = Date.now()
  let sonYeni = Date.now()
  const yeniDosyalar = []
  while (Date.now() - baslangic < beklenenMax) {
    await new Promise(r => setTimeout(r, 5000))
    let liste = []
    try { liste = await sunucuDosyalariListele() } catch { continue }
    for (const d of liste || []) {
      if (!onceki.has(d.ad) && /\.pdf$/i.test(d.ad || '') && !yeniDosyalar.some(x => x.ad === d.ad)) {
        yeniDosyalar.push(d)
        sonYeni = Date.now()
      }
    }
    // Yardimci en fazla 20 belge indirir (~7 sn/belge); 45 sn sessizlik = bitti
    if (yeniDosyalar.length && Date.now() - sonYeni > 45000) break
  }

  if (!yeniDosyalar.length) {
    return { ok: false, reason: 'sgk-belge-yok', not: 'e-Devlet girişi yapıldı ancak yeni belge inmedi. Güvenlik kodu girildi mi? e-Tebligatlarım listesinde SGK tebligatı olabilir.' }
  }

  // Yeni dosyalari Storage'a yukle ve satir olarak kaydet
  const mevcut = lsOku(client.id)
  const mevcutDosyalar = new Set(mevcut.map(s => s.dosya_adi).filter(Boolean))
  let eklenen = 0
  for (let i = 0; i < yeniDosyalar.length; i++) {
    const d = yeniDosyalar[i]
    const temizAd = String(d.ad).replace(/\.pdf$/i, '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60)
    const onek = `etebligat_sgk_${client.id}_${Date.now()}_${i}_${temizAd}`
    try {
      const blob = await sunucuDosyaGetir(d.ad)
      if (!blob) continue
      // Sunucu ucu service role ile yukler (tarayici yuklemesi RLS'e takiliyordu)
      const fileUrl = await belgeyiBulutaKaydet(client.id, `sgk_${temizAd}`, blob)
      if (!fileUrl) console.warn('[etebligat] SGK Storage yukleme basarisiz:', d.ad)
      if (mevcutDosyalar.has(onek + '.pdf')) continue
      mevcut.push({
        client_id: client.id,
        kaynak: 'sgk',
        kurum: 'SGK (Sosyal Güvenlik Kurumu)',
        belge_turu: 'e-Tebligat',
        belge_no: `sgk_${temizAd}`,
        gonderme_tarihi: '',
        teblig_tarihi: d.tarih ? new Date(d.tarih).toISOString().slice(0, 10) : '',
        okuma_tarihi: '',
        okundu: false,
        dosya_adi: onek + '.pdf',
        file_url: fileUrl || null,
        sorgu_ts: new Date().toISOString()
      })
      mevcutDosyalar.add(onek + '.pdf')
      eklenen++
    } catch (e) {
      console.warn('[etebligat] SGK belge yukleme atlandi:', d.ad, e?.message || e)
    }
  }

  lsYaz(client.id, mevcut)
  bulutaYaz(client.id, mevcut)
  return {
    ok: true,
    tebligatlar: mevcut,
    toplam: eklenen,
    okunmamis: eklenen,
    not: `${eklenen} SGK tebligatı indirildi ve kaydedildi.`
  }
}

// "Vergi Dairesi Toplu Tebligat": secili musterinin listelenen tum
// tebligatlarinin PDF'lerini ayni DVS oturumunda tek tek indirir, Storage'a
// yukler ve satirlara file_url isler. Görüntüle tiklamalarinda artik
// ayri giris/captcha gerekmez.
export async function etebligatlariTopluBelgeIndir(client, giris = null) {
  return etebligatlariSorgula(client, giris, { belgeleriIndir: true })
}

// Tabloya best-effort yazma (tablo yoksa sessiz gec)
async function bulutaYaz(clientId, satirlar) {
  try {
    let officeId = null
    try { officeId = await getMyOfficeId() } catch { /* opsiyonel */ }
    const kayitlar = satirlar.slice(0, 100).map(s => {
      const { id: yerelId, ...govde } = s // yerel/legacy id tabloyla cakismasin
      return {
        ...govde,
        office_id: officeId,
        dosya_adi: s.file_url ? `etebligat_${clientId}_${s.belge_no}.pdf` : null
      }
    })
    await supabase.from('etebligatlar').upsert(kayitlar, { onConflict: 'client_id,belge_no' })
  } catch (e) {
    console.warn('[etebligat] bulut kaydi atlandi:', e?.message || e)
  }
}

// Tebligat kaydini MUBiS'ten siler (localStorage + Supabase, best-effort).
// GIB/DVS kayitlarina dokunmaz — yalnizca MUBiS listesinden kalkar.
export async function etebligatSil(clientId, belgeNo) {
  const satirlar = lsOku(clientId).filter(x => x.belge_no !== belgeNo)
  lsYaz(clientId, satirlar)
  try {
    await supabase.from('etebligatlar')
      .delete()
      .eq('client_id', clientId)
      .eq('belge_no', belgeNo)
  } catch { /* tablo yok */ }
}

// 2.8.5: OKUNDU ARTIK KISIYE OZEL — kim okuduysa yalnizca onun listesinde
// "okundu" gorunur; diger kullanici (admin/personel/musteri) kendisi okuyana
// kadar kendi tarafinda "yeni tebligat" uyarisi gormeye devam eder.
// Paylasilan etebligatlar.okundu kolonuna DOKUNULMAZ (geriye donuk uyumluluk:
// eski okundu=true kayitlari herkes icin okundu sayilir).
export async function okunduAyarla(clientId, belgeNo, okundu) {
  let oturum = null
  try { ({ data: { user: oturum } } = await supabase.auth.getUser()) } catch { /* oturum yok */ }
  if (oturum?.id) {
    if (okundu) {
      const { error } = await supabase.from('etebligat_okundu')
        .upsert({ client_id: clientId, belge_no: belgeNo, user_id: oturum.id }, { onConflict: 'client_id,belge_no,user_id' })
      if (error) console.warn('[etebligat] kisiye ozel okundu kaydedilemedi:', error.message)
    } else {
      await supabase.from('etebligat_okundu')
        .delete()
        .eq('client_id', clientId)
        .eq('belge_no', belgeNo)
        .eq('user_id', oturum.id)
    }
  }
  // localStorage yedegi kullaniciya ozel anahtarla tutulur (oturum yoksa genel)
  const lsAnahtar = oturum?.id ? `etebligat_okundu_${oturum.id}` : 'etebligat_okundu'
  try {
    const kume = new Set(JSON.parse(localStorage.getItem(lsAnahtar) || '[]'))
    if (okundu) kume.add(belgeNo)
    else kume.delete(belgeNo)
    localStorage.setItem(lsAnahtar, JSON.stringify([...kume]))
  } catch { /* localStorage yok */ }
}

// 2.8.5: Giris yapan kullanicinin bu musteri icin okundu isaretledigi
// belgeler (Supabase + localStorage yedegi birlesik).
export async function kullaniciOkunduSeti(clientId) {
  const kume = new Set()
  let oturum = null
  try { ({ data: { user: oturum } } = await supabase.auth.getUser()) } catch { /* oturum yok */ }
  if (oturum?.id) {
    try {
      const { data } = await supabase.from('etebligat_okundu')
        .select('belge_no')
        .eq('user_id', oturum.id)
        .eq('client_id', clientId)
      ;(data || []).forEach(r => kume.add(String(r.belge_no)))
    } catch { /* tablo yok — localStorage yeter */ }
    try {
      ;(JSON.parse(localStorage.getItem(`etebligat_okundu_${oturum.id}`) || '[]')).forEach(b => kume.add(String(b)))
    } catch { /* localStorage yok */ }
  }
  return kume
}

export async function gonderimKaydet(clientId, belgeNo, kanal) {
  const ts = new Date().toISOString()
  const satirlar = lsOku(clientId)
  const s = satirlar.find(x => x.belge_no === belgeNo)
  if (s) {
    if (kanal === 'whatsapp') s.whatsapp_gonderim_ts = ts
    if (kanal === 'email') s.email_gonderim_ts = ts
    lsYaz(clientId, satirlar)
  }
  try {
    const guncelleme = kanal === 'whatsapp' ? { whatsapp_gonderim_ts: ts } : { email_gonderim_ts: ts }
    await supabase.from('etebligatlar')
      .update(guncelleme)
      .eq('client_id', clientId)
      .eq('belge_no', belgeNo)
  } catch { /* tablo yok */ }
  return ts
}

export async function tebligatPdfGetir(url) {
  if (!url) return { ok: false, reason: 'belge-yok' }
  const controller = new AbortController()
  const zamanlayici = setTimeout(() => controller.abort(), 15000)
  try {
    const r = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    if (!r.ok) return { ok: false, reason: 'belge-erisim-hatasi', status: r.status }
    const buf = new Uint8Array(await r.arrayBuffer())
    if (buf.length < 500 || String.fromCharCode(...buf.subarray(0, 5)) !== '%PDF-') {
      return { ok: false, reason: 'gecersiz-pdf' }
    }
    let metin = ''
    for (let i = 0; i < buf.length; i += 0x8000) metin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000))
    const kucuk = metin.toLowerCase()
    if (kucuk.includes('jasperreports') || kucuk.includes('jaspersoft')) {
      return { ok: false, reason: 'liste-ciktisi' }
    }
    return { ok: true, blob: new Blob([buf], { type: 'application/pdf' }) }
  } catch {
    return { ok: false, reason: 'belge-erisim-hatasi' }
  } finally {
    clearTimeout(zamanlayici)
  }
}

// PDF'i sunucu uzerinden Storage'a yukler ve etebligatlar satirina file_url
// yazar (/api/etebligat-belge-kaydet, service role). Tarayicinin dogrudan
// Storage yuklemesi RLS politiklari nedeniyle sessizce basarisiz olabiliyordu;
// bu yuzden file_url bos kaliyor ve her Goruntule tiklamasi yardimciya
// yeniden baglaniyordu.
// Donus: kaydedilen public URL ('' = kaydedilemedi)
export async function belgeyiBulutaKaydet(clientId, belgeNo, blob) {
  try {
    if (!clientId || !belgeNo || !blob) return ''
    const buf = new Uint8Array(await blob.arrayBuffer())
    let ikili = ''
    for (let i = 0; i < buf.length; i += 0x8000) ikili += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000))
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return ''
    const r = await fetch('/api/etebligat-belge-kaydet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ client_id: clientId, belge_no: belgeNo, pdf_base64: btoa(ikili) })
    })
    if (!r.ok) return ''
    const j = await r.json().catch(() => null)
    return j?.ok ? (j.file_url || '') : ''
  } catch { return '' }
}

// Tebligat belgesini yardimci program araciligiyla indirir ve Storage'a yukler.
// Donus: { ok, url, blob }
export async function etebligatBelgesiAl(client, satir, giris = null) {
  const bilgiler = giris || await musteriGirisBilgileriGetir(client.id)
  if (!bilgiler?.dvs_username || !bilgiler?.dvs_password) {
    return { ok: false, reason: 'dvs-sifre-eksik' }
  }
  const onek = `etebligat_${client.id}_${String(satir.belge_no).replace(/[^A-Za-z0-9_-]/g, '_')}`
  // 2.8.5: belge indirme HER ZAMAN sunucudan (yerel yardimci gerekmez)
  const res = await yardimciIsSunucu('vergi-etebligat-belge-indir', {
    kullaniciKodu: bilgiler.dvs_username,
    parola: bilgiler.dvs_password,
    belgeNo: satir.belge_no,
    dosyaOneki: onek
  })
  if (!res.ok) return res

  // 2.7.466: Yerel onbellek — yardimci belgeyi indirilenler klasorunde
  // hazir bulduysa GIB'e baglanmaz ve base64 dondurur. Aninda acilir.
  let blob
  if (res.base64) {
    const ikili = Uint8Array.from(atob(res.base64), c => c.charCodeAt(0))
    blob = new Blob([ikili], { type: 'application/pdf' })
  } else {
    blob = await sunucuDosyaGetir(res.dosyaAdi)
  }

  // 2.7.242: yeni inen blob da kontrol edilir — yardimci eski sürümse veya
  // imza varyanti yakalanamadiysa liste ciktisi Storage'a yazilip acilmaz.
  try {
    const buf2 = new Uint8Array(await blob.slice(0, blob.size).arrayBuffer())
    let metin2 = ''
    for (let i = 0; i < buf2.length; i += 0x8000) metin2 += String.fromCharCode.apply(null, buf2.subarray(i, i + 0x8000))
    const kucuk2 = metin2.toLowerCase()
    if (buf2.length > 500 && (kucuk2.includes('jasperreports') || kucuk2.includes('jaspersoft'))) {
      return { ok: false, reason: 'liste-ciktisi' }
    }
  } catch { /* kontrol edilemediysen akisa devam */ }

  // Storage'a yukle (sunucu ucu service role ile yukler; varsa eskisinin
  // uzerine yazar) ve file_url'i kaydet
  const url = await belgeyiBulutaKaydet(client.id, satir.belge_no, blob)
  if (!url) console.warn('[etebligat] Storage yukleme basarisiz (sunucu ucu)')
  const satirlar = lsOku(client.id)
  const k = satirlar.find(x => x.belge_no === satir.belge_no)
  if (k) { k.file_url = url; lsYaz(client.id, satirlar) }
  try {
    if (url) {
      await supabase.from('etebligatlar')
        .update({ file_url: url, dosya_adi: onek + '.pdf' })
        .eq('client_id', client.id)
        .eq('belge_no', satir.belge_no)
    }
  } catch { /* tablo yok */ }

  return { ok: true, url, blob, dosyaAdi: onek + '.pdf' }
}
