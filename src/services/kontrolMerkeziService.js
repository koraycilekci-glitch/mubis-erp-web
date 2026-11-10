import { supabase } from '../lib/supabase'

// 2.7.542: Kontrol Merkezi — lisansli Masaustu Otomasyon'daki "Kontrol Merkezi"
// bolumunun MUBiS uyarlamasi. Secili donemde tum musteri/firma satirlarini
// DB'deki (efatura_faturalar) kayitli belgelerden ozetler:
//   satis/alis matrah + KDV, odenecek/devreden KDV, PDF sayisi,
//   KDV tutarlilik kontrolu (matrah+kdv = tutar), e-Arsiv alis durumu.

const TOLERANS = 1.0 // 1 TL'ye kadarki yuvarlama farki sorun sayilmaz

function n(v) {
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

export async function kontrolMerkeziOzeti({ yil, ay } = {}) {
  // 1) Tum aktif musteriler (alfabetik, tam unvan oncelikli)
  const { data: musteriler, error: mHata } = await supabase
    .from('clients')
    .select('id, name, company, vkn, tc')
    .order('name', { ascending: true })
  if (mHata) throw mHata

  // 2) Donemin tum fatura kayitlari (tek istekte, musteriden bagimsiz)
  let q = supabase
    .from('efatura_faturalar')
    .select('client_id,yon,tur,fatura_no,tarih,matrah,kdv,tutar,pdf_url,xml_url,html_url,hesap_kodu')
  if (yil) q = q.gte('tarih', `${yil}-01-01`).lte('tarih', `${yil}-12-31`)
  if (ay) {
    const son = new Date(yil, ay, 0).getDate()
    const ayStr = String(ay).padStart(2, '0')
    q = q.gte('tarih', `${yil}-${ayStr}-01`).lte('tarih', `${yil}-${ayStr}-${son}`)
  }
  const { data: faturalar, error: fHata } = await q
  if (fHata) throw fHata

  const gruplar = new Map()
  for (const f of faturalar || []) {
    const g = gruplar.get(f.client_id) || []
    g.push(f)
    gruplar.set(f.client_id, g)
  }

  const rows = (musteriler || []).map(m => {
    const liste = gruplar.get(m.id) || []
    const sat = liste.filter(f => f.yon === 'satis' || f.yon === 'giden')
    const ali = liste.filter(f => f.yon === 'alis' || f.yon === 'gelen')

    const toplam = (arr, alan) => arr.reduce((t, f) => t + (n(f[alan]) || 0), 0)
    // okunamayan tutar var mi (lisansli programdaki "fatura okumasi tamamlanmamis")
    const okunmayan = arr => arr.filter(f => n(f.tutar) == null || n(f.matrah) == null || n(f.kdv) == null).length

    const satisMatrah = toplam(sat, 'matrah'), satisKdv = toplam(sat, 'kdv'), satisToplam = toplam(sat, 'tutar')
    const alisMatrah = toplam(ali, 'matrah'), alisKdv = toplam(ali, 'kdv'), alisToplam = toplam(ali, 'tutar')

    // KDV tutarlilik kontrolu: her belgede matrah + kdv ~= tutar
    const farklilar = liste.filter(f => {
      const a = n(f.matrah), b = n(f.kdv), t = n(f.tutar)
      if (a == null || b == null || t == null) return false
      return Math.abs(a + b - t) > TOLERANS
    }).length
    const veriEksik = okunmayan(sat) + okunmayan(ali)

    let kdvKontrol
    if (farklilar > 0) kdvKontrol = { durum: 'fark', metin: `Fark var (${farklilar} belge)` }
    else if (veriEksik > 0) kdvKontrol = { durum: 'eksik', metin: `Eksik / bekliyor (${veriEksik})` }
    else if (liste.length === 0) kdvKontrol = { durum: 'bos', metin: 'Kayıt yok' }
    else kdvKontrol = { durum: 'tamam', metin: 'Tamamlandı' }

    // e-Arsiv alis: pdf'siz kalan belgeler
    const earsivAlis = ali.filter(f => f.tur === 'earsiv')
    const earsivAlisPdf = earsivAlis.filter(f => f.pdf_url).length
    let earsivDurum
    if (earsivAlis.length === 0) earsivDurum = { durum: 'bos', metin: 'E-Arşiv alış kaydı yok' }
    else if (earsivAlisPdf < earsivAlis.length) earsivDurum = { durum: 'eksik', metin: `E-Arşiv alış listesi okunmadı (${earsivAlisPdf}/${earsivAlis.length})` }
    else earsivDurum = { durum: 'tamam', metin: `Eşleşme tamam (${earsivAlis.length})` }

    // Muhasebelesme ilerlemesi: hesap kodu atanan belgeler
    const atanan = liste.filter(f => f.hesap_kodu).length

    return {
      id: m.id,
      ad: (m.company || m.name || '').trim(),
      vkn: m.vkn || m.tc || '',
      belgeSayisi: liste.length,
      satisMatrah, satisKdv, satisToplam, satisSayi: sat.length, satisOkunmayan: okunmayan(sat),
      alisMatrah, alisKdv, alisToplam, alisSayi: ali.length, alisOkunmayan: okunmayan(ali),
      pdfSayi: liste.filter(f => f.pdf_url).length,
      atanan,
      kdvKontrol,
      earsivDurum,
      liste,
    }
  })

  // Toplam satiri icin ozet
  const ozet = {
    satisMatrah: rows.reduce((t, r) => t + r.satisMatrah, 0),
    satisKdv: rows.reduce((t, r) => t + r.satisKdv, 0),
    alisMatrah: rows.reduce((t, r) => t + r.alisMatrah, 0),
    alisKdv: rows.reduce((t, r) => t + r.alisKdv, 0),
    belge: rows.reduce((t, r) => t + r.belgeSayisi, 0),
  }
  return { rows, ozet }
}

// Alis/Satis Excel: lisansli programdaki "Alis/Satis Fatura Listesi" formatinda
// (baslik satirlari + KDV oran kolonlari bazinda döküm) uretilir.
export async function faturaListesiExcel(clientId, clientAd, { yil, ay, yon }) {
  const XLSX = await import('xlsx')
  const ORANLAR = [1, 8, 10, 18, 20]
  const BILINEN_ORANLAR = [0, 1, 5, 8, 10, 18, 20]
  let q = supabase
    .from('efatura_faturalar')
    .select('fatura_no,tarih,tur,fatura_turu,karsi_vkn,karsi_unvan,matrah,kdv,tutar,para_birimi,tevkifat,durum')
    .eq('client_id', clientId)
  if (yil) q = q.gte('tarih', `${yil}-01-01`).lte('tarih', `${yil}-12-31`)
  if (ay) {
    const son = new Date(yil, ay, 0).getDate()
    const ayStr = String(ay).padStart(2, '0')
    q = q.gte('tarih', `${yil}-${ayStr}-01`).lte('tarih', `${yil}-${ayStr}-${son}`)
  }
  if (yon === 'satis') q = q.in('yon', ['satis', 'giden'])
  else if (yon === 'alis') q = q.in('yon', ['alis', 'gelen'])
  const { data, error } = await q.order('tarih', { ascending: true })
  if (error) throw error
  const trTarih = (t) => {
    if (!t) return ''
    const m = String(t).match(/^(\d{4})-(\d{2})-(\d{2})/)
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(t).slice(0, 10)
  }
  const oranBul = (kdv, matrah) => {
    if (!kdv || !matrah || matrah <= 0) return null
    const ham = (kdv / matrah) * 100
    let enIyi = null
    for (const o of BILINEN_ORANLAR) {
      const fark = Math.abs(ham - o)
      if (fark < 0.6 && (enIyi === null || fark < enIyi.fark)) enIyi = { o, fark }
    }
    return enIyi ? enIyi.o : null
  }
  const satirlar = (data || []).map(f => {
    const oran = oranBul(n(f.kdv), n(f.matrah))
    const satir = {
      'Fatura Tarihi': trTarih(f.tarih),
      'Fatura Numarası': f.fatura_no || '',
      'Fatura Türü': f.fatura_turu || f.tur || '',
      'VKN / TCKN': f.karsi_vkn || '',
      'Açıklama': f.karsi_unvan || '',
      'Tevkifat Oranı': n(f.tevkifat) > 0 ? n(f.tevkifat) : '',
      'Özel Matrah': '',
    }
    for (const o of ORANLAR) satir[`%${o} KDV`] = oran === o ? n(f.kdv) : ''
    for (const o of ORANLAR) satir[`%${o} Matrah`] = oran === o ? n(f.matrah) : ''
    satir['Toplam'] = n(f.tutar) ?? ''
    satir['Toplam Matrah'] = n(f.matrah) ?? ''
    satir['Toplam KDV'] = n(f.kdv) ?? ''
    satir['Okuma Durumu'] = f.durum || ''
    return satir
  })
  const bas = ay ? `01/${String(ay).padStart(2, '0')}/${yil}` : `01/01/${yil}`
  const son = ay ? `${new Date(yil, ay, 0).getDate()}/${String(ay).padStart(2, '0')}/${yil}` : `31/12/${yil}`
  const kolonlar = ['Fatura Tarihi', 'Fatura Numarası', 'Fatura Türü', 'VKN / TCKN', 'Açıklama', 'Tevkifat Oranı', 'Özel Matrah', ...ORANLAR.map(o => `%${o} KDV`), ...ORANLAR.map(o => `%${o} Matrah`), 'Toplam', 'Toplam Matrah', 'Toplam KDV', 'Okuma Durumu']
  const aoa = [
    [`${clientAd || 'Firma'} — ${yon === 'satis' ? 'Satış' : 'Alış'} Faturaları`],
    [`${bas} – ${son} · TL · Kayıtlı belgeler`],
    kolonlar,
    ...satirlar.map(s => kolonlar.map(k => s[k] ?? '')),
  ]
  if (satirlar.length === 0) aoa.push(['Henüz okunmuş fatura yok; boş liste doğrulanmadı.'])
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = kolonlar.map((k, i) => ({ wch: i === 0 ? 13 : i === 1 ? 22 : i === 4 ? 32 : i >= 7 && i <= 16 ? 13 : 15 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'FATURALAR')
  const dosyaAd = `${yon === 'satis' ? 'Satis' : 'Alis'}_Fatura_Listesi_${String(clientId || 0)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.xlsx`
  XLSX.writeFile(wb, dosyaAd)
  return satirlar.length
}
