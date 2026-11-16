const fs = require('node:fs')
const vm = require('node:vm')
const assert = require('node:assert/strict')

const page = fs.readFileSync('src/pages/FaturaSorgulama.jsx', 'utf8')
const card = fs.readFileSync('src/components/FaturaListesiKarti.jsx', 'utf8')
const selection = page.match(/  const musteriSec = \(id\) => \{([\s\S]*?)\n  \}/)
assert.ok(selection)
assert.ok(page.includes('onChange={(e) => musteriSec(e.target.value)}'))
const state = { action: { tur: 'klasor', sira: 1 }, menu: true, clientId: '1' }
const select = vm.runInNewContext('(id) => {' + selection[1] + '}', {
  setDisEylem: value => { state.action = value },
  setDokumAcik: value => { state.menu = value },
  setSeciliId: value => { state.clientId = value },
})
select('2')
assert.deepEqual(state, { action: null, menu: false, clientId: '2' })
select('')
assert.equal(state.action, null)
assert.equal(state.clientId, '')

const effect = card.match(/  const disEylemSiraRef = useRef\(([^\n]+)\)\n  useEffect\(\(\) => \{([\s\S]*?)\n  \}, \[disEylem\?\.sira\]\)/)
assert.ok(effect)
const kinds = { dosya: 'dosyaInputRef', klasor: 'klasorInputRef', 'dokum-gumruk': 'gumrukInputRef', 'dokum-gider': 'giderInputRef', 'dokum-zraporu': 'zRaporuInputRef', excel: 'excelAktar' }
for (const kind of Object.keys(kinds)) {
  let clicks = 0
  const context = vm.createContext({ disEylem: { tur: kind, sira: 1 }, useRef: current => ({ current }), excelAktar: () => { clicks++ } })
  for (const name of Object.values(kinds).filter(name => name !== 'excelAktar')) context[name] = { current: { click: () => { clicks++ } } }
  vm.runInContext('const disEylemSiraRef = useRef(' + effect[1] + '); function run() {' + effect[2] + '\n}', context)
  vm.runInContext('run()', context)
  assert.equal(clicks, 0, kind + ': stale action must not run on mount')
  context.disEylem = { tur: kind, sira: 2 }
  vm.runInContext('run(); run()', context)
  assert.equal(clicks, 1, kind + ': a fresh click must run exactly once')
  context.disEylem = null
  vm.runInContext('run()', context)
  assert.equal(clicks, 1, kind + ': selection reset must not run an action')
  context.disEylem = { tur: kind, sira: 3 }
  vm.runInContext('run()', context)
  assert.equal(clicks, 2, kind + ': repeated manual clicks must still work')
}
console.log('PASS: customer selection clears stale actions; all six manual actions run only after a fresh click.')
