// MUBiS - Odeme uclari (tek serverless fonksiyon)
//
// Vercel Hobby planinda deployment basina en fazla 12 Serverless Function
// tanimlanabilir. Onceden ayri dosyalar olan odeme uclari burada birlestirildi;
// disaridan gelen adresler DEGISMEDI (vercel.json rewrites ile yonlendirilir):
//
//   /api/paytr-iframe   -> /api/payment?provider=paytr-iframe
//   /api/paytr-payment  -> /api/payment?provider=paytr-payment
//   /api/odeal-payment  -> /api/payment?provider=odeal-payment
//
// Boylece istemci kodu ve PayTR/Odeal panellerindeki callback adresleri ayni kalir.
import crypto from 'crypto'

function saglayiciBul(req) {
  try {
    const u = new URL(req.url, 'https://x')
    const q = u.searchParams.get('provider')
    if (q) return q
    const p = u.pathname.replace(/^\/api\//, '').replace(/\.js$/, '')
    return p
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------- PayTR iframe
async function paytrIframe(req, res) {
  const { amount, clientId, customerName, customerEmail, customerPhone, customerAddress } = req.body

  if (!amount || amount <= 0) return res.status(400).json({ error: 'Gecersiz tutar' })

  const merchantId = process.env.PAYTR_MERCHANT_ID
  const merchantKey = process.env.PAYTR_MERCHANT_KEY
  const merchantSalt = process.env.PAYTR_MERCHANT_SALT

  if (!merchantId || !merchantKey || !merchantSalt) {
    return res.status(500).json({ error: 'PayTR API anahtarlari tanimli degil' })
  }

  const userIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || '127.0.0.1'

  const email = (customerEmail || 'musteri@mubiserp.com')
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşü]/g, c => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' }[c]))
  const paymentAmount = Math.round(Number(amount) * 100).toString() // Kurus cinsinden
  const merchantOid = `MUBIS_${parseInt(clientId) || 0}_${Date.now()}`
  const currency = 'TL'
  const testMode = '0'
  const noInstallment = '0'
  const maxInstallment = '12'

  const userBasket = Buffer.from(JSON.stringify([
    ['Muhasebe Ucreti Odemesi', Number(amount).toFixed(2), 1]
  ])).toString('base64')

  const hashStr = merchantId + userIp + merchantOid + email + paymentAmount + userBasket + noInstallment + maxInstallment + currency + testMode
  const paytrToken = crypto.createHmac('sha256', merchantKey).update(hashStr + merchantSalt).digest('base64')

  const formData = new URLSearchParams()
  formData.append('merchant_id', merchantId)
  formData.append('user_ip', userIp)
  formData.append('merchant_oid', merchantOid)
  formData.append('email', email)
  formData.append('payment_amount', paymentAmount)
  formData.append('paytr_token', paytrToken)
  formData.append('user_basket', userBasket)
  formData.append('debug_on', '1')
  formData.append('no_installment', noInstallment)
  formData.append('max_installment', maxInstallment)
  formData.append('user_name', (customerName || 'Musteri').slice(0, 60))
  formData.append('user_address', (customerAddress || 'Turkiye').slice(0, 400))
  formData.append('user_phone', (customerPhone || '05000000000').slice(0, 20))
  formData.append('merchant_ok_url', 'https://mubiserp.com/portal')
  formData.append('merchant_fail_url', 'https://mubiserp.com/portal')
  formData.append('timeout_limit', '30')
  formData.append('currency', currency)
  formData.append('test_mode', testMode)
  formData.append('lang', 'tr')
  formData.append('iframe_v2', '1')

  const response = await fetch('https://www.paytr.com/odeme/api/get-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString()
  })

  const data = await response.json()

  if (data.status === 'success' && data.token) {
    return res.status(200).json({
      success: true,
      token: data.token,
      merchantOid,
      iframeUrl: `https://www.paytr.com/odeme/guvenli/${data.token}`
    })
  }
  return res.status(400).json({
    success: false,
    error: data.reason || 'PayTR iframe token alinamadi'
  })
}

// --------------------------------------------------------------- PayTR link API
async function paytrPayment(req, res) {
  const { amount, customerEmail, description, clientId } = req.body

  if (!amount || amount <= 0) return res.status(400).json({ error: 'Gecersiz tutar' })

  const merchantId = process.env.PAYTR_MERCHANT_ID
  const merchantKey = process.env.PAYTR_MERCHANT_KEY
  const merchantSalt = process.env.PAYTR_MERCHANT_SALT

  if (!merchantId || !merchantKey || !merchantSalt) {
    return res.status(500).json({ error: 'PayTR API anahtarlari tanimli degil' })
  }

  const name = description || 'Muhasebe Ucreti Odemesi'
  const price = Math.round(Number(amount) * 100).toString()
  const currency = 'TL'
  const maxInstallment = '12'
  const linkType = 'product'
  const lang = 'tr'
  const minCount = '1'
  const clientIdNum = parseInt(clientId) || 0
  const callbackId = `MUBIS${String(clientIdNum).padStart(8, '0')}${Date.now()}`
  const callbackLink = 'https://mubiserp.com/api/payment-callback'

  const required = name + price + currency + maxInstallment + linkType + lang + minCount
  const paytrToken = crypto.createHmac('sha256', merchantKey).update(required + merchantSalt).digest('base64')

  const formData = new URLSearchParams()
  formData.append('merchant_id', merchantId)
  formData.append('name', name)
  formData.append('price', price)
  formData.append('currency', currency)
  formData.append('max_installment', maxInstallment)
  formData.append('link_type', linkType)
  formData.append('lang', lang)
  formData.append('min_count', minCount)
  formData.append('max_count', '1')
  formData.append('callback_link', callbackLink)
  formData.append('callback_id', callbackId)
  formData.append('debug_on', '1')
  formData.append('paytr_token', paytrToken)
  if (customerEmail) formData.append('email', customerEmail)

  const response = await fetch('https://www.paytr.com/odeme/api/link/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString()
  })

  const data = await response.json()

  if (data.status === 'success' && data.link) {
    return res.status(200).json({
      success: true,
      paymentUrl: data.link,
      reference: data.id || ''
    })
  }
  return res.status(400).json({
    success: false,
    error: data.reason || data.err_msg || 'PayTR odeme linki olusturulamadi',
    detail: data
  })
}

// -------------------------------------------------------------- Odeal pay-by-link
async function odealPayment(req, res) {
  const { amount, customerName, customerEmail, description, clientId } = req.body

  if (!amount || amount <= 0) return res.status(400).json({ error: 'Gecersiz tutar' })

  const apiKey = process.env.ODEAL_API_KEY
  const secretKey = process.env.ODEAL_SECRET_KEY

  if (!apiKey || !secretKey) return res.status(500).json({ error: 'Odeal API anahtarlari tanimli degil' })

  const payload = {
    productId: '716861',
    amount: Number(amount).toFixed(2),
    currency: 'TRY',
    locale: 'tr',
    customerName: customerName || 'Musteri',
    customerEmail: customerEmail || '',
    description: description || 'Muhasebe Ucreti',
    callbackUrl: `${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://mubiserp.com'}/api/payment-callback?source=odeal&client_id=${clientId || ''}`,
  }

  const response = await fetch('https://api.odeal.com/vpos/pay-by-link', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'X-Secret-Key': secretKey
    },
    body: JSON.stringify(payload)
  })

  const data = await response.json()

  if (data.checkout3DUrl) {
    return res.status(200).json({
      success: true,
      paymentUrl: data.checkout3DUrl,
      reference: data.referenceId || ''
    })
  }
  return res.status(400).json({
    success: false,
    error: data.message || 'Odeal odeme linki olusturulamadi',
    detail: data
  })
}

const SAGLAYICILAR = {
  'paytr-iframe': paytrIframe,
  'paytr-payment': paytrPayment,
  'odeal-payment': odealPayment
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const saglayici = saglayiciBul(req)
  const fn = SAGLAYICILAR[saglayici]
  if (!fn) {
    return res.status(400).json({
      error: 'Gecersiz odeme saglayicisi',
      beklenen: Object.keys(SAGLAYICILAR)
    })
  }

  try {
    return await fn(req, res)
  } catch (err) {
    console.error(`[odeme:${saglayici}] hata:`, err)
    return res.status(500).json({ error: 'Sunucu hatasi', message: err?.message || String(err) })
  }
}
