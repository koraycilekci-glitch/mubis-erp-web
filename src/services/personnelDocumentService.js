import { createWorker } from 'tesseract.js'
import { supabase } from '../lib/supabase'
import { getMyOfficeId } from './officeService'

const LABELS = /(?:t\s*\.?\s*c\s*\.?\s*(?:kimlik\s*(?:no|numarasi)?|numarasi)|sigortali(?:nin)?\s*(?:adi\s*(?:ve\s*)?soyadi|kimlik\s*numarasi)|ad\s*soyad|(?:[1-9]\s*)?adi\s*(?:ve\s*)?soyadi|(?:[1-9]\s*)?(?:ilk\s*soyadi|soyad)|(?:[1-9]\s*)?(?:adi|baba\s*adi|ana\s*adi|dogum\s*yeri|dogum\s*tarihi|yabanci\s*uyruklu\s*ise\s*ulke\s*adi|ogrenim\s*durumu|mezuniyet\s*yili|ise\s*giris\s*tarihi|ise\s*baslama\s*tarihi|ise\s*basladigi\s*tarih|ise\s*baslayacagi\s*tarih|meslek\s*(?:adi\s*(?:ve\s*)?kodu|kodu\s*(?:ve\s*)?adi|kodu|adi)|4857\s*sayili\s*kanunun|6356\s*sk))/gi

const normalizeText = (value) => String(value || '')
  .toLocaleLowerCase('tr-TR')
  .replace(/[ı]/g, 'i')
  .replace(/[ç]/g, 'c')
  .replace(/[ğ]/g, 'g')
  .replace(/[ö]/g, 'o')
  .replace(/[ş]/g, 's')
  .replace(/[ü]/g, 'u')

function textFromPdfItems(items, pageWidth) {
  const positioned = items
    .filter((item) => item.str?.trim() && Number.isFinite(item.transform?.[4]) && Number.isFinite(item.transform?.[5]))
    .sort((first, second) => second.transform[5] - first.transform[5])
  if (!positioned.length) return items.map((item) => `${item.str || ''}${item.hasEOL ? '\n' : ' '}`).join('')

  const rows = []
  for (const item of positioned) {
    let row = rows.find((candidate) => Math.abs(candidate.y - item.transform[5]) <= 4)
    if (!row) {
      row = { y: item.transform[5], items: [] }
      rows.push(row)
    }
    row.items.push(item)
  }
  const middle = pageWidth / 2
  return rows.flatMap((row) => {
    const sorted = row.items.sort((first, second) => first.transform[4] - second.transform[4])
    return [sorted.filter((item) => item.transform[4] < middle), sorted.filter((item) => item.transform[4] >= middle)]
      .filter((part) => part.length)
      .map((part) => part.map((item) => item.str).join(' '))
  }).join('\n')
}

async function readPdfText(file) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
    pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default
  }
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const pdf = await loadingTask.promise
  const pages = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    pages.push(textFromPdfItems(content.items, page.getViewport({ scale: 1 }).width))
  }
  return { pdf, loadingTask, text: pages.join('\n') }
}

async function recognizePdfPages(pdf) {
  const worker = await createWorker('tur')
  const pages = []
  try {
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 3); pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 2 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('PDF görüntüsü okunamadı.')
      await page.render({ canvasContext: context, viewport }).promise
      const result = await worker.recognize(canvas)
      pages.push(result.data.text || '')
      canvas.width = 0
      canvas.height = 0
    }
  } finally {
    await worker.terminate()
  }
  return pages.join('\n')
}

function normalizeWithSourceMap(text) {
  let normalized = ''
  const starts = []
  const ends = []
  let sourceIndex = 0
  for (const character of String(text || '')) {
    const part = normalizeText(character)
    normalized += part
    for (let index = 0; index < part.length; index += 1) {
      starts.push(sourceIndex)
      ends.push(sourceIndex + character.length)
    }
    sourceIndex += character.length
  }
  return { normalized, starts, ends }
}

function getFieldValue(text, labelPattern) {
  const { normalized, starts, ends } = normalizeWithSourceMap(text)
  const match = new RegExp(labelPattern, 'i').exec(normalized)
  if (!match) return ''
  const valueStart = match.index + match[0].length
  const remainder = normalized.slice(valueStart)
  const normalizedStart = valueStart + (/^[ \t]*[:：\-–]?[ \t]*/.exec(remainder)?.[0].length || 0)
  LABELS.lastIndex = 0
  const nextLabel = LABELS.exec(remainder)
  LABELS.lastIndex = 0
  const nextLine = remainder.indexOf('\n', normalizedStart - valueStart)
  const end = Math.min(nextLabel ? nextLabel.index : remainder.length, nextLine >= 0 ? nextLine : remainder.length)
  const normalizedEnd = valueStart + Math.max(end, normalizedStart - valueStart)
  const sourceStart = starts[normalizedStart] ?? String(text || '').length
  const sourceEnd = normalizedEnd > normalizedStart ? ends[normalizedEnd - 1] : sourceStart
  return String(text || '').slice(sourceStart, sourceEnd).replace(/[\s:：|]+$/g, '').trim()
}

function getTcNumber(text) {
  const { normalized: sourceText } = normalizeWithSourceMap(text)
  const normalized = sourceText.replace(/(?<=\d)[ \t]+(?=\d)/g, '')
  const labels = /(?:sosyal\s*guvenlik\s*sicil\s*numarasi|t\s*\.?\s*c\s*\.?\s*(?:kimlik\s*(?:no|numarasi)?|numarasi)|sigortali(?:nin)?\s*kimlik\s*numarasi)/gi
  for (const match of normalized.matchAll(labels)) {
    const number = normalized.slice(match.index + match[0].length, match.index + match[0].length + 180).match(/\b\d{11}\b/)
    if (number) return number[0]
  }
  return ''
}

function normalizeDate(value) {
  const match = String(value || '').match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b|\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (!match) return ''
  const year = Number(match[4] || match[3])
  const month = Number(match[5] || match[2])
  const day = Number(match[6] || match[1])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return ''
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function cleanOccupation(value) {
  return String(value || '')
    .replace(/^\s*\d{2,}(?:\.\d+)*\s*[-–—:]?\s*/, '')
    .replace(/\s*[-–—:]?\s*\d{2,}(?:\.\d+)*\s*$/, '')
    .replace(/[\s:：|\-–—]+$/g, '')
    .trim()
}

export function parseEmploymentNoticeText(text) {
  const name = getFieldValue(text, String.raw`(?:sigortali(?:nin)?\s*)?(?:adi\s*(?:ve\s*)?soyadi|ad\s*soyad)[ \t]*[:：]?`)
  const firstName = getFieldValue(text, String.raw`(?:[1-9][ \t]*)?adi[ \t]*[:：]?`)
  const surname = getFieldValue(text, String.raw`(?:[1-9][ \t]*)?soyad(?:i)?[ \t]*[:：]?`)
  const birthDate = getFieldValue(text, String.raw`(?:[1-9][ \t]*)?dogum\s*tarihi[ \t]*[:：]?`)
  const hireDate = getFieldValue(text, String.raw`(?:ise\s*giris\s*tarihi|ise\s*baslama\s*tarihi|ise\s*basladigi\s*tarih|ise\s*baslayacagi\s*tarih)[ \t]*[:：]?`)
  const occupation = getFieldValue(text, String.raw`(?:[1-9][ \t]*)?meslek\s*(?:adi\s*(?:ve\s*)?kodu|kodu\s*(?:ve\s*)?adi|kodu|adi)[ \t]*[:：]?`)
  return {
    ad_soyad: (name || [firstName, surname].filter(Boolean).join(' ')).replace(/\s+/g, ' ').trim(),
    tc_kimlik: getTcNumber(text),
    dogum_tarihi: normalizeDate(birthDate),
    ise_giris_tarihi: normalizeDate(hireDate),
    gorev: cleanOccupation(occupation)
  }
}

export async function readEmploymentNotice(file) {
  if (!file || (!file.type?.includes('pdf') && !/\.pdf$/i.test(file.name || ''))) {
    throw new Error('Lütfen PDF biçiminde işe giriş bildirgesi seçin.')
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('İşe giriş bildirgesi 15 MB sınırını aşamaz.')
  }
  const { pdf, loadingTask, text: embeddedText } = await readPdfText(file)
  const embeddedFields = parseEmploymentNoticeText(embeddedText)
  let fields = embeddedFields
  let ocrUsed = false
  if (Object.values(embeddedFields).some((value) => !value)) {
    try {
      const ocrFields = parseEmploymentNoticeText(await recognizePdfPages(pdf))
      fields = Object.fromEntries(Object.entries(embeddedFields).map(([key, value]) => [key, value || ocrFields[key]]))
      ocrUsed = true
    } catch {
      fields = embeddedFields
    }
  }
  await loadingTask.destroy()
  return { fields, ocrUsed }
}

export async function uploadEmploymentNotice({ clientId, employeeId, file }) {
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('office_id')
    .eq('id', clientId)
    .single()
  if (clientError) throw clientError
  const officeId = Number(client?.office_id) || Number(await getMyOfficeId())
  if (!officeId) throw new Error('Müşterinin ofis bilgisi bulunamadığı için bildirge güvenli şekilde yüklenemedi.')
  const safeName = `ise_giris_${Date.now()}.pdf`
  const path = `office_${officeId}/client_${clientId}/employee_${employeeId}/${safeName}`
  const { error } = await supabase.storage
    .from('personnel-documents')
    .upload(path, file, { upsert: true, contentType: 'application/pdf' })
  if (error) throw error
  return path
}

export async function getEmploymentNoticeSignedUrl(path) {
  if (!path) return null
  const { data, error } = await supabase.storage
    .from('personnel-documents')
    .createSignedUrl(path, 60 * 60)
  if (error) throw error
  return data?.signedUrl || null
}
