import { useState, useEffect, useRef, useCallback } from 'react'
import { useClients } from '../hooks/useClients'
import { getAllAccountingFees, getAllPayments, addPayment, deletePayment, saveAccountingFee, hesaplaBorcOzeti, getActivePaymentProvider, getBankInfo, buildBorcMesaji } from '../services/paymentService'
import {
  DollarSign, Users, Search, FileSpreadsheet, FileText,
  CheckCircle, AlertTriangle, Clock, X, CreditCard, Copy, Mail, MessageCircle, Minus, Plus, Trash2, Pencil
} from 'lucide-react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { parseTurkishNumber, formatTurkishInput, hamTutarGirdisi } from '../utils/numberFormat'
import { sendEmail, sendShareDocumentsViaWhatsApp, logWhatsAppWebSend, getWhatsAppChannel, openWhatsAppWeb } from '../services/whatsappService'
import { getSettings } from '../services/settingsService'
import { sendBulkDebtNotifications, buildDebtPayload } from '../services/debtNotificationService'

const AYLER = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

// Uzun isim/unvanlari 25 karakterde kisalt
const kisaAd = (ad) => {
  const s = (ad || '').trim()
  return s.length > 25 ? s.slice(0, 24).trimEnd() + '…' : s
}

// PDF icin Turkce karakter destekli DejaVuSans fontu (bir kez yuklenir, cache'lenir)
let _trFont // undefined: denenmedi, null: basarisiz, { base64 }: hazir
async function loadTurkishFont() {
  if (_trFont !== undefined) return _trFont
  try {
    const res = await fetch('https://unpkg.com/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf')
    if (!res.ok) throw new Error('font indirilemedi')
    const bytes = new Uint8Array(await res.arrayBuffer())
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
    }
    _trFont = { base64: btoa(binary) }
  } catch (err) {
    console.warn('PDF font yuklenemedi, ASCII yedegi kullanilacak:', err.message)
    _trFont = null
  }
  return _trFont
}

// Font yuklenemezse Turkce karakterleri ASCII'ye cevir
const trAscii = (s) => String(s ?? '')
  .replace(/İ/g, 'I').replace(/ı/g, 'i')
  .replace(/Ş/g, 'S').replace(/ş/g, 's')
  .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
  .replace(/Ü/g, 'U').replace(/ü/g, 'u')
  .replace(/Ö/g, 'O').replace(/ö/g, 'o')
  .replace(/Ç/g, 'C').replace(/ç/g, 'c')

const ODEME_TURLERI = [
  { value: 'nakit', label: 'Nakit', renk: 'bg-green-500/20 border-green-500/50 text-green-400' },
  { value: 'eft', label: 'EFT / Havale', renk: 'bg-blue-500/20 border-blue-500/50 text-blue-400' },
  { value: 'kredi_karti', label: 'Kredi Kartı', renk: 'bg-purple-500/20 border-purple-500/50 text-purple-400' }
]

export default function OdemeTakip() {
  const { clients } = useClients()
  const [fees, setFees] = useState([])

  // Fareyle tutup sürükleyerek ayları kaydırma (drag-to-scroll)
  const tabloRef = useRef(null)
  const surukleRef = useRef({ aktif: false, startX: 0, baslangicScroll: 0, tasinan: false })
  const [surukleModu, setSurukleModu] = useState(false)

  const tabloMouseDown = useCallback((e) => {
    const el = tabloRef.current
    if (!el || e.button !== 0) return
    // Metin kutusu / buton / onay kutusu üstünde sürüklemeyi başlatma
    if (e.target.closest('input, button, select, textarea, a')) return
    surukleRef.current = { aktif: true, startX: e.pageX, baslangicScroll: el.scrollLeft, tasinan: false }
    setSurukleModu(true)
  }, [])

  const tabloMouseMove = useCallback((e) => {
    const s = surukleRef.current
    const el = tabloRef.current
    if (!s.aktif || !el) return
    const dx = e.pageX - s.startX
    if (!s.tasinan && Math.abs(dx) > 6) s.tasinan = true
    if (s.tasinan) el.scrollLeft = s.baslangicScroll - dx
  }, [])

  const tabloMouseUp = useCallback(() => {
    surukleRef.current.aktif = false
    setSurukleModu(false)
  }, [])

  // Sürükleme sonrası yanlış tıklamayı engelle (ödeme hücresi açılmasın)
  const tabloClickKontrol = useCallback((e) => {
    if (surukleRef.current.tasinan) {
      e.stopPropagation()
      e.preventDefault()
      surukleRef.current.tasinan = false
    }
  }, [])

  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState('all') // all | borcu_var | borcu_yok
  const [yil, setYil] = useState(new Date().getFullYear())
  const [buAyVurgu, setBuAyVurgu] = useState(false)

  // Toplu borc bildirimi (WhatsApp / Mail)
  const [selectedIds, setSelectedIds] = useState([])
  const [topluGonderiyor, setTopluGonderiyor] = useState(false)
  // Sirali WhatsApp gonderim kuyrugu
  const [waQueue, setWaQueue] = useState(null) // { liste: [{clientId, clientName, phone, message, opened}], index }

  // Ay hucrelerindeki Odeme Kaydi modal
  const [odemeModal, setOdemeModal] = useState(null) // { clientId, name, ay, aylikUcret }
  const [odemeForm, setOdemeForm] = useState({ tutar: '', odeme_tipi: 'nakit', odeme_tarihi: new Date().toISOString().split('T')[0], aciklama: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // 2.8.320: Aylık Ücret / Defter Tasdik / Önceki Dönem tutarlarını doğrudan
  // hücreye tıklayıp düzenleme (accounting_fees kaydı).
  const [feeModal, setFeeModal] = useState(null) // { clientId, name, alan, etiket }
  const [feeTutar, setFeeTutar] = useState('')
  const [feeSaving, setFeeSaving] = useState(false)
  const [feeError, setFeeError] = useState('')

  const FEE_ALANLARI = {
    aylik_ucret: { etiket: 'Aylık Ücret', alan: 'aylik_ucret' },
    defter_tasdik_ucreti: { etiket: 'Defter Tasdik', alan: 'defter_tasdik_ucreti' },
    onceki_donem_borc: { etiket: 'Önceki Dönem Borcu', alan: 'onceki_donem_borc' }
  }

  const openFeeModal = (row, alan) => {
    const fee = fees.find(f => f.client_id === row.id) || null
    const deger = Number(fee?.[alan]) || 0
    setFeeTutar(deger ? formatTurkishInput(String(deger)) : '')
    setFeeError('')
    setFeeModal({ clientId: row.id, name: row.name || row.company || 'Müşteri', alan, etiket: FEE_ALANLARI[alan]?.etiket || alan })
  }

  const saveFee = async (e) => {
    e.preventDefault()
    if (!feeModal) return
    const mevcut = fees.find(f => f.client_id === feeModal.clientId) || {}
    setFeeSaving(true)
    setFeeError('')
    try {
      await saveAccountingFee(feeModal.clientId, {
        onceki_donem_borc: feeModal.alan === 'onceki_donem_borc' ? feeTutar : (mevcut.onceki_donem_borc ?? 0),
        defter_tasdik_ucreti: feeModal.alan === 'defter_tasdik_ucreti' ? feeTutar : (mevcut.defter_tasdik_ucreti ?? 0),
        aylik_ucret: feeModal.alan === 'aylik_ucret' ? feeTutar : (mevcut.aylik_ucret ?? 0),
        baslangic_ay: mevcut.baslangic_ay || 1,
        baslangic_yil: mevcut.baslangic_yil || new Date().getFullYear(),
        notlar: mevcut.notlar || ''
      })
      setFeeModal(null)
      await loadData()
    } catch (err) {
      setFeeError(err?.message || 'Kaydedilemedi')
    } finally {
      setFeeSaving(false)
    }
  }

  // Online odeme linki (musteri bazli)
  const [selectedClient, setSelectedClient] = useState(null)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [linkAmount, setLinkAmount] = useState('')
  const [linkProvider, setLinkProvider] = useState('paytr')
  const [linkLoading, setLinkLoading] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkError, setLinkError] = useState('')
  const [linkMessage, setLinkMessage] = useState('')
  const [linkSending, setLinkSending] = useState('') // 'mail' | 'whatsapp' | ''

  useEffect(() => {
    loadData()
    getActivePaymentProvider().then(setLinkProvider).catch(() => setLinkProvider('paytr'))
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [f, p] = await Promise.all([getAllAccountingFees(), getAllPayments()])
      setFees(f)
      setPayments(p)
    } catch (err) {
      console.error('Veri yukleme hatasi:', err)
    } finally {
      setLoading(false)
    }
  }

  const simdi = new Date()
  const nowY = simdi.getFullYear()
  const nowM = simdi.getMonth() + 1

  const fmt = (n) => Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })

  // Her musteri icin matris satiri
  const tumSatirlar = clients.map(c => {
    const fee = fees.find(f => f.client_id === c.id) || null
    const clientPayments = payments.filter(p => p.client_id === c.id)
    const aylikUcret = Number(fee?.aylik_ucret) || 0
    const defterTasdik = Number(fee?.defter_tasdik_ucreti) || 0
    const oncekiDonem = Number(fee?.onceki_donem_borc) || 0

    // Tahsil edilen: her borc kalemi kendi tutariyla sinirli (cift/eski kayitlar fazla sayilmaz)
    const tahsilEden = (d) => clientPayments
      .filter(p => p.donem === d && p.durum !== 'reddedildi' &&
        (p.durum === 'onaylandi' || p.durum === 'uygulandi' || p.durum === 'alindi' || !p.durum || p.odeme_kanali === 'manuel'))
      .reduce((s, p) => s + (Number(p.tutar) || 0), 0)

    // Faturalanan ay sayisi: baslangictan (veya ilk odemenin yapildigi aydan) bugune
    const odenenAyListesi = Array.from({ length: 12 }, (_, i) => i + 1)
      .filter(m => tahsilEden(`${yil}-${String(m).padStart(2, '0')}`) > 0)
    const faturalananAy = (() => {
      if (yil > nowY) return 0
      const sonAy = yil === nowY ? nowM : 12
      let basA = 1
      if (fee) {
        const basY = Number(fee.baslangic_yil)
        if (basY && yil < basY) return 0
        if (basY === yil) basA = Number(fee.baslangic_ay) || 1
      }
      if (odenenAyListesi.length > 0) basA = Math.min(basA, Math.min(...odenenAyListesi))
      return Math.max(0, sonAy - basA + 1)
    })()

    // Onceki yillarin odenmemis aylik ucretleri: secili yildan onceki her yil icin
    // faturalanan ay borcu - o yila ait tahsilatlar. Yil degisince (orn. 2027'ye girince)
    // gecen yilin kalan borcu "Önceki Dönem"e otomatik eklenir.
    const gecmisKalan = (() => {
      if (aylikUcret <= 0) return 0
      // Baslangic yili: fee kaydindan; yoksa ilk ödemenin yilindan; o da yoksa önceki yıl yok
      const odemeYillari = clientPayments
        .filter(p => /^\d{4}-/.test(p.donem || ''))
        .map(p => Number(p.donem.slice(0, 4)))
      const basY = Number(fee?.baslangic_yil) || (odemeYillari.length ? Math.min(...odemeYillari) : yil)
      if (yil <= basY) return 0
      let toplam = 0
      for (let Y = basY; Y <= yil - 1; Y++) {
        if (Y > nowY) break
        const sonAy = Y === nowY ? nowM : 12
        let odendiTutar = 0
        for (let m = 1; m <= sonAy; m++) {
          odendiTutar += Math.min(tahsilEden(`${Y}-${String(m).padStart(2, '0')}`), aylikUcret)
        }
        toplam += Math.max(0, aylikUcret * sonAy - odendiTutar)
      }
      return toplam
    })()

    // Gostermekte oldugumuz önceki dönem: kayitli borç + önceki yillarin kalanı
    const oncekiDonemToplam = oncekiDonem + gecmisKalan

    const toplamBorc = aylikUcret * faturalananAy + defterTasdik + oncekiDonemToplam

    const odenen =
      Math.min(tahsilEden('Onceki Donem'), oncekiDonemToplam) +
      Math.min(tahsilEden('Defter Tasdik'), defterTasdik) +
      odenenAyListesi
        .reduce((s, m) => s + Math.min(tahsilEden(`${yil}-${String(m).padStart(2, '0')}`), aylikUcret), 0)

    return { ...c, fee, clientPayments, aylikUcret, defterTasdik, oncekiDonem, oncekiDonemToplam, faturalananAy, toplamBorc, odenen, kalan: toplamBorc - odenen }
  })

  const rows = tumSatirlar
    .filter(c => {
      if (searchTerm) {
        const s = searchTerm.toLowerCase()
        const name = (c.name || c.company || '').toLowerCase()
        if (!name.includes(s)) return false
      }
      // 2.7.574: Borc durumu filtresi KALAN borca gore.
      // - Borçlu: kalan borcu > 0 olanlar.
      // - Borcu Yok: borcu tamamen kapanmis olanlar — kalan <= 0 VE (ödeme
      //   yapmis VEYA borcu olmus). Ücret kaydı hiç girilmemiş (borcu da,
      //   ödemesi de olmayan) müşteriler iki listede de görünmez; yalnız "Tümü"de.
      if (filter === 'borcu_var') return c.kalan > 0
      if (filter === 'borcu_yok') return c.kalan <= 0 && (c.odenen > 0 || c.toplamBorc > 0)
      return true
    })
    .sort((a, b) => (a.name || a.company || '').localeCompare(b.name || b.company || '', 'tr'))

  // Ayin odeme durumu (manuel kayitlar ve alinan online odemeler = tahsil edildi)
  const monthStatus = (row, m) => {
    const key = `${yil}-${String(m).padStart(2, '0')}`
    const odedi = row.clientPayments.some(p => p.donem === key &&
      (p.durum === 'onaylandi' || p.durum === 'uygulandi' || p.durum === 'alindi' || !p.durum || p.odeme_kanali === 'manuel'))
    if (odedi) return 'odendi'
    const bekliyor = row.clientPayments.some(p => p.donem === key && p.durum === 'bekliyor')
    if (bekliyor) return 'bekliyor'
    if (yil > nowY) return 'yok'
    if (row.aylikUcret > 0) {
      if (yil === nowY && m === nowM) return 'bekliyor'
      if (yil < nowY || m < nowM) return 'geciken'
    }
    return 'yok'
  }

  // Defter Tasdik / Onceki Donem odeme durumu
  const kalemDurum = (row, kalemAd) => {
    const kayit = row.clientPayments.filter(p => p.donem === kalemAd && p.durum !== 'reddedildi')
    if (kayit.some(p => p.durum === 'onaylandi' || p.durum === 'uygulandi' || p.durum === 'alindi' || !p.durum || p.odeme_kanali === 'manuel')) return 'odendi'
    if (kayit.length > 0) return 'bekliyor'
    return 'yok'
  }

  // Ozet kartlari (yillik)
  const yillikTahsilat = tumSatirlar.reduce((s, r) => s + r.toplamBorc, 0)
  const odenenToplam = tumSatirlar.reduce((s, r) => s + r.odenen, 0)
  const gecikenToplam = tumSatirlar.reduce((s, r) => {
    if (r.aylikUcret <= 0 || yil > nowY) return s
    const sonAy = yil < nowY ? 12 : nowM - 1
    let odenmemisAy = 0
    for (let m = 1; m <= sonAy; m++) {
      if (monthStatus(r, m) === 'geciken') odenmemisAy++
    }
    return s + odenmemisAy * r.aylikUcret
  }, 0)
  const bekleyenToplam = Math.max(0, yillikTahsilat - odenenToplam - gecikenToplam)
  const yuzde = (bolen) => yillikTahsilat > 0 ? `${((bolen / yillikTahsilat) * 100).toFixed(1).replace('.', ',')}` : '0,0'

  // Aylik tahsilat toplamlari (donem bazli, tahsil edilen odemeler)
  const aylikTahsilatlar = AYLER.map((_, mi) => {
    const key = `${yil}-${String(mi + 1).padStart(2, '0')}`
    return payments
      .filter(p => p.donem === key && (p.durum === 'onaylandi' || p.durum === 'uygulandi' || p.durum === 'alindi' || !p.durum || p.odeme_kanali === 'manuel'))
      .reduce((s, p) => s + (Number(p.tutar) || 0), 0)
  })
  const aylikTahsilatToplam = aylikTahsilatlar.reduce((s, n) => s + n, 0)

  // ============ ODEME KAYDI MODAL ============
  // kalem: 1-12 (ay) veya 'Onceki Donem' / 'Defter Tasdik'
  const openOdemeModal = (row, kalem) => {
    const varsayilanTutar = kalem === 'Onceki Donem' ? row.oncekiDonemToplam
      : kalem === 'Defter Tasdik' ? row.defterTasdik
      : row.aylikUcret
    setOdemeForm({
      tutar: varsayilanTutar > 0 ? formatTurkishInput(varsayilanTutar.toFixed(2)) : '',
      odeme_tipi: 'nakit',
      odeme_tarihi: new Date().toISOString().split('T')[0],
      aciklama: ''
    })
    const donemKey = typeof kalem === 'number' ? `${yil}-${String(kalem).padStart(2, '0')}` : kalem
    const mevcut = row.clientPayments.filter(p => p.donem === donemKey && p.durum !== 'reddedildi')
    setOdemeModal({ clientId: row.id, name: row.name || row.company || 'Musteri', kalem, varsayilanTutar, mevcut })
    setFormError('')
  }

  // Yanlis isaretlenen odemeyi sil
  const handleSilPayment = async (paymentId) => {
    if (!confirm('Bu ödeme kaydını silmek istediğinizden emin misiniz?')) return
    try {
      await deletePayment(paymentId)
      const p = await getAllPayments()
      setPayments(p)
      setOdemeModal(m => {
        if (!m) return m
        const donemKey = typeof m.kalem === 'number' ? `${yil}-${String(m.kalem).padStart(2, '0')}` : m.kalem
        return { ...m, mevcut: p.filter(x => x.client_id === m.clientId && x.donem === donemKey && x.durum !== 'reddedildi') }
      })
    } catch (err) {
      alert('Ödeme silinemedi: ' + (err.message || 'Bilinmeyen hata'))
    }
  }

  const kalemBaslik = (kalem) => typeof kalem === 'number' ? `${AYLER[kalem - 1]} ${yil}` : kalem
  const kalemEtiket = (kalem) => kalem === 'Onceki Donem' ? 'Önceki Dönem Borcu' : kalem === 'Defter Tasdik' ? 'Defter Tasdik' : 'Aylık Ücret'

  const saveOdeme = async (event) => {
    event.preventDefault()
    if (!odemeModal) return
    const tutar = parseTurkishNumber(odemeForm.tutar)
    if (!tutar || tutar <= 0) {
      setFormError('Geçerli bir tutar girin. Örn: 8.000,00')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const kalem = odemeModal.kalem
      const donem = typeof kalem === 'number' ? `${yil}-${String(kalem).padStart(2, '0')}` : kalem
      const aciklamaDefault = typeof kalem === 'number' ? `${AYLER[kalem - 1]} ${yil} Muhasebe Ucreti` : `${kalem} Odemesi`
      await addPayment({
        client_id: odemeModal.clientId,
        tutar,
        odeme_tipi: odemeForm.odeme_tipi,
        odeme_kanali: 'manuel',
        durum: 'onaylandi',
        aciklama: odemeForm.aciklama || aciklamaDefault,
        donem,
        odeme_tarihi: odemeForm.odeme_tarihi || new Date().toISOString().split('T')[0]
      })
      setOdemeModal(null)
      const p = await getAllPayments()
      setPayments(p)
    } catch (err) {
      setFormError(err?.message || 'Ödeme kaydedilemedi.')
    } finally {
      setSaving(false)
    }
  }

  // ============ ONLINE ODEME LINKI ============
  const openLinkForm = async (row) => {
    setSelectedClient(row)
    const ozet = hesaplaBorcOzeti(row.fee, row.clientPayments)
    const tutar = ozet.kalanBorc > 0 ? Math.round(ozet.kalanBorc) : 0
    setLinkAmount(tutar > 0 ? String(tutar) : '')
    setLinkUrl('')
    setLinkError('')
    let bankInfo = null
    try { bankInfo = await getBankInfo() } catch { /* banka satiri atlanir */ }
    const mesaj = buildBorcMesaji({
      clientName: row?.name || row?.company || '',
      fee: row?.fee,
      ozet,
      bankInfo,
      linkUrl: ''
    })
    setLinkMessage(`${mesaj}\nKredi Kartı ile ödeme yapmak için linke tıklayın:`)
    setShowLinkModal(true)
  }

  const sendLinkViaEmail = async () => {
    if (!linkUrl) return
    if (!selectedClient?.email) {
      alert('Musterinin e-posta adresi kayitli degil. Musteri kartindan e-posta girin.')
      return
    }
    setLinkSending('mail')
    try {
      const fullMessage = `${linkMessage.trim()}\n${linkUrl}\n\nSaygilarimizla,`
      await sendEmail({
        toEmail: selectedClient.email,
        toName: selectedClient.name || selectedClient.company || '',
        subject: 'Online Odeme Linki - Muhasebe Ucreti',
        message: fullMessage,
        clientId: selectedClient.id
      })
      alert('Odeme linki e-posta ile gonderildi.')
    } catch (err) {
      alert('Mail gonderilemedi: ' + (err.message || 'Bilinmeyen hata'))
    } finally {
      setLinkSending('')
    }
  }

  const sendLinkViaWhatsApp = async () => {
    if (!linkUrl) return
    const phone = selectedClient?.phone || selectedClient?.telefon || ''
    if (!phone) {
      alert('Musterinin telefon numarasi kayitli degil. Musteri kartindan telefon girin.')
      return
    }
    setLinkSending('whatsapp')
    try {
      const fullMessage = `${linkMessage.trim()}\n${linkUrl}\n\nSaygilarimizla, MUBiS ERP`
      const settings = await getSettings().catch(() => null)
      const channel = getWhatsAppChannel(settings)
      if (channel === 'web') {
        openWhatsAppWeb({ phone, message: fullMessage })
        await logWhatsAppWebSend({ clientId: selectedClient.id, target: phone, status: 'pending' })
      } else {
        await sendShareDocumentsViaWhatsApp({ phone, message: fullMessage, settings })
      }
      alert('Odeme linki WhatsApp ile gonderildi.')
    } catch (err) {
      alert('WhatsApp gonderilemedi: ' + (err.message || 'Bilinmeyen hata'))
    } finally {
      setLinkSending('')
    }
  }

  const createPaymentLink = async (event) => {
    event.preventDefault()
    if (!selectedClient?.id) return
    const tutar = parseTurkishNumber(linkAmount)
    if (!tutar || tutar <= 0) {
      setLinkError('Gecerli bir tutar girin. Orn: 5.000,00')
      return
    }
    if (linkProvider === 'eft') {
      setLinkError('Aktif odeme saglayicisi EFT/Havale olarak secilmis. Ayarlar > Odeme Ayarlari bolumunden PayTR veya Odeal secin.')
      return
    }
    setLinkLoading(true)
    setLinkError('')
    try {
      const endpoint = linkProvider === 'odeal' ? '/api/odeal-payment' : '/api/paytr-payment'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: tutar,
          clientId: selectedClient.id,
          customerName: selectedClient.name || selectedClient.company || '',
          customerEmail: selectedClient.email || '',
          description: 'Muhasebe Ucreti Odemesi'
        })
      })
      const data = await res.json()
      if (data.success && data.paymentUrl) {
        setLinkUrl(data.paymentUrl)
        navigator.clipboard.writeText(data.paymentUrl).catch(() => {})
      } else {
        setLinkError(data.error || 'Link olusturulamadi')
      }
    } catch (err) {
      setLinkError('Hata: ' + (err.message || 'Bilinmeyen hata'))
    } finally {
      setLinkLoading(false)
    }
  }

  // ============ EXCEL AKTAR ============
  const exportExcel = () => {
    const durumText = { odendi: 'Ödendi', bekliyor: 'Bekliyor', geciken: 'Geciken', yok: '-' }
    const aoa = [['#', 'Adı Soyadı', 'Aylık Ücret', 'Defter Tasdik', 'Önceki Dönem', 'Toplam Borç', ...AYLER, 'Ödenen', 'Kalan']]
    rows.forEach((r, i) => {
      aoa.push([
        i + 1,
        r.name || r.company || '-',
        r.aylikUcret,
        r.defterTasdik,
        r.oncekiDonemToplam,
        r.toplamBorc,
        ...AYLER.map((_, m) => durumText[monthStatus(r, m + 1)] || '-'),
        r.odenen,
        r.kalan
      ])
    })
    aoa.push(['', 'Aylık Tahsilat', '', '', '', '', ...aylikTahsilatlar, aylikTahsilatToplam, ''])
    aoa.push([])
    aoa.push(['', 'GENEL TOPLAM', tumSatirlar.reduce((s, r) => s + r.aylikUcret, 0), tumSatirlar.reduce((s, r) => s + r.defterTasdik, 0), tumSatirlar.reduce((s, r) => s + r.oncekiDonemToplam, 0), yillikTahsilat, ...AYLER.map(() => ''), odenenToplam, yillikTahsilat - odenenToplam])
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Odeme Takip')
    XLSX.writeFile(wb, `muhasebe_hizmet_bedeli_${yil}.xlsx`)
  }

  // ============ PDF AKTAR ============
  const exportPDF = async () => {
    const durumText = { odendi: 'Ödendi', bekliyor: 'Bekliyor', geciken: 'Geciken', yok: '-' }
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })

    // Turkce karakter destekli font (yuklenemezse helvetica + ASCII yedegi)
    const font = await loadTurkishFont()
    const fontName = font ? 'DejaVuSans' : 'helvetica'
    if (font) {
      doc.addFileToVFS('DejaVuSans.ttf', font.base64)
      doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal')
    }
    const t = (v) => (font || typeof v !== 'string') ? v : trAscii(v)

    doc.setFont(fontName)
    doc.setFontSize(14)
    doc.setTextColor(30, 58, 138)
    doc.text(t(`Muhasebe Hizmet Bedeli Takibi - ${yil}`), 40, 32)
    doc.setFontSize(8)
    doc.setTextColor(100)
    doc.text(t(`Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')}`), 40, 46)

    const head = [t(['#', 'Adı Soyadı', 'Aylık Ücret', 'Defter Tasdik', 'Önceki Dönem', 'Toplam Borç', ...AYLER, 'Ödenen', 'Kalan'])]
    const body = rows.map((r, i) => [
      i + 1,
      kisaAd(r.name || r.company || '-'),
      r.aylikUcret > 0 ? fmt(r.aylikUcret) : '-',
      r.defterTasdik > 0 ? fmt(r.defterTasdik) : '-',
      r.oncekiDonemToplam > 0 ? fmt(r.oncekiDonemToplam) : '-',
      fmt(r.toplamBorc),
      ...AYLER.map((_, mi) => durumText[monthStatus(r, mi + 1)] || '-'),
      r.odenen > 0 ? fmt(r.odenen) : '-',
      r.kalan !== 0 ? fmt(r.kalan) : '-'
    ]).map(row => row.map(t))

    const foot = [
      ['', 'Aylık Tahsilat', '', '', '', '', ...aylikTahsilatlar.map(x => x > 0 ? fmt(x) : '-'), fmt(aylikTahsilatToplam), ''].map(t),
      ['', 'GENEL TOPLAM',
        fmt(tumSatirlar.reduce((s, r) => s + r.aylikUcret, 0)),
        fmt(tumSatirlar.reduce((s, r) => s + r.defterTasdik, 0)),
        fmt(tumSatirlar.reduce((s, r) => s + r.oncekiDonemToplam, 0)),
        fmt(yillikTahsilat),
        ...AYLER.map(() => ''),
        fmt(odenenToplam),
        fmt(yillikTahsilat - odenenToplam)
      ].map(t)
    ]

    autoTable(doc, {
      head,
      body,
      foot,
      startY: 58,
      styles: { font: fontName, fontSize: 6.5, cellPadding: 2 },
      headStyles: { font: fontName, fillColor: [30, 58, 138], textColor: 255, fontSize: 6.5 },
      footStyles: { font: fontName, fillColor: [30, 58, 95], textColor: 255, fontStyle: 'normal', fontSize: 6.5 },
      columnStyles: {
        0: { cellWidth: 18, halign: 'right' },
        1: { cellWidth: 120 },
        ...Array.from({ length: 12 }, (_, i) => ({ [i + 6]: { cellWidth: 30, halign: 'center' } })).reduce((a, b) => ({ ...a, ...b }), {}),
        18: { halign: 'right' },
        19: { halign: 'right', fontStyle: 'normal' }
      },
      didParseCell: (data) => {
        // Geciken ay hucrelerini kirmizi vurgula
        if (data.section === 'body' && data.column.index >= 6 && data.column.index <= 17) {
          const r = rows[data.row.index]
          if (r) {
            const durum = monthStatus(r, data.column.index - 5)
            if (durum === 'geciken') data.cell.styles.textColor = [220, 38, 38]
            else if (durum === 'odendi') data.cell.styles.textColor = [22, 163, 74]
            else if (durum === 'bekliyor') data.cell.styles.textColor = [202, 138, 4]
          }
        }
      }
    })

    doc.save(`muhasebe_hizmet_bedeli_${yil}.pdf`)
  }

  const hucreStil = (durum) => {
    switch (durum) {
      case 'odendi': return 'text-green-400'
      case 'bekliyor': return 'text-yellow-400'
      case 'geciken': return 'text-red-400'
      default: return 'text-gray-600'
    }
  }

  // ============ TOPLU BORC BILDIRIMI ============
  const toggleSecim = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const tumunuSec = () => setSelectedIds(selectedIds.length === rows.length ? [] : rows.map(r => r.id))

  const handleTopluGonder = async (channel) => {
    if (selectedIds.length === 0) return
    if (channel === 'whatsapp') {
      // Sirali gonderim: her mesaj tek tek yazilir, siz gonderdikce siradakine gecilir
      if (!confirm(`${selectedIds.length} müşteri için sıralı WhatsApp gönderimi başlatılsın mı?\n\nHer müşterinin mesajı tek tek açılacak; gönderdikçe "Sıradaki" ile devam edeceksiniz.\nBorcu olmayan müşteriler atlanır.`)) return
      setTopluGonderiyor(true)
      try {
        const liste = []
        for (const cid of selectedIds) {
          const p = await buildDebtPayload(cid)
          if (p) liste.push({ ...p, opened: false })
        }
        if (liste.length === 0) {
          alert('Seçilen müşterilerde borç bulunamadı veya ücret kaydı yok.')
          return
        }
        setWaQueue({ liste, index: 0 })
        setSelectedIds([])
      } catch (err) {
        alert('Hazırlık hatası: ' + (err.message || 'Bilinmeyen hata'))
      } finally {
        setTopluGonderiyor(false)
      }
      return
    }
    if (!confirm(`${selectedIds.length} müşteriye borç bildirimi (E-posta) göndermek istiyor musunuz?\n\nBorcu olmayan müşteriler atlanır.`)) return
    setTopluGonderiyor(true)
    try {
      const result = await sendBulkDebtNotifications(selectedIds, channel)
      if (result.failed === 0) {
        alert(`${result.sent} müşteriye borç bildirimi gönderildi.`)
      } else {
        const ilkHata = result.errors[0]?.error || ''
        alert(`${result.sent} gönderildi, ${result.failed} başarısız.${ilkHata ? `\nÖrnek hata: ${ilkHata}` : ''}`)
      }
      setSelectedIds([])
    } catch (err) {
      alert('Gönderim hatası: ' + (err.message || 'Bilinmeyen hata'))
    } finally {
      setTopluGonderiyor(false)
    }
  }

  // Sirali WhatsApp: mesaji wa.me uzerinden ac
  const waMesajiAc = () => {
    const aktif = waQueue?.liste[waQueue.index]
    if (!aktif) return
    if (!aktif.phone) { alert('Müşterinin WhatsApp numarası kayıtlı değil.'); return }
    openWhatsAppWeb({ phone: aktif.phone, message: aktif.message })
    setWaQueue(q => {
      const liste = [...q.liste]
      liste[q.index] = { ...liste[q.index], opened: true }
      return { ...q, liste }
    })
  }

  // Siradaki musteriye gec (veya bitir)
  const waIlerle = () => {
    setWaQueue(q => {
      if (!q) return null
      if (q.index + 1 >= q.liste.length) {
        const acilan = q.liste.filter(x => x.opened).length
        setTimeout(() => alert(`Tamamlandı! ${acilan}/${q.liste.length} müşteriye mesaj açıldı.`), 0)
        return null
      }
      return { ...q, index: q.index + 1 }
    })
  }

  const HucreIkon = ({ durum }) => {
    switch (durum) {
      case 'odendi': return <CheckCircle className="w-4 h-4" />
      case 'bekliyor': return <Clock className="w-4 h-4" />
      case 'geciken': return <AlertTriangle className="w-4 h-4" />
      default: return <Minus className="w-4 h-4" />
    }
  }

  const waAktif = waQueue ? waQueue.liste[waQueue.index] : null

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Baslik ve kontroller */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-2">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <DollarSign className="w-8 h-8 text-yellow-400" />
            <span>Muhasebe Hizmet Bedeli Takibi</span>
          </h1>
          <p className="text-gray-400 mt-1">Müşterilerinizin aylık muhasebe ödemelerini kolayca takip edin.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={yil} onChange={(e) => setYil(Number(e.target.value))}
            className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400">
            {Array.from({ length: 4 }, (_, i) => nowY - 2 + i).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => setBuAyVurgu(!buAyVurgu)}
            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${buAyVurgu ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400' : 'bg-blue-900/30 border-blue-700/50 text-gray-300 hover:text-white'}`}>
            Bu Ay
          </button>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}
            className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400">
            <option value="all">Tümü</option>
            <option value="borcu_var">Borçlu</option>
            <option value="borcu_yok">Borcu Yok</option>
          </select>
          {selectedIds.length > 0 && (
            <>
              <button onClick={() => handleTopluGonder('whatsapp')} disabled={topluGonderiyor}
                className="bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-green-500 disabled:opacity-50 transition-colors">
                <MessageCircle className="w-4 h-4" /> {topluGonderiyor ? 'Gönderiliyor...' : `WhatsApp (${selectedIds.length})`}
              </button>
              <button onClick={() => handleTopluGonder('email')} disabled={topluGonderiyor}
                className="bg-blue-500 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-blue-400 disabled:opacity-50 transition-colors">
                <Mail className="w-4 h-4" /> {topluGonderiyor ? 'Gönderiliyor...' : `Mail (${selectedIds.length})`}
              </button>
            </>
          )}
          <button onClick={exportExcel} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-green-500 transition-colors">
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </button>
          <button onClick={exportPDF} className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-red-400 transition-colors">
            <FileText className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      {/* Ozet kartlari */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 my-6">
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0"><Users className="w-5 h-5 text-blue-400" /></div>
          <div>
            <p className="text-gray-400 text-xs">Toplam Müşteri</p>
            <p className="text-xl font-bold text-white">{tumSatirlar.length}</p>
          </div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-green-500/20 flex items-center justify-center shrink-0"><DollarSign className="w-5 h-5 text-green-400" /></div>
          <div>
            <p className="text-gray-400 text-xs">Toplam Borç (Bugüne Kadar)</p>
            <p className="text-xl font-bold text-white">₺ {fmt(yillikTahsilat)}</p>
          </div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-green-500/20 flex items-center justify-center shrink-0"><CheckCircle className="w-5 h-5 text-green-400" /></div>
          <div>
            <p className="text-gray-400 text-xs">Ödenen</p>
            <p className="text-xl font-bold text-green-400">₺ {fmt(odenenToplam)} <span className="text-xs font-normal text-gray-400">%{yuzde(odenenToplam)}</span></p>
          </div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-yellow-500/20 flex items-center justify-center shrink-0"><Clock className="w-5 h-5 text-yellow-400" /></div>
          <div>
            <p className="text-gray-400 text-xs">Bekleyen</p>
            <p className="text-xl font-bold text-yellow-400">₺ {fmt(bekleyenToplam)} <span className="text-xs font-normal text-gray-400">%{yuzde(bekleyenToplam)}</span></p>
          </div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0"><AlertTriangle className="w-5 h-5 text-red-400" /></div>
          <div>
            <p className="text-gray-400 text-xs">Geciken</p>
            <p className="text-xl font-bold text-red-400">₺ {fmt(gecikenToplam)} <span className="text-xs font-normal text-gray-400">%{yuzde(gecikenToplam)}</span></p>
          </div>
        </div>
      </div>

      {/* Arama */}
      <div className="relative max-w-md mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input type="text" placeholder="Müşteri ara (ad, unvan)..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 pl-9 pr-3 text-white text-sm focus:outline-none focus:border-yellow-400" />
      </div>

      {/* Matris tablo — fareyle tutup sürükleyerek kaydırılabilir */}
      <div className="bg-blue-800/20 rounded-2xl border border-blue-700/30 overflow-hidden">
        <div ref={tabloRef} className="overflow-x-auto cursor-grab active:cursor-grabbing select-none"
          onMouseDown={tabloMouseDown} onMouseMove={tabloMouseMove} onMouseUp={tabloMouseUp} onMouseLeave={tabloMouseUp}
          onClickCapture={tabloClickKontrol}>
          <table className="w-full text-sm">
            <thead className="bg-blue-900/30">
              <tr className="text-gray-400 text-xs whitespace-nowrap">
                <th className="sticky left-0 z-20 bg-[#274a8f] px-3 py-3 text-left w-12">#</th>
                <th className="sticky z-20 bg-[#274a8f] px-3 py-3 text-left min-w-[180px]" style={{ left: 48 }}>
                  <span className="flex items-center gap-2">
                    <input type="checkbox" checked={rows.length > 0 && selectedIds.length === rows.length} onChange={tumunuSec}
                      className="accent-yellow-400 w-3.5 h-3.5 cursor-pointer" title="Tümünü seç / kaldır" />
                    Adı Soyadı
                  </span>
                </th>
                <th className="sticky z-10 bg-[#274a8f] px-3 py-3 text-right min-w-[110px]" style={{ left: 228 }}>Aylık Ücret</th>
                <th className="sticky z-10 bg-[#274a8f] px-3 py-3 text-right min-w-[110px]" style={{ left: 338 }}>Defter Tasdik</th>
                <th className="sticky z-10 bg-[#274a8f] px-3 py-3 text-right min-w-[110px]" style={{ left: 448 }}>Önceki Dönem</th>
                <th className="sticky z-10 bg-[#274a8f] px-3 py-3 text-right min-w-[110px] shadow-[6px_0_10px_-4px_rgba(0,0,0,0.45)]" style={{ left: 558 }}>Toplam Borç</th>
                {AYLER.map((ay, i) => (
                  <th key={ay} className={`px-2 py-3 text-center ${buAyVurgu && yil === nowY && i + 1 === nowM ? 'bg-yellow-500/10 text-yellow-400 ring-1 ring-inset ring-yellow-500/30' : ''}`}>{ay}</th>
                ))}
                <th className="px-3 py-3 text-right">Ödenen</th>
                <th className="px-3 py-3 text-right">Kalan</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="19" className="text-center py-8 text-gray-400">Yükleniyor...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan="19" className="text-center py-8 text-gray-500">Kayıt bulunamadı</td></tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={r.id} className="border-t border-blue-700/20 hover:bg-blue-800/10 transition-colors">
                    <td className="sticky left-0 z-10 bg-[#1f3d78] px-3 py-2 text-gray-500 w-12">{i + 1}</td>
                    <td className="sticky z-10 bg-[#1f3d78] px-3 py-2 whitespace-nowrap min-w-[180px]" style={{ left: 48 }}>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => toggleSecim(r.id)}
                          className="accent-yellow-400 w-3.5 h-3.5 cursor-pointer shrink-0" />
                        <span className="text-white font-medium" title={r.name || r.company || ''}>{kisaAd(r.name || r.company || '-')}</span>
                        {linkProvider !== 'eft' && (
                          <button onClick={() => openLinkForm(r)} title="Online Ödeme Linki Gönder"
                            className="p-1 rounded text-purple-400 hover:bg-purple-500/20 transition-colors">
                            <CreditCard className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="sticky z-10 bg-[#1f3d78] px-3 py-2 text-right text-gray-300 whitespace-nowrap min-w-[110px]" style={{ left: 228 }}>
                      <button type="button" onClick={() => openFeeModal(r, 'aylik_ucret')} title="Aylık ücreti düzenle"
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-blue-700/40 hover:text-white transition-colors">
                        {r.aylikUcret > 0 ? `₺ ${fmt(r.aylikUcret)}` : <span className="text-gray-600">-</span>}
                        <Pencil className="w-3 h-3 text-blue-300/70" />
                      </button>
                    </td>
                    <td className="sticky z-10 bg-[#1f3d78] px-3 py-2 text-right whitespace-nowrap min-w-[110px]" style={{ left: 338 }}>
                      {(() => {
                        const durum = kalemDurum(r, 'Defter Tasdik')
                        if (durum !== 'yok') {
                          return (
                            <button onClick={() => openOdemeModal(r, 'Defter Tasdik')}
                              title={durum === 'odendi' ? 'Ödendi - tıklayıp kayıtlı ödemeyi silebilirsiniz' : 'Bekliyor - tıklayıp kayıtlı ödemeyi görün'}
                              className={`w-7 h-7 mx-auto rounded-full flex items-center justify-center transition-all ${hucreStil(durum)} hover:bg-blue-700/40 hover:scale-110 cursor-pointer`}>
                              <HucreIkon durum={durum} />
                            </button>
                          )
                        }
                        if (r.defterTasdik > 0) {
                          return (
                            <button onClick={() => openOdemeModal(r, 'Defter Tasdik')}
                              title="Defter Tasdik - ödeme kaydı ekle"
                              className="inline-flex items-center gap-1 text-gray-300 hover:text-green-400 hover:bg-blue-700/40 rounded px-1.5 py-0.5 transition-colors">
                              ₺ {fmt(r.defterTasdik)} <Plus className="w-3 h-3 text-green-400" />
                            </button>
                          )
                        }
                        return <span className="text-gray-600">-</span>
                      })()}
                      <button type="button" onClick={() => openFeeModal(r, 'defter_tasdik_ucreti')} title="Defter tasdik tutarını düzenle"
                        className="inline-flex items-center p-1 rounded text-blue-300/70 hover:text-blue-300 hover:bg-blue-700/40 transition-colors">
                        <Pencil className="w-3 h-3" />
                      </button>
                    </td>
                    <td className="sticky z-10 bg-[#1f3d78] px-3 py-2 text-right whitespace-nowrap min-w-[110px]" style={{ left: 448 }}>
                      {(() => {
                        const durum = kalemDurum(r, 'Onceki Donem')
                        if (durum !== 'yok') {
                          return (
                            <button onClick={() => openOdemeModal(r, 'Onceki Donem')}
                              title={durum === 'odendi' ? 'Ödendi - tıklayıp kayıtlı ödemeyi silebilirsiniz' : 'Bekliyor - tıklayıp kayıtlı ödemeyi görün'}
                              className={`w-7 h-7 mx-auto rounded-full flex items-center justify-center transition-all ${hucreStil(durum)} hover:bg-blue-700/40 hover:scale-110 cursor-pointer`}>
                              <HucreIkon durum={durum} />
                            </button>
                          )
                        }
                        if (r.oncekiDonemToplam > 0) {
                          return (
                            <button onClick={() => openOdemeModal(r, 'Onceki Donem')}
                              title="Önceki Dönem Borcu - ödeme kaydı ekle"
                              className="inline-flex items-center gap-1 text-red-400 hover:text-red-300 hover:bg-blue-700/40 rounded px-1.5 py-0.5 transition-colors">
                              ₺ {fmt(r.oncekiDonemToplam)} <Plus className="w-3 h-3 text-green-400" />
                            </button>
                          )
                        }
                        return <span className="text-gray-600">-</span>
                      })()}
                      <button type="button" onClick={() => openFeeModal(r, 'onceki_donem_borc')} title="Önceki dönem borcu tutarını düzenle"
                        className="inline-flex items-center p-1 rounded text-blue-300/70 hover:text-blue-300 hover:bg-blue-700/40 transition-colors">
                        <Pencil className="w-3 h-3" />
                      </button>
                    </td>
                    <td className="sticky z-10 bg-[#1f3d78] px-3 py-2 text-right text-yellow-400 font-medium whitespace-nowrap min-w-[110px] shadow-[6px_0_10px_-4px_rgba(0,0,0,0.45)]" style={{ left: 558 }}>₺ {fmt(r.toplamBorc)}</td>
                    {AYLER.map((_, mi) => {
                      const m = mi + 1
                      const durum = monthStatus(r, m)
                      return (
                        <td key={m} className={`px-1 py-2 text-center ${buAyVurgu && yil === nowY && m === nowM ? 'bg-yellow-500/5' : ''}`}>
                          <button
                            onClick={() => openOdemeModal(r, m)}
                            title={durum === 'odendi' ? 'Ödendi - tıklayıp kayıtlı ödemeyi silebilirsiniz' : durum === 'bekliyor' ? 'Bekliyor - tıklayıp ödeme kaydı girin' : durum === 'geciken' ? 'Geciken - tıklayıp ödeme kaydı girin' : 'Ödeme kaydı ekle'}
                            className={`w-7 h-7 mx-auto rounded-full flex items-center justify-center transition-all ${hucreStil(durum)} hover:bg-blue-700/40 hover:scale-110 cursor-pointer`}
                          >
                            <HucreIkon durum={durum} />
                          </button>
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 text-right text-green-400 whitespace-nowrap">{r.odenen > 0 ? `₺ ${fmt(r.odenen)}` : '-'}</td>
                    <td className={`px-3 py-2 text-right font-bold whitespace-nowrap ${r.kalan > 0 ? 'text-red-400' : r.kalan < 0 ? 'text-blue-400' : 'text-green-400'}`}>
                      {r.kalan !== 0 ? `₺ ${fmt(r.kalan)}` : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-blue-900/50 border-t-2 border-blue-700/40 text-xs">
                <td colSpan="6" className="px-3 py-2 text-right text-gray-400 whitespace-nowrap">Aylık Tahsilat →</td>
                {aylikTahsilatlar.map((toplam, mi) => (
                  <td key={mi} className={`px-1 py-2 text-center whitespace-nowrap ${toplam > 0 ? 'text-green-400 font-semibold' : 'text-gray-600'} ${buAyVurgu && yil === nowY && mi + 1 === nowM ? 'bg-yellow-500/5' : ''}`}>
                    {toplam > 0 ? fmt(toplam) : '-'}
                  </td>
                ))}
                <td className="px-3 py-2 text-right text-green-400 font-bold whitespace-nowrap">{fmt(aylikTahsilatToplam)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Alt bilgi: renkler + genel toplamlar */}
        <div className="bg-blue-900/40 border-t border-blue-700/30 px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400">
            <span className="font-medium text-white">Durum Renkleri:</span>
            <span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-green-400" /> Ödendi</span>
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-yellow-400" /> Bekliyor</span>
            <span className="flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-red-400" /> Geciken</span>
            <span className="flex items-center gap-1"><Minus className="w-3.5 h-3.5 text-gray-500" /> Ödeme Yok</span>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div>
              <p className="text-xs text-gray-400">Genel Toplam</p>
              <p className="font-bold text-white">₺ {fmt(yillikTahsilat)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Toplam Ödenen</p>
              <p className="font-bold text-green-400">₺ {fmt(odenenToplam)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Toplam Kalan</p>
              <p className="font-bold text-red-400">₺ {fmt(yillikTahsilat - odenenToplam)}</p>
            </div>
          </div>
        </div>
      </div>
      <p className="text-gray-500 text-xs mt-2">Ay hücresine tıklayarak o ay için ödeme kaydı girebilirsiniz. Müşteri adının yanındaki kart simgesi online ödeme linki gönderir.</p>

      {/* 2.8.320: Aylık Ücret / Defter Tasdik / Önceki Dönem tutarı düzenleme */}
      {feeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setFeeModal(null)}>
          <div className="bg-blue-900 rounded-2xl border border-blue-700/50 shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-blue-700/30">
              <h3 className="text-lg font-bold text-white">{feeModal.etiket} Düzenle</h3>
              <button onClick={() => setFeeModal(null)} className="text-gray-400 hover:text-white p-1"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={saveFee} className="p-5 space-y-4">
              <div>
                <p className="text-xs text-gray-400">Müşteri</p>
                <p className="text-white font-medium">{kisaAd(feeModal.name)}</p>
              </div>
              <label className="block space-y-1">
                <span className="text-xs text-gray-400">{feeModal.etiket} (TL)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={feeTutar}
                  onChange={(e) => setFeeTutar(hamTutarGirdisi(e.target.value))}
                  onBlur={(e) => { const h = hamTutarGirdisi(e.target.value); if (h && h !== ',') setFeeTutar(formatTurkishInput(h)) }}
                  placeholder="0,00"
                  required
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                />
              </label>
              {feeError && <p className="text-red-400 text-xs">{feeError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setFeeModal(null)} className="px-4 py-2 rounded-lg bg-blue-800/40 text-gray-300 text-sm hover:bg-blue-800/60">Vazgeç</button>
                <button type="submit" disabled={feeSaving} className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 disabled:opacity-50">
                  {feeSaving ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Odeme Kaydi Modal */}
      {odemeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setOdemeModal(null)}>
          <div className="bg-blue-900 rounded-2xl border border-blue-700/50 shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-blue-700/30">
              <h3 className="text-lg font-bold text-white">Ödeme Kaydı - {kalemBaslik(odemeModal.kalem)}</h3>
              <button onClick={() => setOdemeModal(null)} className="text-gray-400 hover:text-white p-1"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={saveOdeme} className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400">Müşteri</p>
                  <p className="text-white font-medium" title={odemeModal.name}>{kisaAd(odemeModal.name)}</p>
                </div>
                {odemeModal.varsayilanTutar > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-gray-400">{kalemEtiket(odemeModal.kalem)}</p>
                    <p className="text-blue-400 font-bold">₺ {fmt(odemeModal.varsayilanTutar)}</p>
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-2">Ödeme Türü</label>
                <div className="grid grid-cols-3 gap-2">
                  {ODEME_TURLERI.map(t => (
                    <button type="button" key={t.value} onClick={() => setOdemeForm(f => ({ ...f, odeme_tipi: t.value }))}
                      className={`px-2 py-2 rounded-lg text-xs font-medium border transition-all ${odemeForm.odeme_tipi === t.value ? t.renk : 'bg-blue-900/30 border-blue-700/40 text-gray-400 hover:text-white'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block space-y-1">
                <span className="text-xs text-gray-400">Ödeme Tarihi</span>
                <input type="date" value={odemeForm.odeme_tarihi}
                  onChange={(e) => setOdemeForm(f => ({ ...f, odeme_tarihi: e.target.value }))}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-gray-400">Tutar (TL)</span>
                <input type="text" inputMode="decimal" value={odemeForm.tutar} required
                  onChange={(e) => setOdemeForm(f => ({ ...f, tutar: hamTutarGirdisi(e.target.value) }))}
                  onBlur={(e) => { const h = hamTutarGirdisi(e.target.value); if (h && h !== ',') setOdemeForm(f => ({ ...f, tutar: formatTurkishInput(h) })) }}
                  placeholder="8.000,00"
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-gray-400">Açıklama (opsiyonel)</span>
                <input type="text" value={odemeForm.aciklama}
                  onChange={(e) => setOdemeForm(f => ({ ...f, aciklama: e.target.value }))}
                  placeholder="Açıklama"
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
              </label>
              {odemeModal.mevcut?.length > 0 && (
                <div className="rounded-lg border border-blue-700/40 bg-blue-950/30 p-3">
                  <p className="text-xs text-gray-400 mb-2">Bu dönem için kayıtlı ödemeler (yanlış işaretlemeyi silebilirsiniz):</p>
                  <div className="space-y-1">
                    {odemeModal.mevcut.map(mp => (
                      <div key={mp.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-gray-300 truncate">
                          {mp.odeme_tarihi || '-'} • {mp.odeme_tipi === 'eft' ? 'EFT/Havale' : mp.odeme_tipi === 'kredi_karti' ? 'Kredi Kartı' : 'Nakit'}
                          {mp.aciklama ? <span className="text-gray-500"> • {mp.aciklama}</span> : null}
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-green-400 font-medium">{fmt(mp.tutar)} TL</span>
                          <button type="button" onClick={() => handleSilPayment(mp.id)} title="Ödemeyi Sil"
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded p-1 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {formError && <p className="text-red-400 text-xs">{formError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOdemeModal(null)} className="px-4 py-2 rounded-lg bg-blue-800/40 text-gray-300 text-sm hover:bg-blue-800/60">Vazgeç</button>
                <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 disabled:opacity-50">
                  {saving ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Online Odeme Linki Modal */}
      {showLinkModal && selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => { setShowLinkModal(false); setShowLinkModal(false) }}>
          <div className="bg-blue-900 rounded-2xl border border-purple-700/50 shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-blue-700/30">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2"><CreditCard className="w-5 h-5 text-purple-400" /> Online Ödeme Linki ({linkProvider === 'odeal' ? 'Odeal' : 'PayTR'})</h3>
                <p className="text-gray-400 text-sm">{selectedClient.name || selectedClient.company}</p>
              </div>
              <button onClick={() => setShowLinkModal(false)} className="text-gray-400 hover:text-white p-1"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={createPaymentLink} className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-xs text-gray-400">Ödeme Tutarı (TL)</span>
                  <input type="text" inputMode="decimal" value={linkAmount} required
                    onChange={(e) => setLinkAmount(hamTutarGirdisi(e.target.value))}
                    onBlur={(e) => { const h = hamTutarGirdisi(e.target.value); if (h && h !== ',') setLinkAmount(formatTurkishInput(h)) }}
                    placeholder="5.000,00"
                    className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
                </label>
                <div className="flex items-end">
                  <button type="submit" disabled={linkLoading} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 w-full">
                    {linkLoading ? 'Link Oluşturuluyor...' : 'Link Oluştur'}
                  </button>
                </div>
              </div>
              {linkError && <p className="text-red-400 text-xs">{linkError}</p>}
              {linkUrl && (
                <div className="rounded-lg bg-blue-900/40 border border-purple-500/30 p-3 space-y-3">
                  <p className="text-green-400 text-xs font-medium">Link oluşturuldu ve panoya kopyalandı:</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input type="text" readOnly value={linkUrl} className="flex-1 min-w-[180px] bg-blue-950/50 border border-purple-500/30 rounded-lg px-3 py-2 text-white text-xs" />
                    <button type="button" onClick={() => { navigator.clipboard.writeText(linkUrl); alert('Link panoya kopyalandi.') }} className="px-3 py-2 bg-purple-500 text-white rounded-lg text-xs font-medium hover:bg-purple-400 flex items-center gap-1">
                      <Copy className="w-3.5 h-3.5" /> Kopyala
                    </button>
                    <button type="button" onClick={sendLinkViaEmail} disabled={linkSending === 'mail'} className="px-3 py-2 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-400 flex items-center gap-1 disabled:opacity-50">
                      <Mail className="w-3.5 h-3.5" /> {linkSending === 'mail' ? 'Gönderiliyor...' : 'Mail'}
                    </button>
                    <button type="button" onClick={sendLinkViaWhatsApp} disabled={linkSending === 'whatsapp'} className="px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-500 flex items-center gap-1 disabled:opacity-50">
                      <MessageCircle className="w-3.5 h-3.5" /> {linkSending === 'whatsapp' ? 'Gönderiliyor...' : 'WhatsApp'}
                    </button>
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs block mb-1">Açıklama (mesajın metni, link otomatik eklenir)</label>
                    <textarea value={linkMessage} onChange={(e) => setLinkMessage(e.target.value)} rows={5}
                      className="w-full bg-blue-950/50 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                    <p className="text-gray-500 text-[11px] mt-1">Mail veya WhatsApp butonuna bastığınızda bu açıklama + ödeme linki birlikte gönderilir.</p>
                  </div>
                </div>
              )}
              <div className="flex justify-end">
                <button type="button" onClick={() => setShowLinkModal(false)} className="bg-yellow-500 text-blue-950 px-4 py-2 rounded-lg text-sm font-semibold">Kapat</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sirali WhatsApp Gonderim Modal */}
      {waAktif && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-blue-900 rounded-2xl border border-green-700/50 shadow-2xl w-full max-w-xl">
            <div className="flex items-center justify-between p-5 border-b border-blue-700/30">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2"><MessageCircle className="w-5 h-5 text-green-400" /> Sıralı WhatsApp Gönderimi</h3>
                <p className="text-gray-400 text-sm">{waQueue.index + 1} / {waQueue.liste.length} • {kisaAd(waAktif.clientName)} • Kalan Borç: {fmt(waAktif.kalanBorc)} TL</p>
              </div>
              <button onClick={() => { if (confirm('Gönderimden çıkmak istiyor musunuz? Kalan müşteriler atlanacak.')) setWaQueue(null) }} className="text-gray-400 hover:text-white p-1"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <textarea readOnly value={waAktif.message} rows={9}
                className="w-full bg-blue-950/50 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
              {!waAktif.phone && <p className="text-red-400 text-xs">Bu müşterinin WhatsApp numarası kayıtlı değil — atlayabilirsiniz.</p>}
              <div className="flex flex-wrap justify-end gap-2">
                <button onClick={waIlerle} className="px-4 py-2 rounded-lg bg-blue-800/40 text-gray-300 text-sm hover:bg-blue-800/60">Atla</button>
                {!waAktif.opened ? (
                  <button onClick={waMesajiAc} disabled={!waAktif.phone} className="px-5 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-500 disabled:opacity-50">
                    WhatsApp'ta Aç
                  </button>
                ) : (
                  <button onClick={waIlerle} className="px-5 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-500">
                    Gönderildi - Sıradaki
                  </button>
                )}
              </div>
              <p className="text-gray-500 text-[11px]">WhatsApp sekmesi açılır, mesaj otomatik yazılır. Gönderdikten sonra "Gönderildi - Sıradaki" ile devam edin.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
