const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { webcrypto, createHash } = require('node:crypto')
const { TextEncoder } = require('node:util')

const source = fs.readFileSync('src/services/efaturaService.js', 'utf8')
const extract = (start, end) => {
  const first = source.indexOf(start)
  const last = source.indexOf(end, first)
  assert.ok(first >= 0 && last > first)
  return source.slice(first, last).replace('export async function', 'async function')
}

async function main() {
  const satir = { tarih: '2026-11-18', faturaNo: '104', vkn: '1234567890', toplam: 120, matrah: 100, kdv: 20 }
  const hash = createHash('sha256').update(JSON.stringify([satir.tarih, satir.faturaNo, satir.vkn])).digest('hex')
  const fatura = { id: 1, client_id: 2, tur: 'utts', fatura_uuid: `utts_${hash}`, xml_url: 'drive:source', karsi_vkn: '', tutar: 120, matrah: 100, kdv: 20 }
  const writes = []
  let allowWrite = true
  const query = {
    update(value) { writes.push(value); return this },
    eq() { return this },
    is() { return this },
    async select() { return { data: allowWrite ? [{ id: 1 }] : [], error: null } },
  }
  const context = vm.createContext({
    crypto: webcrypto, TextEncoder, Uint8Array, Map, Set,
    supabase: { from() { return query } },
    fetchDocument: async () => ({ arrayBuffer: async () => new ArrayBuffer(0) }),
    uttsOtomatikSatirlariniOku: async () => [satir],
  })
  vm.runInContext(extract('async function uttsKimlikleriniOnar', '\nexport async function uttsUnvanlariniGetir'), context)
  await context.uttsKimlikleriniOnar([fatura])
  assert.equal(fatura.karsi_vkn, satir.vkn)
  assert.equal(writes.length, 1)
  const unequal = { ...fatura, id: 2, karsi_vkn: '', tutar: 130 }
  await context.uttsKimlikleriniOnar([unequal])
  assert.equal(unequal.karsi_vkn, '')
  assert.equal(writes.length, 1)
  const mismatch = { ...fatura, id: 3, karsi_vkn: '', fatura_uuid: `utts_${'a'.repeat(64)}` }
  await context.uttsKimlikleriniOnar([mismatch])
  assert.equal(mismatch.karsi_vkn, '')
  assert.equal(writes.length, 1)
  allowWrite = false
  const denied = { ...fatura, id: 4, karsi_vkn: '' }
  await context.uttsKimlikleriniOnar([denied])
  assert.equal(denied.karsi_vkn, satir.vkn)
  const repair = extract('export async function karsiTarafOnar', '\n// Musterinin kayitli faturalarini listeler')
  let fetched = 0
  const repairContext = vm.createContext({
    supabase: { from() { return { select() { return this }, eq() { return this }, async single() { return { data: { vkn: '1111111111' } } } } } },
    fetch: async () => { fetched++; return { ok: true, text: async () => 'not xml' } },
    faturaMetadatasiXml: () => ({ saticiVkn: '', aliciVkn: '' }),
  })
  vm.runInContext(repair, repairContext)
  assert.equal(await repairContext.karsiTarafOnar(2, [{ ...fatura }]), 0)
  assert.equal(fetched, 0)
  assert.equal(await repairContext.karsiTarafOnar(2, [{ ...fatura, tur: 'efatura' }]), 0)
  assert.equal(fetched, 1)
  console.log('PASS: UTTS recovery requires matching source identity and totals; denied updates and invalid XML cannot erase data.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
