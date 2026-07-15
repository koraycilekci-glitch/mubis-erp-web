import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import * as XLSX from 'xlsx'
import {
  Calendar, Search, Eye,
  CheckCircle, Clock, AlertTriangle, X,
  ChevronLeft, ChevronRight, RefreshCw,
  FileText, FileSpreadsheet, List,
  Send, FileCheck
} from 'lucide-react'
import { 
  getFormattedBeyanDeadline,
  getMonthName 
} from '../utils/dateUtils'

export default function AylikBeyanTakip() {
  const { getClients } = useAuth()
  const [loading, setLoading] = useState(false)
  const [clients, setClients] = useState([])
  const [filteredData, setFilteredData] = useState([])
  const [selectedClient, setSelectedClient] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  
  const today = new Date()
  const [selectedYear, setSelectedYear] = useState(today.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth())
  
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

  useEffect(() => {
    loadData()
  }, [selectedYear, selectedMonth, selectedBeyan, selectedStatus, searchTerm])

  const loadData = useCallback(() => {
    setLoading(true)
    const allClients = getClients()
    
    const data = allClients.map(client => {
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
        status: client.beyanDurumlari?.[key] || 'yapilamadi',
        deadline,
        aitAy: `${aitLabel} ${belongYear}`,
        verildigiAy: verilmeAyLabel,
        amount: client.beyanDurumlari?.[`${key}_tutar`] || 0,
        tax: client.beyanDurumlari?.[`${key}_vergi`] || 0,
        tahakkukNo: client.beyanDurumlari?.[`${key}_tahakkuk`] || '',
        personnel: client.beyanDurumlari?.[`${key}_personel`] || '',
        updatedAt: client.beyanDurumlari?.[`${key}_tarih`] || '-'
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

    // SGK - sonraki ayin 26'si
    if (checkProfile('sgk', M).active) {
      addResult('sgk', 'SGK', '🏥', [M], Y,
        getFormattedBeyanDeadline(filingY, filingM, 26),
        `${getMonthName(filingM)} ${filingY}`)
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
    // Gecici vergi verilme ayi = ceyrek sonu + 2 ay
    // Secilen ay M icin filing ayi M+1, gecici vergi filing = qEnd+2
    // Yani gecici vergi gosterilecek ay: M = qEnd+1 → qEnd = M-1
    // M=3(Nisan) → Q1, M=6(Temmuz) → Q2, M=9(Ekim) → Q3, M=0(Ocak) → Q4
    const geciciDonems = {
      3: { donem: 1, qMonths: [0, 1, 2], yAdj: 0 },       // 1. Donem: Oca-Mar, verilme Mayis 17
      6: { donem: 2, qMonths: [3, 4, 5], yAdj: 0 },       // 2. Donem: Nis-Haz, verilme Agustos 17
      9: { donem: 3, qMonths: [6, 7, 8], yAdj: 0 },       // 3. Donem: Tem-Eyl, verilme Kasim 17
      0: { donem: 4, qMonths: [9, 10, 11], yAdj: -1 },    // 4. Donem: Eki-Ara (onceki yil), verilme Subat 17
    }
    if (geciciDonems[M]) {
      const gd = geciciDonems[M]
      const gdYear = Y + gd.yAdj
      // Gecici vergi verilme ayi: ceyrek sonu + 2 = (M-1) + 2 = M+1 = filingM
      // Ama aslinda gecici vergi icin filing = qEnd + 2 ay
      // Q1(Mart=2) → Mayis(4), Q2(Haz=5) → Agustos(7), Q3(Eyl=8) → Kasim(10), Q4(Ara=11) → Subat(1)
      const geciciFilingM = (gd.qMonths[2] + 2) % 12
      const geciciFilingY = gd.qMonths[2] >= 10 ? gdYear + 1 : gdYear
      if (checkProfile('gecici_vergi', gd.qMonths[0]).active) {
        addResult('gecici_vergi', `Geçici Vergi ${gd.donem}. Dönem`, '📊', gd.qMonths, gdYear,
          getFormattedBeyanDeadline(geciciFilingY, geciciFilingM, 17),
          `${getMonthName(geciciFilingM)} ${geciciFilingY}`)
      }
    }

    // ========== E-DEFTER ==========
    // e-Defter verilme suresi: ait oldugu aydan 4 ay sonra
    // Sahislar: ayin 10'u, Sirketler: ayin 14'u
    // Secilen ay M icin filing ayi M+1, edefter filing = edBelongM + 4
    // Yani edBelongM + 4 = M + 1 → edBelongM = M - 3
    if (client.edefter) {
      const edPeriod = profile.edefter?.[0]?.period || 'aylik'
      const edDeadlineDay = client.type === 'individual' ? 10 : 14
      const edTypeLabel = client.type === 'individual' ? 'Şahıs' : 'Şirket'

      if (edPeriod !== '3aylik' && edPeriod !== '3_aylik') {
        // AYLIK E-DEFTER: her ay gosterilir
        // Ait oldugu ay = M - 3 (cunku edBelong + 4 = filingM = M + 1)
        const edBelongM = (M + 9) % 12
        const edBelongY = M <= 2 ? Y - 1 : Y
        addResult('edefter', `e-Defter (${edTypeLabel})`, '📓', [edBelongM], edBelongY,
          getFormattedBeyanDeadline(filingY, filingM, edDeadlineDay),
          `${getMonthName(filingM)} ${filingY}`)
      } else {
        // 3 AYLIK E-DEFTER: ceyrek sonu + 4 ay = filingM
        // Ceyrek sonu = edBelongM = M - 3
        // Sadece M-3 ceyrek sonu ayi ise goster
        const edQEnd = (M + 9) % 12
        if (quarterEndMonths.includes(edQEnd)) {
          const edQStart = (edQEnd - 2 + 12) % 12
          const edQMonths = [edQStart, (edQStart + 1) % 12, edQEnd]
          const edQYear = M <= 2 ? Y - 1 : Y
          addResult('edefter', `e-Defter 3 Aylık (${edTypeLabel})`, '📓', edQMonths, edQYear,
            getFormattedBeyanDeadline(filingY, filingM, edDeadlineDay),
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

  const applyFilters = (data) => {
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
  }

  const openDetailModal = (client) => {
    setSelectedClient(client)
    setShowDetailModal(true)
  }

  const closeDetailModal = () => {
    setShowDetailModal(false)
    setSelectedClient(null)
  }

  const updateBeyanStatus = (clientId, beyanId, newStatus) => {
    setClients(prev => 
      prev.map(c => {
        if (c.id === clientId) {
          const updatedBeyanlar = c.beyanlar.map(b => 
            b.id === beyanId 
              ? { ...b, status: newStatus, updatedAt: new Date().toLocaleString('tr-TR') }
              : b
          )
          return { ...c, beyanlar: updatedBeyanlar, summary: getBeyanSummary(updatedBeyanlar) }
        }
        return c
      })
    )
    
    if (selectedClient && selectedClient.id === clientId) {
      const updatedBeyanlar = selectedClient.beyanlar.map(b => 
        b.id === beyanId 
          ? { ...b, status: newStatus, updatedAt: new Date().toLocaleString('tr-TR') }
          : b
      )
      setSelectedClient({ ...selectedClient, beyanlar: updatedBeyanlar, summary: getBeyanSummary(updatedBeyanlar) })
    }
    
    applyFilters(clients)
  }

  const goToToday = () => {
    const today = new Date()
    setSelectedYear(today.getFullYear())
    setSelectedMonth(today.getMonth())
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
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-blue-950 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-blue-700/50 shadow-2xl">
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
                          <td className="px-4 py-3 text-gray-300 text-sm">{beyan.amount.toFixed(2)} ₺</td>
                          <td className="px-4 py-3 text-gray-400 text-sm">{beyan.personnel}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getStatusColor(beyan.status)} flex items-center space-x-1`}>
                              {getStatusIcon(beyan.status)}
                              <span>{getStatusLabel(beyan.status)}</span>
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex space-x-1">
                              <button onClick={() => updateBeyanStatus(selectedClient.id, beyan.id, 'yapildi')} className={`p-1 rounded-lg transition-colors ${beyan.status === 'yapildi' ? 'bg-green-500/20 text-green-400' : 'text-gray-500 hover:text-green-400'}`} title="Yapıldı">
                                <CheckCircle className="w-4 h-4" />
                              </button>
                              <button onClick={() => updateBeyanStatus(selectedClient.id, beyan.id, 'onaylandi')} className={`p-1 rounded-lg transition-colors ${beyan.status === 'onaylandi' ? 'bg-blue-500/20 text-blue-400' : 'text-gray-500 hover:text-blue-400'}`} title="Onaylandı">
                                <FileCheck className="w-4 h-4" />
                              </button>
                              <button onClick={() => updateBeyanStatus(selectedClient.id, beyan.id, 'tahakkuk_gonderildi')} className={`p-1 rounded-lg transition-colors ${beyan.status === 'tahakkuk_gonderildi' ? 'bg-purple-500/20 text-purple-400' : 'text-gray-500 hover:text-purple-400'}`} title="Tahakkuk Gönderildi">
                                <Send className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end mt-6">
                <button onClick={closeDetailModal} className="bg-blue-700/50 hover:bg-blue-600/50 text-white px-6 py-2 rounded-lg font-semibold transition-all duration-300">
                  Kapat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}