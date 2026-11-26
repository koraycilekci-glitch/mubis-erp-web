// OKC Aylik Satis Rapor Bildirimleri servisi
// Dijital Vergi Dairesi -> Internet Vergi Dairesi -> OKC Bildirim Goruntuleme
import { yardimciIsSunucu, musteriGirisBilgileriGetir } from '../utils/gibOdemeHelper'

// OKC bildirimlerini sorgular. detay=true ise her satirin "Goster" detayi da okunur.
export async function okcBildirimGetir({ clientId, yil, ay, detay = false }) {
  const giris = await musteriGirisBilgileriGetir(clientId)
  if (!giris?.dvs_username || !giris?.dvs_password) {
    throw new Error('Musteri DVS kullanici adi/sifresi kayitli degil')
  }
  const res = await yardimciIsSunucu('okc-bildirim-getir', {
    clientId,
    kullaniciKodu: giris.dvs_username,
    parola: giris.dvs_password,
    yil,
    ay,
    detay: Boolean(detay)
  }, 15 * 60 * 1000)
  if (!res.ok) {
    if (res.reason === 'kurulu-degil') throw new Error('MUBiS yardimci programi bu bilgisayarda calismiyor. Lutfen baslatin.')
    if (res.reason === 'servis-yanit-vermedi') throw new Error('Sunucu yanit vermedi; sorgu arka planda calisiyor olabilir. Biraz sonra yenileyin.')
    if (res.reason === 'servis-hatasi') throw new Error(res.error || 'Sunucu hatasi')
    throw new Error(res.error || res.reason || res.not || 'OKC bildirim sorgusu basarisiz')
  }
  return res
}
