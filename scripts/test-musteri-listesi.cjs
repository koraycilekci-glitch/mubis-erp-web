const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

async function main() {
  const store = await import(pathToFileURL(path.resolve('src/services/clientStore.js')).href)
  let cagriA = 0
  let cozA
  const beklemeA = new Promise(resolve => { cozA = resolve })
  const getirA = async () => {
    cagriA++
    await beklemeA
    return [{ id: 'a-1' }]
  }
  const ilk = store.musteriListesiGetir(getirA, { kapsam: 'oturum-a' })
  const ikinci = store.musteriListesiGetir(getirA, { kapsam: 'oturum-a' })
  const b = store.musteriListesiGetir(async () => [{ id: 'b-1' }], { kapsam: 'oturum-b' })
  cozA()
  const [a1, a2, b1] = await Promise.all([ilk, ikinci, b])
  assert.equal(cagriA, 1, 'Aynı oturumun eşzamanlı istekleri tek sorguya inmeli')
  assert.deepEqual(a1, a2)
  assert.equal(a1[0].id, 'a-1')
  assert.equal(b1[0].id, 'b-1')
  assert.deepEqual(store.musteriListesiOnbellek('oturum-a'), a1)
  assert.deepEqual(store.musteriListesiOnbellek('oturum-b'), b1)

  await assert.rejects(
    store.musteriListesiGetir(async () => { throw new Error('PGRST003') }, { kapsam: 'oturum-a', zorla: true }),
    /PGRST003/
  )
  assert.deepEqual(store.musteriListesiOnbellek('oturum-a'), a1, 'Hata sonrası önceki veri korunmalı')

  let aYayin = 0
  let bYayin = 0
  const aboneA = store.musteriListesineAboneOl('oturum-a', () => { aYayin++ })
  const aboneB = store.musteriListesineAboneOl('oturum-b', () => { bYayin++ })
  await store.musteriListesiGetir(async () => [{ id: 'a-2' }], { kapsam: 'oturum-a', zorla: true })
  assert.equal(aYayin, 1)
  assert.equal(bYayin, 0, 'Bir oturumun verisi diğer oturuma yayınlanmamalı')
  aboneA()
  aboneB()

  const auth = fs.readFileSync('src/context/AuthContext.jsx', 'utf8')
  assert.ok(!/const getClients = async \(\) => \{\s*try\s*\{[\s\S]{0,240}catch\s*\{\s*return \[\]/.test(auth), 'Müşteri sorgusu hatası boş listeye çevrilmemeli')
  const sidebar = fs.readFileSync('src/components/AdminSidebar.jsx', 'utf8')
  assert.ok(!sidebar.includes('hoverAcik'))
  assert.ok(!sidebar.includes('lg:w-[68px]'))
  const dashboard = fs.readFileSync('src/pages/AdminDashboard.jsx', 'utf8')
  assert.ok(dashboard.includes('Müşteri verileri şu anda doğrulanamıyor.'))
  assert.ok(dashboard.includes('refreshClients'))
  console.log('PASS: müşteri sorguları birleşiyor, oturum verileri ayrılıyor, hatalar korunuyor ve menü sürekli açık.')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
