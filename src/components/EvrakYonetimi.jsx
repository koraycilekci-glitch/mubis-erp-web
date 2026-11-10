// MUBiS - Evrak Yonetimi (musteri portal "Belge Yükle" bolumu icin)
// Admin musteri detayindaki "Evraklar" sekmesi ile ayni ozellik:
// Gelir Beyani, Gecici Vergi, Vergi Levhasi ve Mali Evrak yukleme/silme.
// Dosyalar ayni documentService fonksiyonlariyla ayni klasore yazilir,
// client_documents JSON'u guncellenir (admin Evraklar sekmesinde de gorunur).
import { useState, useEffect } from 'react'
import { Upload, Eye, Download, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  uploadGelirBeyanDocument,
  uploadGeciciVergiDocument,
  uploadVergiLevhasi,
  uploadMaliEvrak
} from '../services/documentService'

export default function EvrakYonetimi({ client }) {
  const [docs, setDocs] = useState({})
  const [loading, setLoading] = useState(false)

  const [gelirBeyanYear, setGelirBeyanYear] = useState(String(new Date().getFullYear()))
  const [geciciVergiYear, setGeciciVergiYear] = useState(String(new Date().getFullYear()))
  const [geciciVergiPeriod, setGeciciVergiPeriod] = useState('1')
  const [maliEvrakCategory, setMaliEvrakCategory] = useState('imza_beyani')
  const [maliEvrakName, setMaliEvrakName] = useState('')

  useEffect(() => { setDocs(client?.client_documents || {}) }, [client?.id, client?.client_documents])

  if (!client?.id) {
    return <div className="text-center py-8 text-gray-400">Musteri bilgisi bulunamadi.</div>
  }

  const updateClientDocuments = async (nextDocs) => {
    setLoading(true)
    try {
      const { error } = await supabase
        .from('clients')
        .update({ client_documents: nextDocs })
        .eq('id', client.id)
      if (error) throw error
      setDocs(nextDocs)
    } catch (e) {
      console.error('Evrak kaydetme hatasi:', e)
      throw new Error(e.message || 'Evrak kaydedilemedi')
    } finally {
      setLoading(false)
    }
  }

  const yukleVeKaydet = async (uploadFn, belgeyiYerlestir, basariMesaji) => {
    setLoading(true)
    try {
      const uploaded = await uploadFn()
      const next = { ...docs }
      belgeyiYerlestir(next, uploaded)
      await updateClientDocuments(next)
      alert(basariMesaji)
    } catch (err) {
      console.error('Evrak yukleme hatasi:', err)
      alert('Yukleme basarisiz: ' + (err.message || 'Bilinmeyen hata'))
      setLoading(false)
    }
  }

  const handleGelirBeyanUpload = (e, documentType) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    yukleVeKaydet(
      () => uploadGelirBeyanDocument({ client, year: gelirBeyanYear, documentType, file }),
      (next, uploaded) => {
        next.mali_veriler = next.mali_veriler || {}
        next.mali_veriler.gelir_beyani = next.mali_veriler.gelir_beyani || {}
        next.mali_veriler.gelir_beyani[gelirBeyanYear] = next.mali_veriler.gelir_beyani[gelirBeyanYear] || {}
        next.mali_veriler.gelir_beyani[gelirBeyanYear][documentType] = uploaded
      },
      'Evrak yuklendi.'
    )
  }

  const handleGeciciVergiUpload = (e, documentType) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    yukleVeKaydet(
      () => uploadGeciciVergiDocument({ client, year: geciciVergiYear, period: geciciVergiPeriod, documentType, file }),
      (next, uploaded) => {
        next.mali_veriler = next.mali_veriler || {}
        next.mali_veriler.gecici_vergi = next.mali_veriler.gecici_vergi || {}
        next.mali_veriler.gecici_vergi[geciciVergiYear] = next.mali_veriler.gecici_vergi[geciciVergiYear] || {}
        next.mali_veriler.gecici_vergi[geciciVergiYear][geciciVergiPeriod] = next.mali_veriler.gecici_vergi[geciciVergiYear][geciciVergiPeriod] || {}
        next.mali_veriler.gecici_vergi[geciciVergiYear][geciciVergiPeriod][documentType] = uploaded
      },
      'Evrak yuklendi.'
    )
  }

  const handleVergiLevhasiUpload = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    yukleVeKaydet(
      () => uploadVergiLevhasi({ client, file }),
      (next, uploaded) => {
        next.mali_veriler = next.mali_veriler || {}
        next.mali_veriler.vergi_levhasi = uploaded
      },
      'Vergi levhasi yuklendi.'
    )
  }

  const handleMaliEvrakUpload = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!maliEvrakName.trim()) { alert('Lutfen evrak adi girin.'); return }
    yukleVeKaydet(
      () => uploadMaliEvrak({ client, category: maliEvrakCategory, name: maliEvrakName, file }),
      (next, uploaded) => {
        next.mali_evraklar = next.mali_evraklar || {}
        next.mali_evraklar[maliEvrakCategory] = next.mali_evraklar[maliEvrakCategory] || []
        next.mali_evraklar[maliEvrakCategory].push(uploaded)
      },
      'Evrak yuklendi.'
    )
    setMaliEvrakName('')
  }

  const handleDelete = async (pathGetter) => {
    if (!window.confirm('Bu evragi silmek istediginize emin misiniz?')) return
    try {
      const next = { ...docs }
      pathGetter(next)
      await updateClientDocuments(next)
    } catch (err) {
      console.error('Evrak silme hatasi:', err)
      alert('Silme basarisiz: ' + (err.message || 'Bilinmeyen hata'))
    }
  }

  const yilSecici = (deger, setter) => (
    <select value={deger} onChange={e => setter(e.target.value)} className="bg-blue-950 border border-blue-700/50 rounded-lg px-2 py-1 text-white text-sm">
      {[2024, 2025, 2026, 2027].map(y => <option key={y} value={String(y)}>{y}</option>)}
    </select>
  )

  const evrakSatiri = ({ label, docData, accept, onFile, onDelete }) => (
    <div className="flex items-center justify-between p-3 bg-blue-950/40 rounded-lg">
      <span className="text-gray-300 text-sm">{label}</span>
      <div className="flex items-center gap-2">
        {docData?.url ? (
          <>
            <a href={docData.url} target="_blank" rel="noreferrer" className="p-1.5 bg-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/30" title="Goruntule"><Eye className="w-4 h-4" /></a>
            <a href={docData.url} download className="p-1.5 bg-green-500/20 rounded-lg text-green-400 hover:bg-green-500/30" title="Indir"><Download className="w-4 h-4" /></a>
            <button onClick={onDelete} className="p-1.5 bg-red-500/20 rounded-lg text-red-400 hover:bg-red-500/30" title="Sil"><Trash2 className="w-4 h-4" /></button>
          </>
        ) : (
          <label className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border border-dashed cursor-pointer text-sm ${loading ? 'opacity-50 cursor-not-allowed' : 'border-blue-700/50 hover:border-yellow-500/50 hover:bg-blue-900/30 text-gray-300'}`}>
            <Upload className="w-4 h-4" />
            <span>{accept.includes('xlsx') ? 'Excel Y' : 'PDF Y'}</span>
            <input type="file" accept={accept} disabled={loading} className="hidden" onChange={onFile} />
          </label>
        )}
      </div>
    </div>
  )

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Gelir Beyani */}
      <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-white font-medium">Gelir Beyani</h4>
          {yilSecici(gelirBeyanYear, setGelirBeyanYear)}
        </div>
        <div className="space-y-3">
          {[
            { key: 'beyanname', label: 'Gelir/Kurumlar Vergi Beyani' },
            { key: 'tahakkuk', label: 'Tahakkuk' },
            { key: 'mizan', label: 'Mizan' }
          ].map(doc => evrakSatiri({
            label: doc.label,
            docData: docs?.mali_veriler?.gelir_beyani?.[gelirBeyanYear]?.[doc.key],
            accept: doc.key === 'mizan' ? '.xlsx,.xls' : 'application/pdf',
            onFile: e => handleGelirBeyanUpload(e, doc.key),
            onDelete: () => handleDelete(next => { delete next.mali_veriler.gelir_beyani[gelirBeyanYear][doc.key] })
          }))}
        </div>
      </div>

      {/* Gecici Vergi */}
      <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <h4 className="text-white font-medium">Gecici Vergi</h4>
          <div className="flex items-center gap-2">
            {yilSecici(geciciVergiYear, setGeciciVergiYear)}
            <select value={geciciVergiPeriod} onChange={e => setGeciciVergiPeriod(e.target.value)} className="bg-blue-950 border border-blue-700/50 rounded-lg px-2 py-1 text-white text-sm">
              {[1, 2, 3, 4].map(p => <option key={p} value={String(p)}>{p}. Donem</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-3">
          {[
            { key: 'beyanname', label: 'Gecici Vergi Beyanname' },
            { key: 'tahakkuk', label: 'Tahakkuk' },
            { key: 'mizan', label: 'Mizan' }
          ].map(doc => evrakSatiri({
            label: doc.label,
            docData: docs?.mali_veriler?.gecici_vergi?.[geciciVergiYear]?.[geciciVergiPeriod]?.[doc.key],
            accept: doc.key === 'mizan' ? '.xlsx,.xls' : 'application/pdf',
            onFile: e => handleGeciciVergiUpload(e, doc.key),
            onDelete: () => handleDelete(next => { delete next.mali_veriler.gecici_vergi[geciciVergiYear][geciciVergiPeriod][doc.key] })
          }))}
        </div>
      </div>

      {/* Vergi Levhasi */}
      <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
        <h4 className="text-white font-medium mb-4">Vergi Levhasi</h4>
        {evrakSatiri({
          label: 'Son Vergi Levhasi',
          docData: docs?.mali_veriler?.vergi_levhasi,
          accept: 'application/pdf',
          onFile: handleVergiLevhasiUpload,
          onDelete: () => handleDelete(next => { delete next.mali_veriler.vergi_levhasi })
        })}
      </div>

      {/* Mali Evraklar */}
      <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
        <h4 className="text-white font-medium mb-4">Mali Evraklar</h4>
        <div className="space-y-3 mb-4">
          <select value={maliEvrakCategory} onChange={e => setMaliEvrakCategory(e.target.value)} className="w-full bg-blue-950 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm">
            <option value="imza_beyani">Imza Beyani</option>
            <option value="gazete">Gazete</option>
            <option value="kurulus_belgesi">Kurulus Belgesi</option>
            <option value="diger">Diger</option>
          </select>
          <input
            type="text"
            value={maliEvrakName}
            onChange={e => setMaliEvrakName(e.target.value)}
            placeholder="Evrak adi (ornegin: 2026 Imza Beyani)"
            className="w-full bg-blue-950 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm"
          />
          <label className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-dashed cursor-pointer ${loading || !maliEvrakName.trim() ? 'opacity-50 cursor-not-allowed border-gray-600' : 'border-blue-700/50 hover:border-yellow-500/50 hover:bg-blue-900/30'}`}>
            <Upload className="w-4 h-4 text-gray-400" />
            <span className="text-gray-300 text-sm">{loading ? 'Yukleniyor...' : 'PDF / Resim Yukle'}</span>
            <input type="file" accept=".pdf,.png,.jpg,.jpeg" disabled={loading || !maliEvrakName.trim()} className="hidden" onChange={handleMaliEvrakUpload} />
          </label>
        </div>

        {Object.keys(docs?.mali_evraklar || {}).length > 0 && (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {Object.entries(docs.mali_evraklar).map(([cat, list]) =>
              Array.isArray(list) && list.map((doc, idx) => (
                <div key={`${cat}_${idx}`} className="flex items-center justify-between p-2 bg-blue-950/40 rounded-lg">
                  <div className="min-w-0">
                    <p className="text-gray-200 text-sm truncate">{doc.name}</p>
                    <p className="text-gray-500 text-xs">{cat.replace(/_/g, ' ')} · {doc.size}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <a href={doc.url} target="_blank" rel="noreferrer" className="p-1.5 bg-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/30"><Eye className="w-4 h-4" /></a>
                    <a href={doc.url} download className="p-1.5 bg-green-500/20 rounded-lg text-green-400 hover:bg-green-500/30"><Download className="w-4 h-4" /></a>
                    <button
                      onClick={() => handleDelete(next => { next.mali_evraklar[cat].splice(idx, 1) })}
                      className="p-1.5 bg-red-500/20 rounded-lg text-red-400 hover:bg-red-500/30"
                    ><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
