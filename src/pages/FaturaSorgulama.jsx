// Admin "Fatura Sorgulama" sayfasi: musteri secip e-Fatura / e-Arsiv
// faturalarini Luca uzerinden sorgulama (musteri detay sayfasindan
// bagimsiz, kendi menu ogesi altinda). Toplu mod: coklu musteri secimi
// ile sirali sorgu — Luca oturumu acik kalir (oturumKalsin), yardimci
// musteriyi OTOMATIK degistirip sorgulamaya devam eder; lucadan
// cikip tekrar girmek gerekmez.
import { useState, useRef, useCallback, useEffect } from 'react'
import { Receipt, Layers, X, Search, Download, Users, FolderOpen, FileSpreadsheet, SlidersHorizontal, ChevronDown, Upload, Square, RefreshCw, Clock, CalendarCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useClients } from '../hooks/useClients'
import { efaturaSorgula, dosyalariMubisYukle, edefterDokumleriniYukle, edefterTopluKopyala, faturaKopyalamaDosyalari, sorguYonleri, lucaDurumMetni, faturaIlerlemeMetni } from '../services/efaturaService'
import { faturaAktarimAsamaMetni, faturaAktarimDurumlariniGetir, faturaAktariminiCalistir, lucaIslemiBelirsiz } from '../services/faturaAktarimService'
import { yardimciIsSunucu, gibLucaSorguDurdur } from '../utils/gibOdemeHelper'
import FaturaListesiKarti from '../components/FaturaListesiKarti'

// 2.7.442: Fatura bazli aktarim durum tablosu — her adimda gelen
// dosyaDurumlari birikir; fatura, Luca klasorune kopyalandi mi (luca) ve
// MUBIS'e aktarildi mi (mubis) olarak gosterilir.
const AKTARIM_LIMIT = 200
export function aktarimKaydiEkle(setAktarim, musteriAd, turAd, yonEtiket, parcaEtiket, res) {
  const dosyalar = Array.isArray(res?.dosyalar) ? res.dosyalar : []
  if (!dosyalar.length) return
  setAktarim(prev => {
    const yeni = dosyalar.map(d => ({
      musteri: musteriAd,
      belge: `${turAd}${yonEtiket}${parcaEtiket}`,
      ad: d.ad,
      faturaNo: d.faturaNo || '',
      unvan: d.unvan || '',
      luca: d.luca === true,
      mubis: d.mubis === true,
      hata: d.hata || ''
    }))
    return [...prev, ...yeni].slice(-AKTARIM_LIMIT)
  })
}

// 2.7.471: Klasore kopyalama yuklemeden SONRA yapildigindan (sorgu ->
// MUBiS yukleme -> toplu kopyalama) kayitlara kopyalama aninda "luca"
// isareti konur; aksi halde Luca sutunu bos kalir.
export function aktarimKaydiLucaIsaretle(setAktarim, musteriAd, belgeEtiketi, dosyaAdlari) {
  const adlar = new Set((dosyaAdlari || []).map(a => String(a)).filter(Boolean))
  if (!adlar.size) return
  setAktarim(prev => prev.map(k => (
    k.musteri === musteriAd && k.belge === belgeEtiketi && adlar.has(k.ad)
      ? { ...k, luca: true }
      : k
  )))
}

export default function FaturaSorgulama() {
  const { clients } = useClients()
  const [seciliId, setSeciliId] = useState('')
  // Toplu sorgu durumu
  const [topluAcik, setTopluAcik] = useState(false)
  // Otomatik Sorgu karti varsayilan kapali — basligi tiklayinca acilir
  // (Toplu Sorgu kartiyla ayni davranis). Ayar kapaliysa da kart kapali acilir.
  const [cronAcik, setCronAcik] = useState(false)
  // Sorgu tetigi musteriye baglidir: sayac bir onceki musteriden kalan degerle
  // yeni musteriye gecince kart kendiliginden sorgu baslatmasin.
  const [topluSecili, setTopluSecili] = useState([])
  const [topluYil, setTopluYil] = useState(() => String(new Date().getFullYear()))
  const [topluAy, setTopluAy] = useState(() => String(new Date().getMonth() + 1))
  const [topluTip, setTopluTip] = useState('') // '' = Tümü (4 tur sirayla)
  // 2.7.430: mod arayuzden kaldirildi — en saglam birlesim sabit (canli sorgu).
  const topluMod = 'sorgula'
  // 2.7.460: GIB->Luca sorgu adiminin parca boyu KULLANICI SECIMI (7 veya 30 gun).
  // Parcalama yalnizca Luca'nin GİB'den Getir adiminda uygulanir; MUBiS yuklemesi
  // tum parcalar inince KOMPLE yapilir.
  const [topluPeriyod, setTopluPeriyod] = useState(() => '30gun')
  // 2.7.483: Lisansli otomasyondaki "Sorgulama seçimi" — yeni belge kontrolü /
  // eksikleri tamamlama / tümünü yeniden sorgula (onarım)
  const [sorguSecimi, setSorguSecimi] = useState('yeni')
  // 2.7.432: GIB sorgu kaynagi kaldirildi — tum sorgular Luca kanalindan gider.
  const [topluSorguluyor, setTopluSorguluyor] = useState(false)
  const [tekSorguluyor, setTekSorguluyor] = useState(false)
  const tekSorguDurdurRef = useRef(null)
  const tekSorguDurumDegis = useCallback((aktif, durdur) => {
    tekSorguDurdurRef.current = aktif ? durdur : null
    setTekSorguluyor(aktif)
  }, [])
  // 2.7.574: Sorgulamayi Durdur — tek (FaturaListesiKarti) ve toplu akis ortak bayrak;
  // yardimciya /is-durdur gonderilir (GIB bekleme donguleri bayragi kontrol eder).
  // 2.8.23: tumu=true — Durdur'a basinca kuyrukta bekleyen ve calisan TUM
  // sorgular (VPS + yerel) iptal edilir; calisan isin sekmeleri kapatilir.
  const durdurRef = useRef(false)
  const iptalKontrol = useCallback(() => durdurRef.current, [])
  const handleTopluDurdur = async () => {
    if (!topluSorguluyor && !window.confirm('Sunucudaki çalışan ve bekleyen Luca sorgularına durdurma isteği gönderilecek. Devam edilsin mi?')) return
    durdurRef.current = true
    setTopluMesaj('Tüm sorgulamalar durduruluyor — çalışan ve kuyrukta bekleyen işler iptal ediliyor...')
    try {
      const iletildi = await gibLucaSorguDurdur('sunucu', true)
      if (!topluSorguluyor) setTopluMesaj(iletildi ? 'Durdurma isteği yardımcıya iletildi.' : topluMesaj + ' Durdurma isteği iletilemedi; yardımcı bağlantısını kontrol edin.')
    } catch {
      if (!topluSorguluyor) setTopluMesaj(topluMesaj + ' Durdurma isteği iletilemedi; yardımcı bağlantısını kontrol edin.')
    }
  }
  const [topluMesaj, setTopluMesaj] = useState('')
  const [aktarimKayitlari, setAktarimKayitlari] = useState([])

  // 2.7.541: Ornek web tasarimi — 4 bolumlu duzen state'leri
  // Bolum 1: Tek/Toplu musteri kapsami
  const [sorguKapsam, setSorguKapsam] = useState('tek')
  // Bolum 1: Islem yonu filtresi (liste + sorgu kapsamini etkiler)
  const [yonFiltre, setYonFiltre] = useState('all')
  // Belge türü "tur:" seçimleri (iade/istisna/tevkifat...) — listeyi
  // fatura_turu (UBL InvoiceTypeCode) üzerinden filtreler; sorgu kapsamı
  // otomatik "tüm kategoriler" olur.
  const [belgeTurFiltre, setBelgeTurFiltre] = useState('')
  // Bolum 1: Ek Filtreler (opsiyonel) — listeye sunulur
  const [ekFiltreAcik, setEkFiltreAcik] = useState(false)
  const [efTarihBas, setEfTarihBas] = useState('')
  const [efTarihBit, setEfTarihBit] = useState('')
  const [efBelgeNo, setEfBelgeNo] = useState('')
  const [efTutarMin, setEfTutarMin] = useState('')
  const [efTutarMax, setEfTutarMax] = useState('')
  const [efVkn, setEfVkn] = useState('')
  // Bolum 2: Dosyadan Yükle / Excel'e Aktar tetikleri
  const [disEylem, setDisEylem] = useState(null)
  const [dokumAcik, setDokumAcik] = useState(false)
  const musteriSec = (id) => {
    setDisEylem(null)
    setDokumAcik(false)
    setSeciliId(id)
  }
  const disFiltre = {}
  if (efTarihBas) disFiltre.tarihBas = efTarihBas
  if (efTarihBit) disFiltre.tarihBit = efTarihBit
  if (efBelgeNo) disFiltre.belgeNo = efBelgeNo
  if (efVkn) disFiltre.vkn = efVkn
  if (efTutarMin) disFiltre.tutarMin = Number(String(efTutarMin).replace(/\./g, '').replace(',', '.'))
  if (efTutarMax) disFiltre.tutarMax = Number(String(efTutarMax).replace(/\./g, '').replace(',', '.'))

  // 2.7.443: Luca AFA dökümü yükleme — 2.7.521'de FaturaListesiKarti'na tasindi

  // 2.7.498: acilir listede TAM unvan gosterilir — Luca kisa adi yalnizca
  // tam unvan hic yoksa yedek olarak kullanilir.
  const musteriAdi = (c) => c.name || c.company || c.shortName || `Müşteri #${c.id}`
  // Alfabetik siralama (Turkce duyarli): A -> Z — gorunen ada gore siralanir
  const siraliMusteriler = [...(clients || [])].sort((a, b) =>
    musteriAdi(a).localeCompare(musteriAdi(b), 'tr')
  )
  const secili = siraliMusteriler.find(c => String(c.id) === String(seciliId)) || null
  const sorguYonleriniSec = (tur, client) => sorguYonleri(tur, yonFiltre === 'ALIS' ? ['alis'] : yonFiltre === 'SATIS' ? ['satis'] : null, client)

  // 2.7.575: İşlem düğmelerine "basıldı" geri bildirimi — tıklamada 1.5 sn
  // beyaz halka + hafif küçülme; ayrıca aktifken scale/brightness efekti.
  const [sonBasilan, setSonBasilan] = useState('')
  const islemTimerRef = useRef(null)
  const islemTikla = (tur, fn) => {
    setSonBasilan(tur)
    clearTimeout(islemTimerRef.current)
    islemTimerRef.current = setTimeout(() => setSonBasilan(''), 1500)
    fn?.()
  }
  const basilanEfekt = (tur) => (sonBasilan === tur
    ? ' ring-4 ring-white/80 ring-offset-2 ring-offset-blue-950 scale-[0.97] brightness-110 shadow-inner'
    : ' active:scale-95 active:brightness-90')

  const toggleToplu = (id) => {
    setTopluSecili(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  const toggleTopluHepsi = () => {
    setTopluSecili(prev => prev.length === siraliMusteriler.length ? [] : siraliMusteriler.map(c => String(c.id)))
  }

  // 2.7.385: secilen yil/ayi gunluk parçalara böler (dd/MM/yyyy).
  // 7 gun: [1-7] [8-14] [15-21] [22-28] [29-ay sonu]
  // 30 gun: tum ay tek parça [1-ay sonu] (tek sorgu)
  // bulunulan ayda bitis bugüne çekilir, bugünden sonraki parçalar atlanir.
  const donemParcalari = (yil, ay, gun = 7) => {
    const y = parseInt(yil, 10), a = parseInt(ay, 10)
    if (!(y >= 2000) || !(a >= 1 && a <= 12)) return null
    const iki = n => String(n).padStart(2, '0')
    const son = new Date(y, a, 0).getDate()
    const bugun = new Date()
    const bugunDD = (y === bugun.getFullYear() && a === bugun.getMonth() + 1) ? bugun.getDate() : null
    const dilimler = gun >= 30 ? [[1, son]] : [[1, 7], [8, 14], [15, 21], [22, 28], [29, 31]]
    const parcalar = []
    for (const [b, e] of dilimler) {
      if (b > son) break
      const bit = Math.min(e, son, bugunDD != null ? bugunDD : e)
      if (b > bit) continue
      parcalar.push({
        bas: `${iki(b)}/${iki(a)}/${y}`,
        bit: `${iki(bit)}/${iki(a)}/${y}`,
        etiket: `${iki(b)}.${iki(a)} - ${iki(bit)}.${iki(a)}`
      })
    }
    return parcalar.length ? parcalar : null
  }
  const yediGunParcalari = (yil, ay) => donemParcalari(yil, ay, 7)

  // 2.7.462: SIRALI tam dongu (musteri basina) —
  //   her tur+yon icin: sorgula (tum periyotlar, sadeceSorgu) ->
  //   Luca'dan indir -> MUBiS'e yukle -> klasore kopyala; BITINCE
  //   siradaki tur+yon (kullanici tercihi: alis komple bitmeden satisa gecme).
  const FIS_TIPLERI = ['zrapor', 'giderfisi']

  const [kaliciAktarimlar, setKaliciAktarimlar] = useState([])
  const [aktarimDurumHatasi, setAktarimDurumHatasi] = useState(false)
  const bekleyenLucaIslemi = lucaIslemiBelirsiz(topluMesaj) || kaliciAktarimlar.some(kayit => kayit.durum?.sorun === 'bekliyor')
  useEffect(() => {
    let aktif = true
    setKaliciAktarimlar([])
    setAktarimDurumHatasi(false)
    faturaAktarimDurumlariniGetir({ yil: topluYil, ay: topluAy, clientId: sorguKapsam === 'tek' ? seciliId : null })
      .then(kayitlar => { if (aktif) setKaliciAktarimlar(kayitlar) })
      .catch(() => { if (aktif) setAktarimDurumHatasi(true) })
    return () => { aktif = false }
  }, [topluYil, topluAy, seciliId, sorguKapsam, topluSorguluyor])

  const handleTopluSorgula = async (devam = sorguSecimi === 'eksik') => {
    const hedefler = sorguKapsam === 'tek' ? (seciliId ? [seciliId] : []) : topluSecili
    if (!hedefler.length || topluSorguluyor || tekSorguluyor) return
    if (FIS_TIPLERI.includes(topluTip)) { await handleLucaIndir(); return }
    if (!topluYil || !topluAy) { setTopluMesaj('Kalıcı fatura aktarımı için yıl ve ay seçin.'); return }
    setTopluSorguluyor(true)
    durdurRef.current = false
    const turlar = !topluTip || topluTip === 'hepsi' ? ['efatura', 'earsiv', 'esmm', 'utts'] : [topluTip]
    const turAdlari = { efatura: 'e-Fatura', earsiv: 'e-Arşiv', esmm: 'e-SMM', utts: 'UTTS' }
    const parcalar = donemParcalari(topluYil, topluAy, topluPeriyod === '30gun' ? 30 : 7) || [null]
    const hatalar = []
    const notlar = []
    let toplam = 0
    let guvenliDurus = false
    try {
      for (const id of hedefler) {
        if (iptalKontrol() || guvenliDurus) break
        const musteri = siraliMusteriler.find(c => String(c.id) === String(id))
        if (!musteri) continue
        const client = { ...musteri, vkn: musteri.vkn || musteri.tc || '' }
        const ad = musteriAdi(musteri)
        if (!devam) {
          const dokumler = await edefterDokumleriniYukle({ client, yil: topluYil, ay: topluAy, onDurum: setTopluMesaj, iptalKontrol })
          toplam += dokumler.sayi
          notlar.push(...dokumler.notlar)
          hatalar.push(...dokumler.hatalar)
        }
        for (const tur of turlar) {
          if (iptalKontrol() || guvenliDurus) break
          for (const yon of sorguYonleriniSec(tur, client)) {
            if (iptalKontrol() || guvenliDurus) break
            const etiket = [ad, turAdlari[tur], yon === 'alis' ? 'Alış' : 'Satış'].join(' / ')
            try {
              const sonuc = await faturaAktariminiCalistir({ client, yil: topluYil, ay: topluAy, tur, yon, parcalar, devam, onarim: sorguSecimi === 'onarim' && !devam, iptalKontrol,
                onDurum: metin => setTopluMesaj(etiket + ': ' + metin) })
              toplam += sonuc.yeniSayi
              if (sonuc.yuklenenDosyalar?.length) {
                const yonEtiket = yon === 'alis' ? ' (Alış)' : ' (Satış)'
                aktarimKaydiEkle(setAktarimKayitlari, ad, turAdlari[tur], yonEtiket, '', { dosyalar: sonuc.yuklenenDosyalar })
                if (sonuc.durum.arsiv === 'tamam') aktarimKaydiLucaIsaretle(setAktarimKayitlari, ad, turAdlari[tur] + yonEtiket, sonuc.yuklenenDosyalar.map(dosya => dosya.ad))
              }
              if (sonuc.durum.not) notlar.push(etiket + ': ' + sonuc.durum.not)
            } catch (hata) {
              if (iptalKontrol() || hata.message === 'KULLANICI_DURDURDU') break
              toplam += hata.yeniSayi || 0
              hatalar.push(etiket + ': ' + (hata.message || 'İşlem tamamlanamadı.'))
              guvenliDurus = ['LUCA_BEKLENIYOR', 'AKTARIM_BEKLIYOR', 'AKTARIM_KILITLI'].includes(hata.code) || lucaIslemiBelirsiz(hata.message)
            }
          }
        }
      }
    } catch (hata) {
      hatalar.push(hata.message || 'Aktarım tamamlanamadı.')
    } finally {
      const ozet = [toplam + ' belge MUBİS’e kaydedildi.']
      if (iptalKontrol()) ozet.push('İzleme durduruldu. Eksik adımlar daha sonra tamamlanabilir.')
      if (guvenliDurus) ozet.push('Önceki işlem doğrulanmadan yeni Luca sorgusu başlatılmadı.')
      if (notlar.length) ozet.push(notlar.join(' '))
      if (hatalar.length) ozet.push('Tamamlanamayan adımlar: ' + hatalar.join(' | '))
      setTopluMesaj(ozet.join(' '))
      setTopluSorguluyor(false)
    }
  }

  // 2.7.574: LUCA SORGULA — yalniz Luca'da GİB'den Getir tetikler (sadeceSorgu);
  // indirme/yukleme YAPMAZ. Sorgulanan faturalar Luca AEN listesinde hazir bekler;
  // sonrasinda "Luca'dan İndir" ile indirilip yüklenir. Tek ve toplu kapsam calisir.
  const handleLucaSorgula = async () => {
    const hedefler = (sorguKapsam === 'toplu' && topluSecili.length) ? topluSecili
      : (topluSecili.length ? topluSecili : (seciliId ? [String(seciliId)] : []))
    if (!hedefler.length || topluSorguluyor) return
    if (FIS_TIPLERI.includes(topluTip)) { setTopluMesaj('Z Raporu ve Gider Fişi kayıtları Luca\u2019dan sorgulanmaz; Fişler kısmından eklenir.'); return }
    setTopluSorguluyor(true)
    durdurRef.current = false
    const turlar = (!topluTip || topluTip === 'hepsi') ? ['efatura', 'earsiv', 'esmm', 'utts'] : [topluTip]
    const turAdlari = { efatura: 'e-Fatura', earsiv: 'e-Arşiv', esmm: 'e-SMM', utts: 'UTTS' }
    const gun = topluPeriyod === '30gun' ? 30 : 7
    const parcalar = donemParcalari(topluYil, topluAy, gun) || [null]
    const toplamAdim = hedefler.length * turlar.length * 2 * parcalar.length
    let adim = 0
    let toplamSorgu = 0
    const hatalar = []
    let durdur = false
    try {
      for (const id of hedefler) {
        if (durdur) break
        const musteri = siraliMusteriler.find(c => String(c.id) === String(id))
        if (!musteri) continue
        const ad = musteriAdi(musteri)
        const clientArg = { ...musteri, id: musteri.id, vkn: musteri.vkn || musteri.tc || '' }
        for (const tur of turlar) {
          if (durdur) break
          const turYonleri = sorguYonleriniSec(tur, clientArg)
          for (const yon of turYonleri) {
            if (durdur) break
            const turAd = turAdlari[tur] || tur
            const yonEtiket = yon === 'alis' ? ' (Alış)' : ' (Satış)'
            for (const parca of parcalar) {
              adim++
              const parcaEtiket = parca ? ` (${parca.etiket})` : ''
              const onEk = `(${adim}/${toplamAdim}) ${ad} - ${turAd}${yonEtiket}${parcaEtiket}: `
              setTopluMesaj(onEk + "Luca'da sorgulaniyor (GİB isleminin bitmesi bekleniyor)...")
              try {
                await efaturaSorgula({
                  client: clientArg, yardimciKaynak: 'sunucu',
                  yil: topluYil || new Date().getFullYear(),
                  ay: topluAy || '',
                  sorguTip: tur,
                  yon,
                  mod: topluMod,
                  baslangicTarih: parca?.bas,
                  bitisTarih: parca?.bit,
                  sadeceIndir: true,
                  sadeceSorgu: true,
                  iptalKontrol,
                  onDurum: (d) => {
                    const metin = lucaDurumMetni(d)
                    if (metin && !durdurRef.current) setTopluMesaj(onEk + metin)
                  }
                })
                toplamSorgu++
              } catch (err) {
                const msg = err.message || 'bilinmeyen hata'
                if (msg.includes('KULLANICI_DURDURDU')) { durdur = true; break }
                if (msg.includes('mevcut-sorgu-devam-ediyor')) { hatalar.push(`${ad}: Luca'da önceki sorgu hâlâ çalışıyor; kalan işlemler durduruldu.`); durdur = true; break }
                hatalar.push(`${ad}/${turAd}${yonEtiket}${parcaEtiket}: ${msg}`)
                if (/islem takibi suresinde tamamlanmadi/i.test(msg) || msg.includes('kurulu') || msg.includes('giris bilgisi yok') || msg.includes('Giris bilgisi yok')) durdur = true
              }
            }
          }
        }
      }
      const ozet = []
      if (toplamSorgu > 0) ozet.push(`${toplamSorgu} sorgu Luca'da tamamlandi — faturalar Luca listesinde hazir; indirmek icin "Luca'dan İndir"i kullanin.`)
      if (durdurRef.current) ozet.push('Sorgulama kullanıcı tarafından durduruldu — kalan müşteri/türler atlandı.')
      if (notlar.length) ozet.push(notlar.join(' '))
if (hatalar.length) ozet.push('Hatalar: ' + hatalar.join(' | '))
      setTopluMesaj(['Luca sorgulama bitti', ...ozet].join(' '))
    } finally {
      setTopluSorguluyor(false)
    }
  }

  // 2.7.463: LUCA'DAN FATURA INDIR — sorgu (GİB'den Getir) YAPMAZ. Luca'da
  // daha once sorgulanmis (AEN listesinde bekleyen) ilgili ayin faturalarini
  // indirir: indirme -> MUBiS'e yukleme -> klasorlere kopyalama, tur+yon
  // sirasiyla. Daha once "Seçilenleri Sorgula" calistirildiysa kullanilir.
  // 2.7.466: Toplu seçim bosken ustteki tek musteri secimi kullanilir —
  // boylece ayni tus ana alandan da calisir.
  const handleLucaIndir = async () => {
    const hedefler = topluSecili.length
      ? topluSecili
      : (seciliId ? [String(seciliId)] : [])
    if (!hedefler.length || topluSorguluyor) return
    setTopluSorguluyor(true)
    durdurRef.current = false
    const turlar = FIS_TIPLERI.includes(topluTip) ? [] : (!topluTip || topluTip === 'hepsi') ? ['efatura', 'earsiv', 'esmm', 'utts'] : [topluTip]
    const turAdlari = { efatura: 'e-Fatura', earsiv: 'e-Arşiv', esmm: 'e-SMM', utts: 'UTTS' }
    let toplam = 0
    const boslar = []
    const hatalar = []
    const notlar = []
    let durdur = false
    try {
      for (const id of hedefler) {
        if (durdur) break
        const musteri = siraliMusteriler.find(c => String(c.id) === String(id))
        if (!musteri) continue
        const ad = musteriAdi(musteri)
        const clientArg = { ...musteri, id: musteri.id, vkn: musteri.vkn || musteri.tc || '' }
        const dokumler = await edefterDokumleriniYukle({ client: clientArg, yil: topluYil, ay: topluAy, onDurum: setTopluMesaj, iptalKontrol })
        toplam += dokumler.sayi
        notlar.push(...dokumler.notlar.map(metin => `${ad}: ${metin}`))
        hatalar.push(...dokumler.hatalar.map(metin => `${ad}: ${metin}`))
        for (const tur of turlar) {
          // UTTS'te satis yok; serbest meslek olmayan firmada e-SMM (Satış) yok
          const turYonleri = sorguYonleriniSec(tur, clientArg)
          for (const yon of turYonleri) {
            const turAd = turAdlari[tur] || tur
            const yonEtiket = yon === 'alis' ? ' (Alış)' : ' (Satış)'
            const indirilenler = []
            let zipYoluIle = false
            let indirmeKaynak = 'sunucu'
            let dosyaFotografi = null
            try {
              const onEkD = `${ad} - ${turAd}${yonEtiket}: `
              setTopluMesaj(onEkD + "Luca'daki hazır faturalar indiriliyor (sorgu yapılmaz)...")
              const res = await efaturaSorgula({
                client: clientArg, yardimciKaynak: 'sunucu',
                yil: topluYil || new Date().getFullYear(),
                ay: topluAy || '',
                sorguTip: tur,
                yon,
                mod: 'indir',
                sadeceIndir: true,
                iptalKontrol,
                onDurum: (d) => {
                  const metin = lucaDurumMetni(d)
                  if (metin && !durdurRef.current) setTopluMesaj(onEkD + metin)
                }
              })
              if (res.zipYoluIle) zipYoluIle = true
              indirmeKaynak = res.yardimciKaynak
              dosyaFotografi = res.oncekiSet
              if (res.yerelYedek) hatalar.push(`${ad} - ${turAd}${yonEtiket}: VPS'ten Luca'ya erişilemedi; indirme yerel yardımcıda çalıştı.`)
              if (res.ok === false && res.not) hatalar.push(`${ad} - ${turAd}${yonEtiket}: ${res.not}`)
              if (!(res.sayi > 0) && res.not && res.ok !== false) notlar.push(`${ad} - ${turAd}${yonEtiket}: ${res.not}`)
              for (const d of (res.dosyalar || [])) {
                if (!indirilenler.some(x => x.ad === d.ad)) indirilenler.push(d)
              }
              if (indirilenler.length) {
                const tabanlar = new Set(indirilenler.map(d => String(d.ad).replace(/\.(pdf|xml|xlsx|xls|html?)$/i, '').toLowerCase()))
                setTopluMesaj(`${ad} - ${turAd}${yonEtiket}: İndirilen ${indirilenler.length} dosya kontrol ediliyor...`)
                const yuk = await dosyalariMubisYukle({
                  client: clientArg, yardimciKaynak: indirmeKaynak,
                  yil: topluYil || new Date().getFullYear(),
                  ay: topluAy || '',
                  sorguTip: tur,
                  yon,
                  oncekiSet: dosyaFotografi,
                  zipYoluIle,
                  ilgiliTabanlar: tabanlar,
                  onDurum: () => {},
                  onIlerleme: (p) => {
                    const metin = faturaIlerlemeMetni(p)
                    if (metin && !durdurRef.current) setTopluMesaj(`${ad} - ${turAd}${yonEtiket}: ${metin}`)
                  }
                })
                if (yuk.ok === false) throw new Error(yuk.not || 'Faturalar MUBİS’e yüklenemedi.')
                toplam += yuk.sayi || 0
                const hataliDosyalar = (yuk.dosyalar || []).filter(d => d.hata)
                if (hataliDosyalar.length) hatalar.push(`${ad}/${turAd}${yonEtiket}: ${hataliDosyalar.length} dosya yüklenemedi (${hataliDosyalar[0].hata})`)
                aktarimKaydiEkle(setAktarimKayitlari, ad, turAd, yonEtiket, '', yuk)
                if (!(yuk.sayi > 0)) boslar.push(`${ad}/${turAd}${yonEtiket}${yuk.not ? ' (' + yuk.not + ')' : ''}`)
                setTopluMesaj(`${ad} - ${turAd}${yonEtiket}: klasörlere kopyalanıyor...`)
                const kp = await edefterTopluKopyala({ client: clientArg, yardimciKaynak: indirmeKaynak, yil: topluYil, ay: topluAy, yon, dosyalar: faturaKopyalamaDosyalari(indirilenler, yuk.dosyalar) })
                if (kp?.ok) aktarimKaydiLucaIsaretle(setAktarimKayitlari, ad, `${turAd}${yonEtiket}`, indirilenler.map(d => d.ad))
                else if (kp?.atlandi) { if (!notlar.includes(kp.not)) notlar.push(kp.not) }
                else hatalar.push(`${ad}/${turAd}${yonEtiket} klasor kopyalama: ${kp?.error || 'basarisiz'}`)
              } else {
                boslar.push(`${ad}/${turAd}${yonEtiket}`)
              }
            } catch (err) {
              const msg = err.message || 'bilinmeyen hata'
              if (msg.includes('KULLANICI_DURDURDU')) { durdur = true; break }
                if (msg.includes('mevcut-sorgu-devam-ediyor')) { hatalar.push(`${ad}: Luca'da önceki sorgu hâlâ çalışıyor; kalan işlemler durduruldu.`); durdur = true; break }
              hatalar.push(`${ad}/${turAd}${yonEtiket}: ${msg}`)
              if (/islem takibi suresinde tamamlanmadi/i.test(msg) || msg.includes('kurulu') || msg.includes('giris bilgisi yok') || msg.includes('Giris bilgisi yok')) durdur = true
            }
          }
          if (durdur || durdurRef.current) { durdur = true; break }
        }
      }
      if (turlar.length && !durdur && !durdurRef.current) {
        try { await yardimciIsSunucu('luca-oturumu-kapat', {}, 10 * 60 * 1000, undefined, { yerelYedek: false }) } catch { /* yoksay */ }
      }
      const ozet = []
      if (toplam > 0) ozet.push(`Toplam ${toplam} belge indirildi ve MUBİS'e yüklendi.`)
      if (boslar.length) ozet.push('Yeni dosya/kayıt bulunamadı: ' + boslar.join(', ') + ' (dosya alınmamış veya faturalar zaten kayıtlı olabilir).')
      if (durdurRef.current) ozet.push('İndirme kullanıcı tarafından durduruldu — kalan müşteri/türler atlandı.')
      else if (durdur) ozet.push('Kritik hata nedeniyle kalan müşteriler atlandı.')
      if (notlar.length) ozet.push(notlar.join(' '))
if (hatalar.length) ozet.push('Hatalar: ' + hatalar.join(' | '))
      const sonucBasligi = toplam > 0
        ? 'Luca\'dan indirme bitti — sonuçlar MUBİS\'e yüklendi'
        : hatalar.length
          ? 'Luca\'dan indirme başarısız — hiçbir fatura yüklenemedi'
          : 'Luca\'dan indirme tamamlandı — MUBİS\'e yeni fatura yüklenmedi'
      setTopluMesaj([sonucBasligi, ...ozet].join(' '))
    } finally {
      setTopluSorguluyor(false)
    }
  }

  // ---- 2.8.4: OTOMATIK SORGU (VPS cron) — tek global plan ----
  const CRON_GUNLER = [
    { v: 1, e: 'Pzt' }, { v: 2, e: 'Sal' }, { v: 3, e: 'Çar' }, { v: 4, e: 'Per' },
    { v: 5, e: 'Cum' }, { v: 6, e: 'Cmt' }, { v: 0, e: 'Paz' }
  ]
  const CRON_TURLAR = [
    { v: 'efatura', e: 'e-Fatura' }, { v: 'earsiv', e: 'e-Arşiv' },
    { v: 'esmm', e: 'e-SMM' }, { v: 'utts', e: 'UTTS' }
  ]
  const CRON_YONLER = [
    { v: 'alis', e: 'Alış (Alınan)' }, { v: 'satis', e: 'Satış (Kesilen)' }
  ]
  const [cronYukleniyor, setCronYukleniyor] = useState(true)
  const [cronPlan, setCronPlan] = useState(null)
  const [cronGunler, setCronGunler] = useState(new Set([1, 2, 3, 4, 5]))
  const [cronSaat, setCronSaat] = useState('03:00')
  const [cronTurlar, setCronTurlar] = useState(new Set(['efatura', 'earsiv']))
  const [cronYonler, setCronYonler] = useState(new Set(['alis', 'satis']))
  // 2.8.8: musteri secimi — bos Set = tum aktif musteriler
  const [cronMusteriler, setCronMusteriler] = useState(new Set([]))
  const [cronMusteriAcik, setCronMusteriAcik] = useState(false)
  const [cronAktif, setCronAktif] = useState(true)
  const [cronTalepler, setCronTalepler] = useState([])
  const [cronKaydediliyor, setCronKaydediliyor] = useState(false)
  const [cronMesaj, setCronMesaj] = useState(null)

  const cronSetToggle = (setter) => (v) => setter(prev => {
    const yeni = new Set(prev)
    if (yeni.has(v)) yeni.delete(v)
    else yeni.add(v)
    return yeni
  })

  const cronYukle = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/fatura-cron', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
      })
      const j = await r.json()
      if (j.ok && j.plan) {
        setCronPlan(j.plan)
        setCronGunler(new Set(j.plan.gunler || []))
        setCronSaat(j.plan.saat || '03:00')
        setCronTurlar(new Set(j.plan.turlar || []))
        setCronYonler(new Set(j.plan.yonler || ['alis', 'satis']))
        setCronMusteriler(new Set((j.plan.musteriler || []).map(Number)))
        setCronMusteriAcik((j.plan.musteriler || []).length > 0)
        setCronAktif(j.plan.aktif !== false)
      } else {
        setCronPlan(null)
      }
      if (j.ok) setCronTalepler(j.talepler || [])
    } catch { /* yoksay */ }
    finally { setCronYukleniyor(false) }
  }, [])

  useEffect(() => { cronYukle() }, [cronYukle])

  const cronKaydet = async (aktifTercihi = cronAktif) => {
    const oncekiAktif = cronAktif
    if (aktifTercihi && !cronGunler.size) { setCronMesaj({ ok: false, t: 'En az bir gün seçin.' }); return }
    if (aktifTercihi && !cronTurlar.size) { setCronMesaj({ ok: false, t: 'En az bir belge türü seçin.' }); return }
    if (aktifTercihi && !cronYonler.size) { setCronMesaj({ ok: false, t: 'En az bir işlem yönü seçin.' }); return }
    setCronAktif(aktifTercihi)
    setCronKaydediliyor(true)
    setCronMesaj(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/fatura-cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({
          gunler: [...cronGunler],
          saat: cronSaat,
          turlar: [...cronTurlar],
          yonler: [...cronYonler],
          musteriler: cronMusteriAcik && cronMusteriler.size ? [...cronMusteriler] : [],
          aktif: aktifTercihi
        })
      })
      const j = await r.json()
      if (j.ok) {
        setCronPlan(j.plan)
        setCronAktif(j.plan.aktif !== false)
        setCronMesaj({ ok: true, t: aktifTercihi
          ? (cronMusteriAcik && cronMusteriler.size
            ? `Otomatik sorgu planı kaydedildi (${cronMusteriler.size} müşteri seçili). İstanbul sunucusu belirlediğiniz gün/saatte yalnız seçili müşterilerin faturalarını sorgulayacak.`
            : 'Otomatik sorgu planı kaydedildi. İstanbul sunucusu belirlediğiniz gün/saatte tüm aktif müşterilerin faturalarını sorgulayıp Luca ve MUBiS\'e kaydedecek.')
          : 'Otomatik sorgulama kapatıldı ve sunucu planına kaydedildi.' })
      } else {
        setCronAktif(oncekiAktif)
        setCronMesaj({ ok: false, t: j.error === 'yetkisiz' ? 'Bu işlem için yönetici yetkisi gerekir.' : (j.error || 'Kaydedilemedi.') })
      }
    } catch {
      setCronAktif(oncekiAktif)
      setCronMesaj({ ok: false, t: 'Bağlantı hatası; otomatik sorgu ayarı kaydedilemedi.' })
    } finally { setCronKaydediliyor(false) }
  }

  const cronIptal = async () => {
    if (!window.confirm('Otomatik sorgu planı silinecek. Emin misiniz?')) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/fatura-cron', {
        method: 'DELETE',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
      })
      const j = await r.json()
      if (j.ok) {
        setCronPlan(null)
        setCronMesaj({ ok: true, t: 'Otomatik sorgu planı iptal edildi.' })
      } else setCronMesaj({ ok: false, t: j.error || 'Silinemedi.' })
    } catch { setCronMesaj({ ok: false, t: 'Bağlantı hatası.' }) }
  }

  const cronSonucOzet = () => {
    if (!cronPlan?.son_calisma) return 'Henüz çalışmadı'
    try {
      const s = cronPlan.son_sonuc?.ozet
      const d = new Date(cronPlan.son_calisma)
      const zaman = d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      return `${zaman} — ${s || 'tamamlandı'}`
    } catch { return '' }
  }

  return (
    <div className="p-4 md:p-8 max-w-[1230px] mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-yellow-500/15 rounded-xl border border-yellow-500/30">
          <Receipt className="w-6 h-6 text-yellow-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Fatura Sorgulama</h1>
          <p className="text-sm text-gray-400">e-Fatura / e-Arşiv faturalarını Luca üzerinden sorgulayın</p>
        </div>
      </div>

      {/* 2.7.541: BOLUM 1 — SORGULAMA KRITERLERI */}
      <div className="bg-blue-950/30 rounded-2xl p-5 border border-blue-800/30 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 shrink-0 rounded-full bg-yellow-500 text-blue-950 font-bold text-sm flex items-center justify-center">1</span>
            <div>
              <h2 className="text-base font-semibold text-white">Sorgulama Kriterleri</h2>
              <p className="text-xs text-gray-500">Sorgulamak istediğiniz kriterleri seçin.</p>
            </div>
          </div>
          <div className="flex bg-blue-900/60 border border-blue-700/50 rounded-xl p-1">
            <button
              onClick={() => setSorguKapsam('tek')}
              disabled={topluSorguluyor || tekSorguluyor}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium ${sorguKapsam === 'tek' ? 'bg-blue-500 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Tek Müşteri
            </button>
            <button
              onClick={() => { setSorguKapsam('toplu'); setTopluAcik(true) }}
              disabled={topluSorguluyor || tekSorguluyor}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium ${sorguKapsam === 'toplu' ? 'bg-blue-500 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Toplu Müşteri{topluSecili.length ? ` (${topluSecili.length})` : ''}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <div className={sorguKapsam === 'toplu' ? 'opacity-50' : ''}>
            <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">Müşteri Seçimi</label>
            <select
              value={seciliId}
              onChange={(e) => musteriSec(e.target.value)}
              disabled={sorguKapsam === 'toplu' || topluSorguluyor || tekSorguluyor}
              className="w-full bg-blue-900/60 border border-blue-700/50 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-yellow-500/50 disabled:cursor-not-allowed"
            >
              <option value="">— Müşteri seçin —</option>
              {siraliMusteriler.map(c => (
                <option key={c.id} value={c.id}>{musteriAdi(c)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">Yıl</label>
            <select value={topluYil} onChange={e => setTopluYil(e.target.value)} aria-label="Yıl" className="w-full bg-blue-900/60 border border-blue-700/50 rounded-xl px-3 py-2.5 text-white text-sm">
              {Array.from({ length: 7 }, (_, i) => new Date().getFullYear() + 1 - i).map(yil => <option key={yil} value={yil}>{yil}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">Ay</label>
            <select value={topluAy} onChange={e => setTopluAy(e.target.value)} aria-label="Ay" className="w-full bg-blue-900/60 border border-blue-700/50 rounded-xl px-3 py-2.5 text-white text-sm">
              {['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'].map((ad, i) => <option key={ad} value={i + 1}>{ad}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">Belge Türü</label>
            <select
              value={belgeTurFiltre ? `tur:${belgeTurFiltre}` : topluTip}
              onChange={e => {
                const v = e.target.value
                if (v.startsWith('tur:')) {
                  setBelgeTurFiltre(v.slice(4))
                  setTopluTip('hepsi')
                } else {
                  setBelgeTurFiltre('')
                  setTopluTip(v)
                }
              }}
              aria-label="Belge türü" className="w-full bg-blue-900/60 border border-blue-700/50 rounded-xl px-3 py-2.5 text-white text-sm">
              <option value="">Tümü</option>
              <option value="efatura">e-Fatura</option>
              <option value="earsiv">e-Arşiv</option>
              <option value="esmm">e-SMM</option>
              <option value="utts">UTTS</option>
              <option value="zrapor">Z Raporu (Kesilen)</option>
              <option value="giderfisi">Gider Fişi (Alınan)</option>
              <option disabled>— Fatura Türü —</option>
              <option value="tur:IADE">İade</option>
              <option value="tur:ISTISNA">İstisna</option>
              <option value="tur:TEVKIFAT">Tevkifat</option>
              <option value="tur:TEVKIFATIADE">Tevkifat İade</option>
              <option value="tur:ITHALAT">İthalat</option>
              <option value="tur:IHRACAT">İhracat</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">İşlem Yönü</label>
            <select value={yonFiltre} onChange={e => setYonFiltre(e.target.value)} aria-label="İşlem yönü" className="w-full bg-blue-900/60 border border-blue-700/50 rounded-xl px-3 py-2.5 text-white text-sm">
              <option value="all">Tümü</option>
              <option value="ALIS">Alış (Alınan)</option>
              <option value="SATIS">Satış (Kesilen)</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">Sorgulama Yöntemi</label>
            <select
              value={sorguSecimi}
              onChange={e => setSorguSecimi(e.target.value)}
              disabled={topluSorguluyor}
              className="w-full bg-blue-900/60 border border-cyan-500/40 rounded-xl px-3 py-2.5 text-white text-sm disabled:opacity-50"
              title="Yeni belge kontrolü / Eksikleri tamamlama / Tümünü yeniden sorgula (onarım)"
            >
              <option value="yeni">Yeni faturaları kontrol et</option>
              <option value="eksik">Eksikleri tamamla (sorgusuz indir)</option>
              <option value="onarim">Tümünü yeniden sorgula (onarım)</option>
            </select>
          </div>
        </div>
        {/* Luca parça boyu + Ek Filtreler */}
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <div className="flex items-center gap-1.5" title="GİB→Luca sorgu adımının parça boyu. MUBiS yükleme tüm parçalar inince komple yapılır.">
            <span className="text-[11px] text-gray-500 whitespace-nowrap">Luca parça:</span>
            {[['7gun', '7 Gün'], ['30gun', '30 Gün']].map(([v, e]) => (
              <button
                key={v}
                onClick={() => setTopluPeriyod(v)}
                disabled={topluSorguluyor}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${topluPeriyod === v ? 'bg-yellow-500/30 border border-yellow-500/40 text-yellow-300' : 'bg-blue-900/60 border border-blue-700/50 text-gray-400 hover:text-gray-200'}`}
              >
                {e}
              </button>
            ))}
          </div>
          <button
            onClick={() => setEkFiltreAcik(p => !p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border ${ekFiltreAcik ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-300' : 'bg-blue-900/60 border-blue-700/50 text-gray-400 hover:text-gray-200'}`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" /> Ek Filtreler (Opsiyonel)
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${ekFiltreAcik ? 'rotate-180' : ''}`} />
          </button>
        </div>
        {ekFiltreAcik && (
          <div className="mt-3 bg-blue-900/30 border border-blue-800/30 rounded-xl p-3.5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <div className="flex flex-col">
              <label className="block text-[11px] text-gray-500 mb-1">Tarih Aralığı (başlangıç)</label>
              <input type="date" value={efTarihBas} onChange={e => setEfTarihBas(e.target.value)} className="w-full h-[36px] bg-blue-900/60 border border-blue-700/50 rounded-lg px-2.5 text-white text-xs" />
            </div>
            <div className="flex flex-col">
              <label className="block text-[11px] text-gray-500 mb-1">Tarih Aralığı (bitiş)</label>
              <input type="date" value={efTarihBit} onChange={e => setEfTarihBit(e.target.value)} className="w-full h-[36px] bg-blue-900/60 border border-blue-700/50 rounded-lg px-2.5 text-white text-xs" />
            </div>
            <div className="flex flex-col">
              <label className="block text-[11px] text-gray-500 mb-1">Belge No</label>
              <input value={efBelgeNo} onChange={e => setEfBelgeNo(e.target.value)} placeholder="Belge numarası girin..." className="w-full h-[36px] bg-blue-900/60 border border-blue-700/50 rounded-lg px-2.5 text-white text-xs placeholder-gray-600" />
            </div>
            <div className="flex flex-col">
              <label className="block text-[11px] text-gray-500 mb-1">Tutar Aralığı</label>
              <div className="flex items-center gap-1.5">
                <input value={efTutarMin} onChange={e => setEfTutarMin(e.target.value)} placeholder="Min ₺" className="w-full h-[36px] bg-blue-900/60 border border-blue-700/50 rounded-lg px-2.5 text-white text-xs placeholder-gray-600" />
                <span className="text-gray-600 text-xs">–</span>
                <input value={efTutarMax} onChange={e => setEfTutarMax(e.target.value)} placeholder="Max ₺" className="w-full h-[36px] bg-blue-900/60 border border-blue-700/50 rounded-lg px-2.5 text-white text-xs placeholder-gray-600" />
              </div>
            </div>
            <div className="flex flex-col">
              <label className="block text-[11px] text-gray-500 mb-1">VKN / TCKN / Ünvan</label>
              <input value={efVkn} onChange={e => setEfVkn(e.target.value)} placeholder="Vergi no girin..." className="w-full h-[36px] bg-blue-900/60 border border-blue-700/50 rounded-lg px-2.5 text-white text-xs placeholder-gray-600" />
            </div>
            <div className="flex flex-col">
              <span className="block text-[11px] text-transparent mb-1 select-none">.</span>
              <button onClick={() => { setEfTarihBas(''); setEfTarihBit(''); setEfBelgeNo(''); setEfTutarMin(''); setEfTutarMax(''); setEfVkn('') }} className="h-[36px] px-3 rounded-lg bg-blue-900/60 border border-blue-700/50 text-gray-400 text-xs hover:text-white whitespace-nowrap">
                Filtreleri Temizle
              </button>
            </div>
          </div>
        )}
        <p className="text-[11px] text-gray-400 mt-2.5">İptal/itiraz sorgulama: e-Fatura, e-Arşiv ve alınan e-SMM belgeleri indirilmeden önce Luca’da kontrol edilir; iptal edilenler yüklenmez.</p>
        {sorguSecimi !== 'yeni' && (
          <p className="text-[11px] text-gray-500 mt-2.5">
            {sorguSecimi === 'eksik' && 'Seçili yöntem: Yalnızca doğrulanmamış sorgular ve eksik aktarım adımları çalıştırılır.'}
            {sorguSecimi === 'onarim' && 'Seçili yöntem: dönem yeniden sorgulanır; TÜM faturalar fark kontrolü olmadan yeniden indirilip yeniden işlenir — KDV tutarları ve eşleşmeler yenilenir. Süre uzundur.'}
          </p>
        )}
        {topluMesaj && (
          <div className="mt-3 px-4 py-3 bg-blue-900/60 border border-blue-700/50 rounded-xl text-sm text-gray-300 flex items-start justify-between gap-3">
            <span>{topluMesaj}</span>
            {!topluSorguluyor && (
              <button onClick={() => setTopluMesaj('')} title="Mesajı temizle"><X className="w-4 h-4 text-gray-500 hover:text-gray-300" /></button>
            )}
          </div>
        )}
      </div>

      {/* 2.8.4: OTOMATIK SORGU — VPS cron plani (tum aktif musteriler) */}
      <div className="bg-blue-950/30 rounded-2xl border border-blue-800/30 mb-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <button
            type="button"
            onClick={() => setCronAcik(a => !a)}
            className="flex items-center gap-3 text-left min-w-0"
          >
            <div className="p-2.5 bg-cyan-500/15 rounded-xl border border-cyan-500/30 shrink-0">
              <CalendarCheck className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                Otomatik Sorgu
                <span className="text-gray-400 text-xs font-normal">{cronAcik ? 'kapat ▲' : 'aç ▼'}</span>
              </h2>
              <p className="text-xs text-gray-500">Seçilen gün ve saatte İstanbul sunucusu tüm aktif müşterilerin faturalarını Luca'dan sorgular; MUBiS'e ve Luca'ya kaydeder. Daha önce yüklenmiş faturalar tekrar yüklenmez.</p>
            </div>
          </button>
          <button
            onClick={() => cronKaydet(!cronAktif)}
            disabled={cronKaydediliyor || cronYukleniyor}
            className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 shrink-0 ${cronAktif ? 'bg-cyan-500' : 'bg-blue-800/80'}`}
            title={cronAktif ? 'Otomatik sorgu açık' : 'Otomatik sorgu kapalı'}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${cronAktif ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
        {cronAcik && (cronYukleniyor ? (
          <div className="px-5 pb-5">
            <p className="text-xs text-gray-500 mt-1">Yükleniyor…</p>
          </div>
        ) : (
          <div className="px-5 pb-5 border-t border-blue-800/30 pt-4">
            <div className="flex flex-wrap items-center gap-4 mt-0">
              <div>
                <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">Günler</label>
                <div className="flex flex-wrap gap-1.5">
                  {CRON_GUNLER.map(g => (
                    <button
                      key={g.v}
                      onClick={() => cronSetToggle(setCronGunler)(g.v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${cronGunler.has(g.v) ? 'bg-cyan-500/25 border-cyan-500/50 text-cyan-200' : 'bg-blue-900/60 border-blue-700/50 text-gray-400 hover:text-gray-200'}`}
                    >
                      {g.e}
                    </button>
                  ))}
                </div>
              </div>
              <div className="w-24">
                <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">Saat</label>
                <input
                  type="time"
                  value={cronSaat}
                  onChange={e => setCronSaat(e.target.value)}
                  className="w-full bg-blue-900/60 border border-blue-700/50 rounded-xl px-2.5 py-2 text-white text-sm"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-start gap-6 mt-4">
              <div>
                <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">Belge Türleri</label>
                <div className="flex flex-wrap gap-1.5">
                  {CRON_TURLAR.map(t => (
                    <button
                      key={t.v}
                      onClick={() => cronSetToggle(setCronTurlar)(t.v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${cronTurlar.has(t.v) ? 'bg-yellow-500/25 border-yellow-500/50 text-yellow-200' : 'bg-blue-900/60 border-blue-700/50 text-gray-400 hover:text-gray-200'}`}
                    >
                      {t.e}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">İşlem Yönü</label>
                <div className="flex flex-wrap gap-1.5">
                  {CRON_YONLER.map(t => (
                    <button
                      key={t.v}
                      onClick={() => cronSetToggle(setCronYonler)(t.v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${cronYonler.has(t.v) ? 'bg-yellow-500/25 border-yellow-500/50 text-yellow-200' : 'bg-blue-900/60 border-blue-700/50 text-gray-400 hover:text-gray-200'}`}
                    >
                      {t.e}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4">
              <button
                onClick={() => setCronMusteriAcik(a => !a)}
                className="text-xs text-cyan-300 hover:text-cyan-200 flex items-center gap-1.5"
              >
                <span className={`transition-transform ${cronMusteriAcik ? 'rotate-90' : ''}`}>▸</span>
                Müşteri Seçimi {cronMusteriAcik && cronMusteriler.size ? `(${cronMusteriler.size} müşteri)` : '— tüm aktif müşteriler'}
              </button>
              {cronMusteriAcik && (
                <div className="mt-2 border border-blue-800/40 rounded-xl p-2.5 bg-blue-900/20">
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      onClick={() => setCronMusteriler(new Set(siraliMusteriler.map(m => m.id)))}
                      className="px-2.5 py-1 rounded-lg text-[11px] bg-cyan-600/80 hover:bg-cyan-500 text-white"
                    >Tümünü Seç</button>
                    <button
                      onClick={() => setCronMusteriler(new Set())}
                      className="px-2.5 py-1 rounded-lg text-[11px] bg-blue-900/60 border border-blue-700/50 text-gray-300 hover:text-white"
                    >Temizle (tüm aktif müşteriler)</button>
                    <span className="text-[11px] text-gray-500">{cronMusteriler.size ? `${cronMusteriler.size} müşteri seçili` : 'Seçim yok — tüm aktif müşteriler sorgulanır'}</span>
                  </div>
                  <div className="max-h-40 overflow-y-auto pr-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                    {siraliMusteriler.map(m => (
                      <label key={m.id} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-blue-900/40 cursor-pointer text-xs text-gray-300">
                        <input
                          type="checkbox"
                          checked={cronMusteriler.has(m.id)}
                          onChange={() => cronSetToggle(setCronMusteriler)(m.id)}
                          className="accent-cyan-500"
                        />
                        <span className="truncate">{m.name || m.short_name || m.id}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2.5 mt-4">
              <button
                onClick={() => cronKaydet()}
                disabled={cronKaydediliyor}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium disabled:opacity-50"
              >
                {cronKaydediliyor ? 'Kaydediliyor…' : (cronPlan ? 'Planı Güncelle' : 'Kaydet')}
              </button>
              {cronPlan && (
                <button
                  onClick={cronIptal}
                  className="px-4 py-2 rounded-xl bg-blue-900/60 border border-blue-700/50 text-gray-300 hover:text-white text-sm"
                >
                  İptal Et
                </button>
              )}
              <span className="text-xs text-gray-500 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Son çalışma: {cronSonucOzet()}
              </span>
            </div>
            <p className="text-[11px] text-gray-600 mt-2.5">
              Not: Tüm müşteriler sırayla sorgulandığı için işlem saatler sürebilir — gece saatleri (ör. 03:00) önerilir. Ofis bilgisayarı açıkken yerel yardımcı dosyaları Google Drive klasörlerine de kopyalar.
            </p>
            {cronMesaj && (
              <div className={`mt-3 px-4 py-3 rounded-xl text-sm border ${cronMesaj.ok ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-200' : 'bg-red-500/10 border-red-500/40 text-red-300'}`}>
                {cronMesaj.t}
              </div>
            )}
            {cronTalepler.length > 0 && (
              <div className="mt-4">
                <div className="text-xs text-gray-400 mb-1.5">Müşteri Fatura Güncelle Talepleri (son 20)</div>
                <p className="text-xs text-gray-500 mb-2">Bu liste müşterilerin gönderdiği talepleri gösterir; yukarıdaki manuel sorgulama döneminden bağımsızdır.</p>
                <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                  {cronTalepler.map(t => (
                    <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-1.5 bg-blue-900/40 border border-blue-800/30 rounded-lg text-xs">
                      <span className="text-gray-300 min-w-0 break-words">
                        {t.musteri_adi} — Talep dönemi: {t.ay}/{t.yil}
                        <span className="text-gray-500 ml-2">Talep tarihi: {new Date(t.created_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </span>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full font-medium ${
                        t.durum === 'tamam' ? 'bg-green-500/15 text-green-400' :
                        t.durum === 'hata' ? 'bg-red-500/15 text-red-400' :
                        t.durum === 'calisiyor' ? 'bg-yellow-500/15 text-yellow-300' :
                        'bg-blue-500/15 text-blue-300'
                      }`}>
                        {t.durum === 'tamam' ? 'Tamamlandı' : t.durum === 'hata' ? 'Hata' : t.durum === 'calisiyor' ? 'Sorgulanıyor' : 'Bekliyor'}
                        {t.durum === 'hata' && t.hata ? `: ${String(t.hata).slice(0, 60)}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 2.7.542: BOLUM 2 — ISLEMLER (tek satir: baslik solda, 7 dugme esit genislik + ortali duzen) */}
      <div className="bg-blue-950/30 rounded-2xl p-4 border border-blue-800/30 mb-6">
        <div className="flex flex-wrap xl:flex-nowrap items-stretch gap-2.5">
          <div className="flex items-center gap-2.5 shrink-0 pr-2">
            <span className="w-6 h-6 shrink-0 rounded-full bg-yellow-500 text-blue-950 font-bold text-xs flex items-center justify-center">2</span>
            <div className="leading-tight">
              <h2 className="text-sm font-semibold text-white">İşlemler</h2>
              <p className="text-[10px] text-gray-500 hidden 2xl:block">Seçtiğiniz kriterlere göre işlem yapın.</p>
            </div>
          </div>
          <button
            onClick={() => islemTikla('sorgula', () => {
              handleTopluSorgula()
            })}
            disabled={topluSorguluyor || tekSorguluyor || (sorguKapsam === 'tek' ? !seciliId : !topluSecili.length)}
            className={`islem-btn flex-1 min-w-[104px] px-2 py-2.5 rounded-xl bg-gradient-to-r from-yellow-400 to-yellow-500 text-blue-950 disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-yellow-500/20 flex flex-col items-center justify-center text-center gap-1 leading-tight transition-transform${basilanEfekt('sorgula')}`}
            title="Seçili kriterler için Luca üzerinden sorgular, MUBiS'e indirir ve klasörlere kopyalar"
          >
            <Search className="w-4 h-4 shrink-0" />
            <span className="text-[11px] font-bold whitespace-nowrap">Sorgula ve Yükle</span>
            <span className="text-[9px] font-normal opacity-70 whitespace-nowrap">Luca → MUBiS</span>
          </button>
          {(tekSorguluyor || topluSorguluyor || bekleyenLucaIslemi) && (
            <button
              onClick={() => tekSorguluyor ? tekSorguDurdurRef.current?.() : handleTopluDurdur()}
              className="islem-btn flex-1 min-w-[104px] px-2 py-2.5 rounded-xl bg-red-600 text-white hover:bg-red-500 flex flex-col items-center justify-center text-center gap-1 leading-tight"
              title="Sunucudaki çalışan ve bekleyen sorgulara durdurma isteği gönderir"
            >
              <Square className="w-4 h-4 shrink-0" />
              <span className="text-[11px] font-bold whitespace-nowrap">Sorgulamayı Durdur</span>
              <span className="text-[9px] font-normal opacity-70">Sunucudaki işleri durdur</span>
            </button>
          )}
          <button
            onClick={() => islemTikla('luca', handleLucaIndir)}
            disabled={topluSorguluyor || tekSorguluyor || (!topluSecili.length && !seciliId)}
            className={`islem-btn flex-1 min-w-[104px] px-2 py-2.5 rounded-xl bg-blue-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-500 flex flex-col items-center justify-center text-center gap-1 leading-tight transition-transform${basilanEfekt('luca')}`}
            title="GİB sorgusu yapmadan, Luca'daki hazır faturaları indirip yükler"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span className="text-[11px] font-semibold whitespace-nowrap">Luca'dan İndir</span>
            <span className="text-[9px] font-normal opacity-70 whitespace-nowrap">Sadece indir</span>
          </button>
          <button
            onClick={() => islemTikla('toplu', () => { setSorguKapsam('toplu'); setTopluAcik(true) })}
            disabled={topluSorguluyor || tekSorguluyor}
            className={`islem-btn flex-1 min-w-[104px] px-2 py-2.5 rounded-xl bg-teal-600 text-white disabled:opacity-40 hover:bg-teal-500 flex flex-col items-center justify-center text-center gap-1 leading-tight transition-transform${basilanEfekt('toplu')}`}
            title="Birden fazla müşteriyi sırayla sorgula"
          >
            <Users className="w-4 h-4 shrink-0" />
            <span className="text-[11px] font-semibold whitespace-nowrap">Toplu Sorgulama</span>
            <span className="text-[9px] font-normal opacity-70 whitespace-nowrap">Birden fazla müşteri</span>
          </button>
          <button
            onClick={() => islemTikla('dosya', () => setDisEylem({ tur: 'dosya', sira: Date.now() }))}
            disabled={!seciliId}
            className={`islem-btn flex-1 min-w-[104px] px-2 py-2.5 rounded-xl bg-violet-600 text-white disabled:opacity-40 hover:bg-violet-500 flex flex-col items-center justify-center text-center gap-1 leading-tight transition-transform${basilanEfekt('dosya')}`}
            title="XML / ZIP / PDF dosyalarını elle yükle"
          >
            <FolderOpen className="w-4 h-4 shrink-0" />
            <span className="text-[11px] font-semibold whitespace-nowrap">Dosyadan Yükle</span>
            <span className="text-[9px] font-normal opacity-70 whitespace-nowrap">XML / ZIP / PDF</span>
          </button>
          <button
            onClick={() => islemTikla('excel', () => setDisEylem({ tur: 'excel', sira: Date.now() }))}
            disabled={!seciliId}
            className={`islem-btn flex-1 min-w-[104px] px-2 py-2.5 rounded-xl bg-blue-950 border border-blue-700/50 text-white disabled:opacity-40 hover:bg-blue-900 flex flex-col items-center justify-center text-center gap-1 leading-tight transition-transform${basilanEfekt('excel')}`}
            title="Listedeki faturaları Excel (CSV) olarak dışa aktar"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0 text-green-400" />
            <span className="text-[11px] font-semibold whitespace-nowrap">Excel'e Aktar</span>
            <span className="text-[9px] font-normal opacity-70 whitespace-nowrap">Listeyi dışa aktar</span>
          </button>
          <button
            onClick={() => islemTikla('klasor', () => setDisEylem({ tur: 'klasor', sira: Date.now() }))}
            disabled={!seciliId}
            className={`islem-btn flex-1 min-w-[104px] px-2 py-2.5 rounded-xl bg-green-600 text-white disabled:opacity-40 hover:bg-green-500 flex flex-col items-center justify-center text-center gap-1 leading-tight transition-transform${basilanEfekt('klasor')}`}
            title="Klasör seçin — içindeki zip/xlsx/pdf/xml belgeleri seçili müşteriye yüklenir"
          >
            <FolderOpen className="w-4 h-4 shrink-0" />
            <span className="text-[11px] font-semibold whitespace-nowrap">Klasörden Yükle</span>
            <span className="text-[9px] font-normal opacity-70 whitespace-nowrap">zip / xlsx / pdf / xml</span>
          </button>
          <div className="relative flex-1 min-w-[104px] flex">
            <button
              onClick={() => islemTikla('dokum', () => setDokumAcik(v => !v))}
              disabled={!seciliId}
              className={`islem-btn w-full px-2 py-2.5 rounded-xl bg-cyan-600 text-white disabled:opacity-40 hover:bg-cyan-500 flex flex-col items-center justify-center text-center gap-1 leading-tight transition-transform${basilanEfekt('dokum')}`}
              title="Excel/CSV döküm yükleme seçenekleri (Gümrük / Gider / Z Raporu)"
            >
              <Upload className="w-4 h-4 shrink-0" />
              <span className="text-[11px] font-semibold whitespace-nowrap flex items-center gap-1">Döküm Yükle <ChevronDown className={`w-3 h-3 transition-transform ${dokumAcik ? 'rotate-180' : ''}`} /></span>
              <span className="text-[9px] font-normal opacity-70 whitespace-nowrap">Excel / CSV</span>
            </button>
            {dokumAcik && (
              <div className="absolute right-0 top-full mt-1.5 z-40 w-72 bg-blue-950 border border-blue-700/60 rounded-xl shadow-2xl shadow-black/50 p-1.5 flex flex-col gap-1">
                <button
                  onClick={() => { setDokumAcik(false); setDisEylem({ tur: 'dokum-gumruk', sira: Date.now() }) }}
                  className="px-3 py-2 rounded-lg text-xs text-left text-cyan-300 hover:bg-cyan-500/15 flex flex-col gap-0.5"
                >
                  <span className="flex items-center gap-1.5 font-medium"><Upload className="w-3.5 h-3.5" /> Gümrük / İthalat Dökümü</span>
                  <span className="text-[10px] text-gray-500">Örn: TEMMUZ-AFA GÜMRÜK.csv — İthalde ödenen KDV'ye işlenir</span>
                </button>
                <button
                  onClick={() => { setDokumAcik(false); setDisEylem({ tur: 'dokum-gider', sira: Date.now() }) }}
                  className="px-3 py-2 rounded-lg text-xs text-left text-sky-300 hover:bg-sky-500/15 flex flex-col gap-0.5"
                >
                  <span className="flex items-center gap-1.5 font-medium"><Upload className="w-3.5 h-3.5" /> Gider Fiş / Fatura Dökümü</span>
                  <span className="text-[10px] text-gray-500">Örn: HAZİRAN-AFA 10062026.csv — Alınan fatura KDV'ye işlenir</span>
                </button>
                <button
                  onClick={() => { setDokumAcik(false); setDisEylem({ tur: 'dokum-zraporu', sira: Date.now() }) }}
                  className="px-3 py-2 rounded-lg text-xs text-left text-violet-300 hover:bg-violet-500/15 flex flex-col gap-0.5"
                >
                  <span className="flex items-center gap-1.5 font-medium"><Upload className="w-3.5 h-3.5" /> Z Raporu Dökümü</span>
                  <span className="text-[10px] text-gray-500">Örn: Z RAPORU ...csv — Yazar kasa satışları, Kesilen KDV'ye işlenir</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toplu sorgu (coklu musteri) */}
      <div className="bg-blue-950/30 rounded-2xl border border-blue-800/30 mb-6">
        <button
          onClick={() => setTopluAcik(p => !p)}
          className="w-full flex items-center justify-between px-6 py-4 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-white">
            <Layers className="w-4 h-4 text-yellow-400" />
            Toplu Sorgu (çoklu müşteri)
            {topluSecili.length > 0 && (
              <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-400">{topluSecili.length} seçili</span>
            )}
          </span>
          <span className="text-gray-400 text-xs">{topluAcik ? 'kapat ▲' : 'aç ▼'}</span>
        </button>
        {topluAcik && (
          <div className="px-6 pb-6 border-t border-blue-800/30 pt-4">
            <p className="text-xs text-gray-400 mb-3">
              Seçilen müşteriler SIRALI sorgulanır. Luca oturumu açık kalır; müşteri otomatik değiştirilir, lucadan çıkıp tekrar girmek gerekmez.
            </p>
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <button onClick={toggleTopluHepsi} className="px-3 py-2 rounded-lg text-xs bg-blue-900/60 border border-blue-700/50 text-gray-300 hover:text-white">
                {topluSecili.length === siraliMusteriler.length ? 'Hiçbirini seçme' : 'Hepsini seç'}
              </button>
              {/* 2.7.522: yıl/ay/belge seçimi üstteki şeritte (aynı state) */}
              {/* 2.7.460: GIB->Luca sorgu adiminin parça boyu. Parçalama YALNIZCA
                  Luca sorgusunda uygulanir; MUBiS yükleme tüm parçalar inince
                  KOMPLE yapılır, klasörlere kopyalama en sonda. */}
              <div className="flex items-center gap-1 ml-auto" title="GİB→Luca sorgu adımının parça boyu. MUBiS yükleme tüm parçalar inince komple yapılır.">
                <span className="text-[11px] text-gray-500 whitespace-nowrap">GİB→Luca parça:</span>
                {[['7gun', '7 Gün'], ['30gun', '30 Gün']].map(([v, e]) => (
                  <button
                    key={v}
                    onClick={() => setTopluPeriyod(v)}
                    disabled={topluSorguluyor}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${topluPeriyod === v ? 'bg-yellow-500/30 border border-yellow-500/40 text-yellow-300' : 'bg-blue-900/60 border border-blue-700/50 text-gray-400 hover:text-gray-200'}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto border border-blue-800/30 rounded-xl mb-3 divide-y divide-blue-800/20">
              {siraliMusteriler.map(c => (
                <label key={c.id} className="flex items-center gap-3 px-4 py-2 hover:bg-blue-900/30 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={topluSecili.includes(String(c.id))}
                    onChange={() => toggleToplu(String(c.id))}
                    className="accent-yellow-500"
                  />
                  <span className="text-sm text-gray-300">{musteriAdi(c)}</span>
                  {c.vkn && <span className="text-xs text-gray-500">{c.vkn}</span>}
                </label>
              ))}
            </div>
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-400 mb-1">Sorgulama seçimi</label>
              <select
                value={sorguSecimi}
                onChange={e => setSorguSecimi(e.target.value)}
                disabled={topluSorguluyor}
                className="w-full max-w-md bg-blue-900/60 border border-cyan-500/40 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-50"
              >
                <option value="yeni">Yeni faturaları kontrol et (seçili dönemin tamamı)</option>
                <option value="eksik">Eksik sorgu ve indirmeleri tamamla</option>
                <option value="onarim">Tümünü yeniden sorgula ve indir (onarım)</option>
              </select>
              <p className="text-[11px] text-gray-500 mt-1.5 max-w-2xl">
                {sorguSecimi === 'yeni' && 'Yeni belge kontrolü, sonradan geriye tarihli eklenen faturalar için seçili dönemi yeniden tarar. Doğrulanmış, değişmemiş PDF\u2019ler korunur — yalnızca yeni belgeler indirilip MUBiS\u2019e yüklenir.'}
                {sorguSecimi === 'eksik' && 'Yalnızca doğrulanmamış sorgular ve eksik aktarım adımları çalıştırılır.'}
                {sorguSecimi === 'onarim' && 'Seçili dönemin tamamı yeniden sorgulanır; tüm faturalar yeniden indirilip MUBiS\u2019e yeniden yüklenir — KDV tutarları ve eşleşmeler yenilenir. Süre uzundur, yalnızca veri tutarsızlığı onarımında kullanın.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleTopluSorgula()}
              disabled={!topluSecili.length || topluSorguluyor || tekSorguluyor}
              className="px-4 py-2 rounded-xl bg-teal-600/80 border border-teal-500/40 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-teal-600"
            >
              {topluSorguluyor ? 'Sorgulaniyor...' : sorguSecimi === 'yeni' ? 'Faturaları Sorgula ve İndir' : sorguSecimi === 'eksik' ? 'Eksikleri Tamamla' : 'Tümünü Yeniden Sorgula ve İndir'}
            </button>
            <button
              onClick={handleLucaIndir}
              disabled={!topluSecili.length || topluSorguluyor || tekSorguluyor}
              className="px-4 py-2 rounded-xl bg-blue-900/60 border border-blue-600/50 text-blue-200 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-800/70"
              title="Luca'da daha önce sorgulanmış (GİB'den Getir ile listeye düşmüş) seçilen ay/tür faturalarını indirir — yeni sorgu yapmaz"
            >
              Luca'dan Fatura İndir
            </button>
            {/* 2.7.574: LUCA SORGULA — sadece Luca'da sorgu yapar, indirme yukleme yok */}
            <button
              onClick={handleLucaSorgula}
              disabled={topluSorguluyor || tekSorguluyor}
              className="px-4 py-2 rounded-xl bg-cyan-900/50 border border-cyan-600/50 text-cyan-100 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-cyan-800/60"
              title="Sadece Luca'da GİB'den Getir sorgusu yapar (indirme/yükleme yok). Sonrasında 'Luca'dan İndir' ile indirilir."
            >
              <span className="flex items-center gap-2"><Search className="w-4 h-4" /> Luca Sorgula</span>
              <span className="block text-[10px] opacity-70">Sadece sorgu</span>
            </button>
            {/* 2.7.574: sorgulama sürerken Durdur */}
            {(topluSorguluyor || bekleyenLucaIslemi) && (
              <button
                onClick={handleTopluDurdur}
                className="px-4 py-2 rounded-xl bg-red-600/80 border border-red-500/50 text-white text-sm font-semibold hover:bg-red-600 flex items-center gap-2"
                title="Mevcut adım tamamlanınca sorgulamayı keser"
              >
                <Square className="w-3.5 h-3.5" /> Sorgulamayı Durdur
              </button>
            )}
            </div>
            {topluMesaj && (
              <div className="mt-3 px-4 py-3 bg-blue-900/60 border border-blue-700/50 rounded-xl text-sm text-gray-300 flex items-start justify-between gap-3">
                <span>{topluMesaj}</span>
                {!topluSorguluyor && (
                  <button onClick={() => setTopluMesaj('')} title="Mesajı temizle"><X className="w-4 h-4 text-gray-500 hover:text-gray-300" /></button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2.7.521: Excel/CSV dökümü yükleme kartı FaturaListesiKarti içindeki
          liste araçları satırına taşındı (Filtre / Klasörden Yükle / Dosya Yükle yanına) */}

      {/* 2.7.442: Fatura bazli aktarim durum tablosu */}
      {(kaliciAktarimlar.length > 0 || aktarimDurumHatasi) && (
        <section className="mb-6 rounded-2xl border border-blue-800/30 bg-blue-950/30 p-4 text-sm text-gray-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-white">Kayıtlı fatura aktarım durumu</h2>
            <button type="button" onClick={() => handleTopluSorgula(true)} disabled={topluSorguluyor || tekSorguluyor || (sorguKapsam === 'tek' ? !seciliId : !topluSecili.length)} className="rounded-lg border border-blue-600 px-3 py-2 disabled:opacity-40">Eksik adımları tamamla</button>
          </div>
          {aktarimDurumHatasi && <p className="mt-2 text-amber-300">Kayıtlı aktarım durumu yüklenemedi.</p>}
          <ul className="mt-2 space-y-2" aria-live="polite">
            {kaliciAktarimlar.filter(satir => !topluTip || topluTip === 'hepsi' || topluTip === satir.tur).map(satir => {
              const musteri = siraliMusteriler.find(c => String(c.id) === String(satir.client_id))
              const etiket = { efatura: 'e-Fatura', earsiv: 'e-Arşiv', esmm: 'e-SMM', utts: 'UTTS' }[satir.tur]
              return <li key={[satir.client_id, satir.tur, satir.yon].join(':')} className="border-t border-blue-800/30 pt-2">
                <div className="font-medium">{musteri ? musteriAdi(musteri) : 'Müşteri ' + satir.client_id} / {etiket} / {satir.yon === 'alis' ? 'Alış' : 'Satış'}</div>
                <div className="text-xs text-gray-300">{faturaAktarimAsamaMetni(satir.durum)}</div>
                {satir.durum?.not && <div className="text-xs text-gray-400">{satir.durum.not}</div>}
              </li>
            })}
          </ul>
        </section>
      )}

      {aktarimKayitlari.length > 0 && (
        <div className="bg-blue-950/30 rounded-2xl border border-blue-800/30 mb-6 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-blue-800/30">
            <div>
              <h2 className="text-sm font-semibold text-white">Aktarım Sonuçları</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Son sorguda işlenen dosyalar — Luca: Luca aktarım klasörüne kaydedildi, MUBİS: buluta + fatura tablosuna aktarıldı.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">
                {aktarimKayitlari.filter(k => k.luca).length}/{aktarimKayitlari.length} Luca
                {' · '}
                {aktarimKayitlari.filter(k => k.mubis).length}/{aktarimKayitlari.length} MUBİS
              </span>
              <button onClick={() => setAktarimKayitlari([])} className="text-gray-500 hover:text-gray-300" title="Listeyi temizle">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-blue-950">
                <tr className="text-left text-gray-400 border-b border-blue-800/30">
                  <th className="px-4 py-2">Müşteri</th>
                  <th className="px-4 py-2">Belge</th>
                  <th className="px-4 py-2">Dosya / Fatura</th>
                  <th className="px-4 py-2">Ünvan</th>
                  <th className="px-4 py-2 text-center">Luca</th>
                  <th className="px-4 py-2 text-center">MUBİS</th>
                  <th className="px-4 py-2">Not</th>
                </tr>
              </thead>
              <tbody>
                {aktarimKayitlari.slice().reverse().map((k, i) => (
                  <tr key={i} className="border-b border-blue-800/20 last:border-0 hover:bg-blue-900/30">
                    <td className="px-4 py-1.5 text-gray-300 max-w-40 truncate" title={k.musteri}>{k.musteri}</td>
                    <td className="px-4 py-1.5 text-gray-400 whitespace-nowrap">{k.belge}</td>
                    <td className="px-4 py-1.5 text-gray-300">
                      <span className="block max-w-56 truncate" title={k.ad}>{k.ad}</span>
                      {k.faturaNo && <span className="text-gray-500">{k.faturaNo}</span>}
                    </td>
                    <td className="px-4 py-1.5 text-gray-400 max-w-48 truncate" title={k.unvan}>{k.unvan || '-'}</td>
                    <td className="px-4 py-1.5 text-center">
                      {k.luca ? <span className="text-green-400" title="Luca aktarım klasörüne kaydedildi">✓</span>
                        : <span className="text-gray-600" title="Luca klasörüne kopyalanmadı">–</span>}
                    </td>
                    <td className="px-4 py-1.5 text-center">
                      {k.mubis ? <span className="text-green-400" title="MUBİS'e aktarıldı">✓</span>
                        : <span className="text-red-400" title="Aktarılamadı">✗</span>}
                    </td>
                    <td className="px-4 py-1.5 text-red-300/80 max-w-40 truncate" title={k.hata}>{k.hata}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {secili ? (
        <FaturaListesiKarti
          key={secili.id}
          clientId={secili.id}
          client={secili}
          onSorguDurumDegis={tekSorguDurumDegis}
          disDonem={{ yil: topluYil, ay: topluAy, tip: topluTip || 'hepsi', sira: 0 }}
          sorguSecimi={sorguSecimi}
          sorguPeriyod={topluPeriyod}
          yonFiltre={yonFiltre}
          belgeTurFiltre={belgeTurFiltre}
          disFiltre={disFiltre}
          disEylem={disEylem}
        />
      ) : (
        <div className="text-center text-gray-500 py-16 bg-blue-950/20 rounded-2xl border border-blue-800/20">
          Sorgulama yapmak için yukarıdan bir müşteri seçin.
        </div>
      )}
    </div>
  )
}
