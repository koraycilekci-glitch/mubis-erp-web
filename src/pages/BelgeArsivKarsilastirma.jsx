import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, RefreshCw, Loader2, CheckCircle, AlertTriangle } from 'lucide-react'

export default function BelgeArsivKarsilastirma() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/giris" replace />
  if (!['admin', 'super_admin', 'personel'].includes(user.role)) return <Navigate to="/portal" replace />
  const { clients } = useClients()
  const [seciliMusteri, setSeciliMusteri] = useState(null)
  const [kayitlar, setKayitlar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(false)
  const [formAcik, setFormAcik] = useState(false)
  const [yeni, setYeni] = useState({ toplam_belge: '', eslesen_belge: '', eksik_belge: '', fazla_belge: '', durum: 'tamamlandi' })

  const yukle = async () => {
    setYukleniyor(true)
    try {
      let q = supabase.from('belge_arsiv_karsilastirma').select('*').eq('office_id', 1).order('karsilastirma_tarihi', { ascending: false })
      if (seciliMusteri) q = q.eq('client_id', seciliMusteri)
      const { data } = await q
      setKayitlar(data || [])
    } catch (e) { console.error(e) }
    finally { setYukleniyor(false) }
  }
  useEffect(() => { yukle() }, [seciliMusteri])

  const handleEkle = async () => {
    if (!seciliMusteri) return
    try {
      const { error } = await supabase.from('belge_arsiv_karsilastirma').insert({
        office_id: 1, client_id: seciliMusteri,
        toplam_belge: parseInt(yeni.toplam_belge) || 0, eslesen_belge: parseInt(yeni.eslesen_belge) || 0,
        eksik_belge: parseInt(yeni.eksik_belge) || 0, fazla_belge: parseInt(yeni.fazla_belge) || 0,
        durum: yeni.durum || 'tamamlandi'
      })
      if (error) throw error
      setFormAcik(false)
      setYeni({ toplam_belge: '', eslesen_belge: '', eksik_belge: '', fazla_belge: '', durum: 'tamamlandi' })
      yukle()
    } catch (e) { console.error(e) }
  }

  const handleSil = async (id) => {
    if (!confirm('Silmek istediğinize emin misiniz?')) return
    await supabase.from('belge_arsiv_karsilastirma').delete().eq('id', id)
    yukle()
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6 text-white">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Belge Arşiv Karşılaştırma</h1>
          <p className="mt-2 text-blue-100/70 text-sm">Arşivdeki belgeleri doğrulama. Eksik/fazla belgeleri tespit eder.</p>
        </div>
        <button onClick={() => setFormAcik(v => !v)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500">
          <Plus className="w-4 h-4" /> Yeni Karşılaştırma
        </button>
      </div>

      <div className="flex-1 min-w-[200px]">
        <label className="text-sm text-blue-300 block mb-1">Müşteri</label>
        <select value={seciliMusteri || ''} onChange={e => setSeciliMusteri(e.target.value ? Number(e.target.value) : null)} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm">
          <option value="">Tümü</option>
          {(clients || []).slice().sort((a, b) => (a.name || a.company || a.shortName || '').localeCompare(b.name || b.company || b.shortName || '', 'tr')).map(c => <option key={c.id} value={c.id}>{c.name || c.company || c.shortName}</option>)}
        </select>
      </div>

      {formAcik && (
        <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-5 space-y-3">
          <h2 className="font-semibold">Yeni Arşiv Karşılaştırma</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input type="number" placeholder="Toplam Belge" value={yeni.toplam_belge} onChange={e => setYeni(p => ({ ...p, toplam_belge: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input type="number" placeholder="Eşleşen Belge" value={yeni.eslesen_belge} onChange={e => setYeni(p => ({ ...p, eslesen_belge: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input type="number" placeholder="Eksik Belge" value={yeni.eksik_belge} onChange={e => setYeni(p => ({ ...p, eksik_belge: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input type="number" placeholder="Fazla Belge" value={yeni.fazla_belge} onChange={e => setYeni(p => ({ ...p, fazla_belge: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
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
            <tr><th className="text-left px-4 py-3">Tarih</th><th className="text-left px-4 py-3">Müşteri</th><th className="text-right px-4 py-3">Toplam</th><th className="text-right px-4 py-3">Eşleşen</th><th className="text-right px-4 py-3">Eksik</th><th className="text-right px-4 py-3">Fazla</th><th className="text-left px-4 py-3">İşlem</th></tr>
          </thead>
          <tbody>
            {kayitlar.map(k => (
              <tr key={k.id} className="border-t border-blue-400/10 hover:bg-blue-800/20">
                <td className="px-4 py-3">{new Date(k.karsilastirma_tarihi).toLocaleString('tr-TR')}</td>
                <td className="px-4 py-3">{k.client_id ? (clients?.find(c => c.id === k.client_id)?.name || `#${k.client_id}`) : '-'}</td>
                <td className="px-4 py-3 text-right">{k.toplam_belge}</td>
                <td className="px-4 py-3 text-right text-emerald-400">{k.eslesen_belge}</td>
                <td className="px-4 py-3 text-right text-red-400">{k.eksik_belge}</td>
                <td className="px-4 py-3 text-right text-amber-400">{k.fazla_belge}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleSil(k.id)} className="p-1.5 rounded hover:bg-red-500/20 text-red-400"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
            {kayitlar.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-blue-100/60">Henüz kayıt yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}