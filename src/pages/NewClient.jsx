import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ArrowLeft, Save, User, Building, MapPin, Calendar, FileText, X, Globe, Users, Newspaper, Eye, EyeOff, Plus, Home, Search } from 'lucide-react'
import { searchNace, formatNaceCode } from '../utils/naceCodes'
import { KIRA_STOPAJ_ORANI } from '../utils/kiraUtils'
import { formatTurkishInput, parseTurkishNumber } from '../utils/numberFormat'

export default function NewClient() {
  const navigate = useNavigate()
  const { addClient } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPasswords, setShowPasswords] = useState({})
  const [formData, setFormData] = useState({
    type: 'company',
    name: '',
    company: '',
    vkn: '',
    tc: '',
    email: '',
    phone: '',
    whatsapp: '',
    phoneNumbers: [{ name: '', phone: '', email: '', isWhatsapp: true }],
    emails: [{ email: '' }],
    taxOffice: '',
    city: '',
    address: '',
    openDate: '',
    closeDate: '',
    earsiv: false,
    efatura: false,
    esmm: false,
    edefter: false,
    edefterPeriod: 'aylik',
    serbestMeslek: false,
    eimzaStart: '',
    eimzaEnd: '',
    capital: '',
    companyType: 'ltd',
    taxType: 'Kurumlar Vergisi',
    musteriSinifi: '',
    faaliyetKodu: '',
    activityField: '',
    // Portal Hesapları - SGK 4 ALANLI
    portalSgk: false,
    sgkUsername: '',
    sgkWorkplaceCode: '',
    sgkWorkplacePassword: '',
    sgkSystemPassword: '',
    portalDvd: false,
    dvdUsername: '',
    dvdPassword: '',
    portalTicariSicil: false,
    tsgUsername: '',
    tsgPassword: '',
    // Kira bilgisi (isyeri kirasi - mal sahipleri)
    kiraBilgisi: {
      stopaj: '',
      kiraBaslangic: '',
      kiraBitis: '',
      isyeriSahipleri: []
    }
  })

  // NACE arama
  const [naceQuery, setNaceQuery] = useState('')
  const [naceResults, setNaceResults] = useState([])
  const [showNaceDropdown, setShowNaceDropdown] = useState(false)

  const handleNaceSearch = (value) => {
    setNaceQuery(value)
    if (value.length >= 2) {
      setNaceResults(searchNace(value))
      setShowNaceDropdown(true)
    } else {
      setNaceResults([])
      setShowNaceDropdown(false)
    }
  }

  const selectNace = (nace) => {
    setFormData(prev => ({ ...prev, faaliyetKodu: nace.code, activityField: nace.desc }))
    setNaceQuery(formatNaceCode(nace.code))
    setShowNaceDropdown(false)
  }

  // Kira / mal sahibi yardimcilari
  const setKiraField = (field, value) => {
    setFormData(prev => ({ ...prev, kiraBilgisi: { ...prev.kiraBilgisi, [field]: value } }))
  }

  const addMalSahibi = () => {
    setFormData(prev => ({
      ...prev,
      kiraBilgisi: {
        ...prev.kiraBilgisi,
        isyeriSahipleri: [...prev.kiraBilgisi.isyeriSahipleri, {
          tc: '', adSoyad: '', kiraTutarTipi: 'net', netKira: '', brutKira: '',
          kiraBaslangic: prev.kiraBilgisi.kiraBaslangic || '',
          kiraBitis: prev.kiraBilgisi.kiraBitis || '',
          stopaj: prev.kiraBilgisi.stopaj || ''
        }]
      }
    }))
  }

  const updateMalSahibi = (index, field, value) => {
    setFormData(prev => {
      const list = [...prev.kiraBilgisi.isyeriSahipleri]
      list[index] = { ...list[index], [field]: value }
      return { ...prev, kiraBilgisi: { ...prev.kiraBilgisi, isyeriSahipleri: list } }
    })
  }

  const updateMalSahibiTutar = (index, tip, value) => {
    setFormData(prev => {
      const list = [...prev.kiraBilgisi.isyeriSahipleri]
      // Yazarken ham degeri tut; format ve karsi taraf hesabi blur'da yapilir
      list[index] = { ...list[index], kiraTutarTipi: tip, [tip === 'brut' ? 'brutKira' : 'netKira']: value }
      return { ...prev, kiraBilgisi: { ...prev.kiraBilgisi, isyeriSahipleri: list } }
    })
  }

  const finalizeMalSahibiTutar = (index) => {
    setFormData(prev => {
      const list = [...prev.kiraBilgisi.isyeriSahipleri]
      const sahip = { ...list[index] }
      const tip = sahip.kiraTutarTipi === 'brut' ? 'brut' : 'net'
      const girilen = tip === 'brut' ? sahip.brutKira : sahip.netKira
      const stopajOrani = sahip.stopaj === 'var' ? KIRA_STOPAJ_ORANI : 0
      if (girilen === '' || girilen === null || girilen === undefined) {
        sahip.netKira = ''
        sahip.brutKira = ''
      } else {
        const numericValue = parseTurkishNumber(girilen)
        if (tip === 'net') {
          sahip.netKira = formatTurkishInput(girilen)
          sahip.brutKira = (numericValue / (1 - stopajOrani)).toFixed(2)
        } else {
          sahip.brutKira = formatTurkishInput(girilen)
          sahip.netKira = (numericValue * (1 - stopajOrani)).toFixed(2)
        }
      }
      list[index] = sahip
      return { ...prev, kiraBilgisi: { ...prev.kiraBilgisi, isyeriSahipleri: list } }
    })
  }

  const removeMalSahibi = (index) => {
    setFormData(prev => ({
      ...prev,
      kiraBilgisi: {
        ...prev.kiraBilgisi,
        isyeriSahipleri: prev.kiraBilgisi.isyeriSahipleri.filter((_, i) => i !== index)
      }
    }))
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    const newData = { ...formData, [name]: type === 'checkbox' ? checked : value }
    // Telefon yazilinca WhatsApp otomatik kopyalansin
    if (name === 'phone' && (!formData.whatsapp || formData.whatsapp === formData.phone)) {
      newData.whatsapp = value
    }
    setFormData(newData)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (formData.type === 'company' && !formData.vkn) {
      setError('VKN alanı zorunludur!')
      setLoading(false)
      return
    }
    if (formData.type === 'individual' && !formData.tc) {
      setError('TC Kimlik alanı zorunludur!')
      setLoading(false)
      return
    }

    try {
      const result = await addClient(formData)
      setLoading(false)

      if (result && result.success !== false) {
        alert('Müşteri başarıyla eklendi!')
        navigate('/admin')
      } else {
        setError(result?.error || 'Müşteri eklenirken bir hata oluştu')
      }
    } catch (err) {
      setLoading(false)
      setError(err.message || 'Müşteri eklenirken bir hata oluştu')
    }
  }

  const togglePassword = (field) => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }))
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center space-x-4 mb-8">
        <button 
          onClick={() => navigate('/admin')}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-white">Yeni Müşteri Ekle</h1>
          <p className="text-gray-400 mt-1">Müşteri bilgilerini girerek sisteme ekleyin</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 flex items-center space-x-3">
            <X className="w-5 h-5 text-red-400 flex-shrink-0" />
            <span className="text-red-300 text-sm">{error}</span>
          </div>
        )}

        {/* Müşteri Tipi */}
        <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30">
          <h3 className="text-lg font-semibold text-white mb-4">Müşteri Tipi</h3>
          <div className="flex space-x-4">
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, type: 'company', tc: '' }))}
              className={`flex-1 p-4 rounded-xl border-2 transition-all ${
                formData.type === 'company' 
                  ? 'border-yellow-400 bg-yellow-500/10' 
                  : 'border-blue-700/30 hover:border-blue-600'
              }`}
            >
              <Building className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
              <div className="text-white font-medium text-center">Şirket</div>
              <div className="text-gray-400 text-xs text-center">Limited / Anonim</div>
            </button>
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, type: 'individual', vkn: '' }))}
              className={`flex-1 p-4 rounded-xl border-2 transition-all ${
                formData.type === 'individual' 
                  ? 'border-yellow-400 bg-yellow-500/10' 
                  : 'border-blue-700/30 hover:border-blue-600'
              }`}
            >
              <User className="w-8 h-8 text-blue-400 mx-auto mb-2" />
              <div className="text-white font-medium text-center">Bireysel</div>
              <div className="text-gray-400 text-xs text-center">Şahıs / Serbest</div>
            </button>
          </div>
        </div>

        {/* Kişisel / İletisim Bilgiler */}
        <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
            <User className="w-5 h-5 text-yellow-400" />
            <span>{formData.type === 'company' ? 'Iletisim Bilgileri' : 'Kisisel Bilgiler'}</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {formData.type === 'individual' && (
              <div>
                <label className="text-gray-400 text-sm block mb-1">Ad Soyad *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
                  placeholder="Ahmet Yilmaz"
                />
              </div>
            )}
            <div>
              <label className="text-gray-400 text-sm block mb-1">Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
                placeholder="ornek@email.com"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">Telefon</label>
              <input
                type="text"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
                placeholder="05XX XXX XX XX"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">WhatsApp</label>
              <input
                type="text"
                name="whatsapp"
                value={formData.whatsapp}
                onChange={handleChange}
                className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
                placeholder="Telefondan otomatik gelir"
              />
              <p className="text-gray-500 text-xs mt-1">Telefon numarasi otomatik yansir, istege bagli degistirebilirsiniz</p>
            </div>

            {/* Birden Fazla Telefon / WhatsApp */}
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-2">
                <label className="text-gray-400 text-sm">Iletisim Numaralari</label>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({
                    ...prev,
                    phoneNumbers: [...prev.phoneNumbers, { name: '', phone: '', email: '', isWhatsapp: true }]
                  }))}
                  className="text-xs text-yellow-400 hover:text-yellow-300 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Yeni Ekle
                </button>
              </div>
              <div className="space-y-2">
                {formData.phoneNumbers.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Ad Soyad"
                      value={item.name}
                      onChange={(e) => {
                        const next = [...formData.phoneNumbers]
                        next[idx] = { ...next[idx], name: e.target.value }
                        setFormData(prev => ({ ...prev, phoneNumbers: next }))
                      }}
                      className="md:col-span-3 bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-400"
                    />
                    <input
                      type="text"
                      placeholder="Telefon"
                      value={item.phone}
                      onChange={(e) => {
                        const next = [...formData.phoneNumbers]
                        next[idx] = { ...next[idx], phone: e.target.value }
                        setFormData(prev => ({ ...prev, phoneNumbers: next }))
                      }}
                      className="md:col-span-3 bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-400"
                    />
                    <input
                      type="email"
                      placeholder="E-posta"
                      value={item.email || ''}
                      onChange={(e) => {
                        const next = [...formData.phoneNumbers]
                        next[idx] = { ...next[idx], email: e.target.value }
                        setFormData(prev => ({ ...prev, phoneNumbers: next }))
                      }}
                      className="md:col-span-4 bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-400"
                    />
                    <label className="md:col-span-1 flex items-center justify-center gap-1 text-xs text-gray-400 whitespace-nowrap cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.isWhatsapp}
                        onChange={(e) => {
                          const next = [...formData.phoneNumbers]
                          next[idx] = { ...next[idx], isWhatsapp: e.target.checked }
                          setFormData(prev => ({ ...prev, phoneNumbers: next }))
                        }}
                        className="rounded border-blue-700/50"
                      />
                      WhatsApp
                    </label>
                    
                    {formData.phoneNumbers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = formData.phoneNumbers.filter((_, i) => i !== idx)
                          setFormData(prev => ({ ...prev, phoneNumbers: next }))
                        }}
                        className="md:col-span-1 p-1.5 text-gray-500 hover:text-red-400 transition-colors flex justify-center"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Birden Fazla E-posta */}
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-2">
                <label className="text-gray-400 text-sm">E-posta Adresleri</label>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({
                    ...prev,
                    emails: [...prev.emails, { email: '' }]
                  }))}
                  className="text-xs text-yellow-400 hover:text-yellow-300 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Yeni Ekle
                </button>
              </div>
              <div className="space-y-2">
                {formData.emails.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input
                      type="email"
                      placeholder="ornek@email.com"
                      value={item.email}
                      onChange={(e) => {
                        const next = [...formData.emails]
                        next[idx] = { email: e.target.value }
                        setFormData(prev => ({ ...prev, emails: next }))
                      }}
                      className="flex-1 bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-400"
                    />
                    {formData.emails.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = formData.emails.filter((_, i) => i !== idx)
                          setFormData(prev => ({ ...prev, emails: next }))
                        }}
                        className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Adres Bilgileri */}
        <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
            <MapPin className="w-5 h-5 text-yellow-400" />
            <span>Adres Bilgileri</span>
          </h3>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="text-gray-400 text-sm block mb-1">Açık Adres</label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleChange}
                rows="3"
                className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors resize-none"
                placeholder="Mahalle, Sokak, No, Daire, İlçe, İl"
              />
              <p className="text-gray-500 text-xs mt-1">Adres bilgilerini detaylı girin</p>
            </div>
          </div>
        </div>

        {/* Şirket Bilgileri */}
        {formData.type === 'company' ? (
          <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
              <Building className="w-5 h-5 text-yellow-400" />
              <span>Sirket Bilgileri</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-sm block mb-1">Sirket Unvani *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
                  placeholder="ABC Ltd. Sti."
                />
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">VKN *</label>
                <input
                  type="text"
                  name="vkn"
                  value={formData.vkn}
                  onChange={handleChange}
                  required
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
                  placeholder="1234567890"
                />
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">Vergi Dairesi</label>
                <input
                  type="text"
                  name="taxOffice"
                  value={formData.taxOffice}
                  onChange={handleChange}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
                  placeholder="Vergi Dairesi"
                />
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">Sermaye</label>
                <input
                  type="text"
                  name="capital"
                  value={formData.capital}
                  onChange={handleChange}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
                  placeholder="100.000 TL"
                />
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">Şirket Türü</label>
                <select
                  name="companyType"
                  value={formData.companyType}
                  onChange={handleChange}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
                >
                  <option value="ltd">Limited Şirket (Ltd. Şti.)</option>
                  <option value="as">Anonim Şirket (A.Ş.)</option>
                </select>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
              <User className="w-5 h-5 text-blue-400" />
              <span>Bireysel Bilgiler</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-sm block mb-1">TC Kimlik *</label>
                <input
                  type="text"
                  name="tc"
                  value={formData.tc}
                  onChange={handleChange}
                  required
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
                  placeholder="12345678901"
                />
                <p className="text-gray-500 text-xs mt-1">11 haneli TC Kimlik numarasi</p>
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">Vergi Dairesi</label>
                <input
                  type="text"
                  name="taxOffice"
                  value={formData.taxOffice}
                  onChange={handleChange}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
                  placeholder="Vergi Dairesi"
                />
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">Musteri Sinifi</label>
                <select
                  name="musteriSinifi"
                  value={formData.musteriSinifi}
                  onChange={handleChange}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
                >
                  <option value="">Seciniz</option>
                  <option value="1. Sinif">1. Sinif (Bilanço Esasi)</option>
                  <option value="2. Sinif">2. Sinif (Isletme Hesabi)</option>
                  <option value="Serbest Meslek">Serbest Meslek Erbabi</option>
                  <option value="Basit Usul">Basit Usul</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Faaliyet Kodu (NACE) */}
        <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
            <Search className="w-5 h-5 text-yellow-400" />
            <span>Faaliyet Kodu (NACE)</span>
          </h3>
          <div className="grid grid-cols-1 gap-4">
            <div className="relative">
              <label className="text-gray-400 text-sm block mb-1">NACE Kodu / Faaliyet Ara</label>
              <input
                type="text"
                value={naceQuery}
                onChange={(e) => handleNaceSearch(e.target.value)}
                onFocus={() => naceQuery.length >= 2 && setShowNaceDropdown(true)}
                onBlur={() => setTimeout(() => setShowNaceDropdown(false), 200)}
                className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
                placeholder="Orn: 466415 veya elektrik malzemeleri"
              />
              {showNaceDropdown && naceResults.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-blue-900 border border-blue-700/60 rounded-lg shadow-2xl">
                  {naceResults.map(n => (
                    <button
                      key={n.code}
                      type="button"
                      onMouseDown={() => selectNace(n)}
                      className="w-full text-left px-4 py-2.5 hover:bg-blue-800/60 transition-colors"
                    >
                      <span className="text-yellow-400 font-mono text-sm mr-2">{formatNaceCode(n.code)}</span>
                      <span className="text-gray-200 text-sm">{n.desc}</span>
                    </button>
                  ))}
                </div>
              )}
              {showNaceDropdown && naceQuery.length >= 2 && naceResults.length === 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-blue-900 border border-yellow-500/40 rounded-lg px-4 py-3 text-sm text-yellow-300">
                  Bu kod sistemde kayitli degil. Kodu yazip aciklamayi asagiya elle girebilirsiniz.
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-sm block mb-1">Faaliyet Kodu</label>
                <input
                  type="text"
                  name="faaliyetKodu"
                  value={formData.faaliyetKodu}
                  onChange={handleChange}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
                  placeholder="466415"
                />
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">Faaliyet Aciklamasi</label>
                <input
                  type="text"
                  name="activityField"
                  value={formData.activityField}
                  onChange={handleChange}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
                  placeholder="Kod listede yoksa aciklamayi buraya yazin"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Isyeri Kirasi - Mal Sahipleri */}
        <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
              <Home className="w-5 h-5 text-yellow-400" />
              <span>Isyeri Kirasi - Mal Sahipleri</span>
            </h3>
            <button
              type="button"
              onClick={addMalSahibi}
              className="text-xs text-yellow-400 hover:text-yellow-300 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Mal Sahibi Ekle
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-gray-400 text-sm block mb-1">Kira Baslangic</label>
              <input
                type="date"
                value={formData.kiraBilgisi.kiraBaslangic}
                onChange={(e) => setKiraField('kiraBaslangic', e.target.value)}
                className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">Kira Bitis</label>
              <input
                type="date"
                value={formData.kiraBilgisi.kiraBitis}
                onChange={(e) => setKiraField('kiraBitis', e.target.value)}
                className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">Stopaj</label>
              <select
                value={formData.kiraBilgisi.stopaj}
                onChange={(e) => setKiraField('stopaj', e.target.value)}
                className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
              >
                <option value="">Seciniz</option>
                <option value="var">Var</option>
                <option value="yok">Yok</option>
              </select>
            </div>
          </div>

          {formData.kiraBilgisi.isyeriSahipleri.length === 0 ? (
            <p className="text-gray-500 text-sm">Kirali isyeri yoksa bos birakabilirsiniz. Mal sahibi eklemek icin yukaridaki butonu kullanin.</p>
          ) : (
            <div className="space-y-4">
              {formData.kiraBilgisi.isyeriSahipleri.map((sahip, idx) => (
                <div key={idx} className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-gray-300 text-sm font-medium">Mal Sahibi {idx + 1}</span>
                    <button type="button" onClick={() => removeMalSahibi(idx)} className="p-1.5 text-gray-500 hover:text-red-400 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-gray-500 text-xs block mb-1">TC Kimlik No</label>
                      <input
                        type="text"
                        value={sahip.tc}
                        onChange={(e) => updateMalSahibi(idx, 'tc', e.target.value)}
                        className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400"
                        placeholder="11 haneli TC"
                      />
                    </div>
                    <div>
                      <label className="text-gray-500 text-xs block mb-1">Ad Soyad</label>
                      <input
                        type="text"
                        value={sahip.adSoyad}
                        onChange={(e) => updateMalSahibi(idx, 'adSoyad', e.target.value)}
                        className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400"
                        placeholder="Mal sahibi adi"
                      />
                    </div>
                    <div>
                      <label className="text-gray-500 text-xs block mb-1">Stopaj</label>
                      <select
                        value={sahip.stopaj}
                        onChange={(e) => updateMalSahibi(idx, 'stopaj', e.target.value)}
                        className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400"
                      >
                        <option value="">Seciniz</option>
                        <option value="var">Var</option>
                        <option value="yok">Yok</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-gray-500 text-xs block mb-1">Kira Giris Tipi</label>
                      <div className="flex rounded-lg overflow-hidden border border-blue-700/50">
                        <button
                          type="button"
                          onClick={() => updateMalSahibiTutar(idx, 'net', sahip.netKira)}
                          className={`flex-1 py-2 text-sm transition-colors ${sahip.kiraTutarTipi === 'net' ? 'bg-yellow-500 text-blue-950 font-semibold' : 'bg-blue-900/30 text-gray-300 hover:bg-blue-800/50'}`}
                        >
                          Net
                        </button>
                        <button
                          type="button"
                          onClick={() => updateMalSahibiTutar(idx, 'brut', sahip.brutKira)}
                          className={`flex-1 py-2 text-sm transition-colors ${sahip.kiraTutarTipi === 'brut' ? 'bg-yellow-500 text-blue-950 font-semibold' : 'bg-blue-900/30 text-gray-300 hover:bg-blue-800/50'}`}
                        >
                          Brut
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-gray-500 text-xs block mb-1">
                        {sahip.kiraTutarTipi === 'net' ? 'Net Kira (TL)' : 'Brut Kira (TL)'}
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={sahip.kiraTutarTipi === 'net' ? sahip.netKira : sahip.brutKira}
                        onChange={(e) => updateMalSahibiTutar(idx, sahip.kiraTutarTipi, e.target.value)}
                        onBlur={() => finalizeMalSahibiTutar(idx)}
                        className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400"
                        placeholder="Orn: 18.000,00"
                      />
                    </div>
                    <div className="flex items-end">
                      <div className="w-full bg-blue-950/50 rounded-lg px-3 py-2 text-sm">
                        <span className="text-gray-500 text-xs block">
                          {sahip.kiraTutarTipi === 'net' ? 'Hesaplanan Brut' : 'Hesaplanan Net'}
                        </span>
                        <span className="text-green-400 font-semibold">
                          {sahip.kiraTutarTipi === 'net' ? (sahip.brutKira || '-') : (sahip.netKira || '-')}
                          {(sahip.netKira || sahip.brutKira) ? ' TL' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
            <FileText className="w-5 h-5 text-yellow-400" />
            <span>Elektronik Hizmetler</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center space-x-3 p-3 bg-blue-900/30 rounded-xl border border-blue-700/30 cursor-pointer hover:border-yellow-400/50 transition-colors">
              <input
                type="checkbox"
                name="efatura"
                checked={formData.efatura}
                onChange={handleChange}
                className="w-5 h-5 rounded border-blue-700/50 bg-blue-900/30 text-yellow-400 focus:ring-yellow-400"
              />
              <div>
                <div className="text-white font-medium text-sm">e-Fatura</div>
                <div className="text-gray-500 text-xs">Elektronik fatura</div>
              </div>
            </label>
            <label className="flex items-center space-x-3 p-3 bg-blue-900/30 rounded-xl border border-blue-700/30 cursor-pointer hover:border-yellow-400/50 transition-colors">
              <input
                type="checkbox"
                name="earsiv"
                checked={formData.earsiv}
                onChange={handleChange}
                className="w-5 h-5 rounded border-blue-700/50 bg-blue-900/30 text-yellow-400 focus:ring-yellow-400"
              />
              <div>
                <div className="text-white font-medium text-sm">e-Arşiv</div>
                <div className="text-gray-500 text-xs">Elektronik arşiv</div>
              </div>
            </label>
            <label className="flex items-center space-x-3 p-3 bg-blue-900/30 rounded-xl border border-blue-700/30 cursor-pointer hover:border-yellow-400/50 transition-colors">
              <input
                type="checkbox"
                name="esmm"
                checked={formData.esmm}
                onChange={handleChange}
                className="w-5 h-5 rounded border-blue-700/50 bg-blue-900/30 text-yellow-400 focus:ring-yellow-400"
              />
              <div>
                <div className="text-white font-medium text-sm">e-SMM</div>
                <div className="text-gray-500 text-xs">e-SMMM (Serbest Meslek)</div>
              </div>
            </label>
            {/* ✅ e-Defter Mükellefi + Periyot */}
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center space-x-4 p-3 bg-blue-900/30 rounded-xl border border-blue-700/30">
                <label className="flex items-center space-x-3 cursor-pointer hover:border-yellow-400/50 transition-colors">
                  <input
                    type="checkbox"
                    name="edefter"
                    checked={formData.edefter}
                    onChange={handleChange}
                    className="w-5 h-5 rounded border-blue-700/50 bg-blue-900/30 text-yellow-400 focus:ring-yellow-400"
                  />
                  <div>
                    <div className="text-white font-medium text-sm">e-Defter Mükellefi</div>
                    <div className="text-gray-500 text-xs">e-Defter verme periyodu</div>
                  </div>
                </label>
                {formData.edefter && (
                  <select
                    name="edefterPeriod"
                    value={formData.edefterPeriod}
                    onChange={handleChange}
                    className="bg-blue-900/30 border border-blue-700/50 rounded-lg py-1.5 px-3 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors"
                  >
                    <option value="aylik">Aylık</option>
                    <option value="3aylik">3 Aylık</option>
                  </select>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Beyan Ayarları */}
        <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
            <FileText className="w-5 h-5 text-yellow-400" />
            <span>Beyan Ayarları</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-gray-400 text-sm block mb-1">Vergi Türü</label>
              <select
                name="taxType"
                value={formData.taxType}
                onChange={handleChange}
                className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
              >
                <option value="Kurumlar Vergisi">🏢 Kurumlar Vergisi (Ltd. / A.Ş.)</option>
                <option value="Gelir Vergisi">👤 Gelir Vergisi (Şahıs / Serbest)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Portal Hesapları - SGK 4 ALANLI */}
        <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
            <Globe className="w-5 h-5 text-yellow-400" />
            <span>Portal Hesapları</span>
            <span className="text-xs text-gray-500 ml-2">
              (Şifreler AES-256 ile şifrelenir)
            </span>
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* SGK - 4 ALANLI */}
            <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <Users className="w-5 h-5 text-purple-400" />
                  <span className="text-white font-medium">SGK</span>
                  <span className="text-xs text-gray-500">(4 alan)</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    name="portalSgk"
                    checked={formData.portalSgk}
                    onChange={handleChange}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-blue-700/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-yellow-500 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                </label>
              </div>
              {formData.portalSgk && (
                <div className="space-y-2">
                  <div>
                    <label className="text-gray-400 text-xs block mb-1">Kullanıcı Adı (11 hane TC/VKN)</label>
                    <input
                      type="text"
                      name="sgkUsername"
                      value={formData.sgkUsername}
                      onChange={handleChange}
                      placeholder="12345678901"
                      maxLength="11"
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-1.5 px-3 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs block mb-1">İşyeri Kodu (3 hane)</label>
                    <input
                      type="text"
                      name="sgkWorkplaceCode"
                      value={formData.sgkWorkplaceCode}
                      onChange={handleChange}
                      placeholder="001"
                      maxLength="3"
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-1.5 px-3 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs block mb-1">İşyeri Şifresi</label>
                    <div className="relative">
                      <input
                        type={showPasswords.sgkWorkplacePassword ? 'text' : 'password'}
                        name="sgkWorkplacePassword"
                        value={formData.sgkWorkplacePassword}
                        onChange={handleChange}
                        placeholder="İşyeri Şifresi"
                        className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-1.5 px-3 pr-10 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors"
                      />
                      <button type="button" onClick={() => togglePassword('sgkWorkplacePassword')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-yellow-400 transition-colors">
                        {showPasswords.sgkWorkplacePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs block mb-1">Sistem Şifresi</label>
                    <div className="relative">
                      <input
                        type={showPasswords.sgkSystemPassword ? 'text' : 'password'}
                        name="sgkSystemPassword"
                        value={formData.sgkSystemPassword}
                        onChange={handleChange}
                        placeholder="Sistem Şifresi"
                        className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-1.5 px-3 pr-10 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors"
                      />
                      <button type="button" onClick={() => togglePassword('sgkSystemPassword')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-yellow-400 transition-colors">
                        {showPasswords.sgkSystemPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Dijital Vergi Dairesi / e-Arşiv */}
            <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <Building className="w-5 h-5 text-green-400" />
                  <span className="text-white font-medium">e-Arşiv / DVS</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    name="portalDvd"
                    checked={formData.portalDvd}
                    onChange={handleChange}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-blue-700/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-yellow-500 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                </label>
              </div>
              {formData.portalDvd && (
                <div className="space-y-2">
                  <input
                    type="text"
                    name="dvdUsername"
                    value={formData.dvdUsername}
                    onChange={handleChange}
                    placeholder="Vergi Dairesi Kullanıcı Adı"
                    className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-1.5 px-3 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors"
                  />
                  <div className="relative">
                    <input
                      type={showPasswords.dvdPassword ? 'text' : 'password'}
                      name="dvdPassword"
                      value={formData.dvdPassword}
                      onChange={handleChange}
                      placeholder="Vergi Dairesi Şifresi"
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-1.5 px-3 pr-10 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors"
                    />
                    <button type="button" onClick={() => togglePassword('dvdPassword')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-yellow-400 transition-colors">
                      {showPasswords.dvdPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Ticari Sicil Gazetesi */}
            <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <Newspaper className="w-5 h-5 text-orange-400" />
                  <span className="text-white font-medium">Ticari Sicil Gazetesi</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    name="portalTicariSicil"
                    checked={formData.portalTicariSicil}
                    onChange={handleChange}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-blue-700/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-yellow-500 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                </label>
              </div>
              {formData.portalTicariSicil && (
                <div className="space-y-2">
                  <input
                    type="text"
                    name="tsgUsername"
                    value={formData.tsgUsername}
                    onChange={handleChange}
                    placeholder="Ticari Sicil Kullanıcı Adı"
                    className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-1.5 px-3 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors"
                  />
                  <div className="relative">
                    <input
                      type={showPasswords.tsgPassword ? 'text' : 'password'}
                      name="tsgPassword"
                      value={formData.tsgPassword}
                      onChange={handleChange}
                      placeholder="Ticari Sicil Şifresi"
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-1.5 px-3 pr-10 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors"
                    />
                    <button type="button" onClick={() => togglePassword('tsgPassword')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-yellow-400 transition-colors">
                      {showPasswords.tsgPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tarihler */}
        <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-yellow-400" />
            <span>Tarihler</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-gray-400 text-sm block mb-1">Açılış Tarihi</label>
              <input
                type="date"
                name="openDate"
                value={formData.openDate}
                onChange={handleChange}
                className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">Kapanış Tarihi</label>
              <input
                type="date"
                name="closeDate"
                value={formData.closeDate}
                onChange={handleChange}
                className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">e-İmza Başlangıç</label>
              <input
                type="date"
                name="eimzaStart"
                value={formData.eimzaStart}
                onChange={handleChange}
                className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">e-İmza Bitiş</label>
              <input
                type="date"
                name="eimzaEnd"
                value={formData.eimzaEnd}
                onChange={handleChange}
                className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Butonlar */}
        <div className="flex space-x-4 pb-8">
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="flex-1 bg-blue-800/30 text-gray-300 px-6 py-3 rounded-lg font-semibold hover:bg-blue-700/30 transition-colors"
          >
            İptal
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-6 py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-yellow-500/30 transition-all duration-300 flex items-center justify-center space-x-2"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-950"></div>
            ) : (
              <>
                <Save className="w-5 h-5" />
                <span>Müşteri Ekle</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}