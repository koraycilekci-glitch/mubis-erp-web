// MUBIS - Mail gonderim (Cloudflare Pages Function)
// POST /api/send-email  Body: { toEmail, toName?, subject, message, documentUrl?, documents?, clientId?, beyanType?, year?, month?, documentType? }
// nodejs_compat bayragi ile nodemailer SMTP kullanir.
import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

export async function onRequestOptions() {
  return json({ ok: true })
}

export async function onRequestPost({ request, env }) {
  try {
    const { toEmail, toName, subject, message, documentUrl, documents, clientId, beyanType, year, month, documentType } = await request.json().catch(() => ({}))

    if (!toEmail || !subject) {
      return json({ error: 'toEmail and subject are required' }, 400)
    }

    // documents array veya tek documentUrl destegi
    const docs = Array.isArray(documents) && documents.length > 0
      ? documents
      : documentUrl
        ? [{ name: documentType === 'tahakkuk' ? 'tahakkuk.pdf' : 'beyanname.pdf', url: documentUrl }]
        : []

    // Supabase client (service role key ile settings okuyacagiz)
    const supabaseUrl = env?.VITE_SUPABASE_URL || env?.SUPABASE_URL
    const supabaseServiceKey = env?.SUPABASE_SERVICE_ROLE_KEY || env?.SUPABASE_SERVICE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return json({ error: 'Supabase credentials missing' }, 500)
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // app_settings tablosundan SMTP ayarlarini oku
    const { data: settingsRows, error: settingsError } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'smtp_secure'])

    if (settingsError) throw settingsError

    const settings = {}
    ;(settingsRows || []).forEach(row => {
      // Bos yinelenen satirlar (diger ofis/varsayilan) dolu degeri ezmesin
      if (row.value === null || row.value === undefined || row.value === '') return
      settings[row.key] = row.value
    })

    const host = settings.smtp_host
    const port = parseInt(settings.smtp_port || '587')
    const user = settings.smtp_user
    const pass = settings.smtp_pass
    const from = settings.smtp_from || user
    const secure = settings.smtp_secure === 'true' || port === 465

    if (!host || !user || !pass) {
      return json({ error: 'SMTP settings missing' }, 400)
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass }
    })

    const hasSignature = (message || '').toLowerCase().includes('saygilarimizla') || (message || '').toLowerCase().includes('saygılarımızla')
    const signatureHtml = hasSignature ? '' : '<p>Saygılarımızla,<br/>MUBiS ERP</p><p style="margin-top:12px; font-size:13px; color:#555;"><strong>Smmm Aziz Koray Çilekci</strong><br/>Mali Müşavir<br/>Mecidiye Mah. Büyükkuyu Sokak No:8/A Beşiktaş/İstanbul<br/>Telefon: +90 542 422 22 56<br/>WhatsApp: +90 551 084 90 29<br/>E-posta: <a href="mailto:info@mubiserp.com.tr">info@mubiserp.com.tr</a><br/>Web: <a href="https://www.mubiserp.com">www.mubiserp.com</a></p>'
    const signatureText = hasSignature ? '' : '\n\nSaygılarımızla,\nMUBiS ERP\n\nSmmm Aziz Koray Çilekci\nMali Müşavir\nMecidiye Mah. Büyükkuyu Sokak No:8/A Beşiktaş/İstanbul\nTelefon: +90 542 422 22 56\nWhatsApp: +90 551 084 90 29\nE-posta: info@mubiserp.com.tr\nWeb: www.mubiserp.com'

    const htmlBody = `
      <p>${message?.replace(/\n/g, '<br/>') || ''}</p>
      ${docs.length > 0 && !documents ? `<p>Doküman linki: <a href="${docs[0].url}">${docs[0].url}</a></p>` : ''}
      ${docs.length > 1 && documents ? `<p>Gonderilen dokumanlar:</p><ul>${docs.map(d => `<li><a href="${d.url}">${d.name || d.url}</a></li>`).join('')}</ul>` : ''}
      <br/>
      ${signatureHtml}
    `

    // PDF/Excel dosyalarini eklenti olarak ekle
    const attachments = []
    for (const doc of docs) {
      if (!doc.url) continue
      try {
        const fileRes = await fetch(doc.url)
        if (fileRes.ok) {
          const arrayBuffer = await fileRes.arrayBuffer()
          const ext = (doc.name || '').match(/\.(xlsx|xls)$/i) ? '.xlsx' : '.pdf'
          const fileName = doc.name ? (doc.name.endsWith('.pdf') || doc.name.endsWith('.xlsx') ? doc.name : doc.name + ext) : `belge${ext}`
          attachments.push({
            filename: fileName,
            content: Buffer.from(arrayBuffer)
          })
        }
      } catch (attachErr) {
        console.error('Eklenti hazirlama hatasi:', doc.url, attachErr)
      }
    }

    const linkText = docs.length > 0
      ? '\n\nDokuman linkleri:\n' + docs.map((d, i) => `${i + 1}. ${d.name || 'Belge'}: ${d.url}`).join('\n')
      : ''

    await transporter.sendMail({
      from: `"MUBiS ERP" <${from}>`,
      to: toEmail,
      subject,
      text: `${message || ''}${linkText}${signatureText}`,
      html: htmlBody,
      attachments
    })

    // Log kaydet
    try {
      await supabase.from('whatsapp_logs').insert({
        client_id: clientId || null,
        beyan_type: beyanType || '',
        year: year || null,
        month: month || null,
        document_type: documentType || 'beyanname',
        email: toEmail,
        channel: 'email',
        status: 'sent',
        sent_at: new Date().toISOString()
      })
    } catch (logErr) {
      console.error('Mail log hatasi:', logErr)
    }

    return json({ ok: true })
  } catch (err) {
    console.error('Mail gonderim hatasi:', err)
    return json({ error: err.message }, 500)
  }
}
