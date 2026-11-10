// 2.7.438: Saglik Raporu sekmesi — SGK istirahat (istirahatli) raporlari takibi.
// Admin: elle giris + yardimci program uzerinden SGK Isveren Modulu'nden toplu cekim.
// Musteri portal: yalnizca goruntuleme (sorgulama yardimci admin makinasinda).
import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Download, Search, Activity } from 'lucide-react'
import {
  getSaglikRaporlari,
  addSaglikRapor,
  bulkSaveSaglikRaporlari,
  deleteSaglikRapor
} from '../../services/saglikRaporService'
import { sgkRaporDokumu } from '../../utils/gibOdemeHelper'
import { asArray, clientName } from './izinUtils'

function fmtTarih(d) {
  if (!d) return '-'
  const parts = String(d).slice(0, 10).split('-')
  return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : d
}

const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

export default function SaglikRapor({ clientId, employees, clientList, isMusteri }) {
  const [raporlar, setRaporlar] = useState([])
  const [yil, setYil] = useState(String(new Date().getFullYear()))
  const [ay, setAy] = useState('')
  const [sgkDurum, setSgkDurum] = useState('onayli')
  const [yukleniyor, setYukleniyor] = useState(false)
  const [mesaj, setMesaj] = useState('')
  const [hata, setHata] = useState('')
  const [arama, setArama] = useState('')
  const [formAcik, setFormAcik] = useState(false)
  const [form, setForm] = useState({ employee_id: '', tc: '', rapor_baslangic: '', rapor_bitis: '', nitelik: 'İstirahat' })
  const [sgkSorgulaniyor, setSgkSorgulaniyor] = useState(false)
  const [sgkClient, setSgkClient] = useState('')

  const yilSecenekleri = useMemo(() => {
    const su = new Date().getFullYear()
    return Array.from({ length: 5 }, (_, i) => String(su - i))
  }, [])

  const reload = async () => {
    if (!clientId) { setRaporlar([]); return }
    setYukleniyor(true)
    setHata('')
    try {
      setRaporlar(await getSaglikRaporlari(clientId, yil))
    } catch (e) {
      setHata(e?.message || 'Sağlık raporları yüklenemedi.')
    } finally {
      setYukleniyor(false)
    }
  }

  useEffect(() => { reload() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [clientId, yil])

  // Admin icin sgk client secici: clientList'ten admin kendi makinasinda sorgulayacak musteriye bakar
  useEffect(() => {
    if (isMusteri && clientId) setSgkClient(clientId)
    else if (!isMusteri && clientId) setSgkClient(clientId)
  }, [clientId, isMusteri])

  const personelMap = useMemo(() => {
    const m = new Map()
    asArray(employees).forEach(p => m.set(String(p?.tc_kimlik || p?.tc || '').replace(/\D/g, ''), p))
    asArray(employees).forEach(p => m.set(String(p?.id), p))
    return m
  }, [employees])

  const gosterilen = useMemo(() => {
    let list = raporlar
    if (ay) {
      // Secilen ay ile KESISEN raporlar (bir onceki ayda baslayip bu aya
      // sarkan raporlar da gorunur)
      const ayIki = String(ay).padStart(2, '0')
      const ayBas = `${yil}-${ayIki}-01`
      const aySon = `${yil}-${ayIki}-${String(new Date(Number(yil), Number(ay), 0).getDate()).padStart(2, '0')}`
      list = list.filter(r => {
        const bas = String(r.rapor_baslangic || '').slice(0, 10)
        if (!bas) return false
        const bit = String(r.rapor_bitis || r.rapor_baslangic || '').slice(0, 10)
        return bas <= aySon && bit >= ayBas
      })
    }
    // Secilen durum sekmesi listeyi de suzer
    if (sgkDurum === 'bekliyor') list = list.filter(r => r.kaynak === 'sgk' && r.onay_durumu === 'bekliyor')
    else if (sgkDurum === 'onayli') list = list.filter(r => r.kaynak !== 'sgk' || r.onay_durumu !== 'bekliyor')

    if (!arama.trim()) return list
    const q = arama.toLocaleLowerCase('tr')
    return list.filter(r =>
      String(r.ad_soyad || '').toLocaleLowerCase('tr').includes(q) ||
      String(r.tc_kimlik || '').includes(q)
    )
  }, [raporlar, arama, ay, yil, sgkDurum])

  // Secili durumda kayit yoksa bilgilendirme (or. hepsi onayliysa "onay
  // bekleyen rapor yok")
  const durumBilgi = useMemo(() => {
    if (!clientId || !raporlar.length || gosterilen.length) return ''
    const ayAdi = ay ? `${AY_ADLARI[Number(ay) - 1]} ${yil}` : String(yil)
    if (sgkDurum === 'bekliyor') return `Onay bekleyen rapor yok — ${ayAdi} döneminde bulunan tüm raporlar SGK'da onaylanmış görünüyor.`
    return ''
  }, [clientId, raporlar.length, gosterilen.length, sgkDurum, ay, yil])

  const gunSayisiHesapla = (bas, bit) => {
    if (!bas || !bit) return null
    const t1 = new Date(bas), t2 = new Date(bit)
    if (isNaN(t1) || isNaN(t2) || t2 < t1) return null
    return Math.round((t2 - t1) / 86400000) + 1
  }

  const kaydet = async () => {
    setHata(''); setMesaj('')
    if (!clientId) { setHata('Önce müşteri seçin.'); return }
    if (!form.tc.trim() || !form.rapor_baslangic) { setHata('TC kimlik no ve rapor başlangıç tarihi zorunlu.'); return }
    const p = personelMap.get(form.tc.replace(/\D/g, '')) || personelMap.get(String(form.employee_id))
    try {
      await addSaglikRapor({
        client_id: clientId,
        employee_id: p?.id || (form.employee_id ? Number(form.employee_id) : null),
        tc_kimlik: form.tc.replace(/\D/g, ''),
        ad_soyad: p?.ad_soyad || p?.adSoyad || '',
        rapor_baslangic: form.rapor_baslangic,
        rapor_bitis: form.rapor_bitis || form.rapor_baslangic,
        gun_sayisi: gunSayisiHesapla(form.rapor_baslangic, form.rapor_bitis || form.rapor_baslangic),
        nitelik: form.nitelik || 'İstirahat',
        kaynak: 'manuel'
      })
      setMesaj('Rapor kaydedildi.')
      setForm({ employee_id: '', tc: '', rapor_baslangic: '', rapor_bitis: '', nitelik: 'İstirahat' })
      setFormAcik(false)
      await reload()
    } catch (e) {
      setHata(e?.message || 'Kayıt eklenemedi.')
    }
  }

  const sil = async (id) => {
    if (!window.confirm('Bu rapor kaydı silinsin mi?')) return
    try { await deleteSaglikRapor(id); await reload() } catch (e) { setHata(e?.message || 'Silinemedi.') }
  }

  const sgkSorgula = async () => {
    setHata(''); setMesaj('')
    if (!sgkClient) { setHata('Önce müşteri seçin.'); return }
    const plist = asArray(employees).filter(p => String(p?.tc_kimlik || p?.tc || '').replace(/\D/g, '').length === 11)
    if (!plist.length) { setHata('Personel kayıtlarında TC kimlik numarası bulunan personel yok. Önce Personel Kayıtları sekmesinden TC girin.'); return }
    setSgkSorgulaniyor(true)
    const ayAdi = ay ? `${AY_ADLARI[Number(ay) - 1]} ${yil}` : String(yil)
    setMesaj(sgkDurum === 'bekliyor'
      ? `SGK'dan onay bekleyen raporlar sorgulanıyor (${ayAdi})... Onaylı liste ile karşılaştırıldığı için yaklaşık 1 dakika sürer, pencereyi kapatmayın.`
      : `SGK'dan onaylanmış raporlar sorgulanıyor (${ayAdi})...`)
    try {
      const sonuc = await sgkRaporDokumu(sgkClient, plist.map(p => ({
        tc: String(p.tc_kimlik || p.tc).replace(/\D/g, ''),
        adSoyad: p.ad_soyad || p.adSoyad || ''
      })), { yil, ay, durum: sgkDurum })
      if (!sonuc?.ok) {
        setHata(sonuc?.detail || sonuc?.not || 'SGK sorgusu başarısız.')
        setMesaj('')
        return
      }
      const kayitlar = sonuc.raporlar || []
      const eklenen = await bulkSaveSaglikRaporlari(sgkClient, kayitlar.map(r => ({
        employee_id: (plist.find(p => p.tc_kimlik === String(r.tc || '').replace(/\D/g, '')) || {}).id || null,
        tc_kimlik: String(r.tc || '').replace(/\D/g, ''),
        ad_soyad: r.adSoyad || '',
        sicil_no: r.sicilNo || '',
        rapor_baslangic: r.baslangic || null,
        rapor_bitis: r.bitis || null,
        gun_sayisi: r.gun || null,
        nitelik: r.nitelik || '',
        onay_durumu: r.onayli ? 'onayli' : 'bekliyor'
      })))
      setMesaj(`SGK sorgusu tamamlandı (${ayAdi}, ${sgkDurum === 'bekliyor' ? 'onay bekleyen' : 'onaylı'}): ${kayitlar.length} rapor bulundu, ${eklenen.length} yeni kayıt eklendi.` + (sonuc.uyari ? ' Not: ' + sonuc.uyari : ''))
      setYil(yil)
      await reload()
    } catch (e) {
      setHata(e?.message || 'SGK sorgusu başarısız.')
    } finally {
      setSgkSorgulaniyor(false)
    }
  }

  const excelIndir = () => {
    if (!gosterilen.length) return
    const basliklar = ['Ad Soyad', 'TC Kimlik No', 'Rapor Başlangıç', 'Rapor Bitiş', 'Gün', 'Nitelik', 'Onay Durumu', 'Kaynak']
    const satirlar = gosterilen.map(r => [
      r.ad_soyad || (personelMap.get(String(r.tc_kimlik))?.ad_soyad) || '',
      r.tc_kimlik || '',
      fmtTarih(r.rapor_baslangic),
      fmtTarih(r.rapor_bitis),
      r.gun_sayisi || '',
      r.nitelik || '',
      r.kaynak === 'sgk' ? (r.onay_durumu === 'onayli' ? 'Onaylı' : r.onay_durumu === 'bekliyor' ? 'Onay bekliyor' : '') : '',
      r.kaynak === 'sgk' ? 'SGK' : 'Manuel'
    ])
    const csv = [basliklar, ...satirlar].map(s => s.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `SaglikRaporlari_${yil}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (!clientId && isMusteri) {
    return <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-muted">Müşteri bilgisi bekleniyor...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={yil} onChange={e => setYil(e.target.value)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-blue-100">
          {yilSecenekleri.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={ay} onChange={e => setAy(e.target.value)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-blue-100">
          <option value="">Tümü</option>
          {AY_ADLARI.map((ad, i) => <option key={ad} value={String(i + 1)}>{ad}</option>)}
        </select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-blue-200/40" />
          <input
            value={arama}
            onChange={e => setArama(e.target.value)}
            placeholder="Ad / TC ara"
            className="w-48 rounded-lg border border-white/10 bg-white/5 py-2 pl-8 pr-3 text-sm text-blue-100 placeholder:text-blue-200/30"
          />
        </div>
        <div className="flex-1" />
        <select
          value={sgkDurum}
          onChange={e => setSgkDurum(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-blue-100"
          title="SGK'dan hangi durumdaki raporlar sorgulanacak"
        >
          <option value="onayli">Onaylanmış raporlar</option>
          <option value="bekliyor">Onay bekleyen raporlar</option>
        </select>
        <button
          onClick={sgkSorgula}
          disabled={sgkSorgulaniyor || !clientId}
          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-teal-500 to-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          title="Seçili yıl/ay için SGK'dan istirahat raporlarını çeker. Yardımcı program (MUBİS GIB Yardımcı) veya Luca Bağlantı Merkezi kurulu olmalıdır. SGK, aynı kullanıcı ile 1 dakikada bir sorguya izin verir."
        >
          <Activity className="h-4 w-4" /> {sgkSorgulaniyor ? 'SGK sorgulanıyor...' : "SGK'dan Sorgula"}
        </button>
        <button onClick={() => setFormAcik(v => !v)} disabled={!clientId} className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 px-3 py-2 text-xs font-semibold text-blue-950 disabled:opacity-50">
          <Plus className="h-4 w-4" /> Elle Rapor Girişi
        </button>
        <button onClick={excelIndir} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-blue-100 hover:bg-white/10">
          <Download className="h-4 w-4" /> Excel
        </button>
      </div>

      {mesaj && <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">{mesaj}</div>}
      {hata && <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{hata}</div>}
      {durumBilgi && <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 p-3 text-sm text-sky-300">{durumBilgi}</div>}

      {formAcik && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <label className="text-xs text-blue-200/60">
              Personel
              <select
                value={form.employee_id}
                onChange={e => {
                  const p = personelMap.get(String(e.target.value))
                  setForm(f => ({ ...f, employee_id: e.target.value, tc: p?.tc_kimlik || p?.tc || f.tc }))
                }}
                className="mt-1 w-full rounded-lg border border-white/10 bg-blue-950/60 px-2 py-2 text-sm text-white"
              >
                <option value="">Seçin / elle TC girin</option>
                {asArray(employees).map(p => <option key={p.id} value={p.id}>{p.ad_soyad || p.adSoyad || p.id}</option>)}
              </select>
            </label>
            <label className="text-xs text-blue-200/60">
              TC Kimlik No *
              <input value={form.tc} onChange={e => setForm(f => ({ ...f, tc: e.target.value.replace(/\D/g, '').slice(0, 11) }))}
                className="mt-1 w-full rounded-lg border border-white/10 bg-blue-950/60 px-2 py-2 text-sm text-white" placeholder="11 hane" />
            </label>
            <label className="text-xs text-blue-200/60">
              Rapor Başlangıç *
              <input type="date" value={form.rapor_baslangic} onChange={e => setForm(f => ({ ...f, rapor_baslangic: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-white/10 bg-blue-950/60 px-2 py-2 text-sm text-white" />
            </label>
            <label className="text-xs text-blue-200/60">
              Rapor Bitiş
              <input type="date" value={form.rapor_bitis} onChange={e => setForm(f => ({ ...f, rapor_bitis: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-white/10 bg-blue-950/60 px-2 py-2 text-sm text-white" />
            </label>
            <label className="text-xs text-blue-200/60">
              Nitelik
              <select value={form.nitelik} onChange={e => setForm(f => ({ ...f, nitelik: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-white/10 bg-blue-950/60 px-2 py-2 text-sm text-white">
                <option>İstirahat</option>
                <option>Doğum</option>
                <option>Analık izni</option>
                <option>Diğer</option>
              </select>
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setFormAcik(false)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-blue-200/70">İptal</button>
            <button onClick={kaydet} className="rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 px-4 py-1.5 text-xs font-semibold text-blue-950">Kaydet</button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/5 text-left text-xs uppercase tracking-wide text-blue-200/50">
              <th className="px-3 py-2">Ad Soyad</th>
              <th className="px-3 py-2">TC Kimlik No</th>
              <th className="px-3 py-2">Rapor Başlangıç</th>
              <th className="px-3 py-2">Rapor Bitiş</th>
              <th className="px-3 py-2">Gün</th>
              <th className="px-3 py-2">Nitelik</th>
              <th className="px-3 py-2">Onay Durumu</th>
              <th className="px-3 py-2">Kaynak</th>
              {!isMusteri && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {yukleniyor && (
              <tr><td colSpan={isMusteri ? 8 : 9} className="px-3 py-6 text-center text-muted">Yükleniyor...</td></tr>
            )}
            {!yukleniyor && !gosterilen.length && (
              <tr><td colSpan={isMusteri ? 8 : 9} className="px-3 py-6 text-center text-muted">
                {!clientId
                  ? 'Önce müşteri seçin.'
                  : sgkDurum === 'bekliyor'
                    ? 'Onay bekleyen rapor kaydı yok.'
                    : (ay || arama.trim() ? 'Bu dönem için sağlık raporu kaydı yok.' : 'Sağlık raporu kaydı yok. "SGK\'dan Sorgula" ile SGK\'dan çekebilirsiniz.')}
              </td></tr>
            )}
            {!yukleniyor && gosterilen.map(r => (
              <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="px-3 py-2">{r.ad_soyad || personelMap.get(String(r.tc_kimlik))?.ad_soyad || personelMap.get(String(r.employee_id))?.ad_soyad || '-'}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.tc_kimlik || '-'}</td>
                <td className="px-3 py-2">{fmtTarih(r.rapor_baslangic)}</td>
                <td className="px-3 py-2">{fmtTarih(r.rapor_bitis)}</td>
                <td className="px-3 py-2">{r.gun_sayisi || '-'}</td>
                <td className="px-3 py-2">{r.nitelik || '-'}</td>
                <td className="px-3 py-2">
                  {r.kaynak === 'sgk' ? (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                      r.onay_durumu === 'onayli' ? 'bg-emerald-500/15 text-emerald-300'
                        : r.onay_durumu === 'bekliyor' ? 'bg-amber-500/15 text-amber-300'
                          : 'bg-white/10 text-blue-200/50'}`}>
                      {r.onay_durumu === 'onayli' ? 'Onaylı' : r.onay_durumu === 'bekliyor' ? 'Onay bekliyor' : 'Bilinmiyor'}
                    </span>
                  ) : <span className="text-blue-200/30">-</span>}
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${r.kaynak === 'sgk' ? 'bg-teal-500/15 text-teal-300' : 'bg-white/10 text-blue-200/60'}`}>
                    {r.kaynak === 'sgk' ? 'SGK' : 'Manuel'}
                  </span>
                </td>
                {!isMusteri && (
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => sil(r.id)} className="rounded p-1 text-red-300/60 hover:bg-red-500/10 hover:text-red-300" title="Sil">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-blue-200/40">
        Toplam {gosterilen.length} rapor kaydı{ay ? ` (${AY_ADLARI[Number(ay) - 1]} ${yil} ile kesişen)` : ` (${yil})`}{sgkDurum === 'bekliyor' ? ' — onay bekleyenler' : ' — onaylanmışlar dahil'}. SGK sorgusu yardımcı program veya Luca Bağlantı Merkezi üzerinden yapılır. SGK aynı kullanıcı ile 1 dakikada bir sorguya izin verir.
      </p>
    </div>
  )
}
