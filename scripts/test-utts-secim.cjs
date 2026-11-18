const fs = require('node:fs')
const vm = require('node:vm')
const assert = require('node:assert/strict')

function callback(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const from = source.indexOf('await f.evaluate(', start) + 'await f.evaluate('.length
  const end = source.indexOf(endMarker, from)
  assert.ok(start >= 0 && end > from)
  return source.slice(from, end)
}

function checkbox({ header = false, checked = false, disabled = false } = {}) {
  return {
    checked, disabled, clicks: 0, getClientRects: () => [1],
    getBoundingClientRect: () => ({ top: header ? 0 : 10 }),
    closest: selector => selector === 'tr' ? {} : header ? {} : null,
    click() { this.checked = !this.checked; this.clicks++ },
  }
}

function control({ tag = 'BUTTON', disabled = false, ariaDisabled = false, handler = '', text = 'Excel' } = {}) {
  return {
    tagName: tag, disabled, textContent: text,
    getClientRects: () => [1],
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 20, height: 20 }),
    getAttribute: name => name === 'onclick' ? handler : name === 'aria-disabled' ? String(ariaDisabled) : null,
    dispatchEvent() { this.clicked = true }, focus() {}, click() { this.clicked = true },
  }
}

async function selectionFlow(source, frames, overrides = {}) {
  const start = source.indexOf('    if (durum.uttsAsama === "liste-bekle") {', source.indexOf('async function lucaBelgeleriIndir('))
  const end = source.indexOf('    if (durum.uttsAsama === "satir-secildi") {', start)
  assert.ok(start >= 0 && end > start)
  const state = { uttsAsama: 'liste-bekle', uttsAsamaZaman: 980000, ...overrides }
  const page = {
    frames: () => frames.map(boxes => ({
      evaluate: async fn => vm.runInNewContext('(' + fn.toString() + ')()', { document: { querySelectorAll: () => boxes } }),
      $$: async () => boxes.filter(box => !box.disabled).map(box => ({
        evaluate: async fn => fn(box), boundingBox: async () => ({}), click: async () => box.click(),
      })),
    })),
  }
  const result = await vm.runInNewContext('(async () => { ' + source.slice(start, end) + ' })()', {
    durum: state, browser: { pages: async () => [page] }, aktif: page,
    uttsUyariKapat: async () => false, uttsTikla: async () => false,
    setTimeout: fn => fn(), log() {}, Date: class extends Date { static now() { return 1000000 } },
  })
  return { result, state }
}

async function exportFlow(source, overrides = {}, clicked = false) {
  const start = source.indexOf('    if (durum.uttsAsama === "satir-secildi") {', source.indexOf('async function lucaBelgeleriIndir('))
  const end = source.indexOf('    if (durum.uttsAsama === "indirme-bekle") {', start)
  assert.ok(start >= 0 && end > start)
  const state = { uttsAsama: 'satir-secildi', uttsAsamaZaman: 980000, uttsExcelOncesi: new Map(), ...overrides }
  await vm.runInNewContext('(async () => { ' + source.slice(start, end) + ' })()', {
    durum: state, uttsUyariKapat: async () => false, uttsTikla: async () => clicked,
    log() {}, Date: class extends Date { static now() { return 1000000 } },
  })
  return state
}

async function main() {
  for (const filename of ['gib-yardimci/index.js', 'gib-yardimci-sunucu/index.js']) {
    const source = fs.readFileSync(filename, 'utf8')
    const selection = callback(source, '      const kutuBul = async () => {', ').catch(() => null);')
    const read = boxes => vm.runInNewContext('(' + selection + ')()', {
      document: { querySelectorAll: () => boxes },
    })
    assert.equal(read([checkbox({ header: true, checked: true })]).isaretli, false, filename + ': a checked header is not a selected invoice')
    assert.equal(read([checkbox({ header: true, checked: true }), checkbox()]).isaretli, false)
    assert.equal(read([checkbox({ header: true }), checkbox({ checked: true })]).isaretli, true)
    assert.equal(read([checkbox({ header: true, checked: true }), checkbox({ checked: true }), checkbox()]).isaretli, false)
    assert.equal(read([checkbox({ header: true, checked: true }), checkbox({ checked: true, disabled: true })]).isaretli, false)

    const click = callback(source, '    const uttsTikla = async (kr, etiket2) => {', ', kr).catch(')
    const runClick = (controls, boxes = [], requireRows = false) => vm.runInNewContext('(' + click + ')(arg)', {
      arg: { metin: 'excel', onclick: "gonder('excel')", seciliSatirGerekli: requireRows },
      document: { querySelectorAll: selector => selector === 'input[type=checkbox]' ? boxes : controls }, window: {},
      MouseEvent: function MouseEvent() {},
    })
    const disabled = control({ disabled: true, handler: "gonder('excel')" })
    assert.equal(runClick([disabled]), null)
    assert.equal(disabled.clicked, undefined)
    assert.equal(runClick([control({ ariaDisabled: true })]), null)
    const label = control({ tag: 'SPAN' })
    assert.equal(runClick([label]), null, 'an Excel label without a click handler cannot start a download')
    const enabled = control({ handler: "gonder('excel')" })
    assert.ok(runClick([label, enabled]))
    assert.equal(enabled.clicked, true)
    assert.equal(label.clicked, undefined)
    const guarded = control()
    assert.equal(runClick([guarded], [], true), null)
    assert.equal(runClick([guarded], [checkbox({ header: true, checked: true })], true), null)
    assert.equal(runClick([guarded], [checkbox()], true), null)
    assert.equal(guarded.clicked, undefined)
    assert.ok(runClick([guarded], [checkbox({ checked: true })], true))

    const header = checkbox({ header: true, checked: true })
    const empty = await selectionFlow(source, [[header]])
    assert.equal(empty.state.uttsAsama, 'liste-bekle', 'header-only tables cannot start export')
    const selected = checkbox({ checked: true })
    const pending = checkbox()
    const fallback = await selectionFlow(source, [[header], [checkbox({ header: true, checked: true }), selected, pending]])
    assert.equal(fallback.state.uttsAsama, 'satir-secildi', 'real rows in a later frame must be selected and verified')
    assert.equal(selected.clicks, 0, 'selected rows must not be toggled off')
    assert.equal(pending.clicks, 1)
    assert.equal(header.clicks, 0)
    await assert.rejects(selectionFlow(source, [[header]], { uttsSecimBaslangic: 970000 }), { code: 'LUCA_UTTS_SELECTION_UNVERIFIED' })
    assert.equal((await exportFlow(source)).uttsAsama, 'satir-secildi')
    await assert.rejects(exportFlow(source, { uttsExcelKontrolBaslangic: 970000 }), { code: 'LUCA_UTTS_EXPORT_UNAVAILABLE' })
    const retry = await exportFlow(source, { uttsExcelKontrolBaslangic: 970000, excelTiklandi: true, excelIlkZaman: 965000 })
    assert.equal(retry.uttsAsama, 'indirme-bekle', 'an unavailable retry button must not discard an in-flight download')
    assert.equal(retry.excelIlkZaman, 965000)
    assert.equal((await exportFlow(source, {}, true)).uttsAsama, 'indirme-bekle')
  }
  const server = fs.readFileSync('gib-yardimci-sunucu/index.js', 'utf8')
  const start = server.indexOf('function lucaAkisHataMesaji(error) {')
  const end = server.indexOf('var sDurum =', start)
  const classify = vm.runInNewContext(server.slice(start, end) + '\nlucaAkisHataMesaji')
  const message = classify({ code: 'LUCA_UTTS_DOWNLOAD_TIMEOUT', message: 'private details' })
  assert.match(message, /UTTS Excel.*120/)
  assert.doesNotMatch(message, /private details/)
  console.log('PASS: UTTS real-row selection, CDP fallback, frame traversal, guarded export and safe timeout diagnosis')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
