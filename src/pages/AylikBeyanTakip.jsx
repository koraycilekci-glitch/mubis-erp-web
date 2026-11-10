import { useState, useEffect, useCallback, useRef } from 'react'
import { useClients } from '../hooks/useClients'
import { supabase } from '../lib/supabase'
import * as clientService from '../services/clientService'
import * as XLSX from 'xlsx'
import {
  Calendar, Search, Eye,
  CheckCircle, Clock, AlertTriangle, X,
  ChevronLeft, ChevronRight, RefreshCw,
  FileText, FileSpreadsheet, List, LayoutGrid, BookOpen,
  Send, FileCheck, Upload, Trash2, Download, Pencil
} from 'lucide-react'
import { 
  getFormattedBeyanDeadline,
  getFormattedSgkOdemeGunu,
  formatDateTimeTR,
  getMonthName,
  isResmiTatil
} from '../utils/dateUtils'

import { useAuth } from '../context/AuthContext'
import { saveTahakkukAmount } from '../services/tahakkukService'
import { analyzeDocument, saveDocumentAnalysis } from '../services/documentIntelligenceEngine'
import { createNotification } from '../services/notificationService'
import { addBeyanDocument, removeBeyanDocument, getBeyanDocuments } from '../services/beyanDocumentService'
import { uploadClientDocument, uploadClientBulkDocument, tahakkukDonemi } from '../services/documentService'
import { getTahakkukList, getBeyanList, sumTahakkukTutar, oluTahakkukTemizle } from '../utils/tahakkukUtils'
import { gibBelgeIndirVeYukle, beyanOnayOtomatikIndir, tahakkuklariGonder } from '../services/gibIndirmeService'
import { beyannameKayitlariGetir, donemKapsiyor } from '../services/beyannameService'

// 2.7.497: Beyanname Kontrol Listesi'nde GİB'de "onaylı" görünen (Gönderildi)
// beyannameler aylık takipte de "Onaylandı" işaretlenir. GİB kaydındaki `tur`
// HAM metindir (örn. "KDV 1 BEYANNAMESİ", "MUHTASAR BEYANNAMESİ") — birebir
// kod eşleşmesi çalışmaz; Beyanname Kontrol'ün regex testleri aynen uygulanır
// (2.7.498: eksik işaretleme kök nedeni buydu). DAMGA'nın aylık takip
// karşılığı yok; SGK bildirgesi beyanname kontrol kapsamı dışıdır.
const normTr = (s) => String(s || '').toLocaleLowerCase('tr')
const GIB_TUR_TESTLERI = {
  kdv: t => /kdv\s*1/.test(t),
  kdv2: t => /kdv\s*2/.test(t),
  muhtasar: t => /muhtasar|muhsgk/.test(t),
  muhtasar_3aylik: t => /muhtasar|muhsgk/.test(t),
  gecici_vergi: t => /ge[çc]ici/.test(t),
  kurumlar_vergi: t => /kurumlar/.test(t),
  gelir_vergi: t => /gelir/.test(t),
  poset: t => /po[şs]et/.test(t)
}

// Bir beyan hücresi için GİB onaylı kayıt var mı? belongMonths 0-tabanlıdır;
// donemKapsiyor 1-tabanlı ay bekler. Yükleme-ayi filtresi kayitlariGetir icinde.
const gibOnayliVar = (beyan, kayitlar, kimlikler) => {
  const test = GIB_TUR_TESTLERI[beyan.type]
  if (!test || !kimlikler.length || !kayitlar?.length) return false
  const aylar1 = (beyan.belongMonths || []).map(m => m + 1)
  return kayitlar.some(k =>
    kimlikler.includes(String(k.vkn || '')) &&
    test(normTr(k.tur)) &&
    aylar1.some(a => donemKapsiyor(k.donem, beyan.belongYear, a)))
}

export default function AylikBeyanTakip() {
  const { clients: allClients } = useClients()
  const { user, profile } = useAuth()
  const [loading, setLoading] = useState(false)
  const [clients, setClients] = useState([])
  const [filteredData, setFilteredData] = useState([])
  const [selectedClient, setSelectedClient] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  // Matris hucre modal (durum + yukleme)
  const [matrisCell, setMatrisCell] = useState(null) // { clientId, clientName, month0 }
  // GIB'den otomatik indirme durumu (yardimci program uzerinden)
  const [gibIndirme, setGibIndirme] = useState(null) // { clientId, type, durum }
  const [showSgkModal, setShowSgkModal] = useState(false)
  const [sgkBeyan, setSgkBeyan] = useState(null)
  const [sgkDocs, setSgkDocs] = useState([])
  const [sgkUploadLoading, setSgkUploadLoading] = useState(false)
  
  const today = new Date()
  // Varsayilan donem: icinde bulunulan ayin BIR ONCEKI ayi (Agustos'ta Temmuz)
  const varsayilanAy = today.getMonth() === 0 ? 11 : today.getMonth() - 1
  const varsayilanYil = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()
  const [selectedYear, setSelectedYear] = useState(varsayilanYil)
  const [selectedMonth, setSelectedMonth] = useState(varsayilanAy)
  
  const [selectedBeyan, setSelectedBeyan] = useState('kdv')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState('matris')
  
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(50)
  
  const [sortField, setSortField] = useState('name')
  const [sortDirection, setSortDirection] = useState('asc')
  const [documentPanelClient, setDocumentPanelClient] = useState(null)
  // Olu tahakkuk kaydi temizligi oturum basina bir kez yapilir
  const oluTemizlikYapilanRef = useRef(new Set())
  // Sag altta gecenici bildirim (otomatik indirme/gonderim sonuclari)
  const [bildiri, setBildiri] = useState(null)
  const bildiriZamanRef = useRef(0)
  // Arka plan GIB yuklemeleri: key -> 'yukleniyor' (hucrede donen yildiz)
  const [yuklemeDurumlari, setYuklemeDurumlari] = useState({})
  const bildiriGoster = (mesaj, tur = 'success', sureMs = 7000) => {
    bildiriZamanRef.current = Date.now()
    setBildiri({ mesaj, tur, ts: bildiriZamanRef.current })
    setTimeout(() => {
      if (bildiriZamanRef.current && Date.now() - bildiriZamanRef.current >= sureMs - 500) {
        setBildiri(null)
      }
    }, sureMs)
  }

  const months = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
  ]

  // Uzun isim/unvanlari 25 karakterde kisalt
  const kisaAd = (ad) => {
    const s = (ad || '').trim()
    return s.length > 25 ? s.slice(0, 24).trimEnd() + '…' : s
  }

  const beyanTipleri = [
    // 2.7.239: "Tüm Beyanlar" secenegi kaldirildi (kullanici talimati) —
    // listeler artik belirli beyan turu secilince gosterilir.
    { id: 'kdv', label: 'KDV', icon: '📄' },
    { id: 'kdv2', label: 'KDV2', icon: '📄' },
    { id: 'muhtasar', label: 'Muhtasar', icon: '📄' },
    { id: 'sgk', label: 'SGK', icon: '🏥' },
    { id: 'gecici_vergi', label: 'Geçici Vergi', icon: '📊' },
    { id: 'poset', label: 'Poşet', icon: '🛍️' },
    { id: 'kurumlar_vergi', label: 'Kurumlar Vergisi', icon: '🏢' },
    { id: 'gelir_vergi', label: 'Gelir Vergisi', icon: '👤' },
    { id: 'edefter', label: 'e-Defter', icon: '📓' },
    { id: 'muhtasar_3aylik', label: 'Muhtasar (3 Aylık)', icon: '📄' },
  ]

  const statusOptions = [
    { id: 'all', label: 'Tüm Durumlar', color: 'gray' },
    { id: 'yapilamadi', label: 'Yapılmadı', color: 'red' },
    { id: 'evrak_alindi', label: 'Evrak Alındı', color: 'sky' },
    { id: 'hazir', label: 'Hazır', color: 'yellow' },
    { id: 'onaylandi', label: 'Onaylandı', color: 'green' },
    { id: 'gonderildi', label: 'Gönderildi', color: 'purple' },
  ]

  const loadData = useCallback(async () => {
    setLoading(true)

    // Her zaman guncel veriyi cek (dogrudan service uzerinden)
    let freshClients = []
    try {
      const dbClients = await clientService.getClients()
      freshClients = clientService.dbToFrontendList(dbClients)
    } catch (err) {
      console.error('Musteri listesi cekilemedi:', err)
    }

    // 2.7.497: GİB'de onaylı beyannameler (Beyanname Kontrol'de "Gönderildi"
    // görünenler) aylık takipte de "Onaylandı" yapilir. Secili donem (0-tabanli
    // M) GİB vergilendirme dönemine karsilik gelir; kayitlar yükleme ayina
    // gore suzlenir (donem X -> X+1 yuklemeleri).
    let gibKayitlar = []
    try {
      // 2.7.5xx KRITIK: beyannameKayitlariGetir(yil, donem) DÖNEM alir,
      // yükleme filtresini ICERIDE yapar (kayitlar dönem+1 ayinda yüklenenler;
      // yuklemeAyinda). Önceki kod dönem+1'i parametre olarak veriyordu —
      // servis bir +1 daha ekleyip dönem+2 yüklemelerini getiriyordu,
      // sonuç hep bos kaliyordu ve "Onaylandı" isaretlenmiyordu.
      gibKayitlar = await beyannameKayitlariGetir(selectedYear, selectedMonth + 1)
      // Yıllık beyanlar (gelir Mart Y+1 / kurumlar Nisan Y+1'de yüklenir):
      // yükleme parametresi DÖNEM oldugu icin 2 (Subat→Mart yüklemesi) ve
      // 3 (Mart→Nisan yüklemesi) verilir.
      if (selectedMonth === 11) {
        const ekMart = await beyannameKayitlariGetir(selectedYear + 1, 2).catch(() => [])
        const ekNisan = await beyannameKayitlariGetir(selectedYear + 1, 3).catch(() => [])
        gibKayitlar = [...gibKayitlar, ...(ekMart || []), ...(ekNisan || [])]
      }
    } catch { /* GIB kayitlari okunamazsa takip oldugu gibi kalir */ }

    const data = freshClients.map(client => {
      const kimlikler = [client.vkn, client.tc].filter(v => /^\d{10,11}$/.test(String(v || ''))).map(String)
      const beyanlar = generateMonthlyBeyanlar(client)
      // Yalnizca asagi durumdan yukari: yapilamadi/hazir/yapildi -> onaylandi
      // ('tahakkuk_gonderildi' ve mevcut 'onaylandi' dokunulmaz).
      const yukseltilecek = beyanlar.filter(b =>
        !['yapildi', 'onaylandi', 'tahakkuk_gonderildi'].includes(b.status) &&
        gibOnayliVar(b, gibKayitlar, kimlikler))
      if (yukseltilecek.length) {
        const map = { ...(client.beyan_durumlari || client.beyanDurumlari || {}) }
        for (const b of yukseltilecek) {
          b.status = 'onaylandi'
          map[`${b.belongYear}_${b.belongMonths[0]}_${b.type}`] = 'onaylandi'
        }
        client.beyanDurumlari = map
        client.beyan_durumlari = map
        // Kalici yaz — bir sonraki yuklemede zaten 'onaylandi' oldugu icin
        // tekrar yazilmaz (idempotent).
        supabase.from('clients').update({ beyan_durumlari: map }).eq('id', client.id)
          .then(() => { }).catch(() => { })
      }
      return {
        ...client,
        beyanlar: beyanlar,
        summary: getBeyanSummary(beyanlar)
      }
    })

    setClients(data)
    applyFilters(data)
    setLoading(false)
    donemDisiKayitlariTemizle(data)
  }, [selectedYear, selectedMonth, selectedBeyan, selectedStatus, searchTerm])

  // Donem-disi tahakkuk kayitlarini temizle: eski bir deplo (Storage kesifi
  // donem kontrolu yapmadan) ayni tahakkuk PDF'ini birden fazla ayin
  // kayit listesine yazmisti — silinince de kesif geri ekliyordu. Sayfa
  // acilirken dosya adindan donem dogrulanir; uymayanlar DB'den cikarilir
  // (dosyanin kendisi Storage'da kalir; dogru donemde yeniden kesfedilir).
  const donemDisiKayitlariTemizle = async (musteriler) => {
    const dosyaAdi = (url) => {
      try {
        const s = String(url || '').split('?')[0]
        return decodeURIComponent(s.substring(s.lastIndexOf('/') + 1))
      } catch { return '' }
    }
    for (const c of musteriler || []) {
      const map = c.beyanDurumlari || {}
      const dbMap = c.beyan_durumlari || map
      let degisti = false
      const yeniMap = { ...dbMap }
      for (const [key, deger] of Object.entries(dbMap)) {
        if (!key.endsWith('_tahakkuklar') || !Array.isArray(deger)) continue
        // baseKey: <yil>_<ay>_<tur>
        const parca = key.replace(/_tahakkuklar$/, '').split('_')
        const yil = parseInt(parca[0], 10)
        const ay = parseInt(parca[1], 10)
        if (!yil || !ay) continue
        const temiz = deger.filter(t => {
          const donem = tahakkukDonemi(dosyaAdi(t?.url))
          if (!donem) return true // donemi tespit edilemeyenlere dokunma
          if (donem.ay && donem.ay !== ay) return false
          if (donem.yil && donem.yil !== yil) return false
          return true
        })
        if (temiz.length !== deger.length) {
          yeniMap[key] = temiz
          yeniMap[`${key.replace(/_tahakkuklar$/, '')}_tutar`] = sumTahakkukTutar(temiz)
          degisti = true
        }
      }
      // Olu kayit temizligi: silinmis dosyalarin kalintisi tutar/url kayitlari
      // (musteriya hatali tutar gosterir, keşfi bloklar). Oturum basina bir kez.
      if (!oluTemizlikYapilanRef.current.has(c.id)) {
        oluTemizlikYapilanRef.current.add(c.id)
        try {
          const olu = await oluTahakkukTemizle(yeniMap)
          if (olu.degisti) { degisti = true; Object.assign(yeniMap, olu.yeniMap) }
        } catch { /* best-effort */ }
      }
      if (degisti) {
        try {
          await supabase.from('clients').update({ beyan_durumlari: yeniMap }).eq('id', c.id)
          c.beyanDurumlari = yeniMap
          c.beyan_durumlari = yeniMap
        } catch { /* temizlik best-effort */ }
      }
    }
  }

  const generateMonthlyBeyanlar = (client) => {
    const results = []
    const profile = client.beyanProfile || {}
    const M = selectedMonth // AIT OLDUGU AY (beyan ayi)
    const Y = selectedYear

    // Verilme (filing) ayi = M + 1 (aylik beyanlar icin)
    const filingM = (M + 1) % 12
    const filingY = M === 11 ? Y + 1 : Y

    const checkProfile = (beyanId, belongMonth) => {
      const p = profile[beyanId]
      if (!p) return { active: true, period: 'aylik' }
      const md = p[belongMonth]
      if (!md) return { active: true, period: 'aylik' }
      return {
        active: md.active !== false && md.period !== 'yok',
        period: md.period || 'aylik'
      }
    }

    const addResult = (id, label, icon, belongMonths, belongYear, deadline, verilmeAyLabel, paymentDeadline) => {
      const aitLabel = belongMonths.length === 1
        ? getMonthName(belongMonths[0])
        : belongMonths.length <= 3
          ? belongMonths.map(m => getMonthName(m)).join(', ')
          : `${belongYear} Yili`
      const key = `${belongYear}_${belongMonths[0]}_${id}`
      results.push({
        id: `${client.id}_${id}`,
        type: id, label, icon,
        belongMonths,
        belongYear,
        status: client.beyanDurumlari?.[key] || 'yapilamadi',
        deadline,
        paymentDeadline: paymentDeadline || '',
        aitAy: `${aitLabel} ${belongYear}`,
        verildigiAy: verilmeAyLabel,
        amount: client.beyanDurumlari?.[`${key}_tutar`] || 0,
        tax: client.beyanDurumlari?.[`${key}_vergi`] || 0,
        tahakkukNo: client.beyanDurumlari?.[`${key}_tahakkuk`] || '',
        personnel: client.beyanDurumlari?.[`${key}_personel`] || '',
        updatedAt: client.beyanDurumlari?.[`${key}_tarih`] || '-',
        tahakkukUrl: client.beyanDurumlari?.[`${key}_tahakkuk_url`] || '',
        analizDurumu: client.beyanDurumlari?.[`${key}_analiz_durumu`] || '',
        analizHata: client.beyanDurumlari?.[`${key}_analiz_hata`] || ''
      })
    }

    // ========== AYLIK BEYANLAR (sonraki ayda verilir) ==========

    // KDV - sonraki ayin 28'i
    if (checkProfile('kdv', M).active) {
      addResult('kdv', 'KDV', '📄', [M], Y,
        getFormattedBeyanDeadline(filingY, filingM, 28),
        `${getMonthName(filingM)} ${filingY}`)
    }

    // KDV2 - sonraki ayin 25'i
    if (checkProfile('kdv2', M).active) {
      addResult('kdv2', 'KDV2', '📄', [M], Y,
        getFormattedBeyanDeadline(filingY, filingM, 25),
        `${getMonthName(filingM)} ${filingY}`)
    }

    // Poset beyani — yalniz profilde O AY icin acilmis musterilerde gorunur
    // (opt-in tur; profil anahtari hic yoksa beyan olusturulmaz)
    const posetMd = profile.poset?.[M]
    if (posetMd && posetMd.active !== false && posetMd.period !== 'yok') {
      addResult('poset', 'Poşet', '🛍️', [M], Y,
        getFormattedBeyanDeadline(filingY, filingM, 25),
        `${getMonthName(filingM)} ${filingY}`)
    }

    // SGK - bildirge muhtasar ile birlikte verilir: son beyan zamanı her ayin
    // en gec 26'si (tatil/hafta sonunda ilk is gunu); ODEME zamanı ayin son
    // gunudur — hafta sonu/tatile denk gelirse TAKIP EDEN ilk is gunune
    // ILERI ertelenir (Ekim 2026: 31 Cumartesi -> 2 Kasim Pazartesi)
    if (checkProfile('sgk', M).active) {
      addResult('sgk', 'SGK', '🏥', [M], Y,
        getFormattedBeyanDeadline(filingY, filingM, 26),
        `${getMonthName(filingM)} ${filingY}`,
        getFormattedSgkOdemeGunu(filingY, filingM))
    }

    // Muhtasar (Aylik) - sonraki ayin 26'si; hafta sonu/tatilde ertelenir
    const muhtCheck = checkProfile('muhtasar', M)
    if (muhtCheck.active && muhtCheck.period === 'aylik') {
      addResult('muhtasar', 'Muhtasar', '📄', [M], Y,
        getFormattedBeyanDeadline(filingY, filingM, 26),
        `${getMonthName(filingM)} ${filingY}`,
        // Muhtasar odeme gunu de beyan gunuyle ayni (26); tatil/hafta sonuna
        // denk gelirse ILERI ertelenir (26 Cumartesi -> 28 Pazartesi)
        getFormattedBeyanDeadline(filingY, filingM, 26))
    }

    // ========== 3 AYLIK MUHTASAR (ceyrek son aylarinda gosterilir) ==========
    // Ceyrek son aylari: Mart(2), Haziran(5), Eylul(8), Aralik(11)
    const quarterEndMonths = [2, 5, 8, 11]
    if (quarterEndMonths.includes(M)) {
      const qStart = M - 2
      const qMonths = [qStart, qStart + 1, qStart + 2]

      const has3Aylik = qMonths.some(m => {
        const mc = checkProfile('muhtasar', m)
        return mc.active && mc.period === '3aylik'
      })
      if (has3Aylik) {
        addResult('muhtasar_3aylik', 'Muhtasar (3 Aylık)', '📄', qMonths, Y,
          getFormattedBeyanDeadline(filingY, filingM, 26),
          `${getMonthName(filingM)} ${filingY}`,
          // 3 aylik muhtasar odeme gunu da 26; ILERI ertelenmis is gunu
          getFormattedBeyanDeadline(filingY, filingM, 26))
      }
    }

    // ========== GECİCİ VERGİ ==========
    // Diger beyanlar gibi verilme (filing) ayina gore gosterilir.
    // Ornek: Temmuz(6) seciliyse filingM=Agustos(7) -> 2. Donem Gecici Vergi gorunur.
    const geciciVerilmeAylari = {
      1:  { donem: 4, qMonths: [9, 10, 11], yAdj: -1 },   // Subat: 4. donem (Eki-Ara, onceki yil)
      4:  { donem: 1, qMonths: [0, 1, 2],  yAdj: 0 },     // Mayis: 1. donem (Oca-Mar)
      7:  { donem: 2, qMonths: [3, 4, 5],  yAdj: 0 },     // Agustos: 2. donem (Nis-Haz)
      10: { donem: 3, qMonths: [6, 7, 8],  yAdj: 0 },     // Kasim: 3. donem (Tem-Eyl)
    }
    if (geciciVerilmeAylari[filingM]) {
      const gd = geciciVerilmeAylari[filingM]
      const gdYear = filingY + gd.yAdj
      // Profilde gecici vergi donemin SON ayinda aktif tutuluyor ([2,5,8,11]);
      // qMonths[2] ile kontrol edilmeli (qMonths[0] donemin ilk ayi -> profilde 'yok' doner)
      if (checkProfile('gecici_vergi', gd.qMonths[2]).active) {
        addResult('gecici_vergi', `Geçici Vergi ${gd.donem}. Dönem`, '📊', gd.qMonths, gdYear,
          getFormattedBeyanDeadline(filingY, filingM, 17),
          `${getMonthName(filingM)} ${filingY}`)
      }
    }

    // ========== E-DEFTER ==========
    // Periyot kaynagi: musteri kartindaki edefterPeriod (beyan profili yedek).
    // AYLIK : ilgili ayi takip eden 4. ayda yuklenir (sahis 10'u, sirket 14'u)
    // 3 AYLIK (GIB takvimi):
    //   Ocak-Mart        -> Haziran (sahis 10, sirket 14)
    //   Nisan-Haziran    -> Eylul   (sahis 10, sirket 14)
    //   Temmuz-Eylul     -> Aralik  (sahis 10, sirket 14)
    //   Ekim-Aralik      -> sahis: Nisan 10 / sirket: Mayis 14 (yillik beyannameyi takip eden ay)
    // Edefter bayragi eski kayitlarda metin ("false"/"true") veya 1/0 olabilir;
    // sadece gercek pozitif degerler mukellef sayilir.
    // Ayrica beyan profilinde edefter 'yok' / pasif ise liste disinda tutulur.
    const edefterRaw = client.edefter
    const edefterBayrakAktif = edefterRaw === true || edefterRaw === 1 ||
      (typeof edefterRaw === 'string' && edefterRaw.trim().toLowerCase() === 'true')
    const edefterAktif = edefterBayrakAktif && checkProfile('edefter', M).active
    if (edefterAktif) {
      const rawPeriod = String(
        client.edefterPeriod ?? profile.edefter?.[0]?.period ?? 'aylik'
      ).toLowerCase().replace(/[\s_-]/g, '')
      const uc3Aylik = rawPeriod === '3aylik' || rawPeriod === 'ucaylik' || rawPeriod === '3ay'

      const sahis = client.type === 'individual'
      const edDeadlineDay = sahis ? 10 : 14
      const edTypeLabel = sahis ? 'Şahıs' : 'Şirket'

      if (!uc3Aylik) {
        // AYLIK E-DEFTER: her ay gosterilir
        // Ait oldugu ay = M - 3 (cunku edBelong + 4 = filingM = M + 1)
        const edBelongM = (M + 9) % 12
        const edBelongY = M <= 2 ? Y - 1 : Y
        addResult('edefter', `e-Defter Aylık (${edTypeLabel})`, '📓', [edBelongM], edBelongY,
          getFormattedBeyanDeadline(filingY, filingM, edDeadlineDay),
          `${getMonthName(filingM)} ${filingY}`)
      } else {
        // 3 AYLIK E-DEFTER: yukleme (filing) ayina gore donem belirlenir
        const ucAylikTakvim = {
          5:  { qMonths: [0, 1, 2],    yAdj: 0,  gun: edDeadlineDay, donem: '1. Dönem' },  // Haziran
          8:  { qMonths: [3, 4, 5],    yAdj: 0,  gun: edDeadlineDay, donem: '2. Dönem' },  // Eylul
          11: { qMonths: [6, 7, 8],    yAdj: 0,  gun: edDeadlineDay, donem: '3. Dönem' },  // Aralik
          // Son ceyrek: sahis Nisan'da 10'u, sirket Mayis'ta 14'u
          3:  { qMonths: [9, 10, 11],  yAdj: -1, gun: 10, donem: '4. Dönem', sadeceSahis: true },
          4:  { qMonths: [9, 10, 11],  yAdj: -1, gun: 14, donem: '4. Dönem', sadeceSirket: true },
        }
        const cfg = ucAylikTakvim[filingM]
        const uygun = cfg && !(cfg.sadeceSahis && !sahis) && !(cfg.sadeceSirket && sahis)
        if (uygun) {
          addResult('edefter', `e-Defter 3 Aylık ${cfg.donem} (${edTypeLabel})`, '📓',
            cfg.qMonths, filingY + cfg.yAdj,
            getFormattedBeyanDeadline(filingY, filingM, cfg.gun),
            `${getMonthName(filingM)} ${filingY}`)
        }
      }
    }

    // ========== YILLIK BEYANLAR (Aralik ayinda gosterilir) ==========
    if (M === 11) {
      if (client.type === 'company' && checkProfile('kurumlar_vergi', 0).active) {
        addResult('kurumlar_vergi', 'Kurumlar Vergisi', '🏢',
          [0,1,2,3,4,5,6,7,8,9,10,11], Y,
          getFormattedBeyanDeadline(Y + 1, 3, 30),
          `Nisan ${Y + 1}`)
      }
      if (client.type === 'individual' && checkProfile('gelir_vergi', 0).active) {
        addResult('gelir_vergi', 'Gelir Vergisi', '👤',
          [0,1,2,3,4,5,6,7,8,9,10,11], Y,
          getFormattedBeyanDeadline(Y + 1, 2, 31),
          `Mart ${Y + 1}`)
      }
    }

    return results
  }

  const getBeyanSummary = (beyanlar) => {
    const total = beyanlar.length
    const yapildi = beyanlar.filter(b => b.status === 'yapildi' || b.status === 'onaylandi' || b.status === 'tahakkuk_gonderildi').length
    const onaylandi = beyanlar.filter(b => b.status === 'onaylandi').length
    const hazir = beyanlar.filter(b => b.status === 'hazir').length
    const tahakkukGonderildi = beyanlar.filter(b => b.status === 'tahakkuk_gonderildi').length

    return {
      total,
      yapildi,
      onaylandi,
      hazir,
      tahakkukGonderildi,
      yapilamadi: total - yapildi,
      completionRate: total > 0 ? Math.round((yapildi / total) * 100) : 0
    }
  }

  const applyFilters = useCallback((data) => {
    let filtered = [...data]
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(c => 
        c.name?.toLowerCase().includes(term) ||
        c.company?.toLowerCase().includes(term) ||
        c.vkn?.includes(term) ||
        c.tc?.includes(term)
      )
    }
    
    if (selectedBeyan !== 'all') {
      filtered = filtered.map(c => ({
        ...c,
        beyanlar: c.beyanlar?.filter(b => b.type === selectedBeyan) || []
      })).filter(c => c.beyanlar.length > 0)
      // Summary'yi filtrelenmis beyanlarla yeniden hesapla
      filtered = filtered.map(c => ({
        ...c,
        summary: getBeyanSummary(c.beyanlar)
      }))
    }
    
    if (selectedStatus !== 'all') {
      // 'gonderildi' secenegi verideki 'tahakkuk_gonderildi' (ve eski
      // 'gonderildi') kayitlariyla eslesir
      const uyum = (st) => selectedStatus === 'gonderildi'
        ? (st === 'tahakkuk_gonderildi' || st === 'gonderildi')
        : st === selectedStatus
      filtered = filtered.map(c => ({
        ...c,
        beyanlar: c.beyanlar?.filter(b => uyum(b.status)) || []
      })).filter(c => c.beyanlar.length > 0)
      filtered = filtered.map(c => ({
        ...c,
        summary: getBeyanSummary(c.beyanlar)
      }))
    }
    
    filtered.sort((a, b) => {
      let valA, valB
      switch(sortField) {
        case 'name':
          valA = a.name || ''
          valB = b.name || ''
          break
        case 'company':
          valA = a.company || ''
          valB = b.company || ''
          break
        case 'total':
          valA = a.summary?.total || 0
          valB = b.summary?.total || 0
          break
        case 'completed':
          valA = a.summary?.yapildi || 0
          valB = b.summary?.yapildi || 0
          break
        case 'rate':
          valA = a.summary?.completionRate || 0
          valB = b.summary?.completionRate || 0
          break
        default:
          valA = a.name || ''
          valB = b.name || ''
      }
      if (typeof valA === 'string') {
        return sortDirection === 'asc' ? valA.localeCompare(valB, 'tr') : valB.localeCompare(valA, 'tr')
      }
      return sortDirection === 'asc' ? valA - valB : valB - valA
    })
    
    setFilteredData(filtered)
    setCurrentPage(1)
  }, [searchTerm, selectedBeyan, selectedStatus, sortField, sortDirection])

  useEffect(() => {
    loadData()
  }, [selectedYear, selectedMonth, selectedBeyan, selectedStatus, searchTerm, loadData])

  // Beyan profili disaridan degistiyse (orn. tevkifat faturasi yuklenince
  // KDV2'nin otomatik aktiflesmesi) listeyi tazele — KDV2 satiri aninda gorunur.
  useEffect(() => {
    const handler = () => { try { loadData() } catch { /* yoksay */ } }
    window.addEventListener('beyan-profile-guncellendi', handler)
    return () => window.removeEventListener('beyan-profile-guncellendi', handler)
  }, [loadData])

  const openDetailModal = (client) => {
    setSelectedClient(client)
    setShowDetailModal(true)
  }

  const getClientDocuments = (client) => {
    const records = client?.beyanDurumlari?._documents
    return Array.isArray(records) ? records : []
  }

  const closeDetailModal = () => {
    setShowDetailModal(false)
    setSelectedClient(null)
  }




  // Yukleme tamamlaninca durumu sessizce gunceller (bildirim tetiklemeden).
  // beyan_durumlari DB'den taze okunur — async callback'te bayat state olmaz.
  const persistStatus = async (clientId, beyan, newStatus) => {
    const key = `${beyan.belongYear}_${beyan.belongMonths[0]}_${beyan.type}`
    const personelAdi = profile?.name || user?.email || 'Admin'
    let yeniMap = null
    try {
      const { data: row } = await supabase
        .from('clients')
        .select('beyan_durumlari')
        .eq('id', clientId)
        .single()
      const currentMap = row?.beyan_durumlari || {}
      yeniMap = {
        ...currentMap,
        [key]: newStatus,
        [`${key}_personel`]: personelAdi,
        [`${key}_tarih`]: new Date().toISOString()
      }
      const { error } = await supabase
        .from('clients')
        .update({ beyan_durumlari: yeniMap })
        .eq('id', clientId)
      if (error) throw error
    } catch (err) {
      console.error('Beyan durumu guncelleme hatasi:', err)
      return false
    }
    const updatedClients = clients.map(c => {
      if (c.id !== clientId) return c
      const updatedBeyanlar = c.beyanlar.map(b =>
        b.id === beyan.id ? { ...b, status: newStatus, updatedAt: formatDateTimeTR(new Date()) } : b
      )
      return { ...c, beyanDurumlari: yeniMap, beyanlar: updatedBeyanlar, summary: getBeyanSummary(updatedBeyanlar) }
    })
    setClients(updatedClients)
    if (selectedClient && selectedClient.id === clientId) {
      const updatedBeyanlar = selectedClient.beyanlar.map(b =>
        b.id === beyan.id ? { ...b, status: newStatus, updatedAt: formatDateTimeTR(new Date()) } : b
      )
      setSelectedClient({ ...selectedClient, beyanDurumlari: yeniMap, beyanlar: updatedBeyanlar, summary: getBeyanSummary(updatedBeyanlar) })
    }
    applyFilters(updatedClients)
    return true
  }

  const updateBeyanStatus = async (clientId, beyan, newStatus) => {
    // Dogru key: generateMonthlyBeyanlar ile ayni format
    const key = `${beyan.belongYear}_${beyan.belongMonths[0]}_${beyan.type}`

    // Mevcut durumlari koru
    const client = clients.find(c => c.id === clientId)
    const personelAdi = profile?.name || user?.email || 'Admin'
    // 2.7.171: TAZE DB OKUMASI — bellekteki eski map'i komple geri yazmak,
    // arka plandaki otomatik indirme/yukleme akisinin yeni yazdigi belge
    // anahtarlarini (beyanlar/tahakkuklar/url) SILIYORDU. Once DB'den guncel
    // beyan_durumlari okunur, uzerine durum yazilir.
    let currentMap = client?.beyanDurumlari || {}
    try {
      const { data: row } = await supabase
        .from('clients')
        .select('beyan_durumlari')
        .eq('id', clientId)
        .single()
      if (row?.beyan_durumlari) currentMap = row.beyan_durumlari
    } catch { /* DB okunamazsa bellek kopyasiyla devam */ }
    const updatedMap = {
      ...currentMap,
      [key]: newStatus,
      [`${key}_personel`]: personelAdi,
      [`${key}_tarih`]: new Date().toISOString()
    }

    try {
      const { error } = await supabase
        .from('clients')
        .update({ beyan_durumlari: updatedMap })
        .eq('id', clientId)
      if (error) throw error
    } catch (err) {
      console.error('Beyan durumu kaydetme hatasi:', err)
      alert('Durum kaydedilemedi: ' + err.message)
      return
    }

    // Local state guncelle
    const updatedClients = clients.map(c => {
      if (c.id === clientId) {
        const updatedBeyanlar = c.beyanlar.map(b =>
          b.id === beyan.id
             ? { ...b, status: newStatus, updatedAt: formatDateTimeTR(new Date()) }
            : b
        )
        return { ...c, beyanDurumlari: updatedMap, beyanlar: updatedBeyanlar, summary: getBeyanSummary(updatedBeyanlar) }
      }
      return c
    })
    setClients(updatedClients)

    if (selectedClient && selectedClient.id === clientId) {
      const updatedBeyanlar = selectedClient.beyanlar.map(b =>
        b.id === beyan.id
           ? { ...b, status: newStatus, updatedAt: formatDateTimeTR(new Date()) }
          : b
      )
      setSelectedClient({
        ...selectedClient,
        beyanDurumlari: updatedMap,
        beyanlar: updatedBeyanlar,
        summary: getBeyanSummary(updatedBeyanlar)
      })
    }

    // Filtrelenmis veriyi de guncelle
    applyFilters(updatedClients)

    // Musteriye bildirim gonder
    try {
      if (newStatus === 'onaylandi') {
        await createNotification({
          clientId,
          title: `${beyan.label || beyan.type} beyannameniz onaylandi`,
          message: `${beyan.belongYear} ${months[beyan.belongMonths[0]]} donemine ait ${beyan.label || beyan.type} beyannameniz onaylanmistir. Belgelerinize portal uzerinden erisebilirsiniz.`,
          type: 'success'
        })
      } else if (newStatus === 'tahakkuk_gonderildi') {
        await createNotification({
          clientId,
          title: `${beyan.label || beyan.type} tahakkukunuz kesildi`,
          message: `${beyan.belongYear} ${months[beyan.belongMonths[0]]} donemine ait ${beyan.label || beyan.type} tahakkukunuz kesilmistir. Belgelerinize portal uzerinden erisebilirsiniz.`,
          type: 'success'
        })
      }
    } catch (notifErr) {
      console.error('Bildirim kaydetme hatasi:', notifErr)
    }

    // 2.7.139: "onaylandi" veya "verildi" isaretlenen beyanin belgelerini
    // e-Beyanname/SGK sisteminden otomatik indir ve BEYANNAME arsivine kaydet.
    // Arka planda calisir; onay akisini bekletmez, hatasi onayi etkilemez.
    if (newStatus === 'onaylandi' || newStatus === 'yapildi') {
      const onaylananMusteri = updatedClients.find(c => c.id === clientId)
      if (onaylananMusteri) {
        const yukKey = `${clientId}_${key}`
        setYuklemeDurumlari(prev => ({ ...prev, [yukKey]: 'yukleniyor' }))
        bildiriGoster(`${onaylananMusteri.name}: Belgeler kontrol ediliyor (önce müşteri klasörü, boşsa GİB)...`, 'info', 5000)
        beyanOnayOtomatikIndir({ client: onaylananMusteri, beyan })
          .then(async r => {
            if (r?.sayi > 0) {
              console.log('[beyan-onay] otomatik indirme tamam:', r.sayi, r.hedef || '')
              const nereden = r.kaynak === 'arsiv' ? 'müşteri klasöründen (G: arşivi) MUBiS\'e yüklendi' : r.kaynak === 'luca' ? 'Luca’dan indirildi ve MUBiS’e yüklendi' : 'GİB\'den indirildi ve MUBiS\'e yüklendi'
              bildiriGoster(`${onaylananMusteri.name}: ${r.sayi} belge ${nereden}.`, 'success')
            } else if (r?.zatenYuklu) {
              // 2.7.178: Belgeler daha once yuklenmis — tekrar yuklenmedi
              bildiriGoster(`${onaylananMusteri.name}: Belgeler zaten MUBiS'te yüklü — tekrar yüklenmedi.`, 'info')
            } else {
              bildiriGoster(`${onaylananMusteri.name}: GİB'de bu dönem için indirilecek belge bulunamadı.`, 'info')
            }
            // 2.7.159c: Durum "Gönderildi" SADECE gerçek gönderim teyidinden
            // sonra yazılır. Belge inmediyse/yüklenmeden asla gönderildi
            // işaretlenmez; durum "Onaylandı"da kalır.
            if (newStatus === 'onaylandi' && r?.sayi > 0) {
              if (beyan.type === 'sgk') {
                const muhtasarBeyan = { ...beyan, type: 'muhtasar', label: beyan.label && /muhtasar/i.test(beyan.label) ? beyan.label : 'Muhtasar' }
                const okM = await persistStatus(clientId, muhtasarBeyan, 'onaylandi')
                if (okM) bildiriGoster(`${onaylananMusteri.name}: SGK belgeleri yüklendi — Aylık Muhtasar beyanı "Onaylandı" olarak işaretlendi.`, 'success')
              } else {
                bildiriGoster(`${onaylananMusteri.name}: Belgeler MUBiS'e yüklendi — tahakkuk gönderimi yapılıyor...`, 'info')
              }
            }
            // Tahakkuk gonderimi (onaylandi akisinda) arka planda surer;
            // GONDERIM TEYIDINDEN SONRA durum "Gonderildi" olur
            if (newStatus === 'onaylandi' && Array.isArray(r?.tahakkukBelgeleri) && r.tahakkukBelgeleri.length) {
              tahakkuklariGonder({ client: onaylananMusteri, beyan, tahakkukBelgeleri: r.tahakkukBelgeleri })
                .then(async g => {
                  if (g?.ok && !g?.atlandi) {
                    console.log('[tahakkuk-gonderim] gonderildi (teyit):', onaylananMusteri.name)
                    // 2.7.157: SGK gonderiminde SGK + Aylık Muhtasar birlikte "Gönderildi"
                    if (beyan.type === 'sgk') {
                      const muhtasarBeyan = { ...beyan, type: 'muhtasar', label: beyan.label && /muhtasar/i.test(beyan.label) ? beyan.label : 'Muhtasar' }
                      await persistStatus(clientId, beyan, 'tahakkuk_gonderildi')
                      await persistStatus(clientId, muhtasarBeyan, 'tahakkuk_gonderildi')
                    } else {
                      await persistStatus(clientId, beyan, 'tahakkuk_gonderildi')
                    }
                    bildiriGoster(`${onaylananMusteri.name}: Tahakkuk müşteriye gönderildi (${g.tercih === 'ikisi' ? 'WhatsApp + E-Posta' : g.tercih === 'mail' ? 'E-Posta' : 'WhatsApp'}) — durum "Gönderildi".`, 'success')
                  } else if (g?.atlandi) {
                    // Müşteri gönderim tercihi yok — gönderim yapılmadı, durum değişmez
                    bildiriGoster(`${onaylananMusteri.name}: Müşteri gönderim tercihi olmadığı için tahakkuk gönderilmedi — durum "Onaylandı" olarak kaldı.`, 'info')
                  }
                  else {
                    // 2.7.171: Sessiz basarisizlik olmasin — hata ekranda gorunsun
                    console.warn('[tahakkuk-gonderim] tamamlanamadi:', g?.hatalar?.join('; ') || g?.reason || '')
                    bildiriGoster(`${onaylananMusteri.name}: Tahakkuk gönderilemedi — ${g?.hatalar?.join(' | ') || g?.reason || 'bilinmeyen hata'}`, 'error', 12000)
                  }
                })
                .catch(err => {
                  console.warn('[tahakkuk-gonderim] hata:', err.message)
                  bildiriGoster(`${onaylananMusteri.name}: Tahakkuk gönderim hatası — ${err.message}`, 'error', 12000)
                })
            }
            setYuklemeDurumlari(prev => { const n = { ...prev }; delete n[yukKey]; return n })
          })
          .catch(err => {
            // 2.7.194: Yükleme başarısız — yıldız kaybolmasın, KIRMIZI kalsın
            // (yeniden Onaylandı seçilince tekrar sarı yanıp söner).
            setYuklemeDurumlari(prev => ({ ...prev, [yukKey]: 'hata' }))
            console.warn('[beyan-onay] otomatik indirme atlandi:', err.message)
            const sebep = err?.message || ''
            let mesaj
            if (/kurulu-degil|servis-hatasi|erisim-engelli|yanlis-yanit|bilinmeyen-servis/.test(sebep)) {
              mesaj = 'Yardımcı program (mubis-gib-yardimci) çalışmıyor veya ulaşılamıyor. Programı başlatıp tray simgesinden sürümü kontrol edin, sonra durumu tekrar Onaylandı seçin.'
            } else if (sebep === 'admin-gib-bilgi-yok') {
              mesaj = 'Admin GİB (vergi dairesi) kullanıcı adı/şifresi kayıtlı değil. Ayarlar → GİB Bağlantı bölümünden girin (beyanlar admin hesabıyla iner).'
            } else if (sebep === 'musteri-sgk-bilgi-yok') {
              mesaj = `${onaylananMusteri?.name || 'Müşteri'} için SGK kullanıcı bilgileri kayıtlı değil. Müşteri detay → Giriş Bilgileri bölümünden ekleyin.`
            } else {
              mesaj = `Otomatik indirme başarısız: ${sebep || 'bilinmeyen hata'}`
            }
            bildiriGoster(`${onaylananMusteri.name}: ${mesaj}`, 'error', 12000)
          })
      }
    }
  }

  const handleDocumentUpload = async (clientId, beyan, documentType, file) => {
    if (!file) return
    const client = clients.find(c => c.id === clientId)
    if (!client) return

    try {
      const { url, list } = await addBeyanDocument({
        client,
        year: beyan.belongYear,
        month: beyan.belongMonths[0],
        type: beyan.type,
        docType: documentType,
        file,
        name: file.name,
      })

      const baseKeyUpload = `${beyan.belongYear}_${beyan.belongMonths[0]}_${beyan.type}`
      const { data: latestRow } = await supabase
        .from('clients')
        .select('beyan_durumlari')
        .eq('id', clientId)
        .single()
      const updatedMap = latestRow?.beyan_durumlari || {}

      const updatedClients = clients.map(c =>
        c.id === clientId ? { ...c, beyanDurumlari: updatedMap } : c
      )
      setClients(updatedClients)
      if (selectedClient && selectedClient.id === clientId) {
        setSelectedClient({ ...selectedClient, beyanDurumlari: updatedMap })
      }
      applyFilters(updatedClients)

      // Eger tahakkuk ise, AI analizi arka planda baslat
      if (documentType === 'tahakkuk') {
        analyzeTahakkukAsync(clientId, beyan, url, updatedMap).catch(err => {
          console.error('AI analiz asenkron hatasi:', err)
        })
      }

      alert(`${documentType === 'tahakkuk' ? 'Tahakkuk' : documentType === 'bordro' ? 'Bordro' : 'Beyanname'} dosyasi yuklendi.`)
    } catch (err) {
      console.error('Dosya yukleme hatasi:', err)
      alert('Dosya yuklenemedi: ' + (err.message || 'Bilinmeyen hata'))
    }
  }

  // beyan_durumlari alanini en guncel DB kaydiyla birlestirerek kaydet.
  // Boylece musteri portalindan gelen eszamanli analiz yazmalari
  // admin'in yeni yukledigi tahakkuku ezmez (ve tersi).
  const mergeSaveBeyanDurumlari = async (clientId, patch) => {
    const { data: latestRow, error: readError } = await supabase
      .from('clients')
      .select('beyan_durumlari')
      .eq('id', clientId)
      .single()
    if (readError) throw readError

    const merged = { ...(latestRow?.beyan_durumlari || {}), ...patch }

    const { error } = await supabase
      .from('clients')
      .update({ beyan_durumlari: merged })
      .eq('id', clientId)
    if (error) throw error

    return merged
  }

  // Asenkron AI analizi - MUBIS Document Intelligence Engine
  const analyzeTahakkukAsync = async (clientId, beyan, url, currentMap) => {
    const statusKey = `${beyan.belongYear}_${beyan.belongMonths[0]}_${beyan.type}`
    const listKey = `${statusKey}_tahakkuklar`

    try {
      console.log('MUBIS Document Intelligence - Analiz baslatiliyor...', url)

      // Yeni Document Intelligence Engine kullan
      const result = await analyzeDocument(url)
      console.log('Document Intelligence sonucu:', result)
      console.log('Document Intelligence raw_text:', result.raw_text?.substring(0, 500))

      // Sadece bu analizin dokundugu alanlar; mergeSave en guncel DB ile birlestirir
      const patch = {}

      if (result.success && result.amount > 0) {
        // Analiz basarili
        patch[`${statusKey}_analiz_durumu`] = 'tamamlandi'
        patch[`${statusKey}_vergi_turu`] = result.tax_type || ''
        // Son odeme olarak hesaplanan resmi tarihi kullan (PDF'teki ilk tarih duzenleme tarihi olabiliyor)
        // 2.7.163: SGK/SGK'de odeME tarihi beyan tarihi degil, ayin son is gunudur.
        patch[`${statusKey}_son_odeme`] = beyan.paymentDeadline || beyan.deadline || result.due_date || ''
        // Hangi dosyanin analiz edildigini kaydet (dosya degisirse tekrar analiz tetiklenir)
        patch[`${statusKey}_analiz_url`] = url
        patch[`${statusKey}_vkn`] = result.vkn || ''
        patch[`${statusKey}_unvan`] = result.company || ''
        patch[`${statusKey}_vergi_asli`] = Number(result.tax_base || 0)
        // GIB odeme ekraninda kullanilmak uzere tahakkuk fis (belge) numarasi
        if (result.accrual_no) patch[`${statusKey}_tahakkuk_no`] = result.accrual_no

        // Coklu tahakkuk: bu dosyanin kendi tutarini listeye yaz, toplami hesapla
        const list = getTahakkukList(currentMap, statusKey).map(t =>
          t.url === url
            ? { ...t, tutar: Number(result.amount), analiz_durumu: 'tamamlandi', son_odeme: beyan.paymentDeadline || beyan.deadline || result.due_date || '', vergi_turu: result.tax_type || '', tahakkuk_no: result.accrual_no || t.tahakkuk_no || '' }
            : t
        )
        patch[listKey] = list
        patch[`${statusKey}_tutar`] = sumTahakkukTutar(list)

        console.log('Document Intelligence basarili, tutar:', result.amount, '- toplam:', patch[`${statusKey}_tutar`])

        // document_analysis tablosuna kaydet
        await saveDocumentAnalysis(supabase, {
          client_id: clientId,
          document_type: result.document_type || 'TAHAKKUK',
          storage_url: url,
          success: true,
          ...result
        })
      } else {
        // Analiz basarisiz
        patch[`${statusKey}_analiz_durumu`] = 'basarisiz'
        patch[`${statusKey}_analiz_hata`] = result.error || 'Belge analiz edilemedi'

        // Listedeki ilgili dosyayi da basarisiz isaretle
        const list = getTahakkukList(currentMap, statusKey).map(t =>
          t.url === url ? { ...t, analiz_durumu: 'basarisiz' } : t
        )
        patch[listKey] = list
        patch[`${statusKey}_tutar`] = sumTahakkukTutar(list)

        console.warn('Document Intelligence basarisiz:', result.error)
      }

      // En guncel DB kaydiyla birlestirerek kaydet (stale overwrite onleme)
      const merged = await mergeSaveBeyanDurumlari(clientId, patch)

      // UI'i merged ile guncelle
      const updatedClients = clients.map(c =>
        c.id === clientId ? { ...c, beyanDurumlari: merged } : c
      )
      setClients(updatedClients)
      if (selectedClient && selectedClient.id === clientId) {
        setSelectedClient({ ...selectedClient, beyanDurumlari: merged })
      }
      applyFilters(updatedClients)

    } catch (err) {
      console.error('Document Intelligence hatasi:', err)
      try {
        const base = { ...(currentMap || {}) }
        const failPatch = {
          [`${statusKey}_analiz_durumu`]: 'basarisiz',
          [`${statusKey}_analiz_hata`]: err.message || 'Bilinmeyen hata',
          [listKey]: getTahakkukList(base, statusKey).map(t =>
            t.url === url ? { ...t, analiz_durumu: 'basarisiz' } : t
          )
        }
        await mergeSaveBeyanDurumlari(clientId, failPatch)
      } catch (dbErr) {
        console.error('Hata kaydetme basarisiz:', dbErr)
      }
    }
  }

  // Tek bir tahakkuku coklu listeden sil
  const handleDeleteTahakkuk = async (clientId, beyan, tahakkukUrl) => {
    if (!window.confirm('Bu tahakkuku silmek istediginize emin misiniz?')) return
    try {
      const updatedMap = await removeBeyanDocument({
        clientId,
        year: beyan.belongYear,
        month: beyan.belongMonths[0],
        type: beyan.type,
        docType: 'tahakkuk',
        url: tahakkukUrl,
      })

      const updatedClients = clients.map(c => c.id === clientId ? { ...c, beyanDurumlari: updatedMap } : c)
      setClients(updatedClients)
      if (selectedClient && selectedClient.id === clientId) {
        setSelectedClient({ ...selectedClient, beyanDurumlari: updatedMap })
      }
      applyFilters(updatedClients)
    } catch (err) {
      alert('Tahakkuk silinemedi: ' + (err.message || 'Bilinmeyen hata'))
    }
  }

  // Tek bir bordroyu coklu listeden sil
  const handleDeleteBordro = async (clientId, beyan, bordroUrl) => {
    if (!window.confirm('Bu bordroyu silmek istediginize emin misiniz?')) return
    try {
      const updatedMap = await removeBeyanDocument({
        clientId,
        year: beyan.belongYear,
        month: beyan.belongMonths[0],
        type: beyan.type,
        docType: 'bordro',
        url: bordroUrl,
      })

      const updatedClients = clients.map(c => c.id === clientId ? { ...c, beyanDurumlari: updatedMap } : c)
      setClients(updatedClients)
      if (selectedClient && selectedClient.id === clientId) {
        setSelectedClient({ ...selectedClient, beyanDurumlari: updatedMap })
      }
      applyFilters(updatedClients)
    } catch (err) {
      alert('Bordro silinemedi: ' + (err.message || 'Bilinmeyen hata'))
    }
  }

  // Tek bir beyannameyi coklu listeden sil
  const handleDeleteBeyan = async (clientId, beyan, beyanUrl) => {
    if (!window.confirm('Bu beyannameyi silmek istediginize emin misiniz?')) return
    try {
      const updatedMap = await removeBeyanDocument({
        clientId,
        year: beyan.belongYear,
        month: beyan.belongMonths[0],
        type: beyan.type,
        docType: 'beyanname',
        url: beyanUrl,
      })

      const updatedClients = clients.map(c => c.id === clientId ? { ...c, beyanDurumlari: updatedMap } : c)
      setClients(updatedClients)
      if (selectedClient && selectedClient.id === clientId) {
        setSelectedClient({ ...selectedClient, beyanDurumlari: updatedMap })
      }
      applyFilters(updatedClients)
    } catch (err) {
      alert('Beyanname silinemedi: ' + (err.message || 'Bilinmeyen hata'))
    }
  }

  // GIB'den / e-Bildirge'den otomatik belge indirme: yardimci programa is
  // gonder, yeni dosyayi bekle, musteri klasorune yukle, listeyi yenile
  const handleGibdenIndir = async (clientId, beyan, documentType, sistem = 'gib') => {
    const client = clients.find(c => c.id === clientId)
    if (!client) return
    const typeEtiket = sistem === 'etebligat' ? `${documentType}-eb` : documentType
    setGibIndirme({ clientId, type: typeEtiket, durum: 'baslatiliyor' })
    try {
      await gibBelgeIndirVeYukle({
        clientId,
        client,
        statusKey: `${beyan.belongYear}_${beyan.belongMonths[0]}_${beyan.type}`,
        year: beyan.belongYear,
        month: beyan.belongMonths[0],
        beyanType: beyan.type,
        documentType,
        sistem,
        onDurum: (d) => setGibIndirme({ clientId, type: typeEtiket, durum: d })
      })
      alert(`Belge ${sistem === 'etebligat' ? 'e-Bildirge\'den' : 'GIB\'den'} indirildi ve musteri klasorune yuklendi.`)
      const { data: yenilenen } = await supabase.from('clients').select('*').eq('id', clientId).single()
      if (yenilenen) {
        const guncel = { ...yenilenen, beyanDurumlari: yenilenen.beyan_durumlari || {} }
        const updatedClients = clients.map(c => c.id === clientId ? guncel : c)
        setClients(updatedClients)
        if (selectedClient && selectedClient.id === clientId) setSelectedClient(guncel)
        applyFilters(updatedClients)
      }
    } catch (err) {
      alert('GIB\'den indirme basarisiz: ' + (err.message || 'Bilinmeyen hata'))
    }
    setGibIndirme(null)
  }

  // SGK tahakkukunu URL ile sil (tablodan cagrilir) - hem _documents hem _tahakkuklar'dan kaldirir
  const handleDeleteSgkDoc = async (doc, baseKey) => {
    if (!selectedClient) return
    if (!window.confirm('Bu tahakkuku silmek istediginize emin misiniz?')) return

    const [year, month, ...typeParts] = baseKey.split('_')
    const type = typeParts.join('_')

    try {
      const updatedMap = await removeBeyanDocument({
        clientId: selectedClient.id,
        year: Number(year),
        month: Number(month),
        type,
        docType: 'tahakkuk',
        url: doc.url,
      })

      const docKey = `${baseKey}_documents`
      const updatedList = (Array.isArray(updatedMap[docKey]) ? updatedMap[docKey] : []).filter(d => d.url !== doc.url)
      updatedMap[docKey] = updatedList

      const { error } = await supabase.from('clients').update({ beyan_durumlari: updatedMap }).eq('id', selectedClient.id)
      if (error) throw error

      setSgkDocs(updatedList)
      const updatedClients = clients.map(c => c.id === selectedClient.id ? { ...c, beyanDurumlari: updatedMap } : c)
      setClients(updatedClients)
      setSelectedClient({ ...selectedClient, beyanDurumlari: updatedMap })
      applyFilters(updatedClients)
    } catch (err) {
      alert('Tahakkuk silinemedi: ' + (err.message || 'Bilinmeyen hata'))
    }
  }

  // Tahakkuk tutarini manuel duzelt (AI yanlis okursa muhasebeci duzeltir)
  const handleEditTahakkukTutar = async (clientId, beyan, tahakkukUrl, mevcutTutar) => {
    const giris = window.prompt('Yeni tutari girin (orn: 14190,00):', mevcutTutar > 0 ? Number(mevcutTutar).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '')
    if (giris === null) return

    const temiz = giris.replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.')
    const yeniTutar = parseFloat(temiz)
    if (isNaN(yeniTutar) || yeniTutar < 0) {
      alert('Gecersiz tutar.')
      return
    }

    const client = clients.find(c => c.id === clientId)
    if (!client) return

    const baseKey = `${beyan.belongYear}_${beyan.belongMonths[0]}_${beyan.type}`
    const currentMap = { ...(client.beyanDurumlari || {}) }

    // _tahakkuklar array'inde guncelle (ham liste — birlestirme yazma)
    const listKey = `${baseKey}_tahakkuklar`
    const list = (Array.isArray(currentMap[listKey]) ? currentMap[listKey] : []).map(t =>
      t.url === tahakkukUrl ? { ...t, tutar: yeniTutar, analiz_durumu: 'tamamlandi' } : t
    )
    const updatedMap = { ...currentMap, [listKey]: list }
    updatedMap[`${baseKey}_tutar`] = sumTahakkukTutar(list)
    updatedMap[`${baseKey}_analiz_durumu`] = 'tamamlandi'

    // SGK'da _documents icinde de guncelle (tutar orada da tutuluyor olabilir)
    const docKey = `${baseKey}_documents`
    if (Array.isArray(currentMap[docKey])) {
      updatedMap[docKey] = currentMap[docKey].map(d =>
        d.url === tahakkukUrl ? { ...d, tutar: yeniTutar, analiz_durumu: 'tamamlandi' } : d
      )
    }

    try {
      const { error } = await supabase.from('clients').update({ beyan_durumlari: updatedMap }).eq('id', clientId)
      if (error) throw error

      const updatedClients = clients.map(c => c.id === clientId ? { ...c, beyanDurumlari: updatedMap } : c)
      setClients(updatedClients)
      if (selectedClient && selectedClient.id === clientId) {
        setSelectedClient({ ...selectedClient, beyanDurumlari: updatedMap })
      }
      applyFilters(updatedClients)
    } catch (err) {
      alert('Tutar guncellenemedi: ' + (err.message || 'Bilinmeyen hata'))
    }
  }

  // Tahakkuku tekrar analiz ettir (cache bypass: yeni versiyon etiketi)
  const handleReanalyzeTahakkuk = async (clientId, beyan, tahakkukUrl) => {
    const client = clients.find(c => c.id === clientId)
    if (!client) return

    const baseKey = `${beyan.belongYear}_${beyan.belongMonths[0]}_${beyan.type}`
    const baseUrl = tahakkukUrl.split('?')[0]
    const yeniUrl = `${baseUrl}?v=${Date.now()}`

    // URL'i hem listede hem tek url alaninda guncelle, sonra analizi tetikle
    // (ham liste — getTahakkukList birlestirmesi geri yazilirsa kirlilik)
    const currentMap = { ...(client.beyanDurumlari || {}) }
    const listKey = `${baseKey}_tahakkuklar`
    const list = (Array.isArray(currentMap[listKey]) ? currentMap[listKey] : []).map(t =>
      t.url === tahakkukUrl ? { ...t, url: yeniUrl, tutar: 0, analiz_durumu: 'analiz_ediliyor' } : t
    )
    const updatedMap = { ...currentMap, [listKey]: list }

    const docKey = `${baseKey}_documents`
    if (Array.isArray(currentMap[docKey])) {
      updatedMap[docKey] = currentMap[docKey].map(d =>
        d.url === tahakkukUrl ? { ...d, url: yeniUrl } : d
      )
    }
    if (currentMap[`${baseKey}_tahakkuk_url`] === tahakkukUrl) {
      updatedMap[`${baseKey}_tahakkuk_url`] = yeniUrl
    }

    try {
      const { error } = await supabase.from('clients').update({ beyan_durumlari: updatedMap }).eq('id', clientId)
      if (error) throw error

      const updatedClients = clients.map(c => c.id === clientId ? { ...c, beyanDurumlari: updatedMap } : c)
      setClients(updatedClients)
      if (selectedClient && selectedClient.id === clientId) {
        setSelectedClient({ ...selectedClient, beyanDurumlari: updatedMap })
      }
      applyFilters(updatedClients)

      analyzeTahakkukAsync(clientId, beyan, yeniUrl, updatedMap).catch(err => {
        console.error('Tekrar analiz hatasi:', err)
      })
    } catch (err) {
      alert('Tekrar analiz baslatilamadi: ' + (err.message || 'Bilinmeyen hata'))
    }
  }

  const handleDeleteBeyanDocument = async (clientId, beyan, documentType) => {
    if (!window.confirm(`${documentType === 'tahakkuk' ? 'Tahakkuk' : 'Beyanname'} dosyasini silmek istediginize emin misiniz?`)) return
    try {
      const client = clients.find(c => c.id === clientId)
      if (!client) throw new Error('Musteri bulunamadi')

      const baseKey = `${beyan.belongYear}_${beyan.belongMonths[0]}_${beyan.type}`
      const urlKey = documentType === 'tahakkuk'
        ? `${baseKey}_tahakkuk_url`
        : `${baseKey}_beyan_url`

      const currentMap = { ...client.beyanDurumlari }
      delete currentMap[urlKey]

      // Tahakkuk silinirse analiz sonuclarini da temizle
      if (documentType === 'tahakkuk') {
        delete currentMap[`${baseKey}_tutar`]
        delete currentMap[`${baseKey}_analiz_durumu`]
        delete currentMap[`${baseKey}_analiz_hata`]
        delete currentMap[`${baseKey}_analiz_url`]
        delete currentMap[`${baseKey}_vergi_turu`]
        delete currentMap[`${baseKey}_son_odeme`]
        delete currentMap[`${baseKey}_vkn`]
        delete currentMap[`${baseKey}_unvan`]
        delete currentMap[`${baseKey}_vergi_asli`]
      }

      const { error } = await supabase
        .from('clients')
        .update({ beyan_durumlari: currentMap })
        .eq('id', clientId)
      if (error) throw error

      const updatedClients = clients.map(c =>
        c.id === clientId ? { ...c, beyanDurumlari: currentMap } : c
      )
      setClients(updatedClients)
      if (selectedClient && selectedClient.id === clientId) {
        setSelectedClient({ ...selectedClient, beyanDurumlari: currentMap })
      }
      applyFilters(updatedClients)
      alert(`${documentType === 'tahakkuk' ? 'Tahakkuk' : 'Beyanname'} dosyasi silindi.`)
    } catch (err) {
      console.error('Dosya silme hatasi:', err)
      alert('Dosya silinemedi: ' + (err.message || 'Bilinmeyen hata'))
    }
  }

  // Modal kapatildiginda degisiklikleri zaten kaydettik; sadece kapat
  const handleCloseModal = () => {
    closeDetailModal()
  }

  const openSgkModal = (client, beyan) => {
    setSgkBeyan({ clientId: client.id, beyan })
    const key = `${beyan.belongYear}_${beyan.belongMonths[0]}_${beyan.type}_documents`
    setSgkDocs(Array.isArray(client.beyanDurumlari?.[key]) ? client.beyanDurumlari[key] : [])
    setShowSgkModal(true)
  }

  const closeSgkModal = () => {
    setShowSgkModal(false)
    setSgkBeyan(null)
    setSgkDocs([])
  }

  const handleSgkDocumentUpload = async (e, category, name) => {
    const file = e.target.files?.[0]
    if (!file || !sgkBeyan) return
    await uploadSgkDocument(sgkBeyan.clientId, sgkBeyan.beyan, file, category, name, e)
  }

  // SGK tahakkuk/evrak yukleme - modal disindan (tablodan) da cagrilabilir
  const uploadSgkDocument = async (clientId, beyan, file, category, name, e) => {
    setSgkUploadLoading(true)
    try {
      const client = clients.find(c => c.id === clientId)
      if (!client) throw new Error('Musteri bulunamadi')

      const uploaded = await uploadClientBulkDocument({
        client,
        year: beyan.belongYear,
        month: beyan.belongMonths[0],
        beyanType: beyan.type,
        category,
        file,
        name
      })

      const baseKey = `${beyan.belongYear}_${beyan.belongMonths[0]}_${beyan.type}`
      const docKey = `${baseKey}_documents`

      // En guncel DB kaydini oku; stale state ile mevcut dosyalari ezme
      const { data: latestRow, error: readErr } = await supabase
        .from('clients')
        .select('beyan_durumlari')
        .eq('id', clientId)
        .single()
      if (readErr) throw readErr

      const currentMap = latestRow?.beyan_durumlari || {}
      const currentList = Array.isArray(currentMap[docKey]) ? currentMap[docKey] : []
      const updatedList = [...currentList, uploaded]
      const updatedMap = { ...currentMap, [docKey]: updatedList }

      if (category === 'sigorta_tahakkuk') {
        // Coklu tahakkuk: listeye ekle (versionedUrl ile cache sorununu onle)
        const versionedUrl = `${uploaded.url}?v=${Date.now()}`
        updatedMap[`${baseKey}_tahakkuk_url`] = versionedUrl
        const listKey = `${baseKey}_tahakkuklar`
        // _tahakkuklar array'i sadece gercek tahakkuk kayitlarini tutsun
        // (_documents fallback'i okuma tarafinda zaten birlestiriliyor, cift kaydi onle)
        const arrOnly = Array.isArray(currentMap[listKey]) ? currentMap[listKey] : []
        const arrList = arrOnly.filter(t => t?.url)
        const singleUrl = currentMap[`${baseKey}_tahakkuk_url`]
        if (singleUrl && !arrList.some(t => t.url === singleUrl)) {
          arrList.push({
            url: singleUrl,
            name: 'tahakkuk.pdf',
            uploadedAt: '',
            tutar: Number(currentMap[`${baseKey}_tutar`]) || 0,
            analiz_durumu: currentMap[`${baseKey}_analiz_durumu`] || ''
          })
        }
        updatedMap[listKey] = [
          ...arrList,
          {
            url: versionedUrl,
            name: name || file.name || 'tahakkuk.pdf',
            uploadedAt: new Date().toISOString(),
            tutar: 0,
            analiz_durumu: 'analiz_ediliyor'
          }
        ]
        uploaded.url = versionedUrl
        updatedList[updatedList.length - 1] = uploaded
        updatedMap[docKey] = updatedList
      } else if (category === 'hizmet_listesi') {
        updatedMap[`${baseKey}_beyan_url`] = uploaded.url
      }

      const { error } = await supabase.from('clients').update({ beyan_durumlari: updatedMap }).eq('id', clientId)
      if (error) throw error

      setSgkDocs(updatedList)
      const updatedClients = clients.map(c => c.id === clientId ? { ...c, beyanDurumlari: updatedMap } : c)
      setClients(updatedClients)
      if (selectedClient && selectedClient.id === clientId) {
        setSelectedClient({ ...selectedClient, beyanDurumlari: updatedMap })
      }
      applyFilters(updatedClients)
      if (e?.target) e.target.value = ''

      // Sigorta tahakkuku ise her dosyayi ayri analiz et
      if (category === 'sigorta_tahakkuk') {
        analyzeTahakkukAsync(clientId, beyan, uploaded.url, updatedMap).catch(err => {
          console.error('SGK tahakkuk analiz hatasi:', err)
        })
      }

      alert('Evrak yuklendi.')
    } catch (err) {
      console.error('SGK evrak yukleme hatasi:', err)
      alert('Evrak yuklenemedi: ' + (err.message || 'Bilinmeyen hata'))
    } finally {
      setSgkUploadLoading(false)
    }
  }

  const handleSgkDocDelete = async (index) => {
    if (!sgkBeyan) return
    if (!window.confirm('Bu evragi silmek istediginize emin misiniz?')) return
    const baseKey = `${sgkBeyan.beyan.belongYear}_${sgkBeyan.beyan.belongMonths[0]}_${sgkBeyan.beyan.type}`
    const docKey = `${baseKey}_documents`
    const client = clients.find(c => c.id === sgkBeyan.clientId)
    const currentMap = { ...(client?.beyanDurumlari || {}) }
    const currentList = Array.isArray(currentMap[docKey]) ? currentMap[docKey] : []
    const deleted = currentList[index]
    const updatedList = currentList.filter((_, i) => i !== index)
    const updatedMap = { ...currentMap, [docKey]: updatedList }

    if (deleted?.category === 'sigorta_tahakkuk') {
      // Coklu tahakkuk listesinden de kaldir (ham liste — birlestirme yazma)
      const listKey = `${baseKey}_tahakkuklar`
      const tahakkukList = (Array.isArray(currentMap[listKey]) ? currentMap[listKey] : []).filter(t => t.url !== deleted.url)
      updatedMap[listKey] = tahakkukList
      // Son kalan tahakkuku tek url olarak isaretle (geriye uyumluluk)
      if (tahakkukList.length > 0) {
        updatedMap[`${baseKey}_tahakkuk_url`] = tahakkukList[tahakkukList.length - 1].url
        updatedMap[`${baseKey}_tutar`] = sumTahakkukTutar(tahakkukList)
      } else {
        delete updatedMap[`${baseKey}_tahakkuk_url`]
        delete updatedMap[`${baseKey}_tutar`]
        delete updatedMap[`${baseKey}_analiz_durumu`]
        delete updatedMap[`${baseKey}_analiz_hata`]
        delete updatedMap[`${baseKey}_analiz_url`]
        delete updatedMap[`${baseKey}_vergi_turu`]
        delete updatedMap[`${baseKey}_son_odeme`]
      }
    } else if (deleted?.category === 'hizmet_listesi') {
      delete updatedMap[`${baseKey}_beyan_url`]
    }

    const { error } = await supabase.from('clients').update({ beyan_durumlari: updatedMap }).eq('id', sgkBeyan.clientId)
    if (error) {
      alert('Silinemedi: ' + error.message)
      return
    }
    setSgkDocs(updatedList)
    const updatedClients = clients.map(c => c.id === sgkBeyan.clientId ? { ...c, beyanDurumlari: updatedMap } : c)
    setClients(updatedClients)
    if (selectedClient && selectedClient.id === sgkBeyan.clientId) {
      setSelectedClient({ ...selectedClient, beyanDurumlari: updatedMap })
    }
    applyFilters(updatedClients)
  }

  const goToToday = () => {
    const now = new Date()
    // "Bu Ay" = icinde bulunulan ayin bir onceki ayi (guncel beyan donemi)
    setSelectedYear(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear())
    setSelectedMonth(now.getMonth() === 0 ? 11 : now.getMonth() - 1)
  }

  const changeMonth = (delta) => {
    let newMonth = selectedMonth + delta
    let newYear = selectedYear
    if (newMonth > 11) {
      newMonth = 0
      newYear++
    } else if (newMonth < 0) {
      newMonth = 11
      newYear--
    }
    setSelectedMonth(newMonth)
    setSelectedYear(newYear)
  }

  const totalPages = Math.ceil(filteredData.length / itemsPerPage)
  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const getStatusColor = (status) => {
    const colors = {
      'yapildi': 'bg-green-500/20 text-green-400 border-green-500/30',
      'evrak_alindi': 'bg-sky-500/20 text-sky-400 border-sky-500/30',
      'hazir': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      'yapilamadi': 'bg-red-500/20 text-red-400 border-red-500/30',
      'onaylandi': 'bg-green-500/20 text-green-400 border-green-500/30',
      'onaylanmadi': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      'tahakkuk_gonderildi': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      'tahakkuk_gonderilmedi': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    }
    return colors[status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }

  const getStatusIcon = (status) => {
    const icons = {
      'yapildi': <CheckCircle className="w-4 h-4" />,
      'evrak_alindi': <FileCheck className="w-4 h-4" />,
      'hazir': <Clock className="w-4 h-4" />,
      'yapilamadi': <AlertTriangle className="w-4 h-4" />,
      'onaylandi': <CheckCircle className="w-4 h-4" />,
      'onaylanmadi': <Clock className="w-4 h-4" />,
      'tahakkuk_gonderildi': <Send className="w-4 h-4" />,
      'tahakkuk_gonderilmedi': <Clock className="w-4 h-4" />,
    }
    return icons[status] || <Clock className="w-4 h-4" />
  }

  const getStatusLabel = (status) => {
    const labels = {
      'yapildi': 'Yapıldı',
      'evrak_alindi': 'Evrak Alındı',
      'hazir': 'Hazır',
      'yapilamadi': 'Yapılmadı',
      'onaylandi': 'Onaylandı',
      'onaylanmadi': 'Onaylanmadı',
      'tahakkuk_gonderildi': 'Tahakkuk Gönderildi',
      'tahakkuk_gonderilmedi': 'Tahakkuk Gönderilmedi',
    }
    return labels[status] || status
  }

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const exportToExcel = () => {
    const rows = []
    const beyanLabel = selectedBeyan !== 'all' 
      ? beyanTipleri.find(b => b.id === selectedBeyan)?.label || '' 
      : 'Tum Beyanlar'
    filteredData.forEach(client => {
      client.beyanlar?.forEach(b => {
        // Secili beyan tipi filtresi
        if (selectedBeyan !== 'all' && b.type !== selectedBeyan) return
        rows.push({
          'Musteri': client.name,
          'Beyan Turu': b.label,
          'Ait Ay': b.aitAy,
          'Son Tarih': b.deadline,
          'Durum': getStatusLabel(b.status),
          'Guncelleme': b.updatedAt
        })
      })
    })
    if (rows.length === 0) {
      alert('Disa aktarilacak veri bulunamadi')
      return
    }
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Beyan Takip')
    ws['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 20 }]
    XLSX.writeFile(wb, `Beyan_Takip_${beyanLabel}_${months[selectedMonth]}_${selectedYear}.xlsx`)
  }

  const exportToPdf = () => {
    const beyanLabel = selectedBeyan !== 'all' 
      ? beyanTipleri.find(b => b.id === selectedBeyan)?.label || '' 
      : 'Tum Beyanlar'
    let html = `<html><head><meta charset="utf-8"><title>Beyan Takip - ${beyanLabel} - ${months[selectedMonth]} ${selectedYear}</title>
    <style>body{font-family:Arial,sans-serif;padding:20px}h1{font-size:18px;margin-bottom:5px}
    h2{font-size:14px;color:#666;margin-bottom:15px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{background:#1e3a5f;color:white;padding:8px;text-align:left}
    td{padding:6px 8px;border-bottom:1px solid #ddd}
    tr:nth-child(even){background:#f8f9fa}
    .done{color:green;font-weight:bold}.notdone{color:red}
    </style></head><body>
    <h1>Aylik Beyan Takip Raporu - ${beyanLabel}</h1>
    <h2>${months[selectedMonth]} ${selectedYear} - ${filteredData.length} Musteri</h2>
    <table><thead><tr><th>Musteri</th><th>Beyan Turu</th><th>Ait Ay</th><th>Son Tarih</th><th>Durum</th></tr></thead><tbody>`
    filteredData.forEach(client => {
      client.beyanlar?.forEach(b => {
        // Secili beyan tipi filtresi
        if (selectedBeyan !== 'all' && b.type !== selectedBeyan) return
        const isDone = ['yapildi','onaylandi','tahakkuk_gonderildi'].includes(b.status)
        html += `<tr><td>${client.name}</td><td>${b.label}</td><td>${b.aitAy}</td><td>${b.deadline}</td><td class="${isDone?'done':'notdone'}">${getStatusLabel(b.status)}</td></tr>`
      })
    })
    html += '</tbody></table></body></html>'
    const w = window.open('', '_blank')
    w.document.write(html)
    w.document.close()
    setTimeout(() => w.print(), 500)
  }

  const totalStats = {
    total: filteredData.length,
    totalBeyan: filteredData.reduce((sum, c) => sum + (c.summary?.total || 0), 0),
    yapildi: filteredData.reduce((sum, c) => sum + (c.summary?.yapildi || 0), 0),
    hazir: filteredData.reduce((sum, c) => sum + (c.summary?.hazir || 0), 0),
    onaylandi: filteredData.reduce((sum, c) => sum + (c.summary?.onaylandi || 0), 0),
    tahakkuk: filteredData.reduce((sum, c) => sum + (c.summary?.tahakkukGonderildi || 0), 0),
  }
  // 2.7.502: kalan = toplam - tamamlanan (yapildi, onaylandi, gonderildi)
  totalStats.kalan = totalStats.totalBeyan - totalStats.yapildi

  return (
    <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center space-x-3">
            <Calendar className="w-8 h-8 text-yellow-400" />
            <span>Aylık Beyan Takip</span>
          </h1>
          <p className="text-gray-400 mt-1">
            Tüm müşterilerin beyan durumlarını aylık olarak görüntüleyin
          </p>
        </div>
        {/* 2.7.521: donem sayaclari ve Excel/PDF/Yenile asagidaki tam satira tasindi */}
      </div>

      {/* 2.7.521: Donem sayaçları — kompakt kartlar tek tam satirda (eski buyuk
          kartlar kaldirildi); saginda Excel/PDF/Yenile düğmeleri */}
      <div className="flex flex-wrap items-center gap-3 mb-6 bg-blue-800/20 rounded-xl p-3 border border-blue-700/30">
        <div className="flex flex-wrap items-stretch gap-3 flex-1 min-w-[320px]">
          <div className="bg-blue-900/40 rounded-lg px-4 py-2 border border-blue-700/40 text-center flex-1 min-w-[90px]">
            <div className="text-lg font-bold text-blue-400">{totalStats.totalBeyan}</div>
            <div className="text-gray-400 text-xs whitespace-nowrap">Toplam Beyan</div>
          </div>
          <div className="bg-blue-900/40 rounded-lg px-4 py-2 border border-blue-700/40 text-center flex-1 min-w-[90px]">
            <div className={`text-lg font-bold ${totalStats.kalan > 0 ? 'text-yellow-400' : 'text-green-400'}`}>{totalStats.kalan}</div>
            <div className="text-gray-400 text-xs whitespace-nowrap">Kalan</div>
          </div>
          <div className="bg-blue-900/40 rounded-lg px-4 py-2 border border-blue-700/40 text-center flex-1 min-w-[90px]">
            <div className="text-lg font-bold text-cyan-400">{totalStats.hazir}</div>
            <div className="text-gray-400 text-xs whitespace-nowrap">Hazır</div>
          </div>
          <div className="bg-blue-900/40 rounded-lg px-4 py-2 border border-blue-700/40 text-center flex-1 min-w-[90px]">
            <div className="text-lg font-bold text-green-400">{totalStats.onaylandi}</div>
            <div className="text-gray-400 text-xs whitespace-nowrap">Onaylandı</div>
          </div>
          <div className="bg-blue-900/40 rounded-lg px-4 py-2 border border-blue-700/40 text-center flex-1 min-w-[90px]">
            <div className="text-lg font-bold text-purple-400">{totalStats.tahakkuk}</div>
            <div className="text-gray-400 text-xs whitespace-nowrap">Gönderildi</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={exportToExcel} className="bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 flex items-center space-x-2">
            <FileSpreadsheet className="w-4 h-4" />
            <span>Excel</span>
          </button>
          <button onClick={exportToPdf} className="bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:shadow-lg hover:shadow-red-500/30 transition-all duration-300 flex items-center space-x-2">
            <FileText className="w-4 h-4" />
            <span>PDF</span>
          </button>
          <button onClick={loadData} disabled={loading} className="bg-blue-500/20 text-blue-400 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-500/30 transition-all duration-300 flex items-center space-x-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Yenile</span>
          </button>
        </div>
      </div>

      {/* Ay/Yıl Seçici */}
      <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 mb-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <button onClick={() => changeMonth(-1)} className="text-gray-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-blue-800/30">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center space-x-3">
              <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white text-lg font-semibold focus:outline-none focus:border-yellow-400 transition-colors">
                {months.map((month, index) => (
                  <option key={index} value={index}>{month}</option>
                ))}
              </select>
              <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white text-lg font-semibold focus:outline-none focus:border-yellow-400 transition-colors">
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <button onClick={() => changeMonth(1)} className="text-gray-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-blue-800/30">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center space-x-4">
            <button onClick={goToToday} className="bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors px-4 py-2 rounded-lg text-sm font-medium">
              📅 Bugün
            </button>
            <span className="text-gray-400 text-sm">{months[selectedMonth]} {selectedYear}</span>
          </div>
        </div>
      </div>

      {/* Filtreler */}
      <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-gray-400 text-xs block mb-1">Beyan Tipi</label>
            <select value={selectedBeyan} onChange={(e) => {
              const v = e.target.value
              setSelectedBeyan(v)
              // e-Defter gorunumunde baska bir beyan tipi secilirse liste görünümüne dön
              if (viewMode === 'edefter' && v !== 'all' && v !== 'edefter') setViewMode('table')
            }} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors">
              {beyanTipleri.map(b => (
                <option key={b.id} value={b.id}>{b.icon} {b.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-gray-400 text-xs block mb-1">Durum</label>
            <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors">
              {statusOptions.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-gray-400 text-xs block mb-1">Ara</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input type="text" placeholder="Müşteri ara..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 pl-9 pr-4 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors" />
            </div>
          </div>
          <div className="flex items-end space-x-2">
            <div className="flex-1">
              <label className="text-gray-400 text-xs block mb-1">Göster</label>
              <select value={itemsPerPage} onChange={(e) => setItemsPerPage(parseInt(e.target.value))} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors">
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
                <option value={500}>500</option>
              </select>
            </div>
            <div className="flex space-x-1">
              <button onClick={() => setViewMode('matris')} title="Matris görünümü" className={`p-2 rounded-lg transition-all ${viewMode === 'matris' ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-400 hover:text-white'}`}>
                <LayoutGrid className="w-5 h-5" />
              </button>
              <button onClick={() => { setViewMode('edefter'); setSelectedBeyan('kdv') }} title="e-Defter listesi" className={`p-2 rounded-lg transition-all ${viewMode === 'edefter' ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-400 hover:text-white'}`}>
                <BookOpen className="w-5 h-5" />
              </button>
              <button onClick={() => setViewMode('table')} title="Liste görünümü" className={`p-2 rounded-lg transition-all ${viewMode === 'table' ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-400 hover:text-white'}`}>
                <List className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MATRIS GORUNUMU (Odeme Takip formati) */}
      {viewMode === 'matris' && (() => {
        // Muhtasar: "Muhtasar (3 Aylık)" filtresi seciliyse sadece 3aylik profil olanlar, ceyrek son ayinda
        const ucAylikSecili = selectedBeyan === 'muhtasar_3aylik'
        const tumModu = selectedBeyan === 'all'
        const mType = selectedBeyan !== 'all' ? (ucAylikSecili ? 'muhtasar' : selectedBeyan) : 'kdv'
        const mLabel = tumModu ? 'Tüm Beyanlar' : ucAylikSecili ? 'Muhtasar (3 Aylık)' : beyanTipleri.find(b => b.id === mType)?.label || mType
        // Liste gorunumuyle ayni anahtar: 3aylik -> ceyrek basi ay + muhtasar_3aylik; aylik -> ay + muhtasar
        const mKey = (m) => ucAylikSecili ? `${selectedYear}_${m - 2}_muhtasar_3aylik` : `${selectedYear}_${m}_${mType}`
        // "Tüm Beyanlar" modu: her hücre o ayın aktif beyan turlarının toplu durumunu gösterir
        const TUM_TURLER = ['kdv', 'kdv2', 'sgk', 'muhtasar', 'gecici_vergi', 'poset', 'muhtasar_3aylik']
        const tumKey = (tur, m) => tur === 'muhtasar_3aylik' ? `${selectedYear}_${m - 2}_muhtasar_3aylik` : `${selectedYear}_${m}_${tur}`
        const tumAktifTurlar = (c, m) => {
          const liste = []
          for (const tur of TUM_TURLER) {
            if ((tur === 'gecici_vergi' || tur === 'muhtasar_3aylik') && ![2, 5, 8, 11].includes(m)) continue
            if (tur === 'muhtasar_3aylik') {
              // 2.7.579: ceyregin herhangi bir ayi '3aylik' ise o ceyrek 3aylikdir
              const ceyrekAktif = [m - 2, m - 1, m].some(mm => {
                const md3 = c.beyanProfile?.muhtasar?.[mm]
                return md3 && md3.active !== false && md3.period === '3aylik'
              })
              if (!ceyrekAktif) continue
              liste.push({ tur, key: tumKey(tur, m) })
              continue
            }
            // Poset beyani yalniz profilde ACILMIS musterilerde gorunur
            // (profil anahtari hic yoksa beyan yok sayilir — opt-in tur)
            if (tur === 'poset') {
              const mp = c.beyanProfile?.poset?.[m]
              if (!mp || mp.active === false || mp.period === 'yok') continue
              liste.push({ tur, key: tumKey(tur, m) })
              continue
            }
            const md = c.beyanProfile?.[tur]?.[m]
            if (md && (md.active === false || md.period === 'yok')) continue
            if (tur === 'muhtasar' && md?.period === '3aylik') continue
            liste.push({ tur, key: tumKey(tur, m) })
          }
          return liste
        }
        const tumHucre = (c, m) => {
          const liste = tumAktifTurlar(c, m)
          const yapilan = liste.filter(t => ['yapildi', 'onaylandi', 'tahakkuk_gonderildi'].includes(c.beyanDurumlari?.[t.key] || 'yapilamadi')).length
          return { liste, toplam: liste.length, yapilan }
        }
        const turLabel = (tur) => tur === 'muhtasar_3aylik' ? 'Muhtasar (3 Aylık)' : beyanTipleri.find(b => b.id === tur)?.label || tur
        // e-Defter mukellefi mi? (bayrak true/1/"true" VE profilinde en az bir ay aktif)
        const edefterMukellef = (c) => {
          const raw = c.edefter
          const bayrak = raw === true || raw === 1 ||
            (typeof raw === 'string' && raw.trim().toLowerCase() === 'true')
          if (!bayrak) return false
          const prof = c.beyanProfile?.edefter
          if (!prof) return true
          return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].some(m => {
            const md = prof[m]
            if (!md) return true
            return md.active !== false && md.period !== 'yok'
          })
        }
        // Muhtasar: secilen filtre modalina gore aktiflik (3aylik filtresi -> sadece ceyrek son aylari)
        // NOT: matrisRows filtresi hucreAktif'i kullandigi icin tanim FILTREDEN
        // ONCE olmali (TDZ ReferenceError -> bos sayfa oluyordu).
        const hucreAktif = (c, m) => {
          // 2.7.579: Muhtasar donem gecisi — musteri bazi aylarda aylik, bazi
          // ceyreklerde 3aylik olabilir. 3aylik hucre, ceyregin HERHANGI bir ayi
          // profilde '3aylik' ise aktiftir (tablo görünümüyle ayni kural).
          if (mType === 'muhtasar') {
            if (ucAylikSecili) {
              if (![2, 5, 8, 11].includes(m)) return false
              return [m - 2, m - 1, m].some(mm => {
                const md3 = c.beyanProfile?.muhtasar?.[mm]
                return md3 && md3.active !== false && md3.period === '3aylik'
              })
            }
            const mdAy = c.beyanProfile?.muhtasar?.[m]
            return !mdAy || (mdAy.active !== false && (mdAy.period || 'aylik') === 'aylik')
          }
          const md = c.beyanProfile?.[mType]?.[m]
          if (md && (md.active === false || md.period === 'yok')) return false
          // Poset: profil anahtari hic yoksa da PASIF sayilir (opt-in tur)
          if (mType === 'poset' && !md) return false
          return true
        }
        const matrisRows = clients.filter(c => {
          if (mType === 'edefter' && !edefterMukellef(c)) return false
          // Poset: yalniz profilde en az bir ay acik olan musteriler listelenir
          if (mType === 'poset') {
            const posetVar = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].some(m => {
              const mp = c.beyanProfile?.poset?.[m]
              return mp && mp.active !== false && mp.period !== 'yok'
            })
            if (!posetVar) return false
          }
          // 2.7.578/579: Beyan profilinde secili beyan tipi hicbir ay icin acik
          // degilse musteri bu listede gorunmez (orn. KDV mukellefi olmayan
          // musteri KDV listesinde cikmaz). Profilde kayit hic yoksa (eski
          // kayit) musteri listelenmeye devam eder. Muhtasar'da donem gecisi
          // desteklenir: AYLIK liste en az bir 'aylik' ayi olan musterileri,
          // 3 AYLIK liste ceyreginden en az biri '3aylik' olan musterileri
          // gosterir — ayni musteri her iki listede de yer alabilir.
          if (!tumModu && mType !== 'edefter' && mType !== 'poset') {
            const tp = c.beyanProfile?.[mType]
            if (tp && Object.keys(tp).length > 0) {
              let aktifAyVar
              if (mType === 'muhtasar' && ucAylikSecili) {
                aktifAyVar = [2, 5, 8, 11].some(qe => [qe - 2, qe - 1, qe].some(m => {
                  const md = tp[m]
                  return md && md.active !== false && md.period === '3aylik'
                }))
              } else if (mType === 'muhtasar') {
                aktifAyVar = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].some(m => {
                  const md = tp[m]
                  if (!md) return true
                  return md.active !== false && (md.period || 'aylik') === 'aylik'
                })
              } else {
                aktifAyVar = Object.values(tp).some(md => md && md.active !== false && md.period !== 'yok')
              }
              if (!aktifAyVar) return false
            }
          }
          // Durum filtresi: secili ayda secilen beyan tipinin durumu secilen
          // durumla ayni olmali ('gonderildi' -> 'tahakkuk_gonderildi')
          if (selectedStatus !== 'all') {
            const uyum = (st) => selectedStatus === 'gonderildi'
              ? (st === 'tahakkuk_gonderildi' || st === 'gonderildi')
              : st === selectedStatus
            // 2.7.168 duzeltmesi: Durum filtresi SEÇİLİ AYA bakar (eskiden
            // 1..12 tum aylara bakiyordu — herhangi bir ayda eslesen musteri
            // listeleniyor, secili ay hic kontrol edilmiyordu). Anahtarlar
            // 0-based ay indeksi kullanir (Ocak=0), bu yuzden matris sutun
            // indeksi (m) dogrudan anahtar ayidir.
            const mSecili = selectedMonth
            const eslesti = tumModu
              ? tumAktifTurlar(c, mSecili).some(t => uyum(c.beyanDurumlari?.[t.key] || 'yapilamadi'))
              : hucreAktif(c, mSecili) && uyum(c.beyanDurumlari?.[mKey(mSecili)] || 'yapilamadi')
            if (!eslesti) return false
          }
          if (!searchTerm) return true
          const s = searchTerm.toLowerCase()
          return (c.name || '').toLowerCase().includes(s) ||
            (c.company || '').toLowerCase().includes(s) ||
            (c.vkn || '').includes(searchTerm) ||
            (c.tc || '').includes(searchTerm)
        }).sort((a, b) => (a.name || a.company || '').localeCompare(b.name || b.company || '', 'tr'))
        // Beyan bazinda yillik ozet: her tur icin Yapilan/Hazir/Gonderilen/Kalan (Tum Beyanlar modu)
        const turOzetleri = tumModu ? TUM_TURLER.map(tur => {
          let yapilan = 0, hazir = 0, gonderilen = 0, kalan = 0
          matrisRows.forEach(c => {
            for (let m = 0; m < 12; m++) {
              tumAktifTurlar(c, m).filter(t => t.tur === tur).forEach(t => {
                const stt = c.beyanDurumlari?.[t.key] || 'yapilamadi'
                if (stt === 'yapildi' || stt === 'onaylandi') yapilan++
                else if (stt === 'hazir') hazir++
                else if (stt === 'tahakkuk_gonderildi') gonderilen++
                else kalan++
              })
            }
          })
          return { tur, yapilan, hazir, gonderilen, kalan }
        }).filter(t => (t.yapilan + t.hazir + t.gonderilen + t.kalan) > 0) : []
        const durumKisa = { yapildi: 'Verildi', evrak_alindi: 'Evrak A.', hazir: 'Hazır', onaylandi: 'Onaylandı', tahakkuk_gonderildi: 'Gönderildi', onaylanmadi: 'Onaylanmadı', yapilamadi: 'Yapılmadı' }
        // 3B hucre stilleri: degrade + kabartma kenar + golge
        const durumRenk = {
          yapildi: 'bg-gradient-to-b from-green-400 to-green-600 text-white border-green-700 shadow-[0_2px_0_#166534,0_4px_8px_rgba(34,197,94,0.35)]',
          evrak_alindi: 'bg-gradient-to-b from-sky-400 to-sky-600 text-white border-sky-700 shadow-[0_2px_0_#075985,0_4px_8px_rgba(14,165,233,0.35)]',
          hazir: 'bg-gradient-to-b from-amber-300 to-yellow-500 text-white border-yellow-700 shadow-[0_2px_0_#92400e,0_4px_8px_rgba(250,204,21,0.35)]',
          onaylandi: 'bg-gradient-to-b from-green-400 to-green-600 text-white border-green-700 shadow-[0_2px_0_#14532d,0_4px_8px_rgba(34,197,94,0.35)]',
          tahakkuk_gonderildi: 'bg-gradient-to-b from-purple-400 to-purple-600 text-white border-purple-700 shadow-[0_2px_0_#581c87,0_4px_8px_rgba(168,85,247,0.35)]',
          onaylanmadi: 'bg-gradient-to-b from-amber-300 to-yellow-500 text-white border-yellow-700 shadow-[0_2px_0_#92400e,0_4px_8px_rgba(250,204,21,0.35)]',
          yapilamadi: 'bg-gradient-to-b from-red-400 to-red-600 text-white border-red-700 shadow-[0_2px_0_#7f1d1d,0_4px_8px_rgba(239,68,68,0.3)]'
        }
        // Her ay icin: Yapilan (Verildi/Yollandi), Gonderilen (Tahakkuk), Kalan
        const aySayilari = months.map((_, m) => {
          let yapilan = 0, hazir = 0, gonderilen = 0, kalan = 0
          matrisRows.forEach(c => {
            if (tumModu) {
              // Tum Beyanlar: ay icindeki her tur-kaydi ayri sayilir
              tumHucre(c, m).liste.forEach(t => {
                const stt = c.beyanDurumlari?.[t.key] || 'yapilamadi'
                if (stt === 'yapildi' || stt === 'onaylandi') yapilan++
                else if (stt === 'hazir') hazir++
                else if (stt === 'tahakkuk_gonderildi') gonderilen++
                else kalan++
              })
              return
            }
            if (!hucreAktif(c, m)) return
            const st = c.beyanDurumlari?.[mKey(m)] || 'yapilamadi'
            if (st === 'yapildi' || st === 'onaylandi') yapilan++
            else if (st === 'hazir') hazir++
            else if (st === 'tahakkuk_gonderildi') gonderilen++
            else kalan++
          })
          return { yapilan, hazir, gonderilen, kalan }
        })
        return (
          <>
            <div className="bg-blue-800/20 rounded-2xl border border-blue-700/30 overflow-hidden mb-6">
              <div className="px-4 py-3 border-b border-blue-700/30 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-white text-sm font-medium">{mLabel} Beyanları - {selectedYear}</p>
                  {ucAylikSecili && <span className="text-yellow-300 text-xs">Çeyrek son ayları: Mart, Haziran, Eylül, Aralık</span>}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span className="text-red-400">Yapılmadı</span>
                  <span className="text-sky-400">Evrak Alındı</span>
                  <span className="text-yellow-400">Hazır</span>
                  <span className="text-green-400">Onaylandı</span>
                  <span className="text-purple-400">Gönderildi</span>
                </div>
              </div>
              <div className="overflow-auto max-h-[65vh]">
                <table className="w-full text-sm">
                  <thead className="bg-blue-900 sticky top-0 z-10 shadow-[0_2px_6px_rgba(0,0,0,0.35)]">
                    <tr className="text-gray-300 text-xs whitespace-nowrap">
                      <th className="px-3 py-2 text-left min-w-[170px]">Adı Soyadı</th>
                      {months.map(ay => <th key={ay} className="px-2 py-2 text-center">{ay}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {matrisRows.length === 0 ? (
                      <tr><td colSpan="13" className="text-center py-8 text-gray-500">{loading ? 'Yükleniyor...' : 'Kayıt bulunamadı'}</td></tr>
                    ) : matrisRows.map(c => (
                      <tr key={c.id} className="border-t border-blue-700/20 hover:bg-blue-800/10 transition-colors">
                        <td className="px-3 py-1.5 whitespace-nowrap text-white font-medium text-xs" title={c.name}>{kisaAd(c.name)}</td>
                        {months.map((ay, m) => {
                          if (tumModu) {
                            const h = tumHucre(c, m)
                            if (h.toplam === 0) return <td key={m} className="px-1 py-1 text-center"><span className="text-gray-700">-</span></td>
                            const renk = h.yapilan === h.toplam ? durumRenk.onaylandi : h.yapilan > 0 ? durumRenk.hazir : durumRenk.yapilamadi
                            return (
                              <td key={m} className="px-1 py-1 text-center">
                                <button onClick={() => setMatrisCell({ clientId: c.id, clientName: c.name, month0: m })}
                                  title={`${ay} ${selectedYear} - ${h.yapilan}/${h.toplam} beyan tamam (tıkla: tür bazlı durum)`}
                                  className={`relative w-full max-w-[64px] mx-auto px-1 py-1 rounded-md border text-[10px] font-bold [text-shadow:0_1px_2px_rgba(0,0,0,0.45)] transition-all hover:scale-105 hover:brightness-110 active:translate-y-[2px] ${renk}`}>
                                  {h.yapilan}/{h.toplam}
                                  {h.toplam > 0 && h.yapilan === h.toplam && (
                                    <span className="absolute -top-1.5 -right-1.5 text-yellow-400 text-[11px] leading-none drop-shadow" title="Tüm beyanlar onaylandı">★</span>
                                  )}
                                </button>
                              </td>
                            )
                          }
                          const aktif = hucreAktif(c, m)
                          const st = c.beyanDurumlari?.[mKey(m)] || 'yapilamadi'
                          return (
                            <td key={m} className="px-1 py-1 text-center">
                              {aktif ? (
                                <button onClick={() => setMatrisCell({ clientId: c.id, clientName: c.name, month0: m })}
                                  title={`${ay} ${selectedYear} - ${durumKisa[st] || st} (tıkla: durum + yükleme)`}
                                  className={`relative w-full max-w-[64px] mx-auto px-1 py-1 rounded-md border text-[10px] font-bold [text-shadow:0_1px_2px_rgba(0,0,0,0.45)] transition-all hover:scale-105 hover:brightness-110 active:translate-y-[2px] ${durumRenk[st] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                                  {durumKisa[st] || '-'}
                                  {yuklemeDurumlari[`${c.id}_${mKey(m)}`] === 'yukleniyor' && (
                                    <span className="absolute -top-1.5 -right-1.5 text-yellow-300 text-[12px] leading-none drop-shadow animate-pulse" title="Beyanname/tahakkuk GİB'den indirilip yükleniyor...">★</span>
                                  )}
                                  {yuklemeDurumlari[`${c.id}_${mKey(m)}`] === 'hata' && (
                                    <span className="absolute -top-1.5 -right-1.5 text-red-500 text-[12px] leading-none drop-shadow animate-pulse" title="Yükleme başarısız — tekrar denemek için durumu Onaylandı olarak yeniden seçin">★</span>
                                  )}
                                  {st === 'onaylandi' && yuklemeDurumlari[`${c.id}_${mKey(m)}`] !== 'yukleniyor' && yuklemeDurumlari[`${c.id}_${mKey(m)}`] !== 'hata' && (
                                    <span className="absolute -top-1.5 -right-1.5 text-yellow-400 text-[11px] leading-none drop-shadow" title="Onaylandı — belgeler otomatik indirildi/indiriliyor">★</span>
                                  )}
                                </button>
                              ) : <span className="text-gray-700">-</span>}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-blue-900/50 border-t-2 border-blue-700/40 text-[10px]">
                      <td className="px-3 py-2 text-gray-400 whitespace-nowrap">Aylık Sayılar →</td>
                      {aySayilari.map((s, m) => (
                        <td key={m} className="px-1 py-2 text-center whitespace-nowrap">
                          <span className="text-green-400 font-semibold">Y:{s.yapilan}</span>{' '}
                          <span className="text-yellow-400 font-semibold">H:{s.hazir}</span>{' '}
                          <span className="text-purple-400 font-semibold">G:{s.gonderilen}</span>{' '}
                          <span className="text-red-400 font-semibold">K:{s.kalan}</span>
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-gray-500 text-xs px-4 py-2">Y: Yapılan (Onaylandı) · H: Hazır · G: Gönderilen (tahakkuk) · K: Kalan. Hücreye tıklayınca durum seçme ve beyanname/tahakkuk yükleme penceresi açılır.</p>
              {tumModu && turOzetleri.length > 0 && (
                <div className="px-4 py-3 border-t border-blue-700/30">
                  <p className="text-gray-400 text-xs mb-2">Beyan bazında özet ({selectedYear})</p>
                  <div className="flex flex-wrap gap-2">
                    {turOzetleri.map(t => (
                      <div key={t.tur} className="bg-blue-900/40 border border-blue-700/40 rounded-lg px-3 py-1.5 text-xs">
                        <span className="text-white font-semibold mr-1.5">{turLabel(t.tur)}:</span>
                        <span className="text-green-400 font-semibold">Y:{t.yapilan}</span>{' '}
                        <span className="text-yellow-400 font-semibold">H:{t.hazir}</span>{' '}
                        <span className="text-purple-400 font-semibold">G:{t.gonderilen}</span>{' '}
                        <span className="text-red-400 font-semibold">K:{t.kalan}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Matris hucre modal */}
            {matrisCell && tumModu && (() => {
              // Tum Beyanlar modu: ayin aktif her beyan turu icin ayri durum satiri
              const c = clients.find(x => x.id === matrisCell.clientId)
              const liste = c ? tumAktifTurlar(c, matrisCell.month0) : []
              const dm = c?.beyanDurumlari || {}
              const turLabel = (tur) => tur === 'muhtasar_3aylik' ? 'Muhtasar (3 Aylık)' : beyanTipleri.find(b => b.id === tur)?.label || tur
              return (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setMatrisCell(null)}>
                  <div className="bg-blue-900 rounded-2xl border border-blue-700/50 shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between p-5 border-b border-blue-700/30 sticky top-0 bg-blue-900 rounded-t-2xl">
                      <div>
                        <h3 className="text-lg font-bold text-white">{months[matrisCell.month0]} {selectedYear} - Tüm Beyanlar</h3>
                        <p className="text-gray-400 text-sm">{matrisCell.clientName}</p>
                      </div>
                      <button onClick={() => setMatrisCell(null)} className="text-gray-400 hover:text-white p-1"><X className="w-5 h-5" /></button>
                    </div>
                    <div className="p-5 space-y-4">
                      {liste.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-4">Bu dönemde bu müşteriye ait aktif beyan türü bulunamadı.</p>
                      ) : liste.map(({ tur, key }) => {
                        const st = dm[key] || 'yapilamadi'
                        const beyanObj = {
                          id: `${matrisCell.clientId}_${tur}`,
                          type: tur,
                          label: turLabel(tur),
                          belongYear: selectedYear,
                          belongMonths: [tur === 'muhtasar_3aylik' ? matrisCell.month0 - 2 : matrisCell.month0]
                        }
                        return (
                          <div key={tur} className="bg-blue-800/20 rounded-xl p-3 border border-blue-700/30">
                            <p className="text-white text-sm font-bold mb-2.5">{turLabel(tur)}</p>
                            <div className="grid grid-cols-5 gap-1.5">
                              {[
                                { s: 'yapilamadi', label: 'Yapılmadı', icon: <AlertTriangle className="w-3.5 h-3.5" />, cls: 'bg-gradient-to-b from-red-400 to-red-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_3px_0_#7f1d1d,0_6px_12px_rgba(239,68,68,0.35)]' },
                                { s: 'evrak_alindi', label: 'Evrak Alındı', icon: <FileCheck className="w-3.5 h-3.5" />, cls: 'bg-gradient-to-b from-sky-400 to-sky-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_3px_0_#075985,0_6px_12px_rgba(14,165,233,0.35)]' },
                                { s: 'hazir', label: 'Hazır', icon: <Clock className="w-3.5 h-3.5" />, cls: 'bg-gradient-to-b from-amber-300 to-yellow-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_3px_0_#92400e,0_6px_12px_rgba(250,204,21,0.35)]' },
                                { s: 'onaylandi', label: 'Onaylandı', icon: <CheckCircle className="w-3.5 h-3.5" />, cls: 'bg-gradient-to-b from-green-400 to-green-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_3px_0_#14532d,0_6px_12px_rgba(34,197,94,0.35)]' },
                                { s: 'tahakkuk_gonderildi', label: 'Gönderildi', icon: <Send className="w-3.5 h-3.5" />, cls: 'bg-gradient-to-b from-purple-400 to-purple-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_3px_0_#581c87,0_6px_12px_rgba(168,85,247,0.35)]' },
                              ].map(({ s, label, icon, cls }) => (
                                <button key={s} onClick={() => updateBeyanStatus(matrisCell.clientId, beyanObj, s)}
                                  className={`relative flex flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-[10px] font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)] transition-all duration-150 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-[3px] active:shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)] ${cls} ${st === s ? 'ring-2 ring-white/90' : 'opacity-80 hover:opacity-100'}`}>
                                  {icon}
                                  <span className="leading-tight text-center">{label}</span>
                                  {st === s && (
                                    <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-blue-900 shadow">
                                      <CheckCircle className="w-3 h-3" />
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                      <p className="text-gray-500 text-xs">Dosya yükleme ve GİB'den indirme için beyan tipini yukarıdaki menüden seçip hücreye tıklayın veya müşteri detayını açın.</p>
                    </div>
                  </div>
                </div>
              )
            })()}
            {matrisCell && !tumModu && (() => {
              const key = ucAylikSecili ? `${selectedYear}_${matrisCell.month0 - 2}_muhtasar_3aylik` : `${selectedYear}_${matrisCell.month0}_${mType}`
              const dm = clients.find(c => c.id === matrisCell.clientId)?.beyanDurumlari || {}
              const beyanObj = {
                id: `${matrisCell.clientId}_${ucAylikSecili ? 'muhtasar_3aylik' : mType}`,
                type: ucAylikSecili ? 'muhtasar_3aylik' : mType,
                label: mLabel,
                belongYear: selectedYear,
                belongMonths: [ucAylikSecili ? matrisCell.month0 - 2 : matrisCell.month0]
              }
              const st = dm[key] || 'yapilamadi'
              return (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setMatrisCell(null)}>
                  <div className="bg-blue-900 rounded-2xl border border-blue-700/50 shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between p-5 border-b border-blue-700/30">
                      <div>
                        <h3 className="text-lg font-bold text-white">{months[matrisCell.month0]} {selectedYear} - {mLabel}</h3>
                        <p className="text-gray-400 text-sm">{matrisCell.clientName}</p>
                      </div>
                      <button onClick={() => setMatrisCell(null)} className="text-gray-400 hover:text-white p-1"><X className="w-5 h-5" /></button>
                    </div>
                    <div className="p-5 space-y-4">
                      <div>
                        <p className="text-xs text-gray-400 mb-2">Durum</p>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { s: 'yapilamadi', label: 'Yapılmadı', icon: <AlertTriangle className="w-4 h-4" />, cls: 'bg-gradient-to-b from-red-400 to-red-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_0_#7f1d1d,0_8px_16px_rgba(239,68,68,0.35)]' },
                            { s: 'evrak_alindi', label: 'Evrak Alındı', icon: <FileCheck className="w-4 h-4" />, cls: 'bg-gradient-to-b from-sky-400 to-sky-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_0_#075985,0_8px_16px_rgba(14,165,233,0.35)]' },
                            { s: 'hazir', label: 'Hazır', icon: <Clock className="w-4 h-4" />, cls: 'bg-gradient-to-b from-amber-300 to-yellow-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_0_#92400e,0_8px_16px_rgba(250,204,21,0.35)]' },
                            { s: 'onaylandi', label: 'Onaylandı', icon: <CheckCircle className="w-4 h-4" />, cls: 'bg-gradient-to-b from-green-400 to-green-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_0_#14532d,0_8px_16px_rgba(34,197,94,0.35)]' },
                            { s: 'tahakkuk_gonderildi', label: 'Gönderildi', icon: <Send className="w-4 h-4" />, cls: 'bg-gradient-to-b from-purple-400 to-purple-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_0_#581c87,0_8px_16px_rgba(168,85,247,0.35)]' },
                          ].map(({ s, label, icon, cls }) => (
                            <button key={s} onClick={() => updateBeyanStatus(matrisCell.clientId, beyanObj, s)}
                              className={`relative flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)] transition-all duration-150 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-[3px] active:shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)] ${cls} ${st === s ? 'ring-2 ring-white/90 ring-offset-2 ring-offset-blue-900' : 'opacity-80 hover:opacity-100'}`}>
                              {icon}
                              <span>{label}</span>
                              {st === s && (
                                <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-blue-900 shadow">
                                  <CheckCircle className="w-3 h-3" />
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-2">Yükleme (birden fazla dosya eklenebilir)</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          <label className="cursor-pointer bg-blue-800/40 hover:bg-blue-800/60 border border-blue-700/40 rounded-lg px-3 py-2 text-center text-xs text-white font-medium transition-colors">
                            {mType === 'sgk' ? '📋 Hizmet Listesi Yükle' : mType === 'edefter' ? '📓 Berat Yükle' : '📄 Beyanname Yükle'}
                            <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden"
                              onChange={e => handleDocumentUpload(matrisCell.clientId, beyanObj, 'beyanname', e.target.files?.[0])} />
                          </label>
                          {mType !== 'edefter' && (
                            <label className="cursor-pointer bg-purple-800/40 hover:bg-purple-800/60 border border-purple-700/40 rounded-lg px-3 py-2 text-center text-xs text-white font-medium transition-colors">
                              🧾 Tahakkuk Yükle
                              <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden"
                                onChange={e => handleDocumentUpload(matrisCell.clientId, beyanObj, 'tahakkuk', e.target.files?.[0])} />
                            </label>
                          )}
                          {mType === 'sgk' && (
                            <label className="cursor-pointer bg-green-800/40 hover:bg-green-800/60 border border-green-700/40 rounded-lg px-3 py-2 text-center text-xs text-white font-medium transition-colors">
                              👥 Bordro Yükle
                              <input type="file" accept=".pdf,.xlsx,.xls,.png,.jpg,.jpeg" className="hidden"
                                onChange={e => handleDocumentUpload(matrisCell.clientId, beyanObj, 'bordro', e.target.files?.[0])} />
                            </label>
                          )}
                          {/* GIB'den otomatik indirme (yardimci program kuruluysa) */}
                          {mType !== 'edefter' && (
                            <button
                              onClick={() => handleGibdenIndir(matrisCell.clientId, beyanObj, 'beyanname')}
                              disabled={gibIndirme?.clientId === matrisCell.clientId}
                              className="bg-teal-800/40 hover:bg-teal-800/60 border border-teal-600/40 rounded-lg px-3 py-2 text-center text-xs text-teal-200 font-medium transition-colors disabled:opacity-50"
                            >
                              {gibIndirme?.clientId === matrisCell.clientId && gibIndirme?.type === 'beyanname'
                                ? '⏳ Bekleniyor...'
                                : '🌐 Beyanname GIB\'den İndir'}
                            </button>
                          )}
                          {mType !== 'edefter' && (
                            <button
                              onClick={() => handleGibdenIndir(matrisCell.clientId, beyanObj, 'tahakkuk')}
                              disabled={gibIndirme?.clientId === matrisCell.clientId}
                              className="bg-teal-800/40 hover:bg-teal-800/60 border border-teal-600/40 rounded-lg px-3 py-2 text-center text-xs text-teal-200 font-medium transition-colors disabled:opacity-50"
                            >
                              {gibIndirme?.clientId === matrisCell.clientId && gibIndirme?.type === 'tahakkuk'
                                ? '⏳ Bekleniyor...'
                                : '🌐 Tahakkuk GIB\'den İndir'}
                            </button>
                          )}
                          {/* e-Bildirge'den otomatik indirme */}
                          {mType !== 'edefter' && (
                            <button
                              onClick={() => handleGibdenIndir(matrisCell.clientId, beyanObj, 'beyanname', 'etebligat')}
                              disabled={gibIndirme?.clientId === matrisCell.clientId}
                              className="bg-indigo-800/40 hover:bg-indigo-800/60 border border-indigo-600/40 rounded-lg px-3 py-2 text-center text-xs text-indigo-200 font-medium transition-colors disabled:opacity-50"
                            >
                              {gibIndirme?.clientId === matrisCell.clientId && gibIndirme?.type === 'beyanname-eb'
                                ? '⏳ Bekleniyor...'
                                : '📘 Beyanname e-Bildirge\'den İndir'}
                            </button>
                          )}
                          {mType !== 'edefter' && (
                            <button
                              onClick={() => handleGibdenIndir(matrisCell.clientId, beyanObj, 'tahakkuk', 'etebligat')}
                              disabled={gibIndirme?.clientId === matrisCell.clientId}
                              className="bg-indigo-800/40 hover:bg-indigo-800/60 border border-indigo-600/40 rounded-lg px-3 py-2 text-center text-xs text-indigo-200 font-medium transition-colors disabled:opacity-50"
                            >
                              {gibIndirme?.clientId === matrisCell.clientId && gibIndirme?.type === 'tahakkuk-eb'
                                ? '⏳ Bekleniyor...'
                                : '📘 Tahakkuk e-Bildirge\'den İndir'}
                            </button>
                          )}
                        </div>
                        {gibIndirme?.clientId === matrisCell.clientId && gibIndirme.durum === 'dosya-bekleniyor' && (
                          <p className="text-yellow-300 text-[11px] mt-2">
                            GIB penceresinde guvenlik kodunu girip giris yapin; belgeyi indirdiginizde buraya otomatik yuklenecek (bekleme suresi 6 dk).
                          </p>
                        )}
                        {(() => {
                          const fmtTL = n => Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })
                          const bl = getBeyanList(dm, key)
                          const tl = getTahakkukList(dm, key)
                          const tutar = Number(dm[`${key}_tutar`]) || tl.reduce((s, t) => s + (Number(t.tutar) || 0), 0)
                          return (
                            <div className="mt-2 space-y-1">
                              {bl.length > 0 && bl.map((b, i) => (
                                <div key={`b${i}`} className="flex items-center justify-between gap-2 text-xs">
                                  <a href={b.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline truncate">
                                    📄 Beyanname #{i + 1}{b.tarih ? ` (${b.tarih.slice(0, 10)})` : ''}
                                  </a>
                                  <button onClick={() => handleDeleteBeyan(matrisCell.clientId, beyanObj, b.url)} className="text-red-400 hover:text-red-300 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                              ))}
                              {tl.length > 0 && tl.map((t, i) => (
                                <div key={`t${i}`} className="flex items-center justify-between gap-2 text-xs">
                                  <a href={t.url} target="_blank" rel="noreferrer" className="text-purple-400 hover:underline truncate">
                                    🧾 Tahakkuk #{i + 1}{Number(t.tutar) > 0 ? ` - ${fmtTL(t.tutar)} TL` : ''}{t.tarih ? ` (${t.tarih.slice(0, 10)})` : ''}
                                  </a>
                                  <button onClick={() => handleDeleteTahakkuk(matrisCell.clientId, beyanObj, t.url)} className="text-red-400 hover:text-red-300 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                              ))}
                              {mType === 'sgk' && (dm[`${key}_bordrolar`] || []).length > 0 && dm[`${key}_bordrolar`].map((bd, i) => (
                                <div key={`bd${i}`} className="flex items-center justify-between gap-2 text-xs">
                                  <a href={bd.url} target="_blank" rel="noreferrer" className="text-green-400 hover:underline truncate">
                                    👥 Bordro #{i + 1}{bd.tarih ? ` (${bd.tarih.slice(0, 10)})` : ''}
                                  </a>
                                  <button onClick={() => handleDeleteBordro(matrisCell.clientId, beyanObj, bd.url)} className="text-red-400 hover:text-red-300 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                              ))}
                              {tutar > 0 && <p className="text-green-400 text-xs font-medium">Tahakkuk Tutarı: {fmtTL(tutar)} TL</p>}
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}
          </>
        )
      })()}

      {/* E-DEFTER LISTESI (yalniz 'Tumu' veya 'e-Defter' filtresinde gosterilir) */}
      {viewMode === 'edefter' && (selectedBeyan === 'all' || selectedBeyan === 'edefter') && (() => {
        const edRows = clients
          .filter(c => {
            if (!searchTerm) return true
            const s = searchTerm.toLowerCase()
            return (c.name || '').toLowerCase().includes(s) ||
              (c.company || '').toLowerCase().includes(s) ||
              (c.vkn || '').includes(searchTerm) ||
              (c.tc || '').includes(searchTerm)
          })
          .map(c => ({ c, b: (generateMonthlyBeyanlar(c, selectedMonth) || []).find(x => x.type === 'edefter') }))
          .filter(r => r.b)
          .sort((a, b) => (a.c.name || a.c.company || '').localeCompare(b.c.name || b.c.company || '', 'tr'))
        const edDurumlar = [
          { v: 'yapilmadi', label: 'Yapılmadı', cls: 'bg-gradient-to-b from-red-400 to-red-600 text-white border-red-700 shadow-[0_2px_0_#7f1d1d,0_4px_8px_rgba(239,68,68,0.3)]' },
          { v: 'eksik', label: 'Eksik', cls: 'bg-gradient-to-b from-amber-300 to-yellow-500 text-white border-yellow-700 shadow-[0_2px_0_#92400e,0_4px_8px_rgba(250,204,21,0.35)]' },
          { v: 'hazir', label: 'Hazır', cls: 'bg-gradient-to-b from-blue-400 to-blue-600 text-white border-blue-700 shadow-[0_2px_0_#1e3a8a,0_4px_8px_rgba(59,130,246,0.35)]' },
          { v: 'yuklendi', label: 'Yüklendi', cls: 'bg-gradient-to-b from-green-400 to-green-600 text-white border-green-700 shadow-[0_2px_0_#166534,0_4px_8px_rgba(34,197,94,0.35)]' }
        ]
        const edKey = (r) => `${r.b.belongYear}_${r.b.belongMonths?.[0]}_edefter`
        return (
          <div className="bg-blue-800/20 rounded-2xl border border-blue-700/30 overflow-hidden mb-6">
            <div className="px-4 py-3 border-b border-blue-700/30 flex items-center justify-between flex-wrap gap-2">
              <p className="text-white text-sm font-medium">e-Defter Berat Yüklemeleri - {getMonthName(selectedMonth)} {selectedYear}</p>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="text-red-400">Yapılmadı</span>
                <span className="text-yellow-400">Eksik</span>
                <span className="text-blue-400">Hazır</span>
                <span className="text-green-400">Yüklendi</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-blue-900/30">
                  <tr className="text-gray-400 text-xs whitespace-nowrap">
                    <th className="px-3 py-2 text-left min-w-[180px]">Adı Soyadı</th>
                    <th className="px-2 py-2 text-center">Mükellef</th>
                    <th className="px-2 py-2 text-center">Hangi Ayın Defteri</th>
                    <th className="px-2 py-2 text-center">Son Gün</th>
                    <th className="px-2 py-2 text-center">Durum</th>
                    <th className="px-2 py-2 text-center">Dosyalar</th>
                  </tr>
                </thead>
                <tbody>
                  {edRows.length === 0 ? (
                    <tr><td colSpan="6" className="text-center py-8 text-gray-500">{loading ? 'Yükleniyor...' : 'Bu dönem için e-defteri olan mükellef bulunamadı'}</td></tr>
                  ) : edRows.map(({ c, b }) => {
                    const k = edKey({ c, b })
                    const st = c.beyanDurumlari?.[k] || 'yapilmadi'
                    const beyanObj = { id: `${c.id}_edefter`, type: 'edefter', label: 'e-Defter', belongYear: b.belongYear, belongMonths: b.belongMonths }
                    return (
                      <tr key={c.id} className="border-t border-blue-700/20 hover:bg-blue-800/10 transition-colors">
                        <td className="px-3 py-2 whitespace-nowrap text-white font-medium text-xs" title={c.name}>{kisaAd(c.name)}</td>
                        <td className="px-2 py-2 text-center text-xs whitespace-nowrap">
                          <span className={c.type === 'individual' ? 'text-yellow-300' : 'text-blue-300'}>{c.type === 'individual' ? 'Şahıs' : 'Şirket'}</span>
                        </td>
                        <td className="px-2 py-2 text-center text-xs text-gray-300 whitespace-nowrap">{b.aitAy || '-'}</td>
                        <td className="px-2 py-2 text-center text-xs text-yellow-300 whitespace-nowrap">{b.deadline || '-'}</td>
                        <td className="px-2 py-2">
                          <div className="flex flex-wrap justify-center gap-1">
                            {edDurumlar.map(d => (
                              <button key={d.v} onClick={() => updateBeyanStatus(c.id, beyanObj, d.v)}
                                className={`px-1.5 py-0.5 rounded-md border text-[10px] font-bold [text-shadow:0_1px_2px_rgba(0,0,0,0.45)] transition-all hover:brightness-110 active:translate-y-[2px] ${st === d.v ? d.cls : 'bg-blue-900/30 border-blue-700/40 text-gray-500 hover:text-white'}`}>
                                {d.label}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex flex-col items-center gap-1">
                            <label className="cursor-pointer bg-blue-800/40 hover:bg-blue-800/60 border border-blue-700/40 rounded px-2 py-1 text-[10px] text-white font-medium transition-colors whitespace-nowrap">
                              📓 Berat Yükle
                              <input type="file" accept=".pdf,.png,.jpg,.jpeg,.zip" className="hidden"
                                onChange={async e => {
                                  const file = e.target.files?.[0]
                                  if (!file) return
                                  await handleDocumentUpload(c.id, beyanObj, 'beyanname', file)
                                  updateBeyanStatus(c.id, beyanObj, 'yuklendi')
                                }} />
                            </label>
                            {(() => {
                              const bl = getBeyanList(c.beyanDurumlari || {}, k)
                              if (bl.length === 0) return null
                              return (
                                <div className="space-y-0.5">
                                  {bl.map((bf, i) => (
                                    <div key={i} className="flex items-center gap-1 text-[10px]">
                                      <a href={bf.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Dosya #{i + 1}</a>
                                      <button onClick={() => handleDeleteBeyan(c.id, beyanObj, bf.url)} className="text-red-400 hover:text-red-300"><Trash2 className="w-3 h-3" /></button>
                                    </div>
                                  ))}
                                </div>
                              )
                            })()}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-gray-500 text-xs px-4 py-2">Sadece e-defteri olan mükellefler listelenir. Yükleme yapıldığında durum otomatik "Yüklendi" olur. Birden fazla berat yüklenebilir.</p>
          </div>
        )
      })()}

      {viewMode === 'table' && (
      <>
      {/* Tablo */}
      <div className="bg-blue-800/20 rounded-2xl border border-blue-700/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-blue-900/30 sticky top-0">
              <tr className="text-left text-gray-400 text-sm">
                <th className="px-4 py-3 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('name')}>
                  Musteri {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-3 text-center cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('total')}>
                  Toplam {sortField === 'total' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-3 text-center cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('completed')}>
                  Yapildi {sortField === 'completed' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-3 text-center cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('rate')}>
                  Tamamlanma {sortField === 'rate' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-3 text-center">Beyan Durumlari</th>
                <th className="px-4 py-3 text-center">Islem</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-8 text-gray-400">
                    {loading ? 'Yükleniyor...' : 'Filtrelere uygun müşteri bulunamadı'}
                  </td>
                </tr>
              ) : (
                paginatedData.map((client, index) => (
                  <tr key={client.id} className={`border-t border-blue-700/30 hover:bg-blue-800/20 transition-colors ${index % 2 === 0 ? 'bg-blue-800/10' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${client.type === 'company' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'}`}>
                          {client.name?.charAt(0) || '?'}
                        </div>
                        <span className="text-white text-sm font-medium" title={client.name}>{kisaAd(client.name)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-300 text-sm">{client.summary?.total || 0}</td>
                    <td className="px-4 py-3 text-center text-green-400 text-sm">{client.summary?.yapildi || 0}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <div className="w-16 h-1.5 bg-blue-900/50 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${(client.summary?.completionRate || 0) >= 80 ? 'bg-green-400' : (client.summary?.completionRate || 0) >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`} style={{ width: `${client.summary?.completionRate || 0}%` }} />
                        </div>
                        <span className={`text-xs font-medium ${(client.summary?.completionRate || 0) >= 80 ? 'text-green-400' : (client.summary?.completionRate || 0) >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                          %{client.summary?.completionRate || 0}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-wrap justify-center gap-1">
                        {client.beyanlar?.map((b, i) => {
                          const isDone = ['yapildi','onaylandi','tahakkuk_gonderildi'].includes(b.status)
                          return (
                            <div key={i} className="relative group">
                              <div className={`w-4 h-4 rounded-full cursor-pointer border ${isDone ? 'bg-green-400 border-green-500' : 'bg-red-400 border-red-500'}`} />
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg border border-gray-700">
                                <div className="font-semibold">{b.label}</div>
                                <div className={isDone ? 'text-green-400' : 'text-red-400'}>{getStatusLabel(b.status)}</div>
                                <div className="text-gray-400">Son: {b.deadline}</div>
                                {b.paymentDeadline && (
                                  <div className="text-gray-400">Ödeme: {b.paymentDeadline}</div>
                                )}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-700"></div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => openDetailModal(client)} className="text-gray-400 hover:text-yellow-400 transition-colors p-1.5 rounded-lg hover:bg-yellow-500/10" title="Detay">
                        <Eye className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sayfalama */}
      {filteredData.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between mt-6 gap-4">
          <div className="text-gray-400 text-sm">
            Toplam {filteredData.length} müşteri, {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filteredData.length)} gösteriliyor
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-3 py-1 rounded-lg bg-blue-800/30 text-gray-400 hover:text-white disabled:opacity-50 transition-colors">
              İlk
            </button>
            <button onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage === 1} className="px-3 py-1 rounded-lg bg-blue-800/30 text-gray-400 hover:text-white disabled:opacity-50 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-white text-sm">{currentPage} / {totalPages}</span>
            <button onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage === totalPages} className="px-3 py-1 rounded-lg bg-blue-800/30 text-gray-400 hover:text-white disabled:opacity-50 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-3 py-1 rounded-lg bg-blue-800/30 text-gray-400 hover:text-white disabled:opacity-50 transition-colors">
              Son
            </button>
          </div>
        </div>
      )}
      </>
      )}

      {/* Detay Modal */}
      {showDetailModal && selectedClient && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2">
          <div className="bg-blue-950 rounded-2xl w-full max-w-[96vw] max-h-[96vh] overflow-y-auto border border-blue-700/50 shadow-2xl">
            <div className="sticky top-0 bg-blue-950 border-b border-blue-700/50 p-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">{selectedClient.name}</h2>
                <p className="text-gray-400 text-sm">
                  {selectedClient.type === 'company' ? `🏢 ${selectedClient.company || 'Şirket'} · VKN: ${selectedClient.vkn}` : `👤 Bireysel · TC: ${selectedClient.tc}`}
                </p>
              </div>
              <button onClick={closeDetailModal} className="text-gray-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-blue-800/30">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
                  <div className="text-2xl font-bold text-white">{selectedClient.beyanlar?.length || 0}</div>
                  <div className="text-gray-400 text-xs">Toplam Beyan</div>
                </div>
                <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
                  <div className="text-2xl font-bold text-green-400">{selectedClient.summary?.yapildi || 0}</div>
                  <div className="text-gray-400 text-xs">Yapıldı</div>
                </div>
                <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
                  <div className="text-2xl font-bold text-green-400">{selectedClient.summary?.onaylandi || 0}</div>
                  <div className="text-gray-400 text-xs">Onaylandı</div>
                </div>
                <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
                  <div className="text-2xl font-bold text-purple-400">{selectedClient.summary?.tahakkukGonderildi || 0}</div>
                  <div className="text-gray-400 text-xs">Tahakkuk Gönderildi</div>
                </div>
              </div>

              <div className="bg-blue-800/20 rounded-xl border border-blue-700/30 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-blue-900/30">
                      <tr className="text-left text-gray-400 text-xs">
                        <th className="px-4 py-3">Beyan</th>
                        <th className="px-4 py-3">Ait Ay</th>
                        <th className="px-4 py-3">Son Tarih</th>
                        <th className="px-4 py-3">Tutar</th>
                        <th className="px-4 py-3">Personel</th>
                        <th className="px-4 py-3">Durum</th>
                        <th className="px-4 py-3">Gonderim</th>
                        <th className="px-4 py-3">Beyanname</th>
                        <th className="px-4 py-3">Tahakkuk</th>
                        <th className="px-4 py-3">İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedClient.beyanlar?.map((beyan) => (
                        <tr key={beyan.id} className="border-t border-blue-700/30 hover:bg-blue-800/20 transition-colors">
                          <td className="px-4 py-3 text-white text-sm">
                            {beyan.icon} {beyan.label}
                            {beyan.type === 'gecici_vergi' && <span className="ml-1 text-[10px] text-yellow-400">(3 Aylık)</span>}
                            {beyan.type === 'muhtasar_3aylik' && <span className="ml-1 text-[10px] text-yellow-400">(3 Aylık)</span>}
                            {beyan.type === 'kurumlar_vergi' && <span className="ml-1 text-[10px] text-blue-400">(Yıllık)</span>}
                            {beyan.type === 'gelir_vergi' && <span className="ml-1 text-[10px] text-blue-400">(Yıllık)</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs">{beyan.aitAy}</td>
                          <td className="px-4 py-3 text-gray-300 text-sm">{beyan.deadline}</td>
                          <td className="px-4 py-3 text-gray-300 text-sm">
                            {beyan.amount > 0 
                              ? `${beyan.amount.toFixed(2)} ₺` 
                              : beyan.tahakkukUrl 
                                ? (beyan.analizDurumu === 'analiz_ediliyor' 
                                    ? 'AI Analiz Ediyor...' 
                                    : beyan.analizDurumu === 'basarisiz' 
                                      ? `Analiz Başarısız: ${beyan.analizHata || 'Bilinmeyen hata'}` 
                                      : 'Tahakkuk Hazır')
                                : '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-sm">{beyan.personnel}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getStatusColor(beyan.status)} flex items-center space-x-1`}>
                              {getStatusIcon(beyan.status)}
                              <span>{getStatusLabel(beyan.status)}</span>
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {beyan.type === 'edefter' ? (
                              <span className="text-gray-500 text-xs">—</span>
                            ) : (() => {
                              const baseKey = `${beyan.belongYear}_${beyan.belongMonths[0]}_${beyan.type}`
                              const durumlar = selectedClient.beyanDurumlari || {}
                              const beyanSent = durumlar[`${baseKey}_beyanname_gonderildi`]
                              const tahakkukSent = durumlar[`${baseKey}_tahakkuk_gonderildi`]
                              const beyanChannel = durumlar[`${baseKey}_beyanname_gonderim_kanali`]
                              const tahakkukChannel = durumlar[`${baseKey}_tahakkuk_gonderim_kanali`]
                              return (
                                <div className="flex flex-col gap-1 text-[10px]">
                                  {beyanSent ? (
                                    <span className={`flex items-center gap-1 ${beyanChannel === 'whatsapp' ? 'text-green-400' : 'text-blue-400'}`}>
                                      <CheckCircle className="w-3 h-3" />
                                      Bey: {beyanChannel === 'whatsapp' ? 'WA' : 'Mail'}
                                    </span>
                                  ) : (
                                    <span className="text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3" /> Bey: Bekliyor</span>
                                  )}
                                  {tahakkukSent ? (
                                    <span className={`flex items-center gap-1 ${tahakkukChannel === 'whatsapp' ? 'text-green-400' : 'text-blue-400'}`}>
                                      <CheckCircle className="w-3 h-3" />
                                      Tah: {tahakkukChannel === 'whatsapp' ? 'WA' : 'Mail'}
                                    </span>
                                  ) : (
                                    <span className="text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3" /> Tah: Bekliyor</span>
                                  )}
                                </div>
                              )
                            })()}
                          </td>
                          <td className="px-4 py-3">
                            {beyan.type === 'edefter' ? (
                              <span className="text-gray-500 text-xs">—</span>
                            ) : beyan.type === 'sgk' ? (
                                <button
                                  onClick={() => openSgkModal(selectedClient, beyan)}
                                  className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1 bg-blue-500/10 hover:bg-blue-500/20 px-2 py-1 rounded-lg"
                                  title="SGK evraklarini yonet"
                                >
                                  <FileText className="w-4 h-4" />
                                  <span>Evraklar ({(selectedClient.beyanDurumlari?.[`${beyan.belongYear}_${beyan.belongMonths[0]}_${beyan.type}_documents`] || []).length})</span>
                                </button>
                              ) : (() => {
                                const baseKey = `${beyan.belongYear}_${beyan.belongMonths[0]}_${beyan.type}`
                                const beyanList = getBeyanList(selectedClient.beyanDurumlari, baseKey)
                                return (
                                  <div className="flex flex-col gap-2 min-w-[190px]">
                                    {beyanList.map((b, idx) => (
                                      <div key={b.url} className="flex items-center justify-between gap-2 bg-blue-500/10 border border-blue-500/30 rounded-xl px-3 py-2">
                                        <a href={b.url} target="_blank" rel="noreferrer" className="text-blue-300 hover:text-blue-200 text-xs flex items-center gap-2 min-w-0" title={b.name || `Beyanname ${idx + 1}`}>
                                          <FileText className="w-5 h-5 shrink-0" />
                                          <span className="truncate">Beyanname {idx + 1}</span>
                                        </a>
                                        <button
                                          onClick={() => handleDeleteBeyan(selectedClient.id, beyan, b.url)}
                                          className="text-red-400 hover:text-red-300 p-1.5 rounded-lg hover:bg-red-500/20 shrink-0"
                                          title="Beyannameyi sil"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    ))}
                                    <label className="cursor-pointer flex items-center justify-center gap-2 border-2 border-dashed border-blue-500/40 hover:border-blue-400 hover:bg-blue-500/10 text-blue-300 rounded-xl px-3 py-2.5 transition-colors text-xs font-medium" title="Beyanname yukle">
                                      <Upload className="w-5 h-5" />
                                      <span>{beyanList.length > 0 ? 'Yeni Beyanname Ekle' : 'Beyanname Yukle'}</span>
                                      <input
                                        type="file"
                                        accept="application/pdf"
                                        className="hidden"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0]
                                          if (file) handleDocumentUpload(selectedClient.id, beyan, 'beyanname', file)
                                          e.target.value = ''
                                        }}
                                      />
                                    </label>
                                  </div>
                                )
                              })()
                            }
                          </td>
                          <td className="px-4 py-3">
                            {beyan.type === 'edefter' ? (
                              <span className="text-gray-500 text-xs">—</span>
                            ) : (() => {
                              const baseKey = `${beyan.belongYear}_${beyan.belongMonths[0]}_${beyan.type}`
                              const tahakkukList = getTahakkukList(selectedClient.beyanDurumlari, baseKey)
                              const toplam = sumTahakkukTutar(tahakkukList)
                              return (
                                <div className="flex flex-col gap-2 min-w-[200px]">
                                  {tahakkukList.map((t, idx) => (
                                    <div key={t.url} className="flex items-center justify-between gap-2 bg-purple-500/10 border border-purple-500/30 rounded-xl px-3 py-2">
                                      <a href={t.url} target="_blank" rel="noreferrer" className="text-purple-300 hover:text-purple-200 text-xs flex items-center gap-2 min-w-0" title={t.name || `Tahakkuk ${idx + 1}`}>
                                        <FileText className="w-5 h-5 shrink-0" />
                                        <span className="truncate">Tahakkuk {idx + 1}</span>
                                        <span className="text-green-400 font-semibold shrink-0 text-[11px]">
                                          {Number(t.tutar) > 0
                                            ? `${Number(t.tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`
                                            : t.analiz_durumu === 'analiz_ediliyor'
                                              ? 'Analiz...'
                                              : ''}
                                        </span>
                                      </a>
                                      <div className="flex items-center shrink-0">
                                        <button
                                          onClick={() => handleEditTahakkukTutar(selectedClient.id, beyan, t.url, t.tutar)}
                                          className="text-amber-400 hover:text-amber-300 p-1.5 rounded-lg hover:bg-amber-500/20"
                                          title="Tutari duzelt"
                                        >
                                          <Pencil className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => handleReanalyzeTahakkuk(selectedClient.id, beyan, t.url)}
                                          className="text-cyan-400 hover:text-cyan-300 p-1.5 rounded-lg hover:bg-cyan-500/20"
                                          title="Tekrar analiz et"
                                        >
                                          <RefreshCw className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => beyan.type === 'sgk'
                                            ? handleDeleteSgkDoc({ url: t.url, name: t.name, category: 'sigorta_tahakkuk' }, baseKey)
                                            : handleDeleteTahakkuk(selectedClient.id, beyan, t.url)}
                                          className="text-red-400 hover:text-red-300 p-1.5 rounded-lg hover:bg-red-500/20"
                                          title="Tahakkuku sil"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                  {tahakkukList.length > 1 && toplam > 0 && (
                                    <div className="text-right text-green-400 text-xs font-bold px-1">
                                      Toplam: {toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                                    </div>
                                  )}
                                  <label className="cursor-pointer flex items-center justify-center gap-2 border-2 border-dashed border-purple-500/40 hover:border-purple-400 hover:bg-purple-500/10 text-purple-300 rounded-xl px-3 py-2.5 transition-colors text-xs font-medium" title="Tahakkuk yukle">
                                    <Upload className="w-5 h-5" />
                                    <span>{tahakkukList.length > 0 ? 'Yeni Tahakkuk Ekle' : 'Tahakkuk Yukle'}</span>
                                    <input
                                      type="file"
                                      accept="application/pdf"
                                      className="hidden"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (file) {
                                          if (beyan.type === 'sgk') {
                                            uploadSgkDocument(selectedClient.id, beyan, file, 'sigorta_tahakkuk', file.name, e)
                                          } else {
                                            handleDocumentUpload(selectedClient.id, beyan, 'tahakkuk', file)
                                          }
                                        }
                                        e.target.value = ''
                                      }}
                                    />
                                  </label>
                                </div>
                              )
                            })()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex space-x-1">
                              <button onClick={() => updateBeyanStatus(selectedClient.id, beyan, 'yapilamadi')} className={`p-1 rounded-lg transition-colors ${beyan.status === 'yapilamadi' ? 'bg-red-500/20 text-red-400' : 'text-gray-500 hover:text-red-400'}`} title="Yapilmadi">
                                <AlertTriangle className="w-4 h-4" />
                              </button>
                              <button onClick={() => updateBeyanStatus(selectedClient.id, beyan, 'hazir')} className={`p-1 rounded-lg transition-colors ${beyan.status === 'hazir' ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-500 hover:text-yellow-400'}`} title="Hazir">
                                <Clock className="w-4 h-4" />
                              </button>
                              <button onClick={() => updateBeyanStatus(selectedClient.id, beyan, 'onaylandi')} className={`p-1 rounded-lg transition-colors ${beyan.status === 'onaylandi' ? 'bg-green-500/20 text-green-400' : 'text-gray-500 hover:text-green-400'}`} title="Onaylandi">
                                <FileCheck className="w-4 h-4" />
                              </button>
                              {beyan.type !== 'edefter' && (
                                <button onClick={() => updateBeyanStatus(selectedClient.id, beyan, 'tahakkuk_gonderildi')} className={`p-1 rounded-lg transition-colors ${beyan.status === 'tahakkuk_gonderildi' ? 'bg-purple-500/20 text-purple-400' : 'text-gray-500 hover:text-purple-400'}`} title="Tahakkuk Gonderildi">
                                  <Send className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end mt-6">
                <button onClick={handleCloseModal} className="bg-blue-700/50 hover:bg-blue-600/50 text-white px-6 py-2 rounded-lg font-semibold transition-all duration-300">
                  Kaydet ve Kapat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {documentPanelClient && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-blue-700/50 bg-blue-950 p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">{documentPanelClient.name}</h2>
                <p className="text-sm text-gray-400">Beyan dönemi evrakları</p>
              </div>
              <button onClick={() => setDocumentPanelClient(null)} className="rounded-lg p-2 text-gray-400 hover:bg-blue-800/30 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <TahakkukEvrakPaneli documents={getClientDocuments(documentPanelClient)} />
          </div>
        </div>
      )}
      {/* SGK Evrak Modal */}
      {showSgkModal && sgkBeyan && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-blue-950 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-blue-700/50 shadow-2xl">
            <div className="sticky top-0 bg-blue-950 border-b border-blue-700/50 p-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">
                  {sgkBeyan.beyan.belongYear} {months[sgkBeyan.beyan.belongMonths[0]]} SGK Evraklari
                </h2>
                <p className="text-gray-400 text-sm">Sigorta tahakkuk, hizmet listesi, bordro vb. evraklari yukleyin.</p>
              </div>
              <button onClick={closeSgkModal} className="text-gray-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-blue-800/30">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Yeni evrak yukle */}
              <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
                <h3 className="text-white font-medium mb-4">Yeni Evrak Yukle</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { id: 'sigorta_tahakkuk', label: 'Sigorta Tahakkuk' },
                    { id: 'hizmet_listesi', label: 'Hizmet Listesi' },
                    { id: 'bordro', label: 'Bordro' }
                  ].map(cat => (
                    <div key={cat.id} className="relative">
                      <label className="block text-gray-400 text-sm mb-1">{cat.label}</label>
                      <label className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed cursor-pointer transition-all ${
                        sgkUploadLoading ? 'opacity-50 cursor-not-allowed border-gray-600 bg-blue-900/10' : 'border-blue-700/50 hover:border-yellow-500/50 hover:bg-blue-900/30'
                      }`}>
                        <Upload className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-300 text-sm">{sgkUploadLoading ? 'Yukleniyor...' : cat.id === 'bordro' ? 'PDF / Excel Sec' : 'PDF Sec'}</span>
                        <input
                          type="file"
                          accept={cat.id === 'bordro' ? '.pdf,.xlsx,.xls' : 'application/pdf'}
                          disabled={sgkUploadLoading}
                          className="hidden"
                          onChange={(e) => handleSgkDocumentUpload(e, cat.id, cat.label)}
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mevcut evraklar */}
              <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
                <h3 className="text-white font-medium mb-4">Yuklenen Evraklar ({sgkDocs.length})</h3>
                {sgkDocs.length === 0 ? (
                  <p className="text-gray-400 text-sm">Henuz evrak yuklenmemis.</p>
                ) : (
                  <div className="space-y-2">
                    {sgkDocs.map((doc, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-blue-950/50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-yellow-500" />
                          <div>
                            <p className="text-white text-sm">{doc.name}</p>
             <p className="text-gray-400 text-xs">{doc.category} · {doc.size} · {doc.uploaded_at ? formatDateTimeTR(doc.uploaded_at) : ''}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {doc.url && (
                            <>
                              <a href={doc.url} target="_blank" rel="noreferrer" className="p-1.5 bg-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/30" title="Goruntule">
                                <Eye className="w-4 h-4" />
                              </a>
                              <a href={doc.url} download className="p-1.5 bg-green-500/20 rounded-lg text-green-400 hover:bg-green-500/30" title="Indir">
                                <Download className="w-4 h-4" />
                              </a>
                            </>
                          )}
                          <button onClick={() => handleSgkDocDelete(idx)} className="p-1.5 bg-red-500/20 rounded-lg text-red-400 hover:bg-red-500/30" title="Sil">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gecici bildirim — MUBiS asistan karakterinin USTUNDE (bottom-44/32),
          z-[80] ile her zaman on planda */}
      {bildiri && (
        <div className={`fixed bottom-44 md:bottom-32 right-5 z-[80] max-w-sm rounded-xl border shadow-2xl px-4 py-3 text-sm font-medium animate-pulse-once ${bildiri.tur === 'error' ? 'bg-red-900/95 border-red-500/60 text-red-100' : bildiri.tur === 'info' ? 'bg-blue-900/95 border-blue-500/60 text-blue-100' : 'bg-green-900/95 border-green-500/60 text-green-100'}`}>
          <div className="flex items-start gap-2">
            <span className="mt-0.5">{bildiri.tur === 'error' ? <AlertTriangle className="w-4 h-4" /> : bildiri.tur === 'info' ? <Clock className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}</span>
            <span className="flex-1">{bildiri.mesaj}</span>
            <button onClick={() => setBildiri(null)} className="opacity-60 hover:opacity-100 ml-1 text-xs font-bold">✕</button>
          </div>
        </div>
      )}
    </div>
  )
}