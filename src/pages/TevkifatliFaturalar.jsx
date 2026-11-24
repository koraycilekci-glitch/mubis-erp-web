import { useState, useEffect, useMemo, useRef } from 'react'
import { Eye, Download } from 'lucide-react'
import { useClients } from '../hooks/useClients'
import { supabase } from '../lib/supabase'
import { formatDateTR } from '../utils/dateUtils'
import { tevkifatMi, iadeMi } from '../services/tevkifatService'
import { karsiTarafOnar, kdv2AktifEtGerekirse } from '../services/efaturaService'

const YILLAR = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i)
const AYLAR = [
  { v: 0, l: 'Tümü' },
  { v: 1, l: 'Ocak' }, { v: 2, l: 'Şubat' }, { v: 3, l: 'Mart' },
  { v: 4, l: 'Nisan' }, { v: 5, l: 'Mayıs' }, { v: 6, l: 'Haziran' },
  { v: 7, l: 'Temmuz' }, { v: 8, l: 'Ağustos' }, { v: 9, l: 'Eylül' },
  { v: 10, l: 'Ekim' }, { v: 11, l: 'Kasım' }, { v: 12, l: 'Aralık' },
]

function tarihAraligi(q, yil, ay) {
  if (yil) q = q.gte('tarih', `${yil}-01-01`).lte('tarih', `${yil}-12-31`)
  if (ay) {
    const son = new Date(yil, ay, 0).getDate()
    const ayStr = String(ay).padStart(2, '0')
    q = q.gte('tarih', `${yil}-${ayStr}-01`).lte('tarih', `${yil}-${ayStr}-${son}`)
  }
  return q
}

export default function TevkifatliFaturalar() {
  const { clients } = useClients()
  const [seciliClient, setSeciliClient] = useState('all')
  const [yil, setYil] = useState(new Date().getFullYear())
  const [ay, setAy] = useState(new Date().getMonth() + 1)
  const [alis, setAlis] = useState(true)
  const [satis, setSatis] = useState(true)
  const [iade, setIade] = useState(false)
  const [loading, setLoading] = useState(false)
  const [faturalar, setFaturalar] = useState([])
  const [mesaj, setMesaj] = useState('')
  const [tevkifatUyariIds, setTevkifatUyariIds] = useState([]) // tevkifatlı alış faturası olan müşteri id'leri
  const [uttsUnvanMesaj, setUttsUnvanMesaj] = useState('')
  const uttsSorgulananRef = useRef(new Set())

  const yukle = async () => {
    setLoading(true)
    setMesaj('')
    try {
      let q = supabase
        .from('efatura_faturalar')
        .select('id,client_id,yon,tur,fatura_turu,fatura_no,tarih,matrah,kdv,tutar,para_birimi,doviz_kur,karsi_unvan,karsi_vkn')
      q = tarihAraligi(q, yil, ay)
      if (seciliClient !== 'all') q = q.eq('client_id', seciliClient)
      q = q.order('tarih', { ascending: false }).limit(5000)
      let { data, error } = await q
      if (error) throw error
      // Onarım: yön/karşı taraf hatalı kayıtları düzelt (XML'den yeniden okur)
      if (seciliClient !== 'all') {
        try { await karsiTarafOnar(seciliClient, data || []) } catch { /* sessiz */ }
        // Onarım sonrası taze veri çek
        const { data: taze } = await q
        if (taze) data = taze
      }
      // KDV2 otomatik aktifleştirme: tevkifatlı alış faturası olan müşteriler için
      const tevkifatliAlisByClient = {}
      for (const f of (data || [])) {
        const ft = f.fatura_turu || f.tur
        if (!tevkifatMi(ft)) continue
        const yon = String(f.yon || '').toLowerCase()
        if (yon !== 'gelen' && yon !== 'alis' && yon !== 'alinan') continue
        (tevkifatliAlisByClient[f.client_id] = tevkifatliAlisByClient[f.client_id] || []).push(f)
      }
      for (const [cid, fs] of Object.entries(tevkifatliAlisByClient)) {
        const c = (clients || []).find(x => String(x.id) === String(cid))
        if (c) { try { await kdv2AktifEtGerekirse(c, fs) } catch { /* sessiz */ } }
      }
      setTevkifatUyariIds(Object.keys(tevkifatliAlisByClient))
      let liste = data || []
      liste = liste.filter(f => {
        const yon = String(f.yon || '').toLowerCase()
        const faturaTuru = f.fatura_turu || f.tur
        const tev = tevkifatMi(faturaTuru)
        const iadeF = iadeMi(faturaTuru)
        if (iadeF) return iade
        // fatura_turu boş olan kayıtlar da (eski/eksik meta) tevkifat listesinde görünsün
        if (!tev && String(faturaTuru || '').trim() !== '') return false
        if (!alis && !satis) return false
        return true
      })
      setFaturalar(liste)
      if (!liste.length) setMesaj('Seçilen kriterlere uygun fatura bulunamadı.')
      void unvanlariSorgula(liste)
    } catch (e) {
      setMesaj('Yükleme hatası: ' + (e?.message || e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { yukle() }, [seciliClient, yil, ay, alis, satis, iade])

  const musteriAdi = (id) => {
    const c = (clients || []).find(x => String(x.id) === String(id))
    return c ? (c.name || c.company || c.shortName || `#${id}`) : (id ? `#${id}` : '-')
  }
  const karsiTarafAdi = (f) => {
    if (f?.karsi_unvan) return f.karsi_unvan
    const vkn = String(f?.karsi_vkn || '').trim()
    if (vkn) {
      const c = (clients || []).find(x => String(x.vkn || x.tc || '').trim() === vkn)
      if (c) return c.name || c.company || c.shortName || ''
    }
    return ''
  }

  const unvanEksik = (f) => {
    const u = String(f?.karsi_unvan || '').trim()
    if (!u) return true
    if (u === String(f?.karsi_vkn || '').trim()) return true
    if (/^utts$/i.test(u)) return true
    return false
  }

  // Ünvanı eksik TÜM faturalar (UTTS dahil) için VKN'den GİB sorgusu yapıp
  // efatura_faturalar.karsi_unvan alanına yazar. "Tüm Müşteriler" seçiliyken
  // de çalışır (müşteri bazında gruplanır).
  const unvanlariSorgula = async (liste) => {
    const adaylar = (liste || []).filter(f =>
      unvanEksik(f) && /^\d{10,11}$/.test(String(f.karsi_vkn || '').trim())
    )
    if (!adaylar.length) return
    const gruplar = new Map()
    for (const f of adaylar) {
      const cid = String(f.client_id)
      const vkn = String(f.karsi_vkn || '').trim()
      const anahtar = `${cid}:${vkn}`
      if (uttsSorgulananRef.current.has(anahtar)) continue
      uttsSorgulananRef.current.add(anahtar)
      if (!gruplar.has(cid)) gruplar.set(cid, new Set())
      gruplar.get(cid).add(vkn)
    }
    if (!gruplar.size) return
    setUttsUnvanMesaj('Ünvanlar vergi numarasından GİB üzerinden sorgulanıyor...')
    const tumUnvanlar = {}
    let bulunan = 0
    let toplamVkn = 0
    let ilkHata = ''
    try {
      const { data: sess, error: sErr } = await supabase.auth.getSession()
      if (sErr || !sess?.session?.access_token) throw new Error('GİB sorgusu için oturum açın')
      for (const [cid, vknSet] of gruplar) {
        const numaralar = [...vknSet]
        toplamVkn += numaralar.length
        for (let offset = 0; offset < numaralar.length; offset += 10) {
          const grup = numaralar.slice(offset, offset + 10)
          const response = await fetch('/api/vkn-sorgula', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess.session.access_token}` },
            body: JSON.stringify({ clientId: Number(cid), vknler: grup }),
            signal: AbortSignal.timeout(120000)
          })
          const result = await response.json().catch(() => null)
          if (!response.ok || !result?.success || !result.data) {
            const m = result?.error || `HTTP ${response.status}`
            if (!ilkHata) ilkHata = m
            console.warn('[unvan-sorgu]', cid, grup.join(','), m)
            continue
          }
          for (const vkn of grup) {
            const unvan = typeof result.data[vkn] === 'string' ? result.data[vkn].trim() : ''
            if (!unvan || /^\d+$/.test(unvan)) continue
            tumUnvanlar[`${cid}:${vkn}`] = unvan
            const { error: yazHata } = await supabase.from('efatura_faturalar')
              .update({ karsi_unvan: unvan })
              .eq('client_id', Number(cid)).eq('karsi_vkn', vkn)
            if (yazHata) { console.warn('[unvan-sorgu] yazilamadi', vkn, yazHata.message); continue }
            bulunan++
          }
        }
      }
      setFaturalar(prev => prev.map(f => {
        const u = tumUnvanlar[`${String(f.client_id)}:${String(f.karsi_vkn || '').trim()}`]
        return u ? { ...f, karsi_unvan: u } : f
      }))
      setUttsUnvanMesaj(bulunan
        ? `Ünvan sorgusu tamamlandı: ${bulunan}/${toplamVkn} ünvan bulunup kaydedildi.${ilkHata ? ' (bazıları: ' + ilkHata + ')' : ''}`
        : `Ünvan bulunamadı (${toplamVkn} vergi no).${ilkHata ? ' GİB yanıtı: ' + ilkHata : ''}`)
    } catch (error) {
      setUttsUnvanMesaj(`Ünvan sorgusu yapılamadı: ${error?.message || 'GİB bağlantı hatası'}`)
    }
  }

  const toplamTutar = useMemo(() => faturalar.reduce((t, f) => {
    const kur = (f.para_birimi && f.para_birimi !== 'TRY' && f.doviz_kur) ? Number(f.doviz_kur) : 1
    return t + (Number(f.tutar) || 0) * kur
  }, 0), [faturalar])

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <h1 className="text-xl md:text-2xl font-bold text-white mb-4">Tevkifatlı Faturalar</h1>

      <div className="bg-blue-900/30 border border-blue-800/40 rounded-xl p-4 mb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-blue-200/70 block mb-1">Müşteri</label>
          <select value={seciliClient} onChange={e => setSeciliClient(e.target.value)} className="w-full bg-blue-950/60 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white">
            <option value="all">Tüm Müşteriler</option>
            {(clients || []).slice().sort((a, b) => String(a.name || a.company || a.shortName || '').localeCompare(String(b.name || b.company || b.shortName || ''), 'tr')).map(c => <option key={c.id} value={c.id}>{c.name || c.company || c.shortName || `#${c.id}`}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-blue-200/70 block mb-1">Yıl</label>
          <select value={yil} onChange={e => setYil(Number(e.target.value))} className="w-full bg-blue-950/60 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white">
            {YILLAR.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-blue-200/70 block mb-1">Ay</label>
          <select value={ay} onChange={e => setAy(Number(e.target.value))} className="w-full bg-blue-950/60 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white">
            {AYLAR.map(a => <option key={a.v} value={a.v}>{a.l}</option>)}
          </select>
        </div>
        <div className="flex items-end gap-3">
          <label className="flex items-center gap-2 text-sm text-white"><input type="checkbox" checked={alis} onChange={e => setAlis(e.target.checked)} /> Alış tevkifat</label>
          <label className="flex items-center gap-2 text-sm text-white"><input type="checkbox" checked={satis} onChange={e => setSatis(e.target.checked)} /> Satış tevkifat</label>
          <label className="flex items-center gap-2 text-sm text-white"><input type="checkbox" checked={iade} onChange={e => setIade(e.target.checked)} /> Tevkifat iade</label>
        </div>
      </div>

      {mesaj && <div className="mb-3 text-sm text-yellow-300">{mesaj}</div>}
      {uttsUnvanMesaj && <div className="mb-3 text-sm text-blue-300">{uttsUnvanMesaj}</div>}
      {tevkifatUyariIds.length > 0 && ay > 0 && (() => {
        const sonrakiAy = ay === 12 ? 1 : ay + 1
        const sonrakiYil = ay === 12 ? yil + 1 : yil
        const ayAdi = AYLAR.find(a => a.v === sonrakiAy)?.l || ''
        return (
          <div className="mb-3 p-3 rounded-lg bg-amber-500/15 border border-amber-400/40 text-amber-200 text-sm">
            <strong>Tevkifatlı alış faturası uyarısı:</strong> {tevkifatUyariIds.map(cid => { const c = (clients || []).find(x => String(x.id) === String(cid)); return c ? (c.name || c.company || c.shortName || `#${cid}`) : `#${cid}` }).join(', ')} — bu ay tevkifatlı alış faturası var.
            KDV2 beyan son tarihi: <strong>25 {ayAdi} {sonrakiYil}</strong>. İlgili müşterilerin KDV2 beyanı Aylık Beyan Takip'te otomatik aktifleştirildi.
          </div>
        )
      })()}

      <div className="bg-blue-900/30 border border-blue-800/40 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-blue-950/60 text-blue-200/80">
              <tr>
                <th className="pb-2">Müşteri</th>
                <th className="pb-2">Tarih</th>
                <th className="pb-2">Yön</th>
                <th className="pb-2">Tür</th>
                <th className="pb-2">Fatura Türü</th>
                <th className="pb-2">Fatura No</th>
                <th className="pb-2">Karşı Taraf</th>
                <th className="pb-2 text-right">Matrah</th>
                <th className="pb-2 text-right">KDV</th>
                <th className="pb-2 text-right">Toplam</th>
                <th className="pb-2">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-3 py-6 text-center text-blue-200/60">Yükleniyor…</td></tr>
              ) : faturalar.length === 0 ? (
                <tr><td colSpan={10} className="px-3 py-6 text-center text-blue-200/60">Kayıt yok</td></tr>
              ) : faturalar.map(f => {
                const kur = (f.para_birimi && f.para_birimi !== 'TRY' && f.doviz_kur) ? Number(f.doviz_kur) : 1
                const gorunUrl = f.html_url || f.pdf_url || f.xml_url
                return (
                  <tr key={f.id} className="border-b border-blue-800/20 text-gray-300 text-sm cursor-pointer hover:bg-blue-900/20" onClick={() => { if (gorunUrl) window.open(gorunUrl, '_blank') }}>
                    <td className="pb-2">{musteriAdi(f.client_id)}</td>
                    <td className="pb-2">{f.tarih ? formatDateTR(f.tarih) : '-'}</td>
                    <td className="pb-2">{f.yon || '-'}</td>
                    <td className="pb-2">{f.tur || '-'}</td>
                    <td className="pb-2">{f.fatura_turu || '-'}</td>
                    <td className="pb-2">{f.fatura_no || '-'}</td>
                    <td className="pb-2 truncate max-w-[180px]" title={f.karsi_unvan || ''}>{karsiTarafAdi(f) || '-'}</td>
                    <td className="pb-2 text-right">{f.matrah != null ? (Number(f.matrah) * kur).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}</td>
                    <td className="pb-2 text-right">{f.kdv != null ? (Number(f.kdv) * kur).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}</td>
                    <td className="pb-2 text-right font-medium">{f.tutar != null ? (Number(f.tutar) * kur).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}</td>
                    <td className="pb-2">
                      <div className="flex space-x-1.5">
                        {f.pdf_url && (
                          <a href={f.pdf_url} target="_blank" rel="noreferrer" title="PDF Görüntüle" className="p-1.5 bg-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/30" onClick={e => e.stopPropagation()}>
                            <Eye className="w-4 h-4" />
                          </a>
                        )}
                        {f.xml_url && (
                          <a href={f.xml_url} target="_blank" rel="noreferrer" title="XML İndir" className="p-1.5 bg-green-500/20 rounded-lg text-green-400 hover:bg-green-500/30" onClick={e => e.stopPropagation()}>
                            <Download className="w-4 h-4" />
                          </a>
                        )}
                        {f.html_url && (
                          <a href={f.html_url} target="_blank" rel="noreferrer" title="HTML Görüntüle" className="p-1.5 bg-cyan-500/20 rounded-lg text-cyan-400 hover:bg-cyan-500/30" onClick={e => e.stopPropagation()}>
                            <Eye className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 text-sm text-blue-200/70">
        Toplam {faturalar.length} fatura · Toplam tutar (TL): {toplamTutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
      </div>
    </div>
  )
}
