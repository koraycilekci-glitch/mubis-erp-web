import { supabase } from '../lib/supabase'
import { requireMoneyInput, parseMoneyInput } from '../utils/numberFormat'
import { getMyOfficeId } from './officeService'
import { getSettings } from './settingsService'

export async function getActivePaymentProvider() {
  try {
    const settings = await getSettings()
    let enabled = ['paytr']
    try {
      const parsed = typeof settings.payment_providers_enabled === 'string'
        ? JSON.parse(settings.payment_providers_enabled)
        : settings.payment_providers_enabled
      if (Array.isArray(parsed)) enabled = parsed
    } catch { /* varsayilan */ }
    if (enabled.length === 0) return 'eft'
    const provider = settings.payment_provider || enabled[0]
    if (provider === 'eft') return 'eft'
    if (enabled.includes(provider)) return provider
    return enabled[0]
  } catch (err) {
    console.error('Odeme saglayicisi okuma hatasi:', err)
    return 'paytr'
  }
}

export const normalizePaymentData = (paymentData = {}) => ({
  ...paymentData,
  tutar: requireMoneyInput(paymentData.tutar),
})


export const preparePaymentForDatabase = normalizePaymentData

// ============ MUHASEBE UCRETLERI ============

export async function getAccountingFee(clientId) {
  const { data, error } = await supabase
    .from('accounting_fees')
    .select('*')
    .eq('client_id', clientId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data || null
}

export async function saveAccountingFee(clientId, feeData) {
  const { data, error } = await supabase
    .from('accounting_fees')
    .upsert({
      client_id: clientId,
      // Turkce formatli girisleri ("12.500,00") numeric'e cevir
      onceki_donem_borc: parseMoneyInput(feeData.onceki_donem_borc) || 0,
      defter_tasdik_ucreti: parseMoneyInput(feeData.defter_tasdik_ucreti) || 0,
      aylik_ucret: parseMoneyInput(feeData.aylik_ucret) || 0,
      baslangic_ay: feeData.baslangic_ay || 1,
      baslangic_yil: feeData.baslangic_yil || 2025,
      notlar: feeData.notlar || '',
      updated_at: new Date().toISOString()
    }, { onConflict: 'client_id' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getAllAccountingFees() {
  const { data, error } = await supabase
    .from('accounting_fees')
    .select('*')
  if (error) throw error
  return data || []
}

// ============ ODEMELER ============

export async function getPayments(clientId, opts = {}) {
  let query = supabase
    .from('payments')
    .select('*')
    .eq('client_id', clientId)
    .order('odeme_tarihi', { ascending: false })
  if (opts.durum) query = query.eq('durum', opts.durum)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function approvePayment(paymentId, makbuzUrl = '') {
  const { data, error } = await supabase
    .from('payments')
    .update({ durum: 'onaylandi', makbuz_url: makbuzUrl || null, red_sebebi: null })
    .eq('id', paymentId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function rejectPayment(paymentId, reason = '') {
  const { data, error } = await supabase
    .from('payments')
    .update({ durum: 'reddedildi', red_sebebi: reason || null })
    .eq('id', paymentId)
    .select()
    .single()
  if (error) throw error
  return data
}

// Online odemeyi secilen borc kalemine isle (durum -> 'uygulandi')
export async function applyPaymentToDebt(paymentId, borcKalemi = '') {
  const { data, error } = await supabase
    .from('payments')
    .update({ durum: 'uygulandi', donem: borcKalemi || '', red_sebebi: null })
    .eq('id', paymentId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getAllPayments() {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .order('odeme_tarihi', { ascending: false })
  if (error) throw error
  return data || []
}

export async function addPayment(paymentData) {
  const normalized = normalizePaymentData(paymentData)
  const { data, error } = await supabase
    .from('payments')
    .insert({
      client_id: normalized.client_id,
      tutar: normalized.tutar,
      odeme_tipi: normalized.odeme_tipi || 'eft',
      odeme_kanali: normalized.odeme_kanali || 'manuel',
      durum: normalized.durum || 'onaylandi',
      aciklama: normalized.aciklama || '',
      donem: normalized.donem || '',
      gateway_ref: normalized.gateway_ref || '',
      odeme_tarihi: normalized.odeme_tarihi || new Date().toISOString().split('T')[0]
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deletePayment(id) {
  const { error } = await supabase.from('payments').delete().eq('id', id)
  if (error) throw error
}

// Odemenin borc kalemini (donem) satirdan duzelt — yanlis kayitlar icin
export async function updatePayment(id, updates = {}) {
  const { data, error } = await supabase.from('payments').update(updates).eq('id', id).select()
  if (error) throw error
  return data && data[0]
}

// ============ BORC HESAPLAMA ============

// Donem girisini tekil kanonik bicime cevirir: "2026/12", "12/2026", "2026 12",
// "2026.12" -> "2026-12". Birebir eslesmeyen eski kayitlarin da borctan dusmesi icin.
export function normalizeDonem(d) {
  const s = String(d || '').trim()
  if (!s) return s
  // Turkce/ASCII donem adlari -> kanonik borc kalemleri
  if (/önceki|onceki/i.test(s)) return 'Onceki Donem'
  if (/defter|ta%C5%9F|ta%C5%9F|tasdik/i.test(s)) return 'Defter Tasdik'
  let m = s.match(/^(\d{4})[\s\/.\-](\d{1,2})$/)
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[\s\/.\-](\d{4})$/)
  if (m) return `${m[2]}-${String(m[1]).padStart(2, '0')}`
  return s
}

export function hesaplaBorcOzeti(fee, payments, referansTarih = new Date()) {
  const bos = { oncekiDonem: 0, defterTasdik: 0, aylikUcret: 0, gecenAy: 0, aylikToplam: 0, toplamBorc: 0, toplamOdeme: 0, kalanBorc: 0, alindiOdeme: 0, bekleyenOdeme: 0, reddedilenOdeme: 0, sonOdeme: null, odenenAylar: [], odenmeyenAylar: [] }
  if (!fee) return bos

  const oncekiDonem = Number(fee.onceki_donem_borc) || 0
  const defterTasdik = Number(fee.defter_tasdik_ucreti) || 0
  const aylikUcret = Number(fee.aylik_ucret) || 0

  const refYil = referansTarih.getFullYear()
  const refAy = referansTarih.getMonth() + 1
  const basYil = Number(fee.baslangic_yil) || refYil
  const basAy = Number(fee.baslangic_ay) || 1

  if (refYil < basYil) return { ...bos, oncekiDonem, defterTasdik, aylikUcret }

  // Tahsil edilen odemeler (red edilmisler haric)
  const toplandi = (p) => p.durum !== 'reddedildi' &&
    (p.durum === 'onaylandi' || p.durum === 'uygulandi' || p.durum === 'alindi' || !p.durum || p.odeme_kanali === 'manuel')
  const toplam = (liste) => (liste || []).reduce((s, p) => s + (Number(p.tutar) || 0), 0)
  const donemToplam = (d) => toplam((payments || []).filter(p => normalizeDonem(p.donem) === d && toplandi(p)))

  // Odemelerin basladigi ay (baslangictan once odeme varsa faturalama oradan baslar)
  const odenenAyListesi = Array.from({ length: 12 }, (_, i) => i + 1)
    .filter(m => donemToplam(`${refYil}-${String(m).padStart(2, '0')}`) > 0)

  // Faturalanan ay sayisi: baslangictan (veya ilk odemeden) bu aya kadar
  let basAyNo = basYil === refYil ? basAy : 1
  if (odenenAyListesi.length > 0) basAyNo = Math.min(basAyNo, Math.min(...odenenAyListesi))
  const gecenAy = Math.max(0, refAy - basAyNo + 1)

  const aylikToplam = aylikUcret * gecenAy
  // Onceki yillarin odenmemis aylik ucretleri: referans yilindan onceki her yil icin
  // faturalanan borc - o yila ait tahsilat. Yil degisince (orn. 2027'ye girince)
  // gecen yilin kalan borcu "önceki dönem"e otomatik eklenir (admin tarafıyla aynı mantık).
  const simdiYil = new Date().getFullYear()
  const simdiAy = new Date().getMonth() + 1
  const gecmisKalan = (() => {
    if (aylikUcret <= 0) return 0
    const odemeYillari = (payments || [])
      .filter(p => /^\d{4}-/.test(normalizeDonem(p.donem) || ''))
      .map(p => Number(normalizeDonem(p.donem).slice(0, 4)))
    const gecmisBasYil = Number(fee.baslangic_yil) || (odemeYillari.length ? Math.min(...odemeYillari) : refYil)
    if (refYil <= gecmisBasYil) return 0
    let t = 0
    for (let Y = gecmisBasYil; Y <= refYil - 1; Y++) {
      if (Y > simdiYil) break
      const sonAy = Y === simdiYil ? simdiAy : 12
      let odendiTutar = 0
      for (let m = 1; m <= sonAy; m++) {
        odendiTutar += Math.min(donemToplam(`${Y}-${String(m).padStart(2, '0')}`), aylikUcret)
      }
      t += Math.max(0, aylikUcret * sonAy - odendiTutar)
    }
    return t
  })()
  const oncekiDonemToplam = oncekiDonem + gecmisKalan

  const toplamBorc = oncekiDonemToplam + defterTasdik + aylikToplam

  // Tahsilat her borc kaleminde kendi tutariyla sinirli (cift/eski kayitlar fazla sayilmaz)
  const odOdenen = Math.min(donemToplam('Onceki Donem'), oncekiDonemToplam)
  const dtOdenen = Math.min(donemToplam('Defter Tasdik'), defterTasdik)
  const ayOdenen = odenenAyListesi.reduce((s, m) => s + Math.min(donemToplam(`${refYil}-${String(m).padStart(2, '0')}`), aylikUcret), 0)
  const toplamOdeme = odOdenen + dtOdenen + ayOdenen

  const alindiOdeme = toplam((payments || []).filter(p => p.durum === 'alindi'))
  const bekleyenOdeme = toplam((payments || []).filter(p => p.durum === 'bekliyor'))
  const reddedilenOdeme = toplam((payments || []).filter(p => p.durum === 'reddedildi'))

  const faturalananAylar = Array.from({ length: gecenAy }, (_, i) => basAyNo + i)
  const tamOdenenAylar = faturalananAylar.filter(m => aylikUcret > 0 && donemToplam(`${refYil}-${String(m).padStart(2, '0')}`) >= aylikUcret)
  const odenmeyenAylar = faturalananAylar.filter(m => !tamOdenenAylar.includes(m))
  const aylikKalan = faturalananAylar.reduce((s, m) => s + Math.max(0, aylikUcret - Math.min(donemToplam(`${refYil}-${String(m).padStart(2, '0')}`), aylikUcret)), 0)

  const uygulanan = (payments || []).filter(p => toplandi(p))
  const sonOdeme = uygulanan.length > 0 ? uygulanan[0].odeme_tarihi : null

  return {
    oncekiDonem: oncekiDonemToplam, oncekiDonemToplam, defterTasdik, aylikUcret, gecenAy, aylikToplam, toplamBorc, toplamOdeme,
    kalanBorc: toplamBorc - toplamOdeme, alindiOdeme, bekleyenOdeme, reddedilenOdeme, sonOdeme,
    odenenAylar: tamOdenenAylar, odenmeyenAylar,
    aylikKalan,
    defterKalan: Math.max(0, defterTasdik - donemToplam('Defter Tasdik')),
    oncekiKalan: Math.max(0, oncekiDonemToplam - donemToplam('Onceki Donem'))
  }
}

// ============ BORC BILDIRIM MESAJI ============
// Odeme linki aciklamasi ve toplu borc bildirimi icin ortak detayli mesaj
const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

export function buildBorcMesaji({ clientName = '', fee = null, ozet = {}, bankInfo = null, bankAccounts = null, linkUrl = '' }) {
  const fmtTL = (n) => Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })
  const yil = new Date().getFullYear()
  const aylikKalan = Number(ozet?.aylikKalan) || 0
  const defterKalan = Number(ozet?.defterKalan) || 0
  const oncekiKalan = Number(ozet?.oncekiKalan) || 0
  const kalanBorc = Number(ozet?.kalanBorc) || 0
  const odenmeyenAylar = ozet?.odenmeyenAylar || []

  const satirlar = [`Sayın ${clientName || 'Değerli Müşterimiz'},`]

  // Yalniz odenmeyen kisimlar yazilir; odenenler mesaja girmez
  if (aylikKalan > 0) {
    const aylikUcret = Number(ozet?.aylikUcret ?? fee?.aylik_ucret) || 0
    const ayListesi = odenmeyenAylar.map(m => AY_ADLARI[m - 1]).join(', ')
    const aylikBilgi = aylikUcret > 0 ? `Aylık: ${fmtTL(aylikUcret)} TL - ` : ''
    satirlar.push(`${yil} Yılı Muhasebe Ücreti (${aylikBilgi}Ödenmeyen Aylar: ${ayListesi}): ${fmtTL(aylikKalan)} TL`)
  }
  if (defterKalan > 0) satirlar.push(`Defter Tasdik: ${fmtTL(defterKalan)} TL`)
  if (oncekiKalan > 0) satirlar.push(`Önceki Yıldan Kalan: ${fmtTL(oncekiKalan)} TL`)
  satirlar.push(`Toplam Borcunuz: ${fmtTL(kalanBorc)} TL'dir.`)
  satirlar.push('Ödemelerinizi düzenli olarak yapmanızı rica ederiz.')
  // Coklu banka: tum hesaplar satir satir yazilir; eski tek bankInfo da desteklenir
  const hesaplar = (Array.isArray(bankAccounts) && bankAccounts.length)
    ? bankAccounts
    : (bankInfo?.iban || bankInfo?.hesapSahibi) ? [bankInfo] : []
  for (const h of hesaplar) {
    if (!h?.iban && !h?.hesapSahibi) continue
    satirlar.push(`Banka Bilgileri: ${[h.hesapSahibi, h.iban, h.banka ? `(${h.banka})` : ''].filter(Boolean).join(' ')}`.trim())
  }
  if (linkUrl) {
    satirlar.push('Kredi Kartı ile ödeme yapmak için linke tıklayın:')
    satirlar.push(linkUrl)
  }
  return satirlar.join('\n')
}

// ============ BANKA BILGILERI ============
export const BANKA_BILGILERI = {
  banka: 'Garanti Bankası',
  hesapSahibi: 'Aziz Koray Çilekci',
  iban: 'TR04 0006 2000 1350 0006 6215 82'
}

// Coklu banka destegi (2.7.150): app_settings 'banka_bilgileri' degeri artık
// { bankalar: [{banka, hesapSahibi, iban}] } olarak saklanir. Eski tek-kayit
// formati ({banka, hesapSahibi, iban}) okunurken otomatik listeye cevrilir.
export async function getBankAccounts() {
  try {
    let ofisId = null
    try { ofisId = await getMyOfficeId() } catch { /* yoksa filtreleme */ }
    let sorgu = supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'banka_bilgileri')
    if (ofisId) sorgu = sorgu.eq('office_id', ofisId)
    const { data, error } = await sorgu.maybeSingle()
    if (error) throw error
    if (!data?.value) return [{ ...BANKA_BILGILERI }]
    const parsed = JSON.parse(data.value)
    if (Array.isArray(parsed?.bankalar) && parsed.bankalar.length) {
      return parsed.bankalar.map(b => ({
        banka: b.banka || '',
        hesapSahibi: b.hesapSahibi || '',
        iban: b.iban || ''
      }))
    }
    // Eski format (tek kayit) -> listeye cevir
    if (parsed?.banka || parsed?.iban || parsed?.hesapSahibi) {
      return [{ banka: parsed.banka || '', hesapSahibi: parsed.hesapSahibi || '', iban: parsed.iban || '' }]
    }
    return [{ ...BANKA_BILGILERI }]
  } catch (err) {
    console.error('Banka hesaplari okuma hatasi:', err)
    return [{ ...BANKA_BILGILERI }]
  }
}

export async function saveBankAccounts(bankalar) {
  const temiz = (bankalar || [])
    .map(b => ({ banka: (b.banka || '').trim(), hesapSahibi: (b.hesapSahibi || '').trim(), iban: (b.iban || '').trim() }))
    .filter(b => b.banka || b.hesapSahibi || b.iban)
  if (!temiz.length) throw new Error('En az bir banka hesabi gerekli')
  let ofisId = null
  try { ofisId = await getMyOfficeId() } catch { /* yoksa null */ }
  const { error } = await supabase
    .from('app_settings')
    .upsert({
      key: 'banka_bilgileri',
      office_id: ofisId,
      value: JSON.stringify({ bankalar: temiz })
    }, { onConflict: 'office_id,key' })
  if (error) throw error
  return true
}

export async function getBankInfo() {
  // Coklu formatla uyumlu: ilk hesabi dondurur (geriye donuk uyum)
  try {
    const hesaplar = await getBankAccounts()
    const ilk = hesaplar[0]
    if (ilk && (ilk.banka || ilk.hesapSahibi || ilk.iban)) return ilk
    return BANKA_BILGILERI
  } catch (err) {
    console.error('Banka bilgisi okuma hatasi:', err)
    return BANKA_BILGILERI
  }
}

export async function saveBankInfo(bankaBilgileri) {
  let ofisId = null
  try { ofisId = await getMyOfficeId() } catch { /* yoksa null */ }
  const { error } = await supabase
    .from('app_settings')
    .upsert({
      key: 'banka_bilgileri',
      office_id: ofisId,
      value: JSON.stringify({
        banka: bankaBilgileri.banka || '',
        hesapSahibi: bankaBilgileri.hesapSahibi || '',
        iban: bankaBilgileri.iban || ''
      })
    }, { onConflict: 'office_id,key' })
  if (error) throw error
  return true
}

export function generateReceiptHtml({ client, payment, office }) {
  const fmt = (n) => Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })
  const tarih = payment.odeme_tarihi ? new Date(payment.odeme_tarihi).toLocaleDateString('tr-TR') : new Date().toLocaleDateString('tr-TR')
  const clientName = client?.name || client?.company || 'Musteri'
  const officeName = office?.name || 'MUBiS ERP'

  return `
    <html lang="tr">
      <head>
        <meta charset="UTF-8" />
        <title>Odeme Makbuzu</title>
        <style>
          body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 40px; color: #333; min-height: 100vh; box-sizing: border-box; display: flex; align-items: center; justify-content: center; }
          .receipt { max-width: 860px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
          .header { text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 20px; margin-bottom: 30px; }
          .header h1 { color: #1e3a8a; margin: 0; font-size: 28px; }
          .header p { color: #666; margin: 8px 0 0; }
          .row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #eee; }
          .row .label { color: #666; }
          .row .value { font-weight: 600; }
          .amount { background: #f0f9ff; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0; }
          .amount .number { font-size: 36px; font-weight: 700; color: #1e3a8a; }
          .footer { text-align: center; margin-top: 40px; color: #888; font-size: 12px; }
          .status { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
          .status.onaylandi { background: #dcfce7; color: #166534; }
          .status.uygulandi { background: #dcfce7; color: #166534; }
          .status.alindi { background: #dbeafe; color: #1e40af; }
          .status.bekliyor { background: #fef3c7; color: #92400e; }
          .status.reddedildi { background: #fee2e2; color: #991b1b; }
          @media print { body { background: white; padding: 0; display: block; min-height: 0; } .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="header">
            <h1>ODEME MAKBUZU</h1>
            <p>${officeName}</p>
          </div>
          <div class="row">
            <span class="label">Musteri</span>
            <span class="value">${clientName}</span>
          </div>
          <div class="row">
            <span class="label">Odeme Tarihi</span>
            <span class="value">${tarih}</span>
          </div>
          <div class="row">
            <span class="label">Odeme Kanali</span>
            <span class="value">${payment.odeme_kanali === 'paytr' ? 'PayTR - Kredi Karti' : payment.odeme_kanali === 'odeal' ? 'Odeal - Kredi Karti' : payment.odeme_tipi === 'eft' ? 'EFT/Havale' : 'Online Odeme'}</span>
          </div>
          <div class="row">
            <span class="label">Referans No</span>
            <span class="value">${payment.gateway_ref || payment.id || '-'}</span>
          </div>
          <div class="row">
            <span class="label">Durum</span>
            <span class="value"><span class="status ${payment.durum || 'bekliyor'}">${payment.durum === 'uygulandi' ? 'Borctan Dusuldu' : payment.durum === 'onaylandi' ? 'Onaylandi' : payment.durum === 'alindi' ? 'Odeme Alindi' : payment.durum === 'reddedildi' ? 'Reddedildi' : 'Onay Bekliyor'}</span></span>
          </div>
          <div class="amount">
            <div class="label">Odeme Tutari</div>
            <div class="number">${fmt(payment.tutar)} TL</div>
          </div>
          ${payment.aciklama ? `<div class="row"><span class="label">Aciklama</span><span class="value">${payment.aciklama}</span></div>` : ''}
          <div class="footer">
            <p>Bu belge elektronik olarak duzenlenmistir.</p>
            <button class="no-print" onclick="window.print()" style="margin-top:20px;padding:10px 20px;background:#1e3a8a;color:white;border:none;border-radius:6px;cursor:pointer;">Yazdir / PDF Kaydet</button>
          </div>
        </div>
      </body>
    </html>
  `
}

export function openReceipt(payment, client, office) {
  const html = generateReceiptHtml({ client, payment, office })
  // GORUNUR uygulama ici pencere: popup engelleyicisi, gizli iframe baski
  // engelleri, bos sekme yazimi sansurleri — hicbiri devreye giremez.
  // Kullanici makbuzu gorur; Yazdir dugmesi ile dogrudan baski/PDF alir.
  try {
    const eski = document.getElementById('mubis-makbuz-pencere')
    if (eski) eski.remove()

    const karart = document.createElement('div')
    karart.id = 'mubis-makbuz-pencere'
    karart.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;padding:24px;'

    const panel = document.createElement('div')
    panel.style.cssText = 'background:#fff;border-radius:12px;width:100%;max-width:1080px;height:94vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.4);'

    const cubuk = document.createElement('div')
    cubuk.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#1e3a8a;color:#fff;flex-shrink:0;'
    const baslik = document.createElement('span')
    baslik.textContent = 'ODEME MAKBUZU'
    baslik.style.cssText = 'font-weight:700;font-size:14px;letter-spacing:0.5px;'
    const dugmeler = document.createElement('div')
    dugmeler.style.cssText = 'display:flex;gap:8px;'
    const yazdir = document.createElement('button')
    yazdir.textContent = 'Yazdir / PDF Kaydet'
    yazdir.style.cssText = 'padding:7px 14px;background:#facc15;color:#1e3a8a;border:none;border-radius:6px;font-weight:700;font-size:13px;cursor:pointer;'
    const kapat = document.createElement('button')
    kapat.textContent = 'Kapat'
    kapat.style.cssText = 'padding:7px 14px;background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;'
    dugmeler.appendChild(yazdir)
    dugmeler.appendChild(kapat)
    cubuk.appendChild(baslik)
    cubuk.appendChild(dugmeler)

    const cerceve = document.createElement('iframe')
    cerceve.srcdoc = html
    cerceve.title = 'Odeme Makbuzu'
    cerceve.style.cssText = 'flex:1;border:0;width:100%;'

    yazdir.onclick = () => {
      try { cerceve.contentWindow.focus(); cerceve.contentWindow.print() } catch (e) { console.error('Baski hatasi:', e) }
    }
    kapat.onclick = () => karart.remove()

    panel.appendChild(cubuk)
    panel.appendChild(cerceve)
    karart.appendChild(panel)
    document.body.appendChild(karart)
  } catch (e) {
    console.error('Makbuz penceresi acilamadi:', e)
    alert('Makbuz gosterilemedi: ' + ((e && e.message) || e))
  }
}
