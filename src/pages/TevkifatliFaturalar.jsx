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
  const [yonSecim, setYonSecim] = useState('hepsi') // hepsi | gelen | giden
  const [iade, setIade] = useState(false)
  const [loading, setLoading] = useState(false)
  const [faturalar, setFaturalar] = useState([])
  const [mesaj, setMesaj] = useState('')
  const [tevkifatUyariIds, setTevkifatUyariIds] = useState([]) // tevkifatlı alış faturası olan müşteri id'leri
  const [uttsUnvanMesaj, setUttsUnvanMesaj] = useState('')
  const uttsSorgulananRef = useRef(new Set())

  // Supabase/PostgREST tek istekte en fazla 1000 satır döndürür. "Tüm
  // Müşteriler" seçiliyken TEK büyük sorgu bazen eksik/hatalı dönüyordu
  // (sıralama + büyük tablo). Bu yüzden kayıtlar MÜŞTERİ GRUPLARI hâlinde
  // (her istekte 15 müşteri) ve 1000'lik sayfalarla çekilir — tek müşteri
  // seçimiyle birebir aynı sonucu verir.
  const SAYFA_BOYU = 1000
  const sayfaliCek = async (clientIdler) => {
    const hepsi = []
    for (let bas = 0; bas < 200000; bas += SAYFA_BOYU) {
      let q = supabase
        .from('efatura_faturalar')
        .select('id,client_id,yon,tur,fatura_turu,fatura_no,tarih,matrah,kdv,tutar,para_birimi,doviz_kur,karsi_unvan,karsi_vkn,pdf_url,xml_url,html_url')
      q = tarihAraligi(q, yil, ay)
      if (clientIdler && clientIdler.length === 1) q = q.eq('client_id', clientIdler[0])
      else if (clientIdler) q = q.in('client_id', clientIdler)
      const { data, error } = await q
        .order('tarih', { ascending: false })
        .order('id', { ascending: true })
        .range(bas, bas + SAYFA_BOYU - 1)
      if (error) throw error
      const parti = data || []
      hepsi.push(...parti)
      if (parti.length < SAYFA_BOYU) break
    }
    return hepsi
  }

  const tumKayitlariCek = async () => {
    if (seciliClient !== 'all') return sayfaliCek([Number(seciliClient)])
    const hepsi = []
    // 1) Genel sorgu (müşteri filtresi yok)
    try {
      const genel = await sayfaliCek(null)
      hepsi.push(...genel)
    } catch (e) {
      console.warn('[tevkifat] genel sorgu başarısız, müşteri bazlı okunacak:', e?.message || e)
    }
    // 2) Müşteri grupları hâlinde de oku — genel sorgu eksik/kesik dönerse
    //    eksik kalan müşterilerin faturaları buradan tamamlanır.
    const idler = [...new Set((clients || []).map(c => Number(c.id)).filter(n => Number.isFinite(n) && n > 0))]
    const mevcutId = new Set(hepsi.map(f => f.id))
    const GRUP = 15
    for (let i = 0; i < idler.length; i += GRUP) {
      const grup = idler.slice(i, i + GRUP)
      try {
        const parca = await sayfaliCek(grup)
        for (const f of parca) {
          if (mevcutId.has(f.id)) continue
          mevcutId.add(f.id)
          hepsi.push(f)
        }
      } catch (e) {
        console.warn('[tevkifat] müşteri grubu okunamadı:', grup.join(','), e?.message || e)
      }
    }
    return hepsi
  }

  const yukle = async () => {
    setLoading(true)
    setMesaj('')
    try {
      let data = await tumKayitlariCek()
      // Onarım: yön/karşı taraf hatalı kayıtları düzelt (XML'den yeniden okur)
      // 2.8.76: Onarım sonrası YENİ bir sorgu kurulur — aynı builder'ı tekrar
      // await etmek boş liste döndürüyordu ("tevkifatlı fatura listede yok").
      if (seciliClient !== 'all') {
        try { await karsiTarafOnar(seciliClient, data || []) } catch { /* sessiz */ }
        const taze = await tumKayitlariCek()
        if (Array.isArray(taze) && taze.length) data = taze
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
      for (const [cid, fs] of Object.entries(tevkifatliAlisByClient).slice(0, 60)) {
        const c = (clients || []).find(x => String(x.id) === String(cid))
        if (c) { try { await kdv2AktifEtGerekirse(c, fs) } catch { /* sessiz */ } }
      }
      setTevkifatUyariIds(Object.keys(tevkifatliAlisByClient))
      let liste = data || []
      liste = liste.filter(f => {
        const faturaTuru = f.fatura_turu || f.tur
        const yon = String(f.yon || '').toLowerCase()
        const gelenMi = yon === 'gelen' || yon === 'alis' || yon === 'alinan' || yon === ''
        const gidenMi = yon === 'giden' || yon === 'satis'
        const iadeF = iadeMi(faturaTuru)
        if (iadeF) return iade
        const tev = tevkifatMi(faturaTuru)
        if (!tev && String(faturaTuru || '').trim() !== '') return false
        if (yonSecim === 'gelen') return gelenMi
        if (yonSecim === 'giden') return gidenMi
        return true
      })
      setFaturalar(liste)
      setMesaj(liste.length
        ? `${liste.length} tevkifatlı fatura bulundu (taranan kayıt: ${(data || []).length}).`
        : 'Seçilen kriterlere uygun tevkifatlı fatura bulunamadı.')
      void unvanlariSorgula(liste)
    } catch (e) {
      setMesaj('Yükleme hatası: ' + (e?.message || e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { yukle() }, [seciliClient, yil, ay, yonSecim, iade])

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
    let vknSayaci = 0
    for (const f of adaylar) {
      // "Tüm Müşteriler" modunda GİB'e tek seferde onlarca sorgu atmayalım
      if (vknSayaci >= 60) break
      const cid = String(f.client_id)
      const vkn = String(f.karsi_vkn || '').trim()
      const anahtar = `${cid}:${vkn}`
      if (uttsSorgulananRef.current.has(anahtar)) continue
      uttsSorgulananRef.current.add(anahtar)
      if (!gruplar.has(cid)) gruplar.set(cid, new Set())
      if (!gruplar.get(cid).has(vkn)) vknSayaci++
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
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="text-xs text-blue-200/70 block mb-1">Tevkifat yönü</label>
            <select value={yonSecim} onChange={e => setYonSecim(e.target.value)} className="bg-blue-950/60 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white">
              <option value="hepsi">Tümü</option>
              <option value="gelen">Alınan tevkifatlı</option>
              <option value="giden">Kesilen tevkifatlı</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-white pb-2"><input type="checkbox" checked={iade} onChange={e => setIade(e.target.checked)} /> Tevkifat iade</label>
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
          {loading ? (
            <p className="px-3 py-6 text-center text-blue-200/60 text-sm">Faturalar yükleniyor…</p>
          ) : faturalar.length === 0 ? (
            <p className="px-3 py-6 text-center text-blue-200/60 text-sm">Kayıt yok</p>
          ) : (
            <div className="p-4">
              {[
                { baslik: 'Gelen Faturalar (Alınan)', renk: 'text-blue-400', ogeler: faturalar.filter(f => !/^giden$|^satis$/i.test(String(f.yon || ''))) },
                { baslik: 'Giden Faturalar (Kesilen)', renk: 'text-green-400', ogeler: faturalar.filter(f => /^giden$|^satis$/i.test(String(f.yon || ''))) }
              ].filter(b => b.ogeler.length > 0).map(bolum => (
                <div key={bolum.baslik} className="mb-8">
                  <h3 className={`text-sm font-semibold ${bolum.renk} mb-3`}>
                    {bolum.baslik}
                    <span className="text-gray-500 font-normal"> ({bolum.ogeler.length} fatura · Toplam: {bolum.ogeler.reduce((s, f) => { const k = (f.para_birimi && f.para_birimi !== 'TRY' && f.doviz_kur) ? Number(f.doviz_kur) : 1; return s + (Number(f.tutar) || 0) * k }, 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL)</span>
                  </h3>
                  {(() => {
                    const gruplar = new Map()
                    for (const f of bolum.ogeler) {
                      const t = String(f.tarih || '')
                      const anahtar = /^\d{4}-\d{2}/.test(t) ? t.slice(0, 7) : 'tarihsiz'
                      if (!gruplar.has(anahtar)) gruplar.set(anahtar, [])
                      gruplar.get(anahtar).push(f)
                    }
                    return [...gruplar.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([anahtar, ogeler]) => {
                      const [gy, gm] = anahtar.split('-')
                      const ayAd = anahtar === 'tarihsiz' ? 'Tarihsiz' : `${AYLAR.find(a => a.v === Number(gm))?.l || ''} ${gy}`
                      return (
                        <div key={anahtar} className="mb-6">
                          <h4 className="text-xs font-semibold text-yellow-400 mb-2">
                            {ayAd} <span className="ml-2 text-gray-500 font-normal">({ogeler.length} fatura)</span>
                          </h4>
                          <table className="w-full">
                            <thead>
                              <tr className="text-left text-gray-400 text-xs border-b border-blue-800/30">
                                {seciliClient === 'all' && <th className="pb-2">Müşteri</th>}
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
                              {ogeler.map(f => {
                                const kur = (f.para_birimi && f.para_birimi !== 'TRY' && f.doviz_kur) ? Number(f.doviz_kur) : 1
                                const gorunUrl = f.html_url || f.pdf_url || f.xml_url
                                const giden = /^giden$|^satis$/i.test(String(f.yon || ''))
                                return (
                                  <tr key={f.id} className="border-b border-blue-800/20 text-gray-300 text-sm cursor-pointer hover:bg-blue-900/20" title={gorunUrl ? 'Faturayı açmak için tıklayın' : ''} onClick={() => { if (gorunUrl) window.open(gorunUrl, '_blank') }}>
                                    {seciliClient === 'all' && <td className="py-2 pr-3 align-top"><div className="max-w-[20ch] truncate" title={musteriAdi(f.client_id)}>{musteriAdi(f.client_id)}</div></td>}
                                    <td className="py-2 whitespace-nowrap">{f.tarih ? formatDateTR(f.tarih) : '-'}</td>
                                    <td className="py-2">
                                      <span className={`px-2 py-0.5 rounded text-xs ${giden ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                        {giden ? 'Kesilen' : 'Alınan'}
                                      </span>
                                    </td>
                                    <td className="py-2 whitespace-nowrap">{f.tur === 'efatura' ? 'e-Fatura' : f.tur === 'earsiv' ? 'e-Arşiv' : f.tur === 'esmm' ? 'e-SMM' : f.tur === 'utts' ? 'UTTS' : (f.tur || '-')}</td>
                                    <td className="py-2 whitespace-nowrap">{f.fatura_turu || '-'}</td>
                                    <td className="py-2">{f.fatura_no || '-'}</td>
                                    <td className="py-2 max-w-[200px] truncate" title={f.karsi_unvan || ''}>{karsiTarafAdi(f) || '-'}</td>
                                    <td className="py-2 text-right whitespace-nowrap">{f.matrah != null ? (Number(f.matrah) * kur).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}</td>
                                    <td className="py-2 text-right whitespace-nowrap">{f.kdv != null ? (Number(f.kdv) * kur).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}</td>
                                    <td className="py-2 text-right whitespace-nowrap font-medium text-white">{f.tutar != null ? (Number(f.tutar) * kur).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}</td>
                                    <td className="py-2">
                                      <div className="flex space-x-1.5">
                                        {f.pdf_url && (
                                          <a href={f.pdf_url} target="_blank" rel="noreferrer" title="PDF Görüntüle" className="p-1.5 bg-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/30" onClick={e => e.stopPropagation()}>
                                            <Eye className="w-4 h-4" />
                                          </a>
                                        )}
                                        {f.html_url && (
                                          <a href={f.html_url} target="_blank" rel="noreferrer" title="Fatura Görüntüle" className="p-1.5 bg-cyan-500/20 rounded-lg text-cyan-400 hover:bg-cyan-500/30" onClick={e => e.stopPropagation()}>
                                            <Eye className="w-4 h-4" />
                                          </a>
                                        )}
                                        {f.xml_url && (
                                          <a href={f.xml_url} target="_blank" rel="noreferrer" title="XML İndir" className="p-1.5 bg-green-500/20 rounded-lg text-green-400 hover:bg-green-500/30" onClick={e => e.stopPropagation()}>
                                            <Download className="w-4 h-4" />
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
                      )
                    })
                  })()}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 text-sm text-blue-200/70">
        Toplam {faturalar.length} fatura · Toplam tutar (TL): {toplamTutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
      </div>
    </div>
  )
}
