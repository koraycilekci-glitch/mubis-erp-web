import * as XLSX from 'xlsx'

/**
 * Blob olarak dosya indirme
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Fatura/Fis verilerini musteri tipine gore uygun formata donusturur
 * @param {Array} documents - Fatura/Fis dokumanlari
 * @param {Object} clientInfo - Musteri bilgileri
 * @returns {Array} Formatlanmis satirlar
 */
export function convertToLucaFormat(documents, clientInfo) {
  const clientType = clientInfo?.client_type || 'company'
  
  if (clientType === 'company' || clientType === 'şirket') {
    return convertToCompanyFormat(documents, clientInfo)
  } else if (clientType === 'işletme' || clientType === '1.sınıf' || clientType === 'basit_usul') {
    return convertToBusinessFormat(documents, clientInfo)
  } else {
    return convertToCompanyFormat(documents, clientInfo)
  }
}

/**
 * Sirket formati - 1. Sinif Defter (Ayrintili)
 * Luca Hizli Fis Aktarim sablonuna uygun
 */
function convertToCompanyFormat(documents, clientInfo) {
  const rows = []

  documents.forEach(doc => {
    const parsed = doc.parsed_data || {}
    const tarih = parsed.tarih || doc.document_date
    const evrakNo = parsed.evrakNo || doc.document_no || ''
    
    // Her KDV orani icin ayri satir
    if (parsed.satis1 > 0 || parsed.matrah1 > 0) {
      rows.push(createCompanyRow(doc, parsed, 1, clientInfo))
    }
    if (parsed.satis10 > 0 || parsed.matrah10 > 0) {
      rows.push(createCompanyRow(doc, parsed, 10, clientInfo))
    }
    if (parsed.satis20 > 0 || parsed.matrah20 > 0) {
      rows.push(createCompanyRow(doc, parsed, 20, clientInfo))
    }
    if (parsed.satis0 > 0) {
      rows.push(createCompanyRow(doc, parsed, 0, clientInfo))
    }
  })

  return rows
}

function createCompanyRow(doc, parsed, kdvOrani, clientInfo) {
  const tarih = parsed.tarih || doc.document_date
  const evrakNo = parsed.evrakNo || doc.document_no || ''
  
  let matrah = 0
  let kdvTutar = 0
  let toplam = 0
  
  switch (kdvOrani) {
    case 1:
      matrah = parsed.matrah1 || 0
      kdvTutar = parsed.kdv1 || 0
      toplam = parsed.satis1 || 0
      break
    case 10:
      matrah = parsed.matrah10 || 0
      kdvTutar = parsed.kdv10 || 0
      toplam = parsed.satis10 || 0
      break
    case 20:
      matrah = parsed.matrah20 || 0
      kdvTutar = parsed.kdv20 || 0
      toplam = parsed.satis20 || 0
      break
    case 0:
      matrah = parsed.satis0 || 0
      kdvTutar = 0
      toplam = parsed.satis0 || 0
      break
  }

  return {
    'İŞLEM': 'SATIŞ',
    'KATEGORİ': 'PERAKENDE_SATIŞ',
    'BELGE TÜRÜ': 'FATURA',
    'EVRAK TARİHİ': formatDateForLuca(tarih),
    'KAYIT TARİHİ': formatDateForLuca(new Date().toISOString().split('T')[0]),
    'SERİ NO': 'Z',
    'EVRAK NO': evrakNo,
    'TCKN/VKN': clientInfo?.vkn || clientInfo?.tc || '',
    'VERGİ DAİRESİ': clientInfo?.tax_office || '',
    'SOYADI ÜNVAN': clientInfo?.name || clientInfo?.company || '',
    'ADI DEVAMI': '',
    'ADRES': clientInfo?.address || '',
    'CARİ HESAP': '',
    'KDV İSTİSNASI': '',
    'KOD': '',
    'BELGE TÜRÜ(DB)': 'Z_RAPORU',
    'ALIŞ/SATIŞ TÜRÜ': 'SATIŞ',
    'KAYIT ALT TÜRÜ': 'MAL_SATIŞI',
    'MAL VE HİZMET KODU': '610',
    'AÇIKLAMA': `Z Raporu - ${evrakNo} - KDV %${kdvOrani}`,
    'MİKTAR': 1,
    'B.FİYAT': matrah,
    'TUTAR': matrah,
    'TEVKİFAT': 0,
    'KDV ORANI': kdvOrani,
    'ÖZEL MATRAH İŞLEM BEDELİ': 0,
    'MATRAHTAN DÜŞÜLECEK TUTAR': 0,
    'MATRAHA DAHİL OLMAYAN BEDEL': 0,
    'KDV TUTARI': kdvTutar,
    'TOPLAM TUTAR': toplam,
    'KREDİLİ TUTAR': 0,
    'STOPAJ KODU': '',
    'STOPAJ TUTARI': 0,
    'DÖNEMSELLİK İLKESİ': 'TAHSİL_ESASI',
    'FAALİYET KODU': '',
    'ÖDEME TÜRÜ': parsed.nakit > 0 ? 'NAKİT' : 'KREDİ_KARTI'
  }
}

/**
 * Isletme formati - Basit Usul (Sade)
 */
function convertToBusinessFormat(documents, clientInfo) {
  const rows = []

  documents.forEach(doc => {
    const parsed = doc.parsed_data || {}
    const tarih = parsed.tarih || doc.document_date
    const evrakNo = parsed.evrakNo || doc.document_no || ''
    const toplamSatis = (parsed.satis0 || 0) + (parsed.satis1 || 0) + (parsed.satis10 || 0) + (parsed.satis20 || 0)
    const toplamKdv = (parsed.kdv1 || 0) + (parsed.kdv10 || 0) + (parsed.kdv20 || 0)
    
    rows.push({
      'TARIH': formatDateForLuca(tarih),
      'EVRAK_NO': evrakNo,
      'ACIKLAMA': `Gunluk satis - Z No: ${evrakNo}`,
      'SATIS_TOPLAM': toplamSatis,
      'KDV_TOPLAM': toplamKdv,
      'NAKIT': parsed.nakit || 0,
      'KREDI_KARTI': parsed.krediKarti || 0,
      'ODEME_TOPLAM': (parsed.nakit || 0) + (parsed.krediKarti || 0),
      'MUSTERI_ADI': clientInfo?.name || clientInfo?.company || '',
      'VKN': clientInfo?.vkn || clientInfo?.tc || '',
      'VERGI_DAIRESI': clientInfo?.tax_office || ''
    })
  })

  return rows
}

function formatDateForLuca(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d)) return dateStr
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

/**
 * Luca formatindaki verileri CSV olarak indirir
 */
export function downloadLucaCSV(lucaRows, filename = 'luca_aktarim.csv') {
  if (!lucaRows || lucaRows.length === 0) {
    console.warn('Aktarilacak veri bulunmuyor')
    return
  }

  const headers = Object.keys(lucaRows[0])
  
  let csv = '\uFEFF'
  csv += headers.join(';') + '\n'
  
  lucaRows.forEach(row => {
    const values = headers.map(h => {
      const val = row[h] || ''
      if (String(val).includes(';')) {
        return `"${val}"`
      }
      return val
    })
    csv += values.join(';') + '\n'
  })

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  downloadBlob(blob, filename)
}

/**
 * Luca formatindaki verileri Excel olarak indirir
 */
export function downloadLucaExcel(lucaRows, filename = 'luca_aktarim.xlsx') {
  if (!lucaRows || lucaRows.length === 0) {
    console.warn('Aktarilacak veri bulunmuyor')
    return
  }

  const ws = XLSX.utils.json_to_sheet(lucaRows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Aktarim')
  
  const colWidths = [
    { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 20 },
    { wch: 15 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 8 },
    { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 30 },
    { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
    { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 12 },
    { wch: 12 }
  ]
  ws['!cols'] = colWidths

  XLSX.writeFile(wb, filename)
}

/**
 * Z raporu verilerini muhasebe defteri formatina donusturur
 */
export function convertToDefterFormat(zReports, clientType) {
  const entries = []

  zReports.forEach(report => {
    const parsed = report.parsed_data || {}
    const toplamSatis = (parsed.satis0 || 0) + (parsed.satis1 || 0) + (parsed.satis10 || 0) + (parsed.satis20 || 0)
    const toplamKdv = (parsed.kdv1 || 0) + (parsed.kdv10 || 0) + (parsed.kdv20 || 0)

    if (clientType === 'company') {
      if (parsed.nakit > 0) {
        entries.push({
          tarih: parsed.tarih || report.report_date,
          evrakNo: parsed.evrakNo || report.z_no,
          aciklama: `Nakit satis - Z No: ${parsed.evrakNo || report.z_no}`,
          hesapKodu: '100',
          hesapAdi: 'Kasa',
          borc: parsed.nakit,
          alacak: 0
        })
        entries.push({
          tarih: parsed.tarih || report.report_date,
          evrakNo: parsed.evrakNo || report.z_no,
          aciklama: `Satis hasilati - Z No: ${parsed.evrakNo || report.z_no}`,
          hesapKodu: '600',
          hesapAdi: 'Yurtici Satislar',
          borc: 0,
          alacak: parsed.nakit - (parsed.nakit / toplamSatis * toplamKdv)
        })
      }

      if (parsed.krediKarti > 0) {
        entries.push({
          tarih: parsed.tarih || report.report_date,
          evrakNo: parsed.evrakNo || report.z_no,
          aciklama: `Kredi karti satis - Z No: ${parsed.evrakNo || report.z_no}`,
          hesapKodu: '101',
          hesapAdi: 'Alinan Cekler',
          borc: parsed.krediKarti,
          alacak: 0
        })
        entries.push({
          tarih: parsed.tarih || report.report_date,
          evrakNo: parsed.evrakNo || report.z_no,
          aciklama: `Satis hasilati (KK) - Z No: ${parsed.evrakNo || report.z_no}`,
          hesapKodu: '600',
          hesapAdi: 'Yurtici Satislar',
          borc: 0,
          alacak: parsed.krediKarti - (parsed.krediKarti / toplamSatis * toplamKdv)
        })
      }

      if (toplamKdv > 0) {
        entries.push({
          tarih: parsed.tarih || report.report_date,
          evrakNo: parsed.evrakNo || report.z_no,
          aciklama: `Hesaplanan KDV - Z No: ${parsed.evrakNo || report.z_no}`,
          hesapKodu: '391',
          hesapAdi: 'Hesaplanan KDV',
          borc: 0,
          alacak: toplamKdv
        })
      }
    } else {
      entries.push({
        tarih: parsed.tarih || report.report_date,
        evrakNo: parsed.evrakNo || report.z_no,
        aciklama: `Gunluk satis - Z No: ${parsed.evrakNo || report.z_no}`,
        hesapKodu: '100',
        hesapAdi: 'Kasa',
        borc: toplamSatis,
        alacak: 0
      })
      entries.push({
        tarih: parsed.tarih || report.report_date,
        evrakNo: parsed.evrakNo || report.z_no,
        aciklama: `Satis hasilati - Z No: ${parsed.evrakNo || report.z_no}`,
        hesapKodu: '600',
        hesapAdi: 'Satis Hasilati',
        borc: 0,
        alacak: toplamSatis
      })
    }
  })

  return entries
}

/**
 * Defter kayitlarini Excel olarak indirir
 */
export function downloadDefterExcel(entries, filename = 'defter_kayitlari.xlsx') {
  if (!entries || entries.length === 0) {
    console.warn('Indirilecek kayit bulunmuyor')
    return
  }

  const ws = XLSX.utils.json_to_sheet(entries)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Defter Kayitlari')
  
  ws['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 30 },
    { wch: 10 }, { wch: 20 }, { wch: 12 }, { wch: 12 }
  ]

  XLSX.writeFile(wb, filename)
}
