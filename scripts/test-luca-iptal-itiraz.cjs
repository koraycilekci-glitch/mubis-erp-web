const assert = require('node:assert/strict')
const Module = require('node:module')
const originalLoad = Module._load
Module._load = function (request, ...args) {
  if (request === 'adm-zip') return class AdmZip {}
  return originalLoad.call(this, request, ...args)
}
const { faturaSayfaEylemi, iptalTakipSonucunuOku, sayfalariIndir } = require('../gib-yardimci-sunucu/luca-fatura-sayfalama')
Module._load = originalLoad

const records = [
  { no: 'AAA2026000000001', ettn: 'uuid-a', key: 'a' },
  { no: 'BBB2026000000002', ettn: 'uuid-b', key: 'b' }
]
const log = '[1/2] AAA2026000000001: Fatura var/geçerli\n[2/2] BBB2026000000002: Ticari fatura iptal (RED)'
assert.equal(iptalTakipSonucunuOku(log.slice(0, log.indexOf('\n')), records), null)
assert.deepEqual([...iptalTakipSonucunuOku(log, records).values()], ['gecerli', 'iptal'])
assert.deepEqual([...iptalTakipSonucunuOku(log.replace('Ticari fatura iptal (RED)', 'FATURA İPTAL'), records).values()], ['gecerli', 'iptal'])
const progress = []
iptalTakipSonucunuOku(log.slice(0, log.indexOf('\n')), records, (sayi, toplam) => progress.push([sayi, toplam]))
assert.deepEqual(progress, [[1, 2]])
assert.throws(() => iptalTakipSonucunuOku(log.replace('[2/2]', '[2/3]'), records), /eşleşmedi/)
assert.throws(() => iptalTakipSonucunuOku(log.replace('Ticari fatura iptal (RED)', 'bağlantı hatası'), records), /hata bildirdi/)
assert.throws(() => iptalTakipSonucunuOku(log.replace('Ticari fatura iptal (RED)', 'bilinmeyen'), records), /tanınmadı/)
assert.throws(() => iptalTakipSonucunuOku(log, [records[0], records[0]]), /birden fazla/)

function testVisibleSelection() {
  let queried = 0
  const button = { innerText: 'Seçilenleri İptal/İtiraz Sorgula', value: '', title: '', querySelector: () => null, getAttribute: () => null, getClientRects: () => [1], click: () => { queried++ } }
  const rows = records.map((record, index) => {
    const box = { checked: false, getClientRects: () => [1], click() { this.checked = !this.checked } }
    const row = {
      cells: [{ innerText: '20/10/2026' }, { innerText: index ? 'İptal Kabul Edildi' : 'Onaylandı' }],
      getAttribute: () => JSON.stringify({ belge_numarasi: record.no, ettn: record.ettn })
    }
    box.closest = () => row
    return box
  })
  global.window = { menu_tur: 'gib_efatura_alis', gib_efatura_alis: Object.fromEntries(records.map(record => [record.no, { ettn: record.ettn }])), __mubisListeYenileme: { degisti: true } }
  global.document = {
    readyState: 'complete', body: { innerText: '' },
    querySelectorAll(selector) {
      if (selector === '.sec') return rows
      if (selector === 'a,button,input[type="button"],input[type="image"]') return [button]
      if (selector === 'tr') return [{ cells: [{ innerText: 'Belge Tarihi' }, { innerText: 'Onay Durumu' }] }]
      return []
    }
  }
  global.getComputedStyle = () => ({ display: 'block', visibility: 'visible' })
  try {
    const options = { menu: 'gib_efatura_alis', bas: '01/10/2026', bit: '31/10/2026' }
    const snapshot = faturaSayfaEylemi(options)
    assert.equal(snapshot.records.length, 2)
    const keys = snapshot.records.map(record => record.key)
    faturaSayfaEylemi({ ...options, eylem: 'sec', kimlikler: keys })
    faturaSayfaEylemi({ ...options, eylem: 'iptal-sorgula', kimlikler: keys })
    assert.equal(queried, 1)
    assert.equal(faturaSayfaEylemi({ ...options, durumDogrula: true }).records[1].durum, 'İptal Kabul Edildi')
    assert.throws(() => faturaSayfaEylemi({ ...options, eylem: 'iptal-sorgula', kimlikler: keys.slice(0, 1) }), /seçimi doğrulanamadı/)
  } finally {
    delete global.window
    delete global.document
    delete global.getComputedStyle
  }
}
testVisibleSelection()

async function simulate({ cancelledStatus = 'İptal Kabul Edildi', tracker = log, stale = false } = {}) {
  const actions = []
  let panel = stale ? 'İşlem Takip\nönceki işlem' : null
  let refreshed = false
  const updated = [
    { ...records[0], key: 'a-updated', durum: 'Onaylandı' },
    { ...records[1], key: 'b-updated', durum: cancelledStatus }
  ]
  const snapshot = (list) => ({ identities: list.map(item => item.key), records: list, pager: { hasPrevious: false, hasNext: false, nextKnown: true, pageNumber: 1 }, total: null })
  const frame = {
    page: () => ({ frames: () => [frame] }),
    evaluate: async (fn, request) => {
      if (fn.name === 'iptalTakipEkrani') {
        if (request === 'kapat') { actions.push('kapat'); panel = null; return 'İşlem Takip' }
        return panel
      }
      actions.push(request.eylem || (request.durumDogrula ? 'oku-durum' : 'oku'))
      if (request.eylem === 'sec') { actions.push([...request.kimlikler]); return { secili: request.kimlikler.length } }
      if (request.eylem === 'iptal-sorgula') { panel = `İşlem Takip\n${tracker}`; return { clicked: true } }
      if (request.eylem === 'refresh') { refreshed = true; return { clicked: true } }
      return snapshot(refreshed ? updated : records)
    }
  }
  const downloaded = []
  const run = () => sayfalariIndir({ frame, menu: 'gib_efatura_alis', bas: '01/10/2026', bit: '31/10/2026', iptal() {}, log() {}, indir: async batch => downloaded.push(...batch) })
  return { actions, downloaded, run }
}

;(async () => {
  const success = await simulate()
  const result = await success.run()
  assert.equal(result.downloaded, 1)
  assert.deepEqual(success.downloaded.map(item => item.no), [records[0].no])
  assert.ok(success.actions.indexOf('iptal-sorgula') < success.actions.indexOf('refresh'))
  assert.ok(success.actions.indexOf('refresh') < success.actions.lastIndexOf('sec'))
  assert.deepEqual(success.actions[success.actions.lastIndexOf('sec') + 1], ['a-updated'])
  const mismatch = await simulate({ cancelledStatus: 'Onaylandı' })
  await assert.rejects(mismatch.run(), /iptal sonucu.*doğrulanamadı/)
  assert.equal(mismatch.downloaded.length, 0)
  const unknown = await simulate({ tracker: log.replace('Ticari fatura iptal (RED)', 'belirsiz') })
  await assert.rejects(unknown.run(), /tanınmadı/)
  assert.equal(unknown.downloaded.length, 0)
  const stale = await simulate({ stale: true })
  await assert.rejects(stale.run(), /önceki işlemin/)
  assert.equal(stale.actions.includes('iptal-sorgula'), false)
  console.log('PASS: Luca iptal/itiraz sorgusu indirmeden önce doğrulanır; iptal ve belirsiz sonuçlar yüklenmez.')
})().catch(error => { console.error(error); process.exitCode = 1 })
