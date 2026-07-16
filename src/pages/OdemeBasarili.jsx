import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle } from 'lucide-react'

export default function OdemeBasarili() {
  const navigate = useNavigate()

  useEffect(() => {
    const timer = setTimeout(() => navigate('/portal'), 5000)
    return () => clearTimeout(timer)
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <CheckCircle className="w-20 h-20 text-green-400 mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-white mb-2">Odeme Basarili!</h1>
        <p className="text-gray-400 mb-6">Odemeniz basariyla alindi. Tesekkur ederiz.</p>
        <p className="text-gray-500 text-sm mb-4">5 saniye icinde portale yonlendirileceksiniz...</p>
        <button onClick={() => navigate('/portal')} className="bg-yellow-500 text-blue-950 px-8 py-3 rounded-xl font-semibold hover:bg-yellow-400 transition-colors">
          Portale Don
        </button>
      </div>
    </div>
  )
}
