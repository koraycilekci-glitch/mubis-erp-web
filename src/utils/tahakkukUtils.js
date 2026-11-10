import { tahakkukDonemi } from '../services/documentService'

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
  //    YALNIZ dosya adindaki donem baseKey donemiyle uyusanlar — aksi halde
  //    tum aylarin evraklari her ayin tutarina karisir (tarih damgali adlar
  //    donemsiz oldugu icin hariclenir; bunlar tamirde dogru aya tasinir)
  const docs = beyanDurumlari?.[`${baseKey}_documents`]
  if (Array.isArray(docs)) {
    const parca = String(baseKey || '').split('_')
    const keyYil = parseInt(parca[0], 10)
    const keyAy = parseInt(parca[1], 10)
    const dosyaAdi = (url) => {
      try {
        const s = String(url || '').split('?')[0]
        return decodeURIComponent(s.substring(s.lastIndexOf('/') + 1))
      } catch { return '' }
    }
    docs.forEach(d => {
      if (d?.category === 'sigorta_tahakkuk' && d?.url && !seen.has(d.url)) {
        const donem = tahakkukDonemi(dosyaAdi(d.url))
        if (donem) {
          if (keyAy && donem.ay && donem.ay !== keyAy) return
          if (keyYil && donem.yil && donem.yil !== keyYil) return
        } else {
          return // donemsiz ad → gösterme (yanlis aya karismasin)
        }
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

/**
 * OLU / YANLIS DONEM KAYIT TEMIZLIGI (self-heal):
 * 1) Silinen/degisistirilen tahakkuk dosyalarinin DB kalintilarini temizler:
 *    Storage'da olmayan (HEAD 404) dosyalarin kayitlari cikarilir.
 * 2) Yanlis donemdeki tekil url/documents kayitlarini temizler: eski deplo
 *    ayni dosyayi birden fazla ayin `_tahakkuk_url`'ine yazabilmisti —
 *    dosya Storage'da hala var oldugu icin olu-dosya kontrolu onu goremez,
 *    ancak dosya adindaki donem baseKey'in donemiyle uyusmaz.
 *
 * Belirti: musteriya hatali/ayni tutar birden fazla ayda gosterilir; keşif
 * atlanir (tutar > 0).
 *
 * Donus: { yeniMap, degisti } — degisti ise cagiran DB'ye yazmali.
 */
export async function oluTahakkukTemizle(dbMap) {
  const map = { ...(dbMap || {}) }
  let degisti = false

  const dosyaVar = async (url) => {
    if (!url) return false
    try {
      const r = await fetch(url, { method: 'HEAD' })
      return r.ok
    } catch {
      return false
    }
  }

  const dosyaAdi = (url) => {
    try {
      const s = String(url || '').split('?')[0]
      return decodeURIComponent(s.substring(s.lastIndexOf('/') + 1))
    } catch { return '' }
  }

  // baseKey = <yil>_<ay>_<tur>; dosya adindaki donem uyusmuyorsa kayit
  // yanlis aya yazilmistir (donem tespit edilemeyenlere dokunulmaz)
  const donemUyumu = (url, yil, ay) => {
    const donem = tahakkukDonemi(dosyaAdi(url))
    if (!donem) return true
    if (donem.ay && ay && donem.ay !== ay) return false
    if (donem.yil && yil && donem.yil !== yil) return false
    return true
  }

  const baseKeyDonemi = (baseKey) => {
    const parca = String(baseKey || '').split('_')
    return { yil: parseInt(parca[0], 10), ay: parseInt(parca[1], 10) }
  }

  // Ilgili baseKey'leri topla: liste, tek url veya tutar alani olan tum tahakkuk
  // kayitlari (listesi olmayan salt-tutar kalintilari da yakalanir)
  const baseKeyler = new Set()
  for (const key of Object.keys(dbMap || {})) {
    if (key.endsWith('_tahakkuklar')) baseKeyler.add(key.replace(/_tahakkuklar$/, ''))
    else if (key.endsWith('_tahakkuk_url')) baseKeyler.add(key.replace(/_tahakkuk_url$/, ''))
    else if (key.endsWith('_tutar')) baseKeyler.add(key.replace(/_tutar$/, ''))
  }

  for (const baseKey of baseKeyler) {
    const key = `${baseKey}_tahakkuklar`
    const { yil, ay } = baseKeyDonemi(baseKey)

    // 1) Liste ogesi: oluler cikarilir + donem uyusmayanlar cikarilir
    const liste = Array.isArray(map[key]) ? map[key] : []
    const canliListe = []
    let listeDegisti = false
    for (const t of liste) {
      if (!(await dosyaVar(t?.url))) { listeDegisti = true; continue }
      if (!donemUyumu(t?.url, yil, ay)) { listeDegisti = true; continue }
      canliListe.push(t)
    }
    if (listeDegisti) { map[key] = canliListe; degisti = true }

    // _documents icindeki sigorta_tahakkuk kayitlari da getTahakkukList'e girer
    const docsKey = `${baseKey}_documents`
    const docs = Array.isArray(map[docsKey]) ? map[docsKey] : null
    if (docs) {
      const canliDocs = []
      let docsDegisti = false
      for (const d of docs) {
        if (d?.category === 'sigorta_tahakkuk' && d?.url) {
          if (!(await dosyaVar(d.url)) || !donemUyumu(d.url, yil, ay)) {
            docsDegisti = true
            continue
          }
        }
        canliDocs.push(d)
      }
      if (docsDegisti) { map[docsKey] = canliDocs; degisti = true }
    }

    // 2) Eski tek url kaydi: olu VEYA donem uyusmuyorsa temizlenir
    //    (ayni dosya dogru donemde zaten listelenir)
    const urlKey = `${baseKey}_tahakkuk_url`
    const tekUrl = map[urlKey]
    if (tekUrl && (!(await dosyaVar(tekUrl)) || !donemUyumu(tekUrl, yil, ay))) {
      map[urlKey] = ''
      degisti = true
    }

    // 3) Tutar/durum yeniden hesapla (kaynaklarin hepsi temizlendikten sonra)
    const birlesen = getTahakkukList(map, baseKey)
    const yeniTutar = sumTahakkukTutar(birlesen)
    const eskiTutar = Number(map[`${baseKey}_tutar`]) || 0
    if (yeniTutar !== eskiTutar) {
      map[`${baseKey}_tutar`] = yeniTutar
      degisti = true
    }
    if (birlesen.length === 0 && (eskiTutar > 0 || map[urlKey])) {
      // Hicbir gecerli dosya kalmadi: kalinti alanlari sifirla → keşif yeniden calisir
      map[`${baseKey}_tutar`] = 0
      map[`${baseKey}_analiz_durumu`] = ''
      map[urlKey] = ''
      map[`${baseKey}_son_odeme`] = ''
      map[`${baseKey}_tahakkuk_no`] = ''
      degisti = true
    }
  }

  return { yeniMap: map, degisti }
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
