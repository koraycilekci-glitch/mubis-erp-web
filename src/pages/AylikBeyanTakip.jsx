import { useState, useEffect, useCallback } from 'react'
import { useClients } from '../hooks/useClients'
import { supabase } from '../lib/supabase'
import * as clientService from '../services/clientService'
import * as XLSX from 'xlsx'
import {
  Calendar, Search, Eye,
  CheckCircle, Clock, AlertTriangle, X,
  ChevronLeft, ChevronRight, RefreshCw,
  FileText, FileSpreadsheet, List,
  Send, FileCheck, Upload, Trash2, Download, Pencil
} from 'lucide-react'
import { 
  getFormattedBeyanDeadline,
  getMonthName,
  isResmiTatil
} from '../utils/dateUtils'

import { useAuth } from '../context/AuthContext'
import { saveTahakkukAmount } from '../services/tahakkukService'
import { analyzeDocument, saveDocumentAnalysis } from '../services/documentIntelligenceEngine'
import { createNotification } from '../services/notificationService'
import { uploadClientDocument, uploadClientBulkDocument } from '../services/documentService'
import { getTahakkukList, getBeyanList, sumTahakkukTutar } from '../utils/tahakkukUtils'

export default function AylikBeyanTakip() {
  const { clients: allClients } = useClients()
  const { user, profile } = useAuth()
  const [loading, setLoading] = useState(false)
  const [clients, setClients] = useState([])
  const [filteredData, setFilteredData] = useState([])
  const [selectedClient, setSelectedClient] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
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
  
  const [selectedBeyan, setSelectedBeyan] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState('table')
  
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(50)
  
  const [sortField, setSortField] = useState('name')
  const [sortDirection, setSortDirection] = useState('asc')

  const months = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
  ]

  const beyanTipleri = [
    { id: 'all', label: 'Tüm Beyanlar', icon: '📋' },
    { id: 'kdv', label: 'KDV', icon: '📄' },
    { id: 'kdv2', label: 'KDV2', icon: '📄' },
    { id: 'muhtasar', label: 'Muhtasar', icon: '📄' },
    { id: 'sgk', label: 'SGK', icon: '🏥' },
    { id: 'gecici_vergi', label: 'Geçici Vergi', icon: '📊' },
    { id: 'kurumlar_vergi', label: 'Kurumlar Vergisi', icon: '🏢' },
    { id: 'gelir_vergi', label: 'Gelir Vergisi', icon: '👤' },
    { id: 'edefter', label: 'e-Defter', icon: '📓' },
    { id: 'muhtasar_3aylik', label: 'Muhtasar (3 Aylık)', icon: '📄' },
  ]

  const statusOptions = [
    { id: 'all', label: 'Tüm Durumlar', color: 'gray' },
    { id: 'yapildi', label: 'Yapıldı', color: 'green' },
    { id: 'yapilamadi', label: 'Yapılmadı', color: 'red' },
    { id: 'onaylandi', label: 'Onaylandı', color: 'blue' },
    { id: 'onaylanmadi', label: 'Onaylanmadı', color: 'yellow' },
    { id: 'tahakkuk_gonderildi', label: 'Tahakkuk Gönderildi', color: 'purple' },
    { id: 'tahakkuk_gonderilmedi', label: 'Tahakkuk Gönderilmedi', color: 'orange' },
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

    const data = freshClients.map(client => {
      const beyanlar = generateMonthlyBeyanlar(client)
      return {
        ...client,
        beyanlar: beyanlar,
        summary: getBeyanSummary(beyanlar)
      }
    })

    setClients(data)
    applyFilters(data)
    setLoading(false)
  }, [selectedYear, selectedMonth, selectedBeyan, selectedStatus, searchTerm])

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

    const addResult = (id, label, icon, belongMonths, belongYear, deadline, verilmeAyLabel) => {
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

    // SGK - ait oldugu ayin son gunu (sadece resmi tatil kontrolu, hafta sonu erteleme yok)
    if (checkProfile('sgk', M).active) {
      const sgkDeadline = new Date(Y, M + 1, 0) // Ayin son gunu
      let finalDate = sgkDeadline
      
      // Sadece resmi tatil kontrolu (hafta sonu erteleme yok)
      while (isResmiTatil(finalDate)) {
        finalDate.setDate(finalDate.getDate() + 1)
      }
      
      addResult('sgk', 'SGK', '🏥', [M], Y,
        `${finalDate.getFullYear()}-${String(finalDate.getMonth() + 1).padStart(2, '0')}-${String(finalDate.getDate()).padStart(2, '0')}`,
        `${getMonthName(M)} ${Y}`)
    }

    // Muhtasar (Aylik) - sonraki ayin 26'si
    const muhtCheck = checkProfile('muhtasar', M)
    if (muhtCheck.active && muhtCheck.period === 'aylik') {
      addResult('muhtasar', 'Muhtasar', '📄', [M], Y,
        getFormattedBeyanDeadline(filingY, filingM, 26),
        `${getMonthName(filingM)} ${filingY}`)
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
          `${getMonthName(filingM)} ${filingY}`)
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
    if (client.edefter) {
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
    const tahakkukGonderildi = beyanlar.filter(b => b.status === 'tahakkuk_gonderildi').length
    
    return {
      total,
      yapildi,
      onaylandi,
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
      filtered = filtered.map(c => ({
        ...c,
        beyanlar: c.beyanlar?.filter(b => b.status === selectedStatus) || []
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
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
      }
      return sortDirection === 'asc' ? valA - valB : valB - valA
    })
    
    setFilteredData(filtered)
    setCurrentPage(1)
  }, [searchTerm, selectedBeyan, selectedStatus, sortField, sortDirection])

  useEffect(() => {
    loadData()
  }, [selectedYear, selectedMonth, selectedBeyan, selectedStatus, searchTerm, loadData])

  const openDetailModal = (client) => {
    setSelectedClient(client)
    setShowDetailModal(true)
  }

  const closeDetailModal = () => {
    setShowDetailModal(false)
    setSelectedClient(null)
  }

  const updateBeyanStatus = async (clientId, beyan, newStatus) => {
    // Dogru key: generateMonthlyBeyanlar ile ayni format
    const key = `${beyan.belongYear}_${beyan.belongMonths[0]}_${beyan.type}`

    // Mevcut durumlari koru
    const client = clients.find(c => c.id === clientId)
    const currentMap = client?.beyanDurumlari || {}
    const personelAdi = profile?.name || user?.email || 'Admin'
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
            ? { ...b, status: newStatus, updatedAt: new Date().toLocaleString('tr-TR') }
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
          ? { ...b, status: newStatus, updatedAt: new Date().toLocaleString('tr-TR') }
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
  }

  const handleDocumentUpload = async (clientId, beyan, documentType, file) => {
    if (!file) return
    const client = clients.find(c => c.id === clientId)
    if (!client) return

    try {
      const { url } = await uploadClientDocument({
        client,
        year: beyan.belongYear,
        month: beyan.belongMonths[0],
        beyanType: beyan.type,
        documentType,
        file
      })

      const urlKey = documentType === 'tahakkuk'
        ? `${beyan.belongYear}_${beyan.belongMonths[0]}_${beyan.type}_tahakkuk_url`
        : `${beyan.belongYear}_${beyan.belongMonths[0]}_${beyan.type}_beyan_url`

      // Her yuklemede benzersiz versiyon etiketi ekle.
      // Boylece cache'ler (client, sunucu, CDN) eski dosyayi/sonucu dondurmez
      // ve tahakkuk degistiginde analiz otomatik tekrar tetiklenir.
      const versionedUrl = `${url}?v=${Date.now()}`

      // En guncel DB kaydini oku; stale state ile mevcut dosyalari ezme
      const { data: latestRow, error: readErr } = await supabase
        .from('clients')
        .select('beyan_durumlari')
        .eq('id', clientId)
        .single()
      if (readErr) throw readErr

      const currentMap = latestRow?.beyan_durumlari || {}
      const updatedMap = { ...currentMap, [urlKey]: versionedUrl }

      const baseKeyUpload = `${beyan.belongYear}_${beyan.belongMonths[0]}_${beyan.type}`

      // Coklu tahakkuk: yeni dosyayi listeye ekle
      if (documentType === 'tahakkuk') {
        const listKey = `${baseKeyUpload}_tahakkuklar`
        const currentList = getTahakkukList(currentMap, baseKeyUpload)
        updatedMap[listKey] = [
          ...currentList,
          {
            url: versionedUrl,
            name: file.name || 'tahakkuk.pdf',
            uploadedAt: new Date().toISOString(),
            tutar: 0,
            analiz_durumu: 'analiz_ediliyor'
          }
        ]
      }

      // Coklu beyanname: yeni dosyayi listeye ekle
      if (documentType === 'beyanname') {
        const listKey = `${baseKeyUpload}_beyanlar`
        const currentList = getBeyanList(currentMap, baseKeyUpload)
        updatedMap[listKey] = [
          ...currentList,
          {
            url: versionedUrl,
            name: file.name || 'beyanname.pdf',
            uploadedAt: new Date().toISOString()
          }
        ]
      }

      // Eger tahakkuk ise, AI analizi baslat
      if (documentType === 'tahakkuk') {
        const statusKey = `${beyan.belongYear}_${beyan.belongMonths[0]}_${beyan.type}`
        updatedMap[`${statusKey}_analiz_durumu`] = 'analiz_ediliyor'
        
        // Hemen kaydet ve UI guncelle
        await supabase
          .from('clients')
          .update({ beyan_durumlari: updatedMap })
          .eq('id', clientId)

        // UI'i hemen guncelle
        const updatedClients = clients.map(c =>
          c.id === clientId ? { ...c, beyanDurumlari: updatedMap } : c
        )
        setClients(updatedClients)
        if (selectedClient && selectedClient.id === clientId) {
          setSelectedClient({ ...selectedClient, beyanDurumlari: updatedMap })
        }
        applyFilters(updatedClients)

        // AI analizini arka planda baslat (await etme)
        // versionedUrl kullan ki cache eski sonucu dondurmesin
        analyzeTahakkukAsync(clientId, beyan, versionedUrl, updatedMap).catch(err => {
          console.error('AI analiz asenkron hatasi:', err)
        })
      }

      if (documentType !== 'tahakkuk') {
        const { error } = await supabase
          .from('clients')
          .update({ beyan_durumlari: updatedMap })
          .eq('id', clientId)
        if (error) throw error

        const updatedClients = clients.map(c =>
          c.id === clientId ? { ...c, beyanDurumlari: updatedMap } : c
        )
        setClients(updatedClients)
        if (selectedClient && selectedClient.id === clientId) {
          setSelectedClient({ ...selectedClient, beyanDurumlari: updatedMap })
        }
        applyFilters(updatedClients)
      }
      
      alert(`${documentType === 'tahakkuk' ? 'Tahakkuk' : 'Beyanname'} dosyasi yuklendi.`)
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
        patch[`${statusKey}_son_odeme`] = beyan.deadline || result.due_date || ''
        // Hangi dosyanin analiz edildigini kaydet (dosya degisirse tekrar analiz tetiklenir)
        patch[`${statusKey}_analiz_url`] = url
        patch[`${statusKey}_vkn`] = result.vkn || ''
        patch[`${statusKey}_unvan`] = result.company || ''
        patch[`${statusKey}_vergi_asli`] = Number(result.tax_base || 0)

        // Coklu tahakkuk: bu dosyanin kendi tutarini listeye yaz, toplami hesapla
        const list = getTahakkukList(currentMap, statusKey).map(t =>
          t.url === url
            ? { ...t, tutar: Number(result.amount), analiz_durumu: 'tamamlandi', son_odeme: beyan.deadline || result.due_date || '', vergi_turu: result.tax_type || '' }
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
    const client = clients.find(c => c.id === clientId)
    if (!client) return

    const baseKey = `${beyan.belongYear}_${beyan.belongMonths[0]}_${beyan.type}`
    const currentMap = { ...(client.beyanDurumlari || {}) }
    const list = getTahakkukList(currentMap, baseKey).filter(t => t.url !== tahakkukUrl)
    const updatedMap = { ...currentMap, [`${baseKey}_tahakkuklar`]: list }
    updatedMap[`${baseKey}_tutar`] = sumTahakkukTutar(list)

    if (list.length > 0) {
      updatedMap[`${baseKey}_tahakkuk_url`] = list[list.length - 1].url
    } else {
      delete updatedMap[`${baseKey}_tahakkuk_url`]
      delete updatedMap[`${baseKey}_tutar`]
      delete updatedMap[`${baseKey}_analiz_durumu`]
      delete updatedMap[`${baseKey}_analiz_hata`]
      delete updatedMap[`${baseKey}_analiz_url`]
      delete updatedMap[`${baseKey}_vergi_turu`]
      delete updatedMap[`${baseKey}_son_odeme`]
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
      alert('Tahakkuk silinemedi: ' + (err.message || 'Bilinmeyen hata'))
    }
  }

  // Tek bir beyannameyi coklu listeden sil
  const handleDeleteBeyan = async (clientId, beyan, beyanUrl) => {
    if (!window.confirm('Bu beyannameyi silmek istediginize emin misiniz?')) return
    const client = clients.find(c => c.id === clientId)
    if (!client) return

    const baseKey = `${beyan.belongYear}_${beyan.belongMonths[0]}_${beyan.type}`
    const currentMap = { ...(client.beyanDurumlari || {}) }
    const list = getBeyanList(currentMap, baseKey).filter(b => b.url !== beyanUrl)
    const updatedMap = { ...currentMap, [`${baseKey}_beyanlar`]: list }

    if (list.length > 0) {
      updatedMap[`${baseKey}_beyan_url`] = list[list.length - 1].url
    } else {
      delete updatedMap[`${baseKey}_beyan_url`]
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
      alert('Beyanname silinemedi: ' + (err.message || 'Bilinmeyen hata'))
    }
  }

  // SGK tahakkukunu URL ile sil (tablodan cagrilir) - hem _documents hem _tahakkuklar'dan kaldirir
  const handleDeleteSgkDoc = async (doc, baseKey) => {
    if (!selectedClient) return
    if (!window.confirm('Bu tahakkuku silmek istediginize emin misiniz?')) return
    const docKey = `${baseKey}_documents`
    const currentMap = { ...(selectedClient.beyanDurumlari || {}) }
    const updatedList = (Array.isArray(currentMap[docKey]) ? currentMap[docKey] : []).filter(d => d.url !== doc.url)
    const updatedMap = { ...currentMap, [docKey]: updatedList }

    const listKey = `${baseKey}_tahakkuklar`
    const tahakkukList = getTahakkukList(currentMap, baseKey).filter(t => t.url !== doc.url)
    updatedMap[listKey] = tahakkukList
    updatedMap[`${baseKey}_tutar`] = sumTahakkukTutar(tahakkukList)
    if (tahakkukList.length > 0) {
      updatedMap[`${baseKey}_tahakkuk_url`] = tahakkukList[tahakkukList.length - 1].url
    } else {
      delete updatedMap[`${baseKey}_tahakkuk_url`]
      delete updatedMap[`${baseKey}_tutar`]
      delete updatedMap[`${baseKey}_analiz_durumu`]
      delete updatedMap[`${baseKey}_analiz_hata`]
      delete updatedMap[`${baseKey}_analiz_url`]
      delete updatedMap[`${baseKey}_vergi_turu`]
      delete updatedMap[`${baseKey}_son_odeme`]
    }

    try {
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

    // _tahakkuklar array'inde guncelle
    const listKey = `${baseKey}_tahakkuklar`
    const list = getTahakkukList(currentMap, baseKey).map(t =>
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
    const currentMap = { ...(client.beyanDurumlari || {}) }
    const listKey = `${baseKey}_tahakkuklar`
    const list = getTahakkukList(currentMap, baseKey).map(t =>
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
      // Coklu tahakkuk listesinden de kaldir
      const listKey = `${baseKey}_tahakkuklar`
      const tahakkukList = getTahakkukList(currentMap, baseKey).filter(t => t.url !== deleted.url)
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
      'yapilamadi': 'bg-red-500/20 text-red-400 border-red-500/30',
      'onaylandi': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'onaylanmadi': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      'tahakkuk_gonderildi': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      'tahakkuk_gonderilmedi': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    }
    return colors[status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }

  const getStatusIcon = (status) => {
    const icons = {
      'yapildi': <CheckCircle className="w-4 h-4" />,
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
    onaylandi: filteredData.reduce((sum, c) => sum + (c.summary?.onaylandi || 0), 0),
    tahakkuk: filteredData.reduce((sum, c) => sum + (c.summary?.tahakkukGonderildi || 0), 0),
  }

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
        <div className="flex space-x-2 mt-4 md:mt-0">
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

      {/* İstatistik Kartları */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-white">{totalStats.total}</div>
          <div className="text-gray-400 text-xs">Müşteri</div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-blue-400">{totalStats.totalBeyan}</div>
          <div className="text-gray-400 text-xs">Toplam Beyan</div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-green-400">{totalStats.yapildi}</div>
          <div className="text-gray-400 text-xs">Yapıldı</div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-blue-400">{totalStats.onaylandi}</div>
          <div className="text-gray-400 text-xs">Onaylandı</div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-purple-400">{totalStats.tahakkuk}</div>
          <div className="text-gray-400 text-xs">Tahakkuk Gönderildi</div>
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
            <select value={selectedBeyan} onChange={(e) => setSelectedBeyan(e.target.value)} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors">
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
              <button onClick={() => setViewMode('table')} className={`p-2 rounded-lg transition-all ${viewMode === 'table' ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-400 hover:text-white'}`}>
                <List className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

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
                        <span className="text-white text-sm font-medium">{client.name}</span>
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
                  <div className="text-2xl font-bold text-blue-400">{selectedClient.summary?.onaylandi || 0}</div>
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
                              <button onClick={() => updateBeyanStatus(selectedClient.id, beyan, 'yapildi')} className={`p-1 rounded-lg transition-colors ${beyan.status === 'yapildi' ? 'bg-green-500/20 text-green-400' : 'text-gray-500 hover:text-green-400'}`} title="Yapildi">
                                <CheckCircle className="w-4 h-4" />
                              </button>
                              <button onClick={() => updateBeyanStatus(selectedClient.id, beyan, 'onaylandi')} className={`p-1 rounded-lg transition-colors ${beyan.status === 'onaylandi' ? 'bg-blue-500/20 text-blue-400' : 'text-gray-500 hover:text-blue-400'}`} title="Onaylandi">
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
                            <p className="text-gray-400 text-xs">{doc.category} · {doc.size} · {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString('tr-TR') : ''}</p>
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
    </div>
  )
}