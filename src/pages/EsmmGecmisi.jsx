import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, RefreshCw, Loader2 } from 'lucide-react'

export default function EsmmGecmisi() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/giris" replace />
  if (!['admin', 'super_admin', 'personel'].includes(user.role)) return <Navigate to="/portal" replace />
  const { clients } = useClients()
  const [seciliMusteri, setSeciliMusteri] = useState(null)
  const [kayitlar, setKayitlar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(false)
  const [formAcik, setFormAcik] = useState(false)
  const [yeni, setYeni] = useState({ makbuz_no: '', makbuz_tarihi: '', tutar: '', kdv: '', kdv_orani: '', alici_unvan: '', alici_vkn: '', url: '', durum: 'kayitli' })

  const yukle = async () => {
    setYukleniyor(true)
    try {
      let q = supabase.from('esmm_gecmisi').select('*').eq('office_id', 1).order('makbuz_tarihi', { ascending: false })
      if (seciliMusteri) q = q.eq('client_id', seciliMusteri)
      const { data } = await q
      setKayitlar(data || [])
    } catch (e) { console.error(e) }
    finally { setYukleniyor(false) }
  }
  useEffect(() => { yukle() }, [seciliMusteri])

  const handleEkle = async () => {
    if (!seciliMusteri || !yeni.makbuz_tarihi) return
    try {
      const { error } = await supabase.from('esmm_gecmisi').insert({
        office_id: 1, client_id: seciliMusteri, makbuz_no: yeni.makbuz_no || null,
        makbuz_tarihi: yeni.makbuz_tarihi, tutar: parseFloat(yeni.tutar) || null,
        kdv: parseFloat(yeni.kdv) || null, kdv_orani: parseInt(yeni.kdv_orani) || null,
        alici_unvan: yeni.alici_unvan || null, alici_vkn: yeni.alici_vkn || null,
        url: yeni.url || null, durum: yeni.durum || 'kayitli'
      })
      if (error) throw error
      setFormAcik(false)
      setYeni({ makbuz_no: '', makbuz_tarihi: '', tutar: '', kdv: '', kdv_orani: '', alici_unvan: '', alici_vkn: '', url: '', durum: 'kayitli' })
      yukle()
    } catch (e) { console.error(e) }
  }

  const handleSil = async (id) => {
    if (!confirm('Silmek istediğinize emin misiniz?')) return
    await supabase.from('esmm_gecmisi').delete().eq('id', id)
    yukle()
  }

  const toplamTutar = kayitlar.reduce((s, k) => s + Number(k.tutar || 0), 0)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6 text-white">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">E-SMM Geçmişi</h1>
          <p className="mt-2 text-blue-100/70 text-sm">E-SMM makbuzlarının takibi ve yönetimi.</p>
        </div>
        <button onClick={() => setFormAcik(v => !v)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500">
          <Plus className="w-4 h-4" /> Yeni Makbuz
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
          <h2 className="font-semibold">Yeni E-SMM Makbuzu</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input placeholder="Makbuz No" value={yeni.makbuz_no} onChange={e => setYeni(p => ({ ...p, makbuz_no: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input type="date" value={yeni.makbuz_tarihi} onChange={e => setYeni(p => ({ ...p, makbuz_tarihi: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input type="number" placeholder="Tutar" value={yeni.tutar} onChange={e => setYeni(p => ({ ...p, tutar: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input type="number" placeholder="KDV" value={yeni.kdv} onChange={e => setYeni(p => ({ ...p, kdv: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input type="number" placeholder="KDV Oranı (%)" value={yeni.kdv_orani} onChange={e => setYeni(p => ({ ...p, kdv_orani: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input placeholder="Alıcı Ünvan" value={yeni.alici_unvan} onChange={e => setYeni(p => ({ ...p, alici_unvan: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input placeholder="Alıcı VKN" value={yeni.alici_vkn} onChange={e => setYeni(p => ({ ...p, alici_vkn: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input placeholder="Dosya URL" value={yeni.url} onChange={e => setYeni(p => ({ ...p, url: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <select value={yeni.durum} onChange={e => setYeni(p => ({ ...p, durum: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm">
              <option value="kayitli">Kayıtlı</option><option value="iptal">İptal</option><option value="gonderildi">Gönderildi</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={handleEkle} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium">Kaydet</button>
            <button onClick={() => setFormAcik(false)} className="bg-blue-700/50 hover:bg-blue-600/50 text-white px-4 py-2 rounded-lg text-sm font-medium">İptal</button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-4 text-center">
        <p className="text-2xl font-bold text-blue-400">{toplamTutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</p>
        <p className="text-xs text-blue-100/60">Toplam E-SMM Tutarı</p>
      </div>

      <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-blue-900/40 text-blue-300 text-xs">
            <tr><th className="text-left px-4 py-3">Makbuz No</th><th className="text-left px-4 py-3">Tarih</th><th className="text-left px-4 py-3">Müşteri</th><th className="text-right px-4 py-3">Tutar</th><th className="text-right px-4 py-3">KDV</th><th className="text-left px-4 py-3">Alıcı</th><th className="text-left px-4 py-3">Durum</th><th className="text-left px-4 py-3">İşlem</th></tr>
          </thead>
          <tbody>
            {kayitlar.map(k => (
              <tr key={k.id} className="border-t border-blue-400/10 hover:bg-blue-800/20">
                <td className="px-4 py-3 font-medium">{k.makbuz_no || '-'}</td>
                <td className="px-4 py-3">{k.makbuz_tarihi ? new Date(k.makbuz_tarihi).toLocaleDateString('tr-TR') : '-'}</td>
                <td className="px-4 py-3">{k.client_id ? (clients?.find(c => c.id === k.client_id)?.name || `#${k.client_id}`) : '-'}</td>
                <td className="px-4 py-3 text-right">{Number(k.tutar || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-right">{Number(k.kdv || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3">{k.alici_unvan || '-'}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs ${k.durum === 'iptal' ? 'bg-red-500/20 text-red-300' : k.durum === 'gonderildi' ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-500/20 text-emerald-300'}`}>{k.durum}</span></td>
                <td className="px-4 py-3">
                  <button onClick={() => handleSil(k.id)} className="p-1.5 rounded hover:bg-red-500/20 text-red-400"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
            {kayitlar.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-blue-100/60">Henüz kayıt yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}