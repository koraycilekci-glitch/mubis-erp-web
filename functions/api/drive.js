// MUBIS - Google Drive islemleri (Cloudflare Pages Function)
// POST /api/drive
//
// Islemler:
//   { action: 'token' }   -> kisa omurlu access token + kok klasor id
//   { action: 'test' }    -> baglanti + kok klasor testi
//   { action: 'folder' }  -> klasor yolu hazirlar, id doner
//   { action: 'archive' } -> dosyayi kok dizine tasir (soft delete)
//
// Not: Yukleme/indirme tarayicidan dogrudan Google'a gider (4.5MB limit
// gibi sinir burada yok); bu uctan yalnizca token/klasor/arsiv islemleri yapilir.

import {
  CORS, json, supabaseAdmin, dogrulaKullanici, accessTokenAl,
  klasorYoluHazirla, klasorBulVeyaOlustur, DRIVE_API, driveHeaders,
} from './_driveCommon.js'

const KOK_KLASOR_ADI = 'MUBIS ERP'
const KOK_KEY = 'google_drive_root_folder_id'

async function kokKlasorGetir(admin, token) {
  try {
    const { data } = await admin.from('app_settings').select('value').eq('key', KOK_KEY).maybeSingle()
    if (data?.value) return data.value
  } catch { /* yoksay */ }

  const id = await klasorBulVeyaOlustur(token, KOK_KLASOR_ADI, 'root')
  try {
    await admin.from('app_settings').upsert(
      { key: KOK_KEY, value: id, updated_at: new Date().toISOString(), office_id: 1 },
      { onConflict: 'office_id,key' }
    )
  } catch { /* yoksay */ }
  return id
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function onRequestPost({ request, env }) {
  let admin
  try {
    admin = supabaseAdmin(env)
  } catch (e) {
    return json({ ok: false, error: e.message }, 500)
  }

  const kontrol = await dogrulaKullanici(request, env)
  if (!kontrol.ok) return json({ ok: false, error: kontrol.hata }, kontrol.kod)

  let body = {}
  try { body = await request.json() } catch { /* bos govde */ }
  const action = body?.action || 'token'

  try {
    const kadro = await accessTokenAl(admin, env)
    if (!kadro.ok) return json({ ok: false, error: kadro.hata }, 400)
    const token = kadro.token

    if (action === 'token') {
      const kok = await kokKlasorGetir(admin, token)
      return json({ ok: true, token, expires_in: 3300, kokKlasorId: kok })
    }

    if (action === 'test') {
      const kok = await kokKlasorGetir(admin, token)
      const yanit = await fetch(
        `${DRIVE_API}/files/${encodeURIComponent(kok)}?fields=id,name,mimeType,webViewLink`,
        { headers: driveHeaders(token) }
      )
      const j = await yanit.json().catch(() => ({}))
      if (!yanit.ok) {
        return json({ ok: false, error: 'Kok klasore erisilemedi: ' + (j?.error?.message || `HTTP ${yanit.status}`) }, 400)
      }
      return json({
        ok: true,
        kokKlasorId: kok,
        kokKlasorAdi: j.name || KOK_KLASOR_ADI,
        webViewLink: j.webViewLink || '',
      })
    }

    if (action === 'folder') {
      const kok = await kokKlasorGetir(admin, token)
      const yol = Array.isArray(body?.yol) ? body.yol.filter(Boolean).map(String) : []
      const id = await klasorYoluHazirla(token, kok, yol)
      return json({ ok: true, klasorId: id, kokKlasorId: kok })
    }

    if (action === 'archive') {
      const fileId = String(body?.fileId || '')
      if (!fileId) return json({ ok: false, error: 'fileId gerekli' }, 400)
      const kok = await kokKlasorGetir(admin, token)
      const yanit = await fetch(
        `${DRIVE_API}/files/${encodeURIComponent(fileId)}?addParents=root&removeParents=${encodeURIComponent(kok)}&fields=id,name,parents`,
        { method: 'PATCH', headers: driveHeaders(token) }
      )
      const j = await yanit.json().catch(() => ({}))
      if (!yanit.ok) {
        return json({ ok: false, error: 'Arsivleme basarisiz: ' + (j?.error?.message || `HTTP ${yanit.status}`) }, 400)
      }
      try {
        await admin.from('drive_belgeler').update({ durum: 'arsiv' }).eq('drive_file_id', fileId)
      } catch { /* yoksay */ }
      return json({ ok: true, mesaj: 'Belge arsive tasindi (silinmedi).' })
    }

    return json({ ok: false, error: 'Bilinmeyen islem: ' + action }, 400)
  } catch (e) {
    return json({ ok: false, error: e?.message || 'Drive islemi basarisiz' }, 500)
  }
}
