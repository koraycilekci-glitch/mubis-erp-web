import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { email, password, name, clientId: rawClientId, officeId } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email ve sifre gerekli' })

    // profiles.client_id integer kolon; gecersiz deger ("undefined" vb.) asla DB'ye gitmesin
    const parsedClientId = Number(rawClientId)
    const clientId = Number.isInteger(parsedClientId) && parsedClientId > 0 ? parsedClientId : null

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://gxuqrxmpgoeyykoolmwv.supabase.co'
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

    if (!serviceKey) {
      return res.status(500).json({ error: 'Supabase service key eksik. Vercel ayarlarinda SUPABASE_SERVICE_ROLE_KEY tanimlanmali.' })
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Ofis bilgisi: gonderilmemisse musteri kaydindan oku
    let ofisId = officeId ? Number(officeId) : null
    if (!ofisId && clientId) {
      const { data: c } = await supabaseAdmin
        .from('clients')
        .select('office_id')
        .eq('id', clientId)
        .maybeSingle()
      ofisId = c?.office_id || null
    }
    if (!ofisId) ofisId = 1

    // Ayni email ile kullanici var mi kontrol et
    const { data: listData } = await supabaseAdmin.auth.admin.listUsers()
    const existing = listData?.users?.find(u => u.email === email)

    let userId
    if (existing) {
      userId = existing.id
    } else {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role: 'musteri', temp_password: true, office_id: String(ofisId) }
      })
      if (error) throw error
      userId = data.user.id
    }

    // Profili guncelle
    await supabaseAdmin.from('profiles').upsert({
      id: userId,
      role: 'musteri',
      name: name || '',
      temp_password: true,
      client_id: clientId || null,
      office_id: ofisId
    }, { onConflict: 'id' })

    // clients tablosundaki auth_user_id'yi guncelle
    if (clientId) {
      await supabaseAdmin
        .from('clients')
        .update({ auth_user_id: userId })
        .eq('id', clientId)
    }

    return res.status(200).json({ success: true, userId })
  } catch (err) {
    console.error('Musteri auth kullanici olusturma hatasi:', err)
    return res.status(500).json({ error: err.message })
  }
}
