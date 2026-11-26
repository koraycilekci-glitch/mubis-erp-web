const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

async function main() {
  const { kapanisSonrasiAy, acilisOncesiAy } = await import('../src/utils/beyanKapanis.js')
  const source = fs.readFileSync('src/pages/OdemeTakip.jsx', 'utf8')
  const start = source.indexOf('  const tumSatirlar = clients.map')
  const end = source.indexOf('  const rows =', start)
  assert.ok(start >= 0 && end > start)
  const getRows = (clients, fees) => vm.runInNewContext(`${source.slice(start, end)}\ntumSatirlar`, {
    clients, fees, payments: [], yil: 2026, nowY: 2026, nowM: 3, kapanisSonrasiAy, acilisOncesiAy
  })
  const rows = getRows(
    [{ id: 1 }, { id: 2 }, { id: 3 }],
    [{ client_id: 1, muhasebe_ucreti_var: false }, { client_id: 2, aylik_ucret: 100, baslangic_yil: 2026, baslangic_ay: 1 }]
  )
  assert.deepEqual(Array.from(rows, row => row.id), [2, 3])
  assert.equal(rows.reduce((total, row) => total + row.toplamBorc, 0), 300)
  assert.equal(rows.reduce((total, row) => total + row.odenen, 0), 0)
  assert.equal(getRows([{ id: 1 }], [{ client_id: 1, muhasebe_ucreti_var: false }]).length, 0)
  console.log('Ücretsiz müşteriler varken ödeme takip satırları ve özetler başarılı.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
