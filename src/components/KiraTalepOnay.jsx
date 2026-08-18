import { useState, useMemo } from 'react'
import { Clock, CheckCircle, XCircle, RefreshCw, TrendingUp } from 'lucide-react'
import { parseKiraBilgisi, bekleyenTalep, paraTR, tarihTR } from '../utils/kiraUtils'
import { kiraTalebiOnayla, kiraTalebiReddet } from '../services/kiraService'
import { useAuth } from '../context/AuthContext'

/**
 * Admin (mali musavir) tarafinda musteriden gelen kira yenileme bildirimini
 * onaylama / reddetme karti. Onaylaninca kira tutari ve kontrat tarihleri guncellenir.
 */
export default function KiraTalepOnay({ client, onGuncellendi }) {
  const { user } = useAuth()
  const kb = useMemo(() => parseKiraBilgisi(client), [client])
  const talep = bekleyenTalep(kb)

  const [tutar, setTutar] = useState('')
  const [baslangic, setBaslangic] = useState('')
  const [bitis, setBitis] = useState('')
  const [islem, setIslem] = useState(false)
  const [redModu, setRedModu] = useState(false)
  const [redNedeni, setRedNedeni] = useState('')
  const [hata, setHata] = useState('')

  if (!talep) return null

  const kisaAd = user?.name?.split(' ')[0] || user?.username || ''
  const eski = Number(talep.eskiNetKira) || 0
  const yeni = Number(talep.yeniNetKira) || 0
  const artis = eski > 0 ? ((yeni - eski) / eski) * 100 : 0

  const onayla = async () => {
    setHata('')
    setIslem(true)
    try {
      await kiraTalebiOnayla(client.id, {
        yeniNetKira: tutar ? Number(tutar) : undefined,
        yeniBaslangic: baslangic || undefined,
        yeniBitis: bitis || undefined
      }, kisaAd)
      onGuncellendi?.()
    } catch (e) {
      setHata(e.message || 'Onaylanamadi')
    } finally {
      setIslem(false)
    }
  }

  const reddet = async () => {
    setHata('')
    setIslem(true)
    try {
      await kiraTalebiReddet(client.id, redNedeni, kisaAd)
      onGuncellendi?.()
    } catch (e) {
      setHata(e.message || 'Reddedilemedi')
    } finally {
      setIslem(false)
    }
  }

  return (
    <div className="mb-4 bg-yellow-500/10 border border-yellow-500/40 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-yellow-400" />
        <span className="text-white font-semibold text-sm">Müşteriden Kira Yenileme Bildirimi</span>
        <span className="ml-auto text-yellow-300/70 text-xs">{tarihTR(talep.talepTarihi)}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <div className="bg-blue-900/30 rounded-lg p-2.5">
          <p className="text-gray-400 text-[11px]">Mevcut net kira</p>
          <p className="text-white text-sm font-semibold">{paraTR(eski)} TL</p>
        </div>
        <div className="bg-blue-900/30 rounded-lg p-2.5">
          <p className="text-gray-400 text-[11px]">Yeni net kira</p>
          <p className="text-yellow-400 text-sm font-bold">{paraTR(yeni)} TL</p>
        </div>
        <div className="bg-blue-900/30 rounded-lg p-2.5">
          <p className="text-gray-400 text-[11px]">Artış</p>
          <p className="text-white text-sm font-semibold flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-green-400" />%{artis.toFixed(2)}
          </p>
        </div>
        <div className="bg-blue-900/30 rounded-lg p-2.5">
          <p className="text-gray-400 text-[11px]">Yeni dönem</p>
          <p className="text-white text-[11px] font-medium leading-4">
            {tarihTR(talep.yeniBaslangic)}<br />{tarihTR(talep.yeniBitis)}
          </p>
        </div>
      </div>

      {talep.aciklama && (
        <p className="text-gray-300 text-xs bg-blue-900/25 rounded-lg p-2.5 mb-3">
          <span className="text-gray-500">Müşteri notu: </span>{talep.aciklama}
        </p>
      )}

      {/* Onay oncesi duzeltme alanlari */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
        <div>
          <label className="block text-gray-400 text-[11px] mb-1">Net kira (düzeltme)</label>
          <input
            type="number" value={tutar} onChange={e => setTutar(e.target.value)}
            placeholder={String(yeni)}
            className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-2.5 py-1.5 text-white text-sm focus:outline-none focus:border-yellow-400"
          />
        </div>
        <div>
          <label className="block text-gray-400 text-[11px] mb-1">Başlangıç</label>
          <input
            type="date" value={baslangic || talep.yeniBaslangic || ''} onChange={e => setBaslangic(e.target.value)}
            className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-2.5 py-1.5 text-white text-sm focus:outline-none focus:border-yellow-400"
          />
        </div>
        <div>
          <label className="block text-gray-400 text-[11px] mb-1">Bitiş</label>
          <input
            type="date" value={bitis || talep.yeniBitis || ''} onChange={e => setBitis(e.target.value)}
            className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-2.5 py-1.5 text-white text-sm focus:outline-none focus:border-yellow-400"
          />
        </div>
      </div>

      {hata && <p className="text-red-400 text-xs mb-2">{hata}</p>}

      {redModu ? (
        <div className="space-y-2">
          <input
            type="text" value={redNedeni} onChange={e => setRedNedeni(e.target.value)}
            placeholder="Red gerekçesi (müşteriye iletilir)"
            className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-400"
          />
          <div className="flex gap-2">
            <button onClick={() => setRedModu(false)} className="flex-1 py-2 rounded-lg text-xs font-medium text-gray-300 bg-blue-900/40 hover:bg-blue-800/50">
              Vazgeç
            </button>
            <button onClick={reddet} disabled={islem} className="flex-1 py-2 rounded-lg text-xs font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-1.5">
              {islem ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
              Reddet
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => setRedModu(true)} disabled={islem} className="px-4 py-2 rounded-lg text-xs font-medium text-red-300 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20">
            Reddet
          </button>
          <button onClick={onayla} disabled={islem} className="flex-1 py-2 rounded-lg text-xs font-bold bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-1.5">
            {islem ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
            Onayla ve Kirayı Güncelle
          </button>
        </div>
      )}
    </div>
  )
}
