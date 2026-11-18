import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, RefreshCw, Loader2 } from 'lucide-react'

export default function FinansmanGiderKisitlamasi() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/giris" replace />
  if (!['admin', 'super_admin', 'personel'].includes(user.role)) return <Navigate to="/portal" replace />
  const { clients } = useClients()
  const [seciliMusteri, setSeciliMusteri] = useState(null)
  const [yil, setYil] = useState(new Date().getFullYear())
  const [kayitlar, setKayitlar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(false)
  const [formAcik, setFormAcik] = useState(false)
  const [yeni, setYeni] = useState({ donem: '', toplam_finansman_gideri: '', kisitlanan_tutar: '', indirilebilir_tutar: '', durum: 'taslak' })

  const yukle = async () => {
    setYukleniyor(true)
    try {
      let q = supabase.from('finansman_gider_kisitlamasi').select('*').eq('office_id', 1).eq('yil', yil).order('olusturma_ts', { ascending: false })
      if (seciliMusteri) q = q.eq('client_id', seciliMusteri)
      const { data } = await q
      setKayitlar(data || [])
    } catch (e) { console.error(e) }
    finally { setYukleniyor(false) }
  }
  useEffect(() => { yukle() }, [seciliMusteri, yil])

  const handleEkle = async () => {
    if (!seciliMusteri || !yeni.donem) return
    try {
      const { error } = await supabase.from('finansman_gider_kisitlamasi').insert({
        office_id: 1, client_id: seciliMusteri, yil, donem: yeni.donem,
        toplam_finansman_gideri: parseFloat(yeni.toplam_finansman_gideri) || null,
        kisitlanan_tutar: parseFloat(yeni.kisitlanan_tutar) || null,
        indirilebilir_tutar: parseFloat(yeni.indirilebilir_tutar) || null,
        durum: yeni.durum || 'taslak'
      })
      if (error) throw error
      setFormAcik(false)
      setYeni({ donem: '', toplam_finansman_gideri: '', kisitlanan_tutar: '', indirilebilir_tutar: '', durum: 'taslak' })
      yukle()
    } catch (e) { console.error(e) }
  }

  const handleSil = async (id) => {
    if (!confirm('Silmek istediğinize emin misiniz?')) return
    await supabase.from('finansman_gider_kisitlamasi').delete().eq('id', id)
    yukle()
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6 text-white">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Finansman Gider Kısıtlaması</h1>
          <p className="mt-2 text-blue-100/70 text-sm">Büyük işletmeler için finansman gideri kısıtlaması hesaplama.</p>
        </div>
        <button onClick={() => setFormAcik(v => !v)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500">
          <Plus className="w-4 h-4" /> Yeni Kayıt
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
          <h2 className="font-semibold">Yeni Finansman Gider Kısıtlaması</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input placeholder="Dönem" value={yeni.donem} onChange={e => setYeni(p => ({ ...p, donem: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input type="number" placeholder="Toplam Finansman Gideri" value={yeni.toplam_finansman_gideri} onChange={e => setYeni(p => ({ ...p, toplam_finansman_gideri: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input type="number" placeholder="Kısıtlanan Tutar" value={yeni.kisitlanan_tutar} onChange={e => setYeni(p => ({ ...p, kisitlanan_tutar: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input type="number" placeholder="İndirilebilir Tutar" value={yeni.indirilebilir_tutar} onChange={e => setYeni(p => ({ ...p, indirilebilir_tutar: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <select value={yeni.durum} onChange={e => setYeni(p => ({ ...p, durum: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm">
              <option value="taslak">Taslak</option><option value="tamamlandi">Tamamlandı</option><option value="onaylandi">Onaylandı</option>
            </select>
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
            <tr><th className="text-left px-4 py-3">Dönem</th><th className="text-right px-4 py-3">Toplam Finansman Gideri</th><th className="text-right px-4 py-3">Kısıtlanan</th><th className="text-right px-4 py-3">İndirilebilir</th><th className="text-left px-4 py-3">Durum</th><th className="text-left px-4 py-3">İşlem</th></tr>
          </thead>
          <tbody>
            {kayitlar.map(k => (
              <tr key={k.id} className="border-t border-blue-400/10 hover:bg-blue-800/20">
                <td className="px-4 py-3 font-medium">{k.donem}</td>
                <td className="px-4 py-3 text-right">{Number(k.toplam_finansman_gideri || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-right">{Number(k.kisitlanan_tutar || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-right">{Number(k.indirilebilir_tutar || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs ${k.durum === 'onaylandi' ? 'bg-emerald-500/20 text-emerald-300' : k.durum === 'tamamlandi' ? 'bg-blue-500/20 text-blue-300' : 'bg-amber-500/20 text-amber-300'}`}>{k.durum}</span></td>
                <td className="px-4 py-3">
                  <button onClick={() => handleSil(k.id)} className="p-1.5 rounded hover:bg-red-500/20 text-red-400"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
            {kayitlar.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-blue-100/60">Henüz kayıt yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}