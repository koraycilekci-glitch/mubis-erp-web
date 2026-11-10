import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  BookOpen, Users, FileSpreadsheet, Plus, Search, Pencil, Trash2, X, Save,
  Printer, FileDown, ClipboardCopy, Check, AlertTriangle, TrendingUp, TrendingDown,
  Wallet, Clock, ChevronDown, ChevronUp, Receipt, HandCoins, Copy, Upload, Download, MessageCircle, ArrowLeftRight, Banknote, Send, Mail, Loader2, CircleHelp
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { createUnicodePdf } from '../utils/unicodePdf'
import { supabase } from '../lib/supabase'
import { hesapPlaniGetir } from '../services/muhasebeService'
import { openWhatsAppWeb, sendDocumentViaWhatsAppChannel, sendEmail } from '../services/whatsappService'
import { gibYardimciIs } from '../utils/gibOdemeHelper'
import {
  cariKartlariGetir, cariKartEkle, cariKartGuncelle, cariKartSil, cariKartlarSil, cariKartlariTopluEkle,
  cariHareketleriGetir, cariHareketEkle, cariHareketGuncelle, cariHareketSil,
  cariOzetHesapla, yasantdirmaHesapla, aylikHareketOzeti, ekstreHesapla, cariVirmanYap,
  cariCekSenetDurumGuncelle, ekstrePdfYukle,
  CARI_ISLEM_TURLERI, CARI_DOVIZLER, CARI_ODEME_YONTEMLERI, CARI_CEK_SENET_DURUMLARI
} from '../services/cariHesapService'

const paraYaz = (n) => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const tl = (n) => paraYaz(n) + ' ₺'
const bugunStr = () => new Date().toISOString().slice(0, 10)
const dovizMetni = (h) => (h?.para_birimi && h.para_birimi !== 'TL' && Number(h.doviz_tutar) > 0) ? `${paraYaz(h.doviz_tutar)} ${h.para_birimi} @ ${paraYaz(h.doviz_kur)}` : ''
const odemeEtiketi = (id) => CARI_ODEME_YONTEMLERI.find(o => o.id === id)?.label || ''
const limitAsildi = (k) => Number(k.parasal_limit) > 0 && k.bakiye > Number(k.parasal_limit)
const cekSenetDurumBilgi = (id) => CARI_CEK_SENET_DURUMLARI.find(d => d.id === (id || 'portfoyde')) || CARI_CEK_SENET_DURUMLARI[0]

function KpiKart({ baslik, deger, ikon: Ikon, renk, alt }) {
  return (
    <div className="bg-blue-950/50 rounded-xl p-4 border border-blue-800/30">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400">{baslik}</span>
        <Ikon className={`w-4 h-4 ${renk}`} />
      </div>
      <div className={`text-lg font-bold ${renk}`}>{deger}</div>
      {alt && <div className="text-[11px] text-gray-500 mt-1">{alt}</div>}
    </div>
  )
}

function BakiyeEtiket({ bakiye }) {
  if (Math.abs(bakiye) < 0.005) return <span className="text-gray-400 text-xs">Kapandı</span>
  return bakiye > 0
    ? <span className="text-emerald-400 text-xs font-medium">Alacaklıyız (+{paraYaz(bakiye)})</span>
    : <span className="text-rose-400 text-xs font-medium">Borçluyuz (−{paraYaz(Math.abs(bakiye))})</span>
}

// ==================== KART FORMU ====================
function KartFormModal({ kart, kaydet, kapat }) {
  const [form, setForm] = useState(kart || { unvan: '', kod: '', tur: 'musteri', paraBirimi: 'TL', vkn: '', telefon: '', email: '', sehir: '', adres: '', vergiDairesi: '', acikHesap: true, vadeGunu: 30, parasalLimit: 0, notlar: '', durum: 'aktif' })
  const alan = (k) => ({ value: form[k] ?? '', onChange: e => setForm({ ...form, [k]: e.target.value }) })
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={kapat}>
      <div className="bg-[#0a1730] border border-blue-700/40 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-blue-800/40 shrink-0">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2"><Users className="w-5 h-5 text-yellow-400" />{kart ? 'Cari Kartı Düzenle' : 'Yeni Cari Kartı'}</h3>
          <button onClick={kapat} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-5 overflow-y-auto">
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-400 mb-1">Ünvan / Ad Soyad *</label>
            <input {...alan('unvan')} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white" placeholder="ABC Ticaret Ltd. Şti." />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Cari Kodu</label>
            <input {...alan('kod')} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white" placeholder="120.01" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Tür</label>
            <select {...alan('tur')} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white">
              <option value="musteri">Müşteri</option>
              <option value="tedarikci">Tedarikçi</option>
              <option value="her-ikisi">Her İkisi</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Para Birimi</label>
            <select {...alan('paraBirimi')} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white">
              {CARI_DOVIZLER.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">VKN / TC</label>
            <input {...alan('vkn')} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Vergi Dairesi</label>
            <input {...alan('vergiDairesi')} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Telefon</label>
            <input {...alan('telefon')} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">E-posta</label>
            <input {...alan('email')} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Şehir</label>
            <input {...alan('sehir')} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Vade (gün)</label>
            <input type="number" min="0" {...alan('vadeGunu')} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Parasal Limit (₺)</label>
            <input type="number" min="0" step="0.01" {...alan('parasalLimit')} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white" placeholder="0" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-400 mb-1">Adres</label>
            <input {...alan('adres')} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-400 mb-1">Notlar</label>
            <textarea {...alan('notlar')} rows={2} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white" />
          </div>
          <label className="sm:col-span-2 flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={form.acikHesap !== false} onChange={e => setForm({ ...form, acikHesap: e.target.checked })} className="accent-yellow-500" />
            Açık hesap çalışıyoruz
          </label>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-blue-800/40 shrink-0">
          <button onClick={kapat} className="px-4 py-2 rounded-lg text-sm text-gray-300 hover:text-white">İptal</button>
          <button onClick={() => kaydet(form)} disabled={!form.unvan?.trim()} className="flex items-center gap-1.5 bg-gradient-to-r from-yellow-400 to-yellow-500 text-blue-950 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
            <Save className="w-4 h-4" /> Kaydet
          </button>
        </div>
      </div>
    </div>, document.body)
}

// ==================== HAREKET FORMU ====================
function HareketFormModal({ hareket, varsayilanKart, kartlar, kaydet, kapat }) {
  const [form, setForm] = useState(hareket || {
    kartId: varsayilanKart?.id || '', tarih: bugunStr(), vadeTarihi: '', islemTuru: 'satis-fatura', belgeNo: '', aciklama: '', borc: '', alacak: '',
    paraBirimi: varsayilanKart?.para_birimi || 'TL', dovizTutar: '', dovizKur: '', odemeYontemi: ''
  })
  const seciliTur = CARI_ISLEM_TURLERI.find(t => t.id === form.islemTuru)
  const dovizAktif = form.paraBirimi && form.paraBirimi !== 'TL'
  const aktifAlan = seciliTur?.borcMu === false ? 'alacak' : 'borc'
  const set = (k) => ({ value: form[k] ?? '', onChange: e => setForm({ ...form, [k]: e.target.value }) })
  const dovizDegisti = (k, v) => {
    const g = { ...form, [k]: v }
    const kar = (Number(g.dovizTutar) || 0) * (Number(g.dovizKur) || 0)
    if (kar > 0) g[aktifAlan] = kar.toFixed(2)
    setForm(g)
  }
  const kartDegisti = (id) => {
    const kart = kartlar.find(k => k.id === Number(id))
    const g = { ...form, kartId: id }
    if (kart?.para_birimi) g.paraBirimi = kart.para_birimi
    if (kart?.vade_gunu) {
      const v = new Date(form.tarih || bugunStr()); v.setDate(v.getDate() + kart.vade_gunu)
      g.vadeTarihi = v.toISOString().slice(0, 10)
    }
    setForm(g)
  }
  const turDegisti = (id) => {
    const t = CARI_ISLEM_TURLERI.find(x => x.id === id)
    const g = { ...form, islemTuru: id }
    if (t?.borcMu === true) { g.borc = form.borc || form.alacak || ''; g.alacak = '' }
    if (t?.borcMu === false) { g.alacak = form.alacak || form.borc || ''; g.borc = '' }
    // vadeyi kartin vade gununden hesapla
    const kart = kartlar.find(k => k.id === Number(form.kartId))
    if (kart?.vade_gunu) {
      const v = new Date(form.tarih || bugunStr()); v.setDate(v.getDate() + kart.vade_gunu)
      g.vadeTarihi = v.toISOString().slice(0, 10)
    }
    setForm(g)
  }
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={kapat}>
      <div className="bg-[#0a1730] border border-blue-700/40 rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-blue-800/40 shrink-0">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2"><Receipt className="w-5 h-5 text-yellow-400" />{hareket ? 'Hareketi Düzenle' : 'Hareket Girişi'}</h3>
          <button onClick={kapat} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3 p-5 overflow-y-auto">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Cari Kart *</label>
            <select value={form.kartId} onChange={e => kartDegisti(e.target.value)} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white">
              <option value="">Seçiniz...</option>
              {kartlar.map(k => <option key={k.id} value={k.id}>{k.unvan}{k.kod ? ` (${k.kod})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">İşlem Türü</label>
            <select value={form.islemTuru} onChange={e => turDegisti(e.target.value)} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white">
              {CARI_ISLEM_TURLERI.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Tarih *</label>
              <input type="date" {...set('tarih')} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Vade Tarihi</label>
              <input type="date" {...set('vadeTarihi')} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Belge / Fiş No</label>
            <input {...set('belgeNo')} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Para Birimi</label>
              <select
                value={form.paraBirimi || 'TL'}
                onChange={e => setForm({ ...form, paraBirimi: e.target.value, dovizTutar: e.target.value === 'TL' ? '' : form.dovizTutar, dovizKur: e.target.value === 'TL' ? '' : form.dovizKur })}
                className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white"
              >
                {CARI_DOVIZLER.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Ödeme Yöntemi</label>
              <select {...set('odemeYontemi')} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white">
                <option value="">—</option>
                {CARI_ODEME_YONTEMLERI.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
          </div>
          {dovizAktif && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Döviz Tutarı ({form.paraBirimi})</label>
                <input type="number" step="0.01" min="0" value={form.dovizTutar ?? ''} onChange={e => dovizDegisti('dovizTutar', e.target.value)} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white" placeholder="0,00" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Kur (₺)</label>
                <input type="number" step="0.0001" min="0" value={form.dovizKur ?? ''} onChange={e => dovizDegisti('dovizKur', e.target.value)} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white" placeholder="0,0000" />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3 text-emerald-400" /> Borç (₺){dovizAktif ? ' — otomatik' : ''}</label>
              <input type="number" step="0.01" min="0" {...set('borc')} readOnly={dovizAktif} disabled={seciliTur?.borcMu === false} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white disabled:opacity-40 read-only:opacity-60" placeholder="0,00" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1"><TrendingDown className="w-3 h-3 text-rose-400" /> Alacak (₺){dovizAktif ? ' — otomatik' : ''}</label>
              <input type="number" step="0.01" min="0" {...set('alacak')} readOnly={dovizAktif} disabled={seciliTur?.borcMu === true} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white disabled:opacity-40 read-only:opacity-60" placeholder="0,00" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Açıklama</label>
            <input {...set('aciklama')} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={kapat} className="px-4 py-2 rounded-lg text-sm text-gray-300 hover:text-white">İptal</button>
          <button
            onClick={() => kaydet(form)}
            disabled={!form.kartId || !form.tarih || ((Number(form.borc) || 0) <= 0 && (Number(form.alacak) || 0) <= 0)}
            className="flex items-center gap-1.5 bg-gradient-to-r from-yellow-400 to-yellow-500 text-blue-950 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> Kaydet
          </button>
        </div>
      </div>
    </div>, document.body)
}

// ==================== VERI AKTARIMI ====================
function VeriAktarimSekmesi({ clientId, kartlar, bitti }) {
  const [onizleme, setOnizleme] = useState(null) // { kartlar, hareketler, dosyaAdi }
  const [sonuc, setSonuc] = useState(null)
  const [hatalar, setHatalar] = useState([])
  const [isliyor, setIsliyor] = useState(false)

  const tarihDuzelt = (v) => {
    if (!v) return ''
    if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10)
    const s = String(v).trim()
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    const n = Number(s)
    if (n > 20000 && n < 60000) {
      const d = new Date(Date.UTC(1899, 11, 30 + n))
      return d.toISOString().slice(0, 10)
    }
    return ''
  }
  const sayiDuzelt = (v) => {
    if (typeof v === 'number') return v
    if (v == null || v === '') return 0
    let s = String(v).trim()
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(',', '.')
    const n = Number(s)
    return isNaN(n) ? 0 : n
  }

  const sablonIndir = () => {
    import('xlsx').then(XLSX => {
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[
        'Kod', 'Ünvan', 'Tür (musteri/tedarikci/her-ikisi)', 'VKN', 'Vergi Dairesi', 'Telefon', 'E-posta', 'Şehir', 'Adres',
        'Para Birimi (TL/USD/EUR/GBP)', 'Vade (gün)', 'Açık Hesap (E/H)', 'Açılış Borç', 'Açılış Alacak', 'Notlar'
      ]]), 'Kartlar')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[
        'Cari Kodu veya Ünvan', 'Tarih (GG.AA.YYYY)', 'İşlem Türü', 'Belge No', 'Açıklama', 'Vade Tarihi', 'Borç', 'Alacak',
        'Para Birimi', 'Döviz Tutarı', 'Kur', 'Ödeme Yöntemi (nakit/havale-eft/cek/senet/kredi-karti/diger)'
      ]]), 'Hareketler')
      XLSX.writeFile(wb, 'Cari_Veraktarim_Sablon.xlsx')
    })
  }

  const dosyaSecildi = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    e.target.value = ''
    import('xlsx').then(XLSX => {
      f.arrayBuffer().then(buf => {
        const wb = XLSX.read(buf, { cellDates: true })
        const ks = wb.Sheets['Kartlar'] ? XLSX.utils.sheet_to_json(wb.Sheets['Kartlar'], { header: 1, defval: '' }) : []
        const hs = wb.Sheets['Hareketler'] ? XLSX.utils.sheet_to_json(wb.Sheets['Hareketler'], { header: 1, defval: '' }) : []
        const kartSatirlari = ks.slice(1).filter(r => r.some(c => String(c).trim() !== '')).map(r => ({
          kod: String(r[0] ?? '').trim(),
          unvan: String(r[1] ?? '').trim(),
          tur: ['musteri', 'tedarikci', 'her-ikisi'].includes(String(r[2] ?? '').trim().toLocaleLowerCase('tr')) ? String(r[2]).trim().toLocaleLowerCase('tr') : 'musteri',
          vkn: String(r[3] ?? '').trim(),
          vergiDairesi: String(r[4] ?? '').trim(),
          telefon: String(r[5] ?? '').trim(),
          email: String(r[6] ?? '').trim(),
          sehir: String(r[7] ?? '').trim(),
          adres: String(r[8] ?? '').trim(),
          paraBirimi: CARI_DOVIZLER.includes(String(r[9] ?? '').trim().toUpperCase()) ? String(r[9]).trim().toUpperCase() : 'TL',
          vadeGunu: sayiDuzelt(r[10]) || 30,
          acikHesap: String(r[11] ?? '').trim().toLocaleUpperCase('tr') !== 'H',
          acilisBorc: sayiDuzelt(r[12]),
          acilisAlacak: sayiDuzelt(r[13]),
          notlar: String(r[14] ?? '').trim()
        }))
        const turHarita = {}
        CARI_ISLEM_TURLERI.forEach(t => { turHarita[t.label.toLocaleLowerCase('tr')] = t.id; turHarita[t.id] = t.id })
        const hrSatirlari = hs.slice(1).filter(r => r.some(c => String(c).trim() !== '')).map(r => ({
          kartAnahtar: String(r[0] ?? '').trim(),
          tarih: tarihDuzelt(r[1]),
          islemTuru: turHarita[String(r[2] ?? '').trim().toLocaleLowerCase('tr')] || 'manuel-borc',
          belgeNo: String(r[3] ?? '').trim(),
          aciklama: String(r[4] ?? '').trim(),
          vadeTarihi: tarihDuzelt(r[5]),
          borc: sayiDuzelt(r[6]),
          alacak: sayiDuzelt(r[7]),
          paraBirimi: CARI_DOVIZLER.includes(String(r[8] ?? '').trim().toUpperCase()) ? String(r[8]).trim().toUpperCase() : 'TL',
          dovizTutar: r[9] === '' ? null : sayiDuzelt(r[9]),
          dovizKur: r[10] === '' ? null : sayiDuzelt(r[10]),
          odemeYontemi: CARI_ODEME_YONTEMLERI.find(o => o.id === String(r[11] ?? '').trim().toLocaleLowerCase('tr'))?.id || null
        }))
        setOnizleme({ kartlar: kartSatirlari, hareketler: hrSatirlari, dosyaAdi: f.name })
        setSonuc(null); setHatalar([])
      })
    })
  }

  const aktar = async () => {
    if (!onizleme) return
    setIsliyor(true)
    const hataListesi = []
    let kartAdet = 0, hareketAdet = 0
    try {
      const kodMap = new Map(); const unvanMap = new Map()
      kartlar.forEach(k => { if (k.kod) kodMap.set(k.kod.trim(), k.id); unvanMap.set((k.unvan || '').toLocaleLowerCase('tr'), k.id) })
      const acilisler = []
      for (const k of onizleme.kartlar) {
        if (!k.unvan) { hataListesi.push('Kart satırı atlandı: ünvan boş'); continue }
        try {
          const yeni = await cariKartEkle(clientId, k)
          kartAdet++
          if (yeni.kod) kodMap.set(yeni.kod.trim(), yeni.id)
          unvanMap.set(yeni.unvan.toLocaleLowerCase('tr'), yeni.id)
          if (k.acilisBorc > 0 || k.acilisAlacak > 0) acilisler.push({ kartId: yeni.id, borc: k.acilisBorc, alacak: k.acilisAlacak })
        } catch (err) { hataListesi.push(`Kart "${k.unvan}": ${err.message}`) }
      }
      for (const a of acilisler) {
        try {
          await cariHareketEkle(clientId, { kartId: a.kartId, tarih: bugunStr(), islemTuru: 'acilis', borc: a.borc, alacak: a.alacak, aciklama: 'Açılış bakiyesi' })
          hareketAdet++
        } catch (err) { hataListesi.push(`Açılış fişi: ${err.message}`) }
      }
      for (const h of onizleme.hareketler) {
        const kartId = kodMap.get(h.kartAnahtar) || unvanMap.get(h.kartAnahtar.toLocaleLowerCase('tr'))
        if (!kartId) { hataListesi.push(`Hareket atlandı: "${h.kartAnahtar}" carisi bulunamadı`); continue }
        if (!h.tarih) { hataListesi.push(`Hareket atlandı: "${h.kartAnahtar}" — tarih geçersiz`); continue }
        try { await cariHareketEkle(clientId, h); hareketAdet++ } catch (err) { hataListesi.push(`Hareket "${h.kartAnahtar}": ${err.message}`) }
      }
      setSonuc({ kartAdet, hareketAdet })
      setHatalar(hataListesi.slice(0, 30))
      setOnizleme(null)
      bitti()
    } finally { setIsliyor(false) }
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-950/40 border border-blue-800/30 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2"><Upload className="w-4 h-4 text-yellow-400" /> Excel ile Toplu Veri Aktarımı</h4>
        <p className="text-[11px] text-gray-400 mb-4">
          Şablonu indirin, "Kartlar" ve "Hareketler" sayfalarını doldurun, dosyayı yükleyin.
          Kart satırlarındaki "Açılış Borç / Açılış Alacak" kolonları otomatik açılış fişine dönüşür;
          hareketlerde cari eşleştirme kod veya ünvan üzerinden yapılır.
        </p>
        <div className="flex gap-2 flex-wrap">
          <button onClick={sablonIndir} className="flex items-center gap-1.5 bg-blue-600/30 border border-blue-500/40 text-blue-100 px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-blue-600/50">
            <Download className="w-4 h-4" /> Şablon İndir
          </button>
          <label className="flex items-center gap-1.5 bg-blue-600/30 border border-blue-500/40 text-blue-100 px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-blue-600/50 cursor-pointer">
            <Upload className="w-4 h-4" /> Dosya Seç (.xlsx / .csv)
            <input type="file" accept=".xlsx,.xls,.csv" onChange={dosyaSecildi} className="hidden" />
          </label>
        </div>
      </div>

      {onizleme && (
        <div className="bg-blue-950/40 border border-blue-800/30 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-white mb-2">Önizleme — {onizleme.dosyaAdi}</h4>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-blue-900/30 rounded-lg p-3">
              <div className="text-xs text-gray-400">Cari Kart</div>
              <div className="text-lg font-bold text-white">{onizleme.kartlar.length} satır</div>
            </div>
            <div className="bg-blue-900/30 rounded-lg p-3">
              <div className="text-xs text-gray-400">Hareket</div>
              <div className="text-lg font-bold text-white">{onizleme.hareketler.length} satır</div>
            </div>
          </div>
          <button onClick={aktar} disabled={isliyor || (!onizleme.kartlar.length && !onizleme.hareketler.length)} className="flex items-center gap-1.5 bg-gradient-to-r from-yellow-400 to-yellow-500 text-blue-950 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
            {isliyor ? 'Aktarılıyor...' : 'İçe Aktar'}
          </button>
          {!onizleme.kartlar.length && !onizleme.hareketler.length && (
            <p className="text-xs text-red-400 mt-2">Dosyada geçerli satır bulunamadı — şablon kolonlarını kontrol edin.</p>
          )}
        </div>
      )}

      {sonuc && (
        <div className="bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 rounded-xl px-4 py-3 text-sm">
          Aktarım tamamlandı: {sonuc.kartAdet} cari kart, {sonuc.hareketAdet} hareket eklendi.
          {hatalar.length > 0 && <div className="text-yellow-300 mt-1">{hatalar.length} satır atlandı (aşağıda).</div>}
        </div>
      )}
      {hatalar.length > 0 && (
        <div className="bg-blue-950/40 border border-blue-800/30 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-yellow-400 mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Atlanan Satırlar</h4>
          <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
            {hatalar.map((h, i) => <li key={i}>{h}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

// ==================== VIRMAN FORMU ====================
function VirmanModal({ kartlar, kaydet, kapat }) {
  const [form, setForm] = useState({ kaynakKartId: '', hedefKartId: '', tutar: '', tarih: bugunStr(), aciklama: '' })
  const set = (k) => ({ value: form[k] ?? '', onChange: e => setForm({ ...form, [k]: e.target.value }) })
  const kaynak = kartlar.find(k => k.id === Number(form.kaynakKartId))
  const hedef = kartlar.find(k => k.id === Number(form.hedefKartId))
  const gecerli = form.kaynakKartId && form.hedefKartId && form.kaynakKartId !== form.hedefKartId && (Number(form.tutar) || 0) > 0
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={kapat}>
      <div className="bg-[#0a1730] border border-blue-700/40 rounded-2xl w-full max-w-md max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-blue-800/40 shrink-0">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2"><ArrowLeftRight className="w-5 h-5 text-yellow-400" /> Cari Virmanı</h3>
          <button onClick={kapat} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3 p-5 overflow-y-auto">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Kaynak Cari (bakiyesi azalır) *</label>
            <select {...set('kaynakKartId')} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white">
              <option value="">Seçiniz...</option>
              {kartlar.map(k => <option key={k.id} value={k.id}>{k.unvan}{k.kod ? ` (${k.kod})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Hedef Cari (bakiyesi artar) *</label>
            <select {...set('hedefKartId')} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white">
              <option value="">Seçiniz...</option>
              {kartlar.filter(k => k.id !== Number(form.kaynakKartId)).map(k => <option key={k.id} value={k.id}>{k.unvan}{k.kod ? ` (${k.kod})` : ''}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Tutar (₺) *</label>
              <input type="number" step="0.01" min="0" {...set('tutar')} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white" placeholder="0,00" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Tarih *</label>
              <input type="date" {...set('tarih')} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Açıklama</label>
            <input {...set('aciklama')} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white" placeholder="Cari virmanı" />
          </div>
          {gecerli && (
            <p className="text-[11px] text-gray-400 bg-blue-900/30 rounded-lg p-2.5">
              <b className="text-gray-200">{kaynak?.unvan}</b> carisinden <b className="text-gray-200">{paraYaz(form.tutar)} ₺</b> düşülüp <b className="text-gray-200">{hedef?.unvan}</b> carisine yazılacak. İki ayrı hareket kaydı oluşur.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-blue-800/40 shrink-0">
          <button onClick={kapat} className="px-4 py-2 rounded-lg text-sm text-gray-300 hover:text-white">İptal</button>
          <button onClick={() => kaydet(form)} disabled={!gecerli} className="flex items-center gap-1.5 bg-gradient-to-r from-yellow-400 to-yellow-500 text-blue-950 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
            <ArrowLeftRight className="w-4 h-4" /> Virmanı Yap
          </button>
        </div>
      </div>
    </div>, document.body)
}

// ==================== EKSTRE PAYLAS ====================
function EkstrePaylasModal({ clientId, kart, donem, hazirla, firmAdi, kapat }) {
  const [telefon, setTelefon] = useState(kart?.telefon || '')
  const [email, setEmail] = useState(kart?.email || '')
  const [mesaj, setMesaj] = useState(`Sayın ${kart?.unvan || ''},\n\n${donem} dönemine ait cari ekstremiz ektedir. Görüşmek üzere sorularınız için bize ulaşabilirsiniz.\n\nSaygılarımızla,\n${firmAdi || ''}`)
  const [gonderiliyor, setGonderiliyor] = useState('')
  const [hata, setHata] = useState('')
  const [tamam, setTamam] = useState('')

  const pdfHazirla = async () => {
    const r = hazirla()
    if (!r) throw new Error('Ekstre bulunamadı')
    const blob = r.pdf.blob()
    return { blob, ad: r.ad }
  }

  const whatsappGonder = async () => {
    setHata(''); setTamam(''); setGonderiliyor('wa')
    try {
      const { blob, ad } = await pdfHazirla()
      const url = await ekstrePdfYukle(clientId, kart.id, donem, blob)
      await sendDocumentViaWhatsAppChannel({ phone: telefon, documentUrl: url, documentName: ad, caption: mesaj, clientId, documentType: 'cari-ekstre' })
      setTamam('WhatsApp gönderimi başlatıldı.')
    } catch (e) { setHata(e.message) } finally { setGonderiliyor('') }
  }

  const emailGonder = async () => {
    setHata(''); setTamam(''); setGonderiliyor('mail')
    try {
      const { blob } = await pdfHazirla()
      const url = await ekstrePdfYukle(clientId, kart.id, donem, blob)
      await sendEmail({ toEmail: email, toName: kart?.unvan, subject: `Cari Ekstre (${donem})`, message: mesaj, documentUrl: url, clientId, documentType: 'cari-ekstre' })
      setTamam('E-posta gönderildi.')
    } catch (e) { setHata(e.message) } finally { setGonderiliyor('') }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={kapat}>
      <div className="bg-[#0a1730] border border-blue-700/40 rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-blue-800/40 shrink-0">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2"><Send className="w-5 h-5 text-yellow-400" /> Ekstre Gönder — {kart?.unvan}</h3>
          <button onClick={kapat} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3 p-5 overflow-y-auto">
          <p className="text-[11px] text-gray-500">PDF otomatik hazırlanıp yüklenir; WhatsApp'ta dosya olarak, e-postada ek olarak gider.</p>
          <div>
            <label className="block text-xs text-gray-400 mb-1">WhatsApp Numarası</label>
            <input value={telefon} onChange={e => setTelefon(e.target.value)} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white" placeholder="5xx xxx xx xx" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">E-posta</label>
            <input value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white" placeholder="ornek@firma.com" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Mesaj</label>
            <textarea value={mesaj} onChange={e => setMesaj(e.target.value)} rows={4} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white resize-none" />
          </div>
          {hata && <p className="text-xs text-red-400">{hata}</p>}
          {tamam && <p className="text-xs text-emerald-400">{tamam}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-blue-800/40 shrink-0">
          <button onClick={kapat} className="px-4 py-2 rounded-lg text-sm text-gray-300 hover:text-white">Kapat</button>
          <button onClick={emailGonder} disabled={!email || !!gonderiliyor} className="flex items-center gap-1.5 bg-blue-600/30 border border-blue-500/40 text-blue-100 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            {gonderiliyor === 'mail' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} E-posta
          </button>
          <button onClick={whatsappGonder} disabled={!telefon || !!gonderiliyor} className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
            {gonderiliyor === 'wa' ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />} WhatsApp
          </button>
        </div>
      </div>
    </div>, document.body)
}

// ==================== CEK/SENET PORTFOYU ====================
function CekSenetSekmesi({ hareketler, kartlar, yukle }) {
  const [filtre, setFiltre] = useState('tumu')
  const bugun = bugunStr()
  const kayitlar = useMemo(() => hareketler
    .filter(h => h.odeme_yontemi === 'cek' || h.odeme_yontemi === 'senet')
    .map(h => ({ ...h, _vade: h.vade_tarihi || h.tarih }))
    .sort((a, b) => (a._vade || '').localeCompare(b._vade || '')),
    [hareketler])
  const portfoyde = kayitlar.filter(k => cekSenetDurumBilgi(k.cek_senet_durum).id === 'portfoyde')
  const vadesiGecen = portfoyde.filter(k => k._vade && k._vade < bugun)
  const buAy = portfoyde.filter(k => k._vade && k._vade.startsWith(bugun.slice(0, 7)))
  const goster = filtre === 'tumu' ? kayitlar : kayitlar.filter(k => cekSenetDurumBilgi(k.cek_senet_durum).id === filtre)
  const kartBul = (id) => kartlar.find(k => k.id === Number(id))
  const tutar = (k) => (Number(k.borc) || 0) + (Number(k.alacak) || 0)
  const toplam = kayitlar.reduce((s, k) => s + tutar(k), 0)
  const portfoyTutar = portfoyde.reduce((s, k) => s + tutar(k), 0)
  const gecenTutar = vadesiGecen.reduce((s, k) => s + tutar(k), 0)
  const buAyTutar = buAy.reduce((s, k) => s + tutar(k), 0)

  const durumDegistir = async (id, durum) => {
    try { await cariCekSenetDurumGuncelle(id, durum); await yukle() } catch { }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiKart baslik="Portföyde Toplam" deger={tl(portfoyTutar)} ikon={Banknote} renk="text-blue-300" alt={`${portfoyde.length} adet`} />
        <KpiKart baslik="Vadesi Geçen" deger={tl(gecenTutar)} ikon={AlertTriangle} renk="text-rose-400" alt={`${vadesiGecen.length} adet — takip gerekli`} />
        <KpiKart baslik="Bu Ay Vadesi Gelen" deger={tl(buAyTutar)} ikon={Clock} renk="text-yellow-400" alt={`${buAy.length} adet`} />
        <KpiKart baslik="Tüm Kayıtlar" deger={tl(toplam)} ikon={FileSpreadsheet} renk="text-emerald-400" alt={`${kayitlar.length} adet`} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setFiltre('tumu')} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filtre === 'tumu' ? 'bg-yellow-400 text-blue-950' : 'bg-blue-900/40 text-gray-300 hover:bg-blue-900/70'}`}>Tümü ({kayitlar.length})</button>
        {CARI_CEK_SENET_DURUMLARI.map(d => {
          const adet = kayitlar.filter(k => cekSenetDurumBilgi(k.cek_senet_durum).id === d.id).length
          if (!adet) return null
          return <button key={d.id} onClick={() => setFiltre(d.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filtre === d.id ? 'bg-yellow-400 text-blue-950' : 'bg-blue-900/40 text-gray-300 hover:bg-blue-900/70'}`}>{d.label} ({adet})</button>
        })}
      </div>

      <div className="bg-blue-950/40 border border-blue-800/30 rounded-xl overflow-hidden">
        {goster.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            Çek/senet kaydı yok. Hareket girişinde ödeme yöntemi "Çek" veya "Senet" seçtiğinizde kayıtlar burada toplanır.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-blue-800/40 text-left text-xs text-gray-400">
                  <th className="px-4 py-2.5 font-medium">Cari</th>
                  <th className="px-3 py-2.5 font-medium">Tür</th>
                  <th className="px-3 py-2.5 font-medium">Belge No</th>
                  <th className="px-3 py-2.5 font-medium">Tarih</th>
                  <th className="px-3 py-2.5 font-medium">Vade</th>
                  <th className="px-3 py-2.5 font-medium">Yön</th>
                  <th className="px-3 py-2.5 font-medium text-right">Tutar</th>
                  <th className="px-3 py-2.5 font-medium">Durum</th>
                </tr>
              </thead>
              <tbody>
                {goster.map(k => {
                  const db = cekSenetDurumBilgi(k.cek_senet_durum)
                  const gecikti = db.id === 'portfoyde' && k._vade && k._vade < bugun
                  return (
                    <tr key={k.id} className="border-b border-blue-800/20 hover:bg-blue-900/20">
                      <td className="px-4 py-2 text-white">{kartBul(k.kart_id)?.unvan || '—'}</td>
                      <td className="px-3 py-2 text-gray-300">{odemeEtiketi(k.odeme_yontemi)}</td>
                      <td className="px-3 py-2 text-gray-400">{k.belge_no || '—'}</td>
                      <td className="px-3 py-2 text-gray-400">{k.tarih}</td>
                      <td className={`px-3 py-2 ${gecikti ? 'text-rose-400 font-medium' : 'text-gray-400'}`}>{k._vade || '—'}{gecikti ? ' (geçti)' : ''}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-md ${Number(k.borc) > 0 ? 'bg-orange-500/15 text-orange-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                          {Number(k.borc) > 0 ? 'Verilen' : 'Alınan'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-white font-medium">{paraYaz(tutar(k))}</td>
                      <td className="px-3 py-2">
                        <select
                          value={db.id}
                          onChange={e => durumDegistir(k.id, e.target.value)}
                          className={`text-xs rounded-md px-2 py-1 border-0 cursor-pointer ${db.renk}`}
                        >
                          {CARI_CEK_SENET_DURUMLARI.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ==================== KULLANIM REHBERI ====================
function RehberMock({ baslik, icerik, vurgu }) {
  return (
    <div className="rounded-xl border border-blue-700/40 bg-[#0a1730] overflow-hidden w-full max-w-xs shrink-0">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-blue-900/40 border-b border-blue-800/40">
        <span className="w-2 h-2 rounded-full bg-rose-400/70" />
        <span className="w-2 h-2 rounded-full bg-yellow-400/70" />
        <span className="w-2 h-2 rounded-full bg-emerald-400/70" />
        <span className="text-[10px] text-gray-400 ml-1.5 truncate">{baslik}</span>
      </div>
      <div className="p-3 space-y-1.5">
        {icerik.map((satir, i) => (
          <div key={i} className={`rounded-md px-2.5 py-1.5 text-[10px] ${vurgu === i ? 'bg-yellow-400/20 border border-yellow-400/50 text-yellow-100 font-medium' : 'bg-blue-900/40 text-gray-400'}`}>
            {satir}
          </div>
        ))}
      </div>
    </div>
  )
}

function RehberBolum({ no, baslik, aciklama, adimlar, mock }) {
  return (
    <div className="flex flex-col md:flex-row gap-4 bg-blue-950/40 border border-blue-800/30 rounded-xl p-4">
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-white mb-1.5 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-yellow-400 text-blue-950 text-[11px] font-bold flex items-center justify-center shrink-0">{no}</span>
          {baslik}
        </h4>
        <p className="text-xs text-gray-400 mb-2">{aciklama}</p>
        <ul className="space-y-1">
          {adimlar.map((a, i) => (
            <li key={i} className="text-[11px] text-gray-300 flex gap-1.5"><span className="text-yellow-400 shrink-0">›</span>{a}</li>
          ))}
        </ul>
      </div>
      <div className="flex md:justify-end">{mock}</div>
    </div>
  )
}

function KullanimRehberiModal({ kapat }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={kapat}>
      <div className="bg-[#0a1730] border border-blue-700/40 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-blue-800/40 shrink-0">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2"><CircleHelp className="w-5 h-5 text-yellow-400" /> Cari Hesap Takip — Kullanım Kılavuzu</h3>
          <button onClick={kapat} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <RehberBolum
            no="1"
            baslik="Cari Kartı Oluşturma"
            aciklama="Her müşteri/tedarikçi için bir cari kart açılır. Borç-alacak takibi bu kartlar üzerinden yürür."
            adimlar={[
              '"+ Cari Kartı" butonuna basın.',
              'Ünvan ve cari kod girin (kod: 120.01 gibi numaralı sıra olabilir).',
              'Tür seçin: Müşteri, Tedarikçi veya Her İkisi.',
              'Dövizli çalışıyorsanız para birimini, vade gününü ve telefon/e-posta bilgilerini girin — telefon, vade hatırlatmaları ve ekstre gönderimi için kullanılır.',
              'Kaydet dedikten sonra kart "Cari Kartlar" sekmesinde listelenir.'
            ]}
            mock={<RehberMock baslik="Yeni Cari Kartı" icerik={['Ünvan: ABC Ticaret Ltd. Şti.', 'Cari Kodu: 120.01', 'Tür: Müşteri   |   Para Birimi: TL', 'Telefon: 5xx xxx xx xx', 'Vade (gün): 30']} vurgu={1} />}
          />
          <RehberBolum
            no="2"
            baslik="Hareket Girişi (Borç / Alacak)"
            aciklama="Cariye satış faturası kesildiğinde borç, tahsilat yapıldığında alacak işlenir. Bakiye otomatik hesaplanır."
            adimlar={[
              '"+ Hareket Girişi" butonuna basın, cariyi seçin (vade tarihi karttaki vade gününe göre otomatik dolar).',
              'İşlem türü seçin: Satış Faturası, Tahsilat, Ödeme, Açılış Fişi vb. — tür seçince borç/alacak alanı otomatik kilitlenir.',
              'Tutarı girin; dövizli hareket ise para birimini seçip döviz tutarı + kur yazın, TL karşılığı otomatik hesaplanır.',
              'Ödeme yöntemi seçin: Nakit, Havale/EFT, Çek, Senet... — Çek/Senet seçerseniz kayıt otomatik "Çek/Senet Portföyü" sekmesine düşer.',
              'Bakiye: Kartta alacak fazlası (borcunuz var) +, borç fazlası (müşteri borçlu) − gösterilir.'
            ]}
            mock={<RehberMock baslik="Hareket Girişi" icerik={['Cari: ABC Ticaret Ltd. Şti.', 'Tür: Tahsilat   |   Tarih: 16.10.2026', 'Ödeme Yöntemi: Havale / EFT', 'Alacak (₺): 45.000,00', 'Bakiye: -45.000,00 (borç azaldı)']} vurgu={3} />}
          />
          <RehberBolum
            no="3"
            baslik="Çek / Senet Portföyü"
            aciklama="Çek ve senetler tek ekranda vade sırasına göre izlenir; durumları tıklanarak güncellenir."
            adimlar={[
              '"Çek/Senet" sekmesini açın — üstte portföy toplamı, vadesi geçen ve bu ay vadesi gelecek tutarları görünür.',
              'Listede her satırda cari, belge no, vade ve yön (Alınan/Verilen) yazar; vadesi geçenler kırmızı görünür.',
              'Durum sütunundaki menüden: Portföyde → Tahsil Edildi / Ödendi / Ciro Edildi / Karşılıksız / İade Edildi seçin.',
              'Üstteki filtre butonlarıyla sadece istediğiniz durumdaki kayıtları listeleyin.'
            ]}
            mock={<RehberMock baslik="Çek/Senet Portföyü" icerik={['ABC Ticaret | Çek | Vade: 05.11.2026', 'Tutar: 120.000,00  |  Yön: Alınan', 'Durum: [Portföyde ▼]', 'DEF A.Ş. | Senet | Vade: 22.10.2026', 'Durum: [Tahsil Edildi ▼]']} vurgu={2} />}
          />
          <RehberBolum
            no="4"
            baslik="Ekstre, Mutabakat ve Paylaşım"
            aciklama="Seçili dönem için resmi ekstre hazırlanır; Excel/PDF indirilir, WhatsApp/e-posta ile gönderilir."
            adimlar={[
              '"Ekstre" sekmesinde cari kartı ve dönem seçin — satır satır işlem dökümü ve dönem başı/sonu bakiye oluşur.',
              'Excel: ham veri dökümü; PDF: yazdırılabilir resmi ekstre.',
              '"Mutabakat" metnini kopyalayıp e-posta ile iletebilirsiniz.',
              '"Gönder" ile PDF otomatik hazırlanıp WhatsApp dosyası veya e-posta eki olarak cariye gider.'
            ]}
            mock={<RehberMock baslik="Cari Ekstre (16.10.2026)" icerik={['Dönem Başı Bakiye: 12.500,00', '15.10 Satış Faturası  B: 45.000,00', '16.10 Tahsilat  A: 30.000,00', 'Dönem Sonu Bakiye: 27.500,00', '[Excel] [PDF] [Mutabakat] [Gönder]']} vurgu={4} />}
          />
          <RehberBolum
            no="5"
            baslik="Risk Limiti ve Vade Hatırlatması"
            aciklama="Bakiyeleri ve vadesi geçen alacakları takip edin; hatırlatmayı tek tıkla WhatsApp'tan gönderin."
            adimlar={[
              'Kart formunda "Parasal Limit" girin — bakiyesi limiti aşan cari kırmızı uyarı etiketiyle işaretlenir.',
              '"Özet" sekmesindeki Vade Durumu tablosunda vadesi geçen alacaklar listelenir.',
              'Satırdaki mesaj ikonuna basın: hazır hatırlatma metni carinin WhatsApp numarasına gönderilir.',
              'İlk kullanımda "WhatsApp Bağlantısı" kartından bir kez QR ile giriş yapın — sonraki gönderimler otomatikleşir.'
            ]}
            mock={<RehberMock baslik="Özet — Vade Durumu" icerik={['ABC Ticaret  |  45.000,00 ₺  |  12 gün geçti', '✉ Hatırlatma gönder', 'DEF A.Ş.  |  8.400,00 ₺  |  3 gün geçti', '⚠ Risk limiti aşan: 2 cari', 'WhatsApp: ● Bağlı']} vurgu={1} />}
          />
          <RehberBolum
            no="6"
            baslik="MUBİS AI ile Cari Sorgulama"
            aciklama="Sağ alttaki MUBİS Asistan'a cari hesabınızla ilgili soruları doğal dille sorabilirsiniz; asistan verilerinizi okuyup yanıt verir."
            adimlar={[
              'Sağ alttaki kalem asistanına tıklayın, sorunuzu yazın (veya mikrofonla söyleyin).',
              'Örnekler: "Bu ay tahsilat yapılacak çekleri listele", "ABC Ticaret\'in bakiyesi ne kadar?", "Vadesi geçen alacağı olan carileri say".',
              'Müşteri girişinde kendi cariniz için: "Cari hesabımdaki bakiyem ne kadar?", "Bu ay vadesi gelen çeklerim var mı?" gibi sorabilirsiniz.',
              'Soruda cari/çek/senet/tahsilat/bakiye gibi bir kelime geçtiğinde asistan otomatik olarak cari verilerinizi okur.',
              'Asistan sadece yetkili olduğunuz verileri görür; veri yoksa uydurmaz, "kayıt bulunmuyor" der.'
            ]}
            mock={<RehberMock baslik="MUBİS Asistan" icerik={['Siz: Bu ay tahsilat yapılacak çekleri listele', 'Asistan: Bu ay vadesi gelen 2 çek var:', '• 05.11 ABC Ticaret — 120.000 ₺ (Portföyde)', '• 22.11 DEF A.Ş. — 45.500 ₺ (Portföyde)', 'Toplam tahsilat: 165.500 ₺']} vurgu={2} />}
          />
          <RehberBolum
            no="7"
            baslik="Toplu Veri Aktarımı"
            aciklama="Mevcut carilerinizi ve hareketlerinizi Excel şablonuyla sisteme topluca taşıyın."
            adimlar={[
              '"Veri Aktarımı" sekmesinde "Şablon İndir" ile şablonu indirin.',
              '"Kartlar" sayfasına carileri, "Hareketler" sayfasına hareketleri doldurun.',
              'Kart satırındaki "Açılış Borç/Alacak" kolonları otomatik açılış fişine dönüşür.',
              'Dosyayı yükleyin, önizlemeyi kontrol edip "İçe Aktar" deyin — atlanan satırlar raporlanır.'
            ]}
            mock={<RehberMock baslik="Veri Aktarımı" icerik={['[Şablon İndir]', 'Kartlar: 24 satır  |  Hareketler: 156 satır', '[Dosya Seç (.xlsx / .csv)]', '[İçe Aktar]', 'Sonuç: 24 kart, 156 hareket eklendi']} vurgu={4} />}
          />
          <div className="text-[11px] text-gray-500 text-center pt-1">
            İpucu: Cari Kartlar sekmesinde bir satıra tıklayarak o carinin tüm hareketlerini görebilir, satırdaki kalem ikonuyla düzenleyebilirsiniz.
          </div>
        </div>
        <div className="flex justify-end px-5 py-4 border-t border-blue-800/40 shrink-0">
          <button onClick={kapat} className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-blue-950 px-4 py-2 rounded-lg text-sm font-semibold">Anladım</button>
        </div>
      </div>
    </div>, document.body)
}

// ==================== ANA MODUL ====================
export default function CariHesapModul({ clientId, firmAdi }) {
  const [icSekme, setIcSekme] = useState('ozet')
  const [kartlar, setKartlar] = useState([])
  const [hareketler, setHareketler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState('')
  const [arama, setArama] = useState('')
  const [turFiltre, setTurFiltre] = useState('tumu')
  const [kartModal, setKartModal] = useState(null) // null | 'yeni' | kart objesi
  const [hareketModal, setHareketModal] = useState(null) // null | {kart?, hareket?}
  const [virmanModal, setVirmanModal] = useState(false)
  const [paylasModal, setPaylasModal] = useState(false)
  const [rehberAcik, setRehberAcik] = useState(false)
  const [ekstreKartId, setEkstreKartId] = useState('')
  const [ekstreBaslangic, setEkstreBaslangic] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10) })
  const [ekstreBitis, setEkstreBitis] = useState(bugunStr)
  const [kopyalandi, setKopyalandi] = useState(false)
  const [acikKartlar, setAcikKartlar] = useState({}) // kart satiri detay ac/kapa
  const [waDurum, setWaDurum] = useState(null)
  const [waKontrol, setWaKontrol] = useState(false)
  const [seciliKartlar, setSeciliKartlar] = useState([]) // toplu silme secimi
  const [aktariyor, setAktariyor] = useState(false)
  const [defterTipi, setDefterTipi] = useState('')

  useEffect(() => {
    if (!clientId) return
    supabase.from('clients').select('defter_tipi').eq('id', clientId).single()
      .then(({ data }) => setDefterTipi(data?.defter_tipi || '')).catch(() => {})
  }, [clientId])

  // Birinci sinif isletme kontrolu: defter tipi "1. SINIF" / "Birinci Sinif"
  // ya da Luca defter turu "Bilanço" (bilanço esasi = 1. sinif isletme).
  // Alan bos/degilse de gosterilir; yalnizca net 2. sinif turlerinde gizlenir
  // (Isletme defteri, Serbest Meslek, Basit Usul).
  const birinciSinifMi = (() => {
    const n = String(defterTipi || '').toLocaleUpperCase('tr')
      .replace(/[İI]/g, 'I').replace(/[ÇĞÖŞÜ]/g, m => ({ 'Ç': 'C', 'Ğ': 'G', 'Ö': 'O', 'Ş': 'S', 'Ü': 'U' }[m]))
      .replace(/[.()\s-]/g, '')
    if (!n) return true
    if (n.includes('1SINIF') || n.includes('BIRINCISINIF') || n.includes('BILANCO')) return true
    return !(n.includes('ISLETME') || n.includes('SERBESTMESLEK') || n.includes('BASITUSUL'))
  })()

  const yukle = useCallback(async () => {
    if (!clientId) return
    setYukleniyor(true)
    try {
      const [kart, hr] = await Promise.all([cariKartlariGetir(clientId), cariHareketleriGetir(clientId)])
      setKartlar(kart)
      setHareketler(hr)
      setHata('')
    } catch (e) {
      setHata('Veriler yüklenemedi: ' + e.message)
    } finally {
      setYukleniyor(false)
    }
  }, [clientId])

  useEffect(() => { yukle() }, [yukle])

  const ozet = useMemo(() => cariOzetHesapla(kartlar, hareketler), [kartlar, hareketler])
  const yaslandirma = useMemo(() => yasantdirmaHesapla(kartlar, hareketler), [kartlar, hareketler])
  const aylikOzet = useMemo(() => aylikHareketOzeti(hareketler), [hareketler])

  const filtreliKartlar = useMemo(() => ozet.kartOzetleri.filter(k => {
    if (turFiltre !== 'tumu' && k.tur !== turFiltre) return false
    const q = arama.trim().toLocaleLowerCase('tr')
    if (!q) return true
    return (k.unvan || '').toLocaleLowerCase('tr').includes(q) || (k.kod || '').includes(q) || (k.vkn || '').includes(q)
  }), [ozet.kartOzetleri, arama, turFiltre])

  const ekstreKart = ozet.kartOzetleri.find(k => k.id === Number(ekstreKartId))
  const ekstre = useMemo(() => {
    if (!ekstreKartId) return null
    const hr = hareketler.filter(h => h.kart_id === Number(ekstreKartId))
    return ekstreHesapla(hr, ekstreBaslangic, ekstreBitis)
  }, [ekstreKartId, hareketler, ekstreBaslangic, ekstreBitis])

  // ---- Kaydet/sil islemleri ----
  const kartKaydet = async (form) => {
    try {
      if (kartModal && kartModal !== 'yeni') await cariKartGuncelle(kartModal.id, form)
      else await cariKartEkle(clientId, form)
      setKartModal(null)
      await yukle()
    } catch (e) { setHata('Kaydedilemedi: ' + e.message) }
  }
  const kartSil = async (k) => {
    if (!window.confirm(`"${k.unvan}" kartını ve TÜM hareketlerini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) return
    try { await cariKartSil(k.id); await yukle() } catch (e) { setHata('Silinemedi: ' + e.message) }
  }
  // Toplu silme: secili kartlari tek komutla sil
  const kartlariTopluSil = async () => {
    if (!seciliKartlar.length) return
    if (!window.confirm(`${seciliKartlar.length} cari kartı ve TÜM hareketlerini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) return
    try {
      await cariKartlarSil(seciliKartlar)
      setSeciliKartlar([])
      await yukle()
    } catch (e) { setHata('Toplu silinemedi: ' + e.message) }
  }
  const kartSecimToggle = (id) => {
    setSeciliKartlar(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }
  const tumKartlariSec = () => {
    setSeciliKartlar(s => s.length === filtreliKartlar.length ? [] : filtreliKartlar.map(k => k.id))
  }
  // Hesap planindan 120/320 dökümlerini cari kart olarak aktar (birinci sınıf işletme)
  const hesaplardanCariAktar = async () => {
    if (aktariyor) return
    if (!window.confirm('Hesap planındaki 120 (Alıcılar) ve 320 (Satıcılar) alt hesaplarını cari kart olarak aktarıyorum. Devam edilsin mi?')) return
    setAktariyor(true)
    try {
      const plan = await hesapPlaniGetir(clientId)
      const mevcutKodlar = new Set(kartlar.map(k => k.kod).filter(Boolean))
      const ekle = []
      for (const h of plan.filter(h => /^120(\.|$)/.test(h.kod || '') && h.kod !== '120')) {
        if (mevcutKodlar.has(h.kod)) continue
        ekle.push({ kod: h.kod, unvan: h.ad, tur: 'musteri' })
      }
      for (const h of plan.filter(h => /^320(\.|$)/.test(h.kod || '') && h.kod !== '320')) {
        if (mevcutKodlar.has(h.kod)) continue
        ekle.push({ kod: h.kod, unvan: h.ad, tur: 'tedarikci' })
      }
      if (!ekle.length) {
        window.alert('Hesap planında aktarılacak yeni 120/320 alt hesabı bulunamadı (mevcut cari kartlarla aynı kodlu olanlar atlandı).')
        return
      }
      const { sayi, hataSayi } = await cariKartlariTopluEkle(clientId, ekle)
      await yukle()
      window.alert(`${sayi} cari kart oluşturuldu (120 → Müşteri, 320 → Tedarikçi).${hataSayi ? ` ${hataSayi} kayıt eklenemedi (kod çakışması olabilir).` : ''}`)
    } catch (e) {
      setHata('Hesap planından aktarılamadı: ' + e.message)
    } finally {
      setAktariyor(false)
    }
  }
  const hareketKaydet = async (form) => {
    try {
      const g = { ...form, kartId: Number(form.kartId), borc: Number(form.borc) || 0, alacak: Number(form.alacak) || 0 }
      if (hareketModal?.hareket) await cariHareketGuncelle(hareketModal.hareket.id, g)
      else await cariHareketEkle(clientId, g)
      setHareketModal(null)
      await yukle()
    } catch (e) { setHata('Kaydedilemedi: ' + e.message) }
  }
  const hareketSil = async (h) => {
    if (!window.confirm('Bu hareketi silmek istediğinize emin misiniz?')) return
    try { await cariHareketSil(h.id); await yukle() } catch (e) { setHata('Silinemedi: ' + e.message) }
  }
  const virmanYap = async (form) => {
    try {
      await cariVirmanYap(clientId, {
        ...form,
        kaynakAd: kartlar.find(k => k.id === Number(form.kaynakKartId))?.unvan,
        hedefAd: kartlar.find(k => k.id === Number(form.hedefKartId))?.unvan
      })
      setVirmanModal(false)
      await yukle()
    } catch (e) { setHata('Virman yapılamadı: ' + e.message) }
  }

  // ---- Mutabakat metni ----
  const mutabakatMetni = () => {
    if (!ekstre || !ekstreKart) return ''
    const satir = ekstre.satirlar.map(h =>
      `${h.tarih} | ${CARI_ISLEM_TURLERI.find(t => t.id === h.islem_turu)?.label || h.islem_turu} | ${h.belge_no || '-'} | ${h.aciklama || '-'}${dovizMetni(h) ? ' [' + dovizMetni(h) + ']' : ''}${odemeEtiketi(h.odeme_yontemi) ? ' [' + odemeEtiketi(h.odeme_yontemi) + ']' : ''} | B: ${paraYaz(h.borc)} | A: ${paraYaz(h.alacak)} | Bakiye: ${paraYaz(h.bakiye)}`
    ).join('\n')
    return [
      `MUTABAKAT MEKTUBU`,
      `Firma: ${firmAdi || '-'}`,
      `Cari: ${ekstreKart.unvan}${ekstreKart.kod ? ' (' + ekstreKart.kod + ')' : ''}`,
      `Dönem: ${ekstreBaslangic} - ${ekstreBitis}`,
      `----------------------------------------`,
      `Dönem başı bakiye: ${paraYaz(ekstre.baslangicBakiyesi)} (borç)`,
      satir || '(dönem içinde hareket yok)',
      `----------------------------------------`,
      `Dönem toplam borç: ${paraYaz(ekstre.donemBorc)}`,
      `Dönem toplam alacak: ${paraYaz(ekstre.donemAlacak)}`,
      `Bitiş bakiyesi: ${paraYaz(ekstre.bitisBakiyesi)}`,
      ``,
      `Bakiyeyi onaylıyorsanız imzalı nüshayı büromuza iletiniz.`
    ].join('\n')
  }
  const mutabakatKopyala = async () => {
    try { await navigator.clipboard.writeText(mutabakatMetni()); setKopyalandi(true); setTimeout(() => setKopyalandi(false), 2000) } catch { }
  }

  // ---- Cari bakiye listesi Excel ----
  const bakiyeListesiExcel = () => {
    import('xlsx').then(XLSX => {
      const sirali = [...ozet.kartOzetleri].sort((a, b) => b.bakiye - a.bakiye)
      const rows = [
        ['CARİ BAKİYE LİSTESİ', firmAdi || '', bugunStr()], [],
        ['Kod', 'Ünvan', 'Tür', 'Para Birimi', 'Toplam Borç', 'Toplam Alacak', 'Bakiye', 'Vadesi Geçen', 'Vadesi Bekleyen', 'Son Hareket'],
        ...sirali.map(k => [k.kod || '', k.unvan, k.tur === 'musteri' ? 'Müşteri' : k.tur === 'tedarikci' ? 'Tedarikçi' : 'Her İkisi', k.para_birimi || 'TL', k.toplamBorc, k.toplamAlacak, k.bakiye, k.vadesiGecenAlacak, k.vadesiGelmisAlacak, k.sonHareket || '']),
        [], ['', 'TOPLAM', '', '', ozet.toplamBorc, ozet.toplamAlacak, ozet.netBakiye, ozet.vadesiGecen, '', '']
      ]
      const ws = XLSX.utils.aoa_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Bakiye Listesi')
      XLSX.writeFile(wb, `Cari_Bakiye_Listesi_${bugunStr()}.xlsx`)
    })
  }

  // ---- Vade hatirlatmasi (WhatsApp) ----
  const hatirlatmaGonder = async (k) => {
    const mesaj = [
      `Sayın ${k.unvan},`,
      `${firmAdi || 'Firmamız'} cari kayıtlarımıza göre ${paraYaz(k.vadesiGecenAlacak)} TL vadesi geçmiş bakiyeniz bulunmaktadır.`,
      `Ödemenizi en kısa sürede gerçekleştirmenizi rica ederiz. Detaylı ekstre talebinde bulunabilirsiniz.`
    ].join('\n')
    if (!k.telefon) {
      try { await navigator.clipboard.writeText(mesaj); window.alert('Kartta telefon numarası tanımlı değil. Hatırlatma metni panoya kopyalandı.') } catch { }
      return
    }
    try {
      const res = await openWhatsAppWeb({ phone: k.telefon, message: mesaj })
      if (res?.not) window.alert(res.not)
    } catch (e) { setHata('Hatırlatma gönderilemedi: ' + e.message) }
  }

  // ---- WhatsApp Web baglanti kontrolu (kendi hesabina QR ile giris) ----
  const whatsappDurumKontrol = async () => {
    setWaKontrol(true)
    try {
      const res = await gibYardimciIs('whatsapp-web-durum', {}, 90 * 1000)
      setWaDurum(res || { girisVar: false, not: 'Yardımcı programdan yanıt alınamadı.' })
    } catch (e) {
      setWaDurum({
        girisVar: false,
        not: 'Yardımcı program bulunamadı veya kapalı. Hatırlatmalar WhatsApp linki üzerinden elle gönderilir; tam otomatik gönderim için yardımcı programı kurup güncelleyin.'
      })
    } finally { setWaKontrol(false) }
  }

  // ---- Ekstre Excel export ----
  const ekstreExcel = () => {
    if (!ekstre || !ekstreKart) return
    import('xlsx').then(XLSX => {
      const rows = [
        ['EKSTRE', ekstreKart.unvan], ['Dönem', `${ekstreBaslangic} - ${ekstreBitis}`], [],
        ['Tarih', 'İşlem Türü', 'Belge No', 'Açıklama', 'Para Birimi', 'Döviz Tutarı', 'Kur', 'Ödeme Yöntemi', 'Vade', 'Borç', 'Alacak', 'Bakiye'],
        ['-', 'Dönem Başı Bakiye', '', '', '', '', '', '', '', '', '', ekstre.baslangicBakiyesi],
        ...ekstre.satirlar.map(h => [h.tarih, CARI_ISLEM_TURLERI.find(t => t.id === h.islem_turu)?.label || h.islem_turu, h.belge_no || '', h.aciklama || '', h.para_birimi || 'TL', h.doviz_tutar || '', h.doviz_kur || '', odemeEtiketi(h.odeme_yontemi), h.vade_tarihi || '', Number(h.borc) || 0, Number(h.alacak) || 0, h.bakiye]),
        [], ['', 'Dönem Toplamı', '', '', '', '', '', '', '', ekstre.donemBorc, ekstre.donemAlacak, ekstre.bitisBakiyesi]
      ]
      const ws = XLSX.utils.aoa_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Ekstre')
      XLSX.writeFile(wb, `Ekstre_${(ekstreKart.kod || ekstreKart.unvan).replace(/[^\wğüşıöçĞÜŞİÖÇ ]/g, '')}_${ekstreBitis}.xlsx`)
    })
  }

  // ---- Ekstre PDF ----
  const ekstrePdfBlob = () => {
    if (!ekstre || !ekstreKart) return null
    const pdf = createUnicodePdf()
    let y = 15
    const baslikYaz = () => {
      pdf.setFontSize(11); pdf.setFont('helvetica', 'bold')
      pdf.text('CARI EKSTRE', 14, y)
      pdf.setFontSize(8)
      y += 5.5
      pdf.text(`${ekstreKart.unvan}${ekstreKart.kod ? ' (' + ekstreKart.kod + ')' : ''}  |  Donem: ${ekstreBaslangic} - ${ekstreBitis}${firmAdi ? '  |  ' + firmAdi : ''}`, 14, y)
      y += 5
      pdf.text('Tarih', 14, y); pdf.text('Tür', 34, y); pdf.text('Belge', 64, y); pdf.text('Açıklama', 84, y)
      pdf.text('Borç', 138, y); pdf.text('Alacak', 158, y); pdf.text('Bakiye', 178, y)
      y += 1.5; pdf.line(14, y, 196, y); y += 4
      pdf.setFont('helvetica', 'normal')
    }
    baslikYaz()
    const satirYaz = (c1, c2, c3, c4, borc, alacak, bakiye) => {
      if (y > 282) { pdf.addPage(); y = 15; baslikYaz() }
      pdf.text(String(c1 || '').slice(0, 10), 14, y)
      pdf.text(String(c2 || '').slice(0, 16), 34, y)
      pdf.text(String(c3 || '').slice(0, 11), 64, y)
      pdf.text(String(c4 || '').slice(0, 30), 84, y)
      pdf.text(String(borc || ''), 138, y)
      pdf.text(String(alacak || ''), 158, y)
      pdf.text(String(bakiye || ''), 178, y)
      y += 4.2
    }
    pdf.setFontSize(8)
    satirYaz('-', 'Dönem Başı Bakiye', '', '', '', '', paraYaz(ekstre.baslangicBakiyesi))
    for (const h of ekstre.satirlar) {
      const ek = dovizMetni(h) ? ` [${dovizMetni(h)}]` : ''
      satirYaz(
        h.tarih,
        CARI_ISLEM_TURLERI.find(t => t.id === h.islem_turu)?.label || h.islem_turu,
        h.belge_no,
        (h.aciklama || '') + ek + (odemeEtiketi(h.odeme_yontemi) ? ` (${odemeEtiketi(h.odeme_yontemi)})` : ''),
        Number(h.borc) > 0 ? paraYaz(h.borc) : '',
        Number(h.alacak) > 0 ? paraYaz(h.alacak) : '',
        paraYaz(h.bakiye)
      )
    }
    y += 1.5; pdf.line(14, y, 196, y); y += 4.5
    pdf.setFont('helvetica', 'bold')
    pdf.text(`Dönem Toplamı   Borç: ${paraYaz(ekstre.donemBorc)}   Alacak: ${paraYaz(ekstre.donemAlacak)}   Bakiye: ${paraYaz(ekstre.bitisBakiyesi)}`, 14, y)
    pdf.setFont('helvetica', 'normal')
    return { pdf, ad: `Ekstre_${(ekstreKart.kod || ekstreKart.unvan).replace(/[^\wğüşıöçĞÜŞİÖÇ ]/g, '')}_${ekstreBitis}.pdf` }
  }
  const ekstrePdf = () => {
    const r = ekstrePdfBlob()
    if (r) r.pdf.save(r.ad)
  }

  if (yukleniyor && !kartlar.length) {
    return <div className="text-center py-10 text-gray-400">Cari hesap verileri yükleniyor...</div>
  }

  return (
    <div>
      {hata && (
        <div className="mb-4 bg-red-500/10 border border-red-500/40 text-red-300 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {hata}
          <button onClick={() => setHata('')} className="ml-auto text-red-300 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Ic sekmeler + yeni hareket */}
      <div className="flex items-center justify-between gap-2 flex-wrap mb-5">
        <div className="flex flex-wrap gap-1 bg-blue-950/50 rounded-xl p-1">
          {[
            { id: 'ozet', label: 'Özet', icon: Wallet },
            { id: 'kartlar', label: 'Cari Kartlar', icon: Users },
            { id: 'ekstre', label: 'Ekstre', icon: FileSpreadsheet },
            { id: 'cek-senet', label: 'Çek/Senet', icon: Banknote },
            { id: 'aktarim', label: 'Veri Aktarımı', icon: Upload }
          ].map(t => (
            <button key={t.id} onClick={() => setIcSekme(t.id)} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${icSekme === t.id ? 'bg-blue-600 text-white' : 'text-gray-300 hover:text-white'}`}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>
        {icSekme !== 'aktarim' && (
          <div className="flex gap-2">
            {birinciSinifMi && (
              <button onClick={hesaplardanCariAktar} disabled={aktariyor} title="Hesap planındaki 120 alt hesaplarını Müşteri, 320 alt hesaplarını Tedarikçi olarak cari karta aktarır" className="flex items-center gap-1.5 bg-emerald-600/30 border border-emerald-500/40 text-emerald-100 px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600/50 transition-all disabled:opacity-50">
                {aktariyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} 120/320 Aktar
              </button>
            )}
            <button onClick={() => setKartModal('yeni')} className="flex items-center gap-1.5 bg-blue-600/30 border border-blue-500/40 text-blue-100 px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-blue-600/50 transition-all">
              <Plus className="w-4 h-4" /> Cari Kartı
            </button>
            <button onClick={() => setHareketModal({})} disabled={!kartlar.length} className="flex items-center gap-1.5 bg-gradient-to-r from-yellow-400 to-yellow-500 text-blue-950 px-3.5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
              <Plus className="w-4 h-4" /> Hareket Girişi
            </button>
            <button onClick={() => setVirmanModal(true)} disabled={kartlar.length < 2} className="flex items-center gap-1.5 bg-blue-600/30 border border-blue-500/40 text-blue-100 px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-blue-600/50 disabled:opacity-50">
              <ArrowLeftRight className="w-4 h-4" /> Virman
            </button>
          </div>
        )}
        <button onClick={() => setRehberAcik(true)} title="Kullanım Kılavuzu" className="absolute top-6 right-6 w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-500/40 text-yellow-300 hover:bg-blue-600/50 flex items-center justify-center shrink-0">
          <CircleHelp className="w-5 h-5" />
        </button>

      </div>

      {/* ==================== OZET ==================== */}
      {icSekme === 'ozet' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiKart baslik="Toplam Alacak (Borcum Var)" deger={tl(ozet.toplamBorc)} ikon={TrendingUp} renk="text-emerald-400" alt={`${ozet.alacakliKartSayisi} cari alacaklı`} />
            <KpiKart baslik="Toplam Borç (Borçluyum)" deger={tl(ozet.toplamAlacak)} ikon={TrendingDown} renk="text-rose-400" alt={`${ozet.borcluKartSayisi} cari borçlu`} />
            <KpiKart baslik="Net Bakiye" deger={tl(ozet.netBakiye)} ikon={Wallet} renk={ozet.netBakiye >= 0 ? 'text-emerald-400' : 'text-rose-400'} alt={ozet.netBakiye >= 0 ? 'Lehimize' : 'Aleyhimize'} />
            <KpiKart baslik="Vadesi Geçen Alacak" deger={tl(ozet.vadesiGecen)} ikon={Clock} renk="text-yellow-400" alt="Takip gerekiyor" />
          </div>

          {/* WhatsApp baglanti */}
          <div className="bg-blue-950/40 border border-blue-800/30 rounded-xl p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h4 className="text-sm font-semibold text-white flex items-center gap-2"><MessageCircle className="w-4 h-4 text-yellow-400" /> WhatsApp Bağlantısı</h4>
                <p className="text-[11px] text-gray-500 mt-0.5">Vade hatırlatmaları kendi WhatsApp Web hesabınızdan gönderilir — tek seferlik QR girişi yeterli.</p>
              </div>
              <div className="flex items-center gap-2">
                {waDurum && (
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-lg ${waDurum.girisVar ? 'bg-emerald-500/20 text-emerald-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                    {waDurum.girisVar ? 'Bağlı' : 'Bağlı değil'}
                  </span>
                )}
                <button onClick={whatsappDurumKontrol} disabled={waKontrol} className="flex items-center gap-1.5 bg-blue-600/30 border border-blue-500/40 text-blue-100 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-600/50 disabled:opacity-50">
                  <MessageCircle className="w-3.5 h-3.5" /> {waKontrol ? 'Kontrol ediliyor...' : waDurum?.girisVar ? 'Yenile' : 'Bağlan / Kontrol Et'}
                </button>
              </div>
            </div>
            {waDurum && !waDurum.girisVar && waDurum.not && (
              <p className="text-[11px] text-yellow-300/80 mt-2">{waDurum.not}</p>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Yaslandirma */}
            <div className="bg-blue-950/40 border border-blue-800/30 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Clock className="w-4 h-4 text-yellow-400" /> Alacak Vade Dağılımı</h4>
              <div className="h-56">
                <ResponsiveContainer>
                  <BarChart data={yaslandirma}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                    <XAxis dataKey="ad" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => (v / 1000).toFixed(0) + 'K'} />
                    <Tooltip formatter={v => tl(v)} contentStyle={{ background: '#0a1730', border: '1px solid #1e40af', borderRadius: 8, color: '#fff' }} />
                    <Bar dataKey="tutar" name="Açık bakiye" fill="#facc15" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] text-gray-500 mt-2">Açık (tahsil edilmemiş) alacakların vade tarihine göre dağılımı. 0-30 gün: vadesi yaklaşan ve 30 güne kadar geciken, 90+ gün: 3 aydan fazla geciken tutarlar.</p>
            </div>
            {/* Aylik hareket */}
            <div className="bg-blue-950/40 border border-blue-800/30 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-yellow-400" /> Son 6 Ay Hareketleri</h4>
              <div className="h-56">
                <ResponsiveContainer>
                  <BarChart data={aylikOzet}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                    <XAxis dataKey="etiket" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => (v / 1000).toFixed(0) + 'K'} />
                    <Tooltip formatter={v => tl(v)} contentStyle={{ background: '#0a1730', border: '1px solid #1e40af', borderRadius: 8, color: '#fff' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="borc" name="Borç (Satış)" fill="#34d399" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="alacak" name="Alacak (Tahsilat/Alım)" fill="#fb7185" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Vade durumu listesi */}
          <div className="bg-blue-950/40 border border-blue-800/30 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><HandCoins className="w-4 h-4 text-yellow-400" /> Vade Durumu — Bekleyen Alacaklarım</h4>
            {(() => {
              const bekleyen = ozet.kartOzetleri.filter(k => k.vadesiGelmisAlacak > 0 || k.vadesiGecenAlacak > 0).sort((a, b) => b.vadesiGecenAlacak - a.vadesiGecenAlacak)
              if (!bekleyen.length) return <div className="text-sm text-gray-500 py-3 text-center">Açık alacak yok — tüm cariler kapandı. 🎉</div>
              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-gray-400 text-xs border-b border-blue-800/30"><th className="pb-2">Cari</th><th className="pb-2">Vadesi Geçen</th><th className="pb-2">Vadesi Bekleyen</th><th className="pb-2 text-right">Açık Bakiye</th></tr></thead>
                    <tbody>
                      {bekleyen.map(k => (
                        <tr key={k.id} className="border-b border-blue-800/20 last:border-0">
                          <td className="py-2 text-gray-200">{k.unvan}</td>
                          <td className="py-2 text-rose-400">{k.vadesiGecenAlacak > 0 ? tl(k.vadesiGecenAlacak) : '—'}</td>
                          <td className="py-2 text-emerald-400">{k.vadesiGelmisAlacak > 0 ? tl(k.vadesiGelmisAlacak) : '—'}</td>
                          <td className="py-2 text-right"><BakiyeEtiket bakiye={k.bakiye} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* ==================== KARTLAR ==================== */}
      {icSekme === 'kartlar' && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input value={arama} onChange={e => setArama(e.target.value)} placeholder="Ünvan, kod veya VKN ara..." className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 pl-9 pr-3 text-sm text-white" />
            </div>
            {['tumu', 'musteri', 'tedarikci', 'her-ikisi'].map(t => (
              <button key={t} onClick={() => setTurFiltre(t)} className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${turFiltre === t ? 'bg-blue-600 text-white' : 'bg-blue-900/40 text-gray-300 hover:text-white'}`}>
                {t === 'tumu' ? 'Tümü' : t === 'musteri' ? 'Müşteri' : t === 'tedarikci' ? 'Tedarikçi' : 'Her İkisi'}
              </button>
            ))}
          </div>

          {!filtreliKartlar.length ? (
            <div className="text-center py-10 text-gray-400">
              <Users className="w-10 h-10 mx-auto mb-3 text-gray-600" />
              <p>{kartlar.length ? 'Filtreye uyan cari yok.' : 'Henüz cari kart yok. "Cari Kartı" butonuyla ilk kartınızı ekleyin.'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer select-none">
                  <input type="checkbox" checked={seciliKartlar.length === filtreliKartlar.length && filtreliKartlar.length > 0} onChange={tumKartlariSec} className="w-4 h-4 accent-blue-500" />
                  Tümünü seç ({filtreliKartlar.length})
                </label>
                {!!seciliKartlar.length && (
                  <button onClick={kartlariTopluSil} className="flex items-center gap-1.5 bg-red-500/20 border border-red-500/40 text-red-300 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-500/30">
                    <Trash2 className="w-3.5 h-3.5" /> Seçilenleri Sil ({seciliKartlar.length})
                  </button>
                )}
              </div>
              {filtreliKartlar.map(k => {
                const acik = !!acikKartlar[k.id]
                const kartHareketleri = hareketler.filter(h => h.kart_id === k.id)
                return (
                  <div key={k.id} className="bg-blue-950/40 border border-blue-800/30 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 p-3.5 flex-wrap">
                      <input type="checkbox" checked={seciliKartlar.includes(k.id)} onChange={() => kartSecimToggle(k.id)} title="Toplu silme için seç" className="w-4 h-4 accent-blue-500 shrink-0" />
                      <button onClick={() => setAcikKartlar(p => ({ ...p, [k.id]: !p[k.id] }))} className="text-gray-400 hover:text-white">
                        {acik ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      <div className="min-w-[180px] flex-1">
                        <div className="text-sm font-medium text-white flex items-center gap-2 flex-wrap">
                          {k.unvan}
                          {k.durum !== 'aktif' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">Pasif</span>}
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">{k.tur === 'musteri' ? 'Müşteri' : k.tur === 'tedarikci' ? 'Tedarikçi' : 'Her İkisi'}</span>
                          {!k.acik_hesap && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400">Peşin</span>}
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5">{k.kod && <span>{k.kod} · </span>}{k.vkn && <span>VKN: {k.vkn} · </span>}{k.sehir && <span>{k.sehir} · </span>}<span>Vade: {k.vade_gunu} gün</span></div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-semibold ${k.bakiye > 0.005 ? 'text-emerald-400' : k.bakiye < -0.005 ? 'text-rose-400' : 'text-gray-400'}`}>
                          {paraYaz(Math.abs(k.bakiye))} ₺ {k.bakiye > 0.005 ? '(A)' : k.bakiye < -0.005 ? '(B)' : ''}
                        </div>
                        <div className="text-[10px] text-gray-500">{k.sonHareket ? 'Son: ' + k.sonHareket : 'Hareket yok'}</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => { setEkstreKartId(String(k.id)); setIcSekme('ekstre') }} title="Ekstre" className="p-2 rounded-lg bg-blue-600/20 text-blue-300 hover:bg-blue-600/40"><FileSpreadsheet className="w-4 h-4" /></button>
                        <button onClick={() => setHareketModal({ kart: k })} title="Hareket Ekle" className="p-2 rounded-lg bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/40"><Plus className="w-4 h-4" /></button>
                        <button onClick={() => setKartModal(k)} title="Düzenle" className="p-2 rounded-lg bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => kartSil(k)} title="Sil" className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                    {acik && (
                      <div className="border-t border-blue-800/30 bg-blue-950/60 p-3">
                        {!kartHareketleri.length ? <div className="text-xs text-gray-500 text-center py-2">Bu karta ait hareket yok.</div> : (
                          <table className="w-full text-xs">
                            <thead><tr className="text-left text-gray-500 border-b border-blue-800/30"><th className="pb-1.5">Tarih</th><th className="pb-1.5">Tür</th><th className="pb-1.5">Belge</th><th className="pb-1.5">Açıklama</th><th className="pb-1.5 text-right">Borç</th><th className="pb-1.5 text-right">Alacak</th><th className="pb-1.5 text-right">Bakiye</th><th /></tr></thead>
                            <tbody>
                              {(() => {
                                let y = 0
                                return kartHareketleri.map(h => {
                                  y += (Number(h.borc) || 0) - (Number(h.alacak) || 0)
                                  return (
                                    <tr key={h.id} className="border-b border-blue-800/10 last:border-0">
                                      <td className="py-1.5 text-gray-300">{h.tarih}</td>
                                      <td className="py-1.5 text-gray-400">{CARI_ISLEM_TURLERI.find(t => t.id === h.islem_turu)?.label || h.islem_turu}</td>
                                      <td className="py-1.5 text-gray-400">{h.belge_no || '—'}</td>
                                      <td className="py-1.5 text-gray-400">
                                        {h.aciklama || '—'}
                                        {(dovizMetni(h) || odemeEtiketi(h.odeme_yontemi)) && (
                                          <div className="text-[10px] text-gray-500 mt-0.5">
                                            {[dovizMetni(h), odemeEtiketi(h.odeme_yontemi)].filter(Boolean).join(' · ')}
                                          </div>
                                        )}
                                      </td>
                                      <td className="py-1.5 text-right text-emerald-400">{Number(h.borc) > 0 ? paraYaz(h.borc) : ''}</td>
                                      <td className="py-1.5 text-right text-rose-400">{Number(h.alacak) > 0 ? paraYaz(h.alacak) : ''}</td>
                                      <td className={`py-1.5 text-right font-medium ${y > 0.005 ? 'text-emerald-400' : y < -0.005 ? 'text-rose-400' : 'text-gray-400'}`}>{paraYaz(y)}</td>
                                      <td className="py-1.5 text-right whitespace-nowrap">
                                        <button onClick={() => setHareketModal({ hareket: h, kart: k })} className="p-1 text-gray-500 hover:text-yellow-400"><Pencil className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => hareketSil(h)} className="p-1 text-gray-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                                      </td>
                                    </tr>
                                  )
                                })
                              })()}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================== EKSTRE ==================== */}
      {icSekme === 'ekstre' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Cari Kart</label>
              <select value={ekstreKartId} onChange={e => setEkstreKartId(e.target.value)} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white">
                <option value="">Seçiniz...</option>
                {kartlar.map(k => <option key={k.id} value={k.id}>{k.unvan}{k.kod ? ` (${k.kod})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Başlangıç</label>
              <input type="date" value={ekstreBaslangic} onChange={e => setEkstreBaslangic(e.target.value)} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Bitiş</label>
              <input type="date" value={ekstreBitis} onChange={e => setEkstreBitis(e.target.value)} className="w-full bg-blue-900/40 border border-blue-700/50 rounded-lg py-2 px-3 text-sm text-white" />
            </div>
            <div className="flex gap-2">
              <button onClick={ekstreExcel} disabled={!ekstre} className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600/30 border border-blue-500/40 text-blue-100 px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-600/50 disabled:opacity-40">
                <FileDown className="w-4 h-4" /> Excel
              </button>
              <button onClick={ekstrePdf} disabled={!ekstre} className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600/30 border border-blue-500/40 text-blue-100 px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-600/50 disabled:opacity-40">
                <Printer className="w-4 h-4" /> PDF
              </button>
              <button onClick={mutabakatKopyala} disabled={!ekstre} className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600/30 border border-blue-500/40 text-blue-100 px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-600/50 disabled:opacity-40">
                {kopyalandi ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />} {kopyalandi ? 'Kopyalandı' : 'Mutabakat'}
              </button>
              <button onClick={() => setPaylasModal(true)} disabled={!ekstre} className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 px-3 py-2 rounded-lg text-sm font-medium hover:bg-emerald-500/40 disabled:opacity-40">
                <Send className="w-4 h-4" /> Gönder
              </button>
            </div>
          </div>

          {!ekstre ? (
            <div className="text-center py-10 text-gray-400">
              <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 text-gray-600" />
              <p>Ekstresini görmek istediğiniz cari kartı seçin.</p>
            </div>
          ) : (
            <div className="bg-blue-950/40 border border-blue-800/30 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-white">{ekstreKart.unvan}</h4>
                  <p className="text-[11px] text-gray-500">{ekstreBaslangic} — {ekstreBitis} dönemi · {ekstre.satirlar.length} hareket</p>
                </div>
                <div className="flex gap-4 text-xs">
                  <span className="text-gray-400">Dönem Başı: <b className="text-gray-200">{paraYaz(ekstre.baslangicBakiyesi)}</b></span>
                  <span className="text-gray-400">Bitiş: <b className={ekstre.bitisBakiyesi > 0 ? 'text-emerald-400' : ekstre.bitisBakiyesi < 0 ? 'text-rose-400' : 'text-gray-300'}>{paraYaz(ekstre.bitisBakiyesi)}</b></span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-gray-400 border-b border-blue-800/30">
                    <th className="pb-2">Tarih</th><th className="pb-2">Tür</th><th className="pb-2">Belge</th><th className="pb-2">Açıklama</th>
                    <th className="pb-2 text-right">Borç</th><th className="pb-2 text-right">Alacak</th><th className="pb-2 text-right">Bakiye</th>
                  </tr></thead>
                  <tbody>
                    <tr className="border-b border-blue-800/20 bg-blue-900/20">
                      <td className="py-2 text-gray-400" colSpan={6}>Dönem başı bakiye</td>
                      <td className={`py-2 text-right font-semibold ${ekstre.baslangicBakiyesi > 0 ? 'text-emerald-400' : ekstre.baslangicBakiyesi < 0 ? 'text-rose-400' : 'text-gray-300'}`}>{paraYaz(ekstre.baslangicBakiyesi)}</td>
                    </tr>
                    {ekstre.satirlar.map(h => (
                      <tr key={h.id} className="border-b border-blue-800/10 last:border-0">
                        <td className="py-1.5 text-gray-300">{h.tarih}</td>
                        <td className="py-1.5 text-gray-400">{CARI_ISLEM_TURLERI.find(t => t.id === h.islem_turu)?.label || h.islem_turu}</td>
                        <td className="py-1.5 text-gray-400">{h.belge_no || '—'}</td>
                        <td className="py-1.5 text-gray-400">
                          {h.aciklama || '—'}
                          {(dovizMetni(h) || odemeEtiketi(h.odeme_yontemi)) && (
                            <div className="text-[10px] text-gray-500 mt-0.5">
                              {[dovizMetni(h), odemeEtiketi(h.odeme_yontemi)].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </td>
                        <td className="py-1.5 text-right text-emerald-400">{Number(h.borc) > 0 ? paraYaz(h.borc) : ''}</td>
                        <td className="py-1.5 text-right text-rose-400">{Number(h.alacak) > 0 ? paraYaz(h.alacak) : ''}</td>
                        <td className={`py-1.5 text-right font-medium ${h.bakiye > 0.005 ? 'text-emerald-400' : h.bakiye < -0.005 ? 'text-rose-400' : 'text-gray-400'}`}>{paraYaz(h.bakiye)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-blue-800/40">
                      <td className="py-2 font-medium text-gray-300" colSpan={4}>Dönem Toplamı</td>
                      <td className="py-2 text-right font-semibold text-emerald-400">{paraYaz(ekstre.donemBorc)}</td>
                      <td className="py-2 text-right font-semibold text-rose-400">{paraYaz(ekstre.donemAlacak)}</td>
                      <td className={`py-2 text-right font-bold ${ekstre.bitisBakiyesi > 0 ? 'text-emerald-400' : ekstre.bitisBakiyesi < 0 ? 'text-rose-400' : 'text-gray-300'}`}>{paraYaz(ekstre.bitisBakiyesi)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== CEK/SENET PORTFOYU ==================== */}
      {icSekme === 'cek-senet' && <CekSenetSekmesi hareketler={hareketler} kartlar={kartlar} yukle={yukle} />}

      {/* ==================== VERI AKTARIMI ==================== */}
      {icSekme === 'aktarim' && <VeriAktarimSekmesi clientId={clientId} kartlar={kartlar} bitti={yukle} />}

      {/* Modallar */}
      {kartModal && <KartFormModal kart={kartModal === 'yeni' ? null : kartModal} kaydet={kartKaydet} kapat={() => setKartModal(null)} />}
      {hareketModal && <HareketFormModal hareket={hareketModal.hareket || null} varsayilanKart={hareketModal.kart} kartlar={kartlar} kaydet={hareketKaydet} kapat={() => setHareketModal(null)} />}
      {virmanModal && <VirmanModal kartlar={kartlar} kaydet={virmanYap} kapat={() => setVirmanModal(false)} />}
      {paylasModal && <EkstrePaylasModal clientId={clientId} kart={ekstreKart} donem={`${ekstreBaslangic} - ${ekstreBitis}`} hazirla={ekstrePdfBlob} firmAdi={firmAdi} kapat={() => setPaylasModal(false)} />}
      {rehberAcik && <KullanimRehberiModal kapat={() => setRehberAcik(false)} />}
    </div>
  )
}
