import { useState, useEffect, useCallback } from 'react'
import { Clock, CheckCircle, XCircle, RefreshCw, TrendingUp, Calendar, ArrowRight, Info, Trash2, Edit3 } from 'lucide-react'
import { paraTR, tarihTR } from '../utils/kiraUtils'
import { getRenewalsForAdmin, approveRenewal, extendRenewal, rejectRenewal, resetRenewalStatus, deleteRenewal } from '../services/kiraYenilemeService'

export default function KiraTalepOnay({ client, onGuncellendi }) {
  const [renewals, setRenewals] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [processingId, setProcessingId] = useState(null)
  const [redModeId, setRedModeId] = useState(null)
  const [redReason, setRedReason] = useState('')
  const [statusEditId, setStatusEditId] = useState(null)
  const [selectedStatus, setSelectedStatus] = useState('')

  const load = useCallback(async () => {
    if (!client?.id) return
    setLoading(true)
    try {
      const list = await getRenewalsForAdmin(client.id)
      setRenewals(list)
    } catch (e) {
      setError('Kira yenileme talepleri yuklenemedi.')
    } finally {
      setLoading(false)
    }
  }, [client?.id])

  useEffect(() => {
    load()
  }, [load])

  const handleApprove = async (id) => {
    setProcessingId(id)
    setError('')
    try {
      await approveRenewal(id)
      await load()
      onGuncellendi?.()
      // Sayfayi guncelleyerek kira bilgilerini yenile
      window.location.reload()
    } catch (e) {
      setError(e.message || 'Onaylanamadi')
    } finally {
      setProcessingId(null)
    }
  }

  const handleExtend = async (id) => {
    setProcessingId(id)
    setError('')
    try {
      await extendRenewal(id)
      await load()
      onGuncellendi?.()
      window.location.reload()
    } catch (e) {
      setError(e.message || 'Uzatilamadi')
    } finally {
      setProcessingId(null)
    }
  }

  const handleReject = async (id) => {
    setProcessingId(id)
    setError('')
    try {
      await rejectRenewal(id)
      setRedModeId(null)
      setRedReason('')
      await load()
      onGuncellendi?.()
    } catch (e) {
      setError(e.message || 'Reddedilemedi')
    } finally {
      setProcessingId(null)
    }
  }

  const handleStatusChange = async (id, durum) => {
    const hedefDurum = durum || selectedStatus
    if (!hedefDurum) return
    setProcessingId(id)
    setError('')
    try {
      await resetRenewalStatus(id, hedefDurum)
      setStatusEditId(null)
      setSelectedStatus('')
      await load()
      onGuncellendi?.()
    } catch (e) {
      setError(e.message || 'Durum degistirilemedi')
    } finally {
      setProcessingId(null)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Kira yenileme talebi silinecek. Emin misiniz?')) return
    setProcessingId(id)
    setError('')
    try {
      await deleteRenewal(id)
      await load()
      onGuncellendi?.()
    } catch (e) {
      setError(e.message || 'Silinemedi')
    } finally {
      setProcessingId(null)
    }
  }

  if (loading && renewals.length === 0) return null
  if (renewals.length === 0) return null

  return (
    <div className="space-y-3 mb-4">
      {renewals.map((r) => {
        const eski = Number(r.eski_net_kira) || 0
        const yeni = Number(r.yeni_net_kira) || 0
        const artis = eski > 0 && yeni > 0 ? ((yeni - eski) / eski) * 100 : 0
        const isArtisYok = r.artis_yok
        const isErtelendi = r.durum === 'ertelendi'
        const isSonDurum = ['onaylandi', 'uzatildi', 'reddedildi'].includes(r.durum)

        return (
          <div key={r.id} className={`rounded-xl p-4 border ${isErtelendi ? 'bg-blue-500/10 border-blue-500/30' : isSonDurum ? 'bg-green-500/5 border-green-500/20' : 'bg-yellow-500/10 border-yellow-500/40'}`}>
            <div className="flex items-center gap-2 mb-3">
              {isErtelendi ? <Info className="w-4 h-4 text-blue-400" /> : isSonDurum ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Clock className="w-4 h-4 text-yellow-400" />}
              <span className="text-white font-semibold text-sm">
                {isErtelendi ? 'Müşteri Yanıt Vermedi — Erteleme' : isSonDurum ? `Kira Yenileme ${r.durum === 'onaylandi' ? 'Onaylandı' : r.durum === 'uzatildi' ? 'Uzatıldı' : 'Reddedildi'}` : 'Müşteriden Kira Yenileme Bildirimi'}
              </span>
              <span className="ml-auto text-yellow-300/70 text-xs">{r.created_at ? new Date(r.created_at).toLocaleDateString('tr-TR') : '-'}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <div className="bg-blue-900/30 rounded-lg p-2.5">
                <p className="text-gray-400 text-[11px]">Mevcut net kira</p>
                <p className="text-white text-sm font-semibold">{paraTR(eski)} TL</p>
              </div>
              <div className="bg-blue-900/30 rounded-lg p-2.5">
                <p className="text-gray-400 text-[11px]">{isArtisYok || isErtelendi ? 'Yeni net kira' : 'Bildirilen net kira'}</p>
                <p className={`text-sm font-bold ${isArtisYok || isErtelendi ? 'text-gray-400' : 'text-yellow-400'}`}>{isErtelendi ? `${r.erteleme_gunu || '-'} gün sonra` : isArtisYok ? 'Artış yok' : `${paraTR(yeni)} TL`}</p>
              </div>
              {!isArtisYok && !isErtelendi && (
                <div className="bg-blue-900/30 rounded-lg p-2.5">
                  <p className="text-gray-400 text-[11px]">Artış</p>
                  <p className="text-white text-sm font-semibold flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-green-400" />%{artis.toFixed(2)}
                  </p>
                </div>
              )}
              <div className={`bg-blue-900/30 rounded-lg p-2.5 ${(isArtisYok || isErtelendi) ? 'col-span-2' : ''}`}>
                <p className="text-gray-400 text-[11px]">Kontrat bitişi</p>
                <p className="text-white text-[11px] font-medium leading-4">{tarihTR(r.bitis_tarihi)}</p>
              </div>
            </div>

            {error && processingId === r.id && <p className="text-red-400 text-xs mb-2">{error}</p>}

            {statusEditId === r.id ? (
              <div className="space-y-2">
                <select
                  value={selectedStatus}
                  onChange={e => setSelectedStatus(e.target.value)}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                >
                  <option value="">Durum seçin</option>
                  <option value="bekliyor">Bekliyor</option>
                  <option value="musteri_cevaplandi">Müşteri Cevapladı</option>
                  <option value="onaylandi">Onaylandı</option>
                  <option value="uzatildi">Uzatıldı</option>
                  <option value="reddedildi">Reddedildi</option>
                  <option value="ertelendi">Ertelendi</option>
                </select>
                <div className="flex gap-2">
                  <button onClick={() => { setStatusEditId(null); setSelectedStatus('') }} className="flex-1 py-2 rounded-lg text-xs font-medium text-gray-300 bg-blue-900/40 hover:bg-blue-800/50">
                    Vazgeç
                  </button>
                  <button onClick={() => handleStatusChange(r.id)} disabled={processingId === r.id || !selectedStatus} className="flex-1 py-2 rounded-lg text-xs font-semibold bg-yellow-500 text-blue-950 hover:bg-yellow-400 disabled:opacity-50 flex items-center justify-center gap-1.5">
                    {processingId === r.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Edit3 className="w-3.5 h-3.5" />}
                    Kaydet
                  </button>
                </div>
              </div>
            ) : r.durum === 'musteri_cevaplandi' ? (
              redModeId === r.id ? (
                <div className="space-y-2">
                  <input
                    type="text" value={redReason} onChange={e => setRedReason(e.target.value)}
                    placeholder="Red gerekcesi"
                    className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-400"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setRedModeId(null)} className="flex-1 py-2 rounded-lg text-xs font-medium text-gray-300 bg-blue-900/40 hover:bg-blue-800/50">
                      Vazgec
                    </button>
                    <button onClick={() => handleReject(r.id)} disabled={processingId === r.id} className="flex-1 py-2 rounded-lg text-xs font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-1.5">
                      {processingId === r.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                      Reddet
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setRedModeId(r.id)} disabled={processingId === r.id} className="px-4 py-2 rounded-lg text-xs font-medium text-red-300 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20">
                    Reddet
                  </button>
                  <button onClick={() => { setStatusEditId(r.id); setSelectedStatus(r.durum) }} disabled={processingId === r.id} className="px-4 py-2 rounded-lg text-xs font-medium text-gray-300 bg-blue-900/40 border border-blue-700/50 hover:bg-blue-800/50">
                    Durum
                  </button>
                  {isArtisYok ? (
                    <button onClick={() => handleExtend(r.id)} disabled={processingId === r.id} className="flex-1 py-2 rounded-lg text-xs font-bold bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-1.5">
                      {processingId === r.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Calendar className="w-3.5 h-3.5" />}
                      1 Yil Uzat
                    </button>
                  ) : (
                    <button onClick={() => handleApprove(r.id)} disabled={processingId === r.id} className="flex-1 py-2 rounded-lg text-xs font-bold bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-1.5">
                      {processingId === r.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                      Onayla ve Kirayi Guncelle
                    </button>
                  )}
                </div>
              )
            ) : (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => { setStatusEditId(r.id); setSelectedStatus(r.durum) }} disabled={processingId === r.id} className="px-4 py-2 rounded-lg text-xs font-medium text-gray-300 bg-blue-900/40 border border-blue-700/50 hover:bg-blue-800/50">
                  Durum Değiştir
                </button>
                {r.durum === 'reddedildi' && (
                  <button onClick={() => handleStatusChange(r.id, r.yeni_net_kira ? 'musteri_cevaplandi' : r.artis_yok ? 'musteri_cevaplandi' : 'bekliyor')} disabled={processingId === r.id} className="flex-1 py-2 rounded-lg text-xs font-bold bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-1.5">
                    {processingId === r.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Tekrar Değerlendir
                  </button>
                )}
                {(r.durum === 'onaylandi' || r.durum === 'uzatildi') && (
                  <button onClick={() => handleStatusChange(r.id, 'musteri_cevaplandi')} disabled={processingId === r.id} className="flex-1 py-2 rounded-lg text-xs font-bold bg-yellow-500 text-blue-950 hover:bg-yellow-400 disabled:opacity-50 flex items-center justify-center gap-1.5">
                    {processingId === r.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                    Geri Al
                  </button>
                )}
                <button onClick={() => handleDelete(r.id)} disabled={processingId === r.id} className="px-4 py-2 rounded-lg text-xs font-medium text-red-300 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
