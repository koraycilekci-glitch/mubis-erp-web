const assert = require('node:assert/strict')

async function main() {
  const { onRequestPost } = await import('../functions/api/payments-mark-paid.js')
  const originalFetch = global.fetch
  try {
    for (const scenario of [
      { role: 'admin', profileOffice: 1, clientOffice: 1, paymentOffice: null, status: 200 },
      { role: 'personel', profileOffice: 2, clientOffice: 1, paymentOffice: null, status: 403 },
      { role: 'admin', profileOffice: 1, clientOffice: 1, paymentOffice: 2, status: 403 },
      { role: 'client', profileOffice: 1, clientOffice: 1, paymentOffice: 1, status: 403 },
      { role: 'super_admin', profileOffice: null, clientOffice: 1, paymentOffice: 1, status: 200 },
    ]) {
      let updates = 0
      global.fetch = async (input, options = {}) => {
        const url = new URL(typeof input === 'string' ? input : input.url)
        const headers = new Headers(options.headers)
        const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
        if (url.pathname.endsWith('/auth/v1/user')) return response({ id: 'test-user' })
        if (url.pathname.endsWith('/rest/v1/profiles')) return response({ role: scenario.role, office_id: scenario.profileOffice })
        if (url.pathname.endsWith('/rest/v1/clients')) return response({ office_id: scenario.clientOffice })
        if (url.pathname.endsWith('/rest/v1/payments') && options.method === 'PATCH') {
          updates++
          assert.equal(headers.get('authorization'), 'Bearer test-user-token')
          assert.equal(url.searchParams.get('client_id'), 'eq.10')
          return response({ id: 42, client_id: 10, tutar: 100 })
        }
        if (url.pathname.endsWith('/rest/v1/payments')) return response({ client_id: 10, office_id: scenario.paymentOffice })
        if (url.pathname.endsWith('/rest/v1/notifications')) return response(null, 201)
        throw new Error(`Beklenmeyen istek: ${url.pathname}`)
      }
      const request = new Request('https://example.test/api/payments-mark-paid', {
        method: 'POST', headers: { Authorization: 'Bearer test-user-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: 42, donem: '2026-11' })
      })
      const result = await onRequestPost({ request, env: { SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key' } })
      assert.equal(result.status, scenario.status, JSON.stringify(scenario))
      assert.equal(updates, scenario.status === 200 ? 1 : 0, JSON.stringify(scenario))
    }
    console.log('Ödeme API ofis ve kullanıcı yetkisi kontrolleri başarılı.')
  } finally {
    global.fetch = originalFetch
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
