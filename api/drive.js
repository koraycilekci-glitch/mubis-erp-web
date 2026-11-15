// api/drive.js
// Google Drive islemleri (sunucu tarafi).
//
// Neden access token dagitiyoruz?
//   Vercel serverless fonksiyonlarinin istek govdesi ~4.5MB ile sinirlidir.
//   Buyuk PDF/Excel dosyalari bu limiti asar. Bu yuzden:
//     1) Tarayici buradan kisa omurlu access token alir (oturum dogrulanir),
//     2) Dosya yukleme/indirme dogrudan tarayicidan Google'a gider (CORS acik).
//
// Islemler:
//   POST { action: 'token' }                 -> { ok, token, expires_in, kokKlasorId }
//   POST { action: 'test' }                  -> baglanti + klasor testi
//   POST { action: 'folder', yol: [...] }    -> klasor yolunu hazirlar, id doner
//   POST { action: 'archive', fileId }       -> dosyayi arsive tasir (soft delete)

import {
  cors,
  supabaseAdmin,
  dogrulaKullanici,
  accessTokenAl,
  klasorYoluHazirla,
  klasorBulVeyaOlustur,
  DRIVE_API,
  driveHeaders,
} from './_driveCommon.js'

const KOK_KLASOR_ADI = 'MUBIS ERP'
const KOK_KEY = 'google_drive_root_folder_id'

async function kokKlasorGetir(admin, token) {
  if (process.env.GOOGLE_DRIVE_FOLDER_ID) return process.env.GOOGLE_DRIVE_FOLDER_ID

  try {
    const { data } = await admin.from('app_settings').select('value').eq('key', KOK_KEY).maybeSingle()
    if (data?.value) return data.value
  } catch { /* yoksay */ }

  const id = await klasorBulVeyaOlustur(token, KOK_KLASOR_ADI, 'root')
  try {
    await admin.from('app_settings').upsert(
      { key: KOK_KEY, value: id, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )
  } catch { /* yoksay */ }
  return id
}

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Yalnizca POST destekleniyor' })
  }

  const kontrol = await dogrulaKullanici(req)
  if (!kontrol.ok) return res.status(kontrol.kod).json({ ok: false, error: kontrol.hata })

  let admin
  try {
    admin = supabaseAdmin()
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message })
  }

  const action = req.body?.action || 'token'

  try {
    const kadro = await accessTokenAl(admin)
    if (!kadro.ok) return res.status(400).json({ ok: false, error: kadro.hata })
    const token = kadro.token

    if (action === 'token') {
      const kok = await kokKlasorGetir(admin, token)
      return res.status(200).json({ ok: true, token, expires_in: 3300, kokKlasorId: kok })
    }

    if (action === 'test') {
      const kok = await kokKlasorGetir(admin, token)
      const yanit = await fetch(
        `${DRIVE_API}/files/${encodeURIComponent(kok)}?fields=id,name,mimeType,webViewLink`,
        { headers: driveHeaders(token) }
      )
      const json = await yanit.json().catch(() => ({}))
      if (!yanit.ok) {
        return res.status(400).json({
          ok: false,
          error: 'Kok klasore erisilemedi: ' + (json?.error?.message || `HTTP ${yanit.status}`),
        })
      }
      return res.status(200).json({
        ok: true,
        kokKlasorId: kok,
        kokKlasorAdi: json.name || KOK_KLASOR_ADI,
        webViewLink: json.webViewLink || '',
      })
    }

    if (action === 'folder') {
      const kok = await kokKlasorGetir(admin, token)
      const yol = Array.isArray(req.body?.yol) ? req.body.yol.filter(Boolean).map(String) : []
      const id = await klasorYoluHazirla(token, kok, yol)
      return res.status(200).json({ ok: true, klasorId: id, kokKlasorId: kok })
    }

    if (action === 'archive') {
      const fileId = String(req.body?.fileId || '')
      if (!fileId) return res.status(400).json({ ok: false, error: 'fileId gerekli' })
      const kok = await kokKlasorGetir(admin, token)
      // Klasorden cikarip kok dizine tasi (hard delete degil)
      const yanit = await fetch(
        `${DRIVE_API}/files/${encodeURIComponent(fileId)}?addParents=root&removeParents=${encodeURIComponent(kok)}&fields=id,name,parents`,
        { method: 'PATCH', headers: driveHeaders(token) }
      )
      const json = await yanit.json().catch(() => ({}))
      if (!yanit.ok) {
        return res.status(400).json({
          ok: false,
          error: 'Arsivleme basarisiz: ' + (json?.error?.message || `HTTP ${yanit.status}`),
        })
      }
      try {
        await admin.from('drive_belgeler').update({ durum: 'arsiv' }).eq('drive_file_id', fileId)
      } catch { /* yoksay */ }
      return res.status(200).json({ ok: true, mesaj: 'Belge arsive tasindi (silinmedi).' })
    }

    return res.status(400).json({ ok: false, error: 'Bilinmeyen islem: ' + action })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'Drive islemi basarisiz' })
  }
}
