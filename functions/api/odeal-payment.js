// MUBIS - Odeal Pay-by-Link (Cloudflare Pages Function)
// POST /api/odeal-payment  Body: { amount, customerName?, customerEmail?, description?, clientId?, installment? }
//
// Resmi dokuman akisi (docs.odeal.com/sanalpos):
//  1) Token: POST {tokenBaseUrl}/token  body: clientId, clientSecret, grantType, scope
//  2) Link:  POST {gatewayBaseUrl}/pay-by-link  Authorization: Bearer {token}
//     body: amount, currency, installment, externalId, returnUrl, buyer...
//     Yanit: result=success, checkout3DUrl (odeme sayfasi), id
//
// Ortam: ODEAL_ENV=prod => canli, aksi halde test (sandbox) adresleri.
// Secret'lar: ODEAL_CLIENT_ID, ODEAL_CLIENT_SECRET (+ops. ODEAL_ENV, ODEAL_SCOPE, ODEAL_GRANT_TYPE)
import { json } from './_lib.js'

const ORTAMLAR = {
  prod: {
    token: 'https://auth.odeal.com/api/v1/token',
    gateway: 'https://api.odeal.com/vpos/'
  },
  test: {
    token: 'https://auth-sandbox.odeal.com/api/v1/token',
    gateway: 'https://api-stg.odeal.com/vpos/'
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const { amount, customerName, customerEmail, clientId, installment } = await request.json().catch(() => ({}))

    if (!amount || amount <= 0) return json({ error: 'Gecersiz tutar' }, 400)

    const clientIdKey = env?.ODEAL_CLIENT_ID
    const clientSecret = env?.ODEAL_CLIENT_SECRET
    if (!clientIdKey || !clientSecret) {
      return json({ error: 'Odeal anahtarlari tanimli degil (ODEAL_CLIENT_ID / ODEAL_CLIENT_SECRET)' }, 500)
    }

    const ortam = ORTAMLAR[env?.ODEAL_ENV === 'prod' ? 'prod' : 'test']

    // --- ADIM 1: Access token ---
    const tokenRes = await fetch(ortam.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: clientIdKey,
        clientSecret,
        grantType: env?.ODEAL_GRANT_TYPE || 'client_credentials',
        scope: env?.ODEAL_SCOPE || 'vpos'
      })
    })
    const tokenData = await tokenRes.json().catch(() => ({}))
    const accessToken = tokenData.accessToken || tokenData.access_token || tokenData.token
    if (!tokenRes.ok || !accessToken) {
      console.error('Odeal token hatasi:', tokenRes.status, JSON.stringify(tokenData).slice(0, 300))
      return json({ error: 'Odeal token alinamadi', detail: tokenData }, 502)
    }

    // --- ADIM 2: Pay-by-Link ---
    const externalId = `MUBIS${String(parseInt(clientId) || 0).padStart(8, '0')}${Date.now()}`
    const linkBody = {
      amount: Number(Number(amount).toFixed(2)),
      currency: 'TRY',
      installment: parseInt(installment) || 0,
      externalId,
      returnUrl: `https://mubiserp.com/api/payment-callback?source=odeal&client_id=${clientId || ''}`,
      buyerName: customerName || 'Musteri',
      buyerMail: customerEmail || undefined
    }

    const linkRes = await fetch(ortam.gateway + 'pay-by-link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(linkBody)
    })
    const data = await linkRes.json().catch(() => ({}))

    if (data.result === 'success' && data.checkout3DUrl) {
      return json({
        success: true,
        paymentUrl: data.checkout3DUrl,
        reference: data.id || externalId,
        externalId
      })
    }
    console.error('Odeal link hatasi:', linkRes.status, JSON.stringify(data).slice(0, 300))
    return json({
      success: false,
      error: data.message || 'Odeal odeme linki olusturulamadi',
      detail: data
    }, 400)
  } catch (err) {
    console.error('Odeal API hatasi:', err)
    return json({ success: false, error: 'Odeme linki olusturulamadi', message: err.message }, 400)
  }
}
