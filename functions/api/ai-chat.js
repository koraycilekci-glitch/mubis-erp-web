// MUBIS Yapay Zeka Asistani - sohbet ucu (Cloudflare Pages Function)
// POST /api/ai-chat
// OPENAI_API_KEY tanimliysa OpenAI uzerinden, degilse yerel bilgi tabanindan cevap uretir.
// (Vercel surumu api/ai-chat.js dosyasinda duruyor; bu kopya Cloudflare Pages icindir.)

import {
  GV_DILIMLERI, GV_UCRET_DILIMLERI, KV_ORANLARI, ASGARI_UCRET, SGK,
  DAMGA_VERGISI_ORANLARI, KIDEM_TAVANI, GMS_ISTISNA, DAK_ISTISNA,
  KIRA_ARTIS_ORANLARI, getKiraArtisOraniDetay, getGunlukPekSinirlari
} from '../../src/data/defaults.js'

const SYSTEM_PROMPT = `Sen MUBIS ERP'nin yapay zeka asistanisin. Turkiye'deki vergi, SGK, muhasebe,
e-belge (e-fatura, e-arsiv, e-irsaliye, e-defter), bordro, tesvik, sirket kurulusu, emeklilik,
kira artisi, is hukuku ve mevzuat konularinda deneyimli bir mali musavir gibi cevap verirsin.

Kurallar:
- Turkce cevap ver. Sade, net ve uygulanabilir ol.
- Cevabin konuya gore 3-10 cumle olsun; gerekiyorsa kisa maddeler kullan.
- Rakam verirken hangi yila/aya ait oldugunu belirt ve dayanagini (kanun/madde/teblig) kisaca yaz.
- Hesaplama isteniyorsa adim adim goster ve sonucu net yaz.
- Emin olmadigin bir rakami uydurma; "guncel teblige gore teyit edilmeli" de.
- Kullaniciya ait MUBIS verileri verilmisse (borc, tahakkuk, son odeme tarihleri), kisisel sorulari
  ("KDV odemem ne kadar", "bu ay ne kadar odeyecegim", "borcum var mi", "odemelerimi say")
  DOGRUDAN bu verilerle yanitla. Rakamlari TL olarak ve son odeme tarihiyle birlikte ver.
  Birden fazla kalem varsa madde madde listele ve altina toplami yaz.
  Veride olmayan bir kalemi uydurma; "sistemde bu doneme ait tahakkuk gorunmuyor" de.
- Kisiye ozel veri istenir ama MUBIS verisi verilmemisse, kullanicinin giris yapmasi gerektigini soyle.
- BELGE ISTEKLERI: Kullanici bir belge isterse ve MUBIS verilerinde o belgenin linki varsa,
  cevapta linki AYNEN [Belge Adi](https://...) markdown bicimiyle ver. Birden fazla ilgili belge varsa hepsini listele.
  Verilerde link yoksa link UYDURMA; "bu belge henuz sisteme yuklenmemis" de.
- TARIH / SON GUN sorularinda ASLA tahmin etme. Asagida "BUGUN" ve "BEYAN SON GUNLERI"
  bolumlerindeki dogrulanmis tarihleri kullan. Bugun son gun degilse "bugun son gun" deme;
  "yarina / X tarihine kadar sure var" veya "son gun X" seklinde dogru yaz.
- Markdown baslik kullanma; kalin yazi ve kisa madde isaretleri yeterli.

COK ONEMLI: Asagida "DOGRULANMIS MUBIS BILGILERI" basligi altinda verilen rakam, oran ve tarihler
MUBIS ERP'nin guncel parametre veritabanindan gelir ve dogrudur. Bu bilgilerle celisen kendi
hafizandaki eski degerleri ASLA kullanma. Ilgili bilgi verilmisse aynen o degerleri kullan.
Ozellikle KDV oranlari, gecici vergi son gunleri, asgari ucret ve SGK prime esas kazanc
sinirlari gibi sik degisen degerler icin yukaridaki DOGRULANMIS bilgiyi kullan.`

const AY_ADLARI = ['Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran', 'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik']

function sayiYaz(n) {
  if (n == null) return '-'
  return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function dilimYaz(dilimler = []) {
  return dilimler
    .map(d => `${d.limit === Infinity ? 'ustu' : sayiYaz(d.limit) + ' TL\'ye kadar'} %${Math.round(d.rate * 100)}`)
    .join(', ')
}

// MUBIS parametre veritabanindan uretilen guncel referans metni
function referansUret(bugun = new Date()) {
  const yil = bugun.getFullYear()
  const gvYil = GV_DILIMLERI[yil] ? yil : 2026
  const au = ASGARI_UCRET[gvYil] || ASGARI_UCRET[2026]
  const pek = getGunlukPekSinirlari(gvYil)

  // Son 14 ayin kira artis oranlari
  const kiraSatirlari = Object.entries(KIRA_ARTIS_ORANLARI)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14)
    .map(([k, v]) => {
      const [y, m] = k.split('-')
      return `${AY_ADLARI[Number(m) - 1]} ${y}: %${v}`
    })
    .join(' | ')

  return `Bugunun tarihi: ${bugun.toLocaleDateString('tr-TR')} (${AY_ADLARI[bugun.getMonth()]} ${yil})

KDV oranlari (Temmuz 2023'ten beri gecerli, ${yil} yilinda da ayni):
- Genel oran: %20 | Indirimli: %10 | Cok indirimli: %1
(Eski %18 ve %8 oranlari YURURLUKTE DEGILDIR.)

Kurumlar vergisi orani: %${Math.round((KV_ORANLARI[gvYil] || 0.25) * 100)} (banka ve finans kuruluslarinda %30).
Gecici vergi: gelir vergisi mukellefinde %15, kurumlar vergisi mukellefinde %25. 3 donem uygulanir (4. donem kaldirildi).
Damga vergisi orani (${gvYil}): %${((DAMGA_VERGISI_ORANLARI[gvYil] || 0.00759) * 100).toFixed(3)} (binde 7,59).

${gvYil} gelir vergisi tarifesi (ucret disi): ${dilimYaz(GV_DILIMLERI[gvYil])}
${gvYil} ucret geliri tarifesi: ${dilimYaz(GV_UCRET_DILIMLERI[gvYil])}

${gvYil} asgari ucret: brut ${sayiYaz(au.brut)} TL, net ${sayiYaz(au.net)} TL.
SGK prime esas kazanc tavani (aylik): ${sayiYaz(SGK.tavan[gvYil] || SGK.tavan[2026])} TL.
Gunluk prime esas kazanc: asgari ${sayiYaz(pek.asgari)} TL, tavan ${sayiYaz(pek.tavan)} TL.
SGK isveren hissesi: %21,75 (2026). Sigortali kesintisi: %15 (%14 SGK + %1 issizlik). Bag-Kur (4/b): %34,75.
Kidem tazminati tavani: ${sayiYaz(KIDEM_TAVANI['2026-1'])} TL (2026/1. donem).

GMSI konut kira istisnasi: ${sayiYaz(GMS_ISTISNA[gvYil])} TL (${gvYil}).
Deger artis kazanci istisnasi: ${sayiYaz(DAK_ISTISNA[gvYil])} TL (${gvYil}).

KIRA ARTIS ORANI (COK ONEMLI):
Turk Borclar Kanunu md.344 geregi kira artisi, sozlesme yenileme ayindaki
12 AYLIK TUFE ORTALAMASINI gecemez. Yi-UFE veya yillik TUFE DEGILDIR.
MUBIS'te kayitli 12 aylik TUFE ortalamalari (kira artis tavani):
${kiraSatirlari}

Beyan son gunleri: KDV ayin 28'i, Muhtasar ve Prim Hizmet Beyannamesi ayin 26'si,
SGK prim odemesi takip eden ayin son gunu, damga vergisi ayin 26'si.
Gecici vergi beyan son gunleri: 17 Mayis, 17 Agustos, 17 Kasim.

e-Defter berat yukleme (3 aylik tercih):
- Ocak-Mart: gelir vergisi mukellefi 10 Haziran, kurumlar vergisi mukellefi 14 Haziran
- Nisan-Haziran: 10 / 14 Eylul
- Temmuz-Eylul: 10 / 14 Aralik
- Ekim-Aralik: 10 Nisan / 14 Mayis (yillik beyannameyi takip eden ay)
Aylik tercihte: ilgili ayi takip eden 3. ayin son gunu.

Limited sirket asgari sermayesi 50.000 TL, anonim sirket 250.000 TL.`
}

// Bugun ve yakin donemde sonu gelen/yaklasan islemleri hesaplar
function bugunBilgisiUret(bugun = new Date()) {
  const yil = bugun.getFullYear()
  const ay = bugun.getMonth()
  const gun = bugun.getDate()
  const ayAdi = AY_ADLARI[ay]
  const ayinSonGunu = new Date(yil, ay + 1, 0).getDate()

  // Aylik beyan/odeme son gunleri (genel takvim)
  const aylikKalemler = [
    { ad: 'KDV (bir onceki ay)', sonGun: 28 },
    { ad: 'Muhtasar ve Prim Hizmet Beyannamesi (bir onceki ay)', sonGun: 26 },
    { ad: 'SGK prim odemesi (icinde bulunulan ay)', sonGun: ayinSonGunu },
    { ad: 'Damga vergisi (bir onceki ay)', sonGun: 26 }
  ]

  // Gecici vergi son gunleri
  const geciciDonemler = [
    { donem: '1. donem (Ocak-Mart)', sonGunStr: '17 Mayis', ay: 4, gun: 17 },
    { donem: '2. donem (Nisan-Haziran)', sonGunStr: '17 Agustos', ay: 7, gun: 17 },
    { donem: '3. donem (Temmuz-Eylul)', sonGunStr: '17 Kasim', ay: 10, gun: 17 }
  ]

  let satirlar = [`Bugun: ${gun} ${ayAdi} ${yil}`]

  // Yakin gecici vergi son gunu
  const yaklasanGecici = geciciDonemler
    .map(g => {
      const tarih = new Date(yil, g.ay, g.gun)
      const fark = Math.ceil((tarih - bugun) / (1000 * 60 * 60 * 24))
      return { ...g, fark, tarih }
    })
    .filter(g => g.fark >= -5 && g.fark <= 30)
    .sort((a, b) => a.fark - b.fark)[0]

  if (yaklasanGecici) {
    const ek = yaklasanGecici.fark === 0
      ? 'BUGUN son gun.'
      : yaklasanGecici.fark > 0
        ? `${yaklasanGecici.fark} gun sonra (${yaklasanGecici.sonGunStr}) sona eriyor.`
        : `${Math.abs(yaklasanGecici.fark)} gun once sona erdi.`
    satirlar.push(`- Gecici vergi ${yaklasanGecici.donem}: ${ek}`)
  }

  // Aylik kalemlerden bu ay icinde yaklasanlar
  aylikKalemler.forEach(k => {
    const tarih = new Date(yil, ay, k.sonGun)
    const fark = Math.ceil((tarih - bugun) / (1000 * 60 * 60 * 24))
    if (fark >= -2 && fark <= 15) {
      const ek = fark === 0 ? 'BUGUN son gun.' : fark > 0 ? `${fark} gun sonra sona eriyor.` : `${Math.abs(fark)} gun once sona erdi.`
      satirlar.push(`- ${k.ad}: ${k.sonGun} ${ayAdi} ${yil}, ${ek}`)
    }
  })

  return satirlar.join('\n')
}

// Soruda ay/yil geciyorsa kira artis oranini dogrudan hesapla
function kiraArtisEkBilgi(soru, bugun = new Date()) {
  const q = String(soru || '').toLowerCase()
  if (!q.includes('kira')) return ''

  let yil = bugun.getFullYear()
  let ay = bugun.getMonth() + 1

  const yilEsl = q.match(/20\d{2}/)
  if (yilEsl) yil = Number(yilEsl[0])

  const aylar = ['ocak', 'şubat|subat', 'mart', 'nisan', 'mayıs|mayis', 'haziran',
    'temmuz', 'ağustos|agustos', 'eylül|eylul', 'ekim', 'kasım|kasim', 'aralık|aralik']
  for (let i = 0; i < aylar.length; i++) {
    if (new RegExp(aylar[i]).test(q)) { ay = i + 1; break }
  }

  const detay = getKiraArtisOraniDetay(yil, ay)
  if (!detay) return ''
  const tam = detay.yil === yil && detay.ay === ay
  return `\n\nSORULAN DONEM ICIN MUBIS VERISI:
${AY_ADLARI[ay - 1]} ${yil} donemi kira yenilemesinde uygulanabilecek azami artis orani: %${detay.oran}
(12 aylik TUFE ortalamasi${tam ? '' : `, en yakin veri: ${AY_ADLARI[detay.ay - 1]} ${detay.yil}`}).
Bu oran hem konut hem is yeri kiralarinda ust sinirdir; taraflar daha dusuk oranda anlasabilir.`
}


const BILGI_TABANI = [
  {
    anahtar: ['kira artis', 'kira artış', 'kira zam', 'kira orani', 'kira oranı', 'kira yenileme'],
    cevap: `Kira artis orani, Turk Borclar Kanunu md.344 geregi sozlesmenin yenilendigi aydaki
12 AYLIK TUFE ORTALAMASINI gecemez. (Yillik TUFE veya Yi-UFE degil, 12 aylik ortalama esas alinir.)
- Bu sinir hem konut hem is yeri kiralarinda gecerlidir.
- Taraflar daha dusuk bir oranda anlasabilir; daha yuksek oran gecersizdir.
- MUBIS > Hesaplamalar > Kira Artisi ekraninda yenileme ayini secince oran otomatik gelir.`
  },
  {
    anahtar: ['kdv oran', 'kdv orani', 'katma deger vergisi oran'],
    cevap: `2026 yilinda uygulanan KDV oranlari:
- Genel oran: %20
- Indirimli oran: %10 (gida, ilac, konaklama vb.)
- Cok indirimli oran: %1 (temel gida urunleri, gazete, kitap vb.)
Oranlar Cumhurbaskani karari ile degisebilir; guncel teblige gore kontrol edin.`
  },
  {
    anahtar: ['kdv beyan', 'kdv ne zaman', 'kdv son gun'],
    cevap: `KDV beyannamesi, ait oldugu ayi takip eden ayin 28'ine kadar verilir ve ayni gun odenir.
Ornek: Temmuz 2026 KDV beyannamesi 28 Agustos 2026 aksamina kadar verilir.
Resmi tatil gunlerine denk gelirse sure takip eden ilk is gunune uzar.`
  },
  {
    anahtar: ['muhtasar', 'stopaj beyan'],
    cevap: `Muhtasar ve Prim Hizmet Beyannamesi, ait oldugu ayi takip eden ayin 26'sina kadar verilir,
odemesi de ayni gun yapilir. Uc aylik beyan hakki olan mukellefler icin donem sonunu takip eden
ayin 26'si son gundur.`
  },
  {
    anahtar: ['sgk bildirge', 'aylik prim', 'apphb', 'sgk son gun'],
    cevap: `Aylik Prim ve Hizmet Belgesi muhtasar ile birlestirilmis olup ayin 26'sina kadar verilir.
SGK primlerinin odemesi ise takip eden ayin sonuna kadar yapilir.
Ornek: Temmuz 2026 primleri 31 Agustos 2026'ya kadar odenir.`
  },
  {
    anahtar: ['ise giris', 'ise giris bildirge'],
    cevap: `Sigortali Ise Giris Bildirgesi, calisma baslamadan EN GEC bir gun once SGK'ya
e-Bildirge uzerinden verilmelidir. Insaat, balikcilik ve tarim islerinde ise baslatildigi gun
verilmesi mumkundur. Sureyi gecirmek idari para cezasi dogurur.`
  },
  {
    anahtar: ['isten cikis'],
    cevap: `Sigortali Isten Ayrilis Bildirgesi, is sozlesmesinin sona erdigi tarihten itibaren
10 GUN icinde SGK'ya verilir. Ayrica ayni surede iskur'a isten ayrilma bildirimi yapilir.`
  },
  {
    anahtar: ['bag-kur', 'bagkur', 'bag kur prim'],
    cevap: `Bag-Kur (4/b) primi, prime esas kazancin %34,75'i oranindadir
(%20 malulluk-yaslilik-olum, %12,5 genel saglik sigortasi, %2,25 kisa vadeli).
Prime esas kazanc alt siniri asgari ucret brutudur. 2026 icin asgari ucret brutu 33.030 TL'dir,
buna gore aylik asgari Bag-Kur primi yaklasik 11.478 TL'dir. Guncel teblige gore degisebilir.`
  },
  {
    anahtar: ['gecici vergi', 'gecici vergi donem'],
    cevap: `Gecici vergi beyannamesi 3 aylik donemler halinde verilir:
- 1. donem (Ocak-Mart): 17 Mayis
- 2. donem (Nisan-Haziran): 17 Agustos
- 3. donem (Temmuz-Eylul): 17 Kasim
4. donem 2022'den itibaren kaldirilmistir. Oran: gelir vergisi mukelleflerinde %15,
kurumlar vergisi mukelleflerinde %25'tir.`
  },
  {
    anahtar: ['e-fatura basvuru', 'e fatura nasil', 'e-fatura gecis'],
    cevap: `e-Fatura basvurusu GIB e-Belge portali (ebelge.gib.gov.tr) uzerinden yapilir.
Adimlar: 1) Mali muhur veya e-imza temin edin. 2) Portalda basvuru formunu doldurun.
3) Yontem secin (GIB portali, entegrasyon veya ozel entegrator).
4) Basvuru onaylandiktan sonra sistem kullanima acilir.
Ciro haddini asan mukellefler icin gecis zorunludur.`
  },
  {
    anahtar: ['e-defter', 'edefter', 'berat'],
    cevap: `e-Defter beratlari aylik veya 3 aylik olarak yuklenebilir.
3 aylik tercih edildiginde son gunler:
- Ocak-Mart: gelir vergisi mukellefi 10 Haziran, kurumlar vergisi mukellefi 14 Haziran
- Nisan-Haziran: 10 / 14 Eylul
- Temmuz-Eylul: 10 / 14 Aralik
- Ekim-Aralik: beyannamenin verilecegi ayi takip eden ayin 10'u / 14'u`
  },
  {
    anahtar: ['kurumlar vergisi oran'],
    cevap: `Kurumlar vergisi genel orani %25'tir. Bankalar ve finans kuruluslarinda %30 uygulanir.
Ihracat kazanclarinda 5 puan, uretim faaliyetlerinde 1 puan indirim uygulanabilir.`
  },
  {
    anahtar: ['damga vergisi'],
    cevap: `Damga vergisi, kagit ve elektronik belgelerin turune gore nispi (binde) veya maktu olarak alinir.
Ornegin sozlesmelerde binde 9,48 oranindadir. Ucret odemelerinde binde 7,59 uygulanir.
Guncel oranlar her yil yeniden degerleme ile guncellenir.`
  },
  {
    anahtar: ['emekli', 'emeklilik'],
    cevap: `Emeklilik icin sigortalilik baslangic tarihi, prim gun sayisi ve yas sarti birlikte degerlendirilir.
1999 oncesi, 1999-2008 arasi ve 2008 sonrasi girisler icin sartlar farklidir.
Kesin hesap icin SGK hizmet dokumunuz gerekir. MUBIS'e giris yaparsaniz kendi hizmet dokumunuz
uzerinden hesaplama yapabilirsiniz.`
  },
  {
    anahtar: ['asgari ucret'],
    cevap: `2026 asgari ucret: brut 33.030 TL, net 28.075,50 TL.
SGK primine esas kazanc tavani asgari ucretin 9 kati olan 297.270 TL'dir.
Isveren maliyeti, tesvik durumuna gore degisir.`
  },
  {
    anahtar: ['sirket kurulus', 'sirket nasil kurulur', 'limited sirket kur'],
    cevap: `Limited sirket kurulusu adimlari:
1) MERSIS uzerinden basvuru ve sirket sozlesmesinin hazirlanmasi
2) Ticaret Sicil Mudurlugu'nde imza ve tescil
3) Vergi dairesi acilis islemleri (yoklama)
4) Defter tasdikleri ve e-belge basvurulari
5) SGK isyeri tescili (personel calistirilacaksa)
Asgari sermaye 50.000 TL'dir.`
  },
  {
    anahtar: ['tesvik', '5510', '6111'],
    cevap: `Yaygin SGK tesvikleri:
- 5510 sayili Kanun 81/i: 5 puanlik prim indirimi
- 6111: ilave istihdam tesviki
- 7103: imalat ve bilisimde ilave istihdam
- 17103/27103: genc, kadin ve mesleki belge sahibi istihdami
Tesvikten yararlanmak icin borcu yoksunluk ve bildirim surelerine uyum sarttir.`
  }
]

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ş/g, 's').replace(/ı/g, 'i').replace(/İ/g, 'i').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
}

function ilgiliKayit(soru) {
  const q = normalize(soru)
  let enIyi = null
  let enIyiSkor = 0
  for (const kayit of BILGI_TABANI) {
    for (const a of kayit.anahtar) {
      if (q.includes(normalize(a)) && a.length > enIyiSkor) {
        enIyiSkor = a.length
        enIyi = kayit
      }
    }
  }
  return enIyi
}

function yerelCevap(soru, contextVarMi = false) {
  const enIyi = ilgiliKayit(soru)
  if (enIyi) return enIyi.cevap

  if (contextVarMi) {
    return `Bu konuda size yardimci olabilmem icin biraz daha detay verir misiniz?

Su konularda hemen cevap verebilirim: KDV, gelir ve kurumlar vergisi, gecici vergi, damga vergisi,
SGK ise giris/cikis, prim ve tesvikler, e-fatura ve e-defter islemleri, bordro, sirket kurulusu ve emeklilik.

Kisisel borc/beyanname bilgilerinize erisimim su an yapilandirilmamis; lutfen teknik destekle iletisime gecin.`
  }

  return `Bu konuda size yardimci olabilmem icin biraz daha detay verir misiniz?

Su konularda hemen cevap verebilirim: KDV, gelir ve kurumlar vergisi, gecici vergi, damga vergisi,
SGK ise giris/cikis, prim ve tesvikler, e-fatura ve e-defter islemleri, bordro, sirket kurulusu ve emeklilik.

Musteriye ozel bilgiler (borc durumu, beyanname gecmisi) icin MUBIS hesabinizla giris yapmaniz gerekir.`
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  })
}

// Cloudflare Pages Function: POST /api/ai-chat
export async function onRequestPost({ request, env }) {
  let body = {}
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Gecersiz JSON govdesi' }, 400)
  }

  try {
    const messages = Array.isArray(body.messages) ? body.messages : []
    const sonSoru = [...messages].reverse().find(m => m.role === 'user')?.content || ''

    if (!String(sonSoru).trim()) {
      return json({ error: 'Soru bos olamaz' }, 400)
    }

    const contextVarMi = Boolean(body.context && String(body.context).trim())
    const apiKey = env?.OPENAI_API_KEY
    if (!apiKey) {
      return json({ reply: yerelCevap(sonSoru, contextVarMi), source: 'local' })
    }

    const kisiselBilgi = body.context ? `\n\nKullanicinin MUBIS verileri:\n${body.context}` : ''

    // Guncel referans + soruyla eslesen bilgi tabani kaydi (RAG)
    const simdi = new Date()
    const referans = referansUret(simdi)
    const eslesen = ilgiliKayit(sonSoru)
    const ekBilgi = eslesen ? `\n\nSoruyla dogrudan ilgili dogrulanmis cevap:\n${eslesen.cevap}` : ''
    const kiraBilgi = kiraArtisEkBilgi(sonSoru, simdi)
    const bugunBilgi = bugunBilgisiUret(simdi)
    const dogrulanmis = `\n\nDOGRULANMIS MUBIS BILGILERI\n${referans}\n\nBUGUN / YAKIN DONEM ISLEMLERI\n${bugunBilgi}${kiraBilgi}${ekBilgi}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 40000)

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: env?.OPENAI_MODEL || 'gpt-4o',
        temperature: 0.2,
        max_tokens: 1200,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT + dogrulanmis + kisiselBilgi },
          ...messages.slice(-10).map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: String(m.content || '').slice(0, 4000)
          }))
        ]
      })
    })
    clearTimeout(timeout)

    if (!resp.ok) {
      const detay = await resp.text()
      console.error('OpenAI hatasi:', resp.status, detay.slice(0, 300))
      return json({ reply: yerelCevap(sonSoru), source: 'local-fallback' })
    }

    const data = await resp.json()
    const reply = data?.choices?.[0]?.message?.content?.trim()
    if (!reply) {
      return json({ reply: yerelCevap(sonSoru), source: 'local-fallback' })
    }

    return json({ reply, source: 'openai' })
  } catch (err) {
    console.error('ai-chat hatasi:', err)
    try {
      const sonSoru = [...(body.messages || [])].reverse().find(m => m.role === 'user')?.content || ''
      return json({ reply: yerelCevap(sonSoru), source: 'local-error' })
    } catch {
      return json({ error: 'Asistan su anda cevap veremiyor' }, 500)
    }
  }
}
