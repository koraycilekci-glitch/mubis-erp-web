const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

async function main() {
  const { beyanDonemiKapandi, beyanDonemiAcilmadi, matrisBeyanAylari } = await import('../src/utils/beyanKapanis.js')
  const closed = { closeDate: '2026-05-15' }
  for (const type of ['kdv', 'kdv2', 'muhtasar', 'sgk', 'poset']) {
    assert.equal(beyanDonemiKapandi(closed, type, 2026, [3]), false)
    assert.equal(beyanDonemiKapandi(closed, type, 2026, [4]), false)
    assert.equal(beyanDonemiKapandi(closed, type, 2026, [5]), true)
    assert.equal(beyanDonemiKapandi(closed, type, 2027, [0]), true)
    assert.equal(beyanDonemiKapandi(closed, type, 2025, [11]), false)
  }
  for (const type of ['muhtasar_3aylik', 'gecici_vergi']) {
    assert.equal(beyanDonemiKapandi(closed, type, 2026, [0, 1, 2]), false)
    assert.equal(beyanDonemiKapandi(closed, type, 2026, [3, 4, 5]), false)
    assert.equal(beyanDonemiKapandi(closed, type, 2026, [6, 7, 8]), true)
    assert.deepEqual(matrisBeyanAylari(type, 5), [3, 4, 5])
    assert.deepEqual(matrisBeyanAylari(type, 4), [])
  }
  assert.equal(beyanDonemiKapandi({ close_date: '31.12.2026' }, 'sgk', 2027, [0]), true)
  assert.equal(beyanDonemiKapandi({ closeDate: null, close_date: '2026-01-01' }, 'sgk', 2027, [0]), false)
  assert.equal(beyanDonemiKapandi({ closeDate: '2026-02-30' }, 'kdv', 2026, [4]), false)
  assert.equal(beyanDonemiKapandi(closed, 'edefter', 2027, [0]), false)
  assert.equal(beyanDonemiKapandi(closed, 'kurumlar_vergi', 2027, [0]), false)
  assert.equal(beyanDonemiKapandi(closed, 'kdv', 2026, []), false)

  const page = fs.readFileSync('src/pages/AylikBeyanTakip.jsx', 'utf8')
  const start = page.indexOf('  const generateMonthlyBeyanlar =')
  const end = page.indexOf('  const getBeyanSummary =', start)
  assert.ok(start >= 0 && end > start)
  const generate = (year, month, client) => vm.runInNewContext(`${page.slice(start, end)}\ngenerateMonthlyBeyanlar(client)`, {
    client, selectedYear: year, selectedMonth: month, beyanDonemiKapandi, beyanDonemiAcilmadi,
    getMonthName: value => String(value), getFormattedBeyanDeadline: () => '', getFormattedSgkOdemeGunu: () => ''
  })
  const profile = {
    muhtasar: Object.fromEntries(Array.from({ length: 12 }, (_, month) => [month, { active: month < 6, period: '3aylik' }])),
    gecici_vergi: { 2: { active: true }, 5: { active: true }, 8: { active: false }, 11: { active: false } },
    sgk: { 4: { active: true }, 5: { active: false } }
  }
  const client = { ...closed, id: 1, beyanProfile: profile, beyanDurumlari: { '2026_5_sgk': 'onaylandi' } }
  assert.equal(generate(2026, 4, client).find(item => item.type === 'sgk').status, 'yapilamadi')
  assert.equal(generate(2026, 5, client).find(item => item.type === 'sgk').status, 'kapandi')
  assert.equal(generate(2026, 5, client).find(item => item.type === 'muhtasar_3aylik').status, 'yapilamadi')
  assert.equal(generate(2026, 8, client).find(item => item.type === 'muhtasar_3aylik').status, 'kapandi')
  assert.equal(generate(2026, 6, client).find(item => item.type === 'gecici_vergi').status, 'yapilamadi')
  assert.equal(generate(2026, 9, client).find(item => item.type === 'gecici_vergi').status, 'kapandi')
  assert.equal(client.beyanDurumlari['2026_5_sgk'], 'onaylandi')
  const guardStart = page.indexOf('  const beyanKaydiKapandi =')
  const guardEnd = page.indexOf('  const persistStatus =', guardStart)
  assert.ok(guardStart >= 0 && guardEnd > guardStart)
  const guard = vm.runInNewContext(`${page.slice(guardStart, guardEnd)}\nbeyanKaydiKapandi`, { beyanDonemiKapandi, beyanDonemiAcilmadi, matrisBeyanAylari })
  assert.equal(guard(closed, { type: 'gecici_vergi', belongYear: 2026, belongMonths: [5] }), false)
  assert.equal(guard(closed, { type: 'gecici_vergi', belongYear: 2026, belongMonths: [8] }), true)
  assert.match(page, /beyanlar\.filter\(b => b\.status !== 'kapandi' && b\.status !== 'acilmadi'\)/)
  assert.match(page, /hucreKapandi\(c, m\)/)
  assert.match(page, /statusOptions = \[/)
  console.log('Kapanış tarihi, dönem sınırları ve beyan listesi kontrolleri başarılı.')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
