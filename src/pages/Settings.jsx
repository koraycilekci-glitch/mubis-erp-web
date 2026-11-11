import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getSettings, saveSettings, getDefaultDocumentPermissions, parseDocumentPermissions, getDefaultDocumentFolders, parseDocumentFolders } from '../services/settingsService'
import { getBankInfo, saveBankInfo, getBankAccounts, saveBankAccounts } from '../services/paymentService'
import { gibYardimciIs, yardimciFetch } from '../utils/gibOdemeHelper'
import { Settings as SettingsIcon, Lock, Clock, Users, Eye, EyeOff, CheckCircle, AlertCircle, Save, RefreshCw, MessageCircle, Mail, FolderOpen, FolderTree, Plus, Minus, Trash2, Pencil, Volume2, Play, CreditCard, Building2, Link2, Bot, Landmark, Shield } from 'lucide-react'
import FolderStructureEditor from '../components/FolderStructureEditor'
import PlanDilimSatirlari from '../components/PlanDilimSatirlari'
import { SES_TERCIHLERI, VARSAYILAN_SES_AYARI, seslerHazirOlunca, sesSec, konus, sesAyariCoz, sesDestekleniyor, sesCinsiyeti, cinsiyetSesiVar } from '../utils/speechUtils'
import { dilimleriGunlereBol, dilimNormalize, dilimGecerli } from '../utils/planDilim'

export default function Settings() {
  const { user, profile, updatePassword } = useAuth()
  const [activeTab, setActiveTab] = useState('password')
  
  // Sifre degistirme
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState('')
  const [passwordErr, setPasswordErr] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)

  // Sifre sikligi
  const [passwordInterval, setPasswordInterval] = useState('never')
  const [intervalMsg, setIntervalMsg] = useState('')
  const [intervalLoading, setIntervalLoading] = useState(false)

  // Admin: Kullanici yonetimi
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [newUserPassword, setNewUserPassword] = useState('')
  const [adminMsg, setAdminMsg] = useState('')
  const [adminErr, setAdminErr] = useState('')
  const [adminLoading, setAdminLoading] = useState(false)
  const [showNewUserForm, setShowNewUserForm] = useState(false)
  const [newUserForm, setNewUserForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'personel'
  })
  const [createLoading, setCreateLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [editingUser, setEditingUser] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', email: '', role: 'personel', mukellef: false })

  // Ana ekran asistani cinsiyeti (erkek/kadin) — localStorage'da tutulur
  const [adminCinsiyet, setAdminCinsiyet] = useState(() => localStorage.getItem('admin_cinsiyet_v1') || 'erkek')
  // 2.7.543: ana ekranda namaz vakitleri/imsakiye (varsayilan kapali)
  const [namazGoster, setNamazGoster] = useState(() => localStorage.getItem('admin_namaz_v1') === '1')
  // 2.7.546: ana ekranda web radyo (varsayilan kapali)
  const [radyoGoster, setRadyoGoster] = useState(() => localStorage.getItem('admin_radio_v1') === '1')
  // 2.7.546: ana ekranda YouTube Müzik (varsayilan kapali)
  const [ytMuzikGoster, setYtMuzikGoster] = useState(() => localStorage.getItem('admin_ytmusic_v1') === '1')
  // 2.7.546: ana ekranda Spotify (varsayilan kapali)
  const [spotifyGoster, setSpotifyGoster] = useState(() => localStorage.getItem('admin_spotify_v1') === '1')
  const cinsiyetKaydet = (c) => {
    setAdminCinsiyet(c)
    localStorage.setItem('admin_cinsiyet_v1', c)
  }

  useEffect(() => {
    if (activeTab === 'masaustu-asistan') adminAtaDurumGetir()
  }, [activeTab])

  // Yardimci programi "yonetici olarak calistir"a sabitleme (guncelleme
  // sonrasi tekrar tanimlama gereksinimini kaldirir)
  const [adminAta, setAdminAta] = useState(null) // null=bilinmiyor, true/false
  const [adminAtaMsg, setAdminAtaMsg] = useState('')
  const adminAtaDurumGetir = async () => {
    try {
      const s = await gibYardimciIs('admin-durum', {})
      setAdminAta(s?.ok ? !!s.ata : null)
    } catch { setAdminAta(null) }
  }
  const adminAtaKaydet = async (acik) => {
    setAdminAtaMsg('')
    try {
      const s = await gibYardimciIs('admin-ata', { acik })
      if (s?.ok) { setAdminAta(acik); setAdminAtaMsg(acik ? 'Yardimci program "yonetici olarak calistir"a sabitlendi' : 'Yonetici bayragi kaldirildi') }
      else setAdminAtaMsg('Islem basarisiz: ' + (s?.hata || '?'))
    } catch {
      setAdminAta('MUBiS yardimci programi bu bilgisayarda calismiyor')
    }
  }

  // 2.8.0: Sunucu yardimcisi (VPS) ayarlari — localStorage 'mubis_sunucu'
  const [sunucuUrl, setSunucuUrl] = useState('')
  const [sunucuMsg, setSunucuMsg] = useState('')
  const [sunucuAktif, setSunucuAktif] = useState(false)
  const sunucuAyarOkuLocal = () => {
    try { return JSON.parse(localStorage.getItem('mubis_sunucu') || 'null') } catch { return null }
  }
  useEffect(() => {
    const mevcut = sunucuAyarOkuLocal()
    if (mevcut) {
      setSunucuUrl(mevcut.url || '')
      if ('anahtar' in mevcut) localStorage.setItem('mubis_sunucu', JSON.stringify({ url: mevcut.url || '' }))
    }
    setSunucuAktif(!!mevcut?.url)
  }, [])
  const sunucuAyarKaydet = () => {
    setSunucuMsg('')
    const url = String(sunucuUrl || '').trim().replace(/\/+$/, '')
    if (!url) {
      localStorage.removeItem('mubis_sunucu')
      setSunucuAktif(false)
      setSunucuMsg('Sunucu ayari kaldirildi — yerel yardimci program kullanilacak')
      return
    }
    localStorage.setItem('mubis_sunucu', JSON.stringify({ url }))
    setSunucuAktif(true)
    setSunucuMsg('Kaydedildi — isler artik sunucu yardimcisina gidecek')
  }
  const sunucuTestEt = async () => {
    setSunucuMsg('Test ediliyor...')
    try {
      const url = String(sunucuUrl || '').trim().replace(/\/+$/, '')
      if (!url) { setSunucuMsg('Once sunucu adresi girin'); return }
      // 2.8.2: HTTPS sayfadan http://VPS'e dogru fetch mixed-content engeline
      // takilir — test de ayni-origin proxy (/api/yardimci) uzerinden yapilir.
      const r = await yardimciFetch('/api/yardimci/ping', { signal: AbortSignal.timeout(15000) })
      const j = await r.json().catch(() => ({}))
      if (j?.app === 'mubis-gib-yardimci') setSunucuMsg(`Baglanti basarili — surum ${j.version || '?'} (mod: ${j.mod || 'yerel'})`)
      else setSunucuMsg('Yanit yardimci servisten gelmedi: ' + JSON.stringify(j).slice(0, 120))
    } catch (e) {
      setSunucuMsg('Sunucuya ulasilamadi: ' + (e?.message || ''))
    }
  }

  // Iletisim ayarlari
  const [commSettings, setCommSettings] = useState({
    whatsapp_phone_number_id: '',
    whatsapp_access_token: '',
    whatsapp_template_name: 'beyanname_bildirim',
    whatsapp_web_kaynak: 'vps',
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    smtp_pass: '',
    smtp_from: '',
    smtp_secure: 'false',
    odeme_hatirlatma_gun: '5',
    payment_provider: 'paytr',
    payment_providers_enabled: JSON.stringify(['paytr']),
    client_document_permissions: JSON.stringify(getDefaultDocumentPermissions())
  })
  const [commLoading, setCommLoading] = useState(false)
  const [commMsg, setCommMsg] = useState('')
  const [commErr, setCommErr] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [showSmtpPass, setShowSmtpPass] = useState(false)
  // WhatsApp Web QR baglanti durumu
  const [waQrDurum, setWaQrDurum] = useState('') // '' | kontrol | qr-yukleniyor | qr-hazir | bagli | bagli-degil | hata
  const [waQrGoruntu, setWaQrGoruntu] = useState('')
  const [waQrHata, setWaQrHata] = useState('')

  // Evrak gorunurlugu
  const [docPermissions, setDocPermissions] = useState(getDefaultDocumentPermissions())
  const [docPermLoading, setDocPermLoading] = useState(false)
  const [docPermMsg, setDocPermMsg] = useState('')
  const [docPermErr, setDocPermErr] = useState('')

  // Evrak klasor yapisi
  const [docFolders, setDocFolders] = useState(getDefaultDocumentFolders())
  const [folderLoading, setFolderLoading] = useState(false)
  const [folderMsg, setFolderMsg] = useState('')
  const [folderErr, setFolderErr] = useState('')

  // Banka bilgileri (EFT/Havale) — coklu hesap destegi
  const [bankInfo, setBankInfo] = useState({ banka: '', hesapSahibi: '', iban: '' })
  const [bankalar, setBankalar] = useState([{ banka: '', hesapSahibi: '', iban: '' }])
  const [ibanKopyalandi, setIbanKopyalandi] = useState(-1)
  const [bankInfoLoading, setBankInfoLoading] = useState(false)
  const [bankInfoMsg, setBankInfoMsg] = useState('')
  const [bankInfoErr, setBankInfoErr] = useState('')
  // Etkin odeme kuruluslari (coklu secim)
  const [enabledProviders, setEnabledProviders] = useState(['paytr'])
  // Aktif odeme kurulusu (iclerinden secilen)
  const [activeProviderLocal, setActiveProviderLocal] = useState('paytr')

  // Luca Baglanti Merkezi (e-Fatura/e-Arsiv sorgulama) - 3 alanli giris
  const [lucaInfo, setLucaInfo] = useState({ member: '', username: '', password: '' })
  const [lucaEdit, setLucaEdit] = useState({ member: '', username: '', password: '' })
  const [lucaLoading, setLucaLoading] = useState(false)
  const [lucaMsg, setLucaMsg] = useState('')
  const [lucaErr, setLucaErr] = useState('')
  const [showLucaPass, setShowLucaPass] = useState(false)

  // GIB Baglanti Merkezi (admin vergi dairesi hesabi — beyan otomasyonu bununla iner)
  const [gibInfo, setGibInfo] = useState({ kullanici: '', parola: '' })
  const [gibEdit, setGibEdit] = useState({ kullanici: '', parola: '' })
  const [gibLoading, setGibLoading] = useState(false)
  const [gibMsg, setGibMsg] = useState('')
  const [gibErr, setGibErr] = useState('')
  const [showGibPass, setShowGibPass] = useState(false)

  // Kayit Klasorleri (admin) — beyanname + fatura gelen/giden klasorleri.
  // Her muhasebeci (ofis) kendi yollarini ayarlayabilir.
  const [klasorInfo, setKlasorInfo] = useState({ beyanname: '', gelen: '', giden: '' })
  const [klasorEdit, setKlasorEdit] = useState({ beyanname: '', gelen: '', giden: '' })
  const [klasorLoading, setKlasorLoading] = useState(false)
  const [klasorMsg, setKlasorMsg] = useState('')
  const [klasorErr, setKlasorErr] = useState('')

  useEffect(() => {
    loadCommSettings()
    loadBankInfoData()
    loadLucaInfo()
    loadGibInfo()
    loadKlasorleri()
  }, [])

  const loadGibInfo = async () => {
    try {
      const settings = await getSettings()
      setGibInfo({ kullanici: settings.admin_gib_kullanici_kodu || '', parola: settings.admin_gib_parola || '' })
      setGibEdit({ kullanici: settings.admin_gib_kullanici_kodu || '', parola: settings.admin_gib_parola || '' })
    } catch (err) {
      console.error('GIB bilgileri yuklenemedi:', err)
    }
  }

  const handleGibSave = async () => {
    setGibLoading(true)
    setGibMsg('')
    setGibErr('')
    try {
      await saveSettings({ admin_gib_kullanici_kodu: gibEdit.kullanici.trim(), admin_gib_parola: gibEdit.parola })
      setGibInfo({ ...gibEdit, kullanici: gibEdit.kullanici.trim() })
      setGibMsg('GİB bağlantı bilgileri kaydedildi. Beyan onay otomasyonu bu hesapla inecek.')
    } catch (err) {
      setGibErr('GİB bilgileri kaydedilemedi: ' + (err.message || 'Bilinmeyen hata'))
    } finally {
      setGibLoading(false)
    }
  }

  // Kayit klasorleri yukle/kaydet — adminin belirledigi G: yollari
  // (beyanname + fatura gelen/giden). Bos birakilirsa varsayilanlar kullanilir.
  const loadKlasorleri = async () => {
    try {
      const settings = await getSettings()
      const d = {
        beyanname: settings.beyanname_klasoru || "G:\\Drive'ım\\BEYANNAME",
        gelen: settings.fatura_gelen_klasoru || "G:\\Drive'ım\\EDEFTER",
        giden: settings.fatura_giden_klasoru || "G:\\Drive'ım\\EDEFTER"
      }
      setKlasorInfo(d)
      setKlasorEdit(d)
    } catch (err) {
      console.error('Klasor ayarlari yuklenemedi:', err)
    }
  }

  const handleKlasorSave = async () => {
    setKlasorLoading(true)
    setKlasorMsg('')
    setKlasorErr('')
    try {
      await saveSettings({
        beyanname_klasoru: klasorEdit.beyanname.trim(),
        fatura_gelen_klasoru: klasorEdit.gelen.trim(),
        fatura_giden_klasoru: klasorEdit.giden.trim()
      })
      const d = { beyanname: klasorEdit.beyanname.trim(), gelen: klasorEdit.gelen.trim(), giden: klasorEdit.giden.trim() }
      setKlasorInfo(d)
      setKlasorMsg('Kayıt klasörleri kaydedildi. İndirilen beyanname ve faturalar bu klasörlere kaydedilecek.')
    } catch (err) {
      setKlasorErr('Klasör ayarları kaydedilemedi: ' + (err.message || 'Bilinmeyen hata'))
    } finally {
      setKlasorLoading(false)
    }
  }

  const loadLucaInfo = async () => {
    try {
      const settings = await getSettings()
      setLucaInfo({ member: settings.luca_member || '', username: settings.luca_username || '', password: settings.luca_password || '' })
      setLucaEdit({ member: settings.luca_member || '', username: settings.luca_username || '', password: settings.luca_password || '' })
    } catch (err) {
      console.error('Luca bilgileri yuklenemedi:', err)
    }
  }

  const handleLucaSave = async () => {
    setLucaLoading(true)
    setLucaMsg('')
    setLucaErr('')
    try {
      await saveSettings({ luca_member: lucaEdit.member.trim(), luca_username: lucaEdit.username.trim(), luca_password: lucaEdit.password })
      setLucaInfo({ ...lucaEdit, member: lucaEdit.member.trim(), username: lucaEdit.username.trim() })
      setLucaMsg('Luca baglanti bilgileri kaydedildi.')
    } catch (err) {
      setLucaErr('Luca bilgileri kaydedilemedi: ' + (err.message || 'Bilinmeyen hata'))
    } finally {
      setLucaLoading(false)
    }
  }

  // Bu bilgisayarda Luca entegrasyonunu ac: MUBiS yardimci programina
  // (127.0.0.1:8765) uye/kullanici/parola gonderilir; yardimci adminMod'u acar,
  // masaustune "Luca'ya Gir" kisayolunu atar. Boylece kullanici
  // http://127.0.0.1:8765/admin-mod linkini elle ziyaret etmek zorunda kalmaz.
  const handleAdminAc = async () => {
    const uyeNo = lucaEdit.member.trim()
    const kullanici = lucaEdit.username.trim()
    const parola = lucaEdit.password
    if (!uyeNo || !kullanici || !parola) {
      setLucaErr("Bu bilgisayarda Luca'yi acmak icin Uye Numarasi, Kullanici Adi ve Parola dolu olmali.")
      return
    }
    setLucaLoading(true)
    setLucaMsg('')
    setLucaErr('')
    try {
      const resp = await fetch('http://127.0.0.1:8765/ayar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uyeNo, kullanici, parola })
      })
      if (!resp.ok) throw new Error('Yardimci program ' + resp.status + ' yaniti verdi')
      await resp.json()
      setLucaMsg("Luca entegrasyonu BU bilgisayarda acildi. Masaustunde \"Luca'ya Gir\" kisayolu olusturuldu; sorgular artik bu bilgisayardan calisir.")
    } catch (err) {
      setLucaErr('Yardimci programa ulasilamadi. MUBiS yardimci programini (2.7.98+) bu bilgisayarda kurup calistirin. (' + (err.message || '') + ')')
    } finally {
      setLucaLoading(false)
    }
  }

  const loadBankInfoData = async () => {
    try {
      const [info, liste] = await Promise.all([
        getBankInfo().catch(() => null),
        getBankAccounts().catch(() => null)
      ])
      const hesaplar = (Array.isArray(liste) ? liste : []).filter(b => b && (b.banka || b.hesapSahibi || b.iban))
      if (info) setBankInfo(info)
      setBankalar(hesaplar.length ? hesaplar : [{ banka: info?.banka || '', hesapSahibi: info?.hesapSahibi || '', iban: info?.iban || '' }])
    } catch (err) {
      console.error('Banka bilgisi yukleme hatasi:', err)
    }
  }

  const bankaGuncelle = (index, alan, deger) => {
    setBankalar(prev => prev.map((b, i) => (i === index ? { ...b, [alan]: deger } : b)))
  }

  const bankaKopyala = async (index, metin) => {
    if (!metin) return
    try {
      await navigator.clipboard.writeText(String(metin).replace(/\s/g, ''))
      setIbanKopyalandi(index)
      setTimeout(() => setIbanKopyalandi(-1), 1500)
    } catch {
      setBankInfoErr('Panoya kopyalanamadı.')
    }
  }

  const handleBankInfoSave = async () => {
    setBankInfoLoading(true)
    setBankInfoMsg('')
    setBankInfoErr('')
    try {
      await saveBankAccounts(bankalar)
      const gecerli = bankalar.filter(b => b.banka || b.hesapSahibi || b.iban)
      setBankalar(gecerli.length ? gecerli : bankalar)
      if (gecerli[0]) setBankInfo(gecerli[0])
      setBankInfoMsg(gecerli.length > 1
        ? `${gecerli.length} banka hesabı kaydedildi. Müşteri portalinde hepsi görünür ve kopyalanabilir.`
        : 'Banka bilgileri kaydedildi.')
    } catch (err) {
      setBankInfoErr('Banka bilgileri kaydedilemedi: ' + (err.message || 'Bilinmeyen hata'))
    } finally {
      setBankInfoLoading(false)
    }
  }

  // MUBIS Asistan ses ayarlari
  const [sesAyari, setSesAyari] = useState(VARSAYILAN_SES_AYARI)
  const [sesListesi, setSesListesi] = useState([])
  const [sesLoading, setSesLoading] = useState(false)
  const [sesMsg, setSesMsg] = useState('')
  const [sesErr, setSesErr] = useState('')

  useEffect(() => {
    const temizle = seslerHazirOlunca(setSesListesi)
    return temizle
  }, [])

  const handleSesSave = async () => {
    setSesLoading(true)
    setSesMsg('')
    setSesErr('')
    try {
      await saveSettings({
        ai_voice_gender: sesAyari.tercih,
        ai_voice_name: sesAyari.sesAdi || '',
        ai_voice_rate: String(sesAyari.hiz),
        ai_voice_pitch: String(sesAyari.ton)
      })
      try { localStorage.setItem('mubis_ai_voice_setting', JSON.stringify(sesAyari)) } catch { /* yoksay */ }
      setSesMsg('Asistan ses ayarlari kaydedildi!')
      setTimeout(() => setSesMsg(''), 3000)
    } catch (err) {
      setSesErr('Ayarlar kaydedilemedi: ' + err.message)
    }
    setSesLoading(false)
  }

  const loadCommSettings = async () => {
    try {
      const settings = await getSettings()
      setCommSettings(prev => ({ ...prev, ...settings }))
      setDocPermissions(parseDocumentPermissions(settings.client_document_permissions))
      setDocFolders(parseDocumentFolders(settings.client_document_folders))
      setSesAyari(sesAyariCoz(settings))
      // Odeme kuruluslari
      let enabled = ['paytr']
      try {
        const parsed = typeof settings.payment_providers_enabled === 'string'
          ? JSON.parse(settings.payment_providers_enabled)
          : settings.payment_providers_enabled
        if (Array.isArray(parsed) && parsed.length > 0) enabled = parsed
      } catch { /* varsayilan */
      }
      setEnabledProviders(enabled)
      setActiveProviderLocal(settings.payment_provider || enabled[0] || 'paytr')
    } catch (err) {
      console.error('Iletisim ayarlari yuklenemedi:', err)
    }
  }

  const handleCommSave = async () => {
    setCommLoading(true)
    setCommMsg('')
    setCommErr('')
    try {
      await saveSettings({
        ...commSettings,
        payment_providers_enabled: JSON.stringify(enabledProviders),
        payment_provider: activeProviderLocal
      })
      setCommMsg('Iletisim ayarlari kaydedildi!')
      setTimeout(() => setCommMsg(''), 3000)
    } catch (err) {
      setCommErr('Ayarlar kaydedilemedi: ' + err.message)
    }
    setCommLoading(false)
  }

  const handleProviderSetupSave = async () => {
    setCommLoading(true)
    setCommMsg('')
    setCommErr('')
    try {
      if (enabledProviders.length === 0) {
        // Online odeme kapali
        await saveSettings({ payment_provider: 'eft', payment_providers_enabled: JSON.stringify([]) })
      } else {
        const aktif = enabledProviders.includes(activeProviderLocal) ? activeProviderLocal : enabledProviders[0]
        setActiveProviderLocal(aktif)
        await saveSettings({
          ...commSettings,
          payment_providers_enabled: JSON.stringify(enabledProviders),
          payment_provider: aktif
        })
      }
      setCommMsg('Odeme kurulusu ayarlari kaydedildi!')
      setTimeout(() => setCommMsg(''), 3000)
    } catch (err) {
      setCommErr('Ayarlar kaydedilemedi: ' + err.message)
    }
    setCommLoading(false)
  }

  const handleDocPermissionSave = async () => {
    setDocPermLoading(true)
    setDocPermMsg('')
    setDocPermErr('')
    try {
      await saveSettings({
        ...commSettings,
        client_document_permissions: JSON.stringify(docPermissions)
      })
      setDocPermMsg('Evrak gorunurlugu ayarlari kaydedildi!')
      setTimeout(() => setDocPermMsg(''), 3000)
    } catch (err) {
      setDocPermErr('Ayarlar kaydedilemedi: ' + err.message)
    }
    setDocPermLoading(false)
  }

  const handleFolderSave = async () => {
    setFolderLoading(true)
    setFolderMsg('')
    setFolderErr('')
    try {
      await saveSettings({
        ...commSettings,
        client_document_folders: JSON.stringify(docFolders)
      })
      setFolderMsg('Klasor yapisi kaydedildi!')
      setTimeout(() => setFolderMsg(''), 3000)
    } catch (err) {
      setFolderErr('Klasor yapisi kaydedilemedi: ' + err.message)
    }
    setFolderLoading(false)
  }

  const toggleDocPermission = (category, beyanType = null) => {
    setDocPermissions(prev => {
      const next = { ...prev }
      if (beyanType) {
        const cat = { ...(next[category] || {}) }
        cat[beyanType] = !cat[beyanType]
        next[category] = cat
      } else {
        next[category] = !next[category]
      }
      return next
    })
  }

  useEffect(() => {
    if (profile) {
      setPasswordInterval(profile.password_change_interval || 'never')
    }
  }, [profile])

  // admin VE super_admin ayni yetkileri gorur (banka, odeme, luca, kullanici yonetimi)
  // 2.8.8: personel de tum ayarlari gorebilir — yalniz 'client' (musteri) kisitli
  const adminMi = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'personel'

  useEffect(() => {
    if (adminMi && activeTab === 'users') {
      loadUsers()
    }
  }, [activeTab, user])

  const loadUsers = async () => {
    const officeId = user?.officeId || profile?.office_id
    let query = supabase.from('profiles').select('*').order('created_at', { ascending: false })
    if (officeId) {
      query = query.eq('office_id', officeId)
    }
    const { data } = await query
    if (data) setUsers(data)
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    setPasswordMsg('')
    setPasswordErr('')

    if (newPassword.length < 6) {
      setPasswordErr('Sifre en az 6 karakter olmali')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordErr('Sifreler eslesmedi')
      return
    }

    setPasswordLoading(true)
    
    // Once mevcut sifreyle giris yaparak dogrula
    const { error: verifyErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword
    })
    
    if (verifyErr) {
      setPasswordErr('Mevcut sifre yanlis')
      setPasswordLoading(false)
      return
    }

    const result = await updatePassword(newPassword)
    setPasswordLoading(false)

    if (result.success) {
      // last_password_change guncelle
      await supabase.from('profiles').update({ last_password_change: new Date().toISOString() }).eq('id', user.id)
      setPasswordMsg('Sifre basariyla degistirildi!')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } else {
      setPasswordErr(result.error)
    }
  }

  const handleIntervalSave = async () => {
    setIntervalLoading(true)
    const { error } = await supabase.from('profiles').update({ password_change_interval: passwordInterval }).eq('id', user.id)
    setIntervalLoading(false)
    if (!error) {
      setIntervalMsg('Sifre degistirme sikligi kaydedildi!')
      setTimeout(() => setIntervalMsg(''), 3000)
    }
  }

  const handleResetUserPassword = async () => {
    if (!selectedUser || !newUserPassword) return
    setAdminMsg('')
    setAdminErr('')
    setAdminLoading(true)

    try {
      // Admin kendi sifresiyle islem yapar, secilen kullanicinin sifresini degistiremez direkt
      // Alternatif: Kullaniciya gecici sifre ata (profiles tablosunda isaretle)
      // Supabase client SDK ile baska kullanicinin sifresini degistiremeyiz
      // Cozum: Kullaniciyi silip yeniden olustur veya temp_password flag'i ile
      
      await supabase.from('profiles').update({ 
        temp_password: true,
        password_change_interval: 'never'
      }).eq('id', selectedUser.id)

      setAdminMsg(`${selectedUser.name || selectedUser.email} icin gecici sifre islendi. Kullanici bir sonraki giriste sifre degistirmek zorunda kalacak.`)
      setNewUserPassword('')
      loadUsers()
    } catch (err) {
      setAdminErr(err.message)
    }
    setAdminLoading(false)
  }

  // manage-users Cloudflare fonksiyonu oturum dogrulamasi ister:
  // Supabase access_token'i Authorization basligiyla gonderilmezse
  // "Oturum bilgisi bulunamadi" hatasi doner.
  const authBasliklari = async () => {
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    setAdminMsg('')
    setAdminErr('')
    setCreateLoading(true)

    try {
      const res = await fetch('/api/manage-users', {
        method: 'POST',
        headers: await authBasliklari(),
        body: JSON.stringify({
          ...newUserForm,
          office_id: user?.officeId || profile?.office_id || null
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kullanici olusturulamadi')

      setAdminMsg(`${newUserForm.name} kullanicisi olusturuldu.`)
      setNewUserForm({ name: '', email: '', password: '', role: 'personel' })
      setShowNewUserForm(false)
      loadUsers()
    } catch (err) {
      setAdminErr(err.message)
    }
    setCreateLoading(false)
  }

  const handleDeleteUser = async (targetUser) => {
    if (!window.confirm(`${targetUser.name || targetUser.email} kullanicisini silmek istediginize emin misiniz?`)) return
    setAdminMsg('')
    setAdminErr('')
    setAdminLoading(true)

    try {
      const res = await fetch(`/api/manage-users?userId=${targetUser.id}`, {
        method: 'DELETE',
        headers: await authBasliklari()
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kullanici silinemedi')

      setAdminMsg(`${targetUser.name || targetUser.email} silindi.`)
      if (selectedUser?.id === targetUser.id) setSelectedUser(null)
      loadUsers()
    } catch (err) {
      setAdminErr(err.message)
    }
    setAdminLoading(false)
  }

  const toggleSelectUser = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    const deletable = users.filter(u => u.id !== user.id).map(u => u.id)
    setSelectedIds(prev => prev.size === deletable.length ? new Set() : new Set(deletable))
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    if (!window.confirm(`${selectedIds.size} kullaniciyi silmek istediginize emin misiniz?`)) return
    setAdminMsg('')
    setAdminErr('')
    setAdminLoading(true)

    try {
      const res = await fetch(`/api/manage-users?userIds=${[...selectedIds].join(',')}`, {
        method: 'DELETE',
        headers: await authBasliklari()
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kullanicilar silinemedi')

      setAdminMsg(`${data.deleted || selectedIds.size} kullanici silindi.`)
      setSelectedIds(new Set())
      if (selectedUser && selectedIds.has(selectedUser.id)) setSelectedUser(null)
      loadUsers()
    } catch (err) {
      setAdminErr(err.message)
    }
    setAdminLoading(false)
  }

  const openEditUser = (u) => {
    setEditingUser(u)
    // 2.7.622: musteri/client rolleri seçim listesinde "Müşteri" olarak
    // gösterilir — liste eşleşmezse select ekranda ilk seçeneği gösterir ama
    // formda eski rol kalır, Kaydet'te değişiklik sessizce geri alınır.
    setEditForm({ name: u.name || '', email: u.email || '', role: (u.role === 'client' ? 'musteri' : u.role) || 'personel', mukellef: !!u.mukellef })
  }

  const handleUpdateUser = async (e) => {
    e.preventDefault()
    setAdminMsg('')
    setAdminErr('')
    setAdminLoading(true)

    try {
      const res = await fetch('/api/manage-users', {
        method: 'POST',
        headers: await authBasliklari(),
        body: JSON.stringify({ action: 'update', userId: editingUser.id, ...editForm })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kullanici guncellenemedi')

      setAdminMsg(`${editForm.name || editForm.email} guncellendi.`)
      setEditingUser(null)
      loadUsers()
    } catch (err) {
      setAdminErr(err.message)
    }
    setAdminLoading(false)
  }

  // ---- 2.8.47: Otomatik borc sorgulama — her tür için ayrı çoklu gün+saat ----
  const BORC_CRON_TURLAR = [
    { v: 'vergi', e: 'Vergi Borcu (GİB)' },
    { v: 'sgk', e: 'SGK Borcu' }
  ]
  const [borcCronYukleniyor, setBorcCronYukleniyor] = useState(true)
  const [borcCronPlan, setBorcCronPlan] = useState(null)
  // Her tür kendi dilim listesini taşır: { vergi: { aktif, zamanlar:[{gunler_ay:[5],saat:'06:00'}] }, ... }
  const [borcCronTurlarPlan, setBorcCronTurlarPlan] = useState({
    vergi: { aktif: true, zamanlar: [{ gunler_ay: [5], saat: '06:00' }] },
    sgk: { aktif: true, zamanlar: [{ gunler_ay: [5], saat: '06:30' }] }
  })
  const [borcCronAktif, setBorcCronAktif] = useState(true)
  const [borcCronKaydediliyor, setBorcCronKaydediliyor] = useState(false)
  const [borcCronMesaj, setBorcCronMesaj] = useState(null)

  const borcCronDilimEkle = (tur) => setBorcCronTurlarPlan(prev => {
    const p = prev[tur] || {}
    const bugun = Math.min(31, Math.max(1, new Date().getDate()))
    return {
      ...prev,
      [tur]: { ...p, aktif: true, zamanlar: [...(p.zamanlar || []), { gunler_ay: [bugun], saat: '06:00' }] }
    }
  })
  const borcCronDilimSil = (tur, idx) => setBorcCronTurlarPlan(prev => {
    const p = prev[tur] || {}
    return { ...prev, [tur]: { ...p, zamanlar: (p.zamanlar || []).filter((_, i) => i !== idx) } }
  })
  const borcCronDilimGuncelle = (tur, idx, yeni) => setBorcCronTurlarPlan(prev => {
    const p = prev[tur] || {}
    return {
      ...prev,
      [tur]: { ...p, aktif: true, zamanlar: (p.zamanlar || []).map((z, i) => i === idx ? { ...z, ...yeni } : z) }
    }
  })

  const borcCronYukle = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/borc-cron', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
      })
      const j = await r.json()
      if (j.ok && j.plan) {
        setBorcCronPlan(j.plan)
        setBorcCronAktif(j.plan.aktif !== false)
        // 2.8.47: turlar_zamanlar varsa çoklu dilimleri oku; yoksa eski tek
        // gün/saat planından her aktif tür için bir dilim üret.
        const tz = j.plan.turlar_zamanlar && typeof j.plan.turlar_zamanlar === 'object' ? j.plan.turlar_zamanlar : null
        const eskiTurlar = Array.isArray(j.plan.turlar) ? j.plan.turlar : ['vergi', 'sgk']
        const eskiGun = Array.isArray(j.plan.gunler_ay) ? j.plan.gunler_ay.map(Number).filter(n => n >= 1 && n <= 31) : []
        const eskiSaat = /^\d{1,2}:\d{2}$/.test(String(j.plan.saat || '')) ? j.plan.saat : '06:00'
        setBorcCronTurlarPlan(Object.fromEntries(BORC_CRON_TURLAR.map(t => {
          let liste = Array.isArray(tz?.[t.v]) ? tz[t.v] : []
          if (!liste.length && eskiTurlar.includes(t.v)) liste = [{ gunler_ay: eskiGun, saat: eskiSaat }]
          return [t.v, {
            aktif: liste.length > 0,
            zamanlar: (() => {
              const bolunmus = dilimleriGunlereBol(liste, '06:00')
              return bolunmus.length ? bolunmus : [{ gunler_ay: [], saat: '06:00' }]
            })()
          }]
        })))
      } else setBorcCronPlan(null)
    } catch { /* yoksay */ }
    finally { setBorcCronYukleniyor(false) }
  }

  useEffect(() => { if (adminMi) borcCronYukle() }, [adminMi])

  const borcCronKaydet = async () => {
    // 2.8.47: her türün dilimlerini ayrı normalize et
    const turlarZamanlar = {}
    for (const t of BORC_CRON_TURLAR) {
      const p = borcCronTurlarPlan[t.v] || {}
      if (p.aktif !== true) continue
      const liste = (p.zamanlar || [])
        .map(z => dilimNormalize(z, '06:00'))
        .filter(dilimGecerli)
      if (liste.length) turlarZamanlar[t.v] = liste
    }
    const turlar = Object.keys(turlarZamanlar)
    if (!turlar.length) {
      setBorcCronMesaj({ ok: false, t: 'Her borç türü için en az bir gün ve saat girin.' }); return
    }
    const ilk = turlarZamanlar[turlar[0]][0]
    setBorcCronKaydediliyor(true)
    setBorcCronMesaj(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/borc-cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({
          // Geriye uyum için ilk dilimin özeti eski alanlara da yazılır
          gunler_ay: ilk.gunler_ay,
          saat: ilk.saat,
          turlar,
          turlar_zamanlar: turlarZamanlar,
          aktif: borcCronAktif,
          musteriler: Array.isArray(borcCronPlan?.musteriler) ? borcCronPlan.musteriler : []
        })
      })
      const j = await r.json()
      if (j.ok) {
        setBorcCronPlan(j.plan)
        await borcCronYukle()
        setBorcCronMesaj({ ok: true, t: 'Otomatik borç sorgulama planı kaydedildi. İstanbul sunucusu belirlediğiniz gün/saatte tüm aktif müşterilerin vergi ve SGK borcunu sorgulayıp kaydeder.' })
      } else setBorcCronMesaj({ ok: false, t: j.error === 'yetkisiz' ? 'Yönetici yetkisi gerekir.' : (j.error || 'Kaydedilemedi.') })
    } catch { setBorcCronMesaj({ ok: false, t: 'Bağlantı hatası.' }) }
    finally { setBorcCronKaydediliyor(false) }
  }

  const borcCronIptal = async () => {
    if (!window.confirm('Otomatik borç sorgulama planı silinecek. Emin misiniz?')) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/borc-cron', {
        method: 'DELETE',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
      })
      const j = await r.json()
      if (j.ok) { setBorcCronPlan(null); setBorcCronMesaj({ ok: true, t: 'Plan iptal edildi.' }) }
      else setBorcCronMesaj({ ok: false, t: j.error || 'Silinemedi.' })
    } catch { setBorcCronMesaj({ ok: false, t: 'Bağlantı hatası.' }) }
  }

  const borcCronSonucOzet = () => {
    if (!borcCronPlan?.son_calisma) return 'Henüz çalışmadı'
    try {
      const d = new Date(borcCronPlan.son_calisma)
      const zaman = d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      return `${zaman} — ${borcCronPlan.son_sonuc?.ozet || 'tamamlandı'}`
    } catch { return '' }
  }

  // ---- 2.8.47: Otomatik POS / KDV döküm — her tür için ayrı çoklu gün+saat ----
  const DVS_CRON_TURLAR = [
    { v: 'pos', e: 'Kredi Kartı / POS Hasılatı' },
    { v: '109', e: 'KDV 109 Döküm' },
    { v: '110', e: 'Gümrük İşlemleri KDV (KDV 110)' }
  ]
  const [dvsCronYukleniyor, setDvsCronYukleniyor] = useState(true)
  const [dvsCronPlan, setDvsCronPlan] = useState(null)
  // Her tür kendi dilim listesini taşır: { pos: { aktif, zamanlar:[{gunler_ay:[5],saat:'05:00'}] }, ... }
  const [dvsCronTurlarPlan, setDvsCronTurlarPlan] = useState({
    pos: { aktif: true, zamanlar: [{ gunler_ay: [5], saat: '05:00' }] },
    '109': { aktif: false, zamanlar: [{ gunler_ay: [5], saat: '05:30' }] },
    '110': { aktif: false, zamanlar: [{ gunler_ay: [5], saat: '06:00' }] }
  })
  const [dvsCronAktif, setDvsCronAktif] = useState(true)
  const [dvsCronKaydediliyor, setDvsCronKaydediliyor] = useState(false)
  const [dvsCronMesaj, setDvsCronMesaj] = useState(null)
  // 2.8.44: daha önce okunmuş değerlerin üzerine yazılsın mı?
  const [dvsYenidenOku, setDvsYenidenOku] = useState(false)

  const dvsCronDilimEkle = (tur) => setDvsCronTurlarPlan(prev => {
    const p = prev[tur] || {}
    const bugun = Math.min(31, Math.max(1, new Date().getDate()))
    return {
      ...prev,
      [tur]: { ...p, aktif: true, zamanlar: [...(p.zamanlar || []), { gunler_ay: [bugun], saat: '05:00' }] }
    }
  })
  const dvsCronDilimSil = (tur, idx) => setDvsCronTurlarPlan(prev => {
    const p = prev[tur] || {}
    return { ...prev, [tur]: { ...p, zamanlar: (p.zamanlar || []).filter((_, i) => i !== idx) } }
  })
  const dvsCronDilimGuncelle = (tur, idx, yeni) => setDvsCronTurlarPlan(prev => {
    const p = prev[tur] || {}
    return {
      ...prev,
      [tur]: { ...p, aktif: true, zamanlar: (p.zamanlar || []).map((z, i) => i === idx ? { ...z, ...yeni } : z) }
    }
  })

  const dvsCronYukle = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/dvs-cron', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
      })
      const j = await r.json()
      if (j.ok && j.plan) {
        setDvsCronPlan(j.plan)
        setDvsCronAktif(j.plan.aktif !== false)
        setDvsYenidenOku(j.plan.yenidenOku === true || j.plan.turlar_plan?.__ayar?.yenidenOku === true)
        // 2.8.47: öncelik turlar_plan[t].zamanlar; yoksa paylaşılan eski
        // zamanlar / tek gün-saat planından geriye uyumlu migrate et.
        const tp = j.plan.turlar_plan && typeof j.plan.turlar_plan === 'object' ? j.plan.turlar_plan : null
        const eskiTurlar = Array.isArray(j.plan.turlar) ? j.plan.turlar : ['pos']
        const ortakZamanlar = Array.isArray(j.plan.zamanlar) ? j.plan.zamanlar : []
        const eskiGun = Array.isArray(j.plan.gun_ay) ? [Number(j.plan.gun_ay) || 0].filter(n => n >= 1 && n <= 31) : []
        const eskiSaat = /^\d{1,2}:\d{2}$/.test(String(j.plan.saat || '')) ? j.plan.saat : '05:00'
        setDvsCronTurlarPlan(Object.fromEntries(DVS_CRON_TURLAR.map(t => {
          const p = tp?.[t.v]
          let liste = Array.isArray(p?.zamanlar) ? p.zamanlar : []
          if (!liste.length && eskiTurlar.includes(t.v)) {
            if (ortakZamanlar.length) liste = ortakZamanlar
            else if (p) liste = [{ gunler_ay: Number(p.gun_ay) >= 1 ? [Number(p.gun_ay)] : [], saat: p.saat || '05:00' }]
            else liste = [{ gunler_ay: eskiGun, saat: eskiSaat }]
          }
          return [t.v, {
            aktif: liste.length > 0,
            zamanlar: (() => {
              const bolunmus = dilimleriGunlereBol(liste, '05:00')
              return bolunmus.length ? bolunmus : [{ gunler_ay: [], saat: '05:00' }]
            })()
          }]
        })))
      } else setDvsCronPlan(null)
    } catch { /* yoksay */ }
    finally { setDvsCronYukleniyor(false) }
  }

  useEffect(() => { if (adminMi) dvsCronYukle() }, [adminMi])

  const dvsCronKaydet = async () => {
    // 2.8.47: her türün dilimlerini ayrı normalize et
    const turlarPlan = {}
    for (const t of DVS_CRON_TURLAR) {
      const p = dvsCronTurlarPlan[t.v] || {}
      if (p.aktif !== true) {
        turlarPlan[t.v] = { aktif: false, gun_ay: 0, saat: '05:00', zamanlar: [] }
        continue
      }
      const liste = (p.zamanlar || [])
        .map(z => dilimNormalize(z, '05:00'))
        .filter(dilimGecerli)
      const ilk = liste[0] || { gunler_ay: [], saat: '05:00' }
      turlarPlan[t.v] = {
        aktif: liste.length > 0,
        gun_ay: ilk.gunler_ay[0] || 0,
        saat: ilk.saat,
        zamanlar: liste
      }
    }
    if (!DVS_CRON_TURLAR.some(t => turlarPlan[t.v].aktif)) {
      setDvsCronMesaj({ ok: false, t: 'Her sorgu türü için en az bir gün ve saat girin.' }); return
    }
    setDvsCronKaydediliyor(true)
    setDvsCronMesaj(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/dvs-cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({
          aktif: dvsCronAktif,
          turlar_plan: turlarPlan,
          yenidenOku: dvsYenidenOku
        })
      })
      const j = await r.json()
      if (j.ok) {
        setDvsCronPlan(j.plan)
        await dvsCronYukle()
        setDvsCronMesaj({ ok: true, t: 'Otomatik POS/KDV döküm planı kaydedildi. İstanbul sunucusu her sorgu türü için belirlediğiniz gün ve saatte tüm aktif müşterilerin Dijitaş DVS sorgusunu yapıp sonuçları sisteme kaydeder.' })
      } else setDvsCronMesaj({ ok: false, t: j.error === 'yetkisiz' ? 'Yönetici yetkisi gerekir.' : (j.error || 'Kaydedilemedi.') })
    } catch { setDvsCronMesaj({ ok: false, t: 'Bağlantı hatası.' }) }
    finally { setDvsCronKaydediliyor(false) }
  }

  const dvsCronIptal = async () => {
    if (!window.confirm('Otomatik POS/KDV döküm planı silinecek. Emin misiniz?')) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/dvs-cron', {
        method: 'DELETE',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
      })
      const j = await r.json()
      if (j.ok) { setDvsCronPlan(null); setDvsCronMesaj({ ok: true, t: 'Plan iptal edildi.' }) }
      else setDvsCronMesaj({ ok: false, t: j.error || 'Silinemedi.' })
    } catch { setDvsCronMesaj({ ok: false, t: 'Bağlantı hatası.' }) }
  }

  const dvsCronSonucOzet = () => {
    if (!dvsCronPlan?.son_calisma) return 'Henüz çalışmadı'
    try {
      const d = new Date(dvsCronPlan.son_calisma)
      const zaman = d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      return `${zaman} — ${dvsCronPlan.son_sonuc?.ozet || 'tamamlandı'}`
    } catch { return '' }
  }

  const tabs = [
    { id: 'password', label: 'Sifre / Guvenlik', icon: Lock },
    { id: 'communication', label: 'Iletisim Ayarlari', icon: MessageCircle },
    ...(adminMi ? [{ id: 'bank', label: 'Banka Bilgileri', icon: Building2 }] : []),
    ...(adminMi ? [{ id: 'payments', label: 'Odeme Kurulusu', icon: CreditCard }] : []),
    ...(adminMi ? [{ id: 'luca', label: 'Luca Baglanti', icon: Link2 }] : []),
    ...(adminMi ? [{ id: 'gib', label: 'GIB Baglanti', icon: Landmark }] : []),
    ...(adminMi ? [{ id: 'kayit-klasorleri', label: 'Kayit Klasorleri', icon: FolderTree }] : []),
    ...(adminMi ? [{ id: 'borc-cron', label: 'Otomatik Borç Sorgu', icon: Clock }] : []),
    ...(adminMi ? [{ id: 'dvs-cron', label: 'Otomatik POS / KDV Döküm', icon: CreditCard }] : []),
    { id: 'documents', label: 'Evrak Gorunurlugu', icon: FolderOpen },
    { id: 'folders', label: 'Evrak Klasor Yapisi', icon: FolderTree },
    ...(adminMi ? [{ id: 'assistant', label: 'Asistan Sesi', icon: Volume2 }] : []),
    ...(adminMi ? [{ id: 'masaustu-asistan', label: 'Ana Ekran Asistanı', icon: Bot }] : []),
    ...(adminMi ? [{ id: 'users', label: 'Kullanici Yonetimi', icon: Users }] : [])
  ]

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <SettingsIcon className="w-8 h-8 text-yellow-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Ayarlar</h1>
          <p className="text-gray-400 text-sm">Hesap ve guvenlik ayarlari</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-6 bg-blue-950/50 p-1 rounded-xl border border-blue-800/30">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'text-gray-400 hover:text-white hover:bg-blue-800/30 border border-transparent'
            }`}>
            <tab.icon className="w-4 h-4 shrink-0" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="bg-blue-950/30 rounded-2xl p-6 border border-blue-800/30">

        {/* 2.8.5: OTOMATIK BORC SORGULAMA — VPS cron plani */}
        {activeTab === 'borc-cron' && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
              <div>
                <h2 className="text-lg font-semibold text-white">Otomatik Borç Sorgulama</h2>
                <p className="text-gray-400 text-sm">Seçilen gün ve saatte İstanbul sunucusu tüm aktif müşterilerin vergi (GİB) ve SGK borcunu otomatik sorgular. Müşteri portalına girdiğinde güncel borcunu anında görür; istediğinde kendisi de canlı sorgulayabilir.</p>
              </div>
              <button
                onClick={() => setBorcCronAktif(p => !p)}
                className={`relative w-11 h-6 rounded-full transition-colors ${borcCronAktif ? 'bg-cyan-500' : 'bg-blue-800/80'}`}
                title={borcCronAktif ? 'Otomatik borç sorgulama açık' : 'Otomatik borç sorgulama kapalı'}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${borcCronAktif ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
            {borcCronYukleniyor ? (
              <p className="text-xs text-gray-500 mt-3">Yükleniyor…</p>
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-4">
                  {BORC_CRON_TURLAR.map(t => {
                    const p = borcCronTurlarPlan[t.v] || { aktif: false, zamanlar: [] }
                    const dilimler = p.zamanlar || []
                    const renk = t.v === 'sgk' ? 'amber' : 'sky'
                    return (
                      <div key={t.v} className="rounded-xl border border-blue-700/40 bg-blue-950/40 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-2 text-sm font-medium text-white">
                            <span className={`w-2 h-2 rounded-full ${renk === 'amber' ? 'bg-amber-400' : 'bg-sky-400'}`} />
                            {t.e}
                            <span className="text-[10px] text-gray-500">({dilimler.filter(dilimGecerli).length} dilim)</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => borcCronDilimEkle(t.v)}
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
                          onDegistir={(idx, yeni) => borcCronDilimGuncelle(t.v, idx, yeni)}
                          onSil={(idx) => borcCronDilimSil(t.v, idx)}
                        />
                      </div>
                    )
                  })}
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed mt-3">
                  Her tür için ayrı gün ve saat. <span className="text-cyan-300">+</span> ile aynı türe birden fazla dilim ekleyebilir, <span className="text-red-300">−</span> ile silebilirsiniz. Aynı plan Müşteri Borç Dökümü ekranındaki “Otomatik Borç Sorgulama” bölümüyle senkron çalışır.
                </p>
                <div className="flex flex-wrap items-center gap-2.5 mt-4">
                  <button
                    onClick={borcCronKaydet}
                    disabled={borcCronKaydediliyor}
                    className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium disabled:opacity-50"
                  >
                    {borcCronKaydediliyor ? 'Kaydediliyor…' : (borcCronPlan ? 'Planı Güncelle' : 'Kaydet')}
                  </button>
                  {borcCronPlan && (
                    <button
                      onClick={borcCronIptal}
                      className="px-4 py-2 rounded-xl bg-blue-900/60 border border-blue-700/50 text-gray-300 hover:text-white text-sm"
                    >
                      İptal Et
                    </button>
                  )}
                  <span className="text-xs text-gray-500 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Son çalışma: {borcCronSonucOzet()}
                  </span>
                </div>
                <p className="text-[11px] text-gray-600 mt-2.5">
                  Not: Sorgu sonucu her müşterinin hesabına otomatik işlenir — müşteri portalını açtığında en güncel borcunu görür. Şifresi eksik müşteriler atlanır ve admin'e bildirilir.
                </p>
                {borcCronMesaj && (
                  <div className={`mt-3 px-4 py-3 rounded-xl text-sm border ${borcCronMesaj.ok ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-200' : 'bg-red-500/10 border-red-500/40 text-red-300'}`}>
                    {borcCronMesaj.t}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* 2.8.8: OTOMATIK POS / KDV DOKUM (DVS) — VPS cron plani */}
        {activeTab === 'dvs-cron' && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
              <div>
                <h2 className="text-lg font-semibold text-white">Otomatik POS / KDV Döküm Sorgulama</h2>
                <p className="text-gray-400 text-sm">Seçilen gün ve saatte İstanbul sunucusu tüm aktif müşterilerin Dijitaş DVS sorgusunu yapar: POS (Kredi Kartı Hasılatı) ve KDV 109/110 dökümleri. Sonuçlar sisteme otomatik işlenir — müşteri portalında ve raporlarda görünür.</p>
              </div>
              <button
                onClick={() => setDvsCronAktif(p => !p)}
                className={`relative w-11 h-6 rounded-full transition-colors ${dvsCronAktif ? 'bg-cyan-500' : 'bg-blue-800/80'}`}
                title={dvsCronAktif ? 'Otomatik sorgulama açık' : 'Otomatik sorgulama kapalı'}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${dvsCronAktif ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
            {dvsCronYukleniyor ? (
              <p className="text-xs text-gray-500 mt-3">Yükleniyor…</p>
            ) : (
              <>
                <div className="mt-4 space-y-3">
                  {/* 2.8.47: tür bazlı çoklu gün+saat dilimleri */}
                  <div className="rounded-xl border border-blue-800/50 bg-blue-950/40 p-3.5">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">Sorgulama Gün ve Saatleri (tür başına)</p>
                    <p className="text-[11px] text-gray-400 mb-3">
                      Her tür için ayrı gün ve saat tanımlayın. <span className="text-cyan-300">+</span> ile aynı türe birden fazla dilim ekleyebilir, <span className="text-red-300">−</span> ile silebilirsiniz.
                    </p>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
                      {DVS_CRON_TURLAR.map(t => {
                        const p = dvsCronTurlarPlan[t.v] || { aktif: false, zamanlar: [] }
                        const dilimler = p.zamanlar || []
                        return (
                          <div key={t.v} className={`rounded-xl border p-3 space-y-2 ${p.aktif ? 'border-cyan-500/40 bg-cyan-500/[0.04]' : 'border-blue-700/40 bg-blue-950/40'}`}>
                            <div className="flex items-start justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => setDvsCronTurlarPlan(prev => {
                                  const mevcut = prev[t.v] || { aktif: false, zamanlar: [] }
                                  const yeniAktif = !mevcut.aktif
                                  let zamanlar = Array.isArray(mevcut.zamanlar) ? mevcut.zamanlar : []
                                  if (yeniAktif && !zamanlar.length) {
                                    const bugun = Math.min(31, Math.max(1, new Date().getDate()))
                                    zamanlar = [{ gunler_ay: [bugun], saat: '05:00' }]
                                  }
                                  return { ...prev, [t.v]: { ...mevcut, aktif: yeniAktif, zamanlar } }
                                })}
                                className={`flex-1 flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium border text-left transition-colors ${p.aktif ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-200' : 'bg-blue-900/50 border-blue-700/50 text-gray-400 hover:text-gray-200'}`}
                              >
                                <span className={`w-2 h-2 rounded-full shrink-0 ${p.aktif ? 'bg-cyan-400' : 'bg-gray-600'}`} />
                                <span className="truncate">{t.e}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => dvsCronDilimEkle(t.v)}
                                title="Gün + saat ekle"
                                className="inline-flex items-center gap-1 px-2 py-2 rounded-lg bg-cyan-600/15 border border-cyan-500/40 text-cyan-300 text-[10px] font-medium hover:bg-cyan-600/25 shrink-0"
                              >
                                <Plus className="w-3 h-3" /> Ekle
                              </button>
                            </div>
                            {dilimler.length === 0 && (
                              <p className="text-[11px] text-gray-500 py-1">Dilim yok — otomatik sorgulanmaz.</p>
                            )}
                            <PlanDilimSatirlari
                              dilimler={dilimler}
                              varsayilanSaat="05:00"
                              onDegistir={(idx, yeni) => dvsCronDilimGuncelle(t.v, idx, yeni)}
                              onSil={(idx) => dvsCronDilimSil(t.v, idx)}
                            />
                          </div>
                        )
                      })}
                    </div>
                    <label className="flex items-start gap-2 mt-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={dvsYenidenOku}
                        onChange={e => setDvsYenidenOku(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-blue-700/50 bg-blue-900/40 text-amber-500 focus:ring-amber-500"
                      />
                      <span className="text-[11px] text-gray-400 leading-relaxed">
                        <strong className="text-gray-300">Zaten okunmuş değerleri yeniden oku</strong><br />
                        Kapalıyken daha önce değer okunmuş müşteri/dönem/tür tekrar sorgulanmaz (atlanır). Açarsanız üzerine yazar.
                      </span>
                    </label>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 mt-4">
                  <button
                    onClick={dvsCronKaydet}
                    disabled={dvsCronKaydediliyor}
                    className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium disabled:opacity-50"
                  >
                    {dvsCronKaydediliyor ? 'Kaydediliyor…' : (dvsCronPlan ? 'Planı Güncelle' : 'Kaydet')}
                  </button>
                  {dvsCronPlan && (
                    <button
                      onClick={dvsCronIptal}
                      className="px-4 py-2 rounded-xl bg-blue-900/60 border border-blue-700/50 text-gray-300 hover:text-white text-sm"
                    >
                      İptal Et
                    </button>
                  )}
                  <span className="text-xs text-gray-500 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Son çalışma: {dvsCronSonucOzet()}
                  </span>
                </div>
                <p className="text-[11px] text-gray-600 mt-2.5">
                  Not: Sorgu bir önceki ayın dönemini kapsar (ör. 3 Aralık'ta çalışırsa Kasım ayının POS hasılatı). Her tür kendi gün ve saat dilimleriyle, her ay otomatik olarak çalışır; bir türe birden fazla dilim eklenebilir. DVS şifresi eksik müşteriler atlanır. Sonuçlar "kredi_karti_hasilat" ve "kdv_dökümleri" sayfalarında görünür.
                </p>
                {dvsCronMesaj && (
                  <div className={`mt-3 px-4 py-3 rounded-xl text-sm border ${dvsCronMesaj.ok ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-200' : 'bg-red-500/10 border-red-500/40 text-red-300'}`}>
                    {dvsCronMesaj.t}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* SIFRE DEGISTIR */}
        {activeTab === 'password' && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Sifre Degistir</h2>
            
            {passwordMsg && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-green-300 text-sm">{passwordMsg}</span>
              </div>
            )}
            {passwordErr && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-300 text-sm">{passwordErr}</span>
              </div>
            )}

            <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
              <div>
                <label className="text-gray-400 text-sm block mb-1">Mevcut Sifre</label>
                <div className="relative">
                  <input type={showPasswords ? 'text' : 'password'} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                    className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 pr-10 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500" required />
                  <button type="button" onClick={() => setShowPasswords(!showPasswords)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                    {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">Yeni Sifre</label>
                <input type={showPasswords ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500" 
                  placeholder="En az 6 karakter" required />
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">Yeni Sifre (Tekrar)</label>
                <input type={showPasswords ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500" required />
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-red-400 text-xs mt-1">Sifreler eslesmedi</p>
                )}
              </div>
              <button type="submit" disabled={passwordLoading} className="btn-gold px-6 py-2.5 flex items-center gap-2 disabled:opacity-50">
                {passwordLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Sifreyi Degistir
              </button>
            </form>

            {/* SIFRE SIKLIGI */}
            <div className="mt-8 pt-6 border-t border-blue-800/30">
              <h2 className="text-lg font-semibold text-white mb-2">Sifre Degistirme Sikligi</h2>
              <p className="text-gray-400 text-sm mb-4">Belirli araliklarla sifre degistirme zorunlulugu ayarlayin.</p>

              {intervalMsg && (
                <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-green-300 text-sm">{intervalMsg}</span>
                </div>
              )}

              <div className="max-w-md space-y-4">
                <div>
                  <label className="text-gray-400 text-sm block mb-1">Sifre Degistirme Periyodu</label>
                  <select value={passwordInterval} onChange={e => setPasswordInterval(e.target.value)}
                    className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-yellow-500">
                    <option value="3ay">3 Ay</option>
                    <option value="6ay">6 Ay</option>
                    <option value="never">Hicbir Zaman</option>
                  </select>
                </div>
                <button onClick={handleIntervalSave} disabled={intervalLoading} className="btn-gold px-6 py-2.5 flex items-center gap-2 disabled:opacity-50">
                  {intervalLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Kaydet
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ILETISIM AYARLARI */}
        {activeTab === 'communication' && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-yellow-400" />
              Iletisim Ayarlari
            </h2>
            <p className="text-gray-400 text-sm mb-6">WhatsApp ve Mail gonderim ayarlarini buradan yonetin.</p>

            {commMsg && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-green-300 text-sm">{commMsg}</span>
              </div>
            )}
            {commErr && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-300 text-sm">{commErr}</span>
              </div>
            )}

            <div className="space-y-6">
              {/* WhatsApp */}
              <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
                <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-green-400" />
                  WhatsApp Gonderim Ayarlari
                </h3>

                <div className="mb-5">
                  <label className="text-gray-400 text-sm block mb-2">WhatsApp Gonderim Kanali</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                      commSettings.whatsapp_channel === 'api'
                        ? 'bg-green-500/10 border-green-500/40 text-green-300'
                        : 'bg-blue-900/20 border-blue-700/40 text-gray-400'
                    }`}>
                      <input
                        type="radio"
                        name="whatsapp_channel"
                        value="api"
                        checked={commSettings.whatsapp_channel === 'api'}
                        onChange={e => setCommSettings({ ...commSettings, whatsapp_channel: e.target.value })}
                        className="mt-1 w-4 h-4 text-green-500 border-blue-700/50 bg-blue-900/30 focus:ring-green-500"
                      />
                      <div>
                        <span className="text-sm font-medium">WhatsApp Business API</span>
                        <p className="text-xs mt-1 opacity-80">Dosyalar mesaja ekinde gonderilir. Phone Number ID ve Access Token gerekir.</p>
                      </div>
                    </label>

                    <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                      commSettings.whatsapp_channel === 'web'
                        ? 'bg-green-500/10 border-green-500/40 text-green-300'
                        : 'bg-blue-900/20 border-blue-700/40 text-gray-400'
                    }`}>
                      <input
                        type="radio"
                        name="whatsapp_channel"
                        value="web"
                        checked={commSettings.whatsapp_channel === 'web'}
                        onChange={e => setCommSettings({ ...commSettings, whatsapp_channel: e.target.value })}
                        className="mt-1 w-4 h-4 text-green-500 border-blue-700/50 bg-blue-900/30 focus:ring-green-500"
                      />
                      <div>
                        <span className="text-sm font-medium">Web.WhatsApp</span>
                        <p className="text-xs mt-1 opacity-80">Kullanici telefonundaki WhatsApp uzerinden gonderilir. Dosyalar link olarak gonderilir.</p>
                      </div>
                    </label>

                    <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                      commSettings.whatsapp_channel === 'masaustu'
                        ? 'bg-green-500/10 border-green-500/40 text-green-300'
                        : 'bg-blue-900/20 border-blue-700/40 text-gray-400'
                    }`}>
                      <input
                        type="radio"
                        name="whatsapp_channel"
                        value="masaustu"
                        checked={commSettings.whatsapp_channel === 'masaustu'}
                        onChange={e => setCommSettings({ ...commSettings, whatsapp_channel: e.target.value })}
                        className="mt-1 w-4 h-4 text-green-500 border-blue-700/50 bg-blue-900/30 focus:ring-green-500"
                      />
                      <div>
                        <span className="text-sm font-medium">Windows Uygulaması</span>
                        <p className="text-xs mt-1 opacity-80">Bilgisayardaki WhatsApp masaüstü programından otomatik gonderilir (yardımcı program 2.7.172 ve üzeri). Dosyalar link olarak gider.</p>
                      </div>
                    </label>
                  </div>
                </div>

                {commSettings.whatsapp_channel !== 'web' && commSettings.whatsapp_channel !== 'masaustu' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">Phone Number ID</label>
                    <input
                      type="text"
                      value={commSettings.whatsapp_phone_number_id}
                      onChange={e => setCommSettings({ ...commSettings, whatsapp_phone_number_id: e.target.value })}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                      placeholder="Orn: 123456789012345"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">Access Token</label>
                    <div className="relative">
                      <input
                        type={showToken ? 'text' : 'password'}
                        value={commSettings.whatsapp_access_token}
                        onChange={e => setCommSettings({ ...commSettings, whatsapp_access_token: e.target.value })}
                        className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 pr-10 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                        placeholder="EAA..."
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                      >
                        {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">Template Name</label>
                    <input
                      type="text"
                      value={commSettings.whatsapp_template_name}
                      onChange={e => setCommSettings({ ...commSettings, whatsapp_template_name: e.target.value })}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                      placeholder="beyanname_bildirim"
                    />
                  </div>
                </div>
                )}

                {commSettings.whatsapp_channel === 'web' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-gray-400 text-sm block mb-2">Gönderim Makinesi</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                          (commSettings.whatsapp_web_kaynak || 'vps') === 'vps'
                            ? 'bg-green-500/10 border-green-500/40 text-green-300'
                            : 'bg-blue-900/20 border-blue-700/40 text-gray-400'
                        }`}>
                          <input
                            type="radio"
                            name="whatsapp_web_kaynak"
                            value="vps"
                            checked={(commSettings.whatsapp_web_kaynak || 'vps') === 'vps'}
                            onChange={e => setCommSettings({ ...commSettings, whatsapp_web_kaynak: e.target.value })}
                            className="mt-1 w-4 h-4 text-green-500 border-blue-700/50 bg-blue-900/30 focus:ring-green-500"
                          />
                          <div>
                            <span className="text-sm font-medium">Sunucu (VPS)</span>
                            <p className="text-xs mt-1 opacity-80">İstanbul sunucusundaki yardımcı gönderir. Ofis bilgisayarı kapalı olsa da çalışır; otomatik gönderim için gerekli.</p>
                          </div>
                        </label>

                        <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                          commSettings.whatsapp_web_kaynak === 'yerel'
                            ? 'bg-green-500/10 border-green-500/40 text-green-300'
                            : 'bg-blue-900/20 border-blue-700/40 text-gray-400'
                        }`}>
                          <input
                            type="radio"
                            name="whatsapp_web_kaynak"
                            value="yerel"
                            checked={commSettings.whatsapp_web_kaynak === 'yerel'}
                            onChange={e => setCommSettings({ ...commSettings, whatsapp_web_kaynak: e.target.value })}
                            className="mt-1 w-4 h-4 text-green-500 border-blue-700/50 bg-blue-900/30 focus:ring-green-500"
                          />
                          <div>
                            <span className="text-sm font-medium">Bu Bilgisayar (Yerel)</span>
                            <p className="text-xs mt-1 opacity-80">Bu bilgisayardaki yardımcı program gönderir. Yardımcı programın açık olması gerekir.</p>
                          </div>
                        </label>
                      </div>
                    </div>

                    <div className="bg-blue-950/40 border border-blue-700/30 rounded-xl p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                        <div>
                          <p className="text-sm font-medium text-white">WhatsApp Bağlantısı</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {(commSettings.whatsapp_web_kaynak || 'vps') === 'vps'
                              ? 'Sunucudaki WhatsApp oturumunu bir kez QR ile bağlayın.'
                              : 'Bu bilgisayardaki WhatsApp oturumunu bir kez QR ile bağlayın.'}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              setWaQrDurum('kontrol')
                              const { whatsappWebDurum } = await import('../services/whatsappService')
                              const r = await whatsappWebDurum({ kaynak: commSettings.whatsapp_web_kaynak || 'vps' })
                              setWaQrDurum(r.ok ? (r.girisVar ? 'bagli' : 'bagli-degil') : 'hata')
                              setWaQrHata(r.ok ? (r.not || '') : (r.hata || ''))
                            }}
                            className="px-3 py-2 rounded-lg bg-blue-600/20 border border-blue-500/40 text-blue-300 text-xs font-medium hover:bg-blue-600/30"
                          >
                            Durum Kontrol
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              setWaQrDurum('qr-yukleniyor')
                              setWaQrGoruntu('')
                              const { whatsappWebDurum } = await import('../services/whatsappService')
                              const r = await whatsappWebDurum({ kaynak: commSettings.whatsapp_web_kaynak || 'vps', qr: true })
                              if (!r.ok) { setWaQrDurum('hata'); setWaQrHata(r.hata || ''); return }
                              if (r.girisVar) { setWaQrDurum('bagli'); setWaQrHata(r.not || ''); return }
                              setWaQrGoruntu(r.goruntu || '')
                              setWaQrDurum('qr-hazir')
                              setWaQrHata(r.not || '')
                            }}
                            className="px-3 py-2 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-xs font-medium hover:bg-emerald-600/30"
                          >
                            QR Kodu Göster
                          </button>
                        </div>
                      </div>

                      {waQrDurum === 'kontrol' && <p className="text-xs text-gray-400">Kontrol ediliyor…</p>}
                      {waQrDurum === 'qr-yukleniyor' && <p className="text-xs text-gray-400">QR hazırlanıyor, 30-60 sn sürebilir…</p>}
                      {waQrDurum === 'bagli' && (
                        <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5" /> WhatsApp bağlı — gönderimler otomatik yapılacak.
                        </p>
                      )}
                      {waQrDurum === 'bagli-degil' && (
                        <p className="text-xs text-amber-400">WhatsApp bağlı değil. “QR Kodu Göster”e basıp telefondan okutun.</p>
                      )}
                      {waQrDurum === 'hata' && (
                        <p className="text-xs text-red-400">Bağlantı kurulamadı: {waQrHata}</p>
                      )}
                      {waQrDurum === 'qr-hazir' && waQrGoruntu && (
                        <div className="text-center">
                          <img src={waQrGoruntu} alt="WhatsApp QR" className="mx-auto rounded-lg bg-white p-2" style={{ maxWidth: 260 }} />
                          <p className="text-xs text-gray-400 mt-2">WhatsApp → Bağlı cihazlar → Cihaz bağla ile okutun.</p>
                        </div>
                      )}
                      {waQrDurum === 'qr-hazir' && !waQrGoruntu && (
                        <p className="text-xs text-amber-400">{waQrHata || 'QR henüz hazır değil, tekrar deneyin.'}</p>
                      )}
                    </div>

                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-yellow-300 text-xs">
                      Web.WhatsApp seciliyken telefon numarasi gerekmez; gonderim esnasinda yeni sekmede hazir mesaj acilir ve dosya linkleri mesaja eklenir.
                    </div>
                  </div>
                )}

                {commSettings.whatsapp_channel === 'masaustu' && (
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-yellow-300 text-xs">
                    Windows Uygulaması seciliyken gonderim bilgisayardaki WhatsApp masaüstü programından otomatik yapılır: mesaj hazırlanır, uygulama açılır ve ENTER otomatik basılır (yardımcı program 2.7.172+ çalışmalı). Uygulama açılmazsa WhatsApp Web yedegi devreye girer.
                  </div>
                )}
              </div>

              {/* SMTP / Natro Mail */}
              <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
                <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-400" />
                  SMTP Mail Ayarlari (Natro vb.)
                </h3>
                <p className="text-gray-400 text-xs mb-4">Kendi mail sunucunuz uzerinden gonderim yapmak icin SMTP bilgilerinizi girin.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">SMTP Host</label>
                    <input
                      type="text"
                      value={commSettings.smtp_host}
                      onChange={e => setCommSettings({ ...commSettings, smtp_host: e.target.value })}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                      placeholder="Orn: mail.mubiserp.com.tr"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">SMTP Port</label>
                    <input
                      type="number"
                      value={commSettings.smtp_port}
                      onChange={e => setCommSettings({ ...commSettings, smtp_port: e.target.value })}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                      placeholder="587"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">SMTP Kullanici Adi</label>
                    <input
                      type="text"
                      value={commSettings.smtp_user}
                      onChange={e => setCommSettings({ ...commSettings, smtp_user: e.target.value })}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                      placeholder="info@mubiserp.com.tr"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">SMTP Sifre</label>
                    <div className="relative">
                      <input
                        type={showSmtpPass ? 'text' : 'password'}
                        value={commSettings.smtp_pass}
                        onChange={e => setCommSettings({ ...commSettings, smtp_pass: e.target.value })}
                        className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 pr-10 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                        placeholder="Mail hesabi sifresi"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSmtpPass(!showSmtpPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                      >
                        {showSmtpPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">Gonderen Adres (From)</label>
                    <input
                      type="email"
                      value={commSettings.smtp_from}
                      onChange={e => setCommSettings({ ...commSettings, smtp_from: e.target.value })}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                      placeholder="info@mubiserp.com.tr"
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-gray-300 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={commSettings.smtp_secure === 'true'}
                        onChange={e => setCommSettings({ ...commSettings, smtp_secure: e.target.checked ? 'true' : 'false' })}
                        className="w-4 h-4 rounded border-blue-700/50 bg-blue-900/30 text-yellow-500 focus:ring-yellow-500"
                      />
                      SSL/TLS kullan (465 icin isaretli, 587 icin bos)
                    </label>
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">Ödeme Hatırlatması (kaç gün önce)</label>
                    <input
                      type="number"
                      min="0"
                      max="30"
                      value={commSettings.odeme_hatirlatma_gun}
                      onChange={e => setCommSettings({ ...commSettings, odeme_hatirlatma_gun: e.target.value })}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                      placeholder="5"
                    />
                    <p className="text-gray-500 text-xs mt-1">Son ödeme tarihinden bu kadar gün önce müşteriye WhatsApp/e-posta hatırlatması gider. Her dönem için bir kez gönderilir.</p>
                  </div>
                </div>
              </div>

              <button onClick={handleCommSave} disabled={commLoading} className="btn-gold px-6 py-2.5 flex items-center gap-2 disabled:opacity-50">
                {commLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Iletisim Ayarlarini Kaydet
              </button>
            </div>
          </div>
        )}

        {/* BANKA BILGILERI */}
        {activeTab === 'bank' && adminMi && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-yellow-400" />
              Banka Bilgileri
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              Musteri portalinda EFT/Havale ile odeme bolumunde gorunecek muhasebe banka hesap bilgileri.
            </p>

            {bankInfoMsg && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-green-300 text-sm">{bankInfoMsg}</span>
              </div>
            )}
            {bankInfoErr && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-300 text-sm">{bankInfoErr}</span>
              </div>
            )}

            <div className="bg-blue-900/20 rounded-xl p-6 border border-blue-700/30">
              <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-yellow-400" />
                EFT / Havale Hesap Bilgileri
              </h3>
              <p className="text-gray-400 text-xs mb-4">
                Birden fazla hesap ekleyebilirsiniz. Müşteri portalında tüm hesaplar listelenir ve müşteri istediğini tek tuşla kopyalayabilir.
              </p>

              <div className="space-y-4 mb-4">
                {bankalar.map((hesap, index) => (
                  <div key={index} className="rounded-xl border border-blue-700/40 bg-blue-950/40 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-medium text-yellow-400">{index + 1}. Hesap</span>
                      <button
                        type="button"
                        onClick={() => setBankalar(prev => prev.filter((_, i) => i !== index))}
                        disabled={bankalar.length === 1}
                        className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-40"
                      >
                        Hesabı Sil
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div>
                        <label className="text-gray-400 text-sm block mb-1">Banka Adı</label>
                        <input
                          type="text"
                          value={hesap.banka || ''}
                          onChange={e => bankaGuncelle(index, 'banka', e.target.value)}
                          className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                          placeholder="Örn: Garanti Bankası"
                        />
                      </div>
                      <div>
                        <label className="text-gray-400 text-sm block mb-1">Hesap Sahibi</label>
                        <input
                          type="text"
                          value={hesap.hesapSahibi || ''}
                          onChange={e => bankaGuncelle(index, 'hesapSahibi', e.target.value)}
                          className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                          placeholder="Örn: Ad Soyad"
                        />
                      </div>
                      <div>
                        <label className="text-gray-400 text-sm block mb-1">IBAN</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={hesap.iban || ''}
                            onChange={e => bankaGuncelle(index, 'iban', e.target.value)}
                            className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                            placeholder="TR00 0000 0000 0000 0000 0000 00"
                          />
                          <button
                            type="button"
                            onClick={() => bankaKopyala(index, hesap.iban)}
                            className={`flex-shrink-0 rounded-lg px-3 py-2.5 text-xs font-medium ${ibanKopyalandi === index ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'}`}
                            title="IBAN'ı kopyala"
                          >
                            {ibanKopyalandi === index ? 'Kopyalandı!' : 'Kopyala'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setBankalar(prev => [...prev, { banka: '', hesapSahibi: '', iban: '' }])}
                  className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-2.5 text-sm font-medium text-yellow-300 hover:bg-yellow-500/20"
                >
                  + Hesap Ekle
                </button>
                <button onClick={handleBankInfoSave} disabled={bankInfoLoading} className="btn-gold px-6 py-2.5 flex items-center gap-2 disabled:opacity-50">
                  {bankInfoLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Banka Bilgilerini Kaydet
                </button>
              </div>
            </div>
          </div>
        )}

        {/* LUCA BAGLANTI */}
        {activeTab === 'luca' && adminMi && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Link2 className="w-5 h-5 text-yellow-400" />
              Luca Baglanti Merkezi
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              Musterilerin e-Fatura ve e-Arsiv faturalarini Luca uzerinden otomatik sorgulamak icin
              mali musavir Luca kullanici kodu ve sifrenizi girin. Bilgiler sunucuda saklanir, sorgu
              sirasında yardimci programa yalnizca islem aninda iletilir.
            </p>

            {lucaMsg && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-green-300 text-sm">{lucaMsg}</span>
              </div>
            )}
            {lucaErr && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-300 text-sm">{lucaErr}</span>
              </div>
            )}

            <div className="bg-blue-900/20 rounded-xl p-6 border border-blue-700/30">
              <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                <Link2 className="w-4 h-4 text-yellow-400" />
                Luca Giris Bilgileri
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="text-gray-400 text-sm block mb-1">Luca Uye Numarasi</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={lucaEdit.member || ''}
                    onChange={e => setLucaEdit(p => ({ ...p, member: e.target.value }))}
                    className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                    placeholder="Orn: 1309879"
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-sm block mb-1">Luca Kullanici Adi</label>
                  <input
                    type="text"
                    value={lucaEdit.username || ''}
                    onChange={e => setLucaEdit(p => ({ ...p, username: e.target.value }))}
                    className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                    placeholder="Luca kullanici adi"
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-sm block mb-1">Luca Parola</label>
                  <div className="relative">
                    <input
                      type={showLucaPass ? 'text' : 'password'}
                      value={lucaEdit.password || ''}
                      onChange={e => setLucaEdit(p => ({ ...p, password: e.target.value }))}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 pr-10 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                      placeholder="Luca parolasi"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLucaPass(!showLucaPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                    >
                      {showLucaPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
              {lucaInfo.username && (
                <p className="text-gray-500 text-xs mb-2">Kayitli: Uye No {lucaInfo.member || '-'} / {lucaInfo.username}</p>
              )}
              <p className="text-gray-500 text-xs mb-4">
                Uye Numarasi, Luca giris ekranindaki <strong>Musteri No</strong> ile aynidir.
                Luca "Musteri No, Kullanici Adi veya Parola hatalidir" diyorsa bu uc bilgiyi
                <a href="https://agiris.luca.com.tr/LUCASSO/giris.erp" target="_blank" rel="noreferrer" className="text-yellow-400 hover:underline"> Luca giris ekraninda </a>
                elle deneyip dogrulugunu kontrol edin.
              </p>
              <button onClick={handleLucaSave} disabled={lucaLoading} className="btn-gold px-6 py-2.5 flex items-center gap-2 disabled:opacity-50">
                {lucaLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Luca Bilgilerini Kaydet
              </button>
              <button onClick={handleAdminAc} disabled={lucaLoading} title="MUBiS yardimci programi bu bilgisayarda Luca entegrasyonunu (fatura sorgulama + masaustu kisayolu) acar" className="border border-yellow-400/40 text-yellow-300 px-6 py-2.5 rounded-xl flex items-center gap-2 hover:bg-yellow-400/10 disabled:opacity-50">
                <Link2 className="w-4 h-4" />
                Bu Bilgisayarda Luca'yi Ac
              </button>
              <p className="text-gray-500 text-xs mt-2">
                "Bu Bilgisayarda Luca'yi Ac" duymesini kullanmak yerine elle
                <a href="http://127.0.0.1:8765/admin-mod" target="_blank" rel="noreferrer" className="text-yellow-400 hover:underline"> http://127.0.0.1:8765/admin-mod </a>
                adresini de ziyaret edebilirsiniz (yedek yol).
              </p>
            </div>
          </div>
        )}

        {/* GIB BAGLANTI (admin vergi dairesi hesabi) */}
        {/* KAYIT KLASORLERI — indirilen beyanname ve faturalarin G: yollari */}
        {activeTab === 'kayit-klasorleri' && adminMi && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <FolderTree className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-semibold text-white">Kayıt Klasörleri</h3>
            </div>
            <p className="text-sm text-gray-400">
              Yardımcı programın indirdiği belgeler bu klasörlere kaydedilir. Her kullanıcı kendi bilgisayarındaki yol­lara göre ayarlayabilir. Klasör yoksa otomatik oluşturulur.
            </p>

            {klasorMsg && <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-300 text-sm">{klasorMsg}</div>}
            {klasorErr && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{klasorErr}</div>}

            <div className="grid gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Beyanname Klasörü</label>
                <input
                  type="text"
                  value={klasorEdit.beyanname}
                  onChange={(e) => setKlasorEdit(v => ({ ...v, beyanname: e.target.value }))}
                  placeholder="G:\Drive'ım\BEYANNAME"
                  className="w-full px-3 py-2 rounded-lg bg-gray-800/80 border border-gray-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
                <p className="text-xs text-gray-500 mt-1">Onaylanan beyanname + tahakkuk PDF'leri buradaki müşteri/tür/yıl/ay klasörlerine kaydedilir.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Fatura — Gelen (Alış) Klasörü</label>
                <input
                  type="text"
                  value={klasorEdit.gelen}
                  onChange={(e) => setKlasorEdit(v => ({ ...v, gelen: e.target.value }))}
                  placeholder="G:\Drive'ım\EDEFTER"
                  className="w-full px-3 py-2 rounded-lg bg-gray-800/80 border border-gray-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
                <p className="text-xs text-gray-500 mt-1">Luca'dan indirilen alış (gelen) faturaları buraya kaydedilir.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Fatura — Giden (Satış) Klasörü</label>
                <input
                  type="text"
                  value={klasorEdit.giden}
                  onChange={(e) => setKlasorEdit(v => ({ ...v, giden: e.target.value }))}
                  placeholder="G:\Drive'ım\EDEFTER"
                  className="w-full px-3 py-2 rounded-lg bg-gray-800/80 border border-gray-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
                <p className="text-xs text-gray-500 mt-1">Luca'dan indirilen satış (giden) faturaları buraya kaydedilir.</p>
              </div>
            </div>

            <button
              onClick={handleKlasorSave}
              disabled={klasorLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-medium transition-colors"
            >
              {klasorLoading ? 'Kaydediliyor...' : 'Klasör Ayarlarını Kaydet'}
            </button>
          </div>
        )}

        {activeTab === 'gib' && adminMi && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
              <Landmark className="w-5 h-5 text-yellow-400" />
              GİB Bağlantı Merkezi
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              Beyanname ve tahakkuklar, beyan onay otomasyonu ile <strong>bu admin vergi dairesi hesabıyla</strong> GİB'den
              (dijital.gib.gov.tr) otomatik indirilir. Müşterilerin beyanları bu hesap üzerinden tek tek aranır
              (VKN / TCKN ile). Bilgiler sunucuda saklanır.
            </p>

            {gibMsg && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-3 mb-4">
                <span className="text-green-300 text-sm">{gibMsg}</span>
              </div>
            )}
            {gibErr && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 mb-4">
                <span className="text-red-300 text-sm">{gibErr}</span>
              </div>
            )}

            <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-5 mb-4 max-w-lg">
              <h3 className="text-white font-medium mb-3">Admin Vergi Dairesi Giriş Bilgileri</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-gray-400 text-sm block mb-1">VD Kullanıcı Kodu</label>
                  <input
                    type="text"
                    value={gibEdit.kullanici || ''}
                    onChange={e => setGibEdit(p => ({ ...p, kullanici: e.target.value }))}
                    placeholder="İnternet vergi dairesi kullanıcı kodu"
                    className="w-full px-4 py-2.5 bg-blue-900/40 border border-blue-700/40 rounded-xl text-white text-sm focus:outline-none focus:border-yellow-500/50"
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-sm block mb-1">VD Şifresi</label>
                  <div className="relative">
                    <input
                      type={showGibPass ? 'text' : 'password'}
                      value={gibEdit.parola || ''}
                      onChange={e => setGibEdit(p => ({ ...p, parola: e.target.value }))}
                      placeholder="İnternet vergi dairesi şifresi"
                      className="w-full px-4 py-2.5 pr-11 bg-blue-900/40 border border-blue-700/40 rounded-xl text-white text-sm focus:outline-none focus:border-yellow-500/50"
                    />
                    <button type="button" onClick={() => setShowGibPass(!showGibPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                      {showGibPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
              {gibInfo.kullanici && (
                <p className="text-gray-500 text-xs mt-2">Kayıtlı kullanıcı kodu: {gibInfo.kullanici}</p>
              )}
              <p className="text-gray-500 text-xs mt-2">
                Bu bilgiler <strong>admin</strong> hesabıdır: tüm müşteri beyanları tek bu hesap üzerinden indirilir.
                Müşterilerin kendi VD bilgileri girilse bile otomasyonda admin hesabı kullanılır.
              </p>
              <button onClick={handleGibSave} disabled={gibLoading} className="btn-gold px-6 py-2.5 mt-4 flex items-center gap-2 disabled:opacity-50">
                {gibLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                GİB Bilgilerini Kaydet
              </button>
            </div>
          </div>
        )}

        {/* ANA EKRAN ASISTANI — admin cinsiyet secimi */}
        {activeTab === 'masaustu-asistan' && adminMi && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
              <Bot className="w-5 h-5 text-yellow-400" />
              Ana Ekran Asistanı
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              Admin ana ekranındaki asistan modelini seçin. Seçim anında uygulanır:
              <strong> Erkek 1 / Erkek 2</strong> ya da <strong>Kadın 1 / Kadın 2 / Kadın 3</strong> asistan ana ekranda görünür.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-2 max-w-4xl">
              {[
                { v: 'erkek', ad: 'Erkek 1', img: '/mascot-admin-erkek.png' },
                { v: 'erkek2', ad: 'Erkek 2', img: '/mascot-admin-erkek2-v4.png' },
                { v: 'kadin', ad: 'Kadın 1', img: '/mascot-admin-kadin.png' },
                { v: 'kadin2', ad: 'Kadın 2', img: '/mascot-admin-kadin2-v2.png' },
                { v: 'kadin3', ad: 'Kadın 3', img: '/mascot-admin-kadin3-v2.png' },
              ].map(s => (
                <button key={s.v} onClick={() => cinsiyetKaydet(s.v)}
                  className={`rounded-xl border p-4 transition-all ${
                    adminCinsiyet === s.v
                      ? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-300'
                      : 'bg-blue-900/20 border-blue-700/30 text-gray-300 hover:border-blue-600/50'
                  }`}>
                  <img src={s.img} alt={s.ad + ' asistan'} className="h-28 mx-auto object-contain mb-2" />
                  <div className="font-medium">{s.ad}</div>
                  {adminCinsiyet === s.v && <div className="text-[11px] text-yellow-400 mt-0.5">Seçili</div>}
                </button>
              ))}
            </div>
            <p className="text-gray-500 text-xs">
              Seçim bu bilgisayarda kayıtlı tutulur; ana ekranda hemen uygulanır.
            </p>

            {/* 2.7.543: Namaz vakitleri / imsakiye ac-kapa (varsayilan kapali) */}
            <div className="mt-4 bg-blue-900/20 rounded-xl p-4 max-w-lg">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-start space-x-3">
                  <span className="text-2xl leading-none" aria-hidden="true">🕌</span>
                  <div>
                    <span className="text-gray-300 text-sm font-medium">Namaz Vakitleri / İmsakiye</span>
                    <p className="text-gray-500 text-xs mt-0.5">Açık olursa ana ekran üst bandında, saat ve hava durumunun altında yaklaşan namaz vakti gösterilir; üzerine gelince günlük tüm vakitler açılır.</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={namazGoster}
                  onClick={() => { const yeni = !namazGoster; setNamazGoster(yeni); localStorage.setItem('admin_namaz_v1', yeni ? '1' : '0') }}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${namazGoster ? 'bg-emerald-500' : 'bg-blue-700/60'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${namazGoster ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            {/* 2.7.546: Web radyo ac-kapa (varsayilan kapali) */}
            <div className="mt-3 bg-blue-900/20 rounded-xl p-4 max-w-lg">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-start space-x-3">
                  <span className="text-2xl leading-none" aria-hidden="true">📻</span>
                  <div>
                    <span className="text-gray-300 text-sm font-medium">Web Radyo</span>
                    <p className="text-gray-500 text-xs mt-0.5">Açık olursa ana ekran üst bandında radyo rozeti gösterilir; tıklayınca açılır listeden yerli ve yabancı radyo istasyonları dinlenir. Favoriler ve ses ayarı kaydedilir.</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={radyoGoster}
                  onClick={() => { const yeni = !radyoGoster; setRadyoGoster(yeni); localStorage.setItem('admin_radio_v1', yeni ? '1' : '0') }}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${radyoGoster ? 'bg-emerald-500' : 'bg-blue-700/60'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${radyoGoster ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            {/* 2.7.546: YouTube Müzik ac-kapa (varsayilan kapali) */}
            <div className="mt-3 bg-blue-900/20 rounded-xl p-4 max-w-lg">
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
                  onClick={() => { const yeni = !ytMuzikGoster; setYtMuzikGoster(yeni); localStorage.setItem('admin_ytmusic_v1', yeni ? '1' : '0') }}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${ytMuzikGoster ? 'bg-emerald-500' : 'bg-blue-700/60'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${ytMuzikGoster ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            {/* 2.7.546: Spotify ac-kapa (varsayilan kapali) */}
            <div className="mt-3 bg-blue-900/20 rounded-xl p-4 max-w-lg">
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
                  onClick={() => { const yeni = !spotifyGoster; setSpotifyGoster(yeni); localStorage.setItem('admin_spotify_v1', yeni ? '1' : '0') }}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${spotifyGoster ? 'bg-emerald-500' : 'bg-blue-700/60'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${spotifyGoster ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            {/* 2.8.0: Sunucu yardimcisi (VPS) — bilgisayarsiz sorgu */}
            <div className="mt-6 pt-6 border-t border-blue-800/40">
              <h3 className="text-base font-semibold text-white mb-1 flex items-center gap-2">
                <Shield className="w-4 h-4 text-cyan-400" />
                Sunucu Yardımcısı (VPS)
              </h3>
              <p className="text-gray-400 text-sm mb-3">
                Sunucuda kurulu yardımcı servise bağlanın: bilgisayarınız kapalıyken de
                e-Tebligat ve fatura sorguları sunucuda çalışır. Boş bırakırsanız yerel
                yardımcı program kullanılır. Sunucu adresi ve anahtarı sistem yöneticisi tarafından yapılandırılır;
                aşağıdaki alan yalnızca sunucu modunu açar.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl">
                <input
                  value={sunucuUrl}
                  onChange={e => setSunucuUrl(e.target.value)}
                  placeholder="Sunucu modunu açmak için bir ad girin"
                  className="bg-blue-950/60 border border-blue-800/60 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-blue-700"
                />
              </div>
              {sunucuMsg && <div className="mt-2 text-sm text-cyan-300">{sunucuMsg}</div>}
              <div className="flex items-center gap-3 mt-3">
                <button onClick={sunucuAyarKaydet} className="btn-gold px-6 py-2.5 rounded-xl font-medium">Kaydet</button>
                <button onClick={sunucuTestEt} className="border border-cyan-500/40 text-cyan-300 px-6 py-2.5 rounded-xl hover:bg-cyan-500/10">Bağlantıyı Test Et</button>
                <span className="text-gray-400 text-sm">
                  Durum: {sunucuAktif
                    ? <strong className="text-green-400">SUNUCU MODU AKTİF</strong>
                    : <strong className="text-gray-500">Yerel yardımcı kullanılıyor</strong>}
                </span>
              </div>
            </div>

            {/* Admin olarak calistir sabitleme */}
            <div className="mt-6 pt-6 border-t border-blue-800/40">
              <h3 className="text-base font-semibold text-white mb-1 flex items-center gap-2">
                <Shield className="w-4 h-4 text-yellow-400" />
                Yardımcı Programı Admin Olarak Ata
              </h3>
              <p className="text-gray-400 text-sm mb-3">
                Aktifken yardımcı program her açılışta <strong>Yönetici olarak çalıştırılır</strong>; güncelleme sonrası
                elle "yönetici olarak çalıştır" tanımlamanız gerekmez.
              </p>
              {adminAtaMsg && (
                <div className="bg-blue-500/20 border border-blue-500/50 rounded-xl p-3 mb-3">
                  <span className="text-blue-300 text-sm">{adminAtaMsg}</span>
                </div>
              )}
              <div className="flex items-center gap-3 flex-wrap">
                <button onClick={() => adminAtaKaydet(!adminAta)}
                  disabled={adminAta === null}
                  className={`px-6 py-2.5 rounded-xl font-medium disabled:opacity-50 ${
                    adminAta
                      ? 'bg-red-600/80 hover:bg-red-600 text-white'
                      : 'btn-gold'
                  }`}>
                  {adminAta ? 'Admin Atamayı Kaldır' : 'Admin Olarak Ata'}
                </button>
                <span className="text-gray-400 text-sm">
                  Durum: {adminAta === null
                    ? <strong className="text-gray-500">Yardımcı program kapalı</strong>
                    : adminAta
                      ? <strong className="text-green-400">ADMIN AKTİF</strong>
                      : <strong className="text-red-400">ADMIN KAPALI</strong>}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ODEME KURULUSU SECIMI */}
        {activeTab === 'payments' && adminMi && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-yellow-400" />
              Odeme Kurulusu
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              Musterilerin kredi karti ile odeme yapacagi odeme kuruluslarini secin. Birden fazla kurulusu etkinlestirebilir, iclerinden aktif olanini belirleyebilirsiniz.
            </p>

            {commMsg && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-green-300 text-sm">{commMsg}</span>
              </div>
            )}
            {commErr && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-300 text-sm">{commErr}</span>
              </div>
            )}

            <div className="space-y-6">
              {/* 1. Adim: Etkin kuruluslar */}
              <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
                <h3 className="text-white font-medium mb-1 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-purple-400" />
                  1. Anlasilan Odeme Kuruluslari
                </h3>
                <p className="text-gray-400 text-xs mb-4">Anlastiginiz odeme kuruluslarini isaretleyin. Isaretlemediginiz takdirde online odeme kapali olur (yalnizca EFT/Havale).</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { id: 'paytr', label: 'PayTR', desc: 'PayTR Link API ile kredi karti odemesi' },
                    { id: 'odeal', label: 'Odeal', desc: 'Odeal Pay-by-Link ile kredi karti odemesi' }
                  ].map(provider => {
                    const isEnabled = enabledProviders.includes(provider.id)
                    return (
                      <label
                        key={provider.id}
                        className={`cursor-pointer rounded-xl border p-4 transition-all ${
                          isEnabled
                            ? 'bg-purple-500/10 border-purple-500/50'
                            : 'bg-blue-900/20 border-blue-700/30 hover:border-blue-600/50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={() => {
                              setEnabledProviders(prev => {
                                if (prev.includes(provider.id)) {
                                  return prev.filter(p => p !== provider.id)
                                }
                                return [...prev, provider.id]
                              })
                            }}
                            className="mt-1 w-4 h-4 rounded border-blue-700/50 bg-blue-900/30 text-purple-500 focus:ring-purple-500"
                          />
                          <div>
                            <p className="text-white font-medium text-sm">{provider.label}</p>
                            <p className="text-gray-400 text-xs mt-0.5">{provider.desc}</p>
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>

                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-yellow-300 text-xs mt-4">
                  <strong>Bilgi:</strong> Etkinlestirilen kurulusun API anahtarlari Vercel ortam degiskenlerinde tanimli olmalidir.
                  PayTR icin <code>PAYTR_MERCHANT_ID, PAYTR_MERCHANT_KEY, PAYTR_MERCHANT_SALT</code>;
                  Odeal icin <code>ODEAL_API_KEY, ODEAL_SECRET_KEY</code> gerekir.
                  Yeni bir odeme kurulusu ile anlasildiginda entegrasyonu eklenir ve bu listede gorunur hale gelir.
                </div>
              </div>

              {/* 2. Adim: Aktif kurulus secimi */}
              {enabledProviders.length > 0 ? (
                <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
                  <h3 className="text-white font-medium mb-1 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    2. Aktif Odeme Kurulusu
                  </h3>
                  <p className="text-gray-400 text-xs mb-4">Musteriler kredi karti ile odeme yaparken hangi kurulusu kullanacak? Icindeki bir tanesini secin.</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {enabledProviders.map(providerId => {
                      const meta = { paytr: 'PayTR', odeal: 'Odeal' }[providerId] || providerId
                      return (
                        <label
                          key={providerId}
                          className={`cursor-pointer rounded-xl border p-4 transition-all ${
                            activeProviderLocal === providerId
                              ? 'bg-green-500/10 border-green-500/50'
                              : 'bg-blue-900/20 border-blue-700/30 hover:border-blue-600/50'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="radio"
                              name="active_payment_provider"
                              value={providerId}
                              checked={activeProviderLocal === providerId}
                              onChange={() => setActiveProviderLocal(providerId)}
                              className="mt-1 w-4 h-4 text-green-500 border-blue-700/50 bg-blue-900/30 focus:ring-green-500"
                            />
                            <div>
                              <p className="text-white font-medium text-sm">{meta}</p>
                              <p className="text-gray-400 text-xs mt-0.5">Musteri odemeleri bu kurulus uzerinden alinir</p>
                            </div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="bg-gray-500/10 border border-gray-500/30 rounded-xl p-4 text-gray-300 text-sm">
                  Hicbir odeme kurulusu etkin degil. Musteriler yalnizca <strong>EFT/Havale</strong> ile odeme yapabilir
                  (Banka Bilgileri sekmesindeki hesap bilgileri musteride gorunur).
                </div>
              )}
            </div>

            <button onClick={handleProviderSetupSave} disabled={commLoading} className="btn-gold px-6 py-2.5 flex items-center gap-2 disabled:opacity-50 mt-6">
              {commLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Odeme Kurulusu Ayarlarini Kaydet
            </button>
          </div>
        )}

        {/* EVRAK GORUNURLUGU */}
        {activeTab === 'documents' && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-yellow-400" />
              Evrak Gorunurlugu
            </h2>
            <p className="text-gray-400 text-sm mb-6">Musteri portalinda hangi evrak turlerinin gorunecegini belirleyin.</p>

            {docPermMsg && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-green-300 text-sm">{docPermMsg}</span>
              </div>
            )}
            {docPermErr && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-300 text-sm">{docPermErr}</span>
              </div>
            )}

            <div className="space-y-6">
              {/* Beyannameler */}
              <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
                <h3 className="text-white font-medium mb-3">📄 Beyannameler</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { id: 'kdv', label: 'KDV' },
                    { id: 'kdv2', label: 'KDV2' },
                    { id: 'muhtasar', label: 'Muhtasar' },
                    { id: 'sgk', label: 'SGK' },
                    { id: 'gecici_vergi', label: 'Gecici Vergi' },
                    { id: 'kurumlar_vergi', label: 'Kurumlar Vergisi' },
                    { id: 'gelir_vergi', label: 'Gelir Vergisi' },
                    { id: 'edefter', label: 'e-Defter' },
                    { id: 'muhtasar_3aylik', label: 'Muhtasar (3 Aylik)' }
                  ].map(b => (
                    <label key={b.id} className="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!docPermissions?.beyanname?.[b.id]}
                        onChange={() => toggleDocPermission('beyanname', b.id)}
                        className="w-4 h-4 rounded border-blue-700/50 bg-blue-900/30 text-yellow-500 focus:ring-yellow-500"
                      />
                      <span>{b.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Tahakkuklar */}
              <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
                <h3 className="text-white font-medium mb-3">💰 Tahakkuklar</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { id: 'kdv', label: 'KDV' },
                    { id: 'kdv2', label: 'KDV2' },
                    { id: 'muhtasar', label: 'Muhtasar' },
                    { id: 'sgk', label: 'SGK' },
                    { id: 'gecici_vergi', label: 'Gecici Vergi' },
                    { id: 'kurumlar_vergi', label: 'Kurumlar Vergisi' },
                    { id: 'gelir_vergi', label: 'Gelir Vergisi' },
                    { id: 'edefter', label: 'e-Defter' },
                    { id: 'muhtasar_3aylik', label: 'Muhtasar (3 Aylik)' }
                  ].map(b => (
                    <label key={b.id} className="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!docPermissions?.tahakkuk?.[b.id]}
                        onChange={() => toggleDocPermission('tahakkuk', b.id)}
                        className="w-4 h-4 rounded border-blue-700/50 bg-blue-900/30 text-yellow-500 focus:ring-yellow-500"
                      />
                      <span>{b.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Diger evraklar */}
              <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
                <h3 className="text-white font-medium mb-3">📁 Diger Evraklar</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { id: 'mizan', label: 'Mizan' },
                    { id: 'sigorta_tahakkuk', label: 'Sigorta Tahakkuk' },
                    { id: 'hizmet_listesi', label: 'Hizmet Listesi' },
                    { id: 'bordro', label: 'Bordro' },
                    { id: 'gelir_beyani', label: 'Gelir Beyani' },
                    { id: 'gecici_vergi', label: 'Gecici Vergi' },
                    { id: 'vergi_levhasi', label: 'Vergi Levhasi' },
                    { id: 'mali_evraklar', label: 'Mali Evraklar' }
                  ].map(item => (
                    <label key={item.id} className="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!docPermissions?.[item.id]}
                        onChange={() => toggleDocPermission(item.id)}
                        className="w-4 h-4 rounded border-blue-700/50 bg-blue-900/30 text-yellow-500 focus:ring-yellow-500"
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <button onClick={handleDocPermissionSave} disabled={docPermLoading} className="btn-gold px-6 py-2.5 flex items-center gap-2 disabled:opacity-50 mt-6">
              {docPermLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Evrak Gorunurlugunu Kaydet
            </button>
          </div>
        )}

        {/* EVRAK KLASOR YAPISI */}
        {activeTab === 'folders' && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-2">Evrak Klasör Yapısı</h2>
            <p className="text-gray-400 text-sm mb-6">Müşteri portalındaki "Evraklarım" ağacında görünecek klasörleri, alt klasörleri ve her klasördeki içerikleri buradan tasarlayın. Bu yapı tüm müşterilere uygulanır.</p>

            {folderMsg && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-green-300 text-sm">{folderMsg}</span>
              </div>
            )}
            {folderErr && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-300 text-sm">{folderErr}</span>
              </div>
            )}

            <FolderStructureEditor value={docFolders} onChange={setDocFolders} />

            <button onClick={handleFolderSave} disabled={folderLoading} className="btn-gold px-6 py-2.5 flex items-center gap-2 disabled:opacity-50 mt-6">
              {folderLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Klasör Yapısını Kaydet
            </button>
          </div>
        )}

        {/* MUBIS ASISTAN SESI (Admin) */}
        {activeTab === 'assistant' && adminMi && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-yellow-400" />
              MUBİS Asistan Konuşma Sesi
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              Asistanın sesli cevap verirken kullanacağı sesi buradan seçin. Ayar tüm kullanıcılar için geçerlidir.
            </p>

            {sesMsg && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-green-300 text-sm">{sesMsg}</span>
              </div>
            )}
            {sesErr && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-300 text-sm">{sesErr}</span>
              </div>
            )}
            {!sesDestekleniyor() && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 mb-4 text-yellow-300 text-sm">
                Bu tarayıcı sesli okumayı desteklemiyor. Chrome veya Edge önerilir.
              </div>
            )}

            {/* Cinsiyet secimi */}
            <label className="block text-gray-300 text-sm mb-2">Ses Tipi</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              {SES_TERCIHLERI.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSesAyari(prev => ({ ...prev, tercih: opt.id, sesAdi: '' }))}
                  className={`px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                    sesAyari.tercih === opt.id
                      ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
                      : 'bg-blue-950/40 text-gray-300 border-blue-800/40 hover:border-blue-600/60'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Sistemdeki sesler */}
            <label className="block text-gray-300 text-sm mb-2">
              Tarayıcı Sesi {sesListesi.length > 0 && <span className="text-gray-500">({sesListesi.length} ses bulundu)</span>}
            </label>
            <select
              value={sesAyari.sesAdi || ''}
              onChange={e => setSesAyari(prev => ({ ...prev, sesAdi: e.target.value }))}
              className="input-field w-full mb-2"
            >
              <option value="">Otomatik seç ({sesSec(sesAyari)?.name || 'ses bulunamadı'})</option>
              <optgroup label="Türkçe sesler">
                {sesListesi.filter(v => (v.lang || '').toLowerCase().startsWith('tr')).map(v => (
                  <option key={v.name} value={v.name}>
                    {v.name} {sesCinsiyeti(v) === 'kadin' ? '(kadın)' : sesCinsiyeti(v) === 'erkek' ? '(erkek)' : ''}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Diğer diller (Türkçe telaffuz bozuk olabilir)">
                {sesListesi.filter(v => !(v.lang || '').toLowerCase().startsWith('tr')).map(v => (
                  <option key={v.name} value={v.name}>
                    {v.name} - {v.lang} {sesCinsiyeti(v) === 'kadin' ? '(kadın)' : sesCinsiyeti(v) === 'erkek' ? '(erkek)' : ''}
                  </option>
                ))}
              </optgroup>
            </select>
            <p className="text-gray-500 text-xs mb-4">
              Belirli bir ses seçerseniz cinsiyet tercihi yerine o ses kullanılır. Liste kullanıcının tarayıcısına göre değişebilir.
            </p>

            {/* Kadin sesi yoksa uyari */}
            {sesListesi.length > 0 && !cinsiyetSesiVar('kadin') && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3.5 mb-6 text-blue-200 text-xs leading-relaxed">
                <strong className="text-white block mb-1">Sisteminizde Türkçe kadın sesi yüklü değil.</strong>
                Kadın sesi seçtiğinizde MUBİS mevcut sesi daha ince tonda okur. Gerçek kadın sesi için:
                <br />• <strong>Microsoft Edge</strong> tarayıcısında "Microsoft Emel Online (Natural) - Turkish" sesi hazır gelir.
                <br />• Windows'ta <em>Ayarlar → Saat ve Dil → Konuşma → Ses ekle</em> ile Türkçe ses paketi kurabilirsiniz.
                <br />• Ya da yukarıdaki listeden farklı dilde bir kadın sesi seçebilirsiniz.
              </div>
            )}

            {/* Hiz ve ton */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-gray-300 text-sm mb-2">Konuşma Hızı: {Number(sesAyari.hiz).toFixed(2)}x</label>
                <input
                  type="range" min="0.6" max="1.6" step="0.02"
                  value={sesAyari.hiz}
                  onChange={e => setSesAyari(prev => ({ ...prev, hiz: parseFloat(e.target.value) }))}
                  className="w-full accent-yellow-400"
                />
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-2">Ses Tonu: {Number(sesAyari.ton).toFixed(2)}</label>
                <input
                  type="range" min="0.5" max="1.8" step="0.02"
                  value={sesAyari.ton}
                  onChange={e => setSesAyari(prev => ({ ...prev, ton: parseFloat(e.target.value) }))}
                  className="w-full accent-yellow-400"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => konus('Merhaba, ben MUBİS yapay zekâ asistanı. Vergi ve SGK sorularınızda yanınızdayım.', sesAyari)}
                className="px-5 py-2.5 rounded-xl bg-blue-800/40 border border-blue-700/50 text-white text-sm font-medium hover:bg-blue-800/60 flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                Sesi Dinle
              </button>
              <button onClick={handleSesSave} disabled={sesLoading} className="btn-gold px-6 py-2.5 flex items-center gap-2 disabled:opacity-50">
                {sesLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Ses Ayarlarını Kaydet
              </button>
            </div>
          </div>
        )}

        {/* KULLANICI YONETIMI (Admin) */}
        {activeTab === 'users' && adminMi && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Kullanici Yonetimi</h2>
              <div className="flex items-center gap-2">
                {selectedIds.size > 0 && (
                  <button onClick={handleBulkDelete} disabled={adminLoading}
                    className="bg-red-600/80 hover:bg-red-500 text-white px-4 py-2 text-sm rounded-xl flex items-center gap-2 disabled:opacity-50">
                    <Trash2 className="w-4 h-4" />
                    Secilenleri Sil ({selectedIds.size})
                  </button>
                )}
                <button onClick={() => { setNewUserForm({ name: '', email: '', password: '', role: 'personel' }); setShowNewUserForm(true) }} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 text-sm rounded-xl flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Personel Ekle
                </button>
                <button onClick={() => setShowNewUserForm(!showNewUserForm)} className="btn-gold px-4 py-2 text-sm flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Yeni Kullanici Ekle
                </button>
              </div>
            </div>
            <p className="text-gray-400 text-sm mb-3">Personel ve admin hesaplari ekleyin, sifre durumlarini yonetin. Onay islemlerinde buradaki isim gorunur.</p>
            <div className="bg-blue-900/25 border border-blue-700/40 rounded-xl p-3 mb-6 flex items-start gap-3">
              <Users className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
              <p className="text-gray-300 text-sm">
                Bu bolum sadece <strong className="text-white">personel ve admin</strong> hesaplari icindir.
                Musteri eklemek icin{' '}
                <Link to="/admin/clients/new" className="text-yellow-400 font-semibold hover:underline">Yeni Musteri Ekle</Link>{' '}
                sayfasini kullanin. Musteri kaydedildiginde portal giris hesabi otomatik olusur
                (kullanici adi: VKN/TC, gecici sifre: <strong className="text-white">123456</strong>).
              </p>
            </div>

            {showNewUserForm && (
              <form onSubmit={handleCreateUser} className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-4 mb-6 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">Ad (ornegin: Koray, Sinem)</label>
                    <input type="text" required value={newUserForm.name} onChange={e => setNewUserForm({ ...newUserForm, name: e.target.value })}
                      placeholder="Kisa ad"
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-yellow-500" />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">E-posta</label>
                    <input type="email" required value={newUserForm.email} onChange={e => setNewUserForm({ ...newUserForm, email: e.target.value })}
                      placeholder="ornek@mubis.com"
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-yellow-500" />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">Gecici Sifre</label>
                    <input type="text" required minLength={6} value={newUserForm.password} onChange={e => setNewUserForm({ ...newUserForm, password: e.target.value })}
                      placeholder="En az 6 karakter"
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-yellow-500" />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">Rol</label>
                    <select value={newUserForm.role} onChange={e => setNewUserForm({ ...newUserForm, role: e.target.value })}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-yellow-500">
                      <option value="personel">Personel</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button type="submit" disabled={createLoading} className="btn-gold px-6 py-2.5 flex items-center gap-2 disabled:opacity-50">
                    {createLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Kullanici Olustur
                  </button>
                  <button type="button" onClick={() => setShowNewUserForm(false)} className="text-gray-400 hover:text-white text-sm px-3 py-2">
                    Vazgec
                  </button>
                </div>
                <p className="text-gray-500 text-xs">Kullanici ilk giriste sifresini degistirmek zorunda kalir. Admin ve personel admin paneline kendi e-posta ve sifresiyle girer.</p>
              </form>
            )}

            {adminMsg && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-green-300 text-sm">{adminMsg}</span>
              </div>
            )}
            {adminErr && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-300 text-sm">{adminErr}</span>
              </div>
            )}

            <div className="space-y-3">
              {users.filter(u => u.id !== user.id).length > 0 && (
                <label className="flex items-center gap-2 px-1 text-gray-400 text-xs cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedIds.size > 0 && selectedIds.size === users.filter(u => u.id !== user.id).length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded accent-yellow-500"
                  />
                  Tumunu Sec
                </label>
              )}
              {users.map(u => (
                <div key={u.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                  selectedUser?.id === u.id ? 'border-yellow-500/50 bg-yellow-500/10' : 'border-blue-700/30 bg-blue-900/20 hover:bg-blue-800/30'
                }`} onClick={() => setSelectedUser(u)}>
                  <div className="flex items-center gap-3">
                    {u.id !== user.id && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(u.id)}
                        onChange={() => toggleSelectUser(u.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 rounded accent-yellow-500 cursor-pointer"
                      />
                    )}
                    <div>
                      <div className="text-white text-sm font-medium">{u.name || u.email}</div>
                      <div className="text-gray-400 text-xs">{u.email} - {u.role}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {u.temp_password && (
                      <span className="bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded text-xs">Gecici Sifre</span>
                    )}
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      u.role === 'admin' ? 'bg-yellow-500/20 text-yellow-400' : u.role === 'client' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'
                    }`}>{u.role}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditUser(u) }}
                      className="text-blue-400 hover:text-blue-300 p-1.5 rounded-lg hover:bg-blue-500/20"
                      title="Kullaniciyi duzenle"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    {u.id !== user.id && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteUser(u) }}
                        className="text-red-400 hover:text-red-300 p-1.5 rounded-lg hover:bg-red-500/20"
                        title="Kullaniciyi sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {editingUser && (
              <form onSubmit={handleUpdateUser} className="mt-6 p-4 bg-blue-900/20 rounded-xl border border-blue-700/30 space-y-3">
                <h3 className="text-white text-sm font-medium">{editingUser.name || editingUser.email} - Duzenle</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input type="text" required value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="Ad"
                    className="bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-yellow-500" />
                  <input type="email" required value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                    placeholder="E-posta"
                    className="bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-yellow-500" />
                  <select value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                    className="bg-blue-900/30 border border-blue-700/50 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-yellow-500">
                    <option value="personel">Personel</option>
                    <option value="admin">Admin</option>
                    <option value="musteri">Müşteri</option>
                  </select>
                </div>
                {editForm.role !== 'client' && editForm.role !== 'musteri' && (
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-gray-300 text-sm">Mükellef</span>
                    <div className="flex rounded-xl overflow-hidden border border-blue-700/50">
                      <button type="button" onClick={() => setEditForm({ ...editForm, mukellef: true })}
                        className={`px-4 py-2 text-sm transition-colors ${editForm.mukellef ? 'bg-green-600/80 text-white font-medium' : 'bg-blue-900/30 text-gray-400 hover:bg-blue-800/40'}`}>
                        Evet
                      </button>
                      <button type="button" onClick={() => setEditForm({ ...editForm, mukellef: false })}
                        className={`px-4 py-2 text-sm transition-colors ${!editForm.mukellef ? 'bg-red-600/70 text-white font-medium' : 'bg-blue-900/30 text-gray-400 hover:bg-blue-800/40'}`}>
                        Hayır
                      </button>
                    </div>
                    <span className="text-gray-500 text-xs">Evet ise sol menüde kendi mükellef klasörü görünür</span>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <button type="submit" disabled={adminLoading} className="btn-gold px-5 py-2 text-sm flex items-center gap-2 disabled:opacity-50">
                    {adminLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Kaydet
                  </button>
                  <button type="button" onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-white text-sm px-3 py-2">
                    Vazgec
                  </button>
                </div>
              </form>
            )}

            {selectedUser && selectedUser.id !== user.id && (
              <div className="mt-6 p-4 bg-blue-900/20 rounded-xl border border-blue-700/30">
                <h3 className="text-white text-sm font-medium mb-3">
                  {selectedUser.name || selectedUser.email} - Sifre Islemleri
                </h3>
                <button onClick={handleResetUserPassword} disabled={adminLoading}
                  className="btn-gold px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-50">
                  {adminLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Gecici Sifre Zorunlulugu Ekle
                </button>
                <p className="text-gray-500 text-xs mt-2">Kullanici bir sonraki giriste sifre degistirmek zorunda kalacak.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
