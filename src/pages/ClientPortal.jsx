import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  FileText, Download, Eye, EyeOff, Bell, CheckCircle,
  AlertTriangle, Upload, FolderOpen, MessageSquare,
  User, Settings, Send, Receipt, CreditCard, Calendar,
  Phone, Mail, MapPin, Building2, Save, DollarSign, Copy, ExternalLink,
  FileSearch, ChevronRight, ChevronDown, Folder, X, RefreshCw, Users, ChevronLeft, Camera, Calculator,
  Home as HomeIcon, Megaphone, Mic, Menu as MenuIcon, Headphones, LayoutGrid, ArrowRight, KeyRound, Monitor
} from 'lucide-react'
import FileUploader from '../components/FileUploader'
import { getAccountingFee, getPayments, hesaplaBorcOzeti, BANKA_BILGILERI, getBankInfo, getActivePaymentProvider, openReceipt } from '../services/paymentService'
import {
  getClientNotifications,
  markClientNotificationRead,
  markAllClientNotificationsRead,
  getUnreadClientNotificationCount
} from '../services/notificationService'
import { getMessages, replyFromClient, markAllAsRead } from '../services/messageService'
import { getSettings, parseDocumentPermissions, isDocumentTypeAllowed, parseDocumentFolders } from '../services/settingsService'
import { sendShareDocumentsViaWhatsApp, sendEmail, openWhatsAppWeb, logWhatsAppWebSend, getWhatsAppChannel } from '../services/whatsappService'
import { formatDateTR, formatDateTimeTR } from '../utils/dateUtils'
import { createUnicodePdf } from '../utils/unicodePdf'
import { formatMoney } from '../utils/numberFormat'
import IzinTakip from './IzinTakip'
import PratikHesaplamalar from './PratikHesaplamalar'
import { getPendingRenewals, replyRenewal, postponeRenewal } from '../services/kiraYenilemeService'
import VergiTakvimi from '../components/VergiTakvimi'
import ZReportManager from '../components/ZReportManager'
import ExpenseUploader from '../components/ExpenseUploader'
import ClientKiraStopaj from './ClientKiraStopaj'
import { etebligatlariGetirVeYukle } from '../services/gibIndirmeService'
import { gibBorcSorgula, sgkBorcSorgula } from '../utils/gibOdemeHelper'

const AYLAR_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

export default function ClientPortal({ embedded = false, initialTab = null }) {
  const [searchParams] = useSearchParams()
  const { user, office, logout } = useAuth()
  const [activeTab, setActiveTab] = useState(initialTab || searchParams.get('tab') || 'anasayfa')
  const [sidebarAcik, setSidebarAcik] = useState(false)
  const [menuHover, setMenuHover] = useState(false)
  const [uploadDocType, setUploadDocType] = useState(null)
  const [showProfileEdit, setShowProfileEdit] = useState(false)
  const [showEdevletSifre, setShowEdevletSifre] = useState(false)
  const [editProfile, setEditProfile] = useState({
    name: user?.name || '',
    company: user?.company || '',
    email: user?.email || '',
    phone: user?.phone || '',
    city: user?.city || '',
    vkn: user?.vkn || user?.tc || '',
    taxOffice: user?.taxOffice || '',
    earsiv: user?.earsiv || false,
    efatura: user?.efatura || false,
    esmm: user?.esmm || false,
    edevletPass: '',
  })
  const [profileSaving, setProfileSaving] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  
  const [profile] = useState({
    name: user?.name || 'Kullanici',
    company: user?.company || user?.name || '',
    email: user?.email || user?.username || '',
    phone: user?.phone || '',
    address: user?.city || '',
    vkn: user?.vkn || user?.tc || '',
    taxOffice: user?.taxOffice || '',
  })

  // Muhasebe borcu
  const [accountingFee, setAccountingFee] = useState(null)
  const [myPayments, setMyPayments] = useState([])
  const [showBankaModal, setShowBankaModal] = useState(false)
  const [showKrediKartiModal, setShowKrediKartiModal] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [ibanCopied, setIbanCopied] = useState(false)
  const [cardForm, setCardForm] = useState({ cardOwner: '', cardNumber: '', expiryMonth: '', expiryYear: '', cvv: '' })
  const [bankInfo, setBankInfo] = useState(BANKA_BILGILERI)
  const [activeProvider, setActiveProvider] = useState('paytr')

  const [kiraRenewal, setKiraRenewal] = useState(null)
  const [kiraRenewalValue, setKiraRenewalValue] = useState('')
  const [kiraRenewalLoading, setKiraRenewalLoading] = useState(false)
  const [kiraRenewalResult, setKiraRenewalResult] = useState(null)
  const [kiraPostponeMode, setKiraPostponeMode] = useState(false)

  const [clientId, setClientId] = useState(user?.clientId || user?.id || null)
  const [clientDetail, setClientDetail] = useState(null)
  const [beyanDocuments, setBeyanDocuments] = useState([])
  const [beyanFilter, setBeyanFilter] = useState({ type: '', year: new Date().getFullYear(), month: '', docType: '' })
  const [notificationsList, setNotificationsList] = useState([])
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  const [clientDocuments, setClientDocuments] = useState([])
  const [clientDocumentsLoading, setClientDocumentsLoading] = useState(false)
  const [docPermissions, setDocPermissions] = useState(null)
  const [docFilter, setDocFilter] = useState('all')
  const [documentTree, setDocumentTree] = useState(null)
  const [expandedFolders, setExpandedFolders] = useState({ 'Mali Veriler': true })
  const [selectedDocIds, setSelectedDocIds] = useState(new Set())
  const [showShareModal, setShowShareModal] = useState(false)

  const [messages, setMessages] = useState([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messageSending, setMessageSending] = useState(false)

  const [vergiBorcu, setVergiBorcu] = useState(0)
  const [sgkBorcu, setSgkBorcu] = useState(0)
  const [sgkSadeceBorclar, setSgkSadeceBorclar] = useState(0)
  const [sgkGecikmeZammi, setSgkGecikmeZammi] = useState(0)
  const [vergiBorcuYukleniyor, setVergiBorcuYukleniyor] = useState(false)
  const [vergiBorcMesaj, setVergiBorcMesaj] = useState('')
  const [sgkBorcuYukleniyor, setSgkBorcuYukleniyor] = useState(false)
  const [sgkBorcMesaj, setSgkBorcMesaj] = useState('')
  const [tebligatSorguluyor, setTebligatSorguluyor] = useState(false)
  const [tebligatMesaj, setTebligatMesaj] = useState('')

  const [shareForm, setShareForm] = useState({
    recipientName: '',
    recipientEmail: '',
    recipientPhone: '',
    channel: 'email',
    message: ''
  })
  const [shareLoading, setShareLoading] = useState(false)
  const [shareResult, setShareResult] = useState(null)
  const [shareSettings, setShareSettings] = useState(null)

  const BEYAN_LABELS = {
    kdv: 'KDV',
    kdv2: 'KDV2',
    muhtasar: 'Muhtasar',
    sgk: 'SGK',
    gecici_vergi: 'Gecici Vergi',
    kurumlar_vergi: 'Kurumlar Vergisi',
    gelir_vergi: 'Gelir Vergisi',
    edefter: 'e-Defter',
    muhtasar_3aylik: 'Muhtasar (3 Aylik)',
    esmm: 'ESMM'
  }

  const DOCUMENT_CATEGORIES = {
    beyanname: 'Beyanname',
    tahakkuk: 'Tahakkuk',
    mizan: 'Mizan',
    sigorta_tahakkuk: 'Sigorta Tahakkuk',
    hizmet_listesi: 'Hizmet Listesi',
    bordro: 'Bordro',
    gelir_beyani: 'Gelir Beyani',
    gecici_vergi: 'Gecici Vergi',
    vergi_levhasi: 'Vergi Levhasi',
    mali_evraklar: 'Mali Evraklar'
  }

  useEffect(() => {
    const resolveClientId = async () => {
      console.log('resolveClientId basladi, user:', user?.id, user?.email, user?.clientId)
      
      // Eğer user.id zaten sayısal clientId ise, kullan
      if (user?.id && typeof user.id === 'number') {
        console.log('ClientId zaten sayisal:', user.id)
        setClientId(user.id)
        return
      }
      
      if (user?.clientId) {
        setClientId(user.clientId)
        return
      }
      
      // user?.id UUID ise, auth_user_id ile eslestir
      if (user?.id && typeof user.id === 'string' && user.id.includes('-')) {
        try {
          const { data, error } = await supabase
            .from('clients')
            .select('id')
            .eq('auth_user_id', user.id)
            .limit(1)
            .maybeSingle()
          if (!error && data) {
            console.log('ClientId auth_user_id ile bulundu:', data.id)
            setClientId(data.id)
            return
          }
        } catch (err) {
          console.error('ClientId auth_user_id ile bulma hatasi:', err)
        }
      }
      
      // 1. Email/username ile ara
      if (user?.email) {
        const emailPrefix = user.email.split('@')[0]
        try {
          const { data, error } = await supabase
            .from('clients')
            .select('id')
            .or(`username.eq.${emailPrefix},email.eq.${user.email}`)
            .limit(1)
            .maybeSingle()
          if (!error && data) {
            console.log('ClientId email ile bulundu:', data.id)
            setClientId(data.id)
            return
          }
        } catch (err) {
          console.error('ClientId email ile bulma hatasi:', err)
        }
      }
      
      console.warn('ClientId bulunamadi')
    }
    resolveClientId()
  }, [user])

  useEffect(() => {
    getActivePaymentProvider().then(setActiveProvider).catch(() => setActiveProvider('paytr'))
  }, [])

  useEffect(() => {
    if (clientId && activeTab) {
      loadBorcData()
      loadClientDetail()
      loadNotifications()
      loadShareSettings()
      loadMesajlar()
      loadPendingKiraRenewal()
      loadBankInfoData()
    }
  }, [clientId, activeTab])

  // Mesajlar sekmesi acikken 30 sn'de bir yenile
  useEffect(() => {
    if (activeTab !== 'messages' || !clientId) return
    const timer = setInterval(loadMesajlar, 30000)
    return () => clearInterval(timer)
  }, [activeTab, clientId])

  const loadNotifications = async () => {
    if (!clientId) return
    setNotificationsLoading(true)
    try {
      const [notifs, count] = await Promise.all([
        getClientNotifications(clientId),
        getUnreadClientNotificationCount(clientId)
      ])
      setNotificationsList(notifs)
      setUnreadCount(count)
    } catch (err) {
      console.error('Bildirim yukleme hatasi:', err)
    } finally {
      setNotificationsLoading(false)
    }
  }

  const handleMarkAsRead = async (id) => {
    try {
      await markClientNotificationRead(id)
       setNotificationsList(prev => prev.map(n => n.id === id ? { ...n, is_read: true, read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (err) {
      console.error('Bildirim okundu isaretleme hatasi:', err)
    }
  }

  const handleMarkAllAsRead = async () => {
    if (!clientId) return
    try {
      await markAllClientNotificationsRead(clientId)
      setNotificationsList(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch (err) {
      console.error('Tum bildirimleri okundu isaretleme hatasi:', err)
    }
  }

  // Mali musavir ile mesajlasma (client_messages tablosu)
  const loadMesajlar = async () => {
    if (!clientId) return
    setMessagesLoading(true)
    try {
      const data = await getMessages(clientId)
      const mapped = (data || []).map(m => ({
        id: m.id,
        from: m.sender === 'admin' ? (m.sender_name || 'Mali Musavir') : 'Siz',
        text: m.sender === 'admin' ? (m.assistant_message || m.message) : m.message,
        date: formatDateTR(m.created_at) || '',
        time: m.created_at ? new Date(m.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '',
        type: m.sender === 'admin' ? 'received' : 'sent',
        priority: m.priority || 'normal',
        actionLabel: m.action_label,
        actionUrl: m.action_url,
        dueDate: m.due_date
      }))
      setMessages(mapped.reverse()) // en yeni en ustte
      // Admin mesajlari okundu olarak isaretle
      markAllAsRead(clientId, 'admin').catch(() => {})
    } catch (err) {
      console.error('Mesaj yukleme hatasi:', err)
    } finally {
      setMessagesLoading(false)
    }
  }

  const loadClientDetail = async () => {
    if (!clientId) return
    setClientDocumentsLoading(true)
    try {
      const [{ data, error }, { data: permRows }, { data: folderRows }] = await Promise.all([
        supabase.from('clients').select('*').eq('id', clientId).single(),
        supabase.from('app_settings').select('key, value').eq('key', 'client_document_permissions'),
        supabase.from('app_settings').select('key, value').eq('key', 'client_document_folders')
      ])
      if (!error && data) {
        setClientDetail(data)
        const perms = parseDocumentPermissions(permRows?.[0]?.value)
        const folders = parseDocumentFolders(folderRows?.[0]?.value)
        setDocPermissions(perms)
        buildClientDocuments(data, perms, folders)
      }
    } catch (err) {
      console.error('Musteri detayi yukleme hatasi:', err)
    } finally {
      setClientDocumentsLoading(false)
    }
  }

  const handleVergiBorcSorgula = async () => {
    if (!clientId) return
    setVergiBorcuYukleniyor(true)
    setVergiBorcMesaj('GIB Dijital Vergi Dairesi aciliyor. Lutfen guvenlik kodunu girip giris yapin.')
    try {
      const res = await gibBorcSorgula(clientId)
      if (!res.ok) {
        if (res.reason === 'gib-sifre-eksik') {
          setVergiBorcMesaj('Profilinizde GIB kullanici kodu/parola eksik. Profilim bolumunden ekleyin.')
        } else if (res.reason === 'kurulu-degil') {
          setVergiBorcMesaj('Yardimci program calismiyor. Lutfen MUBiS Yardimci Programi kurun/baslatin.')
        } else {
          setVergiBorcMesaj('Sorgulama tamamlanamadi: ' + (res.reason || 'Bilinmeyen hata'))
        }
        return
      }
      setVergiBorcu(res.borc)
      setVergiBorcMesaj(res.not || '')
    } catch (err) {
      setVergiBorcMesaj('Hata: ' + (err.message || 'Bilinmeyen hata'))
    } finally {
      setVergiBorcuYukleniyor(false)
    }
  }

  const handleSgkBorcSorgula = async () => {
    if (!clientId) return
    setSgkBorcuYukleniyor(true)
    setSgkBorcMesaj('SGK e-Bildirge aciliyor. Lutfen guvenlik anahtarini girip giris yapin.')
    try {
      const res = await sgkBorcSorgula(clientId)
      if (!res.ok) {
        if (res.reason === 'sgk-sifre-eksik') {
          setSgkBorcMesaj('Profilinizde SGK kullanici adi, sistem sifresi veya isyeri sifresi eksik. (' + (res.detail || '') + ')')
        } else if (res.reason === 'kurulu-degil') {
          setSgkBorcMesaj('Yardimci program calismiyor. Lutfen MUBiS Yardimci Programi kurun/baslatin.')
        } else {
          setSgkBorcMesaj('Sorgulama tamamlanamadi: ' + (res.reason || 'Bilinmeyen hata'))
        }
        return
      }
      setSgkSadeceBorclar(res.sadeceBorclar)
      setSgkGecikmeZammi(res.gecikmeZammi)
      setSgkBorcu(res.toplam)
      setSgkBorcMesaj(res.not || '')
    } catch (err) {
      setSgkBorcMesaj('Hata: ' + (err.message || 'Bilinmeyen hata'))
    } finally {
      setSgkBorcuYukleniyor(false)
    }
  }

  const handleTebligatSorgula = async () => {
    if (!clientId) return
    setTebligatSorguluyor(true)
    setTebligatMesaj('Yardimci program aciliyor, lutfen e-Devlet guvenlik kodunu girip giris yapin.')
    try {
      const { sayi } = await etebligatlariGetirVeYukle({ clientId, kaynak: 'tumu' })
      setTebligatMesaj(`${sayi} adet yeni e-tebligat bulundu ve evraklariniza eklendi.`)
      await loadClientDetail()
    } catch (err) {
      const msg = err.message || 'Bilinmeyen hata'
      if (msg.includes('Yardimci programa ulasilamadi')) {
        setTebligatMesaj('Yardimci program calismiyor. Lutfen once MUBiS Yardimci Programi kurun/baslatin.')
      } else if (msg.includes('e-Devlet giris bilgileri eksik')) {
        setTebligatMesaj('Profilinizde TC Kimlik No ve e-Devlet sifreniz eksik. Profilim bolumunden ekleyin.')
      } else {
        setTebligatMesaj('Sorgulama tamamlanamadi: ' + msg)
      }
    } finally {
      setTebligatSorguluyor(false)
    }
  }

  const loadPendingKiraRenewal = async () => {
    if (!clientId) return
    try {
      const list = await getPendingRenewals(clientId)
      if (list.length > 0) {
        setKiraRenewal(list[0])
      }
    } catch (err) {
      console.error('Kira yenileme kontrol hatasi:', err)
    }
  }

  const handleKiraRenewalSubmit = async (artisYok) => {
    if (!kiraRenewal) return
    setKiraRenewalLoading(true)
    setKiraRenewalResult(null)
    try {
      await replyRenewal({
        id: kiraRenewal.id,
        yeniNetKira: artisYok ? null : kiraRenewalValue,
        artisYok
      })
      setKiraRenewalResult({ ok: true, text: artisYok ? 'Talebiniz iletildi. Mevcut kiraniz 1 yil uzatilacak.' : 'Yeni kira tutariniz mali musavirinize iletildi. Onaylandiktan sonra guncellenecek.' })
      setKiraRenewal(null)
      setKiraPostponeMode(false)
      setTimeout(() => setKiraRenewalResult(null), 4000)
    } catch (err) {
      setKiraRenewalResult({ ok: false, text: err.message || 'Islem gerceklestirilemedi.' })
    } finally {
      setKiraRenewalLoading(false)
    }
  }

  const handleKiraPostpone = async (gun) => {
    if (!kiraRenewal) return
    setKiraRenewalLoading(true)
    setKiraRenewalResult(null)
    try {
      await postponeRenewal({ id: kiraRenewal.id, gun })
      setKiraRenewalResult({ ok: true, text: `${gun} gun sonra tekrar hatirlatma yapilacak.` })
      setKiraRenewal(null)
      setKiraPostponeMode(false)
      setTimeout(() => setKiraRenewalResult(null), 4000)
    } catch (err) {
      setKiraRenewalResult({ ok: false, text: err.message || 'Islem gerceklestirilemedi.' })
    } finally {
      setKiraRenewalLoading(false)
    }
  }

  const loadShareSettings = async () => {
    try {
      const settings = await getSettings()
      setShareSettings(settings)
    } catch (err) {
      console.error('Paylasim ayarlari yukleme hatasi:', err)
    }
  }

  const getMonthLabel = (m) => {
    const months = ['Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran', 'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik']
    return months[m] || ''
  }

  const buildClientDocuments = (client, permissions, folders) => {
    const storedDocs = client?.client_documents || {}
    const allDocs = []
    const tree = {
      id: 'root',
      name: 'Tum Evraklar',
      type: 'root',
      children: []
    }

    const canShow = (category, subType = null) => isDocumentTypeAllowed(permissions, category, subType)
    const folderList = folders?.folders?.length ? folders.folders : parseDocumentFolders().folders

    const renderContent = (content, folderId) => {
      const items = []
      if (content.source === 'gelir_beyani') {
        if (!canShow('gelir_beyani')) return items
        const years = storedDocs?.mali_veriler?.gelir_beyani || {}
        Object.keys(years).sort().reverse().forEach(year => {
          const doc = years[year]?.[content.docType]
          if (doc?.url) {
            items.push({
              id: `${folderId}_${year}_${content.docType}`,
              name: `${year} - ${content.label}`,
              type: 'file',
              url: doc.url,
              size: doc.size,
              date: doc.uploaded_at,
              meta: doc
            })
            allDocs.push(doc)
          }
        })
      } else if (content.source === 'gecici_vergi') {
        if (!canShow('gecici_vergi')) return items
        const years = storedDocs?.mali_veriler?.gecici_vergi || {}
        Object.keys(years).sort().reverse().forEach(year => {
          const donemler = years[year] || {}
          Object.keys(donemler).sort().forEach(donem => {
            const doc = donemler[donem]?.[content.docType]
            if (doc?.url) {
              items.push({
                id: `${folderId}_${year}_${donem}_${content.docType}`,
                name: `${year} ${donem}. Donem - ${content.label}`,
                type: 'file',
                url: doc.url,
                size: doc.size,
                date: doc.uploaded_at,
                meta: doc
              })
              allDocs.push(doc)
            }
          })
        })
      } else if (content.source === 'vergi_levhasi') {
        if (!canShow('vergi_levhasi')) return items
        const doc = storedDocs?.mali_veriler?.vergi_levhasi
        if (doc?.url) {
          items.push({
            id: `${folderId}_vergi_levhasi`,
            name: content.label,
            type: 'file',
            url: doc.url,
            size: doc.size,
            date: doc.uploaded_at,
            meta: doc
          })
          allDocs.push(doc)
        }
      } else if (content.source === 'mali_evraklar') {
        const cat = content.category
        if (!canShow(cat)) return items
        const list = storedDocs?.mali_evraklar?.[cat] || []
        list.forEach((doc, idx) => {
          items.push({
            id: `${folderId}_${cat}_${idx}`,
            name: doc.name || content.label,
            type: 'file',
            url: doc.url,
            size: doc.size,
            date: doc.uploaded_at,
            meta: doc
          })
          allDocs.push(doc)
        })
      }
      return items
    }

    const buildFolderNode = (folder) => {
      const node = {
        id: folder.id,
        name: folder.name,
        type: 'folder',
        children: []
      }
      const contents = folder.contents || []
      contents.forEach((content, idx) => {
        const items = renderContent(content, `${folder.id}_${idx}`)
        node.children.push(...items)
      })
      const childFolders = (folder.children || []).map(buildFolderNode)
      node.children.push(...childFolders)
      return node
    }

    folderList.forEach(folder => {
      const node = buildFolderNode(folder)
      if (node.children.length > 0) tree.children.push(node)
    })

    setDocumentTree(tree)
    setClientDocuments(allDocs)
  }

  const loadBeyanDocuments = useCallback(async () => {
    if (!clientDetail) return
    const durumlar = clientDetail.beyan_durumlari || {}
    const docs = []
    const addDoc = (doc) => {
      if (!doc.url && !doc.name) return
      // Ayni donem/tur/belge turu kombinasyonunda zaten bir kayit varsa,
      // URL'si olani tercih et (bos kayitlari tekrar ekleme)
      const combo = `${doc.year}_${doc.month}_${doc.type}_${doc.docType}`
      const existingIdx = docs.findIndex(d => `${d.year}_${d.month}_${d.type}_${d.docType}` === combo)
      if (existingIdx >= 0) {
        const existing = docs[existingIdx]
        if (!existing.url && doc.url) {
          docs[existingIdx] = doc
        }
        return
      }
      docs.push(doc)
    }
    Object.keys(durumlar).forEach(key => {
      if (key.endsWith('_beyan_url') || key.endsWith('_tahakkuk_url')) {
        const parts = key.replace('_beyan_url', '').replace('_tahakkuk_url', '').split('_')
        if (parts.length >= 3) {
          const [year, month, ...typeParts] = parts
          const type = typeParts.join('_')
          const docType = key.endsWith('_beyan_url') ? 'beyanname' : 'tahakkuk'
          if (!isDocumentTypeAllowed(docPermissions, docType, type)) return
          addDoc({
            id: key,
            year,
            month: Number(month),
            type,
            docType,
            url: durumlar[key],
            name: durumlar[`${year}_${month}_${type}_${docType}_name`] || '',
            status: durumlar[`${year}_${month}_${type}`] || '',
            date: durumlar[`${year}_${month}_${type}_tarih`] || ''
          })
        }
      }
      // Coklu tahakkuk listeleri
      if (key.endsWith('_tahakkuklar') && Array.isArray(durumlar[key])) {
        const baseKey = key.replace('_tahakkuklar', '')
        const parts = baseKey.split('_')
        if (parts.length >= 3) {
          const [year, month, ...typeParts] = parts
          const type = typeParts.join('_')
          if (!isDocumentTypeAllowed(docPermissions, 'tahakkuk', type)) return
          durumlar[key].forEach((t, idx) => {
            if (!t?.url) return
            addDoc({
              id: `${key}_${idx}`,
              year,
              month: Number(month),
              type,
              docType: 'tahakkuk',
              url: t.url,
              name: t.name || `Tahakkuk ${idx + 1}`,
              tutar: Number(t.tutar) || 0,
              status: durumlar[baseKey] || '',
              date: t.uploadedAt || ''
            })
          })
        }
      }
      // Coklu beyanname listeleri
      if (key.endsWith('_beyanlar') && Array.isArray(durumlar[key])) {
        const baseKey = key.replace('_beyanlar', '')
        const parts = baseKey.split('_')
        if (parts.length >= 3) {
          const [year, month, ...typeParts] = parts
          const type = typeParts.join('_')
          if (!isDocumentTypeAllowed(docPermissions, 'beyanname', type)) return
          durumlar[key].forEach((b, idx) => {
            if (!b?.url) return
            addDoc({
              id: `${key}_${idx}`,
              year,
              month: Number(month),
              type,
              docType: 'beyanname',
              url: b.url,
              name: b.name || `Beyanname ${idx + 1}`,
              status: durumlar[baseKey] || '',
              date: b.uploadedAt || ''
            })
          })
        }
      }
      // _documents icindeki sigorta tahakkuklari (SGK Evraklar modali)
      if (key.endsWith('_documents') && Array.isArray(durumlar[key])) {
        const baseKey = key.replace('_documents', '')
        const parts = baseKey.split('_')
        if (parts.length >= 3) {
          const [year, month, ...typeParts] = parts
          const type = typeParts.join('_')
          durumlar[key].forEach((d, idx) => {
            if (!d?.url) return
            const docType = d.category === 'hizmet_listesi' ? 'beyanname' : 'tahakkuk'
            if (!isDocumentTypeAllowed(docPermissions, docType, type)) return
            addDoc({
              id: `${key}_${idx}`,
              year,
              month: Number(month),
              type,
              docType,
              url: d.url,
              name: d.name || (docType === 'tahakkuk' ? `Tahakkuk ${idx + 1}` : `Beyanname ${idx + 1}`),
              tutar: Number(d.tutar) || 0,
              status: durumlar[baseKey] || '',
              date: d.uploaded_at || d.uploadedAt || ''
            })
          })
        }
      }
    })
    setBeyanDocuments(docs)
  }, [clientDetail, docPermissions])

  useEffect(() => {
    loadBeyanDocuments()
  }, [loadBeyanDocuments])

  const filteredBeyanDocuments = beyanDocuments.filter(d => {
    return (
      (!beyanFilter.type || d.type === beyanFilter.type) &&
      (!beyanFilter.year || String(d.year) === String(beyanFilter.year)) &&
      (beyanFilter.month === '' || String(d.month) === String(beyanFilter.month)) &&
      (!beyanFilter.docType || d.docType === beyanFilter.docType)
    )
  })

  const BEYAN_TYPE_OPTIONS = [
    { id: 'kdv', name: 'KDV' },
    { id: 'kdv2', name: 'KDV2' },
    { id: 'muhtasar', name: 'Muhtasar' },
    { id: 'sgk', name: 'SGK' },
    { id: 'gecici_vergi', name: 'Gecici Vergi' },
    { id: 'kurumlar_vergi', name: 'Kurumlar Vergisi' },
    { id: 'gelir_vergi', name: 'Gelir Vergisi' },
    { id: 'edefter', name: 'e-Defter' },
    { id: 'esmm', name: 'ESMM' },
  ]

  const MONTHS = ['Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran', 'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik']

  const loadBorcData = async () => {
    try {
      console.log('loadBorcData, clientId:', clientId)
      const [fee, payments] = await Promise.all([
        getAccountingFee(clientId),
        getPayments(clientId)
      ])
      console.log('fee:', fee, 'payments:', payments)
      setAccountingFee(fee)
      setMyPayments(payments)
    } catch (err) {
      console.error('Borc veri yukleme hatasi:', err)
    }
  }

  const loadBankInfoData = async () => {
    try {
      const info = await getBankInfo()
      setBankInfo(info)
    } catch (err) {
      console.error('Banka bilgisi yukleme hatasi:', err)
    }
  }

  const notifications = [
    { id: 1, message: 'Temmuz ayi tahakkukunuz hazir', date: '2026-07-12', type: 'info' },
    { id: 2, message: 'Gecici vergi beyannameniz onaylandi', date: '2026-06-20', type: 'success' },
  ]

  const formatDate = (ts) => {
    return formatDateTimeTR(ts)
  }

  const collectFileNodes = (nodes, acc = []) => {
    nodes.forEach(node => {
      if (node.type === 'file') acc.push(node)
      if (node.children) collectFileNodes(node.children, acc)
    })
    return acc
  }

  const allFileNodes = documentTree ? collectFileNodes(documentTree.children) : []

  const toggleDocSelection = (id) => {
    setSelectedDocIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllDocs = () => {
    setSelectedDocIds(new Set(allFileNodes.map(n => n.id)))
  }

  const clearDocSelection = () => {
    setSelectedDocIds(new Set())
  }

  const openShareModal = () => {
    if (selectedDocIds.size === 0) {
      alert('Lutfen gondermek istediginiz en az bir evrak secin.')
      return
    }
    const selectedNames = allFileNodes
      .filter(n => selectedDocIds.has(n.id))
      .map(n => n.name)
      .join(', ')
    setShareForm(prev => ({
      ...prev,
      message: `Istemis oldugunuz mali veriler asagida listelenmektedir:\n${selectedNames}`
    }))
    setShowShareModal(true)
    setShareResult(null)
  }

  const closeShareModal = () => {
    setShowShareModal(false)
    setShareResult(null)
  }

  const handleShareSend = async () => {
    if (!shareForm.recipientName.trim()) {
      alert('Lutfen alici adini yazin.')
      return
    }
    if (shareForm.channel === 'email' && !shareForm.recipientEmail.trim()) {
      alert('Lutfen alici e-posta adresini yazin.')
      return
    }
    if (shareForm.channel === 'whatsapp' && !shareForm.recipientPhone.trim()) {
      alert('Lutfen alici telefon numarasini yazin.')
      return
    }

    setShareLoading(true)
    setShareResult(null)

    const selectedDocs = allFileNodes.filter(n => selectedDocIds.has(n.id))
    const clientName = clientDetail?.name || clientDetail?.company || ''
    const ownershipLine = clientName ? `Bu belgeler ${clientName} adina düzenlenmistir.\n\n` : ''
    const body = shareForm.message.trim() || 'Istemis oldugunuz mali veriler ektedir.'
    const fullMessage = `${ownershipLine}${body}`

    try {
      if (shareForm.channel === 'email') {
        const documents = selectedDocs.map(d => ({ name: d.name, url: d.url }))
        const res = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toEmail: shareForm.recipientEmail.trim(),
            toName: shareForm.recipientName.trim(),
            subject: clientName ? `Mali Veriler Paylasimi - ${clientName}` : 'Mali Veriler Paylasimi',
            message: fullMessage,
            documents,
            clientId
          })
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Mail gonderilemedi')
        setShareResult({ ok: true, text: 'Mail basariyla gonderildi.' })
      } else {
        const linksText = selectedDocs.map((d, i) => `${i + 1}. ${d.name}: ${d.url}`).join('\n')
        const waMessage = `${fullMessage}\n\n${linksText}\n\nSaygilarimizla, MUBiS ERP`
        await sendShareDocumentsViaWhatsApp({
          phone: shareForm.recipientPhone.trim(),
          message: waMessage,
          settings: shareSettings
        })
        await logWhatsAppWebSend({
          clientId,
          target: shareForm.recipientPhone.trim(),
          status: 'pending'
        })
        setShareResult({ ok: true, text: getWhatsAppChannel(shareSettings) === 'web' ? 'WhatsApp acildi. Lutfen mesaji kendi telefonunuzdan gonderin.' : 'WhatsApp mesaji gonderildi.' })
      }
      clearDocSelection()
      setTimeout(() => setShowShareModal(false), 2000)
    } catch (err) {
      console.error('Paylasim hatasi:', err)
      setShareResult({ ok: false, text: err.message || 'Gonderim basarisiz oldu.' })
    } finally {
      setShareLoading(false)
    }
  }

  const renderDocumentTree = (nodes, depth) => {
    return (
      <div className="space-y-1">
        {nodes.map(node => {
          const isFolder = node.type === 'folder' || node.type === 'root'
          const isExpanded = expandedFolders[node.name] !== false
          const paddingLeft = depth * 20

          if (isFolder) {
            return (
              <div key={node.id}>
                <button
                  onClick={() => setExpandedFolders(prev => ({ ...prev, [node.name]: !isExpanded }))}
                  className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg hover:bg-blue-800/30 text-gray-200 transition-colors"
                  style={{ paddingLeft: 12 + paddingLeft }}
                >
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-yellow-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                  {isExpanded ? <FolderOpen className="w-5 h-5 text-yellow-500" /> : <Folder className="w-5 h-5 text-gray-400" />}
                  <span className="font-medium">{node.name}</span>
                  {node.children?.length > 0 && <span className="text-gray-500 text-xs">({node.children.length})</span>}
                </button>
                {isExpanded && node.children?.length > 0 && (
                  <div className="mt-1">
                    {renderDocumentTree(node.children, depth + 1)}
                  </div>
                )}
              </div>
            )
          }

          return (
            <div
              key={node.id}
              className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-blue-800/30 text-gray-300"
              style={{ paddingLeft: 12 + paddingLeft }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <input
                  type="checkbox"
                  checked={selectedDocIds.has(node.id)}
                  onChange={() => toggleDocSelection(node.id)}
                  className="w-4 h-4 rounded border-blue-700/50 bg-blue-900/30 text-yellow-500 focus:ring-yellow-500 flex-shrink-0"
                />
                <FileText className="w-5 h-5 text-blue-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm truncate">{node.name}</p>
                   <p className="text-xs text-gray-500">{node.size} · {node.date ? formatDateTR(node.date) : '-'}</p>
                </div>
              </div>
              {node.url && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <a href={node.url} target="_blank" rel="noreferrer" className="p-1.5 bg-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/30" title="Goruntule">
                    <Eye className="w-4 h-4" />
                  </a>
                  <a href={node.url} download className="p-1.5 bg-green-500/20 rounded-lg text-green-400 hover:bg-green-500/30" title="Indir">
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  const tabs = [
    { id: 'anasayfa', label: 'Ana Sayfa', icon: HomeIcon },
    { id: 'documents', label: 'Evraklarım', icon: FolderOpen },
    { id: 'beyannamelerim', label: 'Beyannamelerim', icon: FileSearch },
    { id: 'invoices', label: 'Faturalarım', icon: Receipt },
    { id: 'borc', label: 'Muhasebe Borcum', icon: DollarSign },
    { id: 'messages', label: 'Mesajlarım', icon: MessageSquare },
    { id: 'notifications', label: 'Vergi Takvimi', icon: Bell },
    { id: 'kira-stopaj', label: 'Kira Stopaj Listesi', icon: FileText },
    { id: 'hesaplamalar', label: 'Hesaplamalar', icon: Calculator },
    { id: 'upload', label: 'Belge Yükle', icon: Camera },
    { id: 'personel', label: 'Personel', icon: Users },
    { id: 'profile', label: 'Profilim', icon: User },
  ]

  const handleSendMessage = async () => {
    const text = newMessage.trim()
    if (!text || !clientId || messageSending) return
    setMessageSending(true)
    try {
      await replyFromClient({
        clientId,
        message: text,
        clientName: user?.name || clientDetail?.name || clientDetail?.company || ''
      })
      setNewMessage('')
      await loadMesajlar()
    } catch (err) {
      console.error('Mesaj gonderme hatasi:', err)
      alert('Mesaj gonderilemedi: ' + (err.message || 'Bilinmeyen hata'))
    } finally {
      setMessageSending(false)
    }
  }

  const handleEarsiv = () => window.open('https://earsivportal.efatura.gov.tr/intragiris.html', '_blank')
  const handleEfatura = () => {
    if (window.confirm('e-Fatura icin program indirilsin mi?')) window.open('https://ebelge.gib.gov.tr/EFaturaWebSocket/EFaturaWebSocket.jnlp', '_blank')
  }

  const handleCopyIban = () => {
    navigator.clipboard.writeText(bankInfo.iban.replace(/\s/g, ''))
    setIbanCopied(true)
    setTimeout(() => setIbanCopied(false), 2000)
  }

  const handleKrediKartiOde = async () => {
    if (!paymentAmount || Number(paymentAmount) <= 0) {
      alert('Gecerli bir tutar girin')
      return
    }
    setPaymentLoading(true)
    try {
      const provider = await getActivePaymentProvider()
      if (provider === 'eft') {
        alert('Online kredi karti odemesi su an kapali. Lutfen EFT/Havale ile odeme yapin.')
        setPaymentLoading(false)
        return
      }
      const endpoint = provider === 'odeal' ? '/api/odeal-payment' : '/api/paytr-payment'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(paymentAmount),
          clientId: clientId || '',
          customerName: user?.name || user?.company || '',
          customerEmail: user?.email || '',
          description: 'Muhasebe Ucreti Odemesi'
        })
      })
      const data = await res.json()
      if (data.success && data.paymentUrl) {
        window.open(data.paymentUrl, '_blank')
        setShowKrediKartiModal(false)
        setPaymentAmount('')
        alert('Guvenli odeme sayfasi yeni pencerede acildi. Odeme sonrasi bu sayfayi yenileyin.')
      } else {
        alert(data.error || 'Odeme linki olusturulamadi')
      }
    } catch (err) {
      alert('Odeme istegi gonderilemedi: ' + err.message)
    } finally {
      setPaymentLoading(false)
    }
  }

  const borcOzeti = hesaplaBorcOzeti(accountingFee, myPayments)
  const fmt = (n) => Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })
  // Mali müşavirin yüklediği serbest meslek makbuzları (en yeni önce)
  const makbuzlar = [...(clientDetail?.client_documents?.makbuzlar || [])]
    .sort((a, b) => String(b.uploaded_at || '').localeCompare(String(a.uploaded_at || '')))

  const displayName = user?.name || clientDetail?.name || user?.company || 'Kullanıcı'

  // Admin (embedded) modunda muhasebe odemesi ve hesaplamalar gosterilmez
  // (hesaplamalar sol menude bagimsiz olarak zaten var)
  const gorunurTablar = embedded
    ? tabs.filter(t => t.id !== 'borc' && t.id !== 'anasayfa' && t.id !== 'hesaplamalar')
    : tabs

  return (
    <div className="min-h-screen">
    <div className="flex min-h-screen">
      {/* ==================== SOL MENU ==================== */}
      {sidebarAcik && !embedded && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setSidebarAcik(false)} />
      )}
      {!embedded && (
      <aside
        onMouseEnter={() => setMenuHover(true)}
        onMouseLeave={() => setMenuHover(false)}
        className={`fixed lg:sticky top-0 left-0 z-50 lg:z-10 w-[268px] flex-shrink-0 h-screen bg-[#0a1730] border-r border-blue-800/40 flex flex-col transition-all duration-300 ${
          sidebarAcik ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${menuHover ? 'lg:w-[268px]' : 'lg:w-[68px]'}`}
      >
        <div className="relative flex items-center justify-between px-4 py-5 border-b border-blue-800/40">
          <button
            type="button"
            onClick={() => {
              setActiveTab('anasayfa')
              setSidebarAcik(false)
            }}
            aria-label="Ana sayfaya dön"
            className="block w-full rounded-xl transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-yellow-300/80"
          >
            <img src={office?.logo_url || '/logo-text.png'} alt={office?.name || 'MUBiS ERP - Ana Sayfa'} className={`mx-auto object-contain drop-shadow-[0_6px_16px_rgba(0,0,0,0.4)] ${menuHover ? 'w-full max-w-[210px]' : 'w-full max-w-[210px] lg:max-w-[44px]'}`} />
          </button>
          <button onClick={() => setSidebarAcik(false)} className="absolute right-3 top-3 p-2 text-gray-400 hover:text-white lg:hidden">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-1">
          {gorunurTablar.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSidebarAcik(false) }}
              title={tab.label}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                  : 'text-blue-200/80 hover:bg-blue-800/40 hover:text-white'
              } ${menuHover ? '' : 'lg:justify-center lg:px-2'}`}
            >
              <tab.icon className="w-[18px] h-[18px] flex-shrink-0" />
              <span className={`flex-1 text-left whitespace-nowrap ${menuHover ? '' : 'lg:hidden'}`}>{tab.label}</span>
              {tab.id === 'notifications' && unreadCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </aside>
      )}

      {/* ==================== ICERIK ==================== */}
      <div className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6">
      {activeTab === 'anasayfa' ? (
        <div className="space-y-6">
          {/* Hos geldin */}
          <div className="relative overflow-hidden bg-gradient-to-r from-blue-700 to-blue-900 rounded-2xl p-6 lg:p-8 border border-blue-600/40">
            <div className="absolute right-0 top-0 w-64 h-full opacity-20 bg-[radial-gradient(circle_at_70%_40%,white,transparent_65%)]" />
            <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold text-white">
                  Hoş geldin, {displayName} 👋
                </h1>
                <p className="text-blue-200 mt-1.5">
                  {user?.company ? `${user.company} · ` : ''}
                  Bugün sizi bekleyen {(borcOzeti.kalanBorc > 0 ? 1 : 0) + (unreadCount || 0)} işlem var.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative group">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await logout()
                      } finally {
                        window.location.replace('/')
                      }
                    }}
                    aria-label="MUBİS kalemi"
                    title="Çıkış Yap"
                    className="relative rounded-2xl p-1 transition-transform duration-300 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-yellow-300/80"
                  >
                    <img
                      src="/mascot-kalem.png"
                      alt="MUBİS kalem asistanı"
                      className="h-20 w-auto object-contain drop-shadow-[0_8px_18px_rgba(0,0,0,0.45)] animate-float-soft"
                    />
                  </button>
                  <span
                    className="pointer-events-none absolute bottom-full right-0 z-[80] translate-y-1 rounded-xl rounded-br-sm bg-white px-3 py-2 text-xs font-bold text-blue-950 opacity-0 shadow-xl transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
                  >
                    Çıkış Yap
                    <span className="absolute -bottom-1 right-6 h-2 w-2 rotate-45 bg-white" />
                  </span>
                </div>
                {user?.earsiv && (
                  <button onClick={handleEarsiv} className="bg-orange-600 hover:bg-orange-500 text-white text-sm px-4 py-2.5 rounded-lg transition-colors">
                    📄 e-Arşiv Portal
                  </button>
                )}
                {user?.efatura && (
                  <button onClick={handleEfatura} className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2.5 rounded-lg transition-colors">
                    📋 e-Fatura İndir
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Yardimci program indirme banner */}
          <div className="bg-gradient-to-r from-emerald-900/50 to-teal-900/40 border border-emerald-500/30 rounded-2xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-600/30 flex items-center justify-center flex-shrink-0">
                <Monitor className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold">MUBiS Yardımcı Programı</h3>
                <p className="text-emerald-200/80 text-sm mt-0.5">
                  Vergi borcu, SGK borcu ve e-tebligat sorgulamaları için bilgisayarınıza kurmanız gerekiyor. Tek kurulum, sonrasında tek tıkla çalışır.
                </p>
              </div>
            </div>
            <a
              href="/downloads/mubis-gib-yardimci.exe"
              download
              className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              Programı İndir
            </a>
          </div>

          {/* Istatistik kartlari */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { deger: clientDocuments.length, etiket: 'Evrak', renk: 'from-blue-500 to-blue-700', icon: FolderOpen, hedef: 'documents' },
              { deger: makbuzlar.length, etiket: 'Makbuz', renk: 'from-emerald-500 to-emerald-700', icon: CreditCard, hedef: 'invoices' },
              { deger: myPayments.length, etiket: 'Ödeme', renk: 'from-orange-500 to-orange-700', icon: AlertTriangle, hedef: 'borc' },
              { deger: unreadCount || 0, etiket: 'Yeni Bildirim', renk: 'from-purple-500 to-purple-700', icon: Bell, hedef: 'notifications' },
            ].map(k => (
              <button
                key={k.etiket}
                onClick={() => setActiveTab(k.hedef)}
                className="bg-blue-900/40 hover:bg-blue-900/60 border border-blue-700/30 rounded-2xl p-5 text-left transition-colors group"
              >
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${k.renk} flex items-center justify-center mb-3`}>
                  <k.icon className="w-5 h-5 text-white" />
                </div>
                <div className="text-3xl font-bold text-white leading-none">{k.deger}</div>
                <div className="text-gray-400 text-sm mt-1.5">{k.etiket}</div>
                <div className="flex items-center gap-1 text-blue-400 text-xs mt-2 group-hover:text-blue-300">
                  Tümünü görüntüle <ArrowRight className="w-3 h-3" />
                </div>
              </button>
            ))}
          </div>

          {/* Kamu borclari ozeti */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={handleVergiBorcSorgula}
              disabled={vergiBorcuYukleniyor}
              className="bg-gradient-to-br from-red-900/40 to-red-800/20 hover:from-red-800/50 hover:to-red-700/30 border border-red-700/30 rounded-2xl p-5 text-left transition-colors disabled:opacity-60"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-red-600/30 flex items-center justify-center">
                  {vergiBorcuYukleniyor ? <RefreshCw className="w-5 h-5 text-red-400 animate-spin" /> : <FileText className="w-5 h-5 text-red-400" />}
                </div>
                <div>
                  <div className="text-gray-400 text-sm">Vergi Borcu</div>
                  <div className="text-2xl font-bold text-white">{formatMoney(vergiBorcu)} TL</div>
                </div>
              </div>
              {vergiBorcMesaj ? (
                <p className="text-red-300/80 text-xs line-clamp-2">{vergiBorcMesaj}</p>
              ) : (
                <p className="text-red-300/70 text-xs">GIB'den canli sorgulamak icin tiklayin. Guvenlik kodunu siz gireceksiniz.</p>
              )}
            </button>
            <button
              onClick={handleSgkBorcSorgula}
              disabled={sgkBorcuYukleniyor}
              className="bg-gradient-to-br from-orange-900/40 to-orange-800/20 hover:from-orange-800/50 hover:to-orange-700/30 border border-orange-700/30 rounded-2xl p-5 text-left transition-colors disabled:opacity-60"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-orange-600/30 flex items-center justify-center">
                  {sgkBorcuYukleniyor ? <RefreshCw className="w-5 h-5 text-orange-400 animate-spin" /> : <Users className="w-5 h-5 text-orange-400" />}
                </div>
                <div>
                  <div className="text-gray-400 text-sm">SGK Borcu</div>
                  <div className="text-2xl font-bold text-white">{formatMoney(sgkBorcu)} TL</div>
                </div>
              </div>
              {sgkBorcMesaj ? (
                <p className="text-orange-300/80 text-xs line-clamp-2">{sgkBorcMesaj}</p>
              ) : (
                <div className="text-orange-300/70 text-xs space-y-0.5">
                  <div>Sadece Borclar: {formatMoney(sgkSadeceBorclar)} TL</div>
                  <div>Gecikme Zammi (GZ): {formatMoney(sgkGecikmeZammi)} TL</div>
                  <div>e-Bildirge'den sorgulamak icin tiklayin.</div>
                </div>
              )}
            </button>
            <button
              onClick={handleTebligatSorgula}
              disabled={tebligatSorguluyor}
              className="bg-gradient-to-br from-blue-900/40 to-blue-800/20 hover:from-blue-800/50 hover:to-blue-700/30 border border-blue-700/30 rounded-2xl p-5 text-left transition-colors disabled:opacity-60"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-blue-600/30 flex items-center justify-center">
                  {tebligatSorguluyor ? <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" /> : <Bell className="w-5 h-5 text-blue-400" />}
                </div>
                <div>
                  <div className="text-gray-400 text-sm">e-Tebligat Sorgula</div>
                  <div className="text-lg font-semibold text-white">{tebligatSorguluyor ? 'Sorgulaniyor...' : 'Simdi Sorgula'}</div>
                </div>
              </div>
              {tebligatMesaj ? (
                <p className="text-blue-300/80 text-xs line-clamp-2">{tebligatMesaj}</p>
              ) : (
                <p className="text-blue-300/70 text-xs">Gelen e-tebligatlari kontrol edip evraklariniza ekler</p>
              )}
            </button>
          </div>

          {/* Vergi Takvimi */}
          <div className="bg-blue-900/30 border border-blue-700/30 rounded-2xl p-5 lg:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Calendar className="w-6 h-6 text-blue-400" />
                <div>
                  <h2 className="text-lg font-semibold text-white">Vergi Takvimi</h2>
                  <p className="text-gray-500 text-sm">Yaklaşan vergi ve bildirim tarihlerinizi aşağıda görebilirsiniz.</p>
                </div>
              </div>
              <button onClick={() => setActiveTab('notifications')} className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1">
                Tüm Takvimi Gör <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            {clientId && (
              <VergiTakvimi
                clientId={clientId}
                beyanDurumlari={clientDetail?.beyan_durumlari || {}}
                onBeyanDurumlariUpdate={(updated) => {
                  setClientDetail(prev => prev ? { ...prev, beyan_durumlari: updated } : prev)
                }}
              />
            )}
          </div>

          {/* Alt bolum */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Hizli islemler */}
            <div className="bg-blue-900/30 border border-blue-700/30 rounded-2xl p-5">
              <h3 className="flex items-center gap-2 text-white font-semibold mb-4">
                <LayoutGrid className="w-5 h-5 text-yellow-400" />
                Hızlı İşlemler
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { l: 'Evrak Yükle', i: Upload, t: 'upload', c: 'text-blue-400' },
                  { l: 'Beyannamelerim', i: FileSearch, t: 'beyannamelerim', c: 'text-emerald-400' },
                  { l: 'Borç Durumu', i: DollarSign, t: 'borc', c: 'text-orange-400' },
                  { l: 'Hesaplamalar', i: Calculator, t: 'hesaplamalar', c: 'text-purple-400' },
                  { l: 'e-Tebligat', i: Bell, action: handleTebligatSorgula, c: 'text-blue-400' },
                  { l: 'Program İndir', i: Download, href: '/downloads/mubis-gib-yardimci.exe', c: 'text-green-400' },
                ].map(h => (
                  h.href ? (
                    <a
                      key={h.l}
                      href={h.href}
                      download
                      className="bg-blue-950/40 hover:bg-blue-800/40 border border-blue-700/30 rounded-xl p-4 flex flex-col items-center gap-2 transition-colors"
                    >
                      <h.i className={`w-6 h-6 ${h.c}`} />
                      <span className="text-gray-300 text-xs text-center leading-tight">{h.l}</span>
                    </a>
                  ) : (
                    <button
                      key={h.l}
                      onClick={() => h.action ? h.action() : setActiveTab(h.t)}
                      disabled={h.action && tebligatSorguluyor}
                      className="bg-blue-950/40 hover:bg-blue-800/40 border border-blue-700/30 rounded-xl p-4 flex flex-col items-center gap-2 transition-colors disabled:opacity-60"
                    >
                      <h.i className={`w-6 h-6 ${h.c}`} />
                      <span className="text-gray-300 text-xs text-center leading-tight">{h.l}</span>
                    </button>
                  )
                ))}
              </div>
            </div>

            {/* Duyurular */}
            <div className="bg-blue-900/30 border border-blue-700/30 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="flex items-center gap-2 text-white font-semibold">
                  <Megaphone className="w-5 h-5 text-blue-400" />
                  Duyurular
                </h3>
                <button onClick={() => setActiveTab('notifications')} className="text-blue-400 hover:text-blue-300 text-xs">
                  Tümü
                </button>
              </div>
              <div className="space-y-3">
                {notificationsList.slice(0, 4).map(n => (
                  <div key={n.id} className="flex gap-3 pb-3 border-b border-blue-800/30 last:border-0 last:pb-0">
                    <span className="text-gray-500 text-[11px] whitespace-nowrap pt-0.5">
                       {formatDateTR(n.created_at)}
                    </span>
                    <p className="text-gray-300 text-sm leading-snug flex-1">{n.title || n.message}</p>
                  </div>
                ))}
                {notificationsList.length === 0 && (
                  <p className="text-gray-500 text-sm py-6 text-center">Henüz duyuru bulunmuyor.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Geri Butonu ve Baslik */}
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => setActiveTab('anasayfa')}
              className="flex items-center gap-2 bg-blue-800/30 hover:bg-blue-700/40 text-gray-300 hover:text-white px-4 py-2 rounded-lg text-sm transition-colors border border-blue-700/30"
            >
              <ChevronLeft className="w-4 h-4" /> Ana Sayfa
            </button>
            <h2 className="text-xl font-semibold text-white">
              {tabs.find(t => t.id === activeTab)?.label}
            </h2>
          </div>

      {/* ==================== MUHASEBE BORCU TAB ==================== */}
      {activeTab === 'borc' && (
        <div className="space-y-6">
          {/* Borc Ozeti Karti */}
          <div className="bg-gradient-to-br from-blue-900/50 to-blue-800/30 rounded-2xl p-6 border border-blue-700/30">
            <h3 className="text-xl font-semibold text-white flex items-center space-x-2 mb-6">
              <DollarSign className="w-6 h-6 text-yellow-400" />
              <span>Muhasebe Borc Durumunuz</span>
            </h3>

            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-blue-700/20">
                <span className="text-gray-400">Onceki Donem Borcu:</span>
                <span className="text-orange-400 font-semibold">{fmt(borcOzeti.oncekiDonem)} TL</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-blue-700/20">
                <span className="text-gray-400">Defter Tasdik Ucreti:</span>
                <span className="text-blue-400 font-semibold">{fmt(borcOzeti.defterTasdik)} TL</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-blue-700/20">
                <span className="text-gray-400">Aylik Ucret ({borcOzeti.gecenAy} ay x {fmt(borcOzeti.aylikUcret)}):</span>
                <span className="text-yellow-400 font-semibold">{fmt(borcOzeti.aylikToplam)} TL</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-blue-700/30">
                <span className="text-white font-medium">Toplam Borc:</span>
                <span className="text-white font-bold text-lg">{fmt(borcOzeti.toplamBorc)} TL</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-blue-700/20">
                <span className="text-green-400">Odenen:</span>
                <span className="text-green-400 font-semibold">-{fmt(borcOzeti.toplamOdeme)} TL</span>
              </div>
              {borcOzeti.alindiOdeme > 0 && (
                <div className="flex justify-between items-center py-2 border-b border-blue-700/20">
                  <span className="text-blue-400">Alinan Odeme (Borc Dusulumu Bekliyor):</span>
                  <span className="text-blue-400 font-semibold">{fmt(borcOzeti.alindiOdeme)} TL</span>
                </div>
              )}
              {borcOzeti.bekleyenOdeme > 0 && (
                <div className="flex justify-between items-center py-2 border-b border-blue-700/20">
                  <span className="text-yellow-400">Onay Bekleyen Odeme:</span>
                  <span className="text-yellow-400 font-semibold">{fmt(borcOzeti.bekleyenOdeme)} TL</span>
                </div>
              )}
              {borcOzeti.reddedilenOdeme > 0 && (
                <div className="flex justify-between items-center py-2 border-b border-blue-700/20">
                  <span className="text-red-400">Reddedilen Odeme:</span>
                  <span className="text-red-400 font-semibold">{fmt(borcOzeti.reddedilenOdeme)} TL</span>
                </div>
              )}
              <div className="flex justify-between items-center py-3 bg-blue-900/30 rounded-xl px-4 mt-2">
                <span className="text-white font-bold text-lg">KALAN BORC:</span>
                <span className={`font-bold text-2xl ${borcOzeti.kalanBorc > 0 ? 'text-red-400' : 'text-green-400'}`}>{fmt(borcOzeti.kalanBorc)} TL</span>
              </div>
              {borcOzeti.sonOdeme && (
                 <p className="text-gray-500 text-sm text-center mt-2">Son Odeme: {formatDateTR(borcOzeti.sonOdeme)}</p>
              )}
            </div>

            {/* Odeme Butonlari */}
            {borcOzeti.kalanBorc > 0 && (
              <div className="flex flex-col sm:flex-row gap-3 mt-6">
                <button onClick={() => setShowBankaModal(true)}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-6 rounded-xl font-semibold flex items-center justify-center space-x-2 hover:from-blue-500 hover:to-blue-600 transition-all">
                  <Building2 className="w-5 h-5" /><span>EFT / Havale ile Ode</span>
                </button>
                {activeProvider !== 'eft' && (
                  <button onClick={() => { setPaymentAmount(String(borcOzeti.kalanBorc)); setShowKrediKartiModal(true) }}
                    className="flex-1 bg-gradient-to-r from-yellow-500 to-yellow-600 text-blue-950 py-3 px-6 rounded-xl font-semibold flex items-center justify-center space-x-2 hover:from-yellow-400 hover:to-yellow-500 transition-all">
                    <CreditCard className="w-5 h-5" /><span>{activeProvider === 'odeal' ? 'Odeal ile Ode' : 'Kredi Karti ile Ode'}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Odeme Gecmisi */}
          {myPayments.length > 0 && (
            <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
              <h3 className="text-lg font-semibold text-white mb-4">Odeme Gecmisi</h3>
              <div className="space-y-2">
                {myPayments.map(p => (
                  <div key={p.id} className="flex items-center justify-between bg-blue-900/20 rounded-xl p-3">
                    <div className="flex-1">
                       <p className="text-white text-sm font-medium">{formatDateTR(p.odeme_tarihi)}</p>
                      <p className="text-gray-500 text-xs">{p.aciklama || (p.odeme_tipi === 'eft' ? 'EFT/Havale' : p.odeme_tipi === 'kredi_karti' ? 'Kredi Karti' : 'Nakit')}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`font-bold text-sm ${p.durum === 'reddedildi' ? 'text-red-400 line-through' : p.durum === 'alindi' ? 'text-blue-400' : p.durum === 'bekliyor' ? 'text-yellow-400' : 'text-green-400'}`}>{fmt(p.tutar)} TL</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        p.durum === 'uygulandi' ? 'bg-green-500/20 text-green-400' :
                        p.durum === 'onaylandi' ? 'bg-green-500/20 text-green-400' :
                        p.durum === 'alindi' ? 'bg-blue-500/20 text-blue-400' :
                        p.durum === 'reddedildi' ? 'bg-red-500/20 text-red-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {p.durum === 'uygulandi' ? 'Borctan Dusuldu' : p.durum === 'onaylandi' ? 'Onaylandi' : p.durum === 'alindi' ? 'Odeme Alindi' : p.durum === 'reddedildi' ? 'Reddedildi' : 'Onay Bekliyor'}
                      </span>
                      <button onClick={() => openReceipt(p, clientDetail || user, { name: 'MUBiS ERP' })} title="Makbuz Goster" className="p-1.5 bg-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/30">
                        <Receipt className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Banka Bilgileri Modal */}
          {showBankaModal && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowBankaModal(false)}>
              <div className="bg-blue-950 rounded-2xl p-8 max-w-md w-full border border-blue-700/30" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-white mb-6 flex items-center space-x-2">
                  <Building2 className="w-6 h-6 text-blue-400" /><span>EFT / Havale Bilgileri</span>
                </h3>
                <div className="space-y-4">
                  <div className="bg-blue-900/30 rounded-xl p-4">
                    <p className="text-gray-400 text-xs mb-1">Banka</p>
                    <p className="text-white font-medium">{bankInfo.banka}</p>
                  </div>
                  <div className="bg-blue-900/30 rounded-xl p-4">
                    <p className="text-gray-400 text-xs mb-1">Hesap Sahibi</p>
                    <p className="text-white font-medium">{bankInfo.hesapSahibi}</p>
                  </div>
                  <div className="bg-blue-900/30 rounded-xl p-4">
                    <p className="text-gray-400 text-xs mb-1">IBAN</p>
                    <div className="flex items-center justify-between">
                      <p className="text-yellow-400 font-mono font-bold text-lg">{bankInfo.iban}</p>
                      <button onClick={handleCopyIban} className={`ml-2 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1 transition-colors ${ibanCopied ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'}`}>
                        <Copy className="w-3.5 h-3.5" /><span>{ibanCopied ? 'Kopyalandi!' : 'Kopyala'}</span>
                      </button>
                    </div>
                  </div>
                  <div className="bg-blue-900/30 rounded-xl p-4">
                    <p className="text-gray-400 text-xs mb-1">Aciklama</p>
                    <p className="text-white font-medium">{user?.name || user?.company || ''} Muhasebe Ucreti</p>
                  </div>
                </div>
                <button onClick={() => setShowBankaModal(false)} className="mt-6 w-full bg-blue-700 text-white py-2.5 rounded-lg font-medium hover:bg-blue-600 transition-colors">Kapat</button>
              </div>
            </div>
          )}

          {/* Kredi Karti Modal */}
          {showKrediKartiModal && activeProvider !== 'eft' && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowKrediKartiModal(false)}>
              <div className="bg-blue-950 rounded-2xl p-8 max-w-md w-full border border-blue-700/30" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-white mb-6 flex items-center space-x-2">
                  <CreditCard className="w-6 h-6 text-yellow-400" /><span>{activeProvider === 'odeal' ? 'Odeal ile Odeme' : 'Kredi Karti ile Odeme'}</span>
                </h3>

                <div className="mb-6">
                  <label className="block text-gray-400 text-sm mb-1">Odeme Tutari (TL)</label>
                  <input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-3 px-4 text-white text-xl font-bold text-center focus:outline-none focus:border-yellow-400" />
                </div>

                <div className="bg-blue-900/20 rounded-xl p-4 mb-6 text-sm text-gray-300 space-y-2">
                  <p className="flex items-start gap-2">
                    <span className="text-yellow-400">1.</span>
                    <span>Guvenli odeme sayfamizda kredi karti bilgilerinizi girin.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="text-yellow-400">2.</span>
                    <span>3D Secure dogrulamayi tamamlayin.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="text-yellow-400">3.</span>
                    <span>Odeme otomatik olarak kaydedilecektir.</span>
                  </p>
                </div>

                <button onClick={handleKrediKartiOde} disabled={paymentLoading}
                  className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 text-blue-950 py-3 rounded-xl font-bold flex items-center justify-center space-x-2 hover:from-yellow-400 hover:to-yellow-500 transition-all disabled:opacity-50 text-lg">
                  <CreditCard className="w-5 h-5" />
                  <span>{paymentLoading ? 'Odeme Sayfasi Aciliyor...' : `${fmt(Number(paymentAmount) || 0)} TL Ode`}</span>
                </button>

                <p className="text-gray-500 text-xs text-center mt-3">Odemeniz 3D Secure ile guvenli sekilde islenecektir.</p>

                <button onClick={() => { setShowKrediKartiModal(false); setPaymentAmount('') }}
                  className="mt-3 w-full bg-gray-700/50 text-gray-400 py-2 rounded-lg text-sm hover:bg-gray-700/70 transition-colors">Iptal</button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'beyannamelerim' && (
        <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30">
          <h3 className="text-xl font-semibold text-white mb-6">📑 Beyannamelerim / Tahakkuklarim</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <select value={beyanFilter.type} onChange={(e) => setBeyanFilter({ ...beyanFilter, type: e.target.value })} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400">
              <option value="">Tum Beyan Tipleri</option>
              {BEYAN_TYPE_OPTIONS.map(bt => <option key={bt.id} value={bt.id}>{bt.name}</option>)}
            </select>
            <select value={beyanFilter.year} onChange={(e) => setBeyanFilter({ ...beyanFilter, year: e.target.value })} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400">
              <option value="">Tum Yillar</option>
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={beyanFilter.month} onChange={(e) => setBeyanFilter({ ...beyanFilter, month: e.target.value })} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400">
              <option value="">Tum Aylar</option>
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select value={beyanFilter.docType} onChange={(e) => setBeyanFilter({ ...beyanFilter, docType: e.target.value })} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400">
              <option value="">Tum Dokumanlar</option>
              <option value="beyanname">Beyanname</option>
              <option value="tahakkuk">Tahakkuk</option>
            </select>
          </div>
          {filteredBeyanDocuments.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-gray-400 text-sm border-b border-blue-800/30">
                    <th className="pb-3">Donem</th>
                    <th className="pb-3">Tur</th>
                    <th className="pb-3">Dokuman</th>
                    <th className="pb-3">Dosya</th>
                    <th className="pb-3">Tutar</th>
                    <th className="pb-3">Durum</th>
                    <th className="pb-3">Tarih</th>
                    <th className="pb-3">Islem</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBeyanDocuments.map((doc) => (
                    <tr key={doc.id} className="border-b border-blue-800/20 text-gray-300">
                      <td className="py-4">{doc.year} {MONTHS[doc.month]}</td>
                      <td className="py-4">{BEYAN_TYPE_OPTIONS.find(bt => bt.id === doc.type)?.name || doc.type}</td>
                      <td className="py-4"><span className={`px-2 py-1 rounded text-xs ${doc.docType === 'tahakkuk' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>{doc.docType === 'tahakkuk' ? 'Tahakkuk' : 'Beyanname'}</span></td>
                      <td className="py-4 text-sm">{doc.name || '-'}</td>
                      <td className="py-4 text-green-400 text-sm font-medium">{Number(doc.tutar) > 0 ? `${Number(doc.tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL` : '-'}</td>
                      <td className="py-4">{doc.status || '-'}</td>
                       <td className="py-4">{doc.date ? formatDateTR(doc.date) : '-'}</td>
                      <td className="py-4">
                        <div className="flex space-x-2">
                          <a href={doc.url} target="_blank" rel="noreferrer" className="p-1.5 bg-blue-500/20 rounded-lg text-blue-400"><Eye className="w-4 h-4" /></a>
                          <a href={doc.url} download className="p-1.5 bg-green-500/20 rounded-lg text-green-400"><Download className="w-4 h-4" /></a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">Henüz paylasilan beyanname veya tahakkuk bulunmuyor.</p>
          )}
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
            <h3 className="text-xl font-semibold text-white">📁 Evraklarim</h3>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-gray-400 text-sm">{selectedDocIds.size} / {clientDocuments.length} secili</span>
              <button
                onClick={selectAllDocs}
                className="text-xs px-3 py-1.5 rounded-lg bg-blue-900/30 text-blue-400 hover:bg-blue-800/30 border border-blue-700/30"
              >
                Tumunu Sec
              </button>
              <button
                onClick={clearDocSelection}
                className="text-xs px-3 py-1.5 rounded-lg bg-blue-900/30 text-gray-400 hover:bg-blue-800/30 border border-blue-700/30"
              >
                Secimi Kaldir
              </button>
              <button
                onClick={openShareModal}
                disabled={selectedDocIds.size === 0}
                className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 font-semibold flex items-center gap-1 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                Secili Evraklari Gonder
              </button>
            </div>
          </div>

          {clientDocumentsLoading ? (
            <div className="text-center py-8 text-gray-400">Yukleniyor...</div>
          ) : !documentTree || documentTree.children.length === 0 ? (
            <div className="text-center py-8 text-gray-400">Henuz evrak bulunmuyor.</div>
          ) : (
            <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
              {renderDocumentTree(documentTree.children, 0)}
            </div>
          )}
        </div>
      )}

      {activeTab === 'invoices' && (
        <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-white">Faturalarım / Makbuzlarım</h3>
            <span className="text-sm text-gray-400">{makbuzlar.length} kayıt</span>
          </div>
          {makbuzlar.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Receipt className="w-12 h-12 mx-auto mb-3 text-gray-600" />
              <p>Henüz yüklenmiş makbuz bulunmuyor.</p>
              <p className="text-xs text-gray-500 mt-2">Mali müşaviriniz serbest meslek makbuzu yüklediğinde burada listelenir.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {makbuzlar.map((m) => (
                <div key={m.id} className="bg-blue-900/20 rounded-xl p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center space-x-4">
                      <div className="p-3 rounded-xl bg-green-500/10">
                        <Receipt className="w-6 h-6 text-green-400" />
                      </div>
                      <div>
                        <div className="text-white font-medium">{m.name}</div>
                        <div className="text-gray-400 text-sm">
                          {m.donem ? `${m.donem} • ` : ''}{m.uploaded_at ? `Yükleme: ${formatDateTR(m.uploaded_at)}` : ''}{m.size ? ` • ${m.size}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      {m.tutar != null && m.tutar !== '' && (
                        <div className="text-white font-bold text-lg">{Number(m.tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</div>
                      )}
                      <a href={m.url} target="_blank" rel="noreferrer" title="Görüntüle" className="p-2 bg-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/30">
                        <Eye className="w-4 h-4" />
                      </a>
                      <a href={m.url} download title="İndir" className="p-2 bg-green-500/20 rounded-lg text-green-400 hover:bg-green-500/30">
                        <Download className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'messages' && (
        <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30">
          <h3 className="text-xl font-semibold text-white mb-6">💬 Mesajlar</h3>
          <div className="flex space-x-3 mb-6">
            <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="Mesajinizi yazin..." className="flex-1 bg-blue-900/40 border border-blue-700/50 rounded-xl py-3 px-4 text-white" />
            <button onClick={handleSendMessage} disabled={messageSending} className="btn-gold px-4 py-2 disabled:opacity-50">
              <Send className="w-5 h-5" />
            </button>
          </div>
          {messagesLoading && messages.length === 0 ? (
            <div className="text-center py-10 text-gray-400">Mesajlar yukleniyor...</div>
          ) : messages.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-600" />
              <p>Henuz mesaj yok. Mali musavirinize ilk mesaji siz gonderin.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.type === 'sent' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl p-4 ${msg.type === 'sent' ? 'bg-yellow-500/20 border border-yellow-500/30 ml-12' : 'bg-blue-900/40 border mr-12'} ${msg.type === 'received' ? (msg.priority === 'acil' ? 'border-red-500/50' : msg.priority === 'onemli' ? 'border-yellow-500/50' : 'border-blue-700/30') : ''}`}>
                    <div className="flex justify-between gap-4 mb-1">
                      <span className="text-xs text-gray-400">{msg.from}</span>
                      <span className="text-xs text-gray-500">{msg.date} {msg.time}</span>
                    </div>
                    <p className="text-gray-200 text-sm whitespace-pre-line">{msg.text}</p>
                    {(msg.dueDate || (msg.actionLabel && msg.actionUrl)) && (
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {msg.dueDate && (
                          <span className="text-[11px] bg-red-500/15 text-red-300 px-2 py-0.5 rounded-full">Son tarih: {formatDateTR(msg.dueDate)}</span>
                        )}
                        {msg.actionLabel && msg.actionUrl && (
                          <a href={msg.actionUrl} target="_blank" rel="noreferrer" className="text-[11px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full hover:bg-blue-500/30">
                            {msg.actionLabel}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="space-y-6">
          {/* Vergi Takvimi */}
          <VergiTakvimi
            clientId={clientId}
            beyanDurumlari={clientDetail?.beyan_durumlari || {}}
            onBeyanDurumlariUpdate={(updated) => {
              setClientDetail(prev => prev ? { ...prev, beyan_durumlari: updated } : prev)
            }}
          />

          <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-white">🔔 Bildirimlerim</h3>
              {unreadCount > 0 && (
                <button onClick={handleMarkAllAsRead} className="text-sm text-blue-400 hover:text-blue-300">
                  Tumunu okundu isaretle
                </button>
              )}
            </div>
          {notificationsLoading ? (
            <div className="text-center py-8 text-gray-400">Yukleniyor...</div>
          ) : notificationsList.length === 0 ? (
            <div className="text-center py-8 text-gray-400">Henuz bildirim bulunmuyor.</div>
          ) : (
            <div className="space-y-4">
              {notificationsList.map((n) => (
                <div
                  key={n.id}
                  onClick={() => !n.is_read && handleMarkAsRead(n.id)}
                  className={`flex items-start space-x-4 p-4 rounded-xl cursor-pointer transition-all ${n.is_read ? 'bg-blue-900/10 opacity-70' : 'bg-blue-900/20 hover:bg-blue-800/30'}`}
                >
                  <div className={`p-2 rounded-lg ${n.type === 'warning' ? 'bg-yellow-500/20' : n.type === 'success' ? 'bg-green-500/20' : 'bg-blue-500/20'}`}>
                    {n.type === 'warning' ? <AlertTriangle className="w-5 h-5 text-yellow-400" /> : n.type === 'success' ? <CheckCircle className="w-5 h-5 text-green-400" /> : <Bell className="w-5 h-5 text-blue-400" />}
                  </div>
                  <div className="flex-1">
                    <p className={`${n.is_read ? 'text-gray-400' : 'text-gray-200'} font-medium text-sm`}>{n.title}</p>
                    <p className="text-gray-400 text-sm mt-0.5">{n.message}</p>
                    <span className="text-gray-500 text-xs">{formatDate(n.created_at)}</span>
                  </div>
                  {!n.is_read && <div className="w-2 h-2 rounded-full bg-blue-500 mt-2"></div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {activeTab === 'kira-stopaj' && (
        <ClientKiraStopaj />
      )}

      {activeTab === 'upload' && (
        <div className="space-y-6">
          <div className="bg-blue-950/30 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-xl font-semibold text-white mb-6">📤 Belge Yükle</h3>
            
            {/* Belge Türü Seçimi */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
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
              <ZReportManager clientId={clientId} clientName={clientDetail?.name || clientDetail?.company || user?.name || ''} clientType={clientDetail?.client_type || user?.client_type} />
            )}
            
            {uploadDocType === 'expense' && (
              <ExpenseUploader clientId={clientId} clientName={clientDetail?.name || clientDetail?.company || user?.name || ''} />
            )}
            
            {!uploadDocType && (
              <div className="text-center py-8 text-gray-400">
                Yukarıdan belge türü seçin
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'personel' && clientId && (
        <IzinTakip clientId={clientId} clientInfo={clientDetail || user} />
      )}
      {activeTab === 'personel' && !clientId && (
        <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30 text-center">
          <p className="text-gray-400">Personel bilgileri yukleniyor...</p>
        </div>
      )}

      {activeTab === 'hesaplamalar' && (
        <PratikHesaplamalar />
      )}

      {activeTab === 'zrapor' && (
        <ZReportManager clientId={clientId} clientName={clientDetail?.name || clientDetail?.company || user?.name || ''} clientType={clientDetail?.client_type || user?.client_type} />
      )}

      {activeTab === 'profile' && (
        <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-white">👤 Profilim</h3>
            <button
              onClick={async () => {
                if (showProfileEdit) {
                  // Kaydet modu
                  if (!clientId) {
                    alert('Musteri ID bulunamadi, kaydedilemedi.')
                    return
                  }
                  setProfileSaving(true)
                  try {
                    const updatePayload = {
                      name: editProfile.name,
                      company: editProfile.company,
                      email: editProfile.email,
                      phone: editProfile.phone,
                      city: editProfile.city,
                      vkn: editProfile.vkn,
                      tax_office: editProfile.taxOffice,
                      earsiv: editProfile.earsiv,
                      efatura: editProfile.efatura,
                      esmm: editProfile.esmm,
                    }
                    // e-Devlet sifresi: yalniz doluysa guncelle (bos birakilirsa mevcut korunur)
                    if (editProfile.edevletPass && editProfile.edevletPass.trim()) {
                      updatePayload.edevlet_pass = editProfile.edevletPass.trim()
                    }
                    const { error } = await supabase
                      .from('clients')
                      .update(updatePayload)
                      .eq('id', clientId)
                    if (error) throw error
                    // Yerel state'i guncelle
                    setClientDetail(prev => prev ? {
                      ...prev,
                      name: editProfile.name,
                      company: editProfile.company,
                      email: editProfile.email,
                      phone: editProfile.phone,
                      city: editProfile.city,
                      vkn: editProfile.vkn,
                      tax_office: editProfile.taxOffice,
                      taxOffice: editProfile.taxOffice,
                      earsiv: editProfile.earsiv,
                      efatura: editProfile.efatura,
                      esmm: editProfile.esmm,
                      ...(updatePayload.edevlet_pass ? { edevlet_pass: updatePayload.edevlet_pass } : {}),
                    } : prev)
                    setShowProfileEdit(false)
                    alert('Profil guncellendi.')
                  } catch (err) {
                    console.error('Profil kaydetme hatasi:', err)
                    alert('Profil kaydedilemedi: ' + (err.message || 'Bilinmeyen hata'))
                  } finally {
                    setProfileSaving(false)
                  }
                } else {
                  // Duzenle modu - mevcut degerleri forma yukle
                  setEditProfile({
                    name: clientDetail?.name || user?.name || '',
                    company: clientDetail?.company || user?.company || '',
                    email: clientDetail?.email || user?.email || '',
                    phone: clientDetail?.phone || user?.phone || '',
                    city: clientDetail?.city || user?.city || '',
                    vkn: clientDetail?.vkn || clientDetail?.tc || user?.vkn || user?.tc || '',
                    taxOffice: clientDetail?.taxOffice || user?.taxOffice || '',
                    earsiv: clientDetail?.earsiv || user?.earsiv || false,
                    efatura: clientDetail?.efatura || user?.efatura || false,
                    esmm: clientDetail?.esmm || user?.esmm || false,
                    edevletPass: '', // guvenlik: mevcut sifre formsa yuklenmez, degistirilmek istenirse yenisi yazilir
                  })
                  setShowEdevletSifre(false)
                  setShowProfileEdit(true)
                }
              }}
              disabled={profileSaving}
              className={`text-sm px-4 py-2 rounded-lg ${showProfileEdit ? 'btn-primary' : 'btn-gold'} disabled:opacity-50`}
            >
              {showProfileEdit ? (
                <>{profileSaving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}Kaydet</>
              ) : (
                <><Settings className="w-4 h-4 mr-2" />Duzenle</>
              )}
            </button>
          </div>
          {showProfileEdit ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-400 text-sm mb-1">Ad Soyad</label>
                  <input type="text" value={editProfile.name || ''} onChange={e => setEditProfile(p => ({ ...p, name: e.target.value }))} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-1">Sirket</label>
                  <input type="text" value={editProfile.company || ''} onChange={e => setEditProfile(p => ({ ...p, company: e.target.value }))} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-1">E-Posta</label>
                  <input type="email" value={editProfile.email || ''} onChange={e => setEditProfile(p => ({ ...p, email: e.target.value }))} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-1">Telefon</label>
                  <input type="tel" value={editProfile.phone || ''} onChange={e => setEditProfile(p => ({ ...p, phone: e.target.value }))} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-1">Sehir</label>
                  <input type="text" value={editProfile.city || ''} onChange={e => setEditProfile(p => ({ ...p, city: e.target.value }))} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-400 text-sm mb-1">{user?.type === 'company' ? 'VKN' : 'TC'}</label>
                  <input type="text" value={editProfile.vkn || ''} onChange={e => setEditProfile(p => ({ ...p, vkn: e.target.value }))} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-1">Vergi Dairesi</label>
                  <input type="text" value={editProfile.taxOffice || ''} onChange={e => setEditProfile(p => ({ ...p, taxOffice: e.target.value }))} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-1">
                    e-Devlet Şifresi
                    <span className="text-gray-500 text-xs ml-2">(SGK ödemesi ve e-Tebligatlar için — yalnız siz görürsünüz)</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showEdevletSifre ? 'text' : 'password'}
                      value={editProfile.edevletPass || ''}
                      onChange={e => setEditProfile(p => ({ ...p, edevletPass: e.target.value }))}
                      placeholder={clientDetail?.edevlet_pass ? '•••••••• (kayıtlı — değiştirmek için yazın)' : 'e-Devlet şifreniz'}
                      autoComplete="new-password"
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 pr-10 text-white text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEdevletSifre(v => !v)}
                      title={showEdevletSifre ? 'Gizle' : 'Göster'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white transition-colors"
                    >
                      {showEdevletSifre ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-gray-300 text-sm">
                    <input type="checkbox" checked={editProfile.earsiv || false} onChange={e => setEditProfile(p => ({ ...p, earsiv: e.target.checked }))} className="w-4 h-4 rounded" /> e-Arsiv
                  </label>
                  <label className="flex items-center gap-2 text-gray-300 text-sm">
                    <input type="checkbox" checked={editProfile.efatura || false} onChange={e => setEditProfile(p => ({ ...p, efatura: e.target.checked }))} className="w-4 h-4 rounded" /> e-Fatura
                  </label>
                  <label className="flex items-center gap-2 text-gray-300 text-sm">
                    <input type="checkbox" checked={editProfile.esmm || false} onChange={e => setEditProfile(p => ({ ...p, esmm: e.target.checked }))} className="w-4 h-4 rounded" /> ESMM
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { icon: User, label: 'Ad Soyad', value: clientDetail?.name || user?.name || profile.name },
                { icon: Building2, label: 'Sirket', value: clientDetail?.company || user?.company || profile.company },
                { icon: Mail, label: 'E-Posta', value: clientDetail?.email || user?.email || profile.email },
                { icon: Phone, label: 'Telefon', value: clientDetail?.phone || user?.phone || profile.phone },
                { icon: MapPin, label: 'Sehir', value: clientDetail?.city || user?.city || profile.address },
                { icon: CreditCard, label: user?.type === 'company' ? 'VKN' : 'TC', value: clientDetail?.vkn || clientDetail?.tc || user?.vkn || user?.tc || profile.vkn },
                { icon: Building2, label: 'Vergi Dairesi', value: clientDetail?.tax_office || clientDetail?.taxOffice || user?.tax_office || user?.taxOffice || profile.taxOffice },
                { icon: CheckCircle, label: 'e-Arsiv', value: (clientDetail?.earsiv || user?.earsiv) ? '✅ Evet' : '❌ Hayir' },
                { icon: FileText, label: 'e-Fatura', value: (clientDetail?.efatura || user?.efatura) ? '✅ Evet' : '❌ Hayir' },
                { icon: Receipt, label: 'ESMM', value: (clientDetail?.esmm || user?.esmm) ? '✅ Evet' : '❌ Hayir' },
              ].map((item, i) => (
                <div key={i} className="bg-blue-900/20 rounded-xl p-4">
                  <div className="flex items-center space-x-3 mb-2"><item.icon className="w-4 h-4 text-gray-500" /><span className="text-gray-400 text-sm">{item.label}</span></div>
                  <p className="text-white font-medium">{item.value || '-'}</p>
                </div>
              ))}
              {/* e-Devlet Sifresi: maskeli, goz simgesiyle goster/gizle */}
              <div className="bg-blue-900/20 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-3">
                    <KeyRound className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-400 text-sm">e-Devlet Şifresi</span>
                  </div>
                  {(clientDetail?.edevlet_pass || user?.edevlet_pass) && (
                    <button
                      type="button"
                      onClick={() => setShowEdevletSifre(v => !v)}
                      title={showEdevletSifre ? 'Gizle' : 'Göster'}
                      className="p-1 text-gray-400 hover:text-white transition-colors"
                    >
                      {showEdevletSifre ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                </div>
                <p className="text-white font-medium">
                  {(clientDetail?.edevlet_pass || user?.edevlet_pass)
                    ? (showEdevletSifre ? (clientDetail?.edevlet_pass || user?.edevlet_pass) : '••••••••')
                    : 'Kayıtlı değil — Düzenle\'den ekleyin'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-blue-950 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-blue-700/50 shadow-2xl">
            <div className="sticky top-0 bg-blue-950 border-b border-blue-700/50 p-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Evrak Paylas</h2>
                <p className="text-gray-400 text-sm">{selectedDocIds.size} adet evrak gonderilecek.</p>
              </div>
              <button onClick={closeShareModal} className="text-gray-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-blue-800/30">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex gap-2 p-1 bg-blue-900/30 rounded-lg">
                <button
                  onClick={() => setShareForm(prev => ({ ...prev, channel: 'email' }))}
                  className={`flex-1 py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2 ${shareForm.channel === 'email' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  <Mail className="w-4 h-4" /> Mail
                </button>
                <button
                  onClick={() => setShareForm(prev => ({ ...prev, channel: 'whatsapp' }))}
                  className={`flex-1 py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2 ${shareForm.channel === 'whatsapp' ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  <MessageSquare className="w-4 h-4" /> WhatsApp
                </button>
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-1">Alici Adi Soyadi</label>
                <input
                  type="text"
                  value={shareForm.recipientName}
                  onChange={e => setShareForm(prev => ({ ...prev, recipientName: e.target.value }))}
                  placeholder="Ornegin: Ahmet Yilmaz"
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                />
              </div>

              {shareForm.channel === 'email' ? (
                <div>
                  <label className="block text-gray-400 text-sm mb-1">Alici E-posta</label>
                  <input
                    type="email"
                    value={shareForm.recipientEmail}
                    onChange={e => setShareForm(prev => ({ ...prev, recipientEmail: e.target.value }))}
                    placeholder="bankaci@ornek.com"
                    className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-gray-400 text-sm mb-1">Alici Telefon (WhatsApp)</label>
                  <input
                    type="tel"
                    value={shareForm.recipientPhone}
                    onChange={e => setShareForm(prev => ({ ...prev, recipientPhone: e.target.value }))}
                    placeholder="Ornegin: 0551 084 90 29"
                    className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                  />
                </div>
              )}

              <div>
                <label className="block text-gray-400 text-sm mb-1">Ust Yazi / Mesaj</label>
                <textarea
                  value={shareForm.message}
                  onChange={e => setShareForm(prev => ({ ...prev, message: e.target.value }))}
                  rows={5}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                />
                <p className="text-gray-500 text-xs mt-1">"Sayin [Alici Adi]" hitabi otomatik eklenir.</p>
              </div>

              {shareResult && (
                <div className={`p-3 rounded-xl text-sm flex items-center gap-2 ${shareResult.ok ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                  {shareResult.ok ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  {shareResult.text}
                </div>
              )}

              <button
                onClick={handleShareSend}
                disabled={shareLoading}
                className="w-full btn-gold py-3 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {shareLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Gonderiliyor...</span>
                  </>
                ) : (
                  <>
                    {shareForm.channel === 'email' ? <Mail className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                    <span>{shareForm.channel === 'email' ? 'Mail ile Gonder' : 'WhatsApp ile Gonder'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
      </div>

      {kiraRenewal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80] p-4">
          <div className="bg-blue-950 rounded-2xl max-w-md w-full border border-blue-700/50 shadow-2xl p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2.5 bg-yellow-500/15 rounded-xl">
                <Bell className="w-6 h-6 text-yellow-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Kira Sözleşmeniz Sona Eriyor</h2>
                <p className="text-gray-400 text-sm mt-0.5">
                  Kira bitiş tarihiniz <b className="text-white">{kiraRenewal.bitis_tarihi ? new Date(kiraRenewal.bitis_tarihi).toLocaleDateString('tr-TR') : '-'}</b>. Yeni net kira tutarını bildirin veya artış olmadığını belirtin.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {!kiraPostponeMode ? (
                <>
                  <div>
                    <label className="block text-gray-400 text-sm mb-1.5">Yeni Net Kira (TL)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={kiraRenewalValue}
                      onChange={e => setKiraRenewalValue(e.target.value)}
                      placeholder="Örn: 32.500,00"
                      disabled={kiraRenewalLoading}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-yellow-400 disabled:opacity-50"
                    />
                    <p className="text-gray-500 text-xs mt-1.5">Stopaj varsa brüt karşılığı otomatik hesaplanır.</p>
                  </div>

                  {kiraRenewalResult && (
                    <div className={`rounded-xl p-3 text-sm ${kiraRenewalResult.ok ? 'bg-green-500/15 text-green-300 border border-green-500/30' : 'bg-red-500/15 text-red-300 border border-red-500/30'}`}>
                      {kiraRenewalResult.text}
                    </div>
                  )}

                  <div className="flex flex-col gap-2 pt-1">
                    <button
                      onClick={() => handleKiraRenewalSubmit(false)}
                      disabled={kiraRenewalLoading || !kiraRenewalValue}
                      className="w-full py-2.5 rounded-lg text-sm font-semibold bg-yellow-500 text-blue-950 hover:bg-yellow-400 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {kiraRenewalLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Yeni Net Kirayı Bildir
                    </button>
                    <button
                      onClick={() => handleKiraRenewalSubmit(true)}
                      disabled={kiraRenewalLoading}
                      className="w-full py-2.5 rounded-lg text-sm font-medium text-gray-300 bg-blue-900/40 hover:bg-blue-800/50 disabled:opacity-50"
                    >
                      Kira Artışı Olmadı, 1 Yıl Uzat
                    </button>
                    <button
                      onClick={() => setKiraPostponeMode(true)}
                      disabled={kiraRenewalLoading}
                      className="w-full py-2.5 rounded-lg text-sm font-medium text-blue-300 border border-blue-700/50 hover:bg-blue-800/30 disabled:opacity-50"
                    >
                      Daha Belirli Değil
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-white text-sm font-medium">Ne zaman tekrar hatırlatalım?</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: '1 hafta', gun: 7 },
                      { label: '15 gün', gun: 15 },
                      { label: '1 ay', gun: 30 }
                    ].map(({ label, gun }) => (
                      <button
                        key={gun}
                        onClick={() => handleKiraPostpone(gun)}
                        disabled={kiraRenewalLoading}
                        className="py-2.5 rounded-lg text-sm font-medium bg-blue-900/40 text-white hover:bg-yellow-500 hover:text-blue-950 disabled:opacity-50"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setKiraPostponeMode(false)}
                    disabled={kiraRenewalLoading}
                    className="w-full py-2 rounded-lg text-xs text-gray-400 hover:text-white"
                  >
                    ← Geri dön
                  </button>

                  {kiraRenewalResult && (
                    <div className={`rounded-xl p-3 text-sm ${kiraRenewalResult.ok ? 'bg-green-500/15 text-green-300 border border-green-500/30' : 'bg-red-500/15 text-red-300 border border-red-500/30'}`}>
                      {kiraRenewalResult.text}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
    </div>
  )
}