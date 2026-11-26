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

export function kdvTahakkukAylari(sonuc, yil) {
  if (!Array.isArray(sonuc?.fisler)) throw new Error('VPS yardımcısında KDV tahakkuk taraması yanıtı alınamadı.')
  const aylar = AYLAR.map(() => [])
  const donem = sonuc.lucaFiltreDonemi
  const gecerliTarih = (tarih) => {
    if (typeof tarih !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(tarih) || tarih.slice(0, 4) !== String(yil)) return false
    const zaman = Date.parse(tarih + 'T00:00:00Z')
    return Number.isFinite(zaman) && new Date(zaman).toISOString().slice(0, 10) === tarih
  }
  const lucaFiltreDonemi = gecerliTarih(donem?.baslangic) && gecerliTarih(donem?.bitis) && donem.baslangic <= donem.bitis ? donem : null
  let kapsamTam = !!lucaFiltreDonemi && sonuc.kapsamTam === true && sonuc.sayi === sonuc.fisler.length
  for (const fis of sonuc.fisler) {
    const tarih = /^(\d{2})[/.](\d{2})[/.](20\d{2})$/.exec(fis?.date || '')
    const iso = tarih && [tarih[3], tarih[2], tarih[1]].join('-')
    if (!gecerliTarih(iso) || !fis.voucherNo || (lucaFiltreDonemi && (iso < lucaFiltreDonemi.baslangic || iso > lucaFiltreDonemi.bitis))) {
      kapsamTam = false
      continue
    }
    aylar[Number(tarih[2]) - 1].push(fis)
  }
  return { aylar, kapsamTam, lucaFiltreDonemi }
}

export function kdvTahakkukAyDurumu(sonuc, yil, ay, faaliyetDisi, simdi = new Date()) {
  if (sonuc?.aylar?.[ay - 1]?.length) return 'Aday fiş var'
  const ayBaslangic = new Date(Date.UTC(yil, ay - 1, 1)).toISOString().slice(0, 10)
  const ayBitis = new Date(Date.UTC(yil, ay, 0)).toISOString().slice(0, 10)
  if (faaliyetDisi) return 'Faaliyet dönemi dışında'
  if (yil > simdi.getFullYear() || (yil === simdi.getFullYear() && ay > simdi.getMonth() + 1)) return 'Gelecek ay'
  const donem = sonuc?.lucaFiltreDonemi
  if (donem && (ayBitis < donem.baslangic || ayBaslangic > donem.bitis)) return 'Luca filtre dönemi dışında'
  if (!sonuc || sonuc.durum === 'Sırada' || sonuc.durum === 'Taranıyor') return '—'
  return sonuc.kapsamTam && donem && ayBaslangic >= donem.baslangic && ayBitis <= donem.bitis ? 'Eşleşme yok' : 'Kontrol gerekli'
}

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
  }, 45 * 60 * 1000, (adim) => durum(adim), turler.includes('kdv-tahakkuk') ? { yerelYedek: false } : undefined)

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
