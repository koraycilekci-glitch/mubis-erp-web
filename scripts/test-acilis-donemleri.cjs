const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

async function main() {
  const { acilisOncesiAy, beyanDonemiAcilmadi, kapanisSonrasiAy, beyanDonemiKapandi, matrisBeyanAylari } = await import('../src/utils/beyanKapanis.js')
  const client = { id: 1, name: 'Test', openDate: '2026-05-15', closeDate: '2026-08-15' }
  assert.equal(acilisOncesiAy(client, 2025, 12), true)
  assert.equal(acilisOncesiAy(client, 2026, 4), true)
  assert.equal(acilisOncesiAy(client, 2026, 5), false)
  assert.equal(acilisOncesiAy({ open_date: '15.05.2026' }, 2026, 4), true)
  assert.equal(acilisOncesiAy({ open_date: '2026-02-30' }, 2026, 1), false)
  assert.equal(acilisOncesiAy({}, 2026, 1), false)
  assert.equal(beyanDonemiAcilmadi(client, 2026, [0, 1, 2]), true)
  assert.equal(beyanDonemiAcilmadi(client, 2026, [3, 4, 5]), false)
  assert.equal(beyanDonemiAcilmadi(client, 2026, []), false)

  const declarationPage = fs.readFileSync('src/pages/AylikBeyanTakip.jsx', 'utf8')
  const start = declarationPage.indexOf('  const generateMonthlyBeyanlar =')
  const end = declarationPage.indexOf('  const getBeyanSummary =', start)
  assert.ok(start >= 0 && end > start)
  const profile = { muhtasar: Object.fromEntries(Array.from({ length: 12 }, (_, month) => [month, { active: true, period: '3aylik' }])) }
  const beyanClient = { ...client, beyanProfile: profile, beyanDurumlari: { '2026_3_kdv': 'onaylandi' } }
  const generate = month => vm.runInNewContext(`${declarationPage.slice(start, end)}\ngenerateMonthlyBeyanlar(client)`, {
    client: beyanClient, selectedYear: 2026, selectedMonth: month, beyanDonemiKapandi, beyanDonemiAcilmadi,
    getMonthName: value => String(value), getFormattedBeyanDeadline: () => '', getFormattedSgkOdemeGunu: () => ''
  })
  assert.equal(generate(3).find(item => item.type === 'kdv').status, 'acilmadi')
  assert.equal(generate(4).find(item => item.type === 'kdv').status, 'yapilamadi')
  assert.equal(generate(2).find(item => item.type === 'muhtasar_3aylik').status, 'acilmadi')
  assert.equal(generate(5).find(item => item.type === 'muhtasar_3aylik').status, 'yapilamadi')
  assert.equal(generate(8).find(item => item.type === 'kdv').status, 'kapandi')
  assert.equal(beyanClient.beyanDurumlari['2026_3_kdv'], 'onaylandi')
  const guardStart = declarationPage.indexOf('  const beyanKaydiKapandi =')
  const guardEnd = declarationPage.indexOf('  const persistStatus =', guardStart)
  const guard = vm.runInNewContext(`${declarationPage.slice(guardStart, guardEnd)}\nbeyanKaydiKapandi`, { beyanDonemiKapandi, beyanDonemiAcilmadi, matrisBeyanAylari })
  assert.equal(guard(client, { type: 'muhtasar_3aylik', belongYear: 2026, belongMonths: [0] }), true)
  assert.equal(guard(client, { type: 'muhtasar_3aylik', belongYear: 2026, belongMonths: [3] }), false)
  assert.match(declarationPage, /'acilmadi': 'AÇILMADI'/)

  const service = fs.readFileSync('src/services/paymentService.js', 'utf8')
  const serviceStart = service.indexOf('export function normalizeDonem(')
  const serviceEnd = service.indexOf('// ============ BORC BILDIRIM MESAJI', serviceStart)
  const hesapla = vm.runInNewContext(`${service.slice(serviceStart, serviceEnd).replaceAll('export function', 'function')}\nhesaplaBorcOzeti`, { kapanisSonrasiAy, acilisOncesiAy })
  const fee = { client_id: 1, aylik_ucret: 100, baslangic_yil: 2026, baslangic_ay: 1, onceki_donem_borc: 0, defter_tasdik_ucreti: 0 }
  const payments = [{ client_id: 1, donem: '2026-04', tutar: 100, durum: 'onaylandi' }]
  const result = hesapla(fee, payments, new Date(2026, 9, 15), client)
  assert.equal(result.gecenAy, 4)
  assert.equal(result.toplamOdeme, 0)
  assert.equal(result.kalanBorc, 400)

  const page = fs.readFileSync('src/pages/OdemeTakip.jsx', 'utf8')
  const matrixStart = page.indexOf('  const tumSatirlar = clients.map')
  const matrixEnd = page.indexOf('  const rows =', matrixStart)
  const row = vm.runInNewContext(`${page.slice(matrixStart, matrixEnd)}\ntumSatirlar[0]`, { clients: [client], fees: [fee], payments, yil: 2026, nowY: 2026, nowM: 10, kapanisSonrasiAy, acilisOncesiAy })
  assert.equal(row.faturalananAy, 4)
  assert.equal(row.kalan, 400)
  const statusStart = page.indexOf('  const monthStatus =')
  const statusEnd = page.indexOf('  // Defter Tasdik', statusStart)
  const status = vm.runInNewContext(`${page.slice(statusStart, statusEnd)}\nmonthStatus`, { yil: 2026, nowY: 2026, nowM: 10, kapanisSonrasiAy, acilisOncesiAy })
  assert.equal(status(row, 4), 'acilmadi')
  assert.equal(status(row, 5), 'geciken')
  assert.equal(status(row, 9), 'kapali')
  assert.match(page, /acilmadi: 'AÇILMADI'/)

  const server = fs.readFileSync('functions/api/borc-bildirim.js', 'utf8')
  const serverStart = server.indexOf('async function muhasebeBorclari(')
  const serverEnd = server.indexOf('async function jwtProfili(', serverStart)
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [2026, 9, 15])) } }
  const serverCalc = vm.runInNewContext(`${server.slice(serverStart, serverEnd)}\nmuhasebeBorclari`, { kapanisSonrasiAy, acilisOncesiAy, sayi: value => Number(value) || 0, Date: FixedDate })
  const db = { from: table => ({ select: () => ({ in: async () => ({ data: table === 'accounting_fees' ? [fee] : payments }) }) }) }
  assert.equal((await serverCalc(db, [client])).get('1').kalanBorc, 400)
  console.log('Açılış ayı, aylık ve üç aylık beyanlar, ücret borcu ve bildirim hesapları doğrulandı.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
