import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Download, TableProperties, Loader2, ShieldCheck, ClipboardCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { yardimciIsYerel } from '../utils/gibOdemeHelper'
import { getSettings } from '../services/settingsService'
import { beyannameSorgula, beyannameKayitlariGetirDetay } from '../services/beyannameService'
import {
  OFFICIAL_LIMITS, LIMIT_LABELS, limitsFor, estimateLimits, evaluate, bookTransitionExcel
} from '../services/bookTransitionService'

const AYLAR = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK']

function tl(x) { return (x == null ? 0 : x).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

function norm(s) {
  return String(s || '').toLocaleUpperCase('tr')
    .replace(/[İIı]/g, 'I').replace(/Ç/g, 'C').replace(/Ğ/g, 'G')
    .replace(/Ö/g, 'O').replace(/Ş/g, 'S').replace(/Ü/g, 'U')
}

function eligible(client) {
  const dt = norm(client?.defter_tipi || '')
  const isBook = dt === 'BILANCO' || dt === 'ISLETME'
  const tckn = String(client?.tc || client?.vkn || '').replace(/\s/g, '')
  const isIndividual = /^\d{11}$/.test(tckn)
  return isBook && isIndividual
}

function bookTypeOf(client) {
  const dt = norm(client?.defter_tipi || '')
  if (dt === 'BILANCO') return 'bilanco'
  if (dt === 'ISLETME') return 'isletme'
  return null
}

export default function DefterTuruGecisi() {
  const navigate = useNavigate()
  const simdi = new Date()
  const [yil, setYil] = useState(simdi.getFullYear() - 1)
  const [rate, setRate] = useState('25.49')
  const [clients, setClients] = useState([])
  const [yukleniyor, setYukleniyor] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [yearsData, setYearsData] = useState({}) // clientId -> { [y]: {purchases,sales,services,complete,closed} }
  const [editing, setEditing] = useState(null) // clientId
  const [sonuclar, setSonuclar] = useState([])
  const [mesaj, setMesaj] = useState('')
  const [calisiyor, setCalisiyor] = useState(false)
  const [dbKullanici, setDbKullanici] = useState('')
  const [dbParola, setDbParola] = useState('')
  const [dbHazir, setDbHazir] = useState(false)
  const [dbYukleniyor, setDbYukleniyor] = useState(false)
  const [dbIlerleme, setDbIlerleme] = useState('')
  const [dvsKullanici, setDvsKullanici] = useState('')
  const [dvsParola, setDvsParola] = useState('')
  const [pdfOkuyor, setPdfOkuyor] = useState(false)
  const [pdfSonuc, setPdfSonuc] = useState(null)
  const [beyanIlerleme, setBeyanIlerleme] = useState('')
  const [beyanYukleniyor, setBeyanYukleniyor] = useState(false)
  const [beyanSonuc, setBeyanSonuc] = useState(null)

  const yukle = async () => {
    setYukleniyor(true)
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, company, vkn, tc, defter_tipi, serbest_meslek')
        .order('name', { ascending: true })
      if (error) throw error
      setClients(data || [])
      try {
        const s = await getSettings()
        const kullanici = s.admin_gib_kullanici_kodu || ''
        const parola = s.admin_gib_parola || ''
        setDbKullanici(kullanici)
        setDbParola(parola)
        setDbHazir(!!(kullanici && parola))
      } catch { setDbHazir(false) }
      try {
        const s2 = await getSettings()
        setDvsKullanici(s2.admin_gib_kullanici_kodu || '')
        setDvsParola(s2.admin_gib_parola || '')
      } catch { /* yoksay */ }
    } catch (e) {
      setMesaj('Müşteriler alınamadı: ' + (e?.message || ''))
    } finally {
      setYukleniyor(false)
    }
  }
  useEffect(() => { yukle() }, [])

  const uygunFirmalar = useMemo(() => (clients || []).filter(eligible), [clients])
  const seciliFirmalar = useMemo(() => uygunFirmalar.filter((_, i) => selected.has(i)), [uygunFirmalar, selected])

  const limits = useMemo(() => {
    try {
      const y = Number(yil)
      const r = rate === '' ? null : Number(rate)
      const estimates = (OFFICIAL_LIMITS[y + 1] || r == null) ? {} : { [y + 1]: estimateLimits(y + 1, r) }
      return { year: y, targetYear: y + 1, current: limitsFor(y + 1, estimates), previous: limitsFor(y) }
    } catch (e) {
      return null
    }
  }, [yil, rate])

  const topluSec = () => setSelected(new Set(uygunFirmalar.map((_, i) => i)))
  const topluTemizle = () => setSelected(new Set())

  const yillarGerekli = (bookType) => bookType === 'bilanco' ? [Number(yil), Number(yil) - 1, Number(yil) - 2] : [Number(yil), Number(yil) - 1]

  const veriAl = (clientId, y) => (yearsData[clientId] && yearsData[clientId][y]) || { purchases: '', sales: '', services: '', complete: true, closed: Number(y) < simdi.getFullYear() }

  const veriYaz = (clientId, y, alan, deger) => {
    setYearsData(prev => {
      const cur = prev[clientId] || {}
      const ycur = cur[y] || { purchases: '', sales: '', services: '', complete: true, closed: Number(y) < simdi.getFullYear() }
      return { ...prev, [clientId]: { ...cur, [y]: { ...ycur, [alan]: deger } } }
    })
  }

  const kontrolEt = () => {
    setCalisiyor(true)
    setMesaj('')
    try {
      const r = Number(rate)
      const estimates = (OFFICIAL_LIMITS[Number(yil) + 1] || r == null) ? {} : { [Number(yil) + 1]: estimateLimits(Number(yil) + 1, r) }
      const sonuc = []
      for (const c of uygunFirmalar.filter((_, i) => selected.has(i))) {
        const bt = bookTypeOf(c)
        const tckn = String(c.tc || c.vkn || '').replace(/\s/g, '')
        const entity = /^\d{11}$/.test(tckn) ? 'individual' : 'unknown'
        const years = {}
        for (const y of yillarGerekli(bt)) {
          const v = veriAl(c.id, y)
          const p = Number(v.purchases), s = Number(v.sales), h = Number(v.services)
          years[y] = {
            purchases: Number.isFinite(p) ? p : null,
            sales: Number.isFinite(s) ? s : null,
            services: Number.isFinite(h) ? h : null,
            complete: !!v.complete,
            closed: !!v.closed,
            activity: (Number.isFinite(s) && s > 0 && Number.isFinite(h) && h > 0) ? 'mixed' : (Number.isFinite(h) && h > 0 && (!Number.isFinite(s) || s === 0)) ? 'service' : 'trade',
          }
        }
        const ev = evaluate({ bookType: bt, entity, year: Number(yil), years, estimates })
        sonuc.push({ ad: (c.company || c.name || '').trim(), bookType: bt, entity, years, result: ev })
      }
      setSonuclar(sonuc)
      if (!sonuc.length) setMesaj('Seçili firma yok.')
      else setMesaj(`${sonuc.length} firma için değerlendirme tamamlandı.`)
    } catch (e) {
      setMesaj('Hata: ' + (e?.message || ''))
    } finally {
      setCalisiyor(false)
    }
  }

  const defterBeyanOtomatikAl = async () => {
    if (!dbHazir) {
      setMesaj('Defter Beyan IVD kimlik bilgileri eksik. Beyan Hazırlama sayfasından (veya Ayarlar > GİB Bağlantı) kullanıcı/parola kaydedin, sonra "Firmaları yenile" ile tekrar deneyin.')
      return
    }
    const secili = uygunFirmalar.filter((_, i) => selected.has(i))
    if (!secili.length) { setMesaj('En az bir firma seçin.'); return }
    setDbYukleniyor(true)
    setDbIlerleme('')
    setMesaj('')
    let tamam = 0, hataSayisi = 0
    const yeniYearsData = { ...yearsData }
    try {
      for (let fi = 0; fi < secili.length; fi++) {
        const c = secili[fi]
        const bt = bookTypeOf(c)
        const vkn = String(c.vkn || c.tc || '').replace(/\s/g, '')
        if (!/^\d{10,11}$/.test(vkn)) { hataSayisi++; continue }
        const yillar = yillarGerekli(bt)
        for (let yi = 0; yi < yillar.length; yi++) {
          const y = yillar[yi]
          setDbIlerleme(`${fi + 1}/${secili.length} firma — ${c.company || c.name} — ${y} yılı`)
          try {
            const res = await yardimciIsYerel('defterbeyan-hesap-ozeti', { vkn, baslangic: `01.01.${y}`, bitis: `31.12.${y}`, kullaniciKodu: dbKullanici, parola: dbParola }, 5 * 60 * 1000)
            const ozet = res?.ozet || res
            if (!res?.ok && res?.ok !== undefined) throw new Error(res?.reason || res?.not || 'Hesap özeti alınamadı')
            const hasilat = Number(ozet?.hasilat)
            const satinAlinan = Number(ozet?.satinAlinanEmtia)
            const isService = (c.serbest_meslek === true) || norm(c.defter_tipi || '') === 'SERBESTMESLEK'
            const ycur = {
              purchases: Number.isFinite(satinAlinan) ? satinAlinan : '',
              sales: (!isService && Number.isFinite(hasilat)) ? hasilat : '',
              services: (isService && Number.isFinite(hasilat)) ? hasilat : '',
              complete: true,
              closed: y < simdi.getFullYear(),
            }
            if (!yeniYearsData[c.id]) yeniYearsData[c.id] = {}
            yeniYearsData[c.id][y] = ycur
            tamam++
          } catch (e) {
            hataSayisi++
            setMesaj(`${c.company || c.name} — ${y}: ${e?.message || 'hesap özeti alınamadı'}`)
          }
        }
      }
      setYearsData(yeniYearsData)
      // Değerlendirme (güncel veriyle)
      const r = Number(rate)
      const estimates = (OFFICIAL_LIMITS[Number(yil) + 1] || r == null) ? {} : { [Number(yil) + 1]: estimateLimits(Number(yil) + 1, r) }
      const sonuc = []
      for (const c of secili) {
        const bt = bookTypeOf(c)
        const tckn = String(c.tc || c.vkn || '').replace(/\s/g, '')
        const entity = /^\d{11}$/.test(tckn) ? 'individual' : 'unknown'
        const years = {}
        for (const y of yillarGerekli(bt)) {
          const v = (yeniYearsData[c.id] && yeniYearsData[c.id][y]) || { purchases: '', sales: '', services: '', complete: true, closed: y < simdi.getFullYear() }
          const p = Number(v.purchases), s = Number(v.sales), h = Number(v.services)
          years[y] = {
            purchases: Number.isFinite(p) ? p : null,
            sales: Number.isFinite(s) ? s : null,
            services: Number.isFinite(h) ? h : null,
            complete: !!v.complete,
            closed: !!v.closed,
            activity: (Number.isFinite(s) && s > 0 && Number.isFinite(h) && h > 0) ? 'mixed' : (Number.isFinite(h) && h > 0 && (!Number.isFinite(s) || s === 0)) ? 'service' : 'trade',
          }
        }
        const ev = evaluate({ bookType: bt, entity, year: Number(yil), years, estimates })
        sonuc.push({ ad: (c.company || c.name || '').trim(), bookType: bt, entity, years, result: ev })
      }
      setSonuclar(sonuc)
      setMesaj(`${tamam} yıl verisi Defter Beyan'dan alındı.` + (hataSayisi ? ` ${hataSayisi} hata.` : '') + ` ${sonuc.length} firma değerlendirildi.`)
    } catch (e) {
      setMesaj('Hata: ' + (e?.message || ''))
    } finally {
      setDbYukleniyor(false)
      setDbIlerleme('')
    }
  }
  const beyannameSorgulaMart = async () => {
    if (!dvsKullanici || !dvsParola) {
      setMesaj('DVS kimlik bilgileri eksik. Ayarlar > GİB Bağlantı Merkezi\'nden admin GİB kullanıcı/parola kaydedin.')
      return
    }
    const secili = uygunFirmalar.filter((_, i) => selected.has(i))
    if (!secili.length) { setMesaj('En az bir firma seçin.'); return }
    setBeyanYukleniyor(true)
    setBeyanSonuc(null)
    setBeyanIlerleme('GİB sorgusu başlatılıyor...')
    setMesaj('')
    const baslangic = Date.now()
    const timer = setInterval(() => {
      const sn = Math.floor((Date.now() - baslangic) / 1000)
      const dk = Math.floor(sn / 60)
      setBeyanIlerleme(`GİB sorgusu çalışıyor — ${dk > 0 ? dk + ' dk ' : ''}${sn % 60} sn geçti. Bu işlem birkaç dakika sürebilir; sayfayı kapatmayın.`)
    }, 1000)
    try {
      const tcknler = secili.map(c => String(c.tc || c.vkn || '').replace(/\s/g, '')).filter(v => /^\d{10,11}$/.test(v))
      const yilSorgu = Number(yil) + 1
      const res = await beyannameSorgula({ kullaniciKodu: dvsKullanici, parola: dvsParola, yil: yilSorgu, ay: 2, turKodu: 'GELIR', vknListesi: tcknler })
      if (!res?.ok) throw new Error(res?.reason || res?.error || 'Beyanname sorgusu başarısız')
      const { kayitlar } = await beyannameKayitlariGetirDetay(yilSorgu, 2)
      const bulunan = new Map()
      for (const k of (kayitlar || [])) {
        if (k.tur && !/gelir/i.test(k.tur)) continue
        if (!bulunan.has(k.vkn)) bulunan.set(k.vkn, k)
      }
      const sonuc = secili.map(c => {
        const tckn = String(c.tc || c.vkn || '').replace(/\s/g, '')
        const kayit = bulunan.get(tckn)
        return {
          ad: (c.company || c.name || '').trim(),
          tckn,
          bulundu: !!kayit,
          donem: kayit?.donem || '',
          yukleme: kayit?.yukleme_zamani || '',
          unvan: kayit?.unvan || '',
        }
      })
      setBeyanSonuc(sonuc)
      const n = sonuc.filter(s => s.bulundu).length
      setMesaj(`${n}/${sonuc.length} firmada ${Number(yil)} yılı Gelir Vergisi beyanı (Mart ${yilSorgu} yükleme) bulundu.`)
    } catch (e) {
      setMesaj('Beyanname sorgu hatası: ' + (e?.message || ''))
    } finally {
      clearInterval(timer)
      setBeyanYukleniyor(false)
      setBeyanIlerleme('')
    }
  }

  const pdfBeyannameOku = async (fileList) => {
    setPdfOkuyor(true)
    setPdfSonuc(null)
    setMesaj('')
    const sonuc = []
    try {
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
        pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default
      }
      const parseSayi = (s) => {
        const m = String(s || '').match(/-?[\d.]+,\d{2}/)
        if (!m) return null
        return Number(m[0].replace(/\./g, '').replace(',', '.'))
      }
      // İşletme Hesabı Özeti: sayılar sabit sırada gelir:
      // [dönem başı emtia, satın alınan emtia, giderler, hasilat, dönem sonu emtia, zarar, kar, diğer gelirler]
      const ozetBul = (metin) => {
        const idx = metin.search(/İşletme Hesabı Özeti|İŞLETME HESABI ÖZETİ|Ticari Kazanç.*İşletme/i)
        const bolge = idx >= 0 ? metin.slice(idx) : metin
        const sayilar = bolge.match(/-?[\d.]+,\d{2}/g) || []
        const vals = sayilar.map(parseSayi).filter(n => n !== null)
        // ilk 8 sayıyı al
        const v = vals.slice(0, 8)
        return {
          donemBasi: v[0] ?? null,
          satinAlinan: v[1] ?? null,
          giderler: v[2] ?? null,
          hasilat: v[3] ?? null,
          donemSonu: v[4] ?? null,
          zarar: v[5] ?? null,
          kar: v[6] ?? null,
          digerGelirler: v[7] ?? null,
        }
      }
      const bul = (metin, kalip) => null // kept for compat; use ozetBul
      const tcknBul = (metin) => {
        let m = metin.match(/T\.?\s*C\.?\s*Kimlik\s*No[^0-9]{0,20}(\d{11})/i)
        if (m) return m[1]
        m = metin.match(/Kimlik\s*No[^0-9]{0,20}(\d{11})/i)
        if (m) return m[1]
        const tum = metin.match(/\d{11}/g)
        return tum ? tum[0] : null
      }
      for (const file of fileList) {
        try {
          const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
          const pages = []
          for (let p = 1; p <= pdf.numPages; p++) {
            const page = await pdf.getPage(p)
            const content = await page.getTextContent()
            pages.push(content.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join(''))
          }
          const metin = pages.join('\n')
          const tckn = (clients || []).map(c => String(c.tc || '').replace(/\s/g, '')).find(tc => tc.length === 11 && metin.includes(tc)) || null
          const client = (clients || []).find(c => String(c.tc || '').replace(/\s/g, '') === tckn || String(c.vkn || '').replace(/\s/g, '') === tckn)
          const ozet = ozetBul(metin)
          const hasilat = ozet.hasilat
          const satinAlinan = ozet.satinAlinan
          const donemBasi = ozet.donemBasi
          const donemSonu = ozet.donemSonu
          if (client) {
            const bt = bookTypeOf(client)
            const isService = (client.serbest_meslek === true) || norm(client.defter_tipi || '') === 'SERBESTMESLEK'
            const y = Number(yil)
            const ycur = {
              purchases: Number.isFinite(satinAlinan) ? satinAlinan : '',
              sales: (!isService && Number.isFinite(hasilat)) ? hasilat : '',
              services: (isService && Number.isFinite(hasilat)) ? hasilat : '',
              complete: true,
              closed: y < simdi.getFullYear(),
            }
            setYearsData(prev => {
              const cur = prev[client.id] || {}
              return { ...prev, [client.id]: { ...cur, [y]: ycur } }
            })
          }
          sonuc.push({ dosya: file.name, tckn, client: client ? (client.company || client.name) : 'eşleşme yok', hasilat, satinAlinan, donemBasi, donemSonu })
        } catch (e) {
          sonuc.push({ dosya: file.name, tckn: null, client: 'okunamadı', hasilat: null, satinAlinan: null, donemBasi: null, donemSonu: null, hata: e?.message })
        }
      }
      setPdfSonuc(sonuc)
      setMesaj(`${sonuc.length} PDF işlendi. Eşleşen firmaların yıllık verileri dolduruldu.`)
      setTimeout(() => { try { kontrolEt() } catch { /* manuel */ } }, 0)
    } catch (e) {
      setMesaj('PDF okuma hatası: ' + (e?.message || ''))
    } finally {
      setPdfOkuyor(false)
    }
  }

  const excelIndir = async () => {
    try {
      const n = await bookTransitionExcel({ yil: Number(yil), rows: sonuclar, rate })
      setMesaj(`Excel hazır (${n} satır).`)
      setTimeout(() => setMesaj(null), 4000)
    } catch (e) {
      setMesaj('Excel hatası: ' + (e?.message || ''))
    }
  }

  const durumRenk = (s) => {
    if (!s) return 'text-gray-400'
    if (s.includes('gerekli')) return 'text-red-400'
    if (s.includes('mümkün')) return 'text-sky-400'
    if (s.includes('devam')) return 'text-emerald-400'
    return 'text-amber-400'
  }

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <TableProperties className="w-6 h-6 text-cyan-400" />
        <h1 className="text-2xl font-bold text-white">Defter Türü Geçişi</h1>
      </div>
      <p className="text-gray-400 text-sm mb-4 leading-relaxed">
        VUK 177/179/180: iş hacmi hadlerine göre işletme ↔ bilanço defteri geçiş değerlendirmesi.
        Bu kontrol Luca kayıtlarını veya defter türünü değiştirmez. Şahıs firmaları (11 haneli TCKN) ve işletme/bilanço defterli firmalar için uygulanır.
      </p>

      <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">İncelenecek faaliyet yılı</label>
            <input type="number" min="2025" max={simdi.getFullYear()} value={yil} onChange={e => setYil(Number(e.target.value))} className="bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm w-28" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Tahmini had artışı (%)</label>
            <input type="number" min="0" max="200" step="0.01" value={rate} onChange={e => setRate(e.target.value)} className="bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm w-28" />
          </div>
          <button onClick={yukle} disabled={yukleniyor} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition">
            {yukleniyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Firmaları yenile
          </button>
          <button onClick={beyannameSorgulaMart} disabled={beyanYukleniyor || selected.size === 0 || !dvsKullanici || !dvsParola} title="e-Beyanname'de Mart ayında TC ile Gelir Vergisi beyanı sorgula" className="flex items-center gap-2 bg-amber-700/80 hover:bg-amber-600 disabled:opacity-40 text-white rounded-lg px-4 py-2 text-sm font-medium transition">
            {beyanYukleniyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />} Beyanname sorgula (Mart)
          </button>
          <button onClick={topluSec} className="px-3 py-2 rounded-lg bg-blue-900/60 border border-blue-700/60 text-gray-200 text-sm hover:bg-blue-900/80">Tümünü seç</button>
          <button onClick={() => { const s = new Set(); uygunFirmalar.forEach((c, i) => { if (bookTypeOf(c) === 'isletme') s.add(i) }); setSelected(s) }} className="px-3 py-2 rounded-lg bg-blue-900/60 border border-blue-700/60 text-gray-200 text-sm hover:bg-blue-900/80">İşletme seç</button>
          <button onClick={() => { const s = new Set(); uygunFirmalar.forEach((c, i) => { if (bookTypeOf(c) === 'bilanco') s.add(i) }); setSelected(s) }} className="px-3 py-2 rounded-lg bg-blue-900/60 border border-blue-700/60 text-gray-200 text-sm hover:bg-blue-900/80">Bilanço seç</button>
          <button onClick={topluTemizle} className="px-3 py-2 rounded-lg bg-blue-900/60 border border-blue-700/60 text-gray-200 text-sm hover:bg-blue-900/80">Seçimi temizle</button>
          <button onClick={kontrolEt} disabled={calisiyor || selected.size === 0} className="flex items-center gap-2 bg-emerald-700/80 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg px-4 py-2 text-sm font-medium transition">
            {calisiyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Yıllık verileri al ve kontrol et
          </button>
          <button onClick={excelIndir} disabled={!sonuclar.length} className="flex items-center gap-2 bg-cyan-700/80 hover:bg-cyan-600 disabled:opacity-40 text-white rounded-lg px-4 py-2 text-sm font-medium transition">
            <Download className="w-4 h-4" /> Excel
          </button>
        </div>
        {mesaj && <div className="mt-3 text-sm text-cyan-200">{mesaj}</div>}
        {beyanIlerleme && <div className="mt-1 text-xs text-amber-300 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {beyanIlerleme}</div>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-700/80 hover:bg-emerald-600 text-white text-sm font-medium transition cursor-pointer">
            {pdfOkuyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Beyanname PDF'den oku (otomatik)
            <input type="file" accept=".pdf" multiple className="hidden" onChange={e => { if (e.target.files?.length) pdfBeyannameOku(Array.from(e.target.files)); e.target.value = '' }} disabled={pdfOkuyor} />
          </label>
          <span className="text-xs text-gray-400">Gelir Vergisi beyanname PDF'lerini seçin; TCKN ve hesap özeti otomatik okunur.</span>
        </div>
        {pdfSonuc && (
          <div className="mt-2 text-xs text-gray-300">
            {pdfSonuc.map((p, i) => (
              <div key={i} className="flex flex-wrap gap-2 border-b border-blue-800/30 py-1">
                <span className="text-white">{p.dosya}</span>
                <span className="text-gray-400">TCKN: {p.tckn || '—'}</span>
                <span className="text-gray-400">Firma: {p.client}</span>
                <span className="text-cyan-300">Hasılat: {p.hasilat != null ? p.hasilat.toLocaleString('tr-TR') : '—'}</span>
                <span className="text-cyan-300">Satın alınan emtia: {p.satinAlinan != null ? p.satinAlinan.toLocaleString('tr-TR') : '—'}</span>
                {p.hata && <span className="text-red-300">{p.hata}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Limit tablosu */}
      {limits && (
        <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4 mb-4">
          <p className="text-sm text-gray-300 mb-2">Hedef yıl: <b>{limits.targetYear}</b> — incelenen yıllar: {limits.year} ve {limits.year - 1}{limits.current?.estimated ? ' (tahmini had)' : ''}</p>
          <div className="overflow-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-gray-300">
                  <th className="px-3 py-2 text-left">Ölçüt</th>
                  <th className="px-3 py-2 text-right">{limits.year} haddi (önceki yıl kontrolü)</th>
                  <th className="px-3 py-2 text-right">{limits.targetYear} haddi{limits.current?.estimated ? ' — TAHMİNİ' : ''}</th>
                  <th className="px-3 py-2 text-right">%20 üst sınır</th>
                </tr>
              </thead>
              <tbody>
                {LIMIT_LABELS.map(([key, label]) => (
                  <tr key={key} className="border-t border-blue-800/30">
                    <td className="px-3 py-2 text-gray-200">{label}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{limits.previous?.[key] != null ? tl(limits.previous[key]) + ' TL' : 'oran girin'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{limits.current?.[key] != null ? tl(limits.current[key]) + ' TL' : 'oran girin'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{limits.current?.[key] != null ? tl(limits.current[key] * 1.2) + ' TL' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Firma seçimi + yıllık veri girişi */}
      <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4 mb-4">
        <h3 className="text-white font-semibold mb-2">Uygun firmalar ({uygunFirmalar.length})</h3>
        {yukleniyor ? (
          <div className="py-6 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
        ) : uygunFirmalar.length === 0 ? (
          <p className="text-gray-500 text-sm">Uygun firma yok. Mükellef listesinden defter türü (İşletme/Bilanço) ve TCKN (11 hane) bilgilerini güncelleyin (Luca'dan firma getir).</p>
        ) : (
          <div className="overflow-auto max-h-[420px]">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-300">
                  <th className="px-2 py-2 text-left">Seç</th>
                  <th className="px-2 py-2 text-left">Firma</th>
                  <th className="px-2 py-2 text-left">Defter</th>
                  <th className="px-2 py-2 text-left">Yıllık veri (Y / Y-1 / Y-2)</th>
                </tr>
              </thead>
              <tbody>
                {uygunFirmalar.map((c, i) => {
                  const bt = bookTypeOf(c)
                  const yillar = yillarGerekli(bt)
                  const isOpen = editing === c.id
                  return (
                    <tr key={c.id} className="border-t border-blue-800/30 align-top">
                      <td className="px-2 py-2">
                        <input type="checkbox" checked={selected.has(i)} onChange={e => {
                          const s = new Set(selected)
                          if (e.target.checked) s.add(i); else s.delete(i)
                          setSelected(s)
                        }} className="accent-yellow-500" />
                      </td>
                      <td className="px-2 py-2 text-white max-w-[220px] truncate" title={c.company || c.name}>{c.company || c.name}</td>
                      <td className="px-2 py-2 text-gray-300">{bt === 'bilanco' ? 'Bilanço' : 'İşletme'}</td>
                      <td className="px-2 py-2">
                        <button onClick={() => setEditing(isOpen ? null : c.id)} className="text-xs text-cyan-300 hover:underline mb-1">
                          {isOpen ? 'Kapat' : 'Veri gir'}
                        </button>
                        {isOpen && (
                          <div className="space-y-2 mt-1">
                            {yillar.map(y => (
                              <div key={y} className="flex flex-wrap items-center gap-1">
                                <span className="text-xs text-gray-400 w-12">{y}</span>
                                <input type="number" placeholder="Mal alım" value={veriAl(c.id, y).purchases} onChange={e => veriYaz(c.id, y, 'purchases', e.target.value)} className="bg-blue-900/60 border border-blue-700/60 rounded px-2 py-1 text-white text-xs w-24" />
                                <input type="number" placeholder="Mal satış" value={veriAl(c.id, y).sales} onChange={e => veriYaz(c.id, y, 'sales', e.target.value)} className="bg-blue-900/60 border border-blue-700/60 rounded px-2 py-1 text-white text-xs w-24" />
                                <input type="number" placeholder="Hizmet geliri" value={veriAl(c.id, y).services} onChange={e => veriYaz(c.id, y, 'services', e.target.value)} className="bg-blue-900/60 border border-blue-700/60 rounded px-2 py-1 text-white text-xs w-28" />
                                <label className="text-xs text-gray-400 flex items-center gap-1">
                                  <input type="checkbox" checked={veriAl(c.id, y).complete} onChange={e => veriYaz(c.id, y, 'complete', e.target.checked)} /> tam
                                </label>
                                <label className="text-xs text-gray-400 flex items-center gap-1">
                                  <input type="checkbox" checked={veriAl(c.id, y).closed} onChange={e => veriYaz(c.id, y, 'closed', e.target.checked)} /> kapalı
                                </label>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Beyanname sorgu sonucu */}
      {beyanSonuc && (
        <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4 mb-4">
          <h3 className="text-white font-semibold mb-2">Gelir Vergisi Beyanı — Mart {Number(yil) + 1} yükleme ({beyanSonuc.filter(s => s.bulundu).length}/{beyanSonuc.length})</h3>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-300">
                  <th className="px-3 py-2 text-left">Firma</th>
                  <th className="px-3 py-2 text-left">TCKN</th>
                  <th className="px-3 py-2 text-left">Durum</th>
                  <th className="px-3 py-2 text-left">Dönem</th>
                  <th className="px-3 py-2 text-left">Yükleme</th>
                </tr>
              </thead>
              <tbody>
                {beyanSonuc.map((s, i) => (
                  <tr key={i} className="border-t border-blue-800/30">
                    <td className="px-3 py-2 text-white max-w-[220px] truncate" title={s.ad}>{s.ad}</td>
                    <td className="px-3 py-2 text-gray-300 tabular-nums">{s.tckn}</td>
                    <td className={`px-3 py-2 font-medium ${s.bulundu ? 'text-emerald-400' : 'text-red-400'}`}>{s.bulundu ? 'Bulundu' : 'Bulunamadı'}</td>
                    <td className="px-3 py-2 text-gray-400 text-xs">{s.donem || '—'}</td>
                    <td className="px-3 py-2 text-gray-400 text-xs">{s.yukleme || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 mt-2">Yükleme tarihi Mart {Number(yil) + 1} olan Gelir Vergisi beyannameleri listelenir. Hesap özeti (mal alım/satış/hizmet) için beyanname PDF'ini indirip yıllık veri alanına girin veya Defter Beyan'dan otomatik alın.</p>
        </div>
      )}

      {/* Sonuçlar */}
      {sonuclar.length > 0 && (
        <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4">
          <h3 className="text-white font-semibold mb-2">Sonuçlar ({sonuclar.length})</h3>
          <div className="overflow-auto">
            <table className="w-full text-sm min-w-[980px]">
              <thead>
                <tr className="text-gray-300">
                  <th className="px-3 py-2 text-left">Firma</th>
                  <th className="px-3 py-2 text-left">Mal alımları</th>
                  <th className="px-3 py-2 text-left">Mal satışları</th>
                  <th className="px-3 py-2 text-left">Hizmet geliri</th>
                  <th className="px-3 py-2 text-left">Önceki yıl (al/sat/hiz)</th>
                  <th className="px-3 py-2 text-left">Sonuç</th>
                  <th className="px-3 py-2 text-left">Açıklama</th>
                </tr>
              </thead>
              <tbody>
                {sonuclar.map((r, i) => {
                  const v = r.years?.[Number(yil)] || {}
                  const prev = r.years?.[Number(yil) - 1]
                  return (
                    <tr key={i} className="border-t border-blue-800/30">
                      <td className="px-3 py-2 text-white max-w-[200px] truncate" title={r.ad}>{r.ad}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-200">{v.purchases != null ? tl(v.purchases) : '—'}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-200">{v.sales != null ? tl(v.sales) : '—'}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-200">{v.services != null ? tl(v.services) : '—'}</td>
                      <td className="px-3 py-2 text-gray-400 text-xs">{prev?.complete ? [prev.purchases, prev.sales, prev.services].map(n => Number.isFinite(n) ? tl(n) : '—').join(' / ') : (prev?.error || 'önceki yıl okunamadı')}</td>
                      <td className={`px-3 py-2 font-medium ${durumRenk(r.result?.status)}`}>{r.result?.status || '—'}{r.result?.estimated ? ' (tahmini)' : ''}{r.result?.provisional ? ' (ön)' : ''}</td>
                      <td className="px-3 py-2 text-gray-400 text-xs max-w-[360px]">{r.result?.reason || v.error || ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
