const DOCUMENT_TYPE_LABELS = {
  sigorta_tahakkuk: 'Tahakkuk Fişi',
  tahakkuk: 'Tahakkuk Fişi',
  hizmet_listesi: 'Hizmet Listesi',
  bordro: 'Bordro',
}

export const getDocumentTypeLabel = (documentType) =>
  DOCUMENT_TYPE_LABELS[documentType] || documentType || 'Evrak'

export const normalizeTahakkukDocument = (document, fallbackType = 'tahakkuk') => {
  if (!document) return null
  if (typeof document === 'string') {
    return {
      url: document,
      documentType: fallbackType,
      label: getDocumentTypeLabel(fallbackType),
    }
  }

  const documentType = document.documentType || document.type || document.belge_turu || fallbackType
  return {
    ...document,
    documentType,
    label: document.label || getDocumentTypeLabel(documentType),
    url: document.url || document.publicUrl || document.storage_url || document.link || '',
    name: document.name || document.fileName || document.file_name || getDocumentTypeLabel(documentType),
  }
}

export const getTahakkukDocuments = (beyanDurumlari = {}) => {
  const documents = []
  const add = (value, type) => {
    const values = Array.isArray(value) ? value : value ? [value] : []
    values.forEach((item) => {
      const normalized = normalizeTahakkukDocument(item, type)
      if (normalized?.url || normalized?.storagePath || normalized?.path) documents.push(normalized)
    })
  }

  add(beyanDurumlari._tahakkuk_url, 'tahakkuk')
  add(beyanDurumlari._tahakkuklar, 'tahakkuk')
  add(beyanDurumlari._documents, 'tahakkuk')

  return documents.filter((document, index, all) => {
    const key = document.url || document.storagePath || document.path
    return all.findIndex((candidate) => (candidate.url || candidate.storagePath || candidate.path) === key) === index
  })
}

export const getVisiblePortalDocuments = (documents = [], taxType = '') => {
  const normalizedTaxType = String(taxType).toLowerCase()
  const isSgk = normalizedTaxType.includes('sgk') || normalizedTaxType.includes('sigorta')
  return documents
    .map((document) => normalizeTahakkukDocument(document))
    .filter((document) => {
      if (document.documentType === 'bordro') return false
      if (isSgk) return ['tahakkuk', 'sigorta_tahakkuk', 'hizmet_listesi'].includes(document.documentType)
      return ['tahakkuk', 'sigorta_tahakkuk'].includes(document.documentType)
    })
}
// Coklu tahakkuk/beyanname yardimcilari
// Veri modeli (geriye uyumlu):
//   `${baseKey}_tahakkuklar` = [{ url, name, uploadedAt, tutar, analiz_durumu, son_odeme, vergi_turu }]
//   `${baseKey}_beyanlar`    = [{ url, name, uploadedAt }]
//   SGK'da tahakkuklar ayrica `${baseKey}_documents` icinde category:'sigorta_tahakkuk' olarak tutulur.
//   Eski tek dosya kayitlari `_tahakkuk_url` / `_beyan_url` uzerinden okunmaya devam eder.

export function getTahakkukList(beyanDurumlari, baseKey) {
  const list = []
  const seen = new Set()
  let deduped = 0

  // 1. Yeni coklu tahakkuk array'i
  const arr = beyanDurumlari?.[`${baseKey}_tahakkuklar`]
  if (Array.isArray(arr)) {
    arr.forEach(t => {
      if (t?.url && !seen.has(t.url)) {
        seen.add(t.url)
        list.push(t)
      } else if (t?.url) {
        deduped++
      }
    })
  }

  // 2. _documents icindeki sigorta_tahakkuk kayitlari (SGK)
  const docs = beyanDurumlari?.[`${baseKey}_documents`]
  if (Array.isArray(docs)) {
    docs.forEach(d => {
      if (d?.category === 'sigorta_tahakkuk' && d?.url && !seen.has(d.url)) {
        seen.add(d.url)
        list.push({
          url: d.url,
          name: d.name || 'tahakkuk.pdf',
          uploadedAt: d.uploaded_at || d.uploadedAt || '',
          tutar: Number(d.tutar) || 0,
          analiz_durumu: d.analiz_durumu || ''
        })
      } else if (d?.category === 'sigorta_tahakkuk' && d?.url) {
        deduped++
      }
    })
  }

  // 3. Eski tek url kaydi
  const single = beyanDurumlari?.[`${baseKey}_tahakkuk_url`]
  if (single && !seen.has(single)) {
    seen.add(single)
    list.push({
      url: single,
      name: 'tahakkuk.pdf',
      uploadedAt: '',
      tutar: Number(beyanDurumlari[`${baseKey}_tutar`]) || 0,
      analiz_durumu: beyanDurumlari[`${baseKey}_analiz_durumu`] || '',
      son_odeme: beyanDurumlari[`${baseKey}_son_odeme`] || '',
      vergi_turu: beyanDurumlari[`${baseKey}_vergi_turu`] || ''
    })
  } else if (single) {
    deduped++
  }

  if (deduped > 0) {
    console.warn(`getTahakkukList [${baseKey}]: ${deduped} kayit ayni URL nedeniyle elendi. Ham kayit sayilari:`,
      `_tahakkuklar=${Array.isArray(arr) ? arr.length : 0}`,
      `_documents(sigorta_tahakkuk)=${Array.isArray(docs) ? docs.filter(d => d?.category === 'sigorta_tahakkuk').length : 0}`,
      `_tahakkuk_url=${single ? 1 : 0}`,
      'URLs:', Array.from(seen))
  }

  return list
}

export function getBeyanList(beyanDurumlari, baseKey) {
  const list = []
  const seen = new Set()

  const arr = beyanDurumlari?.[`${baseKey}_beyanlar`]
  if (Array.isArray(arr)) {
    arr.forEach(b => {
      if (b?.url && !seen.has(b.url)) {
        seen.add(b.url)
        list.push(b)
      }
    })
  }

  const single = beyanDurumlari?.[`${baseKey}_beyan_url`]
  if (single && !seen.has(single)) {
    seen.add(single)
    list.push({ url: single, name: 'beyanname.pdf', uploadedAt: '' })
  }

  return list
}

export function sumTahakkukTutar(list) {
  return list.reduce((sum, t) => sum + (Number(t.tutar) || 0), 0)
}

/** SGK icin musteriye gosterilecek hizmet listesi(ler)ini bulur.
 *  `_beyan_url` SGK'da genellikle hizmet listesi PDF'idir; yoksa
 *  `_documents` icinde category === 'hizmet_listesi' olanlar doner.
 */
export function getHizmetListesi(beyanDurumlari, baseKey) {
  const list = []
  const seen = new Set()

  const single = beyanDurumlari?.[`${baseKey}_beyan_url`]
  if (single && !seen.has(single)) {
    seen.add(single)
    list.push({ url: single, name: 'Hizmet Listesi' })
  }

  const docs = beyanDurumlari?.[`${baseKey}_documents`]
  if (Array.isArray(docs)) {
    docs.forEach(d => {
      if (d?.category === 'hizmet_listesi' && d?.url && !seen.has(d.url)) {
        seen.add(d.url)
        list.push({ url: d.url, name: d.name || 'Hizmet Listesi' })
      }
    })
  }

  return list
}
