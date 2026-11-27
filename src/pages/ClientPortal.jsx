import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getClients } from '../services/clientService'
import {
  FileText, Download, Eye, EyeOff, Bell, CheckCircle, Loader2,
  AlertTriangle, Upload, FolderOpen, MessageSquare,
  User, Settings, Send, Receipt, CreditCard, Calendar,
  Phone, Mail, MapPin, Building2, Save, DollarSign, Copy, ExternalLink,
  FileSearch, ChevronRight, ChevronDown, Folder, X, RefreshCw, Users, ChevronLeft, Camera, Calculator,
  Home as HomeIcon, Megaphone, Mic, Menu as MenuIcon, Headphones, LayoutGrid, ArrowRight, KeyRound, Monitor, Inbox, BookOpen, LogOut, ScanLine, Landmark
} from 'lucide-react'
import { etebligatlariGetir, etebligatlariSorgula, sgkEtebligatlariSorgula, etebligatBelgesiAl, tebligatPdfGetir, yeniTebligatlariTemizle, okunduAyarla, kullaniciOkunduSeti } from '../services/etebligatService'
import EFaturaKesim from './EFaturaKesim'
import CariHesapModul from '../components/CariHesapModul'
import FileUploader from '../components/FileUploader'
import { getAccountingFee, getPayments, hesaplaBorcOzeti, BANKA_BILGILERI, getBankInfo, getBankAccounts, getActivePaymentProvider, openReceipt } from '../services/paymentService'
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
import HavaSaatKarti from '../components/HavaSaatKarti'
import NamazVakitleri from '../components/NamazVakitleri'
import RadioUstBant from '../components/RadioUstBant'
import YouTubeMuzik from '../components/YouTubeMuzik'
import SpotifyUstBant from '../components/SpotifyUstBant'
import { dosyaIndir } from '../utils/dosyaIndir'
import { fetchDocument, getViewUrl } from '../utils/storageUrl'
import { createUnicodePdf } from '../utils/unicodePdf'
import { formatMoney } from '../utils/numberFormat'
import IzinTakip from './IzinTakip'
import PratikHesaplamalar from './PratikHesaplamalar'
import { getPendingRenewals, replyRenewal, postponeRenewal } from '../services/kiraYenilemeService'
import { getBeyanDocuments } from '../services/beyanDocumentService'
import VergiTakvimi from '../components/VergiTakvimi'
import ZReportManager from '../components/ZReportManager'
import ExpenseUploader from '../components/ExpenseUploader'
import ClientKiraStopaj from './ClientKiraStopaj'
import KdvDokumTab from '../components/KdvDokumTab'
import BolumRehberi from '../components/BolumRehberi'
import PortalTaramalarim from '../components/PortalTaramalarim'
import FisElleEkleTablosu, { elleBosSatir } from '../components/FisElleEkleTablosu'
import { musteriManuelFisEkle } from '../services/taramaService'

import FisDokumTablosu from '../components/FisDokumTablosu'
import { fisKaydiMi } from '../utils/fisDetay'
import { faturalariGetir, faturaGruplari, faturaTuruAdi, faturaTurEslesir, faturaTurEtiketi, belgeTuruAdi, kdvDetaylariGetir, fisKdvDetayUret } from '../services/efaturaService'
import { kdvDurumuGetir } from '../services/kdvDurumService'
import { krediKartiHasilatGetir, dvsSorgula } from '../services/dvsSorguService'
import { ublAyikla, faturaHtmlOlustur, gomuluXsltGorunumu } from '../utils/faturaGorunum'
import FisModal from '../components/FisModal'
import { gibBorcSorgula, sgkBorcSorgula, borcSonucuKaydet, borcSonucuGetir } from '../utils/gibOdemeHelper'
import { YARDIMCI_EXE_URL } from '../config/indirmeLinkleri'
// YardimciSurumUyari App.jsx'te global render ediliyor; burada import gerekmez

const AYLAR_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

// Tebligat tarihini ("18.09.2026" / "2026-09-18") siralama degerine cevirir
function tebligatTarihDeger(metin) {
  const s = String(metin || '').trim()
  // Saat bilgisi de dikkate alinir (ayni gun icinde dogru siralama icin)
  let m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime()
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime()
  const d = new Date(s)
  return isNaN(d.getTime()) ? 0 : d.getTime()
}

// file_url → gerçek belge mi? (liste çıktısı değil) — oturum boyu önbellek
const hazirOnbellek = new Map()

export default function ClientPortal({ embedded = false, initialTab = null, ownerClientId = null }) {
  const [searchParams] = useSearchParams()
  const { user, office, logout } = useAuth()
  const [activeTab, setActiveTab] = useState(initialTab || searchParams.get('tab') || 'anasayfa')
  const [sidebarAcik, setSidebarAcik] = useState(false)
  const [menuHover, setMenuHover] = useState(false)
  const [uploadDocType, setUploadDocType] = useState(null)
  // Elle giriş (Belge Yükle sekmesi) — müşteri Z raporu/gider fişi girer, admin onaylar
  const [portalElleAcik, setPortalElleAcik] = useState(false)
  const [portalElleTip, setPortalElleTip] = useState('z')
  const [portalElleSatirlar, setPortalElleSatirlar] = useState([elleBosSatir('z')])
  const [portalElleKaydediyor, setPortalElleKaydediyor] = useState(false)
  const [portalElleHata, setPortalElleHata] = useState('')
  const [portalElleMesaj, setPortalElleMesaj] = useState('')
  const [portalTaramaTazele, setPortalTaramaTazele] = useState(0)

  // Elle giriş kaydı → tarama_belgeler (admin onayı bekler)
  const portalElleKaydet = async () => {
    if (!clientId) return
    setPortalElleKaydediyor(true)
    setPortalElleHata('')
    setPortalElleMesaj('')
    try {
      const adet = await musteriManuelFisEkle({ clientId, tip: portalElleTip, satirlar: portalElleSatirlar })
      setPortalElleMesaj(`${adet} kayıt onaya gönderildi — muhasebeci onayladıktan sonra faturalara işlenir.`)
      setPortalElleSatirlar([elleBosSatir(portalElleTip)])
      setPortalTaramaTazele(x => x + 1)
    } catch (e) {
      setPortalElleHata('Kaydedilemedi: ' + (e?.message || e))
    } finally {
      setPortalElleKaydediyor(false)
    }
  }
  const [showProfileEdit, setShowProfileEdit] = useState(false)
  const [showEdevletSifre, setShowEdevletSifre] = useState(false)
  // 2.7.543: Namaz vakitleri/imsakiye gostersin mi? (varsayilan kapali, Ayarlar'dan acilir)
  const [namazGoster, setNamazGoster] = useState(() => localStorage.getItem('musteri_namaz_v1') === '1')
  const namazDegistir = acik => {
    setNamazGoster(acik)
    try { localStorage.setItem('musteri_namaz_v1', acik ? '1' : '0') } catch (e) { /* yoksay */ }
  }
  // 2.7.546: musteri ust bandi muzik rozetleri (varsayilan kapali, Ayarlar'dan acilir)
  const [radyoGoster, setRadyoGoster] = useState(() => localStorage.getItem('musteri_radio_v1') === '1')
  const radyoDegistir = acik => {
    setRadyoGoster(acik)
    try { localStorage.setItem('musteri_radio_v1', acik ? '1' : '0') } catch (e) { /* yoksay */ }
  }
  const [ytMuzikGoster, setYtMuzikGoster] = useState(() => localStorage.getItem('musteri_ytmusic_v1') === '1')
  const ytMuzikDegistir = acik => {
    setYtMuzikGoster(acik)
    try { localStorage.setItem('musteri_ytmusic_v1', acik ? '1' : '0') } catch (e) { /* yoksay */ }
  }
  const [spotifyGoster, setSpotifyGoster] = useState(() => localStorage.getItem('musteri_spotify_v1') === '1')
  const spotifyDegistir = acik => {
    setSpotifyGoster(acik)
    try { localStorage.setItem('musteri_spotify_v1', acik ? '1' : '0') } catch (e) { /* yoksay */ }
  }
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
  const [paytrIframeUrl, setPaytrIframeUrl] = useState(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [ibanCopied, setIbanCopied] = useState(false)
  const [bankAccounts, setBankAccounts] = useState([])
  const [kopyalanan, setKopyalanan] = useState('')
  const [cardForm, setCardForm] = useState({ cardOwner: '', cardNumber: '', expiryMonth: '', expiryYear: '', cvv: '' })
  const [bankInfo, setBankInfo] = useState(BANKA_BILGILERI)
  const [activeProvider, setActiveProvider] = useState('paytr')

  const [kiraRenewal, setKiraRenewal] = useState(null)
  const [kiraRenewalValue, setKiraRenewalValue] = useState('')
  const [kiraRenewalLoading, setKiraRenewalLoading] = useState(false)
  const [kiraRenewalResult, setKiraRenewalResult] = useState(null)
  const [kiraPostponeMode, setKiraPostponeMode] = useState(false)

  // UUID auth id'sini clientId sanma — admin/personelin client kaydi yoktur;
  // UUID'yi clients.id'ye (integer) karsi filtrelemek PostgREST hatasi verir.
  // 2.7.623: ownerClientId verildiyse (baska mukellefin dosyasi) dogrudan o kullanilir.
  const [clientId, setClientId] = useState(ownerClientId || user?.clientId || (typeof user?.id === 'number' ? user.id : null))
  const [clientDetail, setClientDetail] = useState(null)
  const [beyanDocuments, setBeyanDocuments] = useState([])
  const [beyanFilter, setBeyanFilter] = useState({ type: '', year: new Date().getFullYear(), month: '', docType: '' })
  const [notificationsList, setNotificationsList] = useState([])
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  // e-Defter duyurulari musteri ekraninda listelenmez (baslik/icerikte
  // "edefter/e-defter" gecen bildirimler suzulur; kayitlar silinmez)
  const duyuruListesi = notificationsList.filter(n =>
    !/e-?\s?defter/i.test(`${n.title || ''} ${n.message || ''}`))

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
  const [vergiDetay, setVergiDetay] = useState({ vadesiGecmis: 0, vadesiGelmemis: 0 })
  const [sgkBorcu, setSgkBorcu] = useState(0)
  const [sgkSadeceBorclar, setSgkSadeceBorclar] = useState(0)
  const [sgkGecikmeZammi, setSgkGecikmeZammi] = useState(0)
  const [vergiBorcuYukleniyor, setVergiBorcuYukleniyor] = useState(false)
  const [vergiBorcMesaj, setVergiBorcMesaj] = useState('')
  const [sgkBorcuYukleniyor, setSgkBorcuYukleniyor] = useState(false)
  const [sgkBorcMesaj, setSgkBorcMesaj] = useState('')
  const [tebligatSorguluyor, setTebligatSorguluyor] = useState(false)
  const [tebligatMesaj, setTebligatMesaj] = useState('')

  // 2.8.325: Kamu borclari (GIB + SGK) kalem detaylari — "Kamu Borclari"
  // ekraninda borc listesi olarak gosterilir (e-Tebligat ekrani gibi).
  const [borcKalemler, setBorcKalemler] = useState({ vergi: [], sgk: [] })
  const [borcSorguTs, setBorcSorguTs] = useState({ vergi: null, sgk: null })
  const [borcDetayKaynak, setBorcDetayKaynak] = useState('hepsi') // hepsi | vergi | sgk

  // 2.8.326: MUBiS ERP odeme kayitlari (Kamu Borclari ekrani - Muhasebe bolumu)

  // e-Fatura / e-Arsiv faturalari (Faturalarim sekmesi)
  const [faturalar, setFaturalar] = useState([])
  const [kdvDurum, setKdvDurum] = useState(null)
  const [kdvDurumYukleniyor, setKdvDurumYukleniyor] = useState(false)
  const [kdvDetayAc, setKdvDetayAc] = useState(false)
  // Coklu KDV'li faturalarin oran bazli satirlari (fatura_id -> [{oran, matrah, kdv}])
  const [kdvDetaylar, setKdvDetaylar] = useState({})
  // Uygulama ici fatura goruntuleyici: { f, src, tip: 'html'|'pdf'|'xml', yukleniyor }
  const [gosterilenFatura, setGosterilenFatura] = useState(null)
  // UTTS fis goruntuleyici
  const [fisGoster, setFisGoster] = useState(null)
  const [faturaFiltre, setFaturaFiltre] = useState({ yon: '', tur: '', faturaTuru: '', yil: String(new Date().getFullYear()), ay: '' })
  const [krediKarti, setKrediKarti] = useState(null)
  const [krediKartiYukleniyor, setKrediKartiYukleniyor] = useState(false)

  // Onceki sorgu sonuclarini geri yukle: yeni sorgulamaya kadar kartlarda kalsin
  // 1) localStorage'dan aninda yukle, 2) buluttaki (Supabase) daha yeni kayit varsa uzerine yaz
  useEffect(() => {
    if (!clientId) return
    let iptal = false
    const uygulaVergi = (v) => {
      setVergiBorcu(v.toplam || 0)
      setVergiBorcMesaj(v.mesaj || '')
      let vadesiGecmis = Number(v.vadesiGecmis) || 0
      let vadesiGelmemis = Number(v.vadesiGelmemis) || 0
      let kalemler = Array.isArray(v.kalemler) ? v.kalemler : []
      // Eski kayitlar (vadesi/kalem yok): mesajdan parse et
      if (v.mesaj && vadesiGecmis === 0 && vadesiGelmemis === 0 && kalemler.length === 0) {
        const m = String(v.mesaj)
        const g = m.match(/Vadesi gecmis:\s*([\d.,]+)/i)
        const g2 = m.match(/Vadesi gelmemis:\s*([\d.,]+)/i)
        if (g) vadesiGecmis = Number(g[1].replace(/\./g, '').replace(',', '.')) || 0
        if (g2) vadesiGelmemis = Number(g2[1].replace(/\./g, '').replace(',', '.')) || 0
        if (kalemler.length === 0 && (vadesiGecmis > 0 || vadesiGelmemis > 0)) {
          if (vadesiGecmis > 0) kalemler.push({ donem: '', tur: 'Vadesi Geçmiş', toplam: vadesiGecmis })
          if (vadesiGelmemis > 0) kalemler.push({ donem: '', tur: 'Vadesi Gelmemiş', toplam: vadesiGelmemis })
        }
      }
      setVergiDetay({ vadesiGecmis, vadesiGelmemis })
      if (kalemler.length) setBorcKalemler(prev => ({ ...prev, vergi: kalemler }))
      if (v.ts) setBorcSorguTs(prev => ({ ...prev, vergi: v.ts }))
    }
    const uygulaSgk = (s) => {
      setSgkBorcu(s.toplam || 0)
      setSgkSadeceBorclar(s.sadeceBorclar || 0)
      setSgkGecikmeZammi(s.gz || 0)
      setSgkBorcMesaj(s.mesaj || '')
      let kalemler = Array.isArray(s.kalemler) ? s.kalemler : []
      // Eski kayitlar (kalem yok): mesajdan ozet satiri uret
      if (kalemler.length === 0 && s.mesaj) {
        const m = String(s.mesaj)
        const sadece = m.match(/Sadece Bor[a-zçğıöşü]* Toplami:\s*([\d.,]+)/i)
        const gz = m.match(/GZ:\s*([\d.,]+)/i)
        const sv = sadece ? Number(sadece[1].replace(/\./g, '').replace(',', '.')) || 0 : 0
        const gv = gz ? Number(gz[1].replace(/\./g, '').replace(',', '.')) || 0 : 0
        if (sv > 0 || gv > 0) kalemler.push({ donem: '', tur: 'Toplam (kalem detayı alınamadı)', borc: sv, gz: gv, toplam: (s.toplam || sv + gv) })
      }
      if (kalemler.length) setBorcKalemler(prev => ({ ...prev, sgk: kalemler }))
      if (s.ts) setBorcSorguTs(prev => ({ ...prev, sgk: s.ts }))
    }
    let vLocal = null
    let sLocal = null
    try {
      vLocal = JSON.parse(localStorage.getItem(`mubis_vergiBorc_${clientId}`) || 'null')
      if (vLocal) uygulaVergi(vLocal)
    } catch (e) { /* yoksay */ }
    try {
      sLocal = JSON.parse(localStorage.getItem(`mubis_sgkBorc_${clientId}`) || 'null')
      if (sLocal) uygulaSgk(sLocal)
    } catch (e) { /* yoksay */ }
    ;(async () => {
      try {
        const [v, s] = await Promise.all([
          borcSonucuGetir(clientId, 'vergi'),
          borcSonucuGetir(clientId, 'sgk')
        ])
        if (iptal) return
        if (v) {
          const vBulutTs = v.sorgu_ts ? new Date(v.sorgu_ts).getTime() : 0
          if (!vLocal || vBulutTs >= (vLocal.ts || 0)) uygulaVergi({ toplam: v.toplam, mesaj: v.mesaj, vadesiGecmis: v.detay?.vadesiGecmis, vadesiGelmemis: v.detay?.vadesiGelmemis, kalemler: v.detay?.kalemler, ts: vBulutTs })
        } else if (vLocal) {
          // Tablo yeni duzeltildi / onceki yazimlar basarisizdi: yerel veriyi buluta tasi
          borcSonucuKaydet(clientId, 'vergi', {
            toplam: vLocal.toplam,
            mesaj: vLocal.mesaj || '',
            detay: { vadesiGecmis: vLocal.vadesiGecmis || 0, vadesiGelmemis: vLocal.vadesiGelmemis || 0 }
          })
        }
        if (s) {
          const sBulutTs = s.sorgu_ts ? new Date(s.sorgu_ts).getTime() : 0
          if (!sLocal || sBulutTs >= (sLocal.ts || 0)) {
            uygulaSgk({ toplam: s.toplam, sadeceBorclar: s.detay?.sadeceBorclar, gz: s.detay?.gz, mesaj: s.mesaj, kalemler: s.detay?.kalemler, ts: sBulutTs })
          }
        } else if (sLocal) {
          borcSonucuKaydet(clientId, 'sgk', {
            toplam: sLocal.toplam,
            mesaj: sLocal.mesaj || '',
            detay: { sadeceBorclar: sLocal.sadeceBorclar || 0, gz: sLocal.gz || 0 }
          })
        }
      } catch (e) { /* tablo yok / RLS engeli - localStorage yeterli */ }
    })()
    return () => { iptal = true }
  }, [clientId])

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
    gecici_vergi: 'Geçici Vergi',
    kurumlar_vergi: 'Kurumlar Vergisi',
    gelir_vergi: 'Gelir Vergisi',
    edefter: 'e-Defter',
    muhtasar_3aylik: 'Muhtasar (3 Aylık)',
    esmm: 'ESMM'
  }

  const DOCUMENT_CATEGORIES = {
    beyanname: 'Beyanname',
    tahakkuk: 'Tahakkuk',
    mizan: 'Mizan',
    sigorta_tahakkuk: 'Sigorta Tahakkuk',
    hizmet_listesi: 'Hizmet Listesi',
    bordro: 'Bordro',
    gelir_beyani: 'Gelir Beyanı',
    gecici_vergi: 'Geçici Vergi',
    vergi_levhasi: 'Vergi Levhası',
    mali_evraklar: 'Mali Evraklar'
  }

  useEffect(() => {
    const resolveClientId = async () => {
      // 2.7.623: baska mukellefin dosyasi aciliyorsa arama yapma
      if (ownerClientId) { setClientId(ownerClientId); return }
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
    setVergiBorcMesaj('Vergi borcu sorgulaniyor')
    try {
      const res = await gibBorcSorgula(clientId)
      if (!res.ok) {
        if (res.reason === 'gib-sifre-eksik') {
          setVergiBorcMesaj('Profilinizde GIB kullanici kodu/parola eksik. Ayarlar bolumunden ekleyin.')
        } else if (res.reason === 'kurulu-degil') {
          setVergiBorcMesaj('Yardimci program calismiyor. Lutfen MUBiS Yardimci Programi kurun/baslatin.')
        } else {
          setVergiBorcMesaj('Sorgulama tamamlanamadi: ' + (res.reason || 'Bilinmeyen hata'))
        }
        return
      }
      setVergiBorcu(res.toplam || res.borc || 0)
      setVergiBorcMesaj(res.not || '')
      setVergiDetay({ vadesiGecmis: res.vadesiGecmis || 0, vadesiGelmemis: res.vadesiGelmemis || 0 })
      const vergiKalemler = Array.isArray(res.kalemler) ? res.kalemler : []
      setBorcKalemler(prev => ({ ...prev, vergi: vergiKalemler }))
      setBorcSorguTs(prev => ({ ...prev, vergi: Date.now() }))
      try {
        localStorage.setItem(`mubis_vergiBorc_${clientId}`, JSON.stringify({
          toplam: res.toplam || res.borc || 0,
          mesaj: res.not || '',
          vadesiGecmis: res.vadesiGecmis || 0,
          vadesiGelmemis: res.vadesiGelmemis || 0,
          kalemler: vergiKalemler,
          ts: Date.now()
        }))
      } catch (e) { /* yoksay */ }
      borcSonucuKaydet(clientId, 'vergi', {
        toplam: res.toplam || res.borc || 0,
        mesaj: res.not || '',
        detay: { vadesiGecmis: res.vadesiGecmis || 0, vadesiGelmemis: res.vadesiGelmemis || 0, kalemler: vergiKalemler }
      })
    } catch (err) {
      setVergiBorcMesaj('Hata: ' + (err.message || 'Bilinmeyen hata'))
    } finally {
      setVergiBorcuYukleniyor(false)
    }
  }

  const handleSgkBorcSorgula = async () => {
    if (!clientId) return
    setSgkBorcuYukleniyor(true)
    setSgkBorcMesaj('SGK borcu sorgulaniyor')
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
      const sgkKalemler = Array.isArray(res.kalemler) ? res.kalemler : []
      setBorcKalemler(prev => ({ ...prev, sgk: sgkKalemler }))
      setBorcSorguTs(prev => ({ ...prev, sgk: Date.now() }))
      try {
        localStorage.setItem(`mubis_sgkBorc_${clientId}`, JSON.stringify({
          toplam: res.toplam || 0,
          sadeceBorclar: res.sadeceBorclar || 0,
          gz: res.gecikmeZammi || 0,
          mesaj: res.not || '',
          kalemler: sgkKalemler,
          ts: Date.now()
        }))
      } catch (e) { /* yoksay */ }
      borcSonucuKaydet(clientId, 'sgk', {
        toplam: res.toplam || 0,
        mesaj: res.not || '',
        detay: { sadeceBorclar: res.sadeceBorclar || 0, gz: res.gecikmeZammi || 0, kalemler: sgkKalemler }
      })
    } catch (err) {
      setSgkBorcMesaj('Hata: ' + (err.message || 'Bilinmeyen hata'))
    } finally {
      setSgkBorcuYukleniyor(false)
    }
  }

  // kaynak: 'vergi' | 'sgk' | 'tumu' — onClick'ten gelen event objesine karsi
  // guvenli: string degilse 'tumu' kabul edilir.
  // GIB sorgusu: dijital.gib.gov.tr DVS portali — Vergi Dairesi kullanici adi +
  // parola (dvs_username/dvs_password). SGK sorgusu: e-Devlet — TC Kimlik No +
  // e-Devlet sifresi. Iki akis da PDF'leri otomatik indirip MUBiS'e yukler.
  const handleTebligatSorgula = async (kaynak) => {
    if (!clientId) return
    const k = (typeof kaynak === 'string' && kaynak) ? kaynak : 'tumu'
    setTebligatSorguluyor(true)
    try {
      let mesajlar = []

      // ---- GIB (Vergi Dairesi DVS) sorgusu ----
      if (k === 'vergi' || k === 'tumu') {
        setTebligatMesaj('GİB (Vergi Dairesi) e-Tebligat sorgulaniyor — acilan pencerede Vergi Dairesi guvenlik kodunu girin.')
        const res = await etebligatlariSorgula({ id: clientId })
        if (!res.ok) {
          if (res.reason === 'dvs-sifre-eksik') {
            mesajlar.push('GİB: Profilinizde Vergi Dairesi kullanici kodu/sifresi (DVS) eksik. Ayarlar bolumunden ekleyin.')
          } else {
            mesajlar.push('GİB: ' + (res.error || res.reason || 'sorgulanamadi'))
          }
        } else {
          mesajlar.push(`GİB: ${res.toplam || 0} tebligat bulundu (${res.okunmamis || 0} okunmamis${res.indirilenSayi != null ? `, ${res.indirilenSayi} PDF indirildi` : ''}).`)
        }
      }

      // ---- SGK sorgusu (e-Devlet: TC + e-Devlet sifresi) ----
      if (k === 'sgk' || k === 'tumu') {
        setTebligatMesaj('SGK e-Tebligat sorgulaniyor — acilan pencerede e-Devlet guvenlik kodunu girip giris yapin.')
        const res = await sgkEtebligatlariSorgula({ id: clientId })
        if (!res.ok) {
          if (res.reason === 'edevlet-bilgi-eksik') {
            mesajlar.push('SGK: Profilinizde TC Kimlik No ve e-Devlet sifresi eksik. Ayarlar bolumunden ekleyin.')
          } else if (res.reason === 'sgk-belge-yok') {
            mesajlar.push('SGK: ' + (res.not || 'Yeni belge bulunamadi.'))
          } else {
            mesajlar.push('SGK: ' + (res.error || res.reason || 'sorgulanamadi'))
          }
        } else {
          mesajlar.push(`SGK: ${res.toplam || 0} tebligat indirildi.`)
        }
      }

      setTebligatMesaj(mesajlar.join(' ') || 'Sorgulama tamamlandi.')
      // Listeyi tazele (ana ekran ozeti + tebligatlarim sekmesi)
      if (clientDetail?.id || clientId) {
        etebligatlariGetir(clientDetail?.id || clientId).then(s => setDvsTebligatlar(s || [])).catch(() => {})
      }
      await loadClientDetail()
    } catch (err) {
      const msg = err.message || 'Bilinmeyen hata'
      if (msg.includes('Yardimci programa ulasilamadi') || msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
        setTebligatMesaj('Yardimci program calismiyor. Lutfen once MUBiS Yardimci Programi kurun/baslatin.')
      } else {
        setTebligatMesaj('Sorgulama tamamlanamadi: ' + msg)
      }
    } finally {
      setTebligatSorguluyor(false)
    }
  }

  // e-Fatura / e-Arsiv faturalari
  const faturalariYukle = async () => {
    if (!clientId) return
    try {
      const liste = await faturalariGetir(clientId)
      setFaturalar(liste)
      const birlestir = (h) => {
        const b = { ...h }
        for (const f of liste) {
          const detay = fisKdvDetayUret(f)
          if (detay && !b[f.id]?.length) b[f.id] = detay
        }
        setKdvDetaylar(b)
      }
      kdvDetaylariGetir(liste.map(f => f.id)).then(birlestir).catch(() => birlestir({}))
    } catch (e) { /* tablo yok / RLS - yoksay */ }
  }

  // 2.7.575: Fatura Güncelle Talebi rozeti — musteri talebi admin Mesaj Merkezi'ne dusar;
  // sorgulama admin tarafinda "Fatura Güncelle" düğmesiyle yapilir.
  // 2.8.4: talep ayrica fatura_cron_talepler kuyruguna yazilir — VPS sunucusu
  // 60 sn icinde yakalar, sorgulayip MUBiS'e yukler; bitince musteriyi bildirir.
  const [faturaTalepGonderildi, setFaturaTalepGonderildi] = useState(false)
  const [faturaTalepDurum, setFaturaTalepDurum] = useState('') // '' | bekliyor | calisiyor | tamam | hata

  const faturaGuncelleTalebi = async () => {
    if (!clientId || faturaTalepDurum === 'bekliyor' || faturaTalepDurum === 'calisiyor') return
    const simdi = new Date()
    // 2.8.15: talep MUSTERININ SECTIGI DONEME gider — Faturalarim sayfasinda
    // secili yil/ay (faturaFiltre); ay secili degilse bugunun ayi kullanilir.
    // Eski kod hep bugunun ayini yaziyordu (Ekim seciliyken 11/2026 gidiyordu).
    const seciliYil = Number(faturaFiltre.yil) || simdi.getFullYear()
    const seciliAy = Number(faturaFiltre.ay) || (simdi.getMonth() + 1)
    const donem = `${String(seciliAy).padStart(2, '0')}/${seciliYil}`
    const ad = clientDetail?.name || clientDetail?.company || 'Müşteri'
    try {
      await replyFromClient({
        clientId,
        message: `${ad} müşteri fatura güncelleme talebi gönderdi (dönem: ${donem}).`,
        clientName: ad
      })
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const r = await fetch('/api/fatura-cron', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
          body: JSON.stringify({ tip: 'talep', yil: seciliYil, ay: seciliAy })
        })
        const j = await r.json()
        if (j.ok) setFaturaTalepDurum(j.durum || 'bekliyor')
      } catch { /* kuyruk yazilamadi — mesaj yine de gitmistir */ }
      setFaturaTalepGonderildi(true)
      setTimeout(() => setFaturaTalepGonderildi(false), 6000)
    } catch (e) {
      alert('Talep gönderilemedi: ' + (e?.message || ''))
    }
  }

  // 2.8.4: aktif talep durumu — invoices sekmesinde 20 sn'de bir yoklanir
  useEffect(() => {
    if (activeTab !== 'invoices' || !clientId) { setFaturaTalepDurum(''); return }
    let iptal = false
    const kontrol = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const r = await fetch('/api/fatura-cron', {
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
        })
        const j = await r.json()
        if (!iptal && j.ok) {
          const aktif = (j.talepler || []).find(t => t.durum === 'bekliyor' || t.durum === 'calisiyor')
          setFaturaTalepDurum(aktif ? aktif.durum : (j.talepler?.[0]?.durum === 'tamam' ? '' : ''))
        }
      } catch { /* yoksay */ }
    }
    kontrol()
    const iv = setInterval(kontrol, 20000)
    return () => { iptal = true; clearInterval(iv) }
  }, [activeTab, clientId])

  const krediKartiSorgula = async () => {
    if (!clientId || !faturaFiltre.yil || !faturaFiltre.ay || krediKartiYukleniyor) return
    setKrediKartiYukleniyor(true)
    try {
      await dvsSorgula({ clientId, yil: Number(faturaFiltre.yil), ay: Number(faturaFiltre.ay), tur: 'pos' })
      const d = await krediKartiHasilatGetir({ clientId, yil: Number(faturaFiltre.yil), ay: Number(faturaFiltre.ay) })
      setKrediKarti(d)
    } catch (e) {
      alert(e?.message || 'Kredi kartı sorgulanamadı')
    } finally {
      setKrediKartiYukleniyor(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'invoices' && clientId) faturalariYukle()
  }, [activeTab, clientId])

  // Kredi karti hasilati (faturalarim sekmesinde gosterilir)
  useEffect(() => {
    if (!clientId || !faturaFiltre.yil || !faturaFiltre.ay) {
      setKrediKarti(null)
      return
    }
    let iptal = false
    krediKartiHasilatGetir({ clientId, yil: Number(faturaFiltre.yil), ay: Number(faturaFiltre.ay) })
      .then(d => { if (!iptal) setKrediKarti(d) })
      .catch(() => { if (!iptal) setKrediKarti(null) })
    return () => { iptal = true }
  }, [clientId, faturaFiltre.yil, faturaFiltre.ay])

  // KDV Durumu karti — musteri ana ekrani (önceki ayin KDV1 beyani + fatura KDV'leri)
  useEffect(() => {
    if (!clientDetail?.id) return
    let iptal = false
    setKdvDurumYukleniyor(true)
    kdvDurumuGetir(clientDetail)
      .then(s => { if (!iptal) setKdvDurum(s) })
      .catch(() => { if (!iptal) setKdvDurum(null) })
      .finally(() => { if (!iptal) setKdvDurumYukleniyor(false) })
    return () => { iptal = true }
  }, [clientDetail?.id])

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

    // Ortak beyan evrak servisiyle herhangi bir donem icin kayitli
    // beyanname/tahakkuk varsa listele. Tekil `_url` alanlarini da
    // getBeyanList/getTahakkukList otomatik birlestirir.
    const listedBaseKeys = new Set()
    Object.keys(durumlar).forEach(key => {
      if (!key.includes('_') || key.endsWith('_documents')) return
      const parts = key.split('_')
      if (parts.length < 3 || Number.isNaN(Number(parts[0])) || Number.isNaN(Number(parts[1]))) return
      const year = Number(parts[0])
      const month = Number(parts[1])
      const typeEndIndex = parts.findIndex((p, i) => i >= 2 && ['beyan', 'tahakkuk', 'bordro', 'analiz', 'tutar', 'tarih', 'documents'].includes(p))
      const typeParts = parts.slice(2, typeEndIndex === -1 ? parts.length : typeEndIndex)
      if (typeParts.length === 0) return
      const type = typeParts.join('_')
      const baseKey = `${year}_${month}_${type}`
      if (listedBaseKeys.has(baseKey)) return
      listedBaseKeys.add(baseKey)

      const { beyannameList, tahakkukList } = getBeyanDocuments(durumlar, year, month, type)

      const allowBeyan = isDocumentTypeAllowed(docPermissions, 'beyanname', type)
      const allowTahakkuk = isDocumentTypeAllowed(docPermissions, 'tahakkuk', type)
      if (!allowBeyan && !allowTahakkuk) return

      if (allowBeyan) {
        beyannameList.forEach((b, idx) => {
          if (!b?.url) return
          addDoc({
            id: `${baseKey}_beyan_${idx}`,
            year,
            month,
            type,
            docType: 'beyanname',
            url: b.url,
            name: b.name || `Beyanname ${idx + 1}`,
            status: durumlar[baseKey] || '',
            date: b.uploadedAt || ''
          })
        })
      }

      if (allowTahakkuk) {
        tahakkukList.forEach((t, idx) => {
          if (!t?.url) return
          addDoc({
            id: `${baseKey}_tahakkuk_${idx}`,
            year,
            month,
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
    })

    // _documents icindeki sigorta tahakkuklari (SGK Evraklar modali)
    Object.keys(durumlar).forEach(key => {
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
    { id: 'gecici_vergi', name: 'Geçici Vergi' },
    { id: 'kurumlar_vergi', name: 'Kurumlar Vergisi' },
    { id: 'gelir_vergi', name: 'Gelir Vergisi' },
    { id: 'edefter', name: 'e-Defter' },
    { id: 'esmm', name: 'ESMM' },
  ]

  const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

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
      const [info, liste] = await Promise.all([
        getBankInfo().catch(() => null),
        getBankAccounts().catch(() => null)
      ])
      if (info) setBankInfo(info)
      const hesaplar = (Array.isArray(liste) ? liste : []).filter(b => b && (b.banka || b.hesapSahibi || b.iban))
      setBankAccounts(hesaplar.length ? hesaplar : (info && (info.banka || info.iban) ? [info] : []))
    } catch (err) {
      console.error('Banka bilgisi yukleme hatasi:', err)
    }
  }

  const notifications = [
    { id: 1, message: 'Temmuz ayi tahakkukunuz hazir', date: '2026-07-12', type: 'info' },
    { id: 2, message: 'Geçici vergi beyannameniz onaylandı', date: '2026-06-20', type: 'success' },
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
        const waSonuc = await sendShareDocumentsViaWhatsApp({
          phone: shareForm.recipientPhone.trim(),
          message: waMessage,
          settings: shareSettings
        })
        if (waSonuc?.ok === false) {
          throw new Error(waSonuc?.not || waSonuc?.reason || 'WhatsApp gonderilemedi')
        }
        const waWeb = getWhatsAppChannel(shareSettings) === 'web'
        if (waWeb) {
          await logWhatsAppWebSend({
            clientId,
            target: shareForm.recipientPhone.trim(),
            status: waSonuc?.otomatik ? 'sent' : 'pending'
          })
        }
        setShareResult({
          ok: true,
          text: waWeb
            ? (waSonuc?.otomatik ? 'WhatsApp mesaji gonderildi.' : 'WhatsApp mesaji hazirlandi; gonderimi kontrol edin.')
            : 'WhatsApp mesaji gonderildi.'
        })
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

  // E-hizmet bayraklarina gore fatura kesim sekmeleri (admin e-hizmet ayarlari)
  // Embedded (admin kendi Beyannamelerim) modunda admin'in kendi client kaydi
  // email ile eslenir; kayitta esmm/earsiv/efatura aktifse sekmeler acilir.
  const [kendiClient, setKendiClient] = useState(null)
  useEffect(() => {
    if (!embedded || clientDetail?.id || !user?.email) return
    let iptal = false
    ;(async () => {
      try {
        // Minimal kolon sorgusu (getClients tum tabloyu cektigi icin kullanilmaz)
        const { data, error } = await supabase
          .from('clients')
          .select('id, name, email, esmm, earsiv, efatura, dvs_username, dvs_password, close_date')
          .ilike('email', String(user.email).trim())
          .limit(1)
        if (!error && !iptal && data?.[0]) setKendiClient(data[0])
      } catch { /* yoksay */ }
    })()
    return () => { iptal = true }
  }, [embedded, clientDetail?.id, user?.email])

  const faturaKesimTurlari = [
    ...(clientDetail?.esmm || user?.esmm || kendiClient?.esmm ? ['esmm'] : []),
    ...(clientDetail?.earsiv || user?.earsiv || kendiClient?.earsiv ? ['earsiv'] : []),
    ...(clientDetail?.efatura || user?.efatura || kendiClient?.efatura ? ['efatura'] : [])
  ]
  const faturaKesimEtiketi = faturaKesimTurlari.length
    ? faturaKesimTurlari.map(t => t === 'esmm' ? 'E-SMM' : t === 'earsiv' ? 'e-Arşiv' : 'e-Fatura').join('/') + ' Kesimi'
    : ''

  // Sıra admin menüsüyle aynı: AnaSayfa, (Beyan Takip —yok—), (e-Beyanname
  // —yok—), (Müşteriler —yok—), (Fatura İşlemleri —yok—), KDV Dökümleri,
  // E-Fatura İşlemleri (fatura kesimi), e-Tebligat, Mali Müşavir Bölümü
  // (Evraklarım/Beyannamelerim/Faturalarım), Ödeme Takip (Muhasebe Borcum +
  // Cari Hesap), Personel/İzin, (Yükleme) Belge Yükle, (Gönderim) Mesajlarım,
  // (Raporlar) Kira Stopaj, Vergi Takvimi, Hesaplamalar, Ayarlar.
  // Moduller: ClientDetail "Modüller" sekmesinden acilip kapatilir; varsayilan ACIK
  const tabs = [
    { id: 'anasayfa', label: 'Ana Sayfa', icon: HomeIcon },
    ...(clientDetail?.cari_hesap_modulu ? [{ id: 'cari-hesap', label: 'Cari Hesap Takip', icon: BookOpen }] : []),
    ...(clientDetail?.kdv_dokumleri_modulu !== false ? [{ id: 'kdvdokum', label: 'KDV Dökümleri', icon: Receipt }] : []),
    ...(faturaKesimTurlari.length && clientDetail?.earsiv_efatura_modulu !== false ? [{ id: 'fatura-kesim', label: faturaKesimEtiketi, icon: FileText }] : []),
    ...(clientDetail?.faturalarim_modulu !== false ? [{ id: 'invoices', label: 'Faturalarım', icon: Receipt }] : []),
    ...(clientDetail?.personel_modulu !== false ? [{ id: 'personel', label: 'Personel', icon: Users }] : []),
    ...(clientDetail?.etebligatlarim_modulu !== false ? [{ id: 'tebligatlarim', label: 'e-Tebligatlarım', icon: Inbox }] : []),
    { id: 'borclarim', label: 'Kamu Borçlarım', icon: Landmark },
    ...(clientDetail?.evraklarim_modulu !== false ? [{ id: 'documents', label: 'Evraklarım', icon: FolderOpen }] : []),
    ...(clientDetail?.beyannamelerim_modulu !== false ? [{ id: 'beyannamelerim', label: 'Beyannamelerim', icon: FileSearch }] : []),
    ...(clientDetail?.muhasebe_borcum_modulu !== false ? [{ id: 'borc', label: 'Muhasebe Borcum', icon: DollarSign }] : []),
    ...(clientDetail?.belge_yukle_modulu !== false ? [{ id: 'upload', label: 'Belge Yükle', icon: Camera }] : []),
    ...(clientDetail?.mesajlarim_modulu !== false ? [{ id: 'messages', label: 'Mesajlarım', icon: MessageSquare }] : []),
    ...(clientDetail?.kira_stopaj_modulu !== false ? [{ id: 'kira-stopaj', label: 'Kira Stopaj Listesi', icon: FileText }] : []),
    { id: 'notifications', label: 'Vergi Takvimi', icon: Bell },
    { id: 'hesaplamalar', label: 'Hesaplamalar', icon: Calculator },
    { id: 'profile', label: 'Ayarlar', icon: User },
  ]
  // DVS e-Tebligatlari (admin/musteri tarafindan sorgulanip kaydedilenler).
  // Ana sayfa ozeti icin giriste bir kez yuklenir; tebligatlarim sekmesindeki
  // Yenile butonu ve sorgular tazeler.
  const [dvsTebligatlar, setDvsTebligatlar] = useState([])
  const [dvsTebligatYukleniyor, setDvsTebligatYukleniyor] = useState(false)
  useEffect(() => {
    if (!clientDetail?.id) return
    let iptal = false
    etebligatlariGetir(clientDetail.id).then(s => {
      if (!iptal) setDvsTebligatlar(s || [])
    }).catch(() => {})
    return () => { iptal = true }
  }, [clientDetail?.id])


  // Ana sayfa ozeti icin tarih sirali liste (en yeni ustte)
  const siraliTebligatlar = useMemo(() => {
    return [...(dvsTebligatlar || [])].sort((a, b) =>
      tebligatTarihDeger(b.teblig_tarihi || b.gonderme_tarihi) - tebligatTarihDeger(a.teblig_tarihi || a.gonderme_tarihi))
  }, [dvsTebligatlar])

  // 2.8.5: bu musteriye ait, musteri oturumunun KENDISI tarafindan okundu
  // isaretlenen belgeler. Supabase (etebligat_okundu) + localStorage yedegi.
  const [okunduSetim, setOkunduSetim] = useState(new Set())
  useEffect(() => {
    if (!clientDetail?.id) { setOkunduSetim(new Set()); return }
    let iptal = false
    kullaniciOkunduSeti(clientDetail.id)
      .then(s => { if (!iptal) setOkunduSetim(s || new Set()) })
      .catch(() => {})
    return () => { iptal = true }
  }, [clientDetail?.id])
  // 2.8.5: etkili okundu — paylasilan okundu kolonu + bu kullanicinin kendi
  // isaretleri birlesik. Baskasi (admin/personel) okusa bile musteri kendisi
  // okuyana kadar kendi tarafinda "Yeni" olarak gorur.
  const effOkundu = useCallback((t) => !!(t?.okundu || okunduSetim.has(t?.belge_no)), [okunduSetim])

  // Okunmamis tebligat sayilari — kaynak bazinda (GIB / SGK), kisiye ozel
  const okunmamisGib = useMemo(() =>
    (dvsTebligatlar || []).filter(t => (t.kaynak || 'vergi') === 'vergi' && !effOkundu(t)).length, [dvsTebligatlar, effOkundu])
  const okunmamisSgk = useMemo(() =>
    (dvsTebligatlar || []).filter(t => t.kaynak === 'sgk' && !effOkundu(t)).length, [dvsTebligatlar, effOkundu])

  // 2.7.542: "Yeni tebligat" uyarisi — son sorgudan SONRA gelen tebligatlar
  // (sorgu servisi bu satirlara yeni=true isareti koyar). Musteri ana
  // ekraninda sari bantla gosterilir; kapatilinca isaret temizlenir.
  const yeniTebligatlar = useMemo(() =>
    (dvsTebligatlar || []).filter(t => t.yeni), [dvsTebligatlar])
  const [tebligatUyariKapatildi, setTebligatUyariKapatildi] = useState(false)
  // 2.7.543: X ile kapatilan uyari, o ana kadar gelen tebligatlari sessize alir;
  // sonrasinda gelen YENI tebligatlar uyarida tekrar on plana cikar.
  const [tebligSessizZaman, setTebligSessizZaman] = useState(() => Number(sessionStorage.getItem('musteri_teblig_sessiz') || 0))
  const tebligUyariKapat = () => {
    const t = Date.now()
    try { sessionStorage.setItem('musteri_teblig_sessiz', String(t)) } catch { /* yoksay */ }
    setTebligSessizZaman(t)
  }
  const gorunenYeniTebligatlar = useMemo(() =>
    yeniTebligatlar.filter(t => {
      if (tebligSessizZaman === 0) return true
      const ts = new Date(t.created_at || 0).getTime() || 0
      return ts > tebligSessizZaman
      // 2.8.5: musteri KENDISI okudugu belgeyi kendi uyarisinda gormez —
      // admin/personelin okumasi uyariyi kapatmaz (kisiye ozel okundu).
    }).filter(t => !effOkundu(t)), [yeniTebligatlar, tebligSessizZaman, effOkundu])

  // Musteri sayfasi acikken admin arka planda sorgu yaparsa uyari kendiliginden
  // belirsin diye tebligat listesi dakikada bir tazelenir.
  useEffect(() => {
    if (!clientDetail?.id) return
    let iptal = false
    const tazele = () => {
      etebligatlariGetir(clientDetail.id)
        .then(s => { if (!iptal) setDvsTebligatlar(s || []) })
        .catch(() => {})
    }
    const timer = setInterval(tazele, 60000)
    return () => { iptal = true; clearInterval(timer) }
  }, [clientDetail?.id])

  // e-Tebligatlarim sekmesi: vergi / sgk kaynak secimi ve filtreli liste
  const [tebligatKaynak, setTebligatKaynak] = useState('vergi')
  const gorunenTebligatlar = useMemo(() =>
    siraliTebligatlar.filter(t => (t.kaynak || 'vergi') === tebligatKaynak),
    [siraliTebligatlar, tebligatKaynak])

  // Belge tiklama: kayitli PDF varsa ac; yoksa yardimci programdan tek tek
  // indirip Storage'a yukle, sonra ac (admin Tebligatlar sayfasindaki
  // belgeAc ile ayni akis). "Hazırlanıyor" artik tiklanabilir indirmedir.
  // yenidenIndir=true: kayitli PDF olsa bile DVS'ten yeniden indirilir.
  const [tebligatIslem, setTebligatIslem] = useState({ belgeNo: null, tip: null })

  // 2.7.472: Görüntülemeye hazır belgeler — kayıtlı PDF gerçek belge mi
  // (liste çıktısı değil)? Sonuç URL bazında önbelleklenir; hazır olmayan
  // belgenin "Görüntüle" bağlantısı soluk ve tıklanamaz olur.
  const [tebligatHazir, setTebligatHazir] = useState({})
  useEffect(() => {
    let iptal = false
    const guncelle = () => {
      setTebligatHazir(prev => {
        const yeni = {}
        for (const t of gorunenTebligatlar) yeni[t.belge_no] = hazirOnbellek.get(t.file_url) === true
        return yeni
      })
    }
    guncelle()
    const adaylar = gorunenTebligatlar.filter(t => t.file_url && !hazirOnbellek.has(t.file_url))
    ;(async () => {
      for (let i = 0; i < adaylar.length; i += 4) {
        const grup = adaylar.slice(i, i + 4)
        await Promise.all(grup.map(async t => {
          const belge = await tebligatPdfGetir(t.file_url)
          hazirOnbellek.set(t.file_url, belge.ok)
        }))
        if (iptal) return
        guncelle()
      }
    })()
    return () => { iptal = true }
  }, [gorunenTebligatlar])
  const portalBelgeAc = useCallback(async (t, yenidenIndir = false) => {
    const musteri = clientDetail || { id: clientId }
    if (!musteri?.id || !t?.belge_no) return
    // 2.8.5: belgeyi ACAN musteri icin KISIYE OZEL okundu isareti — adminin
    // okumasi musterinin uyarisini kapatmaz, musteri kendisi okuyana kadar
    // kendi tarafinda "yeni tebligat" uyarisi surer.
    const benimIcinOkunduIsaretle = async () => {
      try {
        await okunduAyarla(musteri.id, t.belge_no, true)
        setOkunduSetim(prev => new Set(prev).add(t.belge_no))
      } catch { /* okundu isareti kritik degil */ }
    }
    if (t.file_url && !yenidenIndir) {
      const belge = await tebligatPdfGetir(t.file_url)
      hazirOnbellek.set(t.file_url, belge.ok)
      setTebligatHazir(prev => ({ ...prev, [t.belge_no]: belge.ok }))
      if (belge.ok) {
        const objeUrl = URL.createObjectURL(belge.blob)
        window.open(objeUrl, '_blank', 'noopener')
        setTimeout(() => URL.revokeObjectURL(objeUrl), 5 * 60 * 1000)
        await benimIcinOkunduIsaretle()
        return
      }
      if (belge.reason === 'liste-ciktisi') {
        alert('Bu kaydın PDF’i tebligat LİSTESİ çıktısı — görüntülemeye hazır değil. Yanındaki İndir tuşunu kullanın.')
        return
      }
    }
    if ((t.kaynak || 'vergi') === 'sgk') {
      alert('Bu SGK tebligatinin PDF’i bulunamadı. SGK sekmesinden tebligatlari yeniden sorgulayın.')
      return
    }
    setTebligatIslem({ belgeNo: t.belge_no, tip: 'indir' })
    try {
      const res = await etebligatBelgesiAl(musteri, t)
      if (!res.ok) {
        const nedenler = {
          'dvs-sifre-eksik': 'Müşteri kaydında Dijital Vergi Dairesi kullanıcı adı/şifresi eksik. Muhasebecinizle paylaşın.',
          'kurulu-degil': 'MUBiS yardımcı programı bu bilgisayarda çalışmıyor. Kurmak için MUBiS ayarlar sayfasını kullanın.',
          'erisim-engelli': 'Yardımcı programın eski bir sürümü çalışıyor. Güncelleyip tekrar deneyin.',
          'servis-yanit-vermedi': 'Yardımcı program yanıt vermedi, tekrar deneyin.',
          'liste-ciktisi': 'İndirilen dosya tebligat listesi çıktısı. Yardımcı programı güncelleyip tekrar deneyin.'
        }
        alert(nedenler[res.reason] || ('Belge indirilemedi: ' + (res.reason || res.hata || 'bilinmeyen')))
      } else {
        const objeUrl = URL.createObjectURL(res.blob)
        window.open(objeUrl, '_blank', 'noopener')
        setTimeout(() => URL.revokeObjectURL(objeUrl), 5 * 60 * 1000)
        setDvsTebligatlar(prev => prev.map(s => s.belge_no === t.belge_no ? { ...s, file_url: res.url } : s))
        await benimIcinOkunduIsaretle()
      }
    } catch (e) {
      alert('Belge indirme hatası: ' + (e?.message || e))
    }
    setTebligatIslem({ belgeNo: null, tip: null })
  }, [clientDetail, clientId])

  // "İndir": belgeyi bilgisayara DISKE indirir. Kayitli PDF varsa onu indirir;
  // yoksa yardimcidan indirir (ve kaydeder), sonra diske yazar.
  const portalBelgeIndir = useCallback(async (t) => {
    if (!t?.belge_no) return
    const diskeYaz = (blob) => {
      const objeUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objeUrl
      a.download = `e-Tebligat_${t.belge_no}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(objeUrl), 60 * 1000)
    }
    if (t.file_url) {
      const belge = await tebligatPdfGetir(t.file_url)
      hazirOnbellek.set(t.file_url, belge.ok)
      setTebligatHazir(prev => ({ ...prev, [t.belge_no]: belge.ok }))
      if (belge.ok) { diskeYaz(belge.blob); return }
    }
    if ((t.kaynak || 'vergi') === 'sgk') {
      alert('Bu SGK tebligatinin PDF’i bulunamadı. SGK sekmesinden tebligatlari yeniden sorgulayın.')
      return
    }
    const musteri = clientDetail || { id: clientId }
    if (!musteri?.id) return
    setTebligatIslem({ belgeNo: t.belge_no, tip: 'indir' })
    try {
      const res = await etebligatBelgesiAl(musteri, t)
      if (!res.ok) {
        alert('Belge indirilemedi: ' + (res.reason || res.hata || 'bilinmeyen'))
      } else {
        diskeYaz(res.blob)
        if (res.url) setDvsTebligatlar(prev => prev.map(s => s.belge_no === t.belge_no ? { ...s, file_url: res.url } : s))
      }
    } catch (e) {
      alert('Belge indirme hatası: ' + (e?.message || e))
    }
    setTebligatIslem({ belgeNo: null, tip: null })
  }, [clientDetail, clientId])

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

  // Musteri istedigi hesabi/alanini tek tusla kopyalayabilir
  const handleKopyala = async (anahtar, metin) => {
    if (!metin) return
    try {
      await navigator.clipboard.writeText(String(metin).replace(/\s/g, ''))
      setKopyalanan(anahtar)
      setTimeout(() => setKopyalanan(''), 1500)
    } catch {
      /* pano izni yoksa sessiz gec */
    }
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

      if (provider === 'odeal') {
        const res = await fetch('/api/odeal-payment', {
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
        return
      }

      // PayTR: Iframe akisi — musteri bilgileri (ad, telefon, adres, e-posta)
      // sunucu tarafindan PayTR'a gecirilir; musteri ekranda SADECE kart
      // bilgilerini girer. Iframe alinamazsa eski link akisina dusulur.
      const musteriBilgi = {
        customerName: clientDetail?.company || clientDetail?.name || user?.company || user?.name || 'Musteri',
        customerEmail: clientDetail?.email || user?.email || '',
        customerPhone: clientDetail?.phone || user?.phone || '',
        customerAddress: [clientDetail?.address, clientDetail?.city].filter(Boolean).join(' ') || 'Turkiye'
      }
      const iframeRes = await fetch('/api/paytr-iframe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(paymentAmount),
          clientId: clientId || '',
          ...musteriBilgi
        })
      })
      const iframeData = await iframeRes.json()

      if (iframeData.success && iframeData.iframeUrl) {
        setPaytrIframeUrl(iframeData.iframeUrl)
        setPaymentLoading(false)
        return
      }

      // Fallback: eski odeme linki akisi
      console.warn('PayTR iframe alinamadi, link akisina dusuluyor:', iframeData.error)
      const res = await fetch('/api/paytr-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(paymentAmount),
          clientId: clientId || '',
          ...musteriBilgi,
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

  const borcOzeti = hesaplaBorcOzeti(accountingFee, myPayments, new Date(), clientDetail || kendiClient)
  const fmt = (n) => Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })

  // Mali müşavirin yüklediği serbest meslek makbuzları (en yeni önce)
  const makbuzlar = [...(clientDetail?.client_documents?.makbuzlar || [])]
    .sort((a, b) => String(b.uploaded_at || '').localeCompare(String(a.uploaded_at || '')))

  // e-Fatura listesi filtreleri uygulandi
  // Faturayi uygulama ici modalda acar: resmi e-Belge HTML'i -> PDF ->
  // (yalnizca XML varsa) UBL'den okunabilir fatura HTML'i
  const faturaAc = async (f) => {
    // UTTS ve Gümrük (ithalat) kayitlari verisiz excellerdir — fiş modalında
    // gösterilir; asla iframe'e excel yüklenmez (bos siyah ekran olurdu).
    if (fisKaydiMi(f) || f.tur === 'utts' || f.tur === 'gumruk') { setFisGoster({ ...f, kdvDetaylari: f.kdvDetaylari?.length ? f.kdvDetaylari : kdvDetaylar[f.id] || [] }); return }
    if (f.html_url || f.pdf_url) {
      // Supabase Storage HTML'i text/plain olarak sunar (guvenlik politikasi);
      // metni cekip blob URL ile acarsak tarayici gercek HTML render eder.
      if (f.html_url) {
        setGosterilenFatura({ f, src: null, tip: 'html', yukleniyor: true })
        try {
          const metin = await (await fetchDocument(f.html_url)).text()
          const blobUrl = URL.createObjectURL(new Blob([metin], { type: 'text/html;charset=utf-8' }))
          setGosterilenFatura({ f, src: blobUrl, tip: 'html' })
        } catch {
          const src = await getViewUrl(f.html_url).catch(() => null)
          setGosterilenFatura({ f, src: src || f.html_url, tip: 'html' })
        }
        return
      }
    }
    // 2.7.241: once XML'e gomulu RESMI XSLT gorunumu (gondericinin/GIB resmi
    // fatura gorunumu) — varolan tasarim PDF'ler yerine orijinal acilir.
    if (f.xml_url && f.tur !== 'utts' && f.tur !== 'gumruk') {
      try {
        const metin2 = await (await fetchDocument(f.xml_url)).text()
        const resmi = gomuluXsltGorunumu(metin2)
        if (resmi) {
          setGosterilenFatura({ f, src: URL.createObjectURL(new Blob([resmi], { type: 'text/html;charset=utf-8' })), tip: 'html' })
          return
        }
      } catch { /* pdf/xml akisi */ }
    }
    if (f.pdf_url) {
      const src = await getViewUrl(f.pdf_url).catch(() => null)
      setGosterilenFatura({ f, src: src || f.pdf_url, tip: 'pdf' })
      return
    }
    if (f.xml_url && f.tur !== 'utts') {
      setGosterilenFatura({ f, src: null, tip: 'xml', yukleniyor: true })
      try {
        const metin = await (await fetchDocument(f.xml_url)).text()
        const ayik = ublAyikla(metin)
        ayik.uyari = 'Bu faturada orijinal e-Belge (PDF veya GİB e-Belge HTML) bulunamadı. Aşağıdaki görünüm MUBiS tarafından XML verisinden üretilmiştir — resmî belgenin birebir kopyası değildir.'
        const html = faturaHtmlOlustur(ayik)
        setGosterilenFatura({ f, src: URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })), tip: 'xml' })
        return
      } catch { /* okunamadiysa ham xml'e dus */ }
    }
    if (f.xml_url) {
      const src = await getViewUrl(f.xml_url).catch(() => null)
      setGosterilenFatura({ f, src: src || f.xml_url, tip: 'xml' })
    }
  }

  const fTutarNorm = (f) => String(f?.fatura_turu || '').toLocaleUpperCase('tr')
    .replace(/[İIı]/g, 'I').replace(/Ç/g, 'C').replace(/Ğ/g, 'G').replace(/Ö/g, 'O').replace(/Ş/g, 'S').replace(/Ü/g, 'U')
  const gorunenFaturalar = faturalar.filter(f => {
    const ft = fTutarNorm(f)
    const fisKayit = ft === 'Z RAPORU' || ft === 'GIDER FISI' || ft === 'GIDER DOKUMU'
    const turOk = !faturaFiltre.tur
      ? true
      : faturaFiltre.tur === 'zrapor' ? ft === 'Z RAPORU'
      : faturaFiltre.tur === 'giderfisi' ? (ft === 'GIDER FISI' || ft === 'GIDER DOKUMU')
      : (f.tur === faturaFiltre.tur && !fisKayit)
    return turOk &&
    (!faturaFiltre.yon || f.yon === faturaFiltre.yon) &&
    faturaTurEslesir(f, faturaFiltre.faturaTuru) &&
    (!faturaFiltre.yil || String(f.tarih || '').startsWith(String(faturaFiltre.yil))) &&
    (!faturaFiltre.ay || String(f.tarih || '').substring(5, 7) === String(faturaFiltre.ay).padStart(2, '0'))
  })

  // Filtrelenmiş listeye ait sütun toplamları (matrah/kdv/tutar) —
  // her filtre seçiminde (ay, tür, fatura türü) otomatik yeniden hesaplanır.
  // "Tümü" seçiliyken Alınan/Kesilen kırılımı da ayrı ayrı tutulur.
  const faturaToplamlari = useMemo(() => {
    const hesap = (liste) => {
      let matrah = 0, kdv = 0, tutar = 0
      liste.forEach(f => {
        if (f.matrah != null && isFinite(Number(f.matrah))) matrah += Number(f.matrah)
        if (f.kdv != null && isFinite(Number(f.kdv))) kdv += Number(f.kdv)
        if (f.tutar != null && isFinite(Number(f.tutar))) tutar += Number(f.tutar)
      })
      return { matrah, kdv, tutar }
    }
    return {
      ...hesap(gorunenFaturalar),
      alinan: hesap(gorunenFaturalar.filter(f => f.yon !== 'giden')),
      kesilen: hesap(gorunenFaturalar.filter(f => f.yon === 'giden'))
    }
  }, [gorunenFaturalar])

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

        {/* Cikis — dar modda yalniz ikon görünür */}
        <div className="p-3 border-t border-blue-800/40">
          <button
            onClick={async () => {
              try { await logout() } finally { window.location.replace('/') }
            }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium bg-red-600/20 text-red-300 hover:bg-red-600/30 hover:text-red-200 transition-all ${menuHover ? '' : 'lg:justify-center lg:px-2'}`}
            title="Çıkış Yap"
          >
            <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
            <span className={`flex-1 text-left whitespace-nowrap ${menuHover ? '' : 'lg:hidden'}`}>Çıkış Yap</span>
          </button>
        </div>
      </aside>
      )}

      {/* ==================== ICERIK ==================== */}
      <div className="relative flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6">
      {!embedded && <BolumRehberi bolum={activeTab} />}
      {/* 2.8.4: Fatura Güncelle Talebi rozeti — "?" simgesinin solunda, sabit.
          2.8.10: document.body'ye portal edilir — üst kapsayıcıların transform/backdrop
          etkisi fixed konumunu bozamaz; sayfayla kesinlikle hareket etmez. */}
      {!embedded && activeTab === 'invoices' && createPortal(
        <button
          onClick={faturaGuncelleTalebi}
          disabled={faturaTalepDurum === 'bekliyor' || faturaTalepDurum === 'calisiyor'}
          title="Mali müşterinize fatura güncelleme talebi gönderir — sunucu dönem faturalarını otomatik sorgulayıp yükler"
          className={`fixed top-3.5 right-14 sm:right-16 z-[70] rounded-xl px-3.5 py-2 text-xs font-bold shadow-lg transition-all border-b-4 active:translate-y-0.5 active:border-b-2 disabled:opacity-80 ${
            faturaTalepDurum === 'bekliyor' || faturaTalepDurum === 'calisiyor'
              ? 'bg-gradient-to-b from-sky-400 to-blue-600 border-blue-800 text-white cursor-wait'
              : faturaTalepGonderildi
                ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 border-emerald-800 text-white'
                : 'bg-gradient-to-b from-yellow-300 to-amber-500 border-amber-700 text-blue-950 hover:from-yellow-200 hover:to-amber-400'
          }`}
        >
          {faturaTalepDurum === 'bekliyor' || faturaTalepDurum === 'calisiyor'
            ? '⏳ Sorgulanıyor…'
            : faturaTalepGonderildi ? '✓ Talebiniz iletildi' : 'Fatura Güncelle Talebi'}
        </button>,
        document.body
      )}
      {/* YardimciSurumUyari App.jsx'te global render ediliyor; burada tekrar gereksiz */}
      {activeTab === 'anasayfa' ? (
        <div className="space-y-6">
          {/* Hos geldin */}
          <div className="relative bg-gradient-to-r from-blue-700 to-blue-900 rounded-2xl p-6 lg:p-8 border border-blue-600/40">
            {/* Filigran + dekor kendi kivrilma katmaninda — namaz/imsakiye paneli banda tasmaali */}
            <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
              <div className="absolute right-0 top-0 w-64 h-full opacity-20 bg-[radial-gradient(circle_at_70%_40%,white,transparent_65%)]" />
              <img
                src="/ustbar-ataturk.png"
                alt=""
                aria-hidden="true"
                draggable="false"
                className="hidden md:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[30%] max-w-[380px] h-[150%] object-cover select-none opacity-30"
                style={{
                  mixBlendMode: 'luminosity',
                  WebkitMaskImage: 'radial-gradient(ellipse 75% 65% at 50% 50%, black 40%, transparent 98%)',
                  maskImage: 'radial-gradient(ellipse 75% 65% at 50% 50%, black 40%, transparent 98%)'
                }}
              />
            </div>
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
              {/* 2.7.543: saat + tarih + hava, altinda yan yana muzik rozetleri + namaz vakitleri (Ayarlar'dan acilir) */}
              <div className="flex flex-col items-center gap-3 order-3 md:order-none">
                <HavaSaatKarti />
                <div className="flex flex-wrap items-center justify-center gap-3">
                  {radyoGoster && <RadioUstBant />}
                  {ytMuzikGoster && <YouTubeMuzik />}
                  {spotifyGoster && <SpotifyUstBant />}
                  {namazGoster && <NamazVakitleri />}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
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

          {/* 2.7.542: Yeni tebligat uyarisi — hover ile acilan simge widget'i */}
          {!tebligatUyariKapatildi && gorunenYeniTebligatlar.length > 0 && (
            <div className="relative inline-block group mb-6 align-top">
              <button
                type="button"
                onClick={() => { setTebligatKaynak(gorunenYeniTebligatlar[0]?.kaynak || 'vergi'); setActiveTab('tebligatlarim') }}
                className="relative block w-14 h-14 md:w-16 md:h-16 rounded-2xl overflow-hidden shadow-lg shadow-black/40 ring-2 ring-amber-400/50 hover:ring-amber-400 transition-all duration-300 hover:scale-105 cursor-pointer"
                title="Yeni tebligatlarınız — üstünde bekleyin"
              >
                <img src="/etebligat-simge.png" alt="e-Tebligat" className="w-full h-full object-cover" draggable="false" />
                <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center ring-2 ring-blue-950 shadow-lg">
                  {gorunenYeniTebligatlar.length > 99 ? '99+' : gorunenYeniTebligatlar.length}
                </span>
              </button>
              <div className="absolute left-0 top-full z-50 pt-2 opacity-0 translate-y-1 invisible transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0 group-hover:visible">
                <div className="w-[430px] max-w-[calc(100vw-3rem)] bg-blue-950/95 backdrop-blur-md border border-amber-500/40 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">
                  <div className="flex items-center gap-2.5 px-4 py-3 border-b border-blue-800/50 bg-amber-500/5">
                    <img src="/etebligat-simge.png" alt="" className="w-9 h-9 rounded-xl object-cover ring-1 ring-amber-400/40" draggable="false" />
                    <div className="flex-1 min-w-0">
                      <h2 className="text-white font-semibold text-sm leading-tight">{gorunenYeniTebligatlar.length} adet yeni tebligatınız var</h2>
                      <p className="text-amber-300/80 text-xs">Son sorgulamadan sonra gelenler</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setTebligatKaynak(gorunenYeniTebligatlar[0]?.kaynak || 'vergi'); setActiveTab('tebligatlarim') }}
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500/90 hover:bg-amber-400 text-blue-950 text-xs font-bold transition"
                    >
                      Tümü
                    </button>
                    <button
                      type="button"
                      onClick={tebligUyariKapat}
                      aria-label="Uyariyi kapat"
                      title="Kapat (yeni tebligat gelene kadar uyarı gösterilmez)"
                      className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {gorunenYeniTebligatlar.slice(0, 10).map((t, i) => (
                      <button
                        key={(t.belge_no || '') + i}
                        type="button"
                        onClick={() => { setTebligatKaynak(t.kaynak || 'vergi'); setActiveTab('tebligatlarim') }}
                        className="w-full flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-left px-4 py-2.5 hover:bg-amber-500/10 transition-colors border-b border-blue-800/40 last:border-b-0"
                      >
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 shrink-0">
                          {t.kaynak === 'sgk' ? 'SGK' : 'GİB'}
                        </span>
                        <span className="text-gray-300 min-w-[86px] shrink-0">{t.teblig_tarihi || t.gonderme_tarihi || '—'}</span>
                        <span className="text-white flex-1 min-w-[140px] truncate">{t.kurum || '—'}</span>
                        <span className="text-amber-200/60 shrink-0">{t.belge_no || ''}</span>
                      </button>
                    ))}
                    {gorunenYeniTebligatlar.length > 10 && (
                      <div className="text-amber-200/60 text-xs px-4 py-2">+ {gorunenYeniTebligatlar.length - 10} tebligat daha</div>
                    )}
                  </div>
                  <div className="px-4 py-2.5 border-t border-blue-800/50 flex justify-end">
                    <button
                      type="button"
                      onClick={async () => {
                        setTebligatUyariKapatildi(true)
                        setDvsTebligatlar(list => (list || []).map(t => ({ ...t, yeni: false })))
                        try { await yeniTebligatlariTemizle(clientDetail?.id) } catch { /* isaret temizligi kritik degil */ }
                      }}
                      className="text-[11px] text-gray-400 hover:text-white transition"
                    >
                      Yeni işaretlerini temizle
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

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
              href={YARDIMCI_EXE_URL}
              download
              className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              Programı İndir
            </a>
          </div>

          {/* Kamu borclari ozeti + KDV durumu */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
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
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); setBorcDetayKaynak('hepsi'); setActiveTab('borclarim') }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setBorcDetayKaynak('hepsi'); setActiveTab('borclarim') } }}
                className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-100 bg-red-500/20 hover:bg-red-500/35 border border-red-400/40 rounded-lg px-2.5 py-1 transition-colors cursor-pointer"
                title="Vergi borcu listesini kalem kalem görüntüle"
              >
                <FileSearch className="w-3.5 h-3.5" /> Detay
              </span>
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
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); setBorcDetayKaynak('hepsi'); setActiveTab('borclarim') }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setBorcDetayKaynak('hepsi'); setActiveTab('borclarim') } }}
                className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-orange-100 bg-orange-500/20 hover:bg-orange-500/35 border border-orange-400/40 rounded-lg px-2.5 py-1 transition-colors cursor-pointer"
                title="SGK borç listesini kalem kalem görüntüle"
              >
                <FileSearch className="w-3.5 h-3.5" /> Detay
              </span>
            </button>
            <button
              onClick={() => setActiveTab('tebligatlarim')}
              className="bg-gradient-to-br from-blue-900/40 to-blue-800/20 hover:from-blue-800/50 hover:to-blue-700/30 border border-blue-700/30 rounded-2xl p-5 text-left transition-colors"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-blue-600/30 flex items-center justify-center">
                  <Bell className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <div className="text-gray-400 text-sm">Okunmamış Tebligatlar</div>
                  <div className="text-lg font-semibold text-white">GİB: {okunmamisGib} · SGK: {okunmamisSgk}</div>
                </div>
              </div>
              <div className="text-blue-300/70 text-xs space-y-0.5">
                <div>GİB (Vergi Dairesi): {okunmamisGib} okunmamış</div>
                <div>SGK: {okunmamisSgk} okunmamış</div>
                <div>Tebligatları görmek için tıklayın.</div>
              </div>
            </button>
            <div className="relative bg-gradient-to-br from-emerald-900/40 to-emerald-800/20 border border-emerald-700/30 rounded-2xl p-5 text-left">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600/30 flex items-center justify-center">
                  {kdvDurumYukleniyor ? <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin" /> : <FileText className="w-5 h-5 text-emerald-400" />}
                </div>
                <div>
                  <div className="text-gray-400 text-sm">KDV Durumu</div>
                  <div className="text-lg font-semibold text-white">
                    {kdvDurum
                      ? (kdvDurum.faturalarYuklenmedi
                        ? <span className="text-yellow-400">Faturalar henüz yüklenmedi</span>
                        : (kdvDurum.odeme > 0
                          ? <span className="text-yellow-400">Ödenecek: {formatMoney(kdvDurum.odeme)} TL</span>
                          : <span className="text-emerald-400">Devreden: {formatMoney(kdvDurum.devredenSonraki)} TL</span>))
                      : 'Hesaplanıyor...'}
                  </div>
                  {kdvDurum && <div className="text-emerald-300/60 text-xs">{kdvDurum.donem} dönemi</div>}
                </div>
              </div>
              {kdvDurum && !kdvDurum.faturalarYuklenmedi && (
                <button onClick={e => { e.stopPropagation(); setKdvDetayAc(v => !v) }}
                  className="text-emerald-300/70 hover:text-emerald-300 text-xs flex items-center gap-1 mt-3 transition-colors">
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${kdvDetayAc ? 'rotate-180' : ''}`} />
                  Ayrıntı
                </button>
              )}
              {kdvDurum && kdvDurum.faturalarYuklenmedi && (
                <div className="text-yellow-400/80 text-xs mt-2 flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>Sisteme henüz KDV tutarı olan fatura yüklenmediği için hesap yapılmadı; faturalar yüklendikten sonra bu kart güncellenecek.</span>
                </div>
              )}
              {kdvDurum && !kdvDurum.faturalarYuklenmedi && kdvDetayAc && (
                <div className="absolute left-3 right-3 top-full mt-1 z-30 bg-blue-950 border border-emerald-700/40 rounded-xl shadow-2xl p-4 space-y-1">
                  {[
                    ['Önceki aydan devreden' + (kdvDurum.devredenKaynak === 'tahakkuk-fisi' ? ' (tahakkuk fişi)' : kdvDurum.devredenKaynak === 'kart-devreden-sonraki' ? ' (önceki ay hesap özeti)' : ' (KDV1 beyanı)'), formatMoney(kdvDurum.devredenOnceki) + ' TL'],
                    ['Alınan fatura KDV', formatMoney(kdvDurum.alinanKdv) + ' TL'],
                    ['Sorumlu sıfatıyla ödenen KDV (109)', formatMoney(kdvDurum.kdv109 || 0) + ' TL'],
                    ['İthalde ödenen KDV (yüklenen ithalat faturalarından)', formatMoney(kdvDurum.kdv110 || 0) + ' TL'],
                    ['İndirilebilir toplam', formatMoney(kdvDurum.indirilebilirToplam) + ' TL'],
                    ['Tahsil edilen KDV', formatMoney(kdvDurum.tahsilEdilen) + ' TL']
                  ].map(([l, v]) => (
                    <div key={l} className={`flex justify-between items-center border-b border-emerald-800/30 pb-1 ${l.startsWith('İndirilebilir') ? 'pt-1' : ''}`}>
                      <span className={l.startsWith('İndirilebilir') ? 'text-yellow-300 font-semibold' : 'text-emerald-300/70'}>{l}</span>
                      <span className={`text-white font-mono ${l.startsWith('İndirilebilir') ? 'text-yellow-300 font-bold' : ''}`}>{v}</span>
                    </div>
                  ))}
                  {(kdvDurum.devredenKaynak === 'beyanname-yok' || kdvDurum.devredenKaynak === 'okunamadi' || kdvDurum.devredenKaynak === 'hata') && (
                    <div className="text-yellow-400/80 text-[11px] flex items-start gap-1 pt-1">
                      <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                      <span>
                        {kdvDurum.devredenKaynak === 'beyanname-yok'
                          ? 'Önceki ay KDV beyanname PDF\'i bulunamadı; devreden 0 alındı.'
                          : 'Beyannamedeki devreden tutarı okunamadı; 0 alındı.'}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
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

          {/* e-Tebligatlar ozeti: vergi ve sgk ayri ayri listelenir */}
          <div className="bg-blue-900/30 border border-blue-700/30 rounded-2xl p-5 lg:p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <Inbox className="w-6 h-6 text-yellow-400" />
                <div>
                  <h2 className="text-lg font-semibold text-white">e-Tebligatlarım</h2>
                  <p className="text-gray-500 text-sm">Vergi Dairesi ve SGK&apos;dan gelen tebligatlar — üzerine tıklayınca tebligat sayfası açılır.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => handleTebligatSorgula('vergi')}
                  disabled={tebligatSorguluyor}
                  title="Vergi Dairesi toplu e-Tebligat listesini sorgula ve PDF'leri indir"
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {tebligatSorguluyor ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Inbox className="w-4 h-4" />}
                  Vergi Dairesi Toplu E-Tebligat
                </button>
                <button
                  onClick={() => handleTebligatSorgula('sgk')}
                  disabled={tebligatSorguluyor}
                  title="SGK e-Tebligatlari sorgula ve indir"
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {tebligatSorguluyor ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                  SGK Sorgula
                </button>
                <button onClick={() => setActiveTab('tebligatlarim')} className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1">
                  Tüm Tebligatlar <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
            {tebligatMesaj && (
              <p className={`text-xs mb-3 px-1 ${tebligatMesaj.includes('adet yeni') ? 'text-green-400' : tebligatMesaj.includes('tamamlanamadi') || tebligatMesaj.includes('calismiyor') || tebligatMesaj.includes('eksik') ? 'text-red-400/90' : 'text-blue-300/80'}`}>{tebligatMesaj}</p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { kaynak: 'vergi', baslik: 'Vergi Dairesi', renk: 'text-blue-400' },
                { kaynak: 'sgk', baslik: 'SGK', renk: 'text-emerald-400' }
              ].map(g => {
                const liste = siraliTebligatlar.filter(t => (t.kaynak || 'vergi') === g.kaynak)
                const yeni = liste.filter(t => !effOkundu(t)).length
                return (
                  <div key={g.kaynak} className="bg-blue-950/40 border border-blue-800/40 rounded-xl overflow-hidden">
                    <button
                      onClick={() => { setTebligatKaynak(g.kaynak); setActiveTab('tebligatlarim') }}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-900/30 text-left transition-colors"
                    >
                      <span className="flex items-center gap-2 text-white font-medium">
                        <Bell className={`w-4 h-4 ${g.renk}`} /> {g.baslik} Tebligatları
                      </span>
                      <span className="flex items-center gap-2">
                        {yeni > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300">{yeni} Yeni</span>}
                        <ChevronRight className="w-4 h-4 text-gray-500" />
                      </span>
                    </button>
                    {liste.length === 0 ? (
                      <div className="px-4 py-4 text-gray-500 text-sm">Henüz tebligat yok.</div>
                    ) : (
                      <div className="divide-y divide-blue-800/30">
                        {liste.slice(0, 4).map(t => (
                          <button
                            key={t.id || t.belge_no}
                            onClick={() => { setTebligatKaynak(g.kaynak); setActiveTab('tebligatlarim') }}
                            className={`w-full px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-blue-900/20 text-left transition-colors ${!effOkundu(t) ? 'bg-blue-900/20' : ''}`}
                          >
                            <span className="min-w-0">
                              <span className="block text-sm text-gray-200 truncate">{t.kurum || g.baslik}{t.belge_turu ? ` · ${t.belge_turu}` : ''}</span>
                              <span className="block text-xs text-gray-500 truncate">
                                {t.belge_no || '—'}{t.teblig_tarihi ? ` · Tebliğ: ${t.teblig_tarihi}` : ''}
                              </span>
                            </span>
                            {!effOkundu(t) && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 flex-shrink-0">Yeni</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Alt bolum */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
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
                  { l: 'Program İndir', i: Download, href: YARDIMCI_EXE_URL, c: 'text-green-400' },
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

            {/* Duyurular — e-Defter duyurulari gosterilmez */}
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
                {duyuruListesi.slice(0, 4).map(n => (
                  <div key={n.id} className="flex gap-3 pb-3 border-b border-blue-800/30 last:border-0 last:pb-0">
                    <span className="text-gray-500 text-[11px] whitespace-nowrap pt-0.5">
                       {formatDateTR(n.created_at)}
                    </span>
                    <p className="text-gray-300 text-sm leading-snug flex-1">{n.title || n.message}</p>
                  </div>
                ))}
                {duyuruListesi.length === 0 && (
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
                <span className="text-gray-400">Önceki Dönem Borcu:</span>
                <span className="text-orange-400 font-semibold">{fmt(borcOzeti.oncekiDonem)} TL</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-blue-700/20">
                <span className="text-gray-400">Defter Tasdik Ücreti:</span>
                <span className="text-blue-400 font-semibold">{fmt(borcOzeti.defterTasdik)} TL</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-blue-700/20">
                <span className="text-gray-400">Aylık Ücret ({borcOzeti.gecenAy} ay):</span>
                <span className="text-yellow-400 font-semibold">{fmt(borcOzeti.aylikToplam)} TL</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-blue-700/30">
                <span className="text-white font-medium">Toplam Borç:</span>
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
                <p className="text-gray-400 text-xs mb-3">Havale/EFT ile ödeme için aşağıdaki hesaplardan birini kullanabilirsiniz. Kopyalamak istediğiniz bilginin yanındaki butona basın.</p>
                <div className="space-y-4">
                  {(bankAccounts.length ? bankAccounts : [bankInfo]).map((hesap, i) => (
                    <div key={i} className="rounded-xl border border-blue-700/30 bg-blue-900/30 p-4 space-y-3">
                      {(bankAccounts.length > 1) && (
                        <p className="text-yellow-400 text-xs font-semibold">{i + 1}. Hesap</p>
                      )}
                      <div>
                        <p className="text-gray-400 text-xs mb-1">Banka</p>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-white font-medium">{hesap.banka || '-'}</p>
                          <button onClick={() => handleKopyala(`banka-${i}`, hesap.banka)} className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1 transition-colors ${kopyalanan === `banka-${i}` ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'}`}>
                            <Copy className="w-3.5 h-3.5" /><span>{kopyalanan === `banka-${i}` ? 'Kopyalandı!' : 'Kopyala'}</span>
                          </button>
                        </div>
                      </div>
                      <div>
                        <p className="text-gray-400 text-xs mb-1">Hesap Sahibi</p>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-white font-medium">{hesap.hesapSahibi || '-'}</p>
                          <button onClick={() => handleKopyala(`sahip-${i}`, hesap.hesapSahibi)} className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1 transition-colors ${kopyalanan === `sahip-${i}` ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'}`}>
                            <Copy className="w-3.5 h-3.5" /><span>{kopyalanan === `sahip-${i}` ? 'Kopyalandı!' : 'Kopyala'}</span>
                          </button>
                        </div>
                      </div>
                      <div>
                        <p className="text-gray-400 text-xs mb-1">IBAN</p>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-yellow-400 font-mono font-bold text-sm break-all">{hesap.iban || '-'}</p>
                          <button onClick={() => handleKopyala(`iban-${i}`, hesap.iban)} className={`ml-2 flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1 transition-colors ${kopyalanan === `iban-${i}` ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'}`}>
                            <Copy className="w-3.5 h-3.5" /><span>{kopyalanan === `iban-${i}` ? 'Kopyalandı!' : 'Kopyala'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
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
          {showKrediKartiModal && activeProvider !== 'eft' && paytrIframeUrl && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => { setPaytrIframeUrl(null); setShowKrediKartiModal(false) }}>
              <div className="bg-blue-950 rounded-2xl p-5 w-full max-w-lg border border-blue-700/30" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-white mb-4 flex items-center space-x-2">
                  <CreditCard className="w-5 h-5 text-yellow-400" /><span>Guvenli Odeme</span>
                </h3>
                <iframe
                  src={paytrIframeUrl}
                  title="PayTR Guvenli Odeme"
                  className="w-full rounded-lg bg-white"
                  style={{ height: '560px', border: 'none' }}
                  allow="payment"
                />
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => {
                      setPaytrIframeUrl(null)
                      setShowKrediKartiModal(false)
                      setPaymentAmount('')
                      loadBorcData().catch(() => {})
                    }}
                    className="flex-1 bg-gradient-to-r from-yellow-500 to-yellow-600 text-blue-950 py-2.5 rounded-xl font-bold hover:from-yellow-400 hover:to-yellow-500 transition-all text-sm"
                  >
                    Odemeyi Tamamladim
                  </button>
                  <button
                    onClick={() => { setPaytrIframeUrl(null); setShowKrediKartiModal(false) }}
                    className="px-4 bg-gray-700/50 text-gray-400 py-2.5 rounded-xl text-sm hover:bg-gray-700/70 transition-colors"
                  >
                    Kapat
                  </button>
                </div>
                <p className="text-gray-500 text-xs text-center mt-2">Kart bilgileriniz PayTR guvenli odeme penceresinde islenir, sistemimizde saklanmaz.</p>
              </div>
            </div>
          )}

          {showKrediKartiModal && activeProvider !== 'eft' && !paytrIframeUrl && (
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

      {activeTab === 'borclarim' && (() => {
        const tl = (n) => formatMoney(Number(n) || 0)
        const satirlar = []
        const ekle = (kaynak, liste) => {
          for (const k of (liste || [])) {
            // 2.8.343: GIB PDF'inden gelen kalemlerde anapara "asilBorc" alaninda
            const borc = Number(k?.borc ?? k?.asilBorc ?? k?.tutar) || 0
            const gz = Number(k?.gz) || 0
            const toplam = Number(k?.toplam) || (borc + gz)
            const turOtomatik = (k?.tur && String(k.tur).trim())
              ? (k?.vergiKodu ? `${k.vergiKodu} ${String(k.tur).trim()}` : k.tur)
              : (kaynak === 'sgk' ? (gz > 0 ? 'Vadesi Gecmis' : 'Vadesi Gelmemis') : (k?.tur || ''))
            satirlar.push({ kaynak, donem: k?.donem || k?.vade || '', tur: turOtomatik, borc, gz, toplam })
          }
        }
        ekle('vergi', borcKalemler.vergi)
        ekle('sgk', borcKalemler.sgk)
        // Yardimci kalem listesi dondurmediyse ozet satirlari goster
        if (!(borcKalemler.vergi || []).length) {
          if ((vergiDetay.vadesiGecmis || 0) > 0) {
            satirlar.push({ kaynak: 'vergi', donem: '', tur: 'Vadesi Geçmiş', borc: vergiDetay.vadesiGecmis, gz: 0, toplam: vergiDetay.vadesiGecmis })
          }
          if ((vergiDetay.vadesiGelmemis || 0) > 0) {
            satirlar.push({ kaynak: 'vergi', donem: '', tur: 'Vadesi Gelmemiş', borc: vergiDetay.vadesiGelmemis, gz: 0, toplam: vergiDetay.vadesiGelmemis })
          }
          if (satirlar.filter(s => s.kaynak === 'vergi').length === 0 && vergiBorcu > 0) {
            satirlar.push({ kaynak: 'vergi', donem: '', tur: 'Toplam (kalem detayı alınamadı)', borc: vergiBorcu, gz: 0, toplam: vergiBorcu })
          }
        }
        if (!(borcKalemler.sgk || []).length && sgkBorcu > 0) {
          satirlar.push({ kaynak: 'sgk', donem: '', tur: 'Toplam (kalem detayı alınamadı)', borc: sgkSadeceBorclar || sgkBorcu, gz: sgkGecikmeZammi || 0, toplam: sgkBorcu })
        }
        const gorunen = satirlar.filter(s => borcDetayKaynak === 'hepsi' || s.kaynak === borcDetayKaynak)
        const toplamVergi = gorunen.filter(s => s.kaynak === 'vergi').reduce((a, s) => a + s.toplam, 0)
        const toplamSgk = gorunen.filter(s => s.kaynak === 'sgk').reduce((a, s) => a + s.toplam, 0)
        const kaynakEtiket = (k) => k === 'sgk' ? 'SGK' : 'GİB (Vergi Dairesi)'
        const kaynakRenk = (k) => k === 'sgk'
          ? 'bg-orange-500/15 text-orange-300 border-orange-500/30'
          : 'bg-red-500/15 text-red-300 border-red-500/30'
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Landmark className="w-6 h-6 text-cyan-300" /> Kamu Borçlarım
                </h2>
                <p className="text-gray-400 text-sm mt-1">
                  GİB (Vergi Dairesi) ve SGK&apos;dan sorgulanan borçlar kalem kalem listelenir. Kartlardaki
                  tutarların dökümünü burada görebilirsiniz.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleVergiBorcSorgula}
                  disabled={vergiBorcuYukleniyor}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600/25 border border-red-500/40 text-red-100 hover:bg-red-600/45 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {vergiBorcuYukleniyor ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  Vergi Borcu Sorgula
                </button>
                <button
                  onClick={handleSgkBorcSorgula}
                  disabled={sgkBorcuYukleniyor}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-orange-600/25 border border-orange-500/40 text-orange-100 hover:bg-orange-600/45 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {sgkBorcuYukleniyor ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                  SGK Borcu Sorgula
                </button>
              </div>
            </div>

            {/* Ozet kartlari */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-gradient-to-br from-blue-900/40 to-blue-800/20 border border-blue-700/30 rounded-2xl p-4">
                <div className="text-gray-400 text-xs">Listelenen borç toplamı</div>
                <div className="text-2xl font-bold text-white mt-1">{tl(toplamVergi + toplamSgk)} TL</div>
                <div className="text-[11px] text-gray-500 mt-1">{gorunen.length} kalem</div>
              </div>
              <div className="bg-gradient-to-br from-red-900/30 to-red-800/15 border border-red-700/30 rounded-2xl p-4">
                <div className="text-gray-400 text-xs">GİB (Vergi Dairesi)</div>
                <div className="text-2xl font-bold text-white mt-1">{tl(vergiBorcu)} TL</div>
                <div className="text-[11px] text-gray-500 mt-1">
                  Son sorgu: {borcSorguTs.vergi ? formatDateTimeTR(new Date(borcSorguTs.vergi)) : '—'}
                </div>
              </div>
              <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/15 border border-orange-700/30 rounded-2xl p-4">
                <div className="text-gray-400 text-xs">SGK</div>
                <div className="text-2xl font-bold text-white mt-1">{tl(sgkBorcu)} TL</div>
                <div className="text-[11px] text-gray-500 mt-1">
                  Son sorgu: {borcSorguTs.sgk ? formatDateTimeTR(new Date(borcSorguTs.sgk)) : '—'}
                </div>
              </div>
            </div>

            {/* Kaynak secimi */}
            <div className="inline-flex rounded-xl border border-blue-700/40 overflow-hidden">
              {[
                { k: 'hepsi', baslik: 'Tümü', sayi: satirlar.length },
                { k: 'vergi', baslik: 'GİB (Vergi Dairesi)', sayi: satirlar.filter(s => s.kaynak === 'vergi').length },
                { k: 'sgk', baslik: 'SGK', sayi: satirlar.filter(s => s.kaynak === 'sgk').length }
              ].map(g => (
                <button
                  key={g.k}
                  onClick={() => setBorcDetayKaynak(g.k)}
                  className={`px-4 py-2.5 text-sm font-medium flex items-center gap-2 transition-colors ${borcDetayKaynak === g.k ? 'bg-yellow-500 text-blue-950' : 'bg-blue-900/30 text-gray-300 hover:bg-blue-900/50'}`}
                >
                  {g.baslik}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${borcDetayKaynak === g.k ? 'bg-blue-950/25 text-blue-950' : 'bg-white/10 text-gray-300'}`}>
                    {g.sayi}
                  </span>
                </button>
              ))}
            </div>

            {(() => {
              const TL = (n) => formatMoney(Number(n) || 0)
              // GIB detay: borcKalemler'den veya vergiDetay/mesajdan uret
              let vergiSatirlarHesap = gorunen.filter(s => s.kaynak === 'vergi')
              if (vergiSatirlarHesap.length === 0 && vergiBorcu > 0) {
                const vg = vergiDetay.vadesiGecmis || 0
                const vgm = vergiDetay.vadesiGelmemis || 0
                if (vg > 0) vergiSatirlarHesap.push({ kaynak: 'vergi', donem: '', tur: 'Vadesi Gecmis', borc: vg, gz: 0, toplam: vg })
                if (vgm > 0) vergiSatirlarHesap.push({ kaynak: 'vergi', donem: '', tur: 'Vadesi Gelmemis', borc: vgm, gz: 0, toplam: vgm })
                if (vergiSatirlarHesap.length === 0) vergiSatirlarHesap.push({ kaynak: 'vergi', donem: '', tur: 'Toplam Borc', borc: vergiBorcu, gz: 0, toplam: vergiBorcu })
              }
              const vergiSatirlar = vergiSatirlarHesap
              const sgkSatirlar = gorunen.filter(s => s.kaynak === 'sgk')
              const bolumTablo = (satirListesi, bosMetin) => (
                satirListesi.length === 0 ? (
                  <div className="bg-blue-900/10 rounded-xl p-6 text-center border border-blue-800/30 text-gray-400 text-sm">
                    {bosMetin}
                  </div>
                ) : (
                  <div className="bg-blue-900/20 rounded-xl border border-blue-700/30 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-blue-900/40 text-gray-400 text-xs uppercase">
                        <tr>
                          <th className="px-3 py-2.5 text-left font-medium">Dönem / Vade</th>
                          <th className="px-3 py-2.5 text-left font-medium">Tür / Açıklama</th>
                          <th className="px-3 py-2.5 text-right font-medium">Borç</th>
                          <th className="px-3 py-2.5 text-right font-medium">Gecikme Zammı</th>
                          <th className="px-3 py-2.5 text-right font-medium">Toplam</th>
                        </tr>
                      </thead>
                      <tbody>
                        {satirListesi.map((s, i) => (
                          <tr key={i} className="border-t border-blue-800/30 hover:bg-blue-900/20">
                            <td className="px-3 py-2.5 text-gray-200">{s.donem || '—'}</td>
                            <td className="px-3 py-2.5 text-gray-300 max-w-[320px] truncate" title={s.tur}>{s.tur || '—'}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-gray-200">{TL(s.borc)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-gray-200">{TL(s.gz)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-white">{TL(s.toplam)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-blue-900/30 border-t border-blue-700/40">
                        <tr>
                          <td className="px-3 py-2.5 text-xs text-gray-400" colSpan={4}>TOPLAM</td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-bold text-yellow-300">
                            {TL(satirListesi.reduce((a, s) => a + s.toplam, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )
              )
              return (
                <>
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-red-300 flex items-center gap-2">
                      <FileText className="w-4 h-4" /> GİB (Vergi Dairesi)
                    </h3>
                    {bolumTablo(vergiSatirlar, vergiBorcu > 0 ? 'Borc yok' : 'Borcu yok (firma alacakli)')}
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-orange-300 flex items-center gap-2">
                      <Users className="w-4 h-4" /> SGK
                    </h3>
                    {bolumTablo(sgkBorcu > 0 ? sgkSatirlar : [], sgkBorcu > 0 ? 'Borc yok' : 'Borcu yok (firma alacakli)')}
                  </div>
                </>
              )
            })()}

            {/* Sorgu notlari */}
            {(vergiBorcMesaj || sgkBorcMesaj) && (
              <details className="rounded-xl border border-blue-800/40 bg-blue-900/20 px-4 py-3">
                <summary className="text-xs text-gray-400 cursor-pointer select-none">Sorgu notu / ham yanıt</summary>
                <div className="mt-2 space-y-2">
                  {vergiBorcMesaj && (
                    <div>
                      <div className="text-[11px] text-red-300/80 font-semibold">GİB (Vergi Dairesi)</div>
                      <pre className="text-[10px] leading-relaxed text-gray-500 whitespace-pre-wrap break-words">{vergiBorcMesaj}</pre>
                    </div>
                  )}
                  {sgkBorcMesaj && (
                    <div>
                      <div className="text-[11px] text-orange-300/80 font-semibold">SGK</div>
                      <pre className="text-[10px] leading-relaxed text-gray-500 whitespace-pre-wrap break-words">{sgkBorcMesaj}</pre>
                    </div>
                  )}
                </div>
              </details>
            )}
          </div>
        )
      })()}

      {activeTab === 'tebligatlarim' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Inbox className="w-6 h-6 text-yellow-400" /> e-Tebligatlarım
              </h2>
              <p className="text-gray-400 text-sm mt-1">
                Vergi Dairesi ve SGK&apos;dan gelen tebligatlar ayrı ayrı listelenir — üzerine tıklayarak belgeyi görüntüleyebilirsiniz.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => handleTebligatSorgula('vergi')}
                disabled={tebligatSorguluyor}
                title="Vergi Dairesi e-Tebligatlarını GİB'den sorgula ve indir"
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600/30 border border-blue-500/40 text-blue-100 hover:bg-blue-600/50 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {tebligatSorguluyor ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Inbox className="w-4 h-4" />}
                e-Tebligat Sorgula (VD)
              </button>
              <button
                onClick={() => handleTebligatSorgula('sgk')}
                disabled={tebligatSorguluyor}
                title="SGK e-Tebligatlarını sorgula ve indir"
                className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600/30 border border-emerald-500/40 text-emerald-100 hover:bg-emerald-600/50 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {tebligatSorguluyor ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                Sorgula (SGK)
              </button>
              <button
                onClick={() => {
                  setDvsTebligatYukleniyor(true)
                  etebligatlariGetir(clientDetail?.id).then(s => { setDvsTebligatlar(s || []); setDvsTebligatYukleniyor(false) })
                }}
                className="btn-gold px-4 py-2 flex items-center gap-2 text-sm"
              >
                <RefreshCw className={`w-4 h-4 ${dvsTebligatYukleniyor ? 'animate-spin' : ''}`} />
                Yenile
              </button>
            </div>
          </div>

          {/* Kaynak secimi: Vergi Dairesi / SGK — okunmamis sayilariyla */}
          <div className="inline-flex rounded-xl border border-blue-700/40 overflow-hidden">
            {[
              { kaynak: 'vergi', baslik: 'Vergi Dairesi', sayi: okunmamisGib, aktifRenk: 'bg-yellow-500 text-blue-950' },
              { kaynak: 'sgk', baslik: 'SGK', sayi: okunmamisSgk, aktifRenk: 'bg-yellow-500 text-blue-950' }
            ].map(g => (
              <button
                key={g.kaynak}
                onClick={() => setTebligatKaynak(g.kaynak)}
                className={`px-5 py-2.5 text-sm font-medium flex items-center gap-2 transition-colors ${tebligatKaynak === g.kaynak ? g.aktifRenk : 'bg-blue-900/30 text-gray-300 hover:bg-blue-900/50'}`}
              >
                {g.baslik}
                {g.sayi > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${tebligatKaynak === g.kaynak ? 'bg-blue-950/30 text-blue-950' : 'bg-yellow-500/20 text-yellow-300'}`}>
                    {g.sayi} yeni
                  </span>
                )}
              </button>
            ))}
          </div>

          {dvsTebligatYukleniyor ? (
            <div className="text-center py-10 text-gray-400">Yükleniyor…</div>
          ) : dvsTebligatlar.length === 0 ? (
            <div className="bg-blue-900/20 rounded-xl p-10 text-center border border-blue-700/30">
              <Inbox className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">Henüz tebligat kaydı yok. Mali müşteriniz sorguladığında veya siz sorguladığınızda tebligatlar burada görünecek.</p>
            </div>
          ) : gorunenTebligatlar.length === 0 ? (
            <div className="bg-blue-900/20 rounded-xl p-10 text-center border border-blue-700/30">
              <Inbox className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">{tebligatKaynak === 'sgk' ? 'SGK' : 'Vergi Dairesi'} tebligatı bulunmuyor.</p>
            </div>
          ) : (
            <div className="bg-blue-900/20 rounded-xl border border-blue-700/30 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-blue-700/30">
                    <th className="text-left py-3 px-4 font-medium">Kurum / Belge</th>
                    <th className="text-left py-3 px-4 font-medium">Belge No</th>
                    <th className="text-left py-3 px-4 font-medium">Tebliğ Tarihi</th>
                    <th className="text-left py-3 px-4 font-medium">Durum</th>
                    <th className="text-left py-3 px-4 font-medium">Belge</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-700/20">
                  {gorunenTebligatlar.map(t => (
                    <tr key={t.belge_no || t.id} className={`hover:bg-blue-900/10 ${!effOkundu(t) ? 'bg-blue-900/20' : ''}`}>
                      <td className="py-3 px-4 text-gray-200">
                        <button
                          onClick={() => portalBelgeAc(t)}
                          disabled={tebligatIslem.belgeNo === t.belge_no}
                          className="text-left hover:text-yellow-400 transition-colors"
                          title={t.file_url ? 'Belgeyi görüntüle' : 'Belgeyi indir ve görüntüle'}
                        >
                          <div className="font-medium">{t.kurum || '-'}</div>
                          <div className="text-xs text-gray-400">{t.belge_turu || ''}</div>
                        </button>
                      </td>
                      <td className="py-3 px-4 text-gray-300 text-xs">{t.belge_no || '-'}</td>
                      <td className="py-3 px-4 text-gray-400 text-xs">{t.teblig_tarihi || '-'}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${effOkundu(t) ? 'bg-green-600/20 text-green-300' : 'bg-yellow-600/20 text-yellow-300'}`}>
                          {effOkundu(t) ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          {effOkundu(t) ? 'Okunmuş' : 'Okunmamış'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => portalBelgeAc(t)}
                            disabled={tebligatIslem.belgeNo === t.belge_no}
                            className={`inline-flex items-center gap-1.5 text-sm font-medium disabled:opacity-40 ${tebligatHazir[t.belge_no] ? 'text-cyan-400 hover:text-cyan-300' : 'text-gray-400 hover:text-cyan-300'}`}
                            title={tebligatHazir[t.belge_no] ? 'Belgeyi görüntüle' : 'Belgeyi indir ve görüntüle'}
                          >
                            <Eye className="w-4 h-4" /> Görüntüle
                          </button>
                          <button
                            onClick={() => portalBelgeIndir(t)}
                            disabled={tebligatIslem.belgeNo === t.belge_no}
                            className="inline-flex items-center gap-1.5 text-gray-300 hover:text-yellow-400 text-sm font-medium disabled:opacity-40"
                            title={t.file_url ? 'Belgeyi bilgisayarına indir' : 'Belgeyi indir (Dijital Vergi Dairesi\'nden alınır)'}
                          >
                            {tebligatIslem.belgeNo === t.belge_no
                              ? <><Loader2 className="w-4 h-4 animate-spin" /> İndiriliyor…</>
                              : <><Download className="w-4 h-4" /> İndir</>}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'fatura-kesim' && (
        <EFaturaKesim clientId={clientDetail?.id || kendiClient?.id} allowedTurs={faturaKesimTurlari} />
      )}

      {activeTab === 'invoices' && (
        <div className="space-y-6">
          {/* e-Fatura / e-Arsiv faturalari */}
          <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <h3 className="text-xl font-semibold text-white">🧾 e-Fatura / e-Arşiv Faturalarım</h3>
              {/* 2.8.4: Fatura Güncelle Talebi rozeti üst banda (BolumRehberi "?" soluna) taşındı */}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
              <select value={faturaFiltre.yil} onChange={(e) => setFaturaFiltre(p => ({ ...p, yil: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400">
                <option value="">Tüm Yıllar</option>
                {[2023, 2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select value={faturaFiltre.ay} onChange={(e) => setFaturaFiltre(p => ({ ...p, ay: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400">
                <option value="">Tüm Aylar</option>
                {['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'].map((a, i) => <option key={a} value={i + 1}>{a}</option>)}
              </select>
              <select value={faturaFiltre.tur} onChange={(e) => setFaturaFiltre(p => ({ ...p, tur: e.target.value }))} className="bg-blue-900/30 border border-yellow-400/60 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400">
                <option value="">Tümü (e-Fatura + e-Arşiv + e-SMM + UTTS + Z Raporu + Gider Fişi)</option>
                <option value="efatura">e-Fatura</option>
                <option value="earsiv">e-Arşiv</option>
                <option value="esmm">e-SMM</option>
                <option value="utts">UTTS</option>
                <option value="gumruk">İthalat (Gümrük)</option>
                <option value="zrapor">Z Raporu (Kesilen)</option>
                <option value="giderfisi">Gider Fişi (Alınan)</option>
              </select>
              <select value={faturaFiltre.faturaTuru} onChange={(e) => setFaturaFiltre(p => ({ ...p, faturaTuru: e.target.value }))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400">
                <option value="">Fatura Türü (Tümü)</option>
                <option value="SATIS">Satış (Kesilen)</option>
                <option value="ALIS">Alış (Alınan)</option>
                <option value="IADE">İade</option>
                <option value="TEVKIFAT">Tevkifat</option>
                <option value="ISTISNA">İstisna</option>
                <option value="IHRACAT">İhracat</option>
                <option value="OZELMATRAH">Özel Matrah</option>
                <option value="ITHALAT">İthalat</option>
                <option value="E-SMM">E-SMM Makbuzu</option>
                <option value="UTTS">UTTS</option>
              </select>
            </div>

            {gorunenFaturalar.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Receipt className="w-10 h-10 mx-auto mb-3 text-gray-600" />
                <p className="text-sm">Kayitli e-Fatura bulunmuyor.</p>
                <p className="text-xs text-gray-500 mt-1">Mali musaviriniz faturalari sorguladiginda burada listelenecektir.</p>
              </div>
            ) : (
              <>
              <div className="mb-4 bg-blue-900/20 border border-blue-800/30 rounded-lg px-4 py-2 text-sm overflow-x-auto">
                <table className="w-full min-w-[440px]">
                  <thead>
                    <tr className="text-xs text-gray-400">
                      <th className="text-left font-medium py-1 pr-4"></th>
                      <th className="text-right font-medium py-1 px-3">Matrah</th>
                      <th className="text-right font-medium py-1 px-3">KDV</th>
                      <th className="text-right font-medium py-1 pl-3">Toplam</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-1.5 pr-4 text-blue-300 whitespace-nowrap">Alınan ({gorunenFaturalar.filter(f => f.yon !== 'giden').length} fatura)</td>
                      <td className="py-1.5 px-3 text-right text-blue-100 whitespace-nowrap">{faturaToplamlari.alinan.matrah.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                      <td className="py-1.5 px-3 text-right text-blue-100 whitespace-nowrap">{faturaToplamlari.alinan.kdv.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                      <td className="py-1.5 pl-3 text-right text-blue-200 whitespace-nowrap">{faturaToplamlari.alinan.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 pr-4 text-green-300 whitespace-nowrap">Kesilen ({gorunenFaturalar.filter(f => f.yon === 'giden').length} fatura)</td>
                      <td className="py-1.5 px-3 text-right text-green-100 whitespace-nowrap">{faturaToplamlari.kesilen.matrah.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                      <td className="py-1.5 px-3 text-right text-green-100 whitespace-nowrap">{faturaToplamlari.kesilen.kdv.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                      <td className="py-1.5 pl-3 text-right text-green-200 whitespace-nowrap">{faturaToplamlari.kesilen.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 pr-4 text-yellow-300 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          Kredi Kartı Tahsilatı
                          <button
                            onClick={krediKartiSorgula}
                            disabled={krediKartiYukleniyor || !faturaFiltre.ay}
                            title="Dijital Vergi Dairesi'nden sorgula"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 disabled:opacity-50 text-[10px]"
                          >
                            {krediKartiYukleniyor ? <Loader2 className="w-3 h-3 animate-spin" /> : <CreditCard className="w-3 h-3" />}
                            Sorgula
                          </button>
                        </div>
                      </td>
                      <td className="py-1.5 px-3 text-right text-gray-400 whitespace-nowrap" colSpan={2}>Banka POS + Ödeme/e-Para</td>
                      <td className="py-1.5 pl-3 text-right text-yellow-200 whitespace-nowrap">
                        {krediKartiYukleniyor ? '...' : (krediKarti ? krediKarti.toplam_tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : (faturaFiltre.ay ? '0,00' : '-'))} TL
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="overflow-x-auto">
                {faturaGruplari(gorunenFaturalar).map(grup => (
                  <div key={grup.anahtar} className="mb-7">
                    <h4 className="text-sm font-semibold text-yellow-400 mb-3">
                      {grup.ayAd ? `${grup.ayAd} ${grup.yil}` : 'Tarihsiz'}
                      <span className="ml-2 text-xs text-gray-500 font-normal">({grup.ogeler.length} fatura)</span>
                    </h4>
                    <FisDokumTablosu faturalar={grup.ogeler.filter(fisKaydiMi)} detaylar={kdvDetaylar} onAc={setFisGoster} />
                    {grup.ogeler.some(fatura => !fisKaydiMi(fatura)) && <table className="w-full">
                      <thead>
                        <tr className="text-left text-gray-400 text-sm border-b border-blue-800/30">
                          <th className="pb-3">Tarih</th>
                          <th className="pb-3">Yon</th>
                          <th className="pb-3">Tür</th>
                          <th className="pb-3">Fatura Türü</th>
                          <th className="pb-3">Fatura No</th>
                          <th className="pb-3">Karsi Taraf</th>
                          <th className="pb-3 text-right">Matrah</th>
                          <th className="pb-3 text-right">KDV</th>
                          <th className="pb-3 text-right">Toplam</th>
                          <th className="pb-3">Islem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grup.ogeler.filter(fatura => !fisKaydiMi(fatura)).map(f => {
                          const cokluKdv = kdvDetaylar[f.id]?.length > 1
                          return (
                          <Fragment key={f.id}>
                            {/* Coklu KDV: oran basina ayri satir */}
                            {cokluKdv ? kdvDetaylar[f.id].map((d, detaySira) => (
                              <tr
                                key={`${f.id}-kdv-${d.oran}`}
                                onClick={() => { const u = f.html_url || f.pdf_url || f.xml_url; if (u) faturaAc(f) }}
                                className={`border-b border-blue-800/20 text-gray-300 ${f.html_url || f.pdf_url || f.xml_url ? 'cursor-pointer hover:bg-blue-900/20' : ''}`}
                                title={f.html_url || f.pdf_url || f.xml_url ? 'Faturayi goruntulemek icin tiklayin' : ''}
                              >
                                <td className="py-3 text-sm">{f.tarih ? formatDateTR(f.tarih) : '-'}</td>
                                <td className="py-3">
                                  <span className={`px-2 py-1 rounded text-xs ${f.yon === 'giden' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                    {f.yon === 'giden' ? 'Kesilen' : 'Alinan'}
                                  </span>
                                </td>
                                <td className="py-3 text-sm whitespace-nowrap">{belgeTuruAdi(f) || '-'}</td>
                                <td className="py-3 text-sm whitespace-nowrap">{faturaTurEtiketi(f) || '-'}</td>
                                <td className="py-3 text-sm">{f.fatura_no || '-'}</td>
                                <td className="py-3 text-sm max-w-[200px] truncate" title={f.karsi_unvan || f.karsi_vkn || ''}>{f.karsi_unvan || f.karsi_vkn || '-'}</td>
                                <td className="py-3 text-sm text-right whitespace-nowrap">{d.matrah != null ? d.matrah.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}</td>
                                <td className="py-3 text-sm whitespace-nowrap">
                                  {d.kdv != null ? (
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="inline-flex items-center justify-center min-w-[2rem] bg-green-500/20 text-green-400 rounded-full px-1.5 py-0.5 text-xs font-medium text-center">{d.oran}</span>
                                      <span>{d.kdv.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                  ) : '-'}
                                </td>
                                <td className="py-3 text-sm font-medium text-white text-right whitespace-nowrap">
                                  {(d.matrah != null && d.kdv != null) ? `${(f.para_birimi && f.para_birimi !== 'TRY' && f.doviz_kur ? ((Number(d.matrah) + Number(d.kdv)) * Number(f.doviz_kur)) : (d.matrah + d.kdv)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${(f.para_birimi && f.para_birimi !== 'TRY' && f.doviz_kur) ? 'TRY' : (f.para_birimi || 'TRY')}` : '-'}
                                </td>
                                <td className="py-3">
                                  <div className="flex space-x-2">
                                    {(f.html_url || f.pdf_url) && (
                                      <button onClick={(e) => { e.stopPropagation(); faturaAc(f) }} title={f.html_url ? 'Faturayi Goruntule (e-Belge)' : 'Faturayi Goruntule (PDF)'} className={`p-1.5 rounded-lg ${f.html_url ? 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30' : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'}`}>
                                        <Eye className="w-4 h-4" />
                                      </button>
                                    )}
                                    {f.xml_url && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          const ad = (f.tur === 'utts' || f.tur === 'gumruk')
                                            ? `${(f.fatura_uuid || 'rapor').replace(/[^\w-]/g, '_')}.xlsx`
                                            : `${(f.fatura_uuid || 'fatura').replace(/[^\w-]/g, '_')}.xml`
                                          dosyaIndir(f.xml_url, ad)
                                        }}
                                        title={f.tur === 'utts' || f.tur === 'gumruk' ? 'Excel Indir' : 'XML Indir'}
                                        className="p-1.5 bg-green-500/20 rounded-lg text-green-400 hover:bg-green-500/30"
                                      >
                                        <Download className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )) : (
                          <tr
                            onClick={() => { const u = f.html_url || f.pdf_url || f.xml_url; if (u) faturaAc(f) }}
                            className={`border-b border-blue-800/20 text-gray-300 ${f.html_url || f.pdf_url || f.xml_url ? 'cursor-pointer hover:bg-blue-900/20' : ''}`}
                            title={f.html_url || f.pdf_url || f.xml_url ? 'Faturayi goruntulemek icin tiklayin' : ''}
                          >
                            <td className="py-3 text-sm">{f.tarih ? formatDateTR(f.tarih) : '-'}</td>
                            <td className="py-3">
                              <span className={`px-2 py-1 rounded text-xs ${f.yon === 'giden' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                {f.yon === 'giden' ? 'Kesilen' : 'Alinan'}
                              </span>
                            </td>
                            <td className="py-3 text-sm whitespace-nowrap">{belgeTuruAdi(f) || '-'}</td>
                            <td className="py-3 text-sm whitespace-nowrap">{faturaTurEtiketi(f) || '-'}</td>
                            <td className="py-3 text-sm">{f.fatura_no || '-'}</td>
                            <td className="py-3 text-sm max-w-[200px] truncate" title={f.karsi_unvan || f.karsi_vkn || ''}>{f.karsi_unvan || f.karsi_vkn || '-'}</td>
                            <td className="py-3 text-sm text-right whitespace-nowrap">{f.matrah != null ? Number(f.matrah).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}</td>
                            <td className="py-3 text-sm whitespace-nowrap">
                              {f.kdv != null ? (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="flex items-center gap-1">
                                    {kdvDetaylar[f.id]?.length > 1
                                      ? kdvDetaylar[f.id].map(d => (
                                        <span key={d.oran} className="inline-block bg-green-500/20 text-green-400 rounded-full px-1.5 py-0.5 text-xs font-medium">{d.oran}</span>
                                      ))
                                      : (kdvDetaylar[f.id]?.length === 1 && (
                                        <span className="inline-flex items-center justify-center min-w-[2rem] bg-green-500/20 text-green-400 rounded-full px-1.5 py-0.5 text-xs font-medium text-center">{kdvDetaylar[f.id][0].oran}</span>
                                      ))}
                                  </span>
                                  <span>{Number(f.kdv).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                                </div>
                              ) : '-'}
                            </td>
                            <td className="py-3 text-sm font-medium text-white text-right whitespace-nowrap">
                              {f.tutar != null ? (f.para_birimi && f.para_birimi !== 'TRY' && f.doviz_kur ? `${(Number(f.tutar) * Number(f.doviz_kur)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TRY` : `${Number(f.tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${f.para_birimi || 'TRY'}`) : '-'}
                            </td>
                            <td className="py-3">
                              <div className="flex space-x-2">
                                {(f.html_url || f.pdf_url) && (
                                  <button onClick={(e) => { e.stopPropagation(); faturaAc(f) }} title={f.html_url ? 'Faturayi Goruntule (e-Belge)' : 'Faturayi Goruntule (PDF)'} className={`p-1.5 rounded-lg ${f.html_url ? 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30' : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'}`}>
                                    <Eye className="w-4 h-4" />
                                  </button>
                                )}
                                {(!f.html_url && !f.pdf_url && f.xml_url && f.tur !== 'utts' && f.tur !== 'gumruk') && (
                                  <button onClick={(e) => { e.stopPropagation(); faturaAc(f) }} title="Faturayi Goruntule (okunabilir)" className="p-1.5 bg-cyan-500/20 rounded-lg text-cyan-400 hover:bg-cyan-500/30">
                                    <Eye className="w-4 h-4" />
                                  </button>
                                )}
                                {f.xml_url && (f.tur === 'utts' || f.tur === 'gumruk') && (
                                  <button onClick={(e) => { e.stopPropagation(); faturaAc(f) }} title="Fiş Görüntüle" className="p-1.5 bg-cyan-500/20 rounded-lg text-cyan-400 hover:bg-cyan-500/30">
                                    <Eye className="w-4 h-4" />
                                  </button>
                                )}
                                {f.xml_url && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      const ad = (f.tur === 'utts' || f.tur === 'gumruk')
                                        ? `${(f.fatura_uuid || 'rapor').replace(/[^\w-]/g, '_')}.xlsx`
                                        : `${(f.fatura_uuid || 'fatura').replace(/[^\w-]/g, '_')}.xml`
                                      dosyaIndir(f.xml_url, ad)
                                    }}
                                    title={f.tur === 'utts' || f.tur === 'gumruk' ? 'Excel Indir' : 'XML Indir'}
                                    className="p-1.5 bg-green-500/20 rounded-lg text-green-400 hover:bg-green-500/30"
                                  >
                                    <Download className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                            )}
                          </Fragment>
                          )
                        })}
                      </tbody>
                    </table>}
                  </div>
                ))}
              </div>
              </>
            )}
          </div>

          {/* Uygulama ici fatura goruntuleyici */}
          {gosterilenFatura && (
            <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 md:p-6" onClick={() => setGosterilenFatura(null)}>
              <div className="bg-blue-950 rounded-2xl border border-blue-700/40 w-full max-w-5xl h-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-blue-800/40">
                  <div className="min-w-0">
                    <div className="text-white font-semibold truncate">{gosterilenFatura.f.fatura_no || 'Fatura'}</div>
                    <div className="text-xs text-gray-400 truncate">
                      {gosterilenFatura.f.tarih ? formatDateTR(gosterilenFatura.f.tarih) : ''}
                      {' · '}{gosterilenFatura.f.yon === 'giden' ? 'Kesilen' : 'Alinan'}
                      {' · '}{gosterilenFatura.f.karsi_unvan || gosterilenFatura.f.karsi_vkn || '-'}
                      {gosterilenFatura.f.tutar != null ? ` · ${gosterilenFatura.f.para_birimi && gosterilenFatura.f.para_birimi !== 'TRY' && gosterilenFatura.f.doviz_kur ? `${(Number(gosterilenFatura.f.tutar) * Number(gosterilenFatura.f.doviz_kur)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TRY` : `${Number(gosterilenFatura.f.tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${gosterilenFatura.f.para_birimi || 'TRY'}`}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {gosterilenFatura.src && (
                      <>
                        <a href={gosterilenFatura.src} download={`${(gosterilenFatura.f.fatura_no || 'fatura').replace(/[^\w-]/g, '_')}.${gosterilenFatura.tip === 'pdf' ? 'pdf' : gosterilenFatura.tip === 'xml' ? 'xml' : 'html'}`} title="Indir" className="p-2 bg-green-500/20 rounded-lg text-green-400 hover:bg-green-500/30">
                          <Download className="w-4 h-4" />
                        </a>
                        <a href={gosterilenFatura.src} target="_blank" rel="noreferrer" title="Yeni sekmede ac" className="p-2 bg-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/30">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </>
                    )}
                    <button onClick={() => setGosterilenFatura(null)} title="Kapat" className="p-2 bg-red-500/20 rounded-lg text-red-400 hover:bg-red-500/30">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {gosterilenFatura.yukleniyor ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
                    <RefreshCw className="w-6 h-6 animate-spin" />
                    <span className="text-sm">Fatura okunabilir bicimde hazirlaniyor...</span>
                  </div>
                ) : gosterilenFatura.src ? (
                  <iframe src={gosterilenFatura.src} title="Fatura" className="flex-1 w-full bg-white" />
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Fatura gosterilemiyor.</div>
                )}
              </div>
            </div>
          )}

          {/* UTTS fiş görüntüleyici */}
          {fisGoster && <FisModal f={fisGoster} onClose={() => setFisGoster(null)} />}

          {/* Mali musavir makbuzlari */}
          <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-white">Makbuzlarım</h3>
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
        </div>
      )}

      {activeTab === 'kdvdokum' && (
        <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <h3 className="text-xl font-semibold text-white">KDV Dökümleri</h3>
              <p className="text-gray-500 text-xs mt-1">Dijital Vergi Dairesi'nden POS, KDV 109 ve KDV 110 sorgulamaları</p>
            </div>
          </div>
          <KdvDokumTab clientId={clientDetail?.id || kendiClient?.id} />
        </div>
      )}

      {activeTab === 'cari-hesap' && (
        <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30 relative">
          <div className="mb-6">
            <h3 className="text-xl font-semibold text-white">Cari Hesap Takip</h3>
            <p className="text-gray-500 text-xs mt-1">Müşteri ve tedarikçi carileriniz, hareketleriniz ve ekstreleriniz</p>
          </div>
          <CariHesapModul clientId={clientDetail?.id || kendiClient?.id} firmAdi={clientDetail?.name} />
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
          ) : duyuruListesi.length === 0 ? (
            <div className="text-center py-8 text-gray-400">Henuz bildirim bulunmuyor.</div>
          ) : (
            <div className="space-y-4">
              {duyuruListesi.map((n) => (
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

          {/* Elle Giriş — Z Raporu / Gider Fişi (muhabeci onayına gider) */}
          <div className="bg-blue-950/30 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <h3 className="text-xl font-semibold text-white">⌨️ Elle Giriş</h3>
              <span className="text-gray-400 text-xs">Tutarlar KDV dahildir — matrah ve KDV otomatik hesaplanır</span>
              <button
                onClick={() => setPortalElleAcik(a => !a)}
                className="ml-auto flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-4 py-2 text-sm font-medium transition"
              >
                {portalElleAcik ? 'Kapat' : 'Kayıt Ekle'}
              </button>
            </div>
            {portalElleAcik && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  {[['z', 'Z Raporu'], ['fis', 'Gider Fişi']].map(([deger, etiket]) => (
                    <button key={deger} onClick={() => { setPortalElleTip(deger); setPortalElleSatirlar([elleBosSatir(deger)]) }}
                      className={`rounded-lg px-4 py-1.5 text-xs font-bold transition ${portalElleTip === deger ? 'bg-amber-600 text-white' : 'bg-blue-900/40 text-gray-300 hover:bg-blue-800/60'}`}>
                      {etiket}
                    </button>
                  ))}
                </div>
                {portalElleHata && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-2">{portalElleHata}</div>}
                {portalElleMesaj && <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm rounded-lg px-4 py-2">{portalElleMesaj}</div>}
                <FisElleEkleTablosu
                  tip={portalElleTip}
                  satirlar={portalElleSatirlar}
                  setSatirlar={setPortalElleSatirlar}
                  baslik={`${portalElleTip === 'z' ? 'Z Raporu' : 'Gider Fişi'} — Elle Giriş`}
                  bilgi={<span className="text-cyan-300 font-semibold text-sm">{clientDetail?.name || clientDetail?.company || ''}</span>}
                  ipucu="Kaydettiğiniz kayıtlar muhasebecinin onayına gider; onaylandıktan sonra faturalara işlenir."
                  onKapat={() => setPortalElleAcik(false)}
                  kaydet={portalElleKaydet}
                  kaydediyor={portalElleKaydediyor}
                  kaydetEtiketi="Onaya Gönder"
                  idOnek="portal-elle"
                />
              </div>
            )}
          </div>

          {/* Taramalarım — gönderilen belgeler + onay durumu */}
          <PortalTaramalarim clientId={clientDetail?.id} refreshKey={portalTaramaTazele} />
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
            <h3 className="text-xl font-semibold text-white">👤 Ayarlar</h3>
            <button
              onClick={async () => {
                if (showProfileEdit) {
                  // Kaydet modu
                  if (!clientId) {
                    // Admin/personel: client kaydi yok — kullanici hesabi (profiles) guncellenir
                    const rol = user?.role
                    if (rol === 'admin' || rol === 'super_admin' || rol === 'personel') {
                      setProfileSaving(true)
                      try {
                        const p = {}
                        if (editProfile.name) p.name = editProfile.name
                        if (editProfile.email) p.email = editProfile.email
                        const { error } = await supabase.from('profiles').update(p).eq('id', user.id)
                        if (error) throw error
                        setShowProfileEdit(false)
                        alert('Kullanici hesabi guncellendi.')
                      } catch (err) {
                        console.error('Kullanici profili kaydetme hatasi:', err)
                        alert('Profil kaydedilemedi: ' + (err.message || 'Bilinmeyen hata'))
                      } finally {
                        setProfileSaving(false)
                      }
                    } else {
                      alert('Musteri ID bulunamadi, kaydedilemedi.')
                    }
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
              {/* 2.7.543: Namaz vakitleri / imsakiye ac-kapa (varsayilan kapali) */}
              <div className="bg-blue-900/20 rounded-xl p-4 md:col-span-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start space-x-3">
                    <span className="text-2xl leading-none" aria-hidden="true">🕌</span>
                    <div>
                      <span className="text-gray-300 text-sm font-medium">Namaz Vakitleri / İmsakiye</span>
                      <p className="text-gray-500 text-xs mt-0.5">Açık olursa ana ekran üst bandında yaklaşan namaz vakti gösterilir; üzerine gelince günlük tüm vakitler açılır.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={namazGoster}
                    onClick={() => namazDegistir(!namazGoster)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${namazGoster ? 'bg-emerald-500' : 'bg-blue-700/60'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${namazGoster ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>
              {/* 2.7.546: Web Radyo ac-kapa (varsayilan kapali) */}
              <div className="bg-blue-900/20 rounded-xl p-4 md:col-span-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start space-x-3">
                    <span className="text-2xl leading-none" aria-hidden="true">📻</span>
                    <div>
                      <span className="text-gray-300 text-sm font-medium">Web Radyo</span>
                      <p className="text-gray-500 text-xs mt-0.5">Açık olursa ana ekran üst bandında radyo rozeti gösterilir; açılır listeden yerli ve yabancı radyo istasyonları dinlenir. Favoriler ve ses ayarı kaydedilir.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={radyoGoster}
                    onClick={() => radyoDegistir(!radyoGoster)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${radyoGoster ? 'bg-emerald-500' : 'bg-blue-700/60'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${radyoGoster ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>
              {/* 2.7.546: YouTube Müzik ac-kapa (varsayilan kapali) */}
              <div className="bg-blue-900/20 rounded-xl p-4 md:col-span-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start space-x-3">
                    <span className="text-2xl leading-none" aria-hidden="true">▶️</span>
                    <div>
                      <span className="text-gray-300 text-sm font-medium">YouTube Müzik</span>
                      <p className="text-gray-500 text-xs mt-0.5">Açık olursa ana ekran üst bandında YouTube Müzik rozeti gösterilir; şarkı arama ve hazır listeler küçük ayrı pencerede dinlenir.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={ytMuzikGoster}
                    onClick={() => ytMuzikDegistir(!ytMuzikGoster)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${ytMuzikGoster ? 'bg-emerald-500' : 'bg-blue-700/60'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${ytMuzikGoster ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>
              {/* 2.7.546: Spotify ac-kapa (varsayilan kapali) */}
              <div className="bg-blue-900/20 rounded-xl p-4 md:col-span-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start space-x-3">
                    <span className="text-2xl leading-none" aria-hidden="true">🎧</span>
                    <div>
                      <span className="text-gray-300 text-sm font-medium">Spotify</span>
                      <p className="text-gray-500 text-xs mt-0.5">Açık olursa ana ekran üst bandında Spotify rozeti gösterilir; şarkı arama ve hazır listeler küçük ayrı pencerede dinlenir (Spotify üyeliği gerekir).</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={spotifyGoster}
                    onClick={() => spotifyDegistir(!spotifyGoster)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${spotifyGoster ? 'bg-emerald-500' : 'bg-blue-700/60'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${spotifyGoster ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
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