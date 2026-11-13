// e-Fatura / e-Arsiv fatura sorgulama ve saklama servisi
//
// Akis: Luca Baglanti Merkezi (admin ayarlarindaki bilgilerle) gib-yardimci
// 'efatura-sorgula' isine gonderilir; yedek olarak musteri GIB bilgileriyle
// 'efatura-gib-sorgula' denenir. Inen PDF/XML dosyalari client-documents
// bucket'ina yuklenir, metadata efatura_faturalar tablosuna yazilir.
// Musteri ClientPortal'daki "Faturalarim" sekmesinden goruntuler.
import { supabase } from '../lib/supabase'
import { fetchDocument } from '../utils/storageUrl'
import { getSettings, kayitKlasorleriGetir, setAppSetting } from './settingsService'
import { gibYardimciIs, yardimciIsSunucu, yardimciIsYerel, gibDosyalariListele, gibDosyaGetir, gibEdtSonKopya, musteriGirisBilgileriGetir } from '../utils/gibOdemeHelper'
import { uploadClientFile } from './documentService'
import { uttsSatirlariniOku, uttsOtomatikSatirlariniOku } from '../utils/uttsExcel'
import { gumrukSatirlariniOku, afaDokumSatirlariniOku, zRaporuSatirlariniOku } from '../utils/gumrukExcel'

// KDV2 otomatik aktifleşme: yuklenen/sorgulanan kayitlar icinde TEVKIFAT
// fatura turunde ALINAN (gelen) fatura varsa, o faturanin ayi icin musterinin
// beyan profilinde kdv2[ay] = { period:'aylik', active:true } yapilir. Boylece
// Aylık Beyan Takip'te o ay icin KDV2 beyani kendiliginden olusur. Idempotent:
// zaten aktif aylara dokunmaz, diger beyan turlerini degistirmez. Aktifleşen
// ay numaralarini (0-11) dondurur; kayit yoksa [].
export async function kdv2AktifEtGerekirse(client, kayitlar = []) {
  try {
    const gelenAlinan = (v) => ['gelen', 'alinan', 'alis'].includes(String(v || '').toLocaleLowerCase('tr'))
    const tevkifatli = (kayitlar || []).filter(r =>
      String(r?.fatura_turu || '').toLocaleUpperCase('tr') === 'TEVKIFAT' && gelenAlinan(r?.yon)
    )
    if (!tevkifatli.length) return []
    const aylar = new Set()
    for (const r of tevkifatli) {
      const m = r?.tarih ? parseInt(String(r.tarih).substring(5, 7), 10) : NaN
      if (m >= 1 && m <= 12) aylar.add(m - 1)
    }
    if (!aylar.size) return []
    const { data: row, error: okuHata } = await supabase
      .from('clients')
      .select('beyan_profile')
      .eq('id', client.id)
      .single()
    if (okuHata) { console.warn('KDV2 aktiflesme: profil okunamadi', okuHata.message); return [] }
    const profil = row?.beyan_profile ? JSON.parse(JSON.stringify(row.beyan_profile)) : {}
    profil.kdv2 = profil.kdv2 || {}
    const aktifleşen = []
    for (const ay of aylar) {
      if (!profil.kdv2[ay]?.active) {
        profil.kdv2[ay] = { period: 'aylik', active: true }
        aktifleşen.push(ay)
      }
    }
    if (!aktifleşen.length) return []
    const { error: yazHata } = await supabase
      .from('clients')
      .update({ beyan_profile: profil })
      .eq('id', client.id)
    if (yazHata) { console.warn('KDV2 aktiflesme: profil yazilamadi', yazHata.message); return [] }
    console.log('[kdv2-otomatik]', client.name || client.id, '| aktif edilen aylar:', aktifleşen.map(a => a + 1).join(', '))
    try { window.dispatchEvent(new CustomEvent('beyan-profile-guncellendi', { detail: { clientId: client.id } })) } catch { /* yoksay */ }
    return aktifleşen
  } catch (e) {
    console.warn('KDV2 otomatik aktiflesme hatasi:', e?.message || e)
    return []
  }
}

const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const kdv2Notu = (aylar) => (aylar?.length ? ` Bu aylarda tevkifat faturası bulunduğu için KDV2 otomatik aktif edildi: ${aylar.map(a => AY_ADLARI[a]).join(', ')}.` : '')

// Luca Baglanti Merkezi giris bilgileri (admin Settings > Luca Baglanti)
// Luca girisi 3 alanlidir: Uye Numarasi + Kullanici Adi + Parola
export async function lucaBilgileriGetir() {
  try {
    const s = await getSettings()
    return { member: s.luca_member || '', username: s.luca_username || '', password: s.luca_password || '' }
  } catch {
    return { member: '', username: '', password: '' }
  }
}

// 2.7.465: Luca'da otomatik yeni hesap acma — yardimci Muhasebe > Hesap Planı
// İşlemleri > Hesap Planı Listesi > "Yeni Hesap" diyaloğunu doldurup Kaydet'e
// basar. hesaplar: [{kod, ad}] (MUBiS'te +1 ile acilan yeni cariler).
export async function lucaHesapEkle({ client, yil, hesaplar }) {
  const luca = await lucaBilgileriGetir()
  if (!luca.username || !luca.password || !luca.member) {
    throw new Error('Luca baglantisi eksik: Ayarlar > Luca Baglanti bolumunden uye numarasi, kullanici adi ve parola girin')
  }
  return gibYardimciIs('luca-hesap-ekle', {
    lucaMember: luca.member,
    lucaUsername: luca.username,
    lucaPassword: luca.password,
    vkn: client?.vkn || client?.tc || '',
    shortName: client?.shortName || client?.name || '',
    fullName: client?.name || client?.company || '',
    yil: String(yil || new Date().getFullYear()),
    hesaplar
  })
}

// UBL e-Fatura XML'inden fatura metadata'sini cikarir.
// musteriVkn verildiginde yon (gelen/giden) otomatik belirlenir:
// musteri saticiysa 'giden' (satis), aliciysa 'gelen' (alis).
// sorguYon: kullanici acikca yon sectiyse ('satis'/'alis') VKN karsilastirmasi
// yerine sorgu yonu ESAS alinir — Luca satis sorgusunda musteri saticidir;
// musteriVkn kaydinda yazmıyorsa eski mantik butun satis faturalarini
// 'gelen' yazip Kesilen listesini bosaltiyordu.
export function faturaMetadatasiXml(xmlText, musteriVkn = '', sorguYon = '') {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
  const al = (ad) => {
    for (const onek of ['cbc:', '']) {
      const el = doc.getElementsByTagName(onek + ad)[0]
      if (el?.textContent?.trim()) return el.textContent.trim()
    }
    return ''
  }
  // Fatura no: root Invoice/CreditNote altindaki ilk cbc:ID (diger ID'ler parti kimlik)
  const faturaNoAl = () => {
    for (const rootAd of ['Invoice', 'CreditNote', 'ubl:Invoice', 'ubl:CreditNote']) {
      for (const onek of ['cbc:', '']) {
        const roots = doc.getElementsByTagName(rootAd)
        for (let i = 0; i < roots.length; i++) {
          const idEl = roots[i].getElementsByTagName(onek + 'ID')[0]
          const v = idEl?.textContent?.trim() || ''
          if (v) return v
        }
      }
    }
    return al('ID')
  }
  const taraf = (tip) => {
    for (const onek of ['cac:', '']) {
      const party = doc.getElementsByTagName(onek + tip)[0]
      if (party) {
        // VKN: PartyIdentification/cbc:ID (schemeID="VKN") ya da PartyLegalEntity/cbc:CompanyID
        let vkn = ''
        const kimlikler = [...party.getElementsByTagName('cbc:ID'), ...party.getElementsByTagName('ID')]
        for (const k of kimlikler) {
          const scheme = k.getAttribute('schemeID') || ''
          const deger = (k.textContent || '').trim()
          if (/^\d{10,11}$/.test(deger) && (!scheme || /vkn|tckn/i.test(scheme))) { vkn = deger; break }
          if (!vkn && /^\d{10,11}$/.test(deger)) vkn = deger
        }
        if (!vkn) {
          const sirket = party.getElementsByTagName('cbc:CompanyID')[0] || party.getElementsByTagName('CompanyID')[0]
          vkn = (sirket?.textContent || '').trim()
        }
        // Unvan: once RegistrationName, sonra PartyName/Name; Country/Name (Türkiye) son care
        let unvan = ''
        const regName = party.getElementsByTagName('cbc:RegistrationName')[0] || party.getElementsByTagName('RegistrationName')[0]
        if (regName?.textContent?.trim()) unvan = regName.textContent.trim()
        if (!unvan) {
          const partyName = party.getElementsByTagName('cbc:PartyName')[0] || party.getElementsByTagName('PartyName')[0]
          const partyNameName = partyName?.getElementsByTagName('cbc:Name')[0] || partyName?.getElementsByTagName('Name')[0]
          if (partyNameName?.textContent?.trim()) unvan = partyNameName.textContent.trim()
        }
        if (!unvan) {
          // 2.7.463: SAHIS faturalari — PartyName/RegistrationName yokken
          // cac:Person/cbc:FirstName + cbc:FamilyName ünvan yerine geçer
          // (iade faturalari genelde TCKN'li sahislar tarafindan kesilir).
          const kisi = party.getElementsByTagName('cac:Person')[0] || party.getElementsByTagName('Person')[0]
          if (kisi) {
            const adEl = kisi.getElementsByTagName('cbc:FirstName')[0] || kisi.getElementsByTagName('FirstName')[0]
            const soyEl = kisi.getElementsByTagName('cbc:FamilyName')[0] || kisi.getElementsByTagName('FamilyName')[0]
            const ad = (adEl?.textContent || '').trim()
            const soy = (soyEl?.textContent || '').trim()
            if (ad && soy) unvan = `${ad} ${soy}`
            else if (ad || soy) unvan = ad || soy
          }
        }
        if (!unvan) {
          // 2.7.461: PartyLegalEntity/cbc:Name — AMA Country/cbc:Name ('Türkiye')
          // VE TaxScheme/cbc:Name (VERGI DAİRESİ adı: 'MİMARSİNAN', 'BANDIRMA')
          // DEGIL. getElementsByTagName dokuman sirasinda ilk Name'i verir;
          // PartyName yokken bu etiketler ilk siraya dusup ünvan yerine
          // 'TÜRKIYE' ya da vergi dairesi adi yaziliyordu (iade faturalari hatasi).
          const adaylar = [...party.getElementsByTagName('cbc:Name'), ...party.getElementsByTagName('Name')]
          for (const el of adaylar) {
            const parent = el.parentElement?.tagName || ''
            if (/Country$/i.test(parent)) continue
            if (/TaxScheme$/i.test(parent)) continue
            const v = (el.textContent || '').trim()
            if (v && !/^t[uü]rk[iı]ye$/i.test(v)) { unvan = v; break }
          }
        }
        return { vkn: vkn || '', unvan }
      }
    }
    return { vkn: '', unvan: '' }
  }

  const satici = taraf('AccountingSupplierParty')
  const alici = taraf('AccountingCustomerParty')
  const mv = String(musteriVkn || '').trim()
  // VKN karsilastirmasi ESAS: faturayi duzenleyen (satici) musterinin kendisiyse
  // 'giden', degilse 'gelen'. Sorgu yonu yalnizca VKN'lerden emin olunamazsa
  // kullanilir — boylece Luca indirme akisinda 'satis' seciliyken klasore
  // karissan ALIS faturalari yanlislikla 'giden' yazilmaz.
  let yon = ''
  if (mv && satici.vkn) yon = (satici.vkn === mv) ? 'giden' : 'gelen'
  else if (mv && alici.vkn) yon = (alici.vkn === mv) ? 'gelen' : 'giden'
  if (!yon) {
    const sy = String(sorguYon || '').toLocaleLowerCase('tr')
    if (sy.includes('sat') || sy.includes('giden')) yon = 'giden'
    else if (sy.includes('al') || sy.includes('gelen')) yon = 'gelen'
    if (!yon) yon = 'gelen'
  }

  const profil = al('ProfileID').toLocaleUpperCase('tr')
  // e-SMM makbuzu tespiti: ProfileID "EARSIVFATURA" bile olsa (e-Arsiv ile ayni
  // profil), XML icindeki SMM isaretleri (SerbestMeslekMakbuzu uzantisi /
  // DocumentTypeCode=SMM / InvoiceTypeCode) turu 'esmm' yapar. Aksi halde
  // kesilen e-SMM makbuzlari 'earsiv' olarak kaydedilip e-SMM filtresinde ve
  // KDV hesaplamasinin e-SMM kapsaminda gorunmuyordu.
  const smmIsareti = () => {
    const duz = xmlText.replace(/\s+/g, '')
    if (/serbestmeslekmakbuzu/i.test(duz)) return true
    if (/^(SMM|EMAKBUZ)$/.test(al('DocumentTypeCode').toLocaleUpperCase('tr'))) return true
    if (/^(SMM|EMAKBUZ)$/.test(al('InvoiceTypeCode').toLocaleUpperCase('tr'))) return true
    return false
  }
  const tur = smmIsareti() ? 'esmm' : (profil.includes('EARSIV') ? 'earsiv' : 'efatura')

  // Matrah (vergi haric tutar) ve KDV (vergi toplami) — liste sutunlari icin
  const sayi = (v) => { const n = parseFloat(String(v || '').replace(',', '.')); return isFinite(n) ? n : null }

  // Sadece GERCEK KDV: TaxTypeCode 0015 (veya TaxScheme adi KDV / Katma Deger
  // Vergisi). OIV (4080), BTV (8005), OTV vb. diger vergiler KDV'ye karismaz —
  // elektrik faturalarinda 'KDV 549,71' gibi hatali toplam yaziliyordu.
  const kdvTarama = (() => {
    const parcalar = []
    let konaklama = false
    const taxTotals = doc.getElementsByTagName('cac:TaxTotal')
    for (const tt of taxTotals) {
      // Satir-seviyesi vergi bloklarini at (InvoiceLine icindekiler) —
      // yalnizca dokuman seviyesi TaxToplam'lar KDV'ye yazilir
      let at = tt.parentElement
      let satirIci = false
      while (at && at.tagName !== 'Invoice') {
        if (at.tagName === 'InvoiceLine' || at.tagName === 'cac:InvoiceLine') { satirIci = true; break }
        at = at.parentElement
      }
      if (satirIci) continue
      const subs = tt.getElementsByTagName('cac:TaxSubtotal')
      for (const s of subs) {
        const ttc = (s.getElementsByTagName('cbc:TaxTypeCode')[0]?.textContent || '').trim()
        const nm = (s.getElementsByTagName('TaxScheme')[0]?.getElementsByTagName('cbc:Name')[0]?.textContent || '')
        // 2.7.462: Konaklama vergisi (0059 / "KONAKLAMA VERGİSİ") KDV DEGIL —
        // otel faturalarinda %1 satiri KDV parcalarina karismasin
        if (ttc === '0059' || /KONAKLAMA/i.test(nm)) { konaklama = true; continue }
        if (ttc !== '0015' && !/KDV|KATMA\s*DE[ĞG]ER/i.test(nm)) continue
        const k = sayi(s.getElementsByTagName('cbc:TaxAmount')[0]?.textContent)
        if (k == null) continue
        let mt = sayi(s.getElementsByTagName('cbc:TaxableAmount')[0]?.textContent)
        const pct = sayi(s.getElementsByTagName('cbc:Percent')[0]?.textContent)
        // %0 satirlari (istisna/muaf): yalnizca matrah VE oran birlikte
        // yazilmissa kor — matrahsiz+oransiz bos muafiyet bloklari (MARPORT
        // 242-kodlu satir) atlanir
        if (!k && (mt == null || pct == null)) continue
        // KDV matrahi yazilmamissa (yoksa VEYA matrah alanina KDV tutari
        // kopyalanmissa — GETIR faturalari) oran'dan hesapla: matrah = kdv / (oran/100)
        if (k && pct && (mt == null || Math.abs(mt - k) < 0.005)) {
          mt = Math.round((k / (pct / 100)) * 100) / 100
        }
        parcalar.push({ oran: pct, matrah: mt, kdv: k })
      }
    }
    // Ayni oran birden cok kez gelirse birlestir (mukerrer TaxSubtotal koru)
    const birlesik = new Map()
    for (const p of parcalar) {
      if (birlesik.has(p.oran)) {
        const q = birlesik.get(p.oran)
        q.matrah = Math.round((q.matrah + (p.matrah || 0)) * 100) / 100
        q.kdv = Math.round((q.kdv + p.kdv) * 100) / 100
      } else birlesik.set(p.oran, { ...p })
    }
    return { parcalar: [...birlesik.values()], konaklama }
  })()
  const kdvParcalari = kdvTarama.parcalar
  const konaklamaVergisiVar = kdvTarama.konaklama
  // 2.7.497 KRITIK: listeTutar/listeMatrah/listeKdv repair bloğundan ÖNCE
  // tanimlanmali. 2.7.463'te repair bloğu listeTutar'i tanimdan once
  // kullaniyordu (TDZ ReferenceError) — bu, HER faturaMetadatasiXml cagrisini
  // sessizce dusurup PDF meta'ya geri donulmesine yol aciyordu.
  // Liste matrah/kdv yalnizca KDV parcalarindan: elektrik faturasinda
  // matrah = KDV matrahi (ETV dahil degil), kdv = yalniz KDV (OIV/BTV haric).
  // KDV parcasi bulunamazsa eski hesap (TE / TaxTotal) korunur.
  let listeMatrah = sayi(al('TaxExclusiveAmount'))
  let listeKdv = sayi(al('TaxAmount'))
  let listeTutar = sayi(al('PayableAmount'))
  // 2.7.463: Iskontolu faturalarda matrah kontrolu — matrah + kdv toplami,
  // odenen tutari (PAY) asamaz. Bazi ureticiler (SARAR, iade faturalari)
  // vergi bloklarini iki kez yazar veya iskonto oncesi matrahi verir;
  // toplam tutari asiyorsa parclar onarilir: kdv toplami TI-TE'ye
  // olceklenir, matrah = kdv / oran (coklu kdv destekli), kalan matrah
  // tutar - kdv'ye sigdirilir.
  if (!konaklamaVergisiVar && listeTutar > 0 && kdvParcalari.length) {
    const topKdv0 = Math.round(kdvParcalari.reduce((s, p) => s + p.kdv, 0) * 100) / 100
    const topMatrah0 = Math.round(kdvParcalari.reduce((s, p) => s + (p.matrah || 0), 0) * 100) / 100
    if (topMatrah0 + topKdv0 - listeTutar > 1) {
      const te = sayi(al('TaxExclusiveAmount'))
      const kdvHedef = te != null && te > 0 && listeTutar > te
        ? Math.round((listeTutar - te) * 100) / 100
        : null
      if (kdvHedef != null && topKdv0 > 0 && Math.abs(topKdv0 - kdvHedef) > 0.05) {
        const kf = kdvHedef / topKdv0
        for (const p of kdvParcalari) p.kdv = Math.round(p.kdv * kf * 100) / 100
      }
      for (const p of kdvParcalari) {
        if (p.oran > 0 && p.kdv > 0) p.matrah = Math.round((p.kdv / (p.oran / 100)) * 100) / 100
      }
      const topKdv1 = Math.round(kdvParcalari.reduce((s, p) => s + p.kdv, 0) * 100) / 100
      const mHedef = topKdv1 > 0 ? Math.round((listeTutar - topKdv1) * 100) / 100 : null
      const yeniTop = Math.round(kdvParcalari.reduce((s, p) => s + (p.matrah || 0), 0) * 100) / 100
      if (mHedef != null && mHedef > 0 && yeniTop > 0 && Math.abs(yeniTop - mHedef) > 0.01) {
        const mf = mHedef / yeniTop
        for (const p of kdvParcalari) p.matrah = Math.round((p.matrah || 0) * mf * 100) / 100
      }
    }
  }
  if (kdvParcalari.length) {
    listeMatrah = Math.round(kdvParcalari.reduce((s, p) => s + (p.matrah || 0), 0) * 100) / 100
    listeKdv = Math.round(kdvParcalari.reduce((s, p) => s + p.kdv, 0) * 100) / 100
    // Matrah hala yoksa (matrahsiz + oransiz XML) tutardan cikar: matrah = tutar - kdv
    if (!listeMatrah && listeKdv) {
      if (listeTutar) listeMatrah = Math.round((listeTutar - listeKdv) * 100) / 100
    }
    // Konaklama vergili otel faturalari: tutar = matrah + KDV (konaklama vergisi
    // haric) — aksi halde PAY 2.500 gelir, parcalar 2.477,48 toplar
    if (konaklamaVergisiVar) {
      listeTutar = Math.round((listeMatrah + listeKdv) * 100) / 100
    }
  }

  // Doviz kuru (yabanci para faturalari): Payment/Pricing/TaxExchangeRate
  // bloklarindaki cbc:CalculationRate — TL isleme icin (TRY faturalarda null).
  let dovizKur = null
  if ((al('DocumentCurrencyCode') || 'TRY').toLocaleUpperCase('tr') !== 'TRY') {
    for (const blokAd of ['PaymentExchangeRate', 'PricingExchangeRate', 'TaxExchangeRate']) {
      for (const onek of ['cac:', '']) {
        const blok = doc.getElementsByTagName(onek + blokAd)[0]
        const kurEl = blok?.getElementsByTagName('cbc:CalculationRate')[0] || blok?.getElementsByTagName('CalculationRate')[0]
        const v = parseFloat((kurEl?.textContent || '').trim().replace(',', '.'))
        if (v > 0) { dovizKur = v; break }
      }
      if (dovizKur) break
    }
  }

  return {
    // 2.7.385: uuid KUCUK harfe indirgenir — dosya adi uuid'i (kucuk) ile
    // XML cbc:UUID'si (BUYUK) harf duyarli gruplamada eslesmiyor, ayni
    // faturadan dolu-XML + bos-PDF cift satir olusuyordu.
    uuid: al('UUID').toLowerCase(),
    faturaNo: faturaNoAl(),
    tarih: al('IssueDate') || null,
    tutar: listeTutar,
    matrah: listeMatrah,
    kdv: listeKdv,
    paraBirimi: al('DocumentCurrencyCode') || 'TRY',
    dovizKur,
    karsiVkn: yon === 'giden' ? alici.vkn : satici.vkn,
    karsiUnvan: yon === 'giden' ? alici.unvan : satici.unvan,
    // 2.8.51: HER IKI TARAF da dondurulur. Cagiran taraf dosya adindan/klasorden
    // kesin yonu biliyorsa (Luca "satis" klasoru) karsi tarafi bu yone gore
    // kendisi secer. Onceden yon 'hepsi' geldiginde yon 'gelen'e dusuyor ve
    // KESILEN faturalarda karsi taraf olarak SATICI (musterinin kendi unvani)
    // yaziliyordu.
    saticiVkn: satici.vkn || '',
    saticiUnvan: satici.unvan || '',
    aliciVkn: alici.vkn || '',
    aliciUnvan: alici.unvan || '',
    // Fatura turu (UBL cbc:InvoiceTypeCode): SATIS | IADE | TEVKIFAT |
    // IHRACAT | KONSINYE | OZELMATRAH | SARF | ISTISNA ...
    faturaTuru: al('InvoiceTypeCode').toLocaleUpperCase('tr'),
    yon,
    tur,
    // Coklu KDV parcalari — yalniz gercek KDV (0015); BİM gibi %1 + %20
    // karisik faturalarda her oran ayri satir
    kdvParcalari
  }
}

// Fatura turu kodunu goruntuleme adina cevirir (SATIS -> "Satış" vb.)
export function faturaTuruAdi(kod) {
  const map = {
    SATIS: 'Satış', IADE: 'İade', TEVKIFAT: 'Tevkifat', IHRACAT: 'İhracat',
    KONSINYE: 'Konsinye', OZELMATRAH: 'Özel Matrah', SARF: 'Sarf',
    ISTISNA: 'İstisna', DEVIR: 'Devir', SGK: 'SGK', ITHALAT: 'İthalat', UTTS: 'UTTS',
    TEVKIFATIADE: 'Tevkifat İade'
  }
  const k = String(kod || '').toLocaleUpperCase('tr')
  return map[k] || (k || '')
}

// Dosya adindan uuid cikarir. Luca adlari "<uuid>#<vkn>.xml", "<uuid>_f.html"
// gibi ekler tasir — slice(-36) yanlis ksayi verir; regex birebir uuid bulur.
// 2.7.385: sonuc kucuk harfe indirgenir (XML meta uuid'si ile ayni tabana).
function uuidAdlandan(temel) {
  const m = String(temel || '').match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
  if (m) return m[1].toLowerCase()
  return String(temel || '').slice(-36).replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()
}

// Musterinin faturalarini yardimci program ile sorgular, inen PDF/XML dosyalarini
// Storage'a yukler ve efatura_faturalar tablosuna yazar.
// onDurum: durum metni geri cagirimi ('luca-girisi', 'dosya-bekleniyor', ...)
// 2.7.161: Yon degerini 'gelen'/'giden'e indirger. Cesitli yukleme
// yollarindan 'satis'/'alis'/'Kesilen'/'Alınan' gibi degerler yazilmis
// olabilir; filtreleme ve gostermeden once normalize edilir.
export function yonNormalizasyon(y) {
  const s = String(y || '').toLocaleLowerCase('tr')
  if (/giden|sati[sş]|kesilen|satilan/.test(s)) return 'giden'
  if (/gelen|ali[sş]|alinan/.test(s)) return 'gelen'
  return 'gelen'
}

// Kayit yazarken yon tespiti: XML meta en guvenilir; yoksa dosya adindaki
// ipucu (zip/klasor adlari: "...satis...", "...alis..."), sonra sorgulanan
// yon, son care 'gelen'. Eskisi meta yokken HEP 'gelen' yaziordu — satish
// faturalari Alınan kaydedilip Satış filtresinden kayboluyordu.
const yonTespitEt = (dosyaAdi, metaYon, sorguYon) => {
  if (metaYon === 'giden' || metaYon === 'gelen') return metaYon
  const ad = String(dosyaAdi || '').toLocaleLowerCase('tr')
  if (/giden|sati[sş]|kesilen|satilan/.test(ad)) return 'giden'
  if (/gelen|ali[sş]|alinan/.test(ad)) return 'gelen'
  const q = String(sorguYon || '').toLocaleLowerCase('tr')
  if (/sati[sş]|giden/.test(q)) return 'giden'
  if (/ali[sş]|gelen/.test(q)) return 'gelen'
  return 'gelen'
}

// 2.7.161b: Yon-farkindalikli fatura turu etiketi — Alınan (gelen) faturalarin
// XML turu "SATIS" yazar (saticinin turu); kullaniciya "Alış" gosterilir.
export function faturaTurEtiketi(f) {
  const t = String(f?.fatura_turu || '').toLocaleUpperCase('tr')
  if (t === 'SATIS' && f?.yon === 'gelen') return 'Alış'
  return faturaTuruAdi(f?.fatura_turu) || ''
}

// Listede "Tür" hücresi: belge türü adı — "e-Fatura", "e-Arşiv", "e-SMM", "UTTS",
// "Gümrük". Z Raporu/fiş kayıtları (tur=efatura yazsa da) kendi tipini taşır.
const TUR_ADLARI = { efatura: 'e-Fatura', earsiv: 'e-Arşiv', esmm: 'e-SMM', utts: 'UTTS', gumruk: 'Gümrük' }
const OZEL_TIP_NORM = ['Z RAPORU', 'GIDER FISI', 'GIDER DOKUMU']
const turNorm = (s) => String(s || '').toLocaleUpperCase('tr')
  .replace(/[İIı]/g, 'I').replace(/Ç/g, 'C').replace(/Ğ/g, 'G').replace(/Ö/g, 'O').replace(/Ş/g, 'S').replace(/Ü/g, 'U')
export function belgeTuruAdi(f) {
  const tip = faturaTurEtiketi(f)
  if (tip && OZEL_TIP_NORM.includes(turNorm(tip))) return tip
  return TUR_ADLARI[String(f?.tur || '').toLocaleLowerCase('tr')] || (f?.tur || '')
}

// Sorgu turu icin yon listesi:
// - UTTS'te satis yok; yalniz SATIS sorgusu istendiyse UTTS tamamen atlanir
//   (satış sorgusunda UTTS (Alış) gereksiz).
// - e-SMM yalniz serbest meslek mükellefleri keser: serbest olmayan
//   müşteride e-SMM (Satış) atlanir — e-SMM (Alış) herkeste calisir.
export function sorguYonleri(tur, yonlar, client) {
  const liste = Array.isArray(yonlar) && yonlar.length ? yonlar : ['alis', 'satis']
  if (tur === 'utts') return liste.includes('alis') ? ['alis'] : []
  if (tur === 'esmm' && liste.includes('satis')) {
    const ham = client?.serbestMeslek ?? client?.serbest_meslek
    const serbest = ham === true || ['evet', 'true', '1', 'x'].includes(String(ham || '').toLocaleLowerCase('tr').trim())
    if (!serbest) return liste.filter(y => y !== 'satis')
  }
  return liste
}

// Tur filtresi eslesmesi: "Satış" yalniz KESILEN (giden), "Alış" yalniz
// ALINAN (gelen) satıs faturalarini listeler — alış/satış ayrımı boylece
// fatura turu seciminde de dogru calisir.
// 2.7.384: Satış/Alış secimi YON filtresidir — o yondeki TUM faturalar
// (IADE, TEVKIFAT, ISTISNA, e-SMM, UTTS...) listelenir; yalniz fatura_turu
// SATIS olanlar degil.
export function faturaTurEslesir(f, filtre) {
  if (!filtre || filtre === 'all' || filtre === '') return true
  if (filtre === 'SATIS') return f?.yon === 'giden'
  if (filtre === 'ALIS') return f?.yon !== 'giden'
  // 2.7.496: Turkce harf toleransi — GIB degeri "TEVKİFAT/İADE/İSTİSNA"
  // (Turkce İ) gelebilir; filtre ASCII ("TEVKIFAT"). İ/I ve ÇĞÖŞÜ sadelestirip
  // karsilastir (aksi halde Tevkifat/İade/İstisna filtreleri bos doner).
  const norm = s => String(s || '').toLocaleUpperCase('tr')
    .replace(/[İIı]/g, 'I').replace(/Ç/g, 'C').replace(/Ğ/g, 'G')
    .replace(/Ö/g, 'O').replace(/Ş/g, 'S').replace(/Ü/g, 'U')
  return norm(f?.fatura_turu) === norm(filtre)
}

export function lucaDurumMetni(adim) {
  return ({
    'hazirlaniyor': 'Yardımcı bağlantısı hazırlanıyor...',
    'luca-girisi': 'Luca bağlantısı ve sorgu işlemi sürüyor; yanıt bekleniyor...',
    'luca-oturum-acik': 'Açık Luca oturumu kullanılıyor...',
    'luca-giris-tamam': 'Luca girişi tamamlandı...',
    'urun-secimi': 'Luca uygulaması açılıyor...',
    'musteri-secimi': 'Luca’da müşteri seçiliyor...',
    'yil-secimi': 'Luca’da dönem seçiliyor...',
    'akilli-entegrasyon-menusu': 'Seçilen belge türünün Luca menüsü açılıyor...',
    'gibden-getir': 'GİB sorgusu için tarih aralığı hazırlanıyor...',
    'gib-sorgu-gonderildi': 'Luca’da tarih aralığıyla sorgu başlatma denendi; yanıt bekleniyor...',
    'belge-sec-indir': 'Luca’da belgeler seçiliyor ve indirme işlemi yürütülüyor...',
    'tamamlandi': 'Yardımcı işlem sonucunu hazırlıyor...',
    'luca-sorgusu-bekleniyor': 'Önceki Luca işleminin bitmesi bekleniyor...',
    'yerel-yedek': 'Sunucu bağlantısı başarısız oldu; yerel yardımcıda işlem sürüyor...'
  })[adim] || null
}

export function faturaIlerlemeMetni(ilerleme) {
  if (ilerleme?.asama === 'indirme') return `İndirilen dosyalar kontrol ediliyor${ilerleme.dosyaSayisi ? ` (${ilerleme.dosyaSayisi} dosya bulundu)` : ''}...`
  if (ilerleme?.asama === 'yukleme') return `Dosyalar MUBİS’e aktarılıyor %${ilerleme.yuzde ?? 0}${ilerleme.toplam ? ` (${ilerleme.islenen ?? 0}/${ilerleme.toplam} dosya işlendi)` : ''}...`
  if (ilerleme?.asama === 'kayit') return 'Fatura kayıtları MUBİS’e kaydediliyor...'
  if (ilerleme?.asama === 'bitti') return 'Aktarım sonuçları kontrol ediliyor...'
  return null
}

const dosyaImzasi = d => `${Number(d?.boyut) || 0}|${Number(d?.tarih) || 0}`
const dosyaDegistiMi = (fotograf, d) => fotograf instanceof Map
  ? fotograf.get(d.ad) !== dosyaImzasi(d)
  : !fotograf?.has?.(d.ad)

export async function efaturaSorgula({ client, yil, ay, sorguTip = 'efatura', yon = 'hepsi', mod = 'sorgula', baslangicTarih, bitisTarih, kaynak = 'luca', yardimciKaynak = 'otomatik', onDurum, onIlerleme, sadeceIndir = false, sadeceSorgu = false, iptalKontrol = null }) {
  const durum = (m) => { try { onDurum?.(m) } catch { /* yoksay */ } }
  if (!client?.id) throw new Error('Musteri secili degil')
  // 2.7.574: kullanici "Durdur" bastiysa is baslatilmadan cik
  if (iptalKontrol?.()) throw new Error('KULLANICI_DURDURDU')

  const [luca, giris] = await Promise.all([
    lucaBilgileriGetir(),
    musteriGirisBilgileriGetir(client.id).catch(() => null)
  ])

  if ((!luca.username || !luca.password || !luca.member) && !(giris?.dvs_username && giris?.dvs_password)) {
    throw new Error('Sorgulama icin giris bilgisi yok: Ayarlar > Luca Baglanti bolumunden Luca uye numarasi, kullanici adi ve parola girin')
  }

  // KAYNAK (2.7.432): GIB dogrudan sorgu kaynagi KALDIRILDI — e-Fatura
  // Portalina IVD/DVS sifresiyle girilemedigi icin GIB yolu guvenilir
  // calismiyordu. Tum sorgu tipleri (efatura | earsiv | esmm | utts) Luca
  // "Akilli Entegrasyon Noktasi" uzerinden sorgulanir.

  // Yardimci programin "indirilenler" klasorundeki mevcut dosyalari not al -
  // yeni inenleri ayirt etmek icin
  // 2.7.466: Fotograf cekilemezse BOSSA birakma — bos set, klasordeki TUM
  // birikmis dosyalarin (binlerce) "yeni" sayilip tekrar islenmesine yol
  // aciyordu. 3 deneme yapilir; yine olmazsa islem hata ile durdurulur.
  const oncekiSet = new Map()
  let yerelFotograf = null
  if (!sadeceSorgu && yardimciKaynak !== 'yerel') {
    try {
      yerelFotograf = new Map((await gibDosyalariListele('yerel')).map(d => [d.ad, dosyaImzasi(d)]))
    } catch {}
  }
  const ilkKaynak = yardimciKaynak === 'yerel' ? 'yerel' : 'sunucu'
  let fotografiOk = sadeceSorgu
  let fotografHata = null
  for (let deneme = 0; deneme < 3 && !fotografiOk; deneme++) {
    try {
      (await gibDosyalariListele(ilkKaynak)).forEach(d => oncekiSet.set(d.ad, dosyaImzasi(d)))
      fotografiOk = true
    } catch (err) {
      fotografHata = err
      if (deneme < 2) await new Promise(r => setTimeout(r, 2000))
    }
  }
  if (!fotografiOk) {
    throw new Error(`Yardımcının indirme klasörü okunamadı: ${fotografHata?.message || 'bilinmeyen hata'}`)
  }

  // 2.8.10: Isin GERCEKTE hangi makinede calistigi. Sunucu (VPS) basarisiz
  // olup yerel yedekten calistiysa dosyalar YEREL diska iner; is sonrasi
  // listeleme/indirme de ayni makineden okunmalidir. Liste yine VPS'ten
  // okunursa "yeni dosya bulunamadi" sonucu ve yanlis makineye yukleme cikar
  // (kullanici "sorgulama bilgisayardan oluyor" goruntusunu de boyle gordu).
  let isYereldeCalisti = false

  durum('hazirlaniyor')
  let isSonuc = null
  if (luca.username && luca.password && luca.member) {
    durum('luca-girisi')
    // 2.7.193: Adminin ayarladigi FATURA gelen/giden klasorleri — satis
    // (giden) faturalari giden klasorune, alis (gelen) gelen klasorune
    // kaydedilir (app_settings, ofis bazli).
    let edefterKok = ''
    try {
      const kl = await kayitKlasorleriGetir()
      edefterKok = String(yon || '').toLocaleLowerCase('tr') === 'satis'
        ? (kl.faturaGidenKlasoru || '')
        : (kl.faturaGelenKlasoru || '')
    } catch { edefterKok = '' }
    const lucaSorguBeklemeBaslangici = Date.now()
    while (true) {
      isSonuc = await (yardimciKaynak === 'yerel' ? yardimciIsYerel : yardimciIsSunucu)('efatura-sorgula', {
      lucaMember: luca.member,
      lucaUsername: luca.username,
      lucaPassword: luca.password,
      vkn: client.vkn || client.tc || '',
      // Luca'da musteri secimi musteri kaydindaki KISA AD ile yapilir
      shortName: client.shortName || client.name || '',
      // Edefter klasoru icin musterinin TAM ADI (unvan): diskteki klasor adi
      // kisa adla uyusmuyorsa unvanla eslestirilir (otomatik eslestirme)
      fullName: client.name || client.company || '',
      // Sorgu turu: efatura | earsiv | esmm | utts ; yon: alis | satis | hepsi
      sorguTip: String(sorguTip || 'efatura'),
      yon: String(yon || 'hepsi'),
      yil: String(yil || ''),
      ay: String(ay || ''),
      // 2.7.103: 'sorgula' = Luca Fatura Sorgula ve indir (GİB'den Getir canlı
      // sorgu: ay başı -> bugün, sonra Belge Seç ay başı-sonu -> indir);
      // 'indir' = Luca Fatura indir (hazır listeden Belge Seç + indir)
      mod: String(mod || 'sorgula'),
      // 2.7.383: 7 günlük parçalı sorgu — web tarafı hesaplanan dd/MM/yyyy
      // araligi buradan gecer; yardimci bu tarihleri kullanir (ay basi
      // varsayilaninin yerine). Bos ise yardimci ayni davranir.
      gibdenBasTarihi: baslangicTarih ? String(baslangicTarih) : undefined,
      gibdenBitTarihi: bitisTarih ? String(bitisTarih) : undefined,
      // Giris otomatik: kimlik bilgileri dogrulandi (117. satir), yardimci
      // formu trusted-klavye ile doldurur + captcha'yi cozer; basarisizsa
      // kendiliginden elle giris beklemesine duser (manuelGiris kaldirildi).
      // Toplu sorgularda Luca oturumu acik kalir: bir sonraki musteride
      // giris/urun adimlari atlanir, dogrudan musteri degistirilir.
      oturumKalsin: true,
      // 2.7.460: sadeceIndir modunda dosyalar EDEFTER klasorune KOPYALANMAZ
      // (arkaplan kopyalayicilari susar) — web MUBiS yuklemesi bitince
      // edefter-kopyala isiyle toplu kopyalar.
      // 2.8.6: Sorgu artik HER ZAMAN sunucudan calisir (VPS'te G:\ yolu
      // yoktur) — kopyalama her zaman web tarafindan edefterTopluKopyala
      // isiyla yapilir; yardimci ici klasorKopyala kalici olarak kapali.
      klasorKopyala: false,
      // 2.7.461: sadeceSorgu — GİB'den Getir tetiklenir, INDIRME YAPILMAZ.
      // Tum periyot sorgulari bittikten sonra ayin tum faturalari mod:'indir'
      // isiyla tek geciste indirilir.
      sadeceSorgu: sadeceSorgu ? true : undefined,
      // 2.7.193: kayit klasoru (bos ise yardimci varsayilani kullanir)
      edefterKok
    // 2.7.385: Luca satis sorgulari yuzlerce dosya + zip paketleme
    // yapabiliyor; varsayilan 10 dk zaman asimi satis taramalarinda
    // dosyalar inmis olsa bile web'i bekletmeden patliyordu -> 25 dk.
      }, 25 * 60 * 1000, durum)
      if (isSonuc?.reason !== 'mevcut-sorgu-devam-ediyor') break
      if (iptalKontrol?.()) throw new Error('KULLANICI_DURDURDU')
      // 2.8.34: Kilit bekleme suresi 25 dk -> 2 dk. Yardimcidaki 15 dk'lik
      // kilit Durdur ile artik temizleniyor; yine de takili kalirsa kullanici
      // 25 dk beklemek yerine 2 dk sonra net hata alir.
      if (Date.now() - lucaSorguBeklemeBaslangici >= 2 * 60 * 1000) {
        throw new Error('mevcut-sorgu-devam-ediyor: Önceki Luca sorgusu hâlâ bitmedi. "Durdur" düğmesine basıp kilidi temizleyin, sonra tekrar deneyin.')
      }
      durum('luca-sorgusu-bekleniyor')
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
    // Is gercekten nerede calisti? (sunucuyaIsGonder'in yerel yedek dusmesi)
    if (isSonuc?.yerelYedek) isYereldeCalisti = true
  }
  // 2.7.432: Luca girisi reddedilirse GIB yedegi KALDIRILDI — hata dogrudan
  // kullaniciya gosterilir (tum sorgular Luca kanalindan gider).
  if (!isSonuc?.ok) {
    const sebep = isSonuc?.reason
    if (sebep === 'kurulu-degil') throw new Error('MUBiS yardimci programi bu bilgisayarda calismiyor')
    if (sebep === 'servis-yanit-vermedi') {
      if (yardimciKaynak === 'yerel') throw new Error('Yerel yardımcı zamanında yanıt vermedi. İşlem arka planda devam ediyor olabilir; tekrar denemeden önce yardımcıyı kontrol edin.')
      // 2.7.385: zaman asimi yardimciyi DURDURMAZ — dosyalar arka planda
      // inmeye devam eder (Luca satis taramalari 10 dk'yi asabiliyor).
      // Burada hata firlatmak yerine dosya bekleme akisina devam edilir;
      // inen dosyalar yine yuklenir.
      console.warn('Yardimci yaniti zaman asimina ugradi; dosya beklemeye devam ediliyor')
    } else {
      if (!luca.username || !luca.password || !luca.member) throw new Error('Sorgulama icin Luca baglantisi eksik: Ayarlar > Luca Baglanti bolumunden uye numarasi, kullanici adi ve parola girin')
      throw new Error(isSonuc?.error || isSonuc?.reason || 'Fatura sorgulama basarisiz')
    }
  }
  // Portal girisi yapilamadiysa dosya beklemek anlamsiz (6 dk bosa gider):
  // portalin verdigi hata mesaji dogrudan kullaniciya gosterilir.
  if (isSonuc.girisOk === false) {
    throw new Error(isSonuc.not || 'Portal girisi tamamlanamadi; yardimci program penceresinden elle giris yapip tekrar deneyin.')
  }

  // 2.7.461: sadeceSorgu — yalniz GİB'den Getir tetiklendi; dosya bekleme/
  // fark listesi YOK (indirme ayri 'indir' isiyla, tum sorgular bitince).
  if (sadeceSorgu) {
    return { ok: true, sadeceSorgu: true, sayi: 0, dosyalar: [], not: isSonuc?.not || '', yerelYedek: isYereldeCalisti }
  }

  const aktifKaynak = isYereldeCalisti ? 'yerel' : ilkKaynak
  const aktifFotograf = isYereldeCalisti ? yerelFotograf : oncekiSet
  if (!aktifFotograf) throw new Error('Yerel indirme klasörünün önceki durumu okunamadı; yanlış dosyaları yüklememek için işlem durduruldu.')

  // 2.7.460: sadeceIndir — Luca sorgu + indirme bitti; MUBiS yuklemesi ve
  // klasor kopyalamasi YOK. Yeni inen dosyalarin kisa fark listesi doner
  // (bilgi amacli); gercek yukleme tum parcalar bitince dosyalariMubisYukle
  // ile KOMPLE yapilir. Dosyalar EDEFTER klasorune de kopyalanmadi
  // (klasorKopyala:false) — edefterTopluKopyala sonda toplu kopyalar.
  if (sadeceIndir) {
    const yeniListe = []
    // 2.8.10: liste, isin calistigi makineden okunur (yerel yedekte dosyalar
    // yerel diskte; sunucuda VPS diskinde).
    ;(await gibDosyalariListele(aktifKaynak)).forEach(d => {
      if (dosyaDegistiMi(aktifFotograf, d) && /\.(pdf|xml|xlsx|xls|html?)$/i.test(d.ad)) yeniListe.push(d)
    })
    return { ok: true, sadeceIndir: true, sayi: yeniListe.length, dosyalar: yeniListe, zipYoluIle: isSonuc?.zipYoluIle === true, not: isSonuc.not || '', yerelYedek: isYereldeCalisti, yardimciKaynak: aktifKaynak, oncekiSet: aktifFotograf }
  }

  // 2.7.460: eski davranis (tek cagri = bekle + yukle). Yeni toplu akista web
  // sadeceIndir ile indirir, tum parcalar bitince dosyalariMubisYukle ile
  // komple yukler (asagida parametre gecilir).
  return await dosyalariMubisYukle({
    client, yil, ay, sorguTip, yon, yardimciKaynak: aktifKaynak,
    yerelYedek: isYereldeCalisti,
    oncekiSet: aktifFotograf,
    zipYoluIle: isSonuc?.zipYoluIle === true,
    notOnEk: isSonuc.not || '',
    onDurum,
    onIlerleme
  })
}

async function uttsExcelDosyalariniYukle({ client, yil, ay, dosyalar, kaynak, ilerle }) {
  const durumlar = []
  let toplam = 0
  const anahtar = (row) => JSON.stringify([row.tarih, String(row.faturaNo || row.fatura_no || '').trim(), String(row.vkn || row.karsi_vkn || '').trim()])
  try {
    if (dosyalar.some(d => !/\.xlsx?$/i.test(d.ad))) throw new Error('UTTS için beklenmeyen dosya türü')
    const dosyaVerileri = []
    const tumAnahtarlar = new Set()
    for (const dosya of dosyalar) {
      const blob = await gibDosyaGetir(dosya.ad, kaynak)
      const satirlar = await uttsOtomatikSatirlariniOku(await blob.arrayBuffer())
      for (const satir of satirlar) {
        const donem = String(yil || '') + (ay ? '-' + String(ay).padStart(2, '0') : '')
        if (donem && !satir.tarih.startsWith(donem)) throw new Error('UTTS Excel seçilen dönem dışında satır içeriyor')
        const key = anahtar(satir)
        if (tumAnahtarlar.has(key)) throw new Error('UTTS dosyalarında tekrarlı satır bulundu')
        tumAnahtarlar.add(key)
      }
      dosyaVerileri.push({ dosya, blob, satirlar })
    }
    const mevcut = new Map()
    const numaralar = new Set(dosyaVerileri.flatMap(d => d.satirlar.map(row => row.faturaNo)))
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from('efatura_faturalar')
        .select('fatura_uuid,yon,tarih,fatura_no,karsi_vkn,tutar,matrah,kdv,xml_url')
        .eq('client_id', client.id).eq('tur', 'utts')
        .order('id', { ascending: true }).range(offset, offset + 999)
      if (error || !Array.isArray(data)) throw new Error('Mevcut UTTS kayıtları okunamadı: ' + (error?.message || 'yanıt eksik'))
      for (const row of data) {
        const numara = String(row.fatura_no || '').trim()
        if (numaralar.has(numara) && (!row.tarih || !/^\d{10,11}$/.test(String(row.karsi_vkn || '').trim()))) throw new Error('Mevcut UTTS kaydının kimliği eksik; tekrar kontrolü yapılamıyor')
        const key = anahtar(row)
        if (!tumAnahtarlar.has(key)) continue
        if (mevcut.has(key)) throw new Error('Mevcut UTTS kayıtlarında tekrar bulundu; aktarım durduruldu')
        mevcut.set(key, row)
      }
      if (!data || data.length < 1000) break
    }
    for (const { satirlar } of dosyaVerileri) {
      for (const satir of satirlar) {
        const row = mevcut.get(anahtar(satir))
        if (!row) continue
        const esit = (a, b) => a != null && b != null && Math.abs(Number(a) - Number(b)) < 0.01
        if (row.yon !== 'gelen' || !row.xml_url || !esit(row.tutar, satir.toplam) || !esit(row.matrah, satir.matrah) || !esit(row.kdv, satir.kdv)) throw new Error('Mevcut UTTS kaydı Excel ile uyuşmuyor; aktarım durduruldu')
      }
    }
    for (const { dosya, blob, satirlar } of dosyaVerileri) {
      const yeni = satirlar.filter(row => !mevcut.has(anahtar(row)))
      if (yeni.length) {
        const ext = /\.xls$/i.test(dosya.ad) ? 'xls' : 'xlsx'
        const dosyaAdi = `utts_${crypto.randomUUID()}.${ext}`
        const file = new File([blob], dosyaAdi, { type: ext === 'xls' ? 'application/vnd.ms-excel' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        const { url } = await uploadClientFile({ client, relPath: `faturalar/${yil || new Date().getFullYear()}/${dosyaAdi}`, file })
        if (!url) throw new Error('UTTS Excel bağlantısı oluşturulamadı')
        const kayitlar = await Promise.all(yeni.map(async row => {
          const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(anahtar(row)))
          const uuid = 'utts_' + Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
          return { client_id: client.id, yon: 'gelen', tur: 'utts', fatura_turu: 'UTTS', fatura_uuid: uuid, fatura_no: row.faturaNo, tarih: row.tarih, karsi_vkn: row.vkn, karsi_unvan: '', tutar: row.toplam, matrah: row.matrah, kdv: row.kdv, para_birimi: 'TRY', pdf_url: '', xml_url: url, html_url: '', sorgu_ts: new Date().toISOString() }
        }))
        const { error } = await supabase.from('efatura_faturalar').upsert(kayitlar, { onConflict: 'client_id,yon,tur,fatura_uuid' })
        if (error) throw new Error('UTTS kayıtları yazılamadı: ' + error.message)
      }
      toplam += satirlar.length
      durumlar.push({ ad: dosya.ad, tur: 'xlsx', boyut: dosya.boyut || 0, luca: null, mubis: true, hata: '' })
      ilerle('yukleme', 30 + 65 * durumlar.length / dosyaVerileri.length, { islenen: durumlar.length, toplam: dosyaVerileri.length })
    }
    ilerle('bitti', 100, { islenen: durumlar.length, toplam: dosyaVerileri.length })
    return { ok: true, sayi: toplam, not: '', dosyalar: durumlar }
  } catch (error) {
    return { ok: false, sayi: toplam, not: error?.message || 'UTTS Excel aktarılamadı', dosyalar: durumlar }
  }
}

// 2.7.460: yardimci indirme klasorunun anlik fotografi (dosya adı -> boyut/zaman imzasi).
// Toplu akista asama 1 (indirme) baslamadan once alinir; yuklemedeki fark
// taramasi bu fotografla yapilir — boylece tum parcalarindan inen dosyalar
// tek taramada toplanir.
export async function yardimciDosyaFotografi(yardimciKaynak = 'otomatik') {
  // 2.7.466: 3 deneme; hepsi basarisizsa null doner (bos set DEGIL —
  // bos set tum birikmis dosyalarin "yeni" sanilmasina yol aciyordu).
  for (let deneme = 0; deneme < 3; deneme++) {
    try {
      const s = new Map()
      ;(await gibDosyalariListele(yardimciKaynak)).forEach(d => s.set(d.ad, dosyaImzasi(d)))
      return s
    } catch {
      if (deneme < 2) await new Promise(r => setTimeout(r, 2000))
    }
  }
  return null
}

// 2.7.460: indirme klasorune inen dosyalari MUBiS'e (Storage + efatura_faturalar)
// KOMPLE yukler. Eski efaturaSorgula govdesinin bekleme + yukleme bolumudur;
// sadeceIndir modundaki toplu akista tum parcalar bittikten sonra cagrilir.
// ilgiliTabanlar verildiyse yalnizca taban adi eslesen dosyalar islenir
// (parcali indirmede tur/yon karismasin diye); verilmezse tum yeniler alinir.
export async function dosyalariMubisYukle({ client, yil, ay, sorguTip = 'efatura', yon = 'hepsi', yardimciKaynak = 'otomatik', yerelYedek = false, oncekiSet = new Set(), zipYoluIle = false, notOnEk = '', ilgiliTabanlar = null, onarim = false, onDurum, onIlerleme }) {
  const durum = (m) => { try { onDurum?.(m) } catch { /* yoksay */ } }
  // 2.8.10: Indirme isi yerel yedekte calistiysa dosyalar YEREL diskte;
  // listeleme/indirme ayni makineden yapilir (yoksa "yeni dosya yok" + yanlis
  // makineye yukleme). Cagiranlar: efaturaSorgula ve FaturaSorgulama.
  const etkilenenKaynak = yerelYedek ? 'yerel' : yardimciKaynak
  // 2.7.466: Yuzdeli ilerleme (0-100). Asamalar: 'indirme' (dosyalarin
  // inmesini bekleme, 0-30), 'yukleme' (parse+Storage, 30-95), 'kayit'
  // (DB yazimi, 95-100), 'bitti' (100).
  const ilerle = (asama, yuzde, ekstra = {}) => { try { onIlerleme?.({ asama, yuzde: Math.max(0, Math.min(100, Math.round(yuzde))), ...ekstra }) } catch { /* yoksay */ } }
  if (!client?.id) throw new Error('Musteri secili degil')
  // 2.7.466: Fotograf alinamadiysa (null) fark taramasi yapilamaz — tum
  // birikmis dosyalari "yeni" sanip binlerce dosyayi tekrar islemesin.
  if (!oncekiSet) {
    return { ok: false, sayi: 0, not: notOnEk || 'Indirme klasoru okunamadi — fark taramasi yapilamadigi icin yukleme atlandi (yardimci calisiyor mu?).' }
  }
  // 2.7.467: ONCEDEN YUKLENMIS FATURALARI ATLA — dosya adindaki UUID ayni
  // tur+yon icin DB'de zaten kayitliysa (dosya url'si dolu kayit) o dosya
  // hic islenmez: Storage'a tekrar yuklenmez, kayit tekrar yazilmaz.
  // Mukerrer yuklemeyi ve gereksiz bekleme/sureyi onler. URL'si olmayan
  // (yarim/metasiz) kayitlar atlanmaz — tekrar islenip tamamlanir.
  let yukluAnahtarlar = new Set()
  // 2.7.483: ONARIM modu — zaten yuklu faturalar da yeniden islenir
  // (KDV tutarlari ve eslesmeler yenilenir); atlanmazlar.
  try {
    if (!onarim) {
    const { data: yuklu } = await supabase
      .from('efatura_faturalar')
      .select('fatura_uuid,yon,tur,pdf_url,xml_url,html_url')
      .eq('client_id', client.id)
    ;(yuklu || []).forEach(r => {
      if (!r.fatura_uuid) return
      if (!(r.pdf_url || r.xml_url || r.html_url)) return
      yukluAnahtarlar.add(`${r.yon}|${r.tur}|${String(r.fatura_uuid).toLowerCase()}`)
    })
    }
  } catch { /* kontrol edilemezse tum dosyalar islenir (eski davranis) */ }
  const uuidDesenDosya = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  const dosyaZatenYuklu = (ad) => {
    const m = uuidDesenDosya.exec(String(ad || ''))
    if (!m) return false // uuid okunamayan dosyalar her zaman islenir
    const u = m[1].toLowerCase()
    const yonler = yon === 'hepsi' ? ['alis', 'satis'] : [yon]
    const turlar2 = sorguTip === 'hepsi' ? ['efatura', 'earsiv', 'esmm', 'utts'] : [sorguTip]
    return yonler.some(y => turlar2.some(t => yukluAnahtarlar.has(`${y}|${t}|${u}`)))
  }
  let atlananDosya = 0

  // Yeni inen PDF/XML dosyalarini bekle (en fazla ~6 dk)
  durum('dosya-bekleniyor')
  ilerle('indirme', 0)
  const yeniDosyalar = []
  const baslangic = Date.now()
  let bosTur = 0
  // 2.7.468: listele hatasi toleransi — yardimci is hâlâ mesgalse/cevap
  // vermezse catch-continue donguyu 6 dakikalik ust sinira kadar dolduruyor
  // ve her tur+yon arasinda ~6 dk "cok bekliyor" oluyordu (19.10.2026
  // gunlugu: alis-satis arasi 6 dk 10 sn bosluk). Artik: dosya toplandiysa
  // 8 ust uste hata (~1 dk) sonrasinda beklemeyi birak; dosya yoksa 20 hata
  // (~2 dk) sonrasinda vazgec.
  let listeleHata = 0
  while (Date.now() - baslangic < 6 * 60 * 1000) {
    await new Promise(r => setTimeout(r, 6000))
    let simdi = []
    try {
      simdi = await gibDosyalariListele(etkilenenKaynak)
      listeleHata = 0
    } catch {
      listeleHata++
      if (yeniDosyalar.length > 0 && listeleHata >= 8) break
      if (listeleHata >= 20) break
      continue
    }
    const yeni = simdi.filter(d => dosyaDegistiMi(oncekiSet, d) && /\.(pdf|xml|xlsx|xls|html?)$/i.test(d.ad) &&
      // 2.7.460: ilgiliTabanlar verildiyse yalnizca bu grubun dosyalari
      (!ilgiliTabanlar || ilgiliTabanlar.has(d.ad.replace(/\.(pdf|xml|xlsx|xls|html?)$/i, '').toLowerCase())))
    let eklenen = 0
    for (const d of yeni) {
      if (!yeniDosyalar.some(x => x.ad === d.ad)) {
        yeniDosyalar.push(d)
        eklenen++
      }
    }
    if (yeniDosyalar.length > 0) ilerle('indirme', Math.min(30, 3 + yeniDosyalar.length), { dosyaSayisi: yeniDosyalar.length })
    if (eklenen === 0) {
      bosTur++
      // 2 bos tur (12 sn) hic dosya inmeden indirme bitti sayilir; tek tur
      // yetmez — Luca toplu indirmede paketler arasi 6-12 sn sessizlik
      // olabiliyor ve erken break yarim liste birakiyordu.
      if (yeniDosyalar.length > 0 && bosTur >= 2) break
      if (yeniDosyalar.length === 0 && bosTur >= 8) break // hic inmedi
    } else {
      bosTur = 0
    }
  }

  // 2.7.241: yardimci PDF donusumunu ASYNC yapar (XML/HTML iner, PDF
  // arkada uretilir). Tum yeni XML/HTML'lerin PDF karsiligi inene kadar
  // bekle (en fazla 180 sn — 2.7.385: satis taramalarinda yuzlerce PDF
  // donusebiliyor, 90 sn yetmiyordu) — aksi halde tasarim/orijinal PDF
  // henuz uretilmeden yukleme biter ve faturalar listede PDF'siz kalirdi.
  const pdfBekleyenVar = () => yeniDosyalar.some(d =>
    /\.(xml|html?)$/i.test(d.ad) &&
    !yeniDosyalar.some(p => p.ad === d.ad.replace(/\.(xml|html?)$/i, '.pdf')))
  // 2.7.430: GIB ZIP yolu (isSonuc.zipYoluIle) PDF uretmez — XML'ler dogrudan
  // islenir; PDF karsiligi bekleme 3 dakika gecikme yaratirdi, atlanir.
  if (zipYoluIle !== true && pdfBekleyenVar()) {
    const bekBaslangic = Date.now()
    let pdfBeklemeHata = 0
    while (Date.now() - bekBaslangic < 180 * 1000 && pdfBekleyenVar()) {
      await new Promise(r => setTimeout(r, 4000))
      try {
        (await gibDosyalariListele(etkilenenKaynak)).forEach(d => {
          if (/\.pdf$/i.test(d.ad) && dosyaDegistiMi(oncekiSet, d) && !yeniDosyalar.some(x => x.ad === d.ad)) yeniDosyalar.push(d)
        })
        pdfBeklemeHata = 0
      } catch {
        pdfBeklemeHata++
        if (pdfBeklemeHata >= 15) break // ~1 dk ust uste hata — bekleme birakin
      }
    }
  }

  if (yeniDosyalar.length === 0) {
    return { ok: true, sayi: 0, not: notOnEk || 'Giris yapildi ancak yeni fatura dosyasi inmedi.' }
  }

  if (sorguTip === 'utts') {
    return uttsExcelDosyalariniYukle({ client, yil, ay, dosyalar: yeniDosyalar, kaynak: etkilenenKaynak, ilerle })
  }

  // Dosyalari Storage'a yukle + efatura_faturalar tablosuna yaz.
  // 2.7.442: Dosyalar PARALEL islenir (6 isci) — 200 dosyalik sorgu
  // sirali islemede ~10 dk surerken ~2 dk'ya iner. HTML'ler (resmi GIB
  // e-Belge gorusu) XML/PDF'ler bittikten SONRA islenir: ayni uuid'li
  // XML satirina html_url olarak eklenir (paralelde yarisa girmesin).
  durum('yukleniyor')
  const satirlar = {}
  // Coklu KDV parcalari (uuid -> [{oran,matrah,kdv}]) — upsert sonrasi detay tablosuna yazilir
  const kdvParcaMap = {}
  const dosyaDurumlari = []
  const yilKlasoru = yil || new Date().getFullYear()
  const htmlOlmayan = yeniDosyalar.filter(d => !/\.html?$/i.test(d.ad))
  const htmlDosyalari = yeniDosyalar.filter(d => /\.html?$/i.test(d.ad))

  const dosyaIsle = async (d) => {
    const kayit = { ad: d.ad, tur: '', boyut: d.boyut || 0, luca: null, mubis: false, faturaNo: '', unvan: '', uuid: '', hata: '' }
    try {
      const ad = d.ad
      const ext = /\.html?$/i.test(ad) ? 'html' : (/\.xlsx?$/i.test(ad) ? 'xlsx' : (/\.xml$/i.test(ad) ? 'xml' : 'pdf'))
      kayit.tur = ext
      const blob = await gibDosyaGetir(ad, etkilenenKaynak)
      const temel = ad.replace(/\.(pdf|xml|xlsx|xls|html?)$/i, '')

      if (ext === 'html') {
        // Resmi e-Belge HTML'i: uuid'den eslesen satira html_url yaz
        const uuidH = uuidAdlandan(temel)
        kayit.uuid = uuidH
        const mevcutSatir = satirlar[uuidH]
        const yonH = mevcutSatir?.yon || yonTespitEt(ad, null, yon)
        const dosyaAdiH = `${yonH}_${uuidH}.html`
        const dosyaH = new File([blob], dosyaAdiH, { type: 'text/html' })
        const up = await uploadClientFile({ client, relPath: `faturalar/${yilKlasoru}/${dosyaAdiH}`, file: dosyaH })
        if (mevcutSatir) mevcutSatir.html_url = up.url
        else satirlar[uuidH] = {
          client_id: client.id, yon: yonTespitEt(ad, null, yon),
          tur: ['efatura', 'earsiv'].includes(String(sorguTip)) ? sorguTip : (sorguTip || 'efatura'),
          fatura_turu: '', fatura_uuid: uuidH, fatura_no: '', tarih: null,
          karsi_vkn: '', karsi_unvan: '', tutar: null, matrah: null, kdv: null,
          para_birimi: 'TRY', pdf_url: '', xml_url: '', html_url: up.url,
          sorgu_ts: new Date().toISOString()
        }
        kayit.mubis = true
        return kayit
      }

      let meta = null
      if (ext === 'xml') {
        try {
          // 2.7.385: sorgu yonu ('satis'/'alis') da gecilir — musteri VKN'si
          // XML'de eslesmese bile kullanici secimi ESAS alinir (Luca satis
          // sorgusunda musteri saticidir; aksi halde tum satirlar 'gelen'
          // yazilip Kesilen listesi bos kaliyordu).
          meta = faturaMetadatasiXml(await blob.text(), client.vkn || client.tc || '', yon)
        } catch (e) {
          console.warn('XML okunamadi:', ad, e)
        }
      } else if (ext === 'pdf') {
        try {
          // 2.7.395: XML olmayan PDF'lerden de fatura no/unvan/tarih cikar
          meta = await faturaMetadatasiPdf(blob, client.vkn || client.tc || '', yon)
        } catch (e) {
          console.warn('PDF meta okunamadi:', ad, e)
        }
      }

      // 2.7.384: uuid cikarimi uuidAdlandan ile — eski benzersiz adlandirma
      // uuid'i sildigi icin pdf'ler metasiz bos kayit oluyordu
      // 2.7.385: anahtar kucuk harfe indirgenir (XML meta + dosya adi ayni tabana)
      const uuid = (meta?.uuid || uuidAdlandan(temel) || temel).replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()
      kayit.uuid = uuid
      // 2.7.161: meta yon veremezse dosya adi/sorgulanan yon kullanilir
      // 2.8.55: VKN ESLESMESI HER SEYDEN ONCE GELIR. Fatura iki tarafi da
      // biliniyorsa yon yalnizca bundan belirlenir; klasor adi ("satis") veya
      // sorgu yonu yanlissa fatura ters sekmeye (Kesilen <-> Alinan) dusuyor
      // ve "Karsi Taraf" olarak yanlis taraf yaziliyordu.
      const mvEsas = String(client.vkn || client.tc || '').replace(/\s/g, '')
      const sVkn = String(meta?.saticiVkn || '').replace(/\s/g, '')
      const aVkn = String(meta?.aliciVkn || '').replace(/\s/g, '')
      let faturaYon = yonTespitEt(ad, meta?.yon, yon)
      if (mvEsas && sVkn && aVkn) {
        if (sVkn === mvEsas && aVkn !== mvEsas) faturaYon = 'giden'
        else if (aVkn === mvEsas && sVkn !== mvEsas) faturaYon = 'gelen'
      } else if (mvEsas && sVkn && sVkn === mvEsas) {
        faturaYon = 'giden'
      } else if (mvEsas && aVkn && aVkn === mvEsas) {
        faturaYon = 'gelen'
      }
      // XML meta turu veremezse secilen sorgu turu kullanilir (esmm/utts dahil)
      const tur = meta?.tur || (['efatura', 'earsiv'].includes(String(sorguTip)) ? sorguTip : (sorguTip || 'efatura'))
      const dosyaAdi = `${faturaYon}_${uuid}.${ext}`
      const dosya = new File([blob], dosyaAdi, {
        type: ext === 'xml' ? 'application/xml'
          : ext === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf'
      })

      let url = ''
      try {
        const up = await uploadClientFile({ client, relPath: `faturalar/${yilKlasoru}/${dosyaAdi}`, file: dosya })
        url = up.url
      } catch (e) {
        console.warn('Storage yukleme basarisiz:', ad, e)
        kayit.hata = 'Buluta yüklenemedi'
        return kayit
      }

      const onceki = satirlar[uuid] || {}
      // 2.8.51: KARSI TARAF, KESIN YONE (faturaYon) gore secilir.
      // meta.yon, sorgu yonu 'hepsi' geldiginde 'gelen'e dusebiliyor ve kesilen
      // (satis) faturalarda karsi taraf olarak SATICI — yani musterinin kendi
      // unvani — yaziliyordu. Artik iki taraf da meta'dan alinip yon ile
      // eslestiriliyor: giden -> ALICI, gelen -> SATICI.
      const mv = String(client.vkn || client.tc || '').replace(/\s/g, '')
      // 2.8.52: unvan karsilastirmasi noktalama/bicim farklarina dayanikli
      // (örn. "ELEKTRO-AK LTD. ŞTİ." ile "ELEKTRO AK" ayni kisi sayilir).
      const sadeles = (s) => String(s || '')
        .toLocaleUpperCase('tr')
        .replace(/[İI]/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G')
        .replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C')
        .replace(/[^A-Z0-9]/g, '')
      const ayniKisi = (vkn, unvan) => {
        const v = String(vkn || '').replace(/\s/g, '')
        if (mv && v && v === mv) return true
        const u = sadeles(unvan)
        const ad = sadeles(client.name || client.company || '')
        if (!u || !ad) return false
        if (u === ad) return true
        // biri digerini iceriyorsa ve ilk 8 karakter ayniysa ayni kisi kabul et
        return (u.includes(ad) || ad.includes(u)) && u.slice(0, 8) === ad.slice(0, 8)
      }
      const metaKarsiVkn = faturaYon === 'giden'
        ? (meta?.aliciVkn || '')
        : (meta?.saticiVkn || '')
      const metaKarsiUnvan = faturaYon === 'giden'
        ? (meta?.aliciUnvan || '')
        : (meta?.saticiUnvan || '')
      // Meta'da iki taraf yoksa (eski/bozuk kayit) mevcut karsi alanlari koru;
      // ama o alan musterinin KENDISI ise yazma.
      const yedekKarsiUnvan = meta?.karsiUnvan || ''
      const karsiUnvanSec = metaKarsiUnvan
        || (ayniKisi(metaKarsiVkn, yedekKarsiUnvan) ? '' : yedekKarsiUnvan)
      const karsiVknSec = metaKarsiVkn || (ayniKisi(metaKarsiVkn, yedekKarsiUnvan) ? '' : (meta?.karsiVkn || ''))
      const pdfMi = ext === 'pdf'
      satirlar[uuid] = {
        client_id: client.id,
        yon: faturaYon,
        tur,
        fatura_turu: pdfMi ? (meta?.faturaTuru || onceki.fatura_turu || '') : (meta?.faturaTuru || ''),
        fatura_uuid: uuid,
        fatura_no: pdfMi ? (onceki.fatura_no || meta?.faturaNo || '') : (meta?.faturaNo || onceki.fatura_no || ''),
        tarih: pdfMi ? (onceki.tarih || meta?.tarih || null) : (meta?.tarih || onceki.tarih || null),
        karsi_vkn: karsiVknSec || onceki.karsi_vkn || '',
        karsi_unvan: karsiUnvanSec || onceki.karsi_unvan || '',
        tutar: pdfMi ? (onceki.tutar ?? meta?.tutar ?? null) : (meta?.tutar ?? onceki.tutar ?? null),
        matrah: pdfMi ? (onceki.matrah ?? meta?.matrah ?? null) : (meta?.matrah ?? onceki.matrah ?? null),
        kdv: pdfMi ? (onceki.kdv ?? meta?.kdv ?? null) : (meta?.kdv ?? onceki.kdv ?? null),
        para_birimi: pdfMi ? (onceki.para_birimi || meta?.paraBirimi || 'TRY') : (meta?.paraBirimi || onceki.para_birimi || 'TRY'),
        doviz_kur: pdfMi ? (onceki.doviz_kur ?? meta?.dovizKur ?? null) : (meta?.dovizKur ?? onceki.doviz_kur ?? null),
        pdf_url: ext === 'pdf' ? url : (onceki.pdf_url || ''),
        xml_url: (ext === 'xml' || ext === 'xlsx') ? url : (onceki.xml_url || ''),
        html_url: onceki.html_url || '',
        sorgu_ts: new Date().toISOString()
      }
      kayit.mubis = true
      kayit.faturaNo = satirlar[uuid].fatura_no || ''
      kayit.unvan = satirlar[uuid].karsi_unvan || ''
      if (!pdfMi && meta?.kdvParcalari?.length >= 1) kdvParcaMap[uuid] = meta.kdvParcalari
      return kayit
    } catch (e) {
      console.warn('Fatura dosyasi islenemedi:', d.ad, e)
      kayit.hata = (e?.message || 'islenemedi').slice(0, 120)
      return kayit
    }
  }

  // Paralel isci havuzu: siradaki dosyayi bos isciye ver
  // 2.7.467: zaten yuklu dosyalar (ayni uuid, ayni tur+yon) kuyruga girmez
  const ISCI_SAYISI = 6
  const atlanacaklar = htmlOlmayan.filter(d => dosyaZatenYuklu(d.ad))
  atlananDosya += atlanacaklar.length
  const islenecekler = htmlOlmayan.filter(d => !dosyaZatenYuklu(d.ad))
  const atlananHtml = htmlDosyalari.filter(d => dosyaZatenYuklu(d.ad))
  atlananDosya += atlananHtml.length
  const islenecekHtml = htmlDosyalari.filter(d => !dosyaZatenYuklu(d.ad))
  if (atlananDosya) durum(`once-yuklu-atlandi (${atlananDosya})`)
  const kuyruk = [...islenecekler]
  const isciSonuclari = []
  const toplamDosya = islenecekler.length + islenecekHtml.length
  let islenenDosya = 0
  const dosyaBitti = () => {
    islenenDosya++
    // yukleme asamasi: %30 -> %95 araligi
    ilerle('yukleme', 30 + 65 * islenenDosya / Math.max(1, toplamDosya), { islenen: islenenDosya, toplam: toplamDosya })
  }
  ilerle('yukleme', 30, { islenen: 0, toplam: toplamDosya })
  await Promise.all(Array.from({ length: Math.min(ISCI_SAYISI, kuyruk.length) }, async () => {
    for (; ;) {
      const d = kuyruk.shift()
      if (!d) return
      isciSonuclari.push(await dosyaIsle(d))
      dosyaBitti()
    }
  }))
  // HTML'ler en son (sirali, az sayida): uuid eslesmesi tamamlanmis satirlarla
  for (const d of islenecekHtml) {
    isciSonuclari.push(await dosyaIsle(d))
    dosyaBitti()
  }
  dosyaDurumlari.push(...isciSonuclari)

  const kayitlar = Object.values(satirlar).filter(r => r.pdf_url || r.xml_url || r.html_url)
  if (kayitlar.length) {
    ilerle('kayit', 95, { islenen: islenenDosya, toplam: toplamDosya })
    // 2.7.385: upsert (merge-duplicates) tum alanlari EZER — parcali
    // sorgularda bir onceki parcanin gec gelen PDF'i (metasiz) dolu bir
    // kaydin ustune yazilirsa tarih/no/unvan SIFIRLANIRDI. Mevcut
    // kayitlari okuyup bos alanlari dolduruyoruz; dolu alanlar korunur.
    try {
      const uuidListesi = [...new Set(kayitlar.map(r => r.fatura_uuid))]
      const mevcutMap = new Map()
      for (let i = 0; i < uuidListesi.length; i += 150) {
        const { data: mevcut } = await supabase
          .from('efatura_faturalar')
          .select('yon,tur,fatura_uuid,fatura_no,tarih,karsi_vkn,karsi_unvan,tutar,matrah,kdv,para_birimi,pdf_url,xml_url,html_url')
          .eq('client_id', client.id)
          .in('fatura_uuid', uuidListesi.slice(i, i + 150))
        ;(mevcut || []).forEach(m => mevcutMap.set(`${m.yon}|${m.tur}|${m.fatura_uuid}`, m))
      }
      for (const r of kayitlar) {
        const m = mevcutMap.get(`${r.yon}|${r.tur}|${r.fatura_uuid}`)
        if (!m) continue
        r.fatura_no = r.fatura_no || m.fatura_no || ''
        r.tarih = r.tarih || m.tarih || null
        r.karsi_vkn = r.karsi_vkn || m.karsi_vkn || ''
        r.karsi_unvan = r.karsi_unvan || m.karsi_unvan || ''
        r.tutar = r.tutar ?? m.tutar ?? null
        r.matrah = r.matrah ?? m.matrah ?? null
        r.kdv = r.kdv ?? m.kdv ?? null
        r.para_birimi = r.para_birimi || m.para_birimi || 'TRY'
        r.pdf_url = r.pdf_url || m.pdf_url || ''
        r.xml_url = r.xml_url || m.xml_url || ''
        r.html_url = r.html_url || m.html_url || ''
      }
    } catch (e) { console.warn('Mevcut fatura kayitlari birlestirilemedi:', e) }
    const { error } = await supabase
      .from('efatura_faturalar')
      .upsert(kayitlar, { onConflict: 'client_id,yon,tur,fatura_uuid' })
    if (error) {
      console.warn('Fatura kayitlari yazilamadi:', error.message)
      return { ok: false, sayi: 0, not: 'Fatura kayitlari buluta yazilamadi: ' + (error.message || 'bilinmeyen hata') }
    }
    await kdvDetayKaydet(client.id, kdvParcaMap)
    // 2.7.384: uuid'i bozuk eski kayitlari temizle — yardimcinin eski
    // benzersiz adlandirmasi dosya adindaki uuid'i sildigi icin pdf'ler
    // metasiz (tarih/no/unvan/tutar bos) kayit olmustu; gercek uuid'li
    // kayitlar upsert ile yazildigi icin bunlar artik cop satirdir.
    try {
      const uuidDesen = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const { data: boslar } = await supabase
        .from('efatura_faturalar')
        .select('id,fatura_uuid,pdf_url,xml_url,html_url')
        .eq('client_id', client.id)
        .eq('fatura_no', '')
        .is('tarih', null)
        .eq('karsi_unvan', '')
      // 2.7.385: bozuk uuid'li kayitlarin YANINDA metadata'siz PDF-only
      // kayitlar da (xml/html'siz) cop sayilir — bunlar zip/serbest PDF
      // yuklemelerinden kalan yarim kayitlardir ve listeye bos satir
      // olarak duser; gercek veri tekrar sorgulamayla gelir.
      const copler = (boslar || []).filter(r =>
        !uuidDesen.test(String(r.fatura_uuid || '')) ||
        (!r.xml_url && !r.html_url)
      ).map(r => r.id)
      if (copler.length) {
        await supabase.from('efatura_faturalar').delete().in('id', copler)
        console.log('Bozuk uuidli bos fatura kayitlari silindi:', copler.length)
      }
    } catch (e) { console.warn('Bos kayit temizligi atlandi:', e) }
  }

  // 2.7.442: Luca tarafindaki kopya durumu — yardimcinin son sorguda
  // EDEFTER (Luca aktarim) klasorune kopyaladigi dosyalarla karsilastirilir.
  const edtBilgi = await gibEdtSonKopya(yardimciKaynak)
  if (edtBilgi) {
    const edtSet = new Set(edtBilgi.dosyalar.map(a => String(a).toLowerCase()))
    for (const k of dosyaDurumlari) k.luca = edtSet.has(String(k.ad).toLowerCase())
  }

  const basarisizDosyalar = dosyaDurumlari.filter(d => d.hata)
  if (basarisizDosyalar.length && !kayitlar.length) {
    return { ok: false, sayi: 0, not: `${basarisizDosyalar.length} dosya yüklenemedi: ${basarisizDosyalar[0].hata}`, dosyalar: dosyaDurumlari }
  }
  const kdv2Aylar = await kdv2AktifEtGerekirse(client, kayitlar)
  ilerle('bitti', 100, { islenen: islenenDosya, toplam: toplamDosya })
  return {
    ok: true,
    sayi: kayitlar.length,
    not: notOnEk + kdv2Notu(kdv2Aylar) + (atlananDosya ? ` (önceden yüklü ${atlananDosya} dosya atlandı, tekrar yüklenmedi)` : '') + (basarisizDosyalar.length ? ` (${basarisizDosyalar.length} dosya yüklenemedi)` : ''),
    dosyalar: dosyaDurumlari,
    atlandi: atlananDosya,
    lucaBilgi: edtBilgi ? { dosyaSayisi: edtBilgi.dosyalar.length } : null
  }
}

// 2.7.460: MUBiS yuklemesi biten dosyalarini tek komutla EDEFTER klasorune
// (<kok>\<musteri>\<yil>\<ay>\GELEN|GIDEN) toplu kopyalar. Yardimci islemi:
// 'edefter-kopyala'. Donus: { ok, kopya, toplam, atlanan, hedef }
export async function edefterTopluKopyala({ client, yil, ay, yon = 'alis', dosyalar = [], yardimciKaynak = 'otomatik' }) {
  if (!client?.id) throw new Error('Musteri secili degil')
  if (!dosyalar.length) return { ok: true, kopya: 0, toplam: 0, not: 'kopyalanacak dosya yok' }
  // 2.7.193: adminin ayarladigi FATURA gelen/giden klasorleri
  let edefterKok = ''
  try {
    const kl = await kayitKlasorleriGetir()
    edefterKok = String(yon).toLocaleLowerCase('tr') === 'satis'
      ? (kl.faturaGidenKlasoru || '')
      : (kl.faturaGelenKlasoru || '')
  } catch { edefterKok = '' }
  const sonuc = await (yardimciKaynak === 'yerel' ? yardimciIsYerel : yardimciIsSunucu)('edefter-kopyala', {
    shortName: client.shortName || client.name || '',
    fullName: client.name || client.company || '',
    yil: String(yil || ''),
    ay: String(ay || ''),
    yon: String(yon || 'alis'),
    edefterKok,
    dosyalar: dosyalar.map(d => (typeof d === 'string' ? d : d.ad)).filter(Boolean)
  }, 5 * 60 * 1000)
  // 2.8.322: Sorgu VPS'te calisirken EDEFTER klasoru kullanicinin
  // bilgisayarindadir; VPS Windows surucu yolunu cozumleyemez ve yardimci
  // "hedef klasor hesaplanamadi" doner. Belgeler zaten MUBiS'e kaydedildigi
  // icin bu durum HATA degildir - kullaniciya kopyalama atlandi bilgisi verilir.
  if (sonuc && sonuc.ok === false && /hedef klasor hesaplanamadi/i.test(String(sonuc.error || ''))) {
    return {
      ...sonuc,
      ok: true,
      kopya: 0,
      atlandi: true,
      not: 'EDEFTER klasörü bu makinede tanımlı değil (sorgu sunucuda çalıştı); belgeler MUBiS’e kaydedildi, klasöre kopyalama atlandı.'
    }
  }
  return sonuc
}

// Yardimci programin "indirilenler" klasorundeki TUM pdf/xml dosyalarini
// Storage'a aktarir + efatura_faturalar tablosuna yazar. Sorgulama akisinin
// disinda kalan dosyalar icin (sonradan cikarilan zip'ler, yarim kalan
// yuklemeler) kullanilir. Mevcut kayitlar upsert ile zarar gormez.
export async function klasordekiFaturalariAktar({ client, yil, onDurum }) {
  const durum = (m) => { try { onDurum?.(m) } catch { /* yoksay */ } }
  if (!client?.id) throw new Error('Musteri secili degil')
  const tumDosyalar = await gibDosyalariListele()
  const faturaDosyalari = (tumDosyalar || []).filter(d => /\.(pdf|xml|xlsx|xls|html?)$/i.test(d.ad))
  if (!faturaDosyalari.length) return { ok: true, sayi: 0, not: 'Klasorde fatura dosyasi yok.' }

  // Zaten kayitli UUID'leri atla (tekrar yuklemeyi onler); html bagli mi
  // bilgisini de tut (html'si eksik kayitlara sonradan eklenebilir)
  durum('mevcut kayitlar okunuyor')
  const mevcut = new Set()
  const htmlOlanlar = new Set()
  const uuidYon = new Map()
  try {
    const { data } = await supabase.from('efatura_faturalar').select('fatura_uuid,yon,tur,html_url').eq('client_id', client.id)
    ;(data || []).forEach(r => {
      mevcut.add(`${r.yon}|${r.tur}|${r.fatura_uuid}`)
      if (r.html_url) htmlOlanlar.add(r.fatura_uuid)
      uuidYon.set(r.fatura_uuid, r.yon)
    })
  } catch { /* yoksay — hepsini isler */ }

  durum(`${faturaDosyalari.length} dosya bulundu, aktariliyor`)
  const yilKlasoru = yil || new Date().getFullYear()
  const satirlar = {}
  // Coklu KDV parcalari (uuid -> [{oran,matrah,kdv}]) — upsert sonrasi detay tablosuna yazilir
  const kdvParcaMap = {}
  let islenen = 0
  let htmlEklenen = 0
  // Once pdf/xml/xlsx (kayit olusturur), sonra html (kayitlara baglanir)
  const sirali = [
    ...faturaDosyalari.filter(d => !/\.html?$/i.test(d.ad)),
    ...faturaDosyalari.filter(d => /\.html?$/i.test(d.ad))
  ]
  for (const d of sirali) {
    islenen++
    if (islenen % 20 === 0) durum(`aktariliyor: ${islenen}/${faturaDosyalari.length}`)
    try {
      const ad = d.ad
      const temel = ad.replace(/\.(pdf|xml|xlsx|xls|html?)$/i, '')
      // Dosya adindaki uuid (Luca "<uuid>#<vkn>.xml" / "<uuid>_f.html" yapisindan)
      const temelUuid = uuidAdlandan(temel)
      const ext = /\.html?$/i.test(ad) ? 'html' : (/\.xlsx?$/i.test(ad) ? 'xlsx' : (/\.xml$/i.test(ad) ? 'xml' : 'pdf'))
      const blob = await gibDosyaGetir(ad)

      if (ext === 'html') {
        // Resmi e-Belge HTML'i: ayni uuid'li kayita html_url yaz
        if (htmlOlanlar.has(temelUuid)) continue
        const yonH = satirlar[temelUuid]?.yon || uuidYon.get(temelUuid) || yonTespitEt(ad, null, null)
        const dosyaAdiH = `${yonH}_${temelUuid}.html`
        const dosyaH = new File([blob], dosyaAdiH, { type: 'text/html' })
        let urlH = ''
        try {
          const up = await uploadClientFile({ client, relPath: `faturalar/${yilKlasoru}/${dosyaAdiH}`, file: dosyaH })
          urlH = up.url
        } catch (e) { console.warn('HTML yukleme basarisiz:', ad, e); continue }
        if (satirlar[temelUuid]) {
          satirlar[temelUuid].html_url = urlH
        } else {
          // Bu batch'te xml'i yok ama DB'de kayit olabilir -> uuid ile bul.
          // UUID fatura basina tektir: secili musterinin kaydi yoksa baska
          // musterinin kaydina da baglanabilir (buyuk kucuk harf duyarsiz).
          const { data: row } = await supabase
            .from('efatura_faturalar')
            .select('id')
            .eq('client_id', client.id)
            .eq('fatura_uuid', temelUuid)
            .maybeSingle()
            let kayit = row
          if (!kayit) {
            const { data: row2 } = await supabase
              .from('efatura_faturalar')
              .select('id')
              .ilike('fatura_uuid', temelUuid)
              .limit(1)
            kayit = row2?.[0] || null
          }
          if (kayit) {
            await supabase.from('efatura_faturalar').update({ html_url: urlH }).eq('id', kayit.id)
            htmlEklenen++
          }
        }
        continue
      }

      let meta = null
      if (ext === 'xml') {
        try { meta = faturaMetadatasiXml(await blob.text(), client.vkn || client.tc || '') } catch { /* meta yoksa uuid ile devam */ }
      }
      const uuid = meta?.uuid || temelUuid
      const yon = yonTespitEt(ad, meta?.yon, null)
      const tur = meta?.tur || (String(ad).toLowerCase().includes('earsiv') ? 'earsiv' : 'efatura')
      const anahtar = `${yon}|${tur}|${uuid}`
      if (mevcut.has(anahtar)) continue
      const dosyaAdi = `${yon}_${uuid}.${ext}`
      const dosya = new File([blob], dosyaAdi, {
        type: ext === 'xml' ? 'application/xml'
          : ext === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf'
      })
      let url = ''
      try {
        const up = await uploadClientFile({ client, relPath: `faturalar/${yilKlasoru}/${dosyaAdi}`, file: dosya })
        url = up.url
      } catch (e) { console.warn('Storage yukleme basarisiz:', ad, e); continue }
      const onceki = satirlar[uuid] || {}
      satirlar[uuid] = {
        client_id: client.id,
        yon,
        tur,
        fatura_turu: meta?.faturaTuru || onceki.fatura_turu || '',
        fatura_uuid: uuid,
        fatura_no: meta?.faturaNo || onceki.fatura_no || '',
        tarih: meta?.tarih || onceki.tarih || null,
        karsi_vkn: meta?.karsiVkn || onceki.karsi_vkn || '',
        karsi_unvan: meta?.karsiUnvan || onceki.karsi_unvan || '',
        tutar: meta?.tutar ?? onceki.tutar ?? null,
        matrah: meta?.matrah ?? onceki.matrah ?? null,
        kdv: meta?.kdv ?? onceki.kdv ?? null,
        para_birimi: meta?.paraBirimi || onceki.para_birimi || 'TRY',
        doviz_kur: meta?.dovizKur ?? onceki.doviz_kur ?? null,
        pdf_url: ext === 'pdf' ? url : (onceki.pdf_url || ''),
        xml_url: (ext === 'xml' || ext === 'xlsx') ? url : (onceki.xml_url || ''),
        html_url: onceki.html_url || '',
        sorgu_ts: new Date().toISOString()
      }
      if ((ext === 'xml' || ext === 'xlsx') && meta?.kdvParcalari?.length >= 1) kdvParcaMap[uuid] = meta.kdvParcalari
      mevcut.add(anahtar)
    } catch (e) {
      console.warn('Dosya aktarilamadi:', d.ad, e)
    }
  }
  const kayitlar = Object.values(satirlar).filter(r => r.pdf_url || r.xml_url || r.html_url)
  if (!kayitlar.length && !htmlEklenen) return { ok: true, sayi: 0, not: 'Yeni aktarilacak dosya yok (hepsi zaten kayitli).' }
  if (kayitlar.length) {
    durum(`${kayitlar.length} kayit yaziliyor`)
    const { error } = await supabase
      .from('efatura_faturalar')
      .upsert(kayitlar, { onConflict: 'client_id,yon,tur,fatura_uuid' })
    if (error) return { ok: false, sayi: 0, not: 'Fatura kayitlari buluta yazilamadi: ' + (error.message || '') }
    await kdvDetayKaydet(client.id, kdvParcaMap)
  }
  const kdv2Aylar = await kdv2AktifEtGerekirse(client, kayitlar)
  return { ok: true, sayi: kayitlar.length, not: (htmlEklenen ? `${htmlEklenen} faturaya e-Belge HTML'i eklendi.` : '') + kdv2Notu(kdv2Aylar) }
}

// Manuel yükleme: kullanıcının seçtiği zip/xlsx/pdf/xml/html dosyalarını
// Storage'a aktarır + efatura_faturalar tablosuna yazar. ZIP içeriği JSZip
// ile tarayıcıda açılır; yardımcı program sorgusu gerekmez. Mevcut kayıtlar
// upsert ile zarar görmez; aynı uuid tekrar yüklenmez.

// ---- e-SMM (e-Serbest Meslek Makbuzu) PDF ayrıştırma ----
// GİB e-SMM makbuz PDF'leri metin tabanlıdır; tarih/no/tutarlar sabit
// etiketlerle gelir. Bu etiketlerden alanları çıkarır.
const trSayi = (s) => {
  if (!s) return null
  const t = String(s).replace(/\s/g, '')
  if (!/[\d]/.test(t)) return null
  // Turkce bicim: nokta binlik ayraci, virgul ondalik ("18.000,50" -> 18000.5;
  // "18.000" -> 18000)
  const n = t.includes(',')
    ? Number(t.replace(/\./g, '').replace(',', '.'))
    : Number(t.replace(/\./g, ''))
  return isFinite(n) ? n : null
}

const tarTsdn = (d) => {
  const m = String(d || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null
}

const esmmPdfAyikla = (metin) => {
  const m = metin.replace(/\s+/g, ' ')
  if (!/e-?\s*Serbest\s+Meslek\s+Makbuzu/i.test(m)) return null
  const ayikla = (etiket) => {
    const r = m.match(new RegExp(etiket + '\\s*[:：]?\\s*(-?[\\d.]+(?:,\\d+)?|\\d+(?:,\\d+)?)', 'i'))
    return r ? trSayi(r[1]) : null
  }
  const noR = m.match(/Belge\s*Numaras\S*\s*[:：]?\s*([A-Za-z]*\d{6,})/i)
  const tarR = m.match(/Düzenlenme\s*Tarihi\s*[:：]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)
  const stopaj = ayikla('G\\.?\\s*V\\.?\\s*Stopaj\\s*Tutarı')
  const tevkifat = ayikla('KDV\\s*Tevkifat\\s*Tutarı')
  const kdv = ayikla('Tahsil\\s*Edilen\\s*KDV\\s*Tutarı') || ayikla('KDV\\s*Tutarı(?!\\s*Tevkifat)')
  const matrah = ayikla('Brüt\\s*Ücret') || ayikla('Brut\\s*Ucret')
  const toplam = ayikla('Net\\s*Alınan\\s*Toplam') || ayikla('Net\\s*Alinan\\s*Toplam')
  // Duzenleyen/alici bloklari: "ALICI" kelimesi dipnotta da gectigi icin
  // Buyuk harf "ALICI BİLGİLERİ" basligi tercih edilir.
  const duzenleyenIdx = m.search(/DÜZENLEYEN/)
  const aliciIdx = m.indexOf('ALICI BİLGİLERİ')
  const duzenleyen = duzenleyenIdx >= 0 ? m.slice(duzenleyenIdx, aliciIdx > 0 ? aliciIdx : duzenleyenIdx + 400) : ''
  const alici = aliciIdx >= 0 ? m.slice(aliciIdx, aliciIdx + 500) : ''
  const noAl = (blok) => {
    const eslesen = [...blok.matchAll(/(?:TCKN|VKN)\s*[:：]?\s*(\d{10,11})/gi)]
    return eslesen.length ? eslesen[eslesen.length - 1][1] : ''
  }
  // Unvan: sirket soneki varsa oraya kadar; yoksa adres anahtar kelimesinde kes.
  // Kesme buyuk/kucuk harf duyarsizdir (PDF'lerde CAD/MAH/SOKAK buyuk harfle
  // yazilabiliyor). Mahalle turu kesmede unvan sonundaki tek kelime mahalle
  // adidir ("SAMİ KOYUNCU MECIDIYE MAH..." -> "SAMİ KOYUNCU") ve kirpilir.
  const unvanAl = (blok) => {
    let b = blok
      .replace(/^DÜZENLEYEN\s*/i, '')
      .replace(/^ALICI\s*BİLGİLERİ\s*/, '')
      .replace(/^ALICI\s*/, '')
    const sonEk = b.match(/^([\s\S]*?(?:LİMİTED\s*(?:ŞİRKETİ|SIRKETI|ŞTİ\.?|STI\.?)|LTD\.?\s*ŞTİ\.?|ANONİM\s*(?:ŞİRKETİ|SIRKETI)|A\.Ş\.|A\.S\.|VE\s+ORT\.|ORT\.))/i)
    if (sonEk) return sonEk[1].replace(/\s+/g, ' ').trim()
    const kesM = b.match(/^([\s\S]*?)(?=\s+(?:Mah\.?\b|MAH\b|Mh\.?\b|Sok\.?\b|SOKAK\b|Sokak\b|Sk\.?\b|SK\b|SOK\b|Cad\.?\b|C\.?\b|Bul\.?\b|Bulvar\b|Kapı\b|Kapi\b|Kapı\b|Yolu\b|YOLU\b|No\.?\b|NO\b|Türkiye\b|TURKIYE\b|TR\b|\d{5}\b|İSTANBUL\b|ISTANBUL\b|İST\b|ANKARA\b|İZMİR\b|IZMIR\b|BURSA\b|ANTALYA\b|ADANA\b|KONYA\b|KOCAELİ\b|SAMSUN\b|TRABZON\b|GAZİANTEP\b|KAYSERİ\b|ESKİŞEHİR\b|MALATYA\b|DENİZLİ\b|MUĞLA\b|AYDIN\b|TEKİRDAĞ\b))/i)
    let aday = kesM ? kesM[1] : b
    if (kesM) {
      const anahtar = b.slice(kesM[1].length).trim().match(/^\S+/)?.[0] || ''
      if (/^mah\.?|^mh\.?/i.test(anahtar)) {
        const kelimeler = aday.trim().split(/\s+/)
        if (kelimeler.length >= 3) aday = kelimeler.slice(0, -1).join(' ')
      }
    }
    return aday.replace(/\s+/g, ' ').trim()
  }
  const duzNo = noAl(duzenleyen)
  const aliciNo = noAl(alici)
  return {
    esmm: true,
    fatura_no: noR ? noR[1] : '',
    tarih: tarR ? tarTsdn(tarR[1]) : null,
    matrah, kdv, stopaj: stopaj ?? 0, tevkifat: tevkifat ?? 0, toplam,
    duzenleyenNo: duzNo,
    duzenleyenUnvan: unvanAl(duzenleyen),
    aliciNo,
    aliciUnvan: unvanAl(alici)
  }
}

// PDF metninden temel fatura meta bilgilerini cikarir (XML yokken yedek).
// Yon bilgisi disaridan verilir; verilmezse musteri VKN'si karsilastirmasi yapilir.
export async function faturaMetadatasiPdf(blob, musteriVkn = '', yon = '') {
  try {
    const metin = await pdfMetinOku(blob)
    const m = metin.replace(/\s+/g, ' ')
    // Fatura no: once açık etiketler.
    // 2.7.461: "Fatura Numarası" ÖNCE denenir (Numaras[iı] Türkçe ı dahil);
    // "Fatura No" kalibi (?!t) ile "Fatura Notu"na yakalanmayacak — not kelimesinin
    // "tu"su fatura_no olarak yaziliyordu.
    // Guvenlik: yakalanan degerde en az 4 basamak art arda olmali — "2.1" gibi
    // tablo/etiket artiklari fatura_no olarak yazilmaz, siradaki desen denenir.
    const noDesenler = [
      /Fatura\s*Numaras[iı]\s*[:：]?\s*([A-Za-z0-9]+)/i,
      /Belge\s*Numaras[iı]\s*[:：]?\s*([A-Za-z0-9]+)/i,
      /Fatura\s*S[ıi]ra\s*No\s*[:：]?\s*([A-Za-z0-9]+)/i,
      /Fatura\s*No(?!t)\s*[:：]?\s*([A-Za-z0-9]+)/i,
      /Belge\s*No(?!t)\s*[:：]?\s*([A-Za-z0-9]+)/i
    ]
    let noDeger = ''
    for (const rx of noDesenler) {
      const mm = m.match(rx)
      if (mm && /\d{4,}/.test(mm[1])) { noDeger = mm[1]; break }
    }
    // 2.7.461: Fatura tipi PDF metninden de okunur ("Fatura Tipi SATIS/IADE") —
    // XML'in islenmedigi satirlarda Fatura Türü bos ('-') kaliyordu.
    const tipR = m.match(/Fatura\s*Tipi\s*[:：]?\s*([A-Za-zÇĞİÖŞÜıçğöşü]+)/i)
    const faturaTuruPdf = tipR ? tipR[1].toLocaleUpperCase('tr').replace(/Ş/g, 'S').replace(/İ/g, 'I') : ''
    // Tarih: dd.mm.yyyy / dd/mm/yyyy / dd-mm-yyyy; "Tarih:" yalın etiketi de
    // (Tofaş/Otokoc e-Arşiv PDF'lerinde etiket yalın "Tarih" olarak geçer)
    const tarR = m.match(/(?:Belge|Düzenlenme)\s*Tarihi\s*[:：]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i)
      || m.match(/(?:Belge|Düzenlenme|Fatura)\s*Tarihi\s*[:：]?\s*(\d{1,2}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{4})/i)
      || m.match(/Fatura\s*Dönemi\s*[:：]?\s*(\d{1,2}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{4})/i)
      || m.match(/(?<![\wÇĞİÖŞÜıçğöşü])Tarih\s*[:：]\s*(\d{1,2}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{4})/i)
    const tarTsdn2 = (d) => {
      const mm = String(d || '').match(/(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4})/)
      return mm ? `${mm[3]}-${mm[2].padStart(2, '0')}-${mm[1].padStart(2, '0')}` : null
    }
    // Bloklar
    const duzenleyenIdx = m.search(/DÜZENLEYEN/i)
    const aliciIdx = m.search(/ALICI\s*BİLGİLERİ/i)
    const sayinIdx = m.search(/SAYIN/i)
    const duzenleyen = duzenleyenIdx >= 0 ? m.slice(duzenleyenIdx, aliciIdx > duzenleyenIdx ? aliciIdx : duzenleyenIdx + 500) : ''
    const alici = aliciIdx >= 0
      ? m.slice(aliciIdx, sayinIdx > aliciIdx ? sayinIdx : aliciIdx + 500)
      : (sayinIdx >= 0 ? m.slice(sayinIdx, sayinIdx + 500) : '')
    const noAl2 = (blok) => {
      const eslesen = [...blok.matchAll(/(?:TCKN|Vergi\s*Numarası|Vergi\s*No|VKN)\s*[:：]?\s*(\d{10,11})/gi)]
      return eslesen.length ? eslesen[eslesen.length - 1][1] : ''
    }
    const unvanAl2 = (blok) => {
      if (!blok) return ''
      let b = blok
        .replace(/^DÜZENLEYEN\s*/i, '')
        .replace(/^ALICI\s*BİLGİLERİ\s*/i, '')
        .replace(/^ALICI\s*/i, '')
        .replace(/^SAYIN\s*/i, '')
        // 2.7.469: baştaki ':'/'-' gibi noktalama ve e-posta/Not/ekstre/tel/web
        // kalıplarından sonrası ünvan DEĞİL (Otokoc ekstre PDF'lerinde
        // ":MESUT TAYDAŞ-mesutt@otokoc.com.tr ..." gibi junk yazılıyordu)
        .replace(/^[:：\-–·•\s]+/, '')
      const kesTutamlar = [...b.matchAll(/\S+@\S+\.\S+|\bNot(?:u)?\s*[:：]|\bekstre\b|\bTel\s*[:：]|\bWeb(?:\s*Sitesi)?\s*[:：]|\be-?Posta\s*[:：]?|\bVergi\s*Dairesi\s*[:：]?|\bVKN\s*[:：]/gi)]
        .map(x => x.index).filter(i => i > 0)
      if (kesTutamlar.length) b = b.slice(0, Math.min(...kesTutamlar))
      b = b.replace(/[-–]\s*\S*$/, '').trim() // e-posta kesilince kalan "-mesutt" kuyrugu
      const sonEk = b.match(/^([\s\S]*?(?:LİMİTED\s*(?:ŞİRKETİ|SIRKETI|ŞTİ\.?|STI\.?)|LTD\.?\s*ŞTİ\.?|ANONİM\s*(?:ŞİRKETİ|SIRKETI)|A\.Ş\.?|A\.S\.?|VE\s+ORT\.|ORT\.))/i)
      if (sonEk) return sonEk[1].replace(/\s+/g, ' ').trim()
      const kesM = b.match(/^([\s\S]*?)(?=\s+(?:Mah\.?\b|MAH\b|Mh\.?\b|Sok\.?\b|SOKAK\b|Sokak\b|Sk\.?\b|SK\b|SOK\b|Cad\.?\b|C\.?\b|Bul\.?\b|Bulvar\b|Kapı\b|Kapi\b|Kapı\b|Yolu\b|YOLU\b|No\.?\b|NO\b|Türkiye\b|TURKIYE\b|TÜRKIYE\b|TR\b|\d{5}\b|İSTANBUL\b|ISTANBUL\b|İST\b|ANKARA\b|İZMİR\b|IZMIR\b|BURSA\b|ANTALYA\b|ADANA\b|KONYA\b|KOCAELİ\b|SAMSUN\b|TRABZON\b|GAZİANTEP\b|KAYSERİ\b|ESKİŞEHİR\b|MALATYA\b|DENİZLİ\b|MUĞLA\b|AYDIN\b|TEKİRDAĞ\b))/i)
      let aday = kesM ? kesM[1] : b
      if (kesM) {
        const anahtar = b.slice(kesM[1].length).trim().match(/^\S+/)?.[0] || ''
        if (/^mah\.?|^mh\.?/i.test(anahtar)) {
          const kelimeler = aday.trim().split(/\s+/)
          if (kelimeler.length >= 3) aday = kelimeler.slice(0, -1).join(' ')
        }
      }
      return aday.replace(/\s+/g, ' ').trim()
    }
    // 2.7.461: cikarma basarisizsa ulke adi ('TÜRKIYE/Türkiye') unvan olarak
    // yazilmasin — bos kalsin, XML meta duzeltir.
    const temizUnvan = (u) => (/^t[uü]rk[iı]ye$/i.test(String(u || '').trim()) ? '' : String(u || '').trim())
    const duzNo = noAl2(duzenleyen)
    const aliciNo = noAl2(alici)
    const duzUnvan = unvanAl2(duzenleyen)
    const aliciUnvan = unvanAl2(alici)
    // 2.7.469: Tutarlar PDF metninden (XML yokken) — önce en güvenilir etiket:
    // Ödenecek/Vergiler Dahil Toplam → tutar; Hesaplanan KDV (KDV veya KATMA DEĞER
    // VERGİSİ yazımı, iki nokta şart olmadan) → kdv; Vergi Hariç Tutar/KDV Matrahı
    // → matrah; o da yoksa Mal Hizmet Toplam − Toplam İskonto.
    const trSayi2 = (s) => { const v = String(s || '').replace(/\./g, '').replace(',', '.'); const n = parseFloat(v); return isFinite(n) ? Math.round(n * 100) / 100 : null }
    const yuvar2 = (n) => Math.round(n * 100) / 100
    const tutarR = m.match(/Ödenecek\s*Tutar\s*[:：]?\s*([\d.,]+)/i)
      || m.match(/Vergiler\s*Dahil\s*Toplam\s*Tutar[ıi]?\s*[:：]?\s*([\d.,]+)/i)
      || m.match(/KDV\s*Dahil\s*Toplam(?:\s*Tutar)?\s*[:：]?\s*([\d.,]+)/i)
      || m.match(/Genel\s*Toplam\s*[:：]?\s*([\d.,]+)/i)
      || m.match(/Toplam\s*(?:İşlem\s*)?Tutar[ıi]?\s*[:：]?\s*([\d.,]+)/i)
    const kdvR = m.match(/KDV\s*\(\s*%\s*\d{1,2}\s*\)\s*[:：]?\s*([\d.,]+)/i)
      || m.match(/Hesaplanan\s*(?:GERÇEK\s*USULDE\s*)?(?:KDV|KATMA\s*DE[ĞG]ER\s*VERG[İI]S[İI])[^:：]*?(\d{1,3}(?:\.\d{3})*,\d{2})/i)
      || m.match(/KDV\s*Toplam[ıi]?\s*[:：]?\s*([\d.,]+)/i)
    let kdv = kdvR ? trSayi2(kdvR[1]) : null
    let matrah
    const matrahR = m.match(/Vergi\s*Hariç\s*Tutar\s*[:：]?\s*([\d.,]+)/i)
      || m.match(/KDV\s*Matrah[ıi]?[^:：]*[:：]\s*([\d.,]+)/i)
      || m.match(/KDV['’]?siz\s*Toplam\s*[:：]?\s*([\d.,]+)/i)
    if (matrahR) matrah = trSayi2(matrahR[1])
    else {
      const mhTutar = m.match(/Mal\s*Hizmet\s*Toplam\s*Tutar[ıi]?\s*[:：]?\s*([\d.,]+)/i)
      const iskonto = m.match(/Toplam\s*İskonto\s*[:：]?\s*([\d.,]+)/i)
      if (mhTutar) {
        const brt = trSayi2(mhTutar[1])
        const isk = iskonto ? trSayi2(iskonto[1]) : 0
        if (brt != null) matrah = isk ? yuvar2(brt - isk) : brt
      }
    }
    const tutar = tutarR ? trSayi2(tutarR[1]) : null
    // Üçlü tutarlılık: matrah+kdv ≈ tutar değilse ilişkilerden onar
    if (tutar != null && tutar > 0) {
      if (kdv != null && kdv >= 0 && kdv < tutar * 0.6) {
        if (matrah == null || matrah <= 0 || Math.abs(matrah + kdv - tutar) > Math.max(0.05, tutar * 0.02)) matrah = yuvar2(tutar - kdv)
      } else {
        kdv = null
        if (matrah != null && matrah > 0 && matrah < tutar) kdv = yuvar2(tutar - matrah)
        else if (matrah != null && matrah >= tutar) matrah = null
      }
    }
    const pbR = m.match(/\b(USD|EUR|GBP)\b/)
    const mv2 = String(musteriVkn || '').trim()
    // 2.8.52: Sorgu yonu 'satis'/'alis' olarak gelebilir; 'giden'/'gelen'
    // disindaki degerler ONCEDEN 'gelen' sayiliyor ve SATIS faturalarinda
    // karsi taraf olarak SATICI (musterinin kendi unvani) yaziliyordu.
    // Artik: once VKN eslesmesi, sonra normalize edilmis yon.
    const yonNorm = (() => {
      const s = String(yon || '').toLocaleLowerCase('tr')
      if (!s) return ''
      if (/giden|sati[sş]|kesilen|satilan/.test(s)) return 'giden'
      if (/gelen|ali[sş]|alinan/.test(s)) return 'gelen'
      return ''
    })()
    let yonBul = ''
    if (mv2 && duzNo && aliciNo) {
      if (duzNo === mv2 && aliciNo !== mv2) yonBul = 'giden'
      else if (aliciNo === mv2 && duzNo !== mv2) yonBul = 'gelen'
    }
    if (!yonBul) {
      if (mv2 && duzNo === mv2) yonBul = 'giden'
      else if (mv2 && aliciNo === mv2) yonBul = 'gelen'
      else yonBul = yonNorm || 'gelen'
    }
    // 2.7.469: Karşı taraf müşterinin kendisi çıktıysa (SAYIN/ALICI bloğu müşteriye
    // ait başlıksız PDF'lerde) düzenleyen tarafa bak; yine kendiyse boş bırak.
    const sonekleUnvan2 = (blok) => {
      const b = String(blok || '').replace(/\bTL\b/gi, ' ')
      const mt = b.match(/([A-ZÇĞİÖŞÜ0-9][\wÇĞİÖŞÜçğıöşü&.\-'\s]{2,70}?(?:SAN\.?\s*VE\s*T[İI]C\.[A-Z]?\.?|SAN\.?\s*VE\s*T[İI]C\.?|T[İI]C\.?\s*VE\s*SAN\.?|L[İI]M[İI]TED\s*[ŞS][İI]Rket[İI]?|LTD\.?\s*[ŞS][TİI][İI]?\.?|L[İI]M[İI]TED|ANON[İI]M\s*[ŞS][İI]Rket[İI]?|A\.[ŞS]\.?))/i)
      if (!mt) return ''
      return mt[1].replace(/^(?:\d{1,2}\s+)+/, '').replace(/\s+/g, ' ').trim()
    }
    let karsiUnvan = yonBul === 'giden' ? temizUnvan(aliciUnvan) : temizUnvan(duzUnvan)
    let karsiVkn = yonBul === 'giden' ? aliciNo : duzNo
    const kendimi2 = (v, u) => (mv2 && v && v === mv2)
    if (kendimi2(karsiVkn, karsiUnvan)) {
      const sy = sayinIdx >= 0 ? sayinIdx : aliciIdx
      if (sy > 0) {
        const onceBlok = m.slice(Math.max(0, sy - 800), sy)
        const yeniVkn = noAl2(onceBlok)
        const yeniUnvan = temizUnvan(sonekleUnvan2(onceBlok))
        if (!(mv2 && yeniVkn && yeniVkn === mv2)) { karsiVkn = yeniVkn || ''; karsiUnvan = yeniUnvan }
      } else { karsiVkn = ''; karsiUnvan = '' }
    }
    return {
      faturaNo: noDeger,
      faturaTuru: faturaTuruPdf,
      tarih: tarR ? tarTsdn2(tarR[1]) : null,
      karsiVkn: karsiVkn || '',
      karsiUnvan: karsiUnvan || '',
      // 2.8.51: iki taraf da dondurulur (XML ile ayni gerekce)
      saticiVkn: duzNo || '',
      saticiUnvan: temizUnvan(duzUnvan) || '',
      aliciVkn: aliciNo || '',
      aliciUnvan: temizUnvan(aliciUnvan) || '',
      yon: yonBul,
      matrah: matrah != null && matrah > 0 && matrah < 1e9 ? matrah : null,
      kdv: kdv != null && kdv >= 0 && kdv < 1e9 ? kdv : null,
      tutar: tutar != null && tutar > 0 && tutar < 1e9 ? tutar : null,
      paraBirimi: pbR ? pbR[1] : 'TRY',
      yon: yonBul
    }
  } catch (e) {
    console.warn('PDF meta cikarma hatasi:', e)
    return null
  }
}

// PDF metnini tarayicida cikarir (pdfjs legacy build)
export async function pdfMetinOku(kaynak) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
    pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default
  }
  const data = kaynak instanceof ArrayBuffer ? kaynak : await kaynak.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise
  let metin = ''
  for (let s = 1; s <= Math.min(pdf.numPages, 5); s++) {
    const page = await pdf.getPage(s)
    const tc = await page.getTextContent()
    metin += tc.items.map(it => it.str).join(' ') + '\n'
  }
  return metin
}

export async function manuelFaturaYukle({ client, yil, dosyalar = [], onDurum }) {
  const durum = (m) => { try { onDurum?.(m) } catch { /* yoksay */ } }
  if (!client?.id) throw new Error('Musteri secili degil')

  // ZIP'leri aç, belgeleri tek listeye topla
  const belgeler = []
  for (const d of dosyalar) {
    if (/\.zip$/i.test(d.name)) {
      durum(`${d.name} açılıyor...`)
      try {
        const JSZip = (await import('jszip')).default
        const zip = await JSZip.loadAsync(d)
        const icerdekiler = Object.values(zip.files).filter(f => !f.dir && /\.(pdf|xml|xlsx|xls|html?)$/i.test(f.name))
        for (const f of icerdekiler) {
          const blob = await f.async('blob')
          belgeler.push(new File([blob], f.name.split('/').pop(), { type: blob.type }))
        }
      } catch (e) { console.warn('ZIP açılamadı:', d.name, e) }
    } else if (/\.(pdf|xml|xlsx|xls|html?)$/i.test(d.name)) {
      belgeler.push(d)
    }
  }
  if (!belgeler.length) return { ok: true, sayi: 0, not: 'Yüklenecek fatura belgesi bulunamadı (zip / xlsx / pdf / xml / html bekleniyor).' }

  // Mevcut kayıtlar — tekrar yüklemeyi önler, html bağlama için yön haritası
  const mevcut = new Set()
  const htmlOlanlar = new Set()
  const uuidYon = new Map()
  try {
    const { data } = await supabase.from('efatura_faturalar').select('fatura_uuid,yon,tur,html_url').eq('client_id', client.id)
    ;(data || []).forEach(r => {
      mevcut.add(`${r.yon}|${r.tur}|${r.fatura_uuid}`)
      if (r.html_url) htmlOlanlar.add(r.fatura_uuid)
      uuidYon.set(r.fatura_uuid, r.yon)
    })
  } catch { /* yoksay — hepsini işler */ }

  const yilKlasoru = yil || new Date().getFullYear()
  const satirlar = {}
  // Coklu KDV parcalari (uuid -> [{oran,matrah,kdv}]) — upsert sonrasi detay tablosuna yazilir
  const kdvParcaMap = {}
  let htmlEklenen = 0
  const hatalar = [] // yüklenemeyen belgeler — sessizce yutulmaz, kullanıcıya bildirilir
  // Önce pdf/xml/xlsx (kayıt oluşturur), sonra html (kayıtlara bağlanır)
  const sirali = [...belgeler.filter(b => !/\.html?$/i.test(b.name)), ...belgeler.filter(b => /\.html?$/i.test(b.name))]
  for (let i = 0; i < sirali.length; i++) {
    const dosya = sirali[i]
    if (i % 5 === 0) durum(`yükleniyor: ${i + 1}/${sirali.length}`)
    try {
      const temel = dosya.name.replace(/\.(pdf|xml|xlsx|xls|html?)$/i, '')
      const ext = /\.html?$/i.test(dosya.name) ? 'html' : (/\.xlsx?$/i.test(dosya.name) ? 'xlsx' : (/\.xml$/i.test(dosya.name) ? 'xml' : 'pdf'))
      const temelUuid = uuidAdlandan(temel)

      if (ext === 'html') {
        // Resmî e-Belge HTML'i: aynı uuid'li kayıta html_url yaz
        if (htmlOlanlar.has(temelUuid)) continue
        const yonH = satirlar[temelUuid]?.yon || uuidYon.get(temelUuid) || yonTespitEt(ad, null, null)
        const dosyaAdiH = `${yonH}_${temelUuid}.html`
        const dosyaH = new File([dosya], dosyaAdiH, { type: 'text/html' })
        let urlH = ''
        try {
          const up = await uploadClientFile({ client, relPath: `faturalar/${yilKlasoru}/${dosyaAdiH}`, file: dosyaH })
          urlH = up.url
        } catch (e) { console.warn('HTML yükleme başarısız:', dosya.name, e); hatalar.push(dosya.name + ': ' + (e?.message || String(e))); continue }
        if (satirlar[temelUuid]) satirlar[temelUuid].html_url = urlH
        else {
          const { data: row } = await supabase
            .from('efatura_faturalar')
            .select('id')
            .eq('client_id', client.id)
            .eq('fatura_uuid', temelUuid)
            .maybeSingle()
          if (row) {
            await supabase.from('efatura_faturalar').update({ html_url: urlH }).eq('id', row.id)
            htmlEklenen++
          }
        }
        continue
      }

      let meta = null
      if (ext === 'xml') {
        try { meta = faturaMetadatasiXml(await dosya.text(), client.vkn || client.tc || '') } catch { /* meta yoksa uuid ile devam */ }
      }
      // UTTS Excel: once storage'a yukle, sonra EXCEL'IN HER SATIRINI ayri
      // fis/fatura kaydi olarak yaz (tarih, fatura no, VKN/TCKN, matrah, KDV,
      // toplam). Excel'in kendisi xml_url'de kalir (indirilebilir).
      if (ext === 'xlsx') {
        // Gümrük ithalat listesi (dosya adında GÜMRÜK/İTHALAT geçen .xls/.xlsx):
        // her satır ayrı ithalat fatura kaydı — fatura_turu=ITHALAT, yon=gelen
        if (/g[üu]mr[üu]k|ithalat/i.test(temel)) {
          let gumrukListesi = []
          try { gumrukListesi = await gumrukSatirlariniOku(await dosya.arrayBuffer()) } catch (e) { console.warn('Gümrük Excel okunamadı:', dosya.name, e) }
          if (!gumrukListesi.length) { hatalar.push(dosya.name + ': Gümrük listesi okunamadı/boş'); continue }

          const uzantiG = /\.xlsx$/i.test(dosya.name) ? 'xlsx' : 'xls'
          const dosyaAdiG = `gelen_${temelUuid}.${uzantiG}`
          const dosyaG = new File([dosya], dosyaAdiG, { type: 'application/vnd.ms-excel' })
          let urlG = ''
          try {
            const up = await uploadClientFile({ client, relPath: `faturalar/${yilKlasoru}/${dosyaAdiG}`, file: dosyaG })
            urlG = up.url
          } catch (e) { console.warn('Gümrük Excel yükleme başarısız:', dosya.name, e); hatalar.push(dosya.name + ': ' + (e?.message || String(e))); continue }

          // Aynı excel daha önce yüklendiyse eski satır kayıtlarını temizle
          try {
            await supabase.from('efatura_faturalar')
              .delete()
              .eq('client_id', client.id)
              .eq('tur', 'gumruk')
              .like('fatura_uuid', `${temelUuid}%`)
          } catch { /* devam */ }

          gumrukListesi.forEach((r, i) => {
            satirlar[`${temelUuid}-r${i}`] = {
              client_id: client.id,
              yon: 'gelen',
              tur: 'gumruk',
              fatura_turu: 'ITHALAT',
              fatura_uuid: `${temelUuid}-r${i}`,
              fatura_no: r.faturaNo || `${i + 1}`,
              tarih: r.tarih || null,
              karsi_vkn: '',
              karsi_unvan: r.unvan || '',
              tutar: r.toplam ?? null,
              matrah: r.matrah ?? null,
              kdv: r.kdv ?? null,
              para_birimi: 'TRY',
              pdf_url: '',
              xml_url: urlG, // gümrük excel indirme linki
              html_url: '',
              sorgu_ts: new Date().toISOString()
            }
          })
          durum(`${dosya.name}: ${gumrukListesi.length} ithalat faturası bulundu`)
          continue
        }
        // UTTS fişleri MÜŞTERİNİN akaryakıt ALIMLARIDIR — her zaman 'gelen'
        // (Alınan). Dosya adinda "satis" geçse bile (istasyonun satışı =
        // müşterinin alışı) tür Alınan yazmalı.
        const yonX = 'gelen'
        const turX = 'utts'
        // Fatura turu her zaman UTTS (filtrede "UTTS" secince listelenir)
        const fturX = 'UTTS'
        const dosyaAdiX = `${yonX}_${temelUuid}.xlsx`
        const dosyaX = new File([dosya], dosyaAdiX, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        let urlX = ''
        try {
          const up = await uploadClientFile({ client, relPath: `faturalar/${yilKlasoru}/${dosyaAdiX}`, file: dosyaX })
          urlX = up.url
        } catch (e) { console.warn('UTTS Excel yükleme başarısız:', dosya.name, e); hatalar.push(dosya.name + ': ' + (e?.message || String(e))); continue }

        let satirListesi = []
        try { satirListesi = await uttsSatirlariniOku(await dosya.arrayBuffer()) } catch (e) { console.warn('UTTS Excel okunamadı:', dosya.name, e) }
        if (!satirListesi.length) { hatalar.push(dosya.name + ': Excel okunamadı/boş'); continue }

        // Bu excel daha once TEK kayit olarak yuklendiyse (eski davranis)
        // o kaydi temizle — artik satir satir kayitlar var
        try {
          await supabase.from('efatura_faturalar')
            .delete()
            .eq('client_id', client.id)
            .eq('tur', 'utts')
            .eq('fatura_uuid', temelUuid)
        } catch { /* silinemeese bile devam */ }

        satirListesi.forEach((r, i) => {
          satirlar[`${temelUuid}-r${i}`] = {
            client_id: client.id,
            yon: yonX,
            tur: turX,
            fatura_turu: fturX,
            fatura_uuid: `${temelUuid}-r${i}`,
            fatura_no: r.faturaNo || `${i + 1}`,
            tarih: r.tarih || null,
            karsi_vkn: r.vkn || '',
            karsi_unvan: '',
            tutar: r.toplam ?? null,
            matrah: r.matrah ?? null,
            kdv: r.kdv ?? null,
            para_birimi: 'TRY',
            pdf_url: '',
            xml_url: urlX, // excel indirme linki
            html_url: '',
            sorgu_ts: new Date().toISOString()
          }
        })
        durum(`${dosya.name}: ${satirListesi.length} fiş bulundu`)
        continue
      }

      const uuid = meta?.uuid || temelUuid
      if (ext === 'xml' && meta?.kdvParcalari?.length >= 1) kdvParcaMap[uuid] = meta.kdvParcalari
      // e-SMM makbuz PDF'i mi? Icerigini okuyup alanlarini cikar —
      // dosya adi ne olursa olsun, icerik "e-Serbest Meslek Makbuzu"
      // iceriyorsa tur esmm, yon duzenleyen kimligine gore belirlenir.
      let esmm = null
      if (ext === 'pdf') {
        try { esmm = esmmPdfAyikla(await pdfMetinOku(dosya)) } catch { /* okunamadiysa normal akis */ }
      }
      let yon = yonTespitEt(dosya.name, meta?.yon, null)
      let tur = meta?.tur || (temel.toLowerCase().includes('earsiv') ? 'earsiv' : 'efatura')
      if (esmm) {
        const duzBenim = !!esmm.duzenleyenNo && String(esmm.duzenleyenNo) === String(client.vkn || client.tc || '')
        yon = duzBenim ? 'giden' : 'gelen'
        tur = 'esmm'
      }
      const anahtar = `${yon}|${tur}|${uuid}`
      if (mevcut.has(anahtar)) continue
      const dosyaAdi = `${yon}_${uuid}.${ext}`
      const dosyaYeni = new File([dosya], dosyaAdi, {
        type: ext === 'xml' ? 'application/xml'
          : ext === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf'
      })
      let url = ''
      try {
        const up = await uploadClientFile({ client, relPath: `faturalar/${yilKlasoru}/${dosyaAdi}`, file: dosyaYeni })
        url = up.url
      } catch (e) { console.warn('Storage yükleme başarısız:', dosya.name, e); hatalar.push(dosya.name + ': ' + (e?.message || String(e))); continue }

      // xlsx (UTTS raporu) dosya adından tarih (YYYY-MM / YYYY.MM / YYYYMM)
      let tarihX = meta?.tarih || null
      if (!tarihX && ext === 'xlsx') {
        const m = temel.match(/(\d{4})[-._]?(\d{2})/)
        if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) tarihX = `${m[1]}-${m[2]}-01`
      }

      // e-SMM makbuz: GIB makbuz alanlariyla kayit yaz (tarih, no, matrah,
      // KDV, stopaj, net toplam). Ayni belgenin daha once yanlis tur/yon
      // ile yazilmis eski kaydini temizler.
      if (esmm) {
        try {
          await supabase.from('efatura_faturalar')
            .delete()
            .eq('client_id', client.id)
            .eq('fatura_uuid', uuid)
            .neq('tur', 'esmm')
        } catch { /* silinemezse upsert yine gunceller */ }
        const duzBenim = yon === 'giden'
        satirlar[uuid] = {
          client_id: client.id,
          yon,
          tur,
          fatura_turu: 'E-SMM',
          fatura_uuid: uuid,
          fatura_no: esmm.fatura_no || temel,
          tarih: esmm.tarih,
          karsi_vkn: duzBenim ? (esmm.aliciNo || '') : (esmm.duzenleyenNo || ''),
          karsi_unvan: duzBenim ? (esmm.aliciUnvan || '') : (esmm.duzenleyenUnvan || ''),
          // Toplam: matrah + kdv (PDF'te "Net Alinan Toplam" yoksa da dogru hesaplanir)
          tutar: esmm.toplam ?? ((esmm.matrah != null || esmm.kdv != null) ? (esmm.matrah || 0) + (esmm.kdv || 0) : null),
          matrah: esmm.matrah ?? null,
          kdv: esmm.kdv ?? null,
          para_birimi: 'TRY',
          pdf_url: url,
          xml_url: '',
          html_url: '',
          sorgu_ts: new Date().toISOString()
        }
        // Stopaj/tevkifat tabloda kolon yok — app_settings'te es kayit
        try {
          await setAppSetting(`esmm_ek_${client.id}_${uuid}`, JSON.stringify({
            stopaj: esmm.stopaj ?? 0,
            tevkifat: esmm.tevkifat ?? 0,
            guncelleme: new Date().toISOString()
          }))
        } catch { /* ek bilgi yazilamazsa kayit yine de olur */ }
        mevcut.add(anahtar)
        continue
      }

      const onceki = satirlar[uuid] || {}
      satirlar[uuid] = {
        client_id: client.id,
        yon,
        tur,
        fatura_turu: meta?.faturaTuru || onceki.fatura_turu || '',
        fatura_uuid: uuid,
        fatura_no: meta?.faturaNo || onceki.fatura_no || temel,
        tarih: tarihX || onceki.tarih || null,
        karsi_vkn: meta?.karsiVkn || onceki.karsi_vkn || '',
        karsi_unvan: meta?.karsiUnvan || onceki.karsi_unvan || '',
        tutar: meta?.tutar ?? onceki.tutar ?? null,
        matrah: meta?.matrah ?? onceki.matrah ?? null,
        kdv: meta?.kdv ?? onceki.kdv ?? null,
        para_birimi: meta?.paraBirimi || onceki.para_birimi || 'TRY',
        doviz_kur: meta?.dovizKur ?? onceki.doviz_kur ?? null,
        pdf_url: ext === 'pdf' ? url : (onceki.pdf_url || ''),
        xml_url: (ext === 'xml' || ext === 'xlsx') ? url : (onceki.xml_url || ''),
        html_url: onceki.html_url || '',
        sorgu_ts: new Date().toISOString()
      }
      mevcut.add(anahtar)
    } catch (e) { console.warn('Belge işlenemedi:', dosya.name, e); hatalar.push(dosya.name + ': ' + (e?.message || String(e))) }
  }

  const kayitlar = Object.values(satirlar).filter(r => r.pdf_url || r.xml_url || r.html_url)
  if (!kayitlar.length && !htmlEklenen) {
    if (hatalar.length) return { ok: false, sayi: 0, not: `${hatalar.length} belge yüklenemedi — ilk hata: ${hatalar[0]}` }
    return { ok: true, sayi: 0, not: 'Yeni yüklenecek belge yok (hepsi zaten kayıtlı).' }
  }
  if (kayitlar.length) {
    const { error } = await supabase
      .from('efatura_faturalar')
      .upsert(kayitlar, { onConflict: 'client_id,yon,tur,fatura_uuid' })
    if (error) return { ok: false, sayi: 0, not: 'Fatura kayıtları buluta yazılamadı: ' + (error.message || '') }
    await kdvDetayKaydet(client.id, kdvParcaMap)
  }
  const ekNot = htmlEklenen ? `${htmlEklenen} faturaya e-Belge HTML'i eklendi.` : ''
  const kdv2Aylar = await kdv2AktifEtGerekirse(client, kayitlar)
  const kdv2Ek = kdv2Notu(kdv2Aylar)
  return { ok: true, sayi: kayitlar.length, not: hatalar.length ? `${ekNot}${ekNot ? ' ' : ''}Dikkat: ${hatalar.length} belge yüklenemedi (${hatalar[0]})${kdv2Ek}` : (ekNot + kdv2Ek) }
}

// 2.7.161: Okuma tarafinda yon normalizasyonu — eski kayitlarda 'satis',
// 'alis', 'Kesilen', 'Alınan' gibi degerler yazilmis olabilir; bunlar
// 'gelen'/'giden'e cevrilip sessizce DB'de de duzeltilir (filtre boylece
// Satış/Alış seciminde dogru listeler).
const yonlariDuzelt = (data) => {
  const bozuk = (data || []).filter(f => f.yon !== 'gelen' && f.yon !== 'giden')
  if (!bozuk.length) return
  const grup = {}
  for (const f of bozuk) {
    const y = yonNormalizasyon(f.yon)
    f.yon = y
    ;(grup[y] = grup[y] || []).push(f.id)
  }
  for (const [y, ids] of Object.entries(grup)) {
    supabase.from('efatura_faturalar')
      .update({ yon: y })
      .in('id', ids)
      .then(() => { /* duzeltildi */ })
      .catch(() => { /* en azindan listede duzeltildi */ })
  }
}

// 2.8.55: ESKI KAYIT ONARIMI — gecmis surumlerde bazi faturalarda "Karsi Taraf"
// olarak faturanin KESENI (musterinin kendi unvani) yazilmis, hatta yon ters
// kaydedilmis olabiliyor. Kayitli XML varsa yeniden okunup iki taraf VKN'leri
// karsilastirilir; yon ve karsi taraf duzeltilir. Sessiz, en fazla 40 kayit,
// arka planda — liste yuklemesini bekletmez.
export async function karsiTarafOnar(clientId, adaylar = null) {
  try {
    const cid = Number(clientId)
    if (!cid) return 0
    const { data: c } = await supabase
      .from('clients').select('id,name,company,vkn,tc').eq('id', cid).single()
    if (!c) return 0
    const mv = String(c.vkn || c.tc || '').replace(/\s/g, '')
    const ad = String(c.name || c.company || '').trim().toLocaleUpperCase('tr')
    let liste = adaylar
    if (!Array.isArray(liste)) {
      const { data } = await supabase
        .from('efatura_faturalar')
        .select('id,client_id,yon,tur,fatura_no,karsi_vkn,karsi_unvan,xml_url')
        .eq('client_id', cid)
        .not('xml_url', 'is', null)
        .limit(400)
      liste = data || []
    }
    const supheli = liste.filter(f => {
      const v = String(f.karsi_vkn || '').replace(/\s/g, '')
      const u = String(f.karsi_unvan || '').trim().toLocaleUpperCase('tr')
      if (mv && v && v === mv) return true
      if (ad && u && u === ad) return true
      return false
    }).slice(0, 40)
    if (!supheli.length) return 0
    let onarilan = 0
    for (const f of supheli) {
      try {
        const r = await fetch(f.xml_url)
        if (!r.ok) continue
        const xml = await r.text()
        const meta = faturaMetadatasiXml(xml, mv, f.yon)
        const sVkn = String(meta.saticiVkn || '').replace(/\s/g, '')
        const aVkn = String(meta.aliciVkn || '').replace(/\s/g, '')
        let yeniYon = f.yon
        if (mv && sVkn && aVkn) {
          if (sVkn === mv && aVkn !== mv) yeniYon = 'giden'
          else if (aVkn === mv && sVkn !== mv) yeniYon = 'gelen'
        }
        const yeniVkn = yeniYon === 'giden' ? aVkn : sVkn
        const yeniUnvan = (yeniYon === 'giden' ? meta.aliciUnvan : meta.saticiUnvan) || ''
        const degisti = yeniYon !== f.yon
          || String(yeniVkn) !== String(f.karsi_vkn || '').replace(/\s/g, '')
          || String(yeniUnvan).trim() !== String(f.karsi_unvan || '').trim()
        if (!degisti) continue
        await supabase.from('efatura_faturalar')
          .update({ yon: yeniYon, karsi_vkn: yeniVkn || '', karsi_unvan: yeniUnvan || '' })
          .eq('id', f.id)
        Object.assign(f, { yon: yeniYon, karsi_vkn: yeniVkn || '', karsi_unvan: yeniUnvan || '' })
        onarilan++
      } catch { /* tek kayit atlanir */ }
    }
    return onarilan
  } catch {
    return 0
  }
}

// Musterinin kayitli faturalarini listeler
// Tum satirlari sayfalayarak ceker — PostgREST istek basina ~1000 satirla
// sinirlar; canli testte 1000'lik sayfa bile 999 satirda kesildi (999 < 1000
// sanip dongu duruyor). Sayfa boyutu 500: guvenli bantta, tum kayitlar okunur.
async function tumSatirlariCek(query, sayfa = 500) {
  let hepsi = []
  // Dongu YALNIZCA BOS sayfada durur — PostgREST kismi sayfa dondurebiliyor
  // (1000 istenip 999 gelmesi gibi); kismi sayfada durmak kayit kaybettirir.
  for (let from = 0; from < 100000; ) {
    const { data, error } = await query.range(from, from + sayfa - 1)
    if (error) return { data: hepsi, error }
    hepsi = hepsi.concat(data || [])
    if (!data || data.length === 0) break
    from += data.length
  }
  // Sayfa sinirinda kararsiz siralama (ayni tarihli kayitlar) ayni kaydi iki
  // sayfada da donebilir — id bazli tekillestirme.
  const gorulen = new Set()
  hepsi = hepsi.filter(r => (gorulen.has(r.id) ? false : (gorulen.add(r.id), true)))
  return { data: hepsi, error: null }
}

// 2.7.571: secenek = { yil, ay } verildiginde yalniz o donemin kayitlari
// cekilir (1 istek, ~yuzlerce satir) — tam liste (binlerce satir, 4+ sayfa)
// bekletiyordu. secenek yoksa eski davranis: tum kayitlar.
export async function faturalariGetir(clientId, secenek) {
  if (!clientId) return []
  let q = supabase
    .from('efatura_faturalar')
    .select('*')
    .eq('client_id', clientId)
  if (secenek && secenek.yil && secenek.ay) {
    const yil = String(secenek.yil)
    const ay = String(secenek.ay).padStart(2, '0')
    // Ayın GERÇEK son günü (Eylül=30, Şubat=28/29) — sabit '-31' geçersiz
    // tarih üretip sorguyu boş döndürüyordu (Eylül faturaları gelmiyordu)
    const sonGun = new Date(Number(yil), Number(ay), 0).getDate()
    q = q.gte('tarih', `${yil}-${ay}-01`).lte('tarih', `${yil}-${ay}-${String(sonGun).padStart(2, '0')}`)
  }
  const { data, error } = await tumSatirlariCek(
    q.order('tarih', { ascending: false })
      .order('id', { ascending: false })
  )
  if (error) {
    if (secenek?.hataFirlat) throw error
    return []
  }
  yonlariDuzelt(data)
  // 2.8.55: "Karsi Taraf" olarak musterinin kendisi yazilmis kayitlari arka
  // planda onar (en fazla 40 kayit). Liste bekletilmez; sonraki acilista duzelir.
  try {
    const supheVar = (data || []).some(f => String(f.karsi_vkn || '').replace(/\s/g, ''))
    if (supheVar) {
      void karsiTarafOnar(clientId, data).then(n => {
        if (n > 0) console.info(`[efatura] ${n} faturanin karsi tarafi/yonu onarildi`)
      })
    }
  } catch { /* onarim kritik degil */ }
  // Eski UTTS kayitlarinin fatura_turu SATIS/ALIS kalmis olabilir — UTTS'e
  // duzelt (bir kez, sessiz; boylece filtrede "UTTS" secince listelenirler).
  // Ayrica UTTS fişleri her zaman Alınan'dir (yon='giden' ise duzelt).
  const eski = (data || []).filter(f => f.tur === 'utts' && (String(f.fatura_turu || '').toLocaleUpperCase('tr') !== 'UTTS' || f.yon === 'giden'))
  if (eski.length) {
    supabase.from('efatura_faturalar')
      .update({ fatura_turu: 'UTTS', yon: 'gelen' })
      .in('id', eski.map(f => f.id))
      .then(() => eski.forEach(f => { f.fatura_turu = 'UTTS'; f.yon = 'gelen' }))
      .catch(() => { /* en azindan listede duzelt */ eski.forEach(f => { f.fatura_turu = 'UTTS'; f.yon = 'gelen' }) })
  }
  return mukerrerFaturaTemizle(data || [])
}

// 2.8.21: Ayni fatura birden fazla kez kaydedilmis olabilir (Luca sorgusu
// tekrar calistirildi, manuel yukleme + sorgu cakisti vb.). Fatura listesinde
// ayni belge 2 satir gorunuyordu. Ayni fatura_no + tarih + yon + tur +
// matrah + KDV olan kayitlar TEK satira indirilir.
// Tutulan kayit: unvani dolu olan (VKN'den cozulmus), yoksa en kucuk id.
export function mukerrerFaturaTemizle(liste) {
  const kurus = (v) => Math.round((Number(v) || 0) * 100)
  const gruplar = new Map()
  const tekiller = []
  for (const f of (liste || [])) {
    // fatura_no bos ise (orn. fis/Z raporu) gruplamaya sokma
    const no = String(f?.fatura_no || '').trim().toLocaleUpperCase('tr')
    if (!no) { tekiller.push(f); continue }
    const anahtar = [
      no,
      String(f?.tarih || '').slice(0, 10),
      f?.yon || '',
      f?.tur || '',
      kurus(f?.matrah),
      kurus(f?.kdv)
    ].join('|')
    if (!gruplar.has(anahtar)) gruplar.set(anahtar, [])
    gruplar.get(anahtar).push(f)
  }
  const sonuc = [...tekiller]
  for (const grup of gruplar.values()) {
    if (grup.length === 1) { sonuc.push(grup[0]); continue }
    const puan = (f) => {
      const unvan = String(f?.karsi_unvan || '').trim() ? 2 : 0
      const vkn = String(f?.karsi_vkn || '').trim() ? 1 : 0
      return unvan + vkn
    }
    sonuc.push(grup.slice().sort((a, b) => puan(b) - puan(a) || Number(a.id) - Number(b.id))[0])
  }
  // Orijinal siralamayi (tarih desc, id desc) koru
  return sonuc.sort((a, b) => {
    const t = String(b?.tarih || '').localeCompare(String(a?.tarih || ''))
    return t !== 0 ? t : Number(b?.id || 0) - Number(a?.id || 0)
  })
}

// Coklu KDV parcalarini efatura_kdv_detay'a yazar (once eski satirlar silinir)
export async function kdvDetayKaydet(clientId, parcaMap) {
  const uuidler = Object.keys(parcaMap || {})
  if (!uuidler.length) return
  try {
    const { data: yazilan } = await supabase.from('efatura_faturalar')
      .select('id,fatura_uuid').eq('client_id', clientId).in('fatura_uuid', uuidler)
    const satirlar = []
    for (const k of (yazilan || [])) {
      for (const p of (parcaMap[k.fatura_uuid] || [])) {
        satirlar.push({ fatura_id: k.id, oran: p.oran, matrah: p.matrah, kdv: p.kdv })
      }
    }
    if (!satirlar.length) return
    await supabase.from('efatura_kdv_detay').delete().in('fatura_id', satirlar.map(s => s.fatura_id))
    for (let i = 0; i < satirlar.length; i += 500) {
      await supabase.from('efatura_kdv_detay').insert(satirlar.slice(i, i + 500))
    }
  } catch (e) { console.warn('KDV detay yazilamadi:', e) }
}

// 2.7.572: Araç KDV+ÖTV matraha ilave — seçili faturalarda KDV tutarı
// matraha eklenir ve KDV sütunu 0'a çekilir (KDV hesaplamasından çıkar;
// araç alımında KDV+ÖTV gider/matrah olur). Tutar değişmez çünkü
// matrah+KDV her zaman tutara eşit kalır. efatura_kdv_detay satırları
// da aynı şekilde güncellenir ki KDV dökümleri bu tutarları saymasın.
// KDV'si 0 olan (daha önce ilave edilmiş) kayıtlar atlanır — tekrar
// basmak güvenlidir.
export async function aracKdvMatrahaEkle(idler) {
  if (!Array.isArray(idler) || !idler.length) return { ok: false, islenen: 0, not: 'Seçili kayıt yok' }
  const { data: satirlar, error: okumaHatasi } = await supabase
    .from('efatura_faturalar')
    .select('id, fatura_no, matrah, kdv')
    .in('id', idler)
  if (okumaHatasi) return { ok: false, islenen: 0, not: okumaHatasi.message }
  let islenen = 0
  for (const f of satirlar || []) {
    const k = Number(f.kdv) || 0
    if (k <= 0) continue
    const m = (Number(f.matrah) || 0) + k
    const { error } = await supabase.from('efatura_faturalar')
      .update({ matrah: m, kdv: 0 })
      .eq('id', f.id)
    if (error) continue
    islenen++
    const detay = await kdvDetaylariGetir([f.id]).catch(() => ({}))
    for (const d of (detay[f.id] || [])) {
      if ((d.kdv || 0) > 0) {
        await supabase.from('efatura_kdv_detay')
          .update({ matrah: (d.matrah || 0) + d.kdv, kdv: 0 })
          .eq('fatura_id', f.id)
          .eq('oran', d.oran)
      }
    }
  }
  return { ok: true, islenen, not: islenen ? `${islenen} kayıtta KDV matraha ilave edildi ve KDV sütunundan çıkarıldı.` : 'İşlenecek KDV\'li kayıt yok — seçili kayıtların KDV\'si zaten 0.' }
}

// Coklu KDV'li faturalarin oran bazli matrah/kdv satirlari (efatura_kdv_detay)
export async function kdvDetaylariGetir(faturaIdler) {
  if (!Array.isArray(faturaIdler) || !faturaIdler.length) return {}
  const { data, error } = await supabase
    .from('efatura_kdv_detay')
    .select('fatura_id, oran, matrah, kdv')
    .in('fatura_id', faturaIdler)
    .order('oran', { ascending: true })
  if (error || !data?.length) return {}
  const harita = {}
  for (const d of data) {
    if (!harita[d.fatura_id]) harita[d.fatura_id] = []
    harita[d.fatura_id].push({ oran: Number(d.oran), matrah: d.matrah != null ? Number(d.matrah) : null, kdv: d.kdv != null ? Number(d.kdv) : null })
  }
  return harita
}

// 2.7.497: Matrah/KDV tutarlilik onarimi — depodaki satirlardan
// "matrah + kdv != tutar" olanlari (orn. cift TaxTotal blokuyla cift yazilan
// matrahlar) depolanan XML'i yeniden ayristirarak duzeltir. Onarim sadece
// tutar sutunu saglam (depodaki tutar == XML tutari) satirlara dokunur;
// tutar bile bozuksa yanlis satiri ezmemek icin atlanir.
// Donus: { taranan, duzeltilen, atlanan }
export async function efaturaTutarlariOnar(clientId) {
  if (!clientId) return { taranan: 0, duzeltilen: 0, atlanan: 0 }
  let liste = []
  try { liste = await faturalariGetir(clientId) } catch { return { taranan: 0, duzeltilen: 0, atlanan: 0 } }
  const tutarliDegil = (f) => {
    const t = Number(f.tutar)
    if (!isFinite(t) || t <= 0) return false
    const m = Number(f.matrah), k = Number(f.kdv)
    if (!isFinite(m) || !isFinite(k) || m <= 0 || k < 0) return true
    return Math.abs(m + k - t) > Math.max(1, t * 0.02)
  }
  const adaylar = (liste || []).filter(f => f.xml_url && f.tur !== 'utts' && tutarliDegil(f))
  let duzeltilen = 0
  const parcaMap = {}
  for (const f of adaylar) {
    try {
      const res = await fetchDocument(f.xml_url)
      if (!res.ok) continue
      const xml = await res.text()
      const meta = faturaMetadatasiXml(xml, '', '')
      const t = Number(meta?.tutar), m = Number(meta?.matrah), k = Number(meta?.kdv)
      if (!isFinite(t) || t <= 0) continue
      if (!isFinite(m) || !isFinite(k) || m <= 0 || Math.abs(m + k - t) > Math.max(1, t * 0.02)) continue
      const eskiT = Number(f.tutar)
      if (isFinite(eskiT) && eskiT > 0 && Math.abs(eskiT - t) > Math.max(1, t * 0.02)) continue
      const { error } = await supabase.from('efatura_faturalar')
        .update({ matrah: m, kdv: k, tutar: t })
        .eq('id', f.id)
      if (error) continue
      if (Array.isArray(meta?.kdvParcalari) && meta.kdvParcalari.length) parcaMap[f.fatura_uuid] = meta.kdvParcalari
      duzeltilen++
      f.matrah = m; f.kdv = k; f.tutar = t
    } catch { /* tek dosya hatasi onarimi durdurmasin */ }
  }
  if (Object.keys(parcaMap).length) kdvDetayKaydet(clientId, parcaMap)
  return { taranan: adaylar.length, duzeltilen, atlanan: adaylar.length - duzeltilen }
}

// 2.7.542: KDV oran rozeti eksik faturalarin onarimi — eski surumlerde
// yalnizca coklu KDV'li faturalar efatura_kdv_detay'a yazildigindan tek
// oranli faturalarin (buyuk cogunluk) rozetleri bos kaliyordu. XML'i
// depolanmis faturalar yeniden ayristirilir ve tum KDV parcalari yazilir.
// Donus: { taranan, yazilan }
export async function efaturaKdvOranlariOnar(clientId) {
  if (!clientId) return { taranan: 0, yazilan: 0 }
  let liste = []
  try { liste = await faturalariGetir(clientId) } catch { return { taranan: 0, yazilan: 0 } }
  const adaylar = (liste || []).filter(f => f.kdv != null && f.xml_url && f.fatura_uuid && f.tur !== 'utts')
  if (!adaylar.length) return { taranan: 0, yazilan: 0 }
  const mevcut = await kdvDetaylariGetir(adaylar.map(f => f.id)).catch(() => ({}))
  const eksikler = adaylar.filter(f => !(mevcut[f.id]?.length))
  let yazilan = 0
  const parcaMap = {}
  for (const f of eksikler) {
    try {
      const res = await fetchDocument(f.xml_url)
      if (!res.ok) continue
      const xml = await res.text()
      const meta = faturaMetadatasiXml(xml, '', '')
      if (Array.isArray(meta?.kdvParcalari) && meta.kdvParcalari.length) {
        parcaMap[f.fatura_uuid] = meta.kdvParcalari
        yazilan++
      }
    } catch { /* tek dosya hatasi onarimi durdurmasin */ }
  }
  if (Object.keys(parcaMap).length) await kdvDetayKaydet(clientId, parcaMap)
  return { taranan: eksikler.length, yazilan }
}

// Tum musterilerin kayitli faturalarini listeler (admin e-Fatura XML Indirici
// sayfasi — butun musterilerin efatura_faturalar kayitlari tek listede)
export async function tumFaturalariGetir() {
  const { data, error } = await tumSatirlariCek(
    supabase
      .from('efatura_faturalar')
      .select('*')
      .order('tarih', { ascending: false })
  )
  if (error) return []
  yonlariDuzelt(data)
  // Eski UTTS kayitlarini da UTTS fatura turune ve Alınan yönüne duzelt (admin)
  const eski = (data || []).filter(f => f.tur === 'utts' && (String(f.fatura_turu || '').toLocaleUpperCase('tr') !== 'UTTS' || f.yon === 'giden'))
  if (eski.length) {
    supabase.from('efatura_faturalar')
      .update({ fatura_turu: 'UTTS', yon: 'gelen' })
      .in('id', eski.map(f => f.id))
      .then(() => eski.forEach(f => { f.fatura_turu = 'UTTS'; f.yon = 'gelen' }))
      .catch(() => eski.forEach(f => { f.fatura_turu = 'UTTS'; f.yon = 'gelen' }))
  }
  return data || []
}

// Faturalari (efatura_faturalar kayitlarini) siler — hatali yuklemeler icin.
// Storage'daki pdf/xml dosyalari da URL'lerinden yol cikarilarak silinmeye
// calisir (silinemese bile kayit silinir; hata yutulur).
export async function faturalariSil(ids) {
  const silinecekler = (Array.isArray(ids) ? ids : [ids]).map(Number).filter(Boolean)
  if (!silinecekler.length) return { ok: false, silinen: 0, not: 'Silinecek kayit secilmedi.' }

  // Once storage dosyalarini temizle (pdf_url / xml_url -> bucket icindeki yol)
  const { data: kayitlar } = await supabase
    .from('efatura_faturalar')
    .select('pdf_url,xml_url')
    .in('id', silinecekler)
  const yollar = []
  for (const k of kayitlar || []) {
    for (const u of [k.pdf_url, k.xml_url]) {
      const eslesme = String(u || '').match(/\/storage\/v1\/object\/public\/client-documents\/(.+)$/)
      if (eslesme) {
        const yol = decodeURIComponent(eslesme[1])
        if (!/\.xlsx?(?:\?|$)/i.test(yol)) yollar.push(yol)
      }
    }
  }
  if (yollar.length) {
    try { await supabase.storage.from('client-documents').remove(yollar) } catch { /* dosya silinemese de kayit silinsin */ }
  }

  const { error } = await supabase
    .from('efatura_faturalar')
    .delete()
    .in('id', silinecekler)
  if (error) return { ok: false, silinen: 0, not: error.message || 'Silme basarisiz' }
  return { ok: true, silinen: silinecekler.length, not: '' }
}

// Faturalari yil/aya gore gruplar (yeniden eskiye). Tum turler (e-Fatura,
// e-Arsiv, e-SMM, UTTS) tek listede birlesir; yon ile Kesilen/Alinan ayrilir.
// Fiş / Z raporu kayıtlarında efatura_kdv_detay kaydı yok — KDV detayını matrah/kdv'den üret.
// Z raporu: %10/%20 karışık satış ayrıştırması (T = 1.1*m10 + 1.2*m20, M = m10 + m20 → m20 = 10K − M).
// Gider fişi: KDV dahil toplamdan tek oran (en yakın standart oran).
export function fisKdvDetayUret(f) {
  const ft = String(f.fatura_turu || '').toLocaleUpperCase('tr')
  if (ft !== 'Z RAPORU' && ft !== 'GİDER FİŞİ' && ft !== 'GİDER DÖKÜMÜ') return null
  const M = Number(f.matrah) || 0, K = Number(f.kdv) || 0
  if (!(M > 0) || !(K > 0)) return null
  const detay = []
  if (ft === 'Z RAPORU') {
    let m20 = Math.round((10 * K - M) * 100) / 100
    if (m20 < 0.5) m20 = 0
    else if (M - m20 < 0.5) m20 = M
    const m10 = Math.round((M - m20) * 100) / 100
    if (m20 > 0.005) detay.push({ oran: 20, matrah: m20, kdv: Math.round(m20 * 20) / 100 })
    if (m10 > 0.005) detay.push({ oran: 10, matrah: m10, kdv: Math.round(m10 * 10) / 100 })
  } else {
    const oran = (K / M) * 100
    let en = [1, 5, 8, 10, 20].reduce((a, o) => (Math.abs(oran - o) < Math.abs(oran - a) ? o : a), 1)
    if (Math.abs(oran - en) >= 0.6) en = Math.round(oran)
    detay.push({ oran: en, matrah: M, kdv: K })
  }
  return detay.length ? detay : null
}

export function faturaGruplari(faturalar) {
  const aylar = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
  const g = {}
  for (const f of faturalar) {
    const t = String(f.tarih || '')
    const k = /^\d{4}-\d{2}/.test(t) ? t.substring(0, 7) : 'diger'
    if (!g[k]) g[k] = []
    g[k].push(f)
  }
  return Object.keys(g)
    .sort((a, b) => b.localeCompare(a))
    .map(k => ({
      anahtar: k,
      yil: k !== 'diger' ? k.substring(0, 4) : '',
      ayAd: k !== 'diger' ? (aylar[parseInt(k.substring(5, 7), 10) - 1] || '') : '',
      ogeler: g[k]
    }))
}

// 2.7.443: Luca "AFA" dökümü yükleme — kullanıcının Fatura Sorgulama'dan
// yüklediği CSV/Excel dökümleri (Gümrük/İthalat veya Gider fiş/fatura).
// tip: 'gumruk' → tur='gumruk', fatura_turu='ITHALAT' (KDV durumdaki
// "İthalde ödenen KDV"); 'gider' → tur='efatura', yon='gelen' (Alınan
// fatura KDV'ye katılır), fatura_turu='GİDER DÖKÜMÜ';
// 'zraporu' → tur='efatura', yon='giden' (Kesilen KDV'ye katılır),
// fatura_turu='Z RAPORU'.
export async function afaDokumuYukle({ client, dosya, tip }) {
  const yilKlasoru = new Date().getFullYear()
  const temel = dosya.name.replace(/\.(csv|xls|xlsx)$/i, '')
  const temelUuid = uuidAdlandan(temel) || temel
  const gumrukModu = tip === 'gumruk'
  const zRaporuModu = tip === 'zraporu'

  let liste = []
  try {
    liste = zRaporuModu
      ? await zRaporuSatirlariniOku(await dosya.arrayBuffer(), dosya.name)
      : await afaDokumSatirlariniOku(await dosya.arrayBuffer(), dosya.name)
  } catch (e) {
    return { ok: false, sayi: 0, not: 'Döküm okunamadı: ' + (e?.message || 'bilinmeyen hata') }
  }
  if (!liste.length) {
    return { ok: false, sayi: 0, not: zRaporuModu
      ? 'Dökümde Z raporu satırı bulunamadı. Yapı: TARİH; EVRAK NO; AÇIKLAMA; SATIŞ...; NAKİT; KREDİ K; MATRAH...; KDV...'
      : 'Dökümde fatura satırı bulunamadı. Luca "AFA" dökümü olmalı (TARİH | FATURA NO | ÜNVANI | KDV ORANI | KDV MATRAHI | KDV TUTARI | TOPLAM).' }
  }

  // Dosyanın kendisini Storage'a yükle (indirilebilir kaynak)
  const uzanti = /\.csv$/i.test(dosya.name) ? 'csv' : (/\.xlsx$/i.test(dosya.name) ? 'xlsx' : 'xls')
  const dosyaAdiS = `gelen_${temelUuid}.${uzanti}`
  const dosyaS = new File([dosya], dosyaAdiS, {
    type: uzanti === 'csv' ? 'text/csv'
      : uzanti === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/vnd.ms-excel'
  })
  let urlS = ''
  try {
    const up = await uploadClientFile({ client, relPath: `faturalar/${yilKlasoru}/${dosyaAdiS}`, file: dosyaS })
    urlS = up.url
  } catch (e) {
    return { ok: false, sayi: 0, not: 'Dosya buluta yüklenemedi: ' + (e?.message || '') }
  }

  // Gümrük: aynı dosya daha önce yüklendiyse eski satırlarını temizle
  if (gumrukModu) {
    try {
      await supabase.from('efatura_faturalar')
        .delete()
        .eq('client_id', client.id)
        .eq('tur', 'gumruk')
        .like('fatura_uuid', `${temelUuid}%`)
    } catch { /* devam */ }
  }

  // Gider dökümü: tekrar yüklemeyi önle — aynı müşteride aynı fatura_no +
  // tarih + kdv'li satır zaten varsa atla (GIB sorgusundan gelen gerçek
  // e-faturalarla çift sayım olmasın). Z raporu için de aynı kontrol
  // giden (satış) yönünde yapılır.
  const mevcutAnahtar = new Set()
  if (!gumrukModu) {
    try {
      const { data } = await supabase.from('efatura_faturalar')
        .select('fatura_no,tarih,kdv')
        .eq('client_id', client.id)
        .eq('yon', zRaporuModu ? 'giden' : 'gelen')
        .in('tur', ['efatura', 'earsiv'])
      for (const r of (data || [])) {
        mevcutAnahtar.add(`${r.fatura_no || ''}|${r.tarih || ''}|${r.kdv ?? ''}`)
      }
    } catch { /* yoksay */ }
  }

  const kayitlar = []
  let atlanan = 0
  liste.forEach((r, i) => {
    const faturaNo = zRaporuModu ? `Z-${r.evrakNo}` : r.faturaNo
    if (!gumrukModu) {
      const anahtar = `${faturaNo || ''}|${r.tarih || ''}|${r.kdv ?? ''}`
      if (mevcutAnahtar.has(anahtar)) { atlanan++; return }
      mevcutAnahtar.add(anahtar)
    }
    kayitlar.push({
      client_id: client.id,
      yon: zRaporuModu ? 'giden' : 'gelen',
      tur: gumrukModu ? 'gumruk' : 'efatura',
      fatura_turu: gumrukModu ? 'ITHALAT' : (zRaporuModu ? 'Z RAPORU' : 'GİDER DÖKÜMÜ'),
      fatura_uuid: `${temelUuid}-r${i}`,
      fatura_no: faturaNo || `${i + 1}`,
      tarih: r.tarih || null,
      karsi_vkn: '',
      karsi_unvan: zRaporuModu ? (r.aciklama || 'Z RAPORU') : r.unvan || '',
      tutar: r.toplam ?? null,
      matrah: r.matrah ?? null,
      kdv: r.kdv ?? null,
      para_birimi: 'TRY',
      pdf_url: '',
      xml_url: urlS,
      html_url: '',
      sorgu_ts: new Date().toISOString()
    })
  })

  // 500'er parselarla yaz
  let yazilan = 0
  for (let i = 0; i < kayitlar.length; i += 500) {
    const { error } = await supabase.from('efatura_faturalar').insert(kayitlar.slice(i, i + 500))
    if (error) {
      return { ok: false, sayi: yazilan, not: 'Kayıtlar yazılamadı: ' + (error.message || '') }
    }
    yazilan += Math.min(500, kayitlar.length - i)
  }

  const etiket = gumrukModu ? 'ithalat (gümrük)' : (zRaporuModu ? 'Z raporu' : 'gider fiş/fatura')
  return {
    ok: true,
    sayi: yazilan,
    atlanan,
    not: `${dosya.name}: ${yazilan} ${etiket} kaydı eklendi` + (atlanan ? ` (${atlanan} satır zaten kayıtlıydı, atlandı)` : '')
  }
}
