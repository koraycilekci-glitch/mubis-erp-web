import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import { supabase } from '../lib/supabase'
import { FileText, Plus, Trash2, RefreshCw, Loader2, CheckCircle, Download, Upload } from 'lucide-react'

export default function TopluBelgeIslemleri() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/giris" replace />
  if (!['admin', 'super_admin', 'personel'].includes(user.role)) return <Navigate to="/portal" replace />

  const { clients } = useClients()
  const [seciliMusteri, setSeciliMusteri] = useState(null)
  const [islemler, setIslemler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(false)
  const [formAcik, setFormAcik] = useState(false)
  const [yeni, setYeni] = useState({ islem_tipi: 'indirme', dosya_listesi: [], durum: 'bekliyor' })

  const yukle = async () => {
    setYukleniyor(true)
    try {
      let q = supabase.from('toplu_belge_islemleri').select('*').eq('office_id', 1).order('olusturma_ts', { ascending: false })
      if (seciliMusteri) q = q.eq('client_id', seciliMusteri)
      const { data } = await q
      setIslemler(data || [])
    } catch (e) { console.error(e) }
    finally { setYukleniyor(false) }
  }
  useEffect(() => { yukle() }, [seciliMusteri])

  const handleEkle = async () => {
    if (!yeni.islem_tipi) return
    try {
      const { error } = await supabase.from('toplu_belge_islemleri').insert({
        office_id: 1, client_id: seciliMusteri || null, islem_tipi: yeni.islem_tipi,
        dosya_listesi: yeni.dosya_listesi.length ? yeni.dosya_listesi : null,
        durum: 'bekliyor', toplam_sayisi: yeni.dosya_listesi.length || 0
      })
      if (error) throw error
      setFormAcik(false)
      setYeni({ islem_tipi: 'indirme', dosya_listesi: [], durum: 'bekliyor' })
      yukle()
    } catch (e) { console.error(e) }
  }

  const handleSil = async (id) => {
    if (!confirm('Silmek istediğinize emin misiniz?')) return
    await supabase.from('toplu_belge_islemleri').delete().eq('id', id)
    yukle()
  }

  const tipEtiket = { indirme: 'İndirme', yukleme: 'Yükleme', paylasma: 'Paylaşma', arsiv: 'Arşiv' }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6 text-white">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Toplu Belge İşlemleri</h1>
          <p className="mt-2 text-blue-100/70 text-sm">Birden fazla belgeyi seçip toplu indirme, yükleme, paylaşma veya arşivleme.</p>
        </div>
        <button onClick={() => setFormAcik(v => !v)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500">
          <Plus className="w-4 h-4" /> Yeni İşlem
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
          <h2 className="font-semibold">Yeni Toplu İşlem</h2>
          <select value={yeni.islem_tipi} onChange={e => setYeni(p => ({ ...p, islem_tipi: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm">
            <option value="indirme">İndirme</option><option value="yukleme">Yükleme</option><option value="paylasma">Paylaşma</option><option value="arsiv">Arşiv</option>
          </select>
          <div className="flex gap-2">
            <button onClick={handleEkle} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium">Kaydet</button>
            <button onClick={() => setFormAcik(false)} className="bg-blue-700/50 hover:bg-blue-600/50 text-white px-4 py-2 rounded-lg text-sm font-medium">İptal</button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-blue-900/40 text-blue-300 text-xs">
            <tr><th className="text-left px-4 py-3">İşlem Tipi</th><th className="text-left px-4 py-3">Durum</th><th className="text-left px-4 py-3">İşlenen/Toplam</th><th className="text-left px-4 py-3">Oluşturma</th><th className="text-left px-4 py-3">İşlem</th></tr>
          </thead>
          <tbody>
            {islemler.map(i => (
              <tr key={i.id} className="border-t border-blue-400/10 hover:bg-blue-800/20">
                <td className="px-4 py-3 font-medium">{tipEtiket[i.islem_tipi] || i.islem_tipi}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs ${i.durum === 'tamamlandi' ? 'bg-emerald-500/20 text-emerald-300' : i.durum === 'hata' ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'}`}>{i.durum}</span></td>
                <td className="px-4 py-3">{i.islenen_sayisi || 0}/{i.toplam_sayisi || 0}</td>
                <td className="px-4 py-3 text-xs text-blue-100/60">{new Date(i.olusturma_ts).toLocaleString('tr-TR')}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleSil(i.id)} className="p-1.5 rounded hover:bg-red-500/20 text-red-400"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
            {islemler.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-blue-100/60">Henüz işlem yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}