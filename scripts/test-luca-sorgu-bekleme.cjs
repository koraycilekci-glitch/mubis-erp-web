const fs = require('node:fs')
const vm = require('node:vm')
const assert = require('node:assert/strict')

const helper = fs.readFileSync('src/utils/gibOdemeHelper.js', 'utf8')
const start = helper.indexOf('const LUCA_ENGEL_DESEN =')
const end = helper.indexOf('export async function gibYardimciIs(', start)
assert.ok(start >= 0 && end > start)
const code = helper.slice(start, end).replace(/^export /gm, '')

function pollingContext(replies, options = {}) {
  let now = 0
  let posts = 0
  let polls = 0
  let local = 0
  const context = vm.createContext({
    console, AbortSignal, AbortController,
    Date: { now: () => now },
    setTimeout: (callback, milliseconds) => { now += milliseconds; queueMicrotask(callback); return 1 },
    clearTimeout() {}, setInterval, clearInterval,
    sunucuBeklemede: () => false,
    sunucuHataIsaretle() {}, sunucuHataTemizle() {}, sunucuZorunluBasliklar: () => ({}),
    SUNUCU_KAPALI_MESAJ: 'offline',
    yardimciFetch: async (url) => {
      if (url === '/api/yardimci/is') {
        posts++
        return { ok: true, json: async () => ({ success: true, isId: 'job-1' }) }
      }
      if (url.includes('/is-sonuc?')) {
        polls++
        const reply = replies(polls)
        options.afterReply?.(polls)
        return { status: 200, json: async () => reply }
      }
      local++
      throw new Error('Unexpected local fallback')
    },
  })
  vm.runInContext(code, context)
  return { context, stats: () => ({ now, posts, polls, local }) }
}

async function pollingTests() {
  const stuck = pollingContext(() => ({ success: true, durum: 'calisiyor', adim: 'akilli-entegrasyon-menusu' }))
  const result = await stuck.context.sunucuyaIsGonder('efatura-sorgula', {}, 1500000, null, {
    adimZamanAsimlari: { 'akilli-entegrasyon-menusu': 120000 },
  })
  assert.equal(result.ok, false)
  assert.match(result.reason, /islem takibi suresinde tamamlanmadi/)
  assert.ok(stuck.stats().now >= 120000 && stuck.stats().now <= 126000)
  assert.equal(stuck.stats().local, 0)

  const progressing = pollingContext(count => count > 100
    ? { success: true, durum: 'bitti', sayi: 2 }
    : { success: true, durum: 'calisiyor', adim: count < 20 ? 'akilli-entegrasyon-menusu' : 'gibden-getir' })
  const completed = await progressing.context.sunucuyaIsGonder('efatura-sorgula', {}, 1500000, null, {
    adimZamanAsimlari: { 'akilli-entegrasyon-menusu': 120000 },
  })
  assert.equal(completed.ok, true)
  assert.ok(progressing.stats().now > 240000, 'long GIB queries must retain their existing allowance')

  let cancelled = false
  const cancelledJob = pollingContext(() => ({ success: true, durum: 'calisiyor', adim: 'luca-girisi' }))
  const cancelledResult = await cancelledJob.context.sunucuyaIsGonder('efatura-sorgula', {}, 1500000,
    () => { cancelled = true }, { iptalKontrol: () => cancelled })
  assert.equal(cancelledResult.reason, 'KULLANICI_DURDURDU')
  assert.equal(cancelledJob.stats().polls, 1)

  const alreadyCancelled = pollingContext(() => { throw new Error('Must not poll') })
  const skipped = await alreadyCancelled.context.sunucuyaIsGonder('efatura-sorgula', {}, 1500000, null, { iptalKontrol: () => true })
  assert.equal(skipped.reason, 'KULLANICI_DURDURDU')
  assert.equal(alreadyCancelled.stats().posts, 0)

  const timeout = pollingContext(() => ({ success: true, durum: 'calisiyor' }))
  const expired = await timeout.context.sunucuyaIsGonder('efatura-sorgula', {}, 10000)
  assert.equal(expired.ok, false)
  assert.match(expired.reason, /islem takibi suresinde tamamlanmadi/)
}

async function localCancellationTest() {
  let cancelled = false
  let requestAborted = false
  const context = vm.createContext({
    console, AbortController, AbortSignal,
    setTimeout, clearTimeout,
    setInterval: callback => setInterval(callback, 1), clearInterval,
    yardimciFetch: async (url, options) => {
      if (url.endsWith('/ping')) return { ok: true, json: async () => ({ app: 'mubis-gib-yardimci' }) }
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => { requestAborted = true; reject(new Error('aborted')) }, { once: true })
        setTimeout(() => { cancelled = true }, 5)
      })
    },
  })
  vm.runInContext(code, context)
  const result = await context.yardimciIsYerel('efatura-sorgula', {}, 500, null, { iptalKontrol: () => cancelled })
  assert.equal(result.reason, 'KULLANICI_DURDURDU')
  assert.equal(requestAborted, true)
}

async function pageEnumerationTests() {
  for (const filename of ['gib-yardimci/index.js', 'gib-yardimci-sunucu/index.js']) {
    const source = fs.readFileSync(filename, 'utf8')
    const from = source.indexOf('  async function canliSayfalar() {', source.indexOf('async function efaturaAkisiYurut'))
    const to = source.indexOf('  let musteriSecildi', from)
    assert.ok(from >= 0 && to > from)
    const current = { url: () => 'https://auygs.luca.com.tr/Luca/luca.do', evaluate: () => { throw new Error('Must not probe every tab') } }
    let timeout = false
    const context = vm.createContext({
      page: current,
      browser: { pages: async () => [current, { url: () => 'https://unrelated.test/' }, { url: current.url, isClosed: () => true }] },
      setTimeout: callback => setTimeout(() => { timeout = true; callback() }, 5), clearTimeout,
    })
    vm.runInContext(source.slice(from, to), context)
    assert.equal((await context.canliSayfalar()).length, 1)
    assert.equal(timeout, false)
    context.browser.pages = () => new Promise(() => {})
    assert.equal((await context.canliSayfalar())[0], current)
    assert.equal(timeout, true, filename + ': stuck page enumeration must use the current page')
  }
}

async function serviceTests() {
  const source = fs.readFileSync('src/services/efaturaService.js', 'utf8')
  const from = source.indexOf('export async function efaturaSorgula(')
  const to = source.indexOf('async function uttsExcelDosyalariniYukle(', from)
  let receivedOptions
  let result = { ok: true, akisTamam: true }
  const context = vm.createContext({
    console, setTimeout, Map, Date,
    lucaBilgileriGetir: async () => ({ username: 'test', password: 'test', member: 'test' }),
    musteriGirisBilgileriGetir: async () => null,
    kayitKlasorleriGetir: async () => ({}),
    yardimciIsSunucu: async (name, params, duration, onStatus, options) => { receivedOptions = options; return result },
  })
  vm.runInContext(source.slice(from, to).replace(/^export /gm, ''), context)
  const cancel = () => false
  const args = { client: { id: 'test' }, sadeceSorgu: true, iptalKontrol: cancel }
  assert.equal((await context.efaturaSorgula(args)).ok, true)
  assert.equal(receivedOptions.iptalKontrol, cancel)
  assert.equal(receivedOptions.adimZamanAsimlari['akilli-entegrasyon-menusu'], 120000)
  result = { ok: false, reason: 'servis-yanit-vermedi' }
  await assert.rejects(context.efaturaSorgula(args), /islem takibi suresinde tamamlanmadi/)
  result = { ok: false, reason: 'KULLANICI_DURDURDU' }
  await assert.rejects(context.efaturaSorgula(args), /KULLANICI_DURDURDU/)
}

;(async () => {
  await pollingTests()
  await localCancellationTest()
  await pageEnumerationTests()
  await serviceTests()
  console.log('PASS: stalled menu deadline, real-progress allowance, server/local cancellation, bounded tab enumeration and timeout propagation')
})().catch(error => { console.error(error); process.exitCode = 1 })
