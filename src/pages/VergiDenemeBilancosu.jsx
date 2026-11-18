import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import { supabase } from '../lib/supabase'
import { FileText, Plus, Trash2, RefreshCw, Loader2, CheckCircle } from 'lucide-react'

export default function VergiDenemeBilancosu() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/giris" replace />
  if (!['admin', 'super_admin', 'personel'].includes(user.role)) return <Navigate to="/portal" replace />

  const { clients } = useClients()
  const [seciliMusteri, setSeciliMusteri] = useState(null)
  const [yil, setYil] = useState(new Date().getFullYear())
  const [kayitlar, setKayitlar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(false)
  const [formAcik, setFormAcik] = useState(false)
  const [yeni, setYeni] = useState({ donem: '', ay: 1, aktif_toplam: '', pasif_toplam: '', gelir_toplam: '', gider_toplam: '', vergi_matrahi: '', hesaplanan_vergi: '', durum: 'taslak' })

  const yukle = async () => {
    setYukleniyor(true)
    try {
      let q = supabase.from('vergi_deneme_bilancosu').select('*').eq('office_id', 1).eq('yil', yil).order('ay', { ascending: true })
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
      const { error } = await supabase.from('vergi_deneme_bilancosu').insert({
        office_id: 1, client_id: seciliMusteri, donem: yeni.donem, yil, ay: yeni.ay || null,
        aktif_toplam: parseFloat(yeni.aktif_toplam) || null, pasif_toplam: parseFloat(yeni.pasif_toplam) || null,
        gelir_toplam: parseFloat(yeni.gelir_toplam) || null, gider_toplam: parseFloat(yeni.gider_toplam) || null,
        vergi_matrahi: parseFloat(yeni.vergi_matrahi) || null, hesaplanan_vergi: parseFloat(yeni.hesaplanan_vergi) || null,
        durum: yeni.durum || 'taslak'
      })
      if (error) throw error
      setFormAcik(false)
      setYeni({ donem: '', ay: 1, aktif_toplam: '', pasif_toplam: '', gelir_toplam: '', gider_toplam: '', vergi_matrahi: '', hesaplanan_vergi: '', durum: 'taslak' })
      yukle()
    } catch (e) { console.error(e) }
  }

  const handleSil = async (id) => {
    if (!confirm('Silmek istediğinize emin misiniz?')) return
    await supabase.from('vergi_deneme_bilancosu').delete().eq('id', id)
    yukle()
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6 text-white">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Vergi Deneme Bilançosu</h1>
          <p className="mt-2 text-blue-100/70 text-sm">Dönem sonu vergi deneme bilançosu. Aktif/pasif ve gelir/gider toplamları.</p>
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
          <h2 className="font-semibold">Yeni Vergi Deneme Bilançosu</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input placeholder="Dönem (ör: 2026-Q1)" value={yeni.donem} onChange={e => setYeni(p => ({ ...p, donem: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <select value={yeni.ay} onChange={e => setYeni(p => ({ ...p, ay: Number(e.target.value) }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm">
              {['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'].map((a, i) => <option key={a} value={i + 1}>{a}</option>)}
            </select>
            <input type="number" placeholder="Aktif Toplam" value={yeni.aktif_toplam} onChange={e => setYeni(p => ({ ...p, aktif_toplam: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input type="number" placeholder="Pasif Toplam" value={yeni.pasif_toplam} onChange={e => setYeni(p => ({ ...p, pasif_toplam: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input type="number" placeholder="Gelir Toplam" value={yeni.gelir_toplam} onChange={e => setYeni(p => ({ ...p, gelir_toplam: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input type="number" placeholder="Gider Toplam" value={yeni.gider_toplam} onChange={e => setYeni(p => ({ ...p, gider_toplam: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input type="number" placeholder="Vergi Matrahı" value={yeni.vergi_matrahi} onChange={e => setYeni(p => ({ ...p, vergi_matrahi: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input type="number" placeholder="Hesaplanan Vergi" value={yeni.hesaplanan_vergi} onChange={e => setYeni(p => ({ ...p, hesaplanan_vergi: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
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
            <tr><th className="text-left px-4 py-3">Dönem</th><th className="text-left px-4 py-3">Ay</th><th className="text-right px-4 py-3">Aktif</th><th className="text-right px-4 py-3">Pasif</th><th className="text-right px-4 py-3">Gelir</th><th className="text-right px-4 py-3">Gider</th><th className="text-right px-4 py-3">Vergi Matrahı</th><th className="text-right px-4 py-3">Hesaplanan Vergi</th><th className="text-left px-4 py-3">Durum</th><th className="text-left px-4 py-3">İşlem</th></tr>
          </thead>
          <tbody>
            {kayitlar.map(k => (
              <tr key={k.id} className="border-t border-blue-400/10 hover:bg-blue-800/20">
                <td className="px-4 py-3 font-medium">{k.donem}</td>
                <td className="px-4 py-3">{k.ay ? ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'][k.ay - 1] : '-'}</td>
                <td className="px-4 py-3 text-right">{Number(k.aktif_toplam || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-right">{Number(k.pasif_toplam || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-right">{Number(k.gelir_toplam || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-right">{Number(k.gider_toplam || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-right">{Number(k.vergi_matrahi || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-right">{Number(k.hesaplanan_vergi || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs ${k.durum === 'onaylandi' ? 'bg-emerald-500/20 text-emerald-300' : k.durum === 'tamamlandi' ? 'bg-blue-500/20 text-blue-300' : 'bg-amber-500/20 text-amber-300'}`}>{k.durum}</span></td>
                <td className="px-4 py-3">
                  <button onClick={() => handleSil(k.id)} className="p-1.5 rounded hover:bg-red-500/20 text-red-400"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
            {kayitlar.length === 0 && <tr><td colSpan={10} className="px-4 py-6 text-center text-blue-100/60">Henüz kayıt yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}