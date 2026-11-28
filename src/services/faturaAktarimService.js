import { yardimciIsSunucu } from '../utils/gibOdemeHelper'
import { supabase } from '../lib/supabase'
import { dosyalariMubisYukle, edefterTopluKopyala, efaturaSorgula, faturaIlerlemeMetni, faturaKopyalamaDosyalari, lucaDurumMetni } from './efaturaService'

const tablo = 'fatura_aktarim_durumu'
const leaseSuresi = 90000
const dosyaTabani = ad => ad.replace(/\.(xml|html?|pdf)$/i, '').toLowerCase()
const pdfEksikleri = dosyalar => {
  const pdfler = new Set(dosyalar.filter(dosya => /\.pdf$/i.test(dosya.ad)).map(dosya => dosyaTabani(dosya.ad)))
  return [...new Map(dosyalar.filter(dosya => /\.(xml|html?)$/i.test(dosya.ad) && !pdfler.has(dosyaTabani(dosya.ad))).map(dosya => [dosyaTabani(dosya.ad), dosya])).values()]
}
const parcaAnahtari = parca => `${parca?.bas || ''}|${parca?.bit || ''}`
const vpsIsKimligi = deger => /^is_\d+_[a-z0-9]+$/.test(deger || '')
const mesajAnahtari = mesaj => String(mesaj || '').toLocaleLowerCase('tr').normalize('NFD').replace(/\p{M}/gu, '').replaceAll('ı', 'i')

export function lucaIslemiBelirsiz(mesaj) {
  return /islem takibi suresinde tamamlanmadi|onceki luca islemi suruyor|luca.*devam ediyor olabilir|mevcut-sorgu-devam-ediyor/.test(mesajAnahtari(mesaj))
}

export function faturaAktarimAsamaMetni(durum) {
  if (!durum) return ''
  const sorgu = durum.parcalar?.length ? `Sorgu: ${durum.parcalar.length} aralık doğrulandı` : 'Sorgu: doğrulanmadı'
  const indirme = durum.bos ? 'VPS: belge yok (doğrulandı)' : durum.dosyalar?.length ? `VPS: ${durum.dosyalar.length} dosya hazır` : 'VPS: indirme doğrulanmadı'
  const yukleme = durum.bos ? '' : ` · MUBİS: ${durum.yuklendi ? `${durum.sayi || 0} belge kaydedildi` : 'tamamlanmadı'}`
  const arsiv = durum.bos ? '' : ` · Arşiv: ${durum.arsiv === 'tamam' ? 'kopyalandı' : durum.arsiv === 'atlandi' ? 'atlandı' : 'tamamlanmadı'}`
  const sorun = { sorgu: 'Sorgu doğrulanamadı', indirme: 'İndirme doğrulanamadı', yukleme: 'Yükleme tamamlanamadı', arsiv: 'Arşiv kopyası tamamlanamadı', oturum: 'Luca oturumu doğrulanamadı', bekliyor: 'Luca işlemi devam ediyor olabilir' }[durum.sorun]
  return `${sorgu} · ${indirme}${yukleme}${arsiv}${durum.pdfEksik ? ` · ${durum.pdfEksik} PDF eksik` : ''}${sorun ? ` · ${sorun}` : ''}`
}

export async function faturaAktarimDurumlariniGetir({ yil, ay, clientId }) {
  if (!Number(yil) || !Number(ay)) return []
  let sorgu = supabase.from(tablo).select('client_id,tur,yon,durum').eq('yil', Number(yil)).eq('ay', Number(ay)).order('updated_at', { ascending: false }).limit(100)
  if (clientId) sorgu = sorgu.eq('client_id', clientId)
  const { data, error } = await sorgu
  if (error) throw error
  return data || []
}

export async function faturaAktariminiCalistir({ client, yil, ay, tur, yon, parcalar, devam, onarim = false, iptalKontrol, onDurum, onKayit }) {
  const anahtar = { client_id: client.id, yil: Number(yil), ay: Number(ay), tur, yon }
  const lease = crypto.randomUUID()
  const bitis = () => new Date(Date.now() + leaseSuresi).toISOString()
  const tabloSorgusu = () => supabase.from(tablo)
  const kontrol = () => {
    if (iptalKontrol?.()) throw new Error('KULLANICI_DURDURDU')
  }
  kontrol()
  const { error: eklemeHatasi } = await tabloSorgusu().upsert(anahtar, { onConflict: 'client_id,yil,ay,tur,yon', ignoreDuplicates: true })
  if (eklemeHatasi) throw eklemeHatasi
  const simdi = new Date().toISOString()
  const { data: satir, error: kilitHatasi } = await tabloSorgusu().update({ lease_id: lease, lease_until: bitis() })
    .match(anahtar).or(`lease_until.is.null,lease_until.lt.${simdi}`).select('durum').maybeSingle()
  if (kilitHatasi) throw kilitHatasi
  if (!satir) throw Object.assign(new Error('Bu aktarım başka bir sekmede izleniyor. Sekme kapandıysa yaklaşık bir dakika sonra tekrar devam edin.'), { code: 'AKTARIM_KILITLI' })

  let durum = satir.durum || {}
  let asama = 'sorgu'
  let leaseKayip = false
  const yenile = setInterval(async () => {
    try {
      const { data, error } = await tabloSorgusu().update({ lease_until: bitis() }).match({ ...anahtar, lease_id: lease }).select('lease_id').maybeSingle()
      if (error || !data) leaseKayip = true
    } catch { leaseKayip = true }
  }, 25000)
  const kaydet = async (degisiklik) => {
    if (leaseKayip) throw new Error('Aktarım kilidi doğrulanamadı; yeniden devam edin.')
    const yeni = { ...durum, ...degisiklik }
    const { data, error } = await tabloSorgusu().update({ durum: yeni, updated_at: new Date().toISOString() })
      .match({ ...anahtar, lease_id: lease }).select('lease_id').maybeSingle()
    if (error || !data) throw error || new Error('Aktarım durumu kaydedilemedi.')
    durum = yeni
    onKayit?.(durum)
  }
  const calistir = async (parametreler, isAnahtari) => {
    kontrol()
    const oncekiIsId = durum.is?.anahtar === isAnahtari && vpsIsKimligi(durum.is.id) ? durum.is.id : undefined
    try {
      return await efaturaSorgula({
        client, yil, ay, sorguTip: tur, yon, sadeceIndir: true,
        iptalKontrol: () => iptalKontrol?.() || leaseKayip,
        onDurum: adim => { const metin = lucaDurumMetni(adim); if (metin) onDurum?.(metin) },
        oncekiIsId, onIsBasladi: id => kaydet({ is: { id, anahtar: isAnahtari } }),
        ...parametreler
      })
    } catch (hata) {
      if (hata.isBitti || hata.code === 'VPS_IS_BULUNAMADI') await kaydet({ is: null })
      if (hata.code === 'VPS_IS_BULUNAMADI') throw new Error('Önceki VPS işinin sonucu artık erişilebilir değil. Yeniden devam etmeden önce Luca durumunu kontrol edin.')
      throw hata
    }
  }
  if (devam && durum.plan?.length) parcalar = durum.plan
  const kapsam = parcalar.map(parcaAnahtari).join(';')
  try {
    if (durum.is && (!devam || durum.kapsam !== kapsam)) {
      throw Object.assign(new Error('Önceki VPS işi izlenmeli. Aynı dönem ve sorgu aralığıyla Eksik adımları tamamla seçeneğini kullanın.'), { code: 'AKTARIM_BEKLIYOR' })
    }
    if (!devam || durum.kapsam !== kapsam) {
      durum = {}
      await kaydet({ kapsam, plan: parcalar, parcalar: [], onarim, sorun: null })
    } else await kaydet({ sorun: null })

    for (const parca of parcalar) {
      const anahtar = parcaAnahtari(parca)
      if (durum.parcalar?.includes(anahtar)) continue
      onDurum?.(`Luca’da sorgulanıyor${parca?.etiket ? ` (${parca.etiket})` : ''}…`)
      const sonuc = await calistir({ sadeceSorgu: true, baslangicTarih: parca?.bas, bitisTarih: parca?.bit }, `sorgu:${anahtar}`)
      if (!sonuc.sorguDogrulandi) {
        await kaydet({ is: null })
        throw Object.assign(new Error('Luca tamamlanma sinyali doğrulanamadı; işlem devam ediyor olabilir.'), { code: 'LUCA_BEKLENIYOR' })
      }
      await kaydet({ is: null, parcalar: [...(durum.parcalar || []), anahtar] })
    }
    if (durum.bos || (durum.yuklendi && !durum.pdfEksik && ['tamam', 'atlandi'].includes(durum.arsiv))) return { durum, yeniSayi: 0 }

    asama = 'indirme'
    const iptalItirazGerekli = /^(efatura|earsiv)$/.test(tur) || tur === 'esmm' && yon === 'alis'
    if (iptalItirazGerekli && durum.dosyalar?.length && durum.iptalItirazDogrulandi !== true) {
      if (durum.yuklendi || durum.is) throw new Error('Önceki aktarımın iptal/itiraz kontrolü doğrulanamıyor. Luca işlemini kontrol edip dönemi yeniden sorgulayın.')
      await kaydet({ dosyalar: [], pdfEksik: null })
    }
    if (!durum.dosyalar?.length) {
      const sonuc = await calistir({ mod: 'indir' }, 'indirme')
      if (sonuc.bosDogrulandi) {
        await kaydet({ is: null, bos: true })
        return { durum, yeniSayi: 0 }
      }
      const dosyalar = sonuc.vpsDosyalari?.map(({ ad, boyut, tarih }) => ({ ad, boyut, tarih })) || []
      if (!dosyalar.length) {
        await kaydet({ is: null })
        throw new Error('VPS doğrulanmış bir dosya listesi veya boş sonuç döndürmedi.')
      }
      await kaydet({ is: null, dosyalar, zipYoluIle: sonuc.zipYoluIle, iptalItirazDogrulandi: sonuc.iptalItirazDogrulandi === true })
    }

    let yeniSayi = 0
    let yuklenenDosyalar = durum.yuklenenDosyalar || []
    const eksikler = tur === 'utts' ? [] : pdfEksikleri(durum.dosyalar)
    asama = 'yukleme'
    if (eksikler.length) {
      onDurum?.('Eksik PDF’ler VPS’teki mevcut belgelerden hazırlanıyor…')
      for (let index = 0; index < eksikler.length; index += 20) {
        kontrol()
        const kaynaklar = durum.is?.anahtar === 'pdf' ? durum.is.kaynaklar : eksikler.slice(index, index + 20)
        const sonuc = await yardimciIsSunucu('efatura-pdf-tamamla', { dosyalar: kaynaklar }, 12 * 60 * 1000, undefined, {
          yerelYedek: false, oncekiIsId: durum.is?.anahtar === 'pdf' ? durum.is.id : undefined,
          iptalKontrol: () => iptalKontrol?.() || leaseKayip,
          onIsBasladi: id => kaydet({ is: { id, anahtar: 'pdf', kaynaklar } })
        })
        if (sonuc.isBitti || sonuc.reason === 'VPS_IS_BULUNAMADI') await kaydet({ is: null })
        if (!sonuc.ok) { kontrol(); throw new Error(sonuc.reason || 'Eksik PDF işi doğrulanamadı.') }
        const pdfler = sonuc.dosyalar || []
        const dosyalar = [...new Map([...durum.dosyalar, ...pdfler].map(dosya => [dosya.ad, dosya])).values()]
        await kaydet({ is: null, dosyalar, pdfEksik: pdfEksikleri(dosyalar).length, ...(pdfler.length ? { yuklendi: false, arsiv: null } : {}) })
      }
    }
    if (!durum.yuklendi) {
      kontrol()
      onDurum?.(`${durum.dosyalar.length} VPS dosyası MUBİS’e yükleniyor…`)
      const sonuc = await dosyalariMubisYukle({ client, yil, ay, sorguTip: tur, yon, yardimciKaynak: 'sunucu', beklenenDosyalar: durum.dosyalar, zipYoluIle: durum.zipYoluIle, onarim: durum.onarim === true,
        onIlerleme: ilerleme => { const metin = faturaIlerlemeMetni(ilerleme); if (metin) onDurum?.(metin) } })
      yeniSayi = sonuc.sayi || 0
      if (sonuc.manifestGecersiz) await kaydet({ dosyalar: [] })
      const hatali = sonuc.dosyalar?.find(dosya => dosya.hata)
      if (!sonuc.ok || hatali) {
        if (yeniSayi) await kaydet({ sayi: (durum.sayi || 0) + yeniSayi })
        throw Object.assign(new Error(hatali?.hata || sonuc.not || 'Yükleme tamamlanamadı.'), { yeniSayi })
      }
      yuklenenDosyalar = sonuc.dosyalar || []
      await kaydet({ yuklendi: true, onarim: false, sayi: (durum.sayi || 0) + yeniSayi, yuklenenDosyalar: yuklenenDosyalar.filter(dosya => dosya.url).map(({ ad, url }) => ({ ad, url })), not: tur === 'utts' ? sonuc.not : null })
    }

    asama = 'arsiv'
    kontrol()
    onDurum?.('Arşiv klasörüne kopyalanıyor…')
    const arsiv = await edefterTopluKopyala({ client, yil, ay, yon, yardimciKaynak: 'sunucu', dosyalar: faturaKopyalamaDosyalari(durum.dosyalar, yuklenenDosyalar) })
    if (!arsiv.ok && !arsiv.atlandi) throw Object.assign(new Error(arsiv.error || 'Arşiv kopyası eksik kaldı.'), { yeniSayi })
    await kaydet({ arsiv: arsiv.ok ? 'tamam' : 'atlandi' })
    return { durum, yeniSayi, yuklenenDosyalar }
  } catch (hata) {
    if (hata.message !== 'KULLANICI_DURDURDU' && !leaseKayip && hata.code !== 'AKTARIM_BEKLIYOR') {
      const sorun = hata.code === 'LUCA_OTURUM' ? 'oturum' : hata.code === 'LUCA_BEKLENIYOR' || lucaIslemiBelirsiz(hata.message) ? 'bekliyor' : asama
      await kaydet({ sorun }).catch(() => {})
    }
    throw hata
  } finally {
    clearInterval(yenile)
    await Promise.resolve(tabloSorgusu().update({ lease_id: null, lease_until: null }).match({ ...anahtar, lease_id: lease })).catch(() => {})
  }
}
