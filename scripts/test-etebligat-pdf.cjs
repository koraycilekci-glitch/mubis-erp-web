const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

const service = fs.readFileSync('src/services/etebligatService.js', 'utf8').replace(/\r\n/g, '\n')
const admin = fs.readFileSync('src/pages/Tebligatlar.jsx', 'utf8').replace(/\r\n/g, '\n')
const portal = fs.readFileSync('src/pages/ClientPortal.jsx', 'utf8').replace(/\r\n/g, '\n')
const start = service.indexOf('export async function tebligatPdfGetir(')
const end = service.indexOf('\n}\n', start) + 2
assert.ok(start >= 0 && end > start)
const validator = service.slice(start, end).replace('export ', '')
const pdf = '%PDF-1.7\n' + ' '.repeat(600) + '\n%%EOF'

async function validate(response, timeout = false) {
  let cleared = false
  let options
  const context = vm.createContext({
    Blob, Uint8Array, AbortController,
    fetch: async (url, requestOptions) => {
      options = requestOptions
      return typeof response === 'function' ? response(requestOptions) : response
    },
    setTimeout: callback => { if (timeout) queueMicrotask(callback); return 1 },
    clearTimeout: () => { cleared = true },
  })
  vm.runInContext(validator, context)
  const result = await context.tebligatPdfGetir('https://example.test/document.pdf')
  assert.equal(cleared, true)
  assert.equal(options.cache, 'no-store')
  return result
}

function reply(body, status = 200) {
  return new Response(body, { status })
}

async function validationTests() {
  for (const status of [400, 403, 404, 410, 500]) {
    const result = await validate(reply('{"code":"NoSuchKey"}', status))
    assert.equal(result.ok, false)
    assert.equal(result.status, status)
    assert.equal(result.blob, undefined)
  }
  for (const body of ['{"statusCode":"404"}', '<html>Login</html>'.repeat(60), '%PDF-']) {
    const result = await validate(reply(body))
    assert.equal(result.reason, 'gecersiz-pdf')
  }
  for (const marker of ['JasperReports', 'Jaspersoft']) {
    const result = await validate(reply(pdf + ' '.repeat(40000) + marker))
    assert.equal(result.reason, 'liste-ciktisi')
  }
  const good = await validate(reply(pdf))
  assert.equal(good.ok, true)
  assert.equal(good.blob.type, 'application/pdf')
  assert.equal(await good.blob.text(), pdf)
  assert.equal((await validate(() => { throw new Error('offline') })).ok, false)
  assert.equal((await validate({ ok: true, arrayBuffer: async () => { throw new Error('body failed') } })).ok, false)
  const timedOut = await validate(({ signal }) => new Promise((resolve, reject) => {
    if (signal.aborted) reject(new Error('aborted'))
    else signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
  }), true)
  assert.equal(timedOut.ok, false)
}

function handlerContext(source, name, dependencies, validationResult, recoveryResult) {
  const events = { opened: [], downloads: 0, recovered: 0, read: 0, messages: [] }
  const cache = new Map([['https://example.test/stale.pdf', true]])
  const context = vm.createContext({
    Blob, Set, console,
    seciliMusteri: { id: 1784 }, seciliId: 1784, topluIndiriliyor: false,
    clientDetail: { id: 1784 }, clientId: 1784,
    hazirKontrolOnbellek: cache, hazirOnbellek: cache,
    useCallback: callback => callback,
    tebligatPdfGetir: async () => validationResult,
    etebligatBelgesiAl: async () => {
      events.recovered++
      return recoveryResult || { ok: true, blob: new Blob([pdf]), url: 'https://example.test/recovered.pdf' }
    },
    okunduAyarla: async () => { events.read++ },
    setIslem() {}, setTebligatIslem() {}, setOkunduSetim() {},
    setHazirMap() {}, setTebligatHazir() {}, setSatirlar() {}, setDvsTebligatlar() {},
    setMesaj: message => { if (message) events.messages.push(message.metin) },
    alert: message => events.messages.push(message),
    setTimeout() {},
    URL: { createObjectURL: () => 'blob:verified-pdf', revokeObjectURL() {} },
    window: { open: url => events.opened.push(url) },
    document: {
      createElement: () => ({ click: () => { events.downloads++ }, remove() {} }),
      body: { appendChild() {} },
    },
  })
  const declaration = `const ${name} = useCallback(`
  const handlerStart = source.indexOf(declaration)
  const closing = `\n  }, [${dependencies}])`
  const handlerEnd = source.indexOf(closing, handlerStart) + closing.length
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart)
  vm.runInContext(source.slice(handlerStart, handlerEnd).replace(`const ${name}`, 'globalThis.handler'), context)
  return { context, events, cache }
}

async function handlerTests() {
  const handlers = [
    [admin, 'belgeAc', 'seciliMusteri, topluIndiriliyor'],
    [portal, 'portalBelgeAc', 'clientDetail, clientId'],
    [portal, 'portalBelgeIndir', 'clientDetail, clientId'],
  ]
  const row = { belge_no: 'example-document', file_url: 'https://example.test/stale.pdf', kaynak: 'vergi' }
  for (const [source, name, dependencies] of handlers) {
    const missing = handlerContext(source, name, dependencies, { ok: false, status: 404, reason: 'belge-erisim-hatasi' })
    await missing.context.handler(row)
    assert.equal(missing.events.recovered, 1, `${name}: missing PDF must be recovered`)
    assert.equal(missing.events.opened.includes(row.file_url), false)
    assert.equal(missing.cache.get(row.file_url), false)
    assert.equal(name === 'portalBelgeIndir' ? missing.events.downloads : missing.events.opened.length, 1)

    const valid = handlerContext(source, name, dependencies, { ok: true, blob: new Blob([pdf]) })
    await valid.context.handler(row)
    assert.equal(valid.events.recovered, 0)
    assert.equal(valid.events.opened.includes(row.file_url), false)
    assert.equal(name === 'portalBelgeIndir' ? valid.events.downloads : valid.events.opened.length, 1)
    if (name !== 'portalBelgeIndir') assert.equal(valid.events.read, 1)

    const sgk = handlerContext(source, name, dependencies, { ok: false, status: 404 })
    await sgk.context.handler({ ...row, kaynak: 'sgk' })
    assert.equal(sgk.events.recovered, 0, `${name}: SGK must not use DVS recovery`)
    assert.equal(sgk.events.opened.length + sgk.events.downloads + sgk.events.read, 0)
    assert.match(sgk.events.messages.join(' '), /SGK/)

    const failed = handlerContext(source, name, dependencies, { ok: false, status: 404 }, { ok: false, reason: 'offline' })
    await failed.context.handler(row)
    assert.equal(failed.events.opened.length + failed.events.downloads + failed.events.read, 0)
    assert.ok(failed.events.messages.length > 0)
  }
  for (const [source, cache] of [[admin, 'hazirKontrolOnbellek'], [portal, 'hazirOnbellek']]) {
    assert.match(source, new RegExp(`${cache}\\.set\\([st]\\.file_url, belge\\.ok\\)`))
    assert.doesNotMatch(source, /listeCiktisiMi|window\.open\([^\n]*file_url|href=\{t\.file_url\}/)
  }
}

async function main() {
  await validationTests()
  await handlerTests()
  console.log('PASS: e-Tebligat PDF validation, stale-cache recovery, admin/portal view/download, SGK and failure handling')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
