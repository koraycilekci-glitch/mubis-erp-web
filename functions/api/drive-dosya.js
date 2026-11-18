import { json, supabaseAdmin, dogrulaKullanici, accessTokenAl, DRIVE_API } from './_driveCommon.js'
import { driveDocumentAuthorize, signDriveCapability, verifyDriveCapability } from './_driveAccess.js'

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, no-transform', 'Referrer-Policy': 'no-referrer' }
const reply = (body, status = 200) => json(body, status, PRIVATE_HEADERS)

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range',
  } })
}

export async function onRequestPost({ request, env }) {
  try {
    const kontrol = await dogrulaKullanici(request, env)
    if (!kontrol.ok) return reply({ ok: false, error: kontrol.hata }, kontrol.kod)
    const body = await request.json()
    const fileId = String(body.fileId || '').trim()
    if (!/^[\w-]+$/.test(fileId)) return reply({ ok: false, error: 'Gecersiz dosya kimligi' }, 400)
    const permission = await driveDocumentAuthorize(kontrol, fileId)
    if (!permission.ok) return reply({ ok: false, error: permission.hata }, permission.kod)
    const ticket = await signDriveCapability(env, { purpose: 'read', fileId }, body.seconds)
    const url = new URL('/api/drive-dosya', request.url)
    url.searchParams.set('id', fileId)
    url.searchParams.set('ticket', ticket)
    return reply({ ok: true, url: url.toString() })
  } catch {
    return reply({ ok: false, error: 'Belge baglantisi olusturulamadi' }, 500)
  }
}

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url)
    const fileId = String(url.searchParams.get('id') || '').trim()
    const ticket = url.searchParams.get('ticket')
    let admin
    let meta
    if (ticket) {
      const claims = await verifyDriveCapability(env, ticket, 'read')
      if (!claims || claims.fileId !== fileId) return reply({ ok: false, error: 'Belge baglantisi gecersiz veya suresi dolmus' }, 401)
      admin = supabaseAdmin(env)
      const result = await admin.from('drive_belgeler').select('mime_type,dosya_adi,boyut')
        .eq('drive_file_id', fileId).eq('durum', 'aktif').maybeSingle()
      if (result.error) return reply({ ok: false, error: 'Belge kaydi okunamadi' }, 503)
      meta = result.data
    } else {
      if (!/^[\w-]+$/.test(fileId)) return reply({ ok: false, error: 'Gecersiz dosya kimligi' }, 400)
      admin = supabaseAdmin(env)
      const result = await admin.from('drive_belgeler').select('mime_type,dosya_adi,boyut')
        .eq('drive_file_id', fileId).eq('durum', 'aktif').maybeSingle()
      if (result.error) return reply({ ok: false, error: 'Belge kaydi okunamadi' }, 503)
      meta = result.data
    }
    if (!meta) return reply({ ok: false, error: 'Dosya bulunamadi' }, 404)
    const kadro = await accessTokenAl(admin, env)
    if (!kadro.ok) return reply({ ok: false, error: kadro.hata }, 400)
    const headers = { Authorization: `Bearer ${kadro.token}` }
    const range = request.headers.get('Range')
    if (range && /^bytes=\d*-\d*$/.test(range)) headers.Range = range
    const upstream = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, { headers })
    if (!upstream.ok) {
      if (upstream.body) await upstream.body.cancel()
      return reply({ ok: false, error: `Drive indirme hatasi HTTP ${upstream.status}` }, upstream.status === 404 ? 404 : 502)
    }
    const contentType = meta.mime_type || upstream.headers.get('content-type') || 'application/octet-stream'
    const responseHeaders = new Headers({
      ...PRIVATE_HEADERS,
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(meta.dosya_adi || 'belge')}`,
      'Vary': 'Authorization, Range',
      'Access-Control-Allow-Origin': '*',
    })
    if (/html|xml|svg/i.test(contentType)) {
      responseHeaders.set('Content-Security-Policy', "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:")
    }
    for (const name of ['content-length', 'content-range', 'accept-ranges', 'content-encoding']) {
      const value = upstream.headers.get(name)
      if (value) responseHeaders.set(name, value)
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders, encodeBody: 'manual' })
  } catch {
    return reply({ ok: false, error: 'Belge indirilemedi' }, 500)
  }
}
