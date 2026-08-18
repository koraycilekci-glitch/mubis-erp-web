import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  Rocket, FileArchive, Users, Activity, Calendar, Clock,
  Play, Pause, RotateCw, AlertTriangle, CheckCircle2, Loader2
} from 'lucide-react'
import {
  getAutomationSettings,
  saveAutomationSettings,
  getAutomationJobs,
  triggerAutomation,
  getAutomationStats
} from '../services/automationService'

const REPEAT_OPTIONS = [
  { value: 'daily', label: 'Günlük' },
  { value: 'weekly', label: 'Haftalık' },
  { value: 'monthly', label: 'Aylık' }
]

const TYPE_OPTIONS = [
  { value: 'etebligat', label: 'e-Tebligat', color: 'text-emerald-400' },
  { value: 'sgk', label: 'SGK e-Bildirge', color: 'text-blue-400' }
]

export default function OtomasyonMerkezi() {
  const { user } = useAuth()
  const [settings, setSettings] = useState(null)
  const [jobs, setJobs] = useState([])
  const [stats, setStats] = useState({ totalClients: 0, activeJobs: 0, todayDocuments: 0 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState('')

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
      setMessage('Ayarlar kaydedildi.')
    } catch (e) {
      setMessage('Kaydetme hatası: ' + e.message)
    }
    setSaving(false)
  }

  const handleRun = async () => {
    setRunning(true)
    try {
      await triggerAutomation({ types: settings?.enabled_types || ['etebligat', 'sgk'] })
      setMessage('Otomasyon başlatıldı. Job listesi kısa süre sonra güncellenecek.')
      setTimeout(load, 3000)
    } catch (e) {
      setMessage('Başlatma hatası: ' + e.message)
    }
    setRunning(false)
  }

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
          <p className="text-gray-400 text-sm">e-Tebligat ve SGK belgelerini otomatik topla</p>
        </div>
      </div>

      {message && (
        <div className="bg-blue-900/40 border border-blue-700/40 rounded-xl p-4 text-blue-100 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
          {message}
        </div>
      )}

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

          <div className="grid md:grid-cols-2 gap-4 mb-6">
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
          </div>

          <div className="mb-6">
            <label className="block text-gray-400 text-sm mb-2">İndirilecek Belgeler</label>
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

      {/* Son joblar */}
      <div className="bg-blue-950/40 border border-blue-800/30 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Son Görevler</h2>
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
