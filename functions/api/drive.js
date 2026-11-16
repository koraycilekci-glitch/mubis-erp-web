import { CORS, json, dogrulaKullanici, accessTokenAl, klasorYoluHazirla, klasorBulVeyaOlustur, DRIVE_API, driveHeaders } from './_driveCommon.js'
import { driveClientAuthorize, driveDocumentAuthorize, signDriveCapability, verifyDriveCapability } from './_driveAccess.js'

const reply = (body, status = 200) => json(body, status, { 'Cache-Control': 'private, no-store' })

async function kokKlasorGetir(admin, token) {
  const { data, error } = await admin.from('app_settings').select('value')
    .eq('office_id', 1).eq('key', 'google_drive_root_folder_id').maybeSingle()
  if (error) throw new Error('Drive klasor ayari okunamadi')
  if (data?.value) return data.value
  const id = await klasorBulVeyaOlustur(token, 'MUBIS ERP', 'root')
  const saved = await admin.from('app_settings').upsert({ key: 'google_drive_root_folder_id', value: id, office_id: 1, updated_at: new Date().toISOString() }, { onConflict: 'office_id,key' })
  if (saved.error) throw new Error('Drive klasor ayari kaydedilemedi')
  return id
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function onRequestPost({ request, env }) {
  try {
    const kontrol = await dogrulaKullanici(request, env)
    if (!kontrol.ok) return reply({ ok: false, error: kontrol.hata }, kontrol.kod)
    if (!['super_admin', 'admin', 'personel', 'client', 'musteri'].includes(kontrol.profil?.role)) return reply({ ok: false, error: 'Drive yetkisi yok' }, 403)
    const body = await request.json()
    const action = body.action
    if (!['status', 'test', 'upload', 'register', 'archive'].includes(action)) return reply({ ok: false, error: 'Bu Drive islemi desteklenmiyor' }, 400)
    let permission
    let claims
    if (action === 'upload') {
      permission = await driveClientAuthorize(kontrol, body.clientId)
      if (!permission.ok) return reply({ ok: false, error: permission.hata }, permission.kod)
    }
    if (action === 'register') {
      claims = await verifyDriveCapability(env, body.ticket, 'upload')
      if (!claims || claims.userId !== kontrol.kullanici.id) return reply({ ok: false, error: 'Yukleme oturumu gecersiz' }, 403)
      permission = await driveClientAuthorize(kontrol, claims.clientId)
      if (!permission.ok) return reply({ ok: false, error: permission.hata }, permission.kod)
    }
    if (action === 'archive') {
      permission = await driveDocumentAuthorize(kontrol, String(body.fileId || ''))
      if (!permission.ok) return reply({ ok: false, error: permission.hata }, permission.kod)
    }
    const kadro = await accessTokenAl(kontrol.admin, env)
    if (!kadro.ok) return reply({ ok: false, error: kadro.hata }, 400)
    if (action === 'status') return reply({ ok: true })
    const token = kadro.token
    if (action === 'test') {
      const root = await kokKlasorGetir(kontrol.admin, token)
      const response = await fetch(`${DRIVE_API}/files/${encodeURIComponent(root)}?fields=id,name,mimeType,webViewLink`, { headers: driveHeaders(token) })
      const meta = await response.json()
      if (!response.ok) return reply({ ok: false, error: 'Drive klasorune erisilemedi' }, 502)
      return reply({ ok: true, kokKlasorId: meta.id, kokKlasorAdi: meta.name, webViewLink: ['super_admin', 'admin'].includes(kontrol.profil.role) ? meta.webViewLink : '' })
    }
    if (action === 'upload') {
      const name = String(body.name || '').trim()
      const size = Number(body.size)
      if (!name || name.length > 255 || !Number.isSafeInteger(size) || size < 0) return reply({ ok: false, error: 'Gecersiz dosya bilgisi' }, 400)
      const mimeType = String(body.mimeType || 'application/octet-stream').split(';')[0].trim().toLowerCase()
      if (!/^[\w.+-]+\/[\w.+-]+$/.test(mimeType)) return reply({ ok: false, error: 'Gecersiz dosya turu' }, 400)
      const folders = (Array.isArray(body.yol) ? body.yol : []).slice(0, 8).filter(Boolean).map(part => String(part).slice(0, 120))
      if (permission.client) {
        const clientName = permission.client.company || permission.client.name || `Musteri_${permission.client.id}`
        if (folders.length) folders[0] = clientName
        else folders.push(clientName)
        if (String(permission.client.office_id) !== '1') folders.unshift(`OFIS_${permission.client.office_id}`)
      }
      const root = await kokKlasorGetir(kontrol.admin, token)
      const parent = await klasorYoluHazirla(token, root, folders)
      const nonce = crypto.randomUUID()
      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size', {
        method: 'POST',
        headers: { ...driveHeaders(token), 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mimeType, 'X-Upload-Content-Length': String(size), Origin: new URL(request.url).origin },
        body: JSON.stringify({ name, mimeType, parents: [parent], appProperties: { mubisUpload: nonce } }),
      })
      const uploadUrl = response.headers.get('Location')
      if (response.body) await response.body.cancel()
      if (!response.ok || !uploadUrl?.startsWith('https://www.googleapis.com/upload/')) return reply({ ok: false, error: 'Drive yukleme oturumu acilamadi' }, 502)
      const ticket = await signDriveCapability(env, { purpose: 'upload', userId: kontrol.kullanici.id, clientId: permission.client?.id || null, nonce, parent, yol: folders.join('/'), source: body.kaynak === 'manuel' ? 'manuel' : 'sistem', belgeTuru: String(body.belgeTuru || '').slice(0, 100) || null, name, mimeType, size }, 3600)
      return reply({ ok: true, uploadUrl, ticket })
    }
    if (action === 'register') {
      const fileId = String(body.fileId || '')
      if (!/^[\w-]+$/.test(fileId)) return reply({ ok: false, error: 'Gecersiz dosya kimligi' }, 400)
      const response = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,sha1Checksum,parents,appProperties,trashed`, { headers: driveHeaders(token) })
      const meta = await response.json()
      if (!response.ok || meta.trashed || meta.appProperties?.mubisUpload !== claims.nonce || !meta.parents?.includes(claims.parent) || Number(meta.size) !== claims.size || meta.name !== claims.name || meta.mimeType !== claims.mimeType) return reply({ ok: false, error: 'Yuklenen dosya dogrulanamadi' }, 409)
      const saved = await kontrol.admin.from('drive_belgeler').upsert({ drive_file_id: fileId, dosya_adi: meta.name, mime_type: meta.mimeType, boyut: Number(meta.size), sha1: meta.sha1Checksum || null, client_id: permission.client?.id || null, belge_turu: claims.belgeTuru, kaynak: claims.source, yol: claims.yol, durum: 'aktif', updated_at: new Date().toISOString() }, { onConflict: 'drive_file_id' })
      if (saved.error) return reply({ ok: false, error: 'Dosya Drive\'a yuklendi ancak belge kaydi yazilamadi', code: 'DRIVE_REFERENCE_FAILED' }, 503)
      return reply({ ok: true, fileId, fileName: meta.name, mimeType: meta.mimeType, size: Number(meta.size), url: `/api/drive-dosya?id=${encodeURIComponent(fileId)}` })
    }
    if (action === 'archive') {
      const saved = await kontrol.admin.from('drive_belgeler').update({ durum: 'arsiv', updated_at: new Date().toISOString() }).eq('drive_file_id', body.fileId)
      if (saved.error) return reply({ ok: false, error: 'Belge arsivlenemedi' }, 503)
      return reply({ ok: true, mesaj: 'Belge arsivlendi; Drive dosyasi silinmedi.' })
    }
  } catch {
    return reply({ ok: false, error: 'Drive islemi tamamlanamadi' }, 500)
  }
}
