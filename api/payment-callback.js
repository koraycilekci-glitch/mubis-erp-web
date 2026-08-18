import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const source = req.query.source || ''
    const body = req.body || {}

    console.log(`Payment callback received`, { source, body })

    // Supabase service key ile baglanti
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://gxuqrxmpgoeyykoolmwv.supabase.co'
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

    if (!supabaseServiceKey) {
      console.error('Supabase service key eksik. Vercel ayarlarinda SUPABASE_SERVICE_ROLE_KEY tanimlanmali.')
    }

    // ============ PAYTR CALLBACK ============
    // PayTR callback_link kullandiginda source parametresi olmaz,
    // PayTR dogrudan bu URL'e POST yapar. callback_id ile taniyoruz.
    if (body.callback_id && body.merchant_oid) {
      // PayTR callback
      const merchantKey = process.env.PAYTR_MERCHANT_KEY
      const merchantSalt = process.env.PAYTR_MERCHANT_SALT

      if (!merchantKey || !merchantSalt) {
        console.error('PayTR anahtarlari eksik')
        return res.status(200).send('OK')
      }

      // Hash dogrulama - PayTR dokumantasyonuna gore:
      // hash = base64(hmac_sha256(callback_id + merchant_oid + merchant_salt + status + total_amount, merchant_key))
      const hashStr = body.callback_id + body.merchant_oid + merchantSalt + body.status + body.total_amount
      const expectedHash = crypto.createHmac('sha256', merchantKey).update(hashStr).digest('base64')

      if (expectedHash !== body.hash) {
        console.error('PayTR hash dogrulama basarisiz!')
        return res.status(200).send('OK')
      }

      if (body.status === 'success' && supabaseUrl && supabaseServiceKey) {
        // callback_id formatindan client_id parse et: MUBIS_{clientId}_{timestamp}
        const parts = (body.callback_id || '').split('_')
        const clientId = parts.length >= 2 ? parseInt(parts[1]) : null
        const tutar = (Number(body.total_amount) || 0) / 100 // Kurustan TL'ye

        if (clientId && tutar > 0) {
          const supabase = createClient(supabaseUrl, supabaseServiceKey)

          // Daha once ayni merchant_oid icin kayit yapilmis mi kontrol et
          const { data: existing } = await supabase
            .from('payments')
            .select('id')
            .eq('gateway_ref', body.merchant_oid)
            .single()

          if (!existing) {
            const { error } = await supabase.from('payments').insert({
              client_id: clientId,
              tutar: tutar,
              odeme_tipi: 'kredi_karti',
              odeme_kanali: 'paytr',
              aciklama: `PayTR online odeme`,
              donem: new Date().toISOString().slice(0, 7),
              gateway_ref: body.merchant_oid,
              odeme_tarihi: new Date().toISOString().split('T')[0]
            })

            if (error) console.error('PayTR odeme kaydi hatasi:', error)
            else console.log(`PayTR odeme kaydedildi: client=${clientId}, tutar=${tutar} TL`)
          } else {
            console.log('PayTR tekrarlayan bildirim, zaten kayitli:', body.merchant_oid)
          }
        }
      }

      // PayTR plain text OK yaniti bekliyor - baska bir sey donmeyin
      res.setHeader('Content-Type', 'text/plain')
      return res.status(200).send('OK')
    }

    // ============ ODEAL CALLBACK ============
    if (source === 'odeal') {
      const clientId = req.query.client_id
      const isSuccess = body.status === 'success' || body.resultCode === '00'
      const tutar = Number(body.amount) || 0
      const gatewayRef = body.referenceId || body.orderId || ''

      if (isSuccess && clientId && tutar > 0 && supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        const { error } = await supabase.from('payments').insert({
          client_id: parseInt(clientId),
          tutar: tutar,
          odeme_tipi: 'kredi_karti',
          odeme_kanali: 'odeal',
          aciklama: `Odeal online odeme`,
          donem: new Date().toISOString().slice(0, 7),
          gateway_ref: gatewayRef,
          odeme_tarihi: new Date().toISOString().split('T')[0]
        })

        if (error) console.error('Odeal odeme kaydi hatasi:', error)
        else console.log(`Odeal odeme kaydedildi: client=${clientId}, tutar=${tutar} TL`)
      }

      // Kullaniciya sonuc sayfasi goster
      if (isSuccess) {
        return res.status(200).send(`
          <html><body style="background:#0a1929;color:white;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center">
            <div>
              <h1 style="color:#4ade80;font-size:48px">&#10004;</h1>
              <h2>Odemeniz Basariyla Alindi!</h2>
              <p style="color:#94a3b8">Tutar: ${tutar.toLocaleString('tr-TR')} TL</p>
              <a href="https://mubiserp.com/portal" style="color:#facc15;margin-top:20px;display:inline-block">Portale Don</a>
            </div>
          </body></html>
        `)
      } else {
        return res.status(200).send(`
          <html><body style="background:#0a1929;color:white;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center">
            <div>
              <h1 style="color:#f87171;font-size:48px">&#10008;</h1>
              <h2>Odeme Basarisiz</h2>
              <p style="color:#94a3b8">Lutfen tekrar deneyin.</p>
              <a href="https://mubiserp.com/portal" style="color:#facc15;margin-top:20px;display:inline-block">Portale Don</a>
            </div>
          </body></html>
        `)
      }
    }

    // Bilinmeyen kaynak
    return res.status(200).send('OK')
  } catch (err) {
    console.error('Callback hatasi:', err)
    // PayTR her durumda OK bekliyor
    return res.status(200).send('OK')
  }
}
