// Toplu Belge Turu ve Odeme Yontemi Duzenleme (Luca)
// Luca masaustu otomasyonunun ayni adli akisini VPS/yerel yardimciya yaptirir.
//
// Kurallar yardimci tarafta uygulanir (gib-yardimci/toplu-belge.js):
//  - yalniz 20041 / 20042 E-Defter uyumsuzluklari duzeltilir
//  - dolu belge numarasina dokunulmaz
//  - fatura fislerine fis numarasi yazilmaz
// mod='onizle' -> yalniz okur, ne degisecegini doner (kayit yok)
// mod='uygula' -> degisiklikleri toplu deger ata ile uygular ve kaydeder
import { yardimciIsSunucu } from '../utils/gibOdemeHelper'
import { lucaBilgileriGetir } from './efaturaService'

export const HATA_TURLERI = [
  { kod: '20041', ad: 'Belge türü boş', duzenlenir: true },
  { kod: '20042', ad: 'Diğer uyumsuzluklar', duzenlenir: true },
  { kod: '20044', ad: 'Uyumsuz fiş (44)', duzenlenir: false },
  { kod: '20045', ad: 'Uyumsuz fiş (45)', duzenlenir: false },
  { kod: '20046', ad: 'Uyumsuz fiş (46)', duzenlenir: false },
  { kod: '20047', ad: 'Uyumsuz fiş (47)', duzenlenir: false },
  { kod: '20048', ad: 'Uyumsuz fiş (48)', duzenlenir: false }
]

export async function topluBelgeDuzenle({ client, yil, mod = 'onizle', onDurum }) {
  const durum = (m) => { try { onDurum?.(m) } catch { /* yoksay */ } }
  if (!client?.id) throw new Error('Müşteri seçili değil.')

  const luca = await lucaBilgileriGetir()
  if (!luca.member || !luca.username || !luca.password) {
    throw new Error('Luca bağlantısı eksik: Ayarlar > Luca Bağlantı bölümünden üye numarası, kullanıcı adı ve parola girin.')
  }

  durum('yardımcı hazırlanıyor')
  const sonuc = await yardimciIsSunucu('toplu-belge-duzenle', {
    lucaMember: luca.member,
    lucaUsername: luca.username,
    lucaPassword: luca.password,
    vkn: client.vkn || client.tc || '',
    shortName: client.shortName || client.name || '',
    fullName: client.name || client.company || '',
    yil: String(yil || new Date().getFullYear()),
    mod
  }, mod === 'uygula' ? 60 * 60 * 1000 : 15 * 60 * 1000)

  if (!sonuc.ok) {
    const neden = String(sonuc.reason || sonuc.not || '')
    if (neden === 'servis-yanit-vermedi') {
      throw new Error('Yardımcı program zamanında yanıt vermedi. İşlem sunucuda devam ediyor olabilir; birkaç dakika sonra tekrar deneyin.')
    }
    if (neden === 'kurulu-degil') throw new Error('Yardımcı program çalışmıyor. VPS/yerel yardımcıyı başlatın.')
    throw new Error(neden || 'Yardımcı program toplu düzenlemeyi tamamlayamadı.')
  }
  return sonuc
}
