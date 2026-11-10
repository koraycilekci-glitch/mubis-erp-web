import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import { gibYardimciIs, otomasyonMusteriBilgileriGetir } from '../utils/gibOdemeHelper'
import {
  Rocket, FileArchive, Users, Activity, Calendar, Clock,
  Play, Pause, RotateCw, AlertTriangle, CheckCircle2, Loader2
} from 'lucide-react'
import {
  getAutomationSettings,
  saveAutomationSettings,
  getAutomationJobs,
  getAutomationStats
} from '../services/automationService'

const REPEAT_OPTIONS = [
  { value: 'daily', label: 'Günlük' },
  { value: 'weekly', label: 'Haftalık' },
  { value: 'monthly', label: 'Aylık' }
]

const TYPE_OPTIONS = [
  { value: 'vergi_borcu', label: 'Vergi Borcu', color: 'text-red-400' },
  { value: 'sgk_ebildirge', label: 'SGK Borç', color: 'text-blue-400' },
  { value: 'vergi_etebligat', label: 'Vergi Dairesi e-Tebligat', color: 'text-emerald-400' },
  { value: 'sgk_etebligat', label: 'SGK e-Tebligat', color: 'text-cyan-400' },
  { value: 'uets', label: 'UETS Tebligat', color: 'text-yellow-400' }
]

const WEEK_DAYS = [
  { value: 1, label: 'Pazartesi' },
  { value: 2, label: 'Salı' },
  { value: 3, label: 'Çarşamba' },
  { value: 4, label: 'Perşembe' },
  { value: 5, label: 'Cuma' },
  { value: 6, label: 'Cumartesi' },
  { value: 0, label: 'Pazar' }
]

export default function OtomasyonMerkezi() {
  const { user } = useAuth()
  const { clients } = useClients()
  const [settings, setSettings] = useState(null)
  const [jobs, setJobs] = useState([])
  const [stats, setStats] = useState({ totalClients: 0, activeJobs: 0, todayDocuments: 0 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState('')
  const [automationActive, setAutomationActive] = useState(true)
  const [scheduleWeekday, setScheduleWeekday] = useState(1)
  const [scheduleMonthday, setScheduleMonthday] = useState(1)
  const [helperStatus, setHelperStatus] = useState(null)
  const [selectedClientIds, setSelectedClientIds] = useState([])
  const [clientSearch, setClientSearch] = useState('')

  // Secili musterilerin kimlik bilgilerini de toplayan tam plan payload'i
  const buildHelperPayload = useCallback(async () => {
    let musteriBilgileri = []
    try {
      musteriBilgileri = await otomasyonMusteriBilgileriGetir(selectedClientIds)
    } catch (e) {
      console.warn('Musteri kimlik bilgileri alinamadi:', e?.message)
    }
    return {
      active: automationActive,
      schedule_time: settings?.schedule_time || '09:00',
      repeat_type: settings?.repeat_type || 'weekly',
      schedule_weekday: Number(scheduleWeekday),
      schedule_monthday: Number(scheduleMonthday),
      enabled_types: settings?.enabled_types || [],
      selected_client_ids: selectedClientIds,
      clients: musteriBilgileri
    }
  }, [
    automationActive,
    scheduleMonthday,
    scheduleWeekday,
    settings?.enabled_types,
    settings?.repeat_type,
    settings?.schedule_time,
    selectedClientIds
  ])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, j, st] = await Promise.all([
        getAutomationSettings(),
        getAutomationJobs(20),
        getAutomationStats()
      ])
      setSettings(s)
      setJobs(j)
      setStats(st)
      try {
        const local = await gibYardimciIs('otomasyon-durum', {})
        setHelperStatus(local?.ok ? local : null)
        const plan = local?.ok ? local.plan : null
        if (plan) {
          setAutomationActive(plan.active !== false)
          setScheduleWeekday(Number(plan.schedule_weekday ?? 1))
          setScheduleMonthday(Number(plan.schedule_monthday || 1))
          if (Array.isArray(plan.selected_client_ids)) setSelectedClientIds(plan.selected_client_ids)
          setSettings(current => ({
            ...(current || s),
            schedule_time: plan.schedule_time || current?.schedule_time || s?.schedule_time || '09:00',
            repeat_type: plan.repeat_type || current?.repeat_type || s?.repeat_type || 'weekly',
            enabled_types: Array.isArray(plan.enabled_types) ? plan.enabled_types : (current?.enabled_types || s?.enabled_types || [])
          }))
        }
      } catch {
        setHelperStatus(null)
      }
    } catch (e) {
      console.error(e)
      setMessage('Veriler yüklenirken hata: ' + e.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveAutomationSettings(settings)
      const local = await gibYardimciIs('otomasyon-ayar', await buildHelperPayload())
      if (local?.ok) {
        setHelperStatus(await gibYardimciIs('otomasyon-durum', {}).catch(() => null))
        setMessage(`Zamanlama kaydedildi: ${selectedClientIds.length} müşteri, ${(settings?.enabled_types || []).length} sorgu tipi.`)
      } else {
        setMessage('Yardımcı programa kaydedilemedi: ' + (local?.reason || 'erişilemedi') + '. Yardımcı programın açık olduğundan emin olun.')
      }
    } catch (e) {
      setMessage('Kaydetme hatası: ' + e.message)
    }
    setSaving(false)
  }

  const handleRun = async () => {
    if (!selectedClientIds.length) {
      setMessage('Önce sorgulanacak müşteri seçin.')
      return
    }
    if (!(settings?.enabled_types || []).length) {
      setMessage('Önce en az bir sorgu tipi seçin.')
      return
    }
    setRunning(true)
    try {
      const res = await gibYardimciIs('otomasyon-calistir', await buildHelperPayload())
      if (res?.ok) {
        setMessage(`Otomasyon başlatıldı: ${selectedClientIds.length} müşteri × ${(settings?.enabled_types || []).length} sorgu. Sonuçlar aşağıdaki tabloya düşecek (her sorgu 1-2 dk sürebilir).`)
        setTimeout(load, 5000)
        setTimeout(load, 20000)
      } else {
        setMessage('Yardımcı programa ulaşılamadı: ' + (res?.reason || 'bilinmeyen') + '. Yardımcı programın açık olduğundan emin olun.')
      }
    } catch (e) {
      setMessage('Başlatma hatası: ' + e.message)
    }
    setRunning(false)
  }

  const toggleClient = (id) => {
    setSelectedClientIds(current =>
      current.includes(id) ? current.filter(c => c !== id) : [...current, id]
    )
  }

  const filteredClients = (clients || [])
    .filter(c => !clientSearch || (c.name || '').toLowerCase().includes(clientSearch.toLowerCase()))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'tr'))

  const toggleType = (type) => {
    const current = settings?.enabled_types || []
    const next = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type]
    setSettings({ ...settings, enabled_types: next })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-yellow-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="bg-blue-600/20 p-3 rounded-xl">
          <Rocket className="w-7 h-7 text-yellow-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Otomasyon Merkezi</h1>
          <p className="text-gray-400 text-sm">Vergi, SGK ve tebligat sorgularını belirlenen zamanda otomatik çalıştır</p>
        </div>
      </div>

      {message && (
        <div className="bg-blue-900/40 border border-blue-700/40 rounded-xl p-4 text-blue-100 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
          {message}
        </div>
      )}

      <div className={`rounded-xl px-4 py-3 text-sm border ${
        helperStatus
          ? 'bg-emerald-900/20 border-emerald-700/40 text-emerald-200'
          : 'bg-amber-900/20 border-amber-700/40 text-amber-200'
      }`}>
        {helperStatus
          ? `MUBİS Yardımcı bağlı. Zamanlayıcı ${helperStatus.plan?.active === false ? 'kapalı' : 'aktif'}.`
          : 'MUBİS Yardımcı bağlı değil. Zamanlanmış sorgular için yardımcı program açık olmalıdır.'}
      </div>

      {/* Durum kartlari */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-950/50 border border-blue-800/30 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div className="text-gray-400 text-sm">Toplam Müşteri</div>
            <Users className="w-5 h-5 text-blue-400" />
          </div>
          <div className="text-3xl font-bold text-white mt-2">{stats.totalClients}</div>
        </div>
        <div className="bg-blue-950/50 border border-blue-800/30 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div className="text-gray-400 text-sm">Aktif Görev</div>
            <Activity className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="text-3xl font-bold text-white mt-2">{stats.activeJobs}</div>
        </div>
        <div className="bg-blue-950/50 border border-blue-800/30 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div className="text-gray-400 text-sm">Bugün İndirilen</div>
            <FileArchive className="w-5 h-5 text-yellow-400" />
          </div>
          <div className="text-3xl font-bold text-white mt-2">{stats.todayDocuments}</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Zamanlama ayarlari */}
        <div className="lg:col-span-2 bg-blue-950/40 border border-blue-800/30 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-yellow-400" /> Zamanlama ve Türler
          </h2>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div>
              <label className="block text-gray-400 text-sm mb-2">Çalışma Saati</label>
              <div className="flex items-center gap-2 bg-blue-900/30 border border-blue-700/40 rounded-lg px-3 py-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <input
                  type="time"
                  value={settings?.schedule_time || '02:00'}
                  onChange={(e) => setSettings({ ...settings, schedule_time: e.target.value })}
                  className="bg-transparent text-white text-sm focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-2">Tekrar</label>
              <select
                value={settings?.repeat_type || 'daily'}
                onChange={(e) => setSettings({ ...settings, repeat_type: e.target.value })}
                className="w-full bg-blue-900/30 border border-blue-700/40 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
              >
                {REPEAT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {settings?.repeat_type === 'weekly' && (
              <div>
                <label className="block text-gray-400 text-sm mb-2">Çalışma Günü</label>
                <select
                  value={scheduleWeekday}
                  onChange={(e) => setScheduleWeekday(Number(e.target.value))}
                  className="w-full bg-blue-900/30 border border-blue-700/40 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
                >
                  {WEEK_DAYS.map(day => (
                    <option key={day.value} value={day.value}>{day.label}</option>
                  ))}
                </select>
              </div>
            )}
            {settings?.repeat_type === 'monthly' && (
              <div>
                <label className="block text-gray-400 text-sm mb-2">Ayın Günü</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={scheduleMonthday}
                  onChange={(e) => setScheduleMonthday(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
                  className="w-full bg-blue-900/30 border border-blue-700/40 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
                />
              </div>
            )}
            <label className="flex items-center gap-3 bg-blue-900/20 border border-blue-700/30 rounded-lg px-4 py-2 text-sm text-white self-end">
              <input
                type="checkbox"
                checked={automationActive}
                onChange={(e) => setAutomationActive(e.target.checked)}
                className="accent-emerald-500"
              />
              Zamanlama aktif
            </label>
          </div>

          <div className="mb-6">
            <label className="block text-gray-400 text-sm mb-2">Onaylanan Otomatik Sorgular</label>
            <div className="flex flex-wrap gap-3">
              {TYPE_OPTIONS.map(t => {
                const active = (settings?.enabled_types || []).includes(t.value)
                return (
                  <button
                    key={t.value}
                    onClick={() => toggleType(t.value)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      active
                        ? 'bg-blue-600/30 border-blue-500/60 text-white'
                        : 'bg-blue-900/20 border-blue-700/30 text-gray-400 hover:text-white'
                    }`}
                  >
                    <CheckCircle2 className={`w-4 h-4 ${active ? t.color : 'text-gray-500'}`} />
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Musteri secimi */}
          <div className="mb-2">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-gray-400 text-sm">Sorgulanacak Müşteriler</label>
              <span className="text-xs text-blue-300">{selectedClientIds.length} / {(clients || []).length} seçili</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <input
                type="text"
                placeholder="Müşteri ara..."
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                className="flex-1 min-w-[180px] bg-blue-900/30 border border-blue-700/40 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
              />
              <button
                onClick={() => setSelectedClientIds((clients || []).map(c => c.id))}
                className="text-xs text-blue-300 hover:text-white border border-blue-700/40 rounded-lg px-3 py-2"
              >
                Tümünü Seç
              </button>
              <button
                onClick={() => setSelectedClientIds([])}
                className="text-xs text-gray-400 hover:text-white border border-blue-700/40 rounded-lg px-3 py-2"
              >
                Temizle
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
              {filteredClients.length === 0 && (
                <div className="text-gray-500 text-sm py-4 text-center">Müşteri bulunamadı.</div>
              )}
              {filteredClients.map(c => (
                <label
                  key={c.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-blue-900/20 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedClientIds.includes(c.id)}
                    onChange={() => toggleClient(c.id)}
                    className="accent-emerald-500 w-4 h-4"
                  />
                  <span className="text-sm text-gray-200">{c.name}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Yalnızca seçili müşteriler sorgulanır. Her müşterinin kartındaki kurum erişim bilgileri (Dijital Vergi Dairesi / SGK / e-Devlet) kullanılır.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Ayarları Kaydet
            </button>
            <button
              onClick={handleRun}
              disabled={running}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Şimdi Çalıştır
            </button>
          </div>
        </div>

        {/* Robot durumlari */}
        <div className="bg-blue-950/40 border border-blue-800/30 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Robotlar</h2>
          <div className="space-y-3">
            {TYPE_OPTIONS.map(t => {
              const active = (settings?.enabled_types || []).includes(t.value)
              return (
                <div key={t.value} className="flex items-center justify-between bg-blue-900/20 rounded-xl px-4 py-3">
                  <span className="text-white text-sm">{t.label}</span>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {active ? 'Aktif' : 'Pasif'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Yerel sonuclar */}
      <div className="bg-blue-950/40 border border-blue-800/30 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Yardımcı Program Sonuçları</h2>
          <button onClick={load} className="text-blue-300 hover:text-white text-sm flex items-center gap-1">
            <RotateCw className="w-3.5 h-3.5" /> Yenile
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-blue-800/30">
                <th className="text-left py-3 px-3 font-medium">Müşteri</th>
                <th className="text-left py-3 px-3 font-medium">Sorgu</th>
                <th className="text-left py-3 px-3 font-medium">Durum</th>
                <th className="text-left py-3 px-3 font-medium">Özet</th>
                <th className="text-left py-3 px-3 font-medium">Tarih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-800/20">
              {(helperStatus?.results || []).length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-500">Yardımcı programdan henüz sonuç gelmedi.</td>
                </tr>
              )}
              {(helperStatus?.results || []).map(r => {
                const tur = TYPE_OPTIONS.find(t => t.value === r.type)
                return (
                  <tr key={r.id} className="hover:bg-blue-900/10">
                    <td className="py-3 px-3 text-gray-200">{r.client_name}</td>
                    <td className="py-3 px-3 text-gray-200">{tur?.label || r.type}</td>
                    <td className="py-3 px-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        r.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300' :
                        r.status === 'running' ? 'bg-blue-500/20 text-blue-300' :
                        'bg-red-500/20 text-red-300'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-gray-400 text-xs max-w-xs truncate">
                      {r.error || (r.result?.text || r.result?.message || (r.result?.rows?.length ? `${r.result.rows.length} satır` : 'Sonuç alındı'))}
                    </td>
                    <td className="py-3 px-3 text-gray-400 text-xs">
                      {r.completed_at ? new Date(r.completed_at).toLocaleString('tr-TR') : new Date(r.started_at).toLocaleString('tr-TR')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Son joblar */}
      <div className="bg-blue-950/40 border border-blue-800/30 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Son Görevler (Bulut)</h2>
          <button onClick={load} className="text-blue-300 hover:text-white text-sm flex items-center gap-1">
            <RotateCw className="w-3.5 h-3.5" /> Yenile
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-blue-800/30">
                <th className="text-left py-3 px-3 font-medium">Müşteri</th>
                <th className="text-left py-3 px-3 font-medium">Tür</th>
                <th className="text-left py-3 px-3 font-medium">Durum</th>
                <th className="text-left py-3 px-3 font-medium">Belgeler</th>
                <th className="text-left py-3 px-3 font-medium">Tarih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-800/20">
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-500">Henüz görev çalıştırılmamış.</td>
                </tr>
              )}
              {jobs.map(job => (
                <tr key={job.id} className="hover:bg-blue-900/10">
                  <td className="py-3 px-3 text-gray-200">{job.clients?.name || `#${job.client_id}`}</td>
                  <td className="py-3 px-3 text-gray-200">{job.job_type?.toUpperCase()}</td>
                  <td className="py-3 px-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      job.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300' :
                      job.status === 'running' ? 'bg-blue-500/20 text-blue-300' :
                      job.status === 'failed' ? 'bg-red-500/20 text-red-300' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-gray-300">{job.documents_downloaded} / {job.documents_found}</td>
                  <td className="py-3 px-3 text-gray-400">{new Date(job.created_at).toLocaleString('tr-TR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
