import { useMemo, useState } from 'react'
import { Download, Mail, MessageCircle } from 'lucide-react'
import {
  hesaplaAylikKiraStopaj,
  parseKiraBilgisi,
  paraTR
} from '../utils/kiraUtils'
import { parseTurkishNumber } from '../utils/numberFormat'
import { createUnicodePdf } from '../utils/unicodePdf'
import { sendEmail as sendEmailService, logWhatsAppWebSend, openWhatsAppWeb } from '../services/whatsappService'

const aylar = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
]

const tenantName = (client) => (
  client?.name || client?.unvan || client?.company || client?.ad_soyad || 'Kiracı'
)

const clientTaxOffice = (client) => client?.taxOffice || client?.tax_office || '-'
const clientTaxNumber = (client) => client?.vkn || client?.tc || client?.taxNo || client?.tax_no || '-'
const ownerName = (owner, index) => (
  owner?.sahipAdSoyad
  || owner?.adSoyad
  || owner?.ad_soyad
  || owner?.name
  || `Mal Sahibi ${index + 1}`
)

const ownerKey = (owner, index) => (
  `${index}:${owner?.sahipTc || owner?.tc || owner?.tc_kimlik || ''}:${ownerName(owner, index)}`
)

const ownerIdentity = (owner, index) => (
  `${owner?.sahipTc || owner?.tc || owner?.tc_kimlik || ''}:${ownerName(owner, index)}`
)

const getKira = (client) => {
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

const getOwnerOptions = (kira, yil) => {
  const donemler = [
    ...(Array.isArray(kira?.kiraGecmisi) ? kira.kiraGecmisi : []),
    kira
  ]
  const saved = donemler
    .flatMap((donem) => (
      Array.isArray(donem?.isyeriSahipleri)
        ? donem.isyeriSahipleri
        : (Array.isArray(donem?.isyeriMalSahipleri) ? donem.isyeriMalSahipleri : [])
    ))
    .filter((owner, index, owners) => (
      owners.findIndex((item) => (
        `${item?.tc || item?.tc_kimlik || ''}:${ownerName(item, 0)}`
        === `${owner?.tc || owner?.tc_kimlik || ''}:${ownerName(owner, 0)}`
      )) === index
    ))
  if (saved.length > 0) {
    return saved.map((owner, index) => ({
      key: ownerKey(owner, index),
      index,
      owner,
      label: ownerName(owner, index)
    }))
  }
  return (hesaplaAylikKiraStopaj(kira, yil, 1) || []).map((owner, index) => ({
    key: ownerKey(owner, owner.index ?? index),
    index: owner.index ?? index,
    owner,
    label: ownerName(owner, owner.index ?? index)
  }))
}

const money = (value) => paraTR(parseTurkishNumber(value))

export default function KiraStopajRaporu({ client, showRecipientActions = true }) {
  const [yil, setYil] = useState(new Date().getFullYear())
  const [baslangicAy, setBaslangicAy] = useState(1)
  const [bitisAy, setBitisAy] = useState(12)
  const [selectedOwnerKey, setSelectedOwnerKey] = useState('')
  const kira = useMemo(() => getKira(client), [client])
  const ownerOptions = useMemo(() => getOwnerOptions(kira, yil), [kira, yil])

  const selectedOwner = useMemo(() => (
    ownerOptions.find((owner) => owner.key === selectedOwnerKey) || ownerOptions[0]
  ), [ownerOptions, selectedOwnerKey])

  const report = useMemo(() => {
    if (!selectedOwner) return []
    const start = Math.min(Number(baslangicAy) || 1, Number(bitisAy) || 12)
    const end = Math.max(Number(baslangicAy) || 1, Number(bitisAy) || 12)
    return Array.from({ length: end - start + 1 }, (_, offset) => {
      const ay = start + offset
      const owners = hesaplaAylikKiraStopaj(kira, yil, ay) || []
      const owner = owners.find((item, index) => (
        ownerIdentity(item, item?.index ?? index) === ownerIdentity(selectedOwner.owner, selectedOwner.index)
        || ownerKey(item, item?.index ?? index) === selectedOwner.key
      ))
      return owner ? { ay, owner } : null
    }).filter(Boolean)
  }, [baslangicAy, bitisAy, kira, selectedOwner, yil])

  const totals = useMemo(() => report.reduce((result, item) => ({
    brut: result.brut + (Number(item.owner.brut) || 0),
    stopaj: result.stopaj + (Number(item.owner.stopaj) || 0),
    net: result.net + (Number(item.owner.net) || 0)
  }), { brut: 0, stopaj: 0, net: 0 }), [report])

  const getReportText = () => [
    `${yil} Kira Stopaj Listesi`,
    `Kiracı: ${tenantName(client)}`,
    `Vergi Dairesi: ${clientTaxOffice(client)}`,
    `Vergi No / T.C.: ${clientTaxNumber(client)}`,
    `Mal sahibi: ${selectedOwner?.label || '-'}`,
    `Dönem: ${aylar[baslangicAy - 1]} - ${aylar[bitisAy - 1]} ${yil}`,
    ...report.map(({ ay, owner }) => (
      `${aylar[ay - 1]}: Brüt ${money(owner.brut)} TL, Stopaj ${money(owner.stopaj)} TL, Net ${money(owner.net)} TL`
    )),
    `Toplam stopaj: ${money(totals.stopaj)} TL`
  ].join('\n')

  const downloadPdf = () => {
    if (!selectedOwner || !report.length) return
    const pdf = createUnicodePdf()
    let y = 18
    pdf.setFont('Arial', 'bold')
    pdf.setFontSize(16)
    pdf.text(`${yil} Kira Stopaj Listesi`, 14, y)
    y += 9
    pdf.setFontSize(10)
    const tenantLines = pdf.splitTextToSize(`Kiracı: ${tenantName(client)}`, 180)
    pdf.text(tenantLines, 14, y)
    y += tenantLines.length * 5
    pdf.text(`Vergi Dairesi: ${clientTaxOffice(client)}`, 14, y)
    y += 5
    pdf.text(`Vergi No / T.C.: ${clientTaxNumber(client)}`, 14, y)
    y += 5
    pdf.text(`Mal sahibi: ${selectedOwner.label}`, 14, y)
    y += 5
    pdf.text(`Dönem: ${aylar[baslangicAy - 1]} - ${aylar[bitisAy - 1]} ${yil}`, 14, y)
    y += 10
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
    y += 6
    pdf.setFont('Arial', 'bold')
    pdf.text(`Toplam brüt: ${money(totals.brut)} TL`, 14, y)
    pdf.text(`Toplam stopaj: ${money(totals.stopaj)} TL`, 14, y + 6)
    pdf.text(`Toplam net: ${money(totals.net)} TL`, 14, y + 12)

    y += 24
    pdf.setFont('Arial', 'normal')
    pdf.setFontSize(8)
    pdf.text(`Kiracı: ${tenantName(client)}`, 14, y)
    y += 5
    pdf.text(`Vergi Dairesi: ${clientTaxOffice(client)}`, 14, y)
    y += 5
    pdf.text(`Vergi No / T.C.: ${clientTaxNumber(client)}`, 14, y)

    pdf.save(`kira-stopaj-${selectedOwner.label.replace(/\s+/g, '-').toLowerCase()}-${yil}.pdf`)
  }

  const sendEmail = async () => {
    if (!selectedOwner || !report.length) return
    const recipient = window.prompt(
      'Raporun gönderileceği e-posta adresini yazın:',
      client?.email || ''
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
        toName: tenantName(client),
        subject,
        message: getReportText(),
        clientId: client?.id,
        documentType: 'kira_stopaj'
      })
      window.alert('Rapor e-posta ile gönderildi.')
    } catch {
      window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(getReportText())}`
    }
  }

  const sendWhatsApp = async () => {
    if (!selectedOwner || !report.length) return
    const enteredPhone = window.prompt(
      'Raporun gönderileceği WhatsApp telefon numarasını yazın:',
      client?.whatsapp || client?.phone || client?.telefon || ''
    )
    if (enteredPhone === null) return
    const phone = String(enteredPhone).replace(/\D/g, '')
    if (phone.length < 10) {
      window.alert('Lütfen geçerli bir telefon numarası yazın.')
      return
    }
    const normalizedPhone = phone.startsWith('0') ? `90${phone.slice(1)}` : phone
    openWhatsAppWeb({ phone: normalizedPhone, message: getReportText() })
    logWhatsAppWebSend({
      clientId: client?.id,
      documentType: 'kira_stopaj',
      target: normalizedPhone,
      status: 'pending'
    }).catch(() => {})
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Kira Stopaj Raporu</h2>
        <p className="text-sm text-slate-400">Mal sahibini seçerek yalnızca ona ait raporu alın.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <label className="space-y-1 text-sm text-slate-300">
          <span>Mal sahibi</span>
          <select value={selectedOwner?.key || ''} onChange={(event) => setSelectedOwnerKey(event.target.value)} className="w-full rounded-lg bg-slate-800 px-3 py-2 text-white">
            <option value="">Mal sahibi seçin</option>
            {ownerOptions.map((owner) => <option key={owner.key} value={owner.key}>{owner.label}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm text-slate-300">
          <span>Yıl</span>
          <select value={yil} onChange={(event) => setYil(Number(event.target.value))} className="w-full rounded-lg bg-slate-800 px-3 py-2 text-white">
            {[yil - 1, yil, yil + 1].map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm text-slate-300">
          <span>Başlangıç ayı</span>
          <select value={baslangicAy} onChange={(event) => setBaslangicAy(Number(event.target.value))} className="w-full rounded-lg bg-slate-800 px-3 py-2 text-white">
            {aylar.map((ay, index) => <option key={ay} value={index + 1}>{ay}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm text-slate-300">
          <span>Bitiş ayı</span>
          <select value={bitisAy} onChange={(event) => setBitisAy(Number(event.target.value))} className="w-full rounded-lg bg-slate-800 px-3 py-2 text-white">
            {aylar.map((ay, index) => <option key={ay} value={index + 1}>{ay}</option>)}
          </select>
        </label>
      </div>

      {!selectedOwner && <p className="rounded-lg bg-amber-900/30 p-3 text-sm text-amber-200">İşyeri mal sahibi kaydı bulunamadı.</p>}
      {selectedOwner && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm text-white">
              <thead className="border-b border-slate-700 text-slate-400">
                <tr>
                  <th className="p-3">Ay</th>
                  <th className="p-3">Brüt kira</th>
                  <th className="p-3">Stopaj</th>
                  <th className="p-3">Net kira</th>
                </tr>
              </thead>
              <tbody>
                {report.map(({ ay, owner }) => (
                  <tr key={ay} className="border-b border-slate-800">
                    <td className="p-3">{aylar[ay - 1]}</td>
                    <td className="p-3">{money(owner.brut)} TL</td>
                    <td className="p-3">{money(owner.stopaj)} TL</td>
                    <td className="p-3">{money(owner.net)} TL</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-slate-700 font-semibold">
                <tr>
                  <td className="p-3">Toplam</td>
                  <td className="p-3">{money(totals.brut)} TL</td>
                  <td className="p-3">{money(totals.stopaj)} TL</td>
                  <td className="p-3">{money(totals.net)} TL</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {showRecipientActions && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={downloadPdf} disabled={!report.length} className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50"><Download size={16} /> PDF indir</button>
              <button type="button" onClick={sendEmail} disabled={!report.length} className="flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm text-white disabled:opacity-50"><Mail size={16} /> E-posta</button>
              <button type="button" onClick={sendWhatsApp} disabled={!report.length} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50"><MessageCircle size={16} /> WhatsApp</button>
            </div>
          )}
        </>
      )}
    </section>
  )
}