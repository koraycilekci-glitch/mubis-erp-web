import { useState, useEffect } from 'react'
import { Calculator, Briefcase, Receipt, Wallet, Shield, FileText, Save, Trash2, Edit3, FileDown, RotateCcw } from 'lucide-react'
import { useParameters } from '../hooks/useParameters'
import { useClients } from '../hooks/useClients'
import * as D from '../data/defaults'
import { jsPDF } from 'jspdf'

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
  return (
    <div className={className}>
      <label className="text-gray-400 text-xs block mb-1">{label}</label>
      <div className="relative">
        <input type={type} value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
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
  const [kidemChecked, setKidemChecked] = useState(true)
  const [ihbarChecked, setIhbarChecked] = useState(true)
  
  // Kayit
  const [savedId, setSavedId] = useState(null)
  const [msg, setMsg] = useState('')

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
        break
    }
  }, [cikisSebebi, emekliKagit])

  // Brut ucret hesapla
  const yil = cikis ? new Date(cikis).getFullYear() : 2025
  let brutUcret = 0
  if (ucretTip === 'asgari') {
    brutUcret = D.ASGARI_UCRET[yil]?.brut || D.ASGARI_UCRET[2025].brut
  } else if (ucretTip === 'brut') {
    brutUcret = Number(ucretTutar) || 0
  } else if (ucretTip === 'net') {
    brutUcret = D.nettenBrute(Number(ucretTutar) || 0, yil)
  }
  const ekOdemeTutar = Number(ekOdeme) || 0
  const toplamBrut = brutUcret + ekOdemeTutar

  // Hesaplamalar
  const ihbarSuresi = giris && cikis ? D.getIhbarSuresi(giris, cikis) : null
  const calismaSuresi = giris && cikis ? ((new Date(cikis) - new Date(giris)) / (365.25 * 24 * 60 * 60 * 1000)) : 0
  const kidemTavani = cikis ? params.getKidemTavani(cikis) : D.getKidemTavani(new Date())

  // Kidem
  const gunlukBrut = Math.min(toplamBrut / 30, kidemTavani / 30)
  const kidemBrut = kidemChecked ? calismaSuresi * 30 * gunlukBrut : 0
  const kidemDamga = kidemBrut * D.DAMGA_VERGISI
  const kidemNet = kidemBrut - kidemDamga

  // Ihbar
  const ihbarGun = ihbarSuresi?.gun || 0
  const ihbarBrut = ihbarChecked ? (toplamBrut / 30) * ihbarGun : 0
  const ihbarGelirV = ihbarBrut * 0.15  // gelir vergisi
  const ihbarDamga = ihbarBrut * D.DAMGA_VERGISI
  const ihbarSgk = ihbarBrut * (D.SGK.isci + D.SGK.issizlik_isci)
  const ihbarNet = ihbarBrut - ihbarGelirV - ihbarDamga - ihbarSgk

  const toplamNet = kidemNet + ihbarNet

  const temizle = () => {
    setAdSoyad(''); setTc(''); setAdres(''); setGiris(''); setCikis('')
    setCikisSebebi('isveren'); setEmekliKagit(false)
    setIsverenKaynak('elle'); setSelectedClient(''); setIsverenAd(''); setIsverenAdres(''); setSgkIsyeriNo('')
    setUcretTip('brut'); setUcretTutar(''); setEkOdeme('')
    setKidemChecked(true); setIhbarChecked(true); setSavedId(null); setMsg('')
  }

  const kaydet = async () => {
    const data = {
      adSoyad, tc, adres, giris, cikis, cikisSebebi, emekliKagit,
      isverenAd, isverenAdres, sgkIsyeriNo,
      ucretTip, ucretTutar, ekOdeme, brutUcret, toplamBrut,
      kidemChecked, ihbarChecked,
      kidemBrut, kidemDamga, kidemNet,
      ihbarBrut, ihbarGelirV, ihbarDamga, ihbarSgk, ihbarNet, toplamNet
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
    const doc = new jsPDF()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('IBRANAME', 105, 25, { align: 'center' })
    
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    let y = 45
    const line = (text) => { doc.text(text, 20, y); y += 7 }
    
    line(`Isverenin Adi/Unvani: ${isverenAd}`)
    line(`Isverenin Adresi: ${isverenAdres}`)
    line(`SGK Isyeri No: ${sgkIsyeriNo}`)
    y += 5
    line(`Sigortali Adi Soyadi: ${adSoyad}`)
    line(`TC Kimlik No: ${tc}`)
    line(`Ikamet Adresi: ${adres}`)
    y += 5
    line(`Ise Giris Tarihi: ${giris ? new Date(giris).toLocaleDateString('tr-TR') : '-'}`)
    line(`Isten Cikis Tarihi: ${cikis ? new Date(cikis).toLocaleDateString('tr-TR') : '-'}`)
    line(`Cikis Sebebi: ${cikisSebebi.toUpperCase()}`)
    line(`Calisma Suresi: ${calismaSuresi.toFixed(2)} yil`)
    y += 5
    line(`Son Brut Ucret: ${D.fmt(brutUcret)} TL`)
    if (ekOdemeTutar > 0) line(`Ek Odemeler: ${D.fmt(ekOdemeTutar)} TL`)
    line(`Toplam Brut Ucret: ${D.fmt(toplamBrut)} TL`)
    y += 10

    if (kidemChecked) {
      doc.setFont('helvetica', 'bold')
      line('KIDEM TAZMINATI')
      doc.setFont('helvetica', 'normal')
      line(`Brut Kidem Tazminati: ${D.fmt(kidemBrut)} TL`)
      line(`Damga Vergisi Kesintisi: ${D.fmt(kidemDamga)} TL`)
      line(`Net Kidem Tazminati: ${D.fmt(kidemNet)} TL`)
      y += 3
    }

    if (ihbarChecked) {
      doc.setFont('helvetica', 'bold')
      line('IHBAR TAZMINATI')
      doc.setFont('helvetica', 'normal')
      line(`Ihbar Suresi: ${ihbarSuresi?.hafta || 0} hafta (${ihbarGun} gun)`)
      line(`Brut Ihbar Tazminati: ${D.fmt(ihbarBrut)} TL`)
      line(`Gelir Vergisi: ${D.fmt(ihbarGelirV)} TL`)
      line(`Damga Vergisi: ${D.fmt(ihbarDamga)} TL`)
      line(`SGK Kesintisi: ${D.fmt(ihbarSgk)} TL`)
      line(`Net Ihbar Tazminati: ${D.fmt(ihbarNet)} TL`)
      y += 3
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    line(`TOPLAM NET TAZMINAT: ${D.fmt(toplamNet)} TL`)
    
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    y += 15
    doc.text('Yukaridaki tutarlari tam ve eksiksiz olarak aldim.', 20, y); y += 5
    doc.text('Isverenimden herhangi bir alacagim kalmadigini beyan ederim.', 20, y); y += 15
    doc.text(`Tarih: ${new Date().toLocaleDateString('tr-TR')}`, 20, y)
    doc.text('Imza: ........................', 130, y)
    y += 10
    doc.text(`Adi Soyadi: ${adSoyad}`, 20, y)
    doc.text(`TC: ${tc}`, 130, y)

    doc.save(`ibraname_${adSoyad.replace(/\s/g, '_') || 'belge'}.pdf`)
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
                { value: 'askerlik', label: 'Askerlik' },
                { value: 'evlilik', label: 'Evlilik' },
                { value: 'diger', label: 'Diger' }
              ]} />
              {cikisSebebi === 'istifa' && (
                <Checkbox label="SGK'dan emekli olabilir kagidi var" checked={emekliKagit} onChange={setEmekliKagit} />
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
                  options={[{ value: '', label: '-- Secin --' }, ...clients.map(c => ({ value: String(c.id), label: c.type === 'company' ? (c.company || c.name) : c.name }))]} />
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
                  if (v === 'asgari') setUcretTutar(String(D.ASGARI_UCRET[yil]?.brut || D.ASGARI_UCRET[2025].brut))
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
                <Result label="Calisma Suresi" value={`${calismaSuresi.toFixed(2)} yil`} />
                <Result label="Cikis Sebebi" value={cikisSebebi.toUpperCase()} />

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
                    <Result label="SGK Kesintisi" value={`-${D.fmt(ihbarSgk)} TL`} negative />
                    <Result label="Net Ihbar Tazminati" value={`${D.fmt(ihbarNet)} TL`} highlight />
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
    const izin = D.IZIN_GUNLERI.find(i => yil >= i.minYil && yil < i.maxYil)
    hakEdilen = izin ? izin.gun : 0
    // 18 yas alti ve 50 yas ustu en az 20 gun (Is Kanunu Md.53)
    if (ozelDurum && hakEdilen < 20) hakEdilen = 20
  }

  const kalan = Math.max(0, hakEdilen - Number(kullanilanGun))
  const gunlukUcret = (Number(brut) || 0) / 30
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
            {Number(brut) > 0 && <Result label="Izin Ucreti" value={`${D.fmt(izinUcreti)} TL`} highlight />}
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
  const [yil, setYil] = useState('2025')
  const [tip, setTip] = useState('ucret_disi')
  const [karsilastir, setKarsilastir] = useState(false)
  
  const m = Number(matrah) || 0
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
  const [yil, setYil] = useState('2025')
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
  
  let yillikKonut = Number(konutKira) || 0
  let yillikIsyeri = Number(isyeriKira) || 0
  
  // Net ise brute cevir + stopaj
  let stopajKonut = 0, stopajIsyeri = 0
  if (kiraTip === 'net') {
    const brutKonut = yillikKonut / 0.80 // %20 stopaj
    stopajKonut = brutKonut * 0.20
    yillikKonut = brutKonut
    const brutIsyeri = yillikIsyeri / 0.80
    stopajIsyeri = brutIsyeri * 0.20
    yillikIsyeri = brutIsyeri
  }
  const toplamStopaj = stopajKonut + stopajIsyeri

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
    gider = Number(gercekGider) || 0
  }

  // Egitim-saglik (matrahin %10'unu gecemez)
  const egitimSaglik = Math.min(
    (Number(egitimGider) || 0) + (Number(saglikGider) || 0),
    toplamMatrah * 0.10
  )

  // Sigorta primleri (brut ucretin %15'ini gecemez - GMS icin matrah baz)
  const sigortaPrim = Math.min(
    (Number(hayatSig) || 0) + (Number(saglikSig) || 0),
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
          <Select label="Kira Tipi" value={kiraTip} onChange={setKiraTip} options={[
            { value: 'brut', label: 'Brut Kira' },
            { value: 'net', label: 'Net Kira (Stopaj Kesildikten Sonra)' }
          ]} />
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
    }
  }, [satisTarih])

  const alis = Number(alisBedel) || 0
  const satis = Number(satisBedel) || 0
  const gider = Number(satisGider) || 0
  const aYiufe = Number(alisYiufe) || 1
  const sYiufe = Number(satisYiufe) || 1
  const ist = Number(istisna) || 0

  const endeksliMaliyet = alis * (sYiufe / aYiufe)
  const endeksliGider = gider // giderler de endekslenebilir ama basit tutalim
  const kazanc = Math.max(0, satis - endeksliMaliyet - endeksliGider)
  const matrah = Math.max(0, kazanc - ist)
  const satisYil = satisTarih ? new Date(satisTarih).getFullYear() : 2025
  const vergi = D.hesaplaGV(matrah, satisYil)

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
            <Result label="Alis Bedeli" value={`${D.fmt(alis)} TL`} />
            <Result label="Yi-UFE Orani" value={`${(sYiufe / aYiufe).toFixed(4)}`} />
            <Result label="Endeksli Maliyet" value={`${D.fmt(endeksliMaliyet)} TL`} />
            {gider > 0 && <Result label="Satis Giderleri" value={`${D.fmt(gider)} TL`} />}
            <Result label="Satis Bedeli" value={`${D.fmt(satis)} TL`} />
            <Result label="Kazanc" value={`${D.fmt(kazanc)} TL`} />
            <Result label="Istisna Tutari" value={`-${D.fmt(ist)} TL`} negative />
            <Result label="Vergi Matrahi" value={`${D.fmt(matrah)} TL`} />
            <Result label="Odenecek Vergi" value={`${D.fmt(vergi)} TL`} highlight />
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

  // Sayfa acilinca guncel kira artis oranini getir
  useEffect(() => {
    const now = new Date()
    const oran = params.getKiraArtisOrani(now.getFullYear(), now.getMonth() + 1)
    if (oran) setTufeOran(String(oran))
  }, [])

  const kira = Number(mevcutKira) || 0
  const oran = Number(tufeOran) || 0
  const yeniKira = kira * (1 + oran / 100)
  const artis = yeniKira - kira
  const now = new Date()
  const ayAdi = now.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="Kira Artis Hesaplama">
        <div className="space-y-3">
          <p className="text-gray-400 text-xs">12 aylik TUFE ortalamasina gore kira artis orani otomatik getirilir ({ayAdi}).</p>
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
  const t = Number(tutar) || 0
  const damga = t * D.DAMGA_VERGISI

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="Kontrat Damga Vergisi">
        <Input label="Kontrat Tutari" value={tutar} onChange={setTutar} suffix="TL" />
      </Card>
      <Card title="Sonuc">
        {t > 0 ? (
          <div className="space-y-1">
            <Result label="Kontrat Tutari" value={`${D.fmt(t)} TL`} />
            <Result label={`Damga Vergisi (%${(D.DAMGA_VERGISI * 100).toFixed(2)})`} value={`${D.fmt(damga)} TL`} highlight />
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
  const [yil, setYil] = useState('2025')
  
  const t = Number(tutar) || 0
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
            <Result label="Gelir Vergisi (Aylik)" value={`-${D.fmt(sonuc.aylikGv)} TL`} negative />
            <Result label="Damga Vergisi" value={`-${D.fmt(sonuc.damga)} TL`} negative />
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
  const mevcutPrim = Number(primGun) || 0
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
            <Result label="Emeklilik Yasi Tarihi" value={emeklilikYas?.toLocaleDateString('tr-TR') || '-'} />
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
  const [gun, setGun] = useState('')
  const [pek, setPek] = useState('')
  const g = Number(gun) || 0
  const p = Number(pek) || 0
  const borcAlt = g * p * 0.32
  const borcUst = g * p * 0.45

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="Borclanma (Askerlik/Cocuk)">
        <div className="space-y-3">
          <Input label="Borclanma Gun Sayisi" value={gun} onChange={setGun} />
          <Input label="Gunluk Prime Esas Kazanc" value={pek} onChange={setPek} suffix="TL" />
        </div>
      </Card>
      <Card title="Sonuc">
        {g > 0 && p > 0 ? (
          <div className="space-y-1">
            <Result label="Gun Sayisi" value={`${g} gun`} />
            <Result label="Gunluk PEK" value={`${D.fmt(p)} TL`} />
            <Result label="Borclanma (Alt %32)" value={`${D.fmt(borcAlt)} TL`} />
            <Result label="Borclanma (Ust %45)" value={`${D.fmt(borcUst)} TL`} highlight />
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
  const [yil, setYil] = useState('2025')
  const y = Number(yil)
  const b = Number(brut) || 0
  const tavan = D.SGK.tavan[y] || D.SGK.tavan[2025]
  const sgkMatrah = Math.min(b, tavan)
  const sgkIsci = sgkMatrah * D.SGK.isci
  const issizlikIsci = sgkMatrah * D.SGK.issizlik_isci
  const sgkIsveren = sgkMatrah * D.SGK.isveren
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
          <Input label="Brut Ucret" value={brut} onChange={setBrut} suffix="TL" />
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
            <Result label="SGK (%20.5)" value={`${D.fmt(sgkIsveren)} TL`} />
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
  const t = Number(tutar) || 0
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
  const t = Number(tutar) || 0
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
            <Select label="Tevkifat Orani" value={tevOran} onChange={setTevOran} options={[
              { value: '20', label: '2/10' }, { value: '30', label: '3/10' }, { value: '40', label: '4/10' },
              { value: '50', label: '5/10' }, { value: '70', label: '7/10' }, { value: '90', label: '9/10' }
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
      { id: 'damga', label: 'Kontrat Damga Vergisi', comp: DamgaVergisi }
    ]
  },
  { id: 'ucret', label: 'Ucret', icon: Wallet, color: 'from-yellow-500 to-yellow-700',
    items: [
      { id: 'brut_net', label: 'Brut / Net Ucret', comp: BrutNetHesap },
      { id: 'kira_artis', label: 'Kira Artis Hesabi', comp: KiraArtis }
    ]
  },
  { id: 'sgk', label: 'SGK / Emeklilik', icon: Shield, color: 'from-purple-500 to-purple-700',
    items: [
      { id: 'emeklilik', label: 'Emeklilik Hesabi (4/A, 4/B)', comp: EmeklilikHesabi },
      { id: 'borclanma', label: 'Borclanma (Askerlik/Cocuk)', comp: BorclanmaHesabi },
      { id: 'ssk_hisse', label: 'SSK Isci + Isveren Hisseleri', comp: SSKHisseHesabi }
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
