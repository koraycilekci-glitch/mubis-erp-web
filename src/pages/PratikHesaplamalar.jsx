import { useState } from 'react'
import { Calculator, Briefcase, Receipt, Wallet, Shield, FileText } from 'lucide-react'

// 2025 Gelir Vergisi Dilimleri
const GV_DILIMLERI = [
  { limit: 110000, rate: 0.15 },
  { limit: 230000, rate: 0.20 },
  { limit: 580000, rate: 0.27 },
  { limit: 3000000, rate: 0.35 },
  { limit: Infinity, rate: 0.40 }
]

// 2025 Asgari Ucret
const ASGARI_UCRET_BRUT = 26005.50
const ASGARI_UCRET_NET = 22104.67
const SGK_TAVAN = 195041.25

// SGK Oranlari
const SGK_ISCI = 0.14
const SGK_ISSIZLIK_ISCI = 0.01
const SGK_ISVEREN = 0.205
const SGK_ISSIZLIK_ISVEREN = 0.02
const DAMGA_VERGISI = 0.00759

// Kidem tavani (2025 1. donem)
const KIDEM_TAVANI = 41828.42

function fmt(n) { return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) }

function Card({ title, children }) {
  return (
    <div className="bg-blue-900/20 rounded-xl border border-blue-700/30 p-5">
      <h3 className="text-white font-semibold mb-4">{title}</h3>
      {children}
    </div>
  )
}

function Input({ label, value, onChange, type = 'number', placeholder = '', suffix = '' }) {
  return (
    <div>
      <label className="text-gray-400 text-xs block mb-1">{label}</label>
      <div className="relative">
        <input type={type} value={value} onChange={e => onChange(e.target.value)}
          className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-500"
          placeholder={placeholder} />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">{suffix}</span>}
      </div>
    </div>
  )
}

function Result({ label, value, highlight = false }) {
  return (
    <div className={`flex justify-between py-1.5 ${highlight ? 'border-t border-yellow-500/30 mt-1 pt-2' : ''}`}>
      <span className={`text-sm ${highlight ? 'text-yellow-400 font-semibold' : 'text-gray-400'}`}>{label}</span>
      <span className={`text-sm font-mono ${highlight ? 'text-yellow-400 font-bold' : 'text-white'}`}>{value}</span>
    </div>
  )
}

function Select({ label, value, onChange, options }) {
  return (
    <div>
      <label className="text-gray-400 text-xs block mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-500">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

// ========== HESAPLAMA FONKSIYONLARI ==========

function hesaplaGelirVergisi(matrah) {
  let toplam = 0, kalan = matrah, oncekiLimit = 0
  for (const dilim of GV_DILIMLERI) {
    const dilimTutar = Math.min(kalan, dilim.limit - oncekiLimit)
    if (dilimTutar <= 0) break
    toplam += dilimTutar * dilim.rate
    kalan -= dilimTutar
    oncekiLimit = dilim.limit
  }
  return toplam
}

function hesaplaBruttenNete(brut, sgkGun = 30) {
  const sgkMatrah = Math.min(brut, SGK_TAVAN)
  const sgkIsci = sgkMatrah * SGK_ISCI
  const issizlikIsci = sgkMatrah * SGK_ISSIZLIK_ISCI
  const gvMatrah = brut - sgkIsci - issizlikIsci
  const gv = hesaplaGelirVergisi(gvMatrah)
  const aylikGv = gv / 12
  const damga = brut * DAMGA_VERGISI
  const net = brut - sgkIsci - issizlikIsci - aylikGv - damga
  
  const sgkIsveren = sgkMatrah * SGK_ISVEREN
  const issizlikIsveren = sgkMatrah * SGK_ISSIZLIK_ISVEREN
  const toplamMaliyet = brut + sgkIsveren + issizlikIsveren

  return { sgkIsci, issizlikIsci, gvMatrah, aylikGv, damga, net, sgkIsveren, issizlikIsveren, toplamMaliyet }
}

function hesaplaKidem(giris, cikis, brutUcret) {
  const d1 = new Date(giris), d2 = new Date(cikis)
  const yil = (d2 - d1) / (365.25 * 24 * 60 * 60 * 1000)
  const gunlukBrut = Math.min(brutUcret / 30, KIDEM_TAVANI / 30)
  const kidemBrut = yil * 30 * gunlukBrut
  const damga = kidemBrut * DAMGA_VERGISI
  const kidemNet = kidemBrut - damga
  return { yil: yil.toFixed(2), kidemBrut, damga, kidemNet }
}

function hesaplaIhbar(giris, cikis) {
  const d1 = new Date(giris), d2 = new Date(cikis)
  const ay = (d2 - d1) / (30.44 * 24 * 60 * 60 * 1000)
  if (ay < 6) return { hafta: 2, gun: 14 }
  if (ay < 18) return { hafta: 4, gun: 28 }
  if (ay < 36) return { hafta: 6, gun: 42 }
  return { hafta: 8, gun: 56 }
}

// ========== HESAPLAMA KOMPONENTLERI ==========

function IhbarKidem() {
  const [giris, setGiris] = useState('')
  const [cikis, setCikis] = useState('')
  const [brut, setBrut] = useState('')
  
  const ihbar = giris && cikis ? hesaplaIhbar(giris, cikis) : null
  const kidem = giris && cikis && brut ? hesaplaKidem(giris, cikis, Number(brut)) : null

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="Ihbar ve Kidem Tazminati">
        <div className="space-y-3">
          <Input label="Ise Giris Tarihi" value={giris} onChange={setGiris} type="date" />
          <Input label="Isten Cikis Tarihi" value={cikis} onChange={setCikis} type="date" />
          <Input label="Brut Ucret" value={brut} onChange={setBrut} suffix="TL" />
        </div>
      </Card>
      <Card title="Sonuc">
        {ihbar && kidem ? (
          <div className="space-y-1">
            <Result label="Calisma Suresi" value={`${kidem.yil} yil`} />
            <Result label="Ihbar Suresi" value={`${ihbar.hafta} hafta (${ihbar.gun} gun)`} />
            <Result label="Ihbar Tazminati" value={`${fmt(Number(brut) / 30 * ihbar.gun)} TL`} />
            <div className="my-2 border-t border-blue-700/30" />
            <Result label="Kidem Tazminati (Brut)" value={`${fmt(kidem.kidemBrut)} TL`} />
            <Result label="Damga Vergisi" value={`${fmt(kidem.damga)} TL`} />
            <Result label="Kidem Tazminati (Net)" value={`${fmt(kidem.kidemNet)} TL`} highlight />
            <p className="text-gray-500 text-[10px] mt-2">2025 kidem tavani: {fmt(KIDEM_TAVANI)} TL</p>
          </div>
        ) : <p className="text-gray-500 text-sm">Bilgileri girin</p>}
      </Card>
    </div>
  )
}

function GelirKurumlarVergisi() {
  const [matrah, setMatrah] = useState('')
  const [tip, setTip] = useState('gelir')
  
  const m = Number(matrah) || 0
  const gv = tip === 'gelir' ? hesaplaGelirVergisi(m) : m * 0.25
  const efektifOran = m > 0 ? (gv / m * 100).toFixed(2) : 0

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="Gelir / Kurumlar Vergisi">
        <div className="space-y-3">
          <Select label="Vergi Turu" value={tip} onChange={setTip} options={[
            { value: 'gelir', label: 'Gelir Vergisi' },
            { value: 'kurumlar', label: 'Kurumlar Vergisi (%25)' }
          ]} />
          <Input label="Vergi Matrahi" value={matrah} onChange={setMatrah} suffix="TL" />
        </div>
      </Card>
      <Card title="Sonuc">
        {m > 0 ? (
          <div className="space-y-1">
            <Result label="Matrah" value={`${fmt(m)} TL`} />
            <Result label="Vergi Tutari" value={`${fmt(gv)} TL`} highlight />
            <Result label="Efektif Oran" value={`%${efektifOran}`} />
            {tip === 'gelir' && (
              <div className="mt-3 text-[10px] text-gray-500 space-y-0.5">
                {GV_DILIMLERI.map((d, i) => (
                  <div key={i}>%{d.rate * 100} - {d.limit === Infinity ? 'ustu' : `${fmt(d.limit)} TL'ye kadar`}</div>
                ))}
              </div>
            )}
          </div>
        ) : <p className="text-gray-500 text-sm">Matrah girin</p>}
      </Card>
    </div>
  )
}

function BrutNetHesap() {
  const [brut, setBrut] = useState('')
  const [yon, setYon] = useState('brut_net')
  
  const b = Number(brut) || 0
  const sonuc = b > 0 ? hesaplaBruttenNete(b) : null

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="Brut / Net Ucret Hesaplama">
        <div className="space-y-3">
          <Select label="Hesaplama Yonu" value={yon} onChange={setYon} options={[
            { value: 'brut_net', label: 'Brutten Nete' },
            { value: 'net_brut', label: 'Netten Brute' }
          ]} />
          <Input label={yon === 'brut_net' ? 'Brut Ucret' : 'Net Ucret'} value={brut} onChange={setBrut} suffix="TL" />
        </div>
      </Card>
      <Card title="Sonuc">
        {sonuc ? (
          <div className="space-y-1">
            <Result label="Brut Ucret" value={`${fmt(b)} TL`} />
            <Result label="SGK Isci (%14)" value={`${fmt(sonuc.sgkIsci)} TL`} />
            <Result label="Issizlik Isci (%1)" value={`${fmt(sonuc.issizlikIsci)} TL`} />
            <Result label="GV Matrahi" value={`${fmt(sonuc.gvMatrah)} TL`} />
            <Result label="Gelir Vergisi (Aylik)" value={`${fmt(sonuc.aylikGv)} TL`} />
            <Result label="Damga Vergisi" value={`${fmt(sonuc.damga)} TL`} />
            <Result label="Net Ucret" value={`${fmt(sonuc.net)} TL`} highlight />
            <div className="my-2 border-t border-blue-700/30" />
            <Result label="SGK Isveren (%20.5)" value={`${fmt(sonuc.sgkIsveren)} TL`} />
            <Result label="Issizlik Isveren (%2)" value={`${fmt(sonuc.issizlikIsveren)} TL`} />
            <Result label="Isverene Toplam Maliyet" value={`${fmt(sonuc.toplamMaliyet)} TL`} highlight />
          </div>
        ) : <p className="text-gray-500 text-sm">Ucret girin</p>}
      </Card>
    </div>
  )
}

function GMSIradi() {
  const [kira, setKira] = useState('')
  const [giderYontemi, setGiderYontemi] = useState('goturu')
  
  const yillikKira = (Number(kira) || 0) * 12
  const istisna = 33000 // 2025 GMS istisna tutari
  const matrah = Math.max(0, yillikKira - istisna)
  const gider = giderYontemi === 'goturu' ? matrah * 0.15 : 0
  const vergiMatrah = matrah - gider
  const vergi = hesaplaGelirVergisi(vergiMatrah)

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="GMS Iradi Vergisi">
        <div className="space-y-3">
          <Input label="Aylik Kira Geliri" value={kira} onChange={setKira} suffix="TL" />
          <Select label="Gider Yontemi" value={giderYontemi} onChange={setGiderYontemi} options={[
            { value: 'goturu', label: 'Goturu Gider (%15)' },
            { value: 'gercek', label: 'Gercek Gider' }
          ]} />
        </div>
      </Card>
      <Card title="Sonuc">
        {yillikKira > 0 ? (
          <div className="space-y-1">
            <Result label="Yillik Kira Geliri" value={`${fmt(yillikKira)} TL`} />
            <Result label="Istisna Tutari" value={`${fmt(istisna)} TL`} />
            <Result label="Istisna Sonrasi" value={`${fmt(matrah)} TL`} />
            {giderYontemi === 'goturu' && <Result label="Goturu Gider (%15)" value={`${fmt(gider)} TL`} />}
            <Result label="Vergi Matrahi" value={`${fmt(vergiMatrah)} TL`} />
            <Result label="Odenecek Vergi" value={`${fmt(vergi)} TL`} highlight />
          </div>
        ) : <p className="text-gray-500 text-sm">Kira geliri girin</p>}
      </Card>
    </div>
  )
}

function DegerArtisKazanci() {
  const [alisTarih, setAlisTarih] = useState('')
  const [alisBedel, setAlisBedel] = useState('')
  const [satisTarih, setSatisTarih] = useState('')
  const [satisBedel, setSatisBedel] = useState('')
  const [tufeOran, setTufeOran] = useState('50')

  const alis = Number(alisBedel) || 0
  const satis = Number(satisBedel) || 0
  const tufe = Number(tufeOran) / 100
  const endeksliMaliyet = alis * (1 + tufe)
  const kazanc = Math.max(0, satis - endeksliMaliyet)
  const istisna = 140000 // 2025 degisir
  const matrah = Math.max(0, kazanc - istisna)
  const vergi = hesaplaGelirVergisi(matrah)

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="Bina Deger Artis Kazanci">
        <div className="space-y-3">
          <Input label="Alis Tarihi" value={alisTarih} onChange={setAlisTarih} type="date" />
          <Input label="Alis Bedeli" value={alisBedel} onChange={setAlisBedel} suffix="TL" />
          <Input label="Satis Tarihi" value={satisTarih} onChange={setSatisTarih} type="date" />
          <Input label="Satis Bedeli" value={satisBedel} onChange={setSatisBedel} suffix="TL" />
          <Input label="TUFE Artis Orani" value={tufeOran} onChange={setTufeOran} suffix="%" />
        </div>
      </Card>
      <Card title="Sonuc">
        {satis > 0 ? (
          <div className="space-y-1">
            <Result label="Alis Bedeli" value={`${fmt(alis)} TL`} />
            <Result label="Endeksli Maliyet" value={`${fmt(endeksliMaliyet)} TL`} />
            <Result label="Kazanc" value={`${fmt(kazanc)} TL`} />
            <Result label="Istisna" value={`${fmt(istisna)} TL`} />
            <Result label="Matrah" value={`${fmt(matrah)} TL`} />
            <Result label="Odenecek Vergi" value={`${fmt(vergi)} TL`} highlight />
          </div>
        ) : <p className="text-gray-500 text-sm">Bilgileri girin</p>}
      </Card>
    </div>
  )
}

function KiraArtis() {
  const [mevcutKira, setMevcutKira] = useState('')
  const [tufeOran, setTufeOran] = useState('')

  const kira = Number(mevcutKira) || 0
  const oran = Number(tufeOran) || 0
  const yeniKira = kira * (1 + oran / 100)
  const artis = yeniKira - kira

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="Kira Artis Hesaplama">
        <div className="space-y-3">
          <Input label="Mevcut Kira" value={mevcutKira} onChange={setMevcutKira} suffix="TL" />
          <Input label="TUFE / Artis Orani" value={tufeOran} onChange={setTufeOran} suffix="%" />
        </div>
      </Card>
      <Card title="Sonuc">
        {kira > 0 && oran > 0 ? (
          <div className="space-y-1">
            <Result label="Mevcut Kira" value={`${fmt(kira)} TL`} />
            <Result label="Artis Orani" value={`%${oran}`} />
            <Result label="Artis Tutari" value={`${fmt(artis)} TL`} />
            <Result label="Yeni Kira" value={`${fmt(yeniKira)} TL`} highlight />
          </div>
        ) : <p className="text-gray-500 text-sm">Bilgileri girin</p>}
      </Card>
    </div>
  )
}

function DamgaVergisi() {
  const [tutar, setTutar] = useState('')
  const t = Number(tutar) || 0
  const damga = t * DAMGA_VERGISI

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="Kontrat Damga Vergisi">
        <Input label="Kontrat Tutari" value={tutar} onChange={setTutar} suffix="TL" />
      </Card>
      <Card title="Sonuc">
        {t > 0 ? (
          <div className="space-y-1">
            <Result label="Kontrat Tutari" value={`${fmt(t)} TL`} />
            <Result label={`Damga Vergisi (%${(DAMGA_VERGISI * 100).toFixed(2)})`} value={`${fmt(damga)} TL`} highlight />
          </div>
        ) : <p className="text-gray-500 text-sm">Tutar girin</p>}
      </Card>
    </div>
  )
}

function IzinHesap() {
  const [giris, setGiris] = useState('')
  const [kullanilanGun, setKullanilanGun] = useState('0')
  const [brut, setBrut] = useState('')

  const bugun = new Date()
  const girisDate = giris ? new Date(giris) : null
  const yil = girisDate ? (bugun - girisDate) / (365.25 * 24 * 60 * 60 * 1000) : 0
  
  let hakEdilen = 0
  if (yil >= 1 && yil < 5) hakEdilen = 14
  else if (yil >= 5 && yil < 15) hakEdilen = 20
  else if (yil >= 15) hakEdilen = 26

  const kalan = Math.max(0, hakEdilen - Number(kullanilanGun))
  const gunlukUcret = (Number(brut) || 0) / 30
  const izinUcreti = kalan * gunlukUcret

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="Ucretli Izin Hesaplama">
        <div className="space-y-3">
          <Input label="Ise Giris Tarihi" value={giris} onChange={setGiris} type="date" />
          <Input label="Kullanilan Izin Gunu" value={kullanilanGun} onChange={setKullanilanGun} />
          <Input label="Brut Ucret" value={brut} onChange={setBrut} suffix="TL" />
        </div>
      </Card>
      <Card title="Sonuc">
        {yil >= 1 ? (
          <div className="space-y-1">
            <Result label="Calisma Suresi" value={`${yil.toFixed(1)} yil`} />
            <Result label="Yillik Izin Hakki" value={`${hakEdilen} gun`} />
            <Result label="Kullanilan" value={`${kullanilanGun} gun`} />
            <Result label="Kalan Izin" value={`${kalan} gun`} />
            {Number(brut) > 0 && <Result label="Izin Ucreti" value={`${fmt(izinUcreti)} TL`} highlight />}
          </div>
        ) : <p className="text-gray-500 text-sm">{giris ? '1 yildan az kidem - izin hakki yok' : 'Bilgileri girin'}</p>}
      </Card>
    </div>
  )
}

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
          <Input label="Ise Giris Tarihi" value={iseGiris} onChange={setIseGiris} type="date" />
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
            <Result label="Gerekli Prim Gunu" value={`${primGunLimit} gun`} />
            <Result label="Mevcut Prim" value={`${mevcutPrim} gun`} />
            <Result label="Kalan Prim" value={`${kalanPrim} gun`} highlight />
            <p className="text-gray-500 text-[10px] mt-2">Bu hesaplama yaklasik degerdir. Kesin sonuc icin SGK'ya basvurun.</p>
          </div>
        ) : <p className="text-gray-500 text-sm">Bilgileri girin</p>}
      </Card>
    </div>
  )
}

function BorclanmaHesabi() {
  const [gun, setGun] = useState('')
  const [pek, setPek] = useState('')

  const g = Number(gun) || 0
  const p = Number(pek) || 0
  const borcTutar = g * p * 0.32 // %32 alt sinir
  const borcUst = g * p * 0.45 // %45 ust sinir

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
            <Result label="Gunluk PEK" value={`${fmt(p)} TL`} />
            <Result label="Borclanma (Alt %32)" value={`${fmt(borcTutar)} TL`} />
            <Result label="Borclanma (Ust %45)" value={`${fmt(borcUst)} TL`} highlight />
          </div>
        ) : <p className="text-gray-500 text-sm">Bilgileri girin</p>}
      </Card>
    </div>
  )
}

function SSKHisseHesabi() {
  const [brut, setBrut] = useState('')
  const [calTip, setCalTip] = useState('normal')

  const b = Number(brut) || 0
  const sgkMatrah = Math.min(b, SGK_TAVAN)
  const sgkIsci = sgkMatrah * SGK_ISCI
  const issizlikIsci = sgkMatrah * SGK_ISSIZLIK_ISCI
  const sgkIsveren = sgkMatrah * SGK_ISVEREN
  const issizlikIsveren = sgkMatrah * SGK_ISSIZLIK_ISVEREN
  const toplamIsci = sgkIsci + issizlikIsci
  const toplamIsveren = sgkIsveren + issizlikIsveren
  const genelToplam = toplamIsci + toplamIsveren

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="SSK Isci + Isveren Hisseleri">
        <div className="space-y-3">
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
            <Result label="SGK Matrahi" value={`${fmt(sgkMatrah)} TL`} />
            <div className="my-1 border-t border-blue-700/30" />
            <p className="text-yellow-400/70 text-xs font-semibold">Isci Hissesi</p>
            <Result label="SGK Isci (%14)" value={`${fmt(sgkIsci)} TL`} />
            <Result label="Issizlik Isci (%1)" value={`${fmt(issizlikIsci)} TL`} />
            <Result label="Toplam Isci" value={`${fmt(toplamIsci)} TL`} highlight />
            <div className="my-1 border-t border-blue-700/30" />
            <p className="text-yellow-400/70 text-xs font-semibold">Isveren Hissesi</p>
            <Result label="SGK Isveren (%20.5)" value={`${fmt(sgkIsveren)} TL`} />
            <Result label="Issizlik Isveren (%2)" value={`${fmt(issizlikIsveren)} TL`} />
            <Result label="Toplam Isveren" value={`${fmt(toplamIsveren)} TL`} highlight />
            <div className="my-1 border-t border-blue-700/30" />
            <Result label="Genel Toplam" value={`${fmt(genelToplam)} TL`} highlight />
          </div>
        ) : <p className="text-gray-500 text-sm">Brut ucret girin</p>}
      </Card>
    </div>
  )
}

function KDVHesapMakinesi() {
  const [tutar, setTutar] = useState('')
  const [kdvOran, setKdvOran] = useState('20')
  const [yon, setYon] = useState('haric')

  const t = Number(tutar) || 0
  const oran = Number(kdvOran) / 100
  
  let kdvTutar, kdvHaric, kdvDahil
  if (yon === 'haric') {
    kdvHaric = t
    kdvTutar = t * oran
    kdvDahil = t + kdvTutar
  } else {
    kdvDahil = t
    kdvHaric = t / (1 + oran)
    kdvTutar = kdvDahil - kdvHaric
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="KDV Hesap Makinesi">
        <div className="space-y-3">
          <Select label="Hesaplama" value={yon} onChange={setYon} options={[
            { value: 'haric', label: 'KDV Haric → Dahil' },
            { value: 'dahil', label: 'KDV Dahil → Haric' }
          ]} />
          <Input label="Tutar" value={tutar} onChange={setTutar} suffix="TL" />
          <Select label="KDV Orani" value={kdvOran} onChange={setKdvOran} options={[
            { value: '1', label: '%1' },
            { value: '10', label: '%10' },
            { value: '20', label: '%20' }
          ]} />
        </div>
      </Card>
      <Card title="Sonuc">
        {t > 0 ? (
          <div className="space-y-1">
            <Result label="KDV Haric Tutar" value={`${fmt(kdvHaric)} TL`} />
            <Result label={`KDV (%${kdvOran})`} value={`${fmt(kdvTutar)} TL`} />
            <Result label="KDV Dahil Tutar" value={`${fmt(kdvDahil)} TL`} highlight />
          </div>
        ) : <p className="text-gray-500 text-sm">Tutar girin</p>}
      </Card>
    </div>
  )
}

function TevkifatliStopajliFatura() {
  const [tutar, setTutar] = useState('')
  const [kdvOran, setKdvOran] = useState('20')
  const [tip, setTip] = useState('tevkifat')
  const [tevOran, setTevOran] = useState('50')
  const [stopajOran, setStopajOran] = useState('20')

  const t = Number(tutar) || 0
  const kdv = Number(kdvOran) / 100
  const kdvTutar = t * kdv

  let sonuc = {}
  if (tip === 'tevkifat') {
    const tevkifat = Number(tevOran) / 100
    const tevkifatTutar = kdvTutar * tevkifat
    const odenecekKdv = kdvTutar - tevkifatTutar
    sonuc = {
      kdvTutar,
      tevkifatTutar,
      odenecekKdv,
      toplam: t + odenecekKdv
    }
  } else {
    const stopaj = Number(stopajOran) / 100
    const stopajTutar = t * stopaj
    sonuc = {
      kdvTutar,
      stopajTutar,
      netTutar: t - stopajTutar,
      toplam: t + kdvTutar - (t * stopaj)
    }
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="Tevkifatli / Stopajli Fatura">
        <div className="space-y-3">
          <Select label="Fatura Tipi" value={tip} onChange={setTip} options={[
            { value: 'tevkifat', label: 'Tevkifatli Fatura' },
            { value: 'stopaj', label: 'Stopajli Fatura' }
          ]} />
          <Input label="Fatura Tutari (KDV Haric)" value={tutar} onChange={setTutar} suffix="TL" />
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
            <Result label="Matrah" value={`${fmt(t)} TL`} />
            <Result label={`KDV (%${kdvOran})`} value={`${fmt(sonuc.kdvTutar)} TL`} />
            {tip === 'tevkifat' ? (
              <>
                <Result label={`Tevkifat (${tevOran}/100)`} value={`${fmt(sonuc.tevkifatTutar)} TL`} />
                <Result label="Odenecek KDV" value={`${fmt(sonuc.odenecekKdv)} TL`} />
                <Result label="Fatura Toplam" value={`${fmt(sonuc.toplam)} TL`} highlight />
              </>
            ) : (
              <>
                <Result label={`Stopaj (%${stopajOran})`} value={`${fmt(sonuc.stopajTutar)} TL`} />
                <Result label="Net Tutar" value={`${fmt(sonuc.netTutar)} TL`} />
                <Result label="Tahsil Edilecek" value={`${fmt(sonuc.toplam)} TL`} highlight />
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
      { id: 'deger_artis', label: 'Bina Deger Artis Kazanci', comp: DegerArtisKazanci },
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
            ← Tum Hesaplamalar
          </button>
          
          {/* Ayni kategorideki diger hesaplamalar */}
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
