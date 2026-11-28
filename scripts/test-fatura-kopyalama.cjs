const fs = require('node:fs')
const vm = require('node:vm')
const assert = require('node:assert/strict')

async function main() {
  const source = fs.readFileSync('src/services/efaturaService.js', 'utf8').replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '')
  let localResults = []
  let serverResult = null
  let signed = []
  let calls = []
  const context = vm.createContext({
    console,
    kayitKlasorleriGetir: async () => ({ faturaGidenKlasoru: 'test-root' }),
    getViewUrl: async url => { signed.push(url); return 'https://signed.test/' + encodeURIComponent(url) },
    yardimciIsYerel: async (name, params) => { calls.push({ name, params }); return localResults.shift() },
    yardimciIsSunucu: async (name, params) => { calls.push({ name, params }); return serverResult },
  })
  vm.runInContext(source, context)
  const client = { id: 1, name: 'Test' }
  const files = context.faturaKopyalamaDosyalari([{ ad: 'one.pdf' }, { ad: 'two.xml' }], [{ ad: 'one.pdf', url: '/api/drive-dosya?id=1' }, { ad: 'two.xml', url: 'private-storage' }])
  assert.equal(files[0].url, '/api/drive-dosya?id=1')
  assert.equal(files[1].url, 'private-storage')

  serverResult = { ok: false, reason: 'hedef klasor hesaplanamadi' }
  localResults = [{ ok: true, kopya: 1, toplam: 2, atlanan: ['two.xml'] }, { ok: true, kopya: 1, toplam: 1, atlanan: [] }]
  let result = await context.edefterTopluKopyala({ client, yil: 2026, ay: 10, yon: 'satis', dosyalar: files, yardimciKaynak: 'sunucu' })
  assert.equal(result.ok, true)
  assert.equal(result.kopya, 2)
  assert.equal(calls.length, 3)
  assert.equal(calls[2].name, 'edefter-url-kopyala')
  assert.equal(calls[2].params.files.length, 1)
  assert.equal(calls[2].params.files[0].ad, 'two.xml')
  assert.equal(calls[2].params.files[0].url, 'https://signed.test/private-storage')
  assert.deepEqual(signed, ['private-storage'])

  calls = []
  localResults = [{ ok: false, reason: 'kurulu-degil' }, { ok: false, reason: 'kurulu-degil' }]
  result = await context.edefterTopluKopyala({ client, dosyalar: files, yardimciKaynak: 'yerel' })
  assert.equal(result.ok, false)
  assert.equal(result.kopya, 0)
  assert.match(result.error, /Arşiv klasörünün bulunduğu bilgisayarda MUBİS Yardımcı/)
  assert.equal(calls.length, 1)

  calls = []
  localResults = [{ ok: true, kopya: 1, toplam: 2, atlanan: ['two.xml (izin yok)'] }, { ok: false, error: 'HTTP 403' }]
  result = await context.edefterTopluKopyala({ client, dosyalar: files, yardimciKaynak: 'yerel' })
  assert.equal(result.ok, false)
  assert.equal(result.kopya, 1)
  assert.equal(result.atlanan[0], 'two.xml')
  assert.match(result.error, /HTTP 403/)

  calls = []
  serverResult = { ok: true, kopya: 1, toplam: 2, atlanan: ['two.xml'] }
  localResults = [{ ok: false, reason: 'kurulu-degil' }, { ok: false, reason: 'kurulu-degil' }]
  result = await context.edefterTopluKopyala({ client, dosyalar: files, yardimciKaynak: 'sunucu' })
  assert.equal(result.ok, false)
  assert.equal(result.kopya, 1)
  assert.equal(calls.length, 2)
  assert.deepEqual(Array.from(calls[1].params.dosyalar), ['two.xml'])
  assert.match(result.error, /Eksik adımları tamamla/)

  calls = []
  serverResult = { ok: true, kopya: 1, toplam: 2, atlanan: ['two.xml'] }
  localResults = [{ ok: true, kopya: 1, toplam: 1, atlanan: [] }]
  result = await context.edefterTopluKopyala({ client, dosyalar: files, yardimciKaynak: 'sunucu' })
  assert.equal(result.ok, true)
  assert.equal(result.kopya, 2)
  assert.equal(calls.length, 2)
  assert.deepEqual(Array.from(calls[1].params.dosyalar), ['two.xml'])

  localResults = [{ ok: true, kopya: 2, toplam: 2, atlanan: [] }]
  result = await context.edefterTopluKopyala({ client, dosyalar: files, yardimciKaynak: 'yerel' })
  assert.equal(result.ok, true)
  assert.equal(result.kopya, 2)

  const satir = { tarih: '2026-10-01', faturaNo: 'TEST-1', vkn: '1234567890', toplam: 120, matrah: 100, kdv: 20 }
  const uttsDb = mevcut => ({ from: () => ({
    select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ range: async () => ({ data: mevcut, error: null }) }) }) }) }),
    upsert: async () => ({ error: null })
  }) })
  context.File = File
  context.Blob = Blob
  context.crypto = globalThis.crypto
  context.TextEncoder = TextEncoder
  context.gibDosyaGetir = async () => new Blob(['test'])
  context.uttsOtomatikSatirlariniOku = async () => [satir]
  context.supabase = uttsDb([])
  context.uploadClientFile = async () => ({ url: 'new-utts-url' })
  let utts = await context.uttsExcelDosyalariniYukle({ client, yil: 2026, ay: 10, dosyalar: [{ ad: 'test.xlsx', boyut: 4 }], ilerle: () => {} })
  assert.equal(utts.ok, true, utts.not)
  assert.equal(utts.dosyalar[0].url, 'new-utts-url')

  context.supabase = uttsDb([{ tarih: satir.tarih, fatura_no: satir.faturaNo, karsi_vkn: satir.vkn, yon: 'gelen', xml_url: 'existing-utts-url', tutar: satir.toplam, matrah: satir.matrah, kdv: satir.kdv }])
  context.uploadClientFile = async () => { throw new Error('Mevcut UTTS dosyası yeniden yüklenmemeli') }
  utts = await context.uttsExcelDosyalariniYukle({ client, yil: 2026, ay: 10, dosyalar: [{ ad: 'test.xlsx', boyut: 4 }], ilerle: () => {} })
  assert.equal(utts.ok, true, utts.not)
  assert.equal(utts.dosyalar[0].url, 'existing-utts-url')
  console.log('PASS: upload URLs, signed fallback, partial copies, helper failures, separate targets and UTTS URLs.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
