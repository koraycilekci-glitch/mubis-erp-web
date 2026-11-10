// Admin "e-Fatura XML Indirici": butun musterilerin kayitli faturalari
// (efatura_faturalar tablosu) tek listede; XML/PDF dosyalari Supabase
// Storage'dan GERCEK indirilir (demo degil).
import { useState, useEffect, useMemo, useRef } from 'react'
import { useClients } from '../hooks/useClients'
import { Download, RefreshCw, FileArchive, Eye, Loader2, Trash2, FolderOpen, Upload } from 'lucide-react'
import { tumFaturalariGetir, faturaTuruAdi, faturaTurEslesir, faturaTurEtiketi, klasordekiFaturalariAktar, faturalariSil, manuelFaturaYukle } from '../services/efaturaService'
import FisModal from '../components/FisModal'
import { formatDateTR } from '../utils/dateUtils'
import { dosyaIndir } from '../utils/dosyaIndir'
import { fetchDocument, openDocument } from '../utils/storageUrl'

const TURLAR = { efatura: 'e-Fatura', earsiv: 'e-Arşiv', esmm: 'e-SMM', utts: 'UTTS' }

export default function EInvoiceDownloader() {
  const { clients } = useClients()
  const [loading, setLoading] = useState(false)
  const [faturalar, setFaturalar] = useState([])
  const [mesaj, setMesaj] = useState('')
  const [seciliClient, setSeciliClient] = useState('all')
  const [aktariliyor, setAktariliyor] = useState(false)
  const [aktarMesaj, setAktarMesaj] = useState('')
  const [seciliTur, setSeciliTur] = useState('all')
  const [seciliFaturaTuru, setSeciliFaturaTuru] = useState('all')
  const [dateRange, setDateRange] = useState({ start: '', end: '' })
  const [seciliIds, setSeciliIds] = useState(new Set())
  const [siliniyor, setSiliniyor] = useState(false)
  const [xmlGoster, setXmlGoster] = useState(null) // { baslik, icerik, yukleniyor }
  const [fisGoster, setFisGoster] = useState(null) // UTTS fiş görüntüleyici
  // Manuel yükleme (klasör / dosya seç — zip/xlsx/pdf/xml/html tarayıcıdan yüklenir)
  // 1. aşamada dosyalar "bekleyen" listesine alınır, kullanıcı YÜKLE'ye
  // basınca yükleme başlar (yükleme yapıldı mı açıkça görünsün).
  const [manuelYukleniyor, setManuelYukleniyor] = useState(false)
  const [bekleyenDosyalar, setBekleyenDosyalar] = useState(null)
  const klasorInputRef = useRef(null)
  const dosyaInputRef = useRef(null)

  const yukle = async () => {
    setLoading(true)
    try { setFaturalar(await tumFaturalariGetir()) } catch { setMesaj('Faturalar yüklenemedi.') }
    finally { setLoading(false) }
  }

  useEffect(() => { yukle() }, [])

  const musteriAdi = (id) => {
    const c = (clients || []).find(x => String(x.id) === String(id))
    return c ? (c.shortName || c.name || c.company || `Müşteri #${c.id}`) : (id ? `#${id}` : '-')
  }

  // Tek fatura silme
  const tekSil = async (f) => {
    if (!window.confirm(`${f.fatura_no || f.fatura_uuid || 'Bu fatura'} kaydı ve dosyaları silinecek. Emin misiniz?`)) return
    setSiliniyor(true)
    try {
      const sonuc = await faturalariSil([f.id])
      if (sonuc.ok) { setMesaj(`${sonuc.silinen} fatura silindi.`); setSeciliIds(new Set()); await yukle() }
      else setMesaj('Silme başarısız: ' + sonuc.not)
    } catch (err) {
      setMesaj('Silme hatası: ' + (err.message || err))
    } finally { setSiliniyor(false) }
  }

  // Toplu silme (secili onay kutulari)
  const topluSil = async () => {
    const ids = [...seciliIds]
    if (!ids.length) return
    if (!window.confirm(`${ids.length} fatura kaydı ve dosyaları silinecek. Emin misiniz?`)) return
    setSiliniyor(true)
    try {
      const sonuc = await faturalariSil(ids)
      if (sonuc.ok) { setMesaj(`${sonuc.silinen} fatura silindi.`); setSeciliIds(new Set()); await yukle() }
      else setMesaj('Silme başarısız: ' + sonuc.not)
    } catch (err) {
      setMesaj('Silme hatası: ' + (err.message || err))
    } finally { setSiliniyor(false) }
  }

  const satirSec = (id) => {
    setSeciliIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const tumunuSec = () => {
    setSeciliIds(prev => (prev.size === filtreli.length ? new Set() : new Set(filtreli.map(f => f.id))))
  }

  const filtreli = useMemo(() => faturalar.filter(f => {
    if (seciliClient !== 'all' && String(f.client_id) !== String(seciliClient)) return false
    if (seciliTur !== 'all' && (f.tur || '') !== seciliTur) return false
    if (faturaTurEslesir(f, seciliFaturaTuru) === false) return false
    const t = String(f.tarih || '')
    if (dateRange.start && (!t || t < dateRange.start)) return false
    if (dateRange.end && (!t || t > dateRange.end)) return false
    return true
  }), [faturalar, seciliClient, seciliTur, seciliFaturaTuru, dateRange])

  // Filtrelenmiş listeye ait sütun toplamları — her filtre seçiminde
  // (müşteri, tür, fatura türü, tarih aralığı) otomatik yeniden hesaplanır.
  // "Tümü" seçiliyken Alınan/Kesilen kırılımı da ayrı ayrı tutulur.
  const toplamlar = useMemo(() => {
    const hesap = (liste) => {
      let matrah = 0, kdv = 0, tutar = 0
      liste.forEach(f => {
        if (f.matrah != null && isFinite(Number(f.matrah))) matrah += Number(f.matrah)
        if (f.kdv != null && isFinite(Number(f.kdv))) kdv += Number(f.kdv)
        if (f.tutar != null && isFinite(Number(f.tutar))) tutar += Number(f.tutar)
      })
      return { matrah, kdv, tutar }
    }
    return {
      ...hesap(filtreli),
      alinan: hesap(filtreli.filter(f => f.yon !== 'giden')),
      kesilen: hesap(filtreli.filter(f => f.yon === 'giden'))
    }
  }, [filtreli])

  // Datada bulunan fatura turleri (SATIS, IADE, TEVKIFAT...)
  const faturaTurleri = useMemo(() => {
    const set = new Set()
    faturalar.forEach(f => { if (f.fatura_turu) set.add(f.fatura_turu) })
    return [...set].sort()
  }, [faturalar])

  // UBL e-Fatura XML'ini insan-okur bilgilere ayiklar
  const ublAyikla = (xmlText) => {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
    const root = doc.documentElement
    const cocuk = (el, ad) => [...(el?.children || [])].find(c => c.tagName === ad || c.tagName.endsWith(':' + ad))
    const derin = (el, ...yol) => { let cur = el; for (const a of yol) { cur = cocuk(cur, a); if (!cur) return null } return cur }
    const metin = (el, ...yol) => derin(el, ...yol)?.textContent?.trim() || ''
    const sayi = (v) => { const n = parseFloat(String(v || '').replace(',', '.')); return isFinite(n) ? n : null }

    const taraf = (tip) => {
      const p = derin(root, tip, 'Party')
      if (!p) return { unvan: '', vkn: '' }
      let vkn = ''
      const legal = derin(p, 'PartyLegalEntity', 'CompanyID')
      if (legal?.textContent?.trim()) vkn = legal.textContent.trim()
      if (!vkn) {
        for (const k of [...p.getElementsByTagName('cbc:ID'), ...p.getElementsByTagName('ID')]) {
          const d = (k.textContent || '').trim()
          if (/^\d{10,11}$/.test(d)) { vkn = d; break }
        }
      }
      const unvan = derin(p, 'PartyLegalEntity', 'RegistrationName')?.textContent?.trim()
        || derin(p, 'PartyName', 'Name')?.textContent?.trim() || ''
      return { unvan, vkn }
    }

    const kalemler = [...root.getElementsByTagName('cac:InvoiceLine'), ...root.getElementsByTagName('InvoiceLine')].map(l => ({
      ad: metin(l, 'Item', 'Name') || metin(l, 'Item', 'Description') || '-',
      miktar: sayi(derin(l, 'InvoicedQuantity')?.textContent) ?? 1,
      birim: derin(l, 'InvoicedQuantity')?.getAttribute('unitCode') || '',
      fiyat: sayi(metin(l, 'Price', 'PriceAmount')),
      tutar: sayi(metin(l, 'LineExtensionAmount')) ?? 0,
      kdvOran: sayi(derin(l, 'TaxCategory', 'Percent')?.textContent) ?? 0
    }))

    return {
      faturaNo: metin(root, 'ID'),
      uuid: metin(root, 'UUID'),
      tarih: metin(root, 'IssueDate'),
      profil: metin(root, 'ProfileID'),
      tur: metin(root, 'InvoiceTypeCode'),
      paraBirimi: metin(root, 'DocumentCurrencyCode') || 'TRY',
      satici: taraf('AccountingSupplierParty'),
      alici: taraf('AccountingCustomerParty'),
      matrah: sayi(metin(root, 'LegalMonetaryTotal', 'TaxExclusiveAmount')),
      kdv: sayi(metin(root, 'TaxTotal', 'TaxAmount')),
      tutar: sayi(metin(root, 'LegalMonetaryTotal', 'PayableAmount')),
      kalemler
    }
  }

  // Yazdirilabilir (Ctrl+P ile PDF'e cevrilebilir) okunabilir fatura HTML'i
  const faturaHtmlOlustur = (b) => {
    const tl = (v) => v != null ? Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'
    return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${b.faturaNo || 'Fatura'}</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;margin:40px;color:#111}
table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #999;padding:6px 10px;font-size:14px}
th{background:#eef2ff;text-align:left}.sag{text-align:right}.baslik{font-size:22px;font-weight:700;margin-bottom:4px}
.etiket{color:#555;font-size:12px}.toplam{font-weight:700;font-size:16px}@media print{button{display:none}}</style></head><body>
<div class="baslik">${b.profil || 'e-Fatura'} — ${b.faturaNo || '-'}</div>
<div class="etiket">UUID: ${b.uuid || '-'} &nbsp;|&nbsp; Tarih: ${b.tarih || '-'} &nbsp;|&nbsp; Tür: ${b.tur || '-'}</div>
<table><tr><th>Satıcı</th><th>Alıcı</th></tr>
<tr><td>${b.satici.unvan || '-'}<br><span class="etiket">VKN: ${b.satici.vkn || '-'}</span></td>
<td>${b.alici.unvan || '-'}<br><span class="etiket">VKN: ${b.alici.vkn || '-'}</span></td></tr></table>
<table><tr><th>#</th><th>Açıklama</th><th>Miktar</th><th>Birim Fiyat</th><th>KDV %</th><th class="sag">Tutar</th></tr>
${b.kalemler.map((k, i) => `<tr><td>${i + 1}</td><td>${k.ad}</td><td>${k.miktar} ${k.birim}</td><td class="sag">${tl(k.fiyat)}</td><td>${k.kdvOran || ''}</td><td class="sag">${tl(k.tutar)}</td></tr>`).join('')}
</table>
<table><tr><td>Matrah (vergi hariç)</td><td class="sag">${tl(b.matrah)} ${b.paraBirimi}</td></tr>
<tr><td>KDV</td><td class="sag">${tl(b.kdv)} ${b.paraBirimi}</td></tr>
<tr class="toplam"><td>Genel Toplam</td><td class="sag">${tl(b.tutar)} ${b.paraBirimi}</td></tr></table>
<button onclick="window.print()">Yazdır / PDF olarak kaydet</button>
</body></html>`
  }

  // XML'i uygulamada okunabilir goster (ham XML sayfasi yerine)
  const xmlAc = async (f) => {
    const baslik = f.fatura_no || f.fatura_uuid || 'Fatura XML'
    setXmlGoster({ baslik, icerik: '', bilgiler: null, hamXml: '', yukleniyor: true, xmlUrl: f.xml_url, faturaNo: f.fatura_no || f.fatura_uuid })
    try {
      const resp = await fetchDocument(f.xml_url)
      const metin = await resp.text()
      let bilgiler = null
      try { bilgiler = ublAyikla(metin) } catch { /* ozet cikarilamazsa ham goster */ }
      setXmlGoster({
        baslik, bilgiler, hamXml: metin, yukleniyor: false,
        xmlUrl: f.xml_url, faturaNo: f.fatura_no || f.fatura_uuid,
        tur: f.tur
      })
    } catch (err) {
      setXmlGoster({ baslik, icerik: 'XML yuklenemedi: ' + (err.message || err), yukleniyor: false })
    }
  }

  // Okunabilir fatura HTML'ini indir (tarayicida acilir, Ctrl+P ile PDF olur)
  const okunabilirIndir = (b, faturaNo) => {
    const html = faturaHtmlOlustur(b)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objUrl
    a.download = `${faturaNo || 'fatura'}.html`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(objUrl), 10000)
  }

  // Resmi e-Belge HTML'ini goruntule: Supabase Storage HTML'i text/plain
  // olarak sunar (guvenlik politikasi); metni cekip blob URL ile acarsak
  // tarayici gercek HTML render eder.
  const resmiGoruntule = async (f) => {
    try {
      const metin = await (await fetchDocument(f.html_url)).text()
      const blobUrl = URL.createObjectURL(new Blob([metin], { type: 'text/html;charset=utf-8' }))
      window.open(blobUrl, '_blank', 'noreferrer')
    } catch {
      openDocument(f.html_url)
    }
  }

  // Faturayi indir: resmi e-Belge HTML'i (Chrome HTML Document) once;
  // yoksa XML'den okunabilir fatura, o da yoksa orijinal PDF.
  const orijinalIndir = async (f) => {
    const ad = f.fatura_no || f.fatura_uuid || 'fatura'
    if (f.html_url) {
      await dosyaIndir(f.html_url, `${ad}.html`)
      return
    }
    if (f.xml_url && f.tur !== 'utts') {
      try {
        const resp = await fetchDocument(f.xml_url)
        const metin = await resp.text()
        const b = ublAyikla(metin)
        okunabilirIndir(b, ad)
        return
      } catch { /* XML okunamazsa PDF'e duser */ }
    }
    if (f.pdf_url) await dosyaIndir(f.pdf_url, `${ad}.pdf`)
  }

  const tumunuIndir = async () => {
    const belgeler = filtreli.filter(f => f.pdf_url || f.xml_url || f.html_url)
    if (!belgeler.length) {
      alert('Filtrelere uygun fatura bulunamadı!')
      return
    }
    if (!window.confirm(`${belgeler.length} adet fatura OKUNABİLİR fatura (Chrome HTML Document) olarak indirilecek. Devam etmek istiyor musunuz?`)) return
    setMesaj('Faturalar indiriliyor...')
    let i = 0
    for (const f of belgeler) {
      await orijinalIndir(f)
      i++
      setMesaj(`Faturalar indiriliyor... (${i}/${belgeler.length})`)
      await new Promise(r => setTimeout(r, 400))
    }
    setMesaj(`${belgeler.length} fatura indirildi.`)
  }

  // 1. Aşama: dosya/klasör seçildi — hemen yükleme YAPILMAZ, onay bandında
  // "Yükle" butonu çıkar. ÖNCE dosyalar gercek diziye kopyalanir:
  // input.value='' FileList'i bosaltir (canli referans length=0 olur ve
  // yukleme sessizce atlanir — kullaniciya hicbir uyarı gitmez).
  const manuelDosyaSecildi = (e) => {
    const liste = Array.from(e.target.files || [])
    e.target.value = ''
    if (!liste.length || manuelYukleniyor) return
    if (seciliClient === 'all') {
      alert('Önce müşteri seçin — seçtiğiniz dosyalar seçilen müşteriye yüklenir.')
      return
    }
    const c = (clients || []).find(x => String(x.id) === String(seciliClient))
    if (!c) { alert('Müşteri bulunamadı!'); return }
    setBekleyenDosyalar(liste)
    setAktarMesaj('')
  }

  // 2. Aşama: Yükle — ilerleme mesajlarıyla yükler, sonucu net bildirir.
  const yuklemeBaslat = async () => {
    if (!bekleyenDosyalar?.length || manuelYukleniyor) return
    const c = (clients || []).find(x => String(x.id) === String(seciliClient))
    if (!c) { alert('Müşteri bulunamadı!'); setBekleyenDosyalar(null); return }
    setManuelYukleniyor(true)
    setAktarMesaj(`Yükleniyor... (${bekleyenDosyalar.length} dosya hazırlanıyor)`)
    try {
      const sonuc = await manuelFaturaYukle({
        client: { ...c, vkn: c.vkn || c.tc || '' },
        yil: new Date().getFullYear(),
        dosyalar: bekleyenDosyalar,
        onDurum: setAktarMesaj
      })
      if (sonuc.ok) {
        setAktarMesaj(sonuc.sayi > 0
          ? `✅ Tamamlandı: ${sonuc.sayi} belge yüklendi ve listeye eklendi. ${sonuc.not || ''}`
          : `⚠️ ${sonuc.not || 'Yüklenecek belge bulunamadı.'}`)
        if (sonuc.sayi > 0) await yukle()
      } else {
        setAktarMesaj('❌ Yükleme başarısız: ' + sonuc.not)
      }
    } catch (err) {
      setAktarMesaj('❌ Yükleme hatası: ' + (err.message || err))
    } finally {
      setManuelYukleniyor(false)
      setBekleyenDosyalar(null)
    }
  }

  // Yardimci programin indirilenler klasorundeki tum pdf/xml dosyalarini
  // Storage'a aktarir + efatura_faturalar tablosuna yazar (sorgulama disi dosyalar icin)
  const aktarKlasor = async () => {
    if (seciliClient === 'all') {
      alert('Önce müşteri seçin — klasördeki dosyalar seçilen müşteriye aktarılır.')
      return
    }
    const c = (clients || []).find(x => String(x.id) === String(seciliClient))
    if (!c) { alert('Müşteri bulunamadı!'); return }
    if (!window.confirm(`"${c.shortName || c.name}" için indirilenler klasöründeki tüm fatura dosyaları buluta aktarılacak. Devam?`)) return
    setAktariliyor(true)
    setAktarMesaj('Aktarım başlıyor...')
    try {
      const sonuc = await klasordekiFaturalariAktar({ client: c, onDurum: setAktarMesaj })
      setAktarMesaj(sonuc.ok ? `Tamamlandı: ${sonuc.sayi} fatura aktarıldı. ${sonuc.not || ''}` : `Hata: ${sonuc.not}`)
      if (sonuc.ok) await yukle()
    } catch (err) {
      setAktarMesaj('Aktarım hatası: ' + (err.message || err))
    } finally { setAktariliyor(false) }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center space-x-3">
            <FileArchive className="w-8 h-8 text-yellow-400" />
            <span>e-Fatura XML İndirici</span>
          </h1>
          <p className="text-gray-400 mt-1">
            Tüm müşterilerin kayıtlı e-Fatura / e-Arşiv / e-SMM / UTTS belgeleri tek listede — XML ve PDF gerçek dosyalardır
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-4 md:mt-0">
          <button onClick={yukle} disabled={loading} title="Listeyi yenile" className="bg-blue-500/10 border border-blue-500/30 text-blue-400 px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-500/20 transition-all duration-300 flex items-center space-x-1.5 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Yenile</span>
          </button>
          <span className="w-px h-6 bg-blue-700/40 mx-1" />
          <button onClick={() => klasorInputRef.current?.click()} disabled={manuelYukleniyor || loading} title="Klasör seçin — içindeki zip/xlsx/pdf/xml/html belgeler (zip içleri açılarak) seçilen müşteriye yüklenir" className="bg-green-500/10 border border-green-500/30 text-green-400 px-3 py-2 rounded-lg text-sm font-medium hover:bg-green-500/20 transition-all duration-300 flex items-center space-x-1.5 disabled:opacity-50">
            {manuelYukleniyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}
            <span>{manuelYukleniyor ? 'Yükleniyor...' : 'Klasörden'}</span>
          </button>
          <button onClick={() => dosyaInputRef.current?.click()} disabled={manuelYukleniyor || loading} title="Zip / Excel / PDF / XML dosyalarını elle seçip yükleyin" className="bg-green-500/10 border border-green-500/30 text-green-400 px-3 py-2 rounded-lg text-sm font-medium hover:bg-green-500/20 transition-all duration-300 flex items-center space-x-1.5 disabled:opacity-50">
            <Upload className="w-4 h-4" />
            <span>Dosya</span>
          </button>
          <button onClick={aktarKlasor} disabled={aktariliyor || loading} title="Yardımcı programın indirilenler klasöründeki dosyaları buluta aktar" className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 px-3 py-2 rounded-lg text-sm font-medium hover:bg-yellow-500/20 transition-all duration-300 flex items-center space-x-1.5 disabled:opacity-50">
            {aktariliyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span>İndirilenleri Aktar</span>
          </button>
          <span className="w-px h-6 bg-blue-700/40 mx-1" />
          <button onClick={tumunuIndir} disabled={loading} title="Filtredeki faturaları okunabilir e-Belge olarak indir" className="bg-gradient-to-r from-green-500 to-green-600 text-white px-3.5 py-2 rounded-lg text-sm font-semibold hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 flex items-center space-x-1.5 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>Okunabilir İndir</span>
          </button>
          {seciliIds.size > 0 && (
            <button onClick={topluSil} disabled={siliniyor} title="Seçili belgeleri sil" className="bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-500/20 transition-all duration-300 flex items-center space-x-1.5 disabled:opacity-40">
              {siliniyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              <span>Sil ({seciliIds.size})</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-white">{faturalar.length}</div>
          <div className="text-gray-400 text-xs">Toplam Belge</div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-green-400">{faturalar.filter(f => f.xml_url).length}</div>
          <div className="text-gray-400 text-xs">XML'li</div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-blue-400">{faturalar.filter(f => f.pdf_url).length}</div>
          <div className="text-gray-400 text-xs">PDF'li</div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-yellow-400">{filtreli.length}</div>
          <div className="text-gray-400 text-xs">Filtrede</div>
        </div>
      </div>

      <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="text-gray-400 text-xs block mb-1">Müşteri</label>
            <select value={seciliClient} onChange={(e) => setSeciliClient(e.target.value)} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors">
              <option value="all">Tüm Müşteriler</option>
              {(clients || []).map(c => <option key={c.id} value={c.id}>{c.shortName || c.name || c.company}</option>)}
            </select>
          </div>
          <div>
            <label className="text-gray-400 text-xs block mb-1">Tür</label>
            <select value={seciliTur} onChange={(e) => setSeciliTur(e.target.value)} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors">
              <option value="all">Tüm Türler</option>
              {Object.entries(TURLAR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="text-gray-400 text-xs block mb-1">Fatura Türü</label>
            <select value={seciliFaturaTuru} onChange={(e) => setSeciliFaturaTuru(e.target.value)} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors">
              <option value="all">Tümü</option>
              <option value="SATIS">Satış (Kesilen)</option>
              <option value="ALIS">Alış (Alınan)</option>
              {faturaTurleri.filter(k => k !== 'SATIS' && k !== 'SARF').map(k => <option key={k} value={k}>{faturaTuruAdi(k) || k}</option>)}
            </select>
          </div>
          <div>
            <label className="text-gray-400 text-xs block mb-1">Başlangıç</label>
            <input type="date" value={dateRange.start} onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors" />
          </div>
          <div>
            <label className="text-gray-400 text-xs block mb-1">Bitiş</label>
            <input type="date" value={dateRange.end} onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors" />
          </div>
        </div>
      </div>

      {mesaj && (
        <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-2.5 mb-4 text-xs text-gray-300">{mesaj}</div>
      )}

      {/* Dosya seçildi → onay bandı (Yükle/İptal) */}
      {bekleyenDosyalar && !manuelYukleniyor && (
        <div className="bg-yellow-500/10 border border-yellow-500/40 rounded-lg p-3 mb-4 flex flex-col md:flex-row md:items-center gap-2">
          <div className="text-xs text-yellow-300 flex-1 min-w-0">
            <span className="font-semibold">{bekleyenDosyalar.length} dosya seçildi ({musteriAdi(seciliClient)}):</span>
            <span className="text-yellow-200/70 truncate block md:inline md:ml-1">{bekleyenDosyalar.slice(0, 3).map(d => d.name).join(', ')}{bekleyenDosyalar.length > 3 ? ` +${bekleyenDosyalar.length - 3} daha` : ''}</span>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={yuklemeBaslat} className="px-4 py-1.5 bg-yellow-500 text-blue-950 rounded-lg text-xs font-bold hover:bg-yellow-400 flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" /> Yükle
            </button>
            <button onClick={() => setBekleyenDosyalar(null)} className="px-3 py-1.5 bg-blue-900/40 border border-blue-700/40 rounded-lg text-gray-300 text-xs hover:bg-blue-900/60">
              İptal
            </button>
          </div>
        </div>
      )}
      {/* Yükleme sürüyor → ilerleme bandı */}
      {manuelYukleniyor && (
        <div className="bg-yellow-500/10 border border-yellow-500/40 rounded-lg p-3 mb-4 flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-yellow-400 animate-spin shrink-0" />
          <span className="text-xs text-yellow-300 font-medium">{aktarMesaj || 'Yükleniyor...'}</span>
        </div>
      )}
      {aktarMesaj && !manuelYukleniyor && (
        <div className={`rounded-lg p-2.5 mb-4 text-xs ${aktarMesaj.startsWith('✅') ? 'bg-green-500/10 border border-green-500/30 text-green-300' : aktarMesaj.startsWith('❌') ? 'bg-red-500/10 border border-red-500/30 text-red-300' : aktarMesaj.startsWith('⚠️') ? 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-300' : 'bg-yellow-900/20 border border-yellow-700/30 text-yellow-300'}`}>{aktarMesaj}</div>
      )}

      <div className="bg-blue-800/20 rounded-2xl border border-blue-700/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-blue-900/30">
              <tr className="text-left text-gray-400 text-sm">
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={filtreli.length > 0 && seciliIds.size === filtreli.length}
                    onChange={tumunuSec}
                    className="w-4 h-4 accent-yellow-400 cursor-pointer"
                    title="Tümünü seç / bırak"
                  />
                </th>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Müşteri</th>
                <th className="px-4 py-3">Tür</th>
                <th className="px-4 py-3">Yön</th>
                <th className="px-4 py-3">Fatura Türü</th>
                <th className="px-4 py-3">Fatura No</th>
                <th className="px-4 py-3">Tarih</th>
                <th className="px-4 py-3">Karşı Taraf</th>
                <th className="px-4 py-3 text-right">Toplam</th>
                <th className="px-4 py-3">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filtreli.length === 0 ? (
                <tr>
                  <td colSpan="11" className="text-center py-8 text-gray-400">
                    {loading ? 'Yükleniyor...' : 'Filtrelere uygun fatura bulunamadı. Önce Fatura Sorgulama sayfasından fatura çekin.'}
                  </td>
                </tr>
              ) : (
                filtreli.map((f, index) => (
                  <tr key={f.id} className="border-t border-blue-700/30 hover:bg-blue-800/20 transition-colors">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={seciliIds.has(f.id)}
                        onChange={() => satirSec(f.id)}
                        className="w-4 h-4 accent-yellow-400 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-400">{index + 1}</td>
                    <td className="px-4 py-3 text-white text-sm">{musteriAdi(f.client_id)}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded text-xs font-medium bg-purple-500/20 text-purple-400">{TURLAR[f.tur] || f.tur || '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${f.yon === 'giden' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                        {f.yon === 'giden' ? 'Kesilen' : 'Alınan'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{faturaTurEtiketi(f) || '-'}</td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{f.fatura_no || '-'}</td>
                    <td className="px-4 py-3 text-gray-400 text-sm">{f.tarih ? formatDateTR(f.tarih) : '-'}</td>
                    <td className="px-4 py-3 max-w-[180px] truncate text-gray-300 text-sm" title={f.karsi_unvan || f.karsi_vkn || ''}>{f.karsi_unvan || f.karsi_vkn || '-'}</td>
                    <td className="px-4 py-3 text-white font-medium text-right whitespace-nowrap">
                      {f.tutar != null ? `${Number(f.tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${f.para_birimi || 'TRY'}` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex space-x-1.5">
                        {f.pdf_url && (
                          <a href={f.pdf_url} target="_blank" rel="noreferrer" title="PDF Görüntüle" className="p-1.5 bg-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/30">
                            <Eye className="w-4 h-4" />
                          </a>
                        )}
                        {f.xml_url && f.tur !== 'utts' && f.tur !== 'gumruk' && (
                          <>
                            {f.html_url ? (
                              <button onClick={() => resmiGoruntule(f)} title="Fatura Görüntüle (Resmî e-Belge)" className="p-1.5 bg-cyan-500/20 rounded-lg text-cyan-400 hover:bg-cyan-500/30">
                                <Eye className="w-4 h-4" />
                              </button>
                            ) : (
                              <button onClick={() => xmlAc(f)} title="Fatura Görüntüle (Okunabilir)" className="p-1.5 bg-cyan-500/20 rounded-lg text-cyan-400 hover:bg-cyan-500/30">
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
                            <button onClick={() => orijinalIndir(f)} title={f.html_url ? 'Faturayı İndir (Resmî e-Belge HTML)' : 'Faturayı İndir (Okunabilir - Chrome HTML Document)'} className="p-1.5 bg-green-500/20 rounded-lg text-green-400 hover:bg-green-500/30">
                              <Download className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {f.xml_url && (f.tur === 'utts' || f.tur === 'gumruk') && (
                          <>
                            <button onClick={() => setFisGoster(f)} title="Fiş Görüntüle" className="p-1.5 bg-cyan-500/20 rounded-lg text-cyan-400 hover:bg-cyan-500/30">
                              <Eye className="w-4 h-4" />
                            </button>
                            <button onClick={() => dosyaIndir(f.xml_url, `${(f.fatura_uuid || 'rapor')}.xlsx`)} title="Excel İndir" className="p-1.5 bg-green-500/20 rounded-lg text-green-400 hover:bg-green-500/30">
                              <Download className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => tekSil(f)}
                          disabled={siliniyor}
                          title="Faturayı Sil"
                          className="p-1.5 bg-red-500/20 rounded-lg text-red-400 hover:bg-red-500/30 disabled:opacity-40"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filtreli.length > 0 && (
              <tfoot className="bg-blue-900/40 border-t-2 border-blue-700/50">
                <tr className="text-sm">
                  <td colSpan="9" className="px-4 py-2 text-right text-blue-300">Alınan ({filtreli.filter(f => f.yon !== 'giden').length} fatura)</td>
                  <td className="px-4 py-2 text-right text-blue-200 font-semibold whitespace-nowrap">
                    {toplamlar.alinan.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
                  </td>
                  <td></td>
                </tr>
                <tr className="text-sm">
                  <td colSpan="9" className="px-4 py-2 text-right text-green-300">Kesilen ({filtreli.filter(f => f.yon === 'giden').length} fatura)</td>
                  <td className="px-4 py-2 text-right text-green-200 font-semibold whitespace-nowrap">
                    {toplamlar.kesilen.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Gizli klasör/dosya seçim girişleri (manuel yükleme) */}
      <input ref={klasorInputRef} type="file" multiple className="hidden" onChange={manuelDosyaSecildi} {...{ webkitdirectory: '' }} />
      <input ref={dosyaInputRef} type="file" multiple accept=".zip,.xlsx,.xls,.pdf,.xml,.html,.htm" className="hidden" onChange={manuelDosyaSecildi} />

      {/* UTTS fiş görüntüleyici */}
      {fisGoster && <FisModal f={fisGoster} onClose={() => setFisGoster(null)} />}

      {/* XML Görüntüleyici */}
      {xmlGoster && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setXmlGoster(null)}>
          <div className="bg-slate-900 rounded-2xl border border-blue-700/40 w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-blue-700/30">
              <h3 className="text-white font-semibold flex items-center space-x-2">
                <FileArchive className="w-5 h-5 text-yellow-400" />
                <span className="truncate max-w-[500px]">{xmlGoster.baslik}</span>
              </h3>
              <div className="flex items-center space-x-2">
                {xmlGoster.bilgiler && (
                  <button
                    onClick={() => okunabilirIndir(xmlGoster.bilgiler, xmlGoster.faturaNo)}
                    className="px-3 py-1.5 bg-green-500/20 rounded-lg text-green-400 hover:bg-green-500/30 text-xs font-semibold flex items-center space-x-1"
                    title="Okunabilir fatura olarak indir (tarayıcıda açılır, Ctrl+P ile PDF olur)"
                  >
                    <Download className="w-4 h-4" />
                    <span>Fatura İndir (Okunabilir)</span>
                  </button>
                )}
                {xmlGoster.xmlUrl && (
                  <button
                    onClick={() => dosyaIndir(xmlGoster.xmlUrl, `${xmlGoster.faturaNo || 'fatura'}.xml`)}
                    className="p-1.5 bg-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/30"
                    title="Ham XML İndir"
                  >
                    <FileArchive className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => setXmlGoster(null)} className="p-1.5 bg-red-500/20 rounded-lg text-red-400 hover:bg-red-500/30" title="Kapat">
                  ✕
                </button>
              </div>
            </div>
            <div className="overflow-auto p-4 flex-1">
              {xmlGoster.yukleniyor ? (
                <div className="flex items-center justify-center py-12 text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" /> XML yükleniyor...
                </div>
              ) : xmlGoster.bilgiler ? (
                <div className="space-y-4">
                  {/* Fatura Ozeti */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { l: 'Fatura No', v: xmlGoster.bilgiler.faturaNo || '-' },
                      { l: 'Tarih', v: xmlGoster.bilgiler.tarih || '-' },
                      { l: 'Tür', v: (faturaTuruAdi(xmlGoster.bilgiler.tur) || xmlGoster.bilgiler.tur || '-') },
                      { l: 'Profil', v: xmlGoster.bilgiler.profil || '-' }
                    ].map(o => (
                      <div key={o.l} className="bg-blue-950/60 rounded-lg p-2.5">
                        <div className="text-gray-500 text-xs">{o.l}</div>
                        <div className="text-white text-sm font-medium break-all">{o.v}</div>
                      </div>
                    ))}
                  </div>
                  {/* Taraflar */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      { l: 'Satıcı', t: xmlGoster.bilgiler.satici },
                      { l: 'Alıcı', t: xmlGoster.bilgiler.alici }
                    ].map(o => (
                      <div key={o.l} className="bg-blue-950/60 rounded-lg p-3">
                        <div className="text-gray-500 text-xs mb-1">{o.l}</div>
                        <div className="text-white text-sm font-medium">{o.t.unvan || '-'}</div>
                        <div className="text-gray-400 text-xs">VKN: {o.t.vkn || '-'}</div>
                      </div>
                    ))}
                  </div>
                  {/* Kalemler */}
                  <div className="bg-blue-950/60 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-blue-900/50">
                        <tr className="text-left text-gray-400 text-xs">
                          <th className="px-3 py-2">#</th>
                          <th className="px-3 py-2">Açıklama</th>
                          <th className="px-3 py-2">Miktar</th>
                          <th className="px-3 py-2 text-right">Birim Fiyat</th>
                          <th className="px-3 py-2">KDV %</th>
                          <th className="px-3 py-2 text-right">Tutar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(xmlGoster.bilgiler.kalemler.length ? xmlGoster.bilgiler.kalemler : [{ ad: '-', miktar: 1, birim: '', fiyat: null, tutar: 0, kdvOran: 0 }]).map((k, i) => (
                          <tr key={i} className="border-t border-blue-800/40">
                            <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                            <td className="px-3 py-2 text-gray-200">{k.ad}</td>
                            <td className="px-3 py-2 text-gray-400">{k.miktar} {k.birim}</td>
                            <td className="px-3 py-2 text-gray-300 text-right">{k.fiyat != null ? Number(k.fiyat).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}</td>
                            <td className="px-3 py-2 text-gray-400">{k.kdvOran || ''}</td>
                            <td className="px-3 py-2 text-white text-right">{Number(k.tutar || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Toplamlar */}
                  <div className="flex flex-col items-end space-y-1.5 text-sm">
                    <div className="text-gray-400">Matrah (vergi hariç): <span className="text-white font-medium">{xmlGoster.bilgiler.matrah != null ? `${Number(xmlGoster.bilgiler.matrah).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${xmlGoster.bilgiler.paraBirimi}` : '-'}</span></div>
                    <div className="text-gray-400">KDV: <span className="text-white font-medium">{xmlGoster.bilgiler.kdv != null ? `${Number(xmlGoster.bilgiler.kdv).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${xmlGoster.bilgiler.paraBirimi}` : '-'}</span></div>
                    <div className="text-yellow-400 font-semibold text-base">Genel Toplam: {xmlGoster.bilgiler.tutar != null ? `${Number(xmlGoster.bilgiler.tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${xmlGoster.bilgiler.paraBirimi}` : '-'}</div>
                  </div>
                  {/* Ham XML (katlanabilir) */}
                  <details className="bg-blue-950/40 rounded-lg">
                    <summary className="px-3 py-2 text-gray-400 text-xs cursor-pointer hover:text-gray-200">Ham XML'i göster</summary>
                    <pre className="px-3 pb-3 text-[11px] text-gray-400 whitespace-pre-wrap break-all font-mono max-h-[300px] overflow-auto">{xmlGoster.hamXml}</pre>
                  </details>
                </div>
              ) : (
                <pre className="text-xs text-gray-200 whitespace-pre-wrap break-words font-mono leading-relaxed">{xmlGoster.icerik || xmlGoster.hamXml}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
