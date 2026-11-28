import { useMemo, useState } from 'react'
import { Receipt, ChevronDown } from 'lucide-react'
import { useClients } from '../hooks/useClients'
import { clientDisplayName, sortClients } from '../utils/clientDisplay'
import KdvDokumTab from '../components/KdvDokumTab'

// 2.7.522: KDV Dökümleri artık bağımsız sayfa — müşteri kartından taşındı.
// Müşteri seçimi burada; yıl/ay seçimi KdvDokumTab içinde çalışır.
export default function KdvDokumler() {
  const { clients } = useClients()
  const [secili, setSecili] = useState('')

  const sirali = useMemo(() => sortClients(clients), [clients])

  const musteri = sirali.find(c => String(c.id) === String(secili))

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-6">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 rounded-xl bg-yellow-400 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-blue-950" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">KDV Dökümleri</h1>
              <p className="text-xs text-gray-400">POS hasilat, KDV 109/110 ve gümrük KDV dökümleri</p>
            </div>
          </div>
          <div className="relative sm:w-80">
            <select
              value={secili}
              onChange={(e) => setSecili(e.target.value)}
              className="w-full appearance-none bg-blue-900/60 border border-blue-700/50 rounded-xl pl-4 pr-10 py-2.5 text-white text-sm focus:outline-none focus:border-yellow-400"
            >
              <option value="">Müşteri seçin…</option>
              {sirali.map(c => (
                <option key={c.id} value={c.id}>{clientDisplayName(c)}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {musteri ? (
          <KdvDokumTab key={musteri.id} clientId={musteri.id} oranDokumuGoster />
        ) : (
          <div className="bg-blue-900/30 border border-blue-700/30 rounded-2xl p-10 text-center">
            <Receipt className="w-12 h-12 text-blue-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Dökümleri görmek için yukarıdan bir müşteri seçin.</p>
            <p className="text-gray-500 text-xs mt-1">Yıl ve ay seçimi müşteri seçtikten sonra yapılır.</p>
          </div>
        )}
      </div>
    </div>
  )
}
