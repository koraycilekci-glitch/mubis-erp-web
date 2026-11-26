const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

async function main() {
  const serviceSource = fs.readFileSync('src/services/paymentService.js', 'utf8')
  const serviceStart = serviceSource.indexOf('export async function clearPreviousPeriodDebt(')
  const serviceEnd = serviceSource.indexOf('export async function getAllAccountingFees(', serviceStart)
  assert.ok(serviceStart >= 0 && serviceEnd > serviceStart)
  let query = {}
  let result = { data: { client_id: 1, onceki_donem_borc: 0 }, error: null }
  const supabase = { from(table) {
    query.table = table
    return { update(values) {
      query.values = values
      return { eq(field, value) {
        query.field = field
        query.value = value
        return { select(columns) {
          query.columns = columns
          return { single: async () => result }
        } }
      } }
    } }
  } }
  const clear = vm.runInNewContext(`${serviceSource.slice(serviceStart, serviceEnd).replace('export async function', 'async function')}\nclearPreviousPeriodDebt`, { supabase, Date })
  assert.equal((await clear(1)).onceki_donem_borc, 0)
  assert.equal(query.table, 'accounting_fees')
  assert.equal(query.field, 'client_id')
  assert.equal(query.value, 1)
  assert.equal(query.values.onceki_donem_borc, 0)
  assert.deepEqual(Object.keys(query.values).sort(), ['onceki_donem_borc', 'updated_at'])
  result = { data: null, error: new Error('Yetki yok') }
  await assert.rejects(clear(1), /Yetki yok/)
  result = { data: null, error: null }
  await assert.rejects(clear(1), /silinemedi/)

  const page = fs.readFileSync('src/pages/OdemeTakip.jsx', 'utf8')
  const start = page.indexOf('  const handleOncekiBorcSil =')
  const end = page.indexOf('  // Online odeme linki', start)
  assert.ok(start >= 0 && end > start)
  let fees = [{ client_id: 1, onceki_donem_borc: 100, aylik_ucret: 20 }, { client_id: 2, onceki_donem_borc: 50 }]
  let confirmation = ''
  let allowed = false
  let called = 0
  let busy = null
  let message = ''
  const context = {
    borcSilinenId: null,
    confirm: text => { confirmation = text; return allowed },
    setBorcSilinenId: value => { busy = value },
    clearPreviousPeriodDebt: async clientId => { called++; return { client_id: clientId, onceki_donem_borc: 0 } },
    setFees: update => { fees = update(fees) },
    alert: text => { message = text }
  }
  const handle = vm.runInNewContext(`${page.slice(start, end)}\nhandleOncekiBorcSil`, context)
  const row = { id: 1, name: 'Test', oncekiDonem: 100, oncekiDonemToplam: 140 }
  await handle(row)
  assert.equal(called, 0)
  assert.match(confirmation, /Geçmiş aylardan hesaplanan borç ve ödeme kayıtları korunacaktır/)
  allowed = true
  await handle(row)
  assert.equal(called, 1)
  assert.equal(fees[0].onceki_donem_borc, 0)
  assert.equal(fees[0].aylik_ucret, 20)
  assert.equal(fees[1].onceki_donem_borc, 50)
  assert.equal(busy, null)
  await handle({ ...row, oncekiDonem: 0 })
  assert.equal(called, 1)
  context.clearPreviousPeriodDebt = async () => { throw new Error('Yetki yok') }
  await handle(row)
  assert.match(message, /Yetki yok/)
  assert.equal(busy, null)
  assert.match(page, /r\.oncekiDonem > 0 && \(/)
  console.log('Önceki dönem borcu silme, iptal, yetki hatası ve diğer kayıtların korunması başarılı.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
