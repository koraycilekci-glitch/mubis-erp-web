import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Download, TableProperties, Loader2, PlayCircle, ReceiptText, ShieldCheck } from 'lucide-react'
import { kontrolMerkeziOzeti, faturaListesiExcel, kdv2Listesi, esmmAlisListesi, tabloExcel } from '../services/kontrolMerkeziService'
import { efaturaSorgula, dosyalariMubisYukle, edefterTopluKopyala, faturaKopyalamaDosyalari, lucaDurumMetni, faturaIlerlemeMetni } from '../services/efaturaService'

const AYLAR = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK']

function tl(x) {
  return (x == null ? 0 : x).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function tarihTR(t) {
  if (!t) return ''
  const m = String(t).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(t).slice(0, 10)
}

function TutarHucresi({ toplam, sayi, okunmayan }) {
  if (sayi === 0) return <span className="text-gray-600 text-xs">—</span>
  if (okunmayan > 0) {
    return <span className="text-amber-400 text-xs leading-tight block">Bu dönemin fatura okuması tamamlanmamış<span className="block text-gray-500">({sayi} belge, {okunmayan} okunmayan)</span></span>
  }
  return <span className="text-gray-200 tabular-nums">{tl(toplam)}</span>
}

function OzetKutu({ etiket, deger, vurgu = 'text-white' }) {
  return (
    <div className="bg-blue-900/30 border border-blue-800/40 rounded-xl px-3 py-2">
      <div className="text-[11px] text-gray-400 leading-tight">{etiket}</div>
      <div className={`text-sm md:text-base font-semibold tabular-nums ${vurgu}`}>{deger}</div>
    </div>
  )
}

export default function KontrolMerkezi() {
  const navigate = useNavigate()
  const simdi = new Date()
  const [yil, setYil] = useState(simdi.getFullYear())
  const [ay, setAy] = useState(simdi.getMonth() + 1)
  const [sekme, setSekme] = useState('firma')
  const [rows, setRows] = useState(null)
  const [ozet, setOzet] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState('')
  const [arama, setArama] = useState('')
  const [excelDonen, setExcelDonen] = useState(null)
  // 2.8.60: KDV2 ve e-SMM raporlari
  const [kdv2, setKdv2] = useState(null)
  const [kdv2Yukleniyor, setKdv2Yukleniyor] = useState(false)
  const [kdv2Hata, setKdv2Hata] = useState('')
  const [esmm, setEsmm] = useState(null)
  const [esmmYukleniyor, setEsmmYukleniyor] = useState(false)
  const [esmmHata, setEsmmHata] = useState('')
  // 2.7.543: "Aşamayı Tamamla" — lucadaki hazir faturalari indir + MUBiS'e yukle + klasore kopyala
  const [asamaCalisan, setAsamaCalisan] = useState(null) // client id
  const [asamaMesaj, setAsamaMesaj] = useState('')

  const yukle = async () => {
    setYukleniyor(true)
    setHata('')
    try {
      const sonuc = await kontrolMerkeziOzeti({ yil, ay })
      setRows(sonuc.rows)
      setOzet(sonuc.ozet)
    } catch (e) {
      setHata(e?.message || 'Veri alınamadı')
      setRows([])
    } finally {
      setYukleniyor(false)
    }
  }
  useEffect(() => { yukle() }, [yil, ay])

  const kdv2Yukle = async () => {
    setKdv2Yukleniyor(true)
    setKdv2Hata('')
    try {
      setKdv2(await kdv2Listesi({ yil, ay }))
    } catch (e) {
      setKdv2Hata(e?.message || 'KDV2 listesi alınamadı')
      setKdv2(null)
    } finally {
      setKdv2Yukleniyor(false)
    }
  }

  const esmmYukle = async () => {
    setEsmmYukleniyor(true)
    setEsmmHata('')
    try {
      setEsmm(await esmmAlisListesi({ yil, ay }))
    } catch (e) {
      setEsmmHata(e?.message || 'e-SMM listesi alınamadı')
      setEsmm(null)
    } finally {
      setEsmmYukleniyor(false)
    }
  }

  useEffect(() => {
    if (sekme === 'kdv2') kdv2Yukle()
    else if (sekme === 'esmm') esmmYukle()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yil, ay, sekme])

  const aramaNorm = arama.trim().toLocaleLowerCase('tr')
  const gosterilen = useMemo(() => {
    if (!aramaNorm) return rows || []
    return (rows || []).filter(r => r.ad.toLocaleLowerCase('tr').includes(aramaNorm))
  }, [rows, aramaNorm])

  const kdv2Filtreli = useMemo(() => {
    const liste = kdv2?.companies || []
    if (!aramaNorm) return liste
    return liste.filter(g => g.ad.toLocaleLowerCase('tr').includes(aramaNorm))
  }, [kdv2, aramaNorm])

  const esmmFiltreli = useMemo(() => {
    const liste = esmm?.companies || []
    if (!aramaNorm) return liste
    return liste.filter(g => g.ad.toLocaleLowerCase('tr').includes(aramaNorm))
  }, [esmm, aramaNorm])

  const excelIndir = async (r, yon) => {
    try {
      const sayi = await faturaListesiExcel(r.id, r.ad, { yil, ay, yon })
      setExcelDonen(`${r.ad} · ${yon === 'satis' ? 'Satış' : 'Alış'} Excel hazır (${sayi} satır)`)
      setTimeout(() => setExcelDonen(null), 4000)
    } catch (e) {
      setExcelDonen('Excel hatası: ' + (e?.message || ''))
    }
  }

  const kdv2ExcelIndir = async () => {
    const satirlar = []
    for (const g of kdv2Filtreli) {
      for (const i of g.invoices) {
        satirlar.push({
          'Firma': g.ad,
          'Firma VKN': g.vkn,
          'Tarih': tarihTR(i.tarih),
          'Fatura No': i.faturaNo,
          'Karşı Taraf': i.karsiUnvan,
          'VKN / TCKN': i.karsiVkn,
          'Matrah': i.matrah,
          'Fatura KDV': i.kdv,
          'Tevkifat KDV': i.tevkifatKdv,
          'Oranlar': i.oranlar.map(o => `%${o}`).join(', '),
          'Toplam': i.tutar,
          'Durum': i.eksik ? 'KDV dökümü yok — tevkifat hesaplanamadı' : 'Okundu',
        })
      }
    }
    try {
      await tabloExcel({
        sayfaAdi: 'KDV2',
        baslik: `KDV2 Listesi — ${AYLAR[ay - 1]} ${yil}`,
        altBaslik: `Tevkifatlı alış faturaları (iade hariç) · ${kdv2Filtreli.length} firma · TL`,
        kolonlar: ['Firma', 'Firma VKN', 'Tarih', 'Fatura No', 'Karşı Taraf', 'VKN / TCKN', 'Matrah', 'Fatura KDV', 'Tevkifat KDV', 'Oranlar', 'Toplam', 'Durum'],
        satirlar,
        dosyaAdi: `KDV2_Listesi_${yil}_${String(ay).padStart(2, '0')}.xlsx`,
      })
      setExcelDonen(`KDV2 Excel hazır (${satirlar.length} fatura)`)
      setTimeout(() => setExcelDonen(null), 4000)
    } catch (e) {
      setExcelDonen('Excel hatası: ' + (e?.message || ''))
    }
  }

  const esmmExcelIndir = async () => {
    const satirlar = []
    for (const g of esmmFiltreli) {
      for (const i of g.invoices) {
        satirlar.push({
          'Firma': g.ad,
          'Firma VKN': g.vkn,
          'Tarih': tarihTR(i.tarih),
          'Belge No': i.faturaNo,
          'Düzenleyen': i.duzenleyen,
          'VKN / TCKN': i.karsiVkn,
          'Matrah': i.matrah,
          'KDV': i.kdv,
          'Stopaj': i.stopaj,
          'Tevkifat': i.tevkifat,
          'Toplam': i.tutar,
          'Durum': i.eksik ? 'Stopaj/tevkifat kaydı yok' : 'Okundu',
        })
      }
    }
    try {
      await tabloExcel({
        sayfaAdi: 'e-SMM Alış',
        baslik: `e-SMM Alış Listesi — ${AYLAR[ay - 1]} ${yil}`,
        altBaslik: `Alınan e-Serbest Meslek Makbuzları · ${esmmFiltreli.length} firma · TL`,
        kolonlar: ['Firma', 'Firma VKN', 'Tarih', 'Belge No', 'Düzenleyen', 'VKN / TCKN', 'Matrah', 'KDV', 'Stopaj', 'Tevkifat', 'Toplam', 'Durum'],
        satirlar,
        dosyaAdi: `e-SMM_Alis_Listesi_${yil}_${String(ay).padStart(2, '0')}.xlsx`,
      })
      setExcelDonen(`e-SMM Excel hazır (${satirlar.length} belge)`)
      setTimeout(() => setExcelDonen(null), 4000)
    } catch (e) {
      setExcelDonen('Excel hatası: ' + (e?.message || ''))
    }
  }

  // 2.7.543: "Aşamayı Tamamla" — bu firma icin Luca'daki hazir faturalari
  // indir (sorgu yapilmaz), MUBiS'e yukle, EDEFTER klasorlerine kopyala.
  const asamaTamamla = async (r) => {
    if (asamaCalisan) return
    setAsamaCalisan(r.id)
    const turlar = ['efatura', 'earsiv', 'esmm', 'utts']
    const turAdlari = { efatura: 'e-Fatura', earsiv: 'e-Arşiv', esmm: 'e-SMM', utts: 'UTTS' }
    let toplam = 0
    const hatalar = []
    const notlar = []
    try {
      const clientArg = { ...r, id: r.id, vkn: r.vkn || '' }
      for (const tur of turlar) {
        const turYonleri = tur === 'utts' ? ['alis'] : ['alis', 'satis']
        for (const yon of turYonleri) {
          const turAd = turAdlari[tur] || tur
          const yonEtiket = yon === 'alis' ? ' (Alış)' : ' (Satış)'
          const onEk = `${r.ad} - ${turAd}${yonEtiket}: `
          const indirilenler = []
          let zipYoluIle = false
          try {
            setAsamaMesaj(onEk + "Luca'daki hazır faturalar indiriliyor...")
            const res = await efaturaSorgula({
              client: clientArg,
              yil, ay,
              sorguTip: tur,
              yon,
              mod: 'indir',
              sadeceIndir: true,
              onDurum: (d) => {
                const metin = lucaDurumMetni(d)
                if (metin) setAsamaMesaj(onEk + metin)
              }
            })
            if (res.zipYoluIle) zipYoluIle = true
            if (res.yerelYedek) hatalar.push(`${r.ad}/${turAd}${yonEtiket}: Sunucu Luca bağlantısı başarısız oldu; işlem yerel yardımcıda çalıştı.`)
            if (res.ok === false && res.not) hatalar.push(`${r.ad}/${turAd}${yonEtiket}: ${res.not}`)
            for (const d of (res.dosyalar || [])) {
              if (!indirilenler.some(x => x.ad === d.ad)) indirilenler.push(d)
            }
            if (indirilenler.length) {
              const tabanlar = new Set(indirilenler.map(d => String(d.ad).replace(/\.(pdf|xml|xlsx|xls|html?)$/i, '').toLowerCase()))
              setAsamaMesaj(onEk + `İndirilen ${indirilenler.length} dosya kontrol ediliyor...`)
              const yuk = await dosyalariMubisYukle({
                client: clientArg,
                yardimciKaynak: res.yardimciKaynak,
                yil, ay,
                sorguTip: tur,
                yon,
                oncekiSet: res.oncekiSet,
                zipYoluIle,
                ilgiliTabanlar: tabanlar,
                onDurum: () => {},
                onIlerleme: (p) => {
                  const metin = faturaIlerlemeMetni(p)
                  if (metin) setAsamaMesaj(onEk + metin)
                }
              })
              if (yuk.ok === false) throw new Error(yuk.not || 'Faturalar MUBİS’e yüklenemedi.')
              toplam += yuk.sayi || 0
              const hataliDosyalar = (yuk.dosyalar || []).filter(d => d.hata)
              if (hataliDosyalar.length) hatalar.push(`${r.ad}/${turAd}${yonEtiket}: ${hataliDosyalar.length} dosya yüklenemedi (${hataliDosyalar[0].hata})`)
              if (!(yuk.sayi > 0) && yuk.not) hatalar.push(`${r.ad}/${turAd}${yonEtiket}: ${yuk.not}`)
              setAsamaMesaj(onEk + 'klasörlere kopyalanıyor...')
              const kp = await edefterTopluKopyala({ client: clientArg, yardimciKaynak: res.yardimciKaynak, yil, ay, yon, dosyalar: faturaKopyalamaDosyalari(indirilenler, yuk.dosyalar) })
              if (kp?.atlandi) { if (!notlar.includes(kp.not)) notlar.push(kp.not) }
              else if (!kp?.ok) hatalar.push(`${r.ad}/${turAd}${yonEtiket} klasor kopyalama: ${kp?.error || 'basarisiz'}`)
            }
          } catch (e) {
            hatalar.push(`${r.ad}/${turAd}${yonEtiket}: ${e?.message || 'hata'}`)
          }
        }
      }
      setAsamaMesaj(`${r.ad} tamamlandı — ${toplam} belge MUBiS'e yüklendi.` + (notlar.length ? ' ' + notlar.join(' ') : '') + (hatalar.length ? ` Hatalar: ${hatalar.join(' | ').slice(0, 300)}` : ''))
      await yukle()
    } finally {
      setAsamaCalisan(null)
      setTimeout(() => { if (!asamaCalisan) setAsamaMesaj('') }, 8000)
    }
  }

  const sekmeDugmesi = (anahtar, etiket, Ikon) => (
    <button
      onClick={() => setSekme(anahtar)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium whitespace-nowrap transition ${sekme === anahtar ? 'bg-cyan-500 text-blue-950 shadow' : 'bg-blue-900/40 border border-blue-800/50 text-gray-300 hover:bg-blue-900/70'}`}
    >
      <Ikon className="w-3.5 h-3.5" /> {etiket}
    </button>
  )

  const raporDonen = excelDonen

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
      {/* Baslik + donem secimi — sabit ust menu */}
      <div className="sticky top-0 z-30 -mx-4 md:-mx-6 px-4 md:px-6 pt-2 pb-3 bg-[#070d1f]/95 backdrop-blur-md border-b border-blue-900/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <TableProperties className="w-6 h-6 text-cyan-400" /> Kontrol Merkezi
            </h1>
            <p className="text-gray-400 text-sm mt-0.5">Fatura, döküm ve KDV kontrol çalışma alanı — kayıtlı işlem özeti ve dosya varlığı</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={yil} onChange={e => setYil(Number(e.target.value))} className="bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
              {[simdi.getFullYear() + 1, simdi.getFullYear(), simdi.getFullYear() - 1, simdi.getFullYear() - 2].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={ay} onChange={e => setAy(Number(e.target.value))} className="bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
              {AYLAR.map((a, i) => <option key={a} value={i + 1}>{a}</option>)}
            </select>
            <input value={arama} onChange={e => setArama(e.target.value)} placeholder="Firma ara…" className="bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm w-44" />
            <button
              onClick={() => { if (sekme === 'firma') yukle(); else if (sekme === 'kdv2') kdv2Yukle(); else esmmYukle() }}
              disabled={yukleniyor || kdv2Yukleniyor || esmmYukleniyor}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition"
            >
              {(yukleniyor || kdv2Yukleniyor || esmmYukleniyor) ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Sonuçları Yenile
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-3">
          {sekmeDugmesi('firma', 'Firma Kontrolü', TableProperties)}
          {sekmeDugmesi('kdv2', 'KDV2 Listesi', ShieldCheck)}
          {sekmeDugmesi('esmm', 'e-SMM Alış Listesi', ReceiptText)}
        </div>
      </div>

      {/* Donem aciklamasi */}
      <div className="bg-cyan-500/10 border border-cyan-500/25 text-cyan-200 text-sm rounded-xl px-4 py-2.5 mb-3">
        İndirme ve kontrol: <b>01/{String(ay).padStart(2, '0')}/{yil} – {new Date(yil, ay, 0).getDate()}/{String(ay).padStart(2, '0')}/{yil}</b>. Kayıtlı işlem özeti ve dosya varlığı gösterilir.
      </div>

      {raporDonen && <div className="mb-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm rounded-lg px-4 py-2">{raporDonen}</div>}
      {asamaMesaj && <div className="mb-3 bg-cyan-500/10 border border-cyan-500/30 text-cyan-200 text-sm rounded-lg px-4 py-2">{asamaMesaj}</div>}
      {sekme === 'firma' && hata && <div className="mb-3 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-2">{hata}</div>}
      {sekme === 'kdv2' && kdv2Hata && <div className="mb-3 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-2">{kdv2Hata}</div>}
      {sekme === 'esmm' && esmmHata && <div className="mb-3 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-2">{esmmHata}</div>}

      {/* ================= FİRMA KONTROLÜ ================= */}
      {sekme === 'firma' && (
        <>
          <p className="text-gray-500 text-xs mb-4 leading-relaxed">
            Tutarlar dönemdeki kayıtlı belgelerin TL toplamıdır; e-Fatura, e-Arşiv ve ilgili e-SMM kayıtlarını kapsar. İadeler düşülmeden belge tutarları toplanır.
            "Kısmi" ve "Veri eksik" ifadeleri kesin toplam değildir. Ödenecek KDV = Satış KDV − Alış KDV (önceki dönem devreden KDV, tevkifat ve düzeltmeler dahil değildir; kesin beyanname hesabı değildir).
          </p>

          <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl overflow-hidden">
            <div className="overflow-auto max-h-[calc(100vh-300px)] min-h-[240px]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-300">
                    <th className="sticky top-0 z-10 bg-[#13224a] px-4 py-3 font-semibold whitespace-nowrap">Firma</th>
                    <th className="sticky top-0 z-10 bg-[#13224a] px-4 py-3 font-semibold text-right whitespace-nowrap">Satış matrahı</th>
                    <th className="sticky top-0 z-10 bg-[#13224a] px-4 py-3 font-semibold text-right whitespace-nowrap">Satış KDV</th>
                    <th className="sticky top-0 z-10 bg-[#13224a] px-4 py-3 font-semibold text-right whitespace-nowrap">Alış matrahı</th>
                    <th className="sticky top-0 z-10 bg-[#13224a] px-4 py-3 font-semibold text-right whitespace-nowrap">Alış KDV</th>
                    <th className="sticky top-0 z-10 bg-[#13224a] px-4 py-3 font-semibold text-right whitespace-nowrap">Ödenecek KDV</th>
                    <th className="sticky top-0 z-10 bg-[#13224a] px-4 py-3 font-semibold text-right whitespace-nowrap">Devreden KDV</th>
                    <th className="sticky top-0 z-10 bg-[#13224a] px-4 py-3 font-semibold text-center whitespace-nowrap">PDF</th>
                    <th className="sticky top-0 z-10 bg-[#13224a] px-4 py-3 font-semibold whitespace-nowrap">KDV kontrolü</th>
                    <th className="sticky top-0 z-10 bg-[#13224a] px-4 py-3 font-semibold whitespace-nowrap">E-Arşiv alış karşılaştırması</th>
                    <th className="sticky top-0 z-10 bg-[#13224a] px-4 py-3 font-semibold text-center whitespace-nowrap">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-800/30">
                  {yukleniyor && rows === null ? (
                    <tr><td colSpan={11} className="px-4 py-10 text-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin inline" /></td></tr>
                  ) : gosterilen.length === 0 ? (
                    <tr><td colSpan={11} className="px-4 py-10 text-center text-gray-400">{rows ? 'Seçili dönemde kayıt bulunamadı.' : ''}</td></tr>
                  ) : gosterilen.map(r => {
                    const odenecek = r.satisKdv - r.alisKdv
                    const devreden = -odenecek
                    return (
                      <tr key={r.id} className="hover:bg-blue-900/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="text-white font-medium leading-tight max-w-[220px] truncate" title={r.ad}>{r.ad}</div>
                          <div className="text-gray-500 text-xs mb-1.5">{r.belgeSayisi} belge · {r.atanan} muhasebeleştirildi</div>
                          <div className="flex flex-wrap gap-1.5">
                            <button onClick={() => excelIndir(r, 'alis')} title="Alış listesini Excel olarak indir" className="px-2.5 py-1 rounded-md bg-blue-800/70 hover:bg-blue-700 text-blue-200 text-xs font-medium transition">Alış Excel</button>
                            <button onClick={() => excelIndir(r, 'satis')} title="Satış listesini Excel olarak indir" className="px-2.5 py-1 rounded-md bg-cyan-800/70 hover:bg-cyan-700 text-cyan-200 text-xs font-medium transition">Satış Excel</button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right"><TutarHucresi toplam={r.satisMatrah} sayi={r.satisSayi} okunmayan={r.satisOkunmayan} /></td>
                        <td className="px-4 py-3 text-right"><TutarHucresi toplam={r.satisKdv} sayi={r.satisSayi} okunmayan={r.satisOkunmayan} /></td>
                        <td className="px-4 py-3 text-right"><TutarHucresi toplam={r.alisMatrah} sayi={r.alisSayi} okunmayan={r.alisOkunmayan} /></td>
                        <td className="px-4 py-3 text-right"><TutarHucresi toplam={r.alisKdv} sayi={r.alisSayi} okunmayan={r.alisOkunmayan} /></td>
                        <td className="px-4 py-3 text-right">
                          {r.satisOkunmayan + r.alisOkunmayan > 0
                            ? <span className="text-amber-400 text-xs">Veri eksik</span>
                            : odenecek > 0 ? <span className="text-emerald-400 tabular-nums">{tl(odenecek)}</span> : <span className="text-gray-600 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {r.satisOkunmayan + r.alisOkunmayan > 0
                            ? <span className="text-amber-400 text-xs">Veri eksik</span>
                            : devreden > 0 ? <span className="text-sky-400 tabular-nums">{tl(devreden)}</span> : <span className="text-gray-600 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-300 tabular-nums">{r.pdfSayi}/{r.belgeSayisi}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium ${r.kdvKontrol.durum === 'tamam' ? 'text-emerald-400' : r.kdvKontrol.durum === 'fark' ? 'text-red-400' : r.kdvKontrol.durum === 'eksik' ? 'text-amber-400' : 'text-gray-500'}`}>{r.kdvKontrol.metin}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs ${r.earsivDurum.durum === 'tamam' ? 'text-emerald-400' : r.earsivDurum.durum === 'eksik' ? 'text-amber-400' : 'text-gray-500'}`}>{r.earsivDurum.metin}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex flex-col items-center gap-1.5">
                            <button
                              onClick={() => asamaTamamla(r)}
                              disabled={!!asamaCalisan}
                              title="Luca'daki hazır faturaları indir, MUBiS'e yükle ve klasörlere kopyala"
                              className="w-28 px-2 py-2 rounded-lg bg-emerald-700/80 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold leading-tight transition flex items-center justify-center gap-1.5"
                            >
                              {asamaCalisan === r.id
                                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Çalışıyor…</>
                                : <><PlayCircle className="w-3.5 h-3.5" /> Aşamayı Tamamla</>}
                            </button>
                            <button
                              onClick={() => navigate('/admin/muhasebe-kayit')}
                              className="px-3 py-1 rounded-lg bg-blue-700/80 hover:bg-blue-600 text-white text-xs font-semibold leading-tight transition"
                            >
                              {r.belgeSayisi > 0 && r.atanan < r.belgeSayisi ? 'Muhasebeleştir' : 'İncele'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {ozet && gosterilen.length > 0 && (
                  <tfoot>
                    <tr className="text-gray-300 font-semibold">
                      <td className="sticky bottom-0 z-10 bg-[#13224a] px-4 py-3">GENEL TOPLAM</td>
                      <td className="sticky bottom-0 z-10 bg-[#13224a] px-4 py-3 text-right tabular-nums">{tl(ozet.satisMatrah)}</td>
                      <td className="sticky bottom-0 z-10 bg-[#13224a] px-4 py-3 text-right tabular-nums">{tl(ozet.satisKdv)}</td>
                      <td className="sticky bottom-0 z-10 bg-[#13224a] px-4 py-3 text-right tabular-nums">{tl(ozet.alisMatrah)}</td>
                      <td className="sticky bottom-0 z-10 bg-[#13224a] px-4 py-3 text-right tabular-nums">{tl(ozet.alisKdv)}</td>
                      <td className="sticky bottom-0 z-10 bg-[#13224a] px-4 py-3 text-right tabular-nums">{tl(ozet.satisKdv - ozet.alisKdv)}</td>
                      <td className="sticky bottom-0 z-10 bg-[#13224a] px-4 py-3" />
                      <td className="sticky bottom-0 z-10 bg-[#13224a] px-4 py-3 text-center tabular-nums">{ozet.belge}</td>
                      <td className="sticky bottom-0 z-10 bg-[#13224a] px-4 py-3" colSpan={3} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      {/* ================= KDV2 LİSTESİ ================= */}
      {sekme === 'kdv2' && (
        <>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
            <p className="text-gray-400 text-xs leading-relaxed max-w-3xl">
              Tevkifatlı <b className="text-gray-200">alış</b> faturaları listelenir; iade faturaları hariç tutulur. Tevkifat KDV = hesaplanan KDV − faturada yazan KDV.
              KDV dökümü olmayan faturalarda bu tutar hesaplanamaz ve satır "eksik" işaretlenir.
            </p>
            <button onClick={kdv2ExcelIndir} disabled={!kdv2 || kdv2Yukleniyor} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-700/80 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-semibold whitespace-nowrap self-start">
              <Download className="w-4 h-4" /> Excel İndir
            </button>
          </div>

          {kdv2 && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
              <OzetKutu etiket="Tevkifatlı firma" deger={kdv2.toplam.firmaSayisi} />
              <OzetKutu etiket="Fatura" deger={kdv2.toplam.belgeSayisi} />
              <OzetKutu etiket="Matrah" deger={tl(kdv2.toplam.matrah)} />
              <OzetKutu etiket="Fatura KDV" deger={tl(kdv2.toplam.kdv)} />
              <OzetKutu etiket="Tevkifat KDV" deger={tl(kdv2.toplam.tevkifatKdv)} vurgu="text-amber-300" />
            </div>
          )}

          {kdv2Yukleniyor && !kdv2 ? (
            <div className="py-10 text-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin inline" /></div>
          ) : (
            <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl overflow-hidden">
              <div className="overflow-auto max-h-[calc(100vh-400px)] min-h-[240px]">
                <table className="w-full text-sm min-w-[980px]">
                  <thead>
                    <tr className="text-left text-gray-300">
                      <th className="sticky top-0 z-10 bg-[#13224a] px-4 py-3 font-semibold whitespace-nowrap">Firma</th>
                      <th className="sticky top-0 z-10 bg-[#13224a] px-4 py-3 font-semibold text-center whitespace-nowrap">Fatura</th>
                      <th className="sticky top-0 z-10 bg-[#13224a] px-4 py-3 font-semibold text-right whitespace-nowrap">Matrah</th>
                      <th className="sticky top-0 z-10 bg-[#13224a] px-4 py-3 font-semibold text-right whitespace-nowrap">Fatura KDV</th>
                      <th className="sticky top-0 z-10 bg-[#13224a] px-4 py-3 font-semibold text-right whitespace-nowrap">Tevkifat KDV</th>
                      <th className="sticky top-0 z-10 bg-[#13224a] px-4 py-3 font-semibold whitespace-nowrap">Faturalar</th>
                      <th className="sticky top-0 z-10 bg-[#13224a] px-4 py-3 font-semibold whitespace-nowrap">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-800/30">
                    {kdv2Filtreli.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">{kdv2 ? 'Seçili dönemde tevkifatlı alış faturası bulunamadı.' : ''}</td></tr>
                    ) : kdv2Filtreli.map(g => (
                      <tr key={g.id} className="hover:bg-blue-900/20 transition-colors align-top">
                        <td className="px-4 py-3">
                          <div className="text-white font-medium leading-tight max-w-[240px] truncate" title={g.ad}>{g.ad}</div>
                          <div className="text-gray-500 text-xs">{g.vkn || 'VKN yok'}</div>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-300 tabular-nums">{g.sayi}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-200">{tl(g.matrah)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-200">{tl(g.kdv)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-amber-300">{tl(g.tevkifatKdv)}</td>
                        <td className="px-4 py-3">
                          <div className="space-y-1 max-w-[520px]">
                            {g.invoices.map(i => (
                              <div key={i.id} className="text-xs leading-snug">
                                <span className="text-gray-500">{tarihTR(i.tarih)}</span>
                                <span className="text-white"> · {i.faturaNo || 'No yok'}</span>
                                <span className="text-gray-400"> · {i.karsiUnvan || i.karsiVkn || '-'}</span>
                                {i.oranlar.length > 0 && <span className="text-cyan-400"> · {i.oranlar.map(o => `%${o}`).join(', ')}</span>}
                                {i.tevkifatKdv > 0 && <span className="text-amber-300"> · Tevkifat {tl(i.tevkifatKdv)}</span>}
                                {i.eksik && <span className="text-red-300"> · KDV dökümü yok</span>}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {g.eksik
                            ? <span className="text-amber-400 text-xs">Eksik bilgi var</span>
                            : <span className="text-emerald-400 text-xs">Faturalar tarandı</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {kdv2 && kdv2Filtreli.length > 0 && (
                    <tfoot>
                      <tr className="text-gray-300 font-semibold">
                        <td className="sticky bottom-0 z-10 bg-[#13224a] px-4 py-3">GENEL TOPLAM</td>
                        <td className="sticky bottom-0 z-10 bg-[#13224a] px-4 py-3 text-center tabular-nums">{kdv2Filtreli.reduce((t, g) => t + g.sayi, 0)}</td>
                        <td className="sticky bottom-0 z-10 bg-[#13224a] px-4 py-3 text-right tabular-nums">{tl(kdv2Filtreli.reduce((t, g) => t + g.matrah, 0))}</td>
                        <td className="sticky bottom-0 z-10 bg-[#13224a] px-4 py-3 text-right tabular-nums">{tl(kdv2Filtreli.reduce((t, g) => t + g.kdv, 0))}</td>
                        <td className="sticky bottom-0 z-10 bg-[#13224a] px-4 py-3 text-right tabular-nums text-amber-300">{tl(kdv2Filtreli.reduce((t, g) => t + g.tevkifatKdv, 0))}</td>
                        <td className="sticky bottom-0 z-10 bg-[#13224a] px-4 py-3" colSpan={2} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {kdv2?.toplam?.eksikFirma > 0 && (
            <p className="text-amber-400/90 text-xs mt-2">
              {kdv2.toplam.eksikFirma} firmada KDV dökümü olmadığı için tevkifat KDV hesaplanamadı. Faturaların XML'ini yeniden indirip KDV dökümünü tamamlayın.
            </p>
          )}
        </>
      )}

      {/* ================= e-SMM ALIŞ LİSTESİ ================= */}
      {sekme === 'esmm' && (
        <>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
            <p className="text-gray-400 text-xs leading-relaxed max-w-3xl">
              Alınan e-Serbest Meslek Makbuzları firma bazında listelenir. Stopaj ve KDV tevkifatı makbuz okunurken kaydedilen ek bilgilerden gelir;
              bilgi yoksa satır "eksik" işaretlenir.
            </p>
            <button onClick={esmmExcelIndir} disabled={!esmm || esmmYukleniyor} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-700/80 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-semibold whitespace-nowrap self-start">
              <Download className="w-4 h-4" /> Excel İndir
            </button>
          </div>

          {esmm && (
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-3">
              <OzetKutu etiket="Firma" deger={esmm.toplam.firmaSayisi} />
              <OzetKutu etiket="Belge" deger={esmm.toplam.belgeSayisi} />
              <OzetKutu etiket="Matrah" deger={tl(esmm.toplam.matrah)} />
              <OzetKutu etiket="KDV" deger={tl(esmm.toplam.kdv)} />
              <OzetKutu etiket="Stopaj" deger={tl(esmm.toplam.stopaj)} vurgu="text-sky-300" />
              <OzetKutu etiket="Tevkifat" deger={tl(esmm.toplam.tevkifat)} vurgu="text-amber-300" />
            </div>
          )}

          {esmmYukleniyor && !esmm ? (
            <div className="py-10 text-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin inline" /></div>
          ) : (
            <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl overflow-hidden">
              <div className="overflow-auto max-h-[calc(100vh-400px)] min-h-[240px]">
                <table className="w-full text-sm min-w-[1020px]">
                  <thead>
                    <tr className="text-left text-gray-300">
                      <th className="sticky top-0 z-10 bg-[#13224a] px-4 py-3 font-semibold whitespace-nowrap">Firma</th>
                      <th className="sticky top-0 z-10 bg-[#13224a] px-4 py-3 font-semibold text-center whitespace-nowrap">Belge</th>
                      <th className="sticky top-0 z-10 bg-[#13224a] px-4 py-3 font-semibold text-right whitespace-nowrap">Matrah</th>
                      <th className="sticky top-0 z-10 bg-[#13224a] px-4 py-3 font-semibold text-right whitespace-nowrap">KDV</th>
                      <th className="sticky top-0 z-10 bg-[#13224a] px-4 py-3 font-semibold text-right whitespace-nowrap">Stopaj</th>
                      <th className="sticky top-0 z-10 bg-[#13224a] px-4 py-3 font-semibold text-right whitespace-nowrap">Tevkifat</th>
                      <th className="sticky top-0 z-10 bg-[#13224a] px-4 py-3 font-semibold whitespace-nowrap">Belgeler</th>
                      <th className="sticky top-0 z-10 bg-[#13224a] px-4 py-3 font-semibold whitespace-nowrap">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-800/30">
                    {esmmFiltreli.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">{esmm ? 'Seçili dönemde e-SMM alış belgesi bulunamadı.' : ''}</td></tr>
                    ) : esmmFiltreli.map(g => (
                      <tr key={g.id} className="hover:bg-blue-900/20 transition-colors align-top">
                        <td className="px-4 py-3">
                          <div className="text-white font-medium leading-tight max-w-[240px] truncate" title={g.ad}>{g.ad}</div>
                          <div className="text-gray-500 text-xs">{g.vkn || 'VKN yok'}</div>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-300 tabular-nums">{g.sayi}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-200">{tl(g.matrah)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-200">{tl(g.kdv)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-sky-300">{tl(g.stopaj)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-amber-300">{tl(g.tevkifat)}</td>
                        <td className="px-4 py-3">
                          <div className="space-y-1 max-w-[500px]">
                            {g.invoices.map(i => (
                              <div key={i.id} className="text-xs leading-snug">
                                <span className="text-gray-500">{tarihTR(i.tarih)}</span>
                                <span className="text-white"> · {i.faturaNo || 'No yok'}</span>
                                <span className="text-gray-400"> · {i.duzenleyen || i.karsiVkn || '-'}</span>
                                {i.eksik && <span className="text-red-300"> · stopaj/tevkifat kaydı yok</span>}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {g.eksik
                            ? <span className="text-amber-400 text-xs">Eksik bilgi var</span>
                            : <span className="text-emerald-400 text-xs">Belgeler tarandı</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {esmm && esmmFiltreli.length > 0 && (
                    <tfoot>
                      <tr className="text-gray-300 font-semibold">
                        <td className="sticky bottom-0 z-10 bg-[#13224a] px-4 py-3">GENEL TOPLAM</td>
                        <td className="sticky bottom-0 z-10 bg-[#13224a] px-4 py-3 text-center tabular-nums">{esmmFiltreli.reduce((t, g) => t + g.sayi, 0)}</td>
                        <td className="sticky bottom-0 z-10 bg-[#13224a] px-4 py-3 text-right tabular-nums">{tl(esmmFiltreli.reduce((t, g) => t + g.matrah, 0))}</td>
                        <td className="sticky bottom-0 z-10 bg-[#13224a] px-4 py-3 text-right tabular-nums">{tl(esmmFiltreli.reduce((t, g) => t + g.kdv, 0))}</td>
                        <td className="sticky bottom-0 z-10 bg-[#13224a] px-4 py-3 text-right tabular-nums text-sky-300">{tl(esmmFiltreli.reduce((t, g) => t + g.stopaj, 0))}</td>
                        <td className="sticky bottom-0 z-10 bg-[#13224a] px-4 py-3 text-right tabular-nums text-amber-300">{tl(esmmFiltreli.reduce((t, g) => t + g.tevkifat, 0))}</td>
                        <td className="sticky bottom-0 z-10 bg-[#13224a] px-4 py-3" colSpan={2} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {esmm?.toplam?.eksikFirma > 0 && (
            <p className="text-amber-400/90 text-xs mt-2">
              {esmm.toplam.eksikFirma} firmada stopaj/tevkifat ek kaydı bulunamadı; tutarlar 0 gösteriliyor. Makbuz PDF'ini yeniden indirerek bilgileri tamamlayabilirsiniz.
            </p>
          )}
        </>
      )}
    </div>
  )
}
