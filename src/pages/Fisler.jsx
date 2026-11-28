import { useEffect, useState, useMemo, useRef } from 'react'
import { Loader2, RefreshCw, Upload, FileSpreadsheet, FileText, Receipt, Percent, Clock, CopyX, ExternalLink, Pencil, X, ChevronDown, Trash2 } from 'lucide-react'
import { fisListesi, fisYukle, fisManuelEkle, mukerrerBul, taramaFotoUrl, taramaSil } from '../services/taramaService'
import BilgisayarTarama from '../components/BilgisayarTarama'
import { supabase } from '../lib/supabase'
import { clientDisplayName, sortClients } from '../utils/clientDisplay'
import { fisDetaylariniDogrula, fisOranSatirlari } from '../utils/fisDetay'
import FisElleEkleTablosu, { elleBosSatir, elleSatirHesap, donemUyumsuz, sayiAl } from '../components/FisElleEkleTablosu'

const AYLAR = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK']
const SIMDI = new Date()
const tl = (x) => (x == null ? '—' : Number(x).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

// Tarih normalleyici — her girişi "gg.aa.yyyy" metnine çevirir (01.10.2026 gibi)
const tarihGgAaYyyy = (t) => {
  const s = String(t ?? '').trim()
  if (!s) return ''
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/) // 2026-10-01 / 2026-10-01T...
  if (m) return `${m[3].padStart(2, '0')}.${m[2].padStart(2, '0')}.${m[1]}`
  m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/) // 1.10.2026 / 01/10/2026
  if (m) return `${m[1].padStart(2, '0')}.${m[2].padStart(2, '0')}.${m[3]}`
  return s
}

export default function Fisler() {
  const [fisler, setFisler] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState('')
  const [arama, setArama] = useState('')
  const [durumFiltre, setDurumFiltre] = useState('')
  const [kaynakFiltre, setKaynakFiltre] = useState('')
  const [secili, setSecili] = useState(new Set())
  const [musteriler, setMusteriler] = useState([])
  const [yukMusteri, setYukMusteri] = useState('')
  const [yukYil, setYukYil] = useState(SIMDI.getFullYear())
  const [yukAy, setYukAy] = useState(SIMDI.getMonth() + 1)
  const [yukleme, setYukleme] = useState('') // durum mesajı
  const [elleAcik, setElleAcik] = useState(false)
  const [elleMenuAcik, setElleMenuAcik] = useState(false)
  const [elleTip, setElleTip] = useState('z') // 'z' = Z Raporu, 'fis' = Gider Fişi
  const [elleSatirlar, setElleSatirlar] = useState([elleBosSatir('z')])
  const [elleKaydediyor, setElleKaydediyor] = useState(false)
  const dosyaRef = useRef(null)

  const yukle = async () => {
    setYukleniyor(true)
    setHata('')
    try {
      setFisler(await fisListesi({ yil: yukYil, ay: yukAy }))
    } catch (e) {
      setHata(e?.message || 'Liste alınamadı')
      setFisler([])
    } finally {
      setYukleniyor(false)
    }
  }
  useEffect(() => { yukle() }, [yukYil, yukAy])
  useEffect(() => {
    supabase.from('clients').select('id, name, company').order('name').then(({ data }) => setMusteriler(data || []))
  }, [])

  const mukerrer = useMemo(() => mukerrerBul(fisler || []), [fisler])
  const gorunen = useMemo(() => {
    const a = arama.trim().toLocaleLowerCase('tr')
    return (fisler || []).filter(f => {
      if (yukMusteri && String(f.clientId) !== String(yukMusteri)) return false
      if (durumFiltre && f.durum !== durumFiltre) return false
      if (kaynakFiltre && (kaynakFiltre === 'musteri' ? f.kaynak !== 'musteri-manuel' : f.kaynak !== kaynakFiltre)) return false
      if (!a) return true
      return (f.satici || '').toLocaleLowerCase('tr').includes(a) || (f.vkn || '').includes(a)
    })
  }, [fisler, arama, durumFiltre, kaynakFiltre, yukMusteri])

  const buAySayi = useMemo(() => (fisler || []).filter(f =>
    f.donemYil === SIMDI.getFullYear() && f.donemAy === SIMDI.getMonth() + 1
  ).length, [fisler])

  // Dökümler: üstteki tek müşteri + yıl + ay seçimini kullanır
  const dokumListe = useMemo(() => (fisler || []).filter(f =>
    (!yukMusteri || String(f.clientId) === String(yukMusteri)) &&
    f.donemYil === yukYil && f.donemAy === yukAy
  ), [fisler, yukMusteri, yukYil, yukAy])

  const ozet = useMemo(() => {
    let harcama = 0, kdv = 0, bekleyen = 0
    for (const f of gorunen) {
      harcama += Number(f.toplam) || 0
      kdv += Number(f.kdv) || 0
      if (f.durum === 'yeni' && f.kaynak !== 'manuel') bekleyen++
    }
    const mukerrerSayi = [...gorunen].filter(f => mukerrer.has(f.id)).length
    return { harcama, kdv, bekleyen, mukerrerSayi }
  }, [gorunen, mukerrer])

  // Fişler CSV/Excel şablonu — BiApp "fisler.csv" örnek dosyasına göre (22 kolon)
  const FIS_CSV_BASLIK = ['Firma Adı', 'Adres', 'Vergi Dairesi', 'Vergi No', 'Tarih', 'Saat', 'Fiş No', 'Z No', 'Ödeme Yöntemi', 'KDV %1', 'KDV %5', 'KDV %10', 'KDV %20', 'Diğer KDV Oranı', 'Diğer KDV', 'Toplam KDV', 'Toplam Tutar', 'Ay Sayfası', 'Açıklama', 'Durum', 'Yükleyen', 'Fiş Resmi URL']

  const fisCsvSatirlari = async () => {
    const n2 = (x) => (x == null || x === '' ? '' : Number(x).toFixed(2))
    // Fotoğraflı satırlar için imzalı URL'ler
    const urlHarita = {}
    await Promise.all((dokumListe || []).filter(f => f.storagePath).map(async f => {
      try { urlHarita[f.id] = await taramaFotoUrl(f.storagePath) } catch { urlHarita[f.id] = '' }
    }))
    return dokumListe.map(f => {
      let oran = f.kdvOran != null ? Number(f.kdvOran) : null
      if (oran == null && f.kdv && f.matrah) {
        const hesap = (Number(f.kdv) / Number(f.matrah)) * 100
        for (const o of [1, 5, 8, 10, 20]) if (Math.abs(hesap - o) < 0.6) { oran = o; break }
      }
      const kdvDeger = n2(f.kdv)
      const kdvler = { 1: '0', 5: '0', 10: '0', 20: '0' }
      let digerOran = '', digerKdv = ''
      if (oran != null && oran in kdvler) kdvler[oran] = kdvDeger || '0'
      else if (oran != null && f.kdv) { digerOran = String(oran); digerKdv = kdvDeger }
      const saat = f.createdAt ? String(f.createdAt).slice(11, 16) : ''
      return [
        f.satici || '', '', '', f.vkn || '',
        (f.tarih || '').split('-').reverse().join('.'), saat, f.fisNo || '', f.zNo != null ? String(f.zNo).padStart(4, '0') : '',
        '',
        kdvler[1], kdvler[5], kdvler[10], kdvler[20],
        digerOran, digerKdv, n2(f.kdv), n2(f.toplam),
        `${AYLAR[(f.donemAy || 1) - 1]} ${f.donemYil || ''}`,
        f.kategori || '',
        f.durum === 'islendi' ? 'Onaylandı' : 'Kontrol bekliyor',
        '', urlHarita[f.id] || '',
      ]
    })
  }

  const csvIndir = async (tip) => {
    try {
      if (!dokumListe.length) { setYukleme('Seçilen müşteri/dönemde fiş yok — ay ve yıl seçimini kontrol edin.'); return }
      const satirlar = await fisCsvSatirlari()
      const hucre = (v) => (typeof v === 'string' && /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
      const ayirici = tip === 'csv-musteravir' ? ';' : ','
      const icerik = '\uFEFF' + [FIS_CSV_BASLIK, ...satirlar].map(r => r.map(hucre).join(ayirici)).join('\n')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([icerik], { type: 'text/csv;charset=windows-1254' }))
      a.download = `fisler_${yukYil}_${String(yukAy).padStart(2, '0')}_${Date.now()}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setYukleme('CSV indirildi (' + dokumListe.length + ' kayıt).')
    } catch (e) { setHata('CSV hatası: ' + (e?.message || e)) }
  }

  // Z raporu satır hesabı (Excel + Luca CSV ortak):
  // 1) Tek oran testi — KDV/matrah oranı %1/%10/%20'ye yakınsa tüm tutar o kolona,
  //    KDV fişte okunan gerçek değerle (kuruş birebir), satış = matrah+KDV.
  //    (%1 fişleri %10'a zorlayan "SATIŞ 122.319 / KDV 11.119" hatasını önler.)
  // 2) Uymazsa %10/%20 karışım çözümü: m20 = 10K − M (kalan m10).
  const zSatirHesapla = (f) => {
    const n2 = (x) => Math.round((Number(x) || 0) * 100) / 100
    const detaylar = fisDetaylariniDogrula(f.kdvDetaylari, f.matrah, f.kdv, f.toplam)
    if (!detaylar.length) {
      // Fallback: KDV oranini matrah/kdv/toplam'dan tahmin et
      const oranTahmin = f.kdv && f.matrah ? Math.round((Number(f.kdv) / Number(f.matrah)) * 100) : null
      if (oranTahmin && [1, 10, 20].includes(oranTahmin)) {
        const toplam = n2(Number(f.matrah) + Number(f.kdv))
        return { s0: 0, s1: oranTahmin === 1 ? toplam : 0, s10: oranTahmin === 10 ? toplam : 0, s20: oranTahmin === 20 ? toplam : 0, m1: oranTahmin === 1 ? n2(f.matrah) : 0, m10: oranTahmin === 10 ? n2(f.matrah) : 0, m20: oranTahmin === 20 ? n2(f.matrah) : 0, k1: oranTahmin === 1 ? n2(f.kdv) : 0, k10: oranTahmin === 10 ? n2(f.kdv) : 0, k20: oranTahmin === 20 ? n2(f.kdv) : 0 }
      }
      throw new Error(`${f.fisNo || f.satici || 'Z raporu'}: KDV oranları doğrulanamadı; kaynak dökümü kontrol edin.`)
    }
    const r = { s0: 0, s1: 0, s10: 0, s20: 0, m1: 0, m10: 0, m20: 0, k1: 0, k10: 0, k20: 0 }
    for (const detay of detaylar) {
      if (![0, 1, 10, 20].includes(detay.oran)) throw new Error(`Bu Z raporu şablonu %${detay.oran} oranını desteklemiyor; Fiş Kalemleri Excel dökümünü kullanın.`)
      r[`s${detay.oran}`] = n2(detay.matrah + detay.kdv)
      if (detay.oran) {
        r[`m${detay.oran}`] = n2(detay.matrah)
        r[`k${detay.oran}`] = n2(detay.kdv)
      }
    }
    return r
  }

  // Excel dökümü — Elle Ekle formatında, 2 sayfa: "Z Raporu" (15 kolon) + "Gider Fişi" (7 kolon)
  // Filtre çubuğundaki seçime göre (satıcı/durum/kaynak) görünür listeden alır; dönem üstteki seçimden gelir
  const fisExcelIndir = async () => {
    try {
      const liste = gorunen
      if (!liste.length) { setYukleme('Filtreye uyan fiş yok — arama/filtre seçimini kontrol edin.'); return }
      const XLSX = await import('xlsx')
      const n2 = (x) => Math.round((Number(x) || 0) * 100) / 100
      const trg = tarihGgAaYyyy
      const yerTutucuMu = (v) => !v || /^(ZR|FİŞ)-M$/i.test(String(v))
      const oranBul = (f) => f.kdvOran != null ? Number(f.kdvOran) : null
      // Z raporları: ortak hesap (tek oran testi + %10/%20 karışım)
      const zVeri = liste.filter(f => f.kaynak === 'zrapor' || f.tur === 'Z RAPORU').map((f, i) => {
        const r = zSatirHesapla(f)
        const nakit = f.nakit != null ? n2(f.nakit) : ''
        const kredi = f.kredi != null ? n2(f.kredi) : ''
        const evrakNo = yerTutucuMu(f.fisNo) ? (f.zNo != null ? String(f.zNo) : String(i + 1)) : String(f.fisNo)
        return [trg(f.tarih), evrakNo, (f.satici || 'Z RAPORU').replace(/;/g, ' '),
          r.s0, r.s1, r.s10, r.s20, nakit, kredi,
          r.m1, r.m10, r.m20, r.k1, r.k10, r.k20]
      })
      // Gider fişleri: tek oranlı 7 kolon
      const gVeri = liste.filter(f => String(f.tur || '').includes('GİDER')).flatMap(fisOranSatirlari).map(f => {
        const oran = oranBul(f)
        return [trg(f.tarih), f.fisNo != null && !yerTutucuMu(f.fisNo) ? String(f.fisNo) : '',
          (f.satici || f.unvan || '').replace(/;/g, ' '),
          oran != null ? oran : '', n2(f.toplam), n2(f.matrah), n2(f.kdv), f.nakit ?? '', f.kredi ?? '']
      })
      const zBaslik = ['TARİH', 'EVRAK NO', 'AÇIKLAMA', 'SATIŞ 0', 'SATIŞ 1', 'SATIŞ 10', 'SATIŞ 20', 'NAKİT', 'KREDİ K', 'MATRAH 1', 'MATRAH 10', 'MATRAH 20', 'KDV 1', 'KDV 10', 'KDV 20']
      const gBaslik = ['FİŞ TARİHİ', 'FİŞ NO', 'ÜNVANI', 'KDV ORANI', 'TOPLAM', 'KDV MATRAHI', 'KDV TUTARI', 'NAKİT (BELGE TOPLAMI)', 'KREDİ KARTI (BELGE TOPLAMI)']
      const zToplam = zBaslik.slice(3).map((_, ci) => zVeri.reduce((a, r) => a + (Number(r[ci + 3]) || 0), 0))
      const gToplam = gBaslik.slice(4).map((_, ci) => gVeri.reduce((a, r) => a + (Number(r[ci + 4]) || 0), 0))
      const wb = XLSX.utils.book_new()
      const zWs = XLSX.utils.aoa_to_sheet([zBaslik, ...zVeri, ['TOPLAM', '', '', ...zToplam]])
      zWs['!cols'] = zBaslik.map(() => ({ wch: 13 }))
      XLSX.utils.book_append_sheet(wb, zWs, 'Z Raporu')
      const gWs = XLSX.utils.aoa_to_sheet([gBaslik, ...gVeri, ['TOPLAM', '', '', '', ...gToplam]])
      gWs['!cols'] = gBaslik.map(() => ({ wch: 16 }))
      XLSX.utils.book_append_sheet(wb, gWs, 'Gider Fişi')
      XLSX.writeFile(wb, `fisler_${yukYil}_${String(yukAy).padStart(2, '0')}_${Date.now()}.xlsx`)
      setYukleme(`Excel indirildi — Z Raporu: ${zVeri.length}, Gider Fişi: ${gVeri.length} kayıt (filtre seçimine göre).`)
    } catch (e) { setHata('Excel hatası: ' + (e?.message || e)) }
  }

  // Luca "Hızlı Fiş Aktarım" CSV şablonu (36 kolon) — hizli_fis_aktarim.csv ile birebir (PLAKA NO yalnızca Excel şablonunda)
  const LUCA_BASLIK = ['İŞLEM', 'KATEGORİ', 'BELGE TURU', 'EVRAK TARİHİ', 'KAYIT TARİHİ', 'SERİ NO', 'EVRAK NO', 'TCKN/VKN', 'VERGİ DAİRESİ', 'SOYADI ÜNVAN', 'ADI DEVAMI', 'ADRES', 'CARİ HESAP', 'KDV İSTİSNASI', 'KOD', 'BELGE TÜRÜ(DB)', 'ALIŞ/SATIŞ TÜRÜ', 'KAYIT ALT TÜRÜ', 'MAL VE HİZMET KODU', 'AÇIKLAMA', 'MİKTAR', 'B.FİYAT', 'TUTAR', 'TEVKİFAT', 'KDV ORANI', 'ÖZEL MATRAH İŞLEM BEDELİ', 'MATRAHTAN DÜŞÜLECEK TUTAR', 'MATRAHA DAHİL OLMAYAN BEDEL', 'KDV TUTARI', 'TOPLAM TUTAR', 'KREDİLİ TUTAR', 'STOPAJ KODU', 'STOPAJ TUTARI', 'DÖNEMSELLİK İLKESİ', 'FAALIYET KODU', 'ÖDEME TÜRÜ']

  // Luca biçimi: 8.033,34 (binlik nokta, ondalık virgül); tarih 17/09/2026
  const sayi = (x) => {
    if (x == null || x === '' || Number(x) === 0) return '0'
    return Number(x).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  const lucaSatirlari = (liste = dokumListe) => {
    const satirlar = [LUCA_BASLIK]
    let siraNo = 1
    for (const f of liste) {
      const tarih = (f.tarih || '').split('-').reverse().join('/')
      const zMi = f.kaynak === 'zrapor' || f.tur === 'Z RAPORU'
      // Evrak no = Z no: gerçek Z numarası (zrapor kaydından) veya elle girilen evrak no;
      // bölünen (%20+%10) satırlar dahil tüm satırlara aynı numara yazılır. Yoksa sıra no.
      const yerTutucu = !f.fisNo || /^(ZR|FİŞ)-M$/i.test(String(f.fisNo))
      const evrakNo = yerTutucu ? (zMi && f.zNo != null ? String(f.zNo) : String(siraNo)) : String(f.fisNo)
      siraNo++
      const parcalar = fisDetaylariniDogrula(f.kdvDetaylari, f.matrah, f.kdv, f.toplam)
      if (!parcalar.length) throw new Error(`${evrakNo}: KDV oranları doğrulanamadı; kaynak belgeyi kontrol edin.`)
      // Bölünen satırlar aynı evrak no'yu (Z no) paylaşır
      // KREDİLİ TUTAR yalnızca ilk satıra yazılır (her satıra tekrarlanmaz, Luca'da çift sayılmasın)
      // FAALİYET KODU: müşteri kartındaki NACE kodu (Z raporu satırlarında)
      const krediTutar = f.kredi != null && Number.isFinite(Number(f.kredi)) ? Number(f.kredi) : null
      const faaliyetKodu = zMi ? (f.naceKodu || '') : ''
      parcalar.forEach((p, pi) => {
        satirlar.push([
          zMi ? 'Gelir' : 'Gider',
          'Defter Fişleri',
          zMi ? 'Z Raporu' : 'Meslek Gideri',
          tarih, tarih,
          '',
          evrakNo,
          zMi ? '' : (f.vkn || ''),
          '', '', '', '', '', '',
          zMi ? '' : (f.kategori || ''),
          zMi ? 'Z Raporu' : 'ÖKC Fişi',
          zMi ? 'Normal Satışlar' : 'Normal Alımlar',
          'Mal Satışı',
          '0',
          (zMi ? (f.satici || 'Z Raporu') : (f.satici || f.vkn || 'Fiş')).replace(/;/g, ' '),
          '0', '0',
          sayi(p.matrah),
          'Yok',
          String(p.oran),
          '0', '0', '0',
          sayi(p.kdv),
          sayi(p.matrah + p.kdv),
          pi === 0 && krediTutar != null ? sayi(krediTutar) : '', '', '', '', faaliyetKodu, '',
        ])
      })
    }
    return satirlar
  }

  // Metni Windows-1254 (ANSI Türkçe) baytlarına çevirir — Luca CSV bu kodlamayı bekler
  const win1254 = (str) => {
    const ozel = { 'Ğ': '\xD0', 'ğ': '\xF0', 'İ': '\xDD', 'ı': '\xFD', 'Ş': '\xDE', 'ş': '\xFE' }
    let out = ''
    for (const ch of String(str)) {
      if (ozel[ch]) out += ozel[ch]
      else {
        const c = ch.codePointAt(0)
        out += (c > 255 ? '?' : String.fromCharCode(c))
      }
    }
    return out
  }

  // Luca "Z Raporu" CSV şablonu (15 kolon) — Z RAPORU YYY.xlsm ile birebir
  const Z_CSV_BASLIK = ['TARİH', 'EVRAK NO', 'AÇIKLAMA', 'SATIŞ 0', 'SATIŞ 1', 'SATIŞ 10', 'SATIŞ 20', 'NAKİT', 'KREDİ K', 'MATRAH 1', 'MATRAH 10', 'MATRAH 20', 'KDV 1', 'KDV 10', 'KDV 20']

  const lucaZSatirlari = () => {
    const zler = dokumListe.filter(f => f.kaynak === 'zrapor' || f.tur === 'Z RAPORU')
    const satirlar = [Z_CSV_BASLIK]
    let siraNo = 1
    for (const f of zler) {
      const tarih = (f.tarih || '').split('-').reverse().join('.')
      // Evrak no = Z no; bölünen satır yok — her Z raporu tek satır
      const yerTutucu = !f.fisNo || /^(ZR|FİŞ)-M$/i.test(String(f.fisNo))
      const evrakNo = yerTutucu ? (f.zNo != null ? String(f.zNo) : String(siraNo)) : String(f.fisNo)
      siraNo++
      // Ortak hesap: tek oran (%1/%10/%20) → o kolona; karışımsa %10/%20 çözümü
      const r = zSatirHesapla(f)
      const nakit = f.nakit != null ? Number(f.nakit) : null
      const kredi = f.kredi != null ? Number(f.kredi) : null
      satirlar.push([
        tarih, evrakNo, (f.satici || 'Z RAPORU').replace(/;/g, ' '),
        sayi(r.s0), sayi(r.s1), sayi(r.s10), sayi(r.s20),
        sayi(nakit), sayi(kredi),
        sayi(r.m1), sayi(r.m10), sayi(r.m20),
        sayi(r.k1), sayi(r.k10), sayi(r.k20),
      ])
    }
    return satirlar
  }

  // Luca "Gider Fişi" CSV şablonu (7 kolon) — BOŞ ALDIĞI FİŞLER.xlsm ile birebir
  const GIDER_CSV_BASLIK = ['FİŞ TARİHİ', 'FİŞ NO', 'ÜNVANI', 'KDV ORANI', 'TOPLAM', 'KDV MATRAHI', 'KDV TUTARI']

  const lucaGiderSatirlari = () => {
    const giderler = dokumListe.filter(f => String(f.tur || '').includes('GİDER')).flatMap(fisOranSatirlari)
    const satirlar = [GIDER_CSV_BASLIK]
    let siraNo = 1
    for (const f of giderler) {
      const tarih = (f.tarih || '').split('-').reverse().join('.')
      const yerTutucu = !f.fisNo || /^FİŞ-M$/i.test(String(f.fisNo))
      const fisNo = yerTutucu ? String(siraNo) : String(f.fisNo)
      siraNo++
      const M = Number(f.matrah) || 0, K = Number(f.kdv) || 0
      const oran = f.kdvOran != null ? Number(f.kdvOran) : null
      if (oran == null) throw new Error(`${fisNo}: KDV oranı doğrulanamadı; kaynak belgeyi kontrol edin.`)
      satirlar.push([
        tarih, fisNo, (f.satici || f.unvan || '').replace(/;/g, ' '),
        oran != null ? String(oran) : '',
        sayi(f.toplam), sayi(M), sayi(K),
      ])
    }
    return satirlar
  }

  const csv1254Indir = (satirlar, dosyaAdi, mesaj) => {
    const icerik = win1254(satirlar.map(r => r.join(';')).join('\r\n'))
    const bayt = new Uint8Array(icerik.length)
    for (let i = 0; i < icerik.length; i++) bayt[i] = icerik.charCodeAt(i)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([bayt], { type: 'text/csv;charset=windows-1254' }))
    a.download = dosyaAdi
    document.body.appendChild(a)
    a.click()
    a.remove()
    setYukleme(mesaj)
  }

  const lucaZCsvIndir = () => {
    try {
      const zler = dokumListe.filter(f => f.kaynak === 'zrapor' || f.tur === 'Z RAPORU')
      if (!zler.length) { setYukleme('Seçilen müşteri/dönemde Z raporu yok — ay ve yıl seçimini kontrol edin.'); return }
      csv1254Indir(lucaZSatirlari(), `luca_z_raporu_${yukYil}_${String(yukAy).padStart(2, '0')}_${Date.now()}.csv`, `Luca Z Raporu CSV indirildi (${zler.length} kayıt).`)
    } catch (e) { setHata('Luca Z Raporu CSV hatası: ' + (e?.message || e)) }
  }

  const lucaGiderCsvIndir = () => {
    try {
      const giderler = dokumListe.filter(f => String(f.tur || '').includes('GİDER'))
      if (!giderler.length) { setYukleme('Seçilen müşteri/dönemde gider fişi yok — ay ve yıl seçimini kontrol edin.'); return }
      csv1254Indir(lucaGiderSatirlari(), `luca_gider_fisi_${yukYil}_${String(yukAy).padStart(2, '0')}_${Date.now()}.csv`, `Luca Gider Fişi CSV indirildi (${giderler.length} kayıt).`)
    } catch (e) { setHata('Luca Gider Fişi CSV hatası: ' + (e?.message || e)) }
  }

  // Luca İşletme Defteri (36 kolon hizli_fis_aktarim şablonu) — Z Rapor düğmesi: tüm kayıtlar
  const lucaIsletmeZCsvIndir = () => {
    try {
      if (!dokumListe.length) { setYukleme('Seçilen müşteri/dönemde fiş yok — ay ve yıl seçimini kontrol edin.'); return }
      csv1254Indir(lucaSatirlari(), `luca_isletme_z_rapor_${yukYil}_${String(yukAy).padStart(2, '0')}_${Date.now()}.csv`, `Luca İşletme Z Rapor CSV indirildi (${dokumListe.length} kayıt).`)
    } catch (e) { setHata('Luca İşletme Z Rapor CSV hatası: ' + (e?.message || e)) }
  }

  // Luca İşletme Gider (aynı 36 kolon şablon) — yalnızca gider fişi satırları
  const lucaIsletmeGiderCsvIndir = () => {
    try {
      const giderler = dokumListe.filter(f => String(f.tur || '').includes('GİDER'))
      if (!giderler.length) { setYukleme('Seçilen müşteri/dönemde gider fişi yok — ay ve yıl seçimini kontrol edin.'); return }
      csv1254Indir(lucaSatirlari(giderler), `luca_isletme_gider_${yukYil}_${String(yukAy).padStart(2, '0')}_${Date.now()}.csv`, `Luca İşletme Gider CSV indirildi (${giderler.length} kayıt).`)
    } catch (e) { setHata('Luca İşletme Gider CSV hatası: ' + (e?.message || e)) }
  }

  // Fiş Kalemleri (Excel): fiş özetleri xlsx olarak
  const fisKalemleriExcel = async () => {
    try {
      if (!dokumListe.length) { setYukleme('Seçilen müşteri/dönemde fiş yok — ay ve yıl seçimini kontrol edin.'); return }
      const XLSX = await import('xlsx')
    const veri = dokumListe.flatMap(fisOranSatirlari).map((f, i) => ({
      'Sıra': i + 1,
      'Tarih': tarihGgAaYyyy(f.tarih),
      'Satıcı': f.satici || '',
      'VKN': f.vkn || '',
      'Kategori': f.kategori || '',
      'Cari': f.cari || '',
      'Matrah': f.matrah ?? '',
      'KDV': f.kdv ?? '',
      'KDV Oranı': f.kdvOran != null ? `%${f.kdvOran}` : '',
      'Toplam': f.toplam ?? '',
      'Nakit (belge toplamı)': f.nakit ?? '',
      'Kredi Kartı (belge toplamı)': f.kredi ?? '',
      'Müşteri': f.musteriAd,
      'Durum': f.durum,
      'Kaynak': f.kaynak,
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(veri), 'Fişler')
    XLSX.writeFile(wb, `Fis_Kalemleri_${yukYil}_${String(yukAy).padStart(2, '0')}_${Date.now()}.xlsx`)
    setYukleme('Fiş Kalemleri Excel indirildi (' + dokumListe.length + ' kayıt).')
    } catch (e) { setHata('Fiş Kalemleri hatası: ' + (e?.message || e)) }
  }

  const dosyaSecildi = async (e) => {
    const dosyalar = [...(e.target.files || [])]
    if (!dosyalar.length) return
    if (!yukMusteri) { setYukleme('Önce fişin ait olduğu müşteriyi seçin.'); return }
    setYukleme(`Yükleniyor… 0/${dosyalar.length}`)
    const { data: { user } } = await supabase.auth.getUser()
    let ok = 0, hatali = 0
    for (const dosya of dosyalar) {
      try {
        await fisYukle({ clientId: yukMusteri, yil: yukYil, ay: yukAy, file: dosya, yukleyenId: user?.id })
        ok++
      } catch { hatali++ }
      setYukleme(`Yükleniyor… ${ok + hatali}/${dosyalar.length}`)
    }
    setYukleme(`${ok} fiş yüklendi${hatali ? `, ${hatali} hatalı` : ''}. Hesaplara ayırma "İşle" adımında yapılır.`)
    e.target.value = ''
    yukle()
  }

  const elleAc = (tip) => {
    if (!yukMusteri) { setHata('Elle ekleme için önce üstte müşteri seçin.'); return }
    setElleTip(tip)
    setElleSatirlar([elleBosSatir(tip)])
    setElleMenuAcik(false)
    setHata('')
    setElleAcik(true)
  }

  const elleKaydet = async () => {
    if (!yukMusteri) { setHata('Önce müşteri seçin.'); return }
    const dolu = elleSatirlar.filter(s => elleSatirHesap(s).toplam > 0)
    if (!dolu.length) { setHata('En az bir satıra tutar girin.'); return }
    // Seçilen dönemden farklı tarihli satırlar için uyarı
    const farkli = dolu.filter(s => donemUyumsuz(s.tarih, yukYil, yukAy))
    if (farkli.length && !window.confirm(`${farkli.length} satırın tarihi seçilen dönemden (${AYLAR[yukAy - 1]} ${yukYil}) farklı. Yine de kaydedilsin mi?`)) return
    setElleKaydediyor(true)
    setHata('')
    const isoTarih = (t) => {
      const rakam = String(t || '').replace(/\D/g, '')
      if (rakam.length >= 8) return `${rakam.slice(4, 8)}-${rakam.slice(2, 4)}-${rakam.slice(0, 2)}`
      if (rakam.length === 6) return `20${rakam.slice(4, 6)}-${rakam.slice(2, 4)}-${rakam.slice(0, 2)}`
      return `${SIMDI.getFullYear()}-${String(SIMDI.getMonth() + 1).padStart(2, '0')}-${String(SIMDI.getDate()).padStart(2, '0')}`
    }
    try {
      for (const s of dolu) {
        if (elleTip === 'z') {
          await fisManuelEkle({
            clientId: yukMusteri,
            tip: 'z',
            tarih: isoTarih(s.tarih),
            evrakNo: s.evrakNo,
            aciklama: s.aciklama,
            satis: { s0: sayiAl(s.s0), s1: sayiAl(s.s1), s10: sayiAl(s.s10), s20: sayiAl(s.s20) },
            nakit: elleSatirHesap(s).nakit,
          })
        } else {
          await fisManuelEkle({
            clientId: yukMusteri,
            tip: 'fis',
            tarih: isoTarih(s.tarih),
            evrakNo: s.faturaNo,
            aciklama: s.unvan,
            toplam: sayiAl(s.toplam),
            kdvOran: sayiAl(s.kdvOran),
          })
        }
      }
      setElleAcik(false)
      setElleSatirlar([elleBosSatir(elleTip)])
      setYukleme(`${dolu.length} satır kaydedildi.`)
      yukle()
    } catch (e) { setHata(e?.message || 'Kaydedilemedi') }
    finally { setElleKaydediyor(false) }
  }

  const sil = async (f) => {
    if (!window.confirm(`${f.satici || f.vkn || 'Fiş'} kaydı silinsin mi?`)) return
    try {
      if (f.kaynak === 'zrapor' && f.zRaporId) {
        const { deleteZReport } = await import('../services/zReportService')
        await deleteZReport(f.zRaporId)
      } else if (f.kaynak === 'manuel' && f.faturaId) {
        const { error } = await supabase.from('efatura_faturalar').delete().eq('id', f.faturaId)
        if (error) throw error
      } else {
        await taramaSil(f.id, f.storagePath)
      }
      yukle()
    } catch (e) { setHata(e?.message || 'Silinemedi') }
  }

  const tumunuSec = (e) => {
    setSecili(e.target.checked ? new Set(gorunen.map(f => f.id)) : new Set())
  }
  const tekSec = (id) => setSecili(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  // Seçili fişleri toplu sil (Z raporu / gider fişi — elle girilen dahil tüm kaynaklar)
  const seciliSil = async () => {
    if (!secili.size) return
    if (!window.confirm(`${secili.size} kayıt silinsin mi? Bu işlem geri alınamaz.`)) return
    setYukleniyor(true)
    let silinen = 0, hatali = 0
    for (const f of gorunen) {
      if (!secili.has(f.id)) continue
      try {
        if (f.kaynak === 'zrapor' && f.zRaporId) {
          const { deleteZReport } = await import('../services/zReportService')
          await deleteZReport(f.zRaporId)
        } else if (f.kaynak === 'manuel' && f.faturaId) {
          const { error } = await supabase.from('efatura_faturalar').delete().eq('id', f.faturaId)
          if (error) throw error
        } else {
          await taramaSil(f.id, f.storagePath)
        }
        silinen++
      } catch { hatali++ }
    }
    setSecili(new Set())
    setYukleniyor(false)
    if (hatali) setHata(`${silinen} kayıt silindi, ${hatali} kayıt silinemedi.`)
    else setYukleme(`${silinen} kayıt silindi.`)
    yukle()
  }

  return (
    <div className="p-4 md:p-6 max-w-[1500px] mx-auto">
      {/* Üst başlık */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
            <Receipt className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Fişler</h1>
            <p className="text-gray-400 text-sm">
              Toplam {fisler?.length ?? '…'} fiş
              <span className="text-amber-400 ml-2">Bu ay: {buAySayi} fiş</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={yukMusteri} onChange={e => setYukMusteri(e.target.value)} className="bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm min-w-[170px]">
            <option value="">Tüm müşteriler</option>
            {sortClients(musteriler).map(m => <option key={m.id} value={m.id}>{clientDisplayName(m)}</option>)}
          </select>
          <select value={yukAy} onChange={e => setYukAy(Number(e.target.value))} className="bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
            {AYLAR.map((a, i) => <option key={a} value={i + 1}>{a}</option>)}
          </select>
          <select value={yukYil} onChange={e => setYukYil(Number(e.target.value))} className="bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
            {[SIMDI.getFullYear(), SIMDI.getFullYear() - 1, SIMDI.getFullYear() - 2].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => { if (!yukMusteri) { setYukleme('Yükleme için önce müşteri seçin.'); return } dosyaRef.current?.click() }}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">
            <Upload className="w-4 h-4" /> Fiş Yükle
          </button>
          <div className="relative">
            <button onClick={() => setElleMenuAcik(a => !a)}
              className="flex items-center gap-2 border border-white/30 hover:bg-white/10 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">
              <Pencil className="w-4 h-4" /> Elle Ekle <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {elleMenuAcik && (
              <div className="absolute left-0 z-50 mt-1 w-44 bg-[#0e1d42] border border-blue-700/50 rounded-lg shadow-2xl overflow-hidden">
                <button onClick={() => elleAc('z')} className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-blue-800/60 transition">
                  Z Raporu
                </button>
                <button onClick={() => elleAc('fis')} className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-blue-800/60 transition border-t border-blue-800/40">
                  Gider Fişi
                </button>
              </div>
            )}
          </div>
          <input ref={dosyaRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={dosyaSecildi} />
          <button onClick={yukle} disabled={yukleniyor} className="flex items-center gap-2 bg-blue-900/60 hover:bg-blue-800 text-blue-200 rounded-lg px-3 py-2 text-sm font-medium transition">
            {yukleniyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
        </div>
        {/* Dökümler: aynı müşteri + dönem seçimine göre indirme */}
        <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-blue-800/40">
          <span className="text-gray-500 text-xs tabular-nums mr-1">{dokumListe.length} fiş</span>
          <button onClick={lucaIsletmeZCsvIndir}
            className="flex items-center gap-2 bg-violet-700 hover:bg-violet-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">
            <FileText className="w-4 h-4" /> Luca İşletme Z Rapor CSV
          </button>
          <button onClick={lucaIsletmeGiderCsvIndir}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">
            <FileText className="w-4 h-4" /> Luca İşletme Gider CSV
          </button>
          <button onClick={lucaZCsvIndir}
            className="flex items-center gap-2 bg-teal-700 hover:bg-teal-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">
            <FileText className="w-4 h-4" /> Luca Z Raporu
          </button>
          <button onClick={lucaGiderCsvIndir}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">
            <FileText className="w-4 h-4" /> Luca Gider Fiş
          </button>
        </div>
      </div>
      {yukleme && <div className="mb-3 bg-cyan-500/10 border border-cyan-500/25 text-cyan-200 text-sm rounded-lg px-4 py-2">{yukleme}</div>}

      <BilgisayarTarama musteri={yukMusteri}
        musteriAd={musteriler.find(m => String(m.id) === String(yukMusteri))?.name || ''}
        yil={yukYil} ay={yukAy} onGonderildi={yukle} />

      {/* Özet kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4">
          <div className="text-gray-400 text-sm">Harcama</div>
          <div className="text-white text-xl font-bold tabular-nums mt-1">{tl(ozet.harcama)} ₺</div>
          <div className="text-gray-500 text-xs mt-1">{gorunen.length} fiş</div>
        </div>
        <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4">
          <div className="text-gray-400 text-sm flex items-center gap-1.5"><Percent className="w-3.5 h-3.5" /> İndirilecek KDV</div>
          <div className="text-emerald-400 text-xl font-bold tabular-nums mt-1">{tl(ozet.kdv)} ₺</div>
          <div className="text-gray-500 text-xs mt-1">okunan fişlerdeki toplam KDV</div>
        </div>
        <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4">
          <div className="text-gray-400 text-sm flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Kontrol bekliyor</div>
          <div className="text-amber-400 text-xl font-bold tabular-nums mt-1">{ozet.bekleyen}</div>
          <div className="text-gray-500 text-xs mt-1">işlenmeyi bekleyen fiş</div>
        </div>
        <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4">
          <div className="text-gray-400 text-sm flex items-center gap-1.5"><CopyX className="w-3.5 h-3.5" /> Mükerrer</div>
          <div className="text-red-400 text-xl font-bold tabular-nums mt-1">{ozet.mukerrerSayi}</div>
          <div className="text-gray-500 text-xs mt-1">aynı VKN + tarih + tutar</div>
        </div>
      </div>

      {/* Filtreler — dönem üstteki müşteri + ay + yıl seçiminden gelir */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input value={arama} onChange={e => setArama(e.target.value)} placeholder="Satıcı ara…"
          className="bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm w-52" />
        <select value={durumFiltre} onChange={e => setDurumFiltre(e.target.value)} className="bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
          <option value="">Tüm durumlar</option>
          <option value="yeni">Yeni</option>
          <option value="islendi">İşlendi</option>
        </select>
        <select value={kaynakFiltre} onChange={e => setKaynakFiltre(e.target.value)} className="bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
          <option value="">Tüm kaynaklar</option>
          <option value="musteri">Müşteri girişi</option>
          <option value="mobil">Mobil</option>
          <option value="web">Panel</option>
          <option value="manuel">Manuel</option>
        </select>
        <button onClick={fisExcelIndir}
          title="Filtre seçimine göre görünen fişleri Excel olarak indir"
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">
          <FileSpreadsheet className="w-4 h-4" /> Excel
        </button>
        {secili.size > 0 && (
          <button onClick={seciliSil}
            title="Seçili fişleri toplu sil"
            className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">
            <Trash2 className="w-4 h-4" /> Seçilenleri Sil ({secili.size})
          </button>
        )}
        <div className="ml-auto text-gray-400 text-xs tabular-nums">{gorunen.length} / {fisler?.length || 0} fiş gösteriliyor</div>
      </div>

      {hata && <div className="mb-3 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-2">{hata}</div>}

      {/* Elle Ekle — Z Raporu / Gider Fişi tablosu (ortak bileşen) */}
      {elleAcik && (
        <FisElleEkleTablosu
          tip={elleTip}
          satirlar={elleSatirlar}
          setSatirlar={setElleSatirlar}
          yil={yukYil}
          ay={yukAy}
          baslik={`${elleTip === 'z' ? 'Z Raporu' : 'Gider Fişi'} — Elle Ekle`}
          bilgi={musteriler.find(m => String(m.id) === String(yukMusteri)) ? (
            <span className="text-cyan-300 font-semibold text-sm max-w-[240px] truncate" title="Üstte seçilen müşteri">
              {musteriler.find(m => String(m.id) === String(yukMusteri)).name}
            </span>
          ) : (
            <span className="text-amber-400 font-semibold text-sm">Müşteri seçilmedi — üstten seçin</span>
          )}
          ipucu="Tutarlar KDV dahildir — matrah ve KDV otomatik hesaplanır. Enter ile ilerler, son kolonda alt satıra geçer. Ctrl+D: üst satırı kopyalar."
          onKapat={() => setElleAcik(false)}
          kaydet={elleKaydet}
          kaydediyor={elleKaydediyor}
        />
      )}

      {/* Tablo */}
      <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-430px)] min-h-[200px]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-300">
                <th className="sticky top-0 z-10 bg-[#13224a] px-3 py-2.5 w-10">
                  <input type="checkbox" checked={gorunen.length > 0 && secili.size === gorunen.length} onChange={tumunuSec} className="accent-blue-500" />
                </th>
                <th className="sticky top-0 z-10 bg-[#13224a] px-3 py-2.5 font-semibold whitespace-nowrap">Tarih</th>
                <th className="sticky top-0 z-10 bg-[#13224a] px-3 py-2.5 font-semibold whitespace-nowrap">Satıcı</th>
                <th className="sticky top-0 z-10 bg-[#13224a] px-3 py-2.5 font-semibold whitespace-nowrap">Müşteri</th>
                <th className="sticky top-0 z-10 bg-[#13224a] px-3 py-2.5 font-semibold whitespace-nowrap">Kategori</th>
                <th className="sticky top-0 z-10 bg-[#13224a] px-3 py-2.5 font-semibold text-right whitespace-nowrap">Matrah</th>
                <th className="sticky top-0 z-10 bg-[#13224a] px-3 py-2.5 font-semibold text-right whitespace-nowrap">KDV Oranı</th>
                <th className="sticky top-0 z-10 bg-[#13224a] px-3 py-2.5 font-semibold text-right whitespace-nowrap">Toplam</th>
                <th className="sticky top-0 z-10 bg-[#13224a] px-3 py-2.5 font-semibold text-right whitespace-nowrap">KDV</th>
                <th className="sticky top-0 z-10 bg-[#13224a] px-3 py-2.5 font-semibold text-right whitespace-nowrap">Nakit</th>
                <th className="sticky top-0 z-10 bg-[#13224a] px-3 py-2.5 font-semibold text-right whitespace-nowrap">Kredi Kartı</th>
                <th className="sticky top-0 z-10 bg-[#13224a] px-3 py-2.5 font-semibold whitespace-nowrap">Durum</th>
                <th className="sticky top-0 z-10 bg-[#13224a] px-3 py-2.5 w-16" />
              </tr>
            </thead>
            <tbody>
              {gorunen.flatMap(fisOranSatirlari).map(f => (
                <tr key={f.satirKey || f.id} className={`border-t border-blue-900/30 hover:bg-blue-900/20 transition ${mukerrer.has(f.id) ? 'bg-red-950/20' : ''}`}>
                  <td className="px-3 py-2.5">
                    <input type="checkbox" checked={secili.has(f.id)} onChange={() => tekSec(f.id)} className="accent-blue-500" />
                  </td>
                  <td className="px-3 py-2.5 text-gray-300 whitespace-nowrap">{(f.tarih || '').split('-').reverse().join('.') || '—'}</td>
                  <td className="px-3 py-2.5 text-white max-w-[220px] truncate" title={f.satici || f.vkn || ''}>
                    {f.satici || <span className="text-gray-500">{f.vkn || 'Satıcı okunmadı'}</span>}
                    {mukerrer.has(f.id) && <span className="ml-2 text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/30 rounded px-1.5 py-0.5">Mükerrer</span>}
                  </td>
                  <td className="px-3 py-2.5 text-gray-400 max-w-[160px] truncate">{f.musteriAd}</td>
                  <td className="px-3 py-2.5 text-cyan-300 font-medium">{f.kategori || <span className="text-gray-600">—</span>}</td>
                  <td className="px-3 py-2.5 text-right text-gray-300 tabular-nums">{tl(f.matrah)}</td>
                  <td className="px-3 py-2.5 text-right text-cyan-300" title={f.fisDetayUyari || ''}>{f.kdvOran != null ? `%${f.kdvOran}` : 'Bilinmiyor'}</td>
                  <td className="px-3 py-2.5 text-right text-white tabular-nums">{tl(f.toplam)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-300 tabular-nums">{tl(f.kdv)}</td>
                  {['nakit', 'kredi'].map(alan => (
                    <td key={alan} className="px-3 py-2.5 text-right text-cyan-300 tabular-nums whitespace-nowrap">
                      {f.odemeDevamSatiri ? '—' : f[alan] == null ? 'Bilinmiyor' : tl(f[alan])}
                      {f.odemeBelgeToplami && !f.odemeDevamSatiri && <span className="block text-[10px] text-gray-500">Belge toplamı</span>}
                    </td>
                  ))}
                  <td className="px-3 py-2.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${f.durum === 'islendi' ? 'text-emerald-400 bg-emerald-500/10' : 'text-amber-400 bg-amber-500/10'}`}>
                      {f.durum === 'islendi' ? 'İşlendi' : 'Yeni'}
                    </span>
                    <span className="block text-gray-600 text-[10px] mt-0.5">
                      {f.kaynak === 'web' ? 'Panel' : f.kaynak === 'manuel' ? 'Manuel' : f.kaynak === 'zrapor' ? 'Z Raporu' : f.kaynak === 'musteri-manuel' ? 'Müşteri girişi' : 'Mobil'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      {f.storagePath && (
                        <button onClick={async () => { const u = await taramaFotoUrl(f.storagePath); if (u) window.open(u, '_blank') }}
                          className="p-1.5 rounded-md text-blue-300 hover:bg-blue-800/60" title="Fiş fotoğrafını aç">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => sil(f)} className="p-1.5 rounded-md text-red-400 hover:bg-red-900/40" title="Sil">
                        <span className="text-xs font-bold">✕</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {gorunen.length === 0 && (
            <div className="text-center py-10 text-gray-500 text-sm">Henüz fiş bulunmuyor. Panelden veya mobil uygulamadan yükleyin.</div>
          )}
        </div>
      </div>
    </div>
  )
}
