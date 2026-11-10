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

    const apiKey = process.env.ODEAL_API_KEY
    const secretKey = process.env.ODEAL_SECRET_KEY

    if (!apiKey || !secretKey) return res.status(500).json({ error: 'Odeal API anahtarlari tanimli degil' })

    // Odeal Pay-by-Link API
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
    } else {
      return res.status(400).json({
        success: false,
        error: data.message || 'Odeal odeme linki olusturulamadi',
        detail: data
      })
    }
  } catch (err) {
    console.error('Odeal API hatasi:', err)
    return res.status(400).json({
      success: false,
      error: 'Odeme linki olusturulamadi',
      message: err.message
    })
  }
}
