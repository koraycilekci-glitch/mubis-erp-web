import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import { supabase } from '../lib/supabase'
import { Link, useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { bulkAddClients } from '../services/clientService'
import { 
  Plus, Search, Filter, MapPin,
  Trash2, X, Eye, ListChecks, FileText,
  Users, Building2, UserCheck, ChevronLeft,
  Upload, Download
} from 'lucide-react'

export default function MusteriListesi() {
  const { user, deleteClient } = useAuth()
  const { clients, refresh } = useClients()
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterTax, setFilterTax] = useState('all')
  const [showFilters, setShowFilters] = useState(false)
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState('asc')
  const [uploading, setUploading] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const fileInputRef = useRef(null)

  const handleDelete = async (id, name) => {
    if (window.confirm(`"${name}" musterisini silmek istediginize emin misiniz?`)) {
      await deleteClient(id)
      await refresh()
    }
  }

  const toggleSelection = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const toggleAll = () => {
    if (selectedIds.length === filteredClients.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredClients.map(c => c.id))
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return
    if (!window.confirm(`${selectedIds.length} musteriyi silmek istediginize emin misiniz?`)) return
    setUploading(true)
    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .in('id', selectedIds)
      if (error) throw error
      const count = selectedIds.length
      setSelectedIds([])
      await refresh()
      alert(`${count} musteri silindi.`)
    } catch (err) {
      console.error('Toplu silme hatasi:', err)
      alert('Silme hatasi: ' + (err.message || 'Bilinmeyen hata'))
    }
    setUploading(false)
    setShowDeleteConfirm(false)
  }

  const filteredClients = clients
    .filter(client => {
      const matchSearch = 
        client.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.vkn?.includes(searchTerm) ||
        client.tc?.includes(searchTerm) ||
        client.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.phone?.includes(searchTerm) ||
        client.taxOffice?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.city?.toLowerCase().includes(searchTerm.toLowerCase())

      let matchType = true
      if (filterType === 'company') matchType = client.type === 'company'
      else if (filterType === 'individual') matchType = client.type === 'individual'

      let matchStatus = true
      if (filterStatus === 'active') matchStatus = client.status === 'active'
      else if (filterStatus === 'inactive') matchStatus = client.status === 'inactive'

      let matchTax = true
      if (filterTax === 'kurumlar') {
        matchTax = client.taxType === 'Kurumlar Vergisi'
      } else if (filterTax === 'gelir') {
        matchTax = client.taxType === 'Gelir Vergisi'
      }

      return matchSearch && matchType && matchStatus && matchTax
    })
    .sort((a, b) => {
      let valA, valB
      switch(sortBy) {
        case 'name':
          valA = a.name || ''
          valB = b.name || ''
          break
        case 'date':
          valA = a.createdAt || ''
          valB = b.createdAt || ''
          break
        case 'type':
          valA = a.type || ''
          valB = b.type || ''
          break
        default:
          valA = a.name || ''
          valB = b.name || ''
      }
      if (sortOrder === 'asc') {
        return valA.localeCompare(valB)
      } else {
        return valB.localeCompare(valA)
      }
    })

  const stats = {
    total: clients.length,
    active: clients.filter(c => c.status === 'active').length,
    companies: clients.filter(c => c.type === 'company').length,
    individuals: clients.filter(c => c.type === 'individual').length,
    kurumlar: clients.filter(c => c.taxType === 'Kurumlar Vergisi').length,
    gelir: clients.filter(c => c.taxType === 'Gelir Vergisi').length,
  }

  const clearFilters = () => {
    setSearchTerm('')
    setFilterType('all')
    setFilterStatus('all')
    setFilterTax('all')
    setSortBy('name')
    setSortOrder('asc')
  }

  const isFilterActive = () => {
    return searchTerm !== '' || 
           filterType !== 'all' || 
           filterStatus !== 'all' || 
           filterTax !== 'all'
  }

  const downloadTemplate = () => {
    const headers = [
      'Ad Soyad / Unvan', 'Kisa Ad', 'TC', 'VKN', 'Musteri Turu', 'Telefon', 'Email',
      'Sehir', 'Ilce', 'Adres', 'Vergi Dairesi', 'Sirket Turu', 'Vergi Turu',
      'Sermaye', 'Acilis Tarihi', 'NACE Kodu', 'NACE Aciklama', 'Musteri Sinifi',
      'e-Fatura', 'e-Arsiv', 'e-SMM', 'e-Defter', 'e-Defter Periyodu', 'Serbest Meslek',
      'SGK Isyeri No', 'SGK Kullanici', 'SGK Sistem Sifre', 'SGK Isyeri Sifre',
      'DVS Kullanici', 'DVS Sifre', 'e-Arsiv Kullanici', 'e-Arsiv Sifre',
      'e-Devlet Kullanici', 'e-Devlet Sifre', 'Ticaret Sicil No',
      'KDV Beyan', 'KDV2 Beyan', 'Muhtasar Beyan', 'SGK Beyan', 'Gecici Vergi', 'Yillik Vergi',
      'Kira Bilgisi', 'Kira Kontrat Bitis'
    ]
    const ws = XLSX.utils.aoa_to_sheet([headers])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sablon')
    ws['!cols'] = headers.map(() => ({ wch: 20 }))
    XLSX.writeFile(wb, 'Mubis_Musteri_Sablonu.xlsx')
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      let data = []
      const ext = file.name.split('.').pop().toLowerCase()

      if (ext === 'csv') {
        const text = await file.text()
        data = parseCSV(text)
      } else {
        data = await new Promise((resolve, reject) => {
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
      }

      const format = detectFormat(data, ext)
      let result
      switch (format) {
        case 'gib':
          result = await importGibPasswords(data)
          alert(`${result.count} musteriye GIB sifreleri yuklendi.`)
          break
        case 'sgk':
          result = await importSgkPasswords(data)
          alert(`${result.count} musteriye SGK sifreleri yuklendi.`)
          break
        case 'luca':
          result = await importLucaClients(data)
          alert(`${result.count} musteri Luca listesinden eklendi.`)
          break
        case 'mubis':
        default:
          const mapped = data.map(row => mapMubisRow(row))
          await bulkAddClients(mapped)
          alert(`${mapped.length} musteri basariyla yuklendi!`)
      }
      await refresh()
    } catch (err) {
      console.error('Toplu yukleme hatasi:', err)
      alert('Yukleme hatasi: ' + (err.message || 'Bilinmeyen hata'))
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const parseCSV = (text) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    if (lines.length === 0) return []
    const delimiter = lines[0].includes(';') ? ';' : ','
    const firstRow = lines[0].split(delimiter).map(v => v.replace(/^"|"$/g, '').trim())

    // Eger ilk satir tamamen sayi/sifre gibi gorunuyorsa baslik yoktur
    const looksLikeData = firstRow.every(v => /^[0-9A-Za-z]+$/.test(v) && v.length > 0)

    let headers
    if (looksLikeData) {
      headers = firstRow.map((_, i) => `col_${i}`)
    } else {
      headers = firstRow
    }

    const startIdx = looksLikeData ? 0 : 1
    return lines.slice(startIdx).map(line => {
      const values = line.split(delimiter).map(v => v.replace(/^"|"$/g, '').trim())
      const obj = {}
      headers.forEach((h, i) => { obj[h] = values[i] })
      return obj
    })
  }

  const detectFormat = (data, ext) => {
    if (!data.length) return 'mubis'
    const cols = Object.keys(data[0]).map(c => c.toLowerCase().trim())
    const colSet = new Set(cols)

    if (ext === 'csv' || colSet.has('sgk sistem sifresi') || colSet.has('isyeri kodu')) return 'sgk'
    if (colSet.has('kullanici adi') && colSet.has('parola')) return 'gib'
    if (colSet.has('kisa ad') || colSet.has('kisaltma') || colSet.has('uzun ad')) return 'luca'
    return 'mubis'
  }

  const mapMubisRow = (row) => ({
    name: row['Ad Soyad / Unvan'] || row['Ad Soyad'] || row['Unvan'] || '',
    shortName: row['Kisa Ad'] || '',
    tc: row['TC'] || '',
    vkn: row['VKN'] || '',
    type: String(row['Musteri Turu'] || 'individual').toLowerCase().includes('sirket') ? 'company' : 'individual',
    phone: row['Telefon'] || '',
    email: row['Email'] || '',
    city: row['Sehir'] || '',
    district: row['Ilce'] || '',
    address: row['Adres'] || '',
    taxOffice: row['Vergi Dairesi'] || '',
    companyType: row['Sirket Turu'] || 'ltd',
    taxType: row['Vergi Turu'] || 'Gelir Vergisi',
    capital: row['Sermaye'] || '',
    openDate: row['Acilis Tarihi'] || '',
    naceCode: row['NACE Kodu'] || '',
    naceDesc: row['NACE Aciklama'] || '',
    musteriSinifi: row['Musteri Sinifi'] || '',
    efatura: row['e-Fatura'] || 'hayir',
    earsiv: row['e-Arsiv'] || 'hayir',
    esmm: row['e-SMM'] || 'hayir',
    edefter: row['e-Defter'] || 'hayir',
    edefterPeriod: row['e-Defter Periyodu'] || 'aylik',
    serbestMeslek: row['Serbest Meslek'] || 'hayir',
    sgkIsyeriKodu: row['SGK Isyeri No'] || '',
    sgkUser: row['SGK Kullanici'] || '',
    sgkSistemSifre: row['SGK Sistem Sifre'] || '',
    sgkIsyeriSifre: row['SGK Isyeri Sifre'] || '',
    dvsUsername: row['DVS Kullanici'] || '',
    dvsPassword: row['DVS Sifre'] || '',
    earsivUser: row['e-Arsiv Kullanici'] || '',
    earsivPass: row['e-Arsiv Sifre'] || '',
    edevletUser: row['e-Devlet Kullanici'] || '',
    edevletPass: row['e-Devlet Sifre'] || '',
    ticaretSicilNo: row['Ticaret Sicil No'] || '',
    kdvBeyan: row['KDV Beyan'] || 'aylik',
    kdv2Beyan: row['KDV2 Beyan'] || 'aylik',
    muhtasarBeyan: row['Muhtasar Beyan'] || 'yok',
    sgkBeyan: row['SGK Beyan'] || 'aylik',
    geciciVergi: row['Gecici Vergi'] || 'evet',
    yillikVergi: row['Yillik Vergi'] || 'evet',
    kiraBilgisi: row['Kira Bilgisi'] || '',
    kiraKontratBitis: row['Kira Kontrat Bitis'] || '',
    password: '123456'
  })

  const importLucaClients = async (data) => {
    const mapped = data.map(row => ({
      name: row['Uzun Ad'] || row['Kısa Ad'] || row['Kisa Ad'] || '',
      shortName: row['Kısa Ad'] || row['Kisa Ad'] || '',
      tc: row['T.C. Kimlik Numarası'] || row['T.C. Kimlik'] || row['T.C.'] || row['TC'] || '',
      vkn: row['Vergi No'] || '',
      taxNo: row['Vergi No'] || '',
      type: (() => {
        const tcVal = row['T.C. Kimlik Numarası'] || row['T.C. Kimlik'] || row['T.C.'] || row['TC'] || ''
        const vknVal = row['Vergi No'] || ''
        const nameVal = row['Uzun Ad'] || row['Kısa Ad'] || row['Kisa Ad'] || ''
        const isDernekByName = /\b(DERNEĞİ|DERNEK|DERNEGI|DERNEKİ)\b/i.test(nameVal)
        const isApartmentByName = /\b(APARTMAN\s+YÖNETİMİ|APARTMAN\s+YONETIMI|SİTE\s+YÖNETİMİ|SITE\s+YONETIMI|APARTMAN|SİTESİ|SITESI)\b/i.test(nameVal)
        const isCompanyByName = /\b(LTD|A\.Ş|A\.S|ŞTİ|STI|TİC|TIC|SAN|HOLDİNG|GROUP|KOOP|KOLL)\b/i.test(nameVal)
        const isAdiOrtaklikByName = /(\bve\s+ort\b|\bve\s+ort\.|\bort\b|\badi\s+ortaklik\b|\bortaklığı\b|\bortakligi\b)/i.test(nameVal)
        // Unvana gore ozel turler once
        if (isDernekByName) return 'dernek'
        if (isApartmentByName) return 'apartman_yonetimi'
        if (isAdiOrtaklikByName) return 'adi_ortaklik'
        if (tcVal.length === 11) return 'individual'
        if (vknVal.length === 10 || isCompanyByName) return 'company'
        return 'individual'
      })(),
      taxType: (() => {
        const tcVal = row['T.C. Kimlik Numarası'] || row['T.C. Kimlik'] || row['T.C.'] || row['TC'] || ''
        const vknVal = row['Vergi No'] || ''
        const nameVal = row['Uzun Ad'] || row['Kısa Ad'] || row['Kisa Ad'] || ''
        const isDernekByName = /\b(DERNEĞİ|DERNEK|DERNEGI|DERNEKİ)\b/i.test(nameVal)
        const isApartmentByName = /\b(APARTMAN\s+YÖNETİMİ|APARTMAN\s+YONETIMI|SİTE\s+YÖNETİMİ|SITE\s+YONETIMI|APARTMAN|SİTESİ|SITESI)\b/i.test(nameVal)
        const isCompanyByName = /\b(LTD|A\.Ş|A\.S|ŞTİ|STI|TİC|TIC|SAN|HOLDİNG|GROUP|KOOP|KOLL)\b/i.test(nameVal)
        if (isDernekByName) return 'Dernek'
        if (isApartmentByName) return 'Apartman Yonetimi'
        if (tcVal.length === 11) return 'Gelir Vergisi'
        if (vknVal.length === 10 || isCompanyByName) return 'Kurumlar Vergisi'
        return 'Gelir Vergisi'
      })(),
      musteriSinifi: (() => {
        const nameVal = row['Uzun Ad'] || row['Kısa Ad'] || row['Kisa Ad'] || ''
        if (/\b(DERNEĞİ|DERNEK|DERNEGI|DERNEKİ)\b/i.test(nameVal)) return 'Dernek'
        if (/\b(APARTMAN\s+YÖNETİMİ|APARTMAN\s+YONETIMI|SİTE\s+YÖNETİMİ|SITE\s+YONETIMI|APARTMAN|SİTESİ|SITESI)\b/i.test(nameVal)) return 'Apartman Yonetimi'
        return ''
      })(),
      email: '',
      city: '',
      district: '',
      address: '',
      taxOffice: row['Vergi Dairesi'] ? String(row['Vergi Dairesi']).split(' ')[0] : '',
      companyType: 'ltd',
      capital: '',
      openDate: row['Kuruluş Tarihi'] || row['Kurulus Tarihi'] || '',
      naceCode: '',
      naceDesc: row['Açıklama'] || row['Aciklama'] || '',
      musteriSinifi: '',
      efatura: 'hayir',
      earsiv: 'hayir',
      esmm: 'hayir',
      edefter: 'hayir',
      edefterPeriod: 'aylik',
      serbestMeslek: 'hayir',
      sgkIsyeriKodu: '',
      sgkUser: '',
      sgkSistemSifre: '',
      sgkIsyeriSifre: '',
      dvsUsername: '',
      dvsPassword: '',
      earsivUser: '',
      earsivPass: '',
      edevletUser: '',
      edevletPass: '',
      ticaretSicilNo: '',
      kdvBeyan: 'aylik',
      kdv2Beyan: 'yok',
      muhtasarBeyan: 'yok',
      sgkBeyan: 'yok',
      geciciVergi: 'hayir',
      yillikVergi: 'hayir',
      kiraBilgisi: '',
      kiraKontratBitis: '',
      password: '123456'
    })).filter(c => c.name)
    await bulkAddClients(mapped)
    return { count: mapped.length }
  }

  const importGibPasswords = async (data) => {
    let count = 0
    const { data: allClients } = await supabase.from('clients').select('id, name, company')
    for (const row of data) {
      const company = row['Şirket'] || row['Sirket'] || row['Şirket '] || ''
      const user = row['Kullanıcı Adı'] || row['Kullanici Adi'] || ''
      const pass = row['Parola'] || row['Şifre'] || row['Sifre'] || ''
      if (!company || !user) continue
      const found = allClients.find(c => 
        (c.name && c.name.toLowerCase().trim() === company.toLowerCase().trim()) ||
        (c.company && c.company.toLowerCase().trim() === company.toLowerCase().trim())
      )
      if (found) {
        await supabase.from('clients').update({
          dvs_username: user,
          dvs_password: pass
        }).eq('id', found.id)
        count++
      }
    }
    return { count }
  }

  const importSgkPasswords = async (data) => {
    let count = 0
    const { data: allClients } = await supabase.from('clients').select('id, name, vkn, tc')
    for (const row of data) {
      // CSV format (basliksiz): isyeri_sicil;sgk_user;tc/vkn;sube;sgk_sistem_sifre;sgk_isyeri_sifre
      const values = Object.values(row)
      const tcOrVkn = values.find(v => v && /^[0-9]{10,11}$/.test(v.toString().trim())) || ''
      const sgkUser = values.find((v, i) => v && /^[0-9]{5,}$/.test(v.toString().trim()) && i > 0 && i < values.length - 2) || ''
      const lastTwo = values.slice(-2)
      const sistemSifre = lastTwo[0] || ''
      const isyeriSifre = lastTwo[1] || ''

      if (!tcOrVkn) continue
      const found = allClients.find(c => 
        (c.tc && c.tc.toString().trim() === tcOrVkn.toString().trim()) ||
        (c.vkn && c.vkn.toString().trim() === tcOrVkn.toString().trim())
      )
      if (found) {
        await supabase.from('clients').update({
          sgk_user: sgkUser,
          sgk_isyeri_kodu: values[0] || '',
          sgk_sistem_sifre: sistemSifre,
          sgk_isyeri_sifre: isyeriSifre
        }).eq('id', found.id)
        count++
      }
    }
    return { count }
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400"></div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin')}
            className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-blue-800/30"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
              <Users className="w-7 h-7 text-yellow-400" />
              Musteri Yonetimi
            </h1>
            <p className="text-gray-400 mt-1 text-sm">
              {stats.total} kayitli musteri
              {isFilterActive() && (
                <span className="ml-2 text-yellow-400 text-sm">(Filtreler aktif)</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 mt-4 md:mt-0">
          <button
            onClick={downloadTemplate}
            className="bg-blue-500/20 text-blue-400 px-4 py-2 rounded-lg font-semibold hover:bg-blue-500/30 transition-all duration-300 flex items-center justify-center space-x-2"
          >
            <Download className="w-5 h-5" />
            <span>Sablon Indir</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="bg-green-500/20 text-green-400 px-4 py-2 rounded-lg font-semibold hover:bg-green-500/30 transition-all duration-300 flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            <Upload className="w-5 h-5" />
            <span>{uploading ? 'Yukleniyor...' : 'Excel Yükle'}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Link 
            to="/admin/clients/new"
            className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-6 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-yellow-500/30 transition-all duration-300 flex items-center justify-center space-x-2"
          >
            <Plus className="w-5 h-5" />
            <span>Yeni Musteri</span>
          </Link>
        </div>
      </div>

      {/* Istatistikler */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-white">{stats.total}</div>
          <div className="text-gray-400 text-xs">Toplam</div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-green-400">{stats.active}</div>
          <div className="text-gray-400 text-xs">Aktif</div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-yellow-400">{stats.companies}</div>
          <div className="text-gray-400 text-xs">Sirket</div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-purple-400">{stats.individuals}</div>
          <div className="text-gray-400 text-xs">Bireysel</div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-blue-400">{stats.kurumlar}</div>
          <div className="text-gray-400 text-xs">Kurumlar</div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-orange-400">{stats.gelir}</div>
          <div className="text-gray-400 text-xs">Gelir</div>
        </div>
      </div>

      {/* Filtreler */}
      <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 mb-6">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              placeholder="Isim, sirket, VKN, TC, adres, email, telefon, vergi dairesi, sehir ile ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 transition-colors"
            />
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center space-x-2 ${
                isFilterActive() ? 'bg-yellow-500 text-blue-950' : 'bg-blue-800/30 text-gray-400 hover:text-white'
              }`}
            >
              <Filter className="w-4 h-4" />
              <span>Filtreler</span>
              {isFilterActive() && (
                <span className="ml-1 text-xs bg-blue-950/30 px-1.5 py-0.5 rounded-full">!</span>
              )}
            </button>
            {isFilterActive() && (
              <button
                onClick={clearFilters}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all bg-red-500/20 text-red-400 hover:bg-red-500/30 flex items-center space-x-1"
              >
                <X className="w-4 h-4" />
                <span>Temizle</span>
              </button>
            )}
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-blue-700/50">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-gray-400 text-xs block mb-1">Musteri Tipi</label>
                <div className="flex space-x-1 bg-blue-900/30 rounded-lg p-1">
                  {[
                    { val: 'all', label: 'Tumu' },
                    { val: 'company', label: 'Sirket' },
                    { val: 'individual', label: 'Bireysel' },
                  ].map(opt => (
                    <button
                      key={opt.val}
                      onClick={() => setFilterType(opt.val)}
                      className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                        filterType === opt.val ? 'bg-yellow-500 text-blue-950' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-gray-400 text-xs block mb-1">Durum</label>
                <div className="flex space-x-1 bg-blue-900/30 rounded-lg p-1">
                  {[
                    { val: 'all', label: 'Tumu' },
                    { val: 'active', label: 'Aktif' },
                    { val: 'inactive', label: 'Pasif' },
                  ].map(opt => (
                    <button
                      key={opt.val}
                      onClick={() => setFilterStatus(opt.val)}
                      className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                        filterStatus === opt.val ? 'bg-yellow-500 text-blue-950' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-gray-400 text-xs block mb-1">Vergi Turu</label>
                <div className="flex space-x-1 bg-blue-900/30 rounded-lg p-1">
                  {[
                    { val: 'all', label: 'Tumu' },
                    { val: 'kurumlar', label: 'Kurumlar' },
                    { val: 'gelir', label: 'Gelir' },
                  ].map(opt => (
                    <button
                      key={opt.val}
                      onClick={() => setFilterTax(opt.val)}
                      className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                        filterTax === opt.val ? 'bg-yellow-500 text-blue-950' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-gray-400 text-xs block mb-1">Siralama</label>
                <div className="flex space-x-1 bg-blue-900/30 rounded-lg p-1">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="flex-1 bg-transparent text-white text-xs px-2 py-1.5 rounded focus:outline-none"
                  >
                    <option value="name">Isim</option>
                    <option value="date">Tarih</option>
                    <option value="type">Tip</option>
                  </select>
                  <button
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    className="px-3 py-1.5 rounded text-xs font-medium transition-all bg-blue-800/30 text-gray-400 hover:text-white"
                  >
                    {sortOrder === 'asc' ? '\u2191' : '\u2193'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Musteri Listesi */}
      <div className="bg-blue-800/20 rounded-2xl border border-blue-700/30 overflow-hidden">
        {selectedIds.length > 0 && (
          <div className="bg-red-500/10 border-b border-red-500/20 px-6 py-3 flex items-center justify-between">
            <span className="text-red-400 font-medium">{selectedIds.length} musteri secildi</span>
            <button
              onClick={handleBulkDelete}
              disabled={uploading}
              className="bg-red-500/20 hover:bg-red-500/30 text-red-400 px-4 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center space-x-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>Secilenleri Sil</span>
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-blue-900/30">
              <tr className="text-left text-gray-400 text-sm">
                <th className="px-4 py-4">
                  <input
                    type="checkbox"
                    checked={filteredClients.length > 0 && selectedIds.length === filteredClients.length}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded border-gray-500 text-yellow-500 focus:ring-yellow-500"
                  />
                </th>
                <th className="px-6 py-4">#</th>
                <th className="px-6 py-4">Musteri</th>
                <th className="px-6 py-4">Adres</th>
                <th className="px-6 py-4">Vergi Turu</th>
                <th className="px-6 py-4">Durum</th>
                <th className="px-6 py-4">Islem</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-8 text-gray-400">
                    {isFilterActive() ? 'Filtrelere uygun musteri bulunamadi' : 'Henuz musteri eklenmemis'}
                  </td>
                </tr>
              ) : (
                filteredClients.map((client, index) => (
                  <tr 
                    key={client.id} 
                    className="border-t border-blue-700/30 hover:bg-blue-800/20 transition-colors"
                  >
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(client.id)}
                        onChange={() => toggleSelection(client.id)}
                        className="w-4 h-4 rounded border-gray-500 text-yellow-500 focus:ring-yellow-500"
                      />
                    </td>
                    <td className="px-6 py-4 text-gray-400">{index + 1}</td>
                    <td className="px-6 py-4 cursor-pointer" onClick={() => navigate(`/admin/client/${client.id}`)}>
                      <div>
                        <div className="text-white font-medium">{client.name}</div>
                        <div className="text-gray-400 text-xs">{client.company || client.email || '-'}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 cursor-pointer" onClick={() => navigate(`/admin/client/${client.id}`)}>
                      <div className="flex items-center space-x-1">
                        <MapPin className="w-3 h-3 text-gray-500 flex-shrink-0" />
                        <span className="text-gray-300 text-sm truncate max-w-[150px] block">
                          {client.address || '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 cursor-pointer" onClick={() => navigate(`/admin/client/${client.id}`)}>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        client.taxType === 'Kurumlar Vergisi' 
                          ? 'bg-blue-500/20 text-blue-400' 
                          : client.taxType === 'Gelir Vergisi'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {client.taxType || 'Kurumlar Vergisi'}
                      </span>
                    </td>
                    <td className="px-6 py-4 cursor-pointer" onClick={() => navigate(`/admin/client/${client.id}`)}>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        client.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {client.status === 'active' ? 'Aktif' : 'Pasif'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => navigate(`/admin/client/${client.id}`)}
                          className="text-gray-400 hover:text-yellow-400 transition-colors"
                          title="Detay"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => navigate(`/admin/client/${client.id}/beyan-profile`)}
                          className="text-gray-400 hover:text-teal-400 transition-colors"
                          title="Beyan Profili"
                        >
                          <ListChecks className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => navigate(`/admin/client/${client.id}/beyan-takip`)}
                          className="text-gray-400 hover:text-blue-400 transition-colors"
                          title="Beyan Takip"
                        >
                          <FileText className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => handleDelete(client.id, client.name)}
                          className="text-gray-400 hover:text-red-400 transition-colors"
                          title="Sil"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
