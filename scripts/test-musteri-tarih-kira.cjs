const assert = require('node:assert/strict')
const fs = require('node:fs')

async function main() {
  const { normalizeClientDate, normalizeRentalDates } = await import('../src/utils/clientForm.js')
  assert.equal(normalizeClientDate(''), null)
  assert.equal(normalizeClientDate('13.11.2026'), '2026-11-13')
  assert.equal(normalizeClientDate('2026-11-13'), '2026-11-13')
  assert.equal(normalizeClientDate(undefined), undefined)
  const before = { kiraTipi: 'kiraci', kiraBaslangic: '', isyeriSahipleri: [{ adSoyad: 'Test', kiraBaslangic: '', kiraBitis: '31.12.2026', netKira: '500' }], evSahipleri: [{ kiraBitis: '' }], kiraGecmisi: [{ kiraBaslangic: '01.01.2025', aciklama: 'önceki' }] }
  const after = normalizeRentalDates(before)
  assert.equal(after.kiraBaslangic, null)
  assert.deepEqual(after.isyeriSahipleri[0], { adSoyad: 'Test', kiraBaslangic: null, kiraBitis: '2026-12-31', netKira: '500' })
  assert.equal(after.evSahipleri[0].kiraBitis, null)
  assert.equal(after.kiraGecmisi[0].kiraBaslangic, '2025-01-01')
  assert.equal(before.isyeriSahipleri[0].kiraBaslangic, '')
  assert.deepEqual(normalizeRentalDates({ isyeriSahipleri: [{ adSoyad: 'Test' }] }), { isyeriSahipleri: [{ adSoyad: 'Test' }] })
  const page = fs.readFileSync('src/pages/ClientDetail.jsx', 'utf8')
  assert.equal((page.match(/value=\{normalizeDateForInput\(editData\.openDate\)\}/g) || []).length, 2)
  assert.doesNotMatch(page, /editData\.isAcilisTarihi/)
  assert.match(page, /Object\.hasOwn\(cleanData, df\)/)
  assert.match(page, /\.\.\.result\.client/)
  assert.match(page, /saveClient\(\{ kiraBilgisi: kb \}\)/)
  const service = fs.readFileSync('src/services/clientService.js', 'utf8')
  assert.match(service, /mapped\.kira_bilgisi = JSON\.stringify\(mapped\.kira_bilgisi\)/)
  console.log('Müşteri tarih ve kira kontrolleri başarılı.')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
