const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')

async function testHelper(file) {
  const source = fs.readFileSync(file, 'utf8')
  const start = source.indexOf('const faturaPdfIslemleri = new Map()')
  const end = source.indexOf('async function faturaPdfDosyasiOlustur(', start)
  assert.ok(start >= 0 && end > start)
  const active = new Set()
  const calls = []
  let parallel = 0
  let maxParallel = 0
  const context = vm.createContext({
    path,
    indirmeKlasoru: path.resolve('indirilenler'),
    faturaPdfDosyasiOlustur: async (ad, dosyaCtx, klasor) => {
      const key = path.resolve(klasor, ad.replace(/\.(xml|html?)$/i, '.pdf'))
      assert.equal(active.has(key), false, 'Aynı PDF için dönüşümler eşzamanlı çalışmamalı')
      active.add(key)
      maxParallel = Math.max(maxParallel, ++parallel)
      calls.push(ad)
      await new Promise(resolve => setTimeout(resolve, 10))
      parallel--
      active.delete(key)
      if (dosyaCtx?.fail) throw new Error('dönüşüm hatası')
      return ad
    }
  })
  vm.runInContext(source.slice(start, end), context)
  const convert = context.faturaPdfDosyasi
  const results = await Promise.all([
    convert('bir.xml', {}),
    convert('bir.html', {}),
    convert('diger.xml', {})
  ])
  assert.deepEqual(results, ['bir.xml', 'bir.html', 'diger.xml'])
  assert.ok(calls.indexOf('bir.html') > calls.indexOf('bir.xml'))
  assert.ok(maxParallel >= 2, 'Farklı PDF dönüşümleri paralel çalışabilmeli')
  const first = convert('hata.xml', { fail: true })
  const next = convert('hata.html', {})
  await assert.rejects(first, /dönüşüm hatası/)
  assert.equal(await next, 'hata.html')
  assert.equal(vm.runInContext('faturaPdfIslemleri.size', context), 0)
}

Promise.all(['gib-yardimci/index.js', 'gib-yardimci-sunucu/index.js'].map(testHelper))
  .then(() => console.log('PDF dönüşüm eşzamanlılık testleri başarılı.'))
  .catch(error => { console.error(error); process.exitCode = 1 })
