import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ArrowLeft, Save, User, Building, MapPin, Calendar, FileText, X, Globe, Users, Newspaper, Eye, EyeOff } from 'lucide-react'

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
    tsgPassword: ''
  })

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

        {/* ✅ ELEKTRONİK HİZMETLER - e-Defter Periyot Eklendi */}
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