import { useState, useEffect, useMemo } from 'react'
import { useClients } from '../hooks/useClients'
import { 
  getEmployees, addEmployee, updateEmployee, deleteEmployee, saveEmployeesFromExcel,
  getLeaveRecords, getEmployeeLeaveRecords, addLeaveRecord, deleteLeaveRecord
} from '../services/clientService'
import { hesaplaIsGunu, hesaplaIzinHakki, IZIN_GUNLERI, fmt } from '../data/defaults'
import { 
  Calendar, Users, Plus, Trash2, Edit3, Download, FileSpreadsheet, Upload,
  ChevronDown, ChevronRight, Save, X, FileText, Clock, CheckCircle, AlertTriangle,
  User, Briefcase, Search
} from 'lucide-react'
import jsPDF from 'jspdf'
import * as XLSX from 'xlsx'

export default function IzinTakip() {
  const { clients } = useClients()
  const [selectedClientId, setSelectedClientId] = useState('')
  const [employees, setEmployees] = useState([])
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [leaveRecords, setLeaveRecords] = useState([])
  const [allLeaveRecords, setAllLeaveRecords] = useState([])
  const [selectedYil, setSelectedYil] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(false)
  const [showAddEmployee, setShowAddEmployee] = useState(false)
  const [showAddLeave, setShowAddLeave] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  // Yeni personel formu
  const [empForm, setEmpForm] = useState({ ad_soyad: '', tc_kimlik: '', ise_giris: '', isten_cikis: '', brut_ucret: '' })
  // Yeni izin formu
  const [leaveForm, setLeaveForm] = useState({ baslangic: '', bitis: '', aciklama: 'Yillik Izin' })

  // Hesaplanan is gunu
  const hesaplananIsGunu = useMemo(() => {
    if (!leaveForm.baslangic || !leaveForm.bitis) return 0
    return hesaplaIsGunu(leaveForm.baslangic, leaveForm.bitis)
  }, [leaveForm.baslangic, leaveForm.bitis])

  // Musteri secildiginde personelleri yukle
  useEffect(() => {
    if (selectedClientId) {
      loadEmployees()
    } else {
      setEmployees([])
      setSelectedEmployee(null)
    }
  }, [selectedClientId])

  // Personel secildiginde izin kayitlarini yukle
  useEffect(() => {
    if (selectedEmployee) {
      loadLeaveRecords()
    } else {
      setLeaveRecords([])
      setAllLeaveRecords([])
    }
  }, [selectedEmployee, selectedYil])

  const loadEmployees = async () => {
    try {
      setLoading(true)
      const data = await getEmployees(selectedClientId)
      setEmployees(data)
    } catch (err) {
      console.error('Personel yukleme hatasi:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadLeaveRecords = async () => {
    if (!selectedEmployee) return
    try {
      const [yearRecords, allRecords] = await Promise.all([
        getEmployeeLeaveRecords(selectedEmployee.id, selectedYil),
        getEmployeeLeaveRecords(selectedEmployee.id)
      ])
      setLeaveRecords(yearRecords)
      setAllLeaveRecords(allRecords)
    } catch (err) {
      console.error('Izin kayit yukleme hatasi:', err)
    }
  }

  // Personel CRUD
  const handleAddEmployee = async () => {
    if (!empForm.ad_soyad.trim()) return alert('Ad Soyad zorunlu!')
    try {
      await addEmployee(selectedClientId, empForm)
      setEmpForm({ ad_soyad: '', tc_kimlik: '', ise_giris: '', isten_cikis: '', brut_ucret: '' })
      setShowAddEmployee(false)
      await loadEmployees()
    } catch (err) {
      alert('Hata: ' + err.message)
    }
  }

  const handleUpdateEmployee = async () => {
    if (!editingEmployee) return
    try {
      await updateEmployee(editingEmployee.id, empForm)
      setEditingEmployee(null)
      setEmpForm({ ad_soyad: '', tc_kimlik: '', ise_giris: '', isten_cikis: '', brut_ucret: '' })
      await loadEmployees()
    } catch (err) {
      alert('Hata: ' + err.message)
    }
  }

  const handleDeleteEmployee = async (id) => {
    if (!confirm('Bu personeli ve tum izin kayitlarini silmek istediginize emin misiniz?')) return
    try {
      await deleteEmployee(id)
      if (selectedEmployee?.id === id) setSelectedEmployee(null)
      await loadEmployees()
    } catch (err) {
      alert('Hata: ' + err.message)
    }
  }

  const startEditEmployee = (emp) => {
    setEditingEmployee(emp)
    setEmpForm({
      ad_soyad: emp.ad_soyad || '',
      tc_kimlik: emp.tc_kimlik || '',
      ise_giris: emp.ise_giris || '',
      isten_cikis: emp.isten_cikis || '',
      brut_ucret: emp.brut_ucret || ''
    })
  }

  // Bordro Excel yukleme
  const handleBordroUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      setLoading(true)
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (ev) => {
          try {
            const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' })
            const sheet = wb.Sheets[wb.SheetNames[0]]
            const json = XLSX.utils.sheet_to_json(sheet)
            resolve(json)
          } catch (err) { reject(err) }
        }
        reader.readAsArrayBuffer(file)
      })

      const parsed = data.map(row => {
        // Esnek kolon eslestirme
        const adSoyad = row['Ad Soyad'] || row['Ad'] || row['Personel'] || row['Isci'] || row['ADI SOYADI'] || row['AD SOYAD'] || ''
        const tc = String(row['TC Kimlik'] || row['TC'] || row['TC No'] || row['TC KİMLİK NO'] || row['TCKN'] || '').trim()
        const iseGiris = parseExcelDate(row['Ise Giris'] || row['İşe Giriş'] || row['ISE GIRIS'] || row['İŞE GİRİŞ TARİHİ'] || row['Giris Tarihi'] || '')
        const istenCikis = parseExcelDate(row['Isten Cikis'] || row['İşten Çıkış'] || row['ISTEN CIKIS'] || row['İŞTEN ÇIKIŞ TARİHİ'] || row['Cikis Tarihi'] || '')
        const brut = parseFloat(String(row['Brut Ucret'] || row['Brüt Ücret'] || row['BRÜT ÜCRET'] || row['Brüt'] || row['BRUT'] || row['Ucret'] || 0).replace(/[.,]/g, m => m === ',' ? '.' : '')) || 0

        return {
          ad_soyad: String(adSoyad).trim(),
          tc_kimlik: tc,
          ise_giris: iseGiris || null,
          isten_cikis: istenCikis || null,
          brut_ucret: brut
        }
      }).filter(e => e.ad_soyad)

      if (parsed.length === 0) {
        alert('Excel dosyasinda personel bilgisi bulunamadi!')
        return
      }

      if (confirm(`${parsed.length} personel bulundu. Kaydetmek istiyor musunuz?`)) {
        await saveEmployeesFromExcel(selectedClientId, parsed)
        await loadEmployees()
        alert(`${parsed.length} personel basariyla yuklendi!`)
      }
    } catch (err) {
      alert('Excel okuma hatasi: ' + err.message)
    } finally {
      setLoading(false)
      e.target.value = ''
    }
  }

  // Excel tarih parse
  function parseExcelDate(val) {
    if (!val) return null
    if (typeof val === 'number') {
      // Excel serial date
      const d = new Date((val - 25569) * 86400 * 1000)
      return d.toISOString().split('T')[0]
    }
    const s = String(val).trim()
    // DD.MM.YYYY or DD/MM/YYYY
    const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    // YYYY-MM-DD
    const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`
    return null
  }

  // Izin ekleme
  const handleAddLeave = async () => {
    if (!selectedEmployee) return alert('Personel secin!')
    if (!leaveForm.baslangic || !leaveForm.bitis) return alert('Tarihler zorunlu!')
    if (new Date(leaveForm.bitis) < new Date(leaveForm.baslangic)) return alert('Bitis tarihi baslangictan once olamaz!')
    if (hesaplananIsGunu <= 0) return alert('Secilen tarih araliginda is gunu yok!')

    try {
      await addLeaveRecord({
        employee_id: selectedEmployee.id,
        client_id: selectedClientId,
        yil: new Date(leaveForm.baslangic).getFullYear(),
        baslangic: leaveForm.baslangic,
        bitis: leaveForm.bitis,
        is_gunu: hesaplananIsGunu,
        aciklama: leaveForm.aciklama
      })
      setLeaveForm({ baslangic: '', bitis: '', aciklama: 'Yillik Izin' })
      setShowAddLeave(false)
      await loadLeaveRecords()
    } catch (err) {
      alert('Hata: ' + err.message)
    }
  }

  const handleDeleteLeave = async (id) => {
    if (!confirm('Bu izin kaydini silmek istiyor musunuz?')) return
    try {
      await deleteLeaveRecord(id)
      await loadLeaveRecords()
    } catch (err) {
      alert('Hata: ' + err.message)
    }
  }

  // Izin hesaplama ozeti
  const getIzinOzeti = (emp) => {
    if (!emp?.ise_giris) return { hakEdilen: 0, kullanilanBuYil: 0, oncekiYilKalan: 0, toplam: 0, kalan: 0 }
    
    const hakEdilen = hesaplaIzinHakki(emp.ise_giris, new Date(`${selectedYil}-12-31`))
    
    // Bu yil kullanilan
    const buYilRecords = allLeaveRecords.filter(r => r.yil === selectedYil)
    const kullanilanBuYil = buYilRecords.reduce((sum, r) => sum + (r.is_gunu || 0), 0)
    
    // Onceki yillardan kalan (onceki yillarin toplam hakki - onceki yillarin kullanimi)
    let oncekiYilKalan = 0
    const oncekiRecords = allLeaveRecords.filter(r => r.yil < selectedYil)
    const oncekiKullanilan = oncekiRecords.reduce((sum, r) => sum + (r.is_gunu || 0), 0)
    
    // Onceki yillarin toplam hakki
    const iseGirisYil = new Date(emp.ise_giris).getFullYear()
    let oncekiToplamHak = 0
    for (let y = Math.max(iseGirisYil + 1, 2020); y < selectedYil; y++) {
      oncekiToplamHak += hesaplaIzinHakki(emp.ise_giris, new Date(`${y}-12-31`))
    }
    oncekiYilKalan = Math.max(0, oncekiToplamHak - oncekiKullanilan)
    
    const toplam = hakEdilen + oncekiYilKalan
    const kalan = toplam - kullanilanBuYil

    return { hakEdilen, kullanilanBuYil, oncekiYilKalan, toplam, kalan }
  }

  // PDF Izin Belgesi olustur
  const generateIzinBelgesi = (emp, records) => {
    if (!emp) return
    const doc = new jsPDF()
    const client = clients.find(c => String(c.id) === String(selectedClientId))
    const ozet = getIzinOzeti(emp)
    
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('YILLIK IZIN BELGESI', 105, 25, { align: 'center' })
    
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Tarih: ${new Date().toLocaleDateString('tr-TR')}`, 105, 35, { align: 'center' })
    
    // Isveren bilgileri
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('ISVEREN BILGILERI', 20, 50)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(`Isveren: ${client?.name || client?.company || '-'}`, 20, 58)
    doc.text(`Adres: ${client?.address || '-'}`, 20, 64)
    
    // Isci bilgileri
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('ISCI BILGILERI', 20, 78)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(`Ad Soyad: ${emp.ad_soyad}`, 20, 86)
    doc.text(`TC Kimlik No: ${emp.tc_kimlik || '-'}`, 20, 92)
    doc.text(`Ise Giris Tarihi: ${emp.ise_giris ? new Date(emp.ise_giris).toLocaleDateString('tr-TR') : '-'}`, 20, 98)
    
    // Izin hakki
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(`${selectedYil} YILI IZIN DURUMU`, 20, 112)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(`Hak Edilen Izin: ${ozet.hakEdilen} gun`, 20, 120)
    if (ozet.oncekiYilKalan > 0) {
      doc.text(`Onceki Yildan Devir: ${ozet.oncekiYilKalan} gun`, 20, 126)
      doc.text(`Toplam Izin Hakki: ${ozet.toplam} gun`, 20, 132)
    }
    
    // Kullanilan izinler tablosu
    const buYilRecords = records.filter(r => r.yil === selectedYil)
    let y = ozet.oncekiYilKalan > 0 ? 146 : 134
    
    if (buYilRecords.length > 0) {
      doc.setFont('helvetica', 'bold')
      doc.text('KULLANILAN IZINLER', 20, y)
      y += 10
      
      // Tablo baslik
      doc.setFillColor(240, 240, 240)
      doc.rect(20, y - 5, 170, 8, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.text('#', 25, y)
      doc.text('Baslangic', 35, y)
      doc.text('Bitis', 75, y)
      doc.text('Is Gunu', 115, y)
      doc.text('Aciklama', 140, y)
      y += 8
      
      doc.setFont('helvetica', 'normal')
      buYilRecords.forEach((r, i) => {
        doc.text(`${i + 1}`, 25, y)
        doc.text(new Date(r.baslangic).toLocaleDateString('tr-TR'), 35, y)
        doc.text(new Date(r.bitis).toLocaleDateString('tr-TR'), 75, y)
        doc.text(`${r.is_gunu} gun`, 115, y)
        doc.text(r.aciklama || '-', 140, y)
        y += 7
      })
      
      y += 5
      doc.setFont('helvetica', 'bold')
      doc.text(`Toplam Kullanilan: ${ozet.kullanilanBuYil} gun`, 20, y)
      y += 7
      doc.text(`Kalan Izin Hakki: ${ozet.kalan} gun`, 20, y)
    } else {
      doc.text('Bu yil henuz izin kullanilmamistir.', 20, y)
    }
    
    // Beyan metni (son kullanilan izin icin)
    if (buYilRecords.length > 0) {
      const lastRecord = buYilRecords[buYilRecords.length - 1]
      y += 20
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(10)
      const beyan = `"${new Date(lastRecord.baslangic).toLocaleDateString('tr-TR')} - ${new Date(lastRecord.bitis).toLocaleDateString('tr-TR')} tarihleri arasi ${lastRecord.is_gunu} is gunu yillik iznimden kullandim."`
      doc.text(beyan, 20, y, { maxWidth: 170 })
    }
    
    // Imza alani
    y += 30
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text('Isci', 40, y, { align: 'center' })
    doc.text('Isveren', 160, y, { align: 'center' })
    y += 5
    doc.line(20, y, 70, y)
    doc.line(130, y, 190, y)
    y += 7
    doc.text(`${emp.ad_soyad}`, 40, y, { align: 'center' })
    doc.text(`${client?.name || client?.company || ''}`, 160, y, { align: 'center' })
    y += 5
    doc.text('Imza:', 40, y, { align: 'center' })
    doc.text('Imza / Kase:', 160, y, { align: 'center' })
    y += 5
    doc.text(`Tarih: ${new Date().toLocaleDateString('tr-TR')}`, 40, y, { align: 'center' })
    
    doc.save(`izin_belgesi_${emp.ad_soyad.replace(/\s+/g, '_')}_${selectedYil}.pdf`)
  }

  // Excel döküm
  const exportExcel = () => {
    if (!selectedEmployee || leaveRecords.length === 0) return
    const emp = selectedEmployee
    const ozet = getIzinOzeti(emp)
    
    const rows = leaveRecords.map((r, i) => ({
      '#': i + 1,
      'Baslangic': new Date(r.baslangic).toLocaleDateString('tr-TR'),
      'Bitis': new Date(r.bitis).toLocaleDateString('tr-TR'),
      'Is Gunu': r.is_gunu,
      'Aciklama': r.aciklama || '-'
    }))
    
    rows.push({})
    rows.push({ '#': '', 'Baslangic': 'Hak Edilen:', 'Bitis': `${ozet.hakEdilen} gun` })
    rows.push({ '#': '', 'Baslangic': 'Kullanilan:', 'Bitis': `${ozet.kullanilanBuYil} gun` })
    rows.push({ '#': '', 'Baslangic': 'Kalan:', 'Bitis': `${ozet.kalan} gun` })
    
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Izin Takip')
    XLSX.writeFile(wb, `izin_takip_${emp.ad_soyad.replace(/\s+/g, '_')}_${selectedYil}.xlsx`)
  }

  // Filtrelenmis personeller
  const filteredEmployees = employees.filter(e => 
    !searchTerm || 
    e.ad_soyad?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.tc_kimlik?.includes(searchTerm)
  )

  // Sirket/1.sinif kontrolu
  const selectedClient = clients.find(c => String(c.id) === String(selectedClientId))

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center space-x-3">
            <Calendar className="w-8 h-8 text-yellow-400" />
            <span>Izin Takip</span>
          </h1>
          <p className="text-gray-400 mt-1">Personel yillik izin yonetimi ve takibi</p>
        </div>
      </div>

      {/* Musteri Secimi */}
      <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30 mb-6">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-400 mb-1">Musteri</label>
            <select
              value={selectedClientId}
              onChange={(e) => { setSelectedClientId(e.target.value); setSelectedEmployee(null) }}
              className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 px-4 text-white focus:outline-none focus:border-yellow-400"
            >
              <option value="">Musteri Secin...</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name || c.company}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Yil</label>
            <select
              value={selectedYil}
              onChange={(e) => setSelectedYil(Number(e.target.value))}
              className="bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 px-4 text-white focus:outline-none focus:border-yellow-400"
            >
              {[2024, 2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {selectedClientId && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sol Panel - Personel Listesi */}
          <div className="lg:col-span-1">
            <div className="bg-blue-800/20 rounded-2xl border border-blue-700/30 overflow-hidden">
              <div className="p-4 border-b border-blue-700/30">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-semibold flex items-center space-x-2">
                    <Users className="w-5 h-5 text-yellow-400" />
                    <span>Personel ({employees.length})</span>
                  </h3>
                  <div className="flex items-center space-x-2">
                    {/* Bordro Excel Yukle */}
                    <label className="cursor-pointer bg-blue-700/30 text-blue-300 p-2 rounded-lg hover:bg-blue-700/50 transition-colors" title="Bordro Excel Yukle">
                      <Upload className="w-4 h-4" />
                      <input type="file" accept=".xlsx,.xls" onChange={handleBordroUpload} className="hidden" />
                    </label>
                    <button
                      onClick={() => { setShowAddEmployee(true); setEditingEmployee(null); setEmpForm({ ad_soyad: '', tc_kimlik: '', ise_giris: '', isten_cikis: '', brut_ucret: '' }) }}
                      className="bg-yellow-500/20 text-yellow-400 p-2 rounded-lg hover:bg-yellow-500/30 transition-colors"
                      title="Personel Ekle"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {employees.length > 5 && (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text" placeholder="Ara..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-1.5 pl-9 pr-3 text-white text-sm focus:outline-none focus:border-yellow-400"
                    />
                  </div>
                )}
              </div>

              {/* Personel Ekle / Duzenle Formu */}
              {(showAddEmployee || editingEmployee) && (
                <div className="p-4 border-b border-blue-700/30 bg-blue-900/20">
                  <h4 className="text-sm font-semibold text-yellow-400 mb-3">
                    {editingEmployee ? 'Personel Duzenle' : 'Yeni Personel'}
                  </h4>
                  <div className="space-y-2">
                    <input type="text" placeholder="Ad Soyad *" value={empForm.ad_soyad} onChange={(e) => setEmpForm({...empForm, ad_soyad: e.target.value})}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400" />
                    <input type="text" placeholder="TC Kimlik No" value={empForm.tc_kimlik} onChange={(e) => setEmpForm({...empForm, tc_kimlik: e.target.value})}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400" />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500">Ise Giris</label>
                        <input type="date" value={empForm.ise_giris} onChange={(e) => setEmpForm({...empForm, ise_giris: e.target.value})}
                          className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Isten Cikis</label>
                        <input type="date" value={empForm.isten_cikis} onChange={(e) => setEmpForm({...empForm, isten_cikis: e.target.value})}
                          className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400" />
                      </div>
                    </div>
                    <input type="number" placeholder="Brut Ucret" value={empForm.brut_ucret} onChange={(e) => setEmpForm({...empForm, brut_ucret: e.target.value})}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400" />
                    <div className="flex space-x-2">
                      <button onClick={editingEmployee ? handleUpdateEmployee : handleAddEmployee}
                        className="flex-1 bg-yellow-500 text-blue-950 py-2 rounded-lg text-sm font-semibold hover:bg-yellow-400 transition-colors flex items-center justify-center space-x-1">
                        <Save className="w-4 h-4" /><span>Kaydet</span>
                      </button>
                      <button onClick={() => { setShowAddEmployee(false); setEditingEmployee(null) }}
                        className="bg-red-500/20 text-red-400 py-2 px-3 rounded-lg text-sm hover:bg-red-500/30 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Personel Listesi */}
              <div className="max-h-96 overflow-y-auto">
                {loading ? (
                  <div className="p-6 text-center text-gray-400">Yukleniyor...</div>
                ) : filteredEmployees.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">
                    <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Personel bulunamadi</p>
                    <p className="text-xs mt-1">Bordro Excel yukleyerek veya elle ekleyebilirsiniz</p>
                  </div>
                ) : (
                  filteredEmployees.map(emp => {
                    const isSelected = selectedEmployee?.id === emp.id
                    const izinHakki = emp.ise_giris ? hesaplaIzinHakki(emp.ise_giris, new Date(`${selectedYil}-12-31`)) : 0
                    return (
                      <div
                        key={emp.id}
                        onClick={() => setSelectedEmployee(emp)}
                        className={`p-3 border-b border-blue-700/20 cursor-pointer transition-colors ${
                          isSelected ? 'bg-yellow-500/10 border-l-2 border-l-yellow-400' : 'hover:bg-blue-800/30'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${isSelected ? 'text-yellow-400' : 'text-white'}`}>
                              {emp.ad_soyad}
                            </p>
                            <div className="flex items-center space-x-3 mt-1">
                              {emp.ise_giris && (
                                <span className="text-xs text-gray-500">
                                  {new Date(emp.ise_giris).toLocaleDateString('tr-TR')}
                                </span>
                              )}
                              {izinHakki > 0 && (
                                <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
                                  {izinHakki} gun
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-1 ml-2">
                            <button onClick={(e) => { e.stopPropagation(); startEditEmployee(emp) }}
                              className="text-gray-500 hover:text-blue-400 p-1 transition-colors">
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteEmployee(emp.id) }}
                              className="text-gray-500 hover:text-red-400 p-1 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          {/* Sag Panel - Izin Detay */}
          <div className="lg:col-span-2">
            {selectedEmployee ? (
              <div className="space-y-6">
                {/* Izin Ozeti */}
                {(() => {
                  const ozet = getIzinOzeti(selectedEmployee)
                  return (
                    <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-white font-semibold flex items-center space-x-2">
                          <User className="w-5 h-5 text-yellow-400" />
                          <span>{selectedEmployee.ad_soyad} - {selectedYil} Izin Durumu</span>
                        </h3>
                        <div className="flex items-center space-x-2">
                          <button onClick={() => setShowAddLeave(true)}
                            className="bg-yellow-500/20 text-yellow-400 px-3 py-1.5 rounded-lg text-sm hover:bg-yellow-500/30 transition-colors flex items-center space-x-1">
                            <Plus className="w-4 h-4" /><span>Izin Ekle</span>
                          </button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div className="bg-blue-900/30 rounded-xl p-3 text-center">
                          <p className="text-2xl font-bold text-green-400">{ozet.hakEdilen}</p>
                          <p className="text-xs text-gray-400 mt-1">Hak Edilen</p>
                        </div>
                        {ozet.oncekiYilKalan > 0 && (
                          <div className="bg-blue-900/30 rounded-xl p-3 text-center">
                            <p className="text-2xl font-bold text-blue-400">{ozet.oncekiYilKalan}</p>
                            <p className="text-xs text-gray-400 mt-1">Onceki Yil Devir</p>
                          </div>
                        )}
                        <div className="bg-blue-900/30 rounded-xl p-3 text-center">
                          <p className="text-2xl font-bold text-yellow-400">{ozet.toplam}</p>
                          <p className="text-xs text-gray-400 mt-1">Toplam Hak</p>
                        </div>
                        <div className="bg-blue-900/30 rounded-xl p-3 text-center">
                          <p className="text-2xl font-bold text-orange-400">{ozet.kullanilanBuYil}</p>
                          <p className="text-xs text-gray-400 mt-1">Kullanilan</p>
                        </div>
                        <div className="bg-blue-900/30 rounded-xl p-3 text-center">
                          <p className={`text-2xl font-bold ${ozet.kalan <= 0 ? 'text-red-400' : 'text-emerald-400'}`}>{ozet.kalan}</p>
                          <p className="text-xs text-gray-400 mt-1">Kalan</p>
                        </div>
                      </div>
                      
                      {/* Izin hakkinda bilgi */}
                      {selectedEmployee.ise_giris && (
                        <div className="mt-3 text-xs text-gray-500 flex items-center space-x-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>
                            Ise Giris: {new Date(selectedEmployee.ise_giris).toLocaleDateString('tr-TR')} | 
                            Calisma Suresi: {Math.floor((new Date(`${selectedYil}-12-31`) - new Date(selectedEmployee.ise_giris)) / (365.25 * 24 * 60 * 60 * 1000))} yil |
                            Is Kanunu Md.53
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Izin Ekleme Formu */}
                {showAddLeave && (
                  <div className="bg-blue-800/20 rounded-2xl p-6 border border-yellow-400/30">
                    <h4 className="text-white font-semibold mb-4 flex items-center space-x-2">
                      <Plus className="w-5 h-5 text-yellow-400" />
                      <span>Yeni Izin Kaydi</span>
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Baslangic Tarihi *</label>
                        <input type="date" value={leaveForm.baslangic} onChange={(e) => setLeaveForm({...leaveForm, baslangic: e.target.value})}
                          className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 px-3 text-white focus:outline-none focus:border-yellow-400" />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Bitis Tarihi *</label>
                        <input type="date" value={leaveForm.bitis} onChange={(e) => setLeaveForm({...leaveForm, bitis: e.target.value})}
                          className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 px-3 text-white focus:outline-none focus:border-yellow-400" />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Aciklama</label>
                        <input type="text" value={leaveForm.aciklama} onChange={(e) => setLeaveForm({...leaveForm, aciklama: e.target.value})}
                          className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 px-3 text-white focus:outline-none focus:border-yellow-400" />
                      </div>
                    </div>
                    
                    {hesaplananIsGunu > 0 && (
                      <div className="mt-3 bg-green-500/10 border border-green-500/30 rounded-xl p-3 flex items-center space-x-2">
                        <CheckCircle className="w-5 h-5 text-green-400" />
                        <span className="text-green-400 font-semibold">{hesaplananIsGunu} is gunu</span>
                        <span className="text-gray-400 text-sm">(Pazar ve resmi tatiller haric)</span>
                      </div>
                    )}
                    
                    <div className="flex space-x-3 mt-4">
                      <button onClick={handleAddLeave}
                        className="bg-yellow-500 text-blue-950 px-6 py-2.5 rounded-lg font-semibold hover:bg-yellow-400 transition-colors flex items-center space-x-2">
                        <Save className="w-4 h-4" /><span>Kaydet</span>
                      </button>
                      <button onClick={() => { setShowAddLeave(false); setLeaveForm({ baslangic: '', bitis: '', aciklama: 'Yillik Izin' }) }}
                        className="bg-red-500/20 text-red-400 px-6 py-2.5 rounded-lg font-medium hover:bg-red-500/30 transition-colors">
                        Iptal
                      </button>
                    </div>
                  </div>
                )}

                {/* Izin Gecmisi */}
                <div className="bg-blue-800/20 rounded-2xl border border-blue-700/30 overflow-hidden">
                  <div className="p-4 border-b border-blue-700/30 flex items-center justify-between">
                    <h3 className="text-white font-semibold flex items-center space-x-2">
                      <FileText className="w-5 h-5 text-yellow-400" />
                      <span>Izin Gecmisi - {selectedYil}</span>
                    </h3>
                    <div className="flex items-center space-x-2">
                      <button onClick={() => generateIzinBelgesi(selectedEmployee, allLeaveRecords)}
                        className="bg-blue-600/30 text-blue-300 px-3 py-1.5 rounded-lg text-sm hover:bg-blue-600/50 transition-colors flex items-center space-x-1">
                        <Download className="w-4 h-4" /><span>PDF</span>
                      </button>
                      <button onClick={exportExcel}
                        className="bg-green-600/30 text-green-300 px-3 py-1.5 rounded-lg text-sm hover:bg-green-600/50 transition-colors flex items-center space-x-1">
                        <FileSpreadsheet className="w-4 h-4" /><span>Excel</span>
                      </button>
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-blue-900/30">
                        <tr className="text-left text-gray-400 text-sm">
                          <th className="px-4 py-3">#</th>
                          <th className="px-4 py-3">Baslangic</th>
                          <th className="px-4 py-3">Bitis</th>
                          <th className="px-4 py-3 text-center">Is Gunu</th>
                          <th className="px-4 py-3">Aciklama</th>
                          <th className="px-4 py-3 text-center">Islem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaveRecords.length === 0 ? (
                          <tr>
                            <td colSpan="6" className="text-center py-8 text-gray-500">
                              <Calendar className="w-10 h-10 mx-auto mb-2 opacity-30" />
                              <p className="text-sm">{selectedYil} yilinda izin kaydi yok</p>
                            </td>
                          </tr>
                        ) : (
                          leaveRecords.map((r, i) => (
                            <tr key={r.id} className="border-t border-blue-700/20 hover:bg-blue-800/20 transition-colors">
                              <td className="px-4 py-3 text-gray-400 text-sm">{i + 1}</td>
                              <td className="px-4 py-3 text-white text-sm">{new Date(r.baslangic).toLocaleDateString('tr-TR')}</td>
                              <td className="px-4 py-3 text-white text-sm">{new Date(r.bitis).toLocaleDateString('tr-TR')}</td>
                              <td className="px-4 py-3 text-center">
                                <span className="bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded text-sm font-semibold">
                                  {r.is_gunu} gun
                                </span>
                              </td>
                              <td className="px-4 py-3 text-gray-300 text-sm">{r.aciklama || '-'}</td>
                              <td className="px-4 py-3 text-center">
                                <button onClick={() => handleDeleteLeave(r.id)}
                                  className="text-red-400 hover:text-red-300 transition-colors p-1">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Tum yillarin ozeti */}
                {allLeaveRecords.length > 0 && (
                  <div className="bg-blue-800/20 rounded-2xl p-4 border border-blue-700/30">
                    <h4 className="text-sm font-semibold text-gray-400 mb-3">Tum Yillar Ozeti</h4>
                    <div className="space-y-2">
                      {Object.entries(
                        allLeaveRecords.reduce((acc, r) => {
                          acc[r.yil] = (acc[r.yil] || 0) + (r.is_gunu || 0)
                          return acc
                        }, {})
                      ).sort(([a], [b]) => Number(b) - Number(a)).map(([yil, gun]) => (
                        <div key={yil} className="flex items-center justify-between py-1">
                          <span className={`text-sm ${Number(yil) === selectedYil ? 'text-yellow-400 font-semibold' : 'text-gray-300'}`}>
                            {yil}
                          </span>
                          <span className="text-sm text-gray-400">{gun} gun kullanildi</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-blue-800/20 rounded-2xl p-12 border border-blue-700/30 text-center">
                <Calendar className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 text-lg">Personel secin</p>
                <p className="text-gray-500 text-sm mt-1">Sol listeden bir personel secin veya bordro Excel yukleyin</p>
              </div>
            )}
          </div>
        </div>
      )}

      {!selectedClientId && (
        <div className="bg-blue-800/20 rounded-2xl p-12 border border-blue-700/30 text-center">
          <Briefcase className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">Musteri secin</p>
          <p className="text-gray-500 text-sm mt-1">Izin takip islemleri icin once bir musteri secmelisiniz</p>
        </div>
      )}
    </div>
  )
}
