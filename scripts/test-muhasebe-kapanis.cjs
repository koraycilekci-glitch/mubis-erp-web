const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

async function main() {
  const { kapanisSonrasiAy, acilisOncesiAy } = await import('../src/utils/beyanKapanis.js')
  assert.equal(kapanisSonrasiAy({ close_date: '2025-05-15' }, 2025, 5), false)
  assert.equal(kapanisSonrasiAy({ closeDate: '2025-05-15' }, 2025, 6), true)
  assert.equal(kapanisSonrasiAy({ close_date: '31.12.2025' }, 2026, 1), true)
  assert.equal(kapanisSonrasiAy({ close_date: null }, 2026, 12), false)
  assert.equal(kapanisSonrasiAy({ close_date: '2025-02-30' }, 2025, 4), false)

  const source = fs.readFileSync('src/services/paymentService.js', 'utf8')
  const start = source.indexOf('export function normalizeDonem(')
  const end = source.indexOf('// ============ BORC BILDIRIM MESAJI', start)
  assert.ok(start >= 0 && end > start)
  const hesapla = vm.runInNewContext(`${source.slice(start, end).replaceAll('export function', 'function')}\nhesaplaBorcOzeti`, { kapanisSonrasiAy, acilisOncesiAy })
  const fee = { aylik_ucret: 100, baslangic_yil: 2025, baslangic_ay: 4, onceki_donem_borc: 50, defter_tasdik_ucreti: 30 }
  const client = { id: 1, close_date: '2025-05-15' }
  const payments = [
    { client_id: 1, donem: '2025-04', tutar: 40, durum: 'onaylandi' },
    { client_id: 1, donem: '2025-06', tutar: 100, durum: 'onaylandi' }
  ]
  let result = hesapla(fee, payments, new Date(2025, 6, 15), client)
  assert.equal(result.gecenAy, 2)
  assert.equal(result.toplamBorc, 280)
  assert.equal(result.toplamOdeme, 40)
  assert.equal(result.kalanBorc, 240)
  assert.deepEqual(Array.from(result.odenmeyenAylar), [4, 5])
  result = hesapla(fee, payments, new Date(2026, 10, 15), client)
  assert.equal(result.gecenAy, 0)
  assert.equal(result.oncekiDonem, 210)
  assert.equal(result.kalanBorc, 240)
  assert.equal(hesapla(fee, payments, new Date(2025, 6, 15), {}).gecenAy, 4)
  assert.equal(hesapla(fee, [], new Date(2025, 3, 15), { close_date: '2025-03-31' }).gecenAy, 0)

  const page = fs.readFileSync('src/pages/OdemeTakip.jsx', 'utf8')
  const matrixStart = page.indexOf('  const tumSatirlar = clients.map')
  const matrixEnd = page.indexOf('  const rows =', matrixStart)
  assert.ok(matrixStart >= 0 && matrixEnd > matrixStart)
  const row = vm.runInNewContext(`${page.slice(matrixStart, matrixEnd)}\ntumSatirlar[0]`, {
    clients: [client], fees: [{ ...fee, client_id: 1 }], payments, yil: 2025, nowY: 2025, nowM: 7, kapanisSonrasiAy, acilisOncesiAy
  })
  assert.equal(row.faturalananAy, 2)
  assert.equal(row.kalan, 240)
  const statusStart = page.indexOf('  const monthStatus =')
  const statusEnd = page.indexOf('  // Defter Tasdik', statusStart)
  const status = vm.runInNewContext(`${page.slice(statusStart, statusEnd)}\nmonthStatus`, { yil: 2025, nowY: 2025, nowM: 7, kapanisSonrasiAy, acilisOncesiAy })
  assert.equal(status(row, 5), 'geciken')
  assert.equal(status(row, 6), 'kapali')
  assert.match(page, /kapali: 'KAPALI'/)
  assert.match(page, /durum === 'kapali' \? <span/)

  const server = fs.readFileSync('functions/api/borc-bildirim.js', 'utf8')
  const serverStart = server.indexOf('async function muhasebeBorclari(')
  const serverEnd = server.indexOf('async function jwtProfili(', serverStart)
  assert.ok(serverStart >= 0 && serverEnd > serverStart)
  const serverCalc = vm.runInNewContext(`${server.slice(serverStart, serverEnd)}\nmuhasebeBorclari`, { kapanisSonrasiAy, acilisOncesiAy, sayi: value => Number(value) || 0 })
  const db = { from: table => ({ select: () => ({ in: async () => ({ data: table === 'accounting_fees' ? [{ ...fee, client_id: 1 }] : payments }) }) }) }
  const serverResult = await serverCalc(db, [client])
  assert.equal(serverResult.get('1').kalanBorc, 240)
  console.log('Muhasebe kapanış ayı, sonraki aylar, önceki yıl, eski ödemeler, matris ve bildirim testleri başarılı.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
