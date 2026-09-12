import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getSettings, saveSettings, getDefaultDocumentPermissions, parseDocumentPermissions, getDefaultDocumentFolders, parseDocumentFolders } from '../services/settingsService'
import { getBankInfo, saveBankInfo } from '../services/paymentService'
import { Settings as SettingsIcon, Lock, Clock, Users, Eye, EyeOff, CheckCircle, AlertCircle, Save, RefreshCw, MessageCircle, Mail, FolderOpen, FolderTree, Plus, Trash2, Pencil, Volume2, Play, CreditCard, Building2 } from 'lucide-react'
import FolderStructureEditor from '../components/FolderStructureEditor'
import { SES_TERCIHLERI, VARSAYILAN_SES_AYARI, seslerHazirOlunca, sesSec, konus, sesAyariCoz, sesDestekleniyor, sesCinsiyeti, cinsiyetSesiVar } from '../utils/speechUtils'

export default function Settings() {
  const { user, profile, updatePassword } = useAuth()
  const [activeTab, setActiveTab] = useState('password')
  
  // Sifre degistirme
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState('')
  const [passwordErr, setPasswordErr] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)

  // Sifre sikligi
  const [passwordInterval, setPasswordInterval] = useState('never')
  const [intervalMsg, setIntervalMsg] = useState('')
  const [intervalLoading, setIntervalLoading] = useState(false)

  // Admin: Kullanici yonetimi
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [newUserPassword, setNewUserPassword] = useState('')
  const [adminMsg, setAdminMsg] = useState('')
  const [adminErr, setAdminErr] = useState('')
  const [adminLoading, setAdminLoading] = useState(false)
  const [showNewUserForm, setShowNewUserForm] = useState(false)
  const [newUserForm, setNewUserForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'personel'
  })
  const [createLoading, setCreateLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [editingUser, setEditingUser] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', email: '', role: 'personel' })

  // Iletisim ayarlari
  const [commSettings, setCommSettings] = useState({
    whatsapp_phone_number_id: '',
    whatsapp_access_token: '',
    whatsapp_template_name: 'beyanname_bildirim',
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    smtp_pass: '',
    smtp_from: '',
    smtp_secure: 'false',
    odeme_hatirlatma_gun: '5',
    payment_provider: 'paytr',
    payment_providers_enabled: JSON.stringify(['paytr']),
    client_document_permissions: JSON.stringify(getDefaultDocumentPermissions())
  })
  const [commLoading, setCommLoading] = useState(false)
  const [commMsg, setCommMsg] = useState('')
  const [commErr, setCommErr] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [showSmtpPass, setShowSmtpPass] = useState(false)

  // Evrak gorunurlugu
  const [docPermissions, setDocPermissions] = useState(getDefaultDocumentPermissions())
  const [docPermLoading, setDocPermLoading] = useState(false)
  const [docPermMsg, setDocPermMsg] = useState('')
  const [docPermErr, setDocPermErr] = useState('')

  // Evrak klasor yapisi
  const [docFolders, setDocFolders] = useState(getDefaultDocumentFolders())
  const [folderLoading, setFolderLoading] = useState(false)
  const [folderMsg, setFolderMsg] = useState('')
  const [folderErr, setFolderErr] = useState('')

  // Banka bilgileri (EFT/Havale)
  const [bankInfo, setBankInfo] = useState({ banka: '', hesapSahibi: '', iban: '' })
  const [bankInfoEdit, setBankInfoEdit] = useState({ banka: '', hesapSahibi: '', iban: '' })
  const [bankInfoLoading, setBankInfoLoading] = useState(false)
  const [bankInfoMsg, setBankInfoMsg] = useState('')
  const [bankInfoErr, setBankInfoErr] = useState('')
  // Etkin odeme kuruluslari (coklu secim)
  const [enabledProviders, setEnabledProviders] = useState(['paytr'])
  // Aktif odeme kurulusu (iclerinden secilen)
  const [activeProviderLocal, setActiveProviderLocal] = useState('paytr')

  useEffect(() => {
    loadCommSettings()
    loadBankInfoData()
  }, [])

  const loadBankInfoData = async () => {
    try {
      const info = await getBankInfo()
      setBankInfo(info)
      setBankInfoEdit(info)
    } catch (err) {
      console.error('Banka bilgisi yukleme hatasi:', err)
    }
  }

  const handleBankInfoSave = async () => {
    setBankInfoLoading(true)
    setBankInfoMsg('')
    setBankInfoErr('')
    try {
      await saveBankInfo(bankInfoEdit)
      setBankInfo(bankInfoEdit)
      setBankInfoMsg('Banka bilgileri kaydedildi.')
    } catch (err) {
      setBankInfoErr('Banka bilgileri kaydedilemedi: ' + (err.message || 'Bilinmeyen hata'))
    } finally {
      setBankInfoLoading(false)
    }
  }

  // MUBIS Asistan ses ayarlari
  const [sesAyari, setSesAyari] = useState(VARSAYILAN_SES_AYARI)
  const [sesListesi, setSesListesi] = useState([])
  const [sesLoading, setSesLoading] = useState(false)
  const [sesMsg, setSesMsg] = useState('')
  const [sesErr, setSesErr] = useState('')

  useEffect(() => {
    const temizle = seslerHazirOlunca(setSesListesi)
    return temizle
  }, [])

  const handleSesSave = async () => {
    setSesLoading(true)
    setSesMsg('')
    setSesErr('')
    try {
      await saveSettings({
        ai_voice_gender: sesAyari.tercih,
        ai_voice_name: sesAyari.sesAdi || '',
        ai_voice_rate: String(sesAyari.hiz),
        ai_voice_pitch: String(sesAyari.ton)
      })
      try { localStorage.setItem('mubis_ai_voice_setting', JSON.stringify(sesAyari)) } catch { /* yoksay */ }
      setSesMsg('Asistan ses ayarlari kaydedildi!')
      setTimeout(() => setSesMsg(''), 3000)
    } catch (err) {
      setSesErr('Ayarlar kaydedilemedi: ' + err.message)
    }
    setSesLoading(false)
  }

  const loadCommSettings = async () => {
    try {
      const settings = await getSettings()
      setCommSettings(prev => ({ ...prev, ...settings }))
      setDocPermissions(parseDocumentPermissions(settings.client_document_permissions))
      setDocFolders(parseDocumentFolders(settings.client_document_folders))
      setSesAyari(sesAyariCoz(settings))
      // Odeme kuruluslari
      let enabled = ['paytr']
      try {
        const parsed = typeof settings.payment_providers_enabled === 'string'
          ? JSON.parse(settings.payment_providers_enabled)
          : settings.payment_providers_enabled
        if (Array.isArray(parsed) && parsed.length > 0) enabled = parsed
      } catch { /* varsayilan */
      }
      setEnabledProviders(enabled)
      setActiveProviderLocal(settings.payment_provider || enabled[0] || 'paytr')
    } catch (err) {
      console.error('Iletisim ayarlari yuklenemedi:', err)
    }
  }

  const handleCommSave = async () => {
    setCommLoading(true)
    setCommMsg('')
    setCommErr('')
    try {
      await saveSettings({
        ...commSettings,
        payment_providers_enabled: JSON.stringify(enabledProviders),
        payment_provider: activeProviderLocal
      })
      setCommMsg('Iletisim ayarlari kaydedildi!')
      setTimeout(() => setCommMsg(''), 3000)
    } catch (err) {
      setCommErr('Ayarlar kaydedilemedi: ' + err.message)
    }
    setCommLoading(false)
  }

  const handleProviderSetupSave = async () => {
    setCommLoading(true)
    setCommMsg('')
    setCommErr('')
    try {
      if (enabledProviders.length === 0) {
        // Online odeme kapali
        await saveSettings({ payment_provider: 'eft', payment_providers_enabled: JSON.stringify([]) })
      } else {
        const aktif = enabledProviders.includes(activeProviderLocal) ? activeProviderLocal : enabledProviders[0]
        setActiveProviderLocal(aktif)
        await saveSettings({
          ...commSettings,
          payment_providers_enabled: JSON.stringify(enabledProviders),
          payment_provider: aktif
        })
      }
      setCommMsg('Odeme kurulusu ayarlari kaydedildi!')
      setTimeout(() => setCommMsg(''), 3000)
    } catch (err) {
      setCommErr('Ayarlar kaydedilemedi: ' + err.message)
    }
    setCommLoading(false)
  }

  const handleDocPermissionSave = async () => {
    setDocPermLoading(true)
    setDocPermMsg('')
    setDocPermErr('')
    try {
      await saveSettings({
        ...commSettings,
        client_document_permissions: JSON.stringify(docPermissions)
      })
      setDocPermMsg('Evrak gorunurlugu ayarlari kaydedildi!')
      setTimeout(() => setDocPermMsg(''), 3000)
    } catch (err) {
      setDocPermErr('Ayarlar kaydedilemedi: ' + err.message)
    }
    setDocPermLoading(false)
  }

  const handleFolderSave = async () => {
    setFolderLoading(true)
    setFolderMsg('')
    setFolderErr('')
    try {
      await saveSettings({
        ...commSettings,
        client_document_folders: JSON.stringify(docFolders)
      })
      setFolderMsg('Klasor yapisi kaydedildi!')
      setTimeout(() => setFolderMsg(''), 3000)
    } catch (err) {
      setFolderErr('Klasor yapisi kaydedilemedi: ' + err.message)
    }
    setFolderLoading(false)
  }

  const toggleDocPermission = (category, beyanType = null) => {
    setDocPermissions(prev => {
      const next = { ...prev }
      if (beyanType) {
        const cat = { ...(next[category] || {}) }
        cat[beyanType] = !cat[beyanType]
        next[category] = cat
      } else {
        next[category] = !next[category]
      }
      return next
    })
  }

  useEffect(() => {
    if (profile) {
      setPasswordInterval(profile.password_change_interval || 'never')
    }
  }, [profile])

  useEffect(() => {
    if (user?.role === 'admin' && activeTab === 'users') {
      loadUsers()
    }
  }, [activeTab, user])

  const loadUsers = async () => {
    const officeId = user?.officeId || profile?.office_id
    let query = supabase.from('profiles').select('*').order('created_at', { ascending: false })
    if (officeId) {
      query = query.eq('office_id', officeId)
    }
    const { data } = await query
    if (data) setUsers(data)
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    setPasswordMsg('')
    setPasswordErr('')

    if (newPassword.length < 6) {
      setPasswordErr('Sifre en az 6 karakter olmali')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordErr('Sifreler eslesmedi')
      return
    }

    setPasswordLoading(true)
    
    // Once mevcut sifreyle giris yaparak dogrula
    const { error: verifyErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword
    })
    
    if (verifyErr) {
      setPasswordErr('Mevcut sifre yanlis')
      setPasswordLoading(false)
      return
    }

    const result = await updatePassword(newPassword)
    setPasswordLoading(false)

    if (result.success) {
      // last_password_change guncelle
      await supabase.from('profiles').update({ last_password_change: new Date().toISOString() }).eq('id', user.id)
      setPasswordMsg('Sifre basariyla degistirildi!')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } else {
      setPasswordErr(result.error)
    }
  }

  const handleIntervalSave = async () => {
    setIntervalLoading(true)
    const { error } = await supabase.from('profiles').update({ password_change_interval: passwordInterval }).eq('id', user.id)
    setIntervalLoading(false)
    if (!error) {
      setIntervalMsg('Sifre degistirme sikligi kaydedildi!')
      setTimeout(() => setIntervalMsg(''), 3000)
    }
  }

  const handleResetUserPassword = async () => {
    if (!selectedUser || !newUserPassword) return
    setAdminMsg('')
    setAdminErr('')
    setAdminLoading(true)

    try {
      // Admin kendi sifresiyle islem yapar, secilen kullanicinin sifresini degistiremez direkt
      // Alternatif: Kullaniciya gecici sifre ata (profiles tablosunda isaretle)
      // Supabase client SDK ile baska kullanicinin sifresini degistiremeyiz
      // Cozum: Kullaniciyi silip yeniden olustur veya temp_password flag'i ile
      
      await supabase.from('profiles').update({ 
        temp_password: true,
        password_change_interval: 'never'
      }).eq('id', selectedUser.id)

      setAdminMsg(`${selectedUser.name || selectedUser.email} icin gecici sifre islendi. Kullanici bir sonraki giriste sifre degistirmek zorunda kalacak.`)
      setNewUserPassword('')
      loadUsers()
    } catch (err) {
      setAdminErr(err.message)
    }
    setAdminLoading(false)
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    setAdminMsg('')
    setAdminErr('')
    setCreateLoading(true)

    try {
      const res = await fetch('/api/manage-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newUserForm,
          office_id: user?.officeId || profile?.office_id || null
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kullanici olusturulamadi')

      setAdminMsg(`${newUserForm.name} kullanicisi olusturuldu.`)
      setNewUserForm({ name: '', email: '', password: '', role: 'personel' })
      setShowNewUserForm(false)
      loadUsers()
    } catch (err) {
      setAdminErr(err.message)
    }
    setCreateLoading(false)
  }

  const handleDeleteUser = async (targetUser) => {
    if (!window.confirm(`${targetUser.name || targetUser.email} kullanicisini silmek istediginize emin misiniz?`)) return
    setAdminMsg('')
    setAdminErr('')
    setAdminLoading(true)

    try {
      const res = await fetch(`/api/manage-users?userId=${targetUser.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kullanici silinemedi')

      setAdminMsg(`${targetUser.name || targetUser.email} silindi.`)
      if (selectedUser?.id === targetUser.id) setSelectedUser(null)
      loadUsers()
    } catch (err) {
      setAdminErr(err.message)
    }
    setAdminLoading(false)
  }

  const toggleSelectUser = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    const deletable = users.filter(u => u.id !== user.id).map(u => u.id)
    setSelectedIds(prev => prev.size === deletable.length ? new Set() : new Set(deletable))
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    if (!window.confirm(`${selectedIds.size} kullaniciyi silmek istediginize emin misiniz?`)) return
    setAdminMsg('')
    setAdminErr('')
    setAdminLoading(true)

    try {
      const res = await fetch(`/api/manage-users?userIds=${[...selectedIds].join(',')}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kullanicilar silinemedi')

      setAdminMsg(`${data.deleted || selectedIds.size} kullanici silindi.`)
      setSelectedIds(new Set())
      if (selectedUser && selectedIds.has(selectedUser.id)) setSelectedUser(null)
      loadUsers()
    } catch (err) {
      setAdminErr(err.message)
    }
    setAdminLoading(false)
  }

  const openEditUser = (u) => {
    setEditingUser(u)
    setEditForm({ name: u.name || '', email: u.email || '', role: u.role || 'personel' })
  }

  const handleUpdateUser = async (e) => {
    e.preventDefault()
    setAdminMsg('')
    setAdminErr('')
    setAdminLoading(true)

    try {
      const res = await fetch('/api/manage-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', userId: editingUser.id, ...editForm })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kullanici guncellenemedi')

      setAdminMsg(`${editForm.name || editForm.email} guncellendi.`)
      setEditingUser(null)
      loadUsers()
    } catch (err) {
      setAdminErr(err.message)
    }
    setAdminLoading(false)
  }

  const tabs = [
    { id: 'password', label: 'Sifre Degistir', icon: Lock },
    { id: 'interval', label: 'Sifre Sikligi', icon: Clock },
    { id: 'communication', label: 'Iletisim Ayarlari', icon: MessageCircle },
    ...(user?.role === 'admin' ? [{ id: 'bank', label: 'Banka Bilgileri', icon: Building2 }] : []),
    ...(user?.role === 'admin' ? [{ id: 'payments', label: 'Odeme Kurulusu', icon: CreditCard }] : []),
    { id: 'documents', label: 'Evrak Gorunurlugu', icon: FolderOpen },
    { id: 'folders', label: 'Evrak Klasor Yapisi', icon: FolderTree },
    ...(user?.role === 'admin' ? [{ id: 'assistant', label: 'Asistan Sesi', icon: Volume2 }] : []),
    ...(user?.role === 'admin' ? [{ id: 'users', label: 'Kullanici Yonetimi', icon: Users }] : [])
  ]

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <SettingsIcon className="w-8 h-8 text-yellow-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Ayarlar</h1>
          <p className="text-gray-400 text-sm">Hesap ve guvenlik ayarlari</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 mb-6 bg-blue-950/50 p-1 rounded-xl border border-blue-800/30">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
              activeTab === tab.id ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'text-gray-400 hover:text-white hover:bg-blue-800/30'
            }`}>
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="bg-blue-950/30 rounded-2xl p-6 border border-blue-800/30">
        
        {/* SIFRE DEGISTIR */}
        {activeTab === 'password' && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Sifre Degistir</h2>
            
            {passwordMsg && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-green-300 text-sm">{passwordMsg}</span>
              </div>
            )}
            {passwordErr && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-300 text-sm">{passwordErr}</span>
              </div>
            )}

            <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
              <div>
                <label className="text-gray-400 text-sm block mb-1">Mevcut Sifre</label>
                <div className="relative">
                  <input type={showPasswords ? 'text' : 'password'} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                    className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 pr-10 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500" required />
                  <button type="button" onClick={() => setShowPasswords(!showPasswords)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                    {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">Yeni Sifre</label>
                <input type={showPasswords ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500" 
                  placeholder="En az 6 karakter" required />
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">Yeni Sifre (Tekrar)</label>
                <input type={showPasswords ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500" required />
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-red-400 text-xs mt-1">Sifreler eslesmedi</p>
                )}
              </div>
              <button type="submit" disabled={passwordLoading} className="btn-gold px-6 py-2.5 flex items-center gap-2 disabled:opacity-50">
                {passwordLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Sifreyi Degistir
              </button>
            </form>
          </div>
        )}

        {/* SIFRE SIKLIGI */}
        {activeTab === 'interval' && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Sifre Degistirme Sikligi</h2>
            <p className="text-gray-400 text-sm mb-6">Belirli araliklarla sifre degistirme zorunlulugu ayarlayin.</p>

            {intervalMsg && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-green-300 text-sm">{intervalMsg}</span>
              </div>
            )}

            <div className="max-w-md space-y-4">
              <div>
                <label className="text-gray-400 text-sm block mb-1">Sifre Degistirme Periyodu</label>
                <select value={passwordInterval} onChange={e => setPasswordInterval(e.target.value)}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-yellow-500">
                  <option value="3ay">3 Ay</option>
                  <option value="6ay">6 Ay</option>
                  <option value="never">Hicbir Zaman</option>
                </select>
              </div>
              <button onClick={handleIntervalSave} disabled={intervalLoading} className="btn-gold px-6 py-2.5 flex items-center gap-2 disabled:opacity-50">
                {intervalLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Kaydet
              </button>
            </div>
          </div>
        )}

        {/* ILETISIM AYARLARI */}
        {activeTab === 'communication' && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-yellow-400" />
              Iletisim Ayarlari
            </h2>
            <p className="text-gray-400 text-sm mb-6">WhatsApp ve Mail gonderim ayarlarini buradan yonetin.</p>

            {commMsg && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-green-300 text-sm">{commMsg}</span>
              </div>
            )}
            {commErr && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-300 text-sm">{commErr}</span>
              </div>
            )}

            <div className="space-y-6">
              {/* WhatsApp */}
              <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
                <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-green-400" />
                  WhatsApp Gonderim Ayarlari
                </h3>

                <div className="mb-5">
                  <label className="text-gray-400 text-sm block mb-2">WhatsApp Gonderim Kanali</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                      commSettings.whatsapp_channel !== 'web'
                        ? 'bg-green-500/10 border-green-500/40 text-green-300'
                        : 'bg-blue-900/20 border-blue-700/40 text-gray-400'
                    }`}>
                      <input
                        type="radio"
                        name="whatsapp_channel"
                        value="api"
                        checked={commSettings.whatsapp_channel !== 'web'}
                        onChange={e => setCommSettings({ ...commSettings, whatsapp_channel: e.target.value })}
                        className="mt-1 w-4 h-4 text-green-500 border-blue-700/50 bg-blue-900/30 focus:ring-green-500"
                      />
                      <div>
                        <span className="text-sm font-medium">WhatsApp Business API</span>
                        <p className="text-xs mt-1 opacity-80">Dosyalar mesaja ekinde gonderilir. Phone Number ID ve Access Token gerekir.</p>
                      </div>
                    </label>

                    <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                      commSettings.whatsapp_channel === 'web'
                        ? 'bg-green-500/10 border-green-500/40 text-green-300'
                        : 'bg-blue-900/20 border-blue-700/40 text-gray-400'
                    }`}>
                      <input
                        type="radio"
                        name="whatsapp_channel"
                        value="web"
                        checked={commSettings.whatsapp_channel === 'web'}
                        onChange={e => setCommSettings({ ...commSettings, whatsapp_channel: e.target.value })}
                        className="mt-1 w-4 h-4 text-green-500 border-blue-700/50 bg-blue-900/30 focus:ring-green-500"
                      />
                      <div>
                        <span className="text-sm font-medium">Web.WhatsApp</span>
                        <p className="text-xs mt-1 opacity-80">Kullanici telefonundaki WhatsApp uzerinden gonderilir. Dosyalar link olarak gonderilir.</p>
                      </div>
                    </label>
                  </div>
                </div>

                {commSettings.whatsapp_channel !== 'web' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">Phone Number ID</label>
                    <input
                      type="text"
                      value={commSettings.whatsapp_phone_number_id}
                      onChange={e => setCommSettings({ ...commSettings, whatsapp_phone_number_id: e.target.value })}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                      placeholder="Orn: 123456789012345"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">Access Token</label>
                    <div className="relative">
                      <input
                        type={showToken ? 'text' : 'password'}
                        value={commSettings.whatsapp_access_token}
                        onChange={e => setCommSettings({ ...commSettings, whatsapp_access_token: e.target.value })}
                        className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 pr-10 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                        placeholder="EAA..."
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                      >
                        {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">Template Name</label>
                    <input
                      type="text"
                      value={commSettings.whatsapp_template_name}
                      onChange={e => setCommSettings({ ...commSettings, whatsapp_template_name: e.target.value })}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                      placeholder="beyanname_bildirim"
                    />
                  </div>
                </div>
                )}

                {commSettings.whatsapp_channel === 'web' && (
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-yellow-300 text-xs">
                    Web.WhatsApp seciliyken telefon numarasi gerekmez; gonderim esnasinda yeni sekmede hazir mesaj acilir ve dosya linkleri mesaja eklenir.
                  </div>
                )}
              </div>

              {/* SMTP / Natro Mail */}
              <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
                <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-400" />
                  SMTP Mail Ayarlari (Natro vb.)
                </h3>
                <p className="text-gray-400 text-xs mb-4">Kendi mail sunucunuz uzerinden gonderim yapmak icin SMTP bilgilerinizi girin.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">SMTP Host</label>
                    <input
                      type="text"
                      value={commSettings.smtp_host}
                      onChange={e => setCommSettings({ ...commSettings, smtp_host: e.target.value })}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                      placeholder="Orn: mail.mubiserp.com.tr"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">SMTP Port</label>
                    <input
                      type="number"
                      value={commSettings.smtp_port}
                      onChange={e => setCommSettings({ ...commSettings, smtp_port: e.target.value })}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                      placeholder="587"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">SMTP Kullanici Adi</label>
                    <input
                      type="text"
                      value={commSettings.smtp_user}
                      onChange={e => setCommSettings({ ...commSettings, smtp_user: e.target.value })}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                      placeholder="info@mubiserp.com.tr"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">SMTP Sifre</label>
                    <div className="relative">
                      <input
                        type={showSmtpPass ? 'text' : 'password'}
                        value={commSettings.smtp_pass}
                        onChange={e => setCommSettings({ ...commSettings, smtp_pass: e.target.value })}
                        className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 pr-10 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                        placeholder="Mail hesabi sifresi"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSmtpPass(!showSmtpPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                      >
                        {showSmtpPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">Gonderen Adres (From)</label>
                    <input
                      type="email"
                      value={commSettings.smtp_from}
                      onChange={e => setCommSettings({ ...commSettings, smtp_from: e.target.value })}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                      placeholder="info@mubiserp.com.tr"
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-gray-300 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={commSettings.smtp_secure === 'true'}
                        onChange={e => setCommSettings({ ...commSettings, smtp_secure: e.target.checked ? 'true' : 'false' })}
                        className="w-4 h-4 rounded border-blue-700/50 bg-blue-900/30 text-yellow-500 focus:ring-yellow-500"
                      />
                      SSL/TLS kullan (465 icin isaretli, 587 icin bos)
                    </label>
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">Ödeme Hatırlatması (kaç gün önce)</label>
                    <input
                      type="number"
                      min="0"
                      max="30"
                      value={commSettings.odeme_hatirlatma_gun}
                      onChange={e => setCommSettings({ ...commSettings, odeme_hatirlatma_gun: e.target.value })}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                      placeholder="5"
                    />
                    <p className="text-gray-500 text-xs mt-1">Son ödeme tarihinden bu kadar gün önce müşteriye WhatsApp/e-posta hatırlatması gider. Her dönem için bir kez gönderilir.</p>
                  </div>
                </div>
              </div>

              <button onClick={handleCommSave} disabled={commLoading} className="btn-gold px-6 py-2.5 flex items-center gap-2 disabled:opacity-50">
                {commLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Iletisim Ayarlarini Kaydet
              </button>
            </div>
          </div>
        )}

        {/* BANKA BILGILERI */}
        {activeTab === 'bank' && user?.role === 'admin' && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-yellow-400" />
              Banka Bilgileri
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              Musteri portalinda EFT/Havale ile odeme bolumunde gorunecek muhasebe banka hesap bilgileri.
            </p>

            {bankInfoMsg && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-green-300 text-sm">{bankInfoMsg}</span>
              </div>
            )}
            {bankInfoErr && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-300 text-sm">{bankInfoErr}</span>
              </div>
            )}

            <div className="bg-blue-900/20 rounded-xl p-6 border border-blue-700/30">
              <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-yellow-400" />
                EFT / Havale Hesap Bilgileri
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="text-gray-400 text-sm block mb-1">Banka Adi</label>
                  <input
                    type="text"
                    value={bankInfoEdit.banka || ''}
                    onChange={e => setBankInfoEdit(p => ({ ...p, banka: e.target.value }))}
                    className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                    placeholder="Orn: Garanti Bankasi"
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-sm block mb-1">Hesap Sahibi</label>
                  <input
                    type="text"
                    value={bankInfoEdit.hesapSahibi || ''}
                    onChange={e => setBankInfoEdit(p => ({ ...p, hesapSahibi: e.target.value }))}
                    className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                    placeholder="Orn: Ad Soyad"
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-sm block mb-1">IBAN</label>
                  <input
                    type="text"
                    value={bankInfoEdit.iban || ''}
                    onChange={e => setBankInfoEdit(p => ({ ...p, iban: e.target.value }))}
                    className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                    placeholder="TR00 0000 0000 0000 0000 0000 00"
                  />
                </div>
              </div>
              <button onClick={handleBankInfoSave} disabled={bankInfoLoading} className="btn-gold px-6 py-2.5 flex items-center gap-2 disabled:opacity-50">
                {bankInfoLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Banka Bilgilerini Kaydet
              </button>
            </div>
          </div>
        )}

        {/* ODEME KURULUSU SECIMI */}
        {activeTab === 'payments' && user?.role === 'admin' && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-yellow-400" />
              Odeme Kurulusu
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              Musterilerin kredi karti ile odeme yapacagi odeme kuruluslarini secin. Birden fazla kurulusu etkinlestirebilir, iclerinden aktif olanini belirleyebilirsiniz.
            </p>

            {commMsg && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-green-300 text-sm">{commMsg}</span>
              </div>
            )}
            {commErr && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-300 text-sm">{commErr}</span>
              </div>
            )}

            <div className="space-y-6">
              {/* 1. Adim: Etkin kuruluslar */}
              <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
                <h3 className="text-white font-medium mb-1 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-purple-400" />
                  1. Anlasilan Odeme Kuruluslari
                </h3>
                <p className="text-gray-400 text-xs mb-4">Anlastiginiz odeme kuruluslarini isaretleyin. Isaretlemediginiz takdirde online odeme kapali olur (yalnizca EFT/Havale).</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { id: 'paytr', label: 'PayTR', desc: 'PayTR Link API ile kredi karti odemesi' },
                    { id: 'odeal', label: 'Odeal', desc: 'Odeal Pay-by-Link ile kredi karti odemesi' }
                  ].map(provider => {
                    const isEnabled = enabledProviders.includes(provider.id)
                    return (
                      <label
                        key={provider.id}
                        className={`cursor-pointer rounded-xl border p-4 transition-all ${
                          isEnabled
                            ? 'bg-purple-500/10 border-purple-500/50'
                            : 'bg-blue-900/20 border-blue-700/30 hover:border-blue-600/50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={() => {
                              setEnabledProviders(prev => {
                                if (prev.includes(provider.id)) {
                                  return prev.filter(p => p !== provider.id)
                                }
                                return [...prev, provider.id]
                              })
                            }}
                            className="mt-1 w-4 h-4 rounded border-blue-700/50 bg-blue-900/30 text-purple-500 focus:ring-purple-500"
                          />
                          <div>
                            <p className="text-white font-medium text-sm">{provider.label}</p>
                            <p className="text-gray-400 text-xs mt-0.5">{provider.desc}</p>
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>

                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-yellow-300 text-xs mt-4">
                  <strong>Bilgi:</strong> Etkinlestirilen kurulusun API anahtarlari Vercel ortam degiskenlerinde tanimli olmalidir.
                  PayTR icin <code>PAYTR_MERCHANT_ID, PAYTR_MERCHANT_KEY, PAYTR_MERCHANT_SALT</code>;
                  Odeal icin <code>ODEAL_API_KEY, ODEAL_SECRET_KEY</code> gerekir.
                  Yeni bir odeme kurulusu ile anlasildiginda entegrasyonu eklenir ve bu listede gorunur hale gelir.
                </div>
              </div>

              {/* 2. Adim: Aktif kurulus secimi */}
              {enabledProviders.length > 0 ? (
                <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
                  <h3 className="text-white font-medium mb-1 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    2. Aktif Odeme Kurulusu
                  </h3>
                  <p className="text-gray-400 text-xs mb-4">Musteriler kredi karti ile odeme yaparken hangi kurulusu kullanacak? Icindeki bir tanesini secin.</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {enabledProviders.map(providerId => {
                      const meta = { paytr: 'PayTR', odeal: 'Odeal' }[providerId] || providerId
                      return (
                        <label
                          key={providerId}
                          className={`cursor-pointer rounded-xl border p-4 transition-all ${
                            activeProviderLocal === providerId
                              ? 'bg-green-500/10 border-green-500/50'
                              : 'bg-blue-900/20 border-blue-700/30 hover:border-blue-600/50'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="radio"
                              name="active_payment_provider"
                              value={providerId}
                              checked={activeProviderLocal === providerId}
                              onChange={() => setActiveProviderLocal(providerId)}
                              className="mt-1 w-4 h-4 text-green-500 border-blue-700/50 bg-blue-900/30 focus:ring-green-500"
                            />
                            <div>
                              <p className="text-white font-medium text-sm">{meta}</p>
                              <p className="text-gray-400 text-xs mt-0.5">Musteri odemeleri bu kurulus uzerinden alinir</p>
                            </div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="bg-gray-500/10 border border-gray-500/30 rounded-xl p-4 text-gray-300 text-sm">
                  Hicbir odeme kurulusu etkin degil. Musteriler yalnizca <strong>EFT/Havale</strong> ile odeme yapabilir
                  (Banka Bilgileri sekmesindeki hesap bilgileri musteride gorunur).
                </div>
              )}
            </div>

            <button onClick={handleProviderSetupSave} disabled={commLoading} className="btn-gold px-6 py-2.5 flex items-center gap-2 disabled:opacity-50 mt-6">
              {commLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Odeme Kurulusu Ayarlarini Kaydet
            </button>
          </div>
        )}

        {/* EVRAK GORUNURLUGU */}
        {activeTab === 'documents' && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-yellow-400" />
              Evrak Gorunurlugu
            </h2>
            <p className="text-gray-400 text-sm mb-6">Musteri portalinda hangi evrak turlerinin gorunecegini belirleyin.</p>

            {docPermMsg && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-green-300 text-sm">{docPermMsg}</span>
              </div>
            )}
            {docPermErr && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-300 text-sm">{docPermErr}</span>
              </div>
            )}

            <div className="space-y-6">
              {/* Beyannameler */}
              <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
                <h3 className="text-white font-medium mb-3">📄 Beyannameler</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { id: 'kdv', label: 'KDV' },
                    { id: 'kdv2', label: 'KDV2' },
                    { id: 'muhtasar', label: 'Muhtasar' },
                    { id: 'sgk', label: 'SGK' },
                    { id: 'gecici_vergi', label: 'Gecici Vergi' },
                    { id: 'kurumlar_vergi', label: 'Kurumlar Vergisi' },
                    { id: 'gelir_vergi', label: 'Gelir Vergisi' },
                    { id: 'edefter', label: 'e-Defter' },
                    { id: 'muhtasar_3aylik', label: 'Muhtasar (3 Aylik)' }
                  ].map(b => (
                    <label key={b.id} className="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!docPermissions?.beyanname?.[b.id]}
                        onChange={() => toggleDocPermission('beyanname', b.id)}
                        className="w-4 h-4 rounded border-blue-700/50 bg-blue-900/30 text-yellow-500 focus:ring-yellow-500"
                      />
                      <span>{b.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Tahakkuklar */}
              <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
                <h3 className="text-white font-medium mb-3">💰 Tahakkuklar</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { id: 'kdv', label: 'KDV' },
                    { id: 'kdv2', label: 'KDV2' },
                    { id: 'muhtasar', label: 'Muhtasar' },
                    { id: 'sgk', label: 'SGK' },
                    { id: 'gecici_vergi', label: 'Gecici Vergi' },
                    { id: 'kurumlar_vergi', label: 'Kurumlar Vergisi' },
                    { id: 'gelir_vergi', label: 'Gelir Vergisi' },
                    { id: 'edefter', label: 'e-Defter' },
                    { id: 'muhtasar_3aylik', label: 'Muhtasar (3 Aylik)' }
                  ].map(b => (
                    <label key={b.id} className="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!docPermissions?.tahakkuk?.[b.id]}
                        onChange={() => toggleDocPermission('tahakkuk', b.id)}
                        className="w-4 h-4 rounded border-blue-700/50 bg-blue-900/30 text-yellow-500 focus:ring-yellow-500"
                      />
                      <span>{b.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Diger evraklar */}
              <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
                <h3 className="text-white font-medium mb-3">📁 Diger Evraklar</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { id: 'mizan', label: 'Mizan' },
                    { id: 'sigorta_tahakkuk', label: 'Sigorta Tahakkuk' },
                    { id: 'hizmet_listesi', label: 'Hizmet Listesi' },
                    { id: 'bordro', label: 'Bordro' },
                    { id: 'gelir_beyani', label: 'Gelir Beyani' },
                    { id: 'gecici_vergi', label: 'Gecici Vergi' },
                    { id: 'vergi_levhasi', label: 'Vergi Levhasi' },
                    { id: 'mali_evraklar', label: 'Mali Evraklar' }
                  ].map(item => (
                    <label key={item.id} className="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!docPermissions?.[item.id]}
                        onChange={() => toggleDocPermission(item.id)}
                        className="w-4 h-4 rounded border-blue-700/50 bg-blue-900/30 text-yellow-500 focus:ring-yellow-500"
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <button onClick={handleDocPermissionSave} disabled={docPermLoading} className="btn-gold px-6 py-2.5 flex items-center gap-2 disabled:opacity-50 mt-6">
              {docPermLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Evrak Gorunurlugunu Kaydet
            </button>
          </div>
        )}

        {/* EVRAK KLASOR YAPISI */}
        {activeTab === 'folders' && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-2">Evrak Klasör Yapısı</h2>
            <p className="text-gray-400 text-sm mb-6">Müşteri portalındaki "Evraklarım" ağacında görünecek klasörleri, alt klasörleri ve her klasördeki içerikleri buradan tasarlayın. Bu yapı tüm müşterilere uygulanır.</p>

            {folderMsg && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-green-300 text-sm">{folderMsg}</span>
              </div>
            )}
            {folderErr && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-300 text-sm">{folderErr}</span>
              </div>
            )}

            <FolderStructureEditor value={docFolders} onChange={setDocFolders} />

            <button onClick={handleFolderSave} disabled={folderLoading} className="btn-gold px-6 py-2.5 flex items-center gap-2 disabled:opacity-50 mt-6">
              {folderLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Klasör Yapısını Kaydet
            </button>
          </div>
        )}

        {/* MUBIS ASISTAN SESI (Admin) */}
        {activeTab === 'assistant' && user?.role === 'admin' && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-yellow-400" />
              MUBİS Asistan Konuşma Sesi
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              Asistanın sesli cevap verirken kullanacağı sesi buradan seçin. Ayar tüm kullanıcılar için geçerlidir.
            </p>

            {sesMsg && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-green-300 text-sm">{sesMsg}</span>
              </div>
            )}
            {sesErr && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-300 text-sm">{sesErr}</span>
              </div>
            )}
            {!sesDestekleniyor() && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 mb-4 text-yellow-300 text-sm">
                Bu tarayıcı sesli okumayı desteklemiyor. Chrome veya Edge önerilir.
              </div>
            )}

            {/* Cinsiyet secimi */}
            <label className="block text-gray-300 text-sm mb-2">Ses Tipi</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              {SES_TERCIHLERI.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSesAyari(prev => ({ ...prev, tercih: opt.id, sesAdi: '' }))}
                  className={`px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                    sesAyari.tercih === opt.id
                      ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
                      : 'bg-blue-950/40 text-gray-300 border-blue-800/40 hover:border-blue-600/60'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Sistemdeki sesler */}
            <label className="block text-gray-300 text-sm mb-2">
              Tarayıcı Sesi {sesListesi.length > 0 && <span className="text-gray-500">({sesListesi.length} ses bulundu)</span>}
            </label>
            <select
              value={sesAyari.sesAdi || ''}
              onChange={e => setSesAyari(prev => ({ ...prev, sesAdi: e.target.value }))}
              className="input-field w-full mb-2"
            >
              <option value="">Otomatik seç ({sesSec(sesAyari)?.name || 'ses bulunamadı'})</option>
              <optgroup label="Türkçe sesler">
                {sesListesi.filter(v => (v.lang || '').toLowerCase().startsWith('tr')).map(v => (
                  <option key={v.name} value={v.name}>
                    {v.name} {sesCinsiyeti(v) === 'kadin' ? '(kadın)' : sesCinsiyeti(v) === 'erkek' ? '(erkek)' : ''}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Diğer diller (Türkçe telaffuz bozuk olabilir)">
                {sesListesi.filter(v => !(v.lang || '').toLowerCase().startsWith('tr')).map(v => (
                  <option key={v.name} value={v.name}>
                    {v.name} - {v.lang} {sesCinsiyeti(v) === 'kadin' ? '(kadın)' : sesCinsiyeti(v) === 'erkek' ? '(erkek)' : ''}
                  </option>
                ))}
              </optgroup>
            </select>
            <p className="text-gray-500 text-xs mb-4">
              Belirli bir ses seçerseniz cinsiyet tercihi yerine o ses kullanılır. Liste kullanıcının tarayıcısına göre değişebilir.
            </p>

            {/* Kadin sesi yoksa uyari */}
            {sesListesi.length > 0 && !cinsiyetSesiVar('kadin') && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3.5 mb-6 text-blue-200 text-xs leading-relaxed">
                <strong className="text-white block mb-1">Sisteminizde Türkçe kadın sesi yüklü değil.</strong>
                Kadın sesi seçtiğinizde MUBİS mevcut sesi daha ince tonda okur. Gerçek kadın sesi için:
                <br />• <strong>Microsoft Edge</strong> tarayıcısında "Microsoft Emel Online (Natural) - Turkish" sesi hazır gelir.
                <br />• Windows'ta <em>Ayarlar → Saat ve Dil → Konuşma → Ses ekle</em> ile Türkçe ses paketi kurabilirsiniz.
                <br />• Ya da yukarıdaki listeden farklı dilde bir kadın sesi seçebilirsiniz.
              </div>
            )}

            {/* Hiz ve ton */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-gray-300 text-sm mb-2">Konuşma Hızı: {Number(sesAyari.hiz).toFixed(2)}x</label>
                <input
                  type="range" min="0.6" max="1.6" step="0.02"
                  value={sesAyari.hiz}
                  onChange={e => setSesAyari(prev => ({ ...prev, hiz: parseFloat(e.target.value) }))}
                  className="w-full accent-yellow-400"
                />
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-2">Ses Tonu: {Number(sesAyari.ton).toFixed(2)}</label>
                <input
                  type="range" min="0.5" max="1.8" step="0.02"
                  value={sesAyari.ton}
                  onChange={e => setSesAyari(prev => ({ ...prev, ton: parseFloat(e.target.value) }))}
                  className="w-full accent-yellow-400"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => konus('Merhaba, ben MUBİS yapay zekâ asistanı. Vergi ve SGK sorularınızda yanınızdayım.', sesAyari)}
                className="px-5 py-2.5 rounded-xl bg-blue-800/40 border border-blue-700/50 text-white text-sm font-medium hover:bg-blue-800/60 flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                Sesi Dinle
              </button>
              <button onClick={handleSesSave} disabled={sesLoading} className="btn-gold px-6 py-2.5 flex items-center gap-2 disabled:opacity-50">
                {sesLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Ses Ayarlarını Kaydet
              </button>
            </div>
          </div>
        )}

        {/* KULLANICI YONETIMI (Admin) */}
        {activeTab === 'users' && user?.role === 'admin' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Kullanici Yonetimi</h2>
              <div className="flex items-center gap-2">
                {selectedIds.size > 0 && (
                  <button onClick={handleBulkDelete} disabled={adminLoading}
                    className="bg-red-600/80 hover:bg-red-500 text-white px-4 py-2 text-sm rounded-xl flex items-center gap-2 disabled:opacity-50">
                    <Trash2 className="w-4 h-4" />
                    Secilenleri Sil ({selectedIds.size})
                  </button>
                )}
                <button onClick={() => setShowNewUserForm(!showNewUserForm)} className="btn-gold px-4 py-2 text-sm flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Yeni Kullanici Ekle
                </button>
              </div>
            </div>
            <p className="text-gray-400 text-sm mb-3">Personel ve admin hesaplari ekleyin, sifre durumlarini yonetin. Onay islemlerinde buradaki isim gorunur.</p>
            <div className="bg-blue-900/25 border border-blue-700/40 rounded-xl p-3 mb-6 flex items-start gap-3">
              <Users className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
              <p className="text-gray-300 text-sm">
                Bu bolum sadece <strong className="text-white">personel ve admin</strong> hesaplari icindir.
                Musteri eklemek icin{' '}
                <Link to="/admin/clients/new" className="text-yellow-400 font-semibold hover:underline">Yeni Musteri Ekle</Link>{' '}
                sayfasini kullanin. Musteri kaydedildiginde portal giris hesabi otomatik olusur
                (kullanici adi: VKN/TC, gecici sifre: <strong className="text-white">123456</strong>).
              </p>
            </div>

            {showNewUserForm && (
              <form onSubmit={handleCreateUser} className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-4 mb-6 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">Ad (ornegin: Koray, Sinem)</label>
                    <input type="text" required value={newUserForm.name} onChange={e => setNewUserForm({ ...newUserForm, name: e.target.value })}
                      placeholder="Kisa ad"
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-yellow-500" />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">E-posta</label>
                    <input type="email" required value={newUserForm.email} onChange={e => setNewUserForm({ ...newUserForm, email: e.target.value })}
                      placeholder="ornek@mubis.com"
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-yellow-500" />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">Gecici Sifre</label>
                    <input type="text" required minLength={6} value={newUserForm.password} onChange={e => setNewUserForm({ ...newUserForm, password: e.target.value })}
                      placeholder="En az 6 karakter"
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-yellow-500" />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">Rol</label>
                    <select value={newUserForm.role} onChange={e => setNewUserForm({ ...newUserForm, role: e.target.value })}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-yellow-500">
                      <option value="personel">Personel</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button type="submit" disabled={createLoading} className="btn-gold px-6 py-2.5 flex items-center gap-2 disabled:opacity-50">
                    {createLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Kullanici Olustur
                  </button>
                  <button type="button" onClick={() => setShowNewUserForm(false)} className="text-gray-400 hover:text-white text-sm px-3 py-2">
                    Vazgec
                  </button>
                </div>
                <p className="text-gray-500 text-xs">Kullanici ilk giriste sifresini degistirmek zorunda kalir. Admin ve personel admin paneline kendi e-posta ve sifresiyle girer.</p>
              </form>
            )}

            {adminMsg && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-green-300 text-sm">{adminMsg}</span>
              </div>
            )}
            {adminErr && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-300 text-sm">{adminErr}</span>
              </div>
            )}

            <div className="space-y-3">
              {users.filter(u => u.id !== user.id).length > 0 && (
                <label className="flex items-center gap-2 px-1 text-gray-400 text-xs cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedIds.size > 0 && selectedIds.size === users.filter(u => u.id !== user.id).length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded accent-yellow-500"
                  />
                  Tumunu Sec
                </label>
              )}
              {users.map(u => (
                <div key={u.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                  selectedUser?.id === u.id ? 'border-yellow-500/50 bg-yellow-500/10' : 'border-blue-700/30 bg-blue-900/20 hover:bg-blue-800/30'
                }`} onClick={() => setSelectedUser(u)}>
                  <div className="flex items-center gap-3">
                    {u.id !== user.id && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(u.id)}
                        onChange={() => toggleSelectUser(u.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 rounded accent-yellow-500 cursor-pointer"
                      />
                    )}
                    <div>
                      <div className="text-white text-sm font-medium">{u.name || u.email}</div>
                      <div className="text-gray-400 text-xs">{u.email} - {u.role}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {u.temp_password && (
                      <span className="bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded text-xs">Gecici Sifre</span>
                    )}
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      u.role === 'admin' ? 'bg-yellow-500/20 text-yellow-400' : u.role === 'client' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'
                    }`}>{u.role}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditUser(u) }}
                      className="text-blue-400 hover:text-blue-300 p-1.5 rounded-lg hover:bg-blue-500/20"
                      title="Kullaniciyi duzenle"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    {u.id !== user.id && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteUser(u) }}
                        className="text-red-400 hover:text-red-300 p-1.5 rounded-lg hover:bg-red-500/20"
                        title="Kullaniciyi sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {editingUser && (
              <form onSubmit={handleUpdateUser} className="mt-6 p-4 bg-blue-900/20 rounded-xl border border-blue-700/30 space-y-3">
                <h3 className="text-white text-sm font-medium">{editingUser.name || editingUser.email} - Duzenle</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input type="text" required value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="Ad"
                    className="bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-yellow-500" />
                  <input type="email" required value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                    placeholder="E-posta"
                    className="bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-yellow-500" />
                  <select value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                    className="bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-yellow-500">
                    <option value="personel">Personel</option>
                    <option value="admin">Admin</option>
                    <option value="client">Client</option>
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <button type="submit" disabled={adminLoading} className="btn-gold px-5 py-2 text-sm flex items-center gap-2 disabled:opacity-50">
                    {adminLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Kaydet
                  </button>
                  <button type="button" onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-white text-sm px-3 py-2">
                    Vazgec
                  </button>
                </div>
              </form>
            )}

            {selectedUser && selectedUser.id !== user.id && (
              <div className="mt-6 p-4 bg-blue-900/20 rounded-xl border border-blue-700/30">
                <h3 className="text-white text-sm font-medium mb-3">
                  {selectedUser.name || selectedUser.email} - Sifre Islemleri
                </h3>
                <button onClick={handleResetUserPassword} disabled={adminLoading}
                  className="btn-gold px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-50">
                  {adminLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Gecici Sifre Zorunlulugu Ekle
                </button>
                <p className="text-gray-500 text-xs mt-2">Kullanici bir sonraki giriste sifre degistirmek zorunda kalacak.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
