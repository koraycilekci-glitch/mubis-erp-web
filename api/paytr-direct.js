import crypto from 'crypto'

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const {
      amount, clientId, customerName, customerEmail,
      cardOwner, cardNumber, expiryMonth, expiryYear, cvv,
      installmentCount, testMode
    } = req.body

    if (!amount || amount <= 0) return res.status(400).json({ error: 'Gecersiz tutar' })
    if (!cardNumber || !expiryMonth || !expiryYear || !cvv) {
      return res.status(400).json({ error: 'Kart bilgileri eksik' })
    }

    const merchantId = process.env.PAYTR_MERCHANT_ID
    const merchantKey = process.env.PAYTR_MERCHANT_KEY
    const merchantSalt = process.env.PAYTR_MERCHANT_SALT

    if (!merchantId || !merchantKey || !merchantSalt) {
      return res.status(500).json({ error: 'PayTR API anahtarlari tanimli degil' })
    }

    // Parametreler
    const userIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.headers['x-real-ip'] || '127.0.0.1'
    const merchantOid = `MUBIS_${clientId || '0'}_${Date.now()}`
    const email = customerEmail || 'musteri@mubiserp.com'
    const paymentAmount = Math.round(Number(amount) * 100).toString() // Kurus cinsinden
    const paymentType = 'card'
    const installment = String(installmentCount || '0')
    const currency = 'TL'
    const isTestMode = testMode ? '1' : '0'
    const non3d = '0' // 3D Secure aktif
    const merchantOkUrl = 'https://mubiserp.com/odeme-basarili'
    const merchantFailUrl = 'https://mubiserp.com/odeme-basarisiz'

    // Token hesaplama - PayTR Direkt API dokumantasyonuna gore:
    // merchant_id + user_ip + merchant_oid + email + payment_amount + payment_type + installment_count + currency + test_mode + non_3d + merchant_salt
    const hashStr = merchantId + userIp + merchantOid + email + paymentAmount + paymentType + installment + currency + isTestMode + non3d + merchantSalt
    const paytrToken = crypto.createHmac('sha256', merchantKey).update(hashStr).digest('base64')

    // Sepet bilgisi (PayTR zorunlu alan)
    const userBasket = JSON.stringify([
      ['Muhasebe Ucreti', amount, 1]
    ])
    const userBasketEncoded = Buffer.from(userBasket).toString('base64')

    // Form data olustur
    const formData = new URLSearchParams()
    formData.append('merchant_id', merchantId)
    formData.append('user_ip', userIp)
    formData.append('merchant_oid', merchantOid)
    formData.append('email', email)
    formData.append('payment_type', paymentType)
    formData.append('payment_amount', paymentAmount)
    formData.append('currency', currency)
    formData.append('test_mode', isTestMode)
    formData.append('non_3d', non3d)
    formData.append('merchant_ok_url', merchantOkUrl)
    formData.append('merchant_fail_url', merchantFailUrl)
    formData.append('user_name', customerName || 'Musteri')
    formData.append('user_address', 'Turkiye')
    formData.append('user_phone', '05000000000')
    formData.append('user_basket', userBasketEncoded)
    formData.append('debug_on', '1')
    formData.append('client_lang', 'tr')
    formData.append('installment_count', installment)
    formData.append('cc_owner', cardOwner || 'KART SAHIBI')
    formData.append('card_number', cardNumber.replace(/\s/g, ''))
    formData.append('expiry_month', expiryMonth)
    formData.append('expiry_year', expiryYear)
    formData.append('cvv', cvv)
    formData.append('paytr_token', paytrToken)
    formData.append('sync_mode', '0')
    formData.append('no_installment', '0')
    formData.append('max_installment', '12')
    formData.append('lang', 'tr')

    // PayTR Direkt API cagri
    const response = await fetch('https://www.paytr.com/odeme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString()
    })

    const data = await response.json()

    if (data.status === 'success') {
      // 3D Secure icin HTML redirect content donebilir
      return res.status(200).json({
        success: true,
        status: data.status,
        redirect3d: data.redirect_3d_html || null,
        merchantOid: merchantOid
      })
    } else if (data.status === 'wait_callback') {
      return res.status(200).json({
        success: true,
        status: 'wait_callback',
        merchantOid: merchantOid,
        message: 'Odeme isleniyor, sonuc bildirilecek'
      })
    } else {
      return res.status(400).json({
        success: false,
        error: data.err_msg || data.reason || 'Odeme basarisiz',
        detail: data
      })
    }
  } catch (err) {
    console.error('PayTR Direkt API hatasi:', err)
    return res.status(500).json({ error: 'Sunucu hatasi', message: err.message })
  }
}
