import { useState, useEffect, useRef, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import { searchNace, formatNaceCode, getNaceDesc, naceAciklama, naceSadeceKod } from '../utils/naceCodes'
import { KIRA_STOPAJ_ORANI, kiraGecmisi, paraTR, tarihTR } from '../utils/kiraUtils'
import * as XLSX from 'xlsx'
import { 
  ArrowLeft, Building2, User, Phone, Mail, MapPin, 
  FileText, Calendar, Edit3, Plus, Trash2, Save, X, History,
  Globe, CreditCard, Hash, ListChecks, Shield,
  Briefcase, Tag, Upload, Search, Home, ExternalLink,
  Eye, EyeOff, Lock, Landmark, KeyRound, Receipt, Users, AlertTriangle, DollarSign,
  Send, MessageCircle, Download, Camera, CheckCircle, BookOpen,
  FolderOpen, FileSearch, Inbox, MessageSquare, Smartphone, Copy
} from 'lucide-react'
import { getAccountPlans, saveAccountPlans, getEmployees, addEmployee, updateEmployee, deleteEmployee, saveEmployeesFromExcel, getPartners, addPartner, updatePartner, deletePartner, setEdevletAktifPartner, updateClient as updateClientDb, addClient, findClientByTcVkn } from '../services/clientService'
import { getAccountingFee, saveAccountingFee, getPayments, addPayment, deletePayment, updatePayment, hesaplaBorcOzeti, openReceipt, applyPaymentToDebt, rejectPayment, normalizeDonem } from '../services/paymentService'
import { createNotification } from '../services/notificationService'
import { uploadGelirBeyanDocument, uploadGeciciVergiDocument, uploadVergiLevhasi, uploadMaliEvrak, uploadAdminDocument, uploadMakbuz, uploadPaymentMakbuz, analyzePersonnelDocument } from '../services/documentService'
import { etebligatlariGetirVeYukle } from '../services/gibIndirmeService'
import { getAppSetting, setAppSetting, deleteAppSetting } from '../services/settingsService'
import { gibYardimciIs, edevletKimlikGetir } from '../utils/gibOdemeHelper'
import { tecilliPlanPdfOku } from '../services/tecilliService'
import { ASGARI_UCRET, nettenBrute } from '../data/defaults'
import { formatTurkishInput, parseTurkishNumber, parseMoneyInput, formatMoney, hamTutarGirdisi } from '../utils/numberFormat'
import { formatDateTR } from '../utils/dateUtils'
import { supabase } from '../lib/supabase'
import KiraTalepOnay from '../components/KiraTalepOnay'
import PortalErisimKarti from '../components/PortalErisimKarti'
import PortalOtomasyonKarti from '../components/PortalOtomasyonKarti'
// YardimciSurumUyari App.jsx'te global render ediliyor; burada import gerekmez

// Musteri portalindaki sekmelere karsi gelen moduller. Varsayilan: ACIK
// (clients tablosunda alan tanimsizsa/null'sa modul gorunur; false yazilirsa kapanir).
const PORTAL_MODULLERI = [
  { alan: 'evraklarim_modulu', camel: 'evraklarimModulu', label: 'Evraklarım', icon: FolderOpen },
  { alan: 'beyannamelerim_modulu', camel: 'beyannamelerimModulu', label: 'Beyannamelerim', icon: FileSearch },
  { alan: 'faturalarim_modulu', camel: 'faturalarimModulu', label: 'Faturalarım', icon: Receipt },
  { alan: 'kdv_dokumleri_modulu', camel: 'kdvDokumleriModulu', label: 'KDV Dökümleri', icon: FileText },
  { alan: 'etebligatlarim_modulu', camel: 'etebligatlarimModulu', label: 'e-Tebligatlarım', icon: Inbox },
  { alan: 'muhasebe_borcum_modulu', camel: 'muhasebeBorcumModulu', label: 'Muhasebe Borcum', icon: DollarSign },
  { alan: 'mesajlarim_modulu', camel: 'mesajlarimModulu', label: 'Mesajlarım', icon: MessageSquare },
  { alan: 'kira_stopaj_modulu', camel: 'kiraStopajModulu', label: 'Kira Stopaj Listesi', icon: FileText },
  { alan: 'belge_yukle_modulu', camel: 'belgeYukleModulu', label: 'Belge Yükle', icon: Camera },
]

export default function ClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { updateClient } = useAuth()
  const { clients, refresh: refreshClients } = useClients()
  const [client, setClient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [activeTab, setActiveTab] = useState('info')
  const [editData, setEditData] = useState({})
  // e-Devlet islemleri (e-Tebligat getir / SGK prim ode)
  const [edevletIslem, setEdevletIslem] = useState(null) // 'etebligat' | 'sgk' | null
  const [edevletDurum, setEdevletDurum] = useState('')
  // Tecilli Tahsilat odeme plani
  const [tecilliYukleniyor, setTecilliYukleniyor] = useState(false)
  const [tahakkukTercihKaydediyor, setTahakkukTercihKaydediyor] = useState(false)
  const [waOptOutKaydediyor, setWaOptOutKaydediyor] = useState(false)
  const [tecilliDurum, setTecilliDurum] = useState('')
  const tecilliFileRef = useRef(null)
  const [hesapKodlari, setHesapKodlari] = useState([])
  const [hesapBasamak, setHesapBasamak] = useState('1')
  const [hesapSearch, setHesapSearch] = useState('')
  const [naceResults, setNaceResults] = useState([])
  const [showNaceDropdown, setShowNaceDropdown] = useState(false)
  const hesapFileRef = useRef(null)
  const bordroFileRef = useRef(null)
  // Personel
  const [personelList, setPersonelList] = useState([])
  const [showPersonelForm, setShowPersonelForm] = useState(false)
  const [editPersonelId, setEditPersonelId] = useState(null)
  const [personelForm, setPersonelForm] = useState({ ad_soyad: '', tc_kimlik: '', ise_giris: '', isten_cikis: '', brut_ucret: '', dogum_tarihi: '', sgk_durumu: 'calisan', ise_giris_bildirge_url: '', isten_cikis_bildirge_url: '' })
  const [personelUcretTipi, setPersonelUcretTipi] = useState('brut')
  const [personelAsgariUcret, setPersonelAsgariUcret] = useState(false)
  // Personel bildirge yukleme (AI ile oku)
  const [bildirgeYukleniyor, setBildirgeYukleniyor] = useState(null) // 'ise_giris' | 'isten_cikis' | null
  const [bildirgeHata, setBildirgeHata] = useState('')
  const iseGirisBildirgeRef = useRef(null)
  const istenCikisBildirgeRef = useRef(null)
  // Muhasebe ucreti
  const [accountingFee, setAccountingFee] = useState(null)
  const [feeForm, setFeeForm] = useState({ onceki_donem_borc: '', defter_tasdik_ucreti: '', aylik_ucret: '', baslangic_ay: '1', baslangic_yil: '2025', notlar: '' })
  const [clientPayments, setClientPayments] = useState([])
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [paymentForm, setPaymentForm] = useState({ tutar: '', odeme_tipi: 'eft', donem: '', aciklama: '', odeme_tarihi: new Date().toISOString().split('T')[0] })
  const [seciliBorcKalemler, setSeciliBorcKalemler] = useState([]) // coklu borc kalemi (tutar otomatik dagitilir)
  const [duzeltmeDuzenlenen, setDuzeltmeDuzenlenen] = useState(null) // { payment } — borc kalemi duzeltme
  const [duzeltmeSecim, setDuzeltmeSecim] = useState('')
  const [odemeOnayModal, setOdemeOnayModal] = useState(null) // { payment } — online odemeyi borctan dusme
  const [odemeOnaySecimler, setOdemeOnaySecimler] = useState([]) // coklu borc kalemi secimi
  const [makbuzOnizleme, setMakbuzOnizleme] = useState(null) // odemeye ekli makbuzun url'si
  const [odemeMakbuzHedef, setOdemeMakbuzHedef] = useState(null) // makbuz eklenecek odeme
  const odemeMakbuzInputRef = useRef(null)
  // Borctan dusme modal (online odemeler icin)
  // Serbest meslek makbuzu yukleme
  const [makbuzForm, setMakbuzForm] = useState({ name: '', tutar: '', donem: '' })
  const [makbuzFile, setMakbuzFile] = useState(null)
  const makbuzFileRef = useRef(null)

  // Yeni yetkili/ortak formu (partners tablosu)
  const [partners, setPartners] = useState([])
  const [newPartner, setNewPartner] = useState({ name: '', title: '', phone: '', email: '', tc: '', vkn: '', vergi_dairesi: '', hisse_orani: '', sermaye: '', paySayisi: '', address: '', edevletSifre: '' })
  const [showPartnerForm, setShowPartnerForm] = useState(false)
  const [editPartnerId, setEditPartnerId] = useState(null)
  // Yeni banka formu
  const [newBank, setNewBank] = useState({ bank: '', branch: '', iban: '', accountNo: '' })
  const [showBankForm, setShowBankForm] = useState(false)
  const [editBankIndex, setEditBankIndex] = useState(-1)
  // Evrak yukleme
  const [clientDocuments, setClientDocuments] = useState({})
  const [docLoading, setDocLoading] = useState(false)
  const [gelirBeyanYear, setGelirBeyanYear] = useState(new Date().getFullYear())
  const [geciciVergiYear, setGeciciVergiYear] = useState(new Date().getFullYear())
  const [geciciVergiPeriod, setGeciciVergiPeriod] = useState('1')
  const [maliEvrakCategory, setMaliEvrakCategory] = useState('imza_beyani')
  const [maliEvrakName, setMaliEvrakName] = useState('')
  // Sifre gorunurluk
  const [showPasswords, setShowPasswords] = useState({})
  // Kira gecmisi duzenleme
  const [editingHistoryIndex, setEditingHistoryIndex] = useState(null)
  const [historyEditData, setHistoryEditData] = useState({})
  // Kira guncelleme modal
  const [kiraUpdateModalOpen, setKiraUpdateModalOpen] = useState(false)
  const [kiraUpdateIndex, setKiraUpdateIndex] = useState(null)
  const [kiraUpdateData, setKiraUpdateData] = useState({ kiraTutarTipi: 'net', netKira: '', brutKira: '' })
  // MUBiS Proxy durumu
  const [proxyReady, setProxyReady] = useState(false)
  const [proxyLoading, setProxyLoading] = useState(false)

  // ===== Cep Fatura (MFatura) Kurulumu =====
  const [faturaMail, setFaturaMail] = useState(null)
  const [faturaMailHedef, setFaturaMailHedef] = useState('')
  const [faturaMailKopya, setFaturaMailKopya] = useState('')
  const [faturaMailGoster, setFaturaMailGoster] = useState(false)

  // Kayitli cep fatura kurulumunu yukle
  useEffect(() => {
    let iptal = false
    if (client?.id) {
      getAppSetting(`fatura_mail_${client.id}`).then(v => {
        if (!iptal && v) { setFaturaMail(v); setFaturaMailHedef(v.hedef || '') }
      }).catch(() => {})
    }
    return () => { iptal = true }
  }, [client?.id])

  const trSlug = (s) => (s || '').toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/i̇/g, 'i')
    .replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '').slice(0, 20)
  const gucluParolaUret = () => {
    const harf = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ'
    const rak = '23456789'
    const ozel = '!#$%&*+?'
    const pick = (set, n) => Array.from({ length: n }, () => set[Math.floor(Math.random() * set.length)]).join('')
    return pick(harf, 4) + pick(rak, 3) + pick(ozel, 1) + pick(harf, 3) + pick(rak, 2)
  }
  const faturaMailKopyala = async (metin, etiket) => {
    try { await navigator.clipboard.writeText(metin) } catch { /* panoya erisilemezse sessiz gec */ }
    setFaturaMailKopya(etiket)
    setTimeout(() => setFaturaMailKopya(''), 1600)
  }
  const cepFaturaKurulumHazirla = async () => {
    if (!client?.id) return
    const hedef = (faturaMailHedef || client.email || '').trim()
    if (!hedef) { alert('Müşterinin e-postası boş. Hedef mail adresini girin.'); return }
    const alias = `${trSlug(client.shortName || client.name)}@mubiserp.com.tr`
    const parola = gucluParolaUret()
    const kayit = { alias, hedef, parola, tarih: new Date().toISOString(), durum: 'hazir' }
    await setAppSetting(`fatura_mail_${client.id}`, kayit)
    setFaturaMail(kayit)
    setFaturaMailHedef(hedef)
  }
  const cepFaturaSil = async () => {
    if (!faturaMail || !client?.id) return
    if (!window.confirm('Cep fatura kurulum kaydı silinsin mi? (MFatura hesabı silinmez, yalnızca MUBiS kaydı kaldırılır)')) return
    try { await deleteAppSetting(`fatura_mail_${client.id}`) } catch { /* yine de ekrandan kaldir */ }
    setFaturaMail(null)
  }
  const cepFaturaWhatsAppMetni = () => {
    if (!faturaMail) return ''
    const tel = (client.whatsapp || client.phone || '').replace(/\D/g, '').replace(/^0/, '90')
    const mesaj = [
      `${client.name} — MFatura (Cep Fatura) Giriş Bilgileriniz`,
      '',
      'E-Posta: ' + faturaMail.alias,
      'Parola: ' + faturaMail.parola,
      '',
      'Uygulama: MFatura - Kolay Fatura (Play Store)',
      'Giriş yaptıktan sonra "G.İ.B. Ayarları" bölümüne vergi dairesi vermiş olduğunuz İnteraktif Vergi Dairesi kullanıcı adı ve şifrenizi girin. Ardından ücretsiz fatura kesebilirsiniz.',
      '',
      'Not: Bu e-posta adresine gelen doğrulama mailleri kendi e-postanıza yönlendirilmektedir (' + faturaMail.hedef + ').'
    ].join('\n')
    return `https://wa.me/${tel}?text=${encodeURIComponent(mesaj)}`
  }

  // MUBiS Proxy baglanti kontrolu
  useEffect(() => {
    const checkProxy = async () => {
      try {
        const resp = await fetch('http://localhost:4789/api/health', { signal: AbortSignal.timeout(2000) })
        const data = await resp.json()
        if (data.status === 'ok') setProxyReady(true)
      } catch (e) {
        setProxyReady(false)
      }
    }
    checkProxy()
    const interval = setInterval(checkProxy, 15000)
    return () => clearInterval(interval)
  }, [])

  // Proxy ile otomatik giris
  const proxyLogin = async (portal, credentials) => {
    if (!proxyReady) return false
    setProxyLoading(true)
    try {
      const resp = await fetch('http://localhost:4789/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portal, credentials, clientName: client?.name })
      })
      const data = await resp.json()
      setProxyLoading(false)
      return data.success
    } catch (e) {
      setProxyLoading(false)
      return false
    }
  }

  // DVS otomatik giris
  const handleDVSLogin = async (portalType = 'dvs') => {
    if (proxyReady && client?.dvsUsername && client?.dvsPassword) {
      await proxyLogin(portalType, { username: client.dvsUsername, password: client.dvsPassword })
    } else {
      if (client?.dvsPassword) {
        navigator.clipboard.writeText(client.dvsPassword)
        alert(`Kullanici: ${client.dvsUsername}\nSifre panoya kopyalandi!`)
      }
      window.open('https://dijital.gib.gov.tr/portal/login', '_blank')
    }
  }

  // e-Arsiv otomatik giris
  const handleEArsivLogin = async () => {
    if (proxyReady && client?.dvsUsername && client?.dvsPassword) {
      await proxyLogin('earsiv', { username: client.dvsUsername, password: client.dvsPassword })
    } else {
      if (client?.dvsPassword) {
        navigator.clipboard.writeText(client.dvsPassword)
        alert(`Kullanici: ${client.dvsUsername}\nSifre panoya kopyalandi!`)
      }
      window.open('https://earsivportal.efatura.gov.tr/intragiris.html', '_blank')
    }
  }

  // SGK otomatik giris
  const handleSGKLogin = async (portalType = 'sgk') => {
    if (proxyReady && client?.sgkUser) {
      await proxyLogin(portalType, {
        username: client.sgkUser,
        isyeriKodu: client.sgkIsyeriKodu,
        sistemSifre: client.sgkSistemSifre,
        isyeriSifre: client.sgkIsyeriSifre
      })
    } else {
      if (client?.sgkSistemSifre) {
        navigator.clipboard.writeText(client.sgkSistemSifre)
        alert(`Kullanici: ${client.sgkUser}\nIsyeri Kodu: ${client.sgkIsyeriKodu || '-'}\nSistem sifresi panoya kopyalandi!`)
      }
      const urls = {
        'sgk': 'https://ebildirge.sgk.gov.tr/EBildirgeV2',
        'sgk-borc': 'https://ebildirge.sgk.gov.tr/WPEB/amp/loginldap',
        'sgk-isveren': 'https://uyg.sgk.gov.tr/IsverenSistemi'
      }
      window.open(urls[portalType] || urls.sgk, '_blank')
    }
  }

  // e-Devlet otomatik giris
  const handleEDevletLogin = async () => {
    if (proxyReady && client?.edevletUser && client?.edevletPass) {
      await proxyLogin('edevlet', { username: client.edevletUser, password: client.edevletPass })
    } else {
      if (client?.edevletPass) {
        navigator.clipboard.writeText(client.edevletPass)
        alert(`TC: ${client.edevletUser}\nSifre panoya kopyalandi!`)
      }
      window.open('https://giris.turkiye.gov.tr/Giris/', '_blank')
    }
  }

  useEffect(() => {
    const found = clients.find(c => c.id === parseInt(id))
    if (found) {
      setClient(found)
      setClientDocuments(found.client_documents || {})
      // Duzenleme surerken formu sifirlama (yazilan sehir/sermaye kaybolmasin)
      if (!isEditing) setEditData(found)
    }
    // Hesap kodlarini Supabase'den yukle
    loadHesapKodlari()
    // Personelleri yukle
    loadPersonel()
    // Muhasebe ucretlerini yukle
    loadAccounting()
    // Ortaklari yukle
    loadPartners()
    setLoading(false)
  }, [id, clients])

  const loadPartners = async () => {
    try {
      const data = await getPartners(parseInt(id))
      setPartners(data)
      return data
    } catch (e) { console.error('Ortak yukleme hatasi:', e); return [] }
  }

  // Ortaklarin sermaye tutarlarinin toplamini musterinin Sermaye alanina yazar.
  // Yalniz ortak sermayesi degistiginde calisir; Bilgiler'de elle duzeltme yapilabilir.
  const syncSermayeToplami = async (liste) => {
    try {
      const toplam = (liste || []).reduce((t, p) => {
        const v = typeof p.sermaye === 'number' ? p.sermaye : parseMoneyInput(p.sermaye)
        return t + (Number.isFinite(v) && v != null ? v : 0)
      }, 0)
      if (!(toplam > 0)) return
      const { error } = await supabase
        .from('clients')
        .update({ capital: toplam })
        .eq('id', parseInt(id))
      if (error) throw error
      setClient(prev => prev ? { ...prev, capital: toplam } : prev)
      setEditData(prev => ({ ...prev, capital: toplam }))
    } catch (e) {
      console.error('Sermaye toplami guncellenemedi:', e)
    }
  }

  const updateClientDocuments = async (nextDocs) => {
    setDocLoading(true)
    try {
      const { error } = await supabase
        .from('clients')
        .update({ client_documents: nextDocs })
        .eq('id', parseInt(id))
      if (error) throw error
      setClientDocuments(nextDocs)
      setClient(prev => prev ? { ...prev, client_documents: nextDocs } : prev)
    } catch (e) {
      console.error('Evrak kaydetme hatasi:', e)
      throw new Error(e.message || 'Evrak kaydedilemedi')
    } finally {
      setDocLoading(false)
    }
  }

  const handleGelirBeyanUpload = async (e, documentType) => {
    const file = e.target.files?.[0]
    if (!file) return
    setDocLoading(true)
    try {
      const uploaded = await uploadGelirBeyanDocument({
        client,
        year: gelirBeyanYear,
        documentType,
        file
      })
      const next = { ...clientDocuments }
      next.mali_veriler = next.mali_veriler || {}
      next.mali_veriler.gelir_beyani = next.mali_veriler.gelir_beyani || {}
      next.mali_veriler.gelir_beyani[gelirBeyanYear] = next.mali_veriler.gelir_beyani[gelirBeyanYear] || {}
      next.mali_veriler.gelir_beyani[gelirBeyanYear][documentType] = uploaded
      await updateClientDocuments(next)
      e.target.value = ''
      alert('Evrak yuklendi.')
    } catch (err) {
      console.error('Gelir beyani yukleme hatasi:', err)
      alert('Yukleme basarisiz: ' + (err.message || 'Bilinmeyen hata'))
      setDocLoading(false)
    }
  }

  const handleGeciciVergiUpload = async (e, documentType) => {
    const file = e.target.files?.[0]
    if (!file) return
    setDocLoading(true)
    try {
      const uploaded = await uploadGeciciVergiDocument({
        client,
        year: geciciVergiYear,
        period: geciciVergiPeriod,
        documentType,
        file
      })
      const next = { ...clientDocuments }
      next.mali_veriler = next.mali_veriler || {}
      next.mali_veriler.gecici_vergi = next.mali_veriler.gecici_vergi || {}
      next.mali_veriler.gecici_vergi[geciciVergiYear] = next.mali_veriler.gecici_vergi[geciciVergiYear] || {}
      next.mali_veriler.gecici_vergi[geciciVergiYear][geciciVergiPeriod] = next.mali_veriler.gecici_vergi[geciciVergiYear][geciciVergiPeriod] || {}
      next.mali_veriler.gecici_vergi[geciciVergiYear][geciciVergiPeriod][documentType] = uploaded
      await updateClientDocuments(next)
      e.target.value = ''
      alert('Evrak yuklendi.')
    } catch (err) {
      console.error('Gecici vergi yukleme hatasi:', err)
      alert('Yukleme basarisiz: ' + (err.message || 'Bilinmeyen hata'))
      setDocLoading(false)
    }
  }

  const handleVergiLevhasiUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setDocLoading(true)
    try {
      const uploaded = await uploadVergiLevhasi({ client, file })
      const next = { ...clientDocuments }
      next.mali_veriler = next.mali_veriler || {}
      next.mali_veriler.vergi_levhasi = uploaded
      await updateClientDocuments(next)
      e.target.value = ''
      alert('Vergi levhasi yuklendi.')
    } catch (err) {
      console.error('Vergi levhasi yukleme hatasi:', err)
      alert('Yukleme basarisiz: ' + (err.message || 'Bilinmeyen hata'))
      setDocLoading(false)
    }
  }

  const handleMaliEvrakUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !maliEvrakName.trim()) {
      alert('Lutfen evrak adi girin.')
      return
    }
    setDocLoading(true)
    try {
      const uploaded = await uploadMaliEvrak({
        client,
        category: maliEvrakCategory,
        name: maliEvrakName,
        file
      })
      const next = { ...clientDocuments }
      next.mali_evraklar = next.mali_evraklar || {}
      next.mali_evraklar[maliEvrakCategory] = next.mali_evraklar[maliEvrakCategory] || []
      next.mali_evraklar[maliEvrakCategory].push(uploaded)
      await updateClientDocuments(next)
      setMaliEvrakName('')
      e.target.value = ''
      alert('Evrak yuklendi.')
    } catch (err) {
      console.error('Mali evrak yukleme hatasi:', err)
      alert('Yukleme basarisiz: ' + (err.message || 'Bilinmeyen hata'))
      setDocLoading(false)
    }
  }

  const handleDeleteClientDocument = async (pathGetter) => {
    if (!window.confirm('Bu evragi silmek istediginize emin misiniz?')) return
    setDocLoading(true)
    try {
      const next = { ...clientDocuments }
      pathGetter(next)
      await updateClientDocuments(next)
    } catch (err) {
      console.error('Evrak silme hatasi:', err)
      alert('Silme basarisiz: ' + (err.message || 'Bilinmeyen hata'))
      setDocLoading(false)
    }
  }

  // Serbest meslek makbuzu yukle (musteri "Faturalarim" bolumunde gorur)
  const handleMakbuzUpload = async () => {
    if (!makbuzForm.name.trim()) {
      alert('Lutfen makbuz adi / donemi girin.')
      return
    }
    if (!makbuzFile) {
      alert('Lutfen makbuz PDF dosyasi secin.')
      return
    }
    setDocLoading(true)
    try {
      const uploaded = await uploadMakbuz({ client, name: makbuzForm.name, file: makbuzFile })
      const tutar = makbuzForm.tutar ? parseTurkishNumber(makbuzForm.tutar) : null
      const yeni = {
        id: `makbuz_${Date.now()}`,
        name: makbuzForm.name.trim(),
        donem: makbuzForm.donem || '',
        tutar: Number.isFinite(tutar) ? tutar : null,
        url: uploaded.url,
        size: uploaded.size,
        uploaded_at: uploaded.uploaded_at
      }
      const next = { ...clientDocuments }
      next.makbuzlar = [yeni, ...(next.makbuzlar || [])]
      await updateClientDocuments(next)
      setMakbuzForm({ name: '', tutar: '', donem: '' })
      setMakbuzFile(null)
      if (makbuzFileRef.current) makbuzFileRef.current.value = ''
      alert('Makbuz yuklendi.')
    } catch (err) {
      console.error('Makbuz yukleme hatasi:', err)
      alert('Yukleme basarisiz: ' + (err.message || 'Bilinmeyen hata'))
      setDocLoading(false)
    }
  }

  const handleMakbuzDelete = async (makbuzId) => {
    if (!window.confirm('Bu makbuzu silmek istediginize emin misiniz?')) return
    setDocLoading(true)
    try {
      const next = { ...clientDocuments }
      next.makbuzlar = (next.makbuzlar || []).filter(m => m.id !== makbuzId)
      await updateClientDocuments(next)
    } catch (err) {
      console.error('Makbuz silme hatasi:', err)
      alert('Silme basarisiz: ' + (err.message || 'Bilinmeyen hata'))
      setDocLoading(false)
    }
  }

  const loadHesapKodlari = async () => {
    try {
      const plans = await getAccountPlans(parseInt(id))
      setHesapKodlari(plans.map(p => ({ kod: p.code, ad: p.name, id: p.id, is_auto_added: p.is_auto_added })))
    } catch (e) {
      // Fallback: localStorage
      const stored = localStorage.getItem(`mubis_hesap_kodlari_${id}`)
      if (stored) try { setHesapKodlari(JSON.parse(stored)) } catch(e) {}
    }
  }

  const loadPersonel = async () => {
    try {
      const data = await getEmployees(parseInt(id))
      setPersonelList(data)
    } catch (e) { console.error('Personel yukleme hatasi:', e) }
  }

  const loadAccounting = async () => {
    try {
      const [fee, pays] = await Promise.all([
        getAccountingFee(parseInt(id)),
        getPayments(parseInt(id))
      ])
      setAccountingFee(fee)
      if (fee) {
        setFeeForm({
          onceki_donem_borc: fee.onceki_donem_borc || '',
          defter_tasdik_ucreti: fee.defter_tasdik_ucreti || '',
          aylik_ucret: fee.aylik_ucret || '',
          baslangic_ay: String(fee.baslangic_ay || 1),
          baslangic_yil: String(fee.baslangic_yil || 2025),
          notlar: fee.notlar || ''
        })
      }
      setClientPayments(pays)
    } catch (e) { console.error('Muhasebe yukleme hatasi:', e) }
  }

  const saveClient = async (data) => {
    try {
      const result = await updateClient(parseInt(id), data)
      if (result.success) {
        // data yalnizca guncellenen alanlari icerir (id yok); mevcut client
        // uzerine yamalayarak id/auth_user_id gibi kimlik alanlarini koru
        setClient(prev => ({ ...prev, ...data }))
        setEditData(prev => ({ ...prev, ...data }))
      } else {
        alert('Kaydetme hatasi: ' + (result.error || 'Bilinmeyen hata'))
      }
      return result
    } catch (err) {
      const msg = err?.message || err?.error_description || 'Bilinmeyen hata'
      alert('Kaydetme hatasi: ' + msg)
      console.error('saveClient hatasi:', err)
      return { success: false, error: msg }
    }
  }

  // e-Tebligatlari e-Devlet uzerinden indirip musteri klasorune yukler
  const handleEtebligatGetir = async () => {
    setEdevletIslem('etebligat')
    setEdevletDurum('Yardimci program kontrol ediliyor...')
    try {
      await etebligatlariGetirVeYukle({
        clientId: client.id,
        client,
        kaynak: 'tumu',
        onDurum: (d) => setEdevletDurum(
          d === 'gib-aciliyor' ? 'e-Devlet aciliyor; guvenlik kodunu girip giris yapin...'
            : d === 'dosya-bekleniyor' ? 'Belgeler indiriliyor; e-Devlet penceresinde giris yapmaniz bekleniyor...'
              : d === 'yukleniyor' ? 'Belgeler musteri klasorune yukleniyor...' : d
        )
      })
      alert('e-Tebligatlar indirildi ve musteri klasorune yuklendi.')
      setEdevletDurum('')
    } catch (err) {
      alert('e-Tebligat getirme basarisiz: ' + (err.message || 'Bilinmeyen hata'))
      setEdevletDurum('')
    }
    setEdevletIslem(null)
  }

  // Tecilli Tahsilat: var/yok secimi
  const handleTecilliToggle = async () => {
    const yeni = !(client.tecilliTahsilat || client.tecilli_tahsilat)
    const sonuc = await updateClient(parseInt(id), { tecilli_tahsilat: yeni })
    if (sonuc.success) {
      setClient(prev => prev ? { ...prev, tecilliTahsilat: yeni, tecilli_tahsilat: yeni } : prev)
      setTecilliDurum(yeni ? 'Tecilli Tahsilat acildi. Odeme planini PDF olarak yukleyin.' : 'Tecilli Tahsilat kapatildi.')
    } else {
      alert('Tecilli Tahsilat kaydedilemedi: ' + sonuc.error)
    }
  }

  // Tecilli Tahsilat odeme plani yukle: GIB "Borc Taksitli Detay Listesi" PDF
  // -> belge no, vergi dairesi ve taksit satirlari clients.tecilli_plan'a yazilir
  const handleTecilliPlanYukle = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setTecilliYukleniyor(true)
    setTecilliDurum('PDF okunuyor...')
    try {
      const belgeler = await tecilliPlanPdfOku(file)
      const ozet = belgeler.map(b => `${b.vergiDairesi} - ${b.belgeNo} (${b.taksitSayisi} taksit)`).join('\n')
      if (!window.confirm(`${belgeler.length} belge bulundu:\n\n${ozet}\n\nOdeme plani kaydedilsin mi?`)) {
        setTecilliYukleniyor(false)
        setTecilliDurum('')
        return
      }
      const sonuc = await updateClient(parseInt(id), { tecilli_tahsilat: true, tecilli_plan: belgeler })
      if (!sonuc.success) throw new Error(sonuc.error || 'Kaydedilemedi')
      setClient(prev => prev ? { ...prev, tecilliTahsilat: true, tecilli_tahsilat: true, tecilliPlan: belgeler, tecilli_plan: belgeler } : prev)
      setTecilliDurum(`Odeme plani yuklendi: ${belgeler.length} belge, ${belgeler.reduce((a, b) => a + b.taksitSayisi, 0)} taksit.`)
    } catch (err) {
      setTecilliDurum('Hata: ' + (err.message || 'PDF okunamadi'))
    } finally {
      setTecilliYukleniyor(false)
    }
  }

  // Tecilli Tahsilat planini temizle
  const handleTecilliPlanSil = async () => {
    if (!window.confirm('Yuklu odeme plani silinsin mi?')) return
    const sonuc = await updateClient(parseInt(id), { tecilli_plan: [] })
    if (sonuc.success) {
      setClient(prev => prev ? { ...prev, tecilliPlan: [], tecilli_plan: [] } : prev)
      setTecilliDurum('Odeme plani silindi.')
    } else {
      alert('Silinemedi: ' + sonuc.error)
    }
  }

  // SGK prim odemesi: e-Devlet uzerinden (turkiye.gov.tr)
  const handleSgkPrimOde = async () => {
    setEdevletIslem('sgk')
    setEdevletDurum('e-Devlet aciliyor...')
    try {
      const kimlik = await edevletKimlikGetir(client.id)
      const tc = kimlik.tc || client.vkn || client.tc || ''
      const edevletSifre = kimlik.edevletPass || ''
      if (!edevletSifre) {
        alert('e-Devlet sifresi yok. Once profilde "e-Devlet Sifresi" alanini doldurup kaydedin (sirketlerde ortak secin).')
        setEdevletIslem(null)
        setEdevletDurum('')
        return
      }
      const sonuc = await gibYardimciIs('sgk-odeme', { tc, edevletSifre })
      if (sonuc.ok) {
        setEdevletDurum('e-Devlet giris ekrani acildi; guvenlik kodunu girip giris yapin, sonraki adimlar otomatik yapilir.')
      } else {
        alert('Yardimci programa ulasilamadi. Yardimci programin kurulu ve calisir oldugundan emin olun.')
        setEdevletDurum('')
        setEdevletIslem(null)
      }
    } catch (err) {
      alert('SGK odeme baslatma hatasi: ' + (err.message || 'Bilinmeyen hata'))
      setEdevletDurum('')
      setEdevletIslem(null)
    }
  }

  // Tahakkuk gonderim tercihi (beyan_durumlari JSON'unda tasinir, aninda kaydedilir)
  const handleTahakkukGonderimDegistir = async (deger) => {
    if (!client) return
    setTahakkukTercihKaydediyor(true)
    try {
      const yeniDurumlar = { ...(client.beyanDurumlari || client.beyan_durumlari || {}), tahakkukGonderim: deger }
      await updateClientDb(client.id, { beyanDurumlari: yeniDurumlar })
      setClient(prev => ({ ...prev, beyanDurumlari: yeniDurumlar }))
    } catch (e) {
      console.error('Tahakkuk gonderim tercihi kaydedilemedi:', e)
      alert('Gönderim tercihi kaydedilemedi: ' + (e.message || 'Bilinmeyen hata'))
    } finally {
      setTahakkukTercihKaydediyor(false)
    }
  }

  const handleWhatsappOptOutDegistir = async (deger) => {
    if (!client) return
    setWaOptOutKaydediyor(true)
    try {
      await updateClientDb(client.id, { whatsappOptOut: deger })
      setClient(prev => ({ ...prev, whatsappOptOut: deger }))
    } catch (e) {
      console.error('WhatsApp opt-out kaydedilemedi:', e)
      alert('Tercih kaydedilemedi: ' + (e.message || 'Bilinmeyen hata'))
    } finally {
      setWaOptOutKaydediyor(false)
    }
  }

  const handleSave = async () => {
    // clients tablosuna gidecek izin verilen alanlar
    const allowedFields = [
      'name','shortName','company','vkn','tc','taxNo','email','phone','whatsapp','taxOffice','address','city',
      'type','companyType','taxType','capital','openDate','closeDate','musteriSinifi',
      'naceCode','naceDesc','faaliyetKodu','activityField','faaliyetAlani','efatura','earsiv','esmm','edefter','edefterPeriod','serbestMeslek',
      'eimzaStart','eimzaEnd','kartTipi','kartSifre','kiraBilgisi','kiraKontratBitis',
      'dvsUsername','dvsPassword','sgkUser','sgkIsyeriKodu','sgkSistemSifre','sgkIsyeriSifre',
      'earsivUser','earsivPass','edevletUser','edevletPass','ticaretSicilNo','beyanProfile',
      'status','username','password','tempPassword','officials','banks','services','documents',
      'phoneNumbers','emails'
    ]
    const cleanData = {}
    allowedFields.forEach(key => {
      if (key in editData) cleanData[key] = editData[key]
    })
    // Tarih alanlarini yyyy-aa-gg formatinda normalize et
    const dateFields = ['isAcilisTarihi','openDate','closeDate','eimzaStart','eimzaEnd','kiraBaslangic','kiraBitis']
    dateFields.forEach(df => {
      if (cleanData[df] && typeof cleanData[df] === 'string' && cleanData[df].match(/^\d{2}\.\d{2}\.\d{4}$/)) {
        const [g, a, y] = cleanData[df].split('.')
        cleanData[df] = `${y}-${a}-${g}`
      }
    })
    // kiraBilgisi icindeki tarihleri de normalize et
    if (cleanData.kiraBilgisi && typeof cleanData.kiraBilgisi === 'object') {
      const kb = { ...cleanData.kiraBilgisi }
      ;['kiraBaslangic','kiraBitis'].forEach(df => {
        if (kb[df] && typeof kb[df] === 'string' && kb[df].match(/^\d{2}\.\d{2}\.\d{4}$/)) {
          const [g, a, y] = kb[df].split('.')
          kb[df] = `${y}-${a}-${g}`
        }
      })
      // Isyeri sahiplerinde net/brut hesaplamasini kaydetmeden once uygula
      if (Array.isArray(kb.isyeriSahipleri)) {
        kb.isyeriSahipleri = kb.isyeriSahipleri.map(sahip => {
          const tip = sahip.kiraTutarTipi === 'brut' ? 'brut' : 'net'
          const girilen = tip === 'brut' ? sahip.brutKira : sahip.netKira
          const stopajOrani = sahip.stopaj === 'var' ? KIRA_STOPAJ_ORANI : 0
          if (girilen === '' || girilen === null || girilen === undefined) {
            return { ...sahip, netKira: '', brutKira: '' }
          }
          const numericValue = parseTurkishNumber(girilen)
          if (tip === 'net') {
            return { ...sahip, netKira: formatTurkishInput(girilen), brutKira: (numericValue / (1 - stopajOrani)).toFixed(2) }
          }
          return { ...sahip, brutKira: formatTurkishInput(girilen), netKira: (numericValue * (1 - stopajOrani)).toFixed(2) }
        })
      }
      delete kb.evSahipleri
      cleanData.kiraBilgisi = kb
    }
    // Eger isAcilisTarihi varsa openDate'e de yaz (geriye uyumluluk)
    if (cleanData.isAcilisTarihi && !cleanData.openDate) {
      cleanData.openDate = cleanData.isAcilisTarihi
    }
    if (cleanData.faaliyetKodu) {
      cleanData.naceCode = naceSadeceKod(cleanData.faaliyetKodu)
      delete cleanData.faaliyetKodu
    }
    if (cleanData.naceCode) cleanData.naceCode = naceSadeceKod(cleanData.naceCode)
    if (cleanData.activityField && !cleanData.naceDesc) {
      cleanData.naceDesc = cleanData.activityField
    }
    // "711101 - ACIKLAMA" birlesik kaydindan aciklama ayrilmamissa naceDesc'e yaz
    const naceAck = naceAciklama(cleanData.naceCode || '')
    if (naceAck && !cleanData.naceDesc && naceAck !== cleanData.naceCode) cleanData.naceDesc = naceAck
    const result = await saveClient(cleanData)
    if (result.success) setIsEditing(false)
  }

  // Portal Sifreleri kartlarindaki kayitli bilgileri temizler
  // (camelCase alan adlari -> DB snake_case kolonlari)
  const PORTAL_SIFRE_KOLON = {
    dvsUsername: 'dvs_username', dvsPassword: 'dvs_password',
    sgkUser: 'sgk_user', sgkIsyeriKodu: 'sgk_isyeri_kodu',
    sgkSistemSifre: 'sgk_sistem_sifre', sgkIsyeriSifre: 'sgk_isyeri_sifre',
    ticaretSicilNo: 'ticaret_sicil_no',
    edevletUser: 'edevlet_user', edevletPass: 'edevlet_pass',
  }
  const portalSifreSil = async (alanlar, etiket) => {
    if (!window.confirm(`${etiket} kayitli bilgileri silinecek. Emin misiniz?`)) return
    const yama = {}
    alanlar.forEach(a => {
      yama[PORTAL_SIFRE_KOLON[a] || a] = ''
    })
    const { error } = await supabase
      .from('clients')
      .update(yama)
      .eq('id', id)
    if (error) {
      alert('Silinemedi: ' + error.message)
      return
    }
    const temiz = {}
    alanlar.forEach(a => { temiz[a] = '' })
    setClient(prev => ({ ...prev, ...temiz }))
  }

  // Kira bilgisi helper'lari (kira_bilgisi text/JSONB alani)
  const getKiraBilgisi = (source) => {
    const raw = source?.kiraBilgisi || source?.kira_bilgisi || {}
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw)
        // Cift katmanli string JSON icin
        if (typeof parsed === 'string') {
          try { return JSON.parse(parsed) } catch { return {} }
        }
        return parsed
      } catch { return {} }
    }
    return raw || {}
  }

  const setKiraField = (field, value) => {
    const kb = { ...getKiraBilgisi(editData), [field]: value }
    setEditData({ ...editData, kiraBilgisi: kb })
  }

  // Kira gecmisi silme / guncelleme
  const saveKiraHistoryChanges = async (nextHistory) => {
    const kb = { ...getKiraBilgisi(client), kiraGecmisi: nextHistory }
    const { error } = await supabase
      .from('clients')
      .update({ kira_bilgisi: kb })
      .eq('id', id)
    if (error) {
      console.error('Kira gecmisi kaydedilemedi:', error)
      alert('Kira gecmisi kaydedilemedi: ' + error.message)
      return false
    }
    setClient(prev => ({ ...prev, kiraBilgisi: kb, kira_bilgisi: kb }))
    return true
  }

  const deleteKiraHistoryItem = async (originalIndex) => {
    if (!window.confirm('Bu kira gecmisi kaydini silmek istediginize emin misiniz?')) return
    const kb = getKiraBilgisi(client)
    const history = Array.isArray(kb.kiraGecmisi) ? [...kb.kiraGecmisi] : []
    history.splice(originalIndex, 1)
    await saveKiraHistoryChanges(history)
  }

  const updateKiraHistoryItem = async (originalIndex) => {
    const kb = getKiraBilgisi(client)
    const history = Array.isArray(kb.kiraGecmisi) ? [...kb.kiraGecmisi] : []
    history[originalIndex] = { ...history[originalIndex], ...historyEditData }
    const ok = await saveKiraHistoryChanges(history)
    if (ok) {
      setEditingHistoryIndex(null)
      setHistoryEditData({})
    }
  }

  const startEditHistoryItem = (originalIndex, donem) => {
    setEditingHistoryIndex(originalIndex)
    setHistoryEditData({
      kiraBaslangic: donem.kiraBaslangic || '',
      kiraBitis: donem.kiraBitis || '',
      netKira: donem.netKira || '',
      brutKira: donem.brutKira || '',
      aciklama: donem.aciklama || ''
    })
  }

  const addOneDay = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  }

  const addOneYear = (dateStr) => {
    if (!dateStr) return ''
    const baslangic = new Date(dateStr)
    if (isNaN(baslangic.getTime())) return ''
    const d = new Date(dateStr)
    d.setFullYear(d.getFullYear() + 1)
    // 29 Subat gibi durumlarda ayin son gunune cek
    if (d.getMonth() !== baslangic.getMonth()) {
      d.setDate(0)
    }
    return d.toISOString().split('T')[0]
  }

  const openKiraUpdateModal = (index, sahip) => {
    setKiraUpdateIndex(index)
    setKiraUpdateData({
      kiraTutarTipi: sahip.kiraTutarTipi === 'brut' ? 'brut' : 'net',
      netKira: sahip.netKira || '',
      brutKira: sahip.brutKira || ''
    })
    setKiraUpdateModalOpen(true)
  }

  const closeKiraUpdateModal = () => {
    setKiraUpdateModalOpen(false)
    setKiraUpdateIndex(null)
    setKiraUpdateData({ kiraTutarTipi: 'net', netKira: '', brutKira: '' })
  }

  const handleKiraUpdateTutarChange = (tip, value) => {
    const next = { ...kiraUpdateData, kiraTutarTipi: tip }
    if (tip === 'net') next.netKira = value
    else next.brutKira = value
    setKiraUpdateData(next)
  }

  const finalizeKiraUpdateTutar = () => {
    const tip = kiraUpdateData.kiraTutarTipi === 'brut' ? 'brut' : 'net'
    const girilen = tip === 'brut' ? kiraUpdateData.brutKira : kiraUpdateData.netKira
    if (!girilen || girilen === '') {
      setKiraUpdateData(prev => ({ ...prev, netKira: '', brutKira: '' }))
      return
    }
    const kb = getKiraBilgisi(client)
    const sahip = kb.isyeriSahipleri?.[kiraUpdateIndex] || {}
    const stopajOrani = sahip.stopaj === 'var' ? KIRA_STOPAJ_ORANI : 0
    const numericValue = parseTurkishNumber(girilen)
    if (tip === 'net') {
      setKiraUpdateData(prev => ({
        ...prev,
        netKira: formatTurkishInput(girilen),
        brutKira: (numericValue / (1 - stopajOrani)).toFixed(2)
      }))
    } else {
      setKiraUpdateData(prev => ({
        ...prev,
        brutKira: formatTurkishInput(girilen),
        netKira: (numericValue * (1 - stopajOrani)).toFixed(2)
      }))
    }
  }

  const applyKiraUpdate = async () => {
    if (kiraUpdateIndex === null) return
    const kb = getKiraBilgisi(client)
    const sahip = kb.isyeriSahipleri?.[kiraUpdateIndex]
    if (!sahip) return

    const tip = kiraUpdateData.kiraTutarTipi === 'brut' ? 'brut' : 'net'
    const girilen = tip === 'brut' ? kiraUpdateData.brutKira : kiraUpdateData.netKira
    if (!girilen || parseTurkishNumber(girilen) <= 0) {
      return alert('Lutfen gecerli bir kira tutari girin.')
    }

    // Mevcut donemi arsivle
    const history = Array.isArray(kb.kiraGecmisi) ? [...kb.kiraGecmisi] : []
    const eskiNetSayi = parseTurkishNumber(sahip.netKira)
    const eskiBrutSayi = parseTurkishNumber(sahip.brutKira)
    history.push({
      kiraBaslangic: sahip.kiraBaslangic,
      kiraBitis: sahip.kiraBitis,
      netKira: Number.isFinite(eskiNetSayi) && eskiNetSayi > 0 ? String(eskiNetSayi.toFixed(2)) : '0.00',
      brutKira: Number.isFinite(eskiBrutSayi) && eskiBrutSayi > 0 ? String(eskiBrutSayi.toFixed(2)) : '0.00',
      aciklama: `${sahip.adSoyad || 'Mal sahibi'} - ${new Date().toLocaleDateString('tr-TR')} kira guncelleme`,
      kayitTarihi: new Date().toISOString()
    })

    // Yeni donem hesapla
    const eskiBitisIso = normalizeDateForInput(sahip.kiraBitis)
    const yeniBaslangic = eskiBitisIso ? addOneDay(eskiBitisIso) : new Date().toISOString().split('T')[0]
    const yeniBitis = addOneYear(yeniBaslangic)

    // Yeni tutarlari hesapla
    const stopajOrani = sahip.stopaj === 'var' ? KIRA_STOPAJ_ORANI : 0
    const numericValue = parseTurkishNumber(girilen)
    let yeniNet, yeniBrut
    if (tip === 'net') {
      yeniNet = formatTurkishInput(girilen)
      yeniBrut = (numericValue / (1 - stopajOrani)).toFixed(2)
    } else {
      yeniBrut = formatTurkishInput(girilen)
      yeniNet = (numericValue * (1 - stopajOrani)).toFixed(2)
    }

    const yeniSahip = {
      ...sahip,
      kiraBaslangic: yeniBaslangic,
      kiraBitis: yeniBitis,
      kiraTutarTipi: tip,
      netKira: yeniNet,
      brutKira: yeniBrut
    }

    const list = [...(kb.isyeriSahipleri || [])]
    list[kiraUpdateIndex] = yeniSahip

    const newKb = { ...kb, isyeriSahipleri: list, kiraGecmisi: history }
    const result = await saveClient({ ...client, kira_bilgisi: newKb, kiraBilgisi: newKb })
    if (result.success) {
      closeKiraUpdateModal()
      alert('Kira guncellendi.')
    }
  }

  const fixKiraDates = async (index) => {
    if (!window.confirm('Kira bitis tarihi baslangic tarihine gore 1 yil uzatilacak. Onayliyor musunuz?')) return
    const kb = getKiraBilgisi(client)
    const sahip = kb.isyeriSahipleri?.[index]
    if (!sahip?.kiraBaslangic) return alert('Baslangic tarihi bulunamadi.')

    const baslangicIso = normalizeDateForInput(sahip.kiraBaslangic)
    const yeniBitis = addOneYear(baslangicIso)
    if (!yeniBitis) return alert('Bitis tarihi hesaplanamadi.')

    const list = [...(kb.isyeriSahipleri || [])]
    list[index] = { ...sahip, kiraBitis: yeniBitis }

    const newKb = { ...kb, isyeriSahipleri: list }
    const result = await saveClient({ ...client, kira_bilgisi: newKb, kiraBilgisi: newKb })
    if (result.success) alert('Kira bitis tarihi duzeltildi.')
  }

  const addEvSahibi = () => {
    addIsyeriSahibi()
  }

  const updateEvSahibi = (index, field, value) => {
    updateIsyeriSahibi(index, field, value)
  }

  const removeEvSahibi = (index) => {
    removeIsyeriSahibi(index)
  }

  const addIsyeriSahibi = () => {
    const kb = getKiraBilgisi(editData)
    const list = [...(kb.isyeriSahipleri || []), { tc: '', adSoyad: '', adres: '', hisseOrani: '', kiraTutarTipi: 'net', netKira: '', brutKira: '', kiraBaslangic: kb.kiraBaslangic || '', kiraBitis: kb.kiraBitis || '', stopaj: kb.stopaj || '' }]
    setKiraField('isyeriSahipleri', list)
  }

  const updateIsyeriSahibi = (index, field, value) => {
    const kb = getKiraBilgisi(editData)
    const list = [...(kb.isyeriSahipleri || [])]
    list[index] = { ...list[index], [field]: value }
    setKiraField('isyeriSahipleri', list)
  }

  const updateIsyeriSahibiTutar = (index, tip, value) => {
    const kb = getKiraBilgisi(editData)
    const list = [...(kb.isyeriSahipleri || [])]
    // Yazarken ham degeri tut; format ve karsi taraf hesabi alandan cikinca (blur) yapilir
    list[index] = { ...list[index], kiraTutarTipi: tip, [tip === 'brut' ? 'brutKira' : 'netKira']: value }
    setKiraField('isyeriSahipleri', list)
  }

  const finalizeIsyeriSahibiTutar = (index) => {
    const kb = getKiraBilgisi(editData)
    const list = [...(kb.isyeriSahipleri || [])]
    const sahip = { ...list[index] }
    const tip = sahip.kiraTutarTipi === 'brut' ? 'brut' : 'net'
    const girilen = tip === 'brut' ? sahip.brutKira : sahip.netKira
    const stopajOrani = sahip.stopaj === 'var' ? KIRA_STOPAJ_ORANI : 0

    if (girilen === '' || girilen === null || girilen === undefined) {
      sahip.netKira = ''
      sahip.brutKira = ''
    } else {
      const numericValue = parseTurkishNumber(girilen)
      if (tip === 'net') {
        sahip.netKira = formatTurkishInput(girilen)
        sahip.brutKira = (numericValue / (1 - stopajOrani)).toFixed(2)
      } else {
        sahip.brutKira = formatTurkishInput(girilen)
        sahip.netKira = (numericValue * (1 - stopajOrani)).toFixed(2)
      }
    }

    list[index] = sahip
    setKiraField('isyeriSahipleri', list)
  }

  const updateIsyeriSahibiStopaj = (index, value) => {
    const kb = getKiraBilgisi(editData)
    const list = [...(kb.isyeriSahipleri || [])]
    const sahip = { ...list[index], stopaj: value }
    const tip = sahip.kiraTutarTipi === 'brut' ? 'brut' : 'net'
    const girilenTutar = tip === 'brut' ? sahip.brutKira : sahip.netKira

    if (girilenTutar !== '' && girilenTutar !== null && girilenTutar !== undefined) {
      const numericValue = parseTurkishNumber(girilenTutar)
      const stopajOrani = value === 'var' ? KIRA_STOPAJ_ORANI : 0
      if (Number.isFinite(numericValue)) {
        if (tip === 'net') {
          sahip.netKira = formatTurkishInput(girilenTutar)
          sahip.brutKira = (numericValue / (1 - stopajOrani)).toFixed(2)
        } else {
          sahip.brutKira = formatTurkishInput(girilenTutar)
          sahip.netKira = (numericValue * (1 - stopajOrani)).toFixed(2)
        }
      }
    }

    list[index] = sahip
    setKiraField('isyeriSahipleri', list)
  }

  const removeIsyeriSahibi = (index) => {
    const kb = getKiraBilgisi(editData)
    const list = [...(kb.isyeriSahipleri || [])]
    list.splice(index, 1)
    setKiraField('isyeriSahipleri', list)
  }

  const handlePhoneChange = (e) => {
    const val = e.target.value
    const newData = { ...editData, phone: val }
    if (!editData.whatsapp || editData.whatsapp === editData.phone) {
      newData.whatsapp = val
    }
    setEditData(newData)
  }

  const formatDisplayDate = (val) => {
    if (!val) return '-'
    // Excel seri numarasi (ornek: 45192) - string olarak gelmis olabilir
    if (typeof val === 'number' || (typeof val === 'string' && /^\d+$/.test(val.trim()) && parseInt(val.trim(),10) > 30000)) {
      const num = typeof val === 'number' ? val : parseInt(val.trim(), 10)
      const d = new Date((num - 25569) * 86400 * 1000)
      if (isNaN(d.getTime())) return String(val)
      const g = String(d.getDate()).padStart(2, '0')
      const a = String(d.getMonth() + 1).padStart(2, '0')
      const y = d.getFullYear()
      return `${g}.${a}.${y}`
    }
    if (typeof val === 'string' && val.includes('T')) {
      const d = new Date(val)
      if (isNaN(d.getTime())) return val
      const g = String(d.getDate()).padStart(2, '0')
      const a = String(d.getMonth() + 1).padStart(2, '0')
      const y = d.getFullYear()
      return `${g}.${a}.${y}`
    }
    // zaten yyyy-aa-gg formatinda string ise cevir
    if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [y, a, g] = val.split('-')
      return `${g}.${a}.${y}`
    }
    // gg.aa.yyyy formatinda ise oldugu gibi dondur
    if (typeof val === 'string' && val.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
      return val
    }
    return val
  }

  const handleNaceSearch = (query) => {
    // Sadece rakam ve noktaya izin ver, noktalari sil
    const raw = query.replace(/[^0-9]/g, '').slice(0, 6)
    setEditData({ ...editData, faaliyetKodu: raw })
    if (raw.length >= 2) {
      const results = searchNace(raw)
      setNaceResults(results)
      setShowNaceDropdown(results.length > 0)
    } else {
      setNaceResults([])
      setShowNaceDropdown(false)
    }
  }

  const selectNace = (nace) => {
    setEditData({ ...editData, faaliyetKodu: nace.code, activityField: nace.desc })
    setShowNaceDropdown(false)
  }

  // E-hizmet toggle
  const toggleEService = async (key) => {
    const updated = { ...client, [key]: !client[key] }
    await saveClient(updated)
  }

  // E-imza bayraklari (efatura/earsiv/esmm icin) — app_settings'te JSON
  const [eimzaBayraklari, setEimzaBayraklari] = useState({ efatura: false, earsiv: false, esmm: false })
  const eimzaKey = `ehizmet_eimza_${client?.id}`
  useEffect(() => {
    let iptal = false
    getAppSetting(eimzaKey).then(v => {
      if (iptal) return
      try { setEimzaBayraklari({ efatura: false, earsiv: false, esmm: false, ...(JSON.parse(v || '{}')) }) } catch { /* varsayilan */ }
    }).catch(() => {})
    return () => { iptal = true }
  }, [eimzaKey])

  const toggleEimza = async (key) => {
    const yeni = { ...eimzaBayraklari, [key]: !eimzaBayraklari[key] }
    setEimzaBayraklari(yeni)
    try { await setAppSetting(eimzaKey, JSON.stringify(yeni)) } catch { /* yoksay */ }
  }

  // Ortak ekle veya guncelle (partners tablosu)
  // Adi ortaklik ortaklari ayni zamanda MUSTERI listesine de eklenir:
  // gecici vergi + gelir vergisini kendi adlarina verirler (KDV/muhtasar/SGK
  // ortaklik VKN'si uzerinden oldugundan beyan_profile.yalnizGelir=true isaretlenir).
  const ortakMusterisiniSenkronizeEt = async (p) => {
    try {
      if (!p.name || !(p.tc || p.vkn)) return null
      const mevcut = await findClientByTcVkn(p.tc, p.vkn)
      if (mevcut) {
        if (p.musteriSinifi) {
          await updateClientDb(mevcut.id, { musteriSinifi: p.musteriSinifi })
        }
        return mevcut
      }
      return await addClient({
        type: 'individual',
        name: p.name,
        shortName: p.title || '',
        tc: p.tc || '',
        vkn: p.vkn || '',
        taxOffice: p.vergi_dairesi || '',
        phone: p.phone || '',
        email: p.email || '',
        address: p.address || '',
        taxType: 'Gelir Vergisi',
        musteriSinifi: p.musteriSinifi || '2. Sinif',
        beyanProfile: { yalnizGelir: true, ortaklik_ref: parseInt(id), ortaklik_ad: client.name || '' }
      })
    } catch (e) {
      console.warn('Ortak musterisi senkronize edilemedi:', e)
      return null
    }
  }

  const handleSavePartner = async () => {
    if (!newPartner.name) return
    try {
      const payload = {
        ...newPartner,
        sermaye: parseMoneyInput(newPartner.sermaye),
        paySayisi: newPartner.paySayisi ? parseInt(newPartner.paySayisi, 10) || null : null
      }
      if (editPartnerId) {
        await updatePartner(editPartnerId, payload)
      } else {
        await addPartner(parseInt(id), payload)
      }
      if (isAdiOrtaklik) await ortakMusterisiniSenkronizeEt(payload)
      const liste = await loadPartners()
      await syncSermayeToplami(liste)
      setNewPartner({ name: '', title: '', phone: '', email: '', tc: '', vkn: '', vergi_dairesi: '', hisse_orani: '', sermaye: '', paySayisi: '', address: '', edevletSifre: '', musteriSinifi: '' })
      setShowPartnerForm(false)
      setEditPartnerId(null)
    } catch (err) {
      alert('Ortak kaydedilemedi: ' + (err.message || 'Bilinmeyen hata'))
    }
  }

  const startEditPartner = (partner) => {
    setNewPartner({
      name: partner.name || '',
      title: partner.title || '',
      phone: partner.phone || '',
      email: partner.email || '',
      tc: partner.tc || '',
      vkn: partner.vkn || '',
      vergi_dairesi: partner.vergi_dairesi || '',
      hisse_orani: partner.hisse_orani || '',
      sermaye: partner.sermaye != null ? String(partner.sermaye) : '',
      paySayisi: partner.pay_sayisi != null ? String(partner.pay_sayisi) : '',
      address: partner.address || '',
      edevletSifre: partner.edevlet_sifre || '',
      musteriSinifi: partner.musteri_sinifi || '',
    })
    setEditPartnerId(partner.id)
    setShowPartnerForm(true)
  }

  const removePartner = async (partnerId) => {
    if (!confirm('Bu ortagi silmek istiyor musunuz?')) return
    try {
      await deletePartner(partnerId)
      const liste = await loadPartners()
      await syncSermayeToplami(liste)
    } catch (err) {
      alert('Ortak silinemedi: ' + (err.message || 'Bilinmeyen hata'))
    }
  }

  // e-Tebligat / SGK odemesinin hangi ortak uzerinden yapilacagini isaretler
  const handlePartnerEdevletToggle = async (partner) => {
    const yeni = !partner.edevlet_aktif
    if (yeni && !(partner.tc && partner.edevlet_sifre)) {
      alert('Bu ortagin TC Kimlik No ve e-Devlet Sifresi kayitli olmali. Once duzenleyip doldurun.')
      return
    }
    try {
      await setEdevletAktifPartner(parseInt(id), partner.id, yeni)
      await loadPartners()
    } catch (err) {
      const msg = err.message || 'Bilinmeyen hata'
      alert('e-Devlet ortak secimi kaydedilemedi: ' + msg + (msg.includes('edevlet_aktif') ? '\n\nOnce SQL calistirin:\nALTER TABLE partners ADD COLUMN IF NOT EXISTS edevlet_aktif BOOLEAN DEFAULT false;' : ''))
    }
  }

  // Banka ekle veya guncelle
  const addBank = async () => {
    if (!newBank.bank) return
    const banks = [...(client.banks || [])]
    if (editBankIndex >= 0) {
      banks[editBankIndex] = { ...newBank }
    } else {
      banks.push({ ...newBank })
    }
    await saveClient({ ...client, banks })
    setNewBank({ bank: '', branch: '', iban: '', accountNo: '' })
    setShowBankForm(false)
    setEditBankIndex(-1)
  }

  const startEditBank = (index) => {
    setNewBank({ ...client.banks[index] })
    setEditBankIndex(index)
    setShowBankForm(true)
  }

  const removeBank = async (index) => {
    const banks = [...(client.banks || [])]
    banks.splice(index, 1)
    await saveClient({ ...client, banks })
  }

  // Hesap kodu upload
  const handleHesapKoduUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const data = new Uint8Array(ev.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 })
        const codes = []
        jsonData.forEach((row, i) => {
          if (i === 0) return
          const kod = row[0] != null ? String(row[0]).trim() : ''
          // Hesap kodlari RAKAMLA baslar; "HESAP KODU" basligi, "GENEL
          // TOPLAM" satiri gibi Excel kalintilarini eler
          if (!kod || !/^\d/.test(kod)) return
          codes.push({ code: kod, name: String(row[1] || '').trim() })
        })
        // Supabase'e kaydet
        try {
          await saveAccountPlans(parseInt(id), codes)
          await loadHesapKodlari()
        } catch (err) {
          // Fallback localStorage
          const local = codes.map(c => ({ kod: c.code, ad: c.name }))
          setHesapKodlari(local)
          localStorage.setItem(`mubis_hesap_kodlari_${id}`, JSON.stringify(local))
        }
        alert(`${codes.length} hesap kodu yuklendi!`)
      } catch (err) { alert('Excel okunamadi: ' + err.message) }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  // Bordro Excel yukleme
  const handleBordroUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      const rows = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (ev) => {
          try {
            const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' })
            const sheet = wb.Sheets[wb.SheetNames[0]]
            resolve(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }))
          } catch (err) { reject(err) }
        }
        reader.readAsArrayBuffer(file)
      })
      const norm = (s) => String(s || '')
        .replace(/i̇/g, 'I')
        .replace(/ı/g, 'I').replace(/İ/g, 'I').replace(/i/g, 'I')
        .replace(/ş/g, 'S').replace(/Ş/g, 'S')
        .replace(/ğ/g, 'G').replace(/Ğ/g, 'G')
        .replace(/ü/g, 'U').replace(/Ü/g, 'U')
        .replace(/ö/g, 'O').replace(/Ö/g, 'O')
        .replace(/ç/g, 'C').replace(/Ç/g, 'C')
        .toUpperCase()
        .replace(/[.,_\-()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      const matchCol = (h) => {
        if (!h) return null
        if (h.includes('AD SOYAD') || h.includes('ADI SOYADI') || h.includes('PERSONEL ADI') || h === 'PERSONEL' || h === 'CALISAN') return 'ad'
        if (h === 'TC' || h === 'TCKN' || h.includes('TC KIMLIK') || h.includes('KIMLIK NO')) return 'tc'
        if (h.includes('ISE GIRIS') || h.includes('GIRIS TARIHI') || h.includes('ISE BASLAMA')) return 'ise'
        if (h.includes('BRUT')) return 'brut'
        return null
      }
      let headerIdx = -1
      let colMap = {}
      for (let r = 0; r < Math.min(rows.length, 15); r++) {
        const map = {}
        ;(rows[r] || []).forEach((cell, c) => {
          const k = matchCol(norm(cell))
          if (k && map[k] === undefined) map[k] = c
        })
        if (map.ad !== undefined && (map.tc !== undefined || map.brut !== undefined)) { headerIdx = r; colMap = map; break }
      }
      if (headerIdx === -1) return alert('Excel dosyasinda personel bilgisi bulunamadi! (baslik satiri tanimlanamadi)')
      const parsed = rows.slice(headerIdx + 1).map(cols => {
        const get = (idx) => idx === undefined ? '' : (cols[idx] ?? '')
        return {
          ad_soyad: String(get(colMap.ad)).trim(),
          tc_kimlik: String(get(colMap.tc)).trim(),
          ise_giris: parseExcelDate(get(colMap.ise)),
          brut_ucret: parseTurkishNumber(get(colMap.brut) || 0)
        }
      }).filter(e => {
        const n = norm(e.ad_soyad)
        return e.ad_soyad && !n.includes('TOPLAM') && !n.includes('AD SOYAD') && !n.includes('ADI SOYADI')
      })
      if (parsed.length === 0) return alert('Excel dosyasinda personel bilgisi bulunamadi!')
      if (confirm(`${parsed.length} personel bulundu. Kaydetmek istiyor musunuz?`)) {
        await saveEmployeesFromExcel(parseInt(id), parsed)
        await loadPersonel()
        alert(`${parsed.length} personel basariyla yuklendi!`)
      }
    } catch (err) { alert('Excel okuma hatasi: ' + err.message) }
    e.target.value = ''
  }

  function parseExcelDate(val) {
    if (!val) return null
    if (typeof val === 'number') { const d = new Date((val - 25569) * 86400 * 1000); return d.toISOString().split('T')[0] }
    const s = String(val).trim()
    const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
    const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`
    return null
  }

  // Veritabanindan gelen tarihi input[type=date] icin normalize et
  function normalizeDateForInput(val) {
    if (!val) return ''
    if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}$/)) return val
    if (typeof val === 'string' && val.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
      const [g, a, y] = val.split('.')
      return `${y}-${a}-${g}`
    }
    if (typeof val === 'number') {
      const d = new Date((val - 25569) * 86400 * 1000)
      return d.toISOString().split('T')[0]
    }
    if (typeof val === 'string' && val.includes('T')) {
      return val.split('T')[0]
    }
    // Eger sadece rakamlardan olusuyorsa (Excel seri numarasi string olarak gelmis olabilir)
    if (typeof val === 'string' && /^\d+$/.test(val.trim())) {
      const num = parseInt(val.trim(), 10)
      if (!isNaN(num) && num > 30000) {
        const d = new Date((num - 25569) * 86400 * 1000)
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
      }
    }
    return ''
  }

  // Personel CRUD
  const yil = new Date().getFullYear()

  const handlePersonelUcretChange = (value) => {
    const ham = hamTutarGirdisi(value)
    const num = parseTurkishNumber(ham)
    if (!ham || isNaN(num)) {
      setPersonelForm(prev => ({ ...prev, brut_ucret: '' }))
      return
    }
    if (personelUcretTipi === 'net') {
      const brut = Math.round(nettenBrute(num, yil))
      setPersonelForm(prev => ({ ...prev, brut_ucret: String(brut) }))
    } else {
      setPersonelForm(prev => ({ ...prev, brut_ucret: ham }))
    }
  }

  const handlePersonelAsgariChange = (checked) => {
    setPersonelAsgariUcret(checked)
    if (checked) {
      const asgari = ASGARI_UCRET[yil]?.brut || ASGARI_UCRET[2026]?.brut || 33030
      setPersonelForm(prev => ({ ...prev, brut_ucret: formatTurkishInput(String(asgari)) }))
    } else {
      setPersonelForm(prev => ({ ...prev, brut_ucret: '' }))
    }
  }

  const resetPersonelForm = () => {
    setPersonelForm({ ad_soyad: '', tc_kimlik: '', ise_giris: '', isten_cikis: '', brut_ucret: '', dogum_tarihi: '', sgk_durumu: 'calisan', ise_giris_bildirge_url: '', isten_cikis_bildirge_url: '' })
    setPersonelUcretTipi('brut')
    setPersonelAsgariUcret(false)
    setBildirgeHata('')
  }

  const handleSavePersonel = async () => {
    if (!personelForm.ad_soyad.trim()) return alert('Ad Soyad zorunlu!')
    try {
      const payload = {
        ...personelForm,
        ise_giris: personelForm.ise_giris || null,
        isten_cikis: personelForm.isten_cikis || null,
        dogum_tarihi: personelForm.dogum_tarihi || null,
        sgk_durumu: personelForm.sgk_durumu || 'calisan',
        ucret_tipi: personelUcretTipi
      }
      if (editPersonelId) {
        await updateEmployee(editPersonelId, payload)
      } else {
        await addEmployee(parseInt(id), payload)
      }
      resetPersonelForm()
      setShowPersonelForm(false)
      setEditPersonelId(null)
      await loadPersonel()
    } catch (err) { alert('Hata: ' + err.message) }
  }

  const handleDeletePersonel = async (empId) => {
    if (!confirm('Bu personeli silmek istiyor musunuz?')) return
    try { await deleteEmployee(empId); await loadPersonel() } catch (err) { alert('Hata: ' + err.message) }
  }

  // Ise Giris / Isten Cikis Bildirgesi yukle + AI ile oku + formu doldur
  const handleBildirgeUpload = async (e, bildirgeTipi) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBildirgeHata('')
    setBildirgeYukleniyor(bildirgeTipi)
    try {
      const klasorAdi = bildirgeTipi === 'ise_giris' ? 'ise-giris-bildirgeleri' : 'isten-cikis-bildirgeleri'
      const yuklenen = await uploadAdminDocument({ client, folderPath: `personel/${klasorAdi}`, file })
      const okunan = await analyzePersonnelDocument({ fileUrl: yuklenen.url, bildirgeTipi })

      setShowPersonelForm(true)
      setEditPersonelId(null)
      setPersonelForm(prev => ({
        ...prev,
        ad_soyad: okunan.ad_soyad || prev.ad_soyad,
        tc_kimlik: okunan.tc_kimlik || prev.tc_kimlik,
        dogum_tarihi: okunan.dogum_tarihi || prev.dogum_tarihi,
        ise_giris: bildirgeTipi === 'ise_giris' ? (okunan.ise_giris_tarihi || prev.ise_giris) : prev.ise_giris,
        isten_cikis: bildirgeTipi === 'isten_cikis' ? (okunan.isten_cikis_tarihi || prev.isten_cikis) : prev.isten_cikis,
        sgk_durumu: bildirgeTipi === 'isten_cikis' ? 'emekli' : prev.sgk_durumu,
        ise_giris_bildirge_url: bildirgeTipi === 'ise_giris' ? yuklenen.url : prev.ise_giris_bildirge_url,
        isten_cikis_bildirge_url: bildirgeTipi === 'isten_cikis' ? yuklenen.url : prev.isten_cikis_bildirge_url
      }))
    } catch (err) {
      setBildirgeHata('Belge okunamadı: ' + err.message + ' — bilgileri elle girebilirsiniz.')
      setShowPersonelForm(true)
    } finally {
      setBildirgeYukleniyor(null)
      e.target.value = ''
    }
  }

  const handleClearHesapKodlari = async () => {
    if (!confirm('Tum hesap kodlarini silmek istiyor musunuz?')) return
    try { await saveAccountPlans(parseInt(id), []); setHesapKodlari([]) } catch(e) { setHesapKodlari([]); localStorage.removeItem(`mubis_hesap_kodlari_${id}`) }
  }

  // Muhasebe ucreti kaydet
  const handleSaveFee = async () => {
    try {
      await saveAccountingFee(parseInt(id), feeForm)
      await loadAccounting()
      alert('Muhasebe ucreti kaydedildi!')
    } catch (err) { alert('Hata: ' + err.message) }
  }

  // Odeme kaydet — coklu borc kalemi secilebilir; tutar kalemlere otomatik pay edilir
  // (kalem kalanina gore: or. Önceki Dönem 50.000 + Temmuz 3.750 ... kalan bakiye ilk kaleme eklenir)
  const handleSavePayment = async () => {
    const tutarSayi = parseTurkishNumber(paymentForm.tutar)
    if (!tutarSayi || tutarSayi <= 0) return alert('Tutar giriniz!')
    if (!seciliBorcKalemler.length) return alert('En az bir borç kalemi seçin!')
    try {
      const fee = accountingFee
      const toplandi = (p) => p.durum !== 'reddedildi' && (p.durum === 'onaylandi' || p.durum === 'uygulandi' || p.durum === 'alindi' || !p.durum || p.odeme_kanali === 'manuel')
      const odenmis = (kalem) => (clientPayments || []).filter(p => normalizeDonem(p.donem) === kalem && toplandi(p)).reduce((s, p) => s + (Number(p.tutar) || 0), 0)
      const kalemTutar = (kalem) => {
        if (kalem === 'Onceki Donem') return Number(fee?.onceki_donem_borc) || 0
        if (kalem === 'Defter Tasdik') return Number(fee?.defter_tasdik_ucreti) || 0
        return /^(\d{4})-(\d{2})$/.test(kalem) ? (Number(fee?.aylik_ucret) || 0) : 0
      }
      let bakiye = tutarSayi
      let paySayisi = 0
      for (const kalem of seciliBorcKalemler) {
        const kalan = Math.max(0, kalemTutar(kalem) - odenmis(kalem))
        const pay = Math.min(kalan, bakiye)
        if (pay > 0) {
          await addPayment({
            client_id: parseInt(id),
            tutar: pay,
            odeme_tipi: paymentForm.odeme_tipi,
            donem: kalem,
            aciklama: paySayisi ? `${paymentForm.aciklama || 'Ödeme'} (${paySayisi + 1}. pay)`.trim() : (paymentForm.aciklama || ''),
            odeme_tarihi: paymentForm.odeme_tarihi,
            odeme_kanali: 'manuel',
            durum: 'onaylandi'
          })
          bakiye -= pay
          paySayisi++
        }
      }
      if (bakiye > 0) {
        // Kalemler dolduktan sonra artan bakiye ilk secilen kaleme eklenir
        // (borc hesabinda kalem limitli sayilir, fazla saymaz)
        await addPayment({
          client_id: parseInt(id),
          tutar: bakiye,
          odeme_tipi: paymentForm.odeme_tipi,
          donem: seciliBorcKalemler[0],
          aciklama: `${paymentForm.aciklama || 'Ödeme'} (artan bakiye)`.trim(),
          odeme_tarihi: paymentForm.odeme_tarihi,
          odeme_kanali: 'manuel',
          durum: 'onaylandi'
        })
      }
      setPaymentForm({ tutar: '', odeme_tipi: 'eft', donem: '', aciklama: '', odeme_tarihi: new Date().toISOString().split('T')[0] })
      setSeciliBorcKalemler([])
      setShowPaymentForm(false)
      await loadAccounting()
      alert(paySayisi > 1 ? `Ödeme ${paySayisi} borç kalemine dağıtıldı.` : 'Ödeme kaydedildi.')
    } catch (err) { alert('Hata: ' + err.message) }
  }

  const handleDeletePayment = async (payId) => {
    if (!confirm('Bu odeme kaydini silmek istiyor musunuz?')) return
    try { await deletePayment(payId); await loadAccounting() } catch (err) { alert('Hata: ' + err.message) }
  }

  // Borc kalemini duzeltme modalini ac (mevcut donem onay kutusuna alinir)
  const openDuzeltme = (payment) => {
    setDuzeltmeSecim(normalizeDonem(payment.donem || ''))
    setDuzeltmeDuzenlenen({ payment })
  }

  // Duzeltmeyi uygula — satirin donemini gunceller (borc yeniden hesaplanir)
  const handleDuzeltmeUygula = async () => {
    const payment = duzeltmeDuzenlenen?.payment
    if (!payment) return
    try {
      await updatePayment(payment.id, { donem: duzeltmeSecim })
      setDuzeltmeDuzenlenen(null)
      setDuzeltmeSecim('')
      await loadAccounting()
      alert('Borc kalemi duzeltildi.')
    } catch (err) {
      const detay = [err.message, err.details, err.hint, err.code].filter(Boolean).join(' | ')
      alert('Hata: ' + detay)
    }
  }

  // Odemeye makbuz ekle/degistir: Storage'a yukler, satira url kaydeder
  const handleOdemeMakbuzSec = async (e) => {
    const p = odemeMakbuzHedef
    const dosya = e.target.files?.[0]
    if (!p || !dosya) return
    try {
      setDocLoading(true)
      const uploaded = await uploadPaymentMakbuz({ client, paymentId: p.id, file: dosya })
      if (!uploaded?.url) throw new Error('Yukleme sonucu url donmedi')
      await updatePayment(p.id, { makbuz_url: uploaded.url })
      await loadAccounting()
      alert('Makbuz odemeye eklendi.')
    } catch (err) {
      const detay = [err.message, err.details, err.hint, err.code].filter(Boolean).join(' | ')
      alert('Makbuz ekleme hatasi: ' + detay)
    } finally {
      setDocLoading(false)
      setOdemeMakbuzHedef(null)
      if (odemeMakbuzInputRef.current) odemeMakbuzInputRef.current.value = ''
    }
  }

  // Borc kalemleri: onceki donem, defter tasdik ve aylik donemler
  const getBorcKalemleri = () => {
    const secenekler = []
    const fee = accountingFee
    if (Number(fee?.onceki_donem_borc) > 0) {
      secenekler.push({ value: 'Onceki Donem', label: `Onceki Donem Borcu (${Number(fee.onceki_donem_borc).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL)` })
    }
    if (Number(fee?.defter_tasdik_ucreti) > 0) {
      secenekler.push({ value: 'Defter Tasdik', label: `Defter Tasdik Ucreti (${Number(fee.defter_tasdik_ucreti).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL)` })
    }
    if (fee) {
      const basYil = Number(fee.baslangic_yil) || new Date().getFullYear()
      const basAy = Number(fee.baslangic_ay) || 1
      const simdi = new Date()
      for (let y = simdi.getFullYear(); y >= basYil; y--) {
        const ayUst = y === simdi.getFullYear() ? simdi.getMonth() + 1 : 12
        const ayAlt = y === basYil ? basAy : 1
        for (let a = ayUst; a >= ayAlt; a--) {
          secenekler.push({ value: `${y}-${String(a).padStart(2, '0')}`, label: `${y}-${String(a).padStart(2, '0')} Muhasebe Ucreti` })
        }
      }
    }
    return secenekler
  }

  // Yesil ✓: pencere acar — hangi borc kalemlerinden dusulecegi coklu secilir
  const handleMarkPaid = (payment) => {
    setOdemeOnaySecimler([])
    setOdemeOnayModal({ payment })
  }

  // Secilen borc kalemlerine odemeyi dagitarak isle (tutar kalem kalanina gore pay edilir)
  const handleOdemeOnayUygula = async () => {
    const payment = odemeOnayModal?.payment
    if (!payment) return
    if (!odemeOnaySecimler.length) return alert('En az bir borç kalemi seçin!')
    try {
      const fee = accountingFee
      const toplandi = (p) => p.durum !== 'reddedildi' && (p.durum === 'onaylandi' || p.durum === 'uygulandi' || p.durum === 'alindi' || !p.durum || p.odeme_kanali === 'manuel')
      const odenmis = (kalem) => (clientPayments || []).filter(p => p.id !== payment.id && normalizeDonem(p.donem) === kalem && toplandi(p)).reduce((s, p) => s + (Number(p.tutar) || 0), 0)
      const kalemTutar = (kalem) => {
        if (kalem === 'Onceki Donem') return Number(fee?.onceki_donem_borc) || 0
        if (kalem === 'Defter Tasdik') return Number(fee?.defter_tasdik_ucreti) || 0
        return /^(\d{4})-(\d{2})$/.test(kalem) ? (Number(fee?.aylik_ucret) || 0) : 0
      }
      let bakiye = Number(payment.tutar) || 0
      let ilklendi = false
      for (const kalem of odemeOnaySecimler) {
        const kalan = Math.max(0, kalemTutar(kalem) - odenmis(kalem))
        const pay = Math.min(kalan, bakiye)
        if (pay <= 0) continue
        if (!ilklendi) {
          await updatePayment(payment.id, { donem: kalem, durum: 'uygulandi', tutar: pay })
          ilklendi = true
        } else {
          await addPayment({
            client_id: payment.client_id,
            tutar: pay,
            odeme_tipi: payment.odeme_tipi || 'eft',
            donem: kalem,
            aciklama: 'Toplu odeme payi',
            odeme_tarihi: payment.odeme_tarihi || new Date().toISOString().split('T')[0],
            odeme_kanali: payment.odeme_kanali || 'manuel',
            durum: 'uygulandi'
          })
        }
        bakiye -= pay
      }
      if (bakiye > 0 && !ilklendi) {
        // Kalemlerin hepsi dolu — ilk secilen kaleme tam tutarla isle (hesap limitli sayar)
        await updatePayment(payment.id, { donem: odemeOnaySecimler[0], durum: 'uygulandi' })
      }
      setOdemeOnayModal(null)
      setOdemeOnaySecimler([])
      await loadAccounting()
      alert('Odeme borctan dusuldu.')
    } catch (err) {
      const detay = [err.message, err.details, err.hint, err.code].filter(Boolean).join(' | ')
      alert('Hata: ' + detay)
    }
  }

  const handleRejectPayment = async (payment) => {
    const reason = window.prompt('Odeme reddedilme sebebini yazin:')
    if (reason === null) return
    try {
      await rejectPayment(payment.id, reason)
      await loadAccounting()
      // Musteriye red bildirimi gonder
      try {
        await createNotification({
          client_id: parseInt(id),
          audience: 'client',
          type: 'odeme',
          title: 'Odeme Reddedildi',
          message: `${Number(payment.tutar).toLocaleString('tr-TR')} TL tutarindaki online odemeniz reddedildi. Sebep: ${reason}`,
          route: '/portal?tab=borc'
        })
      } catch (notifErr) { console.error('Musteri odeme bildirimi hatasi:', notifErr) }
      alert('Odeme reddedildi.')
    } catch (err) { alert('Hata: ' + err.message) }
  }

  const handleOpenReceipt = (payment) => {
    openReceipt(payment, client, { name: user?.company || 'MUBiS ERP' })
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400"></div></div>
  }

  if (!client) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl text-white mb-4">Musteri bulunamadi</h2>
        <p className="text-gray-400 mb-6">ID: {id}</p>
        <button onClick={() => navigate('/admin/musteriler')} className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-6 py-2 rounded-lg font-semibold">Geri Don</button>
      </div>
    )
  }

  const isCompany = client.type === 'company' || client.type === 'adi_ortaklik' || client.type === 'apartman_yonetimi' || client.type === 'dernek'
  const isAdiOrtaklik = client.type === 'adi_ortaklik'

  const tabs = [
    { id: 'info', label: 'Bilgiler', icon: Building2 },
    { id: 'moduller', label: 'Modüller', icon: BookOpen },
    ...(isCompany ? [{ id: 'officials', label: 'Ortaklar / Yetkililer', icon: User }] : []),
    { id: 'banks', label: 'Bankalar', icon: CreditCard },
    { id: 'kurumlar', label: 'Kurum Erisimi', icon: Landmark },
    { id: 'services', label: 'E-Hizmetler', icon: Shield },
    { id: 'documents', label: 'Evraklar', icon: FileText },
    ...((client.musteriSinifi === '1. Sinif' || isCompany) ? [{ id: 'hesapkodlari', label: 'Hesap Kodlari', icon: Hash }] : []),
    { id: 'personel', label: 'Personel', icon: Users },
    { id: 'muhasebe', label: 'Muhasebe Ucreti', icon: DollarSign },
  ]

  // Hesap kodlari rakam sayfalari: "1'ler" sekmesi 1 ile baslayan kodlari,
  // "2'ler" sekmesi 2 ile baslayanlari gosterir. Sekmeler yalnizca RAKAM
  // (1-9) olur; harf/baska karakterle baslayan kodlar sekme uretmez (yalniz
  // aramayla bulunur). Arama kutusu doluyken arama TUM kodlar uzerinden yapilir.
  const hesapBasamaklar = [...new Set(hesapKodlari.map(hk => String(hk.kod || '').charAt(0)).filter(d => /\d/.test(d)))].sort()
  const filteredHesapKodlari = hesapKodlari.filter(hk => {
    if (hesapSearch) {
      return hk.kod.includes(hesapSearch) || hk.ad.toLowerCase().includes(hesapSearch.toLowerCase())
    }
    return String(hk.kod || '').charAt(0) === hesapBasamak
  })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* YardimciSurumUyari App.jsx'te global render ediliyor; burada tekrar gereksiz */}
      {/* Header + Sekmeler: tek kart */}
      <div className="rounded-2xl overflow-hidden border border-blue-700/40 bg-gradient-to-br from-blue-800/60 via-blue-900/70 to-blue-950/90 shadow-xl shadow-black/20 mb-8">
        {/* Ust kisim: kimlik + aksiyonlar */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 px-5 sm:px-6 py-5">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <button onClick={() => navigate('/admin/musteriler')} className="text-blue-200/60 hover:text-white transition-colors shrink-0" title="Musteri listesine don">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-black/30 shrink-0 ${isCompany ? 'bg-gradient-to-br from-blue-500 to-blue-700' : 'bg-gradient-to-br from-purple-500 to-purple-700'}`}>
              {client.name?.charAt(0) || '?'}
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-white leading-snug break-words">{client.name}</h1>
              <div className="flex items-center gap-2.5 flex-wrap mt-1">
                <span className="text-blue-200/70 text-sm">{isCompany ? `VKN: ${client.vkn || '-'}` : `TC: ${client.tc || '-'}`}</span>
                <span className="w-px h-3.5 bg-blue-400/30" />
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-medium ${client.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${client.status === 'active' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  {client.status === 'active' ? 'Aktif' : 'Pasif'}
                </span>
                {client.musteriSinifi && <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-yellow-500/15 text-yellow-400">{client.musteriSinifi}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap shrink-0">
            <button onClick={() => navigate(`/admin/client/${id}/beyan-profile`)} className="bg-blue-600/30 border border-blue-500/40 text-blue-100 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-600/50 transition-all flex items-center gap-2">
              <ListChecks className="w-4 h-4" /><span>Beyan Profili</span>
            </button>
            <button onClick={() => navigate(`/admin/client/${id}/beyan-takip`)} className="bg-blue-600/30 border border-blue-500/40 text-blue-100 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-600/50 transition-all flex items-center gap-2">
              <FileText className="w-4 h-4" /><span>Beyan Takip</span>
            </button>
            <span className="w-px h-8 bg-blue-500/30 hidden sm:block" />
            {isEditing ? (
              <>
                <button onClick={handleSave} className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-emerald-500/30 transition-all flex items-center gap-2"><Save className="w-4 h-4" /><span>Kaydet</span></button>
                <button onClick={() => { setIsEditing(false); setEditData(client) }} className="bg-red-500/20 border border-red-500/40 text-red-400 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-red-500/30 transition-all flex items-center gap-2"><X className="w-4 h-4" /><span>Iptal</span></button>
              </>
            ) : (
              <button onClick={() => setIsEditing(true)} className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-blue-950 px-5 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-yellow-900/30 hover:brightness-110 transition-all flex items-center gap-2">
                <Edit3 className="w-4 h-4" /><span>Duzenle</span>
              </button>
            )}
          </div>
        </div>
        {/* Alt kisim: sekmeler */}
        <div className="bg-blue-950/60 border-t border-blue-700/40 px-3 sm:px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-0.5">
            {tabs.map((tab, i) => (
              <Fragment key={tab.id}>
                {i > 0 && <span className="w-px h-5 bg-blue-500/25 mx-1" />}
                <button
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-blue-500/50 text-white shadow-md shadow-blue-950/40' : 'text-blue-100/70 hover:text-white hover:bg-white/5'}`}
                >
                  <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-blue-100' : 'text-blue-200/60'}`} /><span>{tab.label}</span>
                  {activeTab === tab.id && <span className="absolute left-3 right-3 bottom-0.5 h-[3px] bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-full" />}
                </button>
              </Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* ==================== MODULLER TAB ==================== */}
      {activeTab === 'moduller' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Cari Hesap Modulu */}
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-4">Cari Hesap Modülü</h3>
            <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
              <div>
                <div className="flex items-center gap-2 text-sm text-gray-200">
                  <BookOpen className="w-4 h-4 text-yellow-400" /> Cari Hesap Takip
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">Açık olunca müşteri portalında "Cari Hesap Takip" menüsü görünür</p>
              </div>
              <button
                onClick={async () => {
                  const yeni = !client.cari_hesap_modulu
                  setClient(prev => ({ ...prev, cari_hesap_modulu: yeni }))
                  try {
                    await updateClientDb(client.id, { cariHesapModulu: yeni })
                  } catch (e) {
                    setClient(prev => ({ ...prev, cari_hesap_modulu: !yeni }))
                    alert('Kaydedilemedi: ' + e.message)
                  }
                }}
                className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${client.cari_hesap_modulu ? 'bg-emerald-500' : 'bg-gray-600'}`}
                title={client.cari_hesap_modulu ? 'Modül açık — kapatmak için tıkla' : 'Modül kapalı — açmak için tıkla'}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${client.cari_hesap_modulu ? 'translate-x-6' : ''}`} />
              </button>
            </div>
          </div>

          {/* E-Arsiv / E-Fatura Kesim Modulu */}
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-4">e-Arşiv / e-Fatura Kesimi</h3>
            <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
              <div>
                <div className="flex items-center gap-2 text-sm text-gray-200">
                  <FileText className="w-4 h-4 text-yellow-400" /> Fatura Kesimi
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">Açık olunca müşteri portalında "Fatura Kesimi" menüsü görünür</p>
              </div>
              <button
                onClick={async () => {
                  const yeni = client.earsiv_efatura_modulu === false
                  setClient(prev => ({ ...prev, earsiv_efatura_modulu: yeni }))
                  try {
                    await updateClientDb(client.id, { earsivEfaturaModulu: yeni })
                  } catch (e) {
                    setClient(prev => ({ ...prev, earsiv_efatura_modulu: !yeni }))
                    alert('Kaydedilemedi: ' + e.message)
                  }
                }}
                className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${client.earsiv_efatura_modulu !== false ? 'bg-emerald-500' : 'bg-gray-600'}`}
                title={client.earsiv_efatura_modulu !== false ? 'Modül açık — kapatmak için tıkla' : 'Modül kapalı — açmak için tıkla'}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${client.earsiv_efatura_modulu !== false ? 'translate-x-6' : ''}`} />
              </button>
            </div>
          </div>

          {/* Personel Modulu */}
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-4">Personel Modülü</h3>
            <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
              <div>
                <div className="flex items-center gap-2 text-sm text-gray-200">
                  <Users className="w-4 h-4 text-yellow-400" /> Personel
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">Açık olunca müşteri portalında "Personel" menüsü görünür</p>
              </div>
              <button
                onClick={async () => {
                  const yeni = client.personel_modulu === false
                  setClient(prev => ({ ...prev, personel_modulu: yeni }))
                  try {
                    await updateClientDb(client.id, { personelModulu: yeni })
                  } catch (e) {
                    setClient(prev => ({ ...prev, personel_modulu: !yeni }))
                    alert('Kaydedilemedi: ' + e.message)
                  }
                }}
                className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${client.personel_modulu !== false ? 'bg-emerald-500' : 'bg-gray-600'}`}
                title={client.personel_modulu !== false ? 'Modül açık — kapatmak için tıkla' : 'Modül kapalı — açmak için tıkla'}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${client.personel_modulu !== false ? 'translate-x-6' : ''}`} />
              </button>
            </div>
          </div>

          {/* Musteri portal sekmeleri — tum moduller varsayilan ACIK */}
          {PORTAL_MODULLERI.map(m => {
            const acik = client[m.alan] !== false
            return (
              <div key={m.alan} className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
                <h3 className="text-lg font-semibold text-white mb-4">{m.label} Modülü</h3>
                <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                  <div>
                    <div className="flex items-center gap-2 text-sm text-gray-200">
                      <m.icon className="w-4 h-4 text-yellow-400" /> {m.label}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">Açık olunca müşteri portalında "{m.label}" menüsü görünür</p>
                  </div>
                  <button
                    onClick={async () => {
                      const yeni = !acik
                      setClient(prev => ({ ...prev, [m.alan]: yeni }))
                      try {
                        await updateClientDb(client.id, { [m.camel]: yeni })
                      } catch (e) {
                        setClient(prev => ({ ...prev, [m.alan]: !yeni }))
                        alert('Kaydedilemedi: ' + e.message)
                      }
                    }}
                    className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${acik ? 'bg-emerald-500' : 'bg-gray-600'}`}
                    title={acik ? 'Modül açık — kapatmak için tıkla' : 'Modül kapalı — açmak için tıkla'}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${acik ? 'translate-x-6' : ''}`} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ==================== INFO TAB ==================== */}
      {activeTab === 'info' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Temel Bilgiler */}
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-4">{isCompany ? 'Sirket Bilgileri' : 'Kisisel Bilgiler'}</h3>
            <div className="space-y-3">
              {isCompany ? (
                <>
                  <InfoRow label="Sirket Unvani" value={client.name} editKey="name" isEditing={isEditing} editData={editData} setEditData={setEditData} />
                  <InfoRow label="Kisa Ad" value={client.shortName} editKey="shortName" isEditing={isEditing} editData={editData} setEditData={setEditData} />
                  <InfoRow label="VKN" value={client.vkn} editKey="vkn" isEditing={isEditing} editData={editData} setEditData={setEditData} />
                  {/* Sermaye - ozel format ve input yonetimi */}
                  <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                    <span className="text-gray-400 text-sm">Sermaye</span>
                    {isEditing ? (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={editData._capitalDisplay !== undefined ? editData._capitalDisplay : formatMoney(client.capital)}
                        onChange={(e) => {
                          const raw = e.target.value
                          const numeric = parseMoneyInput(raw)
                          setEditData({
                            ...editData,
                            capital: numeric !== null ? numeric : raw,
                            _capitalDisplay: raw
                          })
                        }}
                        onBlur={() => {
                          const numeric = typeof editData.capital === 'number' ? editData.capital : parseMoneyInput(editData.capital)
                          setEditData(prev => ({
                            ...prev,
                            capital: numeric,
                            _capitalDisplay: undefined
                          }))
                        }}
                        onFocus={() => {
                          const numeric = typeof editData.capital === 'number' ? editData.capital : parseMoneyInput(editData.capital)
                          setEditData(prev => ({
                            ...prev,
                            _capitalDisplay: numeric != null ? numeric.toString().replace('.', ',') : ''
                          }))
                        }}
                        className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400 text-right"
                      />
                    ) : (
                      <span className="text-white text-sm font-medium text-right max-w-[200px] truncate">{formatMoney(client.capital)} TL</span>
                    )}
                  </div>
                  <InfoRow label="Vergi Dairesi" value={client.taxOffice} editKey="taxOffice" isEditing={isEditing} editData={editData} setEditData={setEditData} />
                  <InfoRow label="Sehir" value={client.city} editKey="city" isEditing={isEditing} editData={editData} setEditData={setEditData} />
                  {/* Musteri Sinifi - Dropdown (sirket + adi ortaklik) */}
                  <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                    <span className="text-gray-400 text-sm">Musteri Sinifi</span>
                    {isEditing ? (
                      <select value={editData.musteriSinifi || ''} onChange={(e) => setEditData({...editData, musteriSinifi: e.target.value})} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400">
                        <option value="">Seciniz</option>
                        <option value="1. Sinif">1. Sinif (Bilanco)</option>
                        <option value="2. Sinif">2. Sinif (Isletme)</option>
                        <option value="Serbest Meslek">Serbest Meslek</option>
                        <option value="Basit Usul">Basit Usul</option>
                        <option value="Dernek">Dernek</option>
                        <option value="Apartman Yonetimi">Apartman Yonetimi</option>
                      </select>
                    ) : (
                      <span className="text-white text-sm font-medium">{client.musteriSinifi || '-'}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                    <span className="text-gray-400 text-sm">Musteri Turu</span>
                    {isEditing ? (
                      <select value={editData.type || 'company'} onChange={(e) => setEditData({...editData, type: e.target.value})} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400">
                        <option value="company">Sirket</option>
                        <option value="individual">Gercek Kisi</option>
                        <option value="adi_ortaklik">Adi Ortaklik</option>
                        <option value="apartman_yonetimi">Apartman Yonetimi</option>
                        <option value="dernek">Dernek</option>
                      </select>
                    ) : (
                      <span className="text-white text-sm font-medium">{client.type === 'company' ? 'Sirket' : client.type === 'adi_ortaklik' ? 'Adi Ortaklik' : client.type === 'apartman_yonetimi' ? 'Apartman Yonetimi' : client.type === 'dernek' ? 'Dernek' : 'Gercek Kisi'}</span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <InfoRow label="Ad Soyad" value={client.name} editKey="name" isEditing={isEditing} editData={editData} setEditData={setEditData} />
                  <InfoRow label="Kisa Ad" value={client.shortName || client.short_name} editKey="shortName" isEditing={isEditing} editData={editData} setEditData={setEditData} />
                  <InfoRow label="TC Kimlik No" value={client.tc} editKey="tc" isEditing={isEditing} editData={editData} setEditData={setEditData} />
                  <InfoRow label="Vergi No" value={client.taxNo} editKey="taxNo" isEditing={isEditing} editData={editData} setEditData={setEditData} />
                  <InfoRow label="Vergi Dairesi" value={client.taxOffice || client.tax_office} editKey="taxOffice" isEditing={isEditing} editData={editData} setEditData={setEditData} />
                  <InfoRow label="Sehir" value={client.city} editKey="city" isEditing={isEditing} editData={editData} setEditData={setEditData} />
                  {/* Musteri Sinifi - Dropdown */}
                  <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                    <span className="text-gray-400 text-sm">Musteri Sinifi</span>
                    {isEditing ? (
                      <select value={editData.musteriSinifi || ''} onChange={(e) => setEditData({...editData, musteriSinifi: e.target.value})} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400">
                        <option value="">Seciniz</option>
                        <option value="1. Sinif">1. Sinif (Bilanco)</option>
                        <option value="2. Sinif">2. Sinif (Isletme)</option>
                        <option value="Serbest Meslek">Serbest Meslek</option>
                        <option value="Basit Usul">Basit Usul</option>
                        <option value="Dernek">Dernek</option>
                        <option value="Apartman Yonetimi">Apartman Yonetimi</option>
                      </select>
                    ) : (
                      <span className="text-white text-sm font-medium">{client.musteriSinifi || '-'}</span>
                    )}
                  </div>
                  {/* Musteri Turu - Dropdown */}
                  <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                    <span className="text-gray-400 text-sm">Musteri Turu</span>
                    {isEditing ? (
                      <select value={editData.type || 'individual'} onChange={(e) => setEditData({...editData, type: e.target.value})} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400">
                        <option value="individual">Gercek Kisi</option>
                        <option value="company">Sirket</option>
                        <option value="adi_ortaklik">Adi Ortaklik</option>
                        <option value="apartman_yonetimi">Apartman Yonetimi</option>
                        <option value="dernek">Dernek</option>
                      </select>
                    ) : (
                      <span className="text-white text-sm font-medium">{client.type === 'company' ? 'Sirket' : client.type === 'adi_ortaklik' ? 'Adi Ortaklik' : client.type === 'apartman_yonetimi' ? 'Apartman Yonetimi' : client.type === 'dernek' ? 'Dernek' : 'Gercek Kisi'}</span>
                    )}
                  </div>
                </>
              )}
              {/* Vergi Turu */}
              <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                <span className="text-gray-400 text-sm">Vergi Turu</span>
                {isEditing ? (
                  <select value={editData.taxType || ''} onChange={(e) => setEditData({...editData, taxType: e.target.value})} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400">
                    <option value="">Seciniz</option>
                    <option value="Kurumlar Vergisi">Kurumlar Vergisi</option>
                    <option value="Gelir Vergisi">Gelir Vergisi</option>
                    <option value="Basit Usul">Basit Usul</option>
                    <option value="Apartman Yonetimi">Apartman Yonetimi</option>
                    <option value="Dernek">Dernek</option>
                    <option value="Serbest Meslek">Serbest Meslek</option>
                  </select>
                ) : (
                  <span className="text-white text-sm font-medium">{client.taxType || '-'}</span>
                )}
              </div>
              {/* Faaliyet Kodu */}
              <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl relative">
                <span className="text-gray-400 text-sm">Faaliyet Kodu</span>
                {isEditing ? (
                  <div className="relative w-48">
                    <input
                      type="text"
                      value={editData.faaliyetKodu || ''}
                      onChange={(e) => handleNaceSearch(e.target.value)}
                      onFocus={() => {
                        const c = (editData.faaliyetKodu || '')
                        if (c.length >= 2) {
                          const results = searchNace(c)
                          setNaceResults(results)
                          setShowNaceDropdown(results.length > 0)
                        }
                      }}
                      onBlur={() => setTimeout(() => setShowNaceDropdown(false), 200)}
                      placeholder="6 haneli kod veya faaliyet ara..."
                      maxLength={6}
                      className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-full focus:outline-none focus:border-yellow-400 font-mono tracking-wider"
                    />
                    {showNaceDropdown && (
                      <div className="absolute right-0 top-full mt-1 w-96 bg-blue-950 border border-blue-700/50 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
                        {naceResults.map((n, i) => (
                          <button key={i} onClick={() => selectNace(n)} className="w-full text-left px-3 py-2 hover:bg-blue-800/50 text-sm border-b border-blue-800/30 last:border-0">
                            <span className="text-yellow-400 font-mono font-bold">{formatNaceCode(n.code)}</span>
                            <span className="text-gray-300 ml-2 text-xs">{n.desc}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-white text-sm font-medium font-mono">{client.faaliyetKodu ? formatNaceCode(client.faaliyetKodu) : client.naceCode ? formatNaceCode(client.naceCode) : '-'}</span>
                )}
              </div>
              {/* Faaliyet Konusu - kod secimine gore otomatik gelir, kayitli kod yoksa manuel girilebilir */}
              <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                <span className="text-gray-400 text-sm">Faaliyet Konusu</span>
                {isEditing ? (
                  <input
                    type="text"
                    value={editData.activityField || getNaceDesc(editData.faaliyetKodu || editData.naceCode) || ''}
                    onChange={(e) => setEditData({ ...editData, activityField: e.target.value })}
                    placeholder="Faaliyet konusunu yazin"
                    className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 text-right focus:outline-none focus:border-yellow-400"
                  />
                ) : (
                  <span className="text-white text-sm font-medium text-right max-w-[60%]">
                    {client.activityField || client.naceDesc || naceAciklama(client.faaliyetKodu || client.naceCode) || getNaceDesc(client.faaliyetKodu || client.naceCode) || '-'}
                  </span>
                )}
              </div>
              {/* e-Devlet Sifresi - musteri portalda kendisi girer; admin burada gorup degistirebilir */}
              <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                <span className="text-gray-400 text-sm">e-Devlet Şifresi</span>
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <input
                      type={showPasswords.edevlet ? 'text' : 'password'}
                      value={editData.edevletPass ?? client.edevletPass ?? client.edevlet_pass ?? ''}
                      onChange={(e) => setEditData({ ...editData, edevletPass: e.target.value })}
                      placeholder="e-Devlet sifresi"
                      autoComplete="new-password"
                      className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-40 focus:outline-none focus:border-yellow-400"
                    />
                    <button
                      onClick={() => setShowPasswords(p => ({ ...p, edevlet: !p.edevlet }))}
                      title={showPasswords.edevlet ? 'Gizle' : 'Göster'}
                      className="p-1 text-gray-400 hover:text-white transition-colors"
                    >
                      {showPasswords.edevlet ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-white text-sm font-medium">
                      {showPasswords.edevlet
                        ? (client.edevletPass || client.edevlet_pass || 'Kayıtlı değil')
                        : (client.edevletPass || client.edevlet_pass) ? '••••••••' : 'Kayıtlı değil'}
                    </span>
                    {(client.edevletPass || client.edevlet_pass) && (
                      <button
                        onClick={() => setShowPasswords(p => ({ ...p, edevlet: !p.edevlet }))}
                        title={showPasswords.edevlet ? 'Gizle' : 'Göster'}
                        className="p-1 text-gray-400 hover:text-white transition-colors"
                      >
                        {showPasswords.edevlet ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* e-Devlet Islemleri */}
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-yellow-400" />
              e-Devlet İşlemleri
            </h3>
            <p className="text-xs text-gray-400 mb-3">
              Yardımcı program TC ve e-Devlet şifresini otomatik doldurur; siz yalnızca güvenlik kodunu girip girersiniz. Sonraki adımlar otomatik yapılır.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={handleEtebligatGetir}
                disabled={edevletIslem !== null}
                className="flex items-center justify-center gap-2 bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 py-2.5 rounded-xl font-medium text-sm transition-colors disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {edevletIslem === 'etebligat' ? 'Bekleniyor...' : 'e-Tebligatlari Getir (SGK / Vergi / PTT)'}
              </button>
              <button
                onClick={handleSgkPrimOde}
                disabled={edevletIslem !== null}
                className="flex items-center justify-center gap-2 bg-teal-600/30 hover:bg-teal-600/50 border border-teal-500/40 text-teal-200 py-2.5 rounded-xl font-medium text-sm transition-colors disabled:opacity-50"
              >
                <CreditCard className="w-4 h-4" />
                {edevletIslem === 'sgk' ? 'Aciliyor...' : 'SGK Primi Öde (e-Devlet)'}
              </button>
            </div>
            {edevletDurum && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300 mt-3">
                {edevletDurum}
              </div>
            )}
          </div>

          {/* Tecilli Tahsilat Odeme Plani */}
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-yellow-400" />
              Tecilli Tahsilat Ödeme Planı
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              Var seçilirse müşterinin vergi takviminde aylık taksitler ayrı ödeme kutuları olarak gösterilir. Ödeme planı, GIB "Borc Taksitli Detay Listesi" PDF çıktısından otomatik okunur.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleTecilliToggle}
                className={`px-4 py-2 rounded-xl font-medium text-sm transition-colors ${
                  (client.tecilliTahsilat || client.tecilli_tahsilat)
                    ? 'bg-green-600/30 border border-green-500/40 text-green-300'
                    : 'bg-blue-900/30 border border-blue-700/40 text-gray-300'
                }`}
              >
                {(client.tecilliTahsilat || client.tecilli_tahsilat) ? 'Var (Aktif)' : 'Yok (Pasif)'}
              </button>
              {(client.tecilliTahsilat || client.tecilli_tahsilat) && (
                <>
                  <button
                    onClick={() => tecilliFileRef.current?.click()}
                    disabled={tecilliYukleniyor}
                    className="flex items-center gap-2 bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/40 text-blue-200 py-2 px-4 rounded-xl font-medium text-sm transition-colors disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" />
                    {tecilliYukleniyor ? 'Okunuyor...' : 'Ödeme Planı Yükle (PDF)'}
                  </button>
                  {(client.tecilliPlan?.length || client.tecilli_plan?.length) > 0 && (
                    <button
                      onClick={handleTecilliPlanSil}
                      className="flex items-center gap-2 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 text-red-300 py-2 px-4 rounded-xl font-medium text-sm transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Planı Sil
                    </button>
                  )}
                </>
              )}
            </div>
            <input ref={tecilliFileRef} type="file" accept="application/pdf" className="hidden" onChange={handleTecilliPlanYukle} />
            {(client.tecilliPlan || client.tecilli_plan || []).length > 0 && (
              <div className="mt-3 space-y-1">
                {(client.tecilliPlan || client.tecilli_plan).map(b => (
                  <div key={b.belgeNo} className="text-xs text-gray-300 bg-blue-900/20 rounded-lg px-3 py-2 flex items-center justify-between">
                    <span className="font-mono">{b.belgeNo}</span>
                    <span>{b.vergiDairesi} • {b.taksitSayisi} taksit • {Number(b.toplamTutar || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL</span>
                  </div>
                ))}
              </div>
            )}
            {tecilliDurum && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300 mt-3">
                {tecilliDurum}
              </div>
            )}
          </div>

          {/* Onemli Tarihler */}
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-yellow-400" />
              <h3 className="text-lg font-semibold text-white">Onemli Tarihler</h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                <span className="text-gray-400 text-sm">Isyeri Acilis</span>
                {isEditing ? (
                  <input
                    type="date"
                    value={editData.openDate || client.openDate || ''}
                    onChange={(e) => setEditData({ ...editData, openDate: e.target.value })}
                    className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400"
                  />
                ) : (
                  <span className="text-white text-sm font-medium">{formatDateTR(client.openDate) || client.openDate || client.open_date || '-'}</span>
                )}
              </div>
              <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                <span className="text-gray-400 text-sm">Isyeri Kapanis</span>
                {isEditing ? (
                  <input
                    type="date"
                    value={editData.closeDate || client.closeDate || ''}
                    onChange={(e) => setEditData({ ...editData, closeDate: e.target.value })}
                    className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400"
                  />
                ) : (
                  <span className="text-white text-sm font-medium">{formatDateTR(client.closeDate) || client.closeDate || client.close_date || '-'}</span>
                )}
              </div>
              <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                <span className="text-gray-400 text-sm">e-Imza Baslangic</span>
                {isEditing ? (
                  <input
                    type="date"
                    value={editData.eimzaStart || client.eimzaStart || ''}
                    onChange={(e) => setEditData({ ...editData, eimzaStart: e.target.value })}
                    className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400"
                  />
                ) : (
                  <span className="text-white text-sm font-medium">{formatDateTR(client.eimzaStart) || client.eimzaStart || client.eimza_start || '-'}</span>
                )}
              </div>
              <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                <span className="text-gray-400 text-sm">e-Imza Bitis</span>
                {isEditing ? (
                  <input
                    type="date"
                    value={editData.eimzaEnd || client.eimzaEnd || ''}
                    onChange={(e) => setEditData({ ...editData, eimzaEnd: e.target.value })}
                    className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400"
                  />
                ) : (
                  <span className="text-white text-sm font-medium">{formatDateTR(client.eimzaEnd) || client.eimzaEnd || client.eimza_end || '-'}</span>
                )}
              </div>
            </div>
          </div>

          {/* Iletisim Bilgileri */}
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-4">Iletisim Bilgileri</h3>
            <div className="space-y-3">
              {/* Telefon - ozel handler */}
              <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                <span className="text-gray-400 text-sm">Telefon</span>
                {isEditing ? (
                  <input type="text" value={editData.phone || ''} onChange={handlePhoneChange} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400" placeholder="05XX XXX XX XX" />
                ) : (
                  <span className="text-white text-sm font-medium">{client.phone || '-'}</span>
                )}
              </div>
              {/* WhatsApp */}
              <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                <span className="text-gray-400 text-sm">WhatsApp</span>
                {isEditing ? (
                  <input type="text" value={editData.whatsapp || ''} onChange={(e) => setEditData({...editData, whatsapp: e.target.value})} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400" placeholder="Otomatik dolar" />
                ) : (
                  <span className="text-white text-sm font-medium">{client.whatsapp || client.phone || '-'}</span>
                )}
              </div>
              <InfoRow label="E-Posta" value={client.email} editKey="email" isEditing={isEditing} editData={editData} setEditData={setEditData} />

              {/* Tahakkuk gonderim tercihi: beyan onaylaninca tahakkuklar buraya gore gonderilir */}
              <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                <span className="text-gray-400 text-sm">Tahakkuk Gönderim Şekli</span>
                <div className="flex items-center gap-2">
                  {tahakkukTercihKaydediyor && <span className="text-yellow-400 text-xs">kaydediliyor...</span>}
                  <select
                    value={(client.beyanDurumlari || client.beyan_durumlari || {})?.tahakkukGonderim || 'whatsapp'}
                    onChange={(e) => handleTahakkukGonderimDegistir(e.target.value)}
                    disabled={tahakkukTercihKaydediyor}
                    className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm focus:outline-none focus:border-yellow-400"
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="mail">E-Posta</option>
                    <option value="ikisi">WhatsApp + E-Posta</option>
                    <option value="yok">Gönderim Yok</option>
                  </select>
                </div>
              </div>

              {/* WhatsApp otomatik bildirim opt-out: otomatik hatirlatmalar bu musteriye WhatsApp'tan gitmez */}
              <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                <div>
                  <span className="text-gray-400 text-sm block">WhatsApp Otomatik Bildirim</span>
                  <span className="text-gray-600 text-xs">Hatırlatmalar kapalıyken e-posta + portal bildirimi yine de gönderilir.</span>
                </div>
                <div className="flex items-center gap-2">
                  {waOptOutKaydediyor && <span className="text-yellow-400 text-xs">kaydediliyor...</span>}
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!!(client.whatsappOptOut)}
                      onChange={(e) => handleWhatsappOptOutDegistir(e.target.checked)}
                      disabled={waOptOutKaydediyor}
                      className="w-4 h-4 rounded border-blue-700/50 bg-blue-900/30 text-yellow-500 focus:ring-yellow-500"
                    />
                    <span className="text-white text-sm">{client.whatsappOptOut ? 'Kapalı (istemiyor)' : 'Açık'}</span>
                  </label>
                </div>
              </div>

              {/* Birden Fazla Telefon / WhatsApp */}
              <div className="p-3 bg-blue-900/20 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 text-sm">Iletisim Numaralari</span>
                  {isEditing && (
                    <button
                      onClick={() => setEditData(prev => ({
                        ...prev,
                        phoneNumbers: [...(prev.phoneNumbers || []), { name: '', phone: '', isWhatsapp: true }]
                      }))}
                      className="text-xs text-yellow-400 hover:text-yellow-300"
                    >
                      + Yeni
                    </button>
                  )}
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    {(editData.phoneNumbers || []).map((item, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input
                          type="text"
                          placeholder="Ad Soyad"
                          value={item.name || ''}
                          onChange={(e) => {
                            const next = [...(editData.phoneNumbers || [])]
                            next[idx] = { ...next[idx], name: e.target.value }
                            setEditData(prev => ({ ...prev, phoneNumbers: next }))
                          }}
                          className="flex-1 bg-blue-900/30 border border-blue-700/50 rounded-lg py-1 px-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-400"
                        />
                        <input
                          type="text"
                          placeholder="Telefon"
                          value={item.phone || ''}
                          onChange={(e) => {
                            const next = [...(editData.phoneNumbers || [])]
                            next[idx] = { ...next[idx], phone: e.target.value }
                            setEditData(prev => ({ ...prev, phoneNumbers: next }))
                          }}
                          className="flex-1 bg-blue-900/30 border border-blue-700/50 rounded-lg py-1 px-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-400"
                        />
                        <label className="flex items-center gap-1 text-xs text-gray-400 whitespace-nowrap cursor-pointer">
                          <input
                            type="checkbox"
                            checked={item.isWhatsapp !== false}
                            onChange={(e) => {
                              const next = [...(editData.phoneNumbers || [])]
                              next[idx] = { ...next[idx], isWhatsapp: e.target.checked }
                              setEditData(prev => ({ ...prev, phoneNumbers: next }))
                            }}
                            className="rounded border-blue-700/50"
                          />
                          WA
                        </label>
                        {(editData.phoneNumbers || []).length > 1 && (
                          <button
                            onClick={() => {
                              const next = (editData.phoneNumbers || []).filter((_, i) => i !== idx)
                              setEditData(prev => ({ ...prev, phoneNumbers: next }))
                            }}
                            className="p-1 text-gray-500 hover:text-red-400"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {(client.phoneNumbers || []).length > 0 ? (
                      (client.phoneNumbers || []).map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <span className="text-white">{item.name || 'Kisi'}:</span>
                          <span className="text-gray-300">{item.phone}</span>
                          {item.isWhatsapp && <span className="text-green-400 text-xs">(WA)</span>}
                        </div>
                      ))
                    ) : (
                      <span className="text-gray-500 text-sm">-</span>
                    )}
                  </div>
                )}
              </div>

              {/* Birden Fazla E-posta */}
              <div className="p-3 bg-blue-900/20 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 text-sm">E-posta Adresleri</span>
                  {isEditing && (
                    <button
                      onClick={() => setEditData(prev => ({
                        ...prev,
                        emails: [...(prev.emails || []), { email: '' }]
                      }))}
                      className="text-xs text-yellow-400 hover:text-yellow-300"
                    >
                      + Yeni
                    </button>
                  )}
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    {(editData.emails || []).map((item, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input
                          type="email"
                          placeholder="ornek@email.com"
                          value={item.email || ''}
                          onChange={(e) => {
                            const next = [...(editData.emails || [])]
                            next[idx] = { email: e.target.value }
                            setEditData(prev => ({ ...prev, emails: next }))
                          }}
                          className="flex-1 bg-blue-900/30 border border-blue-700/50 rounded-lg py-1 px-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-400"
                        />
                        {(editData.emails || []).length > 1 && (
                          <button
                            onClick={() => {
                              const next = (editData.emails || []).filter((_, i) => i !== idx)
                              setEditData(prev => ({ ...prev, emails: next }))
                            }}
                            className="p-1 text-gray-500 hover:text-red-400"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {(client.emails || []).length > 0 ? (
                      (client.emails || []).map((item, idx) => (
                        <div key={idx} className="text-sm text-gray-300">{item.email}</div>
                      ))
                    ) : (
                      <span className="text-gray-500 text-sm">-</span>
                    )}
                  </div>
                )}
              </div>

              <InfoRow label="Web Sitesi" value={client.website} editKey="website" isEditing={isEditing} editData={editData} setEditData={setEditData} />
              {/* Adres - Textarea 2 satir */}
              <div className="p-3 bg-blue-900/20 rounded-xl">
                <span className="text-gray-400 text-sm block mb-1">Adres</span>
                {isEditing ? (
                  <textarea value={editData.address || ''} onChange={(e) => setEditData({...editData, address: e.target.value})} rows={2} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400 resize-none" placeholder="Tam adres..." />
                ) : (
                  <p className="text-white text-sm">{client.address || '-'}</p>
                )}
              </div>
            </div>
          </div>

          {/* Kira Bilgileri */}
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Home className="w-5 h-5 text-yellow-400" /> Kira Bilgileri</h3>

            {/* Musteriden gelen kira yenileme bildirimi */}
            <KiraTalepOnay
              client={client}
              onGuncellendi={() => refreshClients?.()}
            />
            {kiraGecmisi(getKiraBilgisi(client)).length > 0 && (
              <div className="mb-4 rounded-xl border border-blue-700/40 bg-blue-950/30 p-4">
                <h4 className="mb-3 text-sm font-semibold text-white">Kira Geçmişi</h4>
                <div className="space-y-2">
                  {kiraGecmisi(getKiraBilgisi(client)).slice().reverse().map((donem, index) => {
                    const originalIndex = kiraGecmisi(getKiraBilgisi(client)).length - 1 - index
                    const isEditingHistory = editingHistoryIndex === originalIndex
                    return (
                      <div key={`${donem.kayitTarihi || 'donem'}-${originalIndex}`} className="rounded-lg bg-blue-900/30 p-3 text-xs">
                        {isEditingHistory ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <label className="text-gray-400">
                              Başlangıç
                              <input type="date" value={normalizeDateForInput(historyEditData.kiraBaslangic)} onChange={(e) => setHistoryEditData(prev => ({ ...prev, kiraBaslangic: e.target.value }))} className="mt-1 w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-2 py-1 text-white text-sm" />
                            </label>
                            <label className="text-gray-400">
                              Bitiş
                              <input type="date" value={normalizeDateForInput(historyEditData.kiraBitis)} onChange={(e) => setHistoryEditData(prev => ({ ...prev, kiraBitis: e.target.value }))} className="mt-1 w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-2 py-1 text-white text-sm" />
                            </label>
                            <label className="text-gray-400">
                              Net Kira
                              <input type="text" inputMode="decimal" value={historyEditData.netKira} onChange={(e) => setHistoryEditData(prev => ({ ...prev, netKira: e.target.value }))} className="mt-1 w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-2 py-1 text-white text-sm" />
                            </label>
                            <label className="text-gray-400">
                              Brüt Kira
                              <input type="text" inputMode="decimal" value={historyEditData.brutKira} onChange={(e) => setHistoryEditData(prev => ({ ...prev, brutKira: e.target.value }))} className="mt-1 w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-2 py-1 text-white text-sm" />
                            </label>
                            <label className="text-gray-400 sm:col-span-2">
                              Açıklama
                              <input type="text" value={historyEditData.aciklama} onChange={(e) => setHistoryEditData(prev => ({ ...prev, aciklama: e.target.value }))} className="mt-1 w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-2 py-1 text-white text-sm" />
                            </label>
                            <div className="flex gap-2 sm:col-span-2 justify-end">
                              <button onClick={() => { setEditingHistoryIndex(null); setHistoryEditData({}) }} className="px-3 py-1.5 rounded-lg bg-blue-900/40 text-gray-300 hover:bg-blue-800/50">Vazgeç</button>
                              <button onClick={() => updateKiraHistoryItem(originalIndex)} className="px-3 py-1.5 rounded-lg bg-yellow-500 text-blue-950 font-medium hover:bg-yellow-400">Kaydet</button>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 items-center">
                            <span className="text-slate-400">
                              Dönem<br />
                              <b className="text-slate-200">{tarihTR(donem.kiraBaslangic)} - {tarihTR(donem.kiraBitis)}</b>
                            </span>
                            <span className="text-slate-400">
                              Net kira<br />
                              <b className="text-slate-200">{
                                (() => {
                                  const net = parseTurkishNumber(donem.netKira)
                                  const brut = parseTurkishNumber(donem.brutKira)
                                  if (Number.isFinite(net) && net > 0) return paraTR(net)
                                  if (Number.isFinite(brut) && brut > 0) return paraTR(brut * (1 - KIRA_STOPAJ_ORANI))
                                  return '0,00'
                                })()
                              } TL</b>
                            </span>
                            <span className="text-slate-400">
                              Brüt kira<br />
                              <b className="text-slate-200">{
                                (() => {
                                  const net = parseTurkishNumber(donem.netKira)
                                  const brut = parseTurkishNumber(donem.brutKira)
                                  if (Number.isFinite(brut) && brut > 0) return paraTR(brut)
                                  if (Number.isFinite(net) && net > 0) return paraTR(net / (1 - KIRA_STOPAJ_ORANI))
                                  return '0,00'
                                })()
                              } TL</b>
                            </span>
                            <span className="text-slate-400">
                              Kayıt tarihi<br />
                              <b className="text-slate-200">{tarihTR(donem.kayitTarihi)}</b>
                            </span>
                            <div className="flex gap-2 justify-end sm:col-span-1">
                              <button onClick={() => startEditHistoryItem(originalIndex, donem)} className="p-1.5 rounded-lg bg-blue-900/40 text-yellow-400 hover:bg-blue-800/50" title="Düzenle">
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteKiraHistoryItem(originalIndex)} className="p-1.5 rounded-lg bg-blue-900/40 text-red-400 hover:bg-red-500/20" title="Sil">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {/* Kira Tipi */}
              <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                <span className="text-gray-400 text-sm">Sahiplik Durumu</span>
                {isEditing ? (
                  <select
                    value={getKiraBilgisi(editData).kiraTipi || ''}
                    onChange={(e) => setKiraField('kiraTipi', e.target.value)}
                    className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400"
                  >
                    <option value="">Seciniz</option>
                    <option value="mal_sahibi">Mal Sahibi</option>
                    <option value="kiraci">Kiraci</option>
                  </select>
                ) : (
                  <span className="text-white text-sm font-medium">
                    {getKiraBilgisi(client).kiraTipi === 'mal_sahibi' ? 'Mal Sahibi' : getKiraBilgisi(client).kiraTipi === 'kiraci' ? 'Kiraci' : '-'}
                  </span>
                )}
              </div>
              {/* Isyeri Kirasi (sadece kiraci) */}
              {false && getKiraBilgisi(isEditing ? editData : client).kiraTipi === 'kiraci' && (
                <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                  <span className="text-gray-400 text-sm">Isyeri Kirasi (Aylik)</span>
                  {isEditing ? (
                    <input
                      type="number"
                      value={getKiraBilgisi(editData).isYeriKirasi || ''}
                      onChange={(e) => setKiraField('isYeriKirasi', e.target.value)}
                      placeholder="Orn: 15000"
                      className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400"
                    />
                  ) : (
                    <span className="text-white text-sm font-medium">{getKiraBilgisi(client).isYeriKirasi ? `${Number(getKiraBilgisi(client).isYeriKirasi).toLocaleString('tr-TR')} TL` : '-'}</span>
                  )}
                </div>
              )}
              {/* Isyeri Sahipleri; kira tarihleri ve stopaj bu bolumun icindedir */}
              {getKiraBilgisi(isEditing ? editData : client).kiraTipi === 'kiraci' && (
                <div className="p-3 bg-blue-900/20 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400 text-sm">Isyeri Kirasi - Mal Sahipleri</span>
                    {isEditing && (
                      <button onClick={addIsyeriSahibi} className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded flex items-center gap-1"><Plus className="w-3 h-3" /> Mal Sahibi Ekle</button>
                    )}
                  </div>
                  {(getKiraBilgisi(isEditing ? editData : client).isyeriSahipleri || []).length === 0 ? (
                    <p className="text-gray-500 text-xs">Isyeri mal sahibi kaydi yok</p>
                  ) : (
                    <div className="space-y-2">
                      {(getKiraBilgisi(isEditing ? editData : client).isyeriSahipleri || []).map((es, i) => (
                        <div key={i} className="bg-blue-950/40 rounded-lg p-3 border border-blue-700/30">
                          {isEditing ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <input type="text" value={es.tc || ''} onChange={(e) => updateIsyeriSahibi(i, 'tc', e.target.value)} placeholder="TC Kimlik No" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-yellow-400" />
                              <input type="text" value={es.adSoyad || ''} onChange={(e) => updateIsyeriSahibi(i, 'adSoyad', e.target.value)} placeholder="Ad Soyad" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-yellow-400" />
                              <input type="text" value={es.hisseOrani || ''} onChange={(e) => updateIsyeriSahibi(i, 'hisseOrani', e.target.value)} placeholder="Hisse Orani (%)" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-yellow-400" />
                              <input type="text" value={es.adres || ''} onChange={(e) => updateIsyeriSahibi(i, 'adres', e.target.value)} placeholder="Adres" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-yellow-400" />
                               <label className="text-gray-400 text-xs sm:col-span-2">
                                 Kira Tutarı Giriş Türü
                                 <select value={es.kiraTutarTipi === 'brut' ? 'brut' : 'net'} onChange={(e) => updateIsyeriSahibiTutar(i, e.target.value, e.target.value === 'brut' ? es.brutKira || '' : es.netKira || '')} className="mt-1 w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-yellow-400">
                                   <option value="net">Net kira girilecek</option>
                                   <option value="brut">Brüt kira girilecek</option>
                                 </select>
                               </label>
                               <label className="text-gray-400 text-xs">
                                 Net Kira (TL) {es.kiraTutarTipi === 'brut' ? '(hesaplanan)' : '(giriş)'}
                                 <input type="text" inputMode="decimal" value={es.netKira || ''} readOnly={es.kiraTutarTipi === 'brut'} onChange={(e) => updateIsyeriSahibiTutar(i, 'net', e.target.value)} onBlur={() => finalizeIsyeriSahibiTutar(i)} placeholder="Net Kira" className={`mt-1 w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-yellow-400 ${es.kiraTutarTipi === 'brut' ? 'cursor-not-allowed opacity-70' : ''}`} />
                               </label>
                               <label className="text-gray-400 text-xs">
                                 Brüt Kira (TL) {es.kiraTutarTipi === 'brut' ? '(giriş)' : '(hesaplanan)'}
                                 <input type="text" inputMode="decimal" value={es.brutKira || ''} readOnly={es.kiraTutarTipi !== 'brut'} onChange={(e) => updateIsyeriSahibiTutar(i, 'brut', e.target.value)} onBlur={() => finalizeIsyeriSahibiTutar(i)} placeholder="Brüt Kira" className={`mt-1 w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-yellow-400 ${es.kiraTutarTipi !== 'brut' ? 'cursor-not-allowed opacity-70' : ''}`} />
                               </label>
                              <label className="text-gray-400 text-xs">
                                Kira Baslangic Tarihi
                                <input type="date" value={normalizeDateForInput(es.kiraBaslangic)} onChange={(e) => updateIsyeriSahibi(i, 'kiraBaslangic', e.target.value)} className="mt-1 w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-yellow-400" />
                              </label>
                              <label className="text-gray-400 text-xs">
                                Kira Bitis Tarihi
                                <input type="date" value={normalizeDateForInput(es.kiraBitis)} onChange={(e) => updateIsyeriSahibi(i, 'kiraBitis', e.target.value)} className="mt-1 w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-yellow-400" />
                              </label>
                              <label className="text-gray-400 text-xs">
                                Stopaj
                                 <select value={es.stopaj || ''} onChange={(e) => updateIsyeriSahibiStopaj(i, e.target.value)} className="mt-1 w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-yellow-400">
                                  <option value="">Seciniz</option>
                                  <option value="var">Var</option>
                                  <option value="yok">Yok</option>
                                </select>
                              </label>
                              <div className="sm:col-span-2 text-right">
                                <button onClick={() => removeIsyeriSahibi(i)} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 ml-auto"><Trash2 className="w-3 h-3" /> Kaldir</button>
                              </div>
                            </div>
                          ) : (
                            <div className="text-sm">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-white font-medium">{es.adSoyad || '-'}</span>
                                  {es.hisseOrani && <span className="text-blue-400 text-xs">%{es.hisseOrani}</span>}
                                </div>
                                <button onClick={() => openKiraUpdateModal(i, es)} className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded flex items-center gap-1 hover:bg-yellow-500/30">
                                  <Edit3 className="w-3 h-3" /> Kirayi Guncelle
                                </button>
                                {(() => {
                                  const baslangicIso = normalizeDateForInput(es.kiraBaslangic)
                                  const bitisIso = normalizeDateForInput(es.kiraBitis)
                                  const beklenenBitis = baslangicIso ? addOneYear(baslangicIso) : ''
                                  const hatali = baslangicIso && bitisIso && bitisIso !== beklenenBitis
                                  return hatali ? (
                                    <button onClick={() => fixKiraDates(i)} className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded flex items-center gap-1 hover:bg-red-500/30">
                                      <Calendar className="w-3 h-3" /> Tarih Duzelt
                                    </button>
                                  ) : null
                                })()}
                              </div>
                              <div className="text-gray-400 text-xs mt-1 grid grid-cols-1 sm:grid-cols-2 gap-1">
                                {es.tc && <span>TC: {es.tc}</span>}
                                {es.adres && <span className="sm:col-span-2">Adres: {es.adres}</span>}
                                {(es.netKira || es.brutKira) && <span className="sm:col-span-2 text-yellow-400">Net: {es.netKira ? parseTurkishNumber(es.netKira).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL' : '-'} / Brut: {es.brutKira ? parseTurkishNumber(es.brutKira).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL' : '-'}</span>}
                                <span>{es.kiraBaslangic ? `Baslangic: ${formatDisplayDate(es.kiraBaslangic)}` : 'Baslangic: -'}</span>
                                <span>{es.kiraBitis ? `Bitis: ${formatDisplayDate(es.kiraBitis)}` : 'Bitis: -'}</span>
                                <span>Stopaj: {es.stopaj === 'var' ? 'Var' : es.stopaj === 'yok' ? 'Yok' : '-'}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Onemli Tarihler */}
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Calendar className="w-5 h-5 text-yellow-400" /> Onemli Tarihler</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                <span className="text-gray-400 text-sm">Is Acilis</span>
                {isEditing ? <input type="date" value={normalizeDateForInput(editData.isAcilisTarihi || editData.openDate)} onChange={(e) => setEditData({...editData, isAcilisTarihi: e.target.value})} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400" /> : <span className="text-white text-sm">{formatDisplayDate(client.isAcilisTarihi || client.openDate)}</span>}
              </div>
              <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                <span className="text-gray-400 text-sm">e-Imza Baslangic</span>
                {isEditing ? <input type="date" value={normalizeDateForInput(editData.eimzaStart)} onChange={(e) => setEditData({...editData, eimzaStart: e.target.value})} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400" /> : <span className="text-white text-sm">{formatDisplayDate(client.eimzaStart)}</span>}
              </div>
              <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                <span className="text-gray-400 text-sm">e-Imza Bitis</span>
                {isEditing ? <input type="date" value={normalizeDateForInput(editData.eimzaEnd)} onChange={(e) => setEditData({...editData, eimzaEnd: e.target.value})} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400" /> : <span className="text-white text-sm">{formatDisplayDate(client.eimzaEnd)}</span>}
              </div>
            </div>
          </div>

          {/* Notlar */}
          <div className="md:col-span-2 bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-4">Notlar</h3>
            {isEditing ? (
              <textarea value={editData.notes || ''} onChange={(e) => setEditData({...editData, notes: e.target.value})} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl p-4 text-white min-h-[80px] focus:outline-none focus:border-yellow-400" placeholder="Notlar..." />
            ) : (
              <p className="text-gray-300 bg-blue-900/20 rounded-xl p-4">{client.notes || 'Not yok'}</p>
            )}
          </div>
        </div>
      )}

      {/* ==================== ORTAKLAR / YETKİLİLER TAB ==================== */}
      {activeTab === 'officials' && isCompany && (
        <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white">{isAdiOrtaklik ? 'Adi Ortaklik Ortaklari' : 'Sirket Ortaklari / Yetkililer'}</h3>
            <button onClick={() => { setShowPartnerForm(!showPartnerForm); setEditPartnerId(null); setNewPartner({ name: '', title: '', phone: '', email: '', tc: '', vkn: '', vergi_dairesi: '', hisse_orani: '', sermaye: '', paySayisi: '', address: '', edevletSifre: '', musteriSinifi: '' }) }} className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1">
              <Plus className="w-4 h-4" /><span>Ortak Ekle</span>
            </button>
          </div>

          {showPartnerForm && (
            <div className="bg-blue-900/20 rounded-xl p-4 mb-4 border border-blue-700/30">
              <h4 className="text-white font-medium mb-3 text-sm">{editPartnerId ? 'Ortak Duzenle' : 'Yeni Ortak'}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <input type="text" value={newPartner.name} onChange={(e) => setNewPartner({...newPartner, name: e.target.value})} placeholder="Ad Soyad *" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <input type="text" value={newPartner.title} onChange={(e) => setNewPartner({...newPartner, title: e.target.value})} placeholder="Unvan (Ortak/Mudur)" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <input type="text" value={newPartner.tc} onChange={(e) => setNewPartner({...newPartner, tc: e.target.value})} placeholder="TC Kimlik No" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <div className="relative">
                  <input
                    type={showPasswords.partnerEdevlet ? 'text' : 'password'}
                    value={newPartner.edevletSifre || ''}
                    onChange={(e) => setNewPartner({...newPartner, edevletSifre: e.target.value})}
                    placeholder="e-Devlet Şifresi"
                    autoComplete="new-password"
                    className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 pr-10 text-white text-sm focus:outline-none focus:border-yellow-400"
                  />
                  <button type="button" onClick={() => setShowPasswords(p => ({ ...p, partnerEdevlet: !p.partnerEdevlet }))} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                    {showPasswords.partnerEdevlet ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <input type="text" value={newPartner.vkn} onChange={(e) => setNewPartner({...newPartner, vkn: e.target.value})} placeholder="Vergi No" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <input type="text" value={newPartner.vergi_dairesi} onChange={(e) => setNewPartner({...newPartner, vergi_dairesi: e.target.value})} placeholder="Vergi Dairesi" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <input type="text" value={newPartner.hisse_orani} onChange={(e) => setNewPartner({...newPartner, hisse_orani: e.target.value})} placeholder="Sermaye Pay Orani (%)" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <input type="text" inputMode="decimal" value={newPartner.sermaye} onChange={(e) => setNewPartner({...newPartner, sermaye: e.target.value})} placeholder="Sermaye (TL)" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <input type="text" inputMode="numeric" value={newPartner.paySayisi} onChange={(e) => setNewPartner({...newPartner, paySayisi: e.target.value})} placeholder="Pay Sayisi" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <input type="text" value={newPartner.phone} onChange={(e) => setNewPartner({...newPartner, phone: e.target.value})} placeholder="Telefon" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <input type="text" value={newPartner.email} onChange={(e) => setNewPartner({...newPartner, email: e.target.value})} placeholder="E-Posta" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <textarea value={newPartner.address} onChange={(e) => setNewPartner({...newPartner, address: e.target.value})} placeholder="Adres" rows={1} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400 resize-none sm:col-span-2" />
                {isAdiOrtaklik && (
                  <select
                    value={newPartner.musteriSinifi || ''}
                    onChange={(e) => setNewPartner({...newPartner, musteriSinifi: e.target.value})}
                    className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                  >
                    <option value="">Müşteri Sınıfı (varsayılan: 2. Sınıf)</option>
                    <option value="1. Sinif">1. Sinif (Bilanco)</option>
                    <option value="2. Sinif">2. Sinif (Isletme)</option>
                    <option value="Serbest Meslek">Serbest Meslek</option>
                    <option value="Basit Usul">Basit Usul</option>
                  </select>
                )}
              </div>
              {isAdiOrtaklik && (
                <p className="text-gray-400 text-xs mt-2">Adi ortaklıkta ortak kaydedildiğinde müşteri listesine de eklenir — geçici vergi ve gelir vergisini kendi adına verir; KDV, muhtasar ve SGK ortaklık VKN'si üzerinden takip edilir.</p>
              )}
              <div className="flex gap-2 mt-3">
                <button onClick={handleSavePartner} className="bg-green-500/20 text-green-400 px-4 py-2 rounded-lg text-sm font-medium">{editPartnerId ? 'Guncelle' : 'Kaydet'}</button>
                <button onClick={() => { setShowPartnerForm(false); setEditPartnerId(null); setNewPartner({ name: '', title: '', phone: '', email: '', tc: '', vkn: '', vergi_dairesi: '', hisse_orani: '', sermaye: '', paySayisi: '', address: '', edevletSifre: '', musteriSinifi: '' }) }} className="bg-red-500/20 text-red-400 px-4 py-2 rounded-lg text-sm font-medium">Iptal</button>
              </div>
            </div>
          )}

          {partners.length > 0 ? (
            <div className="space-y-3">
              {partners.map((partner) => (
                <div key={partner.id} className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/20">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-medium">{partner.name}</span>
                        {partner.title && <span className="text-yellow-500 text-xs bg-yellow-500/10 px-2 py-0.5 rounded">{partner.title}</span>}
                        {partner.hisse_orani && <span className="text-blue-400 text-xs">Pay Orani: %{partner.hisse_orani}</span>}
                        {partner.sermaye != null && partner.sermaye !== '' && <span className="text-green-400 text-xs">Sermaye: {formatMoney(partner.sermaye)} TL</span>}
                        {partner.pay_sayisi != null && partner.pay_sayisi !== '' && <span className="text-purple-400 text-xs">Pay Sayisi: {partner.pay_sayisi}</span>}
                        <label className="flex items-center gap-1.5 text-xs cursor-pointer bg-blue-900/40 border border-blue-700/50 rounded px-2 py-0.5" title="e-Tebligat ve SGK odemesi bu ortagin TC + sifresi ile yapilir">
                          <input type="checkbox" checked={!!partner.edevlet_aktif} onChange={() => handlePartnerEdevletToggle(partner)} className="accent-yellow-500" />
                          <span className={partner.edevlet_aktif ? 'text-green-400 font-medium' : 'text-gray-400'}>e-Devlet Aktif</span>
                        </label>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-2 text-sm text-gray-400">
                        {partner.tc && <span>TC: {partner.tc}</span>}
                        {partner.vkn && <span>VKN: {partner.vkn}</span>}
                        {partner.vergi_dairesi && <span>Vergi Dairesi: {partner.vergi_dairesi}</span>}
                        {partner.phone && <span>Tel: {partner.phone}</span>}
                        {partner.email && <span>E-Posta: {partner.email}</span>}
                        {partner.address && <span className="sm:col-span-2">Adres: {partner.address}</span>}
                        {partner.edevlet_sifre && (
                          <span className="sm:col-span-2 flex items-center gap-2">
                            <span>e-Devlet Sifresi:</span>
                            <span className="font-mono text-gray-200">{showPasswords[`partner_${partner.id}`] ? partner.edevlet_sifre : '••••••••'}</span>
                            <button onClick={() => setShowPasswords(p => ({ ...p, [`partner_${partner.id}`]: !p[`partner_${partner.id}`] }))} className="text-gray-500 hover:text-yellow-400 transition-colors">
                              {showPasswords[`partner_${partner.id}`] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEditPartner(partner)} className="text-gray-500 hover:text-yellow-400 transition-colors p-1" title="Duzenle"><Edit3 className="w-4 h-4" /></button>
                      <button onClick={() => removePartner(partner.id)} className="text-gray-500 hover:text-red-400 transition-colors p-1" title="Sil"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-6">Henuz ortak/yetkili eklenmemis</p>
          )}
        </div>
      )}

      {/* ==================== BANKALAR TAB ==================== */}
      {activeTab === 'banks' && (
        <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white">Banka Hesaplari</h3>
            <button onClick={() => { setShowBankForm(!showBankForm); setEditBankIndex(-1); setNewBank({ bank: '', branch: '', iban: '', accountNo: '' }) }} className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1">
              <Plus className="w-4 h-4" /><span>Banka Ekle</span>
            </button>
          </div>

          {showBankForm && (
            <div className="bg-blue-900/20 rounded-xl p-4 mb-4 border border-blue-700/30">
              <h4 className="text-white font-medium mb-3 text-sm">{editBankIndex >= 0 ? 'Banka Bilgisi Duzenle' : 'Yeni Banka Hesabi'}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input type="text" value={newBank.bank} onChange={(e) => setNewBank({...newBank, bank: e.target.value})} placeholder="Banka Adi *" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <input type="text" value={newBank.branch} onChange={(e) => setNewBank({...newBank, branch: e.target.value})} placeholder="Sube" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <input type="text" value={newBank.iban} onChange={(e) => setNewBank({...newBank, iban: e.target.value})} placeholder="IBAN" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400 sm:col-span-2" />
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={addBank} className="bg-green-500/20 text-green-400 px-4 py-2 rounded-lg text-sm font-medium">{editBankIndex >= 0 ? 'Guncelle' : 'Kaydet'}</button>
                <button onClick={() => { setShowBankForm(false); setEditBankIndex(-1); setNewBank({ bank: '', branch: '', iban: '', accountNo: '' }) }} className="bg-red-500/20 text-red-400 px-4 py-2 rounded-lg text-sm font-medium">Iptal</button>
              </div>
            </div>
          )}

          {client.banks && client.banks.length > 0 ? (
            <div className="space-y-3">
              {client.banks.map((bank, i) => (
                <div key={i} className="bg-blue-900/20 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2"><span className="text-white font-medium">{bank.bank}</span>{bank.branch && <span className="text-gray-400 text-sm">- {bank.branch}</span>}</div>
                    <div className="text-gray-300 text-sm font-mono mt-1">IBAN: {bank.iban || '-'}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEditBank(i)} className="text-gray-500 hover:text-yellow-400 transition-colors p-1" title="Duzenle"><Edit3 className="w-4 h-4" /></button>
                    <button onClick={() => removeBank(i)} className="text-gray-500 hover:text-red-400 transition-colors p-1" title="Sil"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-6">Henuz banka hesabi eklenmemis</p>
          )}
        </div>
      )}

      {/* ==================== E-HİZMETLER TAB ==================== */}
      {activeTab === 'services' && (
        <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
          <h3 className="text-lg font-semibold text-white mb-4">Elektronik Hizmetler</h3>
          <p className="text-gray-500 text-xs mb-4">Tikla: Aktif/Pasif degistir</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { key: 'efatura', label: 'e-Fatura' },
              { key: 'earsiv', label: 'e-Arsiv' },
              { key: 'esmm', label: 'e-SMM' },
              { key: 'edefter', label: 'e-Defter' },
            ].map((item) => (
              <div key={item.key} className={`p-4 rounded-xl border transition-all ${client[item.key] ? 'bg-green-500/10 border-green-500/30' : 'bg-blue-900/20 border-blue-700/20'}`}>
                <button onClick={() => toggleEService(item.key)} className={`w-full flex items-center justify-between cursor-pointer ${client[item.key] ? 'hover:bg-green-500/10' : 'hover:bg-blue-800/30'} -m-1 p-1 rounded-lg`}>
                  <span className="text-white text-sm font-medium">{item.label}</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${client[item.key] ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-500'}`}>
                    {client[item.key] ? 'Aktif' : 'Pasif'}
                  </span>
                </button>
                {item.key !== 'edefter' && client[item.key] !== undefined && (
                  <button onClick={() => toggleEimza(item.key)}
                    className={`mt-2 w-full flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs transition-all cursor-pointer ${eimzaBayraklari[item.key] ? 'bg-yellow-400/10 border-yellow-400/40 hover:bg-yellow-400/20' : 'bg-blue-900/30 border-blue-700/30 hover:bg-blue-800/40'}`}
                    title={`${item.label} icin e-imza durumu`}>
                    <span className={eimzaBayraklari[item.key] ? 'text-yellow-300 font-medium' : 'text-gray-500'}>e-İmza</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${eimzaBayraklari[item.key] ? 'bg-yellow-400/20 text-yellow-300' : 'bg-gray-500/20 text-gray-500'}`}>
                      {eimzaBayraklari[item.key] ? 'Aktif' : 'Pasif'}
                    </span>
                  </button>
                )}
              </div>
            ))}
          </div>
          {client.edefter && (
            <div className="mt-3 p-3 bg-blue-900/20 rounded-xl flex items-center justify-between">
              <span className="text-gray-400 text-sm">e-Defter Periyodu</span>
              <select value={client.edefterPeriod || 'aylik'} onChange={(e) => saveClient({...client, edefterPeriod: e.target.value})} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm focus:outline-none focus:border-yellow-400">
                <option value="aylik">Aylik</option>
                <option value="3aylik">3 Aylik</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* ==================== KURUM ERİŞİMİ TAB ==================== */}
      {activeTab === 'kurumlar' && (
        <div className="space-y-6">
          {/* MUBiS Portal Erisimi */}
          <PortalErisimKarti client={client} onGuncellendi={() => refreshClients?.()} />

          {/* Otomatik Belge Toplama */}
          <PortalOtomasyonKarti client={client} />

          {/* Portal Sifreleri */}
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-yellow-400" /> Portal Sifreleri
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Vergi Dairesi - Kullanici + Sifre */}
              <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/20">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">🏛️</span>
                  <span className="text-white font-medium text-sm">Dijital Vergi Dairesi</span>
                  {!isEditing && (client.dvsUsername || client.dvsPassword) && (
                    <button onClick={() => portalSifreSil(['dvsUsername', 'dvsPassword'], 'Dijital Vergi Dairesi')} title="Kayitli kullanici/sifreyi sil" className="ml-auto text-gray-500 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    <input type="text" value={editData.dvsUsername || ''} onChange={(e) => setEditData({...editData, dvsUsername: e.target.value})} placeholder="Kullanici Adi / VKN" className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                    <div className="relative">
                      <input type={showPasswords.dvsPassword ? 'text' : 'password'} value={editData.dvsPassword || ''} onChange={(e) => setEditData({...editData, dvsPassword: e.target.value})} placeholder="Sifre" className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 pr-10 text-white text-sm focus:outline-none focus:border-yellow-400" />
                      <button type="button" onClick={() => setShowPasswords({...showPasswords, dvsPassword: !showPasswords.dvsPassword})} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                        {showPasswords.dvsPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between"><span className="text-gray-400 text-xs">Kullanici:</span><span className="text-gray-200 text-sm font-mono">{client.dvsUsername || '-'}</span></div>
                    <div className="flex items-center justify-between"><span className="text-gray-400 text-xs">Sifre:</span>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-200 text-sm font-mono">{client.dvsPassword ? (showPasswords.dvsPassword ? client.dvsPassword : '••••••••') : '-'}</span>
                        {client.dvsPassword && <button onClick={() => setShowPasswords({...showPasswords, dvsPassword: !showPasswords.dvsPassword})} className="text-gray-500 hover:text-yellow-400 transition-colors">{showPasswords.dvsPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SGK - Kullanici Adi, Isyeri Kodu, Sistem Sifresi, Isyeri Sifresi */}
              <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/20">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">🏥</span>
                  <span className="text-white font-medium text-sm">SGK / e-Bildirge</span>
                  {!isEditing && (client.sgkUser || client.sgkIsyeriKodu || client.sgkSistemSifre || client.sgkIsyeriSifre) && (
                    <button onClick={() => portalSifreSil(['sgkUser', 'sgkIsyeriKodu', 'sgkSistemSifre', 'sgkIsyeriSifre'], 'SGK / e-Bildirge')} title="Kayitli SGK bilgilerini sil" className="ml-auto text-gray-500 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    <input type="text" value={editData.sgkUser || ''} onChange={(e) => setEditData({...editData, sgkUser: e.target.value})} placeholder="Kullanici Adi" className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                    <input type="text" value={editData.sgkIsyeriKodu || ''} onChange={(e) => setEditData({...editData, sgkIsyeriKodu: e.target.value})} placeholder="Isyeri Kodu" className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                    <div className="relative">
                      <input type={showPasswords.sgkSistemSifre ? 'text' : 'password'} value={editData.sgkSistemSifre || ''} onChange={(e) => setEditData({...editData, sgkSistemSifre: e.target.value})} placeholder="Sistem Sifresi" className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 pr-10 text-white text-sm focus:outline-none focus:border-yellow-400" />
                      <button type="button" onClick={() => setShowPasswords({...showPasswords, sgkSistemSifre: !showPasswords.sgkSistemSifre})} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                        {showPasswords.sgkSistemSifre ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="relative">
                      <input type={showPasswords.sgkIsyeriSifre ? 'text' : 'password'} value={editData.sgkIsyeriSifre || ''} onChange={(e) => setEditData({...editData, sgkIsyeriSifre: e.target.value})} placeholder="Isyeri Sifresi" className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 pr-10 text-white text-sm focus:outline-none focus:border-yellow-400" />
                      <button type="button" onClick={() => setShowPasswords({...showPasswords, sgkIsyeriSifre: !showPasswords.sgkIsyeriSifre})} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                        {showPasswords.sgkIsyeriSifre ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between"><span className="text-gray-400 text-xs">Kullanici:</span><span className="text-gray-200 text-sm font-mono">{client.sgkUser || '-'}</span></div>
                    <div className="flex items-center justify-between"><span className="text-gray-400 text-xs">Isyeri Kodu:</span><span className="text-gray-200 text-sm font-mono">{client.sgkIsyeriKodu || '-'}</span></div>
                    <div className="flex items-center justify-between"><span className="text-gray-400 text-xs">Sistem Sifresi:</span>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-200 text-sm font-mono">{client.sgkSistemSifre ? (showPasswords.sgkSistemSifre ? client.sgkSistemSifre : '••••••') : '-'}</span>
                        {client.sgkSistemSifre && <button onClick={() => setShowPasswords({...showPasswords, sgkSistemSifre: !showPasswords.sgkSistemSifre})} className="text-gray-500 hover:text-yellow-400 transition-colors">{showPasswords.sgkSistemSifre ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>}
                      </div>
                    </div>
                    <div className="flex items-center justify-between"><span className="text-gray-400 text-xs">Isyeri Sifresi:</span>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-200 text-sm font-mono">{client.sgkIsyeriSifre ? (showPasswords.sgkIsyeriSifre ? client.sgkIsyeriSifre : '••••••') : '-'}</span>
                        {client.sgkIsyeriSifre && <button onClick={() => setShowPasswords({...showPasswords, sgkIsyeriSifre: !showPasswords.sgkIsyeriSifre})} className="text-gray-500 hover:text-yellow-400 transition-colors">{showPasswords.sgkIsyeriSifre ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Ticaret Odasi - Sadece Ticari Sicil No */}
              <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/20">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">🏢</span>
                  <span className="text-white font-medium text-sm">Ticaret Odasi</span>
                  {!isEditing && client.ticaretSicilNo && (
                    <button onClick={() => portalSifreSil(['ticaretSicilNo'], 'Ticaret Odasi')} title="Kayitli ticari sicil noyu sil" className="ml-auto text-gray-500 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    <input type="text" value={editData.ticaretSicilNo || ''} onChange={(e) => setEditData({...editData, ticaretSicilNo: e.target.value})} placeholder="Ticari Sicil Numarasi" className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between"><span className="text-gray-400 text-xs">Ticari Sicil No:</span><span className="text-gray-200 text-sm font-mono">{client.ticaretSicilNo || '-'}</span></div>
                  </div>
                )}
                <p className="text-gray-500 text-[10px] mt-2 italic">Ticari sicil numarasiyla sorgulama yapilir</p>
              </div>

              {/* e-Devlet */}
              <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/20">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">🇹🇷</span>
                  <span className="text-white font-medium text-sm">e-Devlet</span>
                  {!isEditing && (client.edevletUser || client.edevletPass) && (
                    <button onClick={() => portalSifreSil(['edevletUser', 'edevletPass'], 'e-Devlet')} title="Kayitli TC/sifreyi sil" className="ml-auto text-gray-500 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    <input type="text" value={editData.edevletUser || ''} onChange={(e) => setEditData({...editData, edevletUser: e.target.value})} placeholder="TC Kimlik No" className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                    <div className="relative">
                      <input type={showPasswords.edevletPass ? 'text' : 'password'} value={editData.edevletPass || ''} onChange={(e) => setEditData({...editData, edevletPass: e.target.value})} placeholder="e-Devlet Sifresi" className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 pr-10 text-white text-sm focus:outline-none focus:border-yellow-400" />
                      <button type="button" onClick={() => setShowPasswords({...showPasswords, edevletPass: !showPasswords.edevletPass})} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                        {showPasswords.edevletPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between"><span className="text-gray-400 text-xs">TC Kimlik No:</span><span className="text-gray-200 text-sm font-mono">{client.edevletUser || '-'}</span></div>
                    <div className="flex items-center justify-between"><span className="text-gray-400 text-xs">Sifre:</span>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-200 text-sm font-mono">{client.edevletPass ? (showPasswords.edevletPass ? client.edevletPass : '••••••••') : '-'}</span>
                        {client.edevletPass && <button onClick={() => setShowPasswords({...showPasswords, edevletPass: !showPasswords.edevletPass})} className="text-gray-500 hover:text-yellow-400 transition-colors">{showPasswords.edevletPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>}
                      </div>
                    </div>
                  </div>
                )}
                <p className="text-gray-500 text-[10px] mt-2 italic">MERSiS ve diger e-Devlet islemleri icin kullanilir</p>
              </div>
              <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/20">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">📄</span>
                  <span className="text-white font-medium text-sm">e-Imza / Mali Muhur</span>
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    <select value={editData.kartTipi || ''} onChange={(e) => setEditData({...editData, kartTipi: e.target.value})} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400">
                      <option value="">Kart Tipi Secin</option>
                      <option value="Akis">Akis</option>
                      <option value="GemSafe">GemSafe</option>
                      <option value="Siemens">Siemens</option>
                      <option value="StarCOS">StarCOS</option>
                      <option value="Aladdin">Aladdin</option>
                    </select>
                    <div className="relative">
                      <input type={showPasswords.kartSifre ? 'text' : 'password'} value={editData.kartSifre || ''} onChange={(e) => setEditData({...editData, kartSifre: e.target.value})} placeholder="Kart Sifresi (PIN)" className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 pr-10 text-white text-sm focus:outline-none focus:border-yellow-400" />
                      <button type="button" onClick={() => setShowPasswords({...showPasswords, kartSifre: !showPasswords.kartSifre})} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                        {showPasswords.kartSifre ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between"><span className="text-gray-400 text-xs">Kart Tipi:</span><span className="text-gray-200 text-sm font-mono">{client.kartTipi || '-'}</span></div>
                    <div className="flex items-center justify-between"><span className="text-gray-400 text-xs">Kart Sifresi:</span>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-200 text-sm font-mono">{client.kartSifre ? (showPasswords.kartSifre ? client.kartSifre : '••••••') : '-'}</span>
                        {client.kartSifre && <button onClick={() => setShowPasswords({...showPasswords, kartSifre: !showPasswords.kartSifre})} className="text-gray-500 hover:text-yellow-400 transition-colors">{showPasswords.kartSifre ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>}
                      </div>
                    </div>
                  </div>
                )}
                <p className="text-gray-500 text-[10px] mt-2 italic">e-Fatura, e-SMM, e-Irsaliye girislerinde kullanilir</p>
              </div>
            </div>
          </div>

          {/* Vergi Dairesi Islemleri */}
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            {/* Proxy durum gostergesi */}
            <div className={`mb-3 px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${proxyReady ? 'bg-green-900/30 border border-green-700/40 text-green-400' : 'bg-yellow-900/30 border border-yellow-700/40 text-yellow-400'}`}>
              <span className={`w-2 h-2 rounded-full ${proxyReady ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`}></span>
              {proxyReady ? 'MUBiS Baglanti Merkezi aktif - Otomatik giris hazir' : 'MUBiS Baglanti Merkezi calismiyor - Sifre kopyala modu'}
            </div>

            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span className="text-lg">🏛️</span> Dijital Vergi Dairesi
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[
                { label: 'DVS Giris', portal: 'dvs', icon: '🔑', color: 'from-blue-500/20 to-blue-600/20 border-blue-500/30' },
                { label: 'Vergi Borcu Sorgula', portal: 'dvs-borc-sorgula', icon: '💰', color: 'from-red-500/20 to-red-600/20 border-red-500/30' },
                { label: 'Borcu Yok Kagidi', portal: 'dvs-borc-durum', icon: '📋', color: 'from-green-500/20 to-green-600/20 border-green-500/30' },
                { label: 'Mukellefiyet Belgesi', portal: 'dvs-mukellefiyet', icon: '📑', color: 'from-teal-500/20 to-teal-600/20 border-teal-500/30' },

                { label: 'e-Tebligat', portal: 'dvs-etebligat', icon: '📨', color: 'from-cyan-500/20 to-cyan-600/20 border-cyan-500/30' },
              ].map((item, i) => (
                <button key={i} onClick={() => handleDVSLogin(item.portal)} disabled={proxyLoading}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border bg-gradient-to-br ${item.color} hover:scale-105 transition-all cursor-pointer text-center group disabled:opacity-50`}>
                  <span className="text-2xl">{item.icon}</span>
                  <span className="text-white text-xs font-medium leading-tight">{item.label}</span>
                  {proxyLoading ? <span className="text-xs animate-spin">⏳</span> : <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-yellow-400 transition-colors" />}
                </button>
              ))}
            </div>
          </div>

          {/* SGK Islemleri */}
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span className="text-lg">🏥</span> SGK / Sigorta Islemleri
            </h3>
            {/* SGK Otomatik giris butonlari */}
            {client.sgkUser && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {[
                  { label: 'e-Bildirge Giris', portal: 'sgk', icon: '🔑', color: 'from-blue-500/20 to-blue-600/20 border-blue-500/30' },
                  { label: 'Borc Sorgula', portal: 'sgk-borc', icon: '💰', color: 'from-red-500/20 to-red-600/20 border-red-500/30' },
                  { label: 'Borc Yoktur', portal: 'sgk-isveren', icon: '📋', color: 'from-green-500/20 to-green-600/20 border-green-500/30' },
                ].map((item, i) => (
                  <button key={i} onClick={() => handleSGKLogin(item.portal)} disabled={proxyLoading}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border bg-gradient-to-br ${item.color} hover:scale-105 transition-all cursor-pointer text-center group disabled:opacity-50`}>
                    <span className="text-2xl">{item.icon}</span>
                    <span className="text-white text-xs font-medium leading-tight">{item.label}</span>
                    {proxyLoading ? <span className="text-xs animate-spin">⏳</span> : <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-yellow-400 transition-colors" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Ticaret Odasi + e-Devlet */}
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span className="text-lg">🏢</span> Ticaret Odasi / e-Devlet
            </h3>
            {/* e-Devlet giris butonu */}
            {client.edevletUser && client.edevletPass && (
              <button onClick={() => handleEDevletLogin()} disabled={proxyLoading}
                className={`w-full mb-4 ${proxyReady ? 'bg-gradient-to-r from-red-600 to-red-700' : 'bg-gradient-to-r from-red-700 to-red-800'} text-white py-3 rounded-xl font-medium hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50`}>
                {proxyLoading ? <><span className="animate-spin">⏳</span> Giris yapiliyor...</> : <><span>🇹🇷</span> e-Devlet Giris</>}
              </button>
            )}
            <p className="text-gray-400 text-xs mb-3">Ticari Sicil No ile sorgulama yapilir{client.ticaretSicilNo ? ` - Sicil No: ${client.ticaretSicilNo}` : ''}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[
                { label: 'ITO Giris', url: 'https://online.ito.org.tr/', icon: '🔑', color: 'from-blue-500/20 to-blue-600/20 border-blue-500/30' },
                { label: 'Faaliyet Belgesi', url: 'https://online.ito.org.tr/', icon: '📄', color: 'from-green-500/20 to-green-600/20 border-green-500/30' },
                { label: 'Borc Odeme', url: 'https://online.ito.org.tr/', icon: '💳', color: 'from-purple-500/20 to-purple-600/20 border-purple-500/30' },
                { label: 'Ticaret Sicil', url: 'https://online.ito.org.tr/', icon: '📑', color: 'from-orange-500/20 to-orange-600/20 border-orange-500/30' },
                { label: 'Oda Kayit Belgesi', url: 'https://online.ito.org.tr/', icon: '📋', color: 'from-teal-500/20 to-teal-600/20 border-teal-500/30' },
                { label: 'MERSIS (e-Devlet)', url: 'https://mersis.ticaret.gov.tr/Portal/KullaniciIslemleri/GirisIslemleri', icon: '🌐', color: 'from-indigo-500/20 to-indigo-600/20 border-indigo-500/30' },
              ].map((item, i) => (
                <a key={i} href={item.url} target="_blank" rel="noopener noreferrer" className={`flex flex-col items-center gap-2 p-4 rounded-xl border bg-gradient-to-br ${item.color} hover:scale-105 transition-all cursor-pointer text-center group`}>
                  <span className="text-2xl">{item.icon}</span>
                  <span className="text-white text-xs font-medium leading-tight">{item.label}</span>
                  <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-yellow-400 transition-colors" />
                </a>
              ))}
            </div>
          </div>

          {/* e-Belge Portallari - Musterinin aktif hizmetlerine gore */}
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span className="text-lg">📄</span> e-Belge Portallari
            </h3>

            {/* Musteri bilgileri - admin giris icin */}
            <div className="bg-blue-900/30 rounded-xl p-3 mb-4 flex flex-wrap items-center gap-3 text-xs">
              <span className="text-gray-400">Musteri:</span>
              <span className="text-white font-medium">{client.companyName || client.name || '-'}</span>
              {client.vkn && <><span className="text-gray-500">|</span><span className="text-gray-400">VKN:</span><span className="text-yellow-400 font-mono">{client.vkn}</span></>}
              {client.tcKimlik && <><span className="text-gray-500">|</span><span className="text-gray-400">TC:</span><span className="text-yellow-400 font-mono">{client.tcKimlik}</span></>}
            </div>

            {/* Aktif hizmet yoksa uyari */}
            {!client.efatura && !client.earsiv && !client.esmm && (
              <div className="bg-gray-500/10 border border-gray-500/20 rounded-xl p-4 text-center">
                <p className="text-gray-400 text-sm">Bu musterinin aktif e-Belge hizmeti bulunmuyor.</p>
                <p className="text-gray-500 text-xs mt-1">E-Hizmetler sekmesinden aktif ediniz.</p>
              </div>
            )}

            {/* e-Fatura Mukellefiyse */}
            {client.efatura && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                  <span className="text-green-400 text-sm font-medium">e-Fatura Mukellef</span>
                  <span className="text-gray-500 text-[10px]">e-Imza / Mali Muhur ile giris {client.kartTipi ? `(${client.kartTipi})` : ''}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {[
                    { label: 'e-Fatura', url: 'https://portal.efatura.gov.tr/efatura/wsctgirisSSL.jsp', icon: '📄', color: 'from-blue-500/20 to-blue-600/20 border-blue-500/30', eimza: true },
                    { label: 'e-Arsiv', url: 'https://earsivportal.efatura.gov.tr/', icon: '📂', color: 'from-purple-500/20 to-purple-600/20 border-purple-500/30', eimza: true },
                    { label: 'e-Irsaliye', url: 'https://earsivportal.efatura.gov.tr/', icon: '🚚', color: 'from-amber-500/20 to-amber-600/20 border-amber-500/30', eimza: true },
                    { label: 'e-Mustahsil Makbuzu', url: 'https://earsivportal.efatura.gov.tr/', icon: '🧾', color: 'from-teal-500/20 to-teal-600/20 border-teal-500/30', eimza: true },
                    { label: 'e-Fatura Iptal/Itiraz', url: 'https://ebelgebasvuru.gib.gov.tr/iptal-itiraz/sertifika-giris', icon: '❌', color: 'from-red-500/20 to-red-600/20 border-red-500/30', eimza: true },
                    { label: 'e-Defter', url: 'https://edefter.gib.gov.tr/global/login', icon: '📚', color: 'from-indigo-500/20 to-indigo-600/20 border-indigo-500/30', eimza: true },
                  ].map((item, i) => (
                    <button key={i} onClick={() => {
                      if (item.eimza) {
                        const kartInfo = client.kartTipi ? `\nKart: ${client.kartTipi}` : '';
                        const ok = window.confirm(`e-Imza / Mali Muhuru takiniz!${kartInfo}\n\nDevam etmek icin TAMAM basin.`);
                        if (!ok) return;
                      }
                      window.open(item.url, '_blank');
                    }} className={`flex flex-col items-center gap-2 p-4 rounded-xl border bg-gradient-to-br ${item.color} hover:scale-105 transition-all cursor-pointer text-center group`}>
                      <span className="text-2xl">{item.icon}</span>
                      <span className="text-white text-xs font-medium leading-tight">{item.label}</span>
                      <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-yellow-400 transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* e-Arsiv Mukellefiyse (e-Fatura degil) */}
            {client.earsiv && !client.efatura && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
                  <span className="text-emerald-400 text-sm font-medium">e-Arsiv Mukellef</span>
                  <span className="text-gray-500 text-[10px]">Internet Vergi Dairesi sifresiyle giris</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  <button onClick={handleEArsivLogin} disabled={proxyLoading}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border bg-gradient-to-br from-green-500/20 to-green-600/20 border-green-500/30 hover:scale-105 transition-all cursor-pointer text-center group disabled:opacity-50">
                    <span className="text-2xl">📂</span>
                    <span className="text-white text-xs font-medium leading-tight">e-Arsiv Portal Giris</span>
                    {proxyLoading ? <span className="text-xs animate-spin">⏳</span> : <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-yellow-400 transition-colors" />}
                  </button>
                </div>
              </div>
            )}

            {/* e-SMM Mukellefiyse */}
            {client.esmm && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 bg-cyan-400 rounded-full"></span>
                  <span className="text-cyan-400 text-sm font-medium">e-SMM Mukellef</span>
                  <span className="text-gray-500 text-[10px]">e-Imza / Mali Muhur ile giris {client.kartTipi ? `(${client.kartTipi})` : ''}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  <button onClick={() => {
                    const kartInfo = client.kartTipi ? `\nKart: ${client.kartTipi}` : '';
                    const ok = window.confirm(`e-Imza / Mali Muhuru takiniz!${kartInfo}\n\nDevam etmek icin TAMAM basin.`);
                    if (ok) window.open('https://earsivportal.efatura.gov.tr/', '_blank');
                  }} className="flex flex-col items-center gap-2 p-4 rounded-xl border bg-gradient-to-br from-cyan-500/20 to-cyan-600/20 border-cyan-500/30 hover:scale-105 transition-all cursor-pointer text-center group">
                    <span className="text-2xl">📝</span>
                    <span className="text-white text-xs font-medium leading-tight">e-SMM Portal Giris</span>
                    <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-yellow-400 transition-colors" />
                  </button>
                </div>
              </div>
            )}

            {/* EFaturaWebSocket - e-Imza gerektiren hizmet varsa goster */}
            {(client.efatura || client.esmm) && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mt-4">
                <div className="flex items-start gap-3">
                  <Lock className="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-yellow-300 text-sm font-medium mb-1">e-Imza / Mali Muhur Gerektiren Giris</p>
                    <p className="text-gray-400 text-xs">Portal girisinden once <strong className="text-yellow-400">EFaturaWebSocket</strong> programini calistirin, ardindan portal linkine tiklayin.</p>
                    <button
                      onClick={() => {
                        const link = document.createElement('a')
                        link.href = 'https://ebelge.gib.gov.tr/EFaturaWebSocket/EFaturaWebSocket.jnlp'
                        link.download = 'EFaturaWebSocket.jnlp'
                        link.click()
                      }}
                      className="mt-2 bg-yellow-500/20 text-yellow-400 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-yellow-500/30 transition-colors inline-flex items-center gap-1"
                    >
                      <Globe className="w-3.5 h-3.5" /> EFaturaWebSocket Indir
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== EVRAKLAR TAB ==================== */}
      {activeTab === 'documents' && (
        <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white">📁 Evrak Yonetimi</h3>
            {docLoading && <span className="text-yellow-400 text-sm animate-pulse">Islem yapiliyor...</span>}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gelir Beyani */}
            <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-white font-medium">Gelir Beyani</h4>
                <select
                  value={gelirBeyanYear}
                  onChange={e => setGelirBeyanYear(e.target.value)}
                  className="bg-blue-950 border border-blue-700/50 rounded-lg px-2 py-1 text-white text-sm"
                >
                  {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="space-y-3">
                {[
                  { key: 'beyanname', label: 'Gelir/Kurumlar Vergi Beyani' },
                  { key: 'tahakkuk', label: 'Tahakkuk' },
                  { key: 'mizan', label: 'Mizan' }
                ].map(doc => {
                  const docData = clientDocuments?.mali_veriler?.gelir_beyani?.[gelirBeyanYear]?.[doc.key]
                  return (
                    <div key={doc.key} className="flex items-center justify-between p-3 bg-blue-950/40 rounded-lg">
                      <span className="text-gray-300 text-sm">{doc.label}</span>
                      <div className="flex items-center gap-2">
                        {docData?.url ? (
                          <>
                            <a href={docData.url} target="_blank" rel="noreferrer" className="p-1.5 bg-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/30" title="Goruntule"><Eye className="w-4 h-4" /></a>
                            <a href={docData.url} download className="p-1.5 bg-green-500/20 rounded-lg text-green-400 hover:bg-green-500/30" title="Indir"><Download className="w-4 h-4" /></a>
                            <button
                              onClick={() => handleDeleteClientDocument(next => { delete next.mali_veriler.gelir_beyani[gelirBeyanYear][doc.key] })}
                              className="p-1.5 bg-red-500/20 rounded-lg text-red-400 hover:bg-red-500/30"
                              title="Sil"
                            ><Trash2 className="w-4 h-4" /></button>
                          </>
                        ) : (
                          <label className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border border-dashed cursor-pointer text-sm ${docLoading ? 'opacity-50 cursor-not-allowed' : 'border-blue-700/50 hover:border-yellow-500/50 hover:bg-blue-900/30 text-gray-300'}`}>
                            <Upload className="w-4 h-4" />
                            <span>{doc.key === 'mizan' ? 'Excel Y' : 'PDF Y'}</span>
                            <input type="file" accept={doc.key === 'mizan' ? '.xlsx,.xls' : 'application/pdf'} disabled={docLoading} className="hidden" onChange={e => { handleGelirBeyanUpload(e, doc.key); e.target.value = '' }} />
                          </label>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Gecici Vergi */}
            <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
              <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                <h4 className="text-white font-medium">Gecici Vergi</h4>
                <div className="flex items-center gap-2">
                  <select
                    value={geciciVergiYear}
                    onChange={e => setGeciciVergiYear(e.target.value)}
                    className="bg-blue-950 border border-blue-700/50 rounded-lg px-2 py-1 text-white text-sm"
                  >
                    {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <select
                    value={geciciVergiPeriod}
                    onChange={e => setGeciciVergiPeriod(e.target.value)}
                    className="bg-blue-950 border border-blue-700/50 rounded-lg px-2 py-1 text-white text-sm"
                  >
                    {[1, 2, 3, 4].map(p => <option key={p} value={p}>{p}. Donem</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-3">
                {[
                  { key: 'beyanname', label: 'Gecici Vergi Beyanname' },
                  { key: 'tahakkuk', label: 'Tahakkuk' },
                  { key: 'mizan', label: 'Mizan' }
                ].map(doc => {
                  const docData = clientDocuments?.mali_veriler?.gecici_vergi?.[geciciVergiYear]?.[geciciVergiPeriod]?.[doc.key]
                  return (
                    <div key={doc.key} className="flex items-center justify-between p-3 bg-blue-950/40 rounded-lg">
                      <span className="text-gray-300 text-sm">{doc.label}</span>
                      <div className="flex items-center gap-2">
                        {docData?.url ? (
                          <>
                            <a href={docData.url} target="_blank" rel="noreferrer" className="p-1.5 bg-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/30" title="Goruntule"><Eye className="w-4 h-4" /></a>
                            <a href={docData.url} download className="p-1.5 bg-green-500/20 rounded-lg text-green-400 hover:bg-green-500/30" title="Indir"><Download className="w-4 h-4" /></a>
                            <button
                              onClick={() => handleDeleteClientDocument(next => { delete next.mali_veriler.gecici_vergi[geciciVergiYear][geciciVergiPeriod][doc.key] })}
                              className="p-1.5 bg-red-500/20 rounded-lg text-red-400 hover:bg-red-500/30"
                              title="Sil"
                            ><Trash2 className="w-4 h-4" /></button>
                          </>
                        ) : (
                          <label className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border border-dashed cursor-pointer text-sm ${docLoading ? 'opacity-50 cursor-not-allowed' : 'border-blue-700/50 hover:border-yellow-500/50 hover:bg-blue-900/30 text-gray-300'}`}>
                            <Upload className="w-4 h-4" />
                            <span>{doc.key === 'mizan' ? 'Excel Y' : 'PDF Y'}</span>
                            <input type="file" accept={doc.key === 'mizan' ? '.xlsx,.xls' : 'application/pdf'} disabled={docLoading} className="hidden" onChange={e => { handleGeciciVergiUpload(e, doc.key); e.target.value = '' }} />
                          </label>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Vergi Levhasi */}
            <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
              <h4 className="text-white font-medium mb-4">Vergi Levhasi</h4>
              <div className="flex items-center justify-between p-3 bg-blue-950/40 rounded-lg">
                <span className="text-gray-300 text-sm">Son Vergi Levhasi</span>
                <div className="flex items-center gap-2">
                  {clientDocuments?.mali_veriler?.vergi_levhasi?.url ? (
                    <>
                      <a href={clientDocuments.mali_veriler.vergi_levhasi.url} target="_blank" rel="noreferrer" className="p-1.5 bg-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/30" title="Goruntule"><Eye className="w-4 h-4" /></a>
                      <a href={clientDocuments.mali_veriler.vergi_levhasi.url} download className="p-1.5 bg-green-500/20 rounded-lg text-green-400 hover:bg-green-500/30" title="Indir"><Download className="w-4 h-4" /></a>
                      <button
                        onClick={() => handleDeleteClientDocument(next => { delete next.mali_veriler.vergi_levhasi })}
                        className="p-1.5 bg-red-500/20 rounded-lg text-red-400 hover:bg-red-500/30"
                        title="Sil"
                      ><Trash2 className="w-4 h-4" /></button>
                    </>
                  ) : (
                    <label className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border border-dashed cursor-pointer text-sm ${docLoading ? 'opacity-50 cursor-not-allowed' : 'border-blue-700/50 hover:border-yellow-500/50 hover:bg-blue-900/30 text-gray-300'}`}>
                      <Upload className="w-4 h-4" />
                      <span>PDF Y</span>
                      <input type="file" accept="application/pdf" disabled={docLoading} className="hidden" onChange={e => { handleVergiLevhasiUpload(e); e.target.value = '' }} />
                    </label>
                  )}
                </div>
              </div>
            </div>

            {/* Mali Evraklar */}
            <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
              <h4 className="text-white font-medium mb-4">Mali Evraklar</h4>
              <div className="space-y-3 mb-4">
                <select
                  value={maliEvrakCategory}
                  onChange={e => setMaliEvrakCategory(e.target.value)}
                  className="w-full bg-blue-950 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm"
                >
                  <option value="imza_beyani">Imza Beyani</option>
                  <option value="gazete">Gazete</option>
                  <option value="kurulus_belgesi">Kurulus Belgesi</option>
                  <option value="diger">Diger</option>
                </select>
                <input
                  type="text"
                  value={maliEvrakName}
                  onChange={e => setMaliEvrakName(e.target.value)}
                  placeholder="Evrak adi (ornegin: 2026 Imza Beyani)"
                  className="w-full bg-blue-950 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm"
                />
                <label className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-dashed cursor-pointer ${docLoading || !maliEvrakName.trim() ? 'opacity-50 cursor-not-allowed border-gray-600' : 'border-blue-700/50 hover:border-yellow-500/50 hover:bg-blue-900/30'}`}>
                  <Upload className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-300 text-sm">{docLoading ? 'Yukleniyor...' : 'PDF / Resim Yukle'}</span>
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg" disabled={docLoading || !maliEvrakName.trim()} className="hidden" onChange={e => { handleMaliEvrakUpload(e); e.target.value = '' }} />
                </label>
              </div>

              {Object.keys(clientDocuments?.mali_evraklar || {}).length > 0 && (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {Object.entries(clientDocuments.mali_evraklar).map(([cat, list]) =>
                    Array.isArray(list) && list.map((doc, idx) => (
                      <div key={`${cat}_${idx}`} className="flex items-center justify-between p-2 bg-blue-950/40 rounded-lg">
                        <div className="min-w-0">
                          <p className="text-gray-200 text-sm truncate">{doc.name}</p>
                          <p className="text-gray-500 text-xs">{cat.replace(/_/g, ' ')} · {doc.size}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <a href={doc.url} target="_blank" rel="noreferrer" className="p-1.5 bg-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/30"><Eye className="w-4 h-4" /></a>
                          <a href={doc.url} download className="p-1.5 bg-green-500/20 rounded-lg text-green-400 hover:bg-green-500/30"><Download className="w-4 h-4" /></a>
                          <button
                            onClick={() => handleDeleteClientDocument(next => { next.mali_evraklar[cat].splice(idx, 1) })}
                            className="p-1.5 bg-red-500/20 rounded-lg text-red-400 hover:bg-red-500/30"
                          ><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== HESAP KODLARI TAB ==================== */}
      {activeTab === 'hesapkodlari' && (client.musteriSinifi === '1. Sinif' || isCompany) && (
        <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div>
              <h3 className="text-lg font-semibold text-white">Hesap Kodlari (LUCA)</h3>
              <p className="text-gray-500 text-xs mt-1">{hesapKodlari.length > 0 ? `${hesapKodlari.length} hesap kodu yuklu` : 'Yuklu degil'}</p>
            </div>
            <div className="flex gap-2">
              {hesapKodlari.length > 0 && (
                <button onClick={handleClearHesapKodlari} className="bg-red-500/20 text-red-400 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1"><Trash2 className="w-4 h-4" /><span>Temizle</span></button>
              )}
              <button onClick={() => hesapFileRef.current?.click()} className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1"><Upload className="w-4 h-4" /><span>Excel Yukle</span></button>
              <input ref={hesapFileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleHesapKoduUpload} className="hidden" />
            </div>
          </div>
          {hesapKodlari.length > 0 ? (
            <>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input type="text" value={hesapSearch} onChange={(e) => setHesapSearch(e.target.value)} placeholder="Hesap kodu veya adi ara..." className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 pl-9 pr-3 text-white text-sm focus:outline-none focus:border-yellow-400" />
              </div>
              {hesapBasamaklar.length > 1 && !hesapSearch && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {hesapBasamaklar.map(d => {
                    const adet = hesapKodlari.filter(hk => String(hk.kod || '').charAt(0) === d).length
                    return (
                      <button key={d} onClick={() => setHesapBasamak(d)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${hesapBasamak === d ? 'bg-yellow-500/30 text-yellow-300 border-yellow-500/50' : 'bg-blue-900/30 text-gray-400 border-blue-700/30 hover:text-white'}`}>
                        {d}'ler ({adet})
                      </button>
                    )
                  })}
                </div>
              )}
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-blue-900/30 sticky top-0"><tr className="text-left text-gray-400 text-sm"><th className="px-4 py-2">#</th><th className="px-4 py-2">Hesap Kodu</th><th className="px-4 py-2">Hesap Adi</th></tr></thead>
                  <tbody>
                    {filteredHesapKodlari.map((hk, i) => (
                      <tr key={i} className={`border-t border-blue-700/20 hover:bg-blue-800/20 ${hk.is_auto_added ? 'bg-yellow-500/5' : ''}`}><td className="px-4 py-2 text-gray-500 text-sm">{i+1}</td><td className="px-4 py-2 text-yellow-400 text-sm font-mono font-medium">{hk.kod}{hk.is_auto_added && <span className="ml-2 text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">AI</span>}</td><td className="px-4 py-2 text-white text-sm">{hk.ad}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hesapKodlari.some(h => h.is_auto_added) && (
                <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                  <p className="text-yellow-400 text-xs font-semibold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> AI tarafindan eklenen hesaplar</p>
                  <p className="text-gray-400 text-xs mt-1">Bu hesaplari LUCA'ya manuel olarak eklemeniz gerekir.</p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12"><Hash className="w-12 h-12 text-gray-600 mx-auto mb-3" /><p className="text-gray-400 mb-2">Hesap kodu listesi yuklu degil</p><p className="text-gray-500 text-sm">LUCA Excel hesap kodu listesini yukleyebilirsiniz</p></div>
          )}
        </div>
      )}

      {/* ==================== PERSONEL TAB ==================== */}
      {activeTab === 'personel' && (
        <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div>
              <h3 className="text-lg font-semibold text-white">Personel Listesi</h3>
              <p className="text-gray-500 text-xs mt-1">{personelList.length} personel kayitli</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <label className="cursor-pointer bg-green-600/20 text-green-400 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1 hover:bg-green-600/30 transition-colors">
                <Upload className="w-4 h-4" /><span>Bordro Excel</span>
                <input ref={bordroFileRef} type="file" accept=".xlsx,.xls" onChange={handleBordroUpload} className="hidden" />
              </label>
              <label className={`cursor-pointer px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1 transition-colors ${bildirgeYukleniyor === 'ise_giris' ? 'bg-blue-600/40 text-blue-200 cursor-wait' : 'bg-blue-600/20 text-blue-300 hover:bg-blue-600/30'}`}>
                {bildirgeYukleniyor === 'ise_giris' ? <span className="w-4 h-4 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" /> : <Camera className="w-4 h-4" />}
                <span>{bildirgeYukleniyor === 'ise_giris' ? 'Okunuyor...' : 'İşe Giriş Bildirgesi (AI)'}</span>
                <input ref={iseGirisBildirgeRef} type="file" accept=".pdf,image/*" onChange={(e) => handleBildirgeUpload(e, 'ise_giris')} className="hidden" disabled={!!bildirgeYukleniyor} />
              </label>
              <label className={`cursor-pointer px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1 transition-colors ${bildirgeYukleniyor === 'isten_cikis' ? 'bg-orange-600/40 text-orange-200 cursor-wait' : 'bg-orange-600/20 text-orange-300 hover:bg-orange-600/30'}`}>
                {bildirgeYukleniyor === 'isten_cikis' ? <span className="w-4 h-4 border-2 border-orange-300 border-t-transparent rounded-full animate-spin" /> : <Camera className="w-4 h-4" />}
                <span>{bildirgeYukleniyor === 'isten_cikis' ? 'Okunuyor...' : 'İşten Çıkış Bildirgesi (AI)'}</span>
                <input ref={istenCikisBildirgeRef} type="file" accept=".pdf,image/*" onChange={(e) => handleBildirgeUpload(e, 'isten_cikis')} className="hidden" disabled={!!bildirgeYukleniyor} />
              </label>
              <button onClick={() => { setShowPersonelForm(true); setEditPersonelId(null); resetPersonelForm() }}
                className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1">
                <Plus className="w-4 h-4" /><span>Ekle</span>
              </button>
            </div>
          </div>

          {bildirgeHata && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
              {bildirgeHata}
            </div>
          )}

          {/* Personel Ekleme/Duzenleme Formu */}
          {showPersonelForm && (
            <div className="mb-6 p-4 bg-blue-900/20 rounded-xl border border-blue-700/40">
              <h4 className="text-sm font-semibold text-yellow-400 mb-3">{editPersonelId ? 'Personel Duzenle' : 'Yeni Personel'}</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input type="text" placeholder="Ad Soyad *" value={personelForm.ad_soyad} onChange={(e) => setPersonelForm({...personelForm, ad_soyad: e.target.value})}
                  className="bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <input type="text" placeholder="TC Kimlik No" value={personelForm.tc_kimlik} onChange={(e) => setPersonelForm({...personelForm, tc_kimlik: e.target.value})}
                  className="bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <select value={personelUcretTipi} onChange={(e) => { setPersonelUcretTipi(e.target.value); setPersonelForm(prev => ({ ...prev, brut_ucret: '' })) }}
                      className="bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-2 text-white text-sm focus:outline-none focus:border-yellow-400">
                      <option value="brut">Brut Ucret</option>
                      <option value="net">Net Ucret</option>
                    </select>
                    <label className="flex items-center gap-1 text-xs text-gray-300 cursor-pointer select-none">
                      <input type="checkbox" checked={personelAsgariUcret} onChange={(e) => handlePersonelAsgariChange(e.target.checked)} className="rounded border-blue-700/50 bg-blue-900/30 text-yellow-400" />
                      Asgari Ucret
                    </label>
                  </div>
                  <input type="text" inputMode="decimal" placeholder={personelUcretTipi === 'net' ? 'Net Ucret' : 'Brut Ucret'} value={personelForm.brut_ucret} onChange={(e) => handlePersonelUcretChange(e.target.value)}
                    onBlur={(e) => setPersonelForm(prev => ({ ...prev, brut_ucret: formatTurkishInput(e.target.value) }))}
                    disabled={personelAsgariUcret}
                    className={`bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400 ${personelAsgariUcret ? 'opacity-60 cursor-not-allowed' : ''}`} />
                  {personelUcretTipi === 'net' && personelForm.brut_ucret && !personelAsgariUcret && (
                    <p className="text-[10px] text-yellow-400">Hesaplanan brut: {formatMoney(parseTurkishNumber(personelForm.brut_ucret))} TL</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500">Ise Giris</label>
                  <input type="date" value={personelForm.ise_giris} onChange={(e) => setPersonelForm({...personelForm, ise_giris: e.target.value})}
                    className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Isten Cikis</label>
                  <input type="date" value={personelForm.isten_cikis} onChange={(e) => setPersonelForm({...personelForm, isten_cikis: e.target.value})}
                    className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Dogum Tarihi</label>
                  <input type="date" value={personelForm.dogum_tarihi} onChange={(e) => setPersonelForm({...personelForm, dogum_tarihi: e.target.value})}
                    className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">SGK Durumu</label>
                  <select value={personelForm.sgk_durumu} onChange={(e) => setPersonelForm({...personelForm, sgk_durumu: e.target.value})}
                    className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400">
                    <option value="calisan">Çalışan</option>
                    <option value="emekli">Emekli</option>
                  </select>
                </div>
              </div>
              {(personelForm.ise_giris_bildirge_url || personelForm.isten_cikis_bildirge_url) && (
                <div className="flex gap-3 mt-2 text-xs">
                  {personelForm.ise_giris_bildirge_url && (
                    <a href={personelForm.ise_giris_bildirge_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 flex items-center gap-1">
                      <FileText className="w-3 h-3" />İşe Giriş Bildirgesi
                    </a>
                  )}
                  {personelForm.isten_cikis_bildirge_url && (
                    <a href={personelForm.isten_cikis_bildirge_url} target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-orange-300 flex items-center gap-1">
                      <FileText className="w-3 h-3" />İşten Çıkış Bildirgesi
                    </a>
                  )}
                </div>
              )}
              <div className="flex gap-2 mt-3">
                <button onClick={handleSavePersonel} className="bg-yellow-500 text-blue-950 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1"><Save className="w-4 h-4" />Kaydet</button>
                <button onClick={() => { setShowPersonelForm(false); setEditPersonelId(null) }} className="bg-red-500/20 text-red-400 px-4 py-2 rounded-lg text-sm"><X className="w-4 h-4" /></button>
              </div>
            </div>
          )}

          {personelList.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-blue-900/30">
                  <tr className="text-left text-gray-400 text-sm">
                    <th className="px-4 py-2">#</th>
                    <th className="px-4 py-2">Ad Soyad</th>
                    <th className="px-4 py-2">TC Kimlik</th>
                    <th className="px-4 py-2">SGK Durumu</th>
                    <th className="px-4 py-2">Ise Giris</th>
                    <th className="px-4 py-2">Isten Cikis</th>
                    <th className="px-4 py-2 text-right">Brut Ucret</th>
                    <th className="px-4 py-2 text-center">Islem</th>
                  </tr>
                </thead>
                <tbody>
                  {personelList.map((p, i) => (
                    <tr key={p.id} className="border-t border-blue-700/20 hover:bg-blue-800/20">
                      <td className="px-4 py-2 text-gray-500 text-sm">{i+1}</td>
                      <td className="px-4 py-2 text-white text-sm font-medium">{p.ad_soyad}</td>
                      <td className="px-4 py-2 text-gray-300 text-sm font-mono">{p.tc_kimlik || '-'}</td>
                      <td className="px-4 py-2 text-sm">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.sgk_durumu === 'emekli' ? 'bg-orange-500/20 text-orange-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                          {p.sgk_durumu === 'emekli' ? 'Emekli' : 'Çalışan'}
                        </span>
                      </td>
                 <td className="px-4 py-2 text-gray-300 text-sm">{formatDateTR(p.ise_giris || p.ise_giris_tarihi)}</td>
                 <td className="px-4 py-2 text-gray-300 text-sm">{formatDateTR(p.isten_cikis || p.cikis_tarihi)}</td>
                      <td className="px-4 py-2 text-yellow-400 text-sm text-right font-medium">{p.brut_ucret ? Number(p.brut_ucret).toLocaleString('tr-TR', {minimumFractionDigits: 2}) + ' TL' : '-'}</td>
                      <td className="px-4 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                           <button onClick={() => { setEditPersonelId(p.id); setShowPersonelForm(true); setPersonelUcretTipi(p.ucret_tipi === 'net' ? 'net' : 'brut'); setPersonelAsgariUcret(false); setPersonelForm({ ad_soyad: p.ad_soyad, tc_kimlik: p.tc_kimlik || '', ise_giris: p.ise_giris || p.ise_giris_tarihi || '', isten_cikis: p.isten_cikis || p.cikis_tarihi || '', brut_ucret: p.brut_ucret || '', dogum_tarihi: p.dogum_tarihi || '', sgk_durumu: p.sgk_durumu || 'calisan', ise_giris_bildirge_url: p.ise_giris_bildirge_url || '', isten_cikis_bildirge_url: p.isten_cikis_bildirge_url || '' }) }}
                            className="text-blue-400 hover:text-blue-300 p-1"><Edit3 className="w-4 h-4" /></button>
                          <button onClick={() => handleDeletePersonel(p.id)}
                            className="text-red-400 hover:text-red-300 p-1"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 mb-2">Personel kaydi bulunamadi</p>
              <p className="text-gray-500 text-sm">Bordro Excel yukleyerek veya elle personel ekleyebilirsiniz</p>
            </div>
          )}
        </div>
      )}

      {/* ==================== MUHASEBE UCRETI TAB ==================== */}
      {activeTab === 'muhasebe' && (
        <div className="space-y-6">
          {/* Borc Ozeti */}
          {(() => {
            const ozet = hesaplaBorcOzeti(accountingFee, clientPayments)
            const fmt = (n) => Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })
            return (
              <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30">
                <h3 className="text-lg font-semibold text-white flex items-center space-x-2 mb-4">
                  <DollarSign className="w-5 h-5 text-yellow-400" />
                  <span>Borc Durumu</span>
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="bg-blue-900/30 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-400">Onceki Donem</p>
                    <p className="text-lg font-bold text-orange-400">{fmt(ozet.oncekiDonem)} TL</p>
                  </div>
                  <div className="bg-blue-900/30 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-400">Defter Tasdik</p>
                    <p className="text-lg font-bold text-blue-400">{fmt(ozet.defterTasdik)} TL</p>
                  </div>
                  <div className="bg-blue-900/30 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-400">Aylik ({ozet.gecenAy} ay x {fmt(ozet.aylikUcret)})</p>
                    <p className="text-lg font-bold text-yellow-400">{fmt(ozet.aylikToplam)} TL</p>
                  </div>
                  <div className="bg-blue-900/30 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-400">Toplam Borc</p>
                    <p className="text-lg font-bold text-white">{fmt(ozet.toplamBorc)} TL</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="bg-green-500/10 rounded-xl p-3 text-center border border-green-500/20">
                    <p className="text-xs text-gray-400">Toplam Odeme</p>
                    <p className="text-lg font-bold text-green-400">-{fmt(ozet.toplamOdeme)} TL</p>
                  </div>
                  {ozet.alindiOdeme > 0 && (
                    <div className="bg-blue-500/10 rounded-xl p-3 text-center border border-blue-500/20">
                      <p className="text-xs text-gray-400">Alinan (Borctan Dusulmeyi Bekleyen)</p>
                      <p className="text-lg font-bold text-blue-400">+{fmt(ozet.alindiOdeme)} TL</p>
                    </div>
                  )}
                  <div className={`rounded-xl p-3 text-center border ${ozet.kalanBorc > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-green-500/10 border-green-500/20'}`}>
                    <p className="text-xs text-gray-400">Kalan Borc</p>
                    <p className={`text-xl font-bold ${ozet.kalanBorc > 0 ? 'text-red-400' : 'text-green-400'}`}>{fmt(ozet.kalanBorc)} TL</p>
                  </div>
                </div>
                 {ozet.sonOdeme && <p className="text-xs text-gray-500 mt-2">Son odeme: {formatDateTR(ozet.sonOdeme)}</p>}
                 {/* Kesin teşhis: odemelerin db'deki ham durum/donem degerleri */}
                 {clientPayments.length > 0 && (
                   <p className="text-[10px] text-gray-500 mt-2 break-words">
                     Teşhis: {clientPayments.map(p => `${Number(p.tutar).toLocaleString('tr-TR')} TL · ${p.durum || '(durum yok)'} · dönem: ${p.donem || '(boş)'}`).join(' | ')} | Beklenen kalem dönemleri: Onceki Donem / Defter Tasdik / 2026-MM
                   </p>
                 )}
              </div>
            )
          })()}

          {/* Ucret Ayarlari */}
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-4">Ucret Ayarlari</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Onceki Donem Borc (TL)</label>
                <input type="text" inputMode="decimal" value={feeForm.onceki_donem_borc}
                  onChange={(e) => setFeeForm({...feeForm, onceki_donem_borc: e.target.value})}
                  onBlur={(e) => setFeeForm(f => ({...f, onceki_donem_borc: formatTurkishInput(e.target.value)}))}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 px-4 text-white focus:outline-none focus:border-yellow-400" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Defter Tasdik Ucreti (TL)</label>
                <input type="text" inputMode="decimal" value={feeForm.defter_tasdik_ucreti}
                  onChange={(e) => setFeeForm({...feeForm, defter_tasdik_ucreti: e.target.value})}
                  onBlur={(e) => setFeeForm(f => ({...f, defter_tasdik_ucreti: formatTurkishInput(e.target.value)}))}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 px-4 text-white focus:outline-none focus:border-yellow-400" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Aylik Muhasebe Ucreti (TL)</label>
                <input type="text" inputMode="decimal" value={feeForm.aylik_ucret}
                  onChange={(e) => setFeeForm({...feeForm, aylik_ucret: e.target.value})}
                  onBlur={(e) => setFeeForm(f => ({...f, aylik_ucret: formatTurkishInput(e.target.value)}))}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 px-4 text-white focus:outline-none focus:border-yellow-400" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Baslangic Ay</label>
                <select value={feeForm.baslangic_ay} onChange={(e) => setFeeForm({...feeForm, baslangic_ay: e.target.value})}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 px-4 text-white focus:outline-none focus:border-yellow-400">
                  {['Ocak','Subat','Mart','Nisan','Mayis','Haziran','Temmuz','Agustos','Eylul','Ekim','Kasim','Aralik'].map((m, i) => (
                    <option key={i} value={i+1}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Baslangic Yil</label>
                <select value={feeForm.baslangic_yil} onChange={(e) => setFeeForm({...feeForm, baslangic_yil: e.target.value})}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 px-4 text-white focus:outline-none focus:border-yellow-400">
                  {[2020,2021,2022,2023,2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Notlar</label>
                <input type="text" value={feeForm.notlar} onChange={(e) => setFeeForm({...feeForm, notlar: e.target.value})}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 px-4 text-white focus:outline-none focus:border-yellow-400" />
              </div>
            </div>
            <button onClick={handleSaveFee}
              className="mt-4 bg-yellow-500 text-blue-950 px-6 py-2.5 rounded-lg font-semibold hover:bg-yellow-400 transition-colors flex items-center space-x-2">
              <Save className="w-4 h-4" /><span>Kaydet</span>
            </button>
          </div>

          {/* Serbest Meslek Makbuzlari */}
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-1 flex items-center space-x-2">
              <Receipt className="w-5 h-5 text-yellow-400" />
              <span>Serbest Meslek Makbuzlari</span>
            </h3>
            <p className="text-xs text-gray-500 mb-4">Kestiginiz makbuzlari buradan yukleyin; musteri portalinda "Faturalarim" bolumunde goruntuler. Odeme girmek icin makbuz yuklemek zorunlu degildir.</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
              <div>
                <label className="text-xs text-gray-400">Makbuz Adi / Donem *</label>
                <input type="text" value={makbuzForm.name} onChange={(e) => setMakbuzForm({...makbuzForm, name: e.target.value})} placeholder="Orn: Agustos 2026 SMM"
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400" />
              </div>
              <div>
                <label className="text-xs text-gray-400">Tutar (TL)</label>
                <input type="text" inputMode="decimal" value={makbuzForm.tutar}
                  onChange={(e) => setMakbuzForm({...makbuzForm, tutar: e.target.value})}
                  onBlur={(e) => setMakbuzForm(m => ({...m, tutar: formatTurkishInput(e.target.value)}))}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400" />
              </div>
              <div>
                <label className="text-xs text-gray-400">Makbuz Tarihi</label>
                <input type="date" value={makbuzForm.donem} onChange={(e) => setMakbuzForm({...makbuzForm, donem: e.target.value})}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400" />
              </div>
              <div>
                <label className="text-xs text-gray-400">PDF Dosyasi *</label>
                <input ref={makbuzFileRef} type="file" accept="application/pdf" onChange={(e) => setMakbuzFile(e.target.files?.[0] || null)}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-1.5 px-3 text-white text-sm file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-yellow-500 file:text-blue-950 file:text-xs" />
              </div>
            </div>
            <button onClick={handleMakbuzUpload} disabled={docLoading}
              className="bg-yellow-500 text-blue-950 px-5 py-2 rounded-lg text-sm font-semibold hover:bg-yellow-400 transition-colors flex items-center space-x-2 disabled:opacity-50">
              <Upload className="w-4 h-4" /><span>{docLoading ? 'Yukleniyor...' : 'Makbuz Yukle'}</span>
            </button>

            {(clientDocuments?.makbuzlar || []).length > 0 && (
              <div className="mt-4 space-y-2">
                {(clientDocuments.makbuzlar).map(m => (
                  <div key={m.id} className="flex items-center justify-between bg-blue-900/20 rounded-lg px-4 py-2.5">
                    <div className="flex items-center space-x-3">
                      <Receipt className="w-4 h-4 text-green-400 flex-shrink-0" />
                      <div>
                        <p className="text-white text-sm font-medium">{m.name}</p>
                        <p className="text-gray-500 text-xs">
                          {m.donem ? `${formatDateTR(m.donem)} • ` : ''}{m.tutar != null ? `${Number(m.tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL • ` : ''}{m.uploaded_at ? `Yukleme: ${formatDateTR(m.uploaded_at)}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <a href={m.url} target="_blank" rel="noreferrer" title="Goruntule" className="p-1.5 bg-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/30"><Eye className="w-4 h-4" /></a>
                      <a href={m.url} download title="Indir" className="p-1.5 bg-green-500/20 rounded-lg text-green-400 hover:bg-green-500/30"><Download className="w-4 h-4" /></a>
                      <button onClick={() => handleMakbuzDelete(m.id)} title="Sil" className="p-1.5 bg-red-500/20 rounded-lg text-red-400 hover:bg-red-500/30"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Odeme Gecmisi */}
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Odeme Gecmisi</h3>
              <button onClick={() => setShowPaymentForm(!showPaymentForm)}
                className="bg-green-600/20 text-green-400 px-4 py-2 rounded-lg text-sm font-medium flex items-center space-x-1 hover:bg-green-600/30 transition-colors">
                <Plus className="w-4 h-4" /><span>Odeme Ekle</span>
              </button>
            </div>

            {showPaymentForm && (
              <div className="mb-4 p-4 bg-blue-900/20 rounded-xl border border-green-500/30">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                  <div>
                    <label className="text-xs text-gray-400">Tutar (TL) *</label>
                    <input type="text" inputMode="decimal" value={paymentForm.tutar}
                      onChange={(e) => setPaymentForm({...paymentForm, tutar: e.target.value})}
                      onBlur={(e) => setPaymentForm(p => ({...p, tutar: formatTurkishInput(e.target.value)}))}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Odeme Tipi</label>
                    <select value={paymentForm.odeme_tipi} onChange={(e) => setPaymentForm({...paymentForm, odeme_tipi: e.target.value})}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400">
                      <option value="eft">EFT/Havale</option>
                      <option value="kredi_karti">Kredi Karti</option>
                      <option value="nakit">Nakit</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-gray-400">Borç Kalemleri (birden fazla seçebilirsiniz — tutar otomatik dağıtılır)</label>
                    <div className="mt-1 max-h-36 overflow-y-auto border border-blue-700/40 rounded-lg p-2 bg-blue-900/20 space-y-1">
                      {getBorcKalemleri().map(o => (
                        <label key={o.value} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-blue-800/40 cursor-pointer text-sm text-white">
                          <input
                            type="checkbox"
                            className="w-4 h-4 accent-green-500"
                            checked={seciliBorcKalemler.includes(o.value)}
                            onChange={(e) => setSeciliBorcKalemler(e.target.checked ? [...seciliBorcKalemler, o.value] : seciliBorcKalemler.filter(v => v !== o.value))}
                          />
                          {o.label}
                        </label>
                      ))}
                    </div>
                    {seciliBorcKalemler.length > 0 && (
                      <p className="text-xs text-green-400 mt-1">{seciliBorcKalemler.length} kalem seçildi</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Tarih</label>
                    <input type="date" value={paymentForm.odeme_tarihi} onChange={(e) => setPaymentForm({...paymentForm, odeme_tarihi: e.target.value})}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-gray-400">Aciklama</label>
                    <input type="text" value={paymentForm.aciklama} onChange={(e) => setPaymentForm({...paymentForm, aciklama: e.target.value})}
                      placeholder="Orn: Temmuz 2026 muhasebe ucreti"
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400" />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={handleSavePayment} className="bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1"><Save className="w-4 h-4" />Kaydet</button>
                  <button onClick={() => setShowPaymentForm(false)} className="bg-red-500/20 text-red-400 px-4 py-2 rounded-lg text-sm"><X className="w-4 h-4" /></button>
                </div>
              </div>
            )}

            {clientPayments.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-blue-900/30">
                    <tr className="text-left text-gray-400 text-xs">
                      <th className="px-4 py-2">Tarih</th>
                      <th className="px-4 py-2 text-right">Tutar</th>
                      <th className="px-4 py-2">Tip</th>
                      <th className="px-4 py-2">Donem</th>
                      <th className="px-4 py-2">Aciklama</th>
                      <th className="px-4 py-2 text-center">Durum</th>
                      <th className="px-4 py-2 text-center">Islem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientPayments.map(p => (
                      <tr key={p.id} className="border-t border-blue-700/20 hover:bg-blue-800/20">
                         <td className="px-4 py-2 text-white text-sm">{formatDateTR(p.odeme_tarihi)}</td>
                        <td className={`px-4 py-2 text-right text-sm font-medium ${p.durum === 'reddedildi' ? 'text-red-400 line-through' : p.durum === 'alindi' ? 'text-blue-400' : p.durum === 'bekliyor' ? 'text-yellow-400' : 'text-green-400'}`}>{Number(p.tutar).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</td>
                        <td className="px-4 py-2 text-gray-300 text-xs">
                          <span className={`px-2 py-1 rounded ${p.odeme_tipi === 'eft' ? 'bg-blue-500/20 text-blue-400' : p.odeme_tipi === 'kredi_karti' ? 'bg-purple-500/20 text-purple-400' : 'bg-gray-500/20 text-gray-400'}`}>
                            {p.odeme_tipi === 'eft' ? 'EFT/Havale' : p.odeme_tipi === 'kredi_karti' ? 'Kredi Karti' : 'Nakit'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-400 text-sm">{p.donem || '-'}</td>
                        <td className="px-4 py-2 text-gray-400 text-sm">{p.aciklama || '-'}{p.red_sebebi ? ` (Red: ${p.red_sebebi})` : ''}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            p.durum === 'uygulandi' ? 'bg-green-500/20 text-green-400' :
                            p.durum === 'onaylandi' ? 'bg-green-500/20 text-green-400' :
                            p.durum === 'alindi' ? 'bg-blue-500/20 text-blue-400' :
                            p.durum === 'reddedildi' ? 'bg-red-500/20 text-red-400' :
                            'bg-yellow-500/20 text-yellow-400 animate-pulse'
                          }`}>
                            {p.durum === 'uygulandi' ? 'Borctan Dusuldu' : p.durum === 'onaylandi' ? 'Onaylandi' : p.durum === 'alindi' ? 'Odeme Alindi' : p.durum === 'reddedildi' ? 'Reddedildi' : 'Onay Bekliyor'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {/* Tek tik odendi olarak isaretle + Reddet */}
                            {!['uygulandi', 'onaylandi', 'reddedildi'].includes(p.durum) && (
                              <div className="flex items-center gap-1">
                                <button onClick={() => handleMarkPaid(p)} title="Ödendi olarak işaretle - Borçtan Düş" className="text-green-400 hover:text-green-300 p-1"><CheckCircle className="w-4 h-4" /></button>
                                <button onClick={() => handleRejectPayment(p)} title="Reddet" className="text-red-400 hover:text-red-300 p-1"><X className="w-4 h-4" /></button>
                              </div>
                            )}
                            <button onClick={() => handleOpenReceipt(p)} title="Makbuz Goster" className="text-blue-400 hover:text-blue-300 p-1"><Receipt className="w-4 h-4" /></button>
                            <button onClick={() => openDuzeltme(p)} title="Borç Kalemini Düzelt" className="text-yellow-400 hover:text-yellow-300 p-1"><Edit3 className="w-4 h-4" /></button>
                            {p.makbuz_url && (
                              <button onClick={() => setMakbuzOnizleme(p.makbuz_url)} title="Makbuzu Goruntule" className="text-green-400 hover:text-green-300 p-1"><Eye className="w-4 h-4" /></button>
                            )}
                            <button onClick={() => { setOdemeMakbuzHedef(p); if (odemeMakbuzInputRef.current) odemeMakbuzInputRef.current.click() }} title={p.makbuz_url ? 'Makbuzu Degistir' : 'Makbuz Ekle'} className="text-purple-400 hover:text-purple-300 p-1"><Upload className="w-4 h-4" /></button>
                            <button onClick={() => handleDeletePayment(p.id)} title="Sil" className="text-red-400 hover:text-red-300 p-1"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500 text-sm text-center py-6">Henuz odeme kaydi yok</p>
            )}
          </div>
        </div>
      )}

      {/* Gizli makbuz dosya girisi (odeme satirindan makbuz ekleme) */}
      <input ref={odemeMakbuzInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleOdemeMakbuzSec} />

      {/* Odemeye Ekli Makbuz Onizleme */}
      {makbuzOnizleme && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-6">
          <div className="w-full max-w-4xl h-[92vh] bg-white rounded-xl overflow-hidden flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-4 py-2.5 bg-green-700 text-white flex-shrink-0">
              <span className="font-bold text-sm tracking-wide">MAKBUZ ONIZLEME</span>
              <div className="flex gap-2">
                <a href={makbuzOnizleme} target="_blank" rel="noreferrer" className="px-3.5 py-1.5 bg-yellow-400 text-green-900 rounded-md font-bold text-[13px] hover:bg-yellow-300">Sekmede Ac</a>
                <button onClick={() => setMakbuzOnizleme(null)} className="px-3.5 py-1.5 bg-white/15 rounded-md text-[13px] hover:bg-white/25">Kapat</button>
              </div>
            </div>
            <iframe src={makbuzOnizleme} title="Makbuz" className="flex-1 w-full border-0" />
          </div>
        </div>
      )}

      {/* Online Odemeyi Borctan Dusme Penceresi (yesil ✓) */}
      {odemeOnayModal?.payment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-blue-700/40 bg-blue-950 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2"><CheckCircle className="w-5 h-5 text-green-400" /> Odemeyi Borctan Dus</h3>
            <p className="text-sm text-gray-400 mb-4">
              {Number(odemeOnayModal.payment.tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL tutarindaki odemeyi hangi borc kalemlerinden duselim? Birden fazla secabilirsiniz — tutar otomatik dagitilir.
            </p>
            <div className="max-h-52 overflow-y-auto border border-blue-700/40 rounded-lg p-2 bg-blue-900/20 space-y-1">
              {getBorcKalemleri().map(o => (
                <label key={o.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-blue-800/40 cursor-pointer text-sm text-white">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-green-500"
                    checked={odemeOnaySecimler.includes(o.value)}
                    onChange={(e) => setOdemeOnaySecimler(e.target.checked ? [...odemeOnaySecimler, o.value] : odemeOnaySecimler.filter(v => v !== o.value))}
                  />
                  {o.label}
                </label>
              ))}
            </div>
            {odemeOnaySecimler.length > 0 && (
              <p className="text-xs text-green-400 mt-2">{odemeOnaySecimler.length} kalem seçildi</p>
            )}
            <div className="mt-6 flex gap-3 justify-end">
              <button onClick={() => setOdemeOnayModal(null)} className="px-4 py-2 rounded-lg bg-blue-900/40 text-gray-300 hover:bg-blue-800/50 text-sm">Vazgeç</button>
              <button onClick={handleOdemeOnayUygula} className="px-4 py-2 rounded-lg bg-green-500 text-white font-semibold hover:bg-green-400 text-sm flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Dus</button>
            </div>
          </div>
        </div>
      )}

      {/* Borç Kalemi Düzeltme Modal */}
      {duzeltmeDuzenlenen?.payment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-blue-700/40 bg-blue-950 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2"><Edit3 className="w-5 h-5 text-yellow-400" /> Borç Kalemini Düzelt</h3>
            <p className="text-sm text-gray-400 mb-4">
              {Number(duzeltmeDuzenlenen.payment.tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL ödemenin borç kalemini seçin. Kaydedince borç yeniden hesaplanır.
            </p>
            <select
              value={duzeltmeSecim}
              onChange={(e) => setDuzeltmeSecim(e.target.value)}
              className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
            >
              <option value="">Borç kalemi seçin</option>
              {getBorcKalemleri().map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <div className="mt-6 flex gap-3 justify-end">
              <button onClick={() => setDuzeltmeDuzenlenen(null)} className="px-4 py-2 rounded-lg bg-blue-900/40 text-gray-300 hover:bg-blue-800/50 text-sm">Vazgeç</button>
              <button onClick={handleDuzeltmeUygula} className="px-4 py-2 rounded-lg bg-yellow-500 text-white font-semibold hover:bg-yellow-400 text-sm flex items-center gap-1"><Edit3 className="w-4 h-4" /> Düzelt</button>
            </div>
          </div>
        </div>
      )}

      {/* Kira Guncelleme Modal */}
      {kiraUpdateModalOpen && (        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-blue-700/40 bg-blue-950 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2"><Edit3 className="w-5 h-5 text-yellow-400" /> Kirayi Guncelle</h3>
            <p className="text-sm text-gray-400 mb-4">Yeni kira tutari girin; mevcut donem arsivlenir ve yeni donem 1 yil uzatilarak olusturulur.</p>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Kira Tutar Tipi</label>
                <select
                  value={kiraUpdateData.kiraTutarTipi}
                  onChange={(e) => handleKiraUpdateTutarChange(e.target.value, kiraUpdateData.kiraTutarTipi === 'brut' ? kiraUpdateData.brutKira : kiraUpdateData.netKira)}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                >
                  <option value="net">Net Kira</option>
                  <option value="brut">Brut Kira</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">Yeni {kiraUpdateData.kiraTutarTipi === 'brut' ? 'Brut' : 'Net'} Kira (TL)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={kiraUpdateData.kiraTutarTipi === 'brut' ? kiraUpdateData.brutKira : kiraUpdateData.netKira}
                  onChange={(e) => handleKiraUpdateTutarChange(kiraUpdateData.kiraTutarTipi, e.target.value)}
                  onBlur={finalizeKiraUpdateTutar}
                  placeholder="Orn: 25.000,00"
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-900/20 rounded-lg p-3 border border-blue-700/30">
                  <span className="text-xs text-gray-400 block">Hesaplanan {kiraUpdateData.kiraTutarTipi === 'brut' ? 'Net' : 'Brut'}</span>
                  <span className="text-white text-sm font-medium">{kiraUpdateData.kiraTutarTipi === 'brut' ? kiraUpdateData.netKira : kiraUpdateData.brutKira} TL</span>
                </div>
                <div className="bg-blue-900/20 rounded-lg p-3 border border-blue-700/30">
                  <span className="text-xs text-gray-400 block">Yeni Bitis Tarihi</span>
                  <span className="text-white text-sm font-medium">
                    {(() => {
                      const kb = getKiraBilgisi(client)
                      const sahip = kb.isyeriSahipleri?.[kiraUpdateIndex]
                      const eskiBitisIso = sahip?.kiraBitis ? normalizeDateForInput(sahip.kiraBitis) : ''
                      const yeniBaslangic = eskiBitisIso ? addOneDay(eskiBitisIso) : new Date().toISOString().split('T')[0]
                      return formatDisplayDate(addOneYear(yeniBaslangic))
                    })()}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3 justify-end">
              <button onClick={closeKiraUpdateModal} className="px-4 py-2 rounded-lg bg-blue-900/40 text-gray-300 hover:bg-blue-800/50 text-sm">Vazgec</button>
              <button onClick={applyKiraUpdate} className="px-4 py-2 rounded-lg bg-yellow-500 text-blue-950 font-semibold hover:bg-yellow-400 text-sm flex items-center gap-1"><Save className="w-4 h-4" /> Guncelle</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Yeniden kullanilabilir bilgi satiri
function InfoRow({ label, value, editKey, isEditing, editData, setEditData }) {
  return (
    <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
      <span className="text-gray-400 text-sm">{label}</span>
      {isEditing && editKey ? (
        <input type="text" value={editData[editKey] || ''} onChange={(e) => setEditData({...editData, [editKey]: e.target.value})} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400" />
      ) : (
        <span className="text-white text-sm font-medium text-right max-w-[200px] truncate">{value || '-'}</span>
      )}
    </div>
  )
}
