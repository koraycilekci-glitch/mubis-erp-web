// Beyan Hazirlama — gecici vergi / gelir vergisi / kurumlar vergisi
// beyannamesi hazirlama. Ilk etap: Gelir Gecici Vergi (Isletme) —
// Defter-Beyan Sistemi hesap ozeti okuma + kar oranina gore donem sonu
// emtia mevcudu hesaplama ve portala gonderme akisi.
import { useState, useEffect, useMemo } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useClients } from '../hooks/useClients'
import { gibYardimciDurumu } from '../utils/gibOdemeHelper'
import { getSettings, saveSettings } from '../services/settingsService'
import {
  defterbeyanGiris, defterbeyanHesapOzeti, defterbeyanDonemSonuGonder,
  defterbeyanGeciciVergi, beyannameGeciciOku, defterbeyanOrtaklikBeyanlari,
  defterbeyanOrtakGec, ozetNormalize, karOraniylaHesapla
} from '../services/beyanHazirlamaService'
import { getPartners } from '../services/clientService'
import {
  FileSpreadsheet, HelpCircle, CheckCircle2, XCircle, Loader2,
  Search, RefreshCw, Lock, ArrowRight, Calculator, Send, LogOut
} from 'lucide-react'

const tl = (x) => (x == null ? '—' : Number(x).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const yuvarla2 = (x) => Math.round(x * 100) / 100

const CEYREKLER = {
  1: { bas: '01.01', son: '31.03', ayAd: 'Ocak - Mart' },
  2: { bas: '01.04', son: '30.06', ayAd: 'Nisan - Haziran' },
  3: { bas: '01.07', son: '30.09', ayAd: 'Temmuz - Eylül' },
  4: { bas: '01.10', son: '31.12', ayAd: 'Ekim - Aralık' }
}

const TURLER = [
  { id: 'gecici', ad: 'Geçici Vergi', aktif: true },
  { id: 'gelir', ad: 'Gelir Vergisi', aktif: false },
  { id: 'kurum', ad: 'Kurumlar Vergisi', aktif: false }
]

// Yardimci is hata kodlarini kullanici mesajina cevirir
function isHataMesaji(res) {
  const reason = res?.reason || ''
  const detail = res?.detail || ''
  if (detail) return detail
  if (reason === 'kurulu-degil') return 'Yardımcı program çalışmıyor. MUBiS yardımcı programını bu bilgisayarda kurup çalıştırın.'
  if (reason === 'erisim-engelli') return 'Yardımcı programa tarayıcıdan erişilemiyor — programı güncelleyin (2.7.548+).'
  if (reason === 'bilinmeyen-servis') return 'Bilinmeyen yardımcı servis yanıtı — programı güncelleyin.'
  if (reason === 'servis-yanit-vermedi') return 'Yardımcı program yanıt vermedi (zaman aşımı). Tekrar deneyin.'
  if (reason === 'bilinmeyen') return 'Yardımcı program bu işi desteklemiyor — 2.7.548+ sürümüne güncelleyin.'
  return reason || 'Bilinmeyen hata'
}

export default function BeyanHazirlama() {
  const { clients } = useClients()
  const [tur, setTur] = useState('gecici')
  const [yardimciDurum, setYardimciDurum] = useState(null)
  const [ivd, setIvd] = useState({ kullaniciKodu: '', parola: '' })
  const [ivdKayitli, setIvdKayitli] = useState(false)
  const [ivdAcik, setIvdAcik] = useState(false)
  const [ivdKaydediyor, setIvdKaydediyor] = useState(false)
  const [ivdGoster, setIvdGoster] = useState(false) // sifre goster/gizle

  // Musteri + donem
  const [arama, setArama] = useState('')
  const [secilen, setSecilen] = useState(null)
  const [yil, setYil] = useState(String(new Date().getFullYear()))
  const [ceyrek, setCeyrek] = useState('3')
  const [tarihBas, setTarihBas] = useState('')
  const [tarihSon, setTarihSon] = useState('')

  // Akis durumu: bekliyor | giris | ozet | gonderildi
  const [asama, setAsama] = useState('musteri') // musteri | portal | ozet | gonderildi
  const [mesaj, setMesaj] = useState(null) // { tip: 'ok'|'hata'|'info', metin }
  const [islemSuruyor, setIslemSuruyor] = useState('') // hangi buton calisiyor

  // Hesap ozeti + kar orani
  const [ozet, setOzet] = useState(null)
  const [karOrani, setKarOrani] = useState('5')
  const [donemSonuElle, setDonemSonuElle] = useState(null) // kullanici elle duzeltirse

  // IVD (Dijital/Interaktif Vergi Dairesi) sifreleri MUSTERI sifresinden
  // degil, AYARLAR > GiB BAGLANTI MERKEZI'ndeki admin vergi dairesi
  // hesabindan okunur (admin_gib_kullanici_kodu / admin_gib_parola).
  // Baska hicbir kaynaga bakilmaz — tek kaynak GIB Baglanti Merkezi.
  useEffect(() => {
    gibYardimciDurumu().then(setYardimciDurum)
    getSettings().then(s => {
      const kullanici = s.admin_gib_kullanici_kodu || ''
      const parola = s.admin_gib_parola || ''
      setIvd({ kullaniciKodu: kullanici, parola })
      setIvdKayitli(!!(kullanici && parola))
    }).catch(() => {})
  }, [])

  // Donem degisince tarihleri otomatik kur (kullanici elle degistirmedikce)
  // Hesap ozeti kumulatif oldugu icin BASLANGIC her donemde yil basi:
  // 01.01.yyyy — bitis secilen ceyreğin son gunu.
  useEffect(() => {
    const c = CEYREKLER[ceyrek]
    if (c) {
      setTarihBas(`01.01.${yil}`)
      setTarihSon(`${c.son}.${yil}`)
    }
  }, [ceyrek, yil])

  // 2.7.555: Gelir gecici beyan — iki tur: "İşletme/Serbest Meslek" (2. Sinif +
  // Serbest Meslek birlikte) ve "Bilanço" (1. Sinif, yakında).
  const [gelirTipi, setGelirTipi] = useState('isletme')
  const sinifNormal = (s) => String(s || '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim()
  const isletmeMusterileri = useMemo(() =>
    clients
      .filter(c => {
        // Adi ortaklik: hesap özeti ortaklik dosyasinda yapilir (isletme akisi)
        if (c.type === 'adi_ortaklik') return gelirTipi === 'isletme'
        const s = sinifNormal(c.musteriSinifi)
        // 2.7.575: Bilanço (1. Sinif, gerçek kişi) — şirketler Kurum geçici listesinde
        if (gelirTipi === 'bilanco') return s === '1. sinif' && c.type !== 'company'
        if (gelirTipi === 'kurum') return c.type === 'company' ||
          String(c.taxType || '').toLocaleLowerCase('tr').includes('kurum')
        return s === '2. sinif' || s.includes('serbest meslek')
      })
      .sort((a, b) => String(a.name || a.company || '').localeCompare(
        String(b.name || b.company || ''), 'tr', { sensitivity: 'base' }
      ))
  , [clients, gelirTipi])

  // Tur degisince secili musteri yeni listede yoksa temizlenir
  useEffect(() => {
    if (secilen && !isletmeMusterileri.some(c => c.id === secilen.id)) {
      setSecilen(null); setOzet(null); setDonemSonuElle(null)
    }
  }, [gelirTipi])

  // 2.7.555: Serbest meslek hesap planinda devreden/emtia ve kar orani yok —
  // yalnizca gelir ve gider; donem sonu emtia hesabi yapilmaz.
  const serbestMeslek = secilen ? sinifNormal(secilen.musteriSinifi).includes('serbest meslek') : false

  // 2.7.575: Bilanço esaslı akış (1. Sinif gerçek kişi + Kurum) — kar oranı ve
  // dönem sonu emtia hesabi YOK; ticari kazanç hesap özetinin gelir tablosundan
  // gelir. Portal akışı serbest meslekle aynı: Kaydet + Tamam + Geçici Vergi.
  const bilancoModu = gelirTipi === 'bilanco' || gelirTipi === 'kurum'

  const filtreliMusteriler = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr')
    if (!q) return isletmeMusterileri.slice(0, 60)
    return isletmeMusterileri.filter(c =>
      `${c.name || c.company || ''} ${c.vkn || c.vergi_no || ''}`.toLocaleLowerCase('tr').includes(q)
    ).slice(0, 60)
  }, [isletmeMusterileri, arama])

  const hesap = useMemo(() => {
    if (!ozet || serbestMeslek || bilancoModu) return null
    return karOraniylaHesapla(ozet, Number(karOrani) || 0)
  }, [ozet, karOrani, serbestMeslek, bilancoModu])

  const donemSonuGonderilecek = donemSonuElle != null ? donemSonuElle : (hesap?.donemSonu ?? null)

  // Geçici vergi orani: kurumlar %25, gelir vergisi (gerçek kişi) %15
  const vergiOrani = useMemo(() => {
    if (!secilen) return 15
    const tt = String(secilen.taxType || '').toLocaleLowerCase('tr')
    if (tt.includes('kurum')) return 25
    if (tt.includes('gelir')) return 15
    return secilen.type === 'company' ? 25 : 15
  }, [secilen])
  const vergiTurAdi = vergiOrani === 25 ? 'Kurumlar Vergisi' : 'Gelir Vergisi'
  const odenecekVergi = hesap && hesap.netKar > 0 ? Math.round(hesap.netKar * vergiOrani) / 100 : 0

  // Serbest meslek: kar/zarar = gelirler − giderler (portaldaki Kar/Zarar satiri)
  const smGelir = ozet ? (ozet.hasilat || 0) + (ozet.digerGelirler || 0) : 0
  const smGider = ozet ? (ozet.giderler || 0) + (ozet.amortisman || 0) : 0
  const smKarZarar = ozet ? Math.round((smGelir - smGider) * 100) / 100 : 0
  const smVergi = smKarZarar > 0 ? Math.round(smKarZarar * 15) / 100 : 0

  // Önceki dönemde ödenen geçici vergi (beyanname PDF'inden okunur)
  const [oncekiOdenen, setOncekiOdenen] = useState(null)
  const odenen = oncekiOdenen?.tutar != null ? oncekiOdenen.tutar : 0
  const isletmeBuDonem = Math.round(Math.max(0, odenecekVergi - odenen) * 100) / 100
  const smBuDonem = Math.round(Math.max(0, smVergi - odenen) * 100) / 100

  // Bilanço esaslı: ticari kazanç = portalın Kar satiri (ozet.kar) yoksa
  // gelir tablosu hesabi: (hasilat + diğer gelirler) − giderler − amortisman.
  const bilancoGelirTarafi = ozet ? (ozet.hasilat || 0) + (ozet.digerGelirler || 0) : 0
  const bilancoGiderTarafi = ozet ? (ozet.giderler || 0) + (ozet.amortisman || 0) : 0
  const bilancoKazanc = ozet
    ? (ozet.kar != null ? ozet.kar : Math.round((bilancoGelirTarafi - bilancoGiderTarafi) * 100) / 100)
    : 0
  const bilancoVergi = bilancoModu && bilancoKazanc > 0
    ? Math.round(bilancoKazanc * vergiOrani) / 100
    : 0
  const bilancoBuDonem = Math.round(Math.max(0, bilancoVergi - odenen) * 100) / 100

  // ADI ORTAKLIK: ortak bazında hesaplama. Ortaklik net kari pay oranina göre
  // bölünür; her ortak kendi %15'ini öder. Önceki ödenen, her ortağin KENDI
  // dosyasindaki (G:\Drive'ım\BEYANNAME\<Ortak>) beyanname PDF'inden okunur.
  const adiOrtaklik = secilen?.type === 'adi_ortaklik'
  const [ortaklar, setOrtaklar] = useState([])
  const [ortaklarYukleniyor, setOrtaklarYukleniyor] = useState(false)

  useEffect(() => {
    if (!secilen || secilen.type !== 'adi_ortaklik') { setOrtaklar([]); setOrtaklarYukleniyor(false); return }
    let iptal = false
    ;(async () => {
      setOrtaklarYukleniyor(true)
      let liste = []
      try {
        const plist = await getPartners(secilen.id)
        liste = (plist || []).map(pt => ({
          ad: pt.name || 'Ortak',
          vkn: String(pt.vkn || pt.tc || '').trim(),
          oranHam: pt.hisse_orani
        })).filter(p => p.vkn)
      } catch { liste = [] }
      const esit = liste.length ? Math.round((100 / liste.length) * 100) / 100 : 0
      liste = liste.map(p => {
        const o = parseFloat(String(p.oranHam || '').replace(',', '.').replace('%', ''))
        return { ...p, oran: (!isNaN(o) && o > 0) ? o : esit }
      })
      if (iptal) return
      setOrtaklar(liste.map(p => ({ ...p, odenen: null, odenenHata: '' })))
      setOrtaklarYukleniyor(false)
      // Önceki dönem beyannamelerini her ortağin KENDI klasöründen sirayla oku
      const pd = Number(ceyrek) === 1
        ? { yil: Number(yil) - 1, donem: 4 }
        : { yil: Number(yil), donem: Number(ceyrek) - 1 }
      for (const p of liste) {
        if (iptal) return
        try {
          const r = await beyannameGeciciOku(p.ad, pd.yil, pd.donem)
          if (iptal) return
          setOrtaklar(prev => prev.map(x => x.vkn === p.vkn
            ? { ...x, odenen: r.ok && r.tutar != null ? r.tutar : null, odenenHata: r.ok ? '' : (r.reason || r.error || 'okunamadi') }
            : x))
        } catch {
          if (iptal) return
          setOrtaklar(prev => prev.map(x => x.vkn === p.vkn ? { ...x, odenen: null, odenenHata: 'yardimci yanit vermedi' } : x))
        }
      }
    })()
    return () => { iptal = true }
  }, [secilen?.id, ceyrek, yil])

  const ortakHesaplar = useMemo(() => {
    if (!adiOrtaklik || !ortaklar.length) return []
    const netKar = hesap?.netKar ?? 0
    return ortaklar.map(p => {
      const karPayi = netKar > 0 ? Math.round(netKar * (p.oran || 0)) / 100 : 0
      const hesaplanan = karPayi > 0 ? Math.round(karPayi * 15) / 100 : 0
      const odenenP = p.odenen != null ? p.odenen : 0
      const buDonem = Math.round(Math.max(0, hesaplanan - odenenP) * 100) / 100
      return { ...p, karPayi, hesaplanan, odenenP, buDonem }
    })
  }, [adiOrtaklik, ortaklar, hesap])

  const musterilerYuklendi = clients.length > 0

  async function kaydetIvd() {
    setIvdKaydediyor(true)
    try {
      // GiB Baglanti Merkezi kaynak ayarlarina yaz (tek kaynak)
      await saveSettings({
        admin_gib_kullanici_kodu: ivd.kullaniciKodu.trim(),
        admin_gib_parola: ivd.parola
      })
      setIvdKayitli(!!(ivd.kullaniciKodu.trim() && ivd.parola))
      setIvdAcik(false)
      setMesaj({ tip: 'ok', metin: 'Dijital vergi dairesi bilgileri Ayarlar > GİB Bağlantı Merkezi\'ne kaydedildi.' })
    } catch (e) {
      setMesaj({ tip: 'hata', metin: 'Bilgiler kaydedilemedi: ' + (e.message || '') })
    }
    setIvdKaydediyor(false)
  }

  function mesajYardimciHata(res, ilkAdim) {
    const m = isHataMesaji(res)
    setMesaj({ tip: 'hata', metin: m })
    if (ilkAdim) setAsama(ilkAdim)
  }

  // ADIM 1 — portal girisi
  async function portalGirisi() {
    if (!ivd.kullaniciKodu.trim() || !ivd.parola) {
      setIvdAcik(true)
      setMesaj({ tip: 'info', metin: 'Önce vergi dairesi kullanıcı kodu ve şifrenizi girip kaydedin.' })
      return
    }
    if (!secilen) { setMesaj({ tip: 'info', metin: 'Önce müşteri seçin.' }); return }
    setMesaj(null)
    setIslemSuruyor('giris')
    const res = await defterbeyanGiris(ivd.kullaniciKodu.trim(), ivd.parola)
    setIslemSuruyor('')
    if (!res.ok) { mesajYardimciHata(res, 'musteri'); return }
    setAsama('portal')
    setMesaj({ tip: 'ok', metin: `${secilenAd} için portal oturumu hazır. Şimdi hesap özetini getirin.` })
  }

  // ADIM 2 — mukellef gecisi + hesap ozeti
  async function hesapOzetiGetir() {
    if (!secilen || !tarihBas || !tarihSon) return
    setMesaj(null)
    setIslemSuruyor('ozet')
    setOzet(null)
    setDonemSonuElle(null)
    const res = await defterbeyanHesapOzeti(secilen.vkn, tarihBas, tarihSon, ivd.kullaniciKodu.trim(), ivd.parola)
    setIslemSuruyor('')
    if (!res.ok) { mesajYardimciHata(res, 'portal'); return }
    const o = ozetNormalize(res)
    setOzet(o)
    setAsama('ozet')
    setMesaj({ tip: 'ok', metin: `Hesap özeti alındı${o.unvan ? ` (${o.unvan})` : ''}.${bilancoModu ? ' Bilanço esaslı: kar oranı yok, ticari kazanç gelir tablosundan gelir.' : serbestMeslek ? ' Serbest meslek: kar oranı yok, onaylayıp portala bırakın.' : ' Kar oranını girip onaylayın.'}` })
    oncekiOdenenOku()
  }

  // Önceki dönem beyannamesinden (yerel PDF) ödenen geçici vergiyi okur.
  // 1. dönemde önceki yılın 4. dönemi esas alınır.
  // Adi ortaklıkta kullanilmaz — ortak bazinda ayri okuma yapilir.
  async function oncekiOdenenOku() {
    if (!secilen || secilen.type === 'adi_ortaklik') return
    setOncekiOdenen(null)
    const pd = Number(ceyrek) === 1
      ? { yil: Number(yil) - 1, donem: 4 }
      : { yil: Number(yil), donem: Number(ceyrek) - 1 }
    try {
      const r = await beyannameGeciciOku(secilen.name || secilen.company || secilen.unvan || secilen.ad || '', pd.yil, pd.donem)
      if (r.ok && r.tutar != null) setOncekiOdenen({ tutar: r.tutar, yil: pd.yil, donem: pd.donem })
      else setOncekiOdenen({ tutar: null, yil: pd.yil, donem: pd.donem, hata: r.reason || r.error || 'okunamadi' })
    } catch {
      setOncekiOdenen({ tutar: null, yil: pd.yil, donem: pd.donem, hata: 'yardimci yanit vermedi' })
    }
  }

  // ADIM 3 — onay + donem sonu gonderimi
    // Bilanço esaslı (1. Sinif + Kurum) ve serbest meslekte portala yazılacak
    // dönem sonu emtia yoktur — onay sonrasi yardimci program Kaydet + popup
    // Tamam'a basar, Beyannameler > Geçici Vergi ekranini acip Oluştur'a basar.
  // ADI ORTAKLIK: hesap özeti ortaklik dosyasinda yapilir; ortaklik kendi
  // geçici vergi beyannamesi VERMEZ. Sonrasinda yardimci program Mükellef
  // Yönetimi'ne gelir ve 1. ortağin VKN'siyle Geçici Vergi doldurma ekranini
  // açar. Kullanici "Diğer Ortağa Geç" ile siradaki ortağa atlar; ortaklar
  // bitince "Diğer Müşteriye Devam Et" çikar.
  async function onaylaGonder() {
    if (secilen?.type === 'adi_ortaklik') {
      if (donemSonuGonderilecek == null) return
      setMesaj(null)
      setIslemSuruyor('gonder')
      const res = await defterbeyanDonemSonuGonder(donemSonuGonderilecek)
      if (!res.ok) { setIslemSuruyor(''); mesajYardimciHata(res, 'ozet'); return }
      const o = ozetNormalize(res)
      if (o.donemBasiEmtia != null || o.hasilat != null) setOzet(prev => ({ ...(prev || o), ...o }))
      // Ortaklari çek — VKN/TC olanlar
      let liste = []
      try {
        const plist = await getPartners(secilen.id)
        liste = (plist || []).map(pt => ({ ad: pt.name, vkn: String(pt.vkn || pt.tc || '').trim() }))
          .filter(p => p.vkn)
      } catch { /* partners okunamadi — bos liste */ }
      if (!liste.length) {
        setIslemSuruyor('')
        setAsama('gonderildi')
        setMesaj({ tip: 'hata', metin: 'Hesap özeti ortaklık dosyasında yazıldı/kaydedildi ama ortak bulunamadi — Ortaklar/Yetkililer sekmesinden ortaklari TC/VKN ile girin, sonra tekrar onaylayin.' })
        return
      }
      setOrtakSirasi(liste)
      setOrtakIdx(0)
      // 1. ortağin beyanname doldurma ekranini aç
      const g = await defterbeyanOrtakGec(liste[0].vkn, yil, Number(ceyrek) * 3)
      setIslemSuruyor('')
      setAsama('gonderildi')
      if (!g.ok) {
        setMesaj({ tip: 'hata', metin: `Hesap özeti ortaklıkta tamam; 1. ortak (${liste[0].ad} — ${liste[0].vkn}) için beyanname açilamadi: ${g.reason || g.error || '?'} Portaldan elle devam edin veya Diğer Ortağa Geç ile siradakine atlayin.` })
        return
      }
      setMesaj({ tip: 'ok', metin: `Hesap özeti ortaklık dosyasında tamam; 1. ortak ${liste[0].ad} (${liste[0].vkn}) adina Geçici Vergi doldurma ekranı açildi. Doldurup imzalayin; bitince "Diğer Ortağa Geç"e basın.` })
      return
    }
    if (serbestMeslek || bilancoModu) {
      setMesaj(null)
      setIslemSuruyor('gonder')
      const gv = await defterbeyanGeciciVergi(yil, Number(ceyrek) * 3)
      setIslemSuruyor('')
      if (!gv.ok) {
        setAsama('gonderildi')
        setMesaj({ tip: 'hata', metin: `Portalda Kaydet/Geçici Vergi adimi basarisiz: ${gv.error || '?'} Portaldan elle devam edin (Kaydet → Tamam → Beyannameler > Geçici Vergi).` })
        return
      }
      setAsama('gonderildi')
      setMesaj({ tip: 'ok', metin: `Hesap özeti kaydedildi (Kaydet + Tamam basildi); Beyannameler > Geçici Vergi (${yil} — ${CEYREKLER[ceyrek]?.ayAd || ''}) açılıp Oluştur'a basildi. Beyanname doldurma ekranından sonrası size ait. Bitince Devam'a basın.` })
      return
    }
    if (donemSonuGonderilecek == null) return
    setMesaj(null)
    setIslemSuruyor('gonder')
    const res = await defterbeyanDonemSonuGonder(donemSonuGonderilecek)
    if (!res.ok) { setIslemSuruyor(''); mesajYardimciHata(res, 'ozet'); return }
    // Portalin guncel ozetini de tabloya yansit
    const o = ozetNormalize(res)
    if (o.donemBasiEmtia != null || o.hasilat != null) setOzet(prev => ({ ...(prev || o), ...o }))
    // 4) Hesap özeti tamam — Kaydet + Beyannameler > Geçici Vergi > Oluştur
    const gv = await defterbeyanGeciciVergi(yil, Number(ceyrek) * 3)
    setIslemSuruyor('')
    if (!gv.ok) {
      setAsama('gonderildi')
      setMesaj({ tip: 'hata', metin: `Dönem sonu portala yazıldı ama Geçici Vergi formu açılamadi: ${gv.error || '?'} Portaldan elle devam edin.` })
      return
    }
    setAsama('gonderildi')
    setMesaj({ tip: 'ok', metin: `Dönem sonu yazıldı, hesap özeti kaydedildi; Beyannameler > Geçici Vergi (${yil} — ${CEYREKLER[ceyrek]?.ayAd || ''}) açılıp Oluştur'a basildi. Beyanname doldurma ekranından sonrası size ait. Bitince Devam'a basın.` })
  }

  function devamEt() {
    setAsama('devam')
    setMesaj({ tip: 'info', metin: 'Tamam\'a basıp listeden yeni müşteri seçin — işlemler aynı adımlarla tekrarlanacak.' })
  }

  // Adi ortaklik: siradaki ortağa geç (kendi hesabıma dön → mükellef yönetimi
  // → VKN yaz → hızlı geçiş → Geçici Vergi doldurma ekranı)
  const [ortakSirasi, setOrtakSirasi] = useState([])
  const [ortakIdx, setOrtakIdx] = useState(-1)

  async function digerOrtagaGec() {
    const sira = ortakIdx + 1
    if (sira >= ortakSirasi.length) { devamEt(); return }
    const ortak = ortakSirasi[sira]
    setMesaj(null)
    setIslemSuruyor('ortak')
    const g = await defterbeyanOrtakGec(ortak.vkn, yil, Number(ceyrek) * 3)
    setIslemSuruyor('')
    if (!g.ok) {
      setOrtakIdx(sira)
      setMesaj({ tip: 'hata', metin: `${ortak.ad} (${ortak.vkn}) için beyanname açilamadi: ${g.reason || g.error || '?'} Portaldan elle devam edin veya tekrar Diğer Ortağa Geç'e basin.` })
      return
    }
    setOrtakIdx(sira)
    setMesaj({ tip: 'ok', metin: `${sira + 1}/${ortakSirasi.length} — ${ortak.ad} (${ortak.vkn}) adina Geçici Vergi doldurma ekranı açildi. Doldurup imzalayin; bitince ${sira + 1 < ortakSirasi.length ? '"Diğer Ortağa Geç"e' : '"Diğer Müşteriye Devam Et"e'} basın.` })
  }

  function tamamYeniMusteri() {
    setSecilen(null)
    setOzet(null)
    setDonemSonuElle(null)
    setAsama('musteri')
    setMesaj(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function oturumuKapat() {
    setIslemSuruyor('kapat')
    await defterbeyanKapat().catch(() => {})
    setIslemSuruyor('')
    setAsama('musteri')
    setMesaj({ tip: 'info', metin: 'Defter-Beyan sekmeleri kapatıldı.' })
  }

  const secilenAd = secilen ? (secilen.name || secilen.company || secilen.unvan || '') : ''
  const girisAsamasinda = asama === 'portal' || asama === 'ozet' || asama === 'gonderildi' || asama === 'devam'

  return (
    <div className="space-y-6">
      {/* Baslik */}
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <FileSpreadsheet className="w-7 h-7 text-yellow-400" /> Beyan Hazırlama
        </h2>
        <p className="text-gray-400 text-sm mt-1">
          Defter-Beyan Sistemi hesap özetini okur, kar oranına göre dönem sonu emtia mevcudunu hesaplar ve portala aktarır.
        </p>
      </div>

      {/* Tur secimi */}
      <div className="bg-blue-950/40 rounded-2xl p-5 border border-blue-800/30">
        <div className="flex flex-wrap gap-2">
          {TURLER.map(t => (
            <button
              key={t.id}
              onClick={() => t.aktif && setTur(t.id)}
              disabled={!t.aktif}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                !t.aktif ? 'bg-blue-900/20 text-gray-500 cursor-not-allowed border border-blue-800/20'
                  : tur === t.id ? 'bg-yellow-400 text-blue-950 shadow-lg shadow-yellow-500/30'
                  : 'bg-blue-900/40 text-blue-200 hover:bg-blue-800/60 border border-blue-700/30'
              }`}
            >
              {t.ad}{!t.aktif && <span className="ml-2 text-[10px] uppercase tracking-wide">Yakında</span>}
            </button>
          ))}
        </div>
        {tur === 'gecici' && (
          <div className="mt-4 pt-4 border-t border-blue-800/30 flex flex-wrap gap-2 items-center">
            <span className="text-blue-300 text-xs font-semibold uppercase tracking-wide mr-1">Gelir Geçici:</span>
            <button
              type="button"
              onClick={() => setGelirTipi('isletme')}
              className={gelirTipi === 'isletme'
                ? 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-yellow-400 text-blue-950'
                : 'px-3 py-1.5 rounded-lg text-xs text-gray-300 bg-blue-900/20 border border-blue-800/20 hover:border-blue-600'}
            >İşletme/Serbest Meslek</button>
            <button
              type="button"
              onClick={() => setGelirTipi('bilanco')}
              className={gelirTipi === 'bilanco'
                ? 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-yellow-400 text-blue-950'
                : 'px-3 py-1.5 rounded-lg text-xs text-gray-300 bg-blue-900/20 border border-blue-800/20 hover:border-blue-600'}
            >Bilanço (1. Sınıf)</button>
            <span className="ml-3 text-blue-300 text-xs font-semibold uppercase tracking-wide">Kurum Geçici:</span>
            <button
              type="button"
              onClick={() => setGelirTipi('kurum')}
              className={gelirTipi === 'kurum'
                ? 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-yellow-400 text-blue-950'
                : 'px-3 py-1.5 rounded-lg text-xs text-gray-300 bg-blue-900/20 border border-blue-800/20 hover:border-blue-600'}
            >Kurumlar Vergisi Mükellefi</button>
          </div>
        )}
      </div>

      {/* Yardimci + IVD bilgileri */}
      <div className="bg-blue-950/40 rounded-2xl p-5 border border-blue-800/30 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-blue-300 text-xs font-semibold uppercase tracking-wide">Yardımcı Program:</span>
          {yardimciDurum === 'ok'
            ? <span className="inline-flex items-center gap-1.5 text-green-400 text-sm font-medium"><CheckCircle2 className="w-4 h-4" /> Çalışıyor</span>
            : <span className="inline-flex items-center gap-1.5 text-red-400 text-sm font-medium"><XCircle className="w-4 h-4" /> Çalışmıyor — yardımcı programı başlatın</span>}
          <span className="flex-1" />
          <button onClick={() => setIvdAcik(a => !a)} className="inline-flex items-center gap-1.5 text-xs text-blue-300 hover:text-white border border-blue-700/40 px-3 py-1.5 rounded-lg">
            <Lock className="w-3.5 h-3.5" /> Dijital VD Şifreleri {ivdKayitli ? '(GİB Bağlantı Merkezi)' : '(boş)'}
          </button>
        </div>
        {ivdAcik && (
          <div className="pt-2 border-t border-blue-800/30 grid md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Dijital VD Kullanıcı Kodu</label>
              <input value={ivd.kullaniciKodu} onChange={e => setIvd(p => ({ ...p, kullaniciKodu: e.target.value }))}
                className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" placeholder="örn. 25612114" />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Dijital VD Şifresi</label>
              <div className="relative">
                <input type={ivdGoster ? 'text' : 'password'} value={ivd.parola} onChange={e => setIvd(p => ({ ...p, parola: e.target.value }))}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 pr-10 text-white text-sm" />
                <button type="button" onClick={() => setIvdGoster(g => !g)} title={ivdGoster ? 'Şifreyi gizle' : 'Şifreyi göster'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                  {ivdGoster ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button onClick={kaydetIvd} disabled={ivdKaydediyor}
              className="bg-yellow-500 text-blue-950 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-yellow-400 disabled:opacity-50 flex items-center gap-2">
              {ivdKaydediyor ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Kaydet
            </button>
          </div>
        )}
      </div>

      {/* Mesaj bandi */}
      {mesaj && (
        <div className={`rounded-xl px-4 py-3 text-sm border ${
          mesaj.tip === 'ok' ? 'bg-green-600/15 text-green-300 border-green-600/30'
            : mesaj.tip === 'hata' ? 'bg-red-600/15 text-red-300 border-red-600/30'
            : 'bg-blue-600/15 text-blue-200 border-blue-600/30'}`}>
          {mesaj.metin}
        </div>
      )}

      {/* Musteri secimi + akis */}
      <div className="grid lg:grid-cols-[340px_1fr] gap-6 items-start">
        {/* Sol: musteri listesi */}
        <div className="bg-blue-950/40 rounded-2xl p-4 border border-blue-800/30">
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input value={arama} onChange={e => setArama(e.target.value)} placeholder="Müşteri / VKN ara…"
                className="w-full bg-blue-900/30 border border-blue-700/40 rounded-lg py-2 pl-9 pr-3 text-white text-sm placeholder-gray-500" />
            </div>
          </div>
          <div className="max-h-[420px] overflow-y-auto space-y-1.5">
            {!musterilerYuklendi && <p className="text-gray-500 text-sm text-center py-6">Müşteriler yükleniyor…</p>}
            {filtreliMusteriler.map(c => {
              const vkn = String(c.vkn || c.vergi_no || '')
              const seciliMi = secilen && String(secilen.id) === String(c.id)
              return (
                <button key={c.id}
                  onClick={() => {
                    if (asama === 'gonderildi' || asama === 'devam') return // Devam/Tamam bekleniyor
                    setSecilen(c); setOzet(null); setDonemSonuElle(null); setAsama('musteri'); setMesaj(null)
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                    seciliMi ? 'bg-yellow-400/15 border-yellow-500/50'
                      : 'border-transparent hover:bg-blue-800/40'}`}>
                  <div className={`text-sm font-medium truncate ${seciliMi ? 'text-yellow-300' : 'text-gray-200'}`}>{c.name || c.company || c.unvan || 'Müşteri'}</div>
                  <div className="text-[11px] text-gray-500">{vkn || 'VKN yok'}</div>
                </button>
              )
            })}
            {musterilerYuklendi && filtreliMusteriler.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-6">
                {isletmeMusterileri.length === 0
                  ? (gelirTipi === 'bilanco'
                      ? 'Bilanço (1. Sınıf) sınıfında müşteri yok.'
                      : gelirTipi === 'kurum'
                        ? 'Kurumlar vergisi mükellefi (şirket) yok.'
                        : 'İşletme (2. Sınıf) veya Serbest Meslek sınıfında müşteri yok.')
                  : 'Aramaya uyan müşteri yok.'}
              </p>
            )}
          </div>
        </div>

        {/* Sag: donem + akis */}
        <div className="space-y-6">
          {!secilen && (
            <div className="bg-blue-950/40 rounded-2xl p-10 border border-blue-800/30 text-center">
              <HelpCircle className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">İşlem yapılacak müşteriyi soldaki listeden seçin.</p>
              <p className="text-gray-600 text-xs mt-2">Akış: Portala Giriş → Hesap Özeti Getir → Kar Oranı + Onay → Portala Gönder → Devam → Tamam → yeni müşteri.</p>
            </div>
          )}

          {secilen && (
            <>
              {/* Secilen musteri + donem */}
              <div className="bg-blue-950/40 rounded-2xl p-5 border border-blue-800/30 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <p className="text-gray-400 text-xs">Seçili Müşteri</p>
                    <p className="text-white font-semibold">{secilenAd}</p>
                    <p className="text-gray-500 text-xs">VKN: {String(secilen.vkn || secilen.vergi_no || '—')}</p>
                  </div>
                  <span className="flex-1" />
                  {girisAsamasinda && (
                    <button onClick={oturumuKapat} disabled={islemSuruyor === 'kapat'}
                      className="inline-flex items-center gap-1.5 text-xs text-red-300 hover:text-white border border-red-500/30 px-3 py-1.5 rounded-lg">
                      <LogOut className="w-3.5 h-3.5" /> Oturumu Kapat
                    </button>
                  )}
                </div>

                <div className="grid md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">Yıl</label>
                    <select value={yil} onChange={e => setYil(e.target.value)}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm">
                      {Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - i)).map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">Dönem</label>
                    <select value={ceyrek} onChange={e => setCeyrek(e.target.value)}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm">
                      {Object.entries(CEYREKLER).map(([no, c]) => <option key={no} value={no}>{no}. Çeyrek ({c.ayAd})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">Başlangıç Tarihi</label>
                    <input value={tarihBas} onChange={e => setTarihBas(e.target.value)} placeholder="gg.aa.yyyy"
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">Bitiş Tarihi</label>
                    <input value={tarihSon} onChange={e => setTarihSon(e.target.value)} placeholder="gg.aa.yyyy"
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
                  </div>
                </div>
              </div>

              {/* Akis adimlari */}
              <div className="bg-blue-950/40 rounded-2xl p-5 border border-blue-800/30 space-y-5">
                {/* ADIM 1 */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="w-7 h-7 shrink-0 rounded-full bg-yellow-500 text-blue-950 font-bold text-sm flex items-center justify-center">1</span>
                  <button onClick={portalGirisi} disabled={islemSuruyor !== ''}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center gap-2">
                    {islemSuruyor === 'giris' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    Portala Giriş
                  </button>
                  {asama !== 'musteri' && <span className="text-green-400 text-sm flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Oturum hazır</span>}
                  <span className="text-gray-500 text-xs">Defter-Beyan Sistemi'ne vergi dairesi kimliğiyle girilir (güvenlik kodu otomatik çözülür).</span>
                </div>

                {/* ADIM 2 */}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <span className="w-7 h-7 shrink-0 rounded-full bg-yellow-500 text-blue-950 font-bold text-sm flex items-center justify-center">2</span>
                  <button onClick={hesapOzetiGetir} disabled={islemSuruyor !== '' || asama === 'musteri'}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center gap-2">
                    {islemSuruyor === 'ozet' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Hesap Özeti Getir
                  </button>
                  {ozet && <span className="text-green-400 text-sm flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Alındı</span>}
                  <span className="text-gray-500 text-xs">Mükellefe hızlı geçiş yapılır; Muhasebe Bilgileri → Hesap Özeti (Mali) seçili dönem için oluşturulup okunur.</span>
                </div>

                {/* Hesap ozeti tablosu */}
                {ozet && (
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="rounded-xl overflow-hidden border border-blue-700/30">
                      <div className="bg-blue-800/40 px-4 py-2 text-blue-200 text-sm font-semibold">GİDERLER</div>
                      {[
                        ['Dönem Başı Emtia Mevcudu', ozet.donemBasiEmtia],
                        ['Dönem İçinde Satın Alınan Emtia', ozet.satinAlinanEmtia],
                        ['Giderler', ozet.giderler],
                        ['Amortisman Giderleri', ozet.amortisman]
                      ].map(([ad, v]) => (
                        <div key={ad} className="flex justify-between px-4 py-2 text-sm border-t border-blue-800/20">
                          <span className="text-gray-300">{ad}</span>
                          <span className="text-white font-mono">{tl(v)}</span>
                        </div>
                      ))}
                      {!serbestMeslek && !bilancoModu && (
                        <>
                          <div className="flex justify-between px-4 py-2 text-sm border-t border-blue-800/20 bg-blue-900/20">
                            <span className="text-gray-300">Satılan Mal Maliyeti (hesaplanan)</span>
                            <span className="text-white font-mono">{tl(hesap?.smm ?? 0)}</span>
                          </div>
                          <div className="flex justify-between px-4 py-2 text-sm border-t border-blue-800/20 bg-blue-900/20">
                            <span className="text-gray-300">Devreden Mal / Dönem Sonu Emtia (hesaplanan)</span>
                            <span className="text-white font-mono">{tl(hesap?.donemSonu ?? 0)}</span>
                          </div>
                        </>
                      )}
                      {!serbestMeslek && !bilancoModu && (
                        <div className="flex justify-between px-4 py-2 text-sm border-t-2 border-blue-600/40 bg-blue-900/30">
                          <span className="text-blue-200 font-bold">{(hesap?.netKar ?? 0) >= 0 ? 'Net Kar' : 'Net Zarar'}</span>
                          <span className="text-yellow-300 font-bold font-mono">{hesap ? tl(Math.abs(hesap.netKar)) : tl(ozet.donemSonuEmtia)}</span>
                        </div>
                      )}
                      {!serbestMeslek && !adiOrtaklik && hesap && (
                        <>
                          <div className="flex justify-between px-4 py-2 text-sm border-t-2 border-green-600/40 bg-green-900/20">
                            <span className={hesap.netKar > 0 ? 'text-green-300 font-bold' : 'text-gray-400'}>
                              Hesaplanan Geçici Vergi (%{vergiOrani} — {vergiTurAdi})
                            </span>
                            <span className={hesap.netKar > 0 ? 'text-green-300 font-bold font-mono' : 'text-gray-500 font-mono text-sm'}>
                              {hesap.netKar > 0 ? <>{tl(hesap.netKar)} × %{vergiOrani} = {tl(odenecekVergi)}</> : '— (net zarar, hesaplanmadı)'}
                            </span>
                          </div>
                          <div className="flex justify-between px-4 py-2 text-sm border-t border-green-600/20">
                            <span className="text-gray-300">Önceki dönemde ödenen geçici vergi{oncekiOdenen ? ` (${oncekiOdenen.donem}. dönem ${oncekiOdenen.yil})` : ''}</span>
                            <span className="text-gray-300 font-mono">
                              {oncekiOdenen == null ? (
                                <span className="text-gray-500 text-xs">okunuyor…</span>
                              ) : oncekiOdenen.tutar != null ? (
                                tl(odenen)
                              ) : (
                                <span className="text-gray-500 text-xs" title={oncekiOdenen.hata || ''}>— okunamadı ({oncekiOdenen.hata || 'bilinmiyor'}), 0 alındı</span>
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between px-4 py-2 text-sm border-t-2 border-green-600/40 bg-green-900/20">
                            <span className="text-green-200 font-bold">Bu Dönem Ödenecek Geçici Vergi</span>
                            <span className="text-green-200 font-bold font-mono">{tl(odenecekVergi)} − {tl(odenen)} = {tl(isletmeBuDonem)}</span>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="rounded-xl overflow-hidden border border-blue-700/30">
                      <div className="bg-blue-800/40 px-4 py-2 text-blue-200 text-sm font-semibold">GELİRLER</div>
                      {[
                        ['Dönem İçinde Elde Edilen Hasılat', ozet.hasilat],
                        ['Gelir Diğer Gelirler', ozet.digerGelirler]
                      ].map(([ad, v]) => (
                        <div key={ad} className="flex justify-between px-4 py-2 text-sm border-t border-blue-800/20">
                          <span className="text-gray-300">{ad}</span>
                          <span className="text-white font-mono">{tl(v)}</span>
                        </div>
                      ))}
                      {!serbestMeslek && !bilancoModu ? (
                        <div className="flex justify-between items-center px-4 py-2 text-sm border-t border-blue-800/20 bg-yellow-400/10">
                          <span className="text-yellow-300 font-bold">Dönem Sonu Emtia Mevcudu</span>
                          <input
                            type="text"
                            value={donemSonuGonderilecek != null ? String(donemSonuGonderilecek).replace('.', ',') : ''}
                            onChange={e => {
                              const v = Number(String(e.target.value).replace(/\./g, '').replace(',', '.'))
                              setDonemSonuElle(isNaN(v) ? null : yuvarla2(v))
                            }}
                            className="w-36 bg-blue-900/40 border border-yellow-500/40 rounded-lg px-2 py-1 text-yellow-300 font-mono text-sm text-right"
                          />
                        </div>
                      ) : bilancoModu ? (
                        <>
                          <div className="flex justify-between px-4 py-2 text-sm border-t border-blue-800/20">
                            <span className="text-gray-300">Dönem Sonu Emtia Mevcudu</span>
                            <span className="text-gray-500 text-xs font-mono">— (bilanço esaslı)</span>
                          </div>
                          <div className="flex justify-between px-4 py-2 text-sm border-t border-blue-800/20 bg-blue-900/20">
                            <span className={bilancoKazanc >= 0 ? 'text-green-300 font-bold' : 'text-red-300 font-bold'}>{bilancoKazanc >= 0 ? 'Ticari Kazanç (Kar)' : 'Ticari Zarar'}</span>
                            <span className={`font-bold font-mono ${bilancoKazanc >= 0 ? 'text-green-300' : 'text-red-300'}`}>{tl(Math.abs(bilancoKazanc))}</span>
                          </div>
                          <div className="flex justify-between px-4 py-1 text-xs border-t border-blue-800/10">
                            <span className="text-gray-500">{tl(bilancoGelirTarafi)} gelir − {tl(bilancoGiderTarafi)} gider (gelir tablosu)</span>
                            <span />
                          </div>
                          <div className="flex justify-between px-4 py-2 text-sm border-t-2 border-green-600/40 bg-green-900/20">
                            <span className={bilancoKazanc > 0 ? 'text-green-300 font-bold' : 'text-gray-400'}>
                              Hesaplanan Geçici Vergi (%{vergiOrani} — {vergiTurAdi})
                            </span>
                            <span className={bilancoKazanc > 0 ? 'text-green-300 font-bold font-mono' : 'text-gray-500 font-mono text-sm'}>
                              {bilancoKazanc > 0 ? <>{tl(bilancoKazanc)} × %{vergiOrani} = {tl(bilancoVergi)}</> : `— (zarar ${tl(Math.abs(bilancoKazanc))}, hesaplanmadı)`}
                            </span>
                          </div>
                          <div className="flex justify-between px-4 py-2 text-sm border-t border-green-600/20">
                            <span className="text-gray-300">Önceki dönemde ödenen geçici vergi{oncekiOdenen ? ` (${oncekiOdenen.donem}. dönem ${oncekiOdenen.yil})` : ''}</span>
                            <span className="text-gray-300 font-mono">
                              {oncekiOdenen == null ? (
                                <span className="text-gray-500 text-xs">okunuyor…</span>
                              ) : oncekiOdenen.tutar != null ? (
                                tl(odenen)
                              ) : (
                                <span className="text-gray-500 text-xs" title={oncekiOdenen.hata || ''}>— okunamadı ({oncekiOdenen.hata || 'bilinmiyor'}), 0 alındı</span>
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between px-4 py-2 text-sm border-t-2 border-green-600/40 bg-green-900/20">
                            <span className="text-green-200 font-bold">Bu Dönem Ödenecek Geçici Vergi</span>
                            <span className="text-green-200 font-bold font-mono">{tl(bilancoVergi)} − {tl(odenen)} = {tl(bilancoBuDonem)}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between px-4 py-2 text-sm border-t border-blue-800/20">
                            <span className="text-gray-300">Dönem Sonu Emtia Mevcudu</span>
                            <span className="text-gray-500 text-xs font-mono">— (serbest meslek)</span>
                          </div>
                          <div className="flex justify-between px-4 py-2 text-sm border-t border-blue-800/20 bg-blue-900/20">
                            <span className={smKarZarar >= 0 ? 'text-green-300 font-bold' : 'text-red-300 font-bold'}>{smKarZarar >= 0 ? 'Kar' : 'Zarar'}</span>
                            <span className={`font-bold font-mono ${smKarZarar >= 0 ? 'text-green-300' : 'text-red-300'}`}>{tl(Math.abs(smKarZarar))}</span>
                          </div>
                          <div className="flex justify-between px-4 py-1 text-xs border-t border-blue-800/10">
                            <span className="text-gray-500">{tl(smGelir)} gelir − {tl(smGider)} gider</span>
                            <span />
                          </div>
                        </>
                      )}
                      <div className="flex justify-between px-4 py-2 text-sm border-t-2 border-blue-600/40 bg-blue-900/30">
                        <span className="text-blue-200 font-bold">Genel Toplam</span>
                        <span className="text-white font-bold font-mono">{(serbestMeslek || bilancoModu) ? tl((ozet.hasilat || 0) + (ozet.digerGelirler || 0)) : tl((ozet.hasilat || 0) + (ozet.digerGelirler || 0) + (donemSonuGonderilecek || 0))}</span>
                      </div>
                      {adiOrtaklik && (
                        <div className="border-t-2 border-green-600/40 bg-green-900/10 px-4 py-3">
                          <div className="text-sm font-semibold text-green-300 mb-2">
                            Ortak Bazında Geçici Vergi — net kardan pay oranina göre, önceki ödenen her ortağin kendi beyannamesinden
                          </div>
                          {ortaklarYukleniyor ? (
                            <div className="text-xs text-gray-400">Ortaklar yükleniyor…</div>
                          ) : ortakHesaplar.length === 0 ? (
                            <div className="text-xs text-red-300">Ortak bulunamadi — Ortaklar/Yetkililer sekmesinden ortaklari TC/VKN ile girin.</div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-blue-200">
                                    <th className="text-left py-1 pr-2 font-semibold">Ortak</th>
                                    <th className="text-right py-1 px-1 font-semibold">Pay</th>
                                    <th className="text-right py-1 px-1 font-semibold">Kar Payı</th>
                                    <th className="text-right py-1 px-1 font-semibold">Hesaplanan GV (%15)</th>
                                    <th className="text-right py-1 px-1 font-semibold">Önceki Ödenen</th>
                                    <th className="text-right py-1 pl-1 font-semibold">Bu Dönem Ödenecek</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {ortakHesaplar.map(p => (
                                    <tr key={p.vkn} className="border-t border-blue-800/20">
                                      <td className="py-1.5 pr-2 text-white">{p.ad}</td>
                                      <td className="text-right px-1 text-gray-300 font-mono">%{p.oran}</td>
                                      <td className="text-right px-1 text-white font-mono">{tl(p.karPayi)}</td>
                                      <td className="text-right px-1 text-green-300 font-mono">{tl(p.hesaplanan)}</td>
                                      <td className="text-right px-1 text-gray-300 font-mono" title={p.odenenHata || ''}>
                                        {p.odenen == null ? <span className="text-gray-500">okunuyor…</span> : p.odenenP != null ? tl(p.odenenP) : <span className="text-gray-500">— okunamadı, 0 alındı</span>}
                                      </td>
                                      <td className="text-right pl-1 text-green-200 font-bold font-mono">{tl(p.buDonem)}</td>
                                    </tr>
                                  ))}
                                  <tr className="border-t-2 border-green-600/40">
                                    <td className="py-1.5 pr-2 text-green-200 font-bold">TOPLAM</td>
                                    <td />
                                    <td className="text-right px-1 text-white font-bold font-mono">{tl(ortakHesaplar.reduce((a, p) => a + p.karPayi, 0))}</td>
                                    <td className="text-right px-1 text-green-300 font-bold font-mono">{tl(ortakHesaplar.reduce((a, p) => a + p.hesaplanan, 0))}</td>
                                    <td className="text-right px-1 text-gray-300 font-bold font-mono">{tl(ortakHesaplar.reduce((a, p) => a + p.odenenP, 0))}</td>
                                    <td className="text-right pl-1 text-green-200 font-bold font-mono">{tl(ortakHesaplar.reduce((a, p) => a + p.buDonem, 0))}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                      {serbestMeslek && (
                        <>
                          <div className="flex justify-between px-4 py-2 text-sm border-t-2 border-green-600/40 bg-green-900/20">
                            <span className={smKarZarar > 0 ? 'text-green-300 font-bold' : 'text-gray-400'}>
                              Hesaplanan Geçici Vergi (%15 — Gelir Vergisi)
                            </span>
                            <span className={smKarZarar > 0 ? 'text-green-300 font-bold font-mono' : 'text-gray-500 font-mono text-sm'}>
                              {smKarZarar > 0 ? <>{tl(smKarZarar)} × %15 = {tl(smVergi)}</> : `— (zarar ${tl(Math.abs(smKarZarar))}, hesaplanmadı)`}
                            </span>
                          </div>
                          <div className="flex justify-between px-4 py-2 text-sm border-t border-green-600/20">
                            <span className="text-gray-300">Önceki dönemde ödenen geçici vergi{oncekiOdenen ? ` (${oncekiOdenen.donem}. dönem ${oncekiOdenen.yil})` : ''}</span>
                            <span className="text-gray-300 font-mono">
                              {oncekiOdenen == null ? (
                                <span className="text-gray-500 text-xs">okunuyor…</span>
                              ) : oncekiOdenen.tutar != null ? (
                                tl(odenen)
                              ) : (
                                <span className="text-gray-500 text-xs" title={oncekiOdenen.hata || ''}>— okunamadı ({oncekiOdenen.hata || 'bilinmiyor'}), 0 alındı</span>
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between px-4 py-2 text-sm border-t-2 border-green-600/40 bg-green-900/20">
                            <span className="text-green-200 font-bold">Bu Dönem Ödenecek Geçici Vergi</span>
                            <span className="text-green-200 font-bold font-mono">{tl(smVergi)} − {tl(odenen)} = {tl(smBuDonem)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Kar orani + ADIM 3 — serbest meslekte kar orani yok */}
                {ozet && hesap && !serbestMeslek && !bilancoModu && (
                  <div className="rounded-xl border border-yellow-500/30 bg-yellow-400/5 p-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <Calculator className="w-5 h-5 text-yellow-400" />
                      <label className="text-sm font-semibold text-white">Kar Oranı:</label>
                      <div className="flex items-center gap-1">
                        <input type="number" step="0.1" min="0" value={karOrani} onChange={e => { setKarOrani(e.target.value); setDonemSonuElle(null) }}
                          className="w-24 bg-blue-900/40 border border-yellow-500/40 rounded-lg px-3 py-2 text-white text-sm text-right" />
                        <span className="text-yellow-400 font-bold text-sm">%</span>
                      </div>
                      <span className="text-gray-400 text-xs">
                        {hesap.zarar && !hesap.brutKar ? (
                          <>Gelir yok: <b className="text-white">Dönem sonu = Dönem başı + Satın alınan</b>; giderler <b className="text-red-300">{tl(hesap.zarar)}</b> zarar işlenir.</>
                        ) : (
                          <>
                            Uygulanabilir kar oranı: <b className="text-white">%{hesap.minOran} – %{hesap.maxOran}</b>. Hedef brüt kar = Hasılat × %oran: <b className="text-white">{tl(hesap.brutKar)}</b> → SMM <b className="text-white">{tl(hesap.smm)}</b> → Devreden mal <b className="text-white">{tl(hesap.donemSonu)}</b>; giderler düşünce net <b className={hesap.netKar >= 0 ? 'text-green-300' : 'text-red-300'}>{tl(Math.abs(hesap.netKar))} {hesap.netKar >= 0 ? 'kar' : 'zarar'}</b>.
                            {hesap.kirpildi && (
                              <span className="block mt-1 text-red-300 font-semibold">
                                Uyarı: Girdiğiniz oran bu aralığın dışında — {Number(karOrani) < hesap.minOran ? `devreden mal (dönem sonu) eksiye düşer. En az uygulanabilir oran: %${hesap.minOran}` : `satılan mal maliyeti eksiye düşer. En fazla uygulanabilir oran: %${hesap.maxOran}`}. Değerler sınırda 0'a çekildi.
                              </span>
                            )}
                          </>
                        )}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="w-7 h-7 shrink-0 rounded-full bg-yellow-500 text-blue-950 font-bold text-sm flex items-center justify-center">3</span>
                      <button onClick={onaylaGonder} disabled={islemSuruyor !== '' || donemSonuGonderilecek == null}
                        className="bg-green-600 hover:bg-green-500 text-white px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center gap-2">
                        {islemSuruyor === 'gonder' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        Onayla ve Portala Gönder
                      </button>
                      <span className="text-gray-500 text-xs">Hesaplanan dönem sonu tutarı portala yazılır, Oluştur'a basılır.</span>
                    </div>
                  </div>
                )}
                {ozet && (serbestMeslek || bilancoModu) && (
                  <div className="rounded-xl border border-yellow-500/30 bg-yellow-400/5 p-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <Calculator className="w-5 h-5 text-yellow-400" />
                      <span className="text-gray-400 text-xs">
                        {bilancoModu
                          ? 'Bilanço esaslı hesap planında kar oranı ve dönem sonu emtia yoktur — ticari kazanç gelir tablosundan gelir; Hesaplanan ve Bu Dönem Ödenecek Geçici Vergi yukarıda gösterilir.'
                          : 'Serbest meslek hesap planında kar oranı ve dönem sonu emtia yoktur — yalnızca gelir/gider aktarılır.'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="w-7 h-7 shrink-0 rounded-full bg-yellow-500 text-blue-950 font-bold text-sm flex items-center justify-center">3</span>
                      <button onClick={onaylaGonder} disabled={islemSuruyor !== ''}
                        className="bg-green-600 hover:bg-green-500 text-white px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center gap-2">
                        <Send className="w-4 h-4" />
                        Onayla ve Portala Gönder
                      </button>
                      <span className="text-gray-500 text-xs">Portala yazılacak dönem sonu tutarı yok; Kaydet adımları portalda yapılır.</span>
                    </div>
                  </div>
                )}

                {/* Gonderildi -> Devam + Tamam (ortaklikta: Diğer Ortağa Geç) */}
                {asama === 'gonderildi' && adiOrtaklik && ortakSirasi.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-teal-500/40 bg-teal-500/10 p-4">
                    <span className="text-teal-300 text-sm flex-1">
                      {ortakIdx + 1 < ortakSirasi.length ? (
                        <>Sıradaki ortak: <b>{ortakSirasi[ortakIdx + 1].ad}</b> ({ortakSirasi[ortakIdx + 1].vkn}). Bitirince <b>Diğer Ortağa Geç</b>'e basın.</>
                      ) : (
                        <>Tüm ortaklar tamamlandı ({ortakSirasi.length}/{ortakSirasi.length}). <b>Diğer Müşteriye Devam Et</b>'e basabilirsiniz.</>
                      )}
                    </span>
                    {ortakIdx + 1 < ortakSirasi.length ? (
                      <button onClick={digerOrtagaGec} disabled={islemSuruyor !== ''}
                        className="bg-teal-500 hover:bg-teal-400 text-blue-950 px-5 py-2.5 rounded-lg text-sm font-bold disabled:opacity-50 flex items-center gap-2">
                        {islemSuruyor === 'ortak' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        Diğer Ortağa Geç ({ortakIdx + 2}/{ortakSirasi.length})
                      </button>
                    ) : (
                      <button onClick={devamEt} className="bg-teal-500 hover:bg-teal-400 text-blue-950 px-5 py-2.5 rounded-lg text-sm font-bold">
                        Diğer Müşteriye Devam Et
                      </button>
                    )}
                  </div>
                )}
                {asama === 'gonderildi' && !(adiOrtaklik && ortakSirasi.length > 0) && (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-teal-500/40 bg-teal-500/10 p-4">
                    <span className="text-teal-300 text-sm flex-1">
                      Portalda kalan adımları (Kaydet vb.) tamamlayın. Bitirince <b>Devam</b>'a basın.
                    </span>
                    <button onClick={devamEt} className="bg-teal-500 hover:bg-teal-400 text-blue-950 px-5 py-2.5 rounded-lg text-sm font-bold">
                      Devam
                    </button>
                  </div>
                )}
                {asama === 'devam' && (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-green-500/40 bg-green-500/10 p-4">
                    <span className="text-green-300 text-sm flex-1">Yeni müşteri işlemlerine geçmeye hazırsınız.</span>
                    <button onClick={tamamYeniMusteri} className="bg-green-600 hover:bg-green-500 text-white px-5 py-2.5 rounded-lg text-sm font-bold">
                      Tamam — Yeni Müşteri Seç
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
