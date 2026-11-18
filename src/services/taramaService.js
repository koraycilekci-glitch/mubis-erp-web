// MUBiS — Tarama (Android fiş/Z raporu) servisleri
import { supabase } from '../lib/supabase'
import { faturaFisDetaylariniTamamla, fisKdvDetayUret, kdvDetaylariGetir } from './efaturaService'
import { satisKdvDetaylari, fisDetaylariniDogrula, fisYuvarla } from '../utils/fisDetay'

const BUCKET = 'tarama-belgeler'

// Signed URL: tarama-belgeler/<client_id>/<yil>-<ay>/xxx.jpg
export async function taramaFotoUrl(storagePath) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 60)
  if (error) return null
  return data.signedUrl
}

// Personel: tüm taramalar; müşteri: kendi kayıtları (RLS filtreler)
export async function taramaListesi({ yil, ay, durum } = {}) {
  let q = supabase
    .from('tarama_belgeler')
    .select('id, client_id, donem_yil, donem_ay, belge_tipi, durum, on_okuma, storage_path, created_at, islendi_at, islenen_kayit, clients(name, company, defter_tipi)')
    .order('created_at', { ascending: false })
    .limit(200)
  if (yil) q = q.eq('donem_yil', yil)
  if (ay) q = q.eq('donem_ay', ay)
  if (durum) q = q.eq('durum', durum)
  const { data, error } = await q
  if (error) throw error
  return (data || []).map(t => ({
    ...t,
    musteriAd: t.clients?.name || t.clients?.company || `Müşteri #${t.client_id}`,
    musteriDefterTipi: t.clients?.defter_tipi || '',
  }))
}

export async function taramaDurumGuncelle(id, durum, islenenKayit = null) {
  const yama = { durum, islendi_at: new Date().toISOString() }
  if (islenenKayit) yama.islenen_kayit = islenenKayit
  const { error } = await supabase.from('tarama_belgeler').update(yama).eq('id', id)
  if (error) throw error
}

export async function taramaSil(id, storagePath) {
  if (storagePath) await supabase.storage.from(BUCKET).remove([storagePath])
  const { error } = await supabase.from('tarama_belgeler').delete().eq('id', id)
  if (error) throw error
}

// Bekleyen (yeni) sayısı — admin sidebar rozeti
export async function bekleyenTaramaSayisi() {
  const { count, error } = await supabase
    .from('tarama_belgeler')
    .select('id', { count: 'exact', head: true })
    .eq('durum', 'yeni')
  if (error) return 0
  return count || 0
}

// Fotoğraftaki metni web tarafında OCR etmek için — mevcut Tesseract hattı
// zReportOCRService içinde varsa oradan, yoksa on_okuma.metin kullanılır.
// Z raporu ayrıştırma: zRaporService.zRaporMetindenAyrisat desenleriyle uyumlu
// alanları döndürür.
export function taramadanZRaporAdayi(onOkuma) {
  if (!onOkuma) return null
  return {
    tarih: onOkuma.tarih || null,
    zNo: onOkuma.zNo || null,
    brutSatis: onOkuma.brutSatis || null,
    netSatis: onOkuma.netSatis || null,
    toplamKdv: onOkuma.toplamKdv || null,
    okundu: !!onOkuma.okundu,
  }
}

const bugun = () => new Date().toISOString().split('T')[0]

// Fişler paneli: tarama_belgeler (belge_tipi='fis') + işlendi ise bağlı
// efatura_faturalar kaydı (fatura_uuid = 'tarama-<id>') birleştirilir.
export async function fisListesi({ yil, ay } = {}) {
  let q = supabase
    .from('tarama_belgeler')
    .select('id, client_id, donem_yil, donem_ay, belge_tipi, durum, on_okuma, storage_path, created_at, islendi_at, islenen_kayit, clients(name, company)')
    .eq('belge_tipi', 'fis')
    .order('created_at', { ascending: false })
    .limit(500)
  if (yil) q = q.eq('donem_yil', yil)
  if (ay) q = q.eq('donem_ay', ay)
  const { data, error } = await q
  if (error) throw error
  const taramalar = data || []
  const idler = taramalar.map(t => 'tarama-' + t.id)
  let faturalar = []
  if (idler.length) {
    const { data: f } = await supabase
      .from('efatura_faturalar')
      .select('id, fatura_uuid, tarih, karsi_unvan, karsi_vkn, matrah, kdv, tutar, hesap_kodu, cari_kodu, durum')
      .in('fatura_uuid', idler)
    faturalar = f || []
  }
  const faturaHarita = new Map(faturalar.map(f => [f.fatura_uuid, f]))
  const liste = taramalar.map(t => {
    const fatura = faturaHarita.get('tarama-' + t.id) || null
    const on = t.on_okuma || {}
    return {
      id: t.id,
      clientId: t.client_id,
      musteriAd: t.clients?.name || t.clients?.company || `Müşteri #${t.client_id}`,
      donemYil: t.donem_yil,
      donemAy: t.donem_ay,
      durum: t.durum,
      storagePath: t.storage_path,
      createdAt: t.created_at,
      kaynak: on.kaynak || 'mobil',
      tarih: fatura?.tarih || on.tarih || null,
      satici: fatura?.karsi_unvan || null,
      vkn: fatura?.karsi_vkn || on.vkn || null,
      matrah: fatura?.matrah ?? null,
      kdv: fatura?.kdv ?? on.toplamKdv ?? null,
      kdvOran: on.kdvOran ?? null,
      tur: 'GİDER FİŞİ',
      nakit: on.nakit ?? null,
      kredi: on.kredi ?? null,
      kdvDetaylari: on.kdvDetaylari || (on.kdvOran != null && fatura?.matrah != null && fatura?.kdv != null ? [{ oran: on.kdvOran, matrah: fatura.matrah, kdv: fatura.kdv }] : []),
      toplam: fatura?.tutar ?? on.tutar ?? null,
      kategori: fatura?.hesap_kodu || null,
      cari: fatura?.cari_kodu || null,
      faturaId: fatura?.id || null,
    }
  })

  // Z raporları (telefondan gelen veya panelden yüklenen) Fişler listesine satış kaydı olarak katılır
  let zQ = supabase
    .from('z_reports')
    .select('id, client_id, year, month, report_date, z_no, total_amount, total_kdv, kdv_matrah, cash_amount, credit_card_amount, parsed_data, ocr_status, created_at, clients(name, company, nace_code)')
    .order('created_at', { ascending: false })
    .limit(500)
  if (yil) zQ = zQ.eq('year', yil)
  if (ay) zQ = zQ.eq('month', ay)
  const { data: zraporlar } = await zQ
  for (const z of (zraporlar || [])) {
    liste.push({
      id: 'z' + z.id,
      clientId: z.client_id,
      musteriAd: z.clients?.name || z.clients?.company || `Müşteri #${z.client_id}`,
      donemYil: z.year,
      donemAy: z.month,
      durum: z.ocr_status === 'parsed' ? 'islendi' : 'yeni',
      storagePath: null,
      createdAt: z.created_at,
      kaynak: 'zrapor',
      tur: 'Z RAPORU',
      tarih: z.report_date,
      satici: 'Z Raporu' + (z.z_no ? ` Z:${z.z_no}` : ''),
      vkn: null,
      matrah: z.kdv_matrah,
      kdv: z.total_kdv,
      toplam: z.total_amount,
      nakit: z.cash_amount ?? null,
      kredi: z.credit_card_amount ?? null,
      kdvDetaylari: fisDetaylariniDogrula(satisKdvDetaylari(z.parsed_data), z.kdv_matrah, z.total_kdv, z.total_amount),
      kategori: null,
      cari: null,
      zRaporId: z.id,
      zNo: z.z_no || null,
      naceKodu: z.clients?.nace_code || null,
    })
  }

  // Manuel eklenen fişler (fotoğrafsız)
  let manuelQ = supabase
    .from('efatura_faturalar')
    .select('id, client_id, tarih, karsi_unvan, karsi_vkn, fatura_turu, fatura_uuid, fatura_no, xml_url, matrah, kdv, tutar, nakit_tutar, hesap_kodu, durum, sorgu_ts, clients(name, company, nace_code)')
    .in('fatura_turu', ['Z RAPORU', 'GİDER FİŞİ', 'GİDER DÖKÜMÜ'])
    .not('fatura_uuid', 'like', 'tarama-%')
    .not('fatura_uuid', 'like', 'ztarama-%')
    .not('fatura_uuid', 'like', 'musteri-%')
    .order('sorgu_ts', { ascending: false })
    .limit(300)
  if (yil) {
    manuelQ = manuelQ.gte('tarih', `${yil}-01-01`).lte('tarih', `${yil}-12-31`)
  }
  const { data: manuel, error: manuelHata } = await manuelQ
  if (manuelHata) throw manuelHata
  const donemKayitlari = (manuel || []).filter(kayit => !ay || !kayit.tarih || kayit.tarih.startsWith(`${yil}-${String(ay).padStart(2, '0')}`))
  for (const m of await faturaFisDetaylariniTamamla(donemKayitlari)) {
    liste.push({
      id: 'm' + m.id,
      clientId: m.client_id,
      musteriAd: m.clients?.name || m.clients?.company || `Müşteri #${m.client_id}`,
      donemYil: m.tarih ? Number(m.tarih.slice(0, 4)) : yil,
      donemAy: m.tarih ? Number(m.tarih.slice(5, 7)) : ay || 1,
      durum: m.durum || 'yeni',
      storagePath: null,
      createdAt: m.sorgu_ts,
      kaynak: 'manuel',
      tur: m.fatura_turu || null,
      fisNo: m.fatura_no || null,
      tarih: m.tarih,
      satici: m.karsi_unvan,
      vkn: m.karsi_vkn,
      matrah: m.matrah,
      kdv: m.kdv,
      kdvOran: null,
      toplam: m.tutar,
      nakit: m.nakit ?? m.nakit_tutar ?? null,
      kredi: m.kredi ?? (m.fatura_turu === 'Z RAPORU' && !m.xml_url && m.nakit_tutar != null && m.tutar != null ? fisYuvarla(Number(m.tutar) - Number(m.nakit_tutar)) : null),
      kdvDetaylari: m.kdvDetaylari,
      fisDetayUyari: m.fisDetayUyari,
      naceKodu: m.clients?.nace_code || null,
      kategori: m.hesap_kodu,
      cari: null,
      faturaId: m.id,
    })
  }
  const detayHarita = await kdvDetaylariGetir(liste.map(fis => fis.faturaId).filter(Boolean))
  return liste.map(fis => ({ ...fis, kdvDetaylari: fis.kdvDetaylari?.length ? fis.kdvDetaylari : detayHarita[fis.faturaId] || fisKdvDetayUret({ ...fis, fatura_turu: fis.tur, tutar: fis.toplam }) || [] }))
}

// Panelden fiş/tarama yükleme (dosya seç, sürükle-bırak, tarayıcı klasörü) → tarama-belgeler + satır
export async function fisYukle({ clientId, yil, ay, file, yukleyenId, belgeTipi = 'fis', kaynak = 'web' }) {
  const uzanti = /\.(png)$/i.test(file?.name || '') ? 'png' : /\.(webp)$/i.test(file?.name || '') ? 'webp' : 'jpg'
  const yol = `${clientId}/${yil}-${String(ay).padStart(2, '0')}/web_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${uzanti}`
  const { error: upHata } = await supabase.storage
    .from(BUCKET)
    .upload(yol, file, { contentType: file.type || 'image/jpeg', upsert: false })
  if (upHata) throw upHata
  const { data, error } = await supabase
    .from('tarama_belgeler')
    .insert({
      client_id: clientId,
      yukleyen: yukleyenId || null,
      donem_yil: yil,
      donem_ay: ay,
      belge_tipi: belgeTipi,
      storage_path: yol,
      on_okuma: { kaynak, okundu: false, okumaDurumu: 'yok' },
      durum: 'yeni',
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

// Manuel eklenen fişler: efatura_faturalar'da fatura_uuid 'manuel-<id>'
// fisListesi bunları da listeye katar (kaynak: 'manuel').
// tip 'z' → Z RAPORU (satış), tip 'fis' → GİDER FİŞİ. satis verildiyse KDV dahil
// tutarlardan matrah/kdv oran bazında otomatik hesaplanır.
export async function fisManuelEkle({ clientId, tarih, satici, vkn, matrah, kdv, toplam, kategori, tip, evrakNo, aciklama, satis, nakit, kdvOran }) {
  const n = (x) => { const v = Number(x); return isFinite(v) ? v : 0 }
  let m = matrah ?? null, k = kdv ?? null, t = toplam ?? null
  if (!satis && t != null && kdvOran != null) {
    m = t / (1 + n(kdvOran) / 100)
    k = t - m
  }
  const detaylar = satis ? satisKdvDetaylari(satis) : []
  if (satis) {
    m = fisYuvarla(detaylar.reduce((sum, detay) => sum + detay.matrah, 0))
    k = fisYuvarla(detaylar.reduce((sum, detay) => sum + detay.kdv, 0))
    t = fisYuvarla(m + k)
  } else if (kdvOran != null && m != null && k != null) {
    detaylar.push({ oran: Number(kdvOran), matrah: fisYuvarla(m), kdv: fisYuvarla(k) })
  }
  const yuvarla = (x) => x == null ? null : fisYuvarla(x)
  const zMi = tip === 'z'
  const { data, error } = await supabase
    .from('efatura_faturalar')
    .insert({
      client_id: clientId,
      yon: zMi ? 'giden' : 'gelen',
      tur: 'efatura',
      fatura_turu: zMi ? 'Z RAPORU' : 'GİDER FİŞİ',
      fatura_uuid: 'manuel-' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      fatura_no: evrakNo || (zMi ? 'ZR-M' : 'FİŞ-M'),
      tarih: tarih || bugun(),
      karsi_unvan: aciklama || satici || null,
      karsi_vkn: vkn || null,
      matrah: yuvarla(m),
      kdv: yuvarla(k),
      tutar: yuvarla(t),
      nakit_tutar: nakit != null ? yuvarla(n(nakit)) : null,
      para_birimi: 'TRY',
      hesap_kodu: kategori || null,
      durum: 'yeni',
      sorgu_ts: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error) throw error
  if (detaylar.length) {
    const { error: detayHata } = await supabase.from('efatura_kdv_detay').insert(detaylar.map(detay => ({ ...detay, fatura_id: data.id })))
    if (detayHata) {
      const { error: geriAlHata } = await supabase.from('efatura_faturalar').delete().eq('id', data.id)
      throw new Error(`KDV ayrıntısı kaydedilemedi: ${detayHata.message}${geriAlHata ? ' Belge kaydı oluştu; yeniden eklemeden önce kontrol edin.' : ''}`)
    }
  }
  return data.id
}

// Müşteri portalı — elle girilen Z raporu / gider fişi: admin onayına düşer
// (tarama_belgeler'e 'yeni' olarak yazılır; admin onaylayınca fatura olur)
export async function musteriManuelFisEkle({ clientId, tip, satirlar }) {
  const n = (x) => { const v = Number(String(x ?? '').replace(',', '.')); return isFinite(v) ? v : 0 }
  const dolu = (satirlar || []).filter(s => {
    if (tip === 'z') return n(s.s0) + n(s.s1) + n(s.s10) + n(s.s20) > 0
    return n(s.toplam) > 0
  })
  if (!dolu.length) throw new Error('En az bir satıra tutar girin.')
  const kayitlar = dolu.map(s => {
    const tarih = guvenliTarih(s.tarih)
    const on = { kaynak: 'musteri-manuel', okundu: true, tarih }
    if (tip === 'z') {
      on.evrakNo = s.evrakNo || null
      on.aciklama = s.aciklama || 'Z RAPORU'
      on.satis = { s0: n(s.s0), s1: n(s.s1), s10: n(s.s10), s20: n(s.s20) }
      on.nakit = n(s.nakit)
    } else {
      on.fisNo = s.faturaNo || null
      on.unvan = s.unvan || null
      on.kdvOran = n(s.kdvOran) || null
      on.toplam = n(s.toplam)
    }
    return {
      client_id: clientId,
      yukleyen: null,
      donem_yil: Number(tarih.slice(0, 4)),
      donem_ay: Number(tarih.slice(5, 7)),
      belge_tipi: tip === 'z' ? 'z' : 'fis',
      storage_path: null,
      on_okuma: on,
      durum: 'yeni',
    }
  })
  const { error } = await supabase.from('tarama_belgeler').insert(kayitlar)
  if (error) throw error
  return kayitlar.length
}

// Mükerrer kontrol: aynı VKN + tarih + toplam
export function mukerrerBul(fisler) {
  const gorulen = new Set()
  const mukerrerIdler = new Set()
  for (const f of fisler) {
    const anahtar = [f.vkn, f.tarih, f.toplam].map(x => x == null ? '' : String(x)).join('|')
    if (!f.vkn || !f.toplam) continue
    if (gorulen.has(anahtar)) mukerrerIdler.add(f.id)
    gorulen.add(anahtar)
  }
  return mukerrerIdler
}

// "25.09.2026" / "25/09/2026" -> "2026-09-25"
const tarihIso = (t) => {
  if (!t) return null
  const m = String(t).trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/)
  if (!m) return null
  const yil = m[3].length === 2 ? '20' + m[3] : m[3]
  return `${yil}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`
}
// ISO tarih doğrulaması: yyyy-aa-gg biçimli ve mantıklı (2000-2100, ay 1-12, gün 1-31) değilse null
const isoGecerli = (t) => {
  if (!t) return null
  const m = String(t).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return null
  const y = Number(m[1]), a = Number(m[2]), g = Number(m[3])
  if (y < 2000 || y > 2100 || a < 1 || a > 12 || g < 1 || g > 31) return null
  return `${m[1]}-${String(a).padStart(2, '0')}-${String(g).padStart(2, '0')}`
}
// OCR tarihini güvenli ISO'ya çevir: OCR hatalı/okunamayan tarih (örn. "0663-21-00") → bugün
const guvenliTarih = (t) => isoGecerli(t) || tarihIso(t) || bugun()

// Taramayı işle:
//  - Z raporu: fotoğraf client-z-reports'a kopyalanır, Tesseract OCR + parse +
//    z_reports kaydı + muhasebe fişleri (mevcut Z Raporu hattı).
//  - Fiş: efatura_faturalar'a gider fişi kaydı.
export async function taramaIsle(t) {
  // Müşteri portalından elle girilen kayıt: fotoğraf/OCR yok — veriler on_okuma'dan
  // efatura_faturalar'a yazılır (admin "Onayla" düğmesi kaydı faturalara geçirir).
  if ((t.on_okuma || {}).kaynak === 'musteri-manuel') {
    const on = t.on_okuma
    const n = (x) => { const v = Number(String(x ?? '').replace(',', '.')); return isFinite(v) ? v : 0 }
    const yuvarla = (x) => (x ? Math.round(x * 100) / 100 : null)
    let m = null, k = null, tt = null, yon, tur, fno, unvan
    if (t.belge_tipi === 'z') {
      const s0 = n(on.satis?.s0), s1 = n(on.satis?.s1), s10 = n(on.satis?.s10), s20 = n(on.satis?.s20)
      const m1 = s1 / 1.01, m10 = s10 / 1.10, m20 = s20 / 1.20
      m = s0 + m1 + m10 + m20
      k = (s1 - m1) + (s10 - m10) + (s20 - m20)
      tt = s0 + s1 + s10 + s20
      yon = 'giden'; tur = 'Z RAPORU'
      fno = on.evrakNo || 'ZM-' + String(t.id).padStart(5, '0')
      unvan = on.aciklama || 'Z RAPORU'
    } else {
      tt = n(on.toplam)
      const oran = n(on.kdvOran)
      m = tt / (1 + oran / 100)
      k = tt - m
      yon = 'gelen'; tur = 'GİDER FİŞİ'
      fno = on.fisNo || 'FM-' + String(t.id).padStart(5, '0')
      unvan = on.unvan || 'Gider Fişi'
    }
    const tarih = on.tarih || bugun()
    const { data: kayit, error } = await supabase
      .from('efatura_faturalar')
      .insert({
        client_id: t.client_id, yon, tur,
        fatura_turu: tur,
        fatura_uuid: 'musteri-' + t.id,
        fatura_no: fno,
        tarih,
        karsi_unvan: unvan,
        matrah: yuvarla(m), kdv: yuvarla(k), tutar: yuvarla(tt),
        nakit_tutar: t.belge_tipi === 'z' && n(on.nakit) > 0 ? yuvarla(n(on.nakit)) : null,
        para_birimi: 'TRY', durum: 'yeni', sorgu_ts: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (error) throw error
    await taramaDurumGuncelle(t.id, 'islendi', 'efatura_faturalar:' + kayit.id)
    return { hedef: 'efatura_faturalar', kayitId: kayit.id }
  }

  // 1) Fotoğrafı tarama-belgeler'den client-z-reports'a kopyala
  const { data: blobData, error: dlHata } = await supabase.storage.from(BUCKET).download(t.storage_path)
  if (dlHata) throw dlHata
  const hedefYol = `${t.client_id}/${t.donem_yil}/${String(t.donem_ay).padStart(2, '0')}/tarama_${t.id}_${Date.now()}.jpg`
  const { error: upHata } = await supabase.storage
    .from('client-z-reports')
    .upload(hedefYol, blobData, { contentType: 'image/jpeg', upsert: false })
  if (upHata) throw upHata
  const { data: pub } = supabase.storage.from('client-z-reports').getPublicUrl(hedefYol)

  if (t.belge_tipi === 'z') {
    const { processZReportImage, convertToAccountingEntry } = await import('./zReportOCRService')
    const { saveZReport, updateZReportParsedData, createAccountingEntries } = await import('./zReportService')
    const ocr = await processZReportImage(pub.publicUrl)
    const parsed = ocr.parsed || {}
    // OCR parser alanları (evrakNo/satis0..20/kdv1..20) z_reports kolon
    // adlarına (z_no/total_amount/...) çevrilir — aksi halde hepsi NULL yazar.
    const yuvarla = (x) => (x ? Math.round(x * 100) / 100 : null)
    const s0 = Number(parsed.satis0) || 0, s1 = Number(parsed.satis1) || 0
    const s10 = Number(parsed.satis10) || 0, s20 = Number(parsed.satis20) || 0
    const nakit = Number(parsed.nakit) || 0, kredi = Number(parsed.krediKarti) || 0
    const matrahOkunan = (Number(parsed.matrah1) || 0) + (Number(parsed.matrah10) || 0) + (Number(parsed.matrah20) || 0)
    const kdvOkunan = (Number(parsed.kdv1) || 0) + (Number(parsed.kdv10) || 0) + (Number(parsed.kdv20) || 0)
    const toplamSatir = Number(parsed.toplamSatis) || 0
    let toplamDahil = s0 + s1 + s10 + s20
    // SATIŞ satırı bozuk okunduysa (TOPLAM ile uyuşmuyor ama MATRAH+KDV
    // TOPLAM'a eşit) güvenilir TOPLAM değerini kullan
    if (toplamSatir > 0 && Math.abs(toplamDahil - toplamSatir) > 0.05) {
      const matrahKdvUyum = matrahOkunan > 0 && Math.abs(matrahOkunan + kdvOkunan - toplamSatir) < 0.05
      if (matrahKdvUyum || toplamDahil === 0) toplamDahil = toplamSatir
    }
    if (!toplamDahil) toplamDahil = toplamSatir || (nakit + kredi) || null
    // Tek oranlı fiş denetimi: yalnızca bir KDV oranının satışı varsa ve bu
    // satış toplama eşitse KDV matematiksel olarak oranadan hesaplanır.
    // "%10" ibaresi KDV tutarına karışarak 457→1457 gibi okuma hatalarını önler.
    let kdvFinal = kdvOkunan, matrahFinal = matrahOkunan
    if (toplamDahil > 0) {
      const digerOranlar = (Number(parsed.satis0) || 0) > 0 || s1 > 0 || s10 > 0
      let oranTespit = null
      if (s20 > 0 && Math.abs(s20 - toplamDahil) <= 0.05) oranTespit = 20
      else if (s10 > 0 && Math.abs(s10 - toplamDahil) <= 0.05) oranTespit = 10
      else if (s1 > 0 && Math.abs(s1 - toplamDahil) <= 0.05) oranTespit = 1
      if (oranTespit && !digerOranlar) {
        const kdvHesaplanan = Math.round((toplamDahil - toplamDahil / (1 + oranTespit / 100)) * 100) / 100
        if (Math.abs(kdvOkunan - kdvHesaplanan) > 0.05) {
          kdvFinal = kdvHesaplanan
          matrahFinal = Math.round((toplamDahil - kdvHesaplanan) * 100) / 100
        }
      }
    }
    // Web OCR hiç tutar bulamadıysa telefondaki ön-okumayı (ML Kit) yedek al
    const on = t.on_okuma || {}
    const onTutar = Number(on.tutar) > 0 ? Number(on.tutar) : null
    const mobilYedek = !toplamDahil && onTutar
    if (mobilYedek) toplamDahil = onTutar
    const matrahHesap = s0 + s1 / 1.01 + s10 / 1.10 + s20 / 1.20
    const zVeri = {
      zNo: parsed.evrakNo || (mobilYedek ? (on.zNo || null) : null),
      date: parsed.tarih || (mobilYedek ? (on.tarih || null) : null),
      totalAmount: toplamDahil != null ? yuvarla(toplamDahil) : null,
      // Mobil yedekte KDV/matrah güvenilir değil — boş bırak, elle düzeltilebilir
      totalKdv: toplamDahil == null ? null : mobilYedek ? null : yuvarla(kdvFinal || (toplamDahil - (matrahFinal || matrahHesap))),
      kdvMatrah: toplamDahil == null ? null : mobilYedek ? null : yuvarla(matrahFinal || (toplamDahil - (kdvFinal || toplamDahil - matrahHesap))),
      cashAmount: nakit || (mobilYedek ? Number(on.nakit) || 0 : 0),
      creditCardAmount: kredi,
      otherAmount: Number(parsed.havale) || 0,
    }
    const rapor = await saveZReport(t.client_id, t.donem_yil, t.donem_ay, guvenliTarih(zVeri.date), pub.publicUrl, `tarama_${t.id}.jpg`)
    await updateZReportParsedData(rapor.id, { rawText: ocr.rawText || '', ...parsed, ...zVeri })
    // Fatura Sorgulama listelerine de düşsün: Z raporu = kesilen (giden) kayıt
    try {
      await supabase.from('efatura_faturalar').insert({
        client_id: t.client_id, yon: 'giden', tur: 'efatura', fatura_turu: 'Z RAPORU',
        fatura_uuid: 'ztarama-' + t.id,
        fatura_no: zVeri.zNo ? 'Z-' + zVeri.zNo : 'ZT-' + String(t.id).padStart(5, '0'),
        tarih: guvenliTarih(zVeri.date), karsi_unvan: 'Z RAPORU',
        matrah: zVeri.kdvMatrah, kdv: zVeri.totalKdv, tutar: zVeri.totalAmount,
        para_birimi: 'TRY', durum: 'yeni', sorgu_ts: new Date().toISOString(),
      })
    } catch { /* liste kaydi opsiyonel */ }
    try {
      if (toplamDahil > 0) {
        const clientType = t.musteriDefterTipi === 'Bilanço' ? 'company' : 'isletme'
        const entries = convertToAccountingEntry(clientType, parsed)
        if (entries && entries.length) await createAccountingEntries(t.client_id, rapor.id, entries)
      }
    } catch { /* muhasebe kaydi opsiyonel */ }
    await taramaDurumGuncelle(t.id, 'islendi', 'z_reports:' + rapor.id)
    return { hedef: 'z_reports', kayitId: rapor.id }
  }

  // Fiş: OCR → efatura_faturalar gider kaydı → hesaplara ayrım (gider + 191 KDV + 320 cari)
  const on = t.on_okuma || {}
  const { processZReportImage } = await import('./zReportOCRService')
  const { parseZReportText } = await import('./zReportService')
  const {
    hesapPlaniGetir, kurallariGetir, hesapOner, faturaHesapKodu,
    kdvHesapKodu, ensureCariHesabi, faturaHesapKaydet,
  } = await import('./muhasebeService')

  let ocrMetin = ''
  let zt = null
  try {
    const ocr = await processZReportImage(pub.publicUrl)
    ocrMetin = ocr.rawText || ''
    zt = parseZReportText(ocrMetin)
  } catch { /* OCR basarisizsa on_okuma degerleriyle devam */ }

  const tutar = (zt && zt.totalAmount) || on.tutar || null
  const kdv = (zt && zt.totalKdv) || on.toplamKdv || 0
  const matrah = (zt && zt.kdvMatrah) || (tutar != null && kdv != null ? tutar - kdv : null)
  const tarihIso_ = guvenliTarih((zt && zt.date) || on.tarih)

  // OCR metninden satıcı ünvanı: rakamsız, en uzun ilk satır
  let unvan = null
  for (const satir of (ocrMetin || on.metin || '').split('\n').map(s => s.trim())) {
    const harfler = satir.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü ]/g, '')
    if (harfler.trim().length >= 4 && !/\d/.test(satir) && !/F[İI]S|TAR[İI]H|Fatura| MAL[İI]|F[İI]Ş/i.test(satir)) {
      unvan = satir
      break
    }
  }

  const fatura = {
    client_id: t.client_id,
    yon: 'gelen',
    tur: 'efatura',
    fatura_turu: 'GİDER FİŞİ',
    fatura_uuid: 'tarama-' + t.id,
    fatura_no: 'FİŞ-' + String(t.id).padStart(5, '0'),
    tarih: tarihIso_,
    karsi_vkn: on.vkn || null,
    karsi_unvan: unvan,
    matrah,
    kdv,
    tutar,
    para_birimi: 'TRY',
    durum: 'yeni',
    sorgu_ts: new Date().toISOString(),
  }
  const { data: kayit, error } = await supabase
    .from('efatura_faturalar')
    .insert(fatura)
    .select('id')
    .single()
  if (error) throw error

  // Hesaplara ayırma: kurallar → gider hesabı → KDV oran kodu → 320 cari
  const ayrim = { giderHesabi: null, kdvHesabi: null, cariHesabi: null, cariYeni: false }
  try {
    const [plan, kurallar] = await Promise.all([hesapPlaniGetir(t.client_id), kurallariGetir(t.client_id)])
    const oneri = hesapOner({ ...fatura, onceki_hesap: null }, plan, kurallar)
    const giderSonuc = faturaHesapKodu(oneri.kod, plan, fatura)
    const kdvKod = kdvHesapKodu(fatura, plan)
    const cari = await ensureCariHesabi(t.client_id, fatura, plan)
    ayrim.giderHesabi = giderSonuc.kod
    ayrim.kdvHesabi = kdv > 0 ? kdvKod : null
    ayrim.cariHesabi = cari.kod
    ayrim.cariYeni = !!cari.yeni
    await faturaHesapKaydet(kayit.id, ayrim.giderHesabi, ayrim.cariHesabi)

    // Muhasebe fişi satırları: (gider borç) + (191 borç) / 320 alacak
    const satirlar = []
    if (matrah > 0) satirlar.push({
      client_id: t.client_id, z_report_id: null, entry_date: tarihIso_,
      description: `Tarama fişi ${fatura.fatura_no} — ${unvan || on.vkn || ''} (gider)`,
      debit_account: ayrim.giderHesabi, credit_account: ayrim.cariHesabi, amount: matrah,
      source_type: 'tarama', status: 'draft',
    })
    if (kdv > 0 && ayrim.kdvHesabi) satirlar.push({
      client_id: t.client_id, z_report_id: null, entry_date: tarihIso_,
      description: `Tarama fişi ${fatura.fatura_no} — KDV`,
      debit_account: ayrim.kdvHesabi, credit_account: ayrim.cariHesabi, amount: kdv,
      source_type: 'tarama', status: 'draft',
    })
    if (satirlar.length) await supabase.from('accounting_entries').insert(satirlar)
  } catch { /* hesap plani yoksa kayit yine gider fisi olarak durur */ }

  await taramaDurumGuncelle(t.id, 'islendi', 'efatura_faturalar:' + kayit.id)
  return { hedef: 'efatura_faturalar', kayitId: kayit.id, ayrim }
}
