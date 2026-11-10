import { useState, useMemo } from 'react'
import { FileText, Download, ExternalLink, Info, Plus, Trash2, AlertTriangle, BookOpen } from 'lucide-react'
import { createUnicodePdf } from '../utils/unicodePdf'
import { parseTurkishNumber, formatTurkishInput, hamTutarGirdisi } from '../utils/numberFormat'

// ============================================================
// VERASET VE INTIKAL VERGISI BEYANNAMESI (1031 A)
// Bilgi ekrani + doldurulabilir beyanname + vergi hesabi + PDF cikti
// ============================================================

// 7338 sayili Kanun degisikligi sonrasi tarife / istisnalar (GIB genel tebligleri 56 ve 57)
const TARIFELER = {
  2025: {
    dilimler: [2400000, 5700000, 12000000, 24000000],
    verasetOran: [1, 3, 5, 7, 10],
    ivazsizOran: [10, 15, 20, 25, 30],
    istisnaFurug: 2316628,
    istisnaEs: 4636103,
    istisnaIvazsiz: 53339
  },
  2026: {
    dilimler: [3000000, 7000000, 15000000, 30000000],
    verasetOran: [1, 3, 5, 7, 10],
    ivazsizOran: [10, 15, 20, 25, 30],
    istisnaFurug: 2907136,
    istisnaEs: 5817845,
    istisnaIvazsiz: 66935
  }
}

const fmt = n => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Artan oranli dilim hesabi
function dilimVergisiHesapla(matrah, dilimler, oranlar) {
  let kalan = matrah
  let oncekiUst = 0
  let vergi = 0
  for (let i = 0; i < dilimler.length; i++) {
    const dilimMatrah = Math.min(kalan, dilimler[i] - oncekiUst)
    if (dilimMatrah <= 0) break
    vergi += dilimMatrah * oranlar[i] / 100
    kalan -= dilimMatrah
    oncekiUst = dilimler[i]
    if (kalan <= 0) break
  }
  if (kalan > 0) vergi += kalan * oranlar[oranlar.length - 1] / 100
  return vergi
}

// ---------- kucuk UI yardimcilari ----------

function Kutu({ children, className = '' }) {
  return <div className={`bg-blue-900/20 rounded-xl border border-blue-700/30 p-5 ${className}`}>{children}</div>
}

function Metin({ label, value, onChange, type = 'text', className = '', placeholder = '' }) {
  const isAmount = type === 'amount'
  return (
    <div className={className}>
      <label className="text-gray-400 text-xs block mb-1">{label}</label>
      <input
        type={isAmount ? 'text' : type}
        inputMode={isAmount ? 'decimal' : undefined}
        value={value}
        onChange={e => onChange(isAmount ? hamTutarGirdisi(e.target.value) : e.target.value)}
        onBlur={isAmount ? e => {
          const h = hamTutarGirdisi(e.target.value)
          if (!h || h === ',' || h === '.') { onChange(''); return }
          onChange(formatTurkishInput(h))
        } : undefined}
        placeholder={placeholder}
        className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-500" />
    </div>
  )
}

function Secim({ label, value, onChange, options, className = '' }) {
  return (
    <div className={className}>
      <label className="text-gray-400 text-xs block mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-500">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function SecimKutu({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-blue-700 bg-blue-900/30 text-yellow-500 focus:ring-yellow-500 cursor-pointer" />
      {label && <span className="text-gray-300 text-sm">{label}</span>}
    </label>
  )
}

function Sonuc({ label, value, highlight = false }) {
  return (
    <div className={`flex justify-between py-1.5 ${highlight ? 'border-t border-yellow-500/30 mt-1 pt-2' : ''}`}>
      <span className={`text-sm ${highlight ? 'text-yellow-400 font-semibold' : 'text-gray-400'}`}>{label}</span>
      <span className={`text-sm font-mono ${highlight ? 'text-yellow-400 font-bold' : 'text-white'}`}>{value}</span>
    </div>
  )
}

function TabloAlani({ label, value, onChange, amount = false, className = '' }) {
  return (
    <div className={className}>
      <label className="text-gray-500 text-[10px] block mb-0.5">{label}</label>
      <input
        type={amount ? 'text' : 'text'}
        inputMode={amount ? 'decimal' : undefined}
        value={value}
        onChange={e => onChange(amount ? hamTutarGirdisi(e.target.value) : e.target.value)}
        onBlur={amount ? e => {
          const h = hamTutarGirdisi(e.target.value)
          if (!h || h === ',' || h === '.') { onChange(''); return }
          onChange(formatTurkishInput(h))
        } : undefined}
        className="w-full bg-blue-900/30 border border-blue-700/40 rounded py-1.5 px-2 text-white text-xs focus:outline-none focus:border-yellow-500" />
    </div>
  )
}

// ---------- bilgi ekrani icerikleri ----------

const GEREKLI_BELGELER = [
  { b: 'Veraset Beyannamesi', t: 'Doldurularak tüm mirasçılar tarafından imzalanması gerekmektedir. Daireye ise işlem yapmak için mirasçılardan birinin gelmesi yeterlidir. Bu sayfadaki "Beyanname Doldur" bölümünden hazırlayıp PDF olarak indirebilirsiniz.' },
  { b: 'Veraset İlâmı (ASLI)', t: 'Noter veya Sulh Hukuk Mahkemesinden alınacak.' },
  { b: 'Emlak Vergisine Esas Değer Belgesi', t: 'Gayrimenkulün bulunduğu belediyeden alınacak ve ölüm yılına ait mühürlü ve imzalı olacak. İstanbul içindeki gayrimenkullerin orijinal Emlak Vergisine esas olan değeri ibraz edilmelidir.' },
  { b: 'Tapu', t: 'Tapunun ASLI veya FOTOKOPİSİ bulundurulması gerekmektedir (Tapu Müdürlüğünden alınacak).' },
  { b: 'Banka / Menkul Kıymet Belgesi', t: 'Varsa bankadaki net para veya menkul kıymetler tutarını gösterir belge. Döviz/Altın bulunması halinde ölüm tarihli Merkez Bankası Döviz Alış Kuru olmalı.' },
  { b: 'Araç Ruhsatı', t: 'Varsa araca ait ruhsat fotokopisi. Kasko değeri için www.tsb.org.tr (Türkiye Sigortalar Birliği / Kasko Değer Listesi) adresinden ulaşabilirsiniz.' },
  { b: 'Silah Ruhsatı', t: 'Varsa silaha ait ruhsat fotokopisi.' },
  { b: 'Şirket Bilançosu ve Gelir Tablosu', t: 'Şirketin aktifine kayıtlı gayrimenkullerin Emlak Vergisine esas olan değeri + tapu fotokopisi + varsa araç ruhsat fotokopisi. NOT: Bilanço ve gelir tablosu tarihleri KISMİ veya ölüm tarihinden ÖNCEKİ DÖNEM SONU olmalı. (Örn. ölüm 05.05.2022 ise: Kısmi → 01.01.2022-05.05.2022 kapsayan bilanço VEYA önceki dönem → 2021 yılına ait gelir tablosu.)' }
]

const VERGI_DAIRELERI = [
  { ad: 'Yeditepe Veraset ve Harçlar V.D.', liste: ['AVCILAR', 'BAĞCILAR', 'BAHÇELİEVLER', 'BAKIRKÖY', 'BAYRAMPAŞA', 'BAŞAKŞEHİR', 'ESENLER', 'FATİH', 'KÜÇÜKÇEKMECE', 'GÜNGÖREN', 'ZEYTİNBURNU', 'ARNAVUTKÖY (2012 ve öncesi)', 'GAZİOSMANPAŞA (2012 ve öncesi)', 'EYÜPSULTAN (2012 ve öncesi)', 'SULTANGAZİ (2012 ve öncesi)'], ilceler: 'AVCILAR, BAĞCILAR, BAHÇELİEVLER, BAKIRKÖY, BAYRAMPAŞA, BAŞAKŞEHİR, ESENLER, FATİH, KÜÇÜKÇEKMECE, GÜNGÖREN, ZEYTİNBURNU. (NOT: 2012 vefat yılı ve öncesi ARNAVUTKÖY, GAZİOSMANPAŞA, EYÜPSULTAN, SULTANGAZİ de Yeditepe yetki alanındadır.)' },
  { ad: 'Hisar Veraset ve Harçlar V.D.', liste: ['ARNAVUTKÖY', 'BEŞİKTAŞ', 'BEYOĞLU', 'EYÜPSULTAN', 'GAZİOSMANPAŞA', 'KAĞITHANE', 'SARIYER', 'SULTANGAZİ', 'ŞİŞLİ'], ilceler: 'ARNAVUTKÖY, BEŞİKTAŞ, BEYOĞLU, EYÜPSULTAN, GAZİOSMANPAŞA, KAĞITHANE, SARIYER, SULTANGAZİ, ŞİŞLİ. (2013 vefat yılı ve sonrası Arnavutköy, Gaziosmanpaşa, Eyüpsultan, Sultangazi bu dairenin yetki alanındadır.)' },
  { ad: 'Rıhtım Veraset ve Harçlar V.D.', liste: ['ADALAR', 'ATAŞEHİR', 'BEYKOZ', 'ÇEKMEKÖY', 'KADIKÖY', 'KARTAL', 'MALTEPE', 'PENDİK', 'ÜMRANİYE', 'SANCAKTEPE', 'SULTANBEYLİ', 'ŞİLE', 'TUZLA', 'ÜSKÜDAR'], ilceler: 'ADALAR, ATAŞEHİR, BEYKOZ, ÇEKMEKÖY, KADIKÖY, KARTAL, MALTEPE, PENDİK, ÜMRANİYE, SANCAKTEPE, SULTANBEYLİ, ŞİLE, TUZLA, ÜSKÜDAR. (01.03.2013-31.12.2015 arasında Şile’de ikamet edip vefat edenler Rıhtım’a aittir.)' },
  { ad: 'Silivri Vergi Dairesi', liste: ['SİLİVRİ'], ilceler: 'İkametgahı Silivri’de ise Silivri Vergi Dairesine verilmesi gerekmektedir.' },
  { ad: 'Büyükçekmece Vergi Dairesi', liste: ['BÜYÜKÇEKMECE', 'BEYLİKDÜZÜ', 'ÇATALCA', 'ESENYURT'], ilceler: 'BÜYÜKÇEKMECE, BEYLİKDÜZÜ, ÇATALCA, ESENYURT.' }
]

const RANDEVU_NOTLARI = [
  'Her vefat eden kişi adına TEK RANDEVU yeterlidir; tüm mirasçıların randevu almasına gerek yoktur. Beyanname tüm mirasçılarca imzalandıysa tek mirasçının veya vekilinin gelmesi yeterlidir.',
  'Veraset Beyannamesi, vefat edenin EN SON ikametgahının bulunduğu yer veraset vergi dairesine verilir.',
  'Randevu oluştururken vefat edenin/bağış yapanın T.C. kimlik numarası, ad ve soyad bilgileri nüfus kayıtlarındaki bilgilerle birebir aynı olmalıdır; aksi halde randevu iptal edilir.',
  'Randevunuzun oluşup oluşmadığını mükerrer kayıt oluşturmamak için önce RANDEVU SORGULA menüsünden vefat edenin T.C. kimlik numarasıyla kontrol edin; kayıt yoksa yeni giriş yapın. Yakın tarihli randevu dışındaki mükerrer kayıtlar iptal edilir.',
  'Her bir veraset beyannamesi için ayrı randevu oluşturulmalıdır.',
  'Bağışlarda: bağış yapan tarafından aynı güne yalnızca bir bağış için randevu alınabilir; diğer bağışların randevuları bağışta bulunulan kişi adına alınır. Bağışın yapıldığı yıla ait belediyeden Emlak Vergisine esas olan değer yazısı ile beyanname birlikte verilir.',
  'İntifa işlemlerinde: vefat yılına ait Emlak Vergisine esas olan değer belgesi, tapu ve veraset ve intikal beyannamesi verilir.',
  'Beyanname verme süresi: intikalin meydana geldiği tarihi izleyen aydan başlayarak 4’üncü ayın sonuna kadar beyanname verilir.'
]

// ============================================================

export default function VerasetIntikalBeyan() {
  const [sekme, setSekme] = useState('bilgi')

  // genel
  const [vdKodu, setVdKodu] = useState('')
  const [vdAdi, setVdAdi] = useState('')
  const [ilce, setIlce] = useState('')
  const [olayNo, setOlayNo] = useState('')
  const [intikalSekli, setIntikalSekli] = useState('veraset')
  const [intikalTarihi, setIntikalTarihi] = useState('')

  // tablo 1 - olunun / ivazsiz intikalde bulunanin
  const [o1, setO1] = useState({ vkn: '', soyadi: '', adi: '', babaAdi: '', meslek: '', olumYerTarih: '', ivazsizYerTarih: '', mahalle: '', cadde: '', kapiNo: '', daireNo: '', postaKodu: '', ilIlce: '' })

  // tablo 2 - mukellefler (mirascilar)
  const [mirascilar, setMirascilar] = useState([{ tckn: '', adSoyad: '', akrabalik: 'Çocuk', dogum: '', iletisim: '', pay: '' }])
  const mirasciEkle = () => setMirascilar(l => [...l, { tckn: '', adSoyad: '', akrabalik: 'Çocuk', dogum: '', iletisim: '', pay: '' }])
  const mirasciSil = i => setMirascilar(l => l.filter((_, x) => x !== i))
  const mirasciDegistir = (i, alan, deger) => setMirascilar(l => l.map((m, x) => x === i ? { ...m, [alan]: deger } : m))

  // tablo 3 - gayrimenkuller
  const [emlaklar, setEmlaklar] = useState([{ il: '', ilce: '', mahalle: '', sokak: '', kapiNo: '', cinsi: '', olcumTarihi: '', adaNo: '', parselNo: '', deger: '' }])
  const emlakEkle = () => setEmlaklar(l => [...l, { il: '', ilce: '', mahalle: '', sokak: '', kapiNo: '', cinsi: '', olcumTarihi: '', adaNo: '', parselNo: '', deger: '' }])
  const emlakSil = i => setEmlaklar(l => l.filter((_, x) => x !== i))
  const emlakDegistir = (i, alan, deger) => setEmlaklar(l => l.map((m, x) => x === i ? { ...m, [alan]: deger } : m))

  // tablo 4 - menkul mallar
  const [menkullar, setMenkullar] = useState([{ cinsi: '', yer: '', adet: '', hesapNo: '', deger: '' }])
  const menkulEkle = () => setMenkullar(l => [...l, { cinsi: '', yer: '', adet: '', hesapNo: '', deger: '' }])
  const menkulSil = i => setMenkullar(l => l.filter((_, x) => x !== i))
  const menkulDegistir = (i, alan, deger) => setMenkullar(l => l.map((m, x) => x === i ? { ...m, [alan]: deger } : m))

  // tablo 5 - indirilecek borclar
  const [borclar, setBorclar] = useState([{ cinsi: '', belgeCinsi: '', belgeTarihi: '', alacakli: '', adres: '', tutar: '' }])
  const borcEkle = () => setBorclar(l => [...l, { cinsi: '', belgeCinsi: '', belgeTarihi: '', alacakli: '', adres: '', tutar: '' }])
  const borcSil = i => setBorclar(l => l.filter((_, x) => x !== i))
  const borcDegistir = (i, alan, deger) => setBorclar(l => l.map((m, x) => x === i ? { ...m, [alan]: deger } : m))

  // vergi hesabi
  const intikalYili = intikalTarihi ? new Date(intikalTarihi).getFullYear() : new Date().getFullYear()
  const varsayilanYil = TARIFELER[intikalYili] ? intikalYili : (intikalYili > 2026 ? intikalYili : Math.max(2026, intikalYili))
  const [tarifeYili, setTarifeYili] = useState(null)
  const uygulananYil = tarifeYili || (TARIFELER[intikalYili] ? intikalYili : Math.max(2026, intikalYili))
  const tarife = TARIFELER[uygulananYil] || TARIFELER[2026]
  const [furugVar, setFurugVar] = useState(true)

  const hesap = useMemo(() => {
    const emlakToplam = emlaklar.reduce((t, e) => t + parseTurkishNumber(e.deger), 0)
    const menkulToplam = menkullar.reduce((t, m) => t + parseTurkishNumber(m.deger), 0)
    const borcToplam = borclar.reduce((t, b) => t + parseTurkishNumber(b.tutar), 0)
    const brutToplam = emlakToplam + menkulToplam
    const netToplam = brutToplam - borcToplam

    const payToplam = mirascilar.reduce((t, m) => t + (parseTurkishNumber(m.pay) || 0), 0)
    const oranlar = intikalSekli === 'veraset' ? tarife.verasetOran : tarife.ivazsizOran
    const kisiHesaplari = mirascilar.map(m => {
      const payOran = parseTurkishNumber(m.pay) || 0
      const hisse = netToplam * payOran / 100
      let istisna = 0
      if (intikalSekli === 'veraset') {
        const es = (m.akrabalik || '').toLowerCase().includes('eş') || (m.akrabalik || '').toLowerCase().includes('es')
        istisna = (!furugVar && es) ? tarife.istisnaEs : tarife.istisnaFurug
      } else {
        istisna = tarife.istisnaIvazsiz
      }
      const matrah = Math.max(0, hisse - istisna)
      const vergi = dilimVergisiHesapla(matrah, tarife.dilimler, oranlar)
      return { adSoyad: m.adSoyad || '-', payOran, hisse, istisna, matrah, vergi }
    })
    const toplamVergi = kisiHesaplari.reduce((t, k) => t + k.vergi, 0)
    return { emlakToplam, menkulToplam, borcToplam, brutToplam, netToplam, payToplam, kisiHesaplari, toplamVergi }
  }, [emlaklar, menkullar, borclar, mirascilar, intikalSekli, tarife, furugVar])

  const pdfOlustur = () => {
    const doc = createUnicodePdf()
    const T = s => String(s ?? '')
    const ink = '#1a2332'
    const muted = '#5a6b7e'
    const border = '#8a97a5'
    let y = 0

    const yeniSayfa = (baslik) => {
      doc.addPage()
      doc.setTextColor(ink)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.text(T(baslik), 105, 14, { align: 'center' })
      y = 22
    }

    // genel baslik (sayfa 1)
    const baslikCiz = () => {
      doc.setTextColor(ink)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.text('VERASET VE İNTİKAL VERGİSİ BEYANNAMESİ', 105, 16, { align: 'center' })
      doc.setFontSize(11)
      doc.text('1031 A', 180, 22)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.text('V.D.KODU', 180, 25.5)
      doc.setFontSize(8)
      doc.text('1', 24, 33); doc.text('2', 24, 40)
      doc.text(`${T(vdAdi)} Vergi Dairesi Müdürlüğüne`, 28, 33)
      doc.text(T(ilce), 28, 40)
      doc.text('İlçe', 28, 43.2)
      doc.text('3', 130, 33); doc.text(T(olayNo), 134, 33)
      doc.text('Olay Kayıt ve Hs. Def. Sıra No.', 134, 36.2)
      doc.text('(Vergi Dairesince Doldurulacaktır.)', 134, 39.2)
      doc.setFontSize(8)
      doc.text('İNTİKALİN ŞEKLİ(*)', 105, 33, { align: 'center' })
      doc.text(`${intikalSekli === 'veraset' ? 'X' : ''} Veraset      ${intikalSekli === 'ivazsiz' ? 'X' : ''} İvazsız İntikaller`, 105, 37, { align: 'center' })
      y = 50
    }

    // tablo basligi
    const tabloBasligi = (sol, sag) => {
      doc.setDrawColor(border); doc.setLineWidth(0.3)
      doc.rect(14, y - 4.5, 182, 7, 'FD')
      doc.rect(14, y - 4.5, 44, 7, 'FD')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
      doc.text(T(sol), 17, y)
      doc.text(T(sag), 105, y, { align: 'center' })
      y += 7
    }

    // grid tablo: basliklar + satirlar (mm cinsinden genislikler)
    const grid = (headers, widths, rows, { rowH = 6.5, fSize = 6.4 } = {}) => {
      doc.setDrawColor(border); doc.setLineWidth(0.25)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(fSize - 0.4)
      doc.setFillColor('#e9eef3')
      doc.rect(14, y, widths.reduce((a, b) => a + b, 0), 6, 'FD')
      let x = 14
      headers.forEach((h, i) => {
        doc.setTextColor(ink)
        const lines = doc.splitTextToSize(T(h), widths[i] - 1.5)
        doc.text(lines[0] || '', x + 0.8, y + 3.8)
        x += widths[i]
      })
      y += 6
      doc.setFont('helvetica', 'normal')
      rows.forEach(r => {
        if (y + rowH > 284) { yeniSayfa('VERASET VE İNTİKAL VERGİSİ BEYANNAMESİ (devam)') }
        doc.setFillColor('#ffffff')
        doc.rect(14, y, widths.reduce((a, b) => a + b, 0), rowH, 'FD')
        let cx = 14
        r.forEach((cell, i) => {
          doc.setTextColor(ink)
          const val = T(cell)
          let draw = val
          // kabaca kesme: hucre genisligine sigmayan uzun metinler
          const maxChars = Math.floor(widths[i] / (fSize * 0.19))
          if (val.length > maxChars) draw = val.slice(0, Math.max(1, maxChars - 1)) + '…'
          doc.text(draw, cx + 0.8, y + rowH - 2)
          cx += widths[i]
        })
        y += rowH
      })
    }

    const toplamSatiri = (label, deger, widths) => {
      const w = widths.reduce((a, b) => a + b, 0)
      doc.setDrawColor(border); doc.setLineWidth(0.25)
      doc.rect(14, y, w, 6.5, 'FD')
      doc.rect(14 + w - widths[widths.length - 1] - 26, y, 26, 6.5, 'FD')
      doc.rect(14 + w - widths[widths.length - 1], y, widths[widths.length - 1], 6.5, 'FD')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
      doc.setTextColor(ink)
      doc.text(T(label), 14 + w - widths[widths.length - 1] - 24, y + 4.3)
      doc.text(T(deger), 14 + w - 1, y + 4.3, { align: 'right' })
      y += 6.5
    }

    // ===== SAYFA 1 =====
    baslikCiz()

    tabloBasligi('TABLO 1', 'ÖLENİN VEYA İVAZSIZ İNTİKALDE BULUNANIN')
    const t1rows = [
      ['1', 'Vergi Kimlik Numarası(*)', T(o1.vkn)],
      ['2', 'Soyadı / Unvanı', T(o1.soyadi)],
      ['3', 'Adı', T(o1.adi)],
      ['4', 'Baba Adı', T(o1.babaAdi)],
      ['5', 'Mesleği / Faaliyeti', T(o1.meslek)],
      ['6', 'Ölüm Yeri ve Tarihi', T(o1.olumYerTarih)],
      ['7', 'İvazsız İntikalin Meydana Geldiği Yer ve Tarihi', T(o1.ivazsizYerTarih)],
      ['8', 'İkametgah ve/veya İşyeri Adresi - Mahalle', T(o1.mahalle)]
    ]
    doc.setDrawColor(border); doc.setLineWidth(0.25)
    t1rows.forEach(r => {
      doc.rect(14, y, 182, 6.5, 'FD'); doc.rect(18, y, 5, 6.5, 'FD'); doc.rect(23, y, 62, 6.5, 'FD')
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.6); doc.setTextColor(ink)
      doc.text(r[0], 20.5, y + 4.3, { align: 'center' })
      doc.text(r[1], 24.5, y + 4.3)
      doc.text(r[2], 183.5, y + 4.3, { align: 'right' })
      y += 6.5
    })
    // adres alt satirlari
    doc.rect(14, y, 182, 6.5, 'FD'); doc.rect(40, y, 70, 6.5, 'FD'); doc.rect(128, y, 26, 6.5, 'FD'); doc.rect(154, y, 42, 6.5, 'FD')
    doc.setFontSize(6.6); doc.setTextColor(muted)
    doc.text('Cadde / Sokak', 17, y + 4.3); doc.setTextColor(ink); doc.text(T(o1.cadde), 42, y + 4.3)
    doc.setTextColor(muted); doc.text('Posta Kodu', 130, y + 2.6); doc.setTextColor(ink); doc.text(T(o1.postaKodu), 156, y + 4.3)
    y += 6.5
    doc.rect(14, y, 182, 6.5, 'FD'); doc.rect(46, y, 26, 6.5, 'FD'); doc.rect(86, y, 26, 6.5, 'FD'); doc.rect(128, y, 68, 6.5, 'FD')
    doc.setTextColor(muted); doc.text('Kapı No.', 17, y + 4.3); doc.setTextColor(ink); doc.text(T(o1.kapiNo), 48, y + 4.3)
    doc.setTextColor(muted); doc.text('Daire No.', 74, y + 4.3); doc.setTextColor(ink); doc.text(T(o1.daireNo), 88, y + 4.3)
    doc.setTextColor(muted); doc.text('İl / İlçe', 116, y + 4.3); doc.setTextColor(ink); doc.text(T(o1.ilIlce), 130, y + 4.3)
    y += 6.5

    doc.setFontSize(5.8); doc.setTextColor(muted)
    doc.text('(*) İntikal hangi şekilde meydana gelmişse ilgili haneye (x) işareti konulacaktır.', 14, y + 2)
    doc.text('(**) T.C. vatandaşı olan gerçek kişilerde T.C. kimlik numarası, yabancı kimlik numarası bulunan yabancı gerçek kişilerde yabancı kimlik numarası yazılacaktır.', 14, y + 4.8)
    y += 9

    tabloBasligi('TABLO 2', 'MÜKELLEFLERİN')
    grid(
      ['Vergi Kimlik No(**)', 'Adı Soyadı / Unvanı', 'Akrabalık Derecesi', 'Doğum Tarihi', 'İkametgah veya İşyeri Adresi / Telefon No.', 'İMZA'],
      [26, 32, 24, 18, 58, 24],
      mirascilar.map(m => [m.tckn, m.adSoyad, m.akrabalik, m.dogum, m.iletisim, ''])
    )

    doc.setFontSize(5.8); doc.setTextColor(muted)
    doc.text('Örnek No: 1069-Ç Veraset Vergisi Ağ-2012', 14, y + 2)
    y += 6

    // ===== SAYFA 2 =====
    yeniSayfa('VERASET VE İNTİKAL VERGİSİ BEYANNAMESİ (TABELALAR)')

    // tablo 3 gayrimenkuller
    tabloBasligi('TABLO 3', 'İNİKAL EDEN GAYRİMENKULLER')
    const w3 = [16, 16, 24, 20, 11, 20, 20, 11, 12, 32]
    grid(
      ['İli', 'İlçesi', 'Mahallesi veya Köyü', 'Sokağı', 'Kapı No', 'Cinsi (Ev, Apartman, Arsa vb.)', 'Ölüm / İvazsız İntikal Tarihi', 'Ada No', 'Parsel No', 'Emlak Vergisine Esas Değer (TL)'],
      w3,
      emlaklar.map(e => [e.il, e.ilce, e.mahalle, e.sokak, e.kapiNo, e.cinsi, e.olcumTarihi, e.adaNo, e.parselNo, e.deger])
    )
    toplamSatiri('TOPLAM', fmt(hesap.emlakToplam) + ' TL', w3)

    y += 3
    tabloBasligi('TABLO 4', 'İNİKAL EDEN MENKUL MALLAR VE DİĞER SERVET UNSURLARI')
    const w4 = [30, 48, 16, 40, 48]
    grid(
      ['Cinsi', 'Nerede Bulunduğu', 'Adedi', 'Hesap / Poliçe / Banka Hesap No.', 'Tarhiyat İçin Beyan Edilen Değer (TL)'],
      w4,
      menkullar.map(m => [m.cinsi, m.yer, m.adet, m.hesapNo, m.deger])
    )
    toplamSatiri('TOPLAM', fmt(hesap.menkulToplam) + ' TL', w4)

    y += 3
    tabloBasligi('TABLO 5', 'İNDİRİLECEK BORÇLAR VE MASRAFLAR')
    const w5 = [38, 24, 18, 32, 40, 30]
    grid(
      ['Cinsi ve Mahiyeti', 'Alt Olduğu Belgenin Cinsi / Tarihi', 'No. Su', 'Alacaklıların Adı, Soyadı / Unvanı', 'İş veya İkametgah Adresi', 'Tutar (TL)'],
      w5,
      borclar.map(b => [b.cinsi, `${b.belgeCinsi} ${b.belgeTarihi ? '- ' + b.belgeTarihi : ''}`, '', b.alacakli, b.adres, b.tutar])
    )
    toplamSatiri('TOPLAM', fmt(hesap.borcToplam) + ' TL', w5)

    y += 4
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.2); doc.setTextColor(ink)
    doc.text('Verilecek beyannamelere aşağıdaki belgelerin eklenmesi gerekir:', 14, y)
    y += 4
    ;[
      'a) Veraset İlâmı.',
      'b) Ölüm ve mirasçı bildirimi.',
      'c) Gayrimenkullerde tapunun fotokopisi',
      'd) Gayrimenkul mallar için ilgili belediyelerden alınacak emlak vergisine esas olan değeri gösterir belge.',
      'e) İndirilmesi talep edilen borç ve masraflara ait belgeler.',
      'f) Ticari bilanço ve gelir tablosu.'
    ].forEach(s => { doc.text(s, 17, y); y += 3.4 })
    y += 2
    doc.setFontSize(5.8); doc.setTextColor(muted)
    doc.text('(*) 01.01.1983 tarihinden önce meydana gelen intikallerde gayrimenkulleri intikal tarihindeki rayiç bedeli yazılır.', 14, y)
    y += 5
    doc.setTextColor(ink)
    doc.text('...../...../20.....', 190, y, { align: 'right' })

    doc.save('veraset-ve-intikal-vergisi-beyannamesi-1031A.pdf')
  }

  const toplamPay = hesap.payToplam

  return (
    <div>
      {/* sekme dugmeleri */}
      <div className="flex flex-wrap gap-2 mb-6">
        {[['bilgi', 'Bilgi ve Belgeler'], ['form', 'Beyanname Doldur'], ['hesap', 'Vergi Hesabı']].map(([id, label]) => (
          <button key={id} onClick={() => setSekme(id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              sekme === id ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'bg-blue-900/30 text-gray-400 border border-blue-700/30 hover:text-white'
            }`}>
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <a href="https://mubis-erp-web.pages.dev/hesaplama/veraset-beyannamesi-kilavuzu.html" target="_blank" rel="noreferrer"
          className="bg-blue-900/40 text-blue-200 border border-blue-600/40 px-4 py-2 rounded-lg text-sm font-semibold hover:text-white hover:border-blue-400 flex items-center gap-2 transition-colors">
          <BookOpen className="w-4 h-4" /> Resimli Doldurma Kılavuzu
        </a>
        <button onClick={pdfOlustur}
          className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-gray-900 px-4 py-2 rounded-lg text-sm font-semibold hover:shadow-lg flex items-center gap-2">
          <Download className="w-4 h-4" /> PDF Çıktısı Al
        </button>
      </div>

      {/* ===== BILGI EKRANI ===== */}
      {sekme === 'bilgi' && (
        <div className="space-y-6">
          <Kutu>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-yellow-400" />
                <h3 className="text-white font-semibold">Beyannameye Eklenmesi Gereken Belgeler</h3>
              </div>
              <a href="https://randevu.ivdb.gov.tr/#/" target="_blank" rel="noreferrer"
                className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-gray-900 px-5 py-2.5 rounded-lg text-sm font-bold hover:shadow-lg flex items-center gap-2">
                <ExternalLink className="w-4 h-4" /> Randevu Almak İçin Tıklayın
              </a>
            </div>
            <ol className="mt-4 space-y-3">
              {GEREKLI_BELGELER.map((d, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-yellow-500/20 text-yellow-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  <div>
                    <span className="text-white text-sm font-semibold">{d.b}</span>
                    <p className="text-gray-400 text-sm">{d.t}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Kutu>

          <Kutu>
            <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
              <Info className="w-5 h-5 text-yellow-400" /> Randevu ve Beyanname Kuralları
            </h3>
            <ul className="space-y-2">
              {RANDEVU_NOTLARI.map((n, i) => (
                <li key={i} className="flex gap-2 text-gray-400 text-sm">
                  <span className="text-yellow-400 shrink-0">•</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </Kutu>

          <Kutu>
            <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
              <FileText className="w-5 h-5 text-yellow-400" /> İstanbul Veraset ve Harçlar Vergi Dairesi Yetki Alanları
            </h3>
            <div className="space-y-3">
              {VERGI_DAIRELERI.map((v, i) => (
                <div key={i} className="bg-blue-900/20 rounded-lg p-3 border border-blue-700/20">
                  <span className="text-yellow-400 text-sm font-semibold">{v.ad}</span>
                  <p className="text-gray-400 text-xs mt-1">{v.ilceler}</p>
                </div>
              ))}
            </div>
          </Kutu>

          <Kutu>
            <h3 className="text-white font-semibold mb-3">Güncel Tarife (Kanun ve Oranlar)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 text-xs">
                    <th className="text-left py-2">Matrah Dilimi</th>
                    <th className="text-right py-2">Veraset (%)</th>
                    <th className="text-right py-2">İvazsız (%)</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-1">İlk 3.000.000 TL (2026) / 2.400.000 TL (2025)</td><td className="text-right font-mono">1</td><td className="text-right font-mono">10</td></tr>
                  <tr><td className="py-1">Sonra gelen 7.000.000 TL (2026) / 5.700.000 TL (2025)</td><td className="text-right font-mono">3</td><td className="text-right font-mono">15</td></tr>
                  <tr><td className="py-1">Sonra gelen 15.000.000 TL (2026) / 12.000.000 TL (2025)</td><td className="text-right font-mono">5</td><td className="text-right font-mono">20</td></tr>
                  <tr><td className="py-1">Sonra gelen 30.000.000 TL (2026) / 24.000.000 TL (2025)</td><td className="text-right font-mono">7</td><td className="text-right font-mono">25</td></tr>
                  <tr><td className="py-1">Aşan kısım</td><td className="text-right font-mono">10</td><td className="text-right font-mono">30</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-gray-400 text-xs mt-3">
              İstisna 2026: füruğ ve eşten her birine isabet eden miras hissesinde 2.907.136 TL (füruğ yoksa eş için 5.817.845 TL); ivazsız intikallerde 66.935 TL.
              İstisna 2025: 2.316.628 TL (füruğ yoksa eş için 4.636.103 TL); ivazsız 53.339 TL. Kaynak: 56 ve 57 Seri No.lu VİVK Genel Tebliğleri (Resmî Gazete).
            </p>
          </Kutu>
        </div>
      )}

      {/* ===== BEYANNAME FORMU ===== */}
      {sekme === 'form' && (
        <div className="space-y-6">
          <Kutu>
            <h3 className="text-white font-semibold mb-4">Genel Bilgiler</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Metin label="V.D. Kodu" value={vdKodu} onChange={setVdKodu} placeholder="1031 A" />
              <Secim label="Vergi Dairesi Müdürlüğü" value={vdAdi} onChange={v => { setVdAdi(v); if (!VERGI_DAIRELERI.some(d => d.ad === v && d.liste.includes(ilce))) setIlce('') }} options={[{ value: '', label: 'Seçiniz...' }, ...VERGI_DAIRELERI.map(d => ({ value: d.ad, label: d.ad })), { value: 'Diğer', label: 'Diğer (elle yaz)' }]} className="md:col-span-2" />
              {vdAdi !== '' && vdAdi !== 'Diğer' ? (
                <Secim label="İlçe" value={ilce} onChange={setIlce} options={[{ value: '', label: 'Seçiniz...' }, ...(VERGI_DAIRELERI.find(d => d.ad === vdAdi)?.liste || []).map(i => ({ value: i, label: i }))]} />
              ) : (
                <Metin label="İlçe" value={ilce} onChange={setIlce} />
              )}
              <Metin label="Olay Kayıt ve Hs. Def. Sıra No." value={olayNo} onChange={setOlayNo} />
              <Secim label="İntikalin Şekli" value={intikalSekli} onChange={setIntikalSekli} options={[{ value: 'veraset', label: 'Veraset' }, { value: 'ivazsiz', label: 'İvazsız İntikaller' }]} />
              <Metin label="İntikal Tarihi (Ölüm / İvazsız İntikal)" value={intikalTarihi} onChange={setIntikalTarihi} type="date" />
              <Secim label="Vergi Tarife Yılı" value={String(uygulananYil)} onChange={v => setTarifeYili(Number(v))} options={[{ value: '2026', label: '2026 tarifesine göre' }, { value: '2025', label: '2025 tarifesine göre' }]} />
            </div>
            {!TARIFELER[intikalYili] && intikalTarihi && (
              <p className="text-yellow-400/80 text-xs mt-2 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {intikalYili} yılı tarifesi listede yok; hesap {uygulananYil} tarifesine göre yapılıyor. Eski intikallerde vergi dairesinin uyguladığı tarife esas alınır.
              </p>
            )}
          </Kutu>

          <Kutu>
            <h3 className="text-white font-semibold mb-4">Tablo 1 — Ölenin veya İvazsız İntikalde Bulunanın</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Metin label="Vergi Kimlik Numarası (T.C. / VKN)" value={o1.vkn} onChange={v => setO1({ ...o1, vkn: v })} />
              <Metin label="Soyadı / Unvanı" value={o1.soyadi} onChange={v => setO1({ ...o1, soyadi: v })} />
              <Metin label="Adı" value={o1.adi} onChange={v => setO1({ ...o1, adi: v })} />
              <Metin label="Baba Adı" value={o1.babaAdi} onChange={v => setO1({ ...o1, babaAdi: v })} />
              <Metin label="Mesleği / Faaliyeti" value={o1.meslek} onChange={v => setO1({ ...o1, meslek: v })} />
              <Metin label="Ölüm Yeri ve Tarihi" value={o1.olumYerTarih} onChange={v => setO1({ ...o1, olumYerTarih: v })} />
              <Metin label="İvazsız İntikalin Meydana Geldiği Yer ve Tarihi" value={o1.ivazsizYerTarih} onChange={v => setO1({ ...o1, ivazsizYerTarih: v })} className="md:col-span-2" />
              <Metin label="Mahalle" value={o1.mahalle} onChange={v => setO1({ ...o1, mahalle: v })} />
              <Metin label="Cadde / Sokak" value={o1.cadde} onChange={v => setO1({ ...o1, cadde: v })} />
              <Metin label="Kapı No." value={o1.kapiNo} onChange={v => setO1({ ...o1, kapiNo: v })} />
              <Metin label="Daire No." value={o1.daireNo} onChange={v => setO1({ ...o1, daireNo: v })} />
              <Metin label="Posta Kodu" value={o1.postaKodu} onChange={v => setO1({ ...o1, postaKodu: v })} />
              <Metin label="İl / İlçe" value={o1.ilIlce} onChange={v => setO1({ ...o1, ilIlce: v })} />
            </div>
          </Kutu>

          <Kutu>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Tablo 2 — Mükellefler (Mirasçılar) ve Miras Payları</h3>
              <button onClick={mirasciEkle} className="border border-blue-600 text-gray-300 px-3 py-1.5 rounded-lg text-xs hover:bg-blue-800/30 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Mirasçı Ekle
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500">
                    <th className="text-left py-1 px-1">VKN / TCKN</th>
                    <th className="text-left py-1 px-1">Adı Soyadı</th>
                    <th className="text-left py-1 px-1">Akrabalık</th>
                    <th className="text-left py-1 px-1">Doğum Tarihi</th>
                    <th className="text-left py-1 px-1">Adres / Telefon</th>
                    <th className="text-right py-1 px-1">Pay (%)</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {mirascilar.map((m, i) => (
                    <tr key={i}>
                      <td className="py-1 px-1"><TabloAlani value={m.tckn} onChange={v => mirasciDegistir(i, 'tckn', v)} /></td>
                      <td className="py-1 px-1"><TabloAlani value={m.adSoyad} onChange={v => mirasciDegistir(i, 'adSoyad', v)} /></td>
                      <td className="py-1 px-1">
                        <select value={m.akrabalik} onChange={e => mirasciDegistir(i, 'akrabalik', e.target.value)}
                          className="w-full bg-blue-900/30 border border-blue-700/40 rounded py-1.5 px-2 text-white text-xs focus:outline-none focus:border-yellow-500">
                          {['Eş', 'Çocuk', 'Anne', 'Baba', 'Evlatlık', 'Diğer'].map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                      </td>
                      <td className="py-1 px-1"><TabloAlani value={m.dogum} onChange={v => mirasciDegistir(i, 'dogum', v)} /></td>
                      <td className="py-1 px-1"><TabloAlani value={m.iletisim} onChange={v => mirasciDegistir(i, 'iletisim', v)} /></td>
                      <td className="py-1 px-1 w-20"><TabloAlani amount value={m.pay} onChange={v => mirasciDegistir(i, 'pay', v)} /></td>
                      <td className="py-1 px-1">
                        {mirascilar.length > 1 && (
                          <button onClick={() => mirasciSil(i)} className="text-red-400 hover:text-red-300 p-1">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {Math.abs(toplamPay - 100) > 0.001 && (
              <p className="text-yellow-400 text-xs mt-2 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Miras payları toplamı %100 olmalıdır (şu an %{fmt(toplamPay)}).
              </p>
            )}
          </Kutu>

          <Kutu>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Tablo 3 — İntikal Eden Gayrimenkuller</h3>
              <button onClick={emlakEkle} className="border border-blue-600 text-gray-300 px-3 py-1.5 rounded-lg text-xs hover:bg-blue-800/30 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Satır Ekle
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500">
                    <th className="text-left py-1 px-1">İli</th>
                    <th className="text-left py-1 px-1">İlçesi</th>
                    <th className="text-left py-1 px-1">Mahalle / Köyü</th>
                    <th className="text-left py-1 px-1">Sokağı</th>
                    <th className="text-left py-1 px-1">Kapı No</th>
                    <th className="text-left py-1 px-1">Cinsi (Ev, Arsa, Apar. vb.)</th>
                    <th className="text-left py-1 px-1">Ölüm / İvazsız İntikal Tarihi</th>
                    <th className="text-left py-1 px-1">Ada No</th>
                    <th className="text-left py-1 px-1">Parsel No</th>
                    <th className="text-right py-1 px-1">Emlak V. Esas Değer (TL)</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {emlaklar.map((e, i) => (
                    <tr key={i}>
                      <td className="py-1 px-1"><TabloAlani value={e.il} onChange={v => emlakDegistir(i, 'il', v)} /></td>
                      <td className="py-1 px-1"><TabloAlani value={e.ilce} onChange={v => emlakDegistir(i, 'ilce', v)} /></td>
                      <td className="py-1 px-1"><TabloAlani value={e.mahalle} onChange={v => emlakDegistir(i, 'mahalle', v)} /></td>
                      <td className="py-1 px-1"><TabloAlani value={e.sokak} onChange={v => emlakDegistir(i, 'sokak', v)} /></td>
                      <td className="py-1 px-1 w-16"><TabloAlani value={e.kapiNo} onChange={v => emlakDegistir(i, 'kapiNo', v)} /></td>
                      <td className="py-1 px-1"><TabloAlani value={e.cinsi} onChange={v => emlakDegistir(i, 'cinsi', v)} /></td>
                      <td className="py-1 px-1"><TabloAlani value={e.olcumTarihi} onChange={v => emlakDegistir(i, 'olcumTarihi', v)} /></td>
                      <td className="py-1 px-1 w-16"><TabloAlani value={e.adaNo} onChange={v => emlakDegistir(i, 'adaNo', v)} /></td>
                      <td className="py-1 px-1 w-16"><TabloAlani value={e.parselNo} onChange={v => emlakDegistir(i, 'parselNo', v)} /></td>
                      <td className="py-1 px-1 w-28"><TabloAlani amount value={e.deger} onChange={v => emlakDegistir(i, 'deger', v)} /></td>
                      <td className="py-1 px-1">
                        {emlaklar.length > 1 && (
                          <button onClick={() => emlakSil(i)} className="text-red-400 hover:text-red-300 p-1">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-right">
              <span className="text-yellow-400 font-semibold text-sm">Toplam: {fmt(hesap.emlakToplam)} TL</span>
            </div>
          </Kutu>

          <Kutu>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Tablo 4 — İntikal Eden Menkul Mallar ve Diğer Servet Unsurları</h3>
              <button onClick={menkulEkle} className="border border-blue-600 text-gray-300 px-3 py-1.5 rounded-lg text-xs hover:bg-blue-800/30 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Satır Ekle
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500">
                    <th className="text-left py-1 px-1">Cinsi</th>
                    <th className="text-left py-1 px-1">Nerede Bulunduğu</th>
                    <th className="text-left py-1 px-1">Adedi</th>
                    <th className="text-left py-1 px-1">Hesap / Poliçe No. / Tel.</th>
                    <th className="text-right py-1 px-1">Beyan Edilen Değer (TL)</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {menkullar.map((m, i) => (
                    <tr key={i}>
                      <td className="py-1 px-1"><TabloAlani value={m.cinsi} onChange={v => menkulDegistir(i, 'cinsi', v)} /></td>
                      <td className="py-1 px-1"><TabloAlani value={m.yer} onChange={v => menkulDegistir(i, 'yer', v)} /></td>
                      <td className="py-1 px-1 w-16"><TabloAlani value={m.adet} onChange={v => menkulDegistir(i, 'adet', v)} /></td>
                      <td className="py-1 px-1"><TabloAlani value={m.hesapNo} onChange={v => menkulDegistir(i, 'hesapNo', v)} /></td>
                      <td className="py-1 px-1 w-28"><TabloAlani amount value={m.deger} onChange={v => menkulDegistir(i, 'deger', v)} /></td>
                      <td className="py-1 px-1">
                        {menkullar.length > 1 && (
                          <button onClick={() => menkulSil(i)} className="text-red-400 hover:text-red-300 p-1">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-right">
              <span className="text-yellow-400 font-semibold text-sm">Toplam: {fmt(hesap.menkulToplam)} TL</span>
            </div>
          </Kutu>

          <Kutu>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Tablo 5 — İndirilecek Borçlar ve Masraflar</h3>
              <button onClick={borcEkle} className="border border-blue-600 text-gray-300 px-3 py-1.5 rounded-lg text-xs hover:bg-blue-800/30 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Satır Ekle
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500">
                    <th className="text-left py-1 px-1">Cinsi ve Mahiyeti</th>
                    <th className="text-left py-1 px-1">Belge Cinsi</th>
                    <th className="text-left py-1 px-1">Belge Tarihi / No</th>
                    <th className="text-left py-1 px-1">Alacaklı Adı Soyadı / Unvanı</th>
                    <th className="text-left py-1 px-1">İş veya İkametgah Adresi</th>
                    <th className="text-right py-1 px-1">Tutar (TL)</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {borclar.map((b, i) => (
                    <tr key={i}>
                      <td className="py-1 px-1"><TabloAlani value={b.cinsi} onChange={v => borcDegistir(i, 'cinsi', v)} /></td>
                      <td className="py-1 px-1"><TabloAlani value={b.belgeCinsi} onChange={v => borcDegistir(i, 'belgeCinsi', v)} /></td>
                      <td className="py-1 px-1"><TabloAlani value={b.belgeTarihi} onChange={v => borcDegistir(i, 'belgeTarihi', v)} /></td>
                      <td className="py-1 px-1"><TabloAlani value={b.alacakli} onChange={v => borcDegistir(i, 'alacakli', v)} /></td>
                      <td className="py-1 px-1"><TabloAlani value={b.adres} onChange={v => borcDegistir(i, 'adres', v)} /></td>
                      <td className="py-1 px-1 w-28"><TabloAlani amount value={b.tutar} onChange={v => borcDegistir(i, 'tutar', v)} /></td>
                      <td className="py-1 px-1">
                        {borclar.length > 1 && (
                          <button onClick={() => borcSil(i)} className="text-red-400 hover:text-red-300 p-1">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-right">
              <span className="text-yellow-400 font-semibold text-sm">Toplam: {fmt(hesap.borcToplam)} TL</span>
            </div>
          </Kutu>
        </div>
      )}

      {/* ===== VERGI HESABI ===== */}
      {sekme === 'hesap' && (
        <div className="space-y-6">
          <Kutu>
            <h3 className="text-white font-semibold mb-4">Vergi Matrahı</h3>
            <Sonuc label="Gayrimenkuller Toplamı (Tablo 3)" value={fmt(hesap.emlakToplam) + ' TL'} />
            <Sonuc label="Menkul Mallar Toplamı (Tablo 4)" value={fmt(hesap.menkulToplam) + ' TL'} />
            <Sonuc label="Brüt İntikal Toplamı" value={fmt(hesap.brutToplam) + ' TL'} />
            <Sonuc label="İndirilecek Borçlar ve Masraflar (Tablo 5)" value={'-' + fmt(hesap.borcToplam) + ' TL'} negative />
            <Sonuc label="Net İntikal (Vergiye Esas Toplam)" value={fmt(hesap.netToplam) + ' TL'} highlight />
          </Kutu>

          <Kutu>
            <h3 className="text-white font-semibold mb-4">Tarife ve İstisna Ayarları</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Secim label="Uygulanan Tarife" value={String(uygulananYil)} onChange={v => setTarifeYili(Number(v))} options={[{ value: '2026', label: '2026 (57 Seri No.lu Tebliğ)' }, { value: '2025', label: '2025 (56 Seri No.lu Tebliğ)' }]} />
              {intikalSekli === 'veraset' && (
                <SecimKutu label="Füruğ (çocuk) var" checked={furugVar} onChange={setFurugVar} />
              )}
            </div>
            <p className="text-gray-500 text-xs mt-3">
              {intikalSekli === 'veraset'
                ? (furugVar
                  ? `Füruğ ve eşten her birine isabet eden miras hissesinin ${fmt(tarife.istisnaFurug)} TL’si vergiden istisnadır.`
                  : `Füruğ bulunmaması halinde eşe isabet eden miras hissesinde istisna ${fmt(tarife.istisnaEs)} TL’dir; diğer mirasçılar için ${fmt(tarife.istisnaFurug)} TL uygulanır.`)
                : `İvazsız intikallerde her kişi için ${fmt(tarife.istisnaIvazsiz)} TL istisna uygulanır.`}
            </p>
          </Kutu>

          <Kutu>
            <h3 className="text-white font-semibold mb-4">Mirasçı Bazında Vergi Hesabı ({uygulananYil} tarifesine göre)</h3>
            {Math.abs(toplamPay - 100) > 0.001 && (
              <p className="text-yellow-400 text-xs mb-3 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Miras payları toplamı %100 olmalıdır (şu an %{fmt(toplamPay)}). Beyanname Doldur sekmesinden payları girin.
              </p>
            )}
            {hesap.kisiHesaplari.map((k, i) => (
              <div key={i} className="bg-blue-900/20 rounded-lg p-3 mb-3 border border-blue-700/20">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-white text-sm font-semibold">{i + 1}. {k.adSoyad}</span>
                  <span className="text-gray-400 text-xs">Pay: %{fmt(k.payOran)}</span>
                </div>
                <Sonuc label="İntikal Eden Hisse" value={fmt(k.hisse) + ' TL'} />
                <Sonuc label={`İstisna Tutarı`} value={'-' + fmt(k.istisna) + ' TL'} />
                <Sonuc label="Vergiye Esas Matrah" value={fmt(k.matrah) + ' TL'} />
                <Sonuc label="Hesaplanan Vergi" value={fmt(k.vergi) + ' TL'} highlight />
              </div>
            ))}
            <div className="bg-yellow-500/10 rounded-lg p-3 border border-yellow-500/30">
              <Sonuc label="TOPLAM VERASET VE İNTİKAL VERGİSİ" value={fmt(hesap.toplamVergi) + ' TL'} highlight />
            </div>
            <p className="text-gray-500 text-xs mt-3">
              Bu hesap güncel kanun ve oranlara göre bilgilendirme amaçlıdır; kesin tarh vergi dairesince beyanname üzerinden yapılır. Beyanname verilirken matrah dilimleri beyanname verme yılı tarifesine göre de uygulanabilir; vergi dairesinin tespiti esastır.
            </p>
          </Kutu>
        </div>
      )}
    </div>
  )
}
