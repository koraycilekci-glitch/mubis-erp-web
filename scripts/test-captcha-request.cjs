const fs = require('node:fs')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')

async function verifyRequest(file, mode) {
  const source = fs.readFileSync(file, 'utf8')
  const start = source.indexOf('async function coz2captcha(')
  const end = source.indexOf('\n}', start) + 2
  assert.ok(start >= 0 && end > start, `${file}: solver not found`)
  let submittedForm
  const solution = mode === 'sayi' ? '12345' : 'aB3z'
  const https = {
    request(options, callback) {
      assert.equal(options.path, '/in.php')
      const request = new EventEmitter()
      request.setTimeout = () => {}
      request.write = body => {
        submittedForm = new URLSearchParams(body)
        assert.equal(options.headers['Content-Length'], Buffer.byteLength(body))
      }
      request.end = () => {
        const response = new EventEmitter()
        callback(response)
        queueMicrotask(() => {
          response.emit('data', JSON.stringify({ status: 1, request: 'mock-task' }))
          response.emit('end')
        })
      }
      return request
    },
    get(url, options, callback) {
      assert.equal(new URL(url).searchParams.get('id'), 'mock-task')
      const request = new EventEmitter()
      request.setTimeout = () => {}
      queueMicrotask(() => {
        const response = new EventEmitter()
        callback(response)
        request.emit('response', response)
        response.emit('data', JSON.stringify({ status: 1, request: solution }))
        response.emit('end')
      })
      return request
    },
  }
  const solve = vm.runInNewContext(source.slice(start, end) + ';coz2captcha', {
    CAPTCHA_API_KEY: 'test-key',
    CAPTCHA_API_URL: 'https://example.test',
    https,
    URL,
    URLSearchParams,
    Buffer,
    console: { log() {} },
    setTimeout(callback, delay) {
      if (delay === 2500) queueMicrotask(callback)
      return 1
    },
    clearTimeout() {},
  })
  assert.equal(await solve('data:image/png;base64,AAAA', 10000, mode), solution)
  assert.equal(submittedForm.get('body'), 'AAAA')
  assert.equal(submittedForm.get('method'), 'base64')
  assert.equal(submittedForm.get('caseSensitive'), null)
  if (mode === 'alfanumerik') {
    assert.equal(submittedForm.get('numeric'), '0')
    assert.equal(submittedForm.get('regsense'), '1')
    assert.equal(submittedForm.get('min_len'), null)
    assert.equal(submittedForm.get('max_len'), null)
  } else {
    assert.equal(submittedForm.get('numeric'), '1')
    assert.equal(submittedForm.get('min_len'), '5')
    assert.equal(submittedForm.get('max_len'), '5')
    assert.equal(submittedForm.get('regsense'), null)
  }
}

;(async () => {
  for (const file of ['gib-yardimci/index.js', 'gib-yardimci-sunucu/index.js']) {
    for (const mode of ['sayi', 'alfanumerik']) await verifyRequest(file, mode)
  }
  console.log('PASS: both helpers preserve case and allow mixed characters; five-digit numeric mode is unchanged')
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
