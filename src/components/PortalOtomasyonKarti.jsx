import { useState, useEffect } from 'react'
import { Bot, Save, Clock, Calendar, FileText } from 'lucide-react'
import {
  getAutomationSettings,
  saveAutomationSettings
} from '../services/automationService'

const DOC_TYPES = [
  { key: 'etebligat', label: 'e-Tebligat' },
  { key: 'sgk_tahakkuk', label: 'SGK Tahakkuk Fişi' },
  { key: 'sgk_hizmet', label: 'SGK Hizmet Listesi' },
  { key: 'sgk_borc', label: 'SGK Borç Dökümü' }
]

const REPEAT_OPTIONS = [
  { value: 'daily', label: 'Günlük' },
  { value: 'weekly', label: 'Haftalık' },
  { value: 'monthly', label: 'Aylık' }
]

export default function PortalOtomasyonKarti({ client }) {
  const [enabled, setEnabled] = useState(false)
  const [docTypes, setDocTypes] = useState(['etebligat'])
  const [scheduleTime, setScheduleTime] = useState('02:00')
  const [repeat, setRepeat] = useState('daily')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!client?.id) return
    const load = async () => {
      try {
        const settings = await getAutomationSettings()
        // Musteri bazli ayarlar localStorage / ayri bir kaynaktan okunabilir;
        // su anlik global ayarlari kullaniyoruz.
        setEnabled(settings?.enabled || false)
        setDocTypes(settings?.doc_types || ['etebligat'])
        setScheduleTime(settings?.schedule_time || '02:00')
        setRepeat(settings?.repeat_type || 'daily')
      } catch (e) {
        console.error(e)
      }
    }
    load()
  }, [client?.id])

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveAutomationSettings({
        enabled,
        doc_types: docTypes,
        schedule_time: scheduleTime,
        repeat_type: repeat
      })
      setMessage('Otomasyon ayarları kaydedildi.')
    } catch (e) {
      setMessage('Hata: ' + e.message)
    }
    setSaving(false)
  }

  const toggleDoc = (key) => {
    setDocTypes(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  return (
    <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <Bot className="w-5 h-5 text-yellow-400" /> Otomatik Belge Toplama
      </h3>

      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEnabled(!enabled)}
            className={`relative w-12 h-6 rounded-full transition-colors ${enabled ? 'bg-emerald-500' : 'bg-gray-600'}`}
          >
            <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${enabled ? 'translate-x-6' : ''}`} />
          </button>
          <span className="text-white text-sm">{enabled ? 'Aktif' : 'Pasif'}</span>
        </div>
        <span className="text-gray-400 text-xs">Vergi Dairesi ve SGK portallarından otomatik indirme</span>
      </div>

      <div className="space-y-5">
        {enabled && (
          <>
            <div>
              <label className="block text-gray-400 text-sm mb-2">İndirilecek Belgeler</label>
              <div className="flex flex-wrap gap-2">
                {DOC_TYPES.map(t => (
                  <button
                    key={t.key}
                    onClick={() => toggleDoc(t.key)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                      docTypes.includes(t.key)
                        ? 'bg-blue-600/30 border-blue-500/60 text-white'
                        : 'bg-blue-900/20 border-blue-700/30 text-gray-400 hover:text-white'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" /> {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-400 text-sm mb-1">Çalışma Saati</label>
                <div className="flex items-center gap-2 bg-blue-900/30 border border-blue-700/40 rounded-lg px-3 py-2">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="bg-transparent text-white text-sm focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-1">Tekrar</label>
                <div className="flex items-center gap-2 bg-blue-900/30 border border-blue-700/40 rounded-lg px-3 py-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <select
                    value={repeat}
                    onChange={(e) => setRepeat(e.target.value)}
                    className="bg-transparent text-white text-sm focus:outline-none"
                  >
                    {REPEAT_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {message && (
        <div className="mt-4 text-emerald-300 text-sm">{message}</div>
      )}

      <div className="mt-5">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          {saving ? <Clock className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Kaydet
        </button>
      </div>
    </div>
  )
}
