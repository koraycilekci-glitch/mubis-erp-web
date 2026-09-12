import { useEffect, useMemo, useState } from 'react'
import { Plus, Upload, Search, Users, CalendarClock, History, PieChart, ChevronLeft, ChevronRight, MoreVertical, Pencil, Trash2, ArrowRight, Calendar, Star, Clock } from 'lucide-react'
import {
  addEmployee,
  deleteEmployee,
  saveEmployeesFromExcel,
  updateEmployee,
  getLeaveRecords
} from '../../services/clientService'
import { brutUcretHesapla } from '../../utils/ucretUtils'
import { formatTurkishInput, parseTurkishNumber } from '../../utils/numberFormat'
import {
  asArray,
  buildYearlyLeaveTable,
  createEmployeeForm,
  currentYear,
  dateValue,
  displayDate,
  employeeLabel,
  getSalaryType,
  isPastLeaveCleared,
  numberValue,
  pastBalances
} from './izinUtils'

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

export default function PersonelKayitlari({ clientId, employees, reload, setLoading, setError }) {
  const [employeeForm, setEmployeeForm] = useState(createEmployeeForm)
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [showEmployeeForm, setShowEmployeeForm] = useState(false)
  const [leaveRecords, setLeaveRecords] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [deptFilter, setDeptFilter] = useState('all')
  const [statusTab, setStatusTab] = useState('tum')
  const [page, setPage] = useState(1)

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

  const filteredEmployees = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase('tr-TR')
    let list = allEmployees
    if (statusTab === 'aktif') list = activeEmployees
    else if (statusTab === 'pasif') list = passiveEmployees

    return list.filter((employee) => {
      if (query) {
        const haystack = `${employeeLabel(employee)} ${employee?.tc_kimlik || ''}`.toLocaleLowerCase('tr-TR')
        if (!haystack.includes(query)) return false
      }
      if (deptFilter !== 'all' && (employee?.departman || '') !== deptFilter) return false
      return true
    })
  }, [allEmployees, activeEmployees, passiveEmployees, statusTab, searchTerm, deptFilter])

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
    setShowEmployeeForm(false)
  }

  const editEmployee = (employee) => {
    setEditingEmployee(employee)
    setEmployeeForm({
      ...createEmployeeForm(),
      ...employee,
      ise_giris_tarihi: dateValue(employee.ise_giris || employee.ise_giris_tarihi),
      cikis_tarihi: dateValue(employee.isten_cikis || employee.cikis_tarihi),
      dogum_tarihi: dateValue(employee.dogum_tarihi),
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
        ise_giris: employeeForm.ise_giris_tarihi || null,
        isten_cikis: employeeForm.cikis_tarihi || null,
        dogum_tarihi: employeeForm.dogum_tarihi || null,
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

      if (editingEmployee?.id) {
        await updateEmployee(editingEmployee.id, payload)
      } else {
        await addEmployee(Number(clientId), payload)
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
      await reload()
    } catch (deleteError) {
      setError(deleteError?.message || 'Personel silinemedi.')
      setLoading(false)
    }
  }

  const uploadExcel = async (event) => {
    const file = event.target.files?.[0]
    if (!file || !clientId) return

    setLoading(true)
    setError('')
    try {
      await saveEmployeesFromExcel(file, clientId)
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
    { key: 'kullanilan', label: 'Kullanılan İzin (Yıl)', value: stats.kullanilan, sub: 'Bu yıl kullanılan toplam izin günü', icon: History, iconBg: 'bg-amber-500/15', iconFg: 'text-amber-400', border: 'hover:border-amber-500/40' },
    { key: 'kalan', label: 'Kalan İzin (Toplam)', value: stats.kalan, sub: 'Toplam kalan izin günü', icon: PieChart, iconBg: 'bg-violet-500/15', iconFg: 'text-violet-400', border: 'hover:border-violet-500/40' }
  ]

  const statusTabs = [
    { id: 'tum', label: 'Tüm Personel', count: allEmployees.length },
    { id: 'aktif', label: 'Aktif Personel', count: activeEmployees.length },
    { id: 'pasif', label: 'Pasif Personel', count: passiveEmployees.length }
  ]

  return (
    <div className="space-y-6">
      {/* İstatistik kartları */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
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
              <span className={`flex flex-shrink-0 items-center gap-1 text-xs font-medium ${card.iconFg}`}>
                Detayları Gör <ArrowRight className="h-3 w-3" />
              </span>
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
        <label className={`flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-blue-100/80 hover:bg-white/10 ${!clientId ? 'pointer-events-none opacity-50' : ''}`}>
          <Upload className="h-4 w-4" /> Excel Yükle
          <input type="file" accept=".xlsx,.xls,.csv" onChange={uploadExcel} className="hidden" disabled={!clientId} />
        </label>
        <button
          type="button"
          onClick={() => {
            setEmployeeForm(createEmployeeForm())
            setEditingEmployee(null)
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
          <label className="space-y-1">
            <span className={labelClass}>Ad soyad *</span>
            <input name="ad_soyad" value={employeeForm.ad_soyad} onChange={updateEmployeeForm} placeholder="Personelin ad soyadı" required className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className={labelClass}>T.C. kimlik numarası</span>
            <input name="tc_kimlik" value={employeeForm.tc_kimlik} onChange={updateEmployeeForm} placeholder="11 haneli T.C. kimlik numarası" className={inputClass} />
          </label>
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
              <input name="net_ucret" type="text" inputMode="decimal" value={employeeForm.net_ucret} onChange={(event) => setEmployeeForm((previous) => ({ ...previous, net_ucret: formatTurkishInput(event.target.value) }))} placeholder="Net ücret tutarı" className={inputClass} />
            </label>
          ) : (
            <label className="space-y-1">
              <span className={labelClass}>Brüt ücret (TL)</span>
              <input name="brut_ucret" type="text" inputMode="decimal" value={employeeForm.brut_ucret} onChange={(event) => setEmployeeForm((previous) => ({ ...previous, brut_ucret: formatTurkishInput(event.target.value) }))} placeholder="Brüt ücret tutarı" className={inputClass} />
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
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {paginatedEmployees.map((employee) => {
            const summary = leaveSummary[employee.id] || { opening: 0, earned: 0, used: 0, remaining: 0 }
            const salaryType = getSalaryType(employee)
            const brutSalary = salaryType === 'net'
              ? brutUcretHesapla(employee)
              : numberValue(employee.brut_ucret ?? employee.brut_maas)
            const passive = isPassive(employee)

            return (
              <div key={employee.id} className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm transition-colors hover:border-white/20">
                <div className="flex items-start gap-3">
                  <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white shadow-lg ${avatarGradient(employeeLabel(employee))}`}>
                    {initials(employeeLabel(employee))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-white">{employeeLabel(employee)}</p>
                    <p className="truncate text-xs text-blue-200/60">{employee.gorev || '—'}</p>
                    <p className="truncate text-xs text-blue-200/40">{employee.departman || '—'}</p>
                  </div>
                  <EmployeeCardMenu onEdit={() => editEmployee(employee)} onDelete={() => removeEmployee(employee)} />
                </div>

                <div className="mt-3">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${passive ? 'bg-white/10 text-blue-200/50' : 'bg-emerald-500/15 text-emerald-400'}`}>
                    {passive ? 'Pasif' : 'Aktif'}
                  </span>
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
