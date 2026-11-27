// OKC Aylik Satis Rapor Bildirimleri servisi
// Dijital Vergi Dairesi -> Internet Vergi Dairesi -> OKC Bildirim Goruntuleme
import { supabase } from '../lib/supabase'
import { yardimciIsSunucu, musteriGirisBilgileriGetir } from '../utils/gibOdemeHelper'
import { okcBildirilenSatisToplami } from '../utils/okcHasilat'

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
  if (!detay) return res
  if (!Array.isArray(res.kayitlar)) throw new Error('ÖKC bildirim listesi doğrulanamadı.')
  const toplamTutar = okcBildirilenSatisToplami(res.kayitlar)
  if (toplamTutar === null || res.kayitlar.some(kayit => !kayit.raporNo || kayit.detayHatasi)) {
    return { ...res, kayitHatasi: 'Bazı bildirimlerin ayrıntısı doğrulanamadı. Kayıtlı sonuç değiştirilmedi.' }
  }
  try {
    let officeId = giris.office_id || giris.officeId
    if (!officeId) {
      const { data, error } = await supabase.from('clients').select('office_id').eq('id', clientId).maybeSingle()
      if (error) throw error
      officeId = data?.office_id
    }
    if (!officeId) throw new Error('Müşterinin ofis bilgisi bulunamadı.')
    const { error } = await supabase.from('kdv_dokumleri').upsert({
      office_id: officeId,
      client_id: clientId,
      yil,
      ay,
      tur: 'okc',
      toplam_tutar: toplamTutar,
      detaylar: res.kayitlar,
      sorgu_tarihi: new Date().toISOString().slice(0, 10),
      kaynak: 'manuel'
    }, { onConflict: 'office_id,client_id,yil,ay,tur' })
    if (error) throw error
    return { ...res, kaydedildi: true }
  } catch (error) {
    return { ...res, kayitHatasi: `ÖKC sonucu kaydedilemedi: ${error.message || 'Veritabanı hatası'}` }
  }
}
