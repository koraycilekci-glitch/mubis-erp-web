const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const assert = require('node:assert/strict')
const XLSX = require('xlsx')

async function main() {
  const parser = await import(pathToFileURL(path.resolve('src/utils/gumrukExcel.js')))
  const zRows = [['TARİH', 'EVRAK NO', 'AÇIKLAMA', 'SATIŞ 10', 'SATIŞ 20', 'MATRAH 10', 'MATRAH 20', 'KDV 10', 'KDV 20'], ['01.10.2026', '100', 'Z RAPORU', '110,00', '120,00', '100,00', '100,00', '10,00', '20,00'], ['01.11.2026', '101', 'Z RAPORU', '110,00', '0', '100,00', '0', '10,00', '0']]
  const giderRows = [['TARİH', 'FATURA NO', 'ÜNVANI', 'KDV ORANI', 'KDV MATRAHI', 'KDV TUTARI', 'TOPLAM'], ['02.10.2026', 'FIS-1', 'Test Supplier', '20', '100,00', '20,00', '120,00']]
  const csv = rows => Buffer.from(rows.map(row => row.join(';')).join('\n'), 'utf8')
  const workbook = rows => {
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Döküm')
    return XLSX.write(book, { type: 'buffer', bookType: 'xlsm' })
  }
  const zCsv = await parser.zRaporuSatirlariniOku(csv(zRows), 'Z RAPORU.csv')
  const zExcel = await parser.zRaporuSatirlariniOku(workbook(zRows), 'Z RAPORU.xlsm')
  assert.deepEqual(zCsv, zExcel)
  assert.equal(zCsv.length, 2)
  assert.equal(zCsv[0].matrah, 200)
  assert.equal(zCsv[0].kdv, 30)
  assert.equal(zCsv[0].toplam, 230)
  const gider = await parser.afaDokumSatirlariniOku(csv(giderRows), 'gider.csv', true)
  assert.deepEqual(gider, await parser.afaDokumSatirlariniOku(workbook(giderRows), 'gider.xlsm', true))
  assert.equal(gider[0].toplam, 120)
  assert.deepEqual(await parser.afaDokumSatirlariniOku(csv([['DATE', 'INVOICE', 'COMPANY', 'RATE', 'BASE', 'VAT', 'TOTAL'], giderRows[1]]), 'invoice.csv', true), [])

  const stored = []
  let readError = false
  let uploadCalls = 0
  const supabase = { from() {
    const filters = []
    const query = {
      select() { return query }, eq(key, value) { filters.push(row => String(row[key]) === String(value)); return query },
      in(key, values) { filters.push(row => values.includes(row[key])); return query }, order() { return query },
      range(first, last) { return Promise.resolve({ data: stored.filter(row => filters.every(filter => filter(row))).slice(first, last + 1), error: readError ? { message: 'database unavailable' } : null }) },
      insert(rows) { stored.push(...rows.map(row => ({ ...row, id: stored.length + 1 }))); return Promise.resolve({ error: null }) },
    }
    return query
  } }
  let imports = 0
  let stop = false
  const context = vm.createContext({ console, Date, URL, Blob, File, Uint8Array, supabase, ...parser,
    uploadClientFile: async () => { uploadCalls++; return { url: 'https://app.test/source' } },
    driveDokumIstegi: async payload => payload.action === 'list'
      ? { ok: true, dosyalar: [{ ad: 'Z RAPORU.csv', tip: 'zraporu', ticket: 'source' }], hatalar: [] }
      : (imports++, new Blob([csv(zRows)])),
  })
  const source = fs.readFileSync('src/services/efaturaService.js', 'utf8').replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '')
  vm.runInContext(source, context)
  const client = { id: 1, name: 'Test Client' }
  const result = await context.afaDokumuYukle({ client, dosya: new File([csv(zRows)], 'Z RAPORU.csv'), tip: 'zraporu', yil: 2026, ay: 10, otomatik: true })
  assert.equal(result.ok, true)
  assert.equal(result.sayi, 1)
  assert.equal(stored.length, 1)
  assert.equal(stored[0].yon, 'giden')
  assert.equal(stored[0].tarih, '2026-10-01')
  const repeated = await context.afaDokumuYukle({ client, dosya: new File([workbook(zRows)], 'Z RAPORU.xlsm'), tip: 'zraporu', yil: 2026, ay: 10, otomatik: true })
  assert.equal(repeated.sayi, 0)
  assert.equal(repeated.atlanan, 1)
  assert.equal(stored.length, 1)
  const incoming = await context.afaDokumuYukle({ client, dosya: new File([csv(giderRows)], 'ALDIĞI FİŞLER.csv'), tip: 'gider', yil: 2026, ay: 10, otomatik: true })
  assert.equal(incoming.sayi, 1)
  assert.equal(stored[1].yon, 'gelen')
  readError = true
  const failure = await context.afaDokumuYukle({ client, dosya: new File([csv(zRows)], 'Z RAPORU.csv'), tip: 'zraporu', yil: 2026, ay: 10, otomatik: true })
  assert.equal(failure.ok, false)
  assert.equal(stored.length, 2)
  readError = false
  const auto = await context.edefterDokumleriniYukle({ client, yil: 2026, ay: 10, iptalKontrol: () => stop })
  assert.equal(auto.sayi, 0)
  assert.equal(imports, 1)
  stop = true
  await context.edefterDokumleriniYukle({ client, yil: 2026, ay: 10, iptalKontrol: () => stop })
  assert.equal(imports, 1)
  assert.ok(uploadCalls > 0)
  const customs = await context.afaDokumuYukle({ client, dosya: new File([csv(giderRows)], 'AFA GÜMRÜK.csv'), tip: 'gumruk', yil: 2026, ay: 10, otomatik: true })
  assert.equal(customs.sayi, 1)
  assert.equal(stored[2].yon, 'gelen')
  assert.equal(stored[2].tur, 'gumruk')
  assert.equal(stored[2].fatura_turu, 'ITHALAT')
  const repeatedCustoms = await context.afaDokumuYukle({ client, dosya: new File([workbook(giderRows)], 'AFA GÜMRÜK.xlsm'), tip: 'gumruk', yil: 2026, ay: 10, otomatik: true })
  assert.equal(repeatedCustoms.sayi, 0)
  assert.equal(repeatedCustoms.atlanan, 1)
  assert.equal(stored.length, 3)
  for (let index = 0; index < process.argv.slice(2).length; index++) {
    const file = process.argv[index + 2]
    const bytes = fs.readFileSync(file)
    const rows = /Z\s*RAPORU/i.test(path.basename(file)) ? await parser.zRaporuSatirlariniOku(bytes, file) : await parser.afaDokumSatirlariniOku(bytes, file, true)
    assert.ok(rows.length > 0)
    console.log(`Sample ${index + 1}: ${path.extname(file)} parsed ${rows.length} rows`)
  }
  console.log('PASS: UTF-8 CSV/XLSM agreement, VAT column precision, strict expense schema, selected period, purchase/sales direction, repeated import, failed duplicate checks and cancellation.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
