import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Save, Send, FileText, RefreshCw, ChevronDown, ChevronRight, Eraser, Loader2, Users, Smartphone, Apple, PlayCircle } from 'lucide-react'
import { getClients } from '../services/clientService'
import { pdfMetinOku } from '../services/efaturaService'
import { getAppSetting, setAppSetting, listAppSettings, deleteAppSetting } from '../services/settingsService'
import { gibYardimciIs, musteriGirisBilgileriGetir, gibYardimciDevamEt, gibYardimciIptal, gibYardimciGonderimDurumu } from '../utils/gibOdemeHelper'
import { supabase } from '../lib/supabase'
import { IL_LISTESI, ilIlceleri } from '../data/ilIlce'

// E-Fatura / E-Arşiv / E-SMM fatura kesim formu.
// Admin modunda (clientId verilmezse) musteri secici gosterilir.
// Taslaklar app_settings'e kaydedilir: efatura_kesim_draft_<clientId>_<ts>

const TUR_ETIKET = { earsiv: 'e-Arşiv', efatura: 'e-Fatura', esmm: 'e-SMM' }
const EFATURA_MUKELLEF_ENDPOINTLERI = [...new Set([
  'https://mubis-erp-web.pages.dev/api/efatura-mukellef',
  new URL('/api/efatura-mukellef', window.location.origin).href
])]

const PARA_BIRIMLERI = ['TL', 'USD', 'EUR', 'GBP', 'CHF', 'JPY']
// GIB birim listesi
const BIRIMLER = [
  'Gün', 'Ay', 'Yıl', 'Saat', 'Dakika', 'Saniye', 'Adet', 'Paket', 'Kutu',
  'mg', 'g', 'kg', 'lt', 'ton', 'Net Ton', 'Gross ton',
  'mm', 'cm', 'm', 'km', 'ml', 'mm3', 'cm2', 'cm3', 'm2', 'm3',
  'kJ', 'cl', 'KARAT', 'KWH', 'MWH', 'Ton baş.taşıma kap.', 'Brüt kalori',
  '1000 lt', 'Saf alkol lt', 'kg.m2', 'Hücre adet', 'Çift', '1000 m3', 'Set',
  '1000 adet', 'SCM', 'NCM', 'mmBTU', 'CM³', 'Düzine', 'dm2', 'dm', 'ha', 'Metretül (LM)'
]
// GIB KDV orani listesi
const KDV_ORANLARI = [1, 8, 18, 10, 20]

// GIB e-Arsiv fatura tipleri
const FATURA_TIPLERI = [
  'SATIŞ', 'GENEL İADE', 'TEVKİFAT', 'TEVKİFAT İADE', 'İSTİSNA', 'ÖZEL MATRAH',
  'İHRAÇ KAYITLI', 'KONAKLAMA VERGİSİ', 'YATIRIM TEŞVİK SATIŞ', 'YATIRIM TEŞVİK İSTİSNA',
  'YATIRIM TEŞVİK İADE', 'YATIRIM TEŞVİK TEVKİFAT', 'YATIRIM TEŞVİK TEVKİFAT İADE'
]

// GIB "Vergi Ekle" listesi
const VERGI_TURLERI = [
  'BANKA MUAMELELERİ VER.', 'KKDF KESİNTİ',
  'ÖTV 1. LİSTE', 'ÖTV 2. LİSTE', 'ÖTV 3. LİSTE', 'ÖTV 4. LİSTE',
  'ÖTV 3A LİSTE', 'ÖTV 3B LİSTE', 'ÖTV 3C LİSTE',
  'DAMGA V', '5035SKDAMGAV', 'Ö.İLETİŞİM V', '5035ÖZİLETV',
  'KDV TEVKİFAT', '4961BANKASMV', 'BORSA TES.ÜC.', 'ENERJİ FONU',
  'ELK.HAVAGAZ.TÜK.VER.', 'TRT PAYI', 'ELK.TÜK.VER.',
  'TK KULLANIM', 'TK RUHSAT', 'ÇEV. TEM. VER.',
  'GV.STOPAJI', 'KV.STOPAJI', 'MERA FONU',
  'ÖTV 1. LİSTE TEVKİFAT', 'BEL.ÖD.HAL RÜŞUM', 'KONAKLAMA VERGİSİ'
]

// GIB KDV tevkifat kodu listesi (KDVGUT) — 6xx: kismi tevkifat, 8xx: tam tevkifat grubu
const TEVKIFAT_KODLARI = [
  ['601', 'Yapım İşleri ile Bu İşlerle Birlikte İfa Edilen Mühendislik-Mimarlık ve Etüt-Proje Hizmetleri [KDVGUT-(I/C-2.1.3.2.1)]'],
  ['602', 'Etüt, plan-proje, danışmanlık, denetim vb'],
  ['603', 'Makine, Teçhizat, Demirbaş ve Taşıtlara Ait Tadil, Bakım ve Onarım Hizmetleri [KDVGUT-(I/C-2.1.3.2.3)]'],
  ['604', 'Yemek servis hizmeti'],
  ['605', 'Organizasyon hizmeti'],
  ['606', 'İşgücü temin hizmetleri'],
  ['607', 'Özel güvenlik hizmeti'],
  ['608', 'Yapı denetim hizmetleri'],
  ['609', 'Fason Olarak Yaptırılan Tekstil ve Konfeksiyon İşleri, Çanta ve Ayakkabı Dikim İşleri ve Bu İşlere Aracılık Hizmetleri [KDVGUT-(I/C-2.1.3.2.7)]'],
  ['610', 'Turistik mağazalara verilen müşteri bulma/götürme hizmetleri'],
  ['611', 'Spor kulüplerinin yayın, reklam ve isim hakkı gelirlerine konu işlemleri'],
  ['612', 'Temizlik Hizmeti [KDVGUT-(I/C-2.1.3.2.10)]'],
  ['613', 'Çevre, Bahçe ve Bakım Hizmetleri [KDVGUT-(I/C-2.1.3.2.11)]'],
  ['614', 'Servis taşımacılığı'],
  ['615', 'Her Türlü Baskı ve Basım Hizmetleri [KDVGUT-(I/C-2.1.3.2.12)]'],
  ['616', 'Diğer Hizmetler [KDVGUT-(I/C-2.1.3.2.13)]'],
  ['617', 'Hurda metalden elde edilen külçe teslimleri'],
  ['618', 'Hurda Metalden Elde Edilenler Dışındaki Bakır, Çinko, Demir Çelik, Alüminyum ve Kurşun Külçe Teslimi [KDVGUT-(I/C-2.1.3.3.1)]'],
  ['619', 'Bakır, çinko ve alüminyum ürünlerinin teslimi'],
  ['620', 'İstisnadan vazgeçenlerin hurda ve atık teslimi'],
  ['621', 'Metal, plastik, lastik, kauçuk, kağıt ve cam hurda ve atıklardan elde edilen hammadde teslimi'],
  ['622', 'Pamuk, tiftik, yün ve yapağı ile leham post ve deri teslimleri'],
  ['623', 'Ağaç ve orman ürünleri teslimi'],
  ['624', 'Yük Taşımacılığı Hizmeti [KDVGUT-(I/C-2.1.3.2.11)]'],
  ['625', 'Ticari Reklam Hizmetleri [KDVGUT-(I/C-2.1.3.2.15)]'],
  ['626', 'Diğer Teslimler [KDVGUT-(I/C-2.1.3.3.7)]'],
  ['627', 'Demir-Çelik Ürünlerinin Teslimi [KDVGUT-(I/C-2.1.3.3.8)]'],
  ['628', 'Demir-Çelik Ürünlerinin Teslimi [KDVGUT-(I/C-2.1.3.3.8)] (01/11/2022 tarihi öncesi)'],
  ['801', 'Yapım işleri ile Bu İşlerle Birlikte İfa Edilen Mühendislik-Mimarlık ve Etüt-Proje Hizmetleri [KDVGUT-(I/C-2.1.3.2.1)]'],
  ['802', 'Etüt, Plan-Proje, Danışmanlık, Denetim ve Benzeri Hizmetler [KDVGUT-(I/C-2.1.3.2.2)]'],
  ['803', 'Makine, Teçhizat, Demirbaş ve Taşıtlara Ait Tadil, Bakım ve Onarım Hizmetleri [KDVGUT-(I/C-2.1.3.2.3)]'],
  ['804', 'Yemek Servis Hizmeti [KDVGUT-(I/C-2.1.3.2.4)]'],
  ['805', 'Organizasyon Hizmeti [KDVGUT-(I/C-2.1.3.2.4)]'],
  ['806', 'İşgücü Temin Hizmetleri [KDVGUT-(I/C-2.1.3.2.5)]'],
  ['807', 'Özel Güvenlik Hizmeti [KDVGUT-(I/C-2.1.3.2.5)]'],
  ['808', 'Yapı Denetim Hizmetleri [KDVGUT-(I/C-2.1.3.2.6)]'],
  ['809', 'Fason Olarak Yaptırılan Tekstil ve Konfeksiyon İşleri, Çanta ve Ayakkabı Dikim İşleri ve Bu İşlere Aracılık Hizmetleri [KDVGUT-(I/C-2.1.3.2.7)]'],
  ['810', 'Turistik Mağazalara Verilen Müşteri Bulma/Götürme Hizmetleri [KDVGUT-(I/C-2.1.3.2.8)]'],
  ['811', 'Spor Kulüplerinin Yayın, Reklam ve İsim Hakları Gelirlerine Konu İşlemleri [KDVGUT-(I/C-2.1.3.2.9)]'],
  ['812', 'Temizlik Hizmeti [KDVGUT-(I/C-2.1.3.2.10)]'],
  ['813', 'Çevre Bahçe Bakım Hizmetleri [KDVGUT-(I/C-2.1.3.2.10)]'],
  ['814', 'Servis Taşımacılığı Hizmeti [KDVGUT-(I/C-2.1.3.2.11)]'],
  ['815', 'Her Türlü Baskı ve Basım Hizmetleri [KDVGUT-(I/C-2.1.3.2.12)]'],
  ['816', 'Hurda Metalden Elde Edilen Külçe Teslimleri [KDVGUT-(I/C-2.1.3.3.1)]'],
  ['817', 'Hurda Metalden Elde Edilenler Dışındaki Bakır, Çinko, Demir Çelik, Alüminyum ve Kurşun Külçe Teslimi [KDVGUT-(I/C-2.1.3.3.1)]'],
  ['818', 'Bakır, Çinko, Alüminyum ve Kurşun Ürünlerinin Teslimi [KDVGUT-(I/C-2.1.3.3.2)]'],
  ['819', 'İstisnadan Vazgeçenlerin Hurda ve Atık Teslimi [KDVGUT-(I/C-2.1.3.3.3)]'],
  ['820', 'Metal, Plastik, Lastik, Kauçuk, Kağıt ve Cam Hurda ve Atıklardan Elde Edilen Hammadde Teslimi [KDVGUT-(I/C-2.1.3.3.4)]'],
  ['821', 'Pamuk, Tiftik, Yün ve Yapağı İle Ham Post ve Deri Teslimleri [KDVGUT-(I/C-2.1.3.3.5)]'],
  ['822', 'Ağaç ve Orman Ürünlerinin Teslimi [KDVGUT-(I/C-2.1.3.3.6)]'],
  ['823', 'Yük Taşımacılığı Hizmeti [KDVGUT-(I/C-2.1.3.2.11)]'],
  ['824', 'Ticari Reklam Hizmetleri [KDVGUT-(I/C-2.1.3.2.15)]'],
  ['825', 'Demir-Çelik Ürünlerinin Teslimi [KDVGUT-(I/C-2.1.3.3.8)]']
].map(([kod, ad]) => ({ kod, ad }))

// GIB tevkifat oranlari (KDVGUT) — kod -> KDV'nin kesinti yuzdesi
const TEVKIFAT_ORAN = {
  '601': 40, '602': 90, '603': 70, '604': 50, '605': 50, '606': 90, '607': 90,
  '608': 90, '609': 70, '610': 90, '611': 90, '612': 90, '613': 90, '614': 50,
  '615': 70, '616': 50, '617': 70, '618': 70, '619': 70, '620': 70, '621': 90,
  '622': 90, '623': 50, '624': 20, '625': 30, '626': 20, '627': 50, '628': 50
}
for (let k = 801; k <= 825; k++) TEVKIFAT_ORAN[String(k)] = 100

const bosKalem = () => ({
  ad: '', miktar: '', birim: 'Adet', birimFiyat: '',
  iskontoOran: '', iskontoTutar: '', kdvOran: '20',
  gvStopajOran: '20', kdvTevkifatOran: '',
  vergiler: []
})

const bugun = () => new Date().toISOString().substring(0, 10)
const simdi = () => new Date().toTimeString().substring(0, 5)

const bosForm = () => ({
  tarih: bugun(),
  saat: simdi(),
  paraBirimi: 'TL',
  dovizKuru: '',
  faturaTipi: 'SATIŞ',
  aliciVknTckn: '',
  aliciUnvan: '',
  aliciAd: '',
  aliciSoyad: '',
  aliciVergiDairesi: '',
  aliciUlke: 'TÜRKİYE',
  aliciIl: '',
  aliciIlce: '',
  aliciAdres: '',
  irsaliyeNo: '',
  irsaliyeTarih: '',
  kalemler: [bosKalem()],
  vergiler: [],
  iadeFaturalari: [],
  not: ''
})

const sayi = (v) => {
  if (v === '' || v == null) return 0
  const n = Number(String(v).replace(',', '.'))
  return isFinite(n) ? n : 0
}

const fmt = (n) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function EFaturaKesim({ clientId, allowedTurs = ['earsiv'], baslik }) {
  const [tursState, setTursState] = useState(allowedTurs.filter(t => TUR_ETIKET[t]))
  const [mfaturaAcik, setMfaturaAcik] = useState(false)
  const [tur, setTur] = useState(allowedTurs[0] || 'earsiv')
  const [form, setForm] = useState(bosForm())
  const [clients, setClients] = useState([])
  const [secilenClient, setSecilenClient] = useState(clientId || '')
  const [mesaj, setMesaj] = useState(null)
  const [taslaklar, setTaslaklar] = useState([])
  const [taslaklarAcik, setTaslaklarAcik] = useState(false)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [gibGonderim, setGibGonderim] = useState(null)
  // 2.8.16: yardimcidan canli gonderim asamasi — bant "dolduruluyor" /
  // "dolduruldu, onayinizi bekliyor" diye guncellenir
  const [gibAsama, setGibAsama] = useState(null)
  // 2.8.16: gonderim aktifken yardimciyi 2.5 sn'de bir yokla; asama degistikce
  // bant metni guncellenir (dolduruluyor -> dolduruldu, onayinizi bekliyor)
  useEffect(() => {
    if (!gibGonderim?.aktif) { setGibAsama(null); return }
    let canli = true
    const yokla = async () => {
      const d = await gibYardimciGonderimDurumu()
      if (canli) setGibAsama(d)
    }
    yokla()
    const t = setInterval(yokla, 2500)
    return () => { canli = false; clearInterval(t) }
  }, [gibGonderim?.aktif])
  // Duzeltme modu: kayitli taslak "Yükle" ile acildiysa kaydetme AYNI
  // taslagin uzerine yazar (yeni kayit acilmaz). Temizle ile sifirlanir.
  const [duzeltmeKey, setDuzeltmeKey] = useState(null)
  // e-Imza popup'i: "e-imza'yi bilgisayara takin" uyarisi sonrasi gonderilecek
  // fatura listesini tutar (TAMAM -> imzalama araci + GIB doldurma akisi)
  const [eimzaUyari, setEimzaUyari] = useState(null)

  const efektifClientId = clientId || secilenClient

  // Musterinin e-Imza durumu (admin musteri kartindaki e-Hizmet e-Imza
  // Aktif/Pasif bayraklari). e-Imza aktifse GIB'e gonderim imzalama araci
  // (EFaturaWebSocket.jnlp) ile yapilir; degilse IVD sifre girisi kullanilir.
  const eimzaKey = efektifClientId ? `ehizmet_eimza_${efektifClientId}` : ''
  const [eimzaBayraklari, setEimzaBayraklari] = useState({ efatura: false, earsiv: false, esmm: false })
  // 2.7.379: e-SMM de e-Imza yoluyla yapilir (ayni GIB e-Arsiv portal oturumu);
  // esmm bayragi yoksa akis yanlislikla DVS/şifre yoluna duser ve bos liste
  // hatasi verirdi.
  const eimzaYolu = !!(eimzaBayraklari.efatura || eimzaBayraklari.earsiv || eimzaBayraklari.esmm)
  useEffect(() => {
    let canli = true
    ;(async () => {
      if (!eimzaKey) { if (canli) setEimzaBayraklari({ efatura: false, earsiv: false, esmm: false }); return }
      try {
        const v = await getAppSetting(eimzaKey)
        let bayrak = { efatura: false, earsiv: false, esmm: false }
        if (v) { try { bayrak = { ...bayrak, ...(typeof v === 'string' ? JSON.parse(v) : v) } } catch { /* bozuk json -> varsayilan */ } }
        if (canli) setEimzaBayraklari(bayrak)
      } catch { /* bayraklar okunamadi -> sifre yolu */ }
    })()
    return () => { canli = false }
  }, [eimzaKey])

  // Izinli turler:
  //  - Musteri portalinda: prop olarak gelen allowedTurs
  //  - Admin modunda: secilen musteri e-hizmet bayraklarindan (efatura+earsiv
  //    ikisi de aktifse admin butonlarla secer; esmm tek ise tek tur)
  const adminClient = !clientId && secilenClient ? clients.find(x => String(x.id) === String(secilenClient)) : null
  const adminTurlari = useMemo(() => {
    if (clientId || !adminClient) return null
    const izinli = [
      ...(adminClient.efatura ? ['efatura'] : []),
      ...(adminClient.earsiv ? ['earsiv'] : []),
      ...(adminClient.esmm ? ['esmm'] : [])
    ]
    return izinli.length ? izinli : ['earsiv']
  }, [clientId, adminClient])
  const turs = adminTurlari || tursState

  // Aktif tur izinli liste disinda kalirsa (musteri degisimi vb.) ilk izinli ture don
  useEffect(() => {
    if (turs.length && !turs.includes(tur)) setTur(turs[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turs])

  // Musteri portalinda allowedTurs prop'u gec yuklenirse senkronize et
  useEffect(() => {
    if (clientId) setTursState(allowedTurs.filter(t => TUR_ETIKET[t]))
  }, [clientId, allowedTurs])

  // Admin modunda musteri listesi
  useEffect(() => {
    if (clientId) return
    getClients().then(list => setClients((list || []).slice().sort((a, b) => (a.name || a.ad || '').localeCompare(b.name || b.ad || '', 'tr')))).catch(() => {})
  }, [clientId])

  const taslakOnek = efektifClientId ? `efatura_kesim_draft_${efektifClientId}_` : ''

  const taslaklariYukle = async () => {
    if (!taslakOnek) { setTaslaklar([]); return }
    try {
      const rows = await listAppSettings(taslakOnek)
      const grupSira = t => (t.tur === 'earsiv' ? 0 : t.tur === 'efatura' ? 1 : 2)
      const liste = rows
        .map(r => { try { return { key: r.key, ...(JSON.parse(r.value || '{}')) } } catch { return null } })
        .filter(Boolean)
        // Gonderim sirasi: once e-Arsiv, sonra e-Fatura; grup icinde son
        // olusturulan ustte. "Tumunu GIB'e Gonder" de bu sirayla yollar.
        .sort((a, b) => grupSira(a) - grupSira(b) || (b.olusturma || '').localeCompare(a.olusturma || ''))
      setTaslaklar(liste)
    } catch { setTaslaklar([]) }
  }

  useEffect(() => { taslaklariYukle() }, [taslakOnek])

  // ---- Hesaplamalar ----
  const satirHesap = (k) => {
    const brut = sayi(k.miktar) * sayi(k.birimFiyat)
    const iskonto = k.iskontoTutar !== '' ? sayi(k.iskontoTutar) : brut * sayi(k.iskontoOran) / 100
    const matrah = brut - iskonto
    const kdv = matrah * sayi(k.kdvOran) / 100
    // Vergiler HER KALEME OZEL (k.vergiler): KDV TEVKIFAT KDV uzerinden,
    // diger vergiler matrah uzerinden hesaplanir.
    let tevkifatTutar = 0, digerVergiler = 0
    ;(k.vergiler || []).forEach(v => {
      const taban = v.tur === 'KDV TEVKİFAT' ? kdv : matrah
      const t = v.tutar !== '' && v.tutar != null ? sayi(v.tutar) : taban * sayi(v.oran) / 100
      if (v.tur === 'KDV TEVKİFAT') tevkifatTutar += t
      else digerVergiler += t
    })
    return { brut, iskonto, matrah, kdv, tevkifatTutar, digerVergiler }
  }

  const toplamlar = useMemo(() => {
    let iskonto = 0, matrah = 0, kdv = 0, tevkifatTutar = 0, digerVergiler = 0
    form.kalemler.forEach(k => {
      const h = satirHesap(k)
      iskonto += h.iskonto; matrah += h.matrah; kdv += h.kdv
      tevkifatTutar += h.tevkifatTutar; digerVergiler += h.digerVergiler
    })
    return { iskonto, matrah, kdv, tevkifatTutar, digerVergiler, genel: matrah + kdv - tevkifatTutar + digerVergiler }
  }, [form.kalemler])

  // ---- e-SMM (GIB Serbest Meslek Makbuzu) hesaplari ----
  // Brut ucret -> G.V. stopaji -> Net ucret
  // KDV BRUT ucret uzerinden hesaplanir -> KDV tevkifati -> Tahsil edilen KDV
  const esmmSatirHesap = (k) => {
    const brut = sayi(k.miktar || 1) * sayi(k.birimFiyat)
    const gvStopaj = brut * sayi(k.gvStopajOran) / 100
    const netUcret = brut - gvStopaj
    const kdv = brut * sayi(k.kdvOran) / 100
    const tevkifat = kdv * sayi(k.kdvTevkifatOran) / 100
    const tahsilEdilenKdv = kdv - tevkifat
    return { brut, gvStopaj, netUcret, kdv, tevkifat, tahsilEdilenKdv, netTahsilat: netUcret + tahsilEdilenKdv }
  }
  const esmmToplamlar = useMemo(() => {
    const s = { brut: 0, gvStopaj: 0, netUcret: 0, kdv: 0, tevkifat: 0, tahsilEdilenKdv: 0, netTahsilat: 0 }
    form.kalemler.forEach(k => {
      const h = esmmSatirHesap(k)
      s.brut += h.brut; s.gvStopaj += h.gvStopaj; s.netUcret += h.netUcret
      s.kdv += h.kdv; s.tevkifat += h.tevkifat; s.tahsilEdilenKdv += h.tahsilEdilenKdv
      s.netTahsilat += h.netTahsilat
    })
    return s
  }, [form.kalemler])

  // ---- Ek vergiler (GIB "Vergi Ekle") — HER KALEME OZEL ----
  const [yeniVergi, setYeniVergi] = useState({ satir: 0, tur: '', tevkifatKodu: '', oran: '', tutar: '' })
  // Birim fiyat girisi KDV dahil mi hariç mi?
  const [kdvDahil, setKdvDahil] = useState(false)
  // KDV dahil girilen tutari secili KDV oranina gore matraha (net) cevirir
  const dahilNetlestir = (deger, kdvOran) => {
    const v = sayi(deger)
    if (!v) return deger
    const oran = sayi(kdvOran)
    if (!oran) return String(v)
    return String(Math.round(v / (1 + oran / 100) * 10000) / 10000)
  }
  // 2.7.349: KDV Dahil modunda gercek state'de tutulan deger HER ZAMAN net
  // (KDV haric) olmalidir. Kullaniciya input'ta KDV dahil gosterilirken
  // kaydet/gonder aninda ayri netlestirme yapilmaz; boylece 120,00 -> 1200,00
  // gibi 10 kat hatalar ve virgul/nokta karisikliklari onlenir.
  const setKalemDahil = (i, alan, deger) => {
    if (alan === 'birimFiyat' && kdvDahil) {
      const k = form.kalemler[i] || {}
      const net = dahilNetlestir(deger, k.kdvOran)
      setKalem(i, 'birimFiyat', net)
      return
    }
    setKalem(i, alan, deger)
  }
  // KDV TEVKIFAT seciliyse oran tevkifat kodundan gelir (kullanici orani bos birakir)
  const yeniVergiEtkinOran = () => yeniVergi.tur === 'KDV TEVKİFAT'
    ? (TEVKIFAT_ORAN[yeniVergi.tevkifatKodu] || 0)
    : sayi(yeniVergi.oran)
  const yeniVergiAutoTutar = () => {
    // Taban: verginin baglandigi KALEMİN matrahi/KDV'si (fatura geneli degil)
    const k = form.kalemler[yeniVergi.satir] || form.kalemler[0]
    const h = k ? satirHesap(k) : { kdv: 0, matrah: 0 }
    const taban = yeniVergi.tur === 'KDV TEVKİFAT' ? h.kdv : h.matrah
    return taban * yeniVergiEtkinOran() / 100
  }
  const vergiEkle = () => {
    if (!yeniVergi.tur) return
    if (yeniVergi.tur === 'KDV TEVKİFAT' && !yeniVergi.tevkifatKodu) {
      setMesaj({ tip: 'hata', metin: 'KDV Tevkifatı için tevkifat kodu seçmelisiniz.' })
      return
    }
    const tevkifatMi = yeniVergi.tur === 'KDV TEVKİFAT'
    const kodBilgisi = tevkifatMi ? TEVKIFAT_KODLARI.find(k => k.kod === yeniVergi.tevkifatKodu) || null : null
    const oran = yeniVergiEtkinOran()
    const v = {
      tur: yeniVergi.tur,
      oran,
      tevkifatKodu: tevkifatMi ? yeniVergi.tevkifatKodu : '',
      tevkifatKoduAdi: kodBilgisi ? `${kodBilgisi.kod} - ${kodBilgisi.ad}` : '',
      tutar: yeniVergi.tutar !== '' ? sayi(yeniVergi.tutar) : yeniVergiAutoTutar()
    }
    // Vergi SECILEN KALEME eklenir (satir bazli)
    const satirIx = Math.min(Math.max(0, Number(yeniVergi.satir) || 0), Math.max(0, form.kalemler.length - 1))
    setForm(f => ({
      ...f,
      kalemler: (f.kalemler || []).map((k, ix) => ix === satirIx ? { ...k, vergiler: [...(k.vergiler || []), v] } : k)
    }))
    setYeniVergi({ satir: satirIx, tur: '', tevkifatKodu: '', oran: '', tutar: '' })
    setMesaj(null)
  }
  // satirIx: kalem indeksi, vergiIx: o kalemdeki verginin indeksi
  const vergiSil = (satirIx, vergiIx) => setForm(f => ({
    ...f,
    kalemler: (f.kalemler || []).map((k, ix) => ix === satirIx ? { ...k, vergiler: (k.vergiler || []).filter((_, vx) => vx !== vergiIx) } : k)
  }))

  // ---- Iadeye konu faturalar (GENEL IADE / TEVKIFAT IADE) ----
  const iadeMi = form.faturaTipi === 'GENEL İADE' || form.faturaTipi === 'TEVKİFAT İADE'
  const iadeSatirEkle = () => setForm(f => ({ ...f, iadeFaturalari: [...(f.iadeFaturalari || []), { faturaNo: '', faturaTarihi: '' }] }))
  const iadeSatirCikar = () => setForm(f => ({ ...f, iadeFaturalari: (f.iadeFaturalari || []).length > 1 ? f.iadeFaturalari.slice(0, -1) : f.iadeFaturalari }))
  const setIade = (i, alan, deger) => setForm(f => ({
    ...f,
    iadeFaturalari: (f.iadeFaturalari || []).map((s, ix) => ix === i ? { ...s, [alan]: deger } : s)
  }))

  // ---- Fatura kesen isletmenin banka hesaplari (clients.banks) -> Not otomatik ----
  const [isletmeBankalari, setIsletmeBankalari] = useState([])
  useEffect(() => {
    if (!efektifClientId) { setIsletmeBankalari([]); return }
    let iptal = false
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('clients')
          .select('banks')
          .eq('id', efektifClientId)
          .maybeSingle()
        if (!error && !iptal) setIsletmeBankalari(Array.isArray(data?.banks) ? data.banks : [])
      } catch { /* yoksay */ }
    })()
    return () => { iptal = true }
  }, [efektifClientId])

  const bankaMetni = (bankalar) => (bankalar || []).map(b => {
    const parcalar = [
      b.bank,
      b.branch ? `(${b.branch})` : '',
      b.iban ? `IBAN: ${b.iban}` : '',
      b.accountNo ? `Hesap No: ${b.accountNo}` : ''
    ].filter(Boolean)
    return parcalar.join(' ')
  }).filter(Boolean).join('\n')

  // Not alani bossa banka bilgilerini otomatik yaz (e-SMM Aciklamalar alanina yazilmaz)
  useEffect(() => {
    if (tur === 'esmm') return
    const metin = bankaMetni(isletmeBankalari)
    if (!metin) return
    setForm(f => f.not ? f : { ...f, not: metin })
  }, [isletmeBankalari, tur])

  const set = (alan, deger) => setForm(f => ({ ...f, [alan]: deger }))
  const setKalem = (i, alan, deger) => setForm(f => ({
    ...f,
    kalemler: f.kalemler.map((k, ix) => ix === i ? { ...k, [alan]: deger } : k)
  }))

  // ---- GIB sicil sorgusu: VKN/TCKN dolunca unvan / ad-soyad / vergi dairesi otomatik ----
  const [sicilAranıyor, setSicilAranıyor] = useState(false)
  const [sicilNotu, setSicilNotu] = useState(null)
  const [mukellefNotu, setMukellefNotu] = useState(null)
  const sonSorgulanan = useRef('')

  // ---- e-SMM siradaki makbuz onayi (2.7.383): window.confirm tarayici
  // tarafindan engellenebildigi icin uygulama ici modal kullanilir.
  const [esmmDevamSorusu, setEsmmDevamSorusu] = useState(null)
  const esmmDevamCozRef = useRef(null)
  const esmmDevamiBekle = (ad) => new Promise(resolve => {
    esmmDevamCozRef.current = resolve
    setEsmmDevamSorusu({ ad })
  })
  const esmmDevamiYanitla = (ok) => {
    setEsmmDevamSorusu(null)
    const coz = esmmDevamCozRef.current
    esmmDevamCozRef.current = null
    if (coz) coz(ok)
  }

  // ---- Son kullanilan alicilar (app_settings'te JSON dizi) ----
  const aliciAnahtar = efektifClientId ? `efatura_kesim_alicilar_${efektifClientId}` : ''
  const [aliciListesi, setAliciListesi] = useState([])
  const [aliciPanelAcik, setAliciPanelAcik] = useState(false)
  const [aliciArama, setAliciArama] = useState('')

  const alicilariYukle = async () => {
    if (!aliciAnahtar) { setAliciListesi([]); return }
    try {
      const v = await getAppSetting(aliciAnahtar)
      const liste = JSON.parse(v || '[]')
      setAliciListesi(Array.isArray(liste) ? liste : [])
    } catch { setAliciListesi([]) }
  }
  useEffect(() => { alicilariYukle() }, [aliciAnahtar])

  const aliciKaydet = async (rec) => {
    if (!aliciAnahtar || !rec?.vknTckn) return
    try {
      const temiz = {
        vknTckn: rec.vknTckn,
        unvan: rec.unvan || '', adi: rec.adi || '', soyad: rec.soyad || '',
        vergiDairesi: rec.vergiDairesi || '', adres: rec.adres || '',
        aliciIl: rec.aliciIl || rec.il || '', aliciIlce: rec.aliciIlce || rec.ilce || ''
      }
      const liste = [temiz, ...aliciListesi.filter(a => a.vknTckn !== temiz.vknTckn)].slice(0, 50)
      setAliciListesi(liste)
      await setAppSetting(aliciAnahtar, JSON.stringify(liste))
    } catch { /* yoksay */ }
  }

  const aliciSec = (a) => {
    setForm(f => ({
      ...f,
      aliciVknTckn: a.vknTckn || '',
      aliciUnvan: a.unvan || '',
      aliciAd: a.adi || '',
      aliciSoyad: a.soyad || '',
      aliciVergiDairesi: a.vergiDairesi || '',
      aliciIl: a.aliciIl || '', aliciIlce: a.aliciIlce || '',
      aliciAdres: a.adres || ''
    }))
    // Guard'i temizle: efekt yeniden calisir (GIB sicil + e-Fatura mukellefiyet sorgusu)
    sonSorgulanan.current = ''
    setAliciPanelAcik(false)
    setAliciArama('')
    setSicilNotu(a.adres ? { tip: 'ok', metin: 'Kayıtlı alıcı bilgileri dolduruldu.' } : null)
  }

  const aliciAdi = (a) => a.unvan || [a.adi, a.soyad].filter(Boolean).join(' ') || a.vknTckn
  const filtreliAlicilar = aliciListesi.filter(a => {
    if (!aliciArama.trim()) return true
    const q = aliciArama.toLowerCase()
    return aliciAdi(a).toLowerCase().includes(q) || String(a.vknTckn).includes(q)
  })

  useEffect(() => {
    const no = (form.aliciVknTckn || '').replace(/\D/g, '')
    if ((no.length !== 10 && no.length !== 11) || !efektifClientId) return
    if (sonSorgulanan.current === `${efektifClientId}_${no}`) return
    const t = setTimeout(async () => {
      sonSorgulanan.current = `${efektifClientId}_${no}`
      setSicilAranıyor(true)
      setSicilNotu(null)
      // Onceki kesimlerden SADECE adres (unvan/vergi dairesi GIB'den gelir).
      // e-SMM makbuzu + e-Arşiv/e-Fatura faturalari: alici bloğu iceren en guncel
      // PDF'ler taranir, adres bulunana kadar siralanir.
      const oncekiAliciAdres = async () => {
        try {
          const { data } = await supabase.from('efatura_faturalar')
            .select('tur, karsi_unvan, pdf_url, sorgu_ts')
            .in('tur', ['esmm', 'earsiv', 'efatura'])
            .eq('yon', 'giden')
            .eq('karsi_vkn', no)
            .not('pdf_url', 'is', null)
            .order('sorgu_ts', { ascending: false })
            .limit(5)
          if (!data?.length) return ''
          for (const kayit of data) {
            try {
              const blob = await (await fetch(kayit.pdf_url)).blob()
              const metin = (await pdfMetinOku(blob)).replace(/\s+/g, ' ')
              // Karsi tarafin bulundugu blogu sec (yon etiketine guvenme)
              const di = metin.search(/DÜZENLEYEN/)
              const ai = metin.indexOf('ALICI BİLGİLERİ')
              const aliciBlok = ai >= 0 ? metin.slice(ai, di > ai ? di : undefined) : ''
              const duzBlok = di >= 0 ? metin.slice(di, ai > di ? ai : undefined) : ''
              const blok = aliciBlok.includes(no) ? aliciBlok
                : duzBlok.includes(no) ? duzBlok
                  : (aliciBlok || duzBlok)
              const temiz = blok
                .replace(/^ALICI\s*BİLGİLERİ\s*/i, '')
                .replace(/^DÜZENLEYEN\s*/i, '')
                .replace(/^ALICI\s*/i, '')
              const vdIdx = blok ? temiz.search(/Vergi\s*Dairesi/i) : -1
              const bas = vdIdx > 0 ? temiz.slice(0, vdIdx) : temiz.slice(0, 400)
              // Unvani kirp: once DB'deki kayitli unvan, bulunamazsa adres anahtar kelimesi
              const unvan = String(kayit.karsi_unvan || '').replace(/\s+/g, ' ').trim()
              let adres = ''
              if (blok && unvan) {
                const ui = bas.toLocaleUpperCase('tr-TR').indexOf(unvan.toLocaleUpperCase('tr-TR'))
                if (ui >= 0) adres = bas.slice(ui + unvan.length)
              }
              if (blok && !adres.trim()) {
                const ki = bas.search(/(?:Mah\.?\b|MAH\b|Mh\.?\b|Sok\.?\b|SOKAK\b|Sokak\b|Sk\.?\b|Cad\.?\b|Bul\.?\b|Bulvar\b|Yolu\b|Kapı\b|Kapi\b|No\s*[:：]|\d{5}\b)/i)
                if (ki > 0) adres = bas.slice(ki)
              }
              adres = adres
                .replace(/^[\s,;:\-–]+/, '')
                .replace(/\s+TR\.?$/i, '')
                .replace(/\s+/g, ' ')
                .trim()
              if (!adres) {
                // MUBIS tasarim faturalari: "SAYIN <ad> <adres> Vergi Dairesi: <TCKN|VKN>: no"
                const idM = metin.match(new RegExp(`(?:TCKN|VKN)\\s*:\\s*${no}`))
                if (idM) {
                  const idIdx = idM.index
                  const oncekiVkn = metin.lastIndexOf('VKN:', idIdx)
                  // Satci VKN'sinin rakamlarini da atla
                  const blok2 = metin.slice(oncekiVkn >= 0 && oncekiVkn < idIdx ? oncekiVkn + 4 : 0, idIdx).replace(/^\s*\d+\s*/, '')
                  const vdIdx2 = blok2.search(/Vergi\s*Dairesi/i)
                  const govde = vdIdx2 >= 0 ? blok2.slice(0, vdIdx2) : blok2
                  const ki2 = govde.search(/(?:Mah\.?\b|MAH\b|Mh\.?\b|Sok\.?\b|SOKAK\b|Sokak\b|Sk\.?\b|SK\b|SOK\b|Cad\.?\b|Bul\.?\b|Bulvar\b|Yolu\b|Kapı\b|Kapi\b|No\.?\s*[:：]|(?<!\d)\d{5}\b)/i)
                  if (ki2 > 0) {
                    adres = govde.slice(ki2)
                      .replace(/^[\s,;:\-–]+/, '')
                      .replace(/\s+/g, ' ')
                      .trim()
                  }
                }
              }
              if (adres) return adres
            } catch { /* sonraki kayit */ }
          }
          return ''
        } catch { return '' }
      }
      // GIB sicil sorgusu (musteri GIB sifresiyle) — unvan/ad/vergi dairesi
      const gibSorgu = async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          const r = await fetch('/api/vkn-sorgula', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session?.access_token || ''}`
            },
            body: JSON.stringify({ clientId: efektifClientId, vkn: no })
          })
          const text = await r.text()
          try {
            return text ? JSON.parse(text) : { error: `Sunucu boş yanıt döndü (${r.status})` }
          } catch {
            return { error: `Sunucu yanıtı okunamadı (${r.status})` }
          }
        } catch (err) {
          console.error('VKN sorgu fetch hatası:', err)
          return { error: 'GİB sorgusuna ulaşılamadı' }
        }
      }
      const [gib, esmmAdres] = await Promise.all([gibSorgu(), oncekiAliciAdres()])
      const d = gib?.success ? gib.data : null
      // Adres hala yoksa kayitli musteri kartindan (clients.address) al
      let musteriAdres = ''
      if (!esmmAdres && !(d?.adres)) {
        try {
          const { data: cli } = await supabase.from('clients')
            .select('address, city')
            .or(`vkn.eq.${no},tc.eq.${no}`)
            .maybeSingle()
          if (cli?.address) musteriAdres = [cli.address, cli.city].filter(Boolean).join(', ')
        } catch { /* yoksay */ }
      }
      const bulunanAdres = esmmAdres || musteriAdres
      if (d || esmmAdres || musteriAdres) {
        setForm(f => ({
          ...f,
          aliciUnvan: d?.unvan || f.aliciUnvan,
          aliciAd: d?.adi || f.aliciAd,
          aliciSoyad: d?.soyadi || f.aliciSoyad,
          aliciVergiDairesi: d?.vergiDairesi || f.aliciVergiDairesi,
          aliciAdres: f.aliciAdres || d?.adres || bulunanAdres || '',
          aliciIl: d ? (d.il || '') : f.aliciIl,
          aliciIlce: d ? (d.ilce || '') : f.aliciIlce,
          aliciUlke: (!f.aliciUlke || f.aliciUlke === 'TÜRKİYE') && d?.ulkeAdi ? d.ulkeAdi : f.aliciUlke
        }))
        if (d) {
          aliciKaydet({
            vknTckn: no,
            unvan: d.unvan,
            adi: d.adi,
            soyad: d.soyadi,
            vergiDairesi: d.vergiDairesi,
            adres: d.adres || bulunanAdres || '',
            aliciIl: d.il || '', aliciIlce: d.ilce || ''
          })
        }
        setSicilNotu({
          tip: 'ok',
          metin: d
            ? [
              'GİB kaydından dolduruldu:',
              d.unvan || [d.adi, d.soyadi].filter(Boolean).join(' '),
              d.vergiDairesi ? `— ${d.vergiDairesi}` : '',
              !(d.adres || bulunanAdres) ? '(adres yok — elle girin)' : ''
            ].filter(Boolean).join(' ')
            + (esmmAdres && !d.adres ? ' · Adres önceki e-SMM makbuzundan alındı' : '')
            + (musteriAdres && !d.adres && !esmmAdres ? ' · Adres müşteri kartından alındı' : '')
            : (esmmAdres ? 'Adres önceki e-SMM makbuzundan alındı.' : 'Adres müşteri kartından alındı.')
        })
      } else if (gib?.error && String(gib.error).startsWith('GIB_SIFRE_YOK')) {
        setSicilNotu({ tip: 'uyari', metin: 'Otomatik doldurma için müşteri kartına Dijital Vergi Dairesi kullanıcı adı/şifre girilmeli.' })
      } else if (gib?.message) {
        setSicilNotu({ tip: 'uyari', metin: gib.message })
      } else if (gib?.error) {
        setSicilNotu({ tip: 'uyari', metin: `GİB sorgusu başarısız: ${gib.error}` })
      }
      setSicilAranıyor(false)
      // Alici e-Fatura mukellefi mi? (GIB kayitli kullanici listesi + 2captcha)
      // Mukellefse tur e-Fatura, degilse e-Arşiv otomatik secilir (izinli tur varsa).
      const mukellefKontrol = async () => {
        if (!turs.includes('efatura') && !turs.includes('earsiv')) return
        setMukellefNotu({ tip: 'uyari', metin: 'e-Fatura mükellefiyeti GİB üzerinden sorgulanıyor (bu işlem 1-2 dakika sürebilir)...' })
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 180000)
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (!session?.access_token) throw new Error('Oturum süresi dolmuş; tekrar giriş yapın.')
          let r = null
          let d = null
          let sonHata = null
          for (const endpoint of EFATURA_MUKELLEF_ENDPOINTLERI) {
            try {
              const yanit = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ vkn: no }),
                signal: controller.signal
              })
              if (!String(yanit.headers.get('content-type') || '').includes('application/json')) {
                sonHata = new Error(`Sunucu JSON yerine farklı yanıt verdi (HTTP ${yanit.status}).`)
                continue
              }
              const veri = await yanit.json()
              if (yanit.status === 404 && endpoint !== EFATURA_MUKELLEF_ENDPOINTLERI.at(-1)) {
                sonHata = new Error('Mükellef sorgu servisi bu adreste bulunamadı.')
                continue
              }
              r = yanit
              d = veri
              break
            } catch (error) {
              sonHata = error
              if (error?.name === 'AbortError') break
            }
          }
          if (!r || !d) throw sonHata || new Error('Mükellef sorgu servisine ulaşılamadı.')
          if (!r.ok || !d?.success) {
            setMukellefNotu({ tip: 'uyari', metin: `Mükellef sorgusu yapılamadı (${d?.error || `HTTP ${r.status}`}) — fatura türünü elle seçebilirsiniz.` })
            return
          }
          if (d.efaturaMukellefi && turs.includes('efatura')) {
            setTur('efatura')
            setMukellefNotu({ tip: 'ok', metin: `Alıcı e-Fatura mükellefi${d.unvan ? ` (${d.unvan})` : ''} — fatura türü e-Fatura seçildi.` })
          } else if (!d.efaturaMukellefi && turs.includes('earsiv')) {
            setTur('earsiv')
            setMukellefNotu({ tip: 'ok', metin: 'Alıcı e-Fatura mükellefi değil — fatura türü e-Arşiv seçildi.' })
          } else {
            setMukellefNotu(null)
          }
        } catch (error) {
          const mesaj = error?.name === 'AbortError' ? 'Sorgu zaman aşımına uğradı.' : (error?.message || 'Servise ulaşılamadı.')
          setMukellefNotu({ tip: 'uyari', metin: `Mükellef sorgusu yapılamadı (${mesaj}) — fatura türünü elle seçebilirsiniz.` })
        } finally {
          clearTimeout(timeout)
        }
      }
      mukellefKontrol()
    }, 700)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.aliciVknTckn, efektifClientId])

  const kalemEkle = () => setForm(f => ({ ...f, kalemler: [...f.kalemler, bosKalem()] }))
  const kalemSil = (i) => setForm(f => ({
    ...f,
    kalemler: f.kalemler.length > 1 ? f.kalemler.filter((_, ix) => ix !== i) : f.kalemler
  }))

  const formGecerliMi = () => {
    if (!efektifClientId) return 'Müşteri seçin'
    if (!/^\d{10,11}$/.test(form.aliciVknTckn || '')) return 'Alıcı VKN (10 hane) veya TCKN (11 hane) girin'
    if (form.aliciVknTckn.length === 10 && !form.aliciUnvan) return 'Şirket için ünvan zorunlu'
    if (form.aliciVknTckn.length === 11 && !form.aliciAd) return 'Şahıs için ad zorunlu'
    if (!form.aliciAdres) return 'Alıcı adres zorunlu'
    if (!form.aliciUlke) return 'Alıcı ülke zorunlu'
    // GIB formunda "Mahalle/Semt/İlçe" ve "İl" zorunlu alanlar; bos
    // gonderilirse yardimci program dolduramaz. Tum turler icin gecerli
    // (e-Arsiv, e-Fatura, e-SMM).
    if (!form.aliciUlke || form.aliciUlke === 'TÜRKİYE') {
      if (!form.aliciIl) return 'Alıcı için İl seçin (GİB formunda zorunlu)'
      if (!form.aliciIlce) return 'Alıcı için İlçe seçin (GİB formunda zorunlu)'
    }
    if (!form.tarih || !form.saat) return 'Düzenleme tarihi ve saati zorunlu'
    if (form.paraBirimi !== 'TL' && !sayi(form.dovizKuru)) return 'Döviz kuru zorunlu (TL dışı para birimi)'
    for (const k of form.kalemler) {
      if (!k.ad) return 'Kalem adı zorunlu'
      if (tur !== 'esmm' && !sayi(k.miktar)) return `"${k.ad}" kaleminde miktar zorunlu`
      if (!sayi(k.birimFiyat)) return `"${k.ad}" kaleminde birim fiyat (brüt ücret) zorunlu`
    }
    return null
  }

  const taslakKaydet = async (durum = 'hazir') => {
    const hata = formGecerliMi()
    if (hata) { setMesaj({ tip: 'hata', metin: hata }); return null }
    setKaydediliyor(true)
    try {
      // Duzeltme modu: yuklenen taslagin AYNI anahtari uzerine yaz;
      // olusturma zamani korunur, guncelleme zamani eklenir.
      const eski = duzeltmeKey ? taslaklar.find(t => t.key === duzeltmeKey) : null
      const key = duzeltmeKey || `${taslakOnek}${Date.now()}`
      const payload = {
        tur, durum, olusturma: eski?.olusturma || new Date().toISOString(),
        ...(duzeltmeKey ? { guncelleme: new Date().toISOString() } : {}),
        client_id: efektifClientId,
        fatura: { ...form, kalemler: form.kalemler.map(k => tur === 'esmm'
          ? { ...k, ...esmmSatirHesap(k) }
          : (() => { const h = satirHesap(k); return { ...k, matrah: h.matrah, kdvTutar: h.kdv } })()) },
        toplamlar: tur === 'esmm' ? esmmToplamlar : toplamlar
      }
      await setAppSetting(key, JSON.stringify(payload))
      aliciKaydet({
        vknTckn: form.aliciVknTckn,
        unvan: form.aliciUnvan,
        adi: form.aliciAd,
        soyad: form.aliciSoyad,
        vergiDairesi: form.aliciVergiDairesi,
        adres: form.aliciAdres,
        aliciIl: form.aliciIl, aliciIlce: form.aliciIlce
      })
      await taslaklariYukle()
      setMesaj({
        tip: 'ok',
        metin: durum === 'gib_bekliyor'
          ? `${TUR_ETIKET[tur]} taslağı kaydedildi ve GİB gönderim kuyruğuna alındı. GİB otomatik doldurma yardımcı program güncellemesiyle gönderilecek.`
          : `${TUR_ETIKET[tur]} taslağı kaydedildi.`
      })
      return key
    } catch (e) {
      setMesaj({ tip: 'hata', metin: `Taslak kaydedilemedi: ${e.message}` })
      return null
    } finally {
      setKaydediliyor(false)
    }
  }

  // Taslak(lari) yardimci program ile GIB e-Arsiv Portal'inda interaktif
  // olarak doldur. Liste 1'den fazlaysa SIRAYLA doldurulur: her faturadan
  // sonra kullanici GIB'de (Olustur)'a baslar, MUBiS'teki "Devam Et" ile
  // siradaki fatura doldurulur; "Iptal" diziyi keser. Tekrar giris yapilmaz.
  const gibGonderTaslaklar = async (liste) => {
    if (!liste?.length) return
    if (gibGonderim?.aktif) return
    // GIB formunda İl ve Mahalle/Semt/İlçe zorunlu. Eski taslaklarda bu
    // alanlar yok olabilir (listeden gonderim dogrulamayi atlar) -> blokla,
    // duzeltme modunda secip kaydedilsin.
    const eksikIl = liste.filter(t => {
      const ulke = t.fatura?.aliciUlke || 'TÜRKİYE'
      return (!ulke || ulke === 'TÜRKİYE') && (!t.fatura?.aliciIl || !t.fatura?.aliciIlce)
    })
    if (eksikIl.length) {
      const adlar = eksikIl.map(t => t.fatura?.aliciUnvan || [t.fatura?.aliciAd, t.fatura?.aliciSoyad].filter(Boolean).join(' ') || t.fatura?.aliciVknTckn || '?').join(', ')
      setMesaj({
        tip: 'hata',
        metin: `Şu faturalarda İl/İlçe seçilmemiş: ${adlar}. Taslağı "Yükle" ile açıp İl ve İlçe'yi seçin — Kaydet aynı taslağın üzerine yazar — sonra GİB'e gönderin.`
      })
      return
    }
    setKaydediliyor(true)
    setGibGonderim({
      aktif: true, toplam: liste.length, tamam: 0,
      // 2.7.264: siradaki faturayi gostermek icin isim listesi
      isimler: liste.map(t => t.fatura?.aliciUnvan || [t.fatura?.aliciAd, t.fatura?.aliciSoyad].filter(Boolean).join(' ') || t.fatura?.aliciVknTckn || '')
    })
    try {
      const m = await musteriGirisBilgileriGetir(efektifClientId)
      // Faturalari turune gore ayir: secili fatura tipi (e-Arşiv / e-Fatura / e-SMM)
      // hangisiyse o porta gore yolla. Karisik listede grup grup siralanir.
      const efaturaGrubu = liste.filter(t => (t.tur || 'earsiv') === 'efatura')
      const earsivGrubu = liste.filter(t => (t.tur || 'earsiv') !== 'efatura' && t.tur !== 'esmm')
      const esmmGrubu = liste.filter(t => t.tur === 'esmm')
      const isaretle = []
      let okHepsi = true
      let sonucNot = ''
      if (eimzaYolu) {
        // e-Imza yolu: imzalama araci (JNLP) + musteri kartindaki kart/PIN
        if (!m?.kartSifre) {
          setMesaj({ tip: 'hata', metin: 'Müşteri kartında e-İmza Kart Şifresi (PIN) eksik. Müşteri düzenleme ekranından "Kart Şifresi" girin.' })
          return
        }
        const temel = { eimza: true, kartTipi: m.kartTipi || 'Akis', kartSifre: m.kartSifre, musteriAd: m.name || m.unvan || '' }
        // e-SMM makbuzlari ayni portalda tek tek doldurulur (esmmGrubu yukarida tanimlandi).
        if (esmmGrubu.length) {
          for (const t of esmmGrubu) {
            setGibGonderim(g => ({ ...g, tamam: isaretle.length, isimler: liste.map(x => x.fatura?.aliciUnvan || [x.fatura?.aliciAd, x.fatura?.aliciSoyad].filter(Boolean).join(' ') || x.fatura?.aliciVknTckn || '') }))
            const r = await gibYardimciIs('esmm-makbuz-doldur', { ...temel, fatura: { fatura: t.fatura } }, 45 * 60 * 1000)
            if (!r.ok) {
              // 2.7.382: Yarim dolumda siradaki makbuza OTOMATIK gecme
              okHepsi = false
              sonucNot = r.not || 'e-SMM makbuzu tam doldurulamadı — GİB ekranından elle tamamlayın.'
              break
            }
            isaretle.push(t.key)
            if (r.not) sonucNot = r.not
            // Kullanici GIB'de (Olustur)+imzayi bitirmeden siradakine gecme
            // (2.7.383: window.confirm engellenebildigi icin modal)
            const mkAd = t.fatura?.aliciUnvan || [t.fatura?.aliciAd, t.fatura?.aliciSoyad].filter(Boolean).join(' ') || t.fatura?.aliciVknTckn || ''
            const devam = await esmmDevamiBekle(mkAd)
            if (!devam) { sonucNot = 'Sıradaki makbuz kullanıcı tarafından durduruldu.'; break }
            if (r.girisOk === false) break
          }
        }
        // ONCE e-Arsiv faturalari: tek oturumda sirayla doldurulur
        if (earsivGrubu.length) {
          const r = await gibYardimciIs('earsiv-toplu-doldur', {
            ...temel,
            faturalar: earsivGrubu.map(t => ({ fatura: t.fatura }))
          }, 45 * 60 * 1000)
          const doldurulan = r.doldurulan || []
          for (let i = 0; i < Math.min(doldurulan.length, earsivGrubu.length); i++) {
            if (doldurulan[i]?.ok) isaretle.push(earsivGrubu[i].key)
          }
          if (!r.ok) okHepsi = false
          if (r.not) sonucNot = r.not
        }
        // SONRA e-Fatura faturalari teker teker doldurulur (ayni oturumda).
        // 2.7.369: e-Arsiv -> e-Fatura GECISINDE (ilk e-Fatura cagrisinda)
        // imza yardimcisi yeniden baslatilir (arsivdenGecis); ayni e-Fatura
        // grubunun devaminda oturum korunur.
        let arsivdenGecis = !!earsivGrubu.length
        if (efaturaGrubu.length && okHepsi) {
          for (const t of efaturaGrubu) {
            setGibGonderim(g => ({ ...g, tamam: isaretle.length, isimler: liste.map(x => x.fatura?.aliciUnvan || [x.fatura?.aliciAd, x.fatura?.aliciSoyad].filter(Boolean).join(' ') || x.fatura?.aliciVknTckn || '') }))
            const r = await gibYardimciIs('efatura-fatura-doldur', { ...temel, arsivdenGecis, fatura: { fatura: t.fatura } }, 45 * 60 * 1000)
            arsivdenGecis = false
            if (r.ok) isaretle.push(t.key); else okHepsi = false
            if (r.not) sonucNot = r.not
            if (r.girisOk === false) break
          }
        }
      } else {
        if (!m?.dvs_username || !m?.dvs_password) {
          setMesaj({ tip: 'hata', metin: 'Müşteri kartında Dijital Vergi Dairesi kullanıcı kodu/şifre eksik. Müşteri düzenleme ekranından girin.' })
          return
        }
        if (esmmGrubu.length && !earsivGrubu.length && !efaturaGrubu.length) {
          setMesaj({ tip: 'hata', metin: 'e-SMM makbuzlarının GİB doldurması e-İmza yoluyla yapılır. Müşteri kartında e-İmza Aktif olmalı.' })
          return
        }
        if (efaturaGrubu.length) {
          setMesaj({ tip: 'hata', metin: 'e-Fatura faturalarının GİB doldurması e-İmza yoluyla yapılır. Müşteri kartında e-İmza Aktif olmalı.' })
          return
        }
        const r = await gibYardimciIs('earsiv-toplu-doldur', {
          kullaniciKodu: m.dvs_username,
          parola: m.dvs_password,
          faturalar: earsivGrubu.map(t => ({ fatura: t.fatura })),
          musteriAd: m.name || m.unvan || ''
        }, 45 * 60 * 1000)
        const doldurulan = r.doldurulan || []
        for (let i = 0; i < Math.min(doldurulan.length, earsivGrubu.length); i++) {
          if (doldurulan[i]?.ok) isaretle.push(earsivGrubu[i].key)
        }
        if (!r.ok) okHepsi = false
        if (r.not) sonucNot = r.not
      }
      const sonuc = { ok: okHepsi, not: sonucNot, doldurulan: isaretle.map(k => ({ ok: true })) }
      if (isaretle.length) {
        // Doldurulan taslaklari "GIB'de dolduruldu" olarak isaretle
        for (const t of liste) {
          if (t.key && isaretle.includes(t.key)) {
            try { await setAppSetting(t.key, JSON.stringify({ ...t, durum: 'gib_dolduruldu' })) } catch { /* liste yenilenir */ }
          }
        }
      }
      await taslaklariYukle()
      setMesaj({
        tip: okHepsi ? 'ok' : 'hata',
        metin: (okHepsi ? (sonucNot || `${isaretle.length}/${liste.length} fatura GİB ekranına dolduruldu.`) : (sonucNot || 'GİB doldurma tamamlanamadı.')) +
          (isaretle.length && !okHepsi ? ` (${isaretle.length} fatura dolduruldu)` : '')
      })
      // 2.7.395: Tek fatura form gonderiminde formu temizle; admin arayuzunde
      // ikinci fatura hemen kesilebilsin (sayfa yenilenmis gibi).
      if (okHepsi && liste.length === 1) {
        setTimeout(() => temizle(), 0)
      }
    } catch (e) {
      const neden = e?.name === 'TimeoutError' || e?.message?.includes('timeout')
        ? 'yardımcı program yanıt vermedi (pencereyi kontrol edin)'
        : (e?.message || 'bilinmeyen hata')
      setMesaj({ tip: 'hata', metin: 'GİB gönderimi başlatılamadı: ' + neden })
    } finally {
      setGibGonderim(null)
      setKaydediliyor(false)
    }
  }

  // Form uzerindeki "Kaydet & GIB'e Gonder": once taslak, sonra gonderim
  const gibeGonder = async () => {
    const key = await taslakKaydet('gib_bekliyor')
    if (!key) return
    // e-Imza yolunda e-Fatura da desteklenir (imzalama araci girisi);
    // sifre yolunda su an yalnizca e-Arsiv.
    if (tur !== 'earsiv' && tur !== 'efatura' && tur !== 'esmm') {
      setMesaj({
        tip: 'ok',
        metin: `${TUR_ETIKET[tur]} taslağı kaydedildi ve GİB gönderim kuyruğuna alındı. GİB otomatik doldurma bu tür için henüz aktif değil.`
      })
      return
    }
    const payload = {
      key, tur, durum: 'gib_bekliyor', olusturma: new Date().toISOString(),
      client_id: efektifClientId,
      fatura: { ...form, kalemler: form.kalemler.map(k => { const h = satirHesap(k); return { ...k, matrah: h.matrah, kdvTutar: h.kdv } }) },
      toplamlar
    }
    // e-Imza: once "e-imza'yi bilgisayara takin" uyarisi; TAMAM ile akis
    if (eimzaYolu) { setEimzaUyari([payload]); return }
    await gibGonderTaslaklar([payload])
  }

  // Taslaktan gonderim (kayitli taslak listesi)
  const gibTaslakGonder = (t) => {
    if (t.tur !== 'earsiv' && t.tur !== 'efatura' && t.tur !== 'esmm') {
      setMesaj({ tip: 'hata', metin: 'GİB otomatik doldurma şu an e-Arşiv, (e-imza ile) e-Fatura ve (e-imza ile) e-SMM makbuzları için aktif.' })
      return
    }
    if (eimzaYolu) { setEimzaUyari([t]); return }
    gibGonderTaslaklar([t])
  }

  // e-Imza uyarisi TAMAM: imzalama aracini baslatip GIB doldurma akisini
  // yardimci programa devret (popup kapanir, yardimci penceresi acilir).
  const eimzaUyariTamam = () => {
    const liste = eimzaUyari || []
    setEimzaUyari(null)
    if (liste.length) gibGonderTaslaklar(liste)
  }

  // Kullanici GIB'de (Olustur)'a basti -> siradaki faturaya gec.
  // 2.7.264: Devam Et'e basildiginda o anki fatura doldurulmus sayilir —
  // sayaç artar (banner "1/4" tarzı sırayı gösterir).
  const gibDevam = async () => {
    setGibGonderim(g => g ? { ...g, tamam: Math.min((g.tamam || 0) + 1, g.toplam) } : g)
    await gibYardimciDevamEt()
  }
  // Kullanici gonderimi iptal etti
  const gibIptalEt = async () => { await gibYardimciIptal() }

  const taslakAc = (t) => {
    if (!t.fatura) return
    setTur(t.tur || 'earsiv')
    // Eski taslaklarda vergiler fatura seviyesindeydi -> ilk kaleme tasinir
    // (yeni model: vergiler her kaleme ozel k.vergiler)
    const eskiVergiler = t.fatura.vergiler || []
    const kalemler = (t.fatura.kalemler?.length ? t.fatura.kalemler : [bosKalem()])
      .map((k, ix) => ({ ...bosKalem(), ...k, vergiler: k.vergiler || (ix === 0 ? eskiVergiler : []) }))
    setForm({
      ...bosForm(),
      ...t.fatura,
      kalemler,
      vergiler: [],
      // 2.7.352: Eski taslaklarda il/ilce alanlari farkli isimlerde
      // (il/ilce) olabilir; yeni aliciIl/aliciIlce ezilmesin.
      aliciIl: t.fatura.aliciIl || t.fatura.il || '',
      aliciIlce: t.fatura.aliciIlce || t.fatura.ilce || ''
    })
    setMesaj({ tip: 'ok', metin: `Taslak yüklendi (${new Date(t.olusturma || '').toLocaleString('tr-TR')}) — düzeltme modu: Kaydet aynı taslağın üzerine yazar.` })
    setDuzeltmeKey(t.key)
  }

  const taslakSil = async (t) => {
    try { await deleteAppSetting(t.key); await taslaklariYukle() } catch { /* yoksay */ }
  }

  const temizle = () => { setForm(bosForm()); setMesaj(null); setSicilNotu(null); setMukellefNotu(null); setDuzeltmeKey(null); sonSorgulanan.current = '' }

  const cls = "bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400 w-full"

  return (
    <div className="space-y-6">
      {baslik && <h3 className="text-xl font-semibold text-white">{baslik}</h3>}

      {/* Tur secici (birden fazla hizmet aktifse) */}
      {turs.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {turs.map(t => (
            <button key={t} onClick={() => setTur(t)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tur === t ? 'bg-yellow-400 text-blue-950 shadow-lg shadow-yellow-500/30' : 'bg-blue-900/40 text-blue-200 hover:bg-blue-800/60'}`}>
              {TUR_ETIKET[t]}
            </button>
          ))}
        </div>
      )}

      {/* Admin modunda musteri secici */}
      {!clientId && (
        <div className="bg-blue-950/40 rounded-2xl p-4 border border-blue-800/30">
          <label className="text-blue-300 text-xs font-medium mb-1.5 block">Müşteri</label>
          <select value={secilenClient} onChange={(e) => { setSecilenClient(e.target.value); setMesaj(null) }} className={cls}>
            <option value="">Müşteri seçin...</option>
            {clients.slice().sort((a, b) => (a.name || a.ad || a.isim || '').localeCompare(b.name || b.ad || b.isim || '', 'tr')).map(c => <option key={c.id} value={c.id}>{c.name || c.ad || c.isim || c.id}</option>)}
          </select>
        </div>
      )}

      {mesaj && (
        <div className={`rounded-xl px-4 py-3 text-sm border ${mesaj.tip === 'hata' ? 'bg-red-500/10 border-red-500/40 text-red-300' : 'bg-green-500/10 border-green-500/40 text-green-300'}`}>
          {mesaj.metin}
        </div>
      )}

      {gibGonderim?.aktif && (
        <div className="rounded-xl px-4 py-3 text-sm border bg-yellow-400/10 border-yellow-400/40 text-yellow-200 flex flex-col md:flex-row md:items-center justify-between gap-2">
          <span>
            {gibAsama?.asama === 'dolduruluyor' ? (
              <>
                <b>Fatura {gibAsama.sira || Math.min((gibGonderim.tamam || 0) + 1, gibGonderim.toplam)}/{gibAsama.toplam || gibGonderim.toplam}</b>{' '}
                {gibAsama.isim ? <>(<b>{gibAsama.isim}</b>) </> : null}
                dolduruluyor — GİB ekranı hazırlanıyor, lütfen bekleyin...
              </>
            ) : gibAsama?.asama === 'onay-bekliyor' ? (
              <>
                <b>Fatura {gibAsama.sira || Math.min((gibGonderim.tamam || 0) + 1, gibGonderim.toplam)}/{gibAsama.toplam || gibGonderim.toplam}</b>{' '}
                {gibAsama.isim ? <>(<b>{gibAsama.isim}</b>) </> : null}
                dolduruldu — <b>onayınız bekliyor.</b> GİB ekranında <b>(Oluştur)</b>'a bastıktan sonra <b>Devam Et</b>'e basın; göndermek istemezseniz <b>İptal</b>'e basın.
              </>
            ) : (
              <>
                GİB gönderimi sürüyor — <b>{gibGonderim.toplam} fatura</b> sırayla doldurulacak.{' '}
                <b>Fatura {Math.min((gibGonderim.tamam || 0) + 1, gibGonderim.toplam)}/{gibGonderim.toplam}</b>{' '}
                {gibGonderim.isimler?.[Math.min((gibGonderim.tamam || 0), (gibGonderim.isimler?.length || 1) - 1)]
                  ? <>(<b>{gibGonderim.isimler[Math.min((gibGonderim.tamam || 0), gibGonderim.isimler.length - 1)]}</b>) </> : null}
                {gibGonderim.tamam > 0 && <>— {gibGonderim.tamam}/{gibGonderim.toplam} dolduruldu </>}
                — GİB ekranında (Oluştur)'a bastıktan sonra <b>Devam Et</b>'e basın; göndermek istemezseniz <b>İptal</b>'e basın.
              </>
            )}
          </span>
          <span className="flex gap-2 shrink-0">
            <button type="button" onClick={gibDevam} disabled={(gibGonderim.tamam || 0) >= gibGonderim.toplam}
              className="px-4 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-white text-xs font-bold disabled:opacity-40">Devam Et</button>
            <button type="button" onClick={gibIptalEt}
              className="px-4 py-1.5 rounded-lg bg-red-500/80 hover:bg-red-500 text-white text-xs font-bold">İptal</button>
          </span>
        </div>
      )}

      {/* 2.7.383: e-SMM siradaki makbuz onayi — window.confirm tarayici
          tarafindan engellenebildigi icin uygulama ici modal kullanilir */}
      {esmmDevamSorusu && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-blue-950 border border-blue-700 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h4 className="text-white font-bold text-base">Makbuz dolduruldu — sıradakine geçilsin mi?</h4>
            <p className="text-blue-200 text-sm">
              <b className="text-white">{esmmDevamSorusu.ad}</b> makbuzu GİB ekranına dolduruldu.<br />
              GİB'de <b>(Oluştur)</b>'a basıp imzalayın; imza tamamlandıktan sonra
              <b> Sıradakine Geç</b>'e basın — sonraki makbuz doldurulacak.
            </p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => esmmDevamiYanitla(false)}
                className="px-4 py-2 rounded-lg bg-red-500/80 hover:bg-red-500 text-white text-xs font-bold">Durdur</button>
              <button type="button" onClick={() => esmmDevamiYanitla(true)}
                className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-white text-xs font-bold">Sıradakine Geç</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h4 className="text-lg font-semibold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-yellow-400" />
            {tur === 'esmm' ? 'e-SMM Makbuz Kesimi' : `${TUR_ETIKET[tur]} Fatura Kesimi`}
          </h4>
          {/* Sag ust rozet — sayfa ust barinda, ? ve zil dugmelerinin solunda; sayfayla birlikte kayar */}
          {tur === 'earsiv' && (
            <div className="absolute top-4 right-40 z-40">
              <button
                onClick={() => setMfaturaAcik(!mfaturaAcik)}
                className="flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-full bg-gradient-to-br from-blue-800 to-blue-950 border border-yellow-500/40 shadow-lg shadow-black/40 hover:border-yellow-400 transition-colors"
              >
                <span className="w-8 h-8 rounded-full bg-yellow-400 text-blue-950 flex items-center justify-center flex-shrink-0">
                  <Smartphone className="w-4 h-4" />
                </span>
                <span className="text-left leading-tight">
                  <b className="block text-yellow-400 text-xs font-bold">Cep Telefonundan Ücretsiz Fatura</b>
                  <span className="block text-blue-200 text-[11px]">App Store &amp; Google Play</span>
                </span>
                <ChevronDown className={`w-4 h-4 text-yellow-400 transition-transform ${mfaturaAcik ? 'rotate-180' : ''}`} />
              </button>
              {mfaturaAcik && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-gradient-to-b from-blue-900 to-blue-950 border border-yellow-500/40 rounded-2xl p-4 shadow-2xl shadow-black/50 z-30">
                  <p className="text-gray-300 text-xs leading-relaxed">
                    Uygulamayı indirip üye olarak cep telefonunuzdan <b className="text-yellow-400">ücretsiz</b> olarak e-Arşiv faturalarınızı kesebilirsiniz.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <a href="https://apps.apple.com/tr/app/mfatura-kolay-fatura/id6749909925" target="_blank" rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-1.5 bg-white text-gray-900 rounded-lg px-2.5 py-2 text-xs font-bold hover:bg-blue-50 transition-colors">
                      <Apple className="w-4 h-4" /> App Store
                    </a>
                    <a href="https://play.google.com/store/apps/details?id=com.ats.mfatura" target="_blank" rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-1.5 bg-white text-gray-900 rounded-lg px-2.5 py-2 text-xs font-bold hover:bg-blue-50 transition-colors">
                      <PlayCircle className="w-4 h-4" /> Google Play
                    </a>
                  </div>
                  <p className="text-gray-500 text-[11px] leading-relaxed mt-2.5">
                    NOT: İlgili uygulamanın bizimle hiçbir bağı yoktur, tavsiye amaçlıdır.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ============ FATURA BILGILERI ============ */}
        <div>
          <p className="text-blue-300 text-xs font-semibold uppercase tracking-wide mb-3">Fatura Bilgileri</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Düzenleme Tarihi *</label>
              <input type="date" value={form.tarih} onChange={e => set('tarih', e.target.value)} className={cls} />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Düzenleme Saati *</label>
              <input type="time" value={form.saat} onChange={e => set('saat', e.target.value)} className={cls} />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Para Birimi *</label>
              <select value={form.paraBirimi} onChange={e => set('paraBirimi', e.target.value)} className={cls}>
                {PARA_BIRIMLERI.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Döviz Kuru</label>
              <input type="number" step="0.0001" min="0" value={form.dovizKuru} onChange={e => set('dovizKuru', e.target.value)} disabled={form.paraBirimi === 'TL'} placeholder={form.paraBirimi === 'TL' ? '—' : '1 TL ='} className={`${cls} disabled:opacity-40`} />
            </div>
            {tur !== 'esmm' && (
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Fatura Tipi</label>
                <select
                  value={FATURA_TIPLERI.includes(form.faturaTipi) ? form.faturaTipi : 'SATIŞ'}
                  onChange={e => {
                    const v = e.target.value
                    if ((v === 'GENEL İADE' || v === 'TEVKİFAT İADE') && !(form.iadeFaturalari || []).length) {
                      setForm(f => ({ ...f, faturaTipi: v, iadeFaturalari: [{ faturaNo: '', faturaTarihi: '' }] }))
                    } else {
                      set('faturaTipi', v)
                    }
                  }} className={cls}>
                  {FATURA_TIPLERI.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* ============ ALICI ============ */}
        <div>
          <p className="text-blue-300 text-xs font-semibold uppercase tracking-wide mb-3 flex items-center gap-2">
            Alıcı
            {sicilAranıyor && <Loader2 className="w-3.5 h-3.5 text-yellow-400 animate-spin" title="GİB'den sorgulanıyor..." />}
          </p>
          {sicilNotu && (
            <div className={`mb-3 rounded-lg px-3 py-2 text-xs border ${sicilNotu.tip === 'ok' ? 'bg-green-500/10 border-green-500/30 text-green-300' : 'bg-yellow-400/10 border-yellow-400/30 text-yellow-300'}`}>
              {sicilNotu.metin}
            </div>
          )}
          {mukellefNotu && (
            <div className={`mb-3 rounded-lg px-3 py-2 text-xs border ${mukellefNotu.tip === 'ok' ? 'bg-green-500/10 border-green-500/30 text-green-300' : 'bg-blue-500/10 border-blue-500/30 text-blue-200'}`}>
              {mukellefNotu.metin}
            </div>
          )}
          {/* Son kullanilan alicilar */}
          {aliciListesi.length > 0 && (
            <div className="mb-3">
              <button type="button" onClick={() => setAliciPanelAcik(a => !a)}
                className="flex items-center gap-1.5 text-xs font-medium text-blue-300 hover:text-yellow-400 transition-colors">
                <Users className="w-3.5 h-3.5" /> Son Kullanılan Alıcılar ({aliciListesi.length})
                {aliciPanelAcik ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
              {aliciPanelAcik && (
                <div className="mt-2 bg-blue-900/30 rounded-xl border border-blue-700/30 p-3">
                  <input value={aliciArama} onChange={e => setAliciArama(e.target.value)} placeholder="Ara: ünvan / ad / VKN-TCKN..." className={`${cls} mb-2`} />
                  <div className="max-h-56 overflow-y-auto divide-y divide-blue-800/20">
                    {filtreliAlicilar.length === 0 ? (
                      <p className="text-gray-500 text-xs py-2">Eşleşen alıcı yok.</p>
                    ) : filtreliAlicilar.map(a => (
                      <button key={a.vknTckn} type="button" onClick={() => aliciSec(a)}
                        className="w-full text-left px-2 py-2 hover:bg-blue-800/40 rounded-lg transition-colors">
                        <span className="text-white text-sm font-medium">{aliciAdi(a)}</span>
                        <span className="text-blue-300 text-xs ml-2">· {a.vknTckn}</span>
                        {a.vergiDairesi && <span className="text-gray-500 text-xs ml-2">· {a.vergiDairesi}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-gray-400 text-xs mb-1 block">VKN / TCKN *</label>
              <input value={form.aliciVknTckn} onChange={e => set('aliciVknTckn', e.target.value.replace(/\D/g, '').substring(0, 11))} placeholder="10 hane VKN / 11 hane TCKN" className={cls} />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Ünvan</label>
              <input value={form.aliciUnvan} onChange={e => set('aliciUnvan', e.target.value)} className={cls} />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Ad</label>
              <input value={form.aliciAd} onChange={e => set('aliciAd', e.target.value)} className={cls} />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Soyad</label>
              <input value={form.aliciSoyad} onChange={e => set('aliciSoyad', e.target.value)} className={cls} />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Vergi Dairesi</label>
              <input value={form.aliciVergiDairesi} onChange={e => set('aliciVergiDairesi', e.target.value)} className={cls} />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Ülke *</label>
              <input value={form.aliciUlke} onChange={e => set('aliciUlke', e.target.value)} className={cls} />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">İl</label>
              <select value={form.aliciIl} onChange={e => { set('aliciIl', e.target.value); set('aliciIlce', '') }} className={cls}>
                <option value="">Seçiniz</option>
                {IL_LISTESI.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">İlçe</label>
              <select value={form.aliciIlce} onChange={e => set('aliciIlce', e.target.value)} disabled={!form.aliciIl} className={`${cls} disabled:opacity-50`}>
                <option value="">Seçiniz</option>
                {ilIlceleri(form.aliciIl).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-gray-400 text-xs mb-1 block">Adres (Bulvar/Cadde/Sokak) *</label>
              <input value={form.aliciAdres} onChange={e => set('aliciAdres', e.target.value)} className={cls} />
            </div>
          </div>
        </div>

        {/* ============ IRSALIYE ============ */}
        <div>
          <p className="text-blue-300 text-xs font-semibold uppercase tracking-wide mb-3">İrsaliye (opsiyonel)</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-gray-400 text-xs mb-1 block">İrsaliye No</label>
              <input value={form.irsaliyeNo} onChange={e => set('irsaliyeNo', e.target.value)} className={cls} />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">İrsaliye Tarihi</label>
              <input type="date" value={form.irsaliyeTarih} onChange={e => set('irsaliyeTarih', e.target.value)} className={cls} />
            </div>
          </div>
        </div>

        {/* ============ IADEYE KONU FATURALAR ============ */}
        {iadeMi && (
          <div>
            <p className="text-blue-300 text-xs font-semibold uppercase tracking-wide mb-3">İadeye Konu Olan Fatura Bilgileri</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 text-xs">
                    <th className="text-left py-2 pr-2 w-10">#</th>
                    <th className="text-left py-2 px-2 min-w-[200px]">Fatura Numarası</th>
                    <th className="text-left py-2 px-2 w-44">Düzenlenme Tarihi</th>
                  </tr>
                </thead>
                <tbody>
                  {(form.iadeFaturalari || []).map((s, i) => (
                    <tr key={i} className="border-t border-blue-800/30">
                      <td className="py-1.5 pr-2 text-gray-500">{i + 1}</td>
                      <td className="py-1.5 px-2"><input value={s.faturaNo} onChange={e => setIade(i, 'faturaNo', e.target.value)} className={cls} /></td>
                      <td className="py-1.5 px-2"><input type="date" value={s.faturaTarihi} onChange={e => setIade(i, 'faturaTarihi', e.target.value)} className={cls} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={iadeSatirEkle} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold transition-colors">
                <Plus className="w-3.5 h-3.5" /> Satır Ekle
              </button>
              <button type="button" onClick={iadeSatirCikar} disabled={(form.iadeFaturalari || []).length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-900/40 hover:bg-blue-800/60 text-blue-200 text-xs font-medium transition-colors disabled:opacity-40">
                <Trash2 className="w-3.5 h-3.5" /> Satır Çıkar
              </button>
            </div>
          </div>
        )}

        {tur === 'esmm' && (
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Açıklamalar</label>
            <input value={form.not} onChange={e => set('not', e.target.value)} placeholder="Açıklama" className={cls} />
          </div>
        )}

        {/* ============ KALEMLER ============ */}
        {tur === 'esmm' ? (
          <div>
            <p className="text-blue-300 text-xs font-semibold uppercase tracking-wide mb-3">Mal/Hizmet Bilgileri</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 text-xs">
                    <th className="text-left py-2 pr-2 min-w-[220px]">Ücretin Ne İçin Alındığı</th>
                    <th className="text-right py-2 px-2 w-32">Brüt Ücret</th>
                    <th className="text-right py-2 px-2 w-28">G.V. Stopajı Oran %</th>
                    <th className="text-right py-2 px-2 w-32">Net Ücret</th>
                    <th className="text-left py-2 px-2 w-24">KDV Oran %</th>
                    <th className="text-right py-2 px-2 w-32">KDV Tevkifat Oranı %</th>
                    <th className="text-right py-2 px-2 w-32">Net Tahsilat</th>
                    <th className="py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {form.kalemler.map((k, i) => {
                    const h = esmmSatirHesap(k)
                    return (
                      <tr key={i} className="border-t border-blue-800/30">
                        <td className="py-1.5 pr-2"><input value={k.ad} onChange={e => setKalem(i, 'ad', e.target.value)} className={cls} /></td>
                        <td className="py-1.5 px-2"><input type="number" min="0" step="0.01" value={k.birimFiyat} onChange={e => setKalem(i, 'birimFiyat', e.target.value)} className={`${cls} text-right`} /></td>
                        <td className="py-1.5 px-2"><input type="number" min="0" max="100" step="0.01" value={k.gvStopajOran} onChange={e => setKalem(i, 'gvStopajOran', e.target.value)} className={`${cls} text-right`} /></td>
                        <td className="py-1.5 px-2 text-right text-blue-100">{fmt(h.netUcret)}</td>
                        <td className="py-1.5 px-2">
                          <select value={k.kdvOran} onChange={e => setKalem(i, 'kdvOran', e.target.value)} className={cls}>
                            {KDV_ORANLARI.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </td>
                        <td className="py-1.5 px-2"><input type="number" min="0" max="100" step="0.01" value={k.kdvTevkifatOran} onChange={e => setKalem(i, 'kdvTevkifatOran', e.target.value)} className={`${cls} text-right`} /></td>
                        <td className="py-1.5 px-2 text-right text-blue-100">{fmt(h.netTahsilat)}</td>
                        <td className="py-1.5">
                          <button type="button" onClick={() => kalemSil(i)} className="text-red-400 hover:text-red-300 p-1" title="Satırı sil">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={kalemEkle} className="mt-3 flex items-center gap-1.5 text-sm text-yellow-400 hover:text-yellow-300 font-medium">
              <Plus className="w-4 h-4" /> Satır Ekle
            </button>
          </div>
        ) : (
        <div>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <p className="text-blue-300 text-xs font-semibold uppercase tracking-wide">Mal / Hizmet Kalemleri</p>
            <div className="flex items-center gap-2">
              <label className="text-gray-400 text-xs">Birim Fiyat:</label>
              <select value={kdvDahil ? 'dahil' : 'haric'} onChange={e => setKdvDahil(e.target.value === 'dahil')} className="text-xs bg-blue-900/40 border border-blue-700/40 rounded-lg px-2 py-1.5 text-blue-100">
                <option value="haric">KDV Hariç</option>
                <option value="dahil">KDV Dahil</option>
              </select>
            </div>
          </div>
          {kdvDahil && (
            <p className="text-yellow-300/80 text-xs mb-2 -mt-1">KDV Dahil seçili: girdiğiniz tutar, satırın KDV oranına göre matraha çevrilerek Birim Fiyat alanına yazılır.</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-xs">
                  <th className="text-left py-2 pr-2 min-w-[220px]">Mal / Hizmet *</th>
                  <th className="text-right py-2 px-2 w-24">Miktar *</th>
                  <th className="text-left py-2 px-2 w-28">Birim *</th>
                  <th className="text-right py-2 px-2 w-32">Birim Fiyat *</th>
                  <th className="text-right py-2 px-2 w-20">İsk. %</th>
                  <th className="text-right py-2 px-2 w-32">İsk. Tutar</th>
                  <th className="text-left py-2 px-2 w-24">KDV %</th>
                  <th className="text-right py-2 px-2 w-32">KDV Tutarı</th>
                  <th className="text-left py-2 px-2 w-32">Vergiler</th>
                  <th className="py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {form.kalemler.map((k, i) => {
                  const h = satirHesap(k)
                  return (
                    <tr key={i} className="border-t border-blue-800/30">
                      <td className="py-1.5 pr-2"><input value={k.ad} onChange={e => setKalem(i, 'ad', e.target.value)} className={cls} /></td>
                      <td className="py-1.5 px-2"><input type="number" min="0" step="0.001" value={k.miktar} onChange={e => setKalem(i, 'miktar', e.target.value)} className={`${cls} text-right`} /></td>
                      <td className="py-1.5 px-2">
                        <select value={k.birim} onChange={e => setKalem(i, 'birim', e.target.value)} className={cls}>
                          {BIRIMLER.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </td>
                      <td className="py-1.5 px-2"><input type="number" min="0" step="0.01" value={kdvDahil ? (k.birimFiyat === '' || k.birimFiyat == null ? '' : Math.round(sayi(k.birimFiyat) * (1 + sayi(k.kdvOran) / 100) * 100) / 100) : k.birimFiyat} onChange={e => setKalemDahil(i, 'birimFiyat', e.target.value)} placeholder={kdvDahil ? 'KDV dahil girin' : ''} className={`${cls} text-right`} /></td>
                      <td className="py-1.5 px-2"><input type="number" min="0" max="100" step="0.01" value={k.iskontoOran} onChange={e => { setKalem(i, 'iskontoOran', e.target.value); setKalem(i, 'iskontoTutar', '') }} className={`${cls} text-right`} /></td>
                      <td className="py-1.5 px-2"><input type="number" min="0" step="0.01" value={k.iskontoTutar} onChange={e => setKalem(i, 'iskontoTutar', e.target.value)} placeholder={h.iskonto ? fmt(h.iskonto) : ''} className={`${cls} text-right`} /></td>
                      <td className="py-1.5 px-2">
                        <select value={k.kdvOran} onChange={e => setKalem(i, 'kdvOran', e.target.value)} className={cls}>
                          {KDV_ORANLARI.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>
                      <td className="py-1.5 px-2 text-right text-blue-100 py-2">{fmt(h.kdv)}</td>
                      <td className="py-1.5 px-2">
                        {(k.vergiler || []).length ? (k.vergiler || []).map((v, vx) => (
                          <span key={vx} className="inline-block mr-1 mb-0.5 px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 text-[10px] whitespace-nowrap">
                            {v.tur === 'KDV TEVKİFAT' ? ('TVKF ' + (v.tevkifatKodu || '')) : v.tur}
                          </span>
                        )) : <span className="text-gray-500 text-xs">—</span>}
                      </td>
                      <td className="py-1.5">
                        <button type="button" onClick={() => kalemSil(i)} className="text-red-400 hover:text-red-300 p-1" title="Satırı sil">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={kalemEkle} className="mt-3 flex items-center gap-1.5 text-sm text-yellow-400 hover:text-yellow-300 font-medium">
            <Plus className="w-4 h-4" /> Satır Ekle
          </button>
        </div>
        )}

        {tur !== 'esmm' && (
        <div>
          <p className="text-blue-300 text-xs font-semibold uppercase tracking-wide mb-3">Vergiler <span className="text-gray-500 normal-case font-normal">— her mal/hizmet satırı için ayrı ayrı</span></p>
          {/* Ekleme satiri */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end mb-3">
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Satır</label>
              <select value={yeniVergi.satir} onChange={e => setYeniVergi(v => ({ ...v, satir: Number(e.target.value) }))} className={cls}>
                {form.kalemler.map((k, ix) => <option key={ix} value={ix}>{(k.ad || 'Kalem ' + (ix + 1)).slice(0, 32)}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-gray-400 text-xs mb-1 block">Vergi Türü</label>
              <select value={yeniVergi.tur} onChange={e => setYeniVergi(v => ({ ...v, tur: e.target.value, tevkifatKodu: '', oran: '', tutar: '' }))} className={cls}>
                <option value="">Seçiniz...</option>
                {VERGI_TURLERI.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {yeniVergi.tur === 'KDV TEVKİFAT' ? (
              <div className="md:col-span-2">
                <label className="text-gray-400 text-xs mb-1 block">Tevkifat Kodu</label>
                <select value={yeniVergi.tevkifatKodu} onChange={e => setYeniVergi(v => ({ ...v, tevkifatKodu: e.target.value, oran: '', tutar: '' }))} className={cls}>
                  <option value="">Seçiniz...</option>
                  {TEVKIFAT_KODLARI.map(k => <option key={k.kod} value={k.kod}>{k.kod} - {k.ad}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Oran (%)</label>
                <input type="number" min="0" step="0.01" value={yeniVergi.oran} onChange={e => setYeniVergi(v => ({ ...v, oran: e.target.value, tutar: '' }))} className={`${cls} text-right`} />
              </div>
            )}
            <div className="flex gap-2">
              {yeniVergi.tur && (
                <div className="flex-1">
                  <label className="text-gray-400 text-xs mb-1 block">Tutar</label>
                  <input type="number" min="0" step="0.01" value={yeniVergi.tutar} onChange={e => setYeniVergi(v => ({ ...v, tutar: e.target.value }))} placeholder={fmt(yeniVergiAutoTutar())} className={`${cls} text-right`} />
                </div>
              )}
              <button type="button" onClick={vergiEkle} disabled={!yeniVergi.tur}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold transition-colors disabled:opacity-40 whitespace-nowrap">
                <Plus className="w-4 h-4" /> Vergi Ekle
              </button>
            </div>
          </div>
          {/* Eklenen vergiler tablosu — tum kalemlerin vergileri satir bazli listelenir */}
          {(() => {
            const satirVergileri = []
            ;(form.kalemler || []).forEach((k, ix) => (k.vergiler || []).forEach((v, vx) => satirVergileri.push({ ix, vx, v, kalemAd: k.ad || ('Kalem ' + (ix + 1)) })))
            if (!satirVergileri.length) return null
            return (
            <div className="overflow-x-auto border border-blue-800/30 rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-blue-900/40 text-gray-300 text-xs">
                    <th className="text-left py-2 px-3">Mal / Hizmet</th>
                    <th className="text-left py-2 px-3">Vergi Türü</th>
                    <th className="text-left py-2 px-3 min-w-[220px]">Tevkifat Kodu</th>
                    <th className="text-right py-2 px-3 w-24">Oran %</th>
                    <th className="text-right py-2 px-3 w-36">Tutar</th>
                    <th className="py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {satirVergileri.map(({ ix, vx, v, kalemAd }) => (
                    <tr key={ix + '-' + vx} className="border-t border-blue-800/30">
                      <td className="py-2 px-3 text-blue-200 text-xs">{kalemAd}</td>
                      <td className="py-2 px-3 text-white">{v.tur}</td>
                      <td className="py-2 px-3 text-blue-200 text-xs">{v.tevkifatKoduAdi || '—'}</td>
                      <td className="py-2 px-3 text-right text-blue-100">{v.oran ? fmt(v.oran) : '—'}</td>
                      <td className="py-2 px-3 text-right text-white">{fmt(v.tutar || 0)}</td>
                      <td className="py-2">
                        <button type="button" onClick={() => vergiSil(ix, vx)} className="text-red-400 hover:text-red-300 p-1" title="Vergiyi sil">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )
          })()}
        </div>
        )}

        {/* ============ TOPLAMLAR + NOT ============ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tur !== 'esmm' && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-gray-400 text-xs">Not</label>
              {isletmeBankalari.length > 0 && (
                <button type="button" onClick={() => setForm(f => ({ ...f, not: bankaMetni(isletmeBankalari) }))}
                  className="text-yellow-400 hover:text-yellow-300 text-xs font-medium">
                  Banka Bilgilerini Yaz
                </button>
              )}
            </div>
            <textarea value={form.not} onChange={e => set('not', e.target.value)} rows="4" className={`${cls} resize-y`} />
          </div>
          )}          <div className="bg-blue-900/30 rounded-xl p-4 border border-blue-700/30 self-start">
            {tur === 'esmm' ? (
              <>
                <div className="flex justify-between py-1 text-sm text-blue-200"><span>Brüt Ücret</span><span className="font-medium text-white">{fmt(esmmToplamlar.brut)}</span></div>
                <div className="flex justify-between py-1 text-sm text-blue-200"><span>(*) G.V. Stopaj Tutarı</span><span className="font-medium text-white">- {fmt(esmmToplamlar.gvStopaj)}</span></div>
                <div className="flex justify-between py-1 text-sm text-blue-200"><span>Net Ücret Tutarı</span><span className="font-medium text-white">{fmt(esmmToplamlar.netUcret)}</span></div>
                <div className="flex justify-between py-1 text-sm text-blue-200"><span>KDV Tutarı</span><span className="font-medium text-white">{fmt(esmmToplamlar.kdv)}</span></div>
                <div className="flex justify-between py-1 text-sm text-yellow-300"><span>(**) KDV Tevkifat Tutarı</span><span className="font-medium">- {fmt(esmmToplamlar.tevkifat)}</span></div>
                <div className="flex justify-between py-1 text-sm text-blue-200"><span>Tahsil Edilen KDV</span><span className="font-medium text-white">{fmt(esmmToplamlar.tahsilEdilenKdv)}</span></div>
                <div className="border-t border-blue-700/50 mt-2 pt-2 flex justify-between text-base font-bold text-yellow-400">
                  <span>Toplam Tahsilat ({form.paraBirimi})</span><span>{fmt(esmmToplamlar.netTahsilat)}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between py-1 text-sm text-blue-200"><span>Toplam İskonto</span><span className="font-medium text-white">- {fmt(toplamlar.iskonto)}</span></div>
                <div className="flex justify-between py-1 text-sm text-blue-200"><span>Toplam Matrah</span><span className="font-medium text-white">{fmt(toplamlar.matrah)}</span></div>
                <div className="flex justify-between py-1 text-sm text-blue-200"><span>Toplam KDV</span><span className="font-medium text-white">{fmt(toplamlar.kdv)}</span></div>
                {toplamlar.tevkifatTutar > 0 && (
                  <div className="flex justify-between py-1 text-sm text-yellow-300"><span>KDV Tevkifatı (Kesilen)</span><span className="font-medium">- {fmt(toplamlar.tevkifatTutar)}</span></div>
                )}
                {toplamlar.digerVergiler > 0 && (
                  <div className="flex justify-between py-1 text-sm text-blue-200"><span>Diğer Vergiler</span><span className="font-medium text-white">{fmt(toplamlar.digerVergiler)}</span></div>
                )}
                <div className="border-t border-blue-700/50 mt-2 pt-2 flex justify-between text-base font-bold text-yellow-400">
                  <span>Genel Toplam ({form.paraBirimi})</span><span>{fmt(toplamlar.genel)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ============ AKSIYONLAR ============ */}
        <div className="flex flex-wrap gap-3 pt-2 border-t border-blue-800/30">
          <button type="button" onClick={() => taslakKaydet('hazir')} disabled={kaydediliyor}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors disabled:opacity-50">
            <Save className="w-4 h-4" /> Taslağı Kaydet
          </button>
          <button type="button" onClick={gibeGonder} disabled={kaydediliyor}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-blue-950 text-sm font-bold transition-colors disabled:opacity-50">
            <Send className="w-4 h-4" /> Kaydet & GİB'e Gönder
          </button>
          <button type="button" onClick={temizle}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-900/40 hover:bg-blue-800/60 text-blue-200 text-sm font-medium transition-colors">
            <Eraser className="w-4 h-4" /> Temizle
          </button>
        </div>
      </div>

      {/* ============ TASLAKLAR ============ */}
      <div className="bg-blue-950/40 rounded-2xl border border-blue-800/30 overflow-hidden">
        <button type="button" onClick={() => setTaslaklarAcik(a => !a)} className="w-full flex items-center justify-between px-6 py-4 hover:bg-blue-900/20 transition-colors">
          <span className="text-white font-semibold flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-300" /> Kayıtlı Taslaklar ({taslaklar.length})
          </span>
          <span className="flex items-center gap-2 text-blue-300 text-sm">
            <RefreshCw className="w-4 h-4" onClick={(e) => { e.stopPropagation(); taslaklariYukle() }} />
            {taslaklarAcik ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </span>
        </button>
        {taslaklarAcik && (
          <div className="px-6 pb-4">
            {taslaklar.filter(t => t.tur === 'earsiv' || t.tur === 'efatura' || t.tur === 'esmm').length >= 2 && (
              <div className="py-3">
                <button type="button" disabled={kaydediliyor || gibGonderim?.aktif}
                  onClick={() => {
                    const secilen = taslaklar.filter(t => t.tur === 'earsiv' || t.tur === 'efatura' || t.tur === 'esmm')
                    if (eimzaYolu) setEimzaUyari(secilen)
                    else gibGonderTaslaklar(secilen)
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-blue-950 text-xs font-bold disabled:opacity-50">
                  <Send className="w-4 h-4" /> Tümünü GİB'e Gönder ({taslaklar.filter(t => t.tur === 'earsiv' || t.tur === 'efatura' || t.tur === 'esmm').length})
                </button>
                <p className="text-blue-300 text-xs mt-1">Sırayla doldurulur; her faturada GİB'de (Oluştur)'a basıp MUBiS'te Devam Et'e basarsınız.</p>
              </div>
            )}
            {taslaklar.length === 0 ? (
              <p className="text-gray-500 text-sm py-3">Henüz taslak kaydedilmedi.</p>
            ) : (
              <div className="divide-y divide-blue-800/20">
                {taslaklar.map(t => (
                  <div key={t.key} className="flex flex-col md:flex-row md:items-center justify-between gap-2 py-3">
                    <div className="text-sm">
                      <span className="text-white font-medium">{t.fatura?.aliciUnvan || [t.fatura?.aliciAd, t.fatura?.aliciSoyad].filter(Boolean).join(' ') || t.fatura?.aliciVknTckn || 'Alıcı belirtilmedi'}</span>
                      <span className="text-blue-300 ml-2">· {TUR_ETIKET[t.tur] || t.tur}</span>
                      <span className="text-gray-500 ml-2">· {(() => { const m = String(t.fatura?.tarih || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]}` : new Date(t.olusturma || '').toLocaleDateString('tr-TR') })()}{t.fatura?.saat ? ` · ${t.fatura.saat}` : ''}</span>
                      {/* e-SMM'de genel toplam yerine Toplam Tahsilat gosterilir
                          (kalemlerde miktar olmadigindan 'genel' hesabi 0 kalir) */}
                      <span className="text-yellow-400 ml-2">· {fmt(t.tur === 'esmm' ? (t.toplamlar?.netTahsilat || 0) : (t.toplamlar?.genel || 0))} {t.fatura?.paraBirimi || 'TL'}</span>
                      {t.durum === 'gib_bekliyor' && <span className="ml-2 px-2 py-0.5 rounded-full bg-yellow-400/20 text-yellow-400 text-xs">GİB kuyrukta</span>}
                      {t.durum === 'gib_dolduruldu' && <span className="ml-2 px-2 py-0.5 rounded-full bg-teal-400/20 text-teal-300 text-xs">GİB'de dolduruldu</span>}
                    </div>
                    <div className="flex gap-2">
                      {(t.tur === 'earsiv' || t.tur === 'efatura' || t.tur === 'esmm') && (
                        <button onClick={() => gibTaslakGonder(t)} disabled={kaydediliyor || gibGonderim?.aktif}
                          className="px-3 py-1.5 rounded-lg bg-yellow-400/20 hover:bg-yellow-400/30 text-yellow-300 text-xs font-semibold disabled:opacity-50">GİB'e Gönder</button>
                      )}
                      <button onClick={() => taslakAc(t)} className="px-3 py-1.5 rounded-lg bg-blue-800/50 hover:bg-blue-700/60 text-blue-100 text-xs font-medium">Yükle</button>
                      <button onClick={() => taslakSil(t)} className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-medium">Sil</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* e-Imza uyarisi: "e-imza'yi bilgisayara takin" — TAMAM ile yardimci
          program imzalama aracini (EFaturaWebSocket.jnlp) baslatir ve GIB
          portal girisini surer. */}
      {eimzaUyari && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-blue-950 border border-yellow-500/40 rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h4 className="text-lg font-bold text-white mb-2">e-İmza gerekli</h4>
            <p className="text-blue-200 text-sm mb-1">
              <span className="font-semibold text-yellow-300">e-imza'yı bilgisayara takın.</span>{' '}
              {eimzaUyari.length} fatura GİB ekranına doldurulacak; giriş için imzalama aracı ve kart şifreniz kullanılacak.
            </p>
            <p className="text-blue-400 text-xs mb-4">
              TAMAM'a bastığınızda GİB imzalama aracı başlatılır; PIN ve imzala adımlarında kart takılı olmalıdır.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEimzaUyari(null)}
                className="px-4 py-2 rounded-xl bg-blue-900/60 hover:bg-blue-800 text-blue-200 text-sm font-medium">İptal</button>
              <button type="button" onClick={eimzaUyariTamam} disabled={kaydediliyor || gibGonderim?.aktif}
                className="px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-blue-950 text-sm font-bold disabled:opacity-50">TAMAM</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
