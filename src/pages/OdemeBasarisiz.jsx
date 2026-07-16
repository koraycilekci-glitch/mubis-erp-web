import { useNavigate } from 'react-router-dom'
import { XCircle } from 'lucide-react'

export default function OdemeBasarisiz() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <XCircle className="w-20 h-20 text-red-400 mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-white mb-2">Odeme Basarisiz</h1>
        <p className="text-gray-400 mb-6">Odeme islemi tamamlanamadi. Lutfen tekrar deneyin.</p>
        <button onClick={() => navigate('/portal')} className="bg-yellow-500 text-blue-950 px-8 py-3 rounded-xl font-semibold hover:bg-yellow-400 transition-colors">
          Portale Don
        </button>
      </div>
    </div>
  )
}
