// src/components/LisansKapisi.jsx
// Ofisin lisans süresi dolduysa uygulamanın üstünü kapatan tam ekran katman.
// super_admin ve muaf ofisler etkilenmez; sunucu zaten 402 döndürüyorsa
// ekran da kilitli görünür. /giris, /portal gibi müşteri sayfalarında çıkmaz.
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { KeyRound, Copy, CheckCircle, AlertCircle } from 'lucide-react'
import { lisansDurumu, talepKoduUret, lisansAktiveEt } from '../services/lisansService'

export default function LisansKapisi() {
  const location = useLocation()
  const [durum, setDurum] = useState(null) // null: kontrol ediliyor
  const [talepKodu, setTalepKodu] = useState('')
  const [kod, setKod] = useState('')
  const [mesaj, setMesaj] = useState(null)

  const kilitlenecekYol = location.pathname.startsWith('/admin')
  useEffect(() => {
    let iptal = false
    const kontrol = async () => {
      try {
        const j = await lisansDurumu()
        if (!iptal) setDurum(j.ok ? j : { gerekli: false })
      } catch {
        if (!iptal) setDurum({ gerekli: false })
      }
    }
    if (kilitlenecekYol) kontrol()
    else setDurum({ gerekli: false })
    return () => { iptal = true }
  }, [kilitlenecekYol, location.pathname])

  if (!durum || !durum.gerekli) return null

  const talepUret = async () => {
    const j = await talepKoduUret()
    if (j.ok) { setTalepKodu(j.talep_kodu); setMesaj({ tip: 'ok', metin: 'Talep kodu üretildi — yazılımcıya gönderin.' }) }
    else setMesaj({ tip: 'hata', metin: j.error || 'Talep kodu üretilemedi' })
  }

  const aktive = async () => {
    const j = await lisansAktiveEt(kod)
    if (j.ok) window.location.reload()
    else setMesaj({ tip: 'hata', metin: j.error || 'Aktivasyon başarısız' })
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-blue-950/98 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-blue-900/40 border border-blue-700/40 rounded-2xl p-8 text-center space-y-5">
        <KeyRound className="w-12 h-12 text-yellow-400 mx-auto" />
        <div>
          <h2 className="text-xl font-bold text-white">Lisans Süresi Doldu</h2>
          <p className="text-gray-400 text-sm mt-1">
            MUBiS kullanımınız için aktif lisans bulunamadı.
            Lisans kodu almak için talep kodunu üretin ve yazılımcıya gönderin.
          </p>
        </div>

        <button
          onClick={talepUret}
          className="w-full px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium"
        >
          Talep Kodu Üret
        </button>

        {talepKodu && (
          <div className="flex items-center gap-2 bg-black/40 rounded-lg p-3">
            <code className="flex-1 text-left text-xs text-green-300 break-all">{talepKodu}</code>
            <button
              onClick={() => navigator.clipboard.writeText(talepKodu).catch(() => {})}
              className="p-1.5 rounded hover:bg-white/10 shrink-0" title="Kopyala"
            >
              <Copy className="w-4 h-4 text-gray-300" />
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text" value={kod} onChange={e => setKod(e.target.value)}
            placeholder="MUBLIC1.… lisans kodu"
            className="flex-1 bg-black/40 border border-blue-700/40 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500"
          />
          <button
            onClick={aktive} disabled={!kod.trim()}
            className="px-4 py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-blue-950 text-sm font-bold disabled:opacity-40"
          >
            Aktive Et
          </button>
        </div>

        {mesaj && (
          <div className={`text-sm flex items-center justify-center gap-2 ${mesaj.tip === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
            {mesaj.tip === 'ok' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {mesaj.metin}
          </div>
        )}
      </div>
    </div>
  )
}
