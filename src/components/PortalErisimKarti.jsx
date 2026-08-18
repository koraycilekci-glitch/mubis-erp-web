import { useState } from 'react'
import { UserCheck, UserPlus, Copy, Check, AlertTriangle, Loader2 } from 'lucide-react'
import { createPortalAccount } from '../services/clientService'

/**
 * Musterinin MUBiS portal giris hesabini gosterir.
 *
 * clients.auth_user_id bos ise musteri portala girse bile kendi
 * verisini goremez. Bu kart eksik hesabi tek tikla olusturur.
 */
export default function PortalErisimKarti({ client, onGuncellendi }) {
  const [islem, setIslem] = useState(false)
  const [sonuc, setSonuc] = useState(null)
  const [hata, setHata] = useState('')
  const [kopyalandi, setKopyalandi] = useState(false)

  if (!client) return null

  const hesapVar = Boolean(client.authUserId || client.auth_user_id)
  const girisAdi = client.username || client.vkn || client.tc || ''

  const olustur = async () => {
    setIslem(true)
    setHata('')
    try {
      const r = await createPortalAccount(client.id)
      setSonuc(r)
      onGuncellendi?.()
    } catch (e) {
      setHata(e.message || 'Portal hesabi olusturulamadi')
    } finally {
      setIslem(false)
    }
  }

  const kopyala = () => {
    if (!sonuc) return
    navigator.clipboard.writeText(
      `Kullanici adi: ${sonuc.email.replace('@mubis.app', '')}\nSifre: ${sonuc.sifre}`
    )
    setKopyalandi(true)
    setTimeout(() => setKopyalandi(false), 2000)
  }

  // Hesap zaten varsa sade bilgi satiri
  if (hesapVar && !sonuc) {
    return (
      <div className="bg-blue-950/40 rounded-2xl p-4 border border-blue-800/30 flex items-center gap-3">
        <UserCheck className="w-5 h-5 text-green-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-white text-sm font-medium">MUBİS Portal erişimi aktif</div>
          {girisAdi && (
            <div className="text-gray-400 text-xs mt-0.5">
              Kullanıcı adı: <span className="font-mono text-gray-300">{girisAdi}</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-blue-950/40 rounded-2xl p-6 border border-yellow-500/30">
      <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
        <UserPlus className="w-5 h-5 text-yellow-400" /> MUBİS Portal Erişimi
      </h3>

      {sonuc ? (
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-green-400 text-sm">
            <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>Portal hesabı oluşturuldu. Bilgileri müşteriye iletin.</span>
          </div>
          <div className="bg-blue-900/30 rounded-xl p-4 border border-blue-700/30 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-400 text-xs">Kullanıcı adı</span>
              <span className="text-white text-sm font-mono">
                {sonuc.email.replace('@mubis.app', '')}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-400 text-xs">Geçici şifre</span>
              <span className="text-white text-sm font-mono">{sonuc.sifre}</span>
            </div>
          </div>
          <button
            onClick={kopyala}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
          >
            {kopyalandi ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {kopyalandi ? 'Kopyalandı' : 'Giriş bilgilerini kopyala'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-yellow-300/90 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              Bu müşterinin portal giriş hesabı yok. Hesap açılmadan müşteri
              kendi belgelerini ve beyanlarını göremez.
            </span>
          </div>

          {girisAdi ? (
            <p className="text-gray-400 text-xs">
              Kullanıcı adı <span className="font-mono text-gray-300">{girisAdi}</span>,
              geçici şifre <span className="font-mono text-gray-300">123456</span> olarak açılacak.
            </p>
          ) : (
            <p className="text-red-400 text-xs">
              Müşterinin VKN/TC bilgisi yok. Önce müşteri kartını düzenleyip ekleyin.
            </p>
          )}

          {hata && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-xs">
              {hata}
            </div>
          )}

          <button
            onClick={olustur}
            disabled={islem || !girisAdi}
            className="w-full flex items-center justify-center gap-2 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed text-blue-950 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            {islem ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {islem ? 'Oluşturuluyor...' : 'Portal Hesabı Oluştur'}
          </button>
        </div>
      )}
    </div>
  )
}
