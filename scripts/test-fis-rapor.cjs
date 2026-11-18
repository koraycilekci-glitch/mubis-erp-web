const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { pathToFileURL } = require('node:url')

async function main() {
  const detay = await import(pathToFileURL(path.resolve('src/utils/fisDetay.js')))
  const parser = await import(pathToFileURL(path.resolve('src/utils/gumrukExcel.js')))
  const rapor = await import(pathToFileURL(path.resolve('src/utils/fisRapor.js')))
  const rows = [
    ['TARİH', 'EVRAK NO', 'AÇIKLAMA', 'SATIŞ 0', 'SATIŞ 1', 'SATIŞ 10', 'SATIŞ 20', 'NAKİT', 'KREDİ K', 'MATRAH 1', 'MATRAH 10', 'MATRAH 20', 'KDV 1', 'KDV 10', 'KDV 20'],
    ['19.10.2026', '1897', 'Z RAPORU', '50', '101', '220', '360', '', '731', '100', '200', '300', '1', '20', '60'],
  ]
  const csv = lines => Buffer.from(lines.map(row => row.join(';')).join('\r\n'), 'utf8')
  const [parsed] = await parser.zRaporuSatirlariniOku(csv(rows), 'z.csv')
  assert.equal(parsed.nakit, 0)
  assert.equal(parsed.kredi, 731)
  const cash = [rows[0], rows[1].map((value, index) => index === 7 ? '731' : index === 8 ? '' : value)]
  assert.equal((await parser.zRaporuSatirlariniOku(csv(cash), 'z.csv'))[0].kredi, 0)
  const noCashColumn = rows.map(row => row.filter((_, index) => index !== 7))
  assert.equal((await parser.zRaporuSatirlariniOku(csv(noCashColumn), 'z.csv'))[0].nakit, null)
  const blankPayments = [rows[0], rows[1].map((value, index) => index === 8 ? '' : value)]
  const [unknown] = await parser.zRaporuSatirlariniOku(csv(blankPayments), 'z.csv')
  assert.equal(unknown.nakit, null)
  assert.equal(unknown.kredi, null)

  const context = vm.createContext({ console, Date, URL, Blob, File, Uint8Array, TextDecoder, ...parser, ...detay,
    fetchDocument: async () => new Response(csv(rows)),
  })
  const service = fs.readFileSync('src/services/efaturaService.js', 'utf8').replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '')
  vm.runInContext(service, context)
  const legacy = { id: 1, fatura_turu: 'Z RAPORU', fatura_no: 'Z-1897', tarih: '2026-10-19', matrah: 100, kdv: 1, tutar: 731, xml_url: 'source:z' }
  const [fixed] = await context.faturaFisDetaylariniTamamla([legacy])
  assert.deepEqual([fixed.matrah, fixed.kdv, fixed.tutar], [650, 81, 731])
  assert.equal(fixed.kdvDetaylari.length, 4)
  const [mismatch] = await context.faturaFisDetaylariniTamamla([{ ...legacy, tutar: 730 }])
  assert.equal(mismatch.matrah, 100)
  assert.ok(mismatch.fisDetayUyari)
  const lines = detay.fisFaturaSatirlari(fixed)
  assert.deepEqual(lines.map(line => line.kdvOran), [0, 1, 10, 20])
  assert.equal(lines.reduce((sum, line) => sum + line.kdv, 0), 81)
  assert.equal(lines.reduce((sum, line) => sum + (line.kredi || 0), 0), 731)
  assert.equal(lines[0].nakit, 0)
  assert.ok(lines.slice(1).every(line => line.odemeDevamSatiri))
  for (const tur of ['Z RAPORU', 'GİDER FİŞİ', 'GİDER DÖKÜMÜ']) assert.equal(detay.fisKaydiMi({ fatura_turu: tur }), true)
  assert.equal(detay.fisKaydiMi({ fatura_turu: 'SATIS' }), false)

  const model = rapor.fisRaporModeli(fixed)
  assert.equal(model.baslik, 'Z Raporu')
  assert.equal(model.tarih, '19.10.2026')
  assert.equal(model.evrakNo, 'Z-1897')
  assert.equal(model.toplam, '731,00')
  assert.deepEqual(model.bolumler.map(section => section.baslik), ['Vergi Dökümü', 'Kasa Döküm', 'Banka Döküm', 'Evrak Döküm', 'Ödemeler Özet'])
  assert.equal(model.bolumler[0].gruplar.length, 4)
  assert.equal(model.bolumler[1].gruplar[0].satirlar[1].deger, '—')
  assert.equal(model.bolumler[3].gruplar[0].satirlar[0].deger, '—')
  const html = rapor.fisRaporHtml({ ...fixed, karsi_unvan: '<script>alert("x")</script>' })
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(!html.includes('<script>'))
  assert.ok(html.includes('TOPLAM CİRO'))
  assert.ok(!html.includes('E-FATURA / E-ARŞİV'))
  const expense = rapor.fisRaporModeli({ ...fixed, fatura_turu: 'GİDER FİŞİ' })
  assert.equal(expense.baslik, 'Gider Fişi')
  assert.equal(expense.toplamEtiket, 'GENEL TOPLAM')
  const historical = rapor.fisRaporModeli({ fatura_turu: 'Z RAPORU', matrah: 100, kdv: 13, tutar: 113,
    kdvDetaylari: [{ oran: 8, matrah: 50, kdv: 4 }, { oran: 18, matrah: 50, kdv: 9 }] })
  assert.deepEqual(historical.bolumler[0].gruplar.map(group => group.etiket), ['%8 KDV', '%18 KDV'])
  assert.ok(rapor.fisRaporModeli(legacy).uyari)

  if (process.argv.includes('--preview')) {
    const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'mubis-z-rapor-'))
    const sample = { ...fixed, karsi_unvan: 'ÖRNEK VERİ · Görünüm kontrolü' }
    fs.writeFileSync(path.join(dir, 'z-raporu-ornek.html'), rapor.fisRaporHtml(sample))
    fs.writeFileSync(path.join(dir, 'sample.json'), JSON.stringify(sample))
    console.log('PREVIEW=' + dir)
  }
  console.log('PASS: receipt sections, verified VAT rows, non-repeated payments, blank template cells, legacy partial VAT correction, safe total matching, HTML escaping and unknown source fields.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
