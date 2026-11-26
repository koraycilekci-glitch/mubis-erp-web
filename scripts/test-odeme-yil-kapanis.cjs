const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

async function main() {
  const { kapanisSonrasiAy, acilisOncesiAy } = await import('../src/utils/beyanKapanis.js')
  const source = fs.readFileSync('src/pages/OdemeTakip.jsx', 'utf8')
  const start = source.indexOf('  const tumSatirlar = clients.map')
  const end = source.indexOf('  const rows =', start)
  const totalsStart = source.indexOf('  const kapananMusteriIds =')
  const totalsEnd = source.indexOf('  // ============ ODEME KAYDI MODAL', totalsStart)
  assert.ok(start >= 0 && end > start && totalsStart >= 0 && totalsEnd > totalsStart)
  const clients = [
    { id: 1, close_date: '2025-12-31' },
    { id: 2, closeDate: '01.01.2026' },
    { id: 3, close_date: null },
    { id: 4, close_date: '2025-02-30' },
    { id: 5, close_date: '2027-01-01' }
  ]
  const fees = clients.map(client => ({ client_id: client.id, aylik_ucret: 100, baslangic_yil: 2025, baslangic_ay: 1, onceki_donem_borc: 20 }))
  const payments = [
    { client_id: 1, donem: '2026-01', tutar: 100, durum: 'onaylandi' },
    { client_id: 2, donem: '2026-01', tutar: 100, durum: 'onaylandi' },
    { client_id: 3, donem: '2026-01', tutar: 100, durum: 'onaylandi' }
  ]
  const evaluate = year => vm.runInNewContext(`${source.slice(start, end)}\n${source.slice(totalsStart, totalsEnd)}\n;({ tumSatirlar, aylikTahsilatlar, aylikTahsilatToplam })`, {
    clients, fees, payments, yil: year, nowY: 2027, nowM: 6, kapanisSonrasiAy, acilisOncesiAy, AYLER: Array.from({ length: 12 })
  })
  assert.deepEqual(Array.from(evaluate(2025).tumSatirlar, row => row.id), [1, 2, 3, 4, 5])
  const year2026 = evaluate(2026)
  assert.deepEqual(Array.from(year2026.tumSatirlar, row => row.id), [2, 3, 4, 5])
  assert.equal(year2026.aylikTahsilatlar[0], 200)
  assert.equal(year2026.aylikTahsilatToplam, 200)
  assert.deepEqual(Array.from(evaluate(2027).tumSatirlar, row => row.id), [3, 4, 5])
  assert.deepEqual(Array.from(evaluate(2028).tumSatirlar, row => row.id), [3, 4])
  assert.equal(year2026.tumSatirlar.find(row => row.id === 2).faturalananAy, 1)
  assert.match(source, /setYil\(Number\(e\.target\.value\)\); setSelectedIds\(\[\]\)/)
  console.log('Ödeme listesinde kapanış yılı, sonraki yıllar, geçersiz tarihler ve tahsilat toplamları doğrulandı.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
