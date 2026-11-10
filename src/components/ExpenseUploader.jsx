import { useState, useEffect } from 'react'
import { Camera, Upload, Trash2, Save, X, Eye, CheckCircle, AlertTriangle, FileText, Download, Receipt, FileSpreadsheet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { processExpenseImage, convertToAccountingEntry } from '../services/expenseOCRService'
import { pdfIlkSayfaResmi } from '../services/zReportOCRService'

export default function ExpenseUploader({ clientId, clientName }) {
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [previewUrls, setPreviewUrls] = useState([])
  const [msg, setMsg] = useState('')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [processingOCR, setProcessingOCR] = useState(false)
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [selectedExpense, setSelectedExpense] = useState(null)

  const months = [
    'Ocak','Subat','Mart','Nisan','Mayis','Haziran',
    'Temmuz','Agustos','Eylul','Ekim','Kasim','Aralik'
  ]

  const categories = [
    { id: 'yakit', name: 'Yakit', accountCode: '770' },
    { id: 'yemek', name: 'Yemek', accountCode: '769' },
    { id: 'kirtasiye', name: 'Kirtasiye', accountCode: '760' },
    { id: 'elektrik', name: 'Elektrik', accountCode: '770' },
    { id: 'su', name: 'Su', accountCode: '770' },
    { id: 'dogalgaz', name: 'Dogalgaz', accountCode: '770' },
    { id: 'kira', name: 'Kira', accountCode: '770' },
    { id: 'telefon', name: 'Telefon', accountCode: '760' },
    { id: 'internet', name: 'Internet', accountCode: '760' },
    { id: 'ulasim', name: 'Ulasim', accountCode: '770' },
    { id: 'bakim', name: 'Bakim/Onarim', accountCode: '770' },
    { id: 'reklam', name: 'Reklam', accountCode: '780' },
    { id: 'sigorta', name: 'Sigorta', accountCode: '780' },
    { id: 'vergi', name: 'Vergi', accountCode: '360' },
    { id: 'diger', name: 'Diger', accountCode: '770' },
  ]

  useEffect(() => {
    if (clientId) {
      loadExpenses()
    }
  }, [clientId, selectedYear, selectedMonth])

  const loadExpenses = async () => {
    if (!clientId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('expense_documents')
        .select(`
          *,
          expense_lines(*)
        `)
        .eq('client_id', clientId)
        .eq('year', selectedYear)
        .eq('month', selectedMonth)
        .order('document_date', { ascending: false })
      if (error) throw error
      setExpenses(data || [])
    } catch (e) {
      console.error('Gider fisleri yuklenemedi:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = async (e) => {
    if (!clientId) {
      setMsg('Musteri ID bulunamadi. Lutfen tekrar giris yapin.')
      setTimeout(() => setMsg(''), 3000)
      return
    }
    const files = Array.from(e.target.files)
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
    setMsg('')
  }

  const pdfMi = (f) => f && (/\.pdf$/i.test(f.name) || f.type === 'application/pdf')

  // Excel ile yukleme: her satir bir gider fisi
  const giderExcelYukle = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!clientId) {
      setMsg('Musteri ID bulunamadi. Lutfen tekrar giris yapin.')
      setTimeout(() => setMsg(''), 3000)
      return
    }
    setUploading(true)
    setMsg('Excel okunuyor...')
    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { cellDates: true })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const satirlar = XLSX.utils.sheet_to_json(sheet, { defval: '' })
      if (!satirlar.length) throw new Error('Excel dosyasi bos.')

      const anahtar = (s) => String(s || '').toLocaleLowerCase('tr')
        .replace(/ı/g, 'i').replace(/İ/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
        .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
        .replace(/[^a-z0-9]/g, '')
      const sayi = (v) => {
        if (typeof v === 'number') return isFinite(v) ? v : 0
        const t = String(v || '').replace(/[^\d.,-]/g, '').trim()
        if (!t) return 0
        if (t.includes(',')) return parseFloat(t.replace(/\./g, '').replace(',', '.')) || 0
        return parseFloat(t) || 0
      }
      const hucreTarih = (v) => {
        if (v instanceof Date && !isNaN(v)) return v.toISOString().split('T')[0]
        const m = String(v || '').match(/(\d{1,4})[.\/-](\d{1,2})[.\/-](\d{2,4})/)
        if (!m) return new Date().toISOString().split('T')[0]
        let [, a, b, c] = m
        if (c.length === 2) c = '20' + c
        if (a.length === 4) return `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`
        return `${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`
      }
      // Kategori esleme: excel degeri -> categories id
      const kategoriBul = (v) => {
        const n = anahtar(v)
        if (!n) return 'diger'
        const bul = categories.find(c => anahtar(c.name) === n || anahtar(c.id) === n)
        return bul ? bul.id : 'diger'
      }

      let kaydedilen = 0
      for (let i = 0; i < satirlar.length; i++) {
        const r = satirlar[i]
        const anahtarlar = Object.keys(r)
        const bul = (hedefler) => {
          for (const k of anahtarlar) if (hedefler.some(h => anahtar(k).startsWith(h))) return k
          return null
        }
        const toplam = sayi(r[bul(['toplam', 'tutar', 'tutar'])] ?? 0)
        const kdv = sayi(r[bul(['kdv'])] ?? 0)
        const aciklama = r[bul(['aciklama', 'satici', 'unvan'])] || ''
        const kategori = kategoriBul(r[bul(['kategori', 'giderturu', 'tur'])])
        if (!toplam) continue // tamamen bos / gecersiz satir
        setMsg(`Excel satiri kaydediliyor (${kaydedilen + 1})...`)
        const parsed = {
          tarih: hucreTarih(r[bul(['tarih'])]),
          fisNo: String(r[bul(['fisno', 'evrakno', 'belgeno'])] || ''),
          toplam,
          kdv,
          kdvOran: toplam > 0 && kdv > 0 ? Math.round((kdv / (toplam - kdv)) * 100) : 0,
          kategori,
          satici: String(r[bul(['satici', 'unvan'])] || ''),
          aciklama: String(aciklama || '')
        }
        const { data: expense, error: expenseError } = await supabase
          .from('expense_documents')
          .insert({
            client_id: clientId,
            year: selectedYear,
            month: selectedMonth,
            document_date: parsed.tarih,
            document_no: parsed.fisNo,
            image_url: '',
            file_name: `${file.name} (satir ${i + 2})`,
            status: 'parsed',
            total_amount: parsed.toplam,
            kdv_amount: parsed.kdv,
            kdv_rate: parsed.kdvOran,
            category: parsed.kategori,
            raw_text: `Excel yukleme: ${file.name}`,
            ocr_data: parsed
          })
          .select()
          .single()
        if (expenseError) throw expenseError
        const entries = convertToAccountingEntry('individual', parsed)
        for (const entry of entries) {
          await supabase.from('expense_lines').insert({
            expense_document_id: expense.id,
            description: entry.aciklama,
            account_code: entry.hesap_kodu,
            amount: entry.borc,
            kdv_amount: 0,
            kdv_rate: 0
          })
        }
        kaydedilen++
      }
      if (!kaydedilen) throw new Error('Excel icinde gecerli gider satiri bulunamadi (Toplam/Tutar kolonu bos).')
      setMsg(`${kaydedilen} gider fisi Excel'den kaydedildi!`)
      loadExpenses()
    } catch (err) {
      setMsg('Excel yukleme hatasi: ' + (err.message || err))
    } finally {
      setUploading(false)
      setTimeout(() => setMsg(''), 4000)
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
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i]
        const ext = file.name.split('.').pop()
        const fileName = `${clientId}/expenses/${selectedYear}/${selectedMonth}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`
        
        const { error: upError } = await supabase.storage
          .from('client-expenses')
          .upload(fileName, file, { cacheControl: '3600', upsert: false })
        if (upError) throw upError

        const { data: urlData } = supabase.storage
          .from('client-expenses')
          .getPublicUrl(fileName)

        // OCR islemi — PDF'ler tesseract ile okunamaz, resme cevrilmis
        // onizlemeyi (dataURL) kullan; resimlerde depolanan URL okunur.
        setMsg(`${i + 1}/${selectedFiles.length} OCR isleniyor...`)
        const ocrResult = await processExpenseImage(pdfMi(file) ? previewUrls[i] : urlData.publicUrl)
        
        // Gider kaydi olustur
        const { data: expense, error: expenseError } = await supabase
          .from('expense_documents')
          .insert({
            client_id: clientId,
            year: selectedYear,
            month: selectedMonth,
            document_date: ocrResult.parsed.tarih || new Date().toISOString().split('T')[0],
            document_no: ocrResult.parsed.fisNo || '',
            image_url: urlData.publicUrl,
            file_name: file.name,
            status: 'parsed',
            total_amount: ocrResult.parsed.toplam || 0,
            kdv_amount: ocrResult.parsed.kdv || 0,
            kdv_rate: ocrResult.parsed.kdvOran || 0,
            category: ocrResult.parsed.kategori || 'diger',
            raw_text: ocrResult.rawText,
            ocr_data: ocrResult.parsed
          })
          .select()
          .single()
        
        if (expenseError) throw expenseError
        
        // Muhasebe kaydi olustur
        const entries = convertToAccountingEntry('individual', ocrResult.parsed)
        for (const entry of entries) {
          await supabase
            .from('expense_lines')
            .insert({
              expense_document_id: expense.id,
              description: entry.aciklama,
              account_code: entry.hesap_kodu,
              amount: entry.borc,
              kdv_amount: 0,
              kdv_rate: 0
            })
        }
      }
      
      setMsg(`${selectedFiles.length} gider fisi basariyla yuklendi ve OCR ile okundu!`)
      setSelectedFiles([])
      setPreviewUrls([])
      loadExpenses()
    } catch (e) {
      setMsg('Kaydetme hatasi: ' + e.message)
    } finally {
      setUploading(false)
      setTimeout(() => setMsg(''), 3000)
    }
  }

  const handleDelete = async (expense) => {
    if (!confirm('Bu gider fisini silmek istiyor musunuz?')) return
    try {
      const path = expense.image_url.split('/client-expenses/')[1]
      if (path) {
        await supabase.storage.from('client-expenses').remove([path])
      }
      await supabase.from('expense_documents').delete().eq('id', expense.id)
      setMsg('Silindi')
      loadExpenses()
    } catch (e) {
      setMsg('Silme hatasi: ' + e.message)
    }
    setTimeout(() => setMsg(''), 3000)
  }

  const handleCategoryChange = async (expenseId, category) => {
    try {
      await supabase
        .from('expense_documents')
        .update({ category })
        .eq('id', expenseId)
      loadExpenses()
    } catch (e) {
      console.error('Kategori guncelleme hatasi:', e)
    }
  }

  const handleStatusChange = async (expenseId, status) => {
    try {
      await supabase
        .from('expense_documents')
        .update({ status })
        .eq('id', expenseId)
      loadExpenses()
    } catch (e) {
      console.error('Durum guncelleme hatasi:', e)
    }
  }

  return (
    <div className="space-y-6">
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
            {expenses.length} gider fisi
          </div>
        </div>
      </div>

      {/* Yukleme Formu */}
      <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
          <Receipt className="w-5 h-5 text-green-400" /> Gider Fisi Yukle
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Sol - Dosya Secimi */}
          <div className="space-y-3">
            {/* Kamera ile Cek */}
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-green-700/50 rounded-xl cursor-pointer hover:border-green-500/50 hover:bg-green-900/10 transition-colors mb-3">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Camera className="w-8 h-8 text-green-400 mb-2" />
                <p className="text-sm text-gray-400">Kamera ile Cek</p>
                <p className="text-xs text-gray-500">Telefon kamerasi acilir</p>
              </div>
              <input type="file" className="hidden" accept="image/*" capture="environment" onChange={handleFileSelect} />
            </label>
            
            {/* Galeriden Sec (Resim / PDF) */}
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-blue-700/50 rounded-xl cursor-pointer hover:border-blue-500/50 hover:bg-blue-900/20 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-8 h-8 text-gray-400 mb-2" />
                <p className="text-sm text-gray-400">Resim / PDF Sec</p>
                <p className="text-xs text-gray-500">JPG, PNG, PDF (En fazla 10 dosya)</p>
              </div>
              <input type="file" className="hidden" accept="image/*,.pdf,application/pdf" multiple onChange={handleFileSelect} />
            </label>

            {/* Excel ile Yukle */}
            <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-green-700/50 rounded-xl cursor-pointer hover:border-green-500/50 hover:bg-green-900/10 transition-colors">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-6 h-6 text-green-400" />
                <div className="text-left">
                  <p className="text-sm text-gray-400">Excel ile Yukle</p>
                  <p className="text-xs text-gray-500">Her satir bir gider fisi (Tarih, Fis No, Tutar, KDV...)</p>
                </div>
              </div>
              <input type="file" className="hidden" accept=".xlsx,.xls" onChange={giderExcelYukle} />
            </label>

            {/* Onizleme Grid */}
            {previewUrls.length > 0 && (
              <div className="mt-4">
                <p className="text-sm text-gray-400 mb-2">{selectedFiles.length} resim secildi:</p>
                <div className={`grid gap-2 ${previewUrls.length > 1 ? 'grid-cols-3' : 'grid-cols-1'}`}>
                  {previewUrls.map((url, index) => (
                    <div key={index} className="relative">
                      <img src={url} alt={`Onizleme ${index + 1}`} className="w-full h-24 object-cover rounded-lg bg-black/20" />
                      <button onClick={() => {
                        const newFiles = selectedFiles.filter((_, i) => i !== index)
                        const newUrls = previewUrls.filter((_, i) => i !== index)
                        setSelectedFiles(newFiles)
                        setPreviewUrls(newUrls)
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
              onClick={handleSave}
              disabled={uploading || !selectedFiles.length}
              className="w-full bg-gradient-to-r from-green-600 to-green-500 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {uploading ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
            
            <p className="text-xs text-gray-400 text-center">
              Yukledikten sonra OCR ile otomatik okunacak
            </p>
          </div>
        </div>
      </div>

      {/* Liste */}
      <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Gider Fisleri - {months[selectedMonth]} {selectedYear}</h3>
        </div>

        {loading ? (
          <p className="text-gray-400 text-center py-6">Yukleniyor...</p>
        ) : expenses.length === 0 ? (
          <p className="text-gray-500 text-center py-6">Bu donemde gider fisi bulunmuyor</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-blue-700/30">
                  <th className="text-left py-2 px-3 text-gray-400">Tarih</th>
                  <th className="text-left py-2 px-3 text-gray-400">Fiş No</th>
                  <th className="text-left py-2 px-3 text-gray-400">Kategori</th>
                  <th className="text-right py-2 px-3 text-gray-400">Tutar</th>
                  <th className="text-right py-2 px-3 text-gray-400">KDV</th>
                  <th className="text-center py-2 px-3 text-gray-400">Durum</th>
                  <th className="text-center py-2 px-3 text-gray-400">Islem</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map(expense => (
                  <tr key={expense.id} className="border-b border-blue-800/20 hover:bg-blue-900/20">
                    <td className="py-2 px-3 text-white">{expense.document_date}</td>
                    <td className="py-2 px-3 text-white">{expense.document_no || '-'}</td>
                    <td className="py-2 px-3">
                      <select
                        value={expense.category || 'diger'}
                        onChange={(e) => handleCategoryChange(expense.id, e.target.value)}
                        className="bg-blue-900/30 border border-blue-700/50 rounded px-2 py-1 text-white text-xs"
                      >
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3 text-right text-white">{(expense.total_amount || 0).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</td>
                    <td className="py-2 px-3 text-right text-white">{(expense.kdv_amount || 0).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</td>
                    <td className="py-2 px-3 text-center">
                      <select
                        value={expense.status || 'pending'}
                        onChange={(e) => handleStatusChange(expense.id, e.target.value)}
                        className={`text-xs px-2 py-1 rounded-full border-0 ${
                          expense.status === 'approved' ? 'bg-green-500/20 text-green-400' : 
                          expense.status === 'parsed' ? 'bg-yellow-500/20 text-yellow-400' : 
                          'bg-gray-500/20 text-gray-400'
                        }`}
                      >
                        <option value="pending">Bekliyor</option>
                        <option value="parsed">Parse Edildi</option>
                        <option value="approved">Onayli</option>
                      </select>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => { setSelectedExpense(expense); setShowExpenseModal(true) }} className="text-blue-400 hover:text-blue-300">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(expense)} className="text-red-400 hover:text-red-300">
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

      {/* Expense Modal */}
      {showExpenseModal && selectedExpense && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-blue-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-blue-700/30">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Gider Fisi Detayi</h3>
                <button onClick={() => setShowExpenseModal(false)} className="text-gray-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="mb-4">
                <img src={selectedExpense.image_url} alt="Gider Fisi" className="w-full h-64 object-contain rounded-lg bg-black/20" />
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Tarih</label>
                  <input type="date" value={selectedExpense.document_date || ''} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" readOnly />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Fiş No</label>
                  <input type="text" value={selectedExpense.document_no || ''} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" readOnly />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Tutar</label>
                  <input type="number" value={selectedExpense.total_amount || 0} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" readOnly />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">KDV</label>
                  <input type="number" value={selectedExpense.kdv_amount || 0} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" readOnly />
                </div>
              </div>
              
              <div className="bg-blue-800/30 rounded-lg p-3 mb-4">
                <div className="text-xs text-gray-400 mb-1">OCR Metni:</div>
                <pre className="text-xs text-gray-500 whitespace-pre-wrap">{selectedExpense.raw_text || 'OCR metni bulunmuyor'}</pre>
              </div>
              
              <button onClick={() => setShowExpenseModal(false)} className="w-full bg-blue-600 text-white py-2 rounded-lg">
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
