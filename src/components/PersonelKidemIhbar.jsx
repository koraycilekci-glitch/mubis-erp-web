import { useState, useEffect, useMemo } from 'react'
import {
  Calculator, User, Building2, Calendar, Save, Printer, RotateCcw,
  CheckSquare, Square, FileText
} from 'lucide-react'
import { DAMGA_VERGISI, SGK, getKidemTavani, getIhbarSuresi, fmt } from '../data/defaults'
import jsPDF from 'jspdf'

export default function PersonelKidemIhbar({ employees, clientInfo }) {
  const [selectedEmpId, setSelectedEmpId] = useState('')
  const [cikis, setCikis] = useState('')
  const [cikisSebebi, setCikisSebebi] = useState('isveren')
  const [emekliKagit, setEmekliKagit] = useState(false)
  const [kidemChecked, setKidemChecked] = useState(true)
  const [ihbarChecked, setIhbarChecked] = useState(true)
  const [ekOdeme, setEkOdeme] = useState('')
  const [msg, setMsg] = useState('')

  const selectedEmp = employees.find(e => String(e.id) === selectedEmpId)

  const giris = selectedEmp?.ise_giris || ''
  const brutUcret = Number(selectedEmp?.brut_ucret) || 0
  const ekOdemeTutar = Number(ekOdeme) || 0
  const toplamBrut = brutUcret + ekOdemeTutar

  const yil = cikis ? new Date(cikis).getFullYear() : new Date().getFullYear()

  const ihbarSuresi = useMemo(() => {
    if (!giris || !cikis) return null
    return getIhbarSuresi(giris, cikis)
  }, [giris, cikis])

  const calismaSuresi = useMemo(() => {
    if (!giris || !cikis) return 0
    return (new Date(cikis) - new Date(giris)) / (365.25 * 24 * 60 * 60 * 1000)
  }, [giris, cikis])

  const kidemTavani = useMemo(() => {
    return cikis ? getKidemTavani(cikis) : getKidemTavani(new Date())
  }, [cikis])

  const gunlukBrut = useMemo(() => Math.min(toplamBrut / 30, kidemTavani / 30), [toplamBrut, kidemTavani])

  const kidemBrut = useMemo(() => kidemChecked ? calismaSuresi * 30 * gunlukBrut : 0, [kidemChecked, calismaSuresi, gunlukBrut])
  const kidemDamga = useMemo(() => kidemBrut * DAMGA_VERGISI, [kidemBrut])
  const kidemNet = useMemo(() => kidemBrut - kidemDamga, [kidemBrut, kidemDamga])

  const ihbarGun = ihbarSuresi?.gun || 0
  const ihbarBrut = useMemo(() => ihbarChecked ? (toplamBrut / 30) * ihbarGun : 0, [ihbarChecked, toplamBrut, ihbarGun])
  const ihbarGelirV = useMemo(() => ihbarBrut * 0.15, [ihbarBrut])
  const ihbarDamga = useMemo(() => ihbarBrut * DAMGA_VERGISI, [ihbarBrut])
  const ihbarSgk = useMemo(() => ihbarBrut * (SGK.isci + SGK.issizlik_isci), [ihbarBrut])
  const ihbarNet = useMemo(() => ihbarBrut - ihbarGelirV - ihbarDamga - ihbarSgk, [ihbarBrut, ihbarGelirV, ihbarDamga, ihbarSgk])

  const toplamNet = useMemo(() => kidemNet + ihbarNet, [kidemNet, ihbarNet])

  useEffect(() => {
    switch (cikisSebebi) {
      case 'istifa':
        setKidemChecked(emekliKagit)
        setIhbarChecked(false)
        break
      case 'isveren':
        setKidemChecked(true)
        setIhbarChecked(true)
        break
      case 'askerlik':
      case 'evlilik':
        setKidemChecked(true)
        setIhbarChecked(false)
        break
      default:
        break
    }
  }, [cikisSebebi, emekliKagit])

  const temizle = () => {
    setSelectedEmpId('')
    setCikis('')
    setCikisSebebi('isveren')
    setEmekliKagit(false)
    setEkOdeme('')
    setMsg('')
  }

  const printPDF = () => {
    if (!selectedEmp) return
    const doc = new jsPDF()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text('KIDEM / IHBAR TAZMINATI HESAPLAMA', 105, 20, { align: 'center' })
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Tarih: ${new Date().toLocaleDateString('tr-TR')}`, 105, 28, { align: 'center' })

    doc.setFont('helvetica', 'bold')
    doc.text('ISCI BILGILERI', 20, 45)
    doc.setFont('helvetica', 'normal')
    doc.text(`Ad Soyad: ${selectedEmp.ad_soyad || '-'}`, 20, 53)
    doc.text(`TC Kimlik No: ${selectedEmp.tc_kimlik || '-'}`, 20, 59)
    doc.text(`Ise Giris: ${giris || '-'}`, 20, 65)
    doc.text(`Isten Cikis: ${cikis || '-'}`, 20, 71)
    doc.text(`Cikis Sebebi: ${cikisSebebi}`, 20, 77)
    doc.text(`Brut Ucret: ${fmt(brutUcret)} TL`, 20, 83)

    doc.setFont('helvetica', 'bold')
    doc.text('HESAPLAMA SONUCU', 20, 100)
    doc.setFont('helvetica', 'normal')
    let y = 108
    if (kidemChecked) {
      doc.text(`Kidem Tazminati (Brut): ${fmt(kidemBrut)} TL`, 20, y)
      y += 6
      doc.text(`Damga Vergisi: -${fmt(kidemDamga)} TL`, 20, y)
      y += 6
      doc.text(`Kidem Tazminati (Net): ${fmt(kidemNet)} TL`, 20, y)
      y += 10
    }
    if (ihbarChecked) {
      doc.text(`Ihbar Tazminati (Brut): ${fmt(ihbarBrut)} TL`, 20, y)
      y += 6
      doc.text(`Gelir Vergisi: -${fmt(ihbarGelirV)} TL`, 20, y)
      y += 6
      doc.text(`Damga Vergisi: -${fmt(ihbarDamga)} TL`, 20, y)
      y += 6
      doc.text(`SGK Kesintisi: -${fmt(ihbarSgk)} TL`, 20, y)
      y += 6
      doc.text(`Ihbar Tazminati (Net): ${fmt(ihbarNet)} TL`, 20, y)
      y += 10
    }
    doc.setFont('helvetica', 'bold')
    doc.text(`TOPLAM NET: ${fmt(toplamNet)} TL`, 20, y)

    doc.save(`kidem_ihbar_${selectedEmp.ad_soyad || 'personel'}.pdf`)
  }

  return (
    <div className="space-y-6">
      {msg && (
        <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm flex items-center gap-2">
          <CheckSquare className="w-4 h-4" /> {msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sol - Personel Secimi ve Bilgiler */}
        <div className="space-y-4">
          <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
              <User className="w-5 h-5 text-yellow-400" /> Personel Secimi
            </h3>
            <select
              value={selectedEmpId}
              onChange={e => { setSelectedEmpId(e.target.value); setMsg('') }}
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
                <div className="flex justify-between"><span>Brut Ucret:</span><span className="text-white">{fmt(Number(selectedEmp.brut_ucret) || 0)} TL</span></div>
              </div>
            )}
          </div>

          <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
              <Building2 className="w-5 h-5 text-yellow-400" /> Isveren Bilgileri
            </h3>
            <div className="space-y-2 text-sm text-gray-300">
              <div className="flex justify-between"><span>Isveren:</span><span className="text-white">{clientInfo?.name || clientInfo?.company || '-'}</span></div>
              <div className="flex justify-between"><span>Adres:</span><span className="text-white">{clientInfo?.address || clientInfo?.city || '-'}</span></div>
            </div>
          </div>
        </div>

        {/* Sag - Hesaplama */}
        <div className="space-y-4">
          <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
              <Calculator className="w-5 h-5 text-yellow-400" /> Hesaplama Bilgileri
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Isten Cikis Tarihi</label>
                <input type="date" value={cikis} onChange={e => setCikis(e.target.value)} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Cikis Sebebi</label>
                <select value={cikisSebebi} onChange={e => setCikisSebebi(e.target.value)} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm">
                  <option value="isveren">Isveren Tarafindan Fesih</option>
                  <option value="istifa">Istifa</option>
                  <option value="askerlik">Askerlik</option>
                  <option value="evlilik">Evlilik</option>
                  <option value="diger">Diger</option>
                </select>
              </div>

              {cikisSebebi === 'istifa' && (
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={emekliKagit} onChange={e => setEmekliKagit(e.target.checked)} className="rounded" />
                  Emeklilik hakki kazanilmistir
                </label>
              )}

              <div>
                <label className="block text-sm text-gray-400 mb-1">Ek Odeme (Prim, Ikramiye vb.)</label>
                <input type="number" value={ekOdeme} onChange={e => setEkOdeme(e.target.value)} placeholder="0" className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm" />
              </div>

              <div className="flex gap-4 pt-2">
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={kidemChecked} onChange={e => setKidemChecked(e.target.checked)} className="rounded" />
                  Kidem Tazminati
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={ihbarChecked} onChange={e => setIhbarChecked(e.target.checked)} className="rounded" />
                  Ihbar Tazminati
                </label>
              </div>
            </div>
          </div>

          {/* Sonuc Karti */}
          <div className="bg-gradient-to-br from-blue-900/50 to-blue-800/30 rounded-2xl p-6 border border-blue-700/30">
            <h3 className="text-lg font-semibold text-white mb-4">Sonuc</h3>

            {kidemChecked && (
              <div className="mb-4 pb-4 border-b border-blue-700/20">
                <div className="text-sm text-gray-400 mb-1">Kidem Tazminati</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-gray-300"><span>Calisma Suresi:</span><span>{calismaSuresi.toFixed(2)} yil</span></div>
                  <div className="flex justify-between text-gray-300"><span>Kidem Tavani:</span><span>{fmt(kidemTavani)} TL</span></div>
                  <div className="flex justify-between text-gray-300"><span>Gunluk Brut:</span><span>{fmt(gunlukBrut)} TL</span></div>
                  <div className="flex justify-between text-gray-300"><span>Brut Kidem:</span><span>{fmt(kidemBrut)} TL</span></div>
                  <div className="flex justify-between text-red-400"><span>Damga Vergisi:</span><span>-{fmt(kidemDamga)} TL</span></div>
                  <div className="flex justify-between text-green-400 font-semibold"><span>Net Kidem:</span><span>{fmt(kidemNet)} TL</span></div>
                </div>
              </div>
            )}

            {ihbarChecked && (
              <div className="mb-4 pb-4 border-b border-blue-700/20">
                <div className="text-sm text-gray-400 mb-1">Ihbar Tazminati</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-gray-300"><span>Ihbar Suresi:</span><span>{ihbarSuresi?.hafta || 0} hafta ({ihbarGun} gun)</span></div>
                  <div className="flex justify-between text-gray-300"><span>Brut Ihbar:</span><span>{fmt(ihbarBrut)} TL</span></div>
                  <div className="flex justify-between text-red-400"><span>Gelir Vergisi:</span><span>-{fmt(ihbarGelirV)} TL</span></div>
                  <div className="flex justify-between text-red-400"><span>Damga Vergisi:</span><span>-{fmt(ihbarDamga)} TL</span></div>
                  <div className="flex justify-between text-red-400"><span>SGK Kesintisi:</span><span>-{fmt(ihbarSgk)} TL</span></div>
                  <div className="flex justify-between text-green-400 font-semibold"><span>Net Ihbar:</span><span>{fmt(ihbarNet)} TL</span></div>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-2">
              <span className="text-white font-bold text-lg">Toplam Net:</span>
              <span className="text-yellow-400 font-bold text-xl">{fmt(toplamNet)} TL</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={printPDF} disabled={!selectedEmp} className="flex-1 bg-gradient-to-r from-green-600 to-green-500 text-white py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50">
              <Printer className="w-4 h-4" /> PDF Olustur
            </button>
            <button onClick={temizle} className="px-4 py-2.5 bg-blue-900/30 border border-blue-700/50 text-gray-300 rounded-lg hover:bg-blue-800/30 flex items-center gap-2">
              <RotateCcw className="w-4 h-4" /> Temizle
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
