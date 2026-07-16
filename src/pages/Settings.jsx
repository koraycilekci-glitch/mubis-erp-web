import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Settings as SettingsIcon, Lock, Clock, Users, Eye, EyeOff, CheckCircle, AlertCircle, Save, RefreshCw } from 'lucide-react'

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
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
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

  const tabs = [
    { id: 'password', label: 'Sifre Degistir', icon: Lock },
    { id: 'interval', label: 'Sifre Sikligi', icon: Clock },
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

        {/* KULLANICI YONETIMI (Admin) */}
        {activeTab === 'users' && user?.role === 'admin' && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Kullanici Yonetimi</h2>
            <p className="text-gray-400 text-sm mb-6">Kullanicilarin sifre durumlarini yonetin.</p>

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
              {users.map(u => (
                <div key={u.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                  selectedUser?.id === u.id ? 'border-yellow-500/50 bg-yellow-500/10' : 'border-blue-700/30 bg-blue-900/20 hover:bg-blue-800/30'
                }`} onClick={() => setSelectedUser(u)}>
                  <div>
                    <div className="text-white text-sm font-medium">{u.name || u.email}</div>
                    <div className="text-gray-400 text-xs">{u.email} - {u.role}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {u.temp_password && (
                      <span className="bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded text-xs">Gecici Sifre</span>
                    )}
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      u.role === 'admin' ? 'bg-yellow-500/20 text-yellow-400' : u.role === 'client' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'
                    }`}>{u.role}</span>
                  </div>
                </div>
              ))}
            </div>

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
