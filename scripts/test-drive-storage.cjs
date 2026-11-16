const fs = require('node:fs')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const { webcrypto } = require('node:crypto')

function load(file, bindings = {}) {
  const source = fs.readFileSync(file, 'utf8').replace(/^import [\s\S]*? from ['"][^'"]+['"]\r?$/gm, '').replace(/^export /gm, '')
  const context = vm.createContext({ console, Date, URL, URLSearchParams, Request, Response, Headers, Blob, TextEncoder, TextDecoder, btoa, atob, crypto: webcrypto, ...bindings })
  vm.runInContext(source, context, { filename: file })
  return context
}

function database() {
  const state = {
    clients: [
      { id: 1, office_id: 1, auth_user_id: 'owner', name: 'Test Client', vkn: '1111111111' },
      { id: 2, office_id: 2, auth_user_id: 'other', name: 'Other Client', vkn: '2222222222' },
    ],
    drive_belgeler: [
      { drive_file_id: 'owned', client_id: 1, durum: 'aktif', dosya_adi: 'invoice.pdf', mime_type: 'application/pdf' },
      { drive_file_id: 'foreign', client_id: 2, durum: 'aktif', dosya_adi: 'other.pdf' },
      { drive_file_id: 'legacy', client_id: null, durum: 'aktif', eski_storage_path: '1111111111_test/faturalar/2026/invoice.xml' },
      { drive_file_id: 'wrong-office', client_id: null, durum: 'aktif', eski_storage_path: 'ofis_2/1111111111_test/invoice.xml' },
    ],
    app_settings: [{ key: 'google_drive_root_folder_id', value: 'root-folder', office_id: 1 }],
    failWrite: false,
  }
  const admin = { from(table) {
    let filters = []
    let values
    let action = 'read'
    let single = false
    let alternative
    const query = {
      select() { return query },
      eq(key, value) { filters.push(row => String(row[key]) === String(value)); return query },
      or(text) { alternative = text.split(',').map(item => item.split('.')); return query },
      limit() { return query },
      upsert(data) { action = 'upsert'; values = data; return query },
      update(data) { action = 'update'; values = data; return query },
      delete() { action = 'delete'; return query },
      maybeSingle() { single = true; return query },
      then(resolve, reject) {
        let rows = (state[table] || []).filter(row => filters.every(filter => filter(row)))
        if (alternative) rows = rows.filter(row => alternative.some(([key, , value]) => String(row[key]) === value))
        if (action !== 'read' && state.failWrite) return Promise.resolve({ data: null, error: { message: 'simulated database failure' } }).then(resolve, reject)
        if (action === 'upsert') {
          const existing = state[table].find(row => values.drive_file_id ? row.drive_file_id === values.drive_file_id : row.key === values.key && row.office_id === values.office_id)
          if (existing) Object.assign(existing, values)
          else state[table].push({ ...values })
        }
        if (action === 'update') rows.forEach(row => Object.assign(row, values))
        if (action === 'delete') state[table] = state[table].filter(row => !rows.includes(row))
        return Promise.resolve({ data: single ? rows[0] || null : rows, error: null }).then(resolve, reject)
      },
    }
    return query
  } }
  return { admin, state }
}

async function main() {
  const env = { SUPABASE_SERVICE_ROLE_KEY: 'isolated-test-signing-key' }
  let refreshCalls = 0
  const tokenCommon = load('functions/api/_driveCommon.js', { fetch: async () => {
    refreshCalls++
    return Response.json({ access_token: 'cached-test-token-' + refreshCalls, expires_in: 3600 })
  } })
  const googleEnv = { GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', GOOGLE_REFRESH_TOKEN: 'test-refresh' }
  assert.equal((await tokenCommon.accessTokenAl(null, googleEnv)).ok, true)
  assert.equal((await tokenCommon.accessTokenAl(null, googleEnv)).token, 'cached-test-token-1')
  assert.equal(refreshCalls, 1)
  googleEnv.GOOGLE_REFRESH_TOKEN = 'rotated-refresh'
  assert.equal((await tokenCommon.accessTokenAl(null, googleEnv)).token, 'cached-test-token-2')
  const originalNow = Date.now
  Date.now = () => originalNow() + 3600 * 1000
  assert.equal((await tokenCommon.accessTokenAl(null, googleEnv)).token, 'cached-test-token-3')
  Date.now = originalNow
  assert.equal(refreshCalls, 3)
  const access = load('functions/api/_driveAccess.js')
  const { admin, state } = database()
  const owner = { ok: true, admin, kullanici: { id: 'owner' }, profil: { role: 'musteri', office_id: 1 } }
  const staff = { ...owner, kullanici: { id: 'staff' }, profil: { role: 'personel', office_id: 1 } }
  const root = { ...owner, profil: { role: 'super_admin' } }
  assert.equal((await access.driveDocumentAuthorize(owner, 'owned')).ok, true)
  assert.equal((await access.driveDocumentAuthorize(owner, 'foreign')).kod, 403)
  assert.equal((await access.driveDocumentAuthorize(staff, 'owned')).ok, true)
  assert.equal((await access.driveDocumentAuthorize(staff, 'foreign')).kod, 403)
  assert.equal((await access.driveDocumentAuthorize(owner, 'legacy')).ok, true)
  assert.equal((await access.driveDocumentAuthorize(owner, 'wrong-office')).kod, 403)
  assert.equal((await access.driveClientAuthorize({ ...owner, profil: null }, 1)).kod, 403)
  assert.equal((await access.driveClientAuthorize(owner, null)).kod, 403)
  assert.equal((await access.driveClientAuthorize(root, null)).ok, true)
  const ticket = await access.signDriveCapability(env, { purpose: 'read', fileId: 'owned' }, 3600)
  assert.equal((await access.verifyDriveCapability(env, ticket, 'read')).fileId, 'owned')
  assert.equal(await access.verifyDriveCapability(env, ticket + 'x', 'read'), null)
  assert.equal(await access.verifyDriveCapability(env, ticket, 'upload'), null)
  assert.equal(await access.verifyDriveCapability({ SUPABASE_SERVICE_ROLE_KEY: 'rotated' }, ticket, 'read'), null)
  const savedNow = Date.now
  Date.now = () => savedNow() + 3601 * 1000
  assert.equal(await access.verifyDriveCapability(env, ticket, 'read'), null)
  Date.now = savedNow

  let activeUser = owner
  const common = {
    ...access,
    json: (body, status = 200, headers = {}) => Response.json(body, { status, headers }),
    dogrulaKullanici: async request => request.headers.has('Authorization') ? activeUser : { ok: false, kod: 401, hata: 'Login required' },
    supabaseAdmin: () => admin,
    accessTokenAl: async () => ({ ok: true, token: 'server-only-google-token' }),
    DRIVE_API: 'https://www.googleapis.com/drive/v3',
    driveHeaders: token => ({ Authorization: 'Bearer ' + token }),
    klasorBulVeyaOlustur: async () => 'root-folder',
    klasorYoluHazirla: async () => 'parent-folder',
  }
  let upstreamCalls = 0
  let rangeHeader
  const media = '<html><body>invoice@example.test</body></html>'
  const proxy = load('functions/api/drive-dosya.js', { ...common, fetch: async (url, options) => {
    upstreamCalls++
    rangeHeader = options.headers.Range
    return new Response(media, { status: rangeHeader ? 206 : 200, headers: { 'content-type': 'text/html', 'content-length': String(media.length), 'content-range': 'bytes 0-9/100' } })
  } })
  const get = (id, headers = {}) => proxy.onRequestGet({ request: new Request('https://app.test/api/drive-dosya?id=' + id, { headers }), env })
  assert.equal((await get('owned')).status, 401)
  assert.equal(upstreamCalls, 0)
  assert.equal((await get('foreign', { Authorization: 'Bearer test' })).status, 403)
  assert.equal(upstreamCalls, 0)
  const signResponse = await proxy.onRequestPost({ request: new Request('https://app.test/api/drive-dosya', { method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ fileId: 'owned' }) }), env })
  assert.equal(signResponse.status, 200)
  const signed = (await signResponse.json()).url
  assert.ok(!signed.includes('server-only-google-token'))
  let response = await proxy.onRequestGet({ request: new Request(signed), env })
  assert.equal(response.status, 200)
  assert.equal(await response.text(), media)
  assert.match(response.headers.get('cache-control'), /no-store/)
  assert.match(response.headers.get('cache-control'), /no-transform/)
  assert.equal(response.headers.has('content-security-policy'), false)
  response = await proxy.onRequestGet({ request: new Request(signed.replace('id=owned', 'id=foreign')), env })
  assert.equal(response.status, 401)
  response = await get('owned', { Authorization: 'Bearer test', Range: 'bytes=0-9' })
  assert.equal(response.status, 206)
  assert.equal(rangeHeader, 'bytes=0-9')
  await response.body.cancel()
  state.drive_belgeler[0].mime_type = 'text/html'
  response = await proxy.onRequestGet({ request: new Request(signed), env })
  assert.match(response.headers.get('content-security-policy'), /sandbox allow-scripts/)
  assert.ok(!response.headers.get('content-security-policy').includes('allow-same-origin'))
  await response.body.cancel()
  state.drive_belgeler[0].durum = 'arsiv'
  assert.equal((await proxy.onRequestGet({ request: new Request(signed), env })).status, 404)
  state.drive_belgeler[0].durum = 'aktif'

  let uploadMetadata
  let contentHeaders
  const drive = load('functions/api/drive.js', { ...common, fetch: async (url, options) => {
    if (url.includes('uploadType=resumable')) {
      uploadMetadata = JSON.parse(options.body)
      contentHeaders = options.headers
      return new Response(null, { headers: { Location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=test' } })
    }
    return Response.json({ id: 'new-file', ...uploadMetadata, size: '3', sha1Checksum: 'checksum' })
  } })
  const post = body => drive.onRequestPost({ request: new Request('https://app.test/api/drive', { method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env })
  assert.equal((await post({ action: 'token' })).status, 400)
  assert.equal((await post({ action: 'folder' })).status, 400)
  assert.equal((await post({ action: 'upload', clientId: 2, name: 'a.pdf', size: 3 })).status, 403)
  response = await post({ action: 'upload', clientId: 1, name: 'a.pdf', size: 3, mimeType: 'application/pdf', yol: ['Other Client', '2026'] })
  assert.equal(response.status, 200)
  const session = await response.json()
  assert.ok(!JSON.stringify(session).includes('server-only-google-token'))
  assert.equal(contentHeaders['Content-Type'], 'application/json; charset=UTF-8')
  const uploadClaims = await access.verifyDriveCapability(env, session.ticket, 'upload')
  assert.equal(uploadClaims.yol, 'Test Client/2026')
  state.failWrite = true
  response = await post({ action: 'register', fileId: 'new-file', ticket: session.ticket })
  assert.equal(response.status, 503)
  assert.equal((await response.json()).code, 'DRIVE_REFERENCE_FAILED')
  state.failWrite = false
  response = await post({ action: 'register', fileId: 'new-file', ticket: session.ticket })
  assert.equal(response.status, 200)
  assert.equal(state.drive_belgeler.find(row => row.drive_file_id === 'new-file').sha1, 'checksum')
  uploadMetadata.appProperties.mubisUpload = 'forged'
  assert.equal((await post({ action: 'register', fileId: 'foreign', ticket: session.ticket })).status, 409)
  activeUser = { ...owner, kullanici: { id: 'other' } }
  assert.equal((await post({ action: 'register', fileId: 'new-file', ticket: session.ticket })).status, 403)
  activeUser = owner

  const oauthEnv = { ...env, GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', GOOGLE_REDIRECT_URI: 'https://app.test/api/drive-auth' }
  const oauth = load('functions/api/drive-auth.js', { ...common, CORS: {}, fetch: async () => Response.json({ refresh_token: 'new-test-refresh' }) })
  const start = headers => oauth.onRequestGet({ request: new Request('https://app.test/api/drive-auth?action=start', { headers }), env: oauthEnv })
  assert.equal((await start({})).status, 401)
  assert.equal((await start({ Authorization: 'Bearer test' })).status, 403)
  activeUser = root
  response = await start({ Authorization: 'Bearer test' })
  assert.equal(response.status, 200)
  const oauthUrl = new URL((await response.json()).url)
  const oauthState = oauthUrl.searchParams.get('state')
  assert.match(oauthState, /^[a-f0-9-]{36}$/)
  const callback = () => oauth.onRequestGet({ request: new Request('https://app.test/api/drive-auth?code=test-code&state=' + oauthState), env: oauthEnv })
  assert.equal((await callback()).status, 302)
  assert.equal((await callback()).status, 400)
  assert.equal(state.app_settings.find(row => row.key === 'google_drive_refresh_token').value, 'new-test-refresh')
  activeUser = owner

  const apiCalls = []
  const storagePaths = []
  const sb = {
    supabaseUrl: 'https://example.supabase.co',
    auth: { getSession: async () => ({ data: { session: { access_token: 'user-session' } } }) },
    storage: { from: () => ({
      createSignedUrl: async path => { storagePaths.push(path); return { data: { signedUrl: 'https://storage.test/' + path } } },
      createSignedUrls: async paths => ({ data: paths.map(path => ({ path, signedUrl: 'https://storage.test/' + path })) }),
    }) },
  }
  const urls = load('src/utils/storageUrl.js', { supabase: sb, window: { location: { origin: 'https://app.test' } }, fetch: async (url, options) => {
    apiCalls.push({ url, options })
    if (options?.method === 'POST') return Response.json({ ok: true, url: signed })
    return new Response('document')
  } })
  for (const source of ['drive:owned', '/api/drive-dosya?id=owned', 'https://app.test/api/drive-dosya?id=owned']) {
    assert.equal(urls.getDriveFileId(source), 'owned')
    assert.equal(urls.toStoragePath(source), null)
    assert.equal(urls.isOwnStorageUrl(source), false)
    assert.equal(await urls.getViewUrl(source), signed)
  }
  assert.equal(urls.getDriveFileId('https://evil.test/api/drive-dosya?id=owned'), null)
  assert.equal(storagePaths.length, 0)
  assert.equal(await urls.getViewUrl('folder/a.pdf'), 'https://storage.test/folder/a.pdf')
  assert.equal(await (await urls.fetchDocument('drive:owned')).text(), 'document')
  assert.equal(apiCalls.at(-2).options.headers.Authorization, 'Bearer user-session')
  assert.equal(apiCalls.at(-1).options, undefined)
  await urls.getShareUrl('drive:owned')
  assert.equal(JSON.parse(apiCalls.at(-1).options.body).seconds, 2592000)
  const batch = await urls.getViewUrls(['drive:owned', 'folder/a.pdf', null, 'https://external.test/a.pdf'])
  assert.equal(batch[0], signed)
  assert.equal(batch[1], 'https://storage.test/folder/a.pdf')
  assert.equal(batch[2], null)
  assert.equal(batch[3], 'https://external.test/a.pdf')

  let referenceAttempts = 0
  let referenceOk = false
  const service = load('src/services/googleDriveService.js', { supabase: sb, fetch: async (url, options) => {
    if (options.method === 'PUT') {
      assert.equal(options.headers.Authorization, undefined)
      return Response.json({ id: 'uploaded' })
    }
    const payload = JSON.parse(options.body)
    if (payload.action === 'upload') return Response.json({ ok: true, uploadUrl: 'https://www.googleapis.com/upload/test', ticket: 'upload-ticket' })
    referenceAttempts++
    return referenceOk ? Response.json({ ok: true, fileName: 'a.pdf', size: 3, url: '/api/drive-dosya?id=uploaded' }) : Response.json({ ok: false, code: 'DRIVE_REFERENCE_FAILED', error: 'database write failed' }, { status: 503 })
  } })
  let result = await service.uploadFileToDrive(new Blob(['abc']), 'a.pdf', { clientId: 1 })
  assert.equal(result.success, false)
  assert.equal(result.uploaded, true)
  assert.equal(referenceAttempts, 2)
  referenceOk = true
  result = await service.uploadFileToDrive(new Blob(['abc']), 'a.pdf', { clientId: 1 })
  assert.equal(result.success, true)
  assert.equal(result.web_view_link, '/api/drive-dosya?id=uploaded')

  let storageUploads = 0
  let driveAvailable = true
  const documents = load('src/services/documentService.js', {
    supabase: { storage: { from: () => ({ upload: async () => { storageUploads++; return {} }, getPublicUrl: () => ({ data: { publicUrl: 'https://storage.test/fallback' } }) }) } },
    officePrefix: () => '', getMyOfficeId: async () => 1,
    driveHazirMi: async () => driveAvailable,
    uploadFileToDrive: async () => ({ success: false, uploaded: true, error: 'reference write failed', drive_file_id: 'uploaded' }),
  })
  const fileOptions = { client: { id: 1, office_id: 1 }, relPath: 'faturalar/2026/a.pdf', file: new Blob(['abc']) }
  await assert.rejects(documents.uploadClientFile(fileOptions), error => error.driveUploaded === true)
  assert.equal(storageUploads, 0)
  driveAvailable = false
  assert.equal((await documents.uploadClientFile(fileOptions)).url, 'https://storage.test/fallback')
  assert.equal(storageUploads, 1)
  console.log('PASS: Drive ownership, tenant isolation, legacy files, expiring links, tampering, streaming, range, HTML isolation, scoped uploads, verified reference writes, mixed viewers and safe Storage fallback')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
