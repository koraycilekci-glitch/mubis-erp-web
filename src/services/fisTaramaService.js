// Fis Taramasi (SALT OKUNUR)
// Luca "Fis Listesi" ekranindan bos / dengesiz / pasif fisleri okur.
// Hicbir kayit degistirilmez, silinmez.
import { yardimciIsSunucu } from '../utils/gibOdemeHelper'
import { lucaBilgileriGetir } from './efaturaService'

export const FIS_TURLERI = [
  { kod: 'empty', ad: 'Boş fiş', aciklama: 'Borç/Alacak sıfır (detaysız) fişler' },
  { kod: 'unbalanced', ad: 'Dengesiz fiş', aciklama: 'Borç ≠ Alacak olan fişler' },
  { kod: 'passive', ad: 'Pasif fiş', aciklama: 'Pasif durumdaki fişler' }
]

export const AYLAR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
]

export async function fisTara({ client, yil, ay, turler, onDurum }) {
  const durum = (m) => { try { onDurum?.(m) } catch { /* yoksay */ } }
  if (!client?.id) throw new Error('Müşteri seçili değil.')
  if (!Array.isArray(turler) || !turler.length) throw new Error('En az bir tarama türü seçin.')

  const luca = await lucaBilgileriGetir()
  if (!luca.member || !luca.username || !luca.password) {
    throw new Error('Luca bağlantısı eksik: Ayarlar > Luca Bağlantı bölümünden üye numarası, kullanıcı adı ve parola girin.')
  }

  durum('yardımcı hazırlanıyor')
  const sonuc = await yardimciIsSunucu('fis-tarama', {
    lucaMember: luca.member,
    lucaUsername: luca.username,
    lucaPassword: luca.password,
    vkn: client.vkn || client.tc || '',
    shortName: client.shortName || client.name || '',
    fullName: client.name || client.company || '',
    yil: String(yil || new Date().getFullYear()),
    ay: ay === '' || ay == null ? null : Number(ay),
    turler
  }, 45 * 60 * 1000, (adim) => durum(adim))

  if (!sonuc.ok) {
    const neden = String(sonuc.reason || sonuc.not || '')
    if (neden === 'servis-yanit-vermedi') {
      throw new Error('Yardımcı program zamanında yanıt vermedi. Tarama sunucuda devam ediyor olabilir; birkaç dakika sonra tekrar deneyin.')
    }
    if (neden === 'kurulu-degil') throw new Error('Yardımcı program çalışmıyor. VPS/yerel yardımcıyı başlatın.')
    throw new Error(neden || 'Yardımcı program fiş taramasını tamamlayamadı.')
  }
  return sonuc
}
