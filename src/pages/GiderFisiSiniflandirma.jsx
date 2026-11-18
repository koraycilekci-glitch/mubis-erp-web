import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import { supabase } from '../lib/supabase'
import { FileText, Plus, Trash2, RefreshCw, Loader2, CheckCircle, AlertTriangle, Download } from 'lucide-react'

export default function GiderFisiSiniflandirma() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/giris" replace />
  if (!['admin', 'super_admin', 'personel'].includes(user.role)) return <Navigate to="/portal" replace />

  const { clients } = useClients()
  const [seciliMusteri, setSeciliMusteri] = useState(null)
  const [yil, setYil] = useState(new Date().getFullYear())
  const [fisler, setFisler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(false)
  const [yeniFis, setYeniFis] = useState({ fis_no: '', fis_tarihi: '', satici: '', tutar: '', kdv_toplam: '', matrah_toplam: '', kdv_oranlari: [], url: '' })
  const [formAcik, setFormAcik] = useState(false)

  const yukle = async () => {
    setYukleniyor(true)
    try {
      let q = supabase.from('gider_fisleri').select('*').eq('office_id', 1).order('fis_tarihi', { ascending: false })
      if (seciliMusteri) q = q.eq('client_id', seciliMusteri)
      const { data } = await q
      setFisler(data || [])
    } catch (e) { console.error(e) }
    finally { setYukleniyor(false) }
  }

  useEffect(() => { yukle() }, [seciliMusteri])

  const handleEkle = async () => {
    if (!yeniFis.fis_tarihi) return
    try {
      const { error } = await supabase.from('gider_fisleri').insert({
        office_id: 1, client_id: seciliMusteri || null,
        fis_no: yeniFis.fis_no || null, fis_tarihi: yeniFis.fis_tarihi,
        satici: yeniFis.satici || null, tutar: parseFloat(yeniFis.tutar) || null,
        kdv_toplam: parseFloat(yeniFis.kdv_toplam) || null, matrah_toplam: parseFloat(yeniFis.matrah_toplam) || null,
        kdv_oranlari: yeniFis.kdv_oranlari.length ? yeniFis.kdv_oranlari : null,
        url: yeniFis.url || null, kaynak: 'manuel', siniflandirma_durumu: 'siniflandirildi'
      })
      if (error) throw error
      setFormAcik(false)
      setYeniFis({ fis_no: '', fis_tarihi: '', satici: '', tutar: '', kdv_toplam: '', matrah_toplam: '', kdv_oranlari: [], url: '' })
      yukle()
    } catch (e) { console.error(e) }
  }

  const handleSil = async (id) => {
    if (!confirm('Bu gider fişini silmek istediğinize emin misiniz?')) return
    await supabase.from('gider_fisleri').delete().eq('id', id)
    yukle()
  }

  const kdv1Toplam = fisler.reduce((s, f) => s + (f.kdv_oranlari?.find(k => k.oran === 1)?.kdv || 0), 0)
  const kdv10Toplam = fisler.reduce((s, f) => s + (f.kdv_oranlari?.find(k => k.oran === 10)?.kdv || 0), 0)
  const kdv20Toplam = fisler.reduce((s, f) => s + (f.kdv_oranlari?.find(k => k.oran === 20)?.kdv || 0), 0)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6 text-white">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Gider Fişi Sınıflandırma</h1>
          <p className="mt-2 text-blue-100/70 text-sm">Gider fişlerini KDV oranlarına göre otomatik sınıflandırır. KDV1/KDV10/KDV20 kırılımı.</p>
        </div>
        <button onClick={() => setFormAcik(v => !v)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500">
          <Plus className="w-4 h-4" /> Yeni Gider Fişi
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-sm text-blue-300 block mb-1">Müşteri</label>
          <select value={seciliMusteri || ''} onChange={e => setSeciliMusteri(e.target.value ? Number(e.target.value) : null)} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm">
            <option value="">Tümü</option>
            {(clients || []).slice().sort((a, b) => (a.name || a.company || a.shortName || '').localeCompare(b.name || b.company || b.shortName || '', 'tr')).map(c => <option key={c.id} value={c.id}>{c.name || c.company || c.shortName}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm text-blue-300 block mb-1">Yıl</label>
          <select value={yil} onChange={e => setYil(Number(e.target.value))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm">
            {[2023, 2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {formAcik && (
        <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-5 space-y-3">
          <h2 className="font-semibold">Yeni Gider Fişi</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input placeholder="Fiş No" value={yeniFis.fis_no} onChange={e => setYeniFis(p => ({ ...p, fis_no: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input type="date" value={yeniFis.fis_tarihi} onChange={e => setYeniFis(p => ({ ...p, fis_tarihi: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input placeholder="Satıcı" value={yeniFis.satici} onChange={e => setYeniFis(p => ({ ...p, satici: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input type="number" placeholder="Toplam Tutar" value={yeniFis.tutar} onChange={e => setYeniFis(p => ({ ...p, tutar: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input type="number" placeholder="KDV Toplam" value={yeniFis.kdv_toplam} onChange={e => setYeniFis(p => ({ ...p, kdv_toplam: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input type="number" placeholder="Matrah Toplam" value={yeniFis.matrah_toplam} onChange={e => setYeniFis(p => ({ ...p, matrah_toplam: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input placeholder="Dosya URL (opsiyonel)" value={yeniFis.url} onChange={e => setYeniFis(p => ({ ...p, url: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm sm:col-span-2" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleEkle} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium">Kaydet</button>
            <button onClick={() => setFormAcik(false)} className="bg-blue-700/50 hover:bg-blue-600/50 text-white px-4 py-2 rounded-lg text-sm font-medium">İptal</button>
          </div>
        </div>
      )}

      {fisler.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-4 text-center">
            <p className="text-2xl font-bold text-blue-400">{kdv1Toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-blue-100/60">KDV %1 Toplam</p>
          </div>
          <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-4 text-center">
            <p className="text-2xl font-bold text-amber-400">{kdv10Toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-blue-100/60">KDV %10 Toplam</p>
          </div>
          <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-4 text-center">
            <p className="text-2xl font-bold text-emerald-400">{kdv20Toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-blue-100/60">KDV %20 Toplam</p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-blue-900/40 text-blue-300 text-xs">
            <tr><th className="text-left px-4 py-3">Fiş No</th><th className="text-left px-4 py-3">Tarih</th><th className="text-left px-4 py-3">Satıcı</th><th className="text-right px-4 py-3">Tutar</th><th className="text-right px-4 py-3">KDV</th><th className="text-right px-4 py-3">Matrah</th><th className="text-left px-4 py-3">Durum</th><th className="text-left px-4 py-3">İşlem</th></tr>
          </thead>
          <tbody>
            {fisler.map(f => (
              <tr key={f.id} className="border-t border-blue-400/10 hover:bg-blue-800/20">
                <td className="px-4 py-3">{f.fis_no || '-'}</td>
                <td className="px-4 py-3">{f.fis_tarihi ? new Date(f.fis_tarihi).toLocaleDateString('tr-TR') : '-'}</td>
                <td className="px-4 py-3">{f.satici || '-'}</td>
                <td className="px-4 py-3 text-right">{Number(f.tutar || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-right">{Number(f.kdv_toplam || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-right">{Number(f.matrah_toplam || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs ${f.siniflandirma_durumu === 'siniflandirildi' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>{f.siniflandirma_durumu}</span></td>
                <td className="px-4 py-3">
                  <button onClick={() => handleSil(f.id)} className="p-1.5 rounded hover:bg-red-500/20 text-red-400"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
            {fisler.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-blue-100/60">Henüz gider fişi yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}