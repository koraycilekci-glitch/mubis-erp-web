import { useState, useEffect } from 'react'
import { Calculator, Briefcase, Receipt, Shield, FileText, Save, Trash2, Edit3, FileDown, RotateCcw } from 'lucide-react'
import { useParameters } from '../hooks/useParameters'
import { useClients } from '../hooks/useClients'
import { clientDisplayName, sortClients } from '../utils/clientDisplay'
import * as D from '../data/defaults'
import { jsPDF } from 'jspdf'
import { formatTurkishInput, parseTurkishNumber, hamTutarGirdisi } from '../utils/numberFormat'
import { formatDateTR } from '../utils/dateUtils'
import { createUnicodePdf } from '../utils/unicodePdf'
import { getGuncelParametreler, kidemTavaniGuncel, asgariUcretBrutGuncel } from '../services/parametreService'
import VerasetIntikalBeyan from './VerasetIntikalBeyan'

// ========== ORTAK KOMPONENTLER ==========

function Card({ title, children, className = '' }) {
  return (
    <div className={`bg-blue-900/20 rounded-xl border border-blue-700/30 p-5 ${className}`}>
      {title && <h3 className="text-white font-semibold mb-4">{title}</h3>}
      {children}
    </div>
  )
}

function Input({ label, value, onChange, type = 'number', placeholder = '', suffix = '', disabled = false, className = '' }) {
  const amountInput = type === 'number'
  // Para alanlarinda YAZARKEN ham deger tutulur (imlec kurusa kaymasin);
  // bicimleme sadece alandan cikinca (onBlur) yapilir.
  return (
    <div className={className}>
      <label className="text-gray-400 text-xs block mb-1">{label}</label>
      <div className="relative">
        <input
          type={amountInput ? 'text' : type}
          inputMode={amountInput ? 'decimal' : undefined}
          value={value}
          onChange={e => onChange(amountInput ? hamTutarGirdisi(e.target.value) : e.target.value)}
          onBlur={amountInput ? e => {
            const h = hamTutarGirdisi(e.target.value)
            if (!h || h === ',' || h === '.') { onChange(''); return }
            onChange(formatTurkishInput(h))
          } : undefined}
          disabled={disabled}
          className={`w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-500 ${disabled ? 'opacity-60' : ''}`}
          placeholder={placeholder} />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">{suffix}</span>}
      </div>
    </div>
  )
}

function TextArea({ label, value, onChange, rows = 2 }) {
  return (
    <div>
      <label className="text-gray-400 text-xs block mb-1">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows}
        className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-500 resize-none" />
    </div>
  )
}

function Result({ label, value, highlight = false, negative = false }) {
  return (
    <div className={`flex justify-between py-1.5 ${highlight ? 'border-t border-yellow-500/30 mt-1 pt-2' : ''}`}>
      <span className={`text-sm ${highlight ? 'text-yellow-400 font-semibold' : 'text-gray-400'}`}>{label}</span>
      <span className={`text-sm font-mono ${highlight ? 'text-yellow-400 font-bold' : negative ? 'text-red-400' : 'text-white'}`}>{value}</span>
    </div>
  )
}

function Select({ label, value, onChange, options, className = '' }) {
  return (
    <div className={className}>
      <label className="text-gray-400 text-xs block mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-500">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function Checkbox({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-blue-700 bg-blue-900/30 text-yellow-500 focus:ring-yellow-500 cursor-pointer" />
      <span className="text-gray-300 text-sm">{label}</span>
    </label>
  )
}

function BtnGold({ children, onClick, disabled, className = '' }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`bg-gradient-to-r from-yellow-500 to-yellow-600 text-gray-900 px-4 py-2 rounded-lg text-sm font-semibold hover:shadow-lg disabled:opacity-50 flex items-center gap-2 ${className}`}>
      {children}
    </button>
  )
}

function BtnOutline({ children, onClick, className = '' }) {
  return (
    <button onClick={onClick}
      className={`border border-blue-600 text-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-blue-800/30 flex items-center gap-2 ${className}`}>
      {children}
    </button>
  )
}

// ========== 1. IHBAR / KIDEM TAZMINATI ==========

function IhbarKidem() {
  const params = useParameters()
  const { clients } = useClients()
  
  // Sigortali
  const [adSoyad, setAdSoyad] = useState('')
  const [tc, setTc] = useState('')
  const [adres, setAdres] = useState('')
  const [giris, setGiris] = useState('')
  const [cikis, setCikis] = useState('')
  const [cikisSebebi, setCikisSebebi] = useState('isveren')
  const [emekliKagit, setEmekliKagit] = useState(false)
  const [iban, setIban] = useState('')
  const [odemeTarihi, setOdemeTarihi] = useState('')
  const [odemeYontemi, setOdemeYontemi] = useState('banka')
  
  // Isveren
  const [isverenKaynak, setIsverenKaynak] = useState('elle')
  const [selectedClient, setSelectedClient] = useState('')
  const [isverenAd, setIsverenAd] = useState('')
  const [isverenAdres, setIsverenAdres] = useState('')
  const [sgkIsyeriNo, setSgkIsyeriNo] = useState('')
  
  // Ucret
  const [ucretTip, setUcretTip] = useState('brut')
  const [ucretTutar, setUcretTutar] = useState('')
  const [ekOdeme, setEkOdeme] = useState('')
  const [kullanilmayanIzin, setKullanilmayanIzin] = useState('')
  const [kidemChecked, setKidemChecked] = useState(true)
  const [ihbarChecked, setIhbarChecked] = useState(false)
  
  // Kayit
  const [savedId, setSavedId] = useState(null)
  const [msg, setMsg] = useState('')
  const [webParams, setWebParams] = useState(null)

  // Güncel yasal parametreler (kıdem tavanı, asgari ücret) web'den alınır.
  useEffect(() => {
    let active = true
    getGuncelParametreler().then((p) => { if (active && p) setWebParams(p) })
    return () => { active = false }
  }, [])

  // Musteri secince isveren bilgilerini doldur
  useEffect(() => {
    if (selectedClient && isverenKaynak === 'musteri') {
      const c = clients.find(cl => String(cl.id) === selectedClient)
      if (c) {
        setIsverenAd(c.type === 'company' ? (c.company || c.name) : c.name)
        setIsverenAdres(c.address || '')
        setSgkIsyeriNo(c.sgkIsyeriNo || c.sgk_isyeri_no || '')
      }
    }
  }, [selectedClient, clients, isverenKaynak])

  // Cikis sebebine gore kutucuklar
  useEffect(() => {
    switch (cikisSebebi) {
      case 'istifa':
        setKidemChecked(emekliKagit)
        setIhbarChecked(false)
        break
      case 'emeklilik':
        setKidemChecked(true)
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
      case 'diger':
        setIhbarChecked(false)
        break
    }
  }, [cikisSebebi, emekliKagit])

  // Brut ucret hesapla
  const yil = cikis ? new Date(cikis).getFullYear() : new Date().getFullYear()
  let brutUcret = 0
  if (ucretTip === 'asgari') {
    brutUcret = asgariUcretBrutGuncel(webParams, yil)
  } else if (ucretTip === 'brut') {
    brutUcret = parseTurkishNumber(ucretTutar)
  } else if (ucretTip === 'net') {
    brutUcret = D.nettenBrute(parseTurkishNumber(ucretTutar), yil)
  }
  const ekOdemeTutar = parseTurkishNumber(ekOdeme)
  const kullanilmayanIzinGun = parseTurkishNumber(kullanilmayanIzin)
  const izinUcretiBrut = (brutUcret / 30) * kullanilmayanIzinGun
  const toplamBrut = brutUcret + ekOdemeTutar

  // Hesaplamalar
  const ihbarSuresi = giris && cikis ? D.getIhbarSuresi(giris, cikis) : null
  const calisma = D.getCalismaSuresi(giris, cikis)
  const calismaSuresi = calisma.toplamYil
  const kidemTavani = kidemTavaniGuncel(webParams, cikis || new Date())

  // Kidem
  const gunlukBrut = Math.min(toplamBrut / 30, kidemTavani / 30)
    // Kural: istifada kadem tazminati yalniz "yastan emeklilik icin SGK'dan
    // yazi alindi" kutusu isaretliyse dogar; emeklilikte (yas disi) VARSAYILAN
    // hesaplanir — onay kutusunun durumu kullanici karari (istek: emeklilikte
    // kutu varsayilan secili gelsin).
    const kidemEligible = cikisSebebi === 'istifa'
      ? emekliKagit
      : true
    const kidemBrut = kidemChecked && kidemEligible && calismaSuresi >= 1 ? calisma.kidemGunu * gunlukBrut : 0
  const kidemDamga = kidemBrut * D.DAMGA_VERGISI
  const kidemNet = kidemBrut - kidemDamga

  // Ihbar
  const ihbarGun = ihbarSuresi?.gun || 0
  const ihbarBrut = ihbarChecked ? (toplamBrut / 30) * ihbarGun : 0
  const ihbarGelirV = ihbarBrut * 0.15  // gelir vergisi
  const ihbarDamga = ihbarBrut * D.DAMGA_VERGISI
  const ihbarNet = ihbarBrut - ihbarGelirV - ihbarDamga
  const izinGelirV = izinUcretiBrut * 0.15
  const izinDamga = izinUcretiBrut * D.DAMGA_VERGISI
  const izinNet = izinUcretiBrut - izinGelirV - izinDamga
  const toplamNet = kidemNet + ihbarNet + izinNet

  const temizle = () => {
    setAdSoyad(''); setTc(''); setAdres(''); setGiris(''); setCikis('')
    setCikisSebebi('isveren'); setEmekliKagit(false)
    setIsverenKaynak('elle'); setSelectedClient(''); setIsverenAd(''); setIsverenAdres(''); setSgkIsyeriNo('')
    setUcretTip('brut'); setUcretTutar(''); setEkOdeme(''); setKullanilmayanIzin('')
    setKidemChecked(true); setIhbarChecked(true); setSavedId(null); setMsg('')
  }

  const kaydet = async () => {
    const data = {
      adSoyad, tc, adres, giris, cikis, cikisSebebi, emekliKagit,
      isverenAd, isverenAdres, sgkIsyeriNo,
      ucretTip, ucretTutar, ekOdeme, kullanilmayanIzin, brutUcret, toplamBrut,
      kidemChecked, ihbarChecked,
      kidemBrut, kidemDamga, kidemNet,
      ihbarBrut, ihbarGelirV, ihbarDamga, ihbarNet,
      izinUcretiBrut, izinGelirV, izinDamga, izinNet, toplamNet
    }
    if (savedId) {
      await params.updateCalculation(savedId, data)
      setMsg('Kayit guncellendi!')
    } else {
      const result = await params.saveCalculation('ihbar_kidem', data)
      if (result) { setSavedId(result.id); setMsg('Kaydedildi!') }
    }
    setTimeout(() => setMsg(''), 3000)
  }

  const sil = async () => {
    if (savedId && confirm('Bu kaydi silmek istediginize emin misiniz?')) {
      await params.deleteCalculation(savedId)
      temizle()
    }
  }

  const ibranameOlustur = () => {
    const doc = createUnicodePdf()
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
    let y = 0

    const addPageHeader = (continuation = false) => {
      doc.setFillColor(colors.navy)
      doc.rect(14, 12, 182, continuation ? 18 : 34, 'F')
      doc.setFillColor(colors.gold)
      doc.rect(14, continuation ? 30 : 46, 182, 2, 'F')
      doc.setTextColor('#ffffff')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(continuation ? 13 : 19)
      doc.text(continuation ? 'İŞÇİ İBRANAMESİ · DEVAM' : 'İŞÇİ İBRANAMESİ', 105, continuation ? 24 : 27, { align: 'center' })
      if (!continuation) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9.5)
        doc.text('6098 Sayılı Türk Borçlar Kanunu ve 4857 Sayılı İş Kanunu', 105, 37, { align: 'center' })
        y = 58
      } else {
        y = 44
      }
      doc.setTextColor(colors.ink)
    }

    const ensureSpace = (height) => {
      if (y + height <= 276) return
      doc.addPage()
      addPageHeader(true)
    }

    const addSection = (title) => {
      ensureSpace(17)
      doc.setFillColor(colors.navyDark)
      doc.rect(14, y - 5, 182, 10, 'F')
      doc.setFillColor(colors.gold)
      doc.rect(14, y + 5, 182, 1.5, 'F')
      doc.setTextColor('#ffffff')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10.5)
      doc.text(pdfText(title), 19, y + 1.5)
      doc.setTextColor(colors.ink)
      y += 16
    }

    const addInfoRow = (label, value, highlighted = false) => {
      ensureSpace(10)
      doc.setFillColor(highlighted ? '#e9f4ef' : colors.pale)
      doc.setDrawColor(colors.border)
      doc.rect(14, y - 5, 182, 9, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(colors.muted)
      doc.text(pdfText(label), 19, y + 1)
      doc.setFont('helvetica', highlighted ? 'bold' : 'normal')
      doc.setTextColor(highlighted ? colors.success : colors.ink)
      doc.text(pdfText(value), 191, y + 1, { align: 'right' })
      doc.setTextColor(colors.ink)
      y += 10
    }

    const addParagraph = (text, size = 9.6, gap = 4.8) => {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(size)
      const wrapped = doc.splitTextToSize(pdfText(text), 174)
      ensureSpace((wrapped.length * gap) + 4)
      doc.text(wrapped, 18, y)
      y += wrapped.length * gap + 4
    }

    const addAmountRow = (label, value, highlighted = false) => {
      ensureSpace(10)
      doc.setFillColor(highlighted ? '#e9f4ef' : '#fbfcfd')
      doc.setDrawColor(colors.border)
      doc.rect(14, y - 5, 182, 9, 'FD')
      doc.setFont('helvetica', highlighted ? 'bold' : 'normal')
      doc.setFontSize(highlighted ? 10 : 9.2)
      doc.setTextColor(highlighted ? colors.success : colors.ink)
      doc.text(pdfText(label), 19, y + 1)
      doc.text(pdfText(value), 191, y + 1, { align: 'right' })
      doc.setTextColor(colors.ink)
      y += 10
    }

    addPageHeader()
    addSection('İŞÇİ BİLGİLERİ')
    addInfoRow('Adı soyadı', adSoyad || '-')
    addInfoRow('T.C. kimlik no', tc || '-')
    addInfoRow('İşe giriş tarihi', formatDateTR(giris))
    addInfoRow('İşten ayrılış tarihi', formatDateTR(cikis))
    addSection('İŞVEREN BİLGİLERİ')
    addInfoRow('Unvanı', isverenAd || '-')
    addInfoRow('Adresi', isverenAdres || '-')
    addSection('İBRA BEYANI')
    addParagraph("Yukarıda bilgileri yer alan işyerinde çalıştığım süre boyunca hak etmiş olduğum ücret alacaklarımı, fazla çalışma ücretlerimi, hafta tatili ücretlerimi, ulusal bayram ve genel tatil ücretlerimi, kullanılmayan yıllık izin ücretlerimi, ihbar tazminatımı, kıdem tazminatımı ve iş sözleşmesinden kaynaklanan diğer tüm yasal hak ve alacaklarımı eksiksiz olarak banka aracılığıyla aldığımı kabul ve beyan ederim. İşbu ibranamenin kendi özgür irademle düzenlendiğini, herhangi bir baskı altında kalmadan imzaladığımı, işverene karşı maddi veya manevi herhangi bir talebimin bulunmadığını beyan ederim. Bu ibraname, 6098 sayılı Türk Borçlar Kanunu'nun 420. maddesi hükümlerine uygun olarak düzenlenmiştir.")

    doc.addPage()
    addPageHeader(true)
    addSection('ÖDENEN TUTARLAR')
    addAmountRow('Alacak türü', 'Tutar (TL)', true)
    addAmountRow('Fazla çalışma ücreti', `${D.fmt(ekOdemeTutar)} TL`)
    addAmountRow('Yıllık izin ücreti (brüt)', `${D.fmt(izinUcretiBrut)} TL`)
    addAmountRow('İzin gelir vergisi', `-${D.fmt(izinGelirV)} TL`)
    addAmountRow('İzin damga vergisi', `-${D.fmt(izinDamga)} TL`)
    addAmountRow('Yıllık izin ücreti (net)', `${D.fmt(izinNet)} TL`)
    addAmountRow('İhbar tazminatı', `${D.fmt(ihbarNet)} TL`)
    addAmountRow('Kıdem tazminatı', `${D.fmt(kidemNet)} TL`)
    if (kullanilmayanIzinGun > 0) addAmountRow('Kullanılmayan izin günü', `${D.fmt(kullanilmayanIzinGun)} gün`)
    addAmountRow('TOPLAM NET ÖDEME', `${D.fmt(toplamNet)} TL`, true)
    addSection('ÖDEME VE İMZA')
    addInfoRow('Düzenleme tarihi', formatDateTR(odemeTarihi || new Date()))
    addInfoRow('Ödeme tarihi', odemeTarihi ? formatDateTR(odemeTarihi) : 'Ödeme sırasında doldurulacaktır')
    addInfoRow('Ödeme yöntemi', odemeYontemi === 'banka' ? 'Banka' : 'Diğer')
    addInfoRow('IBAN', iban || 'Ödeme sırasında yazılacaktır')
    addParagraph('Önemli not: Türk Borçlar Kanunu’nun 420. maddesine göre ibranamenin geçerli olabilmesi için iş sözleşmesinin sona ermesinden itibaren en az 1 ay geçmiş olması ve ödemenin banka aracılığıyla yapılmış olması gerekir.', 8.7, 4.2)
    ensureSpace(35)
    doc.setFillColor('#f8fafc')
    doc.setDrawColor(colors.border)
    doc.rect(14, y - 5, 182, 29, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(colors.navy)
    doc.text('PERSONEL BEYANI VE İMZA', 19, y + 2)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(colors.ink)
    doc.text(pdfText(`Personel: ${adSoyad || '-'}`), 19, y + 11)
    doc.text(pdfText(`T.C.: ${tc || '-'}`), 19, y + 18)
    doc.text('İmza: ______________________________', 125, y + 18)
    doc.save(`ibraname_${(adSoyad || 'belge').replace(/\s/g, '_')}.pdf`)
  }

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        {/* SOL: Giris */}
        <div className="space-y-4">
          <Card title="Sigortali Bilgileri">
            <div className="space-y-3">
              <Input label="Ad Soyad" value={adSoyad} onChange={setAdSoyad} type="text" />
              <Input label="TC Kimlik No" value={tc} onChange={setTc} type="text" placeholder="11 haneli" />
              <TextArea label="Ikamet Adresi" value={adres} onChange={setAdres} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Ise Giris Tarihi" value={giris} onChange={setGiris} type="date" />
                <Input label="Isten Cikis Tarihi" value={cikis} onChange={setCikis} type="date" />
              </div>
              <Select label="Isten Cikis Sebebi" value={cikisSebebi} onChange={setCikisSebebi} options={[
                { value: 'isveren', label: 'Isveren Tarafindan' },
                { value: 'istifa', label: 'Istifa' },
                 { value: 'emeklilik', label: 'Emeklilik (yas disi sartlar)' },
                { value: 'askerlik', label: 'Askerlik' },
                { value: 'evlilik', label: 'Evlilik' },
                { value: 'diger', label: 'Diger' }
              ]} />
              {(cikisSebebi === 'istifa' || cikisSebebi === 'emeklilik') && (
                <Checkbox label="Yastan emeklilik icin SGK'dan yazi alindi" checked={emekliKagit} onChange={setEmekliKagit} />
              )}
            </div>
          </Card>

          <Card title="Isveren Bilgileri">
            <div className="space-y-3">
              <Select label="Bilgi Kaynagi" value={isverenKaynak} onChange={setIsverenKaynak} options={[
                { value: 'elle', label: 'Elle Gir' },
                { value: 'musteri', label: 'Musteri Kartindan Sec' }
              ]} />
              {isverenKaynak === 'musteri' && (
                <Select label="Musteri Sec" value={selectedClient} onChange={setSelectedClient}
                  options={[{ value: '', label: '-- Secin --' }, ...sortClients(clients).map(c => ({ value: String(c.id), label: clientDisplayName(c) }))]} />
              )}
              <Input label="Isveren Adi / Unvani" value={isverenAd} onChange={setIsverenAd} type="text" disabled={isverenKaynak === 'musteri' && !!selectedClient} />
              <TextArea label="Isveren Adresi" value={isverenAdres} onChange={setIsverenAdres} />
              <Input label="SGK Isyeri No" value={sgkIsyeriNo} onChange={setSgkIsyeriNo} type="text" />
            </div>
          </Card>

          <Card title="Ucret Bilgileri">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Select label="Ucret Tipi" value={ucretTip} onChange={(v) => {
                  setUcretTip(v)
                  if (v === 'asgari') {
                    setUcretTutar(String(asgariUcretBrutGuncel(webParams, yil)))
                  }
                }} options={[
                  { value: 'asgari', label: 'Asgari Ucret' },
                  { value: 'brut', label: 'Brut Ucret' },
                  { value: 'net', label: 'Net Ucret' }
                ]} />
                <Input label={ucretTip === 'net' ? 'Net Ucret' : 'Brut Ucret'} value={ucretTutar} onChange={setUcretTutar} suffix="TL"
                  disabled={ucretTip === 'asgari'} />
              </div>
              {ucretTip === 'net' && brutUcret > 0 && (
                <p className="text-yellow-400/70 text-xs">Hesaplanan Brut: {D.fmt(brutUcret)} TL</p>
              )}
              <Input
                label="Kullanılmayan İzinler"
                value={kullanilmayanIzin}
                onChange={setKullanilmayanIzin}
                suffix="gün"
                placeholder="0"
              />
              <Input label="Ek Odemeler (varsa)" value={ekOdeme} onChange={setEkOdeme} suffix="TL" placeholder="0" />
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2.5">
                <span className="text-yellow-400 text-sm font-semibold">Toplam Brut: {D.fmt(toplamBrut)} TL</span>
              </div>
              <div className="flex gap-4">
                <Checkbox label="Kidem Tazminati" checked={kidemChecked} onChange={setKidemChecked} />
                <Checkbox label="Ihbar Tazminati" checked={ihbarChecked} onChange={setIhbarChecked} />
              </div>
            </div>
          </Card>
        </div>

        {/* SAG: Sonuc */}
        <div className="space-y-4">
          <Card title="Hesaplama Sonucu">
            {toplamBrut > 0 && giris && cikis ? (
              <div className="space-y-1">
                <Result label="Calisma Suresi" value={`${calisma.yil} yil ${calisma.ay} ay ${calisma.gun} gun`} />
                <Result label="Cikis Sebebi" value={cikisSebebi.toUpperCase()} />
                {kidemChecked && calismaSuresi > 0 && calismaSuresi < 1 && (
                  <p className="text-red-400 text-xs">Calisma suresi 1 yildan az: kidem tazminati hakki dogmaz.</p>
                )}

                {kidemChecked && (
                  <>
                    <div className="my-2 border-t border-blue-700/30" />
                    <p className="text-yellow-400/70 text-xs font-semibold">KIDEM TAZMINATI</p>
                    <Result label="Kidem Tavani" value={`${D.fmt(kidemTavani)} TL`} />
                    <Result label="Brut Kidem" value={`${D.fmt(kidemBrut)} TL`} />
                    <Result label="Damga Vergisi" value={`-${D.fmt(kidemDamga)} TL`} negative />
                    <Result label="Net Kidem Tazminati" value={`${D.fmt(kidemNet)} TL`} highlight />
                  </>
                )}

                {ihbarChecked && (
                  <>
                    <div className="my-2 border-t border-blue-700/30" />
                    <p className="text-yellow-400/70 text-xs font-semibold">IHBAR TAZMINATI</p>
                    <Result label="Ihbar Suresi" value={`${ihbarSuresi?.hafta || 0} hafta (${ihbarGun} gun)`} />
                    <Result label="Brut Ihbar" value={`${D.fmt(ihbarBrut)} TL`} />
                    <Result label="Gelir Vergisi" value={`-${D.fmt(ihbarGelirV)} TL`} negative />
                    <Result label="Damga Vergisi" value={`-${D.fmt(ihbarDamga)} TL`} negative />
                    <Result label="Net Ihbar Tazminati" value={`${D.fmt(ihbarNet)} TL`} highlight />
                  </>
                )}

                {kullanilmayanIzinGun > 0 && (
                  <>
                    <div className="my-2 border-t border-blue-700/30" />
                    <p className="text-yellow-400/70 text-xs font-semibold">KULLANILMAYAN İZİNLER</p>
                    <Result label="İzin Günü" value={`${D.fmt(kullanilmayanIzinGun)} gün`} />
                    <Result label="Brüt İzin Ücreti" value={`${D.fmt(izinUcretiBrut)} TL`} />
                    <Result label="Gelir Vergisi" value={`-${D.fmt(izinGelirV)} TL`} negative />
                    <Result label="Damga Vergisi" value={`-${D.fmt(izinDamga)} TL`} negative />
                    <Result label="Net İzin Ücreti" value={`${D.fmt(izinNet)} TL`} highlight />
                  </>
                )}

                <div className="my-3 border-t-2 border-yellow-500/50" />
                <Result label="TOPLAM NET TAZMINAT" value={`${D.fmt(toplamNet)} TL`} highlight />
              </div>
            ) : <p className="text-gray-500 text-sm">Bilgileri girerek hesaplama yapin</p>}
          </Card>

          {/* Butonlar */}
          <div className="flex flex-wrap gap-2">
            <BtnGold onClick={kaydet}><Save className="w-4 h-4" /> Kaydet</BtnGold>
            <BtnOutline onClick={temizle}><RotateCcw className="w-4 h-4" /> Temizle</BtnOutline>
            {savedId && (
              <>
                <BtnOutline onClick={sil}><Trash2 className="w-4 h-4" /> Sil</BtnOutline>
                <BtnGold onClick={ibranameOlustur} className="!from-blue-500 !to-blue-700 !text-white">
                  <FileDown className="w-4 h-4" /> Ibraname PDF
                </BtnGold>
              </>
            )}
          </div>
          {msg && <p className="text-green-400 text-sm">{msg}</p>}
        </div>
      </div>
    </div>
  )
}

// ========== 2. UCRETLI IZIN ==========

function IzinHesap() {
  const [giris, setGiris] = useState('')
  const [dogum, setDogum] = useState('')
  const [kullanilanGun, setKullanilanGun] = useState('0')
  const [brut, setBrut] = useState('')

  const bugun = new Date()
  const girisDate = giris ? new Date(giris) : null
  const dogumDate = dogum ? new Date(dogum) : null
  const yil = girisDate ? (bugun - girisDate) / (365.25 * 24 * 60 * 60 * 1000) : 0
  
  // Yas hesapla (18 alti veya 50 ustu kontrolu)
  const yas = dogumDate ? (bugun - dogumDate) / (365.25 * 24 * 60 * 60 * 1000) : 30
  const ozelDurum = yas < 18 || yas >= 50

  let hakEdilen = 0
  if (yil >= 1) {
    // Is Kanunu Md.53: 5 yil DAHIL 14 gun, 5 yildan fazla-15'ten az 20 gun, 15 yil DAHIL ve fazlasi 26 gun.
    if (yil <= 5) hakEdilen = 14
    else if (yil < 15) hakEdilen = 20
    else hakEdilen = 26
    // 18 yas alti ve 50 yas ustu en az 20 gun (Is Kanunu Md.53)
    if (ozelDurum && hakEdilen < 20) hakEdilen = 20
  }

  const kalan = Math.max(0, hakEdilen - parseTurkishNumber(kullanilanGun))
  const gunlukUcret = parseTurkishNumber(brut) / 30
  const izinUcreti = kalan * gunlukUcret

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="Ucretli Izin Hesaplama">
        <div className="space-y-3">
          <Input label="Ise Giris Tarihi" value={giris} onChange={setGiris} type="date" />
          <Input label="Dogum Tarihi" value={dogum} onChange={setDogum} type="date" />
          <Input label="Kullanilan Izin Gunu" value={kullanilanGun} onChange={setKullanilanGun} />
          <Input label="Brut Ucret" value={brut} onChange={setBrut} suffix="TL" />
        </div>
      </Card>
      <Card title="Sonuc">
        {yil >= 1 ? (
          <div className="space-y-1">
            <Result label="Calisma Suresi" value={`${yil.toFixed(1)} yil`} />
            <Result label="Yas" value={`${yas.toFixed(0)}`} />
            {ozelDurum && <p className="text-yellow-400 text-xs">Is Kanunu Md.53: 18 yas alti ve 50 yas ustu en az 20 gun izin hakki</p>}
            <Result label="Yillik Izin Hakki" value={`${hakEdilen} gun`} />
            <Result label="Kullanilan" value={`${kullanilanGun} gun`} />
            <Result label="Kalan Izin" value={`${kalan} gun`} highlight />
            {parseTurkishNumber(brut) > 0 && <Result label="Izin Ucreti" value={`${D.fmt(izinUcreti)} TL`} highlight />}
            <div className="mt-3 text-[10px] text-gray-500 space-y-0.5">
              {D.IZIN_GUNLERI.map((i, idx) => (
                <div key={idx}>{i.aciklama}: {i.gun} gun</div>
              ))}
            </div>
          </div>
        ) : <p className="text-gray-500 text-sm">{giris ? '1 yildan az kidem - izin hakki yok' : 'Bilgileri girin'}</p>}
      </Card>
    </div>
  )
}

// ========== 3. GELIR / KURUMLAR VERGISI ==========

function GelirKurumlarVergisi() {
  const [matrah, setMatrah] = useState('')
  const [yil, setYil] = useState(String(new Date().getFullYear()))
  const [tip, setTip] = useState('ucret_disi')
  const [karsilastir, setKarsilastir] = useState(false)
  
  const m = parseTurkishNumber(matrah)
  const y = Number(yil)
  const gv = D.hesaplaGV(m, y, tip)
  const kv = m * (D.KV_ORANLARI[y] || 0.25)
  const gvOran = m > 0 ? (gv / m * 100).toFixed(2) : 0
  const kvOran = m > 0 ? (kv / m * 100).toFixed(2) : 0

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Gelir / Kurumlar Vergisi">
          <div className="space-y-3">
            <Select label="Yil" value={yil} onChange={setYil} options={D.YILLAR.map(y => ({ value: String(y), label: String(y) }))} />
            <Select label="Gelir Turu" value={tip} onChange={setTip} options={[
              { value: 'ucret', label: 'Ucret Geliri' },
              { value: 'ucret_disi', label: 'Ucret Disi Gelir' }
            ]} />
            <Input label="Vergi Matrahi" value={matrah} onChange={setMatrah} suffix="TL" />
            <BtnOutline onClick={() => setKarsilastir(!karsilastir)}>
              {karsilastir ? 'Karsilastirmayi Kapat' : 'GV / KV Karsilastir'}
            </BtnOutline>
          </div>
        </Card>
        <Card title="Sonuc">
          {m > 0 ? (
            <div className="space-y-1">
              <Result label="Matrah" value={`${D.fmt(m)} TL`} />
              <Result label="Gelir Vergisi" value={`${D.fmt(gv)} TL`} highlight />
              <Result label="Efektif GV Orani" value={`%${gvOran}`} />
              <div className="mt-3 text-[10px] text-gray-500 space-y-0.5">
                {(D.GV_DILIMLERI[y] || D.GV_DILIMLERI[2025]).map((d, i) => (
                  <div key={i}>%{d.rate * 100} - {d.limit === Infinity ? 'ustu' : `${D.fmt(d.limit)} TL'ye kadar`}</div>
                ))}
              </div>
            </div>
          ) : <p className="text-gray-500 text-sm">Matrah girin</p>}
        </Card>
      </div>

      {karsilastir && m > 0 && (
        <Card title="GV / KV Karsilastirma">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-blue-400 text-sm font-semibold mb-2">Gelir Vergisi</p>
              <Result label="Vergi" value={`${D.fmt(gv)} TL`} />
              <Result label="Oran" value={`%${gvOran}`} />
            </div>
            <div>
              <p className="text-emerald-400 text-sm font-semibold mb-2">Kurumlar Vergisi</p>
              <Result label="Vergi" value={`${D.fmt(kv)} TL`} />
              <Result label="Oran" value={`%${kvOran}`} />
            </div>
          </div>
          <div className={`mt-4 p-3 rounded-lg text-sm font-medium ${gv < kv ? 'bg-blue-500/20 text-blue-300' : gv > kv ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-500/20 text-gray-300'}`}>
            {gv < kv 
              ? `Gelir Vergisi mukellefi olmaniz vergi acisindan ${D.fmt(kv - gv)} TL daha avantajli.`
              : gv > kv 
              ? `Kurumlar Vergisi mukellefi olmaniz vergi acisindan ${D.fmt(gv - kv)} TL daha avantajli.`
              : 'Her iki vergi turu de ayni tutari veriyor.'}
          </div>
        </Card>
      )}
    </div>
  )
}

// ========== 4. GMS IRADI ==========

function GMSIradi() {
  const params = useParameters()
  const [yil, setYil] = useState(String(new Date().getFullYear()))
  const [konutKira, setKonutKira] = useState('')
  const [isyeriKira, setIsyeriKira] = useState('')
  const [kiraTip, setKiraTip] = useState('brut')
  const [giderYontemi, setGiderYontemi] = useState('goturu')
  const [gercekGider, setGercekGider] = useState('')
  const [egitimGider, setEgitimGider] = useState('')
  const [saglikGider, setSaglikGider] = useState('')
  const [hayatSig, setHayatSig] = useState('')
  const [saglikSig, setSaglikSig] = useState('')

  const y = Number(yil)
  const istisna = params.getGmsIstisna(y)
  
  let yillikKonut = parseTurkishNumber(konutKira)
  let yillikIsyeri = parseTurkishNumber(isyeriKira)

  // Konut kirasi nettir; brut/net secimi SADECE isyeri kirasina uygulanir
  let stopajIsyeri = 0
  if (yillikIsyeri > 0) {
    if (kiraTip === 'net') {
      const brutIsyeri = yillikIsyeri / 0.80 // %20 stopaj
      stopajIsyeri = brutIsyeri * 0.20
      yillikIsyeri = brutIsyeri
    } else {
      stopajIsyeri = yillikIsyeri * 0.20 // kiraci tarafindan kesilen stopaj (mahsup)
    }
  }
  const toplamStopaj = stopajIsyeri

  const toplamKira = yillikKonut + yillikIsyeri
  const konutIstisna = yillikKonut > 0 ? Math.min(istisna, yillikKonut) : 0
  // Isyeri kirasi icin istisna yok
  const konutMatrah = Math.max(0, yillikKonut - konutIstisna)
  const toplamMatrah = konutMatrah + yillikIsyeri

  // Gider
  let gider = 0
  if (giderYontemi === 'goturu') {
    gider = toplamMatrah * 0.15
  } else {
    gider = parseTurkishNumber(gercekGider)
  }

  // Egitim-saglik (matrahin %10'unu gecemez)
  const egitimSaglik = Math.min(
    parseTurkishNumber(egitimGider) + parseTurkishNumber(saglikGider),
    toplamMatrah * 0.10
  )

  // Sigorta primleri (brut ucretin %15'ini gecemez - GMS icin matrah baz)
  const sigortaPrim = Math.min(
    parseTurkishNumber(hayatSig) + parseTurkishNumber(saglikSig),
    toplamMatrah * 0.15
  )

  const vergiMatrah = Math.max(0, toplamMatrah - gider - egitimSaglik - sigortaPrim)
  const vergi = D.hesaplaGV(vergiMatrah, y)
  const odenecek = Math.max(0, vergi - toplamStopaj)

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="GMS Iradi Vergisi">
        <div className="space-y-3">
          <Select label="Yil" value={yil} onChange={setYil} options={D.YILLAR.map(y => ({ value: String(y), label: String(y) }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Yillik Konut Kirasi" value={konutKira} onChange={setKonutKira} suffix="TL" />
            <Input label="Yillik Isyeri Kirasi" value={isyeriKira} onChange={setIsyeriKira} suffix="TL" />
          </div>
          <Select label="Kira Tipi (sadece Isyeri Kirasi icin)" value={kiraTip} onChange={setKiraTip} options={[
            { value: 'brut', label: 'Isyeri Brut Kira' },
            { value: 'net', label: 'Isyeri Net Kira (Stopaj Kesildikten Sonra)' }
          ]} />
          <p className="text-gray-500 text-[10px]">Konut kirasi her zaman net kabul edilir, bu secimden etkilenmez.</p>
          <Select label="Gider Yontemi" value={giderYontemi} onChange={setGiderYontemi} options={[
            { value: 'goturu', label: 'Goturu Gider (%15)' },
            { value: 'gercek', label: 'Gercek Gider' }
          ]} />
          {giderYontemi === 'gercek' && (
            <Input label="Gercek Gider Toplami" value={gercekGider} onChange={setGercekGider} suffix="TL" />
          )}
          <p className="text-gray-500 text-xs font-semibold mt-2">Egitim ve Saglik Giderleri</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Egitim Giderleri" value={egitimGider} onChange={setEgitimGider} suffix="TL" />
            <Input label="Saglik Giderleri" value={saglikGider} onChange={setSaglikGider} suffix="TL" />
          </div>
          <p className="text-gray-500 text-xs font-semibold mt-2">Sigorta Primleri</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Hayat Sig. Primi" value={hayatSig} onChange={setHayatSig} suffix="TL" />
            <Input label="Saglik/Sahis Sig." value={saglikSig} onChange={setSaglikSig} suffix="TL" />
          </div>
        </div>
      </Card>
      <Card title="Sonuc">
        {toplamKira > 0 ? (
          <div className="space-y-1">
            {yillikKonut > 0 && <Result label="Yillik Konut Kirasi" value={`${D.fmt(yillikKonut)} TL`} />}
            {yillikIsyeri > 0 && <Result label="Yillik Isyeri Kirasi" value={`${D.fmt(yillikIsyeri)} TL`} />}
            <Result label="Toplam Kira Geliri" value={`${D.fmt(toplamKira)} TL`} />
            {konutIstisna > 0 && <Result label={`Konut Istisna (${yil})`} value={`-${D.fmt(konutIstisna)} TL`} negative />}
            <Result label="Matrah" value={`${D.fmt(toplamMatrah)} TL`} />
            <Result label={giderYontemi === 'goturu' ? 'Goturu Gider (%15)' : 'Gercek Gider'} value={`-${D.fmt(gider)} TL`} negative />
            {egitimSaglik > 0 && <Result label="Egitim+Saglik Gideri" value={`-${D.fmt(egitimSaglik)} TL`} negative />}
            {sigortaPrim > 0 && <Result label="Sigorta Primleri" value={`-${D.fmt(sigortaPrim)} TL`} negative />}
            <Result label="Vergi Matrahi" value={`${D.fmt(vergiMatrah)} TL`} />
            <Result label="Hesaplanan Vergi" value={`${D.fmt(vergi)} TL`} />
            {toplamStopaj > 0 && <Result label="Kesilen Stopaj" value={`-${D.fmt(toplamStopaj)} TL`} negative />}
            <Result label="Odenecek Vergi" value={`${D.fmt(odenecek)} TL`} highlight />
          </div>
        ) : <p className="text-gray-500 text-sm">Kira geliri girin</p>}
      </Card>
    </div>
  )
}

// ========== 5. DEGER ARTIS KAZANCI ==========

function DegerArtisKazanci() {
  const params = useParameters()
  const [alisTarih, setAlisTarih] = useState('')
  const [satisTarih, setSatisTarih] = useState('')
  const [alisBedel, setAlisBedel] = useState('')
  const [satisBedel, setSatisBedel] = useState('')
  const [satisGider, setSatisGider] = useState('')
  const [alisYiufe, setAlisYiufe] = useState('')
  const [satisYiufe, setSatisYiufe] = useState('')
  const [istisna, setIstisna] = useState('')

  // Tarih girilince Yi-UFE ve istisna otomatik doldur
  useEffect(() => {
    if (alisTarih) {
      const d = new Date(alisTarih)
      const val = params.getYiUfe(d.getFullYear(), d.getMonth() + 1)
      if (val) setAlisYiufe(String(val))
    }
  }, [alisTarih])

  useEffect(() => {
    if (satisTarih) {
      const d = new Date(satisTarih)
      const val = params.getYiUfe(d.getFullYear(), d.getMonth() + 1)
      if (val) setSatisYiufe(String(val))
      const ist = params.getDakIstisna(d.getFullYear())
      if (ist) setIstisna(String(ist))
      if (d.getFullYear() >= 2026) {
        // 2026 icin henuz resmi tutar yayinlanmadi; kullanici bilgilendirilsin
        setIstisnaNotu('2026 yili istisna tutari henuz Resmi Gazete\'de yayinlanmamistir; son bilinen 2025 tutari (150.000 TL) kullanilmistir.')
      } else {
        setIstisnaNotu('')
      }
    }
  }, [satisTarih])

  const [istisnaNotu, setIstisnaNotu] = useState('')

  const alis = parseTurkishNumber(alisBedel)
  const satis = parseTurkishNumber(satisBedel)
  const gider = parseTurkishNumber(satisGider)
  const aYiufeRaw = parseTurkishNumber(alisYiufe)
  const sYiufeRaw = parseTurkishNumber(satisYiufe)

  // GVK md.39: 5 yildan fazla elde tutulan bina/arazi kazanci vergiye tabi degil
  const eldeTutmaYil = (alisTarih && satisTarih)
    ? (new Date(satisTarih) - new Date(alisTarih)) / (365.25 * 24 * 3600 * 1000)
    : null
  const besYilAsindi = eldeTutmaYil !== null && eldeTutmaYil > 5

  // Yi-UFE eksikse hesaplama YAPILMAZ (eski kod eksigi 1 alip maliyeti sifirliyordu)
  const yiufeEksik = satis > 0 && alis > 0 && (!aYiufeRaw || !sYiufeRaw)

  const aYiufe = aYiufeRaw || 1
  const sYiufe = sYiufeRaw || 1
  const ist = parseTurkishNumber(istisna)

  const endeksliMaliyet = alis * (sYiufe / aYiufe)
  const endeksliGider = gider // giderler de endekslenebilir ama basit tutalim
  const kazanc = besYilAsindi ? 0 : Math.max(0, satis - endeksliMaliyet - endeksliGider)
  const matrah = Math.max(0, kazanc - ist)
  const satisYil = satisTarih ? new Date(satisTarih).getFullYear() : new Date().getFullYear()
  const vergi = besYilAsindi ? 0 : D.hesaplaGV(matrah, satisYil)

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="Bina Deger Artis Kazanci">
        <div className="space-y-3">
          <p className="text-gray-400 text-xs">Alis ve satis tarihini girdiginizde Yi-UFE ve istisna otomatik doldurulur.</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Alis Tarihi" value={alisTarih} onChange={setAlisTarih} type="date" />
            <Input label="Satis Tarihi" value={satisTarih} onChange={setSatisTarih} type="date" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Alis Bedeli" value={alisBedel} onChange={setAlisBedel} suffix="TL" />
            <Input label="Satis Bedeli" value={satisBedel} onChange={setSatisBedel} suffix="TL" />
          </div>
          <Input label="Satis Gideri / Harc / Komisyon" value={satisGider} onChange={setSatisGider} suffix="TL" placeholder="0" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Alistan Onceki Ay Yi-UFE" value={alisYiufe} onChange={setAlisYiufe} />
            <Input label="Satistan Onceki Ay Yi-UFE" value={satisYiufe} onChange={setSatisYiufe} />
          </div>
          <Input label="Satis Yili Istisna Tutari" value={istisna} onChange={setIstisna} suffix="TL" />
        </div>
      </Card>
      <Card title="Sonuc">
        {satis > 0 && alis > 0 ? (
          <div className="space-y-1">
            {besYilAsindi && (
              <p className="text-emerald-400 text-xs mb-2">Bina {eldeTutmaYil.toFixed(1)} yil elde tutuldu — 5 yildan fazla oldugu icin deger artis kazanci vergiye tabi DEGIL (GVK md.39).</p>
            )}
            {yiufeEksik && (
              <p className="text-red-400 text-xs mb-2">Yi-UFE degeri bulunamadi (tarih cok yeni olabilir). Dogru hesap icin Yi-UFE alanlarini elle girin.</p>
            )}
            {istisnaNotu && (
              <p className="text-amber-300 text-xs mb-2">{istisnaNotu}</p>
            )}
            {!besYilAsindi && !yiufeEksik && (
              <>
                <Result label="Alis Bedeli" value={`${D.fmt(alis)} TL`} />
                <Result label="Yi-UFE Orani" value={`${(sYiufe / aYiufe).toFixed(4)}`} />
                <Result label="Endeksli Maliyet" value={`${D.fmt(endeksliMaliyet)} TL`} />
                {gider > 0 && <Result label="Satis Giderleri" value={`${D.fmt(gider)} TL`} />}
                <Result label="Satis Bedeli" value={`${D.fmt(satis)} TL`} />
                <Result label="Kazanc" value={`${D.fmt(kazanc)} TL`} />
                <Result label="Istisna Tutari" value={`-${D.fmt(ist)} TL`} negative />
                <Result label="Vergi Matrahi" value={`${D.fmt(matrah)} TL`} />
                <Result label="Odenecek Vergi" value={`${D.fmt(vergi)} TL`} highlight />
              </>
            )}
          </div>
        ) : <p className="text-gray-500 text-sm">Bilgileri girin</p>}
      </Card>
    </div>
  )
}

// ========== 6. KIRA ARTIS ==========

function KiraArtis() {
  const params = useParameters()
  const [mevcutKira, setMevcutKira] = useState('')
  const [tufeOran, setTufeOran] = useState('')
  const [oranBilgi, setOranBilgi] = useState('')

  const AY_ADLARI = ['Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran', 'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik']

  // Sayfa acilinca guncel kira artis oranini getir (once cevrimici TUIK, sonra yerel tablo)
  useEffect(() => {
    let cancelled = false
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth() + 1

    const yerelYukle = () => {
      const detay = params.getKiraArtisOraniDetay ? params.getKiraArtisOraniDetay(y, m) : null
      if (detay) {
        setTufeOran(String(detay.oran))
        setOranBilgi(`Yerel tablo: ${AY_ADLARI[detay.ay - 1]} ${detay.yil} donemi`)
      }
    }

    fetch('/api/tuik-kira')
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        if (data?.success && data.guncel?.oran) {
          const key = `${data.guncel.yil}-${String(data.guncel.ay).padStart(2, '0')}`
          const oran = data.oranlar?.[key] || data.guncel.oran
          setTufeOran(String(oran))
          setOranBilgi(`TUIK cevrimici veri: ${AY_ADLARI[data.guncel.ay - 1]} ${data.guncel.yil} donemi`)

          // Cevrimici tabloyu parametre veritabanina kaydet (bir kez, sonraki acilista cevrimdisi yedek olur)
          try {
            const flag = `tuik_sync_${key}`
            if (!sessionStorage.getItem(flag) && data.oranlar && params.saveParam) {
              sessionStorage.setItem(flag, '1')
              Object.entries(data.oranlar).forEach(([k, v]) => {
                const [yy, mm] = k.split('-').map(Number)
                params.saveParam('kira_artis', yy, mm, 'oran', v)
              })
            }
          } catch (e) { /* yoksay */ }
        } else {
          yerelYukle()
        }
      })
      .catch(() => { if (!cancelled) yerelYukle() })

    return () => { cancelled = true }
  }, [])

  const kira = parseTurkishNumber(mevcutKira)
  const oran = parseTurkishNumber(tufeOran)
  const yeniKira = kira * (1 + oran / 100)
  const artis = yeniKira - kira

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="Kira Artis Hesaplama">
        <div className="space-y-3">
          <p className="text-gray-400 text-xs">12 aylik TUFE ortalamasi otomatik getirilir. {oranBilgi && <span className="text-emerald-400">({oranBilgi})</span>}</p>
          <Input label="Mevcut Kira" value={mevcutKira} onChange={setMevcutKira} suffix="TL" />
          <Input label="TUFE Artis Orani (%)" value={tufeOran} onChange={setTufeOran} suffix="%" placeholder="Otomatik" />
        </div>
      </Card>
      <Card title="Sonuc">
        {kira > 0 && oran > 0 ? (
          <div className="space-y-1">
            <Result label="Mevcut Kira" value={`${D.fmt(kira)} TL`} />
            <Result label="Artis Orani" value={`%${oran}`} />
            <Result label="Artis Tutari" value={`${D.fmt(artis)} TL`} />
            <Result label="Yeni Kira" value={`${D.fmt(yeniKira)} TL`} highlight />
            <p className="text-gray-500 text-[10px] mt-2">TBK Md.344: Konut kiralarinda artis 12 aylik TUFE ortalamasini gecemez.</p>
          </div>
        ) : <p className="text-gray-500 text-sm">Kira tutari girin</p>}
      </Card>
    </div>
  )
}

// ========== 7. DAMGA VERGISI ==========

function DamgaVergisi() {
  const [tutar, setTutar] = useState('')
  const [yil, setYil] = useState(String(new Date().getFullYear()))
  const t = parseTurkishNumber(tutar)
  const oran = D.getDamgaVergisiOrani(Number(yil))
  const damga = t * oran

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="Kontrat Damga Vergisi">
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Yil</label>
            <select value={yil} onChange={(e) => setYil(e.target.value)}
              className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 px-4 text-white focus:outline-none focus:border-yellow-400">
              {[2020,2021,2022,2023,2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <Input label="Kontrat Tutari" value={tutar} onChange={setTutar} suffix="TL" />
          <div className="bg-blue-900/20 rounded-lg p-3">
            <p className="text-xs text-gray-400">Damga Vergisi Orani</p>
            <p className="text-yellow-400 font-semibold">%{(oran * 100).toFixed(3)} <span className="text-gray-500 text-xs">({yil} yili)</span></p>
          </div>
        </div>
      </Card>
      <Card title="Sonuc">
        {t > 0 ? (
          <div className="space-y-1">
            <Result label="Kontrat Tutari" value={`${D.fmt(t)} TL`} />
            <Result label={`Damga Vergisi (%${(oran * 100).toFixed(3)})`} value={`${D.fmt(damga)} TL`} highlight />
          </div>
        ) : <p className="text-gray-500 text-sm">Tutar girin</p>}
      </Card>
    </div>
  )
}

// ========== 8. BRUT/NET UCRET ==========

function BrutNetHesap() {
  const [tutar, setTutar] = useState('')
  const [yon, setYon] = useState('brut_net')
  const [yil, setYil] = useState('2026')
  
  const t = parseTurkishNumber(tutar)
  const y = Number(yil)
  
  let brut = t
  if (yon === 'net_brut' && t > 0) {
    brut = D.nettenBrute(t, y)
  }
  const sonuc = brut > 0 ? D.bruttenNete(brut, y) : null

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="Brut / Net Ucret Hesaplama">
        <div className="space-y-3">
          <Select label="Yil" value={yil} onChange={setYil} options={D.YILLAR.map(y => ({ value: String(y), label: String(y) }))} />
          <Select label="Hesaplama Yonu" value={yon} onChange={setYon} options={[
            { value: 'brut_net', label: 'Brutten Nete' },
            { value: 'net_brut', label: 'Netten Brute' }
          ]} />
          <Input label={yon === 'brut_net' ? 'Brut Ucret' : 'Net Ucret'} value={tutar} onChange={setTutar} suffix="TL" />
        </div>
      </Card>
      <Card title="Sonuc">
        {sonuc ? (
          <div className="space-y-1">
            <Result label="Brut Ucret" value={`${D.fmt(brut)} TL`} />
            <Result label="SGK Isci (%14)" value={`-${D.fmt(sonuc.sgkIsci)} TL`} negative />
            <Result label="Issizlik Isci (%1)" value={`-${D.fmt(sonuc.issizlikIsci)} TL`} negative />
            <Result label="GV Matrahi" value={`${D.fmt(sonuc.gvMatrah)} TL`} />
            <Result label="Hesaplanan Gelir Vergisi" value={`${D.fmt(sonuc.hamGv)} TL`} />
            {y >= 2025 && (
              <Result label="Asgari Ucret GV Istisnasi" value={`-${D.fmt(sonuc.gvIstisna)} TL`} />
            )}
            <Result label="Odenecek Gelir Vergisi" value={`-${D.fmt(sonuc.aylikGv)} TL`} negative />
            {y >= 2025 && (
              <Result label="Asgari Ucret Damga Istisnasi" value={`-${D.fmt(sonuc.damgaIstisna)} TL`} />
            )}
            <Result label="Odenecek Damga Vergisi" value={`-${D.fmt(sonuc.damga)} TL`} negative />
            <Result label="Net Ucret" value={`${D.fmt(sonuc.net)} TL`} highlight />
            <div className="my-2 border-t border-blue-700/30" />
            <Result label="SGK Isveren (%20.5)" value={`${D.fmt(sonuc.sgkIsveren)} TL`} />
            <Result label="Issizlik Isveren (%2)" value={`${D.fmt(sonuc.issizlikIsveren)} TL`} />
            <Result label="Isverene Toplam Maliyet" value={`${D.fmt(sonuc.toplamMaliyet)} TL`} highlight />
          </div>
        ) : <p className="text-gray-500 text-sm">Ucret girin</p>}
      </Card>
    </div>
  )
}

// ========== 9. EMEKLILIK ==========

function EmeklilikHesabi() {
  const [dogum, setDogum] = useState('')
  const [iseGiris, setIseGiris] = useState('')
  const [cinsiyet, setCinsiyet] = useState('erkek')
  const [tip, setTip] = useState('4a')
  const [primGun, setPrimGun] = useState('')

  const dogumDate = dogum ? new Date(dogum) : null
  const girisDate = iseGiris ? new Date(iseGiris) : null
  let yasLimit = cinsiyet === 'erkek' ? 60 : 58
  let primGunLimit = tip === '4a' ? 7200 : 9000
  const emeklilikYas = dogumDate ? new Date(dogumDate.getTime() + yasLimit * 365.25 * 24 * 60 * 60 * 1000) : null
  const mevcutPrim = parseTurkishNumber(primGun)
  const kalanPrim = Math.max(0, primGunLimit - mevcutPrim)

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="Emeklilik Hesabi">
        <div className="space-y-3">
          <Select label="Sigorta Turu" value={tip} onChange={setTip} options={[
            { value: '4a', label: '4/A (SSK - Isci)' },
            { value: '4b', label: '4/B (Bag-Kur)' }
          ]} />
          <Input label="Dogum Tarihi" value={dogum} onChange={setDogum} type="date" />
          <Input label="Ise Giris / Bag-Kur Baslangic" value={iseGiris} onChange={setIseGiris} type="date" />
          <Select label="Cinsiyet" value={cinsiyet} onChange={setCinsiyet} options={[
            { value: 'erkek', label: 'Erkek' },
            { value: 'kadin', label: 'Kadin' }
          ]} />
          <Input label="Mevcut Prim Gunu" value={primGun} onChange={setPrimGun} />
        </div>
      </Card>
      <Card title="Sonuc">
        {dogumDate && girisDate ? (
          <div className="space-y-1">
            <Result label="Yas Siniri" value={`${yasLimit} yas`} />
             <Result label="Emeklilik Yasi Tarihi" value={formatDateTR(emeklilikYas)} />
            <Result label="Gerekli Prim" value={`${primGunLimit} gun`} />
            <Result label="Mevcut Prim" value={`${mevcutPrim} gun`} />
            <Result label="Kalan Prim" value={`${kalanPrim} gun`} highlight />
            <p className="text-gray-500 text-[10px] mt-2">Yaklasik hesaptir. Kesin sonuc icin SGK'ya basvurun.</p>
          </div>
        ) : <p className="text-gray-500 text-sm">Bilgileri girin</p>}
      </Card>
    </div>
  )
}

// ========== 10. BORCLANMA ==========

function BorclanmaHesabi() {
  const yil = new Date().getFullYear()
  const sinirlar = D.getGunlukPekSinirlari(yil)
  const [tip, setTip] = useState('askerlik')
  const [gun, setGun] = useState('')
  const [pek, setPek] = useState('')

  // Varsayilan: gunluk asgari PEK
  useEffect(() => {
    setPek(String(sinirlar.asgari.toFixed(2)))
  }, [])

  // Tip degisince gun sayisi temizlenir (otomatik doldurma yok).
  // Dogum borclanmasi ust siniri: 2.160 gun (3 cocuk); limitler bilgi kutusunda.
  const maxGun = 2160
  useEffect(() => { setGun('') }, [tip])

  const g = parseTurkishNumber(gun)
  const p = parseTurkishNumber(pek)
  const borc = g * p * 0.32
  const borcAsgari = g * sinirlar.asgari * 0.32
  const borcTavan = g * sinirlar.tavan * 0.32

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="Borclanma (Askerlik/Cocuk)">
        <div className="space-y-3">
          <Select label="Borclanma Tipi" value={tip} onChange={setTip} options={[
            { value: 'askerlik', label: 'Askerlik Borclanmasi' },
            { value: 'cocuk', label: 'Dogum / Cocuk Borclanmasi' }
          ]} />
          <Input label={tip === 'cocuk' ? `Borclanma Gun Sayisi (en fazla ${maxGun})` : 'Borclanma Gun Sayisi'} value={gun} onChange={setGun} />
          <Input label="Gunluk Prime Esas Kazanc (PEK)" value={pek} onChange={setPek} suffix="TL" />
          <div className="bg-blue-900/20 rounded-lg p-3 text-xs space-y-1">
            <p className="text-gray-400">{yil} yili gunluk PEK sinirlari:</p>
            <p className="text-white">Asgari: <span className="text-yellow-400 font-semibold">{D.fmt(sinirlar.asgari)} TL</span> <span className="text-gray-500">(varsayilan)</span></p>
            <p className="text-white">Tavan: <span className="text-yellow-400 font-semibold">{D.fmt(sinirlar.tavan)} TL</span></p>
            <p className="text-gray-500">Borclanma tutari = Gun x PEK x %32</p>
          </div>
          {tip === 'cocuk' && (
            <div className="bg-blue-900/20 rounded-lg p-3 text-xs space-y-1.5">
              <p className="text-yellow-400 font-semibold">Dogum (Cocuk) Borclanmasi Gun Limitleri</p>
              <p className="text-white">1 Cocuk icin: en fazla 720 gun (2 yil)</p>
              <p className="text-white">2 Cocuk icin: en fazla 1.440 gun (4 yil)</p>
              <p className="text-white">3 Cocuk icin: en fazla 2.160 gun (6 yil)</p>
              <p className="text-yellow-400 font-semibold pt-1">Temel Sartlar</p>
              <p className="text-gray-300">- Dogumdan once adina en az 1 gun sigorta primi bildirilmis olmasi gerekir.</p>
              <p className="text-gray-300">- Dogum sonrasinda adina prim odenmemis veya bos gecen sureler borclanilabilir.</p>
              <p className="text-gray-300">- Cocugun sag dogmasi ve borclanilacak sure icinde hayatta olmasi sarttir.</p>
              <p className="text-gray-300">- Basvuru: e-Devlet Kapisi uzerinden "4A Dogum Borclanmasi Basvurusu" hizmetiyle veya dogrudan SGK birimlerine bildirilebilir.</p>
            </div>
          )}
        </div>
      </Card>
      <Card title="Sonuc">
        {g > 0 && p > 0 ? (
          <div className="space-y-1">
            <Result label="Borclanma Tipi" value={tip === 'cocuk' ? 'Dogum / Cocuk' : 'Askerlik'} />
            <Result label="Gun Sayisi" value={tip === 'cocuk' ? `${g} gun (limit ${maxGun})` : `${g} gun`} />
            <Result label="Gunluk PEK" value={`${D.fmt(p)} TL`} />
            <Result label="Borclanma Tutari (%32)" value={`${D.fmt(borc)} TL`} highlight />
            {tip === 'cocuk' && g > maxGun && (
              <p className="text-red-400 text-xs mt-1">Uyari: Dogum borclanmasinda en fazla 2.160 gun (3 cocuk) borclanilabilir.</p>
            )}
            <div className="my-1 border-t border-blue-700/30" />
            <Result label="Asgari PEK ile" value={`${D.fmt(borcAsgari)} TL`} />
            <Result label="Tavan PEK ile" value={`${D.fmt(borcTavan)} TL`} />
          </div>
        ) : <p className="text-gray-500 text-sm">Bilgileri girin</p>}
      </Card>
    </div>
  )
}

// ========== 11. SSK HISSE ==========

function SSKHisseHesabi() {
  const [brut, setBrut] = useState('')
  const [calTip, setCalTip] = useState('normal')
  const [yil, setYil] = useState(String(new Date().getFullYear()))
  const [indirim, setIndirim] = useState('2')
  // Secili yila ait brut asgari ucret (web'den, yoksa yerel tablo) —
  // Brut Ucret alaninda silik (placeholder) olarak gosterilir.
  const [webParams, setWebParams] = useState(null)
  useEffect(() => {
    let active = true
    getGuncelParametreler().then((p) => { if (active && p) setWebParams(p) })
    return () => { active = false }
  }, [])
  const y = Number(yil)
  const asgariBrut = asgariUcretBrutGuncel(webParams, y)
  const b = parseTurkishNumber(brut)
  const tavan = D.SGK.tavan[y] || D.SGK.tavan[2026]
  const sgkMatrah = Math.min(b, tavan)
  const sgkIsci = sgkMatrah * D.SGK.isci
  const issizlikIsci = sgkMatrah * D.SGK.issizlik_isci
  const isverenTemelOran = D.getSgkIsverenOrani(y)
  const isverenOran = isverenTemelOran - Number(indirim) / 100
  const sgkIsveren = sgkMatrah * isverenOran
  const indirimTutar = sgkMatrah * (Number(indirim) / 100)
  const issizlikIsveren = sgkMatrah * D.SGK.issizlik_isveren
  const toplamIsci = sgkIsci + issizlikIsci
  const toplamIsveren = sgkIsveren + issizlikIsveren
  const genelToplam = toplamIsci + toplamIsveren

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="SSK Isci + Isveren Hisseleri">
        <div className="space-y-3">
          <Select label="Yil" value={yil} onChange={setYil} options={D.YILLAR.map(y => ({ value: String(y), label: String(y) }))} />
          <Select label="Calisan Tipi" value={calTip} onChange={setCalTip} options={[
            { value: 'normal', label: 'Normal Calisan' },
            { value: 'emekli', label: 'Emekli Calisan' },
            { value: 'kapici', label: 'Kapici / Apartman Gorevlisi' }
          ]} />
          <Select label="Isveren Prim Indirimi (5510/tesvik)" value={indirim} onChange={setIndirim} options={[
            { value: '0', label: '%0 - Indirimsiz' },
            { value: '2', label: '%2 - Indirimli (varsayilan)' },
            { value: '5', label: '%5 - Bes Puanlik Indirim' }
          ]} />
          <Input label={`Brut Ucret (${yil} asgari: ${D.fmt(asgariBrut)} TL, tavan: ${D.fmt(tavan)} TL)`} value={brut} onChange={setBrut} suffix="TL"
            placeholder={asgariBrut ? formatTurkishInput(String(asgariBrut)) : ''} />
        </div>
      </Card>
      <Card title="Sonuc">
        {b > 0 ? (
          <div className="space-y-1">
            <Result label="SGK Matrahi" value={`${D.fmt(sgkMatrah)} TL`} />
            <Result label={`SGK Tavan (${yil})`} value={`${D.fmt(tavan)} TL`} />
            <div className="my-1 border-t border-blue-700/30" />
            <p className="text-yellow-400/70 text-xs font-semibold">Isci Hissesi</p>
            <Result label="SGK (%14)" value={`${D.fmt(sgkIsci)} TL`} />
            <Result label="Issizlik (%1)" value={`${D.fmt(issizlikIsci)} TL`} />
            <Result label="Toplam Isci" value={`${D.fmt(toplamIsci)} TL`} highlight />
            <div className="my-1 border-t border-blue-700/30" />
            <p className="text-yellow-400/70 text-xs font-semibold">Isveren Hissesi</p>
            <Result label={`SGK (%${(isverenOran * 100).toFixed(2).replace('.', ',')}, %${indirim} indirimli)`} value={`${D.fmt(sgkIsveren)} TL`} />
            {Number(indirim) > 0 && <Result label={`Indirim Tutari (%${indirim})`} value={`-${D.fmt(indirimTutar)} TL`} negative />}
            <Result label="Issizlik (%2)" value={`${D.fmt(issizlikIsveren)} TL`} />
            <Result label="Toplam Isveren" value={`${D.fmt(toplamIsveren)} TL`} highlight />
            <div className="my-1 border-t border-blue-700/30" />
            <Result label="Genel Toplam" value={`${D.fmt(genelToplam)} TL`} highlight />
          </div>
        ) : <p className="text-gray-500 text-sm">Brut ucret girin</p>}
      </Card>
    </div>
  )
}

// ========== 12. KDV ==========

function KDVHesapMakinesi() {
  const [tutar, setTutar] = useState('')
  const [kdvOran, setKdvOran] = useState('20')
  const [yon, setYon] = useState('haric')
  const t = parseTurkishNumber(tutar)
  const oran = Number(kdvOran) / 100
  let kdvTutar, kdvHaric, kdvDahil
  if (yon === 'haric') { kdvHaric = t; kdvTutar = t * oran; kdvDahil = t + kdvTutar }
  else { kdvDahil = t; kdvHaric = t / (1 + oran); kdvTutar = kdvDahil - kdvHaric }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="KDV Hesap Makinesi">
        <div className="space-y-3">
          <Select label="Hesaplama" value={yon} onChange={setYon} options={[
            { value: 'haric', label: 'KDV Haric -> Dahil' },
            { value: 'dahil', label: 'KDV Dahil -> Haric' }
          ]} />
          <Input label="Tutar" value={tutar} onChange={setTutar} suffix="TL" />
          <Select label="KDV Orani" value={kdvOran} onChange={setKdvOran} options={[
            { value: '1', label: '%1' }, { value: '10', label: '%10' }, { value: '20', label: '%20' }
          ]} />
        </div>
      </Card>
      <Card title="Sonuc">
        {t > 0 ? (
          <div className="space-y-1">
            <Result label="KDV Haric" value={`${D.fmt(kdvHaric)} TL`} />
            <Result label={`KDV (%${kdvOran})`} value={`${D.fmt(kdvTutar)} TL`} />
            <Result label="KDV Dahil" value={`${D.fmt(kdvDahil)} TL`} highlight />
          </div>
        ) : <p className="text-gray-500 text-sm">Tutar girin</p>}
      </Card>
    </div>
  )
}

// ========== 13. TEVKIFAT / STOPAJ ==========

function TevkifatliStopajliFatura() {
  const [tutar, setTutar] = useState('')
  const [kdvOran, setKdvOran] = useState('20')
  const [tip, setTip] = useState('tevkifat')
  const [tevOran, setTevOran] = useState('50')
  const [stopajOran, setStopajOran] = useState('20')
  const t = parseTurkishNumber(tutar)
  const kdvTutar = t * (Number(kdvOran) / 100)
  let sonuc = {}
  if (tip === 'tevkifat') {
    const tev = kdvTutar * (Number(tevOran) / 100)
    sonuc = { kdvTutar, tevkifatTutar: tev, odenecekKdv: kdvTutar - tev, toplam: t + kdvTutar - tev }
  } else {
    const st = t * (Number(stopajOran) / 100)
    sonuc = { kdvTutar, stopajTutar: st, netTutar: t - st, toplam: t + kdvTutar - st }
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="Tevkifatli / Stopajli Fatura">
        <div className="space-y-3">
          <Select label="Fatura Tipi" value={tip} onChange={setTip} options={[
            { value: 'tevkifat', label: 'Tevkifatli Fatura' },
            { value: 'stopaj', label: 'Stopajli Fatura' }
          ]} />
          <Input label="Tutar (KDV Haric)" value={tutar} onChange={setTutar} suffix="TL" />
          <Select label="KDV Orani" value={kdvOran} onChange={setKdvOran} options={[
            { value: '1', label: '%1' }, { value: '10', label: '%10' }, { value: '20', label: '%20' }
          ]} />
          {tip === 'tevkifat' ? (
            <Select label="Tevkifat Orani (Is Turu)" value={tevOran} onChange={setTevOran} options={[
              { value: '20', label: '2/10 - Yemek servisi ve organizasyon hizmetleri' },
              { value: '30', label: '3/10 - Baski, basim ve promosyon hizmetleri' },
              { value: '40', label: '4/10 - Spor kulubu yayin/reklam/isim hakki' },
              { value: '50', label: '5/10 - Temizlik, guvenlik, bahce bakim, makine kiralama, yapim isleri' },
              { value: '70', label: '7/10 - Yuk tasimaciligi hizmetleri' },
              { value: '90', label: '9/10 - Serbest meslek (muhasebecilik, muhendislik, avukatlik, danismanlik vb.)' }
            ]} />
          ) : (
            <Select label="Stopaj Orani" value={stopajOran} onChange={setStopajOran} options={[
              { value: '10', label: '%10' }, { value: '15', label: '%15' }, { value: '17', label: '%17' },
              { value: '20', label: '%20' }, { value: '22', label: '%22' }, { value: '25', label: '%25' }
            ]} />
          )}
        </div>
      </Card>
      <Card title="Sonuc">
        {t > 0 ? (
          <div className="space-y-1">
            <Result label="Matrah" value={`${D.fmt(t)} TL`} />
            <Result label={`KDV (%${kdvOran})`} value={`${D.fmt(sonuc.kdvTutar)} TL`} />
            {tip === 'tevkifat' ? (
              <>
                <Result label={`Tevkifat (${tevOran}/100)`} value={`-${D.fmt(sonuc.tevkifatTutar)} TL`} negative />
                <Result label="Odenecek KDV" value={`${D.fmt(sonuc.odenecekKdv)} TL`} />
                <Result label="Fatura Toplam" value={`${D.fmt(sonuc.toplam)} TL`} highlight />
              </>
            ) : (
              <>
                <Result label={`Stopaj (%${stopajOran})`} value={`-${D.fmt(sonuc.stopajTutar)} TL`} negative />
                <Result label="Net Tutar" value={`${D.fmt(sonuc.netTutar)} TL`} />
                <Result label="Tahsil Edilecek" value={`${D.fmt(sonuc.toplam)} TL`} highlight />
              </>
            )}
          </div>
        ) : <p className="text-gray-500 text-sm">Tutar girin</p>}
      </Card>
    </div>
  )
}

// ========== ANA SAYFA ==========

const KATEGORILER = [
  { id: 'is_hukuku', label: 'Is Hukuku', icon: Briefcase, color: 'from-blue-500 to-blue-700',
    items: [
      { id: 'ihbar_kidem', label: 'Ihbar / Kidem Tazminati', comp: IhbarKidem },
      { id: 'izin', label: 'Ucretli Izin Hesabi', comp: IzinHesap }
    ]
  },
  { id: 'vergi', label: 'Vergi', icon: Receipt, color: 'from-emerald-500 to-emerald-700',
    items: [
      { id: 'gv_kv', label: 'Gelir / Kurumlar Vergisi', comp: GelirKurumlarVergisi },
      { id: 'gms', label: 'GMS Iradi Vergisi', comp: GMSIradi },
      { id: 'deger_artis', label: 'Deger Artis Kazanci', comp: DegerArtisKazanci },
      { id: 'damga', label: 'Kontrat Damga Vergisi', comp: DamgaVergisi },
      { id: 'kira_artis', label: 'Kira Artis Hesabi', comp: KiraArtis }
    ]
  },
  { id: 'sgk', label: 'SGK / Emeklilik', icon: Shield, color: 'from-purple-500 to-purple-700',
    items: [
      { id: 'brut_net', label: 'Brut / Net Ucret', comp: BrutNetHesap },
      { id: 'emeklilik', label: 'Emeklilik Hesabi (4/A, 4/B)', comp: EmeklilikHesabi },
      { id: 'borclanma', label: 'Borclanma (Askerlik/Cocuk)', comp: BorclanmaHesabi },
      { id: 'ssk_hisse', label: 'SSK Isci + Isveren Hisseleri', comp: SSKHisseHesabi }
    ]
  },
  { id: 'beyannameler', label: 'Beyannameler', icon: FileText, color: 'from-sky-500 to-sky-700',
    items: [
      { id: 'veraset_intikal', label: 'Veraset ve Intikal Vergisi Beyannamesi', comp: VerasetIntikalBeyan }
    ]
  },
  { id: 'fatura', label: 'KDV / Fatura', icon: FileText, color: 'from-orange-500 to-orange-700',
    items: [
      { id: 'kdv', label: 'KDV Dahil / Haric', comp: KDVHesapMakinesi },
      { id: 'tevkifat_stopaj', label: 'Tevkifat / Stopaj Fatura', comp: TevkifatliStopajliFatura }
    ]
  }
]

export default function PratikHesaplamalar() {
  const [selectedKat, setSelectedKat] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null)
  const ActiveComp = selectedItem?.comp

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Calculator className="w-8 h-8 text-yellow-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Pratik Hesaplamalar</h1>
          <p className="text-gray-400 text-sm">Mali musavirlik hesaplama araclari</p>
        </div>
      </div>

      {!selectedItem ? (
        <div className="space-y-6">
          {KATEGORILER.map(kat => (
            <div key={kat.id}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-r ${kat.color} flex items-center justify-center`}>
                  <kat.icon className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-white font-semibold">{kat.label}</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {kat.items.map(item => (
                  <button key={item.id} onClick={() => { setSelectedKat(kat); setSelectedItem(item) }}
                    className="bg-blue-950/30 border border-blue-800/30 rounded-xl p-4 text-left hover:border-yellow-500/50 hover:bg-blue-900/30 transition-all group">
                    <div className={`w-6 h-6 rounded-lg bg-gradient-to-r ${kat.color} flex items-center justify-center mb-2 group-hover:scale-110 transition-transform`}>
                      <Calculator className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-white text-sm font-medium">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div>
          <button onClick={() => { setSelectedItem(null); setSelectedKat(null) }}
            className="text-gray-400 hover:text-white flex items-center gap-1 text-sm mb-6 transition-colors">
            &#8592; Tum Hesaplamalar
          </button>
          {selectedKat && (
            <div className="flex flex-wrap gap-2 mb-6">
              {selectedKat.items.map(item => (
                <button key={item.id} onClick={() => setSelectedItem(item)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    selectedItem.id === item.id 
                      ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' 
                      : 'bg-blue-900/30 text-gray-400 border border-blue-700/30 hover:text-white'
                  }`}>
                  {item.label}
                </button>
              ))}
            </div>
          )}
          <ActiveComp />
        </div>
      )}
    </div>
  )
}
