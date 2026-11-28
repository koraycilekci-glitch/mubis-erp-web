import { useState, useEffect, useCallback } from 'react'
import { Camera, Upload, Trash2, Save, X, Eye, CheckCircle, AlertTriangle, FileText, Download, Receipt, FileSpreadsheet } from 'lucide-react'
import BelgeSeriKamera from './BelgeSeriKamera'
import { belgeExcelIndir, belgeSatirlari } from '../utils/belgeTarama'
import { supabase } from '../lib/supabase'
import { processExpenseImage, convertToAccountingEntry } from '../services/expenseOCRService'
import { pdfIlkSayfaResmi } from '../services/zReportOCRService'
import { getViewUrl } from '../utils/storageUrl'

export default function ExpenseUploader({ clientId, clientName }) {
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [previewUrls, setPreviewUrls] = useState([])
  const [seriKamera, setSeriKamera] = useState(false)
  const seriKamerayiKapat = useCallback(() => setSeriKamera(false), [])
  const [okunanFisler, setOkunanFisler] = useState([])
  const [fisInceleme, setFisInceleme] = useState(false)
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
    setOkunanFisler([])
    setPreviewUrls(prev => [...prev, ...yeniUrler])
    setMsg('')
  }


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
        kaydedilen++
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

  const fisleriIncele = async () => {
    setProcessingOCR(true)
    setMsg('')
    try {
      const sonuclar = []
      for (const [index, url] of previewUrls.entries()) {
        setMsg((index + 1) + '/' + previewUrls.length + ' fiş okunuyor...')
        sonuclar.push(await processExpenseImage(url))
      }
      setOkunanFisler(sonuclar)
      setFisInceleme(true)
      setMsg('')
    } catch (error) {
      setMsg(error.message || 'Fiş okunamadı. Görseli kontrol edin.')
    } finally {
      setProcessingOCR(false)
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
    
    if (okunanFisler.length !== selectedFiles.length) return
    setUploading(true)
    let kaydedilen = 0
    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i]
        const ext = file.name.split('.').pop()
        const fileName = `${clientId}/expenses/${selectedYear}/${selectedMonth}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`

        // 1) Google Drive (bagliysa) — belge Drive'da, referans drive_belgeler'de.
        //    OCR icin yerel blob/sayfa onizlemesi kullanilir (Drive dosyasi
        //    herkese acik olmadigi icin public URL gerekmez).
        let imageUrl = ''
        setMsg(`${i + 1}/${selectedFiles.length} Drive'a yukleniyor...`)
        try {
          const { uploadExpenseToDrive } = await import('../services/googleDriveService')
          const drive = await uploadExpenseToDrive(file, {
            clientId,
            yil: selectedYear,
            ay: selectedMonth,
          })
          if (!drive?.success && drive?.uploaded) {
            const error = new Error(drive.error || 'Drive belge kaydi tamamlanamadi')
            error.driveUploaded = true
            throw error
          }
          if (drive?.success) {
            imageUrl = drive.web_view_link || ''
          }
        } catch (e) {
          if (e.driveUploaded) throw e
          console.warn('Drive gider yuklemesi atlandi:', e?.message || e)
        }

        // 2) Drive yoksa Supabase Storage'a dus (sistem durmaz)
        if (!imageUrl) {
          const { error: upError } = await supabase.storage
            .from('client-expenses')
            .upload(fileName, file, { cacheControl: '3600', upsert: false })
          if (upError) throw upError

          const { data: urlData } = supabase.storage
            .from('client-expenses')
            .getPublicUrl(fileName)
          imageUrl = urlData.publicUrl
        }

        const ocrResult = okunanFisler[i]

        // Gider kaydi olustur
        const { data: expense, error: expenseError } = await supabase
          .from('expense_documents')
          .insert({
            client_id: clientId,
            year: selectedYear,
            month: selectedMonth,
            document_date: ocrResult.parsed.tarih || new Date().toISOString().split('T')[0],
            document_no: ocrResult.parsed.fisNo || '',
            image_url: imageUrl,
            file_name: file.name,
            status: belgeSatirlari({ ocr_data: ocrResult.parsed }).some(row => row[3] === 'Kontrol gerekli') ? 'pending' : 'parsed',
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
      setFisInceleme(false)
      loadExpenses()
    } catch (e) {
      setMsg('Kaydetme hatası: ' + e.message)
      if (kaydedilen) loadExpenses()
    } finally {
      if (kaydedilen) {
        previewUrls.slice(0, kaydedilen).filter(url => url.startsWith('blob:')).forEach(url => URL.revokeObjectURL(url))
        setSelectedFiles(prev => prev.slice(kaydedilen))
        setPreviewUrls(prev => prev.slice(kaydedilen))
        setOkunanFisler(prev => prev.slice(kaydedilen))
      }
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
                        if (previewUrls[index].startsWith('blob:')) URL.revokeObjectURL(previewUrls[index])
                        setOkunanFisler([])
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
              onClick={okunanFisler.length ? () => setFisInceleme(true) : fisleriIncele}
              disabled={uploading || processingOCR || !selectedFiles.length}
              className="w-full bg-gradient-to-r from-green-600 to-green-500 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {processingOCR ? 'Fişler okunuyor...' : okunanFisler.length ? 'Sonuçları İncele' : 'Oku ve İncele'}
            </button>
            
            <p className="text-xs text-gray-400 text-center">
Görseli ve okunan tutarları kontrol ettikten sonra kaydedebilirsiniz.
            </p>
          </div>
        </div>
      </div>

      {seriKamera && <BelgeSeriKamera kalan={10 - selectedFiles.length} onCek={file => dosyalariEkle([file])} onKapat={seriKamerayiKapat} />}

      {/* Liste */}
      <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Gider Fişleri - {months[selectedMonth]} {selectedYear}</h3>
          <button type="button" disabled={loading || !expenses.length} onClick={() => belgeExcelIndir(expenses, selectedYear + '-' + String(selectedMonth + 1).padStart(2, '0')).catch(() => setMsg('Excel dosyası hazırlanamadı.'))} className="flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs text-white disabled:opacity-50"><Download className="h-3 w-3" /> KDV Dökümü Excel</button>
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
                        <button onClick={async () => {
                          try {
                            const previewUrl = await getViewUrl(expense.image_url)
                            if (!previewUrl) throw new Error('Belgeye erisilemiyor')
                            setSelectedExpense({ ...expense, previewUrl })
                            setShowExpenseModal(true)
                          } catch (error) {
                            setMsg('Belge acma hatasi: ' + error.message)
                          }
                        }} className="text-blue-400 hover:text-blue-300">
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
      {fisInceleme && okunanFisler.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <section role="dialog" aria-modal="true" aria-label="Fişleri incele" className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-blue-950 p-4 text-white">
            <header className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Fişleri İncele</h3><button type="button" disabled={uploading} onClick={() => setFisInceleme(false)} aria-label="İncelemeyi kapat"><X size={20} /></button></header>
            {okunanFisler.map(({ parsed, confidence }, index) => <div key={previewUrls[index]} className="mb-3 grid gap-3 rounded-lg border border-blue-700/40 p-3 md:grid-cols-2">
              <a href={previewUrls[index]} target="_blank" rel="noreferrer" aria-label="Fiş görselini büyüt"><img src={previewUrls[index]} alt="Fiş görseli" className="max-h-56 w-full rounded bg-black/20 object-contain" /></a>
              <div className="overflow-x-auto text-sm">
                <div className="font-medium">{parsed.satici || selectedFiles[index]?.name}</div>
                <div className="text-gray-300">{parsed.tarih} · Fiş No: {parsed.fisNo || 'Okunamadı'} · Toplam: {parsed.toplam} TL</div>
                {confidence < 65 && <p className="text-amber-300">Okuma güveni düşük; görseli kontrol edin.</p>}
                <table className="mt-2 w-full text-left text-xs">
                  <thead><tr>{['KDV Oranı', 'Matrah', 'KDV', 'Kart', 'Nakit'].map(baslik => <th key={baslik} className="p-1">{baslik}</th>)}</tr></thead>
                  <tbody>{belgeSatirlari({ ocr_data: parsed }).map((row, satir) => <tr key={satir} className={row[3] === 'Kontrol gerekli' ? 'text-amber-300' : ''}>{row.slice(3).map((deger, sutun) => <td key={sutun} className="p-1">{deger ?? '—'}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </div>)}
            {msg && <p role="status" className="mb-2 text-sm text-gray-300">{msg}</p>}
            <button type="button" onClick={handleSave} disabled={uploading} className="rounded-lg bg-emerald-700 px-4 py-2 disabled:opacity-50">{uploading ? 'Kaydediliyor...' : 'İnceledim, Kaydet'}</button>
          </section>
        </div>
      )}
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
                <img src={selectedExpense.previewUrl} alt="Gider Fisi" className="w-full h-64 object-contain rounded-lg bg-black/20" />
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
