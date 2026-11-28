import { useEffect, useState, useCallback } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import { clientDisplayName, sortClients } from '../utils/clientDisplay'
import { supabase } from '../lib/supabase'
import { FileText, AlertTriangle, CheckCircle, XCircle, RefreshCw, Loader2, ChevronDown, ChevronUp, Download } from 'lucide-react'

// KDV Muavin Kontrol: Beyanname KDV tutarları ile fatura defteri KDV tutarlarını karşılaştırır
export default function KdvMuavinKontrol() {
  const { user, office } = useAuth()
  if (!user) return <Navigate to="/giris" replace />
  if (!['admin', 'super_admin', 'personel'].includes(user.role)) return <Navigate to="/portal" replace />

  const { clients } = useClients()
  const [seciliMusteri, setSeciliMusteri] = useState(null)
  const [yil, setYil] = useState(new Date().getFullYear())
  const [sonuclar, setSonuclar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(false)
  const [acikSatirlar, setAcikSatirlar] = useState({})

  const kontrolEt = useCallback(async () => {
    if (!seciliMusteri) return
    setYukleniyor(true)
    try {
      const client = clients.find(c => c.id === seciliMusteri)
      if (!client) return

      // 1) Faturalardan KDV defteri tutarlarını hesapla (ay bazında)
      const { data: faturalar } = await supabase
        .from('efatura_faturalar')
        .select('tarih, yon, tur, matrah, kdv, tutar, para_birimi')
        .eq('client_id', seciliMusteri)

      const defterKdv = {} // { '2026-01': { alisKdv, satisKdv } }
      for (const f of (faturalar || [])) {
        if (!f.tarih) continue
        const key = String(f.tarih).substring(0, 7) // YYYY-MM
        if (!defterKdv[key]) defterKdv[key] = { alisKdv: 0, satisKdv: 0, alisMatrah: 0, satisMatrah: 0 }
        const kdv = Number(f.kdv) || 0
        const matrah = Number(f.matrah) || 0
        const yon = (f.yon || '').toLowerCase()
        if (yon.includes('gelen') || yon.includes('alis')) {
          defterKdv[key].alisKdv += kdv
          defterKdv[key].alisMatrah += matrah
        } else {
          defterKdv[key].satisKdv += kdv
          defterKdv[key].satisMatrah += matrah
        }
      }

      // 2) Beyanname KDV tutarlarını al (beyan_durumlari'dan)
      const dm = client.beyanDurumlari || client.beyan_durumlari || {}
      const beyanKdv = {} // { '2026-01': { kdv, kdv2 } }
      for (const [key, val] of Object.entries(dm)) {
        const m = key.match(/^(\d{4})_(\d{1,2})_(kdv|kdv2)$/)
        if (!m) continue
        const yil = m[1]
        const ay = String(parseInt(m[2]) + 1).padStart(2, '0') // 0-tabanlı → 1-tabanlı
        const tip = m[3]
        const periodKey = `${yil}-${ay}`
        if (!beyanKdv[periodKey]) beyanKdv[periodKey] = { kdv: null, kdv2: null }
        const tutar = Number(dm[`${key}_kdv`] || dm[`${key}_tutar`] || val) || 0
        if (tip === 'kdv') beyanKdv[periodKey].kdv = tutar
        else if (tip === 'kdv2') beyanKdv[periodKey].kdv2 = tutar
      }

      // 3) Karşılaştır
      const tumAylar = new Set([...Object.keys(defterKdv), ...Object.keys(beyanKdv)])
      const sonuc = []
      for (const ay of [...tumAylar].sort()) {
        if (!ay.startsWith(String(yil))) continue
        const d = defterKdv[ay] || { alisKdv: 0, satisKdv: 0, alisMatrah: 0, satisMatrah: 0 }
        const b = beyanKdv[ay] || { kdv: null, kdv2: null }
        const defterNetKdv = d.satisKdv - d.alisKdv
        const beyanKdvVal = b.kdv
        const fark = beyanKdvVal != null ? Math.abs(defterNetKdv - beyanKdvVal) : null
        const uyumlu = fark != null && fark < 0.02
        sonuc.push({
          ay, defterNetKdv, defterAlisKdv: d.alisKdv, defterSatisKdv: d.satisKdv,
          defterAlisMatrah: d.alisMatrah, defterSatisMatrah: d.satisMatrah,
          beyanKdv: beyanKdvVal, beyanKdv2: b.kdv2, fark, uyumlu,
          durum: beyanKdvVal == null ? 'beyan-yok' : uyumlu ? 'uyumlu' : 'uyumsuz',
        })
      }
      setSonuclar(sonuc)
    } catch (e) {
      console.error('KDV Muavin kontrol hatası:', e)
    } finally {
      setYukleniyor(false)
    }
  }, [seciliMusteri, clients, yil])

  const toplamFark = sonuclar.reduce((s, r) => s + (r.fark || 0), 0)
  const uyumsuzSayisi = sonuclar.filter(r => r.durum === 'uyumsuz').length
  const beyanYokSayisi = sonuclar.filter(r => r.durum === 'beyan-yok').length

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6 text-white">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">KDV Muavin Kontrol</h1>
        <p className="mt-2 text-blue-100/70 text-sm">Beyanname KDV tutarları ile fatura defteri KDV tutarlarını karşılaştırır. Uyumsuzluklar kırmızı ile işaretlenir.</p>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-sm text-blue-300 block mb-1">Müşteri</label>
          <select value={seciliMusteri || ''} onChange={e => setSeciliMusteri(e.target.value ? Number(e.target.value) : null)} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm">
            <option value="">Seçin...</option>
            {sortClients(clients).map(c => <option key={c.id} value={c.id}>{clientDisplayName(c)}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm text-blue-300 block mb-1">Yıl</label>
          <select value={yil} onChange={e => setYil(Number(e.target.value))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm">
            {[2023, 2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={kontrolEt} disabled={!seciliMusteri || yukleniyor} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2">
          {yukleniyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Kontrol Et
        </button>
      </div>

      {sonuclar.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-4 text-center">
              <p className="text-2xl font-bold text-blue-400">{sonuclar.length}</p>
              <p className="text-xs text-blue-100/60">Dönem</p>
            </div>
            <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-4 text-center">
              <p className={`text-2xl font-bold ${uyumsuzSayisi > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{uyumsuzSayisi}</p>
              <p className="text-xs text-blue-100/60">Uyumsuz</p>
            </div>
            <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-4 text-center">
              <p className={`text-2xl font-bold ${toplamFark > 0.02 ? 'text-amber-400' : 'text-emerald-400'}`}>{toplamFark.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
              <p className="text-xs text-blue-100/60">Toplam Fark (₺)</p>
            </div>
          </div>

          <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-blue-900/40 text-blue-300 text-xs">
                <tr>
                  <th className="text-left px-4 py-3">Dönem</th>
                  <th className="text-right px-4 py-3">Defter Net KDV</th>
                  <th className="text-right px-4 py-3">Beyan KDV</th>
                  <th className="text-right px-4 py-3">Fark</th>
                  <th className="text-center px-4 py-3">Durum</th>
                </tr>
              </thead>
              <tbody>
                {sonuclar.map(r => (
                  <tr key={r.ay} className={`border-t border-blue-400/10 ${r.durum === 'uyumsuz' ? 'bg-red-500/5' : ''}`}>
                    <td className="px-4 py-3 font-medium">{r.ay}</td>
                    <td className="px-4 py-3 text-right">{r.defterNetKdv.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-right">{r.beyanKdv != null ? r.beyanKdv.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}</td>
                    <td className={`px-4 py-3 text-right font-bold ${r.fark != null && r.fark > 0.02 ? 'text-red-400' : 'text-emerald-400'}`}>{r.fark != null ? r.fark.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}</td>
                    <td className="px-4 py-3 text-center">
                      {r.durum === 'uyumlu' && <span className="inline-flex items-center gap-1 text-emerald-400 text-xs"><CheckCircle className="w-3.5 h-3.5" /> Uyumlu</span>}
                      {r.durum === 'uyumsuz' && <span className="inline-flex items-center gap-1 text-red-400 text-xs"><XCircle className="w-3.5 h-3.5" /> Uyumsuz</span>}
                      {r.durum === 'beyan-yok' && <span className="inline-flex items-center gap-1 text-amber-400 text-xs"><AlertTriangle className="w-3.5 h-3.5" /> Beyan Yok</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {beyanYokSayisi > 0 && <p className="text-amber-300 text-sm">⚠ {beyanYokSayisi} dönem için beyan kaydı bulunamadı.</p>}
          {uyumsuzSayisi > 0 && <p className="text-red-300 text-sm">⚠ {uyumsuzSayisi} dönem için KDV uyumsuzluğu tespit edildi. Detay için satıra tıklayın.</p>}
        </>
      )}
    </div>
  )
}