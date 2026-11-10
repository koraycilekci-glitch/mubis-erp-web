// Admin "Beyanname Kontrol Listesi" sayfasi:
// GİB Dijital VD'den ONAYLANMIS beyannameler sorgulanir (mali musavir
// kimligi, yardimci program uzerinden), VKN'lere gore musteri matrisine
// dagitilir: satir = musteri, sutun = beyanname turu.
//   - Onayli kayit varsa hucre YESIL "Gönderildi (n)" yazar (gozlem;
//     kullanici karariyla EZILEMEZ — lisansli uygulama ilkesi)
//   - Kayit yoksa hucrede secim: Kontrol edilecek / Verilecek / Bu dönem
//     gerekmiyor (beyanname_kararlar tablosuna yazilir)
import { useState, useEffect, useMemo, useCallback } from 'react'
import { ClipboardCheck, RefreshCw, X } from 'lucide-react'
import { useClients } from '../hooks/useClients'
import { getSettings } from '../services/settingsService'
import { supabase } from '../lib/supabase'
import {
  beyannameSorgula, beyannameKayitlariGetirDetay, beyannameKararlariGetir,
  beyannameKararKaydet, beyannameKararlariSifirla, beyannameKayitlariSifirla,
  donemKapsiyor
} from '../services/beyannameService'
import { gibLucaSorguDurdur } from '../utils/gibOdemeHelper'

const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const KARAR_ETIKET = { review: 'Kontrol edilecek', required: 'Verilecek', 'not-required': 'Bu dönem gerekmiyor' }

// Tur sutunlarini sabit oncelikle sirala (KDV 1, KDV 2, Muhtasar, Gecici,
// Damga once; digerleri alfabetik)
function turOncelik(t) {
  const s = String(t || '').toLocaleLowerCase('tr')
  if (/kdv\s*1/.test(s)) return 0
  if (/kdv\s*2/.test(s)) return 1
  if (/muhtasar|muhsgk/.test(s)) return 2
  if (/ge[çc]ici/.test(s)) return 3
  if (/damga/.test(s)) return 4
  return 9
}

// 2.7.486: Beyanname türü seçimi — matris yalnizca secilen tur grubunun
// sutunlarini gosterir. GİB tur adlari (KDV 1, Muhtasar, Geçici Vergi,
// Kurumlar Vergisi, Gelir Vergisi, Poşet Beyanname...) gruplara eslenir.
// 2.7.489: Beyanname türü seçimi artık GİB SORGUSUNA da uygulanır —
// grup, GİB e-Beyanname tür kodlarına (kodlar) eşlenir; seçilen tür için
// sorgu o kodla yapılır (hepsi/diğer/poset'te filtre yok, tüm türler gelir).
// GİB kodları: KDV1, KDV2, MUHSGK, DAMGA, KGECICI, GGECICI, KURUMLAR, GELIR.
const TUR_GRUPLARI = [
  { id: 'hepsi', ad: 'Hepsi', kodlar: [], test: () => true },
  { id: 'kdv1', ad: 'KDV', kodlar: ['KDV1'], test: t => /kdv\s*1/.test(t) },
  { id: 'kdv2', ad: 'KDV 2', kodlar: ['KDV2'], test: t => /kdv\s*2/.test(t) },
  { id: 'muhtasar', ad: 'Muhtasar', kodlar: ['MUHSGK'], test: t => /muhtasar|muhsgk/.test(t) },
  { id: 'gecici', ad: 'Geçici (Gelir + Kurum)', kodlar: ['KGECICI', 'GGECICI'], test: t => /ge[çc]ici/.test(t) },
  { id: 'gelir-gecici', ad: 'Gelir Geçici Vergi', kodlar: ['GGECICI'], test: t => /ggec[ıi]c[ıi]|gelir.*ge[çc]ici|ge[çc]ici.*gelir/i.test(t) },
  { id: 'kurum-gecici', ad: 'Kurum Geçici Vergi', kodlar: ['KGECICI'], test: t => /kgec[ıi]c[ıi]|kurum.*ge[çc]ici|ge[çc]ici.*kurum/i.test(t) },
  { id: 'kurumlar', ad: 'Kurumlar/Gelir', kodlar: ['KURUMLAR', 'GELIR'], test: t => /kurumlar|gelir/.test(t) },
  { id: 'poset', ad: 'Poşet', kodlar: [], test: t => /po[şs]et/.test(t) },
  { id: 'diger', ad: 'Diğer', kodlar: [], test: t => !(/kdv\s*1|kdv\s*2|muhtasar|muhsgk|ge[çc]ici|kurumlar|gelir|po[şs]et/.test(t)) }
]

export default function BeyannameKontrol() {
  const { clients } = useClients()
  const [yil, setYil] = useState(() => String(new Date().getFullYear()))
  const [ay, setAy] = useState(() => String(new Date().getMonth() + 1))
  const [kayitlar, setKayitlar] = useState([])
  const [okumaHatasi, setOkumaHatasi] = useState('')
  const [kararlar, setKararlar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [sorguluyor, setSorguluyor] = useState(false)
  const [sifirlaniyor, setSifirlaniyor] = useState(false)
  const [mesaj, setMesaj] = useState('')
  const [arama, setArama] = useState('')
  // 2.7.486: matriste gorunecek beyanname turu secimi
  const [turSecim, setTurSecim] = useState('hepsi')
  // 2.7.473: VD kimlik bilgileri Ayarlar > GİB Bağlantı Merkezi'ndeki
  // ADMIN vergi dairesi hesabindan otomatik okunur — bu sayfada tekrar
  // SORULMAZ (kullanici adi/parola penceresi kaldirildi).
  const [dvsKullanici, setDvsKullanici] = useState('')
  const [dvsParola, setDvsParola] = useState('')

  const veriYukle = useCallback(async (y, a) => {
    setYukleniyor(true)
    const [k, kar] = await Promise.all([
      beyannameKayitlariGetirDetay(+y, +a),
      beyannameKararlariGetir(+y, +a)
    ])
    setKayitlar(k.kayitlar || [])
    setOkumaHatasi(k.hata || '')
    setKararlar(kar)
    setYukleniyor(false)
  }, [])

  useEffect(() => { veriYukle(yil, ay) }, [yil, ay, veriYukle])

  // Admin VD bilgilerini ofis ayarlarindan oku (GİB Bağlantı Merkezi)
  useEffect(() => {
    getSettings().then(s => {
      setDvsKullanici(s.admin_gib_kullanici_kodu || '')
      setDvsParola(s.admin_gib_parola || '')
    }).catch(() => {})
  }, [])

  const turler = useMemo(() => {
    const set = new Set()
    for (const k of kayitlar) if (k.tur) set.add(k.tur)
    for (const kr of kararlar) if (kr.tur) set.add(kr.tur)
    return [...set].sort((a, b) => turOncelik(a) - turOncelik(b) || a.localeCompare(b, 'tr'))
  }, [kayitlar, kararlar])

  // 2.7.486: secili tur grubuna gore matris sutunlari
  const gosterilenTurler = useMemo(() => {
    const grup = TUR_GRUPLARI.find(g => g.id === turSecim) || TUR_GRUPLARI[0]
    return turler.filter(t => grup.test(String(t).toLocaleLowerCase('tr')))
  }, [turler, turSecim])

  const kararMap = useMemo(() => {
    const m = new Map()
    for (const kr of kararlar) m.set(`${kr.client_id}|${kr.tur}`, kr.karar)
    return m
  }, [kararlar])

  const musteriler = useMemo(() => [...(clients || [])]
    .map(c => {
      // Sahis mukelleflerde iki kimlik olabilir: isyeri VKN (vkn) ve
      // TCKN (tc) — GİB kaydi hangisiyle yuklendiyse ona gore eslesmeli.
      const vkn = String(c.vkn || '').replace(/\s/g, '')
      const tc = String(c.tc || '').replace(/\s/g, '')
      const kimlikler = [...new Set([vkn, tc].filter(k => /^\d{10,11}$/.test(k)))]
      return { ...c, _kimlik: vkn || tc, _kimlikler: kimlikler }
    })
    .sort((a, b) => (a.name || a.shortName || '').localeCompare(b.name || b.shortName || '', 'tr')),
  [clients])

  const filtreliMusteriler = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr')
    if (!q) return musteriler
    return musteriler.filter(c =>
      `${c.shortName || ''} ${c.name || ''} ${c._kimlik}`.toLocaleLowerCase('tr').includes(q))
  }, [musteriler, arama])

  // Teshis: kimligi MUBiS musterisiyle eslesmeyen GİB kayitlari —
  // VKN/TCKN farki veya musteride kayit olmayan mukellef varsa burada gorunur.
  // ESLESME KURALI: (1) kimlik (VKN/TCKN) birebir; (2) kimlik tutmuyorsa
  // ISIM eslesmesi — poşet beyannameler şahsın KİŞİSEL TCKN'siyle yüklenir
  // (ör. "AYTEN KAHVECİ (POSET)" TCKN ile, müşteri kartı ise firma VKN'si);
  // bu kayıtlar ünvan/ad soyad eşleşmesiyle müşteriye bağlanır.
  const normIsim = s => String(s || '')
    .toLocaleUpperCase('tr')
    .replace(/\([^)]*\)/g, '')
    .replace(/[ÇÇ]/g, 'C').replace(/[ĞĞ]/g, 'G').replace(/[İIı]/g, 'I')
    .replace(/[ÖÖ]/g, 'O').replace(/[ŞŞ]/g, 'S').replace(/[ÜÜ]/g, 'U')
    .replace(/[^A-Z0-9]/g, '')
  // Kucuk yazim farklarina dayanikli: Levenshtein mesafesi (1-2 harf farki)
  const lev = (a, b) => {
    if (a === b) return 0
    const m = a.length, n = b.length
    if (!m) return n
    if (!n) return m
    let onceki = Array.from({ length: n + 1 }, (_, i) => i)
    for (let i = 1; i <= m; i++) {
      const simdiki = [i]
      for (let j = 1; j <= n; j++) {
        simdiki[j] = Math.min(onceki[j] + 1, simdiki[j - 1] + 1, onceki[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      }
      onceki = simdiki
    }
    return onceki[n]
  }
  const eslesenClient = useMemo(() => {
    const kimlikMap = new Map(), isimMap = new Map()
    for (const c of musteriler) {
      for (const kim of (c._kimlikler || [])) kimlikMap.set(kim, c.id)
      const ad = normIsim(c.name || c.shortName)
      if (ad) {
        if (!isimMap.has(ad)) isimMap.set(ad, new Set())
        isimMap.get(ad).add(c.id)
      }
    }
    const map = new Map()
    for (const k of kayitlar) {
      const kim = String(k.vkn || '').replace(/\s/g, '')
      if (kim && kimlikMap.has(kim)) { map.set(k, kimlikMap.get(kim)); continue }
      const kisa = normIsim(k.unvan)
      const adaylar = isimMap.get(kisa)
      if (adaylar && adaylar.size === 1) { map.set(k, [...adaylar][0]); continue }
      // GİB listesi uzun isimleri "..." ile kısaltir — kısaltma işaretli
      // kayitlarda ONEK eslesmesi yapilir (en az 8 harf, tek musteri adayi).
      const kesik = /[…]\s*$|\.\.\.\s*$/.test(String(k.unvan || '').trim())
      if (!adaylar && kesik && kisa.length >= 8) {
        const onEk = []
        for (const [ad, ids] of isimMap) {
          if (ad.startsWith(kisa) || kisa.startsWith(ad)) onEk.push(...ids)
        }
        const tekil = [...new Set(onEk)]
        if (tekil.length === 1) { map.set(k, tekil[0]); continue }
      }
      // YAKIN ISIM: yazim farklarina dayanikli (GÜSEREN/GÜLSEREN,
      // ÜMMÜHAN/ÜMMİHAN, MUHAMMET/MUHAMMED...) — 1-2 harf farki, tek aday.
      if (kisa.length >= 6) {
        const yakin = []
        for (const [ad, ids] of isimMap) {
          if (kesik) {
            if (ad.length >= kisa.length && lev(ad.slice(0, kisa.length), kisa) <= 2) yakin.push(...ids)
          } else if (lev(ad, kisa) <= 2) {
            yakin.push(...ids)
          }
        }
        const tekil = [...new Set(yakin)]
        if (tekil.length === 1) map.set(k, tekil[0])
      }
    }
    return map
  }, [kayitlar, musteriler])
  const eslesmeyenler = useMemo(() => kayitlar.filter(k => !eslesenClient.has(k)), [kayitlar, eslesenClient])
  // Teshis: eslesmeyen kayit icin benzer isimli musteri adayi (VKN farkini gormek icin)
  const adayBul = k => {
    const kisa = normIsim(k.unvan)
    if (kisa.length < 5) return null
    return (musteriler.find(c => {
      const cn = normIsim(c.name || c.shortName)
      return cn && (cn.includes(kisa) || kisa.includes(cn))
    }) || null)
  }

  // Secili donemin kayitlari musteri+tur bazinda gruplanir — eslesenClient
  // kimlik VEYA isim eslesmesiyle musteriye baglar (poşet/şahıs kayıtları dahil).
  const kayitGrup = useMemo(() => {
    const m = new Map()
    for (const k of kayitlar) {
      const cid = eslesenClient.get(k)
      if (!cid) continue
      const anahtar = `${cid}|${k.tur}`
      m.set(anahtar, (m.get(anahtar) || 0) + 1)
    }
    return m
  }, [kayitlar, eslesenClient])

  // 2.8.32: Tum isleri durdur — kuyrukta bekleyen ve calisan butun yardimci
  // isleri iptal edilir; calisan isin sekmeleri kapatilir.
  const handleDurdur = async () => {
    setMesaj('Tüm işler durduruluyor...')
    try {
      await gibLucaSorguDurdur('otomatik', true)
      setMesaj('Tüm işler durduruldu. Kuyruk temizlendi; yeniden başlatabilirsiniz.')
    } catch (e) {
      setMesaj('Durdurma isteği gönderilemedi: ' + (e?.message || e))
    } finally {
      setSorguluyor(false)
    }
  }

  const handleSorgula = async () => {    if (!dvsKullanici || !dvsParola || sorguluyor) {
      setMesaj('VD kullanıcı kodu/şifresi kayıtlı değil. Ayarlar > GİB Bağlantı Merkezi\'nden admin vergi dairesi bilgilerini kaydedin.')
      return
    }
    setSorguluyor(true)
    // 2.7.489: Dönem X seçilirse beyannameler X+1 ayında yüklendiği için
    // GİB sorgusu takip eden ayın yükleme aralığıyla yapılır.
    const sorguYil = +ay === 12 ? +yil + 1 : +yil
    const sorguAy = +ay === 12 ? 1 : +ay + 1
    const donemStr = `${AY_ADLARI[+ay - 1]} ${yil}`
    const yuklemeStr = `${AY_ADLARI[sorguAy - 1]} ${sorguYil}`
    const grup = TUR_GRUPLARI.find(g => g.id === turSecim) || TUR_GRUPLARI[0]
    const kodlar = grup.kodlar || []
    setMesaj(`GİB'e bağlanıyor — ${donemStr} dönemi (${yuklemeStr} yükleme aralığı) onaylı beyannameler sorgulanıyor...`)
    try {
      let toplam = 0, onayliToplam = 0, bosSayi = 0, hatalar = [], turSonuclari = []
      const kodlarSorgula = kodlar.length ? kodlar : ['']
      for (let i = 0; i < kodlarSorgula.length; i++) {
        const kod = kodlarSorgula[i]
        if (kodlar.length) {
          setMesaj(`GİB sorgusu (${i + 1}/${kodlar.length}): ${donemStr} dönemi ${kod} türünde onaylı beyannameler sorgulanıyor...`)
        }
        try {
          const res = await beyannameSorgula({
            kullaniciKodu: dvsKullanici, parola: dvsParola, yil: +yil, ay: +ay, turKodu: kod,
            vknListesi: musteriler.map(c => c._kimlik).filter(v => /^\d{10,11}$/.test(v || ''))
          })
          if (!res.ok) {
            hatalar.push((kod || 'Sorgu') + ': ' + (res.error || res.hata || res.reason || 'bilinmeyen hata'))
          } else {
            toplam += res.toplam || 0
            onayliToplam += res.onayliToplam || 0
            turSonuclari.push({ kod: kod || 'Tüm türler', toplam: res.toplam || 0, onayli: res.onayliToplam || 0 })
            if (res.bosKanit) bosSayi++
            if (Array.isArray(res.basarisizSorgular) && res.basarisizSorgular.length) {
              hatalar.push((kod || 'Sorgu') + ': ' + res.basarisizSorgular.length + ' günlük sorgu GİB hatası nedeniyle atlandı')
            }
            if (Array.isArray(res.yazimHatalari) && res.yazimHatalari.length) {
              hatalar.push('VERİTABANI YAZIM HATASI: ' + [...new Set(res.yazimHatalari)].join(' | '))
            }
          }
        } catch (err) {
          hatalar.push((kod || 'Sorgu') + ': ' + (err.message || 'bilinmeyen hata'))
        }
      }
      const turOzeti = turSonuclari.length
        ? ' Tür sonuçları: ' + turSonuclari.map(s => `${s.kod}: ${s.onayli} onaylı (${s.toplam} satır)`).join(', ')
        : ''
      if (hatalar.length && !toplam && !onayliToplam) {
        setMesaj('Sorgu basarisiz: ' + hatalar.join(' | ') + turOzeti)
      } else if (!toplam && !onayliToplam && bosSayi >= kodlarSorgula.length) {
        setMesaj(`${donemStr} döneminde ${grup.ad === 'Hepsi' ? 'bu kimlikle' : grup.ad + ' türünde'} ONAYLI beyanname bulunamadı (GİB boşluk kanıtı; yükleme aralığı ${yuklemeStr}).${turOzeti}`)
      } else {
        setMesaj(`Sorgu tamam: ${onayliToplam} onaylı kayıt okundu${hatalar.some(h => h.startsWith('VERİTABANI YAZIM HATASI:')) ? ', bazı kayıtlar kaydedilemedi' : ' ve kaydedildi'}${toplam > onayliToplam ? ` (toplam ${toplam} satır, yalnız Onaylandı alındı)` : ''}${turOzeti}${hatalar.length ? ' — Uyarı: ' + hatalar.join(' | ') : ''}.`)
      }
      await veriYukle(yil, ay)
    } catch (err) {
      setMesaj('Sorgu hatasi: ' + (err.message || 'bilinmeyen hata'))
    } finally {
      setSorguluyor(false)
    }
  }

  const kararDegistir = async (clientId, tur) => {
    const donem = `${String(ay).padStart(2, '0')}/${yil}-${String(ay).padStart(2, '0')}/${yil}`
    const mevcut = kararMap.get(`${clientId}|${tur}`)
    const sira = ['review', 'required', 'not-required']
    const yeni = sira[(sira.indexOf(mevcut) + 1) % sira.length]
    setKararlar(prev => {
      const diger = prev.filter(k => !(String(k.client_id) === String(clientId) && k.tur === tur))
      return [...diger, { client_id: clientId, tur, donem, karar: yeni }]
    })
    const ok = await beyannameKararKaydet(clientId, tur, donem, yeni)
    if (!ok) setMesaj('Karar kaydedilemedi (baglanti hatasi)')
  }

  // Matrisi sifirla: secili yil+ayin tum isaretlemelerini (kullanici kararlari
  // + GİB onayli kayitlarindan gelen "Gönderildi" hucreleri) siler
  const matrisiSifirla = async () => {
    if (sifirlaniyor) return
    const ad = `${AY_ADLARI[+ay - 1]} ${yil}`
    if (!window.confirm(`${ad} dönemi matrisi sıfırlanacak: tüm işaretlemeler ve GİB'den okunan onaylı kayıtlar silinecek. Emin misiniz?`)) return
    setSifirlaniyor(true)
    const [kararSonuc, kayitSonuc] = await Promise.all([
      beyannameKararlariSifirla(+yil, +ay),
      beyannameKayitlariSifirla(+yil, +ay)
    ])
    if (kararSonuc < 0 || kayitSonuc < 0) {
      setMesaj('Sıfırlama başarısız (bağlantı/yetki hatası)')
    } else {
      setKararlar(prev => prev.filter(k => !donemKapsiyor(k.donem, +yil, +ay)))
      setKayitlar([])
      await veriYukle(yil, ay)
      if (!kararSonuc && !kayitSonuc) setMesaj(`${ad} döneminde silinecek işaretleme veya kayıt yok.`)
      else setMesaj(`${ad} dönemi sıfırlandı — ${kayitSonuc} GİB kaydı, ${kararSonuc} işaretleme kaldırıldı.`)
    }
    setSifirlaniyor(false)
  }

  const ozetOnayli = kayitlar.length

  // ============ Aylık Beyan Takip'e Aktar ============
  // Matriste YESIL "Gönderildi" gorunen (eslesen musteri + tur) kayitlari
  // Aylık Beyan Takip'te "Onaylandı" isaretler. Hücre anahtari Aylık Takip
  // generateMonthlyBeyanlar formatidir: <yil>_<belongMonth0>_<tur>.
  const [aktariyor, setAktariyor] = useState(false)

  // GİB turu + dönem metni -> takip hücre anahtarlari. Dönem metni
  // okunabiliyorsa GERÇEK dönem kullanilir (geç yüklemeler dogru hücreye
  // düser); okunmuyorsa sayfada seçili dönem.
  const aktarimHucreleri = (tur, donem) => {
    const t = String(tur || '').toLocaleLowerCase('tr')
    const ciftler = String(donem || '').match(/(\d{1,2})[/.](\d{4})/g) || []
    const cift = ciftler.map(s => {
      const m = s.match(/(\d{1,2})[/.](\d{4})/)
      return { ay: +m[1], yil: +m[2] }
    })
    const minY = cift.length ? Math.min(...cift.map(c => c.yil)) : +yil
    const minM = cift.length ? Math.min(...cift.map(c => c.ay)) : +ay
    const maxM = cift.length ? Math.max(...cift.map(c => c.ay)) : +ay
    const tekAy = cift.length > 0 && minM === maxM && cift.every(c => c.yil === minY)
    const hucreler = []
    if (/kdv\s*1/.test(t)) {
      hucreler.push(`${tekAy ? minY : +yil}_${(tekAy ? minM : +ay) - 1}_kdv`)
    } else if (/kdv\s*2/.test(t)) {
      hucreler.push(`${tekAy ? minY : +yil}_${(tekAy ? minM : +ay) - 1}_kdv2`)
    } else if (/muhtasar|muhsgk/.test(t)) {
      if (tekAy) hucreler.push(`${minY}_${minM - 1}_muhtasar`)
      // 3 aylik (dönem araligi): çeyrek başlangici (0-taban) = minM-1
      else hucreler.push(`${minY}_${minM - 1}_muhtasar_3aylik`)
    } else if (/ge[çc]ici/.test(t)) {
      // Geçici vergi çeyreklidir: minM'i çeyrek başina cek (0-taban)
      const qStart0 = Math.floor((minM - 1) / 3) * 3
      hucreler.push(`${minY}_${qStart0}_gecici_vergi`)
    } else if (/kurumlar/.test(t)) {
      hucreler.push(`${minY}_0_kurumlar_vergi`)
    } else if (/gelir/.test(t)) {
      hucreler.push(`${minY}_0_gelir_vergi`)
    } else if (/po[şs]et/.test(t)) {
      hucreler.push(`${tekAy ? minY : +yil}_${(tekAy ? minM : +ay) - 1}_poset`)
    }
    // damga vb. aylık takip karşılığı olmayan türler: bos
    return hucreler
  }

  const ayligaAktar = async () => {
    if (aktariyor || yukleniyor) return
    setAktariyor(true)
    setMesaj('')
    try {
      const hedefler = new Map() // client_id -> Set(hucre anahtarlari)
      for (const k of kayitlar) {
        const cid = eslesenClient.get(k)
        if (!cid) continue
        const keys = aktarimHucreleri(k.tur, k.donem)
        if (!keys.length) continue
        if (!hedefler.has(cid)) hedefler.set(cid, new Set())
        keys.forEach(x => hedefler.get(cid).add(x))
      }
      if (!hedefler.size) {
        setMesaj('Aktarılacak eşleşen kayıt yok — önce GİB\'den sorgulayın (mükellef eşleşmeyen kayıtlar aktarılmaz).')
        return
      }
      // Yalnız asagi durumdan yukari: yapildi/onaylandi/tahakkuk_gonderildi
      // korunur (Aylık Takip otomatik senkronuyla ayni kural).
      const korunanlar = ['yapildi', 'onaylandi', 'tahakkuk_gonderildi']
      let hucreSayi = 0, musteriSayi = 0
      for (const [cid, keys] of hedefler) {
        const { data: row, error: okumaHatasi } = await supabase
          .from('clients').select('beyan_durumlari').eq('id', cid).maybeSingle()
        if (okumaHatasi) throw okumaHatasi
        const map = { ...(row?.beyan_durumlari || {}) }
        let degisti = false
        for (const key of keys) {
          if (korunanlar.includes(map[key])) continue
          map[key] = 'onaylandi'
          degisti = true
          hucreSayi++
        }
        if (degisti) {
          const { error } = await supabase.from('clients').update({ beyan_durumlari: map }).eq('id', cid)
          if (error) throw error
          musteriSayi++
        }
      }
      setMesaj(`Aktarım tamam: ${musteriSayi} müşteriye ait ${hucreSayi} beyanname Aylık Beyan Takip'te "Onaylandı" işaretlendi.`)
    } catch (err) {
      setMesaj('Aktarım hatası: ' + (err.message || 'bilinmeyen hata'))
    } finally {
      setAktariyor(false)
    }
  }


  return (
    <div className="p-4 md:p-8 max-w-[1230px] mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-yellow-500/15 rounded-xl border border-yellow-500/30">
          <ClipboardCheck className="w-6 h-6 text-yellow-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Beyanname Kontrol Listesi</h1>
          <p className="text-sm text-gray-400">GİB&apos;ten onaylı beyannameleri sorgulayın; müşteri × beyanname türü matrisinde takip edin</p>
        </div>
      </div>

      {/* Sorgu paneli */}
      <div className="bg-blue-950/30 rounded-2xl border border-blue-800/30 mb-6">
        <div className="px-6 py-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-56">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-yellow-400" /> GİB&apos;ten Onaylı Beyanname Sorgula
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Mali müşavir Dijital VD kullanıcı kodu/parolası girilir; seçilen dönemi takip eden ayda yüklenmiş ONAYLI beyannameler tüm temsil edilen mükellefler için tek sorguda okunur (yükleme tarihi bugüne kadar; vergilendirme dönemi filtrelenmez).
            </p>
          </div>
          <select value={yil} onChange={e => setYil(e.target.value)} aria-label="Yıl" className="bg-blue-900/60 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-xs font-medium">
            {Array.from({ length: 7 }, (_, i) => new Date().getFullYear() + 1 - i).map(y => <option key={y} value={y}>Yıl: {y}</option>)}
          </select>
          <select value={ay} onChange={e => setAy(e.target.value)} aria-label="Ay" className="bg-blue-900/60 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-xs font-medium">
            {AY_ADLARI.map((ad, i) => <option key={ad} value={i + 1}>Ay: {ad}</option>)}
          </select>
        </div>
        <div className="px-6 pb-4 flex flex-wrap items-center gap-3">
          <span className={`text-xs px-3 py-2 rounded-lg border ${
            dvsKullanici
              ? 'bg-green-500/10 border-green-500/30 text-green-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}>
            {dvsKullanici
              ? `Admin VD hesabı: ${dvsKullanici} (Ayarlar > GİB Bağlantı Merkezi'nden alınır)`
              : 'VD bilgisi kayıtlı değil — Ayarlar > GİB Bağlantı Merkezi\'nden kaydedin'}
          </span>
          <button
            onClick={handleSorgula}
            disabled={!dvsKullanici || !dvsParola || sorguluyor}
            className="px-4 py-2.5 rounded-xl bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-yellow-500/30"
          >
            {sorguluyor ? 'Sorgulanıyor...' : "GİB'den Sorgula"}
          </button>
          {sorguluyor && (
            <button
              onClick={handleDurdur}
              title="Devam eden ve sırada bekleyen tüm yardımcı işlerini durdurur"
              className="px-4 py-2.5 rounded-xl bg-red-500/20 border border-red-500/50 text-red-300 text-sm font-medium hover:bg-red-500/30 animate-pulse"
            >
              Tümünü Durdur
            </button>
          )}
          <button
            onClick={ayligaAktar}
            disabled={aktariyor || sorguluyor || yukleniyor || !kayitlar.length}
            title="Yeşil Gönderildi hücrelerindeki beyannameleri Aylık Beyan Takip'te Onaylandı işaretler"
            className="px-4 py-2.5 rounded-xl bg-green-500/15 border border-green-500/40 text-green-400 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-green-500/25"
          >
            {aktariyor ? 'Aktarılıyor...' : 'Aylık Beyan Takip\'e Aktar'}
          </button>
          <button
            onClick={matrisiSifirla}
            disabled={sifirlaniyor || sorguluyor}
            title="Seçili yıl/aydaki tüm işaretlemeleri ve GİB'den okunan onaylı kayıtları kaldırır"
            className="px-4 py-2.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-400 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-500/25"
          >
            {sifirlaniyor ? 'Sıfırlanıyor...' : 'Matrisi Sıfırla'}
          </button>
        </div>
        {mesaj && (
          <div className="mx-6 mb-4 px-4 py-3 bg-blue-900/60 border border-blue-700/50 rounded-xl text-sm text-gray-300 flex items-start justify-between gap-3">
            <span>{mesaj}</span>
            {!sorguluyor && (
              <button onClick={() => setMesaj('')} title="Mesajı temizle"><X className="w-4 h-4 text-gray-500 hover:text-gray-300" /></button>
            )}
          </div>
        )}
      </div>

      {/* Kontrol matrisi */}
      <div className="bg-blue-950/30 rounded-2xl border border-blue-800/30">
        <div className="px-6 py-4 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-white flex-1">
            Kontrol Matrisi — {AY_ADLARI[+ay - 1]} {yil}
            <span className="ml-2 text-xs text-gray-400 font-normal">
              {ozetOnayli} onaylı kayıt · {filtreliMusteriler.length}/{musteriler.length} müşteri
              {eslesmeyenler.length > 0 && (
                <span className="block text-xs text-amber-400 mt-1" title={eslesmeyenler.slice(0, 10).map(k => {
                  const aday = adayBul(k)
                  return `${k.vkn} ${k.unvan || ''} (${k.tur})${aday ? ` → benzer müşteri: ${aday.name} [${(aday._kimlikler || []).join('/')}]` : ' → MUBiS\u0027te benzer isimli müşteri yok'}`
                }).join('\n')}>
                  Dikkat: {eslesmeyenler.length} kayıt müşteri eşleşmedi — üzerine gelin liste görürsünüz (VKN farkı ya da MUBiS'te kayıtlı olmayan mükellef)
                </span>
              )}
            </span>
          </h2>
          <select
            value={turSecim}
            onChange={e => setTurSecim(e.target.value)}
            aria-label="Beyanname türü"
            className="bg-blue-900/60 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-xs font-medium"
            title="Matriste görünecek beyanname türünü seçin"
          >
            {TUR_GRUPLARI.map(g => <option key={g.id} value={g.id}>Tür: {g.ad}</option>)}
          </select>
          <input
            value={arama}
            onChange={e => setArama(e.target.value)}
            placeholder="Ara: unvan / VKN"
            className="bg-blue-900/60 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-xs w-56"
          />
        </div>
        {yukleniyor ? (
          <div className="px-6 pb-6 text-sm text-gray-400">Yükleniyor...</div>
        ) : okumaHatasi ? (
          <div className="px-6 pb-6 text-sm text-red-400">
            Veritabanı okuma hatası: {okumaHatasi} — kayıtlar gösterilemedi.
          </div>
        ) : !turler.length ? (
          <div className="px-6 pb-6 text-sm text-gray-400">
            Bu dönemde kayıt yok. Yukarıdan &quot;GİB&apos;den Sorgula&quot; ile onaylı beyannameleri sorgulayın — onaylı kayıt gelince hücreler yeşil &quot;Gönderildi&quot; olur.
          </div>
        ) : !gosterilenTurler.length ? (
          <div className="px-6 pb-6 text-sm text-gray-400">
            Seçilen tür için bu dönemde kayıt/karar yok — tür seçimini değiştirin.
          </div>
        ) : (
          <div className="overflow-x-auto pb-4 px-6">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-gray-400 text-xs border-b border-blue-800/50">
                  <th className="py-2 pr-4 font-medium">Müşteri</th>
                  {gosterilenTurler.map(t => <th key={t} className="py-2 px-2 font-medium text-center whitespace-nowrap">{t}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtreliMusteriler.map(c => (
                  <tr key={c.id} className="border-b border-blue-400/60">
                    <td className="py-2 pr-4 text-white whitespace-nowrap">
                      <span title={c.name || c.shortName || ''}>
                        {(c.name || c.shortName || `Müşteri #${c.id}`).slice(0, 20)}
                      </span>
                      <span className="block text-xs text-gray-500">{c._kimlik || 'VKN/TCKN yok'}</span>
                    </td>
                    {gosterilenTurler.map(t => {
                      const n = kayitGrup.get(`${c.id}|${t}`) || 0
                      const karar = kararMap.get(`${c.id}|${t}`)
                      if (n > 0) {
                        return (
                          <td key={t} className="py-2 px-2 text-center">
                            <span
                              className="inline-block px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400"
                              title={`${n} onaylı kayıt (GİB)`}
                            >
                              Gönderildi{n > 1 ? ` (${n})` : ''}
                            </span>
                          </td>
                        )
                      }
                      return (
                        <td key={t} className="py-2 px-2 text-center">
                          <button
                            onClick={() => kararDegistir(c.id, t)}
                            disabled={!c._kimlik && !c.id}
                            title="Tıklayınca durum değişir: Kontrol edilecek → Verilecek → Bu dönem gerekmiyor"
                            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                              karar === 'required'
                                ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40'
                                : karar === 'not-required'
                                  ? 'bg-gray-500/20 text-gray-400 border-gray-500/40'
                                  : 'bg-blue-900/60 text-gray-400 border-blue-700/50 hover:border-yellow-500/40'
                            }`}
                          >
                            {KARAR_ETIKET[karar || 'review']}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {!filtreliMusteriler.length && (
                  <tr><td colSpan={turler.length + 1} className="py-4 text-center text-gray-500 text-xs">Aramayla eşleşen müşteri yok.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
