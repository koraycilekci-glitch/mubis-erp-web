import crypto from 'crypto'

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { amount, customerName, customerEmail, description, clientId } = req.body

    if (!amount || amount <= 0) return res.status(400).json({ error: 'Gecersiz tutar' })

    const merchantId = process.env.PAYTR_MERCHANT_ID
    const merchantKey = process.env.PAYTR_MERCHANT_KEY
    const merchantSalt = process.env.PAYTR_MERCHANT_SALT

    if (!merchantId || !merchantKey || !merchantSalt) {
      return res.status(500).json({ error: 'PayTR API anahtarlari tanimli degil' })
    }

    // PayTR Link API - Dokumantasyona uygun parametreler
    const name = description || 'Muhasebe Ucreti Odemesi'
    const price = Math.round(Number(amount) * 100).toString() // Kurus cinsinden (14.45 TL = 1445)
    const currency = 'TL'
    const maxInstallment = '12'
    const linkType = 'product'
    const lang = 'tr'
    const minCount = '1'
    const callbackId = `MUBIS_${clientId || '0'}_${Date.now()}`
    const callbackLink = 'https://mubiserp.com/api/payment-callback'

    // Token hesaplama - PayTR dokumantasyonuna gore:
    // required = name + price + currency + max_installment + link_type + lang + min_count (product icin)
    // paytr_token = base64(hmac_sha256(required + merchant_salt, merchant_key))
    const required = name + price + currency + maxInstallment + linkType + lang + minCount
    const paytrToken = crypto.createHmac('sha256', merchantKey).update(required + merchantSalt).digest('base64')

    // POST parametreleri
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

    // Opsiyonel: musteri email'i varsa ekle
    if (customerEmail) {
      formData.append('email', customerEmail)
    }

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
    } else {
      return res.status(400).json({
        success: false,
        error: data.reason || data.err_msg || 'PayTR odeme linki olusturulamadi',
        detail: data
      })
    }
  } catch (err) {
    console.error('PayTR API hatasi:', err)
    return res.status(500).json({ error: 'Sunucu hatasi', message: err.message })
  }
}
