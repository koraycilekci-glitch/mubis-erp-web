import { useEffect, useMemo, useState } from 'react'
import { Plus, Upload, Search, Users, CalendarClock, History, PieChart, ChevronLeft, ChevronRight, MoreVertical, Pencil, Trash2, ArrowRight, Calendar, Star, Clock, Activity, AlertTriangle, FileText, LayoutGrid, List } from 'lucide-react'
import * as XLSX from 'xlsx'
import {
  addEmployee,
  deleteEmployee,
  saveEmployeesFromExcel,
  updateEmployee,
  getLeaveRecords
} from '../../services/clientService'
import { brutUcretHesapla } from '../../utils/ucretUtils'
import { getSaglikRaporlari } from '../../services/saglikRaporService'
import { formatTurkishInput, parseTurkishNumber, hamTutarGirdisi } from '../../utils/numberFormat'
import {
  asArray,
  buildYearlyLeaveTable,
  createEmployeeForm,
  currentYear,
  dateValue,
  displayDate,
  employeeLabel,
  getSalaryType,
  isForeignWorker,
  isPastLeaveCleared,
  numberValue,
  pastBalances,
  workPermitDaysRemaining
} from './izinUtils'
import { readEmploymentNotice, uploadEmploymentNotice } from '../../services/personnelDocumentService'

const inputClass = 'w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-blue-200/40 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50'
const labelClass = 'text-xs font-medium text-blue-200/60'

function initials(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

const AVATAR_COLORS = [
  'from-blue-500 to-blue-700',
  'from-indigo-500 to-violet-700',
  'from-violet-500 to-purple-700',
  'from-emerald-500 to-teal-700',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-700',
  'from-cyan-500 to-blue-600',
  'from-teal-500 to-emerald-700'
]

function avatarGradient(name) {
  const key = (name || '').split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  return AVATAR_COLORS[key % AVATAR_COLORS.length]
}

const PAGE_SIZE = 12

function workPermitAlert(employee) {
  if (!isForeignWorker(employee)) return null
  const days = workPermitDaysRemaining(employee.calisma_izni_bitis)
  if (days === null || days > 30) return null
  const label = days < 0 ? `${Math.abs(days)} gün önce sona erdi` : days === 0 ? 'Bugün sona eriyor' : `${days} gün kaldı`
  return { days, label, expiry: displayDate(employee.calisma_izni_bitis) }
}

function EmployeeCardMenu({ onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg p-1.5 text-blue-200/40 transition-colors hover:bg-white/5 hover:text-white"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-20 w-36 overflow-hidden rounded-xl border border-white/10 bg-[#12183d] shadow-xl shadow-black/40">
            <button
              type="button"
              onClick={() => { setOpen(false); onEdit() }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-blue-100/80 hover:bg-white/5"
            >
              <Pencil className="h-4 w-4" /> Düzenle
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); onDelete() }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4" /> Sil
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default function PersonelKayitlari({ clientId, employees, reload, setLoading, setError, onTabChange }) {
  const [employeeForm, setEmployeeForm] = useState(createEmployeeForm)
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [showEmployeeForm, setShowEmployeeForm] = useState(false)
  const [leaveRecords, setLeaveRecords] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [deptFilter, setDeptFilter] = useState('all')
  const [statusTab, setStatusTab] = useState('tum')
  const [page, setPage] = useState(1)
  const [saglikRaporlari, setSaglikRaporlari] = useState([])
  const [employmentNoticeFile, setEmploymentNoticeFile] = useState(null)
  const [documentStatus, setDocumentStatus] = useState('')
  const [viewMode, setViewMode] = useState('grid')
  const [selectedIds, setSelectedIds] = useState(new Set())
  useEffect(() => {
    let active = true
    const load = async () => {
      if (!clientId) { setLeaveRecords([]); return }
      try {
        const result = await getLeaveRecords(clientId)
        if (active) setLeaveRecords(asArray(result))
      } catch {
        if (active) setLeaveRecords([])
      }
    }
    load()
    return () => { active = false }
  }, [clientId])

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!clientId) { setSaglikRaporlari([]); return }
      try {
        const result = await getSaglikRaporlari(clientId)
        if (active) setSaglikRaporlari(asArray(result))
      } catch {
        if (active) setSaglikRaporlari([])
      }
    }
    load()
    return () => { active = false }
  }, [clientId])

  const allEmployees = useMemo(() => employees || [], [employees])

  const isPassive = (employee) => Boolean(employee?.isten_cikis || employee?.cikis_tarihi || employee?.aktif === false)

  const activeEmployees = useMemo(() => allEmployees.filter((e) => !isPassive(e)), [allEmployees])
  const passiveEmployees = useMemo(() => allEmployees.filter((e) => isPassive(e)), [allEmployees])

  const leaveSummary = useMemo(() => {
    const map = {}
    for (const employee of allEmployees) {
      const rows = buildYearlyLeaveTable(employee, leaveRecords, { uptoYear: currentYear })
      const row = rows.length ? rows[rows.length - 1] : null
      map[employee.id] = row
        ? { opening: row.opening, earned: row.earned, used: row.used, remaining: row.remaining }
        : { opening: 0, earned: 0, used: 0, remaining: 0 }
    }
    return map
  }, [allEmployees, leaveRecords])

  const stats = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    let izinde = 0
    for (const employee of activeEmployees) {
      const onLeave = leaveRecords.some((record) => {
        if (String(record?.employee_id) !== String(employee.id)) return false
        const start = new Date(record?.baslangic || record?.baslangic_tarihi)
        const end = new Date(record?.bitis || record?.bitis_tarihi || record?.baslangic || record?.baslangic_tarihi)
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false
        return start <= today && today <= end
      })
      if (onLeave) izinde += 1
    }
    const kullanilan = activeEmployees.reduce((sum, e) => sum + (leaveSummary[e.id]?.used || 0), 0)
    const kalan = activeEmployees.reduce((sum, e) => sum + Math.max(0, leaveSummary[e.id]?.remaining || 0), 0)
    return { toplam: activeEmployees.length, izinde, kullanilan, kalan }
  }, [activeEmployees, leaveRecords, leaveSummary])

  const departments = useMemo(() => {
    const set = new Set(allEmployees.map((e) => e?.departman).filter(Boolean))
    return Array.from(set).sort((a, b) => String(a).localeCompare(String(b), 'tr'))
  }, [allEmployees])

  // Raporlu personel: TC'si ile eslesen ve bugunu kapsayan saglik raporu olan
  // personel (SGK'dan veya elle girilmis). Raporda olan kisi izinde gibi
  // degerlendirilir.
  const aktifRaporMap = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const map = new Map()
    for (const r of saglikRaporlari) {
      const start = new Date(String(r?.rapor_baslangic || '').slice(0, 10))
      const end = new Date(String(r?.rapor_bitis || r?.rapor_baslangic || '').slice(0, 10))
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue
      if (!(start <= today && today <= end)) continue
      const anahtar = String(r?.tc_kimlik || '').replace(/\D/g, '')
      if (anahtar) map.set(anahtar, r)
    }
    return map
  }, [saglikRaporlari])

  const raporluEmployees = useMemo(() => {
    if (!aktifRaporMap.size) return []
    return allEmployees.filter((e) => aktifRaporMap.has(String(e?.tc_kimlik || '').replace(/\D/g, '')))
  }, [allEmployees, aktifRaporMap])

  // Izinde olan personel (bugunu kapsayan izin kaydi olan aktif personel)
  const izindeEmployees = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return activeEmployees.filter((employee) => leaveRecords.some((record) => {
      if (String(record?.employee_id) !== String(employee.id)) return false
      const start = new Date(record?.baslangic || record?.baslangic_tarihi)
      const end = new Date(record?.bitis || record?.bitis_tarihi || record?.baslangic || record?.baslangic_tarihi)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false
      return start <= today && today <= end
    }))
  }, [activeEmployees, leaveRecords])

  const filteredEmployees = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase('tr-TR')
    let list = allEmployees
    if (statusTab === 'aktif') list = activeEmployees
    else if (statusTab === 'pasif') list = passiveEmployees
    else if (statusTab === 'raporlu') list = raporluEmployees
    else if (statusTab === 'izinde') list = izindeEmployees

    return list.filter((employee) => {
      if (query) {
        const haystack = `${employeeLabel(employee)} ${employee?.tc_kimlik || ''}`.toLocaleLowerCase('tr-TR')
        if (!haystack.includes(query)) return false
      }
      if (deptFilter !== 'all' && (employee?.departman || '') !== deptFilter) return false
      return true
    })
  }, [allEmployees, activeEmployees, passiveEmployees, raporluEmployees, izindeEmployees, statusTab, searchTerm, deptFilter])

  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginatedEmployees = filteredEmployees.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  useEffect(() => { setPage(1) }, [searchTerm, deptFilter, statusTab, clientId])

  const updateEmployeeForm = (event) => {
    const { name, value, type, checked } = event.target
    setEmployeeForm((previous) => ({
      ...previous,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const readEmploymentNoticeFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setEmploymentNoticeFile(file)
    setDocumentStatus('İşe giriş bildirgesi okunuyor...')
    try {
      const { fields, ocrUsed } = await readEmploymentNotice(file)
      setEmployeeForm((previous) => ({
        ...previous,
        ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value))
      }))
      setDocumentStatus(ocrUsed ? 'PDF okundu; alanları kaydetmeden önce kontrol edin.' : 'PDF metni okundu; alanları kaydetmeden önce kontrol edin.')
    } catch (readError) {
      setDocumentStatus(readError?.message || 'İşe giriş bildirgesi okunamadı.')
    }
  }

  const togglePastLeave = (event) => {
    const used = event.target.checked
    setEmployeeForm((previous) => ({
      ...previous,
      gecmis_yil_izinleri_kullanildi: used,
      gecmis_yil_bakiyeleri: used
        ? []
        : (previous.gecmis_yil_bakiyeleri?.length
          ? previous.gecmis_yil_bakiyeleri
          : [{ yil: currentYear - 1, gun: 0 }])
    }))
  }

  const addPastBalance = () => {
    setEmployeeForm((previous) => {
      const balances = Array.isArray(previous.gecmis_yil_bakiyeleri) ? previous.gecmis_yil_bakiyeleri : []
      const lastYear = balances.length ? numberValue(balances[balances.length - 1]?.yil) : currentYear
      return {
        ...previous,
        gecmis_yil_izinleri_kullanildi: false,
        gecmis_yil_bakiyeleri: [...balances, { yil: (lastYear || currentYear) - 1, gun: 0 }]
      }
    })
  }

  const updatePastBalance = (index, field, value) => {
    setEmployeeForm((previous) => ({
      ...previous,
      gecmis_yil_izinleri_kullanildi: false,
      gecmis_yil_bakiyeleri: (previous.gecmis_yil_bakiyeleri || []).map((item, itemIndex) => (
        itemIndex === index ? { ...item, [field]: value } : item
      ))
    }))
  }

  const removePastBalance = (index) => {
    setEmployeeForm((previous) => ({
      ...previous,
      gecmis_yil_bakiyeleri: (previous.gecmis_yil_bakiyeleri || []).filter((_, itemIndex) => itemIndex !== index)
    }))
  }

  const resetEmployee = () => {
    setEmployeeForm(createEmployeeForm())
    setEditingEmployee(null)
    setEmploymentNoticeFile(null)
    setDocumentStatus('')
    setShowEmployeeForm(false)
  }

  const editEmployee = (employee) => {
    setEditingEmployee(employee)
    setEmploymentNoticeFile(null)
    setDocumentStatus('')
    setEmployeeForm({
      ...createEmployeeForm(),
      ...employee,
      ise_giris_tarihi: dateValue(employee.ise_giris || employee.ise_giris_tarihi),
      cikis_tarihi: dateValue(employee.isten_cikis || employee.cikis_tarihi),
      dogum_tarihi: dateValue(employee.dogum_tarihi),
      calisma_izni_baslangic: dateValue(employee.calisma_izni_baslangic),
      calisma_izni_bitis: dateValue(employee.calisma_izni_bitis),
      net_ucret: employee.net_ucret != null ? formatTurkishInput(employee.net_ucret) : '',
      brut_ucret: employee.brut_ucret != null ? formatTurkishInput(employee.brut_ucret) : '',
      gecmis_yil_izinleri_kullanildi: isPastLeaveCleared(employee),
      gecmis_yil_bakiyeleri: isPastLeaveCleared(employee)
        ? []
        : (pastBalances(employee).length ? pastBalances(employee) : [{ yil: currentYear - 1, gun: 0 }])
    })
    setShowEmployeeForm(true)
  }

  const saveEmployee = async (event) => {
    event.preventDefault()
    if (!clientId || !String(employeeForm.ad_soyad || '').trim()) return

    setLoading(true)
    setError('')
    try {
      const sanitizedBalances = employeeForm.gecmis_yil_izinleri_kullanildi
        ? []
        : (employeeForm.gecmis_yil_bakiyeleri || [])
          .map((item) => ({ yil: numberValue(item.yil), gun: numberValue(item.gun) }))
          .filter((item) => item.yil > 0 && item.gun >= 0)
      const payload = {
        ...employeeForm,
        client_id: clientId,
        tc_kimlik: String(employeeForm.tc_kimlik || '').replace(/\D/g, ''),
        ise_giris: employeeForm.ise_giris_tarihi || null,
        isten_cikis: employeeForm.cikis_tarihi || null,
        dogum_tarihi: employeeForm.dogum_tarihi || null,
        calisma_izni_baslangic: isForeignWorker(employeeForm) ? employeeForm.calisma_izni_baslangic || null : null,
        calisma_izni_bitis: isForeignWorker(employeeForm) ? employeeForm.calisma_izni_bitis || null : null,
        ise_giris_bildirge_url: employeeForm.ise_giris_bildirge_url || null,
        gorev: employeeForm.gorev || '',
        departman: employeeForm.departman || '',
        gecmis_yil_izinleri_kullanildi: employeeForm.gecmis_yil_izinleri_kullanildi === true,
        gecmis_yil_bakiyeleri: sanitizedBalances,
        ucret_tipi: employeeForm.ucret_tipi === 'net' ? 'net' : 'brut',
        net_ucret: employeeForm.ucret_tipi === 'net'
          ? (employeeForm.net_ucret === '' ? null : parseTurkishNumber(employeeForm.net_ucret))
          : null,
        brut_ucret: employeeForm.ucret_tipi === 'brut'
          ? (employeeForm.brut_ucret === '' ? null : parseTurkishNumber(employeeForm.brut_ucret))
          : null,
        net_maas: employeeForm.ucret_tipi === 'net'
          ? (employeeForm.net_ucret === '' ? null : parseTurkishNumber(employeeForm.net_ucret))
          : null,
        brut_maas: employeeForm.ucret_tipi === 'brut'
          ? (employeeForm.brut_ucret === '' ? null : parseTurkishNumber(employeeForm.brut_ucret))
          : null
      }

      let savedEmployee
      if (editingEmployee?.id) {
        savedEmployee = await updateEmployee(editingEmployee.id, payload)
      } else {
        savedEmployee = await addEmployee(Number(clientId), payload)
      }
      if (employmentNoticeFile && savedEmployee?.id) {
        setEditingEmployee(savedEmployee)
        const documentPath = await uploadEmploymentNotice({ clientId, employeeId: savedEmployee.id, file: employmentNoticeFile })
        await updateEmployee(savedEmployee.id, { ise_giris_bildirge_url: documentPath })
      }
      resetEmployee()
      await reload()
    } catch (saveError) {
      setError(saveError?.message || 'Personel kaydedilemedi.')
      setLoading(false)
    }
  }

  const removeEmployee = async (employee) => {
    if (!employee?.id || !window.confirm(`${employeeLabel(employee)} silinsin mi?`)) return
    setLoading(true)
    setError('')
    try {
      await deleteEmployee(employee.id)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(employee.id)
        return next
      })
      await reload()
    } catch (deleteError) {
      setError(deleteError?.message || 'Personel silinemedi.')
      setLoading(false)
    }
  }

  const toggleSelectEmployee = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAllVisible = () => {
    const ids = paginatedEmployees.map((e) => e.id)
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id))
    setSelectedIds(allSelected ? new Set() : new Set(ids))
  }

  const removeSelectedEmployees = async () => {
    if (!selectedIds.size) return
    if (!window.confirm(`${selectedIds.size} personel silinsin mi?`)) return
    setLoading(true)
    setError('')
    try {
      for (const id of selectedIds) {
        await deleteEmployee(id)
      }
      setSelectedIds(new Set())
      await reload()
    } catch (deleteError) {
      setError(deleteError?.message || 'Toplu silme başarısız.')
      setLoading(false)
    }
  }

  const excelTarihToISO = (value) => {
    if (value == null || value === '') return null
    if (typeof value === 'number') {
      const date = new Date(Math.round((value - 25569) * 86400 * 1000))
      if (Number.isNaN(date.getTime())) return null
      return date.toISOString().slice(0, 10)
    }
    const s = String(value).trim()
    if (!s) return null
    let m = s.match(/^(\\d{1,2})[.\\/\\-](\\d{1,2})[.\\/\\-](\\d{4})$/)
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    m = s.match(/^(\\d{4})-(\\d{1,2})-(\\d{1,2})$/)
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    return null
  }

  const uploadExcel = async (event) => {
    const file = event.target.files?.[0]
    if (!file || !clientId) return

    setLoading(true)
    setError('')
    try {
      const rows = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (ev) => {
          try {
            const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' })
            const sheet = wb.Sheets[wb.SheetNames[0]]
            resolve(XLSX.utils.sheet_to_json(sheet, { defval: '' }))
          } catch (err) { reject(err) }
        }
        reader.onerror = () => reject(new Error('Dosya okunamadı.'))
        reader.readAsArrayBuffer(file)
      })

      const parsedEmployees = (rows || [])
        .map((r) => {
          const ad = String(r['Adı'] || r['Adi'] || r['Ad'] || '').trim()
          const soyad = String(r['Soyadı'] || r['Soyadi'] || r['Soyad'] || '').trim()
          const adSoyad = `${ad} ${soyad}`.trim()
          if (!adSoyad) return null
          return {
            ad_soyad: adSoyad,
            tc_kimlik: String(r['TC Kimlik No'] || r['TC'] || r['TCKN'] || '').trim(),
            ise_giris: excelTarihToISO(r['İşe Giriş Tarihi'] || r['Ise Giris Tarihi'] || r['İşe Giriş'] || r['Ise Giris']),
            isten_cikis: excelTarihToISO(r['İşten Çıkış Tarihi'] || r['Isten Cikis Tarihi'] || r['İşten Çıkış'] || r['Isten Cikis']),
            brut_ucret: Number(String(r['Ücret'] || r['Ucret'] || 0).replace(/[^0-9.,-]/g, '').replace(/\./g, '').replace(',', '.')) || 0,
            dogum_tarihi: excelTarihToISO(r['Doğum Tarihi'] || r['Dogum Tarihi']),
          }
        })
        .filter(Boolean)

      if (!parsedEmployees.length) {
        throw new Error('Excel içinde personel satırı bulunamadı. Sütun başlıkları: Adı, Soyadı, TC Kimlik No, İşe Giriş Tarihi, Ücret.')
      }

      // Daha önce yüklenen personeli (ad soyad + işe giriş tarihi aynı) tekrar ekleme
      const mevcutListe = allEmployees || []
      const mevcutKeys = new Set(mevcutListe.map((e) => `${String(e.ad_soyad || e.adSoyad || '').trim().toLocaleLowerCase('tr')}|${e.ise_giris || e.ise_giris_tarihi || ''}`))
      const yeni = parsedEmployees.filter((e) => !mevcutKeys.has(`${String(e.ad_soyad || '').trim().toLocaleLowerCase('tr')}|${e.ise_giris || ''}`))

      if (!yeni.length) {
        setError('Yüklenen personeller zaten kayıtlı; yeni kayıt eklenmedi.')
        setLoading(false)
        return
      }

      await saveEmployeesFromExcel(clientId, yeni)
      await reload()
    } catch (uploadError) {
      setError(uploadError?.message || 'Excel yüklenemedi.')
      setLoading(false)
    } finally {
      event.target.value = ''
    }
  }

  const statCards = [
    { key: 'toplam', label: 'Toplam Personel', value: stats.toplam, sub: 'Aktif çalışan personel sayısı', icon: Users, iconBg: 'bg-blue-500/15', iconFg: 'text-blue-400', border: 'hover:border-blue-500/40' },
    { key: 'izinde', label: 'İzinde Olan', value: stats.izinde, sub: 'Şu anda izinde olan personel', icon: CalendarClock, iconBg: 'bg-emerald-500/15', iconFg: 'text-emerald-400', border: 'hover:border-emerald-500/40' },
    { key: 'raporlu', label: 'Raporlu Personel', value: raporluEmployees.length, sub: 'Şu anda raporlu (istirahat) personel', icon: Activity, iconBg: 'bg-rose-500/15', iconFg: 'text-rose-400', border: 'hover:border-rose-500/40' },
    { key: 'kullanilan', label: 'Kullanılan İzin (Yıl)', value: stats.kullanilan, sub: 'Bu yıl kullanılan toplam izin günü', icon: History, iconBg: 'bg-amber-500/15', iconFg: 'text-amber-400', border: 'hover:border-amber-500/40' },
    { key: 'kalan', label: 'Kalan İzin (Toplam)', value: stats.kalan, sub: 'Toplam kalan izin günü', icon: PieChart, iconBg: 'bg-violet-500/15', iconFg: 'text-violet-400', border: 'hover:border-violet-500/40' }
  ]

  const statusTabs = [
    { id: 'tum', label: 'Tüm Personel', count: allEmployees.length },
    { id: 'aktif', label: 'Aktif Personel', count: activeEmployees.length },
    { id: 'pasif', label: 'Pasif Personel', count: passiveEmployees.length },
    { id: 'izinde', label: 'İzinde Olan', count: izindeEmployees.length },
    { id: 'raporlu', label: 'Raporlu Personel', count: raporluEmployees.length }
  ]

  // "Detaylari Gor" baglantilari: ilgili listeye/sekme'ye goturur
  const kartDetayGit = (key) => {
    if (key === 'kullanilan' || key === 'kalan') {
      if (typeof onTabChange === 'function') onTabChange('izin')
      else setStatusTab('tum')
      return
    }
    setPage(1)
    setStatusTab(key === 'toplam' ? 'tum' : key)
  }

  const kartDetayEtiket = (key) => (key === 'kullanilan' || key === 'kalan') ? 'İzin Kayıtlarına Git' : 'Detayları Gör'

  return (
    <div className="space-y-6">
      {/* İstatistik kartları */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        {statCards.map((card) => (
          <div
            key={card.key}
            className={`rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm transition-colors ${card.border}`}
          >
            <div className="flex items-center gap-4">
              <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${card.iconBg}`}>
                <card.icon className={`h-6 w-6 ${card.iconFg}`} />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold text-white">{card.value}</p>
                <p className="truncate text-sm font-medium text-blue-100/80">{card.label}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
              <p className="truncate text-xs text-blue-200/40">{card.sub}</p>
              <button
                type="button"
                onClick={() => kartDetayGit(card.key)}
                className={`flex flex-shrink-0 items-center gap-1 text-xs font-medium transition-opacity hover:opacity-70 ${card.iconFg}`}
                title={card.key === 'raporlu' ? 'Raporlu personel listesini göster' : card.key === 'izinde' ? 'İzinde olan personeli göster' : 'Detayları görüntüle'}
              >
                {kartDetayEtiket(card.key)} <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Durum sekmeleri */}
      <div className="flex flex-wrap items-center gap-1 border-b border-white/10">
        {statusTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setStatusTab(tab.id)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              statusTab === tab.id
                ? 'border-blue-500 text-white'
                : 'border-transparent text-blue-200/50 hover:text-blue-100'
            }`}
          >
            {tab.label}
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              statusTab === tab.id ? 'bg-blue-500 text-white' : 'bg-white/10 text-blue-200/60'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Araç çubuğu */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-200/40" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Personel adı, soyadı veya TC kimlik ile ara..."
            className={`${inputClass} pl-10`}
          />
        </div>
        <select value={deptFilter} onChange={(event) => setDeptFilter(event.target.value)} className={`${inputClass} w-auto min-w-[180px]`}>
          <option value="all">Tüm Departmanlar</option>
          {departments.map((dept) => (
            <option key={dept} value={dept}>{dept}</option>
          ))}
        </select>
        <div className="flex rounded-lg border border-white/10 bg-white/5 p-1">
          <button type="button" onClick={() => setViewMode('grid')} aria-label="Kart görünümü" aria-pressed={viewMode === 'grid'} className={`rounded-md p-2 ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-blue-200/60 hover:text-white'}`}>
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setViewMode('list')} aria-label="Liste görünümü" aria-pressed={viewMode === 'list'} className={`rounded-md p-2 ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-blue-200/60 hover:text-white'}`}>
            <List className="h-4 w-4" />
          </button>
        </div>
        <label className={`flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-blue-100/80 hover:bg-white/10 ${!clientId ? 'pointer-events-none opacity-50' : ''}`}>
          <Upload className="h-4 w-4" /> Excel Yükle
          <input type="file" accept=".xlsx,.xls,.csv" onChange={uploadExcel} className="hidden" disabled={!clientId} />
        </label>
        {selectedIds.size > 0 && (
          <button
            type="button"
            onClick={removeSelectedEmployees}
            className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-300 hover:bg-red-500/20"
          >
            <Trash2 className="h-4 w-4" /> Toplu Sil ({selectedIds.size})
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setEmployeeForm(createEmployeeForm())
            setEditingEmployee(null)
            setEmploymentNoticeFile(null)
            setDocumentStatus('')
            setShowEmployeeForm(true)
          }}
          disabled={!clientId}
          className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Personel Ekle
        </button>
      </div>

      {!clientId && (
        <p className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-200">Önce müşteri seçin.</p>
      )}

      {/* Personel formu */}
      {showEmployeeForm && (
        <form onSubmit={saveEmployee} className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm md:grid-cols-2">
          <h3 className="text-base font-semibold text-white md:col-span-2">
            {editingEmployee ? 'Personel Düzenle' : 'Yeni Personel'}
          </h3>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-blue-100/80 hover:bg-white/10 md:col-span-2">
            <FileText className="h-4 w-4" />
            <span>{employmentNoticeFile?.name || 'İşe giriş bildirgesi PDF yükle ve alanları doldur'}</span>
            <input type="file" accept="application/pdf,.pdf" onChange={readEmploymentNoticeFile} className="hidden" />
          </label>
          {documentStatus && <p className="text-xs text-blue-200/70 md:col-span-2">{documentStatus}</p>}
          <label className="space-y-1">
            <span className={labelClass}>Ad soyad *</span>
            <input name="ad_soyad" value={employeeForm.ad_soyad} onChange={updateEmployeeForm} placeholder="Personelin ad soyadı" required className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className={labelClass}>T.C. kimlik numarası</span>
            <input name="tc_kimlik" value={employeeForm.tc_kimlik} onChange={updateEmployeeForm} placeholder="11 haneli T.C. kimlik numarası" className={inputClass} />
          </label>
          {isForeignWorker(employeeForm) && (
            <>
              <label className="space-y-1">
                <span className={labelClass}>Çalışma izni başlangıç tarihi</span>
                <input name="calisma_izni_baslangic" type="date" value={employeeForm.calisma_izni_baslangic} onChange={updateEmployeeForm} className={inputClass} />
              </label>
              <label className="space-y-1">
                <span className={labelClass}>Çalışma izni bitiş tarihi</span>
                <input name="calisma_izni_bitis" type="date" value={employeeForm.calisma_izni_bitis} onChange={updateEmployeeForm} className={inputClass} />
              </label>
            </>
          )}
          <label className="space-y-1">
            <span className={labelClass}>İşe giriş tarihi</span>
            <input name="ise_giris_tarihi" type="date" value={employeeForm.ise_giris_tarihi} onChange={updateEmployeeForm} className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className={labelClass}>İşten çıkış tarihi</span>
            <input name="cikis_tarihi" type="date" value={employeeForm.cikis_tarihi} onChange={updateEmployeeForm} className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className={labelClass}>Doğum tarihi</span>
            <input name="dogum_tarihi" type="date" value={employeeForm.dogum_tarihi} onChange={updateEmployeeForm} className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className={labelClass}>Departman</span>
            <input name="departman" value={employeeForm.departman} onChange={updateEmployeeForm} placeholder="Örn. Muhasebe" className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className={labelClass}>Görev / pozisyon</span>
            <input name="gorev" value={employeeForm.gorev} onChange={updateEmployeeForm} placeholder="Örn. Muhasebe elemanı" className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className={labelClass}>Telefon numarası</span>
            <input name="telefon" value={employeeForm.telefon} onChange={updateEmployeeForm} placeholder="05xx xxx xx xx" className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className={labelClass}>Ücret türü</span>
            <select name="ucret_tipi" value={employeeForm.ucret_tipi} onChange={updateEmployeeForm} className={inputClass}>
              <option value="brut">Brüt ücret</option>
              <option value="net">Net ücret</option>
            </select>
          </label>
          {employeeForm.ucret_tipi === 'net' ? (
            <label className="space-y-1">
              <span className={labelClass}>Net ücret (TL)</span>
              <input name="net_ucret" type="text" inputMode="decimal" value={employeeForm.net_ucret} onChange={(event) => setEmployeeForm((previous) => ({ ...previous, net_ucret: hamTutarGirdisi(event.target.value) }))} onBlur={(event) => setEmployeeForm((previous) => ({ ...previous, net_ucret: formatTurkishInput(event.target.value) }))} placeholder="Net ücret tutarı" className={inputClass} />
            </label>
          ) : (
            <label className="space-y-1">
              <span className={labelClass}>Brüt ücret (TL)</span>
              <input name="brut_ucret" type="text" inputMode="decimal" value={employeeForm.brut_ucret} onChange={(event) => setEmployeeForm((previous) => ({ ...previous, brut_ucret: hamTutarGirdisi(event.target.value) }))} onBlur={(event) => setEmployeeForm((previous) => ({ ...previous, brut_ucret: formatTurkishInput(event.target.value) }))} placeholder="Brüt ücret tutarı" className={inputClass} />
            </label>
          )}

          <label className="flex items-center gap-2 text-sm text-blue-100/80 md:col-span-2">
            <input
              type="checkbox"
              checked={employeeForm.gecmis_yil_izinleri_kullanildi === true}
              onChange={togglePastLeave}
              className="h-4 w-4 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500/50"
            />
            Geçmiş yıl izinleri kullanıldı; eski bakiyeleri sıfırla
          </label>

          {employeeForm.gecmis_yil_izinleri_kullanildi !== true && (
            <div className="space-y-2 rounded-xl border border-white/10 bg-blue-950/20 p-4 md:col-span-2">
              <div className="flex items-center justify-between">
                <span className={labelClass}>Geçmiş yıllardan kalan izin bakiyesi (sistem öncesi)</span>
                <button type="button" onClick={addPastBalance} className="rounded-lg border border-white/10 px-3 py-1 text-xs text-blue-100/80 hover:bg-white/5">
                  + Yıl ekle
                </button>
              </div>
              {(employeeForm.gecmis_yil_bakiyeleri || []).map((balance, index) => (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min="2000"
                    max={currentYear - 1}
                    value={balance.yil}
                    onChange={(event) => updatePastBalance(index, 'yil', event.target.value)}
                    className={`${inputClass} w-28`}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={balance.gun}
                    onChange={(event) => updatePastBalance(index, 'gun', event.target.value)}
                    placeholder="Kalan gün"
                    className={`${inputClass} w-36`}
                  />
                  <button type="button" onClick={() => removePastBalance(index)} className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20">
                    Sil
                  </button>
                </div>
              ))}
              {!(employeeForm.gecmis_yil_bakiyeleri || []).length && (
                <p className="text-xs text-blue-200/40">Kayıtlı geçmiş bakiye yok.</p>
              )}
            </div>
          )}

          <div className="flex gap-2 md:col-span-2">
            <button type="submit" className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:from-blue-500 hover:to-indigo-500">Kaydet</button>
            <button type="button" onClick={resetEmployee} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-blue-100/80 hover:bg-white/5">Vazgeç</button>
          </div>
        </form>
      )}

      {/* Personel kartları */}
      {paginatedEmployees.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center text-sm text-blue-200/40">
          {clientId ? 'Personel bulunamadı.' : 'Personel listelemek için müşteri seçin.'}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {paginatedEmployees.map((employee) => {
            const summary = leaveSummary[employee.id] || { opening: 0, earned: 0, used: 0, remaining: 0 }
            const salaryType = getSalaryType(employee)
            const brutSalary = salaryType === 'net'
              ? brutUcretHesapla(employee)
              : numberValue(employee.brut_ucret ?? employee.brut_maas)
            const passive = isPassive(employee)
            const aktifRapor = aktifRaporMap.get(String(employee?.tc_kimlik || '').replace(/\D/g, ''))
            const permitNotice = workPermitAlert(employee)

            return (
              <div
                key={employee.id}
                onClick={() => editEmployee(employee)}
                className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm transition-colors hover:border-white/20 cursor-pointer"
              >
                <div className="flex items-center gap-2 mb-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(employee.id)}
                    onChange={() => toggleSelectEmployee(employee.id)}
                    className="h-4 w-4 rounded border-white/20 bg-white/5 text-blue-600 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-start gap-3">
                  <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white shadow-lg ${avatarGradient(employeeLabel(employee))}`}>
                    {initials(employeeLabel(employee))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-white">{employeeLabel(employee)}</p>
                    <p className="truncate text-xs text-blue-200/60">{employee.gorev || '—'}</p>
                    <p className="truncate text-xs text-blue-200/40">{employee.departman || '—'}</p>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <EmployeeCardMenu onEdit={() => editEmployee(employee)} onDelete={() => removeEmployee(employee)} />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {permitNotice && (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${permitNotice.days < 0 ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'}`} title={`Çalışma izni bitişi: ${permitNotice.expiry}`}>
                      <AlertTriangle className="h-3.5 w-3.5" /> {permitNotice.label}
                    </span>
                  )}
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${passive ? 'bg-white/10 text-blue-200/50' : 'bg-emerald-500/15 text-emerald-400'}`}>
                    {passive ? 'Pasif' : 'Aktif'}
                  </span>
                  {aktifRapor && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-0.5 text-xs font-medium text-rose-300"
                      title={`${aktifRapor.nitelik || 'İstirahat'} — ${displayDate(aktifRapor.rapor_baslangic)} / ${displayDate(aktifRapor.rapor_bitis)}`}
                    >
                      <Activity className="h-3 w-3" /> Raporlu
                    </span>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/5 pt-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 flex-shrink-0 text-blue-200/30" />
                    <div>
                      <p className="text-[11px] text-blue-200/40">Giriş Tarihi</p>
                      <p className="text-sm font-medium text-white">{displayDate(employee.ise_giris || employee.ise_giris_tarihi) || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 flex-shrink-0 text-blue-200/30" />
                    <div>
                      <p className="text-[11px] text-blue-200/40">Yıllık İzin Hakkı</p>
                      <p className="text-sm font-medium text-white">{summary.earned.toFixed(1).replace(/\.0$/, '')} gün</p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/5 pt-3 text-center">
                  <div>
                    <p className="text-[11px] text-blue-200/40">Hak Edilen</p>
                    <p className="text-sm font-semibold text-blue-400">{(summary.opening + summary.earned).toFixed(1).replace(/\.0$/, '')} gün</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-blue-200/40">Kullanılan</p>
                    <p className="text-sm font-semibold text-amber-400">{summary.used.toFixed(1).replace(/\.0$/, '')} gün</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-blue-200/40">Kalan</p>
                    <p className="text-sm font-semibold text-emerald-400">{Math.max(0, summary.remaining).toFixed(1).replace(/\.0$/, '')} gün</p>
                  </div>
                </div>

                <p className="mt-3 border-t border-white/5 pt-3 text-xs text-blue-200/40">
                  Brüt: {brutSalary.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
                </p>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
          <table className="min-w-full divide-y divide-white/10 text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-blue-200/50">
              <tr>
                <th className="px-4 py-3 font-medium">
                  <input
                    type="checkbox"
                    checked={paginatedEmployees.length > 0 && paginatedEmployees.every((e) => selectedIds.has(e.id))}
                    onChange={toggleSelectAllVisible}
                    className="h-4 w-4 rounded border-white/20 bg-white/5 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Personel</th>
                <th className="px-4 py-3 font-medium">Görev / departman</th>
                <th className="px-4 py-3 font-medium">İşe giriş</th>
                <th className="px-4 py-3 font-medium">Çalışma izni</th>
                <th className="px-4 py-3 font-medium">Durum</th>
                <th className="px-4 py-3 font-medium"><span className="sr-only">İşlemler</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {paginatedEmployees.map((employee) => {
                const permitNotice = workPermitAlert(employee)
                return (
                  <tr key={employee.id} className="text-blue-100/80 hover:bg-white/[0.03]">
                    <td className="whitespace-nowrap px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(employee.id)}
                        onChange={() => toggleSelectEmployee(employee.id)}
                        className="h-4 w-4 rounded border-white/20 bg-white/5 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-white">{employeeLabel(employee)}</td>
                    <td className="px-4 py-3">{employee.gorev || '—'}{employee.departman ? ` · ${employee.departman}` : ''}</td>
                    <td className="whitespace-nowrap px-4 py-3">{displayDate(employee.ise_giris || employee.ise_giris_tarihi) || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {isForeignWorker(employee) ? displayDate(employee.calisma_izni_bitis) || 'Tarih girilmedi' : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {permitNotice ? (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${permitNotice.days < 0 ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'}`}>
                          <AlertTriangle className="h-3.5 w-3.5" /> {permitNotice.label}
                        </span>
                      ) : (
                        <span className={`rounded-full px-2.5 py-1 text-xs ${isPassive(employee) ? 'bg-white/10 text-blue-200/50' : 'bg-emerald-500/15 text-emerald-400'}`}>
                          {isPassive(employee) ? 'Pasif' : 'Aktif'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right"><EmployeeCardMenu onEdit={() => editEmployee(employee)} onDelete={() => removeEmployee(employee)} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Sayfalama */}
      {filteredEmployees.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-blue-200/40">Toplam {filteredEmployees.length} personel</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="rounded-lg border border-white/10 p-2 text-blue-200/50 hover:bg-white/5 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                onClick={() => setPage(pageNumber)}
                className={`h-9 w-9 rounded-lg text-sm font-medium transition-colors ${
                  pageNumber === safePage
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white'
                    : 'border border-white/10 text-blue-200/60 hover:bg-white/5'
                }`}
              >
                {pageNumber}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="rounded-lg border border-white/10 p-2 text-blue-200/50 hover:bg-white/5 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
