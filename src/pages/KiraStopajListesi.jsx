import { useEffect, useMemo, useState } from 'react'
import { Building2, Calendar, Download, FileText, Mail, MessageCircle } from 'lucide-react'
import { useClients } from '../hooks/useClients'
import {
  hesaplaAylikKiraStopaj,
  parseKiraBilgisi,
  paraTR
} from '../utils/kiraUtils'
import { parseTurkishNumber } from '../utils/numberFormat'
import { createUnicodePdf } from '../utils/unicodePdf'
import { sendEmail as sendEmailService, logWhatsAppWebSend, openWhatsAppWeb } from '../services/whatsappService'

const aylar = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık'
]

const tenantLabel = (client) => (
  client?.name
  || client?.unvan
  || client?.company
  || client?.ad_soyad
  || `Kiracı #${client?.id || ''}`
)

const clientLabel = tenantLabel

const clientTaxOffice = (client) => client?.taxOffice || client?.tax_office || '-'
const clientTaxNumber = (client) => client?.vkn || client?.tc || client?.taxNo || client?.tax_no || '-'
const ownerLabel = (owner, index) => (
  owner?.sahipAdSoyad
  ||
  owner?.adSoyad
  || owner?.ad_soyad
  || owner?.name
  || `Mal Sahibi ${index + 1}`
)

const allOwnersFromPeriods = (kira) => {
  const periods = [
    ...(Array.isArray(kira?.kiraGecmisi) ? kira.kiraGecmisi : []),
    kira
  ]
  return periods.flatMap((period) => (
    Array.isArray(period?.isyeriSahipleri)
      ? period.isyeriSahipleri
      : (Array.isArray(period?.isyeriMalSahipleri) ? period.isyeriMalSahipleri : [])
  ))
}

const ownerKey = (owner, index) => (
  `${index}:${owner?.tc || owner?.tc_kimlik || ''}:${ownerLabel(owner, index)}`
)

const ownerIdentity = (owner, index) => (
  `${owner?.tc || owner?.tc_kimlik || ''}:${ownerLabel(owner, index)}`
)

const kiraFromClient = (client) => {
  try {
    return parseKiraBilgisi(client || {})
  } catch {
    const raw = client?.kiraBilgisi ?? client?.kira_bilgisi ?? {}
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw)
      } catch {
        return {}
      }
    }
    return raw || {}
  }
}

const money = (value) => paraTR(parseTurkishNumber(value))

export default function KiraStopajListesi() {
  const clientsResult = useClients() || {}
  const clients = Array.isArray(clientsResult?.clients) ? clientsResult.clients : []
  const [clientId, setClientId] = useState('')
  const [yil, setYil] = useState(new Date().getFullYear())
  const [baslangicAy, setBaslangicAy] = useState(1)
  const [bitisAy, setBitisAy] = useState(12)
  const [selectedOwnerKey, setSelectedOwnerKey] = useState('')

  const selectedClient = useMemo(
    () => clients.find((client) => String(client.id) === String(clientId)),
    [clients, clientId]
  )
  const kiraBilgisi = useMemo(() => kiraFromClient(selectedClient), [selectedClient])

  const ownerOptions = useMemo(() => {
    const savedOwners = allOwnersFromPeriods(kiraBilgisi)

    if (savedOwners.length > 0) {
      const seen = new Set()
      return savedOwners
        .map((owner, index) => ({
          key: ownerKey(owner, index),
          index,
          owner,
          label: ownerLabel(owner, index)
        }))
        .filter((item) => {
          const identity = `${item.owner?.tc || item.owner?.tc_kimlik || ''}:${item.label}`
          if (seen.has(identity)) return false
          seen.add(identity)
          return true
        })
    }

    const firstMonth = hesaplaAylikKiraStopaj(kiraBilgisi, yil, 1) || []
    return firstMonth.map((owner, index) => ({
      key: ownerKey(owner, owner.index ?? index),
      index: owner.index ?? index,
      owner,
      label: ownerLabel(owner, owner.index ?? index)
    }))
  }, [kiraBilgisi, yil])

  useEffect(() => {
    if (!clientId && clients.length > 0) {
      setClientId(String(clients[0].id))
    }
  }, [clientId, clients])

  useEffect(() => {
    setSelectedOwnerKey(ownerOptions[0]?.key || '')
  }, [clientId, ownerOptions])

  const selectedOwner = useMemo(
    () => ownerOptions.find((owner) => owner.key === selectedOwnerKey),
    [ownerOptions, selectedOwnerKey]
  )

  const report = useMemo(() => {
    if (!selectedClient || !selectedOwner) return []

    const start = Math.min(Number(baslangicAy) || 1, Number(bitisAy) || 12)
    const end = Math.max(Number(baslangicAy) || 1, Number(bitisAy) || 12)

    return Array.from({ length: end - start + 1 }, (_, offset) => {
      const ay = start + offset
      const allOwners = hesaplaAylikKiraStopaj(kiraBilgisi, yil, ay) || []
      const owner = allOwners.find((item, index) => (
        ownerIdentity(item, item?.index ?? index) === ownerIdentity(selectedOwner.owner, selectedOwner.index)
        || ownerKey(item, item?.index ?? index) === selectedOwnerKey
      ))

      if (!owner) return null
      return { ay, owner }
    }).filter(Boolean)
  }, [baslangicAy, bitisAy, kiraBilgisi, selectedClient, selectedOwner, selectedOwnerKey, yil])

  const totals = useMemo(() => report.reduce((result, item) => ({
    brut: result.brut + (Number(item.owner.brut) || 0),
    stopaj: result.stopaj + (Number(item.owner.stopaj) || 0),
    net: result.net + (Number(item.owner.net) || 0)
  }), { brut: 0, stopaj: 0, net: 0 }), [report])

  const downloadPdf = () => {
    if (!selectedClient || !selectedOwner || report.length === 0) return

    const pdf = createUnicodePdf()
    const title = `${yil} Kira Stopaj Listesi`
    const tenantName = tenantLabel(selectedClient)
    const ownerName = selectedOwner.label

    pdf.setFont('Arial', 'bold')
    pdf.setFontSize(16)
    pdf.text(title, 14, 18)
    pdf.setFontSize(10)
    const tenantLines = pdf.splitTextToSize(`Kiracı: ${tenantName}`, 180)
    pdf.text(tenantLines, 14, 27)
    let headerY = 27 + tenantLines.length * 5
    pdf.text(`Vergi Dairesi: ${clientTaxOffice(selectedClient)}`, 14, headerY)
    headerY += 5
    pdf.text(`Vergi No / T.C.: ${clientTaxNumber(selectedClient)}`, 14, headerY)
    headerY += 5
    pdf.text(`Mal sahibi: ${ownerName}`, 14, headerY)
    headerY += 5
    pdf.text(`Dönem: ${aylar[baslangicAy - 1]} - ${aylar[bitisAy - 1]} ${yil}`, 14, headerY)

    let y = headerY + 10
    pdf.setFontSize(8)
    pdf.setFont('Arial', 'bold')
    pdf.text('Ay', 14, y)
    pdf.text('Brüt Kira', 48, y)
    pdf.text('Stopaj', 88, y)
    pdf.text('Net Kira', 128, y)
    y += 6
    pdf.setFont('Arial', 'normal')

    report.forEach(({ ay, owner }) => {
      pdf.text(aylar[ay - 1], 14, y)
      pdf.text(`${money(owner.brut)} TL`, 48, y)
      pdf.text(`${money(owner.stopaj)} TL`, 88, y)
      pdf.text(`${money(owner.net)} TL`, 128, y)
      y += 6
      if (y > 280) {
        pdf.addPage()
        y = 18
      }
    })

    y += 5
    pdf.setFont('Arial', 'bold')
    pdf.text(`Toplam brüt: ${money(totals.brut)} TL`, 14, y)
    pdf.text(`Toplam stopaj: ${money(totals.stopaj)} TL`, 14, y + 6)
    pdf.text(`Toplam net: ${money(totals.net)} TL`, 14, y + 12)

    y += 24
    pdf.setFont('Arial', 'normal')
    pdf.setFontSize(8)
    pdf.text(`Kiracı: ${tenantName}`, 14, y)
    y += 5
    pdf.text(`Vergi Dairesi: ${clientTaxOffice(selectedClient)}`, 14, y)
    y += 5
    pdf.text(`Vergi No / T.C.: ${clientTaxNumber(selectedClient)}`, 14, y)

    pdf.save(`kira-stopaj-${ownerName.replace(/\s+/g, '-').toLowerCase()}-${yil}.pdf`)
  }

  const getReportText = () => [
    `${yil} Kira Stopaj Listesi`,
    `Kiracı: ${tenantLabel(selectedClient)}`,
    `Vergi Dairesi: ${clientTaxOffice(selectedClient)}`,
    `Vergi No / T.C.: ${clientTaxNumber(selectedClient)}`,
    `Mal sahibi: ${selectedOwner?.label || '-'}`,
    `Dönem: ${aylar[baslangicAy - 1]} - ${aylar[bitisAy - 1]} ${yil}`,
    ...report.map(({ ay, owner }) => (
      `${aylar[ay - 1]}: Brüt ${money(owner.brut)} TL, Stopaj ${money(owner.stopaj)} TL, Net ${money(owner.net)} TL`
    )),
    `Toplam brüt: ${money(totals.brut)} TL`,
    `Toplam stopaj: ${money(totals.stopaj)} TL`,
    `Toplam net: ${money(totals.net)} TL`
  ].join('\n')

  const sendEmail = async () => {
    if (!selectedClient || !selectedOwner || !report.length) return
    const recipient = window.prompt(
      'Raporun gönderileceği e-posta adresini yazın:',
      selectedClient.email || ''
    )
    if (recipient === null) return
    const email = recipient.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      window.alert('Lütfen geçerli bir e-posta adresi yazın.')
      return
    }
    const subject = `${yil} Kira Stopaj Listesi - ${selectedOwner.label}`
    try {
      await sendEmailService({
        toEmail: email,
        toName: tenantLabel(selectedClient),
        subject,
        message: getReportText(),
        clientId: selectedClient.id,
        documentType: 'kira_stopaj'
      })
      window.alert('Rapor e-posta ile gönderildi.')
    } catch {
      window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(getReportText())}`
    }
  }

  const sendWhatsApp = async () => {
    if (!selectedClient || !selectedOwner || !report.length) return
    const enteredPhone = window.prompt(
      'Raporun gönderileceği WhatsApp telefon numarasını yazın:',
      selectedClient.whatsapp || selectedClient.phone || ''
    )
    if (enteredPhone === null) return
    const phone = String(enteredPhone).replace(/\D/g, '')
    if (phone.length < 10) {
      window.alert('Lütfen geçerli bir telefon numarası yazın.')
      return
    }
    const normalizedPhone = phone.startsWith('0') ? `90${phone.slice(1)}` : phone
    const waSonuc = await openWhatsAppWeb({ phone: normalizedPhone, message: getReportText() })
    if (waSonuc?.ok === false) {
      window.alert(waSonuc?.not || waSonuc?.reason || 'WhatsApp gönderilemedi.')
      return
    }
    logWhatsAppWebSend({
      clientId: selectedClient.id,
      documentType: 'kira_stopaj',
      target: normalizedPhone,
      status: waSonuc?.otomatik ? 'sent' : 'pending'
    }).catch(() => {})
  }

  return (
    <div className="min-h-screen space-y-6 p-4 text-white md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Building2 size={24} />
          Kira Stopaj Listesi
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Rapor, seçtiğiniz tek mal sahibine göre hazırlanır.
        </p>
      </div>

      <div className="grid gap-4 rounded-xl border border-slate-700 bg-slate-900 p-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1">
          <span className="flex items-center gap-1 text-sm text-slate-300"><Building2 size={15} /> Müşteri</span>
          <select value={clientId} onChange={(event) => setClientId(event.target.value)} className="w-full rounded-lg bg-slate-800 px-3 py-2">
            <option value="">Müşteri seçin</option>
            {clients.filter((client) => client?.id).slice().sort((a, b) => tenantLabel(a).localeCompare(tenantLabel(b), 'tr')).map((client) => (
              <option key={client.id} value={client.id}>{tenantLabel(client)}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="flex items-center gap-1 text-sm text-slate-300"><FileText size={15} /> Mal sahibi</span>
          <select
            value={selectedOwnerKey}
            onChange={(event) => setSelectedOwnerKey(event.target.value)}
            disabled={!ownerOptions.length}
            className="w-full rounded-lg bg-slate-800 px-3 py-2 disabled:opacity-50"
          >
            <option value="">Mal sahibi seçin</option>
            {ownerOptions.map((owner) => (
              <option key={owner.key} value={owner.key}>{owner.label}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="flex items-center gap-1 text-sm text-slate-300"><Calendar size={15} /> Yıl</span>
          <select value={yil} onChange={(event) => setYil(Number(event.target.value))} className="w-full rounded-lg bg-slate-800 px-3 py-2">
            {[yil - 1, yil, yil + 1].map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>

        <div className="space-y-1">
          <span className="text-sm text-slate-300">Rapor dönemi</span>
          <div className="flex gap-2">
            <select value={baslangicAy} onChange={(event) => setBaslangicAy(Number(event.target.value))} className="min-w-0 flex-1 rounded-lg bg-slate-800 px-2 py-2">
              {aylar.map((ay, index) => <option key={ay} value={index + 1}>{ay}</option>)}
            </select>
            <select value={bitisAy} onChange={(event) => setBitisAy(Number(event.target.value))} className="min-w-0 flex-1 rounded-lg bg-slate-800 px-2 py-2">
              {aylar.map((ay, index) => <option key={ay} value={index + 1}>{ay}</option>)}
            </select>
          </div>
        </div>
      </div>

      {!selectedClient && <div className="rounded-xl border border-slate-700 bg-slate-900 p-6 text-slate-400">Önce müşteri seçin.</div>}
      {selectedClient && !ownerOptions.length && <div className="rounded-xl border border-amber-700/50 bg-amber-900/20 p-6 text-amber-200">Bu müşteriye ait işyeri mal sahibi kaydı bulunamadı.</div>}
      {selectedClient && ownerOptions.length > 0 && !selectedOwner && <div className="rounded-xl border border-amber-700/50 bg-amber-900/20 p-6 text-amber-200">Rapor için mal sahibi seçin.</div>}

      {selectedOwner && (
        <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{selectedOwner.label}</h2>
              <p className="text-sm text-slate-400">
                {selectedOwner.owner?.tc || selectedOwner.owner?.tc_kimlik || 'T.C. bilgisi yok'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={downloadPdf} disabled={!report.length} className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm disabled:opacity-50">
                <Download size={16} />
                PDF indir
              </button>
              <button type="button" onClick={sendEmail} disabled={!report.length} className="flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm disabled:opacity-50">
                <Mail size={16} />
                E-posta gönder
              </button>
              <button type="button" onClick={sendWhatsApp} disabled={!report.length} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm disabled:opacity-50">
                <MessageCircle size={16} />
                WhatsApp gönder
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-slate-700 text-slate-400">
                <tr>
                  <th className="p-3">Ay</th>
                  <th className="p-3">Mal sahibi</th>
                  <th className="p-3">Brüt kira</th>
                  <th className="p-3">Stopaj</th>
                  <th className="p-3">Net kira</th>
                </tr>
              </thead>
              <tbody>
                {report.map(({ ay, owner }) => (
                  <tr key={ay} className="border-b border-slate-800">
                    <td className="p-3">{aylar[ay - 1]}</td>
                    <td className="p-3">{owner.sahipAdSoyad || selectedOwner.label}</td>
                    <td className="p-3">{money(owner.brut)} TL</td>
                    <td className="p-3">{money(owner.stopaj)} TL</td>
                    <td className="p-3">{money(owner.net)} TL</td>
                  </tr>
                ))}
                {!report.length && (
                  <tr><td colSpan="5" className="p-6 text-center text-slate-400">Seçilen dönemde kayıt bulunamadı.</td></tr>
                )}
              </tbody>
              <tfoot className="border-t border-slate-700 font-semibold">
                <tr>
                  <td colSpan="2" className="p-3">Seçilen mal sahibi toplamı</td>
                  <td className="p-3">{money(totals.brut)} TL</td>
                  <td className="p-3">{money(totals.stopaj)} TL</td>
                  <td className="p-3">{money(totals.net)} TL</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}