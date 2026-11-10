// Tecilli Tahsilat odeme plani servisi
// - Admin "Borc Taksitli Detay Listesi" PDF'ini yukler (GIB cikti)
// - PDF metninden belge no, vergi dairesi ve taksit satirlari okunur
// - Plan clients.tecilli_plan alanina yazilir; musteri vergi takviminde
//   her taksit ayri ayri odeme kutusu/link olarak gosterilir.

import { supabase } from '../lib/supabase'

const TUTAR_RE = /^\d{1,3}(?:\.\d{3})*,\d{2}$/
const BELGE_RE = /^\d{10,12}[A-Za-z]{0,3}\d{5,9}$/
const VADE8_RE = /^\d{8}$/

function tutarOku(s) {
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function vade8ToISO(s) {
  if (!VADE8_RE.test(s)) return ''
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

// jsonb metin olarak donerse diziye cevirir
function safeParseJson(deger) {
  if (typeof deger !== 'string') return null
  try {
    const p = JSON.parse(deger)
    return Array.isArray(p) ? p : null
  } catch {
    return null
  }
}

// "Borc Taksitli Detay Listesi" PDF metninden belge bloklarini cikarir.
// Tarama belge numarasi merkezlidir: PDF ciktisinda "Vergi Dairesi" basligi
// yalnizca ilk blokta gorunur, sonraki bloklar dogrudan "MASLAK <belgeNo>"
// olarak gelir. Vergi dairesi, belge numarasindan onceki harf tokenidir.
export function tecilliPlanMetindenOku(metin) {
  const BASLIKLAR = new Set(['Vergi', 'Dairesi', 'Belge', 'No', 'Plaka', 'Taksitler', 'Türü', 'Dönemi', 'Tarihi', 'Vade', 'Asıl', 'Borç', 'Gecikme', 'Zammı', 'Toplam', 'Borcu', 'İndirim', 'Taksit'])
  const SIRADEGIL = /^[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ]{1,}$/
  const tokens = String(metin || '').replace(/\s+/g, ' ').trim().split(' ')
  const belgeler = []
  for (let i = 0; i < tokens.length; i++) {
    if (!BELGE_RE.test(tokens[i])) continue
    // Vergi dairesi: belge numarasindan geriye dogru ilk harf tokeni
    // (birden cok kelimeli daire adlari birlestirilir)
    let daire = ''
    let d = i - 1
    const parcalar = []
    while (d >= 0 && parcalar.length < 4) {
      const t = tokens[d]
      if (BASLIKLAR.has(t) || !SIRADEGIL.test(t)) break
      parcalar.unshift(t)
      d--
    }
    daire = parcalar.join(' ')
    // Ilk taksit satirini bul: sira no + vade (YYYYMMDD) + tutar dizisi
    let h = i + 1
    while (h < tokens.length && !(
      VADE8_RE.test(tokens[h]) &&
      TUTAR_RE.test(tokens[h + 1] || '') &&
      Number.isInteger(Number(tokens[h - 1])) &&
      Number(tokens[h - 1]) >= 1 && Number(tokens[h - 1]) <= 120
    )) h++
    const taksitler = []
    let m = h - 1
    while (m + 5 < tokens.length) {
      const no = Number(tokens[m])
      const vade = tokens[m + 1]
      if (!Number.isInteger(no) || no < 1 || no > 120 || !VADE8_RE.test(vade)) break
      if (!TUTAR_RE.test(tokens[m + 2]) || !TUTAR_RE.test(tokens[m + 5])) break
      taksitler.push({
        no,
        vade: vade8ToISO(vade),
        asil: tutarOku(tokens[m + 2]),
        gecikme: tutarOku(tokens[m + 3]),
        indirim: tutarOku(tokens[m + 4]),
        toplam: tutarOku(tokens[m + 5])
      })
      m += 6
    }
    if (taksitler.length > 0) {
      belgeler.push({
        belgeNo: tokens[i],
        vergiDairesi: daire,
        taksitSayisi: taksitler.length,
        toplamTutar: taksitler.reduce((a, t) => a + t.toplam, 0),
        taksitler
      })
    }
    i = Math.max(m, i)
  }
  return belgeler
}

// File/Blob -> PDF metni (pdfjs, tarayici tarafinda)
export async function tecilliPlanPdfOku(file) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
    pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default
  }
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  let metin = ''
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    metin += tc.items.map(it => it.str).join(' ') + '\n'
  }
  const belgeler = tecilliPlanMetindenOku(metin)
  if (!belgeler.length) {
    throw new Error('PDF icinde taksitli borc belgesi bulunamadi. "Borc Taksitli Detay Listesi" ciktisini yukleyin.')
  }
  return belgeler
}

// Plan kaydet/guncelle: clients.tecilli_tahsilat + tecilli_plan
export async function tecilliPlanKaydet(clientId, belgeler) {
  const { error } = await supabase
    .from('clients')
    .update({ tecilli_tahsilat: true, tecilli_plan: belgeler })
    .eq('id', clientId)
  if (error) throw new Error('Odeme plani kaydedilemedi: ' + error.message)
  return true
}

// Tecilli tahsilat acik/kapali
export async function tecilliDurumKaydet(clientId, acik) {
  const { error } = await supabase
    .from('clients')
    .update({ tecilli_tahsilat: acik })
    .eq('id', clientId)
  if (error) throw new Error('Tecilli tahsilat durumu kaydedilemedi: ' + error.message)
  return true
}

// Bir taksiti odenmis olarak isaretler (odenen=true). Pencerede o taksit
// artik listelenmez; veri odeme plani PDF'inde korunmaya devam eder.
export async function tecilliTaksitOdendi(clientId, belgeNo, taksitNo) {
  const plan = await tecilliPlanGetir(clientId)
  if (!plan) throw new Error('Ödeme planı okunamadı')
  const belge = (plan.belgeler || []).find(b => b.belgeNo === belgeNo)
  if (!belge) throw new Error('Belge bulunamadı: ' + belgeNo)
  const taksit = (belge.taksitler || []).find(t => t.no === taksitNo)
  if (!taksit) throw new Error('Taksit bulunamadı: ' + taksitNo)
  if (taksit.odenen) return plan.belgeler
  taksit.odenen = true
  const { error } = await supabase
    .from('clients')
    .update({ tecilli_plan: plan.belgeler })
    .eq('id', clientId)
  if (error) throw new Error('Kaydedilemedi: ' + error.message)
  return plan.belgeler
}

// Musterinin planini getirir: { acik, belgeler, il, vergiDairesi, vkn } | null
// NOT: Yalnizca clients tablosunda var olan kolonlar secilir; var olmayan bir
// kolon adi PostgREST hatasi verir ve fonksiyon null donup pencereyi gizlerdi.
export async function tecilliPlanGetir(clientId) {
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('tecilli_tahsilat, tecilli_plan, city, tax_office, vkn, tc')
      .eq('id', clientId)
      .single()
    if (error || !data) return null
    return {
      acik: !!data.tecilli_tahsilat,
      belgeler: Array.isArray(data.tecilli_plan) ? data.tecilli_plan : safeParseJson(data.tecilli_plan) || [],
      il: data.city || '',
      vergiDairesi: data.tax_office || '',
      vkn: data.vkn || data.tc || ''
    }
  } catch (e) {
    console.error('Tecilli plan okunamadi:', e)
    return null
  }
}

// Odeme planini PDF olarak indirir (Turkce karakter destekli unicodePdf).
// 36 taksit tek belgede ~1 sayfaya sigar; cok belge alt alta akar.
export async function tecilliPlanPdfIndir(plan) {
  if (!plan || !(plan.belgeler || []).length) {
    throw new Error('Indirilecek odeme plani yok')
  }
  const { createUnicodePdf } = await import('../utils/unicodePdf')
  const doc = createUnicodePdf()
  const tl = (n) => Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const tarih = (v) => String(v || '').split('-').reverse().join('.')

  let y = 20
  doc.setFont('Arial', 'bold')
  doc.setFontSize(15)
  doc.text('TECİLLİ TAHSİLAT - ÖDEME PLANI', 105, y, { align: 'center' })
  y += 8
  doc.setFont('Arial', 'normal')
  doc.setFontSize(10)
  const ustBilgi = [
    plan.vkn ? `VKN/TC: ${plan.vkn}` : '',
    plan.vergiDairesi ? `Vergi Dairesi: ${plan.vergiDairesi}` : '',
    plan.il ? `İl: ${plan.il}` : ''
  ].filter(Boolean).join('   |   ')
  if (ustBilgi) { doc.text(ustBilgi, 105, y, { align: 'center' }); y += 10 }
  else y += 4

  for (const belge of plan.belgeler) {
    // Belge basligi
    if (y > 250) { doc.addPage(); y = 20 }
    doc.setFont('Arial', 'bold')
    doc.setFontSize(11)
    doc.text(`Belge No: ${belge.belgeNo}`, 15, y)
    y += 6
    doc.setFontSize(9)
    doc.text(`Vergi Dairesi: ${belge.vergiDairesi || plan.vergiDairesi || '-'}    Taksit Sayısı: ${belge.taksitSayisi}    Toplam: ${tl(belge.toplamTutar)} TL`, 15, y)
    y += 7

    // Tablo basligi
    doc.setFillColor(30, 58, 138)
    doc.setTextColor(255, 255, 255)
    doc.rect(15, y - 5, 180, 7, 'F')
    doc.setFont('Arial', 'bold')
    doc.setFontSize(8)
    doc.text('Taksit', 18, y)
    doc.text('Vade', 35, y)
    doc.text('Asıl Borç (TL)', 65, y, { align: 'right' })
    doc.text('Gecikme (TL)', 100, y, { align: 'right' })
    doc.text('İndirim (TL)', 135, y, { align: 'right' })
    doc.text('Toplam (TL)', 192, y, { align: 'right' })
    doc.setTextColor(0, 0, 0)
    y += 8

    // Taksit satirlari
    doc.setFont('Arial', 'normal')
    doc.setFontSize(8)
    ;(belge.taksitler || []).forEach((t, idx) => {
      if (y > 280) { doc.addPage(); y = 20 }
      if (idx % 2 === 1) {
        doc.setFillColor(240, 244, 252)
        doc.rect(15, y - 4, 180, 6, 'F')
      }
      doc.text(`${t.no}/${belge.taksitSayisi}`, 18, y)
      doc.text(tarih(t.vade), 35, y)
      doc.text(tl(t.asil), 65, y, { align: 'right' })
      doc.text(tl(t.gecikme), 100, y, { align: 'right' })
      doc.text(tl(t.indirim), 135, y, { align: 'right' })
      doc.text(tl(t.toplam), 192, y, { align: 'right' })
      y += 6
    })
    y += 8
  }

  const bugun = new Date().toISOString().slice(0, 10)
  doc.save(`Tecilli-Odeme-Plani_${bugun}.pdf`)
}
