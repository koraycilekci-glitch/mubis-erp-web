const fs = require('node:fs')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const { webcrypto } = require('node:crypto')

function load(file, bindings = {}) {
  const source = fs.readFileSync(file, 'utf8').replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '')
  const context = vm.createContext({ console, URL, URLSearchParams, Request, Response, Headers, Uint8Array, TextEncoder, TextDecoder, btoa, atob, AbortSignal, crypto: webcrypto, ...bindings })
  vm.runInContext(source, context, { filename: file })
  return context
}

async function main() {
  const env = { SUPABASE_SERVICE_ROLE_KEY: 'isolated-test-key' }
  const access = load('functions/api/_driveAccess.js')
  const folder = (id, name, parent) => ({ id, name, parent, mimeType: 'application/vnd.google-apps.folder' })
  const file = (id, name, parent, size = 4) => ({ id, name, parent, mimeType: 'application/octet-stream', size: String(size) })
  let fixtures = [folder('edefter', 'EDEFTER', 'root'), folder('customer', 'TEST CLIENT', 'edefter'), folder('year', '2026', 'customer'), folder('month', 'EKİM', 'year'), folder('out', 'GİDEN', 'month'), folder('in', 'GELEN', 'month'), file('z-csv', 'Z RAPORU TEST.csv', 'out'), file('z-xlsm', 'Z RAPORU TEST.xlsm', 'out'), file('g-csv', 'ALDIĞI FİŞLER TEST.csv', 'in'), file('g-xlsm', 'ALDIĞI FİŞLER TEST.xlsm', 'in'), file('not-z', 'invoice.xlsx', 'out'), file('large', 'large.csv', 'in', 6 * 1024 * 1024)]
  const clients = [{ id: 1, office_id: 1, auth_user_id: 'owner', short_name: 'Test Client', name: 'Legal Test Name' }, { id: 2, office_id: 2, auth_user_id: 'other', name: 'Other Customer' }]
  const admin = { from(table) {
    const filters = []
    const query = {
      select() { return query },
      eq(key, value) { filters.push(row => String(row[key]) === String(value)); return query },
      async maybeSingle() { return { data: (table === 'clients' ? clients : []).find(row => filters.every(filter => filter(row))) || null, error: null } }
    }
    return query
  } }
  let auth = { ok: true, admin, profil: { role: 'musteri', office_id: 1 }, kullanici: { id: 'owner' } }
  let calls = 0
  let overflow = false
  let paginated = false
  const endpoint = load('functions/api/drive-dokum.js', {
    ...access, CORS: {}, json: (value, status = 200) => Response.json(value, { status }),
    dogrulaKullanici: async request => request.headers.has('Authorization') ? auth : { ok: false, kod: 401, hata: 'Login required' },
    accessTokenAl: async () => ({ ok: true, token: 'server-only-token' }),
    DRIVE_API: 'https://drive.test', driveHeaders: token => ({ Authorization: 'Bearer ' + token }),
    fetch: async (input, options) => {
      calls++
      assert.equal(options.headers.Authorization, 'Bearer server-only-token')
      const url = new URL(input)
      if (url.searchParams.has('q')) {
        const parent = /^'([^']+)' in parents/.exec(url.searchParams.get('q'))?.[1]
        if (paginated && parent === 'edefter' && !url.searchParams.has('pageToken')) return Response.json({ files: [], nextPageToken: 'next-page' })
        return Response.json({ files: fixtures.filter(item => item.parent === parent).map(({ parent: _ignored, ...item }) => item) })
      }
      const id = url.pathname.split('/').pop()
      const item = fixtures.find(item => item.id === id)
      if (!item) return new Response(null, { status: 404 })
      if (url.searchParams.get('alt') === 'media') return new Response(overflow ? new Uint8Array(5 * 1024 * 1024 + 1) : 'test')
      return Response.json({ ...item, parents: [item.parent], trashed: false })
    }
  })
  const request = async (payload, authenticated = true) => endpoint.onRequestPost({ env, request: new Request('https://app.test/api/drive-dokum', { method: 'POST', headers: authenticated ? { Authorization: 'Bearer session' } : {}, body: JSON.stringify(payload) }) })
  assert.equal((await request({ action: 'list', clientId: 1, yil: 2026, ay: 10 }, false)).status, 401)
  assert.equal((await request({ action: 'list', clientId: 2, yil: 2026, ay: 10 })).status, 403)
  assert.equal((await request({ action: 'list', clientId: 1, yil: 2026, ay: 13 })).status, 400)
  assert.equal(calls, 0)
  const response = await request({ action: 'list', clientId: 1, yil: 2026, ay: 10, shortName: 'Other Customer' })
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.dosyalar.length, 2)
  assert.deepEqual(result.dosyalar.map(item => item.tip), ['zraporu', 'gider'])
  assert.ok(result.dosyalar.every(item => item.ad.endsWith('.csv')))
  assert.equal(result.hatalar.length, 1)
  assert.ok(!JSON.stringify(result).includes('server-only-token'))
  const ticket = result.dosyalar[0].ticket
  const downloaded = await request({ action: 'download', clientId: 1, ticket })
  assert.equal(downloaded.status, 200)
  assert.equal(await downloaded.text(), 'test')
  assert.equal(downloaded.headers.get('cache-control'), 'no-store')
  assert.equal((await request({ action: 'download', clientId: 1, ticket: ticket + 'tampered' })).status, 403)
  auth = { ...auth, profil: { role: 'personel', office_id: 1 }, kullanici: { id: 'staff' } }
  assert.equal((await request({ action: 'download', clientId: 1, ticket })).status, 403)
  auth = { ...auth, kullanici: { id: 'owner' } }
  fixtures.find(item => item.id === 'z-csv').parent = 'unrelated'
  assert.equal((await request({ action: 'download', clientId: 1, ticket })).status, 409)
  fixtures.find(item => item.id === 'z-csv').parent = 'out'
  overflow = true
  assert.equal((await request({ action: 'download', clientId: 1, ticket })).status, 413)
  overflow = false
  paginated = true
  assert.equal((await (await request({ action: 'list', clientId: 1, yil: 2026, ay: 10 })).json()).dosyalar.length, 2)
  assert.equal((await (await request({ action: 'list', clientId: 1, yil: 2025, ay: 10 })).json()).dosyalar.length, 0)
  fixtures.push(file('customs-csv', 'EYLÜL-AFA GÜMRÜK.csv', 'in'), file('customs-xls', 'EYLÜL-AFA GÜMRÜK.xls', 'in'))
  const customs = (await (await request({ action: 'list', clientId: 1, yil: 2026, ay: 10 })).json()).dosyalar.filter(item => item.tip === 'gumruk')
  assert.equal(customs.length, 1)
  assert.equal(customs[0].ad, 'EYLÜL-AFA GÜMRÜK.csv')
  fixtures.push(folder('ambiguous', 'Test-Client', 'edefter'))
  assert.equal((await request({ action: 'list', clientId: 1, yil: 2026, ay: 10 })).status, 502)
  fixtures = fixtures.filter(item => item.id !== 'ambiguous')
  auth = { ...auth, profil: { role: 'super_admin' } }
  assert.equal((await request({ action: 'list', clientId: 2, yil: 2026, ay: 10 })).status, 502)
  console.log('PASS: server Drive scanning, CSV/XLSM pairing, pagination, tenant/user authorization, ticket tampering, moved files, stream limits and missing periods.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
