import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import { searchNace, formatNaceCode, getNaceDesc } from '../utils/naceCodes'
import * as XLSX from 'xlsx'
import { 
  ArrowLeft, Building2, User, Phone, Mail, MapPin, 
  FileText, Calendar, Edit3, Plus, Trash2, Save, X,
  Globe, CreditCard, Hash, ListChecks, Shield,
  Briefcase, Tag, Upload, Search, Home, ExternalLink,
  Eye, EyeOff, Lock, Landmark, KeyRound, Receipt, Users, AlertTriangle, DollarSign, CreditCard as CreditCardIcon,
  Send, MessageCircle, Download, Camera
} from 'lucide-react'
import { getAccountPlans, saveAccountPlans, getEmployees, addEmployee, updateEmployee, deleteEmployee, saveEmployeesFromExcel, getPartners, addPartner, updatePartner, deletePartner } from '../services/clientService'
import { getAccountingFee, saveAccountingFee, getPayments, addPayment, deletePayment, hesaplaBorcOzeti, BANKA_BILGILERI } from '../services/paymentService'
import { uploadGelirBeyanDocument, uploadGeciciVergiDocument, uploadVergiLevhasi, uploadMaliEvrak } from '../services/documentService'
import { supabase } from '../lib/supabase'
import ZReportManager from '../components/ZReportManager'
import ExpenseUploader from '../components/ExpenseUploader'
import KiraTalepOnay from '../components/KiraTalepOnay'
import PortalErisimKarti from '../components/PortalErisimKarti'
import PortalOtomasyonKarti from '../components/PortalOtomasyonKarti'

export default function ClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { updateClient } = useAuth()
  const { clients, refresh: refreshClients } = useClients()
  const [client, setClient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [activeTab, setActiveTab] = useState('info')
  const [uploadDocType, setUploadDocType] = useState(null)
  const [editData, setEditData] = useState({})
  const [hesapKodlari, setHesapKodlari] = useState([])
  const [hesapSearch, setHesapSearch] = useState('')
  const [naceResults, setNaceResults] = useState([])
  const [showNaceDropdown, setShowNaceDropdown] = useState(false)
  const hesapFileRef = useRef(null)
  const bordroFileRef = useRef(null)
  // Personel
  const [personelList, setPersonelList] = useState([])
  const [showPersonelForm, setShowPersonelForm] = useState(false)
  const [editPersonelId, setEditPersonelId] = useState(null)
  const [personelForm, setPersonelForm] = useState({ ad_soyad: '', tc_kimlik: '', ise_giris: '', isten_cikis: '', brut_ucret: '', dogum_tarihi: '' })
  // Muhasebe ucreti
  const [accountingFee, setAccountingFee] = useState(null)
  const [feeForm, setFeeForm] = useState({ onceki_donem_borc: '', defter_tasdik_ucreti: '', aylik_ucret: '', baslangic_ay: '1', baslangic_yil: '2025', notlar: '' })
  const [clientPayments, setClientPayments] = useState([])
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [paymentForm, setPaymentForm] = useState({ tutar: '', odeme_tipi: 'eft', donem: '', aciklama: '', odeme_tarihi: new Date().toISOString().split('T')[0] })

  // Yeni yetkili/ortak formu (partners tablosu)
  const [partners, setPartners] = useState([])
  const [newPartner, setNewPartner] = useState({ name: '', title: '', phone: '', email: '', tc: '', vkn: '', vergi_dairesi: '', hisse_orani: '', address: '' })
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
  // MUBiS Proxy durumu
  const [proxyReady, setProxyReady] = useState(false)
  const [proxyLoading, setProxyLoading] = useState(false)

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
      setEditData(found)
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
    } catch (e) { console.error('Ortak yukleme hatasi:', e) }
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
        setClient(data)
        setEditData(data)
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

  const handleSave = async () => {
    // clients tablosuna gidecek izin verilen alanlar
    const allowedFields = [
      'name','shortName','company','vkn','tc','taxNo','email','phone','whatsapp','taxOffice','address','city',
      'type','companyType','taxType','capital','openDate','closeDate','musteriSinifi',
      'naceCode','naceDesc','efatura','earsiv','esmm','edefter','edefterPeriod','serbestMeslek',
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
    const dateFields = ['isAcilisTarihi','openDate','eimzaStart','eimzaEnd','kiraBaslangic','kiraBitis']
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
      cleanData.kiraBilgisi = kb
    }
    // Eger isAcilisTarihi varsa openDate'e de yaz (geriye uyumluluk)
    if (cleanData.isAcilisTarihi && !cleanData.openDate) {
      cleanData.openDate = cleanData.isAcilisTarihi
    }
    const result = await saveClient(cleanData)
    if (result.success) setIsEditing(false)
  }

  // Kira bilgisi helper'lari (kira_bilgisi text/JSONB alani)
  const getKiraBilgisi = (source) => {
    const raw = source?.kiraBilgisi || source?.kira_bilgisi || {}
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) } catch { return {} }
    }
    return raw || {}
  }

  const setKiraField = (field, value) => {
    const kb = { ...getKiraBilgisi(editData), [field]: value }
    setEditData({ ...editData, kiraBilgisi: kb })
  }

  const addEvSahibi = () => {
    const kb = getKiraBilgisi(editData)
    const list = [...(kb.evSahipleri || []), { tc: '', adSoyad: '', adres: '', hisseOrani: '' }]
    setKiraField('evSahipleri', list)
  }

  const updateEvSahibi = (index, field, value) => {
    const kb = getKiraBilgisi(editData)
    const list = [...(kb.evSahipleri || [])]
    list[index] = { ...list[index], [field]: value }
    setKiraField('evSahipleri', list)
  }

  const removeEvSahibi = (index) => {
    const kb = getKiraBilgisi(editData)
    const list = [...(kb.evSahipleri || [])]
    list.splice(index, 1)
    setKiraField('evSahipleri', list)
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

  // Ortak ekle veya guncelle (partners tablosu)
  const handleSavePartner = async () => {
    if (!newPartner.name) return
    try {
      if (editPartnerId) {
        await updatePartner(editPartnerId, newPartner)
      } else {
        await addPartner(parseInt(id), newPartner)
      }
      await loadPartners()
      setNewPartner({ name: '', title: '', phone: '', email: '', tc: '', vkn: '', vergi_dairesi: '', hisse_orani: '', address: '' })
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
      address: partner.address || '',
    })
    setEditPartnerId(partner.id)
    setShowPartnerForm(true)
  }

  const removePartner = async (partnerId) => {
    if (!confirm('Bu ortagi silmek istiyor musunuz?')) return
    try {
      await deletePartner(partnerId)
      await loadPartners()
    } catch (err) {
      alert('Ortak silinemedi: ' + (err.message || 'Bilinmeyen hata'))
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
          if (row[0]) codes.push({ code: String(row[0]).trim(), name: String(row[1] || '').trim() })
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
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (ev) => {
          try {
            const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' })
            const sheet = wb.Sheets[wb.SheetNames[0]]
            resolve(XLSX.utils.sheet_to_json(sheet))
          } catch (err) { reject(err) }
        }
        reader.readAsArrayBuffer(file)
      })
      const parsed = data.map(row => {
        const adSoyad = row['Ad Soyad'] || row['Ad'] || row['Personel'] || row['ADI SOYADI'] || row['AD SOYAD'] || ''
        const tc = String(row['TC Kimlik'] || row['TC'] || row['TC No'] || row['TCKN'] || '').trim()
        const iseGiris = parseExcelDate(row['Ise Giris'] || row['İşe Giriş'] || row['ISE GIRIS'] || row['İŞE GİRİŞ TARİHİ'] || '')
        const brut = parseFloat(String(row['Brut Ucret'] || row['Brüt Ücret'] || row['BRÜT ÜCRET'] || row['Brüt'] || 0).replace(',', '.')) || 0
        return { ad_soyad: String(adSoyad).trim(), tc_kimlik: tc, ise_giris: iseGiris, brut_ucret: brut }
      }).filter(e => e.ad_soyad)
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
  const handleSavePersonel = async () => {
    if (!personelForm.ad_soyad.trim()) return alert('Ad Soyad zorunlu!')
    try {
      if (editPersonelId) {
        await updateEmployee(editPersonelId, personelForm)
      } else {
        await addEmployee(parseInt(id), personelForm)
      }
      setPersonelForm({ ad_soyad: '', tc_kimlik: '', ise_giris: '', isten_cikis: '', brut_ucret: '' })
      setShowPersonelForm(false)
      setEditPersonelId(null)
      await loadPersonel()
    } catch (err) { alert('Hata: ' + err.message) }
  }

  const handleDeletePersonel = async (empId) => {
    if (!confirm('Bu personeli silmek istiyor musunuz?')) return
    try { await deleteEmployee(empId); await loadPersonel() } catch (err) { alert('Hata: ' + err.message) }
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

  // Odeme kaydet
  const handleSavePayment = async () => {
    if (!paymentForm.tutar || Number(paymentForm.tutar) <= 0) return alert('Tutar giriniz!')
    try {
      await addPayment({ client_id: parseInt(id), ...paymentForm })
      setPaymentForm({ tutar: '', odeme_tipi: 'eft', donem: '', aciklama: '', odeme_tarihi: new Date().toISOString().split('T')[0] })
      setShowPaymentForm(false)
      await loadAccounting()
    } catch (err) { alert('Hata: ' + err.message) }
  }

  const handleDeletePayment = async (payId) => {
    if (!confirm('Bu odeme kaydini silmek istiyor musunuz?')) return
    try { await deletePayment(payId); await loadAccounting() } catch (err) { alert('Hata: ' + err.message) }
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
    ...(isCompany ? [{ id: 'officials', label: 'Ortaklar / Yetkililer', icon: User }] : []),
    { id: 'banks', label: 'Bankalar', icon: CreditCard },
    { id: 'kurumlar', label: 'Kurum Erisimi', icon: Landmark },
    { id: 'services', label: 'E-Hizmetler', icon: Shield },
    { id: 'documents', label: 'Evraklar', icon: FileText },
    ...((client.musteriSinifi === '1. Sinif' || isCompany) ? [{ id: 'hesapkodlari', label: 'Hesap Kodlari', icon: Hash }] : []),
    { id: 'personel', label: 'Personel', icon: Users },
    { id: 'zrapor', label: 'Belge Yükle', icon: Camera },
    { id: 'muhasebe', label: 'Muhasebe Ucreti', icon: DollarSign },
  ]

  const filteredHesapKodlari = hesapKodlari.filter(hk => {
    if (!hesapSearch) return true
    return hk.kod.includes(hesapSearch) || hk.ad.toLowerCase().includes(hesapSearch.toLowerCase())
  })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate('/admin/musteriler')} className="text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center space-x-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-xl ${isCompany ? 'bg-gradient-to-br from-blue-500 to-blue-700' : 'bg-gradient-to-br from-purple-500 to-purple-700'}`}>
              {client.name?.charAt(0) || '?'}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{client.name}</h1>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-gray-400 text-sm">{isCompany ? `VKN: ${client.vkn || '-'}` : `TC: ${client.tc || '-'}`}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${client.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                  {client.status === 'active' ? 'Aktif' : 'Pasif'}
                </span>
                {client.musteriSinifi && <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-yellow-500/20 text-yellow-400">{client.musteriSinifi}</span>}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => navigate(`/admin/client/${id}/beyan-profile`)} className="bg-teal-500/20 text-teal-400 px-3 py-2 rounded-lg text-sm font-medium hover:bg-teal-500/30 flex items-center gap-1">
            <ListChecks className="w-4 h-4" /><span>Beyan Profili</span>
          </button>
          <button onClick={() => navigate(`/admin/client/${id}/beyan-takip`)} className="bg-blue-500/20 text-blue-400 px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-500/30 flex items-center gap-1">
            <FileText className="w-4 h-4" /><span>Beyan Takip</span>
          </button>
          {isEditing ? (
            <>
              <button onClick={handleSave} className="bg-green-500/20 text-green-400 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1"><Save className="w-4 h-4" /><span>Kaydet</span></button>
              <button onClick={() => { setIsEditing(false); setEditData(client) }} className="bg-red-500/20 text-red-400 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1"><X className="w-4 h-4" /><span>Iptal</span></button>
            </>
          ) : (
            <button onClick={() => setIsEditing(true)} className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1">
              <Edit3 className="w-4 h-4" /><span>Duzenle</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-blue-950/40 rounded-xl p-1 mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            <tab.icon className="w-4 h-4" /><span>{tab.label}</span>
          </button>
        ))}
      </div>

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
                  <InfoRow label="Sermaye" value={client.capital} editKey="capital" isEditing={isEditing} editData={editData} setEditData={setEditData} />
                  <InfoRow label="Vergi Dairesi" value={client.taxOffice} editKey="taxOffice" isEditing={isEditing} editData={editData} setEditData={setEditData} />
                  {/* Musteri Turu - Dropdown (sirket/adi ortaklik/apartman yonetimi) */}
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
                  <InfoRow label="Kisa Ad" value={client.shortName} editKey="shortName" isEditing={isEditing} editData={editData} setEditData={setEditData} />
                  <InfoRow label="TC Kimlik No" value={client.tc} editKey="tc" isEditing={isEditing} editData={editData} setEditData={setEditData} />
                  <InfoRow label="Vergi No" value={client.taxNo} editKey="taxNo" isEditing={isEditing} editData={editData} setEditData={setEditData} />
                  <InfoRow label="Vergi Dairesi" value={client.taxOffice} editKey="taxOffice" isEditing={isEditing} editData={editData} setEditData={setEditData} />
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
                  <span className="text-white text-sm font-medium font-mono">{client.faaliyetKodu ? formatNaceCode(client.faaliyetKodu) : '-'}</span>
                )}
              </div>
              {/* Faaliyet Konusu - kod secimine gore otomatik gelir */}
              <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                <span className="text-gray-400 text-sm">Faaliyet Konusu</span>
                <span className="text-white text-sm font-medium text-right max-w-[60%]">
                  {isEditing 
                    ? (editData.activityField || getNaceDesc(editData.faaliyetKodu) || '-')
                    : (client.activityField || getNaceDesc(client.faaliyetKodu) || '-')
                  }
                </span>
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
              {getKiraBilgisi(isEditing ? editData : client).kiraTipi === 'kiraci' && (
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
              {/* Kira Baslangic / Bitis Tarihleri (sadece kiraci) */}
              {getKiraBilgisi(isEditing ? editData : client).kiraTipi === 'kiraci' && (
                <>
                  <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                    <span className="text-gray-400 text-sm">Kira Baslangic Tarihi</span>
                    {isEditing ? (
                      <input
                        type="date"
                        value={normalizeDateForInput(getKiraBilgisi(editData).kiraBaslangic)}
                        onChange={(e) => setKiraField('kiraBaslangic', e.target.value)}
                        className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400"
                      />
                    ) : (
                      <span className="text-white text-sm font-medium">{formatDisplayDate(getKiraBilgisi(client).kiraBaslangic)}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                    <span className="text-gray-400 text-sm">Kira Bitis Tarihi</span>
                    {isEditing ? (
                      <input
                        type="date"
                        value={normalizeDateForInput(getKiraBilgisi(editData).kiraBitis)}
                        onChange={(e) => setKiraField('kiraBitis', e.target.value)}
                        className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400"
                      />
                    ) : (
                      <span className="text-white text-sm font-medium">{formatDisplayDate(getKiraBilgisi(client).kiraBitis)}</span>
                    )}
                  </div>
                  {getKiraBilgisi(client).kiraBitis && !isEditing && (() => {
                    const diff = Math.ceil((new Date(getKiraBilgisi(client).kiraBitis) - new Date()) / (1000 * 60 * 60 * 24))
                    if (diff <= 60 && diff > 0) return <div className="p-3 bg-yellow-500/10 rounded-xl border border-yellow-500/30"><span className="text-yellow-400 text-sm font-medium">Kontrat bitisine {diff} gun kaldi!</span></div>
                    if (diff <= 0) return <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/30"><span className="text-red-400 text-sm font-medium">Kontrat suresi dolmus!</span></div>
                    return null
                  })()}
                </>
              )}
              {/* Stopaj (sadece kiraci) */}
              {getKiraBilgisi(isEditing ? editData : client).kiraTipi === 'kiraci' && (
                <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl">
                  <span className="text-gray-400 text-sm">Stopaj</span>
                  {isEditing ? (
                    <select
                      value={getKiraBilgisi(editData).stopaj || ''}
                      onChange={(e) => setKiraField('stopaj', e.target.value)}
                      className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1 text-white text-sm w-48 focus:outline-none focus:border-yellow-400"
                    >
                      <option value="">Seciniz</option>
                      <option value="var">Var</option>
                      <option value="yok">Yok</option>
                    </select>
                  ) : (
                    <span className="text-white text-sm font-medium">{getKiraBilgisi(client).stopaj === 'var' ? 'Var' : getKiraBilgisi(client).stopaj === 'yok' ? 'Yok' : '-'}</span>
                  )}
                </div>
              )}
              {/* Ev Sahipleri (sadece kiraci) */}
              {getKiraBilgisi(isEditing ? editData : client).kiraTipi === 'kiraci' && (
                <div className="p-3 bg-blue-900/20 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400 text-sm">Ev Sahipleri</span>
                    {isEditing && (
                      <button onClick={addEvSahibi} className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded flex items-center gap-1"><Plus className="w-3 h-3" /> Ev Sahibi Ekle</button>
                    )}
                  </div>
                  {(getKiraBilgisi(isEditing ? editData : client).evSahipleri || []).length === 0 ? (
                    <p className="text-gray-500 text-xs">Ev sahibi kaydi yok</p>
                  ) : (
                    <div className="space-y-2">
                      {(getKiraBilgisi(isEditing ? editData : client).evSahipleri || []).map((es, i) => (
                        <div key={i} className="bg-blue-950/40 rounded-lg p-3 border border-blue-700/30">
                          {isEditing ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <input type="text" value={es.tc || ''} onChange={(e) => updateEvSahibi(i, 'tc', e.target.value)} placeholder="TC Kimlik No" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-yellow-400" />
                              <input type="text" value={es.adSoyad || ''} onChange={(e) => updateEvSahibi(i, 'adSoyad', e.target.value)} placeholder="Ad Soyad" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-yellow-400" />
                              <input type="text" value={es.hisseOrani || ''} onChange={(e) => updateEvSahibi(i, 'hisseOrani', e.target.value)} placeholder="Hisse Orani (%)" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-yellow-400" />
                              <input type="text" value={es.adres || ''} onChange={(e) => updateEvSahibi(i, 'adres', e.target.value)} placeholder="Adres" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-yellow-400" />
                              <div className="sm:col-span-2 text-right">
                                <button onClick={() => removeEvSahibi(i)} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 ml-auto"><Trash2 className="w-3 h-3" /> Kaldir</button>
                              </div>
                            </div>
                          ) : (
                            <div className="text-sm">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-white font-medium">{es.adSoyad || '-'}</span>
                                {es.hisseOrani && <span className="text-blue-400 text-xs">%{es.hisseOrani}</span>}
                              </div>
                              <div className="text-gray-400 text-xs mt-1 grid grid-cols-1 sm:grid-cols-2 gap-1">
                                {es.tc && <span>TC: {es.tc}</span>}
                                {es.adres && <span className="sm:col-span-2">Adres: {es.adres}</span>}
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
            <button onClick={() => { setShowPartnerForm(!showPartnerForm); setEditPartnerId(null); setNewPartner({ name: '', title: '', phone: '', email: '', tc: '', vkn: '', vergi_dairesi: '', hisse_orani: '', address: '' }) }} className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1">
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
                <input type="text" value={newPartner.vkn} onChange={(e) => setNewPartner({...newPartner, vkn: e.target.value})} placeholder="Vergi No" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <input type="text" value={newPartner.vergi_dairesi} onChange={(e) => setNewPartner({...newPartner, vergi_dairesi: e.target.value})} placeholder="Vergi Dairesi" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <input type="text" value={newPartner.hisse_orani} onChange={(e) => setNewPartner({...newPartner, hisse_orani: e.target.value})} placeholder="Hisse Orani (%)" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <input type="text" value={newPartner.phone} onChange={(e) => setNewPartner({...newPartner, phone: e.target.value})} placeholder="Telefon" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <input type="text" value={newPartner.email} onChange={(e) => setNewPartner({...newPartner, email: e.target.value})} placeholder="E-Posta" className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <textarea value={newPartner.address} onChange={(e) => setNewPartner({...newPartner, address: e.target.value})} placeholder="Adres" rows={1} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400 resize-none sm:col-span-2" />
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={handleSavePartner} className="bg-green-500/20 text-green-400 px-4 py-2 rounded-lg text-sm font-medium">{editPartnerId ? 'Guncelle' : 'Kaydet'}</button>
                <button onClick={() => { setShowPartnerForm(false); setEditPartnerId(null); setNewPartner({ name: '', title: '', phone: '', email: '', tc: '', vkn: '', vergi_dairesi: '', hisse_orani: '', address: '' }) }} className="bg-red-500/20 text-red-400 px-4 py-2 rounded-lg text-sm font-medium">Iptal</button>
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
                        {partner.hisse_orani && <span className="text-blue-400 text-xs">%{partner.hisse_orani}</span>}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-2 text-sm text-gray-400">
                        {partner.tc && <span>TC: {partner.tc}</span>}
                        {partner.vkn && <span>VKN: {partner.vkn}</span>}
                        {partner.vergi_dairesi && <span>Vergi Dairesi: {partner.vergi_dairesi}</span>}
                        {partner.phone && <span>Tel: {partner.phone}</span>}
                        {partner.email && <span>E-Posta: {partner.email}</span>}
                        {partner.address && <span className="sm:col-span-2">Adres: {partner.address}</span>}
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
              <button key={item.key} onClick={() => toggleEService(item.key)} className={`flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer ${client[item.key] ? 'bg-green-500/10 border-green-500/30 hover:bg-green-500/20' : 'bg-blue-900/20 border-blue-700/20 hover:bg-blue-800/30'}`}>
                <span className="text-white text-sm font-medium">{item.label}</span>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${client[item.key] ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-500'}`}>
                  {client[item.key] ? 'Aktif' : 'Pasif'}
                </span>
              </button>
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
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    <input type="text" value={editData.ticariSicilNo || ''} onChange={(e) => setEditData({...editData, ticariSicilNo: e.target.value})} placeholder="Ticari Sicil Numarasi" className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between"><span className="text-gray-400 text-xs">Ticari Sicil No:</span><span className="text-gray-200 text-sm font-mono">{client.ticariSicilNo || '-'}</span></div>
                  </div>
                )}
                <p className="text-gray-500 text-[10px] mt-2 italic">Ticari sicil numarasiyla sorgulama yapilir</p>
              </div>

              {/* e-Devlet */}
              <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/20">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">🇹🇷</span>
                  <span className="text-white font-medium text-sm">e-Devlet</span>
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
            <p className="text-gray-400 text-xs mb-3">Ticari Sicil No ile sorgulama yapilir{client.ticariSicilNo ? ` - Sicil No: ${client.ticariSicilNo}` : ''}</p>
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
                            <span>PDF Y</span>
                            <input type="file" accept="application/pdf" disabled={docLoading} className="hidden" onChange={e => { handleGelirBeyanUpload(e, doc.key); e.target.value = '' }} />
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
                            <span>PDF Y</span>
                            <input type="file" accept="application/pdf" disabled={docLoading} className="hidden" onChange={e => { handleGeciciVergiUpload(e, doc.key); e.target.value = '' }} />
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
            <div className="flex gap-2">
              <label className="cursor-pointer bg-green-600/20 text-green-400 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1 hover:bg-green-600/30 transition-colors">
                <Upload className="w-4 h-4" /><span>Bordro Excel</span>
                <input ref={bordroFileRef} type="file" accept=".xlsx,.xls" onChange={handleBordroUpload} className="hidden" />
              </label>
              <button onClick={() => { setShowPersonelForm(true); setEditPersonelId(null); setPersonelForm({ ad_soyad: '', tc_kimlik: '', ise_giris: '', isten_cikis: '', brut_ucret: '', dogum_tarihi: '' }) }}
                className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1">
                <Plus className="w-4 h-4" /><span>Ekle</span>
              </button>
            </div>
          </div>

          {/* Personel Ekleme/Duzenleme Formu */}
          {showPersonelForm && (
            <div className="mb-6 p-4 bg-blue-900/20 rounded-xl border border-blue-700/40">
              <h4 className="text-sm font-semibold text-yellow-400 mb-3">{editPersonelId ? 'Personel Duzenle' : 'Yeni Personel'}</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input type="text" placeholder="Ad Soyad *" value={personelForm.ad_soyad} onChange={(e) => setPersonelForm({...personelForm, ad_soyad: e.target.value})}
                  className="bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <input type="text" placeholder="TC Kimlik No" value={personelForm.tc_kimlik} onChange={(e) => setPersonelForm({...personelForm, tc_kimlik: e.target.value})}
                  className="bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400" />
                <input type="number" placeholder="Brut Ucret" value={personelForm.brut_ucret} onChange={(e) => setPersonelForm({...personelForm, brut_ucret: e.target.value})}
                  className="bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400" />
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
              </div>
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
                      <td className="px-4 py-2 text-gray-300 text-sm">{p.ise_giris ? new Date(p.ise_giris).toLocaleDateString('tr-TR') : '-'}</td>
                      <td className="px-4 py-2 text-gray-300 text-sm">{p.isten_cikis ? new Date(p.isten_cikis).toLocaleDateString('tr-TR') : '-'}</td>
                      <td className="px-4 py-2 text-yellow-400 text-sm text-right font-medium">{p.brut_ucret ? Number(p.brut_ucret).toLocaleString('tr-TR', {minimumFractionDigits: 2}) + ' TL' : '-'}</td>
                      <td className="px-4 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => { setEditPersonelId(p.id); setShowPersonelForm(true); setPersonelForm({ ad_soyad: p.ad_soyad, tc_kimlik: p.tc_kimlik || '', ise_giris: p.ise_giris || '', isten_cikis: p.isten_cikis || '', brut_ucret: p.brut_ucret || '', dogum_tarihi: p.dogum_tarihi || '' }) }}
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

      {activeTab === 'zrapor' && (
        <div className="space-y-6">
          {/* Belge Türü Seçimi */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => setUploadDocType('zreport')}
              className={`p-4 rounded-xl border-2 transition-all ${uploadDocType === 'zreport' ? 'border-yellow-400 bg-yellow-400/10' : 'border-blue-700/50 bg-blue-900/20 hover:border-blue-500/50'}`}
            >
              <div className="flex items-center gap-3">
                <Camera className="w-6 h-6 text-yellow-400" />
                <div className="text-left">
                  <div className="text-white font-medium">Z Raporu</div>
                  <div className="text-gray-400 text-sm">Yazarkasa Z raporu yükle ve OCR ile oku</div>
                </div>
              </div>
            </button>
            
            <button
              onClick={() => setUploadDocType('expense')}
              className={`p-4 rounded-xl border-2 transition-all ${uploadDocType === 'expense' ? 'border-green-400 bg-green-400/10' : 'border-blue-700/50 bg-blue-900/20 hover:border-blue-500/50'}`}
            >
              <div className="flex items-center gap-3">
                <Receipt className="w-6 h-6 text-green-400" />
                <div className="text-left">
                  <div className="text-white font-medium">Gider Fişi</div>
                  <div className="text-gray-400 text-sm">Gider fişi yükle ve OCR ile oku</div>
                </div>
              </div>
            </button>
          </div>
          
          {/* Seçilen Belge Türüne Göre İçerik */}
          {uploadDocType === 'zreport' && (
            <ZReportManager clientId={id} clientName={client.name || client.company || ''} clientType={client.client_type} />
          )}
          
          {uploadDocType === 'expense' && (
            <ExpenseUploader clientId={id} clientName={client.name || client.company || ''} />
          )}
          
          {!uploadDocType && (
            <div className="text-center py-8 text-gray-400">
              Yukarıdan belge türü seçin
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-green-500/10 rounded-xl p-3 text-center border border-green-500/20">
                    <p className="text-xs text-gray-400">Toplam Odeme</p>
                    <p className="text-lg font-bold text-green-400">-{fmt(ozet.toplamOdeme)} TL</p>
                  </div>
                  <div className={`rounded-xl p-3 text-center border ${ozet.kalanBorc > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-green-500/10 border-green-500/20'}`}>
                    <p className="text-xs text-gray-400">Kalan Borc</p>
                    <p className={`text-xl font-bold ${ozet.kalanBorc > 0 ? 'text-red-400' : 'text-green-400'}`}>{fmt(ozet.kalanBorc)} TL</p>
                  </div>
                </div>
                {ozet.sonOdeme && <p className="text-xs text-gray-500 mt-2">Son odeme: {new Date(ozet.sonOdeme).toLocaleDateString('tr-TR')}</p>}
              </div>
            )
          })()}

          {/* Ucret Ayarlari */}
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-4">Ucret Ayarlari</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Onceki Donem Borc (TL)</label>
                <input type="number" value={feeForm.onceki_donem_borc} onChange={(e) => setFeeForm({...feeForm, onceki_donem_borc: e.target.value})}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 px-4 text-white focus:outline-none focus:border-yellow-400" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Defter Tasdik Ucreti (TL)</label>
                <input type="number" value={feeForm.defter_tasdik_ucreti} onChange={(e) => setFeeForm({...feeForm, defter_tasdik_ucreti: e.target.value})}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 px-4 text-white focus:outline-none focus:border-yellow-400" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Aylik Muhasebe Ucreti (TL)</label>
                <input type="number" value={feeForm.aylik_ucret} onChange={(e) => setFeeForm({...feeForm, aylik_ucret: e.target.value})}
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
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <div>
                    <label className="text-xs text-gray-400">Tutar (TL) *</label>
                    <input type="number" value={paymentForm.tutar} onChange={(e) => setPaymentForm({...paymentForm, tutar: e.target.value})}
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
                  <div>
                    <label className="text-xs text-gray-400">Donem</label>
                    <input type="month" value={paymentForm.donem} onChange={(e) => setPaymentForm({...paymentForm, donem: e.target.value})}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Tarih</label>
                    <input type="date" value={paymentForm.odeme_tarihi} onChange={(e) => setPaymentForm({...paymentForm, odeme_tarihi: e.target.value})}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Aciklama</label>
                    <input type="text" value={paymentForm.aciklama} onChange={(e) => setPaymentForm({...paymentForm, aciklama: e.target.value})}
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
                      <th className="px-4 py-2 text-center">Sil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientPayments.map(p => (
                      <tr key={p.id} className="border-t border-blue-700/20 hover:bg-blue-800/20">
                        <td className="px-4 py-2 text-white text-sm">{new Date(p.odeme_tarihi).toLocaleDateString('tr-TR')}</td>
                        <td className="px-4 py-2 text-right text-green-400 text-sm font-medium">{Number(p.tutar).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</td>
                        <td className="px-4 py-2 text-gray-300 text-xs">
                          <span className={`px-2 py-1 rounded ${p.odeme_tipi === 'eft' ? 'bg-blue-500/20 text-blue-400' : p.odeme_tipi === 'kredi_karti' ? 'bg-purple-500/20 text-purple-400' : 'bg-gray-500/20 text-gray-400'}`}>
                            {p.odeme_tipi === 'eft' ? 'EFT/Havale' : p.odeme_tipi === 'kredi_karti' ? 'Kredi Karti' : 'Nakit'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-400 text-sm">{p.donem || '-'}</td>
                        <td className="px-4 py-2 text-gray-400 text-sm">{p.aciklama || '-'}</td>
                        <td className="px-4 py-2 text-center">
                          <button onClick={() => handleDeletePayment(p.id)} className="text-red-400 hover:text-red-300 p-1"><Trash2 className="w-4 h-4" /></button>
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
