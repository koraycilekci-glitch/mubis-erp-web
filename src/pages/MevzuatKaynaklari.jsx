import { useEffect, useState, useCallback } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  ArrowUpRight, CalendarDays, FileText, ShieldAlert, Plus, Trash2, RefreshCw,
  CheckCircle, XCircle, Clock, AlertTriangle, Search, ExternalLink, Loader2,
  ChevronDown, ChevronUp, Users, Bell, BarChart3, BookOpen, ListChecks, Settings
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useClients } from '../hooks/useClients'
import { mukellefEtkiAnalizi, mukellefEslesmeKaydet, otomatikGorevOlustur, mevzuatTakvimTarihleriGetir, mevzuatSohbetBaglami } from '../services/mevzuatService'

const API = '/api/mevzuat'

async function apiGet(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString()
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  const r = await fetch(`${API}?${qs}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  return r.json()
}

async function apiPost(body) {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })
  return r.json()
}

async function apiDelete(tablo, id) {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  const r = await fetch(`${API}?tablo=${tablo}&id=${id}`, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} })
  return r.json()
}

const KURUMLAR = ['GIB', 'Resmî Gazete', 'SGK', 'TÜRMOB', 'İŞKUR', 'Diğer']
const KAYNAK_TİPLERİ = ['html', 'rss', 'api', 'pdf', 'manual']
const GOREV_DURUMLARI = { bekliyor: 'Bekliyor', devam: 'Devam', tamamlandi: 'Tamamlandı', iptal: 'İptal' }
const ONCELIKLER = { dusuk: 'Düşük', normal: 'Normal', yuksek: 'Yüksek', acil: 'Acil' }
const INCELEME_ETIKET = { bekliyor: 'İnceleme Bekliyor', incelendi: 'İncelendi', onaylandi: 'Onaylandı', reddedildi: 'Reddedildi' }

export default function MevzuatKaynaklari() {
  const { user, office } = useAuth()
  if (!user) return <Navigate to="/giris" replace />
  if (!['admin', 'super_admin', 'personel'].includes(user.role)) return <Navigate to="/portal" replace />
  const yetkiler = office?.personel_yetkileri || {}
  const personel = user.role === 'personel'
  const kayitliYetki = Object.keys(yetkiler).length > 0
  if (personel && (!yetkiler['mevzuat-asistan'] || !yetkiler['/admin/mevzuat-kaynaklari'])) return <Navigate to="/admin" replace />

  const [aktifTab, setAktifTab] = useState('panel')
  const [kaynaklar, setKaynaklar] = useState([])
  const [kayitlar, setKayitlar] = useState([])
  const [gorevler, setGorevler] = useState([])
  const [kurallar, setKurallar] = useState([])
  const [panel, setPanel] = useState(null)
  const [loglar, setLoglar] = useState([])
  const [incelemeFiltre, setIncelemeFiltre] = useState('')
  const [yukleniyor, setYukleniyor] = useState(false)
  const [mesaj, setMesaj] = useState('')
  const [hata, setHata] = useState('')
  const [detayKayit, setDetayKayit] = useState(null)
  const [yeniKaynak, setYeniKaynak] = useState({ ad: '', kurum: 'GIB', url: '', tip: 'html', erisim_yontemi: 'scrape', aciklama: '', tarama_araligi_dakika: 1440 })
  const [kaynakFormAcik, setKaynakFormAcik] = useState(false)
  const [gorevFormAcik, setGorevFormAcik] = useState(false)
  const [yeniGorev, setYeniGorev] = useState({ baslik: '', aciklama: '', son_tarih: '', oncelik: 'normal', sorumlu_user_id: '' })
  const [eslesmeler, setEslesmeler] = useState([])
  const [eslesmeYukleniyor, setEslesmeYukleniyor] = useState(false)
  const [taramaCalisiyor, setTaramaCalisiyor] = useState(false)
  const [mevzuatTakvimTarihleri, setMevzuatTakvimTarihleri] = useState([])
  const [chatMesajlar, setChatMesajlar] = useState([])
  const [chatSoru, setChatSoru] = useState('')
  const [chatYukleniyor, setChatYukleniyor] = useState(false)

  const bildir = (m, tip = 'ok') => { if (tip === 'ok') { setMesaj(m); setHata('') } else { setHata(m); setMesaj('') } setTimeout(() => { setMesaj(''); setHata('') }, 5000) }

  const yukle = useCallback(async () => {
    setYukleniyor(true)
    try {
      if (aktifTab === 'kaynaklar' || aktifTab === 'panel') {
        const r = await apiGet('kaynaklar'); if (r.ok) setKaynaklar(r.kaynaklar)
      }
      if (aktifTab === 'kayitlar' || aktifTab === 'inceleme') {
        const r = await apiGet('kayitlar', incelemeFiltre ? { inceleme: incelemeFiltre } : {}); if (r.ok) setKayitlar(r.kayitlar)
      }
      if (aktifTab === 'gorevler') {
        const r = await apiGet('gorevler'); if (r.ok) setGorevler(r.gorevler)
      }
      if (aktifTab === 'kurallar') {
        const r = await apiGet('kurallar'); if (r.ok) setKurallar(r.kurallar)
      }
      if (aktifTab === 'eslesmeler') {
        const r = await apiGet('eslesmeler'); if (r.ok) setEslesmeler(r.eslesmeler)
      }
      if (aktifTab === 'panel') {
        const r = await apiGet('panel'); if (r.ok) setPanel(r.panel)
        const lr = await apiGet('tarama-loglari'); if (lr.ok) setLoglar(lr.loglar)
        const kr = await apiGet('kurallar'); if (kr.ok) setKurallar(kr.kurallar)
        // Faz 3: Mevzuat takvim tarihleri
        try {
          const { mevzuatTakvimTarihleriGetir } = await import('../services/mevzuatService')
          const t = await mevzuatTakvimTarihleriGetir()
          setMevzuatTakvimTarihleri(t || [])
        } catch { /* sessizce */ }
      }
    } catch (e) { bildir('Veri yüklenemedi: ' + e.message, 'hata') }
    finally { setYukleniyor(false) }
  }, [aktifTab, incelemeFiltre])

  useEffect(() => { yukle() }, [yukle])

  const handleKaynakEkle = async () => {
    if (!yeniKaynak.ad || !yeniKaynak.url) { bildir('Ad ve URL zorunlu', 'hata'); return }
    const r = await apiPost({ action: 'kaynak-ekle', ...yeniKaynak })
    if (r.ok) { bildir('Kaynak eklendi'); setKaynakFormAcik(false); setYeniKaynak({ ad: '', kurum: 'GIB', url: '', tip: 'html', erisim_yontemi: 'scrape', aciklama: '', tarama_araligi_dakika: 1440 }); yukle() }
    else bildir(r.error || 'Eklenemedi', 'hata')
  }

  const handleKaynakSil = async (id) => {
    if (!confirm('Bu kaynağı silmek istediğinize emin misiniz?')) return
    const r = await apiDelete('kaynaklar', id)
    if (r.ok) { bildir('Kaynak silindi'); yukle() } else bildir(r.error || 'Silinemedi', 'hata')
  }

  const handleKaynakTest = async (kaynak) => {
    const r = await apiPost({ action: 'kaynak-test', url: kaynak.url })
    if (r.ok) {
      bildir(`${kaynak.ad}: Erişilebilir (HTTP ${r.httpStatus}, ${r.erisimYontemi})`)
      // erisim_yontemi'ni guncelle
      await apiPost({ action: 'kaynak-guncelle', id: kaynak.id, erisim_yontemi: r.erisimYontemi })
      yukle()
    } else bildir(`${kaynak.ad}: Erişilemedi — ${r.error}`, 'hata')
  }
  const handleTara = async (kaynakId = null) => {
    setTaramaCalisiyor(true)
    try {
      const r = await apiPost({ action: 'tara', ...(kaynakId ? { kaynak_id: kaynakId } : { tumu: true }) })
      if (r.ok) {
        const ozet = (r.sonuclar || []).map(s => `${s.kaynak}: ${s.ok ? (s.yeniKayitSayisi || 0) + ' yeni' : 'HATA ' + (s.hata || '')}`).join(' | ')
        bildir('Tarama tamamlandı — ' + ozet)
        yukle()
      } else bildir(r.error || 'Tarama başarısız', 'hata')
    } catch (e) { bildir('Tarama hatası: ' + e.message, 'hata') }
    finally { setTaramaCalisiyor(false) }
  }

  const handleIncelemeKarar = async (kayitId, karar, yorum = '') => {
    const r = await apiPost({ action: 'inceleme-karar', kayit_id: kayitId, karar, yorum })
    if (r.ok) { bildir('Karar kaydedildi'); setDetayKayit(null); yukle() } else bildir(r.error || 'Kaydedilemedi', 'hata')
  }

  const handleGorevEkle = async () => {
    if (!yeniGorev.baslik) { bildir('Başlık zorunlu', 'hata'); return }
    const r = await apiPost({ action: 'gorev-ekle', ...yeniGorev })
    if (r.ok) { bildir('Görev eklendi'); setGorevFormAcik(false); setYeniGorev({ baslik: '', aciklama: '', son_tarih: '', oncelik: 'normal', sorumlu_user_id: '' }); yukle() }
    else bildir(r.error || 'Eklenemedi', 'hata')
  }

  const handleGorevDurum = async (id, durum) => {
    const r = await apiPost({ action: 'gorev-durum', id, durum })
    if (r.ok) { bildir('Durum güncellendi'); yukle() } else bildir(r.error || 'Güncellenemedi', 'hata')
  }

  const { clients } = useClients()

  const clientAdi = (id) => {
    const c = (clients || []).find(x => x.id === id)
    return c ? (c.name || c.company || c.shortName || `Müşteri #${id}`) : `Müşteri #${id}`
  }

  const handleMukellefEslestir = async (kural) => {
    setEslesmeYukleniyor(true)
    try {
      const adaylar = mukellefEtkiAnalizi(kural, clients || [])
      if (adaylar.length === 0) { bildir('Eşleşen mükellef bulunamadı', 'hata'); return }
      // Supabase'e kaydet
      const r = await mukellefEslesmeKaydet(kural.id, adaylar)
      // Otomatik görev oluştur
      const gorevSonuclari = await otomatikGorevOlustur(kural.id, adaylar, kural.baslik, kural.son_basvuru_tarihi)
      const gorevOk = gorevSonuclari.filter(s => s.ok).length
      bildir(`${adaylar.length} aday eşleşme bulundu, ${gorevOk} görev oluşturuldu`)
      // Eslesmeleri yenile
      const er = await apiGet('eslesmeler', { kural_id: kural.id }); if (er.ok) setEslesmeler(er.eslesmeler)
      yukle()
    } catch (e) { bildir('Eşleştirme hatası: ' + e.message, 'hata') }
    finally { setEslesmeYukleniyor(false) }
  }
  const handleChatSoru = async () => {
    if (!chatSoru.trim()) return
    const soru = chatSoru.trim()
    setChatSoru('')
    setChatMesajlar(prev => [...prev, { role: 'user', content: soru }])
    setChatYukleniyor(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      const r = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ messages: [{ role: 'user', content: soru }], context: '' })
      })
      const j = await r.json()
      setChatMesajlar(prev => [...prev, { role: 'assistant', content: j.reply || 'Yanıt alınamadı.', source: j.source }])
    } catch (e) {
      setChatMesajlar(prev => [...prev, { role: 'assistant', content: 'Hata: ' + e.message }])
    } finally {
      setChatYukleniyor(false)
    }
  }
  const handleMukellefEslestirTumu = async () => {
    if (!kurallar.length) { bildir('Önce onaylı kural oluşturun', 'hata'); return }
    setEslesmeYukleniyor(true)
    try {
      let toplamAday = 0, toplamGorev = 0
      for (const kural of kurallar.filter(k => k.durum === 'aktif')) {
        const adaylar = mukellefEtkiAnalizi(kural, clients || [])
        if (adaylar.length === 0) continue
        await mukellefEslesmeKaydet(kural.id, adaylar)
        const gorevSonuclari = await otomatikGorevOlustur(kural.id, adaylar, kural.baslik, kural.son_basvuru_tarihi)
        toplamAday += adaylar.length
        toplamGorev += gorevSonuclari.filter(s => s.ok).length
      }
      bildir(`Tüm kurallar eşleştirildi: ${toplamAday} aday, ${toplamGorev} görev`)
      const er = await apiGet('eslesmeler'); if (er.ok) setEslesmeler(er.eslesmeler)
      yukle()
    } catch (e) { bildir('Eşleştirme hatası: ' + e.message, 'hata') }
    finally { setEslesmeYukleniyor(false) }
  }
  const handleGorevOlusturTek = async (eslesme) => {
    const r = await apiPost({ action: 'gorev-ekle', baslik: `Mevzuat görevi — ${clientAdi(eslesme.client_id)}`, aciklama: eslesme.gerekce || '', client_id: eslesme.client_id, mevzuat_kural_id: eslesme.mevzuat_kural_id, oncelik: eslesme.kontrol_gerekli ? 'yuksek' : 'normal' })
    if (r.ok) { bildir('Görev oluşturuldu'); yukle() } else bildir(r.error || 'Oluşturulamadı', 'hata')
  }
  const handleMevzuatBildirim = async (kural, musteriyeBildir = false) => {
    if (!kural.tarih) { bildir('Bu kuralın tarihi yok', 'hata'); return }
    const mesaj = `${kural.baslik} — Son tarih: ${new Date(kural.tarih).toLocaleDateString('tr-TR')}${kural.son_basvuru_tarihi ? ' (Son başvuru: ' + new Date(kural.son_basvuru_tarihi).toLocaleDateString('tr-TR') + ')' : ''}`
    const r = await apiPost({ action: 'mevzuat-bildirim', kural_id: kural.id, baslik: kural.baslik, tarih: kural.tarih, mesaj, gonderim_kanali: 'ikisi', musteriye_bildir: musteriyeBildir })
    if (r.ok) {
      const s = r.sonuclar || {}
      let msg = 'Bildirim oluşturuldu'
      if (s.whatsapp && s.whatsapp !== 'atlandi') msg += ` (WhatsApp: ${s.whatsapp})`
      if (s.musteriBildirim) msg += ` — ${s.musteriBildirim} müşteriye bildirim gönderildi`
      bildir(msg)
    } else bildir(r.error || 'Oluşturulamadı', 'hata')
  }
  const handleKuralEkle = async (kayit) => {
    const baslik = prompt('Kural başlığı:', kayit.baslik)
    if (!baslik) return
    const r = await apiPost({ action: 'kural-ekle', mevzuat_kayit_id: kayit.id, baslik, kural_tipi: 'tarih', konu: kayit.baslik, dayanak_url: kayit.kaynak_url })
    if (r.ok) { bildir('Kural onaylandı ve eklendi'); yukle() } else bildir(r.error || 'Eklenemedi', 'hata')
  }

  const takvimGorunur = !personel || (kayitliYetki && yetkiler['/admin/tax-calendar'])
  const beyanGorunur = !personel || !kayitliYetki || (yetkiler['beyan-takip'] && yetkiler['/admin/aylik-beyan-takip'])

  const SEKMELER = [
    { id: 'panel', label: 'Yönetim Paneli', icon: BarChart3 },
    { id: 'kaynaklar', label: 'Kaynaklar', icon: BookOpen },
    { id: 'kayitlar', label: 'Mevzuat Kayıtları', icon: FileText },
    { id: 'inceleme', label: 'İnceleme Bekleyen', icon: ShieldAlert },
    { id: 'kurallar', label: 'Onaylı Kurallar', icon: CheckCircle },
    { id: 'eslesmeler', label: 'Mükellef Eşleşmeleri', icon: Users },
    { id: 'gorevler', label: 'Görevler', icon: ListChecks },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6 text-white">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-blue-300">Mevzuat &amp; AI Asistan</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold">Mevzuat Yönetim Merkezi</h1>
          <p className="mt-2 text-blue-100/70 text-sm">Resmî kaynakları tarayın, mevzuat kayıtlarını inceleyin, görevler atayın.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => handleTara()} disabled={taramaCalisiyor} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50">
            {taramaCalisiyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Tüm Kaynakları Tara
          </button>
          <button onClick={() => { setAktifTab('kaynaklar'); setKaynakFormAcik(v => !v) }} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500">
            <Plus className="w-4 h-4" /> Yeni Kaynak
          </button>
        </div>
      </div>

      {(mesaj || hata) && (
        <div className={`rounded-xl border p-3 text-sm ${hata ? 'border-red-400/30 bg-red-500/10 text-red-100' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'}`}>
          {hata || mesaj}
        </div>
      )}

      {/* Sekmeler */}
      <div className="flex gap-2 flex-wrap border-b border-blue-400/20 pb-2">
        {SEKMELER.map(s => (
          <button key={s.id} onClick={() => setAktifTab(s.id)} className={`inline-flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${aktifTab === s.id ? 'bg-blue-600 text-white' : 'text-blue-200/70 hover:text-white hover:bg-blue-800/40'}`}>
            <s.icon className="w-4 h-4" /> {s.label}
          </button>
        ))}
      </div>

      {yukleniyor && <div className="flex items-center gap-2 text-blue-300 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor...</div>}

      {/* ===================== YÖNETİM PANELİ ===================== */}
      {aktifTab === 'panel' && panel && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-5">
              <p className="text-sm text-blue-300">Kaynaklar</p>
              <p className="mt-2 text-3xl font-bold">{panel.kaynakSayisi}</p>
              <p className="mt-1 text-xs text-blue-100/60">{panel.aktifKaynak} aktif · {panel.hataliKaynak} hatalı</p>
            </div>
            <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-5">
              <p className="text-sm text-blue-300">İnceleme Bekleyen</p>
              <p className="mt-2 text-3xl font-bold">{panel.incelemeBekleyen}</p>
              <p className="mt-1 text-xs text-blue-100/60">Toplam kayıt: {Object.values(panel.kayitSayim || {}).reduce((a, b) => a + b, 0)}</p>
            </div>
            <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-5">
              <p className="text-sm text-blue-300">Görevler</p>
              <p className="mt-2 text-3xl font-bold">{panel.gorevSayim?.bekliyor || 0}</p>
              <p className="mt-1 text-xs text-blue-100/60">Geciken: {panel.gecikenGorev} · Yaklaşan: {panel.yaklasanGorev}</p>
            </div>
            <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-5">
              <p className="text-sm text-blue-300">Onaylı Kurallar</p>
              <p className="mt-2 text-3xl font-bold">{panel.aktifKural}</p>
              <p className="mt-1 text-xs text-blue-100/60">Aktif mevzuat kuralları</p>
            </div>
          </div>

          {/* Son tarama loglari */}
          <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-5">
            <h2 className="font-semibold mb-3">Son Tarama Logları</h2>
            {loglar.length === 0 ? <p className="text-blue-100/60 text-sm">Henüz tarama yapılmadı.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-blue-300 text-xs"><tr><th className="text-left py-2">Başlangıç</th><th className="text-left py-2">Durum</th><th className="text-left py-2">Yeni Kayıt</th><th className="text-left py-2">Hata</th><th className="text-left py-2">Süre (ms)</th></tr></thead>
                  <tbody>
                    {loglar.slice(0, 20).map(l => (
                      <tr key={l.id} className="border-t border-blue-400/10">
                        <td className="py-2 text-blue-100/70">{new Date(l.baslangic_ts).toLocaleString('tr-TR')}</td>
                        <td className="py-2"><span className={`px-2 py-0.5 rounded text-xs ${l.durum === 'basarili' ? 'bg-emerald-500/20 text-emerald-300' : l.durum === 'hata' ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'}`}>{l.durum}</span></td>
                        <td className="py-2">{l.yeni_kayit_sayisi}</td>
                        <td className="py-2 text-red-300 text-xs">{l.hata_mesaji || '-'}</td>
                        <td className="py-2">{l.sure_ms || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Faz 3: Mevzuat Takvim Tarihleri */}
          {mevzuatTakvimTarihleri.length > 0 && (
            <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-5">
              <h2 className="font-semibold mb-3 flex items-center gap-2"><CalendarDays className="w-5 h-5" /> Mevzuat Kaynaklı Tarihler</h2>
              <p className="text-xs text-blue-100/60 mb-3">Onaylanmış mevzuat kurallarından gelen tarihler. Mevcut takvim tarihleriyle çelişiyorsa her iki tarih de gösterilir.</p>
              <div className="space-y-2">
                {mevzuatTakvimTarihleri.map(t => (
                  <div key={t.id} className="flex items-center justify-between gap-4 border-b border-blue-400/10 pb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{t.baslik}</p>
                      <p className="text-xs text-blue-100/60">{t.konu || ''} · {t.ilgiliKurum || ''}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-amber-300">{new Date(t.tarih).toLocaleDateString('tr-TR')}</p>
                      {t.sonBasvuruTarihi && <p className="text-xs text-red-300">Son başvuru: {new Date(t.sonBasvuruTarihi).toLocaleDateString('tr-TR')}</p>}
                      {t.dayanakUrl && <a href={t.dayanakUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-300 hover:underline">Dayanak</a>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Faz 4: Mevzuat AI Sohbet */}
          <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-5">
            <h2 className="font-semibold mb-3 flex items-center gap-2"><FileText className="w-5 h-5" /> Mevzuat Asistanı</h2>
            <p className="text-xs text-blue-100/60 mb-3">Mevzuat kayıtlarına dayalı sorular sorun. Yanıtlar kaynak bağlantısı içerir.</p>
            <div className="space-y-2 max-h-64 overflow-y-auto mb-3">
              {chatMesajlar.map((m, i) => (
                <div key={i} className={`rounded-lg p-3 text-sm ${m.role === 'user' ? 'bg-blue-600/30 ml-8' : 'bg-blue-900/40 mr-8'}`}>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.source && <p className="mt-1 text-xs text-blue-300/60">Kaynak: {m.source}</p>}
                </div>
              ))}
              {chatYukleniyor && <div className="flex items-center gap-2 text-blue-300 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Düşünüyor...</div>}
            </div>
            <div className="flex gap-2">
              <input value={chatSoru} onChange={e => setChatSoru(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSoru() } }} placeholder="Örn: Bu hafta hangi beyannamelerin son günü?" className="flex-1 bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
              <button onClick={handleChatSoru} disabled={chatYukleniyor || !chatSoru.trim()} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">Gönder</button>
            </div>
          </div>

          {(takvimGorunur || beyanGorunur) && (
            <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-5">
              <h2 className="font-semibold">Mevcut takip ekranları</h2>
              <p className="mt-1 text-sm text-blue-100/70">Bu ekranlardaki tarihler ayrıca resmî kaynaklarla kontrol edilmelidir.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                {takvimGorunur && <Link to="/admin/tax-calendar" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"><CalendarDays className="w-4 h-4" /> Vergi Takvimi</Link>}
                {beyanGorunur && <Link to="/admin/aylik-beyan-takip" className="inline-flex items-center gap-2 rounded-lg border border-blue-400/30 px-4 py-2 text-sm font-medium hover:bg-blue-800/50"><FileText className="w-4 h-4" /> Aylık Beyan Takip</Link>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== KAYNAKLAR ===================== */}
      {aktifTab === 'kaynaklar' && (
        <div className="space-y-4">
          {kaynakFormAcik && (
            <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-5 space-y-3">
              <h2 className="font-semibold">Yeni Kaynak Ekle</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <input placeholder="Kaynak adı" value={yeniKaynak.ad} onChange={e => setYeniKaynak(p => ({ ...p, ad: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
                <select value={yeniKaynak.kurum} onChange={e => setYeniKaynak(p => ({ ...p, kurum: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm">
                  {KURUMLAR.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                <input placeholder="URL" value={yeniKaynak.url} onChange={e => setYeniKaynak(p => ({ ...p, url: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm sm:col-span-2" />
                <select value={yeniKaynak.tip} onChange={e => setYeniKaynak(p => ({ ...p, tip: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm">
                  {KAYNAK_TİPLERİ.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={yeniKaynak.erisim_yontemi} onChange={e => setYeniKaynak(p => ({ ...p, erisim_yontemi: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm">
                  <option value="scrape">Scrape</option><option value="api">API</option><option value="rss">RSS</option><option value="manual">Manuel</option>
                </select>
                <input type="number" placeholder="Tarama aralığı (dk)" value={yeniKaynak.tarama_araligi_dakika} onChange={e => setYeniKaynak(p => ({ ...p, tarama_araligi_dakika: parseInt(e.target.value) || 1440 }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
                <textarea placeholder="Açıklama" value={yeniKaynak.aciklama} onChange={e => setYeniKaynak(p => ({ ...p, aciklama: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm sm:col-span-2" rows={2} />
              </div>
              <div className="flex gap-2">
                <button onClick={handleKaynakEkle} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium">Kaydet</button>
                <button onClick={() => setKaynakFormAcik(false)} className="bg-blue-700/50 hover:bg-blue-600/50 text-white px-4 py-2 rounded-lg text-sm font-medium">İptal</button>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-blue-900/40 text-blue-300 text-xs"><tr><th className="text-left px-4 py-3">Ad</th><th className="text-left px-4 py-3">Kurum</th><th className="text-left px-4 py-3">URL</th><th className="text-left px-4 py-3">Tip</th><th className="text-left px-4 py-3">Aktif</th><th className="text-left px-4 py-3">Son Tarama</th><th className="text-left px-4 py-3">Hata</th><th className="text-left px-4 py-3">İşlem</th></tr></thead>
              <tbody>
                {kaynaklar.map(k => (
                  <tr key={k.id} className="border-t border-blue-400/10 hover:bg-blue-800/20">
                    <td className="px-4 py-3 font-medium">{k.ad}</td>
                    <td className="px-4 py-3">{k.kurum}</td>
                    <td className="px-4 py-3"><a href={k.url} target="_blank" rel="noopener noreferrer" className="text-blue-300 hover:underline truncate block max-w-xs">{k.url}</a></td>
                    <td className="px-4 py-3">{k.tip}</td>
                    <td className="px-4 py-3">{k.aktif ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}</td>
                    <td className="px-4 py-3 text-xs">{k.son_tarama ? new Date(k.son_tarama).toLocaleString('tr-TR') : '-'}</td>
                    <td className="px-4 py-3 text-xs text-red-300">{k.hata_sayisi || 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => handleTara(k.id)} disabled={taramaCalisiyor} className="p-1.5 rounded hover:bg-emerald-500/20 text-emerald-400" title="Tara"><RefreshCw className="w-4 h-4" /></button>
                        <button onClick={() => handleKaynakTest(k)} className="p-1.5 rounded hover:bg-blue-500/20 text-blue-400" title="Erişim Testi"><Search className="w-4 h-4" /></button>
                        <button onClick={() => handleKaynakSil(k.id)} className="p-1.5 rounded hover:bg-red-500/20 text-red-400" title="Sil"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {kaynaklar.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-blue-100/60">Henüz kaynak eklenmedi. "Yeni Kaynak" ile başlayın.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================== KAYITLAR ===================== */}
      {aktifTab === 'kayitlar' && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <select value={incelemeFiltre} onChange={e => setIncelemeFiltre(e.target.value)} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm">
              <option value="">Tümü</option>
              <option value="bekliyor">İnceleme Bekleyen</option>
              <option value="onaylandi">Onaylanan</option>
              <option value="reddedildi">Reddedilen</option>
            </select>
            <button onClick={yukle} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"><RefreshCw className="w-4 h-4" /> Yenile</button>
          </div>
          <div className="space-y-3">
            {kayitlar.map(k => (
              <div key={k.id} className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{k.baslik}</h3>
                      <span className={`px-2 py-0.5 rounded text-xs ${k.inceleme_durumu === 'onaylandi' ? 'bg-emerald-500/20 text-emerald-300' : k.inceleme_durumu === 'reddedildi' ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'}`}>{INCELEME_ETIKET[k.inceleme_durumu] || k.inceleme_durumu}</span>
                    </div>
                    <p className="mt-1 text-sm text-blue-100/70">{k.kurum} · {k.yayin_tarihi ? new Date(k.yayin_tarihi).toLocaleDateString('tr-TR') : 'Tarih yok'}</p>
                    {k.ozet && <p className="mt-2 text-sm text-blue-100/80 whitespace-pre-wrap line-clamp-4">{k.ozet}</p>}
                    {k.tarama_hatasi && <p className="mt-2 text-xs text-red-300">Tarama hatası: {k.tarama_hatasi}</p>}
                    {k.metin_okunamadi && <p className="mt-1 text-xs text-amber-300">Metin okunamadı</p>}
                    <a href={k.kaynak_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-blue-300 hover:underline"><ExternalLink className="w-3 h-3" /> Kaynak</a>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <button onClick={() => setDetayKayit(k)} className="text-xs bg-blue-700/50 hover:bg-blue-600/50 text-white px-3 py-1.5 rounded-lg">Detay</button>
                    <button onClick={() => handleKuralEkle(k)} className="text-xs bg-emerald-600/80 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg">Kural Onayla</button>
                    <button onClick={() => handleIncelemeKarar(k.id, 'onay', '')} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg">Onayla</button>
                    <button onClick={() => handleIncelemeKarar(k.id, 'red', '')} className="text-xs bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg">Reddet</button>
                  </div>
                </div>
                {k.tarih_adaylari && (
                  <div className="mt-3 text-xs text-blue-200/70">
                    <span className="font-medium">Tarih adayları:</span>{' '}
                    {['beyan', 'odeme', 'sgk', 'basvuru'].map(kat => {
                      const arr = k.tarih_adaylari[kat] || []
                      if (!arr.length) return null
                      return <span key={kat} className="mr-3">{kat}: {arr.map(t => `${t.gun}.${t.ay}.${t.yil}`).join(', ')}</span>
                    })}
                  </div>
                )}
              </div>
            ))}
            {kayitlar.length === 0 && <p className="text-blue-100/60 text-sm">Henüz mevzuat kaydı yok. Kaynakları tarayın.</p>}
          </div>
        </div>
      )}

      {/* ===================== İNCELEME BEKLEYEN ===================== */}
      {aktifTab === 'inceleme' && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <button onClick={() => { setIncelemeFiltre('bekliyor'); yukle() }} className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium hover:bg-amber-500"><ShieldAlert className="w-4 h-4" /> İnceleme Bekleyenler</button>
            <button onClick={() => { setIncelemeFiltre(''); yukle() }} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500">Tümü</button>
          </div>
          <div className="space-y-3">
            {kayitlar.map(k => (
              <div key={k.id} className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-5">
                <h3 className="font-semibold">{k.baslik}</h3>
                <p className="mt-1 text-sm text-blue-100/70">{k.kurum} · {k.kaynak_url}</p>
                {k.ozet && <p className="mt-2 text-sm text-blue-100/80 whitespace-pre-wrap">{k.ozet}</p>}
                <div className="mt-3 flex gap-2 flex-wrap">
                  <button onClick={() => handleIncelemeKarar(k.id, 'onay', '')} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg">Onayla</button>
                  <button onClick={() => handleIncelemeKarar(k.id, 'red', '')} className="text-xs bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg">Reddet</button>
                  <button onClick={() => handleIncelemeKarar(k.id, 'ertele', '')} className="text-xs bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded-lg">Ertele</button>
                  <button onClick={() => handleKuralEkle(k)} className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg">Kural Onayla</button>
                  <a href={k.kaynak_url} target="_blank" rel="noopener noreferrer" className="text-xs bg-blue-700/50 hover:bg-blue-600/50 text-white px-3 py-1.5 rounded-lg inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Kaynağı Aç</a>
                </div>
              </div>
            ))}
            {kayitlar.length === 0 && <p className="text-blue-100/60 text-sm">İnceleme bekleyen kayıt yok.</p>}
          </div>
        </div>
      )}

      {/* ===================== KURALLAR ===================== */}
      {aktifTab === 'kurallar' && (
        <div className="space-y-4">
          <p className="text-sm text-blue-100/70">Onaylanmış mevzuat kuralları. Mükellef eşleştirme ve görev atama buradan yapılır.</p>
          <div className="space-y-3">
            {kurallar.map(k => (
              <div key={k.id} className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{k.baslik}</h3>
                      <span className={`px-2 py-0.5 rounded text-xs ${k.durum === 'aktif' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-500/20 text-gray-300'}`}>{k.durum}</span>
                      <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-300">{k.kural_tipi}</span>
                    </div>
                    {k.konu && <p className="mt-1 text-sm text-blue-100/70">{k.konu}</p>}
                    {k.tarih && <p className="mt-1 text-xs text-blue-300">Tarih: {new Date(k.tarih).toLocaleDateString('tr-TR')}</p>}
                    {k.son_basvuru_tarihi && <p className="mt-1 text-xs text-amber-300">Son başvuru: {new Date(k.son_basvuru_tarihi).toLocaleDateString('tr-TR')}</p>}
                    {k.dayanak_url && <a href={k.dayanak_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-blue-300 hover:underline"><ExternalLink className="w-3 h-3" /> Dayanak</a>}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <button onClick={() => handleMukellefEslestir(k)} disabled={eslesmeYukleniyor} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
                      {eslesmeYukleniyor ? 'Eşleştiriliyor...' : 'Mükellef Eşleştir'}
                    </button>
                    <button onClick={() => handleMevzuatBildirim(k, false)} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg">Bildirim Gönder</button>
                    <button onClick={() => handleMevzuatBildirim(k, true)} className="text-xs bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded-lg">Müşterilere Bildir</button>
                  </div>
                </div>
              </div>
            ))}
            {kurallar.length === 0 && <p className="text-blue-100/60 text-sm">Henüz onaylanmış kural yok. Mevzuat Kayıtları'ndan "Kural Onayla" ile oluşturun.</p>}
          </div>
        </div>
      )}

      {/* ===================== EŞLEŞMELER ===================== */}
      {aktifTab === 'eslesmeler' && (
        <div className="space-y-4">
          <p className="text-sm text-blue-100/70">Mükellef etki analizi sonuçları (aday eşleşmeler). Kesin uygunluk değildir — kontrol gerekli işaretli olanlar incelenmelidir.</p>
          {eslesmeler.length === 0 ? <p className="text-blue-100/60 text-sm">Henüz eşleşme yok. Onaylı Kurallar sekmesinden "Mükellef Eşleştir" ile oluşturun.</p> : (
            <div className="space-y-2">
              {eslesmeler.map(e => (
                <div key={e.id} className={`rounded-xl border p-4 ${e.kontrol_gerekli ? 'border-amber-400/40 bg-amber-500/5' : 'border-blue-400/20 bg-blue-950/50'}`}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{clientAdi(e.client_id)}</span>
                        <span className={`px-2 py-0.5 rounded text-xs ${e.eslesme_tipi === 'aday' ? 'bg-emerald-500/20 text-emerald-300' : e.eslesme_tipi === 'kontrol_gerekli' ? 'bg-amber-500/20 text-amber-300' : 'bg-gray-500/20 text-gray-300'}`}>{e.eslesme_tipi}</span>
                        {e.kontrol_gerekli && <span className="text-amber-300 text-xs">⚠ Kontrol gerekli</span>}
                      </div>
                      {e.gerekce && <p className="mt-1 text-sm text-blue-100/70">{e.gerekce}</p>}
                      {e.eksik_bilgiler && <p className="mt-1 text-xs text-red-300">Eksik: {Array.isArray(e.eksik_bilgiler) ? e.eksik_bilgiler.join(', ') : e.eksik_bilgiler}</p>}
                    </div>
                    <button onClick={() => handleGorevOlusturTek(e)} className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg shrink-0">Görev Ata</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* ===================== GÖREVLER ===================== */}
      {aktifTab === 'gorevler' && (
        <div className="space-y-4">
          <button onClick={() => handleMukellefEslestirTumu()} disabled={eslesmeYukleniyor} className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium hover:bg-purple-500 disabled:opacity-50">
            {eslesmeYukleniyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />} Tüm Kuralları Eşleştir
          </button>
          {gorevFormAcik && (
            <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-5 space-y-3">
              <input placeholder="Görev başlığı" value={yeniGorev.baslik} onChange={e => setYeniGorev(p => ({ ...p, baslik: e.target.value }))} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
              <textarea placeholder="Açıklama" value={yeniGorev.aciklama} onChange={e => setYeniGorev(p => ({ ...p, aciklama: e.target.value }))} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" rows={2} />
              <div className="grid gap-3 sm:grid-cols-3">
                <input type="date" value={yeniGorev.son_tarih} onChange={e => setYeniGorev(p => ({ ...p, son_tarih: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
                <select value={yeniGorev.oncelik} onChange={e => setYeniGorev(p => ({ ...p, oncelik: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm">
                  {Object.entries(ONCELIKLER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input placeholder="Sorumlu kullanıcı ID (opsiyonel)" value={yeniGorev.sorumlu_user_id} onChange={e => setYeniGorev(p => ({ ...p, sorumlu_user_id: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
              </div>
              <div className="flex gap-2">
                <button onClick={handleGorevEkle} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium">Kaydet</button>
                <button onClick={() => setGorevFormAcik(false)} className="bg-blue-700/50 hover:bg-blue-600/50 text-white px-4 py-2 rounded-lg text-sm font-medium">İptal</button>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {gorevler.map(g => (
              <div key={g.id} className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium">{g.baslik}</h3>
                    <span className={`px-2 py-0.5 rounded text-xs ${g.durum === 'tamamlandi' ? 'bg-emerald-500/20 text-emerald-300' : g.durum === 'iptal' ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'}`}>{GOREV_DURUMLARI[g.durum] || g.durum}</span>
                    <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-300">{ONCELIKLER[g.oncelik] || g.oncelik}</span>
                  </div>
                  {g.aciklama && <p className="mt-1 text-sm text-blue-100/70">{g.aciklama}</p>}
                  {g.son_tarih && <p className="mt-1 text-xs text-blue-300">Son tarih: {new Date(g.son_tarih).toLocaleDateString('tr-TR')}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  {g.durum !== 'tamamlandi' && <button onClick={() => handleGorevDurum(g.id, 'tamamlandi')} className="p-1.5 rounded hover:bg-emerald-500/20 text-emerald-400" title="Tamamla"><CheckCircle className="w-4 h-4" /></button>}
                  {g.durum !== 'iptal' && <button onClick={() => handleGorevDurum(g.id, 'iptal')} className="p-1.5 rounded hover:bg-red-500/20 text-red-400" title="İptal"><XCircle className="w-4 h-4" /></button>}
                  {g.durum === 'bekliyor' && <button onClick={() => handleGorevDurum(g.id, 'devam')} className="p-1.5 rounded hover:bg-amber-500/20 text-amber-400" title="Başla"><Clock className="w-4 h-4" /></button>}
                </div>
              </div>
            ))}
            {gorevler.length === 0 && <p className="text-blue-100/60 text-sm">Henüz görev yok.</p>}
          </div>
        </div>
      )}

      {/* ===================== DETAY MODAL ===================== */}
      {detayKayit && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-blue-950 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-blue-700/50 shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">{detayKayit.baslik}</h2>
              <button onClick={() => setDetayKayit(null)} className="text-gray-400 hover:text-white"><XCircle className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <p><span className="text-blue-300 font-medium">Kurum:</span> {detayKayit.kurum}</p>
              <p><span className="text-blue-300 font-medium">Yayın tarihi:</span> {detayKayit.yayin_tarihi ? new Date(detayKayit.yayin_tarihi).toLocaleDateString('tr-TR') : '-'}</p>
              <p><span className="text-blue-300 font-medium">Yürürlük tarihi:</span> {detayKayit.yururluk_tarihi ? new Date(detayKayit.yururluk_tarihi).toLocaleDateString('tr-TR') : '-'}</p>
              <p><span className="text-blue-300 font-medium">Kaynak:</span> <a href={detayKayit.kaynak_url} target="_blank" rel="noopener noreferrer" className="text-blue-300 hover:underline">{detayKayit.kaynak_url}</a></p>
              {detayKayit.ozet && <div><span className="text-blue-300 font-medium">Özet:</span><p className="mt-1 whitespace-pre-wrap text-blue-100/80">{detayKayit.ozet}</p></div>}
              {detayKayit.ham_metin && <details className="mt-2"><summary className="cursor-pointer text-blue-300">Ham metin</summary><p className="mt-2 whitespace-pre-wrap text-xs text-blue-100/60 max-h-64 overflow-y-auto">{detayKayit.ham_metin}</p></details>}
              {detayKayit.tarih_adaylari && <div><span className="text-blue-300 font-medium">Tarih adayları:</span><pre className="mt-1 text-xs text-blue-100/60 bg-blue-900/30 p-2 rounded">{JSON.stringify(detayKayit.tarih_adaylari, null, 2)}</pre></div>}
            </div>
            <div className="mt-5 flex gap-2 flex-wrap">
              <button onClick={() => handleIncelemeKarar(detayKayit.id, 'onay', '')} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium">Onayla</button>
              <button onClick={() => handleIncelemeKarar(detayKayit.id, 'red', '')} className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium">Reddet</button>
              <button onClick={() => handleIncelemeKarar(detayKayit.id, 'ertele', '')} className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium">Ertele</button>
              <button onClick={() => handleKuralEkle(detayKayit)} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">Kural Onayla</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}