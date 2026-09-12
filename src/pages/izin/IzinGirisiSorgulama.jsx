import { useEffect, useState } from 'react'
import { Plus, ChevronRight, ChevronLeft, CircleDot, Wallet, Trash2, CalendarDays, HeartPulse, Heart, Baby, Cross, UserX, FileWarning, Banknote, CalendarOff, FileDown, FileText } from 'lucide-react'
import { addLeaveRecord, deleteLeaveRecord, getLeaveRecords } from '../../services/clientService'
import { hesaplaIzinBitis, hesaplaIseDonus, isBusinessDay } from '../../utils/dateUtils'
import { createUnicodePdf } from '../../utils/unicodePdf'
import {
  asArray,
  buildYearlyLeaveTable,
  clientName,
  createLeaveForm,
  currentYear,
  displayDate,
  employeeLabel,
  leaveRecordEmployeeId,
  leaveRecordYear,
  leaveRecordDays,
  numberValue,
  IZIN_TURLERI,
  izinTuruBul
} from './izinUtils'

// Iki tarih arasi is gunu sayisi (pazar + resmi tatiller dusulur)
const countBusinessDays = (start, end) => {
  if (!start || !end) return 0
  const s = new Date(`${start}T00:00:00`)
  const e = new Date(`${end}T00:00:00`)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0
  let count = 0
  const d = new Date(s)
  while (d <= e) {
    if (isBusinessDay(d)) count += 1
    d.setDate(d.getDate() + 1)
  }
  return count
}

// Takvim gunu ekler (analik izni gibi takvim gunu ile verilen izinler icin)
const addCalendarDays = (dateStr, days) => {
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + Number(days) - 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const inputClass = 'w-full rounded-lg border border-white/10 bg-blue-950/40 px-3 py-2 text-sm text-white placeholder:text-blue-200/30 focus:border-amber-400/50 focus:outline-none'

function initials(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function EmployeeAvatar({ name, size = 'md' }) {
  const dims = size === 'lg' ? 'h-12 w-12 text-sm' : 'h-9 w-9 text-xs'
  return (
    <div className={`flex ${dims} flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-800 font-semibold text-white ring-1 ring-white/20`}>
      {initials(name)}
    </div>
  )
}

function BalanceBar({ earned, used, remaining }) {
  const total = Math.max(earned, earned - used + remaining, 1)
  const usedPct = Math.min(100, Math.max(0, (used / total) * 100))
  const remainingPct = Math.min(100 - usedPct, Math.max(0, (remaining / total) * 100))
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div className="flex h-full">
        <div className="bg-amber-400" style={{ width: `${usedPct}%` }} />
        <div className="bg-emerald-400" style={{ width: `${remainingPct}%` }} />
      </div>
    </div>
  )
}

// İzin talep formu PDF'i — personel imzası, yönetici onayı ve dönüş tarihi ile.
function downloadIzinTalepFormu(record, employee, employer) {
  const pdf = createUnicodePdf()
  const text = (value) => String(value ?? '')
  const ink = '#1f2937'
  const muted = '#6b7280'
  const navy = '#12375d'
  const border = '#d9e2eb'
  let y = 0

  pdf.setFillColor(navy)
  pdf.rect(14, 12, 182, 28, 'F')
  pdf.setTextColor('#ffffff')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(17)
  pdf.text(text('İZİN TALEP FORMU'), 105, 28, { align: 'center' })
  pdf.setTextColor(ink)
  y = 52

  const row = (label, value, highlighted = false) => {
    pdf.setFillColor(highlighted ? '#eef6f1' : '#f7f9fb')
    pdf.setDrawColor(border)
    pdf.rect(14, y - 5, 182, 9, 'FD')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    pdf.setTextColor(muted)
    pdf.text(text(label), 19, y + 1)
    pdf.setFont('helvetica', highlighted ? 'bold' : 'normal')
    pdf.setTextColor(ink)
    pdf.text(text(value), 191, y + 1, { align: 'right' })
    y += 10
  }

  const section = (title) => {
    pdf.setFillColor('#0b2948')
    pdf.rect(14, y - 5, 182, 9, 'F')
    pdf.setTextColor('#ffffff')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.text(text(title), 19, y + 1)
    pdf.setTextColor(ink)
    y += 15
  }

  section('İŞVEREN')
  row('Unvan', employer ? clientName(employer) : '-')

  section('PERSONEL BİLGİLERİ')
  row('Ad soyad', employeeLabel(employee))
  row('T.C. kimlik no', employee?.tc_kimlik || '-')
  row('Departman / görev', `${employee?.departman || '-'} / ${employee?.gorev || '-'}`)

  section('İZİN BİLGİLERİ')
  row('İzin türü', record.izin_turu || '-')
  row('Başlangıç tarihi', displayDate(record.baslangic_tarihi ?? record.baslangic))
  row('Bitiş tarihi', displayDate(record.bitis_tarihi ?? record.bitis))
  row('Kullanılacak gün sayısı', `${numberValue(record.gun ?? record.is_gunu)} gün`, true)
  const donus = hesaplaIseDonus(record.bitis_tarihi ?? record.bitis)
  row('İşe dönüş tarihi', donus ? displayDate(donus) : '-', true)
  if (record.aciklama) row('Açıklama', record.aciklama)

  y += 10
  pdf.setFillColor('#f8fafc')
  pdf.setDrawColor(border)
  pdf.rect(14, y - 5, 182, 46, 'FD')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9.5)
  pdf.setTextColor(navy)
  pdf.text('ONAY VE İMZA', 19, y + 2)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(ink)
  pdf.text('Talep eden personel', 19, y + 14)
  pdf.text('Ad soyad / imza: ________________________', 19, y + 24)
  pdf.text('Tarih: ____ / ____ / ________', 19, y + 34)
  pdf.text('Onaylayan yönetici', 115, y + 14)
  pdf.text('Ad soyad / imza: ________________________', 115, y + 24)
  pdf.text('Tarih: ____ / ____ / ________', 115, y + 34)

  pdf.save(`izin-talep-${employeeLabel(employee).replace(/\s+/g, '-').toLocaleLowerCase('tr-TR')}.pdf`)
}

// "İzinimi kullandım" beyan belgesi PDF'i — personel adı, TC ve beyan metni ile.
function downloadIzinKullanimBelgesi({ employee, employer, baslangic, bitis, gun, isbasi }) {
  const pdf = createUnicodePdf()
  const text = (value) => String(value ?? '')
  const ink = '#1f2937'
  const muted = '#6b7280'
  const navy = '#12375d'
  const border = '#d9e2eb'
  let y = 0

  pdf.setFillColor(navy)
  pdf.rect(14, 12, 182, 28, 'F')
  pdf.setTextColor('#ffffff')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  pdf.text(text('YILLIK İZİN KULLANIM BELGESİ'), 105, 28, { align: 'center' })
  pdf.setTextColor(ink)
  y = 52

  const row = (label, value, highlighted = false) => {
    pdf.setFillColor(highlighted ? '#eef6f1' : '#f7f9fb')
    pdf.setDrawColor(border)
    pdf.rect(14, y - 5, 182, 9, 'FD')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    pdf.setTextColor(muted)
    pdf.text(text(label), 19, y + 1)
    pdf.setFont('helvetica', highlighted ? 'bold' : 'normal')
    pdf.setTextColor(ink)
    pdf.text(text(value), 191, y + 1, { align: 'right' })
    y += 10
  }

  const section = (title) => {
    pdf.setFillColor('#0b2948')
    pdf.rect(14, y - 5, 182, 9, 'F')
    pdf.setTextColor('#ffffff')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.text(text(title), 19, y + 1)
    pdf.setTextColor(ink)
    y += 15
  }

  section('İŞVEREN')
  row('Unvan', employer ? clientName(employer) : '-')

  section('PERSONEL BİLGİLERİ')
  row('Ad soyad', employeeLabel(employee))
  row('T.C. kimlik no', employee?.tc_kimlik || '-')
  row('Departman / görev', `${employee?.departman || '-'} / ${employee?.gorev || '-'}`)

  section('İZİN BİLGİLERİ')
  row('İzin başlangıç tarihi', displayDate(baslangic))
  row('İzin bitiş tarihi', displayDate(bitis))
  row('Kullanılan izin süresi', `${numberValue(gun)} iş günü`, true)
  row('İşbaşı tarihi', isbasi ? displayDate(isbasi) : '-', true)

  y += 8
  const beyan = `${displayDate(baslangic)} – ${displayDate(bitis)} tarihleri arasında toplam ${numberValue(gun)} iş günü yıllık ücretli iznimi kullandım${isbasi ? ` ve ${displayDate(isbasi)} tarihinde işbaşı yaptığımı` : ''} beyan ederim.`
  const beyanLines = pdf.splitTextToSize(beyan, 172)
  const beyanHeight = beyanLines.length * 6 + 12
  pdf.setFillColor('#f8fafc')
  pdf.setDrawColor(border)
  pdf.rect(14, y - 5, 182, beyanHeight, 'FD')
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.setTextColor(ink)
  pdf.text(beyanLines, 19, y + 3)
  y += beyanHeight + 14

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9.5)
  pdf.setTextColor(navy)
  pdf.text('BEYAN SAHİBİ (PERSONEL)', 19, y)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(ink)
  pdf.text(`Ad soyad: ${employeeLabel(employee)}`, 19, y + 10)
  pdf.text('İmza: ________________________', 19, y + 20)
  pdf.text('Tarih: ____ / ____ / ________', 19, y + 30)

  pdf.save(`izin-kullanim-${employeeLabel(employee).replace(/\s+/g, '-').toLocaleLowerCase('tr-TR')}.pdf`)
}

export default function IzinGirisiSorgulama({ clientId, employees, clientList, setError }) {
  const [allLeaveRecords, setAllLeaveRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [leaveForm, setLeaveForm] = useState(createLeaveForm)
  const [showLeaveForm, setShowLeaveForm] = useState(false)

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!clientId) {
        setAllLeaveRecords([])
        return
      }
      setLoading(true)
      try {
        const result = await getLeaveRecords(clientId)
        if (active) setAllLeaveRecords(asArray(result))
      } catch (loadError) {
        if (active) setError(loadError?.message || 'İzin kayıtları yüklenemedi.')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [clientId, setError])

  const reloadLeaveRecords = async () => {
    if (!clientId) return
    setLoading(true)
    try {
      const result = await getLeaveRecords(clientId)
      setAllLeaveRecords(asArray(result))
    } catch (loadError) {
      setError(loadError?.message || 'İzin kayıtları yüklenemedi.')
    } finally {
      setLoading(false)
    }
  }

  const selectedEmployee = (employees || []).find((employee) => String(employee.id) === String(selectedEmployeeId))

  const yearlyTable = selectedEmployee
    ? buildYearlyLeaveTable(selectedEmployee, allLeaveRecords, { uptoYear: currentYear })
    : []

  const employeeYearRecords = (employees || []).length
    ? allLeaveRecords
      .filter((record) => String(leaveRecordEmployeeId(record)) === String(selectedEmployeeId))
      .filter((record) => leaveRecordYear(record) === selectedYear)
    : []

  // Tüm personel için seçilen yıla ait özet (devir + hak edilen + kullanılan + kalan)
  const overview = (employees || []).map((employee) => {
    const rows = buildYearlyLeaveTable(employee, allLeaveRecords, { uptoYear: selectedYear })
    const yearRow = rows.find((row) => row.year === selectedYear)
    return { employee, row: yearRow || null }
  }).filter((entry) => entry.row)

  const updateLeaveForm = (event) => {
    const { name, value } = event.target
    setLeaveForm((previous) => {
      const updated = { ...previous, [name]: value }
      const tur = izinTuruBul(updated.izin_turu)

      if (name === 'izin_turu') {
        if (tur?.yasalGun) {
          updated.gun = String(tur.yasalGun)
        } else if (tur?.raporGerekli) {
          updated.gun = ''
          updated.bitis_tarihi = ''
        }
      }

      // Yasal sureli izinlerde baslangic secilince bitis otomatik hesaplanir
      if (tur?.yasalGun && updated.baslangic_tarihi) {
        updated.bitis_tarihi = tur.takvimGunu
          ? addCalendarDays(updated.baslangic_tarihi, tur.yasalGun)
          : hesaplaIzinBitis(updated.baslangic_tarihi, tur.yasalGun)
      } else if (tur?.raporGerekli) {
        // Raporlu izinlerde baslangic ve bitis secilince gun otomatik hesaplanir
        if (updated.baslangic_tarihi && updated.bitis_tarihi) {
          updated.gun = String(countBusinessDays(updated.baslangic_tarihi, updated.bitis_tarihi))
        }
      } else if ((name === 'baslangic_tarihi' || name === 'gun') && updated.baslangic_tarihi && updated.gun) {
        // Yillik/mazeret/ucretsiz izinlerde baslangic + gun degisince bitis otomatik
        const bitis = hesaplaIzinBitis(updated.baslangic_tarihi, numberValue(updated.gun))
        if (bitis) updated.bitis_tarihi = bitis
      }

      return updated
    })
  }

  const autoCalcBitis = () => {
    if (leaveForm.baslangic_tarihi && leaveForm.gun) {
      const bitis = hesaplaIzinBitis(leaveForm.baslangic_tarihi, numberValue(leaveForm.gun))
      if (bitis) setLeaveForm((previous) => ({ ...previous, bitis_tarihi: bitis }))
    }
  }

  const openLeaveFormFor = (employeeId) => {
    setLeaveForm({ ...createLeaveForm(), employee_id: employeeId })
    setShowLeaveForm(true)
  }

  const saveLeave = async (event) => {
    event.preventDefault()
    if (!clientId || !leaveForm.employee_id || !leaveForm.baslangic_tarihi) return

    setLoading(true)
    setError('')
    try {
      const newRecord = {
        employee_id: leaveForm.employee_id,
        client_id: clientId,
        yil: new Date(leaveForm.baslangic_tarihi).getFullYear(),
        baslangic: leaveForm.baslangic_tarihi,
        bitis: leaveForm.bitis_tarihi || leaveForm.baslangic_tarihi,
        is_gunu: numberValue(leaveForm.gun),
        izin_turu: izinTuruBul(leaveForm.izin_turu)?.label || leaveForm.izin_turu,
        aciklama: leaveForm.aciklama
      }
      await addLeaveRecord(newRecord)
      const savedEmployee = (employees || []).find((employee) => String(employee.id) === String(leaveForm.employee_id))
      const savedEmployer = (clientList || []).find((client) => String(client.id) === String(clientId))
      if (savedEmployee && window.confirm('İzin kaydedildi. İzin talep formunu (PDF) indirmek ister misiniz?')) {
        downloadIzinTalepFormu(newRecord, savedEmployee, savedEmployer)
      }
      setLeaveForm(createLeaveForm())
      setShowLeaveForm(false)
      await reloadLeaveRecords()
    } catch (saveError) {
      setError(saveError?.message || 'İzin kaydedilemedi.')
      setLoading(false)
    }
  }

  const removeLeave = async (record) => {
    if (!record?.id || !window.confirm('İzin kaydı silinsin mi?')) return
    setLoading(true)
    setError('')
    try {
      await deleteLeaveRecord(record.id)
      await reloadLeaveRecords()
    } catch (deleteError) {
      setError(deleteError?.message || 'İzin kaydı silinemedi.')
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">İzin Girişi / Sorgulama</h2>
          <p className="text-sm text-blue-200/60">Yıl bazlı hak edilen, kullanılan ve kalan izin takibi</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedEmployeeId && (
            <button
              type="button"
              onClick={() => setSelectedEmployeeId('')}
              className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-sm text-blue-100/80 hover:bg-white/5"
            >
              <ChevronLeft className="h-4 w-4" /> Tüm personel
            </button>
          )}
          <select
            value={selectedYear}
            onChange={(event) => setSelectedYear(Number(event.target.value))}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-blue-100"
          >
            {[currentYear, currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4].map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <select
            value={selectedEmployeeId}
            onChange={(event) => setSelectedEmployeeId(event.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-blue-100"
          >
            <option value="">Tüm personel özeti</option>
            {(employees || []).map((employee) => (
              <option key={employee.id} value={employee.id}>{employeeLabel(employee)}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => openLeaveFormFor(selectedEmployeeId)}
            disabled={!clientId}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-400 to-yellow-500 px-4 py-2 text-sm font-semibold text-blue-950 transition-shadow hover:shadow-lg hover:shadow-amber-500/30 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> İzin ekle
          </button>
        </div>
      </div>

      {!clientId && <p className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-200">Önce müşteri seçin.</p>}
      {loading && <div className="text-sm text-blue-200/50">Yükleniyor...</div>}

      {showLeaveForm && (() => {
        const secilenTur = izinTuruBul(leaveForm.izin_turu)
        const raporlu = secilenTur?.raporGerekli === true
        return (
        <form onSubmit={saveLeave} className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-blue-200/50">Personel</span>
            <select name="employee_id" value={leaveForm.employee_id} onChange={updateLeaveForm} required className={inputClass}>
              <option value="">Personel seçin</option>
              {(employees || []).map((employee) => <option key={employee.id} value={employee.id}>{employeeLabel(employee)}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-blue-200/50">İzin türü</span>
            <select name="izin_turu" value={leaveForm.izin_turu} onChange={updateLeaveForm} required className={inputClass}>
              {IZIN_TURLERI.map((tur) => (
                <option key={tur.id} value={tur.id}>
                  {tur.label}{tur.yasalGun ? ` (${tur.yasalGun} gün)` : ''}
                </option>
              ))}
            </select>
          </label>
          {secilenTur && (
            <div className="md:col-span-2 rounded-lg border border-blue-400/20 bg-blue-500/10 px-3 py-2 text-xs text-blue-100/80">
              {secilenTur.aciklama}
              {secilenTur.id !== 'yillik' && !secilenTur.yillikBakiyedenDuser && (
                <span className="ml-1 font-semibold text-emerald-300">— Yıllık izin bakiyesinden düşülmez.</span>
              )}
            </div>
          )}
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-blue-200/50">
              {raporlu ? 'Rapor başlangıç tarihi' : 'Başlangıç tarihi'}
            </span>
            <input name="baslangic_tarihi" type="date" value={leaveForm.baslangic_tarihi} onChange={updateLeaveForm} required className={inputClass} />
          </label>
          {raporlu ? (
            <label className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-blue-200/50">Rapor bitiş tarihi</span>
              <input name="bitis_tarihi" type="date" value={leaveForm.bitis_tarihi} onChange={updateLeaveForm} required min={leaveForm.baslangic_tarihi || undefined} className={inputClass} />
            </label>
          ) : (
            <label className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-blue-200/50">
                Kullanılacak gün sayısı{secilenTur?.yasalGun ? ' (yasal süre)' : ''}
              </span>
              <input name="gun" type="number" min="0.5" step="0.5" value={leaveForm.gun} onChange={updateLeaveForm} required readOnly={Boolean(secilenTur?.yasalGun)} className={`${inputClass} ${secilenTur?.yasalGun ? 'bg-white/5' : ''}`} />
            </label>
          )}
          {raporlu && (
            <label className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-blue-200/50">İş günü (otomatik)</span>
              <input name="gun" type="number" value={leaveForm.gun} readOnly className={`${inputClass} bg-white/5`} />
            </label>
          )}
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-blue-200/50">Bitiş tarihi (otomatik)</span>
            <div className="flex gap-2">
              <input name="bitis_tarihi" type="date" value={leaveForm.bitis_tarihi} onChange={updateLeaveForm} readOnly={!raporlu} className={`${inputClass} ${raporlu ? '' : 'bg-white/5'}`} />
              {!raporlu && (
                <button type="button" onClick={autoCalcBitis} className="rounded-lg border border-white/10 px-3 text-blue-100/80 hover:bg-white/5" title="Bitişi yeniden hesapla">
                  <CalendarDays className="h-4 w-4" />
                </button>
              )}
            </div>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-blue-200/50">İşe dönüş tarihi</span>
            <input type="text" readOnly value={leaveForm.bitis_tarihi ? displayDate(hesaplaIseDonus(leaveForm.bitis_tarihi)) : ''} className={`${inputClass} bg-white/5`} />
          </label>
          <input name="aciklama" value={leaveForm.aciklama} onChange={updateLeaveForm} placeholder="Açıklama" className={inputClass} />
          <div className="flex gap-2 md:col-span-2">
            <button type="submit" className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-800 px-4 py-2 text-sm font-semibold text-white">İzni kaydet</button>
            <button type="button" onClick={() => setShowLeaveForm(false)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-blue-100/80 hover:bg-white/5">Vazgeç</button>
          </div>
        </form>
        )
      })()}

      {!selectedEmployeeId && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {overview.map(({ employee, row }) => (
            <div
              key={employee.id}
              onClick={() => setSelectedEmployeeId(String(employee.id))}
              className="cursor-pointer rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition-colors hover:border-amber-400/30"
            >
              <div className="flex items-center gap-3">
                <EmployeeAvatar name={employeeLabel(employee)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{employeeLabel(employee)}</p>
                  <p className="truncate text-xs text-blue-200/50">{employee.departman || '—'}</p>
                </div>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-blue-200/40" />
              </div>
              <div className="mt-3 space-y-1.5">
                <BalanceBar earned={row.earned} used={row.used} remaining={row.remaining} />
                <div className="flex items-center justify-between text-xs text-blue-200/60">
                  <span className="flex items-center gap-1"><CircleDot className="h-2.5 w-2.5 text-amber-400" /> {row.used.toFixed(1)} kullanılan</span>
                  <span className="flex items-center gap-1 font-semibold text-emerald-300"><CircleDot className="h-2.5 w-2.5 text-emerald-400" /> {row.remaining.toFixed(1)} kalan</span>
                </div>
              </div>
            </div>
          ))}
          {!overview.length && (
            <div className="col-span-full rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-sm text-blue-200/40">
              {selectedYear} yılında görüntülenecek personel bulunamadı.
            </div>
          )}
        </div>
      )}

      {selectedEmployeeId && selectedEmployee && (
        <>
          {/* İzin Karnesi — yıllara göre bakiye pasaportu */}
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-dashed border-white/15 p-5">
              <div className="flex items-center gap-3">
                <EmployeeAvatar name={employeeLabel(selectedEmployee)} size="lg" />
                <div>
                  <p className="font-semibold text-white">{employeeLabel(selectedEmployee)}</p>
                  <p className="text-sm text-blue-200/60">{selectedEmployee.gorev || '—'} · {selectedEmployee.departman || '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-2">
                <Wallet className="h-5 w-5 text-amber-300" />
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-amber-200/60">Güncel bakiye</p>
                  <p className="font-mono text-xl font-semibold text-amber-300">
                    {(yearlyTable.length ? yearlyTable[yearlyTable.length - 1].remaining : 0).toFixed(1)} gün
                  </p>
                </div>
              </div>
            </div>

            {yearlyTable.length ? (
              <div className="divide-y divide-dashed divide-white/10">
                {yearlyTable.map((row) => (
                  <div
                    key={row.year}
                    className={`flex flex-wrap items-center gap-4 px-5 py-3 ${row.year === selectedYear ? 'bg-amber-400/5' : ''}`}
                  >
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-white/15 font-mono text-xs text-blue-100/80">
                      {String(row.year).slice(2)}
                    </div>
                    <div className="flex flex-1 flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-blue-200/50">
                      <span>devir <b className="text-blue-100/80">{row.opening.toFixed(1)}</b></span>
                      <span>hak ediş <b className="text-blue-100/80">+{row.earned.toFixed(1)}</b></span>
                      <span>kullanım <b className="text-blue-100/80">−{row.used.toFixed(1)}</b></span>
                    </div>
                    <div className="ml-auto font-mono text-sm font-semibold text-emerald-300">
                      {row.remaining.toFixed(1)} gün
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-5 text-center text-sm text-blue-200/40">İşe giriş tarihi girilmediği için hesaplanamıyor.</p>
            )}

            <div className="border-t border-white/10 p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-200/50">{selectedYear} yılı hareketleri</p>
                <button type="button" onClick={() => openLeaveFormFor(selectedEmployeeId)} className="text-xs font-semibold text-amber-300 hover:text-amber-200">
                  + İzin ekle
                </button>
              </div>
              {employeeYearRecords.length ? (
                <div className="space-y-3">
                  {employeeYearRecords.map((record) => (
                    <div key={record.id} className="flex items-center gap-3">
                      <span className="h-2 w-2 flex-shrink-0 rounded-full bg-amber-400" />
                      <div className="flex-1 rounded-lg border border-white/10 bg-blue-950/30 px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm text-white">{record.izin_turu || '—'}</span>
                          <span className="font-mono text-sm text-amber-300">{numberValue(record.gun ?? record.is_gunu)} gün</span>
                        </div>
                        <p className="mt-0.5 text-xs text-blue-200/50">
                          {displayDate(record.baslangic_tarihi ?? record.baslangic)} – {displayDate(record.bitis_tarihi ?? record.bitis)}
                          {record.aciklama ? ` · ${record.aciklama}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => downloadIzinTalepFormu(
                          record,
                          selectedEmployee,
                          (clientList || []).find((client) => String(client.id) === String(clientId))
                        )}
                        title="İzin talep formu (PDF) indir"
                        className="rounded-lg p-1.5 text-blue-200/30 hover:bg-amber-500/10 hover:text-amber-300"
                      >
                        <FileDown className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => removeLeave(record)} className="rounded-lg p-1.5 text-blue-200/30 hover:bg-red-500/10 hover:text-red-300">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-blue-200/40">Bu yıl için izin kaydı bulunamadı.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
