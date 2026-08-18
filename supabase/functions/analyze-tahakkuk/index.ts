import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as pdfjsLib from 'https://esm.sh/pdfjs-dist@4.0.379/build/pdf.mjs'

pdfjsLib.GlobalWorkerOptions.disableWorker = true

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { pdfUrl } = await req.json()
    
    if (!pdfUrl) {
      return new Response(
        JSON.stringify({ error: 'PDF URL gerekli' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // PDF'i indir
    const pdfResponse = await fetch(pdfUrl)
    const pdfBuffer = await pdfResponse.arrayBuffer()
    
    // PDF.js ile metni çıkar
    const text = await extractTextFromPDF(pdfBuffer)
    
    if (!text || text.length < 50) {
      return new Response(
        JSON.stringify({ error: 'PDF metni çıkarılamadı', text: '' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // OpenAI ile analiz et
    const openAIResult = await analyzeWithOpenAI(text)
    
    return new Response(
      JSON.stringify(openAIResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('Edge Function hatasi:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

async function extractTextFromPDF(pdfBuffer: ArrayBuffer): Promise<string> {
  try {
    const data = new Uint8Array(pdfBuffer)
    const loadingTask = pdfjsLib.getDocument({ data })
    const pdf = await loadingTask.promise
    let fullText = ''
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items.map((item: any) => item.str).join(' ')
      fullText += pageText + '\n'
    }
    
    return fullText
  } catch (error) {
    console.error('PDF text extraction error:', error)
    return ''
  }
}

async function analyzeWithOpenAI(text: string): Promise<any> {
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY')
  
  if (!openAIApiKey) {
    return { error: 'OpenAI API anahtari bulunamadi' }
  }

  const prompt = `Bu tahakkuk fişini analiz et. Sadece JSON formatında yanıt ver.

Metin:
${text}

JSON formatı:
{
  "vergi_turu": "KDV/MUHTASAR/SGK/KURUMLAR/GELIR/GECICI",
  "donem": "2026/08",
  "vergi_asli": 10000.00,
  "toplam_odenecek": 12540.32,
  "son_odeme": "2026-08-28",
  "vkn": "1234567890",
  "unvan": "FIRMA ADI A.S."
}

Eğer değer bulunamazsa null veya 0 kullan.`

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Sen bir mali müşavir asistanısın. Tahakkuk fişlerini analiz edersin.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 500
      })
    })

    const data = await response.json()
    
    if (data.error) {
      return { error: data.error.message }
    }

    const content = data.choices[0]?.message?.content || ''
    
    // JSON'ı parse et
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
    
    return { error: 'JSON parse edilemedi', raw: content }

  } catch (error) {
    console.error('OpenAI hatasi:', error)
    return { error: error.message }
  }
}
