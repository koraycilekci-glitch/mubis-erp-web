import { useState, useEffect, useRef, Fragment } from 'react'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import { supabase } from '../lib/supabase'
import { Link, useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { bulkAddClients, addClient, updateClient } from '../services/clientService'
import { lucaFirmalariGetir } from '../services/lucaFirmaService'
import { naceSadeceKod, naceAciklama } from '../utils/naceCodes'
import { gibLucaSorguDurdur } from '../utils/gibOdemeHelper'
import {
  Plus, Search, Filter, MapPin,
  Trash2, X, Eye, ListChecks, FileText,
  Users, Building2, UserCheck, ChevronLeft,
  Upload, Download, RefreshCw, Loader2
} from 'lucide-react'

export default function MusteriListesi() {
  const { user, deleteClient } = useAuth()
  const { clients, loading, error, refresh } = useClients()

  // 2.7.522: Luca firmasi mevcut musterilerde zaten var mi?
  // (VKN/TCKN birebir veya normalize unvan eslesmesi — lucaFirmaKaydet ile ayni mantik)
  // 2.7.523: sirket unvanli Luca firmasi (LTD/A.Ş./ŞTİ) sahıs kartlarıyla eslesmez.
  const lucaZatenVar = (f) => {
    const normAd = (s) => String(s || '').toLocaleLowerCase('tr').replace(/[^a-z0-9çğıöşü ]/gi, '').replace(/\s+/g, ' ').trim()
    const ozAd = (s) => normAd(s)
      .replace(/\b(a\.?ş\.?|a\.?s\.?|ltd\.?|şti\.?|sti\.?|tic\.?|san\.?|ve|limited|anonim|sirket)\b/g, '')
      .replace(/\s+/g, ' ').trim()
    const kimlik = f.kimlik || f.vkn || f.tckn
    const sirketUnvan = /\b(LTD|A\.Ş|A\.S|ŞTİ|STI|TİC|TIC|SAN|HOLDİNG)\b/i.test(f.ad || '')
    const aday = (clients || []).find(c =>
      (kimlik && (String(c.vkn || '') === String(kimlik) || String(c.tc || '') === String(kimlik))) ||
      normAd(c.shortName) === normAd(f.ad) || normAd(c.name) === normAd(f.ad) ||
      ozAd(c.shortName) === ozAd(f.ad) || ozAd(c.name) === ozAd(f.ad) ||
      (() => { const a = ozAd(c.shortName || c.name), b = ozAd(f.ad); return a.length >= 6 && b.length >= 6 && (a.includes(b) || b.includes(a)) })()
    )
    if (!aday) return false
    if (sirketUnvan && (aday.type === 'individual' || (aday.tc && !aday.vkn))) return false
    return true
  }
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterTax, setFilterTax] = useState('all')
  const [showFilters, setShowFilters] = useState(false)
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState('asc')
  const [uploading, setUploading] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const fileInputRef = useRef(null)

  // 2.7.473: LUCA'DAN FIRMALARI GETIR — yardimci program Luca Musavir
  // Paketi'ndeki firma listesini okur; ici aktarma penceresinde her firma
  // icin ayni anda GİB (VD) ve SGK kimlik bilgileri girilir/kaydedilir
  // (lisansli otomasyon yaziliminin firma+tam yetki akisi gibi).
  const [lucaGetir, setLucaGetir] = useState({ acik: false, yukleniyor: false, hata: '', firmalar: [] })
  const [lucaIlerleme, setLucaIlerleme] = useState(null)
  const [lucaKaydediyor, setLucaKaydediyor] = useState(false)

  const lucaSorguDurdur = async () => {
    const gitti = await gibLucaSorguDurdur()
    if (!gitti) {
      setLucaGetir(g => ({ ...g, hata: 'Durdurma isteği gönderilemedi — yardımcı program yanıtsız.' }))
      return
    }
    setLucaGetir(g => ({ ...g, durduruluyor: true }))
  }

  const lucaFirmalariAc = async () => {
    setLucaGetir({ acik: true, yukleniyor: true, hata: '', firmalar: [], durduruluyor: false })
    setLucaIlerleme(null)
    try {
      const res = await lucaFirmalariGetir(d => setLucaIlerleme(d))
      if (!res.ok) {
        const nedenler = {
          'kurulu-degil': 'Yardımcı program bu bilgisayarda çalışmıyor.',
          'erisim-engelli': 'Yardımcı programın eski sürümü çalışıyor — güncellemeyi bekleyin/başlatın.',
          'servis-yanit-vermedi': 'Yardımcı program yanıt vermedi.'
        }
        setLucaGetir(g => ({ ...g, yukleniyor: false, hata: nedenler[res.reason] || ('Luca listesi alınamadı: ' + (res.reason || 'bilinmeyen')) }))
        return
      }
      if (res.durduruldu && res.firmalar?.length) {
        // Kullanıcı durdurdu: o ana kadar okunan firmalar tabloda gösterilir
        setLucaGetir(g => ({
          ...g, yukleniyor: false, detayli: true, durduruluyor: false,
          uyari: `Sorgulama durduruldu — ${res.firmalar.length} firma okundu, ${res.durdurulan || 0} firma atlandı. İsterseniz kaydedebilir veya tekrar sorgulayabilirsiniz.`,
          firmalar: res.firmalar.map(f => ({
            secili: true, ad: f.ad, kisaAd: f.kisaAd || '', kimlik: f.kimlik || '',
            vkn: f.vkn || '', tckn: f.tckn || '',
            vergiDairesi: f.vergiDairesi || '', kullaniciAdi: f.kullaniciAdi || '',
            adres: f.adres || '', telefon: f.telefon || '', ePosta: f.ePosta || '',
            ticaretSicilNo: f.ticaretSicilNo || '', sirketTipi: f.sirketTipi || '',
            iseBaslama: f.iseBaslama || '', kapanisTarihi: f.kapanisTarihi || '',
            faaliyetKodu: f.faaliyetKodu || '', faaliyetAlani: f.faaliyetAlani || '',
            kurulusTarihi: f.kurulusTarihi || '',
            defterTipi: f.defterTipi || '', alanlar: f.alanlar || {},
            sgkKayitlari: f.sgkKayitlari || [],
            vdSifre: f.vdSifreOtomatik || '', sgkUser: f.sgkKullanici || '', sgkSifre: f.sgkSistemSifre || '',
            gibKullanici: f.gibKullanici || '', gibParola: f.gibParola || '',
            sgkIsyeriKodu: f.sgkIsyeriKodu || '', sgkIsyeriSifresi: f.sgkIsyeriSifresi || ''
          })).map(f => { const z = lucaZatenVar(f); return { ...f, secili: !z, zatenVar: z } })
        }))
        return
      }
      if (!res.firmalar?.length) {
        setLucaGetir(g => ({ ...g, yukleniyor: false, hata: 'Luca\'da firma bulunamadı.' }))
        return
      }
      // 2.7.497: Luca'dan sifre okunamadiginda kullaniciyi uyaran tani mesaji
      const sifreUyari = res.vdSifreli === 0 && res.sgkli === 0
        ? 'GİB (VD) ve SGK şifreleri Luca\'dan okunamadı — Luca\'da aktif şirketin "Beyannameler → Toplu Beyanname → GİB ŞİRKET" tablosu ve E-Bildirge tanımları kontrol edilmeli. Diğer bilgiler yine de kaydedilebilir.'
        : (res.vdSifreli === 0 ? 'GİB (VD) şifreleri Luca\'dan okunamadı (GİB ŞİRKET tablosu boş/bulunamadı).' : '')
      setLucaGetir(g => ({
        ...g, yukleniyor: false, detayli: res.detayli !== false,
        uyari: sifreUyari || g.uyari || '',
        firmalar: res.firmalar.map(f => ({
          secili: true, ad: f.ad, kisaAd: f.kisaAd || '', kimlik: f.kimlik || '',
          vkn: f.vkn || '', tckn: f.tckn || '',
          vergiDairesi: f.vergiDairesi || '', kullaniciAdi: f.kullaniciAdi || '',
          adres: f.adres || '', telefon: f.telefon || '', ePosta: f.ePosta || '',
          ticaretSicilNo: f.ticaretSicilNo || '', sirketTipi: f.sirketTipi || '',
          iseBaslama: f.iseBaslama || '', kapanisTarihi: f.kapanisTarihi || '',
          faaliyetKodu: f.faaliyetKodu || '', faaliyetAlani: f.faaliyetAlani || '',
          kurulusTarihi: f.kurulusTarihi || '',
          defterTipi: f.defterTipi || '', alanlar: f.alanlar || {},
          sgkKayitlari: f.sgkKayitlari || [],
          // 2.7.482: Luca'daki TOPLU BEYANNAME ve E-Bildirge tablolarindan okunan
          // sifreler alanlara on-doldurulur (kullanici degistirebilir)
          vdSifre: f.vdSifreOtomatik || '', sgkUser: f.sgkKullanici || '', sgkSifre: f.sgkSistemSifre || '',
          gibKullanici: f.gibKullanici || '', gibParola: f.gibParola || '',
          sgkIsyeriKodu: f.sgkIsyeriKodu || '', sgkIsyeriSifresi: f.sgkIsyeriSifresi || ''
        })).map(f => { const z = lucaZatenVar(f); return { ...f, secili: !z, zatenVar: z } })
      }))
    } catch (e) {
      setLucaGetir(g => ({ ...g, yukleniyor: false, hata: 'Hata: ' + (e?.message || e) }))
    }
  }

  const lucaFirmaKaydet = async () => {
    const normAd = (s) => String(s || '').toLocaleLowerCase('tr').replace(/[^a-z0-9çğıöşü ]/gi, '').replace(/\s+/g, ' ').trim()
    // 2.7.498: tabloya girmis olabilecek mükerrer satirlar kayitta tek cumlenir
    // (ayni VKN/TCKN, kimlik yoksa ayni normalize unvan)
    const mAnahtar = (f) => {
      const k = f.tckn || f.vkn || f.kimlik
      if (k && /^\d{10,11}$/.test(k)) return 'k' + k
      return 'a' + normAd(f.ad)
    }
    const gorulen = new Set()
    const secilen = lucaGetir.firmalar.filter(f => {
      if (!f.secili) return false
      const k = mAnahtar(f)
      if (gorulen.has(k)) return false
      gorulen.add(k)
      return true
    })
    if (!secilen.length) return
    // 2.7.498: Luca tarihleri GG/AA/YYYY gelir — Supabase tarih kolonlari ISO ister
    const isoTarih = (s) => {
      const m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(String(s || '').trim())
      return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''
    }
    // 2.7.498: vergi türü saptamasi — eskiden herkese "Kurumlar Vergisi"
    // yaziliyordu. TCKN'li / işletme-serbest meslek-basit usul defterli /
    // hukuki mahiyeti şahıs / unvanında şirket eki olmayan → Gelir Vergisi;
    // unvaninda LTD/A.Ş/ŞTİ vb. olan → Kurumlar Vergisi.
    const vergiTuru = (f) => {
      const kimlik = f.tckn || f.kimlik || ''
      if (String(kimlik).length === 11) return 'Gelir Vergisi'
      const dt = String(f.defterTipi || '').toLocaleLowerCase('tr')
      if (dt.includes('işletme') || dt.includes('isletme') || dt.includes('serbest') || dt.includes('basit')) return 'Gelir Vergisi'
      if (f.sirketTipi && /şahıs|sahis/i.test(f.sirketTipi)) return 'Gelir Vergisi'
      const sirketMi = /\b(LTD|A\.Ş|A\.S|ŞTİ|STI|TİC|TIC|SAN|HOLDİNG|KOOP|KOLL)\b/i.test(f.ad || '')
      return sirketMi ? 'Kurumlar Vergisi' : 'Gelir Vergisi'
    }
    setLucaKaydediyor(true)
    try {
      // Unvan kiyaslarken sirket eklerini kis (A.Ş., LTD. ŞTİ. vb. farklari
      // ayni firmayi iki musteri yapmasin)
      const ozAd = (s) => normAd(s)
        .replace(/\b(a\.?ş\.?|a\.?s\.?|ltd\.?|şti\.?|sti\.?|tic\.?|san\.?|ve|limited|anonim|sirket)\b/g, '')
        .replace(/\s+/g, ' ').trim()
      const mevcut = clients || []
      let eklendi = 0, guncellendi = 0
      for (const f of secilen) {
        // 2.7.523: şirket unvanlı Luca firması şahıs kartına yazılmaz —
        // yanlış VKN bir kere şahıs kartına yazıldıysa her Luca aktarımı aynı
        // kartı tekrar "güncelliyordu"; bu koruma o zinciri kırar.
        const sirketUnvanli = /\b(LTD|A\.Ş|A\.S|ŞTİ|STI|TİC|TIC|SAN|HOLDİNG)\b/i.test(f.ad || '')
        // 2.7.474: mukerrer yukleme korumasi — eslesen bul:
        // 1) VKN/TCKN birebir, 2) normalize unvan birebir,
        // 3) oz unvan birebir, 4) karsilikli icerme (uzunluk >= 6)
        const eslesenHam =
          (f.kimlik && mevcut.find(c => String(c.vkn || '') === f.kimlik || String(c.tc || '') === f.kimlik)) ||
          mevcut.find(c => normAd(c.shortName) === normAd(f.ad) || normAd(c.name) === normAd(f.ad)) ||
          mevcut.find(c => ozAd(c.shortName) === ozAd(f.ad) || ozAd(c.name) === ozAd(f.ad)) ||
          mevcut.find(c => {
            const a = ozAd(c.shortName || c.name), b = ozAd(f.ad)
            return a.length >= 6 && b.length >= 6 && (a.includes(b) || b.includes(a))
          })
        const eslesen = (eslesenHam && sirketUnvanli && (eslesenHam.type === 'individual' || (eslesenHam.tc && !eslesenHam.vkn))) ? null : eslesenHam
        // Sadece kullanici girilen alanlari yaz; bos birakilanlar mevcut degeri KORUR
        // 2.7.476: Luca'dan okunan vergi dairesi, defter turu ve tum musteri
        // bilgileri alanlari da ilgili yerlere yazilir (admin onayindan sonra).
        const yamalar = {}
        // 2.7.498: VKN ve TCKN AYRI ayrı yazilir — şahıs mükellefin ikisi de dolabilir
        const yeniVkn = f.vkn || (f.kimlik && f.kimlik.length === 10 ? f.kimlik : '')
        const yeniTc = f.tckn || (f.kimlik && f.kimlik.length === 11 ? f.kimlik : '')
        if (yeniTc) yamalar.tc = yeniTc
        if (yeniVkn) yamalar.vkn = yeniVkn
        // 2.7.498: vergi türü düzeltmesi — mevcut kayitta yanlışsa güncellenir
        const dogruVergiTuru = vergiTuru(f)
        if (dogruVergiTuru && eslesen?.taxType !== dogruVergiTuru) yamalar.taxType = dogruVergiTuru
        if (f.vergiDairesi) yamalar.taxOffice = f.vergiDairesi
        if (f.defterTipi) {
          yamalar.defterTipi = f.defterTipi
          if (f.defterTipi === 'Serbest Meslek') yamalar.serbestMeslek = true
        }
        // 2.7.482: Luca kimlik tablolarindan gelen ek bilgiler lucaBilgileri'nde saklanir
        const lb = { ...(f.alanlar || {}) }
        if (f.gibKullanici) lb['GİB Kullanıcı Adı'] = f.gibKullanici
        if (f.gibParola) lb['GİB Parola'] = f.gibParola
        if (f.sgkIsyeriKodu) lb['SGK İşyeri Kodu'] = f.sgkIsyeriKodu
        if (f.sgkIsyeriSifresi) lb['SGK İşyeri Şifresi'] = f.sgkIsyeriSifresi
        // 2.7.503: birden fazla SGK numarasi (isyeri) — tüm hesaplar listeye yazilir;
        // birinci hesap yamalardaki sgk* kart alanlarina (mevcut davranis) gider.
        if (Array.isArray(f.sgkKayitlari) && f.sgkKayitlari.length > 1) {
          lb.sgkHesaplar = f.sgkKayitlari.map((s, j) => ({
            isyeri: s.isyeri || '',
            kullanici: (j === 0 ? (f.sgkUser || s.kadi || '') : (s.kadi || '')),
            isyeriKodu: (j === 0 ? (f.sgkIsyeriKodu || s.isyeriKodu || '') : (s.isyeriKodu || '')),
            sistemSifresi: (j === 0 ? (f.sgkSifre || s.sistemSifresi || '') : (s.sistemSifresi || '')),
            isyeriSifresi: (j === 0 ? (f.sgkIsyeriSifresi || s.isyeriSifresi || '') : (s.isyeriSifresi || ''))
          }))
        }
        if (Object.keys(lb).length) yamalar.lucaBilgileri = lb
        // 2.7.479: Luca'dan okunan adres, telefon ve e-posta musteri kartina yazilir
        if (f.adres) yamalar.address = f.adres
        if (f.telefon) yamalar.phone = f.telefon
        if (f.ePosta) yamalar.email = f.ePosta
        // 2.7.498: işe başlama / kapanış / NACE müşteri kartina yazilir
        const isoBas = isoTarih(f.iseBaslama)
        const isoKapanis = isoTarih(f.kapanisTarihi)
        if (isoBas) yamalar.openDate = isoBas
        if (isoKapanis) yamalar.closeDate = isoKapanis
        // Luca "711101 - ACIKLAMA" birleşik gönderebilir: kod ve açıklama ayrı alanlara
        const naceKod = naceSadeceKod(f.faaliyetKodu)
        const naceAck = naceAciklama(f.faaliyetKodu)
        if (f.faaliyetKodu) yamalar.naceCode = naceKod
        if (f.faaliyetAlani) yamalar.naceDesc = f.faaliyetAlani
        else if (naceAck && naceAck !== naceKod) yamalar.naceDesc = naceAck
        // 2.7.480: ticaret sicil no dogrudan musteri kartina, kurulus tarihi /
        // faaliyet kodu / MERSIS / sirket tipi lucaBilgileri icinde saklanir
        if (f.ticaretSicilNo) yamalar.ticaretSicilNo = f.ticaretSicilNo
        // 2.7.496: KURUM ERISIMI alanlarina yaz — kart "Kurum Erisimi >
        // Portal Sifreleri" bolumunde bu alanlari gosterir (dvs*, sgk*).
        if (f.vdSifre || f.gibKullanici) yamalar.dvsUsername = f.gibKullanici || f.kimlik || eslesen?.dvsUsername || ''
        if (f.vdSifre) yamalar.dvsPassword = f.vdSifre
        if (f.sgkUser) yamalar.sgkUser = f.sgkUser
        if (f.sgkIsyeriKodu) yamalar.sgkIsyeriKodu = f.sgkIsyeriKodu
        if (f.sgkSifre) yamalar.sgkSistemSifre = f.sgkSifre
        // Luca verisi "sgkIsyeriSifresi" (son harf i); kart alani "sgkIsyeriSifre"
        if (f.sgkIsyeriSifresi) yamalar.sgkIsyeriSifre = f.sgkIsyeriSifresi
        if (eslesen) {
          if (Object.keys(yamalar).length) await updateClient(eslesen.id, yamalar)
          guncellendi++
        } else {
          const ad = f.ad
          await addClient({
            name: ad,
            shortName: f.kisaAd || (ad.length > 24 ? ad.split(' ').slice(0, 2).join(' ') : ad),
            vkn: yeniVkn,
            tc: yeniTc,
            type: yeniTc && !yeniVkn ? 'individual' : (yeniVkn ? 'company' : (vergiTuru(f) === 'Gelir Vergisi' ? 'individual' : 'company')),
            taxType: vergiTuru(f),
            taxOffice: f.vergiDairesi || '',
            defterTipi: f.defterTipi || '',
            lucaBilgileri: {
              ...(f.alanlar || {}),
              ...(f.gibKullanici ? { 'GİB Kullanıcı Adı': f.gibKullanici } : {}),
              ...(f.gibParola ? { 'GİB Parola': f.gibParola } : {}),
              ...(f.sgkIsyeriKodu ? { 'SGK İşyeri Kodu': f.sgkIsyeriKodu } : {}),
              ...(f.sgkIsyeriSifresi ? { 'SGK İşyeri Şifresi': f.sgkIsyeriSifresi } : {}),
              ...(Array.isArray(f.sgkKayitlari) && f.sgkKayitlari.length > 1 ? {
                sgkHesaplar: f.sgkKayitlari.map((s, j) => ({
                  isyeri: s.isyeri || '',
                  kullanici: (j === 0 ? (f.sgkUser || s.kadi || '') : (s.kadi || '')),
                  isyeriKodu: (j === 0 ? (f.sgkIsyeriKodu || s.isyeriKodu || '') : (s.isyeriKodu || '')),
                  sistemSifresi: (j === 0 ? (f.sgkSifre || s.sistemSifresi || '') : (s.sistemSifresi || '')),
                  isyeriSifresi: (j === 0 ? (f.sgkIsyeriSifresi || s.isyeriSifresi || '') : (s.isyeriSifresi || ''))
                }))
              } : {})
            },
            address: f.adres || '',
            phone: f.telefon || '',
            email: f.ePosta || '',
            ticaretSicilNo: f.ticaretSicilNo || '',
            openDate: isoTarih(f.iseBaslama) || null,
            closeDate: isoTarih(f.kapanisTarihi) || null,
            naceCode: f.faaliyetKodu ? naceSadeceKod(f.faaliyetKodu) : '',
            naceDesc: f.faaliyetAlani || (f.faaliyetKodu ? naceAciklama(f.faaliyetKodu) : ''),
            dvsUsername: f.gibKullanici || f.kimlik || '',
            dvsPassword: f.vdSifre || '',
            sgkUser: f.sgkUser || '',
            sgkIsyeriKodu: f.sgkIsyeriKodu || '',
            sgkSistemSifre: f.sgkSifre || '',
            sgkIsyeriSifre: f.sgkIsyeriSifresi || '',
            efatura: false, earsiv: false, esmm: false, edefter: false,
            edefterPeriod: 'aylik',
            serbestMeslek: f.defterTipi === 'Serbest Meslek',
            password: '123456'
          })
          eklendi++
        }
      }
      await refresh()
      setLucaGetir({ acik: false, yukleniyor: false, hata: '', firmalar: [] })
      alert(`Luca aktarımı tamam: ${eklendi} yeni müşteri eklendi, ${guncellendi} müşteri güncellendi.`)
    } catch (e) {
      alert('Luca aktarım hatası: ' + (e?.message || e))
    }
    setLucaKaydediyor(false)
  }

  const lucaSatirDuzelt = (i, alan, deger) => {
    setLucaGetir(g => ({
      ...g,
      firmalar: g.firmalar.map((f, k) => k === i ? { ...f, [alan]: deger } : f)
    }))
  }

  // 2.7.522: tum secim kutularini temizler (kayit yapmaz, musteri silmez)
  const lucaSecimiSil = () => {
    setLucaGetir(g => ({ ...g, firmalar: g.firmalar.map(f => ({ ...f, secili: false })) }))
  }

  // 2.7.503: çoklu SGK işyeri alt satırı düzenleme
  const lucaSgkDuzelt = (i, j, alan, deger) => {
    setLucaGetir(g => ({
      ...g,
      firmalar: g.firmalar.map((f, k) => {
        if (k !== i) return f
        const kayitlar = (f.sgkKayitlari || []).map((s, m) => m === j ? { ...s, [alan]: deger } : s)
        return { ...f, sgkKayitlari: kayitlar }
      })
    }))
  }

  const handleDelete = async (id, name) => {
    if (window.confirm(`"${name}" musterisini silmek istediginize emin misiniz?`)) {
      await deleteClient(id)
      await refresh()
    }
  }

  const toggleSelection = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const toggleAll = () => {
    if (selectedIds.length === filteredClients.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredClients.map(c => c.id))
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return
    if (!window.confirm(`${selectedIds.length} musteriyi silmek istediginize emin misiniz?`)) return
    setUploading(true)
    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .in('id', selectedIds)
      if (error) throw error
      const count = selectedIds.length
      setSelectedIds([])
      await refresh()
      alert(`${count} musteri silindi.`)
    } catch (err) {
      console.error('Toplu silme hatasi:', err)
      alert('Silme hatasi: ' + (err.message || 'Bilinmeyen hata'))
    }
    setUploading(false)
    setShowDeleteConfirm(false)
  }

  const filteredClients = clients
    .filter(client => {
      const matchSearch = 
        client.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.vkn?.includes(searchTerm) ||
        client.tc?.includes(searchTerm) ||
        client.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.phone?.includes(searchTerm) ||
        client.taxOffice?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.city?.toLowerCase().includes(searchTerm.toLowerCase())

      let matchType = true
      if (filterType === 'company') matchType = client.type === 'company'
      else if (filterType === 'individual') matchType = client.type === 'individual'

      // Kapanış tarihi olan şirketler pasif sayılır (status alanından bağımsız)
      const pasif = client.status === 'inactive' || !!(client.closeDate && String(client.closeDate).trim())
      let matchStatus = true
      if (filterStatus === 'active') matchStatus = !pasif
      else if (filterStatus === 'inactive') matchStatus = pasif

      let matchTax = true
      if (filterTax === 'kurumlar') {
        matchTax = client.taxType === 'Kurumlar Vergisi'
      } else if (filterTax === 'gelir') {
        matchTax = client.taxType === 'Gelir Vergisi'
      }

      return matchSearch && matchType && matchStatus && matchTax
    })
    .sort((a, b) => {
      let valA, valB
      switch(sortBy) {
        case 'name':
          valA = a.name || ''
          valB = b.name || ''
          break
        case 'date':
          valA = a.createdAt || ''
          valB = b.createdAt || ''
          break
        case 'type':
          valA = a.type || ''
          valB = b.type || ''
          break
        default:
          valA = a.name || ''
          valB = b.name || ''
      }
      if (sortOrder === 'asc') {
        return valA.localeCompare(valB)
      } else {
        return valB.localeCompare(valA)
      }
    })

  const stats = {
    total: clients.length,
    active: clients.filter(c => !(c.status === 'inactive' || (c.closeDate && String(c.closeDate).trim()))).length,
    companies: clients.filter(c => c.type === 'company').length,
    individuals: clients.filter(c => c.type === 'individual').length,
    kurumlar: clients.filter(c => c.taxType === 'Kurumlar Vergisi').length,
    gelir: clients.filter(c => c.taxType === 'Gelir Vergisi').length,
  }

  const istatistikBilinmiyor = !clients.length && (loading || !!error)

  const clearFilters = () => {
    setSearchTerm('')
    setFilterType('all')
    setFilterStatus('all')
    setFilterTax('all')
    setSortBy('name')
    setSortOrder('asc')
  }

  const isFilterActive = () => {
    return searchTerm !== '' || 
           filterType !== 'all' || 
           filterStatus !== 'all' || 
           filterTax !== 'all'
  }

  const downloadTemplate = () => {
    const headers = [
      'Ad Soyad / Unvan', 'Kisa Ad', 'TC', 'VKN', 'Musteri Turu', 'Telefon', 'Email',
      'Sehir', 'Ilce', 'Adres', 'Vergi Dairesi', 'Sirket Turu', 'Vergi Turu',
      'Sermaye', 'Acilis Tarihi', 'NACE Kodu', 'NACE Aciklama', 'Musteri Sinifi',
      'e-Fatura', 'e-Arsiv', 'e-SMM', 'e-Defter', 'e-Defter Periyodu', 'Serbest Meslek',
      'SGK Isyeri No', 'SGK Kullanici', 'SGK Sistem Sifre', 'SGK Isyeri Sifre',
      'DVS Kullanici', 'DVS Sifre', 'e-Arsiv Kullanici', 'e-Arsiv Sifre',
      'e-Devlet Kullanici', 'e-Devlet Sifre', 'Ticaret Sicil No',
      'KDV Beyan', 'KDV2 Beyan', 'Muhtasar Beyan', 'SGK Beyan', 'Gecici Vergi', 'Yillik Vergi',
      'Kira Bilgisi', 'Kira Kontrat Bitis'
    ]
    const ws = XLSX.utils.aoa_to_sheet([headers])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sablon')
    ws['!cols'] = headers.map(() => ({ wch: 20 }))
    XLSX.writeFile(wb, 'Mubis_Musteri_Sablonu.xlsx')
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      let data = []
      const ext = file.name.split('.').pop().toLowerCase()

      if (ext === 'csv') {
        // 2.7.504: CSV'ler çoğulukla cp1254 (Türkçe Excel) ile kaydedilir —
        // UTF-8 çözümünde bozuk karakter varsa windows-1254 ile tekrar çöz
        const buf = await file.arrayBuffer()
        let text = new TextDecoder('utf-8').decode(buf)
        if (text.includes('\uFFFD')) {
          try { text = new TextDecoder('windows-1254').decode(buf) } catch { /* tarayici desteklemiyorsa utf-8 ile devam */ }
        }
        // 2.7.504: Muhasebe ofisi listesi (LİSTE21A biçimi) — ad/soyad, tc/vkn,
        // telefon, adres, vergi dairesi, açılış/kapanış, ücretler, beyan durumları
        const buyuk = text.toLocaleUpperCase('tr')
        if (buyuk.includes('AYLIK MUHASEBE') && buyuk.includes('ADI SOYADI')) {
          const sonuc = await importListe21(text)
          alert(sonuc.mesaj)
          await refresh()
          setUploading(false)
          if (fileInputRef.current) fileInputRef.current.value = ''
          return
        }
        data = parseCSV(text)
      } else {
        data = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = (ev) => {
            try {
              const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' })
              const sheet = wb.Sheets[wb.SheetNames[0]]
              resolve(XLSX.utils.sheet_to_json(sheet))
            } catch (err) { reject(err) }
          }
          reader.readAsArrayBuffer(file)
        })
      }

      const format = detectFormat(data, ext)
      let result
      switch (format) {
        case 'gib':
          result = await importGibPasswords(data)
          alert(`${result.count} musteriye GIB sifreleri yuklendi.`)
          break
        case 'sgk':
          result = await importSgkPasswords(data)
          alert(`${result.count} musteriye SGK sifreleri yuklendi.`)
          break
        case 'luca':
          result = await importLucaClients(data)
          alert(`${result.count} musteri Luca listesinden eklendi.`)
          break
        case 'mubis':
        default:
          const mapped = data.map(row => mapMubisRow(row))
          await bulkAddClients(mapped)
          alert(`${mapped.length} musteri basariyla yuklendi!`)
      }
      await refresh()
    } catch (err) {
      console.error('Toplu yukleme hatasi:', err)
      alert('Yukleme hatasi: ' + (err.message || 'Bilinmeyen hata'))
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // 2.7.504: Muhasebe ofisi liste biçimi (LİSTE21A) — mevcut müşteri kartlarını
  // TC/VKN ile eşleştirip ad-soyad, telefon, adres, vergi dairesi, açılış/kapanış
  // tarihleri, aylık muhasebe/defter tasdik ücretleri ve beyan durumlarını yazar.
  // Yalnızca dolu hücreler yazılır; boşlar mevcut değeri korur.
  const importListe21 = async (text) => {
    const lines = text.split(/\r?\n/)
    const basIdx = lines.findIndex(l =>
      l.toLocaleUpperCase('tr').includes('ADI SOYADI') && l.toLocaleUpperCase('tr').includes('VERG'))
    if (basIdx < 0) return { mesaj: 'Liste biçimi tanınamadı — "ADI SOYADI" başlıklı satır bulunamadı.', guncellenen: 0, eslesmeyen: [] }
    const headers = lines[basIdx].split(';').map(h => h.replace(/^"|"$/g, '').trim().toLocaleUpperCase('tr'))
    const kolonIdx = (ad) => {
      const tam = headers.indexOf(ad)
      if (tam >= 0) return tam
      return headers.findIndex(h => h.includes(ad))
    }
    // Birden fazla yazım adayı (dosyadaki başlık hatalarına dayanıklı)
    const kolonIdxCok = (adlar) => {
      for (const a of adlar) { const i = headers.indexOf(a); if (i >= 0) return i }
      for (const a of adlar) { const i = headers.findIndex(h => h.includes(a)); if (i >= 0) return i }
      return -1
    }
    const hucre = (vals, ...adlar) => {
      for (const a of adlar) {
        const i = kolonIdx(a)
        if (i >= 0 && vals[i] != null) return String(vals[i]).trim()
      }
      return ''
    }
    const iso = (s) => {
      const m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(String(s || '').trim())
      return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''
    }
    const dogruMu = (s) => /^(DOĞRU|DOGRU|EVET|TRUE|X)$/i.test(String(s || '').trim())
    const bayraklar = [
      [['KDV'], 'kdv'], [['AYLIK MUHTASAR'], 'aylikMuhtasar'], [['MUHTASAR'], 'muhtasar'],
      [['SİGORTA'], 'sigorta'], [['GEÇİCİ VERGİ'], 'geciciVergi'], [['GELİR VERGİSİ'], 'gelirVergisi'],
      [['KURUMLAR VERGİSİ'], 'kurumlarVergisi'], [['POŞET'], 'poset'], [['EDEFTER'], 'edefter'],
      [['MALİ MÜHÜR', 'MALİ MÜHİR'], 'maliMuhur']
    ]
    let guncellenen = 0
    const eslesmeyen = []
    for (const line of lines.slice(basIdx + 1)) {
      if (!line.trim()) continue
      const vals = line.split(';').map(v => v.replace(/^"|"$/g, '').trim())
      const ad = hucre(vals, 'ADI SOYADI')
      const tc = hucre(vals, 'TC KİMLİK', 'TC KIMLIK').replace(/\D/g, '')
      const vkn = hucre(vals, 'VERGİ NO', 'VERGI NO').replace(/\D/g, '')
      if (!ad || (!tc && !vkn)) continue
      const eslesen = (clients || []).find(c =>
        (tc && String(c.tc || '') === tc) ||
        (vkn && (String(c.vkn || '') === vkn ||
          (c.vkn && parseInt(c.vkn, 10) === parseInt(vkn, 10)))))
      if (!eslesen) { eslesmeyen.push(ad); continue }
      const yama = {}
      if (ad) yama.name = ad
      const tel = hucre(vals, 'TELEFON'); if (tel) yama.phone = tel
      const adr = hucre(vals, 'ADRES'); if (adr) yama.address = adr
      const vd = hucre(vals, 'VERGİ DAİRESİ', 'VERGI DAIRESI'); if (vd) yama.taxOffice = vd
      const acilis = iso(hucre(vals, 'AÇILIŞ TARİHİ', 'İŞE BAŞLAMA', 'ACILIS')); if (acilis) yama.openDate = acilis
      const kapanis = iso(hucre(vals, 'KAPANIŞ TARİHİ', 'KAPANIS')); if (kapanis) yama.closeDate = kapanis
      const lb = { ...(eslesen.lucaBilgileri || {}) }
      const ucret = hucre(vals, 'AYLIK MUHASEBE ÜCRETİ', 'AYLIK MUHASEBE UCRETI'); if (ucret) lb.muhasebeUcreti = ucret
      const tasdik = hucre(vals, 'DEFTER TASDİK ÜCRETİ', 'DEFTER TASDIK'); if (tasdik) lb.defterTasdikUcreti = tasdik
      const kalan = hucre(vals, 'ÖNCEDEN KALAN', 'NCEDEN KALAN', 'ONCEDEN KALAN'); if (kalan) lb.oncekiKalan = kalan
      const bd = {}
      for (const [basliklar, anahtar] of bayraklar) {
        const i = kolonIdxCok(basliklar)
        if (i >= 0 && vals[i] != null && String(vals[i]).trim()) bd[anahtar] = dogruMu(vals[i])
      }
      if (Object.keys(bd).length) lb.beyanDurumlari = { ...(lb.beyanDurumlari || {}), ...bd }
      if (Object.keys(lb).length) yama.lucaBilgileri = lb
      const { error } = await supabase.from('clients').update(yama).eq('id', eslesen.id)
      if (!error) guncellenen++
      else eslesmeyen.push(`${ad} (yazım hatası: ${error.message})`)
    }
    let mesaj = `${guncellenen} müşteri kartı güncellendi.`
    if (eslesmeyen.length) mesaj += ` Eşleşmeyen (${eslesmeyen.length}): ${eslesmeyen.slice(0, 8).join(', ')}${eslesmeyen.length > 8 ? '…' : ''}`
    return { mesaj, guncellenen, eslesmeyen }
  }

  const parseCSV = (text) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    if (lines.length === 0) return []
    const delimiter = lines[0].includes(';') ? ';' : ','
    const firstRow = lines[0].split(delimiter).map(v => v.replace(/^"|"$/g, '').trim())

    // Eger ilk satir tamamen sayi/sifre gibi gorunuyorsa baslik yoktur
    const looksLikeData = firstRow.every(v => /^[0-9A-Za-z]+$/.test(v) && v.length > 0)

    let headers
    if (looksLikeData) {
      headers = firstRow.map((_, i) => `col_${i}`)
    } else {
      headers = firstRow
    }

    const startIdx = looksLikeData ? 0 : 1
    return lines.slice(startIdx).map(line => {
      const values = line.split(delimiter).map(v => v.replace(/^"|"$/g, '').trim())
      const obj = {}
      headers.forEach((h, i) => { obj[h] = values[i] })
      return obj
    })
  }

  const detectFormat = (data, ext) => {
    if (!data.length) return 'mubis'
    const cols = Object.keys(data[0]).map(c => c.toLowerCase().trim())
    const colSet = new Set(cols)

    if (ext === 'csv' || colSet.has('sgk sistem sifresi') || colSet.has('isyeri kodu')) return 'sgk'
    if (colSet.has('kullanici adi') && colSet.has('parola')) return 'gib'
    if (colSet.has('kisa ad') || colSet.has('kisaltma') || colSet.has('uzun ad')) return 'luca'
    return 'mubis'
  }

  const mapMubisRow = (row) => ({
    name: row['Ad Soyad / Unvan'] || row['Ad Soyad'] || row['Unvan'] || '',
    shortName: row['Kisa Ad'] || '',
    tc: row['TC'] || '',
    vkn: row['VKN'] || '',
    type: String(row['Musteri Turu'] || 'individual').toLowerCase().includes('sirket') ? 'company' : 'individual',
    phone: row['Telefon'] || '',
    email: row['Email'] || '',
    city: row['Sehir'] || '',
    district: row['Ilce'] || '',
    address: row['Adres'] || '',
    taxOffice: row['Vergi Dairesi'] || '',
    companyType: row['Sirket Turu'] || 'ltd',
    taxType: row['Vergi Turu'] || 'Gelir Vergisi',
    capital: row['Sermaye'] || '',
    openDate: row['Acilis Tarihi'] || '',
    naceCode: row['NACE Kodu'] || '',
    naceDesc: row['NACE Aciklama'] || '',
    musteriSinifi: row['Musteri Sinifi'] || '',
    efatura: row['e-Fatura'] || 'hayir',
    earsiv: row['e-Arsiv'] || 'hayir',
    esmm: row['e-SMM'] || 'hayir',
    edefter: row['e-Defter'] || 'hayir',
    edefterPeriod: row['e-Defter Periyodu'] || 'aylik',
    serbestMeslek: row['Serbest Meslek'] || 'hayir',
    sgkIsyeriKodu: row['SGK Isyeri No'] || '',
    sgkUser: row['SGK Kullanici'] || '',
    sgkSistemSifre: row['SGK Sistem Sifre'] || '',
    sgkIsyeriSifre: row['SGK Isyeri Sifre'] || '',
    dvsUsername: row['DVS Kullanici'] || '',
    dvsPassword: row['DVS Sifre'] || '',
    earsivUser: row['e-Arsiv Kullanici'] || '',
    earsivPass: row['e-Arsiv Sifre'] || '',
    edevletUser: row['e-Devlet Kullanici'] || '',
    edevletPass: row['e-Devlet Sifre'] || '',
    ticaretSicilNo: row['Ticaret Sicil No'] || '',
    kdvBeyan: row['KDV Beyan'] || 'aylik',
    kdv2Beyan: row['KDV2 Beyan'] || 'aylik',
    muhtasarBeyan: row['Muhtasar Beyan'] || 'yok',
    sgkBeyan: row['SGK Beyan'] || 'aylik',
    geciciVergi: row['Gecici Vergi'] || 'evet',
    yillikVergi: row['Yillik Vergi'] || 'evet',
    kiraBilgisi: row['Kira Bilgisi'] || '',
    kiraKontratBitis: row['Kira Kontrat Bitis'] || '',
    password: '123456'
  })

  const importLucaClients = async (data) => {
    const mapped = data.map(row => ({
      name: row['Uzun Ad'] || row['Kısa Ad'] || row['Kisa Ad'] || '',
      shortName: row['Kısa Ad'] || row['Kisa Ad'] || '',
      tc: row['T.C. Kimlik Numarası'] || row['T.C. Kimlik'] || row['T.C.'] || row['TC'] || '',
      vkn: row['Vergi No'] || '',
      taxNo: row['Vergi No'] || '',
      type: (() => {
        const tcVal = row['T.C. Kimlik Numarası'] || row['T.C. Kimlik'] || row['T.C.'] || row['TC'] || ''
        const vknVal = row['Vergi No'] || ''
        const nameVal = row['Uzun Ad'] || row['Kısa Ad'] || row['Kisa Ad'] || ''
        const isDernekByName = /\b(DERNEĞİ|DERNEK|DERNEGI|DERNEKİ)\b/i.test(nameVal)
        const isApartmentByName = /\b(APARTMAN\s+YÖNETİMİ|APARTMAN\s+YONETIMI|SİTE\s+YÖNETİMİ|SITE\s+YONETIMI|APARTMAN|SİTESİ|SITESI)\b/i.test(nameVal)
        const isCompanyByName = /\b(LTD|A\.Ş|A\.S|ŞTİ|STI|TİC|TIC|SAN|HOLDİNG|GROUP|KOOP|KOLL)\b/i.test(nameVal)
        const isAdiOrtaklikByName = /(\bve\s+ort\b|\bve\s+ort\.|\bort\b|\badi\s+ortaklik\b|\bortaklığı\b|\bortakligi\b)/i.test(nameVal)
        // Unvana gore ozel turler once
        if (isDernekByName) return 'dernek'
        if (isApartmentByName) return 'apartman_yonetimi'
        if (isAdiOrtaklikByName) return 'adi_ortaklik'
        if (tcVal.length === 11) return 'individual'
        if (vknVal.length === 10 || isCompanyByName) return 'company'
        return 'individual'
      })(),
      taxType: (() => {
        const tcVal = row['T.C. Kimlik Numarası'] || row['T.C. Kimlik'] || row['T.C.'] || row['TC'] || ''
        const vknVal = row['Vergi No'] || ''
        const nameVal = row['Uzun Ad'] || row['Kısa Ad'] || row['Kisa Ad'] || ''
        const isDernekByName = /\b(DERNEĞİ|DERNEK|DERNEGI|DERNEKİ)\b/i.test(nameVal)
        const isApartmentByName = /\b(APARTMAN\s+YÖNETİMİ|APARTMAN\s+YONETIMI|SİTE\s+YÖNETİMİ|SITE\s+YONETIMI|APARTMAN|SİTESİ|SITESI)\b/i.test(nameVal)
        const isCompanyByName = /\b(LTD|A\.Ş|A\.S|ŞTİ|STI|TİC|TIC|SAN|HOLDİNG|GROUP|KOOP|KOLL)\b/i.test(nameVal)
        if (isDernekByName) return 'Dernek'
        if (isApartmentByName) return 'Apartman Yonetimi'
        if (tcVal.length === 11) return 'Gelir Vergisi'
        if (vknVal.length === 10 || isCompanyByName) return 'Kurumlar Vergisi'
        return 'Gelir Vergisi'
      })(),
      musteriSinifi: (() => {
        const nameVal = row['Uzun Ad'] || row['Kısa Ad'] || row['Kisa Ad'] || ''
        if (/\b(DERNEĞİ|DERNEK|DERNEGI|DERNEKİ)\b/i.test(nameVal)) return 'Dernek'
        if (/\b(APARTMAN\s+YÖNETİMİ|APARTMAN\s+YONETIMI|SİTE\s+YÖNETİMİ|SITE\s+YONETIMI|APARTMAN|SİTESİ|SITESI)\b/i.test(nameVal)) return 'Apartman Yonetimi'
        return ''
      })(),
      email: '',
      city: '',
      district: '',
      address: '',
      taxOffice: row['Vergi Dairesi'] ? String(row['Vergi Dairesi']).split(' ')[0] : '',
      companyType: 'ltd',
      capital: '',
      openDate: row['Kuruluş Tarihi'] || row['Kurulus Tarihi'] || '',
      naceCode: '',
      naceDesc: row['Açıklama'] || row['Aciklama'] || '',
      musteriSinifi: '',
      efatura: 'hayir',
      earsiv: 'hayir',
      esmm: 'hayir',
      edefter: 'hayir',
      edefterPeriod: 'aylik',
      serbestMeslek: 'hayir',
      sgkIsyeriKodu: '',
      sgkUser: '',
      sgkSistemSifre: '',
      sgkIsyeriSifre: '',
      dvsUsername: '',
      dvsPassword: '',
      earsivUser: '',
      earsivPass: '',
      edevletUser: '',
      edevletPass: '',
      ticaretSicilNo: '',
      kdvBeyan: 'aylik',
      kdv2Beyan: 'yok',
      muhtasarBeyan: 'yok',
      sgkBeyan: 'yok',
      geciciVergi: 'hayir',
      yillikVergi: 'hayir',
      kiraBilgisi: '',
      kiraKontratBitis: '',
      password: '123456'
    })).filter(c => c.name)
    await bulkAddClients(mapped)
    return { count: mapped.length }
  }

  const importGibPasswords = async (data) => {
    let count = 0
    const { data: allClients } = await supabase.from('clients').select('id, name, company')
    for (const row of data) {
      const company = row['Şirket'] || row['Sirket'] || row['Şirket '] || ''
      const user = row['Kullanıcı Adı'] || row['Kullanici Adi'] || ''
      const pass = row['Parola'] || row['Şifre'] || row['Sifre'] || ''
      if (!company || !user) continue
      const found = allClients.find(c => 
        (c.name && c.name.toLowerCase().trim() === company.toLowerCase().trim()) ||
        (c.company && c.company.toLowerCase().trim() === company.toLowerCase().trim())
      )
      if (found) {
        await supabase.from('clients').update({
          dvs_username: user,
          dvs_password: pass
        }).eq('id', found.id)
        count++
      }
    }
    return { count }
  }

  const importSgkPasswords = async (data) => {
    let count = 0
    const { data: allClients } = await supabase.from('clients').select('id, name, vkn, tc')
    for (const row of data) {
      // CSV format (basliksiz): isyeri_sicil;sgk_user;tc/vkn;sube;sgk_sistem_sifre;sgk_isyeri_sifre
      const values = Object.values(row)
      const tcOrVkn = values.find(v => v && /^[0-9]{10,11}$/.test(v.toString().trim())) || ''
      const sgkUser = values.find((v, i) => v && /^[0-9]{5,}$/.test(v.toString().trim()) && i > 0 && i < values.length - 2) || ''
      const lastTwo = values.slice(-2)
      const sistemSifre = lastTwo[0] || ''
      const isyeriSifre = lastTwo[1] || ''

      if (!tcOrVkn) continue
      const found = allClients.find(c => 
        (c.tc && c.tc.toString().trim() === tcOrVkn.toString().trim()) ||
        (c.vkn && c.vkn.toString().trim() === tcOrVkn.toString().trim())
      )
      if (found) {
        await supabase.from('clients').update({
          sgk_user: sgkUser,
          sgk_isyeri_kodu: values[0] || '',
          sgk_sistem_sifre: sistemSifre,
          sgk_isyeri_sifre: isyeriSifre
        }).eq('id', found.id)
        count++
      }
    }
    return { count }
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400"></div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin')}
            className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-blue-800/30"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
              <Users className="w-7 h-7 text-yellow-400" />
              Musteri Yonetimi
            </h1>
            <p className="text-gray-400 mt-1 text-sm">
              {loading && !clients.length
                ? 'Müşteriler yükleniyor…'
                : error && !clients.length
                  ? 'Müşteri sayısı doğrulanamıyor'
                  : `${stats.total} kayitli musteri`}
              {!loading && !error && isFilterActive() && (
                <span className="ml-2 text-yellow-400 text-sm">(Filtreler aktif)</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 mt-4 md:mt-0">
          <button
            onClick={lucaFirmalariAc}
            disabled={lucaGetir.yukleniyor}
            className="bg-cyan-500/20 text-cyan-400 px-4 py-2 rounded-lg font-semibold hover:bg-cyan-500/30 transition-all duration-300 flex items-center justify-center space-x-2 disabled:opacity-50"
            title="Luca Müşavir Paketi'ndeki firmaları getir; GİB ve SGK bilgileriyle birlikte kaydet"
          >
            <RefreshCw className={`w-5 h-5 ${lucaGetir.yukleniyor ? 'animate-spin' : ''}`} />
            <span>Luca'dan Getir</span>
          </button>
          <button
            onClick={downloadTemplate}
            className="bg-blue-500/20 text-blue-400 px-4 py-2 rounded-lg font-semibold hover:bg-blue-500/30 transition-all duration-300 flex items-center justify-center space-x-2"
          >
            <Download className="w-5 h-5" />
            <span>Sablon Indir</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="bg-green-500/20 text-green-400 px-4 py-2 rounded-lg font-semibold hover:bg-green-500/30 transition-all duration-300 flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            <Upload className="w-5 h-5" />
            <span>{uploading ? 'Yukleniyor...' : 'Excel Yükle'}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Link 
            to="/admin/clients/new"
            className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-6 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-yellow-500/30 transition-all duration-300 flex items-center justify-center space-x-2"
          >
            <Plus className="w-5 h-5" />
            <span>Yeni Musteri</span>
          </Link>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <span>{error}</span>
          <button type="button" onClick={() => refresh()} disabled={loading} className="rounded-lg bg-red-500/20 px-3 py-1.5 font-semibold text-red-100 hover:bg-red-500/30 disabled:opacity-50">
            {loading ? 'Yeniden deneniyor…' : 'Yeniden dene'}
          </button>
        </div>
      )}

      {/* Istatistikler */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {[
          { label: 'Toplam', value: stats.total, color: 'text-white' },
          { label: 'Aktif', value: stats.active, color: 'text-green-400' },
          { label: 'Sirket', value: stats.companies, color: 'text-yellow-400' },
          { label: 'Bireysel', value: stats.individuals, color: 'text-purple-400' },
          { label: 'Kurumlar', value: stats.kurumlar, color: 'text-blue-400' },
          { label: 'Gelir', value: stats.gelir, color: 'text-orange-400' }
        ].map(stat => (
          <div key={stat.label} className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
            <div className={`text-2xl font-bold ${stat.color}`}>{istatistikBilinmiyor ? '—' : stat.value}</div>
            <div className="text-gray-400 text-xs">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Filtreler */}
      <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 mb-6">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              placeholder="Isim, sirket, VKN, TC, adres, email, telefon, vergi dairesi, sehir ile ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 transition-colors"
            />
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center space-x-2 ${
                isFilterActive() ? 'bg-yellow-500 text-blue-950' : 'bg-blue-800/30 text-gray-400 hover:text-white'
              }`}
            >
              <Filter className="w-4 h-4" />
              <span>Filtreler</span>
              {isFilterActive() && (
                <span className="ml-1 text-xs bg-blue-950/30 px-1.5 py-0.5 rounded-full">!</span>
              )}
            </button>
            {isFilterActive() && (
              <button
                onClick={clearFilters}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all bg-red-500/20 text-red-400 hover:bg-red-500/30 flex items-center space-x-1"
              >
                <X className="w-4 h-4" />
                <span>Temizle</span>
              </button>
            )}
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-blue-700/50">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-gray-400 text-xs block mb-1">Musteri Tipi</label>
                <div className="flex space-x-1 bg-blue-900/30 rounded-lg p-1">
                  {[
                    { val: 'all', label: 'Tumu' },
                    { val: 'company', label: 'Sirket' },
                    { val: 'individual', label: 'Bireysel' },
                  ].map(opt => (
                    <button
                      key={opt.val}
                      onClick={() => setFilterType(opt.val)}
                      className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                        filterType === opt.val ? 'bg-yellow-500 text-blue-950' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-gray-400 text-xs block mb-1">Durum</label>
                <div className="flex space-x-1 bg-blue-900/30 rounded-lg p-1">
                  {[
                    { val: 'all', label: 'Tumu' },
                    { val: 'active', label: 'Aktif' },
                    { val: 'inactive', label: 'Pasif' },
                  ].map(opt => (
                    <button
                      key={opt.val}
                      onClick={() => setFilterStatus(opt.val)}
                      className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                        filterStatus === opt.val ? 'bg-yellow-500 text-blue-950' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-gray-400 text-xs block mb-1">Vergi Turu</label>
                <div className="flex space-x-1 bg-blue-900/30 rounded-lg p-1">
                  {[
                    { val: 'all', label: 'Tumu' },
                    { val: 'kurumlar', label: 'Kurumlar' },
                    { val: 'gelir', label: 'Gelir' },
                  ].map(opt => (
                    <button
                      key={opt.val}
                      onClick={() => setFilterTax(opt.val)}
                      className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                        filterTax === opt.val ? 'bg-yellow-500 text-blue-950' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-gray-400 text-xs block mb-1">Siralama</label>
                <div className="flex space-x-1 bg-blue-900/30 rounded-lg p-1">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="flex-1 bg-transparent text-white text-xs px-2 py-1.5 rounded focus:outline-none"
                  >
                    <option value="name">Isim</option>
                    <option value="date">Tarih</option>
                    <option value="type">Tip</option>
                  </select>
                  <button
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    className="px-3 py-1.5 rounded text-xs font-medium transition-all bg-blue-800/30 text-gray-400 hover:text-white"
                  >
                    {sortOrder === 'asc' ? '\u2191' : '\u2193'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Musteri Listesi */}
      <div className="bg-blue-800/20 rounded-2xl border border-blue-700/30 overflow-hidden">
        {selectedIds.length > 0 && (
          <div className="bg-red-500/10 border-b border-red-500/20 px-6 py-3 flex items-center justify-between">
            <span className="text-red-400 font-medium">{selectedIds.length} musteri secildi</span>
            <button
              onClick={handleBulkDelete}
              disabled={uploading}
              className="bg-red-500/20 hover:bg-red-500/30 text-red-400 px-4 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center space-x-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>Secilenleri Sil</span>
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-blue-900/30">
              <tr className="text-left text-gray-400 text-sm">
                <th className="px-4 py-4">
                  <input
                    type="checkbox"
                    checked={filteredClients.length > 0 && selectedIds.length === filteredClients.length}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded border-gray-500 text-yellow-500 focus:ring-yellow-500"
                  />
                </th>
                <th className="px-6 py-4">#</th>
                <th className="px-6 py-4">Musteri</th>
                <th className="px-6 py-4">Adres</th>
                <th className="px-6 py-4">Vergi Turu</th>
                <th className="px-6 py-4">Durum</th>
                <th className="px-6 py-4">Islem</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-8 text-gray-400">
                    {loading ? 'Müşteriler yükleniyor…' : error ? 'Müşteri verileri alınamadı' : isFilterActive() ? 'Filtrelere uygun musteri bulunamadi' : 'Henuz musteri eklenmemis'}
                  </td>
                </tr>
              ) : (
                filteredClients.map((client, index) => (
                  <tr 
                    key={client.id} 
                    className="border-t border-blue-700/30 hover:bg-blue-800/20 transition-colors"
                  >
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(client.id)}
                        onChange={() => toggleSelection(client.id)}
                        className="w-4 h-4 rounded border-gray-500 text-yellow-500 focus:ring-yellow-500"
                      />
                    </td>
                    <td className="px-6 py-4 text-gray-400">{index + 1}</td>
                    <td className="px-6 py-4 cursor-pointer" onClick={() => navigate(`/admin/client/${client.id}`)}>
                      <div>
                        <div className="text-white font-medium">{client.name}</div>
                        <div className="text-gray-400 text-xs">{client.company || client.email || '-'}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 cursor-pointer" onClick={() => navigate(`/admin/client/${client.id}`)}>
                      <div className="flex items-center space-x-1">
                        <MapPin className="w-3 h-3 text-gray-500 flex-shrink-0" />
                        <span className="text-gray-300 text-sm truncate max-w-[150px] block">
                          {client.address || '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 cursor-pointer" onClick={() => navigate(`/admin/client/${client.id}`)}>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        client.taxType === 'Kurumlar Vergisi' 
                          ? 'bg-blue-500/20 text-blue-400' 
                          : client.taxType === 'Gelir Vergisi'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {client.taxType || 'Kurumlar Vergisi'}
                      </span>
                    </td>
                    <td className="px-6 py-4 cursor-pointer" onClick={() => navigate(`/admin/client/${client.id}`)}>
                      {(() => {
                        const pasif = client.status === 'inactive' || !!(client.closeDate && String(client.closeDate).trim())
                        return (
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            pasif ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'
                          }`} title={client.closeDate ? `İşyeri Kapanış: ${client.closeDate}` : undefined}>
                            {pasif ? 'Pasif' : 'Aktif'}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => navigate(`/admin/client/${client.id}`)}
                          className="text-gray-400 hover:text-yellow-400 transition-colors"
                          title="Detay"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => navigate(`/admin/client/${client.id}/beyan-profile`)}
                          className="text-gray-400 hover:text-teal-400 transition-colors"
                          title="Beyan Profili"
                        >
                          <ListChecks className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => navigate(`/admin/client/${client.id}/beyan-takip`)}
                          className="text-gray-400 hover:text-blue-400 transition-colors"
                          title="Beyan Takip"
                        >
                          <FileText className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => handleDelete(client.id, client.name)}
                          className="text-gray-400 hover:text-red-400 transition-colors"
                          title="Sil"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* LUCA'DAN FIRMALARI GETIR penceresi */}
      {lucaGetir.acik && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-blue-950 border border-blue-700/50 rounded-2xl w-full max-w-6xl max-h-[85vh] flex flex-col">
            <div className="px-6 py-4 border-b border-blue-800/50 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-cyan-400" /> Luca&apos;dan Firmaları Getir
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Firma bilgileri (vergi dairesi, defter türü, VKN/TCKN, kullanıcı adı) Luca&apos;dan otomatik okunur; kaydettiğinizde müşteri kartına yazılır. VD ve SGK şifrelerini aynı satırda girin — boş bırakılanlar mevcut değeri korur.
                </p>
              </div>
              <button onClick={() => setLucaGetir(g => ({ ...g, acik: false }))} title="Kapat"><X className="w-5 h-5 text-gray-400 hover:text-white" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {lucaGetir.yukleniyor && (
                <div className="text-center py-10">
                  <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-3" />
                  <p className="text-gray-300 text-sm">Luca&apos;ya bağlanılıyor; firma listesi ve her firmanın bilgileri (vergi dairesi, defter türü vb.) tek tek okunuyor...</p>
                  {lucaIlerleme && lucaIlerleme.asama === 'detay' && lucaIlerleme.toplam ? (
                    <>
                      <div className="w-72 h-2.5 bg-blue-900/80 rounded-full mx-auto mt-4 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-cyan-500 to-teal-400 rounded-full transition-all duration-500" style={{ width: `${Math.max(2, lucaIlerleme.yuzde || 0)}%` }} />
                      </div>
                      <p className="text-cyan-300 text-sm font-medium mt-2">
                        {lucaIlerleme.mevcut}/{lucaIlerleme.toplam} firma · %{lucaIlerleme.yuzde || 0}
                      </p>
                      <p className="text-gray-400 text-xs mt-0.5">
                        {lucaIlerleme.firma ? `${lucaIlerleme.firma} okunuyor · ` : ''}kalan ≈ {Math.max(0, lucaIlerleme.toplam - (lucaIlerleme.mevcut || 0))} firma
                      </p>
                    </>
                  ) : (
                    <p className="text-cyan-300 text-sm mt-3">
                      {lucaIlerleme?.asama === 'kimlik' ? 'GİB / SGK kimlik tabloları okunuyor (şifreler Luca\u2019dan alınacak)...' : 'Firma listesi okunuyor...'}
                    </p>
                  )}
                  <p className="text-gray-500 text-xs mt-1">Firma sayısına göre birkaç dakika sürebilir — tarayıcı penceresini kapatmayın.</p>
                  <button
                    onClick={lucaSorguDurdur}
                    disabled={lucaGetir.durduruluyor}
                    className="mt-4 inline-flex items-center gap-2 bg-red-600/80 hover:bg-red-600 disabled:opacity-60 disabled:cursor-wait text-white text-sm font-medium px-5 py-2 rounded-xl transition-colors"
                  >
                    <X className="w-4 h-4" /> {lucaGetir.durduruluyor ? 'Durduruluyor…' : 'Sorgulamayı Durdur'}
                  </button>
                </div>
              )}
              {lucaGetir.hata && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm">{lucaGetir.hata}</div>
              )}
              {lucaGetir.uyari && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3 text-yellow-300 text-sm">{lucaGetir.uyari}</div>
              )}
              {!lucaGetir.yukleniyor && lucaGetir.firmalar.length > 0 && (
                <>
                  {!lucaGetir.detayli && (
                    <div className="mb-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-2 text-yellow-300 text-xs">
                      Detaylı okuma yapılamadı; yalnızca ad/VKN listesi alındı. Yardımcı programı güncelleyip tekrar deneyin.
                    </div>
                  )}
                  <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 text-xs border-b border-blue-800/50">
                      <th className="py-2 pr-2"></th>
                      <th className="py-2 pr-3 font-medium">Firma (Luca)</th>
                      <th className="py-2 pr-3 font-medium">VKN / TCKN</th>
                      <th className="py-2 pr-3 font-medium">Vergi Dairesi</th>
                      <th className="py-2 pr-3 font-medium">Defter Türü</th>
                      <th className="py-2 pr-3 font-medium">VD Şifresi</th>
                      <th className="py-2 pr-3 font-medium">SGK Kullanıcı</th>
                      <th className="py-2 font-medium">SGK Şifresi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lucaGetir.firmalar.map((f, i) => (
                      <Fragment key={i}>
                      <tr className="border-b border-blue-900/30">
                        <td className="py-2 pr-2">
                          <input
                            type="checkbox"
                            checked={f.secili}
                            onChange={(e) => lucaSatirDuzelt(i, 'secili', e.target.checked)}
                            className="w-4 h-4 accent-yellow-500 cursor-pointer"
                          />
                        </td>
                        <td className="py-2 pr-3 text-gray-200 max-w-56">
                          <div className="flex items-center gap-2">
                            <div className="truncate" title={f.ad}>{f.ad}</div>
                            {f.zatenVar && (
                              <span className="shrink-0 px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400 text-[10px] font-medium border border-gray-500/30" title="Bu firma müşteri listenizde zaten kayıtlı — kaydetmek isterseniz elle işaretleyin">Zaten yüklü</span>
                            )}
                          </div>
                          {(f.kisaAd || f.kullaniciAdi) && (
                            <div className="text-[10px] text-gray-500 truncate">{[f.kisaAd, f.kullaniciAdi].filter(Boolean).join(' · ')}</div>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            value={f.kimlik}
                            onChange={(e) => lucaSatirDuzelt(i, 'kimlik', e.target.value.replace(/\D/g, '').slice(0, 11))}
                            placeholder="VKN / TCKN"
                            className="w-28 bg-blue-900/40 border border-blue-700/40 rounded-lg px-2 py-1.5 text-white text-xs"
                          />
                        </td>
                        <td className="py-2 pr-3 text-xs text-gray-300 max-w-32 truncate" title={f.vergiDairesi}>{f.vergiDairesi || '—'}</td>
                        <td className="py-2 pr-3 text-xs text-gray-300">{f.defterTipi || '—'}</td>
                        <td className="py-2 pr-3">
                          <input
                            value={f.vdSifre}
                            onChange={(e) => lucaSatirDuzelt(i, 'vdSifre', e.target.value)}
                            type="password"
                            placeholder="VD şifresi"
                            className="w-28 bg-blue-900/40 border border-blue-700/40 rounded-lg px-2 py-1.5 text-white text-xs"
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            value={f.sgkUser}
                            onChange={(e) => lucaSatirDuzelt(i, 'sgkUser', e.target.value)}
                            placeholder="SGK kullanıcı"
                            className="w-28 bg-blue-900/40 border border-blue-700/40 rounded-lg px-2 py-1.5 text-white text-xs"
                          />
                        </td>
                        <td className="py-2">
                          <input
                            value={f.sgkSifre}
                            onChange={(e) => lucaSatirDuzelt(i, 'sgkSifre', e.target.value)}
                            type="password"
                            placeholder="SGK şifresi"
                            className="w-28 bg-blue-900/40 border border-blue-700/40 rounded-lg px-2 py-1.5 text-white text-xs"
                          />
                        </td>
                      </tr>
                      {/* 2.7.503: birden fazla SGK numarasi (isyeri) — her isyeri icin ayri bölüm */}
                      {Array.isArray(f.sgkKayitlari) && f.sgkKayitlari.length > 1 && f.sgkKayitlari.map((sg, j) => (
                        <tr key={`${i}-sgk-${j}`} className="border-b border-blue-900/30 bg-cyan-950/20">
                          <td className="py-1.5 pr-2"></td>
                          <td className="py-1.5 pr-3 text-[11px] text-cyan-300" colSpan={5} title={sg.isyeri}>
                            <span className="inline-flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block"></span>
                              SGK İşyeri #{j + 1}: {sg.isyeri || '—'}
                            </span>
                          </td>
                          <td className="py-1.5 pr-3">
                            <input
                              value={sg.kadi || ''}
                              onChange={(e) => lucaSgkDuzelt(i, j, 'kadi', e.target.value)}
                              placeholder="SGK kullanıcı"
                              className="w-28 bg-blue-900/40 border border-cyan-700/40 rounded-lg px-2 py-1.5 text-white text-xs"
                            />
                          </td>
                          <td className="py-1.5">
                            <input
                              value={sg.sistemSifresi || ''}
                              onChange={(e) => lucaSgkDuzelt(i, j, 'sistemSifresi', e.target.value)}
                              type="password"
                              placeholder="SGK şifresi"
                              className="w-28 bg-blue-900/40 border border-cyan-700/40 rounded-lg px-2 py-1.5 text-white text-xs"
                            />
                          </td>
                        </tr>
                      ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
                </>
              )}
            </div>
            {!lucaGetir.yukleniyor && !lucaGetir.hata && lucaGetir.firmalar.length > 0 && (
              <div className="px-6 py-4 border-t border-blue-800/50 flex items-center justify-between gap-3">
                <span className="text-xs text-gray-400">
                  {lucaGetir.firmalar.filter(f => f.secili).length}/{lucaGetir.firmalar.length} firma seçili
                  {lucaGetir.firmalar.some(f => f.zatenVar) && (
                    <span className="text-gray-500"> · {lucaGetir.firmalar.filter(f => f.zatenVar).length} firma zaten yüklü (işaretsiz)</span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={lucaSecimiSil}
                    disabled={!lucaGetir.firmalar.some(f => f.secili)}
                    title="Tüm seçim kutularını temizler (kayıt yapmaz)"
                    className="px-4 py-2.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-400 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-500/25"
                  >
                    Seçimi Sil
                  </button>
                  <button
                    onClick={lucaFirmaKaydet}
                    disabled={lucaKaydediyor || !lucaGetir.firmalar.some(f => f.secili)}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 font-semibold disabled:opacity-40 flex items-center gap-2"
                  >
                    {lucaKaydediyor && <Loader2 className="w-4 h-4 animate-spin" />}
                    {lucaKaydediyor ? 'Kaydediliyor...' : 'Seçilenleri Kaydet'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
