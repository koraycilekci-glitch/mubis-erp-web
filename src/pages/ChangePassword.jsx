import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle, Shield } from 'lucide-react'

export default function ChangePassword() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const { updatePassword, user, needsPasswordChange } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (newPassword.length < 6) {
      setError('Sifre en az 6 karakter olmalidir')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Sifreler uyusmuyor')
      return
    }

    setLoading(true)
    const result = await updatePassword(newPassword)
    setLoading(false)

    if (result.success) {
      setSuccess(true)
      setTimeout(() => {
        if (user?.role === 'admin' || user?.role === 'personel') {
          navigate('/admin')
        } else {
          navigate('/portal')
        }
      }, 2000)
    } else {
      setError(result.error)
    }
  }

  if (success) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <CheckCircle className="w-20 h-20 text-green-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Sifreniz Guncellendi!</h2>
          <p className="text-gray-400">Yonlendiriliyorsunuz...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white">
            {needsPasswordChange ? 'Yeni Sifre Olusturun' : 'Sifre Degistir'}
          </h2>
          {needsPasswordChange && (
            <p className="text-yellow-400/80 mt-2 text-sm">
              Ilk giris icin gecici sifreniz kullanildi. Guvenliginiz icin yeni bir sifre olusturun.
            </p>
          )}
        </div>

        <div className="bg-blue-950/30 backdrop-blur-sm rounded-2xl p-8 border border-blue-800/30">
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 mb-6 flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <span className="text-red-300 text-sm">{error}</span>
            </div>
          )}

          {user && (
            <div className="bg-blue-900/30 rounded-xl p-3 mb-6 text-center">
              <span className="text-gray-400 text-sm">Giris yapan: </span>
              <span className="text-white text-sm font-medium">{user.name || user.email}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-gray-400 text-sm block mb-2">Yeni Sifre</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input type={showPassword ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-3 pl-10 pr-12 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 transition-colors"
                  placeholder="En az 6 karakter" required minLength={6} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-gray-400 text-sm block mb-2">Yeni Sifre (Tekrar)</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 transition-colors"
                  placeholder="Sifrenizi tekrar girin" required minLength={6} />
              </div>
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-red-400 text-xs mt-1">Sifreler uyusmuyor</p>
              )}
              {confirmPassword && newPassword === confirmPassword && confirmPassword.length >= 6 && (
                <p className="text-green-400 text-xs mt-1">Sifreler uyusuyor</p>
              )}
            </div>

            <button type="submit" disabled={loading || newPassword.length < 6 || newPassword !== confirmPassword}
              className="btn-gold w-full py-3 text-lg flex items-center justify-center space-x-2 disabled:opacity-50">
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <>
                  <Lock className="w-5 h-5" />
                  <span>Sifreyi Guncelle</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
