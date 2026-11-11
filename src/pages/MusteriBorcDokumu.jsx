import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useClients } from '../hooks/useClients'
import { borcDokumuToplu, borcOzetle, borcDetaySatirlari, eskiBorclariSil } from '../services/borcDokumuService'
import { gibBorcSorgula, sgkBorcSorgula, gibLucaSorguDurdur } from '../utils/gibOdemeHelper'
import { openWhatsAppWeb, sendEmail } from '../services/whatsappService'
import {
  AlertTriangle, ArrowUpDown, BadgeCheck, Building2, ChevronDown, ChevronUp,
  Clock, Filter, Landmark, Loader2, MessageCircle, Minus, Plus,
  RefreshCw, Search, Send, Square, Users, Wallet, X
} from 'lucide-react'
import AylikTakvim from '../components/AylikTakvim'
import PlanDilimSatirlari from '../components/PlanDilimSatirlari'
import { dilimleriGunlereBol, dilimNormalize, dilimGecerli } from '../utils/planDilim'

// Sorgu sonucu bu günden eskiyse "güncel borç" sayılmaz. Borç anlık bir
// durumdur; ödenmiş eski bir borç aylar sonra hâlâ "borç" gibi görünmesin.
const VERI_GECERLILIK_GUN = 10

const bugunTR = () => new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })

const tarihSaat = (ts) => {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

const gunEtiket = (ts) => {
  if (!ts) return '—'
  const t = new Date(ts).getTime()
  if (!isFinite(t)) return '—'
  const gun = Math.floor((Date.now() - t) / 86400000)
  if (gun <= 0) return 'Bugün'
  if (gun === 1) return 'Dün'
  return `${gun} gün önce`
}

const paraYaz = (v) => {
  const n = Number(v)
  return (isFinite(n) ? n : 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const sayi = (v) => {
  const n = Number(v)
  return isFinite(n) ? n : 0
}
const musteriAdi = (c) => c?.name || c?.company || c?.shortName || `Müşteri #${c?.id}`

const KPI_RENK = {
  amber: { kart: 'border-amber-500/30 bg-amber-500/[0.07]', ikon: 'bg-amber-500/15 text-amber-300', deger: 'text-amber-200' },
  sky: { kart: 'border-sky-500/30 bg-sky-500/[0.07]', ikon: 'bg-sky-500/15 text-sky-300', deger: 'text-sky-200' },
  violet: { kart: 'border-violet-500/30 bg-violet-500/[0.07]', ikon: 'bg-violet-500/15 text-violet-300', deger: 'text-violet-200' },
  cyan: { kart: 'border-cyan-500/40 bg-cyan-500/[0.09]', ikon: 'bg-cyan-500/15 text-cyan-300', deger: 'text-cyan-200' }
}

const DETAY_RENK = {
  amber: { kutu: 'border-amber-500/25 bg-amber-500/[0.04]', baslik: 'text-amber-300' },
  sky: { kutu: 'border-sky-500/25 bg-sky-500/[0.04]', baslik: 'text-sky-300' },
  violet: { kutu: 'border-violet-500/25 bg-violet-500/[0.04]', baslik: 'text-violet-300' }
}

function KpiKart({ baslik, tutar, alt, ikon: Ikon, renk, soluk = false }) {
  const r = KPI_RENK[renk] || KPI_RENK.cyan
  return (
    <div className={`rounded-2xl border p-3.5 ${soluk ? 'border-blue-800/40 bg-blue-900/20' : r.kart}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{baslik}</span>
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${soluk ? 'bg-blue-800/40 text-gray-500' : r.ikon}`}>
          <Ikon className="w-3.5 h-3.5" />
        </span>
      </div>
      <div className={`mt-2 text-base font-semibold tabular-nums ${soluk ? 'text-gray-500' : r.deger}`}>{tutar}</div>
      <div className="text-[11px] text-gray-500 mt-0.5 truncate">{alt}</div>
    </div>
  )
}

function DetayKutu({ baslik, tutar, satirlar, ts, renk = 'sky', bos = false }) {
  const r = DETAY_RENK[renk] || DETAY_RENK.sky
  if (bos) {
    return (
      <div className="rounded-xl border border-dashed border-blue-700/40 bg-blue-950/20 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{baslik}</div>
        <div className="text-xs text-gray-500 mt-2">Kayıt yok — canlı sorgu yapabilirsiniz.</div>
      </div>
    )
  }
  return (
    <div className={`rounded-xl border p-3 ${r.kutu}`}>
      <div className="flex items-center justify-between gap-2">
        <div className={`text-[11px] font-semibold uppercase tracking-wider ${r.baslik}`}>{baslik}</div>
        <div className="text-xs font-semibold text-white tabular-nums">{paraYaz(tutar)} TL</div>
      </div>
      <div className="mt-2 space-y-1">
        {(satirlar || []).map((d, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-gray-400">{d.etiket}</span>
            <span className="text-gray-200 tabular-nums">{paraYaz(d.deger)} TL</span>
          </div>
        ))}
      </div>
      <div className="mt-2 pt-2 border-t border-white/5 text-[10px] text-gray-500">Sorgu: {tarihSaat(ts)}</div>
    </div>
  )
}

// 2.8.320: Bir dilim birden fazla gün taşıyorsa (gunler_ay: [18, 27, 30])
// her günü ayrı satıra böl; böylece tüm günler görünür ve düzenlemede silinmez.
// Haftalık dilimler tek satır olarak kalır. (Ortak util: utils/planDilim.js)

function borcMesaji(client, sgk, vergi, muhasebe = null) {
  const ad = client?.company || client?.name || 'Değerli Müşterimiz'
  const tarih = bugunTR()
  const satirlar = [
    `*Konu: ${tarih} Tarihli Borç Bilgilendirmesi*`,
    '',
    `Sayın ${ad},`,
    '',
    `${tarih} tarihi itibarıyla sistemimizde kayıtlı borç durumunuz aşağıdaki gibidir:`
  ]

  if (sgk) {
    const detay = borcDetaySatirlari(sgk)
    const gecmis = sayi(detay[0]?.deger)
    const guncel = sayi(detay[1]?.deger)
    const toplam = sayi(sgk.toplam) || (gecmis + guncel)
    satirlar.push('', '*SGK borcu*', `- Geçmiş dönem: ${paraYaz(gecmis)} TL`, `- Güncel dönem: ${paraYaz(guncel)} TL`, `- *Toplam: ${paraYaz(toplam)} TL*`)
  }
  if (vergi) {
    const detay = borcDetaySatirlari(vergi)
    const gecmis = sayi(detay[0]?.deger)
    const guncel = sayi(detay[1]?.deger)
    const toplam = sayi(vergi.toplam) || (gecmis + guncel)
    satirlar.push('', '*Vergi borcu*', `- Geçmiş dönem: ${paraYaz(gecmis)} TL`, `- Güncel dönem: ${paraYaz(guncel)} TL`, `- *Toplam: ${paraYaz(toplam)} TL*`)
  }

  if (muhasebe && sayi(muhasebe.kalanBorc) > 0) {
    const toplam = sayi(muhasebe.kalanBorc)
    const gecmis = sayi(muhasebe.gecmisDonem)
    const guncel = sayi(muhasebe.guncelDonem ?? (toplam - gecmis))
    satirlar.push('', '*Muhasebe borcu*', `- Geçmiş dönem: ${paraYaz(gecmis)} TL`, `- Güncel dönem: ${paraYaz(guncel)} TL`, `- *Toplam: ${paraYaz(toplam)} TL*`)
  }

  satirlar.push(
    '',
    'Olası gecikme ve yasal yaptırımlarla karşılaşmamak için vadesi gelen ödemelerinizi zamanında yapmanızı rica ederiz. Borç bilgilerinizle ilgili sorularınız için bizimle iletişime geçebilirsiniz.',
    '',
    'Saygılarımızla,',
    '*SMMM Aziz Koray Çilekci*',
    '_MUBiS Borç Takip Sistemi_',
    '',
    '_Bu mesaj MUBiS Borç Takip Sistemi tarafından otomatik olarak gönderilmiştir._'
  )
  return satirlar.join('\n')
}

function telefonlar(client) {
  const liste = []
  if (client?.phone) liste.push(client.phone)
  if (Array.isArray(client?.phonenumbers)) {
    client.phonenumbers.forEach(pn => {
      const tel = typeof pn === 'string' ? pn : pn?.phone
      if (tel && !liste.includes(tel)) liste.push(tel)
    })
  }
  return liste.filter(Boolean)
}

function epostalar(client) {
  const liste = []
  if (client?.email) liste.push(client.email)
  if (Array.isArray(client?.emails)) {
    client.emails.forEach(em => {
      const adres = typeof em === 'string' ? em : em?.email
      if (adres && !liste.includes(adres)) liste.push(adres)
    })
  }
  return liste.filter(Boolean)
}

export default function MusteriBorcDokumu() {
  const { clients } = useClients()

  const [kapsam, setKapsam] = useState('tum') // 'tum' | 'tek'
  const [seciliId, setSeciliId] = useState('')
  const [tip, setTip] = useState('hepsi') // 'hepsi' | 'sgk' | 'vergi'
  const [arama, setArama] = useState('')
  const [siralama, setSiralama] = useState('ad')
  const [kayitlar, setKayitlar] = useState([])
  const [eskiKayitlar, setEskiKayitlar] = useState([])
  const [eskiAcik, setEskiAcik] = useState(false)
  const [silinenAdet, setSilinenAdet] = useState(0)
  const [muhasebeBorc, setMuhasebeBorc] = useState({})
  const [muhasebeDahil, setMuhasebeDahil] = useState(false)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [sorguYukleniyor, setSorguYukleniyor] = useState(false)
  const [sorguMesaj, setSorguMesaj] = useState('')
  const [sorguIlerleme, setSorguIlerleme] = useState(null)
  const [hata, setHata] = useState('')
  const [acik, setAcik] = useState(() => new Set())
  const sorguIptalRef = useRef(false)

  const [kanal, setKanal] = useState('whatsapp') // 'whatsapp' | 'email' | 'ikisi'
  const [secili, setSecili] = useState(() => new Set())
  const [gonderenId, setGonderenId] = useState(null)
  const [topluGonderiyor, setTopluGonderiyor] = useState(false)
  const [gonderimSonuc, setGonderimSonuc] = useState('')

  // Otomatik borç bildirimi planı (aylık takvimden seçilen günler)
  const [plan, setPlan] = useState({ aktif: false, gunler: [1], saat: '10:00', kanal: 'whatsapp', muhasebeDahil: false })
  const [planAcik, setPlanAcik] = useState(false)
  const [planKaydediyor, setPlanKaydediyor] = useState(false)
  const [planMesaj, setPlanMesaj] = useState('')
  const [takvimAy, setTakvimAy] = useState(() => {
    const d = new Date()
    return { yil: d.getFullYear(), ay: d.getMonth() }
  })

  // Otomatik borç SORGULAMA planı (Ayarlar ile senkron)
  const [sorguAcik, setSorguAcik] = useState(false)
  const [borcPlan, setBorcPlan] = useState({
    aktif: false,
    gunler_ay: [],
    saat: '06:00',
    turlar: ['sgk', 'vergi'],
    turlar_zamanlar: {
      sgk: [{ gunler_ay: [], saat: '06:00' }],
      vergi: [{ gunler_ay: [], saat: '06:00' }]
    },
    musteriler: []
  })
  const [borcPlanKaydediyor, setBorcPlanKaydediyor] = useState(false)
  const [borcPlanMesaj, setBorcPlanMesaj] = useState('')
  const [musteriMod, setMusteriMod] = useState('tum')
  const [musteriSecili, setMusteriSecili] = useState(() => new Set())

  const borcDilimEkle = (tur) => setBorcPlan(prev => {
    const tz = { ...(prev.turlar_zamanlar || {}) }
    const bugun = Math.min(31, Math.max(1, new Date().getDate()))
    tz[tur] = [...(tz[tur] || []), { gunler_ay: [bugun], saat: '06:00' }]
    return { ...prev, turlar_zamanlar: tz, turlar: Object.keys(tz) }
  })
  const borcDilimSil = (tur, idx) => setBorcPlan(prev => {
    const tz = { ...(prev.turlar_zamanlar || {}) }
    const liste = (tz[tur] || []).filter((_, i) => i !== idx)
    if (liste.length) tz[tur] = liste
    else delete tz[tur]
    return { ...prev, turlar_zamanlar: tz, turlar: Object.keys(tz) }
  })
  const borcDilimGuncelle = (tur, idx, yeni) => setBorcPlan(prev => {
    const tz = { ...(prev.turlar_zamanlar || {}) }
    tz[tur] = (tz[tur] || []).map((z, i) => i === idx ? { ...z, ...yeni } : z)
    return { ...prev, turlar_zamanlar: tz }
  })

  const siraliMusteriler = useMemo(
    () => [...(clients || [])].sort((a, b) => musteriAdi(a).localeCompare(musteriAdi(b), 'tr')),
    [clients]
  )

  const hedefMusteriler = useMemo(() => {
    if (kapsam === 'tek') return siraliMusteriler.filter(c => String(c.id) === String(seciliId))
    return siraliMusteriler
  }, [kapsam, seciliId, siraliMusteriler])

  const yukle = async () => {
    if (!hedefMusteriler.length) { setKayitlar([]); setEskiKayitlar([]); return }
    setYukleniyor(true)
    setHata('')
    try {
      const silinen = await eskiBorclariSil(VERI_GECERLILIK_GUN)
      if (silinen > 0) setSilinenAdet(silinen)
    } catch { /* yoksay */ }
    try {
      const ids = hedefMusteriler.map(c => c.id)
      const veri = await borcDokumuToplu({ clientIds: ids, yil: null, ay: null, tip })
      const ozet = borcOzetle(veri)
      const simdi = Date.now()
      const guncel = []
      const eski = []
      for (const k of ozet) {
        const ts = k?.sorgu_ts ? new Date(k.sorgu_ts).getTime() : 0
        const yasGun = ts ? (simdi - ts) / 86400000 : Infinity
        if (yasGun <= VERI_GECERLILIK_GUN) guncel.push(k)
        else eski.push({ ...k, _yasGun: Math.floor(yasGun) })
      }
      setKayitlar(guncel)
      setEskiKayitlar(eski)

      // Muhasebe (mesleki ücret) borçları — ayrı tablodan
      try {
        const { getAccountingFee, getPayments, hesaplaBorcOzeti } = await import('../services/paymentService')
        const harita = {}
        await Promise.all(hedefMusteriler.map(async (c) => {
          try {
            const fee = await getAccountingFee(c.id)
            if (!fee) return
            const odemeler = await getPayments(c.id)
            const oz = hesaplaBorcOzeti(fee, odemeler)
            if (sayi(oz?.kalanBorc) > 0) harita[String(c.id)] = oz
          } catch { /* yoksay */ }
        }))
        setMuhasebeBorc(harita)
      } catch { setMuhasebeBorc({}) }
    } catch (e) {
      setHata(e?.message || 'Borç dökümü yüklenemedi')
    } finally {
      setYukleniyor(false)
    }
  }

  useEffect(() => { yukle() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [kapsam, seciliId, tip, clients?.length])

  // Müşteri -> kayıtları (sgk + vergi + muhasebe borcu)
  const liste = useMemo(() => {
    const gruplar = new Map()
    for (const k of kayitlar) {
      const key = String(k.client_id)
      if (!gruplar.has(key)) {
        const client = hedefMusteriler.find(c => String(c.id) === key) || { id: k.client_id, name: `Müşteri #${k.client_id}` }
        gruplar.set(key, { client, sgk: null, vergi: null })
      }
      const g = gruplar.get(key)
      if (k.tip === 'sgk') g.sgk = k
      else if (k.tip === 'vergi') g.vergi = k
    }
    for (const c of hedefMusteriler) {
      const key = String(c.id)
      if (sayi(muhasebeBorc[key]?.kalanBorc) > 0 && !gruplar.has(key)) {
        gruplar.set(key, { client: c, sgk: null, vergi: null })
      }
    }
    return [...gruplar.values()]
  }, [kayitlar, hedefMusteriler, muhasebeBorc])

  const grupToplam = (g) => sayi(g.sgk?.toplam) + sayi(g.vergi?.toplam) + (muhasebeDahil ? sayi(muhasebeBorc[String(g.client.id)]?.kalanBorc) : 0)

  const filtreliListe = useMemo(() => {
    const metin = arama.trim().toLocaleLowerCase('tr')
    const filtre = metin
      ? liste.filter(({ client }) => {
          const alanlar = [musteriAdi(client), client?.vkn, client?.tc, client?.short_name]
          return alanlar.some(v => String(v || '').toLocaleLowerCase('tr').includes(metin))
        })
      : liste
    const kopya = [...filtre]
    if (siralama === 'ad') {
      kopya.sort((a, b) => musteriAdi(a.client).localeCompare(musteriAdi(b.client), 'tr'))
    } else if (siralama === 'toplam') {
      const net = (g) => sayi(g.sgk?.toplam) + sayi(g.vergi?.toplam) + (muhasebeDahil ? sayi(muhasebeBorc[String(g.client.id)]?.kalanBorc) : 0)
      kopya.sort((a, b) => net(b) - net(a))
    } else if (siralama === 'sgk') {
      kopya.sort((a, b) => sayi(b.sgk?.toplam) - sayi(a.sgk?.toplam))
    } else if (siralama === 'vergi') {
      kopya.sort((a, b) => sayi(b.vergi?.toplam) - sayi(a.vergi?.toplam))
    } else if (siralama === 'muhasebe') {
      kopya.sort((a, b) => sayi(muhasebeBorc[String(b.client.id)]?.kalanBorc) - sayi(muhasebeBorc[String(a.client.id)]?.kalanBorc))
    }
    return kopya
  }, [liste, arama, siralama, muhasebeDahil, muhasebeBorc])

  const toplamlar = useMemo(() => filtreliListe.reduce((t, g) => {
    const s = sayi(g.sgk?.toplam)
    const v = sayi(g.vergi?.toplam)
    const m = muhasebeDahil ? sayi(muhasebeBorc[String(g.client.id)]?.kalanBorc) : 0
    return {
      sgk: t.sgk + s,
      vergi: t.vergi + v,
      muhasebe: t.muhasebe + m,
      toplam: t.toplam + s + v + m,
      sgkAdet: t.sgkAdet + (s > 0 ? 1 : 0),
      vergiAdet: t.vergiAdet + (v > 0 ? 1 : 0),
      muhasebeAdet: t.muhasebeAdet + (m > 0 ? 1 : 0)
    }
  }, { sgk: 0, vergi: 0, muhasebe: 0, toplam: 0, sgkAdet: 0, vergiAdet: 0, muhasebeAdet: 0 }), [filtreliListe, muhasebeBorc, muhasebeDahil])

  const sonGuncelleme = useMemo(() => {
    let son = 0
    for (const g of liste) {
      for (const ts of [g.sgk?.sorgu_ts, g.vergi?.sorgu_ts]) {
        const t = ts ? new Date(ts).getTime() : 0
        if (t > son) son = t
      }
    }
    return son ? tarihSaat(son) : '—'
  }, [liste])

  const grupSonTs = (g) => {
    let son = 0
    for (const ts of [g.sgk?.sorgu_ts, g.vergi?.sorgu_ts]) {
      const t = ts ? new Date(ts).getTime() : 0
      if (t > son) son = t
    }
    return son
  }

  const detayAc = (id) => {
    setAcik(prev => {
      const yeni = new Set(prev)
      if (yeni.has(id)) yeni.delete(id); else yeni.add(id)
      return yeni
    })
  }

  const secimDegistir = (id) => {
    setSecili(prev => {
      const yeni = new Set(prev)
      if (yeni.has(id)) yeni.delete(id); else yeni.add(id)
      return yeni
    })
  }

  const tumunuSec = () => {
    setSecili(prev => {
      const yeni = new Set(prev)
      const hepsi = filtreliListe.length > 0 && filtreliListe.every(g => yeni.has(String(g.client.id)))
      filtreliListe.forEach(g => {
        const id = String(g.client.id)
        if (hepsi) yeni.delete(id); else yeni.add(id)
      })
      return yeni
    })
  }

  const kanalGonder = async (seciliKanal, client, mesaj) => {
    const yapilan = []
    const hatalar = []
    // 2.8.320: "Tercih" -> müşterinin iletişim bilgilerindeki Tahakkuk Gönderim
    // Şekli (whatsapp / mail / ikisi / yok) neyse ona göre gönderilir.
    let hedef = seciliKanal
    if (seciliKanal === 'tercih') {
      const tercih = (client?.beyanDurumlari || client?.beyan_durumlari || {})?.tahakkukGonderim || 'whatsapp'
      if (tercih === 'yok') return 'gönderim tercihi yok'
      hedef = tercih === 'mail' ? 'email' : tercih === 'ikisi' ? 'ikisi' : 'whatsapp'
    }
    const secili = hedef

    if (secili === 'whatsapp' || secili === 'ikisi') {
      const tel = telefonlar(client)
      if (!tel.length) {
        if (secili === 'whatsapp') throw new Error('Telefon numarası yok')
        hatalar.push('telefon yok')
      } else {
        const durumlar = []
        for (const t of tel) {
          const r = await openWhatsAppWeb({ phone: t, message: mesaj })
          if (r?.ok === false) {
            const msg = r?.not || r?.reason || 'WhatsApp gönderilemedi'
            if (secili === 'whatsapp') throw new Error(msg)
            hatalar.push(msg)
            durumlar.push(`${t}: ${msg}`)
          } else {
            const detay = r?.otomatik
              ? `otomatik gönderildi (${r?.kaynak || 'VPS'})`
              : (r?.sekmeAcildi
                ? 'hazır mesaj açıldı — GÖNDER tuşuna siz basın'
                : (r?.not || 'mesaj açıldı'))
            durumlar.push(`${t}: ${detay}`)
          }
        }
        yapilan.push(`WhatsApp (${tel.length})`)
        yapilan._whatsappDetay = durumlar.join(' | ')
      }
    }

    if (secili === 'email' || secili === 'ikisi') {
      const adresler = epostalar(client)
      if (!adresler.length) {
        if (secili === 'email') throw new Error('E-posta adresi yok')
        hatalar.push('e-posta yok')
      } else {
        for (const to of adresler) {
          await sendEmail({
            toEmail: to,
            toName: musteriAdi(client),
            subject: `${bugunTR()} Tarihli Borç Bilgilendirmesi - MUBiS`,
            message: mesaj,
            clientId: client.id
          })
        }
        yapilan.push(`e-posta (${adresler.length})`)
      }
    }

    if (!yapilan.length) throw new Error(hatalar.join(', ') || 'Gönderim yapılamadı')
    const ozet = yapilan.join(' + ')
    const detay = yapilan._whatsappDetay
    return detay ? `${ozet} — ${detay}` : ozet
  }

  const kanalEtiket = (k) => k === 'tercih' ? 'Müşteri tercihi' : k === 'email' ? 'E-posta' : k === 'ikisi' ? 'WhatsApp + E-posta' : 'WhatsApp'

  // Tek müşteriye gönderim
  const gonderTek = async (grup) => {
    const { client, sgk, vergi } = grup
    const mesaj = borcMesaji(client, sgk, vergi, muhasebeDahil ? muhasebeBorc[String(client.id)] : null)
    const toplam = sayi(sgk?.toplam) + sayi(vergi?.toplam) + sayi(muhasebeDahil ? muhasebeBorc[String(client.id)]?.kalanBorc : 0)
    if (!(toplam > 0)) { setGonderimSonuc(`${musteriAdi(client)}: borç yok, gönderilmedi.`); return }
    setGonderenId(String(client.id))
    setGonderimSonuc('')
    try {
      const ozet = await kanalGonder(kanal, client, mesaj)
      setGonderimSonuc(`${musteriAdi(client)}: ${ozet === 'gönderim tercihi yok' ? 'gönderim tercihi "yok" olduğu için gönderilmedi.' : `gönderildi — ${ozet}.`}`)
    } catch (e) {
      setGonderimSonuc(`${musteriAdi(client)}: ${e?.message || 'gönderilemedi'}`)
    } finally {
      setGonderenId(null)
    }
  }

  // Seçili müşterilere (seçim yoksa filtrelenmiş listeye) toplu gönderim
  const gonderToplu = async () => {
    const kaynak = secili.size ? liste.filter(g => secili.has(String(g.client.id))) : filtreliListe
    const hedefler = kaynak.filter(g => grupToplam(g) > 0)
    if (!hedefler.length) { setGonderimSonuc('Gönderilecek müşteri yok.'); return }
    if (!window.confirm(`${hedefler.length} müşteriye ${kanalEtiket(kanal)} ile borç bilgisi gönderilsin mi?`)) return
    setTopluGonderiyor(true)
    setGonderimSonuc('')
    let basarili = 0
    let atlanan = 0
    const hatalar = []
    const detaylar = []
    for (const grup of hedefler) {
      const { client, sgk, vergi } = grup
      const muh = muhasebeDahil ? muhasebeBorc[String(client.id)] : null
      const mesaj = borcMesaji(client, sgk, vergi, muh)
      try {
        const ozet = await kanalGonder(kanal, client, mesaj)
        if (ozet === 'gönderim tercihi yok') { atlanan++; continue }
        basarili++
        detaylar.push(`${musteriAdi(client)}: ${ozet}`)
        setGonderimSonuc(`${basarili}/${hedefler.length} gönderildi…\n${detaylar.join('\n')}`)
      } catch (e) {
        hatalar.push(`${musteriAdi(client)}: ${e?.message || 'hata'}`)
        detaylar.push(`${musteriAdi(client)}: ${e?.message || 'hata'}`)
        setGonderimSonuc(`${basarili}/${hedefler.length} gönderildi…\n${detaylar.join('\n')}`)
      }
    }
    setTopluGonderiyor(false)
    setGonderimSonuc(
      `Toplu gönderim tamamlandı: ${basarili} başarılı` +
      (atlanan ? `, ${atlanan} tercih "yok" (atlandı)` : '') +
      (hatalar.length ? `, ${hatalar.length} hata (${hatalar.slice(0, 3).join(' · ')})` : '') + '.' +
      (detaylar.length ? '\n' + detaylar.join('\n') : '')
    )
  }

  // Plan yükleme
  const borcPlanYukle = async () => {
    try {
      const { supabase } = await import('../lib/supabase')
      const { data: oturum } = await supabase.auth.getSession()
      const token = oturum?.session?.access_token
      if (!token) return
      const r = await fetch('/api/borc-cron', { headers: { Authorization: `Bearer ${token}` } })
      const j = await r.json().catch(() => null)
      const p = j?.plan
      if (!p) return
      const secili = Array.isArray(p.musteriler) ? p.musteriler.map(Number) : []
      const tz = (p.turlar_zamanlar && typeof p.turlar_zamanlar === 'object') ? p.turlar_zamanlar : null
      let turlarZamanlar = {}
      let turlar = []
      if (tz) {
        for (const t of ['sgk', 'vergi']) {
          if (Array.isArray(tz[t]) && tz[t].length) {
            turlarZamanlar[t] = dilimleriGunlereBol(tz[t], '06:00')
            turlar.push(t)
          }
        }
      }
      if (!turlar.length) {
        const gunler = Array.isArray(p.gunler_ay) ? p.gunler_ay.map(Number).filter(n => n >= 1 && n <= 31) : []
        const saat = /^\d{1,2}:\d{2}$/.test(String(p.saat || '')) ? p.saat : '06:00'
        const eskiTurlar = Array.isArray(p.turlar) && p.turlar.length ? p.turlar : ['sgk', 'vergi']
        for (const t of eskiTurlar) {
          turlarZamanlar[t] = dilimleriGunlereBol([{ gunler_ay: gunler, saat }], '06:00')
          turlar.push(t)
        }
      }
      setBorcPlan({
        aktif: p.aktif !== false,
        gunler_ay: Array.isArray(p.gunler_ay) ? p.gunler_ay.map(Number).filter(n => n >= 1 && n <= 31) : [],
        saat: /^\d{1,2}:\d{2}$/.test(String(p.saat || '')) ? p.saat : '06:00',
        turlar,
        turlar_zamanlar: turlarZamanlar,
        musteriler: secili
      })
      setMusteriMod(secili.length ? 'secili' : 'tum')
      setMusteriSecili(new Set(secili.map(String)))
    } catch { /* yoksay */ }
  }

  const borcPlanKaydet = async (ekPlan = null) => {
    const kayit = ekPlan || borcPlan
    setBorcPlanKaydediyor(true)
    setBorcPlanMesaj('')
    try {
      const turlarZamanlar = {}
      for (const t of ['sgk', 'vergi']) {
        const liste = dilimleriGunlereBol(kayit.turlar_zamanlar?.[t] || [], '06:00')
          .filter(dilimGecerli)
        if (liste.length) turlarZamanlar[t] = liste
      }
      const turlar = Object.keys(turlarZamanlar)
      if (!turlar.length) throw new Error('Her tür için en az bir gün ve saat girin.')
      const { supabase } = await import('../lib/supabase')
      const { data: oturum } = await supabase.auth.getSession()
      const token = oturum?.session?.access_token
      if (!token) throw new Error('Oturum bulunamadı')
      const r = await fetch('/api/borc-cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          aktif: kayit.aktif,
          turlar,
          turlar_zamanlar: turlarZamanlar,
          musteriler: musteriMod === 'secili' ? [...musteriSecili].map(Number) : []
        })
      })
      const j = await r.json().catch(() => null)
      if (!j?.ok) throw new Error(j?.error || 'Kaydedilemedi')
      await borcPlanYukle()
      setBorcPlanMesaj('Otomatik borç sorgulama planı kaydedildi.')
    } catch (e) {
      setBorcPlanMesaj('Kaydedilemedi: ' + (e?.message || e))
    } finally {
      setBorcPlanKaydediyor(false)
    }
  }

  useEffect(() => { borcPlanYukle() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  // GİB / SGK canlı borç sorgusu — tekli, seçili veya tümü
  const sorgula = async (hedefList = null, turList = null) => {
    const hedefler = Array.isArray(hedefList)
      ? hedefList.filter(Boolean)
      : (kapsam === 'tek' ? hedefMusteriler : siraliMusteriler)
    if (!hedefler.length) { setSorguMesaj('Sorgulanacak müşteri yok.'); return }
    const turlar = Array.isArray(turList) && turList.length ? turList : (tip === 'hepsi' ? ['sgk', 'vergi'] : [tip])
    if (hedefler.length > 1) {
      const onay = window.confirm(
        `${hedefler.length} müşteri için ${turlar.map(t => t === 'sgk' ? 'SGK' : 'Vergi').join(' + ')} borcu canlı sorgulanacak.\n\nBu işlem uzun sürebilir. Devam edilsin mi?`
      )
      if (!onay) return
    }
    sorguIptalRef.current = false
    setSorguYukleniyor(true)
    setSorguMesaj('')
    setSorguIlerleme(null)
    const { borcSonucuKaydet } = await import('../utils/gibOdemeHelper')
    let basarili = 0
    let atlanan = 0
    const hatalar = []
    let islem = 0
    const toplamIslem = hedefler.length * turlar.length
    try {
      for (const c of hedefler) {
        for (const t of turlar) {
          if (sorguIptalRef.current) break
          islem++
          setSorguIlerleme({ islem, toplam: toplamIslem, ad: musteriAdi(c), tur: t })
          setSorguMesaj(`${islem}/${toplamIslem} · ${musteriAdi(c)} · ${t === 'sgk' ? 'SGK' : 'Vergi'}…`)
          try {
            const r = t === 'sgk' ? await sgkBorcSorgula(c.id) : await gibBorcSorgula(c.id)
            if (!r?.ok) {
              if (/sifre-eksik/.test(r?.reason || '')) { atlanan++; continue }
              hatalar.push(`${musteriAdi(c)} (${t === 'sgk' ? 'SGK' : 'Vergi'}): ${r?.reason || r?.not || 'hata'}`)
              continue
            }
            await borcSonucuKaydet(c.id, t, {
              toplam: r.toplam,
              detay: t === 'sgk'
                ? { sadeceBorclar: r.sadeceBorclar, gz: r.gecikmeZammi }
                : { vadesiGecmis: r.vadesiGecmis, vadesiGelmemis: r.vadesiGelmemis },
              mesaj: r.not || ''
            })
            basarili++
          } catch (e) {
            hatalar.push(`${musteriAdi(c)} (${t === 'sgk' ? 'SGK' : 'Vergi'}): ${e?.message || e}`)
          }
        }
        if (sorguIptalRef.current) break
      }
      const durduruldu = sorguIptalRef.current
      setSorguMesaj(
        `${durduruldu ? 'Sorgulama durduruldu' : 'Sorgulama tamamlandı'}: ${basarili} başarılı` +
        (atlanan ? `, ${atlanan} atlandı (giriş bilgisi yok)` : '') +
        (hatalar.length ? `, ${hatalar.length} hata (${hatalar.slice(0, 3).join(' · ')})` : '') + '.'
      )
    } finally {
      setSorguYukleniyor(false)
      setSorguIlerleme(null)
      await yukle()
    }
  }

  const durdur = async () => {
    sorguIptalRef.current = true
    setSorguMesaj('Durduruluyor… çalışan ve kuyrukta bekleyen sorgular iptal ediliyor.')
    try { await gibLucaSorguDurdur('sunucu', true) } catch { /* yoksay */ }
  }

  // Otomatik bildirim planı yükle/kaydet
  const tokenAl = async () => {
    const { supabase } = await import('../lib/supabase')
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token || ''
  }

  const planYukle = async () => {
    try {
      const token = await tokenAl()
      if (!token) return
      const r = await fetch('/api/borc-bildirim', { headers: { Authorization: `Bearer ${token}` } })
      const j = await r.json().catch(() => null)
      const p = j?.plan
      if (!p) return
      setPlan({
        aktif: !!p.aktif,
        gunler: Array.isArray(p.gunler) && p.gunler.length ? p.gunler.map(Number) : [1],
        saat: /^\d{1,2}:\d{2}$/.test(String(p.saat || '')) ? p.saat : '10:00',
        kanal: ['email', 'ikisi', 'tercih'].includes(p.kanal) ? p.kanal : 'whatsapp',
        muhasebeDahil: p.muhasebeDahil === true
      })
    } catch { /* yoksay */ }
  }

  const planKaydet = async () => {
    setPlanKaydediyor(true)
    setPlanMesaj('')
    try {
      const gunler = [...new Set((plan.gunler || []).map(Number).filter(n => n >= 1 && n <= 31))].sort((a, b) => a - b)
      if (!gunler.length) throw new Error('Takvimden en az bir gün seçin.')
      const token = await tokenAl()
      if (!token) throw new Error('Oturum bulunamadı')
      const r = await fetch('/api/borc-bildirim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...plan, gunler })
      })
      const j = await r.json().catch(() => null)
      if (!j?.ok) throw new Error(j?.error || 'Kaydedilemedi')
      setPlanMesaj('Otomatik bildirim planı kaydedildi.')
    } catch (e) {
      setPlanMesaj('Kaydedilemedi: ' + (e?.message || e))
    } finally {
      setPlanKaydediyor(false)
    }
  }

  useEffect(() => { planYukle() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const detayKart = (grup) => {
    const { client, sgk, vergi } = grup
    const muh = muhasebeBorc[String(client.id)]
    const mesaj = [sgk?.mesaj, vergi?.mesaj].filter(Boolean).join('\n\n')
    return (
      <div className="bg-blue-950/50 px-4 py-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {sgk
            ? <DetayKutu baslik="SGK Borcu" tutar={sgk.toplam} satirlar={borcDetaySatirlari(sgk)} ts={sgk.sorgu_ts} renk="amber" />
            : <DetayKutu baslik="SGK Borcu" bos />}
          {vergi
            ? <DetayKutu baslik="Vergi Borcu (GİB)" tutar={vergi.toplam} satirlar={borcDetaySatirlari(vergi)} ts={vergi.sorgu_ts} renk="sky" />
            : <DetayKutu baslik="Vergi Borcu (GİB)" bos />}
          {muhasebeDahil && muh && (
            <DetayKutu
              baslik="Muhasebe Borcu"
              tutar={muh.kalanBorc}
              satirlar={[
                ...(muh.gecmisDonem !== undefined ? [{ etiket: 'Geçmiş dönem', deger: muh.gecmisDonem }] : []),
                ...(muh.guncelDonem !== undefined ? [{ etiket: 'Güncel dönem', deger: muh.guncelDonem }] : []),
                { etiket: 'Kalan borç', deger: muh.kalanBorc }
              ]}
              renk="violet"
            />
          )}
        </div>
        {mesaj && (
          <details className="rounded-xl border border-blue-800/40 bg-blue-900/20 px-3 py-2">
            <summary className="text-[11px] text-gray-400 cursor-pointer select-none">Sorgu notu / ham mesaj</summary>
            <pre className="mt-2 text-[10px] leading-relaxed text-gray-500 whitespace-pre-wrap break-words">{mesaj}</pre>
          </details>
        )}
      </div>
    )
  }

  const seciliGorunen = filtreliListe.filter(g => secili.has(String(g.client.id)))
  const tumuSecili = filtreliListe.length > 0 && seciliGorunen.length === filtreliListe.length
  const gonderilecekAdet = secili.size || filtreliListe.length
  const ilerlemeYuzde = sorguIlerleme?.toplam ? Math.round((sorguIlerleme.islem / sorguIlerleme.toplam) * 100) : 0

  return (
    <div className="space-y-5 p-4 pt-8">
      {/* Başlık */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shrink-0">
            <Wallet className="w-5 h-5 text-cyan-300" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-white">Müşteri Borç Dökümü</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                {filtreliListe.length} müşteri
              </span>
            </div>
            <p className="text-xs text-gray-400">SGK, vergi ve muhasebe borçlarının güncel durumu · Son veri: {sonGuncelleme}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sorguYukleniyor ? (
            <button
              type="button"
              onClick={durdur}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-red-600/20 border border-red-500/40 text-red-300 text-sm font-medium hover:bg-red-600/30"
            >
              <Square className="w-4 h-4" /> Durdur
            </button>
          ) : (
            <button
              type="button"
              onClick={() => sorgula()}
              disabled={!siraliMusteriler.length}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium disabled:opacity-40"
            >
              <Search className="w-4 h-4" />
              {kapsam === 'tek' ? 'Bu Müşteriyi Sorgula' : 'Tümünü Sorgula'}
            </button>
          )}
          <button
            type="button"
            onClick={yukle}
            disabled={yukleniyor}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-900/50 border border-blue-700/50 text-gray-200 text-sm hover:bg-blue-800/50 disabled:opacity-40"
          >
            {yukleniyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Yenile
          </button>
        </div>
      </div>

      {/* Sorgu durumu */}
      {sorguYukleniyor && (
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/[0.06] px-3.5 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-cyan-200 truncate">
              {sorguIlerleme ? `${sorguIlerleme.islem}/${sorguIlerleme.toplam} · ${sorguIlerleme.ad} · ${sorguIlerleme.tur === 'sgk' ? 'SGK' : 'Vergi'}` : sorguMesaj || 'Sorgu hazırlanıyor…'}
            </span>
            <span className="text-[11px] text-cyan-300 tabular-nums shrink-0">{ilerlemeYuzde}%</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-blue-900/60 overflow-hidden">
            <div className="h-full bg-cyan-400 transition-all" style={{ width: `${ilerlemeYuzde}%` }} />
          </div>
        </div>
      )}
      {!sorguYukleniyor && sorguMesaj && (
        <div className="text-xs text-cyan-200 bg-cyan-500/10 border border-cyan-500/30 rounded-xl px-3 py-2">{sorguMesaj}</div>
      )}

      {silinenAdet > 0 && (
        <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {silinenAdet} adet 10 günden eski borç kaydı otomatik silindi.
        </div>
      )}

      {hata && (
        <div className="flex items-center gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {hata}
        </div>
      )}

      {/* Özet kartları */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
        <KpiKart baslik="SGK" tutar={`${paraYaz(toplamlar.sgk)} TL`} alt={`${toplamlar.sgkAdet} müşteride borç`} ikon={Landmark} renk="amber" />
        <KpiKart baslik="Vergi (GİB)" tutar={`${paraYaz(toplamlar.vergi)} TL`} alt={`${toplamlar.vergiAdet} müşteride borç`} ikon={Building2} renk="sky" />
        <KpiKart
          baslik="Muhasebe"
          tutar={muhasebeDahil ? `${paraYaz(toplamlar.muhasebe)} TL` : '—'}
          alt={muhasebeDahil ? `${toplamlar.muhasebeAdet} müşteride borç` : 'Toplama dahil değil'}
          ikon={BadgeCheck}
          renk="violet"
          soluk={!muhasebeDahil}
        />
        <KpiKart
          baslik="Genel Toplam"
          tutar={`${paraYaz(toplamlar.toplam)} TL`}
          alt={muhasebeDahil ? 'Muhasebe dahil' : 'SGK + Vergi'}
          ikon={Wallet}
          renk="cyan"
        />
      </div>

      {/* Filtreler */}
      <div className="rounded-2xl border border-blue-800/40 bg-blue-950/30 p-3.5 space-y-3">
        <div className="flex flex-wrap items-end gap-2.5">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Ara</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input
                value={arama}
                onChange={e => setArama(e.target.value)}
                placeholder="Müşteri adı, VKN / TC…"
                className="w-full pl-9 pr-8 bg-blue-900/60 border border-blue-700/50 rounded-xl py-2 text-white text-xs placeholder:text-gray-500 focus:outline-none focus:border-cyan-500/60"
              />
              {arama && (
                <button type="button" onClick={() => setArama('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white" title="Aramayı temizle">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Kapsam</label>
            <div className="inline-flex rounded-xl overflow-hidden border border-blue-700/50">
              {[{ v: 'tum', ad: 'Tüm Müşteriler' }, { v: 'tek', ad: 'Tek Müşteri' }].map(o => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setKapsam(o.v)}
                  className={`px-3 py-2 text-xs font-medium transition-colors ${kapsam === o.v ? 'bg-cyan-500 text-white' : 'bg-blue-900/50 text-gray-400 hover:text-gray-200'}`}
                >{o.ad}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Borç Türü</label>
            <div className="inline-flex rounded-xl overflow-hidden border border-blue-700/50">
              {[{ v: 'hepsi', ad: 'Hepsi' }, { v: 'sgk', ad: 'SGK' }, { v: 'vergi', ad: 'Vergi' }].map(o => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setTip(o.v)}
                  className={`px-3 py-2 text-xs font-medium transition-colors ${tip === o.v ? 'bg-cyan-500 text-white' : 'bg-blue-900/50 text-gray-400 hover:text-gray-200'}`}
                >{o.ad}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Sırala</label>
            <div className="relative">
              <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
              <select
                value={siralama}
                onChange={e => setSiralama(e.target.value)}
                className="bg-blue-900/60 border border-blue-700/50 rounded-xl pl-8 pr-8 py-2 text-white text-xs focus:outline-none focus:border-cyan-500/60"
              >
                <option value="ad">Ada göre (A-Z)</option>
                <option value="toplam">Tutara göre (çok-az)</option>
                <option value="sgk">SGK borcuna göre</option>
                <option value="vergi">Vergi borcuna göre</option>
                <option value="muhasebe">Muhasebe borcuna göre</option>
              </select>
            </div>
          </div>

          {kapsam === 'tek' && (
            <div className="flex-1 min-w-[220px]">
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Müşteri</label>
              <select
                value={seciliId}
                onChange={e => setSeciliId(e.target.value)}
                className="w-full bg-blue-900/60 border border-blue-700/50 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-500/60"
              >
                <option value="">Müşteri seçin…</option>
                {siraliMusteriler.map(c => (
                  <option key={c.id} value={c.id}>{musteriAdi(c)}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-blue-800/40">
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={muhasebeDahil}
              onChange={e => setMuhasebeDahil(e.target.checked)}
              className="w-4 h-4 rounded border-blue-700/50 bg-blue-900/40 text-violet-500"
            />
            Muhasebe (mesleki ücret) borcunu da dahil et
          </label>
          <div className="flex items-center gap-3 text-[11px] text-gray-500">
            <span className="inline-flex items-center gap-1"><Filter className="w-3.5 h-3.5" /> {filtreliListe.length} kayıt</span>
            <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {toplamlar.sgkAdet + toplamlar.vergiAdet > 0 ? `${new Set(filtreliListe.filter(g => sayi(g.sgk?.toplam) > 0 || sayi(g.vergi?.toplam) > 0 || (muhasebeDahil && sayi(muhasebeBorc[String(g.client.id)]?.kalanBorc) > 0)).map(g => g.client.id)).size} borçlu` : 'Borçlu yok'}</span>
          </div>
        </div>
      </div>

      {/* Seçim + toplu işlem araç çubuğu */}
      {filtreliListe.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-blue-800/40 bg-blue-900/20 px-3.5 py-2.5">
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={tumuSecili}
              onChange={tumunuSec}
              className="w-4 h-4 rounded border-blue-700/50 bg-blue-900/40 text-cyan-500"
            />
            {secili.size ? `${secili.size} seçili` : 'Tümünü seç'}
          </label>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {secili.size > 0 && (
              <button
                type="button"
                onClick={() => sorgula(seciliGorunen.map(g => g.client))}
                disabled={sorguYukleniyor || !seciliGorunen.length}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600/15 border border-cyan-500/40 text-cyan-300 text-xs font-medium hover:bg-cyan-600/25 disabled:opacity-40"
              >
                <Search className="w-3.5 h-3.5" /> Seçili Sorgula ({seciliGorunen.length})
              </button>
            )}
            <div className="inline-flex rounded-lg overflow-hidden border border-blue-700/50">
              {[{ v: 'tercih', ad: 'Tercih' }, { v: 'whatsapp', ad: 'WhatsApp' }, { v: 'email', ad: 'E-posta' }, { v: 'ikisi', ad: 'İkisi' }].map(o => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setKanal(o.v)}
                  title={o.v === 'tercih' ? 'Müşterinin iletişim bilgilerindeki Tahakkuk Gönderim Şekli neyse ona göre gönderilir' : undefined}
                  className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors ${kanal === o.v ? 'bg-emerald-500 text-white' : 'bg-blue-900/50 text-gray-400 hover:text-gray-200'}`}
                >{o.ad}</button>
              ))}
            </div>
            <button
              type="button"
              onClick={gonderToplu}
              disabled={topluGonderiyor || !gonderilecekAdet}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-xs font-medium hover:bg-emerald-600/30 disabled:opacity-40"
            >
              {topluGonderiyor ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Toplu Gönder ({gonderilecekAdet})
            </button>
          </div>
          {gonderimSonuc && <div className="basis-full text-[11px] text-gray-400 whitespace-pre-wrap break-words">{gonderimSonuc}</div>}
        </div>
      )}

      {/* Liste */}
      {yukleniyor ? (
        <div className="rounded-2xl border border-blue-800/40 bg-blue-950/30 p-4 space-y-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-10 rounded-lg bg-blue-900/40 animate-pulse" />
          ))}
        </div>
      ) : filtreliListe.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-blue-700/40 bg-blue-950/20 py-12 text-center">
          <Wallet className="w-8 h-8 text-gray-600 mx-auto" />
          <p className="mt-3 text-sm text-gray-300">
            {arama ? 'Aramanıza uygun müşteri bulunamadı.' : 'Gösterilecek borç kaydı yok.'}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {arama ? 'Arama metnini temizleyip tekrar deneyin.' : 'Seçili kapsam için canlı sorgulama yaparak verileri güncelleyebilirsiniz.'}
          </p>
          {!arama && (
            <button
              type="button"
              onClick={() => sorgula()}
              disabled={sorguYukleniyor || !siraliMusteriler.length}
              className="mt-4 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium disabled:opacity-40"
            >
              <Search className="w-4 h-4" /> Canlı Sorgula
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Masaüstü tablo */}
          <div className="hidden lg:block rounded-2xl border border-blue-800/40 bg-blue-950/30 overflow-hidden">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-blue-900/40 text-[10px] uppercase tracking-wider text-gray-400">
                <tr>
                  <th className="w-[4%] px-2 py-3">
                    <input
                      type="checkbox"
                      checked={tumuSecili}
                      onChange={tumunuSec}
                      className="w-4 h-4 rounded border-blue-700/50 bg-blue-900/40 text-cyan-500"
                    />
                  </th>
                  <th className={`${muhasebeDahil ? 'w-[24%]' : 'w-[30%]'} px-3 py-3 text-left font-semibold`}>Müşteri</th>
                  <th className="w-[12%] px-3 py-3 text-right font-semibold">SGK</th>
                  <th className="w-[12%] px-3 py-3 text-right font-semibold">Vergi (GİB)</th>
                  {muhasebeDahil && <th className="w-[11%] px-3 py-3 text-right font-semibold">Muhasebe</th>}
                  <th className="w-[13%] px-3 py-3 text-right font-semibold">Toplam</th>
                  <th className="w-[11%] px-3 py-3 text-center font-semibold">Son Sorgu</th>
                  <th className="w-[10%] px-3 py-3 text-right font-semibold pr-4">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-800/30">
                {filtreliListe.map(grup => {
                  const { client, sgk, vergi } = grup
                  const id = String(client.id)
                  const muh = muhasebeDahil ? muhasebeBorc[id] : null
                  const toplam = sayi(sgk?.toplam) + sayi(vergi?.toplam) + sayi(muh?.kalanBorc)
                  const acikMi = acik.has(id)
                  const sonTs = grupSonTs(grup)
                  const seciliMi = secili.has(id)
                  return (
                    <Fragment key={id}>
                      <tr className={`transition-colors ${acikMi ? 'bg-cyan-500/[0.04]' : 'hover:bg-blue-900/20'}`}>
                        <td className="px-3 py-2.5 align-middle">
                          <input
                            type="checkbox"
                            checked={seciliMi}
                            onChange={() => secimDegistir(id)}
                            className="w-4 h-4 rounded border-blue-700/50 bg-blue-900/40 text-cyan-500"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <button type="button" onClick={() => detayAc(id)} className="text-left max-w-full">
                            <div className="text-[13px] font-medium text-white truncate">{musteriAdi(client)}</div>
                            <div className="text-[10px] text-gray-500 truncate">
                              {(client?.vkn || client?.tc) ? `VKN/TC: ${client.vkn || client.tc}` : 'VKN/TC kayıtlı değil'}
                              {!muhasebeDahil && sayi(muhasebeBorc[id]?.kalanBorc) > 0 ? ' · muhasebe hariç' : ''}
                            </div>
                          </button>
                        </td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${sayi(sgk?.toplam) > 0 ? 'text-amber-200' : 'text-gray-600'}`}>
                          {sgk ? `${paraYaz(sgk.toplam)} TL` : '—'}
                        </td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${sayi(vergi?.toplam) > 0 ? 'text-sky-200' : 'text-gray-600'}`}>
                          {vergi ? `${paraYaz(vergi.toplam)} TL` : '—'}
                        </td>
                        {muhasebeDahil && (
                          <td className={`px-3 py-2.5 text-right tabular-nums ${sayi(muh?.kalanBorc) > 0 ? 'text-violet-200' : 'text-gray-600'}`}>
                            {muh ? `${paraYaz(muh.kalanBorc)} TL` : '—'}
                          </td>
                        )}
                        <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${toplam > 0 ? 'text-cyan-200' : 'text-gray-500'}`}>
                          {paraYaz(toplam)} TL
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${sonTs ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-blue-900/40 border-blue-700/40 text-gray-500'}`}>
                            <Clock className="w-3 h-3" /> {gunEtiket(sonTs)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 pr-4">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => sorgula([client])}
                              disabled={sorguYukleniyor}
                              title="Bu müşteriyi canlı sorgula"
                              className="p-1.5 rounded-lg text-cyan-300 hover:bg-cyan-500/15 disabled:opacity-30"
                            >
                              <Search className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => gonderTek(grup)}
                              disabled={gonderenId === id || !(toplam > 0)}
                              title="Borç bilgisini gönder"
                              className="p-1.5 rounded-lg text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-30"
                            >
                              {gonderenId === id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => detayAc(id)}
                              title={acikMi ? 'Detayı kapat' : 'Detayı aç'}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-blue-800/40"
                            >
                              {acikMi ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {acikMi && (
                        <tr>
                          <td colSpan={muhasebeDahil ? 8 : 7} className="p-0 border-t border-blue-800/30">{detayKart(grup)}</td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobil kartlar */}
          <div className="lg:hidden space-y-2">
            {filtreliListe.map(grup => {
              const { client, sgk, vergi } = grup
              const id = String(client.id)
              const muh = muhasebeDahil ? muhasebeBorc[id] : null
              const toplam = sayi(sgk?.toplam) + sayi(vergi?.toplam) + sayi(muh?.kalanBorc)
              const acikMi = acik.has(id)
              const sonTs = grupSonTs(grup)
              return (
                <div key={id} className={`rounded-xl border bg-blue-900/30 overflow-hidden ${acikMi ? 'border-cyan-500/40' : 'border-blue-700/40'}`}>
                  <div className="p-3 space-y-2.5">
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={secili.has(id)}
                        onChange={() => secimDegistir(id)}
                        className="mt-0.5 w-4 h-4 rounded border-blue-700/50 bg-blue-900/40 text-cyan-500"
                      />
                      <button type="button" onClick={() => detayAc(id)} className="flex-1 min-w-0 text-left">
                        <div className="text-sm font-medium text-white truncate">{musteriAdi(client)}</div>
                        <div className="text-[10px] text-gray-500 truncate">
                          {(client?.vkn || client?.tc) ? `VKN/TC: ${client.vkn || client.tc}` : 'VKN/TC kayıtlı değil'} · {gunEtiket(sonTs)}
                        </div>
                      </button>
                      <div className="text-right shrink-0">
                        <div className={`text-sm font-semibold tabular-nums ${toplam > 0 ? 'text-cyan-200' : 'text-gray-500'}`}>{paraYaz(toplam)} TL</div>
                        {!muhasebeDahil && sayi(muhasebeBorc[id]?.kalanBorc) > 0 && (
                          <div className="text-[9px] text-gray-500">muhasebe hariç</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] border tabular-nums ${sayi(sgk?.toplam) > 0 ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' : 'bg-blue-950/40 border-blue-800/40 text-gray-500'}`}>
                        SGK {sgk ? `${paraYaz(sgk.toplam)} TL` : '—'}
                      </span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] border tabular-nums ${sayi(vergi?.toplam) > 0 ? 'bg-sky-500/10 border-sky-500/30 text-sky-200' : 'bg-blue-950/40 border-blue-800/40 text-gray-500'}`}>
                        Vergi {vergi ? `${paraYaz(vergi.toplam)} TL` : '—'}
                      </span>
                      {muhasebeDahil && (
                        <span className={`px-2 py-0.5 rounded-md text-[10px] border tabular-nums ${sayi(muh?.kalanBorc) > 0 ? 'bg-violet-500/10 border-violet-500/30 text-violet-200' : 'bg-blue-950/40 border-blue-800/40 text-gray-500'}`}>
                          Muhasebe {muh ? `${paraYaz(muh.kalanBorc)} TL` : '—'}
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-1">
                        <button type="button" onClick={() => sorgula([client])} disabled={sorguYukleniyor} title="Bu müşteriyi canlı sorgula" className="p-1.5 rounded-lg text-cyan-300 hover:bg-cyan-500/15 disabled:opacity-30">
                          <Search className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => gonderTek(grup)} disabled={gonderenId === id || !(toplam > 0)} title="Borç bilgisini gönder" className="p-1.5 rounded-lg text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-30">
                          {gonderenId === id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
                        <button type="button" onClick={() => detayAc(id)} title={acikMi ? 'Detayı kapat' : 'Detayı aç'} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-blue-800/40">
                          {acikMi ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  {acikMi && <div className="border-t border-blue-700/40">{detayKart(grup)}</div>}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Eski kayıtlar */}
      {eskiKayitlar.length > 0 && (
        <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setEskiAcik(v => !v)}
            className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs text-gray-300"
          >
            <span className="inline-flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Eski borç kayıtları ({eskiKayitlar.length})</span>
            {eskiAcik ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {eskiAcik && (
            <div className="border-t border-blue-700/30 px-3.5 py-2.5 text-[11px] text-gray-500">
              10 günden eski kayıtlar güncel borç sayılmaz ve listeye dahil edilmez. Güncellemek için ilgili müşteriyi canlı sorgulayın.
            </div>
          )}
        </div>
      )}

      {/* Otomasyon panelleri */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
        {/* Otomatik borç bildirimi planı */}
        <div className="bg-blue-900/30 border border-blue-700/40 rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setPlanAcik(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-white">
              <span className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center"><MessageCircle className="w-4 h-4 text-emerald-300" /></span>
              Otomatik Borç Bildirimi
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${plan.aktif ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-gray-400'}`}>
                {plan.aktif ? 'Aktif' : 'Kapalı'}
              </span>
            </span>
            {planAcik ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {planAcik && (
            <div className="border-t border-blue-700/40 p-4 space-y-4">
              <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={plan.aktif}
                  onChange={e => setPlan(prev => ({ ...prev, aktif: e.target.checked }))}
                  className="w-4 h-4 rounded border-blue-700/50 bg-blue-900/40 text-emerald-500"
                />
                Otomatik bildirim aktif
              </label>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Gönderim Günleri (her ay tekrar eder)</label>
                  <AylikTakvim
                    yil={takvimAy.yil}
                    ay={takvimAy.ay}
                    secili={plan.gunler}
                    onDegistir={(fn) => setPlan(prev => ({ ...prev, gunler: fn(prev.gunler) }))}
                    onAyDegistir={setTakvimAy}
                  />
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Saat</label>
                    <input
                      type="time"
                      value={plan.saat}
                      onChange={e => setPlan(prev => ({ ...prev, saat: e.target.value }))}
                      className="w-full bg-blue-900/60 border border-blue-700/50 rounded-xl px-3 py-2 text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Kanal</label>
                    <div className="inline-flex rounded-xl overflow-hidden border border-blue-700/50 w-full">
                      {[{ v: 'tercih', ad: 'Tercih' }, { v: 'whatsapp', ad: 'WhatsApp' }, { v: 'email', ad: 'E-posta' }, { v: 'ikisi', ad: 'İkisi' }].map(o => (
                        <button
                          key={o.v}
                          type="button"
                          onClick={() => setPlan(prev => ({ ...prev, kanal: o.v }))}
                          className={`flex-1 px-2 py-2 text-[11px] font-medium transition-colors ${plan.kanal === o.v ? 'bg-emerald-500 text-white' : 'bg-blue-900/50 text-gray-400'}`}
                        >{o.ad}</button>
                      ))}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={plan.muhasebeDahil}
                      onChange={e => setPlan(prev => ({ ...prev, muhasebeDahil: e.target.checked }))}
                      className="w-4 h-4 rounded border-blue-700/50 bg-blue-900/40 text-emerald-500"
                    />
                    Muhasebe borcunu da ekle
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={planKaydet}
                  disabled={planKaydediyor}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-xs font-medium disabled:opacity-40"
                >
                  {planKaydediyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Planı Kaydet
                </button>
                {planMesaj && <span className="text-[11px] text-gray-300">{planMesaj}</span>}
              </div>
              <p className="text-[11px] text-gray-500">
                Borcu olan müşterilere seçilen günlerde ve saatte otomatik bildirim gönderilir.
              </p>
            </div>
          )}
        </div>

        {/* Otomatik borç sorgulama planı */}
        <div className="bg-blue-900/30 border border-blue-700/40 rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setSorguAcik(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-white">
              <span className="w-7 h-7 rounded-lg bg-cyan-500/15 flex items-center justify-center"><Clock className="w-4 h-4 text-cyan-300" /></span>
              Otomatik Borç Sorgulama
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${borcPlan.aktif ? 'bg-cyan-500/20 text-cyan-300' : 'bg-white/10 text-gray-400'}`}>
                {borcPlan.aktif ? 'Aktif' : 'Kapalı'}
              </span>
            </span>
            {sorguAcik ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {sorguAcik && (
            <div className="border-t border-blue-700/40 p-4 space-y-4">
              <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={borcPlan.aktif}
                  onChange={e => setBorcPlan(prev => ({ ...prev, aktif: e.target.checked }))}
                  className="w-4 h-4 rounded border-blue-700/50 bg-blue-900/40 text-cyan-500"
                />
                Otomatik sorgulama aktif
              </label>
              <p className="text-[11px] text-gray-500">
                Her tür için ayrı gün ve saat tanımlayın. <span className="text-cyan-300">+</span> ile aynı türe birden fazla dilim ekleyebilir, <span className="text-red-300">−</span> ile silebilirsiniz. Aynı plan Ayarlar ekranıyla senkron çalışır.
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {['vergi', 'sgk'].map(tur => {
                  const dilimler = borcPlan.turlar_zamanlar?.[tur] || []
                  const etiket = tur === 'sgk' ? 'SGK Borcu' : 'Vergi Borcu (GİB)'
                  const renk = tur === 'sgk' ? 'amber' : 'sky'
                  const r = KPI_RENK[renk]
                  return (
                    <div key={tur} className="bg-blue-950/40 border border-blue-700/30 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-2 text-xs font-semibold text-white">
                          <span className={`w-2 h-2 rounded-full ${tur === 'sgk' ? 'bg-amber-400' : 'bg-sky-400'}`} />
                          {etiket}
                          {dilimler.length > 0 && <span className={`px-1.5 py-0.5 rounded text-[9px] ${r.kart} ${r.deger}`}>{dilimler.length} dilim</span>}
                        </span>
                        <button
                          type="button"
                          onClick={() => borcDilimEkle(tur)}
                          title="Gün + saat ekle"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-cyan-600/15 border border-cyan-500/40 text-cyan-300 text-[10px] font-medium hover:bg-cyan-600/25"
                        >
                          <Plus className="w-3 h-3" /> Ekle
                        </button>
                      </div>
                      {dilimler.length === 0 && (
                        <p className="text-[11px] text-gray-500 py-1">Dilim yok — otomatik sorgulanmaz.</p>
                      )}
                      <PlanDilimSatirlari
                        dilimler={dilimler}
                        onDegistir={(idx, yeni) => borcDilimGuncelle(tur, idx, yeni)}
                        onSil={(idx) => borcDilimSil(tur, idx)}
                      />
                    </div>
                  )
                })}
              </div>

              {/* Müşteri seçimi */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Müşteri Seçimi</label>
                <div className="inline-flex rounded-xl overflow-hidden border border-blue-700/50 w-full max-w-xs">
                  <button
                    type="button"
                    onClick={() => setMusteriMod('tum')}
                    className={`flex-1 px-3 py-2 text-[11px] font-medium ${musteriMod === 'tum' ? 'bg-cyan-500 text-white' : 'bg-blue-900/50 text-gray-400'}`}
                  >Tümü</button>
                  <button
                    type="button"
                    onClick={() => setMusteriMod('secili')}
                    className={`flex-1 px-3 py-2 text-[11px] font-medium ${musteriMod === 'secili' ? 'bg-cyan-500 text-white' : 'bg-blue-900/50 text-gray-400'}`}
                  >Seçili ({musteriSecili.size})</button>
                </div>
              </div>

              {musteriMod === 'secili' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Müşteriler</label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setMusteriSecili(new Set(siraliMusteriler.map(c => String(c.id))))} className="text-[11px] text-cyan-300 hover:text-cyan-200">Tümünü Seç</button>
                      <button type="button" onClick={() => setMusteriSecili(new Set())} className="text-[11px] text-gray-400 hover:text-white">Temizle</button>
                    </div>
                  </div>
                  <div className="max-h-52 overflow-y-auto rounded-xl border border-blue-700/40 bg-blue-950/40 divide-y divide-blue-800/30">
                    {siraliMusteriler.map(c => {
                      const id = String(c.id)
                      return (
                        <label key={id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-blue-900/40">
                          <input
                            type="checkbox"
                            checked={musteriSecili.has(id)}
                            onChange={() => setMusteriSecili(prev => {
                              const y = new Set(prev)
                              if (y.has(id)) y.delete(id); else y.add(id)
                              return y
                            })}
                            className="w-4 h-4 rounded border-blue-700/50 bg-blue-900/40 text-cyan-500 focus:ring-cyan-500"
                          />
                          <span className="text-xs text-gray-200 truncate">{musteriAdi(c)}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => borcPlanKaydet()}
                  disabled={borcPlanKaydediyor}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600/20 border border-cyan-500/40 text-cyan-300 text-xs font-medium disabled:opacity-40"
                >
                  {borcPlanKaydediyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Planı Kaydet
                </button>
                {borcPlanMesaj && <span className="text-[11px] text-gray-300">{borcPlanMesaj}</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
