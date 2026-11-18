import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, RefreshCw, Loader2 } from 'lucide-react'

export default function IsletmeGiderleri() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/giris" replace />
  if (!['admin', 'super_admin', 'personel'].includes(user.role)) return <Navigate to="/portal" replace />
  const { clients } = useClients()
  const [seciliMusteri, setSeciliMusteri] = useState(null)
  const [kayitlar, setKayitlar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(false)
  const [formAcik, setFormAcik] = useState(false)
  const [yeni, setYeni] = useState({ gider_turu: 'kirtasiye', aciklama: '', tutar: '', tarih: '', kdv_orani: '', kdv_tutari: '', url: '', durum: 'bekliyor' })

  const yukle = async () => {
    setYukleniyor(true)
    try {
      let q = supabase.from('isletme_giderleri').select('*').eq('office_id', 1).order('tarih', { ascending: false })
      if (seciliMusteri) q = q.eq('client_id', seciliMusteri)
      const { data } = await q
      setKayitlar(data || [])
    } catch (e) { console.error(e) }
    finally { setYukleniyor(false) }
  }
  useEffect(() => { yukle() }, [seciliMusteri])

  const handleEkle = async () => {
    if (!yeni.gider_turu || !yeni.tutar) return
    try {
      const { error } = await supabase.from('isletme_giderleri').insert({
        office_id: 1, client_id: seciliMusteri || null, gider_turu: yeni.gider_turu,
        aciklama: yeni.aciklama || null, tutar: parseFloat(yeni.tutar) || null,
        tarih: yeni.tarih || null, kdv_orani: parseInt(yeni.kdv_orani) || null,
        kdv_tutari: parseFloat(yeni.kdv_tutari) || null, url: yeni.url || null, durum: yeni.durum || 'bekliyor'
      })
      if (error) throw error
      setFormAcik(false)
      setYeni({ gider_turu: 'kirtasiye', aciklama: '', tutar: '', tarih: '', kdv_orani: '', kdv_tutari: '', url: '', durum: 'bekliyor' })
      yukle()
    } catch (e) { console.error(e) }
  }

  const handleSil = async (id) => {
    if (!confirm('Silmek istediğinize emin misiniz?')) return
    await supabase.from('isletme_giderleri').delete().eq('id', id)
    yukle()
  }

  const handleDurum = async (id, durum) => {
    await supabase.from('isletme_giderleri').update({ durum }).eq('id', id)
    yukle()
  }

  const giderTurleri = { kirtasiye: 'Kırtasiye', yakit: 'Yakıt', telefon: 'Telefon', internet: 'İnternet', kira: 'Kira', diger: 'Diğer' }
  const toplamTutar = kayitlar.reduce((s, k) => s + Number(k.tutar || 0), 0)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6 text-white">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">İşletme Giderleri Takibi</h1>
          <p className="mt-2 text-blue-100/70 text-sm">İşletme giderlerinin (kırtasiye, yakıt, telefon, internet, kira vb.) takibi.</p>
        </div>
        <button onClick={() => setFormAcik(v => !v)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500">
          <Plus className="w-4 h-4" /> Yeni Gider
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
      </div>

      {formAcik && (
        <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-5 space-y-3">
          <h2 className="font-semibold">Yeni İşletme Gideri</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <select value={yeni.gider_turu} onChange={e => setYeni(p => ({ ...p, gider_turu: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm">
              <option value="kirtasiye">Kırtasiye</option><option value="yakit">Yakıt</option><option value="telefon">Telefon</option><option value="internet">İnternet</option><option value="kira">Kira</option><option value="diger">Diğer</option>
            </select>
            <input placeholder="Açıklama" value={yeni.aciklama} onChange={e => setYeni(p => ({ ...p, aciklama: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input type="number" placeholder="Tutar" value={yeni.tutar} onChange={e => setYeni(p => ({ ...p, tutar: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input type="date" value={yeni.tarih} onChange={e => setYeni(p => ({ ...p, tarih: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input type="number" placeholder="KDV Oranı (%)" value={yeni.kdv_orani} onChange={e => setYeni(p => ({ ...p, kdv_orani: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input type="number" placeholder="KDV Tutarı" value={yeni.kdv_tutari} onChange={e => setYeni(p => ({ ...p, kdv_tutari: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input placeholder="Dosya URL" value={yeni.url} onChange={e => setYeni(p => ({ ...p, url: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm sm:col-span-2" />
            <select value={yeni.durum} onChange={e => setYeni(p => ({ ...p, durum: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm">
              <option value="bekliyor">Bekliyor</option><option value="onaylandi">Onaylandı</option><option value="reddedildi">Reddedildi</option>
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
        <p className="text-xs text-blue-100/60">Toplam İşletme Gideri</p>
      </div>

      <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-blue-900/40 text-blue-300 text-xs">
            <tr><th className="text-left px-4 py-3">Gider Türü</th><th className="text-left px-4 py-3">Açıklama</th><th className="text-left px-4 py-3">Müşteri</th><th className="text-right px-4 py-3">Tutar</th><th className="text-left px-4 py-3">Tarih</th><th className="text-left px-4 py-3">Durum</th><th className="text-left px-4 py-3">İşlem</th></tr>
          </thead>
          <tbody>
            {kayitlar.map(k => (
              <tr key={k.id} className="border-t border-blue-400/10 hover:bg-blue-800/20">
                <td className="px-4 py-3 font-medium">{giderTurleri[k.gider_turu] || k.gider_turu}</td>
                <td className="px-4 py-3">{k.aciklama || '-'}</td>
                <td className="px-4 py-3">{k.client_id ? (clients?.find(c => c.id === k.client_id)?.name || `#${k.client_id}`) : '-'}</td>
                <td className="px-4 py-3 text-right">{Number(k.tutar || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3">{k.tarih ? new Date(k.tarih).toLocaleDateString('tr-TR') : '-'}</td>
                <td className="px-4 py-3">
                  <select value={k.durum} onChange={e => handleDurum(k.id, e.target.value)} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-2 py-1 text-white text-xs">
                    <option value="bekliyor">Bekliyor</option><option value="onaylandi">Onaylandı</option><option value="reddedildi">Reddedildi</option>
                  </select>
                </td>
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