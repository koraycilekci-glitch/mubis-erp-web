import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  KeyRound, Search, Eye, EyeOff, Pencil, X, Save,
  FileSpreadsheet, FileDown, RefreshCw, Lock
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useAuth } from '../context/AuthContext'

const ALANLAR = [
  { key: 'name', label: 'Müşteri / Unvan', tur: 'metin' },
  { key: 'vkn', label: 'VKN / TCKN', tur: 'metin' },
  { key: 'tax_office', label: 'Vergi Dairesi', tur: 'metin' },
  { key: 'dvs_username', label: 'VD Kullanıcı Kodu', tur: 'sifre' },
  { key: 'dvs_password', label: 'VD Şifre', tur: 'sifre' },
  { key: 'sgk_user', label: 'SGK Kullanıcı Adı', tur: 'sifre' },
  { key: 'sgk_isyeri_kodu', label: 'SGK İşyeri Kodu', tur: 'sifre' },
  { key: 'sgk_sistem_sifre', label: 'SGK Sistem Şifresi', tur: 'sifre' },
  { key: 'sgk_isyeri_sifre', label: 'SGK İşyeri Şifresi', tur: 'sifre' },
  { key: 'edevlet_pass', label: 'e-Devlet Şifresi', tur: 'sifre' },
]

const maskele = (v) => (v ? '•'.repeat(Math.min(String(v).length, 10)) : '')

export default function KurumSifreleri() {
  const { user } = useAuth()
  const [kayitlar, setKayitlar] = useState([])
  const [loading, setLoading] = useState(true)
  const [arama, setArama] = useState('')
  const [sifreGoster, setSifreGoster] = useState(false)
  const [duzenlenen, setDuzenlenen] = useState(null)
  const [duzenlenenVeri, setDuzenlenenVeri] = useState({})
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const veriCek = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('clients')
      .select('id, name, vkn, tc, tax_office, dvs_username, dvs_password, sgk_user, sgk_isyeri_kodu, sgk_sistem_sifre, sgk_isyeri_sifre, edevlet_pass')
      .order('name', { ascending: true })
    if (error) {
      console.error('Kurum sifreleri okunamadi:', error)
      alert('Veri okunamadi: ' + error.message)
    }
    setKayitlar(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { veriCek() }, [veriCek])

  const filtreli = kayitlar.filter(k => {
    if (!arama.trim()) return true
    const s = arama.toLowerCase()
    return (k.name || '').toLowerCase().includes(s) ||
      (k.vkn || '').includes(arama) || (k.tc || '').includes(arama)
  })

  const duzenleAc = (kayit) => {
    setDuzenlenen(kayit)
    setDuzenlenenVeri(Object.fromEntries(ALANLAR.map(a => [a.key, kayit[a.key] || ''])))
  }

  const kaydet = async () => {
    if (!duzenlenen) return
    setKaydediliyor(true)
    const mapped = {}
    for (const a of ALANLAR) {
      if (a.key === 'name' || a.key === 'vkn') continue
      if ((duzenlenenVeri[a.key] || '') !== (duzenlenen[a.key] || '')) {
        mapped[a.key] = duzenlenenVeri[a.key] || null
      }
    }
    if (Object.keys(mapped).length > 0) {
      const { error } = await supabase
        .from('clients')
        .update(mapped)
        .eq('id', duzenlenen.id)
      if (error) {
        alert('Kaydedilemedi: ' + error.message)
        setKaydediliyor(false)
        return
      }
    }
    setDuzenlenen(null)
    setKaydediliyor(false)
    veriCek()
  }

  // ---------- Excel dokuemu ----------
  const excelDokuem = () => {
    const rows = filtreli.map(k => Object.fromEntries(
      ALANLAR.map(a => [a.label, k[a.key] || ''])
    ))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = ALANLAR.map(a => ({ wch: a.key === 'name' ? 40 : 22 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Kurum Sifreleri')
    XLSX.writeFile(wb, `kurum-sifreleri-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ---------- PDF dokuem ----------
  const pdfDokuem = async () => {
    const doc = new jsPDF({ orientation: 'landscape' })
    // Turkce karakter icin DejaVuSans gomulur; yuklenemezse ASCII'ye cevrilir
    let fontOk = false
    try {
      const r = await fetch('/fonts/DejaVuSans.ttf')
      if (r.ok) {
        const buf = await r.arrayBuffer()
        let binary = ''
        const bytes = new Uint8Array(buf)
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
        doc.addFileToVFS('DejaVuSans.ttf', binary)
        doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal')
        fontOk = true
      }
    } catch (e) { /* fallback ascii */ }
    const trAscii = (s) => String(s || '')
      .replace(/ğ/g, 'g').replace(/Ğ/g, 'G').replace(/ü/g, 'u').replace(/Ü/g, 'U')
      .replace(/ş/g, 's').replace(/Ş/g, 'S').replace(/ı/g, 'i').replace(/İ/g, 'I')
      .replace(/ö/g, 'o').replace(/Ö/g, 'O').replace(/ç/g, 'c').replace(/Ç/g, 'C')
    const T = fontOk ? (s) => String(s || '') : trAscii

    doc.setFontSize(14)
    doc.text(T('Kurum Sifreleri Dokuemu'), 14, 15)
    doc.setFontSize(9)
    doc.text(T(`Olusturma: ${new Date().toLocaleString('tr-TR')}  |  Kayit: ${filtreli.length}  |  ${user?.name || ''}`), 14, 21)

    autoTable(doc, {
      startY: 25,
      head: [ALANLAR.map(a => T(a.label))],
      body: filtreli.map(k => ALANLAR.map(a => T(k[a.key] || ''))),
      styles: { font: fontOk ? 'DejaVuSans' : 'helvetica', fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [30, 58, 138] },
      alternateRowStyles: { fillColor: [239, 246, 255] }
    })
    doc.save(`kurum-sifreleri-${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  if (user?.role !== 'admin' && user?.role !== 'super_admin') {
    return <div className="p-8 text-white">Bu sayfaya erisim yetkiniz yok.</div>
  }

  return (
    <div className="p-6 space-y-4">
      {/* Baslik */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-600/20 rounded-xl">
            <KeyRound className="w-6 h-6 text-yellow-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Kurum Şifreleri</h1>
            <p className="text-xs text-gray-400">Vergi Dairesi ve SGK giriş bilgileri (yalnız yönetici)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSifreGoster(v => !v)}
            className="flex items-center gap-2 bg-blue-800/40 hover:bg-blue-800/60 border border-blue-700/40 text-white text-sm px-3 py-2 rounded-lg transition-colors">
            {sifreGoster ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {sifreGoster ? 'Şifreleri Gizle' : 'Şifreleri Göster'}
          </button>
          <button onClick={excelDokuem} title="Excel dökümü"
            className="flex items-center gap-2 bg-green-600/20 hover:bg-green-600/30 border border-green-600/40 text-green-300 text-sm px-3 py-2 rounded-lg transition-colors">
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </button>
          <button onClick={pdfDokuem} title="PDF dökümü"
            className="flex items-center gap-2 bg-red-600/20 hover:bg-red-600/30 border border-red-600/40 text-red-300 text-sm px-3 py-2 rounded-lg transition-colors">
            <FileDown className="w-4 h-4" /> PDF
          </button>
          <button onClick={veriCek} title="Yenile"
            className="p-2 bg-blue-800/40 hover:bg-blue-800/60 border border-blue-700/40 text-white rounded-lg transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Guvenlik uyarisi */}
      <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
        <Lock className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
        <p className="text-xs text-yellow-200/80">
          Bu ekrandaki bilgiler gizlidir. Döküm alırken dosyanın paylaşımına dikkat edin; şifreler düz metin olarak çıkarılır.
        </p>
      </div>

      {/* Arama */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={arama}
          onChange={e => setArama(e.target.value)}
          placeholder="Müşteri adı, VKN veya TCKN ara..."
          className="w-full bg-blue-900/40 border border-blue-700/40 rounded-lg py-2.5 pl-10 pr-3 text-white text-sm focus:outline-none focus:border-yellow-400"
        />
      </div>

      {/* Tablo */}
      <div className="bg-blue-900/40 border border-blue-700/30 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-blue-800/50 text-blue-200 text-xs uppercase">
                <th className="px-3 py-3 text-left">Müşteri</th>
                <th className="px-3 py-3 text-left">VKN / TCKN</th>
                <th className="px-3 py-3 text-left">Vergi Dairesi</th>
                <th className="px-3 py-3 text-left">VD Kullanıcı</th>
                <th className="px-3 py-3 text-left">VD Şifre</th>
                <th className="px-3 py-3 text-left">SGK Kullanıcı</th>
                <th className="px-3 py-3 text-left">SGK İşyeri Kodu</th>
                <th className="px-3 py-3 text-left">SGK Sistem Şifre</th>
                <th className="px-3 py-3 text-left">SGK İşyeri Şifre</th>
                <th className="px-3 py-3 text-left">e-Devlet Şifre</th>
                <th className="px-3 py-3 text-center">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="px-3 py-8 text-center text-gray-400">Yükleniyor...</td></tr>
              ) : filtreli.length === 0 ? (
                <tr><td colSpan={11} className="px-3 py-8 text-center text-gray-400">Kayıt bulunamadı</td></tr>
              ) : filtreli.map(k => (
                <tr key={k.id} className="border-t border-blue-700/20 hover:bg-blue-800/20">
                  <td className="px-3 py-2.5 text-white max-w-[260px] truncate" title={k.name}>{k.name}</td>
                  <td className="px-3 py-2.5 text-blue-200">{k.vkn || k.tc || '-'}</td>
                  <td className="px-3 py-2.5 text-blue-200">{k.tax_office || '-'}</td>
                  {['dvs_username', 'dvs_password', 'sgk_user', 'sgk_isyeri_kodu', 'sgk_sistem_sifre', 'sgk_isyeri_sifre', 'edevlet_pass'].map(f => (
                    <td key={f} className="px-3 py-2.5 text-blue-100">
                      {sifreGoster ? (k[f] || '-') : (k[f] ? maskele(k[f]) : '-')}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-center">
                    <button onClick={() => duzenleAc(k)} title="Düzenle"
                      className="p-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 rounded-lg transition-colors">
                      <Pencil className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="text-xs text-gray-500">{filtreli.length} kayıt listeleniyor</div>

      {/* Duzenleme modali */}
      {duzenlenen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={e => { if (e.target === e.currentTarget) setDuzenlenen(null) }}>
          <div className="bg-blue-900 rounded-2xl border border-blue-700/50 max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-5 pb-3 border-b border-blue-700/40 shrink-0">
              <h3 className="text-lg font-semibold text-white truncate">{duzenlenen.name}</h3>
              <button onClick={() => setDuzenlenen(null)} className="text-gray-400 hover:text-white shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto">
              {ALANLAR.filter(a => a.key !== 'name' && a.key !== 'vkn').map(a => (
                <div key={a.key}>
                  <label className="block text-xs text-gray-400 mb-1">{a.label}</label>
                  <div className="relative">
                    <input
                      type={sifreGoster ? 'text' : 'password'}
                      value={duzenlenenVeri[a.key] || ''}
                      onChange={e => setDuzenlenenVeri(prev => ({ ...prev, [a.key]: e.target.value }))}
                      className="w-full bg-blue-900/40 border border-blue-700/40 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400"
                    />
                    <button
                      type="button"
                      onClick={() => setSifreGoster(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                    >
                      {sifreGoster ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <button onClick={kaydet} disabled={kaydediliyor}
                  className="flex-1 flex items-center justify-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-blue-950 font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50">
                  <Save className="w-4 h-4" />
                  {kaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
                <button onClick={() => setDuzenlenen(null)}
                  className="px-4 bg-blue-800/40 hover:bg-blue-800/60 text-white rounded-lg transition-colors">
                  İptal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
