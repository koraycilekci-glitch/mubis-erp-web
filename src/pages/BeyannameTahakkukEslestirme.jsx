import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, RefreshCw, Loader2, CheckCircle, XCircle } from 'lucide-react'

export default function BeyannameTahakkukEslestirme() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/giris" replace />
  if (!['admin', 'super_admin', 'personel'].includes(user.role)) return <Navigate to="/portal" replace />
  const { clients } = useClients()
  const [seciliMusteri, setSeciliMusteri] = useState(null)
  const [yil, setYil] = useState(new Date().getFullYear())
  const [ay, setAy] = useState(new Date().getMonth() + 1)
  const [kayitlar, setKayitlar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(false)
  const [formAcik, setFormAcik] = useState(false)
  const [yeni, setYeni] = useState({ beyan_turu: 'kdv', beyan_tutar: '', tahakkuk_tutar: '', aciklama: '' })

  const yukle = async () => {
    setYukleniyor(true)
    try {
      let q = supabase.from('beyanname_tahakkuk_eslestirme').select('*').eq('office_id', 1).eq('yil', yil).order('ay', { ascending: true })
      if (seciliMusteri) q = q.eq('client_id', seciliMusteri)
      if (ay) q = q.eq('ay', ay)
      const { data } = await q
      setKayitlar(data || [])
    } catch (e) { console.error(e) }
    finally { setYukleniyor(false) }
  }
  useEffect(() => { yukle() }, [seciliMusteri, yil, ay])

  const handleEkle = async () => {
    if (!seciliMusteri || !yeni.beyan_turu) return
    const bt = parseFloat(yeni.beyan_tutar) || 0
    const tt = parseFloat(yeni.tahakkuk_tutar) || 0
    const fark = Math.abs(bt - tt)
    try {
      const { error } = await supabase.from('beyanname_tahakkuk_eslestirme').upsert({
        office_id: 1, client_id: seciliMusteri, yil, ay, beyan_turu: yeni.beyan_turu,
        beyan_tutar: bt, tahakkuk_tutar: tt, fark, uyumlu: fark < 0.02,
        aciklama: yeni.aciklama || null
      }, { onConflict: 'office_id,client_id,yil,ay,beyan_turu' })
      if (error) throw error
      setFormAcik(false)
      setYeni({ beyan_turu: 'kdv', beyan_tutar: '', tahakkuk_tutar: '', aciklama: '' })
      yukle()
    } catch (e) { console.error(e) }
  }

  const handleSil = async (id) => {
    if (!confirm('Silmek istediğinize emin misiniz?')) return
    await supabase.from('beyanname_tahakkuk_eslestirme').delete().eq('id', id)
    yukle()
  }

  const uyumsuzSayisi = kayitlar.filter(k => !k.uyumlu).length

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6 text-white">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Beyanname-Tahakkuk Eşleştirme</h1>
          <p className="mt-2 text-blue-100/70 text-sm">Beyanname ile tahakkuk fişlerini eşleştirir. Uyumsuzluklar kırmızı ile işaretlenir.</p>
        </div>
        <button onClick={() => setFormAcik(v => !v)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500">
          <Plus className="w-4 h-4" /> Yeni Eşleştirme
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
        <div>
          <label className="text-sm text-blue-300 block mb-1">Ay</label>
          <select value={ay} onChange={e => setAy(Number(e.target.value))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm">
            {['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'].map((a, i) => <option key={a} value={i + 1}>{a}</option>)}
          </select>
        </div>
      </div>

      {formAcik && (
        <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-5 space-y-3">
          <h2 className="font-semibold">Yeni Eşleştirme</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <select value={yeni.beyan_turu} onChange={e => setYeni(p => ({ ...p, beyan_turu: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm">
              <option value="kdv">KDV</option><option value="kdv2">KDV2</option><option value="muhtasar">Muhtasar</option><option value="sgk">SGK</option><option value="gecici_vergi">Geçici Vergi</option><option value="kurumlar_vergi">Kurumlar Vergisi</option><option value="gelir_vergi">Gelir Vergisi</option>
            </select>
            <input type="number" placeholder="Beyan Tutar" value={yeni.beyan_tutar} onChange={e => setYeni(p => ({ ...p, beyan_tutar: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input type="number" placeholder="Tahakkuk Tutar" value={yeni.tahakkuk_tutar} onChange={e => setYeni(p => ({ ...p, tahakkuk_tutar: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input placeholder="Açıklama" value={yeni.aciklama} onChange={e => setYeni(p => ({ ...p, aciklama: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleEkle} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium">Kaydet</button>
            <button onClick={() => setFormAcik(false)} className="bg-blue-700/50 hover:bg-blue-600/50 text-white px-4 py-2 rounded-lg text-sm font-medium">İptal</button>
          </div>
        </div>
      )}

      {uyumsuzSayisi > 0 && <p className="text-red-300 text-sm">⚠ {uyumsuzSayisi} uyumsuz kayıt tespit edildi.</p>}

      <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-blue-900/40 text-blue-300 text-xs">
            <tr><th className="text-left px-4 py-3">Beyan Türü</th><th className="text-left px-4 py-3">Dönem</th><th className="text-right px-4 py-3">Beyan Tutar</th><th className="text-right px-4 py-3">Tahakkuk Tutar</th><th className="text-right px-4 py-3">Fark</th><th className="text-center px-4 py-3">Durum</th><th className="text-left px-4 py-3">İşlem</th></tr>
          </thead>
          <tbody>
            {kayitlar.map(k => (
              <tr key={k.id} className={`border-t border-blue-400/10 hover:bg-blue-800/20 ${!k.uyumlu ? 'bg-red-500/5' : ''}`}>
                <td className="px-4 py-3 font-medium">{k.beyan_turu}</td>
                <td className="px-4 py-3">{k.yil}-{String(k.ay).padStart(2, '0')}</td>
                <td className="px-4 py-3 text-right">{Number(k.beyan_tutar || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-right">{Number(k.tahakkuk_tutar || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                <td className={`px-4 py-3 text-right font-bold ${Number(k.fark || 0) > 0.02 ? 'text-red-400' : 'text-emerald-400'}`}>{Number(k.fark || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-center">
                  {k.uyumlu ? <span className="inline-flex items-center gap-1 text-emerald-400 text-xs"><CheckCircle className="w-3.5 h-3.5" /> Uyumlu</span> : <span className="inline-flex items-center gap-1 text-red-400 text-xs"><XCircle className="w-3.5 h-3.5" /> Uyumsuz</span>}
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