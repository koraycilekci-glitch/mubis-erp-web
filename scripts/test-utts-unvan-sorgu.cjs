const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const source = fs.readFileSync('src/services/efaturaService.js', 'utf8')
const start = source.indexOf('export async function uttsUnvanlariniGetir(')
const end = source.indexOf('\nexport async function faturalariGetir', start)
assert.ok(start >= 0 && end > start)

async function main() {
  const requests = []
  let fail = false
  const context = vm.createContext({
    AbortSignal,
    supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } } }) } },
    fetch: async (url, options) => {
      const body = JSON.parse(options.body)
      requests.push({ url, body, authorization: options.headers.Authorization })
      return { ok: !fail, json: async () => fail ? { success: false, error: 'GİB bağlantısı başarısız' } : { success: true, data: Object.fromEntries(body.vknler.map(vkn => [vkn, `Şirket ${vkn}`])) } }
    },
  })
  vm.runInContext(source.slice(start, end).replace('export async function', 'async function'), context)
  const invoices = Array.from({ length: 11 }, (_, index) => ({ tur: 'utts', karsi_vkn: String(1000000000 + index), karsi_unvan: '' }))
  invoices.push({ ...invoices[0] }, { tur: 'utts', karsi_vkn: '1000000000', karsi_unvan: 'Mevcut şirket' }, { tur: 'efatura', karsi_vkn: '2000000000', karsi_unvan: '' }, { tur: 'utts', karsi_vkn: '', karsi_unvan: '' })
  const result = await context.uttsUnvanlariniGetir(42, invoices)
  assert.equal(Object.keys(result).length, 11)
  assert.equal(result['1000000000'], 'Şirket 1000000000')
  assert.equal(requests.length, 2)
  assert.equal(requests[0].body.vknler.length, 10)
  assert.equal(requests[1].body.vknler.length, 1)
  assert.equal(requests[0].body.clientId, 42)
  assert.equal(requests[0].authorization, 'Bearer test-token')
  fail = true
  await assert.rejects(context.uttsUnvanlariniGetir(42, invoices), /GİB bağlantısı başarısız/)
  const portal = fs.readFileSync('src/pages/ClientPortal.jsx', 'utf8')
  const portalStart = portal.indexOf('  const faturalariYukle = async () => {')
  const portalEnd = portal.indexOf('\n  // 2.7.575', portalStart)
  assert.ok(portalStart >= 0 && portalEnd > portalStart)
  const state = { invoices: [], message: '' }
  const portalContext = vm.createContext({
    clientId: 42, faturaIstekRef: { current: 0 }, faturaClientRef: { current: 42 },
    faturalariGetir: async () => [{ id: 1, tur: 'utts', karsi_vkn: '1000000000', karsi_unvan: '' }],
    uttsUnvanlariniGetir: async () => ({ '1000000000': 'Örnek Şirket' }),
    setUttsUnvanMesaj: message => { state.message = message },
    setFaturalar: value => { state.invoices = typeof value === 'function' ? value(state.invoices) : value },
    kdvDetaylariGetir: async () => ({}), fisKdvDetayUret: () => null, setKdvDetaylar() {},
  })
  vm.runInContext(portal.slice(portalStart, portalEnd) + '\nglobalThis.load = faturalariYukle', portalContext)
  await portalContext.load()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(state.invoices[0].karsi_unvan, 'Örnek Şirket')
  assert.equal(state.message, '')
  assert.ok(portal.includes('UTTS ünvan sorgusu yapılamadı'))
  console.log('PASS: authenticated UTTS lookups deduplicate and batch VKNs, propagate errors, and update the customer portal.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
