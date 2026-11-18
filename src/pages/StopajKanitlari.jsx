import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, RefreshCw, Loader2, CheckCircle, XCircle } from 'lucide-react'

export default function StopajKanitlari() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/giris" replace />
  if (!['admin', 'super_admin', 'personel'].includes(user.role)) return <Navigate to="/portal" replace />
  const { clients } = useClients()
  const [seciliMusteri, setSeciliMusteri] = useState(null)
  const [yil, setYil] = useState(new Date().getFullYear())
  const [kayitlar, setKayitlar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(false)
  const [formAcik, setFormAcik] = useState(false)
  const [yeni, setYeni] = useState({ stopaj_turu: 'kira_stopaji', kanit_turu: 'banka_dekontu', tutar: '', tarih: '', url: '', durum: 'bekliyor' })

  const yukle = async () => {
    setYukleniyor(true)
    try {
      let q = supabase.from('stopaj_kanitlari').select('*').eq('office_id', 1).eq('yil', yil).order('tarih', { ascending: false })
      if (seciliMusteri) q = q.eq('client_id', seciliMusteri)
      const { data } = await q
      setKayitlar(data || [])
    } catch (e) { console.error(e) }
    finally { setYukleniyor(false) }
  }
  useEffect(() => { yukle() }, [seciliMusteri, yil])

  const handleEkle = async () => {
    if (!seciliMusteri || !yeni.stopaj_turu || !yeni.tutar) return
    try {
      const { error } = await supabase.from('stopaj_kanitlari').insert({
        office_id: 1, client_id: seciliMusteri, yil, stopaj_turu: yeni.stopaj_turu,
        kanit_turu: yeni.kanit_turu, tutar: parseFloat(yeni.tutar) || null,
        tarih: yeni.tarih || null, url: yeni.url || null, durum: yeni.durum || 'bekliyor'
      })
      if (error) throw error
      setFormAcik(false)
      setYeni({ stopaj_turu: 'kira_stopaji', kanit_turu: 'banka_dekontu', tutar: '', tarih: '', url: '', durum: 'bekliyor' })
      yukle()
    } catch (e) { console.error(e) }
  }

  const handleSil = async (id) => {
    if (!confirm('Silmek istediğinize emin misiniz?')) return
    await supabase.from('stopaj_kanitlari').delete().eq('id', id)
    yukle()
  }

  const handleDurum = async (id, durum) => {
    await supabase.from('stopaj_kanitlari').update({ durum }).eq('id', id)
    yukle()
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6 text-white">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Stopaj/Tevkifat Kanıtları</h1>
          <p className="mt-2 text-blue-100/70 text-sm">Stopaj ve tevkifat belgelerinin toplanması ve doğrulanması.</p>
        </div>
        <button onClick={() => setFormAcik(v => !v)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500">
          <Plus className="w-4 h-4" /> Yeni Kanıt
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
          <h2 className="font-semibold">Yeni Stopaj/Tevkifat Kanıtı</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <select value={yeni.stopaj_turu} onChange={e => setYeni(p => ({ ...p, stopaj_turu: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm">
              <option value="kira_stopaji">Kira Stopajı</option><option value="serbest_meslek">Serbest Meslek</option><option value="diger">Diğer</option>
            </select>
            <select value={yeni.kanit_turu} onChange={e => setYeni(p => ({ ...p, kanit_turu: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm">
              <option value="banka_dekontu">Banka Dekontu</option><option value="makbuz">Makbuz</option><option value="diger">Diğer</option>
            </select>
            <input type="number" placeholder="Tutar" value={yeni.tutar} onChange={e => setYeni(p => ({ ...p, tutar: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input type="date" value={yeni.tarih} onChange={e => setYeni(p => ({ ...p, tarih: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
            <input placeholder="Dosya URL" value={yeni.url} onChange={e => setYeni(p => ({ ...p, url: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm sm:col-span-2" />
            <select value={yeni.durum} onChange={e => setYeni(p => ({ ...p, durum: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm">
              <option value="bekliyor">Bekliyor</option><option value="dogrulandi">Doğrulandı</option><option value="reddedildi">Reddedildi</option>
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
            <tr><th className="text-left px-4 py-3">Stopaj Türü</th><th className="text-left px-4 py-3">Kanıt Türü</th><th className="text-left px-4 py-3">Ay</th><th className="text-right px-4 py-3">Tutar</th><th className="text-left px-4 py-3">Tarih</th><th className="text-left px-4 py-3">Durum</th><th className="text-left px-4 py-3">İşlem</th></tr>
          </thead>
          <tbody>
            {kayitlar.map(k => (
              <tr key={k.id} className="border-t border-blue-400/10 hover:bg-blue-800/20">
                <td className="px-4 py-3 font-medium">{k.stopaj_turu}</td>
                <td className="px-4 py-3">{k.kanit_turu}</td>
                <td className="px-4 py-3">{k.ay || '-'}</td>
                <td className="px-4 py-3 text-right">{Number(k.tutar || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3">{k.tarih ? new Date(k.tarih).toLocaleDateString('tr-TR') : '-'}</td>
                <td className="px-4 py-3">
                  <select value={k.durum} onChange={e => handleDurum(k.id, e.target.value)} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-2 py-1 text-white text-xs">
                    <option value="bekliyor">Bekliyor</option><option value="dogrulandi">Doğrulandı</option><option value="reddedildi">Reddedildi</option>
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