const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

async function main() {
  const source = fs.readFileSync('src/pages/Tebligatlar.jsx', 'utf8').replace(/\r\n/g, '\n')
  const start = source.indexOf('export default function Tebligatlar() {')
  const end = source.indexOf('\n  return (\n    <div className=', start)
  assert.ok(start >= 0 && end > start)
  const component = source.slice(start, end).replace('export default function Tebligatlar()', 'function Tebligatlar()')
  const sent = []
  const saved = []
  const clients = [{ id: 1, name: 'Test', phone: '555' }, { id: 2, name: 'İkinci', phone: '556' }]
  const context = {
    useState: initial => [initial, () => {}],
    useEffect: () => {},
    useMemo: callback => callback(),
    useCallback: callback => callback,
    useClients: () => ({ clients }),
    useSearchParams: () => [new URLSearchParams('musteri=1'), () => {}],
    tarihCoz: () => null,
    tebligatPdfGetir: async () => ({ ok: true }),
    sendDocumentViaWhatsAppChannel: async payload => { sent.push(payload); return { ok: true } },
    sendEmail: async () => { throw new Error('Beklenmeyen e-posta') },
    gonderimKaydet: async (...args) => { saved.push(args) },
    fetch: async () => { throw new Error('Beklenmeyen plan isteği') },
    URLSearchParams,
    Set,
    Map,
    Date
  }
  const rendered = vm.runInNewContext(`${component}\n  return { belgeAc, gonderCekirdek }\n}\nTebligatlar()`, context)
  assert.equal(typeof rendered.belgeAc, 'function')
  assert.equal(typeof rendered.gonderCekirdek, 'function')
  const result = await rendered.gonderCekirdek({ client_id: 1, belge_no: 'TEST-001', file_url: 'test-url' }, 'whatsapp')
  assert.equal(result.ok, true)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].clientId, 1)
  assert.deepEqual(saved[0], [1, 'TEST-001', 'whatsapp'])
  console.log('E-Tebligat ilk render ve gönderim kaydı kontrolleri başarılı.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
