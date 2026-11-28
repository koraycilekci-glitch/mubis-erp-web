import { useState, useEffect, useCallback } from 'react'
import { Camera, Upload, Trash2, Save, X, Eye, CheckCircle, AlertTriangle, FileText, Download, FileSpreadsheet } from 'lucide-react'
import BelgeSeriKamera from './BelgeSeriKamera'
import { belgeExcelIndir, belgeSatirlari } from '../utils/belgeTarama'
import { supabase } from '../lib/supabase'
import { processZReportImage, processZReportImagesBatch, convertToAccountingEntry, pdfIlkSayfaResmi, zRaporExcelOku } from '../services/zReportOCRService'
import { saveZReport, updateZReportParsedData, createAccountingEntries } from '../services/zReportService'
import { convertToLucaFormat, downloadLucaCSV, downloadLucaExcel, convertToDefterFormat, downloadDefterExcel } from '../services/zReportExportService'

function incelemeVerisi(parsed) {
  return parsed?.kdvOraniVarsayildi ? { ...parsed, satis20: 0, matrah20: 0, kdv20: 0, toplamKdv: null } : parsed
}

export default function ZReportManager({ clientId, clientName, clientType }) {
  // clientId null/undefined ise bile component render edilsin
  const effectiveClientId = clientId || 'unknown'
  
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [previewUrls, setPreviewUrls] = useState([])
  const [seriKamera, setSeriKamera] = useState(false)
  const seriKamerayiKapat = useCallback(() => setSeriKamera(false), [])
  const [currentFileIndex, setCurrentFileIndex] = useState(0)
  const [msg, setMsg] = useState('')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [processingOCR, setProcessingOCR] = useState(false)
  const [ocrResult, setOcrResult] = useState(null)
  const [showOcrModal, setShowOcrModal] = useState(false)
  const [selectedReport, setSelectedReport] = useState(null)
  const [batchResults, setBatchResults] = useState([])
  const [isBatchMode, setIsBatchMode] = useState(false)
  const [excelYukleniyor, setExcelYukleniyor] = useState(false)

  const months = [
    'Ocak','Subat','Mart','Nisan','Mayis','Haziran',
    'Temmuz','Agustos','Eylul','Ekim','Kasim','Aralik'
  ]

  useEffect(() => {
    if (clientId) {
      loadReports()
    }
  }, [clientId, selectedYear, selectedMonth])

  const loadReports = async () => {
    if (!clientId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('z_reports')
        .select(`
          *,
          z_report_lines(*),
          accounting_entries(*)
        `)
        .eq('client_id', clientId)
        .eq('year', selectedYear)
        .eq('month', selectedMonth)
        .order('report_date', { ascending: false })
      if (error) throw error
      setReports(data || [])
    } catch (e) {
      console.error('Z raporlari yuklenemedi:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = (event) => {
    const files = Array.from(event.currentTarget.files)
    event.currentTarget.value = ''
    return dosyalariEkle(files)
  }

  const dosyalariEkle = async (files) => {
    if (!clientId) {
      setMsg('Musteri ID bulunamadi. Lutfen tekrar giris yapin.')
      setTimeout(() => setMsg(''), 3000)
      return
    }
    if (!files.length) return

    // Resim + PDF kabul edilir; PDF'ler OCR icin ilk sayfadan resme cevrilir
    const uygun = files.filter(f => f.type.startsWith('image/') || /\.pdf$/i.test(f.name) || f.type === 'application/pdf')
    if (uygun.length === 0) {
      setMsg('Lutfen resim (JPG, PNG) veya PDF dosyalari secin')
      setTimeout(() => setMsg(''), 3000)
      return
    }

    if (uygun.length > 10) {
      setMsg('En fazla 10 dosya yukleyebilirsiniz')
      setTimeout(() => setMsg(''), 3000)
      return
    }

    // Mevcut dosyalara ekle (batch modu icin)
    const allFiles = [...selectedFiles, ...uygun]
    if (allFiles.length > 10) {
      setMsg('Toplam en fazla 10 dosya yukleyebilirsiniz')
      setTimeout(() => setMsg(''), 3000)
      return
    }

    setMsg('PDF hazirlaniyor...')
    const yeniUrler = []
    for (const f of uygun) {
      if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
        try {
          yeniUrler.push(await pdfIlkSayfaResmi(f))
        } catch (err) {
          console.error('PDF resme cevrilemedi:', err)
          setMsg('PDF okunamadi: ' + (err.message || err))
          setTimeout(() => setMsg(''), 4000)
          return
        }
      } else {
        yeniUrler.push(URL.createObjectURL(f))
      }
    }

    setSelectedFiles(allFiles)
    setPreviewUrls(prev => [...prev, ...yeniUrler])
    setCurrentFileIndex(0)
    setOcrResult(null)
    setBatchResults([])
    setIsBatchMode(allFiles.length > 1)
    setMsg('')
  }

  // Excel ile yukleme: her satir bir Z raporu / mali hafiza ozeti
  const excelYukle = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!clientId) {
      setMsg('Musteri ID bulunamadi. Lutfen tekrar giris yapin.')
      setTimeout(() => setMsg(''), 3000)
      return
    }
    setExcelYukleniyor(true)
    setMsg('Excel okunuyor...')
    try {
      const satirlar = await zRaporExcelOku(file)
      if (!satirlar.length) throw new Error('Excel icinde gecerli Z raporu satiri bulunamadi.')
      for (let i = 0; i < satirlar.length; i++) {
        const r = satirlar[i]
        setMsg(`Excel satiri kaydediliyor (${i + 1}/${satirlar.length})...`)
        const report = await saveZReport(
          clientId, selectedYear, selectedMonth,
          r.tarih || new Date().toISOString().split('T')[0],
          '', `${file.name} (satir ${r._satir})`
        )
        await updateZReportParsedData(report.id, {
          rawText: `Excel yukleme: ${file.name}`,
          ...r,
          zNo: r.evrakNo,
          totalAmount: r.toplamSatis,
          totalKdv: (r.kdv1 + r.kdv10 + r.kdv20),
          kdvMatrah: (r.matrah1 + r.matrah10 + r.matrah20),
          cashAmount: r.nakit,
          creditCardAmount: r.krediKarti,
          otherAmount: r.havale
        })
        const entries = convertToAccountingEntry(clientType, r)
        await createAccountingEntries(clientId, report.id, entries)
      }
      setMsg(`${satirlar.length} Z raporu Excel'den kaydedildi!`)
      loadReports()
    } catch (err) {
      setMsg('Excel yukleme hatasi: ' + (err.message || err))
    } finally {
      setExcelYukleniyor(false)
      setTimeout(() => setMsg(''), 4000)
    }
  }

  const handleOCR = async () => {
    if (!clientId) {
      setMsg('Musteri ID bulunamadi. Lutfen tekrar giris yapin.')
      setTimeout(() => setMsg(''), 3000)
      return
    }
    if (!selectedFiles.length) return
    
    setProcessingOCR(true)
    setBatchResults([])
    
    try {
      if (isBatchMode) {
        // Coklu mod - tek worker ile tum resimleri sirayla oku
        setMsg('Toplu OCR islemi basladi...')
        const results = await processZReportImagesBatch(previewUrls)
        // Her resim birden cok Z raporu icerebilir -> parsedList'i ac,
        // her Z raporu ayri bir batch kaydi olur
        const enriched = []
        results.forEach((result, i) => {
          const liste = (result.parsedList && result.parsedList.length > 0) ? result.parsedList : [result.parsed]
          liste.forEach((p, j) => {
            enriched.push({
              file: selectedFiles[i],
              previewUrl: previewUrls[i],
              rawText: result.rawText,
              parsed: incelemeVerisi(p),
              parsedList: [p],
              confidence: p.confidence || 0,
              subIndex: liste.length > 1 ? j + 1 : 0
            })
          })
        })
        setBatchResults(enriched)
        setMsg(`${results.length} resim okundu — ${enriched.length} Z raporu bulundu`)
        setShowOcrModal(true)
      } else {
        // Tekli mod
        const result = await processZReportImage(previewUrls[0])
        if (result.parsedList && result.parsedList.length > 1) {
          // Tek fotografa ust uste birden cok Z raporu cekilmis ->
          // coklu moda gec, her rapor ayri kayit olarak duzeltilebilir
          const expanded = result.parsedList.map((p, j) => ({
            file: selectedFiles[0],
            previewUrl: previewUrls[0],
            rawText: result.rawText,
            parsed: incelemeVerisi(p),
            parsedList: [p],
            confidence: p.confidence || 0,
            subIndex: j + 1
          }))
          setIsBatchMode(true)
          setOcrResult(null)
          setBatchResults(expanded)
          setMsg(`Fotografta ${expanded.length} Z raporu bulundu`)
        } else {
          setOcrResult({ ...result, parsed: incelemeVerisi(result.parsed) })
          setMsg('OCR tamamlandi')
        }
        setShowOcrModal(true)
      }
    } catch (e) {
      setMsg('OCR hatasi: ' + e.message)
    } finally {
      setProcessingOCR(false)
      setTimeout(() => setMsg(''), 3000)
    }
  }

  const handleSave = async () => {
    if (!clientId) {
      setMsg('Musteri ID bulunamadi. Lutfen tekrar giris yapin.')
      return
    }
    if (!selectedFiles.length) {
      setMsg('Lutfen once resim yukleyin')
      return
    }
    
    setUploading(true)
    try {
      if (isBatchMode && batchResults.length > 0) {
        // Coklu kaydet
        for (let i = 0; i < batchResults.length; i++) {
          const result = batchResults[i]
          setMsg(`${i + 1}/${batchResults.length} kaydediliyor...`)
          
          await saveSingleReport(result.file, result.previewUrl, result.parsed)
        }
        setMsg(`${batchResults.length} Z Raporu basariyla kaydedildi!`)
      } else if (ocrResult) {
        // Tekli kaydet
        await saveSingleReport(selectedFiles[0], previewUrls[0], ocrResult.parsed)
        setMsg('Z Raporu kaydedildi!')
      }
      
      // Formu temizle
      setSelectedFiles([])
      setPreviewUrls([])
      setOcrResult(null)
      setBatchResults([])
      setIsBatchMode(false)
      setShowOcrModal(false)
      loadReports()
    } catch (e) {
      setMsg('Kaydetme hatasi: ' + e.message)
    } finally {
      setUploading(false)
      setTimeout(() => setMsg(''), 3000)
    }
  }

  const saveSingleReport = async (file, previewUrl, parsedData) => {
    if (!clientId) {
      throw new Error('Musteri ID bulunamadi. Lutfen tekrar giris yapin.')
    }
    const ext = file.name.split('.').pop()
    const fileName = `${clientId}/${selectedYear}/${selectedMonth}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`
    
    const { error: upError } = await supabase.storage
      .from('client-z-reports')
      .upload(fileName, file, { cacheControl: '3600', upsert: false })
    if (upError) throw upError

    const { data: urlData } = supabase.storage
      .from('client-z-reports')
      .getPublicUrl(fileName)

    const report = await saveZReport(
      clientId,
      selectedYear,
      selectedMonth,
      parsedData.tarih || new Date().toISOString().split('T')[0],
      urlData.publicUrl,
      file.name
    )

    await updateZReportParsedData(report.id, {
      rawText: parsedData.rawText || '',
      ...parsedData,
      zNo: parsedData.evrakNo,
      totalAmount: parsedData.toplamSatis,
      totalKdv: parsedData.toplamKdv ?? ((parsedData.kdv1 || 0) + (parsedData.kdv10 || 0) + (parsedData.kdv20 || 0)),
      kdvMatrah: (parsedData.matrah1 || 0) + (parsedData.matrah10 || 0) + (parsedData.matrah20 || 0),
      cashAmount: parsedData.nakit,
      creditCardAmount: parsedData.krediKarti,
      otherAmount: parsedData.havale
    })

    if (!belgeSatirlari({ parsed_data: parsedData }, true).some(row => row[3] === 'Kontrol gerekli')) {
      const entries = convertToAccountingEntry(clientType, parsedData)
      await createAccountingEntries(clientId, report.id, entries)
    }
    
    return report
  }

  const updateBatchResult = (index, field, value) => {
    setBatchResults(prev => prev.map((r, i) =>
      i === index ? { ...r, parsed: { ...r.parsed, [field]: value, kdvOraniVarsayildi: ['satis20', 'matrah20', 'kdv20'].includes(field) ? false : r.parsed.kdvOraniVarsayildi } } : r
    ))
  }

  const handleDelete = async (report) => {
    if (!confirm('Bu Z raporunu silmek istiyor musunuz?')) return
    try {
      const path = report.image_url.split('/client-z-reports/')[1]
      if (path) {
        await supabase.storage.from('client-z-reports').remove([path])
      }
      await supabase.from('z_reports').delete().eq('id', report.id)
      setMsg('Silindi')
      loadReports()
    } catch (e) {
      setMsg('Silme hatasi: ' + e.message)
    }
    setTimeout(() => setMsg(''), 3000)
  }

  const handleLucaExport = () => {
    if (!reports || reports.length === 0) {
      setMsg('Aktarilacak rapor bulunmuyor')
      setTimeout(() => setMsg(''), 3000)
      return
    }
    const clientInfo = {
      client_type: clientType,
      name: clientName,
      company: clientName,
      vkn: '',
      tc: '',
      tax_office: '',
      address: ''
    }
    downloadLucaExcel(convertToLucaFormat(reports, clientInfo))
  }

  return (
    <div className="space-y-6">
      {/* clientId yoksa uyari */}
      {!clientId && (
        <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-3 text-sm text-yellow-400">
          Musteri bilgileri yukleniyor... Lutfen bekleyin.
        </div>
      )}

      {/* Mesaj */}
      {msg && (
        <div className={`rounded-lg p-3 text-sm ${msg.includes('hatasi') ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-green-500/20 text-green-400 border border-green-500/30'}`}>
          {msg}
        </div>
      )}

      {/* Yil / Ay Secimi */}
      <div className="bg-blue-800/20 rounded-2xl p-4 border border-blue-700/30">
        <div className="flex flex-wrap gap-3 items-center">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Yil</label>
            <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm">
              {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Ay</label>
            <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm">
              {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <div className="ml-auto text-gray-400 text-sm">
            {reports.length} rapor
          </div>
        </div>
      </div>

      {/* Yukleme Formu */}
      <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
          <Camera className="w-5 h-5 text-yellow-400" /> Z Raporu Yukle ve OCR ile Oku
          {isBatchMode && <span className="text-sm font-normal text-yellow-400 ml-2">(Coklu Mod: {selectedFiles.length} resim)</span>}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Sol - Dosya Secimi */}
          <div className="space-y-3">
            {/* Kamera ile Cek */}
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-yellow-700/50 rounded-xl cursor-pointer hover:border-yellow-500/50 hover:bg-yellow-900/10 transition-colors mb-3">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Camera className="w-8 h-8 text-yellow-400 mb-2" />
                <p className="text-sm text-gray-400">Kamera ile Cek</p>
                <p className="text-xs text-gray-500">Telefon kamerasi acilir</p>
              </div>
              <input type="file" disabled={uploading || processingOCR} className="hidden" accept="image/*" capture="environment" onChange={handleFileSelect} />
            </label>
            <button type="button" disabled={!clientId || uploading || processingOCR || selectedFiles.length >= 10} onClick={() => setSeriKamera(true)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-blue-500/60 bg-blue-800/40 px-3 py-2 text-sm text-white disabled:opacity-50">
              <Camera className="h-4 w-4" /> Seri Çekim
            </button>
            
            {/* Galeriden Sec (Resim / PDF) */}
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-blue-700/50 rounded-xl cursor-pointer hover:border-blue-500/50 hover:bg-blue-900/20 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-8 h-8 text-gray-400 mb-2" />
                <p className="text-sm text-gray-400">Resim / PDF Sec</p>
                <p className="text-xs text-gray-500">JPG, PNG, PDF (En fazla 10 dosya)</p>
              </div>
              <input type="file" disabled={uploading || processingOCR} className="hidden" accept="image/*,.pdf,application/pdf" multiple onChange={handleFileSelect} />
            </label>

            {/* Excel ile Yukle */}
            <label className={`flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-green-700/50 rounded-xl cursor-pointer hover:border-green-500/50 hover:bg-green-900/10 transition-colors ${excelYukleniyor ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-6 h-6 text-green-400" />
                <div className="text-left">
                  <p className="text-sm text-gray-400">{excelYukleniyor ? 'Excel yukleniyor...' : 'Excel ile Yukle'}</p>
                  <p className="text-xs text-gray-500">Her satir bir Z raporu (Tarih, Evrak No, Nakit, Kredi Karti...)</p>
                </div>
              </div>
              <input type="file" className="hidden" accept=".xlsx,.xls" onChange={excelYukle} />
            </label>

            {/* Onizleme Grid */}
            {previewUrls.length > 0 && (
              <div className="mt-4">
                <p className="text-sm text-gray-400 mb-2">{selectedFiles.length} resim secildi:</p>
                <div className={`grid gap-2 ${previewUrls.length > 1 ? 'grid-cols-3' : 'grid-cols-1'}`}>
                  {previewUrls.map((url, index) => (
                    <div key={index} className="relative">
                      <img src={url} alt={`Onizleme ${index + 1}`} className="w-full h-24 object-cover rounded-lg bg-black/20" />
                      {processingOCR && index === currentFileIndex && (
                        <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                          <div className="text-white text-xs">{index + 1}/{selectedFiles.length}</div>
                        </div>
                      )}
                      <button onClick={() => {
                        const newFiles = selectedFiles.filter((_, i) => i !== index)
                        const newUrls = previewUrls.filter((_, i) => i !== index)
                        setSelectedFiles(newFiles)
                        setPreviewUrls(newUrls)
                        if (newFiles.length <= 1) setIsBatchMode(false)
                      }} className="absolute top-1 right-1 bg-red-500/80 text-white p-1 rounded">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sag - Butonlar */}
          <div className="space-y-3 flex flex-col justify-center">
            <button
              onClick={handleOCR}
              disabled={!selectedFiles.length || processingOCR}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Eye className="w-4 h-4" /> {processingOCR ? `OCR Isleniyor... (${currentFileIndex + 1}/${selectedFiles.length})` : isBatchMode ? 'Tum Resimleri OCR ile Oku' : 'OCR ile Oku'}
            </button>

            {ocrResult && !isBatchMode && (
              <div className="bg-blue-900/30 rounded-lg p-3 border border-blue-700/30">
                <div className="flex items-center gap-2 text-green-400 text-sm mb-2">
                  <CheckCircle className="w-4 h-4" /> OCR Tamamlandi
                </div>
                <div className="text-xs text-gray-400 space-y-1">
                  <div>Tarih: {ocrResult.parsed.tarih || '-'}</div>
                  <div>Evrak No: {ocrResult.parsed.evrakNo || '-'}</div>
                  <div>Toplam: {(ocrResult.parsed.satis0 + ocrResult.parsed.satis1 + ocrResult.parsed.satis10 + ocrResult.parsed.satis20).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</div>
                  <div>Nakit: {ocrResult.parsed.nakit.toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</div>
                  <div>Kredi Karti: {ocrResult.parsed.krediKarti.toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</div>
                </div>
                <button onClick={() => setShowOcrModal(true)} className="mt-2 text-xs text-blue-400 hover:text-blue-300">
                  Detaylari Goster & Duzelt
                </button>
              </div>
            )}

            {batchResults.length > 0 && isBatchMode && (
              <div className="bg-blue-900/30 rounded-lg p-3 border border-blue-700/30">
                <div className="flex items-center gap-2 text-green-400 text-sm mb-2">
                  <CheckCircle className="w-4 h-4" /> {batchResults.length} Z Raporu Okundu
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {batchResults.map((result, index) => (
                    <div key={index} className="text-xs text-gray-400 flex justify-between">
                      <span>{result.file.name}{result.subIndex ? ` (#${result.subIndex})` : ''}</span>
                      <span>{(result.parsed.satis0 + result.parsed.satis1 + result.parsed.satis10 + result.parsed.satis20).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => setShowOcrModal(true)} className="mt-2 text-xs text-blue-400 hover:text-blue-300">
                  Tumunu Goster & Duzelt
                </button>
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={uploading || (!ocrResult && batchResults.length === 0)}
              className="w-full bg-gradient-to-r from-green-600 to-green-500 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {uploading ? 'Kaydediliyor...' : isBatchMode ? `${batchResults.length} Raporu Kaydet` : 'Kaydet ve Deftere Isle'}
            </button>
          </div>
        </div>
      </div>

      {seriKamera && <BelgeSeriKamera kalan={10 - selectedFiles.length} onCek={file => dosyalariEkle([file])} onKapat={seriKamerayiKapat} />}

      {/* Liste */}
      <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Z Raporlari - {months[selectedMonth]} {selectedYear}</h3>
          {reports.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={loading || !reports.length} onClick={() => belgeExcelIndir(reports, selectedYear + '-' + String(selectedMonth + 1).padStart(2, '0'), true).catch(() => setMsg('Excel dosyası hazırlanamadı.'))} className="flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs text-white disabled:opacity-50"><Download className="h-3 w-3" /> KDV Dökümü Excel</button>
              <button onClick={() => downloadLucaCSV(convertToLucaFormat(reports, {name: clientName, client_type: clientType}))} className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1">
                <Download className="w-3 h-3" /> Luca CSV
              </button>
              <button onClick={() => downloadLucaExcel(convertToLucaFormat(reports, {name: clientName, client_type: clientType}))} className="text-xs bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1">
                <Download className="w-3 h-3" /> Luca Excel
              </button>
              <button onClick={() => downloadDefterExcel(convertToDefterFormat(reports, clientType))} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1">
                <Download className="w-3 h-3" /> Defter
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-gray-400 text-center py-6">Yukleniyor...</p>
        ) : reports.length === 0 ? (
          <p className="text-gray-500 text-center py-6">Bu donemde Z raporu bulunmuyor</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-blue-700/30">
                  <th className="text-left py-2 px-3 text-gray-400">Tarih</th>
                  <th className="text-left py-2 px-3 text-gray-400">Evrak No</th>
                  <th className="text-right py-2 px-3 text-gray-400">Toplam</th>
                  <th className="text-right py-2 px-3 text-gray-400">Nakit</th>
                  <th className="text-right py-2 px-3 text-gray-400">Kredi K.</th>
                  <th className="text-right py-2 px-3 text-gray-400">KDV</th>
                  <th className="text-center py-2 px-3 text-gray-400">Durum</th>
                  <th className="text-center py-2 px-3 text-gray-400">Islem</th>
                </tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r.id} className="border-b border-blue-800/20 hover:bg-blue-900/20">
                    <td className="py-2 px-3 text-white">{r.report_date}</td>
                    <td className="py-2 px-3 text-white">{r.z_no || '-'}</td>
                    <td className="py-2 px-3 text-right text-white">{(r.total_amount || 0).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</td>
                    <td className="py-2 px-3 text-right text-white">{(r.cash_amount || 0).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</td>
                    <td className="py-2 px-3 text-right text-white">{(r.credit_card_amount || 0).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</td>
                    <td className="py-2 px-3 text-right text-white">{(r.total_kdv || 0).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`text-xs px-2 py-1 rounded-full ${r.ocr_status === 'approved' ? 'bg-green-500/20 text-green-400' : r.ocr_status === 'parsed' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-500/20 text-gray-400'}`}>
                        {r.ocr_status === 'approved' ? 'Onayli' : r.ocr_status === 'parsed' ? 'Parse Edildi' : 'Bekliyor'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => setSelectedReport(r)} className="text-blue-400 hover:text-blue-300">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(r)} className="text-red-400 hover:text-red-300">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* OCR Modal */}
      {showOcrModal && ocrResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-blue-900 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-blue-700/30">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">OCR Sonuclari - Duzeltme</h3>
                <button onClick={() => setShowOcrModal(false)} className="text-gray-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
                {previewUrls[0] && <a href={previewUrls[0]} target="_blank" rel="noreferrer" aria-label="Z raporu görselini büyüt"><img src={previewUrls[0]} alt="Z raporu görseli" className="max-h-[55vh] w-full rounded-lg bg-black/20 object-contain" /></a>}
                <div>
              {belgeSatirlari({ parsed_data: ocrResult.parsed }, true).some(row => row[3] === 'Kontrol gerekli') && <p className="mb-3 text-sm text-amber-300">KDV kontrolü gerekli. Tutarlar düzeltilmezse rapor saklanır ancak muhasebe fişi oluşturulmaz.</p>}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Tarih</label>
                  <input type="date" value={ocrResult.parsed.tarih || ''} onChange={e => setOcrResult({...ocrResult, parsed: {...ocrResult.parsed, tarih: e.target.value}})} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Evrak No</label>
                  <input type="text" value={ocrResult.parsed.evrakNo || ''} onChange={e => setOcrResult({...ocrResult, parsed: {...ocrResult.parsed, evrakNo: e.target.value}})} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4">
                {['satis0', 'satis1', 'satis10', 'satis20', 'nakit', 'krediKarti', 'matrah1', 'matrah10', 'matrah20', 'kdv1', 'kdv10', 'kdv20'].map(field => (
                  <div key={field}>
                    <label className="block text-xs text-gray-400 mb-1">{field.toUpperCase()}</label>
                    <input type="number" step="0.01" value={ocrResult.parsed[field] || 0} onChange={e => setOcrResult({...ocrResult, parsed: {...ocrResult.parsed, [field]: parseFloat(e.target.value) || 0, kdvOraniVarsayildi: ['satis20', 'matrah20', 'kdv20'].includes(field) ? false : ocrResult.parsed.kdvOraniVarsayildi}})} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
                  </div>
                ))}
              </div>

              <div className="bg-blue-800/30 rounded-lg p-3 mb-4">
                <div className="text-xs text-gray-400 mb-1">Ham OCR Metni:</div>
                <pre className="text-xs text-gray-500 whitespace-pre-wrap">{ocrResult.rawText}</pre>
              </div>

              <button onClick={() => setShowOcrModal(false)} className="w-full bg-blue-600 text-white py-2 rounded-lg">
                İncelemeyi Kapat
              </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toplu OCR Modal — her Z raporu ayri duzeltilebilir */}
      {showOcrModal && !ocrResult && isBatchMode && batchResults.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-blue-900 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-blue-700/30">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">OCR Sonuclari - {batchResults.length} Z Raporu</h3>
                <button onClick={() => setShowOcrModal(false)} className="text-gray-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {batchResults.map((result, index) => (
                  <div key={index} className="bg-blue-800/30 rounded-lg p-4 border border-blue-700/30">
                    <div className="flex items-center gap-2 mb-3">
                      <a href={result.previewUrl} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-2 text-xs text-blue-300"><img src={result.previewUrl} alt="" className="h-14 w-14 rounded bg-black/20 object-contain" /> Görseli Büyüt</a>
                      <span className="text-sm text-white">{result.file.name}{result.subIndex ? ` (#${result.subIndex})` : ''}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Tarih</label>
                        <input type="date" value={result.parsed.tarih || ''} onChange={e => updateBatchResult(index, 'tarih', e.target.value)} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Evrak No</label>
                        <input type="text" value={result.parsed.evrakNo || ''} onChange={e => updateBatchResult(index, 'evrakNo', e.target.value)} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                      {['satis0', 'satis1', 'satis10', 'satis20', 'nakit', 'krediKarti', 'matrah1', 'matrah10', 'matrah20', 'kdv1', 'kdv10', 'kdv20'].map(field => (
                        <div key={field}>
                          <label className="block text-xs text-gray-400 mb-1">{field.toUpperCase()}</label>
                          <input type="number" step="0.01" value={result.parsed[field] || 0} onChange={e => updateBatchResult(index, field, parseFloat(e.target.value) || 0)} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={() => setShowOcrModal(false)} className="w-full bg-blue-600 text-white py-2 rounded-lg mt-4">
                İncelemeyi Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
