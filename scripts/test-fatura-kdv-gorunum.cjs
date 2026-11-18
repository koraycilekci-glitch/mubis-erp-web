const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

const source = fs.readFileSync('src/components/FaturaListesiKarti.jsx', 'utf8')
const start = source.indexOf('  const yukle = async (yilAy) => {')
const end = source.indexOf('\n  // Donem degistikce', start)
assert.ok(start >= 0 && end > start)
const loadSource = source.slice(start, end) + '\nglobalThis.load = yukle'
const flush = async () => { for (let index = 0; index < 12; index++) await new Promise(resolve => setImmediate(resolve)) }
const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

function setup(overrides = {}) {
  const state = { invoices: [], details: {}, history: [], reads: 0, detailReads: 0 }
  const context = vm.createContext({
    clientId: 1, disDonem: { yil: 2026, ay: 10 }, listeIstekRef: { current: 0 },
    onarimYapilanClientlar: new Set(),
    setYukleniyor() {}, setListeHatasi() {}, uttsUnvanlariniSorgula() {},
    setFaturalar(rows) { state.invoices = rows },
    setKdvDetaylar(details) { state.details = details; state.history.push(details) },
    async faturalariGetir() { state.reads++; return [{ id: 1, matrah: 874.87, kdv: 9.06 }] },
    async kdvDetaylariGetir() { state.detailReads++; return {} },
    fisKdvDetayUret() { return null },
    async efaturaTutarlariOnar() { return { duzeltilen: 0 } },
    async efaturaKdvOranlariOnar() { return { yazilan: 0 } },
    ...overrides,
  })
  vm.runInContext(loadSource, context)
  return { context, state }
}

async function main() {
  const details = [{ oran: 1, matrah: 873.22, kdv: 8.73 }, { oran: 20, matrah: 1.65, kdv: 0.33 }]
  {
    let calls = 0
    const { context, state } = setup({
      async kdvDetaylariGetir() { return ++calls === 1 ? {} : { 1: details } },
      async efaturaKdvOranlariOnar() { return { yazilan: 1 } },
    })
    await context.load()
    await flush()
    assert.equal(state.reads, 2)
    assert.deepEqual(state.details[1], details)
    assert.equal(state.details[1].reduce((sum, row) => sum + row.kdv, 0).toFixed(2), '9.06')
  }
  {
    const { context, state } = setup({
      async kdvDetaylariGetir() { return { 1: details } },
      fisKdvDetayUret() { return [{ oran: 1, matrah: 874.87, kdv: 9.06 }] },
    })
    await context.load()
    await flush()
    assert.deepEqual(state.details[1], details)
    assert.equal(state.reads, 1)
  }
  {
    const initialRead = deferred()
    let repairing = false
    let reads = 0
    const { context, state } = setup({
      kdvDetaylariGetir() { return ++reads === 1 ? initialRead.promise : Promise.resolve({ 1: details }) },
      async efaturaKdvOranlariOnar() { repairing = true; return { yazilan: 1 } },
    })
    const loading = context.load()
    await flush()
    assert.equal(repairing, false)
    initialRead.resolve({})
    await loading
    await flush()
    assert.deepEqual(state.details[1], details)
    assert.equal(state.history.length, 2)
  }
  {
    const repair = deferred()
    const { context, state } = setup({ efaturaKdvOranlariOnar: () => repair.promise })
    await context.load()
    context.listeIstekRef.current++
    repair.resolve({ yazilan: 1 })
    await flush()
    assert.equal(state.reads, 1)
    assert.equal(state.history.length, 1)
  }
  {
    const refresh = deferred()
    let calls = 0
    const { context, state } = setup({
      async efaturaKdvOranlariOnar() { return { yazilan: 1 } },
      kdvDetaylariGetir() { return ++calls === 1 ? Promise.resolve({ 1: details }) : refresh.promise },
    })
    await context.load()
    await flush()
    context.listeIstekRef.current++
    refresh.resolve({ 99: details })
    await flush()
    assert.deepEqual(state.details[1], details)
    assert.equal(state.details[99], undefined)
  }
  {
    const { context, state } = setup({
      async kdvDetaylariGetir() { return { 1: details } },
      async efaturaKdvOranlariOnar() { throw new Error('offline') },
    })
    await context.load()
    await flush()
    assert.deepEqual(state.details[1], details)
    assert.equal(context.onarimYapilanClientlar.has(1), false)
  }
  const rateStart = source.indexOf('const STANDART_KDV_ORANLARI')
  const rateEnd = source.indexOf('\n// 2.7.575', rateStart)
  const rates = vm.createContext({})
  vm.runInContext(source.slice(rateStart, rateEnd), rates)
  assert.equal(rates.hesaplaKdvOrani({ matrah: 874.87, kdv: 9.06 }), null)
  assert.equal(rates.hesaplaKdvOrani({ matrah: 100, kdv: 20 }), 20)
  assert.equal(rates.hesaplaKdvOrani({ matrah: 100, kdv: 15 }), null)
  assert.ok(source.includes('if (!orans.length && f.xml_url)'))
  assert.ok(source.includes('return orans.length > 1 ?'))
  assert.ok(fs.readFileSync('src/pages/ClientPortal.jsx', 'utf8').includes('if (detay && !b[f.id]?.length)'))
  console.log('PASS: repaired VAT details refresh immediately; stored multi-rate breakdowns survive fallback; delayed reads cannot overwrite repairs; stale periods cannot update state; failed repairs can retry; mixed rates are not rounded to 1%.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
