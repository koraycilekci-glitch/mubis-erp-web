// src/components/LisansPaneli.jsx
// Ayarlar > Lisans: durum, talep kodu üretimi, lisans kodu aktivasyonu.
import { useEffect, useState } from 'react'
import { KeyRound, Copy, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { lisansDurumu, talepKoduUret, lisansAktiveEt, cihazIdAl } from '../services/lisansService'

const PLAN_ADI = { deneme: 'Deneme', aylik: 'Aylık', yillik: 'Yıllık', kalici: 'Kalıcı' }

export default function LisansPaneli() {
  const [durum, setDurum] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [talepKodu, setTalepKodu] = useState('')
  const [girilenKod, setGirilenKod] = useState('')
  const [mesaj, setMesaj] = useState(null) // {tip:'ok'|'hata', metin}
  const [islem, setIslem] = useState('')

  const yukle = async () => {
    setYukleniyor(true)
    const j = await lisansDurumu()
    setDurum(j)
    setYukleniyor(false)
  }

  useEffect(() => { yukle() }, [])

  const talepUret = async () => {
    setIslem('talep')
    setMesaj(null)
    const j = await talepKoduUret()
    setIslem('')
    if (j.ok) { setTalepKodu(j.talep_kodu); setMesaj({ tip: 'ok', metin: 'Talep kodu üretildi. Bunu yazılımcıya gönderin.' }) }
    else setMesaj({ tip: 'hata', metin: j.error || 'Talep kodu üretilemedi' })
  }

  const aktive = async () => {
    if (!girilenKod.trim()) return
    setIslem('aktive')
    setMesaj(null)
    const j = await lisansAktiveEt(girilenKod)
    setIslem('')
    if (j.ok) {
      setGirilenKod('')
      setMesaj({ tip: 'ok', metin: j.mesaj || 'Lisans aktive edildi.' })
      await yukle()
    } else setMesaj({ tip: 'hata', metin: j.error || 'Aktivasyon başarısız' })
  }

  const kopyala = async (metin) => {
    try { await navigator.clipboard.writeText(metin); setMesaj({ tip: 'ok', metin: 'Panoya kopyalandı.' }) } catch { /* sessiz */ }
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-900/20 rounded-xl border border-blue-700/30 p-5">
        <div className="flex items-center gap-3 mb-4">
          <KeyRound className="w-6 h-6 text-yellow-400" />
          <div>
            <h3 className="text-white font-medium">Lisans Durumu</h3>
            <p className="text-gray-400 text-xs">Cihaz kimliği: <span className="font-mono text-gray-300">{cihazIdAl().slice(0, 12)}…</span></p>
          </div>
          <button onClick={yukle} className="ml-auto p-2 rounded-lg hover:bg-white/5" title="Yenile">
            <RefreshCw className={`w-4 h-4 text-gray-400 ${yukleniyor ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {durum && !yukleniyor && (
          durum.muaf ? (
            <div className="flex items-center gap-2 text-green-400 text-sm">
              <CheckCircle className="w-4 h-4" /> Bu ofis lisans muafiyetindedir (sistem yöneticisi ofisi).
            </div>
          ) : durum.gerekli ? (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" /> Lisans süresi dolmuş. Aşağıdaki adımlarla lisans kodu alın.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div className="bg-blue-950/40 rounded-lg p-3">
                <div className="text-gray-400 text-xs">Plan</div>
                <div className="text-white font-medium">{PLAN_ADI[durum.plan] || durum.plan}</div>
              </div>
              <div className="bg-blue-950/40 rounded-lg p-3">
                <div className="text-gray-400 text-xs">Bitiş</div>
                <div className="text-white font-medium">{durum.bitis ? new Date(durum.bitis).toLocaleDateString('tr-TR') : 'Süresiz'}</div>
              </div>
              <div className="bg-blue-950/40 rounded-lg p-3">
                <div className="text-gray-400 text-xs">Kalan Süre</div>
                <div className={`font-medium ${(durum.kalanGun ?? 99) <= 7 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {durum.kalanGun == null ? '—' : `${durum.kalanGun} gün`}
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {!durum?.muaf && (
        <div className="bg-blue-950/30 rounded-xl border border-blue-800/30 p-5 space-y-4">
          <div>
            <h4 className="text-white font-medium mb-1">1) Talep Kodu Üret</h4>
            <p className="text-gray-400 text-xs mb-2">Kodu yazılımcıya (koray) gönderin; size MUB… ile başlayan bir lisans kodu dönecek.</p>
            <button onClick={talepUret} disabled={islem === 'talep'}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-40">
              {islem === 'talep' ? 'Üretiliyor…' : 'Talep Kodu Üret'}
            </button>
            {talepKodu && (
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 bg-black/40 rounded-lg px-3 py-2 text-xs text-green-300 break-all">{talepKodu}</code>
                <button onClick={() => kopyala(talepKodu)} className="p-2 rounded-lg hover:bg-white/5" title="Kopyala">
                  <Copy className="w-4 h-4 text-gray-300" />
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-blue-800/30 pt-4">
            <h4 className="text-white font-medium mb-1">2) Lisans Kodunu Gir</h4>
            <p className="text-gray-400 text-xs mb-2">Yazılımcıdan aldığınız MUB… kodunu yapıştırın.</p>
            <div className="flex gap-2">
              <input
                type="text" value={girilenKod} onChange={e => setGirilenKod(e.target.value)}
                placeholder="MUBLIC1.xxxx.yyyy"
                className="flex-1 bg-black/40 border border-blue-700/40 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
              />
              <button onClick={aktive} disabled={islem === 'aktive' || !girilenKod.trim()}
                className="px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-blue-950 text-sm font-bold disabled:opacity-40">
                {islem === 'aktive' ? 'Aktive…' : 'Aktive Et'}
              </button>
            </div>
          </div>
        </div>
      )}

      {mesaj && (
        <div className={`flex items-center gap-2 text-sm ${mesaj.tip === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
          {mesaj.tip === 'ok' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {mesaj.metin}
        </div>
      )}
    </div>
  )
}
