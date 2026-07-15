import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LogIn, User, Lock, AlertCircle, Eye, EyeOff, CheckCircle, ArrowLeft, Mail } from 'lucide-react'

export default function Login() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [mode, setMode] = useState('login') // login | forgot | forgot-sent
  const [resetEmail, setResetEmail] = useState('')
  const { login, resetPassword } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await login(identifier, password)
    setLoading(false)

    if (result.success) {
      // Gecici sifre ise sifre degistirme sayfasina yonlendir
      if (result.tempPassword) {
        navigate('/sifre-degistir')
        return
      }
      
      if (result.user.role === 'admin' || result.user.role === 'personel') {
        navigate('/admin')
      } else {
        navigate('/portal')
      }
    } else {
      if (result.error.includes('Invalid login')) {
        setError('Gecersiz kullanici adi veya sifre')
      } else {
        setError(result.error)
      }
    }
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await resetPassword(resetEmail)
    setLoading(false)

    if (result.success) {
      setMode('forgot-sent')
    } else {
      setError(result.error)
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-32 h-32 mx-auto mb-4 rounded-2xl overflow-hidden bg-[#0a1628] p-2">
            <img src="/logo.png" alt="MUBiS ERP" className="w-full h-full object-contain" />
          </div>
          <p className="text-gray-400 mt-2">Mali Musavirin Dijital Calisma Masasi</p>
        </div>

        <div className="bg-blue-950/30 backdrop-blur-sm rounded-2xl p-8 border border-blue-800/30">
          
          {/* ---- LOGIN MODU ---- */}
          {mode === 'login' && (
            <>
              <h3 className="text-xl font-semibold text-white mb-6 text-center">Giris Yap</h3>
              
              {error && (
                <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 mb-6 flex items-center space-x-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <span className="text-red-300 text-sm">{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="text-gray-400 text-sm block mb-2">Email veya TC / Vergi No</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 transition-colors"
                      placeholder="ornek@email.com veya 12345678901" required />
                  </div>
                  <p className="text-gray-600 text-[10px] mt-1">Admin: email adresi | Musteri: TC veya Vergi No</p>
                </div>

                <div>
                  <label className="text-gray-400 text-sm block mb-2">Sifre</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-3 pl-10 pr-12 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 transition-colors"
                      placeholder="********" required />
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
                      <span>Giris Yap</span>
                    </>
                  )}
                </button>
              </form>

              <div className="mt-4 text-center">
                <button onClick={() => { setMode('forgot'); setError('') }} className="text-yellow-400/80 hover:text-yellow-400 text-sm transition-colors">
                  Sifremi Unuttum
                </button>
              </div>
            </>
          )}

          {/* ---- SIFREMI UNUTTUM MODU ---- */}
          {mode === 'forgot' && (
            <>
              <button onClick={() => { setMode('login'); setError('') }} className="text-gray-400 hover:text-white flex items-center gap-1 text-sm mb-4">
                <ArrowLeft className="w-4 h-4" /> Girise Don
              </button>
              <h3 className="text-xl font-semibold text-white mb-2">Sifre Sifirlama</h3>
              <p className="text-gray-400 text-sm mb-6">Email adresinizi veya TC/VKN numaranizi girin. Sifre sifirlama baglantisi gonderilecek.</p>
              
              {error && (
                <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <span className="text-red-300 text-sm">{error}</span>
                </div>
              )}

              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input type="text" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)}
                    className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                    placeholder="Email veya TC / Vergi No" required />
                </div>
                <button type="submit" disabled={loading}
                  className="btn-gold w-full py-3 flex items-center justify-center gap-2 disabled:opacity-50">
                  {loading ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <Mail className="w-5 h-5" />}
                  Sifirlama Baglantisi Gonder
                </button>
              </form>
            </>
          )}

          {/* ---- SIFIRLAMA GONDERILDI ---- */}
          {mode === 'forgot-sent' && (
            <div className="text-center py-4">
              <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">Email Gonderildi!</h3>
              <p className="text-gray-400 text-sm mb-6">Sifre sifirlama baglantisi email adresinize gonderildi. Lutfen email kutunuzu kontrol edin.</p>
              <button onClick={() => { setMode('login'); setError('') }} className="btn-gold px-8 py-3">
                Giris Sayfasina Don
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
