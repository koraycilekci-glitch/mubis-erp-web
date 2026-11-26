const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

const service = fs.readFileSync('src/services/fisTaramaService.js', 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '')
const { grupla, ayDurumu } = vm.runInNewContext(`${service}\n({ grupla: kdvTahakkukAylari, ayDurumu: kdvTahakkukAyDurumu })`)
const normal = value => JSON.parse(JSON.stringify(value))

const fis = (voucherNo, date, description) => ({ id: `luca-${voucherNo}`, date, voucherNo, description })
const birinci = fis('014', '31/01/2026', 'Ocak KDV Tahakkuku')
const ikinci = fis('118', '28.02.2026', 'Katma Değer Vergisi Tahakkuk Fişi')
const alakasiz = fis('010', '02/01/2026', 'KDV satış faturası')

const tamDonem = { start: '01/01/2026', end: '31/12/2026' }
async function tara(dizin, sayfalar, donem = tamDonem) {
  const helper = require(`../${dizin}/fis-tarama.js`)
  const source = fs.readFileSync(`${dizin}/index.js`, 'utf8')
  const tarama = source.match(/"fis-tarama": (async \(p\) => \{[\s\S]*?\n  \}),/)[1]
  let sayfa = 0
  const istekler = []
  const run = vm.runInNewContext(tarama, {
    require: () => helper,
    console: { log() {} },
    ISLER: { 'luca-giris': async () => ({ ok: true }) },
    tarayiciAl: async () => ({ pages: async () => [{
      url: () => 'https://example.invalid/luca.do',
      frames: () => [{
        url: () => 'https://example.invalid/getFisParametreJSPAction.do',
        evaluate: async betik => {
          const request = JSON.parse(betik.slice(betik.lastIndexOf('})(') + 3, -1))
          istekler.push(request.action)
          if (request.action === 'state') return { filter: true, list: true, ready: true }
          if (request.action === 'period') return donem
          if (request.action === 'read') return sayfalar[sayfa]
          if (request.action === 'next') sayfa++
          if (request.action === 'filter') {
            assert.equal(request.filter.start, donem?.start || tamDonem.start)
            assert.equal(request.filter.end, donem?.end || tamDonem.end)
          }
          return true
        }
      }]
    }] }),
    lucaAnaSayfayaDon: async () => {},
    lucaMusteriSec: async () => true,
    lucaMenuYoluAc: async () => {},
    topluBelgeBekle: async () => {}
  })
  const sonuc = (await run({ fullName: 'Örnek Müşteri', yil: 2026, turler: ['kdv-tahakkuk'] })).turler['kdv-tahakkuk']
  assert.ok(istekler.every(islem => ['state', 'back', 'period', 'filter', 'submit', 'read', 'next'].includes(islem)))
  return normal(sonuc)
}

async function main() {
  for (const dizin of ['gib-yardimci', 'gib-yardimci-sunucu']) {
    const sonuc = await tara(dizin, [{ rows: [birinci, alakasiz], nextAvailable: true }, { rows: [ikinci], end: true }])
    assert.equal(sonuc.kapsamTam, true)
    assert.deepEqual(sonuc.fisler.map(kayit => kayit.voucherNo), ['014', '118'])
    assert.ok(sonuc.fisler.every(kayit => !('id' in kayit)))
    const aylik = normal(grupla(sonuc, 2026))
    assert.equal(aylik.aylar.length, 12)
    assert.equal(aylik.aylar[0][0].voucherNo, '014')
    assert.equal(aylik.aylar[1][0].voucherNo, '118')
    assert.equal(aylik.aylar[2].length, 0)
    assert.equal(aylik.kapsamTam, true)
    const belirsiz = await tara(dizin, [{ rows: [], nextAvailable: false }])
    assert.equal(belirsiz.kapsamTam, false)
    const takildi = await tara(dizin, [{ rows: [birinci], nextAvailable: true }, { rows: [birinci], nextAvailable: true }])
    assert.equal(takildi.kapsamTam, false)
    const tarih = new Date(2026, 11, 31)
    assert.equal(ayDurumu(aylik, 2026, 3, false, tarih), 'Eşleşme yok')
    assert.equal(ayDurumu(grupla(belirsiz, 2026), 2026, 3, false, tarih), 'Kontrol gerekli')
    assert.equal(ayDurumu(aylik, 2026, 3, true, tarih), 'Faaliyet dönemi dışında')
    const digerAdaylar = [fis('101', '15/03/2026', 'KDV MAHSUBU'), fis('102', '31/03/2026', 'KDV KAPATMA'), fis('103', '01/04/2026', 'Katma Deger Vergisi YANSITMA')]
    const darDonem = { start: '15/03/2026', end: '31/10/2026' }
    const dar = await tara(dizin, [{ rows: digerAdaylar, end: true }], darDonem)
    assert.deepEqual(dar.fisler.map(kayit => kayit.voucherNo), ['101', '102', '103'])
    const darAylik = grupla(dar, 2026)
    assert.equal(ayDurumu(darAylik, 2026, 1, false, tarih), 'Luca filtre dönemi dışında')
    assert.equal(ayDurumu(darAylik, 2026, 3, false, tarih), 'Aday fiş var')
    const bosDar = grupla(await tara(dizin, [{ rows: [], end: true }], darDonem), 2026)
    assert.equal(ayDurumu(bosDar, 2026, 3, false, tarih), 'Kontrol gerekli')
    assert.equal(ayDurumu(bosDar, 2026, 4, false, tarih), 'Eşleşme yok')
    assert.equal((await tara(dizin, [{ rows: [], end: true }], null)).kapsamTam, false)
    await assert.rejects(tara(dizin, [{ rows: [birinci], end: true }], darDonem), /aralığının dışında/)
  }
  assert.equal(grupla({ fisler: [fis('100', '31/02/2026', 'KDV Tahakkuk')], kapsamTam: true, sayi: 1 }, 2026).kapsamTam, false)
  assert.throws(() => grupla(undefined, 2026), /yanıtı alınamadı/)
  console.log('KDV tahakkuk: iki yardımcıda sayfalama, aday seçimi, ay eşlemesi ve belirsiz kapsam kontrolleri başarılı.')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
