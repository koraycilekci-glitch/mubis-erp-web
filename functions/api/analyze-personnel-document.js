// MUBIS - PERSONEL BELGE OKUMA (Ise Giris / Isten Cikis Bildirgesi) (Cloudflare Pages Function)
// POST /api/analyze-personnel-document  Body: { fileUrl, bildirgeTipi }
// SGK Ise Giris / Isten Cikis Bildirgesi (PDF/gorsel) okuyup
// TC kimlik, ad soyad, dogum tarihi ve ilgili tarihi JSON olarak dondurur.

import { json } from './_lib.js'

export async function onRequestPost({ request, env }) {
  try {
    const { fileUrl, bildirgeTipi } = await request.json().catch(() => ({}))

    if (!fileUrl) {
      return json({ success: false, error: 'fileUrl gerekli' }, 400)
    }

    if (!['ise_giris', 'isten_cikis'].includes(bildirgeTipi)) {
      return json({ success: false, error: "bildirgeTipi 'ise_giris' veya 'isten_cikis' olmalı" }, 400)
    }

    const result = await runPersonnelAnalysis(env, fileUrl, bildirgeTipi)
    return json(result, result.success ? 200 : 422)
  } catch (err) {
    console.error('Personel Belge Okuma hatası:', err)
    return json({ success: false, error: err.message }, 500)
  }
}

async function runPersonnelAnalysis(env, fileUrl, bildirgeTipi) {
  const apiKey = env?.OPENAI_API_KEY
  if (!apiKey) {
    return { success: false, error: 'OPENAI_API_KEY bulunamadı.' }
  }

  const fileResponse = await fetch(fileUrl)
  if (!fileResponse.ok) {
    return { success: false, error: 'Belge indirilemedi.' }
  }

  const contentType = fileResponse.headers.get('content-type') || ''
  const arrayBuffer = await fileResponse.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  const isImage = contentType.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(fileUrl)

  const belgeAdi = bildirgeTipi === 'ise_giris' ? 'İşe Giriş Bildirgesi' : 'İşten Çıkış Bildirgesi'
  const tarihAlani = bildirgeTipi === 'ise_giris' ? 'ise_giris_tarihi' : 'isten_cikis_tarihi'

  const prompt = `Sen deneyimli bir Türk muhasebe/SGK uzmanısın.
Sana bir SGK ${belgeAdi} belgesi verilecek.
Belgeyi oku ve SADECE JSON döndür. Hiçbir açıklama yazma.

KURALLAR:
- tc_kimlik: 11 haneli TC kimlik numarası, sadece rakam.
- ad_soyad: sigortalının adı soyadı, büyük/küçük harf düzeltilmiş halde (ör. "Ahmet Yılmaz").
- dogum_tarihi: "YYYY-MM-DD" formatında.
- ${tarihAlani}: belgedeki ${bildirgeTipi === 'ise_giris' ? 'işe giriş' : 'işten çıkış'} tarihi, "YYYY-MM-DD" formatında.
- Emin olamadığın bir alanı boş string "" olarak bırak, tahmin etme.

JSON:
{
"tc_kimlik":"",
"ad_soyad":"",
"dogum_tarihi":"",
"${tarihAlani}":""
}`;

  const contentBlock = isImage
    ? {
        type: 'image_url',
        image_url: { url: `data:${contentType || 'image/jpeg'};base64,${base64}` }
      }
    : {
        type: 'file',
        file: {
          filename: 'bildirge.pdf',
          file_data: `data:application/pdf;base64,${base64}`
        }
      };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0,
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [contentBlock, { type: 'text', text: prompt }]
        }]
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error('OpenAI hatası:', data.error.message);
      return { success: false, error: data.error.message };
    }

    const content = data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { success: false, error: 'Belgeden veri okunamadı.' };
    }

    const result = JSON.parse(jsonMatch[0]);

    if (!result.tc_kimlik && !result.ad_soyad) {
      return { success: false, error: 'Belgede TC kimlik veya ad soyad bulunamadı.' };
    }

    return {
      success: true,
      bildirge_tipi: bildirgeTipi,
      tc_kimlik: (result.tc_kimlik || '').replace(/\D/g, ''),
      ad_soyad: result.ad_soyad || '',
      dogum_tarihi: result.dogum_tarihi || '',
      [tarihAlani]: result[tarihAlani] || ''
    };
  } catch (err) {
    console.error('Personel belge OpenAI analizi hatası:', err);
    return { success: false, error: err.message };
  }
}
