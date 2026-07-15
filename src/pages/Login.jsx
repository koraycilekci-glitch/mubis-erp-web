import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LogIn, Mail, Lock, AlertCircle, User, Shield, Eye, EyeOff } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    setTimeout(() => {
      const result = login(email, password)
      setLoading(false)

      if (result.success) {
        if (result.user.role === 'admin') {
          navigate('/admin')
        } else {
          navigate('/portal')
        }
      } else {
        setError(result.error)
      }
    }, 800)
  }

  const fillAdmin = () => {
    setEmail('admin')
    setPassword('admin123')
    setError('')
  }

  const fillClient = () => {
    setEmail('musteri@firma.com')
    setPassword('musteri123')
    setError('')
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-yellow-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">M</span>
          </div>
          <h2 className="text-3xl font-bold text-white">MUBİS ERP</h2>
          <p className="text-gray-400 mt-2">Mali Müşavirin Dijital Çalışma Masası</p>
        </div>

        {/* Hızlı Doldurma Butonları */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            onClick={fillAdmin}
            type="button"
            className="bg-gradient-to-br from-blue-600 to-blue-800 hover:from-blue-500 hover:to-blue-700 text-white rounded-2xl p-4 transition-all hover:scale-105 border border-blue-500/30"
          >
            <Shield className="w-8 h-8 mx-auto mb-2" />
            <span className="font-semibold text-sm">Admin Bilgilerini Doldur</span>
            <span className="text-blue-300 text-xs block mt-1">Koray Bey</span>
          </button>
          <button
            onClick={fillClient}
            type="button"
            className="bg-gradient-to-br from-yellow-600 to-yellow-800 hover:from-yellow-500 hover:to-yellow-700 text-white rounded-2xl p-4 transition-all hover:scale-105 border border-yellow-500/30"
          >
            <User className="w-8 h-8 mx-auto mb-2" />
            <span className="font-semibold text-sm">Müşteri Bilgilerini Doldur</span>
            <span className="text-yellow-300 text-xs block mt-1">Ahmet Yılmaz</span>
          </button>
        </div>

        <div className="flex items-center mb-6">
          <div className="flex-1 border-t border-blue-800/50"></div>
          <span className="px-4 text-gray-500 text-sm">giriş bilgileri</span>
          <div className="flex-1 border-t border-blue-800/50"></div>
        </div>

        <div className="bg-blue-950/30 backdrop-blur-sm rounded-2xl p-8 border border-blue-800/30">
          <h3 className="text-xl font-semibold text-white mb-6 text-center">Giriş Yap</h3>
          
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 mb-6 flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <span className="text-red-300 text-sm">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-gray-400 text-sm block mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input type="text" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 transition-colors"
                  placeholder="ornek@email.com" required />
              </div>
            </div>

            <div>
              <label className="text-gray-400 text-sm block mb-2">Şifre</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-3 pl-10 pr-12 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 transition-colors"
                  placeholder="••••••••" required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="btn-gold w-full py-3 text-lg flex items-center justify-center space-x-2 disabled:opacity-50">
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  <span>Giriş Yap</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}