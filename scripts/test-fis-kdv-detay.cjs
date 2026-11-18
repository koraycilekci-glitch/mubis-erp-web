const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const assert = require('node:assert/strict')
const XLSX = require('xlsx')

async function main() {
  const detay = await import(pathToFileURL(path.resolve('src/utils/fisDetay.js')))
  const parser = await import(pathToFileURL(path.resolve('src/utils/gumrukExcel.js')))
  const csv = rows => Buffer.from(rows.map(row => row.join(';')).join('\r\n'), 'utf8')
  const workbook = rows => {
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Döküm')
    return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })
  }
  const zRows = [
    ['TARİH', 'EVRAK NO', 'AÇIKLAMA', 'SATIŞ 0', 'SATIŞ 1', 'SATIŞ 10', 'SATIŞ 20', 'NAKİT', 'KREDİ K', 'MATRAH 1', 'MATRAH 10', 'MATRAH 20', 'KDV 1', 'KDV 10', 'KDV 20'],
    ['01.10.2026', '100', 'Z RAPORU', '50', '101', '220', '360', '0', '731', '100', '200', '300', '1', '20', '60'],
  ]
  const [z] = await parser.zRaporuSatirlariniOku(csv(zRows), 'z.csv')
  assert.deepEqual([z.matrah, z.kdv, z.toplam, z.nakit, z.kredi], [650, 81, 731, 0, 731])
  assert.deepEqual(z.kdvDetaylari.map(row => row.oran), [0, 1, 10, 20])
  assert.deepEqual(await parser.zRaporuSatirlariniOku(workbook(zRows), 'z.xlsx'), [z])
  const grossOnly = await parser.zRaporuSatirlariniOku(csv([zRows[0].slice(0, 9), zRows[1].slice(0, 9)]), 'z.csv')
  assert.deepEqual(grossOnly[0].kdvDetaylari, z.kdvDetaylari)
  assert.deepEqual(detay.satisKdvDetaylari({ s0: 50, s1: 101, s10: 220, s20: 360 }), z.kdvDetaylari)
  assert.deepEqual(detay.satisKdvDetaylari(null), [])
  const fis = { id: 'test', matrah: 650, kdv: 81, toplam: 731, nakit: 0, kredi: 731, kdvDetaylari: z.kdvDetaylari }
  const satirlar = detay.fisOranSatirlari(fis)
  assert.equal(satirlar.length, 4)
  assert.equal(satirlar.reduce((sum, row) => sum + row.toplam, 0), 731)
  assert.equal(satirlar.reduce((sum, row) => sum + (row.kredi || 0), 0), 731)
  assert.equal(satirlar[0].nakit, 0)
  assert.ok(satirlar.slice(1).every(row => row.odemeDevamSatiri && row.nakit === null && row.kredi === null))
  assert.deepEqual(detay.fisDetaylariniDogrula(z.kdvDetaylari, 649, 81, 731), [])
  assert.deepEqual(detay.fisDetaylariniDogrula([{ oran: null, matrah: 100, kdv: 20 }], 100, 20, 120), [])
  assert.deepEqual(detay.fisDetaylariniDogrula([null], 100, 20, 120), [])
  assert.deepEqual(detay.fisOdemeBilgisi({}), { nakit: null, kredi: null })
  assert.deepEqual(detay.fisOdemeBilgisi({ fatura_turu: 'Z RAPORU', fatura_uuid: 'manuel-1', nakit_tutar: 0, tutar: 120 }), { nakit: 0, kredi: 120 })
  assert.equal(detay.fisOdemeBilgisi({ nakit_tutar: 0, tutar: 120 }).kredi, null)

  const giderRows = [
    ['FİŞ TARİHİ', 'FİŞ NO', 'ÜNVANI', 'KDV ORANI', 'KDV MATRAHI', 'KDV TUTARI', 'TOPLAM', 'NAKİT', 'KREDİ K'],
    ['02.10.2026', 'FIS-1', 'Test Supplier', '1', '1000', '10', '1010', '0', '1010'],
    ['02.10.2026', 'FIS-1', 'Test Supplier', '10', '100', '10', '110', '0', '110'],
  ]
  const gider = await parser.afaDokumSatirlariniOku(csv(giderRows), 'gider.csv', true)
  assert.equal(gider.length, 2)
  assert.deepEqual(gider.map(row => row.kdvDetaylari[0].oran), [1, 10])
  assert.deepEqual(await parser.afaDokumSatirlariniOku(workbook(giderRows), 'gider.xlsx', true), gider)
  const cashRows = [giderRows[0].slice(0, 7).concat('ÖDEME TÜRÜ'), giderRows[1].slice(0, 7).concat('NAKİT')]
  assert.equal((await parser.afaDokumSatirlariniOku(csv(cashRows), 'gider.csv', true))[0].nakit, 1010)

  const source = file => fs.readFileSync(file, 'utf8').replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '')
  const documents = new Map([['source:z', csv(zRows)], ['source:gider', csv(giderRows)], ['source:excel', workbook(zRows)]])
  const requests = []
  const stored = []
  const supabase = { from() {
    const filters = []
    const query = {
      select() { return query }, eq(key, value) { filters.push(row => String(row[key]) === String(value)); return query },
      in(key, values) { filters.push(row => values.includes(row[key])); return query }, order() { return query },
      range(first, last) { return Promise.resolve({ data: stored.filter(row => filters.every(filter => filter(row))).slice(first, last + 1), error: null }) },
      insert(rows) { stored.push(...rows.map((row, index) => ({ ...row, id: stored.length + index + 1 }))); return Promise.resolve({ error: null }) },
    }
    return query
  } }
  const context = vm.createContext({ console, Date, URL, Blob, File, Uint8Array, TextDecoder, supabase, ...parser, ...detay,
    uploadClientFile: async () => ({ url: 'source:gider' }),
    fetchDocument: async url => {
      requests.push(url)
      if (!documents.has(url)) throw new Error('Unavailable')
      return new Response(documents.get(url))
    },
  })
  vm.runInContext(source('src/services/efaturaService.js'), context)
  const zRecord = { id: 1, fatura_turu: 'Z RAPORU', fatura_no: 'Z-100', tarih: '2026-10-01', matrah: 650, kdv: 81, tutar: 731, xml_url: 'source:z' }
  const enriched = await context.faturaFisDetaylariniTamamla([zRecord, { ...zRecord, id: 2 }, { id: 3, fatura_turu: 'SATIS' }])
  assert.equal(requests.length, 1)
  assert.equal(enriched[0].kdvDetaylari.length, 4)
  assert.equal(enriched[0].nakit, 0)
  assert.equal(enriched[0].kredi, 731)
  assert.equal(enriched[2].kdvDetaylari, undefined)
  const expense = { id: 4, fatura_turu: 'GİDER DÖKÜMÜ', fatura_no: 'FIS-1', tarih: '2026-10-02', matrah: 1100, kdv: 20, tutar: 1120, xml_url: 'source:gider' }
  const [combined] = await context.faturaFisDetaylariniTamamla([expense])
  assert.equal(combined.kdvDetaylari.length, 2)
  assert.equal(combined.kredi, 1120)
  assert.equal(combined.nakit, 0)
  const [excelRecord] = await context.faturaFisDetaylariniTamamla([{ ...zRecord, xml_url: 'source:excel' }])
  assert.equal(excelRecord.kdvDetaylari.length, 4)
  const [unavailable] = await context.faturaFisDetaylariniTamamla([{ ...zRecord, xml_url: 'missing' }])
  assert.ok(unavailable.fisDetayUyari)
  assert.equal(unavailable.tutar, 731)
  assert.equal(context.fisKdvDetayUret(unavailable), null)
  assert.equal(context.fisKdvDetayUret({ fatura_turu: 'Z RAPORU', matrah: 100, kdv: 15, tutar: 115 }), null)
  assert.equal(context.fisKdvDetayUret({ fatura_turu: 'GİDER FİŞİ', matrah: 100, kdv: 0, tutar: 100 })[0].oran, 0)
  const imported = await context.afaDokumuYukle({ client: { id: 1 }, dosya: new File([csv(giderRows)], 'gider.csv'), tip: 'gider', yil: 2026, ay: 10, otomatik: true })
  assert.equal(imported.sayi, 2)
  const repeated = await context.afaDokumuYukle({ client: { id: 1 }, dosya: new File([csv(giderRows)], 'gider.csv'), tip: 'gider', yil: 2026, ay: 10, otomatik: true })
  assert.equal(repeated.sayi, 0)
  assert.equal(repeated.atlanan, 2)

  const invoices = []
  const vatRows = []
  let detailFailure = false
  const manualDb = { from(table) { return {
    insert(payload) {
      if (table === 'efatura_kdv_detay') {
        if (!detailFailure) vatRows.push(...payload)
        return Promise.resolve({ error: detailFailure ? { message: 'VAT insert failed' } : null })
      }
      const row = { ...payload, id: invoices.length + 1 }
      invoices.push(row)
      return { select() { return { single: async () => ({ data: { id: row.id }, error: null }) } } }
    },
    delete() { return { eq: async (_, id) => { const index = invoices.findIndex(row => row.id === id); if (index >= 0) invoices.splice(index, 1); return { error: null } } } },
  } } }
  const manual = vm.createContext({ console, Date, ...detay, supabase: manualDb })
  vm.runInContext(source('src/services/taramaService.js'), manual)
  await manual.fisManuelEkle({ clientId: 1, tarih: '2026-10-01', tip: 'z', evrakNo: '100', satis: { s0: 50, s1: 101, s10: 220, s20: 360 }, nakit: 0 })
  assert.deepEqual([invoices[0].matrah, invoices[0].kdv, invoices[0].tutar, invoices[0].nakit_tutar], [650, 81, 731, 0])
  assert.equal(vatRows.length, 4)
  assert.equal(vatRows[0].oran, 0)
  await manual.fisManuelEkle({ clientId: 1, tarih: '2026-10-02', tip: 'fis', toplam: 100, kdvOran: 0 })
  assert.equal(invoices[1].kdv, 0)
  assert.equal(vatRows.at(-1).oran, 0)
  detailFailure = true
  await assert.rejects(manual.fisManuelEkle({ clientId: 1, tarih: '2026-10-03', tip: 'fis', toplam: 120, kdvOran: 20 }), /KDV ayrıntısı kaydedilemedi/)
  assert.equal(invoices.length, 2)
  console.log('PASS: CSV/XLSX VAT breakdowns, 0/1/10/20% rates, exact totals, cash/card and unknown payments, single-count payments, legacy document enrichment, expense aggregation, equal-VAT distinct rates, duplicate imports, manual persistence and rollback.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
