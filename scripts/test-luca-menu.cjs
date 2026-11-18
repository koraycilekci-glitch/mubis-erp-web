const fs = require('node:fs')
const vm = require('node:vm')
const assert = require('node:assert/strict')

const source = fs.readFileSync('gib-yardimci/index.js', 'utf8')
const start = source.indexOf('var ustMenuTaniSayac = 0;')
const end = source.indexOf('var earsivKontrol =', start)
assert.ok(start >= 0 && end > start)
const menuSec = vm.runInNewContext(source.slice(start, end) + '\nlucaMenuSec', {
  console: { log() {} },
  setTimeout: callback => callback(),
  Promise,
})

async function menuTest(target) {
  let level = 0
  let clicked = false
  let marked = null
  let pointer = 0
  const labels = ['Muhasebe', 'Akıllı Entegrasyon Noktası', 'GİB e-Belge', target]
  const elements = labels.map((textContent, index) => ({
    textContent,
    getClientRects: () => [1],
    getBoundingClientRect: () => ({ left: index * 100, top: 0, width: 10, height: 10 }),
    setAttribute: () => { marked = index },
    removeAttribute: () => { marked = null },
    dispatchEvent: () => {},
    click: () => { if (index === 3) clicked = true },
  }))
  const document = {
    querySelectorAll: selector => selector === 'select' ? [] : elements,
    querySelector: () => marked === null ? null : elements[marked],
  }
  const frame = {
    url: () => 'https://luca.example.test/menu',
    evaluate: async (fn, ...args) => vm.runInNewContext('(' + fn.toString() + ')(...' + JSON.stringify(args) + ')', {
      document,
      window: { frameElement: null },
      getComputedStyle: element => ({ visibility: elements.indexOf(element) <= level ? 'visible' : 'hidden' }),
      MouseEvent: function MouseEvent() {},
    }),
    $: async () => null,
  }
  const page = {
    frames: () => [frame],
    bringToFront: async () => {},
    mouse: {
      move: async x => { pointer = Math.floor(x / 100); if (pointer === 0) level = 1; if (pointer === 2) level = 3 },
      down: async () => {},
      up: async () => { if (pointer === 1) level = 2; if (pointer === 3) clicked = true },
    },
  }
  assert.equal(await menuSec(page, 'test', target), true)
  assert.equal(clicked, true, 'hidden invoice item must not be treated as clicked')
  assert.equal(level, 3, 'GİB e-Belge submenu must be opened')
}

;(async () => {
  await menuTest('e-Fatura Satış Faturaları')
  await menuTest('e-Arşiv Alış Faturaları')
  console.log('PASS: hidden Luca menu entries are skipped and GİB submenu opens before invoice selection')
})().catch(error => { console.error(error); process.exitCode = 1 })
