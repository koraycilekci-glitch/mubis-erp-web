const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')

function uttsCode(filename) {
  const source = fs.readFileSync(filename, 'utf8').replace(/\r\n/g, '\n')
  const from = source.indexOf('async function lucaBelgeleriIndir(')
  const start = source.indexOf('\n', source.indexOf('  const sorguTipStr0 =', from)) + 1
  const marker = source.indexOf('    const ikiU = (n) =>', start)
  const end = source.indexOf('    // 2.7.605 oncesi eski UTTS akisi', marker)
  assert.ok(start >= 0 && end > marker)
  return source.slice(start, end) + '\n  }'
}

function fixture(code, state = {}) {
  let now = 1000000
  let warning = false
  let searches = 0
  const files = new Map([['faturalar.xlsx', { size: 100, mtimeMs: now - 10000 }]])
  const frame = {
    url: () => 'https://auygs.luca.com.tr/Luca/luca.do',
    evaluate: async (callback, argument) => {
      if (argument?.metin) return { tag: 'BUTTON', metin: argument.metin }
      if (argument?.bas) return { buton: true, tarihOk: true }
      if (warning && callback.toString().includes('document.getElementById("ilk_belge_tarihi")')) { warning = false; return true }
      if (warning && callback.toString().includes('const indirAcik')) return { indirAcik: false, bosDiyalog: true, satir: 0 }
      if (warning && callback.toString().includes('const tumDiya')) {
        const button = { tagName: 'BUTTON', textContent: 'Tamam', getClientRects: () => [1], click() {} }
        const container = {
          textContent: 'Başka ekran metni '.repeat(10) + 'Her hangi bir fatura bulunamadı',
          getClientRects: () => [1], querySelectorAll: () => [button],
        }
        return vm.runInNewContext('(' + callback.toString() + ')()', { document: { querySelectorAll: () => [container] } })
      }
      return null
    },
  }
  const page = { frames: () => [frame], bringToFront: async () => {}, keyboard: { press: async () => {} } }
  const context = vm.createContext({
    page, aktif: page, browser: { pages: async () => [page] },
    p: { mod: 'indir', yil: '2026', ay: '10', shortName: 'test' },
    durum: state, sorguTipStr0: 'utts', etiket: 'test', indirmeKlasoru: 'downloads',
    Date: class extends Date { static now() { return now } },
    setTimeout: callback => { callback(); return 1 }, log() {}, path,
    lucaSayfaliFaturaMi: () => false, lucaListeBilgisi: async () => ({ adet: 0, satir: 0 }),
    lucaGibdenGetir: async () => { searches++; throw new Error('Unexpected new GIB query') },
    edefterHedefKlasor: () => null, edtOrphanKaydet() {},
    fs: {
      readdirSync: () => [...files.keys()],
      statSync: filename => {
        const value = files.get(path.basename(filename))
        if (!value) throw new Error('File not found')
        return value
      },
      existsSync: filename => files.has(path.basename(filename)),
      renameSync: (from, to) => {
        const value = files.get(path.basename(from))
        files.delete(path.basename(from))
        files.set(path.basename(to), value)
      },
    },
  })
  vm.runInContext('async function step() { ' + code + ' }', context)
  return { context, files, state, step: () => context.step(), now: value => { now = value }, warning: value => { warning = value }, searches: () => searches }
}

async function helperTests(code) {
  const downloadOnly = fixture(code)
  assert.equal(await downloadOnly.step(), 'bekle')
  assert.equal(downloadOnly.state.uttsAsama, 'arama-diyalog')
  assert.equal(downloadOnly.searches(), 0)

  const empty = fixture(code, { uttsAsama: 'arama-diyalog', uttsAsamaZaman: 990000 })
  assert.equal(await empty.step(), 'bekle')
  assert.equal(empty.state.uttsAramaDogrulandi, true)
  empty.now(1006000)
  empty.warning(true)
  const emptyResult = await empty.step()
  assert.equal(emptyResult, 'bos', 'a confirmed no-document warning must stop the empty-list loop: ' + JSON.stringify(empty.state))

  const unconfirmed = fixture(code, { uttsAsama: 'arama-diyalog', uttsAsamaZaman: 990000 })
  unconfirmed.warning(true)
  assert.equal(await unconfirmed.step(), 'bekle', 'an old warning cannot prove the requested period is empty')
  assert.notEqual(unconfirmed.state.uttsBelgeYok, true)

  const oldFile = fixture(code, { uttsAsama: 'satir-secildi', uttsAsamaZaman: 990000 })
  assert.equal(await oldFile.step(), 'bekle')
  assert.equal(await oldFile.step(), 'bekle', 'an unchanged Excel must not be imported')
  oldFile.files.set('faturalar.xlsx', { size: 100, mtimeMs: 1001000 })
  oldFile.files.set('faturalar.xlsx.crdownload', { size: 10, mtimeMs: 1001000 })
  assert.equal(await oldFile.step(), 'bekle', 'an incomplete download must not be imported')
  oldFile.files.delete('faturalar.xlsx.crdownload')
  assert.equal(await oldFile.step(), 'tamam', 'a replaced same-name, same-size Excel must be recognized')
  assert.ok([...oldFile.files.keys()].some(name => name.startsWith('utts_test_202610_')))

  const newFile = fixture(code, { uttsAsama: 'satir-secildi', uttsAsamaZaman: 990000 })
  await newFile.step()
  newFile.files.set('faturalar (1).xls', { size: 200, mtimeMs: 1001000 })
  assert.equal(await newFile.step(), 'tamam')

  const retry = fixture(code, { uttsAsama: 'satir-secildi', uttsAsamaZaman: 990000 })
  await retry.step()
  retry.now(1031000)
  assert.equal(await retry.step(), 'bekle')
  assert.equal(retry.state.uttsAsama, 'satir-secildi')
  await retry.step()
  assert.equal(retry.state.excelIlkZaman, 1000000, 'retry must preserve the original deadline')
  retry.now(1121000)
  assert.equal(await retry.step(), 'zamanasimi')
}

async function summaryTests() {
  const source = fs.readFileSync('src/components/FaturaListesiKarti.jsx', 'utf8')
  const start = source.indexOf('      const ozet = []')
  const end = source.indexOf('      await yukle()', start)
  assert.ok(start >= 0 && end > start)
  for (const [total, errors, prefix] of [[5, ['UTTS timeout'], 'Kısmen tamamlandı:'], [0, ['UTTS timeout'], '❌'], [5, [], '✅']]) {
    let message
    await vm.runInNewContext('(async () => { ' + source.slice(start, end) + ' })()', {
      toplam: total, hatalar: errors, notlar: [], oncedenYukluler: [], boslar: [],
      durdur: false, durdurRef: { current: false }, setMesaj: value => { message = value },
    })
    assert.ok(message.startsWith(prefix), message)
    if (total > 0) assert.ok(message.includes('5 fatura indirildi ve kaydedildi'))
    if (errors.length) assert.ok(message.includes('UTTS timeout'))
  }
}

;(async () => {
  const local = uttsCode('gib-yardimci/index.js')
  const server = uttsCode('gib-yardimci-sunucu/index.js')
  assert.equal(local.slice(local.indexOf('    if (durum.uttsAsama === "satir-secildi")')), server.slice(server.indexOf('    if (durum.uttsAsama === "satir-secildi")')), 'desktop and server Excel handling must stay synchronized')
  await helperTests(local)
  await helperTests(server)
  await summaryTests()
  console.log('PASS: UTTS download-only flow, confirmed empty results, stale/incomplete/replaced/new Excel, bounded retry, helper parity and partial-success messages')
})().catch(error => { console.error(error); process.exitCode = 1 })
