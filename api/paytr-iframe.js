import crypto from 'crypto'

/**
 * MUBIS - PayTR Iframe odeme (musteri bilgileri otomatik)
 *
 * Musteri adi/telefon/adres/e-posta bu istekte sunucu tarafindan PayTR'a
 * gecirilir; musteri odeme ekraninda SADECE kart bilgilerini girer
 * (PayTR link sayfasindaki adres formu kaldirilmis olur).
 *
 * POST /api/paytr-iframe
 * Body: { amount, clientId, customerName, customerEmail, customerPhone, customerAddress, userIp? }
 * Yanit: { success, token, iframeUrl }
 */
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
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

    // Token: merchant_id + user_ip + merchant_oid + email + payment_amount +
    //        user_basket + no_installment + max_installment + currency + test_mode
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
    // Musteri bilgileri — odeme ekraninda tekrar sorulmaz
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
    } else {
      return res.status(400).json({
        success: false,
        error: data.reason || 'PayTR iframe token alinamadi'
      })
    }
  } catch (err) {
    console.error('PayTR iframe API hatasi:', err)
    return res.status(500).json({ error: 'Sunucu hatasi', message: err.message })
  }
}
