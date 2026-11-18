const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

const source = fs.readFileSync('gib-yardimci/index.js', 'utf8')
const start = source.indexOf('  "admin-ata": async (p) => {')
const end = source.indexOf('  "asistan-durum": async () => {', start)
assert.ok(start >= 0 && end > start)

async function main() {
  for (const acik of [true, false]) {
    const commands = []
    const context = vm.createContext({
      process: { execPath: 'C:\\MUBIS\\yardimci.exe' },
      console: { warn() {} },
      execSync(command) {
        commands.push(command)
        if (command.startsWith('reg ')) throw new Error('reg erişimi reddedildi')
      },
    })
    const handlers = vm.runInContext(`({\n${source.slice(start, end)}\n})`, context)
    const result = await handlers['admin-ata']({ acik })
    assert.equal(result.ok, true)
    assert.equal(result.ata, acik)
    assert.equal(commands.length, 2)
    assert.match(commands[1], acik ? /Set-ItemProperty/ : /Remove-ItemProperty/)
  }
  const settings = fs.readFileSync('src/pages/Settings.jsx', 'utf8')
  assert.match(settings, /yardimciIsYerel\('admin-durum'/)
  assert.match(settings, /yardimciIsYerel\('admin-ata'/)
  assert.doesNotMatch(settings, /gibYardimciIs\('admin-(?:ata|durum)'/)
  console.log('PASS: admin işlemleri yerel yardımcıya yönlendirilir; kayıt defteri hatasında PowerShell yedeği çalışır.')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
