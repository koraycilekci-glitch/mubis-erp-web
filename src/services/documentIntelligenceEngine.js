/**
 * MUBIS Document Intelligence Engine - Client Side
 * SADECE sunucuya PDF URL'si gonderir, analiz sonucu alir
 * Hicbir PDF islemi client tarafinda yapilmaz
 */

/**
 * Ana analiz fonksiyonu
 * PDF URL'sini sunucuya gonderir, analiz sonucu dondurur
 */
const analysisCache = new Map()
const analysisInFlight = new Map()

export async function analyzeDocument(pdfUrl) {

  if (analysisCache.has(pdfUrl)) {
    console.log('🚀 Cache hit - analiz tekrar çalıştırılmıyor:', pdfUrl)
    return analysisCache.get(pdfUrl)
  }

  if (analysisInFlight.has(pdfUrl)) {
    console.log('🚀 Aynı analiz zaten çalışıyor - bekleniyor:', pdfUrl)
    return analysisInFlight.get(pdfUrl)
  }

  const promise = runAnalyzeDocument(pdfUrl)
  analysisInFlight.set(pdfUrl, promise)

  try {
    const result = await promise
    if (result.success) {
      analysisCache.set(pdfUrl, result)
    }
    return result
  } finally {
    analysisInFlight.delete(pdfUrl)
  }
}

// Sunucu PDF metnini cikaramazsa (Vercel bundle/OCR sorunlari) tarayicida
// pdfjs ile metin cikarip tekrar dener. Taranan goruntü belgelerde bu da
// basarisiz olur; o zaman sunucudaki AI fallback devreye girer.
async function extractTextClientSide(pdfUrl) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
    pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default
  }
  const loadingTask = pdfjsLib.getDocument({ url: pdfUrl })
  const pdf = await loadingTask.promise
  let text = ''
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo)
    const textContent = await page.getTextContent()
    text += textContent.items.map(item => item.str).join(' ') + ' '
  }
  return text.replace(/\s+/g, ' ').trim()
}

async function postAnalyze(payload) {
  const response = await fetch('/api/analyze-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const result = await response.json()
  return { ok: response.ok, result }
}

async function runAnalyzeDocument(pdfUrl) {
  console.log('🚀 MUBIS Document Intelligence - SUNUCU analiz baslatiliyor...', pdfUrl)

  let firstFailure = null

  try {
    console.log('📡 Sunucuya istek gonderiliyor...')
    const { ok, result } = await postAnalyze({ pdfUrl })
    console.log('📡 Sunucu yanit status:', ok, result)

    if (ok && result.success) return result
    firstFailure = {
      success: false,
      error: (!ok ? (result.error || `HTTP hatası`) : result.error) || 'Belge analiz edilemedi',
      document_type: 'BILINMIYOR',
      tax_type: '',
      period: '',
      amount: 0,
      tax_base: 0,
      due_date: '',
      company: '',
      vkn: '',
      accrual_no: ''
    }
  } catch (error) {
    console.error('❌ Document Intelligence istek hatasi:', error)
    firstFailure = {
      success: false,
      error: error.message,
      document_type: 'BILINMIYOR',
      tax_type: '',
      period: '',
      amount: 0,
      tax_base: 0,
      due_date: '',
      company: '',
      vkn: '',
      accrual_no: ''
    }
  }

  // Yedek: tarayicida metin cikarip sunucuya gonder
  try {
    console.log('🔄 Sunucu metin cikaramadi - tarayici icinde pdfjs ile deneniyor...')
    const clientText = await extractTextClientSide(pdfUrl)
    console.log('🔄 Tarayici metin uzunlugu:', clientText.length)

    if (clientText && clientText.length > 100) {
      const { ok, result } = await postAnalyze({ pdfUrl, pdfText: clientText })
      if (ok && result.success) return result
      if (result?.error) firstFailure = { ...firstFailure, error: result.error }
    } else {
      firstFailure = {
        ...firstFailure,
        error: 'PDF metni çıkarılamadı. Belge taranmış görüntü olabilir; bunun yerine belgeyi PDF olarak (görüntü değil) yükleyin.'
      }
    }
  } catch (clientErr) {
    console.error('❌ Tarayici ici metin cikarma hatasi:', clientErr)
  }

  return firstFailure
}

/**
 * Database Servisi - document_analysis CRUD islemleri
 */
export async function saveDocumentAnalysis(supabase, data) {
  const { data: result, error } = await supabase
    .from('document_analysis')
    .insert({
      client_id: data.client_id,
      document_type: data.document_type,
      storage_url: data.storage_url,
      analysis_status: data.success ? 'tamamlandi' : 'hata',
      json_result: data,
      created_at: new Date().toISOString()
    })
    .select()
    .single()
  
  if (error) {
    console.error('Document analysis kaydetme hatasi:', error)
    return null
  }
  
  return result
}

export async function getDocumentAnalysis(supabase, clientId, documentType = null) {
  let query = supabase
    .from('document_analysis')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  
  if (documentType) {
    query = query.eq('document_type', documentType)
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error('Document analysis getirme hatasi:', error)
    return []
  }
  
  return data || []
}

export async function updateDocumentAnalysis(supabase, id, updates) {
  const { data, error } = await supabase
    .from('document_analysis')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  
  if (error) {
    console.error('Document analysis guncelleme hatasi:', error)
    return null
  }
  
  return data
}