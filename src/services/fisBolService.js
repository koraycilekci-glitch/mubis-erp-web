// Toplu Fis Bol (Luca) — KAYIT DEGISTIRIR
//
// Akis (Luca masaustu ile ayni):
//   Fis Listesi > tarih filtresi > "Toplu Fis Bol" (secim modu) >
//   "Tum Fisler" onay kutusu > "Toplu Fis Bol" (alt yesil) >
//   Fis Bolme penceresi > Tamam > "N adet fis bolunecektir" > Tamam >
//   Islem Takip > Kapat
//
// Yalnizca kullanicinin acik onayiyla cagrilmalidir.
import { yardimciIsSunucu } from '../utils/gibOdemeHelper'
import { lucaBilgileriGetir } from './efaturaService'

export async function fisBol({ client, yil, ay, secenekler, onDurum }) {
  const durum = (m) => { try { onDurum?.(m) } catch { /* yoksay */ } }
  if (!client?.id) throw new Error('Müşteri seçili değil.')

  const luca = await lucaBilgileriGetir()
  if (!luca.member || !luca.username || !luca.password) {
    throw new Error('Luca bağlantısı eksik: Ayarlar > Luca Bağlantı bölümünden üye numarası, kullanıcı adı ve parola girin.')
  }

  durum('yardımcı hazırlanıyor')
  const sonuc = await yardimciIsSunucu('fis-bol', {
    lucaMember: luca.member,
    lucaUsername: luca.username,
    lucaPassword: luca.password,
    vkn: client.vkn || client.tc || '',
    shortName: client.shortName || client.name || '',
    fullName: client.name || client.company || '',
    yil: String(yil || new Date().getFullYear()),
    ay: ay === '' || ay == null ? null : Number(ay),
    secenekler: secenekler && typeof secenekler === 'object' ? secenekler : undefined
  }, 90 * 60 * 1000, (adim) => durum(adim))

  if (!sonuc.ok) {
    const neden = String(sonuc.reason || sonuc.not || '')
    if (neden === 'servis-yanit-vermedi') {
      throw new Error('Yardımcı program zamanında yanıt vermedi. İşlem sunucuda devam ediyor olabilir; birkaç dakika sonra tekrar deneyin.')
    }
    if (neden === 'kurulu-degil') throw new Error('Yardımcı program çalışmıyor. VPS/yerel yardımcıyı başlatın.')
    throw new Error(neden || 'Yardımcı program fiş bölme işlemini tamamlayamadı.')
  }
  return sonuc
}
