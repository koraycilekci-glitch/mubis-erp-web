import { useState } from 'react'
import {
  FileText, Printer, User, Building2, Calendar, RotateCcw
} from 'lucide-react'
import jsPDF from 'jspdf'

export default function PersonelIbraname({ employees, clientInfo }) {
  const [selectedEmpId, setSelectedEmpId] = useState('')
  const [tarih, setTarih] = useState(new Date().toISOString().split('T')[0])
  const [aciklama, setAciklama] = useState('')
  const [msg, setMsg] = useState('')

  const selectedEmp = employees.find(e => String(e.id) === selectedEmpId)

  const generateIbranameText = () => {
    if (!selectedEmp || !clientInfo) return ''
    const isveren = clientInfo.name || clientInfo.company || '-'
    const isverenAdres = clientInfo.address || clientInfo.city || '-'

    return `
IBRANAME

Tarih: ${new Date(tarih).toLocaleDateString('tr-TR')}

ISVEREN BILGILERI
Isveren: ${isveren}
Adres: ${isverenAdres}

ISCI BILGILERI
Adi Soyadi: ${selectedEmp.ad_soyad || '-'}
TC Kimlik No: ${selectedEmp.tc_kimlik || '-'}
Ise Giris Tarihi: ${selectedEmp.ise_giris || '-'}
Isten Cikis Tarihi: ${selectedEmp.isten_cikis || '-'}
Brut Ucret: ${Number(selectedEmp.brut_ucret || 0).toLocaleString('tr-TR')} TL

IBRA KONUSU
${aciklama || 'Yukarida bilgileri bulunan isci ile isveren arasindaki tum alacaklar (ucret, fazla mesai, yillik izin, kidem/ihbar tazminati vb.) karsilikli olarak kapatilmistir. Taraflar birbirlerinden herhangi bir alacak talebinde bulunmayacaklarini kabul ve taahhut ederler.'}

Taraflar bu belgeyi okuyup anladiklarini, herhangi bir zorlama altinda kalmadiklarini beyan ederler.

ISVEREN                       ISCI
Adi/Soyadi: ${isveren}        Adi/Soyadi: ${selectedEmp.ad_soyad || '-'}

Imza: _______________          Imza: _______________


    `.trim()
  }

  const printPDF = () => {
    if (!selectedEmp) return
    const doc = new jsPDF()
    const text = generateIbranameText()
    const lines = doc.splitTextToSize(text, 180)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('IBRANAME', 105, 20, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(lines, 20, 35)

    doc.save(`ibraname_${selectedEmp.ad_soyad || 'personel'}.pdf`)
    setMsg('Ibraname PDF olarak indirildi.')
    setTimeout(() => setMsg(''), 3000)
  }

  return (
    <div className="space-y-6">
      {msg && (
        <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm">{msg}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sol - Form */}
        <div className="space-y-4">
          <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
              <User className="w-5 h-5 text-yellow-400" /> Personel Secimi
            </h3>
            <select
              value={selectedEmpId}
              onChange={e => setSelectedEmpId(e.target.value)}
              className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 px-4 text-white focus:outline-none focus:border-yellow-400 mb-4"
            >
              <option value="">Personel Secin...</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.ad_soyad} - {e.tc_kimlik}</option>
              ))}
            </select>

            {selectedEmp && (
              <div className="space-y-2 text-sm text-gray-300">
                <div className="flex justify-between"><span>Ad Soyad:</span><span className="text-white">{selectedEmp.ad_soyad}</span></div>
                <div className="flex justify-between"><span>TC:</span><span className="text-white">{selectedEmp.tc_kimlik}</span></div>
                <div className="flex justify-between"><span>Ise Giris:</span><span className="text-white">{selectedEmp.ise_giris || '-'}</span></div>
                <div className="flex justify-between"><span>Isten Cikis:</span><span className="text-white">{selectedEmp.isten_cikis || '-'}</span></div>
              </div>
            )}
          </div>

          <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-yellow-400" /> Ibraname Detaylari
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Tarih</label>
                <input type="date" value={tarih} onChange={e => setTarih(e.target.value)} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Ibra Aciklamasi (istege bagli)</label>
                <textarea
                  value={aciklama}
                  onChange={e => setAciklama(e.target.value)}
                  rows={4}
                  placeholder="Varsayilan metin kullanilacak..."
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm resize-none"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={printPDF} disabled={!selectedEmp} className="flex-1 bg-gradient-to-r from-green-600 to-green-500 text-white py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50">
              <Printer className="w-4 h-4" /> PDF Olustur
            </button>
            <button onClick={() => { setSelectedEmpId(''); setAciklama(''); setMsg('') }} className="px-4 py-2.5 bg-blue-900/30 border border-blue-700/50 text-gray-300 rounded-lg hover:bg-blue-800/30 flex items-center gap-2">
              <RotateCcw className="w-4 h-4" /> Temizle
            </button>
          </div>
        </div>

        {/* Sag - Onizleme */}
        <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-yellow-400" /> Onizleme
          </h3>
          <div className="bg-white/5 rounded-lg p-4 border border-blue-700/20 whitespace-pre-wrap text-sm text-gray-300 font-mono leading-relaxed">
            {selectedEmp ? generateIbranameText() : 'Personel seciniz...'}
          </div>
        </div>
      </div>
    </div>
  )
}
