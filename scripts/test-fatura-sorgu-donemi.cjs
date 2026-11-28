const fs = require('node:fs')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')

const utility = fs.readFileSync('src/utils/faturaSorguDonemi.js', 'utf8').replace(/^export /gm, '')
const context = vm.createContext({ Date, Number, String })
vm.runInContext(utility, context)
const plain = value => JSON.parse(JSON.stringify(value))
const split = (year, month, days, now = new Date(2026, 10, 27)) => plain(context.donemParcalari(year, month, days, now))
const rejected = () => Object.assign(new Error('Aralık reddedildi'), { code: 'LUCA_ARALIK_REDDEDILDI', isBitti: true })

async function dates() {
  assert.deepEqual(split(2026, 10, 30).map(part => [part.bas, part.bit]), [['01/10/2026', '30/10/2026'], ['31/10/2026', '31/10/2026']])
  assert.equal(split(2024, 2, 30)[0].bit, '29/02/2024')
  assert.equal(split(2025, 2, 30)[0].bit, '28/02/2025')
  assert.equal(split(2026, 11, 30)[0].bit, '27/11/2026')
  assert.equal(split(2026, 9, 7).length, 5)
  assert.equal(context.donemParcalari(2026, 13, 30), null)
  const part = split(2026, 10, 30)[0]
  assert.deepEqual(plain(context.yedekParcalari(rejected(), part)).map(item => [item.bas, item.bit]), [['01/10/2026', '07/10/2026'], ['08/10/2026', '14/10/2026'], ['15/10/2026', '21/10/2026'], ['22/10/2026', '28/10/2026'], ['29/10/2026', '30/10/2026']])
  assert.equal(context.yedekParcalari(new Error('zaman aşımı'), part).length, 0)
  assert.equal(context.yedekParcalari({ code: 'LUCA_ARALIK_REDDEDILDI' }, part).length, 0)
  assert.equal(context.yedekParcalari(rejected(), split(2026, 10, 30)[1]).length, 0)
}

function mockDatabase(initial = {}) {
  const row = { durum: initial, lease_id: null }
  const queries = []
  const supabase = { from() {
    let update
    let match
    const query = {
      upsert: async () => ({ error: null }),
      update(value) { update = value; return query },
      match(value) { match = value; return query },
      or() { return query },
      select() { return query },
      async maybeSingle() {
        if (match?.lease_id && match.lease_id !== row.lease_id) return { data: null }
        Object.assign(row, update)
        if (update.durum) queries.push(plain(update.durum))
        return { data: update.lease_id && !match?.lease_id ? { durum: row.durum } : { lease_id: row.lease_id }, error: null }
      },
      then(resolve) { Object.assign(row, update); return Promise.resolve({ error: null }).then(resolve) }
    }
    return query
  } }
  return { supabase, row, queries }
}

async function transfers() {
  const source = fs.readFileSync('src/services/faturaAktarimService.js', 'utf8').replace(/^import .*\n/gm, '').replace(/^export /gm, '')
  const db = mockDatabase()
  const calls = []
  let fail = true
  let cancelled = false
  const runtime = vm.createContext({ ...context, console, Date, crypto, setInterval, clearInterval, Promise, Error, Object, Map, Set,
    supabase: db.supabase, yedekParcalari: context.yedekParcalari,
    efaturaSorgula: async args => {
      if (!args.sadeceSorgu) return { bosDogrulandi: true }
      calls.push(args.baslangicTarih + '-' + args.bitisTarih)
      if (args.baslangicTarih === '01/10/2026' && args.bitisTarih === '30/10/2026') throw rejected()
      if (fail && args.baslangicTarih === '08/10/2026') throw new Error('Kayıt testi için işlem hatası')
      return { sorguDogrulandi: true }
    }
  })
  vm.runInContext(source, runtime)
  const args = { client: { id: 'test' }, yil: 2026, ay: 10, tur: 'efatura', yon: 'alis', parcalar: split(2026, 10, 30), iptalKontrol: () => cancelled }
  await assert.rejects(runtime.faturaAktariminiCalistir(args), /işlem hatası/)
  assert.equal(db.row.durum.plan.length, 6)
  assert.deepEqual(plain(db.row.durum.parcalar), ['01/10/2026|07/10/2026'])
  assert.equal(db.row.durum.sorun, 'sorgu')
  db.row.durum.sorun = 'bekliyor'
  const beforeBlocked = calls.length
  await assert.rejects(runtime.faturaAktariminiCalistir({ ...args, devam: true }), /sonucu izlenemiyor/)
  assert.equal(calls.length, beforeBlocked)
  db.row.durum.sorun = 'sorgu'
  fail = false
  const beforeResume = calls.length
  await runtime.faturaAktariminiCalistir({ ...args, devam: true })
  assert.equal(calls.slice(beforeResume)[0], '08/10/2026-14/10/2026')
  assert.equal(calls.filter(call => call === '01/10/2026-07/10/2026').length, 1)
  assert.equal(db.row.durum.parcalar.length, 6)
  cancelled = true
  const count = calls.length
  await assert.rejects(runtime.faturaAktariminiCalistir(args), /KULLANICI_DURDURDU/)
  assert.equal(calls.length, count)
}

async function tracking() {
  const source = fs.readFileSync(process.env.LUCA_HELPER_TEST_FILE || 'gib-yardimci-sunucu/index.js', 'utf8')
  const start = source.indexOf('async function lucaGibIslemTakibiniBekle(')
  const end = source.indexOf('async function lucaFaturaListeDurumu(', start)
  assert.ok(start >= 0 && end > start)
  let now = 0
  let text = ''
  let clicked = false
  const button = { getClientRects: () => [1], innerText: 'Kapat', click: () => { clicked = true } }
  const panel = { getClientRects: () => [1], get innerText() { return text }, querySelectorAll: () => [button] }
  const sandbox = vm.createContext({ console, LUCA_GETIR_IPTAL: false, Date: { now: () => now }, setTimeout: callback => { now += 1000; callback() }, document: { querySelector: () => panel }, getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) })
  vm.runInContext(source.slice(start, end), sandbox)
  const browser = { pages: async () => [{ frames: () => [{ evaluate: async callback => vm.runInContext('(' + callback.toString() + ')()', sandbox) }] }] }
  text = 'İŞLEM TAKİP\nTarih aralığı en fazla 7 gün olabilir\nSorgu reddedildi\nKapat'
  await assert.rejects(sandbox.lucaGibIslemTakibiniBekle(browser, 'test'), error => error.code === 'LUCA_ARALIK_REDDEDILDI')
  assert.equal(clicked, true)
  text = 'İŞLEM TAKİP\nTarih aralığı en fazla 7 gün olabilir\nİşlem devam ediyor\nKapat'
  now = 0; clicked = false
  await assert.rejects(sandbox.lucaGibIslemTakibiniBekle(browser, 'test'), /suresinde tamamlanmadi/)
  assert.equal(clicked, false)
}

async function servicePropagation() {
  const source = fs.readFileSync('src/services/efaturaService.js', 'utf8')
  const start = source.indexOf('export async function efaturaSorgula(')
  const end = source.indexOf('async function uttsExcelDosyalariniYukle(', start)
  assert.ok(start >= 0 && end > start)
  const runtime = vm.createContext({ console, setTimeout, Map, Date,
    lucaBilgileriGetir: async () => ({ username: 'test', password: 'test', member: 'test' }),
    musteriGirisBilgileriGetir: async () => null,
    kayitKlasorleriGetir: async () => ({}),
    yardimciIsSunucu: async () => ({ ok: true, girisOk: true, akisTamam: false, sorguHataKodu: 'LUCA_ARALIK_REDDEDILDI', not: 'Aralık reddedildi' })
  })
  vm.runInContext(source.slice(start, end).replace(/^export /gm, ''), runtime)
  await assert.rejects(runtime.efaturaSorgula({ client: { id: 'test' }, sadeceSorgu: true }), error => error.code === 'LUCA_ARALIK_REDDEDILDI' && error.isBitti === true)
}

;(async () => { await dates(); await transfers(); await tracking(); await servicePropagation(); console.log('PASS: tarih sınırları, kayıtlı yedek planı, devam, iptal ve güvenli ret') })().catch(error => { console.error(error); process.exitCode = 1 })
