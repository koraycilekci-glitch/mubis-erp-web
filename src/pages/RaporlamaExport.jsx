import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, RefreshCw, Loader2, Download } from 'lucide-react'

export default function RaporlamaExport() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/giris" replace />
  if (!['admin', 'super_admin', 'personel'].includes(user.role)) return <Navigate to="/portal" replace />

  const [raporlar, setRaporlar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(false)
  const [formAcik, setFormAcik] = useState(false)
  const [yeni, setYeni] = useState({ rapor_tipi: 'genel', rapor_adi: '', parametreler: '' })

  const yukle = async () => {
    setYukleniyor(true)
    try {
      const { data } = await supabase.from('raporlar').select('*').eq('office_id', 1).order('olusturma_ts', { ascending: false })
      setRaporlar(data || [])
    } catch (e) { console.error(e) }
    finally { setYukleniyor(false) }
  }
  useEffect(() => { yukle() }, [])

  const handleEkle = async () => {
    if (!yeni.rapor_adi) return
    try {
      let params = null
      try { params = yeni.parametreler ? JSON.parse(yeni.parametreler) : null } catch { params = { not: yeni.parametreler } }
      const { error } = await supabase.from('raporlar').insert({
        office_id: 1, rapor_tipi: yeni.rapor_tipi, rapor_adi: yeni.rapor_adi,
        parametreler: params, olusturan_user_id: user.id
      })
      if (error) throw error
      setFormAcik(false)
      setYeni({ rapor_tipi: 'genel', rapor_adi: '', parametreler: '' })
      yukle()
    } catch (e) { console.error(e) }
  }

  const handleSil = async (id) => {
    if (!confirm('Silmek istediğinize emin misiniz?')) return
    await supabase.from('raporlar').delete().eq('id', id)
    yukle()
  }

  const raporTipleri = { kdv_muavin: 'KDV Muavin', defter_beyan: 'Defter-Beyan', vergi_deneme: 'Vergi Deneme', gider_siniflandirma: 'Gider Sınıflandırma', genel: 'Genel' }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6 text-white">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Raporlama / Export</h1>
          <p className="mt-2 text-blue-100/70 text-sm">Kapsamlı Excel raporları. Rapor kayıtları ve parametreleri.</p>
        </div>
        <button onClick={() => setFormAcik(v => !v)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500">
          <Plus className="w-4 h-4" /> Yeni Rapor
        </button>
      </div>

      {formAcik && (
        <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-5 space-y-3">
          <h2 className="font-semibold">Yeni Rapor</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <select value={yeni.rapor_tipi} onChange={e => setYeni(p => ({ ...p, rapor_tipi: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm">
              <option value="genel">Genel</option><option value="kdv_muavin">KDV Muavin</option><option value="defter_beyan">Defter-Beyan</option><option value="vergi_deneme">Vergi Deneme</option><option value="gider_siniflandirma">Gider Sınıflandırma</option>
            </select>
            <input placeholder="Rapor Adı" value={yeni.rapor_adi} onChange={e => setYeni(p => ({ ...p, rapor_adi: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <textarea placeholder='Parametreler (JSON, örn: {"yil":2026,"ay":10})' value={yeni.parametreler} onChange={e => setYeni(p => ({ ...p, parametreler: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm sm:col-span-2" rows={2} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleEkle} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium">Kaydet</button>
            <button onClick={() => setFormAcik(false)} className="bg-blue-700/50 hover:bg-blue-600/50 text-white px-4 py-2 rounded-lg text-sm font-medium">İptal</button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-blue-900/40 text-blue-300 text-xs">
            <tr><th className="text-left px-4 py-3">Rapor Adı</th><th className="text-left px-4 py-3">Tip</th><th className="text-left px-4 py-3">Parametreler</th><th className="text-left px-4 py-3">Oluşturma</th><th className="text-left px-4 py-3">İşlem</th></tr>
          </thead>
          <tbody>
            {raporlar.map(r => (
              <tr key={r.id} className="border-t border-blue-400/10 hover:bg-blue-800/20">
                <td className="px-4 py-3 font-medium">{r.rapor_adi}</td>
                <td className="px-4 py-3">{raporTipleri[r.rapor_tipi] || r.rapor_tipi}</td>
                <td className="px-4 py-3 text-xs text-blue-100/60">{r.parametreler ? JSON.stringify(r.parametreler).slice(0, 60) : '-'}</td>
                <td className="px-4 py-3 text-xs text-blue-100/60">{new Date(r.olusturma_ts).toLocaleString('tr-TR')}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleSil(r.id)} className="p-1.5 rounded hover:bg-red-500/20 text-red-400"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
            {raporlar.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-blue-100/60">Henüz rapor yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}