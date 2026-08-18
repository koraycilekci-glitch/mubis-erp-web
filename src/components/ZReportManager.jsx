import { useState, useEffect } from 'react'
import { Camera, Upload, Trash2, Save, X, Eye, CheckCircle, AlertTriangle, FileText, Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { processZReportImage, convertToAccountingEntry } from '../services/zReportOCRService'
import { saveZReport, updateZReportParsedData, createAccountingEntries } from '../services/zReportService'
import { convertToLucaFormat, downloadLucaCSV, downloadLucaExcel, convertToDefterFormat, downloadDefterExcel } from '../services/zReportExportService'

export default function ZReportManager({ clientId, clientName, clientType }) {
  // clientId null/undefined ise bile component render edilsin
  const effectiveClientId = clientId || 'unknown'
  
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [previewUrls, setPreviewUrls] = useState([])
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

  const handleFileSelect = (e) => {
    if (!clientId) {
      setMsg('Musteri ID bulunamadi. Lutfen tekrar giris yapin.')
      setTimeout(() => setMsg(''), 3000)
      return
    }
    const files = Array.from(e.target.files)
    if (!files.length) return
    
    // Sadece resim dosyalarini kabul et
    const imageFiles = files.filter(file => file.type.startsWith('image/'))
    if (imageFiles.length === 0) {
      setMsg('Lutfen sadece resim dosyalari secin (JPG, PNG)')
      setTimeout(() => setMsg(''), 3000)
      return
    }
    
    if (imageFiles.length > 10) {
      setMsg('En fazla 10 resim yukleyebilirsiniz')
      setTimeout(() => setMsg(''), 3000)
      return
    }
    
    // Mevcut resimlere ekle (batch modu icin)
    const allFiles = [...selectedFiles, ...imageFiles]
    if (allFiles.length > 10) {
      setMsg('Toplam en fazla 10 resim yukleyebilirsiniz')
      setTimeout(() => setMsg(''), 3000)
      return
    }
    
    setSelectedFiles(allFiles)
    const urls = imageFiles.map(file => URL.createObjectURL(file))
    setPreviewUrls(prev => [...prev, ...urls])
    setCurrentFileIndex(0)
    setOcrResult(null)
    setBatchResults([])
    setIsBatchMode(allFiles.length > 1)
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
        // Coklu mod - tum resimleri sirayla oku
        const results = []
        for (let i = 0; i < selectedFiles.length; i++) {
          setCurrentFileIndex(i)
          setMsg(`${i + 1}/${selectedFiles.length} resim isleniyor...`)
          
          const result = await processZReportImage(previewUrls[i])
          results.push({
            file: selectedFiles[i],
            previewUrl: previewUrls[i],
            ...result
          })
        }
        setBatchResults(results)
        setMsg(`${results.length} resim basariyla okundu`)
        setShowOcrModal(true)
      } else {
        // Tekli mod
        const result = await processZReportImage(previewUrls[0])
        setOcrResult(result)
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
      ...parsedData
    })

    const entries = convertToAccountingEntry(clientType, parsedData)
    await createAccountingEntries(clientId, report.id, entries)
    
    return report
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
              <input type="file" className="hidden" accept="image/*" capture="environment" onChange={handleFileSelect} />
            </label>
            
            {/* Galeriden Sec */}
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-blue-700/50 rounded-xl cursor-pointer hover:border-blue-500/50 hover:bg-blue-900/20 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-8 h-8 text-gray-400 mb-2" />
                <p className="text-sm text-gray-400">Galeriden Sec</p>
                <p className="text-xs text-gray-500">JPG, PNG (En fazla 10 resim)</p>
              </div>
              <input type="file" className="hidden" accept="image/*" multiple onChange={handleFileSelect} />
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
                  <CheckCircle className="w-4 h-4" /> {batchResults.length} Resim Okundu
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {batchResults.map((result, index) => (
                    <div key={index} className="text-xs text-gray-400 flex justify-between">
                      <span>{result.file.name}</span>
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

      {/* Liste */}
      <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Z Raporlari - {months[selectedMonth]} {selectedYear}</h3>
          {reports.length > 0 && (
            <div className="flex gap-2">
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
          <div className="bg-blue-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-blue-700/30">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">OCR Sonuclari - Duzeltme</h3>
                <button onClick={() => setShowOcrModal(false)} className="text-gray-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

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
                    <input type="number" step="0.01" value={ocrResult.parsed[field] || 0} onChange={e => setOcrResult({...ocrResult, parsed: {...ocrResult.parsed, [field]: parseFloat(e.target.value) || 0}})} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
                  </div>
                ))}
              </div>

              <div className="bg-blue-800/30 rounded-lg p-3 mb-4">
                <div className="text-xs text-gray-400 mb-1">Ham OCR Metni:</div>
                <pre className="text-xs text-gray-500 whitespace-pre-wrap">{ocrResult.rawText}</pre>
              </div>

              <button onClick={() => setShowOcrModal(false)} className="w-full bg-blue-600 text-white py-2 rounded-lg">
                Kaydet ve Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
