import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClients } from '../hooks/useClients'
import { supabase } from '../lib/supabase'
import { uploadBulkBeyanDocuments } from '../services/documentService'
import {
  ArrowLeft, Upload, FileText, Trash2, AlertCircle, CheckCircle,
  RefreshCw, Calendar, User, FileDigit
} from 'lucide-react'

const BEYAN_TYPES = [
  { value: 'kdv', label: 'KDV' },
  { value: 'kdv2', label: 'KDV2' },
  { value: 'muhtasar', label: 'Muhtasar (Aylık)' },
  { value: 'muhtasar_3aylik', label: 'Muhtasar (3 Aylık)' },
  { value: 'sgk', label: 'SGK / Sigorta' },
  { value: 'gecici_vergi', label: 'Geçici Vergi' },
  { value: 'gelir_vergi', label: 'Gelir Vergisi' },
  { value: 'kurumlar_vergi', label: 'Kurumlar Vergisi' },
  { value: 'edefter', label: 'E-Defter' }
]

const MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
]

const YEARS = [2024, 2025, 2026, 2027]

function inferFromFileName(name) {
  const lower = name.toLowerCase()
  const result = { year: new Date().getFullYear(), month: null, beyanType: '', documentType: '' }

  // Yıl tahmini
  const yearMatch = name.match(/(202[4-7])/)
  if (yearMatch) result.year = parseInt(yearMatch[1])

  // Ay tahmini (sayı veya isim)
  const monthMatch = name.match(/(0?[1-9]|1[0-2])\s*[-._]\s*(202[4-7])/) || name.match(/(202[4-7])\s*[-._]\s*(0?[1-9]|1[0-2])/)
  if (monthMatch) {
    const m = parseInt(monthMatch[1] || monthMatch[2])
    if (m >= 1 && m <= 12) result.month = m - 1
  }
  if (result.month === null) {
    for (let i = 0; i < MONTHS.length; i++) {
      if (lower.includes(MONTHS[i].toLowerCase()) || lower.includes(MONTHS[i].toLocaleLowerCase('tr'))) {
        result.month = i
        break
      }
    }
  }

  // Beyan turu tahmini
  if (lower.includes('kdv2')) result.beyanType = 'kdv2'
  else if (lower.includes('kdv')) result.beyanType = 'kdv'
  else if (lower.includes('muhtasar')) result.beyanType = lower.includes('3') ? 'muhtasar_3aylik' : 'muhtasar'
  else if (lower.includes('sgk') || lower.includes('sigorta')) result.beyanType = 'sgk'
  else if (lower.includes('gecici') || lower.includes('gvstop')) result.beyanType = 'gecici_vergi'
  else if (lower.includes('gelir')) result.beyanType = 'gelir_vergi'
  else if (lower.includes('kurumlar')) result.beyanType = 'kurumlar_vergi'
  else if (lower.includes('edefter')) result.beyanType = 'edefter'

  // Dokuman turu tahmini
  if (lower.includes('tahakkuk')) result.documentType = 'tahakkuk'
  else if (lower.includes('beyan')) result.documentType = 'beyanname'
  else if (lower.includes('tahak')) result.documentType = 'tahakkuk'

  return result
}

export default function TopluBeyanYukle() {
  const navigate = useNavigate()
  const { clients } = useClients()
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const handleFiles = useCallback((selectedFiles) => {
    const pdfFiles = Array.from(selectedFiles).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (pdfFiles.length === 0) {
      setError('Lutfen sadece PDF dosyasi secin')
      return
    }
    setError('')
    setResult(null)

    const newRows = pdfFiles.map(file => {
      const inferred = inferFromFileName(file.name)
      return {
        id: Math.random().toString(36).slice(2, 9),
        file,
        clientId: '',
        year: inferred.year,
        month: inferred.month !== null ? inferred.month : new Date().getMonth(),
        beyanType: inferred.beyanType || 'kdv',
        documentType: inferred.documentType || 'beyanname'
      }
    })

    setFiles(prev => [...prev, ...newRows])
  }, [])

  const removeFile = (id) => {
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  const updateRow = (id, field, value) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f))
  }

  const missingRows = useMemo(() => {
    return files.filter(f => !f.clientId || !f.year || f.month === undefined || !f.beyanType || !f.documentType)
  }, [files])

  const handleUpload = async () => {
    if (files.length === 0) {
      setError('Lutfen en az bir dosya secin')
      return
    }
    if (missingRows.length > 0) {
      setError(`${missingRows.length} dosya icin eksik bilgi var. Lutfen musteri, yil, ay, beyan turu ve dokuman turunu secin.`)
      return
    }

    setUploading(true)
    setError('')
    setResult(null)

    try {
      const items = files.map(f => {
        const client = clients.find(c => String(c.id) === String(f.clientId))
        return {
          client,
          year: f.year,
          month: f.month,
          beyanType: f.beyanType,
          documentType: f.documentType,
          file: f.file
        }
      })

      const res = await uploadBulkBeyanDocuments(items)
      setResult({ success: res.length, failed: files.length - res.length })
      setFiles([])
    } catch (err) {
      setError('Yukleme hatasi: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-950 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/admin/aylik-beyan-takip')}
              className="bg-blue-800/30 hover:bg-blue-800/50 text-gray-300 p-2 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">Toplu Beyanname / Tahakkuk Yükleme</h1>
              <p className="text-gray-400 text-sm">GİB'den indirdiğiniz PDF'leri seçin, sistem otomatik olarak müşteriye atar.</p>
            </div>
          </div>
        </div>

        {/* Uyari / Sonuc */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 flex items-start gap-3 text-red-300">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {result && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 mb-6 flex items-start gap-3 text-green-300">
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{result.success} dosya basariyla yuklendi.</span>
          </div>
        )}

        {/* Dosya Secim */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
          className="border-2 border-dashed border-blue-700/50 bg-blue-900/20 rounded-xl p-8 text-center mb-6 hover:border-yellow-500/50 transition-colors"
        >
          <Upload className="w-10 h-10 text-yellow-500 mx-auto mb-3" />
          <p className="text-white font-medium mb-2">PDF dosyalarını sürükleyip bırakın veya seçin</p>
          <p className="text-gray-400 text-sm mb-4">Tek seferde birden fazla dosya yükleyebilirsiniz.</p>
          <label className="inline-flex items-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-blue-950 px-4 py-2 rounded-lg font-semibold cursor-pointer transition-colors">
            <FileText className="w-4 h-4" />
            <span>Dosya Seç</span>
            <input
              type="file"
              multiple
              accept=".pdf"
              onChange={(e) => handleFiles(e.target.files)}
              className="hidden"
            />
          </label>
        </div>

        {/* Liste */}
        {files.length > 0 && (
          <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl overflow-hidden mb-6">
            <div className="p-4 border-b border-blue-700/30 flex items-center justify-between">
              <h3 className="text-white font-medium flex items-center gap-2">
                <FileDigit className="w-4 h-4 text-yellow-500" />
                Seçilen Dosyalar ({files.length})
              </h3>
              <button
                onClick={() => setFiles([])}
                className="text-red-400 hover:text-red-300 text-xs flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> Tümünü Temizle
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-blue-950/50 text-gray-400">
                  <tr>
                    <th className="text-left p-3 font-medium">Dosya Adı</th>
                    <th className="text-left p-3 font-medium">Müşteri</th>
                    <th className="text-left p-3 font-medium">Yıl</th>
                    <th className="text-left p-3 font-medium">Ay</th>
                    <th className="text-left p-3 font-medium">Beyan Türü</th>
                    <th className="text-left p-3 font-medium">Tür</th>
                    <th className="p-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-700/30">
                  {files.map(row => (
                    <tr key={row.id} className="hover:bg-blue-800/20">
                      <td className="p-3 text-white max-w-[200px] truncate" title={row.file.name}>
                        {row.file.name}
                      </td>
                      <td className="p-3">
                        <select
                          value={row.clientId}
                          onChange={(e) => updateRow(row.id, 'clientId', e.target.value)}
                          className="bg-blue-900/40 border border-blue-700/50 rounded-lg px-2 py-1.5 text-white text-xs min-w-[160px]"
                        >
                          <option value="">Müşteri seçin</option>
                          {clients.slice().sort((a,b) => (a.name||a.company||"").localeCompare(b.name||b.company||"","tr")).map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name || c.company} {c.vkn ? `(${c.vkn})` : ''}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3">
                        <select
                          value={row.year}
                          onChange={(e) => updateRow(row.id, 'year', parseInt(e.target.value))}
                          className="bg-blue-900/40 border border-blue-700/50 rounded-lg px-2 py-1.5 text-white text-xs"
                        >
                          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </td>
                      <td className="p-3">
                        <select
                          value={row.month}
                          onChange={(e) => updateRow(row.id, 'month', parseInt(e.target.value))}
                          className="bg-blue-900/40 border border-blue-700/50 rounded-lg px-2 py-1.5 text-white text-xs"
                        >
                          {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                        </select>
                      </td>
                      <td className="p-3">
                        <select
                          value={row.beyanType}
                          onChange={(e) => updateRow(row.id, 'beyanType', e.target.value)}
                          className="bg-blue-900/40 border border-blue-700/50 rounded-lg px-2 py-1.5 text-white text-xs"
                        >
                          {BEYAN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </td>
                      <td className="p-3">
                        <select
                          value={row.documentType}
                          onChange={(e) => updateRow(row.id, 'documentType', e.target.value)}
                          className="bg-blue-900/40 border border-blue-700/50 rounded-lg px-2 py-1.5 text-white text-xs"
                        >
                          <option value="beyanname">Beyanname</option>
                          <option value="tahakkuk">Tahakkuk</option>
                        </select>
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => removeFile(row.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-blue-700/30 flex items-center justify-between">
              <p className="text-gray-400 text-xs">
                Dosya adindan otomatik tahmin yapilir, kontrol edip eksik alanlari tamamlayin.
              </p>
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-blue-950 px-6 py-2 rounded-lg font-semibold flex items-center gap-2 disabled:opacity-50"
              >
                {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? 'Yukleniyor...' : 'Toplu Yükle'}
              </button>
            </div>
          </div>
        )}

        {files.length === 0 && !result && (
          <div className="text-center text-gray-500 text-sm py-8">
            Yuklemek icin once PDF dosyasi secin.
          </div>
        )}
      </div>
    </div>
  )
}
