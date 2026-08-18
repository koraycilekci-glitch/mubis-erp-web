import { useState, useEffect } from 'react'
import { Bot, Save, CheckCircle2, Clock, Calendar, FileText } from 'lucide-react'
import {
  getClientPortalCredentials,
  saveClientPortalCredentials,
  getAutomationSettings
} from '../services/automationService'
import { encryptPortalValue } from '../utils/crypto'

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
  const [creds, setCreds] = useState({
    dvs_u: '', dvs_p: '',
    sgk_u: '', sgk_isyeri_kodu: '', sgk_sistem_s: '', sgk_isyeri_s: ''
  })
  const [docTypes, setDocTypes] = useState(['etebligat'])
  const [scheduleTime, setScheduleTime] = useState('02:00')
  const [repeat, setRepeat] = useState('daily')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!client?.id) return
    const load = async () => {
      try {
        const [c, settings] = await Promise.all([
          getClientPortalCredentials(client.id),
          getAutomationSettings()
        ])
        setCreds({
          dvs_u: c?.dvs?.u || client?.dvsUsername || '',
          dvs_p: c?.dvs?.p || client?.dvsPassword || '',
          sgk_u: c?.sgk?.u || '',
          sgk_isyeri_kodu: c?.sgk?.isyeri_kodu || client?.sgkIsyeriKodu || '',
          sgk_sistem_s: c?.sgk?.sistem_s || client?.sgkSistemSifre || '',
          sgk_isyeri_s: c?.sgk?.isyeri_s || client?.sgkIsyeriSifre || ''
        })
        const meta = c?._meta || {}
        setEnabled(meta.enabled || false)
        setDocTypes(meta.doc_types || ['etebligat'])
        setScheduleTime(meta.schedule_time || settings?.schedule_time || '02:00')
        setRepeat(meta.repeat || settings?.repeat_type || 'daily')
      } catch (e) {
        console.error(e)
      }
    }
    load()
  }, [client?.id])

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        dvs: {
          u: creds.dvs_u,
          p: creds.dvs_p ? await encryptPortalValue(creds.dvs_p) : ''
        },
        sgk: {
          u: creds.sgk_u,
          isyeri_kodu: creds.sgk_isyeri_kodu,
          sistem_s: creds.sgk_sistem_s ? await encryptPortalValue(creds.sgk_sistem_s) : '',
          isyeri_s: creds.sgk_isyeri_s ? await encryptPortalValue(creds.sgk_isyeri_s) : ''
        },
        _meta: {
          enabled,
          doc_types: docTypes,
          schedule_time: scheduleTime,
          repeat
        }
      }
      await saveClientPortalCredentials(client.id, payload)
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

      {enabled && (
        <div className="space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/20">
              <div className="text-white font-medium text-sm mb-3 flex items-center gap-2">
                <span>🏛️</span> Dijital Vergi Dairesi
              </div>
              <div className="space-y-2">
                <input
                  type="text"
                  value={creds.dvs_u}
                  onChange={(e) => setCreds({ ...creds, dvs_u: e.target.value })}
                  placeholder="Kullanıcı Adı / VKN"
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                />
                <input
                  type="password"
                  value={creds.dvs_p}
                  onChange={(e) => setCreds({ ...creds, dvs_p: e.target.value })}
                  placeholder="Şifre"
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                />
              </div>
            </div>

            <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/20">
              <div className="text-white font-medium text-sm mb-3 flex items-center gap-2">
                <span>🏥</span> SGK / e-Bildirge
              </div>
              <div className="space-y-2">
                <input
                  type="text"
                  value={creds.sgk_u}
                  onChange={(e) => setCreds({ ...creds, sgk_u: e.target.value })}
                  placeholder="Kullanıcı Adı"
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                />
                <input
                  type="text"
                  value={creds.sgk_isyeri_kodu}
                  onChange={(e) => setCreds({ ...creds, sgk_isyeri_kodu: e.target.value })}
                  placeholder="İşyeri Kodu"
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                />
                <input
                  type="password"
                  value={creds.sgk_sistem_s}
                  onChange={(e) => setCreds({ ...creds, sgk_sistem_s: e.target.value })}
                  placeholder="Sistem Şifresi"
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                />
                <input
                  type="password"
                  value={creds.sgk_isyeri_s}
                  onChange={(e) => setCreds({ ...creds, sgk_isyeri_s: e.target.value })}
                  placeholder="İşyeri Şifresi"
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                />
              </div>
            </div>
          </div>

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
        </div>
      )}

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
