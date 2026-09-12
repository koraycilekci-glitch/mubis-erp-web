import { useEffect, useState } from 'react'
import { FileDown, Landmark } from 'lucide-react'
import { getLeaveRecords } from '../../services/clientService'
import { formatTurkishInput } from '../../utils/numberFormat'
import { createUnicodePdf } from '../../utils/unicodePdf'
import {
  D,
  asArray,
  buildYearlyLeaveTable,
  dateValue,
  displayDate,
  employeeDate,
  employeeLabel,
  getPastTotal,
  getSalaryType,
  money,
  numberValue
} from './izinUtils'
import { brutUcretHesapla } from '../../utils/ucretUtils'
import { getGuncelParametreler, kidemTavaniGuncel } from '../../services/parametreService'

const inputClass = 'w-full rounded-lg border border-white/10 bg-blue-950/40 px-3 py-2 text-sm text-white placeholder:text-blue-200/30 focus:border-amber-400/50 focus:outline-none'
const labelClass = 'text-xs font-medium uppercase tracking-wide text-blue-200/50'

export default function KidemIhbarHesap({ clientId, employees, clientList, setError }) {
  const [leaveRecords, setLeaveRecords] = useState([])
  const [severanceEmployeeId, setSeveranceEmployeeId] = useState('')
  const [severanceExitDate, setSeveranceExitDate] = useState('')
  const [severanceReason, setSeveranceReason] = useState('isveren')
  const [hasSgkRetirementDocument, setHasSgkRetirementDocument] = useState(false)
  const [iban, setIban] = useState('')
  const [paymentDate, setPaymentDate] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('banka')
  const [includeSeverance, setIncludeSeverance] = useState(true)
  const [includeNotice, setIncludeNotice] = useState(true)
  const [includeUnusedLeave, setIncludeUnusedLeave] = useState(true)
  const [overtimeAmount, setOvertimeAmount] = useState('')
  const [holidayAmount, setHolidayAmount] = useState('')
  const [webParams, setWebParams] = useState(null)

  // Güncel yasal parametreler (kıdem tavanı, asgari ücret) web'den alınır.
  // Servis yanıt vermezse sessizce null kalır ve yerel tablolar kullanılır.
  useEffect(() => {
    let active = true
    getGuncelParametreler().then((params) => {
      if (active && params) setWebParams(params)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!clientId) {
        setLeaveRecords([])
        return
      }
      try {
        // Kıdem/ihbar hesaplaması personelin tüm çalışma süresini kapsadığından
        // yıl filtresi olmadan tüm izin kayıtları alınır.
        const result = await getLeaveRecords(clientId)
        if (active) setLeaveRecords(asArray(result))
      } catch (loadError) {
        if (active) setError(loadError?.message || 'İzin verileri yüklenemedi.')
      }
    }
    load()
    return () => { active = false }
  }, [clientId, setError])

  const createSeveranceCalculation = (employee, overrides = {}) => {
    if (!employee) return null

    const exitDate = overrides.exitDate
      || employeeDate(employee, 'cikis_tarihi', 'isten_cikis', 'cikis_tarihi')
      || new Date().toISOString().slice(0, 10)
    const salaryType = getSalaryType(employee)
    const grossSalary = salaryType === 'net'
      ? brutUcretHesapla(employee)
      : numberValue(employee.brut_ucret ?? employee.brut_maas ?? employee.brutUcret)
    const overtimeGross = numberValue(overrides.overtimeAmount)
    const holidayGross = numberValue(overrides.holidayAmount)
    const additionalGross = overtimeGross + holidayGross
    const calculationGross = grossSalary + additionalGross
    const startDate = employeeDate(employee, 'ise_giris', 'ise_giris_tarihi', 'iseGiris')
    const service = D.getCalismaSuresi(startDate, exitDate)
    const workingYears = service.toplamYil
    const notice = D.getIhbarSuresi(startDate, exitDate)
    const ceiling = kidemTavaniGuncel(webParams, exitDate)
    const dailyGross = Math.min(calculationGross / 30, ceiling / 30)
    const exitYear = exitDate ? new Date(exitDate).getFullYear() : undefined
    const leaveRows = buildYearlyLeaveTable(
      { ...employee, isten_cikis: exitDate, cikis_tarihi: exitDate },
      leaveRecords,
      { uptoYear: Number.isNaN(exitYear) ? undefined : exitYear }
    )
    const annualEntitlement = leaveRows.reduce((total, row) => total + row.earned, 0)
    const usedAnnualLeave = leaveRows.reduce((total, row) => total + row.used, 0)
    const pastLeaveDays = leaveRows.length ? leaveRows[0].opening : getPastTotal(employee)
    const calculatedUnusedLeaveDays = leaveRows.length
      ? Math.max(0, leaveRows[leaveRows.length - 1].remaining)
      : Math.max(0, pastLeaveDays)
    const includeUnusedLeaveValue = overrides.includeUnusedLeave !== false
    const unusedLeaveDays = includeUnusedLeaveValue ? calculatedUnusedLeaveDays : 0
    const leaveDailyGross = grossSalary / 30
    const unusedLeaveGross = unusedLeaveDays * leaveDailyGross
    const unusedLeaveIncomeTax = unusedLeaveGross * 0.15
    const unusedLeaveStamp = unusedLeaveGross * D.DAMGA_VERGISI
    const unusedLeaveNet = unusedLeaveGross - unusedLeaveIncomeTax - unusedLeaveStamp
    const retirementDocumentAllowsSeverance = (
      overrides.reason === 'emeklilik'
      || overrides.reason === 'istifa'
    )
      && overrides.hasSgkRetirementDocument === true
    const severanceEligible = retirementDocumentAllowsSeverance
      || ['isveren', 'askerlik', 'evlilik', 'diger'].includes(overrides.reason || 'isveren')
    const severanceMinServiceMet = service.toplamYil >= 1
    const severanceGross = overrides.includeSeverance === false || !severanceEligible || !severanceMinServiceMet
      ? 0
      : service.kidemGunu * dailyGross
    const severanceStamp = severanceGross * D.DAMGA_VERGISI
    const severanceNet = severanceGross - severanceStamp
    const noticeGross = overrides.includeNotice === false ? 0 : (calculationGross / 30) * (notice?.gun || 0)
    const noticeIncomeTax = noticeGross * 0.15
    const noticeStamp = noticeGross * D.DAMGA_VERGISI
    const noticeNet = noticeGross - noticeIncomeTax - noticeStamp

    return {
      exitDate,
      startDate,
      grossSalary,
      overtimeGross,
      holidayGross,
      additionalGross,
      calculationGross,
      workingYears,
      notice,
      ceiling,
      service,
      severanceMinServiceMet,
      annualEntitlement,
      usedAnnualLeave,
      pastLeaveDays,
      calculatedUnusedLeaveDays,
      unusedLeaveDays,
      includeUnusedLeave: includeUnusedLeaveValue,
      unusedLeaveGross,
      unusedLeaveIncomeTax,
      unusedLeaveStamp,
      unusedLeaveNet,
      severanceGross,
      severanceStamp,
      severanceNet,
      noticeGross,
      noticeIncomeTax,
      noticeStamp,
      noticeNet,
      totalNet: severanceNet + noticeNet + unusedLeaveNet,
      reason: overrides.reason || 'isveren',
      hasSgkRetirementDocument: overrides.hasSgkRetirementDocument === true,
      severanceEligible
    }
  }

  const selectedSeveranceEmployee = (employees || []).find(
    (employee) => String(employee.id) === String(severanceEmployeeId)
  )
  const severanceCalculation = selectedSeveranceEmployee
    ? createSeveranceCalculation(selectedSeveranceEmployee, {
        exitDate: severanceExitDate,
        reason: severanceReason,
        hasSgkRetirementDocument,
        includeSeverance,
        includeNotice,
        includeUnusedLeave,
        overtimeAmount,
        holidayAmount
      })
    : null

  const downloadRelease = (employee, overrides = {}) => {
    const calculation = createSeveranceCalculation(employee, overrides)
    if (!calculation) return

    const pdf = createUnicodePdf()
    const pdfText = (value) => String(value ?? '')
    const colors = {
      navy: '#12375d',
      navyDark: '#0b2948',
      gold: '#d6a13a',
      ink: '#25364a',
      muted: '#607387',
      pale: '#f4f7fa',
      border: '#d9e2eb',
      success: '#176b4b'
    }
    let pdfY = 0

    const addPageHeader = (continuation = false) => {
      pdf.setFillColor(colors.navy)
      pdf.rect(14, 12, 182, continuation ? 18 : 34, 'F')
      pdf.setFillColor(colors.gold)
      pdf.rect(14, continuation ? 30 : 46, 182, 2, 'F')
      pdf.setTextColor('#ffffff')
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(continuation ? 13 : 19)
      pdf.text(pdfText(continuation ? 'İŞÇİ İBRANAMESİ · DEVAM' : 'İŞÇİ İBRANAMESİ'), 105, continuation ? 24 : 27, { align: 'center' })
      if (!continuation) {
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(9.5)
        pdf.text(pdfText('6098 Sayılı Türk Borçlar Kanunu ve 4857 Sayılı İş Kanunu'), 105, 37, { align: 'center' })
        pdfY = 58
      } else {
        pdfY = 44
      }
      pdf.setTextColor(colors.ink)
    }

    const ensureSpace = (height) => {
      if (pdfY + height <= 276) return
      pdf.addPage()
      addPageHeader(true)
    }

    const addSection = (title) => {
      ensureSpace(17)
      pdf.setFillColor(colors.navyDark)
      pdf.rect(14, pdfY - 5, 182, 10, 'F')
      pdf.setFillColor(colors.gold)
      pdf.rect(14, pdfY + 5, 182, 1.5, 'F')
      pdf.setTextColor('#ffffff')
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(10.5)
      pdf.text(pdfText(title), 19, pdfY + 1.5)
      pdf.setTextColor(colors.ink)
      pdfY += 16
    }

    const addInfoRow = (label, value, highlighted = false) => {
      ensureSpace(10)
      pdf.setFillColor(highlighted ? '#e9f4ef' : colors.pale)
      pdf.setDrawColor(colors.border)
      pdf.rect(14, pdfY - 5, 182, 9, 'FD')
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(9)
      pdf.setTextColor(colors.muted)
      pdf.text(pdfText(label), 19, pdfY + 1)
      pdf.setFont('helvetica', highlighted ? 'bold' : 'normal')
      pdf.setTextColor(highlighted ? colors.success : colors.ink)
      pdf.text(pdfText(value), 191, pdfY + 1, { align: 'right' })
      pdf.setTextColor(colors.ink)
      pdfY += 10
    }

    const addParagraph = (text, size = 9.6, gap = 4.8) => {
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(size)
      const wrapped = pdf.splitTextToSize(pdfText(text), 174)
      ensureSpace((wrapped.length * gap) + 4)
      pdf.text(wrapped, 18, pdfY)
      pdfY += wrapped.length * gap + 4
    }

    const addAmountRow = (label, value, highlighted = false) => {
      ensureSpace(10)
      pdf.setFillColor(highlighted ? '#e9f4ef' : '#fbfcfd')
      pdf.setDrawColor(colors.border)
      pdf.rect(14, pdfY - 5, 182, 9, 'FD')
      pdf.setFont('helvetica', highlighted ? 'bold' : 'normal')
      pdf.setFontSize(highlighted ? 10 : 9.2)
      pdf.setTextColor(highlighted ? colors.success : colors.ink)
      pdf.text(pdfText(label), 19, pdfY + 1)
      pdf.text(pdfText(value), 191, pdfY + 1, { align: 'right' })
      pdf.setTextColor(colors.ink)
      pdfY += 10
    }

    const employer = (clientList || []).find((client) => String(client.id) === String(clientId)) || {}
    const employerTitle = employer.company || employer.name || employer.unvan || '-'
    const employerTax = employer.vkn || employer.vergi_no || employer.tax_number || '-'
    const employerAddress = employer.address || employer.adres || '-'

    addPageHeader()
    addSection('İŞÇİ BİLGİLERİ')
    addInfoRow('Adı soyadı', employeeLabel(employee))
    addInfoRow('T.C. kimlik no', employee.tc_kimlik || '-')
    addInfoRow('Görevi', employee.gorev || employee.pozisyon || '-')
    addInfoRow('İşe giriş tarihi', displayDate(employee.ise_giris || employee.ise_giris_tarihi) || '-')
    addInfoRow('İşten ayrılış tarihi', displayDate(calculation.exitDate))
    addSection('İŞVEREN BİLGİLERİ')
    addInfoRow('Unvanı', employerTitle)
    addInfoRow('Vergi no', employerTax)
    addInfoRow('Adresi', employerAddress)
    addSection('İBRA BEYANI')
    addParagraph("Yukarıda bilgileri yer alan işyerinde çalıştığım süre boyunca hak etmiş olduğum ücret alacaklarımı, fazla çalışma ücretlerimi, hafta tatili ücretlerimi, ulusal bayram ve genel tatil ücretlerimi, kullanılmayan yıllık izin ücretlerimi, ihbar tazminatımı, kıdem tazminatımı ve iş sözleşmesinden kaynaklanan diğer tüm yasal hak ve alacaklarımı eksiksiz olarak banka aracılığıyla aldığımı kabul ve beyan ederim. İşbu ibranamenin kendi özgür irademle düzenlendiğini, herhangi bir baskı altında kalmadan imzaladığımı, işverene karşı maddi veya manevi herhangi bir talebimin bulunmadığını beyan ederim. Bu ibraname, 6098 sayılı Türk Borçlar Kanunu'nun 420. maddesi hükümlerine uygun olarak düzenlenmiştir.")

    pdf.addPage()
    addPageHeader(true)
    addSection('ÖDENEN TUTARLAR')
    addAmountRow('Alacak türü', 'Tutar (TL)', true)
    addAmountRow('Fazla çalışma ücreti', `${money(calculation.overtimeGross)} TL`)
    addAmountRow('Yıllık izin ücreti (brüt)', `${money(calculation.unusedLeaveGross)} TL`)
    addAmountRow('İzin gelir vergisi', `-${money(calculation.unusedLeaveIncomeTax)} TL`)
    addAmountRow('İzin damga vergisi', `-${money(calculation.unusedLeaveStamp)} TL`)
    addAmountRow('Yıllık izin ücreti (net)', `${money(calculation.unusedLeaveNet)} TL`)
    addAmountRow('İhbar tazminatı', `${money(calculation.noticeNet)} TL`)
    addAmountRow('Kıdem tazminatı', `${money(calculation.severanceNet)} TL`)
    addAmountRow('Diğer ödemeler', `${money(calculation.holidayGross)} TL`)
    addAmountRow('TOPLAM NET ÖDEME', `${money(calculation.totalNet)} TL`, true)
    addSection('ÖDEME VE İMZA')
    addInfoRow('Düzenleme tarihi', displayDate(new Date().toISOString()))
    addInfoRow('Ödeme tarihi', paymentDate ? displayDate(paymentDate) : 'Ödeme sırasında doldurulacaktır')
    addInfoRow('Ödeme yöntemi', paymentMethod === 'banka' ? 'Banka' : 'Diğer')
    addInfoRow('IBAN', iban || 'Ödeme sırasında yazılacaktır')
    addParagraph('Önemli not: Türk Borçlar Kanunu’nun 420. maddesine göre ibranamenin geçerli olabilmesi için iş sözleşmesinin sona ermesinden itibaren en az 1 ay geçmiş olması ve ödemenin banka aracılığıyla yapılmış olması gerekir.', 8.7, 4.2)
    ensureSpace(35)
    pdf.setFillColor('#f8fafc')
    pdf.setDrawColor(colors.border)
    pdf.rect(14, pdfY - 5, 182, 29, 'FD')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9.5)
    pdf.setTextColor(colors.navy)
    pdf.text('PERSONEL BEYANI VE İMZA', 19, pdfY + 2)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(colors.ink)
    pdf.text(pdfText(`Personel: ${employeeLabel(employee)}`), 19, pdfY + 11)
    pdf.text(pdfText(`T.C.: ${employee.tc_kimlik || '-'}`), 19, pdfY + 18)
    pdf.text('İmza: ______________________________', 125, pdfY + 18)
    pdf.save(`ibraname-${employeeLabel(employee).replace(/\s+/g, '-').toLowerCase()}.pdf`)
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Kıdem / İhbar Hesaplama</h2>
        <p className="text-sm text-blue-200/60">Personel seçin, çıkış bilgilerini girin ve tazminat hesaplamasını oluşturun.</p>
        <p className="mt-1 text-xs text-blue-200/40">
          {webParams?.kidemTavani
            ? `Kıdem tavanı güncel web kaynağından alındı (${new Date(webParams.fetchedAt || Date.now()).toLocaleDateString('tr-TR')})`
            : 'Kıdem tavanı için çevrimdışı güncel tablo kullanılıyor'}
        </p>
      </div>

      {!clientId ? (
        <p className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-200">Önce müşteri seçin.</p>
      ) : (
        <>
          <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm md:grid-cols-2">
            <label className="space-y-1">
              <span className={labelClass}>Personel seçin</span>
              <select
                value={severanceEmployeeId}
                onChange={(event) => {
                  const employeeId = event.target.value
                  const employee = (employees || []).find((item) => String(item.id) === employeeId)
                  setSeveranceEmployeeId(employeeId)
                  setSeveranceExitDate(dateValue(employee?.isten_cikis || employee?.cikis_tarihi))
                }}
                className={inputClass}
              >
                <option value="">Personel seçin</option>
                {(employees || []).map((employee) => (
                  <option key={employee.id} value={employee.id}>{employeeLabel(employee)}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className={labelClass}>İşten çıkış tarihi</span>
              <input
                type="date"
                value={severanceExitDate}
                onChange={(event) => setSeveranceExitDate(event.target.value)}
                className={inputClass}
              />
            </label>
            <label className="space-y-1">
              <span className={labelClass}>İşten çıkış nedeni</span>
              <select value={severanceReason} onChange={(event) => setSeveranceReason(event.target.value)} className={inputClass}>
                <option value="isveren">İşveren feshi</option>
                <option value="istifa">İstifa</option>
                <option value="emeklilik">Emeklilik</option>
                <option value="askerlik">Askerlik</option>
                <option value="evlilik">Evlilik</option>
                <option value="diger">Diğer</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-blue-100/80 md:col-span-2">
              <input
                type="checkbox"
                checked={hasSgkRetirementDocument}
                onChange={(event) => setHasSgkRetirementDocument(event.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-blue-950/40 text-amber-400 focus:ring-amber-400/50"
              />
              Yaştan emeklilik için SGK&apos;dan kıdem tazminatına esas yazı alındı
            </label>
            {hasSgkRetirementDocument && (
              <p className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm text-emerald-200 md:col-span-2">
                SGK yazısı işaretlendiğinde emeklilik nedeniyle kıdem tazminatı hesaplanır.
              </p>
            )}
            <div className="flex flex-wrap items-end gap-4 md:col-span-2">
              <label className="flex items-center gap-2 text-sm text-blue-100/80">
                <input type="checkbox" checked={includeSeverance} onChange={(event) => setIncludeSeverance(event.target.checked)} className="h-4 w-4 rounded border-white/20 bg-blue-950/40 text-amber-400 focus:ring-amber-400/50" />
                Kıdem tazminatı
              </label>
              <label className="flex items-center gap-2 text-sm text-blue-100/80">
                <input type="checkbox" checked={includeNotice} onChange={(event) => setIncludeNotice(event.target.checked)} className="h-4 w-4 rounded border-white/20 bg-blue-950/40 text-amber-400 focus:ring-amber-400/50" />
                İhbar tazminatı
              </label>
              <label className="flex items-center gap-2 text-sm text-blue-100/80">
                <input type="checkbox" checked={includeUnusedLeave} onChange={(event) => setIncludeUnusedLeave(event.target.checked)} className="h-4 w-4 rounded border-white/20 bg-blue-950/40 text-amber-400 focus:ring-amber-400/50" />
                Kullanılmayan izinleri dahil et
              </label>
            </div>
            <label className="space-y-1">
              <span className={labelClass}>Fazla mesai (brüt TL)</span>
              <input
                type="text"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={overtimeAmount}
                onChange={(event) => setOvertimeAmount(formatTurkishInput(event.target.value))}
                placeholder="Varsa tutarı girin"
                className={inputClass}
              />
            </label>
            <label className="space-y-1">
              <span className={labelClass}>Bayram tatili (brüt TL)</span>
              <input
                type="text"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={holidayAmount}
                onChange={(event) => setHolidayAmount(formatTurkishInput(event.target.value))}
                placeholder="Varsa tutarı girin"
                className={inputClass}
              />
            </label>
          </div>

          {selectedSeveranceEmployee && severanceCalculation && (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
              <div className="flex items-center gap-2 border-b border-dashed border-white/15 px-5 py-4">
                <Landmark className="h-4 w-4 text-amber-300" />
                <p className="text-sm font-semibold text-white">Tazminat Özeti — {employeeLabel(selectedSeveranceEmployee)}</p>
              </div>

              <div className="grid gap-x-6 gap-y-1 px-5 py-4 text-sm text-blue-200/60 md:grid-cols-2">
                <div>İşe giriş: <span className="font-mono text-blue-100/90">{displayDate(selectedSeveranceEmployee.ise_giris || selectedSeveranceEmployee.ise_giris_tarihi) || '—'}</span></div>
                <div>Brüt ücret: <span className="font-mono text-blue-100/90">{money(severanceCalculation.grossSalary)} TL</span></div>
                <div>Hesaba esas brüt: <span className="font-mono text-blue-100/90">{money(severanceCalculation.calculationGross)} TL</span></div>
                <div>Çalışma süresi: <span className="font-mono text-blue-100/90">{severanceCalculation.service.yil} yıl {severanceCalculation.service.ay} ay {severanceCalculation.service.gun} gün</span></div>
                <div>Kıdem tavanı: <span className="font-mono text-blue-100/90">{money(severanceCalculation.ceiling)} TL</span></div>
              </div>

              <div className="grid gap-3 px-5 pb-4 md:grid-cols-2">
                {includeSeverance && (
                  <div className="rounded-xl border border-white/10 bg-blue-950/30 p-3">
                    <h3 className="text-sm font-semibold text-amber-300">Kıdem Tazminatı</h3>
                    <div className="mt-1 space-y-0.5 font-mono text-sm text-blue-100/80">
                      <p>Süre: {severanceCalculation.service.yil} yıl {severanceCalculation.service.ay} ay {severanceCalculation.service.gun} gün</p>
                      <p>Brüt: {money(severanceCalculation.severanceGross)} TL</p>
                      <p>Damga vergisi: {money(severanceCalculation.severanceStamp)} TL</p>
                      <p className="font-semibold text-emerald-300">Net: {money(severanceCalculation.severanceNet)} TL</p>
                    </div>
                    {severanceCalculation.severanceEligible && !severanceCalculation.severanceMinServiceMet && (
                      <p className="mt-2 text-xs text-red-300">Çalışma süresi 1 yıldan az olduğu için kıdem tazminatı hakkı doğmaz.</p>
                    )}
                  </div>
                )}
                {includeNotice && (
                  <div className="rounded-xl border border-white/10 bg-blue-950/30 p-3">
                    <h3 className="text-sm font-semibold text-amber-300">İhbar Tazminatı</h3>
                    <div className="mt-1 space-y-0.5 font-mono text-sm text-blue-100/80">
                      <p>Süre: {severanceCalculation.notice?.hafta || 0} hafta ({severanceCalculation.notice?.gun || 0} gün)</p>
                      <p>Brüt: {money(severanceCalculation.noticeGross)} TL</p>
                      <p>Gelir vergisi: {money(severanceCalculation.noticeIncomeTax)} TL</p>
                      <p>Damga vergisi: {money(severanceCalculation.noticeStamp)} TL</p>
                      <p className="font-semibold text-emerald-300">Net: {money(severanceCalculation.noticeNet)} TL</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mx-5 mb-4 rounded-xl border border-white/10 bg-blue-950/30 p-3 text-sm">
                <h3 className="font-semibold text-amber-300">Kullanılmamış Yıllık İzin</h3>
                <div className="mt-1 grid gap-1 font-mono text-blue-100/80 md:grid-cols-2">
                  <p>Hak edilen: {money(severanceCalculation.annualEntitlement)} gün</p>
                  <p>Kullanılan: {money(severanceCalculation.usedAnnualLeave)} gün</p>
                  <p>Geçmiş yıl bakiyesi: {money(severanceCalculation.pastLeaveDays)} gün</p>
                  <p>Toplam kullanılmamış: {money(severanceCalculation.unusedLeaveDays)} gün</p>
                  <p>Brüt izin ücreti: {money(severanceCalculation.unusedLeaveGross)} TL</p>
                  <p>Gelir vergisi: -{money(severanceCalculation.unusedLeaveIncomeTax)} TL</p>
                  <p>Damga vergisi: -{money(severanceCalculation.unusedLeaveStamp)} TL</p>
                  <p className="font-semibold text-emerald-300">Net izin ücreti: {money(severanceCalculation.unusedLeaveNet)} TL</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-white/15 bg-amber-400/5 px-5 py-3">
                <strong className="font-mono text-lg text-amber-300">Toplam net: {money(severanceCalculation.totalNet)} TL</strong>
                <button
                  type="button"
                  onClick={() => downloadRelease(selectedSeveranceEmployee, {
                    exitDate: severanceExitDate,
                    reason: severanceReason,
                    hasSgkRetirementDocument,
                    includeSeverance,
                    includeNotice,
                    includeUnusedLeave,
                    overtimeAmount,
                    holidayAmount
                  })}
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-400 to-yellow-500 px-4 py-2 text-sm font-semibold text-blue-950 transition-shadow hover:shadow-lg hover:shadow-amber-500/30"
                >
                  <FileDown className="h-4 w-4" />
                  İbraname hazırla
                </button>
              </div>

              <div className="grid gap-3 border-t border-white/10 px-5 py-4 md:grid-cols-3">
                <label className="space-y-1 text-sm">
                  <span className={labelClass}>Ödeme tarihi</span>
                  <input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className={inputClass} />
                </label>
                <label className="space-y-1 text-sm">
                  <span className={labelClass}>Ödeme yöntemi</span>
                  <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className={inputClass}>
                    <option value="banka">Banka</option>
                    <option value="diger">Diğer</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className={labelClass}>IBAN</span>
                  <input value={iban} onChange={(event) => setIban(event.target.value)} placeholder="TR..." className={inputClass} />
                </label>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
