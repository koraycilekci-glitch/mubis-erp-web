import { CORS, json, supabaseAdmin } from './_lib.js'

const BUCKET = 'client-documents'
const MAX_BODY_BYTES = 16 * 1024 * 1024

async function readBody(request) {
  const declaredSize = Number(request.headers.get('content-length'))
  if (declaredSize > MAX_BODY_BYTES) return { tooLarge: true }
  if (!request.body) return { invalid: true }
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  const parts = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY_BYTES) {
      await reader.cancel()
      return { tooLarge: true }
    }
    parts.push(decoder.decode(value, { stream: true }))
  }
  parts.push(decoder.decode())
  try { return { data: JSON.parse(parts.join('')) } } catch { return { invalid: true } }
}

export async function onRequestPost({ request, env }) {
  const token = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return json({ error: 'Oturum gerekli' }, 401)
  const admin = supabaseAdmin(env)
  const key = env?.SUPABASE_SERVICE_ROLE_KEY || env?.SUPABASE_SERVICE_KEY
  if (!admin || !key) return json({ error: 'Sunucu yapılandırması eksik' }, 503)

  try {
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData?.user) return json({ error: 'Oturum geçersiz' }, 401)

    const body = await readBody(request)
    if (body.tooLarge) return json({ error: 'Belge çok büyük' }, 413)
    if (body.invalid) return json({ error: 'Geçersiz JSON' }, 400)
    const clientId = String(body.data?.client_id || '').trim()
    const belgeNo = String(body.data?.belge_no || '').trim()
    const pdfB64 = String(body.data?.pdf_base64 || '')
    if (!/^[1-9]\d*$/.test(clientId) || !belgeNo || belgeNo.length > 256 || !pdfB64) {
      return json({ error: 'Geçerli müşteri, belge numarası ve PDF gerekli' }, 400)
    }

    const { data: client, error: clientError } = await admin.from('clients')
      .select('id,office_id,auth_user_id').eq('id', clientId).maybeSingle()
    if (clientError) return json({ error: 'Müşteri doğrulanamadı' }, 503)
    if (!client) return json({ error: 'Müşteri bulunamadı' }, 404)
    const { data: profile, error: profileError } = await admin.from('profiles')
      .select('role,office_id').eq('id', userData.user.id).maybeSingle()
    if (profileError) return json({ error: 'Kullanıcı yetkisi doğrulanamadı' }, 503)
    const staff = ['admin', 'personel'].includes(profile?.role) && profile.office_id && String(profile.office_id) === String(client.office_id)
    const owner = String(client.auth_user_id || '') === String(userData.user.id)
    if (profile?.role !== 'super_admin' && !staff && !owner) return json({ error: 'Bu müşteri için yetkiniz yok' }, 403)

    let ikili
    try { ikili = Uint8Array.from(atob(pdfB64), char => char.charCodeAt(0)) } catch { return json({ error: 'Geçersiz PDF verisi' }, 400) }
    if (new TextDecoder().decode(ikili.slice(0, 5)) !== '%PDF-' || ikili.length < 500) {
      return json({ error: 'Geçersiz PDF belgesi' }, 400)
    }

    const onek = `etebligat_${clientId}_${belgeNo.replace(/[^A-Za-z0-9_-]/g, '_')}`
    const yol = `etebligatlar/${clientId}/${onek}.pdf`
    const url = env?.VITE_SUPABASE_URL || env?.SUPABASE_URL || 'https://gxuqrxmpgoeyykoolmwv.supabase.co'
    const upload = await fetch(`${url}/storage/v1/object/${BUCKET}/${yol}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
      body: ikili
    })
    if (!upload.ok) return json({ error: 'Belge depolamaya yüklenemedi' }, 502)

    const fileUrl = `${url}/storage/v1/object/public/${BUCKET}/${yol}`
    const { error: updateError } = await admin.from('etebligatlar')
      .update({ file_url: fileUrl, dosya_adi: onek + '.pdf' }).eq('client_id', clientId).eq('belge_no', belgeNo)
    if (updateError) return json({ error: 'Belge yüklendi ancak kayıt güncellenemedi' }, 502)
    return json({ ok: true, file_url: fileUrl, dosya_adi: onek + '.pdf' })
  } catch {
    return json({ error: 'Belge kaydedilirken sunucuya ulaşılamadı' }, 503)
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS })
}
