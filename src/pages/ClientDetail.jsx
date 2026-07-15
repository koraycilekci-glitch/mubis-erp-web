import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { searchNace, formatNaceCode, getNaceDesc } from '../utils/naceCodes'
import * as XLSX from 'xlsx'
import { 
  ArrowLeft, Building2, User, Phone, Mail, MapPin, 
  FileText, Calendar, Edit3, Plus, Trash2, Save, X,
  Globe, CreditCard, Hash, ListChecks, Shield,
  Briefcase, Tag, Upload, Search, Home, ExternalLink,
  Eye, EyeOff, Lock, Landmark, KeyRound, Receipt
} from 'lucide-react'

export default function ClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { getClients, updateClient } = useAuth()
  const [client, setClient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [activeTab, setActiveTab] = useState('info')
  const [editData, setEditData] = useState({})
  const [hesapKodlari, setHesapKodlari] = useState([])
  const [hesapSearch, setHesapSearch] = useState('')
  const [naceResults, setNaceResults] = useState([])
  const [showNaceDropdown, setShowNaceDropdown] = useState(false)
  const hesapFileRef = useRef(null)

  // Yeni yetkili/ortak formu
  const [newOfficial, setNewOfficial] = useState({ name: '', title: '', phone: '', email: '', tc: '', address: '', hisse: '', sermaye: '' })
  const [showOfficialForm, setShowOfficialForm] = useState(false)
  const [editOfficialIndex, setEditOfficialIndex] = useState(-1)
  // Yeni banka formu
  const [newBank, setNewBank] = useState({ bank: '', branch: '', iban: '', accountNo: '' })
  const [showBankForm, setShowBankForm] = useState(false)
  const [editBankIndex, setEditBankIndex] = useState(-1)
  // Sifre gorunurluk
  const [showPasswords, setShowPasswords] = useState({})

  useEffect(() => {
    const clients = getClients()
    const found = clients.find(c => c.id === parseInt(id))
    if (found) {
      setClient(found)
      setEditData(found)
    }
    const stored = localStorage.getItem(`mubis_hesap_kodlari_${id}`)
    if (stored) {
      try { setHesapKodlari(JSON.parse(stored)) } catch(e) { /* ignore */ }
    }
    setLoading(false)
  }, [id, getClients])

  const saveClient = (data) => {
    const result = updateClient(parseInt(id), data)
    if (result.success) {
      setClient(data)
      setEditData(data)
    }
    return result
  }

  const handleSave = () => {
    const result = saveClient(editData)
    if (result.success) setIsEditing(false)
  }

  const handlePhoneChange = (e) => {
    const val = e.target.value
    const newData = { ...editData, phone: val }
    if (!editData.whatsapp || editData.whatsapp === editData.phone) {
      newData.whatsapp = val
    }
    setEditData(newData)
  }

  const handleNaceSearch = (query) => {
    // Sadece rakam ve noktaya izin ver, noktalari sil
    const raw = query.replace(/[^0-9]/g, '').slice(0, 6)
    setEditData({ ...editData, faaliyetKodu: raw })
    if (raw.length >= 2) {
      const results = searchNace(raw)
      setNaceResults(results)
      setShowNaceDropdown(results.length > 0)
    } else {
      setNaceResults([])
      setShowNaceDropdown(false)
    }
  }

  const selectNace = (nace) => {
    setEditData({ ...editData, faaliyetKodu: nace.code, activityField: nace.desc })
    setShowNaceDropdown(false)
  }

  // E-hizmet toggle
  const toggleEService = (key) => {
    const updated = { ...client, [key]: !client[key] }
    saveClient(updated)
  }

  // Yetkili/Ortak ekle veya guncelle
  const addOfficial = () => {
    if (!newOfficial.name) return
    const officials = [...(client.officials || [])]
    if (editOfficialIndex >= 0) {
      officials[editOfficialIndex] = { ...newOfficial }
    } else {
      officials.push({ ...newOfficial })
    }
    const updated = { ...client, officials }
    saveClient(updated)
    setNewOfficial({ name: '', title: '', phone: '', email: '', tc: '', address: '', hisse: '', sermaye: '' })
    setShowOfficialForm(false)
    setEditOfficialIndex(-1)
  }

  const startEditOfficial = (index) => {
    setNewOfficial({ ...client.officials[index] })
    setEditOfficialIndex(index)
    setShowOfficialForm(true)
  }

  const removeOfficial = (index) => {
    const officials = [...(client.officials || [])]
    officials.splice(index, 1)
    saveClient({ ...client, officials })
  }

  // Banka ekle veya guncelle
  const addBank = () => {
    if (!newBank.bank) return
    const banks = [...(client.banks || [])]
    if (editBankIndex >= 0) {
      banks[editBankIndex] = { ...newBank }
    } else {
      banks.push({ ...newBank })
    }
    saveClient({ ...client, banks })
    setNewBank({ bank: '', branch: '', iban: '', accountNo: '' })
    setShowBankForm(false)
    setEditBankIndex(-1)
  }

  const startEditBank = (index) => {
    setNewBank({ ...client.banks[index] })
    setEditBankIndex(index)
    setShowBankForm(true)
  }

  const removeBank = (index) => {
    const banks = [...(client.banks || [])]
    banks.splice(index, 1)
    saveClient({ ...client, banks })
  }

  // Hesap kodu upload
  const handleHesapKoduUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 })
        const codes = []
        jsonData.forEach((row, i) => {
          if (i === 0) return
          if (row[0]) codes.push({ kod: String(row[0]).trim(), ad: String(row[1] || '').trim() })
        })
        setHesapKodlari(codes)
        localStorage.setItem(`mubis_hesap_kodlari_${id}`, JSON.stringify(codes))
        alert(`${codes.length} hesap kodu yuklendi!`)
      } catch (err) { alert('Excel okunamadi: ' + err.message) }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400"></div></div>
  }

  if (!client) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl text-white mb-4">Musteri bulunamadi</h2>
        <p className="text-gray-400 mb-6">ID: {id}</p>
        <button onClick={() => navigate('/admin/musteriler')} className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-6 py-2 rounded-lg font-semibold">Geri Don</button>
      </div>
    )
  }

  const isCompany = client.type === 'company'

  const tabs = [
    { id: 'info', label: 'Bilgiler', icon: Building2 },
    ...(isCompany ? [{ id: 'officials', label: 'Ortaklar / Yetkililer', icon: User }] : []),
    { id: 'banks', label: 'Bankalar', icon: CreditCard },
    { id: 'kurumlar', label: 'Kurum Erisimi', icon: Landmark },
    { id: 'services', label: 'E-Hizmetler', icon: Shield },
    { id: 'documents', label: 'Evraklar', icon: FileText },
    ...(client.musteriSinifi === '1. Sinif' ? [{ id: 'hesapkodlari', label: 'Hesap Kodlari', icon: Hash }] : []),
  ]

  const filteredHesapKodlari = hesapKodlari.filter(hk => {
    if (!hesapSearch) return true
    return hk.kod.includes(hesapSearch) || hk.ad.toLowerCase().includes(hesapSearch.toLowerCase())
  })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate('/admin/musteriler')} className="text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center space-x-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-xl ${isCompany ? 'bg-gradient-to-br from-blue-500 to-blue-700' : 'bg-gradient-to-br from-purple-500 to-purple-700'}`}>
              {client.name?.charAt(0) || '?'}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{client.name}</h1>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-gray-400 text-sm">{isCompany ? `VKN: ${client.vkn || '-'}` : `TC: ${client.tc || '-'}`}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${client.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                  {client.status === 'active' ? 'Aktif' : 'Pasif'}
                </span>
                {client.musteriSinifi && <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-yellow-500/20 text-yellow-400">{client.musteriSinifi}</span>}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => navigate(`/admin/client/${id}/beyan-profile`)} className="bg-teal-500/20 text-teal-400 px-3 py-2 rounded-lg text-sm font-medium hover:bg-teal-500/30 flex items-center gap-1">
            <ListChecks className="w-4 h-4" /><span>Beyan Profili</span>
          </button>
          <button onClick={() => navigate(`/admin/client/${id}/beyan-takip`)} className="bg-blue-500/20 text-blue-400 px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-500/30 flex items-center gap-1">
            <FileText className="w-4 h-4" /><span>Beyan Takip</span>
          </button>
          {isEditing ? (
            <>
              <button onClick={handleSave} className="bg-green-500/20 text-green-400 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1"><Save className="w-4 h-4" /><span>Kaydet</span></button>
              <button onClick={() => { setIsEditing(false); setEditData(client) }} className="bg-red-500/20 text-red-400 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1"><X className="w-4 h-4" /><span>Iptal</span></button>
            </>
          ) : (
            <button onClick={() => setIsEditing(true)} className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1">
              <Edit3 className="w-4 h-4" /><span>Duzenle</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-blue-950/40 rounded-xl p-1 mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            <tab.icon className="w-4 h-4" /><span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ==================== INFO TAB ==================== */}
      {activeTab === 'info' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Temel Bilgiler */}
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-4">{isCompany ? 'Sirket Bilgileri' : 'Kisisel Bilgiler'}</h3>
            <div className="space-y-3">
              {isCompany ? (
                <>
                  <InfoRow label="Sirket Unvani" value={client.name} editKey="name" isEditing={isEditing} editData={editData} setEditData={setEditData} />
                  <InfoRow label="VKN" value={client.vkn} editKey="vkn" isEditing={isEditing} editData={editData} setEditData={setEditData} />
                  <InfoRow label="Sermaye" value={client.capital} editKey="capital" isEditing={isEditing} editData={editData} setEditData={setEditData} />
                  <InfoRow label="Vergi Dairesi" value={client.taxOffice} editKey="taxOffice" isEditing={isEditing} editData={editData} setEditData={setEditData} />
                </>
              ) : (
                <>
                  <InfoRow label="Ad Soyad" value={client.name} editKey="name" isEditing={isEditing} editData={editData} setEditData={setEditData} />
                  <InfoRow label="TC Kimlik No" value={client.tc} editKey="tc" isEditing={isEditing} editData={editData} setEditData={setEditData} />
                  <InfoRow label="Vergi Dairesi" value={client.taxOffice} editKey="taxOffice" isEditing={isEditing} editData={editData} setEditData={setEditData} />
                  {/* Musteri Sinifi - Dropdown */}
                  <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                    <span className="text-gray-400 text-sm">Musteri Sinifi</span>
                    {isEditing ? (
                      <select value={editData.musteriSinifi || ''} onChange={(e) => setEditData({...editData, musteriSinifi: e.target.value})} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400">
                        <option value="">Seciniz</option>
                        <option value="1. Sinif">1. Sinif (Bilanco)</option>
                        <option value="2. Sinif">2. Sinif (Isletme)</option>
                        <option value="Serbest Meslek">Serbest Meslek</option>
                        <option value="Basit Usul">Basit Usul</option>
                      </select>
                    ) : (
                      <span className="text-white text-sm font-medium">{client.musteriSinifi || '-'}</span>
                    )}
                  </div>
                </>
              )}
              {/* Faaliyet Kodu */}
              <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl relative">
                <span className="text-gray-400 text-sm">Faaliyet Kodu</span>
                {isEditing ? (
                  <div className="relative w-48">
                    <input
                      type="text"
                      value={editData.faaliyetKodu || ''}
                      onChange={(e) => handleNaceSearch(e.target.value)}
                      onFocus={() => {
                        const c = (editData.faaliyetKodu || '')
                        if (c.length >= 2) {
                          const results = searchNace(c)
                          setNaceResults(results)
                          setShowNaceDropdown(results.length > 0)
                        }
                      }}
                      onBlur={() => setTimeout(() => setShowNaceDropdown(false), 200)}
                      placeholder="6 haneli kod veya faaliyet ara..."
                      maxLength={6}
                      className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-full focus:outline-none focus:border-yellow-400 font-mono tracking-wider"
                    />
                    {showNaceDropdown && (
                      <div className="absolute right-0 top-full mt-1 w-96 bg-blue-950 border border-blue-700/50 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
                        {naceResults.map((n, i) => (
                          <button key={i} onClick={() => selectNace(n)} className="w-full text-left px-3 py-2 hover:bg-blue-800/50 text-sm border-b border-blue-800/30 last:border-0">
                            <span className="text-yellow-400 font-mono font-bold">{formatNaceCode(n.code)}</span>
                            <span className="text-gray-300 ml-2 text-xs">{n.desc}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-white text-sm font-medium font-mono">{client.faaliyetKodu ? formatNaceCode(client.faaliyetKodu) : '-'}</span>
                )}
              </div>
              {/* Faaliyet Konusu - kod secimine gore otomatik gelir */}
              <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                <span className="text-gray-400 text-sm">Faaliyet Konusu</span>
                <span className="text-white text-sm font-medium text-right max-w-[60%]">
                  {isEditing 
                    ? (editData.activityField || getNaceDesc(editData.faaliyetKodu) || '-')
                    : (client.activityField || getNaceDesc(client.faaliyetKodu) || '-')
                  }
                </span>
              </div>
            </div>
          </div>

          {/* Iletisim Bilgileri */}
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-4">Iletisim Bilgileri</h3>
            <div className="space-y-3">
              {/* Telefon - ozel handler */}
              <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                <span className="text-gray-400 text-sm">Telefon</span>
                {isEditing ? (
                  <input type="text" value={editData.phone || ''} onChange={handlePhoneChange} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400" placeholder="05XX XXX XX XX" />
                ) : (
                  <span className="text-white text-sm font-medium">{client.phone || '-'}</span>
                )}
              </div>
              {/* WhatsApp */}
              <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                <span className="text-gray-400 text-sm">WhatsApp</span>
                {isEditing ? (
                  <input type="text" value={editData.whatsapp || ''} onChange={(e) => setEditData({...editData, whatsapp: e.target.value})} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400" placeholder="Otomatik dolar" />
                ) : (
                  <span className="text-white text-sm font-medium">{client.whatsapp || client.phone || '-'}</span>
                )}
              </div>
              <InfoRow label="E-Posta" value={client.email} editKey="email" isEditing={isEditing} editData={editData} setEditData={setEditData} />
              <InfoRow label="Web Sitesi" value={client.website} editKey="website" isEditing={isEditing} editData={editData} setEditData={setEditData} />
              {/* Adres - Textarea 2 satir */}
              <div className="p-3 bg-blue-900/20 rounded-xl">
                <span className="text-gray-400 text-sm block mb-1">Adres</span>
                {isEditing ? (
                  <textarea value={editData.address || ''} onChange={(e) => setEditData({...editData, address: e.target.value})} rows={2} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400 resize-none" placeholder="Tam adres..." />
                ) : (
                  <p className="text-white text-sm">{client.address || '-'}</p>
                )}
              </div>
            </div>
          </div>

          {/* Kira Bilgileri */}
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Home className="w-5 h-5 text-yellow-400" /> Kira Bilgileri</h3>
            <div className="space-y-3">
              <InfoRow label="Aylik Kira" value={client.kiraAmount} editKey="kiraAmount" isEditing={isEditing} editData={editData} setEditData={setEditData} />
              <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                <span className="text-gray-400 text-sm">Kontrat Baslangic</span>
                {isEditing ? (
                  <input type="date" value={editData.kiraBaslangic || ''} onChange={(e) => setEditData({...editData, kiraBaslangic: e.target.value})} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400" />
                ) : (
                  <span className="text-white text-sm font-medium">{client.kiraBaslangic || '-'}</span>
                )}
              </div>
              <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                <span className="text-gray-400 text-sm">Kontrat Bitis</span>
                {isEditing ? (
                  <input type="date" value={editData.kiraBitis || ''} onChange={(e) => setEditData({...editData, kiraBitis: e.target.value})} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400" />
                ) : (
                  <span className="text-white text-sm font-medium">{client.kiraBitis || '-'}</span>
                )}
              </div>
              {client.kiraBitis && (() => {
                const diff = Math.ceil((new Date(client.kiraBitis) - new Date()) / (1000 * 60 * 60 * 24))
                if (diff <= 60 && diff > 0) return <div className="p-3 bg-yellow-500/10 rounded-xl border border-yellow-500/30"><span className="text-yellow-400 text-sm font-medium">Kontrat bitisine {diff} gun kaldi!</span></div>
                if (diff <= 0) return <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/30"><span className="text-red-400 text-sm font-medium">Kontrat suresi dolmus!</span></div>
                return null
              })()}
              <InfoRow label="Ev Sahibi" value={client.kiraSahibi} editKey="kiraSahibi" isEditing={isEditing} editData={editData} setEditData={setEditData} />
            </div>
          </div>

          {/* Onemli Tarihler */}
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Calendar className="w-5 h-5 text-yellow-400" /> Onemli Tarihler</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                <span className="text-gray-400 text-sm">Is Acilis</span>
                {isEditing ? <input type="date" value={editData.isAcilisTarihi || editData.openDate || ''} onChange={(e) => setEditData({...editData, isAcilisTarihi: e.target.value})} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400" /> : <span className="text-white text-sm">{client.isAcilisTarihi || client.openDate || '-'}</span>}
              </div>
              <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                <span className="text-gray-400 text-sm">e-Imza Bitis</span>
                {isEditing ? <input type="date" value={editData.eimzaEnd || ''} onChange={(e) => setEditData({...editData, eimzaEnd: e.target.value})} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400" /> : <span className="text-white text-sm">{client.eimzaEnd || '-'}</span>}
              </div>
            </div>
          </div>

          {/* Notlar */}
          <div className="md:col-span-2 bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-4">Notlar</h3>
            {isEditing ? (
              <textarea value={editData.notes || ''} onChange={(e) => setEditData({...editData, notes: e.target.value})} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl p-4 text-white min-h-[80px] focus:outline-none focus:border-yellow-400" placeholder="Notlar..." />
            ) : (
              <p className="text-gray-300 bg-blue-900/20 rounded-xl p-4">{client.notes || 'Not yok'}</p>
            )}
          </div>
        </div>
      )}

      {/* ==================== ORTAKLAR / YETKİLİLER TAB ==================== */}
      {activeTab === 'officials' && isCompany && (
        <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white">Sirket Ortaklari / Yetkililer</h3>
            <button onClick={() => { setShowOfficialForm(!showOfficialForm); setEditOfficialIndex(-1); setNewOfficial({ name: '', title: '', phone: '', email: '', tc: '', address: '', hisse: '', sermaye: '' }) }} className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1">
              <Plus className="w-4 h-4" /><span>Ortak Ekle</span>
            </button>
          </div>

          {showOfficialForm && (
            <div className="bg-blue-900/20 rounded-xl p-4 mb-4 border border-blue-700/30">
              <h4 className="text-white font-medium mb-3 text-sm">{editOfficialIndex >= 0 ? 'Ortak / Yetkili Duzenle' : 'Yeni Ortak / Yetkili'}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <input type="text" value={newOfficial.name} onChange={(e) => setNewOfficial({...newOfficial, name: e.target.value})} placeholder="Ad Soyad *" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <input type="text" value={newOfficial.title} onChange={(e) => setNewOfficial({...newOfficial, title: e.target.value})} placeholder="Unvan (Ortak/Mudur)" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <input type="text" value={newOfficial.tc} onChange={(e) => setNewOfficial({...newOfficial, tc: e.target.value})} placeholder="TC Kimlik No" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <input type="text" value={newOfficial.phone} onChange={(e) => setNewOfficial({...newOfficial, phone: e.target.value})} placeholder="Telefon" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <input type="text" value={newOfficial.email} onChange={(e) => setNewOfficial({...newOfficial, email: e.target.value})} placeholder="E-Posta" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <input type="text" value={newOfficial.hisse} onChange={(e) => setNewOfficial({...newOfficial, hisse: e.target.value})} placeholder="Hisse Orani (%)" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <input type="text" value={newOfficial.sermaye} onChange={(e) => setNewOfficial({...newOfficial, sermaye: e.target.value})} placeholder="Sermaye Tutari" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <textarea value={newOfficial.address} onChange={(e) => setNewOfficial({...newOfficial, address: e.target.value})} placeholder="Adres" rows={1} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400 resize-none sm:col-span-2" />
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={addOfficial} className="bg-green-500/20 text-green-400 px-4 py-2 rounded-lg text-sm font-medium">{editOfficialIndex >= 0 ? 'Guncelle' : 'Kaydet'}</button>
                <button onClick={() => { setShowOfficialForm(false); setEditOfficialIndex(-1); setNewOfficial({ name: '', title: '', phone: '', email: '', tc: '', address: '', hisse: '', sermaye: '' }) }} className="bg-red-500/20 text-red-400 px-4 py-2 rounded-lg text-sm font-medium">Iptal</button>
              </div>
            </div>
          )}

          {client.officials && client.officials.length > 0 ? (
            <div className="space-y-3">
              {client.officials.map((official, i) => (
                <div key={i} className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/20">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-medium">{official.name}</span>
                        {official.title && <span className="text-yellow-500 text-xs bg-yellow-500/10 px-2 py-0.5 rounded">{official.title}</span>}
                        {official.hisse && <span className="text-blue-400 text-xs">%{official.hisse}</span>}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-2 text-sm text-gray-400">
                        {official.tc && <span>TC: {official.tc}</span>}
                        {official.phone && <span>Tel: {official.phone}</span>}
                        {official.email && <span>E-Posta: {official.email}</span>}
                        {official.sermaye && <span>Sermaye: {official.sermaye}</span>}
                        {official.address && <span className="sm:col-span-2">Adres: {official.address}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEditOfficial(i)} className="text-gray-500 hover:text-yellow-400 transition-colors p-1" title="Duzenle"><Edit3 className="w-4 h-4" /></button>
                      <button onClick={() => removeOfficial(i)} className="text-gray-500 hover:text-red-400 transition-colors p-1" title="Sil"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-6">Henuz ortak/yetkili eklenmemis</p>
          )}
        </div>
      )}

      {/* ==================== BANKALAR TAB ==================== */}
      {activeTab === 'banks' && (
        <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white">Banka Hesaplari</h3>
            <button onClick={() => { setShowBankForm(!showBankForm); setEditBankIndex(-1); setNewBank({ bank: '', branch: '', iban: '', accountNo: '' }) }} className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1">
              <Plus className="w-4 h-4" /><span>Banka Ekle</span>
            </button>
          </div>

          {showBankForm && (
            <div className="bg-blue-900/20 rounded-xl p-4 mb-4 border border-blue-700/30">
              <h4 className="text-white font-medium mb-3 text-sm">{editBankIndex >= 0 ? 'Banka Bilgisi Duzenle' : 'Yeni Banka Hesabi'}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input type="text" value={newBank.bank} onChange={(e) => setNewBank({...newBank, bank: e.target.value})} placeholder="Banka Adi *" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <input type="text" value={newBank.branch} onChange={(e) => setNewBank({...newBank, branch: e.target.value})} placeholder="Sube" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <input type="text" value={newBank.iban} onChange={(e) => setNewBank({...newBank, iban: e.target.value})} placeholder="IBAN" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400 sm:col-span-2" />
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={addBank} className="bg-green-500/20 text-green-400 px-4 py-2 rounded-lg text-sm font-medium">{editBankIndex >= 0 ? 'Guncelle' : 'Kaydet'}</button>
                <button onClick={() => { setShowBankForm(false); setEditBankIndex(-1); setNewBank({ bank: '', branch: '', iban: '', accountNo: '' }) }} className="bg-red-500/20 text-red-400 px-4 py-2 rounded-lg text-sm font-medium">Iptal</button>
              </div>
            </div>
          )}

          {client.banks && client.banks.length > 0 ? (
            <div className="space-y-3">
              {client.banks.map((bank, i) => (
                <div key={i} className="bg-blue-900/20 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2"><span className="text-white font-medium">{bank.bank}</span>{bank.branch && <span className="text-gray-400 text-sm">- {bank.branch}</span>}</div>
                    <div className="text-gray-300 text-sm font-mono mt-1">IBAN: {bank.iban || '-'}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEditBank(i)} className="text-gray-500 hover:text-yellow-400 transition-colors p-1" title="Duzenle"><Edit3 className="w-4 h-4" /></button>
                    <button onClick={() => removeBank(i)} className="text-gray-500 hover:text-red-400 transition-colors p-1" title="Sil"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-6">Henuz banka hesabi eklenmemis</p>
          )}
        </div>
      )}

      {/* ==================== E-HİZMETLER TAB ==================== */}
      {activeTab === 'services' && (
        <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
          <h3 className="text-lg font-semibold text-white mb-4">Elektronik Hizmetler</h3>
          <p className="text-gray-500 text-xs mb-4">Tikla: Aktif/Pasif degistir</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { key: 'efatura', label: 'e-Fatura' },
              { key: 'earsiv', label: 'e-Arsiv' },
              { key: 'esmm', label: 'e-SMM' },
              { key: 'edefter', label: 'e-Defter' },
            ].map((item) => (
              <button key={item.key} onClick={() => toggleEService(item.key)} className={`flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer ${client[item.key] ? 'bg-green-500/10 border-green-500/30 hover:bg-green-500/20' : 'bg-blue-900/20 border-blue-700/20 hover:bg-blue-800/30'}`}>
                <span className="text-white text-sm font-medium">{item.label}</span>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${client[item.key] ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-500'}`}>
                  {client[item.key] ? 'Aktif' : 'Pasif'}
                </span>
              </button>
            ))}
          </div>
          {client.edefter && (
            <div className="mt-3 p-3 bg-blue-900/20 rounded-xl flex items-center justify-between">
              <span className="text-gray-400 text-sm">e-Defter Periyodu</span>
              <select value={client.edefterPeriod || 'aylik'} onChange={(e) => saveClient({...client, edefterPeriod: e.target.value})} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm focus:outline-none focus:border-yellow-400">
                <option value="aylik">Aylik</option>
                <option value="3aylik">3 Aylik</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* ==================== KURUM ERİŞİMİ TAB ==================== */}
      {activeTab === 'kurumlar' && (
        <div className="space-y-6">
          {/* Portal Sifreleri */}
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-yellow-400" /> Portal Sifreleri
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Vergi Dairesi - Kullanici + Sifre */}
              <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/20">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">🏛️</span>
                  <span className="text-white font-medium text-sm">Dijital Vergi Dairesi</span>
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    <input type="text" value={editData.vergiUser || ''} onChange={(e) => setEditData({...editData, vergiUser: e.target.value})} placeholder="Kullanici Adi / VKN" className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                    <div className="relative">
                      <input type={showPasswords.vergiPass ? 'text' : 'password'} value={editData.vergiPass || ''} onChange={(e) => setEditData({...editData, vergiPass: e.target.value})} placeholder="Sifre" className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 pr-10 text-white text-sm focus:outline-none focus:border-yellow-400" />
                      <button type="button" onClick={() => setShowPasswords({...showPasswords, vergiPass: !showPasswords.vergiPass})} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                        {showPasswords.vergiPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between"><span className="text-gray-400 text-xs">Kullanici:</span><span className="text-gray-200 text-sm font-mono">{client.vergiUser || '-'}</span></div>
                    <div className="flex items-center justify-between"><span className="text-gray-400 text-xs">Sifre:</span>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-200 text-sm font-mono">{client.vergiPass ? (showPasswords.vergiPass ? client.vergiPass : '••••••••') : '-'}</span>
                        {client.vergiPass && <button onClick={() => setShowPasswords({...showPasswords, vergiPass: !showPasswords.vergiPass})} className="text-gray-500 hover:text-yellow-400 transition-colors">{showPasswords.vergiPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SGK - Kullanici + Sifre */}
              <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/20">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">🏥</span>
                  <span className="text-white font-medium text-sm">SGK / e-Bildirge</span>
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    <input type="text" value={editData.sgkUser || ''} onChange={(e) => setEditData({...editData, sgkUser: e.target.value})} placeholder="Kullanici Adi / Isyeri Sicil No" className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                    <div className="relative">
                      <input type={showPasswords.sgkPass ? 'text' : 'password'} value={editData.sgkPass || ''} onChange={(e) => setEditData({...editData, sgkPass: e.target.value})} placeholder="Sifre" className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 pr-10 text-white text-sm focus:outline-none focus:border-yellow-400" />
                      <button type="button" onClick={() => setShowPasswords({...showPasswords, sgkPass: !showPasswords.sgkPass})} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                        {showPasswords.sgkPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between"><span className="text-gray-400 text-xs">Kullanici:</span><span className="text-gray-200 text-sm font-mono">{client.sgkUser || '-'}</span></div>
                    <div className="flex items-center justify-between"><span className="text-gray-400 text-xs">Sifre:</span>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-200 text-sm font-mono">{client.sgkPass ? (showPasswords.sgkPass ? client.sgkPass : '••••••••') : '-'}</span>
                        {client.sgkPass && <button onClick={() => setShowPasswords({...showPasswords, sgkPass: !showPasswords.sgkPass})} className="text-gray-500 hover:text-yellow-400 transition-colors">{showPasswords.sgkPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Ticaret Odasi - Sadece Ticari Sicil No */}
              <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/20">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">🏢</span>
                  <span className="text-white font-medium text-sm">Ticaret Odasi</span>
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    <input type="text" value={editData.ticariSicilNo || ''} onChange={(e) => setEditData({...editData, ticariSicilNo: e.target.value})} placeholder="Ticari Sicil Numarasi" className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between"><span className="text-gray-400 text-xs">Ticari Sicil No:</span><span className="text-gray-200 text-sm font-mono">{client.ticariSicilNo || '-'}</span></div>
                  </div>
                )}
                <p className="text-gray-500 text-[10px] mt-2 italic">Ticari sicil numarasiyla sorgulama yapilir</p>
              </div>

              {/* e-Fatura / e-Arsiv / e-Irsaliye - e-Imza / Mali Muhur ile giris */}
              <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/20">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">📄</span>
                  <span className="text-white font-medium text-sm">e-Fatura / e-Arsiv / e-Irsaliye</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-blue-900/30 rounded-lg">
                    <Lock className="w-3.5 h-3.5 text-yellow-400" />
                    <span className="text-gray-300 text-xs">e-Imza veya Mali Muhur ile giris yapilir</span>
                  </div>
                  <p className="text-gray-500 text-[10px] italic">Giris icin EFaturaWebSocket programini calistirin</p>
                </div>
              </div>
            </div>
          </div>

          {/* Vergi Dairesi Islemleri */}
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span className="text-lg">🏛️</span> Dijital Vergi Dairesi
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[
                { label: 'DVS Giris', url: 'https://dijital.gib.gov.tr/', icon: '🔑', color: 'from-blue-500/20 to-blue-600/20 border-blue-500/30' },
                { label: 'Vergi Borcu Sorgula', url: 'https://dijital.gib.gov.tr/sayfalar/GenelBorcSorgulama', icon: '💰', color: 'from-red-500/20 to-red-600/20 border-red-500/30' },
                { label: 'Borcu Yok Kagidi', url: 'https://dijital.gib.gov.tr/', icon: '📋', color: 'from-green-500/20 to-green-600/20 border-green-500/30' },
                { label: 'Vergi Odeme', url: 'https://dijital.gib.gov.tr/', icon: '💳', color: 'from-purple-500/20 to-purple-600/20 border-purple-500/30' },
                { label: 'Mukellefiyet Belgesi', url: 'https://dijital.gib.gov.tr/', icon: '📑', color: 'from-teal-500/20 to-teal-600/20 border-teal-500/30' },
                { label: 'Beyanname Sorgula', url: 'https://dijital.gib.gov.tr/', icon: '🔍', color: 'from-indigo-500/20 to-indigo-600/20 border-indigo-500/30' },
                { label: 'Tahakkuk Fisi', url: 'https://dijital.gib.gov.tr/', icon: '🧾', color: 'from-orange-500/20 to-orange-600/20 border-orange-500/30' },
                { label: 'e-Tebligat', url: 'https://dijital.gib.gov.tr/', icon: '📨', color: 'from-cyan-500/20 to-cyan-600/20 border-cyan-500/30' },
              ].map((item, i) => (
                <a key={i} href={item.url} target="_blank" rel="noopener noreferrer" className={`flex flex-col items-center gap-2 p-4 rounded-xl border bg-gradient-to-br ${item.color} hover:scale-105 transition-all cursor-pointer text-center group`}>
                  <span className="text-2xl">{item.icon}</span>
                  <span className="text-white text-xs font-medium leading-tight">{item.label}</span>
                  <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-yellow-400 transition-colors" />
                </a>
              ))}
            </div>
          </div>

          {/* SGK Islemleri */}
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span className="text-lg">🏥</span> SGK / Sigorta Islemleri
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[
                { label: 'e-Bildirge Giris', url: 'https://ebildirge.sgk.gov.tr/', icon: '🔑', color: 'from-blue-500/20 to-blue-600/20 border-blue-500/30' },
                { label: 'Bildirge Indir', url: 'https://ebildirge.sgk.gov.tr/', icon: '📥', color: 'from-green-500/20 to-green-600/20 border-green-500/30' },
                { label: 'Tahakkuk Indir', url: 'https://ebildirge.sgk.gov.tr/', icon: '🧾', color: 'from-orange-500/20 to-orange-600/20 border-orange-500/30' },
                { label: 'SGK Borc Sorgula', url: 'https://www.turkiye.gov.tr/sgk-tescil-ve-hizmet-dokumu', icon: '💰', color: 'from-red-500/20 to-red-600/20 border-red-500/30' },
                { label: 'Isyeri Sicil', url: 'https://ebildirge.sgk.gov.tr/', icon: '🏢', color: 'from-purple-500/20 to-purple-600/20 border-purple-500/30' },
                { label: 'Isci Listesi', url: 'https://ebildirge.sgk.gov.tr/', icon: '👷', color: 'from-teal-500/20 to-teal-600/20 border-teal-500/30' },
                { label: 'Borc Yoktur Yazisi', url: 'https://ebildirge.sgk.gov.tr/', icon: '📋', color: 'from-indigo-500/20 to-indigo-600/20 border-indigo-500/30' },
                { label: 'APHB Sorgula', url: 'https://ebildirge.sgk.gov.tr/', icon: '🔍', color: 'from-cyan-500/20 to-cyan-600/20 border-cyan-500/30' },
              ].map((item, i) => (
                <a key={i} href={item.url} target="_blank" rel="noopener noreferrer" className={`flex flex-col items-center gap-2 p-4 rounded-xl border bg-gradient-to-br ${item.color} hover:scale-105 transition-all cursor-pointer text-center group`}>
                  <span className="text-2xl">{item.icon}</span>
                  <span className="text-white text-xs font-medium leading-tight">{item.label}</span>
                  <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-yellow-400 transition-colors" />
                </a>
              ))}
            </div>
          </div>

          {/* Ticaret Odasi */}
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span className="text-lg">🏢</span> Ticaret Odasi (ITO/TOBB)
            </h3>
            <p className="text-gray-400 text-xs mb-3">Ticari Sicil No ile sorgulama yapilir{client.ticariSicilNo ? ` - Sicil No: ${client.ticariSicilNo}` : ''}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[
                { label: 'ITO Giris', url: 'https://online.ito.org.tr/', icon: '🔑', color: 'from-blue-500/20 to-blue-600/20 border-blue-500/30' },
                { label: 'Faaliyet Belgesi', url: 'https://online.ito.org.tr/', icon: '📄', color: 'from-green-500/20 to-green-600/20 border-green-500/30' },
                { label: 'Borc Odeme', url: 'https://online.ito.org.tr/', icon: '💳', color: 'from-purple-500/20 to-purple-600/20 border-purple-500/30' },
                { label: 'Ticaret Sicil', url: 'https://online.ito.org.tr/', icon: '📑', color: 'from-orange-500/20 to-orange-600/20 border-orange-500/30' },
                { label: 'Oda Kayit Belgesi', url: 'https://online.ito.org.tr/', icon: '📋', color: 'from-teal-500/20 to-teal-600/20 border-teal-500/30' },
                { label: 'MERSIS', url: 'https://mersis.gtb.gov.tr/', icon: '🌐', color: 'from-indigo-500/20 to-indigo-600/20 border-indigo-500/30' },
              ].map((item, i) => (
                <a key={i} href={item.url} target="_blank" rel="noopener noreferrer" className={`flex flex-col items-center gap-2 p-4 rounded-xl border bg-gradient-to-br ${item.color} hover:scale-105 transition-all cursor-pointer text-center group`}>
                  <span className="text-2xl">{item.icon}</span>
                  <span className="text-white text-xs font-medium leading-tight">{item.label}</span>
                  <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-yellow-400 transition-colors" />
                </a>
              ))}
            </div>
          </div>

          {/* e-Belge Portallari - Musterinin aktif hizmetlerine gore */}
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span className="text-lg">📄</span> e-Belge Portallari
            </h3>

            {/* Musteri bilgileri - admin giris icin */}
            <div className="bg-blue-900/30 rounded-xl p-3 mb-4 flex flex-wrap items-center gap-3 text-xs">
              <span className="text-gray-400">Musteri:</span>
              <span className="text-white font-medium">{client.companyName || client.name || '-'}</span>
              {client.vkn && <><span className="text-gray-500">|</span><span className="text-gray-400">VKN:</span><span className="text-yellow-400 font-mono">{client.vkn}</span></>}
              {client.tcKimlik && <><span className="text-gray-500">|</span><span className="text-gray-400">TC:</span><span className="text-yellow-400 font-mono">{client.tcKimlik}</span></>}
            </div>

            {/* Aktif hizmet yoksa uyari */}
            {!client.efatura && !client.earsiv && !client.esmm && (
              <div className="bg-gray-500/10 border border-gray-500/20 rounded-xl p-4 text-center">
                <p className="text-gray-400 text-sm">Bu musterinin aktif e-Belge hizmeti bulunmuyor.</p>
                <p className="text-gray-500 text-xs mt-1">E-Hizmetler sekmesinden aktif ediniz.</p>
              </div>
            )}

            {/* e-Fatura Mukellefiyse */}
            {client.efatura && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                  <span className="text-green-400 text-sm font-medium">e-Fatura Mukellef</span>
                  <span className="text-gray-500 text-[10px]">e-Imza / Mali Muhur ile giris</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {[
                    { label: 'e-Fatura Portal Giris', url: 'https://ebelge.gib.gov.tr/efabortalgiris.html', icon: '📄', color: 'from-blue-500/20 to-blue-600/20 border-blue-500/30' },
                    { label: 'Gelen Faturalar', url: 'https://ebelge.gib.gov.tr/efabortalgiris.html', icon: '📥', color: 'from-green-500/20 to-green-600/20 border-green-500/30' },
                    { label: 'Giden Faturalar', url: 'https://ebelge.gib.gov.tr/efabortalgiris.html', icon: '📤', color: 'from-orange-500/20 to-orange-600/20 border-orange-500/30' },
                    { label: 'e-Arsiv Portal', url: 'https://earsivportal.efatura.gov.tr/', icon: '📂', color: 'from-purple-500/20 to-purple-600/20 border-purple-500/30' },
                  ].map((item, i) => (
                    <a key={i} href={item.url} target="_blank" rel="noopener noreferrer" className={`flex flex-col items-center gap-2 p-4 rounded-xl border bg-gradient-to-br ${item.color} hover:scale-105 transition-all cursor-pointer text-center group`}>
                      <span className="text-2xl">{item.icon}</span>
                      <span className="text-white text-xs font-medium leading-tight">{item.label}</span>
                      <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-yellow-400 transition-colors" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* e-Arsiv Mukellefiyse (e-Fatura degil) */}
            {client.earsiv && !client.efatura && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
                  <span className="text-emerald-400 text-sm font-medium">e-Arsiv Mukellef</span>
                  <span className="text-gray-500 text-[10px]">GIB portal uzerinden giris</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {[
                    { label: 'e-Arsiv Portal Giris', url: 'https://earsivportal.efatura.gov.tr/', icon: '📂', color: 'from-green-500/20 to-green-600/20 border-green-500/30' },
                    { label: 'e-Arsiv Fatura Kes', url: 'https://earsivportal.efatura.gov.tr/', icon: '✂️', color: 'from-orange-500/20 to-orange-600/20 border-orange-500/30' },
                    { label: 'Fatura Sorgula', url: 'https://earsivportal.efatura.gov.tr/', icon: '🔍', color: 'from-purple-500/20 to-purple-600/20 border-purple-500/30' },
                  ].map((item, i) => (
                    <a key={i} href={item.url} target="_blank" rel="noopener noreferrer" className={`flex flex-col items-center gap-2 p-4 rounded-xl border bg-gradient-to-br ${item.color} hover:scale-105 transition-all cursor-pointer text-center group`}>
                      <span className="text-2xl">{item.icon}</span>
                      <span className="text-white text-xs font-medium leading-tight">{item.label}</span>
                      <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-yellow-400 transition-colors" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* e-SMM Mukellefiyse */}
            {client.esmm && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 bg-cyan-400 rounded-full"></span>
                  <span className="text-cyan-400 text-sm font-medium">e-SMM Mukellef</span>
                  <span className="text-gray-500 text-[10px]">e-Imza / Mali Muhur ile giris</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {[
                    { label: 'e-SMM Portal Giris', url: 'https://esmm.gib.gov.tr/', icon: '📝', color: 'from-cyan-500/20 to-cyan-600/20 border-cyan-500/30' },
                    { label: 'Makbuz Kes', url: 'https://esmm.gib.gov.tr/', icon: '🧾', color: 'from-teal-500/20 to-teal-600/20 border-teal-500/30' },
                    { label: 'Makbuz Sorgula', url: 'https://esmm.gib.gov.tr/', icon: '🔍', color: 'from-indigo-500/20 to-indigo-600/20 border-indigo-500/30' },
                  ].map((item, i) => (
                    <a key={i} href={item.url} target="_blank" rel="noopener noreferrer" className={`flex flex-col items-center gap-2 p-4 rounded-xl border bg-gradient-to-br ${item.color} hover:scale-105 transition-all cursor-pointer text-center group`}>
                      <span className="text-2xl">{item.icon}</span>
                      <span className="text-white text-xs font-medium leading-tight">{item.label}</span>
                      <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-yellow-400 transition-colors" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* e-Irsaliye - e-Fatura mukelleflerinde otomatik */}
            {client.efatura && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
                  <span className="text-amber-400 text-sm font-medium">e-Irsaliye</span>
                  <span className="text-gray-500 text-[10px]">e-Imza / Mali Muhur ile giris</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  <a href="https://ebelge.gib.gov.tr/eiabortalgiris.html" target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-2 p-4 rounded-xl border bg-gradient-to-br from-amber-500/20 to-amber-600/20 border-amber-500/30 hover:scale-105 transition-all cursor-pointer text-center group">
                    <span className="text-2xl">🚚</span>
                    <span className="text-white text-xs font-medium leading-tight">e-Irsaliye Portal</span>
                    <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-yellow-400 transition-colors" />
                  </a>
                </div>
              </div>
            )}

            {/* EFaturaWebSocket - e-Imza gerektiren hizmet varsa goster */}
            {(client.efatura || client.esmm) && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mt-4">
                <div className="flex items-start gap-3">
                  <Lock className="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-yellow-300 text-sm font-medium mb-1">e-Imza / Mali Muhur Gerektiren Giris</p>
                    <p className="text-gray-400 text-xs">Portal girisinden once <strong className="text-yellow-400">EFaturaWebSocket</strong> programini calistirin, ardindan portal linkine tiklayin.</p>
                    <button
                      onClick={() => {
                        const link = document.createElement('a')
                        link.href = 'https://ebelge.gib.gov.tr/EFaturaWebSocket/EFaturaWebSocket.jnlp'
                        link.download = 'EFaturaWebSocket.jnlp'
                        link.click()
                      }}
                      className="mt-2 bg-yellow-500/20 text-yellow-400 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-yellow-500/30 transition-colors inline-flex items-center gap-1"
                    >
                      <Globe className="w-3.5 h-3.5" /> EFaturaWebSocket Indir
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== EVRAKLAR TAB ==================== */}
      {activeTab === 'documents' && (
        <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
          <h3 className="text-lg font-semibold text-white mb-4">Evraklar</h3>
          <p className="text-gray-500 text-center py-8">Evrak merkezi modulu ile entegre edilecek</p>
        </div>
      )}

      {/* ==================== HESAP KODLARI TAB ==================== */}
      {activeTab === 'hesapkodlari' && client.musteriSinifi === '1. Sinif' && (
        <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div>
              <h3 className="text-lg font-semibold text-white">Hesap Kodlari (LUCA)</h3>
              <p className="text-gray-500 text-xs mt-1">{hesapKodlari.length > 0 ? `${hesapKodlari.length} hesap kodu yuklu` : 'Yuklu degil'}</p>
            </div>
            <div className="flex gap-2">
              {hesapKodlari.length > 0 && (
                <button onClick={() => { setHesapKodlari([]); localStorage.removeItem(`mubis_hesap_kodlari_${id}`) }} className="bg-red-500/20 text-red-400 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1"><Trash2 className="w-4 h-4" /><span>Temizle</span></button>
              )}
              <button onClick={() => hesapFileRef.current?.click()} className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1"><Upload className="w-4 h-4" /><span>Excel Yukle</span></button>
              <input ref={hesapFileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleHesapKoduUpload} className="hidden" />
            </div>
          </div>
          {hesapKodlari.length > 0 ? (
            <>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input type="text" value={hesapSearch} onChange={(e) => setHesapSearch(e.target.value)} placeholder="Hesap kodu veya adi ara..." className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 pl-9 pr-3 text-white text-sm focus:outline-none focus:border-yellow-400" />
              </div>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-blue-900/30 sticky top-0"><tr className="text-left text-gray-400 text-sm"><th className="px-4 py-2">#</th><th className="px-4 py-2">Hesap Kodu</th><th className="px-4 py-2">Hesap Adi</th></tr></thead>
                  <tbody>
                    {filteredHesapKodlari.map((hk, i) => (
                      <tr key={i} className="border-t border-blue-700/20 hover:bg-blue-800/20"><td className="px-4 py-2 text-gray-500 text-sm">{i+1}</td><td className="px-4 py-2 text-yellow-400 text-sm font-mono font-medium">{hk.kod}</td><td className="px-4 py-2 text-white text-sm">{hk.ad}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="text-center py-12"><Hash className="w-12 h-12 text-gray-600 mx-auto mb-3" /><p className="text-gray-400 mb-2">Hesap kodu listesi yuklu degil</p><p className="text-gray-500 text-sm">LUCA Excel hesap kodu listesini yukleyebilirsiniz</p></div>
          )}
        </div>
      )}
    </div>
  )
}

// Yeniden kullanilabilir bilgi satiri
function InfoRow({ label, value, editKey, isEditing, editData, setEditData }) {
  return (
    <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
      <span className="text-gray-400 text-sm">{label}</span>
      {isEditing && editKey ? (
        <input type="text" value={editData[editKey] || ''} onChange={(e) => setEditData({...editData, [editKey]: e.target.value})} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400" />
      ) : (
        <span className="text-white text-sm font-medium text-right max-w-[200px] truncate">{value || '-'}</span>
      )}
    </div>
  )
}
