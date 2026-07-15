import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import { ArrowLeft, ListChecks, CheckCircle, XCircle } from 'lucide-react'

export default function ClientBeyanProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { updateClient } = useAuth()
  const { clients } = useClients()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [client, setClient] = useState(null)
  const [beyanProfile, setBeyanProfile] = useState({})

  const months = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
  ]

  // Temel beyan tipleri
  const temelBeyanTipleri = [
    { id: 'kdv', label: 'KDV', icon: '📄' },
    { id: 'kdv2', label: 'KDV2', icon: '📄' },
    { id: 'muhtasar', label: 'Muhtasar', icon: '📄' },
    { id: 'sgk', label: 'SGK', icon: '🏥' },
    { id: 'gecici_vergi', label: 'Geçici Vergi', icon: '📊' },
  ]

  const getBeyanTipleri = useCallback((clientData) => {
    const tipler = [...temelBeyanTipleri]
    if (clientData?.type === 'company') {
      tipler.push({ id: 'kurumlar_vergi', label: 'Kurumlar Vergisi', icon: '🏢' })
    } else if (clientData?.type === 'individual') {
      tipler.push({ id: 'gelir_vergi', label: 'Gelir Vergisi', icon: '👤' })
    }
    if (clientData?.edefter === true) {
      tipler.push({ id: 'edefter', label: 'e-Defter', icon: '📓' })
    }
    return tipler
  }, [])

  const generateDefaultProfile = useCallback((clientData) => {
    const profile = {}
    const beyanTipleri = getBeyanTipleri(clientData)
    
    beyanTipleri.forEach(beyan => {
      profile[beyan.id] = {}
      
      if (beyan.id === 'gecici_vergi') {
        for (let month = 0; month < 12; month++) {
          if ([2, 5, 8, 11].includes(month)) {
            profile[beyan.id][month] = { period: '3aylik', active: true }
          } else {
            profile[beyan.id][month] = { period: 'yok', active: false }
          }
        }
      } else if (beyan.id === 'kurumlar_vergi') {
        for (let month = 0; month < 12; month++) {
          if (month === 3) {
            profile[beyan.id][month] = { period: 'yillik', active: true }
          } else {
            profile[beyan.id][month] = { period: 'yok', active: false }
          }
        }
      } else if (beyan.id === 'gelir_vergi') {
        for (let month = 0; month < 12; month++) {
          if (month === 2) {
            profile[beyan.id][month] = { period: 'yillik', active: true }
          } else {
            profile[beyan.id][month] = { period: 'yok', active: false }
          }
        }
      } else if (beyan.id === 'edefter') {
        const period = clientData?.edefterPeriod || 'aylik'
        for (let month = 0; month < 12; month++) {
          if (period === '3aylik' && ![2, 5, 8, 11].includes(month)) {
            profile[beyan.id][month] = { period: 'yok', active: false }
          } else {
            profile[beyan.id][month] = { period: period, active: true }
          }
        }
      } else {
        for (let month = 0; month < 12; month++) {
          profile[beyan.id][month] = { period: 'aylik', active: true }
        }
      }
    })
    return profile
  }, [getBeyanTipleri])

  useEffect(() => {
    const found = clients.find(c => c.id === parseInt(id))
    if (found) {
      setClient(found)
      const profile = found.beyanProfile || generateDefaultProfile(found)
      setBeyanProfile(profile)
    }
    setLoading(false)
  }, [id, clients, generateDefaultProfile])

  // ✅ Aktif/Pasif değiştirme fonksiyonu
  const toggleActive = (beyanId, month) => {
    setBeyanProfile(prev => {
      const newProfile = { ...prev }
      // Beyan yoksa oluştur
      if (!newProfile[beyanId]) {
        newProfile[beyanId] = {}
      }
      // Mevcut durumu al, yoksa varsayılan oluştur
      const current = newProfile[beyanId][month] || { period: 'aylik', active: true }
      // Aktif/Pasif değiştir
      newProfile[beyanId][month] = {
        ...current,
        active: !current.active
      }
      return newProfile
    })
  }

  // ✅ Periyot değiştirme fonksiyonu
  const handlePeriodChange = (beyanId, month, period) => {
    setBeyanProfile(prev => {
      const newProfile = { ...prev }
      if (!newProfile[beyanId]) {
        newProfile[beyanId] = {}
      }
      newProfile[beyanId][month] = {
        ...newProfile[beyanId][month],
        period: period,
        active: period !== 'yok'
      }
      return newProfile
    })
  }

  const handleSave = async () => {
    setSaving(true)
    const updatedClient = { ...client, beyanProfile: beyanProfile }
    const result = await updateClient(parseInt(id), updatedClient)
    setSaving(false)
    if (result.success) {
      alert('✅ Beyan profili başarıyla kaydedildi!')
      navigate('/admin')
    } else {
      alert('❌ Kaydetme sırasında hata oluştu!')
    }
  }

  const getPeriodColor = (period) => {
    const colors = {
      'aylik': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      '3aylik': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      'yillik': 'bg-green-500/20 text-green-400 border-green-500/30',
      'yok': 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    }
    return colors[period] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }

  const getPeriodOptions = (beyanId) => {
    const options = [
      { value: 'aylik', label: 'Aylık' },
      { value: 'yok', label: 'Yok' }
    ]
    if (beyanId === 'muhtasar' || beyanId === 'gecici_vergi' || beyanId === 'edefter') {
      options.push({ value: '3aylik', label: '3 Aylık' })
    }
    if (beyanId === 'kurumlar_vergi' || beyanId === 'gelir_vergi') {
      options.push({ value: 'yillik', label: 'Yıllık' })
    }
    return options
  }

  const getBeyanSummary = (beyanId) => {
    const data = beyanProfile[beyanId] || {}
    let activeCount = 0
    for (let month = 0; month < 12; month++) {
      if (data[month]?.active) activeCount++
    }
    return { total: 12, active: activeCount }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400"></div>
      </div>
    )
  }

  if (!client) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-white">Müşteri bulunamadı</h2>
          <button onClick={() => navigate('/admin')} className="bg-blue-600 text-white px-4 py-2 rounded-lg mt-4">
            Geri Dön
          </button>
        </div>
      </div>
    )
  }

  const beyanTipleri = getBeyanTipleri(client)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate('/admin')} className="text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center space-x-3">
              <ListChecks className="w-8 h-8 text-yellow-400" />
              <span>Beyan Profili</span>
            </h1>
            <p className="text-gray-400 text-sm">
              {client.name} - {client.type === 'company' ? `🏢 Şirket · VKN: ${client.vkn}` : `👤 Bireysel · TC: ${client.tc}`}
            </p>
            {client.edefter && (
              <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full ml-2">
                📓 e-Defter ({client.edefterPeriod === 'aylik' ? 'Aylık' : '3 Aylık'})
              </span>
            )}
          </div>
        </div>
        <button 
          onClick={handleSave} 
          disabled={saving}
          className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-6 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-yellow-500/30 transition-all duration-300 disabled:opacity-50"
        >
          {saving ? 'Kaydediliyor...' : 'Profili Kaydet'}
        </button>
      </div>

      {/* Beyan Tablosu */}
      <div className="bg-blue-800/20 rounded-2xl border border-blue-700/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-blue-900/30">
              <tr>
                <th className="px-4 py-3 text-left text-gray-400 text-sm font-medium min-w-[120px]">Beyan Türü</th>
                {months.map((month, i) => (
                  <th key={i} className="px-2 py-3 text-center text-gray-400 text-xs font-medium">{month.substring(0, 3)}</th>
                ))}
                <th className="px-4 py-3 text-center text-gray-400 text-xs font-medium min-w-[80px]">Özet</th>
              </tr>
            </thead>
            <tbody>
              {beyanTipleri.map((beyan) => {
                const summary = getBeyanSummary(beyan.id)
                return (
                  <tr key={beyan.id} className="border-t border-blue-700/30 hover:bg-blue-800/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        <span className="text-lg">{beyan.icon}</span>
                        <span className="text-white text-sm font-medium">{beyan.label}</span>
                        {beyan.id === 'edefter' && (
                          <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
                            {client?.edefterPeriod === 'aylik' ? 'Aylık' : '3 Aylık'}
                          </span>
                        )}
                      </div>
                    </td>
                    {months.map((_, monthIndex) => {
                      const data = beyanProfile[beyan.id]?.[monthIndex]
                      const period = data?.period || 'aylik'
                      const active = data?.active ?? true
                      
                      return (
                        <td key={monthIndex} className="px-2 py-2 text-center">
                          <div className="flex items-center justify-center space-x-1">
                            <select
                              value={period}
                              onChange={(e) => handlePeriodChange(beyan.id, monthIndex, e.target.value)}
                              className={`text-xs rounded-lg px-1.5 py-1 border ${getPeriodColor(period)} focus:outline-none focus:border-yellow-400 transition-colors w-full max-w-[70px]`}
                            >
                              {getPeriodOptions(beyan.id).map(opt => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label.substring(0, 4)}
                                </option>
                              ))}
                            </select>
                            {/* ✅ Aktif/Pasif Butonu */}
                            <button
                              onClick={() => toggleActive(beyan.id, monthIndex)}
                              className={`w-5 h-5 rounded-full transition-all flex items-center justify-center ${
                                active 
                                  ? 'bg-green-500 hover:bg-green-400 text-white' 
                                  : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
                              }`}
                              title={active ? 'Pasif Yap' : 'Aktif Yap'}
                            >
                              {active ? (
                                <CheckCircle className="w-3 h-3" />
                              ) : (
                                <XCircle className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </td>
                      )
                    })}
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center">
                        <span className={`text-xs font-medium ${
                          summary.active === summary.total ? 'text-green-400' :
                          summary.active > 0 ? 'text-yellow-400' : 'text-gray-500'
                        }`}>
                          {summary.active}/{summary.total}
                        </span>
                        <div className="w-full h-1 bg-blue-900/50 rounded-full overflow-hidden max-w-[40px]">
                          <div 
                            className={`h-full rounded-full ${
                              summary.active === summary.total ? 'bg-green-400' :
                              summary.active > 0 ? 'bg-yellow-400' : 'bg-gray-500'
                            }`}
                            style={{ width: `${(summary.active / summary.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lejant */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="flex items-center space-x-2 p-3 bg-blue-800/20 rounded-lg border border-blue-700/30">
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <span className="text-gray-300 text-xs">Aktif</span>
        </div>
        <div className="flex items-center space-x-2 p-3 bg-blue-800/20 rounded-lg border border-blue-700/30">
          <div className="w-3 h-3 rounded-full bg-gray-500"></div>
          <span className="text-gray-300 text-xs">Pasif</span>
        </div>
        <div className="flex items-center space-x-2 p-3 bg-blue-800/20 rounded-lg border border-blue-700/30">
          <span className="text-gray-300 text-xs">📌 Yeşil buton <span className="text-green-400">Aktif</span> / Gri buton <span className="text-gray-400">Pasif</span></span>
        </div>
        <div className="flex items-center space-x-2 p-3 bg-blue-800/20 rounded-lg border border-blue-700/30">
          <span className="text-gray-300 text-xs">🔄 Tıkla değiştir</span>
        </div>
      </div>

      {/* Kısayol Butonları */}
      <div className="mt-6 flex flex-wrap gap-3">
        <button 
          onClick={() => {
            const newProfile = generateDefaultProfile(client)
            setBeyanProfile(newProfile)
          }}
          className="bg-blue-500/20 text-blue-400 px-4 py-2 rounded-lg text-sm hover:bg-blue-500/30 transition-colors"
        >
          Varsayılan Profil
        </button>
        <button 
          onClick={() => {
            if (window.confirm('Tüm beyanları aktifleştirmek istediğinize emin misiniz?')) {
              const newProfile = {}
              beyanTipleri.forEach(beyan => {
                newProfile[beyan.id] = {}
                for (let month = 0; month < 12; month++) {
                  let period = 'aylik'
                  let active = true
                  if (beyan.id === 'edefter') {
                    period = client?.edefterPeriod || 'aylik'
                    if (period === '3aylik' && ![2, 5, 8, 11].includes(month)) {
                      period = 'yok'
                      active = false
                    }
                  }
                  newProfile[beyan.id][month] = { period, active }
                }
              })
              setBeyanProfile(newProfile)
            }
          }}
          className="bg-green-500/20 text-green-400 px-4 py-2 rounded-lg text-sm hover:bg-green-500/30 transition-colors"
        >
          Tümünü Aktifleştir
        </button>
        <button 
          onClick={() => {
            if (window.confirm('Tüm beyanları pasifleştirmek istediğinize emin misiniz?')) {
              const newProfile = {}
              beyanTipleri.forEach(beyan => {
                newProfile[beyan.id] = {}
                for (let month = 0; month < 12; month++) {
                  newProfile[beyan.id][month] = { 
                    period: 'yok', 
                    active: false 
                  }
                }
              })
              setBeyanProfile(newProfile)
            }
          }}
          className="bg-red-500/20 text-red-400 px-4 py-2 rounded-lg text-sm hover:bg-red-500/30 transition-colors"
        >
          Tümünü Pasifleştir
        </button>
      </div>
    </div>
  )
}