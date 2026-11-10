// 2.8.4: VPS yardimcisi inen fatura dosyalarini buraya yukler (x-mubis-key).
// Govde: { client_id, yil, ay, tur, yon, dosyaAdi, icerikBase64, meta }
//   - meta: VPS'te @xmldom ile UBL XML'den cikarilan metadata (uuid, faturaNo,
//     tarih, tutar, matrah, kdv, karsiVkn, karsiUnvan, paraBirimi, faturaTuru,
//     kdvParcalari)
// Akis: mukerrer kontrol (uuid+yon+tur dolu kayit) -> Storage upload
// (client-documents, uploadClientFile ile ayni yol formati) -> efatura_faturalar
// upsert (bosluk doldurmalı, dosyalariMubisYukle deseninde).
import { supabaseAdmin, json } from '../_lib'

const BUCKET = 'client-documents'

function anahtarUydu(env, request) {
  const beklenen = env?.MUBIS_SUNUCU_ANAHTARI
  return Boolean(beklenen) && request.headers.get('x-mubis-key') === beklenen
}

function slugify(text) {
  if (!text) return ''
  const map = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'i': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'Ç': 'C', 'Ğ': 'G', 'I': 'I', 'İ': 'I', 'Ö': 'O', 'Ş': 'S', 'Ü': 'U' }
  return String(text).split('').map(c => map[c] || c).join('').toLowerCase().trim()
    .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

const yonNormalizasyon = (y) => {
  const s = String(y || '').toLocaleLowerCase('tr')
  if (/giden|sati[sş]|kesilen|satilan/.test(s)) return 'giden'
  if (/gelen|ali[sş]|alinan/.test(s)) return 'gelen'
  return 'gelen'
}

const uuidAdlandan = (temel) => {
  const m = String(temel || '').match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
  if (m) return m[1].toLowerCase()
  return String(temel || '').slice(-36).replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()
}

const icerikTipi = (ad) => {
  const e = (/\.([a-z0-9]+)$/i.exec(String(ad || '')) || [])[1]?.toLowerCase()
  return ({ html: 'text/html', htm: 'text/html', xml: 'application/xml', pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel' })[e] || 'application/octet-stream'
}

export async function onRequestPost({ env, request }) {
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ error: 'Supabase credentials missing' }, 500)
  if (!anahtarUydu(env, request)) return json({ ok: false, error: 'yetkisiz' }, 401)
  let govde
  try { govde = await request.json() } catch { return json({ ok: false, error: 'gecersiz govde' }, 400) }

  const clientId = Number(govde.client_id)
  const dosyaAdi = String(govde.dosyaAdi || '')
  const ext = (/\.([a-z0-9]+)$/i.exec(dosyaAdi) || [])[1]?.toLowerCase() || 'pdf'
  if (!clientId || !dosyaAdi || !govde.icerikBase64) return json({ ok: false, error: 'eksik-alanlar' }, 400)
  const { data: cl } = await supabase.from('clients').select('id,name,vkn,tc,office_id,beyan_profile').eq('id', clientId).maybeSingle()
  if (!cl) return json({ ok: false, error: 'musteri-yok' }, 404)

  const meta = govde.meta || {}
  const temel = dosyaAdi.replace(/\.(pdf|xml|xlsx|xls|html?)$/i, '')
  const uuid = String(meta.uuid || uuidAdlandan(temel) || temel).replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()
  const faturaYon = yonNormalizasyon(meta.yon || govde.yon)
  const sorguTip = String(govde.tur || 'efatura')
  const tur = ['efatura', 'earsiv', 'esmm', 'utts'].includes(sorguTip) ? sorguTip : 'efatura'
  const yilKlasoru = Number(govde.yil) || new Date().getFullYear()
  const ext2 = ext === 'htm' ? 'html' : ext

  // Mukerrer koruma: ayni uuid+yon+tur icin dolu kayit varsa atlama.
  // 2.8.4a: PDF + XML'i dolu fatura TAM yuklenmis sayilir — HTML dahil
  // hicbir ek dosya yuklenmez (kullanici istegi: daha once yuklenen
  // fatura tekrar yuklenmesin).
  const { data: mevcutKayit } = await supabase.from('efatura_faturalar')
    .select('id,yon,tur,fatura_uuid,fatura_no,tarih,karsi_vkn,karsi_unvan,tutar,matrah,kdv,para_birimi,doviz_kur,pdf_url,xml_url,html_url,fatura_turu')
    .eq('client_id', clientId).eq('yon', faturaYon).eq('tur', tur).eq('fatura_uuid', uuid).maybeSingle()
  const urlKolon = ext2 === 'pdf' ? 'pdf_url' : (ext2 === 'xml' || ext2 === 'xlsx' ? 'xml_url' : 'html_url')
  if (mevcutKayit && mevcutKayit[urlKolon]) {
    return json({ ok: true, atlandi: true, uuid })
  }
  if (mevcutKayit && mevcutKayit.pdf_url && mevcutKayit.xml_url) {
    return json({ ok: true, atlandi: true, uuid, not: 'fatura-tam-yuklu' })
  }

  // Storage upload (uploadClientFile ile ayni yol: <onek><musteriKlasoru>/faturalar/<yil>/)
  const onek = cl.office_id && Number(cl.office_id) !== 1 ? `ofis_${cl.office_id}/` : ''
  const musteriKlasoru = `${cl.vkn || cl.tc || 'bilinmeyen'}_${slugify(cl.name || 'musteri')}`
  const path = `${onek}${musteriKlasoru}/faturalar/${yilKlasoru}/${faturaYon}_${uuid}.${ext2}`
  const bayt = Uint8Array.from(atob(govde.icerikBase64), c => c.charCodeAt(0))
  let url = ''
  try {
    const { error } = await supabase.storage.from(BUCKET).upload(path, bayt, { upsert: true, contentType: icerikTipi(dosyaAdi) })
    if (error) throw error
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
    url = pub?.publicUrl || ''
  } catch (e) {
    return json({ ok: false, error: 'storage: ' + (e?.message || e) }, 500)
  }

  // Satiri birlestir: PDF meta zayiftir, XML'den gelen dolu alanlari EZMESIN
  const o = mevcutKayit || {}
  const pdfMi = ext2 === 'pdf'
  const xmlMi = ext2 === 'xml' || ext2 === 'xlsx'
  const satir = {
    client_id: clientId,
    yon: faturaYon,
    tur,
    fatura_turu: pdfMi ? (meta.faturaTuru || o.fatura_turu || '') : (meta.faturaTuru || o.fatura_turu || ''),
    fatura_uuid: uuid,
    fatura_no: pdfMi ? (o.fatura_no || meta.faturaNo || '') : (meta.faturaNo || o.fatura_no || ''),
    tarih: pdfMi ? (o.tarih || meta.tarih || null) : (meta.tarih || o.tarih || null),
    karsi_vkn: pdfMi ? (o.karsi_vkn || meta.karsiVkn || '') : (meta.karsiVkn || o.karsi_vkn || ''),
    karsi_unvan: pdfMi ? (o.karsi_unvan || meta.karsiUnvan || '') : (meta.karsiUnvan || o.karsi_unvan || ''),
    tutar: pdfMi ? (o.tutar ?? meta.tutar ?? null) : (meta.tutar ?? o.tutar ?? null),
    matrah: pdfMi ? (o.matrah ?? meta.matrah ?? null) : (meta.matrah ?? o.matrah ?? null),
    kdv: pdfMi ? (o.kdv ?? meta.kdv ?? null) : (meta.kdv ?? o.kdv ?? null),
    para_birimi: pdfMi ? (o.para_birimi || meta.paraBirimi || 'TRY') : (meta.paraBirimi || o.para_birimi || 'TRY'),
    doviz_kur: pdfMi ? (o.doviz_kur ?? meta.dovizKur ?? null) : (meta.dovizKur ?? o.doviz_kur ?? null),
    pdf_url: pdfMi ? url : (o.pdf_url || ''),
    xml_url: xmlMi ? url : (o.xml_url || ''),
    html_url: ext2 === 'html' ? url : (o.html_url || ''),
    sorgu_ts: new Date().toISOString()
  }
  const { data: yazilan, error: yazmaHata } = await supabase
    .from('efatura_faturalar')
    .upsert([satir], { onConflict: 'client_id,yon,tur,fatura_uuid' })
    .select('id,fatura_uuid')
    .maybeSingle()
  if (yazmaHata) return json({ ok: false, error: 'db: ' + yazmaHata.message }, 500)

  // Coklu KDV parcalari (yalnizca XML tarafindan)
  if (xmlMi && Array.isArray(meta.kdvParcalari) && meta.kdvParcalari.length && yazilan?.id) {
    try {
      await supabase.from('efatura_kdv_detay').delete().eq('fatura_id', yazilan.id)
      const satirlar = meta.kdvParcalari.filter(p => p && p.kdv != null).map(p => ({
        fatura_id: yazilan.id, oran: p.oran, matrah: p.matrah, kdv: p.kdv
      }))
      if (satirlar.length) await supabase.from('efatura_kdv_detay').insert(satirlar)
    } catch { /* yoksay */ }
  }

  // KDV2 otomatik aktifleşme: tevkifatlı ALINAN (gelen) fatura yüklendiyse
  // fatura ayı için beyan profilinde KDV2'yi aktif et + admin'e tek kez bildir.
  // kdv2AktifEtGerekirse'nin (efaturaService.js) sunucu-yolu karşılığı;
  // zaten aktif aya dokunmaz — bildirim de ay/müşteri başına 1 kez düşer.
  const ftNorm = String(satir.fatura_turu || '').toLocaleUpperCase('tr')
    .replace(/[İIı]/g, 'I').replace(/Ç/g, 'C').replace(/Ğ/g, 'G').replace(/Ö/g, 'O').replace(/Ş/g, 'S').replace(/Ü/g, 'U')
  const tarihStr = String(satir.tarih || '')
  const faturaAyi = tarihStr ? parseInt(tarihStr.substring(5, 7), 10) : NaN
  let kdv2Aktif = []
  if (ftNorm === 'TEVKIFAT' && satir.yon === 'gelen' && faturaAyi >= 1 && faturaAyi <= 12) {
    try {
      const profil = cl.beyan_profile
        ? (typeof cl.beyan_profile === 'string' ? JSON.parse(cl.beyan_profile) : JSON.parse(JSON.stringify(cl.beyan_profile)))
        : {}
      profil.kdv2 = profil.kdv2 || {}
      const ayIdx = faturaAyi - 1
      if (!profil.kdv2[ayIdx]?.active) {
        profil.kdv2[ayIdx] = { period: 'aylik', active: true }
        const { error: profHata } = await supabase.from('clients').update({ beyan_profile: profil }).eq('id', clientId)
        if (!profHata) {
          kdv2Aktif = [ayIdx]
          const AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
          const beyanAyAd = faturaAyi === 12 ? 'Ocak' : AY[faturaAyi]
          const beyanYil = faturaAyi === 12 ? yilKlasoru + 1 : yilKlasoru
          await supabase.from('notifications').insert({
            client_id: clientId,
            audience: 'admin',
            type: 'kdv2',
            title: 'KDV2 Beyanı Vermesi Gereken Müşteri',
            message: `${cl.name || 'Müşteri'} müşterisinin ${AY[ayIdx]} ${yilKlasoru} dönemine ait tevkifatlı alış faturası sorgulandı. ${beyanAyAd} ${beyanYil} ayında KDV2 beyanı verilecek — beyan profilinde KDV2 otomatik aktif edildi.`,
            route: '/admin/aylik-beyan-takip'
          })
        }
      }
    } catch { /* yoksay */ }
  }

  return json({ ok: true, atlandi: false, uuid, id: yazilan?.id || null, kdv2Aktif })
}
