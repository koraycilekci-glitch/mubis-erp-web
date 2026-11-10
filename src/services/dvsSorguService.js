// DVS Sorgu Servisi: POS / KDV 109 / KDV 110
import { supabase } from '../lib/supabase'
import { yardimciIsSunucu, musteriGirisBilgileriGetir } from '../utils/gibOdemeHelper'
import { devredenKdvOku, storageBeyanUrl } from './kdvDurumService'
import { fetchDocument, isOwnStorageUrl } from '../utils/storageUrl'
import { uttsOtomatikSatirlariniOku } from '../utils/uttsExcel'
import { tevkifatKdvDokumu, tevkifatOdendiOku } from './tevkifatService'

function sayi(v) {
  const n = Number(v)
  return isFinite(n) && n >= 0 ? n : 0
}

export const TUR_ETIKET = {
  '109': 'Sorumlu Sıfatıyla Ödenen KDV (109)',
  '110': 'Gümrük İşlemleri KDV',
  'pos': 'Kredi Kartı Hasılatı'
}

// ---------- SORGULA (yerel MUBiS yardımcı program üzerinden) ----------
export async function dvsSorgula({ clientId, yil, ay, tur }) {
  const giris = await musteriGirisBilgileriGetir(clientId)
  if (!giris?.dvs_username || !giris?.dvs_password) {
    throw new Error('Müşteri DVS kullanıcı adı/şifresi kayıtlı değil')
  }
  // 2.8.8: Sorgu once ISTANBUL sunucusundan (VPS) calisir — ofis bilgisayari
  // kapaliyken de POS/KDV dokum sorgulanabilir; sunucuya ulasilamazsa yerel
  // yardimciya duser (yardimciIsSunucu hata firlatmaz, ok:false doner).
  const res = await yardimciIsSunucu('dvs-sorgula', {
    clientId,
    kullaniciKodu: giris.dvs_username,
    parola: giris.dvs_password,
    yil,
    ay,
    tur
  }, 10 * 60 * 1000)
  if (!res.ok) {
    if (res.reason === 'kurulu-degil') throw new Error('MUBiS yardımcı programı bu bilgisayarda çalışmıyor. Lütfen başlatın.')
    if (res.reason === 'servis-yanit-vermedi') throw new Error('Sunucu yanıt vermedi; sorgu arka planda çalışıyor olabilir. Biraz sonra yenileyin.')
    if (res.reason === 'servis-hatasi') throw new Error(res.error || 'Sunucu hatası')
    throw new Error(res.error || res.reason || res.not || 'Sorgu başarısız')
  }
  await sonucKaydet(clientId, giris.office_id || giris.officeId, yil, ay, tur, res)
  return res
}

async function sonucKaydet(clientId, officeId, yil, ay, tur, sonuc) {
  // office_id yoksa musteriden al (RLS ve unique conflict icin sart)
  let gercekOfficeId = officeId || sonuc?.office_id || null
  if (!gercekOfficeId) {
    const { data: client } = await supabase
      .from('clients')
      .select('office_id')
      .eq('id', clientId)
      .maybeSingle()
    gercekOfficeId = client?.office_id || null
  }
  if (!gercekOfficeId) {
    throw new Error('Müşterinin office_id bilgisi bulunamadı; sonuç kaydedilemedi.')
  }
  const bugun = new Date().toISOString().slice(0, 10)

  if (tur === 'pos') {
    // NOT: toplam_tutar GENERATED sütundur, insert edilemez.
    // banka_detay / odeme_detay tabloda yok; metadata JSONB icinde saklanir.
    const { error } = await supabase.from('kredi_karti_hasilat').upsert({
      office_id: gercekOfficeId,
      client_id: clientId,
      yil,
      ay,
      banka_pos_tutar: sayi(sonuc.banka_pos_tutar),
      odeme_para_tutar: sayi(sonuc.odeme_para_tutar),
      sorgu_tarihi: bugun,
      kaynak: 'manuel',
      metadata: {
        banka_detay: sonuc.banka_detay || [],
        odeme_detay: sonuc.odeme_detay || [],
        banka_tani: sonuc.banka_tani || null
      }
    }, { onConflict: 'office_id,client_id,yil,ay' })
    if (error) throw new Error('POS sonucu kaydedilemedi: ' + error.message)
  } else {
    const { error } = await supabase.from('kdv_dokumleri').upsert({
      office_id: gercekOfficeId,
      client_id: clientId,
      yil,
      ay,
      tur,
      toplam_tutar: sayi(sonuc.toplam_tutar),
      detaylar: sonuc.detaylar || [],
      sorgu_tarihi: bugun,
      kaynak: 'manuel'
    }, { onConflict: 'office_id,client_id,yil,ay,tur' })
    if (error) throw new Error('KDV dökümü kaydedilemedi: ' + error.message)
  }
  // KDV durum kartını da güncelle
  try {
    await kdvDurumKartiGuncelle(clientId, gercekOfficeId, yil, ay)
  } catch (e) {
    console.warn('[dvs-sorgula] kdv durum karti guncellenemedi:', e?.message)
  }
}

// ---------- KDV DURUM KARTI (devreden / ödeme) ----------
async function devredenGirisBul(clientId, yil, ay) {
  // Bir önceki ay
  const oncekiYil = ay === 1 ? yil - 1 : yil
  const oncekiAy = ay === 1 ? 12 : ay - 1

  // 2.8.13: ÖNCE BEYANNAME PDF'INDEN OKU — beyan yüklüyse kart değeri değil
  // beyanname esastır (kullanıcı beyanı elle yüklediğinde kart eski/karışık
  // kalabiliyordu; kart yalnızca PDF yoksa yedek olarak kullanılır).
  // 1) clients.beyan_durumlari'ndan önceki ayın KDV1 beyanını bul ve PDF'ten oku
  const { data: client } = await supabase
    .from('clients')
    .select('beyan_durumlari, vkn, tc, name, company, office_id')
    .eq('id', clientId)
    .maybeSingle()
  const bd = client?.beyan_durumlari || {}
  // hem 1-bazlı hem 0-bazlı ay anahtarı (eski yükleme akışları 0-bazlı yazmış olabiliyor)
  const ayAnahtarlari = [`${oncekiYil}_${oncekiAy}`, `${oncekiYil}_${oncekiAy - 1}`]

  let beyanUrl = ''
  for (const ta of ayAnahtarlari) {
    beyanUrl =
      bd[`${ta}_kdv_beyan_url`] ||
      bd[`${ta}_kdv_beyanname_url`] ||
      bd[`${ta}_kdv_beyan_pdf_url`] ||
      bd[`${ta}_kdv_pdf_url`] ||
      bd[`${ta}_kdv1_beyan_url`] ||
      bd[`${ta}_kdv1_pdf_url`] ||
      ''
    if (beyanUrl) break

    const listeKeys = [
      `${ta}_kdv_beyanlar`,
      `${ta}_kdv_beyannameler`,
      `${ta}_kdv_pdflar`,
      `${ta}_kdv1_beyanlar`,
      `${ta}_kdv1_pdflar`
    ]
    for (const lk of listeKeys) {
      const arr = bd[lk]
      if (Array.isArray(arr) && arr.length) {
        // KDV ile ilgili olani tercih et
        const kdvli = arr.find(x => /kdv|katma|0015/i.test(String(x?.name || x?.url || '')))
        const secim = kdvli || arr[arr.length - 1]
        beyanUrl = secim?.url || ''
        if (beyanUrl) {
          console.log('[kdv-durum] beyan_durumlari listesinden URL:', lk, beyanUrl)
          break
        }
      }
    }
    if (beyanUrl) break
  }

  console.log('[kdv-durum] beyan URL:', oncekiYil, oncekiAy, beyanUrl || '(yok)')

  let devreden = { tutar: 0, kaynak: 'beyanname-yok' }
  if (beyanUrl) {
    devreden = await devredenKdvOku(beyanUrl)
    console.log('[kdv-durum] beyan PDF sonuc:', JSON.stringify(devreden))
  }

  if (['okunamadi', 'beyanname-yok', 'hata'].includes(devreden.kaynak)) {
    const storageUrl = storageBeyanUrl(client, oncekiYil, oncekiAy)
    console.log('[kdv-durum] storage yedek URL:', storageUrl || '(yok)')
    if (storageUrl && storageUrl !== beyanUrl) {
      const yedek = await devredenKdvOku(storageUrl)
      console.log('[kdv-durum] storage PDF sonuc:', JSON.stringify(yedek))
      if (yedek.tutar > 0) devreden = yedek
    }
  }

  // PDF'ten okunduysa beyanname esastir — kart degerlerine bakilmaz
  if (devreden.tutar > 0) return devreden.tutar

  // 2) PDF yoksa: kdv_durum_kartlari'ndan önceki ayın "Sonraki Aya Devreden"i
  const { data: oncekiKart } = await supabase
    .from('kdv_durum_kartlari')
    .select('devreden_sonraki')
    .eq('client_id', clientId)
    .eq('yil', oncekiYil)
    .eq('ay', oncekiAy)
    .maybeSingle()
  if (oncekiKart?.devreden_sonraki) {
    console.log('[kdv-durum] onceki ay kartindan devreden:', oncekiYil, oncekiAy, oncekiKart.devreden_sonraki)
    return sayi(oncekiKart.devreden_sonraki)
  }

  // 3) Hâlâ bulunamadiysa: müsteriye ait son bilinen devreden_sonraki kaydini bul
  // (zincirleme hesaplar icin gecmis aylarda varsa)
  if (devreden.tutar <= 0) {
    const { data: sonKart } = await supabase
      .from('kdv_durum_kartlari')
      .select('yil, ay, devreden_sonraki')
      .eq('client_id', clientId)
      .gt('devreden_sonraki', 0)
      .order('yil', { ascending: false })
      .order('ay', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (sonKart?.devreden_sonraki) {
      console.log('[kdv-durum] son bilinen devreden karti:', sonKart.yil, sonKart.ay, sonKart.devreden_sonraki)
      // Eger son bilinen kart, istenen aydan onceyse onu kullan; sonraki aylarda devreden varsa onlari dikkate alma
      const istenenDonem = oncekiYil * 12 + oncekiAy
      const sonDonem = sonKart.yil * 12 + sonKart.ay
      if (sonDonem <= istenenDonem) {
        return sayi(sonKart.devreden_sonraki)
      }
    }
  }

  return devreden.tutar
}

export async function kdvDurumKartiGuncelle(clientId, officeId, yil, ay) {
  // office_id bilinmiyorsa musteriden al; RLS icin dogru ofis kaydi sart
  let gercekOfficeId = officeId
  if (!gercekOfficeId) {
    const { data: client } = await supabase
      .from('clients')
      .select('office_id')
      .eq('id', clientId)
      .maybeSingle()
    gercekOfficeId = client?.office_id || null
  }

  const devredenGiris = await devredenGirisBul(clientId, yil, ay)

  const [fk, k109, k110, gumruk] = await Promise.all([
    faturaKdvToplamlari({ clientId, yil, ay }),
    kdvDokumGetir({ clientId, yil, ay, tur: '109' }),
    kdvDokumGetir({ clientId, yil, ay, tur: '110' }),
    gumrukKdvDokumu({ clientId, yil, ay })
  ])

  const alinanKdv = sayi(fk.alinan)
  const kesilenKdv = sayi(fk.kesilen)
  const kdv109Tutar = sayi(k109?.toplam_tutar || 0)
  // 2.8.14: İthalde Ödenen KDV (110) kaynağı — ithalat faturası YÜKLENDİYSE
  // yüklenen faturaların KDV toplamı esas alınır; yüklenmediyse GİB Gümrük
  // İşlemleri KDV sorgusunun (kdv_dokumleri tur=110) toplam tutarı kullanılır.
  const ithalatYuklu = (gumruk?.sayisi || 0) > 0 && (gumruk?.toplam || 0) > 0
  const gibGumrukTutar = sayi(k110?.toplam_tutar || 0)
  const kdv110Tutar = ithalatYuklu ? sayi(gumruk.toplam) : gibGumrukTutar
  const kdv110Kaynak = ithalatYuklu ? 'yuklenen-ithalat-faturalari' : (gibGumrukTutar > 0 ? 'gib-sorgusu' : 'yok')

  // Sorumlu Sıfatıyla KDV (109) etkin tutarı:
  //   1. GİB 109 sorgusunda tutar varsa -> o tutar
  //   2. GİB 109 yok ama Tevkifat Alış "Ödendi" işaretliyse -> tevkifat KDV
  //   3. İkisi de yoksa -> 0
  // Etkin tutar indirilebilir KDV toplamına EKLENİR.
  let tevkifatKdv = 0
  let tevkifatOdendi = false
  try {
    const dokum = await tevkifatKdvDokumu({ clientId, yil, ay })
    tevkifatKdv = dokum?.toplam?.tevkifatKdv || 0
    tevkifatOdendi = await tevkifatOdendiOku({ clientId, yil, ay })
  } catch (e) {
    console.warn('[kdv-durum-karti] tevkifat KDV hesaplanamadi:', e?.message)
  }
  const kdv109Etkin = kdv109Tutar > 0 ? kdv109Tutar : (tevkifatOdendi ? tevkifatKdv : 0)
  const kdv109Kaynak = kdv109Tutar > 0 ? 'gib-sorgusu' : (tevkifatOdendi && tevkifatKdv > 0 ? 'tevkifat-alis-odendi' : 'yok')

  const indirilebilirToplam = +(devredenGiris + alinanKdv + kdv109Etkin + kdv110Tutar).toFixed(2)
  let odeme = 0
  let devredenSonraki = 0
  if (kesilenKdv > indirilebilirToplam) {
    odeme = +(kesilenKdv - indirilebilirToplam).toFixed(2)
  } else {
    devredenSonraki = +(indirilebilirToplam - kesilenKdv).toFixed(2)
  }

  await supabase.from('kdv_durum_kartlari').upsert({
    office_id: gercekOfficeId,
    client_id: clientId,
    yil,
    ay,
    devreden_giris: devredenGiris,
    alinan_kdv: alinanKdv,
    kdv_109: kdv109Etkin,
    kdv_110: kdv110Tutar,
    indirilebilir_toplam: indirilebilirToplam,
    kesilen_kdv: kesilenKdv,
    odeme,
    devreden_sonraki: devredenSonraki,
    kaynak: 'manuel'
  }, { onConflict: 'office_id,client_id,yil,ay' })

  return {
    office_id: gercekOfficeId,
    client_id: clientId,
    yil,
    ay,
    devreden_giris: devredenGiris,
    alinan_kdv: alinanKdv,
    kdv_109: kdv109Etkin,
    kdv_109_etkin: kdv109Etkin,
    kdv_109_kaynak: kdv109Kaynak,
    tevkifat_kdv: tevkifatKdv,
    tevkifat_odendi: tevkifatOdendi,
    kdv_110: kdv110Tutar,
    kdv_110_kaynak: kdv110Kaynak,
    indirilebilir_toplam: indirilebilirToplam,
    kesilen_kdv: kesilenKdv,
    odeme,
    devreden_sonraki: devredenSonraki
  }
}

export async function kdvDurumKartiGetir({ clientId, yil, ay }) {
  const { data, error } = await supabase
    .from('kdv_durum_kartlari')
    .select('*')
    .eq('client_id', clientId)
    .eq('yil', yil)
    .eq('ay', ay)
    .maybeSingle()
  if (error) throw error
  return data || { client_id: clientId, yil, ay, devreden_giris: 0, alinan_kdv: 0, kdv_109: 0, kdv_110: 0, indirilebilir_toplam: 0, kesilen_kdv: 0, odeme: 0, devreden_sonraki: 0 }
}

// ---------- SORGULA DURUMU (GET) ----------
export async function dvsSorguDurumGetir({ clientId, yil, ay, tur }) {
  if (tur === 'pos') {
    const { data } = await supabase.from('kredi_karti_hasilat')
      .select('sorgu_tarihi')
      .eq('client_id', clientId).eq('yil', yil).eq('ay', ay)
      .maybeSingle()
    return { status: data?.sorgu_tarihi ? 'basarili' : 'yok' }
  }
  const { data } = await supabase.from('kdv_dokumleri')
    .select('sorgu_tarihi')
    .eq('client_id', clientId).eq('yil', yil).eq('ay', ay).eq('tur', tur)
    .maybeSingle()
  return { status: data?.sorgu_tarihi ? 'basarili' : 'yok' }
}

// ---------- KREDİ KARTI HASILAT ----------
export async function krediKartiHasilatGetir({ clientId, yil, ay }) {
  const { data, error } = await supabase
    .from('kredi_karti_hasilat')
    .select('*')
    .eq('client_id', clientId)
    .eq('yil', yil)
    .eq('ay', ay)
    .maybeSingle()
  if (error) throw error
  return data || { client_id: clientId, yil, ay, banka_pos_tutar: 0, odeme_para_tutar: 0, toplam_tutar: 0, sorgu_tarihi: null }
}

export async function krediKartiHasilatListele(clientId, yil) {
  const { data, error } = await supabase
    .from('kredi_karti_hasilat')
    .select('*')
    .eq('client_id', clientId)
    .eq('yil', yil)
    .order('ay', { ascending: true })
  if (error) throw error
  return data || []
}

// ---------- KDV DÖKÜMLERİ ----------
export async function kdvDokumGetir({ clientId, yil, ay, tur }) {
  const { data, error } = await supabase
    .from('kdv_dokumleri')
    .select('*')
    .eq('client_id', clientId)
    .eq('yil', yil)
    .eq('ay', ay)
    .eq('tur', tur)
    .maybeSingle()
  if (error) throw error
  return data || { client_id: clientId, yil, ay, tur, toplam_tutar: 0, detaylar: [], sorgu_tarihi: null }
}

export async function kdvDokumleriListele(clientId, yil) {
  const { data, error } = await supabase
    .from('kdv_dokumleri')
    .select('*')
    .eq('client_id', clientId)
    .eq('yil', yil)
    .order('ay', { ascending: true })
    .order('tur', { ascending: true })
  if (error) throw error
  return data || []
}

export function kdvDokumToplam(data, tur) {
  return (data || []).filter(d => d.tur === tur).reduce((s, d) => s + sayi(d.toplam_tutar), 0)
}

export function kdvDokumEtiket(tur) {
  return TUR_ETIKET[tur] || tur
}

// ---------- GÜMRÜK İŞLEMLERİ KDV (yükllenen ithalat faturaları) ----------
// Kullanıcının yüklediği gümrük/ithalat Excel'lerinden gelen ithalat fatura
// satırları (efatura_faturalar, tur='gumruk') — seçili dönemin KDV toplamı
// ve satır detayı. Dosya adında "Gümrük" veya "İthalat" geçen Excel'ler
// Fatura Yükleme'de otomatik olarak bu kayıtlara dönüşür.
export async function gumrukKdvDokumu({ clientId, yil, ay }) {
  const baslangic = `${yil}-${String(ay).padStart(2, '0')}-01`
  const sYil = ay === 12 ? yil + 1 : yil
  const sAy = ay === 12 ? 1 : ay + 1
  const bitis = `${sYil}-${String(sAy).padStart(2, '0')}-01`

  const kayitlar = []
  for (let from = 0; from < 100000; ) {
    const { data, error } = await supabase
      .from('efatura_faturalar')
      .select('fatura_no, karsi_unvan, matrah, kdv, tutar, tarih, xml_url')
      .eq('client_id', clientId)
      .eq('tur', 'gumruk')
      .gte('tarih', baslangic)
      .lt('tarih', bitis)
      .order('tarih', { ascending: true })
      .range(from, from + 499)
    if (error) { console.warn('[gumruk-kdv] faturalar alinamadi:', error.message); break }
    if (!data || data.length === 0) break
    kayitlar.push(...data)
    from += data.length
  }

  const toplam = kayitlar.reduce((s, f) => s + sayi(f.kdv), 0)
  return {
    toplam: +toplam.toFixed(2),
    sayisi: kayitlar.length,
    kayitlar
  }
}

// ---------- FATURA KDV KARŞILAŞTIRMA ----------
export async function faturaKdvToplamlari({ clientId, yil, ay }) {
  const baslangic = `${yil}-${String(ay).padStart(2, '0')}-01`
  // Ana ekran (kdvDurumuGetir) ile ayni uç nokta: ayin son günü DAHIL,
  // bir sonraki ayin 1'i HARIC (t < aySon).
  const sYil = ay === 12 ? yil + 1 : yil
  const sAy = ay === 12 ? 1 : ay + 1
  const bitis = `${sYil}-${String(sAy).padStart(2, '0')}-01`

  // Tum sayfalari cevir (PostgREST range ile)
  const tumFaturalariAl = async (yon) => {
    const sonuc = []
    for (let from = 0; from < 100000; ) {
      const { data, error } = await supabase
        .from('efatura_faturalar')
        .select('kdv')
        .eq('client_id', clientId)
        .eq('yon', yon)
        .in('tur', yon === 'gelen' ? ['efatura', 'earsiv', 'esmm', 'utts'] : ['efatura', 'earsiv', 'esmm'])
        .gte('tarih', baslangic)
        .lt('tarih', bitis)
        .range(from, from + 999)
      if (error) throw error
      if (!data || data.length === 0) break
      sonuc.push(...data)
      from += data.length
      if (data.length < 1000) break
    }
    return sonuc
  }

  const [alinan, kesilen] = await Promise.all([
    tumFaturalariAl('gelen'),
    tumFaturalariAl('giden')
  ])

  const toplamAlinan = (alinan || []).reduce((s, f) => s + sayi(f.kdv), 0)
  const toplamKesilen = (kesilen || []).reduce((s, f) => s + sayi(f.kdv), 0)
  console.log('[fatura-kdv]', yil, ay, 'gelen kayit:', alinan.length, 'toplam:', toplamAlinan, 'giden kayit:', kesilen.length, 'toplam:', toplamKesilen)
  return {
    alinan: toplamAlinan,
    kesilen: toplamKesilen
  }
}

// Oran detayi bulunmayan kayitlarda KDV oranini sirayla %20 -> %10 -> %1
// adaylariyla dener; ilk uyan aday kullanilir.
//
// Matrah KDV UZERINDEN hesaplanir: matrah = KDV / (oran/100).
// Boylece OTV, konaklama vergisi gibi KDV matrahina dahil olmayan diger
// vergiler matraha eklenmez; genel toplam = matrah + KDV olur.
export const ADAY_KDV_ORANLARI = [20, 10, 1]

const sayiOlarak = (deger) => {
  if (deger === null || deger === undefined || deger === '') return null
  const n = Number(deger)
  return Number.isFinite(n) && n >= 0 ? n : null
}

// KDV'den matrah: oran biliniyorsa tek dogru taban budur.
export const kdvDenMatrah = (kdv, oran) => {
  const k = sayiOlarak(kdv)
  const o = sayiOlarak(oran)
  if (k === null || !o) return null
  return Math.round((k / (o / 100)) * 100) / 100
}

export function kdvOranTahminEt({ matrah, kdv, tutar }) {
  const m = sayiOlarak(matrah)
  const k = sayiOlarak(kdv)
  const t = sayiOlarak(tutar)
  if (k === null) return null

  // KDV 0 ise oran %0'dir (istisna / %0 uygulanan belge); matrah KDV'den
  // turetilemez, kayitli matrah (yoksa tutar) kullanilir.
  if (k === 0) {
    const taban = m !== null && m > 0 ? m : (t !== null ? t : null)
    return taban === null ? null : { oran: 0, matrah: taban, taban: 'kayitli' }
  }

  // Oran tespiti icin aday tabanlar: once kayitli matrah, sonra toplam - KDV.
  // (Sadece orani bulmak icin; sonuc matrahi her zaman KDV'den hesaplanir.)
  const netTaban = t !== null ? Math.round((t - k) * 100) / 100 : null
  const tabanlar = []
  if (m !== null && m > 0) tabanlar.push(m)
  if (netTaban !== null && netTaban > 0 && Math.abs(netTaban - (m ?? 0)) > 0.005) tabanlar.push(netTaban)
  if (!tabanlar.length) return null

  // 1) Sirayla %20, %10, %1 — her tabanla beklenen KDV'yi karsilastir.
  for (const aday of ADAY_KDV_ORANLARI) {
    for (const taban of tabanlar) {
      const beklenen = taban * aday / 100
      const tolerans = Math.max(0.05, taban * 0.006)
      if (Math.abs(beklenen - k) <= tolerans) {
        return { oran: aday, matrah: kdvDenMatrah(k, aday), taban: 'kdv' }
      }
    }
  }

  // 2) Tam eslesme yoksa fiili oran standart oranlardan birine 1,5 puandan
  //    yakinsa ona siniflandir (kurus yuvarlamasi / kalinti farklar icin).
  for (const taban of tabanlar) {
    const fiili = (k / taban) * 100
    const yakin = ADAY_KDV_ORANLARI.find(aday => Math.abs(fiili - aday) <= 1.5)
    if (yakin) return { oran: yakin, matrah: kdvDenMatrah(k, yakin), taban: 'kdv' }
  }

  return null
}

export function faturaKdvOranlariniGrupla(faturalar, detaylar) {
  const gruplar = new Map()
  let eksikTutar = 0
  let tahminEdilen = 0
  const cozulemeyenler = []
  const tutar = deger => deger !== null && deger !== undefined && deger !== '' && Number.isFinite(Number(deger)) && Number(deger) >= 0 ? Number(deger) : null
  const kurus = deger => Math.round(deger * 100)

  for (const fatura of faturalar) {
    const matrah = tutar(fatura.matrah)
    const kdv = tutar(fatura.kdv)
    if (matrah === null || kdv === null) eksikTutar++
    const parcalar = detaylar[fatura.id] || []
    const kaynakDogrulandi = parcalar.length > 0 && parcalar.every(parca => parca.kaynakDogrulandi === true)
    const gecerli = parcalar.length > 0 && parcalar.every(parca => {
      const oran = tutar(parca.oran)
      return oran !== null && oran <= 100 && tutar(parca.matrah) !== null && tutar(parca.kdv) !== null
    }) && matrah !== null && kdv !== null
      && (kaynakDogrulandi || parcalar.reduce((toplam, parca) => toplam + kurus(Number(parca.matrah)), 0) === kurus(matrah))
      && parcalar.reduce((toplam, parca) => toplam + kurus(Number(parca.kdv)), 0) === kurus(kdv)
    const satirlar = gecerli ? parcalar : (() => {
      // Oran detayi yok / toplamlarla uyusmuyor: matrah+KDV (ve varsa tutar)
      // uzerinden orani tahmin et; bulunamazsa "Oran belirlenemedi"de kalir.
      const tahmin = kdvOranTahminEt({ matrah, kdv, tutar: fatura.tutar })
      if (tahmin && tahmin.oran !== null) {
        tahminEdilen++
        return [{ oran: tahmin.oran, matrah: tahmin.matrah ?? matrah, kdv }]
      }
      cozulemeyenler.push({ id: fatura.id, tur: fatura.tur, yon: fatura.yon, matrah, kdv, tutar: fatura.tutar })
      return [{ oran: null, matrah, kdv }]
    })()

    for (const satir of satirlar) {
      const oran = satir.oran === null ? null : Number(satir.oran)
      const anahtar = oran === null ? 'bilinmiyor' : String(oran)
      if (!gruplar.has(anahtar)) gruplar.set(anahtar, { oran, matrah: 0, kdv: 0 })
      const grup = gruplar.get(anahtar)
      grup.matrah += kurus(tutar(satir.matrah) ?? 0)
      grup.kdv += kurus(tutar(satir.kdv) ?? 0)
    }
  }

  const satirlar = [...gruplar.values()]
    .sort((ilk, ikinci) => ilk.oran === null ? 1 : ikinci.oran === null ? -1 : ilk.oran - ikinci.oran)
    .map(grup => {
      // Matrah her zaman KDV uzerinden: matrah = KDV / (oran/100).
      // OTV / konaklama vergisi gibi diger vergiler matraha EKLENMEZ.
      const kdv = grup.kdv / 100
      const matrahKdvDen = grup.oran ? kdvDenMatrah(kdv, grup.oran) : null
      return {
        oran: grup.oran,
        matrah: matrahKdvDen !== null ? matrahKdvDen : grup.matrah / 100,
        kdv
      }
    })
  const toplam = satirlar.reduce(
    (t, satir) => ({ matrah: t.matrah + kurus(satir.matrah), kdv: t.kdv + kurus(satir.kdv) }),
    { matrah: 0, kdv: 0 }
  )
  return {
    satirlar,
    toplam: {
      matrah: toplam.matrah / 100,
      kdv: toplam.kdv / 100,
      // Genel toplam = matrah + KDV
      genel: (toplam.matrah + toplam.kdv) / 100
    },
    eksikTutar,
    tahminEdilen,
    cozulemeyenler
  }
}

export async function faturaKdvOranDokumu({ clientId, yil, ay }) {
  const baslangic = `${yil}-${String(ay).padStart(2, '0')}-01`
  const bitis = `${ay === 12 ? yil + 1 : yil}-${String(ay === 12 ? 1 : ay + 1).padStart(2, '0')}-01`
  const faturalar = []
  for (let from = 0; ; ) {
    const { data, error } = await supabase.from('efatura_faturalar')
      .select('id, yon, tur, matrah, kdv, tutar')
      .eq('client_id', clientId)
      .in('tur', ['efatura', 'earsiv', 'esmm', 'utts'])
      .gte('tarih', baslangic).lt('tarih', bitis)
      .order('id', { ascending: true }).range(from, from + 499)
    if (error) throw error
    if (!data?.length) break
    faturalar.push(...data.filter(fatura => fatura.yon === 'gelen' || (fatura.yon === 'giden' && fatura.tur !== 'utts')))
    from += data.length
  }

  const detaylar = {}
  for (let offset = 0; offset < faturalar.length; offset += 150) {
    const idler = faturalar.slice(offset, offset + 150).map(fatura => fatura.id)
    for (let from = 0; ; ) {
      const { data, error } = await supabase.from('efatura_kdv_detay')
        .select('fatura_id, oran, matrah, kdv').in('fatura_id', idler)
        .order('fatura_id', { ascending: true }).order('oran', { ascending: true }).range(from, from + 499)
      if (error) throw error
      if (!data?.length) break
      for (const detay of data) (detaylar[detay.fatura_id] ||= []).push(detay)
      from += data.length
    }
  }
  const sonuc = {}
  for (const [anahtar, yon] of [['alinan', 'gelen'], ['kesilen', 'giden']]) {
    const grup = faturaKdvOranlariniGrupla(faturalar.filter(fatura => fatura.yon === yon), detaylar)
    // Teshis: oran detayi olmayan kayitlardan kaci tahminle siniflandi,
    // kaci hicbir adaya (%20/%10/%1) uymadi. Cozulemeyenler konsola yazilir.
    if (grup.cozulemeyenler.length) {
      console.log(`[fatura-kdv-oran] ${yil}-${ay} ${anahtar}: ${grup.cozulemeyenler.length} kayit siniflandirilamadi`, grup.cozulemeyenler)
    }
    console.log(`[fatura-kdv-oran] ${yil}-${ay} ${anahtar}: ${grup.tahminEdilen} kayit matrah/KDV'den tahminle siniflandi`)
    sonuc[anahtar] = grup
  }
  return sonuc
}

// ---------- ÖNCEKİ AYDAN DEVREDEN KDV / ÖDEME ----------
// Seçili dönemin (yil, ay) hesabı:
//   devredenGiris = bir önceki ayın sonundaki devreden KDV
//   indirilebilir = devredenGiris + alinanKDV + kdv109 + kdv110
//   tahsilEdilen  = kesilenKDV
//   odeme         = tahsilEdilen > indirilebilir ? fark : 0
//   devredenCikis = indirilebilir > tahsilEdilen ? fark : 0
export async function kdvHesapOzeti({ clientId, yil, ay }) {
  const { data: oncekiKdv } = await supabase
    .from('kdv_durum_kartlari')
    .select('devreden_sonraki, odeme, yil, ay')
    .eq('client_id', clientId)
    .lt('yil', yil)
    .order('yil', { ascending: false })
    .order('ay', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Aynı yıl içinde bir önceki ayı da dene
  const { data: oncekiAyniYil } = await supabase
    .from('kdv_durum_kartlari')
    .select('devreden_sonraki, odeme, yil, ay')
    .eq('client_id', clientId)
    .eq('yil', yil)
    .lt('ay', ay)
    .order('ay', { ascending: false })
    .limit(1)
    .maybeSingle()

  const devredenGiris = sayi(oncekiAyniYil?.devreden_sonraki || oncekiKdv?.devreden_sonraki || 0)

  const [fk, k109, k110] = await Promise.all([
    faturaKdvToplamlari({ clientId, yil, ay }),
    kdvDokumGetir({ clientId, yil, ay, tur: '109' }),
    kdvDokumGetir({ clientId, yil, ay, tur: '110' })
  ])

  const alinanKdv = sayi(fk.alinan)
  const kesilenKdv = sayi(fk.kesilen)
  const kdv109 = sayi(k109?.toplam_tutar || 0)
  const kdv110 = sayi(k110?.toplam_tutar || 0)

  const indirilebilirToplam = devredenGiris + alinanKdv + kdv109 + kdv110
  let odeme = 0
  let devredenSonraki = 0
  if (kesilenKdv > indirilebilirToplam) {
    odeme = +(kesilenKdv - indirilebilirToplam).toFixed(2)
  } else {
    devredenSonraki = +(indirilebilirToplam - kesilenKdv).toFixed(2)
  }

  return {
    devredenGiris,
    alinanKdv,
    kdv109,
    kdv110,
    indirilebilirToplam,
    kesilenKdv,
    odeme,
    devredenSonraki
  }
}
