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

async function runAnalyzeDocument(pdfUrl) {
  console.log('🚀 MUBIS Document Intelligence - SUNUCU analiz baslatiliyor...', pdfUrl)

  try {
    console.log('📡 Sunucuya istek gonderiliyor...')
    const response = await fetch('/api/analyze-document', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ pdfUrl })
    })

    console.log('📡 Sunucu yanit status:', response.status)

    const result = await response.json()
    console.log('📡 Sunucu yanit:', result)

    if (!response.ok) {
      console.error('❌ Sunucu hatasi:', response.status, result)
      return {
        success: false,
        error: result.error || `HTTP ${response.status}`,
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

    return result
  } catch (error) {
    console.error('❌ Document Intelligence istek hatasi:', error)
    return {
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