import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import { supabase } from '../lib/supabase'
import { mevzuatTakvimTarihleriGetir } from '../services/mevzuatService'
import { 
  Search, CheckCircle, Clock, AlertTriangle, ChevronLeft, ChevronRight
} from 'lucide-react'

const months = ['Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran', 'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik']

// Beyan durum anahtari cozumleyici — AylikBeyanTakip'in yazdigi formata birebir uyar.
// Anahtarlar "ait oldugu ay" bazlidir: ${belongYear}_${belongMonth}_${type}
const TYPE_KEY_MAP = { gecici: 'gecici_vergi', gelir: 'gelir_vergi' }

const resolveBeyanStatusKey = (type, month, year, client) => {
  const t = TYPE_KEY_MAP[type] || type
  if (t === 'gecici_vergi') {
    // Ceyrek son ayi seciliyken anahtar ceyrek baslangic ayidir
    const qStart = month - 2
    return qStart >= 0 ? `${year}_${qStart}_gecici_vergi` : `${year - 1}_${12 + qStart}_gecici_vergi`
  }
  if (t === 'gelir_vergi') return `${year - 1}_0_gelir_vergi`
  if (t === 'edefter') {
    const rawPeriod = String(client?.edefterPeriod ?? 'aylik').toLowerCase().replace(/[\s_-]/g, '')
    const uc3 = rawPeriod === '3aylik' || rawPeriod === 'ucaylik' || rawPeriod === '3ay'
    if (uc3) {
      const qStart = month - 2
      return qStart >= 0 ? `${year}_${qStart}_edefter` : `${year - 1}_${12 + qStart}_edefter`
    }
    // Aylik e-defter: ilgili ayi takip eden 4. ayda yuklenir -> ait oldugu ay = month - 3
    const edM = (month + 9) % 12
    const edY = month <= 2 ? year - 1 : year
    return `${edY}_${edM}_edefter`
  }
  return `${year}_${month}_${t}`
}

const beyanDeadline = (type, month, year, client) => {
  const t = TYPE_KEY_MAP[type] || type
  const next = month === 11 ? { m: 0, y: year + 1 } : { m: month + 1, y: year }
  if (t === 'kdv') return new Date(next.y, next.m, 28)
  if (t === 'kdv2') return new Date(next.y, next.m, 25)
  if (t === 'muhtasar' || t === 'damga') return new Date(next.y, next.m, 26)
  if (t === 'sgk') {
    const last = new Date(next.y, next.m + 1, 0)
    while (last.getDay() === 0 || last.getDay() === 6 || isResmiTatil(last)) {
      last.setDate(last.getDate() - 1)
    }
    return last
  }
  if (t === 'gecici_vergi') return new Date(next.y, next.m, 17)
  if (t === 'gelir_vergi') return new Date(year, 2, 31)
  if (t === 'edefter') {
    const sahis = client?.type === 'individual'
    const rawPeriod = String(client?.edefterPeriod ?? 'aylik').toLowerCase().replace(/[\s_-]/g, '')
    const uc3 = rawPeriod === '3aylik' || rawPeriod === 'ucaylik' || rawPeriod === '3ay'
    if (uc3) {
      if (month === 11) return sahis ? new Date(year + 1, 3, 10) : new Date(year + 1, 4, 14)
      return new Date(year, month + 3, sahis ? 10 : 14)
    }
    return new Date(next.y, next.m, sahis ? 10 : 14)
  }
  return null
}

const toWorkDay = (date) => {
  const d = new Date(date)
  while (d.getDay() === 0 || d.getDay() === 6 || isResmiTatil(d)) {
    d.setDate(d.getDate() + 1)
  }
  return d
}

const formatDL = (date) => {
  if (!date) return ''
  const d = toWorkDay(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const beyanTypes = [
  { id: 'kdv', name: 'KDV', icon: '📋', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { id: 'kdv2', name: 'KDV2', icon: '📋', color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
  { id: 'muhtasar', name: 'Muhtasar', icon: '📊', color: 'text-purple-400', bg: 'bg-purple-500/10' },
  { id: 'sgk', name: 'SGK', icon: '🏥', color: 'text-red-400', bg: 'bg-red-500/10' },
  { id: 'gecici', name: 'Gecici Vergi', icon: '💰', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  { id: 'damga', name: 'Damga Vergisi', icon: '📝', color: 'text-pink-400', bg: 'bg-pink-500/10' },
  { id: 'edefter', name: 'e-Defter', icon: '📚', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  { id: 'gelir', name: 'Gelir Vergisi', icon: '📄', color: 'text-orange-400', bg: 'bg-orange-500/10' },
]

const quarterlyMonths = [2, 5, 8, 11]
const defaultBeyanSettings = { kdv: 'monthly', muhtasar: 'monthly', sgk: true, gecici: true, damga: false, edefter: 'monthly', kdv2: false, gelir: 'mart' }

export default function TaxCalendar() {
  const { user } = useAuth()
  const _isAdmin = user?.role === 'admin'
  const { clients, refresh: refreshClients } = useClients()
  const [selectedYear, setSelectedYear] = useState(2026)
  const [selectedMonth, setSelectedMonth] = useState(6)
  const [selectedBeyan, setSelectedBeyan] = useState('kdv')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [mevzuatTarihler, setMevzuatTarihler] = useState([])

  useEffect(() => {
    mevzuatTakvimTarihleriGetir().then(t => setMevzuatTarihler(t || [])).catch(() => {})
  }, [])

  // Durumlar dogrudan veritabanindaki beyan_durumlari'ndan okunur
  // (AylikBeyanTakip ile ayni kaynak — localStorage kullanilmaz)
  const getBeyanStatus = (client, type, month, year) => {
    const key = resolveBeyanStatusKey(type, month, year, client)
    const durum = client.beyanDurumlari?.[key]
    if (durum === 'yapildi' || durum === 'onaylandi' || durum === 'tahakkuk_gonderildi') return 'completed'
    const dl = beyanDeadline(type, month, year, client)
    if (dl && new Date() > dl) return 'overdue'
    return 'pending'
  }

  const toggleStatus = async (clientId, type, month, year) => {
    if (statusUpdating) return
    const client = clients.find(c => c.id === clientId)
    if (!client) return
    const key = resolveBeyanStatusKey(type, month, year, client)
    const current = getBeyanStatus(client, type, month, year)
    const nextStatus = current === 'completed' ? 'yapilamadi' : 'yapildi'
    const currentMap = client.beyanDurumlari || {}
    const updatedMap = {
      ...currentMap,
      [key]: nextStatus,
      [`${key}_personel`]: user?.name || user?.email || 'Admin',
      [`${key}_tarih`]: new Date().toISOString()
    }
    setStatusUpdating(true)
    try {
      const { error } = await supabase
        .from('clients')
        .update({ beyan_durumlari: updatedMap })
        .eq('id', clientId)
      if (error) throw error
      await refreshClients?.()
    } catch (err) {
      alert('Durum kaydedilemedi: ' + (err.message || 'Bilinmeyen hata'))
    } finally {
      setStatusUpdating(false)
    }
  }

  const shouldShowBeyan = (client, type, month) => {
    const settings = client.beyanSettings || defaultBeyanSettings
    const val = settings[type]
    if (val === false || val === 'none' || val === undefined) return false
    if (type === 'gecici') return val === true && quarterlyMonths.includes(month)
    if (type === 'gelir') { if (val === 'mart') return month === 2; if (val === 'nisan') return month === 3; return false }
    if (val === 'quarterly') return quarterlyMonths.includes(month)
    if (val === 'monthly' || val === true) return true
    return false
  }

  const filteredClients = clients.filter(c => {
    if (!searchTerm) return true
    return (c.company || c.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  })

  const beyanList = filteredClients
    .filter(c => shouldShowBeyan(c, selectedBeyan, selectedMonth))
    .map(c => ({
      ...c,
      status: getBeyanStatus(c, selectedBeyan, selectedMonth, selectedYear)
    }))

  const stats = {
    total: beyanList.length,
    completed: beyanList.filter(b => b.status === 'completed').length,
    pending: beyanList.filter(b => b.status === 'pending').length,
    overdue: beyanList.filter(b => b.status === 'overdue').length
  }

  const bt = beyanTypes.find(b => b.id === selectedBeyan)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">📊 Beyan Takip Merkezi</h1>
          <p className="text-gray-400 mt-1">{months[selectedMonth]} {selectedYear} - {bt?.icon} {bt?.name}</p>
        </div>
      </div>

      {/* Beyan Turu Secimi */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 mb-6">
        {beyanTypes.map(bt => (
          <button key={bt.id} onClick={() => setSelectedBeyan(bt.id)}
            className={`${bt.bg} rounded-xl p-3 border text-center transition-all hover:scale-105 ${selectedBeyan === bt.id ? 'border-yellow-500/50 ring-1 ring-yellow-500' : 'border-blue-800/20'}`}>
            <span className={`${bt.color} text-xs font-medium block`}>{bt.icon}</span>
            <span className={`text-xs ${selectedBeyan === bt.id ? 'text-white' : 'text-gray-400'}`}>{bt.name}</span>
          </button>
        ))}
      </div>

      {/* Istatistikler */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Toplam Mukellef', value: stats.total, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: '✅ Tamamlanan', value: stats.completed, color: 'text-green-400', bg: 'bg-green-500/10' },
          { label: '⏳ Bekleyen', value: stats.pending, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
          { label: '⚠️ Gecikmis', value: stats.overdue, color: 'text-red-400', bg: 'bg-red-500/10' },
        ].map((card, i) => (
          <div key={i} className="bg-blue-950/40 rounded-2xl p-4 border border-blue-800/30 text-center">
            <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
            <div className="text-gray-400 text-xs">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Ay Secimi */}
      <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-4 border border-blue-800/30 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <button onClick={() => { if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(selectedYear - 1) } else setSelectedMonth(selectedMonth - 1) }} className="p-2 bg-blue-900/30 rounded-lg text-gray-400 hover:text-white"><ChevronLeft className="w-5 h-5" /></button>
            <h3 className="text-xl font-bold text-white min-w-[180px] text-center">{months[selectedMonth]} {selectedYear}</h3>
            <button onClick={() => { if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(selectedYear + 1) } else setSelectedMonth(selectedMonth + 1) }} className="p-2 bg-blue-900/30 rounded-lg text-gray-400 hover:text-white"><ChevronRight className="w-5 h-5" /></button>
          </div>
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" /><input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-blue-900/30 text-gray-300 rounded-lg pl-10 pr-4 py-2 text-sm border border-blue-700/50 w-48" placeholder="Musteri ara..." /></div>
        </div>
      </div>

      {/* Beyan Listesi */}
      <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30">
        <h3 className="text-lg font-semibold text-white mb-4">{bt?.icon} {bt?.name} - {months[selectedMonth]} {selectedYear}</h3>
        
        {beyanList.length === 0 ? (
          <div className="text-center py-8 text-gray-400">Bu ay {bt?.name} beyani veren mukellef yok</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="text-left text-gray-400 text-sm border-b border-blue-800/30"><th className="pb-3">Musteri</th><th className="pb-3 hidden sm:table-cell">Sehir</th><th className="pb-3">Durum</th><th className="pb-3">Islem</th></tr></thead>
              <tbody>
                {beyanList.map(client => (
                  <tr key={client.id} className="border-b border-blue-800/20 text-gray-300 hover:bg-blue-900/20">
                    <td className="py-3 font-medium text-white">{client.company || client.name}</td>
                    <td className="py-3 text-sm hidden sm:table-cell">{client.city || '-'}</td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium flex items-center space-x-1 w-fit ${
                        client.status === 'completed' ? 'bg-green-500/20 text-green-400' : 
                        client.status === 'overdue' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {client.status === 'completed' ? <CheckCircle className="w-3.5 h-3.5" /> : 
                         client.status === 'overdue' ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                        <span>{client.status === 'completed' ? 'Tamamlandi' : client.status === 'overdue' ? 'Gecikmis' : 'Bekliyor'}</span>
                      </span>
                    </td>
                    <td className="py-3">
                      <button onClick={() => toggleStatus(client.id, selectedBeyan, selectedMonth, selectedYear)}
                        disabled={statusUpdating}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-all disabled:opacity-50 ${
                          client.status === 'completed' ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30' :
                          'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                        }`}>
                        {client.status === 'completed' ? 'Geri Al' : 'Tamamla'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Ozet: Verilen / Verilmeyen */}
      {stats.total > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4">
            <h3 className="text-green-400 font-semibold mb-2">✅ Verilenler ({stats.completed})</h3>
            <div className="text-xs text-gray-300">
              {beyanList.filter(b => b.status === 'completed').map(b => (
                <span key={b.id} className="inline-block bg-green-500/10 px-2 py-0.5 rounded mr-1 mb-1">{b.company || b.name}</span>
              ))}
              {stats.completed === 0 && <span className="text-gray-500">Henuz yok</span>}
            </div>
          </div>
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
            <h3 className="text-red-400 font-semibold mb-2">⚠️ Verilmeyenler ({stats.pending + stats.overdue})</h3>
            <div className="text-xs text-gray-300">
              {beyanList.filter(b => b.status !== 'completed').map(b => (
                <span key={b.id} className={`inline-block px-2 py-0.5 rounded mr-1 mb-1 ${b.status === 'overdue' ? 'bg-red-500/20 text-red-300' : 'bg-yellow-500/10 text-yellow-300'}`}>
                  {b.company || b.name}
                </span>
              ))}
              {(stats.pending + stats.overdue) === 0 && <span className="text-gray-500">Hepsi tamamlandi! 🎉</span>}
            </div>
          </div>
        </div>
      )}
      {/* Mevzuat & AI Asistan — Kaynakli Tarihler (Faz 3) */}
      {mevzuatTarihler.length > 0 && (
        <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30 mt-6">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <span>📜</span> Mevzuat Kaynaklı Tarihler — {months[selectedMonth]} {selectedYear}
          </h2>
          <p className="text-sm text-blue-100/60 mb-4">Onaylanmış mevzuat kurallarından gelen tarihler. Mevcut takvim tarihleriyle çelişiyorsa her iki tarih de gösterilir.</p>
          <div className="grid grid-cols-7 gap-1 mb-4">
            {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(g => (
              <div key={g} className="text-center text-xs text-blue-300/60 font-medium py-1">{g}</div>
            ))}
            {Array.from({ length: new Date(selectedYear, selectedMonth, 1).getDay() === 0 ? 6 : new Date(selectedYear, selectedMonth, 1).getDay() - 1 }, (_, i) => (
              <div key={`bos-${i}`} className="h-8" />
            ))}
            {Array.from({ length: new Date(selectedYear, selectedMonth + 1, 0).getDate() }, (_, i) => i + 1).map(g => {
              const tarihStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(g).padStart(2, '0')}`
              const mevzuatGunleri = mevzuatTarihler.filter(t => t.tarih === tarihStr || t.tarih?.startsWith(tarihStr))
              const mevcutDeadline = beyanDeadline(selectedBeyan, selectedMonth, selectedYear, null)
              const mevcutGun = mevcutDeadline ? mevcutDeadline.getDate() : null
              const celiski = mevzuatGunleri.length > 0 && mevcutGun === g
              return (
                <div key={g} className={`h-8 flex items-center justify-center rounded text-xs font-medium relative ${mevzuatGunleri.length > 0 ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/40' : mevcutGun === g ? 'bg-blue-500/20 text-blue-300' : 'text-gray-400'}`}>
                  {g}
                  {celiski && <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" title="Çelişki" />}
                </div>
              )
            })}
          </div>
          <div className="space-y-2">
            {mevzuatTarihler
              .filter(t => {
                const d = new Date(t.tarih)
                return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear
              })
              .map(t => (
                <div key={t.id} className="flex items-center justify-between gap-4 border-b border-blue-400/10 pb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{t.baslik}</p>
                    <p className="text-xs text-blue-100/60">{t.konu || ''} · {t.ilgiliKurum || ''}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-amber-300">{new Date(t.tarih).toLocaleDateString('tr-TR')}</p>
                    {t.sonBasvuruTarihi && <p className="text-xs text-red-300">Son başvuru: {new Date(t.sonBasvuruTarihi).toLocaleDateString('tr-TR')}</p>}
                    {t.dayanakUrl && <a href={t.dayanakUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-300 hover:underline">Dayanak</a>}
                  </div>
                </div>
              ))}
            {mevzuatTarihler.filter(t => { const d = new Date(t.tarih); return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear }).length === 0 && (
              <p className="text-blue-100/60 text-sm">Bu dönem için mevzuat kaynaklı tarih yok.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}