const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

const source = fs.readFileSync('src/App.jsx', 'utf8')
const component = source.indexOf('function AppContent()')
const start = source.indexOf('  useEffect(() => {', component)
const end = source.indexOf('\n  if (loading) return null', start)
assert.ok(component >= 0 && start > component && end > start)
const effect = source.slice(start, end)
const flush = async () => { for (let index = 0; index < 4; index++) await new Promise(resolve => setImmediate(resolve)) }

function setup({ role = 'admin', profileId = 'user-1', loading = false, password = false, handler } = {}) {
  const calls = []
  const events = []
  let tick
  let cleanup
  const context = {
    user: { authUserId: 'user-1' }, profile: { id: profileId, role }, loading, needsPasswordChange: password,
    useEffect(callback) { cleanup = callback() },
    async yardimciIsYerel(name, params) { calls.push({ name, params }); return handler(name, params) },
    window: { dispatchEvent(event) { events.push(event.type) } },
    Event: class { constructor(type) { this.type = type } },
    setInterval(callback) { tick = callback; return 1 },
    clearInterval() {}, console,
  }
  vm.runInNewContext(effect, context)
  return { calls, events, tick: () => tick?.(), cleanup: () => cleanup?.() }
}

async function main() {
  for (const role of ['admin', 'super_admin', 'personel']) {
    const state = setup({ role, handler: name => name === 'admin-durum' ? { ok: true, ata: false } : { ok: true } })
    await flush()
    assert.deepEqual(state.calls.map(call => call.name), ['admin-durum', 'admin-ata'])
    assert.equal(state.calls[1].params.acik, true)
    assert.deepEqual(state.events, ['mubis-admin-ata-degisti'])
    state.tick()
    await flush()
    assert.equal(state.calls.length, 2)
  }
  for (const options of [{ role: 'musteri' }, { role: 'client' }, { profileId: 'another-user' }, { loading: true }, { password: true }]) {
    const state = setup({ ...options, handler: () => { throw Error('yetkisiz çağrı') } })
    await flush()
    assert.equal(state.calls.length, 0)
  }
  {
    const state = setup({ handler: () => ({ ok: true, ata: true }) })
    await flush()
    assert.deepEqual(state.calls.map(call => call.name), ['admin-durum'])
    state.tick()
    await flush()
    assert.equal(state.calls.length, 1)
  }
  {
    let count = 0
    const state = setup({ handler: name => name === 'admin-durum' ? (++count === 1 ? { ok: false } : { ok: true, ata: false }) : { ok: true } })
    await flush()
    assert.equal(state.calls.length, 1)
    state.tick()
    await flush()
    assert.deepEqual(state.calls.map(call => call.name), ['admin-durum', 'admin-durum', 'admin-ata'])
  }
  {
    let resolve
    const pending = new Promise(done => { resolve = done })
    const state = setup({ handler: () => pending })
    state.cleanup()
    resolve({ ok: true, ata: false })
    await flush()
    assert.deepEqual(state.calls.map(call => call.name), ['admin-durum'])
  }
  console.log('PASS: otomatik yönetici ayarı yalnızca doğrulanmış admin ve personel oturumunda yerel yardımcıya uygulanır; tekrar deneme ve çıkış kontrolleri çalışır.')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
